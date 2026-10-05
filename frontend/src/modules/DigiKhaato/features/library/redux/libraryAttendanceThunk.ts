import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import './libraryInvalidation';

import type { AttendanceDay, CheckInOutcome } from '../types/attendance.types';

/** W05 — the day register's thunks; the service loads with the first request. */
const service = () => import('../api/libraryAttendanceService');

type Reject = { rejectValue: ApiErrorShape };

export const fetchLibraryAttendance = createAsyncThunk<AttendanceDay, string, Reject>(
  'libraryAttendance/fetch',
  async (on, { signal, rejectWithValue }) => {
    try {
      return await (await service()).getAttendanceDay(on, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.attendance.error.title'));
    }
  }
);

export const checkInLibraryStudent = createAsyncThunk<
  CheckInOutcome,
  { membershipId: string; overrideReason?: string },
  Reject
>('libraryAttendance/checkIn', async ({ membershipId, overrideReason }, { rejectWithValue }) => {
  try {
    return await (await service()).checkIn(membershipId, overrideReason);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'library.attendance.error.save'));
  }
});

export const checkOutLibraryStudent = createAsyncThunk<string, string, Reject>(
  'libraryAttendance/checkOut',
  async (markId, { rejectWithValue }) => {
    try {
      await (await service()).checkOut(markId);
      return markId;
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.attendance.error.save'));
    }
  }
);

export const fetchMemberAttendance = createAsyncThunk<
  { membershipId: string; month: string; days: string[] },
  { membershipId: string; month: string },
  Reject
>('libraryAttendance/fetchMember', async ({ membershipId, month }, { signal, rejectWithValue }) => {
  try {
    const days = await (await service()).getMemberAttendance(membershipId, month, signal);
    return { membershipId, month, days };
  } catch (error) {
    return rejectWithValue(toApiError(error, 'library.attendance.error.title'));
  }
});
