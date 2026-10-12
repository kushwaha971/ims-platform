import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { resetAllFeatureState } from 'src/redux/actions';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import * as service from '../api/libraryHomeService';

import { FeesPageContent } from './FeesPageContent';
import { LibraryHomePageContent } from './LibraryHomePageContent';

import type { FeesBoard, LibraryHome } from '../types/home.types';

/**
 * W04 — a reading room's home. The first version keyed its fetch effect on
 * the request status, so dispatching set 'loading', the effect re-ran, its
 * cleanup ABORTED the request, and an aborted fetch leaves the status where
 * it was: the page showed a skeleton for ever. jsdom saw it too, so this
 * test pins it: one request, and the figures on screen.
 */
jest.mock('../api/libraryHomeService', () => ({
  ...jest.requireActual('../api/libraryHomeService'),
  getLibraryHome: jest.fn(),
  getFeesBoard: jest.fn(),
}));
jest.mock('modules/DigiKhaato/features/appSetup/components/AppSetupCard', () => ({
  AppSetupCard: () => null,
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/library',
  useSearchParams: () => new URLSearchParams(),
}));

const HOME: LibraryHome = {
  quickActions: [],
  study: {
    seats: 24,
    students: 2,
    shifts: [{ id: 's1', name: 'Morning', startsAt: '06:00', endsAt: '12:00', filled: 20 }],
    fees: { dueThisWeek: 3, overdue: 1, unpaid: 2, collectedThisMonth: '14400.00' },
    toPay: [
      {
        membershipId: 'm1',
        name: 'Imran Khan',
        memberNumber: 'M-0003',
        seat: 'A12',
        shift: 'Evening',
        plan: 'Monthly',
        planFee: '900.00',
        validUntil: '2026-11-04',
        duesAmount: '1100.00',
        feeState: 'unpaid',
      },
    ],
  },
};

beforeEach(() => {
  store.dispatch(resetAllFeatureState());
  jest.clearAllMocks();
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
      permissions: [
        'library.loan.read',
        'library.member.read',
        'library.member.write',
        'payments.payment.write',
      ],
      enabledModules: ['library'],
      version: 1,
    })
  );
  jest.mocked(service.getLibraryHome).mockResolvedValue(HOME);
});

describe('LibraryHomePageContent', () => {
  it('asks once and shows the day: shifts, fees and who has to pay', async () => {
    renderWithProviders(<LibraryHomePageContent />);
    expect(await screen.findByTestId('library-home')).toBeInTheDocument();
    expect(service.getLibraryHome).toHaveBeenCalledTimes(1);
    expect(screen.getByText('20 of 24 filled')).toBeInTheDocument();
    expect(screen.getByText('₹14,400.00')).toBeInTheDocument();
    expect(screen.getByText('Imran Khan')).toBeInTheDocument();
    expect(screen.getAllByText('Fee unpaid').length).toBeGreaterThanOrEqual(2);
  });
});

describe('the approved Library designs (owner, 12 Oct 2026)', () => {
  it('Home with no student is the checklist and one line: no 0 / ₹0.00 tiles', async () => {
    const study = HOME.study;
    if (!study) throw new Error('fixture');
    jest.mocked(service.getLibraryHome).mockResolvedValue({
      ...HOME,
      study: { ...study, students: 0, toPay: [], fees: { ...study.fees, unpaid: 0 } },
    });
    renderWithProviders(<LibraryHomePageContent />);
    expect(await screen.findByTestId('library-home-first-use')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
    expect(screen.queryByText('₹14,400.00')).not.toBeInTheDocument();
    expect(screen.queryByText(/Everyone has paid/)).not.toBeInTheDocument();
  });

  const BOARD: FeesBoard = {
    students: 3,
    toCollect: '900.00',
    collectedThisMonth: '1800.00',
    notPaid: [
      {
        membershipId: 'm3',
        partyId: 'p3',
        name: 'Imran Khan',
        plan: 'Monthly',
        since: '2026-10-10',
        owes: '900.00',
        charge: { id: 'c9', number: 'FEE-0009', amountDue: '900.00' },
      },
    ],
    paid: [
      {
        paymentId: 'pay1',
        on: '2026-10-10',
        mode: 'upi',
        amount: '900.00',
        name: 'Asha Kulkarni',
        membershipId: 'm1',
      },
    ],
  };

  it('Fees with no student is one sentence, not three shortcuts to nobody', async () => {
    jest.mocked(service.getFeesBoard).mockResolvedValue({
      ...BOARD,
      students: 0,
      notPaid: [],
      paid: [],
    });
    renderWithProviders(<FeesPageContent />);
    expect(await screen.findByText('No fees to collect yet')).toBeInTheDocument();
    expect(screen.queryByText('See students')).not.toBeInTheDocument();
  });

  it('Fees groups Not paid then Paid, with Take fee on the row', async () => {
    jest.mocked(service.getFeesBoard).mockResolvedValue(BOARD);
    renderWithProviders(<FeesPageContent />);
    const notPaid = await screen.findByRole('list', { name: 'Not paid' });
    expect(within(notPaid).getByText('Imran Khan')).toBeInTheDocument();
    const paid = screen.getByRole('list', { name: 'Paid this month' });
    expect(within(paid).getByText('Asha Kulkarni')).toBeInTheDocument();
    expect(within(paid).getByText(/UPI/)).toBeInTheDocument();
    expect(
      screen.getByText('Not paid').compareDocumentPosition(screen.getByText('Paid this month')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    await userEvent.click(within(notPaid).getByTestId('library-take-fee'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
