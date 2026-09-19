'use client';

import { memo, type CSSProperties } from 'react';

import { cn } from 'src/utils/cn';

/**
 * The hover/focus readout. An HTML/SVG chart is interactive by default, so this
 * ships with every chart in this folder rather than being an upgrade.
 *
 * Two rules from the data-viz interaction spec are built in:
 *
 *  - **Values lead, labels follow.** The number is the strong element; the
 *    series or category name is secondary. In a legend the hierarchy is the
 *    other way round, because there the reader has the number and wants the
 *    series; here they have the series and want the number.
 *  - **It enhances, it never gates.** Everything shown here is also on the
 *    chart as a direct label and in the table view, so a reader who never
 *    hovers loses nothing.
 *
 * `aria-hidden` is deliberate: the same text is already in the focused mark's
 * accessible name, and announcing it twice is worse than not at all.
 */
export interface UbChartTooltipProps {
  /** The category or date this readout is for. */
  readonly label: string;
  /** The formatted figure — already `formatInr`'d by the caller. */
  readonly value: string;
  /** Optional second line, e.g. a share of the total. */
  readonly detail?: string;
  /** A short stroke of the series colour, as a Tailwind `bg-*` class. */
  readonly keyClassName?: string;
  /**
   * A pointer-tracked position. R-S-1's first exception: a genuinely dynamic
   * numeric value that no class can express. Nothing else may be set here.
   */
  readonly style?: Pick<CSSProperties, 'left' | 'top'>;
  readonly className?: string;
}

function UbChartTooltipBase({
  label,
  value,
  detail,
  keyClassName,
  style,
  className,
}: Readonly<UbChartTooltipProps>) {
  return (
    <div
      aria-hidden
      style={style}
      className={cn(
        'pointer-events-none z-10 flex flex-col gap-0.5 rounded-control border border-border-subtle bg-surface-raised px-3 py-2 shadow-2',
        className
      )}
    >
      <div className="flex items-center gap-2">
        {/* A line key, not a filled box: at tooltip density a swatch is
            data-weight ink doing a label's job. */}
        {keyClassName && <span className={cn('h-0.5 w-3 rounded-pill', keyClassName)} />}
        <span className="ds-caption whitespace-nowrap text-text-secondary">{label}</span>
      </div>
      <span className="ds-body-medium ds-num whitespace-nowrap text-text-primary">{value}</span>
      {detail && <span className="ds-caption whitespace-nowrap text-text-tertiary">{detail}</span>}
    </div>
  );
}

UbChartTooltipBase.displayName = 'UbChartTooltip';
export const UbChartTooltip = memo(UbChartTooltipBase);
