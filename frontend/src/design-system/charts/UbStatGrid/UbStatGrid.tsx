'use client';

import { memo, type ReactNode } from 'react';

import { cn } from 'src/utils/cn';

/**
 * The KPI row: stat tiles, **2-across on a 360 px phone and 3-across from
 * 768 px up**, which is the approved responsive policy.
 *
 * It is a layout, not a chart, and it is here rather than in a feature because
 * the breakpoints are the policy — a screen that lays its own tiles out is a
 * screen that will disagree with the next one.
 */
export interface UbStatGridProps {
  readonly children: ReactNode;
  readonly className?: string;
}

function UbStatGridBase({ children, className }: Readonly<UbStatGridProps>) {
  return (
    <div
      data-testid="ub-stat-grid"
      className={cn('grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4', className)}
    >
      {children}
    </div>
  );
}

UbStatGridBase.displayName = 'UbStatGrid';
export const UbStatGrid = memo(UbStatGridBase);
