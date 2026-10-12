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

const EMPTY_BOOK_TITLE = /No money in or out yet|cashbook\.empty\.firstUse\.title/;

it('shows a business that never moved money one empty state and no ₹0.00', async () => {
  /* Owner, 12 Oct 2026: an empty book is one sentence and one button. The
     defect this prevents is the old screen — a period picker, a bucket switch,
     four ₹0.00 tiles and "Days 0" over a business with nothing in it — and a
     header "Add" duplicating the empty state's own action. */
  cashbookService.getCashbook.mockResolvedValue({
    ...DATA('full'),
    range: {
      ...DATA('full').range,
      in: figures('0.00', '0.00'),
      out: figures('0.00', '0.00'),
      closing: figures('0.00', '0.00'),
    },
    hasAny: false,
  });
  signIn(['expenses.expense.read', 'expenses.expense.write', 'reports.financial.read']);
  renderWithProviders(<CashbookPageContent />);
  expect(await screen.findByText(EMPTY_BOOK_TITLE)).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Add an expense' })).toHaveLength(1);
  expect(screen.queryByText(/This month|Today/)).not.toBeInTheDocument();
  expect(screen.queryByText('Cash or bank')).not.toBeInTheDocument();
  expect(screen.queryByText('Opening')).not.toBeInTheDocument();
  expect(screen.queryByText('Money in')).not.toBeInTheDocument();
  expect(screen.queryByText('Days')).not.toBeInTheDocument();
  expect(screen.queryByText(/₹0\.00/)).not.toBeInTheDocument();
  expect(screen.queryByText('Close the day')).not.toBeInTheDocument();
});

it('keeps every control when the range is quiet but the book is not', async () => {
  /* A quiet range is not an empty book: the merchant must still be able to
     move the range to reach the money they did record. */
  cashbookService.getCashbook.mockResolvedValue({ ...DATA('full'), hasAny: true });
  signIn(['expenses.expense.read', 'reports.financial.read']);
  renderWithProviders(<CashbookPageContent />);
  expect(await screen.findByText('Nothing on these dates')).toBeInTheDocument();
  expect(screen.queryByText(EMPTY_BOOK_TITLE)).not.toBeInTheDocument();
  expect(screen.getByText('Opening')).toBeInTheDocument();
  expect(screen.getByText('Days')).toBeInTheDocument();
});

it('never hides the controls for a server that does not say', async () => {
  /* `hasAny` absent (an older server) must read as "unknown", not "empty". */
  cashbookService.getCashbook.mockResolvedValue(DATA('full'));
  signIn(['expenses.expense.read', 'reports.financial.read']);
  renderWithProviders(<CashbookPageContent />);
  expect(await screen.findByText('Opening')).toBeInTheDocument();
  expect(screen.queryByText(EMPTY_BOOK_TITLE)).not.toBeInTheDocument();
});
