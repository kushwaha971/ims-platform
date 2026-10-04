import { api } from 'src/api/AxiosInstances';

import { LIBRARY_PATHS } from './libraryPaths';

import type {
  LibraryNumberKind,
  LibraryNumbering,
  LibrarySettings,
  LibrarySettingsBundle,
} from '../types/settings.types';

/**
 * F02 (LIB-01 §6) — the settings row and its two counters. One async function
 * each and the mapping, nothing else (Part 19 §19.3.4).
 */
type Wire = Readonly<Record<string, unknown>>;

interface SettingsApi {
  readonly data: Wire;
  readonly meta: {
    readonly numbering: {
      readonly accession: { readonly next: number };
      readonly member: { readonly prefix: string; readonly next: number; readonly display: string };
    };
    readonly closed_weekdays: readonly number[];
  };
}

const str = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value);
const strOrNull = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

export const toSettings = (row: Wire): LibrarySettings => ({
  version: Number(row.version),
  fineSkipClosedDays: Boolean(row.fine_skip_closed_days),
  fineRounding: row.fine_rounding as LibrarySettings['fineRounding'],
  overdueIssueRule: row.overdue_issue_rule as LibrarySettings['overdueIssueRule'],
  lostCountsTowardLimit: Boolean(row.lost_counts_toward_limit),
  renewFrom: row.renew_from as LibrarySettings['renewFrom'],
  renewOverdue: row.renew_overdue as LibrarySettings['renewOverdue'],
  holdPickupDays: Number(row.hold_pickup_days),
  lostMultiplier: str(row.lost_multiplier),
  lostProcessingFee: str(row.lost_processing_fee),
  lostFoundPaid: row.lost_found_paid as LibrarySettings['lostFoundPaid'],
  fallbackPrice: strOrNull(row.fallback_price),
  damageMinorAmount: str(row.damage_minor_amount),
  damageMajorPercent: Number(row.damage_major_percent),
  waiverCeiling: strOrNull(row.waiver_ceiling),
  overdueReminderDays: ((row.overdue_reminder_days as number[] | undefined) ?? []).map(Number),
  remindDayBefore: Boolean(row.remind_day_before),
});

export const toSettingsBody = (s: LibrarySettings): Wire => ({
  version: s.version,
  fine_skip_closed_days: s.fineSkipClosedDays,
  fine_rounding: s.fineRounding,
  overdue_issue_rule: s.overdueIssueRule,
  lost_counts_toward_limit: s.lostCountsTowardLimit,
  renew_from: s.renewFrom,
  renew_overdue: s.renewOverdue,
  hold_pickup_days: s.holdPickupDays,
  lost_multiplier: s.lostMultiplier,
  lost_processing_fee: s.lostProcessingFee,
  lost_found_paid: s.lostFoundPaid,
  fallback_price: s.fallbackPrice,
  damage_minor_amount: s.damageMinorAmount,
  damage_major_percent: s.damageMajorPercent,
  waiver_ceiling: s.waiverCeiling,
  overdue_reminder_days: [...s.overdueReminderDays],
  remind_day_before: s.remindDayBefore,
});

const toBundle = (body: SettingsApi): LibrarySettingsBundle => ({
  settings: toSettings(body.data),
  numbering: {
    accessionNext: body.meta.numbering.accession.next,
    memberPrefix: body.meta.numbering.member.prefix,
    memberNext: body.meta.numbering.member.next,
    memberDisplay: body.meta.numbering.member.display,
  } satisfies LibraryNumbering,
  closedWeekdays: body.meta.closed_weekdays,
});

export const getLibrarySettings = async (signal?: AbortSignal): Promise<LibrarySettingsBundle> => {
  const response = await api.get<SettingsApi>(LIBRARY_PATHS.SETTINGS, { signal });
  return toBundle(response.data);
};

export const putLibrarySettings = async (
  settings: LibrarySettings
): Promise<LibrarySettingsBundle> => {
  const response = await api.put<SettingsApi>(LIBRARY_PATHS.SETTINGS, toSettingsBody(settings));
  return toBundle(response.data);
};

export const raiseLibraryNumber = async (
  kind: LibraryNumberKind,
  nextNumber: number
): Promise<void> => {
  await api.post(LIBRARY_PATHS.SETTINGS_NUMBERING, { kind, next_number: nextNumber });
};
