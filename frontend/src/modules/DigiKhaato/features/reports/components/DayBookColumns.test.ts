import { ALL_MESSAGES } from 'src/tests/allMessages';

import { describeRow } from './DayBookColumns';

import type { DayBookRow } from '../types/reports.types';

/**
 * UAT D4 — a credit invoice's day book row read "₹903.00 paid" though nothing
 * was paid at issue: the row carried the bill's CURRENT due, which a later
 * receipt had cleared. The server now sends the due AT ISSUE for a sale row and
 * the words follow it: paid, on credit, or both halves of a part payment.
 */
const EN = ALL_MESSAGES.en as Record<string, string>;
const t = ((id: string, values: Record<string, string> = {}) =>
  (EN[id] ?? id).replace(/\{(\w+)\}/g, (_m, key: string) => values[key] ?? '')) as never;

const sale = (over: Partial<DayBookRow>): DayBookRow => ({
  id: 'sale:d1',
  type: 'sale',
  void: false,
  source: { kind: 'sales_document', id: 'd1', partyId: 'c1' },
  date: '2026-09-18',
  time: '10:15',
  recordedOn: null,
  number: 'INV/26-27/0001',
  party: { id: 'c1', name: 'Ramesh' },
  walkInName: null,
  amount: '903.00',
  amountDue: '903.00',
  moneyIn: null,
  moneyOut: null,
  modes: [],
  note: '',
  detail: null,
  lines: null,
  paid: null,
  reference: '',
  createdBy: { id: 'u1', name: 'Owner' },
  ...over,
});

it('UAT D4: a sale on credit reads "on credit", not "paid"', () => {
  expect(describeRow(sale({}), t)).toBe('₹903.00 on credit');
});

it('UAT D4: a sale paid in full at issue reads "paid"', () => {
  expect(describeRow(sale({ amountDue: '0.00' }), t)).toBe('₹903.00 paid');
});

it('UAT D4: a part payment at issue names what was paid and what is on credit', () => {
  expect(describeRow(sale({ amountDue: '603.00' }), t)).toBe('₹300.00 paid · ₹603.00 on credit');
});
