import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchLibraryHome } from './libraryHomeThunk';

import type { LibraryHome } from '../types/home.types';

/** W04 — `/library`, the reading room's day. Injected lazily. */
export interface LibraryHomeState {
  home: LibraryHome | null;
  status: RequestStatus;
  error: ApiErrorShape | null;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: LibraryHomeState = {
  home: null,
  status: 'idle',
  error: null,
  stale: false,
  staleUrgency: null,
};

const libraryHomeSlice = createSlice({
  name: 'libraryHome',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    acceptInvalidation<LibraryHomeState>('libraryHome')(builder);
    builder
      .addCase(fetchLibraryHome.pending, (state) => {
        state.status = state.home ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchLibraryHome.fulfilled, (state, action) => {
        state.home = action.payload as Draft<LibraryHome>;
        state.status = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchLibraryHome.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof libraryHomeSlice> {}
}

const injected = libraryHomeSlice.injectInto(rootReducer);

export const selectLibraryHome = (state: RootState): LibraryHomeState =>
  injected.selectSlice(state);
