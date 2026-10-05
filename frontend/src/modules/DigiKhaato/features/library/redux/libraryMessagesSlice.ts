import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchFeeReminders } from './libraryMessageThunk';

import type { FeeReminderRow } from '../types/message.types';

/** W06 — today's fee messages on `/library/messages`. Injected lazily. */
export interface LibraryMessagesState {
  rows: FeeReminderRow[];
  status: RequestStatus;
  error: ApiErrorShape | null;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: LibraryMessagesState = {
  rows: [],
  status: 'idle',
  error: null,
  stale: false,
  staleUrgency: null,
};

const libraryMessagesSlice = createSlice({
  name: 'libraryMessages',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    acceptInvalidation<LibraryMessagesState>('libraryMessages')(builder);
    builder
      .addCase(fetchFeeReminders.pending, (state) => {
        state.status = state.status === 'succeeded' ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchFeeReminders.fulfilled, (state, action) => {
        state.rows = action.payload as Draft<FeeReminderRow>[];
        state.status = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchFeeReminders.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof libraryMessagesSlice> {}
}

const injected = libraryMessagesSlice.injectInto(rootReducer);

export const selectLibraryMessages = (state: RootState): LibraryMessagesState =>
  injected.selectSlice(state);
