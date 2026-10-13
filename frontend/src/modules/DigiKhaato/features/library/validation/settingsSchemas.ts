import { useMemo } from 'react';

import * as Yup from 'yup';

import { useTranslation } from 'src/hooks/useTranslation';
import { useValidationSchemas } from 'src/hooks/useValidationSchemas';

import {
  FINE_ROUNDINGS,
  LOST_FOUND_PAID,
  OVERDUE_ISSUE_RULES,
  RENEW_FROM,
  RENEW_OVERDUE,
  type LibrarySettingsFormValues,
  type RaiseNumberFormValues,
} from '../types/settings.types';
import { parseReminderDays, REMINDER_DAYS_MAX } from '../view-model/settingsDisplay';

/**
 * F02 (LIB-01 §9) — the settings rules, composed from the central validators
 * (a money field here is the same rule as every money field's). The server
 * re-checks each one; these exist so the librarian hears before Save.
 */
const MONEY_MAX = '99999999.99';

export interface LibrarySettingsSchemas {
  readonly librarySettingsSchema: Yup.ObjectSchema<LibrarySettingsFormValues>;
  readonly raiseNumberSchema: (current: number) => Yup.ObjectSchema<RaiseNumberFormValues>;
}

const wholeNumberIn = (min: number, max: number, message: string): Yup.StringSchema<string> =>
  Yup.string()
    .defined()
    .trim()
    .test('range', message, (value) => {
      if (!/^\d+$/.test(value ?? '')) return false;
      const n = Number(value);
      return n >= min && n <= max;
    });

export const useLibrarySettingsSchemas = (): LibrarySettingsSchemas => {
  const v = useValidationSchemas();
  const { t } = useTranslation();

  return useMemo(() => {
    const librarySettingsSchema: Yup.ObjectSchema<LibrarySettingsFormValues> = Yup.object({
      fineSkipClosedDays: Yup.boolean().defined(),
      fineRounding: v.enumValidation(FINE_ROUNDINGS, 'library.settings.choose'),
      overdueIssueRule: v.enumValidation(OVERDUE_ISSUE_RULES, 'library.settings.choose'),
      lostCountsTowardLimit: Yup.boolean().defined(),
      renewFrom: v.enumValidation(RENEW_FROM, 'library.settings.choose'),
      renewOverdue: v.enumValidation(RENEW_OVERDUE, 'library.settings.choose'),
      holdPickupDays: wholeNumberIn(1, 30, t('library.settings.holdPickupDays.range')),
      lostMultiplier: Yup.string()
        .defined()
        .trim()
        .test(
          'multiplier',
          t('library.settings.lostMultiplier.range'),
          (value) => /^\d{1,2}(\.\d{1,2})?$/.test(value ?? '') && Number(value) <= 10
        ),
      lostProcessingFee: v.amountValidation({ allowZero: true, max: MONEY_MAX }),
      lostFoundPaid: v.enumValidation(LOST_FOUND_PAID, 'library.settings.choose'),
      fallbackPrice: v.optionalAmountValidation({ max: MONEY_MAX }).defined().default(''),
      damageMinorAmount: v.amountValidation({ allowZero: true, max: MONEY_MAX }),
      damageMajorPercent: wholeNumberIn(1, 100, t('library.settings.damageMajorPercent.range')),
      waiverCeiling: v.optionalAmountValidation({ max: MONEY_MAX }).defined().default(''),
      overdueReminderDays: Yup.string()
        .defined()
        .test(
          'days',
          t('library.settings.reminderDays.invalid', { max: REMINDER_DAYS_MAX }),
          (value) => parseReminderDays(value ?? '') !== null
        ),
      remindDayBefore: Yup.boolean().defined(),
    }) as Yup.ObjectSchema<LibrarySettingsFormValues>;

    const raiseNumberSchema = (current: number): Yup.ObjectSchema<RaiseNumberFormValues> =>
      Yup.object({
        nextNumber: Yup.string()
          .defined()
          .trim()
          .test('forward', function check(value) {
            if (!/^\d{1,9}$/.test(value ?? '')) {
              return this.createError({ message: t('library.settings.number.invalid') });
            }
            return (
              Number(value) >= current ||
              this.createError({
                message: t('library.settings.number.backwards', { current }),
              })
            );
          }),
      });

    return { librarySettingsSchema, raiseNumberSchema };
  }, [v, t]);
};
