'use client';

import { memo, type ReactNode } from 'react';

import { cn } from 'src/utils/cn';

/**
 * Part 17 §17.0.2 — the grid's toolbar: search on the left, filters beside it,
 * and whatever the screen offers as a bulk action on the right once rows are
 * selected.
 *
 * It wraps rather than scrolls. A toolbar that scrolls sideways hides its own
 * filters, and the whole approved rule for a primary list is that nothing on it
 * is reachable only by a horizontal drag.
 */
export interface UbDataGridToolbarProps {
  readonly search?: ReactNode;
  readonly filters?: ReactNode;
  /** Bulk actions; rendered only when the grid hands them down (>= lg). */
  readonly bulk?: ReactNode;
  readonly className?: string;
}

function UbDataGridToolbarBase({ search, filters, bulk, className }: Readonly<UbDataGridToolbarProps>) {
  if (!search && !filters && !bulk) return null;

  return (
    <div
      data-testid="ub-grid-toolbar"
      className={cn(
        'flex flex-wrap items-end gap-3 border-b border-border-hairline px-4 py-3',
        className
      )}
    >
      {search && <div className="min-w-0 flex-1 basis-56">{search}</div>}
      {filters && <div className="flex flex-wrap items-end gap-2">{filters}</div>}
      {bulk && <div className="ml-auto flex flex-wrap items-center gap-2">{bulk}</div>}
    </div>
  );
}

UbDataGridToolbarBase.displayName = 'UbDataGridToolbar';
export const UbDataGridToolbar = memo(UbDataGridToolbarBase);
