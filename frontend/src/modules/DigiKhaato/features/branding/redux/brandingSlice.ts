import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';
import { readDetailString } from 'src/utils/errorDetails';

import { fetchBranding, saveBranding } from './brandingThunk';

import type { Branding } from '../types/branding.types';

/**
 * Part 19 §19.3.2 — WLB-01's form state (`brandingSlice`). Route-local to
 * `/settings/branding` and `/settings/profile` (the signature), injected
 * lazily (CR-134). The THEME is not here: it reads the session's resolved
 * branding, which a save refreshes.
 *
 * `suggestedHex` is `low_contrast`'s `details.suggested_hex`, kept so the
 * colour field can offer "Try #9E9400" with a button that applies it.
 */
export interface BrandingState {
  data: Branding | null;
  status: RequestStatus;
  error: ApiErrorShape | null;
  saveStatus: RequestStatus;
  suggestedHex: string | null;
}

const initialState: BrandingState = {
  data: null,
  status: 'idle',
  error: null,
  saveStatus: 'idle',
  suggestedHex: null,
};

const brandingSlice = createSlice({
  name: 'branding',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchBranding.pending, (state) => {
        state.status = state.data ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchBranding.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.data = action.payload as Draft<Branding>;
      })
      .addCase(fetchBranding.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(saveBranding.pending, (state) => {
        state.saveStatus = 'loading';
        state.suggestedHex = null;
      })
      .addCase(saveBranding.fulfilled, (state, action) => {
        state.saveStatus = 'succeeded';
        state.data = action.payload as Draft<Branding>;
      })
      .addCase(saveBranding.rejected, (state, action) => {
        state.saveStatus = 'failed';
        if (action.payload?.code === 'low_contrast') {
          state.suggestedHex = readDetailString(action.payload.details, 'suggested_hex') ?? null;
        }
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const brandingReducer = brandingSlice.reducer;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof brandingSlice> {}
}

const injected = brandingSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

export const selectBranding = (state: RootState): Branding | null => slice$(state).data;
export const selectBrandingStatus = (state: RootState): RequestStatus => slice$(state).status;
export const selectBrandingError = (state: RootState): ApiErrorShape | null => slice$(state).error;
export const selectBrandingSaveStatus = (state: RootState): RequestStatus =>
  slice$(state).saveStatus;
export const selectSuggestedHex = (state: RootState): string | null => slice$(state).suggestedHex;
