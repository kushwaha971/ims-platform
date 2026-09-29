import { screen } from '@testing-library/react';

import { useTranslation } from 'src/hooks/useTranslation';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { PartyInfoPanel } from './PartyInfoPanel';

import type { PartyDetail } from '../types/party.types';

/**
 * A2 (T-PLT-X01-12) — the info panel's loan and deposit lines.
 *
 * The defect prevented: a "Loan outstanding ₹0.00" line on every shop party's khata, a
 * claim about lending on a product that has not lent anything. The lines appear only
 * when the server sends the figures, in their words and tones.
 */
const base = {
  id: 'p1',
  name: 'Ramesh Traders',
  balance: '48925.00',
  mobile: null,
  altPhone: null,
  email: null,
  gstin: null,
  gstRegistration: 'unregistered',
  stateCode: null,
  notes: '',
  collectionDate: null,
  creditLimit: null,
  creditDays: null,
  smsOptIn: true,
  consentSource: null,
  billingAddress: {},
  openingAmount: null,
  openingDirection: null,
  openingAsOf: null,
  createdAt: '2026-04-01T10:00:00+05:30',
} as unknown as PartyDetail;

function Harness({ party }: Readonly<{ party: PartyDetail }>): React.JSX.Element {
  const { t } = useTranslation();
  return <PartyInfoPanel t={t} party={party} addedOn={null} lastActivity={null} />;
}

describe('PartyInfoPanel balances', () => {
  it('has no balances section for a shop party', () => {
    renderWithProviders(<Harness party={base} />);

    expect(screen.queryByText('Balances')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Loan outstanding|Deposit held|Shop balance/)
    ).not.toBeInTheDocument();
  });

  it('shows the loan, the shop balance and the deposit with their words', () => {
    renderWithProviders(
      <Harness
        party={{
          ...base,
          loanBalance: '46625.00',
          tradeBalance: '2300.00',
          depositHeld: '1000.00',
        }}
      />
    );

    expect(screen.getByText('Balances')).toBeInTheDocument();
    expect(screen.getAllByText('Loan outstanding').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Shop balance').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Deposit held').length).toBeGreaterThan(0);
    expect(screen.getByText('₹46,625.00')).toBeInTheDocument();
    expect(screen.getByText('₹2,300.00')).toBeInTheDocument();
    expect(screen.getByText('₹1,000.00')).toBeInTheDocument();
  });
});
