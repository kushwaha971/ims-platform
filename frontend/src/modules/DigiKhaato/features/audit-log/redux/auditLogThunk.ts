import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape, PageMeta } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import { fetchAuditActors, fetchAuditLogs } from '../api/auditLogService';

import type { AuditActor, AuditFilters, AuditRow } from '../types/audit.types';

/** QUERY — PLT-08 FR-1. The filters travel with the request so a late page is recognisable. */
export const fetchAuditRows = createAsyncThunk<
  { rows: AuditRow[]; meta: PageMeta },
  AuditFilters,
  { rejectValue: ApiErrorShape }
>('auditLog/fetchRows', async (filters, { signal, rejectWithValue }) => {
  try {
    return await fetchAuditLogs(filters, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'audit.error.body'));
  }
});

/** QUERY — FR-3's "Who" options. */
export const fetchActors = createAsyncThunk<AuditActor[], void, { rejectValue: ApiErrorShape }>(
  'auditLog/fetchActors',
  async (_arg, { signal, rejectWithValue }) => {
    try {
      return await fetchAuditActors(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'audit.error.body'));
    }
  }
);
