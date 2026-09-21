import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import * as memberService from '../api/memberService';

import type {
  IssuedCredentials,
  MemberDraft,
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
