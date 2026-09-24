import { createSlice, type Draft, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { RequestStatus } from 'src/types/api.types';

import {
  createCategory,
  createUnit,
  fetchCategories,
  fetchTaxRates,
  fetchUnits,
} from './mastersThunk';

import type { Category, TaxRate, Unit } from '../types/item.types';

/**
 * INV-04 NFR — units, categories and tax rates, held once for the session and
 * patched in place when one is created (the INVALIDATION entries say `patch`,
 * and these reducers are what performs it).
 */
export interface InventoryMastersState {
  units: Unit[];
  unitsStatus: RequestStatus;
  categories: Category[];
  categoriesStatus: RequestStatus;
  taxRates: TaxRate[];
  taxRatesStatus: RequestStatus;
}

const initialState: InventoryMastersState = {
  units: [],
  unitsStatus: 'idle',
  categories: [],
  categoriesStatus: 'idle',
  taxRates: [],
  taxRatesStatus: 'idle',
};

const inventoryMastersSlice = createSlice({
  name: 'inventoryMasters',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchUnits.pending, (state) => {
        state.unitsStatus = 'loading';
      })
      .addCase(fetchUnits.fulfilled, (state, action) => {
        state.units = action.payload as Draft<Unit>[];
        state.unitsStatus = 'succeeded';
      })
      .addCase(fetchUnits.rejected, (state) => {
        state.unitsStatus = 'failed';
      })
      .addCase(fetchCategories.pending, (state) => {
        state.categoriesStatus = 'loading';
      })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.categories = action.payload as Draft<Category>[];
        state.categoriesStatus = 'succeeded';
      })
      .addCase(fetchCategories.rejected, (state) => {
        state.categoriesStatus = 'failed';
      })
      .addCase(fetchTaxRates.pending, (state) => {
        state.taxRatesStatus = 'loading';
      })
      .addCase(fetchTaxRates.fulfilled, (state, action) => {
        state.taxRates = action.payload as Draft<TaxRate>[];
        state.taxRatesStatus = 'succeeded';
      })
      .addCase(fetchTaxRates.rejected, (state) => {
        state.taxRatesStatus = 'failed';
      })
      .addCase(createUnit.fulfilled, (state, action) => {
        if (!state.units.some((unit) => unit.id === action.payload.id)) {
          state.units.push(action.payload as Draft<Unit>);
        }
      })
      .addCase(createCategory.fulfilled, (state, action) => {
        const { category } = action.payload;
        const exists = (list: Draft<Category>[]): boolean =>
          list.some((row) => row.id === category.id || exists(row.children as Draft<Category>[]));
        if (exists(state.categories)) return;
        if (category.parentId) {
          const parent = state.categories.find((row) => row.id === category.parentId);
          if (parent) (parent.children as Draft<Category>[]).push(category as Draft<Category>);
        } else {
          state.categories.push(category as Draft<Category>);
        }
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof inventoryMastersSlice> {}
}

const injected = inventoryMastersSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

export const selectUnits = (state: RootState): readonly Unit[] => slice$(state).units;
export const selectCategories = (state: RootState): readonly Category[] => slice$(state).categories;
export const selectTaxRates = (state: RootState): readonly TaxRate[] => slice$(state).taxRates;
export const selectMastersStatus = (state: RootState): RequestStatus => slice$(state).unitsStatus;
export const selectCategoriesStatus = (state: RootState): RequestStatus =>
  slice$(state).categoriesStatus;
