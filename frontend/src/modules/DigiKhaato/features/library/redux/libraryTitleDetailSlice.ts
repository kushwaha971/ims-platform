import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  fetchLibraryTitle,
  patchLibraryTitle,
  setLibraryTitleArchived,
} from './libraryCatalogueThunk';

import type { TitleDetail } from '../types/catalogue.types';

/** F03 (LIB-02 FR-11) — one title with its copies (`/library/catalogue/[titleId]`). */
export interface LibraryTitleDetailState {
  title: TitleDetail | null;
  status: RequestStatus;
  error: ApiErrorShape | null;
  archiveStatus: RequestStatus;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: LibraryTitleDetailState = {
  title: null,
  status: 'idle',
  error: null,
  archiveStatus: 'idle',
  stale: false,
  staleUrgency: null,
};

const libraryTitleDetailSlice = createSlice({
  name: 'libraryTitleDetail',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    acceptInvalidation<LibraryTitleDetailState>('libraryTitleDetail')(builder);
    builder
      .addCase(fetchLibraryTitle.pending, (state, action) => {
        state.status = state.title?.id === action.meta.arg ? 'refreshing' : 'loading';
        if (state.title?.id !== action.meta.arg) state.title = null;
        state.error = null;
      })
      .addCase(fetchLibraryTitle.fulfilled, (state, action) => {
        state.title = action.payload as Draft<TitleDetail>;
        state.status = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchLibraryTitle.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(patchLibraryTitle.fulfilled, (state, action) => {
        if (state.title?.id === action.payload.id) {
          state.title = action.payload as Draft<TitleDetail>;
        }
      })
      .addCase(setLibraryTitleArchived.pending, (state) => {
        state.archiveStatus = 'loading';
      })
      .addCase(setLibraryTitleArchived.fulfilled, (state, action) => {
        state.archiveStatus = 'succeeded';
        if (state.title?.id === action.payload.id) {
          state.title = { ...state.title, ...action.payload } as Draft<TitleDetail>;
        }
      })
      .addCase(setLibraryTitleArchived.rejected, (state) => {
        state.archiveStatus = 'failed';
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof libraryTitleDetailSlice> {}
}

const injected = libraryTitleDetailSlice.injectInto(rootReducer);

export const selectLibraryTitleDetail = (state: RootState): LibraryTitleDetailState =>
  injected.selectSlice(state);
