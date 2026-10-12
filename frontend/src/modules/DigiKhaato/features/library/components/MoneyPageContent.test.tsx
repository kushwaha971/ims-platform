import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import * as service from '../api/libraryMoneyService';

import { MoneyPageContent, periodDates } from './MoneyPageContent';

/**
 * Library P0 — fees in, expenses out. What these protect: each period asks for exactly
 * its dates (last month ends on its last day, January's last month is December); a
 * shortfall reads "Short by", never a minus sign; and Expenses is offered only to
 * someone who may read them.
 */
jest.mock('../api/libraryMoneyService', () => ({ getLibraryMoney: jest.fn() }));

const signIn = (permissions: PermissionCode[], modules = ['library', 'expenses']): void => {
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Owner',
        email: 'owner@library.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'Vidya Reading Room', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Vidya Reading Room', timezone: 'Asia/Kolkata' }],
      permissions,
      enabledModules: modules as never,
      version: 1,
    })
  );
};

it('turns a period into its dates', () => {
  expect(periodDates('this_month', '2026-10-09')).toEqual({ from: '2026-10-01', to: '2026-10-09' });
  expect(periodDates('last_month', '2026-03-15')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  expect(periodDates('last_month', '2026-01-05')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  expect(periodDates('this_year', '2026-10-09')).toEqual({ from: '2026-01-01', to: '2026-10-09' });
});

it('shows fees in, expenses out and a shortfall in words', async () => {
  jest.mocked(service.getLibraryMoney).mockImplementation(async (from, to) => ({
    from,
    to,
    income: [{ kind: 'membership_fee', amount: '900.00' }],
    incomeTotal: '900.00',
    expenses: [{ category: 'Rent', amount: '1500.00' }],
    expensesTotal: '1500.00',
    profit: '-600.00',
  }));
  signIn(['library.reports.read', 'expenses.expense.read'] as PermissionCode[]);
  renderWithProviders(<MoneyPageContent />);
  expect(await screen.findByText('Monthly fees')).toBeInTheDocument();
  expect(screen.getByText('Rent')).toBeInTheDocument();
  expect(screen.getAllByText('Short by').length).toBeGreaterThan(0);
  expect(screen.getAllByText('₹600.00').length).toBeGreaterThan(0);
  expect(screen.getByTestId('library-money-expenses')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('radio', { name: 'This year' }));
  await waitFor(() =>
    expect(service.getLibraryMoney).toHaveBeenLastCalledWith(
      expect.stringMatching(/-01-01$/),
      expect.any(String),
      expect.anything()
    )
  );
});

const ZERO_MONEY = (from: string, to: string) => ({
  from,
  to,
  income: [],
  incomeTotal: '0.00',
  expenses: [],
  expensesTotal: '0.00',
  profit: '0.00',
});
const EMPTY_TITLE = /No money in or out yet|library\.money\.empty\.title/;

it('shows a room with no money ever one empty state, no chips and no ₹0.00', async () => {
  /* Owner, 12 Oct 2026. The defect: This month / Last month / This year chips
     over three ₹0.00 tiles and two empty cards, for a room that has never taken
     a fee — and a header link duplicating the empty state's one action. */
  jest
    .mocked(service.getLibraryMoney)
    .mockImplementation(async (from, to) => ({ ...ZERO_MONEY(from, to), hasAny: false }));
  signIn(['library.reports.read', 'expenses.expense.read'] as PermissionCode[]);
  renderWithProviders(<MoneyPageContent />);
  expect(await screen.findByText(EMPTY_TITLE)).toBeInTheDocument();
  expect(screen.queryByRole('radio', { name: 'This month' })).not.toBeInTheDocument();
  expect(screen.queryByText(/₹0\.00/)).not.toBeInTheDocument();
  expect(screen.queryByTestId('library-money-in')).not.toBeInTheDocument();
  expect(screen.queryByTestId('library-money-out')).not.toBeInTheDocument();
  expect(screen.queryByTestId('library-money-expenses')).not.toBeInTheDocument();
  expect(screen.getByTestId('library-money-empty-expenses')).toBeInTheDocument();
});

it('keeps the period chips when the period is quiet but the room is not', async () => {
  jest
    .mocked(service.getLibraryMoney)
    .mockImplementation(async (from, to) => ({ ...ZERO_MONEY(from, to), hasAny: true }));
  signIn(['library.reports.read', 'expenses.expense.read'] as PermissionCode[]);
  renderWithProviders(<MoneyPageContent />);
  expect(await screen.findByTestId('library-money-in')).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'This month' })).toBeInTheDocument();
  expect(screen.queryByText(EMPTY_TITLE)).not.toBeInTheDocument();
});
