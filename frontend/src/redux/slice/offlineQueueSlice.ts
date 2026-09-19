import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import type { RootState } from 'src/redux/store';
import type { TOutboxEntry, TOutboxStatus } from 'src/utils/outbox';

/**
 * Part 19 §19.10.4 / §19.10.5 — the in-memory mirror of the IndexedDB outbox.
 *
 * It ships at MVP carrying class A (the manual ledger entry) so that Phase 2's
 * promotion of class B is a union member and a service registration, not a new
 * mechanism. Sprint 0 owns the shape; Sprint 4 owns the replay loop.
 *
 * The rows here are a MIRROR: IndexedDB is the durable copy, because a queued
 * row must survive a reload, a tab close and a battery death.
 */
export interface OfflineQueueRow {
  readonly id: string;
  readonly seq: number;
  readonly kind: TOutboxEntry['kind'];
  readonly partyId: string;
  readonly createdAt: string;
  readonly attempts: number;
  readonly status: TOutboxStatus;
  readonly lastError: { readonly code: string; readonly message: string } | null;
}

export interface OfflineQueueState {
  rows: OfflineQueueRow[];
  /** True while the serial replay loop holds a request in flight. */
  replaying: boolean;
  /** Counted across one reconnect so "Back online. {n} sent." is accurate. */
  sentInLastDrain: number;
}

const initialState: OfflineQueueState = { rows: [], replaying: false, sentInLastDrain: 0 };

const toRow = (entry: TOutboxEntry): OfflineQueueRow => ({
  id: entry.id,
  seq: entry.seq,
  kind: entry.kind,
  partyId: entry.partyId,
  createdAt: entry.createdAt,
  attempts: entry.attempts,
  status: entry.status,
  lastError: entry.lastError,
});

const offlineQueueSlice = createSlice({
  name: 'offlineQueue',
  initialState,
  reducers: {
    /** Read from IndexedDB on boot, before the first party screen renders. */
    outboxHydrated(state, action: PayloadAction<readonly TOutboxEntry[]>) {
      state.rows = action.payload.map(toRow).sort((a, b) => a.seq - b.seq);
    },
    outboxEntryQueued(state, action: PayloadAction<TOutboxEntry>) {
      state.rows = [
        ...state.rows.filter((r) => r.id !== action.payload.id),
        toRow(action.payload),
      ].sort((a, b) => a.seq - b.seq);
    },
    outboxEntryStatusChanged(
      state,
      action: PayloadAction<{
        id: string;
        status: TOutboxStatus;
        lastError?: { code: string; message: string } | null;
      }>
    ) {
      const row = state.rows.find((r) => r.id === action.payload.id);
      if (!row) return;
      row.status = action.payload.status;
      if (action.payload.lastError !== undefined) row.lastError = action.payload.lastError;
      if (action.payload.status === 'sending') row.attempts += 1;
    },
    /** Removed in the same tick as the fulfilled action the online path fires. */
    outboxEntrySent(state, action: PayloadAction<string>) {
      state.rows = state.rows.filter((row) => row.id !== action.payload);
      state.sentInLastDrain += 1;
    },
    replayStarted(state) {
      state.replaying = true;
      state.sentInLastDrain = 0;
    },
    replayFinished(state) {
      state.replaying = false;
    },
  },
  extraReducers: (builder) => {
    // A tenant switch must not replay one business's entries into another; the
    // durable store is per-tenant and the mirror is cleared with everything else.
    builder.addCase(resetAllFeatureState, () => initialState);
  },
});

export const {
  outboxHydrated,
  outboxEntryQueued,
  outboxEntryStatusChanged,
  outboxEntrySent,
  replayStarted,
  replayFinished,
} = offlineQueueSlice.actions;

export default offlineQueueSlice.reducer;

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectOutboxRows = (state: RootState): readonly OfflineQueueRow[] =>
  state.offlineQueue.rows;
export const selectOutboxCount = (state: RootState): number => state.offlineQueue.rows.length;
export const selectOutboxReplaying = (state: RootState): boolean => state.offlineQueue.replaying;
