import { makeDocument, wireLine } from '../testing/salesFixtures';

import {
  creditNotePreview,
  creditNoteWireBody,
  emptyCreditNoteForm,
  returnCaps,
  settlementSplit,
} from './creditNoteForm';
import { canApply, canReturn, estimateActions, flowRowHref, isVoidable } from './flowDisplay';
import { voidConsequences } from './voidConsequences';

import type { CreditNoteFormValues } from '../validation/salesFlowSchemas';

/**
 * SAL-01 / SAL-04 / SAL-05 decisions the screens make without the server, and
 * the credit note preview, which must price a return exactly as
 * `services/credit_note_lines.py` does or the merchant confirms one figure and
 * the note stores another.
 */

const oilInvoice = () =>
  makeDocument({
    party: { id: 'p1', name: 'Ramesh Traders', gstin: null, mobile: null, state_code: '27' },
    grand_total: '800.00',
    amount_due: '800.00',
    lines: [
      wireLine({
        id: 'l1',
        description: 'Cooking Oil 1L',
        qty: '5.000',
        unit_price: '160.0000',
        tax_inclusive: true,
        returned_qty: '0.000',
      }),
    ],
  });

const returning = (
  invoice: ReturnType<typeof makeDocument>,
  qty: string
): CreditNoteFormValues => ({
  ...emptyCreditNoteForm(invoice, '2026-09-25'),
  lines: [{ againstLineId: 'l1', qty }],
});

describe('the return preview (SAL-04 BR-1 / FR-4)', () => {
  it('T-SAL04-1: 3 of 5 inclusive units @160 GST5 at the snapshot rate → taxable 457.14, tax 22.86', () => {
    const preview = creditNotePreview(oilInvoice(), returning(oilInvoice(), '3'));
    expect(preview.taxableTotal).toBe('457.14');
    expect(preview.cgstTotal).toBe('11.43');
    expect(preview.sgstTotal).toBe('11.43');
    expect(preview.grandTotal).toBe('480.00');
  });

  it('T-SAL04-2: returns the returned line its share of the document discount, prorated', () => {
    const invoice = makeDocument({
      discount_type: 'amount',
      discount_value: '100.00',
      doc_discount_allocation: { '1': '50.00', '2': '50.00' },
      lines: [
        wireLine({ id: 'l1', line_no: 1, qty: '2.000', unit_price: '250.0000', tax_rate: '0.000' }),
        wireLine({ id: 'l2', line_no: 2, qty: '1.000', unit_price: '500.0000', tax_rate: '0.000' }),
      ],
    });
    const values = { ...emptyCreditNoteForm(invoice, '2026-09-25') };
    values.lines = [
      { againstLineId: 'l1', qty: '1' },
      { againstLineId: 'l2', qty: '' },
    ];
    const preview = creditNotePreview(invoice, values);
    expect(preview.discountAmount).toBe('25.00'); // half of line 1's ₹50 share
    expect(preview.grandTotal).toBe('225.00');
  });

  it('caps each line at what earlier notes left', () => {
    const invoice = makeDocument({
      lines: [wireLine({ id: 'l1', qty: '5.000', returned_qty: '2.000' })],
    });
    expect(returnCaps(invoice).remaining).toEqual({ l1: 3 });
  });

  it('sends a refund only for the credit the invoice does not absorb', () => {
    const invoice = oilInvoice();
    const values = { ...returning(invoice, '3'), settlement: 'refund' as const };
    // The bill is unpaid: ₹480 comes off its ₹800 due and nothing is left to refund.
    expect(settlementSplit(invoice, '480.00')).toEqual({ applied: '480.00', left: '0.00' });
    const body = creditNoteWireBody(invoice, values, '0.00');
    expect(body.settlement).toBe('hold_advance');
    expect(body.refund).toBeNull();
    expect(body.lines).toEqual([{ against_line_id: 'l1', qty: '3' }]);
    const paid = creditNoteWireBody(invoice, values, '80.00');
    expect(paid.settlement).toBe('refund');
    expect(paid.refund).toMatchObject({ mode_breakup: [{ mode: 'cash', amount: '80.00' }] });
  });
});

describe('what each status allows', () => {
  it('SAL-01 BR-5: an expired estimate still converts; a rejected one does nothing', () => {
    expect(estimateActions('expired').convert).toBe(true);
    expect(estimateActions('sent')).toEqual({ accept: true, reject: true, convert: true });
    expect(estimateActions('rejected')).toEqual({ accept: false, reject: false, convert: false });
    expect(estimateActions('draft').convert).toBe(false);
  });

  it('opens a draft estimate in its editor and everything else on its page', () => {
    expect(flowRowHref('estimate', 'e1', 'draft')).toBe('/sales/estimates/e1/edit');
    expect(flowRowHref('credit_note', 'c1', 'issued')).toBe('/sales/credit-notes/c1');
  });

  it('SAL-05 FR-1: voids an issued or paid bill, never a draft or a void', () => {
    expect(isVoidable(makeDocument({ status: 'paid' }))).toBe(true);
    expect(isVoidable(makeDocument({ status: 'draft' }))).toBe(false);
    expect(isVoidable(makeDocument({ status: 'void' }))).toBe(false);
  });

  it('SAL-04 EC-7: offers a return only on a party bill with something left to return', () => {
    const party = { id: 'p1', name: 'Ramesh', gstin: null, mobile: null, state_code: '27' };
    expect(canReturn(makeDocument({ party }))).toBe(true);
    expect(canReturn(makeDocument({ party: null }))).toBe(false);
    expect(
      canReturn(makeDocument({ party, lines: [wireLine({ qty: '1.000', returned_qty: '1.000' })] }))
    ).toBe(false);
  });

  it('SAL-04 FR-9: applies only a note with open credit', () => {
    expect(
      canApply(makeDocument({ kind: 'credit_note', status: 'issued', amount_due: '200.00' }))
    ).toBe(true);
    expect(
      canApply(makeDocument({ kind: 'credit_note', status: 'applied', amount_due: '0.00' }))
    ).toBe(false);
  });
});

describe('the void consequences (SAL-05 FR-5)', () => {
  it('names the stock back, the khata line and the payment that becomes an advance', () => {
    const doc = makeDocument({
      party: { id: 'p1', name: 'Ramesh', gstin: null, mobile: null, state_code: '27' },
      party_snapshot: { name: 'Ramesh', gstin: null, state_code: '27', mobile: null, address: {} },
      amount_paid: '500.00',
      lines: [wireLine({ qty: '2.000' })],
    });
    expect(voidConsequences(doc).map((row) => [row.key, row.values])).toEqual([
      ['stock', { items: '+2 Basmati Rice 5kg' }],
      ['ledger', { party: 'Ramesh', amount: '₹473.00' }],
      ['payment', { party: 'Ramesh', amount: '₹500.00' }],
    ]);
  });

  it('tells a walk-in bill its money goes back over the counter', () => {
    const doc = makeDocument({ amount_paid: '473.00', status: 'paid' });
    const payment = voidConsequences(doc).find((row) => row.key === 'payment');
    expect(payment?.id).toBe('sales.void.consequence.walkInPaid');
  });
});
