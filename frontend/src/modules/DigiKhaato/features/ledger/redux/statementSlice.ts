import { createSlice, type WithSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

/* From `constants/`, NOT from the view-model: a slice is registered
   statically, so anything it imports ships to every route. That import cost
   2.2 KB of shell before the gate caught it. */
import { DEFAULT_PRESET } from '../constants/statementPeriod';

import { fetchPartyStatement, fetchStatementAllRows } from './statementThunk';

import type {
  StatementFilters,
  StatementParty,
  StatementPeriod,
  StatementRow,
  StatementSummary,
} from '../types/statement.types';

/**
 * Part 19 §19.3.2 Shape B — the statement, keyed by the party it is showing.
 *
 * ── A note for the §19.3.9 decision, because this slice is a new KIND of
 * ── data point rather than another increment
 *
 * Every feature slice `store.ts` registers statically ships to every route, and
 * the running tally is now eight features long. What is different about this
 * one is that it is provably ROUTE-LOCAL: the statement has its own address,
 * `/parties/[id]/statement`, and nothing else in the product reads this state.
 * Every earlier slice could at least be argued to belong to the shell — the
 * party list's filters are read by the nav, the ledger form is opened from the
 * khata page and will be opened from the dashboard. This one is downloaded by
 * every merchant who opens the login screen and read by the ones who print a
 * statement, and there is no argument that makes that right.
 *
 * ── Why `partyId` is state and not only a thunk argument
 *
 * A late page for party A appended under party B's header would put one
 * customer's transactions on another's statement — the same failure the
 * timeline guards, and worse here, because a statement is the artefact a
 * merchant hands across a counter.
 */
export interface StatementState {
  partyId: string | null;
  party: StatementParty | null;
  period: StatementPeriod | null;
  summary: StatementSummary | null;
  rows: StatementRow[];
  cursor: string | null;
  hasMore: boolean;
  status: RequestStatus;
  moreStatus: RequestStatus;
  error: ApiErrorShape | null;
  /**
   * FR-8 — the whole period, fetched for print.
   *
   * Held apart from `rows` rather than replacing them, because the merchant is
   * still looking at the paged table while this loads and swapping five
   * thousand rows under them would move whatever they were reading. It is
   * cleared when the print view closes.
   */
  printRows: StatementRow[] | null;
  printStatus: RequestStatus;
  filters: StatementFilters;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: StatementState = {
  partyId: null,
  party: null,
  period: null,
  summary: null,
  rows: [],
  cursor: null,
  hasMore: false,
  status: 'idle',
  moreStatus: 'idle',
  error: null,
  printRows: null,
  printStatus: 'idle',
  filters: {
    preset: DEFAULT_PRESET,
    dateFrom: null,
    dateTo: null,
    includeCorrections: false,
  },
  stale: false,
  staleUrgency: null,
};

const statementSlice = createSlice({
  name: 'statement',
  initialState,
  reducers: {
    /** The statement page is opening, or the party under it changed. */
    statementOpened(state, action: PayloadAction<string>) {
      if (state.partyId === action.payload) {
        state.error = null;
        return;
      }
      Object.assign(state, initialState, { partyId: action.payload, status: 'loading' });
    },
    /**
     * The merchant changed the period or the corrections toggle.
     *
     * Rows are CLEARED rather than kept while the new page loads. A statement
     * is read as a whole — the opening, the rows and the closing are one
     * argument — and showing April's rows under May's opening balance for the
     * length of a request is showing a number that was never true.
     */
    statementFiltersChanged(state, action: PayloadAction<StatementFilters>) {
      state.filters = action.payload as Draft<StatementFilters>;
      state.rows = [];
      state.cursor = null;
      state.hasMore = false;
      state.printRows = null;
      state.printStatus = 'idle';
      state.status = 'loading';
      state.error = null;
    },
    printRowsDiscarded(state) {
      state.printRows = null;
      state.printStatus = 'idle';
    },
    resetStatement: () => initialState,
  },
  extraReducers: (builder) => {
    acceptInvalidation<StatementState>('statement')(builder);

    builder
      .addCase(fetchPartyStatement.pending, (state, action) => {
        if (action.meta.arg.cursor) {
          state.moreStatus = 'loading';
          return;
        }
        state.status = state.rows.length > 0 ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchPartyStatement.fulfilled, (state, action) => {
        // The late-response guard — see the interface docstring.
        if (state.partyId !== null && state.partyId !== action.meta.arg.partyId) return;
        const page = action.payload;
        if (action.meta.arg.cursor) {
          /* Append and DEDUPE, for the reason the timeline does: a cursor is a
             position in an ordering, and an entry posted between two page
             requests shifts every later row by one. */
          const known = new Set(state.rows.map((row) => row.id));
          state.rows.push(...(page.rows.filter((row) => !known.has(row.id)) as Draft<StatementRow>[]));
          state.moreStatus = 'succeeded';
        } else {
          state.rows = page.rows as Draft<StatementRow>[];
          state.status = 'succeeded';
          state.error = null;
          state.stale = false;
          state.staleUrgency = null;
        }
        /* The header figures come from EVERY page, unlike the timeline's
           summary, and they have to: `opening_balance` and `closing_balance`
           are computed over the whole period rather than over the page, so page
           two carries the same two numbers and overwriting them is a no-op
           rather than a risk. Writing them unconditionally is what keeps a
           "Load more" from being the one response that leaves the header
           holding figures from a filter the merchant has since changed. */
        state.party = page.party as Draft<StatementParty>;
        state.period = page.period as Draft<StatementPeriod>;
        state.summary = page.summary as Draft<StatementSummary>;
        state.cursor = page.nextCursor;
        state.hasMore = page.hasMore;
      })
      .addCase(fetchPartyStatement.rejected, (state, action) => {
        if (action.meta.aborted) return;
        if (state.partyId !== null && state.partyId !== action.meta.arg.partyId) return;
        if (action.meta.arg.cursor) {
          state.moreStatus = 'failed';
          return;
        }
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(fetchStatementAllRows.pending, (state) => {
        state.printStatus = 'loading';
      })
      .addCase(fetchStatementAllRows.fulfilled, (state, action) => {
        if (state.partyId !== null && state.partyId !== action.meta.arg.partyId) return;
        state.printRows = action.payload.rows as Draft<StatementRow>[];
        state.printStatus = 'succeeded';
      })
      .addCase(fetchStatementAllRows.rejected, (state, action) => {
        if (action.meta.aborted) {
          // EC-2 — the merchant cancelled. Not a failure, and a red strip over
          // a statement they are still reading would say it was.
          state.printStatus = 'idle';
          return;
        }
        state.printStatus = 'failed';
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { statementOpened, statementFiltersChanged, printRowsDiscarded, resetStatement } =
  statementSlice.actions;

export const statementReducer = statementSlice.reducer;

// ── Lazy registration (CR-134) ───────────────────────────────────────────────
// Only the route that imports this module needs this state, so the reducer
// arrives with that route's chunk instead of with every page. `selectSlice`
// answers the initial state until the first action lands.

declare module 'src/redux/store' {
   
  export interface LazyLoadedSlices extends WithSlice<typeof statementSlice> {}
}

const injected = statementSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectStatementRows = (state: RootState): readonly StatementRow[] =>
  slice$(state).rows;
export const selectStatementParty = (state: RootState): StatementParty | null =>
  slice$(state).party;
export const selectStatementPeriod = (state: RootState): StatementPeriod | null =>
  slice$(state).period;
export const selectStatementSummary = (state: RootState): StatementSummary | null =>
  slice$(state).summary;
export const selectStatementStatus = (state: RootState): RequestStatus => slice$(state).status;
export const selectStatementMoreStatus = (state: RootState): RequestStatus =>
  slice$(state).moreStatus;
export const selectStatementError = (state: RootState): ApiErrorShape | null =>
  slice$(state).error;
export const selectStatementHasMore = (state: RootState): boolean => slice$(state).hasMore;
export const selectStatementCursor = (state: RootState): string | null => slice$(state).cursor;
export const selectStatementFilters = (state: RootState): StatementFilters =>
  slice$(state).filters;
export const selectStatementPrintRows = (state: RootState): readonly StatementRow[] | null =>
  slice$(state).printRows;
export const selectStatementPrintStatus = (state: RootState): RequestStatus =>
  slice$(state).printStatus;
export const selectStatementStale = (state: RootState): boolean => slice$(state).stale;
