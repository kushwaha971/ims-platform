'use client';

import { memo, useCallback } from 'react';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { MLButton, MLNativeSelect } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

import { fillTemplate } from './columnModel';
import { buildPageRange } from './pageRange';

import type { UbDataGridLabels, UbGridPage, UbGridTier } from './types';

/**
 * Server-paginated paging controls, rebuilt on BrandHub's customer layout.
 *
 * ── What changed and why ────────────────────────────────────────────────────
 * This used to be "Page 1 of 12" beside a prev and a next chevron. Getting to
 * page 5 was four clicks and there was no way to see how far along you were
 * except by reading a sentence. BrandHub's `BrandHubDataGridPagination` shows
 * the page NUMBERS with an ellipsis (`1 … 9 10 11 … 20`), prev/next around
 * them, and the page-size selector on the far right reading "Showing 25 of
 * 1,234". A merchant who knows the name they want is on page 3 taps 3.
 *
 * The layout is BrandHub's three-column grid — `grid-cols-[auto_1fr_auto]`,
 * controls in column 1, summary in column 3, middle column left empty — so the
 * two groups stay pinned to the edges however wide the table gets.
 *
 * ── Two deliberate departures ───────────────────────────────────────────────
 * **Touch targets.** BrandHub's page buttons are `h-8 w-8` (32px) and its
 * prev/next are `h-7 w-7` (28px). That is fine for a portal opened on a laptop.
 * This product is used one-handed on a cheap Android by a shopkeeper with a
 * customer waiting, so every control here is 44px (R-A-3). The numbers are the
 * same numbers; the hit areas are not.
 *
 * **The phone tier drops the numbers.** BrandHub has no responsive handling —
 * its bar keeps all three groups and lets the table scroll. Twenty page numbers
 * on a 360px screen either wrap into three rows or push the summary off the
 * edge, so below `full` this falls back to prev/next plus the "page 3 of 12"
 * sentence, which is the one thing that has to survive at every width.
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

/** 44px, square, and the same box whether it holds a chevron or a number. */
const STEP_BUTTON = 'h-11 w-11 p-0';

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
  const showNumbers = tier === 'full' && pages > 1;

  return (
    <div
      data-testid="ub-grid-pagination"
      className={cn(
        'grid w-full grid-cols-[auto_1fr_auto] items-center gap-3',
        'border-t border-border-hairline px-4 py-3',
        className
      )}
    >
      <div className="col-start-1 flex items-center gap-1 justify-self-start">
        <MLButton
          variant="secondary"
          size="md"
          aria-label={labels.previousPage}
          disabled={page.page <= 1}
          onClick={handlePrevious}
          className={STEP_BUTTON}
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </MLButton>

        {showNumbers &&
          buildPageRange(page.page, pages).map((entry, index) =>
            entry === null ? (
              /* The gap is not a control and must not read as one: no button,
                 no hover, and `aria-hidden` so a screen reader hears
                 "1, 9, 10, 11, 20" rather than an ellipsis it cannot act on. */
              <span
                /* Keyed by position on purpose: the two ellipses in a bar are
                   the same element in different places, and there is no id to
                   key on. React never has to reorder them, because the whole
                   range is rebuilt when the page changes. */
                key={`gap-${index}`}
                aria-hidden
                className="ds-caption select-none px-1 text-text-tertiary"
              >
                …
              </span>
            ) : (
              <MLButton
                key={entry}
                variant={entry === page.page ? 'secondary' : 'ghost'}
                size="md"
                aria-label={fillTemplate(labels.goToPage, { page: entry })}
                aria-current={entry === page.page ? 'page' : undefined}
                onClick={() => onPageChange(entry)}
                className={cn(STEP_BUTTON, 'ds-body-sm')}
              >
                {entry}
              </MLButton>
            )
          )}

        <MLButton
          variant="secondary"
          size="md"
          aria-label={labels.nextPage}
          disabled={page.page >= pages}
          onClick={handleNext}
          className={STEP_BUTTON}
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </MLButton>
      </div>

      <div className="col-start-3 flex items-center gap-2 justify-self-end">
        {/* Deliberately the native control, not `UbSelect`: a four-option
            page-size picker inside a toolbar, where the platform picker is
            smaller, needs no portal, and on a phone is the better control
            outright. */}
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

        {/* The sentence is what survives when the numbers do not. It is the
            only thing in this bar that says where you are at 360px wide. */}
        <p className="ds-caption text-text-tertiary">
          {showNumbers
            ? fillTemplate(labels.ofTotal, { total: page.total })
            : fillTemplate(labels.pageOf, { page: page.page, pages })}
        </p>
      </div>
    </div>
  );
}

UbDataGridPaginationBase.displayName = 'UbDataGridPagination';
export const UbDataGridPagination = memo(UbDataGridPaginationBase);
