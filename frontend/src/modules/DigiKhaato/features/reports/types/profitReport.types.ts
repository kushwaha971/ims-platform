import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';

import type { TaxPeriodPreset } from './taxReports.types';

/**
 * Shop item 1 — profit by item, customer, category or bill, and the P&L.
 * Money stays a string, as the server sends it.
 */
export type ProfitGroup = 'item' | 'party' | 'category' | 'bill';

/** A column the grid sorts by; the server takes each with or without `-`. */
export type ProfitSortField = 'profit' | 'sale_value' | 'margin' | 'name';
export type ProfitOrdering = ProfitSortField | `-${ProfitSortField}`;

export interface ProfitRow {
  /** Null on the catch-all row: walk-in sales, lines with no item, no category. */
  readonly id: string | null;
  readonly name: string | null;
  readonly qty: string | null;
  readonly unit: string | null;
  readonly date: string | null;
  readonly party: { readonly id: string; readonly name: string } | null;
  readonly bills: number;
  readonly saleValue: string;
  /** Null when nothing in the row has a known cost — never a ₹0.00 claim. */
  readonly cost: string | null;
  readonly profit: string | null;
  readonly marginPct: string | null;
  readonly uncostedLines: number;
}

export interface ProfitTotals {
  readonly bills: number;
  readonly saleValue: string;
  readonly cost: string | null;
  readonly profit: string | null;
  readonly marginPct: string | null;
  readonly uncostedLines: number;
  /** Absent (null) when the expenses module is off — never a zero. */
  readonly expenses: string | null;
  readonly netProfit: string | null;
}

export interface ProfitPage {
  readonly rows: readonly ProfitRow[];
  readonly totals: ProfitTotals;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface ProfitFilters {
  readonly preset: TaxPeriodPreset;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly group: ProfitGroup;
  readonly ordering: ProfitOrdering;
  readonly q: string;
  readonly page: number;
}

export interface ProfitSliceState {
  readonly data: ProfitPage | null;
  readonly query: ProfitFilters | null;
  readonly status: RequestStatus;
  readonly error: ApiErrorShape | null;
}
