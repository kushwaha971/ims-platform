'use client';

import { memo, type ReactNode } from 'react';

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
  /**
   * A small glyph beside the label — BrandHub's stat card leads with one, and
   * it is what stops a row of three cards reading as three paragraphs of grey
   * text. Decorative: the label says what the figure is, so the icon is
   * `aria-hidden` and never the only thing carrying the meaning (R-A-2).
   */
  readonly icon?: ReactNode;
  /** Sentence case, no trailing colon. */
  readonly label: string;
  /** Preformatted — `formatInr(...)` for money, a plain count otherwise. */
  readonly value: string;
  /**
   * The qualifier that sits on the value's baseline — "across all 30
   * customers", "incl. VAT". BrandHub's `subtext`.
   *
   * It exists because a figure without its SCOPE is a figure a merchant cannot
   * act on: ₹36,018 to collect means one thing across the whole book and
   * another across the twenty-five names on this page.
   */
  readonly subtext?: string;
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
  icon,
  label,
  value,
  subtext,
  delta,
  tone = 'default',
  onClick,
  className,
}: Readonly<UbStatCardProps>) {
  const DeltaIcon = delta ? DELTA_ICON[delta.direction] : null;

  const body = (
    <MLCardContent className="flex flex-col gap-1 p-4">
      <span className="flex items-center gap-2">
        {icon && (
          <span aria-hidden className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-text-tertiary">
            {icon}
          </span>
        )}
        <span className="ds-label text-text-tertiary">{label}</span>
      </span>
      {/* 20px on a phone, 28px from `sm` up. A tile is two-across at 360px, so
          a card gets about 140px of content width — and "₹36,018.00" at 28px
          tabular needs 170 and ran straight out of the card. The KPI tier is
          still the KPI tier; it is one step down where there is no room for
          it, which is the same trade every figure on this product makes. */}
      <span className={cn('ds-metric-sm sm:ds-metric-md', TONE[tone])}>{value}</span>
      {/* Its own line, which is where this departs from BrandHub.
          They set the value and the subtext on a shared baseline, and it works
          because theirs are two words — "incl. VAT". Ours are sentences that
          name the scope, so a long one wrapped under the figure while a short
          one stayed beside it, and a row of three cards came out in three
          different shapes. A fixed line keeps them identical whatever the copy
          says, which matters more here than the baseline does. */}
      {subtext && <span className="ds-caption text-text-tertiary">{subtext}</span>}
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
