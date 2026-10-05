import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchLendingRoutes, fetchLendingToday } from './lendingThunk';

import type { LendingRoute, TodayRound } from '../types/lending.types';

/** Today's round and the routes it is filtered by. Injected lazily. */
export interface LendingTodayState {
  round: TodayRound | null;
  route: string;
  routes: LendingRoute[];
  status: RequestStatus;
  error: ApiErrorShape | null;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: LendingTodayState = {
  round: null,
  route: '',
  routes: [],
  status: 'idle',
  error: null,
  stale: false,
  staleUrgency: null,
};

const lendingTodaySlice = createSlice({
  name: 'lendingToday',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    acceptInvalidation<LendingTodayState>('lendingToday')(builder);
    builder
      .addCase(fetchLendingToday.pending, (state, action) => {
        state.status = state.round ? 'refreshing' : 'loading';
        state.route = action.meta.arg;
        state.error = null;
      })
      .addCase(fetchLendingToday.fulfilled, (state, action) => {
        state.round = action.payload as Draft<TodayRound>;
        state.status = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchLendingToday.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(fetchLendingRoutes.fulfilled, (state, action) => {
        state.routes = action.payload as Draft<LendingRoute>[];
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof lendingTodaySlice> {}
}

const injected = lendingTodaySlice.injectInto(rootReducer);

export const selectLendingToday = (state: RootState): LendingTodayState =>
  injected.selectSlice(state);
