import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import {
  bulkTagParties as bulkTagCall,
  createTag as createTagCall,
  deleteTag as deleteTagCall,
  listTags,
  mergeTags as mergeTagsCall,
  updateTag as updateTagCall,
  type BulkTagMode,
  type BulkTagResult,
  type TagMergeResult,
} from '../api/tagService';

import type { PartyTag, PartyTagWithCount } from '../types/party.types';

/**
 * PTY-05's thunks. Part 19 §19.3.5: `createAsyncThunk` per operation, the
 * service does the talking, the rejection is a normalised `ApiErrorShape`.
 */

/**
 * QUERY. Every tag in the tenant, at most two hundred of them.
 *
 * Fetched ONCE per session and re-fetched only when a tag mutation invalidates
 * it (§19.3.6). The picker has to open in under 100 ms (FRD §5), and a request
 * on open cannot promise that on a 2G connection at a counter — so the list is
 * warm before anybody presses anything.
 */
export const fetchPartyTags = createAsyncThunk<
  readonly PartyTagWithCount[],
  { readonly force?: boolean } | undefined,
  { rejectValue: ApiErrorShape }
>(
  'partyTag/fetchPartyTags',
  async (_arg, { rejectWithValue, signal }) => {
    try {
      return await listTags({}, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'parties.tags.load.error'));
    }
  },
  {
    /**
     * The guard that makes "once per session" true rather than aspirational.
     *
     * Four screens want this list — the party form, the list filter, the bulk
     * dialog and the manager — and a merchant moving between them in one
     * session would otherwise issue four identical requests. `force` is for the
     * manager, which is the one screen where the counts are the CONTENT rather
     * than a hint, and where a stale count is a wrong statement about how many
     * parties a delete would touch.
     */
    condition: (arg, { getState }) => {
      if (arg?.force) return true;
      const state = getState() as { partyTag: { status: string; loadedAt: number | null } };
      return state.partyTag.status !== 'loading' && state.partyTag.loadedAt === null;
    },
  }
);

export interface CreateTagArg {
  readonly name: string;
  readonly color: string | null;
}

/**
 * MUTATION. 201 for a new tag, 200 for one that already existed — both
 * successes, and the difference is carried in `created` so the manager can say
 * which happened without either being reported as a failure.
 */
export const createPartyTag = createAsyncThunk<
  { readonly tag: PartyTag; readonly created: boolean },
  CreateTagArg,
  { rejectValue: ApiErrorShape }
>('partyTag/createPartyTag', async ({ name, color }, { rejectWithValue }) => {
  try {
    return await createTagCall(name, color);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'parties.tags.create.error'));
  }
});

export interface UpdateTagArg {
  readonly id: string;
  readonly name?: string;
  /** `null` clears the colour; omitted leaves it alone. */
  readonly color?: string | null;
}

/**
 * MUTATION. A rename is global by construction — the join stores the id and
 * never the name — which is the whole of US-4.
 *
 * The 409 `tag_name_taken` is NOT an error the snackbar should carry alone: it
 * arrives with `details.existing_tag_id`, and the useful next move is to offer
 * the merge. The rejection is returned rather than thrown so the caller can
 * read the code without a try/catch around a dispatch.
 */
export const updatePartyTag = createAsyncThunk<
  PartyTag,
  UpdateTagArg,
  { rejectValue: ApiErrorShape }
>('partyTag/updatePartyTag', async ({ id, name, color }, { rejectWithValue }) => {
  try {
    return await updateTagCall(id, {
      ...(name !== undefined ? { name } : {}),
      ...(color !== undefined ? { color } : {}),
    });
  } catch (error) {
    return rejectWithValue(toApiError(error, 'parties.tags.update.error'));
  }
});

/** MUTATION. The label goes; every party stays (BR-5). */
export const deletePartyTag = createAsyncThunk<
  { readonly id: string },
  { readonly id: string },
  { rejectValue: ApiErrorShape }
>('partyTag/deletePartyTag', async ({ id }, { rejectWithValue }) => {
  try {
    await deleteTagCall(id);
    return { id };
  } catch (error) {
    return rejectWithValue(toApiError(error, 'parties.tags.delete.error'));
  }
});

export interface MergeTagsArg {
  readonly id: string;
  readonly intoId: string;
}

/** MUTATION. One-directional and destructive to the source (BR-6). */
export const mergePartyTags = createAsyncThunk<
  TagMergeResult & { readonly sourceId: string },
  MergeTagsArg,
  { rejectValue: ApiErrorShape }
>('partyTag/mergePartyTags', async ({ id, intoId }, { rejectWithValue }) => {
  try {
    const result = await mergeTagsCall(id, intoId);
    return { ...result, sourceId: id };
  } catch (error) {
    return rejectWithValue(toApiError(error, 'parties.tags.merge.error'));
  }
});

export interface BulkTagArg {
  readonly partyIds: readonly string[];
  readonly tagNames: readonly string[];
  readonly mode: BulkTagMode;
}

/**
 * MUTATION. Add, replace or remove across a selection.
 *
 * The arguments are echoed into the fulfilled payload because the Undo in FR-9
 * needs THE EXACT IDS the call was made with, not the selection as it stands
 * ten seconds later. A merchant who tags forty parties and then changes the
 * filter must still be able to undo those forty.
 */
export const bulkTagPartiesThunk = createAsyncThunk<
  BulkTagResult & BulkTagArg,
  BulkTagArg,
  { rejectValue: ApiErrorShape }
>('partyTag/bulkTagParties', async (arg, { rejectWithValue }) => {
  try {
    const result = await bulkTagCall(arg.partyIds, arg.tagNames, arg.mode);
    return { ...result, ...arg };
  } catch (error) {
    return rejectWithValue(toApiError(error, 'parties.tags.bulk.error'));
  }
});
