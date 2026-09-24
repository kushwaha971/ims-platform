'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { usePermissions } from 'src/hooks/usePermissions';
import { selectNetworkImpaired } from 'src/redux/slice/networkSlice';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  selectItemDetail,
  selectItemDetailError,
  selectItemDetailStale,
  selectItemDetailStatus,
  selectItemMovements,
  selectItemMovementsCursor,
  selectItemMovementsHasMore,
  selectItemMovementsStatus,
} from '../redux/itemDetailSlice';
import { archiveItem, fetchItemDetail, fetchItemMovements, restoreItem } from '../redux/itemThunk';

import type { Item, MovementFilters, StockMovement } from '../types/item.types';

/** INV-03 — one item, its stock card and its movement history. */
export interface UseItemDetailResult {
  readonly item: Item | null;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  readonly movements: readonly StockMovement[];
  readonly movementsStatus: RequestStatus;
  readonly hasMore: boolean;
  readonly filters: MovementFilters;
  readonly setFilters: (next: MovementFilters) => void;
  readonly loadMore: () => void;
  readonly refetch: () => void;
  readonly archive: () => Promise<boolean>;
  readonly restore: () => Promise<boolean>;
  readonly can: {
    readonly write: boolean;
    readonly adjust: boolean;
    readonly archive: boolean;
    readonly stock: boolean;
  };
}

const NO_FILTERS: MovementFilters = { type: [], dateFrom: null, dateTo: null };

export function useItemDetail(id: string): UseItemDetailResult {
  const dispatch = useAppDispatch();
  const { can } = usePermissions();
  const item = useAppSelector(selectItemDetail);
  const status = useAppSelector(selectItemDetailStatus);
  const error = useAppSelector(selectItemDetailError);
  const movements = useAppSelector(selectItemMovements);
  const movementsStatus = useAppSelector(selectItemMovementsStatus);
  const cursor = useAppSelector(selectItemMovementsCursor);
  const hasMore = useAppSelector(selectItemMovementsHasMore);
  const stale = useAppSelector(selectItemDetailStale);
  const impaired = useAppSelector(selectNetworkImpaired);
  const [filters, setFilters] = useState<MovementFilters>(NO_FILTERS);
  const canStock = can('inventory.stock.read');

  useEffect(() => {
    const promise = dispatch(fetchItemDetail(id));
    return () => promise.abort();
  }, [dispatch, id]);

  useEffect(() => {
    if (!canStock) return undefined;
    const promise = dispatch(fetchItemMovements({ id, filters, cursor: null }));
    return () => promise.abort();
  }, [dispatch, id, filters, canStock]);

  /* After an adjustment posted from this page (INVALIDATION.postStockAdjustment). */
  useEffect(() => {
    if (!stale || impaired) return;
    void dispatch(fetchItemDetail(id));
    if (canStock) void dispatch(fetchItemMovements({ id, filters, cursor: null }));
  }, [dispatch, stale, impaired, id, filters, canStock]);

  const loadMore = useCallback(() => {
    if (cursor) void dispatch(fetchItemMovements({ id, filters, cursor }));
  }, [dispatch, id, filters, cursor]);

  const refetch = useCallback(() => {
    void dispatch(fetchItemDetail(id));
  }, [dispatch, id]);

  const archive = useCallback(async () => {
    try {
      const saved = await dispatch(archiveItem(id)).unwrap();
      dispatch(
        showSnackbar({
          severity: 'success',
          id: 'items.archive.done',
          params: { name: saved.name },
        })
      );
      return true;
    } catch {
      return false;
    }
  }, [dispatch, id]);

  const restore = useCallback(async () => {
    try {
      const saved = await dispatch(restoreItem(id)).unwrap();
      dispatch(
        showSnackbar({
          severity: 'success',
          id: 'items.restore.done',
          params: { name: saved.name },
        })
      );
      return true;
    } catch {
      return false;
    }
  }, [dispatch, id]);

  const shown = item && item.id === id ? item : null;

  return useMemo(
    () => ({
      item: shown,
      status,
      error,
      movements,
      movementsStatus,
      hasMore,
      filters,
      setFilters,
      loadMore,
      refetch,
      archive,
      restore,
      can: {
        write: can('inventory.item.write'),
        adjust: can('inventory.stock.adjust'),
        archive: can('inventory.item.delete'),
        stock: canStock,
      },
    }),
    [
      shown,
      status,
      error,
      movements,
      movementsStatus,
      hasMore,
      filters,
      loadMore,
      refetch,
      archive,
      restore,
      can,
      canStock,
    ]
  );
}
