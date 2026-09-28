import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import * as service from '../api/paymentService';

import { PaymentFormDrawer } from './PaymentFormDrawer';

import type { OpenDocument, PaymentContext } from '../types/payment.types';

/**
 * T-PAY-01-9 — the allocation panel, auto and manual: FIFO previewed across
 * the open bills, "Max ₹898" on a row over its bill, the advance hint, and the
 * drawer's save posting exactly the rows the merchant typed.
 */
jest.mock('../api/paymentService', () => ({
  ...jest.requireActual('../api/paymentService'),
  listOpenDocuments: jest.fn(),
  recordPayment: jest.fn(),
}));
jest.mock('../../parties/api/partyService');

const bill = (id: string, number: string, due: string, date: string): OpenDocument => ({
  documentType: 'sales_document',
  documentId: id,
  number,
  documentDate: date,
  dueOn: null,
  grandTotal: due,
  amountDue: due,
  status: 'issued',
});

const BILLS = [
  bill('d40', 'INV/26-27/0040', '898.00', '2026-09-10'),
  bill('d42', 'INV/26-27/0042', '898.00', '2026-09-18'),
];

const context: PaymentContext = {
  direction: 'in',
  partyId: 'p1',
  partyName: 'Ramesh Traders',
  receivable: '1000.00',
  entry: 'party',
};

beforeEach(() => {
  jest.mocked(service.listOpenDocuments).mockResolvedValue(BILLS);
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
      permissions: ['payments.payment.read', 'payments.payment.write', 'parties.party.read'],
      enabledModules: ['payments', 'parties'],
      version: 1,
    })
  );
});

it('previews FIFO over the open bills and says what stays as advance', async () => {
  /** AC-2 / AC-5 — ₹1,000 against two ₹898 bills: the older is paid in full,
   *  the newer takes ₹102, and nothing is left over. */
  renderWithProviders(<PaymentFormDrawer context={context} onClose={jest.fn()} />);
  const picker = await screen.findByTestId('alloc-picker');
  expect(within(picker).getByText('INV/26-27/0040')).toBeInTheDocument();
  // The older bill takes its whole due; the newer only what is left.
  expect(within(picker).getAllByText('₹898.00').length).toBeGreaterThan(0);
  expect(within(picker).getAllByText('₹102.00').length).toBeGreaterThan(0);
  expect(within(picker).getByText('Allocated ₹1,000.00')).toBeInTheDocument();
  expect(screen.queryByTestId('alloc-advance')).not.toBeInTheDocument();
});

it('refuses a manual row over its bill with "Max ₹898.00" and saves nothing', async () => {
  /** AC-3 / Alternate B — the cap is the bill's due, on the row that is wrong. */
  const user = userEvent.setup();
  renderWithProviders(<PaymentFormDrawer context={context} onClose={jest.fn()} />);
  await screen.findByTestId('alloc-picker');
  await user.click(screen.getByRole('switch', { name: /Auto — oldest first/ }));
  const row = screen.getByRole('textbox', { name: 'Amount against INV/26-27/0042' });
  await user.type(row, '950');
  await user.click(screen.getByTestId('payment-save'));
  expect(await screen.findByText('Max ₹898.00')).toBeInTheDocument();
  expect(service.recordPayment).not.toHaveBeenCalled();
});

it('posts only the typed rows and shows the advance before saving', async () => {
  /** AC-3 — ₹500 to INV/0042 only: the older bill untouched, ₹500 advance. */
  const user = userEvent.setup();
  jest.mocked(service.recordPayment).mockResolvedValue({
    payment: {
      id: 'pay1',
      number: 'RCT/26-27/0017',
      direction: 'in',
      amount: '1000.00',
      unallocatedAmount: '500.00',
    } as never,
    partyBalance: '398.00',
    documents: [],
  });
  renderWithProviders(<PaymentFormDrawer context={context} onClose={jest.fn()} />);
  await screen.findByTestId('alloc-picker');
  await user.click(screen.getByRole('switch', { name: /Auto — oldest first/ }));
  await user.type(screen.getByRole('textbox', { name: 'Amount against INV/26-27/0042' }), '500');
  expect(await screen.findByTestId('alloc-advance')).toHaveTextContent(
    '₹500.00 will be kept as advance'
  );
  await user.click(screen.getByTestId('payment-save'));
  await waitFor(() => expect(service.recordPayment).toHaveBeenCalledTimes(1));
  const [sent] = jest.mocked(service.recordPayment).mock.calls[0] ?? [];
  expect(sent?.autoAllocate).toBe(false);
  expect(sent?.allocations.filter((r) => r.amount).map((r) => r.documentId)).toEqual(['d42']);
  expect(await screen.findByTestId('payment-saved')).toHaveTextContent('RCT/26-27/0017');
});
