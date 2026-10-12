import { useMemo } from 'react';

import * as Yup from 'yup';

import { useTranslation } from 'src/hooks/useTranslation';
import { useValidationSchemas } from 'src/hooks/useValidationSchemas';

import type { BorrowerEditValues, CollectFormValues, LoanFormValues } from '../types/lending.types';

/**
 * Lending's forms from the central validators. The server re-checks every rule
 * (FRD LEN-03 §9); these exist so the lender hears first.
 */
export const useLendingSchemas = (): {
  readonly collectSchema: Yup.ObjectSchema<CollectFormValues>;
  readonly loanSchema: Yup.ObjectSchema<LoanFormValues>;
  readonly borrowerEditSchema: Yup.ObjectSchema<BorrowerEditValues>;
} => {
  const v = useValidationSchemas();
  const { t } = useTranslation();

  return useMemo(() => {
    const collectSchema = Yup.object({
      amount: v.amountValidation(),
      mode: Yup.mixed<CollectFormValues['mode']>()
        .oneOf(['cash', 'upi', 'bank', 'cheque'])
        .defined(),
      reference: v.boundedText(64),
      note: v.boundedText(255),
    }) as Yup.ObjectSchema<CollectFormValues>;

    const whole = (min: number, max: number) =>
      Yup.string()
        .defined()
        .test('whole', t('lending.form.count.range', { min, max }), (value) => {
          const n = Number(value);
          return Number.isInteger(n) && n >= min && n <= max;
        });

    const loanSchema = Yup.object({
      borrowerMode: Yup.mixed<'new' | 'existing'>().oneOf(['new', 'existing']).defined(),
      borrowerId: Yup.string()
        .defined()
        .when('borrowerMode', {
          is: 'existing',
          then: () => v.requiredText(40, 'lending.form.borrower.required'),
        }),
      borrowerName: Yup.string().defined(),
      name: Yup.string()
        .defined()
        .when('borrowerMode', { is: 'new', then: () => v.nameValidation() }),
      mobile: v.mobileValidation(false).defined().default(''),
      area: v.boundedText(60),
      routeId: Yup.string().defined(),
      planType: Yup.mixed<LoanFormValues['planType']>()
        .oneOf(['fixed_daily', 'flat', 'reducing', 'interest_only', 'flexible'])
        .defined(),
      principal: v.amountValidation(),
      fileCharge: v.optionalAmountValidation(),
      rate: Yup.string()
        .defined()
        .when('planType', {
          is: (plan: string) => plan !== 'fixed_daily',
          then: (schema) =>
            schema.test('rate', t('lending.form.rate.range'), (value) => {
              const n = Number(value || 0);
              return Number.isFinite(n) && n >= 0 && n <= 100;
            }),
        }),
      rateUnit: Yup.mixed<'per_month' | 'per_year'>().oneOf(['per_month', 'per_year']).defined(),
      frequency: Yup.mixed<LoanFormValues['frequency']>()
        .oneOf(['daily', 'weekly', 'fortnightly', 'monthly'])
        .defined(),
      instalmentCount: Yup.string()
        .defined()
        .when('planType', {
          is: (plan: string) => plan !== 'flexible',
          then: () => whole(1, 1000),
        }),
      perInstalmentAmount: Yup.string()
        .defined()
        .when('planType', { is: 'fixed_daily', then: () => v.amountValidation() }),
      disbursedOn: v.requiredText(10, 'lending.form.disbursedOn.required'),
      firstDueOn: v.requiredText(10, 'lending.form.firstDue.required'),
      collectionWeekdays: Yup.number().defined().min(1, t('lending.form.weekdays.required')),
      paymentMode: Yup.mixed<LoanFormValues['paymentMode']>()
        .oneOf(['cash', 'upi', 'bank', 'cheque'])
        .defined(),
      notes: v.boundedText(500),
      lateFeeKind: Yup.mixed<LoanFormValues['lateFeeKind']>()
        .oneOf(['none', 'flat_once', 'per_day', 'simple_interest'])
        .defined(),
      lateFeeValue: Yup.string()
        .defined()
        .when('lateFeeKind', { is: (k: string) => k !== 'none', then: () => v.amountValidation() }),
      lateFeeCap: Yup.string()
        .defined()
        .when('lateFeeKind', {
          is: (k: string) => k === 'per_day' || k === 'simple_interest',
          then: () => v.amountValidation(),
        }),
      lateFeeGraceDays: Yup.string()
        .defined()
        .when('lateFeeKind', { is: (k: string) => k !== 'none', then: () => whole(0, 90) }),
    }) as Yup.ObjectSchema<LoanFormValues>;

    // Owner, 12 Oct 2026 — the borrower edit drawer. The column limits are the
    // server's: area 60 (`NAME_MAX`), notes 500 (`NOTE_MAX`).
    const borrowerEditSchema = Yup.object({
      name: v.nameValidation(),
      mobile: v.mobileValidation(false).defined().default(''),
      area: v.boundedText(60),
      notes: v.boundedText(500),
    }) as Yup.ObjectSchema<BorrowerEditValues>;

    return { collectSchema, loanSchema, borrowerEditSchema };
  }, [v, t]);
};
