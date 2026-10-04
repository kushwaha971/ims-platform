import { createSlice, type Draft, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';

import {
  loadCounterMember,
  processCounterItem,
  renewAllAtCounter,
  undoCounterIssue,
} from './libraryCounterThunk';

import type {
  CounterMember,
  CounterMode,
  CounterPrompt,
  CounterRow,
  QueueItem,
} from '../types/counter.types';
import type { MemberSummary } from '../types/member.types';

/**
 * F05 (LIB-06 §7) — the counter: the mode, the member on the panel, the scans
 * waiting their turn (FIFO, one in flight), the session list newest first,
 * the open prompt and the name search's results. Injected lazily: only
 * `/library/counter` pays for it.
 *
 * A failed scan (network) keeps its key in `failed`, so Retry re-sends the
 * same idempotency key and a request that did reach the server is not
 * repeated (BR-5).
 */
export const SESSION_MAX = 100;

export interface LibraryCounterState {
  mode: CounterMode;
  member: CounterMember | null;
  queue: QueueItem[];
  inFlight: QueueItem | null;
  failed: QueueItem[];
  session: CounterRow[];
  prompt: CounterPrompt | null;
  search: { code: string; results: MemberSummary[] } | null;
  busy: boolean;
}

const initialState: LibraryCounterState = {
  mode: 'issue',
  member: null,
  queue: [],
  inFlight: null,
  failed: [],
  session: [],
  prompt: null,
  search: null,
  busy: false,
};

const push = (state: Draft<LibraryCounterState>, row: CounterRow): void => {
  state.session.unshift(row as Draft<CounterRow>);
  if (state.session.length > SESSION_MAX) state.session.length = SESSION_MAX;
};

const libraryCounterSlice = createSlice({
  name: 'libraryCounter',
  initialState,
  reducers: {
    counterModeChanged(state, action: PayloadAction<CounterMode>) {
      state.mode = action.payload;
      state.prompt = null;
    },
    counterEnqueued(state, action: PayloadAction<QueueItem>) {
      state.queue.push(action.payload as Draft<QueueItem>);
      state.search = null;
    },
    counterStarted(state) {
      const next = state.queue.shift();
      state.inFlight = (next ?? null) as Draft<QueueItem> | null;
    },
    counterRetried(state, action: PayloadAction<string>) {
      const item = state.failed.find((f) => f.key === action.payload);
      state.failed = state.failed.filter((f) => f.key !== action.payload);
      if (item) state.queue.unshift(item);
    },
    counterSkipped(state, action: PayloadAction<string>) {
      state.failed = state.failed.filter((f) => f.key !== action.payload);
    },
    counterPromptClosed(state) {
      state.prompt = null;
    },
    counterMemberCleared(state) {
      state.member = null;
      state.prompt = null;
      state.search = null;
    },
    counterSearchClosed(state) {
      state.search = null;
    },
    counterSessionRestored(state, action: PayloadAction<CounterRow[]>) {
      if (state.session.length === 0) state.session = action.payload as Draft<CounterRow>[];
    },
    counterModeRestored(state, action: PayloadAction<CounterMode>) {
      state.mode = action.payload;
    },
    /** A row the counter writes itself (F06: a book marked lost). */
    counterNoted(state, action: PayloadAction<CounterRow>) {
      push(state, action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(processCounterItem.fulfilled, (state, action) => {
        state.inFlight = null;
        const outcome = action.payload;
        if (outcome.type === 'member') {
          state.member = outcome.member as Draft<CounterMember>;
          state.prompt = null;
          return;
        }
        if (outcome.type === 'search') {
          state.search = {
            code: outcome.code,
            results: outcome.results,
          } as unknown as Draft<LibraryCounterState['search']>;
          return;
        }
        push(state, outcome.row);
        if (outcome.member) state.member = outcome.member as Draft<CounterMember>;
        state.prompt = (outcome.prompt ?? null) as Draft<CounterPrompt> | null;
      })
      .addCase(processCounterItem.rejected, (state, action) => {
        const item = action.meta.arg.item;
        state.inFlight = null;
        state.failed.push(item as Draft<QueueItem>);
        push(state, {
          id: `failed-${item.key}`,
          kind: 'failed',
          code: item.code,
          at: new Date().toISOString(),
          messageId: 'library.counter.notSent',
          messageParams: { key: item.key },
        });
      })
      .addCase(loadCounterMember.fulfilled, (state, action) => {
        state.member = action.payload as Draft<CounterMember>;
        state.search = null;
      })
      .addCase(undoCounterIssue.pending, (state) => {
        state.busy = true;
      })
      .addCase(undoCounterIssue.fulfilled, (state, action) => {
        state.busy = false;
        const row = state.session.find((r) => r.id === action.payload.rowId);
        if (row) row.kind = 'undone';
        if (action.payload.member) state.member = action.payload.member as Draft<CounterMember>;
      })
      .addCase(undoCounterIssue.rejected, (state) => {
        state.busy = false;
      })
      .addCase(renewAllAtCounter.pending, (state) => {
        state.busy = true;
      })
      .addCase(renewAllAtCounter.fulfilled, (state, action) => {
        state.busy = false;
        state.member = action.payload.member as Draft<CounterMember>;
        push(state, {
          id: `renew-all-${Date.now()}`,
          kind: 'info',
          code: action.payload.member.memberNumber,
          at: new Date().toISOString(),
          messageId: 'library.counter.renewedAll',
          messageParams: { renewed: action.payload.renewed, refused: action.payload.refused },
        });
      })
      .addCase(renewAllAtCounter.rejected, (state) => {
        state.busy = false;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const {
  counterModeChanged,
  counterEnqueued,
  counterStarted,
  counterRetried,
  counterSkipped,
  counterPromptClosed,
  counterMemberCleared,
  counterSearchClosed,
  counterSessionRestored,
  counterModeRestored,
  counterNoted,
} = libraryCounterSlice.actions;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof libraryCounterSlice> {}
}

const injected = libraryCounterSlice.injectInto(rootReducer);

export const selectLibraryCounter = (state: RootState): LibraryCounterState =>
  injected.selectSlice(state);
