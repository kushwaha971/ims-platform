import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  describeHorizontalOverflow,
  findHorizontalOverflow,
  type UbGridTier,
} from 'src/design-system/UbDataGrid';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

import hi from 'locales/hi.json';

import { resetPartyList } from '../redux/partyListSlice';

import { PartyListPageContent } from './PartyListPageContent';

/**
 * The walking skeleton, end to end inside the client (Part 32 S0-71 / S0-73):
 * route content → hook → thunk → service → axios, with the service stubbed at
 * the module boundary (§19.13.3) — plus the approved responsive rules, asserted
 * on the real screen rather than only on the component that implements them.
 */
jest.mock('../api/partyService');

const partyService = jest.requireMock('../api/partyService') as {
  listParties: jest.Mock;
};

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
    jest.clearAllMocks();
    setTier('cards');
  });

  it('paints the skeleton first, then the first-use empty state', async () => {
    partyService.listParties.mockResolvedValue(EMPTY);

    renderWithProviders(<PartyListPageContent />);

    expect(screen.getByRole('status')).toBeInTheDocument();
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
    expect(screen.getByTestId('request-id')).toHaveTextContent('req_7f3a91');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('offers to CLEAR the search on a filtered-empty result, and says so', async () => {
    partyService.listParties.mockResolvedValue(loaded([RAMESH]));
    renderWithProviders(<PartyListPageContent />);
    await screen.findByText('Ramesh Traders');

    partyService.listParties.mockResolvedValue(EMPTY);
    await userEvent.type(screen.getByLabelText('Search customers'), 'zzz');

    expect(await screen.findByText('No customers match this search')).toBeInTheDocument();
    // CR-2026-09-19-D — the action clears the search, so the label says so.
    // It read "Try again", which is what the ERROR state's action does.
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});

describe('the header total', () => {
  beforeEach(() => {
    store.dispatch(resetPartyList());
    jest.clearAllMocks();
    partyService.listParties.mockResolvedValue(loaded([RAMESH, SUNITA]));
  });

  it.each<UbGridTier>(['cards', 'compact', 'full'])(
    'stays on the sticky header at the %s tier — it is the number the screen answers',
    async (tier) => {
      setTier(tier);
      renderWithProviders(<PartyListPageContent />);
      await screen.findByTestId('ub-grid');

      const totals = screen.getByTestId('party-list-totals');
      expect(within(totals).getByText('You will get, ₹2,800.00')).toBeInTheDocument();
      expect(within(totals).getByText('You will give, ₹900.00')).toBeInTheDocument();
      // It lives inside the header, which is `sticky top-0`.
      expect(totals.closest('header')).not.toBeNull();
    }
  );

  it('says which set the two figures describe, rather than leaving it to be guessed', async () => {
    setTier('cards');
    renderWithProviders(<PartyListPageContent />);
    await screen.findByTestId('ub-grid');
    // Sprint 0's endpoint sends no totals block, so these are the page's sum.
    expect(screen.getByText('From the 2 customers on this page')).toBeInTheDocument();
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
    expect(within(card).getByText('C-001 · +919876543210')).toBeInTheDocument();
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
    expect(await screen.findByText('1 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeInTheDocument();
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
});
