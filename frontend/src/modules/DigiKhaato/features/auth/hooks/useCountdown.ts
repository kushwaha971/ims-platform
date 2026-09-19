'use client';

import { useSyncExternalStore } from 'react';

import { secondsUntil } from '../view-model/authDisplay';

/**
 * PLT-01 FR-7 / Alternate C — "Resend in {seconds}s", "Try again in {minutes}
 * min", and the 300 s challenge expiry.
 *
 * The slice holds an absolute DEADLINE, not a remaining count (see
 * `authSlice`), so nothing has to be decremented and a tab backgrounded for two
 * minutes comes back with the right number rather than with a paused countdown.
 *
 * WHY `useSyncExternalStore` and not `useState` + `setInterval`: the value this
 * hook needs is the WALL CLOCK, which is an external mutable source. Reading
 * `Date.now()` during render is impure (`react-hooks/purity`) and writing it
 * into state from inside an effect is a cascading render
 * (`react-hooks/set-state-in-effect`). A tiny external store is the shape React
 * provides for exactly this, and it has two further benefits: ONE interval
 * serves every countdown on the screen, and it stops the moment the last one
 * unmounts.
 */

/** The shared second-resolution clock. Read-only to everything but the ticker. */
let nowMs = Date.now();
const listeners = new Set<() => void>();
let timer: number | null = null;

const tick = (): void => {
  nowMs = Date.now();
  listeners.forEach((listener) => listener());
};

const subscribe = (onStoreChange: () => void): (() => void) => {
  listeners.add(onStoreChange);
  if (timer === null && typeof window !== 'undefined') {
    // Resync before the first tick: the module may have been loaded minutes
    // ago, and React re-reads the snapshot after subscribing anyway.
    nowMs = Date.now();
    timer = window.setInterval(tick, 1_000);
  }
  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
};

/** Cached: it changes only on a tick, which is what the store contract needs. */
const getSnapshot = (): number => nowMs;

/** No clock on the server; every deadline is null in a server render anyway. */
const getServerSnapshot = (): number => 0;

export const useCountdown = (deadline: number | null): number => {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return secondsUntil(deadline, now);
};
