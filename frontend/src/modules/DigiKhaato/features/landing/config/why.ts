/**
 * "Why YourKhata" (#why) — what other apps commonly miss, and what a business
 * gets here instead. Owner request, 29 Sep 2026 (CR-2026-09-29-PLATFORM-D).
 *
 * Each point is a pair in the landing catalogue: `landing.why.<id>.miss` (the
 * common failing, stated generically) and `landing.why.<id>.title` /
 * `.get` (what YourKhata does). The rules, held by `unbuiltFeatureCopy.test.ts`
 * and `LandingPage.test.tsx`:
 *  - no competitor is named, in either language (`COMPETITOR_NAMES` in
 *    `src/tests/moduleVocabulary.ts`);
 *  - no unverifiable comparison: no "cheapest", "best", "#1", "better than",
 *    "only app";
 *  - every `get` is TRUE today of the shared core or is a binding rule of the
 *    vision doc. The evidence for each is below, so the next person to edit a
 *    line knows what it stands on.
 *
 * | id          | evidence                                                                 |
 * |-------------|--------------------------------------------------------------------------|
 * | shared      | vision §1 and §3 rule 3 (one `parties`, one ledger, one print pipeline); `enabled_modules` switches per business (01-current-capabilities, Platform) |
 * | brand       | CLAUDE.md; `src/tests/customerDocumentsCarryNoProductName.test.tsx`; vision §4 |
 * | corrections | 01-current-capabilities, Ledger: reverse or correct, nothing deleted; Canon §0.11 rule 1 (model + database trigger) |
 * | payments    | 01-current-capabilities, Payments: UPI QR generated locally, no gateway, the money never passes through the product |
 * | roles       | 01-current-capabilities, Team: four roles with per-permission checks |
 * | data        | 01-current-capabilities, Import and export + Platform (`/settings/data` full export) |
 * | anywhere    | 01-current-capabilities, Platform: Hindi and English on every screen; the FAQ's browser answer |
 * | noads       | docs/02-product-vision.md "We will not run advertisements" and the "Never" row; no ad code in the product |
 *
 * Considered and left out: "we never store full ID numbers" — it is a design
 * in the lending and hospitality RESEARCH, not a binding rule, and the
 * hospitality design keeps full non-Aadhaar numbers behind an opt-in; the
 * business's own PAN is stored in full today (masked only on display).
 *
 * Imports nothing, so the section's chunk carries only the table.
 */
export const WHY_POINTS = [
  'shared',
  'brand',
  'corrections',
  'payments',
  'roles',
  'data',
  'anywhere',
  'noads',
] as const;

export type WhyId = (typeof WHY_POINTS)[number];

/** The three strings each point carries. */
export const WHY_PARTS = ['miss', 'title', 'get'] as const;

export const whyKey = (id: WhyId, part: (typeof WHY_PARTS)[number]): string => `landing.why.${id}.${part}`;
