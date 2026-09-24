import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import {
  createExpense as createExpenseRequest,
  createExpenseCategory as createCategoryRequest,
  listExpenseCategories,
  listExpenses,
  voidExpense as voidExpenseRequest,
} from '../api/expenseService';

import type {
  ExpenseCategory,
  ExpenseFilters,
  ExpenseFormValues,
  ExpensePage,
  ExpenseSaveResult,
} from '../types/expense.types';

/** Part 19 §19.3.3 — one service call each, and a catch that normalises. */

/** QUERY. One page of the expense list with its filtered totals. */
export const fetchExpenses = createAsyncThunk<
  ExpensePage,
  ExpenseFilters,
  { rejectValue: ApiErrorShape }
>('expenseList/fetchExpenses', async (filters, { signal, rejectWithValue }) => {
  try {
    return await listExpenses(filters, signal);
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
    return await listExpenseCategories(signal);
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
    return await createCategoryRequest(name);
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
    return await createExpenseRequest(values, idempotencyKey);
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
    return await voidExpenseRequest(id, reason, idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'expenses.void.error'));
  }
});
