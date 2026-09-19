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
  readonly children: ReactNode;
  readonly className?: string;
}

const UbButtonInner = forwardRef<HTMLButtonElement, UbButtonProps>(function UbButtonInner(
  {
    variant = 'primary',
    size = 'md',
    busy = false,
    busyLabel,
    fullWidth = false,
    icon,
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
      className={cn(fullWidth && 'w-full', className)}
      {...rest}
    >
      {busy ? <MLSpinner /> : icon}
      <span>{busy ? (busyLabel ?? children) : children}</span>
    </MLButton>
  );
});

UbButtonInner.displayName = 'UbButton';
export const UbButton = memo(UbButtonInner);
