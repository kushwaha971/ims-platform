import { cn } from './cn';

/**
 * UAT D-1 — the skeleton avatar "disc" rendered SQUARE. `MLSkeleton` defaults
 * to `rounded-sm`, the caller passed `rounded-pill`, and stock tailwind-merge
 * did not know `pill` was a border-radius value, so it kept BOTH classes and
 * `rounded-sm` won on stylesheet order. Every custom radius in
 * `tailwind.config.js` (`theme.extend.borderRadius`) has to be one class group
 * with the stock sizes, or a caller's override is a coin toss.
 */
describe('cn — custom border radii are one class group (D-1)', () => {
  it('lets rounded-pill override rounded-sm', () => {
    expect(cn('rounded-sm', 'rounded-pill')).toBe('rounded-pill');
  });

  it('treats card and control as radii too', () => {
    expect(cn('rounded-sm', 'rounded-card')).toBe('rounded-card');
    expect(cn('rounded-pill', 'rounded-control')).toBe('rounded-control');
    expect(cn('rounded-card', 'rounded-xs')).toBe('rounded-xs');
  });

  it('keeps per-corner radii separate from the whole-box radius', () => {
    expect(cn('rounded-pill', 'rounded-t-card')).toBe('rounded-pill rounded-t-card');
  });

  it('still merges the stock sizes', () => {
    expect(cn('rounded-sm', 'rounded-lg')).toBe('rounded-lg');
  });
});
