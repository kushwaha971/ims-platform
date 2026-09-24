import { screen, waitFor, within } from '@testing-library/react';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { resetStatement } from '../redux/statementSlice';

import { PartyStatementPageContent } from './PartyStatementPageContent';

/**
 * UAT D3 — the statement page hands the print sheet a letterhead.
 *
 * `StatementPrintView.test.tsx` proves the sheet renders one; this proves the
 * page FETCHES it (`GET /tenants/current`, through the statement service) on
 * open — before Print is pressed, because `window.print()` reads the DOM it is
 * given and cannot wait — and that a failed fetch leaves the shop's name on the
 * sheet rather than an error on the statement.
 */
jest.mock('../api/statementService');
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/parties/p1/statement',
}));

const statementService = jest.requireMock('../api/statementService') as {
  getStatement: jest.Mock;
  getStatementShop: jest.Mock;
  statementCsvUrl: jest.Mock;
};

const PARTY_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  store.dispatch(resetStatement());
  jest.clearAllMocks();
  statementService.getStatement.mockResolvedValue({
    party: { id: PARTY_ID, name: 'Ramesh Traders', mobileMasked: null },
    period: { from: null, to: null },
    summary: {
      openingBalance: '0.00',
      closingBalance: '500.00',
      totalDebit: '500.00',
      totalCredit: '0.00',
      hasEntriesBeforeOpening: false,
    },
    rows: [],
    nextCursor: null,
    hasMore: false,
  });
  statementService.statementCsvUrl.mockReturnValue('/x.csv');
  store.dispatch(
    sessionLoaded({
      user: {
        id: 'u1',
        name: 'Owner',
        email: 'owner@shop.test',
        mobile: null,
        locale: 'en',
        mustChangePassword: false,
        passwordExpiresAt: null,
      },
      activeTenant: {
        id: 't1',
        name: 'Kumar Kirana Store',
        timezone: 'Asia/Kolkata',
        role: 'owner',
      },
      tenants: [{ id: 't1', name: 'Kumar Kirana Store', timezone: 'Asia/Kolkata', role: 'owner' }],
      permissions: ['ledger.entry.read'] as never,
      enabledModules: ['parties', 'ledger'],
      version: 1,
    })
  );
});

describe('the printed statement carries the shop letterhead (UAT D3)', () => {
  it('fetches the address, phone and GSTIN on open and puts them on the sheet', async () => {
    statementService.getStatementShop.mockResolvedValue({
      addressLines: ['12 Station Road', 'Nashik, Maharashtra 422001'],
      phone: '9822012345',
      gstin: '27ABCDE1234F1Z5',
    });

    renderWithProviders(<PartyStatementPageContent id={PARTY_ID} />);

    await waitFor(() => expect(statementService.getStatementShop).toHaveBeenCalledTimes(1));
    const head = within(await screen.findByTestId('statement-letterhead'));
    expect(head.getByText('Kumar Kirana Store')).toBeInTheDocument();
    expect(await head.findByText('GSTIN 27ABCDE1234F1Z5')).toBeInTheDocument();
    expect(head.getByText('12 Station Road')).toBeInTheDocument();
    // D-L1: grouped as the party row and the khata header show it.
    expect(head.getByText('Phone +91 98220 12345')).toBeInTheDocument();
  });

  it('groups a stored E.164 shop phone the way the rest of the app does (D-L1)', async () => {
    /* Prevents D-L1: the letterhead printed the tenant phone as stored,
       "+919876543210", on the one sheet the merchant hands to a customer, while
       every screen in the product shows "+91 98765 43210". */
    statementService.getStatementShop.mockResolvedValue({
      addressLines: [],
      phone: '+919876543210',
      gstin: null,
    });

    renderWithProviders(<PartyStatementPageContent id={PARTY_ID} />);

    const head = within(await screen.findByTestId('statement-letterhead'));
    expect(await head.findByText('Phone +91 98765 43210')).toBeInTheDocument();
    expect(head.queryByText(/\+919876543210/)).not.toBeInTheDocument();
  });

  it('keeps the shop name and raises nothing when the letterhead cannot load', async () => {
    statementService.getStatementShop.mockRejectedValue(new Error('offline'));

    renderWithProviders(<PartyStatementPageContent id={PARTY_ID} />);

    await waitFor(() => expect(statementService.getStatementShop).toHaveBeenCalled());
    const head = within(await screen.findByTestId('statement-letterhead'));
    expect(head.getByText('Kumar Kirana Store')).toBeInTheDocument();
    expect(head.queryByText(/GSTIN|Phone/)).not.toBeInTheDocument();
    expect(store.getState().snackbar.snackbarOpen).toBe(false);
  });
});
