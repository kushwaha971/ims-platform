import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchDues, fetchSchedule } from './duesThunk';

import type { DuesPage, Schedule } from '../types/dues.types';

/**
 * DUE-01 (FRD 00 DUE-01 §7) — dues keyed by the caller's key (a party, a
 * subject) and schedules keyed by id. Lazily injected (CR-134): only a screen
 * that shows dues imports it, and no screen does until a vertical consumes the
 * engine (Q-D5).
 */
export interface DuesState {
  pages: Record<string, DuesPage>;
  status: Record<string, RequestStatus>;
  error: Record<string, ApiErrorShape | null>;
  /** The newest request per key: an older response arriving last is dropped. */
  latestRequest: Record<string, string>;
  schedules: Record<string, Schedule>;
  scheduleStatus: Record<string, RequestStatus>;
}

const initialState: DuesState = {
  pages: {},
  status: {},
  error: {},
  latestRequest: {},
  schedules: {},
  scheduleStatus: {},
};

const duesSlice = createSlice({
  name: 'dues',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchDues.pending, (state, action) => {
        const { key } = action.meta.arg;
        state.status[key] = state.pages[key] ? 'refreshing' : 'loading';
        state.error[key] = null;
        state.latestRequest[key] = action.meta.requestId;
      })
      .addCase(fetchDues.fulfilled, (state, action) => {
        const { key } = action.meta.arg;
        if (state.latestRequest[key] !== action.meta.requestId) return;
        state.status[key] = 'succeeded';
        state.pages[key] = action.payload as Draft<DuesPage>;
      })
      .addCase(fetchDues.rejected, (state, action) => {
        const { key } = action.meta.arg;
        if (action.meta.aborted || state.latestRequest[key] !== action.meta.requestId) return;
        state.status[key] = 'failed';
        state.error[key] = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(fetchSchedule.pending, (state, action) => {
        state.scheduleStatus[action.meta.arg] = state.schedules[action.meta.arg]
          ? 'refreshing'
          : 'loading';
      })
      .addCase(fetchSchedule.fulfilled, (state, action) => {
        state.scheduleStatus[action.meta.arg] = 'succeeded';
        state.schedules[action.meta.arg] = action.payload as Draft<Schedule>;
      })
      .addCase(fetchSchedule.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.scheduleStatus[action.meta.arg] = 'failed';
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof duesSlice> {}
}

const injected = duesSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

export const selectDuesPage =
  (key: string) =>
  (state: RootState): DuesPage | null =>
    slice$(state).pages[key] ?? null;
export const selectDuesStatus =
  (key: string) =>
  (state: RootState): RequestStatus =>
    slice$(state).status[key] ?? 'idle';
export const selectDuesError =
  (key: string) =>
  (state: RootState): ApiErrorShape | null =>
    slice$(state).error[key] ?? null;
export const selectSchedule =
  (id: string) =>
  (state: RootState): Schedule | null =>
    slice$(state).schedules[id] ?? null;
export const selectScheduleStatus =
  (id: string) =>
  (state: RootState): RequestStatus =>
    slice$(state).scheduleStatus[id] ?? 'idle';
