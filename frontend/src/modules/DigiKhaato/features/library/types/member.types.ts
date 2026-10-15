import type { PaymentLineForm } from 'modules/DigiKhaato/features/payments/types/payment.types';
/**
 * F04 (LIB-04 §6) — members: the list row (`MemberSummary`, also the counter's),
 * the page (`MemberDetail`), the membership types a member is enrolled on, and
 * the forms that enrol, renew, suspend and close. Money is a decimal string.
 */
export const MEMBER_STATUSES = ['active', 'expiring', 'expired', 'suspended', 'closed'] as const;
export const MEMBER_ORDERINGS = ['name', 'member_number', 'valid_until', '-dues', 'seat'] as const;

/**
 * W02 — the fee in one word, worst first: the plan ran out (`overdue`), a fee
 * is charged and nothing paid (`unpaid`) or some of it (`part_paid`), the plan
 * ends within a week (`due_soon`), all clear (`paid`), the plan costs nothing
 * (`no_fee`), suspended (`on_hold`), or the student has left. QA B26: a ₹0 plan
 * read "Paid" with no payment behind it.
 */
export const FEE_STATES = [
  'overdue',
  'unpaid',
  'part_paid',
  'due_soon',
  'paid',
  'no_fee',
  'on_hold',
  'left',
] as const;
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
  readonly mobile?: string | null;
  readonly locationLabel?: string;
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
  readonly active?: number;
  readonly expired?: number;
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
  /** Collect the fees and the deposit now; otherwise they are owed. */
  collectNow: boolean;
  /**
   * QA F2 — what is paid now and how: the payment editor's lines (every mode Take
   * fee offers, split across up to four). Less than the fees leaves the rest owed;
   * more is kept as the student's advance.
   */
  lines: PaymentLineForm[];
  /**
   * QA F1 — a student who already studies here, moved from the paper register: no
   * fee today and no money recorded today. Their real dates, a deposit they handed
   * over long ago, and any dues they still owe come in as what they are.
   */
  existingStudent: boolean;
  startsOn: string;
  validUntil: string;
  depositHeld: string;
  oldDuesAmount: string;
  oldDuesOn: string;
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
  startsOn: string;
  validUntil: string;
  notes: string;
}

/** QA B4 — the "Take deposit" dialog. */
export interface DepositFormValues {
  amount: string;
  paymentMode: 'cash' | 'upi';
}
