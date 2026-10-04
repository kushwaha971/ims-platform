import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import * as service from '../api/libraryMemberService';

import { MemberDetailPageContent } from './MemberDetailPageContent';

import type { MemberDetail } from '../types/member.types';

/**
 * F04 (LIB-04 §8) — the member page: the number in mono beside the status
 * word; Renew is the one primary action; closing is refused IN the dialog
 * while a book is out (BR-6) rather than after a request; a block's amounts
 * are grouped with ₹ (the `formatInr` lesson).
 */
jest.mock('../api/libraryMemberService', () => ({
  ...jest.requireActual('../api/libraryMemberService'),
  getMember: jest.fn(),
  listMembershipTypes: jest.fn(),
  actOnMember: jest.fn(),
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
  loansOpen: 1,
  loansOverdue: 0,
  holdsReady: 0,
  duesAmount: '1200.00',
  deposit: null,
  blocks: [
    { code: 'dues_over_limit', overridable: true, params: { dues: '1200.00', limit: '500.00' } },
  ],
  party: { id: 'p1', name: 'Asha Kulkarni', mobile: '+919876543210' },
  guardian: { partyId: 'g1', name: 'Suresh Kulkarni' },
  suspendedUntil: null,
  suspensionReason: '',
  closedOn: null,
  closedReason: '',
  notes: '',
  periods: [],
  chargesOpen: [],
  version: 1,
};

const signIn = (permissions: PermissionCode[]): void => {
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Owner',
        email: 'owner@library.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'Saraswati Library', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Saraswati Library', timezone: 'Asia/Kolkata' }],
      permissions,
      enabledModules: ['library'],
      version: 1,
    })
  );
};

beforeEach(() => {
  jest.mocked(service.getMember).mockResolvedValue(ASHA);
  jest.mocked(service.listMembershipTypes).mockResolvedValue([]);
});

describe('MemberDetailPageContent', () => {
  it('shows the number, the status and the block with its amounts grouped', async () => {
    signIn(['library.member.read', 'library.member.write', 'library.member.close']);
    renderWithProviders(<MemberDetailPageContent id="m1" />);
    expect(await screen.findByTestId('library-member-number')).toHaveTextContent('M-0043');
    expect(
      screen.getByText('Owes ₹1,200.00, above the ₹500.00 this type allows.')
    ).toBeInTheDocument();
    expect(screen.getByTestId('library-member-renew')).toBeInTheDocument();
    // QA-F04-2 — the label says "Valid until"; the value is the date, not the sentence again.
    expect(screen.getByText('31/03/2027')).toBeInTheDocument();
    expect(screen.queryByText('Valid until 31/03/2027')).not.toBeInTheDocument();
  });

  it('refuses to close while a book is out, in the dialog, without a request', async () => {
    signIn(['library.member.read', 'library.member.write', 'library.member.close']);
    renderWithProviders(<MemberDetailPageContent id="m1" />);
    await screen.findByTestId('library-member-number');
    await userEvent.click(screen.getByTestId('library-more'));
    await userEvent.click(screen.getByRole('button', { name: 'Close membership' }));
    expect(await screen.findByTestId('library-close-books-out')).toHaveTextContent(
      '1 book is still out.'
    );
    expect(service.actOnMember).not.toHaveBeenCalled();
  });

  it('offers a reader no acts at all', async () => {
    signIn(['library.member.read']);
    renderWithProviders(<MemberDetailPageContent id="m1" />);
    await screen.findByTestId('library-member-number');
    expect(screen.queryByTestId('library-member-renew')).not.toBeInTheDocument();
    expect(screen.queryByTestId('library-more')).not.toBeInTheDocument();
  });
});
