import type { ModuleCode } from 'src/types/domain.types';

import { BUSINESS_TYPE_CONFIG, presetModules, type BusinessType } from '../constants/businessTypes';

import type { OnboardingWarning } from '../types/onboarding.types';

/**
 * Part 19 §19.1.1 layer 3 — pure functions. No React, no Redux, no I/O, no
 * `react-intl`: the caller passes translated copy in and gets a decision out.
 */

/**
 * PLT-03 FR-3 / §10 — the state code a GSTIN declares is its first two
 * characters, and the PAN is characters 3–12. Both are derivations, not
 * validations: `gstinValidation()` in the central hook decides whether the
 * GSTIN is well-formed and whether its checksum holds.
 *
 * They exist so that typing a GSTIN fills two more fields the merchant would
 * otherwise copy by hand from a certificate, getting one character wrong.
 */
export const stateCodeFromGstin = (gstin: string | null | undefined): string | null => {
  const value = (gstin ?? '').trim().toUpperCase();
  return value.length >= 2 ? value.slice(0, 2) : null;
};

export const panFromGstin = (gstin: string | null | undefined): string | null => {
  const value = (gstin ?? '').trim().toUpperCase();
  return value.length >= 12 ? value.slice(2, 12) : null;
};

/**
 * FR-3 — a GSTIN whose state does not match the one chosen on step 1 is a
 * WARNING, not an error: the merchant may have chosen wrongly, or may genuinely
 * operate from another state, and the server returns `warnings[]` rather than
 * a 400. The UI offers "Use state from GSTIN"; this decides whether to.
 */
export interface GstinStateMismatch {
  readonly mismatched: boolean;
  /** The state the GSTIN itself declares — the one the offer would apply. */
  readonly gstinStateCode: string | null;
}

export const gstinStateMismatch = (
  gstin: string | null | undefined,
  chosenStateCode: string | null | undefined
): GstinStateMismatch => {
  const fromGstin = stateCodeFromGstin(gstin);
  // Nothing to compare is not a mismatch; a half-typed GSTIN must not shout.
  if (!fromGstin || !chosenStateCode || (gstin ?? '').length < 15) {
    return { mismatched: false, gstinStateCode: fromGstin };
  }
  return { mismatched: fromGstin !== chosenStateCode, gstinStateCode: fromGstin };
};

/** FR-3's warning as the server sends it, for the same banner. */
export const findWarning = (
  warnings: readonly OnboardingWarning[],
  code: string
): OnboardingWarning | null => warnings.find((warning) => warning.code === code) ?? null;

/**
 * §8 — "PAN does not match GSTIN" is a warning too, never a block: a merchant
 * whose certificate and PAN card genuinely differ still has to be able to
 * finish onboarding at 9 p.m. with the shop shutter down.
 */
export const panMismatchesGstin = (
  pan: string | null | undefined,
  gstin: string | null | undefined
): boolean => {
  const derived = panFromGstin(gstin);
  if (!derived || !pan) return false;
  return derived !== pan.trim().toUpperCase();
};

// ── Step 4's summary (FR-5) ──────────────────────────────────────────────────

export interface PresetSummary {
  readonly inventoryEnabled: boolean;
  readonly defaultDueDays: number;
  readonly favouriteUnits: readonly string[];
  readonly modules: readonly ModuleCode[];
  /**
   * The subset of `modules` a merchant can open TODAY — what step 4 may list.
   * `modules` stays what the preset turns on, because that is what the server
   * stores; the card shows only this (UAT D8, owner rule: unbuilt is unshown).
   */
  readonly readyModules: readonly ModuleCode[];
  /** i18n keys for the extra expense categories this type seeds. */
  readonly extraExpenseCategoryIds: readonly string[];
  /** EC-6 — the partner's plan does not include stock; the summary says so. */
  readonly inventoryUnavailable: boolean;
}

/**
 * The modules that have screens today, in the order step 4 lists them.
 *
 * Every other module is unbuilt and has no sidebar row (`ready` absent in
 * `navigation/sidebarConfig.ts`, which hides it), and step 4 used to promise them all under
 * "What you get" — Stock, Bills & estimates, Purchases — beside a "Stock: On"
 * row (UAT D8). Add a module here in the same change that marks its first
 * sidebar item `ready`. `platform` is left out on purpose: its label is "Team
 * & settings", and Settings was not built when this was written.
 */
export const READY_MODULES: readonly ModuleCode[] = ['parties', 'ledger'];

/**
 * FR-5 — what step 4 shows before the button is pressed.
 *
 * `allowedModules` is the tenant's EFFECTIVE set once the server has
 * intersected plan and partner (PLT-15 FR-2). When it is known and does not
 * contain `inventory`, EC-6 says the summary must show "Stock: not available in
 * your plan" rather than promising something the preset will silently drop.
 */
export const presetSummary = (
  type: BusinessType,
  allowedModules: readonly ModuleCode[] | null
): PresetSummary => {
  const config = BUSINESS_TYPE_CONFIG[type];
  const wanted = presetModules(type);
  const effective =
    allowedModules === null ? wanted : wanted.filter((module) => allowedModules.includes(module));

  return {
    inventoryEnabled: effective.includes('inventory'),
    defaultDueDays: config.defaultDueDays,
    favouriteUnits: config.favouriteUnits,
    modules: effective,
    readyModules: READY_MODULES.filter((module) => effective.includes(module)),
    extraExpenseCategoryIds: config.extraExpenseCategoryIds,
    inventoryUnavailable: config.inventoryEnabled && !effective.includes('inventory'),
  };
};

/**
 * FR-9 — `onboarding_step` is what has been COMPLETED, so the wizard opens at
 * `step + 1`, clamped to the four steps that exist. A tenant that has finished
 * (`4`) has no next step and belongs on the dashboard, which the caller decides.
 */
export const resumeStep = (onboardingStep: number | null | undefined): number => {
  const completed = onboardingStep ?? 0;
  return Math.min(4, Math.max(1, completed + 1));
};

export const isOnboardingComplete = (onboardingStep: number | null | undefined): boolean =>
  (onboardingStep ?? 0) >= 4;

/**
 * Defect NEW-1 — must the wizard read its business back from the server?
 *
 * Yes when the session's active business is one the wizard CREATED
 * (`onboarding_step >= 1` — step 1's create writes 1, and nothing else makes a
 * tenant) and has not finished, and the caller is its OWNER — the same test
 * `postAuthDestination` uses to send anybody into the wizard at all, and the
 * same one the server's resume guard applies to `POST /tenants`.
 *
 * Not for a finished business: "Add a business" (PLT-04 FR-6) opens the wizard
 * from inside a completed one, and resuming THAT would put the live shop's
 * name in step 1 and rename it on Continue.
 */
export const shouldResumeFromServer = (
  tenant: {
    readonly role?: string | null;
    readonly onboardingStep?: number | null;
  } | null
): boolean =>
  tenant !== null &&
  tenant.role === 'owner' &&
  (tenant.onboardingStep ?? 0) >= 1 &&
  !isOnboardingComplete(tenant.onboardingStep);
