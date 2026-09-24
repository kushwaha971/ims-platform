import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import * as businessProfileService from '../api/businessProfileService';

import type { BusinessProfile, ProfileWarning } from '../types/businessProfile.types';

/** QUERY — PLT-07 FR-1. */
export const fetchBusinessProfile = createAsyncThunk<
  BusinessProfile,
  void,
  { rejectValue: ApiErrorShape }
>('businessProfile/fetch', async (_arg, { signal, rejectWithValue }) => {
  try {
    return await businessProfileService.fetchTenant(signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'settings.profile.error.body'));
  }
});

/** MUTATION — FR-1/FR-3/FR-4. */
export const saveBusinessProfile = createAsyncThunk<
  { profile: BusinessProfile; warnings: ProfileWarning[] },
  BusinessProfile,
  { rejectValue: ApiErrorShape }
>('businessProfile/save', async (profile, { rejectWithValue }) => {
  try {
    return await businessProfileService.updateTenant(profile);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'settings.profile.saveError'));
  }
});
