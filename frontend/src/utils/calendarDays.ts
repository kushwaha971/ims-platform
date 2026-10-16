/**
 * Calendar-day arithmetic on `YYYY-MM-DD` business dates, in UTC so no time
 * zone can move a date. It imports nothing on purpose: `utils/dates.ts` carries
 * dayjs, and a screen that only counts days (a party row's "last entry 3 days
 * ago", the aging buckets) must not download a date library to do it — putting
 * these in `dates.ts` cost about 2 KB on twenty routes. `dates.ts` re-exports
 * them, so either import works; prefer this one where dayjs is not already used.
 */

/** One calendar day in milliseconds — for the few callers that floor an INSTANT to a day. */
export const DAY_MS = 86_400_000;

/**
 * Whole calendar days from `from` to `to` (both `YYYY-MM-DD`): positive when
 * `to` is later. "3 days late", "Expires in 2 days" and the reminder's
 * "overdue 5 days" all read it (WP-03 D-02), so they cannot disagree by a day.
 */
export const daysBetweenIso = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** `"2026-10-12"` + 7 → `"2026-10-19"`, on the calendar (UTC arithmetic, no time zone). */
export const addDaysIso = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
