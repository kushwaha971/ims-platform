import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SnackbarHost } from 'src/components/layout/SnackbarHost';
import { UbAppShell } from 'src/components/layout/UbAppShell';
import { UbText } from 'src/design-system';
import { localeChanged } from 'src/redux/slice/localeSlice';
import { browserCameOnline, browserWentOffline } from 'src/redux/slice/networkSlice';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { hideSnackbar, showSnackbar } from 'src/redux/slice/snackbarSlice';
import { store } from 'src/redux/store';
import { ROUTES } from 'src/routes';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import { clearCookie, LOCALE_COOKIE, readCookie } from 'src/utils/cookieUtils';

/**
 * The app chrome at every width.
 *
 * jsdom applies no stylesheet, so "below 1024 px" cannot be a viewport here: it
 * is the mobile HEADER, the one `lg:hidden` renders — the header holding the
 * hamburger. Whatever a phone user can reach, they reach from inside that
 * element, so that is where these tests look.
 */
jest.mock('modules/DigiKhaato/features/auth/api/authService');

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/parties',
}));

const authService = jest.requireMock('modules/DigiKhaato/features/auth/api/authService') as {
  logout: jest.Mock;
};

const signIn = (): void => {
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
      permissions: ['parties.party.read', 'ledger.entry.read'] as never,
      enabledModules: ['parties', 'ledger'],
      version: 1,
    })
  );
};

const renderShell = () =>
  renderWithProviders(
    <>
      <UbAppShell>
        <UbText>Page body</UbText>
      </UbAppShell>
      <SnackbarHost />
    </>
  );

/** The header a phone shows: the one that holds the navigation drawer's trigger. */
const mobileHeader = (): HTMLElement => {
  const header = screen
    .getAllByRole('button', { name: 'Open menu' })
    .map((button) => button.closest('header'))
    .find((node): node is HTMLElement => node !== null);
  if (!header) throw new Error('no mobile header');
  return header;
};

beforeEach(() => {
  jest.clearAllMocks();
  authService.logout.mockResolvedValue(undefined);
  clearCookie(LOCALE_COOKIE);
  store.dispatch(localeChanged('en'));
  store.dispatch(hideSnackbar());
  store.dispatch(browserCameOnline());
  signIn();
});

describe('UAT D2 — the phone and tablet chrome', () => {
  it('shows who is signed in and a Sign out that logs out and routes to login', async () => {
    /* D2: below 1024 px there was no Sign out and no account identity at all —
       the account menu lived only in `UbAppTopBar`, which is `hidden lg:flex`. */
    const user = userEvent.setup();
    renderShell();

    const header = within(mobileHeader());
    await user.click(header.getByRole('button', { name: 'Account menu for Suresh Kumar' }));

    const menu = within(header.getByRole('menu'));
    expect(menu.getByText('Suresh Kumar')).toBeInTheDocument();
    expect(menu.getByText('suresh@kirana.test')).toBeInTheDocument();

    await user.click(menu.getByRole('menuitem', { name: 'Sign out' }));

    await waitFor(() => expect(authService.logout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(ROUTES.LOGIN));
    expect(store.getState().session.status).toBe('anonymous');
  });

  it('has a search button that opens the party quick search, focused', async () => {
    /* D2: the party search was in the same desktop-only bar, so a phone had no
       way to find a khata except by scrolling the list. */
    const user = userEvent.setup();
    renderShell();

    await user.click(within(mobileHeader()).getByRole('button', { name: 'Search parties' }));

    const sheet = await screen.findByRole('dialog', { name: 'Search parties' });
    const input = within(sheet).getByRole('combobox', { name: 'Search parties' });
    expect(input).toHaveFocus();
  });
});

describe('UAT D2 — the language switch, in the account menu at every width', () => {
  it('switches to Hindi from the phone header and persists it as the picker did', async () => {
    const user = userEvent.setup();
    renderShell();

    const header = within(mobileHeader());
    await user.click(header.getByRole('button', { name: 'Account menu for Suresh Kumar' }));
    const menu = within(header.getByRole('menu'));

    // Each option in its own script: the only label a person who needs it can read.
    expect(menu.getByRole('menuitem', { name: 'English' })).toHaveAttribute('aria-current', 'true');
    await user.click(menu.getByRole('menuitem', { name: 'हिन्दी' }));

    expect(store.getState().locale.current).toBe('hi');
    expect(store.getState().locale.overridden).toBe(true);
    expect(readCookie(LOCALE_COOKIE)).toBe('hi');
  });

  it('offers the same switch in the desktop account menu', async () => {
    const user = userEvent.setup();
    renderShell();

    const triggers = screen.getAllByRole('button', { name: 'Account menu for Suresh Kumar' });
    const desktop = triggers.find((node) => !mobileHeader().contains(node));
    if (!desktop) throw new Error('no desktop account menu');
    await user.click(desktop);

    const menu = within(screen.getByRole('menu'));
    await user.click(menu.getByRole('menuitem', { name: 'हिन्दी' }));
    expect(readCookie(LOCALE_COOKIE)).toBe('hi');
  });
});

describe('UAT D3 — app chrome is marked so print hides it', () => {
  it('puts the print hook on the top bar, mobile header, sidebar, network strip and snackbar', () => {
    /* D3: globals.css hides `nav, aside, header[data-app-header],
       [data-print='hide']` on paper, and nothing carried either attribute — so
       a printed statement opened with the user's name and email. */
    const view = renderShell();
    act(() => {
      store.dispatch(browserWentOffline());
      store.dispatch(showSnackbar({ severity: 'success', message: 'Saved' }));
    });

    /* Either of the print stylesheet's two hooks — the attribute or the
       `ub-print-hide` class (the snackbar carries the class on its own root). */
    const hidden = (node: Element | null): boolean =>
      node?.closest('[data-print="hide"], .ub-print-hide') !== null && node !== null;

    const headers = Array.from(view.container.querySelectorAll('header'));
    expect(headers).toHaveLength(2);
    headers.forEach((header) => expect(hidden(header)).toBe(true));

    view.container.querySelectorAll('nav').forEach((nav) => expect(hidden(nav)).toBe(true));

    expect(hidden(screen.getByTestId('offline-banner'))).toBe(true);
    expect(hidden(screen.getByTestId('snackbar'))).toBe(true);

    // The page itself is not chrome and must still print.
    expect(hidden(screen.getByText('Page body'))).toBe(false);
  });
});
