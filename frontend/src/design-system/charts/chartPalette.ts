/**
 * Part 23 §23.2.4 + the data-viz colour formula — every colour a chart can
 * paint, named once, as TOKEN-BACKED Tailwind classes (R-S-2: no hex outside
 * `src/styles/tokens/*.css`).
 *
 * Three rules are encoded here rather than left to the component author:
 *
 *  1. **Receivables aging is ORDINAL, not categorical.** Swapping 0–30 with
 *     90+ changes the meaning, so the buckets take a one-hue ramp and the
 *     reader sees the order in the colour. The steps are the SAME indigo ramp
 *     in both themes but NOT the same steps: light runs 300→700 (darker as the
 *     money ages, on white), dark runs 500→200 (brighter as it ages, because a
 *     sequential ramp flips its anchor on an ink canvas). Both sets were
 *     validated with the data-viz skill's `validate_palette.js --ordinal`
 *     against their own surface — light on `--surface-card` #FFFFFF, dark on
 *     `--surface-card` #1C232C — and `chartPalette.test.ts` recomputes both
 *     from the token files so this comment cannot drift.
 *
 *  2. **"Who owes most" is EMPHASIS, not categorical.** One bar in `--accent`
 *     (primary-500 light / primary-400 dark, so the emphasis clears 3:1 on both
 *     surfaces) and the rest in the de-emphasis grey `--viz-8`, which is 3.08:1
 *     on white and 5.15:1 on ink. Colouring five parties in five hues would
 *     spend the identity channel on information the bar length already carries.
 *
 *  3. **Red and green are RESERVED LEDGER SEMANTICS** (§23.2.4: `--error` is
 *     "you gave", `--success` is "you got"). No chart SERIES may wear them —
 *     a receivables bar painted red would claim to mean something it does not.
 *     `chartPalette.test.ts` scans the chart sources and fails if one appears.
 *
 * Chart TEXT never wears a series colour (data-viz `marks-and-anatomy`): axis
 * ticks, direct labels and values take `--text-*`, so they read in both themes.
 */

/** One step of an ordinal ramp, named by the tokens it resolves to. */
export interface ChartRampStep {
  /** The `--primary-*` step this paints in the light theme. */
  readonly lightToken: string;
  /** The `--primary-*` step this paints in the dark theme. */
  readonly darkToken: string;
  /** The literal Tailwind class — literal because the scanner reads source. */
  readonly fill: string;
  /** The same step as a `bg-*` class, for the tooltip's line key. */
  readonly key: string;
}

/**
 * The four receivables-aging buckets, youngest first. Light darkens as the
 * money ages; dark brightens, which is the same "older is louder" reading on
 * the opposite surface.
 */
export const CHART_AGING_RAMP: readonly ChartRampStep[] = [
  {
    lightToken: 'primary-300',
    darkToken: 'primary-500',
    fill: 'fill-primary-300 dark:fill-primary-500',
    key: 'bg-primary-300 dark:bg-primary-500',
  },
  {
    lightToken: 'primary-400',
    darkToken: 'primary-400',
    fill: 'fill-primary-400 dark:fill-primary-400',
    key: 'bg-primary-400 dark:bg-primary-400',
  },
  {
    lightToken: 'primary-500',
    darkToken: 'primary-300',
    fill: 'fill-primary-500 dark:fill-primary-300',
    key: 'bg-primary-500 dark:bg-primary-300',
  },
  {
    lightToken: 'primary-700',
    darkToken: 'primary-200',
    fill: 'fill-primary-700 dark:fill-primary-200',
    key: 'bg-primary-700 dark:bg-primary-200',
  },
];

/** The one bar the "who owes most" chart is about. `--accent` in both themes. */
export const CHART_EMPHASIS_FILL = 'fill-accent';
export const CHART_EMPHASIS_KEY = 'bg-accent';

/** Every other bar in an emphasis chart: present, readable, not competing. */
export const CHART_RECESSIVE_FILL = 'fill-viz-8';
export const CHART_RECESSIVE_KEY = 'bg-viz-8';

/** The single trend series: 2 px line, ~10 % wash, endpoint dot. */
export const CHART_SERIES_STROKE = 'stroke-accent';
export const CHART_AREA_FILL = 'fill-accent/10';
export const CHART_MARKER_FILL = 'fill-accent';
/** The 2 px ring that keeps an end-marker legible where it crosses the line. */
export const CHART_MARKER_RING = 'stroke-surface-card';

/** Chrome: hairline, solid, one step off the surface — never dashed. */
export const CHART_GRID_STROKE = 'stroke-border-hairline';
export const CHART_CROSSHAIR_STROKE = 'stroke-border-strong';

/** Chart text tones. A label never wears the series colour. */
export const CHART_AXIS_TEXT = 'fill-text-tertiary';
export const CHART_LABEL_TEXT = 'fill-text-secondary';
export const CHART_VALUE_TEXT = 'fill-text-primary';

/**
 * The ledger families a chart series may never paint in (§23.2.4). Named here
 * so the test that enforces it and the components that must obey it read the
 * same list.
 */
export const CHART_RESERVED_SERIES_TOKENS: readonly string[] = [
  'error',
  'error-bright',
  'error-dim',
  'success',
  'success-bright',
  'success-dim',
];
