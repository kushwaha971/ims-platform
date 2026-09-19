import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { APP_NAME } from 'src/constants';
import { resetAllFeatureState } from 'src/redux/actions';
import type { RootState } from 'src/redux/store';

/**
 * Part 24 / Part 23 §23.2.4 — a tenant may override the primary ramp, the logo
 * and the document header/footer, and NOTHING else. Surfaces, semantic colours
 * and typography are not tenant-configurable, which is what keeps the red/green
 * ledger semantics and the audited contrast ratios intact.
 */
export interface WhiteLabelState {
  appName: string;
  /** One hex; `useWhiteLabelTheme()` derives the 50…900 ramp in HSL. */
  primaryHex: string | null;
  logoUrl: string | null;
}

const initialState: WhiteLabelState = { appName: APP_NAME, primaryHex: null, logoUrl: null };

const whiteLabelSlice = createSlice({
  name: 'whiteLabel',
  initialState,
  reducers: {
    applyWhiteLabel(state, action: PayloadAction<Partial<WhiteLabelState>>) {
      Object.assign(state, action.payload);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetAllFeatureState, () => initialState);
  },
});

export const { applyWhiteLabel } = whiteLabelSlice.actions;

export default whiteLabelSlice.reducer;

export const selectWhiteLabelPrimary = (state: RootState): string | null =>
  state.whiteLabel.primaryHex;
export const selectAppName = (state: RootState): string => state.whiteLabel.appName;
