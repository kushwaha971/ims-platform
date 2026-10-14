import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import type { PaymentPage } from 'modules/DigiKhaato/features/payments/types/payment.types';

import { fetchMemberPayments } from './libraryPaymentThunk';

/** A separate lazy read keeps receipt loading from repainting the student's forms. */
interface MemberPaymentsState {
  membershipId: string | null;
  partyId: string | null;
  data: PaymentPage | null;
  status: RequestStatus;
  requestId: string | null;
  error: ApiErrorShape | null;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: MemberPaymentsState = {
  membershipId: null,
  partyId: null,
  data: null,
  status: 'idle',
  requestId: null,
  error: null,
  stale: false,
  staleUrgency: null,
};

export const libraryMemberPaymentsSlice = createSlice({
  name: 'libraryMemberPayments',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    acceptInvalidation<MemberPaymentsState>('libraryMemberPayments')(builder);
    builder
      .addCase(fetchMemberPayments.pending, (state, action) => {
        const same =
          state.membershipId === action.meta.arg.membershipId &&
          state.partyId === action.meta.arg.partyId;
        if (!same) state.data = null;
        state.membershipId = action.meta.arg.membershipId;
        state.partyId = action.meta.arg.partyId;
        state.requestId = action.meta.requestId;
        state.status = state.data ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchMemberPayments.fulfilled, (state, action) => {
        if (state.requestId !== action.meta.requestId) return;
        state.data = action.payload as Draft<PaymentPage>;
        state.status = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchMemberPayments.rejected, (state, action) => {
        if (action.meta.aborted || state.requestId !== action.meta.requestId) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof libraryMemberPaymentsSlice> {}
}

const injected = libraryMemberPaymentsSlice.injectInto(rootReducer);
export const selectMemberPayments = (state: RootState): MemberPaymentsState =>
  injected.selectSlice(state);
