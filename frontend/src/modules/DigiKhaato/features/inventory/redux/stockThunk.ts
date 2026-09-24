import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import {
  getAdjustment,
  getLowStock,
  getStockSummary,
  postAdjustment,
  type toAdjustmentBody,
} from '../api/stockService';

import type {
  LowStockResult,
  StockAdjustment,
  StockSummaryFilters,
  StockSummaryResult,
} from '../types/item.types';

type Reject = { rejectValue: ApiErrorShape };

/** MUTATION. Post an adjustment; the key is minted once per logical post. */
export const postStockAdjustment = createAsyncThunk<
  StockAdjustment,
  { readonly body: ReturnType<typeof toAdjustmentBody>; readonly idempotencyKey: string },
  Reject
>('stockAdjustment/postStockAdjustment', async ({ body, idempotencyKey }, { rejectWithValue }) => {
  try {
    return await postAdjustment(body, idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error));
  }
});

/** QUERY. One posted adjustment, for its detail sheet. */
export const fetchStockAdjustment = createAsyncThunk<StockAdjustment, string, Reject>(
  'stockAdjustment/fetchStockAdjustment',
  async (id, { signal, rejectWithValue }) => {
    try {
      return await getAdjustment(id, signal);
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
      return await getStockSummary(filters, signal);
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
      return await getLowStock(page, signal);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'stock.low.error.title'));
    }
  }
);
