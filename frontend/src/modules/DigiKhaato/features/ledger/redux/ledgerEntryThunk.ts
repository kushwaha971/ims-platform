import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import {
  correctLedgerEntry,
  fetchEntryHistory as fetchEntryHistoryRequest,
  listPartyEntries,
  postLedgerEntry,
  postOpeningBalance as postOpeningBalanceRequest,
  reverseLedgerEntry,
} from '../api/ledgerService';

import type {
  LedgerCorrectionResult,
  LedgerCorrectionValues,
  LedgerEntry,
  LedgerEntryFormValues,
  LedgerEntryPostResult,
  LedgerPage,
} from '../types/ledger.types';

/**
 * Part 19 §19.3.3 — three type arguments, one service call, and a catch that
 * normalises. Nothing here decides what the screen shows.
 */

export interface FetchEntriesArg {
  readonly partyId: string;
  /**
   * `null` for the first page. Present for "load more", and the slice appends
   * rather than replaces on that branch — which is why the cursor travels in
   * the argument rather than being read off state inside the thunk: the
   * fulfilled reducer needs to know which of the two it is handling, and
   * `action.meta.arg` is the only thing that still knows.
   */
  readonly cursor?: string | null;
  /** LED-03 FR-7 — the "Show corrections" toggle's position at request time. */
  readonly includeReversed?: boolean;
  /**
   * NEW-2 — how many rows the first page should carry. Absent for an ordinary
   * load (the server's page size). Set by the silent refresh after a write, so
   * a merchant who had loaded three pages is not dropped back to one by a
   * refetch that only wanted the totals to be the server's.
   */
  readonly limit?: number;
}

/** QUERY. One page of a party's khata. */
export const fetchPartyEntries = createAsyncThunk<
  LedgerPage,
  FetchEntriesArg,
  { rejectValue: ApiErrorShape }
>(
  'ledgerEntry/fetchPartyEntries',
  async ({ partyId, cursor, includeReversed, limit }, { signal, rejectWithValue }) => {
    try {
      return await listPartyEntries(partyId, { cursor, includeReversed, limit }, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'ledger.timeline.error.title'));
    }
  }
);

export interface PostEntryArg {
  readonly partyId: string;
  readonly values: LedgerEntryFormValues;
  /**
   * Minted once per logical save by the hook and REUSED on every retry (FR-12).
   *
   * It travels in the argument rather than being generated here, and that is
   * the whole safety property: a thunk that minted its own key would mint a new
   * one on the retry, and the retry of a request that actually reached the
   * server would post a second entry.
   */
  readonly idempotencyKey: string;
  /** "Save anyway" (FR-7). Not a form field — see the service. */
  readonly override?: boolean;
}

/**
 * COMMAND. Posts the entry.
 *
 * The rejection travels back as an `ApiErrorShape` UNTOUCHED, including
 * `validation_error` details and the `credit_limit_exceeded` figures. A thunk
 * that interpreted them would be deciding what the screen shows: the hook maps
 * field errors onto controls and turns a limit refusal into the drawer's banner,
 * because only the hook knows there is a drawer.
 */
export interface PostOpeningArg {
  readonly partyId: string;
  readonly amount: string;
  readonly direction: 'debit' | 'credit';
  readonly asOf: string;
  readonly idempotencyKey: string;
}

/**
 * COMMAND. LED-02's opening balance.
 *
 * Its own thunk rather than a flag on `postEntry`, and the invalidation map is
 * the reason that matters most: an opening changes the same three things a
 * normal entry does, but it also changes whether the "Add opening balance"
 * action is still offered — so the khata page has to learn about it, and a
 * shared thunk would make that a branch inside a reducer.
 */
export const postOpeningBalance = createAsyncThunk<
  LedgerEntryPostResult,
  PostOpeningArg,
  { rejectValue: ApiErrorShape }
>(
  'ledgerEntry/postOpeningBalance',
  async ({ partyId, amount, direction, asOf, idempotencyKey }, { rejectWithValue }) => {
    try {
      return await postOpeningBalanceRequest(partyId, { amount, direction, asOf }, idempotencyKey);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'ledger.entry.error.title'));
    }
  }
);

export const postEntry = createAsyncThunk<
  LedgerEntryPostResult,
  PostEntryArg,
  { rejectValue: ApiErrorShape }
>(
  'ledgerEntry/postEntry',
  async ({ partyId, values, idempotencyKey, override }, { rejectWithValue }) => {
    try {
      return await postLedgerEntry(partyId, values, idempotencyKey, { override });
    } catch (error) {
      return rejectWithValue(toApiError(error, 'ledger.entry.error.title'));
    }
  }
);

// ── LED-03: reversing, correcting, and the chain behind one row ─────────────

export interface ReverseEntryArg {
  readonly entry: LedgerEntry;
  readonly reason: string;
  /** Minted once per logical reverse and REUSED on retry — see `PostEntryArg`. */
  readonly idempotencyKey: string;
}

/**
 * COMMAND. FR-2 — undo one entry.
 *
 * The whole ENTRY travels rather than its id, and it is not convenience: the
 * fulfilled reducer has to mark the original struck through and adjust the
 * summary by its direction and amount, and after the request the only copy of
 * those values is the one in `meta.arg`. An id would mean reading the row back
 * out of state inside a reducer that may be running after it was replaced.
 */
export const reverseEntry = createAsyncThunk<
  LedgerCorrectionResult,
  ReverseEntryArg,
  { rejectValue: ApiErrorShape }
>('ledgerEntry/reverseEntry', async ({ entry, reason, idempotencyKey }, { rejectWithValue }) => {
  try {
    return await reverseLedgerEntry(entry.id, reason, idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'ledger.correction.error.title'));
  }
});

export interface CorrectEntryArg {
  readonly entry: LedgerEntry;
  readonly values: LedgerCorrectionValues;
  readonly idempotencyKey: string;
}

/** COMMAND. FR-3 — replace one entry's values, keeping the mistake visible. */
export const correctEntry = createAsyncThunk<
  LedgerCorrectionResult,
  CorrectEntryArg,
  { rejectValue: ApiErrorShape }
>('ledgerEntry/correctEntry', async ({ entry, values, idempotencyKey }, { rejectWithValue }) => {
  try {
    return await correctLedgerEntry(entry, values, idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'ledger.correction.error.title'));
  }
});

/** QUERY. FR-8 — every row in this entry's correction chain, oldest first. */
export const fetchEntryHistory = createAsyncThunk<
  readonly LedgerEntry[],
  { readonly entryId: string },
  { rejectValue: ApiErrorShape }
>('ledgerEntry/fetchEntryHistory', async ({ entryId }, { signal, rejectWithValue }) => {
  try {
    return await fetchEntryHistoryRequest(entryId, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'ledger.correction.history.error'));
  }
});
