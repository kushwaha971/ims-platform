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

/**
 * `meta.warnings[]` exactly as `services/onboarding._apply_gst` appends it:
 * `{code, field, gstin_state_code}` for `gstin_state_mismatch` and
 * `{code, field, gstin_pan}` for `pan_gstin_mismatch`.
 *
 * Two things were wrong here and both were invisible because no component
 * renders these yet. `message` was typed as REQUIRED and the server has never
 * sent one — a warning is a code the client has its own translated copy for
 * (`onboarding.gstin.stateMismatch`), not a server string, and typing it
 * required made `warning.message` an `undefined` that the type said could not
 * be. And `state_code` is the state the merchant CHOSE, not the state the
 * GSTIN belongs to; reading it as the latter — which is what
 * `OnboardingWarning.stateCode` is documented to be — inverted the meaning of
 * the one field a mismatch banner would interpolate. The GSTIN's own state is
 * `gstin_state_code`.
 */
interface TenantApiResponse {
  readonly data: TenantApiPayload | { readonly tenant: TenantApiPayload };
  readonly meta?: {
    readonly warnings?: readonly {
      readonly code: string;
      readonly field?: string;
      readonly message?: string;
      /** The state the GSTIN itself encodes. */
      readonly gstin_state_code?: string;
      /** The state the merchant picked — NOT the GSTIN's. */
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
    ...(warning.field ? { field: warning.field } : {}),
    ...(warning.message ? { message: warning.message } : {}),
    ...(warning.gstin_state_code ? { stateCode: warning.gstin_state_code } : {}),
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
 *
 * NEW-1: when the caller already owns an UNFINISHED business the server
 * resumes it instead of creating another, and answers `200` rather than `201`
 * with the same body. Nothing here branches on the status — the tenant in the
 * body is the one the wizard continues with, either way.
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

/**
 * GET /tenants/current — the business the wizard is RESUMING (defect NEW-1).
 *
 * The draft in the slice is memory, and a browser refresh empties it: step 1
 * came back blank for a business that already existed, the merchant filled it
 * in again, and the create call made a second business. The server is the
 * only thing that survives a refresh, so a resumed wizard reads the tenant
 * back from it and folds it into the draft before any step is drawn.
 *
 * A QUERY, so a failure is not suppressed: it reaches the global snackbar
 * like any other failed read, and the wizard falls back to an empty step 1 —
 * whose submit the server now turns into a resume rather than a duplicate.
 * The body is the bare tenant (no `data.tenant` nesting), as for the PATCHes.
 */
export const fetchCurrentTenant = async (): Promise<OnboardingTenant> => {
  const response = await api.get<TenantApiResponse>(API_PATHS.TENANT_CURRENT);
  return toTenant(unwrapTenant(response.data.data));
};

/**
 * GET /tenants/resumable — the business "Add a business" would CONTINUE rather
 * than create (defect M2), or `null`.
 *
 * `POST /tenants` resumes the caller's unfinished business when it is still an
 * abandoned attempt (no other people, no books), and used to do it silently:
 * the merchant typed a new name on step 1 and an existing business was
 * renamed. The wizard asks first, so step 1 can say which business Continue
 * will finish and show its values instead of a blank form. The server answers
 * with the same rule the create applies, so the two cannot disagree.
 *
 * A QUERY, so a failure reaches the global snackbar and the wizard falls back
 * to a blank step 1 — no worse than before this read existed.
 */
export const fetchResumableTenant = async (): Promise<OnboardingTenant | null> => {
  const response = await api.get<{ readonly data: { readonly tenant: TenantApiPayload | null } }>(
    API_PATHS.TENANT_RESUMABLE
  );
  const row = response.data.data.tenant;
  return row ? toTenant(row) : null;
};

/**
 * PATCH /tenants/current — step 1 again, for a business that already exists.
 *
 * PLT-03 FR-9 makes a completed step navigable "for edits", and step 1 is the
 * business name. Before this, editing it called `createTenant` unconditionally:
 * a merchant who came back to fix a misspelled name got a SECOND business,
 * which is permanent — there is no delete-business path at MVP (PLT-10 is
 * unbuilt) — and which became the active tenant, so the wizard then carried on
 * filling in the duplicate.
 *
 * `name`, `business_type` and `state_code` are all in the server's
 * `UPDATABLE_FIELDS`, so this is the same three values by the other verb.
 *
 * `onboarding_step` is deliberately NOT sent. An edit is not progress: the
 * server assigns the step it is given, so echoing `1` from a merchant who had
 * reached step 3 would regress the wizard and resume them in the wrong place
 * on their next login. Omitting it leaves the recorded step where it was.
 *
 * `owner_name` is likewise not sent: it is a field on the USER, accepted only
 * by `POST /tenants` (`TenantCreateSerializer`), and there is no MVP endpoint
 * that updates it. BR-7 only asks for it when it is blank, which on an edit it
 * no longer is.
 */
export const updateBusinessStep = async (
  input: OnboardingBusinessStep
): Promise<OnboardingResult> => {
  const response = await api.patch<TenantApiResponse>(
    API_PATHS.TENANT_CURRENT,
    {
      name: input.name,
      business_type: input.businessType,
      state_code: input.stateCode,
    },
    ubConfig({ suppressErrorSnackbar: true })
  );
  return toResult(response.data);
};
export const updateBusinessStepWriteClass: TWriteClass = 'online-only';

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
