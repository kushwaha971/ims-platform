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
  readonly toCollect?: { readonly amount: MoneyString };
  readonly toPay?: { readonly amount: MoneyString };
  readonly dueToday?: CountAmount;
  readonly overdue?: CountAmount & { readonly invoices?: CountAmount };
  readonly upcoming7d?: CountAmount;
  readonly todaySales?: {
    readonly amount: MoneyString;
    readonly count: number;
    readonly yesterdayAmount: MoneyString;
  };
  readonly cashInHand?: { readonly amount: MoneyString };
  readonly lowStock?: { readonly count: number; readonly outCount: number };
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

export interface DashboardData {
  readonly asOf: string;
  readonly generatedAt: string;
  readonly cached: boolean;
  readonly tiles: DashboardTiles;
  readonly recentActivity: readonly ActivityItem[];
  readonly topDebtors: readonly TopDebtor[];
  readonly lowStockItems: readonly LowStockRow[];
  readonly firstUse: FirstUse;
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
