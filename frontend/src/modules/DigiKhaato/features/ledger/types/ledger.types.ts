import type { PaymentMode, UpiApp } from 'src/types/domain.types';

/**
 * Part 19 §19.2.3 — the ledger feature's own types.
 *
 * Money is a STRING here and everywhere below it (R-TS-7): `amount` is
 * `numeric(14,2)` server-side and turning it into a JS number at the boundary
 * is how rounding bugs get in.
 *
 * `direction` is the merchant's question — did I give or did I get — and it is
 * what the client sends. `entryType` is the ledger's answer (`manual_gave` /
 * `manual_got`) and the server derives it. The two are kept separate on purpose:
 * twelve more entry types arrive with invoices, payments and corrections, and
 * every one of them is still one of two directions.
 */

/** Canon §0.2. `debit`: they owe more. `credit`: they owe less. */
export type LedgerDirection = 'debit' | 'credit';

/**
 * Part 21 §21.3.4's full vocabulary. LED-01 writes two of them and the timeline
 * has to render all fourteen, because a row posted by a future invoice will
 * arrive in this same list — and a client that only knew its own two would draw
 * a blank label beside a real amount.
 */
export type LedgerEntryType =
  | 'opening'
  | 'manual_gave'
  | 'manual_got'
  | 'invoice'
  | 'credit_note'
  | 'purchase_bill'
  | 'debit_note'
  | 'payment_in'
  | 'payment_out'
  | 'expense'
  | 'write_off'
  | 'interest'
  | 'reversal'
  | 'correction'
  /* A2 (ADR-048) — posted by the engines and verticals: a non-document amount owed
     (a fine, a fee, a due in ledger mode), and a reduction of what is owed with no
     money moving (a waiver, a discount). */
  | 'charge'
  | 'adjustment_credit';

/**
 * A2 (ADR-043) — which kind of money a line is. `main` is the trade khata and every
 * line a shop writes; `loan` is lending's, and is in the balance; `deposit` is money
 * HELD for the party and returnable, and is never in the balance.
 */
export type LedgerBucket = 'main' | 'loan' | 'deposit';

export type LedgerSourceType =
  'manual' | 'sales_document' | 'purchase_document' | 'payment' | 'expense' | 'ledger_entry';

/** Canon §0.7 — two values, never a third. A line is standing or it was undone. */
export type LedgerEntryStatus = 'posted' | 'reversed';

/** Who wrote the line (FR-8). Null for an entry a job posted. */
export interface LedgerEntryAuthor {
  readonly id: string;
  readonly name: string;
}

/** The wire row, snake_case, exactly as Part 22 §22.5 documents it. */
export interface LedgerEntryApiRow {
  readonly id: string;
  readonly party_id: string;
  readonly direction: LedgerDirection;
  readonly amount: string;
  readonly entry_date: string;
  readonly entry_type: LedgerEntryType;
  readonly source_type: LedgerSourceType;
  readonly source_id: string | null;
  readonly note: string;
  readonly payment_mode: PaymentMode | null;
  /** Absent from rows written before the column existed; treat as null. */
  readonly upi_app?: UpiApp | null;
  readonly reference: string;
  readonly status: LedgerEntryStatus;
  readonly reversed_by_id: string | null;
  readonly reverses_id: string | null;
  readonly supersedes_id: string | null;
  readonly reason: string | null;
  readonly created_by: { readonly id: string; readonly name: string } | null;
  readonly created_at: string;
  /**
   * CR-027 — the balance AFTER this row, signed debit-positive like the
   * statement's. On `GET /parties/{id}/ledger-entries` rows only: a 201, a
   * correction's 200 and the detail read are one row out of its ordering and
   * carry none. Optional so an older server reads as "not known".
   */
  readonly running_balance?: string | null;
  /** A2 — additive; absent from an older server, which reads as `main`. */
  readonly bucket?: LedgerBucket;
  /** CR-027 / LED-10 FR-5 — the document link; `null` for every manual row. */
  readonly source?: {
    readonly type: string;
    readonly id: string;
    readonly number: string | null;
    readonly status?: string | null;
    readonly kind?: string | null;
  } | null;
}

export interface LedgerEntry {
  readonly id: string;
  readonly partyId: string;
  readonly direction: LedgerDirection;
  /** Decimal string, always positive. Direction carries the sign. */
  readonly amount: string;
  /** ISO `YYYY-MM-DD`. The BUSINESS date (BR-5), not when it was typed. */
  readonly entryDate: string;
  readonly entryType: LedgerEntryType;
  readonly sourceType: LedgerSourceType;
  readonly sourceId: string | null;
  readonly note: string;
  readonly paymentMode: PaymentMode | null;
  /** Only ever set when `paymentMode` is `upi`. */
  readonly upiApp: UpiApp | null;
  readonly reference: string;
  readonly status: LedgerEntryStatus;
  readonly reversedById: string | null;
  readonly reversesId: string | null;
  readonly supersedesId: string | null;
  readonly reason: string | null;
  readonly createdBy: LedgerEntryAuthor | null;
  /** ISO timestamp. Orders ties within a day, and dates the "Backdated" tag. */
  readonly createdAt: string;
  /**
   * CR-027 / PTY-03 FR-6 — the party's balance after this row, from the
   * server's window function; never computed here (BR-10). Decimal string,
   * signed debit-positive: negative means the merchant owes the party.
   *
   * ABSENT on a row the client spliced in from a 201 or a correction — those
   * responses carry no running balance — until the refetch NEW-2 fires replaces
   * it. Absent means "not known", which the row renders as no caption at all.
   */
  readonly runningBalance?: string | null;
  /**
   * LED-10 FR-5 — the document this line came from (an invoice, a receipt, an
   * expense), resolved by the server with its number and current status.
   * Absent on a manual line and on a row spliced in from a 201.
   */
  readonly source?: LedgerEntrySource;
  /** A2 — absent reads as `main` (an older server, a fixture, a row spliced from a 201). */
  readonly bucket?: LedgerBucket;
}

export interface LedgerEntrySource {
  readonly type: string;
  readonly id: string;
  readonly number: string | null;
  readonly status: string | null;
  readonly kind: string | null;
}

/**
 * The form's own shape. Money and dates are strings; `direction` is a control.
 *
 * Deliberately not `Partial<LedgerEntry>`: the form has six fields and the row
 * has eighteen, and every one of the twelve is the server's to decide. Deriving
 * one from the other would let a field the client must never send drift into
 * the body the day somebody spreads the form values.
 */
export interface LedgerEntryFormValues {
  readonly direction: LedgerDirection;
  /** Decimal string. Never a number (R-TS-7). */
  readonly amount: string;
  readonly entryDate: string;
  readonly note: string;
  /** Required when `direction` is `credit`; ignored by the server otherwise. */
  readonly paymentMode: PaymentMode | '';
  /** Which UPI app, when the mode is `upi`; optional even then. */
  readonly upiApp: UpiApp | '';
  readonly reference: string;
}

/**
 * The three figures the khata header shows above the timeline.
 *
 * They arrive on the TIMELINE's first page rather than on the party detail,
 * because `parties` may not import `ledger` server-side (Part 20 §20.1.4) and
 * this is a request the page makes anyway. `null` means this response did not
 * carry them — page two and after omit them, because they do not change as the
 * merchant scrolls.
 */
export interface LedgerSummary {
  /** "You gave in all" — debits EXCLUDING write-offs (opening debits count). */
  readonly totalDebit: string;
  /** "You got in all" — credits EXCLUDING write-offs (opening credits count). */
  readonly totalCredit: string;
  /**
   * CR-2026-09-24-A — the write-off rows, by direction, which are neither gave
   * nor got (LED-11 §8). Optional so a fixture or an older server without the
   * key reads as "nothing written off" rather than as a type error.
   */
  readonly writtenOff?: WrittenOffTotals;
  readonly entryCount: number;
}

/**
 * The write-off rows' totals, split by direction rather than netted.
 *
 * `credit` is a receivable forgiven (the party owed, and will not pay);
 * `debit` is a payable forgiven. Together with gave and got they reconcile:
 * `opening + gave − got + debit − credit = closing`. The server carries the
 * components and never the net (CR-125).
 */
export interface WrittenOffTotals {
  readonly debit: string;
  readonly credit: string;
}

export interface LedgerPage {
  readonly rows: readonly LedgerEntry[];
  /** Opaque. `null` when there is nothing after this page. */
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
  readonly summary: LedgerSummary | null;
}

/**
 * A non-blocking note beside a 201 — today only `credit_limit_exceeded`.
 *
 * It rides in `meta.warnings[]`, which is the whole point: the entry SAVED. The
 * merchant handed over the goods before they opened the drawer, and refusing to
 * record that does not un-hand them; it only means the book does not say so.
 */
export interface LedgerWarning {
  readonly code: string;
  readonly limit: string | null;
  readonly balanceAfter: string;
  readonly overBy: string;
}

export interface LedgerEntryPostResult {
  readonly entry: LedgerEntry;
  /**
   * The party's balance AFTER this entry, as this transaction computed it.
   *
   * FR-3 replaces the header figure from here rather than refetching, and the
   * distinction matters: a second read a moment later can pick up somebody
   * else's entry and show the merchant a number that was never true of the
   * action they just took.
   */
  readonly balance: string;
  readonly warnings: readonly LedgerWarning[];
}

/**
 * LED-03 §10 — what a correction may change.
 *
 * Every field optional except `reason`, and that asymmetry IS the feature. The
 * drawer opens on the original's values and the merchant changes one of them,
 * so a body carrying `{amount, reason}` means "everything else as it was"; the
 * server fills the rest from the row being corrected. Sending the whole form
 * back would work too, and would silently re-assert five fields the merchant
 * never looked at — which is how a correction to an amount quietly clears a
 * reference somebody else typed.
 *
 * `reason` is required because the reason is the point. The row that survives
 * says WHAT changed; without a reason nothing says why, and "why" is the
 * question an accountant arrives with a year later.
 */
export interface LedgerCorrectionValues {
  readonly direction?: LedgerDirection;
  readonly amount?: string;
  readonly entryDate?: string;
  readonly note?: string;
  readonly paymentMode?: PaymentMode | '';
  readonly upiApp?: UpiApp | '';
  readonly reference?: string;
  readonly reason: string;
}

/** The correction drawer's own form shape — every field present, like any RHF form. */
export interface LedgerCorrectionFormValues {
  readonly direction: LedgerDirection;
  readonly amount: string;
  readonly entryDate: string;
  readonly note: string;
  readonly paymentMode: PaymentMode | '';
  readonly upiApp: UpiApp | '';
  readonly reference: string;
  readonly reason: string;
}

/**
 * The answer to a reverse or a correct.
 *
 * `entry` is the row that is now STANDING — the reversal for a reverse, the
 * replacement for a correct — because that is what the timeline puts where the
 * old row was. `originalId` and `reversalId` are what the slice needs to mark
 * the old row struck through and to drop the reversal in without a refetch.
 */
export interface LedgerCorrectionResult {
  readonly entry: LedgerEntry;
  readonly balance: string;
  readonly originalId: string;
  readonly reversalId: string;
}
