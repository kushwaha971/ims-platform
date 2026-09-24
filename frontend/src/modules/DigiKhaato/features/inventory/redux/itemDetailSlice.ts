import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  archiveItem,
  fetchItemDetail,
  fetchItemMovements,
  restoreItem,
  saveItem,
} from './itemThunk';

import type { Item, StockMovement } from '../types/item.types';

/** INV-03 — one item and its movement history. Lazily injected (CR-134). */
export interface ItemDetailState {
  itemId: string | null;
  item: Item | null;
  status: RequestStatus;
  error: ApiErrorShape | null;
  movements: StockMovement[];
  nextCursor: string | null;
  hasMore: boolean;
  movementsStatus: RequestStatus;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: ItemDetailState = {
  itemId: null,
  item: null,
  status: 'idle',
  error: null,
  movements: [],
  nextCursor: null,
  hasMore: false,
  movementsStatus: 'idle',
  stale: false,
  staleUrgency: null,
};

const itemDetailSlice = createSlice({
  name: 'itemDetail',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    acceptInvalidation<ItemDetailState>('itemDetail')(builder);
    builder
      .addCase(fetchItemDetail.pending, (state, action) => {
        /* Another item: clear, so item A's figures never sit under item B's name. */
        if (state.itemId !== action.meta.arg) {
          Object.assign(state, initialState);
          state.itemId = action.meta.arg;
        }
        state.status = state.item ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchItemDetail.fulfilled, (state, action) => {
        if (state.itemId !== action.meta.arg) return;
        state.item = action.payload as Draft<Item>;
        state.status = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchItemDetail.rejected, (state, action) => {
        if (action.meta.aborted || state.itemId !== action.meta.arg) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(fetchItemMovements.pending, (state) => {
        state.movementsStatus = 'loading';
      })
      .addCase(fetchItemMovements.fulfilled, (state, action) => {
        if (state.itemId !== action.meta.arg.id) return;
        const rows = action.payload.rows as Draft<StockMovement>[];
        state.movements = action.payload.append ? [...state.movements, ...rows] : rows;
        state.nextCursor = action.payload.nextCursor;
        state.hasMore = action.payload.hasMore;
        state.movementsStatus = 'succeeded';
      })
      .addCase(fetchItemMovements.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.movementsStatus = 'failed';
      })
      /* The item a save, archive or restore RETURNS is the item, so it is
         written straight in — a real patch, matching the INVALIDATION entry. */
      .addCase(saveItem.fulfilled, (state, action) => {
        if (state.itemId === action.payload.item.id)
          state.item = action.payload.item as Draft<Item>;
      })
      .addCase(archiveItem.fulfilled, (state, action) => {
        if (state.itemId === action.payload.id) state.item = action.payload as Draft<Item>;
      })
      .addCase(restoreItem.fulfilled, (state, action) => {
        if (state.itemId === action.payload.id) state.item = action.payload as Draft<Item>;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof itemDetailSlice> {}
}

const injected = itemDetailSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

export const selectItemDetail = (state: RootState): Item | null => slice$(state).item;
export const selectItemDetailId = (state: RootState): string | null => slice$(state).itemId;
export const selectItemDetailStatus = (state: RootState): RequestStatus => slice$(state).status;
export const selectItemDetailError = (state: RootState): ApiErrorShape | null =>
  slice$(state).error;
export const selectItemMovements = (state: RootState): readonly StockMovement[] =>
  slice$(state).movements;
export const selectItemMovementsCursor = (state: RootState): string | null =>
  slice$(state).nextCursor;
export const selectItemMovementsHasMore = (state: RootState): boolean => slice$(state).hasMore;
export const selectItemMovementsStatus = (state: RootState): RequestStatus =>
  slice$(state).movementsStatus;
export const selectItemDetailStale = (state: RootState): boolean => slice$(state).stale;
