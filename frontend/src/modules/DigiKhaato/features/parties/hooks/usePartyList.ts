'use client';

import { useCallback, useEffect, useState } from 'react';

import { SEARCH_DEBOUNCE_MS } from 'src/constants';
import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDebounce } from 'src/hooks/useDebounce';
import type { ApiErrorShape, PageMeta, RequestStatus } from 'src/types/api.types';

import {
  filtersChanged,
  filtersCleared,
  pageChanged,
  selectionChanged,
  selectPartyFilters,
  selectPartyListError,
  selectPartyListMeta,
  selectPartyListStale,
  selectPartyListStatus,
  selectPartyListTotals,
  selectPartyListTotalsScope,
  selectPartyRows,
  selectPartySelection,
} from '../redux/partyListSlice';
import { fetchPartyList } from '../redux/partyListThunk';

import type { Party, PartyListFilters } from '../types/party.types';
import type { PartyListTotals } from '../view-model/partyDisplay';


export interface UsePartyListResult {
  readonly rows: readonly Party[];
  readonly meta: PageMeta;
  readonly filters: PartyListFilters;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
  /** The two header figures, and which set they describe. */
  readonly totals: PartyListTotals;
  readonly totalsScope: 'filtered' | 'page';
  readonly selectedIds: readonly string[];
  readonly setSelectedIds: (ids: readonly string[]) => void;
  /** Sorting is SERVER-side: it changes `ordering` and resets to page 1. */
  readonly setOrdering: (ordering: string) => void;
  readonly searchInput: string;
  readonly setSearchInput: (value: string) => void;
  readonly setFilters: (patch: Partial<PartyListFilters>) => void;
  readonly setPage: (page: number, pageSize?: number) => void;
  readonly clearFilters: () => void;
  readonly refetch: () => void;
  readonly isLoading: boolean;
  readonly isRefreshing: boolean;
  readonly isFiltered: boolean;
}

/**
 * Part 19 §19.1.1 layer 4 — the only place a component touches Redux for this
 * screen. It binds React to the store: selectors in, a thunk out, memoised
 * handlers back, and a plain typed result object (R-H-1, R-H-2). No JSX.
 */
export function usePartyList(mode: 'replace' | 'append' = 'replace'): UsePartyListResult {
  const dispatch = useAppDispatch();

  const rows = useAppSelector(selectPartyRows);
  const meta = useAppSelector(selectPartyListMeta);
  const filters = useAppSelector(selectPartyFilters);
  const status = useAppSelector(selectPartyListStatus);
  const error = useAppSelector(selectPartyListError);
  const stale = useAppSelector(selectPartyListStale);
  const totals = useAppSelector(selectPartyListTotals);
  const totalsScope = useAppSelector(selectPartyListTotalsScope);
  const selectedIds = useAppSelector(selectPartySelection);

  // The raw input is local; only the debounced value is committed to the slice,
  // so every keystroke does not produce a request or a store write (§19.3.1).
  const [searchInput, setSearchInput] = useState(filters.q);
  const debouncedSearch = useDebounce(searchInput, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    const committed = debouncedSearch.trim();
    if (committed !== filters.q) dispatch(filtersChanged({ q: committed }));
  }, [debouncedSearch, filters.q, dispatch]);

  // One effect, one request. The promise is aborted when the filter set changes
  // mid-flight so a slow page 1 can never overwrite a fast page 2.
  useEffect(() => {
    const promise = dispatch(fetchPartyList({ params: filters, mode }));
    return () => promise.abort();
  }, [dispatch, filters, mode]);

  // A mutation elsewhere marked us stale — refetch once, silently (§19.3.6).
  useEffect(() => {
    if (!stale) return;
    const promise = dispatch(fetchPartyList({ params: filters, mode: 'replace' }));
    return () => promise.abort();
  }, [stale, dispatch, filters]);

  const setFilters = useCallback(
    (patch: Partial<PartyListFilters>) => {
      dispatch(filtersChanged(patch));
    },
    [dispatch]
  );
  const setPage = useCallback(
    (page: number, pageSize?: number) => {
      dispatch(pageChanged({ page, pageSize }));
    },
    [dispatch]
  );
  const setSelectedIds = useCallback(
    (ids: readonly string[]) => {
      dispatch(selectionChanged([...ids]));
    },
    [dispatch]
  );
  const setOrdering = useCallback(
    (ordering: string) => {
      dispatch(filtersChanged({ ordering }));
    },
    [dispatch]
  );
  const clearFilters = useCallback(() => {
    setSearchInput('');
    dispatch(filtersCleared());
  }, [dispatch]);
  const refetch = useCallback(() => {
    void dispatch(fetchPartyList({ params: filters, mode: 'replace' }));
  }, [dispatch, filters]);

  return {
    rows,
    meta,
    filters,
    status,
    error,
    totals,
    totalsScope,
    selectedIds,
    setSelectedIds,
    setOrdering,
    searchInput,
    setSearchInput,
    setFilters,
    setPage,
    clearFilters,
    refetch,
    isLoading: status === 'loading',
    isRefreshing: status === 'refreshing',
    isFiltered: filters.q.length > 0,
  };
}
