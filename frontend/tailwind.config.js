/**
 * Part 23 §23.2.5 + Part 19 §19.8.3 step 2 — Tailwind consumes the tokens.
 *
 * Every colour is `hsl(var(--x) / <alpha-value>)`, which is what makes runtime
 * white-label theming work at all: rewriting --primary-* on <html> repaints
 * every utility that names it. The two alpha tints (--accent-quiet,
 * --accent-line) are authored as rgba() colours and passed through unchanged,
 * because compositing an alpha twice is not what §23.2.4 specifies.
 *
 * @type {import('tailwindcss').Config}
 */
const hsl = (name) => `hsl(var(${name}) / <alpha-value>)`;

module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],

  /**
   * CR-2026-09-19-E — the content globs match BrandHub's shape: the two source
   * roots, the two `!` exclusions for generated/never-rendered files, and the
   * ml-uikit dist glob that stops the package's own compiled classes being
   * purged. Theirs reads:
   *
   *     content: [
   *       './app/ ** /*.{ts,tsx}',
   *       './src/ ** /*.{ts,tsx}',
   *       '!./src/ ** /*.{test,spec}.{ts,tsx}',
   *       '!./src/tests/ ** ',
   *       './node_modules/ml-uikit/dist/ ** /*.{js,cjs,mjs}',
   *     ]
   *
   * The exclusions are not cosmetic: a class that only ever appears in a test
   * file is a class in the production stylesheet that no screen can show.
   *
   * BrandHub's two other top-level keys are deliberately NOT copied, because
   * both exist to solve a problem this product does not have: `important:
   * '.customer-scope'` and `corePlugins: { preflight: false }` scope every
   * utility so they cannot bleed into the MUI routes sharing one <html>. There
   * are no MUI routes here — this is a standalone app — and disabling Preflight
   * would cost the resets the design system assumes.
   */
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    '!./src/**/*.{test,spec}.{ts,tsx}',
    '!./src/tests/**',
    // When the internal registry is reachable, ml-uikit's own classes must be
    // scanned too: './node_modules/ml-uikit/dist/**/*.{js,cjs,mjs}'.
  ],

  theme: {
    /**
     * Breakpoints and the content container sit on `theme`, not on
     * `theme.extend`, exactly as they do in BrandHub — they REPLACE Tailwind's
     * defaults rather than adding to them, which is the point: a product with
     * its own layout scale should not also carry five it never uses. The five
     * values below are the ones this codebase already writes (`sm:`…`2xl:`).
     */
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },

    // Unlike BrandHub's, the padding here is tokens: the gutters are the same
    // variables the shell and `UbPageShell` read, so a white-label build that
    // widens the page widens both.
    //
    // BrandHub's `container.screens: { '2xl': '1400px' }` override is NOT
    // copied. Those values become `@media (min-width: …)` breakpoints, where a
    // `var()` is not legal CSS — and the maximum measure this product cares
    // about is `--content-max`, which is already a token and is applied as
    // `max-w-content` by `UbPageShell`, the component every page goes through.
    container: {
      center: true,
      padding: { DEFAULT: 'var(--gutter)', lg: 'var(--page-pad)' },
    },

    extend: {
      colors: {
        primary: {
          50: hsl('--primary-50'),
          100: hsl('--primary-100'),
          200: hsl('--primary-200'),
          300: hsl('--primary-300'),
          400: hsl('--primary-400'),
          500: hsl('--primary-500'),
          600: hsl('--primary-600'),
          700: hsl('--primary-700'),
          800: hsl('--primary-800'),
          900: hsl('--primary-900'),
        },
        secondary: {
          100: hsl('--secondary-100'),
          200: hsl('--secondary-200'),
          300: hsl('--secondary-300'),
          400: hsl('--secondary-400'),
          500: hsl('--secondary-500'),
          600: hsl('--secondary-600'),
          700: hsl('--secondary-700'),
          800: hsl('--secondary-800'),
        },
        accent: {
          DEFAULT: hsl('--accent'),
          hover: hsl('--accent-hover'),
          press: hsl('--accent-press'),
          quiet: 'var(--accent-quiet)',
          line: 'var(--accent-line)',
        },
        /* The brand mark's own values — `UbLogo` and nothing else (§23.2.4). */
        brand: {
          mark: hsl('--brand-mark'),
          page: hsl('--brand-page'),
          pageBack: hsl('--brand-page-back'),
          rule: hsl('--brand-rule'),
          ruleShort: hsl('--brand-rule-short'),
        },
        canvas: hsl('--canvas'),
        surface: {
          card: hsl('--surface-card'),
          sunken: hsl('--surface-sunken'),
          raised: hsl('--surface-raised'),
          hover: hsl('--surface-hover'),
          active: hsl('--surface-active'),
          nav: hsl('--surface-nav'),
          navHover: hsl('--surface-nav-hover'),
        },
        border: {
          hairline: hsl('--border-hairline'),
          subtle: hsl('--border-subtle'),
          strong: hsl('--border-strong'),
          focus: hsl('--border-focus'),
        },
        text: {
          primary: hsl('--text-primary'),
          secondary: hsl('--text-secondary'),
          tertiary: hsl('--text-tertiary'),
          muted: hsl('--text-muted'),
          inverse: hsl('--text-inverse'),
          accent: hsl('--text-accent'),
          onNav: hsl('--text-on-nav'),
          onNavMuted: hsl('--text-on-nav-muted'),
        },
        success: {
          DEFAULT: hsl('--success'),
          bright: hsl('--success-bright'),
          dim: hsl('--success-dim'),
        },
        warning: {
          DEFAULT: hsl('--warning'),
          bright: hsl('--warning-bright'),
          dim: hsl('--warning-dim'),
        },
        // Ledger debit only (§23.2.4). Validation uses formError.
        error: {
          DEFAULT: hsl('--error'),
          bright: hsl('--error-bright'),
          dim: hsl('--error-dim'),
        },
        formError: {
          DEFAULT: hsl('--form-error'),
          bright: hsl('--form-error-bright'),
          dim: hsl('--form-error-dim'),
        },
        info: {
          DEFAULT: hsl('--info'),
          bright: hsl('--info-bright'),
          dim: hsl('--info-dim'),
        },
        viz: {
          1: hsl('--viz-1'),
          2: hsl('--viz-2'),
          3: hsl('--viz-3'),
          4: hsl('--viz-4'),
          5: hsl('--viz-5'),
          6: hsl('--viz-6'),
          7: hsl('--viz-7'),
          8: hsl('--viz-8'),
        },
      },
      spacing: {
        0: 'var(--space-0)',
        1: 'var(--space-1)',
        2: 'var(--space-2)',
        3: 'var(--space-3)',
        4: 'var(--space-4)',
        5: 'var(--space-5)',
        6: 'var(--space-6)',
        7: 'var(--space-7)',
        8: 'var(--space-8)',
        10: 'var(--space-10)',
        12: 'var(--space-12)',
        16: 'var(--space-16)',
        20: 'var(--space-20)',
        gutter: 'var(--gutter)',
        page: 'var(--page-pad)',
        topbar: 'var(--topbar-height)',
        sidebar: 'var(--sidebar-width)',
        'sidebar-collapsed': 'var(--sidebar-collapsed)',
        'bottom-nav': 'var(--bottom-nav-h)',
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        pill: 'var(--radius-pill)',
        card: 'var(--radius-card)',
        control: 'var(--radius-control)',
      },
      boxShadow: {
        1: 'var(--shadow-1)',
        2: 'var(--shadow-2)',
        3: 'var(--shadow-3)',
        4: 'var(--shadow-4)',
        'inset-top': 'var(--shadow-inset-top)',
        focus: 'var(--focus-ring)',
      },
      transitionDuration: {
        instant: '90ms',
        fast: '140ms',
        base: '220ms',
        slow: '360ms',
        reveal: '640ms',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(.2,0,.1,1)',
        entrance: 'cubic-bezier(.16,1,.3,1)',
        exit: 'cubic-bezier(.4,0,1,1)',
      },
      fontFamily: {
        display: ['var(--font-display)'],
        ui: ['var(--font-ui)'],
        mono: ['var(--font-mono)'],
      },
      maxWidth: { content: 'var(--content-max)' },

      /**
       * CR-2026-09-19-E — `keyframes` + `animation`, the pair BrandHub's
       * `theme.extend` carries, so a motion role is named once here rather than
       * written as an inline `transition` in whichever component needed it.
       * Only the two the product actually uses are declared: `animate-fade-in`
       * is the snackbar's entrance (see primitives/mlToastPrimitives.tsx).
       * `tailwindcss-animate` is still registered below for its `animate-in` /
       * `animate-out` utilities.
       *
       * The durations and the curve are the tokens above, not new numbers.
       */
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-out': { from: { opacity: '1' }, to: { opacity: '0' } },
      },
      animation: {
        'fade-in': 'fade-in 140ms cubic-bezier(.16,1,.3,1)',
        'fade-out': 'fade-out 90ms cubic-bezier(.4,0,1,1)',
      },
    },
  },
  plugins: [require('tailwindcss-animate'), require('./src/design-system/typographyPlugin')],
};
