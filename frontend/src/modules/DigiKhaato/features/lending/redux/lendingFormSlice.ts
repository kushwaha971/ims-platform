import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  blockLendingBorrower,
  collectFromBorrower,
  collectLendingLoan,
  createLendingLoan,
  fetchLendingBorrower,
  fetchLendingBorrowers,
  previewLendingLoan,
  unblockLendingBorrower,
  updateLendingBorrower,
} from './lendingThunk';

import type { BorrowerRow, LoanPreview } from '../types/lending.types';

/** The new-loan form's live preview and the borrower search. Injected lazily. */
export interface LendingFormState {
  preview: LoanPreview | null;
  previewStatus: RequestStatus;
  previewError: ApiErrorShape | null;
  borrowers: BorrowerRow[];
  /** The Borrowers list's own load state, so an unloaded list is not "No borrowers yet". */
  borrowersStatus: RequestStatus;
  /** The whole book's left and late (the line above the Borrowers table). */
  borrowerTotals: { left: string; late: string } | null;
  /** The borrower whose loans are being listed (`/lending/loans?borrower=`). */
  borrower: BorrowerRow | null;
  saving: boolean;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: LendingFormState = {
  preview: null,
  previewStatus: 'idle',
  previewError: null,
  borrowers: [],
  borrowersStatus: 'idle',
  borrowerTotals: null,
  borrower: null,
  saving: false,
  stale: false,
  staleUrgency: null,
};

/**
 * An edit, a block or an unblock answers with the borrower as the server now
 * holds them: that row replaces the page's borrower and their line in the
 * list, keeping the figures the list already had (the server sends the same
 * ones; a list row without them must not lose them to a write).
 */
const replaceBorrower = (state: Draft<LendingFormState>, next: BorrowerRow): void => {
  if (state.borrower?.id === next.id) {
    state.borrower = {
      ...next,
      summary: next.summary ?? state.borrower.summary,
    } as Draft<BorrowerRow>;
  }
  const at = state.borrowers.findIndex((row) => row.id === next.id);
  if (at >= 0) {
    const was = state.borrowers[at];
    state.borrowers[at] = { ...next, summary: next.summary ?? was?.summary } as Draft<BorrowerRow>;
  }
};

const lendingFormSlice = createSlice({
  name: 'lendingForm',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    acceptInvalidation<LendingFormState>('lendingForm')(builder);
    builder
      .addCase(previewLendingLoan.pending, (state) => {
        state.previewStatus = 'loading';
      })
      .addCase(previewLendingLoan.fulfilled, (state, action) => {
        state.preview = action.payload as Draft<LoanPreview>;
        state.previewStatus = 'succeeded';
        state.previewError = null;
      })
      .addCase(previewLendingLoan.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.previewStatus = 'failed';
        state.preview = null;
        state.previewError = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(fetchLendingBorrowers.pending, (state) => {
        state.borrowersStatus = state.borrowers.length ? 'refreshing' : 'loading';
      })
      .addCase(fetchLendingBorrowers.fulfilled, (state, action) => {
        state.borrowers = action.payload.rows as Draft<BorrowerRow>[];
        state.borrowerTotals = action.payload.totals;
        state.borrowersStatus = 'succeeded';
      })
      .addCase(fetchLendingBorrowers.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.borrowersStatus = 'failed';
      })
      // Somebody else's figures are never shown over a new name: cleared while
      // the next person's are read, and on a failure.
      .addCase(fetchLendingBorrower.pending, (state) => {
        state.borrower = null;
      })
      .addCase(fetchLendingBorrower.fulfilled, (state, action) => {
        state.borrower = action.payload as Draft<BorrowerRow>;
      })
      .addCase(fetchLendingBorrower.rejected, (state) => {
        state.borrower = null;
      })
      .addCase(createLendingLoan.pending, (state) => {
        state.saving = true;
      })
      .addCase(createLendingLoan.fulfilled, (state) => {
        state.saving = false;
        state.preview = null;
      })
      .addCase(createLendingLoan.rejected, (state) => {
        state.saving = false;
      })
      .addCase(collectFromBorrower.pending, (state) => {
        state.saving = true;
      })
      .addCase(collectFromBorrower.fulfilled, (state) => {
        state.saving = false;
      })
      .addCase(collectFromBorrower.rejected, (state) => {
        state.saving = false;
      })
      .addCase(collectLendingLoan.pending, (state) => {
        state.saving = true;
      })
      .addCase(collectLendingLoan.fulfilled, (state) => {
        state.saving = false;
      })
      .addCase(collectLendingLoan.rejected, (state) => {
        state.saving = false;
      })
      .addCase(updateLendingBorrower.fulfilled, (state, action) => {
        replaceBorrower(state, action.payload);
      })
      .addCase(blockLendingBorrower.fulfilled, (state, action) => {
        replaceBorrower(state, action.payload);
      })
      .addCase(unblockLendingBorrower.fulfilled, (state, action) => {
        replaceBorrower(state, action.payload);
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof lendingFormSlice> {}
}

const injected = lendingFormSlice.injectInto(rootReducer);

export const selectLendingForm = (state: RootState): LendingFormState =>
  injected.selectSlice(state);
