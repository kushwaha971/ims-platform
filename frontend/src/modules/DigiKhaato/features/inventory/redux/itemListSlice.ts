import { createSlice, type Draft, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchItemList } from './itemThunk';

import type { ItemListFilters, ItemListResult, ItemListRow } from '../types/item.types';

/**
 * INV-02 — the item list. Route-local, so it is injected lazily (CR-134): the
 * reducer arrives with `/items`' chunk, not with every page in the product.
 */
export interface ItemListState {
  rows: ItemListRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  totals: ItemListResult['totals'] | null;
  counts: ItemListResult['counts'] | null;
  status: RequestStatus;
  error: ApiErrorShape | null;
  filters: ItemListFilters | null;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: ItemListState = {
  rows: [],
  page: 1,
  pageSize: 25,
  total: 0,
  totalPages: 0,
  totals: null,
  counts: null,
  status: 'idle',
  error: null,
  filters: null,
  stale: false,
  staleUrgency: null,
};

/** Two requests with the same filters are the same request. */
const sameFilters = (a: ItemListFilters | null, b: ItemListFilters): boolean =>
  a !== null && JSON.stringify(a) === JSON.stringify(b);

const itemListSlice = createSlice({
  name: 'itemList',
  initialState,
  reducers: {
    itemFiltersChanged(state, action: PayloadAction<ItemListFilters>) {
      state.filters = action.payload as Draft<ItemListFilters>;
    },
  },
  extraReducers: (builder) => {
    acceptInvalidation<ItemListState>('itemList')(builder);
    builder
      .addCase(fetchItemList.pending, (state) => {
        state.status = state.rows.length > 0 ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchItemList.fulfilled, (state, action) => {
        /* A late page for filters the merchant has already left is dropped:
           the "Low" tab must never show the "All" rows that raced it. */
        if (state.filters && !sameFilters(state.filters as ItemListFilters, action.meta.arg))
          return;
        const result = action.payload;
        state.rows = result.rows as Draft<ItemListRow>[];
        state.page = result.page;
        state.pageSize = result.pageSize;
        state.total = result.total;
        state.totalPages = result.totalPages;
        state.totals = result.totals;
        state.counts = result.counts;
        state.status = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchItemList.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { itemFiltersChanged } = itemListSlice.actions;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof itemListSlice> {}
}

const injected = itemListSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

export const selectItemRows = (state: RootState): readonly ItemListRow[] => slice$(state).rows;
export const selectItemListStatus = (state: RootState): RequestStatus => slice$(state).status;
export const selectItemListError = (state: RootState): ApiErrorShape | null => slice$(state).error;
export const selectItemListTotals = (state: RootState): ItemListState['totals'] =>
  slice$(state).totals;
export const selectItemListCounts = (state: RootState): ItemListState['counts'] =>
  slice$(state).counts;
export const selectItemListPage = (state: RootState): number => slice$(state).page;
export const selectItemListPageSize = (state: RootState): number => slice$(state).pageSize;
export const selectItemListTotal = (state: RootState): number => slice$(state).total;
export const selectItemListTotalPages = (state: RootState): number => slice$(state).totalPages;
export const selectItemListStale = (state: RootState): boolean => slice$(state).stale;
