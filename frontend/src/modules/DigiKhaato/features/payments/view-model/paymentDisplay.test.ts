import { allocationHref } from './allocationLinks';
import {
  allocationRowsFor,
  defaultAmount,
  fifoPreview,
  hasDuplicateModes,
  linesTotal,
  manualTotals,
  mergeDuplicateModes,
  paymentFiltersFromQuery,
  paymentQueryFromFilters,
  primaryModeOf,
  remainingFor,
  voidConsequences,
} from './paymentDisplay';

import type { OpenDocument, Payment, PaymentLineForm } from '../types/payment.types';

const doc = (id: string, due: string): OpenDocument => ({
  documentType: 'sales_document',
  documentId: id,
  number: `INV/26-27/${id}`,
  documentDate: '2026-09-10',
  dueOn: null,
  grandTotal: due,
  amountDue: due,
  status: 'issued',
});

const line = (mode: PaymentLineForm['mode'], amount: string, reference = ''): PaymentLineForm => ({
  mode,
  upiApp: '',
  amount,
  reference,
});

describe('fifoPreview (PAY-01 FR-5, AC-2)', () => {
  it('settles the oldest bill first and keeps the rest as advance, exactly', () => {
    /** The server is authoritative; this preview must say what it WILL do, or the
     *  panel promises one bill paid and the receipt says another. */
    const { allocations, advance } = fifoPreview('1000.00', [
      doc('0040', '898.00'),
      doc('0042', '898.00'),
    ]);
    expect(allocations).toEqual({ '0040': '898.00', '0042': '102.00' });
    expect(advance).toBe('0.00');
    expect(fifoPreview('1000.00', [doc('0040', '898.00')]).advance).toBe('102.00');
  });

  it('adds decimals without float drift', () => {
    /** 0.10 + 0.20 must be 0.30 on a receipt, never 0.30000000000000004. */
    expect(linesTotal([line('cash', '0.10'), line('upi', '0.20')])).toBe('0.30');
    expect(fifoPreview('0.30', [doc('a', '0.10'), doc('b', '0.20')]).advance).toBe('0.00');
  });
});

describe('the mode lines (PAY-02)', () => {
  it('names the largest share primary, and a tie goes to the first line (BR-2)', () => {
    expect(primaryModeOf([line('cash', '300'), line('upi', '700')])).toBe('upi');
    expect(primaryModeOf([line('bank', '50'), line('cash', '50')])).toBe('bank');
  });

  it('fills the remainder onto a line (FR-2 "Fill remaining")', () => {
    expect(remainingFor([line('upi', '700'), line('cash', '')], 1, '1000.00')).toBe('300.00');
    expect(remainingFor([line('upi', '1000')], 0, '1000.00')).toBeNull();
  });

  it('merges two lines of one mode, adding amounts and joining references (FR-4)', () => {
    const lines = [line('upi', '500', 'UTR1'), line('cash', '100'), line('upi', '200', 'UTR2')];
    expect(hasDuplicateModes(lines)).toBe(true);
    expect(mergeDuplicateModes(lines)).toEqual([
      { mode: 'upi', upiApp: '', amount: '700.00', reference: 'UTR1, UTR2' },
      line('cash', '100'),
    ]);
  });
});

describe('the manual panel (FR-6)', () => {
  it('reports what is allocated and what stays as advance, negative when over', () => {
    expect(manualTotals('1500.00', [{ amount: '898' }, { amount: '' }])).toEqual({
      allocated: '898.00',
      advance: '602.00',
    });
    expect(manualTotals('100.00', [{ amount: '150' }]).advance).toBe('-50.00');
  });

  it("presets the invoice page's own bill, capped at its due", () => {
    const rows = allocationRowsFor([doc('0040', '898.00'), doc('0042', '398.00')], {
      documentId: '0042',
      amount: '500.00',
    });
    expect(rows.map((r) => r.amount)).toEqual(['', '398.00']);
  });

  it('defaults the amount to the bill due, then the receivable, then nothing (§8)', () => {
    expect(defaultAmount('398.00', '1000.00')).toBe('398.00');
    expect(defaultAmount(undefined, '1000')).toBe('1000.00');
    expect(defaultAmount(undefined, '-50.00')).toBe('');
  });
});

describe('the list filters in the URL', () => {
  it('round-trips, and a plain URL stays plain', () => {
    const filters = paymentFiltersFromQuery(
      new URLSearchParams('tab=void&mode=upi&q=0017'),
      '2026-09-25'
    );
    expect(filters).toMatchObject({ tab: 'void', mode: 'upi', q: '0017', preset: 'thisMonth' });
    expect(paymentQueryFromFilters(filters)).toBe('tab=void&mode=upi&q=0017');
    expect(
      paymentQueryFromFilters(paymentFiltersFromQuery(new URLSearchParams(''), '2026-09-25'))
    ).toBe('');
  });

  it('ignores a tab or mode it does not know rather than widening the list silently', () => {
    const filters = paymentFiltersFromQuery(
      new URLSearchParams('tab=bogus&mode=gold'),
      '2026-09-25'
    );
    expect(filters.tab).toBe('all');
    expect(filters.mode).toBeNull();
  });
});

describe('voidConsequences (PAY-05 FR-2)', () => {
  it('lists the khata, each bill reopened with its due, and a dropped advance', () => {
    /** The dialog says what will change BEFORE it happens; a bill's "due after"
     *  is its current due plus this payment's share, not the grand total. */
    const payment = {
      party: { id: 'p', name: 'Ramesh', mobile: null },
      amount: '1000.00',
      unallocatedAmount: '102.00',
      allocations: [
        {
          documentType: 'sales_document',
          documentId: 'd',
          number: 'INV/1',
          kind: 'invoice',
          documentDate: '2026-09-10',
          status: 'paid',
          amountDue: '0.00',
          amount: '898.00',
        },
      ],
    } as unknown as Payment;
    expect(voidConsequences(payment)).toEqual([
      { kind: 'ledger', amount: '1000.00' },
      { kind: 'document', number: 'INV/1', amount: '898.00' },
      { kind: 'advance', amount: '102.00' },
    ]);
  });

  // ── A4b ── PLT-X02 BR-7
  it('names the other half of a deposit adjustment, which the void reverses too', () => {
    /** Voiding either adjustment voids its partner: the dialog must say so first. */
    const payment = {
      party: { id: 'p', name: 'Asha' },
      amount: '120.00',
      unallocatedAmount: '0.00',
      allocations: [],
      depositPair: {
        applicationId: 'a1',
        amount: '120.00',
        depositId: 'd1',
        partnerNumber: 'PAYOUT/26-27/0031',
        voided: false,
      },
    } as unknown as Payment;
    expect(voidConsequences(payment)).toContainEqual({
      kind: 'depositPair',
      number: 'PAYOUT/26-27/0031',
      amount: '120.00',
    });
    const done = {
      ...payment,
      depositPair: { ...payment.depositPair, voided: true },
    } as unknown as Payment;
    expect(voidConsequences(done).map((row) => row.kind)).not.toContain('depositPair');
  });
});

describe('where a receipt row links (PUR-02)', () => {
  it('sends a supplier payment to the purchase bill, a receipt to the invoice', () => {
    /** Protects the voucher page: every "Against" row linked to /sales/invoices, so a
     *  PAYOUT's bill opened as a missing invoice. */
    expect(allocationHref({ documentType: 'purchase_document', documentId: 'b7' })).toBe(
      '/purchases/bills/b7'
    );
    expect(allocationHref({ documentType: 'sales_document', documentId: 'd1' })).toBe(
      '/sales/invoices/d1'
    );
  });
});
