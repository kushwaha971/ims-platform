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
              from: './src/modules/UdhaarBook/features',
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
              group: ['modules/UdhaarBook/design-system/*/*'],
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
