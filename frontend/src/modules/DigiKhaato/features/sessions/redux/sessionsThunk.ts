import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import * as sessionsService from '../api/sessionsService';

import type { DeviceSession } from '../types/session.types';

/** QUERY — PLT-09 FR-1. */
export const fetchDevices = createAsyncThunk<DeviceSession[], void, { rejectValue: ApiErrorShape }>(
  'sessions/fetchDevices',
  async (_arg, { signal, rejectWithValue }) => {
    try {
      return await sessionsService.listDevices(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'sessions.error.body'));
    }
  }
);

/** MUTATION — FR-7. */
export const renameDevice = createAsyncThunk<
  DeviceSession,
  { readonly id: string; readonly label: string },
  { rejectValue: ApiErrorShape }
>('sessions/renameDevice', async ({ id, label }, { rejectWithValue }) => {
  try {
    return await sessionsService.renameDevice(id, label);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'sessions.rename.error'));
  }
});

/** MUTATION — FR-2. The row leaves the list on success. */
export const revokeDevice = createAsyncThunk<string, string, { rejectValue: ApiErrorShape }>(
  'sessions/revokeDevice',
  async (id, { rejectWithValue }) => {
    try {
      await sessionsService.revokeDevice(id);
      return id;
    } catch (error) {
      return rejectWithValue(toApiError(error, 'sessions.logout.error'));
    }
  }
);

/** MUTATION — FR-3. The caller then ends the session locally and routes to login. */
export const logoutEverywhere = createAsyncThunk<void, void, { rejectValue: ApiErrorShape }>(
  'sessions/logoutEverywhere',
  async (_arg, { rejectWithValue }) => {
    try {
      await sessionsService.logoutEverywhere();
      return undefined;
    } catch (error) {
      return rejectWithValue(toApiError(error, 'sessions.logout.error'));
    }
  }
);
