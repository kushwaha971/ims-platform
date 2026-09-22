'use client';

import { memo, type ReactNode } from 'react';

import { MLSkeleton } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

import { columnWidths } from './columnModel';
import {
  ALIGN,
  GRID_HEAD_ROW,
  GRID_ROW,
  GRID_SCROLLER,
  GRID_SELECT_CELL,
  GRID_TABLE,
  GRID_TH,
  GRID_THEAD,
} from './tableChrome';

import type { UbDataGridColumn } from './types';

/**
 * The table, with something other than rows in it — ported from BrandHub's
 * `BrandHubDataGridSkeletonRows` / `…EmptyState` / `…ErrorState`, all three of
 * which are `<tr><td colSpan={n}>` inside the real table rather than a panel
 * drawn beside it.
 *
 * ── Why this is worth a second component ────────────────────────────────────
 * It was a `<div>` stack before, rendered INSTEAD of the table: six grey bars
 * while loading, then the table appeared. Three things were wrong with that,
 * and the third is the one that matters:
 *
 *  1. The header was not there. A merchant waiting on a list had no idea which
 *     columns were coming, and on `compact` no idea whether the column they
 *     wanted survived the width.
 *  2. The bars were evenly sized and had nothing to do with the columns, so
 *     they promised a shape the table did not deliver.
 *  3. **Every column width changed when the rows landed.** `table-fixed`
 *     distributes width across the columns it has; a div stack has none, so the
 *     skeleton's geometry and the table's geometry were unrelated and the whole
 *     grid re-laid out at the exact moment the reader started reading it. The
 *     skeleton existed to prevent that.
 *
 * ── Why it does not simply reuse `UbDataGridTable` ──────────────────────────
 * Because that file is 13.8 KB gz of `@tanstack/react-table` behind a
 * `next/dynamic` boundary (see `UbDataGrid.tsx`), and a skeleton that cannot
 * paint until a chunk arrives is not a skeleton. This one is plain markup with
 * no engine under it: it renders in the shell, on the first frame, while the
 * table chunk and the rows are still in flight. The cost is the header markup
 * existing twice, and `tableChrome.ts` is how that cost is kept from becoming a
 * drift.
 *
 * The header here is deliberately INERT — no sort buttons. A sort control
 * offered while the rows are loading fires a second request against a list the
 * reader cannot see yet, and on the empty and error states there is nothing to
 * order.
 */
export interface UbDataGridStateTableProps<TRow> {
  readonly columns: readonly UbDataGridColumn<TRow>[];
  readonly caption: string;
  /** Draws the empty checkbox column, so the body lines up with a real table. */
  readonly selectable?: boolean;
  /** `<tbody>` content: skeleton rows, or one full-span state row. */
  readonly children: ReactNode;
  readonly className?: string;
}

function UbDataGridStateTableBase<TRow>({
  columns,
  caption,
  selectable = false,
  children,
  className,
}: Readonly<UbDataGridStateTableProps<TRow>>): React.JSX.Element {
  // The same computed widths the real table uses. This is the whole point of
  // the component: identical geometry, so nothing moves when the rows land.
  const widths = columnWidths(columns);

  return (
    <div
      data-testid="ub-grid-state-table"
      className={cn(GRID_SCROLLER, 'overflow-x-hidden', className)}
    >
      <table className={cn(GRID_TABLE, 'table-fixed')}>
        <caption className="sr-only">{caption}</caption>
        <thead className={GRID_THEAD}>
          <tr className={GRID_HEAD_ROW}>
            {selectable && <th scope="col" className={GRID_SELECT_CELL} />}
            {columns.map((column, index) => (
              <th
                key={column.id}
                scope="col"
                style={widths[index] ? { width: widths[index] } : undefined}
                className={cn(GRID_TH, ALIGN[column.align ?? 'start'])}
              >
                <span className={cn(column.headerHidden && 'sr-only')}>{column.header}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

UbDataGridStateTableBase.displayName = 'UbDataGridStateTable';
export const UbDataGridStateTable = UbDataGridStateTableBase;

/**
 * BrandHub's three widths — 60% on the first column, 40% on the last, 80% in
 * between — as Tailwind fractions rather than inline `style`, because an
 * inline width is a value the design system cannot see.
 *
 * The pattern is not decoration. A skeleton of identical bars reads as a
 * progress indicator; one with a long first bar, short last bar and middles in
 * between reads as a NAME, a couple of facts and a figure, which is what is
 * actually arriving. With one column the first rule wins, as it does in
 * BrandHub.
 */
const skeletonWidth = (index: number, count: number): string => {
  if (index === 0) return 'w-3/5';
  if (index === count - 1) return 'w-2/5';
  return 'w-4/5';
};

export interface UbDataGridSkeletonRowsProps {
  readonly columnCount: number;
  readonly rowCount: number;
  readonly selectable?: boolean;
}

function UbDataGridSkeletonRowsBase({
  columnCount,
  rowCount,
  selectable = false,
}: Readonly<UbDataGridSkeletonRowsProps>): React.JSX.Element {
  const count = Math.max(columnCount, 1);
  return (
    <>
      {Array.from({ length: rowCount }, (_, row) => (
        <tr key={row} data-testid="ub-grid-skeleton-row" className={GRID_ROW}>
          {selectable && (
            <td className={GRID_SELECT_CELL}>
              <MLSkeleton className="h-4 w-4 rounded-sm" />
            </td>
          )}
          {Array.from({ length: count }, (_, cell) => (
            <td key={cell} className="px-3 py-2 align-middle">
              {/* BrandHub's bar is `h-4 rounded-md bg-muted animate-pulse`;
                  `MLSkeleton` already carries the pulse and the token fill, so
                  only the radius is restated. */}
              <MLSkeleton className={cn('h-4 rounded-md', skeletonWidth(cell, count))} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

UbDataGridSkeletonRowsBase.displayName = 'UbDataGridSkeletonRows';
export const UbDataGridSkeletonRows = memo(UbDataGridSkeletonRowsBase);

export interface UbDataGridStateRowProps {
  /** Every column plus the checkbox column, or the panel will not span. */
  readonly colSpan: number;
  readonly children: ReactNode;
}

/**
 * One row, spanning the table, holding the empty/filtered/error panel.
 *
 * BrandHub's version is `py-16` of centred text in a bare cell. This keeps
 * `UbEmptyState` — the illustrated panel with its one action and, on the error
 * variant, the request id that joins a screenshot to a log (R-E-4) — because
 * that panel is the approved design for this product and is what the `cards`
 * tier shows at the same moment. What is borrowed is the STRUCTURE: it sits
 * inside the table, under a header that stays put, instead of replacing the
 * table with a floating box that makes the columns vanish and come back.
 */
function UbDataGridStateRowBase({ colSpan, children }: Readonly<UbDataGridStateRowProps>) {
  return (
    <tr data-testid="ub-grid-state-row">
      <td colSpan={colSpan} className="p-0">
        {children}
      </td>
    </tr>
  );
}

UbDataGridStateRowBase.displayName = 'UbDataGridStateRow';
export const UbDataGridStateRow = memo(UbDataGridStateRowBase);
