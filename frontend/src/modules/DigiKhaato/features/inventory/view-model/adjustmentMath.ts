import Decimal from 'decimal.js-light';

import type { AdjustmentFormLine } from '../types/item.types';

/**
 * INV-06 FR-4/FR-5 — the numbers the drawer shows BEFORE posting. The server
 * recomputes everything; these exist so the merchant sees "5 → 2 NOS, −₹132.00"
 * while they type. decimal.js-light only: canon rule 3 allows no float maths
 * on money or quantities.
 */

const parse = (value: string): Decimal | null => {
  const text = value.trim();
  if (!text || text === '-' || text === '.' || text === '-.') return null;
  try {
    return new Decimal(text);
  } catch {
    return null;
  }
};

/** The signed quantity the server receives: "Adjust by" as typed, "Set to" as the difference. */
export const signedQty = (
  line: Pick<AdjustmentFormLine, 'mode' | 'qty' | 'onHand'>
): Decimal | null => {
  const typed = parse(line.qty);
  if (typed === null) return null;
  if (line.mode === 'to') return typed.minus(new Decimal(line.onHand || '0'));
  return typed;
};

export const signedQtyString = (line: AdjustmentFormLine): string => {
  const qty = signedQty(line);
  return qty === null ? '' : qty.toFixed(3);
};

export const onHandAfter = (line: AdjustmentFormLine): string | null => {
  const qty = signedQty(line);
  return qty === null ? null : new Decimal(line.onHand || '0').plus(qty).toFixed(3);
};

/** BR-3 — inbound at the entered cost, outbound at the current average; 2 dp half-up. */
export const valueImpact = (line: AdjustmentFormLine): string | null => {
  const qty = signedQty(line);
  if (qty === null || qty.isZero()) return null;
  const cost = qty.isNegative() ? parse(line.avgCost) : parse(line.unitCost);
  if (cost === null) return null;
  return qty.times(cost).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
};

export const totalValueImpact = (lines: readonly AdjustmentFormLine[]): string =>
  lines
    .reduce((sum, line) => {
      const impact = valueImpact(line);
      return impact === null ? sum : sum.plus(new Decimal(impact));
    }, new Decimal(0))
    .toFixed(2);

export const isInboundLine = (line: AdjustmentFormLine): boolean => {
  const qty = signedQty(line);
  return qty !== null && qty.isPositive() && !qty.isZero();
};
