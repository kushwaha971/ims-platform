import { fireEvent, screen } from '@testing-library/react';

import { renderWithProviders } from 'src/tests/renderWithProviders';

import { ManualChargeDialog, WaiveChargeDialog } from './ChargeDialogs';

import type { ChargeRow } from '../types/charge.types';

/**
 * WP-03 D-01 — the "Dues after this" line is worked out while the librarian is
 * still typing. It used to be `Number(dues) ± Number(amount)`, so a half-typed
 * amount such as "." became NaN, and `formatInr("NaN")` threw inside render —
 * the dialog the librarian was typing into disappeared. The figure now goes
 * through `utils/money.ts`, which reads an unfinished amount as nothing.
 */
const charge: ChargeRow = {
  id: 'c1',
  membershipId: 'm1',
  partyId: 'p1',
  number: 'LC-1',
  kind: 'fee',
  amount: '500.00',
  chargeDate: '2026-10-01',
  description: 'October fee',
  fineDays: null,
  amountPaid: '0.00',
  waivedAmount: '0.00',
  refundedAmount: '0.00',
  amountDue: '500.00',
  status: 'due',
  reversedAt: null,
};

const amountBox = () => screen.getAllByRole('textbox')[0] as HTMLInputElement;

describe('charge dialogs: dues after the change', () => {
  it('waiving shows what is left and survives a half-typed amount', () => {
    renderWithProviders(
      <WaiveChargeDialog
        charge={charge}
        dues="700.00"
        busy={false}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />
    );
    expect(screen.getByTestId('charge-waive-after')).toHaveTextContent('₹200.00');
    fireEvent.change(amountBox(), { target: { value: '.' } });
    expect(screen.getByTestId('charge-waive-after')).toHaveTextContent('₹700.00');
    fireEvent.change(amountBox(), { target: { value: '900' } });
    // Never below nothing owed.
    expect(screen.getByTestId('charge-waive-after')).toHaveTextContent('₹0.00');
  });

  it('a new charge adds to the dues, to the paisa', () => {
    renderWithProviders(
      <ManualChargeDialog dues="0.10" busy={false} onClose={jest.fn()} onSubmit={jest.fn()} />
    );
    fireEvent.change(amountBox(), { target: { value: '0.20' } });
    expect(screen.getByText(/₹0\.30/)).toBeInTheDocument();
  });
});
