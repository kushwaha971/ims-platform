import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import { createParty, updateParty } from '../api/partyService';

import type { PartyFormValues, PartySaveResult } from '../types/party.types';

/**
 * Part 19 §19.3.3 — one service call per thunk, three type arguments, and a
 * catch that normalises. Nothing here decides what the screen shows.
 */

export interface SavePartyArg {
  readonly values: PartyFormValues;
  /** Present on an edit; absent on a create. */
  readonly partyId?: string;
  /**
   * Minted ONCE before the first attempt and reused on every retry of the same
   * logical save (§19.1.3 note 1). A party with no mobile has no uniqueness
   * backstop, so this key is the only thing standing between a lost response
   * and a second Ramesh Traders in the book.
   */
  readonly idempotencyKey: string;
}

/**
 * MUTATION — create or edit.
 *
 * One thunk for both, because the screen has one form and one Save button and
 * the difference is a single `if` on an id. Two thunks would mean two
 * lifecycles, two sets of reducers and two ways for the drawer's busy state to
 * be wrong.
 *
 * The server's `validation_error` details travel back through `rejectValue`
 * untouched: `usePartyForm` maps them onto the fields. A thunk that interpreted
 * them would be deciding what the screen shows.
 */
export const saveParty = createAsyncThunk<
  PartySaveResult,
  SavePartyArg,
  { rejectValue: ApiErrorShape }
>('partyForm/save', async ({ values, partyId, idempotencyKey }, { rejectWithValue }) => {
  try {
    return partyId ? await updateParty(partyId, values) : await createParty(values, idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'parties.form.error.title'));
  }
});
