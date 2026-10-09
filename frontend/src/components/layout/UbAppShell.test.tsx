import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Plus } from 'lucide-react';

import { SnackbarHost } from 'src/components/layout/SnackbarHost';
import { UbAppShell } from 'src/components/layout/UbAppShell';
import { UbButton, UbFab, UbText } from 'src/design-system';
import { localeChanged } from 'src/redux/slice/localeSlice';
import { browserCameOnline, browserWentOffline } from 'src/redux/slice/networkSlice';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { hideSnackbar, showSnackbar } from 'src/redux/slice/snackbarSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import { clearCookie, LOCALE_COOKIE, readCookie } from 'src/utils/cookieUtils';

/**
 * The app chrome at every width.
 *
 * jsdom applies no stylesheet, so "below 1024 px" cannot be a viewport here: it
 * is the mobile HEADER, the one `lg:hidden` renders (the phone's navigation
 * itself is `MobileTabBar`, tested beside it, and the account lives on the More
 * tab, `MorePageContent.test.tsx`).
 */
jest.mock('modules/DigiKhaato/features/auth/api/authService');
jest.mock('modules/DigiKhaato/features/parties/api/partyService', () => ({
  ...jest.requireActual('modules/DigiKhaato/features/parties/api/partyService'),
  listParties: jest.fn(),
}));

// The shell mounts the notification bell, which polls `getUnreadCount`. Left
// unmocked it went to the network, answered 401 and tore the session down
// mid-test — the three "quick search" / "account menu" tests failed on main
// for that reason, not for anything they assert.
jest.mock('modules/DigiKhaato/features/notifications/api/notificationService', () => ({
  getUnreadCount: jest.fn().mockResolvedValue(0),
  listNotifications: jest
    .fn()
    .mockResolvedValue({ rows: [], nextCursor: null, hasMore: false, unreadCount: 0 }),
  markNotificationRead: jest.fn().mockResolvedValue(undefined),
  markAllNotificationsRead: jest.fn().mockResolvedValue(0),
}));

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

const partyService = jest.requireMock('modules/DigiKhaato/features/parties/api/partyService') as {
  listParties: jest.Mock;
};

const signIn = (
  permissions: readonly string[] = ['parties.party.read', 'ledger.entry.read']
): void => {
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
      permissions: [...permissions] as never,
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

/** The header a phone shows: the `lg:hidden` one. */
const mobileHeader = (): HTMLElement => {
  const header = Array.from(document.querySelectorAll('header')).find((node) =>
    node.className.includes('lg:hidden')
  );
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
  it('keeps the account off the phone header: it lives on the More tab now', () => {
    /* docs/mobile-redesign — the header held six controls in 390 px and cut
       the business name to "Sharm…". The ☰ drawer and the account avatar left
       it (the bottom nav and More replace them); the business switcher, the
       search and the bell stay. A regression that put either back would take
       the switcher's width again. */
    renderShell();
    const header = within(mobileHeader());
    expect(header.queryByRole('button', { name: 'Open menu' })).not.toBeInTheDocument();
    expect(
      header.queryByRole('button', { name: 'Account menu for Suresh Kumar' })
    ).not.toBeInTheDocument();
    expect(header.getByRole('button', { name: 'Search parties' })).toBeInTheDocument();
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

  it('has no search button for a role that cannot read parties', () => {
    /* D2 test gap: the button is meant to be ABSENT — not disabled, not a sheet
       that opens onto a 403 — for a role without `parties.party.read`, on the
       same rule the search itself uses. Nothing pinned it, so a refactor that
       dropped the `useCanSearchParties` guard would offer an accountant-style
       role a search that can only ever fail. */
    signIn(['ledger.entry.read']);
    renderShell();

    const header = within(mobileHeader());
    // `/parties` (this file's path) is not a menu destination, so the phone
    // header carries Back where the brand would be (MobileBackButton).
    expect(header.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(header.queryByRole('button', { name: 'Search parties' })).not.toBeInTheDocument();
    expect(partyService.listParties).not.toHaveBeenCalled();
  });

  it('shows a result’s mobile grouped as the party list does (D-L2)', async () => {
    /* Prevents D-L2: the phone search sheet printed the stored E.164
       "+919876543210" under the party's name, while the party row, the khata
       header and the reminder sheet all show "+91 98765 43210" — three
       spellings of one number on the screen a merchant uses to check they
       have the right Ramesh. */
    partyService.listParties.mockResolvedValue({
      rows: [
        {
          id: 'p1',
          name: 'Ramesh Traders',
          displayCode: 'C-001',
          mobile: '+919876543210',
          isCustomer: true,
          isSupplier: false,
          balance: '1200.00',
          status: 'active',
          lastActivityAt: null,
          tags: [],
        },
      ],
      meta: { page: 1, pageSize: 8, total: 1, totalPages: 1 },
    });
    const user = userEvent.setup();
    renderShell();

    await user.click(within(mobileHeader()).getByRole('button', { name: 'Search parties' }));
    const sheet = within(await screen.findByRole('dialog', { name: 'Search parties' }));
    await user.type(sheet.getByRole('combobox', { name: 'Search parties' }), 'Ram');

    const option = await sheet.findByRole('option', { name: /Ramesh Traders/ });
    expect(within(option).getByText('+91 98765 43210')).toBeInTheDocument();
    expect(within(option).queryByText('+919876543210')).not.toBeInTheDocument();
  });
});

describe('UAT D2 — the language switch in the desktop account menu', () => {
  it('offers the same switch in the desktop account menu', async () => {
    const user = userEvent.setup();
    renderShell();

    // The phone's switch is on the More tab (`MorePageContent.test.tsx`).
    await user.click(screen.getByRole('button', { name: 'Account menu for Suresh Kumar' }));

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

describe('CR-2026-09-29-SEC-A — a support session is view only', () => {
  const impersonate = (): void => {
    const state = store.getState().session;
    if (!state.user) throw new Error('signIn() runs in beforeEach');
    store.dispatch(
      sessionLoaded({
        user: state.user,
        activeTenant: state.activeTenant,
        tenants: state.tenants,
        permissions: state.permissions,
        enabledModules: state.enabledModules,
        version: state.version,
        impersonation: {
          id: 'imp1',
          tenantId: 't1',
          tenantName: 'Kumar Kirana Store',
          adminName: 'Ops Person',
          startedAt: '2026-09-29T10:00:00Z',
          expiresAt: '2026-09-29T11:00:00Z',
        },
      })
    );
  };

  const renderScreen = () =>
    renderWithProviders(
      <UbAppShell>
        <UbButton>Save entry</UbButton>
        <UbButton variant="destructive">Void bill</UbButton>
        <UbButton variant="secondary" type="submit">
          Submit form
        </UbButton>
        <UbButton variant="secondary">Filters</UbButton>
        <UbFab label="Add party" icon={<Plus aria-hidden className="h-6 w-6" />} />
      </UbAppShell>
    );

  it('disables every write action in the content, titled with the reason', async () => {
    /* The defect: the owner consents to a READ-ONLY session and the console
       says so, but the screens kept offering Save, Void and Add — each of which
       the server now refuses. The operator is told why, on the control. */
    impersonate();
    renderScreen();

    const reason = 'Support session · view only. Changes are turned off.';
    for (const name of ['Save entry', 'Void bill', 'Submit form', 'Add party']) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('title', reason);
    }
    // Reading is what the session is for: a non-write control still works.
    expect(screen.getByRole('button', { name: 'Filters' })).toBeEnabled();
    // The banner says it too, and its way out is never disabled.
    expect(await screen.findByText(/Support session · view only/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'End session' })).toBeEnabled();
  });

  it("leaves the owner's own session untouched", () => {
    /* The gate keys on the session flag, never on a role: the same screen in
       the owner's own session offers every action. */
    renderScreen();
    for (const name of ['Save entry', 'Void bill', 'Submit form', 'Add party', 'Filters']) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeEnabled();
      expect(button).not.toHaveAttribute('title');
    }
  });
});
