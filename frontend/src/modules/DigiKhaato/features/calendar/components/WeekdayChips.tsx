'use client';

import { memo } from 'react';

import { UbFilterChip, UbFilterChipGroup } from 'src/design-system';
import { useTranslation } from 'src/hooks/useTranslation';

import { WEEKDAYS, lastOpenDay, toggleWeekday } from '../view-model/calendarDisplay';

import type { Weekday } from '../types/calendar.types';

/**
 * A9b — Mon…Sun as toggle chips; a pressed chip is a closed day. The chip of
 * the last open day is disabled (BR-2: at least one day stays open).
 */
function WeekdayChipsInner({
  label,
  value,
  disabled,
  onChange,
}: Readonly<{
  label: string;
  value: readonly Weekday[];
  disabled: boolean;
  onChange: (next: Weekday[]) => void;
}>): React.JSX.Element {
  const { t } = useTranslation();
  const lastOpen = lastOpenDay(value);
  return (
    // Seven chips do not fit a 390 px row; the group is built not to wrap
    // (filter bars scroll), so it is told to here.
    <UbFilterChipGroup label={label} className="shrink flex-wrap">
      {WEEKDAYS.map((day) => (
        <UbFilterChip
          key={day}
          label={t(`calendar.weekday.${day}`)}
          pressed={value.includes(day)}
          disabled={disabled || day === lastOpen}
          onToggle={() => onChange(toggleWeekday(value, day))}
        />
      ))}
    </UbFilterChipGroup>
  );
}

export const WeekdayChips = memo(WeekdayChipsInner);
