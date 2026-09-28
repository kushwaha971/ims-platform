import { createSlice, type Draft, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { RequestStatus } from 'src/types/api.types';

import { saveItem } from './itemThunk';

import type { Item, ItemWarning } from '../types/item.types';

/**
 * Which item the form drawer is open for — shared by `/items` and
 * `/items/[id]`, both of which mount the drawer. The form VALUES live in React
 * Hook Form; only what outlives the drawer is here.
 */
export interface ItemFormState {
  openFor: 'new' | string | null;
  editing: Item | null;
  /** INV-02 FR-6 — "Create item" from an unknown scan pre-fills the barcode. */
  prefillBarcode: string;
  prefillName: string;
  status: RequestStatus;
  lastSaved: Item | null;
  warnings: ItemWarning[];
}

const initialState: ItemFormState = {
  openFor: null,
  editing: null,
  prefillBarcode: '',
  prefillName: '',
  status: 'idle',
  lastSaved: null,
  warnings: [],
};

const itemFormSlice = createSlice({
  name: 'itemForm',
  initialState,
  reducers: {
    itemCreateOpened(
      state,
      action: PayloadAction<{ readonly barcode?: string; readonly name?: string } | undefined>
    ) {
      state.openFor = 'new';
      state.editing = null;
      state.prefillBarcode = action.payload?.barcode ?? '';
      state.prefillName = action.payload?.name ?? '';
      state.status = 'idle';
    },
    itemEditOpened(state, action: PayloadAction<Item>) {
      state.openFor = action.payload.id;
      state.editing = action.payload as Draft<Item>;
      state.prefillBarcode = '';
      state.prefillName = '';
      state.status = 'idle';
    },
    itemFormClosed(state) {
      state.openFor = null;
      state.editing = null;
      state.status = 'idle';
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(saveItem.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(saveItem.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.lastSaved = action.payload.item as Draft<Item>;
        state.warnings = action.payload.warnings as Draft<ItemWarning>[];
        state.openFor = null;
        state.editing = null;
      })
      .addCase(saveItem.rejected, (state) => {
        state.status = 'failed';
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const { itemCreateOpened, itemEditOpened, itemFormClosed } = itemFormSlice.actions;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof itemFormSlice> {}
}

const injected = itemFormSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

export const selectItemFormOpenFor = (state: RootState): string | null => slice$(state).openFor;
export const selectItemFormEditing = (state: RootState): Item | null => slice$(state).editing;
export const selectItemFormStatus = (state: RootState): RequestStatus => slice$(state).status;
export const selectItemFormPrefillBarcode = (state: RootState): string =>
  slice$(state).prefillBarcode;
export const selectItemFormPrefillName = (state: RootState): string => slice$(state).prefillName;
export const selectItemFormLastSaved = (state: RootState): Item | null => slice$(state).lastSaved;
