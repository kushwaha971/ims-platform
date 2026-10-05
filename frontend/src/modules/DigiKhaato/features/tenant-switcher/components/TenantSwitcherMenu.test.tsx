import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NavSections } from 'src/components/layout/NavSections';
import { sessionLoaded, type SessionApp } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import { TenantSwitcherMenu } from './TenantSwitcherMenu';

/**
 * Owner, 5 Oct 2026 — "Why there is sub header like Shop, Library, Lending,
 * not want these things in that side". The app row sat at the top of the
 * sidebar, above the menu it changed. The apps of the open business are now
 * the first group of the business switcher, the rail caption names the open
 * app, and the sidebar carries only that app's menu.
 */
jest.mock('../../auth/api/authService');
const authService = jest.requireMock('../../auth/api/authService') as {
  switchApp: jest.Mock;
  getSession: jest.Mock;
};

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/library',
}));

const APPS: SessionApp[] = [
  { code: 'library', labelId: 'nav.workspace.library', homePath: '/library', order: 10 },
  { code: 'lending', labelId: 'nav.workspace.lending', homePath: '/lending', order: 20 },
];

const load = (apps: SessionApp[]) =>
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Suresh Verma',
        email: 'suresh@verma.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'Verma Finance', timezone: 'Asia/Kolkata', role: 'owner' },
      tenants: [
        {
          id: 't1',
          name: 'Verma Finance',
          timezone: 'Asia/Kolkata',
          role: 'owner',
          status: 'active',
          membershipId: 'm1',
        },
      ],
      permissions: ['library.member.read', 'lending.loan.read'] as PermissionCode[],
      enabledModules: ['library', 'lending', 'platform'],
      version: 1,
      apps,
      activeApp: 'library',
    })
  );

beforeEach(() => {
  jest.clearAllMocks();
  authService.switchApp.mockImplementation(() => new Promise(() => undefined));
});

describe('choosing an app', () => {
  it('names the open app under the business, in the rail', () => {
    load(APPS);
    renderWithProviders(<TenantSwitcherMenu rail caption="YourKhata" />);
    expect(screen.getByText('Verma Finance')).toBeInTheDocument();
    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.queryByText('YourKhata')).toBeNull();
  });

  it('lists the business’s apps first in the switcher and opens the one chosen', async () => {
    load(APPS);
    renderWithProviders(<TenantSwitcherMenu rail caption="YourKhata" />);
    await userEvent.click(screen.getByRole('button', { name: /Verma Finance/ }));
    expect(await screen.findByText('Apps')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Lending' }));
    await waitFor(() => expect(authService.switchApp).toHaveBeenCalledWith('lending'));
    expect(push).toHaveBeenCalledWith('/lending');
  });

  it('offers no app group to a person who can open one app', async () => {
    load([APPS[0] as SessionApp]);
    renderWithProviders(<TenantSwitcherMenu rail caption="YourKhata" />);
    await userEvent.click(screen.getByRole('button', { name: /Verma Finance/ }));
    await screen.findByText('Your businesses');
    expect(screen.queryByText('Apps')).toBeNull();
  });
});

describe('the sidebar', () => {
  it('carries the open app’s menu and no row of apps', () => {
    load(APPS);
    renderWithProviders(<NavSections />);
    expect(screen.queryByTestId('nav-workspaces')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Lending' })).toBeNull();
  });
});
