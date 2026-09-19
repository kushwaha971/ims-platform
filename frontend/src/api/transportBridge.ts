import type { ApiErrorShape } from 'src/types/api.types';

/**
 * The seam between the transport layer and the store.
 *
 * Part 19 §19.4's listing has `AxiosInstances.ts` import `src/redux/store`
 * directly. That import closes a cycle — store → slice → thunk → service →
 * axios → store — and R-IM-6 (`import/no-cycle`) forbids it. The dependency is
 * therefore inverted rather than weakened: the transport declares what it needs
 * from the application, and `src/redux/store.ts` registers an implementation at
 * boot. Behaviour is identical; the graph is acyclic; nothing above the
 * transport layer changes.
 *
 * This module imports nothing but types, which is what makes it a safe leaf.
 */
export interface TransportHost {
  /** Drives `Accept-Language`, so server messages match the UI (§19.4.2). */
  readonly getLocale: () => string;
  /** §19.10.3 signal 1 — the server answered, whatever it answered. */
  readonly onResponseObserved: () => void;
  /** §19.10.3 signal 2 — a transport-level failure. */
  readonly onTransportFailure: () => void;
  /** True in `degraded` and `offline`; transport toasts are suppressed there. */
  readonly isNetworkImpaired: () => boolean;
  /** §19.4.3 — the refresh itself failed; the session is genuinely over. */
  readonly onSessionExpired: () => void;
  /** §19.12.2 — the single toast channel, so no failure is ever silent. */
  readonly onErrorToast: (error: ApiErrorShape) => void;
  /**
   * PLT-15 FR-6 — a 403 `plan_limit_reached` from ANY module opens ONE dialog,
   * which names the limit, the count and who to contact. It is routed through
   * the bridge rather than handled per feature for the same reason the toast is:
   * a limit can be hit by any write, and fourteen features cannot each own the
   * upgrade surface. Returning true means the dialog took it, so the transport
   * does not also toast.
   */
  readonly onPlanLimit: (error: ApiErrorShape) => boolean;
  /**
   * PLT-04 FR-4 — the active tenant, for the stale-tab check below. `null`
   * before `/auth/me` lands, which disables the check rather than failing it.
   */
  readonly getActiveTenantId: () => string | null;
  /**
   * PLT-04 FR-4 / AC-4 — a response arrived for a DIFFERENT tenant than this
   * tab believes it is in, which means the business was switched in another
   * tab. Nothing from that response may be rendered; the tab says so and
   * reloads.
   */
  readonly onTenantMismatch: (responseTenantId: string) => void;
}

let host: TransportHost | null = null;

export const registerTransportHost = (next: TransportHost): void => {
  host = next;
};

/**
 * Null before the store is created — which happens only for a request issued
 * from a module's top level, and there are none. Callers no-op rather than
 * throw, because a missing toast must never break a request.
 */
export const transportHost = (): TransportHost | null => host;
