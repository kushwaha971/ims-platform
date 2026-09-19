/**
 * The shapes the three approved chart forms take. They are deliberately plain:
 * a chart in this design system is given its rows already computed, because
 * RPT-01's aging buckets, trend series and top-debtor list are the server's
 * arithmetic, not the component's (R-C-7).
 */

/** One receivables-aging bucket. The order of the array IS the age order. */
export interface UbAgingBucket {
  /** Stable key — `0_30`, `31_60`, `61_90`, `90_plus`. */
  readonly key: string;
  /** Translated bucket name, e.g. "0–30 days". Colour never carries it alone. */
  readonly label: string;
  /** Decimal string from the API (R-TS-7) — never a number. */
  readonly amount: string;
}

/** One point of the collections trend. */
export interface UbTrendPoint {
  /** ISO business date, `YYYY-MM-DD`; the axis renders it dd/mm. */
  readonly date: string;
  /** Decimal string from the API (R-TS-7). */
  readonly amount: string;
}

/** One party in the "who owes most" ranking. */
export interface UbRankedParty {
  readonly id: string;
  readonly name: string;
  /** Decimal string from the API (R-TS-7). */
  readonly amount: string;
}

/** A column of a chart's table view. */
export interface UbChartTableColumn {
  readonly key: string;
  readonly label: string;
  /** Numeric columns are right-aligned and get `ds-num`'s tabular figures. */
  readonly numeric?: boolean;
}

/** A row of a chart's table view — cells are already formatted for display. */
export interface UbChartTableRow {
  readonly key: string;
  readonly cells: readonly string[];
}

/** The ids a chart uses for its accessible name and description. */
export interface UbChartA11yIds {
  readonly labelledBy: string;
  readonly describedBy: string;
}
