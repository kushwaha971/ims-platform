import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchLendingReminders } from './lendingMessageThunk';

import type { LendingReminderRow } from '../types/lending.types';

/** L03 — today's reminders on `/lending/messages`. Injected lazily. */
export interface LendingMessagesState {
  rows: LendingReminderRow[];
  status: RequestStatus;
  error: ApiErrorShape | null;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: LendingMessagesState = {
  rows: [],
  status: 'idle',
  error: null,
  stale: false,
  staleUrgency: null,
};

const lendingMessagesSlice = createSlice({
  name: 'lendingMessages',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    acceptInvalidation<LendingMessagesState>('lendingMessages')(builder);
    builder
      .addCase(fetchLendingReminders.pending, (state) => {
        state.status = state.status === 'succeeded' ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchLendingReminders.fulfilled, (state, action) => {
        state.rows = action.payload as Draft<LendingReminderRow>[];
        state.status = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchLendingReminders.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof lendingMessagesSlice> {}
}

const injected = lendingMessagesSlice.injectInto(rootReducer);

export const selectLendingMessages = (state: RootState): LendingMessagesState =>
  injected.selectSlice(state);
