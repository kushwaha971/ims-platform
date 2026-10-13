import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'react-intl';

import { UbDateCalendar } from './UbDateCalendar';
import { formatDateFace, isoFinancialYearStart, isoToday, UbDateInput } from './UbDateInput';

/**
 * Sprint 12 i18n sweep: the field read "28 सित॰ 2026" but the popover it opens
 * still spoke English — "September 2026" over the grid, "Su Mo Tu" under it,
 * "Go to the Next Month" on the arrow — because react-day-picker formats with
 * date-fns' en-US default. The Hindi grid is `Intl`'s hi-IN; English is left
 * in English while offering the same direct month/year choices.
 */
describe('the calendar popover in the app language', () => {
  const sep28 = new Date(2026, 8, 28);

  it('titles the month, the weekdays and the arrows in Hindi on a Hindi screen', () => {
    render(
      <UbDateCalendar
        selected={sep28}
        onSelect={jest.fn()}
        locale="hi-IN"
        previousMonthLabel="पिछला महीना"
        nextMonthLabel="अगला महीना"
        monthDropdownLabel="महीना"
        yearDropdownLabel="साल"
      />
    );
    expect(screen.getByRole('option', { name: 'सितंबर' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'साल' })).toHaveValue('2026');
    expect(screen.getByRole('combobox', { name: 'महीना' })).toHaveValue('8');
    expect(screen.queryByText('September 2026')).toBeNull();
    expect(screen.getByRole('button', { name: 'अगला महीना' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'पिछला महीना' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /28 सितंबर 2026/ })).toBeInTheDocument();
  });

  it('keeps the English grid as it was', () => {
    render(<UbDateCalendar selected={sep28} onSelect={jest.fn()} locale="en-IN" />);
    expect(screen.getByRole('option', { name: 'September' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Year' })).toHaveValue('2026');
  });
});

describe('the dates a merchant actually means', () => {
  /** B41: a faster calendar must still refuse days outside the caller's range. */
  it('keeps the existing day bounds while changing months directly', async () => {
    const user = userEvent.setup();
    render(
      <UbDateCalendar
        selected={new Date(2024, 4, 15)}
        onSelect={jest.fn()}
        min={new Date(2024, 4, 10)}
        max={new Date(2024, 5, 20)}
      />
    );
    expect(screen.getByRole('button', { name: /May 9th, 2024/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /May 10th, 2024/ })).toBeEnabled();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Month' }), '5');
    expect(screen.getByRole('button', { name: /June 20th, 2024/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /June 21st, 2024/ })).toBeDisabled();
  });

  /** B41: changing year, month and day must replace dozens of month-arrow clicks. */
  it.each([2021, 2031])('reaches May 15 in %s with three calendar choices', async (year) => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    render(<UbDateCalendar selected={new Date(2026, 9, 14)} onSelect={onSelect} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Year' }), String(year));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Month' }), '4');
    await user.click(screen.getByRole('button', { name: new RegExp(`May 15th, ${year}`) }));
    expect(onSelect).toHaveBeenCalledWith(
      new Date(year, 4, 15),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });

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
  it('shows the chosen date the way a merchant reads one, not as the wire ISO', () => {
    /**
     * The field used to be a native `<input type="date">`, whose face follows
     * the BROWSER's locale (04/01 on an en-US laptop). It is BrandHub's
     * calendar button now, and it says the date in words.
     */
    render(<UbDateInput value="2026-04-01" onChange={jest.fn()} aria-label="As of" />);

    expect(screen.getByRole('button', { name: 'As of' })).toHaveTextContent('1 Apr 2026');
  });

  it('P-D6: on a Hindi screen the month is Hindi — "28 सित॰ 2026", not "28 Sep 2026"', () => {
    /* QA P-D6 — the Hindi date control still read "28 Sep 2026". The face is the
       owner's "1 Apr 2026" in the app's language (react-intl's), never the device's. */
    render(
      <IntlProvider locale="hi-IN" messages={{}}>
        <UbDateInput value="2026-09-28" onChange={jest.fn()} aria-label="तारीख" />
      </IntlProvider>
    );
    expect(screen.getByRole('button', { name: 'तारीख' })).toHaveTextContent('28 सित॰ 2026');
    expect(formatDateFace('2026-04-01', 'hi-IN')).toBe('1 अप्रैल 2026');
    expect(formatDateFace('2026-04-01', 'en-IN')).toBe('1 Apr 2026');
  });

  it('shows its placeholder, muted, when there is no date', () => {
    render(
      <UbDateInput value={null} onChange={jest.fn()} aria-label="As of" placeholder="Pick a date" />
    );

    expect(screen.getByRole('button', { name: 'As of' })).toHaveTextContent('Pick a date');
  });

  it("opens a calendar in a popover rather than the operating system's picker", async () => {
    const user = userEvent.setup();
    render(<UbDateInput value="2026-04-01" onChange={jest.fn()} aria-label="As of" />);

    await user.click(screen.getByRole('button', { name: 'As of' }));

    expect(screen.getByRole('button', { name: 'As of' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('offers the shortcut the native picker cannot', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <UbDateInput
        value={null}
        onChange={onChange}
        aria-label="As of"
        quickChoicesLabel="Common dates"
        quickChoices={[{ label: 'FY start', date: '2026-04-01' }]}
      />
    );

    // A collection date is almost always "this Friday" and an opening balance
    // almost always the start of the year — three taps through a picker each.
    await user.click(screen.getByRole('button', { name: 'FY start' }));
    expect(onChange).toHaveBeenCalledWith('2026-04-01');
  });
});
