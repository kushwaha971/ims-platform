/**
 * Defect M3 — which tenant THIS TAB has moved itself to, for the stale-tab
 * guard in `AxiosInstances.ts`.
 *
 * The guard compares each response's `X-Tenant-Id` echo against
 * `session.activeTenant.id`, and a mismatch means another tab switched the
 * cookie underneath this one. But the store is not the only record of where
 * this tab is. Between a tab's OWN transition and the store catching up there
 * is a window in which the server is already answering for the new tenant and
 * the store still names the old one:
 *
 *   · `switchTenant` is `POST /auth/switch-tenant` followed by `GET /auth/me`,
 *     and the store adopts the new tenant only when that thunk FULFILS — i.e.
 *     after `/auth/me` has answered. `/auth/me` echoes the new `tid`, the store
 *     still held the old one, and the guard rejected the thunk's own second
 *     request as "switched in another tab" and reloaded `/switch`. That is M3.
 *     `POST /auth/switch-tenant` itself is exempt (`TENANT_TRANSITION_PATHS`);
 *     the request after it was not, and cannot be — `/auth/me` is also what a
 *     stale tab uses to find out.
 *   · "Add a business" is `POST /tenants`, which re-issues the session for the
 *     new business and never touches the store's `activeTenant` at all until
 *     step 4 re-reads `/auth/me`. Steps 2 and 3 are `PATCH /tenants/current`
 *     echoing a tenant the store has never heard of.
 *
 * So the transition's own answer is recorded: when an exempt transition
 * endpoint succeeds, the tenant it echoed is ADOPTED as this tab's identity
 * until the store catches up. The guard then compares against the adopted
 * tenant, which is exactly as strict as before for a genuine other-tab switch —
 * a third tenant still mismatches, and so does the OLD tenant, because this
 * tab has left it.
 *
 * The adoption lapses by itself: once `activeTenant` equals it the store is the
 * authority again, and once `activeTenant` is null the session has ended
 * (logout, a new sign-in) and nothing from it may carry over — a stale adoption
 * surviving a sign-in to another business would reject every response of the
 * new session.
 *
 * Module state, not Redux: the transport reads it synchronously inside an
 * interceptor, and the store cannot be imported here (see `transportBridge`).
 */

let adopted: string | null = null;

/** A transition endpoint answered for `tenantId`; this tab is now there. */
export const adoptTenant = (tenantId: string): void => {
  adopted = tenantId;
};

/**
 * The transition did not complete — e.g. the switch was accepted but the
 * session could not be re-read. Forgetting it puts the guard back on the
 * store's tenant, so the next response for the new tenant reloads the tab into
 * a consistent state instead of rendering it under the old one's shell.
 */
export const forgetAdoptedTenant = (): void => {
  adopted = null;
};

/**
 * The tenant this tab should be receiving responses for: the adopted one while
 * the store has not caught up, otherwise the store's. `null` disables the
 * guard, exactly as it did before (no session yet).
 */
export const effectiveTenantId = (activeTenantId: string | null): string | null => {
  if (activeTenantId === null || activeTenantId === adopted) {
    adopted = null;
    return activeTenantId;
  }
  return adopted ?? activeTenantId;
};

/** Test seam, reset alongside the transport's other module-level state. */
export const __resetTenantTransition = (): void => {
  adopted = null;
};
