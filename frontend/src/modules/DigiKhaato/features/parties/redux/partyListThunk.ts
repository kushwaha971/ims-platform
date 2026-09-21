import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import { listParties } from '../api/partyService';


import type { PartyListParams, PartyListResult } from '../types/party.types';

export interface FetchPartyListArg {
  readonly params: PartyListParams;
  /** 'replace' repaints the list (desktop paging, filter change);
   *  'append' adds a page (mobile infinite scroll). */
  readonly mode: 'replace' | 'append';
}

export interface FetchPartyListResult extends PartyListResult {
  readonly mode: 'replace' | 'append';
}

/**
 * QUERY. Part 19 §19.3.3 — three type arguments, one service call, and a catch
 * that normalises. The `signal` is RTK's own; aborting a superseded request is
 * what stops a slow page 1 overwriting a fast page 2.
 */
export const fetchPartyList = createAsyncThunk<
  FetchPartyListResult,
  FetchPartyListArg,
  { rejectValue: ApiErrorShape }
>('partyList/fetchPartyList', async ({ params, mode }, { signal, rejectWithValue }) => {
  try {
    const result = await listParties(params, signal);
    return { ...result, mode };
  } catch (error) {
    return rejectWithValue(toApiError(error, 'parties.list.error.title'));
  }
});
