import { screen, waitFor } from '@testing-library/react';

import { UbText } from 'src/design-system';
import { sessionLoaded, sessionExpired, type SessionTenant } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { RequireSession } from './RequireSession';

/**
 * PLT-01 EC-5, PLT-04 FR-8 / FR-9 — the guard in front of `app/(app)`.
 *
 * The regression this file holds down: `sessionSlice` reports `no_tenant`
 * whenever `activeTenant` is null, and this guard sent every `no_tenant`
 * session to `/onboarding`. `/switch` — the ONLY screen that lists an
 * invitation, and the one `postAuthDestination` correctly routes an
 * invited-only user to — lives under `(app)`, behind this guard. So an account
 * whose only membership was an invitation was bounced out of the acceptance
 * screen and into a wizard for a business it never meant to create, and
 * invitation acceptance was unreachable for every account the product can
 * make. The same bounce hit FR-9's "several actives, no default" case.
 */
const replace = jest.fn();
let pathname = '/switch';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace, back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => pathname,
}));

const tenant = (over: Partial<SessionTenant> = {}): SessionTenant => ({
  id: 't1',
  name: 'Sharma General Store',
  timezone: 'Asia/Kolkata',
  role: 'owner',
  isDefault: false,
  status: 'active',
  membershipId: 'm1',
  ...over,
});

const loadSession = (
  tenants: readonly SessionTenant[],
  active: SessionTenant | null = null,
  user: { mustChangePassword?: boolean; passwordExpiresAt?: string | null } = {}
) => {
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Ramesh',
        email: 'ramesh@example.com',
        mobile: null,
        locale: 'en',
        mustChangePassword: user.mustChangePassword ?? false,
        passwordExpiresAt: user.passwordExpiresAt ?? null,
      },
      activeTenant: active,
      tenants,
      permissions: [],
      enabledModules: [],
      version: 1,
    })
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  pathname = '/switch';
  store.dispatch(sessionExpired());
});

describe('RequireSession — a session with no active tenant', () => {
  it('lets an INVITED-only user reach the chooser that holds their invitation', async () => {
    loadSession([tenant({ id: 't9', name: 'Verma Wholesale', status: 'invited', role: 'staff' })]);

    renderWithProviders(
      <RequireSession>
        <UbText as="span" variant="body">the chooser</UbText>
      </RequireSession>
    );

    expect(await screen.findByText('the chooser')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('lets a user with several actives and no default reach the chooser (FR-9)', async () => {
    loadSession([tenant({ id: 'a', name: 'Sharma' }), tenant({ id: 'b', name: 'Verma' })]);

    renderWithProviders(
      <RequireSession>
        <UbText as="span" variant="body">the chooser</UbText>
      </RequireSession>
    );

    expect(await screen.findByText('the chooser')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('still sends an account with no membership at all to the wizard', async () => {
    loadSession([]);

    renderWithProviders(
      <RequireSession>
        <UbText as="span" variant="body">the app</UbText>
      </RequireSession>
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/onboarding'));
    expect(screen.queryByText('the app')).not.toBeInTheDocument();
  });

  it('sends an invited-only user who lands on another (app) route TO the chooser', async () => {
    pathname = '/parties';
    loadSession([tenant({ id: 't9', status: 'invited' })]);

    renderWithProviders(
      <RequireSession>
        <UbText as="span" variant="body">the parties list</UbText>
      </RequireSession>
    );

    // Not `/onboarding`: they have something to accept, not a business to make.
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/switch'));
    expect(screen.queryByText('the parties list')).not.toBeInTheDocument();
  });

  it('renders nothing but never bounces a session that HAS an active tenant', async () => {
    pathname = '/parties';
    const active = tenant();
    loadSession([active], active);

    renderWithProviders(
      <RequireSession>
        <UbText as="span" variant="body">the parties list</UbText>
      </RequireSession>
    );

    expect(await screen.findByText('the parties list')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('sends an anonymous session to login carrying where it was going', async () => {
    pathname = '/parties';
    store.dispatch(sessionExpired());

    renderWithProviders(
      <RequireSession>
        <UbText as="span" variant="body">the parties list</UbText>
      </RequireSession>
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login?next=%2Fparties'));
  });
});


describe('RequireSession — the forced password change (DEC-012)', () => {
  it('sends a member on an owner-issued password to the change screen', async () => {
    // The server refuses every other route while this flag is set. Without the
    // redirect the person sees a wall of 403s on their first ever sign-in.
    pathname = '/dashboard';
    loadSession([tenant({ isDefault: true })], tenant({ isDefault: true }), {
      mustChangePassword: true,
    });

    renderWithProviders(
      <RequireSession>
        <UbText>the app</UbText>
      </RequireSession>
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/set-password'));
    expect(screen.queryByText('the app')).not.toBeInTheDocument();
  });

  it('outranks the no-tenant redirect rather than losing to it', async () => {
    // The sharp case. A member added to ONE business who has not changed their
    // password reads as `no_tenant`, because the session fetch that would
    // populate `activeTenant` is one of the requests the server is refusing.
    // Checked second, this guard would send them into the onboarding wizard to
    // create a business they do not want, on an account they cannot yet use.
    pathname = '/dashboard';
    loadSession([], null, { mustChangePassword: true });

    renderWithProviders(
      <RequireSession>
        <UbText>the app</UbText>
      </RequireSession>
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/set-password'));
    expect(replace).not.toHaveBeenCalledWith('/onboarding');
  });

  it('lets an ordinary session through untouched', async () => {
    pathname = '/dashboard';
    loadSession([tenant({ isDefault: true })], tenant({ isDefault: true }));

    renderWithProviders(
      <RequireSession>
        <UbText>the app</UbText>
      </RequireSession>
    );

    expect(await screen.findByText('the app')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalledWith('/set-password');
  });
});
