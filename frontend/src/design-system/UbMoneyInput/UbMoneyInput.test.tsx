import { useState } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { groupIndian, padDecimals, sanitiseAmount, UbMoneyInput } from './UbMoneyInput';

/**
 * Controlled, because that is the only way the form ever uses it — React Hook
 * Form owns the value. A test that renders it with a fixed `value` is testing a
 * component nobody has.
 */
function Harness({ onValue }: { readonly onValue: (value: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <UbMoneyInput
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue(next);
      }}
      aria-label="Amount"
    />
  );
}

describe('the value never becomes a number', () => {
  it('groups the Indian way, which is 2,2,3 and not 3,3,3', () => {
    // ₹12,34,567.89 is what a merchant reads. ₹1,234,567.89 is what a library
    // that assumes en-US produces, and it is wrong in a way that makes a figure
    // harder to check against a paper book.
    expect(groupIndian('1234567.5', 2)).toBe('12,34,567.50');
    expect(groupIndian('999', 2)).toBe('999.00');
    expect(groupIndian('100000', 2)).toBe('1,00,000.00');
  });

  it('pads and truncates by string surgery rather than through a double', () => {
    expect(padDecimals('2300', 2)).toBe('2300.00');
    expect(padDecimals('2300.', 2)).toBe('2300.00');
    // Truncates rather than rounds: this runs while someone is still typing,
    // and rounding up a number they had not finished entering changes it.
    expect(padDecimals('2300.567', 2)).toBe('2300.56');
    // The case the one-liner gets wrong. A double cannot hold this exactly.
    expect(padDecimals('9007199254740993.75', 2)).toBe('9007199254740993.75');
  });

  it('refuses a minus sign outright rather than complaining about one', () => {
    // Direction is two buttons — "they owe me" and "I owe them" — because a
    // minus sign is a thing a shopkeeper has to decode.
    expect(sanitiseAmount('-500')).toBe('500');
    expect(sanitiseAmount('1a2b3')).toBe('123');
    expect(sanitiseAmount('1.2.3')).toBe('1.23');
  });
});

describe('what the merchant sees while typing', () => {
  it('shows what was typed while focused and groups it on the way out', async () => {
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(<Harness onValue={onValue} />);

    const field = screen.getByLabelText('Amount');
    await user.type(field, '1234567');
    // Formatting while someone types fights them: the caret jumps every time a
    // separator is inserted, and backspacing over a comma does nothing visible.
    expect(onValue).toHaveBeenLastCalledWith('1234567');
    expect(field).toHaveValue('1234567');

    await user.tab();
    expect(field).toHaveValue('12,34,567.00');
  });

  it('asks a phone for the decimal keypad without asking for spinners', () => {
    render(<UbMoneyInput value="" onChange={jest.fn()} aria-label="Amount" />);
    const field = screen.getByLabelText('Amount');
    // `type="number"` would give the right keypad and also scroll-wheel
    // increments and a browser-localised decimal separator.
    expect(field).toHaveAttribute('inputmode', 'decimal');
    expect(field).toHaveAttribute('type', 'text');
  });
});
