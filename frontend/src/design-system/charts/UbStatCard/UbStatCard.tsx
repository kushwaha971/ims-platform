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
  /**
   * For a tile that APPLIES something and keeps applying it — the receivable
   * tile that filters the list to who owes the merchant.
   *
   * Set it and the tile becomes a toggle: `aria-pressed`, and a tint that says
   * so without relying on the tint alone, since the chip row below carries the
   * same state in words. Leave it unset and the tile is an ordinary action
   * that navigates or opens something, and announces no state at all — which
   * is right for a tile that does not have one, and wrong for this one, where
   * a merchant who cannot see the tint would otherwise have no way to know the
   * list they are reading is narrowed.
   *
   * Only meaningful with `onClick`.
   */
  readonly pressed?: boolean;
  /**
   * What the press DOES — "Show only who owes me".
   *
   * The tile's own text is a label and a figure; read aloud, the button is
   * "You will get, ₹36,018" and gives no hint that activating it filters
   * anything. This replaces the accessible name for the button only; the
   * visible text is untouched.
   */
  readonly actionLabel?: string;
  readonly className?: string;
}

/* §23.2.4: `--error` is the LEDGER debit family — overdue, receivable, out of
   stock. Validation errors are `--form-error` and never appear on a tile.

   Sprint 12 a11y sweep: the figure and the label were `--error-bright` /
   `--warning-bright` — #E73F3F is 4.05:1 and #E49614 2.39:1 on the white card,
   so "To collect ₹1,807.00" on the dashboard, "Low or out" on items and every
   report's "To pay" failed WCAG 1.4.3. The `-bright` steps are FILL colours;
   they stay only on the aria-hidden icon beside the worded label, which carries
   the meaning. TEXT takes the 4.5:1 step, and `scripts/check-contrast.mjs`
   refuses a `text-*-bright` anywhere else. */
const TONE: Record<UbStatCardTone, string> = {
  default: 'text-text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-error',
};

/** BrandHub `TONE_ACCENT` — the label carries the tone too, at text contrast. */
const ACCENT: Record<UbStatCardTone, string> = {
  default: 'text-text-tertiary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-error',
};

/** The 12 px aria-hidden glyph beside the label: decoration, so the fill step is allowed. */
const ICON_ACCENT: Record<UbStatCardTone, string> = {
  default: 'text-text-tertiary',
  success: 'text-success',
  warning: 'text-warning-bright', // contrast: decorative — aria-hidden icon beside the label
  danger: 'text-error-bright', // contrast: decorative — aria-hidden icon beside the label
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
  pressed,
  actionLabel,
  className,
}: Readonly<UbStatCardProps>) {
  const DeltaIcon = delta ? DELTA_ICON[delta.direction] : null;

  const body = (
    /* BrandHub "Served" stat card (Figma 13003:15783): 12 px / 16 px padding,
       a 4 px gap, the title row at 14/20 regular with a 12 px icon, and the
       figure at 20/32 semibold with its subtext on the SAME line, 12/16. An
       80 px tile — it was 112 px, which on a phone was the difference between
       a customer row above the fold and none. */
    <MLCardContent className="flex flex-col gap-1 px-4 py-3">
      <span className="flex items-center gap-2">
        {icon && (
          <span
            aria-hidden
            className={cn(
              'flex h-3 w-3 shrink-0 items-center justify-center [&>svg]:h-3 [&>svg]:w-3',
              ICON_ACCENT[tone]
            )}
          >
            {icon}
          </span>
        )}
        <span className={cn('ds-body-base-regular', ACCENT[tone])}>{label}</span>
      </span>
      {/* The subtext shares the figure's line and wraps UNDER it only when the
          tile is too narrow to hold both — a phone's two-across grid. */}
      <span className="flex flex-wrap items-baseline gap-x-3">
        <span className={cn('ds-body-xl-semibold whitespace-nowrap tabular-nums', TONE[tone])}>
          {value}
        </span>
        {subtext && <span className="ds-body-s-regular text-text-tertiary">{subtext}</span>}
      </span>
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
    <MLCard
      className={cn(
        'flex flex-col',
        // The applied tint goes on the CARD, not the button, so the border
        // moves with it — a tinted panel inside an untinted border reads as a
        // hover state rather than as a tile that is doing something.
        pressed && 'border-accent bg-accent-quiet',
        className
      )}
    >
      <button
        type="button"
        onClick={onClick}
        aria-pressed={pressed}
        aria-label={actionLabel}
        className="flex min-h-[44px] flex-col rounded-card text-left transition-colors duration-fast ease-standard hover:bg-surface-hover focus-visible:shadow-focus focus-visible:outline-none motion-reduce:transition-none"
      >
        {body}
      </button>
    </MLCard>
  );
}

UbStatCardBase.displayName = 'UbStatCard';
export const UbStatCard = memo(UbStatCardBase);
