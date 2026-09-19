/**
 * @jest-environment node
 *
 * **The chart palette, recomputed from the tokens — never read off a comment.**
 *
 * `scripts/check-contrast.mjs` guards the SEMANTIC pairings. It does not know
 * about chart marks, so the chart layer carries its own check here, and it
 * carries it the same way: every number below is computed from
 * `src/styles/tokens/*.css` at run time, in BOTH themes, so editing the prose
 * in `chartPalette.ts` cannot make this pass.
 *
 * Four things are enforced:
 *
 *  1. **No chart series wears the reserved ledger red or green.** `--error` is
 *     "you gave" and `--success` is "you got" (§23.2.4); a bar painted in
 *     either would claim a meaning it does not have.
 *  2. **The aging ramp is a real ordinal ramp in each theme** — one hue,
 *     monotone lightness, adjacent ΔL >= 0.06, and a faint end that still
 *     clears its own surface. These are the data-viz skill's `--ordinal`
 *     checks, run here against the token values rather than against hexes
 *     pasted into a report.
 *  3. **Dark is SELECTED, not flipped.** The dark steps are different steps of
 *     the same ramp, and they are checked against the dark surface.
 *  4. **The emphasis pair separates** — accent against the de-emphasis grey,
 *     by contrast and by OKLab distance, in both themes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CHART_AGING_RAMP, CHART_RESERVED_SERIES_TOKENS } from './chartPalette';

const ROOT = process.cwd();
const TOKENS = join(ROOT, 'src/styles/tokens');

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

const primitives = parse('primitives.css');
const LIGHT = { ...primitives, ...parse('light.css') };
const DARK = { ...LIGHT, ...parse('dark.css', ':root[data-theme=') };

const resolve = (raw: Record<string, string>, name: string, depth = 0): Hsl => {
  if (depth > 8) throw new Error(`--${name} does not resolve`);
  const value = raw[name];
  if (value === undefined) throw new Error(`--${name} is not defined`);
  const alias = value.match(/^var\(--([\w-]+)\)$/);
  if (alias?.[1]) return resolve(raw, alias[1], depth + 1);
  const hsl = value.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!hsl) throw new Error(`--${name} is not an HSL triplet: ${value}`);
  return [Number(hsl[1]), Number(hsl[2]), Number(hsl[3])];
};

const toRgb = ([h, s, l]: Hsl): readonly [number, number, number] => {
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

const luminance = (rgb: readonly [number, number, number]): number => {
  const [r, g, b] = rgb.map((channel) => {
    const v = channel / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: Hsl, b: Hsl): number => {
  const la = luminance(toRgb(a));
  const lb = luminance(toRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

/** sRGB → OKLab (Björn Ottosson). The data-viz checks are stated in OKLab. */
const toOklab = (hsl: Hsl): { L: number; a: number; b: number } => {
  const [r8, g8, b8] = toRgb(hsl);
  const lin = (channel: number): number => {
    const v = channel / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const r = lin(r8);
  const g = lin(g8);
  const b = lin(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
};

const hueOf = (hsl: Hsl): number => {
  const { a, b } = toOklab(hsl);
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
};

/** Euclidean distance in OKLab ×100 — the ΔE this method is stated in. */
const deltaE = (x: Hsl, y: Hsl): number => {
  const p = toOklab(x);
  const q = toOklab(y);
  return Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b) * 100;
};

/** The data-viz `--ordinal` thresholds. */
const MIN_STEP_DELTA_L = 0.06;
const FAINT_END_FLOOR = 2.0;
const MARK_CONTRAST_FLOOR = 3.0;
const CVD_TARGET_DELTA_E = 8.0;

const RAMPS = [
  { theme: 'light', raw: LIGHT, tokens: CHART_AGING_RAMP.map((step) => step.lightToken) },
  { theme: 'dark', raw: DARK, tokens: CHART_AGING_RAMP.map((step) => step.darkToken) },
] as const;

describe('no chart series wears the reserved ledger red or green', () => {
  /** The files that decide what a SERIES is painted in. `UbStatCard` is not
   *  one of them: a tile is not a series, and an overdue figure in `--error`
   *  is the ledger semantic doing exactly its job. */
  const SERIES_SOURCES = [
    'chartPalette.ts',
    'ChartBarRow.tsx',
    'UbAgingBars/UbAgingBars.tsx',
    'UbRankedBars/UbRankedBars.tsx',
    'UbTrendArea/UbTrendArea.tsx',
  ];

  const stripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it.each(SERIES_SOURCES)('%s names no reserved family', (file) => {
    const code = stripComments(readFileSync(join(ROOT, 'src/design-system/charts', file), 'utf8'));
    // The declaration of the banned list itself is the one legal mention.
    const scanned = code.replace(/CHART_RESERVED_SERIES_TOKENS[\s\S]*?\];/, '');
    for (const token of CHART_RESERVED_SERIES_TOKENS) {
      expect(scanned).not.toMatch(new RegExp(`(fill|stroke|bg|text)-${token}\\b`));
      expect(scanned).not.toMatch(new RegExp(`--${token}\\b`));
    }
  });
});

describe.each(RAMPS)(
  'the aging ramp is a real ordinal ramp in $theme',
  ({ theme, raw, tokens }) => {
    const steps = tokens.map((token) => resolve(raw, token));
    const surface = resolve(raw, 'surface-card');
    const lightnesses = steps.map((step) => toOklab(step).L);

    it('has one step per bucket', () => {
      expect(steps).toHaveLength(4);
    });

    it('is monotone in lightness — the order is IN the colour', () => {
      const deltas = lightnesses.slice(1).map((value, index) => value - (lightnesses[index] ?? 0));
      const allDown = deltas.every((delta) => delta < 0);
      const allUp = deltas.every((delta) => delta > 0);
      expect(allDown || allUp).toBe(true);
    });

    it('darkens on the light surface and BRIGHTENS on the ink one', () => {
      const first = lightnesses[0] ?? 0;
      const last = lightnesses[lightnesses.length - 1] ?? 0;
      // Older money is louder in both themes; on an ink canvas louder is lighter.
      expect(theme === 'light' ? last < first : last > first).toBe(true);
    });

    it('steps far enough apart to be seen as steps', () => {
      lightnesses.slice(1).forEach((value, index) => {
        expect(Math.abs(value - (lightnesses[index] ?? 0))).toBeGreaterThanOrEqual(
          MIN_STEP_DELTA_L
        );
      });
    });

    it('is ONE hue — a ramp that changes hue is a rainbow', () => {
      const hues = steps.map(hueOf);
      expect(Math.max(...hues) - Math.min(...hues)).toBeLessThan(20);
    });

    it('keeps its faintest step visible against its OWN surface', () => {
      const faintest = steps.reduce((worst, step) =>
        contrast(step, surface) < contrast(worst, surface) ? step : worst
      );
      expect(contrast(faintest, surface)).toBeGreaterThanOrEqual(FAINT_END_FLOOR);
    });

    it('is a DIFFERENT set of steps from the other theme, not a flip', () => {
      expect(CHART_AGING_RAMP.map((step) => step.lightToken)).not.toEqual(
        CHART_AGING_RAMP.map((step) => step.darkToken)
      );
    });
  }
);

describe.each(RAMPS)('the emphasis pair separates in $theme', ({ raw }) => {
  const accent = resolve(raw, 'accent');
  const recessive = resolve(raw, 'viz-8');
  const surface = resolve(raw, 'surface-card');

  it('puts both marks above the 3:1 mark floor on the card', () => {
    expect(contrast(accent, surface)).toBeGreaterThanOrEqual(MARK_CONTRAST_FLOOR);
    expect(contrast(recessive, surface)).toBeGreaterThanOrEqual(MARK_CONTRAST_FLOOR);
  });

  it('separates the emphasised bar from the recessive ones', () => {
    expect(deltaE(accent, recessive)).toBeGreaterThanOrEqual(CVD_TARGET_DELTA_E);
  });

  it('is not the ledger red or green wearing another name', () => {
    for (const token of ['error', 'success']) {
      expect(deltaE(accent, resolve(raw, token))).toBeGreaterThan(CVD_TARGET_DELTA_E);
      expect(deltaE(recessive, resolve(raw, token))).toBeGreaterThan(CVD_TARGET_DELTA_E);
    }
  });
});
