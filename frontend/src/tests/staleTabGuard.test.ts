import { API_PATHS } from 'src/api/APIPaths';
import { api, __resetTransportState } from 'src/api/AxiosInstances';
import { forgetAdoptedTenant } from 'src/api/tenantTransition';
import { registerTransportHost, transportHost } from 'src/api/transportBridge';
import type { TransportHost } from 'src/api/transportBridge';

/**
 * PLT-04 FR-4 / AC-4 — the stale-tab guard, tested where it lives: the response
 * interceptor.
 *
 * "Given a stale tab, when a response for another tenant arrives, then nothing
 * from it is rendered and the tab reloads." The first half is what this asserts
 * — the response is REJECTED, so no slice ever sees it. The second half is the
 * host's `onTenantMismatch`, which is asserted to have fired.
 *
 * The guard is one-sided on purpose: a response with no header at all, and a
 * response that lands before `/auth/me` has said which tenant this tab is in,
 * must both pass through untouched. A guard that failed closed would break
 * every request instead.
 *
 * It is also exempt on the two TRANSITIONS — `POST /auth/switch-tenant` and
 * `POST /tenants` — whose answers name the tenant the tab is moving TO. This
 * file used to carry a green test named "CCR-3 is not shipped yet", which
 * asserted only that a missing header is tolerated and said nothing about the
 * transitions; the guard therefore shipped rejecting every tenant switch, and
 * the suite certified it.
 */
const realHost = transportHost();

const host = (activeTenantId: string | null, onMismatch: jest.Mock): TransportHost => ({
  getLocale: () => 'en',
  onResponseObserved: () => undefined,
  onTransportFailure: () => undefined,
  isNetworkImpaired: () => false,
  onSessionExpired: () => undefined,
  onErrorToast: () => undefined,
  onPlanLimit: () => false,
  getActiveTenantId: () => activeTenantId,
  onTenantMismatch: onMismatch,
});

/** Drives the real interceptor with a synthetic response, as axios would. */
const runInterceptor = async (
  headers: Record<string, string>,
  config: Record<string, unknown> = {}
): Promise<{ readonly ok: boolean }> => {
  // The success handler is the first one registered on the response chain.
  const handlers = (
    api.interceptors.response as unknown as {
      handlers: readonly { fulfilled: (value: unknown) => unknown }[];
    }
  ).handlers;
  const fulfilled = handlers[0]?.fulfilled;
  if (!fulfilled) throw new Error('no response interceptor registered');

  try {
    await fulfilled({ data: { data: [] }, headers, config });
    return { ok: true };
  } catch {
    return { ok: false };
  }
};

afterEach(() => {
  __resetTransportState();
  if (realHost) registerTransportHost(realHost);
});

describe('the stale-tab guard', () => {
  it('discards a response echoing a DIFFERENT tenant, and says so', async () => {
    const onMismatch = jest.fn();
    registerTransportHost(host('tenant-a', onMismatch));

    const result = await runInterceptor({ 'x-tenant-id': 'tenant-b' });

    // Nothing from that response reaches a slice: it never resolves.
    expect(result.ok).toBe(false);
    expect(onMismatch).toHaveBeenCalledWith('tenant-b');
  });

  it('passes a response echoing the tenant this tab is in', async () => {
    const onMismatch = jest.fn();
    registerTransportHost(host('tenant-a', onMismatch));

    expect((await runInterceptor({ 'x-tenant-id': 'tenant-a' })).ok).toBe(true);
    expect(onMismatch).not.toHaveBeenCalled();
  });

  it('passes a response with no X-Tenant-Id at all', async () => {
    const onMismatch = jest.fn();
    registerTransportHost(host('tenant-a', onMismatch));

    // The guard is one-sided on purpose: a deployment where the header is not
    // readable (cross-origin with no `Access-Control-Expose-Headers`) must lose
    // the protection, not every request.
    expect((await runInterceptor({})).ok).toBe(true);
    expect(onMismatch).not.toHaveBeenCalled();
  });

  /**
   * PLT-04 FR-4 — the two transitions.
   *
   * `POST /auth/switch-tenant` and `POST /tenants` answer WITH the new tenant
   * while the store still holds the old one, so `echoed !== active` is
   * guaranteed on exactly the two responses that are supposed to move the tab.
   * Before the exemption, the guard rejected every tenant switch and every
   * "Add business" by a merchant who already had one, then reloaded the page
   * back into the tenant they were trying to leave.
   *
   * This did not show up in development because the header is not exposed
   * cross-origin; it is fatal in production, where the app and the API are one
   * origin behind nginx.
   */
  it('lets POST /auth/switch-tenant answer with the tenant it switched TO', async () => {
    const onMismatch = jest.fn();
    registerTransportHost(host('tenant-a', onMismatch));

    const result = await runInterceptor(
      { 'x-tenant-id': 'tenant-b' },
      { url: API_PATHS.AUTH_SWITCH_TENANT, method: 'post' }
    );

    expect(result.ok).toBe(true);
    expect(onMismatch).not.toHaveBeenCalled();
  });

  it('lets POST /tenants answer with the business it just created', async () => {
    const onMismatch = jest.fn();
    registerTransportHost(host('tenant-a', onMismatch));

    const result = await runInterceptor(
      { 'x-tenant-id': 'tenant-new' },
      { url: API_PATHS.TENANTS, method: 'post' }
    );

    expect(result.ok).toBe(true);
    expect(onMismatch).not.toHaveBeenCalled();
  });

  /**
   * The exemption is exact, not a prefix. `PATCH /tenants/current` is scoped to
   * the tenant this tab is already in — the onboarding wizard's steps 2, 3 and
   * 4 all go through it — so a mismatch there IS a stale tab and must still be
   * rejected. Matching `/tenants` by prefix would have quietly exempted it.
   */
  it('still guards PATCH /tenants/current, which is not a transition', async () => {
    const onMismatch = jest.fn();
    registerTransportHost(host('tenant-a', onMismatch));

    const result = await runInterceptor(
      { 'x-tenant-id': 'tenant-b' },
      { url: API_PATHS.TENANT_CURRENT, method: 'patch' }
    );

    expect(result.ok).toBe(false);
    expect(onMismatch).toHaveBeenCalledWith('tenant-b');
  });

  /**
   * The backend is being changed to echo `X-Tenant-Id` on EVERY tenant-scoped
   * response, which is when the guard starts doing its job. An ordinary read
   * that names another tenant must still be discarded.
   */
  it('discards an ordinary tenant-scoped read that names another tenant', async () => {
    const onMismatch = jest.fn();
    registerTransportHost(host('tenant-a', onMismatch));

    const result = await runInterceptor(
      { 'x-tenant-id': 'tenant-b' },
      { url: API_PATHS.PARTIES, method: 'get' }
    );

    expect(result.ok).toBe(false);
    expect(onMismatch).toHaveBeenCalledWith('tenant-b');
  });

  it('passes when this tab does not yet know which tenant it is in', async () => {
    const onMismatch = jest.fn();
    registerTransportHost(host(null, onMismatch));

    // `/auth/me` itself answers before the session exists; discarding it would
    // deadlock the bootstrap.
    expect((await runInterceptor({ 'x-tenant-id': 'tenant-b' })).ok).toBe(true);
    expect(onMismatch).not.toHaveBeenCalled();
  });
});

/**
 * Defect M3 — the tab's OWN switch must never be read as another tab's.
 *
 * `switchTenant` is `POST /auth/switch-tenant` then `GET /auth/me`, and the
 * store adopts the new tenant only when the thunk fulfils, i.e. after
 * `/auth/me` has answered. That `/auth/me` echoed the new tenant while the
 * store still held the old, and the guard answered "This business was switched
 * in another tab. Reloading…" and reloaded `/switch` instead of opening the
 * business. A genuine other-tab switch must keep reloading.
 */
describe("the stale-tab guard across this tab's own switch (M3)", () => {
  /** The host reads the active tenant through this, so a test can move it. */
  const movableHost = (onMismatch: jest.Mock) => {
    let active: string | null = 'tenant-a';
    registerTransportHost({ ...host(null, onMismatch), getActiveTenantId: () => active });
    return { setActive: (next: string | null) => (active = next) };
  };

  const switchTo = (tenant: string) =>
    runInterceptor(
      { 'x-tenant-id': tenant },
      { url: API_PATHS.AUTH_SWITCH_TENANT, method: 'post' }
    );

  it('accepts the /auth/me that follows its own switch, before the store has caught up', async () => {
    /** The M3 path itself: the store still says tenant-a when /auth/me answers
     *  for tenant-b. Rejecting it was the reload of /switch. */
    const onMismatch = jest.fn();
    movableHost(onMismatch);

    expect((await switchTo('tenant-b')).ok).toBe(true);
    const me = await runInterceptor(
      { 'x-tenant-id': 'tenant-b' },
      { url: API_PATHS.AUTH_ME, method: 'get', _tenantAtIssue: 'tenant-b' }
    );

    expect(me.ok).toBe(true);
    expect(onMismatch).not.toHaveBeenCalled();
  });

  it('accepts the wizard steps after its own "Add a business", whose tenant the store never saw', async () => {
    /** POST /tenants re-issues the session for the new business and the store
     *  keeps the old one until step 4 re-reads /auth/me. Steps 2 and 3 are
     *  PATCH /tenants/current echoing the new business — the same own-switch
     *  misreading as M3, one screen along. */
    const onMismatch = jest.fn();
    movableHost(onMismatch);

    await runInterceptor(
      { 'x-tenant-id': 'tenant-new' },
      { url: API_PATHS.TENANTS, method: 'post' }
    );
    const step2 = await runInterceptor(
      { 'x-tenant-id': 'tenant-new' },
      { url: API_PATHS.TENANT_CURRENT, method: 'patch' }
    );

    expect(step2.ok).toBe(true);
    expect(onMismatch).not.toHaveBeenCalled();
  });

  it("still reloads when ANOTHER tab switches after this tab's own switch", async () => {
    /** Adoption must not weaken the guard: a third tenant is still foreign,
     *  and so is the tenant this tab has just LEFT. */
    const onMismatch = jest.fn();
    movableHost(onMismatch);
    await switchTo('tenant-b');

    const third = await runInterceptor(
      { 'x-tenant-id': 'tenant-c' },
      { url: API_PATHS.PARTIES, method: 'get', _tenantAtIssue: 'tenant-b' }
    );
    expect(third.ok).toBe(false);
    expect(onMismatch).toHaveBeenCalledWith('tenant-c');

    onMismatch.mockClear();
    const backToOld = await runInterceptor(
      { 'x-tenant-id': 'tenant-a' },
      { url: API_PATHS.PARTIES, method: 'get', _tenantAtIssue: 'tenant-b' }
    );
    expect(backToOld.ok).toBe(false);
    expect(onMismatch).toHaveBeenCalledWith('tenant-a');
  });

  it('still reloads for a genuine other-tab switch when this tab switched nothing', async () => {
    const onMismatch = jest.fn();
    movableHost(onMismatch);

    const result = await runInterceptor(
      { 'x-tenant-id': 'tenant-b' },
      { url: API_PATHS.AUTH_ME, method: 'get', _tenantAtIssue: 'tenant-a' }
    );

    expect(result.ok).toBe(false);
    expect(onMismatch).toHaveBeenCalledWith('tenant-b');
  });

  it('discards, quietly, a reply to a request sent before its own switch', async () => {
    /** Sent under tenant-a, answered for tenant-a after this tab moved to
     *  tenant-b: the old business's rows, so never rendered — but nothing
     *  happened that the user did not do, so no warning and no reload. */
    const onMismatch = jest.fn();
    movableHost(onMismatch);
    await switchTo('tenant-b');

    const late = await runInterceptor(
      { 'x-tenant-id': 'tenant-a' },
      { url: API_PATHS.PARTIES, method: 'get', _tenantAtIssue: 'tenant-a' }
    );

    expect(late.ok).toBe(false);
    expect(onMismatch).not.toHaveBeenCalled();
  });

  it('hands back to the store once it catches up, and forgets the switch when the session ends', async () => {
    /** A stale adoption surviving into the next session would reject every
     *  response of a sign-in to another business. */
    const onMismatch = jest.fn();
    const tab = movableHost(onMismatch);
    await switchTo('tenant-b');

    tab.setActive('tenant-b');
    expect((await runInterceptor({ 'x-tenant-id': 'tenant-b' })).ok).toBe(true);

    await switchTo('tenant-c');
    tab.setActive(null); // logout / a new sign-in
    expect((await runInterceptor({ 'x-tenant-id': 'tenant-z' })).ok).toBe(true);
    tab.setActive('tenant-z');
    expect((await runInterceptor({ 'x-tenant-id': 'tenant-z' })).ok).toBe(true);
    expect(onMismatch).not.toHaveBeenCalled();
  });

  it('reloads for the new tenant again once a half-finished switch is forgotten', async () => {
    /** `authService.switchTenant` forgets the adoption when /auth/me fails,
     *  so the tab reloads into a consistent state instead of drawing the new
     *  business under the old one's shell. */
    const onMismatch = jest.fn();
    movableHost(onMismatch);
    await switchTo('tenant-b');
    forgetAdoptedTenant();

    const result = await runInterceptor({ 'x-tenant-id': 'tenant-b' });

    expect(result.ok).toBe(false);
    expect(onMismatch).toHaveBeenCalledWith('tenant-b');
  });
});
