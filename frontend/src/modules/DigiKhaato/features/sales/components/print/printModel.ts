import { sumMoney } from 'src/utils/money';
import { sumQuantities, trimQuantity } from 'src/utils/quantity';

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

export interface HsnSummaryRow {
  readonly hsn: string;
  readonly rate: string;
  readonly taxable: string;
  readonly cgst: string;
  readonly sgst: string;
  readonly igst: string;
  readonly cess: string;
  readonly tax: string;
}

/**
 * The HSN/SAC-wise tax summary a standard Indian GST invoice carries (Tally,
 * Zoho and Vyapar all print it): one row per HSN/SAC and rate, in the order
 * the codes first appear, with the total tax of each. A line with no code is
 * grouped under "—".
 */
export const hsnSummary = (lines: readonly SalesDocumentLine[]): HsnSummaryRow[] => {
  const groups = new Map<string, SalesDocumentLine[]>();
  lines.forEach((line) => {
    const key = `${line.hsnSac || '—'}|${line.taxRate}`;
    groups.set(key, [...(groups.get(key) ?? []), line]);
  });
  return [...groups.entries()].map(([key, rows]) => {
    const [hsn = '—', rate = '0'] = key.split('|');
    const cgst = sumMoney(rows.map((r) => r.cgst));
    const sgst = sumMoney(rows.map((r) => r.sgst));
    const igst = sumMoney(rows.map((r) => r.igst));
    const cess = sumMoney(rows.map((r) => r.cess));
    return {
      hsn,
      rate,
      taxable: sumMoney(rows.map((r) => r.taxableValue)),
      cgst,
      sgst,
      igst,
      cess,
      tax: sumMoney([cgst, sgst, igst, cess]),
    };
  });
};

/** The column totals of the line table: quantity is summed only when every line shares a unit. */
export const lineTotals = (
  lines: readonly SalesDocumentLine[]
): {
  readonly qty: string | null;
  readonly taxable: string;
  readonly cgst: string;
  readonly sgst: string;
  readonly igst: string;
  readonly cess: string;
  readonly total: string;
} => {
  const units = new Set(lines.map((line) => line.unitCode));
  const qty = units.size === 1 ? trimQuantity(sumQuantities(lines.map((line) => line.qty))) : null;
  return {
    qty,
    taxable: sumMoney(lines.map((r) => r.taxableValue)),
    cgst: sumMoney(lines.map((r) => r.cgst)),
    sgst: sumMoney(lines.map((r) => r.sgst)),
    igst: sumMoney(lines.map((r) => r.igst)),
    cess: sumMoney(lines.map((r) => r.cess)),
    total: sumMoney(lines.map((r) => r.lineTotal)),
  };
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

/** CGST and SGST are each half the GST rate: 18 → 9, 5 → 2.5. */
export const halfRate = (rate: string): string => String(Number(rate) / 2);

/** A rate with a percent sign, for the columns and the summary. */
export const pct = (rate: string): string => `${rateLabel(rate)}%`;

/** The line's gross (qty × rate) is printed per line (Rule 46 "total value"). */
export const trimQty = (qty: string): string => trimQuantity(qty);
