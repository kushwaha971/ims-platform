import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';

import { UbLogo } from './UbLogo';

/**
 * CR-2026-09-19-D — `UbLogo`'s contract.
 *
 * Two of these are about accessibility rather than appearance, and they are the
 * reason the component exists rather than five copies of an `<svg>` block: a
 * mark is either the thing that names its link or it is decoration beside text
 * that already names it, and getting that wrong produces either an unlabelled
 * link or the product's name read out twice on every screen.
 *
 * The third is the white-label contract of §19.8.3: the mark is painted from
 * `--brand-*`, which is derived from `--primary-*`, so a tenant ramp repaints it
 * for free. A hard-coded hex in the SVG would silently opt the logo out of the
 * only theming this product sells.
 */
/** Every class a part of the mark may be painted with. */
const MARK_CLASSES = [
  'fill-brand-cover',
  'fill-none stroke-brand-hem',
  'fill-brand-figure',
  'fill-none stroke-brand-figure',
  'fill-brand-knot',
];

const partsOf = (container: HTMLElement) =>
  [...container.querySelectorAll('svg rect, svg path, svg circle')].map(
    (shape) => shape.getAttribute('class') ?? ''
  );

describe('UbLogo — what it draws', () => {
  /**
   * CR-2026-09-29-BRAND-C — the mark is K-c "Bandhan", the tied bahi cover:
   * a cover with a stitched hem, a white K whose leg sweeps on as the tie
   * band, and a red knot with two string ends. These assertions changed with
   * the artwork; everything else in this file was never about the artwork.
   */
  it('draws the tied bahi cover: cover, hem, K and band, strings, ring and knot', () => {
    const { container } = render(<UbLogo />);

    expect(partsOf(container)).toEqual([
      'fill-brand-cover',
      'fill-none stroke-brand-hem',
      'fill-brand-figure',
      'fill-none stroke-brand-figure',
      'fill-brand-cover',
      'fill-brand-knot',
    ]);
    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 64 64');
  });

  it('simplifies at 24 px and below: no hem, and the knot is a single dot', () => {
    const { container } = render(<UbLogo size="sm" />);

    expect(partsOf(container)).toEqual([
      'fill-brand-cover',
      'fill-brand-figure',
      'fill-brand-knot',
    ]);
    expect(container.querySelectorAll('svg circle')).toHaveLength(1);
  });

  it('has no clipPath and no id, so two logos on one page cannot collide', () => {
    const { container } = render(
      <>
        <UbLogo />
        <UbLogo variant="full" size="sm" />
      </>
    );
    expect(container.querySelector('clipPath, defs, [id]')).toBeNull();
  });

  it('paints every part from a --brand-* token and never from a hex (R-S-2)', () => {
    for (const size of ['sm', 'md', 'fill'] as const) {
      const { container, unmount } = render(<UbLogo size={size} variant="full" />);
      for (const part of partsOf(container)) {
        expect([...MARK_CLASSES, 'fill-current']).toContain(part);
      }
      expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
      expect(container.innerHTML).not.toMatch(/\b(fill|stroke)="(?!none)/);
      unmount();
    }
  });

  /**
   * The white-label contract, from the source side. A hex typed into the
   * component opts the mark out of the tenant's ramp, and the tokens can
   * drift the same way. The ONE fixed colour allowed is the bahi-red knot
   * (--brand-knot) and the white of the K (--brand-figure); every other
   * --brand-* value must be an alias of the primary ramp.
   */
  it('allows exactly one raw colour, the knot token, outside the primary ramp', () => {
    const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

    const source = read('src/design-system/UbLogo/UbLogo.tsx');
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);

    const light = read('src/styles/tokens/light.css');
    const brand: Record<string, string> = Object.fromEntries(
      [...light.matchAll(/--(brand-[\w-]+):\s*([^;]+);/g)].map((m) => [
        m[1] ?? '',
        m[2]?.trim() ?? '',
      ])
    );
    const raw = Object.entries(brand)
      .filter(([, value]) => !/^var\(--primary-\d+\)$/.test(value))
      .map(([name]) => name);

    expect(raw.sort()).toEqual(['brand-figure', 'brand-knot']);
    expect(brand['brand-figure']).toBe('0 0% 100%');

    // The dark column may restate the knot and nothing else of the mark's.
    const dark = read('src/styles/tokens/dark.css');
    expect([...dark.matchAll(/--(brand-[\w-]+):/g)].map((m) => m[1])).toEqual(['brand-knot']);
  });

  it('scales through the four documented tiers rather than an arbitrary height', () => {
    const cases = [
      ['sm', 'h-6'],
      ['md', 'h-8'],
      ['lg', 'h-10'],
      ['xl', 'h-12'],
    ] as const;

    for (const [size, expected] of cases) {
      const { container, unmount } = render(<UbLogo size={size} />);
      expect(container.querySelector('svg')?.getAttribute('class')).toContain(expected);
      unmount();
    }
  });
});

describe('UbLogo — the signature wordmark', () => {
  it('draws the product name with the indigo K whose sweep ends in the knot', () => {
    const { container } = render(<UbLogo variant="full" wordmark="YourKhata" />);
    const drawn = container.querySelector('[aria-hidden="true"] svg.text-text-accent');

    expect(drawn).not.toBeNull();
    expect(drawn?.querySelector('circle.fill-brand-knot')).not.toBeNull();
    // Read once, as one word — the drawn copy is hidden.
    expect(screen.getByText('YourKhata')).toHaveClass('sr-only');
  });

  it('never gives a tenant name the signature K', () => {
    const { container } = render(<UbLogo variant="full" wordmark="Bharat Khata" />);
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(container.querySelector('.fill-brand-knot')?.closest('svg')).toBe(
      container.querySelector('svg')
    );
  });
});

describe('UbLogo — how it is announced', () => {
  it('is decorative by default: a graphic with no name is hidden, not unlabelled', () => {
    const { container } = render(<UbLogo />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('becomes a named image when it is the only thing identifying its place', () => {
    render(<UbLogo label="YourKhata" />);
    const image = screen.getByRole('img', { name: 'YourKhata' });
    expect(image.tagName.toLowerCase()).toBe('svg');
  });

  it('leaves the wordmark readable as text, and hides only the graphic beside it', () => {
    const { container } = render(<UbLogo variant="full" wordmark="YourKhata" />);

    expect(screen.getByText('YourKhata')).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    // Not `role="img"`: an unnamed lockup whose name is already on the screen
    // as text would otherwise be announced twice.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('announces the lockup once — as one image — when it is given a name', () => {
    render(<UbLogo variant="full" wordmark="YourKhata" label="YourKhata home" />);
    expect(screen.getByRole('img', { name: 'YourKhata home' })).toBeInTheDocument();
  });

  it('sets the wordmark in its own tier, not in a heading tier', () => {
    render(<UbLogo variant="full" wordmark="YourKhata" size="lg" />);
    // The name is one sr-only text node inside the tier (the signature K is drawn beside it).
    const word = screen.getByText('YourKhata').parentElement as HTMLElement;

    expect(word.className).toContain('ds-wordmark-lg');
    expect(word.className).not.toMatch(/\bds-h[1-4]\b/);
    // A wordmark is not a heading in the outline either.
    expect(word.tagName.toLowerCase()).toBe('span');
  });
});

describe('UbLogo — the white-label contract (§19.8.3)', () => {
  it('takes the name from its caller, so a tenant renames the product', () => {
    render(<UbLogo variant="full" wordmark="Bharat Khata" />);
    expect(screen.getByText('Bharat Khata')).toBeInTheDocument();
  });

  it('lets the dark navigation rail keep its own text colour', () => {
    // The rail is dark in BOTH themes, so its wordmark must NOT follow
    // --text-primary — which is near-black in the light theme.
    render(<UbLogo variant="full" wordmark="YourKhata" tone="inherit" />);
    expect(screen.getByText('YourKhata').parentElement?.className).not.toContain(
      'text-text-primary'
    );
  });

  it('falls back to APP_NAME when no tenant name is supplied', () => {
    render(<UbLogo variant="full" />);
    expect(screen.getByText('YourKhata')).toBeInTheDocument();
  });
});
