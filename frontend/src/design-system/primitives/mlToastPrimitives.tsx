'use client';

/* =============================================================================
 * ⚠️  STAND-IN FOR `ml-uikit` — see ./index.ts for the swap instructions.
 * =============================================================================
 *
 * The toast primitives. `MLToaster` used to live in ./mlPrimitives.tsx as a
 * single `aria-live="polite"` region; it moved here, next to the `MLToast` item
 * it hosts, when CR-2026-09-19-E made the snackbar the application's only
 * failure channel.
 *
 * The real ml-uikit toaster is sonner. The two things the stand-in reproduces
 * are the two the channel cannot work without:
 *
 *  1. **Two permanently-mounted live regions, not one.** An error must be
 *     announced `assertive` and a success `polite` (R-A-7), and flipping
 *     `aria-live` on one region — or mounting the region together with its
 *     content — is unreliable across screen readers. Both regions therefore
 *     exist from first paint and the message is placed into whichever one
 *     matches its severity.
 *  2. **Pointer events.** The viewport is `pointer-events-none` so it never
 *     eats a click on the page beneath it; the toast itself turns them back on
 *     so its dismiss button and action are reachable by mouse and by keyboard.
 *
 * As with every stand-in: the token-backed classes, the ARIA and the keyboard
 * behaviour, and nothing else. Product behaviour belongs in `UbSnackbar`.
 */

import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from 'src/utils/cn';

export type MLToastPoliteness = 'polite' | 'assertive';

export interface MLToasterProps extends HTMLAttributes<HTMLDivElement> {
  /** Which live region the children are announced from. */
  readonly politeness?: MLToastPoliteness;
  readonly className?: string;
  readonly children?: ReactNode;
}

export const MLToaster = forwardRef<HTMLDivElement, MLToasterProps>(function MLToaster(
  { politeness = 'polite', className, children, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-20 z-50 px-4 md:bottom-6',
        className
      )}
      {...rest}
    >
      {/* Both regions are always in the DOM; only their contents change. They
          carry the layout themselves rather than `display: contents`, which has
          a long history of dropping an element's role out of the accessibility
          tree — the one thing a live region cannot afford. Empty, they are
          zero-height and invisible. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="flex flex-col items-center gap-2"
      >
        {politeness === 'polite' ? children : null}
      </div>
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="flex flex-col items-center gap-2"
      >
        {politeness === 'assertive' ? children : null}
      </div>
    </div>
  );
});

export type MLToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface MLToastProps extends HTMLAttributes<HTMLDivElement> {
  readonly variant?: MLToastVariant;
  readonly className?: string;
}

const TOAST_VARIANT: Record<MLToastVariant, string> = {
  info: 'border-info/40',
  success: 'border-success/40',
  warning: 'border-warning/40',
  // §23.5: an outlined block, never a filled red one.
  error: 'border-formError',
};

export const MLToast = forwardRef<HTMLDivElement, MLToastProps>(function MLToast(
  { variant = 'info', className, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-md border bg-surface-raised p-4 shadow-3',
        'animate-fade-in',
        TOAST_VARIANT[variant],
        className
      )}
      {...rest}
    />
  );
});
