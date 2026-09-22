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
  goToPage: 'Go to page {page}',
  ofTotal: 'of {total}',
  // Resolved, not a template: the feature owns the ICU plural (see
  // `UbDataGridLabels.selectedCount`). A `'{count} selected'` fixture here is
  // what let "NaN selected" ship — it substituted cleanly in the test and
  // never went near `react-intl`.
  selectedCount: '0 selected',
  selectAll: 'Select every customer on this page',
  selectRow: 'Select {name}',
  showing: 'Showing',
  columns: 'Columns',
  showAllColumns: 'Show all columns',
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

/**
 * `noUncheckedIndexedAccess` makes every index access `T | undefined`, and a
 * `!` to silence that is a lie the compiler is entitled to believe. This is the
 * honest version: when the element really is missing, the test says which index
 * it wanted rather than failing later on `undefined` with no clue why.
 */
const at = <T,>(items: readonly T[], index: number): T => {
  const item = items[index];
  if (item === undefined) throw new Error(`expected an element at index ${index}`);
  return item;
};

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

/**
 * The pagination bar, rebuilt on BrandHub's customer layout.
 *
 * What it replaced was "Page 1 of 12" beside two chevrons: reaching page 5 was
 * four clicks and the only way to know how far along you were was to read a
 * sentence. These tests pin the two things that made it worth changing — the
 * numbers are there, and they are reachable — plus the one thing BrandHub does
 * not do, which is surviving a 360px screen.
 */
describe('UbDataGrid — pagination', () => {
  const MANY = { page: 10, pageSize: 25, total: 500, totalPages: 20 };

  it('shows page numbers with an ellipsis, and the current one is marked', async () => {
    renderGrid('full', { page: MANY });

    const current = await screen.findByRole('button', { name: 'Go to page 10' });
    expect(current).toHaveAttribute('aria-current', 'page');
    // First and last are always reachable, so a merchant on page 10 of 20 can
    // get to either end without stepping.
    expect(screen.getByRole('button', { name: 'Go to page 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to page 20' })).toBeInTheDocument();
    // …and page 4 is not on screen, which is the elision doing its job.
    expect(screen.queryByRole('button', { name: 'Go to page 4' })).not.toBeInTheDocument();
  });

  it('jumps straight to a page when its number is pressed', async () => {
    const onPageChange = jest.fn();
    renderGrid('full', { page: MANY, onPageChange });

    await userEvent.click(await screen.findByRole('button', { name: 'Go to page 20' }));

    expect(onPageChange).toHaveBeenCalledWith(20);
  });

  it('disables the step controls at each end rather than hiding them', async () => {
    // Hiding a control that will come back reads as the product removing a
    // feature; a disabled one says "you are at the start".
    renderGrid('full', { page: { page: 1, pageSize: 25, total: 500, totalPages: 20 } });
    expect(await screen.findByRole('button', { name: 'Previous page' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled();
  });

  it('drops the numbers on a phone and keeps the sentence', async () => {
    // BrandHub has no responsive handling here — twenty page numbers at 360px
    // either wrap into three rows or push the summary off the edge. The
    // sentence is the one thing that has to survive, because it is the only
    // part that says where you are.
    renderGrid('cards', { page: MANY });

    expect(screen.queryByRole('button', { name: 'Go to page 20' })).not.toBeInTheDocument();
    expect(screen.getByText('Page 10 of 20')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeInTheDocument();
  });

  it('shows no page numbers at all when there is only one page', async () => {
    // A lone "1" button that does nothing is furniture.
    renderGrid('full');
    expect(await screen.findByRole('button', { name: 'Next page' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go to page 1' })).not.toBeInTheDocument();
  });
});

/**
 * The table apparatus around the rows: selection feedback and sort state.
 *
 * Both were invisible before, and in the same way — the grid KNEW which rows
 * were selected and which column was sorted, and showed neither.
 */
describe('UbDataGrid — selection and sort state', () => {
  it('tints a selected row, so a bulk action is not aimed blind', async () => {
    // Without this a merchant reading a wide table, with the checkbox column
    // scrolled out of view, has no way to see which rows Delete is about to
    // apply to. BrandHub tints the row `bg-primary/5`.
    renderGrid('full', { selectable: true, selectedIds: [at(ROWS, 0).id] });

    const rows = await screen.findAllByTestId('ub-grid-row');
    expect(rows[0]).toHaveClass('bg-accent-quiet');
    expect(rows[1]).not.toHaveClass('bg-accent-quiet');
  });

  it('replaces the toolbar with a count once rows are selected', async () => {
    // The count existed nowhere on screen — the only way to know how many rows
    // were ticked was to count the ticks.
    renderGrid('full', {
      selectable: true,
      selectedIds: [at(ROWS, 0).id, at(ROWS, 1).id],
      search: <input aria-label="Search" />,
      bulkActions: <button type="button">Archive</button>,
      labels: { ...LABELS, selectedCount: '2 selected' },
    });

    const toolbar = await screen.findByTestId('ub-grid-toolbar');
    expect(toolbar).toHaveAttribute('data-selecting', 'true');
    expect(within(toolbar).getByText('2 selected')).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: 'Archive' })).toBeInTheDocument();
    // The search that produced the selection is not the thing to leave sitting
    // beside a destructive bulk action.
    expect(within(toolbar).queryByLabelText('Search')).not.toBeInTheDocument();
  });

  it('marks the sorted column on the cell, where a screen reader reads it', async () => {
    renderGrid('full', {
      sort: { columnId: 'name', direction: 'asc' },
      onSortChange: jest.fn(),
    });

    const header = await screen.findByRole('columnheader', { name: /Customer/ });
    expect(header).toHaveAttribute('aria-sort', 'ascending');
  });
});

/**
 * BrandHub draws the loading, empty and error states INSIDE the table — as
 * skeleton `<td>`s and as one `<td colSpan>` — rather than replacing the table
 * with a panel. These are what that buys, expressed as things a reader can
 * observe rather than as class names.
 */
describe('the states are drawn inside the table', () => {
  it('keeps the column headers up while the rows are still loading', () => {
    renderGrid('full', { state: 'loading' });

    // The header is the reader's promise of what is arriving. It used to
    // disappear for the whole fetch and come back with the rows, taking the
    // column widths with it.
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual(['Customer', 'Balance', 'Last entry', 'Contact', 'Status']);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading customers');
  });

  it('draws one skeleton cell per column, so the shape matches what lands', () => {
    renderGrid('full', { state: 'loading', skeletonRows: 3 });

    const rows = screen.getAllByTestId('ub-grid-skeleton-row');
    expect(rows).toHaveLength(3);
    // Five columns, five cells — not a row of evenly spaced bars that owes the
    // table nothing.
    expect(within(at(rows, 0)).getAllByRole('cell')).toHaveLength(5);
  });

  it("follows BrandHub's long-first, short-last bar widths", () => {
    renderGrid('full', { state: 'loading', skeletonRows: 1 });

    const cells = within(at(screen.getAllByTestId('ub-grid-skeleton-row'), 0)).getAllByRole(
      'cell'
    );
    const widths = cells.map((cell) => cell.firstElementChild?.className.match(/w-\d\/\d/)?.[0]);
    // A name, some facts, a figure — which is what is actually coming.
    expect(widths).toEqual(['w-3/5', 'w-4/5', 'w-4/5', 'w-4/5', 'w-2/5']);
  });

  it.each([
    ['empty', 'No customers yet'],
    ['filtered-empty', 'Nothing matches'],
    ['error', 'We could not load this'],
  ] as const)('puts the %s panel in ONE row that spans every column', (state, title) => {
    renderGrid('full', { state });

    const cell = within(screen.getByTestId('ub-grid-state-row')).getByRole('cell');
    expect(cell).toHaveAttribute('colspan', '5');
    expect(within(cell).getByText(title)).toBeInTheDocument();
    // And the header is still there, so "nothing matches" is read against the
    // columns it found nothing in.
    expect(screen.getAllByRole('columnheader')).toHaveLength(5);
  });

  it('counts the checkbox column in the span, or the panel stops short', () => {
    renderGrid('full', { state: 'empty', selectable: true });

    expect(within(screen.getByTestId('ub-grid-state-row')).getByRole('cell')).toHaveAttribute(
      'colspan',
      '6'
    );
  });

  it('leaves the card tier alone — there is no table there to keep a place in', () => {
    renderGrid('cards', { state: 'empty' });

    expect(screen.queryByTestId('ub-grid-state-table')).not.toBeInTheDocument();
    expect(screen.getByText('No customers yet')).toBeInTheDocument();
  });
});

describe('the column menu', () => {
  const withToolbar = {
    search: <input aria-label="Search" />,
  };

  const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByTestId('ub-grid-column-menu-trigger'));
    return screen.findByRole('listbox', { name: 'Columns' });
  };

  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('appears on a grid that already has a toolbar, and not on one that does not', async () => {
    const { unmount } = await renderGridWithTable('full', withToolbar);
    expect(await screen.findByTestId('ub-grid-column-menu-trigger')).toBeInTheDocument();
    unmount();

    // No toolbar, no menu: a grid does not grow a row of chrome for this alone.
    await renderGridWithTable('full');
    expect(screen.queryByTestId('ub-grid-column-menu-trigger')).not.toBeInTheDocument();
  });

  it('is never offered on a phone, where columns are not the model', () => {
    renderGrid('cards', withToolbar);
    expect(screen.queryByTestId('ub-grid-column-menu-trigger')).not.toBeInTheDocument();
  });

  it('switches a column off and the table loses that header', async () => {
    const user = userEvent.setup();
    await renderGridWithTable('full', withToolbar);

    const listbox = await openMenu(user);
    await user.click(within(listbox).getByRole('option', { name: /Contact/ }));

    expect(
      screen.getAllByRole('columnheader').map((cell) => cell.textContent)
    ).not.toContain('Contact');
    expect(screen.getAllByRole('columnheader')).toHaveLength(4);
  });

  it('locks the priority-1 columns on, visibly, rather than hiding the control', async () => {
    const user = userEvent.setup();
    await renderGridWithTable('full', withToolbar);

    const listbox = await openMenu(user);
    // `name` and `balance` are priority 1 — the columns this screen cannot be
    // read without. They are listed, ticked, and disabled.
    expect(within(listbox).getByRole('option', { name: /Customer/ })).toBeDisabled();
    expect(within(listbox).getByRole('option', { name: /Balance/ })).toBeDisabled();
    expect(within(listbox).getByRole('option', { name: /Contact/ })).toBeEnabled();
  });

  it('offers only what the WIDTH already allowed, so nothing can bring the scrollbar back', async () => {
    const user = userEvent.setup();
    await renderGridWithTable('compact', withToolbar);

    const listbox = await openMenu(user);
    // `compact` keeps priority <= 2. Contact (3) and Status (4) are not the
    // reader's to switch on here; the table has no room for them.
    expect(within(listbox).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Customer',
      'Balance',
      'Last entry',
    ]);
  });

  it('puts every column back', async () => {
    const user = userEvent.setup();
    await renderGridWithTable('full', withToolbar);

    const listbox = await openMenu(user);
    await user.click(within(listbox).getByRole('option', { name: /Contact/ }));
    expect(screen.getAllByRole('columnheader')).toHaveLength(4);

    await user.click(screen.getByRole('button', { name: 'Show all columns' }));
    expect(screen.getAllByRole('columnheader')).toHaveLength(5);
  });

  it('remembers the choice for the session, and only when the screen opted in', async () => {
    const user = userEvent.setup();
    const { unmount } = await renderGridWithTable('full', {
      ...withToolbar,
      storageId: 'customers',
    });

    await user.click(
      within(await openMenu(user)).getByRole('option', { name: /Contact/ })
    );
    expect(window.sessionStorage.getItem('ub-grid-columns:customers')).toBe(
      '{"contact":false}'
    );
    unmount();

    // Back on the same screen: the column is still off.
    await renderGridWithTable('full', { ...withToolbar, storageId: 'customers' });
    expect(
      screen.getAllByRole('columnheader').map((cell) => cell.textContent)
    ).not.toContain('Contact');
  });

  it('survives a stored value that is corrupt or hostile', async () => {
    window.sessionStorage.setItem(
      'ub-grid-columns:customers',
      '{"contact":"yes","status":false,"ghost":true}'
    );
    await renderGridWithTable('full', { ...withToolbar, storageId: 'customers' });

    // The non-boolean is ignored rather than trusted; the real one still
    // applies; a column that no longer exists is simply not found.
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toContain('Contact');
    expect(headers).not.toContain('Status');
  });

  it('does not remember anything when the screen did not opt in', async () => {
    const user = userEvent.setup();
    await renderGridWithTable('full', withToolbar);

    await user.click(
      within(await openMenu(user)).getByRole('option', { name: /Contact/ })
    );
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe('the paging bar', () => {
  /**
   * The page-size control is the one thing in this bar drawn at BrandHub's
   * 32 px rather than this product's 44 px, and the exemption rests entirely on
   * it never appearing on a touch screen (R-A-3 is scoped to mobile). If it
   * ever renders below `full`, the box has to go back to `h-11` — so the tier
   * is asserted rather than trusted.
   */
  it('offers the page size at `full` and at no smaller tier', async () => {
    const props = {
      onPageSizeChange: jest.fn(),
      pageSizeOptions: [25, 50, 100],
      page: { page: 1, pageSize: 25, total: 90, totalPages: 4 },
    };

    const { unmount } = await renderGridWithTable('full', props);
    expect(screen.getByLabelText('Rows per page')).toBeInTheDocument();
    unmount();

    const compact = renderGrid('compact', props);
    expect(screen.queryByLabelText('Rows per page')).not.toBeInTheDocument();
    compact.unmount();

    renderGrid('cards', props);
    expect(screen.queryByLabelText('Rows per page')).not.toBeInTheDocument();
  });

  it('paints the selection label exactly as the feature resolved it', async () => {
    // The grid must NOT substitute into this one. `selectedCount` is an ICU
    // plural, the feature has already run it through `t()` with the real
    // number, and a second pass here is how the bar came to read "NaN
    // selected" — `#` evaluated against the string "{count}".
    await renderGridWithTable('full', {
      selectable: true,
      selectedIds: [at(ROWS, 0).id],
      search: <input aria-label="Search" />,
      labels: { ...LABELS, selectedCount: '1 selected' },
    });

    const toolbar = await screen.findByTestId('ub-grid-toolbar');
    expect(within(toolbar).getByText('1 selected')).toBeInTheDocument();
    expect(within(toolbar).queryByText(/NaN|\{count\}/)).not.toBeInTheDocument();
  });
});

describe("BrandHub's height logic", () => {
  it('gives every row the same 52px, set as a height rather than a class', async () => {
    await renderGridWithTable('full');

    // BrandHub sets `style={{ height: rowHeight }}` on the `<tr>` so a screen
    // can override it; ours was `h-14` baked into the class, which no caller
    // could reach. 52 is BrandHub's default and this grid's.
    for (const row of screen.getAllByTestId('ub-grid-row')) {
      expect(row).toHaveStyle({ height: '52px' });
    }
  });

  it('reserves the same height in the skeleton, or the rows would jump', () => {
    renderGrid('full', { state: 'loading', skeletonRows: 2, rowHeight: 40 });

    for (const row of screen.getAllByTestId('ub-grid-skeleton-row')) {
      expect(row).toHaveStyle({ height: '40px' });
    }
  });

  it('lets the PAGE scroll by default, and caps the body only when asked', async () => {
    const { unmount } = await renderGridWithTable('full');
    // 'fill': no cap, no internal scroll. A header that sticks to a box which
    // never scrolls is a header that never sticks, so the box must not exist.
    expect(screen.getByTestId('ub-grid-table-scroller')).toHaveAttribute('data-ub-scroll-y', 'off');
    unmount();

    await renderGridWithTable('full', { maxHeight: '320px' });
    const scroller = screen.getByTestId('ub-grid-table-scroller');
    expect(scroller).toHaveAttribute('data-ub-scroll-y', 'on');
    expect(scroller).toHaveStyle({ maxHeight: '320px' });
  });
});
