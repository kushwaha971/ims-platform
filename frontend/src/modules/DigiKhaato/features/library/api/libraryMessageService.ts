import { api, ubConfig } from 'src/api/AxiosInstances';

import { LIBRARY_PATHS } from './libraryPaths';

import type { FeeReminderRow, MessageKind, PreparedMessage } from '../types/message.types';

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

/** The text and the link; records nothing. A refusal is said in the dialog. */
export const prepareMessage = async (
  membershipId: string,
  kind: MessageKind,
  signal?: AbortSignal
): Promise<PreparedMessage> => {
  const response = await api.get<{ data: Wire }>(
    LIBRARY_PATHS.MEMBER_MESSAGE(membershipId, kind),
    ubConfig({ signal, suppressErrorSnackbar: true })
  );
  return toPrepared(kind, response.data.data);
};

/** The tap that opens WhatsApp: recorded like a reminder. */
export const recordMessage = async (membershipId: string, kind: MessageKind): Promise<void> => {
  await api.post(
    LIBRARY_PATHS.MEMBER_MESSAGE(membershipId, kind),
    { channel: 'whatsapp_manual' },
    ubConfig({ suppressErrorSnackbar: true })
  );
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
