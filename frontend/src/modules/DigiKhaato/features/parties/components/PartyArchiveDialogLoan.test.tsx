import { screen } from '@testing-library/react';

import { useTranslation } from 'src/hooks/useTranslation';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { blockedFromDetails } from '../hooks/usePartyArchive';

import { PartyArchiveDialog } from './PartyArchiveDialog';

/**
 * LED-11's cap on the screen (CR-2026-09-30-LED-11, Wave A gate).
 *
 * The gate's look pass: a party owing ₹300 to the shop and ₹2,000 on a loan
 * was offered "Write off ₹2,300.00" — the whole balance, loan included, which
 * is the one thing the cap exists to keep off a shop screen. The server capped
 * it (a confirmation of ₹2,300 is 409 `balance_changed`), but the offer was
 * made; and with a loan open no shop write-off lets the archive through
 * (EC-7), so the button led nowhere. The refusal now says `can_write_off:
 * false`, and the dialog offers only Record payment, with the reason.
 */
function Harness({ details }: Readonly<{ details: Record<string, unknown> }>): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <PartyArchiveDialog
      t={t}
      name="Vikram Loans"
      stage="blocked"
      blocked={blockedFromDetails(details as Record<string, string>)}
      error={null}
      onConfirm={jest.fn()}
      onClose={jest.fn()}
      canWriteOff
      onStartWriteOff={jest.fn()}
      onRecordPayment={jest.fn()}
    />
  );
}

describe('the archive refusal with a loan open', () => {
  it('offers no write-off, and says why', () => {
    renderWithProviders(
      <Harness
        details={{
          balance: '2300.00',
          balance_label: 'receivable',
          suggestion: 'collect',
          can_write_off: false,
          amount: '300.00',
        }}
      />
    );
    expect(screen.queryByRole('button', { name: /Write off/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Part of this is a loan/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record payment' })).toBeInTheDocument();
  });

  it('still offers the write-off of the whole balance when there is no loan', () => {
    renderWithProviders(
      <Harness
        details={{ balance: '300.00', balance_label: 'receivable', suggestion: 'write_off' }}
      />
    );
    expect(screen.getByRole('button', { name: 'Write off ₹300.00' })).toBeInTheDocument();
  });
});
