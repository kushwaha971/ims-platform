import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import * as memberService from '../api/memberService';

import type {
  IssuedCredentials,
  Member,
  MemberDraft,
  MemberEdit,
  MemberListParams,
  MemberListResult,
} from '../types/member.types';

/**
 * Part 19 §19.3.3 — one service call per thunk, three type arguments, and a
 * catch that normalises. Nothing here decides what the screen shows.
 */

/** QUERY — the team list. RTK's own `signal` supersedes a slow page. */
export const fetchMembers = createAsyncThunk<
  MemberListResult,
  MemberListParams,
  { rejectValue: ApiErrorShape }
>('member/fetchMembers', async (params, { signal, rejectWithValue }) => {
  try {
    return await memberService.listMembers(params, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'team.members.error.title'));
  }
});

export interface AddMemberArg extends MemberDraft {
  /** Minted once before the first attempt, reused on every retry (§19.1.3 note 1). */
  readonly idempotencyKey: string;
}

/**
 * MUTATION — add a member and receive the credentials.
 *
 * The 201 carries the password, which exists exactly once: the server keeps a
 * hash and can never show it again. It is returned THROUGH the thunk into the
 * slice rather than read in a `.then()`, so the one component that shows it
 * reads it from the store like everything else and a re-render cannot lose it.
 */
export const addMember = createAsyncThunk<
  IssuedCredentials,
  AddMemberArg,
  { rejectValue: ApiErrorShape }
>('member/addMember', async ({ idempotencyKey, ...input }, { rejectWithValue }) => {
  try {
    return await memberService.createMember(input, idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'team.member.add.error'));
  }
});

export interface RegenerateArg {
  readonly membershipId: string;
  readonly idempotencyKey: string;
}

/** MUTATION — reissue. Same one-appearance rule as the add above. */
export const regenerateCredentials = createAsyncThunk<
  IssuedCredentials,
  RegenerateArg,
  { rejectValue: ApiErrorShape }
>('member/regenerateCredentials', async ({ membershipId, idempotencyKey }, { rejectWithValue }) => {
  try {
    return await memberService.regenerateCredentials(membershipId, idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'team.member.regenerate.error'));
  }
});

// ── Owner, 12 Oct 2026: the manager's half — edit, block, unblock, remove ───

export interface EditMemberArg {
  readonly membershipId: string;
  readonly changes: MemberEdit;
}

/** MUTATION — a corrected name or a new role. The answer is the updated row. */
export const editMember = createAsyncThunk<Member, EditMemberArg, { rejectValue: ApiErrorShape }>(
  'member/editMember',
  async ({ membershipId, changes }, { rejectWithValue }) => {
    try {
      return await memberService.updateMember(membershipId, changes);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'team.member.edit.error'));
    }
  }
);

export interface MemberActionArg {
  readonly membershipId: string;
  readonly idempotencyKey: string;
}

/** MUTATION — locked out of this business, signed out everywhere in it. */
export const blockMember = createAsyncThunk<
  Member,
  MemberActionArg,
  { rejectValue: ApiErrorShape }
>('member/blockMember', async ({ membershipId, idempotencyKey }, { rejectWithValue }) => {
  try {
    return await memberService.blockMember(membershipId, idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'team.member.block.error'));
  }
});

/** MUTATION — let back in. May be refused for want of a seat. */
export const unblockMember = createAsyncThunk<
  Member,
  MemberActionArg,
  { rejectValue: ApiErrorShape }
>('member/unblockMember', async ({ membershipId, idempotencyKey }, { rejectWithValue }) => {
  try {
    return await memberService.unblockMember(membershipId, idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'team.member.unblock.error'));
  }
});

/** MUTATION — off the team. The row leaves the list; the server keeps it. */
export const removeMember = createAsyncThunk<
  Member,
  MemberActionArg,
  { rejectValue: ApiErrorShape }
>('member/removeMember', async ({ membershipId, idempotencyKey }, { rejectWithValue }) => {
  try {
    return await memberService.removeMember(membershipId, idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'team.member.remove.error'));
  }
});
