import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import type { DashboardData } from '../types/reports.types';

/**
 * QUERY. RPT-01 FR-1 — every tile in one read. `refresh` is FR-8's refresh
 * icon (the server recomputes instead of serving its snapshot).
 *
 * The service is imported inside the thunk: the invalidation registry names
 * every thunk and ships in the shell, and a route nobody opened must not pay
 * for this one's service.
 */
export const fetchDashboard = createAsyncThunk<
  DashboardData,
  { readonly refresh?: boolean } | undefined,
  { rejectValue: ApiErrorShape }
>('reportDashboard/fetchDashboard', async (arg, { signal, rejectWithValue }) => {
  try {
    const { getDashboard } = await import('../api/dashboardService');
    return await getDashboard({ refresh: arg?.refresh }, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'reports.dashboard.error.title'));
  }
});
