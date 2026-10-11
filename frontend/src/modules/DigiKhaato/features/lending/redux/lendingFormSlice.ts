import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  collectLendingLoan,
  createLendingLoan,
  fetchLendingBorrower,
  fetchLendingBorrowers,
  previewLendingLoan,
} from './lendingThunk';

import type { BorrowerRow, LoanPreview } from '../types/lending.types';

/** The new-loan form's live preview and the borrower search. Injected lazily. */
export interface LendingFormState {
  preview: LoanPreview | null;
  previewStatus: RequestStatus;
  previewError: ApiErrorShape | null;
  borrowers: BorrowerRow[];
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
  borrower: null,
  saving: false,
  stale: false,
  staleUrgency: null,
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
      .addCase(fetchLendingBorrowers.fulfilled, (state, action) => {
        state.borrowers = action.payload as Draft<BorrowerRow>[];
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
      .addCase(collectLendingLoan.pending, (state) => {
        state.saving = true;
      })
      .addCase(collectLendingLoan.fulfilled, (state) => {
        state.saving = false;
      })
      .addCase(collectLendingLoan.rejected, (state) => {
        state.saving = false;
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
