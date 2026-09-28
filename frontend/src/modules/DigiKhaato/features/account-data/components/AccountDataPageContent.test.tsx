import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import * as accountDataService from '../api/accountDataService';

import { AccountDataPageContent } from './AccountDataPageContent';

import type { DeletionState, SupportAccess } from '../types/accountData.types';

/**
 * PLT-10 — "Your data", inside the client. What each test defends is in its
 * name: the owner-only gate (an admin holds `platform.tenant.manage` and must
 * still see nothing), the export gate on Delete, the countdown with its one
 * action, and the owner's answer to a support request.
 */
jest.mock('../api/accountDataService');

const service = jest.mocked(accountDataService);

// Deleting and cancelling re-read `/auth/me` so the shell's banner follows. A
// re-read that never answers keeps one test's session from landing in the next.
jest.mock('modules/DigiKhaato/features/auth/api/authService', () => ({
  ...jest.requireActual('modules/DigiKhaato/features/auth/api/authService'),
  getSession: jest.fn(() => new Promise(() => undefined)),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/settings/data',
}));

const state = (over: Partial<DeletionState> = {}): DeletionState => ({
  status: 'active',
  deletionRequestedAt: null,
  scheduledFor: null,
  coolOffDays: 30,
  exportFresh: false,
  latestExport: null,
  businessName: 'Sharma Kirana',
  ...over,
});

const request = (over: Partial<SupportAccess> = {}): SupportAccess => ({
  id: 'a1',
  status: 'requested',
  reason: 'Owner reported a wrong balance',
  requestedBy: 'Ops Person',
  requestedAt: '2026-09-24T10:00:00Z',
  decidedBy: null,
  decidedAt: null,
  expiresAt: '2026-09-25T10:00:00Z',
  activeSessionEndsAt: null,
  ...over,
});

const signInAs = (role: string): void => {
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Ramesh',
        email: 'ramesh@example.com',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'Sharma Kirana', timezone: 'Asia/Kolkata', role },
      tenants: [],
      permissions: [],
      enabledModules: [],
      version: 1,
    })
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  service.listExports.mockResolvedValue([]);
  service.listSupportAccess.mockResolvedValue([]);
  service.getDeletionState.mockResolvedValue(state());
});

describe('AccountDataPageContent', () => {
  it('shows an admin nothing but the owner-only notice, and asks the server nothing', () => {
    signInAs('admin');
    renderWithProviders(<AccountDataPageContent />);
    expect(screen.getByText('Only the owner can open this page')).toBeInTheDocument();
    expect(service.getDeletionState).not.toHaveBeenCalled();
  });

  it('keeps Delete disabled until a fresh export exists (the export gate)', async () => {
    signInAs('owner');
    renderWithProviders(<AccountDataPageContent />);
    const button = await screen.findByRole('button', { name: 'Delete business' });
    expect(button).toBeDisabled();
    expect(screen.getByText(/Download your data first/)).toBeInTheDocument();
  });

  it('opens the confirmation once the export is fresh', async () => {
    service.getDeletionState.mockResolvedValue(state({ exportFresh: true }));
    signInAs('owner');
    renderWithProviders(<AccountDataPageContent />);
    const button = await screen.findByRole('button', { name: 'Delete business' });
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(await screen.findByText('Delete this business?')).toBeInTheDocument();
    expect(
      screen.getByText(/GST law asks you to keep invoices/, { selector: 'li' })
    ).toBeInTheDocument();
  });

  it('turns into the cool-off countdown with Cancel once deletion is requested', async () => {
    const in10Days = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000 - 60_000).toISOString();
    service.getDeletionState.mockResolvedValue(
      state({ status: 'pending_deletion', scheduledFor: in10Days, deletionRequestedAt: in10Days })
    );
    service.cancelDeletion.mockResolvedValue(state());
    signInAs('owner');
    renderWithProviders(<AccountDataPageContent />);
    expect(await screen.findByText('10 days left to change your mind.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete business' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel deletion' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Keep the business' }));
    await waitFor(() => expect(service.cancelDeletion).toHaveBeenCalledTimes(1));
  });

  it("sends the owner's Allow for a waiting support request", async () => {
    service.listSupportAccess.mockResolvedValue([request()]);
    service.decideSupportAccess.mockResolvedValue(request({ status: 'granted' }));
    signInAs('owner');
    renderWithProviders(<AccountDataPageContent />);
    expect(await screen.findByText('Owner reported a wrong balance')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Allow for 24 hours' }));
    await waitFor(() => expect(service.decideSupportAccess).toHaveBeenCalledWith('a1', 'allow'));
    expect(await screen.findByRole('button', { name: 'End access now' })).toBeInTheDocument();
  });

  it('starts an export and lists it as preparing', async () => {
    service.requestExport.mockResolvedValue({
      id: 'e1',
      status: 'queued',
      requestedAt: '2026-09-24T10:00:00Z',
      finishedAt: null,
      expiresAt: null,
      sizeBytes: null,
      rowCounts: {},
      downloadUrl: null,
      requestedBy: 'Ramesh',
    });
    signInAs('owner');
    renderWithProviders(<AccountDataPageContent />);
    await userEvent.click(await screen.findByRole('button', { name: 'Download all data' }));
    await waitFor(() => expect(service.requestExport).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Waiting')).toBeInTheDocument();
  });
});
