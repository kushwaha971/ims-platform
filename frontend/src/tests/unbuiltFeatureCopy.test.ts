import en from 'locales/en.json';
import hi from 'locales/hi.json';

/**
 * UAT D8 — copy that promised features the product does not have, or described
 * behaviour it no longer has. Owner rule (docs/DESIGN-SYSTEM.md §5): what is
 * not built is not shown, and that includes a sentence about it. DEC-010 (a
 * user has no mobile number) and DEC-012 (nothing is sent on the merchant's
 * behalf) are the two decisions most of these lines had drifted from.
 *
 * Each row names the key, what it used to say, and a pattern the stale wording
 * matched in each language, so the line cannot quietly come back — through a
 * translation refresh, say — without this failing.
 */
const STALE: readonly {
  readonly key: string;
  readonly why: string;
  readonly en: RegExp;
  readonly hi: RegExp;
}[] = [
  {
    key: 'parties.form.opening.postedOnSave',
    why: 'the opening balance posts on save (LED-02); it no longer "joins the balance when entries arrive"',
    en: /joins the khata|for now/i,
    hi: /एंट्री आने पर/u,
  },
  {
    key: 'onboarding.phone.hint',
    why: 'DEC-010: a user has no number of their own to fall back on',
    en: /your own number/i,
    hi: /आपका नंबर इस्तेमाल/u,
  },
  {
    key: 'onboarding.rail.reassurance',
    why: 'Settings is not built ("Soon" in the sidebar)',
    en: /settings/i,
    hi: /सेटिंग्स/u,
  },
  {
    key: 'onboarding.summary.changeable',
    why: 'Settings is not built ("Soon" in the sidebar)',
    en: /settings/i,
    hi: /सेटिंग्स/u,
  },
  {
    key: 'auth.hero.description',
    why: 'stock is not built',
    en: /stock/i,
    hi: /स्टॉक/u,
  },
  {
    key: 'parties.archive.consequence.pickers',
    why: 'bills are not built',
    en: /bill/i,
    hi: /बिल/u,
  },
  {
    key: 'team.invite.submit',
    why: 'DEC-012: nothing is sent — the owner copies the link',
    en: /send/i,
    hi: /भेजें/u,
  },
  {
    key: 'team.invite.submitting',
    why: 'DEC-012: nothing is sent',
    en: /send/i,
    hi: /भेजा/u,
  },
  {
    key: 'team.invite.error',
    why: 'DEC-012: nothing is sent',
    en: /send/i,
    hi: /भेज/u,
  },
  {
    key: 'team.list.empty.firstUse.title',
    why: 'DEC-012: an invite is a link the owner creates, not an invitation sent',
    en: /invited/i,
    hi: /बुलाया/u,
  },
];

describe('no copy for unbuilt features or retired behaviour (UAT D8)', () => {
  const enMessages = en as Record<string, string>;
  const hiMessages = hi as Record<string, string>;

  it.each(STALE.map((row) => [row.key, row]))('%s is current in English', (key, row) => {
    const value = enMessages[key];
    expect(value).toBeTruthy();
    expect({ key, why: row.why, stale: row.en.test(value ?? '') }).toEqual({
      key,
      why: row.why,
      stale: false,
    });
  });

  it.each(STALE.map((row) => [row.key, row]))('%s is current in Hindi', (key, row) => {
    const value = hiMessages[key];
    expect(value).toBeTruthy();
    expect({ key, why: row.why, stale: row.hi.test(value ?? '') }).toEqual({
      key,
      why: row.why,
      stale: false,
    });
  });

  it('retires the old opening-balance key rather than leaving it to be reused', () => {
    expect(enMessages['parties.form.opening.notPostedYet']).toBeUndefined();
    expect(hiMessages['parties.form.opening.notPostedYet']).toBeUndefined();
  });
});
