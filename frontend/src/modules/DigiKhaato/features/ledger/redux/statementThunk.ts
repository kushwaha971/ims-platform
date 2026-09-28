import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import { getStatement, getStatementShop } from '../api/statementService';

import type { StatementFilters, StatementPage, StatementShop } from '../types/statement.types';

/** Part 19 §19.3.3 — one service call, one catch that normalises. */

export interface FetchStatementArg {
  readonly partyId: string;
  readonly filters: StatementFilters;
  /** `null` for the first page; present for "Load more". */
  readonly cursor?: string | null;
}

/**
 * QUERY. One page of a party's statement.
 *
 * The FILTERS travel in the argument rather than being read off state inside
 * the thunk, for the reason the timeline's cursor does: the fulfilled reducer
 * has to know which request it is handling, and `action.meta.arg` is the only
 * thing that still knows once the response has come back. A statement whose
 * rows were fetched for April and whose header says May is worse than one that
 * failed.
 */
export const fetchPartyStatement = createAsyncThunk<
  StatementPage,
  FetchStatementArg,
  { rejectValue: ApiErrorShape }
>(
  'statement/fetchPartyStatement',
  async ({ partyId, filters, cursor }, { signal, rejectWithValue }) => {
    try {
      return await getStatement(partyId, filters, { cursor }, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'ledger.statement.error.title'));
    }
  }
);

/**
 * QUERY. Every remaining page, for print (FR-8).
 *
 * Printing cannot paginate — a browser's print dialog gets what is in the DOM —
 * so the whole period has to be in hand before `window.print()` is called. This
 * walks the cursor to the end and returns the rows; §10's five-year cap is what
 * makes that a finite promise, and the caller shows progress because EC-2's
 * ten-thousand-row party is a real shop.
 *
 * It is a separate thunk rather than a loop in the component because the abort
 * signal matters: a merchant who changes their mind mid-fetch is EC-2's "user
 * may cancel", and RTK gives that for free to a thunk and not to a `for` loop.
 */
export const fetchStatementAllRows = createAsyncThunk<
  StatementPage,
  { readonly partyId: string; readonly filters: StatementFilters },
  { rejectValue: ApiErrorShape }
>('statement/fetchStatementAllRows', async ({ partyId, filters }, { signal, rejectWithValue }) => {
  try {
    let page = await getStatement(partyId, filters, {}, signal);
    const rows = [...page.rows];
    /* Bounded, and the bound is not defensiveness: a cursor that stopped
       advancing — a server bug, a proxy caching the first page — would
       otherwise be an infinite loop inside a click handler, with the merchant
       watching a progress bar that never moves. Two hundred pages of fifty is
       ten thousand rows, which is EC-2's own figure. */
    for (let page_count = 0; page.hasMore && page.nextCursor && page_count < 200; page_count += 1) {
      page = await getStatement(partyId, filters, { cursor: page.nextCursor }, signal);
      rows.push(...page.rows);
    }
    return { ...page, rows, hasMore: false, nextCursor: null };
  } catch (error) {
    return rejectWithValue(toApiError(error, 'ledger.statement.error.title'));
  }
});

/**
 * QUERY. UAT D3 — the shop's address, phone and GSTIN for the print sheet's
 * letterhead. Fetched when the statement opens rather than when Print is
 * pressed, so the sheet is complete by the time `window.print()` reads the DOM.
 */
export const fetchStatementShop = createAsyncThunk<
  StatementShop | null,
  void,
  { rejectValue: ApiErrorShape }
>('statement/fetchStatementShop', async (_arg, { signal, rejectWithValue }) => {
  try {
    return (await getStatementShop(signal)) ?? null;
  } catch (error) {
    return rejectWithValue(toApiError(error, 'ledger.statement.error.title'));
  }
});
