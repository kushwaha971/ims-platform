/**
 * LED-09 §14 — the aging report's shapes.
 *
 * A balance says what a customer owes; aging says how long they have owed it,
 * and that is the number a shopkeeper acts on. ₹1,200 that is four months old
 * is a different problem from ₹1,200 from last week, and only the first one
 * gets a phone call.
 */

/** The four buckets, youngest first. The ORDER is the age order. */
export const AGING_BUCKETS = ['0_30', '31_60', '61_90', '90_plus'] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

/** Receivable is money owed TO the shop; payable is money the shop owes. */
export type AgingKind = 'receivable' | 'payable';

export type AgingAmounts = Readonly<Record<AgingBucket | 'total', string>>;

export interface AgingRowApi extends Record<string, unknown> {
  readonly party: { readonly id: string; readonly name: string };
}

export interface AgingRow {
  readonly partyId: string;
  readonly partyName: string;
  /** Decimal strings, always. A bucket is money (R-TS-7). */
  readonly amounts: AgingAmounts;
}

export interface AgingPage {
  readonly rows: readonly AgingRow[];
  readonly totals: AgingAmounts;
  readonly asOf: string;
  readonly kind: AgingKind;
  /**
   * BR-6 — when the figures were last computed, or `null` for "just now".
   *
   * Always `null` today: the nightly snapshot lands in `reports_snapshot`,
   * which Part 21 does not have a table for (CR-106). The key is in the shape
   * so the day it arrives is a caption rather than a response change.
   */
  readonly cachedAt: string | null;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

/** FR-1 / BR-1 — the tenant's position, in two numbers. */
export interface LedgerSummary {
  readonly receivable: string;
  readonly payable: string;
}

export interface AgingFilters {
  readonly kind: AgingKind;
  /** ISO `YYYY-MM-DD`. Defaults to the TENANT's today, never the device's. */
  readonly asOf: string;
  readonly tag: string | null;
  readonly ordering: string;
  readonly page: number;
}
