import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import * as service from '../api/lendingService';

import { BorrowersPageContent } from './BorrowersPageContent';
import { CollectFromBorrowerDialog } from './CollectFromBorrowerDialog';
import { LoansPageContent } from './LoansPageContent';
import { TodayPageContent } from './TodayPageContent';

import type { BorrowerSplit, TodayRound, TodayStop } from '../types/lending.types';

/**
 * The approved Lending designs (owner, 12 Oct 2026), as a lender meets them:
 *  - day one is ONE panel, "Give your first loan" — no row of ₹0.00 tiles and
 *    no checklist whose first step is routes;
 *  - with loans, two figures, and a person with two loans is two rows, each
 *    named by its loan number, each with Collect;
 *  - no search or filter over a book with nothing in it;
 *  - "Collect from <name>" shows the split before saving and saves exactly it.
 */
jest.mock('../api/lendingService', () => ({
  ...jest.requireActual('../api/lendingService'),
  getToday: jest.fn(),
  listRoutes: jest.fn(),
  listLoans: jest.fn(),
  listBorrowers: jest.fn(),
  getBorrower: jest.fn(),
  previewBorrowerCollection: jest.fn(),
  collectFromBorrower: jest.fn(),
}));
jest.mock('modules/DigiKhaato/features/appSetup/components/AppSetupCard', () => ({
  AppSetupCard: () => null,
}));
let params = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/lending',
  useSearchParams: () => params,
}));

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
      activeTenant: { id: 't1', name: 'Shree Finance', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Shree Finance', timezone: 'Asia/Kolkata' }],
      permissions,
      enabledModules: ['lending'],
      version: 1,
    })
  );
};

const ALL = [
  'lending.today.read',
  'lending.loan.read',
  'lending.loan.create',
  'lending.borrower.read',
  'lending.collection.create',
] as PermissionCode[];

const stop = (over: Partial<TodayStop>): TodayStop => ({
  loanId: 'l1',
  number: 'LN-0001',
  name: 'Geeta Devi',
  mobile: null,
  area: '',
  route: null,
  seq: 0,
  frequency: 'daily',
  instalmentAmount: '100.00',
  dueToday: '100.00',
  arrears: '0.00',
  daysPastDue: 0,
  collectedToday: '0.00',
  remaining: '9600.00',
  remindedToday: false,
  visit: null,
  ...over,
});

const round = (over: Partial<TodayRound>): TodayRound => ({
  on: '2026-10-12',
  hasLoans: true,
  stops: [],
  due: '0.00',
  collected: '0.00',
  short: '0.00',
  stopsCount: 0,
  done: 0,
  ...over,
});

beforeEach(() => {
  params = new URLSearchParams();
  jest.mocked(service.listRoutes).mockResolvedValue([]);
  signIn(ALL);
});

describe('Lending Today', () => {
  it('opens on day one with one panel and no zero tiles', async () => {
    jest.mocked(service.getToday).mockResolvedValue(round({ hasLoans: false }));
    renderWithProviders(<TodayPageContent />);
    expect(await screen.findByText('Give your first loan')).toBeInTheDocument();
    expect(screen.queryByText('₹0.00')).not.toBeInTheDocument();
    expect(screen.queryByText('To collect today')).not.toBeInTheDocument();
    expect(screen.getByText(/Later, if you have collectors/)).toBeInTheDocument();
  });

  it('with loans: two figures, and a second loan of one person is its own row', async () => {
    jest.mocked(service.getToday).mockResolvedValue(
      round({
        due: '650.00',
        stopsCount: 2,
        stops: [
          stop({}),
          stop({ loanId: 'l6', number: 'LN-0006', arrears: '450.00', daysPastDue: 1 }),
        ],
      })
    );
    renderWithProviders(<TodayPageContent />);
    const list = await screen.findByTestId('lending-today');
    expect(within(list).getByText('To collect today')).toBeInTheDocument();
    expect(within(list).getByText('Collected')).toBeInTheDocument();
    expect(within(list).queryByText('Stops left')).not.toBeInTheDocument();
    expect(screen.getByText(/Loan LN-0001 · ₹100\.00 a day/)).toBeInTheDocument();
    expect(screen.getByText(/Loan LN-0006/)).toBeInTheDocument();
    expect(screen.getAllByTestId('lending-stop-collect')).toHaveLength(2);
  });

  it('says "nothing to collect today" to a lender who has loans', async () => {
    jest.mocked(service.getToday).mockResolvedValue(round({}));
    renderWithProviders(<TodayPageContent />);
    expect(await screen.findByText('Nothing to collect today')).toBeInTheDocument();
    expect(screen.queryByText('Give your first loan')).not.toBeInTheDocument();
  });
});

describe('Lending lists with nothing in them', () => {
  it('Loans shows no search or filter before the first loan', async () => {
    jest
      .mocked(service.listLoans)
      .mockResolvedValue({ rows: [], hasLoans: false, total: 0, page: 1, totalPages: 0 });
    renderWithProviders(<LoansPageContent />);
    expect(await screen.findByText('No loans yet')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Running')).not.toBeInTheDocument();
  });

  it('Loans keeps its search when a filter found nothing in a real book', async () => {
    jest
      .mocked(service.listLoans)
      .mockResolvedValue({ rows: [], hasLoans: true, total: 0, page: 1, totalPages: 0 });
    renderWithProviders(<LoansPageContent />);
    expect(await screen.findByText('No loans match')).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('Borrowers is one sentence and one button before anybody has borrowed', async () => {
    jest.mocked(service.listBorrowers).mockResolvedValue({ rows: [], totals: null });
    renderWithProviders(<BorrowersPageContent />);
    expect(await screen.findByText('No borrowers yet')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'New loan' })).toHaveLength(1);
  });
});

describe('Collect from a borrower', () => {
  const split: BorrowerSplit = {
    borrowerId: 'b1',
    name: 'Geeta Devi',
    amount: '650.00',
    leftAfter: '36450.00',
    loans: [
      {
        loanId: 'l6',
        number: 'LN-0006',
        amount: '550.00',
        dueNow: '550.00',
        late: true,
        leftAfter: '4950.00',
      },
      {
        loanId: 'l1',
        number: 'LN-0001',
        amount: '100.00',
        dueNow: '100.00',
        late: false,
        leftAfter: '9500.00',
      },
      {
        loanId: 'l7',
        number: 'LN-0007',
        amount: '0.00',
        dueNow: '0.00',
        late: false,
        leftAfter: '22000.00',
      },
    ],
  };

  it('is on the borrower page with their totals', async () => {
    params = new URLSearchParams('borrower=b1');
    jest
      .mocked(service.listLoans)
      .mockResolvedValue({ rows: [], hasLoans: true, total: 0, page: 1, totalPages: 0 });
    jest.mocked(service.getBorrower).mockResolvedValue({
      id: 'b1',
      number: 'B-0001',
      partyId: 'p1',
      name: 'Geeta Devi',
      mobile: null,
      area: '',
      route: null,
      summary: {
        loans: 3,
        running: 3,
        given: '35000.00',
        collected: '400.00',
        left: '37100.00',
        late: '550.00',
      },
    });
    renderWithProviders(<LoansPageContent />);
    expect(await screen.findByTestId('lending-collect-from')).toHaveTextContent(
      'Collect from Geeta Devi'
    );
    expect(screen.getByText('Got back')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Loan/ })).toHaveAttribute(
      'href',
      '/lending/loans/new?borrower=b1&name=Geeta%20Devi'
    );
  });

  it('shows the split before saving and saves exactly what it showed', async () => {
    jest.mocked(service.previewBorrowerCollection).mockResolvedValue(split);
    jest
      .mocked(service.collectFromBorrower)
      .mockResolvedValue({ amount: '650.00', receipts: ['RCT-1', 'RCT-2'] });
    const user = userEvent.setup();
    renderWithProviders(
      <CollectFromBorrowerDialog borrowerId="b1" name="Geeta Devi" onClose={jest.fn()} />
    );
    expect(screen.getByTestId('lending-collect-from-save')).toBeDisabled();
    await user.type(screen.getByLabelText(/Amount/), '650');
    const shown = await screen.findByTestId('lending-collect-from-split');
    expect(within(shown).getByText('LN-0006')).toBeInTheDocument();
    expect(within(shown).getByText('LN-0001')).toBeInTheDocument();
    // A loan this money does not touch is not in the split.
    expect(within(shown).queryByText('LN-0007')).not.toBeInTheDocument();
    expect(
      within(shown).getByText(/Left on all loans after this: ₹36,450\.00/)
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save 2 collections' }));
    await waitFor(() => expect(service.collectFromBorrower).toHaveBeenCalled());
    expect(jest.mocked(service.collectFromBorrower).mock.calls[0]?.[0]).toBe(split);
  });

  it('shows the new split when the old one went stale, and saves nothing', async () => {
    const fresh: BorrowerSplit = {
      ...split,
      loans: split.loans
        .filter((l) => l.number === 'LN-0001')
        .map((l) => ({ ...l, amount: '650.00', dueNow: '0.00' })),
    };
    jest.mocked(service.previewBorrowerCollection).mockResolvedValue(split);
    jest.mocked(service.collectFromBorrower).mockRejectedValue({
      code: 'balance_changed',
      message: 'Something was collected on these loans meanwhile.',
      details: {
        split: {
          borrower_id: 'b1',
          name: 'Geeta Devi',
          amount: '650.00',
          left_after: '36450.00',
          loans: fresh.loans.map((l) => ({
            loan_id: l.loanId,
            number: l.number,
            amount: l.amount,
            due_now: l.dueNow,
            late: l.late,
            left_after: l.leftAfter,
          })),
        },
      },
      status: 409,
      requestId: 'req-1',
      warnings: [],
    });
    const onClose = jest.fn();
    const user = userEvent.setup();
    renderWithProviders(
      <CollectFromBorrowerDialog borrowerId="b1" name="Geeta Devi" onClose={onClose} />
    );
    await user.type(screen.getByLabelText(/Amount/), '650');
    await screen.findByTestId('lending-collect-from-split');
    await user.click(screen.getByRole('button', { name: 'Save 2 collections' }));
    expect(
      await screen.findByText(/Something was collected on these loans meanwhile/)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save 1 collection' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
