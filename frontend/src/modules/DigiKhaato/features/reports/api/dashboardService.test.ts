import { api } from 'src/api/AxiosInstances';

import { getDashboard } from './dashboardService';

jest.mock('src/api/AxiosInstances', () => ({
  api: { get: jest.fn() },
  ubConfig: (options: unknown) => options,
}));

/**
 * WP-06 — what the service owns: which of the server's figures the Shop's home
 * is given. The transport is stubbed at the module boundary (§19.13.3).
 */
const body = (tiles: Record<string, unknown>) => ({
  data: {
    data: {
      as_of: '2026-10-16',
      generated_at: '2026-10-16T10:00:00+05:30',
      tiles,
      recent_activity: [],
      top_debtors: [],
      low_stock_items: [],
      first_use: { has_party: true, has_item: true, has_document: true, has_upi: false },
    },
  },
});

beforeEach(() => jest.mocked(api.get).mockReset());

it("shows the Shop's own cash, not every book's (DEC-019, WP-06 Finding 4)", async () => {
  // `cash_in_hand` keeps the every-book figure the golden file pins; the Shop's
  // drawer is `shop_cash_in_hand`. A "You got ₹300, cash" in the Udhaar book
  // and a lending collection are in the first and not in the second.
  jest
    .mocked(api.get)
    .mockResolvedValue(
      body({ cash_in_hand: { amount: '1940.00' }, shop_cash_in_hand: { amount: '390.00' } })
    );
  const data = await getDashboard();
  expect(data.tiles.cashInHand).toEqual({ amount: '390.00' });
});

it('falls back to the older figure from a server that does not send the Shop one', async () => {
  jest.mocked(api.get).mockResolvedValue(body({ cash_in_hand: { amount: '800.00' } }));
  const data = await getDashboard();
  expect(data.tiles.cashInHand).toEqual({ amount: '800.00' });
});

it('carries the oldest overdue bill date for the link', async () => {
  jest.mocked(api.get).mockResolvedValue(
    body({
      overdue: {
        count: 0,
        amount: '220.00',
        invoices: {
          count: 1,
          amount: '220.00',
          oldest_days_late: 2,
          oldest_bill_date: '2026-03-30',
        },
      },
    })
  );
  const data = await getDashboard();
  expect(data.tiles.overdue?.invoices).toEqual({
    count: 1,
    amount: '220.00',
    oldestDays: 2,
    firstBillDate: '2026-03-30',
  });
});

it('carries the period figures with their dates, each half only when sent', async () => {
  jest.mocked(api.get).mockResolvedValue(
    body({
      periods: {
        week: {
          from: '2026-10-12',
          to: '2026-10-16',
          sales: { amount: '5600.00', count: 3 },
        },
      },
    })
  );
  const data = await getDashboard();
  expect(data.tiles.periods).toEqual({
    week: { from: '2026-10-12', to: '2026-10-16', sales: { amount: '5600.00', count: 3 } },
  });
});

it('carries the day the drawer is counted from', async () => {
  jest
    .mocked(api.get)
    .mockResolvedValue(body({ shop_cash_in_hand: { amount: '-110.00', since: '2026-09-03' } }));
  const data = await getDashboard();
  expect(data.tiles.cashInHand).toEqual({ amount: '-110.00', since: '2026-09-03' });
});

it('carries the orders waiting on someone, each only when sent', async () => {
  jest.mocked(api.get).mockResolvedValue(
    body({
      open_orders: {
        challans: { count: 1, amount: '250.00', oldest_days: 4, oldest_date: '2026-10-12' },
        purchase_orders: { count: 0, amount: '0.00' },
      },
    })
  );
  const data = await getDashboard();
  expect(data.tiles.openOrders).toEqual({
    challans: { count: 1, amount: '250.00', oldestDays: 4, firstBillDate: '2026-10-12' },
    purchaseOrders: { count: 0, amount: '0.00' },
  });
});
