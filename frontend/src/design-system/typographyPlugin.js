/**
 * Part 23 §23.2.2 — the compound `ds-*` type roles, registered as Tailwind
 * components exactly as BrandHub's typographyPlugin does.
 *
 * Writing `ds-body-sm` rather than `text-[13.5px] leading-[1.5] font-normal` is
 * what keeps 200 files consistent, and it is why R-S-5 forbids the second form.
 *
 * Two roles carry rules rather than taste:
 *  - `ds-label` is the DEFAULT label tier: 12.5px/1.4/600, sentence case, no
 *    tracking, rising to 13px/1.5 under `:lang(hi)` because Devanagari has no
 *    case and matras clip at 1.25.
 *  - `ds-label-caps` is the surviving 11px uppercase tier and is Latin-only —
 *    R-S-5 fails it in the same element as a `t(…)` call.
 */
const plugin = require('tailwindcss/plugin');

module.exports = plugin(({ addComponents }) => {
  addComponents({
    '.ds-display': {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--size-display)',
      lineHeight: 'var(--leading-tight)',
      fontWeight: 'var(--weight-medium)',
      letterSpacing: 'var(--track-display)',
    },
    '.ds-h1': {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--size-h1)',
      lineHeight: 'var(--leading-snug)',
      fontWeight: 'var(--weight-medium)',
      letterSpacing: 'var(--track-heading)',
    },
    '.ds-h2': {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--size-h2)',
      lineHeight: 'var(--leading-snug)',
      fontWeight: 'var(--weight-medium)',
      letterSpacing: 'var(--track-heading)',
    },
    '.ds-h3': {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--size-h3)',
      lineHeight: 'var(--leading-snug)',
      fontWeight: 'var(--weight-medium)',
      letterSpacing: 'var(--track-heading)',
    },
    '.ds-h4': {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--size-h4)',
      lineHeight: 'var(--leading-normal)',
      fontWeight: 'var(--weight-semibold)',
    },
    '.ds-body': {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--size-body)',
      lineHeight: 'var(--leading-normal)',
      fontWeight: 'var(--weight-regular)',
    },
    '.ds-body-medium': {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--size-body)',
      lineHeight: 'var(--leading-normal)',
      fontWeight: 'var(--weight-medium)',
    },
    '.ds-body-sm': {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--size-body-sm)',
      lineHeight: 'var(--leading-normal)',
      fontWeight: 'var(--weight-regular)',
    },
    '.ds-body-sm-medium': {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--size-body-sm)',
      lineHeight: 'var(--leading-normal)',
      fontWeight: 'var(--weight-medium)',
    },
    '.ds-caption': {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--size-caption)',
      lineHeight: 'var(--leading-normal)',
      fontWeight: 'var(--weight-regular)',
    },
    '.ds-label': {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--size-label)',
      lineHeight: 'var(--leading-label)',
      fontWeight: 'var(--weight-semibold)',
      letterSpacing: 'var(--track-label)',
      textTransform: 'none',
      '&:lang(hi)': {
        fontSize: 'var(--size-label-hi)',
        lineHeight: 'var(--leading-label-hi)',
      },
    },
    '.ds-label-caps': {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--size-label-caps)',
      lineHeight: 'var(--leading-snug)',
      fontWeight: 'var(--weight-semibold)',
      letterSpacing: 'var(--track-label-caps)',
      textTransform: 'uppercase',
    },
    '.ds-micro': {
      fontFamily: 'var(--font-ui)',
      fontSize: 'var(--size-micro)',
      lineHeight: 'var(--leading-snug)',
      fontWeight: 'var(--weight-medium)',
    },
    '.ds-metric-xl': {
      fontFamily: 'var(--font-metric)',
      fontSize: 'var(--size-metric-xl)',
      lineHeight: 'var(--leading-tight)',
      fontWeight: 'var(--weight-semibold)',
      letterSpacing: 'var(--track-metric)',
      fontVariantNumeric: 'tabular-nums',
    },
    '.ds-metric-lg': {
      fontFamily: 'var(--font-metric)',
      fontSize: 'var(--size-metric-lg)',
      lineHeight: 'var(--leading-tight)',
      fontWeight: 'var(--weight-semibold)',
      letterSpacing: 'var(--track-metric)',
      fontVariantNumeric: 'tabular-nums',
    },
    '.ds-metric-md': {
      fontFamily: 'var(--font-metric)',
      fontSize: 'var(--size-metric-md)',
      lineHeight: 'var(--leading-snug)',
      fontWeight: 'var(--weight-semibold)',
      letterSpacing: 'var(--track-metric)',
      fontVariantNumeric: 'tabular-nums',
    },
    '.ds-metric-sm': {
      fontFamily: 'var(--font-metric)',
      fontSize: 'var(--size-metric-sm)',
      lineHeight: 'var(--leading-snug)',
      fontWeight: 'var(--weight-semibold)',
      letterSpacing: 'var(--track-metric)',
      fontVariantNumeric: 'tabular-nums',
    },
    '.ds-num': {
      fontFamily: 'var(--font-metric)',
      fontWeight: 'var(--weight-medium)',
      fontVariantNumeric: 'tabular-nums',
    },
    '.ds-mono': {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--size-caption)',
      lineHeight: 'var(--leading-normal)',
      fontWeight: 'var(--weight-regular)',
    },
  });
});
