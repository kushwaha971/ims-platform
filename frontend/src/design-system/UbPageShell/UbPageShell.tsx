'use client';

import { memo, type ReactNode } from 'react';

import { cn } from 'src/utils/cn';

/**
 * Part 23 §23.3 — the page container every screen sits in: the content max
 * width, the page padding (16 px below `sm`, 32 px above, from the tokens) and
 * the bottom padding that keeps a sticky footer clear of `UbBottomNav`
 * (§19.6.3).
 */
export interface UbPageShellProps {
  readonly header?: ReactNode;
  readonly children: ReactNode;
  /** A sticky action bar — the invoice editor's "Issue" row, a drawer's Save. */
  readonly footer?: ReactNode;
  readonly className?: string;
}

function UbPageShellBase({ header, children, footer, className }: Readonly<UbPageShellProps>) {
  return (
    <div className={cn('flex min-h-full w-full flex-col bg-canvas', className)}>
      {header}
      <main className="mx-auto w-full max-w-content flex-1 px-4 py-6 md:px-page">{children}</main>
      {footer && (
        <div className="sticky bottom-0 z-10 border-t border-border-hairline bg-surface-card px-4 py-3 md:px-page">
          {footer}
        </div>
      )}
      {/* Clears the 64 px bottom nav plus the iOS safe area (§19.6.3). */}
      <div aria-hidden className="h-bottom-nav md:hidden" />
    </div>
  );
}

UbPageShellBase.displayName = 'UbPageShell';
export const UbPageShell = memo(UbPageShellBase);
