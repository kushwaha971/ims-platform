import { createAsyncThunk } from '@reduxjs/toolkit';

import type { RootState } from 'src/redux/store';
import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import * as settingsService from '../api/settingsService';

import type {
  SettingsDefaults,
  SettingsSection,
  SettingsValues,
  TenantSettings,
} from '../types/settings.types';

/** QUERY — PLT-06 FR-2. */
export const fetchSettings = createAsyncThunk<TenantSettings, void, { rejectValue: ApiErrorShape }>(
  'settings/fetch',
  async (_arg, { signal, rejectWithValue }) => {
    try {
      return await settingsService.fetchSettings(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'settings.error.body'));
    }
  }
);

/**
 * MUTATION — FR-8: one section merged into the object last fetched and sent
 * whole with its ETag. The section name travels so the page knows which Save
 * button spins and which form to reset on success.
 */
export const saveSettingsSection = createAsyncThunk<
  TenantSettings,
  { readonly section: SettingsSection; readonly patch: SettingsValues },
  { state: RootState; rejectValue: ApiErrorShape }
>('settings/saveSection', async ({ patch }, { getState, rejectWithValue }) => {
  const current = (getState() as { settings?: { data: TenantSettings | null } }).settings?.data;
  if (!current) return rejectWithValue(toApiError(new Error('not loaded'), 'settings.error.body'));
  try {
    return await settingsService.saveSettings({ ...current.values, ...patch }, current.etag);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'settings.saveError'));
  }
});

/** QUERY — FR-10's preset values, fetched when "Reset to defaults" is confirmed. */
export const fetchSettingsDefaults = createAsyncThunk<
  SettingsDefaults,
  void,
  { rejectValue: ApiErrorShape }
>('settings/fetchDefaults', async (_arg, { rejectWithValue }) => {
  try {
    return await settingsService.fetchSettingsDefaults();
  } catch (error) {
    return rejectWithValue(toApiError(error, 'settings.error.body'));
  }
});

/** MUTATION — FR-4. The page refetches settings and the session afterwards. */
export const toggleModules = createAsyncThunk<
  readonly string[],
  readonly string[],
  { rejectValue: ApiErrorShape }
>('settings/toggleModules', async (modules, { rejectWithValue }) => {
  try {
    await settingsService.updateEnabledModules(modules);
    return modules;
  } catch (error) {
    return rejectWithValue(toApiError(error, 'settings.module.error'));
  }
});
