import { createSlice, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';

import { COPY_FILTER_DEFAULTS } from '../constants/catalogueConstants';

import { fetchLibraryCopies } from './libraryCatalogueThunk';
import {
  applyFilterPatch,
  initialListState,
  listFulfilled,
  listPending,
  listRejected,
  type LibraryListState,
} from './libraryListState';

import type { CopyFilters, CopyRow } from '../types/catalogue.types';

/**
 * F03 (LIB-02 FR-10) — the copies list (`/library/copies`). Route-local, so it is injected lazily
 * (CR-134) and ships with its route, not with every route.
 */
export type LibraryCopyListState = LibraryListState<CopyFilters, CopyRow>;

const initialState: LibraryCopyListState = initialListState<CopyFilters, CopyRow>(
  COPY_FILTER_DEFAULTS
);

const libraryCopyListSlice = createSlice({
  name: 'libraryCopyList',
  initialState,
  reducers: {
    copyFiltersChanged(state, action: PayloadAction<Partial<CopyFilters>>) {
      applyFilterPatch(state, action.payload);
    },
  },
  extraReducers: (builder) => {
    acceptInvalidation<LibraryCopyListState>('libraryCopyList')(builder);
    builder
      .addCase(fetchLibraryCopies.pending, (state) => listPending(state))
      .addCase(fetchLibraryCopies.fulfilled, (state, action) =>
        listFulfilled(state, action.meta.arg, action.payload)
      )
      .addCase(fetchLibraryCopies.rejected, (state, action) =>
        listRejected(state, action.meta.arg, action.meta.aborted, action.payload)
      )
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { copyFiltersChanged } = libraryCopyListSlice.actions;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof libraryCopyListSlice> {}
}

const injected = libraryCopyListSlice.injectInto(rootReducer);

export const selectLibraryCopyList = (state: RootState): LibraryCopyListState =>
  injected.selectSlice(state);
