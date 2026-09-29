/**
 * The FAQ, in the order people ask. Every answer is checked against what is
 * built (docs/platform/01-current-capabilities.md). Copy is in the landing
 * catalogue as `landing.faq.<id>.q` and `landing.faq.<id>.a`.
 *
 * Its own module, importing nothing, because TWO things read it and one of them
 * is on the server: the FAQ section renders the questions, and `app/page.tsx`
 * builds the `FAQPage` JSON-LD from the SAME ids and the same English strings
 * (CR-2026-09-29-PLATFORM-C). An export of a `'use client'` file is a client
 * reference on the server, not the array, so the list cannot live in the
 * component file.
 *
 * `modules` and `lending` are the two answers that exist to say, in words,
 * that the planned modules cannot be used yet. They are the only places
 * outside a planned module's own card where its words may appear, so their
 * items carry `data-planned-scope` — the marker `LandingPage.test.tsx` looks
 * for — and `unbuiltFeatureCopy.test.ts` requires each to say "planned" and
 * "not".
 */
export const FAQ_IDS = [
  'modules',
  'lending',
  'phone',
  'hindi',
  'gst',
  'staff',
  'export',
  'cost',
  'brand',
  'einvoice',
] as const;

export type FaqId = (typeof FAQ_IDS)[number];

export const PLANNED_SCOPE_FAQ_IDS: ReadonlySet<string> = new Set(['modules', 'lending']);

export const faqQuestionKey = (id: FaqId): string => `landing.faq.${id}.q`;
export const faqAnswerKey = (id: FaqId): string => `landing.faq.${id}.a`;
