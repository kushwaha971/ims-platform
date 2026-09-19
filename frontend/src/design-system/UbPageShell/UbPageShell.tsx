'use client';

import { memo, type ReactNode } from 'react';

import { UbBottomBar } from 'src/design-system/UbBottomBar';
import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.3 — the page container every screen sits in: the content max
 * width, the page padding (16 px below `sm`, 32 px above, from the tokens) and
 * the bottom padding that keeps a sticky footer clear of `UbBottomNav`
 * (§19.6.3).
 *
 * ── CR-2026-09-19-D ─────────────────────────────────────────────────────────
 *  · **The content region is no longer a `<main>`.** `UbAppShell` renders the
 *    one `main` landmark for the application, so a second one here put two on
 *    every authenticated page — which is a real defect, not a pedantic one: a
 *    screen reader's "jump to main" lands on whichever it finds first, and the
 *    skip link stops meaning anything.
 *  · **`max-w-content` is 1440 px, which is a viewport, not a column.** Every
 *    screen in this product is a list or a form, and a 1440 px-wide list of
 *    parties on a desktop monitor is unreadable. The default column is
 *    `measure` (1120 px), which is where a two-pane screen still fits and a
 *    single list stops stretching; `width="full"` is the opt-out for the data
 *    grids that genuinely want the room.
 *  · **Vertical rhythm.** 24 px above the content and 48 px below it, so a
 *    short page does not leave its last row flush against the fold.
 *
 * ── CR-2026-09-19-G ─────────────────────────────────────────────────────────
 * The `footer` slot is a `UbBottomBar`. It renders the identical element with
 * the identical classes; what it adds is the published `--ub-bottom-inset`, so
 * that when the entry-form editors land their Save row the global toast is
 * already anchored above it rather than on it — the defect the wizard and the
 * `(auth)` footer were both found with.
 */
export type UbPageShellWidth = 'measure' | 'full';

export interface UbPageShellProps {
  readonly header?: ReactNode;
  readonly children: ReactNode;
  /** A sticky action bar — the invoice editor's "Issue" row, a drawer's Save. */
  readonly footer?: ReactNode;
  readonly width?: UbPageShellWidth;
  readonly className?: string;
}

const WIDTH: Readonly<Record<UbPageShellWidth, string>> = {
  measure: 'max-w-[1120px]',
  full: 'max-w-content',
};

function UbPageShellBase({
  header,
  children,
  footer,
  width = 'measure',
  className,
}: Readonly<UbPageShellProps>) {
  return (
    <div className={cn('flex min-h-full w-full flex-col bg-canvas', className)}>
      {header}
      <div className={cn('mx-auto w-full flex-1 px-4 pb-12 pt-6 md:px-page', WIDTH[width])}>
        {children}
      </div>
      {footer && (
        <UbBottomBar className="border-t border-border-hairline bg-surface-card px-4 py-3 md:px-page">
          <div className={cn('mx-auto w-full', WIDTH[width])}>{footer}</div>
        </UbBottomBar>
      )}
      {/* Clears the 64 px bottom nav plus the iOS safe area (§19.6.3). */}
      <div aria-hidden className="h-bottom-nav md:hidden" />
    </div>
  );
}

UbPageShellBase.displayName = 'UbPageShell';
export const UbPageShell = memo(UbPageShellBase);
