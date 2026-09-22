/**
 * Part 19 §19.2.5 — the component's own sub-barrel. `src/design-system/index.ts`
 * re-exports this line for line; features import from the top-level barrel and
 * never from a deep path (R-IM-3).
 */
export { UbDataGrid } from './UbDataGrid';
export type { UbDataGridProps } from './UbDataGrid';

export { UbDataGridEmptyState } from './UbDataGridEmptyState';
export type {
  UbDataGridEmptyCopy,
  UbDataGridEmptyStates,
  UbDataGridEmptyStateProps,
} from './UbDataGridEmptyState';

export { UbDataGridMobileList } from './UbDataGridMobileList';
export type { UbDataGridMobileListProps } from './UbDataGridMobileList';

export { UbDataGridPagination } from './UbDataGridPagination';
export type { UbDataGridPaginationProps } from './UbDataGridPagination';

/**
 * `UbDataGridTable` is deliberately NOT re-exported as a value.
 *
 * `UbDataGrid` reaches it through `next/dynamic` so that `@tanstack/react-table`
 * (13.8 KB gz / 52.0 KB raw, measured) is fetched only by a viewport that
 * renders a table. A value re-export here would restore the static edge and put
 * the engine straight back into the chunk every route shares — including
 * `/legal/terms` — because `src/design-system/index.ts` re-exports this file
 * line for line and `app/error.tsx` imports that barrel.
 *
 * Nothing outside this folder ever rendered it directly; a screen that wants a
 * table renders `UbDataGrid` and gets one at `md` and up. The TYPE is exported
 * because types are erased and cost nothing.
 */
export type { UbDataGridTableProps } from './UbDataGridTable';

export {
  UbDataGridSkeletonRows,
  UbDataGridStateRow,
  UbDataGridStateTable,
} from './UbDataGridStateTable';
export type {
  UbDataGridSkeletonRowsProps,
  UbDataGridStateRowProps,
  UbDataGridStateTableProps,
} from './UbDataGridStateTable';

/**
 * `UbDataGridColumnMenu` is NOT re-exported as a value, for the same reason
 * `UbDataGridTable` is not: it is the grid's only `@radix-ui/react-popover`
 * consumer and `UbDataGrid` reaches it through `next/dynamic`. A value export
 * here restores the static edge through `src/design-system/index.ts`, which
 * `app/error.tsx` imports, and the popover engine lands in the chunk every
 * route shares.
 */
export type { UbDataGridColumnMenuProps } from './UbDataGridColumnMenu';

export { UbDataGridToolbar } from './UbDataGridToolbar';
export type { UbDataGridToolbarProps } from './UbDataGridToolbar';

export {
  cardModel,
  cardSlotOf,
  columnWidths,
  COMPACT_PRIORITY_CUTOFF,
  dropOrder,
  fillTemplate,
  isHideable,
  MAX_CARD_META,
  visibleColumns,
} from './columnModel';

export {
  loadColumnVisibility,
  useColumnVisibility,
  visibilityStorageKey,
} from './useColumnVisibility';
export type { UbColumnVisibility, UbColumnVisibilityApi } from './useColumnVisibility';
export type { UbCardModel } from './columnModel';

export { LG_QUERY, MD_QUERY, useGridTier } from './useGridTier';

/** The guard every primary list's test shares (see the file's header). */
export { describeHorizontalOverflow, findHorizontalOverflow } from './noHorizontalOverflow';
export type { HorizontalOverflowFinding } from './noHorizontalOverflow';

export type {
  UbCardSlot,
  UbColumnAlign,
  UbColumnPriority,
  UbDataGridColumn,
  UbDataGridLabels,
  UbGridPage,
  UbGridSort,
  UbGridState,
  UbGridTier,
} from './types';
