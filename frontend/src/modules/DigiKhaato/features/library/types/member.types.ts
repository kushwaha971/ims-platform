/**
 * F04 (LIB-04 §6) — members: the list row (`MemberSummary`, also the counter's),
 * the page (`MemberDetail`), the membership types a member is enrolled on, and
 * the forms that enrol, renew, suspend and close. Money is a decimal string.
 */
export const MEMBER_STATUSES = ['active', 'expiring', 'expired', 'suspended', 'closed'] as const;
export const MEMBER_ORDERINGS = ['name', 'member_number', 'valid_until', '-dues', 'seat'] as const;

/**
 * W02 — the fee in one word, worst first: the plan ran out (`overdue`), a fee
 * is charged and not paid (`unpaid`), the plan ends within a week
 * (`due_soon`), all clear (`paid`), or the student has left.
 */
export const FEE_STATES = ['overdue', 'unpaid', 'due_soon', 'paid', 'left'] as const;
export type FeeState = (typeof FEE_STATES)[number];

export interface SeatRef {
  readonly id: string;
  readonly label: string;
  readonly zone: string;
}

export interface ShiftRef {
  readonly id: string;
  readonly name: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

export type MemberStatusFilter = (typeof MEMBER_STATUSES)[number];
export type EffectiveStatus = 'active' | 'expired' | 'suspended' | 'closed';

export interface MemberBlock {
  readonly code: string;
  readonly overridable: boolean;
  readonly params: Readonly<Record<string, string>>;
}

export interface MemberSummary {
  readonly membershipId: string;
  readonly partyId: string;
  readonly name: string;
  readonly memberNumber: string;
  readonly type: { readonly id: string; readonly name: string; readonly maxCopies: number };
  readonly status: string;
  readonly effectiveStatus: EffectiveStatus;
  readonly startsOn: string;
  readonly validUntil: string | null;
  readonly groupLabel: string;
  readonly shift: ShiftRef | null;
  readonly seat: SeatRef | null;
  readonly lockerLabel: string;
  readonly planFee: string;
  readonly validityMonths: number | null;
  readonly feeState: FeeState;
  readonly loansOpen: number;
  readonly loansOverdue: number;
  readonly holdsReady: number;
  readonly duesAmount: string;
  readonly deposit: {
    readonly id: string;
    readonly expected: string;
    readonly held: string;
    /** QA B4 — still to take: owed, but never fee dues or income. */
    readonly due: string;
  } | null;
  readonly blocks: readonly MemberBlock[];
}

export interface MemberCharge {
  readonly id: string;
  readonly number: string;
  readonly kind: string;
  readonly amount: string;
  readonly amountDue: string;
  readonly chargeDate: string;
  readonly description: string;
}

export interface MemberPeriod {
  readonly kind: string;
  readonly startsOn: string;
  readonly validUntil: string | null;
  readonly reason: string;
  readonly onDate: string;
}

export interface MemberDetail extends MemberSummary {
  readonly party: { readonly id: string; readonly name: string; readonly mobile: string | null };
  readonly guardian: { readonly partyId: string; readonly name: string } | null;
  readonly suspendedUntil: string | null;
  readonly suspensionReason: string;
  readonly closedOn: string | null;
  readonly closedReason: string;
  readonly notes: string;
  readonly periods: readonly MemberPeriod[];
  readonly chargesOpen: readonly MemberCharge[];
  readonly version: number;
}

export interface MembershipType {
  readonly id: string;
  readonly name: string;
  readonly maxCopies: number;
  readonly loanDays: number;
  readonly feeAmount: string;
  readonly admissionFee: string;
  readonly depositAmount: string;
  readonly validityMonths: number | null;
  readonly isActive: boolean;
  readonly version: number;
}

export type MemberFilters = Readonly<{
  q: string;
  status: '' | MemberStatusFilter;
  type: string;
  group: string;
  hasDues: '' | 'true';
  shift: string;
  ordering: '' | (typeof MEMBER_ORDERINGS)[number];
  page: string;
}>;

export interface MemberTotals {
  readonly members: number;
  readonly dues: string;
  readonly depositsHeld: string;
}

export interface EnrolFormValues {
  partyMode: 'existing' | 'new';
  partyId: string;
  partyName: string;
  name: string;
  mobile: string;
  membershipTypeId: string;
  memberNumber: string;
  groupLabel: string;
  guardianName: string;
  guardianMobile: string;
  shiftId: string;
  seatId: string;
  lockerLabel: string;
  /** How the money collected now was paid: cash or UPI at a reading-room desk. */
  paymentMode: 'cash' | 'upi';
  /** Collect the fees and the deposit now, in cash; otherwise they are owed. */
  collectNow: boolean;
}

export interface ReasonFormValues {
  reason: string;
  until: string;
}

export interface CloseFormValues {
  reason: string;
  applyToDues: boolean;
}

/**
 * The student's own record, as the owner or an admin edits it (12 Oct 2026).
 * `validUntil` is `''` for "no end date". Name and mobile are the linked
 * party's and are edited on the customer page, not here.
 */
export interface MemberEditFormValues {
  memberNumber: string;
  groupLabel: string;
  validUntil: string;
  notes: string;
}

/** QA B4 — the "Take deposit" dialog. */
export interface DepositFormValues {
  amount: string;
  paymentMode: 'cash' | 'upi';
}
