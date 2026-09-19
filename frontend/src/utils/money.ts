/**
 * Part 19 §19.11.5 and R-TS-7 — money is a decimal STRING end to end.
 *
 * The API sends `numeric(14,2)` as `"1234.50"`; turning that into a JS number
 * at the boundary is exactly how rounding bugs get into a ledger. Every
 * arithmetic operation here goes through `decimal.js-light` over the strings,
 * and the only place a money value becomes a `number` is inside
 * `Intl.NumberFormat`, at the last possible moment.
 */
import Decimal, { type Numeric } from 'decimal.js-light';

/** Two decimal places, always, for money. */
const MONEY_DP = 2;

const INR_FORMAT = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: MONEY_DP,
  maximumFractionDigits: MONEY_DP,
});

const PLAIN_FORMAT = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: MONEY_DP,
  maximumFractionDigits: MONEY_DP,
});

/** A money string the user typed or the API sent; `null`/`''` means absent. */
export type MoneyString = string;

export const toDecimal = (value: MoneyString | null | undefined): Decimal => {
  if (value === null || value === undefined || value === '') return new Decimal(0);
  return new Decimal(value);
};

/** Normalises any accepted input to the canonical wire form, e.g. `"1234.50"`. */
export const toMoneyString = (value: Numeric): MoneyString => new Decimal(value).toFixed(MONEY_DP);

export const addMoney = (a: MoneyString, b: MoneyString): MoneyString =>
  toDecimal(a).plus(toDecimal(b)).toFixed(MONEY_DP);

export const subtractMoney = (a: MoneyString, b: MoneyString): MoneyString =>
  toDecimal(a).minus(toDecimal(b)).toFixed(MONEY_DP);

export const sumMoney = (values: readonly MoneyString[]): MoneyString =>
  values.reduce<MoneyString>((total, value) => addMoney(total, value), '0.00');

export const compareMoney = (a: MoneyString, b: MoneyString): -1 | 0 | 1 =>
  toDecimal(a).comparedTo(toDecimal(b)) as -1 | 0 | 1;

export const isZeroAmount = (value: MoneyString | null | undefined): boolean =>
  value === null || value === undefined || value === '' ? true : toDecimal(value).isZero();

export const isNegativeAmount = (value: MoneyString | null | undefined): boolean =>
  toDecimal(value).isNegative();

/** Magnitude only — `UbAmount` renders direction with a sign and a label. */
export const absMoney = (value: MoneyString): MoneyString =>
  toDecimal(value).absoluteValue().toFixed(MONEY_DP);

/**
 * `formatInr("123456.5")` → `₹1,23,456.50`.
 *
 * The Indian (2,2,3) grouping is the whole point; `en-US` would render
 * `₹123,456.50` and read wrong to the user. The formatter locale is `en-IN` in
 * BOTH UI locales (§19.11.5), which also keeps numerals Latin under `hi`.
 */
export const formatInr = (value: MoneyString | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '—';
  return INR_FORMAT.format(toDecimal(value).toNumber());
};

/** The same grouping without the currency symbol — table columns, inputs. */
export const formatAmount = (value: MoneyString | null | undefined): string => {
  if (value === null || value === undefined || value === '') return '—';
  return PLAIN_FORMAT.format(toDecimal(value).toNumber());
};

/** Strips grouping and symbols from user input back to a wire-shaped string. */
export const parseAmountInput = (input: string): MoneyString => input.replace(/[^\d.-]/g, '');
