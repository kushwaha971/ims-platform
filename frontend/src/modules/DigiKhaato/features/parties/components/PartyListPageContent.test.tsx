import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';

import {
  describeHorizontalOverflow,
  findHorizontalOverflow,
  type UbGridTier,
} from 'src/design-system/UbDataGrid';
import { sessionLoaded } from 'src/redux/slice/sessionSlice';
import { store } from 'src/redux/store';
import { hi } from 'src/tests/allMessages';
import { renderWithProviders } from 'src/tests/renderWithProviders';
import type { PermissionCode } from 'src/types/domain.types';

import { resetPartyForm } from '../redux/partyFormSlice';
import { resetPartyList } from '../redux/partyListSlice';
import { resetPartyTags } from '../redux/partyTagSlice';

import { PartyListPageContent } from './PartyListPageContent';

/**
 * The walking skeleton, end to end inside the client (Part 32 S0-71 / S0-73):
 * route content → hook → thunk → service → axios, with the service stubbed at
 * the module boundary (§19.13.3) — plus the approved responsive rules, asserted
 * on the real screen rather than only on the component that implements them.
 */
jest.mock('../api/partyService');
/* PTY-05 — the list now asks for the tenant's tags on mount, for the filter and
   the bulk dialog. Stubbed at the same boundary as `partyService`, so these
   tests decide whether the book uses tags rather than leaving an unmocked
   request to fail into jsdom and take the chip lane with it. */
jest.mock('../api/tagService');

/**
 * The list navigates now, so it needs a router. `mockPush` is captured rather
 * than thrown away because "the row opens the khata page" is a claim worth
 * asserting: until PTY-03 the rows did not move at all.
 *
 * The `mock` prefix is not style — `jest.mock` is hoisted above the imports,
 * and a factory referencing any other out-of-scope name throws at module load.
 */
const mockPush = jest.fn();
const mockReplace = jest.fn();
/**
 * The URL is now an INPUT to this screen (PTY-05's manager links to
 * `/parties?tag=Camp Area`), so the search params are settable per test rather
 * than a constant empty string. `mockSearch` is mutated by the tests that care;
 * everything else sees the unfiltered list it always saw.
 *
 * The `mock` prefix is not style — `jest.mock` is hoisted above the imports,
 * and a factory referencing any other out-of-scope name throws at module load.
 */
let mockSearch = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    prefetch: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(mockSearch),
  usePathname: () => '/parties',
}));

const partyService = jest.requireMock('../api/partyService') as {
  listParties: jest.Mock;
  bulkArchiveParties: jest.Mock;
};

const tagService = jest.requireMock('../api/tagService') as {
  listTags: jest.Mock;
  bulkTagParties: jest.Mock;
};

const CAMP = { id: 'tag-1', name: 'Camp Area', color: 'viz-1' };
const ROUTE2 = { id: 'tag-2', name: 'Route 2', color: null };

const EMPTY = {
  rows: [],
  meta: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
  totals: null,
};

const RAMESH = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ramesh Traders',
  displayCode: 'C-001',
  mobile: '+919876543210',
  isCustomer: true,
  isSupplier: false,
  balance: '2800.00',
  status: 'active' as const,
  lastActivityAt: '2026-09-18T10:00:00Z',
  tags: [],
};

const SUNITA = {
  ...RAMESH,
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Sunita Stores',
  displayCode: 'C-002',
  mobile: '+919811122334',
  // Negative: the merchant owes this one — the payable, green family.
  balance: '-900.00',
};

const loaded = (rows: readonly unknown[]) => ({
  rows,
  meta: { page: 1, pageSize: 25, total: rows.length, totalPages: 1 },
  totals: null,
});

/**
 * The screen reads the viewport through `matchMedia`, so a test that wants a
 * particular rendering says so here. This is the whole reason the tier is a
 * value: the three renderings are reachable on one jsdom viewport.
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

describe('PartyListPageContent', () => {
  beforeEach(() => {
    store.dispatch(resetPartyList());
    store.dispatch(resetPartyTags());
    jest.clearAllMocks();
    /* No tags, which is what most of this file is about — the list as it is on
       a book that has not adopted them. The tag suite at the bottom says
       otherwise for itself. */
    tagService.listTags.mockResolvedValue([]);
    setTier('cards');
  });

  it('paints the skeleton first, then the first-use empty state', async () => {
    partyService.listParties.mockResolvedValue(EMPTY);

    renderWithProviders(<PartyListPageContent />);

    /* Named: the totals tiles shimmer too now (§9 Initial), so the grid's
       skeleton is one of several `status` regions on the first frame. */
    expect(screen.getByRole('status', { name: 'Loading customers' })).toBeInTheDocument();
    expect(await screen.findByText('No customers yet')).toBeInTheDocument();
    expect(
      screen.getByText('Add the first person you give udhaar to, and their khata starts here.')
    ).toBeInTheDocument();
    expect(partyService.listParties).toHaveBeenCalledTimes(1);
  });

  it('renders the same empty state in Hindi', async () => {
    partyService.listParties.mockResolvedValue(EMPTY);

    renderWithProviders(<PartyListPageContent />, {
      locale: 'hi',
      messages: hi as Record<string, string>,
    });

    expect(await screen.findByText('अभी कोई ग्राहक नहीं है')).toBeInTheDocument();
  });

  it('renders the rows it is given, with the balance label the view-model chose', async () => {
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));

    renderWithProviders(<PartyListPageContent />);

    expect(await screen.findByText('Ramesh Traders')).toBeInTheDocument();
    const cards = screen.getByTestId('ub-grid-cards');
    // A positive balance is money the merchant will get — receivable, unsigned.
    expect(within(cards).getByText('You will get, ₹2,800.00')).toBeInTheDocument();
  });

  it('shows the error state with the request id when the request fails', async () => {
    partyService.listParties.mockRejectedValue({
      code: 'server_error',
      message: 'Something went wrong.',
      details: {},
      requestId: 'req_7f3a91',
      status: 500,
      warnings: [],
    });

    renderWithProviders(<PartyListPageContent />);

    await waitFor(() =>
      expect(screen.getByText('We could not load your customers')).toBeInTheDocument()
    );
    // R-E-4 — the only thing that connects a screenshot to a backend log line.
    // Labelled, not a bare id (QA B5): the merchant has to know it is the
    // thing to quote.
    expect(screen.getByTestId('request-id')).toHaveTextContent('Reference req_7f3a91');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows the CLIENT request id when the server never answered (QA D2)', async () => {
    /* Prevents QA defect D2: a network-level failure (no response) rendered
       the error state with no reference at all, because `toApiError` read
       the id only from a response — although the client sent an
       X-Request-Id on the request. The raw AxiosError goes through the real
       thunk and `toApiError`, not a pre-shaped error. */
    partyService.listParties.mockRejectedValue(
      new AxiosError('Network Error', 'ERR_NETWORK', {
        headers: new AxiosHeaders({ 'X-Request-Id': 'req_abc' }),
      } as InternalAxiosRequestConfig)
    );

    renderWithProviders(<PartyListPageContent />);

    await waitFor(() =>
      expect(screen.getByText('We could not load your customers')).toBeInTheDocument()
    );
    // … and labelled "Reference" (QA B5): D2 put the id on screen but as a
    // bare UUID, because UbEmptyState never printed the label.
    expect(screen.getByTestId('request-id')).toHaveTextContent('Reference req_abc');
  });

  it('offers to CLEAR the search on a filtered-empty result, and says so', async () => {
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    partyService.listParties.mockResolvedValue(EMPTY);
    await userEvent.type(screen.getByLabelText('Search customers'), 'zzz');

    /* The search wording, which quotes the term the merchant typed — that is
       the thing they will want to read back to check for a typo. */
    expect(await screen.findByText('No customers match “zzz”')).toBeInTheDocument();
    // CR-2026-09-19-D — the action clears the search, so the label says so.
    // It read "Try again", which is what the ERROR state's action does.
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});

describe('the figures the screen answers', () => {
  beforeEach(() => {
    store.dispatch(resetPartyList());
    jest.clearAllMocks();
    partyService.listParties.mockResolvedValue(loaded([RAMESH, SUNITA]));
  });

  /**
   * These used to assert the two totals sat inside the `sticky` header, which
   * was Part 17 §17.0.2's rule. The rule was right about the problem — a total
   * you have to scroll back for is a total you cannot use — and wrong about
   * the remedy: three figures, two labels and a scope note crammed into a
   * header's `controls` slot read as a caption, and there was nowhere to put
   * the customer count except a grey line of its own below.
   *
   * They are BrandHub stat cards in the page body now, which is what the
   * owner asked for and what BrandHub's own payments and stock pages do. The
   * trade was made knowingly: the cards scroll away, and the sticky header
   * keeps the TITLE so a merchant twenty rows down still knows which list they
   * are reading. What these tests hold onto is everything else about the rule —
   * both sums present, at every tier, each labelled and each carrying its
   * scope.
   */
  it.each<UbGridTier>(['cards', 'compact', 'full'])(
    'shows both sums and the count at the %s tier',
    async (tier) => {
      setTier(tier);
      renderWithProviders(<PartyListPageContent />);
      await screen.findByTestId('ub-grid');

      const stats = screen.getByTestId('ub-stat-grid');
      expect(within(stats).getByText('You will get')).toBeInTheDocument();
      expect(within(stats).getByText('₹2,800.00')).toBeInTheDocument();
      expect(within(stats).getByText('You will give')).toBeInTheDocument();
      expect(within(stats).getByText('₹900.00')).toBeInTheDocument();
      expect(within(stats).getByText('Customers')).toBeInTheDocument();
    }
  );

  it('sits in the body, under a header that still carries the title', async () => {
    setTier('full');
    renderWithProviders(<PartyListPageContent />);
    await screen.findByTestId('ub-grid');

    // BrandHub's arrangement: cards scroll with the page…
    expect(screen.getByTestId('ub-stat-grid').closest('header')).toBeNull();
    // …and the sticky header still says which list this is.
    const heading = screen.getByRole('heading', { name: 'Customers', level: 1 });
    expect(heading.closest('header')).not.toBeNull();
  });

  it('says which set the two figures describe, rather than leaving it to be guessed', async () => {
    setTier('cards');
    renderWithProviders(<PartyListPageContent />);
    await screen.findByTestId('ub-grid');
    // Sprint 0's endpoint sends no totals block, so these are the page's sum.
    // Both money cards carry it; the count card says what it counts instead.
    expect(screen.getAllByText('From the 2 customers on this page')).toHaveLength(2);
    expect(screen.getByText('In your book')).toBeInTheDocument();
  });

  it('counts every party the filter matches, not the rows on this page', async () => {
    setTier('full');
    renderWithProviders(<PartyListPageContent />);
    await screen.findByTestId('ub-grid');

    // The count card reads the server's total. Two rows are rendered; the
    // figure beside "Customers" is the whole list, which is the number a
    // merchant is actually asking for.
    const stats = screen.getByTestId('ub-stat-grid');
    expect(within(stats).getByText('2')).toBeInTheDocument();
  });
});

describe('the approved responsive rules, on the real screen', () => {
  beforeEach(() => {
    store.dispatch(resetPartyList());
    jest.clearAllMocks();
    partyService.listParties.mockResolvedValue(loaded([RAMESH, SUNITA]));
  });

  it('below md the merchant gets cards, never a table', async () => {
    setTier('cards');
    renderWithProviders(<PartyListPageContent />);
    await screen.findByTestId('ub-grid-cards');

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    // Three facts: who, how much, and how stale.
    const card = screen.getAllByTestId('ub-grid-card')[0] as HTMLElement;
    expect(within(card).getByText('Ramesh Traders')).toBeInTheDocument();
    expect(within(card).getByText('You will get, ₹2,800.00')).toBeInTheDocument();
    // Formatted as the khata and the reminder sheet show it (QA O6 follow-up).
    expect(within(card).getByText('C-001 · +91 98765 43210')).toBeInTheDocument();
  });

  it('between md and lg it keeps Customer, Balance and Last entry and drops the rest', async () => {
    setTier('compact');
    renderWithProviders(<PartyListPageContent />);
    await screen.findByRole('table');

    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent ?? '');
    expect(headers).toHaveLength(3);
    expect(headers.some((text) => text.includes('Customer'))).toBe(true);
    expect(headers.some((text) => text.includes('Balance'))).toBe(true);
    expect(headers.some((text) => text.includes('Last entry'))).toBe(true);
    // The two that support no decision at this width.
    expect(headers.some((text) => text.includes('Code and mobile'))).toBe(false);
    expect(headers.some((text) => text.includes('Status'))).toBe(false);
  });

  it('at lg it is the full table, with bulk selection', async () => {
    setTier('full');
    renderWithProviders(<PartyListPageContent />);
    await screen.findByRole('table');

    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent ?? '');
    expect(headers.some((text) => text.includes('Code and mobile'))).toBe(true);
    expect(headers.some((text) => text.includes('Status'))).toBe(true);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Ramesh Traders' }));

    /**
     * Read off the SELECTION BAR, not off the page.
     *
     * This assertion existed before and passed while the bar was rendering
     * "NaN selected" — because the page's bulk-action slot painted its own
     * "1 selected" three inches to the right, and `findByText` found that one.
     * Two copies of the same sentence hid a broken one. The duplicate is gone,
     * so the only thing that can satisfy this now is the bar's own label, and
     * the label only reads correctly if the ICU plural was resolved where the
     * count is known (see `UbDataGridLabels.selectedCount`).
     */
    const bar = await screen.findByTestId('ub-grid-toolbar');
    expect(bar).toHaveAttribute('data-selecting', 'true');
    expect(within(bar).getByText('1 selected')).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Clear selection' })).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it('renders the paging summary from the real message, slots and all', async () => {
    setTier('cards');
    renderWithProviders(<PartyListPageContent />);
    await screen.findByTestId('ub-grid');
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  });

  it.each<UbGridTier>(['cards', 'compact', 'full'])(
    'never scrolls sideways at the %s tier',
    async (tier) => {
      setTier(tier);
      const { container } = renderWithProviders(<PartyListPageContent />);
      await screen.findByTestId('ub-grid');

      const findings = findHorizontalOverflow(screen.getByTestId('ub-grid'));
      expect(describeHorizontalOverflow(findings)).toEqual([]);
      expect(container).toBeTruthy();
    }
  );

  // ── PTY-02 — the chips, the tiles and which empty state the screen picks ───

  const lastParams = () =>
    partyService.listParties.mock.calls.at(-1)?.[0] as Record<string, unknown>;

  it('sends a chip filter to the server when it is tapped', async () => {
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
    const user = userEvent.setup();

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    await user.click(screen.getByRole('button', { name: 'Overdue' }));

    await waitFor(() => expect(lastParams()?.collection).toBe('overdue'));
    expect(screen.getByRole('button', { name: 'Overdue', pressed: true })).toBeInTheDocument();
  });

  it('clears a chip when the applied one is tapped again', async () => {
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
    const user = userEvent.setup();

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    const chip = screen.getByRole('button', { name: 'Suppliers' });
    await user.click(chip);
    await waitFor(() => expect(lastParams()?.type).toBe('supplier'));

    await user.click(screen.getByRole('button', { name: 'Suppliers' }));
    await waitFor(() => expect(lastParams()?.type).toBe(''));
  });

  it('replaces rather than adds when a second chip on the same axis is tapped', async () => {
    /**
     * `balance` is one value on the wire — a `ChoiceFilter`. A chip row that
     * looked multi-select would silently drop one of the two choices, which is
     * worse than a control that never offered it.
     */
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
    const user = userEvent.setup();

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    await user.click(screen.getByRole('button', { name: 'Owes me' }));
    await waitFor(() => expect(lastParams()?.balance).toBe('owes_me'));

    await user.click(screen.getByRole('button', { name: 'I owe them' }));
    await waitFor(() => expect(lastParams()?.balance).toBe('i_owe'));
    expect(screen.getByRole('button', { name: 'Owes me', pressed: false })).toBeInTheDocument();
  });

  it('filters the list from the receivable tile, and the chip says so', async () => {
    /**
     * FRD §6 Alternate A, the collection round: the merchant reads ₹2,800 and
     * the next thing they want is the list of who it is made of. The chip
     * lighting up is half the requirement — a filter applied with nothing on
     * screen saying it is applied is how a merchant concludes that parties
     * have gone missing.
     */
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
    const user = userEvent.setup();

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    await user.click(screen.getByRole('button', { name: 'Show only who owes me' }));

    await waitFor(() => expect(lastParams()?.balance).toBe('owes_me'));
    expect(screen.getByRole('button', { name: 'Owes me', pressed: true })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Show only who owes me', pressed: true })
    ).toBeInTheDocument();
  });

  it('un-filters when the applied tile is tapped again', async () => {
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
    const user = userEvent.setup();

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    await user.click(screen.getByRole('button', { name: 'Show only who I owe' }));
    await waitFor(() => expect(lastParams()?.balance).toBe('i_owe'));

    await user.click(screen.getByRole('button', { name: 'Show only who I owe' }));
    await waitFor(() => expect(lastParams()?.balance).toBe(''));
  });

  it('announces the totals when a filter changes them', async () => {
    /**
     * PTY-02's NFR. A filter changes the rows visibly and the totals silently;
     * without the live region a merchant using a screen reader taps "Owes me"
     * and is told nothing about the number they tapped it to find out.
     */
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    const region = screen.getByRole('region', { name: 'Totals for this list' });
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  it('shows the FILTERED empty state when a chip matched nothing', async () => {
    /**
     * The defect this pins. `isFiltered` was `filters.q.length > 0`, and it is
     * what chooses the empty state — so a merchant with three hundred parties
     * who tapped "Settled" and had none was told "No customers yet. Add the
     * first person you give udhaar to", with a button to create one, on a book
     * full of them. The rows were right and the reason was wrong, and the
     * reason is the only thing an empty state is for.
     */
    partyService.listParties.mockResolvedValueOnce(loaded([RAMESH]));
    const user = userEvent.setup();

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    partyService.listParties.mockResolvedValue(EMPTY);
    await user.click(screen.getByRole('button', { name: 'Settled' }));

    /* And the words match the way it was reached: no search was typed, so it
       must not tell the merchant to clear one. */
    expect(await screen.findByText('No customers match these filters')).toBeInTheDocument();
    expect(screen.getByText('Clear the filters to see everyone again.')).toBeInTheDocument();
    expect(screen.queryByText('No customers yet')).not.toBeInTheDocument();
  });

  it('still shows the first-use empty state on a genuinely empty book', async () => {
    /**
     * The other side of the same decision: `status` is excluded from the
     * filter count precisely so a brand-new tenant is not told to clear
     * filters they never set.
     */
    partyService.listParties.mockResolvedValue(EMPTY);

    renderWithProviders(<PartyListPageContent />);

    expect(await screen.findByText('No customers yet')).toBeInTheDocument();
  });

  /* The two "Add “{q}”" tests are in `PartyFormDrawer.test.tsx`, not here.
     They belong wherever a WRITER is signed in: this file's store has no
     permissions, so `partyForm.canWrite` is false and the button is absent
     whatever the search box says — which is how the negative one of the pair
     passed here for entirely the wrong reason before it moved. */

  it('offers to clear filters only once there are filters to clear', async () => {
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
    const user = userEvent.setup();

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    expect(screen.queryByRole('button', { name: /Clear filters/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Overdue' }));

    expect(await screen.findByRole('button', { name: 'Clear filters (1)' })).toBeInTheDocument();
  });

  it('counts Archived as a filter and clears it with the rest (UAT D7)', async () => {
    /**
     * Prevents UAT D7. "Clear filters" on Archived used to keep the merchant on
     * Archived, on the theory that it was a tab. It is a select in the toolbar,
     * nothing else on screen says it is on, and it was not in the "(n)" — so a
     * merchant back on the list read ₹0 / ₹0 over one archived party with no
     * visible way out. Archived now counts, and clearing takes it off.
     */
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
    const user = userEvent.setup();

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    /* `UbSelect` is a Radix listbox since `ml-uikit` was vendored, not a native
       `<select>` — `selectOptions` finds nothing. */
    await user.click(screen.getByRole('combobox', { name: 'Show' }));
    await user.click(await screen.findByRole('option', { name: 'Archived' }));
    await waitFor(() => expect(lastParams()?.status).toBe('archived'));
    expect(await screen.findByRole('button', { name: 'Clear filters (1)' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Owes me' }));
    await waitFor(() => expect(lastParams()?.balance).toBe('owes_me'));

    await user.click(screen.getByRole('button', { name: 'Clear filters (2)' }));

    await waitFor(() => expect(lastParams()?.balance).toBe(''));
    expect(lastParams()?.status).toBe('active');
    expect(screen.queryByRole('button', { name: /Clear filters/ })).not.toBeInTheDocument();
  });

  it('opens the khata page when a row is tapped', async () => {
    /**
     * PTY-03 made the list lead somewhere. Before it there was no
     * `/parties/[id]` route, so the grid's row-open affordance was left
     * unwired on purpose — a chevron that navigates to a 404 is worse than a
     * row that plainly does not move.
     */
    setTier('full');
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
    const user = userEvent.setup();

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    await user.click(screen.getByRole('button', { name: 'Open Ramesh Traders' }));

    expect(mockPush).toHaveBeenCalledWith(`/parties/${encodeURIComponent(RAMESH.id)}`);
  });
});

describe('the yearly clean-up', () => {
  /**
   * PTY-04 FR-9. The selection bar existed with a count and a "Clear
   * selection" — the one thing a merchant can DO with a selection, and the
   * reason the bar exists at all, was missing.
   */
  const signIn = (permissions: readonly PermissionCode[]): void => {
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
        enabledModules: [],
        version: 1,
      })
    );
  };

  const selectFirstRow = async (user: ReturnType<typeof userEvent.setup>) => {
    setTier('full');
    partyService.listParties.mockResolvedValue(loaded([RAMESH, SUNITA]));
    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');
    await user.click(screen.getByRole('checkbox', { name: 'Select Ramesh Traders' }));
    return screen.findByTestId('ub-grid-toolbar');
  };

  beforeEach(() => {
    store.dispatch(resetPartyList());
    jest.clearAllMocks();
    partyService.bulkArchiveParties.mockResolvedValue({ archived: [RAMESH.id], skipped: [] });
    signIn(['parties.party.read', 'parties.party.delete']);
  });

  it('offers to archive what is selected', async () => {
    const user = userEvent.setup();
    const bar = await selectFirstRow(user);

    expect(within(bar).getByRole('button', { name: 'Archive' })).toBeInTheDocument();
  });

  it('does not offer it to a role that cannot archive', async () => {
    signIn(['parties.party.read']);
    const user = userEvent.setup();
    const bar = await selectFirstRow(user);

    expect(within(bar).queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
  });

  it('says up front that anyone with a balance will be skipped', async () => {
    /**
     * Before the press, not after. A merchant who knows it reads the result as
     * the system working; one who does not reads "26 of 30" as a partial
     * failure and goes looking for what went wrong.
     */
    const user = userEvent.setup();
    const bar = await selectFirstRow(user);
    await user.click(within(bar).getByRole('button', { name: 'Archive' }));

    expect(
      await screen.findByText('Anyone with a balance or open records will be skipped.')
    ).toBeInTheDocument();
  });

  it('reports who was skipped and what they owe, instead of closing', async () => {
    /**
     * A partial success is the NORMAL outcome, and "Archived 1 · 1 skipped" in
     * a snackbar tells the merchant a number and then disappears. What they
     * need is which one and how much, so that they can go and chase it — so the
     * dialog becomes the report rather than dismissing itself.
     */
    partyService.bulkArchiveParties.mockResolvedValue({
      archived: [RAMESH.id],
      skipped: [
        { id: SUNITA.id, name: 'Sunita Stores', code: 'party_balance_nonzero', balance: '900.00' },
        /* A NEGATIVE balance, because this line first shipped rendering
           "Naidu Agency — -₹282.90 outstanding": `formatInr` signs what it
           formats, and "outstanding" says nothing about who owes whom. The
           direction belongs in the wording (§23.2.6 rule 3). */
        { id: 'p3', name: 'Naidu Agency', code: 'party_balance_nonzero', balance: '-282.90' },
      ],
    });
    const user = userEvent.setup();
    const bar = await selectFirstRow(user);
    await user.click(within(bar).getByRole('button', { name: 'Archive' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));

    expect(await screen.findByText('Archived 1 · 2 skipped')).toBeInTheDocument();
    expect(screen.getByText('Sunita Stores — ₹900.00 still to collect')).toBeInTheDocument();
    expect(screen.getByText('Naidu Agency — ₹282.90 still to pay')).toBeInTheDocument();
    expect(screen.queryByText(/-₹|−₹/)).not.toBeInTheDocument();
  });

  it('is not offered on the Archived tab, where every row would be skipped', async () => {
    const user = userEvent.setup();
    setTier('full');
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    await user.click(screen.getByRole('combobox', { name: 'Show' }));
    await user.click(await screen.findByRole('option', { name: 'Archived' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Select Ramesh Traders' }));

    const bar = await screen.findByTestId('ub-grid-toolbar');
    expect(within(bar).queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
  });
});

describe('tags on the party list', () => {
  /**
   * PTY-05. Its own block rather than a few cases bolted on to the clean-up
   * suite above, because the tag list is a SECOND stubbed service with its own
   * default — a book with no tags — and sharing a `beforeEach` that clears
   * every mock is how a tag test quietly starts asserting against an empty
   * picker and passing for the wrong reason.
   */
  const signIn = (permissions: readonly PermissionCode[]): void => {
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
        enabledModules: [],
        version: 1,
      })
    );
  };

  beforeEach(() => {
    store.dispatch(resetPartyList());
    store.dispatch(resetPartyTags());
    jest.clearAllMocks();
    mockSearch = '';
    /* The default is a book with NO tags, which is the state most tenants are
       in and the one the chip lane must cost nothing in. A test about tags says
       so explicitly. */
    tagService.listTags.mockResolvedValue([]);
    signIn(['parties.party.read', 'parties.party.write']);
    setTier('cards');
  });

  it('shows a party’s tags on the row, and names the list after them', async () => {
    /**
     * FR-6's chips, rendered from the tags the LIST response already carried —
     * they are prefetched server-side precisely so a list of twenty-five rows
     * is not twenty-five extra requests. The `listTags` stub is irrelevant to
     * this assertion, which is the point.
     */
    setTier('full');
    partyService.listParties.mockResolvedValue(loaded([{ ...RAMESH, tags: [CAMP, ROUTE2] }]));

    renderWithProviders(<PartyListPageContent />);

    const list = await screen.findByRole('list', { name: 'Tags on Ramesh Traders' });
    expect(within(list).getByText('Camp Area')).toBeInTheDocument();
    expect(within(list).getByText('Route 2')).toBeInTheDocument();
  });

  it('shows ONE chip and a count on a phone card', async () => {
    /**
     * Found in a screenshot at 360 px, not in a test.
     *
     * The card's title column is about 180 px wide, and two chips in it ran off
     * the edge — the second one cut mid-glyph, reading "Decca" with no ellipsis,
     * which looks like a rendering fault rather than a shortened label. One chip
     * and "+1" is the same information in the space there is: which group this
     * party is in, and that there is more. The khata page is one tap away and
     * shows all of them.
     *
     * The table keeps two, which is why this is a property of the SCREEN rather
     * than of the chip: a `cell` function is called identically at all three
     * renderings and cannot tell which one it is painting.
     */
    setTier('cards');
    partyService.listParties.mockResolvedValue(loaded([{ ...RAMESH, tags: [CAMP, ROUTE2] }]));

    renderWithProviders(<PartyListPageContent />);

    const list = await screen.findByRole('list', { name: 'Tags on Ramesh Traders' });
    expect(within(list).getByText('Camp Area')).toBeInTheDocument();
    expect(within(list).queryByText('Route 2')).not.toBeInTheDocument();
    expect(within(list).getByText('+1')).toBeInTheDocument();
    /* And the one it could not show is still reachable without leaving the row. */
    expect(within(list).getByTitle('Route 2')).toBeInTheDocument();
  });

  it('offers no tag filter at all in a book that has no tags', async () => {
    /**
     * An empty picker on a new install is a control that can only disappoint.
     * The three fixed axes are answerable on day one; this one needs the
     * merchant to have set something up first, so it appears when they have.
     */
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
    tagService.listTags.mockResolvedValue([]);

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    expect(screen.queryByRole('combobox', { name: 'Tag' })).not.toBeInTheDocument();
  });

  it('sends the chosen tag to the server and counts it as a filter', async () => {
    /**
     * Two claims in one, and the second is the one that was broken first.
     *
     * The filter reaches the wire as `tag` — asserted on the REQUEST, because a
     * chip that looks applied over an unfiltered list is the failure mode a
     * control-level assertion cannot see.
     *
     * And `activeFilterCount` counts it: before PTY-05 that list was
     * `[q, type, balance, collection]`, so a merchant who filtered to a tag and
     * found nobody would have been shown the FIRST-USE empty state — "No
     * customers yet, add the first person you give udhaar to" — on a book with
     * three hundred parties in it, and no Clear affordance to get back out.
     */
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
    tagService.listTags.mockResolvedValue([{ ...CAMP, partyCount: 34 }]);
    const user = userEvent.setup();

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    await user.click(await screen.findByRole('combobox', { name: 'Tag' }));
    await user.click(await screen.findByText('Camp Area'));

    await waitFor(() => {
      expect(partyService.listParties).toHaveBeenLastCalledWith(
        expect.objectContaining({ tag: 'Camp Area' }),
        expect.anything()
      );
    });
    expect(screen.getByRole('button', { name: /Clear filters/ })).toBeInTheDocument();
  });

  it('tags a selection, and reports who was skipped rather than only how many', async () => {
    /**
     * FR-8. The dialog becomes the report for the same reason PTY-04's bulk
     * archive does: "1 party" with no list sends a merchant back through forty
     * rows to find the one that did not take.
     */
    setTier('full');
    partyService.listParties.mockResolvedValue(loaded([RAMESH, SUNITA]));
    tagService.listTags.mockResolvedValue([{ ...ROUTE2, partyCount: 0 }]);
    tagService.bulkTagParties.mockResolvedValue({
      updatedCount: 1,
      previous: [],
      skipped: [{ id: SUNITA.id, reason: 'tag_limit_reached' }],
    });
    const user = userEvent.setup();

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    await user.click(screen.getByRole('checkbox', { name: 'Select Ramesh Traders' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Sunita Stores' }));
    await user.click(screen.getByRole('button', { name: 'Add tag' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox', { name: 'Tags' }));
    /* Screen-level, not `within(dialog)`: Radix portals the picker's popover to
       the body rather than nesting it inside the dialog, so scoping the query
       to the dialog would look in the one place the options are not. */
    await user.click(await screen.findByText('Route 2'));
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText('Tagged 1 party')).toBeInTheDocument();
    expect(screen.getByText('already carries 10 tags')).toBeInTheDocument();
  });

  it('does not offer Add tag to a role that cannot write', async () => {
    /**
     * §19.7.5 — hidden, not disabled. An accountant reads the book; a control
     * that would 403 is a support call waiting to happen.
     */
    setTier('full');
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
    const user = userEvent.setup();

    signIn(['parties.party.read']);
    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    await user.click(screen.getByRole('checkbox', { name: 'Select Ramesh Traders' }));

    expect(screen.queryByRole('button', { name: 'Add tag' })).not.toBeInTheDocument();
  });

  it('applies a tag filter that arrived in the URL', async () => {
    /**
     * The defect this test exists for.
     *
     * PTY-05's manager makes "Camp Area · 34" a link to `/parties?tag=Camp
     * Area` — the fastest route from "which tag holds this part of the book" to
     * working through it. It went to an UNFILTERED list, because nothing on
     * this screen had ever read the URL: the filters lived only in Redux and
     * were seeded from their defaults on every mount. The link was not subtly
     * wrong, it was inert, and every unit test passed because none of them had
     * a URL.
     */
    mockSearch = 'tag=Camp+Area';
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
    tagService.listTags.mockResolvedValue([{ ...CAMP, partyCount: 34 }]);

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    await waitFor(() => {
      expect(partyService.listParties).toHaveBeenLastCalledWith(
        expect.objectContaining({ tag: 'Camp Area' }),
        expect.anything()
      );
    });
  });

  it('shows the filter that arrived in the URL as an applied chip', async () => {
    /**
     * Half a fix would have been worse than none: a list that is filtered while
     * every control says it is not gives the merchant no way to see what is
     * applied and no way to take it off.
     */
    mockSearch = 'tag=Camp+Area';
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
    tagService.listTags.mockResolvedValue([{ ...CAMP, partyCount: 34 }]);

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    expect(await screen.findByRole('button', { name: 'Remove tag Camp Area' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear filters/ })).toBeInTheDocument();
  });

  it('puts a search term from the URL into the search box', async () => {
    /**
     * The other direction of the same rule. A link carrying `?q=ramesh`
     * filtered the list correctly over an EMPTY search field, so the merchant
     * could see neither what was applied nor how to clear it — and the first
     * keystroke would have silently replaced a filter they did not know was
     * there.
     */
    mockSearch = 'q=ramesh';
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    expect(await screen.findByDisplayValue('ramesh')).toBeInTheDocument();
  });

  it('ignores a filter value the product does not have', async () => {
    /**
     * A URL is untrusted input and `type` reaches the database as a query
     * parameter. An unrecognised value is DROPPED rather than refused: a link
     * with a stale spelling should show the list, not an error page.
     */
    mockSearch = 'type=wholesaler&tag=Camp+Area';
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
    tagService.listTags.mockResolvedValue([{ ...CAMP, partyCount: 34 }]);

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    await waitFor(() => {
      expect(partyService.listParties).toHaveBeenLastCalledWith(
        expect.objectContaining({ tag: 'Camp Area', type: '' }),
        expect.anything()
      );
    });
  });

  it('writes a filter the merchant applied back into the address bar', async () => {
    /**
     * Reading without writing would give a link that works once and an address
     * bar that lies for the rest of the session — the merchant taps two chips,
     * copies the URL and sends somebody the unfiltered list.
     *
     * `replace`, not `push`: a chip tap refines the screen they are on, and
     * pushing would make Back walk them through every chip they tried.
     */
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
    tagService.listTags.mockResolvedValue([{ ...CAMP, partyCount: 34 }]);
    const user = userEvent.setup();

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    await user.click(await screen.findByRole('combobox', { name: 'Tag' }));
    await user.click(await screen.findByRole('option', { name: 'Camp Area' }));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenLastCalledWith('/parties?tag=Camp+Area', { scroll: false });
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('says so plainly when a bulk change changed nothing', async () => {
    /**
     * Found in a screenshot of the finished dialog.
     *
     * `updated_count` is parties CHANGED, so adding a tag every selected party
     * already carries gives zero — correct, and it rendered as "Tagged 0
     * parties" over an empty box with an Undo button beside it. Undo of nothing
     * is a control that can only confuse, and "0" is a number standing in for a
     * sentence.
     */
    setTier('full');
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
    tagService.listTags.mockResolvedValue([{ ...ROUTE2, partyCount: 1 }]);
    tagService.bulkTagParties.mockResolvedValue({
      updatedCount: 0,
      previous: [],
      changed: [],
      skipped: [],
    });
    const user = userEvent.setup();

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    await user.click(screen.getByRole('checkbox', { name: 'Select Ramesh Traders' }));
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox', { name: 'Tags' }));
    await user.click(await screen.findByText('Route 2'));
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText('They already had those tags')).toBeInTheDocument();
    expect(
      screen.getByText('Nothing was changed, so there is nothing to undo.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('names the party it could not tag, rather than only counting it', async () => {
    /**
     * "3 were skipped" over three identical fragments reading "already carries
     * 10 tags" tells a merchant that something is wrong and not which party —
     * and a party at the ceiling is exactly the one they can fix, by opening it
     * and taking a tag off. The server sends the name for this reason.
     */
    setTier('full');
    partyService.listParties.mockResolvedValue(loaded([RAMESH, SUNITA]));
    tagService.listTags.mockResolvedValue([{ ...ROUTE2, partyCount: 0 }]);
    tagService.bulkTagParties.mockResolvedValue({
      updatedCount: 1,
      previous: [],
      changed: [{ partyId: RAMESH.id, tagIds: [ROUTE2.id] }],
      skipped: [{ id: SUNITA.id, name: 'Sunita Stores', reason: 'tag_limit_reached' }],
    });
    const user = userEvent.setup();

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    await user.click(screen.getByRole('checkbox', { name: 'Select Ramesh Traders' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Sunita Stores' }));
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox', { name: 'Tags' }));
    await user.click(await screen.findByText('Route 2'));
    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText('Tagged 1 party')).toBeInTheDocument();
    expect(screen.getByText('Sunita Stores already carries 10 tags')).toBeInTheDocument();
  });
});

describe('the over-limit chip', () => {
  /**
   * PTY-06 FR-12. The chip is a way IN to a morning's work — "Over limit (7)"
   * is a list to work through, and "Over limit" on its own is a question.
   */
  beforeEach(() => {
    store.dispatch(resetPartyList());
    store.dispatch(resetPartyTags());
    jest.clearAllMocks();
    mockSearch = '';
    tagService.listTags.mockResolvedValue([]);
    setTier('cards');
  });

  const withOverLimit = (overLimit: number | null) => ({
    rows: [RAMESH],
    meta: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
    totals: null,
    overLimit,
  });

  it('does not exist in a book where nobody is over', async () => {
    /**
     * A permanently visible "Over limit (0)" is a control whose only outcome is
     * an empty list, on a screen that already has seven — and most books will
     * never have a credit limit set at all.
     */
    partyService.listParties.mockResolvedValue(withOverLimit(0));

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    expect(screen.queryByRole('button', { name: /Over limit/ })).not.toBeInTheDocument();
  });

  it('does not exist when the server did not count', async () => {
    /**
     * `null` and zero are different states — "this server does not count"
     * against "nobody is over" — and the chip treats them the same way, which
     * is right: neither is a reason to draw a control whose only outcome is a
     * list nobody asked for. This client deploys separately from its API.
     */
    partyService.listParties.mockResolvedValue(withOverLimit(null));

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    expect(screen.queryByRole('button', { name: /Over limit/ })).not.toBeInTheDocument();
  });

  it('carries the count, because the count is what decides whether to tap it', async () => {
    partyService.listParties.mockResolvedValue(withOverLimit(7));

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    expect(await screen.findByRole('button', { name: 'Over limit (7)' })).toBeInTheDocument();
  });

  it('sends the band to the server and counts as a filter', async () => {
    /**
     * Asserted on the REQUEST, for the reason `e2e/parties.mjs` exists: a chip
     * that lights up is not a chip that filters. And it must count towards
     * `activeFilterCount`, or a merchant who narrows to the over-limit list and
     * finds nobody gets the FIRST-USE empty state on a book full of parties,
     * with no Clear affordance to get back out.
     */
    partyService.listParties.mockResolvedValue(withOverLimit(7));
    const user = userEvent.setup();

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    await user.click(await screen.findByRole('button', { name: 'Over limit (7)' }));

    await waitFor(() => {
      expect(partyService.listParties).toHaveBeenLastCalledWith(
        expect.objectContaining({ credit: 'over' }),
        expect.anything()
      );
    });
    expect(screen.getByRole('button', { name: /Clear filters/ })).toBeInTheDocument();
  });

  it('stays on screen while one of its own bands is applied', async () => {
    /**
     * Prevents: tapping "Near limit" made the whole credit group DISAPPEAR.
     *
     * `overLimit` counts the FILTERED set — it rides in the same aggregate as
     * the money totals, deliberately, so that it costs nothing. Narrowing to
     * the near-limit band therefore leaves nobody over, the count comes back
     * zero, and the group's own "only when there is something to act on" rule
     * then hid the three chips the merchant had just used — including the
     * pressed one. The band stayed applied and the control that applied it was
     * gone, so there was no way to switch to "Within limit" or to come back;
     * only the generic Clear filters, which drops the other filters too.
     *
     * The rule is right for a merchant who has not narrowed anything. It is not
     * a rule about the count; it is a rule about whether this group is any use,
     * and a group that is currently filtering the list is in use by definition.
     */
    mockSearch = 'credit=near';
    partyService.listParties.mockResolvedValue(withOverLimit(0));

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    const near = await screen.findByRole('button', { name: 'Near limit' });
    expect(near).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Within limit' })).toBeInTheDocument();
    // Without a count there is nothing to put in the brackets, and "(0)" is a
    // worse answer than none: it reads as a tally of the list on screen.
    expect(screen.getByRole('button', { name: 'Over limit' })).toBeInTheDocument();
  });

  it('applies a credit band that arrived in the URL', async () => {
    /** The dashboard tile RPT-01 will link here with, and a link a merchant can
     *  send somebody. */
    mockSearch = 'credit=over';
    partyService.listParties.mockResolvedValue(withOverLimit(7));

    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    await waitFor(() => {
      expect(partyService.listParties).toHaveBeenLastCalledWith(
        expect.objectContaining({ credit: 'over' }),
        expect.anything()
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PTY-02 §9 — the ten states, one test (or pair) per state, named by the FRD.
// ─────────────────────────────────────────────────────────────────────────────

describe('PTY-02 §9 — the ten states of the party list', () => {
  /**
   * Sprint 3's exit criterion is "every one of the ten states of PTY-02 §9
   * rendered and component-tested". Several were already covered piecemeal
   * above, under names that said what they did rather than which state they
   * were; three were not rendered at all (the totals skeleton, the dimmed
   * refresh, the stale-cache banner) and one rendered the wrong state (the
   * Archived tab's first-use copy). This block is the index: each test is
   * named `§9 <State>` so the criterion can be checked by reading test names.
   *
   * Where the product deliberately differs from §9's wording, the test pins
   * what the product does and its docstring says where the deviation is
   * recorded — a test that asserted the FRD's words over a documented decision
   * would be a test nobody could make pass.
   */
  const API_ERROR = {
    code: 'server_error',
    message: 'Something went wrong.',
    details: {},
    requestId: 'req_7f3a91',
    status: 500,
    warnings: [],
  };

  const lastListParams = () =>
    partyService.listParties.mock.calls.at(-1)?.[0] as Record<string, unknown>;

  /** A promise the test settles by hand, for the in-flight states. */
  const deferred = <T,>() => {
    const box = {
      resolve: (_value: T): void => undefined,
      reject: (_reason: unknown): void => undefined,
    };
    const promise = new Promise<T>((resolve, reject) => {
      box.resolve = resolve;
      box.reject = reject;
    });
    return { promise, resolve: box.resolve, reject: box.reject };
  };

  const signIn = (permissions: readonly PermissionCode[]): void => {
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
        enabledModules: [],
        version: 1,
      })
    );
  };

  const WRITER: readonly PermissionCode[] = ['parties.party.read', 'parties.party.write'];

  beforeEach(() => {
    store.dispatch(resetPartyList());
    store.dispatch(resetPartyTags());
    // The filtered-empty case opens the form drawer, whose `open` is store
    // state — left open, it is a second dialog in every test after it.
    store.dispatch(resetPartyForm());
    jest.clearAllMocks();
    mockSearch = '';
    tagService.listTags.mockResolvedValue([]);
    signIn(WRITER);
    setTier('cards');
  });

  // ── Initial ────────────────────────────────────────────────────────────────

  it('§9 Initial — shimmering totals cards and eight skeleton rows, never ₹0, toolbar live', async () => {
    /**
     * Prevents: the first frame reading "You will get ₹0.00" on a book with
     * lakhs outstanding. The tiles were drawn from a page-sum of zero rows
     * while the request was in flight — the one figure the screen exists to
     * get right, wrong for a second on every cold open. And six skeleton rows
     * where §9 says eight.
     */
    partyService.listParties.mockReturnValue(new Promise(() => undefined));

    renderWithProviders(<PartyListPageContent />);

    const skeleton = screen.getByRole('status', { name: 'Loading customers' });
    expect(skeleton.children).toHaveLength(8);
    expect(screen.getAllByRole('status', { name: 'Loading totals' }).length).toBeGreaterThanOrEqual(
      2
    );
    expect(screen.queryByText('₹0.00')).not.toBeInTheDocument();
    // "Toolbar interactive immediately" — the search box is usable before data.
    const search = screen.getByLabelText('Search customers');
    expect(search).toBeEnabled();
    await userEvent.type(search, 'ra');
    expect(search).toHaveValue('ra');
  });

  // ── Loading ────────────────────────────────────────────────────────────────

  it('§9 Loading — a later load keeps the rows on screen, dimmed under a progress bar', async () => {
    /**
     * Prevents: a filter change that looked like nothing happened. The slice
     * already kept the old rows during a refresh (`refreshing`), but nothing on
     * screen said a request was in flight — on a 3G phone a merchant tapped
     * "Owes me", saw the same list for two seconds, and tapped it again, which
     * CLEARED the filter they had just applied.
     */
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
    const user = userEvent.setup();
    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');
    expect(screen.queryByTestId('ub-grid-busy')).not.toBeInTheDocument();

    const inFlight = deferred<ReturnType<typeof loaded>>();
    partyService.listParties.mockReturnValue(inFlight.promise);
    await user.click(screen.getByRole('button', { name: 'Owes me' }));

    expect(await screen.findByTestId('ub-grid-busy')).toBeInTheDocument();
    const row = screen.getByText('Ramesh Traders');
    expect(row.closest('[aria-busy="true"]')).not.toBeNull();
    // No skeleton: the rows stay readable while the new ones are fetched.
    expect(screen.queryByRole('status', { name: 'Loading customers' })).not.toBeInTheDocument();

    inFlight.resolve(loaded([RAMESH]));
    await waitFor(() => expect(screen.queryByTestId('ub-grid-busy')).not.toBeInTheDocument());
    expect(screen.getByText('Ramesh Traders').closest('[aria-busy="true"]')).toBeNull();
  });

  it('§9 Loading — a page change replaces the rows with the skeleton instead of dimming them', async () => {
    /**
     * Prevents: page 1's names sitting dimmed under a "page 2" request, which
     * reads as "these are the next twenty-five" for as long as the request
     * takes. §9 is explicit that a page change is the skeleton, not the dim.
     */
    partyService.listParties.mockResolvedValue({
      rows: [RAMESH],
      meta: { page: 1, pageSize: 25, total: 60, totalPages: 3 },
      totals: null,
    });
    const user = userEvent.setup();
    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    partyService.listParties.mockReturnValue(new Promise(() => undefined));
    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(await screen.findByRole('status', { name: 'Loading customers' })).toBeInTheDocument();
    expect(screen.queryByText('Ramesh Traders')).not.toBeInTheDocument();
    expect(lastListParams()?.page).toBe(2);
    // The totals describe the whole filtered set, which a page change does not
    // alter, so they stay rather than shimmer.
    expect(screen.queryByRole('status', { name: 'Loading totals' })).not.toBeInTheDocument();
  });

  // ── Empty (the three FR-13 variants, plus the Archived tab) ────────────────

  it('§9 Empty (first-use) — no totals tiles (EC-1), one way in, no controls for unbuilt features', async () => {
    /**
     * Prevents: a brand-new book greeted by "You will get ₹0.00 · You will
     * give ₹0.00 · 0 customers" above the empty state — EC-1's "two
     * meaningless zeroes". Also pins that FR-13's "Import from CSV" (PTY-10)
     * and "Add from contacts" (PTY-07) are NOT drawn: neither is built.
     */
    partyService.listParties.mockResolvedValue(EMPTY);

    renderWithProviders(<PartyListPageContent />);

    expect(await screen.findByText('No customers yet')).toBeInTheDocument();
    expect(screen.queryByTestId('ub-stat-grid')).not.toBeInTheDocument();
    // Header action + the empty state's own primary action.
    expect(screen.getAllByRole('button', { name: 'Add party' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /import/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /contacts/i })).not.toBeInTheDocument();
  });

  it('§9 Empty (filtered) — "Clear filters", and "Add “{q}”" with the searched name (T-PTY-02-15)', async () => {
    /**
     * Prevents: a search that found nobody leaving the merchant to retype the
     * name into a blank form — Alternate E's whole point is that the name
     * they searched for IS the party they are about to add. Asserted with a
     * WRITER signed in; without one the button is correctly absent (see the
     * Disabled state below), which is how an earlier version of this test
     * passed for the wrong reason.
     */
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
    const user = userEvent.setup();
    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    partyService.listParties.mockResolvedValue(EMPTY);
    await user.type(screen.getByLabelText('Search customers'), 'Kamla Devi');

    expect(await screen.findByText('No customers match “Kamla Devi”')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add “Kamla Devi”' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByDisplayValue('Kamla Devi')).toBeInTheDocument();
    // A filtered-empty list still has figures — they are the filtered set's.
    expect(screen.getByTestId('ub-stat-grid')).toBeInTheDocument();
  });

  it('§9 Empty (Archived tab) — says nobody is archived, not "No customers yet"', async () => {
    /**
     * Prevents the defect this block found: an empty ARCHIVED tab fell
     * through to the first-use state — a merchant with three hundred active
     * parties read "No customers yet" with an Add party button on a book full
     * of them. Adding from there would create an ACTIVE party the tab cannot
     * show. Since UAT D7 Archived counts as a filter, so the way out is the
     * same "Clear filters" every other narrowing offers — under the archived
     * wording, not "No customers match these filters".
     */
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
    const user = userEvent.setup();
    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    partyService.listParties.mockResolvedValue(EMPTY);
    await user.click(screen.getByRole('combobox', { name: 'Show' }));
    await user.click(await screen.findByRole('option', { name: 'Archived' }));

    expect(await screen.findByText('No archived customers')).toBeInTheDocument();
    expect(
      screen.getByText('Customers you archive are kept here, with their khata.')
    ).toBeInTheDocument();
    expect(screen.queryByText('No customers yet')).not.toBeInTheDocument();
    expect(screen.queryByText('No customers match these filters')).not.toBeInTheDocument();
    // Only the header's Add party remains; the empty state offers none.
    expect(screen.getAllByRole('button', { name: 'Add party' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
  });

  // ── Success ────────────────────────────────────────────────────────────────

  it('§9 Success — rows and both totals, with nothing left loading', async () => {
    /**
     * Prevents: a loaded list that still carries a skeleton, a progress bar or
     * a stale banner from an earlier state. NOT covered, and recorded as a
     * gap rather than asserted: §9's "freshly upserted row flashes
     * --accent-quiet for 2 s" — it needs a row-highlight API in `UbDataGrid`
     * (both the table and the card rendering) that does not exist yet.
     */
    partyService.listParties.mockResolvedValue(loaded([RAMESH, SUNITA]));

    renderWithProviders(<PartyListPageContent />);

    expect(await screen.findByText('Ramesh Traders')).toBeInTheDocument();
    expect(screen.getByText('Sunita Stores')).toBeInTheDocument();
    const stats = screen.getByTestId('ub-stat-grid');
    expect(within(stats).getByText('₹2,800.00')).toBeInTheDocument();
    expect(within(stats).getByText('₹900.00')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: /Loading/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('ub-grid-busy')).not.toBeInTheDocument();
    expect(screen.queryByText('Showing saved list')).not.toBeInTheDocument();
  });

  // ── Error ──────────────────────────────────────────────────────────────────

  it('§9 Error — the error state with Try again and the request id, and Try again recovers', async () => {
    /**
     * Prevents: an error state that is a dead end. The request id (R-E-4) is
     * what joins a merchant's screenshot to a server log line; Try again must
     * actually re-request and put the rows back, not just re-render.
     */
    partyService.listParties.mockRejectedValue(API_ERROR);
    const user = userEvent.setup();
    renderWithProviders(<PartyListPageContent />);

    expect(await screen.findByText('We could not load your customers')).toBeInTheDocument();
    // Labelled, not a bare id (QA B5): the merchant has to know it is the
    // thing to quote.
    expect(screen.getByTestId('request-id')).toHaveTextContent('Reference req_7f3a91');
    // No figures without an answer: not "You will get ₹0.00" over a failure.
    expect(screen.queryByTestId('ub-stat-grid')).not.toBeInTheDocument();

    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Ramesh Traders')).toBeInTheDocument();
    expect(screen.queryByText('We could not load your customers')).not.toBeInTheDocument();
  });

  it('§9 Error (stale-cache variant) — a failed refresh keeps the saved rows under a banner (T-PTY-02-16)', async () => {
    /**
     * Prevents: coming back to the list on a dead connection and having every
     * row replaced by "We could not load your customers" — the rows from a
     * minute ago were in the store the whole time. FR-15: the cached rows
     * stay, with "Showing saved list · Try again".
     */
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
    const user = userEvent.setup();
    const first = renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');
    first.unmount();

    // Re-entry (back from a khata page): the slice survives, the refresh fails.
    partyService.listParties.mockRejectedValue(API_ERROR);
    renderWithProviders(<PartyListPageContent />);

    expect(await screen.findByText('Showing saved list')).toBeInTheDocument();
    expect(
      screen.getByText('We could not refresh it, so balances may be out of date.')
    ).toBeInTheDocument();
    expect(screen.getByText('Ramesh Traders')).toBeInTheDocument();
    expect(screen.queryByText('We could not load your customers')).not.toBeInTheDocument();
    // The saved rows' own totals stay with them.
    expect(within(screen.getByTestId('ub-stat-grid')).getByText('₹2,800.00')).toBeInTheDocument();

    partyService.listParties.mockResolvedValue(loaded([SUNITA]));
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Sunita Stores')).toBeInTheDocument();
    expect(screen.queryByText('Showing saved list')).not.toBeInTheDocument();
  });

  it('§9 Error — a failure for a DIFFERENT query shows the error, never the old rows', async () => {
    /**
     * Prevents the stale-cache variant from lying. Rows fetched for "all
     * parties" shown under a pressed "Settled" chip would tell the merchant
     * that Ramesh, who owes ₹2,800, is settled. The saved list is only ever
     * the answer to the query that failed.
     */
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
    const user = userEvent.setup();
    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    partyService.listParties.mockRejectedValue(API_ERROR);
    await user.click(screen.getByRole('button', { name: 'Settled' }));

    expect(await screen.findByText('We could not load your customers')).toBeInTheDocument();
    expect(screen.queryByText('Ramesh Traders')).not.toBeInTheDocument();
    expect(screen.queryByText('Showing saved list')).not.toBeInTheDocument();
    // Nor the old query's totals: ₹2,800 under a pressed "Settled" is the same lie.
    expect(screen.queryByText('₹2,800.00')).not.toBeInTheDocument();
  });

  // ── Disabled ───────────────────────────────────────────────────────────────

  it('§9 Disabled — an accountant reads every row; the write controls are absent, not disabled', async () => {
    /**
     * Prevents: a read-only role shown controls that 403 (§19.7.5 — hidden,
     * not disabled). §9's "⋯ menu contains only View and Export" has no
     * counterpart yet: the row ⋯ menu (FR-10) and Export CSV (FR-12) are not
     * built, so nothing is drawn for either — the row itself is "View".
     */
    /* The accountant preset: every `.read` codename and the two export
       codenames, no `.write` (apps/parties/permissions.py). FRD §12's
       `parties.party.export` is not a codename in this product — there is no
       party-list export to gate. */
    signIn([
      'parties.party.read',
      'ledger.entry.read',
      'ledger.statement.export',
      'reports.basic.read',
      'reports.export',
    ]);
    setTier('full');
    partyService.listParties.mockResolvedValue(loaded([RAMESH, SUNITA]));
    const user = userEvent.setup();
    renderWithProviders(<PartyListPageContent />);

    expect(await screen.findByText('Ramesh Traders')).toBeInTheDocument();
    expect(screen.getByText('Sunita Stores')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add party' })).not.toBeInTheDocument();
    // Reading is what the role is for: the row opens the khata.
    expect(screen.getByRole('button', { name: 'Open Ramesh Traders' })).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Select Ramesh Traders' }));
    const bar = await screen.findByTestId('ub-grid-toolbar');
    expect(within(bar).queryByRole('button', { name: 'Add tag' })).not.toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Clear selection' })).toBeInTheDocument();

    // And a search that finds nobody offers to clear it, never to add. (The
    // selection bar replaces the search box while rows are ticked.)
    await user.click(within(bar).getByRole('button', { name: 'Clear selection' }));
    partyService.listParties.mockResolvedValue(EMPTY);
    await user.type(screen.getByLabelText('Search customers'), 'zzz');
    expect(await screen.findByText('No customers match “zzz”')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add “zzz”' })).not.toBeInTheDocument();
  });

  // ── Partial ────────────────────────────────────────────────────────────────

  it('§9 Partial — a partial result is PAGED: the footer says where you are and fetches the next page', async () => {
    /**
     * Prevents: a list that silently shows only its first page. §9 describes
     * Partial as mobile infinite scroll (a footer spinner, and "Refine your
     * search" at a 500-row cap); that append mode is NOT built — every tier
     * pages through `UbDataGrid`'s footer — so this pins the partial result the
     * product actually has, and the report flags the append mode as a decision
     * owed. Nothing for it is drawn (no "Load more", no cap message).
     */
    partyService.listParties.mockResolvedValue({
      rows: [RAMESH, SUNITA],
      meta: { page: 1, pageSize: 25, total: 60, totalPages: 3 },
      totals: null,
    });
    const user = userEvent.setup();
    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/refine your search/i)).not.toBeInTheDocument();

    partyService.listParties.mockResolvedValue({
      rows: [SUNITA],
      meta: { page: 2, pageSize: 25, total: 60, totalPages: 3 },
      totals: null,
    });
    await user.click(screen.getByRole('button', { name: 'Next page' }));

    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();
    expect(lastListParams()?.page).toBe(2);
  });

  // ── Processing / Completed / Failed (the bulk action) ──────────────────────

  /**
   * The three bulk states. PTY-05's DOCUMENTED DEVIATION (usePartyBulkTag.ts,
   * "Undo lives in the dialog, not in a ten-second snackbar") moves §9's
   * selection-bar spinner and completion snackbar into the bulk dialog: the
   * global snackbar carries a message and no callback, so it cannot hold Undo,
   * and a partial result needs names, not a count. These tests pin the dialog.
   */
  const openBulkTag = async (user: ReturnType<typeof userEvent.setup>) => {
    setTier('full');
    partyService.listParties.mockResolvedValue(loaded([RAMESH, SUNITA]));
    tagService.listTags.mockResolvedValue([{ ...ROUTE2, partyCount: 0 }]);
    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');
    await user.click(screen.getByRole('checkbox', { name: 'Select Ramesh Traders' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Sunita Stores' }));
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox', { name: 'Tags' }));
    await user.click(await screen.findByText('Route 2'));
    return dialog;
  };

  it('§9 Processing — while the bulk tag is in flight it says so, cannot be dismissed, and the rows stay', async () => {
    /**
     * Prevents: a second press of Apply sending the same bulk change twice, or
     * a dismissal mid-request leaving the merchant unsure whether it applied.
     */
    const inFlight = deferred<unknown>();
    tagService.bulkTagParties.mockReturnValue(inFlight.promise);
    const user = userEvent.setup();
    const dialog = await openBulkTag(user);

    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));

    const applying = await within(dialog).findByRole('button', { name: /Applying…/ });
    expect(applying).toHaveAttribute('aria-busy', 'true');
    expect(applying).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    // "Rows are not blocked": the list behind is still the list, not a spinner.
    expect(screen.getByText('Ramesh Traders')).toBeInTheDocument();
    expect(tagService.bulkTagParties).toHaveBeenCalledTimes(1);

    inFlight.resolve({
      updatedCount: 2,
      previous: [],
      changed: [
        { partyId: RAMESH.id, tagIds: [ROUTE2.id] },
        { partyId: SUNITA.id, tagIds: [ROUTE2.id] },
      ],
      skipped: [],
    });
    expect(await screen.findByText('Tagged 2 parties')).toBeInTheDocument();
  });

  it('§9 Completed — the result says how many were tagged and offers Undo', async () => {
    /**
     * Prevents: a bulk change with no way back. PTY-05 FR-9's Undo must be on
     * the completed state — here, the dialog's report.
     */
    tagService.bulkTagParties.mockResolvedValue({
      updatedCount: 2,
      previous: [],
      changed: [
        { partyId: RAMESH.id, tagIds: [ROUTE2.id] },
        { partyId: SUNITA.id, tagIds: [ROUTE2.id] },
      ],
      skipped: [],
    });
    const user = userEvent.setup();
    const dialog = await openBulkTag(user);

    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText('Tagged 2 parties')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  it('§9 Failed — a partial failure names who was not tagged and why', async () => {
    /**
     * Prevents: "Added to 1 of 2. 1 failed." with no way to find which one —
     * §9's "See details" is the list, shown in the report itself, with the
     * party's name so the merchant can open it and fix it.
     */
    tagService.bulkTagParties.mockResolvedValue({
      updatedCount: 1,
      previous: [],
      changed: [{ partyId: RAMESH.id, tagIds: [ROUTE2.id] }],
      skipped: [{ id: SUNITA.id, name: 'Sunita Stores', reason: 'tag_limit_reached' }],
    });
    const user = userEvent.setup();
    const dialog = await openBulkTag(user);

    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText('Tagged 1 party')).toBeInTheDocument();
    expect(screen.getByText('Sunita Stores already carries 10 tags')).toBeInTheDocument();
  });
});

describe('the list comes back on its default view (UAT D7)', () => {
  const lastParams = () =>
    partyService.listParties.mock.calls.at(-1)?.[0] as Record<string, unknown>;

  beforeEach(() => {
    store.dispatch(resetPartyList());
    store.dispatch(resetPartyTags());
    jest.clearAllMocks();
    mockSearch = '';
    tagService.listTags.mockResolvedValue([]);
    setTier('cards');
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
  });

  it('lands on Active when the sidebar opens a clean /parties after Archived', async () => {
    /**
     * Prevents UAT D7: the slice outlives the screen, and the URL seed applied
     * only the axes a link NAMED — so Archived, then a khata, then the
     * sidebar's "Customers" (a clean `/parties`) brought the Archived tab back
     * and wrote `?status=archived` into the address bar again.
     */
    const user = userEvent.setup();
    const first = renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');
    await user.click(screen.getByRole('combobox', { name: 'Show' }));
    await user.click(await screen.findByRole('option', { name: 'Archived' }));
    await waitFor(() => expect(lastParams()?.status).toBe('archived'));
    first.unmount();

    mockReplace.mockClear();
    mockSearch = '';
    renderWithProviders(<PartyListPageContent />);

    await waitFor(() => expect(lastParams()?.status).toBe('active'));
    expect(screen.queryByRole('button', { name: /Clear filters/ })).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalledWith('/parties?status=archived', expect.anything());
  });

  it('keeps the filters when Back returns to the URL that carries them', async () => {
    /**
     * The other half of the decision: filters persist across navigation
     * THROUGH THE URL. Back to `/parties?status=archived` is still Archived,
     * and — because nothing changed — the page the slice was on is kept.
     */
    const user = userEvent.setup();
    const first = renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');
    await user.click(screen.getByRole('combobox', { name: 'Show' }));
    await user.click(await screen.findByRole('option', { name: 'Archived' }));
    await waitFor(() => expect(lastParams()?.status).toBe('archived'));
    first.unmount();

    mockSearch = 'status=archived';
    renderWithProviders(<PartyListPageContent />);

    await waitFor(() => expect(lastParams()?.status).toBe('archived'));
    expect(await screen.findByRole('button', { name: 'Clear filters (1)' })).toBeInTheDocument();
  });

  it('follows a clean /parties that arrives while the list is still mounted', async () => {
    /**
     * The sidebar tapped from the list itself: Next keeps the page mounted and
     * only the search params change. The writer used to see a URL that
     * disagreed with the slice and put `?status=archived` straight back.
     */
    mockSearch = 'status=archived';
    const view = renderWithProviders(<PartyListPageContent />);
    await waitFor(() => expect(lastParams()?.status).toBe('archived'));

    mockReplace.mockClear();
    mockSearch = '';
    view.rerender(<PartyListPageContent />);

    await waitFor(() => expect(lastParams()?.status).toBe('active'));
    expect(mockReplace).not.toHaveBeenCalledWith('/parties?status=archived', expect.anything());
  });
});

describe('sorting on a phone (UAT D5)', () => {
  const lastParams = () =>
    partyService.listParties.mock.calls.at(-1)?.[0] as Record<string, unknown>;

  beforeEach(() => {
    store.dispatch(resetPartyList());
    store.dispatch(resetPartyTags());
    jest.clearAllMocks();
    mockSearch = '';
    tagService.listTags.mockResolvedValue([]);
    partyService.listParties.mockResolvedValue(loaded([RAMESH, SUNITA]));
  });

  it('offers a sort control on the card layout and applies the choice server-side', async () => {
    /**
     * Prevents UAT D5: balance and name sort existed only as the desktop
     * table's column headers, so a phone — where the list is cards and there
     * are no headers — could not sort at all. The sheet writes the same
     * `ordering` the headers do, so the URL and the server agree.
     */
    setTier('cards');
    const user = userEvent.setup();
    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    await user.click(screen.getByRole('button', { name: 'Sort' }));
    const sheet = await screen.findByRole('dialog', { name: 'Sort by' });
    const group = within(sheet).getByRole('radiogroup', { name: 'Sort by' });
    // The default ordering is shown as the current choice.
    expect(within(group).getByRole('radio', { name: 'Recent activity' })).toHaveAttribute(
      'aria-checked',
      'true'
    );

    await user.click(within(group).getByRole('radio', { name: 'Balance: high to low' }));

    await waitFor(() => expect(lastParams()?.ordering).toBe('-balance'));
    await waitFor(() =>
      expect(mockReplace).toHaveBeenLastCalledWith('/parties?ordering=-balance', { scroll: false })
    );
    // One tap is the whole job: the sheet closes on the choice.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it.each([
    ['Balance: low to high', 'balance'],
    ['Name: A to Z', 'name'],
  ])('maps "%s" to ordering=%s', async (label, ordering) => {
    setTier('cards');
    const user = userEvent.setup();
    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    await user.click(screen.getByRole('button', { name: 'Sort' }));
    await user.click(await screen.findByRole('radio', { name: label }));

    await waitFor(() => expect(lastParams()?.ordering).toBe(ordering));
  });

  it('is not drawn where the table has sortable column headers', async () => {
    setTier('full');
    renderWithProviders(<PartyListPageContent />);
    await screen.findAllByText('Ramesh Traders');

    expect(screen.queryByRole('button', { name: 'Sort' })).not.toBeInTheDocument();
  });
});
