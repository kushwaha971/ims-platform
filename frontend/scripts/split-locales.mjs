#!/usr/bin/env node
/**
 * W4-P (28 Sep 2026) — moves every message key to the catalogue
 * `locales/catalogues.json` assigns it, and regenerates the modules that load
 * them. Idempotent: run it after every merge that touched a locale file.
 *
 *   node scripts/split-locales.mjs           rewrite the catalogues
 *   node scripts/split-locales.mjs --check   exit 1 if a rewrite would change anything
 *
 * What it does, in order:
 *   1. POOLS every catalogue — `locales/{en,hi}.json` (the shell) and every
 *      `locales/catalogues/*.{en,hi}.json` — into one key set per language.
 *      A key found in two files with different strings keeps the SHELL file's
 *      string (that is where other tracks write new and changed copy) and is
 *      reported.
 *   2. PINS to the shell every key the shell's own code references: the static
 *      import graph of every layout, error and not-found boundary
 *      (`scripts/lib/i18n-graph.mjs`). The snackbar, the nav, the session
 *      bootstrap and the static store slices all live there. The one
 *      exception is a key whose catalogue that same layout imports itself —
 *      the `(app)` layout loads `notifications`, `plan` and `tenant`, so the
 *      inbox's words ride with every signed-in screen and not with /login.
 *   3. ASSIGNS every other key by the longest matching prefix in
 *      `locales/catalogues.json`; a key no prefix matches stays in the shell
 *      and is reported, so a new namespace costs bytes rather than raw ids.
 *   4. WRITES each catalogue sorted, as `JSON.stringify(…, null, 2)`, deletes the
 *      files of catalogues that are now empty, and regenerates
 *      `src/i18n/catalogues/<name>.ts` (one per catalogue — the module a screen
 *      imports) and `src/tests/allMessages.ts` (every catalogue at once, for
 *      `renderWithProviders`).
 *
 * Which SCREENS import which catalogue module is not decided here — that is
 * code, and `scripts/check-locales.mjs` checks it over the same graph.
 *
 * Node standard library only (ADR-021).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  clientClosure,
  referencedKeys,
  routeEntries,
  staticClosure,
  toPosix,
} from './lib/i18n-graph.mjs';

export const LANGS = ['en', 'hi'];
const CATALOGUE_DIR = 'locales/catalogues';
const MODULE_DIR = 'src/i18n/catalogues';
const ALL_MESSAGES = 'src/tests/allMessages.ts';
const NAME = /^[a-z][a-zA-Z0-9]*$/;

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const stringify = (value) => `${JSON.stringify(value, null, 2)}\n`;

/** `{ name: { en: {…}, hi: {…} } }` for every catalogue file on disk, the shell included. */
export const readCatalogues = (root) => {
  const catalogues = { shell: {} };
  for (const lang of LANGS) {
    const path = join(root, 'locales', `${lang}.json`);
    catalogues.shell[lang] = existsSync(path) ? readJson(path) : {};
  }
  const dir = join(root, CATALOGUE_DIR);
  if (existsSync(dir)) {
    for (const file of readdirSync(dir).sort()) {
      const match = /^([a-zA-Z0-9]+)\.(en|hi)\.json$/.exec(file);
      if (!match) continue;
      const [, name, lang] = match;
      catalogues[name] ??= {};
      catalogues[name][lang] = readJson(join(dir, file));
    }
  }
  for (const name of Object.keys(catalogues))
    for (const lang of LANGS) catalogues[name][lang] ??= {};
  return catalogues;
};

/** The files that bound what the SHELL renders: every layout and boundary. */
export const shellEntries = (root) =>
  routeEntries(root).filter((path) =>
    /[/\\](layout|error|not-found|global-error|loading|template)\.tsx$/.test(path)
  );

/** The catalogue modules (`src/i18n/catalogues/<name>.ts`) among a set of modules. */
export const declaredCatalogues = (root, modules) => {
  const names = new Set();
  const dir = toPosix(join(root, MODULE_DIR));
  for (const path of modules) {
    const match = /\/([a-zA-Z0-9]+)\.ts$/.exec(toPosix(path));
    if (match && toPosix(path) === `${dir}/${match[1]}.ts` && match[1] !== 'shell')
      names.add(match[1]);
  }
  return names;
};

export const readConfig = (root) => {
  const config = readJson(join(root, 'locales/catalogues.json'));
  for (const [prefix, name] of Object.entries(config.prefixes)) {
    if (!NAME.test(name))
      throw new Error(`catalogues.json: "${prefix}" names "${name}", not an identifier`);
  }
  return config;
};

/**
 * The whole decision, without touching the disk: where every key goes, and
 * what each file should contain afterwards.
 */
export const plan = (root) => {
  const config = readConfig(root);
  const current = readCatalogues(root);
  const warnings = [];

  // 1. pool
  const pool = { en: {}, hi: {} };
  const origin = { en: {}, hi: {} };
  const names = [
    'shell',
    ...Object.keys(current)
      .filter((n) => n !== 'shell')
      .sort(),
  ];
  for (const lang of LANGS) {
    // the shell last, so its string wins a disagreement
    for (const name of [...names.slice(1), 'shell']) {
      for (const [key, value] of Object.entries(current[name][lang])) {
        if (key in pool[lang] && pool[lang][key] !== value) {
          warnings.push(
            `${lang}: "${key}" differs between ${origin[lang][key]} and ${name}; keeping ${name}'s`
          );
        }
        pool[lang][key] = value;
        origin[lang][key] = name;
      }
    }
  }
  const allKeys = [...new Set([...Object.keys(pool.en), ...Object.keys(pool.hi)])].sort();

  const prefixes = Object.entries(config.prefixes).sort((a, b) => b[0].length - a[0].length);
  const mapped = (key) => prefixes.find(([prefix]) => key.startsWith(prefix))?.[1];

  // 2. pin what the shell renders — unless the layout that renders it loads
  //    the key's catalogue itself (the `(app)` layout loading the inbox's
  //    words, so that /login does not)
  const pinned = new Set();
  for (const entry of shellEntries(root)) {
    const closure = staticClosure(root, entry);
    const declared = declaredCatalogues(root, clientClosure(root, entry));
    for (const key of referencedKeys(root, closure, allKeys)) {
      if (!declared.has(mapped(key))) pinned.add(key);
    }
  }

  // 3. assign
  const unmapped = new Set();
  const assignment = {};
  for (const key of allKeys) {
    if (pinned.has(key)) {
      assignment[key] = 'shell';
      continue;
    }
    const hit = mapped(key);
    if (!hit) unmapped.add(key.split('.')[0]);
    assignment[key] = hit ?? 'shell';
  }
  for (const namespace of [...unmapped].sort()) {
    warnings.push(`"${namespace}.*" has no line in locales/catalogues.json — kept in the shell`);
  }

  // 4. the files that should exist
  const files = {};
  const catalogueNames = new Set(Object.values(assignment));
  catalogueNames.add('shell');
  for (const name of catalogueNames) {
    for (const lang of LANGS) {
      const content = {};
      for (const key of allKeys) {
        if (assignment[key] === name && key in pool[lang]) content[key] = pool[lang][key];
      }
      const path =
        name === 'shell' ? `locales/${lang}.json` : `${CATALOGUE_DIR}/${name}.${lang}.json`;
      files[path] = stringify(content);
    }
  }
  const featureNames = [...catalogueNames].filter((n) => n !== 'shell').sort();
  const counts = Object.fromEntries(
    [...catalogueNames].map((n) => [n, allKeys.filter((k) => assignment[k] === n).length])
  );
  for (const name of ['shell', ...featureNames]) {
    files[`${MODULE_DIR}/${name}.ts`] = catalogueModule(name);
  }
  files[ALL_MESSAGES] = allMessagesModule(featureNames);

  // stale files to delete
  const stale = [];
  const dir = join(root, CATALOGUE_DIR);
  if (existsSync(dir)) {
    for (const file of readdirSync(dir)) {
      if (!(`${CATALOGUE_DIR}/${file}` in files)) stale.push(`${CATALOGUE_DIR}/${file}`);
    }
  }
  const modDir = join(root, MODULE_DIR);
  if (existsSync(modDir)) {
    for (const file of readdirSync(modDir)) {
      if (!(`${MODULE_DIR}/${file}` in files)) stale.push(`${MODULE_DIR}/${file}`);
    }
  }

  return { assignment, pinned, files, stale, warnings, counts, featureNames };
};

const HEADER =
  '// GENERATED by scripts/split-locales.mjs from locales/catalogues.json — do not\n' +
  '// edit by hand; change the table and re-run the script.\n';

const catalogueModule = (name) => {
  const en = name === 'shell' ? 'locales/en.json' : `locales/catalogues/${name}.en.json`;
  const hi = name === 'shell' ? 'locales/hi.json' : `locales/catalogues/${name}.hi.json`;
  const doc =
    name === 'shell'
      ? `/**\n * The SHELL catalogue: what every route can render. Imported by\n * \`useMessages\`, so it is in the chunk \`app/layout\` loads. See\n * \`src/i18n/catalogueRegistry.ts\`.\n */`
      : `/**\n * The \`${name}\` catalogue. Importing this module is what\n * loads it: a screen that renders these words imports it, and the words\n * arrive with that screen's chunk. See \`src/i18n/catalogueRegistry.ts\`.\n */`;
  // Prettier's own line break, so the generated file is already formatted.
  const oneLine = `  loadHi: () => import('${hi}').then((module) => module.default),`;
  const loadHi =
    oneLine.length <= 100
      ? oneLine
      : `  loadHi: () =>\n    import('${hi}').then((module) => module.default),`;
  return `${HEADER}import { defineCatalogue } from 'src/i18n/catalogueRegistry';

import en from '${en}';

${doc}
export const ${name}Catalogue = defineCatalogue({
  name: '${name}',
  en,
${loadHi}
});
`;
};

const allMessagesModule = (featureNames) => {
  const imports = [
    `import shellEn from 'locales/en.json';`,
    `import shellHi from 'locales/hi.json';`,
    ...featureNames.flatMap((n) => [
      `import ${n}En from 'locales/catalogues/${n}.en.json';`,
      `import ${n}Hi from 'locales/catalogues/${n}.hi.json';`,
    ]),
  ].sort((a, b) => a.split("'")[1].localeCompare(b.split("'")[1]));
  const spread = (lang) =>
    [`shell${lang}`, ...featureNames.map((n) => `${n}${lang}`)].map((v) => `  ...${v},`).join('\n');
  return `${HEADER}import type { Locale } from 'src/types/domain.types';

${imports.join('\n')}

/**
 * Every catalogue at once, per language — what \`renderWithProviders\` hands
 * \`IntlProvider\`, and what a test reads when it looks a string up.
 *
 * TESTS ONLY. The product never loads this: each screen imports the
 * catalogues it renders (\`src/i18n/catalogues/*\`), and
 * \`scripts/check-locales.mjs\` proves over the import graph that it does.
 * Handing the tests the union is what keeps a missing KEY loud here — a key
 * that exists in no catalogue still renders raw and fails the assertion —
 * without every test having to know which screen loads what.
 */
export const en: Readonly<Record<string, string>> = {
${spread('En')}
};

export const hi: Readonly<Record<string, string>> = {
${spread('Hi')}
};

export const ALL_MESSAGES: Readonly<Record<Locale, Readonly<Record<string, string>>>> = { en, hi };
`;
};

/** Files whose content on disk differs from the plan. */
export const drift = (root, result) => {
  const changed = [];
  for (const [path, content] of Object.entries(result.files)) {
    const abs = join(root, path);
    if (!existsSync(abs) || readFileSync(abs, 'utf8') !== content) changed.push(path);
  }
  return [...changed, ...result.stale.map((p) => `${p} (delete)`)];
};

const main = () => {
  const root = process.cwd();
  const check = process.argv.includes('--check');
  const result = plan(root);
  result.warnings.forEach((w) => console.warn(`  ! ${w}`));
  const changed = drift(root, result);
  if (check) {
    if (changed.length) {
      console.error('✗ the locale split is out of date — run `node scripts/split-locales.mjs`:');
      changed.forEach((p) => console.error(`    ${p}`));
      process.exit(1);
    }
    console.log('✓ locale split is current');
    return;
  }
  mkdirSync(join(root, CATALOGUE_DIR), { recursive: true });
  mkdirSync(join(root, MODULE_DIR), { recursive: true });
  for (const [path, content] of Object.entries(result.files))
    writeFileSync(join(root, path), content);
  for (const path of result.stale) unlinkSync(join(root, path));
  const summary = Object.entries(result.counts)
    .sort((a, b) => b[1] - a[1])
    .map(([n, c]) => `${n} ${c}`)
    .join(', ');
  console.log(`✓ ${changed.length} file(s) written. Keys per catalogue: ${summary}`);
  console.log(`  (${result.pinned.size} keys pinned to the shell by the shell's own imports)`);
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
