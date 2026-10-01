/**
 * DUE-01 (FRD 00 DUE-01 §6) — the shapes the dues engine reads back. Shared by
 * every vertical that consumes the engine (lending, library, gym), so a due
 * reads alike in each module. Money is a 2-dp string, dates ISO, as on the wire.
 */

export type DueStatus = 'scheduled' | 'due' | 'overdue' | 'paid' | 'skipped' | 'cancelled';

export type ScheduleStatus = 'active' | 'paused' | 'ended' | 'cancelled';

export type DueComponentKind = 'principal' | 'interest' | 'fee' | 'charge';

export interface DueComponentAmount {
  readonly component: DueComponentKind;
  readonly amount: string;
}

/** A row of a schedule preview, and of the 409 `schedule_backdated_unconfirmed` details. */
export interface DuePreview {
  readonly seq: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly periodLabel: string;
  readonly dueOn: string;
  readonly amount: string;
  readonly status: 'scheduled' | 'skipped';
  /** Expectation mode only. */
  readonly components?: readonly DueComponentAmount[];
}

/** The 409's `details`: the dues that would be added now, and their total. */
export interface BackdatedConfirmation {
  readonly dues: readonly DuePreview[];
  readonly total: string;
}

export interface DueSubject {
  readonly type: string;
  readonly id: string;
  readonly label: string | null;
}

export interface DueParty {
  readonly id: string;
  readonly name: string;
}

/**
 * One due. No `lateFeeSoFar` yet: the engine sends it once DUE-04 can compute
 * it (C-12) — a figure that is always "0.00" would be a claim, not a number.
 */
export interface Due {
  readonly id: string;
  readonly scheduleId: string;
  readonly module: string;
  readonly subject: DueSubject;
  readonly party: DueParty | null;
  readonly seq: number;
  readonly periodLabel: string;
  readonly dueOn: string;
  readonly amount: string;
  readonly penaltyAmount: string;
  readonly waivedAmount: string;
  readonly settledAmount: string;
  readonly outstanding: string;
  readonly status: DueStatus;
  readonly paidOn: string | null;
  readonly document: { readonly id: string } | null;
}

export interface DuePause {
  readonly id: string;
  readonly fromOn: string;
  readonly toOn: string;
  readonly effect: 'shift' | 'skip';
  readonly reason: string;
  readonly resumedOn: string | null;
}

export interface Schedule {
  readonly id: string;
  readonly module: string;
  readonly plan: { readonly id: string; readonly name: string };
  readonly party: DueParty | null;
  readonly beneficiaryParty: DueParty | null;
  readonly subject: DueSubject;
  readonly status: ScheduleStatus;
  readonly startOn: string;
  readonly endOn: string | null;
  readonly amount: string | null;
  readonly graceDays: number;
  readonly version: number;
  readonly dues: readonly Due[];
  readonly pauses: readonly DuePause[];
}

export interface DueFilters {
  readonly partyId?: string;
  readonly module?: string;
  readonly status?: readonly DueStatus[];
  readonly dueFrom?: string;
  readonly dueTo?: string;
  readonly subjectType?: string;
  readonly subjectId?: string;
  readonly cursor?: string | null;
}

export interface DuesPage {
  readonly rows: readonly Due[];
  /** The server's figures over the FILTERED set — never re-summed from a page. */
  readonly totals: { readonly outstanding: string; readonly overdue: string };
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}
