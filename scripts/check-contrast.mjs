#!/usr/bin/env node
/**
 * scripts/check-contrast.mjs — Part 23 §23.6, deliverable 3 of §23.7.
 *
 * Recomputes every contrast pairing the product actually renders FROM THE TOKEN
 * FILES (frontend/src/styles/tokens/*.css), never from the chapter, and fails CI
 * with error code `low_contrast` when a pairing falls below its floor:
 *   4.5  text pairings  (the smallest semantic type is ds-body-sm at 13.5px/400,
 *                        which is not WCAG large text, so no size exception applies)
 *   3.0  non-text pairings (WCAG 1.4.11: fills, control boundaries, focus rings)
 *
 * A semantic colour token that is defined in the token files and appears in no
 * pairing is also a failure (`uncovered_token`): adding a colour without adding
 * its pairing is how the table stopped being true last time.
 *
 * Usage:
 *   node scripts/check-contrast.mjs            # check, exit 1 on any finding
 *   node scripts/check-contrast.mjs --print    # emit the §23.6 markdown tables
 *   node scripts/check-contrast.mjs --json     # machine-readable findings
 *   node scripts/check-contrast.mjs --tokens <dir>
 *
 * Standard library only — no npm dependency, so it runs before `npm ci`.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const TOKENS_DIR = path.resolve(
  opt("--tokens", path.join(REPO, "frontend", "src", "styles", "tokens")),
);

const TEXT_FLOOR = 4.5;
const NON_TEXT_FLOOR = 3.0;

/* ------------------------------------------------------------------ *
 * 1. Token parsing — scope aware (light = :root, dark = data-theme)
 * ------------------------------------------------------------------ */

/**
 * Splits a stylesheet into { selector, body } blocks, one level deep, so that
 * @media wrappers are descended into rather than treated as a rule.
 */
function* blocks(css) {
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open === -1) return;
    const selector = css.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    const body = css.slice(open + 1, j - 1);
    if (/^@(media|supports|layer)/i.test(selector)) {
      yield* blocks(body);
    } else {
      yield { selector, body };
    }
    i = j;
  }
}

const DARK_SELECTOR = /(\[data-theme\s*=\s*["']?dark["']?\])|(\.dark\b)/i;
const LIGHT_SELECTOR = /(:root|html|\[data-theme\s*=\s*["']?light["']?\])/i;

/** scope -> Map(varName -> rawValue) */
function readTokens(dir) {
  if (!fs.existsSync(dir)) {
    return { missing: true, files: [], scopes: { light: new Map(), dark: new Map() } };
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".css"))
    .sort()
    .map((f) => path.join(dir, f));

  const scopes = { light: new Map(), dark: new Map() };
  for (const file of files) {
    const css = stripComments(fs.readFileSync(file, "utf8"));
    for (const { selector, body } of blocks(css)) {
      const isDark = DARK_SELECTOR.test(selector);
      const isLight = !isDark && LIGHT_SELECTOR.test(selector);
      if (!isDark && !isLight) continue;
      const target = isDark ? scopes.dark : scopes.light;
      for (const m of body.matchAll(/(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/g)) {
        target.set(m[1].trim(), m[2].trim());
      }
    }
  }
  return { missing: false, files, scopes };
}

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/* ------------------------------------------------------------------ *
 * 2. Colour resolution — hex, rgb(), hsl(), bare HSL triplets, var()
 * ------------------------------------------------------------------ */

function resolve(name, scope, scopes, seen = new Set()) {
  const map = scopes[scope];
  const fallback = scopes.light;
  const raw = map.has(name) ? map.get(name) : fallback.get(name);
  if (raw === undefined) return null;
  if (seen.has(name)) return null;
  seen.add(name);

  const varOnly = raw.match(/^var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,[^)]*)?\)$/);
  if (varOnly) return resolve(varOnly[1], scope, scopes, seen);

  // hsl(var(--x) / <alpha-value>) and friends: resolve the inner variable first.
  const inner = raw.replace(/var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,[^)]*)?\)/g, (_, v) => {
    const r = scopes[scope].has(v) ? scopes[scope].get(v) : fallback.get(v);
    return r === undefined ? "" : r;
  });
  return parseColor(inner);
}

/** -> { r, g, b, a } with channels 0..255, or null when not a colour. */
export function parseColor(input) {
  if (!input) return null;
  const v = input.trim().replace(/\s*<alpha-value>\s*/g, "1").replace(/!important/g, "").trim();

  let m = v.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    const h = m[1];
    const ex = (s) => parseInt(s.length === 1 ? s + s : s, 16);
    if (h.length === 3 || h.length === 4) {
      return {
        r: ex(h[0]), g: ex(h[1]), b: ex(h[2]),
        a: h.length === 4 ? ex(h[3]) / 255 : 1,
      };
    }
    if (h.length === 6 || h.length === 8) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
      };
    }
  }

  m = v.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = splitArgs(m[1]);
    if (p.length >= 3) {
      return {
        r: chan(p[0]), g: chan(p[1]), b: chan(p[2]),
        a: p[3] !== undefined ? alpha(p[3]) : 1,
      };
    }
  }

  m = v.match(/^hsla?\(([^)]+)\)$/i);
  if (m) {
    const p = splitArgs(m[1]);
    if (p.length >= 3) {
      const c = hslToRgb(hue(p[0]), pct(p[1]), pct(p[2]));
      c.a = p[3] !== undefined ? alpha(p[3]) : 1;
      return c;
    }
  }

  // Tailwind/shadcn convention: a bare HSL triplet, e.g. "220 75% 55%".
  m = v.match(/^(-?[\d.]+(?:deg)?)\s+([\d.]+%)\s+([\d.]+%)(?:\s*\/\s*([\d.%]+))?$/);
  if (m) {
    const c = hslToRgb(hue(m[1]), pct(m[2]), pct(m[3]));
    c.a = m[4] !== undefined ? alpha(m[4]) : 1;
    return c;
  }

  return null;
}

function splitArgs(s) {
  return s.replace("/", " ").split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
}
function chan(s) {
  return s.endsWith("%") ? Math.round((parseFloat(s) / 100) * 255) : parseFloat(s);
}
function alpha(s) {
  return s.endsWith("%") ? parseFloat(s) / 100 : parseFloat(s);
}
function hue(s) {
  return ((parseFloat(s) % 360) + 360) % 360;
}
function pct(s) {
  return parseFloat(s) / 100;
}
function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const t = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return {
    r: Math.round((t[0] + m) * 255),
    g: Math.round((t[1] + m) * 255),
    b: Math.round((t[2] + m) * 255),
    a: 1,
  };
}

/* ------------------------------------------------------------------ *
 * 3. WCAG 2.2 relative luminance and contrast
 * ------------------------------------------------------------------ */

function over(fg, bg) {
  if (fg.a >= 1) return fg;
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

function luminance({ r, g, b }) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Rounded DOWN to two decimals, exactly as §23.6 records its ratios. */
export function contrast(fg, bg) {
  const f = luminance(over(fg, bg));
  const b = luminance(bg);
  const ratio = (Math.max(f, b) + 0.05) / (Math.min(f, b) + 0.05);
  return Math.floor(ratio * 100) / 100;
}

/* ------------------------------------------------------------------ *
 * 4. The pairing list — every pairing §23.6 records, by token name
 * ------------------------------------------------------------------ */

const LIGHT_SURFACES = ["--surface-card", "--canvas", "--surface-sunken", "--surface-hover"];

/** Foregrounds painted as TEXT on all four light surfaces. */
const TEXT_ON_LIGHT_SURFACES = [
  "--text-primary",
  "--text-secondary",
  "--text-tertiary",
  "--text-muted",
  "--text-accent",
  "--info",
  "--success",
  "--warning",
  "--error",
  "--form-error",
];

/**
 * --accent is a FILL, BORDER and FOCUS-RING value, never small text: §23.6
 * records it failing on --surface-sunken as text, which is why links and small
 * text use --text-accent. It is therefore held to the 3.0 non-text floor.
 */
const NON_TEXT_ON_LIGHT_SURFACES = ["--accent", "--border-strong"];

/** Explicit pairings: [foreground, background, kind, note] */
const EXPLICIT = [
  ["--success", "--success-dim", "text", "tinted block"],
  ["--warning", "--warning-dim", "text", "tinted block"],
  ["--error", "--error-dim", "text", "tinted block"],
  ["--form-error", "--form-error-dim", "text", "tinted block"],
  ["--info", "--info-dim", "text", "tinted block"],
  ["--text-inverse", "--accent", "text", "text on accent fill"],
  ["--text-inverse", "--success", "text", "text on success fill"],
  ["--text-inverse", "--error", "text", "text on error fill"],
  ["--text-inverse", "--form-error", "text", "text on form-error fill"],
  ["--text-primary", "--surface-nav", "text", "dark navigation rail", "dark"],
];

/** Dark-theme pairings, evaluated against the dark scope. */
const DARK_PAIRS = [
  ["--text-primary", "--surface-card", "text", "dark theme"],
  ["--text-secondary", "--surface-card", "text", "dark theme"],
  ["--text-tertiary", "--surface-card", "text", "dark theme"],
  ["--text-muted", "--surface-card", "text", "dark theme"],
  ["--text-accent", "--surface-card", "text", "dark theme"],
  ["--success-bright", "--surface-card", "text", "dark theme"],
  ["--error", "--surface-card", "text", "dark theme"],
  ["--form-error", "--surface-card", "text", "dark theme"],
  ["--warning-bright", "--surface-card", "text", "dark theme"],
  ["--info", "--surface-card", "text", "dark theme"],
  ["--border-strong", "--canvas", "nontext", "dark theme control boundary"],
  ["--accent", "--canvas", "nontext", "dark theme focus ring / fill"],
];

/**
 * Semantic colour tokens that carry meaning and must appear in some pairing.
 * Anything matching SEMANTIC_RE and defined in the token files but absent from
 * the coverage set below is reported as `uncovered_token`.
 */
const SEMANTIC_RE =
  /^--(text|surface|canvas|accent|success|warning|error|form-error|info|border)(-[a-z0-9-]+)?$/;

/** Decorative or derived tokens deliberately outside the contrast contract. */
const DECORATIVE = new Set([
  "--border-hairline",   // §23.6: decorative separator, 1.3–1.5:1, permitted
  "--border-subtle",     // idem
  "--border-focus",      // the ring is measured through --accent
  "--accent-quiet",      // wash behind text that is itself measured
  "--accent-line",       // chart line, labelled directly (§23.2.4 rule 1)
  "--accent-hover",      // transient state of --accent
  "--accent-press",      // idem
  "--surface-raised",    // same value as --surface-card plus a shadow
  "--surface-active",    // pressed state; text on it is --text-primary
  "--success-dim",
  "--warning-dim",
  "--error-dim",
  "--form-error-dim",
  "--info-dim",
  "--success-bright",
  "--warning-bright",
  "--error-bright",
  "--form-error-bright",
  "--info-bright",
  "--text-inverse",
  "--surface-nav",
  "--canvas",
  "--surface-card",
  "--surface-sunken",
  "--surface-hover",
]);

/* ------------------------------------------------------------------ *
 * 5. Run
 * ------------------------------------------------------------------ */

function pairings(scopes) {
  const out = [];
  for (const fg of TEXT_ON_LIGHT_SURFACES) {
    for (const bg of LIGHT_SURFACES) out.push([fg, bg, "text", "light", "light"]);
  }
  for (const fg of NON_TEXT_ON_LIGHT_SURFACES) {
    for (const bg of LIGHT_SURFACES) out.push([fg, bg, "nontext", "light", "light"]);
  }
  for (const [fg, bg, kind, note, scope] of EXPLICIT) {
    out.push([fg, bg, kind, note, scope ?? "light"]);
  }
  for (const [fg, bg, kind, note] of DARK_PAIRS) out.push([fg, bg, kind, note, "dark"]);
  return out;
}

function main() {
  const { missing, files, scopes } = readTokens(TOKENS_DIR);

  if (missing || files.length === 0) {
    console.error(
      `check-contrast: no token stylesheets found in ${path.relative(REPO, TOKENS_DIR)}/.\n` +
        `  This script recomputes WCAG contrast from the tokens themselves, so it\n` +
        `  cannot run until the design-system token pipeline (Sprint 0, S0-53) has\n` +
        `  written tokens/*.css. Expected at least one .css file defining the\n` +
        `  semantic custom properties of Part 23 §23.2.4 under :root.\n` +
        `  Pass --tokens <dir> to point it elsewhere.`,
    );
    process.exit(2);
  }

  const findings = [];
  const rows = [];

  for (const [fgName, bgName, kind, note, scope] of pairings(scopes)) {
    const fg = resolve(fgName, scope, scopes);
    const bg = resolve(bgName, scope, scopes);
    if (fg === null || bg === null) {
      findings.push({
        code: "missing_token",
        scope,
        pair: `${fgName} on ${bgName}`,
        message: `${fg === null ? fgName : bgName} is not defined (or not a colour) in the ${scope} scope`,
      });
      continue;
    }
    const ratio = contrast(fg, bg);
    const floor = kind === "text" ? TEXT_FLOOR : NON_TEXT_FLOOR;
    rows.push({ fg: fgName, bg: bgName, kind, note, scope, ratio, floor, pass: ratio >= floor });
    if (ratio < floor) {
      findings.push({
        code: "low_contrast",
        scope,
        pair: `${fgName} on ${bgName}`,
        message: `${ratio.toFixed(2)}:1 is below the ${floor.toFixed(1)}:1 floor for a ${
          kind === "text" ? "text" : "non-text"
        } pairing (${note})`,
      });
    }
  }

  // Every semantic colour token defined must be covered by some pairing.
  const covered = new Set();
  for (const r of rows) {
    covered.add(r.fg);
    covered.add(r.bg);
  }
  for (const name of scopes.light.keys()) {
    if (!SEMANTIC_RE.test(name)) continue;
    if (DECORATIVE.has(name) || covered.has(name)) continue;
    // A pure alias (`--border: var(--border-hairline)`) introduces no new colour:
    // the shadcn alias layer of §23.2.5 is entirely of this shape, and every one
    // of its targets is measured under its Koper name. Only a token that states a
    // colour of its own can be an uncovered semantic colour.
    if (/^var\(\s*--[A-Za-z0-9_-]+\s*(?:,[^)]*)?\)$/.test(scopes.light.get(name).trim())) continue;
    const value = resolve(name, "light", scopes);
    if (value === null) continue; // not a colour (e.g. a shadow or a radius)
    findings.push({
      code: "uncovered_token",
      scope: "light",
      pair: name,
      message:
        `${name} is a semantic colour token and appears in no pairing. Add it to the ` +
        `pairing list in scripts/check-contrast.mjs (Part 23 §23.6) or to DECORATIVE ` +
        `with the reason it carries no meaning.`,
    });
  }

  if (flag("--json")) {
    console.log(JSON.stringify({ tokensDir: TOKENS_DIR, rows, findings }, null, 2));
    process.exit(findings.length ? 1 : 0);
  }

  if (flag("--print")) {
    printMarkdown(rows);
  }

  for (const f of findings) {
    console.error(`${f.code}  [${f.scope}]  ${f.pair} — ${f.message}`);
  }
  const checked = rows.length;
  const failed = findings.length;
  console.log(
    `\ncheck-contrast: ${checked} pairing(s) computed from ${files.length} token file(s), ` +
      `${failed} finding(s).`,
  );
  process.exit(failed ? 1 : 0);
}

function printMarkdown(rows) {
  const light = rows.filter((r) => r.scope === "light" && LIGHT_SURFACES.includes(r.bg));
  const byFg = new Map();
  for (const r of light) {
    if (!byFg.has(r.fg)) byFg.set(r.fg, {});
    byFg.get(r.fg)[r.bg] = r;
  }
  console.log(
    `| Foreground | on \`--surface-card\` | on \`--canvas\` | on \`--surface-sunken\` | on \`--surface-hover\` | Verdict |`,
  );
  console.log(`|---|---|---|---|---|---|`);
  for (const [fg, cols] of byFg) {
    const cells = LIGHT_SURFACES.map((s) => (cols[s] ? cols[s].ratio.toFixed(2) : "—"));
    const verdict = LIGHT_SURFACES.every((s) => !cols[s] || cols[s].pass) ? "Pass" : "**Fail**";
    console.log(`| \`${fg}\` | ${cells.join(" | ")} | ${verdict} |`);
  }
  console.log("");
  console.log(`| Pairing | Scope | Ratio | Floor | Verdict |`);
  console.log(`|---|---|---|---|---|`);
  for (const r of rows.filter((x) => !(x.scope === "light" && LIGHT_SURFACES.includes(x.bg)))) {
    console.log(
      `| \`${r.fg}\` on \`${r.bg}\` | ${r.scope} | ${r.ratio.toFixed(2)} | ${r.floor.toFixed(1)} | ${
        r.pass ? "Pass" : "**Fail**"
      } |`,
    );
  }
  console.log("");
}

main();
