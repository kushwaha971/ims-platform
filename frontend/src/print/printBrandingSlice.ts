import { createSlice, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';

import { fetchPrintBranding } from './printBrandingThunk';

import type { PrintBranding } from './brandingPrintService';

/**
 * R33 / A16 — the letterhead, held once for whichever screen is printing.
 *
 * Lazily injected (CR-134): only a route that prints imports this module, so
 * the login screen and every read-only list pay nothing for it. It used to be
 * two copies of the same field, in `invoiceDetail` and `paymentReceipt`, each
 * fed by a sales thunk.
 */
export interface PrintBrandingState {
  readonly branding: PrintBranding | null;
}

const initialState: PrintBrandingState = { branding: null };

const printBrandingSlice = createSlice({
  name: 'printBranding',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchPrintBranding.fulfilled, (state, action) => {
        state.branding = action.payload;
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof printBrandingSlice> {}
}

const injected = printBrandingSlice.injectInto(rootReducer);

export const selectPrintBranding = (state: RootState): PrintBranding | null =>
  injected.selectSlice(state).branding;
