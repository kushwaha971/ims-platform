'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectNetworkImpaired } from 'src/redux/slice/networkSlice';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { todayInTenantTz } from 'src/utils/dates';

import {
  flowFiltersChanged,
  selectSalesDocList,
  type SalesDocListState,
} from '../redux/salesDocListSlice';
import { fetchFlowDocuments, type FlowListArg } from '../redux/salesFlowThunk';
import { flowFiltersFromQuery, type FlowListFilters } from '../view-model/flowDisplay';
import { invoiceQueryFromFilters, resolveInvoicePreset } from '../view-model/invoiceDisplay';

import type { InvoicePreset } from '../constants/salesConstants';
import type { FlowKind, FlowTab } from '../types/salesFlows.types';
import type { InvoiceListFilters } from '../view-model/invoiceDisplay';

/**
 * SAL-01 FR-10 / SAL-04 §14 — the estimates or credit notes list, with the
 * bills list's URL rules (useInvoiceList): tab and dates in the address bar,
 * every setter but `setPage` back to page one.
 */
export interface UseSalesFlowListResult extends Omit<SalesDocListState, 'filters'> {
  readonly filters: FlowListFilters;
  readonly today: string;
  readonly canRead: boolean;
  readonly canWrite: boolean;
  readonly setPreset: (preset: InvoicePreset) => void;
  readonly setRange: (from: string | null, to: string | null) => void;
  readonly setTab: (tab: FlowTab) => void;
  readonly setQuery: (q: string) => void;
  readonly setPage: (page: number) => void;
  readonly clearFilters: () => void;
  readonly refetch: () => void;
}

export const useSalesFlowList = (kind: FlowKind): UseSalesFlowListResult => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const search = useSearchParams();
  const { can, hasModule } = usePermissions();
  const timezone = useAppSelector(selectTenantTimezone);
  const isImpaired = useAppSelector(selectNetworkImpaired);
  const state = useAppSelector(selectSalesDocList);

  const canRead =
    hasModule('sales') && can(kind === 'estimate' ? 'sales.estimate.read' : 'sales.invoice.read');
  const canWrite =
    hasModule('sales') &&
    can(kind === 'estimate' ? 'sales.estimate.write' : 'sales.credit_note.write');
  const today = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);

  const queryString = search?.toString() ?? '';
  const filters = useMemo(
    () => flowFiltersFromQuery(kind, new URLSearchParams(queryString), today),
    [kind, queryString, today]
  );
  const query = useMemo<FlowListArg>(
    () => ({
      kind,
      tab: filters.tab,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      partyId: null,
      q: filters.q,
      page: filters.page,
    }),
    [kind, filters]
  );

  useEffect(() => {
    if (!canRead) return undefined;
    dispatch(flowFiltersChanged(query));
    const promise = dispatch(fetchFlowDocuments(query));
    return () => promise.abort();
  }, [dispatch, canRead, query]);

  useEffect(() => {
    if (!state.stale || isImpaired || !canRead) return undefined;
    const promise = dispatch(fetchFlowDocuments(query));
    return () => promise.abort();
  }, [state.stale, isImpaired, canRead, dispatch, query]);

  const push = useCallback(
    (next: FlowListFilters) => {
      const qs = invoiceQueryFromFilters(next as unknown as InvoiceListFilters);
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
  const setTab = useCallback((tab: FlowTab) => push({ ...filters, tab, page: 1 }), [push, filters]);
  const setQuery = useCallback((q: string) => push({ ...filters, q, page: 1 }), [push, filters]);
  const setPage = useCallback((page: number) => push({ ...filters, page }), [push, filters]);
  const clearFilters = useCallback(
    () => push({ ...filters, tab: 'all', q: '', page: 1 }),
    [push, filters]
  );
  const refetch = useCallback(() => {
    void dispatch(fetchFlowDocuments(query));
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
