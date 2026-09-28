'use client';

import { memo, type ReactElement, type ReactNode } from 'react';

import * as PopoverPrimitive from '@radix-ui/react-popover';

import { cn } from 'src/utils/cn';

/**
 * Part 23 — the anchored panel, ported from BrandHub's `BrandHubPopover`.
 *
 * ── Why a wrapper rather than the raw primitive ─────────────────────────────
 * `MLPopoverContent` was being consumed raw, at ml-uikit's default `w-72
 * rounded-md border bg-popover p-4 … shadow-md`. That is shadcn's stock panel,
 * not this kit's: 288px where BrandHub's is 300, a 6px radius where its cards
 * are 12, and its own padding regardless of what goes inside. `tailwind.config.js`
 * has carried a `width['ub-popover']` token since the sizing tokens were
 * adopted and nothing has ever used it — this is the component it was for.
 *
 * ── The content scrolls, the frame does not ─────────────────────────────────
 * `overflow-hidden` on the frame with `overflow-y-auto overscroll-contain` on
 * the inner region, which is BrandHub's arrangement. It matters for a reason
 * that only shows up on a phone: without `overscroll-contain`, reaching the
 * bottom of a popover's list hands the remaining scroll to the PAGE behind it,
 * so the panel stays put while the screen underneath slides away.
 *
 * `updatePositionStrategy="always"` follows the trigger during scroll, rather
 * than Radix's default of positioning once and letting the panel drift off its
 * anchor — visible the moment a popover is opened inside a scrolling table.
 */
export interface UbPopoverProps {
  /** Exactly one element: Radix attaches the trigger ref to it. */
  readonly trigger: ReactElement;
  readonly children: ReactNode;
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly side?: 'top' | 'bottom' | 'left' | 'right';
  readonly align?: 'start' | 'center' | 'end';
  readonly sideOffset?: number;
  /** Names the panel for assistive technology; it is a `dialog` to Radix. */
  readonly label?: string;
  readonly className?: string;
}

function UbPopoverBase({
  trigger,
  children,
  open,
  defaultOpen,
  onOpenChange,
  side = 'bottom',
  align = 'start',
  sideOffset = 6,
  label,
  className,
}: Readonly<UbPopoverProps>) {
  return (
    <PopoverPrimitive.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          updatePositionStrategy="always"
          className={cn(
            'z-[60] flex w-ub-popover max-w-[calc(100vw-2rem)] flex-col overflow-hidden',
            'rounded-card border border-border-hairline bg-surface-raised shadow-ub-popover',
            'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
            className
          )}
        >
          {/* The scrolling region. `overscroll-contain` is what stops the page
              behind the panel taking over once this list reaches its end. */}
          <div
            role="dialog"
            aria-label={label}
            className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain"
          >
            {children}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

UbPopoverBase.displayName = 'UbPopover';
export const UbPopover = memo(UbPopoverBase);
