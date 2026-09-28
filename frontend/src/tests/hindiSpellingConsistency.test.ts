import { hi } from 'src/tests/allMessages';

/**
 * L9 — one word, one spelling, across the Hindi copy.
 *
 * The statement sheet printed "बाकी" in its balance column and "शुरुआती बाक़ी"
 * in its opening row, on the same page a customer reads; the Team screen said
 * "व्यवसाय" where every other screen says "व्यापार". Each is correct Hindi on its
 * own and wrong beside the other, because a merchant reads two words as two
 * things. The majority spelling in hi.json won in each case: "बाकी" (no nukta)
 * and "व्यापार".
 */
const entries = Object.entries(hi as Record<string, string>);

describe('Hindi spelling consistency (L9)', () => {
  it('writes "balance / remaining" as बाकी everywhere, never with a nukta', () => {
    // U+0915 KA + U+093C NUKTA, and the precomposed U+0958 QA, both spell बाक़ी.
    const nukta = /बा(?:क़|क़)ी/u;
    expect(entries.filter(([, value]) => nukta.test(value))).toEqual([]);
  });

  it('calls the business व्यापार everywhere, the Team screen included', () => {
    expect(entries.filter(([, value]) => value.includes('व्यवसाय'))).toEqual([]);
  });
});
