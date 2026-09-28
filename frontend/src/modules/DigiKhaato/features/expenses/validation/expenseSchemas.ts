import { useMemo } from 'react';

import * as Yup from 'yup';

import { useTranslation } from 'src/hooks/useTranslation';
import { useValidationSchemas } from 'src/hooks/useValidationSchemas';
import { PAYMENT_MODES, UPI_APPS } from 'src/types/domain.types';

import type { ExpenseFormValues } from '../types/expense.types';

/**
 * EXP-01 §10 — the expense form's rules, composed from the central validators
 * so the amount and the date are the SAME rules every money form uses, and a
 * schema built under `hi` yields Hindi errors.
 *
 * The cross-field rules sit at the OBJECT level with `createError({ path })`,
 * so each message lands under the control the merchant can see: "Choose how
 * you paid" only when Paid now is on, "Choose who you owe this to" and the
 * due date only when it is off. A `.when()` on the field would put the same
 * refusal on a control that is hidden.
 *
 * What is NOT checked here: whether the party is archived or the category
 * still exists. Both can change between opening the drawer and Save, so the
 * server decides and the drawer renders what it says.
 */
export interface ExpenseSchemas {
  readonly expenseSchema: Yup.ObjectSchema<ExpenseFormValues>;
  readonly voidReasonSchema: Yup.ObjectSchema<{ reason: string }>;
}

export const useExpenseSchemas = (): ExpenseSchemas => {
  const v = useValidationSchemas();
  const { t } = useTranslation();

  return useMemo(() => {
    const expenseSchema = Yup.object({
      amount: v.amountValidation().defined().default(''),
      categoryId: Yup.string().defined().default('').required(t('expenses.category.required')),
      expenseDate: v.businessDateValidation().defined().default(''),
      paid: Yup.boolean().defined().default(true),
      mode: Yup.mixed<(typeof PAYMENT_MODES)[number] | ''>()
        .oneOf([...PAYMENT_MODES, ''])
        .defined()
        .default(''),
      upiApp: Yup.mixed<(typeof UPI_APPS)[number] | ''>()
        .oneOf([...UPI_APPS, ''])
        .defined()
        .default(''),
      reference: v.boundedText(64),
      partyId: Yup.string().defined().default(''),
      partyName: Yup.string().defined().default(''),
      dueOn: Yup.string().defined().default(''),
      note: v.boundedText(255),
    }).test('paid-or-owed', '', function check(values) {
      if (values.paid) {
        if (values.mode) return true;
        return this.createError({ path: 'mode', message: t('expenses.mode.required') });
      }
      if (!values.partyId) {
        return this.createError({ path: 'partyId', message: t('expenses.paidTo.required') });
      }
      if (!values.dueOn) {
        return this.createError({ path: 'dueOn', message: t('expenses.dueOn.required') });
      }
      if (values.expenseDate && values.dueOn < values.expenseDate) {
        return this.createError({ path: 'dueOn', message: t('expenses.dueOn.beforeDate') });
      }
      return true;
    }) as Yup.ObjectSchema<ExpenseFormValues>;

    const voidReasonSchema = Yup.object({
      reason: v.requiredBoundedText(160, 3, 'expenses.void.reason.required'),
    }) as Yup.ObjectSchema<{ reason: string }>;

    return { expenseSchema, voidReasonSchema };
  }, [v, t]);
};
