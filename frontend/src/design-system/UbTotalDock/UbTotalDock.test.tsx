import { render, screen } from '@testing-library/react';

import { UbButton } from 'src/design-system/UbButton';
import { UbTotalDock } from 'src/design-system/UbTotalDock';

/**
 * `UbTotalDock` — a document's total and its finishing actions at the bottom
 * of a phone (audit A14: the total and Save sat at opposite ends of a 1,393 px
 * bill). Pinned: the total is shown with its label, the actions are reachable,
 * and it is bottom furniture the toast and the nav offset know about.
 */
describe('UbTotalDock', () => {
  it('shows the total with its label beside the finishing actions', () => {
    render(
      <UbTotalDock totalLabel="Grand total" total="₹1,042.00" data-testid="dock">
        <UbButton variant="secondary">Save draft</UbButton>
        <UbButton>Save bill</UbButton>
      </UbTotalDock>
    );
    const dock = screen.getByTestId('dock');
    expect(dock).toHaveTextContent('Grand total');
    expect(dock).toHaveTextContent('₹1,042.00');
    expect(screen.getByRole('button', { name: 'Save bill' })).toBeInTheDocument();
  });

  it('is sticky bottom furniture that rides above a phone nav', () => {
    /* Prevents: a dock the toast lands on, or one hidden under the nav bar. */
    render(
      <UbTotalDock totalLabel="Total" total="₹0.00" data-testid="dock">
        <UbButton>Save</UbButton>
      </UbTotalDock>
    );
    const dock = screen.getByTestId('dock');
    expect(dock).toHaveAttribute('data-ub-bottom-bar');
    expect(dock.className).toContain('bottom-[var(--ub-nav-offset)]');
  });
});
