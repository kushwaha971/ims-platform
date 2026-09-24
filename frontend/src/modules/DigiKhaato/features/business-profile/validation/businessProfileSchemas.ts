'use client';

import { useMemo } from 'react';

import * as Yup from 'yup';

import { useTranslation } from 'src/hooks/useTranslation';
import { useValidationSchemas } from 'src/hooks/useValidationSchemas';

import {
  BUSINESS_TYPES,
  GST_TYPES,
  type BusinessType,
  type GstType,
} from '../../onboarding/constants/businessTypes';

/**
 * PLT-07 §10 `businessProfileSchema`, composed from the central validators
 * (`gstinValidation`, `panValidation`, `upiVpaValidation`, `ifscValidation`,
 * `pincodeValidation`) — the server checks every one again.
 */
export interface BusinessProfileFormValues {
  name: string;
  legalName: string;
  businessType: BusinessType;
  gstType: GstType;
  gstin?: string | null;
  pan?: string | null;
  stateCode: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  pincode?: string | null;
  phone?: string | null;
  email?: string | null;
  accountName: string;
  accountNumber?: string | null;
  ifsc?: string | null;
  bankName: string;
  branch: string;
  upiVpa?: string | null;
}

export const PROFILE_FIELDS = [
  'name',
  'legalName',
  'businessType',
  'gstType',
  'gstin',
  'pan',
  'stateCode',
  'addressLine1',
  'addressLine2',
  'city',
  'pincode',
  'phone',
  'email',
  'accountName',
  'accountNumber',
  'ifsc',
  'bankName',
  'branch',
  'upiVpa',
] as const;

export const useBusinessProfileSchemas = (): {
  readonly businessProfileSchema: Yup.ObjectSchema<BusinessProfileFormValues>;
} => {
  const v = useValidationSchemas();
  const { t } = useTranslation();
  return useMemo(
    () => ({
      businessProfileSchema: Yup.object({
        name: v.nameValidation(2, 160).defined(),
        legalName: v.boundedText(200),
        businessType: v
          .enumValidation<BusinessType>(BUSINESS_TYPES, 'validation.businessType.required')
          .defined(),
        gstType: v.enumValidation<GstType>(GST_TYPES, 'validation.gstType.required').defined(),
        // FR-4: "`unregistered → regular` requires `gstin`".
        gstin: v.gstinValidation(false).when('gstType', {
          is: (type: GstType) => type !== 'unregistered',
          then: (schema) => schema.required(t('validation.gstin.required')),
        }),
        pan: v.panValidation(),
        stateCode: v.stateCodeValidation().defined(),
        addressLine1: v.boundedText(120),
        addressLine2: v.boundedText(120),
        city: v.boundedText(120),
        pincode: v.pincodeValidation(false),
        phone: v.mobileValidation(false),
        email: v.emailValidation(false),
        accountName: v.boundedText(120),
        accountNumber: v.bankAccountValidation(),
        ifsc: v.ifscValidation(),
        bankName: v.boundedText(80),
        branch: v.boundedText(80),
        upiVpa: v.upiVpaValidation(),
      }),
    }),
    [v, t]
  );
};
