'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectNetworkImpaired } from 'src/redux/slice/networkSlice';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';
import { todayInTenantTz } from 'src/utils/dates';

import {
  agingFiltersChanged,
  selectAgingAsOf,
  selectAgingCachedAt,
  selectAgingError,
  selectAgingPage,
  selectAgingPageSize,
  selectAgingTotal,
  selectAgingRows,
  selectAgingStale,
  selectAgingStatus,
  selectAgingTotals,
  selectLedgerPosition,
} from '../redux/agingSlice';
import { fetchLedgerAging, fetchLedgerSummary } from '../redux/agingThunk';
import { asOfProblem, filtersFromQuery, queryFromFilters } from '../view-model/agingDisplay';

import type {
  AgingAmounts,
  AgingFilters,
  AgingKind,
  AgingRow,
  LedgerSummary,
} from '../types/aging.types';

/**
 * Part 19 §19.4 — everything the aging page does, so the page only renders.
 *
 * The filter lives in the URL for the reason the statement's does: a merchant
 * who has narrowed to one tag and one date wants to be able to send that view
 * to their accountant, and PTY-05 already paid for finding out what happens
 * when a screen's filters live only in Redux.
 */
export interface UseLedgerAgingResult {
  readonly rows: readonly AgingRow[];
  readonly totals: AgingAmounts | null;
  readonly summary: LedgerSummary | null;
  readonly filters: AgingFilters;
  readonly asOf: string | null;
  readonly cachedAt: string | null;
  readonly today: string;
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  readonly isEmpty: boolean;
  readonly canRead: boolean;
  readonly canExport: boolean;
  readonly error: ApiErrorShape | null;
  readonly status: RequestStatus;
  readonly asOfProblem: 'future' | null;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly setKind: (kind: AgingKind) => void;
  readonly setAsOf: (asOf: string) => void;
  readonly setTag: (tag: string | null) => void;
  readonly setOrdering: (ordering: string) => void;
  readonly setPage: (page: number) => void;
  readonly refetch: () => void;
}

export const useLedgerAging = (): UseLedgerAgingResult => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const search = useSearchParams();
  const { can, hasModule } = usePermissions();
  const timezone = useAppSelector(selectTenantTimezone);

  const rows = useAppSelector(selectAgingRows);
  const totals = useAppSelector(selectAgingTotals);
  const summary = useAppSelector(selectLedgerPosition);
  const status = useAppSelector(selectAgingStatus);
  const error = useAppSelector(selectAgingError);
  const asOf = useAppSelector(selectAgingAsOf);
  const cachedAt = useAppSelector(selectAgingCachedAt);
  const page = useAppSelector(selectAgingPage);
  const pageSize = useAppSelector(selectAgingPageSize);
  const total = useAppSelector(selectAgingTotal);
  const stale = useAppSelector(selectAgingStale);
  const isImpaired = useAppSelector(selectNetworkImpaired);

  const canRead = hasModule('ledger') && can('ledger.entry.read');
  /* §12 — staff chase collections and may not take the report away. `reports.
     export` is the same codename the statement's CSV is gated on, because they
     are the same act: leaving with the book in a file. */
  const canExport = canRead && can('reports.export');

  const today = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);

  /* Memoised on the query STRING, never on the `URLSearchParams` object.
     `useSearchParams()` hands back a new object every render, so a memo keyed on
     it recomputes every time and the effect below re-dispatches every time —
     which LED-04 discovered as "Maximum update depth exceeded" and a phone would
     have discovered as a page that never settles. */
  const queryString = search?.toString() ?? '';
  const filters = useMemo(
    () => filtersFromQuery(new URLSearchParams(queryString), today),
    [queryString, today]
  );
  const problem = useMemo(() => asOfProblem(filters.asOf, today), [filters.asOf, today]);

  useEffect(() => {
    if (!canRead) return;
    dispatch(agingFiltersChanged(filters));
  }, [dispatch, filters, canRead]);

  useEffect(() => {
    if (!canRead || problem) return undefined;
    const promise = dispatch(fetchLedgerAging(filters));
    return () => promise.abort();
  }, [dispatch, canRead, filters, problem]);

  /* The summary is fetched ONCE per mount rather than on every filter change:
     it is the tenant's position and has no as-of date, so re-requesting it when
     a merchant switches tabs is a request whose answer cannot have changed. */
  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchLedgerSummary());
    return () => promise.abort();
  }, [dispatch, canRead]);

  useEffect(() => {
    if (!stale || isImpaired || !canRead || problem) return undefined;
    const promise = dispatch(fetchLedgerAging(filters));
    return () => promise.abort();
  }, [stale, isImpaired, canRead, problem, dispatch, filters]);

  const push = useCallback(
    (next: AgingFilters) => {
      // `replace`, not `push`: switching tabs and dates is looking at one
      // screen, not visiting four.
      router.replace(`?${queryFromFilters(next, today)}`, { scroll: false });
    },
    [router, today]
  );

  /* Every setter resets the page, except the one that sets it. A merchant on
     page three who switches to Payable expects the top of the supplier list,
     not page three of it — which on a shorter list is an empty screen. */
  const setKind = useCallback(
    (kind: AgingKind) => push({ ...filters, kind, page: 1 }),
    [push, filters]
  );
  const setAsOf = useCallback(
    (next: string) => push({ ...filters, asOf: next, page: 1 }),
    [push, filters]
  );
  const setTag = useCallback(
    (tag: string | null) => push({ ...filters, tag, page: 1 }),
    [push, filters]
  );
  const setOrdering = useCallback(
    (ordering: string) => push({ ...filters, ordering, page: 1 }),
    [push, filters]
  );
  const setPage = useCallback((page: number) => push({ ...filters, page }), [push, filters]);

  const refetch = useCallback(() => {
    void dispatch(fetchLedgerAging(filters));
  }, [dispatch, filters]);

  return useMemo(
    () => ({
      rows,
      totals,
      summary,
      filters,
      asOf,
      cachedAt,
      today,
      isLoading: status === 'loading' && rows.length === 0,
      isRefreshing: status === 'refreshing',
      isEmpty: rows.length === 0 && status === 'succeeded',
      canRead,
      canExport,
      error,
      status,
      asOfProblem: problem,
      page,
      pageSize,
      total,
      setKind,
      setAsOf,
      setTag,
      setOrdering,
      setPage,
      refetch,
    }),
    [
      rows,
      totals,
      summary,
      filters,
      asOf,
      cachedAt,
      today,
      status,
      canRead,
      canExport,
      error,
      problem,
      page,
      pageSize,
      total,
      setKind,
      setAsOf,
      setTag,
      setOrdering,
      setPage,
      refetch,
    ]
  );
};
