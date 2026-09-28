import { render } from '@testing-library/react';

import { UbSkeleton, type UbSkeletonVariant } from './UbSkeleton';

/**
 * QA defect D3 (Sprint 3): at 360 px the party list's totals cards are 158 px
 * wide, and the `card` skeleton drew a FIXED 160 px bar (`w-40`) inside one —
 * so while the list loaded, the page was wider than the phone and scrolled
 * sideways. jsdom has no layout, so this asserts the rule that makes the
 * overflow impossible rather than measuring it: every skeleton bar's width is
 * relative to its container (`w-full`, a fraction), or, where a fixed width is
 * the point (the avatar disc), it is capped with `max-w-full`. A fixed length
 * belongs in `max-w-*`, where it only ever makes a bar SHORTER.
 */
const VARIANTS: readonly UbSkeletonVariant[] = ['list', 'card', 'form', 'app', 'text'];

const FIXED_WIDTH = /^w-(\d+(\.\d+)?|px|\[[\d.]+(px|rem|em)\])$/;
const RELATIVE_WIDTH = /^w-(full|\d+\/\d+|\[\d+%\])$/;

const barsOf = (variant: UbSkeletonVariant): HTMLElement[] => {
  const { container } = render(<UbSkeleton variant={variant} count={2} />);
  return Array.from(container.querySelectorAll<HTMLElement>('.animate-pulse'));
};

describe('UbSkeleton — no bar can be wider than its container (D3)', () => {
  it.each(VARIANTS)('the %s variant sizes every bar relative to its container', (variant) => {
    const bars = barsOf(variant);
    expect(bars.length).toBeGreaterThan(0);

    for (const bar of bars) {
      const classes = Array.from(bar.classList);
      const fixed = classes.filter((c) => FIXED_WIDTH.test(c));
      const relative = classes.filter((c) => RELATIVE_WIDTH.test(c));
      const capped = classes.includes('max-w-full');
      // A fixed width is allowed only when the bar is also capped at 100%.
      expect({ bar: bar.className, ok: fixed.length === 0 || capped }).toEqual({
        bar: bar.className,
        ok: true,
      });
      // And every bar declares SOME width, or it collapses to nothing in a flex row.
      expect({ bar: bar.className, sized: relative.length + fixed.length > 0 }).toEqual({
        bar: bar.className,
        sized: true,
      });
    }
  });

  it('the card variant — the one in a 158 px totals tile — has no fixed width at all', () => {
    for (const bar of barsOf('card')) {
      expect(Array.from(bar.classList).filter((c) => FIXED_WIDTH.test(c))).toEqual([]);
      expect(Array.from(bar.classList).some((c) => RELATIVE_WIDTH.test(c))).toBe(true);
    }
  });
});

/**
 * UAT D-1 — the list variant's avatar "disc" drew SQUARE: `MLSkeleton`'s
 * default `rounded-sm` survived beside the caller's `rounded-pill` because
 * tailwind-merge did not know `pill` was a radius. Fixed in `src/utils/cn.ts`.
 */
describe('UbSkeleton — the avatar disc is round (D-1)', () => {
  it('carries rounded-pill and not the default rounded-sm', () => {
    const { container } = render(<UbSkeleton variant="list" count={1} />);
    const disc = container.querySelector<HTMLElement>('.animate-pulse.h-10.w-10');
    expect(disc).not.toBeNull();
    expect(disc).toHaveClass('rounded-pill');
    expect(disc).not.toHaveClass('rounded-sm');
  });
});
