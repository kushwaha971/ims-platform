import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { hi } from 'src/tests/allMessages';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import { resetStatement } from '../redux/statementSlice';

import { PartyStatementPageContent } from './PartyStatementPageContent';

/**
 * LED-04 on screen.
 *
 * What these assert is the merchant's side: that the period the URL names is
 * the period that gets requested, that the running balance reaches the row, and
 * that the two controls a role may not use are absent rather than disabled.
 * What the REQUEST looks like is `statementService.test.ts`, and what the
 * NUMBERS are is the backend's window function.
 */
jest.mock('../api/statementService');

const mockReplace = jest.fn();
let mockSearch = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(mockSearch),
  usePathname: () => '/parties/p1/statement',
}));

const statementService = jest.requireMock('../api/statementService') as {
  getStatement: jest.Mock;
  statementCsvUrl: jest.Mock;
};

const PARTY_ID = '11111111-1111-4111-8111-111111111111';

const page = (over: Record<string, unknown> = {}) => ({
  party: { id: PARTY_ID, name: 'Ramesh Traders', mobileMasked: '98••• ••210' },
  period: { from: '2026-04-01', to: '2026-09-23' },
  summary: {
    openingBalance: '2300.00',
    closingBalance: '2500.00',
    totalDebit: '2800.00',
    totalCredit: '300.00',
    hasEntriesBeforeOpening: false,
  },
  rows: [
    {
      id: 'r1',
      entryDate: '2026-09-18',
      entryType: 'manual_gave' as const,
      direction: 'debit' as const,
      amount: '500.00',
      note: 'Cement bags',
      status: 'posted' as const,
      runningBalance: '2800.00',
      source: null,
      reversesId: null,
      supersedesId: null,
      reason: null,
    },
  ],
  nextCursor: null,
  hasMore: false,
  ...over,
});

const signIn = (permissions: string[]): void => {
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
      activeTenant: { id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata', role: 'owner' },
      tenants: [{ id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata', role: 'owner' }],
      permissions: permissions as never,
      enabledModules: ['parties', 'ledger'],
      version: 1,
    })
  );
};

const ALL = ['ledger.entry.read', 'ledger.statement.export'];

/**
 * The on-screen half of the page.
 *
 * The statement is rendered twice — once for the screen and once as the print
 * sheet, which the stylesheet hides until `window.print()` — and jsdom applies
 * no stylesheet, so every string is in the document twice. Scoping to the screen
 * is what makes an assertion about what the merchant SEES; an unscoped
 * `getByText` would pass if the screen rendered nothing and only the sheet did.
 */
const onScreen = async () => within(await screen.findByTestId('statement-screen'));

beforeEach(() => {
  store.dispatch(resetStatement());
  jest.clearAllMocks();
  mockSearch = '';
  statementService.getStatement.mockResolvedValue(page());
  statementService.statementCsvUrl.mockReturnValue('/api/v1/parties/p1/statement?format=csv');
  signIn(ALL);
});

describe('the statement a merchant reads', () => {
  it('shows the opening, the running balance and the closing', async () => {
    /* AC-1's shape. The running balance is the column a customer follows with
       a finger, and it is the only figure on this page that nothing else in the
       product computes. */
    renderWithProviders(<PartyStatementPageContent id={PARTY_ID} />);
    const view = await onScreen();

    expect(await view.findByText('Cement bags')).toBeInTheDocument();
    /* Grouped, with the symbol. It printed "Balance ₹2800.00" until the
       screenshot sweep showed it — the fifth time `formatInr`-versus-raw-string
       has met in this codebase, on the figure a customer reads out loud. */
    expect(view.getByText('Balance ₹2,800.00')).toBeInTheDocument();
    // Opening and closing appear in the summary strip, as preformatted rupees.
    expect(view.getAllByText('₹2,300.00').length).toBeGreaterThan(0);
    expect(view.getAllByText('₹2,500.00').length).toBeGreaterThan(0);
  });

  it('asks for this financial year when the URL says nothing', async () => {
    /* §8's default, and the reason it is not the calendar year: a shopkeeper
       asking for "the year" means the one they file against. */
    renderWithProviders(<PartyStatementPageContent id={PARTY_ID} />);

    await waitFor(() => expect(statementService.getStatement).toHaveBeenCalled());
    const [, filters] = statementService.getStatement.mock.calls[0] as [string, { preset: string }];
    expect(filters.preset).toBe('thisFy');
  });

  it('reads the period out of the address bar', async () => {
    /* FR-8. PTY-05 learned what happens when a screen does not: the tag
       manager's count link was inert for a week because the list's filters
       lived only in Redux. */
    mockSearch = 'preset=custom&from=2026-05-01&to=2026-05-31';
    renderWithProviders(<PartyStatementPageContent id={PARTY_ID} />);

    await waitFor(() => expect(statementService.getStatement).toHaveBeenCalled());
    const [, filters] = statementService.getStatement.mock.calls[0] as [
      string,
      { dateFrom: string; dateTo: string },
    ];
    expect(filters.dateFrom).toBe('2026-05-01');
    expect(filters.dateTo).toBe('2026-05-31');
  });

  it('writes the period back to the URL rather than only to the store', async () => {
    renderWithProviders(<PartyStatementPageContent id={PARTY_ID} />);
    const view = await onScreen();

    await view.findByText('Cement bags');
    await userEvent.click(view.getByRole('button', { name: 'All time' }));

    /* `replace`, not `push`: a merchant trying five presets and hitting back
       expects the khata page, not four statements. */
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('?preset=allTime', { scroll: false })
    );
  });

  it('refuses a five-year-plus range before making a request', async () => {
    /* §10, mirrored on the client — not to replace the server's check but to
       save a merchant a round trip to be told something the client knew. */
    mockSearch = 'preset=custom&from=2015-01-01&to=2026-04-01';
    renderWithProviders(<PartyStatementPageContent id={PARTY_ID} />);

    expect(await screen.findByText(/up to 5 years/)).toBeInTheDocument();
    expect(statementService.getStatement).not.toHaveBeenCalled();
  });

  it('warns when entries predate the opening balance', async () => {
    /* FR-11. No arithmetic can tell a merchant this — both numbers are right —
       so the sentence is the only thing that can. */
    statementService.getStatement.mockResolvedValue(
      page({ summary: { ...page().summary, hasEntriesBeforeOpening: true } })
    );
    renderWithProviders(<PartyStatementPageContent id={PARTY_ID} />);
    const view = await onScreen();

    expect(await view.findByText(/before the opening balance date/)).toBeInTheDocument();
  });

  it('says a quiet month is quiet rather than showing nothing', async () => {
    statementService.getStatement.mockResolvedValue(page({ rows: [] }));
    renderWithProviders(<PartyStatementPageContent id={PARTY_ID} />);

    expect(await screen.findByText('No entries in this period')).toBeInTheDocument();
  });
});

describe('what a role may take away', () => {
  it('offers the export to somebody who may export', async () => {
    renderWithProviders(<PartyStatementPageContent id={PARTY_ID} />);

    expect(await screen.findByText('Export CSV')).toBeInTheDocument();
  });

  it('hides it from staff rather than disabling it', async () => {
    /* §12 and §19.7.5. Reading a customer's history at the counter and walking
       out with the whole book in a file are not the same act — and a control
       that refuses is a support call. */
    signIn(['ledger.entry.read']);
    renderWithProviders(<PartyStatementPageContent id={PARTY_ID} />);
    const view = await onScreen();

    await view.findByText('Cement bags');
    expect(view.queryByText('Export CSV')).not.toBeInTheDocument();
    // Print stays: everybody who may read the statement may print it.
    expect(view.getByRole('button', { name: /Print/ })).toBeInTheDocument();
  });

  it('renders nothing for a tenant without the ledger module', async () => {
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
        activeTenant: { id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata', role: 'owner' },
        tenants: [],
        permissions: ALL as never,
        enabledModules: ['parties'] as never,
        version: 1,
      })
    );
    renderWithProviders(<PartyStatementPageContent id={PARTY_ID} />);

    expect(await screen.findByText('Statements are not available here')).toBeInTheDocument();
    expect(statementService.getStatement).not.toHaveBeenCalled();
  });
});

describe('write-offs (CR-2026-09-24-A)', () => {
  /* Opening 2,300 inside the period, gave 500, got 300, written off 2,500:
     the server reports gave 2,800 and got 300 WITHOUT the write-off, and the
     write-off as its own figure — so the strip adds up on its face. */
  const writtenOffPage = () =>
    page({
      summary: {
        openingBalance: '0.00',
        closingBalance: '0.00',
        totalDebit: '2800.00',
        totalCredit: '300.00',
        writtenOff: { debit: '0.00', credit: '2500.00' },
        hasEntriesBeforeOpening: false,
      },
      rows: [
        {
          id: 'wo',
          entryDate: '2026-09-24',
          entryType: 'write_off' as const,
          direction: 'credit' as const,
          amount: '2500.00',
          note: 'Shop closed',
          status: 'posted' as const,
          runningBalance: '0.00',
          source: null,
          reversesId: null,
          supersedesId: null,
          reason: 'Shop closed',
        },
      ],
    });

  it('shows a Written off tile beside You gave and You got', async () => {
    statementService.getStatement.mockResolvedValue(writtenOffPage());

    renderWithProviders(<PartyStatementPageContent id={PARTY_ID} />);
    const view = await onScreen();
    await view.findByText('Shop closed');

    const strip = within(view.getByTestId('ub-stat-grid'));
    expect(strip.getByText('Written off')).toBeInTheDocument();
    expect(strip.getByText('₹2,500.00')).toBeInTheDocument();
    expect(strip.getByText('₹300.00')).toBeInTheDocument();
    expect(strip.getByText('₹2,800.00')).toBeInTheDocument();
  });

  it('shows no Written off tile when nothing was written off', async () => {
    statementService.getStatement.mockResolvedValue(
      page({
        summary: { ...page().summary, writtenOff: { debit: '0.00', credit: '0.00' } },
      })
    );

    renderWithProviders(<PartyStatementPageContent id={PARTY_ID} />);
    const view = await onScreen();

    await view.findByText('Cement bags');
    expect(screen.queryByText(/Written off/)).not.toBeInTheDocument();
  });

  it('prints the written-off figure and labels the row, once', async () => {
    statementService.getStatement.mockResolvedValue(writtenOffPage());

    renderWithProviders(<PartyStatementPageContent id={PARTY_ID} />);
    await (await onScreen()).findByText('Shop closed');

    const sheet = screen.getByRole('table').closest('.ub-print-sheet') as HTMLElement;
    const printed = within(sheet);
    // The summary line's fifth figure — label shown and in the accessible name.
    expect(printed.getByText('Written off, ₹2,500.00')).toBeInTheDocument();
    // The row sits in the "You got" column, so the cell says it is a write-off
    // and does not repeat the reason that is also its note.
    expect(printed.getByText('Write-off · Shop closed')).toBeInTheDocument();
  });
});

describe('printing', () => {
  it('fetches the whole period before opening the print dialog', async () => {
    /* FR-8, and the defect it prevents: a print dialog gets what is in the DOM
       and cannot page, so calling `window.print()` straight after the click
       prints the first fifty rows under a closing balance computed from two
       hundred — a document that does not add up, handed to a customer. */
    const print = jest.fn();
    Object.defineProperty(window, 'print', { value: print, writable: true });
    const { fetchStatementAllRows } = jest.requireActual('../redux/statementThunk');
    expect(typeof fetchStatementAllRows).toBe('function');

    renderWithProviders(<PartyStatementPageContent id={PARTY_ID} />);
    const view = await onScreen();
    await view.findByText('Cement bags');
    statementService.getStatement.mockClear();

    await userEvent.click(view.getByRole('button', { name: /Print/ }));

    await waitFor(() => expect(statementService.getStatement).toHaveBeenCalled());
    await waitFor(() => expect(print).toHaveBeenCalled());
  });
});

describe('the closing tile is painted by what the balance means (UAT)', () => {
  const closingTile = (view: ReturnType<typeof within>): HTMLElement => {
    const strip = within(view.getByTestId('ub-stat-grid'));
    const label = strip.getByText('Closing balance');
    // The label's row, then the tile's figure line beneath it.
    const tile = label.parentElement?.parentElement as HTMLElement;
    return within(tile).getByText(/^₹/);
  };

  it('paints a settled closing neutral, not in the receivable red', async () => {
    /* Prevents the UAT finding: `tone = payable ? success : danger` put
       every balance that was not payable in the debit red — so a khata the
       merchant had just settled to ₹0.00 closed on a red figure, which reads
       as money outstanding on the one statement that says there is none. */
    statementService.getStatement.mockResolvedValue(
      page({
        summary: {
          openingBalance: '2300.00',
          closingBalance: '0.00',
          totalDebit: '0.00',
          totalCredit: '2300.00',
          hasEntriesBeforeOpening: false,
        },
      })
    );
    renderWithProviders(<PartyStatementPageContent id={PARTY_ID} />);
    const view = await onScreen();
    await view.findByText('Cement bags');

    const figure = closingTile(view);
    expect(figure).toHaveTextContent('₹0.00');
    expect(figure).toHaveClass('text-text-primary');
    expect(figure).not.toHaveClass('text-error-bright');
    expect(figure).not.toHaveClass('text-success');
  });

  it('still paints a receivable closing in the debit red', async () => {
    renderWithProviders(<PartyStatementPageContent id={PARTY_ID} />);
    const view = await onScreen();
    await view.findByText('Cement bags');
    expect(closingTile(view)).toHaveClass('text-error-bright');
  });
});

describe('the opening row on a Hindi statement (D-L3)', () => {
  const OPENING_ROW = {
    id: 'r0',
    entryDate: '2026-04-01',
    entryType: 'opening' as const,
    direction: 'debit' as const,
    amount: '2300.00',
    // Exactly what the server stores on every opening entry, in English on
    // purpose so reports and support can find it.
    note: 'Opening balance',
    status: 'posted' as const,
    runningBalance: '2300.00',
    source: null,
    reversesId: null,
    supersedesId: null,
    reason: null,
  };

  it('labels the opening row in Hindi on screen and on the print sheet', async () => {
    /* Prevents D-L3: the statement rendered the row's stored note first, so a
       Hindi statement — and the printed copy handed to the customer — opened
       with the English "Opening balance" while the khata above it said
       "शुरुआती बाकी". The row is mapped by its entry type, never by
       translating the server's string. */
    statementService.getStatement.mockResolvedValue(page({ rows: [OPENING_ROW, ...page().rows] }));

    renderWithProviders(<PartyStatementPageContent id={PARTY_ID} />, {
      locale: 'hi',
      messages: hi as Record<string, string>,
    });
    const view = await onScreen();
    await view.findByText('Cement bags');

    expect(view.getByText('शुरुआती बाकी')).toBeInTheDocument();
    expect(view.queryByText('Opening balance')).not.toBeInTheDocument();
    // The print sheet is the rest of the document: the screen and the sheet
    // together carry the Hindi label twice and the English one nowhere.
    expect(screen.getAllByText('शुरुआती बाकी')).toHaveLength(2);
    expect(screen.queryByText('Opening balance')).not.toBeInTheDocument();
  });
});
