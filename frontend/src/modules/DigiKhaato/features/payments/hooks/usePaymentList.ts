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

import { resolveExpensePreset } from '../../expenses/view-model/expenseDisplay';
import {
  paymentFiltersChanged,
  selectPaymentError,
  selectPaymentListStale,
  selectPaymentPage,
  selectPaymentPageSize,
  selectPaymentRows,
  selectPaymentStatus,
  selectPaymentTotal,
  selectPaymentTotals,
} from '../redux/paymentListSlice';
import { fetchPayments } from '../redux/paymentThunk';
import { paymentFiltersFromQuery, paymentQueryFromFilters } from '../view-model/paymentDisplay';

import type { PaymentPreset } from '../constants/paymentConstants';
import type { PaymentFilters, PaymentRow, PaymentTab, PaymentTotals } from '../types/payment.types';

/**
 * Part 19 §19.4 — everything the payments list does, so the page only renders.
 * The filters live in the URL (PTY-05's lesson), and every setter but
 * `setPage` returns the merchant to page one.
 */
export interface UsePaymentListResult {
  readonly rows: readonly PaymentRow[];
  readonly totals: PaymentTotals | null;
  readonly filters: PaymentFilters;
  readonly today: string;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly canRead: boolean;
  readonly setPreset: (preset: PaymentPreset) => void;
  readonly setRange: (from: string | null, to: string | null) => void;
  readonly setTab: (tab: PaymentTab) => void;
  readonly setMode: (mode: PaymentMode | null) => void;
  readonly setQuery: (q: string) => void;
  readonly setPage: (page: number) => void;
  readonly clearFilters: () => void;
  readonly refetch: () => void;
}

export const usePaymentList = (): UsePaymentListResult => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const search = useSearchParams();
  const { can, hasModule } = usePermissions();
  const timezone = useAppSelector(selectTenantTimezone);
  const isImpaired = useAppSelector(selectNetworkImpaired);

  const rows = useAppSelector(selectPaymentRows);
  const totals = useAppSelector(selectPaymentTotals);
  const status = useAppSelector(selectPaymentStatus);
  const error = useAppSelector(selectPaymentError);
  const page = useAppSelector(selectPaymentPage);
  const pageSize = useAppSelector(selectPaymentPageSize);
  const total = useAppSelector(selectPaymentTotal);
  const stale = useAppSelector(selectPaymentListStale);

  const canRead = hasModule('payments') && can('payments.payment.read');
  const today = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);

  /* Keyed on the query STRING — `useSearchParams()` is a new object every
     render, and a memo on it re-dispatches forever (LED-04). */
  const queryString = search?.toString() ?? '';
  const filters = useMemo(
    () => paymentFiltersFromQuery(new URLSearchParams(queryString), today),
    [queryString, today]
  );

  useEffect(() => {
    if (!canRead) return undefined;
    dispatch(paymentFiltersChanged(filters));
    const promise = dispatch(fetchPayments(filters));
    return () => promise.abort();
  }, [dispatch, canRead, filters]);

  useEffect(() => {
    if (!stale || isImpaired || !canRead) return undefined;
    const promise = dispatch(fetchPayments(filters));
    return () => promise.abort();
  }, [stale, isImpaired, canRead, dispatch, filters]);

  const push = useCallback(
    (next: PaymentFilters) => {
      const query = paymentQueryFromFilters(next);
      router.replace(query ? `?${query}` : '?', { scroll: false });
    },
    [router]
  );

  const setPreset = useCallback(
    (preset: PaymentPreset) => {
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
    (tab: PaymentTab) => push({ ...filters, tab, page: 1 }),
    [push, filters]
  );
  const setMode = useCallback(
    (mode: PaymentMode | null) => push({ ...filters, mode, page: 1 }),
    [push, filters]
  );
  const setQuery = useCallback((q: string) => push({ ...filters, q, page: 1 }), [push, filters]);
  const setPage = useCallback((next: number) => push({ ...filters, page: next }), [push, filters]);
  const clearFilters = useCallback(
    () => push({ ...filters, tab: 'all', mode: null, q: '', page: 1 }),
    [push, filters]
  );
  const refetch = useCallback(() => {
    void dispatch(fetchPayments(filters));
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
      setMode,
      setQuery,
      setPage,
      clearFilters,
      refetch,
    ]
  );
};
