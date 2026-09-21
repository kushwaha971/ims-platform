/**
 * PLT-03 — the wizard's four steps, in their own leaf module.
 *
 * Why this is not in `businessTypes.ts` where it started: `onboardingSlice`
 * needs `ONBOARDING_STEP_COUNT` and nothing else from that file, but the store
 * registers every slice statically (§19.3.9, a deliberate decision), and the
 * store is in `AppProviders`, so `app/layout` reaches it on EVERY route. One
 * `import { ONBOARDING_STEP_COUNT }` therefore dragged `BUSINESS_TYPE_CONFIG`
 * and its nine `lucide-react` icon components into the chunk that `/legal/terms`
 * and `/d/[token]` download — measured at **1.7 KB gz** on every cold load of
 * every route, for icons that appear on one screen of the sign-up wizard.
 *
 * The rule this encodes: **a module a reducer imports is a module every route
 * ships.** Constants a slice reads live in a leaf with no component, no icon
 * and no library import; display tables live next to the screen that draws
 * them. `businessTypes.ts` re-exports both names so no caller had to change.
 */
export const ONBOARDING_STEPS = [
  { key: 'business', labelId: 'onboarding.step1.title' },
  { key: 'gst', labelId: 'onboarding.step2.title' },
  { key: 'address', labelId: 'onboarding.step3.title' },
  { key: 'summary', labelId: 'onboarding.step4.title' },
] as const;

export const ONBOARDING_STEP_COUNT = ONBOARDING_STEPS.length;
