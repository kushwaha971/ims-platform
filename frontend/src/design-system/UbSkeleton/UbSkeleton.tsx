'use client';

import { memo } from 'react';

import { MLSkeleton } from 'src/design-system/primitives';
import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.3 — shimmer in the SHAPE of the content, never a full-page
 * spinner, and R-P-6: a skeleton reserves the real height so the page does not
 * jump when the rows land.
 *
 * Widths are FLUID: `w-full` or a fraction, with the length the bar would
 * like to be in `max-w-*`, where it can only make a bar shorter. The card
 * variant drew a fixed 160 px bar (`w-40`) inside a 158 px totals tile on a
 * 360 px phone, and the list scrolled sideways while it loaded (QA D3). A
 * fixed width is kept only for the avatar disc, and capped at `max-w-full`.
 * `UbSkeleton.test.tsx` holds every variant to this.
 */
export type UbSkeletonVariant = 'list' | 'card' | 'form' | 'app' | 'text';

export interface UbSkeletonProps {
  readonly variant?: UbSkeletonVariant;
  /** Rows for `list`, fields for `form`; ignored by the other variants. */
  readonly count?: number;
  readonly label?: string;
  readonly className?: string;
}

const Row = ({ height }: { readonly height: string }) => (
  <div className="flex items-center gap-3 border-b border-border-hairline px-4 py-3">
    <MLSkeleton className="h-10 w-10 max-w-full shrink-0 rounded-pill" />
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <MLSkeleton className={cn('w-1/3', height)} />
      <MLSkeleton className="h-3 w-1/5" />
    </div>
    <MLSkeleton className="h-4 w-1/5 max-w-20" />
  </div>
);

function UbSkeletonBase({
  variant = 'text',
  count = 5,
  label,
  className,
}: Readonly<UbSkeletonProps>) {
  const rows = Array.from({ length: count }, (_, index) => index);

  return (
    // R-A-6 — a loading state is announced, not merely drawn.
    <div role="status" aria-busy aria-label={label} className={cn('w-full', className)}>
      {variant === 'list' && (
        <div className="overflow-hidden rounded-card border border-border-hairline bg-surface-card">
          {rows.map((row) => (
            <Row key={row} height="h-4" />
          ))}
        </div>
      )}
      {variant === 'card' && (
        <div className="flex min-w-0 flex-col gap-3 rounded-card border border-border-hairline bg-surface-card p-5">
          <MLSkeleton className="h-4 w-3/5 max-w-24" />
          <MLSkeleton className="h-8 w-full max-w-40" />
          <MLSkeleton className="h-3 w-4/5 max-w-32" />
        </div>
      )}
      {variant === 'form' && (
        <div className="flex flex-col gap-5">
          {rows.map((row) => (
            <div key={row} className="flex flex-col gap-2">
              <MLSkeleton className="h-3 w-1/2 max-w-24" />
              <MLSkeleton className="h-9 w-full rounded-control" />
            </div>
          ))}
        </div>
      )}
      {variant === 'app' && (
        <div className="flex min-h-[60vh] flex-col gap-4 p-4">
          <MLSkeleton className="h-8 w-3/4 max-w-48" />
          <MLSkeleton className="h-24 w-full rounded-card" />
          <MLSkeleton className="h-64 w-full rounded-card" />
        </div>
      )}
      {variant === 'text' && (
        <div className="flex flex-col gap-2">
          {rows.map((row) => (
            <MLSkeleton key={row} className="h-3 w-full" />
          ))}
        </div>
      )}
    </div>
  );
}

UbSkeletonBase.displayName = 'UbSkeleton';
export const UbSkeleton = memo(UbSkeletonBase);

/** The route-level fallback every `page.tsx` Suspense boundary renders. */
function UbPageSkeletonBase({ variant = 'app', label }: Readonly<UbSkeletonProps>) {
  return <UbSkeleton variant={variant} label={label} />;
}
UbPageSkeletonBase.displayName = 'UbPageSkeleton';
export const UbPageSkeleton = memo(UbPageSkeletonBase);
