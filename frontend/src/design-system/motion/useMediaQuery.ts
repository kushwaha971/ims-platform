'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * A media query as React state, through `useSyncExternalStore` so a change of
 * breakpoint or of the reduced-motion preference re-renders without a
 * tearing frame.
 *
 * The SERVER snapshot is `false`, and that is a decision rather than a
 * default: the server cannot know the viewport, and every caller here uses
 * the answer to decide whether to START something (download a video, run an
 * interval). "Not yet" is the safe reading of "unknown" for all of them.
 */
export const useMediaQuery = (query: string | undefined): boolean => {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!query || typeof window === 'undefined' || !window.matchMedia) return () => undefined;
      const list = window.matchMedia(query);
      list.addEventListener?.('change', onChange);
      return () => list.removeEventListener?.('change', onChange);
    },
    [query]
  );
  const read = useCallback(
    () =>
      !!query && typeof window !== 'undefined' && !!window.matchMedia
        ? window.matchMedia(query).matches
        : false,
    [query]
  );
  return useSyncExternalStore(subscribe, read, () => false);
};

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** True when the person asked the OS for less motion (WCAG 2.3.3). */
export const usePrefersReducedMotion = (): boolean => useMediaQuery(REDUCED_MOTION_QUERY);

/**
 * Read a query right now, outside React. For the moment a caller must decide
 * BEFORE it commits to anything — `UbVideo` picks its device variant this way
 * before a single `<source>` exists, so only one variant is ever requested.
 */
export const matchesNow = (query: string | undefined): boolean =>
  !query || (typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches);
