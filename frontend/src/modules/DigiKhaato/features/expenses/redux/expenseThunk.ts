import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import type {
  ExpenseCategory,
  ExpenseFilters,
  ExpenseFormValues,
  ExpensePage,
  ExpenseSaveResult,
} from '../types/expense.types';

/**
 * Part 19 §19.3.3 — one service call each, and a catch that normalises.
 *
 * ── Why the service is imported INSIDE each thunk ─────────────────────────
 * The invalidation registry imports every thunk statically, and the registry
 * is in the shell — so a service imported at the top of this file ships to
 * every route, `/legal/terms` included (measured: the two expense services
 * were most of a 2.7 KB shell increase). The members slice measured and
 * rejected this for a reason that does not apply here: its list has a warm-up
 * prefetch that must not wait for a chunk. Nothing prefetches expenses, so the
 * price here is one small chunk fetched with the first expense request of a
 * session — paid by the merchant who opened Expenses, not by every route.
 */
const service = () => import('../api/expenseService');

/** QUERY. One page of the expense list with its filtered totals. */
export const fetchExpenses = createAsyncThunk<
  ExpensePage,
  ExpenseFilters,
  { rejectValue: ApiErrorShape }
>('expenseList/fetchExpenses', async (filters, { signal, rejectWithValue }) => {
  try {
    return await (await service()).listExpenses(filters, signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'expenses.list.error.title'));
  }
});

/** QUERY. Every category, once per session (EXP-02 §5). */
export const fetchExpenseCategories = createAsyncThunk<
  readonly ExpenseCategory[],
  void,
  { rejectValue: ApiErrorShape }
>('expenseForm/fetchExpenseCategories', async (_arg, { signal, rejectWithValue }) => {
  try {
    return await (await service()).listExpenseCategories(signal);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'expenses.category.error'));
  }
});

/** MUTATION. Inline create from the drawer; a duplicate answers the existing row. */
export const createExpenseCategory = createAsyncThunk<
  ExpenseCategory,
  string,
  { rejectValue: ApiErrorShape }
>('expenseForm/createExpenseCategory', async (name, { rejectWithValue }) => {
  try {
    return await (await service()).createExpenseCategory(name);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'expenses.category.error'));
  }
});

/** MUTATION. Record one expense, with the key the hook minted for this save. */
export const createExpense = createAsyncThunk<
  ExpenseSaveResult,
  { readonly values: ExpenseFormValues; readonly idempotencyKey: string },
  { rejectValue: ApiErrorShape }
>('expenseForm/createExpense', async ({ values, idempotencyKey }, { rejectWithValue }) => {
  try {
    return await (await service()).createExpense(values, idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'expenses.save.error'));
  }
});

/** MUTATION. Void with a reason; reverses the ledger credit of an unpaid one. */
export const voidExpense = createAsyncThunk<
  ExpenseSaveResult,
  { readonly id: string; readonly reason: string; readonly idempotencyKey: string },
  { rejectValue: ApiErrorShape }
>('expenseForm/voidExpense', async ({ id, reason, idempotencyKey }, { rejectWithValue }) => {
  try {
    return await (await service()).voidExpense(id, reason, idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'expenses.void.error'));
  }
});
