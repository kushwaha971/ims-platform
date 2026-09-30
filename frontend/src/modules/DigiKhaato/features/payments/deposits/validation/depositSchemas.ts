import { useMemo } from 'react';

import * as Yup from 'yup';

import { useTranslation } from 'src/hooks/useTranslation';
import { useValidationSchemas } from 'src/hooks/useValidationSchemas';
import { PAYMENT_MODES, UPI_APPS } from 'src/types/domain.types';
import { compareMoney, formatAmount } from 'src/utils/money';
import { REGEX } from 'src/utils/regexConstants';

import { overDue, overHeld } from '../view-model/depositDisplay';

import type { ApplyDepositFormValues, DepositMoneyFormValues } from '../types/deposit.types';

/**
 * A4b — the deposit forms' rules, composed from the central validators so an
 * amount here is the same rule as every money form's.
 *
 * The caps (what may still be received, what is held) are the figures the
 * screen already shows; the server re-checks both under its locks, and a
 * deposit that moved on another counter comes back as its words above Save.
 */
export interface DepositSchemas {
  /** Take (cap: expected − received) or return (cap: held; a reason is required). */
  readonly moneySchemaFor: (
    kind: 'receive' | 'refund',
    cap: string
  ) => Yup.ObjectSchema<DepositMoneyFormValues>;
  /** Adjust: each row ≤ its charge's due, Σ ≤ held, at least one row, a reason. */
  readonly applySchemaFor: (held: string) => Yup.ObjectSchema<ApplyDepositFormValues>;
}

export const useDepositSchemas = (): DepositSchemas => {
  const v = useValidationSchemas();
  const { t } = useTranslation();

  return useMemo(() => {
    const moneySchemaFor = (kind: 'receive' | 'refund', cap: string) =>
      Yup.object({
        amount: v
          .amountValidation()
          .defined()
          .default('')
          .test(
            'within-cap',
            t(kind === 'receive' ? 'payments.deposit.receive.max' : 'payments.deposit.refund.max', {
              amount: formatAmount(cap),
            }),
            (value) => !value || !REGEX.DECIMAL_2DP.test(value) || compareMoney(value, cap) <= 0
          ),
        mode: Yup.mixed<(typeof PAYMENT_MODES)[number] | ''>()
          .oneOf([...PAYMENT_MODES, ''])
          .defined()
          .default('')
          .test('chosen', t('payments.mode.required'), (value) => !!value),
        upiApp: Yup.mixed<(typeof UPI_APPS)[number] | ''>()
          .oneOf([...UPI_APPS, ''])
          .defined()
          .default(''),
        reference: v.boundedText(64),
        reason:
          kind === 'refund'
            ? v.requiredBoundedText(160, 3, 'payments.deposit.reason.required')
            : v.boundedText(160),
      }) as unknown as Yup.ObjectSchema<DepositMoneyFormValues>;

    const applySchemaFor = (held: string): Yup.ObjectSchema<ApplyDepositFormValues> =>
      Yup.object({
        rows: Yup.array(
          Yup.object({
            documentType: Yup.string().defined().default(''),
            documentId: Yup.string().defined().default(''),
            number: Yup.string().defined().default(''),
            due: Yup.string().defined().default(''),
            amount: v.optionalAmountValidation().defined().default(''),
          })
        )
          .defined()
          .default([]),
        reason: v.requiredBoundedText(160, 3, 'payments.deposit.reason.required'),
      }).test('within-the-deposit', '', function check(values) {
        const rows = values.rows as ApplyDepositFormValues['rows'];
        const over = rows.findIndex(overDue);
        if (over >= 0) {
          return this.createError({
            path: `rows.${over}.amount`,
            message: t('payments.alloc.max', { amount: formatAmount(rows[over]?.due ?? '0') }),
          });
        }
        if (overHeld(held, rows)) {
          return this.createError({
            path: 'rows',
            message: t('payments.deposit.apply.exceeds', { amount: formatAmount(held) }),
          });
        }
        if (!rows.some((row) => row.amount && !/^0*(\.0*)?$/.test(row.amount))) {
          return this.createError({ path: 'rows', message: t('payments.apply.none') });
        }
        return true;
      }) as unknown as Yup.ObjectSchema<ApplyDepositFormValues>;

    return { moneySchemaFor, applySchemaFor };
  }, [v, t]);
};
