import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import * as roleService from '../api/roleService';

import type { RoleOption } from '../types/role.types';

/** QUERY — A13: the roles the team screen may offer (`GET /roles`). */
export const fetchRoles = createAsyncThunk<
  readonly RoleOption[],
  void,
  { rejectValue: ApiErrorShape }
>('role/fetchRoles', async (_arg, { signal, rejectWithValue }) => {
  try {
    return await roleService.fetchRoles(signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'team.members.error.title'));
  }
});
