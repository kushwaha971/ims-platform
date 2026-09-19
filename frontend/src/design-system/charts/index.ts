/**
 * The chart and stat-tile layer's own barrel.
 *
 * It is SEPARATE from `src/design-system/index.ts` deliberately: three agents
 * are adding to this design system in parallel and one shared barrel is one
 * shared merge conflict. Features import from `src/design-system/charts`, which
 * is a single stable path per R-IM-3's intent. The lines to fold into the main
 * barrel when the waves land are listed in this work's report.
 *
 * What is here, and what is deliberately NOT:
 *
 *  - Three chart forms, and only three. Receivables aging (ordered bars on a
 *    sequential ramp), collections over time (one area), who owes most (ranked
 *    bars with emphasis). Everything else a ledger dashboard shows is a stat
 *    tile, a meter (`UbProgress`) or a table.
 *  - **No pie, no donut, no gauge, no dual-axis chart** — banned product-wide.
 *    A ratio against a limit is `UbProgress`; a category split is a horizontal
 *    stacked bar or a table.
 *  - No dashboard page. `/dashboard` redirects to `/parties` and RPT-01 is
 *    Sprint 11; this is the layer that will be ready when it lands.
 */

export { UbAgingBars } from './UbAgingBars';
export type { UbAgingBarsProps } from './UbAgingBars';

export { UbChartCard } from './UbChartCard';
export type { UbChartCardProps, UbChartCardTable } from './UbChartCard';

export { UbChartGrid } from './UbChartGrid';
export type { UbChartGridProps } from './UbChartGrid';

export { UbChartTable } from './UbChartTable';
export type { UbChartTableProps } from './UbChartTable';

export { UbChartTooltip } from './UbChartTooltip';
export type { UbChartTooltipProps } from './UbChartTooltip';

export { UB_RANKED_BARS_CAP, UbRankedBars } from './UbRankedBars';
export type { UbRankedBarsProps } from './UbRankedBars';

export { UbStatCard } from './UbStatCard';
export type {
  UbStatCardDelta,
  UbStatCardDeltaDirection,
  UbStatCardProps,
  UbStatCardTone,
} from './UbStatCard';

export { UbStatGrid } from './UbStatGrid';
export type { UbStatGridProps } from './UbStatGrid';

export { UbTrendArea } from './UbTrendArea';
export type { UbTrendAreaProps } from './UbTrendArea';

/** The token-backed palette, so a feature can key a legend without a hex. */
export {
  CHART_AGING_RAMP,
  CHART_EMPHASIS_FILL,
  CHART_EMPHASIS_KEY,
  CHART_RECESSIVE_FILL,
  CHART_RECESSIVE_KEY,
  CHART_RESERVED_SERIES_TOKENS,
} from './chartPalette';
export type { ChartRampStep } from './chartPalette';

export type {
  UbAgingBucket,
  UbChartA11yIds,
  UbChartTableColumn,
  UbChartTableRow,
  UbRankedParty,
  UbTrendPoint,
} from './chartTypes';
