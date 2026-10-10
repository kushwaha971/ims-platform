import { useState } from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { preloadCountryPicker, toE164, toNationalDigits, UbPhoneInput } from './UbPhoneInput';

// The country list is fetched after first paint (see `pickerModule`); these
// tests are about the list, so it is in place before the first render.
beforeAll(async () => {
  await preloadCountryPicker();
});

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

  // Defect (QA, Medium) — typed key by key, these ended as 9198456789: the
  // first ten digits were kept and the eleventh refused before the `91` could
  // be read as the dial code. The `+` and spaces are dropped as typed, and on
  // the eleventh digit `91…` is re-read as +91.
  it.each([['+919845678901'], ['919845678901'], ['+91 98456 78901']])(
    'types %s key by key as 9845678901',
    async (typed) => {
      const user = userEvent.setup();
      const onValue = jest.fn();
      render(<Controlled onValue={onValue} />);
      const input = screen.getByLabelText('Mobile');

      await user.type(input, typed);

      expect(input).toHaveValue('9845678901');
      expect(onValue).toHaveBeenLastCalledWith('+919845678901');
    }
  );

  // Same defect — the ten digits before the re-read ARE a valid national
  // number, and are shown as one until the eleventh arrives.
  it('shows 9198456789 as a national number until an eleventh digit re-reads it', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByLabelText('Mobile');

    await user.type(input, '9198456789');
    expect(input).toHaveValue('9198456789');

    await user.type(input, '0');
    expect(input).toHaveValue('984567890');
  });

  // Same defect — the re-read must not turn a stray eleventh key on a full
  // number that begins with 91 into a shifted number: `91` followed by a
  // digit no mobile starts with is not a dial code, so the key is refused.
  it('still refuses an eleventh digit on a full number beginning 91 that is not +91', async () => {
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(<Controlled initial="+919123456789" onValue={onValue} />);
    const input = screen.getByLabelText('Mobile');

    await user.type(input, '7');

    expect(input).toHaveValue('9123456789');
    expect(onValue).not.toHaveBeenCalled();
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

/**
 * Owner, 9 Oct 2026 — "keep that default of India but also allow to select
 * other countries", then "use that ml uikit existing component, and check the
 * drop down selection and search work properly". India stays the default and
 * keeps every rule above; the code is `UbCombobox` (MLPopover + MLCommand), so
 * these open it, SEARCH it by name and by code, and pick from it.
 */
describe('UbPhoneInput country picker', () => {
  const trigger = () => screen.getByRole('combobox', { name: 'Country code' });

  /** Open the list, type into its search box, pick the row that matches. */
  const pick = async (user: ReturnType<typeof userEvent.setup>, query: string, row: string) => {
    await user.click(trigger());
    await user.type(await screen.findByPlaceholderText('Search country or code'), query);
    await user.click(await screen.findByRole('option', { name: new RegExp(row) }));
  };

  it('starts on India for an empty field', () => {
    render(<Controlled />);
    expect(trigger()).toHaveTextContent('+91');
  });

  it('lists India first and every other country after it, by name', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(trigger());
    const options = await screen.findAllByRole('option');
    expect(options[0]).toHaveTextContent('India (+91)');
    expect(options.length).toBeGreaterThan(200);
    expect(options.some((o) => o.textContent === 'United Kingdom (+44)')).toBe(true);
  });

  it('finds a country by name in the search box', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(trigger());
    await user.type(await screen.findByPlaceholderText('Search country or code'), 'united kin');
    const options = await screen.findAllByRole('option');
    expect(options[0]).toHaveTextContent('United Kingdom (+44)');
  });

  it('finds a country by its code in the search box', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(trigger());
    await user.type(await screen.findByPlaceholderText('Search country or code'), '+971');
    const options = await screen.findAllByRole('option');
    expect(options[0]).toHaveTextContent('United Arab Emirates (+971)');
  });

  // The search used to survive a close: after picking by "971" the list
  // reopened still filtered, so the next search was "971india".
  it('opens with an empty search every time', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await pick(user, '971', 'United Arab Emirates');
    await user.click(trigger());
    expect(await screen.findByPlaceholderText('Search country or code')).toHaveValue('');
  });

  it('says so when nothing matches', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(trigger());
    await user.type(await screen.findByPlaceholderText('Search country or code'), 'qxqxqx');
    expect(await screen.findByText('No country matches')).toBeInTheDocument();
  });

  it('types a UK number after picking the UK, and reports E.164', async () => {
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(<Controlled onValue={onValue} />);

    await pick(user, 'united kingdom', 'United Kingdom');
    expect(trigger()).toHaveTextContent('+44');
    // Picking a code hands the keypad back to the number.
    await waitFor(() => expect(screen.getByLabelText('Mobile')).toHaveFocus());
    await user.type(screen.getByLabelText('Mobile'), '07911123456');

    // The trunk 0 a UK number is written with is not part of E.164.
    expect(screen.getByLabelText('Mobile')).toHaveValue('7911123456');
    expect(onValue).toHaveBeenLastCalledWith('+447911123456');
  });

  it('moves the digits already typed to the new code, and back', async () => {
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(<Controlled initial="+919845612345" onValue={onValue} />);

    await pick(user, '971', 'United Arab Emirates');
    expect(onValue).toHaveBeenLastCalledWith('+9719845612345');

    await pick(user, 'india', '^India \\(\\+91\\)$');
    expect(onValue).toHaveBeenLastCalledWith('+919845612345');
    expect(screen.getByLabelText('Mobile')).toHaveValue('9845612345');
  });

  it('shows a loaded foreign number on its own country', () => {
    render(<Controlled initial="+14165550100" />);
    expect(trigger()).toHaveTextContent('+1');
    expect(screen.getByLabelText('Mobile')).toHaveValue('4165550100');
  });

  it('keeps Canada for a +1 number once Canada is picked', async () => {
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(<Controlled onValue={onValue} />);
    await pick(user, 'canada', 'Canada');
    await user.type(screen.getByLabelText('Mobile'), '4165550100');
    expect(onValue).toHaveBeenLastCalledWith('+14165550100');
    // The list marks Canada, not the United States, as the chosen row.
    await user.click(trigger());
    await user.type(await screen.findByPlaceholderText('Search country or code'), '+1');
    const canada = await screen.findByRole('option', { name: /Canada/ });
    expect(canada.querySelector('svg')).toHaveClass('opacity-100');
  });

  it.each([
    ['+44 7911 123456', '+44', '7911123456', '+447911123456'],
    ['0044 7911 123456', '+44', '7911123456', '+447911123456'],
    ['+971 50 123 4567', '+971', '501234567', '+971501234567'],
  ])(
    'switches by itself when %s is pasted into an Indian field',
    async (pasted, code, shown, e164) => {
      const user = userEvent.setup();
      const onValue = jest.fn();
      render(<Controlled onValue={onValue} />);

      await user.click(screen.getByLabelText('Mobile'));
      await user.paste(pasted);

      expect(trigger()).toHaveTextContent(code);
      expect(screen.getByLabelText('Mobile')).toHaveValue(shown);
      expect(onValue).toHaveBeenLastCalledWith(e164);
    }
  );

  it('switches back to India when an Indian number is pasted into a UK field', async () => {
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(<Controlled initial="+447911123456" onValue={onValue} />);

    await user.clear(screen.getByLabelText('Mobile'));
    await user.paste('+91 98456 78901');

    expect(trigger()).toHaveTextContent('+91');
    expect(onValue).toHaveBeenLastCalledWith('+919845678901');
  });

  it('follows an autofilled international number', () => {
    const onValue = jest.fn();
    render(<Controlled onValue={onValue} />);
    fireEvent.change(screen.getByLabelText('Mobile'), { target: { value: '+447911123456' } });
    expect(trigger()).toHaveTextContent('+44');
    expect(onValue).toHaveBeenLastCalledWith('+447911123456');
  });

  it('stays on the picked country after its number is cleared', async () => {
    const user = userEvent.setup();
    render(<Controlled initial="+447911123456" />);
    await user.clear(screen.getByLabelText('Mobile'));
    expect(trigger()).toHaveTextContent('+44');
  });

  // Fourteen, not E.164's fifteen: the server's column is varchar(15).
  it('caps a foreign number at fourteen digits with its code', async () => {
    const user = userEvent.setup();
    const onValue = jest.fn();
    render(<Controlled onValue={onValue} />);
    await pick(user, 'united kingdom', 'United Kingdom');
    await user.type(screen.getByLabelText('Mobile'), '1234567890123456');
    expect(onValue).toHaveBeenLastCalledWith('+44123456789012');
  });

  it('disables the picker with the field', () => {
    render(<UbPhoneInput value="" onChange={jest.fn()} disabled aria-label="Mobile" />);
    expect(trigger()).toBeDisabled();
  });
});

describe('UbPhoneInput with lockCountry (sign-in)', () => {
  // Sign-in codes are sent to India only (countryCode=91): a picker there would offer 242
  // countries that cannot receive a code.
  it('shows +91 with no picker and still reports E.164', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<UbPhoneInput value="" onChange={onChange} lockCountry aria-label="Mobile" />);
    expect(screen.queryByRole('combobox', { name: 'Country code' })).not.toBeInTheDocument();
    expect(screen.getByText('+91')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Mobile'), '9');
    expect(onChange).toHaveBeenLastCalledWith('+919');
  });

  it('does not switch country on a pasted foreign number', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    // (the unlocked control switches; covered above)
    expect(screen.getByRole('combobox', { name: 'Country code' })).toHaveTextContent('+91');
    const onChange = jest.fn();
    render(<UbPhoneInput value="" onChange={onChange} lockCountry aria-label="Locked" />);
    await user.click(screen.getByLabelText('Locked'));
    await user.paste('+44 7911 123456');
    expect(screen.getAllByText('+91').length).toBeGreaterThan(0);
    expect(onChange).not.toHaveBeenCalledWith('+447911123456');
  });
});
