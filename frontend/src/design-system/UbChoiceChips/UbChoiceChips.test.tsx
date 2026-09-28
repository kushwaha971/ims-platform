import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { UbChoiceChips } from './UbChoiceChips';

/**
 * A single choice that looks like chips. The defects these prevent are the
 * ones a chip row drifts into when it is built from toggles: two chips on at
 * once, a checked chip that un-checks on a second tap, and a group that takes
 * nine Tab presses to cross.
 */
const OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
] as const;

describe('UbChoiceChips', () => {
  it('is a radio group with exactly the chosen chip checked', () => {
    render(<UbChoiceChips value="upi" onChange={jest.fn()} options={OPTIONS} ariaLabel="Via" />);

    expect(screen.getByRole('radiogroup', { name: 'Via' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'UPI' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Cash' })).toHaveAttribute('aria-checked', 'false');
  });

  it('keeps a checked chip checked when it is tapped again', async () => {
    /** A period or a mode is never "none" once chosen; a toggle would be. */
    const onChange = jest.fn();
    render(<UbChoiceChips value="upi" onChange={onChange} options={OPTIONS} ariaLabel="Via" />);

    await userEvent.click(screen.getByRole('radio', { name: 'UPI' }));

    expect(onChange).toHaveBeenCalledWith('upi');
  });

  it('puts one chip in the tab order and moves with the arrow keys', async () => {
    const onChange = jest.fn();
    render(<UbChoiceChips value="cash" onChange={onChange} options={OPTIONS} ariaLabel="Via" />);

    expect(screen.getByRole('radio', { name: 'Cash' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: 'UPI' })).toHaveAttribute('tabindex', '-1');

    screen.getByRole('radio', { name: 'Cash' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('upi');

    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenLastCalledWith('card');
  });

  it('makes the first chip reachable when nothing is chosen yet', () => {
    render(<UbChoiceChips value="" onChange={jest.fn()} options={OPTIONS} ariaLabel="Via" />);

    expect(screen.getByRole('radio', { name: 'Cash' })).toHaveAttribute('tabindex', '0');
  });
});
