import type * as ReactModule from 'react';

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { UbGridTier } from 'src/design-system/UbDataGrid';
import { resetAllFeatureState } from 'src/redux/actions';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import { DayBookPageContent } from './DayBookPageContent';

import type { DayBookData, DayBookFilters, DayBookRow } from '../types/reports.types';

/**
 * RPT-02 on screen, the service stubbed at the module boundary.
 *
 * What these protect: the URL is the question (period and type chips reach
 * the request); the drawer's figures appear only when the server sent them,
 * with the hint instead of blanks otherwise; Export is the same query and is
 * hidden without the permission; rows drill into their documents; and on a
 * phone the rows are grouped under a band per date (T-RPT02-6).
 */
jest.mock('../api/dayBookService', () => ({
  ...jest.requireActual('../api/dayBookService'),
  getDayBook: jest.fn(),
}));

let mockSearch = '';
const mockReplace = jest.fn();
jest.mock('next/navigation', () => {
  const { useSyncExternalStore } = jest.requireActual<typeof ReactModule>('react');
  const read = () => mockSearch;
  return {
    useRouter: () => ({
      push: jest.fn(),
      replace: mockReplace,
      back: jest.fn(),
      prefetch: jest.fn(),
    }),
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(() => () => {}, read, read)),
    usePathname: () => '/reports/day-book',
  };
});

const service = jest.requireMock('../api/dayBookService') as { getDayBook: jest.Mock };

const NOW = new Date('2026-09-18T06:00:00Z');
const TODAY = '2026-09-18';

const row = (over: Partial<DayBookRow>): DayBookRow => ({
  id: 'payment_in:p1',
  type: 'payment_in',
  void: false,
  source: { kind: 'payment', id: 'p1', partyId: 'c1' },
  date: TODAY,
  time: '10:15',
  recordedOn: null,
  number: 'RCT/26-27/0017',
  party: { id: 'c1', name: 'Ramesh' },
  walkInName: null,
  amount: '1772.00',
  amountDue: null,
  moneyIn: '1772.00',
  moneyOut: null,
  modes: [
    { mode: 'cash', amount: '1000.00' },
    { mode: 'upi', amount: '772.00' },
  ],
  note: '',
  detail: null,
  lines: null,
  paid: null,
  reference: '',
  createdBy: { id: 'u1', name: 'Owner' },
  cashAfter: '1000.00',
  bankAfter: '772.00',
  ...over,
});

const DATA = (balances: boolean, rows: readonly DayBookRow[]): DayBookData => ({
  rows: balances
    ? rows
    : rows.map(({ cashAfter: _c, bankAfter: _b, ...rest }) => rest as DayBookRow),
  totals: {
    count: { payment_in: 1 },
    sales: '1772.00',
    creditNotes: '0.00',
    purchases: '0.00',
    paymentsIn: '1772.00',
    paymentsOut: '0.00',
    expenses: '200.00',
    moneyIn: '1772.00',
    moneyOut: '200.00',
  },
  opening: balances ? { cash: '0.00', bank: '0.00' } : null,
  closing: balances ? { cash: '800.00', bank: '772.00' } : null,
  balancesVisible: balances,
  page: 1,
  pageSize: 100,
  total: rows.length,
  totalPages: 1,
});

const signIn = (permissions: readonly PermissionCode[]): void => {
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
      enabledModules: ['reports', 'payments', 'sales'],
      version: 1,
    })
  );
};

const setTier = (tier: UbGridTier): void => {
  const matches = (query: string): boolean =>
    tier === 'full' ? true : tier === 'compact' ? query.includes('768') : false;
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: matches(query),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
};

const OWNER: readonly PermissionCode[] = [
  'reports.basic.read',
  'reports.financial.read',
  'reports.export',
];

beforeEach(() => {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      'nextTick',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });
  jest.clearAllMocks();
  mockSearch = '';
  setTier('full');
  store.dispatch(resetAllFeatureState());
});

afterEach(() => {
  jest.useRealTimers();
});

it('asks for the period and types in the URL, today by default (FR-5)', async () => {
  service.getDayBook.mockResolvedValue(DATA(true, [row({})]));
  mockSearch = 'period=yesterday&type=payments';
  signIn(OWNER);
  renderWithProviders(<DayBookPageContent />);
  await screen.findByTestId('ub-grid-table');
  const asked = service.getDayBook.mock.calls[0]?.[0] as DayBookFilters;
  expect(asked).toMatchObject({
    preset: 'yesterday',
    dateFrom: '2026-09-17',
    dateTo: '2026-09-17',
    types: ['payments'],
    includeVoid: false,
  });
});

it('shows the drawer, and each row opens its document (AC-1, AC-3)', async () => {
  service.getDayBook.mockResolvedValue(DATA(true, [row({})]));
  signIn(OWNER);
  renderWithProviders(<DayBookPageContent />);
  const table = await screen.findByTestId('ub-grid-table');
  expect(within(table).getByRole('link', { name: 'RCT/26-27/0017' })).toHaveAttribute(
    'href',
    '/payments/p1'
  );
  expect(within(table).getByText('Cash ₹1,000.00 + UPI ₹772.00')).toBeInTheDocument();
  expect(screen.getAllByText('₹800.00').length).toBeGreaterThan(0);
  expect(screen.getByRole('columnheader', { name: 'Cash' })).toBeInTheDocument();
});

it('hides the drawer for a reader the server did not send it to, and says why', async () => {
  service.getDayBook.mockResolvedValue(DATA(false, [row({})]));
  signIn(['reports.basic.read']);
  renderWithProviders(<DayBookPageContent />);
  expect(
    await screen.findByText('Cash and bank balances are visible to owners, admins and accountants.')
  ).toBeInTheDocument();
  expect(screen.queryByText('Closing cash')).not.toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'Cash' })).not.toBeInTheDocument();
  // No `reports.export` — no Export control at all (§12).
  expect(screen.queryByRole('button', { name: 'Export' })).not.toBeInTheDocument();
});

it('offers Export for the same query to a reader who may export (RPT-08)', async () => {
  service.getDayBook.mockResolvedValue(DATA(true, [row({})]));
  signIn(OWNER);
  renderWithProviders(<DayBookPageContent />);
  expect(await screen.findByRole('button', { name: 'Export' })).toBeEnabled();
});

it('writes a type chip into the URL, back to page one', async () => {
  service.getDayBook.mockResolvedValue(DATA(true, [row({})]));
  mockSearch = 'page=3';
  signIn(OWNER);
  renderWithProviders(<DayBookPageContent />);
  await screen.findByTestId('ub-grid-table');
  await userEvent.click(screen.getByRole('button', { name: 'Payments' }));
  expect(mockReplace).toHaveBeenCalledWith('?type=payments', { scroll: false });
});

it('groups the rows under a band per date on a phone (T-RPT02-6)', async () => {
  setTier('cards');
  service.getDayBook.mockResolvedValue(
    DATA(true, [
      row({ id: 'a', date: '2026-09-17' }),
      row({
        id: 'b',
        date: TODAY,
        type: 'expense',
        moneyIn: null,
        moneyOut: '200.00',
        number: 'EXP/1',
        source: { kind: 'expense', id: 'e1', partyId: null },
        party: null,
        modes: [],
      }),
    ])
  );
  mockSearch = 'period=thisWeek';
  signIn(OWNER);
  renderWithProviders(<DayBookPageContent />);
  const groups = await screen.findByTestId('day-book-groups');
  expect(within(groups).getByRole('region', { name: '17/09/2026' })).toBeInTheDocument();
  expect(within(groups).getByRole('region', { name: '18/09/2026' })).toBeInTheDocument();
  expect(within(groups).getByText('+₹1,772.00')).toBeInTheDocument();
  expect(within(groups).getByText('−₹200.00')).toBeInTheDocument();
});

it('says a quiet day is quiet rather than showing an empty table (§9)', async () => {
  service.getDayBook.mockResolvedValue(DATA(false, []));
  signIn(['reports.basic.read']);
  renderWithProviders(<DayBookPageContent />);
  expect(await screen.findByText('No transactions')).toBeInTheDocument();
});
