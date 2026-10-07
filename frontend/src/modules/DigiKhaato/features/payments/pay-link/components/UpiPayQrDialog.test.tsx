import { screen } from '@testing-library/react';

import { renderWithProviders } from 'src/tests/renderWithProviders';

import { UpiPayQrDialog } from './UpiPayQrDialog';

/**
 * Shop P0 — the desk's UPI QR. What these protect: the QR is asked for with exactly the
 * amount and reference the page holds; a business with no UPI ID is told where to add
 * one instead of seeing an error; and Share and Copy link exist only once there is a
 * link to share.
 */
jest.mock('../api/payLinkService');
const service = jest.requireMock('../api/payLinkService') as { createPayLink: jest.Mock };

it('draws the QR for the amount and offers Share and Copy link', async () => {
  service.createPayLink.mockResolvedValue({
    url: 'http://localhost:3000/pay/abc',
    upiUrl: 'upi://pay?pa=room@okhdfc&am=900.00&cu=INR',
    vpa: 'room@okhdfc',
    amount: '900.00',
    note: 'Payment to Vidya Reading Room',
    qrModules: Array.from({ length: 21 }, () => '10'.repeat(10) + '1'),
  });
  renderWithProviders(
    <UpiPayQrDialog
      amount="900.00"
      reference="LIB-7"
      title="Pay the fee by UPI"
      onClose={jest.fn()}
    />
  );
  expect(await screen.findByTestId('pay-link-qr')).toHaveTextContent('₹900.00');
  expect(service.createPayLink).toHaveBeenCalledWith('900.00', 'LIB-7');
  expect(screen.getByTestId('pay-link-share')).toBeInTheDocument();
  expect(screen.getByTestId('pay-link-copy')).toBeInTheDocument();
});

it('sends a business with no UPI ID to its profile', async () => {
  service.createPayLink.mockRejectedValue({
    code: 'upi_not_configured',
    message: 'Add your UPI ID',
    details: {},
    requestId: null,
    status: 409,
    warnings: [],
  });
  renderWithProviders(
    <UpiPayQrDialog amount="10.00" reference="" title="UPI QR" onClose={jest.fn()} />
  );
  expect(
    await screen.findByText('Add your UPI ID in Business profile to show a QR.')
  ).toBeInTheDocument();
  expect(screen.queryByTestId('pay-link-share')).not.toBeInTheDocument();
});
