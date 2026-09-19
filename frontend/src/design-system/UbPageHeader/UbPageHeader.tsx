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
export type UbPageHeaderWidth = 'measure' | 'full';

export interface UbPageHeaderProps {
  readonly title: string;
  readonly subtitle?: string;
  /** Scope controls: a tab bar, a date range, a search box. */
  readonly controls?: ReactNode;
  /** One primary action per view (Koper). */
  readonly actions?: ReactNode;
  /** Must match the `UbPageShell` it sits above. */
  readonly width?: UbPageHeaderWidth;
  readonly className?: string;
}

const WIDTH: Readonly<Record<UbPageHeaderWidth, string>> = {
  measure: 'max-w-[1120px]',
  full: 'max-w-content',
};

function UbPageHeaderBase({
  title,
  subtitle,
  controls,
  actions,
  width = 'measure',
  className,
}: Readonly<UbPageHeaderProps>) {
  return (
    <header
      className={cn(
        'sticky top-0 z-20 border-b border-border-hairline bg-surface-card shadow-1',
        'px-4 py-4 md:px-page md:py-5',
        className
      )}
    >
      <div className={cn('mx-auto flex w-full flex-col gap-4', WIDTH[width])}>
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
