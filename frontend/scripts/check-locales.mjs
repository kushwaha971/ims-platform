#!/usr/bin/env node
/**
 * Part 19 §19.11.3 / §19.11.7 — the message catalogues are complete, disjoint,
 * current, and loaded where they are rendered. CI fails naming the keys.
 *
 * Since W4-P (28 Sep 2026) the words are split across catalogues — the shell's
 * `locales/{en,hi}.json` and one `locales/catalogues/<name>.{en,hi}.json` per
 * feature (see `src/i18n/catalogueRegistry.ts`) — so "en.json and hi.json have
 * identical keys" became four checks:
 *
 *   1. PAIRS — every catalogue has identical key sets in en and hi. A Hindi
 *      string may temporarily equal the English one; it may not be missing.
 *      Keys are flat, non-empty strings.
 *   2. DISJOINT — no key is defined by two catalogues. Two copies of a key are
 *      two strings that will drift, and which one a screen shows would depend on
 *      which chunk happened to load first.
 *   3. CURRENT — every key is in the catalogue `locales/catalogues.json` puts
 *      it in, and the generated loader modules match (`split-locales.mjs
 *      --check`). A key another track added to `locales/en.json` fails here
 *      until the split is re-run.
 *   4. LOADED — every chunk that can render a key loads its catalogue. Walks
 *      the import graph (`scripts/lib/i18n-graph.mjs`) from every route entry
 *      and every `import()` target: the ids a chunk's modules reference must be
 *      in the shell, in a catalogue module the chunk itself imports, or in one
 *      every chunk that can load it has already imported. This is what keeps
 *      the product honest while the tests see every catalogue at once.
 *
 * Node standard library only (ADR-021).
 */
import { drift, plan, readCatalogues, readConfig } from './split-locales.mjs';
import {
  clientClosure,
  layoutChain,
  parseFile,
  referencedKeys,
  rel,
  routeEntries,
  staticClosure,
} from './lib/i18n-graph.mjs';
import { declaredCatalogues } from './split-locales.mjs';

const root = process.cwd();
const failures = [];
const fail = (title, lines) => {
  failures.push(title);
  console.error(`✗ ${title}`);
  const shown = process.argv.includes('--all') ? lines : lines.slice(0, 60);
  shown.forEach((line) => console.error(`    ${line}`));
  if (shown.length < lines.length) console.error(`    … and ${lines.length - 60} more`);
};

// ── 1. pairs ────────────────────────────────────────────────────────────────
const catalogues = readCatalogues(root);
const fileOf = (name, lang) =>
  name === 'shell' ? `locales/${lang}.json` : `locales/catalogues/${name}.${lang}.json`;
let total = 0;
for (const [name, { en, hi }] of Object.entries(catalogues)) {
  const enKeys = Object.keys(en);
  const hiKeys = new Set(Object.keys(hi));
  total += enKeys.length;
  const missingInHi = enKeys.filter((key) => !hiKeys.has(key));
  const missingInEn = [...hiKeys].filter((key) => !(key in en));
  if (missingInHi.length)
    fail(`${missingInHi.length} key(s) missing from ${fileOf(name, 'hi')}:`, missingInHi);
  if (missingInEn.length)
    fail(`${missingInEn.length} key(s) missing from ${fileOf(name, 'en')}:`, missingInEn);
  for (const lang of ['en', 'hi']) {
    const bad = Object.entries(catalogues[name][lang])
      .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
      .map(([key]) => key);
    if (bad.length)
      fail(`${fileOf(name, lang)}: keys must be FLAT, non-empty strings (§19.11.3):`, bad);
  }
}

// ── 2. disjoint ─────────────────────────────────────────────────────────────
const owner = new Map();
const duplicated = [];
for (const [name, { en, hi }] of Object.entries(catalogues)) {
  for (const key of new Set([...Object.keys(en), ...Object.keys(hi)])) {
    if (owner.has(key)) duplicated.push(`${key}  (${owner.get(key)} and ${name})`);
    else owner.set(key, name);
  }
}
if (duplicated.length)
  fail(`${duplicated.length} key(s) defined by more than one catalogue:`, duplicated);

// ── 3. current ──────────────────────────────────────────────────────────────
readConfig(root);
const result = plan(root);
result.warnings.forEach((warning) => console.warn(`  ! ${warning}`));
const changed = drift(root, result);
if (changed.length) {
  fail('the locale split is out of date — run `node scripts/split-locales.mjs`:', changed);
}

// ── 4. loaded ───────────────────────────────────────────────────────────────
const allKeys = [...owner.keys()];
const catalogueOf = (key) => owner.get(key);
const MODULE_PREFIX = 'src/i18n/catalogues/';

const entries = new Map(); // path -> { closure, declared, parents: Set<path>, kind }
const addEntry = (path, kind) => {
  if (entries.has(path)) return entries.get(path);
  const closure = staticClosure(root, path);
  const declared = declaredCatalogues(root, clientClosure(root, path, kind === 'dynamic'));
  const entry = { closure, declared, parents: new Set(), kind };
  entries.set(path, entry);
  return entry;
};
for (const path of routeEntries(root)) addEntry(path, 'route');
// dynamic targets, discovered transitively
const queue = [...entries.keys()];
while (queue.length) {
  const path = queue.shift();
  const entry = entries.get(path);
  for (const mod of entry.closure) {
    for (const target of parseFile(root, mod).dynamicEdges) {
      if (target.endsWith('.json')) continue;
      const known = entries.has(target);
      const child = addEntry(target, 'dynamic');
      child.parents.add(path);
      if (!known) queue.push(target);
    }
  }
}

// provided(E): what is certainly registered when E's modules render.
const provided = new Map();
const providedOf = (path, stack = new Set()) => {
  if (provided.has(path)) return provided.get(path);
  const entry = entries.get(path);
  const own = new Set(entry.declared);
  if (entry.kind === 'route') {
    for (const layout of layoutChain(root, path)) {
      if (layout === path) continue;
      for (const name of providedOf(layout, stack)) own.add(name);
    }
  } else if (!stack.has(path)) {
    stack.add(path);
    let common = null;
    for (const parent of entry.parents) {
      const theirs = providedOf(parent, stack);
      common =
        common === null ? new Set(theirs) : new Set([...common].filter((n) => theirs.has(n)));
    }
    stack.delete(path);
    for (const name of common ?? []) own.add(name);
  }
  provided.set(path, own);
  return own;
};

const unloaded = [];
for (const [path, entry] of entries) {
  const have = providedOf(path);
  const need = new Map(); // catalogue -> first key + module that needs it
  for (const mod of entry.closure) {
    if (rel(root, mod).startsWith(MODULE_PREFIX)) continue;
    for (const key of referencedKeys(root, [mod], allKeys)) {
      const name = catalogueOf(key);
      if (name === 'shell' || have.has(name) || need.has(name)) continue;
      need.set(name, `${key} in ${rel(root, mod)}`);
    }
  }
  for (const [name, why] of need) {
    unloaded.push(`${rel(root, path)}: import 'src/i18n/catalogues/${name}' — renders ${why}`);
  }
}
if (unloaded.length) {
  fail(
    `${unloaded.length} chunk(s) render words from a catalogue they do not load. Import the ` +
      'catalogue module in the route file (or in the dynamic() target, to keep it out of first paint):',
    unloaded.sort()
  );
}

// ── the other direction, as a warning: bytes rather than raw ids ───────────
// A catalogue a file imports that nothing it can render — its own chunk or any
// chunk it can load — ever uses. Only DIRECT imports are judged: a catalogue
// arriving through a shared component is that component's to justify.
const usedBelow = new Map();
const namesUsed = (path, stack = new Set()) => {
  if (usedBelow.has(path)) return usedBelow.get(path);
  const used = new Set();
  if (stack.has(path)) return used;
  stack.add(path);
  const entry = entries.get(path);
  for (const mod of entry.closure) {
    for (const key of referencedKeys(root, [mod], allKeys)) used.add(catalogueOf(key));
    for (const target of parseFile(root, mod).dynamicEdges) {
      if (entries.has(target)) for (const n of namesUsed(target, stack)) used.add(n);
    }
  }
  stack.delete(path);
  usedBelow.set(path, used);
  return used;
};
const unused = [];
for (const [path, entry] of entries) {
  if (!parseFile(root, path).isClient && entry.kind === 'route') continue;
  const direct = [...parseFile(root, path).staticEdges]
    .map((target) => rel(root, target))
    .filter((target) => target.startsWith(MODULE_PREFIX))
    .map((target) => target.slice(MODULE_PREFIX.length).replace(/\.ts$/, ''));
  const used = namesUsed(path);
  const usedHere = new Set(
    [...referencedKeys(root, entry.closure, allKeys)].map((key) => catalogueOf(key))
  );
  for (const name of direct) {
    if (name === 'shell') continue;
    if (!used.has(name)) unused.push(`imports a catalogue it never renders — ${rel(root, path)}: ${name}`);
    else if (!usedHere.has(name)) {
      unused.push(
        `only its dynamic() children render ${name}; importing it there keeps it out of ` +
          `first paint — ${rel(root, path)}`
      );
    }
  }
}
unused.sort().forEach((line) => console.warn(`  ! ${line}`));

if (failures.length) process.exit(1);

const names = Object.keys(catalogues).length;
console.log(
  `✓ locales in step — ${total} keys in ${names} catalogues (en and hi), disjoint, current, ` +
    `and loaded by every one of ${entries.size} chunks that renders them`
);
