import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { ExpenseFormDrawer } from './ExpenseFormDrawer';

import type { UseExpenseFormResult } from '../hooks/useExpenseForm';

/**
 * EXP-01 FR-2 / FR-4 / FR-6 — the drawer's two shapes.
 *
 * Paid (the default) asks how it was paid; "I still owe this" asks who to and
 * by when, and hides "Paid by", because money that has not moved has no "how".
 * The cross-field rule must land its message on the control the merchant can
 * see — a refusal attached to a hidden field is a form that will not submit
 * and cannot say why.
 */
jest.mock('../../parties/api/partyService');

const form = (overrides: Partial<UseExpenseFormResult> = {}): UseExpenseFormResult => ({
  open: true,
  isSaving: false,
  canWrite: true,
  canVoid: true,
  draft: null,
  formErrors: [],
  categories: [
    {
      id: 'c-rent',
      name: 'Rent',
      systemCode: 'rent',
      color: 'viz-1',
      isSystem: true,
      status: 'active',
    },
    {
      id: 'c-old',
      name: 'Old',
      systemCode: null,
      color: 'viz-2',
      isSystem: false,
      status: 'archived',
    },
  ],
  categoriesStatus: 'succeeded',
  creatingCategory: false,
  detail: null,
  voiding: null,
  isVoiding: false,
  voidErrors: [],
  openDrawer: jest.fn(),
  close: jest.fn(),
  discardDraft: jest.fn(),
  submit: jest.fn().mockResolvedValue(true),
  addCategory: jest.fn(),
  openDetail: jest.fn(),
  closeDetail: jest.fn(),
  openVoid: jest.fn(),
  closeVoid: jest.fn(),
  submitVoid: jest.fn(),
  ...overrides,
});

beforeEach(() => {
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
      permissions: ['expenses.expense.read', 'expenses.expense.write', 'parties.party.read'],
      enabledModules: ['expenses', 'parties'],
      version: 1,
    })
  );
});

it('opens clean, paid, with the payment chips', () => {
  // LED-01's sweep: a drawer that opened red before a touch. Not again.
  renderWithProviders(<ExpenseFormDrawer form={form()} />);
  expect(screen.queryByText('Enter an amount.')).not.toBeInTheDocument();
  expect(screen.getByRole('switch', { name: /Paid now/ })).toBeChecked();
  expect(screen.getByRole('radiogroup', { name: 'Paid by' })).toBeInTheDocument();
  expect(screen.queryByText('Due on')).not.toBeInTheDocument();
});

it('asks who is owed and by when once Paid now is off, and hides Paid by', async () => {
  const submit = jest.fn().mockResolvedValue(true);
  renderWithProviders(<ExpenseFormDrawer form={form({ submit })} />);
  await userEvent.click(screen.getByRole('switch', { name: /Paid now/ }));
  expect(screen.queryByRole('radiogroup', { name: 'Paid by' })).not.toBeInTheDocument();
  expect(screen.getByText('Owed to')).toBeInTheDocument();
  expect(screen.getByText('Due on')).toBeInTheDocument();

  await userEvent.type(screen.getByLabelText(/Amount/), '12000');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  // The refusal is under the field the merchant can see, not a hidden one.
  expect(await screen.findByText('Choose who you owe this to')).toBeInTheDocument();
  expect(submit).not.toHaveBeenCalled();
});

it('offers only live categories in the picker', async () => {
  // EXP-02 FR-6 — an archived category is gone from pickers, kept on old rows.
  renderWithProviders(<ExpenseFormDrawer form={form()} />);
  await userEvent.click(screen.getByRole('combobox'));
  expect(await screen.findByRole('option', { name: 'Rent' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Old' })).not.toBeInTheDocument();
});

it('does not offer a New category to a role that cannot record', () => {
  renderWithProviders(<ExpenseFormDrawer form={form({ canWrite: false })} />);
  expect(screen.queryByRole('button', { name: 'New category' })).not.toBeInTheDocument();
  expect(screen.getByText('You can view expenses but not record them')).toBeInTheDocument();
});
