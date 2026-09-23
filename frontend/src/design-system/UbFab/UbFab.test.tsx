import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Plus } from 'lucide-react';

import { UbFab } from 'src/design-system/UbFab';
import { UB_BOTTOM_INSET_PROPERTY, __resetBottomInset } from 'src/hooks/useBottomInset';

/**
 * `UbFab` — the floating action button. What is asserted: that it has a name
 * (an icon-only control without one is a blank to a screen reader), that it
 * works from the keyboard, that it sits in the corner the safe area allows,
 * and that it is furniture the global toast knows to clear.
 */
const VIEWPORT = 800;

beforeEach(() => {
  Object.defineProperty(window, 'innerHeight', { value: VIEWPORT, writable: true });
  __resetBottomInset();
});

afterEach(() => {
  __resetBottomInset();
});

const renderFab = (props: Partial<React.ComponentProps<typeof UbFab>> = {}) => {
  const onClick = jest.fn();
  render(
    <UbFab
      label="Add party"
      icon={<Plus aria-hidden className="h-6 w-6" />}
      onClick={onClick}
      {...props}
    />
  );
  return { onClick, button: screen.getByRole('button', { name: 'Add party' }) };
};

describe('UbFab', () => {
  it('is a 56 px button named by its label, with the label visually hidden', () => {
    /* Prevents: an icon-only control announced as "button" and nothing else,
       and a FAB that grows a visible caption and stops being a FAB. */
    const { button } = renderFab();
    expect(button).toHaveClass('h-14', 'w-14', 'rounded-pill');
    expect(button).toHaveAttribute('type', 'button');
    expect(screen.getByText('Add party')).toHaveClass('sr-only');
  });

  it('acts on a click, on Enter and on Space', async () => {
    /* Prevents: a primary action reachable only by pointer. */
    const user = userEvent.setup();
    const { onClick, button } = renderFab();
    await user.click(button);
    button.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('sits fixed in the safe-area corner and leaves the rest of that corner tappable', () => {
    /* Prevents: a button under the iOS home indicator or a landscape notch,
       and an invisible wrapper swallowing taps on whatever is beside it. */
    const { button } = renderFab();
    const wrapper = button.parentElement as HTMLElement;
    expect(wrapper).toHaveAttribute('data-ub-fab');
    expect(wrapper).toHaveClass('fixed', 'pointer-events-none');
    expect(wrapper.className).toContain('bottom-[env(safe-area-inset-bottom,0px)]');
    expect(wrapper.className).toContain('right-[env(safe-area-inset-right,0px)]');
    expect(button).toHaveClass('pointer-events-auto');
  });

  it('publishes its whole footprint, gap included, so the toast rises above it', async () => {
    /* Prevents: CR-2026-09-19-G's defect on a new piece of furniture — the
       global snackbar anchored at the bottom and painted over the one button
       the screen exists for. The WRAPPER (button + 16 px gap) is measured, not
       the button, or the toast lands in the gap and on the button's shadow. */
    const { button } = renderFab();
    const wrapper = button.parentElement as HTMLElement;
    expect(wrapper).toHaveAttribute('data-ub-bottom-bar');

    wrapper.getBoundingClientRect = () =>
      ({
        top: VIEWPORT - 72,
        bottom: VIEWPORT,
        height: 72,
        left: 0,
        right: 0,
        width: 72,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    act(() => {
      fireEvent.scroll(document.body);
    });
    // Coalesced to one write per animation frame (see `useBottomInset`).
    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue(UB_BOTTOM_INSET_PROPERTY)).toBe('72px')
    );
  });

  it('can step aside where the page header has room for the real button', () => {
    /* Prevents: the same action twice on a laptop — once in the header, once
       floating in the corner. */
    const { button } = renderFab({ mobileOnly: true });
    expect(button.parentElement).toHaveClass('lg:hidden');
  });
});
