import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchMemberCharges } from './libraryChargeThunk';
import { actOnLibraryMember, fetchLibraryMember } from './libraryMemberThunk';

import type { ChargeRow, ChargeTotals } from '../types/charge.types';
import type { MemberDetail } from '../types/member.types';

/**
 * F04 (LIB-04 §7) — one member (`/library/members/[membershipId]`). Every act
 * answers with the member as it now is, so the page takes that answer rather
 * than asking again.
 */
export interface LibraryMemberDetailState {
  member: MemberDetail | null;
  status: RequestStatus;
  error: ApiErrorShape | null;
  actionStatus: RequestStatus;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
  /** F06 — every charge of this member, newest first, and their totals. */
  charges: ChargeRow[] | null;
  chargeTotals: ChargeTotals | null;
}

const initialState: LibraryMemberDetailState = {
  member: null,
  status: 'idle',
  error: null,
  actionStatus: 'idle',
  stale: false,
  staleUrgency: null,
  charges: null,
  chargeTotals: null,
};

const libraryMemberDetailSlice = createSlice({
  name: 'libraryMemberDetail',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    acceptInvalidation<LibraryMemberDetailState>('libraryMemberDetail')(builder);
    builder
      .addCase(fetchLibraryMember.pending, (state, action) => {
        const same = state.member?.membershipId === action.meta.arg;
        state.status = same ? 'refreshing' : 'loading';
        if (!same) {
          state.member = null;
          state.charges = null;
          state.chargeTotals = null;
        }
        state.error = null;
      })
      .addCase(fetchLibraryMember.fulfilled, (state, action) => {
        state.member = action.payload as Draft<MemberDetail>;
        state.status = 'succeeded';
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchLibraryMember.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(actOnLibraryMember.pending, (state) => {
        state.actionStatus = 'loading';
      })
      .addCase(actOnLibraryMember.fulfilled, (state, action) => {
        state.actionStatus = 'succeeded';
        if (state.member?.membershipId === action.payload.membershipId)
          state.member = action.payload as Draft<MemberDetail>;
      })
      .addCase(actOnLibraryMember.rejected, (state) => {
        state.actionStatus = 'failed';
      })
      .addCase(fetchMemberCharges.fulfilled, (state, action) => {
        state.charges = action.payload.rows as Draft<ChargeRow>[];
        state.chargeTotals = action.payload.totals as Draft<ChargeTotals>;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof libraryMemberDetailSlice> {}
}

const injected = libraryMemberDetailSlice.injectInto(rootReducer);

export const selectLibraryMemberDetail = (state: RootState): LibraryMemberDetailState =>
  injected.selectSlice(state);
