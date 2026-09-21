import type { Locale, ModuleCode } from 'src/types/domain.types';

import type { BusinessType, GstType } from '../constants/businessTypes';

/**
 * Part 19 §19.2.3 — the onboarding feature's own types.
 *
 * The draft is held per STEP rather than as one flat object, because each step
 * is its own request (FR-2 creates, FR-3/FR-4/FR-5 patch) and a resume lands on
 * a step with the earlier ones already saved server-side (FR-9). A single flat
 * draft would make "what has been persisted" unanswerable.
 */

export interface OnboardingAddress {
  readonly line1: string | null;
  readonly line2: string | null;
  readonly city: string | null;
  readonly district: string | null;
  readonly pincode: string | null;
}

export interface OnboardingBusinessStep {
  readonly name: string;
  readonly businessType: BusinessType | null;
  readonly stateCode: string | null;
  /** FR-2 / BR-7 — written to `platform_user.full_name` when that is blank. */
  readonly ownerName: string | null;
}

export interface OnboardingGstStep {
  readonly gstType: GstType;
  readonly gstin: string | null;
  readonly legalName: string | null;
  readonly pan: string | null;
}

export interface OnboardingAddressStep {
  readonly address: OnboardingAddress;
  readonly phone: string | null;
  readonly email: string | null;
}

export interface OnboardingSummaryStep {
  readonly locale: Locale;
}

/**
 * FR-3 — a non-blocking server note, e.g. `gstin_state_mismatch`.
 *
 * `code` is the whole contract: the server sends a code and the facts behind
 * it, and the CLIENT owns the copy, because `onboarding.gstin.stateMismatch`
 * is already translated into `hi` and a server-minted English sentence in
 * `meta` would not be. `message` is therefore optional — the server may say
 * something, and today it says nothing.
 */
export interface OnboardingWarning {
  readonly code: string;
  /** The wire field the warning is about, when the server names one. */
  readonly field?: string;
  readonly message?: string;
  /** The state the GSTIN actually belongs to (wire: `gstin_state_code`). */
  readonly stateCode?: string;
}

// ── Wire shapes (snake_case, exactly as Part 22 §22.3 documents them) ────────

export interface TenantApiPayload {
  readonly id: string;
  readonly name: string;
  readonly business_type: BusinessType;
  readonly state_code: string;
  readonly gst_type: GstType;
  readonly gstin: string | null;
  readonly legal_name: string | null;
  readonly pan: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly locale: Locale;
  readonly onboarding_step: number;
  readonly enabled_modules: readonly ModuleCode[];
  readonly address: {
    readonly line1?: string | null;
    readonly line2?: string | null;
    readonly city?: string | null;
    readonly district?: string | null;
    readonly pincode?: string | null;
  } | null;
}

/** The domain shape of a tenant as the wizard needs it. */
export interface OnboardingTenant {
  readonly id: string;
  readonly name: string;
  readonly businessType: BusinessType;
  readonly stateCode: string;
  readonly gstType: GstType;
  readonly gstin: string | null;
  readonly legalName: string | null;
  readonly pan: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly locale: Locale;
  readonly onboardingStep: number;
  readonly enabledModules: readonly ModuleCode[];
  readonly address: OnboardingAddress;
}

export interface OnboardingResult {
  readonly tenant: OnboardingTenant;
  readonly warnings: readonly OnboardingWarning[];
}
