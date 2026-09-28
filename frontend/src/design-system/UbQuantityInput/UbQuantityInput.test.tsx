import { useState } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { sanitiseQuantity, UbQuantityInput } from './UbQuantityInput';

/**
 * §17.6.0 quantity rules. A whole-number unit refuses the decimal point AT THE
 * KEYBOARD, so "1.5 pieces" is never typed and then refused by the server's
 * `qty_must_be_whole` after the merchant has moved on.
 */
describe('sanitiseQuantity', () => {
  it('keeps at most three decimals for a decimal unit', () => {
    expect(sanitiseQuantity('1.23456', 3, false)).toBe('1.234');
    expect(sanitiseQuantity('1.2.3', 3, false)).toBe('1.23');
  });

  it('drops the point entirely for a whole-number unit', () => {
    expect(sanitiseQuantity('1.5', 0, false)).toBe('15');
  });

  it('admits one leading minus only when signed (the adjustment "Adjust by")', () => {
    expect(sanitiseQuantity('-3', 0, true)).toBe('-3');
    expect(sanitiseQuantity('-3', 0, false)).toBe('3');
    expect(sanitiseQuantity('3-', 0, true)).toBe('3');
  });
});

function Harness({ decimals }: Readonly<{ decimals: number }>) {
  const [value, setValue] = useState('');
  return (
    <UbQuantityInput
      aria-label="Qty"
      value={value}
      onChange={setValue}
      decimals={decimals}
      unit="NOS"
    />
  );
}

describe('UbQuantityInput', () => {
  it('keeps the typed value a string and shows the unit beside it', async () => {
    const user = userEvent.setup();
    render(<Harness decimals={0} />);
    await user.type(screen.getByLabelText('Qty'), '12.5');
    expect(screen.getByLabelText('Qty')).toHaveValue('125');
    expect(screen.getByText('NOS')).toBeInTheDocument();
  });
});
