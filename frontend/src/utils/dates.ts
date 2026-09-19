/**
 * Part 19 §19.11.5 — business dates are `YYYY-MM-DD` on the wire and
 * `dd/mm/yyyy` on screen in BOTH locales, and every "today" computation uses
 * the TENANT timezone, never the device clock (LED-01 EC-8).
 *
 * `new Date()` is called in exactly one place in the application — here — and a
 * business date never derives from it directly.
 */
import dayjs from 'dayjs';

import { DEFAULT_TENANT_TIMEZONE } from 'src/constants';

export const WIRE_DATE_FORMAT = 'YYYY-MM-DD';
export const DISPLAY_DATE_FORMAT = 'DD/MM/YYYY';

/**
 * Today in the tenant's timezone, as `YYYY-MM-DD`.
 *
 * Implemented with `Intl` rather than `dayjs/plugin/timezone` because the
 * plugin is a second dependency for one call and `Intl` already carries the
 * IANA database. An entry made at 11.50 p.m. IST keeps the day the merchant
 * meant even when the device is set to UTC.
 */
export const todayInTenantTz = (timeZone: string = DEFAULT_TENANT_TIMEZONE): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  // en-CA already yields YYYY-MM-DD; the split guards a locale-data surprise.
  return parts.slice(0, 10);
};

export const isValidWireDate = (value: string | null | undefined): boolean =>
  !!value && dayjs(value, WIRE_DATE_FORMAT, true).isValid();

/** `2026-03-31` → `31/03/2026`. Returns the em dash for an absent value. */
export const formatBusinessDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format(DISPLAY_DATE_FORMAT) : '—';
};

/** RFC 3339 UTC timestamp → `dd/mm/yyyy, HH:mm` for audit and activity lines. */
export const formatTimestamp = (value: string | null | undefined): string => {
  if (!value) return '—';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format(`${DISPLAY_DATE_FORMAT}, HH:mm`) : '—';
};

export const isPastDate = (value: string, today: string = todayInTenantTz()): boolean =>
  dayjs(value).isBefore(dayjs(today), 'day');

/**
 * Indian financial year label for a business date: 1 April – 31 March.
 * `2026-04-01` → `2026-27`; `2026-03-31` → `2025-26`.
 */
export const fyLabelFor = (value: string): string => {
  const date = dayjs(value);
  const startYear = date.month() >= 3 ? date.year() : date.year() - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
};
