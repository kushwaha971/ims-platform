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
  cashbookAsked,
  selectCashbookData,
  selectCashbookError,
  selectCashbookStale,
  selectCashbookStatus,
} from '../redux/cashbookSlice';
import { fetchCashbook } from '../redux/cashbookThunk';
import {
  cashbookFiltersFromQuery,
  cashbookQueryFromFilters,
  resolveExpensePreset,
} from '../view-model/expenseDisplay';

import type { CashbookBucketFilter, CashbookData, CashbookFilters } from '../types/cashbook.types';
import type { ExpensePreset } from '../types/expense.types';

/**
 * EXP-03 — the cashbook screen's state. Two scopes (FR-13):
 *
 * * `full` — `reports.financial.read` (owner, admin, accountant): any range,
 *   both buckets, the category breakdown. The range lives in the URL.
 * * `till` — everybody else who can read expenses: today's cash and nothing
 *   more. The request carries NO parameters (the server's default for them is
 *   exactly that), the range chips and bucket switch are not rendered, and the
 *   server refuses anything wider regardless — the UI hiding a control is a
 *   courtesy, never the control.
 */
export interface UseCashbookResult {
  readonly data: CashbookData | null;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly filters: CashbookFilters;
  readonly today: string;
  readonly canRead: boolean;
  readonly fullScope: boolean;
  /** True when the range is exactly today — the close-the-day panel shows (FR-8). */
  readonly isToday: boolean;
  readonly setPreset: (preset: ExpensePreset) => void;
  readonly setRange: (from: string | null, to: string | null) => void;
  readonly setBucket: (bucket: CashbookBucketFilter) => void;
  readonly refetch: () => void;
}

export const useCashbook = (): UseCashbookResult => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const search = useSearchParams();
  const { can, hasModule } = usePermissions();
  const timezone = useAppSelector(selectTenantTimezone);
  const isImpaired = useAppSelector(selectNetworkImpaired);
  const data = useAppSelector(selectCashbookData);
  const status = useAppSelector(selectCashbookStatus);
  const error = useAppSelector(selectCashbookError);
  const stale = useAppSelector(selectCashbookStale);

  const canRead = hasModule('expenses') && can('expenses.expense.read');
  const fullScope = canRead && can('reports.financial.read');
  const today = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);

  const queryString = search?.toString() ?? '';
  const filters = useMemo<CashbookFilters>(
    () =>
      fullScope
        ? cashbookFiltersFromQuery(new URLSearchParams(queryString), today)
        : { preset: 'today', dateFrom: today, dateTo: today, bucket: 'cash' },
    [fullScope, queryString, today]
  );
  const ask = fullScope ? filters : null;

  useEffect(() => {
    if (!canRead) return undefined;
    dispatch(cashbookAsked(ask));
    const promise = dispatch(fetchCashbook(ask));
    return () => promise.abort();
  }, [dispatch, canRead, ask]);

  useEffect(() => {
    if (!stale || isImpaired || !canRead) return undefined;
    const promise = dispatch(fetchCashbook(ask));
    return () => promise.abort();
  }, [stale, isImpaired, canRead, dispatch, ask]);

  const push = useCallback(
    (next: CashbookFilters) => {
      const query = cashbookQueryFromFilters(next);
      router.replace(query ? `?${query}` : '?', { scroll: false });
    },
    [router]
  );
  const setPreset = useCallback(
    (preset: ExpensePreset) => {
      const resolved = resolveExpensePreset(preset, today);
      push({
        ...filters,
        preset,
        dateFrom: resolved?.dateFrom ?? filters.dateFrom,
        dateTo: resolved?.dateTo ?? filters.dateTo,
      });
    },
    [push, filters, today]
  );
  const setRange = useCallback(
    (from: string | null, to: string | null) =>
      push({
        ...filters,
        preset: 'custom',
        dateFrom: from ?? filters.dateFrom,
        dateTo: to ?? filters.dateTo,
      }),
    [push, filters]
  );
  const setBucket = useCallback(
    (bucket: CashbookBucketFilter) => push({ ...filters, bucket }),
    [push, filters]
  );
  const refetch = useCallback(() => {
    void dispatch(fetchCashbook(ask));
  }, [dispatch, ask]);

  return useMemo(
    () => ({
      data,
      status,
      error,
      filters,
      today,
      canRead,
      fullScope,
      isToday: filters.dateFrom === today && filters.dateTo === today,
      setPreset,
      setRange,
      setBucket,
      refetch,
    }),
    [
      data,
      status,
      error,
      filters,
      today,
      canRead,
      fullScope,
      setPreset,
      setRange,
      setBucket,
      refetch,
    ]
  );
};
