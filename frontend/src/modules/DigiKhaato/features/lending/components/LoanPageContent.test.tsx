import { screen, waitFor } from '@testing-library/react';

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
  lender: {
    name: 'Verma Finance',
    legalName: '',
    address: ['12 Station Road', 'Indore, 452001'],
    phone: '+919820011223',
    gstin: '',
  },
  closedOn: null,
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
  jest
    .mocked(service.getLoanActivity)
    .mockResolvedValue({ collections: [], visits: [], messages: [] } as never);
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

  /** L03 — Remind is offered to whoever may send it, only while something is due. */
  it('offers Remind on a late loan to a member who may send it, and not otherwise', async () => {
    jest
      .mocked(service.getLoan)
      .mockResolvedValue(loan({ arrears: '240.00', dueToday: '120.00', daysPastDue: 2 }));
    signIn([...PERMS, 'lending.reminder.send'] as PermissionCode[]);
    const { unmount } = renderWithProviders(<LoanPageContent id="l1" />);
    expect(await screen.findByTestId('lending-loan-remind')).toHaveTextContent('Remind');
    unmount();
    signIn(PERMS);
    renderWithProviders(<LoanPageContent id="l1" />);
    expect(await screen.findByRole('button', { name: 'Not paid' })).toBeInTheDocument();
    expect(screen.queryByTestId('lending-loan-remind')).not.toBeInTheDocument();
  });

  it('offers a receipt on the latest collection, and lists what was sent', async () => {
    jest.mocked(service.getLoan).mockResolvedValue(loan({ nextDueOn: '2026-12-01' }));
    jest.mocked(service.getLoanActivity).mockResolvedValue({
      collections: [
        {
          id: 'c2',
          collectedOn: '2026-10-05',
          amount: '120.00',
          mode: 'cash',
          reference: '',
          note: '',
          receiptNumber: 'RCT/26-27/0002',
          voided: false,
        },
        {
          id: 'c1',
          collectedOn: '2026-10-04',
          amount: '120.00',
          mode: 'cash',
          reference: '',
          note: '',
          receiptNumber: 'RCT/26-27/0001',
          voided: false,
        },
      ],
      visits: [],
      messages: [
        {
          id: 'm1',
          kind: 'receipt',
          subject: 'Receipt RCT/26-27/0001 · LN-0001',
          channel: 'whatsapp_manual',
          at: '2026-10-04T10:14:00+05:30',
        },
      ],
    } as never);
    signIn([...PERMS, 'lending.reminder.send'] as PermissionCode[]);
    renderWithProviders(<LoanPageContent id="l1" />);
    expect(await screen.findAllByTestId('lending-loan-receipt')).toHaveLength(1);
    expect(screen.getByTestId('lending-loan-messages')).toHaveTextContent(
      '04/10/2026 10:14 · Receipt · WhatsApp'
    );
    expect(screen.queryByTestId('lending-loan-remind')).not.toBeInTheDocument();
  });
});

/**
 * Lending P0 — the papers. What these protect: each paper is headed and signed by the
 * LENDER (never the product), a receipt quotes its own collection, the statement lists
 * every instalment, and the closure letter is offered only for a loan paid off — a
 * "no dues" paper for a loan with money left would be a lie the borrower can keep.
 */
describe('the loan papers', () => {
  const COLLECTION = {
    id: 'c1',
    collectedOn: '2026-10-06',
    amount: '120.00',
    mode: 'upi',
    reference: 'UTR9',
    note: '',
    receiptNumber: 'RCPT/26-27/0004',
    voided: false,
  };
  let print: jest.SpyInstance;
  beforeEach(() => {
    print = jest.spyOn(window, 'print').mockImplementation(() => undefined);
  });
  afterEach(() => print.mockRestore());

  it('prints a receipt for one collection under the lender’s name', async () => {
    jest.mocked(service.getLoan).mockResolvedValue(loan({ collected: '120.00' }));
    jest
      .mocked(service.getLoanActivity)
      .mockResolvedValue({ collections: [COLLECTION], visits: [], messages: [] } as never);
    signIn(PERMS);
    renderWithProviders(<LoanPageContent id="l1" />);
    const button = await screen.findByTestId('lending-loan-print-receipt');
    button.click();
    const sheet = await screen.findByTestId('loan-paper-receipt');
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    expect(sheet).toHaveTextContent('Verma Finance');
    expect(sheet).toHaveTextContent('RCPT/26-27/0004');
    expect(sheet).toHaveTextContent('Received ₹120.00');
    expect(sheet.innerHTML.toLowerCase()).not.toContain('yourkhata');
  });

  it('prints the statement with every instalment, and no closure letter while money is left', async () => {
    jest.mocked(service.getLoan).mockResolvedValue(loan());
    signIn(PERMS);
    renderWithProviders(<LoanPageContent id="l1" />);
    (await screen.findByTestId('lending-loan-print-statement')).click();
    const sheet = await screen.findByTestId('loan-paper-statement');
    expect(sheet).toHaveTextContent('Loan statement');
    expect(sheet).toHaveTextContent('06/10/2026');
    expect(screen.queryByTestId('lending-loan-print-closure')).not.toBeInTheDocument();
  });

  it('offers the no-dues letter for a loan paid off, dated the day it closed', async () => {
    jest.mocked(service.getLoan).mockResolvedValue(
      loan({
        status: 'closed',
        closeReason: 'completed',
        closedOn: '2027-01-20',
        remaining: '0.00',
        collected: '12000.00',
      })
    );
    signIn(PERMS);
    renderWithProviders(<LoanPageContent id="l1" />);
    (await screen.findByTestId('lending-loan-print-closure')).click();
    const sheet = await screen.findByTestId('loan-paper-closure');
    expect(sheet).toHaveTextContent('has repaid loan LN-0001');
    expect(sheet).toHaveTextContent('Nothing is due on this loan as of 20/01/2027');
  });
});
