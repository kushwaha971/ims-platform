import type { LandingModuleId } from './modules';

/**
 * The FAQ, in the order people ask. Every answer is checked against what is
 * built or decided (docs/platform/01-current-capabilities.md and the vision
 * doc). Copy is in the landing catalogue as `landing.faq.<id>.q` and
 * `landing.faq.<id>.a`.
 *
 * Its own module, because TWO things read it and one of them is on the server:
 * the FAQ section renders the questions, and `app/page.tsx` builds the
 * `FAQPage` JSON-LD from the SAME ids and the same English strings
 * (CR-2026-09-29-PLATFORM-C). An export of a `'use client'` file is a client
 * reference on the server, not the array, so the list cannot live in the
 * component file.
 *
 * Pricing (CR-2026-09-29-PLATFORM-D): "What does it cost?" points at the
 * pricing section, so it is asked only while `SHOW_PRICING` is on. While
 * pricing is hidden, "Do I need a card?" takes its place and says nothing
 * about prices. The caller passes the flag, so this module reads nothing at
 * load time and a test can build either list.
 */
const BEFORE_COST = ['modules', 'lending', 'phone', 'hindi', 'gst', 'staff', 'export'] as const;
const AFTER_COST = ['brand', 'einvoice'] as const;

export type FaqId =
  | (typeof BEFORE_COST)[number]
  | (typeof AFTER_COST)[number]
  | 'cost'
  | 'card';

export const faqIds = (showPricing: boolean): readonly FaqId[] => [
  ...BEFORE_COST,
  showPricing ? 'cost' : 'card',
  ...AFTER_COST,
];

/**
 * An answer that talks about ONE module carries that module's id, and the
 * answer that names every module is the summary. The rendered page marks
 * their items with `data-module-id` / `data-module-summary`, which is how the
 * module-vocabulary guard (`src/tests/moduleVocabulary.ts`) knows a word such
 * as "borrower" is in its own place.
 */
export const FAQ_MODULE_SCOPE: Readonly<Partial<Record<FaqId, LandingModuleId | 'summary'>>> = {
  modules: 'summary',
  lending: 'lending',
};

export const faqQuestionKey = (id: FaqId): string => `landing.faq.${id}.q`;
export const faqAnswerKey = (id: FaqId): string => `landing.faq.${id}.a`;
