import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import {
  createCategory as createCategoryRequest,
  createUnit as createUnitRequest,
  listCategories,
  listTaxRates,
  listUnits,
} from '../api/mastersService';

import type { Category, TaxRate, Unit } from '../types/item.types';

type Reject = { rejectValue: ApiErrorShape };

/**
 * QUERY. Units, categories and tax rates are fetched once per session into
 * `inventoryMasters` (INV-04 NFR) — each thunk's `condition` skips a second
 * request while the first is in flight or has landed.
 */
export const fetchUnits = createAsyncThunk<readonly Unit[], void, Reject>(
  'inventoryMasters/fetchUnits',
  async (_arg, { signal, rejectWithValue }) => {
    try {
      return await listUnits(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  },
  {
    condition: (_arg, { getState }) => {
      const state = (getState() as { inventoryMasters?: { unitsStatus: string } }).inventoryMasters;
      return !state || (state.unitsStatus !== 'loading' && state.unitsStatus !== 'succeeded');
    },
  }
);

export const fetchCategories = createAsyncThunk<
  readonly Category[],
  { readonly force?: boolean } | void,
  Reject
>(
  'inventoryMasters/fetchCategories',
  async (_arg, { signal, rejectWithValue }) => {
    try {
      return await listCategories(signal);
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  },
  {
    condition: (arg, { getState }) => {
      if (arg && arg.force) return true;
      const state = (getState() as { inventoryMasters?: { categoriesStatus: string } })
        .inventoryMasters;
      return (
        !state || (state.categoriesStatus !== 'loading' && state.categoriesStatus !== 'succeeded')
      );
    },
  }
);

/** QUERY. Rates in force today, plus a legacy code already on the item being edited. */
export const fetchTaxRates = createAsyncThunk<
  readonly TaxRate[],
  { readonly include: readonly string[] },
  Reject
>('inventoryMasters/fetchTaxRates', async ({ include }, { signal, rejectWithValue }) => {
  try {
    return await listTaxRates(undefined, include, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error));
  }
});

/** MUTATION. A tenant unit, from the masters page or inline from the item form. */
export const createUnit = createAsyncThunk<
  Unit,
  { readonly code: string; readonly name: string; readonly allowDecimal: boolean },
  Reject
>('inventoryMasters/createUnit', async (input, { rejectWithValue }) => {
  try {
    return await createUnitRequest(input);
  } catch (error) {
    return rejectWithValue(toApiError(error));
  }
});

/** MUTATION. A category (one level) — an existing sibling of the same name comes back instead. */
export const createCategory = createAsyncThunk<
  { readonly category: Category; readonly created: boolean },
  { readonly name: string; readonly parentId?: string | null },
  Reject
>('inventoryMasters/createCategory', async (input, { rejectWithValue }) => {
  try {
    return await createCategoryRequest(input);
  } catch (error) {
    return rejectWithValue(toApiError(error));
  }
});
