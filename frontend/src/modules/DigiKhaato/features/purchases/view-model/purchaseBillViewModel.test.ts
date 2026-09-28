import { computeDocumentTotals } from '../../sales/view-model/taxEngine';

import {
  daysLate,
  purchaseFiltersFromQuery,
  purchaseQueryFromFilters,
  shortLines,
  voidConsequences,
} from './purchaseBillDisplay';
import {
  defaultDueOn,
  emptyPurchaseForm,
  emptyPurchaseLine,
  lastCostChange,
  purchasePreviewInput,
  toPurchaseWireBody,
  type PurchaseBillFormValues,
} from './purchaseBillForm';

import type { PurchaseBill } from '../types/purchase.types';

/**
 * PUR-01 / PUR-04 view-models. What these protect is the client preview and
 * the void dialog agreeing with what the SERVER will do: the §17.7.0 worked
 * example to the paisa (T-PUR-01-12's parity), a composition shop still being
 * charged GST by its supplier, and a void dialog that neither promises an
 * unchanged average nor lists a service line as stock.
 */
const RATES = { GST5: { rate: '5.000', cessRate: '0.000' } };

const workedExample = (
  overrides: Partial<PurchaseBillFormValues> = {}
): PurchaseBillFormValues => ({
  ...emptyPurchaseForm('2026-09-18', true),
  partyId: 'p1',
  partyName: 'Agro Traders',
  partyStateCode: '27',
  lines: [
    {
      ...emptyPurchaseLine(),
      itemId: 'rice',
      description: 'Rice',
      qty: '20',
      unitCost: '46',
      taxCode: 'GST5',
    },
    {
      ...emptyPurchaseLine(),
      itemId: 'sugar',
      description: 'Sugar',
      qty: '50',
      unitCost: '38',
      discountType: 'percent',
      discountValue: '2',
      taxCode: 'GST5',
    },
  ],
  ...overrides,
});

describe('the purchase preview', () => {
  it('reproduces the §17.7.0 worked example to the paisa', () => {
    const result = computeDocumentTotals(purchasePreviewInput(workedExample(), RATES, '27'));
    expect(result.subtotal).toBe('2782.00');
    expect([result.cgstTotal, result.sgstTotal, result.igstTotal]).toEqual([
      '69.55',
      '69.55',
      '0.00',
    ]);
    expect(result.lines.map((line) => line.lineTotal)).toEqual(['966.00', '1955.10']);
    expect([result.roundOff, result.grandTotal]).toEqual(['-0.10', '2921.00']);
  });

  it('charges IGST when the supplier is in another state', () => {
    const result = computeDocumentTotals(
      purchasePreviewInput(workedExample({ partyStateCode: '29' }), RATES, '27')
    );
    expect(result.isInterState).toBe(true);
    expect(result.igstTotal).toBe('139.10');
    expect(result.cgstTotal).toBe('0.00');
  });

  it('never zeroes the tax, because the SUPPLIER charges it whatever the shop is (FR-11)', () => {
    // The sales engine zeroes every rate for a composition shop; a purchase
    // must reach it as `regular` or the preview would show a bill ₹139 short.
    const input = purchasePreviewInput(workedExample(), RATES, '27');
    expect(input.gstType).toBe('regular');
  });

  it('treats an unknown supplier state as intra-state, as the server assumes (EC-13)', () => {
    const input = purchasePreviewInput(workedExample({ partyStateCode: null }), RATES, '27');
    expect(input.placeOfSupply).toBe('27');
  });
});

describe('the wire body', () => {
  it('sends only complete lines and the cost as unit_cost', () => {
    const values = workedExample();
    values.lines.push({ ...emptyPurchaseLine(), qty: '' });
    const body = toPurchaseWireBody(values) as { lines: Record<string, unknown>[] };
    expect(body.lines).toHaveLength(2);
    expect(body.lines[1]).toMatchObject({
      item_id: 'sugar',
      qty: '50',
      unit_cost: '38',
      discount_type: 'percent',
      discount_value: '2',
      tax_code: 'GST5',
    });
  });

  it('sends a blank supplier invoice number as null, so two blank bills never collide (EC-2)', () => {
    expect(toPurchaseWireBody(workedExample({ supplierInvoiceNumber: '  ' }))).toMatchObject({
      supplier_invoice_number: null,
    });
  });
});

describe('hints', () => {
  it('says how far the cost moved from the last one (Alternate E)', () => {
    expect(lastCostChange('52', '46.00')).toEqual({ percent: 13 });
    expect(lastCostChange('46', '46.00')).toBeNull();
    expect(lastCostChange('46', '0.00')).toBeNull();
  });

  it('defaults the due date from the supplier credit days, or the bill date itself (FR-2)', () => {
    expect(defaultDueOn('2026-09-18', 15)).toBe('2026-10-03');
    expect(defaultDueOn('2026-09-18', null)).toBe('2026-09-18');
  });

  it('counts days late from the due date', () => {
    expect(daysLate('2026-09-22', '2026-09-25')).toBe(3);
    expect(daysLate('2026-09-25', '2026-09-25')).toBe(0);
  });
});

const BILL = {
  number: 'PB/26-27/0007',
  grandTotal: '2921.00',
  amountPaid: '0.00',
  party: null,
  partySnapshot: { name: 'Agro Traders', gstin: null, stateCode: '27', mobile: null },
  lines: [
    { description: 'Rice', qty: '20.000', unitCode: 'NOS', trackStock: true },
    { description: 'Freight', qty: '1.000', unitCode: 'NOS', trackStock: false },
  ],
} as unknown as PurchaseBill;

describe('the void dialog', () => {
  it('lists signed stock for tracked lines only, and the khata amount (FR-3)', () => {
    const result = voidConsequences(BILL);
    expect(result.stock).toEqual([{ name: 'Rice', qty: '−20', unit: 'NOS' }]);
    expect(result.khata).toBe('2921.00');
    expect(result.advance).toBeNull();
  });

  it('turns an insufficient_stock refusal into "Rice would go to −8" (AC-4)', () => {
    expect(
      shortLines({
        lines: [{ item_name: 'Rice', requested: '20.000', available: '12.000', unit_code: 'NOS' }],
      })
    ).toEqual([{ name: 'Rice', after: '−8', unit: 'NOS' }]);
  });
});

describe('the list filters in the address bar', () => {
  it('round-trips a tab, a search and a custom range, and defaults to this FY', () => {
    const today = '2026-09-25';
    const defaults = purchaseFiltersFromQuery(new URLSearchParams(''), today);
    expect(defaults).toMatchObject({ preset: 'thisFy', dateFrom: '2026-04-01', tab: 'all' });
    expect(purchaseQueryFromFilters(defaults)).toBe('');

    const qs = 'period=custom&from=2026-09-01&to=2026-09-10&tab=unpaid&q=AT%2F778';
    const parsed = purchaseFiltersFromQuery(new URLSearchParams(qs), today);
    expect(parsed).toMatchObject({ dateFrom: '2026-09-01', tab: 'unpaid', q: 'AT/778' });
    expect(new URLSearchParams(purchaseQueryFromFilters(parsed)).get('q')).toBe('AT/778');
  });
});
