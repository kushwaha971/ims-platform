import { createSlice, type Draft } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import type { RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  createPartyTag,
  deletePartyTag,
  fetchPartyTags,
  mergePartyTags,
  updatePartyTag,
} from './partyTagThunk';

import type { PartyTagWithCount } from '../types/party.types';

/**
 * PTY-05 — the tenant's tags, held once for the session.
 *
 * Part 19 §19.3.2 Shape A, with one difference from `partyList` that is worth
 * stating: this slice holds the WHOLE set rather than a page. That is safe
 * because the set has a hard ceiling of two hundred, which is one small
 * response, and it is necessary because four screens want the same list and the
 * picker has 100 ms to open (FRD §5). A paginated tag list would be a picker
 * that pauses while the merchant types.
 *
 * `loadedAt` rather than a `loaded` boolean, because the fetch thunk's
 * `condition` needs to distinguish "never asked" from "asked and got nothing",
 * and a tenant with no tags yet is the most common state on a new install.
 */
export interface PartyTagState {
  tags: PartyTagWithCount[];
  status: RequestStatus;
  error: ApiErrorShape | null;
  loadedAt: number | null;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: PartyTagState = {
  tags: [],
  status: 'idle',
  error: null,
  loadedAt: null,
  stale: false,
  staleUrgency: null,
};

const byName = (left: PartyTagWithCount, right: PartyTagWithCount) =>
  left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });

const partyTagSlice = createSlice({
  name: 'partyTag',
  initialState,
  reducers: {
    resetPartyTags: () => initialState,
  },
  extraReducers: (builder) => {
    acceptInvalidation<PartyTagState>('partyTag')(builder);

    builder
      .addCase(fetchPartyTags.pending, (state) => {
        state.status = state.tags.length > 0 ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchPartyTags.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.tags = [...action.payload] as Draft<PartyTagWithCount>[];
        state.loadedAt = Date.now();
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchPartyTags.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
        /* `loadedAt` is deliberately NOT set on a failure. The fetch thunk's
           `condition` reads it to decide whether to ask again, and marking a
           failed load as loaded would mean a merchant whose first request timed
           out gets an empty picker for the rest of the session with no way to
           retry short of a reload. */
      })

      /* ── The optimistic half ─────────────────────────────────────────────
       * A tag the merchant just created has to appear in the picker they
       * created it from, immediately, because the next thing they do is select
       * it. Waiting for a refetch means a picker that is briefly missing the
       * thing the merchant is looking at.
       *
       * These are patches of a list this slice OWNS, from responses that are
       * the server's own answer — not guesses. The one genuinely unknown field
       * is `partyCount` on a brand-new tag, which is zero because a tag that
       * has just been created carries nobody yet, and the party save that
       * follows invalidates this list anyway. */
      .addCase(createPartyTag.fulfilled, (state, action) => {
        const { tag } = action.payload;
        if (state.tags.some((row) => row.id === tag.id)) return;
        state.tags = [...state.tags, { ...tag, partyCount: 0 }].sort(byName);
      })
      .addCase(updatePartyTag.fulfilled, (state, action) => {
        const updated = action.payload;
        state.tags = state.tags
          .map((row) => (row.id === updated.id ? { ...row, ...updated } : row))
          .sort(byName);
      })
      .addCase(deletePartyTag.fulfilled, (state, action) => {
        state.tags = state.tags.filter((row) => row.id !== action.payload.id);
      })
      .addCase(mergePartyTags.fulfilled, (state, action) => {
        const { sourceId, tag } = action.payload;
        /* The source is gone and the target's NAME and COLOUR are the server's
           answer, so both are safe to write. The target's COUNT is not: it used
           to be `row.partyCount + moved`, which added a figure counted over
           every join row to one counted over live parties only (BR-9), and a
           merge involving an archived party left the manager reading eight
           where the next fetch would say six.
 
           The count is left alone and the slice is marked stale by the
           invalidation map, so the next mount of the manager gets the server's
           number rather than this slice's guess. A count that is briefly a
           little low is a cache; a count computed two different ways in one
           screen is a bug. */
        state.tags = state.tags
          .filter((row) => row.id !== sourceId)
          .map((row) => (row.id === tag.id ? { ...row, ...tag } : row));
      })

      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { resetPartyTags } = partyTagSlice.actions;

export default partyTagSlice.reducer;

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectPartyTags = (state: RootState): readonly PartyTagWithCount[] =>
  state.partyTag.tags;
export const selectPartyTagStatus = (state: RootState): RequestStatus => state.partyTag.status;
export const selectPartyTagError = (state: RootState): ApiErrorShape | null =>
  state.partyTag.error;
export const selectPartyTagsLoaded = (state: RootState): boolean =>
  state.partyTag.loadedAt !== null;
export const selectPartyTagsStale = (state: RootState): boolean => state.partyTag.stale;
