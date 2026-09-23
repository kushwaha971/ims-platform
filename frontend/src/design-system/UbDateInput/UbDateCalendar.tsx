'use client';

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
}

export function UbDateCalendar({ selected, onSelect, min, max }: Readonly<UbDateCalendarProps>) {
  const disabled = [...(min ? [{ before: min }] : []), ...(max ? [{ after: max }] : [])];
  return (
    <MLCalendar
      mode="single"
      selected={selected}
      defaultMonth={selected ?? max}
      onSelect={onSelect}
      disabled={disabled.length ? disabled : undefined}
      initialFocus
      className="[&_[data-selected-single=true]]:!bg-primary [&_[data-selected-single=true]]:!text-white [&_button]:border-0 [&_button]:shadow-none"
    />
  );
}
