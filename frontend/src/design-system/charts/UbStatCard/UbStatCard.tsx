'use client';

import { memo } from 'react';

import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';

import { MLCard, MLCardContent } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.4 — the stat tile, and the reason most of a ledger dashboard is
 * NOT charts.
 *
 * A single current value is a stat tile. A one-bar bar chart is the same number
 * with axes, a scale and a legend wrapped around it — the data-viz form
 * heuristic calls it out by name. Six of RPT-01's seven tiles are this
 * component: to collect, to pay, overdue, cash in hand, today's sales and the
 * low-stock count. Only three things on that screen earn a chart.
 *
 * Colour never carries meaning alone (R-A-2): `tone` paints the figure, and the
 * label beside it always says what the figure is. The delta carries an arrow
 * AND its baseline ("vs last month"), so a direction survives greyscale.
 *
 * The value wears `ds-metric-*`, which is tabular (§23.2.2): this product's
 * KPI tier aligns digits by house rule, and a column of tiles at 3-across is
 * exactly where that pays.
 */
export type UbStatCardTone = 'default' | 'success' | 'warning' | 'danger';
export type UbStatCardDeltaDirection = 'up' | 'down' | 'flat';

export interface UbStatCardDelta {
  /** Already formatted and signed by the caller, e.g. `+12%`. */
  readonly value: string;
  readonly direction: UbStatCardDeltaDirection;
  /** What it is a delta against — "vs last month". Never omitted. */
  readonly baseline: string;
  /**
   * Whether this direction is GOOD for this figure. Up is good for collections
   * and bad for overdue, and only the caller knows which tile it is.
   */
  readonly tone?: 'good' | 'bad' | 'neutral';
}

export interface UbStatCardProps {
  /** Sentence case, no trailing colon. */
  readonly label: string;
  /** Preformatted — `formatInr(...)` for money, a plain count otherwise. */
  readonly value: string;
  readonly delta?: UbStatCardDelta;
  readonly tone?: UbStatCardTone;
  readonly onClick?: () => void;
  readonly className?: string;
}

const TONE: Record<UbStatCardTone, string> = {
  default: 'text-text-primary',
  success: 'text-success',
  warning: 'text-warning',
  /* §23.2.4: `--error` is the LEDGER debit family — overdue, receivable, out of
     stock. Validation errors are `--form-error` and never appear on a tile. */
  danger: 'text-error',
};

const DELTA_TONE: Record<NonNullable<UbStatCardDelta['tone']>, string> = {
  good: 'text-success',
  bad: 'text-error',
  neutral: 'text-text-tertiary',
};

const DELTA_ICON = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: ArrowRight,
} as const;

function UbStatCardBase({
  label,
  value,
  delta,
  tone = 'default',
  onClick,
  className,
}: Readonly<UbStatCardProps>) {
  const DeltaIcon = delta ? DELTA_ICON[delta.direction] : null;

  const body = (
    <MLCardContent className="flex flex-col gap-1 p-4">
      <span className="ds-label text-text-tertiary">{label}</span>
      <span className={cn('ds-metric-md', TONE[tone])}>{value}</span>
      {delta && DeltaIcon && (
        <span className="flex items-center gap-1">
          <DeltaIcon aria-hidden className={cn('h-4 w-4', DELTA_TONE[delta.tone ?? 'neutral'])} />
          <span className={cn('ds-caption ds-num', DELTA_TONE[delta.tone ?? 'neutral'])}>
            {delta.value}
          </span>
          <span className="ds-caption text-text-tertiary">{delta.baseline}</span>
        </span>
      )}
    </MLCardContent>
  );

  if (!onClick) {
    return <MLCard className={cn('flex flex-col', className)}>{body}</MLCard>;
  }

  return (
    <MLCard className={cn('flex flex-col', className)}>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-[44px] flex-col rounded-card text-left transition-colors duration-fast ease-standard hover:bg-surface-hover focus-visible:shadow-focus focus-visible:outline-none motion-reduce:transition-none"
      >
        {body}
      </button>
    </MLCard>
  );
}

UbStatCardBase.displayName = 'UbStatCard';
export const UbStatCard = memo(UbStatCardBase);
