'use client';

import { useEffect } from 'react';

import { usePathname } from 'next/navigation';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { selectNetworkState } from 'src/redux/slice/networkSlice';
import { ROUTES } from 'src/routes';

import { selectPartyFilters } from 'modules/DigiKhaato/features/parties/redux/partyListSlice';
import { warmPartyList } from 'modules/DigiKhaato/features/parties/redux/partyListWarmup';

/**
 * Part 19 §19.9.1 — the one thing that is allowed to happen ABOVE
 * `RequireSession`, and it paints nothing.
 *
 * `app/(app)/layout.tsx` gates its children on the session, correctly: a
 * signed-out visitor must never see a flash of the app. But the guard was
 * gating the DATA as well as the paint, so `GET /parties` could not start until
 * `GET /auth/me` had finished — two serial round trips, measured at roughly
 * **3.3 s to the first party row** against §19.9.1's P75 budget of 1.2 s.
 *
 * This component renders `null`. Its whole job is to run one effect in the same
 * commit as `SessionBootstrap`'s, so the screen's own request leaves the device
 * alongside the session's instead of queueing behind it. `usePartyList` then
 * CLAIMS that request when the screen finally mounts, so there is exactly one
 * GET either way — see `partyListWarmup.ts` for why a claim rather than a race.
 *
 * ── Why a table, and why it lives here ──────────────────────────────────────
 *
 * A screen cannot warm itself: by definition it has not mounted yet. Something
 * above the guard has to know what this path will ask for, and `(app)/layout`
 * is the only thing above the guard. Keeping it as one table means the
 * knowledge is in one place and adding a screen is one line, rather than each
 * feature growing its own hook that runs at a different moment.
 *
 * ── What must NOT go in this table ──────────────────────────────────────────
 *
 *  · Anything that WRITES. This runs before the session is confirmed.
 *  · Anything whose parameters come from the URL or from user input — the
 *    warm-up reads the slice's committed filters, which on a cold load are the
 *    defaults, and a guess that misses is a wasted request, not a fast one.
 *  · A second fetch for a screen that already has one. One request per screen
 *    is the point; this is not a prefetcher.
 *  · Anything on a route the merchant is merely passing through.
 *
 * ── It does nothing on a degraded connection ────────────────────────────────
 *
 * §19.10.3's network state is a REDUCTION signal here and not just a badge: a
 * speculative request is the first thing to give up when the link is already
 * failing, because on an impaired connection it competes with the session fetch
 * that the screen actually cannot proceed without. `usePartyList` then issues
 * the request itself, exactly as it did before — one round trip later, which is
 * the correct trade when the pipe is the scarce thing.
 */
export function AppRouteWarmup(): null {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const filters = useAppSelector(selectPartyFilters);
  const networkState = useAppSelector(selectNetworkState);
  const canSpeculate = networkState === 'online';

  useEffect(() => {
    if (!canSpeculate) return;
    if (pathname === ROUTES.PARTIES) {
      warmPartyList(dispatch, { params: filters, mode: 'replace' });
    }
    // `filters` is deliberately NOT a dependency: this warms the FIRST request
    // for a screen and then gets out of the way. Every later filter change is
    // `usePartyList`'s own effect, which owns the abort.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, pathname, canSpeculate]);

  return null;
}
