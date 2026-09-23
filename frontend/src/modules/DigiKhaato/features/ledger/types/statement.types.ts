import type { LedgerDirection, LedgerEntryStatus, LedgerEntryType } from './ledger.types';

/**
 * LED-04 §14 — the statement's own wire and domain shapes.
 *
 * A separate file from `ledger.types.ts`, and separate types inside it, because
 * a statement row is NOT a timeline row with one field added. It carries a
 * running balance, which nothing else does, and drops the payment mode, the
 * reference and the author, which a customer reading a shared statement has no
 * business seeing (BR-6). Deriving one from the other would put those three
 * back the first time somebody widened the timeline's shape.
 */

export interface StatementRowApi {
  readonly id: string;
  readonly entry_date: string;
  readonly entry_type: LedgerEntryType;
  readonly direction: LedgerDirection;
  readonly amount: string;
  readonly note: string;
  readonly status: LedgerEntryStatus;
  /** Decimal string, SIGNED. The label carries the direction on screen. */
  readonly running_balance: string;
  readonly source: {
    readonly type: string;
    readonly id: string;
    readonly number: string | null;
    readonly url: string | null;
  } | null;
  readonly reverses_id: string | null;
  readonly supersedes_id: string | null;
  readonly reason: string | null;
}

export interface StatementRow {
  readonly id: string;
  readonly entryDate: string;
  readonly entryType: LedgerEntryType;
  readonly direction: LedgerDirection;
  readonly amount: string;
  readonly note: string;
  readonly status: LedgerEntryStatus;
  /**
   * The balance AFTER this row, signed.
   *
   * Positive means the party owes; negative means the shop does. It is signed
   * here and never on screen — §23.2.6 rule 3 puts the direction in the label —
   * which is why `balanceLabel` in the view-model is the only thing that reads
   * the sign.
   */
  readonly runningBalance: string;
  readonly source: { readonly type: string; readonly id: string; readonly number: string | null } | null;
  readonly reversesId: string | null;
  readonly supersedesId: string | null;
  readonly reason: string | null;
}

/** The three figures above the table, and the two the totals row carries. */
export interface StatementSummary {
  readonly openingBalance: string;
  readonly closingBalance: string;
  readonly totalDebit: string;
  readonly totalCredit: string;
  /**
   * FR-11 / LED-02 BR-3 — there is a row dated before the opening balance.
   *
   * A merchant who typed an opening dated 1 April and then backdated an entry
   * to March has a statement whose first figure is not the whole story, and no
   * arithmetic can tell them so: both numbers are right.
   */
  readonly hasEntriesBeforeOpening: boolean;
}

/** BR-6 — who the statement is about, with the mobile already masked server-side. */
export interface StatementParty {
  readonly id: string;
  readonly name: string;
  readonly mobileMasked: string | null;
}

export interface StatementPeriod {
  /** ISO `YYYY-MM-DD`, or `null` for "from the beginning". */
  readonly from: string | null;
  readonly to: string | null;
}

export interface StatementPage {
  readonly party: StatementParty;
  readonly period: StatementPeriod;
  readonly summary: StatementSummary;
  readonly rows: readonly StatementRow[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

/**
 * The filter, which lives in the URL (FR-8) so the page is linkable.
 *
 * `preset` is not sent to the server — it is what the merchant CHOSE, and it is
 * kept so the chip stays lit after a reload. The dates are what the request
 * carries, because a preset resolved on the client and re-resolved on the
 * server would disagree across midnight.
 */
export type StatementPreset =
  | 'thisMonth'
  | 'lastMonth'
  | 'thisFy'
  | 'lastFy'
  | 'allTime'
  | 'custom';

export interface StatementFilters {
  readonly preset: StatementPreset;
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
  readonly includeCorrections: boolean;
}
