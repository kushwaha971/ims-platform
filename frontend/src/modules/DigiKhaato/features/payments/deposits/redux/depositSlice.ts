import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import {
  applyDeposit,
  fetchDeposit,
  fetchPartyDeposits,
  receiveDeposit,
  refundDeposit,
} from './depositThunk';

import type { Deposit, DepositDetail } from '../types/deposit.types';

/**
 * A4b — the deposits of the party on screen, and the one write in flight.
 * Lazily injected (CR-134): only a screen that shows a deposit panel imports it.
 * A write's answer replaces the deposit in place (the `patch`), and the
 * invalidation map re-reads the khata, which moved too.
 */
export interface DepositState {
  partyId: string | null;
  rows: Deposit[];
  heldTotal: string;
  status: RequestStatus;
  error: ApiErrorShape | null;
  writeStatus: RequestStatus;
  /** The deposit the slip prints, with its receipts, applications and returns. */
  detail: DepositDetail | null;
  detailStatus: RequestStatus;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: DepositState = {
  partyId: null,
  rows: [],
  heldTotal: '0.00',
  status: 'idle',
  error: null,
  writeStatus: 'idle',
  detail: null,
  detailStatus: 'idle',
  stale: false,
  staleUrgency: null,
};

const depositSlice = createSlice({
  name: 'deposit',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    acceptInvalidation<DepositState>('deposit')(builder);
    builder
      .addCase(fetchPartyDeposits.pending, (state, action) => {
        state.status = state.partyId === action.meta.arg ? 'refreshing' : 'loading';
        if (state.partyId !== action.meta.arg) state.rows = [];
        state.partyId = action.meta.arg;
        state.error = null;
      })
      .addCase(fetchPartyDeposits.fulfilled, (state, action) => {
        if (state.partyId !== action.meta.arg) return;
        state.rows = action.payload.rows as Draft<Deposit>[];
        state.heldTotal = action.payload.heldTotal;
        state.status = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchPartyDeposits.rejected, (state, action) => {
        if (action.meta.aborted || state.partyId !== action.meta.arg) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      });
    builder
      .addCase(fetchDeposit.pending, (state) => {
        state.detailStatus = 'loading';
      })
      .addCase(fetchDeposit.fulfilled, (state, action) => {
        state.detail = action.payload as Draft<DepositDetail>;
        state.detailStatus = 'succeeded';
      })
      .addCase(fetchDeposit.rejected, (state, action) => {
        if (!action.meta.aborted) state.detailStatus = 'failed';
      });
    for (const thunk of [receiveDeposit, refundDeposit, applyDeposit]) {
      builder
        .addCase(thunk.pending, (state) => {
          state.writeStatus = 'loading';
        })
        .addCase(thunk.fulfilled, (state, action) => {
          state.writeStatus = 'succeeded';
          const next = action.payload.deposit;
          state.rows = state.rows.map((row) =>
            row.id === next.id ? ({ ...next } as Draft<Deposit>) : row
          );
          // The answer carries the deposit's evidence too: a slip opened next is current.
          state.detail = next as Draft<DepositDetail>;
          state.detailStatus = 'succeeded';
        })
        .addCase(thunk.rejected, (state) => {
          state.writeStatus = 'failed';
        });
    }
    builder.addCase(resetAllFeatureState, () => initialState);
  },
});

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof depositSlice> {}
}

const injected = depositSlice.injectInto(rootReducer);

export const selectDeposits = (state: RootState): DepositState => injected.selectSlice(state);
