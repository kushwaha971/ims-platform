import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import type { GstQuery, GstSummary, RegisterPage, RegisterQuery } from '../types/taxReports.types';

/**
 * Part 19 §19.3.3 — one service call each, and a catch that normalises.
 *
 * The service is imported INSIDE each thunk (the purchases and sales thunks
 * record why): imported at the top it would ship to every route that imports
 * this file.
 */
const service = () => import('../api/taxReportsService');

type Reject = { rejectValue: ApiErrorShape };

/** QUERY. RPT-03 / RPT-04 — one page of a register with its totals. */
export const fetchRegister = createAsyncThunk<RegisterPage, RegisterQuery, Reject>(
  'taxReports/fetchRegister',
  async (query, { signal, rejectWithValue }) => {
    try {
      return await (await service()).getRegister(query, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'reports.register.error.title'));
    }
  }
);

/** QUERY. RPT-07 — the GST summary for a period. */
export const fetchGstSummary = createAsyncThunk<GstSummary, GstQuery, Reject>(
  'taxReports/fetchGstSummary',
  async (query, { signal, rejectWithValue }) => {
    try {
      return await (await service()).getGstSummary(query, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'reports.gst.error.title'));
    }
  }
);
