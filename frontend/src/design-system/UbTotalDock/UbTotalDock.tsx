'use client';

import { memo, type ReactNode } from 'react';

import { UbBottomBar } from 'src/design-system/UbBottomBar';
import { cn } from 'src/utils/cn';

/**
 * docs/mobile-redesign/04 §6.1 — a form's total and its finishing actions,
 * docked at the bottom of a phone.
 *
 * A bill on a phone was 1,393 px tall with one empty line, and its total and
 * its Save sat at opposite ends of it (audit A14): the merchant added items
 * without seeing what they came to, then scrolled to the header to finish.
 * This keeps both in view, under the thumb, for every document editor.
 *
 * It is furniture at the bottom of the viewport, so it is a `UbBottomBar`
 * (the toast and the nav offset know about it). Callers render it only on the
 * phone layer (`useIsMobileLayer`); a desktop keeps its header actions.
 */
export interface UbTotalDockProps {
  readonly totalLabel: string;
  /** Already formatted, e.g. "₹1,042.00". */
  readonly total: string;
  /** The finishing actions, primary last. */
  readonly children: ReactNode;
  readonly className?: string;
  readonly 'data-testid'?: string;
}

function UbTotalDockBase({
  totalLabel,
  total,
  children,
  className,
  'data-testid': testId,
}: Readonly<UbTotalDockProps>) {
  return (
    <UbBottomBar
      data-testid={testId}
      className={cn(
        '-mx-4 flex items-center gap-3 border-t border-border-hairline bg-surface-card px-4 pt-3',
        'pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]',
        className
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="ds-caption text-text-tertiary">{totalLabel}</span>
        <span className="ds-num truncate text-[20px] font-semibold leading-7 text-text-primary">
          {total}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </UbBottomBar>
  );
}

UbTotalDockBase.displayName = 'UbTotalDock';
export const UbTotalDock = memo(UbTotalDockBase);
