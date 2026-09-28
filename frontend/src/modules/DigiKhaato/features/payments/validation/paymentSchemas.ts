import { useMemo } from 'react';

import * as Yup from 'yup';

import { useTranslation } from 'src/hooks/useTranslation';
import { useValidationSchemas } from 'src/hooks/useValidationSchemas';
import { PAYMENT_MODES, UPI_APPS } from 'src/types/domain.types';
import { formatAmount } from 'src/utils/money';

import { MAX_MODE_LINES } from '../constants/paymentConstants';
import {
  exceedsDue,
  hasDuplicateModes,
  linesTotal,
  manualTotals,
} from '../view-model/paymentDisplay';

import type { PaymentFormValues } from '../types/payment.types';

/**
 * PAY-01 §10 / PAY-02 §10 — the payment form's rules, composed from the
 * central validators so an amount here is the SAME rule as every money form's,
 * and a schema built under `hi` yields Hindi errors.
 *
 * The cross-field rules (each mode once, each bill's "Max ₹898", allocations
 * within the payment) sit at the OBJECT level with `createError({ path })`, so
 * each message lands under the control that is wrong. What is NOT checked here
 * is anything that can change while the drawer is open — a bill paid on
 * another counter, an archived party: the server decides, and the drawer
 * renders its answer.
 */
export interface PaymentSchemas {
  readonly paymentSchema: Yup.ObjectSchema<PaymentFormValues>;
  readonly voidReasonSchema: Yup.ObjectSchema<{ reason: string }>;
}

export const usePaymentSchemas = (): PaymentSchemas => {
  const v = useValidationSchemas();
  const { t } = useTranslation();

  return useMemo(() => {
    const line = Yup.object({
      mode: Yup.mixed<(typeof PAYMENT_MODES)[number] | ''>()
        .oneOf([...PAYMENT_MODES, ''])
        .defined()
        .default('')
        .test('chosen', t('payments.mode.required'), (value) => !!value),
      upiApp: Yup.mixed<(typeof UPI_APPS)[number] | ''>()
        .oneOf([...UPI_APPS, ''])
        .defined()
        .default(''),
      amount: v.amountValidation().defined().default(''),
      reference: v.boundedText(64),
    });

    const paymentSchema = Yup.object({
      direction: Yup.mixed<'in' | 'out'>().oneOf(['in', 'out']).defined().default('in'),
      partyId: Yup.string().defined().default('').required(t('payments.party.required')),
      partyName: Yup.string().defined().default(''),
      paymentDate: v.businessDateValidation().defined().default(''),
      lines: Yup.array(line).min(1).max(MAX_MODE_LINES).defined().default([]),
      autoAllocate: Yup.boolean().defined().default(true),
      allocations: Yup.array(
        Yup.object({
          documentType: Yup.string().defined().default(''),
          documentId: Yup.string().defined().default(''),
          number: Yup.string().defined().default(''),
          documentDate: Yup.string().defined().default(''),
          due: Yup.string().defined().default(''),
          amount: v.optionalAmountValidation().defined().default(''),
        })
      )
        .defined()
        .default([]),
      note: v.boundedText(255),
    }).test('money-adds-up', '', function check(values) {
      if (hasDuplicateModes(values.lines as PaymentFormValues['lines'])) {
        return this.createError({ path: 'lines', message: t('payments.mode.once') });
      }
      if (values.autoAllocate) return true;
      const rows = values.allocations as PaymentFormValues['allocations'];
      const over = rows.findIndex((row) => row.amount && exceedsDue(row));
      if (over >= 0) {
        return this.createError({
          path: `allocations.${over}.amount`,
          message: t('payments.alloc.max', { amount: formatAmount(rows[over]?.due ?? '0') }),
        });
      }
      const total = linesTotal(values.lines as PaymentFormValues['lines']);
      if (manualTotals(total, rows).advance.startsWith('-')) {
        return this.createError({ path: 'allocations', message: t('payments.alloc.exceeds') });
      }
      return true;
    }) as unknown as Yup.ObjectSchema<PaymentFormValues>;

    const voidReasonSchema = Yup.object({
      reason: v.requiredBoundedText(160, 3, 'payments.void.reason.required'),
    }) as Yup.ObjectSchema<{ reason: string }>;

    return { paymentSchema, voidReasonSchema };
  }, [v, t]);
};
