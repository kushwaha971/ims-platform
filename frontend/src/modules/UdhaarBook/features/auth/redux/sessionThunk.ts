import { createAsyncThunk } from '@reduxjs/toolkit';

import type { SessionPayload } from 'src/redux/slice/sessionSlice';
import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import * as authService from '../api/authService';

/**
 * Part 19 §19.3.3 — every thunk is `createAsyncThunk` with all three type
 * arguments filled in and a body that is exactly a `try` calling ONE service
 * function and a `catch` calling `rejectWithValue(toApiError(error))`.
 *
 * No JSX, no `window`, no snackbar, no axios, no business rules.
 */

/** QUERY. §19.7.2 step 1 of the bootstrap sequence. */
export const fetchSession = createAsyncThunk<SessionPayload, void, { rejectValue: ApiErrorShape }>(
  'session/fetchSession',
  async (_arg, { signal, rejectWithValue }) => {
    try {
      return await authService.getSession(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'auth.session.error'));
    }
  }
);

/**
 * MUTATION. §19.6.5 — the switch is a new token; the caller then dispatches
 * `resetAllFeatureState()` and navigates to /dashboard, because staying on a
 * record id from the old tenant would 404 and read as data loss.
 */
export const switchTenant = createAsyncThunk<
  SessionPayload,
  { readonly tenantId: string },
  { rejectValue: ApiErrorShape }
>('session/switchTenant', async ({ tenantId }, { rejectWithValue }) => {
  try {
    return await authService.switchTenant(tenantId);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'auth.switchTenant.error'));
  }
});

/** MUTATION. §19.7.4 — teardown is dispatched before the navigation. */
export const logout = createAsyncThunk<void, void, { rejectValue: ApiErrorShape }>(
  'session/logout',
  async (_arg, { rejectWithValue }) => {
    try {
      await authService.logout();
    } catch (error) {
      return rejectWithValue(toApiError(error, 'auth.logout.error'));
    }
    return undefined;
  }
);
