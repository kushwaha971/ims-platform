'use client';

import { useMemo } from 'react';

import * as Yup from 'yup';

import { useTranslation } from 'src/hooks/useTranslation';
import { useValidationSchemas } from 'src/hooks/useValidationSchemas';

/** PLT-14 FR-10 — every console write carries a reason of at least five characters. */
export const REASON_MIN = 5;
export const REASON_MAX = 500;

export interface ReasonFormValues {
  reason: string;
}

export interface TenantEditFormValues {
  planId: string;
  status: 'active' | 'suspended';
  /** Blank means "no override — the plan decides". */
  maxUsers: string;
  storageMb: string;
  reason: string;
}

const WHOLE = /^\d{1,7}$/;

export const useAdminSchemas = (): {
  readonly reasonSchema: Yup.ObjectSchema<ReasonFormValues>;
  readonly tenantEditSchema: Yup.ObjectSchema<TenantEditFormValues>;
} => {
  const v = useValidationSchemas();
  const { t } = useTranslation();
  return useMemo(() => {
    const reason = v.requiredBoundedText(REASON_MAX, REASON_MIN, 'admin.reason.required').defined();
    const limit = Yup.string()
      .trim()
      .test('whole', t('admin.edit.limit.invalid'), (value) => !value || WHOLE.test(value))
      .defined();
    return {
      reasonSchema: Yup.object({ reason }),
      tenantEditSchema: Yup.object({
        planId: Yup.string().defined(),
        status: Yup.mixed<'active' | 'suspended'>().oneOf(['active', 'suspended']).defined(),
        maxUsers: limit,
        storageMb: limit,
        reason,
      }),
    };
  }, [v, t]);
};
