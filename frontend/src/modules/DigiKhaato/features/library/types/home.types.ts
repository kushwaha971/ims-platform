import type { FeeState } from './member.types';

/** W04 — a reading room's home (`GET /library/home`, its `study` block). */
export interface StudyShift {
  readonly id: string;
  readonly name: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly filled: number;
}

export interface StudyToPay {
  readonly membershipId: string;
  readonly name: string;
  readonly memberNumber: string;
  readonly seat: string | null;
  readonly shift: string | null;
  readonly plan: string;
  readonly planFee: string;
  readonly validUntil: string | null;
  readonly duesAmount: string;
  readonly feeState: FeeState;
}

export interface StudyHome {
  readonly seats: number;
  readonly students: number;
  readonly shifts: readonly StudyShift[];
  readonly fees: {
    readonly dueThisWeek: number;
    readonly overdue: number;
    readonly unpaid: number;
    readonly collectedThisMonth: string;
  };
  readonly toPay: readonly StudyToPay[];
}

export interface LibraryHome {
  /** Absent for a reader without `library.member.read`: the figures carry money. */
  readonly study: StudyHome | null;
  readonly quickActions: readonly string[];
}

/**
 * The Fees board (`GET /library/fees/board`; approved designs, 12 Oct 2026):
 * Not paid — each student with what they owe and the oldest open charge Take
 * fee settles — then Paid this month.
 */
export interface FeesBoardUnpaid {
  readonly membershipId: string;
  readonly partyId: string;
  readonly name: string;
  readonly plan: string;
  /** The date of their oldest unpaid charge. */
  readonly since: string;
  readonly owes: string;
  readonly charge: { readonly id: string; readonly number: string; readonly amountDue: string };
}

export interface FeesBoardPaid {
  readonly paymentId: string;
  readonly on: string;
  readonly mode: string;
  readonly amount: string;
  readonly name: string;
  readonly membershipId: string;
}

export interface FeesBoard {
  readonly students: number;
  readonly toCollect: string;
  readonly collectedThisMonth: string;
  readonly notPaid: readonly FeesBoardUnpaid[];
  readonly paid: readonly FeesBoardPaid[];
}
