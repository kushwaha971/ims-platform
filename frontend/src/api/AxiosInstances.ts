/**
 * Part 19 §19.4 — the transport layer. One instance, not eleven: UdhaarBook
 * talks to one modular monolith (ADR-007) at one base URL. `publicApi` exists
 * solely for the unauthenticated public document routes and carries no auth
 * interceptor and no refresh logic.
 *
 * Nothing above this file knows that axios exists, and nothing in this file
 * knows what a party is.
 */
import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

import { API_BASE_URL, API_TIMEOUT_MS } from 'src/constants';
import type { TNetworkTag } from 'src/types/api.types';
import { shouldToast, toApiError } from 'src/utils/apiError';
import { readCsrfToken } from 'src/utils/cookieUtils';
import { newRequestId } from 'src/utils/requestId';

import { API_PATHS, requiresIdempotency } from './APIPaths';
import { transportHost } from './transportBridge';

/** Requests that must never trigger a refresh, or that carry no auth. */
const AUTH_FREE_PATHS: readonly string[] = [
  API_PATHS.AUTH_LOGIN,
  API_PATHS.AUTH_OTP_REQUEST,
  API_PATHS.AUTH_OTP_VERIFY,
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
  const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
  window.location.assign(new URL(`/login?next=${next}`, window.location.origin).toString());
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
        void runRefresh();
        await waiter;
        return await api.request(config);
      } catch {
        // Refresh failed — the session is genuinely over.
        transportHost()?.onSessionExpired();
        redirectToLoginOnce();
        return Promise.reject(toApiError(error));
      }
    }

    const apiError = toApiError(error);

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

    // Global failure surfacing (§19.12.2). A call opts out when it renders the
    // message itself — e.g. a 409 credit_limit_exceeded shown in a drawer.
    const impaired = transportHost()?.isNetworkImpaired() ?? false;
    const transportError =
      apiError.code === 'network_error' ||
      apiError.code === 'timeout' ||
      apiError.code === 'offline';
    // In degraded/offline the strip is the channel; transport toasts are
    // suppressed there, business errors still toast (§19.10.3).
    if (!config?.suppressErrorSnackbar && shouldToast(apiError) && !(impaired && transportError)) {
      transportHost()?.onErrorToast(apiError);
    }

    return Promise.reject(apiError);
  }
);

publicApi.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => Promise.reject(toApiError(error))
);
