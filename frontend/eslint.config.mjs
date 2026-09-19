// eslint.config.mjs — Part 25 §25.14, normative.
//
// One mechanical difference from the file as printed in §25.14: under ESLint 9
// flat config a plugin may be defined exactly once, and `eslint-config-next`
// already registers `@typescript-eslint`, `import`, `jsx-a11y`, `react` and
// `react-hooks`. Re-declaring them here is a hard ConfigError
// ("Cannot redefine plugin"), so the `plugins` key is dropped and the rules —
// every one of which is verbatim — bind to next's registrations.
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import next from 'eslint-config-next/core-web-vitals';

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts'] },
  ...next,
  prettier,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: './tsconfig.json', ecmaFeatures: { jsx: true } },
    },
    settings: { 'import/resolver': { typescript: { project: './tsconfig.json' } } },
    rules: {
      // ── TypeScript ────────────────────────────────────────────────────────
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'warn',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message: 'Use an `as const` object + union type (R-TS-8).',
        },
      ],

      // ── React ─────────────────────────────────────────────────────────────
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react/jsx-key': ['error', { checkFragmentShorthand: true }],
      'react/no-unstable-nested-components': 'error',
      'react/jsx-no-bind': ['warn', { allowArrowFunctions: true, ignoreRefs: true }],
      'react/self-closing-comp': 'error',

      // ── Imports ───────────────────────────────────────────────────────────
      'import/no-default-export': 'error',
      'import/no-cycle': ['error', { maxDepth: 4 }],
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
          pathGroups: [
            { pattern: 'react', group: 'external', position: 'before' },
            { pattern: 'next/**', group: 'external', position: 'before' },
            { pattern: 'src/**', group: 'internal', position: 'before' },
            { pattern: 'modules/**', group: 'internal', position: 'after' },
          ],
          pathGroupsExcludedImportTypes: ['react'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      // Part 19 §19.1.2 — the layering rule, mechanically enforced.
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/modules/**/components/**',
              from: './src/api',
              message: 'Components never call the API. Use a hook → thunk → service (R-C-8).',
            },
            {
              target: './src/modules/**/components/**',
              from: './src/modules/**/api',
              message: 'Components never import services (R-C-8).',
            },
            {
              target: './src/modules/**/view-model/**',
              from: './node_modules/react',
              message: 'View-models are pure: no React.',
            },
            {
              target: './src/design-system/**',
              from: './src/modules/DigiKhaato/features',
              message: 'The design system never imports feature code.',
            },
            {
              target: './src/design-system/**',
              from: './src/redux',
              message: 'The design system never reads Redux.',
            },
            {
              target: './app/**',
              from: './src/api',
              message: 'Route files are thin (Part 19 §19.1.4).',
            },
          ],
        },
      ],

      // ── Accessibility ─────────────────────────────────────────────────────
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'jsx-a11y/label-has-associated-control': ['error', { assert: 'either' }],
      'jsx-a11y/no-static-element-interactions': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/no-autofocus': 'off', // amount fields autofocus by design (LED-01 FR-11)

      // ── General ───────────────────────────────────────────────────────────
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-restricted-globals': ['error', { name: 'event', message: 'Use the handler parameter.' }],
      // Part 19 §19.10.3 — one network state machine. `navigator.onLine === true`
      // is not evidence of connectivity, and a second implementation of it is
      // how the Save button ends up with two behaviours.
      'no-restricted-properties': [
        'error',
        {
          object: 'navigator',
          property: 'onLine',
          message:
            'Use useDegradedNetwork() (Part 19 §19.10.3). Only src/hooks/useDegradedNetwork.ts may read this.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'lodash', message: 'Not on the ADR-021 list (R-D-1).' },
            { name: 'moment', message: 'Use dayjs (ADR-021).' },
            {
              name: '@tanstack/react-query',
              message: 'Not used. Slice + thunk + service (ADR-004).',
            },
          ],
          patterns: [
            {
              group: ['modules/DigiKhaato/design-system/*/*'],
              message: 'Import from the barrel (R-IM-3).',
            },
            { group: ['../../../*'], message: 'Use a path alias (R-IM-2).' },
          ],
        },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-param-reassign': ['error', { props: false }], // props:false — Immer drafts
    },
  },
  {
    /**
     * Part 23 §23.3 / Part 25 R-S-10 — THE design-system rule, mechanically
     * enforced, and the reason this refactor cannot regress.
     *
     * BrandHub's Customer module is written entirely out of `BHBox`, `BHGrid`,
     * `BHTypography`, `BHDivider` and their siblings: across the sixty files of
     * `apps/frontend/src/modules/customer-management` there is not one `<div>`,
     * `<p>` or `<h1>`. It holds there by review. Here it holds by build failure
     * — `npm run lint` runs with `--max-warnings=0`, so `'error'` below stops a
     * merge rather than printing a line nobody reads.
     *
     * Each entry names the component to use instead, because a rule that only
     * says "no" sends the author to grep.
     *
     * NOT forbidden, deliberately:
     *  - `<html>`, `<head>`, `<body>` — the document, which only
     *    `app/layout.tsx` renders and no component can replace.
     *  - `<svg>` and its children — icons come from `lucide-react` (R-P-5) and
     *    the few inline paths are graphics, not layout.
     *  - React `<Fragment>` / `<>` — not a host element.
     */
    files: ['src/modules/**/*.tsx', 'src/components/**/*.tsx', 'app/**/*.tsx'],
    rules: {
      'react/forbid-elements': [
        'error',
        {
          forbid: [
            { element: 'div', message: 'Use UbBox / UbStack / UbGrid from src/design-system.' },
            { element: 'span', message: 'Use UbText as="span", UbListItemText or UbBadge.' },
            { element: 'p', message: 'Use UbText (variant="body" | "body-sm" | "caption").' },
            { element: 'h1', message: 'Use UbText as="h1" variant="h1"|"h2" (§23.2.2).' },
            { element: 'h2', message: 'Use UbText as="h2" variant="h2"|"h3" (§23.2.2).' },
            { element: 'h3', message: 'Use UbText as="h3" variant="h3"|"h4" (§23.2.2).' },
            { element: 'h4', message: 'Use UbText as="h4" (§23.2.2).' },
            { element: 'h5', message: 'Use UbText as="h5" (§23.2.2).' },
            { element: 'h6', message: 'Use UbText as="h6" (§23.2.2).' },
            { element: 'ul', message: 'Use UbStack as="ul".' },
            { element: 'ol', message: 'Use UbStack as="ol".' },
            { element: 'li', message: 'Use UbStack as="li" / UbBox as="li".' },
            { element: 'dl', message: 'Use UbGrid as="dl" / UbStack as="dl".' },
            { element: 'dt', message: 'Use UbText as="dt" variant="label".' },
            { element: 'dd', message: 'Use UbText as="dd".' },
            { element: 'section', message: 'Use UbBox as="section".' },
            { element: 'article', message: 'Use UbBox as="article".' },
            { element: 'header', message: 'Use UbPageHeader, or UbBox as="header".' },
            { element: 'footer', message: 'Use UbBox as="footer".' },
            { element: 'main', message: 'Use UbPageShell, or UbBox as="main".' },
            { element: 'nav', message: 'Use UbSidebar, or UbBox as="nav".' },
            { element: 'aside', message: 'Use UbBox as="aside".' },
            { element: 'form', message: 'Use UbForm (§19.5.4).' },
            { element: 'fieldset', message: 'Use UbField / UbRadioGroup (§19.5.4).' },
            { element: 'label', message: 'Use UbField — it binds the label to the control.' },
            { element: 'input', message: 'Use UbTextInput / UbCheckbox / UbOtpInput.' },
            { element: 'textarea', message: 'Use UbTextInput multiline.' },
            { element: 'select', message: 'Use UbSelect.' },
            { element: 'button', message: 'Use UbButton (keeps the 44 px target, R-A-3).' },
            { element: 'a', message: 'Use UbLink — it wraps next/link.' },
            { element: 'img', message: 'Use next/image; icons come from lucide-react (R-P-5).' },
            { element: 'table', message: 'Use UbDataGrid (§19.5.6).' },
            { element: 'thead', message: 'Use UbDataGrid (§19.5.6).' },
            { element: 'tbody', message: 'Use UbDataGrid (§19.5.6).' },
            { element: 'tr', message: 'Use UbDataGrid (§19.5.6).' },
            { element: 'td', message: 'Use UbDataGrid (§19.5.6).' },
            { element: 'th', message: 'Use UbDataGrid (§19.5.6).' },
            { element: 'hr', message: 'Use UbDivider.' },
            { element: 'strong', message: 'Use UbText variant="body-medium".' },
            { element: 'em', message: 'Use UbText — emphasis is a tier, not a tag.' },
            { element: 'small', message: 'Use UbText variant="caption".' },
          ],
        },
      ],
    },
  },
  {
    /**
     * `app/layout.tsx` is the document. `<html lang>` and `<body>` are not
     * forbidden above, but the file is listed here so the exemption is a
     * stated decision rather than an omission somebody later "fixes".
     */
    files: ['app/layout.tsx'],
    rules: { 'react/forbid-elements': 'off' },
  },
  {
    // The one module allowed to read navigator.onLine — it is the state machine.
    files: ['src/hooks/useDegradedNetwork.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    // Next.js requires default exports from route files.
    files: ['app/**/{page,layout,error,not-found,loading,template,route}.tsx', 'app/**/*.ts'],
    rules: { 'import/no-default-export': 'off' },
  },
  {
    // RTK slices export their reducer as default, by convention.
    files: ['**/*Slice.ts'],
    rules: { 'import/no-default-export': 'off', 'no-param-reassign': 'off' },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'src/tests/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off', 'no-console': 'off' },
  },
  {
    // Jest's config is a config file: it exports a default by contract.
    files: ['jest.config.ts'],
    rules: { 'import/no-default-export': 'off' },
  },
  {
    // Build tooling: CommonJS config files and Node scripts are not app code.
    files: ['*.config.js', 'src/design-system/typographyPlugin.js', 'scripts/**/*.mjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'writable', require: 'readonly' },
    },
    rules: {
      'import/no-default-export': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      'no-console': 'off',
    },
  },
];

export default config;
