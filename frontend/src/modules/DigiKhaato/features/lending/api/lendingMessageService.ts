import { api, ubConfig } from 'src/api/AxiosInstances';

import { LENDING_PATHS } from './lendingPaths';

import type {
  LendingMessageKind,
  LendingReminderRow,
  MessageChannel,
  PreparedLendingMessage,
} from '../types/lending.types';

/** L03 — prepare, record and list a lender's WhatsApp messages (LEN-12). */
type Wire = Readonly<Record<string, unknown>>;

const str = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value);
const strOrNull = (value: unknown): string | null =>
  value === null || value === undefined || value === '' ? null : String(value);

const sent = (raw: unknown): { at: string; channel: MessageChannel } | null => {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Wire;
  return { at: str(row.at), channel: str(row.channel) as MessageChannel };
};

const toPrepared = (row: Wire): PreparedLendingMessage => {
  const recipient = (row.recipient ?? {}) as Wire;
  const refusal = row.refusal as Wire | null;
  return {
    kind: str(row.kind) as LendingMessageKind,
    bucket: strOrNull(row.bucket) as PreparedLendingMessage['bucket'],
    text: str(row.text),
    waUrl: str(row.wa_url),
    smsUrl: str(row.sms_url),
    telUrl: str(row.tel_url),
    recipient: { name: str(recipient.name), hasMobile: Boolean(recipient.has_mobile) },
    allowed: Boolean(row.allowed),
    refusal: refusal
      ? {
          code: str(refusal.code),
          message: str(refusal.message),
          nextAllowedAt: strOrNull(refusal.next_allowed_at),
          windowStart: strOrNull(refusal.window_start),
          windowEnd: strOrNull(refusal.window_end),
        }
      : null,
    lastToday: sent(row.last_today),
    changesInSeconds:
      row.changes_in_seconds === null || row.changes_in_seconds === undefined
        ? null
        : Number(row.changes_in_seconds),
  };
};

const query = (collectionId?: string): string =>
  collectionId ? `?collection=${encodeURIComponent(collectionId)}` : '';

/** The text, the links and whether it may go now; records nothing. */
export const prepareMessage = async (
  loanId: string,
  kind: LendingMessageKind,
  collectionId?: string,
  signal?: AbortSignal,
  text?: string
): Promise<PreparedLendingMessage> => {
  const response =
    text === undefined
      ? await api.get<{ data: Wire }>(
          `${LENDING_PATHS.MESSAGE(loanId, kind)}${query(collectionId)}`,
          ubConfig({ signal, suppressErrorSnackbar: true })
        )
      : await api.post<{ data: Wire }>(
          `${LENDING_PATHS.MESSAGE(loanId, kind)}/preview`,
          { text, ...(collectionId ? { collection: collectionId } : {}) },
          ubConfig({ signal, suppressErrorSnackbar: true })
        );
  return toPrepared(response.data.data);
};

/** The tap that opened WhatsApp, the SMS app or the dialler: recorded like a reminder. */
export const recordMessage = async (
  loanId: string,
  kind: LendingMessageKind,
  channel: MessageChannel,
  collectionId?: string,
  text?: string
): Promise<void> => {
  await api.post(
    LENDING_PATHS.MESSAGE(loanId, kind),
    {
      channel,
      ...(collectionId ? { collection: collectionId } : {}),
      ...(text !== undefined ? { text } : {}),
    },
    ubConfig({ suppressErrorSnackbar: true })
  );
};

export const listReminders = async (signal?: AbortSignal): Promise<LendingReminderRow[]> => {
  const response = await api.get<{ data: readonly Wire[] }>(LENDING_PATHS.REMINDERS, { signal });
  return response.data.data.map((row) => ({
    loanId: str(row.loan_id),
    number: str(row.number),
    name: str(row.name),
    area: str(row.area),
    route: strOrNull(row.route),
    bucket: str(row.bucket) as LendingReminderRow['bucket'],
    amount: str(row.amount || '0.00'),
    date: str(row.date),
    hasMobile: Boolean(row.has_mobile),
    sentToday: sent(row.sent_today),
  }));
};
