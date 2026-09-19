import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { toE164, toNationalDigits, UbPhoneInput } from './UbPhoneInput';

/**
 * PLT-01 FR-1 — the control's contract: the user types ten digits, the FORM
 * holds E.164. Every pasted spelling a merchant actually produces has to land
 * as the same ten digits, because the alternative is a validation error the
 * user cannot see the cause of.
 */
describe('toNationalDigits', () => {
  it.each([
    ['9876543210', '9876543210', 'ten bare digits'],
    ['+919876543210', '9876543210', 'E.164'],
    ['+91 98765 43210', '9876543210', 'E.164 with spaces'],
    ['919876543210', '9876543210', 'a country code with no plus'],
    ['09876543210', '9876543210', 'a trunk zero'],
    ['098765-43210', '9876543210', 'a trunk zero and a dash'],
    ['98765432101234', '9876543210', 'a double paste, truncated'],
    ['', '', 'an empty value'],
    ['abc', '', 'no digits at all'],
  ])('reads %s as %s (%s)', (input, expected) => {
    expect(toNationalDigits(input)).toBe(expected);
  });

  it('leaves a short number partial, so validation can speak', () => {
    expect(toNationalDigits('98765')).toBe('98765');
    expect(toE164('98765')).toBe('+9198765');
  });

  it('emits nothing rather than a bare +91 for an empty field', () => {
    expect(toE164('')).toBe('');
  });
});

describe('UbPhoneInput', () => {
  it('shows the national digits and reports E.164 to the caller', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<UbPhoneInput value="" onChange={onChange} aria-label="Mobile" />);

    await user.type(screen.getByLabelText('Mobile'), '9');

    expect(onChange).toHaveBeenLastCalledWith('+919');
  });

  it('renders an E.164 value as ten digits, without the prefix', () => {
    render(<UbPhoneInput value="+919876543210" onChange={jest.fn()} aria-label="Mobile" />);
    expect(screen.getByLabelText('Mobile')).toHaveValue('9876543210');
  });

  it('caps the field at ten digits', () => {
    render(<UbPhoneInput value="+919876543210" onChange={jest.fn()} aria-label="Mobile" />);
    expect(screen.getByLabelText('Mobile')).toHaveAttribute('maxLength', '10');
  });

  it('puts the numeric keypad up and offers the platform autofill', () => {
    render(<UbPhoneInput value="" onChange={jest.fn()} aria-label="Mobile" />);
    const input = screen.getByLabelText('Mobile');
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('autocomplete', 'tel-national');
  });

  it('marks itself invalid so the border can be --form-error', () => {
    render(<UbPhoneInput value="" onChange={jest.fn()} invalid aria-label="Mobile" />);
    expect(screen.getByLabelText('Mobile')).toHaveAttribute('aria-invalid', 'true');
  });
});
