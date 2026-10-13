/**
 * W06 — a reading room's WhatsApp messages, handled like reminders. QA F4 / B51
 * added the three a desk sends to ANY student, paid or not: the plan's end date,
 * thanks for renewing, and a message in the desk's own words.
 */
export const MESSAGE_KINDS = ['fee', 'plan_end', 'thanks', 'welcome', 'receipt', 'custom'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

/** What can go to a group, and which group (`POST /library/messages/bulk`). */
export const BULK_KINDS = ['fee', 'plan_end', 'custom'] as const;
export type BulkKind = (typeof BULK_KINDS)[number];
export const AUDIENCES = ['unpaid', 'ending', 'shift', 'all'] as const;
export type Audience = (typeof AUDIENCES)[number];

/** The per-student words a custom message may carry; the server fills them in. */
export const PERSONAL_TOKENS = ['{name}', '{amount}', '{due_date}', '{upi_link}'] as const;
/** Same limit as the server's `CUSTOM_MAX`. */
export const CUSTOM_MESSAGE_MAX = 700;

/** One student's prepared message in a group. */
export interface BulkMessageRow extends PreparedMessage {
  readonly membershipId: string;
  readonly name: string;
  readonly memberNumber: string;
}

export interface BulkMessageRequest {
  readonly kind: BulkKind;
  readonly audience: Audience;
  readonly shiftId?: string;
  readonly text?: string;
}

/** One line of a student's message log (`GET /library/members/<id>/messages`). */
export interface MessageLogRow {
  readonly id: string;
  /** A `MessageKind`, or `message` for a notice recorded before QA F4. */
  readonly kind: string;
  readonly sentAt: string | null;
  readonly to: string;
  readonly text: string;
}

/** The custom message form (and the group form, which adds who gets it). */
export interface CustomMessageFormValues {
  text: string;
}

export interface BulkMessageFormValues {
  kind: BulkKind;
  audience: Audience;
  shiftId: string;
  text: string;
}

export interface PreparedMessage {
  readonly kind: MessageKind;
  readonly text: string;
  readonly waUrl: string;
  readonly recipient: {
    readonly name: string;
    readonly isGuardian: boolean;
    readonly hasMobile: boolean;
  };
}

/** One student on today's fee schedule (`GET /library/fee-reminders`). */
export interface FeeReminderRow {
  readonly membershipId: string;
  readonly name: string;
  readonly memberNumber: string;
  readonly seat: string | null;
  readonly kind: 'due' | 'overdue';
  readonly endsOn: string | null;
  readonly amount: string;
  readonly hasMobile: boolean;
  readonly sentToday: boolean;
}
