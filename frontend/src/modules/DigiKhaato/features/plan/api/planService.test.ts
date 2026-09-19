import { api } from 'src/api/AxiosInstances';

import { getPlanEntitlements } from './planService';

/** PLT-15 FR-5 — the `plan_limits` block of `GET /auth/me`. */
describe('planService.getPlanEntitlements', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reads the documented block off /auth/me', async () => {
    const get = jest.spyOn(api, 'get').mockResolvedValue({
      data: {
        data: {
          plan_limits: {
            plan_code: 'free',
            limits: {
              max_users: { limit: 3, used: 1 },
              storage_mb: { limit: 200, used: 12 },
            },
            modules: ['ledger', 'parties'],
            support_contact: { whatsapp: '+919000000000', name: 'Metis' },
          },
        },
      },
    });

    const entitlements = await getPlanEntitlements();

    expect(get.mock.calls[0]?.[0]).toBe('/auth/me');
    expect(entitlements.planCode).toBe('free');
    expect(entitlements.modules).toEqual(['ledger', 'parties']);
    expect(entitlements.supportContact.whatsapp).toBe('+919000000000');
    expect(entitlements.limits).toEqual([
      { key: 'max_users', limit: 3, used: 1, periodStart: null, periodEnd: null },
      { key: 'storage_mb', limit: 200, used: 12, periodStart: null, periodEnd: null },
    ]);
  });

  it("keeps the monthly counter's period when the server sends one", async () => {
    jest.spyOn(api, 'get').mockResolvedValue({
      data: {
        data: {
          plan_limits: {
            limits: {
              max_invoices_per_month: {
                limit: null,
                used: 40,
                period_start: '2026-09-01',
                period_end: '2026-09-30',
              },
            },
          },
        },
      },
    });

    const entitlements = await getPlanEntitlements();

    expect(entitlements.limits[0]).toEqual({
      key: 'max_invoices_per_month',
      // DEC-001 — unlimited on every MVP plan; the client shows "Unlimited".
      limit: null,
      used: 40,
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
    });
  });

  it('treats an absent plan_limits block as "no limits", not as an error', async () => {
    jest.spyOn(api, 'get').mockResolvedValue({ data: { data: {} } });

    const entitlements = await getPlanEntitlements();

    expect(entitlements.limits).toEqual([]);
    expect(entitlements.planCode).toBeNull();
    expect(entitlements.supportContact).toEqual({
      phone: null,
      whatsapp: null,
      email: null,
      name: null,
    });
  });

  it('ignores a limit key that is not in the registry', async () => {
    jest.spyOn(api, 'get').mockResolvedValue({
      data: { data: { plan_limits: { limits: { max_elephants: { limit: 1, used: 0 } } } } },
    });

    expect((await getPlanEntitlements()).limits).toEqual([]);
  });
});
