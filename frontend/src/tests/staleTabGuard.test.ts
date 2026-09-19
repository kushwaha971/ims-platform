import { api, __resetTransportState } from 'src/api/AxiosInstances';
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
 * The guard is one-sided on purpose, and the last two cases are why: a backend
 * that has not yet shipped CCR-3's header, and a response that lands before
 * `/auth/me` has said which tenant this tab is in, must both pass through
 * untouched. A guard that failed closed would break every request instead.
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
  headers: Record<string, string>
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
    await fulfilled({ data: { data: [] }, headers, config: {} });
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

  it('passes a response with no X-Tenant-Id — CCR-3 is not shipped yet', async () => {
    const onMismatch = jest.fn();
    registerTransportHost(host('tenant-a', onMismatch));

    expect((await runInterceptor({})).ok).toBe(true);
    expect(onMismatch).not.toHaveBeenCalled();
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
