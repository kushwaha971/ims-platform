/**
 * The landing page's plans — PROPOSED, not approved, and nothing is charged.
 *
 * There is no billing in this product: no payment gateway, no invoices from
 * us, no plan a merchant can buy. So the page says so in words for as long as
 * `status` is `'proposed'`, and every plan's button is "Start free" to
 * `/signup`. When the owner approves the figures, flipping `status` to
 * `'approved'` removes the notice and nothing else; wiring a real checkout is a
 * separate change with its own ADR (ADR-021 — no payment gateway today).
 *
 * The rules the figures follow, each asserted by `LandingPage.test.tsx`:
 *  - Yearly is EXACTLY ten months of monthly ("2 months free"). No
 *    strikethrough "was" price, because there never was one.
 *  - Prices are INR and exclude GST.
 *  - No plan is called "most popular": nobody has bought any of them, so the
 *    claim would be invented. Business carries "Good for growing shops".
 *
 * This module imports nothing, so the pricing section's chunk does not pull a
 * formatter or a slice in to read four numbers.
 */
/**
 * CR-2026-09-29-PLATFORM-D — the owner has hidden pricing on the landing page
 * for now, to be decided later. This is the ONE switch. While it is `false`:
 * no #pricing section, no Pricing link in the header, the phone menu or the
 * footer, no "What does it cost?" in the FAQ (a neutral "Do I need a card?"
 * stands in, which says nothing about prices), and no `offers` in the JSON-LD.
 * "Start free" stays, because nothing is charged today and that is true.
 *
 * Read at RENDER time, never folded into a module-level constant, so a test can
 * flip it (`LandingPage.pricingFlag.test.tsx`). The section, its figures and
 * their tests are kept exactly as they were.
 */
export const SHOW_PRICING: boolean = false;

export type PricingStatus = 'proposed' | 'approved';
export type BillingCycle = 'monthly' | 'yearly';
export type PlanId = 'free' | 'starter' | 'business' | 'wholesale';

/** A limit line on a plan card. `null` count means "unlimited". */
export type PlanLimit =
  | { readonly kind: 'logins'; readonly count: number }
  | { readonly kind: 'devices'; readonly count: number | null }
  | { readonly kind: 'invoices'; readonly count: number | null }
  | { readonly kind: 'items'; readonly count: number };

export interface Plan {
  readonly id: PlanId;
  /** INR per month, before GST. */
  readonly monthly: number;
  readonly limits: readonly PlanLimit[];
  /** The "Everything in … plus" line, by its id in the pricing catalogue. */
  readonly includes: 'includes' | 'includesFree';
  /** The feature lines this plan adds, by short id (see PlanFeature). */
  readonly features: readonly PlanFeature[];
  /** Carries a quiet badge. Never "most popular" — see the header. */
  readonly highlight?: boolean;
}

export interface Pricing {
  readonly status: PricingStatus;
  readonly currency: 'INR';
  readonly plans: readonly Plan[];
}

/** Yearly billing is this many months of the monthly price: two months free. */
export const YEARLY_BILLED_MONTHS = 10;

export const yearlyPrice = (monthly: number): number => monthly * YEARLY_BILLED_MONTHS;

export const priceFor = (plan: Plan, cycle: BillingCycle): number =>
  cycle === 'yearly' ? yearlyPrice(plan.monthly) : plan.monthly;

/**
 * Feature lines by SHORT id, not message id. This file is imported by the
 * page's client components for `SHOW_PRICING`, and the checker
 * (`scripts/check-locales.mjs`) counts every full message id a module spells
 * out as words that module renders — so full ids here would make `/` load the
 * `landingPricing` catalogue it never shows. `PricingSection` builds the ids.
 */
export type PlanFeature =
  | 'khata'
  | 'statements'
  | 'reminders'
  | 'invoices'
  | 'dashboard'
  | 'export'
  | 'languages'
  | 'estimates'
  | 'stock'
  | 'expenses'
  | 'reports'
  | 'import'
  | 'roles'
  | 'credit';

const FREE_FEATURES: readonly PlanFeature[] = [
  'khata',
  'statements',
  'reminders',
  'invoices',
  'dashboard',
  'export',
  'languages',
];

const PAID_FEATURES: readonly PlanFeature[] = ['estimates', 'stock', 'expenses', 'reports', 'import', 'roles', 'credit'];

export const PRICING: Pricing = {
  status: 'proposed',
  currency: 'INR',
  plans: [
    {
      id: 'free',
      monthly: 0,
      limits: [
        { kind: 'logins', count: 1 },
        { kind: 'devices', count: 2 },
        { kind: 'invoices', count: 30 },
        { kind: 'items', count: 100 },
      ],
      includes: 'includes',
      features: FREE_FEATURES,
    },
    {
      id: 'starter',
      monthly: 149,
      limits: [
        { kind: 'logins', count: 2 },
        { kind: 'devices', count: 4 },
        { kind: 'invoices', count: 300 },
      ],
      includes: 'includesFree',
      features: PAID_FEATURES,
    },
    {
      id: 'business',
      monthly: 349,
      limits: [
        { kind: 'logins', count: 5 },
        { kind: 'devices', count: 10 },
        { kind: 'invoices', count: null },
      ],
      includes: 'includesFree',
      features: PAID_FEATURES,
      highlight: true,
    },
    {
      id: 'wholesale',
      monthly: 699,
      limits: [
        { kind: 'logins', count: 15 },
        { kind: 'devices', count: null },
        { kind: 'invoices', count: null },
      ],
      includes: 'includesFree',
      features: PAID_FEATURES,
    },
  ],
};
