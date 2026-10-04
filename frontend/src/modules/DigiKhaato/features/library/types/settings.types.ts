/**
 * F02 (LIB-01 §5, §6) — the library's settings row, its numbering and the
 * form that edits it. Money stays a decimal string end to end (the server's
 * shape); counts are numbers on the wire and strings in the form, because an
 * input holds text and "" must mean "not filled", never 0.
 */
export const FINE_ROUNDINGS = ['rupee', 'paise'] as const;
export const OVERDUE_ISSUE_RULES = ['block', 'warn', 'off'] as const;
export const RENEW_FROM = ['today', 'due_date'] as const;
export const RENEW_OVERDUE = ['charge_fine', 'block'] as const;
export const LOST_FOUND_PAID = ['refund', 'keep'] as const;
export const LIBRARY_SETTINGS_TABS = ['general', 'loans', 'fines', 'lost', 'holds'] as const;
export const NUMBER_KINDS = ['library_accession', 'library_member'] as const;

export type FineRounding = (typeof FINE_ROUNDINGS)[number];
export type OverdueIssueRule = (typeof OVERDUE_ISSUE_RULES)[number];
export type RenewFrom = (typeof RENEW_FROM)[number];
export type RenewOverdue = (typeof RENEW_OVERDUE)[number];
export type LostFoundPaid = (typeof LOST_FOUND_PAID)[number];
export type LibrarySettingsTab = (typeof LIBRARY_SETTINGS_TABS)[number];
export type LibraryNumberKind = (typeof NUMBER_KINDS)[number];

export interface LibrarySettings {
  readonly version: number;
  readonly fineSkipClosedDays: boolean;
  readonly fineRounding: FineRounding;
  readonly overdueIssueRule: OverdueIssueRule;
  readonly lostCountsTowardLimit: boolean;
  readonly renewFrom: RenewFrom;
  readonly renewOverdue: RenewOverdue;
  readonly holdPickupDays: number;
  readonly lostMultiplier: string;
  readonly lostProcessingFee: string;
  readonly lostFoundPaid: LostFoundPaid;
  readonly fallbackPrice: string | null;
  readonly damageMinorAmount: string;
  readonly damageMajorPercent: number;
  readonly waiverCeiling: string | null;
  readonly overdueReminderDays: readonly number[];
  readonly remindDayBefore: boolean;
}

export interface LibraryNumbering {
  readonly accessionNext: number;
  readonly memberPrefix: string;
  readonly memberNext: number;
  /** The next card's number as printed ("M-0043"). */
  readonly memberDisplay: string;
}

export interface LibrarySettingsBundle {
  readonly settings: LibrarySettings;
  readonly numbering: LibraryNumbering;
  /** 0 = Monday; read here, written on the core calendar screen (G8). */
  readonly closedWeekdays: readonly number[];
}

export interface LibrarySettingsFormValues {
  fineSkipClosedDays: boolean;
  fineRounding: FineRounding;
  overdueIssueRule: OverdueIssueRule;
  lostCountsTowardLimit: boolean;
  renewFrom: RenewFrom;
  renewOverdue: RenewOverdue;
  holdPickupDays: string;
  lostMultiplier: string;
  lostProcessingFee: string;
  lostFoundPaid: LostFoundPaid;
  fallbackPrice: string;
  damageMinorAmount: string;
  damageMajorPercent: string;
  waiverCeiling: string;
  /** "1, 7, 14, 30" — BR-3: unique, 1–365, at most six; sorted on save. */
  overdueReminderDays: string;
  remindDayBefore: boolean;
}

export interface RaiseNumberFormValues {
  nextNumber: string;
}
