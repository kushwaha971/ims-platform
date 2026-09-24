'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectNetworkImpaired } from 'src/redux/slice/networkSlice';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  selectLowStock,
  selectLowStockError,
  selectLowStockStatus,
  selectStockSummary,
  selectStockSummaryError,
  selectStockSummaryStale,
  selectStockSummaryStatus,
  summaryFiltersChanged,
} from '../redux/stockSummarySlice';
import { fetchLowStock, fetchStockSummary } from '../redux/stockThunk';

import type { LowStockResult, StockSummaryFilters, StockSummaryResult } from '../types/item.types';

export interface UseStockSummaryResult {
  readonly filters: StockSummaryFilters;
  readonly update: (patch: Partial<StockSummaryFilters>) => void;
  readonly summary: StockSummaryResult | null;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly canRead: boolean;
  readonly refetch: () => void;
}

export interface UseLowStockResult {
  readonly low: LowStockResult | null;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly canRead: boolean;
  readonly page: number;
  readonly setPage: (page: number) => void;
  readonly refetch: () => void;
}

/** INV-08 — the stock summary's filters and data. */
export const DEFAULT_SUMMARY_FILTERS: StockSummaryFilters = {
  q: '',
  categoryId: '',
  status: '',
  hideZero: true,
  asOf: null,
  ordering: 'name',
  page: 1,
};

export function useStockSummary(): UseStockSummaryResult {
  const dispatch = useAppDispatch();
  const { can, hasModule } = usePermissions();
  const canRead = hasModule('inventory') && can('inventory.stock.read');
  const [filters, setFilters] = useState<StockSummaryFilters>(DEFAULT_SUMMARY_FILTERS);
  const summary = useAppSelector(selectStockSummary);
  const status = useAppSelector(selectStockSummaryStatus);
  const error = useAppSelector(selectStockSummaryError);
  const stale = useAppSelector(selectStockSummaryStale);
  const impaired = useAppSelector(selectNetworkImpaired);

  useEffect(() => {
    if (!canRead) return undefined;
    dispatch(summaryFiltersChanged(filters));
    const promise = dispatch(fetchStockSummary(filters));
    return () => promise.abort();
  }, [dispatch, canRead, filters]);

  useEffect(() => {
    if (!stale || impaired || !canRead) return undefined;
    const promise = dispatch(fetchStockSummary(filters));
    return () => promise.abort();
  }, [dispatch, stale, impaired, canRead, filters]);

  const update = useCallback(
    (patch: Partial<StockSummaryFilters>) =>
      setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 })),
    []
  );
  const refetch = useCallback(() => void dispatch(fetchStockSummary(filters)), [dispatch, filters]);

  return useMemo(
    () => ({ filters, update, summary, status, error, canRead, refetch }),
    [filters, update, summary, status, error, canRead, refetch]
  );
}

/** INV-07 — the low-stock list. */
export function useLowStock(): UseLowStockResult {
  const dispatch = useAppDispatch();
  const { can, hasModule } = usePermissions();
  const canRead = hasModule('inventory') && can('inventory.stock.read');
  const [page, setPage] = useState(1);
  const low = useAppSelector(selectLowStock);
  const status = useAppSelector(selectLowStockStatus);
  const error = useAppSelector(selectLowStockError);
  const stale = useAppSelector(selectStockSummaryStale);

  useEffect(() => {
    if (!canRead) return undefined;
    const promise = dispatch(fetchLowStock(page));
    return () => promise.abort();
  }, [dispatch, canRead, page]);

  useEffect(() => {
    if (!stale || !canRead) return undefined;
    const promise = dispatch(fetchLowStock(page));
    return () => promise.abort();
  }, [dispatch, stale, canRead, page]);

  const refetch = useCallback(() => void dispatch(fetchLowStock(page)), [dispatch, page]);
  return useMemo(
    () => ({ low, status, error, canRead, page, setPage, refetch }),
    [low, status, error, canRead, page, refetch]
  );
}
