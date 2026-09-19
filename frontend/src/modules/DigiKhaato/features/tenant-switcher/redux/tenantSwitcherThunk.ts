import { createAsyncThunk } from '@reduxjs/toolkit';

import type { SessionPayload } from 'src/redux/slice/sessionSlice';
import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import { getSession } from '../../auth/api/authService';
import * as tenantSwitcherService from '../api/tenantSwitcherService';

/**
 * Part 19 §19.3.3 — one service call per thunk, plus the `/auth/me` re-read
 * that makes the result a whole session summary.
 *
 * The re-read is inside the thunk, not in the component, for one reason: the
 * INVALIDATION map declares these mutations as a `patch` on `session.tenants`,
 * and a patch has to be applied by the owning slice's own extraReducers ON THIS
 * ACTION. Fetching afterwards from a `.then()` would make the map a lie.
 */

/** MUTATION — PLT-04 FR-5. Exactly one default per user; the server clears the rest. */
export const setDefaultTenant = createAsyncThunk<
  SessionPayload,
  { readonly membershipId: string },
  { rejectValue: ApiErrorShape }
>('tenantSwitcher/setDefaultTenant', async ({ membershipId }, { rejectWithValue }) => {
  try {
    await tenantSwitcherService.setDefaultMembership(membershipId);
    return await getSession();
  } catch (error) {
    return rejectWithValue(toApiError(error, 'tenant.switcher.setDefault.error'));
  }
});

/**
 * MUTATION — PLT-04 FR-7. 409 `last_owner` is the documented refusal; it is
 * normalised here like any other error and rendered by the dialog.
 */
export const leaveTenant = createAsyncThunk<
  SessionPayload,
  { readonly membershipId: string },
  { rejectValue: ApiErrorShape }
>('tenantSwitcher/leaveTenant', async ({ membershipId }, { rejectWithValue }) => {
  try {
    await tenantSwitcherService.leaveMembership(membershipId);
    return await getSession();
  } catch (error) {
    return rejectWithValue(toApiError(error, 'tenant.switcher.leave.error'));
  }
});
