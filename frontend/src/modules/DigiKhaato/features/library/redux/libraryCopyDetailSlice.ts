import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchLibraryCopy, moveLibraryCopy, withdrawLibraryCopy } from './libraryCatalogueThunk';

import type { CopyDetail } from '../types/catalogue.types';

/**
 * F03 (LIB-02 FR-11) — one copy with its history (`/library/copies/[copyId]`).
 * A withdrawal or a repair answers with the copy as it now is, so the page
 * takes that answer rather than asking again.
 */
export interface LibraryCopyDetailState {
  copy: CopyDetail | null;
  status: RequestStatus;
  error: ApiErrorShape | null;
  actionStatus: RequestStatus;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: LibraryCopyDetailState = {
  copy: null,
  status: 'idle',
  error: null,
  actionStatus: 'idle',
  stale: false,
  staleUrgency: null,
};

const libraryCopyDetailSlice = createSlice({
  name: 'libraryCopyDetail',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    acceptInvalidation<LibraryCopyDetailState>('libraryCopyDetail')(builder);
    builder
      .addCase(fetchLibraryCopy.pending, (state, action) => {
        state.status = state.copy?.id === action.meta.arg ? 'refreshing' : 'loading';
        if (state.copy?.id !== action.meta.arg) state.copy = null;
        state.error = null;
      })
      .addCase(fetchLibraryCopy.fulfilled, (state, action) => {
        state.copy = action.payload as Draft<CopyDetail>;
        state.status = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchLibraryCopy.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(resetAllFeatureState, () => initialState)
      .addMatcher(
        (action) =>
          withdrawLibraryCopy.pending.match(action) || moveLibraryCopy.pending.match(action),
        (state) => {
          state.actionStatus = 'loading';
        }
      )
      .addMatcher(
        (action) =>
          withdrawLibraryCopy.fulfilled.match(action) || moveLibraryCopy.fulfilled.match(action),
        (state, action: { payload: CopyDetail }) => {
          state.actionStatus = 'succeeded';
          if (state.copy?.id === action.payload.id)
            state.copy = action.payload as Draft<CopyDetail>;
        }
      )
      .addMatcher(
        (action) =>
          withdrawLibraryCopy.rejected.match(action) || moveLibraryCopy.rejected.match(action),
        (state) => {
          state.actionStatus = 'failed';
        }
      );
  },
});

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof libraryCopyDetailSlice> {}
}

const injected = libraryCopyDetailSlice.injectInto(rootReducer);

export const selectLibraryCopyDetail = (state: RootState): LibraryCopyDetailState =>
  injected.selectSlice(state);
