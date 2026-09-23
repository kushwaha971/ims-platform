'use client';

import { memo } from 'react';

import { cn } from 'src/utils/cn';
import { absMoney, formatInr, isZeroAmount } from 'src/utils/money';

/**
 * Part 23 §23.2.6 is the contract; Part 25 R-C-2 is this implementation.
 *
 * Every rupee figure in the product is rendered by `UbAmount` and by nothing
 * else. It knows how to paint a signed decimal string; it does not know what a
 * party balance is — the FEATURE decides which sign, tone and label a figure
 * carries (§19.1.2).
 */
export type UbAmountTone = 'neutral' | 'receivable' | 'payable';
export type UbAmountSign = 'minus' | 'plus' | 'none';

interface UbAmountBaseProps {
  /** Decimal string from the API — never a number, never preformatted. */
  readonly value: string | null;
  readonly size?: 'sm' | 'md' | 'lg';
  /** Hides the label visually; it stays in the accessible name. */
  readonly labelHidden?: boolean;
  readonly className?: string;
}

/**
 * The union is what makes rule 2 of the colour-plus-text rule
 * unrepresentable-if-broken: a signed or toned amount cannot compile without a
 * label.
 */
export type UbAmountProps =
  | (UbAmountBaseProps & {
      readonly tone?: 'neutral';
      readonly sign?: 'none';
      readonly label?: string;
    })
  | (UbAmountBaseProps & {
      readonly tone: UbAmountTone;
      readonly sign?: UbAmountSign;
      readonly label: string;
    });

const TONE: Record<UbAmountTone, string> = {
  neutral: 'text-text-primary',
  receivable: 'text-error', // ledger debit only — never --form-error (§23.2.4)
  payable: 'text-success',
};

const SIZE: Record<NonNullable<UbAmountBaseProps['size']>, string> = {
  sm: 'ds-body-sm',
  md: 'ds-body-medium',
  lg: 'ds-metric-sm',
};

/** U+2212 MINUS SIGN, not a hyphen, so it aligns with `ds-num`'s figures. */
const GLYPH: Record<UbAmountSign, string> = { minus: '−', plus: '+', none: '' };

function UbAmountBase({
  value,
  tone = 'neutral',
  sign = 'none',
  label,
  labelHidden,
  size = 'md',
  className,
}: Readonly<UbAmountProps>) {
  // An absent value is neutral and unsigned; the caller's label carries the
  // field's own empty wording (§23.2.6 row "Absent value").
  const isAbsent = value === null || value === '';
  // A zero is never red, never green and never signed (§23.2.6 rule 4).
  const isZero = isAbsent || isZeroAmount(value);
  const effectiveTone: UbAmountTone = isZero ? 'neutral' : tone;
  const effectiveSign: UbAmountSign = isZero ? 'none' : sign;
  /**
   * The MAGNITUDE. The sign is the slot below, and never the formatter's.
   *
   * This read `formatInr(value)`, and `formatInr` signs what it formats — so a
   * party balance of `"-282.90"` came out as "−₹282.90 · You will give" on both
   * the list and the khata page, which is §23.2.6 rule 3 broken in exactly the
   * case the rule exists for: a negative balance is not a concept a shopkeeper
   * has, they have "you will get" and "you will give", and the label already
   * says which. The sign slot below was doing its job correctly and rendering
   * nothing, which is why the defect survived — two mechanisms, one of them
   * silently overruling the other.
   *
   * A caller that genuinely wants a signed figure — a ledger delta, "+₹500" —
   * asks for it through `sign`, gets the glyph in the fixed slot, and keeps the
   * decimal column aligned with the unsigned rows above and below it. That is
   * the whole reason the slot exists.
   */
  const formatted = isAbsent ? formatInr(value) : formatInr(absMoney(value));
  const a11y = label ? `${label}, ${formatted}` : formatted;

  return (
    <span className={cn('inline-flex flex-col items-end', className)}>
      <span
        lang="en-IN"
        dir="ltr"
        aria-hidden
        className={cn('ds-num whitespace-nowrap', SIZE[size], TONE[effectiveTone])}
      >
        {/* fixed slot so signed and unsigned rows keep one decimal column */}
        <span className="inline-block min-w-[0.6em] text-right">{GLYPH[effectiveSign]}</span>
        {formatted}
      </span>
      {/* The sign word is never spoken: the label already states the direction,
          and "minus five hundred rupees" is not how the number is read in the
          shop (§23.2.6 rule 8). */}
      <span className="sr-only">{a11y}</span>
      {label && !labelHidden && <span className="ds-caption text-text-tertiary">{label}</span>}
    </span>
  );
}

UbAmountBase.displayName = 'UbAmount';
export const UbAmount = memo(UbAmountBase);
