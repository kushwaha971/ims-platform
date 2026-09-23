import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation, takeReadSeq } from 'src/redux/invalidation/listener';
import type { RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  correctEntry,
  fetchPartyEntries,
  postEntry,
  postOpeningBalance,
  reverseEntry,
} from './ledgerEntryThunk';

import type { LedgerEntry, LedgerSummary } from '../types/ledger.types';

/**
 * Part 19 §19.3.2 Shape B — the timeline, keyed by the party it is showing.
 *
 * ── Why `partyId` is state rather than only a thunk argument ────────────────
 * Same reason `partyDetailSlice` carries one, and the failure is worse here: a
 * late page for party A appended under party B's header would put one
 * customer's transactions on another's khata. RTK aborts the superseded
 * request, which covers the common case; the id covers the one where a response
 * was already in flight when the abort went out.
 */
export interface LedgerEntryState {
  partyId: string | null;
  rows: LedgerEntry[];
  /** Opaque; `null` when there is nothing after what is loaded. */
  cursor: string | null;
  hasMore: boolean;
  /** The khata header's three ledger figures. `null` until the first page. */
  summary: LedgerSummary | null;
  status: RequestStatus;
  /**
   * "Load more" has its own status. Sharing `status` would put the whole
   * timeline into `loading` and replace fifty rows the merchant is reading with
   * a skeleton, to fetch the fifty-first.
   */
  moreStatus: RequestStatus;
  error: ApiErrorShape | null;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
  /** NEW-2 — see `TStaleState.staleSeq`. */
  staleSeq: number;
  /** NEW-2 — the `staleSeq` each in-flight first-page read started at. */
  readSeq: Record<string, number>;
  /**
   * LED-03 FR-7 — "Show corrections", off by default.
   *
   * It lives here rather than in the component because it is a property of the
   * DATA that is loaded, not of the control that toggled it: `rows` either does
   * or does not contain the struck-through pairs, and a component-local flag
   * would let the switch say "on" while the rows beneath it were the clean set
   * fetched before it flipped.
   *
   * Flipping it therefore refetches from page one rather than filtering what is
   * held. Filtering would be wrong in the revealing direction — the reversed
   * rows were never downloaded — and wrong in the hiding direction too, because
   * a page of fifty that contained twenty struck-through rows would show thirty
   * and still claim there was more.
   */
  showCorrections: boolean;
}

const initialState: LedgerEntryState = {
  partyId: null,
  rows: [],
  cursor: null,
  hasMore: false,
  summary: null,
  status: 'idle',
  moreStatus: 'idle',
  error: null,
  stale: false,
  staleUrgency: null,
  staleSeq: 0,
  readSeq: {},
  showCorrections: false,
};

const ledgerEntrySlice = createSlice({
  name: 'ledgerEntry',
  initialState,
  reducers: {
    /** The khata page is opening for a party. */
    ledgerTimelineOpened(state, action: PayloadAction<string>) {
      if (state.partyId === action.payload) {
        state.error = null;
        return;
      }
      state.partyId = action.payload;
      state.rows = [];
      state.cursor = null;
      state.hasMore = false;
      state.summary = null;
      state.status = 'loading';
      state.moreStatus = 'idle';
      state.error = null;
      state.stale = false;
      state.staleUrgency = null;
      /* The toggle resets with the party. It is a way of looking at ONE khata,
         and carrying it to the next customer would open their book in a mode
         they never asked for — three lines per typo, on a screen the merchant
         opened to read a balance. */
      state.showCorrections = false;
    },
    /** FR-7. The rows are refetched by the hook; this only records the choice. */
    correctionsVisibilityToggled(state, action: PayloadAction<boolean>) {
      state.showCorrections = action.payload;
    },
    resetLedgerEntries: () => initialState,
  },
  extraReducers: (builder) => {
    acceptInvalidation<LedgerEntryState>('ledgerEntry')(builder);

    builder
      .addCase(fetchPartyEntries.pending, (state, action) => {
        if (action.meta.arg.cursor) {
          state.moreStatus = 'loading';
          return;
        }
        state.status = state.rows.length > 0 ? 'refreshing' : 'loading';
        state.error = null;
        state.readSeq[action.meta.requestId] = state.staleSeq;
      })
      .addCase(fetchPartyEntries.fulfilled, (state, action) => {
        const startedAt = takeReadSeq(state.readSeq, action.meta.requestId);
        // The late-response guard — see the interface docstring.
        if (state.partyId !== null && state.partyId !== action.meta.arg.partyId) return;
        const isMore = Boolean(action.meta.arg.cursor);
        /* NEW-2 — a first page requested BEFORE the latest write this slice
           was told about cannot contain it. Two quick entries: the first one's
           refresh lands after the second one was spliced in, and writing it
           would take the second entry back off the screen and put the totals
           back to what they were between the two. Dropped, `stale` left set;
           the hook has already re-fired on the new `staleSeq`.

           Only when a timeline is on screen (`summary` is the first page's
           marker): a first load has nothing to protect. */
        if (
          !isMore &&
          state.summary !== null &&
          startedAt !== undefined &&
          startedAt !== state.staleSeq
        ) {
          state.status = 'succeeded';
          return;
        }
        const incoming = action.payload.rows as Draft<LedgerEntry>[];
        if (isMore) {
          /* Append, and DEDUPE by id.
             A page boundary can hand back a row the client already holds: the
             cursor is a position in an ordering, and an entry posted between
             two page requests shifts every later row by one. Appending blindly
             puts the same entry on the screen twice, with the same id, and
             React logs a duplicate-key warning that nobody reads. */
          const known = new Set(state.rows.map((row) => row.id));
          state.rows.push(...incoming.filter((row) => !known.has(row.id)));
          state.moreStatus = 'succeeded';
        } else {
          state.rows = incoming;
          state.status = 'succeeded';
          state.error = null;
          state.stale = false;
          state.staleUrgency = null;
        }
        state.cursor = action.payload.nextCursor;
        state.hasMore = action.payload.hasMore;
        /* Only the first page carries the summary, and only the first page may
           overwrite it: a "load more" response omits the key, and writing its
           `null` in would blank the header figures the merchant is looking at. */
        if (action.payload.summary) {
          state.summary = action.payload.summary as Draft<LedgerSummary>;
        }
      })
      .addCase(fetchPartyEntries.rejected, (state, action) => {
        takeReadSeq(state.readSeq, action.meta.requestId);
        if (action.meta.aborted) return;
        if (state.partyId !== null && state.partyId !== action.meta.arg.partyId) return;
        if (action.meta.arg.cursor) {
          // The rows already on screen are still good; only the next page
          // failed, and the snackbar has said so.
          state.moreStatus = 'failed';
          return;
        }
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      /* A posted entry goes straight to the top of the list rather than
         triggering a refetch (FR-3).

         The server has just told us the row and the balance; asking for them
         again is a round trip to re-learn what the response already carried,
         and on the connection this product is built for that is the difference
         between the row appearing and the row appearing in two seconds.

         Except when it is BACKDATED, which is why this is not a plain
         `unshift`: an entry dated last Tuesday belongs under last Tuesday's
         header, and putting it at the top would show the merchant their entry
         in a position it will not be in after the next reload. `insertByDate`
         puts it where the server's own ordering would. */
      .addCase(postEntry.fulfilled, (state, action) => {
        const entry = action.payload.entry as Draft<LedgerEntry>;
        if (state.partyId !== entry.partyId) return;
        insertByDate(state.rows, entry);
        if (state.summary) {
          state.summary = {
            ...state.summary,
            entryCount: state.summary.entryCount + 1,
          };
        }
      })
      /* An opening lands in the timeline the same way any entry does — and it
         is almost always the OLDEST row, so `insertByDate` usually puts it at
         the bottom or, on a partially loaded khata, declines to place it at
         all and leaves it for the page it belongs on. That is the right
         behaviour and not a shortcoming: a merchant who just added an opening
         dated last April should find it under last April.

         Its real effect on this slice is the summary: `entryCount` moving from
         zero to one is what turns the empty state into a timeline. */
      .addCase(postOpeningBalance.fulfilled, (state, action) => {
        const entry = action.payload.entry as Draft<LedgerEntry>;
        if (state.partyId !== entry.partyId) return;
        insertByDate(state.rows, entry);
        if (state.summary) {
          state.summary = { ...state.summary, entryCount: state.summary.entryCount + 1 };
        }
      })
      /* LED-03 — a reversal and a correction, and what they do to a list the
         merchant is looking at.

         Neither refetches. The server has just said everything that changed:
         which row is now struck through, what the new row is, and what the
         balance became. A refetch would be a round trip to re-learn it, on the
         connection this product is built for — and it would also reorder the
         list under the merchant's thumb.

         What both do is mark the ORIGINAL `reversed` in place. That row is on
         screen, and leaving it alone would show a line the merchant has just
         undone as though it still counted. Whether it then STAYS on screen is
         `showCorrections`: with the toggle off it is dropped, which is the
         clean khata FR-7 describes; with it on it remains, struck through,
         beside the reversal that undid it. */
      .addCase(reverseEntry.fulfilled, (state, action) => {
        applyReversal(state, {
          originalId: action.payload.originalId,
          reversal: action.payload.entry as Draft<LedgerEntry>,
          replacement: null,
          original: action.meta.arg.entry as Draft<LedgerEntry>,
        });
      })
      .addCase(correctEntry.fulfilled, (state, action) => {
        applyReversal(state, {
          originalId: action.payload.originalId,
          /* The reversal row itself is not in the response — only its id is —
             so with the toggle ON a correction leaves a gap the next fetch
             fills. That is deliberate: sending the row back would mean a second
             serialised entry on the wire for the one case where a merchant is
             looking at the raw history, and the map's `refetch` on this slice
             (NEW-2) already asks for the refresh. Until NEW-2 this comment said
             `stale` did, and nothing in the map marked this slice at all. */
          reversal: null,
          replacement: action.payload.entry as Draft<LedgerEntry>,
          original: action.meta.arg.entry as Draft<LedgerEntry>,
        });
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

/**
 * What a reverse or a correct does to the rows and the summary.
 *
 * One function for both, because they differ in exactly one thing — whether a
 * replacement row arrives — and two copies of this arithmetic would be two
 * copies that disagree the first time either is changed.
 *
 * The summary is adjusted here so it is right the moment the response lands,
 * and then refetched (NEW-2, the map's `refetch`) so the figures end up the
 * server's own. It is adjusted by the ORIGINAL's own direction and amount: `totalDebit` and `totalCredit` are sums over the rows
 * that count, and the original has just stopped counting. A merchant who
 * reverses a ₹500 "You gave" must not be left reading "You gave in all ₹2,800"
 * over a ₹2,300 balance — which is the same class of defect as the header that
 * did not move after a save, one line further down the card.
 */
interface ReversalPatch {
  readonly originalId: string;
  readonly reversal: Draft<LedgerEntry> | null;
  readonly replacement: Draft<LedgerEntry> | null;
  readonly original: Draft<LedgerEntry>;
}

const applyReversal = (state: Draft<LedgerEntryState>, patch: ReversalPatch): void => {
  const at = state.rows.findIndex((row) => row.id === patch.originalId);
  const struck = at === -1 ? undefined : state.rows[at];
  if (struck) {
    if (state.showCorrections) {
      // Mutated rather than replaced with a spread: this runs inside an Immer
      // draft, and a spread of a draft row widens every field to optional.
      struck.status = 'reversed';
      struck.reversedById = patch.reversal?.id ?? null;
    } else {
      state.rows.splice(at, 1);
    }
  }
  if (patch.reversal && state.showCorrections) insertByDate(state.rows, patch.reversal);
  if (patch.replacement) insertByDate(state.rows, patch.replacement);

  if (!state.summary) return;
  const removed = patch.original;
  const added = patch.replacement;
  const debit =
    (removed.direction === 'debit' ? -Number(removed.amount) : 0) +
    (added && added.direction === 'debit' ? Number(added.amount) : 0);
  const credit =
    (removed.direction === 'credit' ? -Number(removed.amount) : 0) +
    (added && added.direction === 'credit' ? Number(added.amount) : 0);
  state.summary = {
    totalDebit: addMoney(state.summary.totalDebit, debit),
    totalCredit: addMoney(state.summary.totalCredit, credit),
    entryCount: state.summary.entryCount + (added ? 0 : -1),
  };
};

/**
 * Add a delta to a decimal string, and stay a decimal string.
 *
 * This is the one place in the ledger client a money value becomes a number,
 * and it is bounded on purpose: two running TOTALS of a single party's khata,
 * changed by one entry, re-rounded to two places immediately. R-TS-7 forbids
 * numbers on the BOUNDARY — `amount` is parsed from no wire value here and
 * serialised to none — and the alternative is `decimal.js-light` on the app
 * shell for two additions, which `bundle-budgets.json` would rightly refuse.
 *
 * The figures either side of it are the server's, and the next fetch replaces
 * them with the server's again. If this ever needs to do arithmetic on anything
 * a merchant could not have typed into one entry, it needs the real library
 * instead.
 */
const addMoney = (value: string, delta: number): string =>
  (Math.round((Number(value) + delta) * 100) / 100).toFixed(2);

/**
 * Put an entry where the server's ordering would: `-entry_date`, then
 * `-created_at`.
 *
 * Mutating, because it runs inside an Immer draft and building a new array
 * would copy a timeline that can be hundreds of rows on every save.
 *
 * It does not re-sort. The list is already in order — this finds the first row
 * the new entry sorts before and splices it in, which is one pass and cannot
 * disturb the rest. A `sort()` on the whole array would compare only the two
 * keys it knows about and scramble the `id` tie-break the cursor depends on.
 */
export const insertByDate = (rows: Draft<LedgerEntry>[], entry: Draft<LedgerEntry>): void => {
  const at = rows.findIndex(
    (row) =>
      row.entryDate < entry.entryDate ||
      (row.entryDate === entry.entryDate && row.createdAt < entry.createdAt)
  );
  if (at === -1) {
    /* Older than everything loaded — which usually means it belongs on a page
       the merchant has not scrolled to. Appending it would put it at the bottom
       of a partial list, where it reads as "the oldest entry"; it is dropped
       instead, and `hasMore` means the next page will fetch it in its real
       place. The one case that would lose it is a fully loaded timeline, so the
       drop is conditional on there being more to load. */
    if (!rowsAreComplete(rows, entry)) return;
    rows.push(entry);
    return;
  }
  rows.splice(at, 0, entry);
};

/** True when the entry is not older than the last row we hold. */
const rowsAreComplete = (rows: Draft<LedgerEntry>[], entry: Draft<LedgerEntry>): boolean => {
  const last = rows[rows.length - 1];
  return last === undefined || last.entryDate <= entry.entryDate;
};

export const { ledgerTimelineOpened, correctionsVisibilityToggled, resetLedgerEntries } =
  ledgerEntrySlice.actions;

export default ledgerEntrySlice.reducer;

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectLedgerEntries = (state: RootState): readonly LedgerEntry[] =>
  state.ledgerEntry.rows;
export const selectLedgerPartyId = (state: RootState): string | null => state.ledgerEntry.partyId;
export const selectLedgerSummary = (state: RootState): LedgerSummary | null =>
  state.ledgerEntry.summary;
export const selectLedgerStatus = (state: RootState): RequestStatus => state.ledgerEntry.status;
export const selectLedgerMoreStatus = (state: RootState): RequestStatus =>
  state.ledgerEntry.moreStatus;
export const selectLedgerError = (state: RootState): ApiErrorShape | null =>
  state.ledgerEntry.error;
export const selectLedgerHasMore = (state: RootState): boolean => state.ledgerEntry.hasMore;
export const selectLedgerCursor = (state: RootState): string | null => state.ledgerEntry.cursor;
export const selectLedgerStale = (state: RootState): boolean => state.ledgerEntry.stale;
export const selectLedgerStaleSeq = (state: RootState): number => state.ledgerEntry.staleSeq;
export const selectShowCorrections = (state: RootState): boolean =>
  state.ledgerEntry.showCorrections;
