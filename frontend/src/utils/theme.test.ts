import {
  brandCssVariables,
  contrastRatio,
  hexToHsl,
  hexToHslRamp,
  MIN_PRIMARY_CONTRAST,
} from './theme';

/**
 * WLB-01 T-WLB-01-1 — the ramp and the contrast formula the colour field and
 * the theme both depend on.
 */
describe('theme utilities', () => {
  it('computes the same WCAG ratio as the server for the FRD reference colour', () => {
    // apps/platform_app/tests/test_branding.py pins 4.90 for the same pair. If
    // the two formulas drift, the badge says "AA" for a colour the server
    // refuses, and the merchant is told two different things about one colour.
    expect(contrastRatio('#2B6BE0', '#FFFFFF')).toBeCloseTo(4.9, 1);
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFEE00', '#FFFFFF')).toBeLessThan(MIN_PRIMARY_CONTRAST);
  });

  it('keeps the base colour at 500 and walks lightness for the other steps', () => {
    // FR-4: saturation and hue preserved, lightness 97…14. A ramp that shifted
    // the hue would repaint a teal shop's buttons in a slightly different teal
    // from its logo.
    const ramp = hexToHslRamp('#0F766E');
    const base = hexToHsl('#0F766E');
    expect(ramp[500]).toBe(
      `${Math.round(base.h * 100) / 100} ${Math.round(base.s * 100) / 100}% ${Math.round(base.l * 100) / 100}%`
    );
    expect(ramp[50].endsWith(' 97%')).toBe(true);
    expect(ramp[900].endsWith(' 14%')).toBe(true);
    expect(new Set(Object.values(ramp).map((v) => v.split(' ')[0])).size).toBe(1);
  });

  it('writes HSL triplets, which is the form every token consumer reads', () => {
    // `hsl(var(--primary-500))` in the tokens; a hex here would render nothing.
    const vars = brandCssVariables('#4A47D6');
    expect(vars['--primary-500']).toMatch(/^[\d.]+ [\d.]+% [\d.]+%$/);
    expect(vars['--accent-quiet']).toBe('rgba(74, 71, 214, 0.1)');
  });
});
