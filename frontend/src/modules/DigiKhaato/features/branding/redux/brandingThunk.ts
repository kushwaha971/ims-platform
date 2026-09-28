import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import * as brandingService from '../api/brandingService';

import type { Branding, BrandingChanges } from '../types/branding.types';

/** QUERY — WLB-01 FR-1. */
export const fetchBranding = createAsyncThunk<Branding, void, { rejectValue: ApiErrorShape }>(
  'branding/fetch',
  async (_arg, { signal, rejectWithValue }) => {
    try {
      return await brandingService.fetchBranding(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'branding.error.body'));
    }
  }
);

/** MUTATION — FR-1/FR-9 (and PLT-07's signature). */
export const saveBranding = createAsyncThunk<
  Branding,
  BrandingChanges,
  { rejectValue: ApiErrorShape }
>('branding/save', async (changes, { rejectWithValue }) => {
  try {
    return await brandingService.saveBranding(changes);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'branding.saveError'));
  }
});
