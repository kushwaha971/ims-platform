import { computeDocumentTotals, resolveRate, type EngineDiscountType } from './taxEngine';
import fixture from './taxEngine.cases.json';

/**
 * The shared GST fixture, run against the CLIENT mirror (Part 32 §32.10.4:
 * "the frontend and backend tax engines agree on every row of
 * taxEngine.cases.json — a divergence fails CI on both sides"). The backend
 * runs the same file in apps/sales/tests/test_tax_engine.py. Protects: the
 * preview a merchant watches while typing is the figure the server stores.
 */

interface CaseLine {
  qty: string;
  unit_price: string;
  tax_inclusive: boolean;
  discount_type: string | null;
  discount_value: string | null;
  tax_code: string;
}

interface Case {
  id: string;
  input: {
    document_date: string;
    gst_type: 'regular' | 'composition' | 'unregistered';
    tenant_state: string;
    place_of_supply: string;
    round_off_enabled: boolean;
    discount_type: string | null;
    discount_value: string | null;
    lines: CaseLine[];
  };
  expected?: {
    document: Record<string, string | boolean>;
    lines: Record<string, string>[];
  };
  expected_error?: { code: string; line_index: number; tax_code: string };
}

const CAMEL: Record<string, string> = {
  is_inter_state: 'isInterState',
  subtotal: 'subtotal',
  discount_amount: 'discountAmount',
  taxable_total: 'taxableTotal',
  cgst_total: 'cgstTotal',
  sgst_total: 'sgstTotal',
  igst_total: 'igstTotal',
  cess_total: 'cessTotal',
  grand_raw: 'grandRaw',
  round_off: 'roundOff',
  grand_total: 'grandTotal',
  gross: 'gross',
  taxable_line: 'taxableLine',
  doc_discount_share: 'docDiscountShare',
  taxable_value: 'taxableValue',
  tax_rate: 'taxRate',
  cgst: 'cgst',
  sgst: 'sgst',
  igst: 'igst',
  cess: 'cess',
  line_total: 'lineTotal',
};

const cases = fixture.cases as unknown as Case[];

const run = (c: Case) => {
  const lines = c.input.lines.map((line, index) => {
    const row = resolveRate(fixture.rates, line.tax_code, c.input.document_date);
    if (!row) throw Object.assign(new Error('rate_not_applicable'), { index, code: line.tax_code });
    return {
      qty: line.qty,
      unitPrice: line.unit_price,
      taxInclusive: line.tax_inclusive,
      discountType: line.discount_type as EngineDiscountType,
      discountValue: line.discount_value,
      rate: row.rate,
      cessRate: row.cess_rate,
    };
  });
  return computeDocumentTotals({
    lines,
    gstType: c.input.gst_type,
    tenantState: c.input.tenant_state,
    placeOfSupply: c.input.place_of_supply,
    roundOffEnabled: c.input.round_off_enabled,
    discountType: c.input.discount_type as EngineDiscountType,
    discountValue: c.input.discount_value,
  });
};

describe('taxEngine mirror × taxEngine.cases.json', () => {
  it.each(cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    if (c.expected_error) {
      expect(() => run(c)).toThrow('rate_not_applicable');
      try {
        run(c);
      } catch (error) {
        expect(error).toMatchObject({
          index: c.expected_error.line_index,
          code: c.expected_error.tax_code,
        });
      }
      return;
    }
    const result = run(c) as unknown as Record<string, unknown> & {
      lines: Record<string, string>[];
    };
    const expected = c.expected ?? { document: {}, lines: [] };
    Object.entries(expected.document).forEach(([key, value]) => {
      expect([key, result[CAMEL[key] as string]]).toEqual([key, value]);
    });
    expect(result.lines).toHaveLength(expected.lines.length);
    expected.lines.forEach((want, index) => {
      Object.entries(want).forEach(([key, value]) => {
        expect([index, key, result.lines[index]?.[CAMEL[key] as string]]).toEqual([
          index,
          key,
          value,
        ]);
      });
    });
  });

  it('keeps a document dated before the 2025-09-21 slab boundary (Part 32 exit criterion)', () => {
    expect(cases.some((c) => c.expected && c.input.document_date < '2025-09-21')).toBe(true);
  });

  it('treats a half-typed cell as zero rather than throwing (the preview never crashes)', () => {
    const result = computeDocumentTotals({
      lines: [
        {
          qty: '1.',
          unitPrice: '',
          taxInclusive: false,
          discountType: null,
          discountValue: null,
          rate: '18',
          cessRate: '0',
        },
      ],
      gstType: 'regular',
      tenantState: '27',
      placeOfSupply: '27',
      roundOffEnabled: true,
      discountType: 'percent',
      discountValue: 'abc',
    });
    expect(result.grandTotal).toBe('0.00');
  });
});
