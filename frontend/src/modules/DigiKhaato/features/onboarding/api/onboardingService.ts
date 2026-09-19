import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import type { TWriteClass } from 'src/types/api.types';

import type {
  OnboardingAddressStep,
  OnboardingBusinessStep,
  OnboardingGstStep,
  OnboardingResult,
  OnboardingSummaryStep,
  OnboardingTenant,
  OnboardingWarning,
  TenantApiPayload,
} from '../types/onboarding.types';

/**
 * Part 19 §19.3.4 — the service layer. One function per endpoint, owning the
 * snake_case ⇄ camelCase mapping and the response typing.
 *
 * Writes here are class **C, online-only** (§19.10.4): a tenant that exists
 * only in an outbox has no `tid`, so nothing else in the app can be done until
 * it is real. Queuing it would put the user inside a business that the server
 * has never heard of.
 */

interface TenantApiResponse {
  readonly data: TenantApiPayload | { readonly tenant: TenantApiPayload };
  readonly meta?: {
    readonly warnings?: readonly {
      readonly code: string;
      readonly message: string;
      readonly state_code?: string;
    }[];
  };
}

/** FR-2's 201 nests the tenant under `data.tenant`; FR-3's PATCH does not. */
const unwrapTenant = (data: TenantApiResponse['data']): TenantApiPayload =>
  'tenant' in data ? data.tenant : data;

const toTenant = (row: TenantApiPayload): OnboardingTenant => ({
  id: row.id,
  name: row.name,
  businessType: row.business_type,
  stateCode: row.state_code,
  gstType: row.gst_type,
  gstin: row.gstin,
  legalName: row.legal_name,
  pan: row.pan,
  phone: row.phone,
  email: row.email,
  locale: row.locale,
  onboardingStep: row.onboarding_step,
  enabledModules: row.enabled_modules,
  address: {
    line1: row.address?.line1 ?? null,
    line2: row.address?.line2 ?? null,
    city: row.address?.city ?? null,
    district: row.address?.district ?? null,
    pincode: row.address?.pincode ?? null,
  },
});

/** FR-3 — `warnings[]` is a note, never an error; it must not be dropped. */
const toWarnings = (body: TenantApiResponse): readonly OnboardingWarning[] =>
  (body.meta?.warnings ?? []).map((warning) => ({
    code: warning.code,
    message: warning.message,
    ...(warning.state_code ? { stateCode: warning.state_code } : {}),
  }));

const toResult = (body: TenantApiResponse): OnboardingResult => ({
  tenant: toTenant(unwrapTenant(body.data)),
  warnings: toWarnings(body),
});

/**
 * POST /tenants (CCR-1) — step 1. Creates the tenant, the owner membership and
 * a token carrying the new `tid`.
 *
 * `Idempotency-Key` is MANDATORY here (EC-7): a lost response after a
 * successful create must replay the created tenant rather than produce a second
 * business with the same name. The key is minted by the CALLER and reused on
 * every retry of the same logical action (§19.1.3 note 1) — a key generated
 * here would be a new one per attempt, which is the bug this header exists to
 * prevent.
 */
export const createTenant = async (
  input: OnboardingBusinessStep,
  idempotencyKey: string
): Promise<OnboardingResult> => {
  const response = await api.post<TenantApiResponse>(
    API_PATHS.TENANTS,
    {
      name: input.name,
      business_type: input.businessType,
      state_code: input.stateCode,
      ...(input.ownerName ? { owner_name: input.ownerName } : {}),
    },
    ubConfig({
      suppressErrorSnackbar: true,
      headers: { 'Idempotency-Key': idempotencyKey },
    })
  );
  return toResult(response.data);
};
export const createTenantWriteClass: TWriteClass = 'online-only';

/** PATCH /tenants/current — step 2 (FR-3). */
export const updateGstStep = async (input: OnboardingGstStep): Promise<OnboardingResult> => {
  const response = await api.patch<TenantApiResponse>(
    API_PATHS.TENANT_CURRENT,
    {
      gst_type: input.gstType,
      // Unregistered carries no GSTIN, and sending `""` would fail the regex
      // server-side for a business that is legitimately not registered.
      gstin: input.gstType === 'unregistered' ? null : input.gstin,
      legal_name: input.legalName,
      pan: input.pan,
      onboarding_step: 2,
    },
    ubConfig({ suppressErrorSnackbar: true })
  );
  return toResult(response.data);
};
export const updateGstStepWriteClass: TWriteClass = 'online-only';

/** PATCH /tenants/current — step 3 (FR-4). */
export const updateAddressStep = async (
  input: OnboardingAddressStep
): Promise<OnboardingResult> => {
  const response = await api.patch<TenantApiResponse>(
    API_PATHS.TENANT_CURRENT,
    {
      address: {
        line1: input.address.line1,
        line2: input.address.line2,
        city: input.address.city,
        district: input.address.district,
        pincode: input.address.pincode,
      },
      phone: input.phone,
      email: input.email,
      onboarding_step: 3,
    },
    ubConfig({ suppressErrorSnackbar: true })
  );
  return toResult(response.data);
};
export const updateAddressStepWriteClass: TWriteClass = 'online-only';

/**
 * PATCH /tenants/current — step 4 (FR-5). `onboarding_step: 4` is what makes
 * the server apply the business-type preset, idempotently (BR-3).
 */
export const completeOnboarding = async (
  input: OnboardingSummaryStep
): Promise<OnboardingResult> => {
  const response = await api.patch<TenantApiResponse>(
    API_PATHS.TENANT_CURRENT,
    { locale: input.locale, onboarding_step: 4 },
    ubConfig({ suppressErrorSnackbar: true })
  );
  return toResult(response.data);
};
export const completeOnboardingWriteClass: TWriteClass = 'online-only';
