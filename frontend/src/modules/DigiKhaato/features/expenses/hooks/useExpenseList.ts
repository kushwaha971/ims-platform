'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectNetworkImpaired } from 'src/redux/slice/networkSlice';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';
import type { PaymentMode } from 'src/types/domain.types';
import { todayInTenantTz } from 'src/utils/dates';

import {
  expenseFiltersChanged,
  selectExpenseError,
  selectExpenseListStale,
  selectExpensePage,
  selectExpensePageSize,
  selectExpenseRows,
  selectExpenseStatus,
  selectExpenseTotal,
  selectExpenseTotals,
} from '../redux/expenseListSlice';
import { fetchExpenses } from '../redux/expenseThunk';
import {
  expenseFiltersFromQuery,
  expenseQueryFromFilters,
  resolveExpensePreset,
} from '../view-model/expenseDisplay';

import type {
  Expense,
  ExpenseFilters,
  ExpensePreset,
  ExpenseTab,
  ExpenseTotals,
} from '../types/expense.types';

/**
 * Part 19 §19.4 — everything the expense list does, so the page only renders.
 * The filters live in the URL (PTY-05's lesson), and every setter but
 * `setPage` returns the merchant to page one.
 */
export interface UseExpenseListResult {
  readonly rows: readonly Expense[];
  readonly totals: ExpenseTotals | null;
  readonly filters: ExpenseFilters;
  readonly today: string;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly canRead: boolean;
  readonly setPreset: (preset: ExpensePreset) => void;
  readonly setRange: (from: string | null, to: string | null) => void;
  readonly setTab: (tab: ExpenseTab) => void;
  readonly setCategory: (categoryId: string | null) => void;
  readonly setMode: (mode: PaymentMode | null) => void;
  readonly setQuery: (q: string) => void;
  readonly setPage: (page: number) => void;
  readonly clearFilters: () => void;
  readonly refetch: () => void;
}

export const useExpenseList = (): UseExpenseListResult => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const search = useSearchParams();
  const { can, hasModule } = usePermissions();
  const timezone = useAppSelector(selectTenantTimezone);
  const isImpaired = useAppSelector(selectNetworkImpaired);

  const rows = useAppSelector(selectExpenseRows);
  const totals = useAppSelector(selectExpenseTotals);
  const status = useAppSelector(selectExpenseStatus);
  const error = useAppSelector(selectExpenseError);
  const page = useAppSelector(selectExpensePage);
  const pageSize = useAppSelector(selectExpensePageSize);
  const total = useAppSelector(selectExpenseTotal);
  const stale = useAppSelector(selectExpenseListStale);

  const canRead = hasModule('expenses') && can('expenses.expense.read');
  const today = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);

  /* Keyed on the query STRING: `useSearchParams()` returns a new object every
     render, and a memo on it re-dispatches forever (LED-04's "Maximum update
     depth exceeded"). */
  const queryString = search?.toString() ?? '';
  const filters = useMemo(
    () => expenseFiltersFromQuery(new URLSearchParams(queryString), today),
    [queryString, today]
  );

  useEffect(() => {
    if (!canRead) return undefined;
    dispatch(expenseFiltersChanged(filters));
    const promise = dispatch(fetchExpenses(filters));
    return () => promise.abort();
  }, [dispatch, canRead, filters]);

  useEffect(() => {
    if (!stale || isImpaired || !canRead) return undefined;
    const promise = dispatch(fetchExpenses(filters));
    return () => promise.abort();
  }, [stale, isImpaired, canRead, dispatch, filters]);

  const push = useCallback(
    (next: ExpenseFilters) => {
      const query = expenseQueryFromFilters(next);
      // `replace`: flipping filters is looking at one screen, not visiting ten.
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
        page: 1,
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
        page: 1,
      }),
    [push, filters]
  );
  const setTab = useCallback(
    (tab: ExpenseTab) => push({ ...filters, tab, page: 1 }),
    [push, filters]
  );
  const setCategory = useCallback(
    (categoryId: string | null) => push({ ...filters, categoryId, page: 1 }),
    [push, filters]
  );
  const setMode = useCallback(
    (mode: PaymentMode | null) => push({ ...filters, mode, page: 1 }),
    [push, filters]
  );
  const setQuery = useCallback((q: string) => push({ ...filters, q, page: 1 }), [push, filters]);
  const setPage = useCallback((next: number) => push({ ...filters, page: next }), [push, filters]);
  const clearFilters = useCallback(
    () => push({ ...filters, tab: 'all', categoryId: null, mode: null, q: '', page: 1 }),
    [push, filters]
  );
  const refetch = useCallback(() => {
    void dispatch(fetchExpenses(filters));
  }, [dispatch, filters]);

  return useMemo(
    () => ({
      rows,
      totals,
      filters,
      today,
      status,
      error,
      page,
      pageSize,
      total,
      canRead,
      setPreset,
      setRange,
      setTab,
      setCategory,
      setMode,
      setQuery,
      setPage,
      clearFilters,
      refetch,
    }),
    [
      rows,
      totals,
      filters,
      today,
      status,
      error,
      page,
      pageSize,
      total,
      canRead,
      setPreset,
      setRange,
      setTab,
      setCategory,
      setMode,
      setQuery,
      setPage,
      clearFilters,
      refetch,
    ]
  );
};
