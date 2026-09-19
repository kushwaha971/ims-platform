'use client';

import { memo, type ReactNode } from 'react';

import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.3 — title, breadcrumb, scope controls and actions, 60 px sticky.
 * A layout that exists only to add a page title is a defect (§19.6.1): the
 * title belongs here, inside the page content.
 */
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
    <header
      className={cn(
        'sticky top-0 z-20 border-b border-border-hairline bg-surface-card',
        'px-4 py-3 md:px-page',
        className
      )}
    >
      <div className="mx-auto flex w-full max-w-content flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="ds-h2 truncate text-text-primary md:ds-h1">{title}</h1>
            {subtitle && <p className="ds-caption text-text-tertiary">{subtitle}</p>}
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
