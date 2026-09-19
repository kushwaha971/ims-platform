'use client';

import { memo, useCallback } from 'react';

import { cn } from 'src/utils/cn';

import { horizontalBarPath } from './chartScale';
import { UbChartTooltip } from './UbChartTooltip';

/**
 * One row of a horizontal bar chart, shared by `UbAgingBars` and
 * `UbRankedBars` because both forms have the same anatomy: a label, its value,
 * and one bar on a common scale.
 *
 * **Why the labels are HTML and only the mark is SVG.** SVG `<text>` neither
 * wraps nor truncates, so a long party name in the plot can only be clipped —
 * which is the anti-pattern the data-viz spec names explicitly ("a label
 * clipped by, or overflowing, its mark"). Rendering the label in HTML gives it
 * a real ellipsis, a `title` with the full string, and room to grow 25 % for
 * Hindi (R-I-7), while the bar stays a hand-written SVG path with an explicit
 * fill. Nothing is clipped and nothing overflows the viewBox, which is what
 * the rule is protecting.
 *
 * The ROW is the hit target, not the 12 px bar: 44 px minimum (R-A-3), and the
 * same readout appears on keyboard focus as on hover.
 */
export interface ChartBarRowModel {
  readonly key: string;
  /** Category or party name — truncated with a tooltip, never character-capped. */
  readonly label: string;
  /** The formatted figure, e.g. `₹1,23,456.00`. */
  readonly value: string;
  /** Second tooltip line, e.g. a share of the total. */
  readonly detail?: string;
  /** Spoken name of the mark: "0–30 days, ₹1,23,456.00". */
  readonly ariaLabel: string;
  /** Tailwind `fill-*` class — a token, never a hex (R-S-2). */
  readonly fillClass: string;
  /** The same colour as a `bg-*` class, for the tooltip's line key. */
  readonly keyClass: string;
  /** Painted length of the bar in pixels. */
  readonly length: number;
}

export interface ChartBarRowProps {
  readonly row: ChartBarRowModel;
  /** Measured plot width; the bar's scale is shared across every row. */
  readonly width: number;
  readonly active: boolean;
  readonly onActivate: (key: string | null) => void;
  readonly className?: string;
}

/** 12 px bar in a 16 px band: a 2 px surface gap above and below (never a stroke). */
const BAR_BAND_HEIGHT = 16;
const BAR_THICKNESS = 12;
const BAR_TOP = (BAR_BAND_HEIGHT - BAR_THICKNESS) / 2;

function ChartBarRowBase({
  row,
  width,
  active,
  onActivate,
  className,
}: Readonly<ChartBarRowProps>) {
  const activate = useCallback(() => onActivate(row.key), [onActivate, row.key]);
  const deactivate = useCallback(() => onActivate(null), [onActivate]);

  const d = horizontalBarPath({ x: 0, y: BAR_TOP, width: row.length, height: BAR_THICKNESS });

  return (
    <li
      tabIndex={0}
      aria-label={row.ariaLabel}
      onPointerEnter={activate}
      onPointerLeave={deactivate}
      onFocus={activate}
      onBlur={deactivate}
      className={cn(
        'relative flex min-h-[44px] flex-col justify-center gap-1 rounded-control px-2 py-2',
        'transition-colors duration-fast ease-standard motion-reduce:transition-none',
        'hover:bg-surface-hover focus-visible:shadow-focus focus-visible:outline-none',
        className
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="ds-body-sm min-w-0 truncate text-text-secondary" title={row.label}>
          {row.label}
        </span>
        <span className="ds-body-sm-medium ds-num shrink-0 text-text-primary">{row.value}</span>
      </div>
      <svg
        width={width}
        height={BAR_BAND_HEIGHT}
        viewBox={`0 0 ${width} ${BAR_BAND_HEIGHT}`}
        aria-hidden
        focusable="false"
        className="block w-full"
      >
        {/* The track: one step off the surface, so a small bar still has a
            baseline to be small against. */}
        <path
          d={horizontalBarPath({ x: 0, y: BAR_TOP, width, height: BAR_THICKNESS })}
          className="fill-surface-sunken"
        />
        {d && <path d={d} className={row.fillClass} />}
      </svg>
      {active && (
        <UbChartTooltip
          label={row.label}
          value={row.value}
          {...(row.detail === undefined ? {} : { detail: row.detail })}
          keyClassName={row.keyClass}
          className="absolute -top-1 right-2 -translate-y-full"
        />
      )}
    </li>
  );
}

ChartBarRowBase.displayName = 'ChartBarRow';
export const ChartBarRow = memo(ChartBarRowBase);
