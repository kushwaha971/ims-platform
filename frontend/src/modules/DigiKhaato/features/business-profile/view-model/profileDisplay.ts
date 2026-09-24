import type { Locale } from 'src/types/domain.types';

import { stateName } from '../../onboarding/constants/gstStates';

import type { BusinessProfile } from '../types/businessProfile.types';
import type { BusinessProfileFormValues } from '../validation/businessProfileSchemas';

/** PLT-07 — the form's values from the server's profile (blanks as ''). */
export const profileToForm = (profile: BusinessProfile): BusinessProfileFormValues => ({
  name: profile.name,
  legalName: profile.legalName,
  businessType: profile.businessType,
  gstType: profile.gstType,
  gstin: profile.gstin,
  pan: profile.pan,
  stateCode: profile.stateCode,
  addressLine1: profile.addressLine1,
  addressLine2: profile.addressLine2,
  city: profile.city,
  pincode: profile.pincode,
  phone: profile.phone,
  email: profile.email,
  accountName: profile.bank.accountName,
  accountNumber: profile.bank.accountNumber,
  ifsc: profile.bank.ifsc,
  bankName: profile.bank.bankName,
  branch: profile.bank.branch,
  upiVpa: profile.upiVpa,
});

/** And back, for the PATCH. The validators already normalised case and blanks. */
export const formToProfile = (values: BusinessProfileFormValues): BusinessProfile => ({
  name: values.name,
  legalName: values.legalName,
  businessType: values.businessType,
  gstType: values.gstType,
  gstin: values.gstin ?? '',
  pan: values.pan ?? '',
  stateCode: values.stateCode,
  addressLine1: values.addressLine1,
  addressLine2: values.addressLine2,
  city: values.city,
  pincode: values.pincode ?? '',
  phone: values.phone ?? '',
  email: values.email ?? '',
  bank: {
    accountName: values.accountName,
    accountNumber: values.accountNumber ?? '',
    ifsc: values.ifsc ?? '',
    bankName: values.bankName,
    branch: values.branch,
  },
  bankMasked: false,
  upiVpa: values.upiVpa ?? '',
});

/**
 * FR-7 / BR-1 — the address block a bill prints: street lines, then
 * "City – PIN", then the state with its GST code, because the state code is
 * what decides intra- vs inter-state tax (BR-2) and a customer's accountant
 * reads it from the header.
 */
export const headerAddressLines = (
  values: Partial<BusinessProfileFormValues>,
  locale: Locale
): readonly string[] => {
  const lines: string[] = [];
  if (values.addressLine1) lines.push(values.addressLine1);
  if (values.addressLine2) lines.push(values.addressLine2);
  const cityPin = [values.city, values.pincode].filter(Boolean).join(' – ');
  if (cityPin) lines.push(cityPin);
  if (values.stateCode) lines.push(`${stateName(values.stateCode, locale)} (${values.stateCode})`);
  return lines;
};

/** "GSTIN 27AAPFU0939F1ZV" — or nothing for an unregistered business. */
export const headerGstinLine = (
  values: Partial<BusinessProfileFormValues>,
  label: string
): string | null =>
  values.gstType && values.gstType !== 'unregistered' && values.gstin
    ? `${label} ${values.gstin.toUpperCase()}`
    : null;
