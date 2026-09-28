import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { rootReducer, type RootState } from 'src/redux/store';
import type { RequestStatus } from 'src/types/api.types';

import { fetchPublicDocument } from './publicDocumentThunk';

import type { PublicDocument, PublicDocumentFailure } from '../types/publicDocument.types';

/**
 * SAL-03 FR-5 / SAL-14 §14 `publicDocumentSlice` — the customer's copy of a
 * shared bill, injected lazily so only `/d/<token>` carries it. Keyed by the
 * token it was fetched for, so a second link opened in the same tab never
 * flashes the first one's bill.
 */
export interface PublicDocumentState {
  token: string | null;
  status: RequestStatus;
  data: PublicDocument | null;
  failure: PublicDocumentFailure | null;
}

const initialState: PublicDocumentState = {
  token: null,
  status: 'idle',
  data: null,
  failure: null,
};

const publicDocumentSlice = createSlice({
  name: 'publicDocument',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchPublicDocument.pending, (state, action) => {
        if (state.token !== action.meta.arg) state.data = null;
        state.token = action.meta.arg;
        state.status = 'loading';
        state.failure = null;
      })
      .addCase(fetchPublicDocument.fulfilled, (state, action) => {
        if (state.token !== action.meta.arg) return;
        state.status = 'succeeded';
        state.data = action.payload as Draft<PublicDocument>;
      })
      .addCase(fetchPublicDocument.rejected, (state, action) => {
        if (action.meta.aborted || state.token !== action.meta.arg) return;
        state.status = 'failed';
        state.data = null;
        state.failure = action.payload ?? 'failed';
      });
  },
});

export const publicDocumentReducer = publicDocumentSlice.reducer;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof publicDocumentSlice> {}
}

const injected = publicDocumentSlice.injectInto(rootReducer);

export const selectPublicDocument = (state: RootState): PublicDocumentState =>
  injected.selectSlice(state);
