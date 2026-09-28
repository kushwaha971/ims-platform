'use client';

import { useMemo } from 'react';

import { MLCalendar } from 'src/design-system/primitives';

/**
 * ml-uikit's `MLCalendar` (react-day-picker), dressed as BrandHub dresses it in
 * `ShipmentExpectedDelivery`: native button borders zeroed, the selected day a
 * solid primary fill with white text.
 *
 * Its own module so `UbDateInput` can load it with `next/dynamic` — the day
 * grid and its date library arrive when a merchant opens the popover, not with
 * every screen that merely SHOWS a date field.
 */
export interface UbDateCalendarProps {
  readonly selected: Date | undefined;
  readonly onSelect: (date: Date | undefined) => void;
  readonly min?: Date;
  readonly max?: Date;
  /** The APP's language (react-intl's), never the device's. */
  readonly locale?: string;
  /** The month arrows' names; react-day-picker's own are English sentences. */
  readonly previousMonthLabel?: string;
  readonly nextMonthLabel?: string;
}

/**
 * Sprint 12 i18n sweep — the popover spoke English on a Hindi screen. The
 * field's face already read "28 सित॰ 2026" (QA P-D6), but react-day-picker
 * formats with date-fns' default en-US locale, so the month header over the
 * grid said "September 2026", the weekday row "Su Mo Tu", and every day button
 * announced "Monday, September 28th, 2026". `Intl` prints all three for hi-IN
 * with no date-fns locale bundle (ADR-021): "सितंबर 2026", "रवि सोम मंगल", and
 * "सोमवार, 28 सितंबर 2026". English keeps react-day-picker's own formats, which
 * are what the owner signed off.
 */
const hindiFormatters = () => {
  const caption = new Intl.DateTimeFormat('hi-IN', { month: 'long', year: 'numeric' });
  const weekday = new Intl.DateTimeFormat('hi-IN', { weekday: 'short' });
  const day = new Intl.DateTimeFormat('hi-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return {
    formatters: {
      formatCaption: (date: Date) => caption.format(date),
      formatWeekdayName: (date: Date) => weekday.format(date),
    },
    labelDayButton: (date: Date) => day.format(date),
  };
};

export function UbDateCalendar({
  selected,
  onSelect,
  min,
  max,
  locale,
  previousMonthLabel,
  nextMonthLabel,
}: Readonly<UbDateCalendarProps>): React.JSX.Element {
  const disabled = [...(min ? [{ before: min }] : []), ...(max ? [{ after: max }] : [])];
  const hindi = useMemo(() => (locale?.startsWith('hi') ? hindiFormatters() : null), [locale]);
  return (
    <MLCalendar
      mode="single"
      selected={selected}
      defaultMonth={selected ?? max}
      onSelect={onSelect}
      disabled={disabled.length ? disabled : undefined}
      initialFocus
      formatters={hindi?.formatters}
      labels={{
        ...(previousMonthLabel ? { labelPrevious: () => previousMonthLabel } : {}),
        ...(nextMonthLabel ? { labelNext: () => nextMonthLabel } : {}),
        ...(hindi ? { labelDayButton: hindi.labelDayButton } : {}),
      }}
      lang={locale?.startsWith('hi') ? 'hi' : undefined}
      className="[&_[data-selected-single=true]]:!bg-primary [&_[data-selected-single=true]]:!text-white [&_button]:border-0 [&_button]:shadow-none"
    />
  );
}
