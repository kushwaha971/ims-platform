'use client';

import { cloneElement, isValidElement, memo, type ReactElement, type ReactNode } from 'react';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { cn } from 'src/utils/cn';

/**
 * Part 23 — the hover explanation, ported from BrandHub's `BrandHubTooltip`.
 *
 * ── Why it is a white card and not the dark pill ────────────────────────────
 * ml-uikit's own `MLTooltipContent` is shadcn's default: `bg-primary
 * text-primary-foreground` — an indigo chip. BrandHub replaced it entirely with
 * a white card and a rotated-square arrow, matching the legacy MUI tooltip its
 * users already knew, and that is the one its customer portal renders. A tooltip
 * painted in the action colour reads as something you can press.
 *
 * ── The empty-title short-circuit, which is the useful part ─────────────────
 * A blank `title` renders the child bare, with no trigger and no wrapper. That
 * is not a micro-optimisation: the common call is
 * `title={disabled ? reason : ''}` — explain why a control is unavailable, say
 * nothing when it is available — and without this every enabled button in the
 * product would carry a tooltip that opens on hover and shows an empty box.
 *
 * ── `@radix-ui/react-tooltip` is already a direct dependency ────────────────
 * ml-uikit lists it, so this adds no package and ADR-021 is untouched.
 */
export type UbTooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface UbTooltipProps {
  /** The explanation. **Blank renders the child alone** — see above. */
  readonly title: ReactNode;
  /** Exactly one element: Radix needs a single child to attach a ref to. */
  readonly children: ReactElement;
  readonly placement?: UbTooltipPlacement;
  readonly arrow?: boolean;
  /** 0 by default, like BrandHub's: a tooltip that explains a DISABLED control
   *  is useless if it waits 700ms while the pointer is already moving away. */
  readonly delayDuration?: number;
  readonly className?: string;
}

/** BrandHub's `ARROW_POSITION`, verbatim — the square is rotated 45° and half
 *  of it is pushed under the card, so the card's own shadow hides the seam. */
const ARROW_POSITION: Readonly<Record<UbTooltipPlacement, string>> = {
  top: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2',
  bottom: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2',
  left: 'right-0 top-1/2 -translate-y-1/2 translate-x-1/2',
  right: 'left-0 top-1/2 -translate-y-1/2 -translate-x-1/2',
};

function UbTooltipBase({
  title,
  children,
  placement = 'top',
  arrow = true,
  delayDuration = 0,
  className,
}: Readonly<UbTooltipProps>) {
  const blank = title === null || title === undefined || title === false || title === '';
  if (blank || !isValidElement(children)) return children;

  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{cloneElement(children)}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={placement}
            sideOffset={8}
            className={cn(
              'relative z-[60] max-w-[200px] overflow-visible rounded-card p-3',
              'ds-caption bg-surface-raised font-medium text-text-secondary shadow-ub-popover',
              'data-[state=delayed-open]:animate-fade-in data-[state=closed]:animate-fade-out',
              className
            )}
          >
            {title}
            {arrow && (
              <span
                aria-hidden
                className={cn(
                  'absolute z-[-1] size-2.5 rotate-45 bg-surface-raised shadow-ub-popover',
                  ARROW_POSITION[placement]
                )}
              />
            )}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

UbTooltipBase.displayName = 'UbTooltip';
export const UbTooltip = memo(UbTooltipBase);
