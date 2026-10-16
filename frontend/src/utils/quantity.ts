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

/** `a − b`, exact to three places, and allowed to go below nothing ("−8"). */
export const subtractQuantity = (a: string, b: string): string =>
  new Decimal(a).minus(new Decimal(b)).toFixed(QTY_DP);

/** A quantity as a form holds it: digits, up to three places. */
export const QUANTITY_TEXT = /^\d+(\.\d{1,3})?$/;

/**
 * True when `qty` is a quantity the form would accept and it is more than
 * `cap`. Text still being typed ("2.", "") is never "over": its own format rule
 * speaks for it, and a decimal parse of it would throw.
 */
export const exceedsQuantity = (qty: string | null | undefined, cap: string): boolean =>
  !!qty && QUANTITY_TEXT.test(qty.trim()) && new Decimal(qty.trim()).gt(new Decimal(cap));

/** One more of a counted line ("2" → "3", "-1" → "0"); text that is not a number is left alone. */
export const stepQuantity = (qty: string): string =>
  /^-?\d+(\.\d+)?$/.test(qty.trim() || '0')
    ? trimQuantity(addQuantity(qty.trim() || '0', '1'))
    : qty;

export const compareQuantity = (a: string, b: string): -1 | 0 | 1 =>
  new Decimal(a).comparedTo(new Decimal(b)) as -1 | 0 | 1;

/**
 * WP-03 D-05 — what is left of `total` once `used` is taken, never below
 * nothing: a return cap. In floats 0.3 − 0.1 is 0.19999999999999998, which
 * refused the last 0.2 KG of a return; this is exact to three places.
 */
export const remainingQuantity = (total: string, used: string | null | undefined): string => {
  const left = subtractQuantity(total, used || '0');
  return left.startsWith('-') ? toQuantityString(0) : left;
};

/** Several quantities added, exact to three places. */
export const sumQuantities = (values: readonly string[]): string =>
  values.reduce((sum, value) => sum.plus(new Decimal(value)), new Decimal(0)).toFixed(QTY_DP);

/** "20.000" → "20", "2.500" → "2.5" — a quantity as a person writes it. */
export const trimQuantity = (qty: string): string =>
  qty.includes('.') ? qty.replace(/0+$/, '').replace(/\.$/, '') : qty;

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
