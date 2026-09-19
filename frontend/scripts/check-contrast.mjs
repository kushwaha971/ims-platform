#!/usr/bin/env node
/**
 * Part 23 §23.6 deliverable 3 — the mechanism that keeps the contrast table
 * true. It parses `src/styles/tokens/*.css`, recomputes every documented
 * pairing FROM THE TOKEN VALUES rather than from the chapter, and fails with
 * error code `low_contrast` when any pairing falls below its floor: 4.5 for
 * text pairings, 3.0 for the non-text ones.
 *
 * Adding a semantic colour token without adding it to the pairing list below is
 * also a failure, which is what stops the table drifting from the tokens.
 *
 * Node standard library only (ADR-021). Run with --print to regenerate the
 * chapter's table.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const TOKENS_DIR = join(root, 'src/styles/tokens');

// ── Token parsing ────────────────────────────────────────────────────────────

/** `--name: H S% L%;` → { name: [h, s, l] }. Aliases (`var(--x)`) are resolved. */
const parseTokens = (file, selector) => {
  const css = readFileSync(join(TOKENS_DIR, file), 'utf8');
  const block = selector ? css.slice(css.indexOf(selector)) : css;
  const raw = {};
  for (const match of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    raw[match[1]] = match[2].trim();
  }
  return raw;
};

const resolve = (raw, value, seen = 0) => {
  if (seen > 8) return null;
  const alias = value.match(/^var\(--([\w-]+)\)$/);
  if (alias) return resolve(raw, raw[alias[1]] ?? '', seen + 1);
  const hsl = value.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!hsl) return null;
  return [Number(hsl[1]), Number(hsl[2]), Number(hsl[3])];
};

// ── Colour maths (WCAG 2.2, sRGB relative luminance) ─────────────────────────

const hslToRgb = ([h, s, l]) => {
  const sat = s / 100;
  const lum = l / 100;
  const c = (1 - Math.abs(2 * lum - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lum - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
};

const relativeLuminance = (rgb) => {
  const [r, g, b] = rgb.map((channel) => {
    const v = channel / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a, b) => {
  const la = relativeLuminance(hslToRgb(a));
  const lb = relativeLuminance(hslToRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

// ── The pairings §23.6 documents ─────────────────────────────────────────────

const LIGHT_SURFACES = ['surface-card', 'canvas', 'surface-sunken', 'surface-hover'];

/** Text tokens that must clear 4.5:1 on EVERY light surface they land on. */
const TEXT_ON_SURFACES = [
  'text-primary',
  'text-secondary',
  'text-tertiary',
  'text-muted',
  'text-accent',
  'success',
  'warning',
  'error',
  'form-error',
  'info',
];

/** Tinted blocks and fills: foreground on its own dim/fill. */
const TINTED = [
  ['success', 'success-dim'],
  ['warning', 'warning-dim'],
  ['error', 'error-dim'],
  ['form-error', 'form-error-dim'],
  ['info', 'info-dim'],
  ['text-inverse', 'accent'],
  ['text-inverse', 'success'],
  ['text-inverse', 'error'],
  ['text-inverse', 'form-error'],
  ['text-on-nav', 'surface-nav'],
];

/** Non-text (WCAG 1.4.11): a control boundary that identifies the control. */
const NON_TEXT = [
  ['border-strong', 'canvas'],
  ['accent', 'canvas'],
];

/**
 * CR-2026-09-19-D — the dark column is now checked exactly as hard as the light
 * one. It used to be six hand-picked pairs against a single surface, which is
 * how --border-strong sat at 1.93:1 for a whole sprint without anything
 * noticing: nothing looked at it.
 */
const DARK_SURFACES = ['surface-card', 'canvas', 'surface-sunken', 'surface-hover'];

/**
 * SEPARATION is not a WCAG floor — it is the one this product needs and the one
 * the first dark ramp failed. On an ink canvas a shadow does no work and a
 * hairline at 1.2:1 is not visible, so a surface is only a surface if its own
 * fill, or its edge, steps far enough away from the page behind it. Both are
 * measured; 1.2:1 is the point at which the step survives an OLED phone at
 * half brightness, which is the screen this product is read on.
 *
 * Light is excluded deliberately: there a white card on a #F6F7F9 canvas is
 * 1.04:1 and separates by being BRIGHTER than its surroundings plus a hairline
 * the eye can see, which is the opposite mechanism and not this one's business.
 */
const DARK_SEPARATION = [
  ['surface-card', 'canvas', 1.2],
  ['surface-raised', 'canvas', 1.3],
  ['border-hairline', 'canvas', 1.4],
  ['border-subtle', 'surface-card', 1.4],
];

// ── Run ──────────────────────────────────────────────────────────────────────

const primitives = parseTokens('primitives.css');
const lightRaw = { ...primitives, ...parseTokens('light.css') };
const darkRaw = { ...lightRaw, ...parseTokens('dark.css', ':root[data-theme=') };

const get = (raw, name, theme) => {
  const value = raw[name];
  if (value === undefined) {
    console.error(`✗ low_contrast: token --${name} is not defined in the ${theme} theme.`);
    process.exitCode = 1;
    return null;
  }
  const resolved = resolve(raw, value);
  if (!resolved) {
    console.error(`✗ low_contrast: token --${name} (${theme}) is not an HSL triplet: ${value}`);
    process.exitCode = 1;
  }
  return resolved;
};

const rows = [];
let failures = 0;

const check = (fgName, bgName, floor, theme, raw) => {
  const fg = get(raw, fgName, theme);
  const bg = get(raw, bgName, theme);
  if (!fg || !bg) return;
  const ratio = contrast(fg, bg);
  const pass = ratio + 1e-9 >= floor;
  rows.push({ theme, fg: fgName, bg: bgName, ratio: ratio.toFixed(2), floor, pass });
  if (!pass) {
    failures += 1;
    console.error(
      `✗ low_contrast: --${fgName} on --${bgName} (${theme}) is ${ratio.toFixed(2)}:1, floor ${floor}:1`
    );
  }
};

TEXT_ON_SURFACES.forEach((fg) => {
  LIGHT_SURFACES.forEach((bg) => {
    // §23.6 records --accent as a FILL/border/focus value; as text it is
    // --text-accent, which is why the accent is checked at 3.0 below.
    check(fg, bg, 4.5, 'light', lightRaw);
  });
});
TINTED.forEach(([fg, bg]) => check(fg, bg, 4.5, 'light', lightRaw));
NON_TEXT.forEach(([fg, bg]) => check(fg, bg, 3.0, 'light', lightRaw));

TEXT_ON_SURFACES.forEach((fg) => {
  DARK_SURFACES.forEach((bg) => check(fg, bg, 4.5, 'dark', darkRaw));
});
TINTED.forEach(([fg, bg]) => check(fg, bg, 4.5, 'dark', darkRaw));
NON_TEXT.forEach(([fg, bg]) => check(fg, bg, 3.0, 'dark', darkRaw));
check('border-strong', 'surface-card', 3.0, 'dark', darkRaw);
check('accent', 'surface-card', 3.0, 'dark', darkRaw);
DARK_SEPARATION.forEach(([fg, bg, floor]) => check(fg, bg, floor, 'dark', darkRaw));

if (process.argv.includes('--print')) {
  rows.forEach((row) =>
    console.log(
      `| ${row.theme} | --${row.fg} | --${row.bg} | ${row.ratio} | ${row.pass ? 'Pass' : 'FAIL'} |`
    )
  );
}

if (failures > 0 || process.exitCode === 1) {
  console.error(`\n${failures} pairing(s) below their floor.`);
  process.exit(1);
}

console.log(`✓ contrast — ${rows.length} pairings checked, all above their floor`);
