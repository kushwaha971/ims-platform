import { act, renderHook, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';

import { resetAllFeatureState } from 'src/redux/actions';
import { sessionLoaded, type SessionApp } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { MODULE_CODES, type ModuleCode, type PermissionCode } from 'src/types/domain.types';

import { APP_MANIFESTS } from 'modules/appManifests';

import * as authService from '../auth/api/authService';

import { PLATFORM_NAV_ITEMS } from './appManifest';
import { resetNavigationSyncForTests, useNavigation } from './useNavigation';

/**
 * docs/platform/14 §4.2 — the sidebar is the CURRENT APP's manifest, filtered by
 * entitlements and permissions, plus the platform's rows; which apps a person
 * can open, and which they are in, is the server's (`apps`, `active_app`).
 *
 * The defect this replaced: one shared list of every row of every app, with
 * the app remembered in `localStorage` — so a laptop and a phone disagreed,
 * and the server could not open a person's app after sign-in.
 */
let mockPath = '/settings';
jest.mock('next/navigation', () => ({
  ...jest.requireActual('next/navigation'),
  usePathname: () => mockPath,
}));
jest.mock('../auth/api/authService', () => ({
  ...jest.requireActual('../auth/api/authService'),
  switchApp: jest.fn(),
}));

const ALL_PERMISSIONS = [
  ...APP_MANIFESTS.flatMap((app) => app.navigation.map((item) => item.permission)),
  ...PLATFORM_NAV_ITEMS.map((item) => item.permission),
] as PermissionCode[];

const SERVER_APPS: SessionApp[] = [
  { code: 'library', labelId: 'nav.workspace.library', homePath: '/library', order: 10 },
  { code: 'lending', labelId: 'nav.workspace.lending', homePath: '/lending', order: 20 },
  { code: 'shop', labelId: 'nav.workspace.shop', homePath: '/dashboard', order: 90 },
];

const load = ({
  apps = SERVER_APPS,
  activeApp = 'library',
  modules = MODULE_CODES,
  permissions = ALL_PERMISSIONS,
}: {
  apps?: SessionApp[] | null;
  activeApp?: string | null;
  modules?: readonly ModuleCode[];
  permissions?: PermissionCode[];
} = {}) =>
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
      activeTenant: { id: 't1', name: 'Kumar Kirana', timezone: 'Asia/Kolkata', role: 'owner' },
      tenants: [{ id: 't1', name: 'Kumar Kirana', timezone: 'Asia/Kolkata', role: 'owner' }],
      permissions,
      enabledModules: [...modules],
      version: 1,
      apps,
      activeApp,
    })
  );

const listed = () =>
  renderHook(() => useNavigation(), {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  }).result.current;

const keysOf = (nav: ReturnType<typeof useNavigation>) =>
  nav.sections.flatMap((section) => section.items.map((item) => item.key));

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  store.dispatch(resetAllFeatureState());
  jest.mocked(authService.switchApp).mockReset();
  jest.mocked(authService.switchApp).mockImplementation(() => new Promise(() => undefined));
  mockPath = '/settings';
  resetNavigationSyncForTests();
  load();
});

describe('one menu per app', () => {
  it('shows a library only library rows, plus Team and Settings', () => {
    mockPath = '/library/members';
    const nav = listed();
    expect(nav.app).toBe('library');
    const keys = keysOf(nav);
    expect(keys).toEqual(expect.arrayContaining(['libraryMembers', 'team', 'settings']));
    for (const shop of ['parties', 'invoices', 'purchases', 'cashbook', 'payments', 'dashboard']) {
      expect(keys).not.toContain(shop);
    }
  });

  it('shows a lender only lending rows, plus Team and Settings', () => {
    mockPath = '/lending/loans';
    const keys = keysOf(listed());
    expect(keys).toEqual(expect.arrayContaining(['lendingToday', 'lendingLoans', 'team']));
    for (const other of ['parties', 'invoices', 'cashbook', 'libraryMembers']) {
      expect(keys).not.toContain(other);
    }
  });

  it('groups the Shop like Vyapar and Zoho: parties, sales, purchases, stock, money, reports', () => {
    mockPath = '/sales/invoices';
    const nav = listed();
    expect(nav.sections.map((s) => s.key)).toEqual([
      'home',
      'parties',
      'sales',
      'purchases',
      'stock',
      'money',
      'insight',
      'account',
    ]);
    const sales = nav.sections.find((s) => s.key === 'sales')?.items.map((i) => i.key);
    expect(sales).toEqual(['invoices', 'estimates', 'salesOrders', 'challans', 'creditNotes']);
    expect(nav.shell.partySearch).toBe(true);
  });

  it('offers the party search only in an app that declares it, never by name', () => {
    mockPath = '/library/members';
    expect(listed().shell.partySearch).toBeUndefined();
  });

  it('keeps the menu of the app the person is in on a page every app shares', () => {
    load({ activeApp: 'lending' });
    mockPath = '/settings';
    expect(listed().app).toBe('lending');
  });

  it('leaves out a row the person may not use, and an app they hold no grant for', () => {
    load({
      apps: [SERVER_APPS[1] as SessionApp],
      activeApp: 'lending',
      permissions: ['lending.today.read', 'lending.loan.read'] as PermissionCode[],
    });
    mockPath = '/settings';
    const nav = listed();
    expect(nav.apps.map((a) => a.code)).toEqual(['lending']);
    expect(keysOf(nav)).toEqual(['lendingToday', 'lendingLoans']);
  });
});

describe('the switcher', () => {
  it('restores the app recorded on a shared history entry after switching apps (QA B11)', () => {
    // Back to a Shop customer must not turn them into a Library student.
    window.history.replaceState(
      { yourkhataApp: { path: '/parties/p1', app: 'shop', tenant: 't1' } },
      '',
      '/parties/p1'
    );
    mockPath = '/parties/p1';
    load({ activeApp: 'library' });
    expect(listed().app).toBe('shop');
    window.history.replaceState(null, '', '/');
  });

  it('ignores history context from another business (QA B11)', () => {
    // Switching business must not carry the previous business's open app.
    window.history.replaceState(
      { yourkhataApp: { path: '/parties/p1', app: 'shop', tenant: 'another-business' } },
      '',
      '/parties/p1'
    );
    mockPath = '/parties/p1';
    load({ activeApp: 'library' });
    expect(listed().app).toBe('library');
  });

  it('keeps Next router metadata when recording a shared page (QA B11)', () => {
    // Replacing Next's history fields would restore the app but break Back itself.
    window.history.replaceState({ __NA: true, routerTree: ['existing'] }, '', '/parties/p1');
    mockPath = '/parties/p1';
    load({ activeApp: 'shop' });
    listed();
    expect(window.history.state).toEqual(
      expect.objectContaining({
        __NA: true,
        routerTree: ['existing'],
        yourkhataApp: { path: '/parties/p1', app: 'shop', tenant: 't1' },
      })
    );
  });

  it('lists the apps the server says, in its order, with their homes', () => {
    expect(listed().apps).toEqual([
      { code: 'library', labelId: 'nav.workspace.library', href: '/library' },
      { code: 'lending', labelId: 'nav.workspace.lending', href: '/lending' },
      { code: 'shop', labelId: 'nav.workspace.shop', href: '/dashboard' },
    ]);
  });

  it('is not offered to a person who can open one app', () => {
    load({ apps: [SERVER_APPS[2] as SessionApp], activeApp: 'shop' });
    expect(listed().apps).toHaveLength(1);
  });

  it('tells the server when a page of another app is opened directly', async () => {
    load({ activeApp: 'library' });
    mockPath = '/lending/loans';
    act(() => {
      listed();
    });
    await waitFor(() => expect(authService.switchApp).toHaveBeenCalledWith('lending'));
  });

  it('asks ONCE however many parts of the shell read the menu (QA B50/B21)', async () => {
    // The sidebar, the tab bar, the top bar and five more call this hook. Each one
    // used to send its own switch — a burst online, an endless retry offline.
    load({ activeApp: 'library' });
    mockPath = '/lending/loans';
    act(() => {
      listed();
      listed();
      listed();
    });
    await waitFor(() => expect(authService.switchApp).toHaveBeenCalled());
    expect(authService.switchApp).toHaveBeenCalledTimes(1);
  });

  it('says nothing when the page belongs to the app the person is already in', () => {
    load({ activeApp: 'lending' });
    mockPath = '/lending/loans';
    listed();
    expect(authService.switchApp).not.toHaveBeenCalled();
  });
});

describe('a body without apps (an old fixture)', () => {
  it('falls back to every app with a row this person can see', () => {
    load({ apps: null, activeApp: null, modules: MODULE_CODES.filter((m) => m !== 'library') });
    // DEC-019 — the Udhaar book is an app of its own, after the Shop.
    expect(listed().apps.map((a) => a.code)).toEqual(['lending', 'shop', 'khata']);
  });
});
