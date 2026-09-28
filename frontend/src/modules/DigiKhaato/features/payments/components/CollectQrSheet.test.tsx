import { act, screen } from '@testing-library/react';

import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { fetchCollectQr } from '../redux/paymentThunk';

import { CollectQrSheet } from './CollectQrSheet';

jest.mock('../api/paymentService', () => ({
  ...jest.requireActual('../api/paymentService'),
  createUpiIntent: jest.fn(() => new Promise(() => undefined)),
}));

it('P-D6: "no UPI ID" guidance links to Business profile, where the ID is added', () => {
  /* QA P-D6 — the banner said "Add your UPI ID in Business profile" and offered
     no way there, on the sheet a merchant opens with a customer waiting. */
  renderWithProviders(
    <CollectQrSheet
      partyId="p1"
      partyName="Ramesh Traders"
      receivable="500.00"
      onClose={jest.fn()}
      onMarkReceived={jest.fn()}
    />
  );
  act(() => {
    store.dispatch(
      fetchCollectQr.rejected(null, 'r1', { amount: '500.00', partyId: 'p1' }, {
        code: 'upi_vpa_missing',
        message: 'No UPI ID',
      } as never)
    );
  });
  expect(screen.getByText('Add your UPI ID in Business profile to show a QR')).toBeInTheDocument();
  expect(screen.getByTestId('upi-open-profile')).toHaveAttribute('href', '/settings/profile');
});
