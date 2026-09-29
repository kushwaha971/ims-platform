import { en, hi } from 'src/tests/allMessages';
import { LANDING_JARGON, PLANNED_MODULE_WORDS, withoutBrand } from 'src/tests/plannedModuleVocabulary';

import { UPCOMING_MODULES } from 'modules/DigiKhaato/features/landing/config/modules';

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
  /* RPT-01 — the three "go to Customers" lines D-L5 wrote while `/dashboard`
     was a redirect now say Dashboard, because that is where they lead. Their
     guard is the reverse one below: they must not go back to promising the
     customer list. */
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

  it.each(['common.action.goToDashboard', 'team.accept.goToDashboard', 'nav.brandHome'])(
    '%s names the dashboard it links to, now that it exists (RPT-01)',
    (key) => {
      expect(enMessages[key]).toMatch(/dashboard/i);
      expect(hiMessages[key]).toMatch(/डैशबोर्ड/u);
    }
  );

  it('retires the old opening-balance key rather than leaving it to be reused', () => {
    expect(enMessages['parties.form.opening.notPostedYet']).toBeUndefined();
    expect(hiMessages['parties.form.opening.notPostedYet']).toBeUndefined();
  });
});

/**
 * The landing page (`/`) is the one surface whose whole job is to make claims,
 * so it gets the whole list rather than one row per key. Owner, verbatim in
 * substance: never mention a feature that is not built — offline mode, SMS or
 * email sending, e-invoice or e-way bill, GST return filing, bank sync, a
 * payment gateway, barcode, P&L or balance sheet, multiple branches, a native
 * app — and no testimonials, user counts, ratings or invented figures.
 *
 * Every `landing.*` string in both languages is checked. The one exception is
 * the FAQ answer about e-invoicing, which exists to say plainly that it is NOT
 * supported; it is allowed the word, and is required to carry the "not".
 */
describe('the landing page promises only what is built', () => {
  const enMessages = en as Record<string, string>;
  const hiMessages = hi as Record<string, string>;
  const landingKeys = Object.keys(enMessages).filter((key) => key.startsWith('landing.'));
  const E_INVOICE_FAQ = new Set(['landing.faq.einvoice.q', 'landing.faq.einvoice.a']);

  const UNBUILT: readonly { readonly what: string; readonly en: RegExp; readonly hi: RegExp }[] = [
    { what: 'offline mode', en: /off-?line/i, hi: /ऑफ़?लाइन/u },
    { what: 'SMS sending', en: /\bSMS\b|text message/i, hi: /SMS|एसएमएस/u },
    {
      what: 'email sending (DEC-012)',
      en: /(send|sent|sends|by)\s+(an\s+)?e-?mail|e-?mail(ed|s)?\s+(to|reminders?|invoices?|bills?|statements?)/i,
      hi: /ई-?मेल\s*(से|पर)\s*(भेज|रिमाइंडर|बिल)/u,
    },
    { what: 'e-invoice', en: /e-?invoic/i, hi: /ई-?इनवॉइस/u },
    { what: 'e-way bill', en: /e-?way/i, hi: /ई-?वे/u },
    { what: 'GST return filing', en: /GSTR|file (your )?(GST )?returns?|return filing/i, hi: /GSTR|रिटर्न/u },
    { what: 'bank sync', en: /\bbank\b/i, hi: /बैंक/u },
    { what: 'a payment gateway', en: /gateway|pay online|accept (online |card |UPI )?payments/i, hi: /गेटवे|ऑनलाइन पेमेंट/u },
    { what: 'barcode', en: /barcode|\bscan/i, hi: /बारकोड|स्कैन/u },
    { what: 'P&L and balance sheet', en: /profit|P&L|balance sheet/i, hi: /लाभ|मुनाफ़ा|बैलेंस शीट/u },
    { what: 'multiple branches', en: /branch|multi-?(store|shop|location)/i, hi: /ब्रांच|शाखा/u },
    {
      what: 'a native app',
      en: /app store|play store|google play|download the app|install the app|mobile app|android app|ios app|\bapk\b/i,
      hi: /ऐप स्टोर|प्ले स्टोर|ऐप डाउनलोड|मोबाइल ऐप/u,
    },
    {
      what: 'something sent on the merchant\'s behalf (DEC-012)',
      en: /we send|sent automatically|automatic(ally)? (send|remind)|auto-?remind/i,
      hi: /अपने-आप भेज|हम भेज/u,
    },
  ];

  const CLAIMS: readonly { readonly what: string; readonly en: RegExp; readonly hi: RegExp }[] = [
    {
      what: 'a user count',
      en: /\d[\d,.]*\s*(\+|k\b|lakh|crore)?\s*(users|shops|merchants|businesses|customers|downloads|shopkeepers)\b/i,
      hi: /\d[\d,.]*\s*\+?\s*(दुकानें|दुकानदार|यूज़र|व्यापारी)/u,
    },
    { what: 'a rating or testimonial', en: /\brated\b|rating|★|\bstars?\b|testimonial|review/i, hi: /रेटिंग|समीक्षा/u },
    {
      what: 'a popularity claim',
      en: /most popular|trusted by|loved by|thousands|lakhs|millions|#1|number one|best-selling/i,
      hi: /सबसे लोकप्रिय|हज़ारों|लाखों|करोड़ों|नंबर 1/u,
    },
    { what: 'an invented percentage', en: /\d\s*%/, hi: /\d\s*%/u },
  ];

  it('has landing copy in both languages to check', () => {
    expect(landingKeys.length).toBeGreaterThan(100);
    landingKeys.forEach((key) => expect(hiMessages[key]).toBeTruthy());
  });

  it.each(UNBUILT.map((row) => [row.what, row]))('never mentions %s', (_what, row) => {
    const offending = landingKeys
      .filter((key) => !(row.what === 'e-invoice' && E_INVOICE_FAQ.has(key)))
      .flatMap((key) => [
        ...(row.en.test(enMessages[key] ?? '') ? [`${key} (en): ${enMessages[key]}`] : []),
        ...(row.hi.test(hiMessages[key] ?? '') ? [`${key} (hi): ${hiMessages[key]}`] : []),
      ]);
    expect(offending).toEqual([]);
  });

  it.each(CLAIMS.map((row) => [row.what, row]))('makes no %s', (_what, row) => {
    const offending = landingKeys.flatMap((key) => [
      ...(row.en.test(enMessages[key] ?? '') ? [`${key} (en): ${enMessages[key]}`] : []),
      ...(row.hi.test(hiMessages[key] ?? '') ? [`${key} (hi): ${hiMessages[key]}`] : []),
    ]);
    expect(offending).toEqual([]);
  });

  it('answers the e-invoice question with a plain "not today", never a "soon"', () => {
    expect(enMessages['landing.faq.einvoice.a']).toMatch(/^Not today\./);
    expect(enMessages['landing.faq.einvoice.a']).toMatch(/does not/);
    expect(hiMessages['landing.faq.einvoice.a']).toMatch(/^आज नहीं।/u);
    landingKeys.forEach((key) => {
      expect(enMessages[key]).not.toMatch(/\bsoon\b|coming/i);
      expect(hiMessages[key]).not.toMatch(/जल्द/u);
    });
  });

  it('keeps the brand name in Latin script in Hindi', () => {
    const hindiWithBrand = landingKeys.filter((key) => /YourKhata/.test(enMessages[key] ?? ''));
    expect(hindiWithBrand.length).toBeGreaterThan(0);
    hindiWithBrand.forEach((key) => expect(hiMessages[key]).toContain('YourKhata'));
    landingKeys.forEach((key) => expect(hiMessages[key]).not.toMatch(/योरखाता|यॉरखाता/u));
  });
});

/**
 * CR-2026-09-29-PLATFORM-B — the landing page now names four modules that are
 * not built (lending, library, gym, hotel). Owner rule (vision §4): they are
 * shown as planned and nothing more. So a planned module's words — lender,
 * borrower, interest, library, gym, member, hotel, room, booking… — may appear
 * in exactly two kinds of place:
 *   1. its own card, tile or row, whose copy is `landing.module.<id>.*` for an
 *      id `config/modules.ts` marks as not live; and
 *   2. the two FAQ answers that exist to say those modules cannot be used yet,
 *      which are required to say "planned" and "not".
 * Anywhere else — the hero, the rotating word, a live feature card, the
 * pricing — the same word would read as a promise. `LandingPage.test.tsx`
 * checks the rendered page against the same list by ancestor.
 */
describe('planned modules are spoken of only from a planned card', () => {
  const enMessages = en as Record<string, string>;
  const hiMessages = hi as Record<string, string>;
  const landingKeys = Object.keys(enMessages).filter((key) => key.startsWith('landing.'));
  const PLANNED_PREFIXES = UPCOMING_MODULES.map((module) => `landing.module.${module.id}.`);
  const PLANNED_SCOPE_FAQ = ['landing.faq.modules.q', 'landing.faq.modules.a', 'landing.faq.lending.q', 'landing.faq.lending.a'];
  const allowed = (key: string) =>
    PLANNED_PREFIXES.some((prefix) => key.startsWith(prefix)) || PLANNED_SCOPE_FAQ.includes(key);

  it('has planned-module copy to check, in both languages', () => {
    expect(UPCOMING_MODULES.length).toBeGreaterThan(0);
    PLANNED_PREFIXES.forEach((prefix) => {
      expect(landingKeys.filter((key) => key.startsWith(prefix)).length).toBeGreaterThan(4);
    });
  });

  it.each([
    ['en', PLANNED_MODULE_WORDS.en],
    ['hi', PLANNED_MODULE_WORDS.hi],
  ] as const)('uses planned-module words only in planned-module keys (%s)', (lang, pattern) => {
    const messages = lang === 'en' ? enMessages : hiMessages;
    const offending = landingKeys
      .filter((key) => pattern.test(messages[key] ?? '') && !allowed(key))
      .map((key) => `${key}: ${messages[key]}`);
    expect(offending).toEqual([]);
  });

  it('makes the two planned-scope FAQ answers say "planned" and "not"', () => {
    ['landing.faq.modules.a', 'landing.faq.lending.a'].forEach((key) => {
      expect(enMessages[key]).toMatch(/\bplanned\b/);
      expect(enMessages[key]).toMatch(/\bnot\b|cannot/);
      expect(hiMessages[key]).toMatch(/योजना/u);
      expect(hiMessages[key]).toMatch(/नहीं/u);
    });
    expect(enMessages['landing.faq.lending.a']).toMatch(/^Not yet\./);
    expect(hiMessages['landing.faq.lending.a']).toMatch(/^अभी नहीं।/u);
  });

  /** Vision §4: record-keeping, not lending. The card and the FAQ both say so. */
  it('says the lending module will keep records and will not lend or move money', () => {
    ['landing.module.lending.purpose', 'landing.faq.lending.a'].forEach((key) => {
      expect(enMessages[key]).toMatch(/not lend/);
      expect(enMessages[key]).toMatch(/move money/);
    });
  });

  /** Vision §4 — no "kirana", no regional jargon: shop, store, business, organisation. */
  it.each([
    ['en', LANDING_JARGON.en],
    ['hi', LANDING_JARGON.hi],
  ] as const)('uses no regional jargon in any landing string (%s)', (lang, pattern) => {
    const messages = lang === 'en' ? enMessages : hiMessages;
    const offending = landingKeys
      .filter((key) => pattern.test(withoutBrand(messages[key] ?? '')))
      .map((key) => `${key}: ${messages[key]}`);
    expect(offending).toEqual([]);
  });
});
