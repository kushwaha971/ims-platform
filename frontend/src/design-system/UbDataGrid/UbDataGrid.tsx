'use client';

import { useMemo, type ReactNode } from 'react';

import { MLSkeleton } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

import { visibleColumns } from './columnModel';
import { UbDataGridEmptyState, type UbDataGridEmptyStates } from './UbDataGridEmptyState';
import { UbDataGridMobileList } from './UbDataGridMobileList';
import { UbDataGridPagination } from './UbDataGridPagination';
import { UbDataGridTable } from './UbDataGridTable';
import { UbDataGridToolbar } from './UbDataGridToolbar';
import { useGridTier } from './useGridTier';

import type {
  UbColumnPriority,
  UbDataGridColumn,
  UbDataGridLabels,
  UbGridPage,
  UbGridSort,
  UbGridState,
  UbGridTier,
} from './types';

/**
 * Part 17 §17.0.2's `UbDataGrid`. **One component, one column model, three
 * renderings.**
 *
 * The approved rules it exists to enforce, so that no screen has to remember
 * them:
 *
 * | Width | Form |
 * |---|---|
 * | `< md` (768) | cards, never a table — three facts per row |
 * | `md`–`lg` | a table, priority columns only |
 * | `>= lg` (1024) | a table, every column; selection and row actions appear |
 *
 * Two of those matter more than the breakpoints:
 *
 * **Columns are chosen by the decision they support, not by what the table
 * has.** Every column declares a `priority`, and `visibleColumns` drops from
 * the lowest priority up as width shrinks. The priority list is the design. A
 * field that supports no decision on this screen does not get a low number — it
 * gets a place on the detail page.
 *
 * **No horizontal scroll on a primary list, at any width.** A row you must drag
 * sideways to read is a row you cannot scan, and scanning is the whole job. The
 * one exception the design approves — an accountant's REPORT at `lg` and up,
 * where the reader is reconciling rather than scanning — is an explicit
 * `allowHorizontalScroll` opt-in that defaults to `false`.
 *
 * What the grid does NOT own: the header total. That number is the question the
 * screen exists to answer, it must survive every width, and it must never
 * scroll away — so it belongs in the sticky `UbPageHeader` above the grid, not
 * in a toolbar that scrolls with the rows.
 */
export interface UbDataGridProps<TRow> {
  readonly rows: readonly TRow[];
  /** Built by a module-level factory and memoised (§19.9.4), never inline. */
  readonly columns: readonly UbDataGridColumn<TRow>[];
  readonly rowId: (row: TRow) => string;
  /** Plain text — the row's accessible name on a card and in a checkbox. */
  readonly rowName: (row: TRow) => string;
  readonly state: UbGridState;
  readonly labels: UbDataGridLabels;
  readonly emptyStates: UbDataGridEmptyStates;
  /** Names the table for a screen reader and the card list for its `aria-label`. */
  readonly caption: string;

  readonly page: UbGridPage;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange?: (pageSize: number) => void;
  readonly pageSizeOptions?: readonly number[];

  readonly sort?: UbGridSort | null;
  readonly onSortChange?: (sort: UbGridSort) => void;

  /** Selection and bulk actions are a `>= lg` affordance, by design. */
  readonly selectable?: boolean;
  readonly selectedIds?: readonly string[];
  readonly onSelectionChange?: (ids: readonly string[]) => void;
  readonly bulkActions?: ReactNode;

  readonly search?: ReactNode;
  readonly filters?: ReactNode;

  /** Cards only: the whole row becomes a 44 px tap target when this is given. */
  readonly onRowOpen?: (row: TRow) => void;

  /** md–lg cutoff. Columns above it are dropped there. Default 2. */
  readonly compactCutoff?: UbColumnPriority;
  /** Accountant reports at `lg`+ only. A primary list never sets it. */
  readonly allowHorizontalScroll?: boolean;
  /** Tests and the design-system gallery only. */
  readonly tier?: UbGridTier;
  readonly skeletonRows?: number;
  readonly className?: string;
}

const SkeletonRows = ({
  count,
  columns,
  label,
  isCards,
}: {
  readonly count: number;
  readonly columns: number;
  readonly label: string;
  readonly isCards: boolean;
}) => (
  // R-A-6 — a loading state is announced, not merely drawn. R-P-6 — it reserves
  // the real 60 px so the page does not jump when the rows land.
  <div role="status" aria-busy aria-label={label} className="w-full">
    {Array.from({ length: count }, (_, index) => (
      <div
        key={index}
        className="flex min-h-[60px] items-center gap-3 border-b border-border-hairline px-4 py-3 last:border-b-0"
      >
        {isCards && <MLSkeleton className="h-10 w-10 shrink-0 rounded-pill" />}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <MLSkeleton className="h-4 w-1/3" />
          {isCards && <MLSkeleton className="h-3 w-1/5" />}
        </div>
        {Array.from({ length: Math.max(columns - 1, 1) }, (_, cell) => (
          <MLSkeleton key={cell} className="h-4 w-20 shrink-0" />
        ))}
      </div>
    ))}
  </div>
);

export function UbDataGrid<TRow>({
  rows,
  columns,
  rowId,
  rowName,
  state,
  labels,
  emptyStates,
  caption,
  page,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions,
  sort,
  onSortChange,
  selectable = false,
  selectedIds,
  onSelectionChange,
  bulkActions,
  search,
  filters,
  onRowOpen,
  compactCutoff,
  allowHorizontalScroll = false,
  tier: forcedTier,
  skeletonRows = 6,
  className,
}: Readonly<UbDataGridProps<TRow>>): React.JSX.Element {
  const tier = useGridTier(forcedTier);
  const shown = useMemo(
    () => visibleColumns(columns, tier, compactCutoff),
    [columns, tier, compactCutoff]
  );

  // Selection, bulk actions and the page-size control are >= lg affordances:
  // a 360 px screen has no room for a second row of chrome above the rows the
  // merchant came to read, and a bulk action taken by thumb is a bulk mistake.
  const isFull = tier === 'full';
  const canSelect = selectable && isFull;
  const scrollX = allowHorizontalScroll && isFull;

  return (
    <div
      data-testid="ub-grid"
      data-ub-tier={tier}
      className={cn(
        'w-full min-w-0 overflow-hidden rounded-card border border-border-hairline bg-surface-card',
        className
      )}
    >
      <UbDataGridToolbar
        search={search}
        filters={filters}
        bulk={canSelect && (selectedIds?.length ?? 0) > 0 ? bulkActions : undefined}
      />

      {state === 'loading' && (
        <SkeletonRows
          count={skeletonRows}
          columns={Math.max(shown.length, 1)}
          label={labels.loading}
          isCards={tier === 'cards'}
        />
      )}

      {state !== 'loading' && state !== 'rows' && (
        <UbDataGridEmptyState state={state} copy={emptyStates} className="m-4" />
      )}

      {state === 'rows' &&
        (tier === 'cards' ? (
          <UbDataGridMobileList
            rows={rows}
            columns={shown}
            rowId={rowId}
            rowName={rowName}
            onRowOpen={onRowOpen}
            labels={labels}
            listLabel={caption}
          />
        ) : (
          <UbDataGridTable
            rows={rows}
            columns={shown}
            rowId={rowId}
            rowName={rowName}
            labels={labels}
            caption={caption}
            sort={sort}
            onSortChange={onSortChange}
            selectable={canSelect}
            selectedIds={selectedIds}
            onSelectionChange={onSelectionChange}
            allowHorizontalScroll={scrollX}
          />
        ))}

      {state === 'rows' && (
        <UbDataGridPagination
          page={page}
          tier={tier}
          labels={labels}
          pageSizeOptions={pageSizeOptions}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </div>
  );
}

UbDataGrid.displayName = 'UbDataGrid';
