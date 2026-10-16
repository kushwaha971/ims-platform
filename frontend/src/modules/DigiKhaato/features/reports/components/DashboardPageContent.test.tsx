import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetAllFeatureState } from 'src/redux/actions';
import { cacheInvalidated } from 'src/redux/invalidation/listener';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { ModuleCode, PermissionCode } from 'src/types/domain.types';

import {
  registerDashboardSection,
  resetDashboardSectionsForTests,
  type DashboardSectionProps,
} from '../dashboardSections';

import { DashboardPageContent } from './DashboardPageContent';

import type { DashboardData } from '../types/reports.types';

/**
 * RPT-01 on screen, the service stubbed at the module boundary.
 *
 * What these protect: a tile the server OMITTED is not drawn (FR-6 — never
 * ₹0, never greyed); every tile opens the list it counts; a member who may
 * not read reports is sent on to Customers rather than shown an error on the
 * screen they land on; the first-use checklist replaces tiles only in an
 * empty book; and the refresh icon asks the server to recompute.
 */
jest.mock('../api/dashboardService');
// The graphs have their own read and their own suite (DashboardCharts.test);
// here they would be a second, unmocked request on every render.
jest.mock('./DashboardCharts', () => ({ DashboardCharts: () => null }));

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/dashboard',
}));

const service = jest.requireMock('../api/dashboardService') as { getDashboard: jest.Mock };

const DATA = (over: Partial<DashboardData> = {}): DashboardData => ({
  asOf: '2026-09-18',
  generatedAt: new Date().toISOString(),
  cached: false,
  tiles: {
    toCollect: { amount: '7000.00' },
    toPay: { amount: '1500.00' },
    dueToday: { count: 1, amount: '1772.00' },
    overdue: {
      count: 0,
      amount: '900.00',
      invoices: { count: 2, amount: '900.00', oldestDays: 25, firstBillDate: '2025-12-02' },
    },
    upcoming7d: { count: 0, amount: '0.00' },
    todaySales: { amount: '2204.19', count: 2, yesterdayAmount: '0.00' },
    cashInHand: { amount: '800.00' },
    todayReceived: { count: 2, amount: '700.00' },
    supplierBills: {
      overdue: { count: 1, amount: '1000.00', oldestDays: 12 },
      dueWeek: { count: 1, amount: '2150.00' },
    },
    lowStock: { count: 3, outCount: 1 },
  },
  recentActivity: [
    {
      id: 'sale:d1',
      type: 'sale',
      at: '2026-09-18T05:00:00Z',
      number: 'INV/26-27/0042',
      amount: '1772.00',
      direction: null,
      party: { id: 'p1', name: 'Ramesh' },
      source: { kind: 'sales_document', id: 'd1', partyId: 'p1' },
    },
  ],
  topDebtors: [
    {
      id: 'p1',
      name: 'Ramesh',
      balance: '5000.00',
      collectionDate: '2026-09-18',
      mobileMasked: '+91 98••• ••678',
      mobile: '+919812345678',
    },
  ],
  topCreditors: [{ id: 's1', name: 'Gupta Wholesale', balance: '3150.00' }],
  lowStockItems: [
    {
      id: 'i1',
      name: 'Toor Dal',
      onHand: '0.000',
      reorderPoint: '4.000',
      unit: 'KGS',
      stockStatus: 'out',
    },
  ],
  firstUse: { hasParty: true, hasItem: true, hasDocument: true, hasUpi: false },
  sections: [],
  ...over,
});

const OWNER: readonly PermissionCode[] = [
  'reports.basic.read',
  'reports.financial.read',
  'parties.party.read',
  'sales.invoice.read',
  'sales.invoice.write',
  'payments.payment.read',
  'payments.payment.write',
  'purchases.bill.read',
  'purchases.bill.write',
  'expenses.expense.write',
  'inventory.stock.read',
  'ledger.entry.read',
  'ledger.reminder.write',
];

const signIn = (
  permissions: readonly PermissionCode[],
  modules: readonly ModuleCode[] = [
    'reports',
    'sales',
    'ledger',
    'inventory',
    'parties',
    'payments',
    'purchases',
    'expenses',
  ]
): void => {
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Owner',
        email: 'owner@shop.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata' }],
      permissions: [...permissions],
      enabledModules: [...modules],
      version: 1,
    })
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  store.dispatch(resetAllFeatureState());
  resetDashboardSectionsForTests();
});

/**
 * WP-06 — the owner's layout A (16 Oct 2026): "two books side by side". The
 * header says whose Shop and which day; a Today row of net sales, money
 * received and cash in hand; a Customers panel and a Suppliers panel, each
 * leading with its own figure and opening the list that reproduces it; and
 * Needs attention always on the page, not behind a Details toggle.
 */
it('says whose Shop and which day in the header, with New bill and the rest under More', async () => {
  service.getDashboard.mockResolvedValue(DATA());
  signIn(OWNER);
  renderWithProviders(<DashboardPageContent />);
  const heading = await screen.findByRole('heading', { name: 'Kumar Stores' });
  // "Shree Ganesh Kirana Stores" was cut to "Shree Ganesh Ki…" on a 360 px
  // phone: the title is a business name now, and a name is not cut.
  expect(heading).not.toHaveClass('truncate');
  expect(screen.getByText(/^Shop · Today, 18\/09\/2026/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'New bill' })).toHaveAttribute(
    'href',
    '/sales/invoices/new'
  );
  await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
  const sheet = screen.getByRole('dialog', { name: 'More actions' });
  expect(within(sheet).getByRole('link', { name: 'Record payment' })).toHaveAttribute(
    'href',
    '/payments?add=1'
  );
  expect(within(sheet).getByRole('link', { name: 'Add expense' })).toHaveAttribute(
    'href',
    '/expenses?add=1'
  );
  expect(within(sheet).getByRole('link', { name: 'New purchase' })).toHaveAttribute(
    'href',
    '/purchases/bills/new'
  );
});

it("shows today's net sales, money received and cash in hand, each opening its records", async () => {
  service.getDashboard.mockResolvedValue(DATA());
  signIn(OWNER);
  renderWithProviders(<DashboardPageContent />);
  const today = await screen.findByRole('region', { name: 'Today' });
  expect(within(today).getByText('Net sales today')).toBeInTheDocument();
  expect(within(today).getByText('Money received today')).toBeInTheDocument();
  expect(within(today).getByText('2 receipts')).toBeInTheDocument();
  await userEvent.click(within(today).getByRole('button', { name: /Money received today/ }));
  expect(mockPush).toHaveBeenCalledWith('/payments?period=today&tab=in');
});

it('gives customers and suppliers a panel each, every figure opening its own list', async () => {
  service.getDashboard.mockResolvedValue(DATA());
  signIn(OWNER);
  renderWithProviders(<DashboardPageContent />);
  const customers = await screen.findByRole('region', { name: 'Customers' });
  expect(within(customers).getByRole('link', { name: /To collect.*₹7,000\.00/ })).toHaveAttribute(
    'href',
    '/customers?balance=owes_me'
  );
  // The bill list defaults to this financial year; an overdue bill from last
  // year must not drop out of the list the figure opens, so the link carries
  // the range from the oldest overdue bill's date to today.
  expect(
    within(customers).getByRole('link', { name: /2 bills overdue · ₹900\.00/ })
  ).toHaveAttribute('href', '/sales/invoices?tab=overdue&from=2025-12-02&to=2026-09-18');
  expect(within(customers).getByText(/Oldest is 25 days late/)).toBeInTheDocument();
  expect(within(customers).getByRole('link', { name: 'Ramesh' })).toBeInTheDocument();

  const suppliers = screen.getByRole('region', { name: 'Suppliers' });
  expect(within(suppliers).getByRole('link', { name: /To pay.*₹1,500\.00/ })).toHaveAttribute(
    'href',
    '/suppliers?balance=i_owe'
  );
  expect(
    within(suppliers).getByRole('link', { name: /1 bill overdue · ₹1,000\.00/ })
  ).toHaveAttribute('href', '/purchases/bills?tab=overdue');
  expect(
    within(suppliers).getByRole('link', { name: /1 bill due this week · ₹2,150\.00/ })
  ).toHaveAttribute('href', '/purchases/bills?tab=unpaid');
  expect(within(suppliers).getByRole('link', { name: 'Gupta Wholesale' })).toHaveAttribute(
    'href',
    '/parties/s1'
  );
  expect(within(suppliers).getByRole('link', { name: 'All suppliers' })).toHaveAttribute(
    'href',
    '/suppliers?balance=i_owe'
  );
});

it('keeps Needs attention on the page, each row with its amount, age and next step', async () => {
  service.getDashboard.mockResolvedValue(DATA());
  signIn(OWNER);
  renderWithProviders(<DashboardPageContent />);
  const attention = await screen.findByRole('region', { name: 'Needs attention' });
  expect(screen.queryByRole('button', { name: 'Details' })).not.toBeInTheDocument();
  const rows = within(attention).getAllByRole('link');
  expect(rows.map((row) => row.textContent)).toEqual([
    expect.stringMatching(/Collect ₹900\.00 from 2 overdue bills.*Oldest is 25 days late/),
    expect.stringMatching(/Pay ₹1,000\.00 on 1 overdue supplier bill.*Oldest is 12 days late/),
    expect.stringMatching(/1 item out of stock.*Reorder/),
    expect.stringMatching(/2 items running low.*Reorder/),
  ]);
  expect(rows[0]).toHaveAttribute(
    'href',
    '/sales/invoices?tab=overdue&from=2025-12-02&to=2026-09-18'
  );
  expect(rows[2]).toHaveAttribute('href', '/stock/low');
});

it('says when nothing needs the merchant, rather than hiding the section', async () => {
  const quiet = {
    ...DATA().tiles,
    overdue: { count: 0, amount: '0.00', invoices: { count: 0, amount: '0.00' } },
    supplierBills: {
      overdue: { count: 0, amount: '0.00' },
      dueWeek: { count: 0, amount: '0.00' },
    },
    lowStock: { count: 0, outCount: 0 },
  };
  service.getDashboard.mockResolvedValue(DATA({ tiles: quiet, lowStockItems: [] }));
  signIn(OWNER);
  renderWithProviders(<DashboardPageContent />);
  const attention = await screen.findByRole('region', { name: 'Needs attention' });
  expect(within(attention).getByText('Nothing needs you right now.')).toBeInTheDocument();
});

it('names money held the other way round under its own tile (WP-06 DASH-02)', async () => {
  // "To pay, to all your suppliers" used to be a customer's advance over an
  // empty supplier list. The tiles are their lists' totals now, and an advance
  // is said beside the tile it belongs to, never folded into the other one.
  service.getDashboard.mockResolvedValue(
    DATA({
      tiles: {
        ...DATA().tiles,
        toCollect: { amount: '1800.00', advances: '700.00' },
        toPay: { amount: '450.00', advances: '0.00' },
      },
    })
  );
  signIn(OWNER);
  renderWithProviders(<DashboardPageContent />);
  expect(await screen.findAllByText(/Customers paid ₹700\.00 ahead/)).not.toHaveLength(0);
  expect(screen.queryByText(/paid suppliers/)).not.toBeInTheDocument();
});

it('leaves out a tile the reader may not see, rather than showing it as ₹0 (FR-6)', async () => {
  const { cashInHand: _cash, lowStock: _stock, ...tiles } = DATA().tiles;
  service.getDashboard.mockResolvedValue(DATA({ tiles }));
  signIn(OWNER.filter((code) => code !== 'reports.financial.read'));
  renderWithProviders(<DashboardPageContent />);
  await screen.findAllByText('To collect');
  expect(screen.queryByText('Cash in hand')).not.toBeInTheDocument();
  expect(screen.queryByText('Low stock')).not.toBeInTheDocument();
  expect(screen.queryByText('Running low')).not.toBeInTheDocument();
});

it('sends a member who may not read reports on to Customers', () => {
  signIn(['parties.party.read']);
  renderWithProviders(<DashboardPageContent />);
  expect(mockReplace).toHaveBeenCalledWith('/customers');
  expect(service.getDashboard).not.toHaveBeenCalled();
});

it('shows the first-use checklist instead of ₹0 tiles in an empty book (FR-9)', async () => {
  service.getDashboard.mockResolvedValue(
    DATA({ firstUse: { hasParty: false, hasItem: false, hasDocument: false, hasUpi: false } })
  );
  signIn([...OWNER, 'parties.party.write']);
  renderWithProviders(<DashboardPageContent />);
  expect(await screen.findByTestId('dashboard-first-use')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Start: Add your first customer' })).toHaveAttribute(
    'href',
    '/customers'
  );
  expect(screen.queryByText('To collect')).not.toBeInTheDocument();
});

it('opens a new book on the three steps alone (approved design, 12 Oct 2026)', async () => {
  // Day one used to add New bill, New purchase, "Send reminders" to nobody, a
  // refresh button and three empty cards around the checklist.
  service.getDashboard.mockResolvedValue(
    DATA({
      firstUse: { hasParty: false, hasItem: false, hasDocument: false, hasUpi: false },
      recentActivity: [],
      topDebtors: [],
      lowStockItems: [],
    })
  );
  signIn([...OWNER, 'parties.party.write', 'inventory.item.write']);
  renderWithProviders(<DashboardPageContent />);
  const steps = await screen.findByRole('list', { name: 'Get your book started' });
  expect(within(steps).getAllByRole('listitem')).toHaveLength(3);
  expect(screen.queryByText('Add your UPI ID')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Send reminders/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Refresh/ })).not.toBeInTheDocument();
  expect(screen.queryByText('Recent activity')).not.toBeInTheDocument();
  expect(screen.queryByText('Running low')).not.toBeInTheDocument();
});

it('shows a card only when it has something in it', async () => {
  service.getDashboard.mockResolvedValue(DATA({ lowStockItems: [] }));
  signIn(OWNER);
  renderWithProviders(<DashboardPageContent />);
  await screen.findByRole('list', { name: 'Recent activity' });
  expect(screen.queryByText('Running low')).not.toBeInTheDocument();
});

it('links each recent event to its document, and each debtor to the khata', async () => {
  service.getDashboard.mockResolvedValue(DATA());
  signIn(OWNER);
  renderWithProviders(<DashboardPageContent />);
  const feed = await screen.findByRole('list', { name: 'Recent activity' });
  expect(within(feed).getByRole('link', { name: 'Bill INV/26-27/0042 · Ramesh' })).toHaveAttribute(
    'href',
    '/sales/invoices/d1'
  );
  const debtors = screen.getByRole('list', { name: 'Who has to give you the most' });
  expect(within(debtors).getByRole('link', { name: 'Ramesh' })).toHaveAttribute(
    'href',
    '/parties/p1'
  );
  expect(within(debtors).getByText(/\+91 98••• ••678/)).toBeInTheDocument();
  // WP-06 / DEC-019 — the panel's "All customers" opens the Shop's customers,
  // the list whose figure this is the top of, not the Udhaar book's people.
  const panel = screen.getByRole('region', { name: 'Customers' });
  expect(within(panel).getByRole('link', { name: 'All customers' })).toHaveAttribute(
    'href',
    '/customers?balance=owes_me'
  );
  expect(within(debtors).getByRole('button', { name: 'Remind Ramesh' })).toBeInTheDocument();
});

it('asks the server to recompute when the refresh icon is pressed (FR-8)', async () => {
  service.getDashboard.mockResolvedValue(DATA());
  signIn(OWNER);
  renderWithProviders(<DashboardPageContent />);
  await screen.findAllByText('To collect');
  expect(screen.getByText(/Updated/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(service.getDashboard).toHaveBeenLastCalledWith({ refresh: true }, expect.anything());
});

it('re-reads after any write the invalidation map signals (TSK-RPT-01-06)', async () => {
  service.getDashboard.mockResolvedValue(DATA());
  signIn(OWNER);
  renderWithProviders(<DashboardPageContent />);
  await screen.findAllByText('To collect');
  const before = service.getDashboard.mock.calls.length;
  act(() => {
    store.dispatch(cacheInvalidated({ slices: ['partyList'], urgency: 'next-mount' }));
  });
  await waitFor(() => expect(service.getDashboard.mock.calls.length).toBe(before + 1));
});

// ── A10 — module sections (FRD 00 PLT-X13 §7–§8) ────────────────────────────

function ProbeSection({ data }: DashboardSectionProps): React.JSX.Element {
  const { count } = data as { count: number };
  return <>{`Probe members: ${count}`}</>;
}
function OtherSection(): React.JSX.Element {
  return <>Other module section</>;
}
const loadProbe = (): Promise<typeof ProbeSection> => Promise.resolve(ProbeSection);
const loadOther = (): Promise<typeof OtherSection> => Promise.resolve(OtherSection);

it('draws a module section the server returned and a module registered, below the core', async () => {
  registerDashboardSection('inventory.probe', { module: 'inventory', load: loadProbe });
  service.getDashboard.mockResolvedValue(
    DATA({
      sections: [
        {
          key: 'inventory.probe',
          module: 'inventory',
          order: 1,
          data: { count: 3 },
          unavailable: false,
        },
        // The server knows this one; no client component — skipped, not an empty box.
        { key: 'inventory.unknown', module: 'inventory', order: 2, data: {}, unavailable: false },
      ],
    })
  );
  signIn(OWNER);
  renderWithProviders(<DashboardPageContent />);
  expect(await screen.findByText('Probe members: 3')).toBeInTheDocument();
  const block = screen.getByTestId('dashboard-module-sections');
  // One module contributes: no heading (10-architecture §6 item 2).
  expect(within(block).queryByRole('heading')).not.toBeInTheDocument();
});

it('never draws a registered section the server did not return', async () => {
  registerDashboardSection('inventory.probe', { module: 'inventory', load: loadProbe });
  service.getDashboard.mockResolvedValue(DATA());
  signIn(OWNER);
  renderWithProviders(<DashboardPageContent />);
  expect(await screen.findAllByText('To collect')).not.toHaveLength(0);
  expect(screen.queryByTestId('dashboard-module-sections')).not.toBeInTheDocument();
  expect(screen.queryByText(/Probe members/)).not.toBeInTheDocument();
});

it('shows an unavailable section as one line with a retry, never a blank', async () => {
  registerDashboardSection('inventory.probe', { module: 'inventory', load: loadProbe });
  service.getDashboard.mockResolvedValue(
    DATA({
      sections: [
        { key: 'inventory.probe', module: 'inventory', order: 1, data: null, unavailable: true },
      ],
    })
  );
  signIn(OWNER);
  renderWithProviders(<DashboardPageContent />);
  expect(await screen.findByText('This section could not load.')).toBeInTheDocument();
  service.getDashboard.mockClear();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() =>
    expect(service.getDashboard).toHaveBeenCalledWith(
      expect.objectContaining({ refresh: true }),
      expect.anything()
    )
  );
});

it('groups sections under module headings only when two modules contribute', async () => {
  registerDashboardSection('inventory.probe', { module: 'inventory', load: loadProbe });
  registerDashboardSection('ledger.other', { module: 'ledger', load: loadOther });
  service.getDashboard.mockResolvedValue(
    DATA({
      sections: [
        {
          key: 'inventory.probe',
          module: 'inventory',
          order: 1,
          data: { count: 1 },
          unavailable: false,
        },
        { key: 'ledger.other', module: 'ledger', order: 2, data: {}, unavailable: false },
      ],
    })
  );
  signIn(OWNER);
  renderWithProviders(<DashboardPageContent />);
  expect(await screen.findByText('Other module section')).toBeInTheDocument();
  const block = screen.getByTestId('dashboard-module-sections');
  const headings = within(block)
    .getAllByRole('heading')
    .map((h) => h.textContent);
  expect(headings).toHaveLength(2);
  expect(headings.every((text) => text && !text.startsWith('nav.module.'))).toBe(true);
});

it('sends a member who may read neither reports nor Customers to the first menu item they can see (R49)', () => {
  service.getDashboard.mockResolvedValue(DATA());
  signIn(['sales.invoice.read'], ['reports', 'sales', 'parties']);
  renderWithProviders(<DashboardPageContent />);
  expect(mockReplace).toHaveBeenCalledWith('/sales/invoices');
  expect(service.getDashboard).not.toHaveBeenCalled();
});

/**
 * WP-06 DASH-04 — one failing figure used to blank the whole home screen. The
 * server now names the part that failed and sends the rest; the panel that
 * owns it says so with a Retry of its own, and nothing pretends the part is
 * empty ("No customer owes you", "Nothing needs you") when it is unknown.
 */
it('says which panel could not load and keeps the rest of the page', async () => {
  service.getDashboard.mockResolvedValue({
    ...DATA(),
    topDebtors: [],
    unavailable: ['top_debtors', 'supplier_bills'],
  });
  signIn(OWNER);
  renderWithProviders(<DashboardPageContent />);
  const customers = await screen.findByRole('region', { name: 'Customers' });
  expect(within(customers).getByText('This section could not load.')).toBeInTheDocument();
  expect(within(customers).queryByText('No customer owes you.')).not.toBeInTheDocument();
  expect(
    within(customers).getByRole('link', { name: /To collect.*₹7,000\.00/ })
  ).toBeInTheDocument();

  const attention = screen.getByRole('region', { name: 'Needs attention' });
  expect(within(attention).getByText('This section could not load.')).toBeInTheDocument();
  expect(within(attention).queryByText('Nothing needs you right now.')).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Today' })).toBeInTheDocument();

  await userEvent.click(within(customers).getByRole('button', { name: 'Try again' }));
  expect(service.getDashboard).toHaveBeenLastCalledWith({ refresh: true }, expect.anything());
});

it('keeps a panel on the page with a Retry when its own figure failed', async () => {
  const { toPay: _toPay, ...tiles } = DATA().tiles;
  service.getDashboard.mockResolvedValue({
    ...DATA(),
    tiles,
    topCreditors: [],
    unavailable: ['party_tiles'],
  });
  signIn(OWNER);
  renderWithProviders(<DashboardPageContent />);
  const suppliers = await screen.findByRole('region', { name: 'Suppliers' });
  expect(within(suppliers).getByText('This section could not load.')).toBeInTheDocument();
  expect(within(suppliers).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
});
