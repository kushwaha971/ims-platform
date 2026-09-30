import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from 'src/tests/renderWithProviders';

import { ApplyDepositDialog } from './ApplyDepositDialog';

import type { Deposit, DepositCharge } from '../types/deposit.types';

/**
 * T-PLT-X02-11 (screen half) — "Adjust from deposit" opens pre-filled from what
 * is held, says what that leaves held, refuses a total above the held figure
 * before the server is asked, and hands the rows and reason to the caller.
 */
const deposit = {
  id: 'd1',
  party: { id: 'p1', name: 'Asha Rao' },
  purpose: 'Library deposit',
  heldAmount: '500.00',
  status: 'held',
  version: 2,
} as unknown as Deposit;

const fine: DepositCharge = {
  documentType: 'sales_document',
  documentId: 'inv1',
  number: 'INV/26-27/0120',
  due: '120.00',
};
const damage: DepositCharge = {
  documentType: 'sales_document',
  documentId: 'inv2',
  number: 'INV/26-27/0121',
  due: '800.00',
};

const renderDialog = (charges: DepositCharge[], onConfirm = jest.fn()) =>
  renderWithProviders(
    <ApplyDepositDialog
      deposit={deposit}
      charges={charges}
      busy={false}
      errors={[]}
      onClose={jest.fn()}
      onConfirm={onConfirm}
    />
  );

it('opens pre-filled and says what stays held', () => {
  renderDialog([fine]);
  expect(screen.getByTestId('deposit-apply-footer')).toHaveTextContent(
    'Adjusting ₹120.00 · ₹380.00 still held'
  );
});

it('caps the pre-fill at what is held (EC-7: the rest stays owed)', () => {
  renderDialog([fine, damage]);
  expect(screen.getByTestId('deposit-apply-footer')).toHaveTextContent(
    'Adjusting ₹500.00 · ₹0.00 still held'
  );
});

it('refuses a total above what is held without asking the server', async () => {
  const onConfirm = jest.fn();
  const user = userEvent.setup();
  renderDialog([fine, damage], onConfirm);
  const input = screen.getByRole('textbox', { name: /INV\/26-27\/0121/ });
  await user.clear(input);
  await user.type(input, '400.00');
  await user.type(screen.getByRole('textbox', { name: /Reason/ }), 'Damage');
  await user.click(screen.getByTestId('deposit-apply-confirm'));
  expect(await screen.findByText('Only ₹500.00 is held.')).toBeInTheDocument();
  expect(onConfirm).not.toHaveBeenCalled();
});

it('hands the rows and the reason to the caller on Adjust', async () => {
  const onConfirm = jest.fn();
  const user = userEvent.setup();
  renderDialog([fine], onConfirm);
  await user.type(screen.getByRole('textbox', { name: /Reason/ }), 'Late return fine');
  await user.click(screen.getByTestId('deposit-apply-confirm'));
  await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  expect(onConfirm.mock.calls[0]?.[0]).toEqual({
    rows: [expect.objectContaining({ documentId: 'inv1', amount: '120.00' })],
    reason: 'Late return fine',
  });
});

it('says so when the vertical allows nothing to be paid, and offers no Adjust', () => {
  renderDialog([]);
  expect(screen.getByTestId('deposit-apply-none')).toBeInTheDocument();
  expect(screen.getByTestId('deposit-apply-confirm')).toBeDisabled();
});
