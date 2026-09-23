'use client';

import { Children, Fragment, memo, type ReactNode } from 'react';

import { cn } from 'src/utils/cn';

/**
 * The row the chip groups live in, and the only thing on a list screen that is
 * allowed to scroll sideways.
 *
 * ── Why the exception ───────────────────────────────────────────────────────
 * The grid's contract is that no list scrolls sideways, and this does not break
 * it: the chips are a CONTROL, not the data. Seven chips at 360px either scroll
 * within their own track or wrap onto three lines and push the first row of the
 * list below the fold — on the screen whose whole promise is a row in 1.2
 * seconds. `overscroll-x-contain` stops the gesture turning into a back-swipe
 * when it reaches the end.
 *
 * ── A rule does the grouping, because the gap did not ───────────────────────
 * This was built with `gap-4` between groups against the groups' own `gap-2`,
 * on the theory that twice the space would read as a boundary. It does not.
 * On the actual screen, eight pills at 8px and 16px spacings are eight pills:
 * nothing said that "Owes me / I owe them / Settled" are three answers to one
 * question and "Customers / Suppliers" are two answers to another, and a
 * merchant had no way to tell that tapping across the invisible boundary
 * narrows on a different axis rather than switching within the same one.
 *
 * A hairline rule between groups is unambiguous at any size and costs a pixel
 * of width, where three visible headings would cost more of a 360px row than
 * the chips themselves. The groups keep their `aria-label`, which is what
 * carries the same boundary to a screen reader; the rule is `aria-hidden`,
 * because it says nothing that the group role does not already say.
 *
 * ── `trailing` ─────────────────────────────────────────────────────────────
 * Sticks to the end of the track rather than floating right, so "Clear filters"
 * sits immediately after the last chip instead of across a gulf of empty row on
 * a wide screen. It scrolls with the chips on a phone, which is correct: it is
 * about them.
 */
export interface UbFilterBarProps {
  readonly children: ReactNode;
  /** A clear-filters control, or anything else that acts on the whole bar. */
  readonly trailing?: ReactNode;
  /**
   * Scope controls pinned to the RIGHT of the row, outside the scrolling
   * track: a date or a range, a switch. The owner's rule is that a screen's
   * date sits on the right; when the row cannot hold both they wrap under the
   * chips, starting at the left.
   */
  readonly end?: ReactNode;
  readonly className?: string;
}

function UbFilterBarBase({ children, trailing, end, className }: Readonly<UbFilterBarProps>) {
  /* `toArray` rather than `map`: it drops nulls and false branches, so a group
     a screen renders conditionally does not leave a rule with nothing on one
     side of it. */
  const groups = Children.toArray(children);

  const track = (
    <div
      className={cn(
        'flex items-center gap-3 overflow-x-auto overscroll-x-contain',
        // The chips are 44px tall and their focus ring sits outside them, so
        // the track needs a little vertical room or a focused chip is clipped
        // by the scroll container it lives in.
        'py-0.5',
        className
      )}
    >
      {groups.map((group, index) => (
        /* Keyed by index, which is right here and not a shortcut: the groups
           are a fixed, ordered set declared in the caller's JSX, never
           reordered and never keyed by data. */
        <Fragment key={index}>
          {index > 0 && <span aria-hidden className="h-6 w-px shrink-0 bg-border-hairline" />}
          {group}
        </Fragment>
      ))}
      {trailing}
    </div>
  );

  if (!end) return track;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {/* The chips keep at least 24rem (or the whole row, if narrower), so on a
          phone the end cluster wraps to its own line rather than squeezing
          the chip track to two and a half chips. */}
      <div className="min-w-[min(100%,24rem)] flex-1">{track}</div>
      <div className="flex shrink-0 flex-wrap items-center gap-3">{end}</div>
    </div>
  );
}

UbFilterBarBase.displayName = 'UbFilterBar';
export const UbFilterBar = memo(UbFilterBarBase);
