#!/usr/bin/env node
/**
 * Rewrite ml-uikit's baked-in colour literals to this product's tokens.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * `ml-uikit` ships compiled, with BrandHub's palette written into its class
 * strings as Tailwind arbitrary values — `text-[#26453f]`, `bg-white`,
 * `border-[#e6e6e6]`, `disabled:bg-[#f2f2f2]` and 34 more. `tailwind.config.js`
 * includes `vendor/ml-uikit/dist/**` in `content`, so all of them COMPILE, and
 * they win over the token classes the `Ub*` wrappers add — the wrappers only
 * override height, radius, background and text, never the menu internals.
 *
 * Two things shipped because of it: the tick beside a selected option rendered
 * BrandHub's brand green, and DARK THEME WAS UNREADABLE, because every menu kept
 * `text-[#111111]` and `border-[#e6e6e6]` on a dark surface.
 *
 * ── Why a codemod and not a CSS override ────────────────────────────────────
 * The first attempt was BrandHub's own approach: a remap block of
 * `.text-\[\#26453f\] { color: … !important }` rules (their §2.5). It works for
 * a plain utility and BREAKS ON STATE VARIANTS. `disabled:bg-[#f2f2f2]` and
 * `hover:bg-[#f1f1f1]` need the remap to apply only in that state, which means
 * writing out every variant of every literal by hand — 38 colours across
 * `hover`, `focus`, `focus-visible`, `disabled`, `aria-invalid` and four
 * `data-[state=…]` values. Miss one and it is invisible until someone disables
 * a field in dark mode.
 *
 * Rewriting the class NAME instead leaves the variant prefix untouched:
 * `disabled:bg-[#f2f2f2]` becomes `disabled:bg-surface-sunken`, still disabled-
 * only, and now a token that follows the theme. No `!important`, no specificity
 * contest, nothing to keep in step.
 *
 * ── Re-run this after every ml-uikit upgrade ────────────────────────────────
 *   node scripts/retone-ml-uikit.mjs
 *
 * `designSystemGuards.test.ts` asserts the bundle carries no colour literal at
 * all, so an upgrade that reintroduces one fails the suite rather than a
 * merchant's screen.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = new URL('../vendor/ml-uikit/dist', import.meta.url).pathname;

/**
 * Every literal the bundle uses, mapped to the token that carries the same
 * MEANING here — not the nearest hex. `#26453f` is BrandHub's brand colour, so
 * it becomes this product's accent; `#f1f1f1` is a hover wash, so it becomes
 * `surface-hover` even though `surface-sunken` is closer numerically.
 */
const COLOUR = {
  // Brand — BrandHub green becomes DigiKhaato indigo.
  '#26453f': 'accent',
  '#1f3631': 'accent-press',
  '#2bbd8f': 'accent',
  '#e5f1ee': 'accent-quiet',
  // Ink.
  '#111111': 'text-primary',
  '#1d1c20': 'text-primary',
  '#444444': 'text-secondary',
  '#4f4d55': 'text-secondary',
  '#666666': 'text-tertiary',
  '#6e6d71': 'text-tertiary',
  '#7f7d83': 'text-tertiary',
  '#999999': 'text-tertiary',
  '#a4a4a8': 'text-muted',
  '#adacb0': 'text-muted',
  '#b3b3b3': 'text-muted',
  '#9ca3af': 'text-muted',
  '#d3d3d6': 'text-muted',
  // Surfaces.
  '#fafafa': 'surface-sunken',
  '#f7f7f8': 'surface-sunken',
  '#f2f2f2': 'surface-sunken',
  '#f1f1f1': 'surface-hover',
  '#f5f5f5': 'surface-hover',
  // Lines.
  '#e6e6e6': 'border-subtle',
  '#e5e5e5': 'border-subtle',
  '#dcdcde': 'border-subtle',
  '#d8d8da': 'border-subtle',
  '#cccccc': 'border-subtle',
  '#bdbdbd': 'border-strong',
  '#b7b7b9': 'border-strong',
  // Semantic.
  '#ff3b30': 'formError',
  '#e73f3f': 'formError',
  '#cf2f2f': 'formError',
  '#fceaea': 'formError-dim',
  '#307f4a': 'success',
  '#e8f6ed': 'success-dim',
  '#e49614': 'warning',
  '#fff0d8': 'warning-dim',
  '#2563eb': 'info',
};

const PROPERTY = ['bg', 'text', 'border', 'ring', 'fill', 'stroke', 'from', 'to', 'via', 'shadow'];

/**
 * Tailwind's own absolute colours, which break dark theme exactly as badly as
 * the hex literals do — `bg-white` is 74 occurrences of "this surface is white
 * whatever the theme says".
 *
 * `bg-black` is DELIBERATELY absent. Its only use in the bundle is `bg-black/80`
 * on the dialog and drawer scrims, and a scrim is supposed to be black in both
 * themes — the thing behind it is the page, not a surface. Rewriting it would
 * turn the overlay into a card-coloured sheet. (This product's own overlay is
 * `bg-black/40`; the 80% one is ml-uikit's default and is overridden at the
 * component, not here.)
 */
const NAMED = {
  'bg-white': 'bg-surface-card',
  'text-white': 'text-text-inverse',
  'text-black': 'text-text-primary',
  'border-white': 'border-surface-card',
};

const files = (function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
})(DIST).filter((file) => /\.(js|cjs|mjs)$/.test(file));

let rewrites = 0;
const unmapped = new Set();

for (const file of files) {
  const before = readFileSync(file, 'utf8');
  let after = before;
  for (const [from, to] of Object.entries(NAMED)) {
    // The negative lookahead keeps `bg-white/50` and friends intact: an alpha
    // suffix means a deliberate wash, and `bg-surface-card/50` is not the same
    // thing at all.
    after = after.replace(new RegExp(`\\b${from}\\b(?![/-])`, 'g'), () => {
      rewrites += 1;
      return to;
    });
  }
  after = after.replace(
    new RegExp(`\\b(${PROPERTY.join('|')})-\\[(#[0-9a-fA-F]{6})\\]`, 'g'),
    (whole, property, hex) => {
      const token = COLOUR[hex.toLowerCase()];
      if (!token) {
        unmapped.add(hex.toLowerCase());
        return whole;
      }
      rewrites += 1;
      return `${property}-${token}`;
    }
  );
  if (after !== before) writeFileSync(file, after);
}

process.stdout.write(`retoned ${rewrites} class(es) across ${files.length} file(s)\n`);
if (unmapped.size > 0) {
  process.stdout.write(`UNMAPPED — add these to COLOUR: ${[...unmapped].sort().join(', ')}\n`);
  process.exit(1);
}
