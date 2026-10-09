import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import './libraryInvalidation';

import type { LibraryMoney } from '../types/money.types';

/** Library P0 — the month's money; the service loads with the first request. */
const service = () => import('../api/libraryMoneyService');

export const fetchLibraryMoney = createAsyncThunk<
  LibraryMoney,
  { from: string; to: string },
  { rejectValue: ApiErrorShape }
>('libraryMoney/fetch', async ({ from, to }, { signal, rejectWithValue }) => {
  try {
    return await (await service()).getLibraryMoney(from, to, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'library.money.error'));
  }
});
