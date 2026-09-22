'use client';

import { memo, type ReactNode } from 'react';

import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.3 — title, breadcrumb, scope controls and actions, 60 px sticky.
 * A layout that exists only to add a page title is a defect (§19.6.1): the
 * title belongs here, inside the page content.
 *
 * ── CR-2026-09-19-D ─────────────────────────────────────────────────────────
 *  · **The title and its subtitle were the same weight of information.** The
 *    subtitle was `ds-caption` — the tier used for a field's hint — under a
 *    `ds-h1`. It is `ds-body-sm` on `--text-tertiary` now: a sentence, at the
 *    size a sentence is read at.
 *  · **The header had no breathing room.** `py-3` under a 32 px heading gave
 *    12 px of space above the title on desktop. It is 16/20 px now, and the
 *    stack below the title is on the same 12 px rhythm as its controls.
 *  · **The column matches the page.** The header's inner column was
 *    `max-w-content` (1440 px) while `UbPageShell`'s content column is
 *    1120 px, so the title sat 160 px left of the content it titled on any wide
 *    screen. Both are `measure` now, and `width` moves them together.
 *  · A `border-b` alone did not separate a sticky header from the rows it
 *    scrolls over on a dark theme; it carries `shadow-1` as well.
 */
/**
 * Kept only so the existing imports still type-check: the header no longer has
 * a width of its own. `UbPageShell` renders it inside the content column, so
 * the column's width IS the header's width and the two cannot disagree — which
 * is the defect this removes, not a simplification for its own sake.
 *
 * @deprecated Pass `width` to `UbPageShell` instead.
 */
export type UbPageHeaderWidth = 'measure' | 'full';

export interface UbPageHeaderProps {
  readonly title: string;
  readonly subtitle?: string;
  /** Scope controls: a tab bar, a date range, a search box. */
  readonly controls?: ReactNode;
  /** One primary action per view (Koper). */
  readonly actions?: ReactNode;
    readonly className?: string;
}

function UbPageHeaderBase({
  title,
  subtitle,
  controls,
  actions,
  className,
}: Readonly<UbPageHeaderProps>) {
  return (
    /**
     * ── No card, no band, not sticky ──────────────────────────────────────
     * This was a `sticky top-0` white bar with its own border, shadow and
     * 32 px padding, sitting above the page rather than in it. Three things
     * were wrong with that, and the owner named all three:
     *
     *  · Its inset did not match the content's, so the title sat 32 px left of
     *    every card and table under it.
     *  · A band with a shadow reads as a CARD, and a page whose first element
     *    is a card about the page's own name spends its most valuable strip of
     *    screen on a label.
     *  · It cost vertical space twice over — its own padding, then the
     *    content's padding again immediately below.
     *
     * BrandHub has none of it: the title is simply the first row of the page
     * column. `UbPageShell` owns the inset and the rhythm now, so this
     * component carries no padding, no width and no background of its own.
     *
     * What is lost is the sticky title on a long list, and that was weighed:
     * the owner asked for BrandHub's layout knowing the totals moved into the
     * body with it. The `<header>` element stays, because it is still the
     * page's banner to a screen reader.
     */
    <header className={cn('flex flex-col gap-4', className)}>
      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="ds-h2 truncate text-text-primary md:ds-h1">{title}</h1>
            {subtitle && <p className="ds-body-sm text-text-tertiary">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
        {controls}
      </div>
    </header>
  );
}

UbPageHeaderBase.displayName = 'UbPageHeader';
export const UbPageHeader = memo(UbPageHeaderBase);
