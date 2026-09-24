'use client';

import { useMemo } from 'react';

import * as Yup from 'yup';

import { useTranslation } from 'src/hooks/useTranslation';
import { useValidationSchemas } from 'src/hooks/useValidationSchemas';

import {
  REMINDER_MAX_CHARS,
  templateProblems,
  type TemplateProblem,
} from '../view-model/settingsDisplay';

import type { CreditLimitMode } from '../types/settings.types';

/** PLT-06 §10 `ledgerSettingsSchema` + `reminderTemplateSchema`, composed. */
export interface LedgerSettingsFormValues {
  creditMode: CreditLimitMode;
  templateEn: string;
  templateHi: string;
}

export const CREDIT_MODES: readonly CreditLimitMode[] = ['off', 'warn', 'block'];

const problemMessage = (
  problem: TemplateProblem,
  t: (id: string, values?: Record<string, string | number | Date>) => string
): string => {
  switch (problem.kind) {
    case 'unknown':
      return t('settings.template.unknown', { name: `{${problem.name}}` });
    case 'missingAmount':
      return t('settings.template.missingAmount');
    case 'doubleBraces':
      return t('settings.template.doubleBraces');
    default:
      return t('settings.template.tooLong', { max: REMINDER_MAX_CHARS });
  }
};

export const useSettingsSchemas = (): {
  readonly ledgerSettingsSchema: Yup.ObjectSchema<LedgerSettingsFormValues>;
} => {
  const v = useValidationSchemas();
  const { t } = useTranslation();

  return useMemo(() => {
    const template = () =>
      v.boundedText(REMINDER_MAX_CHARS).test(
        'reminder-template',
        // Replaced per value below; Yup needs a default.
        t('settings.template.missingAmount'),
        function check(value) {
          const first = templateProblems(value ?? '')[0];
          return first ? this.createError({ message: problemMessage(first, t) }) : true;
        }
      );
    return {
      ledgerSettingsSchema: Yup.object({
        creditMode: v
          .enumValidation<CreditLimitMode>(CREDIT_MODES, 'settings.creditLimit.required')
          .defined(),
        templateEn: template(),
        templateHi: template(),
      }),
    };
  }, [v, t]);
};
