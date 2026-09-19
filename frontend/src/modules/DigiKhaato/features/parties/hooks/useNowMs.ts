'use client';

import { useSyncExternalStore } from 'react';

/**
 * "Now", as a value a render may use — and read nowhere near a render.
 *
 * The staleness column is relative ("12 days ago"), so something has to look at
 * the clock. Two rules say it must not be the component: `react-hooks/purity`,
 * because `Date.now()` in render makes the component non-idempotent; and
 * §19.9.4, because a clock read during render gives the memoised column array a
 * fresh key on every pass, which is the single biggest `UbDataGrid` mistake
 * there is.
 *
 * So the clock is an EXTERNAL STORE, which is exactly what it is: a value that
 * changes without React's involvement. `getSnapshot` returns a cached number
 * and is therefore pure; the number is refreshed when a subscriber arrives and
 * once an hour after that, which is enough to carry "Today" over a midnight
 * that happens while the tab sits in the background.
 */
const REFRESH_MS = 60 * 60 * 1000;

let currentMs = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

const notify = (): void => {
  currentMs = Date.now();
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  // Re-anchor on the first subscriber: React re-reads the snapshot straight
  // after `subscribe` returns, so no notification is needed for this one.
  currentMs = Date.now();
  timer ??= setInterval(notify, REFRESH_MS);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
};

const getSnapshot = (): number => currentMs;

export const useNowMs = (): number => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
