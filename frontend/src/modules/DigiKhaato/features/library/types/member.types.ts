/**
 * F04 (LIB-04 §6) — members: the list row (`MemberSummary`, also the counter's),
 * the page (`MemberDetail`), the membership types a member is enrolled on, and
 * the forms that enrol, renew, suspend and close. Money is a decimal string.
 */
export const MEMBER_STATUSES = ['active', 'expiring', 'expired', 'suspended', 'closed'] as const;
export const MEMBER_ORDERINGS = ['name', 'member_number', 'valid_until', '-dues'] as const;

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
  readonly loansOpen: number;
  readonly loansOverdue: number;
  readonly holdsReady: number;
  readonly duesAmount: string;
  readonly deposit: {
    readonly id: string;
    readonly expected: string;
    readonly held: string;
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
}

export type MemberFilters = Readonly<{
  q: string;
  status: '' | MemberStatusFilter;
  type: string;
  group: string;
  hasDues: '' | 'true';
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
