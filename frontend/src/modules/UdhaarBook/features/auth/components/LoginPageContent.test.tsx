import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import en from 'locales/en.json';
import hi from 'locales/hi.json';

import { resetAuth } from '../redux/authSlice';

import { LoginPageContent } from './LoginPageContent';

/**
 * PLT-02 + CR-2026-09-19-A, end to end inside the client (§19.13.3): route
 * content → hook → thunk → service → axios, with the service stubbed at the
 * module boundary. The backend is being built concurrently and may not be
 * listening; this proves the whole chain in-process rather than against it.
 *
 * It asserts the §9 states the screen owns — Initial, Loading, Error (field and
 * banner), Disabled (throttled) and Completed (the route change) — plus the
 * Hindi rendering of the same screen, because `hi` is a shipped locale and not
 * a placeholder.
 */
jest.mock('../api/authService');

const authService = jest.requireMock('../api/authService') as {
  passwordLogin: jest.Mock;
  getSession: jest.Mock;
};

const push = jest.fn();
const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/login',
}));

const apiError = (code: string, message: string, details: Record<string, string[]> = {}) => ({
  code,
  message,
  details,
  requestId: 'req_7f3a91',
  status: 400,
  warnings: [],
});

const AUTH_RESULT = {
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

beforeEach(() => {
  store.dispatch(resetAuth());
  jest.clearAllMocks();
  window.localStorage.clear();
  authService.getSession.mockResolvedValue({
    user: { id: 'u1', name: 'Ramesh', email: 'ramesh@example.com', mobile: null, locale: 'en' },
    activeTenant: null,
    tenants: [],
    permissions: [],
    enabledModules: [],
    version: null,
  });
});

describe('LoginPageContent — initial state', () => {
  it('shows the language picker first, then one email-and-password form', () => {
    renderWithProviders(<LoginPageContent />);

    // FR-8 — the picker is the first control, before any field.
    expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Email address/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/, { selector: 'input' })).toBeInTheDocument();
  });

  /** CR-2026-09-19-A — the two tabs and the mobile field left with the OTP flow. */
  it('offers no OTP tab and no mobile field', () => {
    renderWithProviders(<LoginPageContent />);

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Mobile/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Get code/i })).not.toBeInTheDocument();
  });

  it('shows the way to create an account, since nothing registers implicitly', () => {
    renderWithProviders(<LoginPageContent />);

    const link = screen.getByRole('link', { name: 'Create an account' });
    expect(link).toHaveAttribute('href', '/signup');
  });

  it('states that the service is for adult business use (BR-7)', () => {
    renderWithProviders(<LoginPageContent />);
    expect(screen.getByText(/For business use by adults/)).toBeInTheDocument();
  });
});

describe('LoginPageContent — PLT-02 log in', () => {
  it('logs in with an email and hands the routing to the redirect hook', async () => {
    const user = userEvent.setup();
    authService.passwordLogin.mockResolvedValue(AUTH_RESULT);

    renderWithProviders(<LoginPageContent />);
    await user.type(screen.getByLabelText(/Email address/), 'ramesh@example.com');
    await user.type(screen.getByLabelText(/^Password/, { selector: 'input' }), 'kirana2026');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(authService.passwordLogin).toHaveBeenCalledTimes(1));
    expect(authService.passwordLogin).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ramesh@example.com', password: 'kirana2026' })
    );
    // FR-9 — one active tenant with a finished wizard opens the app.
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
  });

  it('refuses a malformed address before it reaches the wire', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPageContent />);

    await user.type(screen.getByLabelText(/Email address/), 'ramesh');
    await user.type(screen.getByLabelText(/^Password/, { selector: 'input' }), 'kirana2026');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText(en['validation.email.format'] as string)).toBeInTheDocument();
    expect(authService.passwordLogin).not.toHaveBeenCalled();
  });

  it('anchors a 401 under the password field, with the generic message (AC-5)', async () => {
    const user = userEvent.setup();
    authService.passwordLogin.mockRejectedValue(
      apiError('invalid_credentials', 'Mobile number or password is incorrect.')
    );

    renderWithProviders(<LoginPageContent />);
    await user.type(screen.getByLabelText(/Email address/), 'nobody@example.com');
    await user.type(screen.getByLabelText(/^Password/, { selector: 'input' }), 'wrong12345');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    const message = await screen.findByText('Mobile number or password is incorrect.');
    expect(message).toHaveAttribute('id', 'password-error');
    // Never a banner: a banner would distinguish it from a wrong password, and
    // an unknown address must look exactly like a wrong one.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders a 429 as the throttle banner with a countdown, not as a toast', async () => {
    const user = userEvent.setup();
    authService.passwordLogin.mockRejectedValue(
      apiError('login_throttled', 'Too many attempts.', { retry_after: ['120'] })
    );

    renderWithProviders(<LoginPageContent />);
    await user.type(screen.getByLabelText(/Email address/), 'ramesh@example.com');
    await user.type(screen.getByLabelText(/^Password/, { selector: 'input' }), 'kirana2026');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Too many attempts. Try again in 2 min')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeDisabled();
  });

  it('shows a 500 as a banner carrying the request id (R-E-4)', async () => {
    const user = userEvent.setup();
    authService.passwordLogin.mockRejectedValue({
      ...apiError('server_error', 'Something went wrong.'),
      status: 500,
    });

    renderWithProviders(<LoginPageContent />);
    await user.type(screen.getByLabelText(/Email address/), 'ramesh@example.com');
    await user.type(screen.getByLabelText(/^Password/, { selector: 'input' }), 'kirana2026');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Something went wrong.')).toBeInTheDocument();
    expect(screen.getByText('req_7f3a91')).toBeInTheDocument();
  });

  it('hides the password behind a toggle with its own accessible name (FR-8)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPageContent />);

    const input = screen.getByLabelText(/^Password/, { selector: 'input' });
    expect(input).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument();
  });

  it('remembers the address — and never the password (§19.7.1)', async () => {
    const user = userEvent.setup();
    authService.passwordLogin.mockResolvedValue(AUTH_RESULT);

    renderWithProviders(<LoginPageContent />);
    await user.type(screen.getByLabelText(/Email address/), 'ramesh@example.com');
    await user.type(screen.getByLabelText(/^Password/, { selector: 'input' }), 'kirana2026');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() =>
      expect(window.localStorage.getItem('ub.auth.lastEmail')).toBe('"ramesh@example.com"')
    );
    const everything = Object.keys(window.localStorage)
      .map((key) => window.localStorage.getItem(key) ?? '')
      .join(' ');
    expect(everything).not.toContain('kirana2026');
  });
});

describe('LoginPageContent — Hindi', () => {
  it('renders the same screen in Hindi, including the validation message', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPageContent />, {
      locale: 'hi',
      messages: hi as Record<string, string>,
    });

    expect(screen.getByLabelText(/ईमेल पता/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'लॉग इन' })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/ईमेल पता/), 'ramesh');
    await user.type(screen.getByLabelText(/^पासवर्ड/, { selector: 'input' }), 'kirana2026');
    await user.click(screen.getByRole('button', { name: 'लॉग इन' }));

    // The schema is rebuilt on the locale, so the message is Hindi too.
    expect(await screen.findByText(hi['validation.email.format'] as string)).toBeInTheDocument();
  });
});
