import { createSlice, type Draft, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { cacheInvalidated } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchDayBook } from './dayBookThunk';

import type { DayBookData, DayBookFilters } from '../types/reports.types';

/**
 * RPT-02 — one page of the day book, held whole with the question it answers.
 *
 * Never patched: a running balance is a property of the whole ordering, so
 * one new row anywhere before this page moves every figure on it. Like the
 * dashboard, it goes stale on ANY invalidation — the day book is every
 * module's writes in one list — and is re-read on the next mount.
 */
export interface DayBookState {
  data: DayBookData | null;
  asked: DayBookFilters | null;
  status: RequestStatus;
  error: ApiErrorShape | null;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: DayBookState = {
  data: null,
  asked: null,
  status: 'idle',
  error: null,
  stale: false,
  staleUrgency: null,
};

export const sameDayBookAsk = (a: DayBookFilters | null, b: DayBookFilters | null): boolean =>
  !!a &&
  !!b &&
  a.dateFrom === b.dateFrom &&
  a.dateTo === b.dateTo &&
  a.includeVoid === b.includeVoid &&
  a.page === b.page &&
  a.types.join(',') === b.types.join(',');

const dayBookSlice = createSlice({
  name: 'reportDayBook',
  initialState,
  reducers: {
    /** A new question: the old rows go, they answered something else. */
    dayBookAsked(state, action: PayloadAction<DayBookFilters>) {
      if (sameDayBookAsk(state.asked as DayBookFilters | null, action.payload)) return;
      state.asked = action.payload as Draft<DayBookFilters>;
      state.data = null;
      state.status = 'loading';
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(cacheInvalidated, (state) => {
        state.stale = true;
        state.staleUrgency = state.staleUrgency === 'now' ? 'now' : 'next-mount';
      })
      .addCase(fetchDayBook.pending, (state) => {
        state.status = state.data ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchDayBook.fulfilled, (state, action) => {
        if (!sameDayBookAsk(state.asked as DayBookFilters | null, action.meta.arg)) return;
        state.data = action.payload as Draft<DayBookData>;
        state.status = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchDayBook.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { dayBookAsked } = dayBookSlice.actions;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof dayBookSlice> {}
}

const injected = dayBookSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

export const selectDayBookData = (state: RootState): DayBookData | null => slice$(state).data;
export const selectDayBookStatus = (state: RootState): RequestStatus => slice$(state).status;
export const selectDayBookError = (state: RootState): ApiErrorShape | null => slice$(state).error;
export const selectDayBookStale = (state: RootState): boolean => slice$(state).stale;
