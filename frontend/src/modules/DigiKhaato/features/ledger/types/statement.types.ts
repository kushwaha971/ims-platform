import type {
  LedgerBucket,
  LedgerDirection,
  LedgerEntryStatus,
  LedgerEntryType,
  WrittenOffTotals,
} from './ledger.types';

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
    /** A4b — present (true) only on the lines of a deposit ADJUSTMENT. */
    readonly adjustment?: boolean;
  } | null;
  readonly reverses_id: string | null;
  readonly supersedes_id: string | null;
  readonly reason: string | null;
  /** A2 — additive; absent from an older server, which reads as `main`. */
  readonly bucket?: LedgerBucket;
}

/**
 * A2 (PLT-X01 §6) — one line of the statement's "Deposit held" block. A statement row
 * without a running balance: a deposit is outside the running balance by definition.
 */
export type StatementDepositRowApi = Omit<StatementRowApi, 'running_balance'>;

/** `meta.deposit` — present only when the period has a deposit line. */
export interface StatementDepositApi {
  readonly rows: readonly StatementDepositRowApi[];
  /** Decimal string: what was held at the period's end. */
  readonly held: string;
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
  readonly source: {
    readonly type: string;
    readonly id: string;
    readonly number: string | null;
    /** A4b — the line of a deposit adjustment (see `entryAmountView`). */
    readonly adjustment?: true;
  } | null;
  readonly reversesId: string | null;
  readonly supersedesId: string | null;
  readonly reason: string | null;
  /** A2 — absent reads as `main`. */
  readonly bucket?: LedgerBucket;
}

/** A deposit line: a statement row with no running balance (A2). */
export type StatementDepositRow = Omit<StatementRow, 'runningBalance'>;

/**
 * A2 — the "Deposit held" block beneath the table: the period's deposit lines and what
 * was held at its end. Never part of the running balance or the closing above it.
 */
export interface StatementDeposit {
  readonly rows: readonly StatementDepositRow[];
  readonly held: string;
}

/** The three figures above the table, and the two the totals row carries. */
export interface StatementSummary {
  readonly openingBalance: string;
  readonly closingBalance: string;
  /** "You gave" over the period — excludes write-offs (CR-2026-09-24-A). */
  readonly totalDebit: string;
  /** "You got" over the period — excludes write-offs. */
  readonly totalCredit: string;
  /** The period's write-offs, by direction. Absent reads as none. */
  readonly writtenOff?: WrittenOffTotals;
  /**
   * FR-11 / LED-02 BR-3 — there is a row dated before the opening balance.
   *
   * A merchant who typed an opening dated 1 April and then backdated an entry
   * to March has a statement whose first figure is not the whole story, and no
   * arithmetic can tell them so: both numbers are right.
   */
  readonly hasEntriesBeforeOpening: boolean;
  /**
   * A2 — the "Deposit held" block. Absent when the period has no deposit line, which
   * is every statement a shop without deposits has ever printed.
   */
  readonly deposit?: StatementDeposit;
}

/** BR-6 — who the statement is about, with the mobile already masked server-side. */
export interface StatementParty {
  readonly id: string;
  readonly name: string;
  readonly mobileMasked: string | null;
}

/**
 * UAT D3 — the print sheet's letterhead, from `GET /tenants/current`.
 *
 * The shop's NAME is not here: the session already has it and it is on the
 * sheet before this arrives. Each field is absent (`null` / `[]`) rather than
 * blank when the merchant has not filled it in, so the sheet prints no line
 * for it — an empty "GSTIN" line reads as an unregistered business.
 */
export interface StatementShop {
  readonly addressLines: readonly string[];
  readonly phone: string | null;
  readonly gstin: string | null;
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
  'thisMonth' | 'lastMonth' | 'thisFy' | 'lastFy' | 'allTime' | 'custom';

export interface StatementFilters {
  readonly preset: StatementPreset;
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
  readonly includeCorrections: boolean;
}
