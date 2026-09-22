import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { isoFinancialYearStart, isoToday, UbDateInput } from './UbDateInput';

describe('the dates a merchant actually means', () => {
  it('puts the financial year start at 1 April, and last April before that', () => {
    // Every opening balance in this product is "what the book said when I
    // started keeping it", and for anyone filing GST that is 1 April. In
    // February the year that started last April is the one still open.
    expect(isoFinancialYearStart(new Date('2026-09-22'))).toBe('2026-04-01');
    expect(isoFinancialYearStart(new Date('2026-02-10'))).toBe('2025-04-01');
    expect(isoFinancialYearStart(new Date('2026-04-01'))).toBe('2026-04-01');
  });

  it('reads today as a calendar day rather than an instant', () => {
    // `toISOString()` would answer in UTC, so a merchant in IST adding a party
    // before 5:30am would get yesterday.
    expect(isoToday(new Date(2026, 8, 22, 1, 0, 0))).toBe('2026-09-22');
  });
});

describe('the control', () => {
  it('emits ISO, which is already the wire format', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<UbDateInput value={null} onChange={onChange} aria-label="As of" />);

    await user.type(screen.getByLabelText('As of'), '2026-04-01');
    expect(onChange).toHaveBeenLastCalledWith('2026-04-01');
  });

  it('clears to null rather than to an empty string', () => {
    // The API distinguishes them: null removes the date, "" is a validation
    // error on a date field.
    const onChange = jest.fn();
    render(<UbDateInput value="2026-04-01" onChange={onChange} aria-label="As of" />);

    // `fireEvent.change` rather than a raw DOM event: React listens through its
    // own synthetic system, so a hand-dispatched `change` reaches nothing.
    fireEvent.change(screen.getByLabelText('As of'), { target: { value: '' } });

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('offers the shortcut the native picker cannot', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <UbDateInput
        value={null}
        onChange={onChange}
        aria-label="As of"
        quickChoices={[{ label: 'FY start', date: '2026-04-01' }]}
      />
    );

    // A collection date is almost always "this Friday" and an opening balance
    // almost always the start of the year — three taps through a picker each.
    await user.click(screen.getByRole('button', { name: 'FY start' }));
    expect(onChange).toHaveBeenCalledWith('2026-04-01');
  });
});
