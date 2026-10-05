import { createSlice, type Draft, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import { rootReducer, type RootState } from 'src/redux/store';

import { MEMBER_FILTER_DEFAULTS } from '../constants/memberConstants';

import {
  applyFilterPatch,
  initialListState,
  listFulfilled,
  listPending,
  listRejected,
  type LibraryListState,
} from './libraryListState';
import {
  enrolLibraryMember,
  fetchLibraryMembers,
  fetchLibraryMembershipTypes,
  saveLibraryPlan,
} from './libraryMemberThunk';

import type {
  MemberFilters,
  MemberSummary,
  MemberTotals,
  MembershipType,
} from '../types/member.types';

/**
 * F04 (LIB-04 FR-6) — `/library/members`: the list, its totals over the
 * FILTERED set (FR-2's rule), and the membership types the filter and the
 * enrol drawer choose from. Injected lazily (CR-134).
 */
export type LibraryMemberListState = LibraryListState<MemberFilters, MemberSummary> & {
  totals: MemberTotals | null;
  types: MembershipType[];
  enrolling: boolean;
};

const initialState: LibraryMemberListState = {
  ...initialListState<MemberFilters, MemberSummary>(MEMBER_FILTER_DEFAULTS),
  totals: null,
  types: [],
  enrolling: false,
};

const libraryMemberListSlice = createSlice({
  name: 'libraryMemberList',
  initialState,
  reducers: {
    memberFiltersChanged(state, action: PayloadAction<Partial<MemberFilters>>) {
      applyFilterPatch(state, action.payload);
    },
  },
  extraReducers: (builder) => {
    acceptInvalidation<LibraryMemberListState>('libraryMemberList')(builder);
    builder
      .addCase(fetchLibraryMembers.pending, (state) => listPending(state))
      .addCase(fetchLibraryMembers.fulfilled, (state, action) => {
        listFulfilled(state, action.meta.arg, action.payload);
        // The late-response guard applies to the totals as to the rows.
        if (state.answered === JSON.stringify(action.meta.arg))
          state.totals = action.payload.totals as Draft<MemberTotals>;
      })
      .addCase(fetchLibraryMembers.rejected, (state, action) =>
        listRejected(state, action.meta.arg, action.meta.aborted, action.payload)
      )
      .addCase(fetchLibraryMembershipTypes.fulfilled, (state, action) => {
        state.types = action.payload as Draft<MembershipType>[];
      })
      .addCase(saveLibraryPlan.fulfilled, (state, action) => {
        const plan = action.payload as Draft<MembershipType>;
        state.types = state.types.some((t) => t.id === plan.id)
          ? state.types.map((t) => (t.id === plan.id ? plan : t))
          : [...state.types, plan];
      })
      .addCase(enrolLibraryMember.pending, (state) => {
        state.enrolling = true;
      })
      .addCase(enrolLibraryMember.fulfilled, (state) => {
        state.enrolling = false;
      })
      .addCase(enrolLibraryMember.rejected, (state) => {
        state.enrolling = false;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { memberFiltersChanged } = libraryMemberListSlice.actions;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof libraryMemberListSlice> {}
}

const injected = libraryMemberListSlice.injectInto(rootReducer);

export const selectLibraryMemberList = (state: RootState): LibraryMemberListState =>
  injected.selectSlice(state);
