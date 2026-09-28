import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { cacheInvalidated } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchDashboard } from './dashboardThunk';

import type { DashboardData } from '../types/reports.types';

/**
 * RPT-01 — the dashboard's one response, held whole and injected lazily with
 * its route (CR-134).
 *
 * ── Stale after ANY write, not after a list of them ─────────────────────────
 * TSK-RPT-01-06: "refreshes after any mutation in the invalidation map". The
 * dashboard summarises every module, so the honest list of mutations that
 * move it is all of them — and a hand-kept list in `map.ts` is one more line
 * every future mutation must remember. So this slice listens to the map's own
 * signal and goes stale whichever slices it names; the hook refetches on the
 * next mount, and the server's write-through has already dropped its snapshot.
 */
export interface DashboardState {
  data: DashboardData | null;
  status: RequestStatus;
  error: ApiErrorShape | null;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: DashboardState = {
  data: null,
  status: 'idle',
  error: null,
  stale: false,
  staleUrgency: null,
};

const dashboardSlice = createSlice({
  name: 'reportDashboard',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(cacheInvalidated, (state) => {
        state.stale = true;
        state.staleUrgency = state.staleUrgency === 'now' ? 'now' : 'next-mount';
      })
      .addCase(fetchDashboard.pending, (state) => {
        state.status = state.data ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchDashboard.fulfilled, (state, action) => {
        state.data = action.payload as Draft<DashboardData>;
        state.status = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchDashboard.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof dashboardSlice> {}
}

const injected = dashboardSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

export const selectDashboardData = (state: RootState): DashboardData | null => slice$(state).data;
export const selectDashboardStatus = (state: RootState): RequestStatus => slice$(state).status;
export const selectDashboardError = (state: RootState): ApiErrorShape | null => slice$(state).error;
export const selectDashboardStale = (state: RootState): boolean => slice$(state).stale;
