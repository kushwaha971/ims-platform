import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import type {
  BulkReminderResult,
  CollectionBucket,
  CollectionSummary,
  DuePartyPage,
  Reminder,
  ReminderChannel,
  ReminderListParams,
  ReminderPage,
  ReminderPreview,
  ReminderSettings,
  ReminderSettingsPatch,
  ReminderWarning,
} from '../types/reminder.types';

/**
 * Part 19 §19.3.4 — LED-05/06/07's requests, and the wire → domain mapping.
 * No React, no Redux: one function per endpoint.
 *
 * Every read of a whole screen sets `suppressErrorSnackbar`, because the screen
 * renders that failure in place with a Try again (CR-2026-09-19-E); writes keep
 * the global snackbar, which is the product's one error channel.
 */

interface ReminderWire {
  readonly id: string;
  readonly party: { readonly id: string; readonly name: string };
  readonly due_on: string;
  readonly channel: Reminder['channel'];
  readonly kind: Reminder['kind'];
  readonly status: Reminder['status'];
  readonly snapshot_balance: string | null;
  readonly note: string;
  readonly sent_at: string | null;
  readonly created_at: string;
}

const toReminder = (row: ReminderWire): Reminder => ({
  id: row.id,
  partyId: row.party.id,
  partyName: row.party.name,
  dueOn: row.due_on,
  channel: row.channel,
  kind: row.kind,
  status: row.status,
  snapshotBalance: row.snapshot_balance,
  note: row.note,
  sentAt: row.sent_at,
  createdAt: row.created_at,
});

interface WarningWire {
  readonly code: 'reminded_recently';
  readonly last_sent_at: string;
  readonly channel: ReminderChannel;
}

const toWarnings = (rows: readonly WarningWire[] | undefined): readonly ReminderWarning[] =>
  (rows ?? []).map((w) => ({ code: w.code, lastSentAt: w.last_sent_at, channel: w.channel }));

export const listReminders = async (
  params: ReminderListParams,
  signal?: AbortSignal
): Promise<ReminderPage> => {
  const response = await api.get<{
    data: readonly ReminderWire[];
    meta: {
      page: number;
      page_size: number;
      total: number;
      totals: {
        sent: number;
        failed: number;
        last_sent_at: string | null;
        last_channel: ReminderChannel | null;
      };
    };
  }>(
    `${API_PATHS.REMINDERS}${toQueryString({
      party_id: params.partyId || undefined,
      kind: params.kind || undefined,
      status: params.status || undefined,
      page: params.page > 1 ? params.page : undefined,
      page_size: params.pageSize,
    })}`,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  const { data, meta } = response.data;
  return {
    rows: data.map(toReminder),
    page: meta.page,
    pageSize: meta.page_size,
    total: meta.total,
    totals: {
      sent: meta.totals.sent,
      failed: meta.totals.failed,
      lastSentAt: meta.totals.last_sent_at,
      lastChannel: meta.totals.last_channel,
    },
  };
};

/**
 * A bucket's parties — `GET /reminders/due`, which applies the same
 * `balance > 0` predicate the summary counts with, so a tab reading "3" lists
 * exactly three (AC-2). Its own endpoint rather than the party list's
 * `collection=` chip: the party list is the one party source the client may
 * page through (§32.6.7).
 */
export const listDueParties = async (
  bucket: CollectionBucket,
  page: number,
  pageSize: number,
  signal?: AbortSignal
): Promise<DuePartyPage> => {
  const response = await api.get<{
    data: readonly {
      id: string;
      name: string;
      mobile: string | null;
      balance: string;
      collection_date: string | null;
    }[];
    meta: { page: number; page_size: number; total: number };
  }>(
    `${API_PATHS.REMINDERS_DUE}${toQueryString({
      bucket,
      page: page > 1 ? page : undefined,
      page_size: pageSize,
    })}`,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  const { data, meta } = response.data;
  return {
    rows: data.map((p) => ({
      id: p.id,
      name: p.name,
      mobile: p.mobile,
      balance: p.balance,
      collectionDate: p.collection_date,
    })),
    page: meta.page,
    pageSize: meta.page_size,
    total: meta.total,
  };
};

interface BucketWire {
  readonly count: number;
  readonly amount: string;
}

export const getCollectionSummary = async (signal?: AbortSignal): Promise<CollectionSummary> => {
  const response = await api.get<{
    data: { due_today: BucketWire; overdue: BucketWire; upcoming_7d: BucketWire; as_of: string };
  }>(API_PATHS.LEDGER_SUMMARY, ubConfig({ signal, suppressErrorSnackbar: true }));
  const { data } = response.data;
  return {
    dueToday: data.due_today,
    overdue: data.overdue,
    upcoming: data.upcoming_7d,
    asOf: data.as_of,
  };
};

export const previewReminder = async (
  partyId: string,
  signal?: AbortSignal
): Promise<ReminderPreview> => {
  const response = await api.post<{
    data: {
      party_id: string;
      balance: string;
      text: string;
      sms_text: string;
      has_mobile: boolean;
      has_upi: boolean;
      warnings: readonly WarningWire[];
    };
  }>(API_PATHS.REMINDER_PREVIEW, { party_id: partyId }, ubConfig({ signal }));
  const { data } = response.data;
  return {
    partyId: data.party_id,
    balance: data.balance,
    text: data.text,
    smsText: data.sms_text,
    hasMobile: data.has_mobile,
    hasUpi: data.has_upi,
    warnings: toWarnings(data.warnings),
  };
};

/** LED-06 FR-2 — create the scheduled row, then record the tap on it. */
export const createReminder = async (
  partyId: string,
  channel: ReminderChannel,
  note?: string
): Promise<Reminder> => {
  const response = await api.post<{ data: ReminderWire }>(API_PATHS.REMINDERS, {
    party_id: partyId,
    channel,
    ...(note ? { note } : {}),
  });
  return toReminder(response.data.data);
};

export const sendReminder = async (reminderId: string): Promise<void> => {
  await api.post(API_PATHS.REMINDER_SEND(reminderId));
};

export const markReminder = async (
  reminderId: string,
  status: 'done' | 'dismissed'
): Promise<Reminder> => {
  const response = await api.patch<{ data: ReminderWire }>(API_PATHS.REMINDER(reminderId), {
    status,
  });
  return toReminder(response.data.data);
};

export const bulkReminders = async (
  partyIds: readonly string[],
  channel: 'whatsapp_manual' | 'sms_manual'
): Promise<BulkReminderResult> => {
  const response = await api.post<{
    data: {
      items: readonly {
        party_id: string;
        party_name: string;
        reminder_id: string;
        balance: string;
        text: string;
        wa_url: string;
        sms_url: string;
      }[];
      skipped: readonly {
        party_id: string;
        reason: BulkReminderResult['skipped'][number]['reason'];
      }[];
    };
  }>(API_PATHS.REMINDERS_BULK, { party_ids: partyIds, channel });
  const { data } = response.data;
  return {
    items: data.items.map((i) => ({
      partyId: i.party_id,
      partyName: i.party_name,
      reminderId: i.reminder_id,
      balance: i.balance,
      text: i.text,
      waUrl: i.wa_url,
      smsUrl: i.sms_url,
    })),
    skipped: data.skipped.map((s) => ({ partyId: s.party_id, reason: s.reason })),
  };
};

interface SettingsWire {
  readonly auto_sms: boolean;
  readonly party_sms_on_entry: boolean;
  readonly sms_configured: boolean;
}

const toSettings = (data: SettingsWire): ReminderSettings => ({
  autoSms: data.auto_sms,
  partySmsOnEntry: data.party_sms_on_entry,
  smsConfigured: data.sms_configured,
});

export const getReminderSettings = async (signal?: AbortSignal): Promise<ReminderSettings> => {
  const response = await api.get<{ data: SettingsWire }>(
    API_PATHS.REMINDER_SETTINGS,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  return toSettings(response.data.data);
};

export const updateReminderSettings = async (
  patch: ReminderSettingsPatch
): Promise<ReminderSettings> => {
  const response = await api.patch<{ data: SettingsWire }>(API_PATHS.REMINDER_SETTINGS, {
    ...(patch.autoSms !== undefined ? { auto_sms: patch.autoSms } : {}),
    ...(patch.partySmsOnEntry !== undefined ? { party_sms_on_entry: patch.partySmsOnEntry } : {}),
  });
  return toSettings(response.data.data);
};
