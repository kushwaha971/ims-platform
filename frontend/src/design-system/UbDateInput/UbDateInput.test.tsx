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
 * exactly as it was.
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
      />
    );
    expect(screen.getByText('सितंबर 2026')).toBeInTheDocument();
    expect(screen.queryByText('September 2026')).toBeNull();
    expect(screen.getByRole('button', { name: 'अगला महीना' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'पिछला महीना' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /28 सितंबर 2026/ })).toBeInTheDocument();
  });

  it('keeps the English grid as it was', () => {
    render(<UbDateCalendar selected={sep28} onSelect={jest.fn()} locale="en-IN" />);
    expect(screen.getByText('September 2026')).toBeInTheDocument();
  });
});

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
