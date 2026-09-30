import type { RequestStatus } from 'src/types/api.types';

/**
 * LED-05 … LED-07 — the wire shapes of the reminders screen, as the domain
 * sees them. Money stays a decimal string end to end (canon rule 3); dates are
 * ISO `YYYY-MM-DD` and are formatted only at the edge.
 */

/** Part 21 §21.3.4 plus `sms_manual` (the merchant's own SMS app, CR-LOG). */
export type ReminderChannel =
  'whatsapp_manual' | 'sms_manual' | 'sms' | 'whatsapp_api' | 'call' | 'in_app';
export type ReminderKind = 'manual' | 'auto_d1' | 'auto_d0' | 'recurring' | 'due' | 'notice';
export type ReminderStatus = 'scheduled' | 'sent' | 'failed' | 'done' | 'dismissed' | 'cancelled';

/** The three LED-05 buckets plus the history of what was sent. */
export type ReminderTab = 'today' | 'overdue' | 'upcoming' | 'sent';
export type CollectionBucket = Exclude<ReminderTab, 'sent'>;
/** The history's filter — everything, the 09:00 SMS, the merchant's own, or what failed. */
export type ReminderKindFilter = '' | 'auto' | 'manual' | 'failed';

export interface Reminder {
  readonly id: string;
  readonly partyId: string;
  readonly partyName: string;
  readonly dueOn: string;
  readonly channel: ReminderChannel;
  readonly kind: ReminderKind;
  readonly status: ReminderStatus;
  readonly snapshotBalance: string | null;
  readonly note: string;
  readonly sentAt: string | null;
  readonly createdAt: string;
  /** A7 — `''` for a shop reminder; the module's code for one about a record. */
  readonly module?: string;
  readonly subjectLabel?: string;
  /** A7 — who was contacted when it was not the party (a guardian, R9). */
  readonly recipient?: { readonly id: string; readonly name: string } | null;
}

export interface ReminderTotals {
  readonly sent: number;
  readonly failed: number;
  readonly lastSentAt: string | null;
  readonly lastChannel: ReminderChannel | null;
}

export interface ReminderPage {
  readonly rows: readonly Reminder[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totals: ReminderTotals;
}

export interface ReminderListParams {
  readonly partyId?: string;
  readonly kind?: 'auto' | 'manual';
  readonly status?: string;
  readonly page: number;
  readonly pageSize: number;
}

/** A party in a collection bucket — what the list row needs and no more. */
export interface DueParty {
  readonly id: string;
  readonly name: string;
  readonly mobile: string | null;
  readonly balance: string;
  readonly collectionDate: string | null;
}

export interface DuePartyPage {
  readonly rows: readonly DueParty[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface BucketFigure {
  readonly count: number;
  readonly amount: string;
}

/** LED-05 FR-3 — the three buckets, off `GET /ledger/summary`. */
export interface CollectionSummary {
  readonly dueToday: BucketFigure;
  readonly overdue: BucketFigure;
  readonly upcoming: BucketFigure;
  readonly asOf: string;
}

export interface ReminderWarning {
  readonly code: 'reminded_recently';
  readonly lastSentAt: string;
  readonly channel: ReminderChannel;
}

/** `POST /reminders/preview` — the server-composed text; nothing is recorded. */
export interface ReminderPreview {
  readonly partyId: string;
  readonly balance: string;
  readonly text: string;
  readonly smsText: string;
  readonly hasMobile: boolean;
  readonly hasUpi: boolean;
  readonly warnings: readonly ReminderWarning[];
}

/** One step of the bulk flow: a scheduled row and the link that sends it. */
export interface BulkReminderItem {
  readonly partyId: string;
  readonly partyName: string;
  readonly reminderId: string;
  readonly balance: string;
  readonly text: string;
  readonly waUrl: string;
  readonly smsUrl: string;
}

export interface BulkReminderSkip {
  readonly partyId: string;
  readonly reason: 'not_found' | 'archived' | 'nothing_due' | 'no_mobile' | 'opted_out';
}

export interface BulkReminderResult {
  readonly items: readonly BulkReminderItem[];
  readonly skipped: readonly BulkReminderSkip[];
}

/** LED-07 FR-1 / LED-08 FR-1. */
export interface ReminderSettings {
  readonly autoSms: boolean;
  readonly partySmsOnEntry: boolean;
  readonly smsConfigured: boolean;
  /**
   * A7 (PLT-X06 BR-5) — each module's sending hours, `HH:MM`, for the modules
   * whose policy has a window; absent for a shop without one (owner Q5).
   */
  readonly windows?: Readonly<Record<string, ReminderWindow>>;
}

export interface ReminderWindow {
  readonly start: string;
  readonly end: string;
  /** The module's own hours: a tenant may narrow inside them, never widen. */
  readonly policyStart: string;
  readonly policyEnd: string;
}

export type ReminderSettingsPatch = Partial<
  Pick<ReminderSettings, 'autoSms' | 'partySmsOnEntry'>
> & {
  /** `null` puts a module back to its own hours. */
  readonly windows?: Readonly<Record<string, readonly [string, string] | null>>;
};

// ── A7 — PLT-X06: reminders about one module record ─────────────────────────

export type ModuleReminderBucket =
  'due_soon' | 'due_today' | 'overdue_7' | 'overdue_30' | 'overdue_older' | 'notice';

/** A record the module could remind about today (`GET /reminders/due?module=`). */
export interface ModuleReminderRow {
  readonly party: { readonly id: string; readonly name: string };
  readonly recipient: { readonly id: string; readonly name: string } | null;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly subjectLabel: string;
  readonly dueOn: string;
  /** Decimal string, or `null` for a notice — which never shows an amount (§8). */
  readonly amount: string | null;
  readonly bucket: ModuleReminderBucket;
  readonly allowed: boolean;
  /** ISO, tenant offset — when the policy would allow it (window or cap). */
  readonly nextAllowedAt: string | null;
}

export interface ReminderSourceRef {
  readonly sourceType: string;
  readonly sourceId: string;
}

export interface SourceReminderPreview {
  readonly sourceId: string;
  readonly text: string;
  readonly smsText: string;
  /** The RECIPIENT's number — the links are built from it. */
  readonly mobile: string | null;
  readonly recipient: { readonly id: string; readonly name: string } | null;
  readonly subjectLabel: string;
  readonly fixedText: boolean;
  readonly allowed: boolean;
  readonly nextAllowedAt: string | null;
}

export interface SendManualReminderArg {
  readonly partyId: string;
  readonly channel: 'whatsapp_manual' | 'sms_manual' | 'call';
  readonly note?: string;
}

export type { RequestStatus };
