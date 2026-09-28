import { hasPurchasePrice } from './itemDisplay';
import { taxCodeLabel } from './taxCodeLabel';

/**
 * UAT D7 — the items list showed "GST5" in its GST column and "₹0.00" as the
 * purchase price of an item added with opening stock at ₹380 (a purchase price
 * nobody entered). The column reads "5%", and an unentered price reads "—".
 */
const t = (id: string): string => (id === 'tax.rate.EXEMPT' ? 'Exempt' : id);

it('UAT D7: a GST code reads as its rate', () => {
  expect(taxCodeLabel('GST5', t)).toBe('5%');
  expect(taxCodeLabel('GST18', t)).toBe('18%');
  expect(taxCodeLabel('GST0.25', t)).toBe('0.25%');
  expect(taxCodeLabel('EXEMPT', t)).toBe('Exempt');
});

it('UAT D7: a purchase price of 0.00 or none is not a price', () => {
  expect(hasPurchasePrice('0.00')).toBe(false);
  expect(hasPurchasePrice(null)).toBe(false);
  expect(hasPurchasePrice('380.00')).toBe(true);
});
