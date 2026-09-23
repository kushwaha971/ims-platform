'use client';

import { memo, type ReactNode } from 'react';

import { cn } from 'src/utils/cn';

/**
 * A named set of `UbFilterChip`s — one axis of a filter, such as "Balance".
 *
 * ── The name is not decoration, and it is not visible ───────────────────────
 * Read aloud, a bare chip row is "Owes me, toggle, not pressed. I owe them,
 * toggle, not pressed. Suppliers, toggle, not pressed." — seven controls with
 * nothing saying which of them are alternatives to each other. `role="group"`
 * with an accessible name makes it "Balance, group", and the chips inside
 * become answers to a stated question.
 *
 * On screen there is no heading, and that is deliberate rather than a
 * compromise: three visible group labels cost more of a 360px row than the
 * chips do, and sighted users get the grouping from proximity — `UbFilterBar`
 * sets a wider gap between groups than this sets between chips. The label is
 * REQUIRED regardless, because a group with no name is worse than no group at
 * all: it adds a boundary the screen reader announces and then says nothing
 * about it.
 *
 * It does not scroll and does not wrap. `UbFilterBar` owns the track, so a
 * group cannot be half-scrolled inside a row that is also scrolling.
 */
export interface UbFilterChipGroupProps {
  /** Announced as the group's name. Never omitted — see above. */
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string;
}

function UbFilterChipGroupBase({ label, children, className }: Readonly<UbFilterChipGroupProps>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('flex shrink-0 items-center gap-2', className)}
    >
      {children}
    </div>
  );
}

UbFilterChipGroupBase.displayName = 'UbFilterChipGroup';
export const UbFilterChipGroup = memo(UbFilterChipGroupBase);
