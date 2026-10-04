import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { MODULE_CODES, type ModuleCode } from 'src/types/domain.types';

import { NAV_ITEMS } from './sidebarConfig';
import { useNavigation } from './useNavigation';
import { rememberWorkspace, resetWorkspaceMemory } from './workspaceMemory';

let mockPath = '/settings';
jest.mock('next/navigation', () => ({
  ...jest.requireActual('next/navigation'),
  usePathname: () => mockPath,
}));

const load = (enabledModules: readonly ModuleCode[]) =>
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
      permissions: NAV_ITEMS.map((item) => item.permission) as never,
      enabledModules: [...enabledModules],
      version: 1,
    })
  );

const listed = () =>
  renderHook(() => useNavigation(), {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  }).result.current;

const keysOf = (nav: ReturnType<typeof useNavigation>) =>
  nav.sections.flatMap((section) => section.items.map((item) => item.key));

beforeEach(() => {
  window.localStorage.clear();
  resetWorkspaceMemory();
  mockPath = '/settings';
  load(MODULE_CODES);
});

/**
 * Owner rule — "don't show unbuilt features". Bills, Purchases, Payments and
 * Reports used to sit in the sidebar as greyed "Soon" rows; a row whose page
 * does not exist (`ready` absent) is now left out entirely, even for an owner
 * who has every module and every permission.
 */
describe('useNavigation', () => {
  it('lists no row whose page is not built (no "Soon" rows), in any workspace', () => {
    /* Every row is checked both ways — a built row that went missing fails
       too — across the workspaces, since each shows only its own rows. */
    const keys = new Set<string>();
    for (const path of ['/sales/invoices', '/library/members']) {
      mockPath = path;
      keysOf(listed()).forEach((key) => keys.add(key));
    }
    for (const item of NAV_ITEMS) {
      expect({ key: item.key, listed: keys.has(item.key) }).toEqual({
        key: item.key,
        listed: Boolean(item.ready),
      });
    }
  });

  it('keeps unbuilt rows out of the bottom nav too', () => {
    for (const item of listed().bottomNav) expect(item.ready).toBe(true);
  });
});

/**
 * Owner, 4 Oct 2026: "that sidebar also should be module specific, not common".
 * A reading room's menu carried Customers, Bills, Purchases and Cashbook because
 * every row was shown to every tenant that had the module on — which is every
 * tenant, since the shop modules are the default.
 */
describe('one menu per kind of business', () => {
  it('shows a library only library rows, plus Team and Settings', () => {
    mockPath = '/library/members';
    const nav = listed();
    expect(nav.workspace).toBe('library');
    const keys = keysOf(nav);
    expect(keys).toEqual(expect.arrayContaining(['libraryMembers', 'team', 'settings']));
    for (const shop of ['parties', 'invoices', 'purchases', 'cashbook', 'payments', 'dashboard']) {
      expect(keys).not.toContain(shop);
    }
  });

  it('shows a shop page the shop menu, with no library rows', () => {
    mockPath = '/sales/invoices';
    const keys = keysOf(listed());
    expect(keys).toContain('invoices');
    expect(keys.some((key) => key.startsWith('library'))).toBe(false);
  });

  it('keeps the remembered menu on a page every workspace shares', () => {
    rememberWorkspace('t1', 'shop');
    mockPath = '/settings';
    expect(listed().workspace).toBe('shop');
    act(() => rememberWorkspace('t1', 'library'));
    expect(listed().workspace).toBe('library');
  });

  it('opens a business with a vertical on in that vertical, before the shop', () => {
    expect(listed().workspace).toBe('library');
  });

  it('offers the switcher only to a business that runs more than one kind', () => {
    expect(listed().workspaces.map((ws) => ws.code)).toEqual(['library', 'shop']);
    act(() => {
      load(MODULE_CODES.filter((code) => code !== 'library'));
    });
    const nav = listed();
    expect(nav.workspaces.map((ws) => ws.code)).toEqual(['shop']);
    expect(nav.workspace).toBe('shop');
  });

  it('does not throw the menu back to the shop when a student khata opens', () => {
    rememberWorkspace('t1', 'library');
    mockPath = '/parties/01a10730';
    expect(listed().workspace).toBe('library');
  });
});

describe('the dashboard follows the workspace', () => {
  /**
   * Sign-in, a business switch and the logo all go to /dashboard. Were it a
   * shop path, a library would land on a shop dashboard and its menu would turn
   * into the shop's on the very first screen.
   */
  it('does not choose the shop for a library that lands on /dashboard', () => {
    mockPath = '/dashboard';
    expect(listed().workspace).toBe('library');
  });
});

describe('the switcher', () => {
  /**
   * Found by tapping it: "Shop" on a library page wrote `shop`, the hook's
   * memo rebuilt its workspace list, the remember-effect re-ran on the new
   * array and wrote `library` back before the navigation away had happened.
   */
  it('keeps a choice made from a page of the other workspace', () => {
    mockPath = '/library/members';
    const { result } = renderHook(() => useNavigation(), {
      wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
    });
    expect(result.current.workspace).toBe('library');
    act(() => rememberWorkspace('t1', 'shop'));
    expect(JSON.parse(window.localStorage.getItem('ub_workspace') ?? '{}')).toEqual({ t1: 'shop' });
  });
});
