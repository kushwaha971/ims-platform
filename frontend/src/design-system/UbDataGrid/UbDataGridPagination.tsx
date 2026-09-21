'use client';

import { memo, useCallback } from 'react';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { MLButton, MLNativeSelect } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

import { fillTemplate } from './columnModel';

import type { UbDataGridLabels, UbGridPage, UbGridTier } from './types';

/**
 * Server-paginated paging controls. The page NUMBER is the one thing that has
 * to be readable at every width — a merchant who cannot see they are on page 3
 * will keep scrolling for a name that is on page 1 — so the summary stays and
 * the page-size selector is what gives way below `lg`.
 *
 * The buttons are 44 px square (R-A-3) at every tier, not just on the phone: a
 * 28 px chevron is a poor target with a mouse too.
 */
export interface UbDataGridPaginationProps {
  readonly page: UbGridPage;
  readonly tier: UbGridTier;
  readonly labels: UbDataGridLabels;
  readonly pageSizeOptions?: readonly number[];
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange?: (pageSize: number) => void;
  readonly className?: string;
}

function UbDataGridPaginationBase({
  page,
  tier,
  labels,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
  className,
}: Readonly<UbDataGridPaginationProps>) {
  const handlePrevious = useCallback(() => onPageChange(page.page - 1), [onPageChange, page.page]);
  const handleNext = useCallback(() => onPageChange(page.page + 1), [onPageChange, page.page]);
  const handleSize = useCallback(
    (value: string) => onPageSizeChange?.(Number(value)),
    [onPageSizeChange]
  );

  const pages = Math.max(page.totalPages, 1);
  const showSizes = tier === 'full' && !!onPageSizeChange && !!pageSizeOptions?.length;

  return (
    <div
      data-testid="ub-grid-pagination"
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-border-hairline px-4 py-3',
        className
      )}
    >
      <p className="ds-caption text-text-tertiary">
        {fillTemplate(labels.pageOf, { page: page.page, pages })}
      </p>

      <div className="flex items-center gap-2">
        {/* Deliberately the native control, not `UbSelect`: a four-option
            page-size picker inside a toolbar, where the platform picker is
            smaller, needs no portal, and on a phone is the better control
            outright. `MLSelect` is now ml-uikit's Radix composite; this keeps
            the native `<select>` it was written for. */}
        {showSizes && (
          <MLNativeSelect
            aria-label={labels.pageSize}
            value={String(page.pageSize)}
            onChange={(event) => handleSize(event.target.value)}
            className="h-11 w-24"
          >
            {pageSizeOptions?.map((size) => (
              <option key={size} value={String(size)}>
                {size}
              </option>
            ))}
          </MLNativeSelect>
        )}
        <MLButton
          variant="secondary"
          size="md"
          aria-label={labels.previousPage}
          disabled={page.page <= 1}
          onClick={handlePrevious}
          className="h-11 w-11 p-0"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </MLButton>
        <MLButton
          variant="secondary"
          size="md"
          aria-label={labels.nextPage}
          disabled={page.page >= pages}
          onClick={handleNext}
          className="h-11 w-11 p-0"
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </MLButton>
      </div>
    </div>
  );
}

UbDataGridPaginationBase.displayName = 'UbDataGridPagination';
export const UbDataGridPagination = memo(UbDataGridPaginationBase);
