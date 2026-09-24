import en from 'locales/en.json';
import hi from 'locales/hi.json';

/**
 * UAT D1 (High/P1) — Hindi flipped the direction of money.
 *
 * The balance filter's "Owes me" chip read "मुझे देना है" ("I have to pay"),
 * word for word the meaning of its neighbour "I owe them"; and the opening
 * balance's "They owe me" read "उन्हें देना है" ("I have to give them") while
 * the khata header above it correctly said "आपको मिलने हैं". A merchant choosing
 * a direction in Hindi was choosing the opposite of what they meant, on a
 * screen where the direction IS the number.
 *
 * The rule this file holds: every string that encodes a direction speaks in
 * the header's family, so no two screens can say it two ways —
 *
 *   receivable  आपको मिलने हैं   (first person: मुझे मिलने हैं)
 *   payable     आपको देने हैं    (first person: मुझे देने हैं)
 *   gave        आपने दिए
 *   got         आपको मिले
 *
 * The phrase table is driven from the ENGLISH value rather than a key list, so
 * the next key that says "You will get" is held to the same Hindi without
 * anybody remembering to add it here.
 */
const EN = en as Record<string, string>;
const HI = hi as Record<string, string>;

const RECEIVABLE = 'आपको मिलने हैं';
const PAYABLE = 'आपको देने हैं';
const RECEIVABLE_ME = 'मुझे मिलने हैं';
const PAYABLE_ME = 'मुझे देने हैं';
const GAVE = 'आपने दिए';
const GOT = 'आपको मिले';

const PHRASES: Readonly<Record<string, string>> = {
  'You will get': RECEIVABLE,
  'You will give': PAYABLE,
  'They owe me': RECEIVABLE_ME,
  'Owes me': RECEIVABLE_ME,
  'I owe them': PAYABLE_ME,
  'You gave': GAVE,
  'You got': GOT,
};

const keysWithEnglish = (value: string): string[] =>
  Object.keys(EN).filter((key) => EN[key] === value);

describe('Hindi direction strings speak in one family (UAT D1)', () => {
  it('anchors the family on the khata header pair', () => {
    expect(HI['parties.list.balance.receivable']).toBe(RECEIVABLE);
    expect(HI['parties.list.balance.payable']).toBe(PAYABLE);
  });

  it.each(Object.entries(PHRASES))('every "%s" reads "%s"', (english, hindi) => {
    const keys = keysWithEnglish(english);
    expect(keys.length).toBeGreaterThan(0);
    expect(Object.fromEntries(keys.map((key) => [key, HI[key]]))).toEqual(
      Object.fromEntries(keys.map((key) => [key, hindi]))
    );
  });

  it('gives the two balance chips opposite directions (the reported flip)', () => {
    const owesMe = HI['parties.list.filter.balance.owes_me'];
    const iOwe = HI['parties.list.filter.balance.i_owe'];
    expect(owesMe).not.toBe(iOwe);
    expect(owesMe).toBe(RECEIVABLE_ME);
    expect(iOwe).toBe(PAYABLE_ME);
  });

  it('gives the opening-balance pair opposite directions, matching the header', () => {
    expect(HI['ledger.opening.theyOwe']).toBe(RECEIVABLE_ME);
    expect(HI['ledger.opening.iOwe']).toBe(PAYABLE_ME);
    expect(HI['parties.form.opening.debit']).toBe(RECEIVABLE_ME);
    expect(HI['parties.form.opening.credit']).toBe(PAYABLE_ME);
  });

  it('says the amount-bearing hints in the same family', () => {
    expect(HI['ledger.opening.hint.debit']).toBe('आपको ₹{amount} मिलने हैं');
    expect(HI['ledger.opening.hint.credit']).toBe('आपको ₹{amount} देने हैं');
  });

  it('never puts a "give" verb on a receivable string, or a "get" verb on a payable one', () => {
    const receivableKeys = Object.keys(EN).filter((key) =>
      /(^|\.)(receivable|owes_me|theyOwe|toCollect)(\.|$)|opening\.(hint\.)?debit$/.test(key)
    );
    const payableKeys = Object.keys(EN).filter((key) =>
      /(^|\.)(payable|i_owe|iOwe|toPay|titleGive)(\.|$)|opening\.(hint\.)?credit$/.test(key)
    );
    expect(receivableKeys.length).toBeGreaterThan(5);
    expect(payableKeys.length).toBeGreaterThan(5);
    /* देना / देने / देंगे are the payable verbs; मिल… and लेना are the
       receivable ones. A receivable string may not carry a payable verb, which
       is exactly the shape of the reported defect. */
    expect(receivableKeys.filter((key) => /देना|देने|देंगे/u.test(HI[key] ?? ''))).toEqual([]);
    expect(payableKeys.filter((key) => /मिल|लेना|लेने/u.test(HI[key] ?? ''))).toEqual([]);
  });
});

describe('the lower-severity Hindi wording UAT listed (UAT D1)', () => {
  it('says "Overdue" one way everywhere', () => {
    const renderings = new Set(keysWithEnglish('Overdue').map((key) => HI[key]));
    expect(renderings.size).toBe(1);
  });

  it('says "Due today" as a whole phrase, not the fragment "आज की"', () => {
    expect(HI['parties.list.filter.collection.today']).not.toBe('आज की');
    expect(HI['parties.list.filter.collection.today']).toMatch(/आज/u);
    expect(HI['parties.list.filter.collection.today']).toMatch(/देय/u);
  });

  it('does not call the account section "खाता", which is the khata', () => {
    for (const key of ['nav.section.account', 'nav.account.menu', 'nav.account.trigger']) {
      expect(HI[key]).not.toMatch(/खाता/u);
    }
  });

  it('distinguishes the Insight section from the Reports link', () => {
    expect(HI['nav.section.insight']).not.toBe(HI['nav.reports']);
    expect(HI['nav.section.insight']).not.toBe(HI['nav.module.reports']);
  });
});
