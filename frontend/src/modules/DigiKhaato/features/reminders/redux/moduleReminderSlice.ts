import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  fetchModuleReminders,
  fetchSourcePreview,
  sendSourceReminder,
} from './moduleReminderThunk';

import type { ModuleReminderRow, SourceReminderPreview } from '../types/reminder.types';

/**
 * A7 (PLT-X06 §7) — the reminders screen's module tabs, keyed by module, and the
 * one source sheet. Lazily injected (CR-134): a shop without a module that has
 * a reminder source never loads it.
 */
export interface ModuleReminderState {
  rows: Record<string, ModuleReminderRow[]>;
  status: Record<string, RequestStatus>;
  error: Record<string, ApiErrorShape | null>;
  /**
   * The newest list request per module. A tab can have two in flight (the sheet
   * closing, then the send landing) and only the later one knows about the send
   * — an earlier response arriving last would put Remind back on a capped row.
   */
  latestRequest: Record<string, string>;
  /**
   * Sends that LANDED on this screen, counted — the tab refetches on each. Not
   * `sentIds.length`: a second send for the same record (a cap of two a day)
   * adds no id, and must still ask the server what is allowed now.
   */
  sentCount: number;
  /** Source ids a reminder was recorded for on this screen, this visit. */
  sentIds: string[];
  preview: SourceReminderPreview | null;
  previewStatus: RequestStatus;
}

const initialState: ModuleReminderState = {
  rows: {},
  status: {},
  error: {},
  latestRequest: {},
  sentCount: 0,
  sentIds: [],
  preview: null,
  previewStatus: 'idle',
};

const moduleReminderSlice = createSlice({
  name: 'moduleReminders',
  initialState,
  reducers: {
    sourcePreviewCleared(state) {
      state.preview = null;
      state.previewStatus = 'idle';
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchModuleReminders.pending, (state, action) => {
        const code = action.meta.arg;
        state.status[code] = state.rows[code] ? 'refreshing' : 'loading';
        state.error[code] = null;
        state.latestRequest[code] = action.meta.requestId;
      })
      .addCase(fetchModuleReminders.fulfilled, (state, action) => {
        const code = action.meta.arg;
        if (state.latestRequest[code] !== action.meta.requestId) return;
        state.status[code] = 'succeeded';
        state.rows[code] = [...action.payload] as Draft<ModuleReminderRow>[];
      })
      .addCase(fetchModuleReminders.rejected, (state, action) => {
        const code = action.meta.arg;
        if (action.meta.aborted || state.latestRequest[code] !== action.meta.requestId) return;
        state.status[code] = 'failed';
        state.error[code] = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(fetchSourcePreview.pending, (state) => {
        state.previewStatus = 'loading';
      })
      .addCase(fetchSourcePreview.fulfilled, (state, action) => {
        state.previewStatus = 'succeeded';
        state.preview = action.payload as Draft<SourceReminderPreview>;
      })
      .addCase(fetchSourcePreview.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.previewStatus = 'failed';
      })
      .addCase(sendSourceReminder.fulfilled, (state, action) => {
        // A true patch: the row now says it went. Whether it may go AGAIN is
        // the server's (the cap), and the tab refetches to ask it.
        state.sentCount += 1;
        if (!state.sentIds.includes(action.payload)) state.sentIds.push(action.payload);
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { sourcePreviewCleared } = moduleReminderSlice.actions;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof moduleReminderSlice> {}
}

const injected = moduleReminderSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

const NO_ROWS: readonly ModuleReminderRow[] = [];

export const selectModuleRows =
  (module: string) =>
  (state: RootState): readonly ModuleReminderRow[] =>
    slice$(state).rows[module] ?? NO_ROWS;
export const selectModuleStatus =
  (module: string) =>
  (state: RootState): RequestStatus =>
    slice$(state).status[module] ?? 'idle';
export const selectModuleError =
  (module: string) =>
  (state: RootState): ApiErrorShape | null =>
    slice$(state).error[module] ?? null;
export const selectSentSourceIds = (state: RootState): readonly string[] => slice$(state).sentIds;
export const selectSentCount = (state: RootState): number => slice$(state).sentCount;
export const selectSourcePreview = (state: RootState): SourceReminderPreview | null =>
  slice$(state).preview;
export const selectSourcePreviewStatus = (state: RootState): RequestStatus =>
  slice$(state).previewStatus;
