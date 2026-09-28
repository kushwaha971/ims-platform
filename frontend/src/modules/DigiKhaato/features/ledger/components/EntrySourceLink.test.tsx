import { screen } from '@testing-library/react';

import { renderWithProviders } from 'src/tests/renderWithProviders';

import { EntrySourceLink } from './EntrySourceLink';

const t = (id: string): string =>
  (
    ({
      'ledger.source.payment_in': 'Payment received',
      'ledger.source.invoice': 'Invoice',
      'ledger.source.void': 'Void',
      'ledger.source.missing': 'Document not found',
    }) as Record<string, string>
  )[id] ?? id;

/**
 * T-LED-10-8 — a document's khata line names its kind and links its number back
 * to the document; a voided document says so; a missing one links nowhere.
 */
it('links a receipt row to its receipt and marks it void', () => {
  renderWithProviders(
    <EntrySourceLink
      t={t}
      source={{
        type: 'payment',
        id: 'pay-1',
        number: 'RCT/26-27/0017',
        status: 'void',
        kind: 'payment_in',
      }}
    />
  );
  expect(screen.getByText('Payment received')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'RCT/26-27/0017' })).toHaveAttribute(
    'href',
    '/payments/pay-1'
  );
  expect(screen.getByText('Void')).toBeInTheDocument();
});

it('says "Document not found" and draws no link when the resolver found nothing', () => {
  renderWithProviders(
    <EntrySourceLink
      t={t}
      source={{ type: 'sales_document', id: 'x', number: null, status: null, kind: null }}
    />
  );
  expect(screen.getByText('Document not found')).toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
