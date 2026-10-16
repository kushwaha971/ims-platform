import Decimal from 'decimal.js-light';

const HUNDRED = new Decimal(100);

/**
 * A GST-inclusive amount without its GST, to the paisa: `amount ÷ (1 + (rate +
 * cess) ÷ 100)`. The backend's `_taxable_line` (apps/tax/services/tax_engine.py)
 * is the same formula; the invoice engine and an item's margin both use this
 * one, so the two can never disagree about what "net" means (WP-07).
 */
export const netOfInclusive = (amount: Decimal, rate: Decimal, cess: Decimal): Decimal => {
  const divisor = rate.plus(cess);
  return divisor.isZero()
    ? amount
    : amount
        .dividedBy(new Decimal(1).plus(divisor.dividedBy(HUNDRED)))
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
};
