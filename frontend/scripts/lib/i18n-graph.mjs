/**
 * The import graph of the app, as far as message catalogues care about it.
 *
 * Shared by `split-locales.mjs` (which asks "which keys does the SHELL render?")
 * and `check-locales.mjs` (which asks "does every chunk that renders a key load
 * the catalogue that holds it?"). A regex walk rather than the TypeScript
 * compiler, for the reason `invalidation.registry.test.ts` gives: the shapes the
 * standards permit are few, and the compiler is not a dependency (ADR-021).
 *
 * What it understands:
 *   · `import … from 'x'`, `export … from 'x'`, `import 'x'` — STATIC edges.
 *     `import type` / `export type` are dropped: they emit nothing.
 *   · `import('x')` — a DYNAMIC edge: the target is its own chunk, evaluated
 *     later than the module that asks for it.
 *   · the four tsconfig aliases (src/, modules/, app/, locales/) and relative
 *     paths; bare package specifiers are outside the app and ignored.
 *   · every string literal, and the static head of every template literal, as
 *     a possible message id. Over-reading is safe (a catalogue loaded that did
 *     not strictly need to be); under-reading is what the check exists to stop.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const EXTENSIONS = ['.tsx', '.ts', '.mjs', '.js', '.json'];

export const toPosix = (path) => path.split(sep).join('/');

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const isTestFile = (path) => /\.test\.tsx?$|[/\\]tests[/\\]|[/\\]__mocks__[/\\]/.test(path);

/** Every app source file (tests excluded — they are not shipped). */
export const sourceFiles = (root) =>
  ['src', 'app']
    .flatMap((dir) => walk(join(root, dir)))
    .filter((path) => /\.(tsx?|mjs)$/.test(path) && !/\.d\.ts$/.test(path) && !isTestFile(path));

const resolveFile = (base) => {
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of EXTENSIONS) if (existsSync(base + ext)) return base + ext;
  for (const ext of EXTENSIONS) {
    const index = join(base, `index${ext}`);
    if (existsSync(index)) return index;
  }
  return null;
};

export const resolveSpecifier = (root, from, specifier) => {
  if (specifier.startsWith('.')) return resolveFile(resolve(dirname(from), specifier));
  const alias = /^(src|modules|app|locales)\/(.*)$/.exec(specifier);
  if (!alias) return null;
  const [, head, rest] = alias;
  const base = head === 'modules' ? join(root, 'src/modules', rest) : join(root, head, rest);
  return resolveFile(base);
};

const STATIC_IMPORT =
  /(?:^|[;\n])\s*(import|export)\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/g;
const BARE_IMPORT = /(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
/**
 * The string literals of a source file, comments skipped, with the static head
 * of each template literal. A character scanner rather than one regex: a
 * regex loses its place at the first `${…}` that contains a quote, and then
 * reads real code as the inside of a string.
 * Returns `[text, isPrefix]` pairs.
 */
const scanLiterals = (source) => {
  const out = [];
  const templateDepth = []; // brace depth at which each open `${` resumes its template
  let braces = 0;
  let i = 0;
  const n = source.length;
  const readTemplate = () => {
    // at the char after a backtick (or after the `}` closing an interpolation)
    let text = '';
    while (i < n) {
      const c = source[i];
      if (c === '\\') {
        text += source.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (c === '`') {
        i += 1;
        return [text, false];
      }
      if (c === '$' && source[i + 1] === '{') {
        i += 2;
        templateDepth.push(braces);
        braces += 1;
        return [text, true];
      }
      text += c;
      i += 1;
    }
    return [text, false];
  };
  while (i < n) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      i = end === -1 ? n : end;
    } else if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      let text = '';
      while (j < n && source[j] !== c && source[j] !== '\n') {
        if (source[j] === '\\') {
          text += source.slice(j, j + 2);
          j += 2;
        } else {
          text += source[j];
          j += 1;
        }
      }
      // `'parties.status.' + status` — a head something is concatenated onto.
      const after = source.slice(j + 1, j + 8).trimStart();
      out.push([text, after.startsWith('+')]);
      i = j + 1;
    } else if (c === '`') {
      i += 1;
      const [text, interpolated] = readTemplate();
      out.push([text, interpolated]);
    } else if (c === '{') {
      braces += 1;
      i += 1;
    } else if (c === '}') {
      braces -= 1;
      i += 1;
      if (templateDepth.length && templateDepth[templateDepth.length - 1] === braces) {
        templateDepth.pop();
        // the rest of the template after an interpolation is not a key head
        readTemplate();
      }
    } else {
      i += 1;
    }
  }
  return out;
};

const cache = new Map();

/**
 * One file's edges and literals.
 * `strings` are complete literals; `prefixes` are literal heads that something
 * is concatenated onto (`` `parties.status.${s}` ``, `'parties.status.' + s`).
 */
export const parseFile = (root, path) => {
  if (cache.has(path)) return cache.get(path);
  const source = readFileSync(path, 'utf8');
  const staticEdges = new Set();
  const dynamicEdges = new Set();
  for (const match of source.matchAll(STATIC_IMPORT)) {
    const [, , typeOnly, , specifier] = match;
    if (typeOnly) continue;
    const target = resolveSpecifier(root, path, specifier);
    if (target) staticEdges.add(target);
  }
  for (const match of source.matchAll(BARE_IMPORT)) {
    const target = resolveSpecifier(root, path, match[1]);
    if (target) staticEdges.add(target);
  }
  for (const match of source.matchAll(DYNAMIC_IMPORT)) {
    const target = resolveSpecifier(root, path, match[1]);
    if (target) dynamicEdges.add(target);
  }
  const strings = new Set();
  const prefixes = new Set();
  for (const [text, isPrefix] of scanLiterals(source)) {
    if (!text || !text.includes('.') || /\s/.test(text)) continue;
    if (isPrefix || text.endsWith('.')) prefixes.add(text);
    else strings.add(text);
  }
  const isClient = /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(source);
  const parsed = { path, staticEdges, dynamicEdges, strings, prefixes, isClient };
  cache.set(path, parsed);
  return parsed;
};

/** The modules evaluated together with `entry` — its static closure. */
export const staticClosure = (root, entry) => {
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const path = stack.pop();
    if (seen.has(path) || path.endsWith('.json')) continue;
    seen.add(path);
    for (const next of parseFile(root, path).staticEdges) stack.push(next);
  }
  return seen;
};

/**
 * The part of an entry's static closure that runs in the BROWSER: everything
 * below the first `'use client'` module on each path (the whole closure, for
 * an entry that is itself a client module). A catalogue imported by a server
 * component registers on the server only, and helps no screen.
 */
export const clientClosure = (root, entry, startClient = false) => {
  const seen = new Set();
  const visit = (path, client) => {
    if (path.endsWith('.json')) return;
    const parsed = parseFile(root, path);
    const inClient = client || parsed.isClient;
    const key = `${inClient}:${path}`;
    if (seen.has(key)) return;
    seen.add(key);
    for (const next of parsed.staticEdges) visit(next, inClient);
  };
  visit(entry, startClient);
  return new Set([...seen].filter((k) => k.startsWith('true:')).map((k) => k.slice(5)));
};

/**
 * The message ids a set of modules can render, given the full key list.
 * A prefix matches every key that starts with it.
 */
export const referencedKeys = (root, modules, allKeys) => {
  const keySet = new Set(allKeys);
  const found = new Set();
  const prefixes = [];
  for (const path of modules) {
    const { strings, prefixes: heads } = parseFile(root, path);
    for (const text of strings) if (keySet.has(text)) found.add(text);
    for (const head of heads) if (head.length > 2) prefixes.push(head);
  }
  if (prefixes.length) {
    for (const key of allKeys) if (prefixes.some((head) => key.startsWith(head))) found.add(key);
  }
  return found;
};

/** Every `app/**` file Next treats as an entry point. */
export const routeEntries = (root) =>
  walk(join(root, 'app')).filter((path) =>
    /[/\\](page|layout|error|not-found|global-error|template|loading)\.tsx$/.test(path)
  );

/** The layouts above an app file, outermost first (the root layout included). */
export const layoutChain = (root, entry) => {
  const chain = [];
  let dir = dirname(entry);
  const appRoot = join(root, 'app');
  const isLayout = /[/\\]layout\.tsx$/.test(entry);
  if (isLayout) dir = dirname(dir);
  for (;;) {
    const layout = join(dir, 'layout.tsx');
    if (existsSync(layout) && layout !== entry) chain.unshift(layout);
    if (dir === appRoot || !dir.startsWith(appRoot)) break;
    dir = dirname(dir);
  }
  return chain;
};

export const rel = (root, path) => toPosix(relative(root, path));
