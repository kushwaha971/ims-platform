'use client';

import { useCallback, useSyncExternalStore } from 'react';

import type { UbGridTier } from './types';

/**
 * The breakpoints of `tailwind.config.js`, restated once. They are read by
 * `matchMedia` rather than by a `hidden md:block` pair for one reason that
 * matters and one that follows from it:
 *
 *  · **The table is not rendered on a phone.** Part 19 §19.9.2 makes
 *    `@tanstack/react-table` a table-tier cost; a CSS toggle would build the
 *    row model, the header groups and the selection state on a 360 px screen
 *    and then set `display: none` on the result.
 *  · A tier is then a VALUE, which means the three renderings can be tested
 *    deterministically instead of by asserting on class names.
 *
 * `useSyncExternalStore` rather than `useState` + an effect: the subscription
 * is established in the layout phase, so the desktop tier is applied in the
 * hydration commit and there is no flash of the card rendering before paint.
 * The server snapshot is `cards`, which is the mobile-first default (R-S-6) and
 * the correct guess for the primary user.
 */
export const MD_QUERY = '(min-width: 768px)';
export const LG_QUERY = '(min-width: 1024px)';

const SERVER_TIER: UbGridTier = 'cards';

const listFor = (query: string): MediaQueryList | null => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(query);
};

const subscribeBoth = (onChange: () => void): (() => void) => {
  const lists = [listFor(MD_QUERY), listFor(LG_QUERY)];
  const attached = lists.filter((list): list is MediaQueryList => list !== null);
  attached.forEach((list) => list.addEventListener('change', onChange));
  return () => attached.forEach((list) => list.removeEventListener('change', onChange));
};

const readTier = (): UbGridTier => {
  const lg = listFor(LG_QUERY);
  if (lg?.matches) return 'full';
  const md = listFor(MD_QUERY);
  if (md?.matches) return 'compact';
  return 'cards';
};

/**
 * `forced` exists for the design-system gallery and for tests, which need to
 * paint all three renderings on one viewport. Nothing else passes it.
 */
export const useGridTier = (forced?: UbGridTier): UbGridTier => {
  const subscribe = useCallback(
    (onChange: () => void) => (forced ? () => undefined : subscribeBoth(onChange)),
    [forced]
  );
  const snapshot = useCallback(() => forced ?? readTier(), [forced]);
  const server = useCallback(() => forced ?? SERVER_TIER, [forced]);

  return useSyncExternalStore(subscribe, snapshot, server);
};
