import { screen, within } from '@testing-library/react';

import { renderWithProviders } from 'src/tests/renderWithProviders';

import { DepositHeldBlock } from './DepositHeldBlock';
import { StatementPrintView, type StatementPrintViewProps } from './print/StatementPrintView';

import type { StatementDeposit } from '../types/statement.types';

/**
 * A2 (FRD 00 PLT-X01, T-PLT-X01-12) — the statement's "Deposit held" block.
 *
 * The defect it prevents: a deposit printed as an ordinary "You got ₹1,500" row on the
 * statement a customer is handed, which tells them their bill was paid by money the
 * shop is holding for them and must give back. The block says what the money is, keeps
 * it neutral, and says it is not part of the balance.
 */
const deposit: StatementDeposit = {
  rows: [
    {
      id: 'd1',
      entryDate: '2026-04-02',
      entryType: 'payment_in',
      direction: 'credit',
      amount: '1500.00',
      note: '',
      status: 'posted',
      source: null,
      reversesId: null,
      supersedesId: null,
      reason: null,
      bucket: 'deposit',
    },
    {
      id: 'd2',
      entryDate: '2026-05-02',
      entryType: 'payment_out',
      direction: 'debit',
      amount: '300.00',
      note: '',
      status: 'posted',
      source: null,
      reversesId: null,
      supersedesId: null,
      reason: null,
      bucket: 'deposit',
    },
  ],
  held: '1200.00',
};

describe('DepositHeldBlock', () => {
  it('names the money for what it is and says it is outside the balance', () => {
    renderWithProviders(<DepositHeldBlock deposit={deposit} />);
    const block = within(screen.getByTestId('statement-deposit-block'));

    expect(block.getByText('Deposit held')).toBeInTheDocument();
    expect(block.getByText('Not part of the balance above')).toBeInTheDocument();
    // Neutral words, never "You got" / "You gave" (PLT-X01 §8).
    expect(block.getByText('Deposit received')).toBeInTheDocument();
    expect(block.getByText('Deposit returned')).toBeInTheDocument();
    expect(block.queryByText(/You got|You gave/)).not.toBeInTheDocument();
    // Grouped the Indian way, through the one formatter.
    expect(block.getByText('₹1,200.00')).toBeInTheDocument();
  });

  it('paints a deposit neither red nor green', () => {
    renderWithProviders(<DepositHeldBlock deposit={deposit} />);
    const block = screen.getByTestId('statement-deposit-block');

    expect(block.querySelector('.text-error')).toBeNull();
    expect(block.querySelector('.text-success')).toBeNull();
  });
});

describe('the printed statement', () => {
  const base: StatementPrintViewProps = {
    party: { id: 'p1', name: 'Ramesh Traders', mobileMasked: null },
    period: { from: null, to: null },
    summary: {
      openingBalance: '0.00',
      closingBalance: '600.00',
      totalDebit: '1000.00',
      totalCredit: '400.00',
      hasEntriesBeforeOpening: false,
    },
    rows: [],
    shopName: 'Kumar Store',
    generatedAt: '2026-09-24T10:00:00+05:30',
  };

  it('prints the deposit block when the period has one', () => {
    renderWithProviders(<StatementPrintView {...base} summary={{ ...base.summary, deposit }} />);

    expect(screen.getByTestId('statement-deposit-block')).toBeInTheDocument();
  });

  it('prints no deposit block for a statement without deposits — today, every one', () => {
    renderWithProviders(<StatementPrintView {...base} />);

    expect(screen.queryByTestId('statement-deposit-block')).not.toBeInTheDocument();
  });

  it('says an adjustment was adjusted, not returned (Wave A gate)', () => {
    /* The statement a customer is handed said "Deposit returned ₹120" for money
       the shop applied to their fine: the out line of an adjustment was labelled
       by its direction alone. The payment source now marks it. */
    const [received, out] = deposit.rows;
    if (!received || !out) throw new Error('fixture has two rows');
    const adjusted: StatementDeposit = {
      rows: [
        received,
        {
          ...out,
          amount: '120.00',
          source: { type: 'payment', id: 'p9', number: 'PAYOUT/26-27/0001', adjustment: true },
        },
      ],
      held: '1380.00',
    };
    renderWithProviders(<DepositHeldBlock deposit={adjusted} />);
    const block = within(screen.getByTestId('statement-deposit-block'));
    expect(block.getByText('Adjusted from deposit')).toBeInTheDocument();
    expect(block.queryByText('Deposit returned')).not.toBeInTheDocument();
  });
});
