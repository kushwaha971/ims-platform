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
describe('UbLogo — what it draws', () => {
  /**
   * CR-2026-09-29-BRAND-A — the mark is YourKhata's OPEN KHATA now, not
   * DigiKhaato's spine D. These two assertions changed with the artwork: two
   * pages and a tick are paths, the tile and two rules are rects. Everything
   * else in this file is unchanged, because none of it was ever about the
   * artwork.
   */
  it('draws the open khata: a tile, two pages, two rules and a tick', () => {
    const { container } = render(<UbLogo />);

    expect(container.querySelectorAll('svg rect')).toHaveLength(3);
    expect(container.querySelectorAll('svg path')).toHaveLength(3);
    expect(container.querySelector('svg')).toHaveAttribute('viewBox', '0 0 64 64');
  });

  it('paints every part from a --brand-* token and never from a hex (R-S-2)', () => {
    const { container } = render(<UbLogo />);
    const parts = [...container.querySelectorAll('svg rect, svg path')].map(
      (shape) => shape.getAttribute('class') ?? ''
    );

    expect(parts).toEqual([
      'fill-brand-mark',
      'fill-brand-page',
      'fill-brand-page',
      'fill-brand-ruleSoft',
      'fill-brand-ruleSoft',
      'fill-none stroke-brand-rule',
    ]);
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
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
    const word = screen.getByText('YourKhata');

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
    expect(screen.getByText('YourKhata').className).not.toContain('text-text-primary');
  });

  it('falls back to APP_NAME when no tenant name is supplied', () => {
    render(<UbLogo variant="full" />);
    expect(screen.getByText('YourKhata')).toBeInTheDocument();
  });
});
