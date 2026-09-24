'use client';

import { useMemo } from 'react';

import * as Yup from 'yup';

import { useTranslation } from 'src/hooks/useTranslation';
import { useValidationSchemas } from 'src/hooks/useValidationSchemas';

import { nameMatches } from '../view-model/accountDataDisplay';

/** PLT-10 §10 — the deletion confirmation. */
export const DELETE_REASON_MAX = 500;

export interface DeleteBusinessFormValues {
  password: string;
  confirmName: string;
  reason: string;
}

/**
 * The typed name is checked here as well as on the server so the button can
 * say "Name does not match" before a round trip; the server decides again,
 * case-insensitively and trimmed, exactly as this does (`nameMatches`).
 */
export const useAccountDataSchemas = (
  businessName: string
): { readonly deleteBusinessSchema: Yup.ObjectSchema<DeleteBusinessFormValues> } => {
  const v = useValidationSchemas();
  const { t } = useTranslation();
  return useMemo(
    () => ({
      deleteBusinessSchema: Yup.object({
        password: v.requiredText(256, 'data.delete.password.required').defined(),
        confirmName: v
          .requiredText(200, 'data.delete.confirm.required')
          .test('matches', t('data.delete.confirm.mismatch'), (value) =>
            nameMatches(value ?? '', businessName)
          )
          .defined(),
        reason: Yup.string().max(DELETE_REASON_MAX).defined(),
      }),
    }),
    [v, t, businessName]
  );
};
