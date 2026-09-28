import { localiseNarration } from './narration';

/**
 * Sprint 12 i18n sweep: a Hindi khata and statement read "Receipt
 * RCT/26-27/0001" and "Invoice INV/26-27/0001" in English on every row a
 * document posted, because the server's narration (English on purpose — it is
 * a record) was rendered as though it were the merchant's note. These pin that
 * the screen words the narration, and that it never rewrites what a merchant
 * typed.
 */
const HI: Record<string, string> = {
  'ledger.source.invoice': 'बिल',
  'ledger.source.credit_note': 'क्रेडिट नोट',
  'ledger.source.receipt': 'रसीद',
  'ledger.source.payment': 'भुगतान',
  'ledger.source.purchase_bill': 'खरीद बिल',
  'ledger.source.void': 'रद्द',
};
const t = (id: string): string => HI[id] ?? id;

describe('localiseNarration', () => {
  it.each([
    ['Invoice INV/26-27/0001', 'INV/26-27/0001', 'बिल INV/26-27/0001'],
    ['Credit note CN/26-27/0001', 'CN/26-27/0001', 'क्रेडिट नोट CN/26-27/0001'],
    ['Receipt RCT/26-27/0001', 'RCT/26-27/0001', 'रसीद RCT/26-27/0001'],
    ['Payment PAY/26-27/0004', 'PAY/26-27/0004', 'भुगतान PAY/26-27/0004'],
    ['Purchase bill PB/26-27/0007 · AT/778', 'PB/26-27/0007', 'खरीद बिल PB/26-27/0007 · AT/778'],
    ['Void Invoice INV/26-27/0002', 'INV/26-27/0002', 'रद्द बिल INV/26-27/0002'],
  ])('words "%s" in the app language', (note, number, expected) => {
    expect(localiseNarration(note, number, t)).toBe(expected);
  });

  it("leaves a merchant's own note alone, even one that starts with the same word", () => {
    expect(localiseNarration('Invoice for cement, paid later', 'INV/26-27/0001', t)).toBe(
      'Invoice for cement, paid later'
    );
    expect(localiseNarration('Receipt RCT/26-27/0009', 'RCT/26-27/0001', t)).toBe(
      'Receipt RCT/26-27/0009'
    );
  });

  it('leaves a row with no document number alone', () => {
    expect(localiseNarration('Invoice INV/26-27/0001', null, t)).toBe('Invoice INV/26-27/0001');
  });
});
