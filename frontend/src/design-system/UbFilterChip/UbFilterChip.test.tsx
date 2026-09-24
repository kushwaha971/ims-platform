import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UbFilterBar } from './UbFilterBar';
import { UbFilterChip } from './UbFilterChip';
import { UbFilterChipGroup } from './UbFilterChipGroup';

/**
 * The chip is a TOGGLE, and almost everything worth testing here follows from
 * that one claim: it has a state, it announces the state, and it reports the
 * state it is moving to rather than the one it is in.
 */
describe('UbFilterChip', () => {
  it('announces whether it is applied', () => {
    /**
     * Without `aria-pressed` a chip is a button that changes the list and says
     * nothing about having done so — indistinguishable, to a screen reader,
     * from a button that performs a one-off action. The tint alone cannot
     * carry it (R-A-2).
     */
    render(
      <>
        <UbFilterChip label="Owes me" pressed onToggle={jest.fn()} />
        <UbFilterChip label="Settled" pressed={false} onToggle={jest.fn()} />
      </>
    );

    expect(screen.getByRole('button', { name: 'Owes me', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settled', pressed: false })).toBeInTheDocument();
  });

  it('reports the state it is moving TO, not the one it is in', async () => {
    /**
     * The reason `onToggle` takes a boolean at all. Every caller was otherwise
     * recomputing `!pressed` from the same `pressed` it had just passed in, and
     * a chip group that applies when it means to clear is invisible in review
     * and obvious the first time a merchant taps it.
     */
    const onToggle = jest.fn();
    const user = userEvent.setup();

    const { rerender } = render(
      <UbFilterChip label="Overdue" pressed={false} onToggle={onToggle} />
    );
    await user.click(screen.getByRole('button', { name: 'Overdue' }));
    expect(onToggle).toHaveBeenLastCalledWith(true);

    rerender(<UbFilterChip label="Overdue" pressed onToggle={onToggle} />);
    await user.click(screen.getByRole('button', { name: 'Overdue' }));
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });

  it('does not fire while disabled', async () => {
    const onToggle = jest.fn();
    const user = userEvent.setup();
    render(<UbFilterChip label="Suppliers" pressed={false} disabled onToggle={onToggle} />);

    await user.click(screen.getByRole('button', { name: 'Suppliers' }));

    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe('UbFilterChipGroup', () => {
  it('gives a row of chips a name to be answers to', () => {
    /**
     * Read aloud, an unnamed row is seven toggles with nothing saying which of
     * them are alternatives to each other. The name is not shown on screen —
     * three visible headings cost more of a 360px row than the chips do — so
     * this assertion is the only place it is checked at all.
     */
    render(
      <UbFilterChipGroup label="Balance">
        <UbFilterChip label="Owes me" pressed={false} onToggle={jest.fn()} />
      </UbFilterChipGroup>
    );

    const group = screen.getByRole('group', { name: 'Balance' });
    expect(within(group).getByRole('button', { name: 'Owes me' })).toBeInTheDocument();
  });
});

describe('UbFilterBar', () => {
  it('pins the trailing control beside the scrolling chips, not inside them (D-L7)', () => {
    /**
     * Prevents D-L7: "Clear filters (n)" scrolled WITH the chips, so at 360 px
     * it was the one thing past the right edge of the track — the control that
     * exists because applied chips can be scrolled out of sight was itself out
     * of sight. jsdom lays nothing out, so what is pinned is the structure: the
     * chips live in the scroll container and the trailing control does not,
     * and the two share a row so it still follows the last chip on a laptop.
     */
    render(
      <UbFilterBar trailing={<button type="button">Clear filters (2)</button>}>
        <UbFilterChipGroup label="Balance">
          <UbFilterChip label="Owes me" pressed onToggle={jest.fn()} />
        </UbFilterChipGroup>
      </UbFilterBar>
    );

    const clear = screen.getByRole('button', { name: 'Clear filters (2)' });
    const group = screen.getByRole('group', { name: 'Balance' });
    const scroller = group.closest('.overflow-x-auto') as HTMLElement;
    expect(scroller).not.toBeNull();
    expect(scroller).not.toContainElement(clear);
    expect(clear.closest('.overflow-x-auto')).toBeNull();
    expect(scroller.parentElement).toContainElement(clear);
    expect(scroller).toHaveClass('min-w-0');
  });
});
