import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from 'src/tests/renderWithProviders';

import { ApplyAdvanceDialog } from './ApplyAdvanceDialog';

import type { OpenDocument, Payment } from '../types/payment.types';

/**
 * A4a (T-PLT-X03-9's screen half) — Apply to bills opens pre-filled oldest first, says what stays
 * as advance, refuses a row above its bill's due before the server is asked, and hands the
 * rows to the page on Apply.
 */
const payment = {
  id: 'pay1',
  number: 'RCT/26-27/0090',
  direction: 'in',
  party: { id: 'p1', name: 'Ramesh Traders', mobile: null },
  status: 'recorded',
  unallocatedAmount: '3000.00',
  allocations: [],
} as unknown as Payment;

const invoice: OpenDocument = {
  documentType: 'sales_document',
  documentId: 'inv1',
  number: 'INV/26-27/0311',
  documentDate: '2026-10-12',
  dueOn: null,
  grandTotal: '1770.00',
  amountDue: '1770.00',
  status: 'issued',
};

const renderDialog = (onConfirm = jest.fn(), onLoad = jest.fn()) =>
  renderWithProviders(
    <ApplyAdvanceDialog
      payment={payment}
      documents={[invoice]}
      status="succeeded"
      busy={false}
      errors={[]}
      onLoad={onLoad}
      onClose={jest.fn()}
      onConfirm={onConfirm}
    />
  );

describe('ApplyAdvanceDialog', () => {
  it('asks for its documents when it opens', () => {
    const onLoad = jest.fn();
    renderDialog(jest.fn(), onLoad);
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it('opens pre-filled and says what stays as advance', async () => {
    renderDialog();
    await waitFor(() =>
      expect(screen.getByTestId('apply-footer')).toHaveTextContent(
        'Applying ₹1,770.00 · ₹1,230.00 stays as advance'
      )
    );
  });

  it('hands the rows to the page on Apply', async () => {
    const onConfirm = jest.fn();
    renderDialog(onConfirm);
    await waitFor(() => expect(screen.getByTestId('apply-footer')).toHaveTextContent('1,770.00'));
    await userEvent.click(screen.getByTestId('payment-apply-confirm'));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ documentId: 'inv1', amount: '1770.00' }),
    ]);
  });

  it('refuses a row above the bill’s due without asking the server', async () => {
    const onConfirm = jest.fn();
    renderDialog(onConfirm);
    const input = await screen.findByRole('textbox', { name: /INV\/26-27\/0311/ });
    await userEvent.clear(input);
    await userEvent.type(input, '1800');
    await userEvent.click(screen.getByTestId('payment-apply-confirm'));
    expect(await screen.findByText('Max ₹1,770.00')).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
