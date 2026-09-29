import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { addClosedDays, deleteClosedDay, fetchBusinessDays, saveWeekdays } from './calendarThunk';

import type { BusinessDays } from '../types/calendar.types';

/**
 * A9b (PLT-X08 §7) — the Business days screen's state, lazily injected
 * (CR-134): only that screen reads it, so the app shell does not carry it.
 */
export interface CalendarState {
  data: BusinessDays | null;
  status: RequestStatus;
  error: ApiErrorShape | null;
  savingWeekdays: boolean;
  addOpen: boolean;
  adding: boolean;
  deletingId: string | null;
}

const initialState: CalendarState = {
  data: null,
  status: 'idle',
  error: null,
  savingWeekdays: false,
  addOpen: false,
  adding: false,
  deletingId: null,
};

const byDate = <T extends { date: string }>(rows: readonly T[]): T[] =>
  [...rows].sort((a, b) => a.date.localeCompare(b.date));

const calendarSlice = createSlice({
  name: 'calendar',
  initialState,
  reducers: {
    addDialogOpened(state) {
      state.addOpen = true;
    },
    addDialogClosed(state) {
      state.addOpen = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBusinessDays.pending, (state) => {
        state.status = state.data ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchBusinessDays.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.data = action.payload as Draft<BusinessDays>;
      })
      .addCase(fetchBusinessDays.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(saveWeekdays.pending, (state) => {
        state.savingWeekdays = true;
      })
      .addCase(saveWeekdays.fulfilled, (state, action) => {
        state.savingWeekdays = false;
        if (state.data) {
          state.data.closedWeekdays = [...action.payload.value];
          state.data.moduleWeekdays = { ...action.payload.modules } as Draft<
            BusinessDays['moduleWeekdays']
          >;
        }
      })
      .addCase(saveWeekdays.rejected, (state) => {
        state.savingWeekdays = false;
      })
      .addCase(addClosedDays.pending, (state) => {
        state.adding = true;
      })
      .addCase(addClosedDays.fulfilled, (state, action) => {
        state.adding = false;
        state.addOpen = false;
        if (state.data) state.data.rows = byDate([...state.data.rows, ...action.payload.rows]);
      })
      .addCase(addClosedDays.rejected, (state) => {
        state.adding = false;
      })
      .addCase(deleteClosedDay.pending, (state, action) => {
        state.deletingId = action.meta.arg;
      })
      .addCase(deleteClosedDay.fulfilled, (state, action) => {
        state.deletingId = null;
        if (state.data) state.data.rows = state.data.rows.filter((r) => r.id !== action.payload);
      })
      .addCase(deleteClosedDay.rejected, (state) => {
        state.deletingId = null;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { addDialogOpened, addDialogClosed } = calendarSlice.actions;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof calendarSlice> {}
}

const injected = calendarSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

export const selectBusinessDays = (state: RootState): BusinessDays | null => slice$(state).data;
export const selectCalendarStatus = (state: RootState): RequestStatus => slice$(state).status;
export const selectCalendarError = (state: RootState): ApiErrorShape | null => slice$(state).error;
export const selectSavingWeekdays = (state: RootState): boolean => slice$(state).savingWeekdays;
export const selectAddOpen = (state: RootState): boolean => slice$(state).addOpen;
export const selectAdding = (state: RootState): boolean => slice$(state).adding;
export const selectDeletingId = (state: RootState): string | null => slice$(state).deletingId;
