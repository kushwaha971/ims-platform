import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import type {
  ModuleReminderRow,
  ReminderChannel,
  ReminderSourceRef,
  SourceReminderPreview,
} from '../types/reminder.types';

/**
 * A7 (PLT-X06 §6) — the reminder endpoints for one module RECORD. The client
 * names the record and nothing else: the party, the recipient and the amount are
 * the server's current answer, so a stale screen can never send yesterday's
 * figure. Kept apart from `reminderService` so the shop's reminders screen does
 * not carry it until a module tab is opened.
 */

interface ModuleRowWire {
  readonly party: { readonly id: string; readonly name: string };
  readonly recipient: { readonly id: string; readonly name: string } | null;
  readonly source_type: string;
  readonly source_id: string;
  readonly subject_label: string;
  readonly due_on: string;
  readonly amount: string | null;
  readonly bucket: ModuleReminderRow['bucket'];
  readonly allowed: boolean;
  readonly next_allowed_at: string | null;
}

/** `GET /reminders/due?module=` — the module's candidates with `allowed`. */
export const listModuleReminders = async (
  module: string,
  signal?: AbortSignal
): Promise<readonly ModuleReminderRow[]> => {
  const response = await api.get<{ readonly data: readonly ModuleRowWire[] }>(
    `${API_PATHS.REMINDERS_DUE}${toQueryString({ module, page_size: 100 })}`,
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  return response.data.data.map((row) => ({
    party: row.party,
    recipient: row.recipient,
    sourceType: row.source_type,
    sourceId: row.source_id,
    subjectLabel: row.subject_label,
    dueOn: row.due_on,
    amount: row.amount,
    bucket: row.bucket,
    allowed: row.allowed,
    nextAllowedAt: row.next_allowed_at,
  }));
};

/** `POST /reminders/preview` with a source — writes nothing, always allowed. */
export const previewSourceReminder = async (
  source: ReminderSourceRef,
  signal?: AbortSignal
): Promise<SourceReminderPreview> => {
  const response = await api.post<{
    readonly data: {
      readonly source_id: string;
      readonly text: string;
      readonly sms_text: string;
      readonly mobile: string | null;
      readonly recipient: { readonly id: string; readonly name: string } | null;
      readonly subject_label: string;
      readonly fixed_text: boolean;
      readonly allowed: boolean;
      readonly next_allowed_at: string | null;
    };
  }>(
    API_PATHS.REMINDER_PREVIEW,
    { source_type: source.sourceType, source_id: source.sourceId },
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  const data = response.data.data;
  return {
    sourceId: data.source_id,
    text: data.text,
    smsText: data.sms_text,
    mobile: data.mobile,
    recipient: data.recipient,
    subjectLabel: data.subject_label,
    fixedText: data.fixed_text,
    allowed: data.allowed,
    nextAllowedAt: data.next_allowed_at,
  };
};

/**
 * Record the tap: create the row about the record, then mark it sent. The two
 * calls are the shop path's two calls; the policy is checked by both, so a tap
 * after the window closes records nothing (409 through the global snackbar).
 */
export const sendSourceReminder = async (
  source: ReminderSourceRef,
  channel: Extract<ReminderChannel, 'whatsapp_manual' | 'sms_manual' | 'call'>
): Promise<string> => {
  const created = await api.post<{ readonly data: { readonly id: string } }>(API_PATHS.REMINDERS, {
    source_type: source.sourceType,
    source_id: source.sourceId,
    channel,
  });
  await api.post(API_PATHS.REMINDER_SEND(created.data.data.id));
  return source.sourceId;
};
