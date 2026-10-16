import dayjs from 'dayjs';

import { DEFAULT_TENANT_TIMEZONE } from 'src/constants';

/*
 * Its own module rather than `dates.ts`, which every route loads: one more
 * export there cost three unrelated route chunks 0.1 KB each over budget.
 */

/**
 * RFC 3339 instant → `dd/mm/yyyy, HH:mm` on the TENANT's clock. `formatTimestamp`
 * uses the device's, so a UTC device wrote a bill entered at 00:11 IST under
 * the previous day; where the entered time is compared with a business date,
 * both must be on the same clock.
 */
export const formatTimestampInTz = (
  value: string | null | undefined,
  timeZone: string = DEFAULT_TENANT_TIMEZONE
): string => {
  if (!value || !dayjs(value).isValid()) return '—';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value])
  );
  return `${parts.day}/${parts.month}/${parts.year}, ${parts.hour}:${parts.minute}`;
};
