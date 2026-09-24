import { useState } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
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
    ['0091 98765 43210', '9876543210', 'an international access prefix'],
    ['+91 098765 43210', '9876543210', 'E.164 with a stray trunk zero'],
    ['9123456789', '9123456789', 'a number that itself begins with 91'],
    ['+919123456789', '9123456789', 'E.164 of a number that begins with 91'],
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

  // H1 — the control reads back its own partial output while the merchant is
  // typing. `91` used to be stripped only past ten digits, so `+919` read as
  // `919` and the next keystroke compounded it ("9191919845").
  it.each([
    ['+919', '9'],
    ['+9198', '98'],
    ['+91984561', '984561'],
    ['+919191', '9191'],
    ['+91', ''],
  ])('strips the dial code from the partial E.164 %s → %s', (input, expected) => {
    expect(toNationalDigits(input)).toBe(expected);
  });

  it('round-trips every prefix of a number through E.164 unchanged', () => {
    const number = '9845612345';
    for (let i = 1; i <= number.length; i += 1) {
      const prefix = number.slice(0, i);
      expect(toNationalDigits(toE164(prefix))).toBe(prefix);
    }
  });
});

/** What a form does: holds the E.164 the control reports and hands it back. */
function Controlled({
  initial = '',
  onValue,
}: Readonly<{ initial?: string | null; onValue?: (value: string) => void }>) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <UbPhoneInput
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
      aria-label="Mobile"
    />
  );
}

describe('UbPhoneInput round trip (H1)', () => {
  // H1 — typing 9845612345 key by key displayed "9191919845": each emitted
  // `+919…` came back with `91` still attached. The old test typed only one key.
  it('types a full number key by key and shows exactly what was typed', async () => {
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(<Controlled onValue={onValue} />);
    const input = screen.getByLabelText('Mobile');

    await user.type(input, '9845612345');

    expect(input).toHaveValue('9845612345');
    expect(onValue).toHaveBeenLastCalledWith('+919845612345');
    // Every intermediate emission is the typed prefix, never a compounded one.
    expect(onValue.mock.calls.map(([v]) => v)).toEqual(
      Array.from({ length: 10 }, (_, i) => `+91${'9845612345'.slice(0, i + 1)}`)
    );
  });

  // H1 — a number that itself begins with 91 is the case a digit-count rule
  // gets wrong in the other direction.
  it('types a number that begins with 91 without eating the 91', async () => {
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(<Controlled onValue={onValue} />);
    const input = screen.getByLabelText('Mobile');

    await user.type(input, '9191919191');

    expect(input).toHaveValue('9191919191');
    expect(onValue).toHaveBeenLastCalledWith('+919191919191');
  });

  // H1 — `maxLength` used to cap the field; without it a stray eleventh key
  // must still not shift the number.
  it('refuses an eleventh digit once the number is full', async () => {
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(<Controlled initial="+919845612345" onValue={onValue} />);
    const input = screen.getByLabelText('Mobile');

    await user.type(input, '7');

    expect(input).toHaveValue('9845612345');
    expect(onValue).not.toHaveBeenCalled();
  });

  // H1 — a trunk zero typed first is dropped once the number is complete.
  it('drops a trunk zero typed in front of the number', async () => {
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(<Controlled onValue={onValue} />);
    const input = screen.getByLabelText('Mobile');

    await user.type(input, '09845678901');

    expect(input).toHaveValue('9845678901');
    expect(onValue).toHaveBeenLastCalledWith('+919845678901');
  });

  // H1 — the 10-character `maxLength` truncated a paste BEFORE it was cleaned:
  // "+91 98456 78901" became "+91 98456 " and then "919198456".
  it.each([
    ['+91 98456 78901'],
    ['+919845678901'],
    ['09845678901'],
    ['98456 78901'],
    ['919845678901'],
    ['0091 98456 78901'],
    ['098456-78901'],
  ])('pastes %s into an empty field as 9845678901', async (pasted) => {
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(<Controlled onValue={onValue} />);
    const input = screen.getByLabelText('Mobile');

    await user.click(input);
    await user.paste(pasted);

    expect(input).toHaveValue('9845678901');
    expect(onValue).toHaveBeenLastCalledWith('+919845678901');
  });

  // H1 — a whole number pasted over a half-typed one replaces it rather than
  // being spliced in at the caret.
  it('replaces a partial number when a whole number is pasted', async () => {
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(<Controlled initial="+9198" onValue={onValue} />);
    const input = screen.getByLabelText('Mobile');

    await user.click(input);
    await user.paste('+91 98456 78901');

    expect(input).toHaveValue('9845678901');
    expect(onValue).toHaveBeenLastCalledWith('+919845678901');
  });

  // H1 — autofill sets the whole value in one change event, which is the
  // path that never goes through a paste handler.
  it.each([['+91 98456 78901'], ['+919845678901'], ['09845678901'], ['98456 78901']])(
    'autofills %s as 9845678901',
    (filled) => {
      const onValue = jest.fn();
      render(<Controlled onValue={onValue} />);
      const input = screen.getByLabelText('Mobile');

      fireEvent.change(input, { target: { value: filled } });

      expect(input).toHaveValue('9845678901');
      expect(onValue).toHaveBeenLastCalledWith('+919845678901');
    }
  );

  it('clears to an empty string, never a bare +91', async () => {
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(<Controlled initial="+919845678901" onValue={onValue} />);
    const input = screen.getByLabelText('Mobile');

    await user.clear(input);

    expect(input).toHaveValue('');
    expect(onValue).toHaveBeenLastCalledWith('');
  });

  it('renders a null value as an empty field', () => {
    render(<Controlled initial={null} />);
    expect(screen.getByLabelText('Mobile')).toHaveValue('');
  });

  it('renders a legacy bare ten-digit value as those digits', () => {
    render(<Controlled initial="9845678901" />);
    expect(screen.getByLabelText('Mobile')).toHaveValue('9845678901');
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

  // H1 — a native maxLength truncates a paste or autofill before it can be
  // cleaned; the ten-digit cap lives in `toNationalDigits` instead.
  it('does not rely on a native maxLength', () => {
    render(<UbPhoneInput value="+919876543210" onChange={jest.fn()} aria-label="Mobile" />);
    expect(screen.getByLabelText('Mobile')).not.toHaveAttribute('maxLength');
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
