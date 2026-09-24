/**
 * WLB-01 FR-4 — the tenant's primary ramp, derived from one hex.
 *
 * Only `--primary-50…900` and the accent aliases that are NOT already
 * expressed through them are rewritten (Part 23 §23.2.4, WLB-01 BR-1):
 * surfaces, the semantic red/green of the ledger, and the fonts are never a
 * tenant's to change, which is what keeps "you will get" green whatever colour
 * the shop is.
 *
 * The tokens are HSL TRIPLETS (`241.26 63.56% 55.88%`), not hex, because every
 * consumer writes `hsl(var(--primary-500))` — see `src/styles/tokens/light.css`.
 *
 * `contrastRatio` is the WCAG 2.x formula and MUST match the server's
 * (`apps/platform_app/branding.py`); both test the same figure (#2B6BE0 on
 * white is 4.90:1), so the badge on the colour field can never say "AA" for a
 * colour the server then refuses.
 */

export interface HslTriplet {
  readonly h: number;
  readonly s: number;
  readonly l: number;
}

export type PrimaryStep = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

/** WLB-01 FR-4: "lightness steps 97/91/80/66/54/base/44/34/24/14 %". */
const LIGHTNESS: Readonly<Record<Exclude<PrimaryStep, 500>, number>> = {
  50: 97,
  100: 91,
  200: 80,
  300: 66,
  400: 54,
  600: 44,
  700: 34,
  800: 24,
  900: 14,
};

export const PRIMARY_STEPS: readonly PrimaryStep[] = [
  50, 100, 200, 300, 400, 500, 600, 700, 800, 900,
];

export const HEX_COLOUR = /^#[0-9A-Fa-f]{6}$/;

/** The minimum a brand colour must reach against white (WLB-01 FR-3). */
export const MIN_PRIMARY_CONTRAST = 3;

const channels = (hex: string): readonly [number, number, number] => {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
};

export const hexToHsl = (hex: string): HslTriplet => {
  const [r, g, b] = channels(hex).map((value) => value / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const delta = max - min;
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h: number;
  if (max === r) h = (g - b) / delta + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

export const tripletToCss = ({ h, s, l }: HslTriplet): string =>
  `${round2(h)} ${round2(s)}% ${round2(l)}%`;

/** `#4A47D6` → `{50: '241.26 63.56% 97%', …, 500: '241.26 63.56% 55.88%', …}`. */
export const hexToHslRamp = (hex: string): Readonly<Record<PrimaryStep, string>> => {
  const base = hexToHsl(hex);
  const ramp = {} as Record<PrimaryStep, string>;
  for (const step of PRIMARY_STEPS) {
    ramp[step] = step === 500 ? tripletToCss(base) : tripletToCss({ ...base, l: LIGHTNESS[step] });
  }
  return ramp;
};

const linear = (value: number): number => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export const relativeLuminance = (hex: string): number => {
  const [r, g, b] = channels(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

export const contrastRatio = (a: string, b: string): number => {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

/** `rgba(r, g, b, alpha)` for the two accent aliases the tokens write as rgba. */
export const hexToRgba = (hex: string, alpha: number): string => {
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** The CSS custom properties a brand colour sets on `<html>`. */
export const brandCssVariables = (hex: string): Readonly<Record<string, string>> => {
  const ramp = hexToHslRamp(hex);
  const vars: Record<string, string> = {};
  for (const step of PRIMARY_STEPS) vars[`--primary-${step}`] = ramp[step];
  vars['--accent-quiet'] = hexToRgba(hex, 0.1);
  vars['--accent-line'] = hexToRgba(hex, 0.35);
  return vars;
};

/** Every property `brandCssVariables` may set — what "back to the default" removes. */
export const BRAND_CSS_PROPERTIES: readonly string[] = [
  ...PRIMARY_STEPS.map((step) => `--primary-${step}`),
  '--accent-quiet',
  '--accent-line',
];

/** The `localStorage` key the pre-paint script reads (WLB-01 FR-4, EC-6). */
export const THEME_CACHE_KEY = 'ub_theme_cache';
