'use client';

import { useCallback, useMemo } from 'react';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { MLCheckbox } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

import { columnWidths, fillTemplate } from './columnModel';
import {
  ALIGN,
  GRID_HEAD_ROW,
  GRID_ROW,
  GRID_ROW_HEIGHT,
  GRID_SCROLLER,
  GRID_SELECT_CELL,
  GRID_TABLE,
  GRID_TD,
  GRID_TH,
  GRID_THEAD,
} from './tableChrome';

import type { UbDataGridColumn, UbDataGridLabels, UbGridSort } from './types';

/**
 * The `>= md` rendering. ADR-005 makes `@tanstack/react-table` v8 the engine
 * for exactly this, and it is used for what it is good at — the row model and
 * the selection state — and for nothing else: sorting and pagination are
 * `manual`, because the server owns both (Part 22 §22.1) and a client that
 * re-sorts a page of 25 out of 4,000 is lying to the reader.
 *
 * What the markup is, and why:
 *
 *  · **A real `<table>`.** `role="table"` on a stack of divs announces the
 *    cells but loses the browser's own column/row navigation, and it is exactly
 *    the kind of thing that passes an automated audit and fails a user. The
 *    header cells are `<th scope="col">`.
 *  · **Sorting is a `<button>` inside the `<th>`,** and the `<th>` carries
 *    `aria-sort`. The state lives on the cell, per ARIA; the control is a
 *    control.
 *  · **A row is not a click target.** Opening a record is a control in the
 *    FIRST cell and a row action is a button in its own column, because a
 *    `<tr>` with an `onClick` is unreachable by keyboard and invisible to a
 *    screen reader's control list — the exact defect the card rendering avoids
 *    by being a real `<button>`.
 *
 *    That paragraph described the intent for a while before anything
 *    implemented it: `onRowOpen` reached `UbDataGridMobileList` and stopped
 *    there, so a record was openable on a phone and not on a laptop. The
 *    parties list shipped with rows that did nothing at `md` and above, and
 *    nothing failed, because every test that cared rendered the `cards` tier.
 *  · **`table-fixed` and no horizontal scroll.** The wrapper is
 *    `overflow-x-hidden` unless the caller opts in. A column that cannot fit
 *    truncates — and a column that keeps needing to truncate is a column with
 *    the wrong priority, which is a design conversation rather than a scrollbar.
 */
export interface UbDataGridTableProps<TRow> {
  readonly rows: readonly TRow[];
  readonly columns: readonly UbDataGridColumn<TRow>[];
  readonly rowId: (row: TRow) => string;
  readonly rowName: (row: TRow) => string;
  /**
   * Opens the record. The first column's cell becomes a control when this is
   * set, and stays plain text when it is not — a grid of things that are not
   * openable must not grow an affordance that goes nowhere.
   */
  readonly onRowOpen?: (row: TRow) => void;
  readonly labels: UbDataGridLabels;
  readonly caption: string;
  readonly sort?: UbGridSort | null;
  readonly onSortChange?: (sort: UbGridSort) => void;
  readonly selectable?: boolean;
  readonly selectedIds?: readonly string[];
  readonly onSelectionChange?: (ids: readonly string[]) => void;
  /**
   * Accountant REPORTS at `lg` and up, and nothing else. The reader there is
   * reconciling against a printed page rather than scanning for a name, and a
   * wide fixed-column ledger is the shape the job has. It defaults to `false`
   * and a primary list never sets it.
   */
  readonly allowHorizontalScroll?: boolean;
  /**
   * BrandHub's `maxHeight`. `'fill'` — the default — means the table grows to
   * whatever it holds and the PAGE scrolls, which is what a list wants: the
   * merchant scrolls one thing, and the pagination is where the rows end.
   *
   * A CSS length instead caps the body and scrolls it internally, with the
   * header staying put and the pagination pinned below the scroll region. That
   * is for a table inside something else — a drawer, a dialog, a two-pane
   * screen — where the page cannot scroll on the table's behalf.
   */
  readonly maxHeight?: 'fill' | string;
  /** BrandHub's `rowHeight`. 52 px, and set as a height so every row matches. */
  readonly rowHeight?: number;
  readonly className?: string;
}

function UbDataGridTableBase<TRow>({
  rows,
  columns,
  rowId,
  rowName,
  onRowOpen,
  labels,
  caption,
  sort,
  onSortChange,
  selectable = false,
  selectedIds,
  onSelectionChange,
  allowHorizontalScroll = false,
  maxHeight = 'fill',
  rowHeight = GRID_ROW_HEIGHT,
  className,
}: Readonly<UbDataGridTableProps<TRow>>): React.JSX.Element {
  const selection = useMemo<RowSelectionState>(() => {
    const state: RowSelectionState = {};
    (selectedIds ?? []).forEach((id) => {
      state[id] = true;
    });
    return state;
  }, [selectedIds]);

  const tableColumns = useMemo<ColumnDef<TRow>[]>(
    () =>
      columns.map((column) => ({
        id: column.id,
        header: column.header,
        cell: (context) => column.cell(context.row.original),
      })),
    [columns]
  );

  /**
   * `react-hooks/incompatible-library` is correct and is accepted here rather
   * than worked around: `useReactTable()` hands back functions React Compiler
   * cannot memoise, so it declines to memoise this component. That is the
   * documented cost of ADR-005's engine, and it is paid on the TABLE tiers
   * only — the `cards` rendering never mounts this file, so the phone the
   * product is built for is unaffected. Rows are memoised where it counts:
   * `columns` is a module-level factory memoised by the feature (§19.9.4).
   */
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable<TRow>({
    // `rows` is readonly by contract (R-TS-5); TanStack takes a mutable array
    // and never writes to it.
    data: rows as TRow[],
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => rowId(row),
    manualSorting: true,
    manualPagination: true,
    enableRowSelection: selectable,
    state: { rowSelection: selection },
  });

  const modelRows = table.getRowModel().rows;

  const capped = maxHeight !== 'fill';

  /**
   * Widths are an inline `style`, not a class, and that is deliberate: the
   * value is COMPUTED from the set being rendered (see `columnWidths`), and
   * Tailwind cannot emit a class it never saw in the source. It is a number
   * derived from data rather than a design decision, so no token is being
   * bypassed — the weights the numbers come from are the design decision, and
   * they live in the column model.
   */
  const widths = useMemo(() => columnWidths(columns), [columns]);

  const emit = useCallback(
    (next: RowSelectionState) => onSelectionChange?.(Object.keys(next).filter((id) => next[id])),
    [onSelectionChange]
  );

  const handleToggleAll = useCallback(
    (checked: boolean) => {
      if (!checked) {
        emit({});
        return;
      }
      const next: RowSelectionState = {};
      modelRows.forEach((row) => {
        next[row.id] = true;
      });
      emit(next);
    },
    [emit, modelRows]
  );

  const handleToggleRow = useCallback(
    (id: string) => (checked: boolean) => {
      const next: RowSelectionState = { ...selection };
      if (checked) next[id] = true;
      else delete next[id];
      emit(next);
    },
    [emit, selection]
  );

  const handleOpen = useCallback(
    (row: TRow) => () => onRowOpen?.(row),
    [onRowOpen]
  );

  const handleSort = useCallback(
    (column: UbDataGridColumn<TRow>) => () => {
      if (!column.sortField || !onSortChange) return;
      const active = sort?.columnId === column.id;
      onSortChange({
        columnId: column.id,
        direction: active && sort?.direction === 'desc' ? 'asc' : 'desc',
      });
    },
    [onSortChange, sort]
  );

  const allSelected = selectable && modelRows.length > 0 && modelRows.every((row) => row.getIsSelected());
  const someSelected = selectable && modelRows.some((row) => row.getIsSelected());

  return (
    <div
      data-testid="ub-grid-table-scroller"
      data-ub-scroll-x={allowHorizontalScroll ? 'on' : 'off'}
      data-ub-scroll-y={capped ? 'on' : 'off'}
      // `overflow-y-auto` only when a cap was asked for. Applying it always
      // would make `position: sticky` on the header resolve against THIS box
      // rather than the page, and a header that sticks to a box that never
      // scrolls is a header that never sticks.
      style={capped ? { maxHeight } : undefined}
      className={cn(
        GRID_SCROLLER,
        allowHorizontalScroll ? 'overflow-x-auto' : 'overflow-x-hidden',
        capped && 'overflow-y-auto',
        className
      )}
    >
      <table
        data-testid="ub-grid-table"
        className={cn(GRID_TABLE, allowHorizontalScroll ? 'table-auto' : 'table-fixed')}
      >
        <caption className="sr-only">{caption}</caption>
        {/* The chrome — tint, hairline, heights, paddings — is in
            `tableChrome.ts`, shared with the skeleton so the two cannot drift. */}
        <thead className={GRID_THEAD}>
          <tr className={GRID_HEAD_ROW}>
            {selectable && (
              <th scope="col" className={GRID_SELECT_CELL}>
                {/* `indeterminate` is a real state now rather than a DOM property
                    poked through a ref: the checkbox is Radix and takes
                    `checked="indeterminate"`, which draws a `Minus`. The old
                    version set `node.indeterminate = …` on a native input and
                    got whatever dash the operating system felt like drawing. */}
                <MLCheckbox
                  checked={allSelected}
                  indeterminate={someSelected && !allSelected}
                  onCheckedChange={handleToggleAll}
                  label={<span className="sr-only">{labels.selectAll}</span>}
                  className="min-h-0"
                />
              </th>
            )}
            {columns.map((column, index) => {
              const active = sort?.columnId === column.id;
              const align = ALIGN[column.align ?? 'start'];
              const width = widths[index];
              return (
                <th
                  key={column.id}
                  scope="col"
                  style={width ? { width } : undefined}
                  aria-sort={
                    active ? (sort?.direction === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                  className={cn(
                    'group',
                    GRID_TH,
                    column.sortField && onSortChange && 'cursor-pointer transition-colors',
                    align
                  )}
                >
                  {column.sortField && onSortChange ? (
                    <button
                      type="button"
                      onClick={handleSort(column)}
                      className={cn(
                        'inline-flex min-h-11 items-center gap-1 rounded-sm outline-none',
                        'hover:text-text-primary focus-visible:shadow-focus',
                        column.align === 'end' && 'flex-row-reverse'
                      )}
                    >
                      <span className={cn(column.headerHidden && 'sr-only')}>{column.header}</span>
                      {/* The glyph is decorative: `aria-sort` on the cell is the
                          state, and the button's own name says what it does. */}
                      {/* BrandHub's treatment: the ACTIVE glyph is the accent
                          colour, and the idle one is invisible until the header
                          is hovered. A column of permanently-visible sort arrows
                          is noise on every row of chrome, and the one that
                          matters — which column is sorted — was rendering in the
                          same muted grey as the seven that are not.

                          `focus-visible:opacity-100` is added on top of theirs.
                          A keyboard user tabbing across the header cannot hover,
                          and an affordance that only appears under a pointer is
                          one they never see. */}
                      {active ? (
                        sort?.direction === 'asc' ? (
                          <ArrowUp className="h-3.5 w-3.5 text-text-accent" aria-hidden />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5 text-text-accent" aria-hidden />
                        )
                      ) : (
                        <ArrowUpDown
                          className={cn(
                            'h-3.5 w-3.5 text-text-muted opacity-0 transition-opacity',
                            'group-hover:opacity-100 group-focus-within:opacity-100'
                          )}
                          aria-hidden
                        />
                      )}
                      <span className="sr-only">
                        {active
                          ? sort?.direction === 'asc'
                            ? labels.sortedAscending
                            : labels.sortedDescending
                          : fillTemplate(labels.sortBy, { column: column.header })}
                      </span>
                    </button>
                  ) : (
                    <span className={cn(column.headerHidden && 'sr-only')}>{column.header}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {modelRows.map((row) => {
            const name = rowName(row.original);
            return (
              <tr
                key={row.id}
                data-testid="ub-grid-row"
                data-row-id={row.id}
                style={{ height: rowHeight }}
                className={cn(
                  GRID_ROW,
                  // BrandHub tints a selected row `bg-primary/5`. There was no
                  // selected style at all here: with the checkbox column
                  // scrolled out of view on a wide table, or simply not looked
                  // at, a merchant had no way to see which rows a bulk action
                  // was about to apply to.
                  // BrandHub also sets `cursor-pointer` when a row is
                  // clickable. This grid has no row-click: a row is opened
                  // through a named control in its first cell, which is the
                  // accessible version of the same affordance — so the cursor
                  // changes over that control and nowhere else, which is also
                  // the honest thing for a row whose other cells do nothing.
                  row.getIsSelected() ? 'bg-accent-quiet' : 'hover:bg-surface-hover'
                )}
              >
                {selectable && (
                  <td className={cn(GRID_SELECT_CELL, 'align-middle')}>
                    <MLCheckbox
                      checked={row.getIsSelected()}
                      onCheckedChange={handleToggleRow(row.id)}
                      label={
                        <span className="sr-only">
                          {fillTemplate(labels.selectRow, { name })}
                        </span>
                      }
                      className="min-h-0"
                    />
                  </td>
                )}
                {row.getVisibleCells().map((cell, index) => {
                  const column = columns.find((entry) => entry.id === cell.column.id);
                  const content = flexRender(cell.column.columnDef.cell, cell.getContext());
                  return (
                    <td
                      key={cell.id}
                      className={cn(GRID_TD, ALIGN[column?.align ?? 'start'])}
                    >
                      {/* The first cell carries the open control, and only the
                          first: one named control per row. Wrapping every cell
                          would put eight identical "Open Ramesh Traders"
                          buttons in a screen reader's control list for one row.

                          `aria-label` rather than the cell's own text, so the
                          control announces what it DOES — matching the card
                          rendering, where the same label is the whole card's
                          name. */}
                      {index === 0 && onRowOpen ? (
                        <button
                          type="button"
                          onClick={handleOpen(row.original)}
                          aria-label={fillTemplate(labels.openRow, { name })}
                          className={cn(
                            'w-full rounded-sm text-left outline-none',
                            'hover:underline focus-visible:shadow-focus'
                          )}
                        >
                          {content}
                        </button>
                      ) : (
                        content
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

UbDataGridTableBase.displayName = 'UbDataGridTable';
export const UbDataGridTable = UbDataGridTableBase;
