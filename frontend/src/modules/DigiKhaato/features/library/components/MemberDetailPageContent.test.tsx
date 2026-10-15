import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import * as payments from 'modules/DigiKhaato/features/payments/api/paymentService';

import * as chargeService from '../api/libraryChargeService';
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
  placeMember: jest.fn(),
}));
jest.mock('../api/libraryChargeService', () => ({
  ...jest.requireActual('../api/libraryChargeService'),
  listMemberCharges: jest.fn(),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/library/members/m1',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('modules/DigiKhaato/features/payments/api/paymentService', () => ({
  ...jest.requireActual('modules/DigiKhaato/features/payments/api/paymentService'),
  listPayments: jest.fn(),
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

/* `role` defaults to the owner: editing, suspending, closing and re-admitting a
   student are the owner's or an admin's since 12 Oct 2026, so a session with
   no role sees none of them (`MemberEditDrawer.test.tsx` covers the roles). */
const signIn = (
  permissions: PermissionCode[],
  role: string = 'owner',
  paymentsEnabled = false
): void => {
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
      activeTenant: { id: 't1', name: 'Saraswati Library', timezone: 'Asia/Kolkata', role },
      tenants: [{ id: 't1', name: 'Saraswati Library', timezone: 'Asia/Kolkata' }],
      permissions,
      enabledModules: paymentsEnabled ? ['library', 'payments'] : ['library'],
      version: 1,
    })
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(service.getMember).mockResolvedValue(ASHA);
  jest.mocked(service.listMembershipTypes).mockResolvedValue([]);
  jest.mocked(chargeService.listMemberCharges).mockResolvedValue({
    rows: [],
    totals: { amount: '0.00', paid: '0.00', waived: '0.00', due: '0.00' },
  });
});

describe('MemberDetailPageContent', () => {
  it('shows authoritative total and collected fees in the overview with one charge read', async () => {
    signIn(['library.member.read', 'payments.payment.write'], 'owner', true);
    jest.mocked(service.getMember).mockResolvedValue({ ...ASHA, duesAmount: '700.00' });
    jest.mocked(chargeService.listMemberCharges).mockResolvedValue({
      rows: [],
      totals: { amount: '900.00', paid: '200.00', waived: '0.00', due: '700.00' },
    });
    renderWithProviders(<MemberDetailPageContent id="m1" />);
    expect(await screen.findByTestId('library-member-fees-total')).toHaveTextContent('₹900.00');
    expect(screen.getByTestId('library-member-fees-paid')).toHaveTextContent('₹200.00');
    expect(screen.getByRole('button', { name: 'Collect fees' })).toBeInTheDocument();
    expect(chargeService.listMemberCharges).toHaveBeenCalledTimes(1);
  });

  it('keeps the collection shortcut hidden without the payment module', async () => {
    signIn(['library.member.read', 'payments.payment.write']);
    renderWithProviders(<MemberDetailPageContent id="m1" />);
    await screen.findByTestId('library-member-number');
    expect(screen.queryByRole('button', { name: 'Collect fees' })).not.toBeInTheDocument();
  });

  it('offers shared identity editing here to a manager with party write permission', async () => {
    signIn(['library.member.read', 'library.member.write', 'parties.party.write']);
    renderWithProviders(<MemberDetailPageContent id="m1" />);
    await screen.findByTestId('library-member-number');
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('button', { name: 'Change name or mobile' })).toBeInTheDocument();
  });

  /** UX16: a paid fee belongs on the student, never behind another person's page. */
  it('shows the student’s scoped payment history on the same page', async () => {
    jest.mocked(payments.listPayments).mockResolvedValue({
      rows: [
        {
          id: 'pay1',
          number: 'RCT/26-27/0001',
          direction: 'in',
          party: ASHA.party,
          paymentDate: '2026-10-14',
          amount: '200.00',
          primaryMode: 'cash',
          modesCount: 1,
          reference: '',
          status: 'recorded',
          unallocatedAmount: '0.00',
          allocatedAmount: '200.00',
        },
      ],
      totals: { count: 1, countIn: 1, countOut: 0, amountIn: '200.00', amountOut: '0.00' },
      page: 1,
      pageSize: 25,
      total: 1,
    });
    signIn(['library.member.read', 'payments.payment.read'], 'owner', true);
    renderWithProviders(<MemberDetailPageContent id="m1" />);
    const history = await screen.findByTestId('library-payment-history');
    expect(await screen.findByText('RCT/26-27/0001')).toBeInTheDocument();
    expect(history).toHaveTextContent('₹200.00');
    expect(payments.listPayments).toHaveBeenCalledWith(
      expect.objectContaining({ partyId: 'p1', bucket: 'library' }),
      expect.anything()
    );
    expect(screen.queryByRole('link', { name: 'All payments' })).not.toBeInTheDocument();
  });

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

  it('offers Change plan instead of Renew on a plan with no end date (QA B5)', async () => {
    /* Renew on the free "Standard" plan answered "Please check the highlighted
       fields" over a dialog with no fields. Nothing ends, so nothing renews. */
    signIn(['library.member.read', 'library.member.write', 'library.member.close']);
    jest.mocked(service.getMember).mockResolvedValue({
      ...ASHA,
      validUntil: null,
      validityMonths: null,
      planFee: '0.00',
    });
    jest.mocked(service.listMembershipTypes).mockResolvedValue([
      {
        id: 'ty1',
        name: 'Student',
        maxCopies: 2,
        loanDays: 14,
        feeAmount: '0.00',
        admissionFee: '0.00',
        depositAmount: '0.00',
        validityMonths: null,
        isActive: true,
        version: 1,
      },
      {
        id: 'ty2',
        name: 'Monthly',
        maxCopies: 2,
        loanDays: 14,
        feeAmount: '900.00',
        admissionFee: '0.00',
        depositAmount: '0.00',
        validityMonths: 1,
        isActive: true,
        version: 1,
      },
    ]);
    jest.mocked(service.actOnMember).mockResolvedValue(ASHA);
    renderWithProviders(<MemberDetailPageContent id="m1" />);
    await screen.findByTestId('library-member-number');
    expect(screen.queryByTestId('library-member-renew')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('library-member-change-plan'));
    expect(await screen.findByRole('combobox', { name: 'New plan' })).toHaveTextContent('Monthly');
    await userEvent.type(screen.getByLabelText(/^Reason/), 'Starts paying monthly');
    await userEvent.click(screen.getByTestId('library-member-confirm'));
    await waitFor(() => expect(service.actOnMember).toHaveBeenCalledTimes(1));
    expect(jest.mocked(service.actOnMember).mock.calls[0]?.slice(0, 3)).toEqual([
      'm1',
      'changePlan',
      { membership_type_id: 'ty2', reason: 'Starts paying monthly' },
    ]);
  });

  it('says what a renewal adds and until when, before it is pressed (QA B5)', async () => {
    signIn(['library.member.read', 'library.member.write', 'library.member.close']);
    renderWithProviders(<MemberDetailPageContent id="m1" />);
    await screen.findByTestId('library-member-number');
    await userEvent.click(screen.getByTestId('library-member-renew'));
    // Valid until 31/03/2027 on a six-month plan: the next term runs to 30/09/2027.
    expect(await screen.findByTestId('library-renew-preview')).toHaveTextContent(
      'Adds ₹150.00 · valid till 30/09/2027'
    );
  });

  it('refuses to close while a book is out, in the dialog, without a request', async () => {
    signIn(['library.member.read', 'library.member.write', 'library.member.close']);
    renderWithProviders(<MemberDetailPageContent id="m1" />);
    await screen.findByTestId('library-member-number');
    await userEvent.click(screen.getByTestId('library-more'));
    await userEvent.click(screen.getByRole('button', { name: 'Mark as left' }));
    expect(await screen.findByTestId('library-close-books-out')).toHaveTextContent(
      '1 book is still out.'
    );
    expect(service.actOnMember).not.toHaveBeenCalled();
  });

  /**
   * W03 — a study library's student page says where they sit and when, and
   * frees the desk in one tap: the PATCH sends `seat_id: null` with the
   * version, and nothing else the student holds changes.
   */
  it('shows the seat and shift, and frees the seat in one tap', async () => {
    jest.mocked(service.getMember).mockResolvedValue({
      ...ASHA,
      seat: { id: 's12', label: 'A12', zone: 'AC hall' },
      shift: { id: 'sh1', name: 'Morning', startsAt: '06:00', endsAt: '12:00' },
      lockerLabel: 'L-7',
      feeState: 'due_soon',
    });
    jest.mocked(service.placeMember).mockResolvedValue({ ...ASHA, seat: null, shift: null });
    signIn(['library.member.read', 'library.member.write']);
    renderWithProviders(<MemberDetailPageContent id="m1" />);
    const seat = await screen.findByTestId('library-member-seat');
    expect(seat).toHaveTextContent('A12');
    expect(seat).toHaveTextContent('Morning · 06:00–12:00');
    expect(seat).toHaveTextContent('Locker L-7');
    expect(screen.getByText('Due soon')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('library-member-free-seat'));
    expect(service.placeMember).toHaveBeenCalledWith('m1', { seatId: null }, ASHA.version);
  });

  it('offers a reader no acts at all', async () => {
    signIn(['library.member.read']);
    renderWithProviders(<MemberDetailPageContent id="m1" />);
    await screen.findByTestId('library-member-number');
    expect(screen.queryByTestId('library-member-renew')).not.toBeInTheDocument();
    expect(screen.queryByTestId('library-more')).not.toBeInTheDocument();
  });

  /**
   * QA B4 — admitted with "Collect now" off, the student owed ₹1,200 of fees and
   * ₹500 of security, but the page said "Fee due ₹1,200" and offered no way to
   * take the security. It now counts both, names the security, and takes it.
   */
  it('counts the security still to take and takes it from the page', async () => {
    jest.mocked(service.getMember).mockResolvedValue({
      ...ASHA,
      blocks: [],
      deposit: { id: 'd1', expected: '500.00', held: '0.00', due: '500.00' },
    });
    jest.mocked(service.actOnMember).mockResolvedValue({
      ...ASHA,
      blocks: [],
      deposit: { id: 'd1', expected: '500.00', held: '500.00', due: '0.00' },
    });
    signIn(['library.member.read', 'library.member.write']);
    renderWithProviders(<MemberDetailPageContent id="m1" />);
    expect(await screen.findByText('To collect')).toBeInTheDocument();
    expect(screen.getByText('₹1,700.00')).toBeInTheDocument();
    expect(screen.getByTestId('library-member-owes-deposit')).toHaveTextContent(
      'incl. ₹500.00 security (refundable)'
    );
    await userEvent.click(screen.getByTestId('library-member-take-deposit'));
    await userEvent.click(await screen.findByTestId('library-member-confirm'));
    expect(service.actOnMember).toHaveBeenCalledWith(
      'm1',
      'deposit',
      { mode_breakup: [{ mode: 'cash', amount: '500.00' }] },
      undefined
    );
  });
});

it('lets a librarian call the displayed student contact directly', async () => {
  // Contact details should be actionable without opening an identity-edit form.
  signIn(['library.member.read']);
  renderWithProviders(<MemberDetailPageContent id="m1" />);
  const phone = await screen.findByRole('link', { name: /98765/ });
  expect(phone).toHaveAttribute('href', 'tel:+919876543210');
});
