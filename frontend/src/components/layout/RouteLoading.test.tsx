import { render, screen } from '@testing-library/react';

import { DetailLoading, FormLoading, HomeLoading, ListLoading } from './RouteLoading';

/**
 * Revamp F1 — the route loading view is announced as loading, and it carries a
 * title placeholder. Without the title the view was the page's bare
 * `UbPageSkeleton`, flush against a 390 px phone's edges, and the real title
 * then pushed every row down when it landed (R-DEC-07 screenshots).
 */
describe('RouteLoading', () => {
  it.each([
    ['home', HomeLoading],
    ['list', ListLoading],
    ['detail', DetailLoading],
    ['form', FormLoading],
  ])('the %s view is busy and starts with a title placeholder', (_name, View) => {
    render(<View />);
    const busy = screen.getAllByRole('status');
    // The heading placeholder first, then the body in the screen's shape.
    expect(busy.length).toBeGreaterThanOrEqual(2);
    busy.forEach((node) => expect(node).toHaveAttribute('aria-busy', 'true'));
  });
});
