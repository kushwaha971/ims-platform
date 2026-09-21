import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { describeHorizontalOverflow, findHorizontalOverflow } from './noHorizontalOverflow';
import { UbDataGrid } from './UbDataGrid';

import type { UbDataGridLabels, UbGridState, UbGridTier } from './types';
import type { UbDataGridEmptyStates } from './UbDataGridEmptyState';

/**
 * The three renderings, the priority drop, and the rule that a primary list
 * never scrolls sideways.
 *
 * The tier is passed in rather than faked through `matchMedia` because a tier
 * is a VALUE in this design — that is the reason `useGridTier` exists — and a
 * test that asserts on `hidden md:block` is asserting on a class name, which
 * is not the same thing as asserting on what the user gets.
 */
interface Row {
  readonly id: string;
  readonly name: string;
  readonly balance: string;
  readonly activity: string;
  readonly contact: string;
  readonly status: string;
}

const ROWS: readonly Row[] = [
  {
    id: 'p1',
    name: 'Ramesh Traders',
    balance: '₹2,800.00',
    activity: '3 days ago',
    contact: 'C-001 · 98765 43210',
    status: 'Active',
  },
  {
    id: 'p2',
    name: 'Sunita Stores',
    balance: '₹900.00',
    activity: 'Today',
    contact: 'C-002 · 98111 22334',
    status: 'Active',
  },
];

const COLUMNS = [
  {
    id: 'name',
    header: 'Customer',
    priority: 1 as const,
    cardSlot: 'title' as const,
    sortField: 'name',
    cell: (row: Row) => row.name,
  },
  {
    id: 'balance',
    header: 'Balance',
    priority: 1 as const,
    align: 'end' as const,
    cardSlot: 'trailing' as const,
    sortField: 'balance',
    cell: (row: Row) => row.balance,
  },
  {
    id: 'activity',
    header: 'Last entry',
    priority: 2 as const,
    cardSlot: 'meta' as const,
    sortField: 'last_activity_at',
    cell: (row: Row) => row.activity,
  },
  {
    id: 'contact',
    header: 'Contact',
    priority: 3 as const,
    cardSlot: 'meta' as const,
    cell: (row: Row) => row.contact,
  },
  {
    id: 'status',
    header: 'Status',
    priority: 4 as const,
    cardSlot: 'none' as const,
    cell: (row: Row) => row.status,
  },
];

const LABELS: UbDataGridLabels = {
  loading: 'Loading customers',
  pageOf: 'Page {page} of {pages}',
  previousPage: 'Previous page',
  nextPage: 'Next page',
  pageSize: 'Rows per page',
  selectAll: 'Select every customer on this page',
  selectRow: 'Select {name}',
  sortBy: 'Sort by {column}',
  sortedAscending: 'Sorted, smallest first',
  sortedDescending: 'Sorted, largest first',
  openRow: 'Open {name}',
};

const EMPTY: UbDataGridEmptyStates = {
  firstUse: { title: 'No customers yet', description: 'Add your first one.' },
  filtered: { title: 'Nothing matches', description: 'Clear the search.' },
  error: { title: 'We could not load this', description: 'Try again.', requestId: 'req_7f3a91' },
};

const PAGE = { page: 1, pageSize: 25, total: 2, totalPages: 1 };

const renderGrid = (
  tier: UbGridTier,
  overrides: Partial<React.ComponentProps<typeof UbDataGrid<Row>>> = {}
) =>
  render(
    <UbDataGrid<Row>
      rows={ROWS}
      columns={COLUMNS}
      rowId={(row) => row.id}
      rowName={(row) => row.name}
      state={'rows' as UbGridState}
      labels={LABELS}
      emptyStates={EMPTY}
      caption="Customers"
      page={PAGE}
      onPageChange={jest.fn()}
      tier={tier}
      {...overrides}
    />
  );

/**
 * The `md`+ rendering is behind `next/dynamic` (`UbDataGrid.tsx`) so that
 * `@tanstack/react-table` — 13.8 KB gz / 52.0 KB raw, measured — is fetched
 * only by a viewport that renders a table and never by the phone rendering
 * this product is designed around.
 *
 * That makes the table tiers ASYNCHRONOUS: the chunk resolves on a microtask,
 * and until it does the grid draws the same 60 px skeleton rows it draws while
 * data loads. So every table-tier test awaits the table once and then asserts
 * exactly what it asserted before. No assertion is weakened; the card tier,
 * which is the tier the merchant gets, stays synchronous because nothing about
 * it is lazy.
 */
const renderGridWithTable = async (
  tier: Exclude<UbGridTier, 'cards'>,
  overrides: Partial<React.ComponentProps<typeof UbDataGrid<Row>>> = {}
) => {
  const result = renderGrid(tier, overrides);
  await screen.findByRole('table');
  return result;
};

describe('the three renderings', () => {
  it('below md it is a real LIST of cards and there is no table at all', () => {
    renderGrid('cards');

    const list = screen.getByRole('list', { name: 'Customers' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // The card carries the title, the figure and its supporting facts.
    expect(screen.getByText('Ramesh Traders')).toBeInTheDocument();
    expect(screen.getByText('₹2,800.00')).toBeInTheDocument();
    expect(screen.getByText('3 days ago')).toBeInTheDocument();
  });

  it('between md and lg it is a table of the PRIORITY columns only', async () => {
    await renderGridWithTable('compact');

    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toHaveLength(3);
    expect(headers?.[0]).toContain('Customer');
    expect(headers?.[1]).toContain('Balance');
    expect(headers?.[2]).toContain('Last entry');
    // Contact and Status support no decision at this width.
    expect(screen.queryByText('C-001 · 98765 43210')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('at lg and up it is the full table, with selection', async () => {
    await renderGridWithTable('full', {
      selectable: true,
      selectedIds: [],
      onSelectionChange: jest.fn(),
    });

    expect(screen.getAllByRole('columnheader')).toHaveLength(6); // 5 + the select column
    expect(screen.getByText('C-001 · 98765 43210')).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Select every customer on this page' })
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select Ramesh Traders' })).toBeInTheDocument();
  });

  it('the card is a 44 px tap target with an accessible name when a row can be opened', async () => {
    const onRowOpen = jest.fn();
    renderGrid('cards', { onRowOpen });

    const open = screen.getByRole('button', { name: 'Open Ramesh Traders' });
    expect(open.className).toContain('min-h-[60px]');
    await userEvent.click(open);
    expect(onRowOpen).toHaveBeenCalledWith(ROWS[0]);
  });
});

describe('table semantics', () => {
  it('is a real <table> with scoped header cells and a caption', async () => {
    await renderGridWithTable('full');

    const table = screen.getByRole('table', { name: 'Customers' });
    expect(table.tagName).toBe('TABLE');
    for (const header of within(table).getAllByRole('columnheader')) {
      expect(header.tagName).toBe('TH');
      expect(header.getAttribute('scope')).toBe('col');
    }
  });

  it('puts aria-sort on the header cell and the control in a button', async () => {
    const onSortChange = jest.fn();
    await renderGridWithTable('full', {
      sort: { columnId: 'balance', direction: 'desc' },
      onSortChange,
    });

    const sorted = screen
      .getAllByRole('columnheader')
      .find((cell) => cell.textContent?.includes('Balance'));
    expect(sorted?.getAttribute('aria-sort')).toBe('descending');

    // Every other header is unsorted, not "none" — an absent value is correct.
    const name = screen
      .getAllByRole('columnheader')
      .find((cell) => cell.textContent?.includes('Customer'));
    expect(name?.getAttribute('aria-sort')).toBeNull();

    await userEvent.click(within(name as HTMLElement).getByRole('button'));
    expect(onSortChange).toHaveBeenCalledWith({ columnId: 'name', direction: 'desc' });
  });

  it('selection reports the ids it was given, by row', async () => {
    const onSelectionChange = jest.fn();
    await renderGridWithTable('full', { selectable: true, selectedIds: [], onSelectionChange });

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Sunita Stores' }));
    expect(onSelectionChange).toHaveBeenCalledWith(['p2']);

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Select every customer on this page' })
    );
    expect(onSelectionChange).toHaveBeenLastCalledWith(['p1', 'p2']);
  });
});

describe('no horizontal scroll on a primary list, at any width', () => {
  it.each<UbGridTier>(['cards', 'compact', 'full'])('holds at the %s tier', async (tier) => {
    const { container } = tier === 'cards' ? renderGrid(tier) : await renderGridWithTable(tier);
    const findings = findHorizontalOverflow(container);
    expect(describeHorizontalOverflow(findings)).toEqual([]);
  });

  it('still holds when the grid is asked for a scroller it is not allowed', async () => {
    // `allowHorizontalScroll` is an `lg`-and-up REPORT affordance. A list that
    // sets it below `lg` gets nothing, which is what keeps a well-meaning fix
    // from turning the phone rendering into a drag.
    const { container } = await renderGridWithTable('compact', { allowHorizontalScroll: true });
    expect(describeHorizontalOverflow(findHorizontalOverflow(container))).toEqual([]);
  });

  it('is the ONE opt-in: an accountant report at lg announces itself', async () => {
    const { container } = await renderGridWithTable('full', { allowHorizontalScroll: true });
    expect(describeHorizontalOverflow(findHorizontalOverflow(container))).toContain(
      'div[data-testid="ub-grid-table-scroller"] → data-ub-scroll-x="on"'
    );
  });
});

describe('the states a list has', () => {
  it('announces the skeleton rather than merely drawing it', () => {
    renderGrid('cards', { state: 'loading' });
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading customers');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it.each([
    ['empty', 'No customers yet'],
    ['filtered-empty', 'Nothing matches'],
    ['error', 'We could not load this'],
  ] as const)('renders the %s state', (state, title) => {
    renderGrid('cards', { state });
    expect(screen.getByText(title)).toBeInTheDocument();
  });

  it('carries the request id on the error state and nowhere else', () => {
    const { rerender } = renderGrid('cards', { state: 'error' });
    expect(screen.getByTestId('request-id')).toHaveTextContent('req_7f3a91');

    rerender(
      <UbDataGrid<Row>
        rows={[]}
        columns={COLUMNS}
        rowId={(row) => row.id}
        rowName={(row) => row.name}
        state="filtered-empty"
        labels={LABELS}
        emptyStates={EMPTY}
        caption="Customers"
        page={PAGE}
        onPageChange={jest.fn()}
        tier="cards"
      />
    );
    expect(screen.queryByTestId('request-id')).not.toBeInTheDocument();
  });

  it('shows the page summary at every tier and the page size only at lg', async () => {
    const { unmount } = renderGrid('cards');
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Rows per page')).not.toBeInTheDocument();
    unmount();

    await renderGridWithTable('full', {
      onPageSizeChange: jest.fn(),
      pageSizeOptions: [25, 50, 100],
    });
    expect(screen.getByLabelText('Rows per page')).toBeInTheDocument();
  });
});
