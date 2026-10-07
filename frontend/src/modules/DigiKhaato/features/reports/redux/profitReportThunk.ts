import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import type { ProfitFilters, ProfitPage } from '../types/profitReport.types';

/** The service is imported inside the thunk, so it ships with the report and nowhere else. */
const service = () => import('../api/profitReportService');

/** QUERY. Shop item 1 — one page of the profit report with the period's P&L. */
export const fetchProfitReport = createAsyncThunk<
  ProfitPage,
  ProfitFilters,
  { rejectValue: ApiErrorShape }
>('profitReport/fetch', async (filters, { signal, rejectWithValue }) => {
  try {
    return await (await service()).getProfitReport(filters, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'reports.profit.error.title'));
  }
});
