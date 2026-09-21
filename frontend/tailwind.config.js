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
    // ml-uikit ships compiled components carrying Tailwind class NAMES, not
    // compiled CSS for them, so this build has to see them or its buttons and
    // selects render unstyled. Scanned from `vendor/` rather than
    // `node_modules/` because the package is vendored: the internal registry
    // that hosts it is not reachable from here, and a package of this name also
    // resolves on public npm — installing that one to satisfy an internal import
    // is how dependency confusion lands. The copy in `vendor/` is the licensed
    // one, committed, and the `file:` dependency in package.json points at it.
    './vendor/ml-uikit/dist/**/*.{js,cjs,mjs}',
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
        /* ────────────────────────────────────────────────────────────────────
         * The ml-uikit bridge.
         *
         * `ml-uikit` is shadcn-derived, so its compiled components reference the
         * shadcn semantic names — `bg-background`, `text-foreground`,
         * `border-input`, `ring-ring`, `bg-destructive`. None of those existed
         * here, because this product named its tokens for what they are
         * (`--canvas`, `--surface-card`, `--text-primary`) rather than for
         * shadcn's roles.
         *
         * So the names are mapped onto the tokens that already exist, rather
         * than importing `ml-uikit/dist/style.css`. That import is what BrandHub
         * does and it is why their portal has an indigo focus ring nobody chose:
         * the stylesheet is a whole second Tailwind build, and it emits
         * `*, ::before, ::after { --tw-ring-color: rgb(59 130 246 / .5) }`
         * globally, plus a second preflight and a second set of token defaults
         * competing with the first.
         *
         * Mapping instead means an ml-uikit component renders in DigiKhaato's
         * palette automatically, in both themes, with no `dark:` variants and no
         * stylesheet to keep in sync — the tokens change underneath it exactly as
         * they do for every `Ub*` component. One token layer, not two.
         * ──────────────────────────────────────────────────────────────────── */
        background: hsl('--canvas'),
        foreground: hsl('--text-primary'),
        input: hsl('--border-strong'),
        ring: hsl('--border-focus'),
        popover: {
          DEFAULT: hsl('--surface-card'),
          foreground: hsl('--text-primary'),
        },
        destructive: {
          DEFAULT: hsl('--form-error'),
          foreground: hsl('--text-inverse'),
        },
        muted: {
          DEFAULT: hsl('--surface-sunken'),
          foreground: hsl('--text-secondary'),
        },

        primary: {
          /* ml-uikit's `bg-primary` / `text-primary-foreground`. The numeric
             ramp is this product's own and is untouched. */
          DEFAULT: hsl('--accent'),
          foreground: hsl('--text-inverse'),
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
          DEFAULT: hsl('--secondary-500'),
          foreground: hsl('--text-inverse'),
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
        /* ml-uikit's `bg-card` / `text-card-foreground`. */
        card: {
          DEFAULT: hsl('--surface-card'),
          foreground: hsl('--text-primary'),
        },
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
          /* ml-uikit's `border-border`; ours stays the named scale below. */
          DEFAULT: hsl('--border-subtle'),
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
      /**
       * CR-2026-09-19-G — `bottom-toast` is the toast channel's anchor, and it
       * is a token rather than a number because the number is not knowable
       * from a stylesheet: it is `--ub-bottom-inset` (whatever sticky bottom
       * furniture the current screen publishes) + the iOS safe area + the gap.
       * Writing it here keeps the arithmetic in one place and keeps
       * `mlToastPrimitives` free of a `calc()` spelled in underscores.
       */
      inset: {
        toast: 'var(--ub-toast-bottom)',
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
      /**
       * CR-2026-09-19-G — the durations and curves are the TOKENS, not the
       * numbers they currently hold. That is not tidying: `--dur-*` is zeroed
       * under `@media (prefers-reduced-motion: reduce)`
       * (src/styles/tokens/primitives.css), and a literal `140ms` here opted
       * the snackbar's entrance — the one animation that appears unbidden,
       * and the one that moves — out of that. It now honours the preference
       * for free.
       */
      animation: {
        'fade-in': 'fade-in var(--dur-fast) var(--ease-entrance)',
        'fade-out': 'fade-out var(--dur-instant) var(--ease-exit)',
      },
    },
  },
  plugins: [require('tailwindcss-animate'), require('./src/design-system/typographyPlugin')],
};
