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
  // Every row carries "Max ₹898.00" as its hint (P-D1); on the wrong row it becomes the error.
  await waitFor(() =>
    expect(document.getElementById('allocations.1.amount-error')).toHaveTextContent('Max ₹898.00')
  );
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

it('opens from a purchase bill as "Pay supplier", money out, preset to that bill', async () => {
  /** PUR-02 AC-3 / FR-4 — the bill page's Pay: the supplier's OPEN BILLS are asked for
   *  with direction out (never customers' invoices), the drawer says "Pay supplier", and
   *  the bill it came from is pre-allocated its due while the older bill is left alone. */
  const user = userEvent.setup();
  const bills: OpenDocument[] = [
    { ...bill('b6', 'PB/26-27/0006', '500.00', '2026-09-01'), documentType: 'purchase_document' },
    { ...bill('b7', 'PB/26-27/0007', '1921.00', '2026-09-18'), documentType: 'purchase_document' },
  ];
  jest.mocked(service.listOpenDocuments).mockClear().mockResolvedValue(bills);
  jest
    .mocked(service.recordPayment)
    .mockClear()
    .mockResolvedValue({
      payment: {
        id: 'pay2',
        number: 'PAYOUT/26-27/0004',
        direction: 'out',
        amount: '1921.00',
        unallocatedAmount: '0.00',
      } as never,
      partyBalance: '-500.00',
      documents: [],
    });
  renderWithProviders(
    <PaymentFormDrawer
      context={{
        direction: 'out',
        partyId: 'p9',
        partyName: 'Agro Traders',
        documentId: 'b7',
        documentNumber: 'PB/26-27/0007',
        documentDue: '1921.00',
        entry: 'bill',
      }}
      onClose={jest.fn()}
    />
  );
  expect(await screen.findByText('Pay supplier · Agro Traders')).toBeInTheDocument();
  await screen.findByTestId('alloc-picker');
  expect(service.listOpenDocuments).toHaveBeenCalledWith('p9', 'out', expect.anything());
  await user.click(screen.getByTestId('payment-save'));
  await waitFor(() => expect(service.recordPayment).toHaveBeenCalledTimes(1));
  const [sent, , entry] = jest.mocked(service.recordPayment).mock.calls[0] ?? [];
  expect(sent?.direction).toBe('out');
  expect(entry).toBe('bill');
  expect(sent?.autoAllocate).toBe(false);
  expect(sent?.allocations.filter((r) => r.amount).map((r) => [r.documentId, r.amount])).toEqual([
    ['b7', '1921.00'],
  ]);
  expect(await screen.findByTestId('payment-saved')).toHaveTextContent('Paid ₹1,921.00');
});

const fromInvoice: PaymentContext = {
  direction: 'in',
  partyId: 'p1',
  partyName: 'Ramesh Traders',
  documentId: 'd42',
  documentNumber: 'INV/26-27/0042',
  documentDue: '898.00',
  entry: 'invoice',
};

const savedAs = (amount: string) => ({
  payment: {
    id: 'pay3',
    number: 'RCT/26-27/0018',
    direction: 'in' as const,
    amount,
    unallocatedAmount: '0.00',
  } as never,
  partyBalance: '0.00',
  documents: [],
});

it('P-D2: a part payment from an invoice allocates what is paid, not the full due', async () => {
  /** QA P-D2 — Record payment on a ₹898 invoice, amount changed to ₹500: the
   *  invoice's row used to stay at ₹898, the footer said "Allocations exceed the
   *  payment" and Save did nothing. The preset row now follows min(amount, due). */
  const user = userEvent.setup();
  jest.mocked(service.recordPayment).mockClear().mockResolvedValue(savedAs('500.00'));
  renderWithProviders(<PaymentFormDrawer context={fromInvoice} onClose={jest.fn()} />);
  await screen.findByTestId('alloc-picker');
  const amount = screen.getByRole('textbox', { name: 'Amount' });
  await user.clear(amount);
  await user.type(amount, '500');
  expect(screen.queryByText('Allocations exceed the payment')).not.toBeInTheDocument();
  await user.click(screen.getByTestId('payment-save'));
  await waitFor(() => expect(service.recordPayment).toHaveBeenCalledTimes(1));
  const [sent] = jest.mocked(service.recordPayment).mock.calls[0] ?? [];
  expect(sent?.allocations.filter((r) => r.amount).map((r) => [r.documentId, r.amount])).toEqual([
    ['d42', '500.00'],
  ]);
});

it('P-D2: once the merchant sets a row by hand, the amount no longer moves it', async () => {
  /** QA P-D2 — "unless the user edited the allocation manually": a typed row is theirs. */
  const user = userEvent.setup();
  renderWithProviders(<PaymentFormDrawer context={fromInvoice} onClose={jest.fn()} />);
  await screen.findByTestId('alloc-picker');
  const row = screen.getByRole('textbox', { name: 'Amount against INV/26-27/0042' });
  await user.clear(row);
  await user.type(row, '300');
  const amount = screen.getByRole('textbox', { name: 'Amount' });
  await user.clear(amount);
  await user.type(amount, '400');
  expect(row).toHaveValue('300.00');
});

it('P-D1: manual rows show "Max ₹…" and a Fill that puts the rest on that bill', async () => {
  /** QA P-D1 — with Auto off every row read ₹0.00 and nothing said what it could
   *  take: `payments.alloc.max` existed and was never rendered. */
  const user = userEvent.setup();
  renderWithProviders(<PaymentFormDrawer context={context} onClose={jest.fn()} />);
  await screen.findByTestId('alloc-picker');
  await user.click(screen.getByRole('switch', { name: /Auto — oldest first/ }));
  expect(screen.getAllByText('Max ₹898.00')).toHaveLength(2);
  await user.click(screen.getByRole('button', { name: 'Fill ₹898.00 against INV/26-27/0040' }));
  expect(screen.getByRole('textbox', { name: 'Amount against INV/26-27/0040' })).toHaveValue(
    '898.00'
  );
  // ₹1,000 − ₹898 leaves ₹102 for the newer bill.
  await user.click(screen.getByRole('button', { name: 'Fill ₹102.00 against INV/26-27/0042' }));
  expect(screen.getByRole('textbox', { name: 'Amount against INV/26-27/0042' })).toHaveValue(
    '102.00'
  );
  expect(screen.queryByRole('button', { name: /^Fill ₹/ })).not.toBeInTheDocument();
});

it('P-D6: "Fill remaining" on a split works to the amount set, not the receivable', async () => {
  /** QA P-D6 — ₹700 typed against a ₹1,000 receivable, then "Add mode" and ₹500
   *  on PhonePe: line 1's "Fill remaining" offered ₹500 (the receivable less ₹500)
   *  instead of ₹200 (the ₹700 being split, less ₹500). */
  const user = userEvent.setup();
  renderWithProviders(<PaymentFormDrawer context={context} onClose={jest.fn()} />);
  await screen.findByTestId('alloc-picker');
  const first = document.querySelector<HTMLInputElement>('input[name="lines.0.amount"]');
  if (!first) throw new Error('no first line');
  await user.clear(first);
  await user.type(first, '700');
  await user.click(screen.getByRole('button', { name: 'Add mode' }));
  const second = document.querySelector<HTMLInputElement>('input[name="lines.1.amount"]');
  if (!second) throw new Error('no second line');
  expect(second).toHaveValue('');
  await user.type(second, '500');
  await user.click(screen.getByRole('button', { name: 'Fill remaining ₹200.00' }));
  expect(first).toHaveValue('200.00');
});
