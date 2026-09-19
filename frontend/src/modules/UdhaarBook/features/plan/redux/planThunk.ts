import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import { getPlanEntitlements } from '../api/planService';

import type { PlanEntitlements } from '../types/plan.types';

/**
 * QUERY — PLT-15 FR-5. The plan's modules and counters ride on `/auth/me`; this
 * thunk exists so the plan card can refresh them without disturbing the session
 * (a `fetchSession` would repaint the navigation and the shell for a settings
 * page that only wanted a number).
 */
export const fetchPlanLimits = createAsyncThunk<
  PlanEntitlements,
  void,
  { rejectValue: ApiErrorShape }
>('plan/fetchPlanLimits', async (_arg, { signal, rejectWithValue }) => {
  try {
    return await getPlanEntitlements(signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'plan.card.error'));
  }
});
