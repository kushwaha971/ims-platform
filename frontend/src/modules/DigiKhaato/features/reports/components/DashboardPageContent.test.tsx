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
    overdue: { count: 1, amount: '500.00', invoices: { count: 2, amount: '900.00' } },
    upcoming7d: { count: 0, amount: '0.00' },
    todaySales: { amount: '2204.19', count: 2, yesterdayAmount: '0.00' },
    cashInHand: { amount: '800.00' },
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
  'inventory.stock.read',
  'ledger.entry.read',
  'ledger.reminder.write',
];

const signIn = (
  permissions: readonly PermissionCode[],
  modules: readonly ModuleCode[] = ['reports', 'sales', 'ledger', 'inventory', 'parties']
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

it('draws exactly the tiles the server sent, each opening its list', async () => {
  service.getDashboard.mockResolvedValue(DATA());
  signIn(OWNER);
  renderWithProviders(<DashboardPageContent />);
  expect(await screen.findByText('To collect')).toBeInTheDocument();
  for (const label of [
    'To pay',
    'Due today',
    'Overdue',
    "Today's sales",
    'Cash in hand',
    'Low stock',
  ]) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }
  expect(screen.getByText('₹7,000.00')).toBeInTheDocument();
  expect(screen.getByText(/₹900\.00 in 2 bills/)).toBeInTheDocument();
  expect(screen.getByText('1 out of stock')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /To collect: ₹7,000\.00/ }));
  expect(mockPush).toHaveBeenCalledWith('/parties?balance=owes_me');
});

it('leaves out a tile the reader may not see, rather than showing it as ₹0 (FR-6)', async () => {
  const { cashInHand: _cash, lowStock: _stock, ...tiles } = DATA().tiles;
  service.getDashboard.mockResolvedValue(DATA({ tiles }));
  signIn(OWNER.filter((code) => code !== 'reports.financial.read'));
  renderWithProviders(<DashboardPageContent />);
  await screen.findByText('To collect');
  expect(screen.queryByText('Cash in hand')).not.toBeInTheDocument();
  expect(screen.queryByText('Low stock')).not.toBeInTheDocument();
  expect(screen.queryByText('Running low')).not.toBeInTheDocument();
});

it('sends a member who may not read reports on to Customers', () => {
  signIn(['parties.party.read']);
  renderWithProviders(<DashboardPageContent />);
  expect(mockReplace).toHaveBeenCalledWith('/parties');
  expect(service.getDashboard).not.toHaveBeenCalled();
});

it('shows the first-use checklist instead of ₹0 tiles in an empty book (FR-9)', async () => {
  service.getDashboard.mockResolvedValue(
    DATA({ firstUse: { hasParty: false, hasItem: false, hasDocument: false, hasUpi: false } })
  );
  signIn([...OWNER, 'parties.party.write']);
  renderWithProviders(<DashboardPageContent />);
  expect(await screen.findByText('Get your book started')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Add your first customer' })).toHaveAttribute(
    'href',
    '/parties'
  );
  expect(screen.queryByText('To collect')).not.toBeInTheDocument();
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
  const debtors = screen.getByRole('list', { name: 'Who owes most' });
  expect(within(debtors).getByRole('link', { name: 'Ramesh' })).toHaveAttribute(
    'href',
    '/parties/p1'
  );
  expect(within(debtors).getByText(/\+91 98••• ••678/)).toBeInTheDocument();
  expect(within(debtors).getByRole('button', { name: 'Remind Ramesh' })).toBeInTheDocument();
});

it('asks the server to recompute when the refresh icon is pressed (FR-8)', async () => {
  service.getDashboard.mockResolvedValue(DATA());
  signIn(OWNER);
  renderWithProviders(<DashboardPageContent />);
  await screen.findByText('To collect');
  expect(screen.getByText(/Updated/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(service.getDashboard).toHaveBeenLastCalledWith({ refresh: true }, expect.anything());
});

it('re-reads after any write the invalidation map signals (TSK-RPT-01-06)', async () => {
  service.getDashboard.mockResolvedValue(DATA());
  signIn(OWNER);
  renderWithProviders(<DashboardPageContent />);
  await screen.findByText('To collect');
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
  expect(await screen.findByText('To collect')).toBeInTheDocument();
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
