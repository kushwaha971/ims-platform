import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import * as service from '../api/libraryMemberService';

import { MemberDetailPageContent } from './MemberDetailPageContent';
import { changedFields } from './MemberEditDrawer';

import type { MemberDetail } from '../types/member.types';

/**
 * Owner, 12 Oct 2026 — editing a student and blocking or unblocking them is the
 * owner's or an admin's, "not other users". These tests prevent two defects:
 * the acts being DRAWN for a role the server will refuse (a control that can
 * only fail), and the edit drawer sending fields nobody changed or losing the
 * `version` the server requires.
 */
jest.mock('../api/libraryMemberService', () => ({
  ...jest.requireActual('../api/libraryMemberService'),
  getMember: jest.fn(),
  listMembershipTypes: jest.fn(),
  actOnMember: jest.fn(),
  placeMember: jest.fn(),
  updateMember: jest.fn(),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/library/members/m1',
  useSearchParams: () => new URLSearchParams(),
}));

const ASHA: MemberDetail = {
  membershipId: 'm1',
  partyId: 'p1',
  name: 'Asha Kulkarni',
  memberNumber: 'M-0043',
  type: { id: 'ty1', name: 'Student', maxCopies: 2 },
  status: 'active',
  effectiveStatus: 'active',
  startsOn: '2026-04-01',
  validUntil: '2027-03-31',
  groupLabel: '9-B',
  shift: null,
  seat: null,
  lockerLabel: '',
  planFee: '150.00',
  validityMonths: 6,
  feeState: 'paid',
  loansOpen: 0,
  loansOverdue: 0,
  holdsReady: 0,
  duesAmount: '0.00',
  deposit: null,
  blocks: [],
  party: { id: 'p1', name: 'Asha Kulkarni', mobile: '+919876543210' },
  guardian: null,
  suspendedUntil: null,
  suspensionReason: '',
  closedOn: null,
  closedReason: '',
  notes: '',
  periods: [],
  chargesOpen: [],
  version: 4,
};

/** Every member codename, so a refusal below is the ROLE's and not a codename's. */
const ALL: PermissionCode[] = [
  'library.member.read',
  'library.member.write',
  'library.member.close',
];

const signIn = (role: string, permissions: PermissionCode[] = ALL): void => {
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Someone',
        email: 'someone@library.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'Saraswati Library', timezone: 'Asia/Kolkata', role },
      tenants: [{ id: 't1', name: 'Saraswati Library', timezone: 'Asia/Kolkata' }],
      permissions,
      enabledModules: ['library'],
      version: 1,
    })
  );
};

const openMenu = async (): Promise<void> => {
  await screen.findByTestId('library-member-number');
  await userEvent.click(screen.getByTestId('library-more'));
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(service.getMember).mockResolvedValue(ASHA);
  jest.mocked(service.listMembershipTypes).mockResolvedValue([]);
});

describe('who sees the acts on a student', () => {
  it.each(['owner', 'admin'])('offers %s edit, suspend and close', async (role) => {
    signIn(role);
    renderWithProviders(<MemberDetailPageContent id="m1" />);
    await openMenu();
    expect(screen.getByTestId('library-action-edit')).toBeInTheDocument();
    expect(screen.getByTestId('library-action-suspend')).toBeInTheDocument();
    expect(screen.getByTestId('library-action-close')).toBeInTheDocument();
  });

  it.each(['staff', 'librarian_custom'])(
    'hides edit, suspend and close from %s holding every codename, and keeps the seat',
    async (role) => {
      signIn(role);
      renderWithProviders(<MemberDetailPageContent id="m1" />);
      await openMenu();
      /* The positive assertion first, so the negatives cannot pass because the
         menu never opened: the desk still seats the student. */
      expect(screen.getByTestId('library-action-seat')).toBeInTheDocument();
      expect(screen.queryByTestId('library-action-edit')).not.toBeInTheDocument();
      expect(screen.queryByTestId('library-action-suspend')).not.toBeInTheDocument();
      expect(screen.queryByTestId('library-action-close')).not.toBeInTheDocument();
    }
  );

  it('hides reactivate from staff and offers it to the owner', async () => {
    jest
      .mocked(service.getMember)
      .mockResolvedValue({ ...ASHA, status: 'suspended', effectiveStatus: 'suspended' });
    signIn('staff');
    const { unmount } = renderWithProviders(<MemberDetailPageContent id="m1" />);
    await openMenu();
    expect(screen.getByTestId('library-action-seat')).toBeInTheDocument();
    expect(screen.queryByTestId('library-action-reactivate')).not.toBeInTheDocument();
    unmount();

    signIn('owner');
    renderWithProviders(<MemberDetailPageContent id="m1" />);
    await openMenu();
    expect(screen.getByTestId('library-action-reactivate')).toBeInTheDocument();
  });

  it('hides re-join from staff and offers it to an admin', async () => {
    jest.mocked(service.getMember).mockResolvedValue({
      ...ASHA,
      status: 'closed',
      effectiveStatus: 'closed',
      closedOn: '2026-10-01',
    });
    signIn('staff');
    const { unmount } = renderWithProviders(<MemberDetailPageContent id="m1" />);
    await openMenu();
    expect(screen.getByTestId('library-action-receipt')).toBeInTheDocument();
    expect(screen.queryByTestId('library-action-rejoin')).not.toBeInTheDocument();
    unmount();

    signIn('admin');
    renderWithProviders(<MemberDetailPageContent id="m1" />);
    await openMenu();
    expect(screen.getByTestId('library-action-rejoin')).toBeInTheDocument();
  });
});

describe('the edit drawer', () => {
  /** B40: a copied register needs its original joining date, not today's lower bound. */
  it('offers an editable joining date in the student drawer', async () => {
    signIn('owner');
    renderWithProviders(<MemberDetailPageContent id="m1" />);
    await openMenu();
    await userEvent.click(screen.getByTestId('library-action-edit'));
    expect(await screen.findByRole('button', { name: /Joined on/ })).toHaveTextContent(
      '1 Apr 2026'
    );
  });

  it('sends only what changed, with the version, and takes the answer', async () => {
    jest.mocked(service.updateMember).mockResolvedValue({
      ...ASHA,
      groupLabel: '10-A',
      notes: 'Sits by the window',
      version: 5,
    });
    signIn('owner');
    renderWithProviders(<MemberDetailPageContent id="m1" />);
    await openMenu();
    await userEvent.click(screen.getByTestId('library-action-edit'));

    const group = await screen.findByDisplayValue('9-B');
    expect(screen.getByDisplayValue('M-0043')).toBeInTheDocument();
    await userEvent.clear(group);
    await userEvent.type(group, '10-A');
    const notes = screen.getByRole('textbox', { name: /library\.member\.edit\.notes|Notes/ });
    await userEvent.type(notes, 'Sits by the window');
    await userEvent.click(screen.getByTestId('library-member-edit-save'));

    await waitFor(() =>
      expect(service.updateMember).toHaveBeenCalledWith(
        'm1',
        { groupLabel: '10-A', notes: 'Sits by the window' },
        4
      )
    );
    expect(await screen.findByText('10-A')).toBeInTheDocument();
  });

  it('refuses an empty student number before any request', async () => {
    signIn('owner');
    renderWithProviders(<MemberDetailPageContent id="m1" />);
    await openMenu();
    await userEvent.click(screen.getByTestId('library-action-edit'));
    await userEvent.clear(await screen.findByDisplayValue('M-0043'));
    await userEvent.click(screen.getByTestId('library-member-edit-save'));
    expect(
      await screen.findByText(/library\.member\.edit\.number\.required|Enter the student number/)
    ).toBeInTheDocument();
    expect(service.updateMember).not.toHaveBeenCalled();
  });
});

describe('changedFields', () => {
  const values = {
    memberNumber: 'M-0043',
    groupLabel: '9-B',
    startsOn: '2026-04-01',
    validUntil: '2027-03-31',
    notes: '',
  };

  /** B40: both historical dates must travel together rather than losing Joined. */
  it('sends a corrected joining date alongside an already expired plan end', () => {
    expect(
      changedFields(ASHA, { ...values, startsOn: '2025-09-01', validUntil: '2025-10-05' })
    ).toEqual({ startsOn: '2025-09-01', validUntil: '2025-10-05' });
  });

  it('is empty when nothing changed, so no request is made', () => {
    expect(changedFields(ASHA, values)).toEqual({});
  });

  it('sends a cleared end date as null, never as an empty string', () => {
    expect(changedFields(ASHA, { ...values, validUntil: '' })).toEqual({ validUntil: null });
  });

  it('trims, so whitespace alone is not a change', () => {
    expect(
      changedFields(ASHA, { ...values, groupLabel: ' 9-B ', memberNumber: 'M-0050 ' })
    ).toEqual({ memberNumber: 'M-0050' });
  });
});
