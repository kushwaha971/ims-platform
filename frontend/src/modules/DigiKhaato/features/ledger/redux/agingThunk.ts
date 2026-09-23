import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import { getLedgerAging, getLedgerSummary } from '../api/agingService';

import type { AgingFilters, AgingPage, LedgerSummary } from '../types/aging.types';

/** Part 19 §19.3.3 — one service call each, and a catch that normalises. */

/** QUERY. One page of the aging report. */
export const fetchLedgerAging = createAsyncThunk<
  AgingPage,
  AgingFilters,
  { rejectValue: ApiErrorShape }
>('ledgerAging/fetchLedgerAging', async (filters, { signal, rejectWithValue }) => {
  try {
    return await getLedgerAging(filters, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'ledger.aging.error.title'));
  }
});

/**
 * QUERY. The tenant's position, in two numbers.
 *
 * A separate request from the aging rather than a field on it, because the two
 * answer different questions and are wanted in different places: the summary is
 * the ledger's header and RPT-01's dashboard tile, the aging is one report.
 * Folding them would make the dashboard pay for a FIFO walk it does not read.
 */
export const fetchLedgerSummary = createAsyncThunk<
  LedgerSummary,
  void,
  { rejectValue: ApiErrorShape }
>('ledgerAging/fetchLedgerSummary', async (_arg, { signal, rejectWithValue }) => {
  try {
    return await getLedgerSummary(signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'ledger.aging.error.title'));
  }
});
