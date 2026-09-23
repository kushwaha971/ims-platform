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
 * ── CR-2026-09-19-G: WHERE THE VIEWPORT IS ANCHORED ─────────────────────────
 * It was `bottom-20` on a phone and `md:bottom-6` above, and it sat on top of
 * whatever was already at the bottom of the page — the onboarding wizard's
 * sticky Continue bar, and the `(auth)` footer's legal links and language
 * picker. `bottom-20` was itself a hard-coded guess at the height of a
 * `UbBottomNav` that does not exist yet, which is the shape of the bug: a
 * number per screen, in the toast.
 *
 * It is now `bottom-toast`, which resolves to
 *
 *     calc(var(--ub-bottom-inset) + env(safe-area-inset-bottom, 0px) + gap)
 *
 * `--ub-bottom-inset` is published by `UbBottomBar` (see
 * src/hooks/useBottomInset.ts) and is `0px` on a screen with nothing at the
 * bottom, so the toast keeps its safe-area clearance on a phone and clears the
 * furniture everywhere else. The gap is 16 px, 24 px from `md`.
 *
 * ── AND WHY IT IS STILL CENTRED AT 1280 ─────────────────────────────────────
 * The review asked whether the toast should move to bottom-RIGHT from `md`,
 * where there is room beside the content column. It should not, and the reason
 * is in this codebase rather than in taste: from `sm` up, this product
 * right-aligns the primary action of every sticky bottom bar
 * (`OnboardingStepActions` is `sm:justify-end`, `UbPageShell`'s footer row is
 * the same). Bottom-right at `md` would park the toast — and its dismiss
 * button — directly above Continue / Save at exactly the widths where the
 * corner was supposed to be the empty one, trading an overlap for a mis-tap
 * next to the primary action. Centred keeps it over the content column it is
 * talking about (`max-w-[420px]`, against a `measure` page or a 400–560 px form),
 * which is also where the eye already is after a submit. The anchor is the
 * same at every width; only the inset changes, and that is the property the
 * next screen inherits.
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
        // BrandHub CustomerSnackbar: fixed, 25 px from the top, centred.
        'pointer-events-none fixed inset-x-0 top-[25px] z-[2000] px-4',
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

/** ml-uikit `MLAlert` variants, as BrandHub's snackbar renders them: an
 *  outlined card whose border AND text take the tone. */
const TOAST_VARIANT: Record<MLToastVariant, string> = {
  info: 'border-info text-info',
  success: 'border-success text-success',
  warning: 'border-warning text-warning',
  error: 'border-error text-error',
};

export const MLToast = forwardRef<HTMLDivElement, MLToastProps>(function MLToast(
  { variant = 'info', className, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        'pointer-events-auto flex w-full max-w-[420px] items-start gap-3 rounded-md border bg-surface-card px-3 py-3',
        'ds-fixed-base-regular shadow-[0px_2px_4px_-2px_rgba(19,25,39,0.12),0px_4px_4px_-2px_rgba(19,25,39,0.08)]',
        'animate-fade-in',
        TOAST_VARIANT[variant],
        className
      )}
      {...rest}
    />
  );
});
