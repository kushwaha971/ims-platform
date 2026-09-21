'use client';

import { useEffect, useMemo, type ReactNode } from 'react';

import dynamic from 'next/dynamic';

import { MLSkeleton } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

import { visibleColumns } from './columnModel';
import { UbDataGridEmptyState, type UbDataGridEmptyStates } from './UbDataGridEmptyState';
import { UbDataGridMobileList } from './UbDataGridMobileList';
import { UbDataGridPagination } from './UbDataGridPagination';
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
import type { UbDataGridTableProps } from './UbDataGridTable';

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
  /**
   * Announces the wait (R-A-6). `null` draws the same shape SILENTLY, which is
   * what the table-chunk fallback below wants: nothing is being fetched from
   * the server there, the rows are already in the store, and a second "loading"
   * announcement one chunk-fetch after the data one is noise rather than
   * information.
   */
  readonly label: string | null;
  readonly isCards: boolean;
}) => (
  // R-P-6 — it reserves the real 60 px so the page does not jump when the rows
  // land, announced or not.
  <div
    {...(label === null
      ? { 'aria-hidden': true }
      : { role: 'status', 'aria-busy': true, 'aria-label': label })}
    className="w-full"
  >
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

/**
 * Part 19 §19.9.2's standing rule, made true by the build rather than by
 * intention: **`@tanstack/react-table` is loaded only by routes that render a
 * TABLE.**
 *
 * `useGridTier` already stopped the table EXECUTING on a phone — below `md`
 * the tier is `cards` and this component never mounts. But a static
 * `import { UbDataGridTable }` is a build-time edge, so the engine was in the
 * module graph regardless, and Turbopack hoisted it into the chunk every route
 * shares. Measured by building a variant with the import stubbed: **13.8 KB gz
 * / 52.0 KB raw** downloaded and parsed by a merchant on `/login` and on
 * `/legal/terms` for code their device never runs.
 *
 * `ssr: false` because the server snapshot of `useGridTier` is `cards` (see
 * that file), so the table has never been part of a server render and saying so
 * keeps it out of the server bundle too.
 *
 * The `loading` fallback is the same 60 px rows the data skeleton draws, so the
 * swap costs no layout shift; `warmTableChunk` below means it is rarely seen.
 */
const UbDataGridTableLazy = dynamic(
  () => import('./UbDataGridTable').then((m) => m.UbDataGridTable),
  {
    ssr: false,
    loading: () => <SkeletonRows count={6} columns={4} label={null} isCards={false} />,
  }
  // `dynamic` erases the generic. The import is the split point; the cast
  // restores the signature the callers below are type-checked against, and
  // `UbDataGridTableProps` is a type-only import, so nothing is pulled back in.
) as <TRow>(props: UbDataGridTableProps<TRow>) => React.JSX.Element;

/**
 * §19.9.3's one reservation about splitting is that it "trades bytes for a
 * round trip, and on 3G the round trip is worse". This removes the trade: on a
 * viewport that will need the table, the chunk is requested as soon as the grid
 * mounts — in parallel with the list's own fetch — rather than when the rows
 * finally arrive. On a phone it is never requested at all.
 */
const warmTableChunk = (): void => {
  void import('./UbDataGridTable');
};

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

  const needsTable = tier !== 'cards';
  useEffect(() => {
    if (needsTable) warmTableChunk();
  }, [needsTable]);

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
          <UbDataGridTableLazy
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
