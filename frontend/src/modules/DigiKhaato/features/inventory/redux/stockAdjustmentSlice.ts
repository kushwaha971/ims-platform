import { createSlice, type Draft, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchStockAdjustment, postStockAdjustment } from './stockThunk';

import type { AdjustmentFormLine, StockAdjustment } from '../types/item.types';

/**
 * INV-06 — whether the adjustment drawer is open, with which items
 * preselected, and the adjustment detail sheet. Entry points on three screens
 * (list row, item page, low-stock list) open the same drawer through here.
 */
export interface StockAdjustmentState {
  open: boolean;
  prefill: AdjustmentFormLine[];
  status: RequestStatus;
  lastPosted: StockAdjustment | null;
  viewingId: string | null;
  viewing: StockAdjustment | null;
  viewingStatus: RequestStatus;
  viewingError: ApiErrorShape | null;
}

const initialState: StockAdjustmentState = {
  open: false,
  prefill: [],
  status: 'idle',
  lastPosted: null,
  viewingId: null,
  viewing: null,
  viewingStatus: 'idle',
  viewingError: null,
};

const stockAdjustmentSlice = createSlice({
  name: 'stockAdjustment',
  initialState,
  reducers: {
    adjustmentOpened(state, action: PayloadAction<readonly AdjustmentFormLine[] | undefined>) {
      state.open = true;
      state.prefill = (action.payload ?? []) as Draft<AdjustmentFormLine>[];
      state.status = 'idle';
    },
    adjustmentClosed(state) {
      state.open = false;
      state.prefill = [];
    },
    adjustmentViewOpened(state, action: PayloadAction<string>) {
      state.viewingId = action.payload;
    },
    adjustmentViewClosed(state) {
      state.viewingId = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(postStockAdjustment.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(postStockAdjustment.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.lastPosted = action.payload as Draft<StockAdjustment>;
        state.open = false;
        state.prefill = [];
      })
      .addCase(postStockAdjustment.rejected, (state) => {
        state.status = 'failed';
      })
      .addCase(fetchStockAdjustment.pending, (state) => {
        state.viewingStatus = 'loading';
        state.viewingError = null;
      })
      .addCase(fetchStockAdjustment.fulfilled, (state, action) => {
        state.viewing = action.payload as Draft<StockAdjustment>;
        state.viewingStatus = 'succeeded';
      })
      .addCase(fetchStockAdjustment.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.viewingStatus = 'failed';
        state.viewingError = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { adjustmentOpened, adjustmentClosed, adjustmentViewOpened, adjustmentViewClosed } =
  stockAdjustmentSlice.actions;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof stockAdjustmentSlice> {}
}

const injected = stockAdjustmentSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

export const selectAdjustmentOpen = (state: RootState): boolean => slice$(state).open;
export const selectAdjustmentPrefill = (state: RootState): readonly AdjustmentFormLine[] =>
  slice$(state).prefill;
export const selectAdjustmentStatus = (state: RootState): RequestStatus => slice$(state).status;
export const selectAdjustmentViewingId = (state: RootState): string | null =>
  slice$(state).viewingId;
export const selectAdjustmentViewing = (state: RootState): StockAdjustment | null =>
  slice$(state).viewing;
export const selectAdjustmentViewingStatus = (state: RootState): RequestStatus =>
  slice$(state).viewingStatus;
