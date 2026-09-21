import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import * as invitationService from '../api/invitationService';

import type {
  CreatedInvitation,
  InvitationDraft,
  InvitationListParams,
  InvitationListResult,
} from '../types/invitation.types';

/**
 * Part 19 §19.3.3 — one service call per thunk, three type arguments, and a
 * catch that normalises. Nothing here decides what the screen shows.
 */

/** QUERY — the team list. RTK's own `signal` supersedes a slow page. */
export const fetchInvitations = createAsyncThunk<
  InvitationListResult,
  InvitationListParams,
  { rejectValue: ApiErrorShape }
>('invitation/fetchInvitations', async (params, { signal, rejectWithValue }) => {
  try {
    return await invitationService.listInvitations(params, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'team.list.error.title'));
  }
});

export interface InviteMemberArg extends InvitationDraft {
  /**
   * Minted ONCE by `useIdempotencyKey()` before the first attempt and reused on
   * every retry of the same invite, so a lost 201 replays the invitation
   * instead of minting a second token for the same seat (§19.1.3 note 1).
   */
  readonly idempotencyKey: string;
}

/**
 * MUTATION — the invite.
 *
 * The 201 carries `accept_url`, which exists exactly once: the server keeps a
 * hash of the token and can never show the link again. It is therefore returned
 * through the thunk into the slice rather than being read in a `.then()`, so
 * that the one component that shows it reads it from the store like everything
 * else and a re-render cannot lose it.
 */
export const inviteMember = createAsyncThunk<
  CreatedInvitation,
  InviteMemberArg,
  { rejectValue: ApiErrorShape }
>('invitation/inviteMember', async ({ idempotencyKey, ...input }, { rejectWithValue }) => {
  try {
    return await invitationService.createInvitation(input, idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'team.invite.error'));
  }
});

/**
 * MUTATION — revoke.
 *
 * It resolves to the id rather than to `void` so the slice can drop that one
 * row without a refetch. The list is then marked stale by the invalidation map
 * for the ordinary reason — the server owns `status`, and a revoked invitation
 * is a row that changed, not a row that vanished.
 */
export const revokeInvitation = createAsyncThunk<
  { readonly id: string },
  { readonly id: string },
  { rejectValue: ApiErrorShape }
>('invitation/revokeInvitation', async ({ id }, { rejectWithValue }) => {
  try {
    await invitationService.revokeInvitation(id);
    return { id };
  } catch (error) {
    return rejectWithValue(toApiError(error, 'team.revoke.error'));
  }
});
