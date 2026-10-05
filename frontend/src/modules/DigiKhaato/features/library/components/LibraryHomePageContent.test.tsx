import { screen } from '@testing-library/react';

import { resetAllFeatureState } from 'src/redux/actions';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import * as service from '../api/libraryHomeService';

import { LibraryHomePageContent } from './LibraryHomePageContent';

import type { LibraryHome } from '../types/home.types';

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
      permissions: ['library.loan.read', 'library.member.read', 'library.member.write'],
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
