import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import { listPartyRoles } from '../api/partyRelationService';

import type { PartyRole } from '../types/party.types';

/** QUERY — A6: the enabled modules' party roles, for the list's chips row. */
export const fetchPartyRoles = createAsyncThunk<
  readonly PartyRole[],
  void,
  { rejectValue: ApiErrorShape }
>('partyRole/fetch', async (_arg, { signal, rejectWithValue }) => {
  try {
    return await listPartyRoles(signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'parties.roles.error'));
  }
});
