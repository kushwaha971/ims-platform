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
