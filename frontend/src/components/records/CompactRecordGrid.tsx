'use client';

import { UbDataGrid, type UbDataGridProps } from 'src/design-system/UbDataGrid';
import { cn } from 'src/utils/cn';

/** Keep the existing server paging and empty/error states, using compact record cards. */
export function CompactRecordGrid<TRow>(props: Readonly<UbDataGridProps<TRow>>): React.JSX.Element {
  return (
    <UbDataGrid
      {...props}
      tier="cards"
      className={cn(
        'rounded-none border-0',
        '[&_[data-testid=ub-grid-cards]]:grid [&_[data-testid=ub-grid-cards]]:grid-cols-1 [&_[data-testid=ub-grid-cards]]:gap-3 sm:[&_[data-testid=ub-grid-cards]]:grid-cols-2 xl:[&_[data-testid=ub-grid-cards]]:grid-cols-3',
        '[&_[data-testid=ub-grid-card]:last-child]:border-b [&_[data-testid=ub-grid-card]]:rounded-card [&_[data-testid=ub-grid-card]]:border [&_[data-testid=ub-grid-card]]:border-border-hairline [&_[data-testid=ub-grid-card]]:bg-surface-card [&_[data-testid=ub-grid-card]]:shadow-1',
        '[&_[data-testid=ub-grid-card]>button]:min-h-11 [&_[data-testid=ub-grid-card]>button]:px-3 [&_[data-testid=ub-grid-card]>button]:py-2.5 [&_[data-testid=ub-grid-card]>div]:min-h-11 [&_[data-testid=ub-grid-card]>div]:p-3',
        '[&_[data-testid=ub-grid-card]_.truncate]:whitespace-normal',
        props.page.totalPages === 1 && '[&_[data-testid=ub-grid-pagination]]:hidden',
        props.className
      )}
    />
  );
}
