import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import en from 'locales/en.json';

import { resetAuth } from '../redux/authSlice';

import { ResetPasswordPageContent } from './ResetPasswordPageContent';

/**
 * PLT-02 FR-5 — the second half of the reset, reached by the link. The token
 * arrives in the query string, so the search params are what this suite varies.
 */
jest.mock('../api/authService');

const authService = jest.requireMock('../api/authService') as {
  confirmPasswordReset: jest.Mock;
  getSession: jest.Mock;
};

const replace = jest.fn();
let search = 'token=rst_abc123';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace, back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => '/reset-password',
}));

const SESSION = {
  userId: 'u1',
  name: 'Ramesh',
  email: 'ramesh@example.com',
  mobile: null,
  locale: 'en',
  isNew: false,
  hasPassword: true,
  activeTenantId: 't1',
  tenants: [
    {
      id: 't1',
      name: 'Sharma',
      timezone: 'Asia/Kolkata',
      role: 'owner',
      isDefault: true,
      status: 'active',
      membershipId: 'm1',
      onboardingStep: 4,
    },
  ],
  permissions: [],
  enabledModules: [],
};

const fill = async (user: ReturnType<typeof userEvent.setup>, password = 'kirana2026') => {
  await user.type(screen.getByLabelText(/New password/, { selector: 'input' }), password);
  await user.type(screen.getByLabelText(/Confirm password/, { selector: 'input' }), password);
};

beforeEach(() => {
  store.dispatch(resetAuth());
  jest.clearAllMocks();
  search = 'token=rst_abc123';
  authService.getSession.mockResolvedValue({
    user: { id: 'u1', name: 'Ramesh', email: 'ramesh@example.com', mobile: null, locale: 'en' },
    activeTenant: null,
    tenants: [],
    permissions: [],
    enabledModules: [],
    version: null,
  });
});

describe('ResetPasswordPageContent — the link token', () => {
  it('sends the token from the URL with the new password', async () => {
    const user = userEvent.setup();
    authService.confirmPasswordReset.mockResolvedValue(SESSION);

    renderWithProviders(<ResetPasswordPageContent />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Set new password' }));

    await waitFor(() => expect(authService.confirmPasswordReset).toHaveBeenCalledTimes(1));
    expect(authService.confirmPasswordReset).toHaveBeenCalledWith({
      token: 'rst_abc123',
      newPassword: 'kirana2026',
    });
    // FR-5 — the confirm ends in a session, so the user lands in the app.
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
  });

  /** The token is a credential for one request; it never appears on screen. */
  it('never echoes the token', () => {
    renderWithProviders(<ResetPasswordPageContent />);
    expect(screen.queryByText(/rst_abc123/)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(/rst_abc123/)).not.toBeInTheDocument();
  });

  it('asks for a new link rather than a broken form when the token is missing', () => {
    search = '';
    renderWithProviders(<ResetPasswordPageContent />);

    expect(screen.getByText(en['auth.password.reset.noToken.title'] as string)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Send reset link' })).toHaveAttribute(
      'href',
      '/forgot-password'
    );
    expect(screen.queryByLabelText(/New password/)).not.toBeInTheDocument();
  });
});

describe('ResetPasswordPageContent — §9 Error', () => {
  it('applies the same ten-character floor as sign-up', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ResetPasswordPageContent />);

    await fill(user, 'kirana202');
    await user.click(screen.getByRole('button', { name: 'Set new password' }));

    expect(await screen.findByText(/at least 10 characters/i)).toBeInTheDocument();
    expect(authService.confirmPasswordReset).not.toHaveBeenCalled();
  });

  /**
   * A spent or expired token has no field to sit under — the user cannot fix it
   * by editing anything on this screen — so it is the banner, with the way out
   * beneath it.
   */
  it('shows a spent token as a banner, not as a field error', async () => {
    const user = userEvent.setup();
    authService.confirmPasswordReset.mockRejectedValue({
      code: 'invalid_token',
      message: 'Your session is not valid. Please sign in again.',
      details: {},
      requestId: 'req_7f3a91',
      status: 401,
      warnings: [],
    });

    renderWithProviders(<ResetPasswordPageContent />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Set new password' }));

    expect(
      await screen.findByText('Your session is not valid. Please sign in again.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to log in' })).toBeInTheDocument();
  });

  it("anchors the server's password policy under the password field", async () => {
    const user = userEvent.setup();
    authService.confirmPasswordReset.mockRejectedValue({
      code: 'validation_error',
      message: 'Please check the highlighted fields.',
      details: { password: ['Choose a less common password.'] },
      requestId: 'req_7f3a91',
      status: 400,
      warnings: [],
    });

    renderWithProviders(<ResetPasswordPageContent />);
    await fill(user, 'password12');
    await user.click(screen.getByRole('button', { name: 'Set new password' }));

    const message = await screen.findByText('Choose a less common password.');
    expect(message).toHaveAttribute('id', 'password-error');
  });
});
