import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetAllFeatureState } from 'src/redux/actions';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import * as service from '../api/libraryCirculationService';

import { CounterPageContent } from './CounterPageContent';

import type { CounterMember, LoanRow } from '../types/counter.types';

/**
 * F05 (LIB-06) — the counter end to end against a mocked server: a card loads
 * the member; a book is issued at once with no confirm step; an overridable
 * block asks for a reason and re-sends the SAME code with it; a book already
 * with the member offers Return or Renew instead of a refusal (FR-9); a name
 * is a member search, not a lookup failure.
 */
jest.mock('../api/libraryCirculationService', () => ({
  ...jest.requireActual('../api/libraryCirculationService'),
  lookup: jest.fn(),
  getCounterMember: jest.fn(),
  searchMembers: jest.fn(),
  issueCopy: jest.fn(),
  returnCopy: jest.fn(),
}));

const ASHA: CounterMember = {
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
  loans: [],
};

const LOAN: LoanRow = {
  id: 'l1',
  copy: { id: 'c1', accessionNumber: '4513', title: 'Wings of Fire', authors: '' },
  membership: { id: 'm1', memberNumber: 'M-0043', name: 'Asha Kulkarni', groupLabel: '9-B' },
  issuedOn: '2026-10-04',
  dueOn: '2026-10-18',
  returnedOn: null,
  status: 'open',
  renewCount: 0,
  maxRenewals: 2,
  daysOverdue: 0,
  fineSoFar: '0.00',
  overrideReason: '',
};

const conflict = (code: string, details: object) =>
  Object.assign(new Error(code), {
    isAxiosError: true,
    response: { status: 409, data: { error: { code, message: code, details } }, headers: {} },
  });

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  store.dispatch(resetAllFeatureState());
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
      permissions: ['library.loan.write', 'library.loan.read', 'library.loan.override'],
      enabledModules: ['library'],
      version: 1,
    })
  );
  jest
    .mocked(service.lookup)
    .mockImplementation(async (code: string) =>
      code === 'M-0043'
        ? { kind: 'member', member: ASHA }
        : code === '4513'
          ? { kind: 'copy', copyId: 'c1', title: 'Wings of Fire' }
          : { kind: 'none' }
    );
  jest.mocked(service.getCounterMember).mockResolvedValue(ASHA);
});

const scan = async (code: string): Promise<void> => {
  const box = screen.getByTestId('counter-box');
  await userEvent.type(box, `${code}{Enter}`);
};

describe('CounterPageContent', () => {
  it('loads the member from a card and issues a book at once', async () => {
    jest.mocked(service.issueCopy).mockResolvedValue({ loan: LOAN });
    renderWithProviders(<CounterPageContent />);
    await scan('M-0043');
    expect(await screen.findByTestId('counter-member-panel')).toHaveTextContent('Asha Kulkarni');
    await scan('4513');
    expect(await screen.findByTestId('counter-row-issued')).toHaveTextContent('Wings of Fire');
    expect(service.issueCopy).toHaveBeenCalledWith(
      { membership_id: 'm1', copy_id: 'c1' },
      expect.any(String)
    );
  });

  it('asks for a reason on an overridable block and re-sends the same code with it', async () => {
    jest
      .mocked(service.issueCopy)
      .mockRejectedValueOnce(
        conflict('library_member_blocked', {
          blocks: [{ code: 'copy_limit_reached', overridable: true, params: { held: 2, max: 2 } }],
        })
      )
      .mockResolvedValueOnce({ loan: { ...LOAN, overrideReason: 'Project work' } });
    renderWithProviders(<CounterPageContent />);
    await scan('M-0043');
    await screen.findByTestId('counter-member-panel');
    await scan('4513');
    const reason = await screen.findByRole('textbox', { name: 'Reason' });
    await userEvent.type(reason, 'Project work{Enter}');
    await waitFor(() => expect(service.issueCopy).toHaveBeenCalledTimes(2));
    expect(jest.mocked(service.issueCopy).mock.calls[1]?.[0]).toEqual({
      membership_id: 'm1',
      copy_id: 'c1',
      override_reason: 'Project work',
    });
    expect(await screen.findByTestId('counter-row-issued')).toHaveTextContent('Override');
  });

  it('offers Return or Renew for a book already with the member (FR-9)', async () => {
    jest.mocked(service.issueCopy).mockRejectedValue(
      conflict('library_copy_unavailable', {
        status: 'on_loan',
        with: {
          name: 'Asha Kulkarni',
          member_number: 'M-0043',
          due_on: '2026-10-18',
          membership_id: 'm1',
        },
      })
    );
    jest.mocked(service.returnCopy).mockResolvedValue({
      loan: { ...LOAN, status: 'returned', returnedOn: '2026-10-04' },
      fine: null,
      daysLate: 0,
      holdReady: null,
      fineCharge: null,
    });
    renderWithProviders(<CounterPageContent />);
    await scan('M-0043');
    await screen.findByTestId('counter-member-panel');
    await scan('4513');
    const offer = await screen.findByTestId('counter-already-with');
    await act(async () => {
      await userEvent.click(within(offer).getByRole('button', { name: 'Return' }));
    });
    expect(await screen.findByTestId('counter-row-returned')).toBeInTheDocument();
    expect(service.returnCopy).toHaveBeenCalledWith('c1', expect.any(String));
  });

  it('treats a typed name as a member search', async () => {
    jest.mocked(service.searchMembers).mockResolvedValue([ASHA]);
    renderWithProviders(<CounterPageContent />);
    await scan('asha k');
    expect(await screen.findByRole('list', { name: 'Matching members' })).toHaveTextContent(
      'Asha Kulkarni'
    );
    // QA-F05-3 — the box is empty after the search; Enter picks the first name.
    await userEvent.type(screen.getByTestId('counter-box'), '{Enter}');
    expect(await screen.findByTestId('counter-member-panel')).toHaveTextContent('Asha Kulkarni');
  });
});
