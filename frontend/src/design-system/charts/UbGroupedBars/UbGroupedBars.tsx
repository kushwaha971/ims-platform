'use client';

import { memo, useCallback, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { cn } from 'src/utils/cn';
import { formatInr } from 'src/utils/money';

import {
  CHART_AXIS_TEXT,
  CHART_CROSSHAIR_STROKE as CHART_ZERO_STROKE,
  CHART_GRID_STROKE,
  CHART_PAIR_FILLS,
  CHART_PAIR_KEYS,
} from '../chartPalette';
import { formatAxisAmount, niceAxisMax, toPlotValue, verticalBarPath } from '../chartScale';
import { UbChartTooltip } from '../UbChartTooltip';
import { useChartWidth } from '../useChartWidth';

/**
 * **Two figures per period, side by side — columns on ONE axis.**
 *
 * The fourth chart form, added on the owner's call (6 Oct 2026: competitors'
 * dashboards lead with a sale graph). Sales against purchases and money in
 * against money out are COMPARISONS per period, which is what grouped columns
 * are for: the eye compares two heights standing on the same baseline. A line
 * per series would invite reading a slope between days that have nothing to
 * do with each other; two areas would occlude.
 *
 * At most three series (more is a table), one y scale (dual axes stay banned),
 * and the legend and the table view name every series so colour never carries
 * the meaning alone. A negative figure — a loss, or a day of more returns than
 * sales — hangs BELOW a zero line that is drawn only when one exists, so a
 * loss reads as a loss rather than as a missing bar.
 */
export interface UbGroupedBarsSeries {
  readonly key: string;
  /** Translated name, shown in the legend and the tooltip. */
  readonly label: string;
}

export interface UbGroupedBarsGroup {
  readonly key: string;
  /** The axis tick: "Mon", "06/10", "Oct". */
  readonly label: string;
  /** The tooltip's heading: "Monday 6 Oct", "October 2026". */
  readonly longLabel: string;
  /** One decimal string per series, in the series' order (R-TS-7). */
  readonly values: readonly string[];
}

export interface UbGroupedBarsProps {
  readonly series: readonly UbGroupedBarsSeries[];
  /** Oldest first. */
  readonly groups: readonly UbGroupedBarsGroup[];
  readonly labelledBy: string;
  readonly describedBy: string;
  readonly className?: string;
}

const GUTTER_LEFT = 56;
const GUTTER_RIGHT = 8;
const GUTTER_TOP = 12;
const GUTTER_BOTTOM = 24;
const PLOT_HEIGHT = 168;
const SVG_HEIGHT = GUTTER_TOP + PLOT_HEIGHT + GUTTER_BOTTOM;
/** A tick needs this much room or every other one is skipped. */
const MIN_TICK_SPACING = 34;

function UbGroupedBarsBase({
  series,
  groups,
  labelledBy,
  describedBy,
  className,
}: Readonly<UbGroupedBarsProps>) {
  const [container, width] = useChartWidth();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const shown = useMemo(() => series.slice(0, 3), [series]);

  const model = useMemo(() => {
    const plotWidth = Math.max(0, width - GUTTER_LEFT - GUTTER_RIGHT);
    const values = groups.flatMap((group) => group.values.slice(0, shown.length).map(toPlotValue));
    const axisMax = niceAxisMax(Math.max(...values, 0));
    const lowest = Math.min(...values, 0);
    const axisMin = lowest < 0 ? -niceAxisMax(-lowest) : 0;
    const span = axisMax - axisMin || 1;
    const yOf = (value: number) => GUTTER_TOP + ((axisMax - value) / span) * PLOT_HEIGHT;
    const zero = yOf(0);
    const slot = groups.length > 0 ? plotWidth / groups.length : 0;
    const inner = slot * 0.72;
    const gap = shown.length > 1 ? Math.min(2, inner * 0.08) : 0;
    const barWidth = Math.max(1, (inner - gap * (shown.length - 1)) / Math.max(shown.length, 1));
    const tickEvery = Math.max(1, Math.ceil(MIN_TICK_SPACING / Math.max(slot, 1)));
    const columns = groups.map((group, index) => {
      const left = GUTTER_LEFT + slot * index + (slot - inner) / 2;
      return {
        center: GUTTER_LEFT + slot * index + slot / 2,
        bars: shown.map((_s, seriesIndex) => {
          const value = toPlotValue(group.values[seriesIndex] ?? '0');
          const x = left + seriesIndex * (barWidth + gap);
          return value >= 0
            ? verticalBarPath({ x, y: yOf(value), width: barWidth, height: zero - yOf(value) })
            : verticalBarPath({ x, y: zero, width: barWidth, height: yOf(value) - zero }, true);
        }),
      };
    });
    const ticks = axisMin < 0 ? [axisMax, 0, axisMin] : [axisMax, axisMax / 2, 0];
    return { slot, columns, tickEvery, plotWidth, ticks, yOf, zero };
  }, [groups, shown, width]);

  const handlePointerMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (model.slot <= 0) return;
      const x = event.clientX - event.currentTarget.getBoundingClientRect().left - GUTTER_LEFT;
      const index = Math.floor(x / model.slot);
      setActiveIndex(index >= 0 && index < groups.length ? index : null);
    },
    [model.slot, groups.length]
  );
  const handleLeave = useCallback(() => setActiveIndex(null), []);
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<SVGSVGElement>) => {
      if (groups.length === 0) return;
      const last = groups.length - 1;
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
    [groups.length]
  );

  const active = activeIndex === null ? null : groups[activeIndex];
  const activeColumn = activeIndex === null ? null : model.columns[activeIndex];
  const readout = active
    ? shown.map((s, index) => `${s.label} ${formatInr(active.values[index] ?? '0')}`).join(' · ')
    : '';

  return (
    <div ref={container} className={cn('relative w-full', className)}>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1" aria-hidden>
        {shown.map((s, index) => (
          <li key={s.key} className="ds-caption flex items-center gap-1.5 text-text-secondary">
            <span className={cn('inline-block h-2.5 w-2.5 rounded-sm', CHART_PAIR_KEYS[index])} />
            {s.label}
          </li>
        ))}
      </ul>
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
        className="ds-caption block w-full touch-none focus-visible:shadow-focus focus-visible:outline-none"
      >
        {model.ticks.map((tick) => {
          const y = model.yOf(tick);
          return (
            <g key={tick}>
              <line
                x1={GUTTER_LEFT}
                y1={y}
                x2={GUTTER_LEFT + model.plotWidth}
                y2={y}
                strokeWidth={1}
                fill="none"
                className={tick === 0 ? CHART_ZERO_STROKE : CHART_GRID_STROKE}
              />
              <text
                x={GUTTER_LEFT - 8}
                y={y + 4}
                textAnchor="end"
                className={cn('ds-num', CHART_AXIS_TEXT)}
              >
                {formatAxisAmount(tick)}
              </text>
            </g>
          );
        })}

        {activeColumn && (
          <rect
            x={activeColumn.center - model.slot / 2}
            y={GUTTER_TOP}
            width={model.slot}
            height={PLOT_HEIGHT}
            className="fill-surface-sunken"
          />
        )}

        {model.columns.map((column, index) => (
          <g key={groups[index]?.key ?? index}>
            {column.bars.map((d, seriesIndex) =>
              d ? (
                <path
                  key={shown[seriesIndex]?.key}
                  d={d}
                  className={CHART_PAIR_FILLS[seriesIndex]}
                />
              ) : null
            )}
            {index % model.tickEvery === (groups.length - 1) % model.tickEvery && (
              <text
                /* The newest tick sits under the last column, which is at the
                   card's edge: anchored at its end it stays inside the SVG
                   instead of losing its last digits ("06/1"). */
                x={
                  index === groups.length - 1
                    ? Math.min(column.center + model.slot / 2, width - 1)
                    : column.center
                }
                y={SVG_HEIGHT - 6}
                textAnchor={index === groups.length - 1 ? 'end' : 'middle'}
                className={cn('ds-num', CHART_AXIS_TEXT)}
              >
                {groups[index]?.label}
              </text>
            )}
          </g>
        ))}
      </svg>

      {active && activeColumn && (
        <UbChartTooltip
          label={active.longLabel}
          value={`${shown[0]?.label ?? ''}: ${formatInr(active.values[0] ?? '0')}`}
          detail={
            shown.length > 1
              ? shown
                  .slice(1)
                  .map((item, i) => `${item.label}: ${formatInr(active.values[i + 1] ?? '0')}`)
                  .join(' · ')
              : undefined
          }
          keyClassName={CHART_PAIR_KEYS[0]}
          style={{
            left: `${Math.min(Math.max(activeColumn.center, 72), Math.max(width - 72, 72))}px`,
          }}
          className="absolute top-6 -translate-x-1/2"
        />
      )}

      <p aria-live="polite" className="sr-only">
        {active ? `${active.longLabel}, ${readout}` : ''}
      </p>
    </div>
  );
}

UbGroupedBarsBase.displayName = 'UbGroupedBars';
export const UbGroupedBars = memo(UbGroupedBarsBase);
