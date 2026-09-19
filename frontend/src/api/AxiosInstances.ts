/**
 * Part 19 §19.4 — the transport layer. One instance, not eleven: DigiKhaato
 * talks to one modular monolith (ADR-007) at one base URL. `publicApi` exists
 * solely for the unauthenticated public document routes and carries no auth
 * interceptor and no refresh logic.
 *
 * Nothing above this file knows that axios exists, and nothing in this file
 * knows what a party is.
 */
import axios, {
  type AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

import { API_BASE_URL, API_TIMEOUT_MS } from 'src/constants';
import { loginPathWithNext } from 'src/routes';
import type { TNetworkTag } from 'src/types/api.types';
import { shouldToast, toApiError } from 'src/utils/apiError';
import { readCsrfToken } from 'src/utils/cookieUtils';
import { newRequestId } from 'src/utils/requestId';

import { API_PATHS, requiresIdempotency } from './APIPaths';
import { transportHost } from './transportBridge';

/** Requests that must never trigger a refresh, or that carry no auth. */
const AUTH_FREE_PATHS: readonly string[] = [
  API_PATHS.AUTH_LOGIN,
  // CR-2026-09-19-A — the three anonymous doors into the product. A 401 from
  // any of them is the answer, not a stale token: refreshing on it would turn
  // "that password is wrong" into a redirect to the screen the user is on.
  API_PATHS.AUTH_REGISTER,
  API_PATHS.AUTH_PASSWORD_RESET_REQUEST,
  API_PATHS.AUTH_PASSWORD_RESET_CONFIRM,
  API_PATHS.AUTH_REFRESH,
  API_PATHS.SYSTEM_HEALTH,
];

/** The per-request extras the interceptors and the services agree on. */
export interface UbRequestConfig extends InternalAxiosRequestConfig {
  meta?: { requestId: string; startedAt: number };
  /** `/auth/refresh` itself sets this so a 401 cannot recurse. */
  _skipAuthRetry?: boolean;
  /** A request that already replayed once after a refresh never replays twice. */
  _retried?: boolean;
  /** Set by a call that renders the failure itself (§19.4.3). */
  suppressErrorSnackbar?: boolean;
  /** §19.10.3 — only `interactive` and `probe` feed the network machine. */
  net?: TNetworkTag;
}

/**
 * The one place the per-request extras above are cast onto axios's own config
 * type. A service writes `ubConfig({ suppressErrorSnackbar: true })` and never
 * an inline `as`, so the cast is auditable in a single grep rather than spread
 * across forty call sites.
 */
export const ubConfig = (
  extras: Partial<Omit<UbRequestConfig, 'headers'>> & {
    readonly headers?: Readonly<Record<string, string>>;
  }
): AxiosRequestConfig => extras as AxiosRequestConfig;

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  // The browser session is cookie-based (Part 22 §22.1): ub_access and
  // ub_refresh are httpOnly, so JS never reads them — it only sends them.
  withCredentials: true,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

export const publicApi: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  withCredentials: false,
  headers: { Accept: 'application/json' },
});

// ── Request interceptors (§19.4.2) ───────────────────────────────────────────

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const request = config as UbRequestConfig;

  // 1. Request id — echoed by the server in every response and every error,
  //    surfaced to the user on error screens (Part 22 §22.1 "Tracing").
  const requestId = newRequestId();
  request.headers.set('X-Request-Id', requestId);
  request.meta = { requestId, startedAt: Date.now() };

  // 2. CSRF double-submit for the cookie session (Part 22 §22.1 "Auth
  //    transport"). The access token itself is httpOnly and is attached by the
  //    browser; no tenant header is ever sent — `X-Tenant-Id` is not trusted
  //    and the active tenant is the `tid` claim inside the token (R-SEC-3).
  if (request.method && request.method.toLowerCase() !== 'get') {
    const csrf = readCsrfToken();
    if (csrf) request.headers.set('X-CSRF-Token', csrf);
  }

  // 3. Locale — drives server-side message localisation.
  request.headers.set('Accept-Language', transportHost()?.getLocale() ?? 'en');

  // 4. Idempotency key — required on every POST that creates a document,
  //    payment or ledger entry (canon §0.11 rule 5). The CALLER supplies it so
  //    that a retry reuses the same key; this is a bug-catching backstop, not a
  //    substitute for the caller minting one.
  if (
    request.method?.toLowerCase() === 'post' &&
    requiresIdempotency(request.url) &&
    !request.headers.has('Idempotency-Key')
  ) {
    request.headers.set('Idempotency-Key', newRequestId());
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[api] POST ${request.url} needs an Idempotency-Key from its caller; ` +
          'one was generated, which means a retry will double-post.'
      );
    }
  }

  return request;
});

// ── The refresh-on-401 single-flight queue (§19.4.3) ─────────────────────────

let refreshPromise: Promise<void> | null = null;
const pendingQueue: Array<{
  resolve: () => void;
  reject: (reason: unknown) => void;
}> = [];

const flushQueue = (error: unknown | null): void => {
  while (pendingQueue.length) {
    const entry = pendingQueue.shift();
    if (!entry) break;
    if (error) entry.reject(error);
    else entry.resolve();
  }
};

/** One refresh, however many requests 401'd while it was in flight. */
const runRefresh = (): Promise<void> => {
  if (refreshPromise) return refreshPromise;
  refreshPromise = api
    .post(API_PATHS.AUTH_REFRESH, null, { _skipAuthRetry: true } as Partial<UbRequestConfig>)
    .then(() => {
      flushQueue(null);
    })
    .catch((error: unknown) => {
      flushQueue(error);
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
};

let redirected = false;

/** The session is genuinely over; send the user to login exactly once. */
const redirectToLoginOnce = (): void => {
  if (redirected || typeof window === 'undefined') return;
  redirected = true;
  const next = `${window.location.pathname}${window.location.search}`;
  // `loginPathWithNext` owns both the address and the encoding (§19.6.4 rule 2);
  // this used to be the fourteenth hand-written `/login?next=` in the tree.
  window.location.assign(new URL(loginPathWithNext(next), window.location.origin).toString());
};

/** Test seam: the module-level guards are per-process, and tests need both. */
export const __resetTransportState = (): void => {
  refreshPromise = null;
  pendingQueue.length = 0;
  redirected = false;
};

// ── Response interceptors ────────────────────────────────────────────────────

api.interceptors.response.use(
  (response) => {
    // §19.10.3 signal 1: the server answered, so the network works.
    const config = response.config as UbRequestConfig;
    if ((config.net ?? 'interactive') !== 'background') {
      transportHost()?.onResponseObserved();
    }

    /**
     * PLT-04 FR-4 / AC-4 — the stale-tab guard.
     *
     * Every tenant-scoped response echoes the token's `tid` as `X-Tenant-Id`
     * (CCR-3). Two tabs, a switch in one: the other tab's next response is
     * another business's data, and rendering one row of it is a cross-tenant
     * leak the user would read as their own books.
     *
     * The check is deliberately one-sided. It fires ONLY when the header is
     * present AND this tab knows which tenant it is in AND the two differ — so
     * a backend that has not yet shipped CCR-3's header changes nothing, and a
     * response that arrives before `/auth/me` is never discarded.
     */
    const echoed = response.headers?.['x-tenant-id'];
    if (typeof echoed === 'string' && echoed.length > 0) {
      const host = transportHost();
      const active = host?.getActiveTenantId() ?? null;
      if (active !== null && active !== echoed) {
        host?.onTenantMismatch(echoed);
        return Promise.reject(
          toApiError(
            new Error('This business was switched in another tab.'),
            'tenant.switcher.staleTab'
          )
        );
      }
    }

    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as UbRequestConfig | undefined;

    // Aborted requests are superseded keystrokes, never errors.
    if (axios.isCancel(error) || error.code === 'ERR_CANCELED') {
      return Promise.reject(error);
    }

    const status = error.response?.status;
    const isRefreshable =
      status === 401 &&
      !!config &&
      !config._skipAuthRetry &&
      !config._retried &&
      !AUTH_FREE_PATHS.some((path) => config.url?.startsWith(path));

    if (isRefreshable && config) {
      config._retried = true;
      try {
        // Join the single in-flight refresh, or start it.
        const waiter = new Promise<void>((resolve, reject) => {
          pendingQueue.push({ resolve, reject });
        });
        // The rejection is delivered through `waiter` below; swallowing it HERE
        // stops the shared refresh promise becoming an unhandled rejection when
        // the refresh itself 401s (which is the ordinary session-expiry path).
        void runRefresh().catch(() => undefined);
        await waiter;
        return await api.request(config);
      } catch {
        // EXCEPTION 3 (CR-2026-09-19-E) — refresh failed, so the session is
        // genuinely over. `onSessionExpired` + a redirect to login IS the
        // report; a toast on the way out would be a second one, and the screen
        // it belonged to is about to be replaced anyway. Returning here is what
        // keeps the 401 path out of the toast decision below.
        transportHost()?.onSessionExpired();
        redirectToLoginOnce();
        return Promise.reject(toApiError(error));
      }
    }

    /**
     * The same exception, from the two other directions it can arrive:
     *  - `_skipAuthRetry` is set by `/auth/refresh` itself, so a 401 HERE is
     *    the refresh failing — the rejection the block above is waiting on. It
     *    must not also toast on its own way out.
     *  - `_retried` means the request already replayed once after a successful
     *    refresh and 401'd again, which means the same thing.
     * Without these, the session expiry is reported twice: once as a redirect
     * to login, and once as a toast that lands behind the login screen.
     */
    if (status === 401 && (config?._skipAuthRetry === true || config?._retried === true)) {
      return Promise.reject(toApiError(error));
    }

    const apiError = toApiError(error);

    // PLT-15 FR-6 — the plan-limit dialog is the presentation for this code,
    // everywhere in the application. It is claimed BEFORE the toast decision so
    // that the merchant gets "you have used 3 of 3 team members, contact X" and
    // not a transient strip saying "Your plan's limit has been reached."
    const claimedByPlanDialog =
      apiError.code === 'plan_limit_reached'
        ? (transportHost()?.onPlanLimit(apiError) ?? false)
        : false;

    /**
     * Read BEFORE the network machine is told about this failure, because this
     * failure may be the one that flips it.
     *
     * §19.10.3 suppresses transport toasts while the shell is visibly impaired:
     * the network strip is already saying the network is the problem, and a
     * toast per failed request on a bad connection is noise. But the FIRST
     * transport failure is exactly the one that causes the transition, and
     * reading `isNetworkImpaired()` after the dispatch made it suppress itself
     * — so a network failure reported nothing at all. On the `(app)` routes the
     * strip covered that up; on login, sign-up and reset, which have no strip,
     * it meant a merchant on a dead connection pressed Log in and saw nothing
     * happen. That is what the per-screen error banners were compensating for.
     *
     * The rule now: the failure that takes the shell out of `online` reports
     * once; the ones after it, while the strip is up, do not.
     */
    const impaired = transportHost()?.isNetworkImpaired() ?? false;

    // §19.10.3 — a 4xx is evidence of HEALTH: the server answered. Only a
    // transport-level failure moves the machine towards `degraded`.
    if ((config?.net ?? 'interactive') !== 'background') {
      const transport =
        apiError.code === 'network_error' ||
        apiError.code === 'timeout' ||
        apiError.code === 'offline';
      const host = transportHost();
      if (transport) host?.onTransportFailure();
      else host?.onResponseObserved();
    }

    /**
     * ── THE GLOBAL ERROR CHANNEL (§19.12.2 / CR-2026-09-19-E) ───────────────
     *
     * Every API failure surfaces from HERE, once, by handing the normalised
     * error to the store's `onErrorToast`. No thunk and no component contains
     * error-toast code, which is the whole point: an error can be raised by any
     * of a hundred calls and a hundred screens cannot each own the report.
     *
     * This mirrors BrandHub exactly — their `api.interceptors.response`
     * rejection handler ends in `return handleAxiosError(error)`, which walks
     * the status and calls the single `errorHandler` registered in
     * `app/layout.tsx`, which dispatches `showSnackbar({severity:'error'})`.
     *
     * The four documented exceptions, in the order they are checked:
     *   1. `suppressErrorSnackbar` on the request — BrandHub has the same flag,
     *      with the same comment ("for calls that present the API's message in
     *      their own UI"). Set it with `ubConfig({ suppressErrorSnackbar: true })`.
     *   2. `claimedByPlanDialog` — PLT-15's dialog took it (above).
     *   3. the 401 session-expiry path — handled and returned above.
     *   4. `shouldToast(apiError)` — the codes that always have a better local
     *      surface: field validation, a wrong password, a lockout countdown, a
     *      spent reset link, and the business errors whose own UI carries the
     *      number. The list and the reasoning are in src/utils/apiError.ts.
     *
     * Plus one state, not an error class: while the shell is ALREADY impaired
     * the network strip is the channel, so transport toasts are suppressed
     * there — see `impaired` above, which is sampled before this failure is
     * allowed to change that state. Business errors still toast (§19.10.3).
     */
    const transportError =
      apiError.code === 'network_error' ||
      apiError.code === 'timeout' ||
      apiError.code === 'offline';
    if (
      !config?.suppressErrorSnackbar &&
      !claimedByPlanDialog &&
      shouldToast(apiError) &&
      !(impaired && transportError)
    ) {
      transportHost()?.onErrorToast(apiError);
    }

    return Promise.reject(apiError);
  }
);

publicApi.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => Promise.reject(toApiError(error))
);
