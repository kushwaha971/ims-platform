'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectNetworkImpaired } from 'src/redux/slice/networkSlice';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { todayInTenantTz } from 'src/utils/dates';

import {
  invoiceFiltersChanged,
  selectInvoiceList,
  type InvoiceListState,
} from '../redux/invoiceListSlice';
import { fetchInvoices } from '../redux/salesThunk';
import {
  invoiceFiltersFromQuery,
  invoiceQueryFromFilters,
  resolveInvoicePreset,
  type InvoiceListFilters,
} from '../view-model/invoiceDisplay';

import type { InvoiceListQuery } from '../api/salesService';
import type { InvoicePreset } from '../constants/salesConstants';
import type { InvoiceTab } from '../types/sales.types';

/**
 * Part 19 §19.4 — everything the bills list does, so the page only renders.
 * Tab and dates live in the URL (SAL-08 FR-3); every setter but `setPage`
 * returns the merchant to page one (§5).
 */
export interface UseInvoiceListResult extends Omit<InvoiceListState, 'filters'> {
  readonly filters: InvoiceListFilters;
  readonly today: string;
  readonly canRead: boolean;
  readonly canWrite: boolean;
  readonly setPreset: (preset: InvoicePreset) => void;
  readonly setRange: (from: string | null, to: string | null) => void;
  readonly setTab: (tab: InvoiceTab) => void;
  readonly setQuery: (q: string) => void;
  readonly setPage: (page: number) => void;
  readonly clearFilters: () => void;
  readonly refetch: () => void;
}

export const useInvoiceList = (): UseInvoiceListResult => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const search = useSearchParams();
  const { can, hasModule } = usePermissions();
  const timezone = useAppSelector(selectTenantTimezone);
  const isImpaired = useAppSelector(selectNetworkImpaired);
  const state = useAppSelector(selectInvoiceList);

  const canRead = hasModule('sales') && can('sales.invoice.read');
  const canWrite = hasModule('sales') && can('sales.invoice.write');
  const today = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);

  // Keyed on the query STRING — `useSearchParams()` is a new object every render.
  const queryString = search?.toString() ?? '';
  const filters = useMemo(
    () => invoiceFiltersFromQuery(new URLSearchParams(queryString), today),
    [queryString, today]
  );
  const query = useMemo<InvoiceListQuery>(
    () => ({
      tab: filters.tab,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      partyId: null,
      q: filters.q,
      page: filters.page,
    }),
    [filters]
  );

  useEffect(() => {
    if (!canRead) return undefined;
    dispatch(invoiceFiltersChanged(query));
    const promise = dispatch(fetchInvoices(query));
    return () => promise.abort();
  }, [dispatch, canRead, query]);

  useEffect(() => {
    if (!state.stale || isImpaired || !canRead) return undefined;
    const promise = dispatch(fetchInvoices(query));
    return () => promise.abort();
  }, [state.stale, isImpaired, canRead, dispatch, query]);

  const push = useCallback(
    (next: InvoiceListFilters) => {
      const qs = invoiceQueryFromFilters(next);
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router]
  );

  const setPreset = useCallback(
    (preset: InvoicePreset) => {
      const resolved = resolveInvoicePreset(preset, today);
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
    (tab: InvoiceTab) => push({ ...filters, tab, page: 1 }),
    [push, filters]
  );
  const setQuery = useCallback((q: string) => push({ ...filters, q, page: 1 }), [push, filters]);
  const setPage = useCallback((page: number) => push({ ...filters, page }), [push, filters]);
  const clearFilters = useCallback(
    () => push({ ...filters, tab: 'all', q: '', page: 1 }),
    [push, filters]
  );
  const refetch = useCallback(() => {
    void dispatch(fetchInvoices(query));
  }, [dispatch, query]);

  return {
    ...state,
    filters,
    today,
    canRead,
    canWrite,
    setPreset,
    setRange,
    setTab,
    setQuery,
    setPage,
    clearFilters,
    refetch,
  };
};
