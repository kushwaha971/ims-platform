import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';

import type { BusinessType, GstType } from '../../onboarding/constants/businessTypes';
import type { BusinessProfile, ProfileWarning, TenantApiRow } from '../types/businessProfile.types';

/**
 * Part 19 §19.3.4 — PLT-07's service (`fetchTenant`, `updateTenant`). The
 * signature upload goes through the branding service, because the server has
 * one branding endpoint for the logo and the signature (FR-2).
 */

export const toProfile = (row: TenantApiRow): BusinessProfile => {
  const address = row.address ?? {};
  const bank = row.bank_details ?? {};
  return {
    name: row.name,
    legalName: row.legal_name ?? '',
    businessType: row.business_type as BusinessType,
    gstType: row.gst_type as GstType,
    gstin: row.gstin ?? '',
    pan: row.pan ?? '',
    stateCode: row.state_code,
    addressLine1: address.line1 ?? '',
    addressLine2: address.line2 ?? '',
    city: address.city ?? '',
    pincode: address.pincode ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    bank: {
      accountName: bank.account_name ?? '',
      accountNumber: bank.account_number ?? '',
      ifsc: bank.ifsc ?? '',
      bankName: bank.bank_name ?? '',
      branch: bank.branch ?? '',
    },
    bankMasked: Boolean(row.bank_details_masked),
    upiVpa: row.upi_vpa ?? '',
  };
};

/** The PATCH body (FR-1), snake_case; blanks travel as `null` ("clear it"). */
export const toPatch = (profile: BusinessProfile): Record<string, unknown> => {
  const blank = (value: string) => (value.trim() ? value.trim() : null);
  return {
    name: profile.name.trim(),
    legal_name: blank(profile.legalName),
    business_type: profile.businessType,
    gst_type: profile.gstType,
    gstin: profile.gstType === 'unregistered' ? null : blank(profile.gstin),
    pan: blank(profile.pan),
    state_code: profile.stateCode,
    address: {
      line1: blank(profile.addressLine1),
      line2: blank(profile.addressLine2),
      city: blank(profile.city),
      pincode: blank(profile.pincode),
    },
    phone: blank(profile.phone),
    email: blank(profile.email),
    bank_details: {
      account_name: blank(profile.bank.accountName),
      account_number: blank(profile.bank.accountNumber),
      ifsc: blank(profile.bank.ifsc),
      bank_name: blank(profile.bank.bankName),
      branch: blank(profile.bank.branch),
    },
    upi_vpa: blank(profile.upiVpa),
  };
};

interface TenantApiResponse {
  readonly data: TenantApiRow;
  readonly meta?: {
    readonly warnings?: readonly {
      readonly code: string;
      readonly field?: string;
      readonly gstin_state_code?: string;
    }[];
  };
}

/**
 * GET /tenants/current — FR-1.
 *
 * CR-2026-09-19-E, DOCUMENTED EXCEPTION — a whole-page read that renders its
 * own failure, so the toast is suppressed.
 */
export const fetchTenant = async (signal?: AbortSignal): Promise<BusinessProfile> => {
  const response = await api.get<TenantApiResponse>(
    API_PATHS.TENANT_CURRENT,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  return toProfile(response.data.data);
};

/**
 * PATCH /tenants/current — FR-1/FR-3/FR-4. Non-blocking notes (a GSTIN from
 * another state, a PAN that does not match) come back in `meta.warnings`; a
 * locked GST change is 409 `gst_type_locked` with the invoice count.
 */
export const updateTenant = async (
  profile: BusinessProfile
): Promise<{ profile: BusinessProfile; warnings: ProfileWarning[] }> => {
  const response = await api.patch<TenantApiResponse>(API_PATHS.TENANT_CURRENT, toPatch(profile));
  return {
    profile: toProfile(response.data.data),
    warnings: (response.data.meta?.warnings ?? []).map((warning) => ({
      code: warning.code,
      field: warning.field,
      gstinStateCode: warning.gstin_state_code,
    })),
  };
};
