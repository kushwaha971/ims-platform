import { createSlice, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';

import { TITLE_FILTER_DEFAULTS } from '../constants/catalogueConstants';

import { fetchLibraryTitles } from './libraryCatalogueThunk';
import {
  applyFilterPatch,
  initialListState,
  listFulfilled,
  listPending,
  listRejected,
  type LibraryListState,
} from './libraryListState';

import type { TitleFilters, TitleRow } from '../types/catalogue.types';

/**
 * F03 (LIB-02 FR-10) — the titles list (`/library/catalogue`). Route-local, so it is injected lazily
 * (CR-134) and ships with its route, not with every route.
 */
export type LibraryTitleListState = LibraryListState<TitleFilters, TitleRow>;

const initialState: LibraryTitleListState = initialListState<TitleFilters, TitleRow>(
  TITLE_FILTER_DEFAULTS
);

const libraryTitleListSlice = createSlice({
  name: 'libraryTitleList',
  initialState,
  reducers: {
    titleFiltersChanged(state, action: PayloadAction<Partial<TitleFilters>>) {
      applyFilterPatch(state, action.payload);
    },
  },
  extraReducers: (builder) => {
    acceptInvalidation<LibraryTitleListState>('libraryTitleList')(builder);
    builder
      .addCase(fetchLibraryTitles.pending, (state) => listPending(state))
      .addCase(fetchLibraryTitles.fulfilled, (state, action) =>
        listFulfilled(state, action.meta.arg, action.payload)
      )
      .addCase(fetchLibraryTitles.rejected, (state, action) =>
        listRejected(state, action.meta.arg, action.meta.aborted, action.payload)
      )
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { titleFiltersChanged } = libraryTitleListSlice.actions;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof libraryTitleListSlice> {}
}

const injected = libraryTitleListSlice.injectInto(rootReducer);

export const selectLibraryTitleList = (state: RootState): LibraryTitleListState =>
  injected.selectSlice(state);
