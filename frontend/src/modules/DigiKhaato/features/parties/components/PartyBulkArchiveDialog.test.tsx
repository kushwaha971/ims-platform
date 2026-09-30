import { screen } from '@testing-library/react';

import { useTranslation } from 'src/hooks/useTranslation';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { PartyBulkArchiveDialog } from './PartyBulkArchiveDialog';

import type { BulkArchiveResult } from '../api/partyService';

/**
 * A6 (PLT-X04 BR-4) — the bulk archive's skip report. A party a module's guard
 * refused is named with the module's reason and the number; a party that was
 * already archived says so, rather than "₹0.00 still to collect".
 */
function Harness({ result }: Readonly<{ result: BulkArchiveResult }>): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <PartyBulkArchiveDialog
      t={t}
      open
      count={3}
      saving={false}
      result={result}
      onConfirm={() => undefined}
      onClose={() => undefined}
    />
  );
}

it('names why each party was left alone', async () => {
  renderWithProviders(
    <Harness
      result={{
        archived: ['p3'],
        skipped: [
          {
            id: 'p1',
            name: 'Mohan',
            code: 'party_has_open_records',
            balance: '0.00',
            module: 'parties',
            count: 1,
            label_id: 'parties.archive.activeGuardian',
          },
          { id: 'p2', name: 'Sita', code: 'party_already_archived', balance: '0.00' },
        ],
      }}
    />
  );

  expect(
    await screen.findByText(
      'Mohan is the guardian of 1 active party. Remove the link, or archive that party first.'
    )
  ).toBeInTheDocument();
  expect(screen.getByText('Sita — already archived')).toBeInTheDocument();
  expect(screen.queryByText(/still to collect/)).not.toBeInTheDocument();
});
