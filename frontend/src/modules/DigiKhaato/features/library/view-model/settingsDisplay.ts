import type { LibrarySettings, LibrarySettingsFormValues } from '../types/settings.types';

/**
 * F02 — the settings form's conversions, kept out of the component so they
 * can be tested without rendering. Money stays a decimal string; an optional
 * money field that is empty means "no value" (`null` on the wire), never 0.
 */
export const REMINDER_DAYS_MAX = 6;
const DAY_MAX = 365;

/** BR-3 — "14, 1,7" → [1, 7, 14]; unique, 1–365, at most six; null when not valid. */
export const parseReminderDays = (raw: string): number[] | null => {
  const parts = raw
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.some((part) => !/^\d+$/.test(part))) return null;
  const days = [...new Set(parts.map(Number))].sort((a, b) => a - b);
  if (days.length > REMINDER_DAYS_MAX || days.some((d) => d < 1 || d > DAY_MAX)) return null;
  return days;
};

export const toSettingsForm = (s: LibrarySettings): LibrarySettingsFormValues => ({
  fineSkipClosedDays: s.fineSkipClosedDays,
  fineRounding: s.fineRounding,
  overdueIssueRule: s.overdueIssueRule,
  lostCountsTowardLimit: s.lostCountsTowardLimit,
  renewFrom: s.renewFrom,
  renewOverdue: s.renewOverdue,
  holdPickupDays: String(s.holdPickupDays),
  lostMultiplier: s.lostMultiplier,
  lostProcessingFee: s.lostProcessingFee,
  lostFoundPaid: s.lostFoundPaid,
  fallbackPrice: s.fallbackPrice ?? '',
  damageMinorAmount: s.damageMinorAmount,
  damageMajorPercent: String(s.damageMajorPercent),
  waiverCeiling: s.waiverCeiling ?? '',
  overdueReminderDays: s.overdueReminderDays.join(', '),
  remindDayBefore: s.remindDayBefore,
});

/** The resolver turns an empty optional amount into `null` (QA-F02-1). */
const optionalAmount = (value: string | null | undefined): string | null =>
  (value ?? '').trim() || null;

export const fromSettingsForm = (
  values: LibrarySettingsFormValues,
  version: number
): LibrarySettings => ({
  version,
  fineSkipClosedDays: values.fineSkipClosedDays,
  fineRounding: values.fineRounding,
  overdueIssueRule: values.overdueIssueRule,
  lostCountsTowardLimit: values.lostCountsTowardLimit,
  renewFrom: values.renewFrom,
  renewOverdue: values.renewOverdue,
  holdPickupDays: Number(values.holdPickupDays),
  lostMultiplier: values.lostMultiplier.trim(),
  lostProcessingFee: values.lostProcessingFee.trim(),
  lostFoundPaid: values.lostFoundPaid,
  fallbackPrice: optionalAmount(values.fallbackPrice),
  damageMinorAmount: values.damageMinorAmount.trim(),
  damageMajorPercent: Number(values.damageMajorPercent),
  waiverCeiling: optionalAmount(values.waiverCeiling),
  overdueReminderDays: parseReminderDays(values.overdueReminderDays) ?? [],
  remindDayBefore: values.remindDayBefore,
});

/** Which tab holds a field — a server refusal opens the tab its field is on. */
export const FIELD_TAB: Readonly<Record<keyof LibrarySettingsFormValues, string>> = {
  overdueIssueRule: 'general',
  lostCountsTowardLimit: 'general',
  renewFrom: 'loans',
  renewOverdue: 'loans',
  fineSkipClosedDays: 'fines',
  fineRounding: 'fines',
  waiverCeiling: 'fines',
  lostMultiplier: 'lost',
  lostProcessingFee: 'lost',
  lostFoundPaid: 'lost',
  fallbackPrice: 'lost',
  damageMinorAmount: 'lost',
  damageMajorPercent: 'lost',
  holdPickupDays: 'holds',
  overdueReminderDays: 'holds',
  remindDayBefore: 'holds',
};
