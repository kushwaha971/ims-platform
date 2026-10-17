/** Token-backed typography; Jakarta Sans + Mukta, tabular money figures. */
const plugin = require('tailwindcss/plugin');

const size = {
  title: { fs: 'var(--size-display)', lh: '1.2' },
  h1: { fs: 'var(--size-h1)', lh: '1.27' },
  h2: { fs: 'var(--size-h2)', lh: '1.3' },
  h3: { fs: 'var(--size-h3)', lh: '1.3' },
  h4: { fs: 'var(--size-h4)', lh: '1.3' },
  '2xl': { fs: 'var(--size-h1)', lh: '1.3' },
  xl: { fs: 'var(--size-h3)', lh: '1.3' },
  l: { fs: 'var(--size-h3)', lh: '1.4' },
  base: { fs: 'var(--size-body)', lh: '1.4' },
  s: { fs: 'var(--size-body-sm)', lh: '1.43' },
  xs: { fs: 'var(--size-caption)', lh: '1.33' },
};

const fw = {
  bold: '700',
  extrabold: '800',
  semibold: '600',
  medium: '500',
  regular: '400',
  light: '300',
};
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
  '&:lang(hi)': { lineHeight: `max(1.5em, ${size[key].lh}em)` },
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
    '.ds-bh-h1': tier('h1', 'bold'),
    '.ds-bh-h2': tier('h2', 'bold'),
    '.ds-bh-h3': tier('h3', 'semibold'),
    '.ds-bh-h4': tier('h4', 'semibold'),

    // ── This product's roles, re-pointed (see the header) ─────────────────
    '.ds-display': tier('title', 'extrabold', SANS, { letterSpacing: '-0.01em' }),
    '.ds-h1': tier('h1', 'bold', SANS, { letterSpacing: '-0.01em' }),
    '.ds-h2': tier('h2', 'bold', SANS, { letterSpacing: '-0.01em' }),
    '.ds-h3': tier('h3', 'semibold'),
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

    '.ds-wordmark-sm': fixed('0.9375rem', '1.05', 'semibold'),
    '.ds-wordmark-md': fixed('1.125rem', '1.05', 'semibold'),
    '.ds-wordmark-lg': fixed('1.375rem', '1.05', 'semibold'),
    '.ds-wordmark-xl': fixed('1.625rem', '1.05', 'semibold'),

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
    '.ds-mono': fixed('0.75rem', '1.0rem', 'regular', 'var(--font-mono)'),
  });
});
