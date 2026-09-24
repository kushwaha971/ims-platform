'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDegradedNetwork } from 'src/hooks/useDegradedNetwork';
import { useIdempotencyKey } from 'src/hooks/useIdempotencyKey';
import { usePermissions } from 'src/hooks/usePermissions';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape } from 'src/types/api.types';
import { applyServerErrors } from 'src/utils/applyServerErrors';
import { formatAmount } from 'src/utils/money';

import { EXPENSE_FORM_FIELDS, SERVER_FIELD_TO_FORM } from '../constants/expenseFormFields';
import {
  expenseDetailClosed,
  expenseDetailOpened,
  expenseDraftDiscarded,
  expenseDrawerClosed,
  expenseDrawerOpened,
  expenseVoidClosed,
  expenseVoidOpened,
  selectCreatingCategory,
  selectExpenseCategories,
  selectExpenseCategoriesStatus,
  selectExpenseDetail,
  selectExpenseDraft,
  selectExpenseDrawerOpen,
  selectExpenseSaveStatus,
  selectExpenseVoidStatus,
  selectExpenseVoiding,
} from '../redux/expenseFormSlice';
import {
  createExpense,
  createExpenseCategory,
  fetchExpenseCategories,
  voidExpense,
} from '../redux/expenseThunk';

import type { Expense, ExpenseCategory, ExpenseFormValues } from '../types/expense.types';
import type { UseFormSetError } from 'react-hook-form';

/**
 * Part 19 §19.4 — the drawer, the detail sheet and the void dialog, so the
 * components only render. Mounted by every screen that can open the drawer
 * (the list and the cashbook), which all read the same lazily injected slice.
 */
export interface UseExpenseFormResult {
  readonly open: boolean;
  readonly isSaving: boolean;
  readonly canWrite: boolean;
  readonly canVoid: boolean;
  readonly draft: ExpenseFormValues | null;
  readonly formErrors: readonly string[];
  readonly categories: readonly ExpenseCategory[];
  readonly categoriesStatus: string;
  readonly creatingCategory: boolean;
  readonly detail: Expense | null;
  readonly voiding: Expense | null;
  readonly isVoiding: boolean;
  readonly voidErrors: readonly string[];
  readonly openDrawer: () => void;
  readonly close: () => void;
  readonly discardDraft: () => void;
  readonly submit: (
    values: ExpenseFormValues,
    setError: UseFormSetError<ExpenseFormValues>,
    options?: { readonly keepOpen?: boolean }
  ) => Promise<boolean>;
  readonly addCategory: (name: string) => Promise<ExpenseCategory | null>;
  readonly openDetail: (expense: Expense) => void;
  readonly closeDetail: () => void;
  readonly openVoid: (expense: Expense) => void;
  readonly closeVoid: () => void;
  readonly submitVoid: (reason: string) => Promise<void>;
}

export const useExpenseForm = (): UseExpenseFormResult => {
  const dispatch = useAppDispatch();
  const { can, hasModule } = usePermissions();
  const { canWrite: canWriteIn } = useDegradedNetwork();
  const open = useAppSelector(selectExpenseDrawerOpen);
  const status = useAppSelector(selectExpenseSaveStatus);
  const draft = useAppSelector(selectExpenseDraft);
  const categories = useAppSelector(selectExpenseCategories);
  const categoriesStatus = useAppSelector(selectExpenseCategoriesStatus);
  const creatingCategory = useAppSelector(selectCreatingCategory);
  const detail = useAppSelector(selectExpenseDetail);
  const voiding = useAppSelector(selectExpenseVoiding);
  const voidStatus = useAppSelector(selectExpenseVoidStatus);

  const { key, rotate } = useIdempotencyKey();
  const voidKey = useIdempotencyKey();
  const [formErrors, setFormErrors] = useState<readonly string[]>([]);
  const [voidErrors, setVoidErrors] = useState<readonly string[]>([]);

  const enabled = hasModule('expenses');
  /* Class A, queueable (§19.10.4) — the idempotency key makes a replay
     harmless, exactly as it does for a ledger entry. */
  const canWrite = enabled && can('expenses.expense.write') && canWriteIn('queueable');
  const canVoid = enabled && can('expenses.expense.void') && canWriteIn('queueable');

  /* The category list is fetched once per session (EXP-02 §5), the first time
     a screen that can show a category mounts — so the picker opens with no
     request of its own. */
  useEffect(() => {
    if (!enabled || !can('expenses.expense.read') || categoriesStatus !== 'idle') return;
    void dispatch(fetchExpenseCategories());
  }, [dispatch, enabled, can, categoriesStatus]);

  const openDrawer = useCallback(() => {
    setFormErrors([]);
    dispatch(expenseDrawerOpened());
  }, [dispatch]);
  const close = useCallback(() => {
    setFormErrors([]);
    dispatch(expenseDrawerClosed());
  }, [dispatch]);
  const discardDraft = useCallback(() => dispatch(expenseDraftDiscarded()), [dispatch]);

  const submit = useCallback(
    async (
      values: ExpenseFormValues,
      setError: UseFormSetError<ExpenseFormValues>,
      options: { readonly keepOpen?: boolean } = {}
    ): Promise<boolean> => {
      setFormErrors([]);
      try {
        const saved = await dispatch(createExpense({ values, idempotencyKey: key })).unwrap();
        // The key now names the expense just written; the next save is a new one.
        rotate();
        /* FR-8 — "Saved ₹500 — Food". `formatAmount`, not `formatInr`: the
           copy carries the ₹ (Hindi puts it elsewhere), and a formatter that
           carried its own would print "₹₹500.00" — the fifth time that pair
           has met in this codebase is not going to be this one. */
        dispatch(
          showSnackbar({
            severity: 'success',
            id: 'expenses.saved',
            params: {
              amount: formatAmount(saved.expense.amount),
              category: saved.expense.category.name,
            },
          })
        );
        if (!options.keepOpen) dispatch(expenseDrawerClosed());
        return true;
      } catch (thrown) {
        const apiError = thrown as ApiErrorShape;
        if (apiError.code === 'validation_error') {
          // A corrected field is a new logical write; the old key has an answer.
          rotate();
          const translated: ApiErrorShape = {
            ...apiError,
            details: Object.fromEntries(
              Object.entries(apiError.details ?? {}).map(([path, messages]) => [
                SERVER_FIELD_TO_FORM[path] ?? path,
                messages,
              ])
            ),
          };
          setFormErrors(applyServerErrors(translated, setError, [...EXPENSE_FORM_FIELDS]));
          return false;
        }
        if (apiError.code === 'party_archived' || apiError.code === 'not_found') {
          // Answerable in place: the sentence belongs above the form that will not submit.
          setFormErrors([apiError.message]);
          return false;
        }
        /* Everything else — a dropped connection included — has already been
           toasted by the interceptor (R-E-2). The drawer stays open with the
           draft, and Save resends it with the SAME key. */
        return false;
      }
    },
    [dispatch, key, rotate]
  );

  const addCategory = useCallback(
    async (name: string): Promise<ExpenseCategory | null> => {
      try {
        return await dispatch(createExpenseCategory(name)).unwrap();
      } catch {
        return null; // Toasted by the interceptor; the typed name stays in the box.
      }
    },
    [dispatch]
  );

  const openDetail = useCallback(
    (expense: Expense) => dispatch(expenseDetailOpened(expense)),
    [dispatch]
  );
  const closeDetail = useCallback(() => dispatch(expenseDetailClosed()), [dispatch]);
  const openVoid = useCallback(
    (expense: Expense) => {
      setVoidErrors([]);
      dispatch(expenseVoidOpened(expense));
    },
    [dispatch]
  );
  const closeVoid = useCallback(() => dispatch(expenseVoidClosed()), [dispatch]);
  const { key: voidIdempotencyKey, rotate: rotateVoidKey } = voidKey;
  const submitVoid = useCallback(
    async (reason: string) => {
      if (!voiding) return;
      setVoidErrors([]);
      try {
        await dispatch(
          voidExpense({ id: voiding.id, reason, idempotencyKey: voidIdempotencyKey })
        ).unwrap();
        rotateVoidKey();
        dispatch(
          showSnackbar({
            severity: 'success',
            id: 'expenses.void.done',
            params: { number: voiding.number },
          })
        );
      } catch (thrown) {
        const apiError = thrown as ApiErrorShape;
        if (apiError.code === 'validation_error' || apiError.code === 'party_archived') {
          rotateVoidKey();
          setVoidErrors([apiError.message]);
        }
      }
    },
    [dispatch, voiding, voidIdempotencyKey, rotateVoidKey]
  );

  return useMemo(
    () => ({
      open,
      isSaving: status === 'loading',
      canWrite,
      canVoid,
      draft,
      formErrors,
      categories,
      categoriesStatus,
      creatingCategory,
      detail,
      voiding,
      isVoiding: voidStatus === 'loading',
      voidErrors,
      openDrawer,
      close,
      discardDraft,
      submit,
      addCategory,
      openDetail,
      closeDetail,
      openVoid,
      closeVoid,
      submitVoid,
    }),
    [
      open,
      status,
      canWrite,
      canVoid,
      draft,
      formErrors,
      categories,
      categoriesStatus,
      creatingCategory,
      detail,
      voiding,
      voidStatus,
      voidErrors,
      openDrawer,
      close,
      discardDraft,
      submit,
      addCategory,
      openDetail,
      closeDetail,
      openVoid,
      closeVoid,
      submitVoid,
    ]
  );
};
