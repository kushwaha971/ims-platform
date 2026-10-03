import { createSlice, type Draft, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { RequestStatus } from 'src/types/api.types';

import {
  addLibraryCopies,
  createLibraryTitle,
  deleteLibraryCategory,
  deleteLibraryLocation,
  fetchLibraryCategories,
  fetchLibraryLocations,
  mergeLibraryCategory,
  patchLibraryTitle,
  saveLibraryCategory,
  saveLibraryLocation,
  searchLibraryTitles,
} from './libraryCatalogueThunk';

import type { LibraryCategory, LibraryLocation, TitleRow } from '../types/catalogue.types';

/**
 * F03 (LIB-02 §7) — the catalogue's forms: which drawer is open, the add-book
 * drawer's search-first matches (FR-3), the library's own category and
 * location lists (the pickers and the two managers read the same copy), and
 * the save in flight.
 */
export type CatalogueDrawer =
  | { readonly kind: 'addBook'; readonly query: string }
  | { readonly kind: 'addCopies'; readonly titleId: string; readonly title: string }
  | { readonly kind: 'editTitle'; readonly titleId: string };

export interface LibraryCatalogueFormState {
  drawer: CatalogueDrawer | null;
  matches: TitleRow[];
  matchesFor: string;
  categories: LibraryCategory[];
  categoriesStatus: RequestStatus;
  locations: LibraryLocation[];
  locationsStatus: RequestStatus;
  saveStatus: RequestStatus;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: LibraryCatalogueFormState = {
  drawer: null,
  matches: [],
  matchesFor: '',
  categories: [],
  categoriesStatus: 'idle',
  locations: [],
  locationsStatus: 'idle',
  saveStatus: 'idle',
  stale: false,
  staleUrgency: null,
};

const upsert = <T extends { id: string }>(rows: Draft<T>[], row: T): void => {
  const at = rows.findIndex((r) => r.id === row.id);
  if (at >= 0) rows[at] = row as Draft<T>;
  else rows.push(row as Draft<T>);
};

const libraryCatalogueFormSlice = createSlice({
  name: 'libraryCatalogueForm',
  initialState,
  reducers: {
    catalogueDrawerOpened(state, action: PayloadAction<CatalogueDrawer>) {
      state.drawer = action.payload;
      state.matches = [];
      state.matchesFor = '';
      state.saveStatus = 'idle';
    },
    catalogueDrawerClosed(state) {
      state.drawer = null;
      state.matches = [];
      state.matchesFor = '';
    },
  },
  extraReducers: (builder) => {
    acceptInvalidation<LibraryCatalogueFormState>('libraryCatalogueForm')(builder);
    builder
      .addCase(searchLibraryTitles.fulfilled, (state, action) => {
        state.matches = action.payload as Draft<TitleRow>[];
        state.matchesFor = action.meta.arg;
      })
      .addCase(fetchLibraryCategories.pending, (state) => {
        state.categoriesStatus = state.categories.length ? 'refreshing' : 'loading';
      })
      .addCase(fetchLibraryCategories.fulfilled, (state, action) => {
        state.categories = action.payload as Draft<LibraryCategory>[];
        state.categoriesStatus = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchLibraryCategories.rejected, (state, action) => {
        if (!action.meta.aborted) state.categoriesStatus = 'failed';
      })
      .addCase(fetchLibraryLocations.pending, (state) => {
        state.locationsStatus = state.locations.length ? 'refreshing' : 'loading';
      })
      .addCase(fetchLibraryLocations.fulfilled, (state, action) => {
        state.locations = action.payload as Draft<LibraryLocation>[];
        state.locationsStatus = 'succeeded';
      })
      .addCase(fetchLibraryLocations.rejected, (state, action) => {
        if (!action.meta.aborted) state.locationsStatus = 'failed';
      })
      .addCase(saveLibraryCategory.fulfilled, (state, action) => {
        upsert(state.categories, action.payload);
      })
      .addCase(deleteLibraryCategory.fulfilled, (state, action) => {
        state.categories = state.categories.filter((c) => c.id !== action.payload);
      })
      .addCase(saveLibraryLocation.fulfilled, (state, action) => {
        upsert(state.locations, action.payload);
      })
      .addCase(deleteLibraryLocation.fulfilled, (state, action) => {
        state.locations = state.locations.filter((l) => l.id !== action.payload);
      })
      .addCase(resetAllFeatureState, () => initialState)
      .addMatcher(
        (action) =>
          createLibraryTitle.pending.match(action) ||
          addLibraryCopies.pending.match(action) ||
          patchLibraryTitle.pending.match(action) ||
          mergeLibraryCategory.pending.match(action),
        (state) => {
          state.saveStatus = 'loading';
        }
      )
      .addMatcher(
        (action) =>
          createLibraryTitle.fulfilled.match(action) ||
          addLibraryCopies.fulfilled.match(action) ||
          patchLibraryTitle.fulfilled.match(action) ||
          mergeLibraryCategory.fulfilled.match(action),
        (state) => {
          state.saveStatus = 'succeeded';
        }
      )
      .addMatcher(
        (action) =>
          createLibraryTitle.rejected.match(action) ||
          addLibraryCopies.rejected.match(action) ||
          patchLibraryTitle.rejected.match(action) ||
          mergeLibraryCategory.rejected.match(action),
        (state) => {
          state.saveStatus = 'failed';
        }
      );
  },
});

export const { catalogueDrawerOpened, catalogueDrawerClosed } = libraryCatalogueFormSlice.actions;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof libraryCatalogueFormSlice> {}
}

const injected = libraryCatalogueFormSlice.injectInto(rootReducer);

export const selectLibraryCatalogueForm = (state: RootState): LibraryCatalogueFormState =>
  injected.selectSlice(state);
