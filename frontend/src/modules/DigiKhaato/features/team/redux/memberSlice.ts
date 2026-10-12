import { createSlice, isAnyOf, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import type { RootState } from 'src/redux/store';
import type { ApiErrorShape, PageMeta, RequestStatus } from 'src/types/api.types';

import { DEFAULT_PAGE_SIZE } from '../constants/teamDefaults';

import {
  addMember,
  blockMember,
  editMember,
  fetchMembers,
  regenerateCredentials,
  removeMember,
  unblockMember,
} from './memberThunk';

import type { IssuedCredentials, Member, MemberConfirmKind } from '../types/member.types';

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

  /**
   * Owner, 12 Oct 2026 — the manager's half. ONE ⋯ sheet for the whole list,
   * pointed at the row that was tapped (`EntryActionsMenu`'s reasoning: a
   * dialog per row is a portal per row waiting to be opened).
   */
  actionsTargetId: string | null;
  editTargetId: string | null;
  editStatus: RequestStatus;
  /** Block and Remove ask first; Unblock does not — it takes nothing away. */
  confirm: { readonly kind: MemberConfirmKind; readonly id: string } | null;
  /** Block, unblock or remove in flight (one at a time: the sheet is modal). */
  actionStatus: RequestStatus;

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
  actionsTargetId: null,
  editTargetId: null,
  editStatus: 'idle',
  confirm: null,
  actionStatus: 'idle',
  lastFetchedAt: null,
  stale: false,
  staleUrgency: null,
};

/** The server's answer for one row, in place — the list's order is the server's. */
const replaceRow = (state: Draft<MemberState>, member: Member): void => {
  state.rows = state.rows.map((row) => (row.id === member.id ? (member as Draft<Member>) : row));
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
    memberActionsOpened(state, action: PayloadAction<string>) {
      state.actionsTargetId = action.payload;
    },
    memberActionsClosed(state) {
      state.actionsTargetId = null;
    },
    editMemberOpened(state, action: PayloadAction<string>) {
      state.editTargetId = action.payload;
      state.editStatus = 'idle';
    },
    editMemberClosed(state) {
      state.editTargetId = null;
    },
    memberConfirmRequested(state, action: PayloadAction<{ kind: MemberConfirmKind; id: string }>) {
      state.confirm = action.payload;
      state.actionStatus = 'idle';
    },
    memberConfirmCancelled(state) {
      state.confirm = null;
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
          row.id === action.payload.member.id ? (action.payload.member as Draft<Member>) : row
        );
      })
      .addCase(regenerateCredentials.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.regenerateStatus = 'failed';
        // The confirm closes: the refusal is on its way to the global snackbar,
        // and a confirm that stays open after one reads as "press it again".
        state.regenerateTargetId = null;
      })

      .addCase(editMember.pending, (state) => {
        state.editStatus = 'loading';
      })
      .addCase(editMember.fulfilled, (state, action) => {
        state.editStatus = 'succeeded';
        state.editTargetId = null;
        replaceRow(state, action.payload);
      })
      .addCase(editMember.rejected, (state, action) => {
        if (action.meta.aborted) return;
        // The dialog STAYS open: a refused name or role is a field error the
        // merchant fixes in place (`applyServerErrors`), not a toast over a
        // form that vanished with what they typed.
        state.editStatus = 'failed';
      })

      .addCase(resetAllFeatureState, () => initialState)

      .addMatcher(
        isAnyOf(blockMember.pending, unblockMember.pending, removeMember.pending),
        (state) => {
          state.actionStatus = 'loading';
        }
      )
      .addMatcher(isAnyOf(blockMember.fulfilled, unblockMember.fulfilled), (state, action) => {
        state.actionStatus = 'succeeded';
        state.confirm = null;
        replaceRow(state, action.payload);
      })
      .addMatcher(isAnyOf(removeMember.fulfilled), (state, action) => {
        state.actionStatus = 'succeeded';
        state.confirm = null;
        state.rows = state.rows.filter((row) => row.id !== action.payload.id);
        state.meta = { ...state.meta, total: Math.max(0, state.meta.total - 1) };
      })
      .addMatcher(
        isAnyOf(blockMember.rejected, unblockMember.rejected, removeMember.rejected),
        (state, action) => {
          if (action.meta.aborted) return;
          // Closes, as the reissue confirm does: the refusal is on its way to
          // the global snackbar, and a confirm left open reads as "press again".
          state.actionStatus = 'failed';
          state.confirm = null;
        }
      );
  },
});

export const {
  memberPageChanged,
  addMemberDialogOpened,
  addMemberDialogClosed,
  credentialsDismissed,
  regenerateRequested,
  regenerateCancelled,
  memberActionsOpened,
  memberActionsClosed,
  editMemberOpened,
  editMemberClosed,
  memberConfirmRequested,
  memberConfirmCancelled,
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
export const selectMemberActionsTargetId = (state: RootState): string | null =>
  state.member.actionsTargetId;
export const selectEditMemberTargetId = (state: RootState): string | null =>
  state.member.editTargetId;
export const selectEditMemberStatus = (state: RootState): RequestStatus => state.member.editStatus;
export const selectMemberConfirm = (state: RootState): MemberState['confirm'] =>
  state.member.confirm;
export const selectMemberActionStatus = (state: RootState): RequestStatus =>
  state.member.actionStatus;
