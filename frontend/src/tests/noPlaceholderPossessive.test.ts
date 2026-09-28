import { en } from 'src/tests/allMessages';

/**
 * Final UAT D8 — the invoice issued dialog read "Ramesh Traders's khata": an
 * English possessive glued to a placeholder cannot know the name it will
 * receive ("Traders's", "Sharma & Sons's", an invoice number's "’s due"). The
 * sentence is phrased around the name instead ("the khata of Ramesh Traders").
 */
describe('UAT-D8: no en string puts a possessive on a placeholder', () => {
  it('has no "{x}\'s" or "{x}’s" anywhere in the English copy', () => {
    const offending = Object.entries(en as Record<string, string>).filter(([, value]) =>
      /\}['’]s\b/u.test(value)
    );
    expect(offending).toEqual([]);
  });

  it('the issued dialog names the party after the khata', () => {
    expect(en['sales.issued.addedToKhata']).toBe('{amount} added to the khata of {party}');
  });
});
