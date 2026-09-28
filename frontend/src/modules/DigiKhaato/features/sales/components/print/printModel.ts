import { sumMoney } from 'src/utils/money';

import { THERMAL_NAME_CHARS } from '../../constants/salesConstants';
import { showsTax } from '../../view-model/invoiceDisplay';

import type { SalesDocument, SalesDocumentLine } from '../../types/sales.types';

/**
 * SAL-03 — the decisions a printed invoice makes, as pure functions so they
 * are tested without a DOM: which tax columns exist (§7.4), the tax summary
 * by rate (§7.6), the watermark (FR-9) and the thermal line budget (FR-11).
 */

export type TaxColumns = 'none' | 'intra' | 'inter';

/** §7.4 — inter hides CGST/SGST, intra hides IGST, a tax-free document hides all. */
export const taxColumns = (doc: SalesDocument): TaxColumns => {
  if (!showsTax(doc)) return 'none';
  return doc.isInterState ? 'inter' : 'intra';
};

export const hasCess = (doc: SalesDocument): boolean => doc.cessTotal !== '0.00';

export interface TaxSummaryRow {
  readonly rate: string;
  readonly taxable: string;
  readonly cgst: string;
  readonly sgst: string;
  readonly igst: string;
  readonly cess: string;
}

/** §7.6 — one row per distinct rate, in ascending rate order. */
export const taxSummary = (lines: readonly SalesDocumentLine[]): TaxSummaryRow[] => {
  const groups = new Map<string, SalesDocumentLine[]>();
  lines.forEach((line) => {
    const key = line.taxRate;
    groups.set(key, [...(groups.get(key) ?? []), line]);
  });
  return [...groups.entries()]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([rate, rows]) => ({
      rate,
      taxable: sumMoney(rows.map((r) => r.taxableValue)),
      cgst: sumMoney(rows.map((r) => r.cgst)),
      sgst: sumMoney(rows.map((r) => r.sgst)),
      igst: sumMoney(rows.map((r) => r.igst)),
      cess: sumMoney(rows.map((r) => r.cess)),
    }));
};

export type Watermark = 'draft' | 'void' | null;

/** FR-9 — a draft is "DRAFT — not valid" with no number; a void says VOID. */
export const watermark = (doc: SalesDocument): Watermark =>
  doc.status === 'draft' ? 'draft' : doc.status === 'void' ? 'void' : null;

export const isPaidStamp = (doc: SalesDocument): boolean => doc.status === 'paid';

/** EC-3 — thermal names truncate at 28 characters with an ellipsis. */
export const thermalName = (name: string): string =>
  name.length > THERMAL_NAME_CHARS ? `${name.slice(0, THERMAL_NAME_CHARS - 1)}…` : name;

/** "12.000" → "12"; "0.250" → "0.25" — a rate as a person writes it. */
export const rateLabel = (rate: string): string => String(Number(rate));

/** A rate with a percent sign, for the columns and the summary. */
export const pct = (rate: string): string => `${rateLabel(rate)}%`;

/** The line's gross (qty × rate) is printed per line (Rule 46 "total value"). */
export const trimQty = (qty: string): string => String(Number(qty));
