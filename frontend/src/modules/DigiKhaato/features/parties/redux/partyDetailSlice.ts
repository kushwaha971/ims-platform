import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import type { RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  correctEntry,
  postEntry,
  postOpeningBalance,
  reverseEntry,
} from 'modules/DigiKhaato/features/ledger/redux/ledgerEntryThunk';

import { archiveParty, restoreParty } from './partyArchiveThunk';
import { fetchPartyDetail, saveCollectionDate } from './partyDetailThunk';

import type { PartyCredit, PartyDetail, PartySummary } from '../types/party.types';

/**
 * Part 19 §19.3.2 Shape B — a detail slice, keyed by the id it is showing.
 *
 * ── Why `id` is state rather than only a thunk argument ─────────────────────
 * The page mounts, dispatches for party A, and the merchant taps back and opens
 * party B before A's response lands. Without the id in the store, A's payload
 * writes itself over B's header and the screen shows one party's name above
 * another's balance. RTK aborts the superseded request, which covers the common
 * case; `id` covers the one where it does not — a response already in flight
 * when the abort is issued.
 */
export interface PartyDetailState {
  /** Which party this state is about. `null` before the first fetch. */
  id: string | null;
  party: PartyDetail | null;
  summary: PartySummary | null;
  credit: PartyCredit | null;
  status: RequestStatus;
  error: ApiErrorShape | null;
  /** The collection-date control has its own status: the page stays readable
   *  while it saves, so it must not put the whole page into 'loading'. */
  collectionStatus: RequestStatus;
  /** Set by the invalidation listener (§19.3.6); the hook refetches on it. */
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: PartyDetailState = {
  id: null,
  party: null,
  summary: null,
  credit: null,
  status: 'idle',
  error: null,
  collectionStatus: 'idle',
  stale: false,
  staleUrgency: null,
};

const partyDetailSlice = createSlice({
  name: 'partyDetail',
  initialState,
  reducers: {
    /**
     * The page is opening for a party. Clears the previous one's data unless it
     * is the same party being reopened.
     *
     * Reopening the SAME party keeps what is on screen, which is the point of
     * FR-1: navigating list → party → back → the same party must not blank the
     * header while a fetch it already has the answer to goes out.
     */
    partyDetailOpened(state, action: PayloadAction<string>) {
      if (state.id === action.payload) {
        state.error = null;
        return;
      }
      state.id = action.payload;
      state.party = null;
      state.summary = null;
      state.credit = null;
      state.status = 'loading';
      state.error = null;
      state.collectionStatus = 'idle';
      state.stale = false;
      state.staleUrgency = null;
    },
    resetPartyDetail: () => initialState,
  },
  extraReducers: (builder) => {
    acceptInvalidation<PartyDetailState>('partyDetail')(builder);

    builder
      .addCase(fetchPartyDetail.pending, (state, action) => {
        // A refetch of what is already on screen keeps it there; a first load
        // shows the skeleton.
        state.status = state.party && state.id === action.meta.arg ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchPartyDetail.fulfilled, (state, action) => {
        /* The late-response guard. `state.id` is what the page is showing NOW;
           `action.meta.arg` is what this response is about. They differ when a
           merchant opened another party before this one landed, and writing it
           anyway puts one party's name above another's balance. */
        if (state.id !== null && state.id !== action.meta.arg) return;
        state.status = 'succeeded';
        state.id = action.meta.arg;
        state.party = action.payload.party as Draft<PartyDetail>;
        state.summary = action.payload.summary as Draft<PartySummary>;
        state.credit = action.payload.credit as Draft<PartyCredit> | null;
        state.error = null;
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchPartyDetail.rejected, (state, action) => {
        if (action.meta.aborted) return;
        if (state.id !== null && state.id !== action.meta.arg) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(saveCollectionDate.pending, (state) => {
        state.collectionStatus = 'loading';
      })
      .addCase(saveCollectionDate.fulfilled, (state, action) => {
        state.collectionStatus = 'succeeded';
        /* The whole party, not just the date: `PATCH` returns the record the
           server now holds, and taking one field off it would leave the rest of
           the page rendering a copy the server has already moved past. */
        if (state.id === action.payload.id) {
          state.party = action.payload as Draft<PartyDetail>;
        }
      })
      .addCase(saveCollectionDate.rejected, (state) => {
        // The error itself goes to the global snackbar (R-E-2); the page only
        // needs to stop showing a spinner on the control.
        state.collectionStatus = 'failed';
      })
      /* PTY-04 — the party the server returned, written straight in. A khata
         page open behind the dialog is correct the moment the promise resolves,
         and the `patch` entry in the invalidation map says so rather than
         asking for a refetch that would only re-learn what the response
         already carried.

         Guarded on the id: archiving from the LIST dispatches the same thunk
         for a party this slice may know nothing about, and writing it here
         would put a party the merchant is not looking at into the detail
         slice. */
      .addCase(archiveParty.fulfilled, (state, action) => {
        if (state.id !== action.payload.id) return;
        state.party = action.payload as Draft<PartyDetail>;
        /* PTY-04 FR-3: a write-off moved the balance to zero, and the header
           reads `summary.balance` first. Patching only the row left the
           writeoff.mjs sweep's archived khata still saying "₹2,300 · You will
           get" above a timeline that had just written it off. */
        if (state.summary) state.summary = { ...state.summary, balance: action.payload.balance };
      })
      .addCase(restoreParty.fulfilled, (state, action) => {
        if (state.id === action.payload.id) state.party = action.payload as Draft<PartyDetail>;
      })
      /* LED-01 FR-3 — the balance this transaction produced, written straight
         in from the 201's `meta.party_balance`.
 
         Not a refetch, for two reasons. The merchant is standing at a counter
         about to say the new figure out loud, so a second round trip is a wait
         somebody watches them take. And a refetch can pick up ANOTHER device's
         entry between the save and the read, and show them a balance that was
         never true of the action they just took.
 
         This is what `INVALIDATION.postEntry`'s `patch: [['partyDetail',
         'summary']]` DECLARES, and the declaration was made before this
         handler existed — so the map claimed a fix that nothing performed, the
         header sat on the old figure while the server held the new one, and
         every unit test passed because each of them mocked one side. The map's
         own docstring warns about exactly that: a false `patch` is worse than
         no entry, because the next reader stops looking for the refetch.
 
         Guarded on the id: the entry drawer can be opened from a list row, so
         this action arrives for parties this slice knows nothing about.
 
         Both the row and the summary, because the header reads one and the info
         panel the other, and a patch that moved one of them would put two
         figures on one screen that disagree about the same party. The server's
         `summary` also carries `receivable` and `payable`; this client does not
         map them, because the header derives the direction from the balance's
         own sign (§23.2.6 rule 3) and a second pair of numbers to keep in step
         would be a second pair of numbers that can fall out of step. */
      .addCase(postEntry.fulfilled, (state, action) => {
        const { entry, balance } = action.payload;
        if (state.id !== entry.partyId || !balance) return;
        if (state.party) state.party = { ...state.party, balance };
        if (state.summary) state.summary = { ...state.summary, balance };
      })
      // LED-02's opening moves the same number, for the same reason.
      .addCase(postOpeningBalance.fulfilled, (state, action) => {
        const { entry, balance } = action.payload;
        if (state.id !== entry.partyId || !balance) return;
        if (state.party) state.party = { ...state.party, balance };
        if (state.summary) state.summary = { ...state.summary, balance };
      })
      /* LED-03 moves the same number a third and fourth time, and these two
         are the ones most likely to be forgotten: a merchant reverses a ₹500
         entry and the header above the timeline keeps saying ₹2,800 until
         something remounts it.

         `postEntry` had exactly that defect — the invalidation map declared a
         `patch` on `partyDetail` that no reducer performed — and the map's own
         docstring says why a false `patch` is worse than none: the next reader
         stops looking for the refetch. So the claim in `map.ts` and these
         handlers are written together, and the pair is the whole fix. */
      .addCase(reverseEntry.fulfilled, (state, action) => {
        applyCorrectionBalance(state, action.payload);
      })
      .addCase(correctEntry.fulfilled, (state, action) => {
        applyCorrectionBalance(state, action.payload);
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

/**
 * The balance a reverse or a correct produced, onto the khata header.
 *
 * Guarded on the PARTY, like its two siblings above: the ledger slice can be
 * showing one customer while this slice holds another for the moment between a
 * navigation and its fetch, and writing the balance across would put one
 * person's figure under another's name — on the number the merchant reads out
 * at the counter.
 */
const applyCorrectionBalance = (
  state: Draft<PartyDetailState>,
  payload: { readonly entry: { readonly partyId: string }; readonly balance: string }
): void => {
  if (state.id !== payload.entry.partyId || !payload.balance) return;
  if (state.party) state.party = { ...state.party, balance: payload.balance };
  if (state.summary) state.summary = { ...state.summary, balance: payload.balance };
};

export const { partyDetailOpened, resetPartyDetail } = partyDetailSlice.actions;

export default partyDetailSlice.reducer;

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectPartyDetail = (state: RootState): PartyDetail | null => state.partyDetail.party;
export const selectPartyDetailId = (state: RootState): string | null => state.partyDetail.id;
export const selectPartySummary = (state: RootState): PartySummary | null =>
  state.partyDetail.summary;
export const selectPartyCredit = (state: RootState): PartyCredit | null => state.partyDetail.credit;
export const selectPartyDetailStatus = (state: RootState): RequestStatus =>
  state.partyDetail.status;
export const selectPartyDetailError = (state: RootState): ApiErrorShape | null =>
  state.partyDetail.error;
export const selectCollectionStatus = (state: RootState): RequestStatus =>
  state.partyDetail.collectionStatus;
export const selectPartyDetailStale = (state: RootState): boolean => state.partyDetail.stale;
