import { applyPrefill, applyTotals } from './applyAdvance';
import { applyRequestRows, canApplyAdvance } from './applyGate';

import type { OpenDocument, Payment } from '../types/payment.types';

/**
 * A4a (FRD 00 PLT-X03 §7–8) — Apply to bills, as decisions. The worked example: ₹3,000 not
 * yet applied, an invoice of ₹1,770 — pre-filled oldest first, "₹1,230 stays as advance".
 */
const doc = (id: string, due: string, date = '2026-10-12'): OpenDocument => ({
  documentType: 'sales_document',
  documentId: id,
  number: `INV/${id}`,
  documentDate: date,
  dueOn: null,
  grandTotal: due,
  amountDue: due,
  status: 'issued',
});

const receipt = (
  over: Partial<Payment> = {}
): Pick<Payment, 'status' | 'party' | 'unallocatedAmount' | 'context'> => ({
  status: 'recorded',
  party: { id: 'p1', name: 'Ramesh', mobile: null },
  unallocatedAmount: '3000.00',
  context: null,
  ...over,
});

describe('canApplyAdvance', () => {
  it('offers Apply only where the server will take it', () => {
    expect(canApplyAdvance(receipt())).toBe(true);
    // Nothing left, voided, a walk-in (EC-1), a credit note's refund voucher (EC-5).
    expect(canApplyAdvance(receipt({ unallocatedAmount: '0.00' }))).toBe(false);
    expect(canApplyAdvance(receipt({ status: 'void' }))).toBe(false);
    expect(canApplyAdvance(receipt({ party: null }))).toBe(false);
    expect(canApplyAdvance(receipt({ context: 'refund' }))).toBe(false);
  });
});

describe('applyPrefill', () => {
  it('fills the oldest bills first up to what is not yet applied', () => {
    const rows = applyPrefill([doc('a', '1770.00'), doc('b', '2000.00')], '3000.00');
    expect(rows.map((row) => row.amount)).toEqual(['1770.00', '1230.00']);
    expect(rows[0]?.due).toBe('1770.00');
  });

  it('leaves a bill the advance does not reach empty rather than 0.00', () => {
    const rows = applyPrefill([doc('a', '3000.00'), doc('b', '500.00')], '3000.00');
    expect(rows.map((row) => row.amount)).toEqual(['3000.00', '']);
  });
});

describe('applyTotals and the request', () => {
  it('says what is applied and what stays as advance', () => {
    expect(applyTotals([{ amount: '1770.00' }, { amount: '' }], '3000.00')).toEqual({
      applying: '1770.00',
      remaining: '1230.00',
    });
  });

  it('sends only the rows with an amount (a row of 0 is dropped)', () => {
    const rows = applyPrefill([doc('a', '1770.00'), doc('b', '500.00')], '1770.00');
    expect(applyRequestRows(rows)).toEqual([
      { documentType: 'sales_document', documentId: 'a', amount: '1770.00' },
    ]);
  });
});
