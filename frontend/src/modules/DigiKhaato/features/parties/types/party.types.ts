import type { PageMeta } from 'src/types/api.types';
import type { PartyStatus } from 'src/types/domain.types';

import type { PartyListTotals, PartyTotalsScope } from '../constants/partyListDefaults';

/**
 * Part 19 §19.2.3 — the feature's own types. Money is a STRING here and
 * everywhere below it (R-TS-7): `balance` is `numeric(14,2)` server-side and
 * turning it into a JS number at the boundary is how rounding bugs get in.
 *
 * Sprint 0's walking skeleton (Part 32 S0-71) reads the list and nothing else;
 * PTY-02 proper is Sprint 3 and grows these shapes rather than replacing them.
 */

/** The wire row, snake_case, exactly as Part 22 §22.4 documents it. */
export interface PartyApiRow {
  readonly id: string;
  readonly name: string;
  readonly display_code: string | null;
  readonly mobile: string | null;
  readonly is_customer: boolean;
  readonly is_supplier: boolean;
  readonly balance: string;
  readonly status: PartyStatus;
  readonly last_activity_at: string | null;
}

export interface Party {
  readonly id: string;
  readonly name: string;
  readonly displayCode: string | null;
  readonly mobile: string | null;
  readonly isCustomer: boolean;
  readonly isSupplier: boolean;
  /** Decimal string. Positive: they owe the merchant. */
  readonly balance: string;
  readonly status: PartyStatus;
  readonly lastActivityAt: string | null;
}

export interface PartyListParams {
  readonly q: string;
  readonly status: PartyStatus;
  readonly ordering: string;
  readonly page: number;
  readonly pageSize: number;
}

/** Committed filter values — never the raw search input (§19.3.1). */
export type PartyListFilters = PartyListParams;

export interface PartyListResult {
  readonly rows: readonly Party[];
  readonly meta: PageMeta;
  /**
   * Which set `totals` describes. The service decides it, because the service
   * is the only place that knows whether the server sent figures or the page
   * had to be summed — and the header says it out loud to the merchant.
   */
  readonly totalsScope: PartyTotalsScope;
  /**
   * The two header figures for the WHOLE filtered set, when the server sends
   * them (Part 22 §22.4 `meta.totals_*`). `null` means it did not, and the
   * slice falls back to summing the page it has — which is the honest thing a
   * client can do, and is stated as such on the screen rather than passed off
   * as a business total.
   */
  readonly totals: PartyListTotals | null;
}

// ── PTY-01 — what a create or an edit sends ─────────────────────────────────

/**
 * The form's own shape, camelCase, with money and dates as strings.
 *
 * Deliberately NOT `Partial<Party>`: the list row and the form have different
 * fields for a reason — `balance` is on the row and can never be written, and
 * the opening balance is on the form and never comes back as a row. Deriving
 * one from the other would tie them together and the first divergence would be
 * a silent one.
 */
export interface PartyFormValues {
  readonly name: string;
  /**
   * `string | null` on the optional text fields, and that is the schema's
   * doing rather than a convenience.
   *
   * The central validators transform `''` to `null` before they check, because
   * Yup's `.matches()` skips `undefined` and NOT the empty string — which is
   * how `mobileValidation(false)` once rejected a field the merchant had simply
   * left alone. So the value React Hook Form hands the submit handler is
   * genuinely nullable, and typing it `string` here would be a lie the compiler
   * would then help us tell. The inputs read `?? ''`; the wire body drops
   * nulls.
   */
  readonly mobile: string | null;
  readonly isCustomer: boolean;
  readonly isSupplier: boolean;
  readonly displayCode: string;
  readonly altPhone: string | null;
  readonly email: string | null;
  readonly gstin: string | null;
  readonly stateCode: string;
  readonly billingLine1: string;
  readonly billingCity: string;
  readonly billingPincode: string | null;
  readonly notes: string;
  /** Decimal string. Never a number (R-TS-7). */
  readonly creditLimit: string | null;
  readonly creditDays: string;
  /** ISO `YYYY-MM-DD` or empty. */
  readonly collectionDate: string;
  readonly smsOptIn: boolean;
  readonly consentSource: string;
  /** Create only. The server stores it and posts nothing until LED-02. */
  readonly openingAmount: string | null;
  readonly openingDirection: 'debit' | 'credit';
  readonly openingAsOf: string;
}

/** The full record a create or an edit returns, and a detail read will too. */
export interface PartyDetail extends Party {
  readonly altPhone: string | null;
  readonly email: string | null;
  readonly gstin: string | null;
  readonly gstRegistration: string;
  readonly stateCode: string | null;
  readonly notes: string;
  readonly collectionDate: string | null;
  readonly creditLimit: string | null;
  readonly creditDays: number | null;
  readonly smsOptIn: boolean;
  readonly consentSource: string | null;
  readonly billingAddress: Readonly<Record<string, string>>;
  readonly openingAmount: string | null;
  readonly openingDirection: string | null;
  readonly openingAsOf: string | null;
}

/**
 * A non-blocking note from the server — today only `gstin_state_mismatch`.
 *
 * It rides in `meta.warnings[]` beside a 201 or a 200, which is the whole
 * point: the record saved. A warning modelled as an error would have made the
 * form refuse a Maharashtra supplier delivering to Karnataka.
 */
export interface PartyWarning {
  readonly code: string;
  readonly field?: string;
  readonly gstinStateCode?: string;
  readonly stateCode?: string;
}

export interface PartySaveResult {
  readonly party: PartyDetail;
  readonly warnings: readonly PartyWarning[];
}
