import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import './libraryInvalidation';

import type { CheckInPoster } from '../types/attendance.types';

/** Library P0 — the door's poster for QR self check-in (the student's page is core). */
const service = () => import('../api/selfCheckinService');

type Reject = { rejectValue: ApiErrorShape };

/** QUERY. The door's poster: the link and its QR. */
export const fetchCheckInPoster = createAsyncThunk<CheckInPoster, void, Reject>(
  'libraryCheckin/fetchPoster',
  async (_arg, { signal, rejectWithValue }) => {
    try {
      return await (await service()).getCheckInPoster(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.checkin.error'));
    }
  }
);
