import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded, type SessionImpersonation } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import * as adminService from '../api/adminService';

import { AdminTenantDetailPageContent } from './AdminTenantDetailPageContent';
import { ImpersonationBanner } from './ImpersonationBanner';
import { RequireSuperAdmin } from './RequireSuperAdmin';

import type { AdminTenantDetail } from '../types/admin.types';

/**
 * PLT-14 inside the client: the console's guard, the support control on the
 * tenant card (it must never offer "Enter" without a granted consent), and the
 * support banner's way out.
 */
jest.mock('../api/adminService');
const service = jest.mocked(adminService);

jest.mock('src/utils/documentNavigation', () => ({ replaceDocument: jest.fn() }));
const navigation = jest.requireMock('src/utils/documentNavigation') as {
  replaceDocument: jest.Mock;
};

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/admin/tenants',
}));

const signIn = (isSuperAdmin: boolean, impersonation: SessionImpersonation | null = null): void => {
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Ops Person',
        email: 'ops@example.com',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
        isSuperAdmin,
      },
      activeTenant: impersonation
        ? { id: 't1', name: 'Sharma Kirana', timezone: 'Asia/Kolkata' }
        : null,
      tenants: [],
      permissions: [],
      enabledModules: [],
      version: null,
      impersonation,
    })
  );
};

const tenant = (over: Partial<AdminTenantDetail> = {}): AdminTenantDetail => ({
  id: 't1',
  name: 'Sharma Kirana',
  status: 'active',
  businessType: 'retail',
  gstin: null,
  partner: { id: 'pa', code: 'metis', name: 'Metis' },
  plan: { id: 'pl', code: 'free', name: 'Free' },
  ownerEmail: 'ramesh@example.com',
  createdAt: '2026-09-01T10:00:00Z',
  lastActivityAt: null,
  members: 1,
  parties: 4,
  legalName: null,
  stateCode: '27',
  deletionRequestedAt: null,
  enabledModules: ['parties'],
  planCode: 'free',
  maxUsers: { limit: 3, used: 1 },
  storageMb: { limit: 500, used: 0 },
  overrides: { maxUsers: null, storageMb: null },
  owners: [{ id: 'u2', name: 'Ramesh', email: 'ramesh@example.com' }],
  supportAccess: null,
  recentAudit: [],
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  service.listPlans.mockResolvedValue([]);
});

describe('RequireSuperAdmin', () => {
  it('shows a merchant the refusal, not the console', () => {
    signIn(false);
    renderWithProviders(
      <RequireSuperAdmin>
        <>console</>
      </RequireSuperAdmin>
    );
    expect(screen.getByText('This page is for platform operators')).toBeInTheDocument();
    expect(screen.queryByText('console')).not.toBeInTheDocument();
  });

  it('lets an operator in, and keeps a support session out', () => {
    signIn(true);
    const { unmount } = renderWithProviders(
      <RequireSuperAdmin>
        <>console</>
      </RequireSuperAdmin>
    );
    expect(screen.getByText('console')).toBeInTheDocument();
    unmount();

    signIn(true, {
      id: 'i1',
      tenantId: 't1',
      tenantName: 'Sharma Kirana',
      adminName: 'Ops Person',
      startedAt: '2026-09-24T10:00:00Z',
      expiresAt: '2026-09-24T11:00:00Z',
    });
    renderWithProviders(
      <RequireSuperAdmin>
        <>console</>
      </RequireSuperAdmin>
    );
    expect(screen.getByText('You are in a support session')).toBeInTheDocument();
  });
});

describe('AdminTenantDetailPageContent', () => {
  it('offers Request access, never Enter, while no owner has said yes', async () => {
    signIn(true);
    service.getTenant.mockResolvedValue(tenant());
    renderWithProviders(<AdminTenantDetailPageContent id="t1" />);
    expect(await screen.findByRole('button', { name: 'Request access' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Enter business' })).not.toBeInTheDocument();
  });

  it('waits while the request is open, and enters by a document load once granted', async () => {
    signIn(true);
    const access = {
      id: 'a1',
      status: 'requested' as const,
      reason: 'Wrong balance',
      requestedBy: 'Ops Person',
      requestedAt: '2026-09-24T10:00:00Z',
      decidedBy: null,
      decidedAt: null,
      expiresAt: '2026-09-25T10:00:00Z',
      activeSessionEndsAt: null,
    };
    service.getTenant.mockResolvedValue(tenant({ supportAccess: access }));
    const { unmount } = renderWithProviders(<AdminTenantDetailPageContent id="t1" />);
    expect(await screen.findByRole('button', { name: 'Waiting for owner' })).toBeDisabled();
    unmount();

    service.getTenant.mockResolvedValue(
      tenant({ supportAccess: { ...access, status: 'granted' } })
    );
    service.impersonate.mockResolvedValue(undefined);
    renderWithProviders(<AdminTenantDetailPageContent id="t1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Enter business' }));
    await userEvent.type(
      await screen.findByPlaceholderText('e.g. Owner reported a wrong balance on 3 Sep'),
      'Reproduce the wrong balance'
    );
    const enterButtons = screen.getAllByRole('button', { name: 'Enter business' });
    await userEvent.click(enterButtons[enterButtons.length - 1] as HTMLElement);
    await waitFor(() =>
      expect(service.impersonate).toHaveBeenCalledWith('t1', 'a1', 'Reproduce the wrong balance')
    );
    expect(navigation.replaceDocument).toHaveBeenCalledWith('/dashboard');
  });
});

describe('ImpersonationBanner', () => {
  it('names who is acting where, and ends the session back to the tenant card', async () => {
    signIn(true, {
      id: 'i1',
      tenantId: 't1',
      tenantName: 'Sharma Kirana',
      adminName: 'Ops Person',
      startedAt: '2026-09-24T10:00:00Z',
      expiresAt: '2026-09-24T11:00:00Z',
    });
    service.endImpersonation.mockResolvedValue('t1');
    renderWithProviders(<ImpersonationBanner />);
    expect(
      screen.getByText(/Support session — Ops Person acting in Sharma Kirana/)
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'End session' }));
    await waitFor(() =>
      expect(navigation.replaceDocument).toHaveBeenCalledWith('/admin/tenants/t1')
    );
  });
});
