/**
 * Quantities are decimal strings with up to 3 dp, trailing zeros trimmed, with
 * the unit code appended for display: `2.5 KG`, `12 NOS` (Part 19 §19.11.5).
 */
import Decimal, { type Numeric } from 'decimal.js-light';

const QTY_DP = 3;

const QTY_FORMAT = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: QTY_DP,
});

export const toQuantityString = (value: Numeric): string => new Decimal(value).toFixed(QTY_DP);

/** Trailing zeros are noise on a shelf label: `2.500` reads as `2.5`. */
export const formatQuantity = (value: string | null | undefined, unitCode?: string): string => {
  if (value === null || value === undefined || value === '') return '—';
  const formatted = QTY_FORMAT.format(new Decimal(value).toNumber());
  return unitCode ? `${formatted} ${unitCode}` : formatted;
};

export const addQuantity = (a: string, b: string): string =>
  new Decimal(a).plus(new Decimal(b)).toFixed(QTY_DP);

export const compareQuantity = (a: string, b: string): -1 | 0 | 1 =>
  new Decimal(a).comparedTo(new Decimal(b)) as -1 | 0 | 1;

/**
 * The server stores every quantity to three places ("3.000"), and the editor's
 * rule for a whole-number unit accepts digits only — so a draft reopened from
 * the server failed its own check on every NOS line and Issue did nothing, with
 * the reason hidden in a field too narrow to show it (found by the sales-order
 * browser pass, 7 Oct 2026; the purchase bill editor had the same defect). A
 * whole unit's quantity comes back as "3".
 */
export const formQty = (qty: string, allowDecimal: boolean): string => {
  if (allowDecimal) return qty;
  const whole = /^(\d+)\.0*$/.exec(qty.trim());
  return whole ? (whole[1] ?? qty) : qty;
};
