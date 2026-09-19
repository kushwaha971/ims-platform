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

export { UbDataGridTable } from './UbDataGridTable';
export type { UbDataGridTableProps } from './UbDataGridTable';

export { UbDataGridToolbar } from './UbDataGridToolbar';
export type { UbDataGridToolbarProps } from './UbDataGridToolbar';

export {
  cardModel,
  cardSlotOf,
  COMPACT_PRIORITY_CUTOFF,
  dropOrder,
  fillTemplate,
  MAX_CARD_META,
  visibleColumns,
} from './columnModel';
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
