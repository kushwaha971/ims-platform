import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FeedbackTab } from 'src/components/providers/FeedbackTab';
import { localeChanged } from 'src/redux/slice/localeSlice';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { ROUTES } from 'src/routes';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import { clearCookie, LOCALE_COOKIE, readCookie } from 'src/utils/cookieUtils';

import { MorePageContent } from './MorePageContent';

import type { PostHog } from 'posthog-js';

/**
 * The phone's More tab. It replaced the ☰ drawer AND the phone header's account
 * menu, so it carries both of their jobs: every non-tab destination, and the
 * account's language and Sign out (UAT D2 — below 1024 px there was once no
 * Sign out at all; this must never regress to that).
 */
jest.mock('modules/DigiKhaato/features/auth/api/authService');
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/more',
}));
const authService = jest.requireMock('modules/DigiKhaato/features/auth/api/authService') as {
  logout: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  authService.logout.mockResolvedValue(undefined);
  clearCookie(LOCALE_COOKIE);
  store.dispatch(localeChanged('en'));
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Suresh Kumar',
        email: 'suresh@kirana.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: {
        id: 't1',
        name: 'Kumar Kirana Store',
        timezone: 'Asia/Kolkata',
        role: 'owner',
      },
      tenants: [{ id: 't1', name: 'Kumar Kirana Store', timezone: 'Asia/Kolkata', role: 'owner' }],
      permissions: [
        'parties.party.read',
        'sales.invoice.read',
        'payments.payment.read',
        'platform.audit.read',
      ] as never,
      enabledModules: ['parties', 'sales', 'payments', 'platform'] as never,
      version: 1,
    })
  );
});

describe('MorePageContent', () => {
  it('opens feedback from a normal account row on the phone (QA B16)', async () => {
    // The phone must keep the survey reachable without a floating tab over fields.
    const displaySurvey = jest.fn();
    const client = {
      getSurveys: (callback: (surveys: unknown[]) => void) =>
        callback([{ id: 'sv_mobile', type: 'popover' }]),
      displaySurvey,
    };
    renderWithProviders(
      <>
        <MorePageContent />
        <FeedbackTab posthog={client as unknown as PostHog} />
      </>
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Give feedback' }));
    expect(screen.queryByTestId('feedback-tab')).toBeNull();
    expect(displaySurvey).toHaveBeenCalledWith('sv_mobile', {
      displayType: 'popover',
      ignoreConditions: true,
      ignoreDelay: true,
    });
  });
  it('lists every destination except the tabs, grouped as the sidebar groups them', () => {
    /* Prevents: a feature reachable on desktop and nowhere on a phone, and a
       tab listed twice (once in the bar, once here). */
    renderWithProviders(<MorePageContent />);
    expect(screen.getByRole('link', { name: 'Payments' })).toHaveAttribute('href', ROUTES.PAYMENTS);
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', ROUTES.SETTINGS);
    expect(screen.queryByRole('link', { name: 'Customers' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Suppliers' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bills' })).not.toBeInTheDocument();
  });

  it('finds a feature by its words', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MorePageContent />);
    await user.type(screen.getByRole('searchbox', { name: 'Find a feature' }), 'pay');
    expect(screen.getByRole('link', { name: 'Payments' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: 'Find a feature' }));
    await user.type(screen.getByRole('searchbox', { name: 'Find a feature' }), 'zzz');
    expect(screen.getByText('No feature matches “zzz”.')).toBeInTheDocument();
  });

  it('shows who is signed in and a Sign out that logs out and routes to login', async () => {
    /* UAT D2, carried over from the phone header's account menu. */
    const user = userEvent.setup();
    renderWithProviders(<MorePageContent />);
    expect(screen.getByText('suresh@kirana.test')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Switch business/ })).toHaveAttribute(
      'href',
      ROUTES.SWITCH_TENANT
    );
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(authService.logout).toHaveBeenCalledTimes(1));
    expect(mockReplace).toHaveBeenCalledWith(ROUTES.LOGIN);
  });

  it('switches to Hindi and persists it as the account menu does', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MorePageContent />);
    const language = within(screen.getByRole('radiogroup', { name: 'Language' }));
    expect(language.getByRole('radio', { name: 'English' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await user.click(language.getByRole('radio', { name: 'हिन्दी' }));
    expect(store.getState().locale.current).toBe('hi');
    expect(readCookie(LOCALE_COOKIE)).toBe('hi');
  });
});
