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
  /**
   * The page's everyday pair — a khata's "You gave" / "You got". Beside the
   * title from `sm` up, before `actions`; on a phone an equal-width row of
   * its own under the title, like two tabs (owner, 23 Sep 2026), while
   * `actions` (the ⋯) stay on the title's line.
   *
   * One DOM position, rearranged by CSS: the cluster is `display: contents`
   * on a phone so its children join the title's row, and the pair takes
   * `order-last basis-full`. Rendering the pair twice and hiding one would
   * put two "You gave" buttons in the accessibility tree.
   */
  readonly primaryActions?: ReactNode;
  readonly className?: string;
}

function UbPageHeaderBase({
  title,
  subtitle,
  controls,
  actions,
  primaryActions,
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
    <header className={cn('flex flex-col gap-3', className)}>
      {/* ── One row at every width (owner, 23 Sep 2026) ─────────────────────
          Title on the left, actions on the right — on a phone too. It was a
          column below `lg`, so a phone spent three lines on a title, a
          sentence and a row of buttons before the first figure. Now the
          actions share the title's line, as icons below `sm` (`iconOnly=
          "mobile"` on each), and only wrap when even the icons do not fit.
          When they wrap they start at the LEFT, under the title (owner, same
          day): the title's `flex-1` is what pushes them right while they share
          its line, so no `ml-auto` pins them there once they do not.

          The title keeps an 8rem floor so a long action row wraps instead of
          crushing the name to an ellipsis. No vertical padding: the shell's
          top inset is the header's. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-[8rem] flex-1 flex-col gap-0.5">
          <h1 className="ds-body-xl-semibold truncate leading-8 text-text-primary">{title}</h1>
          {subtitle && (
            <p className="ds-body-base-regular truncate leading-5 text-text-tertiary">{subtitle}</p>
          )}
        </div>
        {(actions || primaryActions) && (
          <div
            className={cn(
              'flex shrink-0 flex-wrap items-center gap-2',
              primaryActions && 'max-sm:contents'
            )}
          >
            {primaryActions && (
              <div className="flex items-center gap-2 max-sm:order-last max-sm:grid max-sm:basis-full max-sm:grid-cols-2 max-sm:[&>*]:w-full">
                {primaryActions}
              </div>
            )}
            {actions}
          </div>
        )}
      </div>
      {controls}
    </header>
  );
}

UbPageHeaderBase.displayName = 'UbPageHeader';
export const UbPageHeader = memo(UbPageHeaderBase);
