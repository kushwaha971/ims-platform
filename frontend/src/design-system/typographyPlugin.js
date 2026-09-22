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
    '.ds-wordmark-sm': {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--size-wordmark-sm)',
      lineHeight: 'var(--leading-tight)',
      fontWeight: 'var(--weight-semibold)',
      letterSpacing: 'var(--track-wordmark)',
    },
    '.ds-wordmark-md': {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--size-wordmark-md)',
      lineHeight: 'var(--leading-tight)',
      fontWeight: 'var(--weight-semibold)',
      letterSpacing: 'var(--track-wordmark)',
    },
    '.ds-wordmark-lg': {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--size-wordmark-lg)',
      lineHeight: 'var(--leading-tight)',
      fontWeight: 'var(--weight-semibold)',
      letterSpacing: 'var(--track-wordmark)',
    },
    '.ds-wordmark-xl': {
      fontFamily: 'var(--font-display)',
      fontSize: 'var(--size-wordmark-xl)',
      lineHeight: 'var(--leading-tight)',
      fontWeight: 'var(--weight-semibold)',
      letterSpacing: 'var(--track-wordmark)',
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
    /**
     * `.ds-num` sets a family and a weight and NO SIZE, so it is a modifier
     * meant to be worn over a body tier. It does not work that way: the plugin
     * emits it after `.ds-body-sm`, the two have equal specificity, and the
     * later rule wins — so `class="ds-body-sm ds-num"` silently renders at
     * weight 500 instead of 400. Every rupee amount in a table cell was a step
     * bolder than the text beside it (`charts/ChartBarRow.tsx`,
     * `UbChartTable.tsx`).
     *
     * BrandHub has no such modifier. It has eighteen complete numeric tiers —
     * `ds-num-{2xl,xl,l,base,s,xs}-{semibold,medium,regular}` — each carrying
     * its own size and weight, precisely so this cannot happen. The two below
     * are the two this product actually needs; the rest can follow the day a
     * screen wants them.
     */
    '.ds-num': {
      fontFamily: 'var(--font-metric)',
      fontWeight: 'var(--weight-medium)',
      fontVariantNumeric: 'tabular-nums',
    },
    '.ds-num-base': {
      fontFamily: 'var(--font-metric)',
      fontSize: 'var(--size-body)',
      lineHeight: 'var(--leading-normal)',
      fontWeight: 'var(--weight-regular)',
      fontVariantNumeric: 'tabular-nums',
    },
    '.ds-num-sm': {
      fontFamily: 'var(--font-metric)',
      fontSize: 'var(--size-body-sm)',
      lineHeight: 'var(--leading-normal)',
      fontWeight: 'var(--weight-regular)',
      fontVariantNumeric: 'tabular-nums',
    },
    /**
     * The FIXED chrome tiers, which BrandHub deliberately keeps out of its fluid
     * ramp: `ds-nav-label-*` (12/16) and `ds-fixed-base-regular` (14/20). Chrome
     * does not want to grow with the viewport — a status chip that gets bigger
     * on a desktop monitor is a chip that stops matching the row it labels.
     *
     * `.ds-chip` is the one items 6 and 9 of the audit both wanted: 12/16 at
     * weight 400. Status pills were using `.ds-label`, which is weight 600, so
     * a column of them read bolder than the content they were labelling —
     * exactly backwards.
     */
    '.ds-chip': {
      fontFamily: 'var(--font-ui)',
      fontSize: '12px',
      lineHeight: '16px',
      fontWeight: 'var(--weight-regular)',
    },
    /**
     * 16/24/500 — BrandHub's dialog title (`text-base font-medium leading-6`).
     * Its own `ds-h*` tiers are far larger and are for page headings; a modal
     * heading is chrome. This product was using `.ds-h3` (19px, 500, −0.015em
     * tracking), which is why a confirm dialog read like a page.
     */
    '.ds-title-sm': {
      fontFamily: 'var(--font-ui)',
      fontSize: '16px',
      lineHeight: '24px',
      fontWeight: 'var(--weight-medium)',
    },
    '.ds-mono': {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--size-caption)',
      lineHeight: 'var(--leading-normal)',
      fontWeight: 'var(--weight-regular)',
    },
  });
});
