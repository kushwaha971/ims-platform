'use client';

import { forwardRef, memo, type ButtonHTMLAttributes, type ReactNode } from 'react';

import {
  MLButton,
  MLSpinner,
  type MLButtonSize,
  type MLButtonVariant,
} from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.3 — the button, with the one piece of product behaviour a raw
 * primitive has no business knowing: the BUSY state.
 *
 * Three rules it enforces so that 200 call sites cannot each get them wrong:
 *  1. Busy implies disabled, and the label is replaced by `busyLabel` — "Log in"
 *     that still says "Log in" while a request is in flight invites a second tap
 *     and a double POST.
 *  2. `aria-busy` and `aria-disabled` are set, so the state is announced rather
 *     than merely greyed.
 *  3. `fullWidth` is a prop, not a class the caller remembers: below `sm` the
 *     primary action is full width and thumb-reachable, and `size="lg"` is 44 px
 *     (R-A-3).
 *
 * §23.3: destructive is an OUTLINED danger in `--form-error`, never a red fill.
 */
export type UbButtonVariant = MLButtonVariant;
export type UbButtonSize = MLButtonSize;

export interface UbButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'aria-busy'
> {
  readonly variant?: UbButtonVariant;
  readonly size?: UbButtonSize;
  readonly busy?: boolean;
  /** Shown in place of the label while busy — "Sending…", "Verifying…". */
  readonly busyLabel?: string;
  readonly fullWidth?: boolean;
  /** Leading icon; hidden while busy so the spinner takes its slot. */
  readonly icon?: ReactNode;
  /**
   * The icon carries the meaning and the label is for a screen reader only.
   *
   * `children` stays REQUIRED, which is the point: an icon button still has to
   * say what it does, and making the label optional would let a caller ship a ⋯
   * that announces itself as "button". The word is rendered `sr-only` instead
   * of dropped, so the accessible name comes from the same string a sighted
   * user would have read — no `aria-label` that drifts from the visible text,
   * because there is no visible text to drift from.
   *
   * LED-03's timeline is the first caller: a worded button on a khata row
   * pushed the amount off a 360 px phone, which is the defect that feature's
   * own screenshot sweep exists to catch.
   */
  /**
   * `'mobile'` — worded from `sm` up, icon-only below it. The owner's rule for
   * a page header's actions on a phone: they stay on the title's row, at the
   * right, as icons, so the header costs one line rather than three.
   */
  readonly iconOnly?: boolean | 'mobile';
  readonly children: ReactNode;
  readonly className?: string;
}

/** Below `sm`: a 32 px square (owner: the 40 px ones "look so large" beside a
 *  title), label kept for AT. Still inside the 44 px row the header gives it. */
export const ICON_ONLY_MOBILE = 'max-sm:h-8 max-sm:w-8 max-sm:px-0';
export const LABEL_ONLY_FROM_SM = 'max-sm:sr-only';

const UbButtonInner = forwardRef<HTMLButtonElement, UbButtonProps>(function UbButtonInner(
  {
    variant = 'primary',
    size = 'md',
    busy = false,
    busyLabel,
    fullWidth = false,
    icon,
    iconOnly = false,
    children,
    disabled,
    className,
    ...rest
  },
  ref
) {
  return (
    <MLButton
      ref={ref}
      variant={variant}
      size={size}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      aria-disabled={disabled || busy || undefined}
      className={cn(
        fullWidth && 'w-full',
        iconOnly === true && 'aspect-square px-0',
        iconOnly === 'mobile' && ICON_ONLY_MOBILE,
        className
      )}
      {...rest}
    >
      {busy ? <MLSpinner /> : icon}
      {/* `inline-flex items-center gap-2` rather than a bare `<span>`.
          Tailwind's preflight sets `svg { display: block }`, so an icon a
          caller passes as a CHILD instead of through `icon` becomes a block
          inside an inline span: it takes its own line and the label drops
          underneath it. A plain text label is unaffected — a single child has
          no gap and nothing to align — and a caller who gets the slot wrong now
          gets a button that is merely unidiomatic rather than one that is
          visibly broken. */}
      <span
        className={cn(
          'inline-flex items-center gap-2',
          iconOnly === true && 'sr-only',
          iconOnly === 'mobile' && LABEL_ONLY_FROM_SM
        )}
      >
        {busy ? (busyLabel ?? children) : children}
      </span>
    </MLButton>
  );
});

UbButtonInner.displayName = 'UbButton';
export const UbButton = memo(UbButtonInner);
