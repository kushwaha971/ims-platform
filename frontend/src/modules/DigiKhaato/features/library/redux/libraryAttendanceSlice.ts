import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  checkInLibraryStudent,
  checkOutLibraryStudent,
  fetchLibraryAttendance,
  fetchMemberAttendance,
} from './libraryAttendanceThunk';

import type { AttendanceDay } from '../types/attendance.types';

/**
 * W05 — the day register on `/library/attendance`, and the days one student
 * came (the student page's month strip). Injected lazily.
 */
export interface LibraryAttendanceState {
  day: AttendanceDay | null;
  status: RequestStatus;
  error: ApiErrorShape | null;
  /** The membership whose check-in or -out is in flight, to busy just that row. */
  busyId: string | null;
  member: { membershipId: string; month: string; days: string[] } | null;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: LibraryAttendanceState = {
  day: null,
  status: 'idle',
  error: null,
  busyId: null,
  member: null,
  stale: false,
  staleUrgency: null,
};

const libraryAttendanceSlice = createSlice({
  name: 'libraryAttendance',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    acceptInvalidation<LibraryAttendanceState>('libraryAttendance')(builder);
    builder
      .addCase(fetchLibraryAttendance.pending, (state) => {
        state.status = state.day ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchLibraryAttendance.fulfilled, (state, action) => {
        state.day = action.payload as Draft<AttendanceDay>;
        state.status = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchLibraryAttendance.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(checkInLibraryStudent.pending, (state, action) => {
        state.busyId = action.meta.arg.membershipId;
      })
      .addCase(checkInLibraryStudent.fulfilled, (state) => {
        state.busyId = null;
      })
      .addCase(checkInLibraryStudent.rejected, (state) => {
        state.busyId = null;
      })
      .addCase(checkOutLibraryStudent.pending, (state, action) => {
        state.busyId =
          state.day?.rows.find((row) => row.markId === action.meta.arg)?.membershipId ?? null;
      })
      .addCase(checkOutLibraryStudent.fulfilled, (state) => {
        state.busyId = null;
      })
      .addCase(checkOutLibraryStudent.rejected, (state) => {
        state.busyId = null;
      })
      .addCase(fetchMemberAttendance.fulfilled, (state, action) => {
        state.member = action.payload;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof libraryAttendanceSlice> {}
}

const injected = libraryAttendanceSlice.injectInto(rootReducer);

export const selectLibraryAttendance = (state: RootState): LibraryAttendanceState =>
  injected.selectSlice(state);
