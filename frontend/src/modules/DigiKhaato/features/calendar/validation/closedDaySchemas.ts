'use client';

import { useMemo } from 'react';

import dayjs from 'dayjs';
import * as Yup from 'yup';

import { useTranslation } from 'src/hooks/useTranslation';
import { useValidationSchemas } from 'src/hooks/useValidationSchemas';

/** The server's limit on one range add (FRD 00 PLT-X08 §6). */
export const MAX_RANGE_DAYS = 31;

/** "Applies to: the whole business" — a select item cannot carry `''`. */
export const WHOLE_BUSINESS = 'all';

export interface ClosedDayFormValues {
  from: string;
  to?: string | null;
  reason: string;
  /** `WHOLE_BUSINESS`, or the module the closure is for. */
  module: string;
}

/** The RHF paths this form owns, so server errors anchor on the right field. */
export const CLOSED_DAY_FIELDS = ['from', 'to', 'reason', 'module'] as const;

/**
 * A9b — the add-closure form, composed from the central validators (R-F-2).
 * A past date is allowed: a closure entered late explains a past due date and
 * rewrites nothing (BR-4). The range rules mirror the server's so the merchant
 * sees them under the box rather than as a 400.
 */
export const useClosedDaySchemas = (): {
  readonly closedDaySchema: Yup.ObjectSchema<ClosedDayFormValues>;
} => {
  const v = useValidationSchemas();
  const { t } = useTranslation();

  return useMemo(
    () => ({
      closedDaySchema: Yup.object({
        from: v.businessDateValidation({ allowFuture: true }).defined(),
        to: Yup.string()
          .nullable()
          .optional()
          .test('after', t('calendar.validation.toBeforeFrom'), function after(value) {
            const { from } = this.parent as ClosedDayFormValues;
            return !value || !from || !dayjs(value).isBefore(dayjs(from), 'day');
          })
          .test('span', t('calendar.validation.tooLong'), function span(value) {
            const { from } = this.parent as ClosedDayFormValues;
            return !value || !from || dayjs(value).diff(dayjs(from), 'day') + 1 <= MAX_RANGE_DAYS;
          }),
        reason: v.requiredBoundedText(60, 1, 'calendar.validation.reason').defined(),
        module: Yup.string().defined().default(WHOLE_BUSINESS),
      }),
    }),
    [v, t]
  );
};
