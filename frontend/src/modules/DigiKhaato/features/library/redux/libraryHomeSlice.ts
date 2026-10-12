import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchLibraryFeesBoard, fetchLibraryHome } from './libraryHomeThunk';

import type { FeesBoard, LibraryHome } from '../types/home.types';

/** W04 — `/library`, the reading room's day. Injected lazily. */
export interface LibraryHomeState {
  home: LibraryHome | null;
  status: RequestStatus;
  /** The Fees screen's board; `null` until read. */
  board: FeesBoard | null;
  boardStatus: RequestStatus;
  error: ApiErrorShape | null;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: LibraryHomeState = {
  home: null,
  status: 'idle',
  board: null,
  boardStatus: 'idle',
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
      .addCase(fetchLibraryFeesBoard.pending, (state) => {
        state.boardStatus = state.board ? 'refreshing' : 'loading';
      })
      .addCase(fetchLibraryFeesBoard.fulfilled, (state, action) => {
        state.board = action.payload as Draft<FeesBoard>;
        state.boardStatus = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchLibraryFeesBoard.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.boardStatus = 'failed';
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
