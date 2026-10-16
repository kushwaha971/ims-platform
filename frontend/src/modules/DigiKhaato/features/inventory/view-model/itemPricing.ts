import Decimal from 'decimal.js-light';

import { toMoneyString, type MoneyString } from 'src/utils/money';
import { netOfInclusive } from 'src/utils/taxInclusive';

import type { TaxRate } from '../types/item.types';

/**
 * WP-07 — an item's cost, selling price and margin kept in step. The rules are
 * docs/shop-ims-readiness/14-item-pricing-design-review.md:
 *   margin = (net selling price − cost) ÷ net selling price × 100 (not markup);
 *   net = the selling price without GST when it includes GST;
 *   price for a margin = cost ÷ (1 − margin ÷ 100), GST added back, to the paisa.
 * Margin is never stored: it is read from the two prices whenever it is shown.
 */

export interface Gst {
  /** The selling price includes GST. */
  readonly inclusive?: boolean;
  /** The item's GST and cess rates, in percent. */
  readonly rate?: string;
  readonly cess?: string;
}

const HUNDRED = new Decimal(100);
const ONE = new Decimal(1);

export const parseFigure = (value: string | null | undefined): Decimal | null => {
  if (value === null || value === undefined || value.trim() === '') return null;
  try {
    return new Decimal(value.trim());
  } catch {
    return null;
  }
};

const rates = (gst: Gst): readonly [Decimal, Decimal] => [
  parseFigure(gst.rate) ?? new Decimal(0),
  parseFigure(gst.cess) ?? new Decimal(0),
];

/** The margin to one decimal, or null when there is no cost or no price to read it from. */
export const marginOf = ({
  sellingPrice,
  cost,
  ...gst
}: Gst & { readonly sellingPrice: string; readonly cost: string }): string | null => {
  const price = parseFigure(sellingPrice);
  const bought = parseFigure(cost);
  if (!price || !bought || price.lte(0) || bought.lte(0)) return null;
  const [rate, cess] = rates(gst);
  const net = gst.inclusive ? netOfInclusive(price, rate, cess) : price;
  if (net.lte(0)) return null;
  return net.minus(bought).dividedBy(net).times(HUNDRED).toFixed(1);
};

/** The selling price that carries `margin` over `cost`, or null for a margin of 100% or more. */
export const priceForMargin = ({
  cost,
  margin,
  ...gst
}: Gst & { readonly cost: string; readonly margin: string }): MoneyString | null => {
  const bought = parseFigure(cost);
  const percent = parseFigure(margin);
  if (!bought || !percent || bought.lte(0) || percent.gte(HUNDRED)) return null;
  const net = bought.dividedBy(ONE.minus(percent.dividedBy(HUNDRED)));
  const [rate, cess] = rates(gst);
  const price = gst.inclusive ? net.times(ONE.plus(rate.plus(cess).dividedBy(HUNDRED))) : net;
  return toMoneyString(price.toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
};

/** Selling below cost, for the form's warning line. */
export const isBelowCost = (margin: string | null): boolean => parseFigure(margin)?.lt(0) ?? false;

/** The three figures as the form holds them. */
export interface PricingFigures {
  readonly sellingPrice: string;
  readonly cost: string;
  readonly margin: string;
}

/**
 * Which figure moves when the merchant edits one (the review's "Edits"):
 * a price rereads the margin; a margin reprices; a cost reprices while a
 * margin is held and otherwise fills it; leaving the margin box, or changing
 * the GST, shows the rounded price's own margin. A margin that cannot price
 * (half-typed, or 100% or more) leaves the price alone and stays as typed, so
 * the form's error is about what is on screen.
 */
export const priceAfterEdit = (
  edited: 'price' | 'cost' | 'margin' | 'marginDone' | 'gst',
  figures: PricingFigures,
  gst: Gst = {}
): Pick<PricingFigures, 'sellingPrice' | 'margin'> => {
  const { sellingPrice, cost, margin } = figures;
  const reread = (price: string): string => marginOf({ sellingPrice: price, cost, ...gst }) ?? '';
  const repriced = priceForMargin({ cost, margin, ...gst });
  switch (edited) {
    case 'margin':
      return { sellingPrice: repriced ?? sellingPrice, margin };
    case 'marginDone':
      return { sellingPrice, margin: repriced ? reread(sellingPrice) : margin };
    case 'cost': {
      const bought = parseFigure(cost);
      if (!bought || bought.lte(0)) return { sellingPrice, margin: '' };
      const price = margin.trim() && repriced ? repriced : sellingPrice;
      return { sellingPrice: price, margin: reread(price) };
    }
    case 'price':
    case 'gst':
    default:
      return { sellingPrice, margin: reread(sellingPrice) };
  }
};

/** The GST an item's margin is read through: its inclusive switch and its rate. */
export const gstFor = (
  inclusive: boolean,
  rate: Pick<TaxRate, 'rate' | 'cessRate'> | null | undefined
): Gst => ({ inclusive, rate: rate?.rate, cess: rate?.cessRate });

/** An item's margin at today's GST, for its page; null without a cost to read it from. */
export const itemMargin = (item: {
  readonly sellingPrice: string;
  readonly purchasePrice: string | null;
  readonly taxInclusiveSelling: boolean;
  readonly taxRate: Pick<TaxRate, 'rate' | 'cessRate'> | null;
}): string | null =>
  item.purchasePrice === null
    ? null
    : marginOf({
        sellingPrice: item.sellingPrice,
        cost: item.purchasePrice,
        ...gstFor(item.taxInclusiveSelling, item.taxRate),
      });
