'use client';

import { forwardRef, memo, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.3 — a whole SURFACE that is pressable, as against `UbButton`,
 * which is a control with a shape of its own. BrandHub's `BHListItem` (MUI's
 * `ListItemButton`) fills the same seat, and for the same reason: a row or a
 * tile that is clickable end to end must still be a `<button>`, or it is
 * unreachable by keyboard and invisible to a screen reader's control list.
 *
 * It carries the interaction contract and no visual opinion: the surface's own
 * padding, minimum height and selected tint stay with the screen, because a
 * tenant row and a business-type tile are the same behaviour and different
 * furniture. It takes `role` and the matching ARIA state through `...rest`, so
 * a tile inside a `role="radiogroup"` stays a radio.
 *
 * `type="button"` is not optional — a row inside a `<form>` that defaults to
 * `submit` posts the form when the user meant to open a record.
 */
export interface UbPressableProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'type'
> {
  /**
   * Announced as `aria-current` — "this is the one you are on". A surface with
   * an explicit `role` (a radio tile) carries its own `aria-checked` instead
   * and leaves this unset.
   */
  readonly selected?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}

const UbPressableInner = forwardRef<HTMLButtonElement, UbPressableProps>(function UbPressableInner(
  { selected, disabled, children, className, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      aria-current={selected ? 'true' : undefined}
      aria-disabled={disabled || undefined}
      className={cn(
        'w-full text-left outline-none focus-visible:shadow-focus',
        'transition-colors duration-fast ease-standard',
        'disabled:cursor-not-allowed',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

UbPressableInner.displayName = 'UbPressable';
export const UbPressable = memo(UbPressableInner);
