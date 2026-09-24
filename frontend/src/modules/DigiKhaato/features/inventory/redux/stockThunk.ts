import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import type { AdjustmentBody } from '../api/stockService';
import type {
  LowStockResult,
  StockAdjustment,
  StockSummaryFilters,
  StockSummaryResult,
} from '../types/item.types';

/* The service is imported INSIDE each thunk: the invalidation registry imports
   every thunk statically, so a top-level service import would put its mappers
   in the chunk every route loads, /legal/terms included (bundle-budgets.json,
   24 Sep 2026 T3). Nothing prefetches inventory, so the cost is one small chunk
   on the first inventory request of a session. */
const stockService = () => import('../api/stockService');

type Reject = { rejectValue: ApiErrorShape };

/** MUTATION. Post an adjustment; the key is minted once per logical post. */
export const postStockAdjustment = createAsyncThunk<
  StockAdjustment,
  { readonly body: AdjustmentBody; readonly idempotencyKey: string },
  Reject
>('stockAdjustment/postStockAdjustment', async ({ body, idempotencyKey }, { rejectWithValue }) => {
  try {
    return await (await stockService()).postAdjustment(body, idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error));
  }
});

/** QUERY. One posted adjustment, for its detail sheet. */
export const fetchStockAdjustment = createAsyncThunk<StockAdjustment, string, Reject>(
  'stockAdjustment/fetchStockAdjustment',
  async (id, { signal, rejectWithValue }) => {
    try {
      return await (await stockService()).getAdjustment(id, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error));
    }
  }
);

/** QUERY. INV-08 — a page of the stock summary. */
export const fetchStockSummary = createAsyncThunk<StockSummaryResult, StockSummaryFilters, Reject>(
  'stockSummary/fetchStockSummary',
  async (filters, { signal, rejectWithValue }) => {
    try {
      return await (await stockService()).getStockSummary(filters, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'stock.summary.error.title'));
    }
  }
);

/** QUERY. INV-07 — the low and out items, out first. */
export const fetchLowStock = createAsyncThunk<LowStockResult, number, Reject>(
  'stockSummary/fetchLowStock',
  async (page, { signal, rejectWithValue }) => {
    try {
      return await (await stockService()).getLowStock(page, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'stock.low.error.title'));
    }
  }
);
