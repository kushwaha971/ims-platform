/**
 * The words that belong to a PLANNED module — lending, library, gym, hotel —
 * in both languages. A landing string that uses one of them is talking about
 * something that cannot be used yet, so it may appear only where the page says
 * so: inside a planned module's own card, tile or row, or in the two FAQ
 * answers that exist to say those modules are not built.
 *
 * Two tests read this list. `unbuiltFeatureCopy.test.ts` checks the catalogue
 * by KEY (only `landing.module.<planned id>.*` and the planned-scope FAQ keys
 * may match). `LandingPage.test.tsx` checks the RENDERED page by ancestor
 * (every matching text node sits inside `[data-module-status="planned"]` or
 * `[data-planned-scope]`), which also catches a hard-coded string.
 *
 * Deliberately not listed: "collect" and "उधार", which are live (a shop
 * collects what customers owe it), and "book", which the live day book uses.
 * "हिसाब-किताब" is the everyday Hindi for "accounts" and is excluded by a
 * lookbehind; किताब on its own is a library's book.
 */
export const PLANNED_MODULE_WORDS = {
  en: /\blend(er|ers|ing)?\b|\bborrow|\bprincipal\b|\binterest\b|\binstalments?\b|\bloans?\b|librar|\bgyms?\b|fitness|\bmembers?(hip)?\b|renewal|attendance|hotel|\bguests?\b|\brooms?\b|booking|check-?(in|out)\b/i,
  hi: /कर्ज़|क़र्ज़|वसूली|ब्याज|मूलधन|किस्त|लाइब्रेरी|(?<!हिसाब-)किताब|जिम|फ़िटनेस|सदस्य|रिन्यूअल|हाज़िरी|होटल|गेस्ट हाउस|कमरे|बुकिंग|चेक-इन|चेक-आउट|मेहमान/u,
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
