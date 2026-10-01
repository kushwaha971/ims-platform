import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import { getSchedule, listDues } from '../api/duesService';

import type { DueFilters, DuesPage, Schedule } from '../types/dues.types';

type Rejected = { rejectValue: ApiErrorShape };

/**
 * QUERY — DUE-01: the dues of one party (or one subject), keyed by `key` so a
 * party panel and a subject panel on one screen do not overwrite each other.
 * The engine has no mutations, so it registers no invalidation entries of its
 * own: a vertical's write thunk names these keys in its own map (ADR-062).
 */
export const fetchDues = createAsyncThunk<
  DuesPage,
  { readonly key: string; readonly filters: DueFilters },
  Rejected
>('dues/fetchDues', async ({ filters }, { signal, rejectWithValue }) => {
  try {
    return await listDues(filters, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'error.generic'));
  }
});

/** QUERY — DUE-01: one schedule with its dues and pauses. */
export const fetchSchedule = createAsyncThunk<Schedule, string, Rejected>(
  'dues/fetchSchedule',
  async (id, { signal, rejectWithValue }) => {
    try {
      return await getSchedule(id, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'error.generic'));
    }
  }
);
