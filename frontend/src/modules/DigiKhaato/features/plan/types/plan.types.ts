import type { ModuleCode } from 'src/types/domain.types';

/**
 * PLT-15 — plan entitlements, built to **DEC-001** (defaulted 2026-09-19,
 * option (b)).
 *
 * DEC-001 is the reason this file is small. At MVP entitlements gate **modules
 * and member count only**: the free tier is owner plus two members, the LEDGER
 * IS NEVER CAPPED in any tier, and `max_parties` and `max_invoices_per_month`
 * are removed from enforcement on every MVP plan. So there is no party counter,
 * no invoice meter and no "you have used 80 of 100 invoices" surface anywhere
 * in this feature — the only limit with a UI is the member one.
 *
 * `max_parties`, `max_invoices_per_month` and `storage_mb` still appear in the
 * TYPE, because the server's `plan_limits` payload and its 403 details are
 * defined by PLT-15 FR-4/FR-5 and may legitimately carry any of them (storage
 * in particular is still enforced on uploads). The client renders whatever
 * limit the server names in a `plan_limit_reached`, and MEASURES only members.
 */
export const PLAN_LIMIT_KEYS = [
  'max_users',
  'max_parties',
  'max_invoices_per_month',
  'storage_mb',
] as const;
export type PlanLimitKey = (typeof PLAN_LIMIT_KEYS)[number];

/** DEC-001 — the one limit the client meters and pre-warns on. */
export const METERED_LIMIT_KEYS: readonly PlanLimitKey[] = ['max_users'];

export interface PlanLimit {
  readonly key: PlanLimitKey;
  /** `null` is UNLIMITED — never `0`, which would mean the feature is off. */
  readonly limit: number | null;
  readonly used: number;
  /** Only the monthly counter carries a period; the others are points in time. */
  readonly periodStart?: string | null;
  readonly periodEnd?: string | null;
}

/** FR-4 — `partner.support_contact`; the only contact route the dialog offers. */
export interface PlanSupportContact {
  readonly phone: string | null;
  readonly whatsapp: string | null;
  readonly email: string | null;
  /** The partner's display name, for "Contact {partner}". */
  readonly name: string | null;
}

/** FR-5 — the `plan_limits` block of `GET /auth/me`. */
export interface PlanEntitlements {
  readonly planCode: string | null;
  readonly limits: readonly PlanLimit[];
  readonly modules: readonly ModuleCode[];
  readonly supportContact: PlanSupportContact;
}

/**
 * FR-4 — the details on a 403 `plan_limit_reached`.
 *
 * NOTE a contract discrepancy, recorded in the sprint report: PLT-15 FR-4
 * documents `{limit_key, limit, used, plan_code, support_contact}`, while Part
 * 22 §22.1.1's registry documents envelope `D limit, current, maximum` for the
 * same code. The parser below accepts BOTH spellings, because the client cannot
 * choose which one the backend ships and dropping the details would leave the
 * dialog saying "limit reached" with no number in it.
 */
export interface PlanLimitHit {
  readonly limitKey: PlanLimitKey | null;
  readonly limit: number | null;
  readonly used: number | null;
  readonly planCode: string | null;
  readonly supportContact: PlanSupportContact;
  readonly message: string;
  readonly requestId: string | null;
}

// ── Wire shapes (snake_case, Part 22 §22.2) ──────────────────────────────────

export interface PlanLimitApiRow {
  readonly limit: number | null;
  readonly used: number;
  readonly period_start?: string | null;
  readonly period_end?: string | null;
}

export interface PlanLimitsApiPayload {
  readonly plan_code?: string | null;
  readonly limits?: Partial<Record<PlanLimitKey, PlanLimitApiRow>>;
  readonly modules?: readonly ModuleCode[];
  readonly support_contact?: {
    readonly phone?: string | null;
    readonly whatsapp?: string | null;
    readonly email?: string | null;
    readonly name?: string | null;
  } | null;
}
