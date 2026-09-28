import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import type {
  Item,
  ItemFormValues,
  ItemListFilters,
  ItemListResult,
  ItemSaveResult,
  MovementFilters,
  MovementPage,
} from '../types/item.types';

/** Part 19 §19.3.3 — one service call each, and a catch that normalises. */

/* The service is imported INSIDE each thunk: the invalidation registry imports
   every thunk statically, so a top-level service import would put its mappers
   in the chunk every route loads, /legal/terms included (bundle-budgets.json,
   24 Sep 2026 T3). Nothing prefetches inventory, so the cost is one small chunk
   on the first inventory request of a session. */
const itemService = () => import('../api/itemService');

type Reject = { rejectValue: ApiErrorShape };

/** QUERY. One page of the item list for the filters in the address bar. */
export const fetchItemList = createAsyncThunk<ItemListResult, ItemListFilters, Reject>(
  'itemList/fetchItemList',
  async (filters, { signal, rejectWithValue }) => {
    try {
      return await (await itemService()).listItems(filters, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'items.list.error.title'));
    }
  }
);

/** QUERY. One item with its stock rows and ten most recent movements. */
export const fetchItemDetail = createAsyncThunk<Item, string, Reject>(
  'itemDetail/fetchItemDetail',
  async (id, { signal, rejectWithValue }) => {
    try {
      return await (await itemService()).getItem(id, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'items.detail.error.title'));
    }
  }
);

/** QUERY. A page of movement history; `cursor` null is the first page. */
export const fetchItemMovements = createAsyncThunk<
  MovementPage & { readonly append: boolean },
  { readonly id: string; readonly filters: MovementFilters; readonly cursor: string | null },
  Reject
>('itemDetail/fetchItemMovements', async ({ id, filters, cursor }, { signal, rejectWithValue }) => {
  try {
    const page = await (await itemService()).listMovements(id, filters, cursor, signal);
    return { ...page, append: cursor !== null };
  } catch (error) {
    return rejectWithValue(toApiError(error, 'items.movements.error'));
  }
});

/**
 * MUTATION. Create or edit. `withOpening` is set on an edit only when the
 * merchant is turning tracking on (INV-05 FR-2b), which is the one PATCH that
 * may carry an opening stock.
 */
export const saveItem = createAsyncThunk<
  ItemSaveResult,
  {
    readonly values: ItemFormValues;
    readonly item: Item | null;
    readonly idempotencyKey: string;
    readonly withOpening: boolean;
  },
  Reject
>(
  'itemForm/saveItem',
  async ({ values, item, idempotencyKey, withOpening }, { rejectWithValue }) => {
    try {
      return item
        ? await (
            await itemService()
          ).updateItem(item.id, values, item.version, {
            withOpening,
            omitPurchasePrice: item.purchasePrice === null,
          })
        : await (await itemService()).createItem(values, idempotencyKey);
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  }
);

/** MUTATION. Archive — a status change, refused while stock is not zero. */
export const archiveItem = createAsyncThunk<Item, string, Reject>(
  'itemForm/archiveItem',
  async (id, { rejectWithValue }) => {
    try {
      return await (await itemService()).archiveItem(id);
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  }
);

/** MUTATION. Restore an archived item to billing. */
export const restoreItem = createAsyncThunk<Item, string, Reject>(
  'itemForm/restoreItem',
  async (id, { rejectWithValue }) => {
    try {
      return await (await itemService()).restoreItem(id);
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  }
);
