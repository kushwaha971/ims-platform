import { renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';

import { sessionLoaded, type SessionApp } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import type { PermissionCode } from 'src/types/domain.types';

import { useNavigation } from './useNavigation';

import type { AppManifest } from './appManifest';

/**
 * docs/platform/14 step 7 — the client half of "a new app by registration".
 *
 * A gym arrives as one manifest added to the list (`src/modules/appManifests`)
 * and NOTHING else: no shared component, hook or type changes. The shell must
 * then give it a menu of its own, open it for its paths, and keep every other
 * app's menu as it was. If shared code still had to name an app, this would
 * show a Shop menu on /gym, or no menu at all.
 */
jest.mock('modules/appManifests', () => {
  const actual = jest.requireActual('modules/appManifests');
  // Built in the factory: `jest.mock` is hoisted above every declaration.
  const gym: AppManifest = {
    code: 'gym',
    labelId: 'nav.workspace.gym',
    routePrefixes: ['/gym'],
    sections: [{ key: 'floor', labelId: 'gym.section.floor' }],
    navigation: [
      {
        key: 'gymMembers',
        icon: jest.requireActual('lucide-react').Dumbbell,
        labelId: 'gym.nav.members',
        href: '/gym/members',
        module: 'parties',
        permission: 'parties.party.read',
        section: 'floor',
        order: 1,
      },
    ],
  };
  const all = [...actual.APP_MANIFESTS, gym];
  return {
    APP_MANIFESTS: all,
    manifestFor: (code: string) => all.find((app: AppManifest) => app.code === code),
  };
});

let mockPath = '/gym/members';
jest.mock('next/navigation', () => ({
  ...jest.requireActual('next/navigation'),
  usePathname: () => mockPath,
}));
jest.mock('../auth/api/authService', () => ({
  ...jest.requireActual('../auth/api/authService'),
  switchApp: jest.fn(() => new Promise(() => undefined)),
}));

const APPS: SessionApp[] = [
  { code: 'gym', labelId: 'nav.workspace.gym', homePath: '/gym', order: 30 },
  { code: 'shop', labelId: 'nav.workspace.shop', homePath: '/dashboard', order: 90 },
];

beforeEach(() => {
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Owner',
        email: 'o@x.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'Fit Club', timezone: 'Asia/Kolkata', role: 'owner' },
      tenants: [{ id: 't1', name: 'Fit Club', timezone: 'Asia/Kolkata', role: 'owner' }],
      permissions: ['parties.party.read', 'reports.basic.read'] as PermissionCode[],
      enabledModules: ['parties', 'reports'],
      version: 1,
      apps: APPS,
      activeApp: 'gym',
    })
  );
});

const nav = () =>
  renderHook(() => useNavigation(), {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  }).result.current;

it('gives the new app its own menu on its own paths', () => {
  mockPath = '/gym/members';
  const result = nav();
  expect(result.app).toBe('gym');
  expect(result.sections.map((s) => s.key)).toEqual(['floor']);
  expect(result.sections[0]?.items.map((i) => i.key)).toEqual(['gymMembers']);
});

it('lists it in the switcher with the server’s home', () => {
  expect(nav().apps).toContainEqual({ code: 'gym', labelId: 'nav.workspace.gym', href: '/gym' });
});

it('leaves the other apps’ menus as they were', () => {
  mockPath = '/dashboard';
  const result = nav();
  expect(result.app).toBe('shop');
  expect(result.sections.flatMap((s) => s.items.map((i) => i.key))).not.toContain('gymMembers');
});
