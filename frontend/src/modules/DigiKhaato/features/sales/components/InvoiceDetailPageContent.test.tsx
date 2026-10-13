import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UbDialog } from 'src/design-system';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { InvoiceDetailPageContent } from './InvoiceDetailPageContent';

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('src/hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasModule: () => true,
    can: (code: string) => ['sales.invoice.read', 'payments.payment.write'].includes(code),
  }),
}));
jest.mock('../hooks/useInvoiceDetail', () => ({
  useInvoiceDetail: () => ({
    status: 'succeeded',
    document: {
      id: 'invoice1',
      number: 'INV/1',
      kind: 'invoice',
      status: 'issued',
      party: { id: 'party1', name: 'Ramesh' },
      partySnapshot: null,
      documentDate: '2026-10-13',
      grandTotal: '100.00',
      amountDue: '100.00',
      payments: [],
      origin: null,
    },
    reload: jest.fn(),
    print: jest.fn(),
    share: jest.fn(),
    sharing: false,
    shareLink: null,
  }),
}));
jest.mock('./DocumentActions', () => ({ DocumentActions: () => null }));
jest.mock('./DocumentLinksPanel', () => ({ DocumentLinksPanel: () => null }));
jest.mock('./print/InvoicePrintSheet', () => ({ InvoicePrintSheet: () => null }));
jest.mock('../../payments/components/PaymentFormDrawer', () => ({
  PaymentFormDrawer: () => (
    <UbDialog
      open
      onOpenChange={jest.fn()}
      title="Record payment form"
      closeLabel="Close payment"
    />
  ),
}));

it('B37 keeps the phone payment form open after its More actions sheet closes', async () => {
  // A launcher inside the sheet must not own a drawer destroyed with that sheet.
  window.matchMedia = jest
    .fn()
    .mockImplementation((query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));
  const user = userEvent.setup();
  renderWithProviders(<InvoiceDetailPageContent id="invoice1" />);
  await user.click(screen.getByRole('button', { name: 'More actions' }));
  const sheet = await screen.findByRole('dialog', { name: 'More actions' });
  await user.click(within(sheet).getByRole('button', { name: 'Record payment' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'More actions' })).not.toBeInTheDocument()
  );
  expect(await screen.findByRole('dialog', { name: 'Record payment form' })).toBeVisible();
});
