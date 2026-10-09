'use client';

import { memo, type ReactNode } from 'react';

import { cn } from 'src/utils/cn';

/**
 * Part 17 §17.0.2 — the grid's toolbar: search on the left, filters beside it,
 * and whatever the screen offers as a bulk action on the right once rows are
 * selected.
 *
 * It wraps rather than scrolls. A toolbar that scrolls sideways hides its own
 * filters, and the whole approved rule for a primary list is that nothing on it
 * is reachable only by a horizontal drag.
 */
export interface UbDataGridToolbarProps {
  readonly search?: ReactNode;
  readonly filters?: ReactNode;
  /** Bulk actions; rendered only when the grid hands them down (>= lg). */
  readonly bulk?: ReactNode;
  /** The column menu. On the right, after the filters, and never on a phone —
   *  `UbDataGrid` hands it down only on a table tier. */
  readonly columns?: ReactNode;
  /** How many rows are selected. Above zero the toolbar becomes the selection
   *  bar — see the component. */
  readonly selectedCount?: number;
  /** Already translated and already counted — a `Ub*` never reaches for
   *  `react-intl`, and plural rules are the caller's `t()` to apply. */
  readonly selectionLabel?: string;
  readonly className?: string;
}

function UbDataGridToolbarBase({
  search,
  filters,
  bulk,
  columns,
  selectedCount = 0,
  selectionLabel,
  className,
}: Readonly<UbDataGridToolbarProps>) {
  const selecting = selectedCount > 0;
  /* Bulk actions are drawn only in the selection bar, so a grid that is
     merely `selectable` (no search, filters or column menu) has nothing to
     show until a row is ticked. Counting `bulk` here painted an empty 24 px
     band above the header row (QA, desktop reminders). */
  if (!selecting && !search && !filters && !columns) return null;

  /**
   * With rows selected, the toolbar BECOMES the selection bar — BrandHub swaps
   * the whole row for `bg-primary/5 px-4 py-2.5` with an accent-coloured count
   * on the left and the bulk actions on the right.
   *
   * It replaces rather than stacks, and that is the point: a bulk action is
   * about the selection, so the search and filters that produced it are the
   * wrong things to leave sitting beside a Delete button. It also tells the
   * merchant HOW MANY rows they are about to act on, which this toolbar could
   * not say at all — the count existed nowhere on screen except by counting
   * ticks.
   */
  if (selecting) {
    return (
      <div
        data-testid="ub-grid-toolbar"
        data-selecting="true"
        className={cn(
          'flex items-center justify-between gap-3 border-b border-border-hairline',
          'bg-accent-quiet px-4 py-2.5',
          className
        )}
      >
        <p className="ds-body-sm-medium text-text-accent">{selectionLabel}</p>
        {bulk && <div className="flex flex-wrap items-center gap-2">{bulk}</div>}
      </div>
    );
  }

  return (
    <div
      data-testid="ub-grid-toolbar"
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-b border-border-hairline px-4 py-3',
        className
      )}
    >
      {search && <div className="min-w-0 flex-1 basis-56">{search}</div>}
      {/* Filters and the column menu share the right-hand group, in BrandHub's
          order: what narrows the ROWS, then what narrows the COLUMNS.

          `shrink-0` and no `flex-wrap`, and both matter. The search beside it
          is `flex-1`, so without `shrink-0` this group is squeezed to the width
          of its widest child and everything else drops to a second line — which
          is what it did: the status filter sat on line one and the Columns
          button hung underneath it, half outside the card. A group of two small
          controls does not wrap; the flexible field next to it gives way
          instead, which is what `flex-1` is for.
          `max-w-full flex-wrap` is the one exception, and it only ever fires
          when the group is WIDER THAN THE CARD — three filters on a 360 px
          phone, where the Columns button is not drawn at all. Without it the
          group kept its one-line width and the last filter was painted
          outside the card, unreachable (INV-02, found by the T3 look sweep).
          A filter row marked `data-ub-filters="fill"` opts in to taking the
          whole width below `md`, so it can lay its controls out as one row of
          equal parts instead of wrapping them one per line (the item list). */}
      {(filters || columns) && (
        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2 max-md:has-[[data-ub-filters=fill]]:w-full">
          {filters}
          {columns}
        </div>
      )}
    </div>
  );
}

UbDataGridToolbarBase.displayName = 'UbDataGridToolbar';
export const UbDataGridToolbar = memo(UbDataGridToolbarBase);
