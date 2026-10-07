import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import type { SelfCheckInResult } from '../types/selfCheckin.types';

/** Library P0 — the student's no-login check-in page; the service loads with the request. */
const service = () => import('../api/selfCheckinService');

type Reject = { rejectValue: ApiErrorShape };

/** QUERY. Which library this poster belongs to. */
export const fetchSelfCheckIn = createAsyncThunk<string, string, Reject>(
  'selfCheckin/fetchPage',
  async (token, { signal, rejectWithValue }) => {
    try {
      return await (await service()).getSelfCheckIn(token, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  }
);

/** QUERY (an idempotent POST). The student checks in; a second scan says "already". */
export const submitSelfCheckIn = createAsyncThunk<
  SelfCheckInResult,
  { token: string; memberNumber: string; mobileLast4: string },
  Reject
>('selfCheckin/submit', async ({ token, memberNumber, mobileLast4 }, { rejectWithValue }) => {
  try {
    return await (await service()).postSelfCheckIn(token, memberNumber, mobileLast4);
  } catch (error) {
    return rejectWithValue(toApiError(error));
  }
});
