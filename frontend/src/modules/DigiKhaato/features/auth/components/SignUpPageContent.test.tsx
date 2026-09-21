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
 *
 * ── CR-2026-09-19-D rewrote a third of this file, and the reason matters ────
 * The suite used to assert the five-field form: a name field, a mobile field
 * marked optional, a confirmation that had to match. Those tests were correct
 * about the code and wrong about the product — the screen's own copy promised
 * "an email address and a password", and nothing here was checking the promise
 * against the form. So the ones that pinned the three removed fields are gone,
 * and a new one asserts the thing that was never asserted: that the form asks
 * for exactly what the sentence above it says it will.
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
  mustChangePassword: false,
  passwordExpiresAt: null,
  activeTenantId: null,
  tenants: [],
  permissions: [],
  enabledModules: [],
};

const fill = async (user: ReturnType<typeof userEvent.setup>, password = 'kirana2026') => {
  await user.type(screen.getByLabelText(/Email address/), 'ramesh@example.com');
  await user.type(screen.getByLabelText(/^Password/, { selector: 'input' }), password);
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
  it('asks for an address and a password, which is what its own copy promises', () => {
    renderWithProviders(<SignUpPageContent />);

    expect(screen.getByText(en['auth.signUp.body'] as string)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email address/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password/, { selector: 'input' })).toBeInTheDocument();
  });

  /**
   * The defect this replaces: the sentence said two things and the form asked
   * for five. Counting the controls is the only assertion that catches a sixth
   * being added back by somebody who reads the spec and not the screen.
   */
  it('asks for nothing else — no name, no mobile, no confirmation', () => {
    const { container } = renderWithProviders(<SignUpPageContent />);

    expect(screen.queryByLabelText(/Your name/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Mobile number/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Confirm password/)).not.toBeInTheDocument();
    // Two visible controls, plus the reveal toggle, and nothing more.
    expect(container.querySelectorAll('input')).toHaveLength(2);
  });

  /** CR-2026-09-19-D — required fields are announced, not starred. */
  it('marks the required fields to a screen reader and paints no asterisk', () => {
    const { container } = renderWithProviders(<SignUpPageContent />);

    expect(screen.getByLabelText(/Email address/)).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText(/^Password/, { selector: 'input' })).toHaveAttribute(
      'aria-required',
      'true'
    );
    expect(container.querySelector('label')?.textContent).not.toContain('*');
  });

  it('states the floor the server enforces, not a looser one', () => {
    renderWithProviders(<SignUpPageContent />);
    expect(screen.getByText(en['auth.password.rule'] as string)).toBeInTheDocument();
  });

  /** The hint under the address restated its label; the password rule does not. */
  it('carries no helper text that merely repeats a label', () => {
    renderWithProviders(<SignUpPageContent />);
    expect(screen.queryByText(/The address you signed up with/i)).not.toBeInTheDocument();
  });
});

describe('SignUpPageContent — §9 Completed', () => {
  it('registers and lets the redirect hook send the new account to the wizard', async () => {
    const user = userEvent.setup();
    authService.register.mockResolvedValue(NEW_ACCOUNT);

    renderWithProviders(<SignUpPageContent />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(authService.register).toHaveBeenCalledTimes(1));
    expect(authService.register).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ramesh@example.com', password: 'kirana2026' })
    );
    // The two fields that left the screen leave the request with them: an
    // empty string would claim an answer nobody gave.
    expect(authService.register.mock.calls[0]?.[0]).not.toHaveProperty('mobile');
    expect(authService.register.mock.calls[0]?.[0]).not.toHaveProperty('name');
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

  /**
   * The server still knows about `full_name` and `mobile`; this form does not.
   * A 400 naming one of them has no field to sit under, and dropping it would
   * be a silent failure (§19.5.6).
   */
  it('surfaces a server error about a field this form no longer shows', async () => {
    const user = userEvent.setup();
    authService.register.mockRejectedValue(
      apiError('validation_error', 'Please check the highlighted fields.', {
        full_name: ['That name is too long.'],
      })
    );

    renderWithProviders(<SignUpPageContent />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('That name is too long.')).toBeInTheDocument();
  });

  /**
   * CR-2026-09-19-E — was "shows a 500 as a banner carrying the request id".
   * The banner is gone; a 500 surfaces through the single snackbar channel
   * (src/tests/globalErrorChannel.test.tsx). What this screen owes now is that
   * it renders no failure of its own.
   */
  it('renders no failure of its own on a 500 — the snackbar owns it', async () => {
    const user = userEvent.setup();
    authService.register.mockRejectedValue({
      ...apiError('server_error', 'Something went wrong.'),
      status: 500,
    });

    renderWithProviders(<SignUpPageContent />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(authService.register).toHaveBeenCalled());
    expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument();
    expect(screen.queryByText('req_7f3a91')).not.toBeInTheDocument();
    expect(screen.queryByTestId('snackbar')).not.toBeInTheDocument();
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
