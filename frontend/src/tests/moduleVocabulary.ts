import type { LandingModuleId } from 'modules/DigiKhaato/features/landing/config/modules';

/**
 * CR-2026-09-29-PLATFORM-D — the words that belong to ONE module, in both
 * languages. The landing page presents every module as part of the product,
 * so the guard is no longer "planned words stay in planned places" but a
 * simpler one: a module's own words stay in that module's own places. A
 * borrower belongs on the lending card, a guest on the hotel card, a book
 * on the library card — the same word on the shop's explorer, in the hero or
 * on the gym's card would describe something that module does not do.
 *
 * Two tests read this list. `unbuiltFeatureCopy.test.ts` checks the catalogue
 * by KEY (`landing.module.<id>.*` and `landing.faq.<id>.*` are the module's
 * own; `SUMMARY_KEYS` name every module at once). `LandingPage.test.tsx` checks
 * the RENDERED page by ancestor (`[data-module-id="<id>"]` or
 * `[data-module-summary]`), which also catches a hard-coded string.
 *
 * Only words unique to one module are listed. Words two modules share —
 * member (gym and library), fees, attendance, instalments, refunds,
 * collect/वसूली (a shop collects too) — are
 * nobody's, and are not. Shop & billing has no list: it is the platform's
 * first module and its words (bill, stock, GST) are the page's everyday
 * vocabulary. "हिसाब-किताब" is the everyday Hindi for "accounts" and is
 * excluded by a lookbehind; किताब on its own is a library's book.
 */
export const MODULE_WORDS: Readonly<Record<Exclude<LandingModuleId, 'shop'>, { en: RegExp; hi: RegExp }>> = {
  lending: {
    en: /\blend(er|ers|ing)?\b|\bborrow|\bprincipal\b|\binterest\b|\bloans?\b/i,
    hi: /कर्ज़|क़र्ज़|ब्याज|मूलधन/u,
  },
  library: {
    en: /librar|\bfines?\b|overdue|\bcatalogue\b/i,
    hi: /लाइब्रेरी|(?<!हिसाब-)किताब|जुर्माना/u,
  },
  gym: {
    en: /\bgyms?\b|fitness|workout/i,
    hi: /जिम|फ़िटनेस/u,
  },
  hotel: {
    en: /hotel|\bguests?\b|\brooms?\b|booking|\bbooked\b|check-?(in|out)\b/i,
    hi: /होटल|गेस्ट हाउस|कमर[ाे]|बुकिंग|बुक |चेक-इन|चेक-आउट|मेहमान/u,
  },
};

/**
 * Coaching & tuition: added and withdrawn by the owner on 29 Sep 2026 ("I need
 * library mgmt system, not coaching"). Kept as a list so the page cannot
 * name it again by accident; `research/coaching.md` stays for reference.
 */
export const WITHDRAWN_MODULE_WORDS = {
  en: /coaching|tuition|\btutors?\b|\bstudents?\b|guardian/i,
  hi: /कोचिंग|ट्यूशन|ट्यूटर|छात्र|अभिभावक/u,
} as const;

/** Keys that name EVERY module at once, and may therefore use any module's words. */
export const SUMMARY_KEYS: readonly string[] = ['landing.faq.modules.q', 'landing.faq.modules.a'];

/** The keys a module owns: its card copy, and an FAQ entry about it alone. */
export const ownsKey = (id: LandingModuleId, key: string): boolean =>
  key.startsWith(`landing.module.${id}.`) || key.startsWith(`landing.faq.${id}.`);

/**
 * The words a status label would use (vision §4: no Live / Planned / In
 * development anywhere on the page). "चालू बाकी" is the running balance, not a
 * status, so it is excluded.
 */
export const STATUS_WORDS = {
  en: /\blive\b|\bplanned\b|in development|not yet|coming soon|\bsoon\b|when (it|they) (launch|ships?)|not (yet )?available|cannot be used yet/i,
  hi: /चालू(?! बाकी)|योजना में|बन रहा है|अभी नहीं|उपलब्ध नहीं|जल्द/u,
} as const;

/**
 * Regional or specialised jargon the landing page does not use (vision §4):
 * plain product words instead. "kirana" in any language, and the
 * transliterations "udhaar" and "khata" as common nouns in English — the brand
 * name YourKhata is the one exception, and is stripped before matching.
 */
export const LANDING_JARGON = {
  en: /kirana|udhaa?r|\bkhata\b/i,
  hi: /किराना|kirana/iu,
} as const;

export const withoutBrand = (text: string): string => text.replace(/YourKhata/g, '');

/**
 * "Why YourKhata" (owner, 29 Sep 2026) contrasts what other apps commonly miss
 * with what YourKhata does, and must stay GENERIC: no competitor is named on
 * the page, in either language. The list is the competitor set of
 * docs/platform/research/candidates-and-competitors.md §5 plus the Indian
 * ledger and billing apps the older research names. Words that are also
 * ordinary English (Square, Busy, Tally, Marg, Swipe) are matched only
 * capitalised, as names; "व्यापार" is the Hindi for business and is not a name.
 */
export const COMPETITOR_NAMES = {
  en: [
    /zoho|odoo|vyapar|mybillbook|khatabook|okcredit|mindbody|glofox|pushpress|gymdesk|zen ?planner|dukaan|bizom|pagarbook|biz ?analyst|tally ?prime/i,
    /\b(Square|Busy|Tally|Marg|Swipe)\b/,
  ],
  hi: [/ज़ोहो|जोहो|ओडू|खाताबुक|ओकेक्रेडिट|टैली|माइबिलबुक|वायपार/u],
} as const;

/** A ranking nobody has measured: "cheapest", "best", "#1", "better than", "the only app". */
export const COMPARATIVE_CLAIMS = {
  en: /cheapest|\bbest\b|#1|number one|better than|unlike (other|any)|the only (app|one)|lowest price|fastest|leading|world-class|unbeatable/i,
  hi: /सबसे सस्त|सबसे अच्छ|सबसे बढ़िया|नंबर 1|से बेहतर|इकलौत/u,
} as const;

export const namesACompetitor = (text: string, lang: 'en' | 'hi'): boolean =>
  COMPETITOR_NAMES[lang].some((pattern) => pattern.test(withoutBrand(text)));
