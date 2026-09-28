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

// ── Shared rule options ─────────────────────────────────────────────────────
//
// `no-restricted-syntax` and `no-restricted-imports` are each configured in the
// main block AND restated for the party-fetch allowlist further down. Flat
// config does not MERGE a rule's options across matching blocks — a later block
// that sets them replaces them wholesale — so the allowlist block has to repeat
// the base options minus the party entries. Holding the base options in one
// constant is what keeps those two copies from drifting apart.
const RESTRICTED_SYNTAX_BASE = [
  {
    selector: 'TSEnumDeclaration',
    message: 'Use an `as const` object + union type (R-TS-8).',
  },
];

const RESTRICTED_IMPORTS_BASE = {
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
};

/**
 * Sprint 3 §32.6.7 risk: "Party search becomes four different implementations
 * in four features." Mitigation: `usePartySearch` is THE party picker source,
 * and a lint rule forbids a second debounced party fetch outside it.
 *
 * ── What is fenced, and why these three things ───────────────────────────────
 * A party fetch can only be written three ways in this codebase, and each gets
 * a precise, built-in rule (no plugin — ADR-021):
 *
 *  1. `import { listParties } from '…/parties/api/partyService'` —
 *     `no-restricted-imports` with `importNames`, so the REST of partyService
 *     (getParty, createParty, the BulkArchiveResult type, …) stays importable
 *     wherever the layering rules already allow it. Also catches re-exports.
 *  2. `import { fetchPartyList } from '…/redux/partyListThunk'` — the list's
 *     thunk is the other door to the same endpoint; dispatching it with a `q`
 *     from a picker would be the second implementation wearing the list's
 *     clothes, and it would also overwrite the list screen's rows.
 *  3. `partyService.listParties(…)` through a namespace import, or
 *     `API_PATHS.PARTIES` used to hand-roll `GET /parties?q=` in some other
 *     service — `no-restricted-syntax`, because an import rule cannot see a
 *     member access. `API_PATHS.PARTY(id)` and the other per-party paths are
 *     NOT fenced: fetching one party by id is not a search.
 *
 * ── Who may ──────────────────────────────────────────────────────────────────
 * Exactly the modules that ARE the two sources: `partyService` (defines it),
 * `usePartySearch` (the picker source), the party-list thunk, slice, warm-up
 * and hook (the list screen's source), the invalidation registry (which names
 * the list thunk as a refetch target), `APIPaths.ts` (defines the path), and
 * tests. Everything else goes through `usePartySearch()` or `usePartyList()`.
 * See docs/DESIGN-SYSTEM.md, "Party picker source: usePartySearch".
 *
 * Proven by src/tests/partyFetchLintRule.test.ts, which lints deliberately-bad
 * fixtures from src/tests/lint-fixtures/party-fetch and expects these rule ids.
 */
const PARTY_FETCH_MESSAGE =
  'Party search goes through usePartySearch() (pickers) or usePartyList() (the list screen) — never a second party fetch (Sprint 3 §32.6.7, docs/DESIGN-SYSTEM.md).';

const PARTY_FETCH_IMPORT_PATTERNS = [
  {
    group: ['**/parties/api/partyService', '**/api/partyService', './partyService'],
    importNames: ['listParties'],
    message: PARTY_FETCH_MESSAGE,
  },
  {
    group: ['**/parties/redux/partyListThunk', '**/redux/partyListThunk', './partyListThunk'],
    importNames: ['fetchPartyList'],
    message: PARTY_FETCH_MESSAGE,
  },
];

const PARTY_FETCH_SYNTAX = [
  {
    selector: "MemberExpression[property.name='listParties']",
    message: PARTY_FETCH_MESSAGE,
  },
  {
    selector: "MemberExpression[property.name='fetchPartyList']",
    message: PARTY_FETCH_MESSAGE,
  },
  {
    selector: "MemberExpression[object.name='API_PATHS'][property.name='PARTIES']",
    message: PARTY_FETCH_MESSAGE,
  },
];

/** The modules that ARE the party sources, and may therefore touch them. */
const PARTY_FETCH_ALLOWED = [
  'src/modules/DigiKhaato/features/parties/api/partyService.ts',
  'src/modules/DigiKhaato/features/parties/hooks/usePartySearch.ts',
  'src/modules/DigiKhaato/features/parties/hooks/usePartyList.ts',
  'src/modules/DigiKhaato/features/parties/redux/partyListThunk.ts',
  'src/modules/DigiKhaato/features/parties/redux/partyListSlice.ts',
  'src/modules/DigiKhaato/features/parties/redux/partyListWarmup.ts',
  'src/redux/invalidation/registry.ts',
  'src/api/APIPaths.ts',
  '**/*.test.{ts,tsx}',
  'src/tests/**',
];

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'next-env.d.ts',
      // The vendored ml-uikit is a compiled third-party build, not source. It is
      // committed because the internal registry that hosts it is unreachable
      // from this build environment, but linting a minified bundle produces
      // hundreds of findings about code nobody here wrote or can fix.
      'vendor/**',
      // src/tests/partyFetchLintRule.test.ts writes its deliberately-bad
      // fixtures here for a few seconds and lints them with `--no-ignore`.
      // Ignored so that an `npm run lint` running at the same moment neither
      // reports them nor crashes on a file deleted mid-walk.
      'src/modules/DigiKhaato/features/__lint_probe_*/**',
    ],
  },
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
      'no-restricted-syntax': ['error', ...RESTRICTED_SYNTAX_BASE, ...PARTY_FETCH_SYNTAX],

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
      // The base list, plus the party-fetch fence (see PARTY_FETCH_MESSAGE).
      'no-restricted-imports': [
        'error',
        {
          paths: RESTRICTED_IMPORTS_BASE.paths,
          patterns: [...RESTRICTED_IMPORTS_BASE.patterns, ...PARTY_FETCH_IMPORT_PATTERNS],
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
    /**
     * LED-04's print view, and only the print DIRECTORY — a named place rather
     * than a named rule, so the exemption cannot spread by somebody adding a
     * file beside it.
     *
     * A printed statement needs a real `<table>`: `display: table-header-group`
     * is what repeats the column headings on every page, and it only works on an
     * actual `<thead>`. A grid built from divs prints its headings once and
     * leaves page four a wall of unlabelled numbers — on the one artefact in
     * this product that a customer reads without the app around it.
     */
    files: ['src/modules/**/components/print/**/*.tsx'],
    rules: { 'react/forbid-elements': 'off' },
  },
  {
    /**
     * The party-fetch allowlist (see PARTY_FETCH_MESSAGE at the top). Same two
     * rules, base options only — the party entries are what these files are
     * FOR. Adding a file here is adding a second party source, and wants the
     * same review a new design-system component does.
     */
    files: PARTY_FETCH_ALLOWED,
    rules: {
      'no-restricted-syntax': ['error', ...RESTRICTED_SYNTAX_BASE],
      'no-restricted-imports': ['error', RESTRICTED_IMPORTS_BASE],
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
