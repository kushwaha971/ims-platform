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
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    // When the internal registry is reachable, ml-uikit's own classes must be
    // scanned too: './node_modules/ml-uikit/dist/**/*.js'.
  ],
  theme: {
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
    },
  },
  plugins: [require('tailwindcss-animate'), require('./src/design-system/typographyPlugin')],
};
