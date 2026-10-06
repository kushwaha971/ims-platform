'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { cn } from 'src/utils/cn';

/**
 * The desktop dropdown's panel: a box under its button, closed by a click
 * outside or Escape, focus returned to the button.
 *
 * Hand-rolled rather than a Radix popover ON PURPOSE. The filter pattern
 * reached screens that had no popover, dialog or calendar in their chunk, and
 * measured, the Radix + floating-ui stack cost /admin/tenants 25 KB and the
 * library lists 35 KB — for a list of five words under a button. A box that
 * does not need collision handling (it opens below a toolbar, aligned to its
 * button, and scrolls with the page) does not need a positioning engine.
 */
export function FilterAnchor({
  open,
  onClose,
  trigger,
  children,
  align = 'start',
  label,
  className,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  trigger: ReactNode;
  children: ReactNode;
  align?: 'start' | 'end';
  label: string;
  className?: string;
}>): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
      root.current?.querySelector<HTMLElement>('button')?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    // The first choice takes focus, so the keyboard starts in the list.
    root.current?.querySelector<HTMLElement>('[role="dialog"] button:not([disabled])')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <div ref={root} className="relative inline-flex max-w-full">
      {trigger}
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className={cn(
            'absolute top-full z-[60] mt-1.5 max-h-[min(28rem,70vh)] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain',
            'rounded-card border border-border-hairline bg-surface-raised shadow-ub-popover',
            align === 'end' ? 'right-0' : 'left-0',
            className
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
