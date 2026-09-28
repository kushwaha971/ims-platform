import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import type { DayBookData, DayBookFilters } from '../types/reports.types';

/** QUERY. RPT-02 — one page of the day book for one filter set. */
export const fetchDayBook = createAsyncThunk<
  DayBookData,
  DayBookFilters,
  { rejectValue: ApiErrorShape }
>('reportDayBook/fetchDayBook', async (filters, { signal, rejectWithValue }) => {
  try {
    // Imported here, not at the top: see `dashboardThunk.ts` on the shell.
    const { getDayBook } = await import('../api/dayBookService');
    return await getDayBook(filters, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'reports.daybook.error.title'));
  }
});
