'use client';

import { memo, type ReactNode } from 'react';

import { cn } from 'src/utils/cn';

/**
 * The KPI row: stat tiles, **2-across on a 360 px phone and 3-across from
 * 768 px up**, which is the approved responsive policy.
 *
 * It is a layout, not a chart, and it is here rather than in a feature because
 * the breakpoints are the policy — a screen that lays its own tiles out is a
 * screen that will disagree with the next one.
 */
export interface UbStatGridProps {
  readonly children: ReactNode;
  /**
   * Announce the figures when they change, for a screen reader (PTY-02 NFR).
   *
   * A filter changes the list AND the totals, and the list change is obvious —
   * rows appear and disappear under the cursor. The totals change silently:
   * without this, a merchant using a screen reader taps "Owes me" and is told
   * nothing about the number they tapped it to find out.
   *
   * `polite`, and NOT atomic. Atomic re-reads all three tiles on every change,
   * which on a debounced search box means the whole row read out again per
   * committed keystroke; non-atomic reads the figures that actually moved.
   *
   * Requires `label`, because a live region with no name announces changes
   * with no statement of what changed.
   */
  readonly live?: boolean;
  /** Names the region — "Totals for this list". Required with `live`. */
  readonly label?: string;
  readonly className?: string;
}

function UbStatGridBase({ children, live, label, className }: Readonly<UbStatGridProps>) {
  return (
    <div
      data-testid="ub-stat-grid"
      role={live ? 'region' : undefined}
      aria-live={live ? 'polite' : undefined}
      aria-label={label}
      /* Responsive, up to FIVE across (owner, Sep 2026): each tile is at least
         180 px and at least a fifth of the row, so a wide screen never packs a
         sixth in, and three tiles stretch to fill the row instead of leaving
         two empty slots. On a phone the floor gives two across. */
      className={cn(
        'grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(max(150px,calc((100%-4*1rem)/5)),1fr))] md:gap-4',
        className
      )}
    >
      {children}
    </div>
  );
}

UbStatGridBase.displayName = 'UbStatGrid';
export const UbStatGrid = memo(UbStatGridBase);
