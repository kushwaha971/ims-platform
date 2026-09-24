'use client';

import { useMemo } from 'react';

import * as Yup from 'yup';

import { useValidationSchemas } from 'src/hooks/useValidationSchemas';

/** PLT-09 §10 — `device_label` 1–120 characters. */
export const DEVICE_LABEL_MAX = 120;

export interface RenameDeviceFormValues {
  label: string;
}

export const useSessionSchemas = (): {
  readonly renameDeviceSchema: Yup.ObjectSchema<RenameDeviceFormValues>;
} => {
  const v = useValidationSchemas();
  return useMemo(
    () => ({
      renameDeviceSchema: Yup.object({
        label: v.requiredBoundedText(DEVICE_LABEL_MAX, 1, 'sessions.rename.required').defined(),
      }),
    }),
    [v]
  );
};
