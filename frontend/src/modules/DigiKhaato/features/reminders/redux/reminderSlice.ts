import { createSlice, type Draft, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  fetchCollectionSummary,
  fetchDueParties,
  fetchPartyReminders,
  fetchReminderHistory,
  fetchReminderPreview,
  fetchReminderSettings,
  markReminderStatus,
  saveReminderSettings,
  sendBulkStep,
  sendManualReminder,
  startBulkReminders,
} from './reminderThunk';

import type {
  BulkReminderItem,
  BulkReminderSkip,
  CollectionBucket,
  CollectionSummary,
  DueParty,
  Reminder,
  ReminderKindFilter,
  ReminderPreview,
  ReminderSettings,
  ReminderTotals,
} from '../types/reminder.types';

/**
 * Part 19 §19.3.2 — the reminders screen, the khata's history strip, the
 * reminder sheet's preview, the bulk flow and the two SMS switches.
 *
 * Lazily injected (CR-134): the reminders route and the khata page are the only
 * readers, so the reducer arrives with their chunks rather than with the login
 * screen's.
 */
export interface ReminderState {
  summary: CollectionSummary | null;
  summaryStatus: RequestStatus;

  dueBucket: CollectionBucket | null;
  dueRows: DueParty[];
  duePage: number;
  duePageSize: number;
  dueTotal: number;
  dueStatus: RequestStatus;
  dueError: ApiErrorShape | null;

  historyKind: ReminderKindFilter;
  historyRows: Reminder[];
  historyPage: number;
  historyTotal: number;
  historyStatus: RequestStatus;
  historyError: ApiErrorShape | null;

  partyId: string | null;
  partyRows: Reminder[];
  partyTotals: ReminderTotals | null;

  preview: ReminderPreview | null;
  previewStatus: RequestStatus;

  settings: ReminderSettings | null;
  settingsSaving: boolean;

  bulkItems: BulkReminderItem[];
  bulkSkipped: BulkReminderSkip[];
  bulkDone: string[];
  bulkPassed: string[];
  bulkStatus: RequestStatus;

  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: ReminderState = {
  summary: null,
  summaryStatus: 'idle',
  dueBucket: null,
  dueRows: [],
  duePage: 1,
  duePageSize: 25,
  dueTotal: 0,
  dueStatus: 'idle',
  dueError: null,
  historyKind: '',
  historyRows: [],
  historyPage: 1,
  historyTotal: 0,
  historyStatus: 'idle',
  historyError: null,
  partyId: null,
  partyRows: [],
  partyTotals: null,
  preview: null,
  previewStatus: 'idle',
  settings: null,
  settingsSaving: false,
  bulkItems: [],
  bulkSkipped: [],
  bulkDone: [],
  bulkPassed: [],
  bulkStatus: 'idle',
  stale: false,
  staleUrgency: null,
};

const reminderSlice = createSlice({
  name: 'reminders',
  initialState,
  reducers: {
    historyKindChanged(state, action: PayloadAction<ReminderKindFilter>) {
      state.historyKind = action.payload;
      state.historyRows = [];
      state.historyPage = 1;
    },
    /** The flow was closed: whatever was not tapped is simply not sent. */
    bulkClosed(state) {
      state.bulkItems = [];
      state.bulkSkipped = [];
      state.bulkDone = [];
      state.bulkPassed = [];
      state.bulkStatus = 'idle';
    },
    previewCleared(state) {
      state.preview = null;
      state.previewStatus = 'idle';
    },
    resetReminders: () => initialState,
  },
  extraReducers: (builder) => {
    acceptInvalidation<ReminderState>('reminders')(builder);

    builder
      .addCase(fetchCollectionSummary.pending, (state) => {
        state.summaryStatus = state.summary ? 'refreshing' : 'loading';
      })
      .addCase(fetchCollectionSummary.fulfilled, (state, action) => {
        state.summary = action.payload;
        state.summaryStatus = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchCollectionSummary.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.summaryStatus = 'failed';
      })

      .addCase(fetchDueParties.pending, (state, action) => {
        /* A different bucket's rows are never shown under this bucket's tab,
           even for the length of a request. */
        if (state.dueBucket !== action.meta.arg.bucket) state.dueRows = [];
        state.dueBucket = action.meta.arg.bucket;
        state.dueStatus = state.dueRows.length ? 'refreshing' : 'loading';
        state.dueError = null;
      })
      .addCase(fetchDueParties.fulfilled, (state, action) => {
        if (state.dueBucket !== action.meta.arg.bucket) return; // a late answer to an old tab
        state.dueRows = action.payload.rows as Draft<DueParty>[];
        state.duePage = action.payload.page;
        state.duePageSize = action.payload.pageSize;
        state.dueTotal = action.payload.total;
        state.dueStatus = 'succeeded';
      })
      .addCase(fetchDueParties.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.dueStatus = 'failed';
        state.dueError = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })

      .addCase(fetchReminderHistory.pending, (state) => {
        state.historyStatus = state.historyRows.length ? 'refreshing' : 'loading';
        state.historyError = null;
      })
      .addCase(fetchReminderHistory.fulfilled, (state, action) => {
        if (action.meta.arg.filter !== state.historyKind) return; // an old filter's answer
        state.historyRows = action.payload.rows as Draft<Reminder>[];
        state.historyPage = action.payload.page;
        state.historyTotal = action.payload.total;
        state.historyStatus = 'succeeded';
      })
      .addCase(fetchReminderHistory.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.historyStatus = 'failed';
        state.historyError = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })

      .addCase(fetchPartyReminders.pending, (state, action) => {
        if (state.partyId !== action.meta.arg) {
          state.partyRows = [];
          state.partyTotals = null;
        }
        state.partyId = action.meta.arg;
      })
      .addCase(fetchPartyReminders.fulfilled, (state, action) => {
        if (state.partyId !== action.meta.arg) return;
        state.partyRows = action.payload.rows as Draft<Reminder>[];
        state.partyTotals = action.payload.totals as Draft<ReminderTotals>;
      })

      .addCase(fetchReminderPreview.pending, (state) => {
        state.previewStatus = 'loading';
      })
      .addCase(fetchReminderPreview.fulfilled, (state, action) => {
        state.preview = action.payload as Draft<ReminderPreview>;
        state.previewStatus = 'succeeded';
      })
      .addCase(fetchReminderPreview.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.previewStatus = 'failed';
      })

      .addCase(sendManualReminder.fulfilled, (state, action) => {
        /* The strip moves the moment the tap is recorded: "Reminded just now". */
        if (state.partyId === action.payload.partyId) {
          state.partyRows = [action.payload as Draft<Reminder>, ...state.partyRows].slice(0, 5);
          const totals = state.partyTotals;
          state.partyTotals = {
            sent: (totals?.sent ?? 0) + 1,
            failed: totals?.failed ?? 0,
            lastSentAt: new Date().toISOString(),
            lastChannel: action.payload.channel,
          };
        }
      })

      .addCase(startBulkReminders.pending, (state) => {
        state.bulkStatus = 'loading';
      })
      .addCase(startBulkReminders.fulfilled, (state, action) => {
        state.bulkItems = action.payload.items as Draft<BulkReminderItem>[];
        state.bulkSkipped = action.payload.skipped as Draft<BulkReminderSkip>[];
        state.bulkDone = [];
        state.bulkPassed = [];
        state.bulkStatus = 'succeeded';
      })
      .addCase(startBulkReminders.rejected, (state) => {
        state.bulkStatus = 'failed';
      })
      .addCase(sendBulkStep.fulfilled, (state, action) => {
        if (!state.bulkDone.includes(action.payload)) state.bulkDone.push(action.payload);
      })
      .addCase(markReminderStatus.fulfilled, (state, action) => {
        const id = action.payload.id;
        if (state.bulkItems.some((i) => i.reminderId === id) && !state.bulkPassed.includes(id)) {
          state.bulkPassed.push(id);
        }
        state.historyRows = state.historyRows.map((r) =>
          r.id === id ? (action.payload as Draft<Reminder>) : r
        );
        state.partyRows = state.partyRows.map((r) =>
          r.id === id ? (action.payload as Draft<Reminder>) : r
        );
      })

      .addCase(fetchReminderSettings.fulfilled, (state, action) => {
        state.settings = action.payload;
      })
      .addCase(saveReminderSettings.pending, (state) => {
        state.settingsSaving = true;
      })
      .addCase(saveReminderSettings.fulfilled, (state, action) => {
        state.settings = action.payload;
        state.settingsSaving = false;
      })
      .addCase(saveReminderSettings.rejected, (state) => {
        state.settingsSaving = false;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { historyKindChanged, bulkClosed, previewCleared, resetReminders } =
  reminderSlice.actions;
export const reminderReducer = reminderSlice.reducer;

// ── Lazy registration (CR-134) ───────────────────────────────────────────────

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof reminderSlice> {}
}

const injected = reminderSlice.injectInto(rootReducer);
const slice$ = (state: RootState): ReminderState => injected.selectSlice(state);

// ── Selectors — primitives or stable references only (see agingSlice) ───────

export const selectCollectionSummary = (s: RootState): ReminderState['summary'] =>
  slice$(s).summary;
export const selectSummaryStatus = (s: RootState): ReminderState['summaryStatus'] =>
  slice$(s).summaryStatus;
export const selectDueRows = (s: RootState): readonly DueParty[] => slice$(s).dueRows;
export const selectDueBucket = (s: RootState): ReminderState['dueBucket'] => slice$(s).dueBucket;
export const selectDuePage = (s: RootState): ReminderState['duePage'] => slice$(s).duePage;
export const selectDuePageSize = (s: RootState): ReminderState['duePageSize'] =>
  slice$(s).duePageSize;
export const selectDueTotal = (s: RootState): ReminderState['dueTotal'] => slice$(s).dueTotal;
export const selectDueStatus = (s: RootState): ReminderState['dueStatus'] => slice$(s).dueStatus;
export const selectDueError = (s: RootState): ReminderState['dueError'] => slice$(s).dueError;
export const selectHistoryKind = (s: RootState): ReminderState['historyKind'] =>
  slice$(s).historyKind;
export const selectHistoryRows = (s: RootState): readonly Reminder[] => slice$(s).historyRows;
export const selectHistoryPage = (s: RootState): ReminderState['historyPage'] =>
  slice$(s).historyPage;
export const selectHistoryTotal = (s: RootState): ReminderState['historyTotal'] =>
  slice$(s).historyTotal;
export const selectHistoryStatus = (s: RootState): ReminderState['historyStatus'] =>
  slice$(s).historyStatus;
export const selectHistoryError = (s: RootState): ReminderState['historyError'] =>
  slice$(s).historyError;
export const selectPartyReminderId = (s: RootState): ReminderState['partyId'] => slice$(s).partyId;
export const selectPartyReminders = (s: RootState): readonly Reminder[] => slice$(s).partyRows;
export const selectPartyReminderTotals = (s: RootState): ReminderState['partyTotals'] =>
  slice$(s).partyTotals;
export const selectReminderPreview = (s: RootState): ReminderState['preview'] => slice$(s).preview;
export const selectReminderPreviewStatus = (s: RootState): ReminderState['previewStatus'] =>
  slice$(s).previewStatus;
export const selectReminderSettings = (s: RootState): ReminderState['settings'] =>
  slice$(s).settings;
export const selectReminderSettingsSaving = (s: RootState): ReminderState['settingsSaving'] =>
  slice$(s).settingsSaving;
export const selectBulkItems = (s: RootState): readonly BulkReminderItem[] => slice$(s).bulkItems;
export const selectBulkSkipped = (s: RootState): readonly BulkReminderSkip[] =>
  slice$(s).bulkSkipped;
export const selectBulkDone = (s: RootState): readonly string[] => slice$(s).bulkDone;
export const selectBulkPassed = (s: RootState): readonly string[] => slice$(s).bulkPassed;
export const selectBulkStatus = (s: RootState): ReminderState['bulkStatus'] => slice$(s).bulkStatus;
export const selectRemindersStale = (s: RootState): ReminderState['stale'] => slice$(s).stale;
