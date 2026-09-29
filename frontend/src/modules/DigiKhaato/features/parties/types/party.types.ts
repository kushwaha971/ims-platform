import type { PageMeta } from 'src/types/api.types';
import type { PartyStatus } from 'src/types/domain.types';

import type {
  PartyBalanceFilter,
  PartyCreditFilter,
  PartyCollectionFilter,
  PartyTypeFilter,
} from '../constants/partyFilters';
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
  /**
   * PTY-05. Optional on the WIRE and required in the domain, which is the whole
   * job of this pair of types: a server older than this client sends no key,
   * and `toParty` turns that into an empty array so nothing downstream has to
   * ask whether the absence means "untagged" or "unknown". It means untagged.
   */
  readonly tags?: readonly {
    readonly id: string;
    readonly name: string;
    readonly color: string | null;
  }[];
}

/**
 * PTY-05 — a label a merchant puts on parties.
 *
 * `color` is presentational only (BR-10) and never the only signal: every chip
 * carries its name, and the palette is fixed so that a merchant cannot pick an
 * unreadable one.
 */
export interface PartyTag {
  readonly id: string;
  readonly name: string;
  /** `#RRGGBB` from the fixed palette, or null for no colour. */
  readonly color: string | null;
}

/** A tag in the manager, where how many parties carry it is the point. */
export interface PartyTagWithCount extends PartyTag {
  /** Excludes archived parties (BR-9) — they are not parties to act on. */
  readonly partyCount: number;
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
  readonly tags: readonly PartyTag[];
}

export interface PartyListParams {
  readonly q: string;
  readonly status: PartyStatus;
  /**
   * PTY-02's three chip filters, `''` when not applied.
   *
   * `status` is separate and always sent, because it is not a chip: BR-4 makes
   * it a partition of the book rather than a narrowing of it — there is no
   * request that spans active and archived, and a total that did would be
   * adding back money the merchant deliberately set aside.
   */
  readonly type: PartyTypeFilter;
  readonly balance: PartyBalanceFilter;
  readonly collection: PartyCollectionFilter;
  /**
   * PTY-05 FR-6 — a comma list of tag NAMES, OR'd within the group and AND'ed
   * against every other filter (BR-4).
   *
   * Names rather than ids because the filter is shareable and readable, and
   * because a name is what the chip shows. An unknown name matches nothing
   * rather than erroring, so a tag somebody else deleted narrows the list
   * instead of breaking the screen.
   */
  readonly tag: string;
  /** PTY-06 FR-12 — `over`, `near`, `ok`, or '' for every party. */
  readonly credit: PartyCreditFilter;
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
  /**
   * PTY-06 FR-12 — how many of the matched parties are past their credit limit,
   * or `null` when the server did not count.
   *
   * The two are different states and the chip treats them the same way, which
   * is fine: zero means "nobody is over" and null means "this server does not
   * count", and neither is a reason to draw a control whose only outcome is an
   * empty list.
   */
  readonly overLimit: number | null;
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
  /**
   * PTY-05 — tag NAMES, not ids, and the set is REPLACED on save.
   *
   * Names because the picker creates inline: a merchant who types "Route 2" and
   * presses Create should not need a round trip to turn it into an id before
   * the form can be saved, and the server's `get_or_create` makes the two the
   * same thing. The tag row is created inside the party's own transaction, so a
   * save that fails leaves no orphan tag behind.
   *
   * Replaced and not merged, because the form shows the COMPLETE set the
   * merchant can see: anything missing from it was taken off on purpose.
   *
   * A MUTABLE array, alone among these fields, and not by preference: Yup
   * cannot describe a `readonly` array, so `ObjectSchema<PartyFormValues>`
   * simply does not typecheck with one. These are React Hook Form's working
   * values rather than a domain object — the domain's `Party.tags` is readonly
   * as R-TS-5 requires — so the looser type stops at the form's edge.
   */
  readonly tags: string[];
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
  /** ISO timestamp. PTY-03 FR-11's "added on" in the info panel's Meta block. */
  readonly createdAt: string;
  /**
   * A2 (PLT-X01 §6) — the loan part of the balance, and the shop part beside it
   * (`balance − loanBalance`). Decimal strings, SIGNED like the balance. ABSENT — not
   * "0.00" — unless there is a loan or a module that lends is switched on: a figure
   * that is always zero is a claim the server cannot verify (the PTY-03 rule).
   */
  readonly loanBalance?: string;
  readonly tradeBalance?: string;
  /** A2 — money held for the party and returnable; never part of the balance. */
  readonly depositHeld?: string;
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

// ── PTY-03 — the khata page ─────────────────────────────────────────────────

/**
 * The header's figures.
 *
 * One field today. FRD PTY-03 §14 specifies seven, and the other six are about
 * ledger entries, invoices and payments — the `ledger` app has no models, so
 * the server omits them rather than sending zeros a client would render as
 * facts. This interface grows when they arrive; it does not carry optional
 * placeholders in the meantime, because an optional field invites a `?? 0` at
 * the call site and that is the placeholder again, one layer down.
 */
export interface PartySummary {
  /** Decimal string. Positive: they owe the merchant. */
  readonly balance: string;
}

/**
 * The credit block, or `null` when the party has no limit.
 *
 * `null` rather than a shape of nulls, so the question "does this party have a
 * credit limit" is answered by the block's presence and not by picking through
 * its fields.
 */
/** `off` hides the bar; `warn` and `block` differ only in what a WRITE does. */
export type CreditMode = 'off' | 'warn' | 'block';

/** The same three words the list's `credit` filter takes. */
export type CreditStatus = 'over' | 'near' | 'ok';

/**
 * PTY-06 — the credit block, present only when the party has a limit.
 *
 * `used` became `exposure` here, and the rename is the feature's own word: FR-4
 * defines exposure and the whole rule reasons in it. "Used" reads like a count
 * of something spent; what the number is is how much of the merchant's money is
 * standing out with this party right now.
 *
 * Every figure is a decimal STRING (R-TS-7) except `usagePct`, which is an
 * integer the server computed with `Decimal`. It arrives rather than being
 * derived here on purpose: dividing two floats parsed from decimal strings is
 * what canon rule 3 forbids, and a client that recomputed it would eventually
 * disagree with the caption beside it by a point.
 */
export interface PartyCredit {
  readonly limit: string;
  /** Payment terms in days. No effect on the limit check (FR-15). */
  readonly days: number | null;
  /** The balance floored at zero — a party in credit is using none of it (BR-3). */
  readonly exposure: string;
  /** Floored too: "available" is money that can still be lent. */
  readonly available: string;
  /** Zero unless they are past the limit; the caption reads this, never a minus. */
  readonly overBy: string;
  /** Clamped to 999 for the bar (BR-11); the rupees beside it are never clamped. */
  readonly usagePct: number | null;
  readonly mode: CreditMode;
  readonly status: CreditStatus;
}

/** `GET /parties/{id}/credit-check` — advisory, and it refuses nothing (FR-8). */
export interface CreditCheck {
  readonly status: 'ok' | 'warn' | 'block';
  readonly mode: CreditMode;
  readonly limit: string | null;
  readonly exposureBefore: string;
  readonly exposureAfter: string;
  readonly availableBefore: string | null;
  readonly overBy: string;
  /**
   * Whether THIS actor may go over the limit — a check on the role rather than
   * a codename (BR-8), which is why it comes from the server. A client working
   * it out from permissions would be re-implementing a governance rule and
   * drawing a button the server is going to refuse.
   */
  readonly canOverride: boolean;
}

export interface PartyDetailResult {
  readonly party: PartyDetail;
  readonly summary: PartySummary;
  readonly credit: PartyCredit | null;
}
