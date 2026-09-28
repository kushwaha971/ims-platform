/**
 * Part 23 §23.2.2 — the compound `ds-*` type roles.
 *
 * ── Source: BrandHub's Customer portal, which implements the same Figma ────
 * The owner's reference designs (Figma "Brandhub-Wireframes-4") are the ones
 * BrandHub's customer portal is built from, and its `tailwind.config.js`
 * typography plugin is the production reading of them. This file ports that
 * scale VERBATIM — the same fluid `clamp()` sizes, the same weights, the same
 * class names — so a screen here and a screen there set the same text the same
 * way:
 *
 *   ds-body-{2xl,xl,l,base,s,xs}-{semibold,medium,regular,light}  DM Sans
 *   ds-num-{2xl,xl,l,base,s,xs}-{semibold,medium,regular}        Inter
 *   ds-nav-{label,caption}-{medium,regular}                      FIXED 12 / 10
 *   ds-title, ds-h1 … ds-h4 (BrandHub's heading ramp as bh-*)
 *
 * The sizes are FLUID: `base` is 12 px on a 360 px phone, 14 px around
 * 1,050 px and 15 px on a 1,440 px desktop — BrandHub's deliberate choice, so
 * the product reads the same at arm's length on either.
 *
 * ── This product's semantic roles, re-pointed at that scale ──────────────
 * Two hundred files already say `ds-body-sm`, `ds-h1`, `ds-caption`. Rather
 * than rewrite every call site, each role now resolves to the BrandHub class
 * that plays the same part in the Figma:
 *
 *   ds-h1   page title            → body-xl semibold (BrandHubPageHeader)
 *   ds-h2   dialog / drawer title → body-l semibold
 *   ds-h3   card title            → body-l medium
 *   ds-h4   section heading       → body-base medium (SectionHeading)
 *   ds-body / -medium             → body-base regular / medium
 *   ds-body-sm / -medium          → body-s regular / medium
 *   ds-caption                    → body-s regular
 *   ds-label                      → body-s medium
 *   ds-micro                      → body-xs regular
 *   ds-metric-sm / -md            → body-xl / body-2xl semibold (stat cards)
 *
 * New components should reach for the BrandHub names directly
 * (`docs/DESIGN-SYSTEM.md` §2).
 *
 * ── Hindi ─────────────────────────────────────────────────────────────────
 * Devanagari matras sit above and below the Latin line box (§19.11.6), so
 * under `:lang(hi)` every body tier gets 4 px more line height than the Latin
 * value. The size does not change.
 */
const plugin = require('tailwindcss/plugin');

const size = {
  title: {
    fs: 'clamp(2rem, calc(1.643rem + 1.786vw), 4.5rem)',
    lh: 'clamp(2.5rem, calc(2.036rem + 2.054vw), 5.5rem)',
  },
  h1: {
    fs: 'clamp(1.75rem, calc(1.464rem + 1.429vw), 3.75rem)',
    lh: 'clamp(2.25rem, calc(1.893rem + 1.607vw), 4.25rem)',
  },
  h2: {
    fs: 'clamp(1.375rem, calc(1.143rem + 1.161vw), 3rem)',
    lh: 'clamp(1.875rem, calc(1.536rem + 1.518vw), 3.75rem)',
  },
  h3: {
    fs: 'clamp(1.125rem, calc(0.964rem + 0.804vw), 2.25rem)',
    lh: 'clamp(1.625rem, calc(1.375rem + 1.116vw), 2.875rem)',
  },
  h4: {
    fs: 'clamp(1rem, calc(0.875rem + 0.625vw), 1.875rem)',
    lh: 'clamp(1.5rem, calc(1.25rem + 0.893vw), 2.375rem)',
  },
  '2xl': {
    fs: 'clamp(1.125rem, calc(1rem + 0.625vw), 2rem)',
    lh: 'clamp(1.625rem, calc(1.393rem + 0.804vw), 2.5rem)',
  },
  xl: {
    fs: 'clamp(1rem, calc(0.893rem + 0.536vw), 1.75rem)',
    lh: 'clamp(1.5rem, calc(1.286rem + 0.714vw), 2.25rem)',
  },
  l: {
    fs: 'clamp(0.875rem, calc(0.821rem + 0.268vw), 1.25rem)',
    lh: 'clamp(1.25rem, calc(1.125rem + 0.402vw), 1.75rem)',
  },
  base: {
    fs: 'clamp(0.75rem, calc(0.696rem + 0.268vw), 1.125rem)',
    lh: 'clamp(1.125rem, calc(0.982rem + 0.402vw), 1.5rem)',
  },
  s: {
    fs: 'clamp(0.6875rem, calc(0.661rem + 0.134vw), 0.875rem)',
    lh: 'clamp(1rem, calc(0.946rem + 0.179vw), 1.125rem)',
  },
  xs: {
    fs: 'clamp(0.625rem, calc(0.607rem + 0.089vw), 0.75rem)',
    lh: 'clamp(1rem, calc(0.982rem + 0.089vw), 1.125rem)',
  },
};

const fw = { bold: '700', semibold: '600', medium: '500', regular: '400', light: '300' };
const SANS = 'var(--font-ui)';
const NUM = 'var(--font-metric)';

/** One compound class; Hindi gets one more 4 px step of line height. */
const tier = (key, weight, family = SANS, extra = {}) => ({
  fontFamily: family,
  fontSize: size[key].fs,
  lineHeight: size[key].lh,
  fontWeight: fw[weight],
  letterSpacing: '0',
  ...extra,
  '&:lang(hi)': { lineHeight: `calc(${size[key].lh} + 4px)` },
});

const fixed = (px, lh, weight, family = SANS) => ({
  fontFamily: family,
  fontSize: px,
  lineHeight: lh,
  fontWeight: fw[weight],
  letterSpacing: '0',
});

const num = { fontVariantNumeric: 'tabular-nums' };

module.exports = plugin(({ addComponents }) => {
  const brandhub = {};
  for (const key of ['2xl', 'xl', 'l', 'base', 's', 'xs']) {
    for (const weight of ['semibold', 'medium', 'regular', 'light']) {
      brandhub[`.ds-body-${key}-${weight}`] = tier(key, weight);
    }
    for (const weight of ['semibold', 'medium', 'regular']) {
      brandhub[`.ds-num-${key}-${weight}`] = tier(key, weight, NUM, num);
    }
  }

  addComponents({
    // ── BrandHub, verbatim ─────────────────────────────────────────────────
    ...brandhub,
    '.ds-nav-label-medium': fixed('0.75rem', '1rem', 'medium'),
    '.ds-nav-label-regular': fixed('0.75rem', '1rem', 'regular'),
    '.ds-nav-caption-medium': fixed('0.625rem', '1rem', 'medium'),
    '.ds-nav-caption-regular': fixed('0.625rem', '1rem', 'regular'),
    '.ds-fixed-base-regular': fixed('0.875rem', '1.25rem', 'regular'),
    '.ds-bh-title': tier('title', 'bold'),
    '.ds-bh-h1': tier('h1', 'semibold'),
    '.ds-bh-h2': tier('h2', 'semibold'),
    '.ds-bh-h3': tier('h3', 'semibold'),
    '.ds-bh-h4': tier('h4', 'semibold'),

    // ── This product's roles, re-pointed (see the header) ─────────────────
    '.ds-display': tier('h2', 'semibold'),
    '.ds-h1': tier('xl', 'semibold'),
    '.ds-h2': tier('l', 'semibold'),
    '.ds-h3': tier('l', 'medium'),
    '.ds-h4': tier('base', 'medium'),
    '.ds-body': tier('base', 'regular'),
    '.ds-body-medium': tier('base', 'medium'),
    '.ds-body-sm': tier('s', 'regular'),
    '.ds-body-sm-medium': tier('s', 'medium'),
    '.ds-caption': tier('s', 'regular'),
    '.ds-label': tier('s', 'medium'),
    /** Latin-only uppercase tier; R-S-5 still forbids it beside a `t(…)`. */
    '.ds-label-caps': tier('xs', 'medium', SANS, {
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
    }),
    '.ds-micro': tier('xs', 'regular'),
    '.ds-metric-sm': tier('xl', 'semibold', SANS, num),
    '.ds-metric-md': tier('2xl', 'semibold', SANS, num),
    '.ds-metric-lg': tier('h3', 'semibold', SANS, num),
    '.ds-metric-xl': tier('h2', 'semibold', SANS, num),

    '.ds-wordmark-sm': fixed('15px', '1.05', 'semibold'),
    '.ds-wordmark-md': fixed('18px', '1.05', 'semibold'),
    '.ds-wordmark-lg': fixed('22px', '1.05', 'semibold'),
    '.ds-wordmark-xl': fixed('26px', '1.05', 'semibold'),

    /**
     * `.ds-num` is a MODIFIER — family and tabular figures only, no size and
     * no weight — so `ds-body-sm ds-num` keeps the body tier's weight. (It
     * used to set weight 500, and every rupee in a table cell read a step
     * bolder than the text beside it.) Prefer a full `ds-num-*` tier.
     */
    '.ds-num': { fontFamily: NUM, ...num },
    '.ds-num-base': tier('base', 'regular', NUM, num),
    '.ds-num-sm': tier('s', 'regular', NUM, num),
    /** Status pills: 12/16 regular, fixed — BrandHub's `Pill`. */
    '.ds-chip': tier('s', 'regular'),
    /** Dialog title — BrandHub `text-base font-medium leading-6`. */
    '.ds-title-sm': tier('l', 'medium'),
    '.ds-mono': fixed('12px', '16px', 'regular', 'var(--font-mono)'),
  });
});
