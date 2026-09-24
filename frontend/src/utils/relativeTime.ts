/**
 * "just now", "5 min ago", "3 h ago", "2 days ago", then a date — as a message
 * id and values for the caller's `t()`, so it speaks English and Hindi and is
 * tested without React.
 *
 * NTF-01 §8: relative time up to 7 days, then dd/mm/yyyy (the row format).
 * EC-8: a timestamp in the future — a phone whose clock runs fast — clamps to
 * "just now" rather than reading "in 2 minutes".
 *
 * Shared by the notification panel and the reminder history strip; the keys
 * live under `notifications.time.*` because the inbox is where they began.
 */
export interface RelativeTimeView {
  readonly id: string;
  readonly values: Readonly<Record<string, string | number>>;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const two = (n: number): string => String(n).padStart(2, '0');

export const relativeTimeView = (iso: string, nowMs: number): RelativeTimeView => {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return { id: 'notifications.time.justNow', values: {} };
  const elapsed = Math.max(nowMs - at, 0);
  if (elapsed < MINUTE) return { id: 'notifications.time.justNow', values: {} };
  if (elapsed < HOUR)
    return { id: 'notifications.time.minutes', values: { count: Math.floor(elapsed / MINUTE) } };
  if (elapsed < DAY)
    return { id: 'notifications.time.hours', values: { count: Math.floor(elapsed / HOUR) } };
  if (elapsed < 7 * DAY)
    return { id: 'notifications.time.days', values: { count: Math.floor(elapsed / DAY) } };
  const d = new Date(at);
  return {
    id: 'notifications.time.date',
    values: { date: `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}` },
  };
};
