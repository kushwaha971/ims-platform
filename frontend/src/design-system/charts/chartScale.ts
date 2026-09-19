/**
 * The geometry every chart in this folder is drawn from — pure, so it is unit
 * tested rather than eyeballed, and so the components stay markup.
 *
 * ADR-021's runtime list is closed: there is no charting library and none is
 * being added. Everything here is arithmetic over a plot rectangle, and the
 * three approved forms (ordered bars, one area, ranked bars) need nothing more.
 *
 * Every path this module produces uses only `M`, `L`, `Q` and `Z`. That is not
 * a style preference: an elliptical-arc command (`A`) is the signature of a
 * pie, a donut or a gauge, all three of which are banned product-wide, so
 * excluding it makes the ban mechanically checkable (`chartForms.test.ts`).
 */

/** A point in plot pixels. */
export interface ChartPoint {
  readonly x: number;
  readonly y: number;
}

/** The plot rectangle inside the SVG, after the label gutters are taken out. */
export interface ChartPlot {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Bars are capped, never stretched to fill the band (data-viz mark specs). */
export const CHART_BAR_THICKNESS = 12;
/** 4 px rounded data-end; the baseline end stays square. */
export const CHART_BAR_RADIUS = 4;
/** A row is the hit target, not the bar: >= 44 px is R-A-3's floor. */
export const CHART_ROW_HEIGHT = 44;
/** 2 px of SURFACE separates touching marks — never a stroke around them. */
export const CHART_SURFACE_GAP = 2;
/** The width an SVG falls back to before it has been measured (and in jsdom). */
export const CHART_FALLBACK_WIDTH = 560;

/**
 * A money string becomes a `number` here and only here, and it is NOT an
 * amount when it does: it is a pixel length. R-TS-7 bans float arithmetic on
 * money because a rounding error becomes a wrong balance; a rounding error in
 * a bar's width is a sub-pixel that nobody can see. The displayed figure is
 * always `formatInr(value)` from the original string.
 */
export const toPlotValue = (value: string): number => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Rounds an axis maximum up to a clean number so the ticks read 0 / 50,000 /
 * 1,00,000 rather than 0 / 47,318 (data-viz: "round to clean numbers").
 */
export const niceAxisMax = (max: number): number => {
  if (!Number.isFinite(max) || max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const normalised = max / magnitude;
  const step =
    normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
};

/** The painted length of a bar, clamped into the plot. */
export const barLength = (value: number, axisMax: number, plotWidth: number): number => {
  if (axisMax <= 0 || plotWidth <= 0) return 0;
  return Math.max(0, Math.min(plotWidth, (value / axisMax) * plotWidth));
};

export interface RoundedBarSpec {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius?: number;
}

/**
 * A horizontal bar with a rounded DATA end and a square BASELINE end.
 *
 * The corner is a quadratic, not an arc, for the reason in this file's header.
 * At a 4 px radius the two are indistinguishable on screen.
 */
export const horizontalBarPath = ({
  x,
  y,
  width,
  height,
  radius = CHART_BAR_RADIUS,
}: RoundedBarSpec): string => {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const r = Math.max(0, Math.min(radius, w, h / 2));
  const right = x + w;
  const bottom = y + h;
  if (w === 0 || h === 0) return '';
  return [
    `M ${x} ${y}`,
    `L ${right - r} ${y}`,
    `Q ${right} ${y} ${right} ${y + r}`,
    `L ${right} ${bottom - r}`,
    `Q ${right} ${bottom} ${right - r} ${bottom}`,
    `L ${x} ${bottom}`,
    'Z',
  ].join(' ');
};

/** `M … L …` through every point; a 2 px stroke draws it. */
export const linePath = (points: readonly ChartPoint[]): string => {
  const [first, ...rest] = points;
  if (!first) return '';
  return [`M ${first.x} ${first.y}`, ...rest.map((point) => `L ${point.x} ${point.y}`)].join(' ');
};

/** The same run of points, closed down to the baseline for the ~10 % wash. */
export const areaPath = (points: readonly ChartPoint[], baselineY: number): string => {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return '';
  return `${linePath(points)} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`;
};

/**
 * Maps a series onto the plot. `axisMax` is passed in rather than derived so a
 * chart and its table view cannot disagree about the top of the scale.
 */
export const seriesPoints = (
  values: readonly number[],
  axisMax: number,
  plot: ChartPlot
): readonly ChartPoint[] => {
  const count = values.length;
  if (count === 0) return [];
  const step = count === 1 ? 0 : plot.width / (count - 1);
  const safeMax = axisMax > 0 ? axisMax : 1;
  return values.map((value, index) => ({
    x: plot.left + (count === 1 ? plot.width / 2 : index * step),
    y: plot.top + plot.height - Math.max(0, Math.min(1, value / safeMax)) * plot.height,
  }));
};

/**
 * The crosshair snaps to the nearest X, so the reader aims at a date rather
 * than at a 2 px line (data-viz `interaction.md`).
 */
export const nearestPointIndex = (pointerX: number, points: readonly ChartPoint[]): number => {
  if (points.length === 0) return -1;
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  points.forEach((point, index) => {
    const distance = Math.abs(point.x - pointerX);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
};

/**
 * `"2026-09-19"` → `"19/09/2026"`. India writes dd/mm/yyyy, and a chart axis
 * is exactly where an ISO date would be misread as mm/dd.
 */
export const formatChartDate = (isoDate: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
};

/** `"2026-09-19"` → `"19/09"` — the axis tick, where the year is redundant. */
export const formatChartDateShort = (isoDate: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  const [, , month, day] = match;
  return `${day}/${month}`;
};

/**
 * An axis tick: Indian (2,2,3) grouping, no paise, no symbol.
 *
 * Ticks carry the values that are not directly labelled, so they must be
 * readable in a 56 px gutter — `₹1,23,456.00` is not. The currency is stated
 * once, by the card's description, not three times down the axis.
 */
const AXIS_FORMAT = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
export const formatAxisAmount = (value: number): string =>
  AXIS_FORMAT.format(Number.isFinite(value) ? value : 0);
