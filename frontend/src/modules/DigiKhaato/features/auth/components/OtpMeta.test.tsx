import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetSession } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { resetAuth } from '../redux/authSlice';

import { OtpSignInPageContent } from './OtpSignInPageContent';

jest.mock('src/constants', () => ({
  ...jest.requireActual('src/constants'),
  OTP_USES_META: true,
}));
jest.mock('../api/authService');
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/login',
}));
const service = jest.requireMock('../api/authService') as {
  requestOtp: jest.Mock;
  verifyOtp: jest.Mock;
};

it('identifies the YourKhata sender before requesting a code and verifies all six digits', async () => {
  store.dispatch(resetSession());
  store.dispatch(resetAuth());
  service.requestOtp.mockResolvedValue({
    challengeId: 'moth-1',
    expiresIn: 600,
    retryAfter: 60,
    codeLength: 6,
    channel: 'whatsapp',
  });
  service.verifyOtp.mockRejectedValue({
    code: 'otp_invalid',
    details: { reason: 'incorrect', attempts_left: 4 },
  });
  const user = userEvent.setup();
  renderWithProviders(<OtpSignInPageContent mode="signIn" />);
  expect(screen.getByText(/YourKhata will send a 6-digit/)).toBeInTheDocument();
  expect(screen.getByText(/Only enter this code on yourkhata.com/)).toBeInTheDocument();
  await user.type(screen.getByRole('textbox', { name: /Mobile number/ }), '9794620535');
  await user.click(screen.getByRole('button', { name: 'Send code' }));
  await screen.findByRole('heading', { name: 'Enter the code' });
  expect(screen.getByText(/Check WhatsApp for the 6-digit code from YourKhata/)).toBeInTheDocument();
  screen.getByLabelText('Digit 1 of 6').focus();
  await user.paste('932234');
  await waitFor(() =>
    expect(service.verifyOtp).toHaveBeenCalledWith(
      expect.objectContaining({ challengeId: 'moth-1', code: '932234' })
    )
  );
});
