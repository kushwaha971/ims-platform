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
    why: 'Settings was not built when this copy was written',
    en: /settings/i,
    hi: /सेटिंग्स/u,
  },
  {
    key: 'onboarding.summary.changeable',
    why: 'Settings was not built when this copy was written',
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
  // ── D-L5: the rest of onboarding, and the dashboard that was removed ──────
  {
    key: 'onboarding.gst.composition.hint',
    why: 'D-L5: bills (of supply) are not built',
    en: /bill/i,
    hi: /बिल/u,
  },
  {
    key: 'onboarding.gst.regular.hint',
    why: 'D-L5: tax invoices are not built',
    en: /invoice/i,
    hi: /इनवॉइस/u,
  },
  {
    key: 'onboarding.gst.unregistered.hint',
    why: 'D-L5: estimates and invoices are not built',
    en: /estimate|invoice/i,
    hi: /अनुमान|इनवॉइस/u,
  },
  {
    key: 'onboarding.state.hint',
    why: 'D-L5: bills are not built',
    en: /bill/i,
    hi: /बिल/u,
  },
  {
    key: 'onboarding.step3.body',
    why: 'D-L5: printed bills are not built (the address prints on statements)',
    en: /bill/i,
    hi: /बिल/u,
  },
  {
    key: 'onboarding.subtitle',
    why: 'D-L5: "change any of it later" needs Settings, which is not built',
    en: /later/i,
    hi: /बाद में/u,
  },
  {
    key: 'onboarding.type.hint',
    why: 'D-L5: "change everything later" needs Settings, which is not built',
    en: /later/i,
    hi: /बाद में/u,
  },
  {
    key: 'onboarding.step2.body',
    why: 'D-L5: "add it any time" needs Settings, which is not built',
    en: /any time/i,
    hi: /कभी भी/u,
  },
  {
    key: 'onboarding.type.retail.hint',
    why: 'D-L5: stock and bills are not built',
    en: /stock|bill/i,
    hi: /स्टॉक|बिल/u,
  },
  {
    key: 'onboarding.type.food.hint',
    why: 'D-L5: bills are not built',
    en: /bill/i,
    hi: /बिल/u,
  },
  {
    key: 'onboarding.type.services.hint',
    why: 'D-L5: stock is not built, and the day count is a bill due date',
    en: /stock|\d+-day/i,
    hi: /स्टॉक|\d+ दिन/u,
  },
  {
    key: 'onboarding.type.professional.hint',
    why: 'D-L5: stock is not built',
    en: /stock/i,
    hi: /स्टॉक/u,
  },
  {
    key: 'onboarding.type.wholesale.hint',
    why: 'D-L5: units (items) are not built, and the day count is a bill due date',
    en: /units|\d+-day/i,
    hi: /इकाइयाँ|\d+ दिन/u,
  },
  {
    key: 'onboarding.type.trader.hint',
    why: 'D-L5: units (items) are not built',
    en: /units/i,
    hi: /इकाइयाँ/u,
  },
  {
    key: 'common.action.goToDashboard',
    why: 'D-L5: there is no dashboard; the landing page is the customer list',
    en: /dashboard/i,
    hi: /डैशबोर्ड/u,
  },
  {
    key: 'team.accept.goToDashboard',
    why: 'D-L5: there is no dashboard; the landing page is the customer list',
    en: /dashboard/i,
    hi: /डैशबोर्ड/u,
  },
  {
    key: 'nav.brandHome',
    why: 'D-L5: there is no dashboard; the logo goes to the customer list',
    en: /dashboard/i,
    hi: /डैशबोर्ड/u,
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

  /**
   * D-L5 — step 4's summary named defaults for three unbuilt screens (bills'
   * due days, items' units, expense categories), and four more keys were left
   * over from the Stock row UAT D8 removed. The keys are retired rather than
   * left unused, so the rows cannot come back by someone reaching for them.
   */
  it.each([
    'onboarding.summary.dueDays',
    'onboarding.summary.dueDays.value',
    'onboarding.summary.units',
    'onboarding.summary.expenses',
    'onboarding.summary.stock',
    'onboarding.summary.stock.unavailable',
    'onboarding.summary.on',
    'onboarding.summary.off',
  ])('retires %s in both locales (D-L5)', (key) => {
    expect(enMessages[key]).toBeUndefined();
    expect(hiMessages[key]).toBeUndefined();
  });

  it('retires the old opening-balance key rather than leaving it to be reused', () => {
    expect(enMessages['parties.form.opening.notPostedYet']).toBeUndefined();
    expect(hiMessages['parties.form.opening.notPostedYet']).toBeUndefined();
  });
});
