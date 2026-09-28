'use client';

import { memo, type ReactNode } from 'react';

import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.3 — a filter chip: a toggle, not a button and not a tab.
 *
 * The distinction is the whole component. A button does something; a chip
 * SAYS SOMETHING ABOUT THE LIST BELOW IT, and it has to keep saying it after
 * the press, which is what `aria-pressed` is for. A tab would be wrong in the
 * other direction — tabs partition one set of things into panels that are
 * mutually exclusive by definition, and these compose: "Suppliers" and
 * "I owe them" are two narrowings of the same list and a merchant applies both
 * on a settlement day.
 *
 * ── Why this exists as a component ──────────────────────────────────────────
 * It was already written, inline, inside `UbDateInput`'s quick choices, and
 * PTY-02 needed the same pill three more times for type, balance and
 * collection. Three copies of a 44px-hit-area-with-a-32px-pill is three places
 * for the hit area to go missing, and the hit area is the part a merchant
 * notices, on a phone, with a thumb.
 *
 * ── The 44px ────────────────────────────────────────────────────────────────
 * R-A-3's minimum target, and it is on the BUTTON rather than on the pill: the
 * pill stays 32px so a row of chips does not eat a third of a 360px screen,
 * and the button pads out around it. The same arrangement as the paging bar's
 * step buttons, for the same reason.
 */
export interface UbFilterChipProps {
  readonly label: string;
  /** Applied, and announced as such. */
  readonly pressed: boolean;
  /**
   * Called with what the chip's state WILL be — `true` when it is being
   * applied, `false` when the merchant is taking it off.
   *
   * The next state rather than a bare `onClick`, because every caller so far
   * had to recompute it from `pressed`, and a chip group that toggles a value
   * on and off is the one case where getting that backwards is invisible in
   * review and obvious the first time anyone uses it.
   */
  readonly onToggle: (next: boolean) => void;
  /** A count or a glyph after the label. Decorative; `aria-hidden` is the caller's. */
  readonly adornment?: ReactNode;
  readonly disabled?: boolean;
  readonly className?: string;
}

function UbFilterChipBase({
  label,
  pressed,
  onToggle,
  adornment,
  disabled,
  className,
}: Readonly<UbFilterChipProps>) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={pressed}
      onClick={() => onToggle(!pressed)}
      className={cn(
        // 32 px pill; `.ub-hit` makes the tap target 44 px on a phone (R-A-3).
        'ub-hit ds-body-s-regular inline-flex h-8 shrink-0 items-center gap-1.5 rounded-pill px-3',
        'border transition-colors duration-fast ease-standard motion-reduce:transition-none',
        'outline-none focus-visible:shadow-focus',
        'disabled:cursor-not-allowed disabled:opacity-60',
        pressed
          ? 'border-transparent bg-accent-quiet text-text-accent'
          : 'border-border text-text-tertiary hover:bg-surface-hover hover:text-text-primary',
        className
      )}
    >
      {label}
      {adornment}
    </button>
  );
}

UbFilterChipBase.displayName = 'UbFilterChip';
export const UbFilterChip = memo(UbFilterChipBase);
