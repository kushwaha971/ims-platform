import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { acceptInvalidation } from 'src/redux/invalidation/listener';
import type { RootState } from 'src/redux/store';
import type { ApiErrorShape, PageMeta, RequestStatus } from 'src/types/api.types';

import { DEFAULT_PAGE_SIZE } from '../constants/teamDefaults';

import { fetchInvitations, inviteMember, revokeInvitation } from './invitationThunk';

import type { CreatedInvitation, Invitation } from '../types/invitation.types';

/**
 * Part 19 §19.3.2 Shape A — a list slice, plus the two overlays this screen
 * cannot put in component state.
 *
 * Slice name = file name = store key (R-RX-1), selectors at the bottom and
 * exported by name (R-RX-3), `status` a discriminated union rather than a bag
 * of booleans (R-TS-4), `error` the normalised serialisable `ApiErrorShape`
 * (R-RX-10).
 *
 * ── Why the dialogs live here ───────────────────────────────────────────────
 * `inviteOpen` and `revokeTargetId` look like component state and are not. The
 * screen is a page, a grid, a form dialog and a confirm dialog, and the thing
 * that opens the confirm is a control inside a grid CELL. Holding that in the
 * page component means threading a callback down through the column factory
 * into every row; holding it here means the cell dispatches and the dialog
 * reads, which is the same argument `planSlice.dialogOpen` already makes.
 *
 * `lastInvite` is the sharper case. `accept_url` is returned exactly once — the
 * server stores only a hash of the token — so the link cannot be re-fetched and
 * a component that held it in `useState` would lose it to any remount. It is
 * state the merchant can lose money over, so it is state.
 */
export interface InvitationState {
  rows: Invitation[];
  meta: PageMeta;
  page: number;
  pageSize: number;
  status: RequestStatus;
  error: ApiErrorShape | null;

  /** The invite form dialog. */
  inviteOpen: boolean;
  inviteStatus: RequestStatus;
  inviteError: ApiErrorShape | null;
  /** The 201's one-time link, held until the merchant dismisses it. */
  lastInvite: CreatedInvitation | null;

  /** The invitation the confirm dialog is about; `null` means it is closed. */
  revokeTargetId: string | null;
  revokeStatus: RequestStatus;

  lastFetchedAt: number | null;
  /** Set by the invalidation listener (§19.3.6); the hook refetches on it. */
  stale: boolean;
  staleUrgency: 'now' | 'next-mount' | null;
}

const initialState: InvitationState = {
  rows: [],
  meta: { page: 1, pageSize: DEFAULT_PAGE_SIZE, total: 0, totalPages: 0 },
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  // Start in 'loading' so the grid paints its skeleton on first render rather
  // than flashing an empty state before the first request resolves. A viewer
  // with no permission never leaves it, and never sees it either: the page
  // renders the refusal instead of the grid.
  status: 'loading',
  error: null,
  inviteOpen: false,
  inviteStatus: 'idle',
  inviteError: null,
  lastInvite: null,
  revokeTargetId: null,
  revokeStatus: 'idle',
  lastFetchedAt: null,
  stale: false,
  staleUrgency: null,
};

const invitationSlice = createSlice({
  name: 'invitation',
  initialState,
  reducers: {
    pageChanged(state, action: PayloadAction<{ page: number; pageSize?: number }>) {
      state.page = action.payload.page;
      if (action.payload.pageSize) state.pageSize = action.payload.pageSize;
    },
    inviteDialogOpened(state) {
      state.inviteOpen = true;
      state.inviteError = null;
      state.inviteStatus = 'idle';
    },
    inviteDialogClosed(state) {
      state.inviteOpen = false;
      state.inviteError = null;
    },
    /**
     * The merchant has copied the link, or has decided not to. Either way the
     * client forgets it: it is a bearer credential, and holding it in the store
     * for the rest of the session so that a stray re-render can repaint it is
     * not something a screen should do with one.
     */
    inviteLinkDismissed(state) {
      state.lastInvite = null;
    },
    revokeRequested(state, action: PayloadAction<string>) {
      state.revokeTargetId = action.payload;
      state.revokeStatus = 'idle';
    },
    revokeCancelled(state) {
      state.revokeTargetId = null;
    },
    resetInvitations: () => initialState,
  },
  extraReducers: (builder) => {
    acceptInvalidation<InvitationState>('invitation')(builder);

    builder
      .addCase(fetchInvitations.pending, (state) => {
        // A background refresh keeps rows visible; a first load shows the
        // skeleton. Without this, revoking a row blanked the list the merchant
        // was reading and then repainted it.
        state.status = state.rows.length > 0 ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchInvitations.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.rows = [...action.payload.rows];
        state.meta = action.payload.meta;
        state.lastFetchedAt = Date.now();
        state.stale = false;
        state.staleUrgency = null;
      })
      .addCase(fetchInvitations.rejected, (state, action) => {
        // An aborted request is a superseded page change, not a failure.
        if (action.meta.aborted) return;
        state.status = 'failed';
        // Immer's Draft<T> cannot hold a readonly array and `ApiErrorShape`'s
        // `details` is readonly by contract (R-TS-5). The object is frozen by
        // `toApiError` and never mutated in the store, so the cast is safe.
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })

      .addCase(inviteMember.pending, (state) => {
        state.inviteStatus = 'loading';
        state.inviteError = null;
      })
      .addCase(inviteMember.fulfilled, (state, action) => {
        state.inviteStatus = 'succeeded';
        // The form dialog closes and the LINK dialog opens in its place, in one
        // transition: the merchant asked for an invitation and the invitation
        // is the link. Two dialogs on screen at once would bury it.
        state.inviteOpen = false;
        state.lastInvite = action.payload as Draft<CreatedInvitation>;
        // The row is added optimistically so the list answers immediately; the
        // invalidation map refetches behind it for the server's own ordering.
        state.rows = [action.payload as Draft<Invitation>, ...state.rows];
        state.meta = { ...state.meta, total: state.meta.total + 1 };
      })
      .addCase(inviteMember.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.inviteStatus = 'failed';
        state.inviteError = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })

      .addCase(revokeInvitation.pending, (state) => {
        state.revokeStatus = 'loading';
      })
      .addCase(revokeInvitation.fulfilled, (state, action) => {
        state.revokeStatus = 'succeeded';
        state.revokeTargetId = null;
        // Shown as revoked rather than removed. The row is the record that this
        // person was asked and is no longer welcome, and a row that disappears
        // on a 204 leaves the merchant unsure whether the act took effect.
        state.rows = state.rows.map((row) =>
          row.id === action.payload.id ? { ...row, status: 'revoked' } : row
        );
      })
      .addCase(revokeInvitation.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.revokeStatus = 'failed';
        // The dialog closes: the failure is already on its way to the global
        // snackbar, and a confirm dialog that stays open after a refusal reads
        // as "press it again", which is the wrong instruction for a 403.
        state.revokeTargetId = null;
      })

      // Logout and tenant switch clear every feature slice (§19.6.5). This one
      // holds a live invitation link, so the teardown matters more than most.
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const {
  pageChanged,
  inviteDialogOpened,
  inviteDialogClosed,
  inviteLinkDismissed,
  revokeRequested,
  revokeCancelled,
  resetInvitations,
} = invitationSlice.actions;

export default invitationSlice.reducer;

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectInvitationRows = (state: RootState): readonly Invitation[] =>
  state.invitation.rows;
export const selectInvitationMeta = (state: RootState): PageMeta => state.invitation.meta;
export const selectInvitationPage = (state: RootState): number => state.invitation.page;
export const selectInvitationPageSize = (state: RootState): number => state.invitation.pageSize;
export const selectInvitationStatus = (state: RootState): RequestStatus => state.invitation.status;
export const selectInvitationError = (state: RootState): ApiErrorShape | null =>
  state.invitation.error;
export const selectInviteOpen = (state: RootState): boolean => state.invitation.inviteOpen;
export const selectInviteStatus = (state: RootState): RequestStatus =>
  state.invitation.inviteStatus;
export const selectInviteError = (state: RootState): ApiErrorShape | null =>
  state.invitation.inviteError;
export const selectLastInvite = (state: RootState): CreatedInvitation | null =>
  state.invitation.lastInvite;
export const selectRevokeTargetId = (state: RootState): string | null =>
  state.invitation.revokeTargetId;
export const selectRevokeStatus = (state: RootState): RequestStatus =>
  state.invitation.revokeStatus;
export const selectInvitationStale = (state: RootState): boolean => state.invitation.stale;
