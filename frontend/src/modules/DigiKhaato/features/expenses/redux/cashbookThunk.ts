import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import { getCashbook } from '../api/cashbookService';

import type { CashbookData, CashbookFilters } from '../types/cashbook.types';

/**
 * QUERY. One range of the cashbook. `null` filters is the till request a
 * member scoped to today's cash makes (FR-13) — see `getCashbook`.
 */
export const fetchCashbook = createAsyncThunk<
  CashbookData,
  CashbookFilters | null,
  { rejectValue: ApiErrorShape }
>('cashbook/fetchCashbook', async (filters, { signal, rejectWithValue }) => {
  try {
    return await getCashbook(filters, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'cashbook.error.title'));
  }
});
