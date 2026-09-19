'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * CR-2026-09-19-G — WHO OWNS THE BOTTOM OF THE VIEWPORT.
 *
 * The global snackbar is `position: fixed` at the bottom of the viewport. Two
 * archetypes already put something there and the toast was landing on top of
 * both: the onboarding wizard's sticky Continue bar (the primary action of the
 * screen, behind an error message) and the `(auth)` page footer (the legal
 * links and the language picker — the one control a merchant who cannot read
 * English needs). It was never a z-index bug: the toast is correctly above.
 * The anchor simply assumed nothing else was down there.
 *
 * The fix is one number, published once and read everywhere:
 * `--ub-bottom-inset` on `:root`, defaulting to `0px`
 * (src/styles/tokens/primitives.css), which the toast adds to its `bottom`
 * alongside `env(safe-area-inset-bottom)` via the `--ub-toast-bottom` token.
 *
 * ── WHY THE ROOT, AND NOT THE BAR ───────────────────────────────────────────
 * The obvious spelling — the sticky bar sets `--ub-bottom-inset` on itself in
 * CSS — cannot work: a custom property inherits DOWN, and the toast is a
 * SIBLING of the page (`SnackbarHost` is mounted in `AppProviders`), not a
 * descendant of the bar. `:root:has([data-ub-bottom-bar])` reaches the toast,
 * but it cannot carry the bar's height with it, which would put us back to a
 * number hard-coded per screen. So the bar measures itself and writes the
 * value onto the document element, which is the one node both it and the toast
 * inherit from.
 *
 * ── WHAT IS MEASURED ────────────────────────────────────────────────────────
 * Not the bar's height — how much of the BOTTOM OF THE VIEWPORT the bar
 * occupies right now:
 *
 *     occupancy = clamp(innerHeight − rect.top, 0, rect.height)
 *
 * For a `sticky bottom-0` action bar that is exactly its height, always. For
 * the auth footer — which is not sticky; it sits at the end of a `min-h-dvh`
 * column — it is its height when the merchant is looking at it and `0` when it
 * is below the fold, which is the honest answer: there is nothing to clear
 * when there is nothing on screen. Reserving the footer's height
 * unconditionally would float the toast in the middle of a scrolled page.
 *
 * ── SEVERAL BARS AT ONCE ────────────────────────────────────────────────────
 * The onboarding wizard renders BOTH a sticky action bar and the auth footer,
 * and a phone will one day render `UbBottomNav` under an entry form's action
 * bar. The registry keeps every mounted bar's occupancy and publishes the
 * MAXIMUM, because the furniture stacks against the same edge — summing would
 * double-count two bars that overlap, and taking the last one to mount would
 * depend on render order.
 */

/** The property the toast reads. Exported so the test names it once. */
export const UB_BOTTOM_INSET_PROPERTY = '--ub-bottom-inset';

/** Every mounted bar's current occupancy, in CSS pixels. */
const occupancy = new Map<Element, number>();

let frame = 0;

function flush(): void {
  frame = 0;
  const root = document.documentElement;
  let highest = 0;
  occupancy.forEach((value) => {
    if (value > highest) highest = value;
  });

  // Removing the property rather than writing `0px` lets the stylesheet's own
  // default show through, so there is exactly one place the default lives.
  if (highest > 0) root.style.setProperty(UB_BOTTOM_INSET_PROPERTY, `${Math.round(highest)}px`);
  else root.style.removeProperty(UB_BOTTOM_INSET_PROPERTY);
}

/**
 * Coalesced to one write per frame: `scroll` fires far more often than the
 * value changes, and the toast only needs to be right by the next paint.
 * `requestAnimationFrame` is absent in jsdom's older shims, so it falls back to
 * writing straight through — the tests then observe the property synchronously.
 */
function schedule(): void {
  if (typeof requestAnimationFrame !== 'function') {
    flush();
    return;
  }
  if (frame !== 0) return;
  frame = requestAnimationFrame(flush);
}

function occupancyOf(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  const viewport = window.innerHeight || document.documentElement.clientHeight || 0;
  return Math.min(Math.max(viewport - rect.top, 0), rect.height);
}

/**
 * Publishes the referenced element's share of the bottom of the viewport as
 * `--ub-bottom-inset`, for as long as it is mounted.
 *
 * Attach the returned ref to the furniture itself, not to a wrapper — the
 * wrapper's box is not the box the toast has to clear. `UbBottomBar` does this
 * for you and is what feature code should use.
 */
export function useBottomInset<E extends HTMLElement = HTMLElement>(
  enabled = true
): RefObject<E | null> {
  const ref = useRef<E | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return undefined;

    const measure = (): void => {
      occupancy.set(element, occupancyOf(element));
      schedule();
    };

    measure();

    // The bar's own size changes with the viewport (the auth footer is a row
    // from `sm` and a stack below it) and with its content (a busy label is
    // wider, a wrapped legal notice is taller).
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(() => measure()) : null;
    observer?.observe(element);

    // `capture` because the scroller is not always the window: the onboarding
    // form half is its own `overflow-y-auto` container from `lg`, and a scroll
    // event there does not bubble to `window`.
    document.addEventListener('scroll', measure, { capture: true, passive: true });
    window.addEventListener('resize', measure, { passive: true });

    return () => {
      observer?.disconnect();
      document.removeEventListener('scroll', measure, { capture: true });
      window.removeEventListener('resize', measure);
      occupancy.delete(element);
      schedule();
    };
  }, [enabled]);

  return ref;
}

/** Test seam: forget every registered bar. Never called by application code. */
export function __resetBottomInset(): void {
  occupancy.clear();
  if (typeof document !== 'undefined') flush();
}
