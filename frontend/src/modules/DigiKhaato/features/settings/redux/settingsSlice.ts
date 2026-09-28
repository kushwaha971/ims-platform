import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchSettings, saveSettingsSection, toggleModules } from './settingsThunk';

import type { SettingsSection, TenantSettings } from '../types/settings.types';

/**
 * Part 19 §19.3.2 — PLT-06's slice (`values`, `etag`, `status`), lazily
 * injected (CR-134): only `/settings` reads it.
 *
 * `conflict` is FR-8's 412 — "Settings were changed elsewhere" — kept as
 * state rather than a toast because the answer is a decision (reload) that
 * must stay on screen until it is made.
 */
export interface SettingsState {
  data: TenantSettings | null;
  status: RequestStatus;
  error: ApiErrorShape | null;
  savingSection: SettingsSection | null;
  conflict: boolean;
  modulesStatus: RequestStatus;
}

const initialState: SettingsState = {
  data: null,
  status: 'idle',
  error: null,
  savingSection: null,
  conflict: false,
  modulesStatus: 'idle',
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    conflictDismissed(state) {
      state.conflict = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSettings.pending, (state) => {
        state.status = state.data ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchSettings.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.data = action.payload as Draft<TenantSettings>;
        state.conflict = false;
      })
      .addCase(fetchSettings.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(saveSettingsSection.pending, (state, action) => {
        state.savingSection = action.meta.arg.section;
      })
      .addCase(saveSettingsSection.fulfilled, (state, action) => {
        state.savingSection = null;
        state.data = action.payload as Draft<TenantSettings>;
      })
      .addCase(saveSettingsSection.rejected, (state, action) => {
        state.savingSection = null;
        if (action.payload?.code === 'precondition_failed') state.conflict = true;
      })
      .addCase(toggleModules.pending, (state) => {
        state.modulesStatus = 'loading';
      })
      .addCase(toggleModules.fulfilled, (state) => {
        state.modulesStatus = 'succeeded';
      })
      .addCase(toggleModules.rejected, (state) => {
        state.modulesStatus = 'failed';
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { conflictDismissed } = settingsSlice.actions;
export const settingsReducer = settingsSlice.reducer;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof settingsSlice> {}
}

const injected = settingsSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

export const selectSettings = (state: RootState): TenantSettings | null => slice$(state).data;
export const selectSettingsStatus = (state: RootState): RequestStatus => slice$(state).status;
export const selectSettingsError = (state: RootState): ApiErrorShape | null => slice$(state).error;
export const selectSavingSection = (state: RootState): SettingsSection | null =>
  slice$(state).savingSection;
export const selectSettingsConflict = (state: RootState): boolean => slice$(state).conflict;
export const selectModulesStatus = (state: RootState): RequestStatus => slice$(state).modulesStatus;
