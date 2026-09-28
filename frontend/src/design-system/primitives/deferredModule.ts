'use client';

import { useEffect, useState } from 'react';

/**
 * W4-P (28 Sep 2026) — a piece of a component that is not needed for its FIRST
 * PAINT, fetched right after it instead.
 *
 * Written for the two comboboxes. Their trigger is what a screen paints; the
 * search list behind it (cmdk, ~5 KB gz with its items) appears only when the
 * merchant opens one, yet it sat in the first-load chunk of every screen with a
 * combobox on it — the bill editors, the item list's filters, the stock
 * summary, the onboarding business step.
 *
 * Why not `React.lazy`: a lazy component SUSPENDS on its first render even
 * when its chunk has long since arrived (a promise's resolution cannot be read
 * synchronously), so the first open of every combobox would mount a fallback
 * and Radix's focus scope would focus the fallback rather than the search box
 * — and the bill editor is keyboard-first, a barcode scanner typing into it
 * faster than a person can. Here the module is fetched when the component
 * MOUNTS, held in a module-level slot, and read synchronously on open: in
 * practice it is always there, and the popover behaves exactly as before. The
 * rare open that beats the chunk renders the caller's fallback and swaps in
 * the panel when it lands (the panels focus their own input on mount for that
 * case).
 */
export interface DeferredModule<T> {
  /** The module, if it has arrived. */
  readonly get: () => T | null;
  /** Fetches it once; every later call returns the same promise. */
  readonly load: () => Promise<T>;
}

export const deferredModule = <T>(loader: () => Promise<T>): DeferredModule<T> => {
  let value: T | null = null;
  let pending: Promise<T> | null = null;
  return {
    get: () => value,
    load: () => {
      pending ??= loader().then(
        (loaded) => {
          value = loaded;
          return loaded;
        },
        (error: unknown) => {
          pending = null; // the next call retries
          throw error;
        }
      );
      return pending;
    },
  };
};

/**
 * Starts the fetch after first paint and returns the module once it is here.
 * Re-renders only when `needed` (the popover is open) and the module was not
 * yet there — the only case in which the caller is showing a fallback.
 */
export const useDeferredModule = <T>(module: DeferredModule<T>, needed: boolean): T | null => {
  const [, setArrivals] = useState(0);

  useEffect(() => {
    // Swallowed: a failed chunk is retried on the next open, below.
    module.load().catch(() => undefined);
  }, [module]);

  useEffect(() => {
    if (!needed || module.get()) return undefined;
    let live = true;
    module.load().then(
      () => {
        if (live) setArrivals((count) => count + 1);
      },
      () => undefined
    );
    return () => {
      live = false;
    };
  }, [module, needed]);

  return module.get();
};
