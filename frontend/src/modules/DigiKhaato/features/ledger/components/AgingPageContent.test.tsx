import type * as ReactModule from 'react';

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { UbGridTier } from 'src/design-system/UbDataGrid';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { ModuleCode, PermissionCode } from 'src/types/domain.types';

import { resetPartyTags } from '../../parties/redux/partyTagSlice';
import { resetLedgerAging } from '../redux/agingSlice';

import { AgingPageContent } from './AgingPageContent';

import type * as AgingServiceModule from '../api/agingService';
import type { AgingFilters, AgingRow } from '../types/aging.types';

/**
 * LED-09 on screen: content → hook → thunk → service, with the service stubbed
 * at the module boundary (§19.13.3).
 *
 * What these assert is the merchant's side of the report — that the question
 * the screen shows (which side, as of when, sorted how, narrowed to which tag)
 * is the question that gets ASKED, and that every figure is a way into the
 * statement. The arithmetic of the buckets is the backend's FIFO walk, and the
 * pure shaping is `agingDisplay.test.ts`.
 */
jest.mock('../api/agingService');
/* The tag picker asks for the tenant's tags on mount. Stubbed at the same
   boundary, so an unmocked request cannot fail into jsdom and take the tab row
   with it. */
jest.mock('../../parties/api/tagService');

/**
 * The URL is this screen's STATE, not just an input to it: every control writes
 * the filters to the address bar with `router.replace` and the hook reads them
 * back through `useSearchParams`. A static `mockSearch` would prove only that a
 * tab click CALLS `replace` — the statement's tests stop there — and never that
 * the report then asks the server for the other side of the book. So `replace`
 * here moves the mocked address bar and re-renders its readers, which is the
 * whole loop a merchant's tap goes through.
 *
 * The `mock` prefix is not style — `jest.mock` is hoisted above the imports,
 * and a factory referencing any other out-of-scope name throws at module load.
 */
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockSearch = '';
const mockUrlListeners = new Set<() => void>();
jest.mock('next/navigation', () => {
  const { useSyncExternalStore } = jest.requireActual<typeof ReactModule>('react');
  const subscribe = (listener: () => void) => {
    mockUrlListeners.add(listener);
    return () => {
      mockUrlListeners.delete(listener);
    };
  };
  const read = () => mockSearch;
  return {
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      back: jest.fn(),
      prefetch: jest.fn(),
    }),
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(subscribe, read, read)),
    usePathname: () => '/ledger/aging',
  };
});

const agingService = jest.requireMock('../api/agingService') as {
  getLedgerAging: jest.Mock;
  getLedgerSummary: jest.Mock;
  agingCsvUrl: jest.Mock;
};
const tagService = jest.requireMock('../../parties/api/tagService') as { listTags: jest.Mock };
const { agingCsvUrl: realAgingCsvUrl } =
  jest.requireActual<typeof AgingServiceModule>('../api/agingService');

/**
 * 01:30 on 23 Sep 2026 in Kolkata, which is still the 22nd in UTC.
 *
 * The as-of date defaults to the TENANT's today. Every test runs at this
 * instant so that a default computed with `toISOString()` — or on a UTC
 * machine, from the device's own clock — asks for yesterday's report, and
 * yesterday's report moves a day's worth of money between the bucket a
 * merchant ignores and the one they act on.
 */
const NOW = new Date('2026-09-22T20:00:00Z');
const TODAY = '2026-09-23';

const RAMESH_ID = '11111111-1111-4111-8111-111111111111';
const SUNITA_ID = '22222222-2222-4222-8222-222222222222';

const RAMESH: AgingRow = {
  partyId: RAMESH_ID,
  partyName: 'Ramesh Traders',
  amounts: {
    '0_30': '400.00',
    '31_60': '0.00',
    '61_90': '0.00',
    '90_plus': '1200.00',
    total: '1600.00',
  },
};
const SUNITA: AgingRow = {
  partyId: SUNITA_ID,
  partyName: 'Sunita Kirana Stores',
  amounts: {
    '0_30': '2500.00',
    '31_60': '800.00',
    '61_90': '0.00',
    '90_plus': '0.00',
    total: '3300.00',
  },
};
const TOTALS = {
  '0_30': '2900.00',
  '31_60': '800.00',
  '61_90': '0.00',
  '90_plus': '1200.00',
  total: '4900.00',
};
const ZERO = { '0_30': '0.00', '31_60': '0.00', '61_90': '0.00', '90_plus': '0.00', total: '0.00' };

/**
 * The service's answer, echoing the question's as-of date and side — which is
 * what the real server does, and what the slice's late-response guard checks:
 * a page for another date or the other side is dropped rather than shown.
 */
const answer =
  (rows: readonly AgingRow[] = [RAMESH, SUNITA], totals = TOTALS) =>
  async (filters: AgingFilters) => ({
    rows,
    totals,
    asOf: filters.asOf,
    kind: filters.kind,
    cachedAt: null,
    page: filters.page,
    pageSize: 25,
    total: rows.length,
  });

/** The filters of the most recent aging request. */
const lastAsked = (): AgingFilters => {
  const calls = agingService.getLedgerAging.mock.calls as [AgingFilters][];
  const last = calls[calls.length - 1];
  if (!last) throw new Error('no aging request was made');
  return last[0];
};

const OWNER_PERMISSIONS: readonly PermissionCode[] = ['ledger.entry.read', 'reports.export'];

const signIn = (
  permissions: readonly PermissionCode[] = OWNER_PERMISSIONS,
  enabledModules: readonly ModuleCode[] = ['parties', 'ledger']
): void => {
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
      activeTenant: { id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata' },
      tenants: [{ id: 't1', name: 'Kumar Stores', timezone: 'Asia/Kolkata' }],
      permissions: [...permissions],
      enabledModules: [...enabledModules],
      version: 1,
    })
  );
};

/**
 * The grid reads the viewport through `matchMedia`, so a test that wants a
 * particular rendering says so here — the same shape the party list uses.
 */
const setTier = (tier: UbGridTier): void => {
  const matches = (query: string): boolean =>
    tier === 'full' ? true : tier === 'compact' ? query.includes('768') : false;

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: matches(query),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
};

/** The figure on the stat tile a bucket's label heads. */
const tileFigure = (label: string): HTMLElement => {
  const figure = screen.getByText(label).parentElement?.nextElementSibling;
  if (!(figure instanceof HTMLElement)) throw new Error(`no tile for ${label}`);
  return figure;
};

/** The table's header row group, where the sort controls live. */
const tableHead = async () => {
  const table = await screen.findByTestId('ub-grid-table');
  const head = table.querySelector('thead');
  if (!head) throw new Error('no table head');
  return within(head);
};

beforeEach(() => {
  /* Only `Date` is faked. The popover, the lazy calendar and user-event all
     run on real timers, and faking those too is how a test hangs on a
     `setTimeout` nobody advances. */
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });
  store.dispatch(resetLedgerAging());
  store.dispatch(resetPartyTags());
  jest.clearAllMocks();
  mockSearch = '';
  mockUrlListeners.clear();
  mockReplace.mockImplementation((url: string) => {
    mockSearch = url.replace(/^\?/, '');
    mockUrlListeners.forEach((listener) => listener());
  });
  agingService.getLedgerAging.mockImplementation(answer());
  agingService.getLedgerSummary.mockResolvedValue({ receivable: '4900.00', payable: '1850.50' });
  agingService.agingCsvUrl.mockImplementation(realAgingCsvUrl);
  tagService.listTags.mockResolvedValue([]);
  setTier('cards');
  signIn();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('the report a merchant opens', () => {
  it("asks for today's receivables in the tenant's zone and shows the four buckets", async () => {
    /* The defaults are the report: "who owes me, and how old is it, as of
       now", oldest money first (§8). A default that asked for the payable
       side, or for the 22nd because the clock was read in UTC, would show a
       plausible screen that answers a different question. */
    renderWithProviders(<AgingPageContent />);

    await waitFor(() => expect(agingService.getLedgerAging).toHaveBeenCalledTimes(1));
    expect(lastAsked()).toEqual({
      kind: 'receivable',
      asOf: TODAY,
      tag: null,
      ordering: '-90_plus',
      page: 1,
    });

    // The rows arrive — on a phone, one card per party.
    expect(
      await screen.findByRole('button', { name: 'Open the statement for Ramesh Traders' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open the statement for Sunita Kirana Stores' })
    ).toBeInTheDocument();

    /* §7 — four tiles, youngest first, each grouped with its ₹. An empty
       bucket is a real ₹0.00 rather than a missing tile: four tiles that
       become three are a layout that jumps and a zero nobody can see. */
    expect(tileFigure('0–30 days')).toHaveTextContent('₹2,900.00');
    expect(tileFigure('31–60 days')).toHaveTextContent('₹800.00');
    expect(tileFigure('61–90 days')).toHaveTextContent('₹0.00');
    expect(tileFigure('90+ days')).toHaveTextContent('₹1,200.00');
  });

  it('puts the two positions on the tabs, and the other tab asks for payables', async () => {
    /* The tabs ARE the position (the component's own docstring): "You will
       get ₹4,900.00" is read and chosen in one glance. The defect this pins is
       the half-wired tab — a label that changes colour while the list keeps
       showing customers under the heading "You will give". */
    const user = userEvent.setup();
    renderWithProviders(<AgingPageContent />);

    const get = await screen.findByRole('tab', { name: /You will get/ });
    const give = screen.getByRole('tab', { name: /You will give/ });
    await waitFor(() => expect(get).toHaveTextContent('₹4,900.00'));
    expect(give).toHaveTextContent('₹1,850.50');
    expect(get).toHaveAttribute('aria-selected', 'true');

    await user.click(give);

    // `replace`, not `push`: switching sides is looking at one screen.
    expect(mockReplace).toHaveBeenCalledWith('?type=payable', { scroll: false });
    await waitFor(() => expect(lastAsked().kind).toBe('payable'));
    expect(lastAsked()).toMatchObject({ asOf: TODAY, page: 1 });
    expect(await screen.findByRole('tab', { name: /You will give/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    /* The position is the tenant's and has no as-of date, so switching sides
       must not re-ask for it — the answer cannot have changed. */
    expect(agingService.getLedgerSummary).toHaveBeenCalledTimes(1);
  });

  it('says the as-of date in the header as text, and a new date re-asks', async () => {
    /* The as-of date is the page's scope and sits on the header's right as
       "As of 23 Sep 2026" — a button that reads as text, not a boxed field on
       a screen with no form, and not a second "As of 23/09/2026" subtitle
       repeating it. Choosing another day must change the REPORT, not only the
       words on the button. */
    const user = userEvent.setup();
    renderWithProviders(<AgingPageContent />);

    const asOf = await screen.findByRole('button', { name: 'As of' });
    expect(within(asOf).getByText('As of')).toBeInTheDocument();
    expect(within(asOf).getByText('23 Sep 2026')).toBeInTheDocument();
    expect(screen.queryByText(/As of \d{2}\/\d{2}\/\d{4}/)).not.toBeInTheDocument();
    await screen.findByRole('button', { name: 'Open the statement for Ramesh Traders' });

    await user.click(asOf);
    const calendar = await screen.findByRole('grid');
    await user.click(within(calendar).getByRole('button', { name: /September 1st, 2026/ }));

    expect(mockReplace).toHaveBeenCalledWith('?as_of=2026-09-01', { scroll: false });
    await waitFor(() => expect(lastAsked().asOf).toBe('2026-09-01'));
    expect(lastAsked()).toMatchObject({ kind: 'receivable', page: 1 });
    expect(await screen.findByRole('button', { name: 'As of' })).toHaveTextContent('1 Sep 2026');
  });

  it('refuses a future as-of date from the address bar without asking the server', async () => {
    /* §10 — the one rule the client can check. A pasted link dated next
       quarter is told so, rather than sent to the server to be refused. */
    mockSearch = 'as_of=2026-12-31';
    renderWithProviders(<AgingPageContent />);

    expect(await screen.findByText('As-of date cannot be in the future')).toBeInTheDocument();
    expect(agingService.getLedgerAging).not.toHaveBeenCalled();
  });
});

describe('sorting', () => {
  it('sends the ordering for 90+, total and party', async () => {
    /* The sort is the server's (the report pages), so a header that re-sorts
       the fifty rows in hand while page two still arrives in the old order is
       the defect. Each click must reach the request as one of
       `AGING_ORDERINGS`; the default is 90+ largest first, so the first click
       on it flips to smallest first. */
    setTier('full');
    const user = userEvent.setup();
    renderWithProviders(<AgingPageContent />);

    let head = await tableHead();
    expect(head.getByRole('button', { name: /90\+ days/ })).toHaveAccessibleName(/largest first/);
    await user.click(head.getByRole('button', { name: /90\+ days/ }));
    await waitFor(() => expect(lastAsked().ordering).toBe('90_plus'));
    expect(mockReplace).toHaveBeenLastCalledWith('?ordering=90_plus', { scroll: false });

    head = await tableHead();
    await user.click(head.getByRole('button', { name: /Total/ }));
    await waitFor(() => expect(lastAsked().ordering).toBe('-total'));

    head = await tableHead();
    await user.click(head.getByRole('button', { name: /Party/ }));
    await waitFor(() => expect(lastAsked().ordering).toBe('-name'));

    head = await tableHead();
    await user.click(head.getByRole('button', { name: /Party/ }));
    await waitFor(() => expect(lastAsked().ordering).toBe('name'));

    // A sort is a new question: it starts again at page one.
    expect(lastAsked().page).toBe(1);
  });
});

describe('the export', () => {
  it('links to the CSV of exactly the view on screen', async () => {
    /* The file must be the report the merchant is looking at — same side,
       same date, same tag, same order — or the accountant receives a
       different book from the one that was discussed. */
    mockSearch = 'type=payable&as_of=2026-03-31&tag=Camp Area';
    renderWithProviders(<AgingPageContent />);

    const link = await screen.findByTestId('aging-export');
    expect(link).toHaveAccessibleName('Export CSV');
    expect(link).toHaveAttribute('download');
    /* ABSOLUTE, on the API origin. The relative form resolved against the
       frontend, where /ledger/aging is this page, and the export saved HTML. */
    expect(link.getAttribute('href')).toMatch(
      /^https?:\/\/[^/]+\/.*\/ledger\/aging\?type=payable&as_of=2026-03-31&tag=Camp\+Area&ordering=-90_plus&format=csv$/
    );
    expect(agingService.agingCsvUrl).toHaveBeenLastCalledWith({
      kind: 'payable',
      asOf: '2026-03-31',
      tag: 'Camp Area',
      ordering: '-90_plus',
      page: 1,
    });
  });

  it('is absent, not disabled, for a role that may not export', async () => {
    /* §12 — staff chase collections from this screen and may not leave with
       the book in a file. A control that refuses on tap is a support call. */
    signIn(['ledger.entry.read']);
    renderWithProviders(<AgingPageContent />);

    await screen.findByRole('button', { name: 'Open the statement for Ramesh Traders' });
    expect(screen.queryByTestId('aging-export')).not.toBeInTheDocument();
    expect(screen.queryByText('Export CSV')).not.toBeInTheDocument();
  });
});

describe('the states that are not a list', () => {
  it('says a settled book is settled', async () => {
    /* §9 — on this screen an empty list is GOOD NEWS, and the four ₹0.00
       tiles above "no rows" would read as a broken report. */
    agingService.getLedgerAging.mockImplementation(answer([], { ...TOTALS, ...ZERO }));
    renderWithProviders(<AgingPageContent />);

    expect(await screen.findByText('All settled')).toBeInTheDocument();
    expect(screen.getByText('Nothing outstanding — everyone is settled.')).toBeInTheDocument();
    expect(screen.queryByText('0–30 days')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('tells a merchant who narrowed to a tag that the TAG is empty, and clears it', async () => {
    /* Two different sentences: "everyone is settled" said over a tag filter is
       false — it is only Camp Area that is — and a merchant believing it stops
       chasing the rest of the book. */
    mockSearch = 'tag=Camp Area';
    agingService.getLedgerAging.mockImplementation(answer([], { ...TOTALS, ...ZERO }));
    const user = userEvent.setup();
    renderWithProviders(<AgingPageContent />);

    expect(await screen.findByText('Nothing outstanding for these tags')).toBeInTheDocument();
    expect(screen.queryByText('All settled')).not.toBeInTheDocument();
    expect(lastAsked().tag).toBe('Camp Area');

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(mockReplace).toHaveBeenLastCalledWith('?', { scroll: false });
    await waitFor(() => expect(lastAsked().tag).toBeNull());
  });

  it('shows the error with its request id, and Try again asks again', async () => {
    /* R-E-4: the request id is the only thing connecting a merchant's
       screenshot to a server log line. And a retry button that re-renders the
       error without a request is a button that teaches a merchant to give up. */
    agingService.getLedgerAging.mockRejectedValue({
      code: 'server_error',
      message: 'Something went wrong.',
      details: {},
      requestId: 'req_9c41e2',
      status: 500,
      warnings: [],
    });
    const user = userEvent.setup();
    renderWithProviders(<AgingPageContent />);

    expect(await screen.findByText('Couldn’t load aging')).toBeInTheDocument();
    expect(screen.getByTestId('request-id')).toHaveTextContent('req_9c41e2');
    const before = agingService.getLedgerAging.mock.calls.length;

    agingService.getLedgerAging.mockImplementation(answer());
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() =>
      expect(agingService.getLedgerAging.mock.calls.length).toBeGreaterThan(before)
    );
    expect(lastAsked()).toMatchObject({ kind: 'receivable', asOf: TODAY });
    expect(
      await screen.findByRole('button', { name: 'Open the statement for Ramesh Traders' })
    ).toBeInTheDocument();
  });

  it('shows a role without ledger read the no-access state and asks nothing', async () => {
    /* §19.7.5. The server would refuse anyway; the defect is the request
       made regardless — a 403 in the snackbar over an empty report, which
       reads as "broken" rather than "not yours". */
    signIn(['parties.party.read' as PermissionCode]);
    renderWithProviders(<AgingPageContent />);

    expect(await screen.findByText('You can’t see the ledger')).toBeInTheDocument();
    expect(screen.getByText('Ask the owner for access to the ledger.')).toBeInTheDocument();
    expect(agingService.getLedgerAging).not.toHaveBeenCalled();
    expect(agingService.getLedgerSummary).not.toHaveBeenCalled();
    expect(screen.queryByTestId('aging-export')).not.toBeInTheDocument();
  });

  it('treats a tenant without the ledger module the same way', async () => {
    /* The permission alone is not enough: a codename granted before the
       module was switched off must not reopen a report for a book the tenant
       does not keep. */
    signIn(OWNER_PERMISSIONS, ['parties']);
    renderWithProviders(<AgingPageContent />);

    expect(await screen.findByText('You can’t see the ledger')).toBeInTheDocument();
    expect(agingService.getLedgerAging).not.toHaveBeenCalled();
  });
});

describe('every figure is a way in (FR-4)', () => {
  it('on a phone, a card opens the statement as of the report date', async () => {
    /* An accountant reading a year-end report and tapping a party must land
       on the year-end statement, not on this morning's — so the as-of date
       travels with the tap. And the card is ONE target: a link inside the
       card's button would be two targets in one place and invalid HTML. */
    mockSearch = 'as_of=2026-03-31';
    const user = userEvent.setup();
    renderWithProviders(<AgingPageContent />);

    const card = await screen.findByRole('button', {
      name: 'Open the statement for Ramesh Traders',
    });
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
    /* The meta line says the oldest bucket in words rather than drawing a
       48 px bar that cut "31–60 days" to "31–60 da" at 360 px. */
    expect(within(card).getByText('₹1,200.00 · 90+ days')).toBeInTheDocument();
    expect(within(card).queryByTestId('aging-bucket-bar')).not.toBeInTheDocument();

    await user.click(card);

    expect(mockPush).toHaveBeenCalledWith(
      `/parties/${RAMESH_ID}/statement?preset=custom&to=2026-03-31`
    );
  });

  it('names each cell link by party, bucket and amount, and skips the empty ones', async () => {
    /* Without the name a screen reader offers a table of links all called
       "₹1,200.00" — eighty of them on a busy book, none saying whose or how
       old. And a ₹0.00 link opens a statement filtered to nothing. */
    setTier('full');
    renderWithProviders(<AgingPageContent />);

    const oldest = await screen.findByRole('link', {
      name: '90+ days for Ramesh Traders, ₹1,200.00. Open the statement.',
    });
    expect(oldest).toHaveTextContent('₹1,200.00');
    // 91 days before 23 Sep, with no lower bound: "90+" has no oldest edge.
    expect(oldest).toHaveAttribute(
      'href',
      `/parties/${RAMESH_ID}/statement?preset=custom&to=2026-06-24`
    );
    expect(
      screen.getByRole('link', {
        name: '0–30 days for Ramesh Traders, ₹400.00. Open the statement.',
      })
    ).toHaveAttribute(
      'href',
      `/parties/${RAMESH_ID}/statement?preset=custom&to=2026-09-23&from=2026-08-24`
    );
    expect(
      screen.queryByRole('link', { name: /61–90 days for Ramesh Traders/ })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '₹1,200.00' })).not.toBeInTheDocument();
  });

  it('announces the age bar in words, with every bucket', async () => {
    /* Colour never carries the age alone (§5): the bar is `role="img"` and
       its name is the four buckets and amounts, in age order. */
    setTier('full');
    renderWithProviders(<AgingPageContent />);

    const bar = await screen.findByRole('img', { name: /Ramesh Traders/ });
    expect(bar).toHaveAccessibleName(
      'Age of what Ramesh Traders owes: 0–30 days, ₹400.00; 31–60 days, ₹0.00; ' +
        '61–90 days, ₹0.00; 90+ days, ₹1,200.00'
    );
    // Only the buckets with money get a segment, and they fill the track.
    const segments = Array.from(bar.querySelectorAll('[data-bucket]'));
    expect(segments.map((segment) => segment.getAttribute('data-bucket'))).toEqual([
      '0_30',
      '90_plus',
    ]);
    expect(segments.map((segment) => segment.getAttribute('data-share'))).toEqual(['25', '75']);
  });

  it.each<UbGridTier>(['full', 'compact'])(
    'on the %s table, the party is one link and not a link inside a button',
    async (tier) => {
      /* The grid wraps the first cell in its row-open button whenever
       `onRowOpen` is passed; the party cell on a table is already a link to
       the same statement. Together they were an `<a>` inside a `<button>` —
       two targets in one place and invalid HTML, which is exactly what the
       column model's docstring says the table must not do. The row-open
       control belongs to the card, where the cells are text. */
      setTier(tier);
      renderWithProviders(<AgingPageContent />);

      const party = await screen.findByRole('link', { name: 'Ramesh Traders' });
      expect(party).toHaveAttribute(
        'href',
        `/parties/${RAMESH_ID}/statement?preset=custom&to=${TODAY}`
      );
      expect(party.closest('button')).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Open the statement for Ramesh Traders' })
      ).not.toBeInTheDocument();
    }
  );
});
