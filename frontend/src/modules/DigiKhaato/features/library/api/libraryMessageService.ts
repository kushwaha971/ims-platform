import { api, ubConfig } from 'src/api/AxiosInstances';

import { LIBRARY_PATHS } from './libraryPaths';

import type {
  BulkMessageRequest,
  BulkMessageRow,
  FeeReminderRow,
  MessageKind,
  MessageLogRow,
  PreparedMessage,
} from '../types/message.types';

/** W06 — prepare, record and list the reading room's WhatsApp messages. */
type Wire = Readonly<Record<string, unknown>>;

const str = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value);

const toPrepared = (kind: MessageKind, row: Wire): PreparedMessage => {
  const recipient = (row.recipient ?? {}) as Wire;
  return {
    kind,
    text: str(row.text),
    waUrl: str(row.wa_url),
    recipient: {
      name: str(recipient.name),
      isGuardian: Boolean(recipient.is_guardian),
      hasMobile: Boolean(recipient.has_mobile),
    },
  };
};

/** The text and the link; records nothing. A refusal is said in the dialog. A custom
 *  message sends its words, which the server personalises and signs. */
export const prepareMessage = async (
  membershipId: string,
  kind: MessageKind,
  signal?: AbortSignal,
  text?: string
): Promise<PreparedMessage> => {
  const response = await api.get<{ data: Wire }>(
    LIBRARY_PATHS.MEMBER_MESSAGE(membershipId, kind),
    ubConfig({ signal, suppressErrorSnackbar: true, params: text ? { text } : undefined })
  );
  return toPrepared(kind, response.data.data);
};

/** The tap that opens WhatsApp: recorded like a reminder. The server builds the text
 *  again, so a fee paid since it was prepared is not asked for (QA F4). */
export const recordMessage = async (
  membershipId: string,
  kind: MessageKind,
  text?: string
): Promise<void> => {
  await api.post(
    LIBRARY_PATHS.MEMBER_MESSAGE(membershipId, kind),
    { channel: 'whatsapp_manual', ...(text ? { text } : {}) },
    ubConfig({ suppressErrorSnackbar: true })
  );
};

/** QA F4 / B51 — one prepared message per student in a group; records nothing. */
export const prepareBulk = async (
  request: BulkMessageRequest,
  signal?: AbortSignal
): Promise<BulkMessageRow[]> => {
  const response = await api.post<{ data: readonly Wire[] }>(
    LIBRARY_PATHS.BULK_MESSAGES,
    {
      kind: request.kind,
      audience: request.audience,
      ...(request.audience === 'shift' ? { shift_id: request.shiftId } : {}),
      ...(request.kind === 'custom' ? { text: request.text } : {}),
    },
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  return response.data.data.map((row) => ({
    ...toPrepared(request.kind, row),
    membershipId: str(row.membership_id),
    name: str(row.name),
    memberNumber: str(row.member_number),
  }));
};

/** What this student was sent, newest first. */
export const listMessageLog = async (
  membershipId: string,
  signal?: AbortSignal
): Promise<MessageLogRow[]> => {
  const response = await api.get<{ data: readonly Wire[] }>(
    LIBRARY_PATHS.MEMBER_MESSAGES(membershipId),
    { signal }
  );
  return response.data.data.map((row) => ({
    id: str(row.id),
    kind: str(row.kind),
    sentAt: row.sent_at ? str(row.sent_at) : null,
    to: str(row.to),
    text: str(row.text),
  }));
};

export const listFeeReminders = async (signal?: AbortSignal): Promise<FeeReminderRow[]> => {
  const response = await api.get<{ data: readonly Wire[] }>(LIBRARY_PATHS.FEE_REMINDERS, {
    signal,
  });
  return response.data.data.map((row) => ({
    membershipId: str(row.membership_id),
    name: str(row.name),
    memberNumber: str(row.member_number),
    seat: row.seat ? str(row.seat) : null,
    kind: str(row.kind) as FeeReminderRow['kind'],
    endsOn: row.ends_on ? str(row.ends_on) : null,
    amount: str(row.amount || '0.00'),
    hasMobile: Boolean(row.has_mobile),
    sentToday: Boolean(row.sent_today),
  }));
};
