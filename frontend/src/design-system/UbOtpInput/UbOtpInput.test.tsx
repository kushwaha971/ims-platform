import { useState } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { OTP_LENGTH, UbOtpInput } from './UbOtpInput';

/**
 * PLT-01 §7 and T-PLT-01-9 — "paste fills six cells and auto-submits".
 *
 * A controlled harness rather than a bare render: the component's whole
 * contract is that the FORM holds one string and the cells are a rendering of
 * it, and an uncontrolled render would test neither half.
 */
function Harness({
  onComplete,
  readOnly,
  initial = '',
}: Readonly<{ onComplete?: (value: string) => void; readOnly?: boolean; initial?: string }>) {
  const [value, setValue] = useState(initial);
  return (
    <UbOtpInput
      value={value}
      onChange={setValue}
      onComplete={onComplete}
      readOnly={readOnly}
      label="Six-digit code"
      cellLabel={(index, total) => `Digit ${index} of ${total}`}
    />
  );
}

const cells = (): HTMLInputElement[] =>
  Array.from({ length: OTP_LENGTH }, (_, index) =>
    screen.getByLabelText(`Digit ${index + 1} of ${OTP_LENGTH}`)
  ) as HTMLInputElement[];

describe('UbOtpInput', () => {
  it('renders one labelled cell per digit inside one group', () => {
    render(<Harness />);
    expect(screen.getByRole('group', { name: 'Six-digit code' })).toBeInTheDocument();
    expect(cells()).toHaveLength(OTP_LENGTH);
  });

  it('offers the platform one-time code on the FIRST cell only', () => {
    render(<Harness />);
    const [first, second] = cells();
    expect(first).toHaveAttribute('autocomplete', 'one-time-code');
    // Six one-time-code fields make the platform offer the code six times.
    expect(second).toHaveAttribute('autocomplete', 'off');
  });

  it('fills all six cells from one paste and fires onComplete once', async () => {
    const user = userEvent.setup();
    const onComplete = jest.fn();
    render(<Harness onComplete={onComplete} />);

    const [first] = cells();
    if (!first) throw new Error('no cells rendered');
    first.focus();
    await user.paste('123456');

    expect(cells().map((cell) => cell.value)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('strips the spaces an SMS copy brings with it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const [first] = cells();
    if (!first) throw new Error('no cells rendered');
    first.focus();
    await user.paste('12 34 56');

    expect(
      cells()
        .map((cell) => cell.value)
        .join('')
    ).toBe('123456');
  });

  it('advances as digits are typed and auto-submits on the sixth', async () => {
    const user = userEvent.setup();
    const onComplete = jest.fn();
    render(<Harness onComplete={onComplete} />);

    await user.type(cells()[0] as HTMLInputElement, '123456');

    expect(
      cells()
        .map((cell) => cell.value)
        .join('')
    ).toBe('123456');
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('rejects a non-digit rather than showing it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(cells()[0] as HTMLInputElement, 'a');
    expect(cells()[0]).toHaveValue('');
  });

  it('moves back and clears on Backspace in an empty cell', async () => {
    const user = userEvent.setup();
    render(<Harness initial="12" />);

    const third = cells()[2];
    if (!third) throw new Error('no cells rendered');
    third.focus();
    await user.keyboard('{Backspace}');

    expect(
      cells()
        .map((cell) => cell.value)
        .join('')
    ).toBe('1');
  });

  it('is read-only, not disabled, while verifying — focus must survive', () => {
    render(<Harness readOnly initial="123456" />);
    cells().forEach((cell) => {
      expect(cell).toHaveAttribute('readonly');
      expect(cell).not.toBeDisabled();
    });
  });

  it('does not accept input while read-only', async () => {
    const user = userEvent.setup();
    render(<Harness readOnly initial="12" />);
    await user.type(cells()[2] as HTMLInputElement, '9');
    expect(
      cells()
        .map((cell) => cell.value)
        .join('')
    ).toBe('12');
  });
});
