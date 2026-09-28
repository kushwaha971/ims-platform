'use client';

import { forwardRef, memo, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { mlButtonClasses } from 'src/design-system/primitives';
import { UbBottomBar } from 'src/design-system/UbBottomBar';
import { useUbViewOnly } from 'src/design-system/UbViewOnly';
import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.3 — the floating action button: one 56 px primary circle at the
 * bottom right of a phone screen, for the single most frequent action of that
 * screen.
 *
 * ── Not used by any screen yet, on purpose ────────────────────────────────
 * The owner's rule is that a control without a job is not shown. The one
 * candidate — "Add party" on the list — is already in the page header, which
 * is one row at every width with 32 px icon buttons on a phone, so a FAB there
 * would be the same action twice on one screen. It lives in the design-system
 * gallery until a screen genuinely has nowhere else to put its primary action
 * (an entry list with a bottom nav is the likely first).
 *
 * ── The toast clears it ───────────────────────────────────────────────────
 * The global snackbar is anchored to the bottom of the viewport, and a FAB is
 * furniture at the bottom of the viewport — exactly CR-2026-09-19-G's defect
 * class. So the FAB is wrapped in `UbBottomBar` (not sticky: it is `fixed`),
 * which publishes its occupancy as `--ub-bottom-inset` and lifts the toast
 * above it. The WRAPPER is what is measured, not the button, and it spans from
 * the top of the button to the safe-area edge — so the 16 px gap under the
 * button is cleared too, and the toast does not land on it. The wrapper takes
 * no pointer events, so the corner beside the button stays tappable.
 *
 * It does NOT read `--ub-bottom-inset` for its own position. It publishes into
 * that value, so reading it back would lift the button by its own height —
 * a loop that settles one button-height too high. Stacking above a future
 * `UbBottomNav` is that component's job to expose as its own height token.
 *
 * ── Safe area ──────────────────────────────────────────────────────────────
 * `env(safe-area-inset-*)` on the bottom and the right, so on a notched phone
 * in landscape and above the iOS home indicator the button is never under the
 * system UI.
 *
 * ── Accessible name ───────────────────────────────────────────────────────
 * Icon only, with `label` as visually-hidden text rather than `aria-label`, so
 * it is also what a translation tool and a text-only browser see. The icon is
 * the caller's and should be `aria-hidden`.
 */
export interface UbFabProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'aria-label'
> {
  /** The action, in words — "Add party". Visually hidden; it is the name. */
  readonly label: string;
  readonly icon: ReactNode;
  /** Hide from `lg` up, where the page header has room for the real button. */
  readonly mobileOnly?: boolean;
  readonly className?: string;
}

const UbFabInner = forwardRef<HTMLButtonElement, UbFabProps>(function UbFabInner(
  { label, icon, mobileOnly = false, className, type = 'button', disabled, title, ...rest },
  ref
) {
  // CR-2026-09-29-SEC-A — a FAB is always a primary write ("Add party").
  const viewOnly = useUbViewOnly();
  const locked = viewOnly !== null;
  return (
    <UbBottomBar
      sticky={false}
      data-ub-fab=""
      className={cn(
        'pointer-events-none fixed z-30 pb-4 pr-4',
        'bottom-[env(safe-area-inset-bottom,0px)] right-[env(safe-area-inset-right,0px)]',
        mobileOnly && 'lg:hidden'
      )}
    >
      <button
        ref={ref}
        type={type}
        className={mlButtonClasses(
          'primary',
          'lg',
          cn(
            'pointer-events-auto h-14 w-14 rounded-pill p-0 shadow-3',
            'outline-none focus-visible:shadow-focus',
            locked && 'opacity-50',
            className
          )
        )}
        {...rest}
        disabled={disabled || locked}
        aria-disabled={disabled || locked || undefined}
        title={locked ? viewOnly : title}
        data-view-only={locked || undefined}
      >
        {icon}
        <span className="sr-only">{label}</span>
      </button>
    </UbBottomBar>
  );
});

UbFabInner.displayName = 'UbFab';
export const UbFab = memo(UbFabInner);
