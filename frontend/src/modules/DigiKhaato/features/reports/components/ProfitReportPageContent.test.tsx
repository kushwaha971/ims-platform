import type * as ReactModule from 'react';

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetAllFeatureState } from 'src/redux/actions';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { ModuleCode, PermissionCode } from 'src/types/domain.types';

import { ProfitReportPageContent } from './ProfitReportPageContent';

import type {
  ProfitFilters,
  ProfitPage,
  ProfitRow,
  ProfitTotals,
} from '../types/profitReport.types';

/**
 * Shop item 1 on screen: content → hook → thunk → service, the service stubbed
 * at the module boundary. What is asserted: the P&L is the SERVER's over the
 * whole period (not the page's sum), a loss is a word and not only a colour,
 * switching the view is a request asked, the lines with no cost are owned up
 * to, and a member without the financial read is told so and nothing is fetched.
 */
jest.mock('../api/profitReportService');

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockSearch = '';
const mockUrlListeners = new Set<() => void>();
jest.mock('next/navigation', () => {
  const { useSyncExternalStore } = jest.requireActual<typeof ReactModule>('react');
  const subscribe = (listener: () => void) => {
    mockUrlListeners.add(listener);
    return () => {
      mockUrlListeners.delete(listener);
    };
  };
  const read = () => mockSearch;
  return {
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      back: jest.fn(),
      prefetch: jest.fn(),
    }),
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, read, read)),
    usePathname: () => '/reports/profit',
  };
});

const service = jest.requireMock('../api/profitReportService') as {
  getProfitReport: jest.Mock;
};

const row = (over: Partial<ProfitRow>): ProfitRow => ({
  id: 'i1',
  name: 'Rice 5 kg',
  qty: '28.000',
  unit: 'NOS',
  date: null,
  party: null,
  bills: 3,
  saleValue: '1400.00',
  cost: '1120.00',
  profit: '280.00',
  marginPct: '20.0',
  uncostedLines: 0,
  ...over,
});

const TOTALS: ProfitTotals = {
  bills: 12,
  saleValue: '98765.00',
  cost: '80000.00',
  profit: '18765.00',
  marginPct: '19.0',
  uncostedLines: 2,
  expenses: '25000.00',
  netProfit: '-6235.00',
};

const page = (rows: readonly ProfitRow[], totals = TOTALS): ProfitPage => ({
  rows,
  totals,
  page: 1,
  pageSize: 50,
  total: rows.length,
});

const signIn = (permissions: readonly PermissionCode[], modules: readonly ModuleCode[]): void => {
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
      activeTenant: { id: 't1', name: 'Sharma General Store', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Sharma General Store', timezone: 'Asia/Kolkata' }],
      permissions: [...permissions],
      enabledModules: [...modules],
      version: 1,
    })
  );
};

const lastAsked = (): ProfitFilters => {
  const calls = service.getProfitReport.mock.calls as [ProfitFilters][];
  const last = calls[calls.length - 1];
  if (!last) throw new Error('no profit request was made');
  return last[0];
};

const OWNER: PermissionCode[] = [
  'reports.basic.read',
  'sales.invoice.read',
  'reports.financial.read',
];
const MODULES: ModuleCode[] = ['reports', 'sales'];

beforeEach(() => {
  window.localStorage.setItem('ub.statSummary.profit', 'open');
  jest.clearAllMocks();
  mockSearch = '';
  mockReplace.mockImplementation((url: string) => {
    mockSearch = url.replace(/^\?/, '');
    mockUrlListeners.forEach((listener) => listener());
  });
  store.dispatch(resetAllFeatureState());
  service.getProfitReport.mockImplementation(async () =>
    page([
      row({}),
      row({ id: 'i2', name: 'Mustard oil', profit: '-20.00', marginPct: '-11.1' }),
      row({ id: null, name: null, profit: '0.00', marginPct: null, uncostedLines: 1 }),
    ])
  );
});

it('shows the period P&L from the server and says a net loss in words', async () => {
  signIn(OWNER, MODULES);
  renderWithProviders(<ProfitReportPageContent />);
  expect(await screen.findByText('₹98,765.00')).toBeInTheDocument();
  expect(screen.getByText('Gross profit')).toBeInTheDocument();
  expect(screen.getByText('19.0% margin')).toBeInTheDocument();
  expect(screen.getByText('Net loss')).toBeInTheDocument();
  expect(screen.getByText('2 lines have no cost recorded')).toBeInTheDocument();
  expect(lastAsked()).toMatchObject({ preset: 'thisMonth', group: 'item', ordering: '-profit' });
});

it('names the catch-all row and owns up to the line it could not cost', async () => {
  signIn(OWNER, MODULES);
  renderWithProviders(<ProfitReportPageContent />);
  expect(
    (await screen.findAllByText('Lines without an item · 1 line has no cost')).length
  ).toBeGreaterThan(0);
  // A loss carries its sign in the accessible name, never colour alone.
  expect(screen.getAllByText('Less, ₹20.00').length).toBeGreaterThan(0);
});

it('asks the server again when the view changes to customers, and opens the khata', async () => {
  signIn(OWNER, MODULES);
  renderWithProviders(<ProfitReportPageContent />);
  await screen.findAllByText('Rice 5 kg');
  await userEvent.click(screen.getByRole('button', { name: /^View:/ }));
  await userEvent.click(await screen.findByRole('option', { name: 'By customer' }));
  await waitFor(() => expect(lastAsked().group).toBe('party'));
  expect(mockSearch).toBe('by=party');
  const [firstRow] = await screen.findAllByRole('button', { name: /Rice 5 kg/ });
  await userEvent.click(firstRow as HTMLElement);
  expect(mockPush).toHaveBeenCalledWith('/parties/i1');
});

it('tells a member without the financial read, and asks nothing', async () => {
  signIn(['reports.basic.read', 'sales.invoice.read'], MODULES);
  renderWithProviders(<ProfitReportPageContent />);
  expect(await screen.findByText('Profit is for the owner and the accountant')).toBeInTheDocument();
  expect(service.getProfitReport).not.toHaveBeenCalled();
});
