import { loadedMessage } from 'src/utils/loadedMessage';

import type { ModuleReminderBucket } from '../types/reminder.types';

type Translate = (id: string, values?: Record<string, string | number | Date>) => string;
type FormatDate = (value: string | Date, options?: Intl.DateTimeFormatOptions) => string;

/**
 * A7 (PLT-X06 §2, §8) — the words for a module's reminder tab. Buckets in the
 * FRD's order: soonest trouble first is the order a collection round works in.
 */
export const MODULE_BUCKETS: readonly ModuleReminderBucket[] = [
  'overdue_older',
  'overdue_30',
  'overdue_7',
  'due_today',
  'due_soon',
  'notice',
];

export const MODULE_BUCKET_LABEL: Readonly<Record<ModuleReminderBucket, string>> = {
  due_soon: 'reminders.module.bucket.dueSoon',
  due_today: 'reminders.module.bucket.dueToday',
  overdue_7: 'reminders.module.bucket.overdue7',
  overdue_30: 'reminders.module.bucket.overdue30',
  overdue_older: 'reminders.module.bucket.overdueOlder',
  notice: 'reminders.module.bucket.notice',
};

/**
 * "Next: 13/10/2026, 8:00 am" in the TENANT's zone — the moment the server said
 * the policy allows, never recomputed here.
 */
export const nextAllowedLabel = (
  t: Translate,
  d: FormatDate,
  iso: string,
  timeZone: string
): string =>
  t('reminders.module.next', {
    when: d(iso, {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }),
  });

/** The module tab's name: the module's own word, else its name, else "Feature". */
export const reminderTabLabel = (t: Translate, module: string, labelId: string): string =>
  loadedMessage(t, labelId) ??
  loadedMessage(t, `nav.module.${module}`) ??
  t('reminders.module.tabFallback');

/**
 * `HH:MM` every half hour from `start` to `end`, both included — the only times
 * the sending-hours selects offer, so a widened window cannot be chosen.
 */
export const halfHoursBetween = (start: string, end: string): readonly string[] => {
  const toMinutes = (value: string): number => {
    const [h, m] = value.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const out: string[] = [];
  for (let at = toMinutes(start); at <= toMinutes(end); at += 30) {
    out.push(`${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`);
  }
  return out;
};
