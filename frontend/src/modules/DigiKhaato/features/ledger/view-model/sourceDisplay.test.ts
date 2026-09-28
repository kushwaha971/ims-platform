import { isSourceVoid, sourceLabelId, sourceRoute } from './sourceDisplay';

import type { LedgerEntrySource } from '../types/ledger.types';

const source = (overrides: Partial<LedgerEntrySource> = {}): LedgerEntrySource => ({
  type: 'sales_document',
  id: 'abc',
  number: 'INV/26-27/0042',
  status: 'issued',
  kind: 'invoice',
  ...overrides,
});

describe('sourceDisplay (LED-10 §14, T-LED-10-8)', () => {
  it('routes each document kind back to its own page', () => {
    /** US-LED-10-3 — the accountant clicks the number and lands on the bill. */
    expect(sourceRoute(source())).toBe('/sales/invoices/abc');
    expect(sourceRoute(source({ type: 'payment', kind: 'payment_in' }))).toBe('/payments/abc');
    expect(
      sourceRoute(source({ type: 'expense', kind: 'expense', number: 'EXP/26-27/0001' }))
    ).toBe('/expenses?period=thisFy&q=EXP%2F26-27%2F0001');
  });

  it('opens a credit note on its own route, not the invoice page (SAL-04)', () => {
    /** A khata's credit-note line used to open /sales/invoices/{id}, which is not a note's page. */
    expect(sourceRoute(source({ kind: 'credit_note', number: 'CN/26-27/0001' }))).toBe(
      '/sales/credit-notes/abc'
    );
  });

  it('links nowhere when the resolver found no document (§9 "Document not found")', () => {
    expect(sourceRoute(source({ number: null }))).toBeNull();
    expect(sourceLabelId(source({ number: null, kind: null }))).toBe('ledger.source.invoice');
  });

  it('labels a receipt by direction and marks a voided source', () => {
    expect(sourceLabelId(source({ type: 'payment', kind: 'payment_out' }))).toBe(
      'ledger.source.payment_out'
    );
    expect(isSourceVoid(source({ status: 'void' }))).toBe(true);
    expect(sourceLabelId(source({ type: 'ledger_entry', kind: null }))).toBeNull();
  });
});
