import type * as ReactModule from 'react';

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetAllFeatureState } from 'src/redux/actions';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import { ExpensesPageContent } from './ExpensesPageContent';

import type { Expense, ExpenseFilters } from '../types/expense.types';

/**
 * EXP-01 FR-9 on screen: content → hook → thunk → service, with the service
 * stubbed at the module boundary. What is asserted is that the question on
 * screen is the question ASKED — PTY-02's chips lit up while sending nothing.
 */
jest.mock('../api/expenseService');

const mockReplace = jest.fn();
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
      push: jest.fn(),
      replace: mockReplace,
      back: jest.fn(),
      prefetch: jest.fn(),
    }),
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, read, read)),
    usePathname: () => '/expenses',
  };
});

const service = jest.requireMock('../api/expenseService') as {
  listExpenses: jest.Mock;
  listExpenseCategories: jest.Mock;
};

const TEA: Expense = {
  id: 'e1',
  number: 'EXP/26-27/0001',
  expenseDate: '2026-09-24',
  amount: '120.00',
  category: { id: 'c-food', name: 'Food', color: 'viz-6', status: 'active' },
  party: null,
  mode: 'cash',
  upiApp: null,
  reference: '',
  note: 'Tea for staff',
  paid: true,
  dueOn: null,
  status: 'recorded',
  voidReason: null,
  voidedAt: null,
  voidedBy: null,
  createdBy: { id: 'u1', name: 'Owner' },
  createdAt: '2026-09-24T05:00:00Z',
};

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
      enabledModules: ['expenses', 'parties'],
      version: 1,
    })
  );
};

const lastAsked = (): ExpenseFilters => {
  const calls = service.listExpenses.mock.calls as [ExpenseFilters][];
  const last = calls[calls.length - 1];
  if (!last) throw new Error('no list request was made');
  return last[0];
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSearch = '';
  mockReplace.mockReset();
  mockReplace.mockImplementation((url: string) => {
    mockSearch = url.replace(/^\?/, '');
    mockUrlListeners.forEach((listener) => listener());
  });
  store.dispatch(resetAllFeatureState());
  service.listExpenseCategories.mockResolvedValue([
    {
      id: 'c-food',
      name: 'Food',
      systemCode: 'food',
      color: 'viz-6',
      isSystem: true,
      status: 'active',
    },
  ]);
  service.listExpenses.mockImplementation(async (filters: ExpenseFilters) => ({
    rows: filters.tab === 'void' ? [] : [TEA],
    totals: {
      amount: filters.tab === 'void' ? '0.00' : '120.00',
      count: filters.tab === 'void' ? 0 : 1,
      byCategory: [],
    },
    page: 1,
    pageSize: 25,
    total: filters.tab === 'void' ? 0 : 1,
  }));
});

it('lists this month and shows the filtered total', async () => {
  /* The total is the server's figure over the filtered set, and the default
     request is "this month, recorded" — never a void. */
  signIn(['expenses.expense.read', 'expenses.expense.write']);
  renderWithProviders(<ExpensesPageContent />);
  expect(await screen.findByText('Tea for staff')).toBeInTheDocument();
  // Once on the total tile and once on the row.
  expect(screen.getAllByText('₹120.00').length).toBeGreaterThanOrEqual(2);
  expect(lastAsked()).toMatchObject({ preset: 'thisMonth', tab: 'all' });
});

it('asks the server for voids when the Void tab is chosen', async () => {
  // The chip must change the REQUEST, not just light up.
  signIn(['expenses.expense.read']);
  renderWithProviders(<ExpensesPageContent />);
  await screen.findByText('Tea for staff');
  await userEvent.click(screen.getByRole('tab', { name: 'Void' }));
  await waitFor(() => expect(lastAsked().tab).toBe('void'));
  expect(mockSearch).toBe('tab=void');
});

it('offers Add expense only to a role that can record', async () => {
  // §19.7.5 — hidden, not disabled: a disabled button invites a support call.
  signIn(['expenses.expense.read']);
  const { unmount } = renderWithProviders(<ExpensesPageContent />);
  await screen.findByText('Tea for staff');
  expect(screen.queryByRole('button', { name: 'Add expense' })).not.toBeInTheDocument();
  unmount();

  signIn(['expenses.expense.read', 'expenses.expense.write']);
  renderWithProviders(<ExpensesPageContent />);
  expect(await screen.findByRole('button', { name: 'Add expense' })).toBeInTheDocument();
});

it('tells a member without access so, and asks nothing', () => {
  signIn([]);
  renderWithProviders(<ExpensesPageContent />);
  expect(screen.getByText('You cannot view expenses')).toBeInTheDocument();
  expect(service.listExpenses).not.toHaveBeenCalled();
});
