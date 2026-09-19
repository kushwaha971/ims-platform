'use client';

import { useMemo } from 'react';

import * as Yup from 'yup';

import { useTranslation } from 'src/hooks/useTranslation';
import { useValidationSchemas } from 'src/hooks/useValidationSchemas';

import { BUSINESS_TYPES, GST_TYPES, type BusinessType, type GstType } from '../constants/businessTypes';
import { GST_STATE_CODES } from '../constants/gstStates';

/**
 * Part 19 §19.5.3 — the wizard's schemas, composed from the central validators.
 *
 * The one rule that is genuinely this feature's own is step 2's: a GSTIN is
 * REQUIRED when `gst_type ≠ unregistered` and forbidden otherwise (FR-3,
 * §10). It is expressed with `Yup.when`, so the branch lives in the schema and
 * not as an `if` in a submit handler where a refactor can lose it.
 */

export interface BusinessStepFormValues {
  name: string;
  businessType: BusinessType | '';
  stateCode: string;
  ownerName: string | null;
}

export interface GstStepFormValues {
  gstType: GstType;
  gstin: string | null;
  legalName: string | null;
  pan: string | null;
}

export interface AddressStepFormValues {
  line1: string | null;
  line2: string | null;
  city: string | null;
  district: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
}

export const BUSINESS_STEP_FIELDS = [
  'name',
  'businessType',
  'stateCode',
  'ownerName',
] as const;
export const GST_STEP_FIELDS = ['gstType', 'gstin', 'legalName', 'pan'] as const;
export const ADDRESS_STEP_FIELDS = [
  'line1',
  'line2',
  'city',
  'district',
  'pincode',
  'phone',
  'email',
  'address',
] as const;

export interface OnboardingSchemas {
  readonly businessStepSchema: Yup.ObjectSchema<BusinessStepFormValues>;
  readonly gstStepSchema: Yup.ObjectSchema<GstStepFormValues>;
  readonly addressStepSchema: Yup.ObjectSchema<AddressStepFormValues>;
}

export const useOnboardingSchemas = (): OnboardingSchemas => {
  const v = useValidationSchemas();
  const { t } = useTranslation();

  return useMemo<OnboardingSchemas>(
    () => ({
      businessStepSchema: Yup.object({
        // §10 — 2–160 chars, trimmed. `nameValidation` is the shared rule; only
        // the ceiling differs from its default.
        name: v.nameValidation(2, 160).defined(),
        businessType: Yup.mixed<BusinessType | ''>()
          .oneOf([...BUSINESS_TYPES], t('validation.businessType.required'))
          .required(t('validation.businessType.required'))
          .defined(),
        // EC-4 — `97` is in `GST_STATE_CODES` and `99` is not, so "in the list"
        // is the whole rule and there is no second place to keep it true.
        stateCode: v
          .stateCodeValidation()
          .oneOf([...GST_STATE_CODES], t('validation.stateCode.required'))
          .defined(),
        // BR-7 — asked only when `platform_user.full_name` is still blank.
        ownerName: v.optionalText(120).defined(),
      }),

      gstStepSchema: Yup.object({
        gstType: Yup.mixed<GstType>()
          .oneOf([...GST_TYPES], t('validation.gstType.required'))
          .required(t('validation.gstType.required'))
          .defined(),
        // FR-3 / §10 — required, regex-checked and CHECKSUM-checked when the
        // business says it is registered; absent when it says it is not.
        gstin: Yup.string()
          .nullable()
          .when('gstType', {
            is: (value: GstType) => value !== 'unregistered',
            then: () => v.gstinValidation(true),
            otherwise: () => v.gstinValidation(false),
          })
          .defined(),
        legalName: v.optionalText(200).defined(),
        // §10 — the PAN's own format is a rule; whether it matches the GSTIN is
        // a WARNING the view-model computes, not a reason to block a merchant.
        pan: v.panValidation().defined(),
      }),

      addressStepSchema: Yup.object({
        line1: v.optionalText(120).defined(),
        line2: v.optionalText(120).defined(),
        city: v.optionalText(120).defined(),
        district: v.optionalText(120).defined(),
        pincode: v.pincodeValidation(false).defined(),
        // FR-4 — defaults to the owner's mobile, so it is optional here and the
        // server fills it (BR-6).
        phone: v.mobileValidation(false).defined(),
        email: v.emailValidation(false).defined(),
      }),
    }),
    [v, t]
  );
};
