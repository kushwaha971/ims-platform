'use client';

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectNetworkImpaired } from 'src/redux/slice/networkSlice';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  selectDashboardData,
  selectDashboardError,
  selectDashboardStale,
  selectDashboardStatus,
} from '../redux/dashboardSlice';
import { fetchDashboard } from '../redux/dashboardThunk';
import { secondsSince } from '../view-model/dashboardDisplay';

import type { DashboardData } from '../types/reports.types';

/**
 * "Now" for FR-8's "Updated 30 s ago", ticking every fifteen seconds while a
 * dashboard is on screen. An external store rather than `Date.now()` in render
 * (`react-hooks/purity`), and not `useNowMs`, whose hourly tick is right for
 * "12 days ago" and wrong for seconds.
 */
const TICK_MS = 15_000;
let nowMs = Date.now();
let ticker: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  nowMs = Date.now();
  ticker ??= setInterval(() => {
    nowMs = Date.now();
    listeners.forEach((notify) => notify());
  }, TICK_MS);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && ticker !== null) {
      clearInterval(ticker);
      ticker = null;
    }
  };
};
const snapshot = (): number => nowMs;

export interface UseDashboardResult {
  readonly data: DashboardData | null;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  /** `reports.basic.read` with the reports module on — else the page sends the merchant on. */
  readonly canRead: boolean;
  readonly secondsAgo: number;
  readonly refreshing: boolean;
  readonly refresh: () => void;
  readonly retry: () => void;
}

/**
 * RPT-01 — the dashboard's state.
 *
 * Read on mount; re-read when any write in the session marked it stale
 * (`dashboardSlice`), when the tab comes back into focus (TSK-RPT-01-06), and
 * on the refresh icon, which asks the server to recompute rather than serve
 * its sixty-second snapshot (FR-8).
 */
export const useDashboard = (): UseDashboardResult => {
  const dispatch = useAppDispatch();
  const { can, hasModule } = usePermissions();
  const data = useAppSelector(selectDashboardData);
  const status = useAppSelector(selectDashboardStatus);
  const error = useAppSelector(selectDashboardError);
  const stale = useAppSelector(selectDashboardStale);
  const impaired = useAppSelector(selectNetworkImpaired);
  const now = useSyncExternalStore(subscribe, snapshot, snapshot);

  const canRead = hasModule('reports') && can('reports.basic.read');

  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchDashboard());
    return () => promise.abort();
  }, [dispatch, canRead]);

  /* A write while the dashboard is ON SCREEN (a reminder sent from a debtor
     row, a bill issued in another tab): only a settled response is re-read,
     because on a fresh mount the effect above has already asked. */
  const settled = status === 'succeeded';
  useEffect(() => {
    if (!stale || impaired || !canRead || !settled) return undefined;
    const promise = dispatch(fetchDashboard());
    return () => promise.abort();
  }, [dispatch, stale, impaired, canRead, settled]);

  useEffect(() => {
    if (!canRead || typeof window === 'undefined') return undefined;
    const onFocus = () => {
      if (document.visibilityState === 'visible') void dispatch(fetchDashboard());
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [dispatch, canRead]);

  const refresh = useCallback(() => {
    void dispatch(fetchDashboard({ refresh: true }));
  }, [dispatch]);
  const retry = useCallback(() => {
    void dispatch(fetchDashboard());
  }, [dispatch]);

  return useMemo(
    () => ({
      data,
      status,
      error,
      canRead,
      secondsAgo: secondsSince(data?.generatedAt, now),
      refreshing: status === 'refreshing',
      refresh,
      retry,
    }),
    [data, status, error, canRead, now, refresh, retry]
  );
};
