import {
  applyTotal,
  canReceive,
  canSpend,
  initialApplyRows,
  overDue,
  overHeld,
  receivable,
  toReturn,
} from './depositDisplay';

import type { Deposit, DepositCharge } from '../types/deposit.types';

/**
 * A4b — the figures the deposit screens show while the merchant types. Each is
 * exact decimal arithmetic on strings: a float here is how ₹0.30 becomes
 * ₹0.29999 in a "still held" caption.
 */
const deposit = (overrides: Partial<Deposit> = {}): Deposit => ({
  id: 'd1',
  party: { id: 'p1', name: 'Asha Rao' },
  module: 'library',
  subjectType: 'library_membership',
  subjectId: 's1',
  purpose: 'Library deposit',
  expectedAmount: '500.00',
  receivedAmount: '500.00',
  appliedAmount: '0.00',
  refundedAmount: '0.00',
  heldAmount: '500.00',
  status: 'held',
  note: '',
  version: 2,
  createdAt: '2026-09-29T10:00:00Z',
  ...overrides,
});

const charge = (id: string, due: string): DepositCharge => ({
  documentType: 'sales_document',
  documentId: id,
  number: `INV/${id}`,
  due,
});

describe('receivable', () => {
  it('is what is still to be received, and never below zero', () => {
    expect(receivable(deposit({ receivedAmount: '300.00' }))).toBe('200.00');
    expect(receivable(deposit())).toBe('0.00');
  });
});

describe('canReceive / canSpend', () => {
  it('offers Take only while something is still to be received, and Return only while money is held', () => {
    /** A released deposit offers nothing: the server would refuse every act. */
    expect(canReceive(deposit())).toBe(false);
    expect(
      canReceive(deposit({ receivedAmount: '0.00', heldAmount: '0.00', status: 'expected' }))
    ).toBe(true);
    expect(canSpend(deposit())).toBe(true);
    expect(canSpend(deposit({ heldAmount: '0.00', status: 'released' }))).toBe(false);
  });
});

describe('initialApplyRows', () => {
  it('fills the charges oldest first from what is held until it runs out', () => {
    /** EC-7 — ₹800 of damage against ₹500 held: ₹500 is adjusted, ₹300 stays owed. */
    const rows = initialApplyRows('500.00', [charge('a', '120.00'), charge('b', '800.00')]);
    expect(rows.map((row) => row.amount)).toEqual(['120.00', '380.00']);
    expect(
      initialApplyRows('100.00', [charge('a', '100.00'), charge('b', '5.00')])[1]?.amount
    ).toBe('');
  });
});

describe('toReturn and the caps', () => {
  it('says what is still held after the rows typed, and flags a total above it', () => {
    const rows = [{ amount: '120.00' }, { amount: '' }];
    expect(applyTotal(rows)).toBe('120.00');
    expect(toReturn('500.00', rows)).toBe('380.00');
    expect(overHeld('500.00', rows)).toBe(false);
    expect(overHeld('500.00', [{ amount: '300.10' }, { amount: '199.91' }])).toBe(true);
    expect(overDue({ amount: '120.01', due: '120.00' })).toBe(true);
    expect(overDue({ amount: '', due: '120.00' })).toBe(false);
  });
});
