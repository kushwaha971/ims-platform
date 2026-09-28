'use client';

import { useMemo } from 'react';

import * as Yup from 'yup';

import { useValidationSchemas } from 'src/hooks/useValidationSchemas';

/** WLB-01 §10 — `brandingSchema`. Contrast is checked by the badge and the server. */
export const APP_NAME_MAX = 30;
export const DOC_HEADER_MAX = 120;
export const DOC_FOOTER_MAX = 300;

export interface BrandingFormValues {
  primaryHex: string;
  appName: string;
  docHeader: string;
  docFooter: string;
}

export const useBrandingSchemas = (): {
  readonly brandingSchema: Yup.ObjectSchema<BrandingFormValues>;
} => {
  const v = useValidationSchemas();
  return useMemo(
    () => ({
      brandingSchema: Yup.object({
        primaryHex: v.hexColourValidation(),
        appName: v.requiredBoundedText(APP_NAME_MAX, 2, 'branding.appName.required'),
        docHeader: v.boundedText(DOC_HEADER_MAX),
        docFooter: v.boundedText(DOC_FOOTER_MAX),
      }),
    }),
    [v]
  );
};
