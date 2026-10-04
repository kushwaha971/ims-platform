import type { MemberSummary } from './member.types';

/**
 * F05 (LIB-06 §6, §7) — the counter: a loan as the server answers it
 * (`LoanRow`), the member panel (summary + open loans), the scan queue and the
 * session rows the desk reads back.
 */
export const COUNTER_MODES = ['issue', 'return', 'renew'] as const;
export type CounterMode = (typeof COUNTER_MODES)[number];

export interface LoanRow {
  readonly id: string;
  readonly copy: {
    readonly id: string;
    readonly accessionNumber: string;
    readonly title: string;
    readonly authors: string;
  };
  readonly membership: {
    readonly id: string;
    readonly memberNumber: string;
    readonly name: string;
    readonly groupLabel: string;
  };
  readonly issuedOn: string;
  readonly dueOn: string;
  readonly returnedOn: string | null;
  readonly status: string;
  readonly renewCount: number;
  readonly maxRenewals: number;
  readonly daysOverdue: number;
  readonly fineSoFar: string;
  readonly overrideReason: string;
}

export interface CounterMember extends MemberSummary {
  readonly loans: readonly LoanRow[];
}

export interface HoldReady {
  readonly memberName: string;
  readonly memberNumber: string;
  readonly collectBy: string | null;
}

export type CounterRowKind =
  'issued' | 'returned' | 'renewed' | 'undone' | 'refused' | 'unknown' | 'failed' | 'info';

/** One line of the desk's session list (FR-13), newest first. */
export interface CounterRow {
  readonly id: string;
  readonly kind: CounterRowKind;
  readonly code: string;
  readonly at: string;
  readonly title?: string;
  readonly accessionNumber?: string;
  readonly memberName?: string;
  readonly dueOn?: string;
  readonly loanId?: string;
  readonly issuedOn?: string;
  readonly daysLate?: number;
  readonly fine?: string;
  readonly holdReady?: HoldReady | null;
  readonly override?: boolean;
  /** A refusal's message id and params, already decided by the server's code. */
  readonly messageId?: string;
  readonly messageParams?: Readonly<Record<string, string | number>>;
}

/** A scan waiting its turn (FR-14): one at a time, each with its own idempotency key. */
export interface QueueItem {
  readonly key: string;
  readonly code: string;
  readonly mode: CounterMode;
  readonly membershipId: string | null;
  readonly overrideReason?: string;
  /** Set by the "Already with …" prompt: act on this copy in that mode. */
  readonly copyId?: string;
}

export type CounterPrompt =
  | {
      readonly kind: 'override';
      readonly code: string;
      readonly copyId: string | null;
      readonly blocks: readonly { code: string; params: Record<string, string> }[];
    }
  | {
      readonly kind: 'alreadyWith';
      readonly code: string;
      readonly copyId: string;
      readonly title: string;
    };
