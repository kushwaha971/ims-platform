'use client';

import { useEffect, useState, type RefObject } from 'react';

/**
 * One IntersectionObserver per `rootMargin`, shared by every element that asks
 * with that margin — a landing page with thirty reveals and a dozen videos
 * holds two or three observers, not forty.
 *
 * Where the API does not exist (jsdom, a very old browser) the element counts
 * as visible: the things that listen — a reveal, a video — must show content
 * rather than wait for an event that will never come.
 */
type Listener = (entry: IntersectionObserverEntry) => void;

interface Pool {
  readonly observer: IntersectionObserver;
  readonly listeners: Map<Element, Set<Listener>>;
}

const pools = new Map<string, Pool>();

const poolFor = (rootMargin: string): Pool => {
  const existing = pools.get(rootMargin);
  if (existing) return existing;
  const listeners = new Map<Element, Set<Listener>>();
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => listeners.get(entry.target)?.forEach((listen) => listen(entry)));
    },
    { rootMargin }
  );
  const pool = { observer, listeners };
  pools.set(rootMargin, pool);
  return pool;
};

export const canObserve = (): boolean =>
  typeof window !== 'undefined' && typeof window.IntersectionObserver === 'function';

/** Subscribe `listen` to `element`'s intersections; returns the unsubscribe. */
export const observeIntersection = (
  element: Element,
  rootMargin: string,
  listen: Listener
): (() => void) => {
  const pool = poolFor(rootMargin);
  const set = pool.listeners.get(element) ?? new Set<Listener>();
  if (set.size === 0) {
    pool.listeners.set(element, set);
    pool.observer.observe(element);
  }
  set.add(listen);
  return () => {
    set.delete(listen);
    if (set.size > 0) return;
    pool.listeners.delete(element);
    pool.observer.unobserve(element);
  };
};

/** Test seam: the pool is module state, and a test that swaps the observer needs it empty. */
export const __resetIntersectionPools = (): void => {
  pools.forEach((pool) => pool.observer.disconnect());
  pools.clear();
};

export interface UseInViewOptions {
  /** Grows the viewport for the test: `'200px'` means "within 200 px of it". */
  readonly rootMargin?: string;
  /** Stop observing after the first time it is in view (reveals). */
  readonly once?: boolean;
  /** False skips observing entirely and reports `false`. */
  readonly enabled?: boolean;
}

/**
 * Whether `ref`'s element is within the (margin-grown) viewport. `false` on the
 * server and on the first client render, so nothing starts before hydration.
 */
export const useInView = <T extends Element>(
  ref: RefObject<T | null>,
  { rootMargin = '0px', once = false, enabled = true }: UseInViewOptions = {}
): boolean => {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return undefined;
    if (!canObserve()) return undefined;
    let stop: (() => void) | null = null;
    stop = observeIntersection(element, rootMargin, (entry) => {
      setInView(entry.isIntersecting);
      if (once && entry.isIntersecting) {
        stop?.();
        stop = null;
      }
    });
    return () => stop?.();
  }, [ref, rootMargin, once, enabled]);

  // No IntersectionObserver in this browser: everything counts as visible.
  // `false` on the server, where `window` does not exist either.
  const unsupported = typeof window !== 'undefined' && !canObserve();
  return enabled && (inView || unsupported);
};
