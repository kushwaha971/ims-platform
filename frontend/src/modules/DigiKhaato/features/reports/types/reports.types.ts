import type { PaymentMode } from 'src/types/domain.types';
import type { MoneyString } from 'src/utils/money';

/**
 * RPT-01 / RPT-02 — the client's shapes, camelCased from the wire by the two
 * services. Money stays a decimal STRING end to end (canon rule 3): nothing
 * here is a number that could be summed in floating point.
 */

// ── RPT-01 — the dashboard ──────────────────────────────────────────────────

export interface CountAmount {
  readonly count: number;
  readonly amount: MoneyString;
}

/**
 * FR-2 / §14. Every tile is OPTIONAL: the server omits a tile the reader may
 * not see or whose module is off (FR-6, §10), and the screen renders exactly
 * the tiles it was sent — an absent tile is never drawn as ₹0.
 */
export interface DashboardTiles {
  /**
   * WP-06 DASH-02 — each is the total of the list it opens (customers who owe
   * you; suppliers you owe). `advances` is the money held the other way round
   * in that same list (a customer's advance; a supplier paid ahead), said
   * beside the tile rather than folded into the other one.
   */
  readonly toCollect?: { readonly amount: MoneyString; readonly advances?: MoneyString };
  readonly toPay?: { readonly amount: MoneyString; readonly advances?: MoneyString };
  readonly dueToday?: CountAmount;
  readonly overdue?: CountAmount & { readonly invoices?: AgedCountAmount };
  readonly upcoming7d?: CountAmount;
  readonly todaySales?: {
    readonly amount: MoneyString;
    readonly count: number;
    readonly yesterdayAmount: MoneyString;
  };
  /**
   * The Shop's drawer. `since` is the first day its cash moved (null: none yet;
   * absent: an older server). No opening cash is modelled (WP-06 Finding 4).
   */
  readonly cashInHand?: { readonly amount: MoneyString; readonly since?: string | null };
  /** WP-06 — the Shop's receipts dated today (sales is not cash). */
  readonly todayReceived?: CountAmount;
  /** WP-06 — purchase bills overdue (with the oldest's age) and due this week. */
  readonly supplierBills?: {
    readonly overdue: AgedCountAmount;
    readonly dueWeek: CountAmount;
  };
  readonly lowStock?: { readonly count: number; readonly outCount: number };
  /**
   * WP-06 — orders waiting on someone: customer orders not yet billed, goods out
   * on a challan not yet billed, purchase orders not yet billed by the supplier.
   * `oldestDays` is the oldest one's age and `firstBillDate` its date. Each is
   * present only for a reader who may open its list.
   */
  readonly openOrders?: {
    readonly salesOrders?: AgedCountAmount;
    readonly challans?: AgedCountAmount;
    readonly purchaseOrders?: AgedCountAmount;
  };
}

/** A count and amount with the oldest one's days past due, when any has a due date. */
export interface AgedCountAmount extends CountAmount {
  readonly oldestDays?: number;
  /** The earliest bill date among them (ISO), so their list opens over a range holding all. */
  readonly firstBillDate?: string;
}

/** WP-06 — a supplier the Shop owes, for the Suppliers panel. */
export interface TopCreditor {
  readonly id: string;
  readonly name: string;
  /** What the Shop owes them, as a positive figure. */
  readonly balance: MoneyString;
}

/** Where a row leads (FR-3 "link"). The client builds the path from these. */
export interface SourceRef {
  readonly kind:
    | 'sales_document'
    | 'purchase_document'
    | 'payment'
    | 'expense'
    | 'ledger_entry'
    | 'stock_adjustment';
  readonly id: string;
  readonly partyId: string | null;
}

export interface ActivityItem {
  readonly id: string;
  /** `sale`, `sale_void`, `payment_in`, `manual_got`, `stock_adjustment`, … */
  readonly type: string;
  readonly at: string;
  /** The day the record belongs to (ISO); absent for a void (WP-06 Finding 5). */
  readonly businessDate?: string;
  readonly number: string | null;
  readonly amount: MoneyString | null;
  readonly direction: 'debit' | 'credit' | null;
  readonly party: { readonly id: string; readonly name: string } | null;
  readonly source: SourceRef;
}

export interface TopDebtor {
  readonly id: string;
  readonly name: string;
  readonly balance: MoneyString;
  readonly collectionDate: string | null;
  readonly mobileMasked: string | null;
  /** Present only for a reader who may send the reminder it exists for (§19). */
  readonly mobile: string | null;
}

export interface LowStockRow {
  readonly id: string;
  readonly name: string;
  readonly onHand: string;
  readonly reorderPoint: string | null;
  readonly unit: string;
  readonly stockStatus: 'low' | 'out';
}

export interface FirstUse {
  readonly hasParty: boolean;
  readonly hasItem: boolean;
  readonly hasDocument: boolean;
  readonly hasUpi: boolean;
}

/**
 * A10 — one module's block below the core dashboard, as the server returned it
 * (`apps.reports.registry`). `unavailable` means its selector failed on the
 * server; `data` is then absent and the block shows a retry line.
 */
export interface DashboardSection {
  readonly key: string;
  readonly module: string;
  readonly order: number;
  readonly data: unknown;
  readonly unavailable: boolean;
}

export interface DashboardData {
  readonly asOf: string;
  readonly generatedAt: string;
  readonly cached: boolean;
  readonly tiles: DashboardTiles;
  readonly recentActivity: readonly ActivityItem[];
  readonly topDebtors: readonly TopDebtor[];
  readonly topCreditors: readonly TopCreditor[];
  readonly lowStockItems: readonly LowStockRow[];
  readonly firstUse: FirstUse;
  readonly sections: readonly DashboardSection[];
  /**
   * WP-06 DASH-04 — the server's parts that failed (`party_tiles`, `documents`,
   * `supplier_bills`, `top_debtors`, …). Each panel that owns one says it could
   * not load, with a Retry; absent or empty when everything arrived.
   */
  readonly unavailable?: readonly string[];
}

// ── RPT-02 — the day book ───────────────────────────────────────────────────

/** FR-2's type codes, in the order the filter chips show them. */
export const DAY_BOOK_TYPES = [
  'sale',
  'credit_note',
  'purchase',
  'payment_in',
  'payment_out',
  'expense',
  'manual_gave',
  'manual_got',
  'opening',
  'write_off',
  'reversal',
  'stock_adjustment',
] as const;
export type DayBookType = (typeof DAY_BOOK_TYPES)[number];

/**
 * The chips a merchant actually filters by (FR-4): six groups of FR-2's
 * thirteen codes, because "Payments" is one question with two directions and
 * nobody filters a day book to write-offs alone.
 */
export const DAY_BOOK_TYPE_FILTERS = [
  'sales',
  'purchases',
  'payments',
  'expenses',
  'khata',
  'stock',
] as const;
export type DayBookTypeFilter = (typeof DAY_BOOK_TYPE_FILTERS)[number];

/** The report shell's period presets (RPT-common: presets plus a custom range). */
export type ReportPreset =
  'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'thisFy' | 'lastFy' | 'custom';

export interface CashBank {
  readonly cash: MoneyString;
  readonly bank: MoneyString;
}

export interface DayBookRow {
  readonly id: string;
  /** A `DayBookType`, with `_void` appended for a flagged row (FR-7). */
  readonly type: string;
  readonly void: boolean;
  readonly source: SourceRef;
  readonly date: string;
  readonly time: string;
  /** EC-2 — set only when the line was written on a different day. */
  readonly recordedOn: string | null;
  readonly number: string | null;
  readonly party: { readonly id: string; readonly name: string } | null;
  readonly walkInName: string | null;
  readonly amount: MoneyString | null;
  readonly amountDue: MoneyString | null;
  readonly moneyIn: MoneyString | null;
  readonly moneyOut: MoneyString | null;
  readonly modes: readonly { readonly mode: PaymentMode; readonly amount: MoneyString }[];
  readonly note: string;
  readonly detail: string | null;
  readonly lines: number | null;
  readonly paid: boolean | null;
  readonly reference: string;
  readonly createdBy: { readonly id: string; readonly name: string } | null;
  /** Absent without `reports.financial.read` (`balancesVisible: false`). */
  readonly cashAfter?: MoneyString;
  readonly bankAfter?: MoneyString;
}

export interface DayBookTotals {
  readonly count: Readonly<Partial<Record<DayBookType, number>>>;
  readonly sales: MoneyString;
  readonly creditNotes: MoneyString;
  readonly purchases: MoneyString;
  readonly paymentsIn: MoneyString;
  readonly paymentsOut: MoneyString;
  readonly expenses: MoneyString;
  readonly moneyIn: MoneyString;
  readonly moneyOut: MoneyString;
}

export interface DayBookData {
  readonly rows: readonly DayBookRow[];
  readonly totals: DayBookTotals;
  readonly opening: CashBank | null;
  readonly closing: CashBank | null;
  readonly balancesVisible: boolean;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totalPages: number;
}

export interface DayBookFilters {
  readonly preset: ReportPreset;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly types: readonly DayBookTypeFilter[];
  readonly includeVoid: boolean;
  readonly page: number;
}
