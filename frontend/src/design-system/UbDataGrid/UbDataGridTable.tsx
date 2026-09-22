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

import { fillTemplate } from './columnModel';

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
 *  · **A row is not a click target.** Opening a record is a LINK in the name
 *    cell and a row action is a button in its own column, because a `<tr>` with
 *    an `onClick` is unreachable by keyboard and invisible to a screen reader's
 *    control list — the exact defect the card rendering avoids by being a real
 *    `<button>`.
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
  readonly className?: string;
}

const ALIGN = { start: 'text-left', end: 'text-right' } as const;

function UbDataGridTableBase<TRow>({
  rows,
  columns,
  rowId,
  rowName,
  labels,
  caption,
  sort,
  onSortChange,
  selectable = false,
  selectedIds,
  onSelectionChange,
  allowHorizontalScroll = false,
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
      className={cn(
        'w-full min-w-0',
        allowHorizontalScroll ? 'overflow-x-auto' : 'overflow-x-hidden',
        className
      )}
    >
      <table
        data-testid="ub-grid-table"
        className={cn('w-full border-collapse', allowHorizontalScroll ? 'table-auto' : 'table-fixed')}
      >
        <caption className="sr-only">{caption}</caption>
        {/* BrandHub's `TableHeader` is `bg-[#fafafa]` with a hairline under it,
            and the tint is what actually separates the head from the body — a
            header that is the same colour as the rows relies entirely on the
            font weight, which at 13px is not much. `surface-sunken` is this
            product's token for the same near-white.

            Row hover and the 56px row height are KEPT and are departures:
            BrandHub has neither a hover rule nor striping, and its rows are
            48px. Hover is how you keep your place scanning a wide table with a
            mouse, and the extra 8px is a comfortable touch row rather than a
            minimal one. */}
        <thead className="sticky top-0 z-10 bg-surface-sunken">
          <tr className="border-b border-border-hairline">
            {selectable && (
              <th scope="col" className="w-12 px-3 py-2">
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
            {columns.map((column) => {
              const active = sort?.columnId === column.id;
              const align = ALIGN[column.align ?? 'start'];
              return (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={
                    active ? (sort?.direction === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                  className={cn(
                    'ds-body-sm-medium h-12 px-3 py-2 align-middle text-text-primary',
                    align,
                    column.widthClassName
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
                      {active ? (
                        sort?.direction === 'asc' ? (
                          <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                        )
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 text-text-muted" aria-hidden />
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
                className="h-14 border-b border-border-hairline last:border-b-0 hover:bg-surface-hover"
              >
                {selectable && (
                  <td className="px-3 py-2 align-middle">
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
                {row.getVisibleCells().map((cell) => {
                  const column = columns.find((entry) => entry.id === cell.column.id);
                  return (
                    <td
                      key={cell.id}
                      className={cn(
                        'ds-body-sm truncate px-3 py-2 align-middle text-text-primary',
                        ALIGN[column?.align ?? 'start']
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
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
