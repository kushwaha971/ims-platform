import { screen } from '@testing-library/react';

import { useTranslation } from 'src/hooks/useTranslation';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { PartyInfoPanel } from './PartyInfoPanel';

import type { PartyDetail } from '../types/party.types';

/**
 * A2 (T-PLT-X01-12) — the info panel's loan and deposit lines.
 *
 * The defect prevented: a "Loan left ₹0.00" line on every shop party's khata, a
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
    expect(screen.queryByText(/Loan left|Deposit held|Shop balance/)).not.toBeInTheDocument();
  });

  /**
   * DEC-019 (QA B3/B9) — the udhaar book's page shows no other app's money: a loan, a
   * Shop bill, a library fee or a deposit is read on its own app's page. A Shop balance
   * arriving on the payload draws nothing here.
   */
  it('shows no other app’s money even when the payload carries the Shop figure', () => {
    renderWithProviders(<Harness party={{ ...base, shopBalance: '2300.00' }} />);

    expect(screen.queryByText('Balances')).not.toBeInTheDocument();
    expect(screen.queryByText('₹2,300.00')).not.toBeInTheDocument();
  });
});
