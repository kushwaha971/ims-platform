import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation, takeReadSeq } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchLendingLoan, fetchLendingLoans } from './lendingThunk';

import type {
  CollectionRow,
  LoanDetail,
  LoanMessageRow,
  LoanRow,
  VisitRow,
} from '../types/lending.types';

/** The loan book and the loan open on screen. Injected lazily. */
export interface LendingLoansState {
  rows: LoanRow[];
  total: number;
  /** The server's: whether the business has any loan, whatever the filter. */
  hasLoans: boolean;
  listStatus: RequestStatus;
  listBorrowerId: string | null;
  listRequestId: string | null;
  listQueryKey?: string;
  loanRequestId: string | null;
  staleSeq: number;
  readSeq: Record<string, number>;
  loan: LoanDetail | null;
  collections: CollectionRow[];
  visits: VisitRow[];
  messages: LoanMessageRow[];
  status: RequestStatus;
  error: ApiErrorShape | null;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: LendingLoansState = {
  rows: [],
  total: 0,
  hasLoans: true,
  listStatus: 'idle',
  listBorrowerId: null,
  listRequestId: null,
  loanRequestId: null,
  staleSeq: 0,
  readSeq: {},
  loan: null,
  collections: [],
  visits: [],
  messages: [],
  status: 'idle',
  error: null,
  stale: false,
  staleUrgency: null,
};

export const lendingLoansSlice = createSlice({
  name: 'lendingLoans',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    acceptInvalidation<LendingLoansState>('lendingLoans')(builder);
    builder
      .addCase(fetchLendingLoans.pending, (state, action) => {
        const borrowerId = action.meta.arg.borrower ?? '';
        const queryKey = JSON.stringify({
          status: action.meta.arg.status ?? '',
          q: action.meta.arg.q ?? '',
          route: action.meta.arg.route ?? '',
          borrower: borrowerId,
        });
        if (state.listQueryKey !== queryKey) {
          state.rows = [];
          state.total = 0;
        }
        state.listQueryKey = queryKey;
        state.listBorrowerId = borrowerId;
        state.listRequestId = action.meta.requestId;
        state.readSeq[action.meta.requestId] = state.staleSeq;
        state.listStatus = state.rows.length ? 'refreshing' : 'loading';
      })
      .addCase(fetchLendingLoans.fulfilled, (state, action) => {
        const readSeq = takeReadSeq(state.readSeq, action.meta.requestId);
        if (state.listRequestId !== action.meta.requestId || readSeq !== state.staleSeq) return;
        state.listRequestId = null;
        const incoming = action.payload.rows as Draft<LoanRow>[];
        state.rows =
          Number(action.meta.arg.page ?? '1') > 1
            ? [...new Map([...state.rows, ...incoming].map((row) => [row.id, row])).values()]
            : incoming;
        state.total = action.payload.total;
        state.hasLoans = action.payload.hasLoans;
        state.listStatus = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchLendingLoans.rejected, (state, action) => {
        const readSeq = takeReadSeq(state.readSeq, action.meta.requestId);
        if (
          action.meta.aborted ||
          state.listRequestId !== action.meta.requestId ||
          readSeq !== state.staleSeq
        )
          return;
        state.listRequestId = null;
        state.listStatus = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(fetchLendingLoan.pending, (state, action) => {
        state.loanRequestId = action.meta.requestId;
        state.readSeq[action.meta.requestId] = state.staleSeq;
        state.status = state.loan?.id === action.meta.arg ? 'refreshing' : 'loading';
        if (state.loan?.id !== action.meta.arg) state.loan = null;
      })
      .addCase(fetchLendingLoan.fulfilled, (state, action) => {
        const readSeq = takeReadSeq(state.readSeq, action.meta.requestId);
        if (state.loanRequestId !== action.meta.requestId || readSeq !== state.staleSeq) return;
        state.loanRequestId = null;
        state.loan = action.payload.loan as Draft<LoanDetail>;
        state.collections = action.payload.collections as Draft<CollectionRow>[];
        state.visits = action.payload.visits as Draft<VisitRow>[];
        state.messages = action.payload.messages as Draft<LoanMessageRow>[];
        state.status = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchLendingLoan.rejected, (state, action) => {
        const readSeq = takeReadSeq(state.readSeq, action.meta.requestId);
        if (
          action.meta.aborted ||
          state.loanRequestId !== action.meta.requestId ||
          readSeq !== state.staleSeq
        )
          return;
        state.loanRequestId = null;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof lendingLoansSlice> {}
}

const injected = lendingLoansSlice.injectInto(rootReducer);

export const selectLendingLoans = (state: RootState): LendingLoansState =>
  injected.selectSlice(state);
