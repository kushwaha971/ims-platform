import { createSlice, type Draft, type PayloadAction, type WithSlice } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import { rootReducer, type RootState } from 'src/redux/store';
import type { RequestStatus } from 'src/types/api.types';

import {
  createExpense,
  createExpenseCategory,
  fetchExpenseCategories,
  voidExpense,
} from './expenseThunk';

import type { Expense, ExpenseCategory, ExpenseFormValues } from '../types/expense.types';

/**
 * The drawer, the detail sheet, the void dialog and the category list — the
 * expense state more than one screen opens (the list AND the cashbook's
 * close-the-day panel both open the drawer). Lazily injected by whichever of
 * those two routes loads first (CR-134).
 *
 * Categories live here rather than in a slice of their own because this is
 * where they are read: the picker in the drawer and the chip on a row. They
 * are fetched once per session (EXP-02 §5) and patched in place by an inline
 * create, so the picker never refetches to show a row it has just been given.
 */
export interface ExpenseFormState {
  open: boolean;
  status: RequestStatus;
  /** What was typed when a save failed, so reopening brings it back (FR-13). */
  draft: ExpenseFormValues | null;
  categories: ExpenseCategory[];
  categoriesStatus: RequestStatus;
  creatingCategory: boolean;
  /** The expense the detail sheet shows (FR-10). */
  detail: Expense | null;
  /** The expense the void dialog is confirming (FR-12). */
  voiding: Expense | null;
  voidStatus: RequestStatus;
}

const initialState: ExpenseFormState = {
  open: false,
  status: 'idle',
  draft: null,
  categories: [],
  categoriesStatus: 'idle',
  creatingCategory: false,
  detail: null,
  voiding: null,
  voidStatus: 'idle',
};

const expenseFormSlice = createSlice({
  name: 'expenseForm',
  initialState,
  reducers: {
    expenseDrawerOpened(state) {
      state.open = true;
      state.status = 'idle';
    },
    expenseDrawerClosed(state) {
      state.open = false;
      state.status = 'idle';
    },
    expenseDraftDiscarded(state) {
      state.draft = null;
    },
    expenseDetailOpened(state, action: PayloadAction<Expense>) {
      state.detail = action.payload as Draft<Expense>;
    },
    expenseDetailClosed(state) {
      state.detail = null;
    },
    expenseVoidOpened(state, action: PayloadAction<Expense>) {
      state.voiding = action.payload as Draft<Expense>;
      state.voidStatus = 'idle';
    },
    expenseVoidClosed(state) {
      state.voiding = null;
      state.voidStatus = 'idle';
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchExpenseCategories.pending, (state) => {
        state.categoriesStatus = state.categories.length ? 'refreshing' : 'loading';
      })
      .addCase(fetchExpenseCategories.fulfilled, (state, action) => {
        state.categories = action.payload as Draft<ExpenseCategory>[];
        state.categoriesStatus = 'succeeded';
      })
      .addCase(fetchExpenseCategories.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.categoriesStatus = 'failed';
      })
      .addCase(createExpenseCategory.pending, (state) => {
        state.creatingCategory = true;
      })
      .addCase(createExpenseCategory.fulfilled, (state, action) => {
        state.creatingCategory = false;
        // A duplicate name answered with the existing row: select it, add nothing.
        if (!state.categories.some((c) => c.id === action.payload.id)) {
          state.categories.unshift(action.payload as Draft<ExpenseCategory>);
        }
      })
      .addCase(createExpenseCategory.rejected, (state) => {
        state.creatingCategory = false;
      })
      .addCase(createExpense.pending, (state, action) => {
        state.status = 'loading';
        state.draft = action.meta.arg.values as Draft<ExpenseFormValues>;
      })
      .addCase(createExpense.fulfilled, (state) => {
        state.status = 'succeeded';
        state.draft = null;
      })
      .addCase(createExpense.rejected, (state) => {
        // The draft stays: Retry resends it with the same idempotency key.
        state.status = 'failed';
      })
      .addCase(voidExpense.pending, (state) => {
        state.voidStatus = 'loading';
      })
      .addCase(voidExpense.fulfilled, (state, action) => {
        state.voidStatus = 'succeeded';
        state.voiding = null;
        // The detail sheet, if open on this expense, shows it voided in place.
        if (state.detail && state.detail.id === action.payload.expense.id) {
          state.detail = action.payload.expense as Draft<Expense>;
        }
      })
      .addCase(voidExpense.rejected, (state) => {
        state.voidStatus = 'failed';
      })
      .addCase(resetAllFeatureState, () => initialState);
  },
});

export const {
  expenseDrawerOpened,
  expenseDrawerClosed,
  expenseDraftDiscarded,
  expenseDetailOpened,
  expenseDetailClosed,
  expenseVoidOpened,
  expenseVoidClosed,
} = expenseFormSlice.actions;

declare module 'src/redux/store' {
  export interface LazyLoadedSlices extends WithSlice<typeof expenseFormSlice> {}
}

const injected = expenseFormSlice.injectInto(rootReducer);
const slice$ = (state: RootState) => injected.selectSlice(state);

export const selectExpenseDrawerOpen = (state: RootState): boolean => slice$(state).open;
export const selectExpenseSaveStatus = (state: RootState): RequestStatus => slice$(state).status;
export const selectExpenseDraft = (state: RootState): ExpenseFormValues | null =>
  slice$(state).draft;
export const selectExpenseCategories = (state: RootState): readonly ExpenseCategory[] =>
  slice$(state).categories;
export const selectExpenseCategoriesStatus = (state: RootState): RequestStatus =>
  slice$(state).categoriesStatus;
export const selectCreatingCategory = (state: RootState): boolean => slice$(state).creatingCategory;
export const selectExpenseDetail = (state: RootState): Expense | null => slice$(state).detail;
export const selectExpenseVoiding = (state: RootState): Expense | null => slice$(state).voiding;
export const selectExpenseVoidStatus = (state: RootState): RequestStatus =>
  slice$(state).voidStatus;
