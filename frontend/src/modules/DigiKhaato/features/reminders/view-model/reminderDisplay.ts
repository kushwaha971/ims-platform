import type { UbStatusBadgeTone } from 'src/design-system';

import type {
  BulkReminderSkip,
  CollectionBucket,
  CollectionSummary,
  ReminderChannel,
  ReminderKind,
  ReminderStatus,
  ReminderTab,
} from '../types/reminder.types';

/**
 * LED-05/06/07 — the words and tones of the reminders screen, as decisions.
 * Pure: every function returns message ids and values for the caller's `t()`.
 */

export const REMINDER_TABS: readonly ReminderTab[] = ['today', 'overdue', 'upcoming', 'sent'];

/** LED-05 §8 — the tones are fixed: overdue red, due today amber, upcoming neutral. */
export const BUCKET_TONE: Readonly<Record<CollectionBucket, 'danger' | 'warning' | 'default'>> = {
  today: 'warning',
  overdue: 'danger',
  upcoming: 'default',
};

export const isBucket = (tab: ReminderTab): tab is CollectionBucket => tab !== 'sent';

export const bucketFigure = (
  summary: CollectionSummary | null,
  bucket: CollectionBucket
): { readonly count: number; readonly amount: string } | null => {
  if (!summary) return null;
  if (bucket === 'today') return summary.dueToday;
  if (bucket === 'overdue') return summary.overdue;
  return summary.upcoming;
};

/** LED-07 §7 — status tones. `failed` is the one that asks for action. */
export const STATUS_TONE: Readonly<Record<ReminderStatus, UbStatusBadgeTone>> = {
  scheduled: 'info',
  sent: 'success',
  failed: 'error',
  done: 'success',
  dismissed: 'neutral',
  cancelled: 'neutral',
};

export const statusLabelId = (status: ReminderStatus): string => `reminders.status.${status}`;
export const kindLabelId = (kind: ReminderKind): string => `reminders.kind.${kind}`;
export const channelLabelId = (channel: ReminderChannel): string => `reminders.channel.${channel}`;
export const skipReasonId = (reason: BulkReminderSkip['reason']): string =>
  `reminders.bulk.skip.${reason}`;

/**
 * The system's note on a failed or cancelled automated row, translated. The
 * server writes a fixed English phrase (LED-07 FR-3 / BR-6); a note it did not
 * write — a merchant's own line on a manual reminder — is shown as typed.
 */
const SYSTEM_NOTES: Readonly<Record<string, string>> = {
  'provider not configured': 'reminders.note.providerMissing',
  'balance settled': 'reminders.note.settled',
  'opted out': 'reminders.note.optedOut',
  'no mobile': 'reminders.note.noMobile',
  'invalid mobile': 'reminders.note.invalidMobile',
  'automated SMS turned off': 'reminders.note.settingOff',
  'collection date changed': 'reminders.note.dateChanged',
};

export const noteView = (note: string): { readonly id: string | null; readonly text: string } => {
  const id = SYSTEM_NOTES[note.trim()];
  return id ? { id, text: '' } : { id: null, text: note };
};

/**
 * LED-05 FR-4 — the date caption on a bucket row: "Due today", "Overdue 3 d",
 * or the date. Computed on ISO strings in the TENANT's today, never the device's.
 */
export const collectionCaption = (
  collectionDate: string | null,
  today: string
): { readonly id: string; readonly values: Readonly<Record<string, string | number>> } | null => {
  if (!collectionDate) return null;
  if (collectionDate === today) return { id: 'reminders.due.today', values: {} };
  const days = Math.round((Date.parse(today) - Date.parse(collectionDate)) / 86_400_000);
  if (days > 0) return { id: 'reminders.due.overdue', values: { count: days } };
  return { id: 'reminders.due.inDays', values: { count: -days } };
};
