import type * as ReactModule from 'react';

import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetAllFeatureState } from 'src/redux/actions';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import { CashbookPageContent } from './CashbookPageContent';

import type { CashbookData, CashbookFilters } from '../types/cashbook.types';

/**
 * EXP-03 on screen, service stubbed at the module boundary.
 *
 * The scope test is the one that matters most: FR-13 makes the cashbook the
 * business's whole cash position, so a member without `reports.financial.read`
 * must send the till-only request (no parameters — the server's default for
 * them) and be shown no range or bank controls. The server refuses anything
 * wider anyway; the client must not invite the refusal.
 */
jest.mock('../api/cashbookService');
jest.mock('../api/expenseService');

let mockSearch = '';
jest.mock('next/navigation', () => {
  const { useSyncExternalStore } = jest.requireActual<typeof ReactModule>('react');
  const read = () => mockSearch;
  return {
    useRouter: () => ({
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      prefetch: jest.fn(),
    }),
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(() => () => {}, read, read)),
    usePathname: () => '/cashbook',
  };
});

const cashbookService = jest.requireMock('../api/cashbookService') as { getCashbook: jest.Mock };
const expenseService = jest.requireMock('../api/expenseService') as {
  listExpenseCategories: jest.Mock;
};

const NOW = new Date('2026-09-24T06:00:00Z');
const TODAY = '2026-09-24';

const figures = (cash: string, bank?: string) =>
  bank === undefined
    ? { cash, total: cash }
    : { cash, bank, total: String(Number(cash) + Number(bank)) };

const DATA = (scope: CashbookData['scope']): CashbookData => ({
  range: {
    dateFrom: TODAY,
    dateTo: TODAY,
    opening: scope === 'full' ? figures('0.00', '0.00') : figures('0.00'),
    in: scope === 'full' ? figures('2000.00', '0.00') : figures('2000.00'),
    out: scope === 'full' ? figures('440.00', '450.00') : figures('440.00'),
    closing: scope === 'full' ? figures('1560.00', '-450.00') : figures('1560.00'),
  },
  days: [],
  byCategory: [],
  buckets: scope === 'full' ? ['cash', 'bank'] : ['cash'],
  scope,
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
      enabledModules: ['expenses'],
      version: 1,
    })
  );
};

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
  store.dispatch(resetAllFeatureState());
  expenseService.listExpenseCategories.mockResolvedValue([]);
});

afterEach(() => {
  jest.useRealTimers();
});

it("scopes a member without financial read to today's till", async () => {
  cashbookService.getCashbook.mockResolvedValue(DATA('today_cash'));
  signIn(['expenses.expense.read']);
  renderWithProviders(<CashbookPageContent />);
  expect(await screen.findByText("You can see today's cash only")).toBeInTheDocument();
  expect(cashbookService.getCashbook).toHaveBeenCalledWith(null, expect.anything());
  expect(screen.queryByRole('button', { name: 'This month' })).not.toBeInTheDocument();
  expect(screen.queryByRole('radio', { name: 'Bank & UPI' })).not.toBeInTheDocument();
});

it('asks for the range in the URL when the member may read the books', async () => {
  cashbookService.getCashbook.mockResolvedValue(DATA('full'));
  mockSearch = 'period=today';
  signIn(['expenses.expense.read', 'reports.financial.read']);
  renderWithProviders(<CashbookPageContent />);
  await screen.findByText('Close the day');
  const asked = cashbookService.getCashbook.mock.calls[0]?.[0] as CashbookFilters;
  expect(asked).toEqual({ preset: 'today', dateFrom: TODAY, dateTo: TODAY, bucket: 'all' });
});

it('tells the merchant how far the drawer is off, and offers the fix', async () => {
  /* FR-8 — computed on the client, stored nowhere. "Short by" comes with the
     one fix this product can perform today: add the forgotten expense. */
  cashbookService.getCashbook.mockResolvedValue(DATA('full'));
  mockSearch = 'period=today';
  signIn(['expenses.expense.read', 'expenses.expense.write', 'reports.financial.read']);
  renderWithProviders(<CashbookPageContent />);
  expect(await screen.findByText('Expected cash in drawer: ₹1,560.00')).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Counted cash'), '1440');
  expect(await screen.findByText('Short by ₹120.00')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add an expense' })).toBeInTheDocument();
});
