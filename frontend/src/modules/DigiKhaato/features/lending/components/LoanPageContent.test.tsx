import { screen } from '@testing-library/react';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import * as service from '../api/lendingService';

import { LoanPageContent } from './LoanPageContent';

import type { LoanDetail } from '../types/lending.types';

/**
 * L02 QA — the loan page as a collector reads it:
 *  - ONE Collect, in the header, carrying the amount it will take (the card
 *    used to repeat it);
 *  - "Not paid" only when something is actually due — it records a missed
 *    visit, and it was offered on a loan whose first instalment was tomorrow;
 *  - the borrower's ledger link says "Account", a lender's word, not "Khata".
 */
jest.mock('../api/lendingService', () => ({
  ...jest.requireActual('../api/lendingService'),
  getLoan: jest.fn(),
  getLoanActivity: jest.fn(),
}));
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/lending/loans/l1',
  useSearchParams: () => new URLSearchParams(),
}));

const loan = (over: Partial<LoanDetail> = {}): LoanDetail => ({
  id: 'l1',
  number: 'LN-0001',
  status: 'active',
  closeReason: '',
  borrower: {
    id: 'b1',
    number: 'B-0001',
    partyId: 'p1',
    name: 'Geeta Devi',
    mobile: '+919882752203',
    area: 'Market lane 2',
  },
  route: null,
  planType: 'fixed_daily',
  frequency: 'daily',
  principal: '10000.00',
  rate: '0',
  rateUnit: 'per_month',
  instalmentCount: 100,
  instalmentAmount: '120.00',
  totalInterest: '2000.00',
  totalPayable: '12000.00',
  cashHandedOver: '10000.00',
  effectiveAnnualRate: '117.6',
  disbursedOn: '2026-10-05',
  maturityOn: '2027-01-29',
  notes: '',
  dueToday: '0.00',
  arrears: '0.00',
  remaining: '12000.00',
  collected: '0.00',
  daysPastDue: 0,
  nextDueOn: '2026-10-06',
  nextDueAmount: '120.00',
  deductions: [],
  schedule: [
    {
      id: 'd1',
      seq: 1,
      dueOn: '2026-10-06',
      amount: '120.00',
      settled: '0.00',
      outstanding: '120.00',
      status: 'scheduled',
    },
  ],
  ...over,
});

const signIn = (permissions: PermissionCode[]): void => {
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Owner',
        email: 'owner@lend.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: { id: 't1', name: 'Verma Finance', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Verma Finance', timezone: 'Asia/Kolkata' }],
      permissions,
      enabledModules: ['lending'],
      version: 1,
    })
  );
};

const PERMS = ['lending.loan.read', 'lending.collection.create'] as PermissionCode[];

beforeEach(() => {
  jest.mocked(service.getLoanActivity).mockResolvedValue({ collections: [], visits: [] } as never);
});

describe('LoanPageContent', () => {
  it('offers one Collect with its amount, and no "Not paid" while nothing is due', async () => {
    jest.mocked(service.getLoan).mockResolvedValue(loan());
    signIn(PERMS);
    renderWithProviders(<LoanPageContent id="l1" />);
    expect(await screen.findByTestId('lending-loan')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Collect/ })).toHaveLength(1);
    expect(screen.getByTestId('lending-loan-collect')).toHaveTextContent('Collect ₹120.00');
    expect(screen.queryByRole('button', { name: 'Not paid' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Account' })).toBeInTheDocument();
    expect(screen.queryByText('Khata')).not.toBeInTheDocument();
  });

  it('offers "Not paid" once an instalment is late, and collects what is late', async () => {
    jest
      .mocked(service.getLoan)
      .mockResolvedValue(loan({ arrears: '240.00', dueToday: '120.00', daysPastDue: 2 }));
    signIn(PERMS);
    renderWithProviders(<LoanPageContent id="l1" />);
    expect(await screen.findByRole('button', { name: 'Not paid' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Collect/ })).toHaveLength(1);
  });
});
