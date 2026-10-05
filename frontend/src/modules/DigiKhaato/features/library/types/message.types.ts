/** W06 — a reading room's WhatsApp messages, handled like reminders. */
export const MESSAGE_KINDS = ['fee', 'welcome', 'receipt'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

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
