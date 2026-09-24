import type { PaymentMode, UpiApp } from 'src/types/domain.types';

import type { ExpensePreset } from './expense.types';

/**
 * EXP-03 — the cashbook's wire shapes, camelCased.
 *
 * `Figures` carries ONLY the buckets the server was asked for: a staff member
 * scoped to the till is sent `{ cash, total }` and no bank figure at all,
 * because a zero where the real number was withheld would be a false
 * statement about the bank.
 */
export type CashBucket = 'cash' | 'bank';
export type CashbookBucketFilter = 'all' | CashBucket;

export interface CashFigures {
  readonly cash?: string;
  readonly bank?: string;
  readonly total: string;
}

export interface CashRow {
  readonly id: string;
  readonly sourceType: 'expense' | 'ledger_entry' | string;
  readonly sourceId: string;
  readonly date: string;
  readonly at: string;
  readonly direction: 'in' | 'out';
  readonly mode: PaymentMode;
  readonly upiApp: UpiApp | null;
  readonly bucket: CashBucket;
  readonly amount: string;
  readonly party: { readonly id: string; readonly name: string } | null;
  readonly category: { readonly id: string; readonly name: string; readonly color: string } | null;
  readonly number: string | null;
  readonly reference: string;
  readonly note: string;
  readonly runningAfter: CashFigures;
}

export interface CashDay {
  readonly date: string;
  readonly opening: CashFigures;
  readonly in: CashFigures;
  readonly out: CashFigures;
  readonly closing: CashFigures;
  readonly voidedCount: number;
  readonly rows: readonly CashRow[];
}

export interface CashbookData {
  readonly range: {
    readonly dateFrom: string;
    readonly dateTo: string;
    readonly opening: CashFigures;
    readonly in: CashFigures;
    readonly out: CashFigures;
    readonly closing: CashFigures;
  };
  readonly days: readonly CashDay[];
  readonly byCategory: readonly {
    readonly id: string;
    readonly name: string;
    readonly color: string;
    readonly amount: string;
  }[];
  readonly buckets: readonly CashBucket[];
  /** `today_cash` for a member without `reports.financial.read` (FR-13). */
  readonly scope: 'full' | 'today_cash';
}

export interface CashbookFilters {
  readonly preset: ExpensePreset;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly bucket: CashbookBucketFilter;
}
