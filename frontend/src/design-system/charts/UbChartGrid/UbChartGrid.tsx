'use client';

import { memo, type ReactNode } from 'react';

import { cn } from 'src/utils/cn';

/**
 * The approved chart layout, as a component rather than as a paragraph a
 * screen author has to remember.
 *
 * | Width | Charts |
 * |---|---|
 * | 360 | **One** — aging only |
 * | 768 | Two — aging and trend |
 * | >= 1024 | All three on a 12-column grid: aging 6, trend 6, debtors 12 beneath |
 *
 * The phone gets one chart on purpose. Aging answers "who do I chase today",
 * which is the question a shopkeeper opens this app to ask; a thirty-point
 * trend line at 360 px is four pixels per day and answers nothing. The other
 * two are hidden by CSS rather than unmounted, so a rotation or a resize never
 * costs a refetch or a layout jump.
 */
export interface UbChartGridProps {
  /** Receivables aging. The only chart a 360 px screen shows. */
  readonly aging: ReactNode;
  /** Collections over time. From 768 px up. */
  readonly trend?: ReactNode;
  /** Who owes most. From 1024 px up, full width beneath the other two. */
  readonly debtors?: ReactNode;
  readonly className?: string;
}

function UbChartGridBase({ aging, trend, debtors, className }: Readonly<UbChartGridProps>) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 lg:grid-cols-12', className)}>
      <div className="lg:col-span-6">{aging}</div>
      {trend && <div className="hidden md:block lg:col-span-6">{trend}</div>}
      {debtors && <div className="hidden lg:col-span-12 lg:block">{debtors}</div>}
    </div>
  );
}

UbChartGridBase.displayName = 'UbChartGrid';
export const UbChartGrid = memo(UbChartGridBase);
