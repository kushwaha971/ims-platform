'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectNetworkImpaired } from 'src/redux/slice/networkSlice';
import { selectTenantTimezone } from 'src/redux/slice/sessionSlice';
import { todayInTenantTz } from 'src/utils/dates';

import { PURCHASE_BILL_TABS_ORDER } from '../constants/purchaseConstants';
import {
  purchaseBillFiltersChanged,
  selectPurchaseBillList,
  type PurchaseBillListState,
} from '../redux/purchaseBillListSlice';
import { fetchPurchaseBillList } from '../redux/purchaseBillThunk';
import {
  DEBIT_NOTE_TABS,
  PURCHASE_ORDER_TABS,
  type PurchaseBillTab,
  type PurchaseKind,
} from '../types/purchase.types';
import {
  purchaseFiltersFromQuery,
  purchaseQueryFromFilters,
  resolvePurchasePreset,
  type PurchaseBillListFilters,
} from '../view-model/purchaseBillDisplay';

import type { PurchaseBillListQuery } from '../api/purchaseBillService';
import type { PurchaseBillPreset } from '../constants/purchaseConstants';

/**
 * Part 19 §19.4 — everything the purchase bills list does, so the page only
 * renders. Tab and range live in the URL (PUR-03 FR-4); every setter but
 * `setPage` returns the merchant to page one.
 */
export interface UsePurchaseBillListResult extends Omit<PurchaseBillListState, 'filters'> {
  readonly filters: PurchaseBillListFilters;
  readonly today: string;
  readonly canRead: boolean;
  readonly canWrite: boolean;
  readonly setPreset: (preset: PurchaseBillPreset) => void;
  readonly setRange: (from: string | null, to: string | null) => void;
  readonly setTab: (tab: PurchaseBillTab) => void;
  /** The phone's Filters sheet: tab, period and dates in ONE address-bar update. */
  readonly applyFilters: (next: {
    tab: PurchaseBillTab;
    preset: PurchaseBillPreset;
    dateFrom: string;
    dateTo: string;
  }) => void;
  readonly setQuery: (q: string) => void;
  readonly setPage: (page: number) => void;
  readonly clearFilters: () => void;
  /** WP-06 — drops the due-date window a dashboard link brought. */
  readonly clearDue: () => void;
  readonly refetch: () => void;
}

export const usePurchaseBillList = (
  kind: PurchaseKind = 'purchase_bill'
): UsePurchaseBillListResult => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const search = useSearchParams();
  const { can, hasModule } = usePermissions();
  const timezone = useAppSelector(selectTenantTimezone);
  const isImpaired = useAppSelector(selectNetworkImpaired);
  const state = useAppSelector(selectPurchaseBillList);

  const canRead = hasModule('purchases') && can('purchases.bill.read');
  const canWrite = hasModule('purchases') && can('purchases.bill.write');
  const today = useMemo(() => todayInTenantTz(timezone ?? undefined), [timezone]);

  // Keyed on the query STRING — `useSearchParams()` is a new object every render.
  const queryString = search?.toString() ?? '';
  const filters = useMemo(
    () =>
      purchaseFiltersFromQuery(
        new URLSearchParams(queryString),
        today,
        kind === 'purchase_order'
          ? PURCHASE_ORDER_TABS
          : kind === 'debit_note'
            ? DEBIT_NOTE_TABS
            : PURCHASE_BILL_TABS_ORDER
      ),
    [queryString, today, kind]
  );
  const query = useMemo<PurchaseBillListQuery>(
    () => ({
      kind,
      tab: filters.tab,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      partyId: null,
      q: filters.q,
      page: filters.page,
      dueFrom: filters.dueFrom,
      dueTo: filters.dueTo,
    }),
    [filters, kind]
  );

  useEffect(() => {
    if (!canRead) return undefined;
    dispatch(purchaseBillFiltersChanged(query));
    const promise = dispatch(fetchPurchaseBillList(query));
    return () => promise.abort();
  }, [dispatch, canRead, query]);

  useEffect(() => {
    if (!state.stale || isImpaired || !canRead) return undefined;
    const promise = dispatch(fetchPurchaseBillList(query));
    return () => promise.abort();
  }, [state.stale, isImpaired, canRead, dispatch, query]);

  const push = useCallback(
    (next: PurchaseBillListFilters) => {
      const qs = purchaseQueryFromFilters(next);
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router]
  );

  const setPreset = useCallback(
    (preset: PurchaseBillPreset) => {
      const resolved = resolvePurchasePreset(preset, today);
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
    (tab: PurchaseBillTab) => push({ ...filters, tab, page: 1 }),
    [push, filters]
  );
  const applyFilters = useCallback(
    (next: {
      tab: PurchaseBillTab;
      preset: PurchaseBillPreset;
      dateFrom: string;
      dateTo: string;
    }) => {
      const resolved = next.preset === 'custom' ? null : resolvePurchasePreset(next.preset, today);
      push({
        ...filters,
        tab: next.tab,
        preset: next.preset,
        dateFrom: resolved?.dateFrom ?? next.dateFrom,
        dateTo: resolved?.dateTo ?? next.dateTo,
        page: 1,
      });
    },
    [push, filters, today]
  );
  const setQuery = useCallback((q: string) => push({ ...filters, q, page: 1 }), [push, filters]);
  const setPage = useCallback((page: number) => push({ ...filters, page }), [push, filters]);
  const clearFilters = useCallback(
    () => push({ ...filters, tab: 'all', q: '', page: 1, dueFrom: null, dueTo: null }),
    [push, filters]
  );
  const clearDue = useCallback(
    () => push({ ...filters, dueFrom: null, dueTo: null, page: 1 }),
    [push, filters]
  );
  const refetch = useCallback(() => {
    void dispatch(fetchPurchaseBillList(query));
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
    applyFilters,
    setQuery,
    setPage,
    clearFilters,
    clearDue,
    refetch,
  };
};
