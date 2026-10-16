import { fireEvent, screen, waitFor } from '@testing-library/react';

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

describe('WP-04 M-11: the words that go with the QR are the merchant’s', () => {
  const LINK = {
    url: 'http://localhost:3000/pay/abc',
    upiUrl: 'upi://pay?pa=room@okhdfc&am=900.00&cu=INR',
    vpa: 'room@okhdfc',
    amount: '900.00',
    note: 'Payment to Vidya Reading Room',
    qrModules: Array.from({ length: 21 }, () => '10'.repeat(10) + '1'),
  };
  const original = { share: navigator.share, canShare: navigator.canShare };
  afterEach(() => Object.assign(navigator, original));

  it('shares exactly the edited words, and refuses a blank message', async () => {
    /* Prevents: the share text being fixed — the payer received words the
       merchant could not read or change before the phone's sheet took them. */
    service.createPayLink.mockResolvedValue(LINK);
    const share = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share, canShare: () => false });
    renderWithProviders(
      <UpiPayQrDialog amount="900.00" reference="LIB-7" title="UPI QR" onClose={jest.fn()} />
    );
    const box = await screen.findByRole('textbox', { name: 'Message' });
    expect(box).toHaveValue(
      'Pay ₹900.00 by UPI: scan this QR or open http://localhost:3000/pay/abc'
    );

    fireEvent.change(box, { target: { value: 'Asha ji, fee ₹900 — scan karke bhej do 🙏' } });
    fireEvent.click(screen.getByTestId('pay-link-share'));
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        text: 'Asha ji, fee ₹900 — scan karke bhej do 🙏',
        url: LINK.url,
      })
    );

    fireEvent.change(box, { target: { value: '  ' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Write a message before sending.');
    expect(screen.getByTestId('pay-link-share')).toBeDisabled();
    // Copy link carries no words, so it stays.
    expect(screen.getByTestId('pay-link-copy')).toBeEnabled();
  });
});
