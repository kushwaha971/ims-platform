import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import type { Category, TaxRate, Unit } from '../types/item.types';

/* The service is imported INSIDE each thunk: the invalidation registry imports
   every thunk statically, so a top-level service import would put its mappers
   in the chunk every route loads, /legal/terms included (bundle-budgets.json,
   24 Sep 2026 T3). Nothing prefetches inventory, so the cost is one small chunk
   on the first inventory request of a session. */
const mastersService = () => import('../api/mastersService');

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
      return await (await mastersService()).listUnits(signal);
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
      return await (await mastersService()).listCategories(signal);
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
    return await (await mastersService()).listTaxRates(undefined, include, signal);
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
    return await (await mastersService()).createUnit(input);
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
    return await (await mastersService()).createCategory(input);
  } catch (error) {
    return rejectWithValue(toApiError(error));
  }
});
