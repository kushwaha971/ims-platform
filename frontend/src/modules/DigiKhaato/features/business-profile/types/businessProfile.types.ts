import type { BusinessType, GstType } from '../../onboarding/constants/businessTypes';

/** PLT-07 FR-1 — the business's legal and contact identity. */
export interface BankDetails {
  readonly accountName: string;
  readonly accountNumber: string;
  readonly ifsc: string;
  readonly bankName: string;
  readonly branch: string;
}

export interface BusinessProfile {
  readonly name: string;
  readonly legalName: string;
  readonly businessType: BusinessType;
  readonly gstType: GstType;
  readonly gstin: string;
  readonly pan: string;
  readonly stateCode: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly city: string;
  readonly pincode: string;
  readonly phone: string;
  readonly email: string;
  readonly bank: BankDetails;
  /** §12: true when the server masked the account number and PAN for this role. */
  readonly bankMasked: boolean;
  readonly upiVpa: string;
}

export interface ProfileWarning {
  readonly code: string;
  readonly field?: string;
  readonly gstinStateCode?: string;
}

export interface TenantApiRow {
  readonly name: string;
  readonly legal_name: string | null;
  readonly business_type: string;
  readonly gst_type: string;
  readonly gstin: string | null;
  readonly pan: string | null;
  readonly state_code: string;
  readonly address: Readonly<Record<string, string>> | null;
  readonly phone: string;
  readonly email: string | null;
  readonly bank_details: Readonly<Record<string, string>> | null;
  readonly bank_details_masked?: boolean;
  readonly upi_vpa: string | null;
}
