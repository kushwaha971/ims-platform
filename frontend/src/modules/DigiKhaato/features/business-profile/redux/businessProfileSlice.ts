import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import { fetchBusinessProfile, saveBusinessProfile } from './businessProfileThunk';

import type { BusinessProfile, ProfileWarning } from '../types/businessProfile.types';

/**
 * Part 19 §19.3.2 — PLT-07's slice. Route-local to `/settings/profile`,
 * injected lazily (CR-134). The shell's business NAME is the session's, which
 * a save refreshes — this slice is the form's source, not the app's.
 */
export interface BusinessProfileState {
  data: BusinessProfile | null;
  status: RequestStatus;
  error: ApiErrorShape | null;
  saveStatus: RequestStatus;
  warnings: ProfileWarning[];
}

const initialState: BusinessProfileState = {
  data: null,
  status: 'idle',
  error: null,
  saveStatus: 'idle',
  warnings: [],
};

const businessProfileSlice = createSlice({
  name: 'businessProfile',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchBusinessProfile.pending, (state) => {
        state.status = state.data ? 'refreshing' : 'loading';
        state.error = null;
      })
      .addCase(fetchBusinessProfile.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.data = action.payload as Draft<BusinessProfile>;
      })
      .addCase(fetchBusinessProfile.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      .addCase(saveBusinessProfile.pending, (state) => {
        state.saveStatus = 'loading';
      })
      .addCase(saveBusinessProfile.fulfilled, (state, action) => {
        state.saveStatus = 'succeeded';
        state.data = action.payload.profile as Draft<BusinessProfile>;
        state.warnings = action.payload.warnings;
      })
      .addCase(saveBusinessProfile.rejected, (state) => {
        state.saveStatus = 'failed';
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const businessProfileReducer = businessProfileSlice.reducer;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof businessProfileSlice> {}
}

const injected = businessProfileSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

export const selectBusinessProfile = (state: RootState): BusinessProfile | null =>
  slice$(state).data;
export const selectBusinessProfileStatus = (state: RootState): RequestStatus =>
  slice$(state).status;
export const selectBusinessProfileError = (state: RootState): ApiErrorShape | null =>
  slice$(state).error;
export const selectBusinessProfileSaveStatus = (state: RootState): RequestStatus =>
  slice$(state).saveStatus;
export const selectBusinessProfileWarnings = (state: RootState): readonly ProfileWarning[] =>
  slice$(state).warnings;
