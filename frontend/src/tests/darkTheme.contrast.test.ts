/**
 * @jest-environment node
 *
 * CR-2026-09-19-D — the dark re-tone, pinned.
 *
 * `scripts/check-contrast.mjs` already fails CI when a pairing drops below its
 * floor, and that script is the mechanism. This suite exists for the half a
 * floor cannot express: WHICH defects were fixed and by how much. A floor says
 * "at least 3.0"; it does not say that `--border-strong` used to be 1.93:1 and
 * that putting it back would be a regression of a specific, reported bug.
 *
 * Every number below is recomputed from `src/styles/tokens/*.css` at run time.
 * Nothing here reads a table, a comment or a chapter — editing the prose in
 * dark.css cannot make this pass, which is the entire point.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TOKENS = join(process.cwd(), 'src/styles/tokens');

type Hsl = readonly [number, number, number];

const parse = (file: string, selector?: string): Record<string, string> => {
  const css = readFileSync(join(TOKENS, file), 'utf8');
  const block = selector ? css.slice(css.indexOf(selector)) : css;
  const raw: Record<string, string> = {};
  for (const match of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name && value) raw[name] = value.trim();
  }
  return raw;
};

const resolve = (raw: Record<string, string>, name: string, depth = 0): Hsl => {
  if (depth > 8) throw new Error(`--${name} does not resolve to a colour`);
  const value = raw[name];
  if (value === undefined) throw new Error(`--${name} is not defined`);
  const alias = value.match(/^var\(--([\w-]+)\)$/);
  if (alias?.[1]) return resolve(raw, alias[1], depth + 1);
  const hsl = value.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!hsl) throw new Error(`--${name} is not an HSL triplet: ${value}`);
  return [Number(hsl[1]), Number(hsl[2]), Number(hsl[3])];
};

const toRgb = ([h, s, l]: Hsl): readonly number[] => {
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

const luminance = (rgb: readonly number[]): number => {
  const [r, g, b] = rgb.map((channel) => {
    const v = channel / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const primitives = parse('primitives.css');
const light = { ...primitives, ...parse('light.css') };
const dark = { ...light, ...parse('dark.css', ':root[data-theme=') };

const ratio = (raw: Record<string, string>, fg: string, bg: string): number => {
  const a = luminance(toRgb(resolve(raw, fg)));
  const b = luminance(toRgb(resolve(raw, bg)));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
};

/** The four surfaces a screen's text and controls actually land on. */
const SURFACES = ['canvas', 'surface-sunken', 'surface-card', 'surface-hover'] as const;

describe('the dark theme — the reported defect', () => {
  /**
   * The bug: a text input's boundary on the dark canvas measured 1.93:1, so the
   * control was a rectangle you had to already know was there. WCAG 1.4.11 puts
   * the floor for a boundary that identifies a control at 3:1.
   */
  it('gives --border-strong a boundary you can see on the canvas', () => {
    expect(ratio(dark, 'border-strong', 'canvas')).toBeGreaterThanOrEqual(3);
    // Comfortably, not marginally: 1.93 → 5.1.
    expect(ratio(dark, 'border-strong', 'canvas')).toBeGreaterThan(4.5);
  });

  it('keeps that boundary visible on every surface a control sits on', () => {
    for (const surface of SURFACES) {
      expect(ratio(dark, 'border-strong', surface)).toBeGreaterThanOrEqual(3);
    }
  });

  /**
   * The other half of the same report: "the card barely separates from the
   * canvas". It measured 1.12:1, and its hairline measured 1.27:1 — so the card
   * had neither a fill step nor an edge. A dark surface needs one of the two.
   */
  it('separates a card from the page behind it by its fill', () => {
    expect(ratio(dark, 'surface-card', 'canvas')).toBeGreaterThan(1.2);
  });

  it('separates it again by its edge, so the step survives a dim screen', () => {
    expect(ratio(dark, 'border-hairline', 'canvas')).toBeGreaterThan(1.4);
    expect(ratio(dark, 'border-subtle', 'surface-card')).toBeGreaterThan(1.4);
  });

  it('keeps the tiers in order — sunken below card below raised below hover', () => {
    const l = (name: string) => luminance(toRgb(resolve(dark, name)));
    expect(l('canvas')).toBeLessThan(l('surface-sunken'));
    expect(l('surface-sunken')).toBeLessThan(l('surface-card'));
    expect(l('surface-card')).toBeLessThan(l('surface-raised'));
    expect(l('surface-raised')).toBeLessThan(l('surface-hover'));
    expect(l('surface-hover')).toBeLessThan(l('surface-active'));
  });
});

describe('the dark theme — text clears 4.5:1 wherever it lands', () => {
  const TEXT = [
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
  ] as const;

  it.each(SURFACES)('on --%s', (surface) => {
    for (const token of TEXT) {
      expect({ token, ratio: ratio(dark, token, surface) }).toEqual({
        token,
        ratio: expect.any(Number),
      });
      expect(ratio(dark, token, surface)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('the brand mark is themed by tokens, not by a theme', () => {
  /**
   * §23.2.6 — the mark is identical in both themes on purpose. That is only
   * true while the dark column leaves --brand-* alone, which is a thing a later
   * "dark mode polish" would undo without noticing.
   */
  it('defines every --brand-* value once, in the light column', () => {
    const darkOnly = parse('dark.css', ':root[data-theme=');
    expect(Object.keys(darkOnly).filter((name) => name.startsWith('brand-'))).toEqual([]);
    for (const name of ['brand-mark', 'brand-page', 'brand-page-back', 'brand-rule']) {
      expect(() => resolve(light, name)).not.toThrow();
      expect(() => resolve(dark, name)).not.toThrow();
    }
  });

  it('keeps the mark legible against its own paper in both themes', () => {
    for (const raw of [light, dark]) {
      expect(ratio(raw, 'brand-page', 'brand-mark')).toBeGreaterThanOrEqual(3);
      expect(ratio(raw, 'brand-rule', 'brand-page')).toBeGreaterThanOrEqual(4.5);
    }
  });
});
