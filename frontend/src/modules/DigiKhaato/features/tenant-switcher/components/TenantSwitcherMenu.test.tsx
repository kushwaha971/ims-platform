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
  setAppRunning: jest.Mock;
  leaveApp: jest.Mock;
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

const load = (
  apps: SessionApp[],
  {
    role = 'owner',
    addable = [],
    others = [],
  }: {
    role?: string;
    addable?: SessionApp[];
    others?: { id: string; name: string; role: string }[];
  } = {}
) =>
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
      activeTenant: { id: 't1', name: 'Verma Finance', timezone: 'Asia/Kolkata', role },
      tenants: [
        {
          id: 't1',
          name: 'Verma Finance',
          timezone: 'Asia/Kolkata',
          role,
          status: 'active',
          membershipId: 'm1',
        },
        ...others.map((other, index) => ({
          ...other,
          timezone: 'Asia/Kolkata',
          status: 'active' as const,
          membershipId: `m${index + 2}`,
        })),
      ],
      permissions: ['library.member.read', 'lending.loan.read'] as PermissionCode[],
      enabledModules: ['library', 'lending', 'platform'],
      version: 1,
      apps,
      activeApp: 'library',
      appsAddable: addable,
    })
  );

beforeEach(() => {
  jest.clearAllMocks();
  authService.switchApp.mockImplementation(() => new Promise(() => undefined));
});

const LENDING = APPS[1] as SessionApp;
const LIBRARY = APPS[0] as SessionApp;
const after = (apps: SessionApp[], activeApp: string) => ({
  user: store.getState().session.user,
  activeTenant: store.getState().session.activeTenant,
  tenants: store.getState().session.tenants,
  permissions: [],
  enabledModules: [],
  version: 2,
  apps,
  activeApp,
  appsAddable: [],
});

describe('step 4 — businesses you own and where you work', () => {
  it('lists them under two headings', async () => {
    load([LIBRARY], { others: [{ id: 't2', name: 'Sharma Traders', role: 'staff' }] });
    renderWithProviders(<TenantSwitcherMenu rail caption="YourKhata" />);
    await userEvent.click(screen.getByRole('button', { name: /Verma Finance/ }));
    const labels = await screen.findAllByText(/Your businesses|Where you work/);
    expect(labels.map((node) => node.textContent)).toEqual(['Your businesses', 'Where you work']);
    expect(screen.getByRole('menuitem', { name: /Sharma Traders/ })).toBeInTheDocument();
  });
});

describe('step 4 — the owner adds and turns off apps', () => {
  it('offers an app the plan has, runs it and opens its home', async () => {
    load([LIBRARY], { addable: [LENDING] });
    authService.setAppRunning.mockResolvedValue(after([LIBRARY, LENDING], 'library'));
    renderWithProviders(<TenantSwitcherMenu rail caption="YourKhata" />);
    await userEvent.click(screen.getByRole('button', { name: /Verma Finance/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Add Lending' }));
    await waitFor(() => expect(authService.setAppRunning).toHaveBeenCalledWith('lending', true));
    await waitFor(() => expect(authService.switchApp).toHaveBeenCalledWith('lending'));
  });

  it('turns the open app off for the business, after saying what that means', async () => {
    load(APPS);
    authService.setAppRunning.mockResolvedValue(after([LENDING], 'lending'));
    renderWithProviders(<TenantSwitcherMenu rail caption="YourKhata" />);
    await userEvent.click(screen.getByRole('button', { name: /Verma Finance/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Turn off Library' }));
    expect(await screen.findByText(/Nothing is deleted/)).toBeInTheDocument();
    expect(authService.setAppRunning).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Turn off Library' }));
    await waitFor(() => expect(authService.setAppRunning).toHaveBeenCalledWith('library', false));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/lending'));
  });

  it('never offers the owner "Leave", nor anyone else "Add" or "Turn off"', async () => {
    load(APPS, { role: 'staff', addable: [] });
    renderWithProviders(<TenantSwitcherMenu rail caption="YourKhata" />);
    await userEvent.click(screen.getByRole('button', { name: /Verma Finance/ }));
    await screen.findByRole('menuitem', { name: 'Leave Library' });
    expect(
      screen.queryByRole('menuitem', { name: /Turn off|^Add (Library|Lending|Shop)/ })
    ).toBeNull();
  });
});

describe('step 4 — anyone else leaves an app', () => {
  it('takes themselves out of the open app and goes to the one they keep', async () => {
    load(APPS, { role: 'staff' });
    authService.leaveApp.mockResolvedValue(after([LENDING], 'lending'));
    renderWithProviders(<TenantSwitcherMenu rail caption="YourKhata" />);
    await userEvent.click(screen.getByRole('button', { name: /Verma Finance/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Leave Library' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Leave Library' }));
    await waitFor(() => expect(authService.leaveApp).toHaveBeenCalledWith('library'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/lending'));
  });
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
