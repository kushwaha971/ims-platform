import { buildPageRange } from './pageRange';

/**
 * Ported from BrandHub's `buildPageRange`. The cases below are the ones where a
 * pagination bar usually goes wrong: the boundary at which elision starts, and
 * the two ends where a naive implementation renders `1 … 2` or duplicates the
 * last page.
 */
describe('buildPageRange', () => {
  it('shows every page while there are seven or fewer', () => {
    // Eliding two of six is churn — the row is not long enough to be a problem.
    expect(buildPageRange(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(buildPageRange(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('elides only on the far side when the current page is near an end', () => {
    // The bug this prevents is `1 … 2 3 …` — an ellipsis standing in for
    // nothing, which reads as a missing page.
    expect(buildPageRange(1, 20)).toEqual([1, 2, null, 20]);
    expect(buildPageRange(20, 20)).toEqual([1, null, 19, 20]);
  });

  it('keeps one page either side of the current one', () => {
    expect(buildPageRange(10, 20)).toEqual([1, null, 9, 10, 11, null, 20]);
  });

  it('never elides a single page', () => {
    // At page 3 of 20 the left elision would hide page 2 alone, so it must not
    // appear: an ellipsis concealing one number costs a click and tells a lie.
    expect(buildPageRange(3, 20)).toEqual([1, 2, 3, 4, null, 20]);
    expect(buildPageRange(18, 20)).toEqual([1, null, 17, 18, 19, 20]);
  });

  it('survives nonsense rather than rendering a broken bar', () => {
    // `total: 0` happens on an empty list that still mounts the bar, and a
    // current page beyond the end happens when a filter shrinks the result set
    // while the merchant is on page 9.
    expect(buildPageRange(1, 0)).toEqual([1]);
    expect(buildPageRange(99, 3)).toEqual([1, 2, 3]);
    expect(buildPageRange(0, 5)).toEqual([1, 2, 3, 4, 5]);
  });
});
