import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import {
  createPartyRelation as createRelationRequest,
  deletePartyRelation as deleteRelationRequest,
  listPartyRelations,
} from '../api/partyRelationService';

import type {
  PartyRelation,
  PartyRelationDraft,
  PartyRelationRemoval,
  PartyRelations,
} from '../types/party.types';

/** QUERY — A6: a party's guardian and payer links, both directions. */
export const fetchPartyRelations = createAsyncThunk<
  PartyRelations,
  string,
  { rejectValue: ApiErrorShape }
>('partyRelation/fetch', async (partyId, { signal, rejectWithValue }) => {
  try {
    return await listPartyRelations(partyId, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'parties.relations.error'));
  }
});

/** MUTATION — A6: link a guardian or payer. */
export const createPartyRelation = createAsyncThunk<
  PartyRelation,
  {
    readonly partyId: string;
    readonly draft: PartyRelationDraft;
    readonly idempotencyKey: string;
  },
  { rejectValue: ApiErrorShape }
>('partyRelation/create', async ({ partyId, draft, idempotencyKey }, { rejectWithValue }) => {
  try {
    return await createRelationRequest(partyId, draft, idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'parties.relations.error'));
  }
});

/** MUTATION — A6: unlink (deleted), or end a link a reminder has used. */
export const deletePartyRelation = createAsyncThunk<
  PartyRelationRemoval,
  { readonly partyId: string; readonly relationId: string },
  { rejectValue: ApiErrorShape }
>('partyRelation/delete', async ({ partyId, relationId }, { rejectWithValue }) => {
  try {
    return await deleteRelationRequest(partyId, relationId);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'parties.relations.error'));
  }
});
