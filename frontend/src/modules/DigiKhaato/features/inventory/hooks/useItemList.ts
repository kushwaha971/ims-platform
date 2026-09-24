'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectNetworkImpaired } from 'src/redux/slice/networkSlice';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { ITEM_ORDERINGS } from '../constants/inventoryConstants';
import {
  itemFiltersChanged,
  selectItemListCounts,
  selectItemListError,
  selectItemListPage,
  selectItemListPageSize,
  selectItemListStale,
  selectItemListStatus,
  selectItemListTotal,
  selectItemListTotalPages,
  selectItemListTotals,
  selectItemRows,
} from '../redux/itemListSlice';
import { fetchItemList } from '../redux/itemThunk';

import type { ItemListFilters, ItemListRow, ItemListResult, StockTab } from '../types/item.types';

/**
 * INV-02 — the item list, with its filters in the ADDRESS BAR (the party
 * list's rule, `usePartyListUrl`): a merchant can bookmark "Low" or send an
 * accountant `/items?category=…`, and Back restores the view they left.
 */
const TABS: readonly StockTab[] = ['all', 'in', 'low', 'out'];

export const filtersFromQuery = (query: URLSearchParams): ItemListFilters => {
  const tab = query.get('tab') as StockTab | null;
  const type = query.get('type');
  const status = query.get('status');
  const ordering = query.get('ordering');
  const page = Number(query.get('page') ?? '1');
  const resolvedTab = tab && TABS.includes(tab) ? tab : 'all';
  return {
    q: (query.get('q') ?? '').slice(0, 80),
    tab: resolvedTab,
    type: type === 'goods' || type === 'service' ? type : '',
    categoryId: query.get('category') ?? '',
    status: status === 'archived' ? 'archived' : 'active',
    /* INV-02 UX — the Low tab sorts by on-hand ascending by default. */
    ordering:
      ordering && (ITEM_ORDERINGS as readonly string[]).includes(ordering)
        ? ordering
        : resolvedTab === 'low'
          ? 'on_hand'
          : 'name',
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
};

export const queryFromFilters = (filters: ItemListFilters): string => {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.tab !== 'all') params.set('tab', filters.tab);
  if (filters.type) params.set('type', filters.type);
  if (filters.categoryId) params.set('category', filters.categoryId);
  if (filters.status !== 'active') params.set('status', filters.status);
  const defaultOrdering = filters.tab === 'low' ? 'on_hand' : 'name';
  if (filters.ordering !== defaultOrdering) params.set('ordering', filters.ordering);
  if (filters.page > 1) params.set('page', String(filters.page));
  return params.toString();
};

export interface UseItemListResult {
  readonly rows: readonly ItemListRow[];
  readonly filters: ItemListFilters;
  readonly totals: ItemListResult['totals'] | null;
  readonly counts: ItemListResult['counts'] | null;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
  readonly canRead: boolean;
  readonly isFiltered: boolean;
  readonly update: (patch: Partial<ItemListFilters>) => void;
  readonly clearFilters: () => void;
  readonly refetch: () => void;
}

export function useItemList(): UseItemListResult {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const search = useSearchParams();
  const { can, hasModule } = usePermissions();
  const canRead = hasModule('inventory') && can('inventory.item.read');

  const rows = useAppSelector(selectItemRows);
  const status = useAppSelector(selectItemListStatus);
  const error = useAppSelector(selectItemListError);
  const totals = useAppSelector(selectItemListTotals);
  const counts = useAppSelector(selectItemListCounts);
  const page = useAppSelector(selectItemListPage);
  const pageSize = useAppSelector(selectItemListPageSize);
  const total = useAppSelector(selectItemListTotal);
  const totalPages = useAppSelector(selectItemListTotalPages);
  const stale = useAppSelector(selectItemListStale);
  const impaired = useAppSelector(selectNetworkImpaired);

  /* Keyed on the query STRING: `useSearchParams()` returns a new object every
     render, and a memo on it re-dispatches forever (LED-04's lesson). */
  const queryString = search?.toString() ?? '';
  const filters = useMemo(() => filtersFromQuery(new URLSearchParams(queryString)), [queryString]);

  useEffect(() => {
    if (!canRead) return undefined;
    dispatch(itemFiltersChanged(filters));
    const promise = dispatch(fetchItemList(filters));
    return () => promise.abort();
  }, [dispatch, canRead, filters]);

  useEffect(() => {
    if (!stale || impaired || !canRead) return undefined;
    const promise = dispatch(fetchItemList(filters));
    return () => promise.abort();
  }, [dispatch, stale, impaired, canRead, filters]);

  const update = useCallback(
    (patch: Partial<ItemListFilters>) => {
      /* Every change but a page change goes back to page 1 (FR-3). */
      const next = { ...filters, ...patch, page: patch.page ?? 1 };
      if (patch.tab && !patch.ordering) next.ordering = patch.tab === 'low' ? 'on_hand' : 'name';
      const qs = queryFromFilters(next);
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [filters, router]
  );

  const clearFilters = useCallback(() => {
    router.replace('?', { scroll: false });
  }, [router]);

  const refetch = useCallback(() => {
    void dispatch(fetchItemList(filters));
  }, [dispatch, filters]);

  const isFiltered = Boolean(
    filters.q ||
    filters.type ||
    filters.categoryId ||
    filters.tab !== 'all' ||
    filters.status !== 'active'
  );

  return useMemo(
    () => ({
      rows,
      filters,
      totals,
      counts,
      status,
      error,
      page,
      pageSize,
      total,
      totalPages,
      canRead,
      isFiltered,
      update,
      clearFilters,
      refetch,
    }),
    [
      rows,
      filters,
      totals,
      counts,
      status,
      error,
      page,
      pageSize,
      total,
      totalPages,
      canRead,
      isFiltered,
      update,
      clearFilters,
      refetch,
    ]
  );
}
