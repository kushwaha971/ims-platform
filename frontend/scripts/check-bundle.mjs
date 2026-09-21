#!/usr/bin/env node
/**
 * Part 19 §19.9.2 — the bundle budget gate.
 *
 * `.github/workflows/ci.yml` has run `npm run bundle:check --if-present` since
 * Sprint 0 against a script that did not exist, so npm exited 0 having run
 * nothing and the budgets drifted 19–59 % over while CI stayed green. This is
 * that script. The `--if-present` is gone from the workflow with it.
 *
 * ── What it measures ────────────────────────────────────────────────────────
 *
 * The real build output, not an estimate and not a source-level guess:
 *
 *   `.next/build-manifest.json`
 *       `rootMainFiles`  → the FRAMEWORK chunks (react-dom, the Next client
 *                          runtime, the Turbopack loader) — loaded by every
 *                          route by construction.
 *       `polyfillFiles`  → EXCLUDED everywhere. Next emits it with `noModule`,
 *                          so a modern browser never downloads it. Counting its
 *                          ~38 KB against a budget that a modern phone never
 *                          pays would make every number here a lie.
 *
 *   `.next/server/app/ ** /page_client-reference-manifest.js`
 *       One per route. `entryJSFiles` maps each entry in the route's segment
 *       chain (root layout → group layout → error → page) to the chunks the
 *       client needs. Their union, plus the framework chunks, is exactly what a
 *       cold visit to that route downloads.
 *
 * Every chunk is gzipped at level 9 and counted once per route, so a chunk two
 * segments share is not double-counted.
 *
 * ── The four numbers ────────────────────────────────────────────────────────
 *
 *   framework  rootMainFiles − polyfills
 *   sharedApp  the chunks EVERY route loads, minus framework
 *   route      a route's own chunks: first-load set − framework − sharedApp
 *   firstLoad  framework + sharedApp + route
 *
 * The split matters because the two failure modes are different. A route chunk
 * over budget is one screen importing too much and is fixed in that screen. A
 * sharedApp over budget is something leaking into the shell, which every route
 * pays for including the ones that render only text — that is the expensive
 * kind and it is the kind that had actually happened.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *
 *   npm run bundle:check              check against bundle-budgets.json
 *   npm run bundle:check -- --report  print the table, always exit 0
 *   npm run bundle:check -- --json    machine-readable, for a CI artifact
 *
 * No dependency: the build emits everything needed and node has gzip.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import url from 'node:url';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const NEXT_DIR = path.join(ROOT, '.next');
const BUDGETS_FILE = path.join(ROOT, 'bundle-budgets.json');

const KB = 1024;
const argv = new Set(process.argv.slice(2));
const REPORT_ONLY = argv.has('--report');
const AS_JSON = argv.has('--json');

const fail = (message) => {
  process.stderr.write(`\n  bundle:check — ${message}\n\n`);
  process.exit(1);
};

// ── Read the build output ───────────────────────────────────────────────────

if (!fs.existsSync(NEXT_DIR)) fail(`no build found at ${NEXT_DIR}. Run \`npm run build\` first.`);

const buildManifestPath = path.join(NEXT_DIR, 'build-manifest.json');
if (!fs.existsSync(buildManifestPath)) fail(`no build-manifest.json. Run \`npm run build\` first.`);

const buildManifest = JSON.parse(fs.readFileSync(buildManifestPath, 'utf8'));
const polyfills = new Set(buildManifest.polyfillFiles ?? []);
const frameworkFiles = (buildManifest.rootMainFiles ?? []).filter((f) => !polyfills.has(f));

if (frameworkFiles.length === 0) {
  fail(
    'build-manifest.json listed no rootMainFiles — the build output is not the shape this script reads.'
  );
}

/** Every `page_client-reference-manifest.js` under `.next/server/app`. */
const findManifests = (dir, found = []) => {
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findManifests(full, found);
    else if (entry.name === 'page_client-reference-manifest.js') found.push(full);
  }
  return found;
};

const manifestFiles = findManifests(path.join(NEXT_DIR, 'server', 'app'));
if (manifestFiles.length === 0) {
  fail('found no page_client-reference-manifest.js under .next/server/app — nothing to measure.');
}

// ── gzip, memoised: a chunk shared by ten routes is compressed once ─────────

const gzCache = new Map();
const gzipBytes = (file) => {
  const hit = gzCache.get(file);
  if (hit !== undefined) return hit;
  const abs = path.join(NEXT_DIR, file);
  if (!fs.existsSync(abs)) fail(`manifest names a chunk that was not emitted: ${file}`);
  const size = zlib.gzipSync(fs.readFileSync(abs), { level: 9 }).length;
  gzCache.set(file, size);
  return size;
};
const sum = (files) => [...files].reduce((total, file) => total + gzipBytes(file), 0);

// ── Route key → its first-load chunk set ────────────────────────────────────

/** `/(app)/parties/page` → `/parties`; `/page` → `/`. Route groups are not URL. */
const toRoutePath = (manifestKey) => {
  const stripped = manifestKey
    .replace(/\/\([^)]*\)/g, '')
    .replace(/\/page$/, '')
    .replace(/\/route$/, '');
  return stripped === '' ? '/' : stripped;
};

const routes = [];
for (const file of manifestFiles) {
  globalThis.__RSC_MANIFEST = {};
  // The manifest is a plain assignment to globalThis.__RSC_MANIFEST. Running it
  // in a Function keeps it out of this module's scope; it is our own build
  // output, produced seconds ago by our own toolchain.
  new Function(fs.readFileSync(file, 'utf8'))();

  for (const [key, entry] of Object.entries(globalThis.__RSC_MANIFEST)) {
    const chunks = new Set(frameworkFiles);
    for (const list of Object.values(entry.entryJSFiles ?? {})) {
      for (const chunk of list) if (!polyfills.has(chunk)) chunks.add(chunk);
    }
    routes.push({ route: toRoutePath(key), chunks });
  }
}
delete globalThis.__RSC_MANIFEST;
routes.sort((a, b) => a.route.localeCompare(b.route));

// ── Budgets ─────────────────────────────────────────────────────────────────

if (!fs.existsSync(BUDGETS_FILE)) fail(`no bundle-budgets.json at ${BUDGETS_FILE}.`);
const budgets = JSON.parse(fs.readFileSync(BUDGETS_FILE, 'utf8'));
const ignored = new Set(budgets.ignoreRoutes ?? []);
const measured = routes.filter((r) => !ignored.has(r.route));
if (measured.length === 0)
  fail('every route is in `ignoreRoutes` — the gate would pass vacuously.');

// ── The three tiers ─────────────────────────────────────────────────────────

const frameworkBytes = sum(frameworkFiles);

// sharedApp = in every measured route's set, and not framework.
const sharedApp = new Set(measured[0].chunks);
for (const r of measured)
  for (const chunk of [...sharedApp]) if (!r.chunks.has(chunk)) sharedApp.delete(chunk);
for (const chunk of frameworkFiles) sharedApp.delete(chunk);
const sharedAppBytes = sum(sharedApp);

const rows = measured
  .map((r) => {
    const own = [...r.chunks].filter((c) => !sharedApp.has(c) && !frameworkFiles.includes(c));
    const routeBytes = sum(own);
    const budget = { ...budgets.default, ...(budgets.routes?.[r.route] ?? {}) };
    return {
      route: r.route,
      routeBytes,
      firstLoadBytes: frameworkBytes + sharedAppBytes + routeBytes,
      routeBudget: budget.route,
      firstLoadBudget: budget.firstLoad,
    };
  })
  .sort((a, b) => b.firstLoadBytes - a.firstLoadBytes);

// ── Violations ──────────────────────────────────────────────────────────────

const kb = (bytes) => bytes / KB;
const fmt = (bytes) => kb(bytes).toFixed(1);
const over = (bytes, budgetKb) => kb(bytes) - budgetKb;

const violations = [];
const consider = (what, bytes, budgetKb) => {
  if (budgetKb === undefined || budgetKb === null) return;
  const delta = over(bytes, budgetKb);
  if (delta > 0) {
    violations.push({
      what,
      measuredKb: +kb(bytes).toFixed(1),
      budgetKb,
      overKb: +delta.toFixed(1),
      overPct: Math.round((delta / budgetKb) * 100),
    });
  }
};

consider('shared framework chunks', frameworkBytes, budgets.shared?.framework);
consider('shared app chunks', sharedAppBytes, budgets.shared?.sharedApp);
for (const row of rows) {
  consider(`route chunk  ${row.route}`, row.routeBytes, row.routeBudget);
  consider(`first load   ${row.route}`, row.firstLoadBytes, row.firstLoadBudget);
}

// ── Output ──────────────────────────────────────────────────────────────────

if (AS_JSON) {
  process.stdout.write(
    `${JSON.stringify(
      {
        framework: { kb: +kb(frameworkBytes).toFixed(1), budgetKb: budgets.shared?.framework },
        sharedApp: { kb: +kb(sharedAppBytes).toFixed(1), budgetKb: budgets.shared?.sharedApp },
        routes: rows.map((r) => ({
          route: r.route,
          routeKb: +kb(r.routeBytes).toFixed(1),
          routeBudgetKb: r.routeBudget,
          firstLoadKb: +kb(r.firstLoadBytes).toFixed(1),
          firstLoadBudgetKb: r.firstLoadBudget,
        })),
        violations,
      },
      null,
      2
    )}\n`
  );
} else {
  const pad = Math.max(30, ...rows.map((r) => r.route.length + 2));
  const line = (a, b, c, d, e) =>
    `  ${String(a).padEnd(pad)}${String(b).padStart(9)}${String(c).padStart(9)}${String(d).padStart(11)}${String(e).padStart(9)}`;

  process.stdout.write(
    '\n  First-load JavaScript, gzip -9, modern browser (noModule polyfill excluded)\n\n'
  );
  process.stdout.write(line('route', 'route', 'budget', 'first load', 'budget'));
  process.stdout.write(`\n  ${'─'.repeat(pad + 38)}\n`);
  process.stdout.write(
    `  ${'framework (react-dom, next)'.padEnd(pad)}${fmt(frameworkBytes).padStart(9)}${String(budgets.shared?.framework ?? '—').padStart(9)}\n`
  );
  process.stdout.write(
    `  ${'shared app (every route)'.padEnd(pad)}${fmt(sharedAppBytes).padStart(9)}${String(budgets.shared?.sharedApp ?? '—').padStart(9)}\n`
  );
  process.stdout.write(`  ${'─'.repeat(pad + 38)}\n`);
  for (const r of rows) {
    const flag = violations.some(
      (v) => v.what.endsWith(`  ${r.route}`) || v.what.endsWith(`   ${r.route}`)
    )
      ? ' ✗'
      : '';
    process.stdout.write(
      `${line(r.route, fmt(r.routeBytes), r.routeBudget ?? '—', fmt(r.firstLoadBytes), r.firstLoadBudget ?? '—')}${flag}\n`
    );
  }
  process.stdout.write(
    `\n  baseline every route pays: ${fmt(frameworkBytes + sharedAppBytes)} KB gz  (framework ${fmt(frameworkBytes)} + shared app ${fmt(sharedAppBytes)})\n`
  );
}

if (violations.length === 0) {
  if (!AS_JSON)
    process.stdout.write('\n  ✓ every bundle is inside its budget in bundle-budgets.json\n\n');
  process.exit(0);
}

if (REPORT_ONLY) {
  if (!AS_JSON) process.stdout.write('\n  --report: budgets exceeded, not failing.\n\n');
  process.exit(0);
}

process.stderr.write(
  `\n  ✗ ${violations.length} bundle budget${violations.length === 1 ? '' : 's'} exceeded\n\n`
);
for (const v of violations) {
  process.stderr.write(
    `      ${v.what.padEnd(34)} ${String(v.measuredKb).padStart(7)} KB  >  ${String(v.budgetKb).padStart(5)} KB   over by ${v.overKb} KB (+${v.overPct}%)\n`
  );
}
process.stderr.write(
  '\n  Either take the bytes back out, or raise the number in frontend/bundle-budgets.json\n' +
    '  in the same commit and say in the PR description what bought the increase.\n\n'
);
process.exit(1);
