import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import type { PrintBranding } from './brandingPrintService';

type Reject = { rejectValue: ApiErrorShape };

/** QUERY. The letterhead a print sheet shows (SAL-03 FR-12, PAY-02). R33 / A16. */
export const fetchPrintBranding = createAsyncThunk<PrintBranding, void, Reject>(
  'printBranding/fetchPrintBranding',
  async (_arg, { signal, rejectWithValue }) => {
    try {
      const { getPrintBranding } = await import('./brandingPrintService');
      return await getPrintBranding(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'sales.detail.error.title'));
    }
  }
);
