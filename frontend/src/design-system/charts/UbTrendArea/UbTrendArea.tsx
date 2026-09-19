'use client';

import { memo, useCallback, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { cn } from 'src/utils/cn';
import { formatInr } from 'src/utils/money';

import {
  CHART_AREA_FILL,
  CHART_AXIS_TEXT,
  CHART_CROSSHAIR_STROKE,
  CHART_EMPHASIS_KEY,
  CHART_GRID_STROKE,
  CHART_MARKER_FILL,
  CHART_MARKER_RING,
  CHART_SERIES_STROKE,
  CHART_VALUE_TEXT,
} from '../chartPalette';
import {
  areaPath,
  formatAxisAmount,
  formatChartDate,
  formatChartDateShort,
  linePath,
  nearestPointIndex,
  niceAxisMax,
  seriesPoints,
  toPlotValue,
  type ChartPlot,
} from '../chartScale';
import { UbChartTooltip } from '../UbChartTooltip';
import { useChartWidth } from '../useChartWidth';

import type { UbTrendPoint } from '../chartTypes';

/**
 * **Collections over time — one area series, endpoint emphasised.**
 *
 * A single series over time is the one case where an area fill helps rather
 * than decorates: the wash under the line reads as "money collected", and with
 * one series there is nothing for it to occlude. Two series would make it a
 * multi-line chart, not two areas.
 *
 * The fill is the accent at ~10 % — a wash, never a saturated block — the line
 * is 2 px, and only the endpoint is labelled. A number on every point is the
 * anti-pattern; the axis, the crosshair and the table view carry the rest.
 *
 * **One axis, always.** A second y-scale (collections against, say, invoice
 * count) invents a correlation out of an arbitrary alignment, which is why
 * dual-axis charts are banned product-wide and why `chartForms.test.ts` fails
 * on one.
 */
export interface UbTrendAreaProps {
  /** Oldest first; `date` is an ISO business date, rendered dd/mm. */
  readonly points: readonly UbTrendPoint[];
  readonly labelledBy: string;
  readonly describedBy: string;
  readonly className?: string;
}

/** Gutters exist so the outermost labels have room INSIDE the viewBox. */
const GUTTER_LEFT = 64;
const GUTTER_RIGHT = 12;
const GUTTER_TOP = 22;
const GUTTER_BOTTOM = 24;
const PLOT_HEIGHT = 156;
const SVG_HEIGHT = GUTTER_TOP + PLOT_HEIGHT + GUTTER_BOTTOM;

function UbTrendAreaBase({
  points,
  labelledBy,
  describedBy,
  className,
}: Readonly<UbTrendAreaProps>) {
  const [container, width] = useChartWidth();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const model = useMemo(() => {
    const plot: ChartPlot = {
      left: GUTTER_LEFT,
      top: GUTTER_TOP,
      width: Math.max(0, width - GUTTER_LEFT - GUTTER_RIGHT),
      height: PLOT_HEIGHT,
    };
    const values = points.map((point) => toPlotValue(point.amount));
    const axisMax = niceAxisMax(Math.max(...values, 0));
    const plotted = seriesPoints(values, axisMax, plot);
    const baseline = plot.top + plot.height;
    return {
      plot,
      axisMax,
      plotted,
      baseline,
      line: linePath(plotted),
      area: areaPath(plotted, baseline),
      ticks: [axisMax, axisMax / 2, 0],
    };
  }, [points, width]);

  const handlePointerMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const index = nearestPointIndex(x, model.plotted);
      setActiveIndex(index >= 0 ? index : null);
    },
    [model.plotted]
  );

  const handleLeave = useCallback(() => setActiveIndex(null), []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<SVGSVGElement>) => {
      if (points.length === 0) return;
      const last = points.length - 1;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        setActiveIndex((current) => {
          const from = current ?? last;
          return event.key === 'ArrowRight' ? Math.min(last, from + 1) : Math.max(0, from - 1);
        });
      } else if (event.key === 'Home') {
        event.preventDefault();
        setActiveIndex(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        setActiveIndex(last);
      } else if (event.key === 'Escape') {
        setActiveIndex(null);
      }
    },
    [points.length]
  );

  const lastIndex = points.length - 1;
  const endPoint = model.plotted[lastIndex];
  const endValue = points[lastIndex];
  const active = activeIndex === null ? null : points[activeIndex];
  const activePoint = activeIndex === null ? null : model.plotted[activeIndex];

  return (
    <div ref={container} className={cn('relative w-full', className)}>
      <svg
        width={width}
        height={SVG_HEIGHT}
        viewBox={`0 0 ${width} ${SVG_HEIGHT}`}
        role="img"
        tabIndex={0}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        onPointerMove={handlePointerMove}
        onPointerLeave={handleLeave}
        onBlur={handleLeave}
        onKeyDown={handleKeyDown}
        /* `ds-caption` on the root sets the size every `<text>` inherits, so no
           tick needs an arbitrary `text-[11px]` (R-S-4). */
        className="ds-caption block w-full touch-none focus-visible:shadow-focus focus-visible:outline-none"
      >
        {/* Gridlines: solid hairlines, one step off the surface. Never dashed —
            a dashed rule reads as a threshold when it is only a grid. */}
        {model.ticks.map((tick) => {
          const y = model.baseline - (model.axisMax > 0 ? tick / model.axisMax : 0) * PLOT_HEIGHT;
          return (
            <g key={tick}>
              <line
                x1={model.plot.left}
                y1={y}
                x2={model.plot.left + model.plot.width}
                y2={y}
                strokeWidth={1}
                fill="none"
                className={CHART_GRID_STROKE}
              />
              <text
                x={model.plot.left - 8}
                y={y + 4}
                textAnchor="end"
                className={cn('ds-num', CHART_AXIS_TEXT)}
              >
                {formatAxisAmount(tick)}
              </text>
            </g>
          );
        })}

        {model.area && <path d={model.area} stroke="none" className={CHART_AREA_FILL} />}
        {model.line && (
          <path
            d={model.line}
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={CHART_SERIES_STROKE}
          />
        )}

        {/* The crosshair finds the X: the reader aims at a date, not a 2 px line. */}
        {activePoint && (
          <g>
            <line
              x1={activePoint.x}
              y1={model.plot.top}
              x2={activePoint.x}
              y2={model.baseline}
              strokeWidth={1}
              fill="none"
              className={CHART_CROSSHAIR_STROKE}
            />
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r={5}
              strokeWidth={2}
              className={cn(CHART_MARKER_FILL, CHART_MARKER_RING)}
            />
          </g>
        )}

        {/* The endpoint is the emphasis: an >= 8 px marker with a 2 px surface
            ring so it stays legible where it sits on the line, and the one
            direct label on the chart. */}
        {endPoint && endValue && (
          <g>
            <circle
              cx={endPoint.x}
              cy={endPoint.y}
              r={5}
              strokeWidth={2}
              className={cn(CHART_MARKER_FILL, CHART_MARKER_RING)}
            />
            <text
              x={model.plot.left + model.plot.width}
              y={GUTTER_TOP - 8}
              textAnchor="end"
              className={cn('ds-num font-semibold', CHART_VALUE_TEXT)}
            >
              {formatInr(endValue.amount)}
            </text>
          </g>
        )}

        {/* x ticks: the ends only. Thirty dates along a 360 px card is noise. */}
        {points[0] && (
          <text
            x={model.plot.left}
            y={SVG_HEIGHT - 6}
            textAnchor="start"
            className={cn('ds-num', CHART_AXIS_TEXT)}
          >
            {formatChartDateShort(points[0].date)}
          </text>
        )}
        {endValue && points.length > 1 && (
          <text
            x={model.plot.left + model.plot.width}
            y={SVG_HEIGHT - 6}
            textAnchor="end"
            className={cn('ds-num', CHART_AXIS_TEXT)}
          >
            {formatChartDateShort(endValue.date)}
          </text>
        )}
      </svg>

      {active && activePoint && (
        <UbChartTooltip
          label={formatChartDate(active.date)}
          value={formatInr(active.amount)}
          keyClassName={CHART_EMPHASIS_KEY}
          /* A pointer-tracked position is the one thing no class can express
             (R-S-1's dynamic-value exception); the offset keeps the box inside
             the card at either end. */
          style={{ left: `${Math.min(Math.max(activePoint.x, 64), Math.max(width - 64, 64))}px` }}
          className="absolute top-0 -translate-x-1/2"
        />
      )}

      {/* Keyboard parity: arrow keys walk the series and this announces the
          same figures the tooltip shows on hover. */}
      <p aria-live="polite" className="sr-only">
        {active ? `${formatChartDate(active.date)}, ${formatInr(active.amount)}` : ''}
      </p>
    </div>
  );
}

UbTrendAreaBase.displayName = 'UbTrendArea';
export const UbTrendArea = memo(UbTrendAreaBase);
