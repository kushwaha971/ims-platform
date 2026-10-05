import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  fetchLibrarySeatMap,
  fetchLibrarySeats,
  fetchLibraryShifts,
  saveLibraryShift,
  setLibraryShiftActive,
  setLibrarySeatActive,
} from './librarySeatThunk';

import type { LibrarySeat, LibraryShift, SeatMap } from '../types/seat.types';

/**
 * W02 — the shifts and seats every study-library screen reads (admission, the
 * seat map, settings), and the map last asked for. Injected lazily.
 */
export interface LibrarySeatsState {
  shifts: LibraryShift[];
  seats: LibrarySeat[];
  listsStatus: RequestStatus;
  map: SeatMap | null;
  mapStatus: RequestStatus;
  error: ApiErrorShape | null;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: LibrarySeatsState = {
  shifts: [],
  seats: [],
  listsStatus: 'idle',
  map: null,
  mapStatus: 'idle',
  error: null,
  stale: false,
  staleUrgency: null,
};

const upsert = <T extends { id: string }>(rows: T[], row: T): T[] =>
  rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : [...rows, row];

const librarySeatsSlice = createSlice({
  name: 'librarySeats',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    acceptInvalidation<LibrarySeatsState>('librarySeats')(builder);
    builder
      .addCase(fetchLibraryShifts.pending, (state) => {
        state.listsStatus = state.listsStatus === 'succeeded' ? 'refreshing' : 'loading';
      })
      .addCase(fetchLibraryShifts.fulfilled, (state, action) => {
        state.shifts = action.payload as Draft<LibraryShift>[];
        state.listsStatus = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchLibraryShifts.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.listsStatus = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(fetchLibrarySeats.fulfilled, (state, action) => {
        state.seats = action.payload as Draft<LibrarySeat>[];
      })
      .addCase(fetchLibrarySeatMap.pending, (state) => {
        state.mapStatus = state.map ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchLibrarySeatMap.fulfilled, (state, action) => {
        state.map = action.payload as Draft<SeatMap>;
        state.mapStatus = 'succeeded';
      })
      .addCase(fetchLibrarySeatMap.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.mapStatus = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(saveLibraryShift.fulfilled, (state, action) => {
        state.shifts = upsert(state.shifts, action.payload as Draft<LibraryShift>);
      })
      .addCase(setLibraryShiftActive.fulfilled, (state, action) => {
        state.shifts = upsert(state.shifts, action.payload as Draft<LibraryShift>);
      })
      .addCase(setLibrarySeatActive.fulfilled, (state, action) => {
        state.seats = upsert(state.seats, action.payload as Draft<LibrarySeat>);
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof librarySeatsSlice> {}
}

const injected = librarySeatsSlice.injectInto(rootReducer);

export const selectLibrarySeats = (state: RootState): LibrarySeatsState =>
  injected.selectSlice(state);
