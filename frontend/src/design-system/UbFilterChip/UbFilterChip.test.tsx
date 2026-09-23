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
  it('keeps the trailing control inside the track with the chips', () => {
    /**
     * It scrolls WITH the chips rather than floating right, because it is about
     * them — "Clear filters" across a gulf of empty row on a wide screen reads
     * as belonging to the page.
     */
    render(
      <UbFilterBar trailing={<button type="button">Clear filters (2)</button>}>
        <UbFilterChipGroup label="Balance">
          <UbFilterChip label="Owes me" pressed onToggle={jest.fn()} />
        </UbFilterChipGroup>
      </UbFilterBar>
    );

    expect(screen.getByRole('button', { name: 'Clear filters (2)' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Balance' })).toBeInTheDocument();
  });
});
