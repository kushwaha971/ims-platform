'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { API_BASE_URL } from 'src/constants';
import {
  browserCameOnline,
  browserWentOffline,
  canWriteIn,
  probeFailed,
  probeSucceeded,
  selectFailedProbes,
  selectLastOnlineAt,
  selectNetworkImpaired,
  selectNetworkState,
  selectPendingWrites,
  netProbeSpacingMs,
  type TNetworkState,
} from 'src/redux/slice/networkSlice';
import type { TWriteClass } from 'src/types/api.types';

import { useAppDispatch, useAppSelector } from './useAppStore';

/**
 * Part 19 §19.10.3 — the ONE module allowed to read `navigator.onLine`, and the
 * only implementation of the three-state network model. A lint rule fails any
 * other reference to it, because `navigator.onLine === true` is not evidence of
 * connectivity and a second implementation is how the Save button ends up with
 * two behaviours.
 *
 * The state lives in `networkSlice` so the shell strip, the write affordances,
 * the retry policy and the outbox all read one truth; this hook is a typed
 * selector over it plus the probe effect, mounted ONCE in the app shell.
 */
export interface TDegradedNetwork {
  readonly state: TNetworkState;
  /** True in degraded and offline — the one predicate features should read. */
  readonly isImpaired: boolean;
  /** May this write class be attempted right now? (§19.10.4) */
  readonly canWrite: (writeClass: TWriteClass) => boolean;
  /** Entries sitting in the outbox for this tenant. */
  readonly pendingWrites: number;
  readonly lastOnlineAt: string | null;
}

/** ±20 % jitter, so a shopful of devices does not probe in lockstep. */
const jitter = (baseMs: number): number => baseMs * (0.8 + Math.random() * 0.4);

/**
 * `GET /system/health`, unauthenticated, no store, 3 s ceiling. Run only in
 * `degraded` and `offline`, never in `online`, and never while the tab is
 * hidden — a probe on a backgrounded tab costs battery and proves nothing.
 */
const probe = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/system/health`, {
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
};

export function useDegradedNetwork(options?: { readonly withProbe?: boolean }): TDegradedNetwork {
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectNetworkState);
  const isImpaired = useAppSelector(selectNetworkImpaired);
  const pendingWrites = useAppSelector(selectPendingWrites);
  const failedProbes = useAppSelector(selectFailedProbes);
  const lastOnlineAt = useAppSelector(selectLastOnlineAt);
  const withProbe = options?.withProbe ?? false;

  // Signal 4 — browser events. `offline` is trusted; `online` is only a hint.
  useEffect(() => {
    if (!withProbe || typeof window === 'undefined') return undefined;
    const onOffline = (): void => {
      dispatch(browserWentOffline());
    };
    const onOnline = (): void => {
      dispatch(browserCameOnline());
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    // The initial read is the one place navigator.onLine is consulted at all.
    if (!navigator.onLine) dispatch(browserWentOffline());
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [dispatch, withProbe]);

  // Signal 5 — spaced probes while impaired. The first three failures are at
  // the base spacing, so §19.10.3's "roughly 35 s of honest evidence before the
  // word offline appears" still holds exactly; after that the wait doubles to a
  // two-minute ceiling. `netProbeSpacingMs` carries the whole policy and the
  // reasoning; this effect only holds the timer.
  //
  // Two things were wrong with the timer itself and both are fixed here:
  //
  //  · **A hidden tab used to stop probing for good.** The callback returned
  //    early when `visibilityState === 'hidden'` and nothing re-armed it, and
  //    the effect's dependencies cannot change without a probe result — so a
  //    merchant who put the phone in their pocket while degraded came back to a
  //    network model that had quietly stopped looking. It now re-arms on
  //    `visibilitychange`, which is also the cheapest possible moment to probe:
  //    the merchant is looking at the screen again.
  //  · **`pendingWrites` was a dependency**, so every change to the outbox
  //    depth cancelled the pending timer and started the wait again — on a bad
  //    link, which is when writes queue, that could postpone the probe
  //    indefinitely. The probe does not read it.
  useEffect(() => {
    if (!withProbe || state === 'online' || typeof window === 'undefined') return undefined;

    let cancelled = false;
    let timer = 0;

    const arm = (): void => {
      window.clearTimeout(timer);
      if (cancelled || document.visibilityState === 'hidden') return;
      timer = window.setTimeout(() => {
        if (cancelled || document.visibilityState === 'hidden') return;
        void probe().then((ok) => {
          if (cancelled) return;
          dispatch(ok ? probeSucceeded() : probeFailed());
        });
      }, jitter(netProbeSpacingMs(state, failedProbes)));
    };

    arm();
    document.addEventListener('visibilitychange', arm);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', arm);
    };
    // `state` and `failedProbes` re-arm the timer after every transition, which
    // is also what applies the backoff.
  }, [dispatch, state, failedProbes, withProbe]);

  const canWrite = useCallback((writeClass: TWriteClass) => canWriteIn(state, writeClass), [state]);

  return useMemo(
    () => ({ state, isImpaired, canWrite, pendingWrites, lastOnlineAt }),
    [state, isImpaired, canWrite, pendingWrites, lastOnlineAt]
  );
}
