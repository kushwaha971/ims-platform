import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import './libraryInvalidation';

import type { MemberAction, MemberPage } from '../api/libraryMemberService';
import type { MemberDetail, MemberFilters, MembershipType } from '../types/member.types';

/**
 * F04 (LIB-04) — the members' thunks: one service call each and a catch that
 * normalises. The service is imported inside each thunk, so a screen that only
 * dispatches never pays for it until its first request.
 */
const service = () => import('../api/libraryMemberService');

type Reject = { rejectValue: ApiErrorShape };

export const fetchLibraryMembers = createAsyncThunk<MemberPage, MemberFilters, Reject>(
  'libraryMemberList/fetch',
  async (filters, { signal, rejectWithValue }) => {
    try {
      return await (await service()).listMembers(filters, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.members.error.title'));
    }
  }
);

export const fetchLibraryMember = createAsyncThunk<MemberDetail, string, Reject>(
  'libraryMemberDetail/fetch',
  async (id, { signal, rejectWithValue }) => {
    try {
      return await (await service()).getMember(id, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.member.error.title'));
    }
  }
);

export const fetchLibraryMembershipTypes = createAsyncThunk<MembershipType[], void, Reject>(
  'libraryMemberList/fetchTypes',
  async (_arg, { signal, rejectWithValue }) => {
    try {
      return await (await service()).listMembershipTypes(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'library.members.error.title'));
    }
  }
);

export const enrolLibraryMember = createAsyncThunk<
  MemberDetail,
  { body: Readonly<Record<string, unknown>>; key: string },
  Reject
>('libraryMemberList/enrol', async ({ body, key }, { rejectWithValue }) => {
  try {
    return await (await service()).enrolMember(body, key);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'library.member.error.save'));
  }
});

export const actOnLibraryMember = createAsyncThunk<
  MemberDetail,
  {
    id: string;
    action: MemberAction;
    body: Readonly<Record<string, unknown>>;
    key?: string;
  },
  Reject
>('libraryMemberDetail/act', async ({ id, action, body, key }, { rejectWithValue }) => {
  try {
    return await (await service()).actOnMember(id, action, body, key);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'library.member.error.save'));
  }
});
