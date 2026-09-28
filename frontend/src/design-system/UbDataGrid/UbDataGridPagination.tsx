'use client';

import { memo, useCallback, useId } from 'react';

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

/**
 * 44px, square, and the same box whether it holds a chevron or a number.
 *
 * The 44 is the TAP TARGET and is not negotiable (R-A-3). What sits inside it
 * is BrandHub's 32px box — `STEP_FACE` below — so the control looks like
 * BrandHub's and is still reachable with a thumb. Making the button itself 32px
 * would have matched the screenshot and lost a merchant a tap in the shop; the
 * two requirements only look like they conflict.
 */
const STEP_BUTTON = 'h-11 w-11 p-0';

/** BrandHub's `TablePaginationPage`: 32px square, 8px radius, 12/16 type. */
const STEP_FACE = 'flex h-8 w-8 items-center justify-center rounded-control';

/**
 * BrandHub's `TablePaginationButton` is a bare glyph — `text-[#7f7d83]
 * hover:text-foreground`, no border — and its inactive page numbers are the
 * same muted grey, with only the CURRENT page getting a hairline box.
 *
 * These were `variant="secondary"` (a bordered box) and `variant="ghost"`
 * (which is `--text-accent` indigo), so a row of ten page numbers rendered as
 * ten indigo links with one boxed. The point of the control is that one of them
 * is current and the rest are not.
 */
const STEP_QUIET = 'text-text-tertiary hover:text-text-primary';
const STEP_CURRENT = 'border border-border-hairline bg-surface-card text-text-primary';

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

  const sizeId = useId();
  const pages = Math.max(page.totalPages, 1);
  const showSizes = tier === 'full' && !!onPageSizeChange && !!pageSizeOptions?.length;
  const showNumbers = tier === 'full' && pages > 1;

  return (
    <div
      data-testid="ub-grid-pagination"
      className={cn(
        'grid w-full grid-cols-[auto_1fr_auto] items-center gap-3',
        'border-t border-border-hairline p-4',
        className
      )}
    >
      <div className="col-start-1 flex items-center gap-1 justify-self-start">
        <MLButton
          variant="ghost"
          size="md"
          aria-label={labels.previousPage}
          disabled={page.page <= 1}
          onClick={handlePrevious}
          className={cn(STEP_BUTTON, STEP_QUIET)}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
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
                variant="ghost"
                size="md"
                aria-label={fillTemplate(labels.goToPage, { page: entry })}
                aria-current={entry === page.page ? 'page' : undefined}
                onClick={() => onPageChange(entry)}
                className={cn(STEP_BUTTON, entry === page.page ? '' : STEP_QUIET)}
              >
                <span
                  className={cn(
                    STEP_FACE,
                    'ds-chip tabular-nums',
                    entry === page.page && STEP_CURRENT
                  )}
                >
                  {entry}
                </span>
              </MLButton>
            )
          )}

        <MLButton
          variant="ghost"
          size="md"
          aria-label={labels.nextPage}
          disabled={page.page >= pages}
          onClick={handleNext}
          className={cn(STEP_BUTTON, STEP_QUIET)}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </MLButton>
      </div>

      <div className="col-start-3 flex items-center gap-2 justify-self-end">
        {/* BrandHub reads "Showing [25] of 1,234" — a label, the control, and
            the total, in that order. It had been a bare select with nothing
            saying what the number meant, and the total only appeared when there
            was more than one page, so a merchant with 4 customers could not see
            that there were 4. */}
        {showSizes && (
          <label className="ds-caption text-text-tertiary" htmlFor={sizeId}>
            {labels.showing}
          </label>
        )}

        {/* Deliberately the native control, not `UbSelect`: a four-option
            page-size picker inside a toolbar, where the platform picker is
            smaller, needs no portal, and on a phone is the better control
            outright. */}
        {showSizes && (
          <MLNativeSelect
            id={sizeId}
            aria-label={labels.pageSize}
            value={String(page.pageSize)}
            onChange={(event) => handleSize(event.target.value)}
            /**
             * BrandHub's exact box: `h-8 w-[72px]` with 12/16 type. It was
             * `h-11 w-24` with 14px type, which made a two-character control
             * the heaviest thing in the bar — taller than the page numbers
             * beside it, half again as wide as it needed to be, and set in
             * larger type than the "Showing" and "of 30" it sits between.
             *
             * Dropping to 32 px is allowed HERE and nowhere else in this bar.
             * R-A-3 requires 44 px targets ON MOBILE, and `showSizes` is
             * `tier === 'full'` — this control does not exist below 1024 px,
             * where the merchant's phone gets the card rendering and changes
             * page size not at all. The page numbers next to it keep their
             * 44 px targets because they DO render on a tablet. If this
             * selector is ever shown below `full`, it goes back to `h-11`;
             * the test below in `UbDataGrid.test.tsx` guards the tier.
             */
            className="ds-body-base-regular h-10 w-[76px] px-3"
          >
            {pageSizeOptions?.map((size) => (
              <option key={size} value={String(size)}>
                {size}
              </option>
            ))}
          </MLNativeSelect>
        )}

        {/* The sentence is what survives when the control does not. It is the
            only thing in this bar that says where you are at 360px wide. */}
        <p className="ds-caption text-text-tertiary">
          {showSizes
            ? fillTemplate(labels.ofTotal, { total: page.total })
            : fillTemplate(labels.pageOf, { page: page.page, pages })}
        </p>
      </div>
    </div>
  );
}

UbDataGridPaginationBase.displayName = 'UbDataGridPagination';
export const UbDataGridPagination = memo(UbDataGridPaginationBase);
