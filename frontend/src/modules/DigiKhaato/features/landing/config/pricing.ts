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
  /** Message id of the "Everything in … plus" line, when it builds on another plan. */
  readonly includesKey: string;
  /** Message ids of the feature lines this plan adds. */
  readonly featureKeys: readonly string[];
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

const FREE_FEATURES = [
  'landing.pricing.f.khata',
  'landing.pricing.f.statements',
  'landing.pricing.f.reminders',
  'landing.pricing.f.invoices',
  'landing.pricing.f.dashboard',
  'landing.pricing.f.export',
  'landing.pricing.f.languages',
] as const;

const PAID_FEATURES = [
  'landing.pricing.f.estimates',
  'landing.pricing.f.stock',
  'landing.pricing.f.expenses',
  'landing.pricing.f.reports',
  'landing.pricing.f.import',
  'landing.pricing.f.roles',
  'landing.pricing.f.credit',
] as const;

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
      includesKey: 'landing.pricing.includes',
      featureKeys: FREE_FEATURES,
    },
    {
      id: 'starter',
      monthly: 149,
      limits: [
        { kind: 'logins', count: 2 },
        { kind: 'devices', count: 4 },
        { kind: 'invoices', count: 300 },
      ],
      includesKey: 'landing.pricing.includesFree',
      featureKeys: PAID_FEATURES,
    },
    {
      id: 'business',
      monthly: 349,
      limits: [
        { kind: 'logins', count: 5 },
        { kind: 'devices', count: 10 },
        { kind: 'invoices', count: null },
      ],
      includesKey: 'landing.pricing.includesFree',
      featureKeys: PAID_FEATURES,
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
      includesKey: 'landing.pricing.includesFree',
      featureKeys: PAID_FEATURES,
    },
  ],
};
