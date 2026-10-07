import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import './libraryInvalidation';

import type { LibraryHome } from '../types/home.types';

/** W04 — the home's one read; the service loads with the first request. */
const service = () => import('../api/libraryHomeService');

export const fetchLibraryHome = createAsyncThunk<LibraryHome, void, { rejectValue: ApiErrorShape }>(
  'libraryHome/fetch',
  async (_arg, { signal, rejectWithValue }) => {
    try {
      return await (await service()).getLibraryHome(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.home.error.title'));
    }
  }
);
