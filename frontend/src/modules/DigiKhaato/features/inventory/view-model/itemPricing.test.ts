import type { TranslateFn } from 'src/hooks/useTranslation';

import { itemPriceNote } from './itemPriceNote';
import { itemMargin, marginOf, priceAfterEdit, priceForMargin } from './itemPricing';

/**
 * WP-07 — the item's cost, selling price and margin kept in step, by the rules
 * in docs/shop-ims-readiness/14-item-pricing-design-review.md. Margin is profit
 * over the NET selling price (not markup), so a GST-inclusive price is taken
 * without its GST first, with the same formula the invoice engine uses.
 */
describe('marginOf', () => {
  it('is profit over the net selling price, to one decimal', () => {
    expect(marginOf({ sellingPrice: '50.00', cost: '40.00' })).toBe('20.0');
    expect(marginOf({ sellingPrice: '30.00', cost: '20.00' })).toBe('33.3');
  });

  it('takes the GST out of an inclusive price first', () => {
    // ₹59 with 18% GST is ₹50 net; bought at ₹40 that is 20%, not 32.2%.
    expect(
      marginOf({ sellingPrice: '59.00', cost: '40.00', inclusive: true, rate: '18', cess: '0' })
    ).toBe('20.0');
  });

  it('is negative when selling below cost, and absent without a cost or a price', () => {
    expect(marginOf({ sellingPrice: '35.00', cost: '40.00' })).toBe('-14.3');
    expect(marginOf({ sellingPrice: '50.00', cost: '0' })).toBeNull();
    expect(marginOf({ sellingPrice: '50.00', cost: '' })).toBeNull();
    expect(marginOf({ sellingPrice: '0', cost: '40.00' })).toBeNull();
  });
});

describe('priceForMargin', () => {
  it('prices the cost so the net price carries the margin, rounded to paise', () => {
    expect(priceForMargin({ cost: '40.00', margin: '20' })).toBe('50.00');
    expect(priceForMargin({ cost: '20.00', margin: '33.3' })).toBe('29.99');
  });

  it('adds the GST back for an inclusive item', () => {
    expect(
      priceForMargin({ cost: '40.00', margin: '20', inclusive: true, rate: '18', cess: '0' })
    ).toBe('59.00');
  });

  it('refuses a margin of 100% or more, and needs a cost', () => {
    expect(priceForMargin({ cost: '40.00', margin: '100' })).toBeNull();
    expect(priceForMargin({ cost: '40.00', margin: '150' })).toBeNull();
    expect(priceForMargin({ cost: '0', margin: '20' })).toBeNull();
    expect(priceForMargin({ cost: '40.00', margin: 'abc' })).toBeNull();
  });

  it('allows a loss, which prices below cost', () => {
    expect(priceForMargin({ cost: '40.00', margin: '-25' })).toBe('32.00');
  });

  it('round-trips: the margin shown is the rounded price’s own', () => {
    const price = priceForMargin({ cost: '20.00', margin: '33.3' });
    expect(marginOf({ sellingPrice: price ?? '', cost: '20.00' })).toBe('33.3');
  });
});

describe('priceAfterEdit — which figure follows which', () => {
  const base = { sellingPrice: '50.00', cost: '40.00', margin: '20.0' };

  it('typing a selling price recalculates the margin', () => {
    expect(priceAfterEdit('price', { ...base, sellingPrice: '60.00' })).toEqual({
      sellingPrice: '60.00',
      margin: '33.3',
    });
  });

  it('typing a margin recalculates the price and keeps the margin as typed', () => {
    expect(priceAfterEdit('margin', { ...base, margin: '25' })).toEqual({
      sellingPrice: '53.33',
      margin: '25',
    });
  });

  it('leaving the margin shows the rounded price’s own margin', () => {
    expect(
      priceAfterEdit('marginDone', { sellingPrice: '53.33', cost: '40.00', margin: '25' })
    ).toEqual({ sellingPrice: '53.33', margin: '25.0' });
  });

  it('keeps a refused margin on screen, so its error stays readable', () => {
    // 100% needs an infinite price; replacing it on blur would hide the error.
    expect(priceAfterEdit('marginDone', { ...base, margin: '100' })).toEqual({
      sellingPrice: '50.00',
      margin: '100',
    });
  });

  it('typing the cost while a margin is held reprices to keep the margin', () => {
    expect(priceAfterEdit('cost', { ...base, cost: '45.00' })).toEqual({
      sellingPrice: '56.25',
      margin: '20.0',
    });
  });

  it('typing the cost with no margin yet leaves the price alone and fills the margin', () => {
    expect(priceAfterEdit('cost', { sellingPrice: '50.00', cost: '40.00', margin: '' })).toEqual({
      sellingPrice: '50.00',
      margin: '20.0',
    });
  });

  it('clearing the cost clears the margin and keeps the price', () => {
    expect(priceAfterEdit('cost', { ...base, cost: '' })).toEqual({
      sellingPrice: '50.00',
      margin: '',
    });
  });

  it('a half-typed margin leaves the price where it was', () => {
    expect(priceAfterEdit('margin', { ...base, margin: '-' })).toEqual({
      sellingPrice: '50.00',
      margin: '-',
    });
  });

  it('a GST change keeps the price and rereads the margin', () => {
    expect(
      priceAfterEdit(
        'gst',
        { sellingPrice: '59.00', cost: '40.00', margin: '32.2' },
        {
          inclusive: true,
          rate: '18',
        }
      )
    ).toEqual({ sellingPrice: '59.00', margin: '20.0' });
  });
});

describe('itemPriceNote — the picker’s price line', () => {
  const t = ((key: string, params?: Record<string, string>) =>
    ({
      'items.picker.usualPrice': `Usual price ${params?.amount}`,
      'items.picker.cost': `Cost ${params?.amount}`,
      'items.picker.margin': `${params?.margin}% margin`,
    })[key] ?? key) as TranslateFn;
  const row = {
    sellingPrice: '50.00',
    purchasePrice: '40.00',
    taxInclusiveSelling: false,
    gstPercent: '18.000',
  };

  it('names the usual price, the cost and the margin for someone who sees costs', () => {
    expect(itemPriceNote(row, t)).toBe('Usual price ₹50.00 · Cost ₹40.00 · 20.0% margin');
  });

  it('reads an inclusive price without its GST', () => {
    expect(itemPriceNote({ ...row, sellingPrice: '59.00', taxInclusiveSelling: true }, t)).toBe(
      'Usual price ₹59.00 · Cost ₹40.00 · 20.0% margin'
    );
  });

  it('leaves the margin out rather than guess an inclusive price’s GST', () => {
    expect(
      itemPriceNote(
        { ...row, sellingPrice: '59.00', taxInclusiveSelling: true, gstPercent: null },
        t
      )
    ).toBe('Usual price ₹59.00 · Cost ₹40.00');
  });

  it('gives a member who cannot see costs the usual price alone', () => {
    expect(itemPriceNote({ ...row, purchasePrice: null }, t)).toBe('Usual price ₹50.00');
    expect(itemPriceNote({ ...row, purchasePrice: null, sellingPrice: '0.00' }, t)).toBeNull();
  });
});

describe('itemMargin — the item page’s Margin row', () => {
  const soap = {
    sellingPrice: '59.00',
    purchasePrice: '40.00',
    taxInclusiveSelling: true,
    taxRate: { rate: '18.000', cessRate: '0.000' },
  };

  it('reads an inclusive item through its own GST rate', () => {
    // Found by looking: the item page showed both prices and no margin at all.
    expect(itemMargin(soap)).toBe('20.0');
  });

  it('has none without a cost, or when the cost is withheld', () => {
    expect(itemMargin({ ...soap, purchasePrice: '0.00' })).toBeNull();
    expect(itemMargin({ ...soap, purchasePrice: null })).toBeNull();
  });
});
