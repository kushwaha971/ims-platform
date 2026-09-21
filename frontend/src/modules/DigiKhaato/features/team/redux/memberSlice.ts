import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import type { RootState } from 'src/redux/store';
import type { ApiErrorShape, PageMeta, RequestStatus } from 'src/types/api.types';

import { DEFAULT_PAGE_SIZE } from '../constants/teamDefaults';

import { addMember, fetchMembers, regenerateCredentials } from './memberThunk';

import type { IssuedCredentials, Member } from '../types/member.types';

/**
 * Part 19 §19.3.2 Shape A — a list slice plus the two overlays this screen
 * cannot put in component state (DEC-012).
 *
 * ── Why `lastCredentials` is store state, not `useState` ────────────────────
 * The same argument `lastInvite` makes next door, only sharper. The password is
 * returned exactly once — the server keeps a hash and cannot show it again — so
 * a component holding it in `useState` would lose it to any remount, a fast
 * refresh, or a parent re-render, and the merchant's only way back is to
 * regenerate and re-send. It is state somebody can lose a working login over,
 * so it is state.
 *
 * It is also deliberately NOT persisted and is cleared on logout and on tenant
 * switch with the rest of the feature state: it is a live credential, and
 * keeping it around so a stray re-render can repaint it is not something a
 * screen should do with one.
 */
export interface MemberState {
  rows: Member[];
  meta: PageMeta;
  page: number;
  pageSize: number;
  status: RequestStatus;
  error: ApiErrorShape | null;

  /** The add-member form dialog. */
  addOpen: boolean;
  addStatus: RequestStatus;
  addError: ApiErrorShape | null;

  /** The one-time credentials, held until the merchant dismisses them. */
  lastCredentials: IssuedCredentials | null;

  /** The membership the reissue confirm is about; `null` means it is closed. */
  regenerateTargetId: string | null;
  regenerateStatus: RequestStatus;

  lastFetchedAt: number | null;
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: MemberState = {
  rows: [],
  meta: { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, totalPages: 0 },
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  status: 'loading',
  error: null,
  addOpen: false,
  addStatus: 'idle',
  addError: null,
  lastCredentials: null,
  regenerateTargetId: null,
  regenerateStatus: 'idle',
  lastFetchedAt: null,
  stale: false,
  staleUrgency: null,
};

const memberSlice = createSlice({
  name: 'member',
  initialState,
  reducers: {
    memberPageChanged(state, action: PayloadAction<{ page: number; pageSize?: number }>) {
      state.page = action.payload.page;
      if (action.payload.pageSize) state.pageSize = action.payload.pageSize;
    },
    addMemberDialogOpened(state) {
      state.addOpen = true;
      state.addError = null;
      state.addStatus = 'idle';
    },
    addMemberDialogClosed(state) {
      state.addOpen = false;
      state.addError = null;
    },
    /**
     * The merchant has sent the credentials, or has decided not to. Either way
     * the client forgets them — see the slice docstring.
     */
    credentialsDismissed(state) {
      state.lastCredentials = null;
    },
    regenerateRequested(state, action: PayloadAction<string>) {
      state.regenerateTargetId = action.payload;
      state.regenerateStatus = 'idle';
    },
    regenerateCancelled(state) {
      state.regenerateTargetId = null;
    },
    resetMembers: () => initialState,
  },
  extraReducers: (builder) => {
    acceptInvalidation<MemberState>('member')(builder);

    builder
      .addCase(fetchMembers.pending, (state) => {
        state.status = state.rows.length > 0 ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchMembers.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.rows = [...action.payload.rows];
        state.meta = action.payload.meta;
        state.lastFetchedAt = Date.now();
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchMembers.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })

      .addCase(addMember.pending, (state) => {
        state.addStatus = 'loading';
        state.addError = null;
      })
      .addCase(addMember.fulfilled, (state, action) => {
        state.addStatus = 'succeeded';
        // The form closes and the credentials dialog opens in its place, in one
        // transition. Two dialogs at once would bury the one thing on screen
        // that cannot be recovered.
        state.addOpen = false;
        state.lastCredentials = action.payload as Draft<IssuedCredentials>;
        state.rows = [action.payload.member as Draft<Member>, ...state.rows];
        state.meta = { ...state.meta, total: state.meta.total + 1 };
      })
      .addCase(addMember.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.addStatus = 'failed';
        state.addError = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })

      .addCase(regenerateCredentials.pending, (state) => {
        state.regenerateStatus = 'loading';
      })
      .addCase(regenerateCredentials.fulfilled, (state, action) => {
        state.regenerateStatus = 'succeeded';
        state.regenerateTargetId = null;
        state.lastCredentials = action.payload as Draft<IssuedCredentials>;
        state.rows = state.rows.map((row) =>
          row.id === action.payload.member.id
            ? (action.payload.member as Draft<Member>)
            : row
        );
      })
      .addCase(regenerateCredentials.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.regenerateStatus = 'failed';
        // The confirm closes: the refusal is on its way to the global snackbar,
        // and a confirm that stays open after one reads as "press it again".
        state.regenerateTargetId = null;
      })

      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const {
  memberPageChanged,
  addMemberDialogOpened,
  addMemberDialogClosed,
  credentialsDismissed,
  regenerateRequested,
  regenerateCancelled,
  resetMembers,
} = memberSlice.actions;

export default memberSlice.reducer;

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectMemberRows = (state: RootState): readonly Member[] => state.member.rows;
export const selectMemberMeta = (state: RootState): PageMeta => state.member.meta;
export const selectMemberPage = (state: RootState): number => state.member.page;
export const selectMemberPageSize = (state: RootState): number => state.member.pageSize;
export const selectMemberStatus = (state: RootState): RequestStatus => state.member.status;
export const selectMemberError = (state: RootState): ApiErrorShape | null => state.member.error;
export const selectAddMemberOpen = (state: RootState): boolean => state.member.addOpen;
export const selectAddMemberStatus = (state: RootState): RequestStatus => state.member.addStatus;
export const selectAddMemberError = (state: RootState): ApiErrorShape | null =>
  state.member.addError;
export const selectLastCredentials = (state: RootState): IssuedCredentials | null =>
  state.member.lastCredentials;
export const selectRegenerateTargetId = (state: RootState): string | null =>
  state.member.regenerateTargetId;
export const selectRegenerateStatus = (state: RootState): RequestStatus =>
  state.member.regenerateStatus;
export const selectMemberStale = (state: RootState): boolean => state.member.stale;
