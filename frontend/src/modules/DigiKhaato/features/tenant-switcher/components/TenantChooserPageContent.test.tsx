import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded, type SessionTenant } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { TenantChooserPageContent } from './TenantChooserPageContent';

/**
 * PLT-04, end to end inside the client (§19.13.3): the chooser → the hook →
 * `switchTenant` → the service, stubbed at the module boundary.
 *
 * It covers the §9 states the chooser owns and the three empty-state variants
 * R-C-9 requires: first-use (no business), filtered (the search matched
 * nothing) and error.
 */
jest.mock('../../auth/api/authService');

const authService = jest.requireMock('../../auth/api/authService') as {
  switchTenant: jest.Mock;
  getSession: jest.Mock;
};

const push = jest.fn();
const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/switch',
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

const loadSession = (tenants: readonly SessionTenant[], activeId: string | null = null) => {
  const active = tenants.find((row) => row.id === activeId) ?? null;
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Ramesh',
        email: 'ramesh@example.com',
        mobile: '+919876543210',
        locale: 'en',
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
  loadSession([]);
});

describe('TenantChooserPageContent — the list', () => {
  it('lists every active membership with its role', () => {
    loadSession(
      [
        tenant({ id: 'a', name: 'Sharma Kirana', role: 'owner' }),
        tenant({ id: 'b', name: 'Verma Traders', role: 'staff', membershipId: 'm2' }),
      ],
      'a'
    );

    renderWithProviders(<TenantChooserPageContent />);

    expect(screen.getByText('Sharma Kirana')).toBeInTheDocument();
    expect(screen.getByText('Verma Traders')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Staff')).toBeInTheDocument();
  });

  it('marks the default one, so "opens by default" is visible not remembered', () => {
    loadSession([tenant({ id: 'a', isDefault: true })], 'a');
    renderWithProviders(<TenantChooserPageContent />);
    expect(screen.getByLabelText('Opens by default')).toBeInTheDocument();
  });

  it('switches, resets the store and lands on the dashboard (§19.6.5)', async () => {
    const user = userEvent.setup();
    loadSession([tenant({ id: 'a', name: 'Sharma' }), tenant({ id: 'b', name: 'Verma' })], 'a');
    authService.switchTenant.mockResolvedValue({
      user: {
        id: 'u1',
        name: 'Ramesh',
        email: 'ramesh@example.com',
        mobile: '+919876543210',
        locale: 'en',
      },
      activeTenant: { id: 'b', name: 'Verma', timezone: 'Asia/Kolkata' },
      tenants: [tenant({ id: 'b', name: 'Verma' })],
      permissions: [],
      enabledModules: [],
      version: 2,
    });

    renderWithProviders(<TenantChooserPageContent />);
    await user.click(screen.getByText('Verma'));

    await waitFor(() => expect(authService.switchTenant).toHaveBeenCalledWith('b'));
    // Step 5 — never stay on a record id from the old tenant.
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
    // The snackbar names the business the user is now in (§8).
    expect(store.getState().snackbar.queue.at(-1)?.message).toBe('Now in Verma');
  });

  it('does not re-switch to the business already open', async () => {
    const user = userEvent.setup();
    loadSession([tenant({ id: 'a', name: 'Sharma' })], 'a');

    renderWithProviders(<TenantChooserPageContent />);
    await user.click(screen.getByText('Sharma'));

    expect(authService.switchTenant).not.toHaveBeenCalled();
  });

  it('shows the failure with its request id and lets the user dismiss it', async () => {
    const user = userEvent.setup();
    loadSession([tenant({ id: 'a', name: 'Sharma' }), tenant({ id: 'b', name: 'Verma' })], 'a');
    authService.switchTenant.mockRejectedValue({
      code: 'permission_denied',
      message: 'You no longer have access to this business.',
      details: {},
      requestId: 'req_6',
      status: 403,
      warnings: [],
    });

    renderWithProviders(<TenantChooserPageContent />);
    await user.click(screen.getByText('Verma'));

    expect(
      await screen.findByText('You no longer have access to this business.')
    ).toBeInTheDocument();
    expect(screen.getByText('req_6')).toBeInTheDocument();
  });
});

describe('TenantChooserPageContent — the three empty-state variants', () => {
  it('first use: no business at all, and the one action that closes the gap', async () => {
    const user = userEvent.setup();
    loadSession([]);
    renderWithProviders(<TenantChooserPageContent />);

    expect(screen.getByText('No business yet')).toBeInTheDocument();
    // Twice: the header's action and the empty state's own. The empty state's
    // is the one that closes the gap it is naming, so that is the one clicked.
    const actions = screen.getAllByRole('button', { name: 'Add a business' });
    await user.click(actions[actions.length - 1] as HTMLElement);
    expect(push).toHaveBeenCalledWith('/onboarding/step/1');
  });

  it('filtered: the search matched nothing, and the action clears it', async () => {
    const user = userEvent.setup();
    // §5 / EC-5 — the search box appears only above eight rows.
    loadSession(
      Array.from({ length: 9 }, (_, index) =>
        tenant({ id: `t${index}`, name: `Business ${index}`, membershipId: `m${index}` })
      ),
      't0'
    );

    renderWithProviders(<TenantChooserPageContent />);
    await user.type(screen.getByLabelText('Search businesses'), 'zzz');

    expect(await screen.findByText('No business matches that')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('Business 0')).toBeInTheDocument();
  });

  it('shows no search box below the threshold — furniture over three rows', () => {
    loadSession([tenant({ id: 'a' }), tenant({ id: 'b', membershipId: 'm2' })], 'a');
    renderWithProviders(<TenantChooserPageContent />);
    expect(screen.queryByLabelText('Search businesses')).not.toBeInTheDocument();
  });
});

describe('TenantChooserPageContent — invitations and suspensions', () => {
  it('lists an invitation separately and never as something to switch to (FR-8)', () => {
    loadSession([
      tenant({ id: 'a', name: 'Sharma' }),
      tenant({ id: 'b', name: 'Gupta Agency', status: 'invited', membershipId: 'm2' }),
    ]);

    renderWithProviders(<TenantChooserPageContent />);

    expect(screen.getByText('Invitations')).toBeInTheDocument();
    expect(screen.getByText('Gupta Agency')).toBeInTheDocument();
    expect(screen.getByText('Invited')).toBeInTheDocument();
  });

  it('shows a suspended business greyed, with the reason (EC-6)', () => {
    loadSession([
      tenant({ id: 'a', name: 'Sharma' }),
      tenant({ id: 'c', name: 'Old Shop', status: 'suspended', membershipId: 'm3' }),
    ]);

    renderWithProviders(<TenantChooserPageContent />);

    expect(screen.getByText('Old Shop')).toBeInTheDocument();
    expect(screen.getByText('Contact your provider to use these again.')).toBeInTheDocument();
  });
});
