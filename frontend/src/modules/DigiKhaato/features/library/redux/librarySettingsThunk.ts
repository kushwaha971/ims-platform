import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import './libraryInvalidation';

import type {
  LibraryNumberKind,
  LibrarySettings,
  LibrarySettingsBundle,
} from '../types/settings.types';

/**
 * F02 (LIB-01 §7) — the settings screen's thunks. The service is imported
 * inside each thunk, so a screen that never opens settings never downloads it.
 */
const service = () => import('../api/librarySettingsService');

type Reject = { rejectValue: ApiErrorShape };

export const fetchLibrarySettings = createAsyncThunk<LibrarySettingsBundle, void, Reject>(
  'librarySettings/fetch',
  async (_arg, { signal, rejectWithValue }) => {
    try {
      return await (await service()).getLibrarySettings(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.settings.error.title'));
    }
  }
);

export const saveLibrarySettings = createAsyncThunk<LibrarySettingsBundle, LibrarySettings, Reject>(
  'librarySettings/save',
  async (settings, { rejectWithValue }) => {
    try {
      return await (await service()).putLibrarySettings(settings);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.settings.error.save'));
    }
  }
);

export const raiseLibraryNumber = createAsyncThunk<
  { kind: LibraryNumberKind; nextNumber: number },
  { kind: LibraryNumberKind; nextNumber: number },
  Reject
>('librarySettings/raiseNumber', async (arg, { rejectWithValue }) => {
  try {
    await (await service()).raiseLibraryNumber(arg.kind, arg.nextNumber);
    return arg;
  } catch (error) {
    return rejectWithValue(toApiError(error, 'library.settings.error.save'));
  }
});
