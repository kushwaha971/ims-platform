import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import en from 'locales/en.json';
import hi from 'locales/hi.json';

import { resetAuth } from '../redux/authSlice';

import { SignUpPageContent } from './SignUpPageContent';

/**
 * CR-2026-09-19-A FR-S1, end to end inside the client (§19.13.3): route content
 * → hook → thunk → service → axios, with the service stubbed at the module
 * boundary. The backend is being built concurrently and may not be listening.
 */
jest.mock('../api/authService');

const authService = jest.requireMock('../api/authService') as {
  register: jest.Mock;
  getSession: jest.Mock;
};

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace, back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/signup',
}));

const apiError = (code: string, message: string, details: Record<string, string[]> = {}) => ({
  code,
  message,
  details,
  requestId: 'req_7f3a91',
  status: 400,
  warnings: [],
});

/** FR-5 — a brand-new account has no tenant and routes to the wizard. */
const NEW_ACCOUNT = {
  userId: 'u2',
  name: '',
  email: 'ramesh@example.com',
  mobile: null,
  locale: 'en',
  isNew: true,
  hasPassword: true,
  activeTenantId: null,
  tenants: [],
  permissions: [],
  enabledModules: [],
};

const fill = async (user: ReturnType<typeof userEvent.setup>, password = 'kirana2026') => {
  await user.type(screen.getByLabelText(/Email address/), 'ramesh@example.com');
  await user.type(screen.getByLabelText(/^Password/, { selector: 'input' }), password);
  await user.type(screen.getByLabelText(/Confirm password/, { selector: 'input' }), password);
};

beforeEach(() => {
  store.dispatch(resetAuth());
  jest.clearAllMocks();
  window.localStorage.clear();
  authService.getSession.mockResolvedValue({
    user: { id: 'u2', name: '', email: 'ramesh@example.com', mobile: null, locale: 'en' },
    activeTenant: null,
    tenants: [],
    permissions: [],
    enabledModules: [],
    version: null,
  });
});

describe('SignUpPageContent — §9 Initial', () => {
  it('asks for a name, an address and a password', () => {
    renderWithProviders(<SignUpPageContent />);

    expect(screen.getByLabelText(/Your name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email address/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/, { selector: 'input' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Confirm password/, { selector: 'input' })).toBeInTheDocument();
  });

  /**
   * CR-2026-09-19-A — mobile stays in the product as a PROFILE field. The two
   * halves of that sentence are both testable: the field is there, and it is
   * not required.
   */
  it('offers a mobile number, marked optional and not required to submit', async () => {
    const user = userEvent.setup();
    authService.register.mockResolvedValue(NEW_ACCOUNT);

    renderWithProviders(<SignUpPageContent />);
    expect(screen.getByLabelText(/Mobile number \(optional\)/)).toBeInTheDocument();

    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(authService.register).toHaveBeenCalledTimes(1));
    // Left blank, it is not sent at all — an empty string would claim an answer.
    expect(authService.register.mock.calls[0]?.[0]).not.toHaveProperty('mobile');
  });

  it('sends a mobile the user did give, in E.164, as a profile field', async () => {
    const user = userEvent.setup();
    authService.register.mockResolvedValue(NEW_ACCOUNT);

    renderWithProviders(<SignUpPageContent />);
    await user.type(screen.getByLabelText(/Mobile number \(optional\)/), '9876543210');
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(authService.register).toHaveBeenCalledTimes(1));
    expect(authService.register).toHaveBeenCalledWith(
      expect.objectContaining({ mobile: '+919876543210' })
    );
  });

  it('still refuses a half-typed mobile, because a wrong number is worse than none', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignUpPageContent />);

    await user.type(screen.getByLabelText(/Mobile number \(optional\)/), '12345');
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText(en['validation.mobile.format'] as string)).toBeInTheDocument();
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('states the floor the server enforces, not a looser one', () => {
    renderWithProviders(<SignUpPageContent />);
    expect(screen.getByText(en['auth.password.rule'] as string)).toBeInTheDocument();
  });
});

describe('SignUpPageContent — §9 Completed', () => {
  it('registers and lets the redirect hook send the new account to the wizard', async () => {
    const user = userEvent.setup();
    authService.register.mockResolvedValue(NEW_ACCOUNT);

    renderWithProviders(<SignUpPageContent />);
    await user.type(screen.getByLabelText(/Your name/), 'Ramesh');
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(authService.register).toHaveBeenCalledTimes(1));
    expect(authService.register).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'ramesh@example.com',
        password: 'kirana2026',
        name: 'Ramesh',
      })
    );
    // FR-9 — no membership at all means the onboarding wizard, not a dashboard.
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/onboarding/step/1'));
  });

  it('remembers the address for the login screen, and never the password', async () => {
    const user = userEvent.setup();
    authService.register.mockResolvedValue(NEW_ACCOUNT);

    renderWithProviders(<SignUpPageContent />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(window.localStorage.getItem('ub.auth.lastEmail')).toBe('"ramesh@example.com"')
    );
    const everything = Object.keys(window.localStorage)
      .map((key) => window.localStorage.getItem(key) ?? '')
      .join(' ');
    expect(everything).not.toContain('kirana2026');
  });
});

describe('SignUpPageContent — §9 Error', () => {
  it('refuses a password under the ten-character floor before the wire', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignUpPageContent />);

    await fill(user, 'kirana202');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText(/at least 10 characters/i)).toBeInTheDocument();
    expect(authService.register).not.toHaveBeenCalled();
  });

  it('refuses a confirmation that does not match', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignUpPageContent />);

    await user.type(screen.getByLabelText(/Email address/), 'ramesh@example.com');
    await user.type(screen.getByLabelText(/^Password/, { selector: 'input' }), 'kirana2026');
    await user.type(
      screen.getByLabelText(/Confirm password/, { selector: 'input' }),
      'kirana2027'
    );
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText(en['validation.password.mismatch'] as string)
    ).toBeInTheDocument();
    expect(authService.register).not.toHaveBeenCalled();
  });

  /**
   * A taken address is the one thing sign-up may reveal and login may not: the
   * person is trying to CREATE the account, so "you already have one" is help,
   * not enumeration — and it belongs under the field, not in a banner.
   */
  it('anchors "already registered" under the address field', async () => {
    const user = userEvent.setup();
    authService.register.mockRejectedValue(
      apiError('validation_error', 'Please check the highlighted fields.', {
        email: ['That address is already registered.'],
      })
    );

    renderWithProviders(<SignUpPageContent />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    const message = await screen.findByText('That address is already registered.');
    expect(message).toHaveAttribute('id', 'email-error');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it("anchors the server's password policy under the password field", async () => {
    const user = userEvent.setup();
    authService.register.mockRejectedValue(
      apiError('validation_error', 'Please check the highlighted fields.', {
        password: ['Choose a less common password.'],
      })
    );

    renderWithProviders(<SignUpPageContent />);
    await fill(user, 'password12');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    const message = await screen.findByText('Choose a less common password.');
    expect(message).toHaveAttribute('id', 'password-error');
  });

  it('shows a 500 as a banner carrying the request id (R-E-4)', async () => {
    const user = userEvent.setup();
    authService.register.mockRejectedValue({
      ...apiError('server_error', 'Something went wrong.'),
      status: 500,
    });

    renderWithProviders(<SignUpPageContent />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Something went wrong.')).toBeInTheDocument();
    expect(screen.getByText('req_7f3a91')).toBeInTheDocument();
  });
});

describe('SignUpPageContent — Hindi', () => {
  it('renders the same screen in Hindi, including the validation message', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignUpPageContent />, {
      locale: 'hi',
      messages: hi as Record<string, string>,
    });

    expect(screen.getByRole('button', { name: 'खाता बनाएँ' })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/ईमेल पता/), 'ramesh');
    await user.click(screen.getByRole('button', { name: 'खाता बनाएँ' }));

    expect(await screen.findByText(hi['validation.email.format'] as string)).toBeInTheDocument();
  });
});
