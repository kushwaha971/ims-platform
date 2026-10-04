import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  fetchLibrarySettings,
  raiseLibraryNumber,
  saveLibrarySettings,
} from './librarySettingsThunk';

import type { LibrarySettingsBundle } from '../types/settings.types';

/**
 * F02 (LIB-01 §7) — `/library/settings`: the row, the two counters and the
 * library's closed weekdays. Injected lazily: only the settings route pays.
 */
export interface LibrarySettingsState {
  bundle: LibrarySettingsBundle | null;
  status: RequestStatus;
  error: ApiErrorShape | null;
  saving: boolean;
  raising: boolean;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: LibrarySettingsState = {
  bundle: null,
  status: 'idle',
  error: null,
  saving: false,
  raising: false,
  stale: false,
  staleUrgency: null,
};

const librarySettingsSlice = createSlice({
  name: 'librarySettings',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    acceptInvalidation<LibrarySettingsState>('librarySettings')(builder);
    builder
      .addCase(fetchLibrarySettings.pending, (state) => {
        state.status = state.bundle ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchLibrarySettings.fulfilled, (state, action) => {
        state.bundle = action.payload as Draft<LibrarySettingsBundle>;
        state.status = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchLibrarySettings.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(saveLibrarySettings.pending, (state) => {
        state.saving = true;
      })
      .addCase(saveLibrarySettings.fulfilled, (state, action) => {
        state.saving = false;
        state.bundle = action.payload as Draft<LibrarySettingsBundle>;
      })
      .addCase(saveLibrarySettings.rejected, (state) => {
        state.saving = false;
      })
      .addCase(raiseLibraryNumber.pending, (state) => {
        state.raising = true;
      })
      .addCase(raiseLibraryNumber.fulfilled, (state) => {
        state.raising = false;
      })
      .addCase(raiseLibraryNumber.rejected, (state) => {
        state.raising = false;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof librarySettingsSlice> {}
}

const injected = librarySettingsSlice.injectInto(rootReducer);

export const selectLibrarySettings = (state: RootState): LibrarySettingsState =>
  injected.selectSlice(state);
