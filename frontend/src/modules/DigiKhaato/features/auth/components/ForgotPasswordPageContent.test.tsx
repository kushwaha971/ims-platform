import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { store } from 'src/redux/store';
import { en, hi } from 'src/tests/allMessages';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { resetAuth } from '../redux/authSlice';

import { ForgotPasswordPageContent } from './ForgotPasswordPageContent';

/**
 * PLT-02 FR-4 / BR-2 — the one behaviour this screen exists to get right is
 * that it says the SAME thing about an address somebody has and an address
 * nobody has. Everything below is a way of pinning that down so it cannot be
 * lost to a well-meant copy change.
 */
jest.mock('../api/authService');

const authService = jest.requireMock('../api/authService') as {
  requestPasswordReset: jest.Mock;
  getSession: jest.Mock;
};

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/forgot-password',
}));

const submit = async (user: ReturnType<typeof userEvent.setup>, email: string) => {
  await user.type(screen.getByLabelText(/Email address/), email);
  await user.click(screen.getByRole('button', { name: 'Send reset link' }));
};

beforeEach(() => {
  store.dispatch(resetAuth());
  jest.clearAllMocks();
  authService.requestPasswordReset.mockResolvedValue(undefined);
});

describe('ForgotPasswordPageContent — §9 Initial', () => {
  it('asks for an email address, not a mobile number', () => {
    renderWithProviders(<ForgotPasswordPageContent />);

    expect(screen.getByLabelText(/Email address/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Mobile/i)).not.toBeInTheDocument();
  });

  it('refuses a malformed address before it reaches the wire', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordPageContent />);

    await submit(user, 'ramesh');

    expect(await screen.findByText(en['validation.email.format'] as string)).toBeInTheDocument();
    expect(authService.requestPasswordReset).not.toHaveBeenCalled();
  });
});

describe('ForgotPasswordPageContent — FR-4 / BR-2, the non-revealing answer', () => {
  it('says the same thing for a registered and an unregistered address', async () => {
    const user = userEvent.setup();

    const { unmount } = renderWithProviders(<ForgotPasswordPageContent />);
    await submit(user, 'ramesh@example.com');
    const known = (await screen.findByRole('status')).textContent;
    unmount();

    store.dispatch(resetAuth());
    renderWithProviders(<ForgotPasswordPageContent />);
    await submit(user, 'nobody@example.com');
    const unknown = (await screen.findByRole('status')).textContent;

    expect(known).toBe(unknown);
  });

  it('hedges the sentence — "if that address is registered"', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordPageContent />);

    await submit(user, 'ramesh@example.com');

    expect(
      await screen.findByText(/If that address is registered, a reset link has been created/)
    ).toBeInTheDocument();
  });

  /**
   * At MVP the mail backend is Django's console backend: the link is written to
   * the server log. Saying "check your inbox" would send a merchant to refresh
   * a mailbox nothing will ever arrive in.
   */
  it('does not promise an email that will not arrive', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordPageContent />);

    await submit(user, 'ramesh@example.com');
    await screen.findByRole('status');

    expect(screen.queryByText(/inbox/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/check your (e-?mail|mail)/i)).not.toBeInTheDocument();
    // It says where the link actually is instead.
    expect(screen.getByText(/written to the server log/i)).toBeInTheDocument();
  });

  it('hides the form once the request is in, and can be reopened', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordPageContent />);

    await submit(user, 'ramesh@example.com');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Send reset link' })).not.toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: 'Use a different address' }));
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeInTheDocument();
  });
});

describe('ForgotPasswordPageContent — Hindi', () => {
  it('hedges in Hindi too', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ForgotPasswordPageContent />, {
      locale: 'hi',
      messages: hi as Record<string, string>,
    });

    await user.type(screen.getByLabelText(/ईमेल पता/), 'ramesh@example.com');
    await user.click(screen.getByRole('button', { name: 'रीसेट लिंक भेजें' }));

    expect(await screen.findByText(hi['auth.password.reset.sent'] as string)).toBeInTheDocument();
  });
});
