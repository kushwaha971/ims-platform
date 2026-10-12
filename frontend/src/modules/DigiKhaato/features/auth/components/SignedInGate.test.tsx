import { screen, waitFor } from '@testing-library/react';

import { resetSession, sessionLoaded, sessionRequested } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { resetAuth } from '../redux/authSlice';

import { OtpSignInPageContent } from './OtpSignInPageContent';

/**
 * QA B48 / B49 (12 Oct 2026) — `/login` and `/signup` opened while signed in drew
 * the form (a code could be asked for, or a second account started), and a hard
 * load painted the sign-in screen before jumping into the app. The screen now
 * asks the server first: a skeleton while it does, the app for a live session,
 * the form only for a refused one.
 */
jest.mock('../api/authService');
const authService = jest.requireMock('../api/authService') as { getSession: jest.Mock };

const replace = jest.fn();
let query = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace, back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(query),
  usePathname: () => '/login',
}));

const SESSION = {
  user: {
    id: 'u1',
    name: 'Owner',
    email: '',
    mobile: '+919845011122',
    locale: 'en',
    mustChangePassword: false,
    passwordExpiresAt: null,
  },
  activeTenant: { id: 't1', name: 'Test', timezone: 'Asia/Kolkata', role: 'owner' },
  tenants: [{ id: 't1', name: 'Test', timezone: 'Asia/Kolkata', status: 'active' }],
  permissions: [],
  enabledModules: ['library'],
  version: 1,
  landing: { kind: 'app', path: '/library' },
};

beforeEach(() => {
  jest.clearAllMocks();
  query = '';
  store.dispatch(resetAuth());
  store.dispatch(resetSession());
});

const mobileBox = (): HTMLElement | null => screen.queryByLabelText(/mobile/i);

describe('the sign-in screen over a session', () => {
  it('draws no form while a hard load is still asking who this is', () => {
    store.dispatch(sessionRequested());
    renderWithProviders(<OtpSignInPageContent mode="signIn" />);
    expect(mobileBox()).not.toBeInTheDocument();
  });

  it('goes to the safe next page when the server confirms the session', async () => {
    query = 'next=%2Flibrary%2Fmembers';
    store.dispatch(sessionLoaded(SESSION as never));
    authService.getSession.mockResolvedValue(SESSION);
    renderWithProviders(<OtpSignInPageContent mode="signUp" />);
    expect(mobileBox()).not.toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/library/members'));
  });

  it('ignores a next that leaves the site', async () => {
    query = 'next=https%3A%2F%2Fevil.example%2F';
    store.dispatch(sessionLoaded(SESSION as never));
    authService.getSession.mockResolvedValue(SESSION);
    renderWithProviders(<OtpSignInPageContent mode="signIn" />);
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(String(replace.mock.calls[0]?.[0])).toMatch(/^\/(?!\/)/);
    expect(String(replace.mock.calls[0]?.[0])).not.toContain('evil');
  });

  it('shows the form when the server says the held session is gone', async () => {
    store.dispatch(sessionLoaded(SESSION as never));
    authService.getSession.mockRejectedValue({
      code: 'not_authenticated',
      message: 'Signed out',
      details: {},
      requestId: null,
      status: 401,
      warnings: [],
    });
    renderWithProviders(<OtpSignInPageContent mode="signIn" />);
    expect(await screen.findByLabelText(/mobile/i)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
