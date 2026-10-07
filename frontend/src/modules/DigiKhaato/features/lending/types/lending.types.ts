/**
 * Lending & collections (FRD lending.md) — the shapes the screens read. Money
 * is a decimal string, dates are `YYYY-MM-DD`.
 */
export const PLAN_TYPES = ['fixed_daily', 'flat', 'reducing', 'interest_only', 'flexible'] as const;
export type PlanType = (typeof PLAN_TYPES)[number];
export type Frequency = 'daily' | 'weekly' | 'fortnightly' | 'monthly';
export const PAYMENT_MODES = ['cash', 'upi', 'bank', 'cheque'] as const;
export type LendingPaymentMode = (typeof PAYMENT_MODES)[number];
export type LoanStatus = 'active' | 'closed' | 'written_off' | 'cancelled';
export type VisitOutcome = 'not_paid' | 'not_home' | 'promised';

/** Which frequencies each plan collects at (FRD LEN-03 FR-1, plus flexible). */
export const PLAN_FREQUENCIES: Readonly<Record<PlanType, readonly Frequency[]>> = {
  fixed_daily: ['daily', 'weekly'],
  flat: ['weekly', 'fortnightly', 'monthly'],
  reducing: ['weekly', 'fortnightly', 'monthly'],
  interest_only: ['weekly', 'fortnightly', 'monthly'],
  flexible: ['monthly'],
};

export interface ScheduleRow {
  readonly seq: number;
  readonly dueOn: string;
  readonly amount: string;
  readonly principal: string;
  readonly interest: string;
}

export interface LoanPreview {
  readonly cashHandedOver: string;
  readonly deductionsTotal: string;
  readonly instalmentAmount: string;
  readonly totalInterest: string;
  readonly totalPayable: string;
  readonly maturityOn: string;
  readonly effectiveAnnualRate: string;
  readonly effectiveAnnualRateDisplay: string;
  readonly schedule: readonly ScheduleRow[];
  readonly warnings: readonly string[];
}

export interface LoanFigures {
  readonly dueToday: string;
  readonly arrears: string;
  readonly remaining: string;
  readonly collected: string;
  readonly daysPastDue: number;
  readonly nextDueOn: string | null;
  readonly nextDueAmount: string | null;
}

export interface LoanRow extends LoanFigures {
  readonly id: string;
  readonly number: string;
  readonly status: LoanStatus;
  readonly closeReason: string;
  readonly borrower: {
    readonly id: string;
    readonly number: string;
    readonly partyId: string;
    readonly name: string;
    readonly mobile: string | null;
    readonly area: string;
  };
  readonly route: { readonly id: string; readonly name: string } | null;
  readonly planType: PlanType;
  readonly frequency: Frequency;
  readonly principal: string;
  readonly rate: string;
  readonly rateUnit: 'per_month' | 'per_year';
  readonly instalmentCount: number;
  readonly instalmentAmount: string;
  readonly totalInterest: string;
  readonly totalPayable: string;
  readonly cashHandedOver: string;
  readonly effectiveAnnualRate: string;
  readonly disbursedOn: string;
  readonly maturityOn: string;
  readonly notes: string;
}

export interface LoanDue {
  readonly id: string;
  readonly seq: number;
  readonly dueOn: string;
  readonly amount: string;
  readonly settled: string;
  readonly outstanding: string;
  /** LEN-09 — late fees added, and everything waived, on this instalment. */
  readonly lateFee: string;
  readonly waived: string;
  readonly status: string;
}

/** Lending P0 — the letterhead a loan's papers carry: the lender's own, never ours. */
export interface LoanLender {
  readonly name: string;
  readonly legalName: string;
  readonly address: readonly string[];
  readonly phone: string;
  readonly gstin: string;
}

export interface LoanDetail extends LoanRow {
  readonly lender: LoanLender | null;
  readonly lateFee: LoanLateFeeRule;
  /** LEN-10 — why it was written off or cancelled; what a write-off would clear today
   * (null unless running); and whether money was collected (no Cancel then). */
  readonly statusReason: string;
  readonly writeOffAmount: string | null;
  readonly hasCollections: boolean;
  readonly closedOn: string | null;
  readonly deductions: readonly { kind: string; label: string; amount: string }[];
  readonly schedule: readonly LoanDue[];
}

export interface CollectionRow {
  readonly id: string;
  readonly collectedOn: string;
  readonly amount: string;
  readonly mode: string;
  readonly reference: string;
  readonly note: string;
  readonly receiptNumber: string;
  readonly voided: boolean;
}

export interface VisitRow {
  readonly onDate: string;
  readonly outcome: VisitOutcome;
  readonly reason: string;
  readonly promisedOn: string | null;
}

/** L03 — one message recorded for a loan: a reminder or a receipt (LEN-12). */
export interface LoanMessageRow {
  readonly id: string;
  readonly kind: LendingMessageKind;
  readonly subject: string;
  readonly channel: MessageChannel;
  /** Tenant-local ISO instant: the clock is read off the string. */
  readonly at: string | null;
}

export type LendingMessageKind = 'reminder' | 'receipt';
export type ReminderBucket = 'due_tomorrow' | 'due_today' | 'overdue';
export type MessageChannel = 'whatsapp_manual' | 'sms_manual' | 'call';

/** What the server prepared, and whether it may go now (LEN-12 §6). */
export interface PreparedLendingMessage {
  readonly kind: LendingMessageKind;
  readonly bucket: ReminderBucket | null;
  readonly text: string;
  readonly waUrl: string;
  readonly smsUrl: string;
  readonly telUrl: string;
  readonly recipient: { readonly name: string; readonly hasMobile: boolean };
  readonly allowed: boolean;
  readonly refusal: {
    readonly code: string;
    readonly message: string;
    readonly nextAllowedAt: string | null;
    readonly windowStart: string | null;
    readonly windowEnd: string | null;
  } | null;
  readonly lastToday: { readonly at: string; readonly channel: MessageChannel } | null;
  /** Seconds until `allowed` changes (the window, a minute early; or the next
   * allowed time). `null` when nothing will change it. */
  readonly changesInSeconds: number | null;
}

/** A row of `/lending/messages`: today's reminders and tomorrow's. */
export interface LendingReminderRow {
  readonly loanId: string;
  readonly number: string;
  readonly name: string;
  readonly area: string;
  readonly route: string | null;
  readonly bucket: ReminderBucket;
  readonly amount: string;
  /** The date the text names, already dd/mm/yyyy. */
  readonly date: string;
  readonly hasMobile: boolean;
  readonly sentToday: { readonly at: string; readonly channel: MessageChannel } | null;
}

export interface TodayStop {
  readonly loanId: string;
  readonly number: string;
  readonly name: string;
  readonly mobile: string | null;
  readonly area: string;
  readonly route: string | null;
  readonly seq: number;
  readonly frequency: Frequency;
  readonly instalmentAmount: string;
  readonly dueToday: string;
  readonly arrears: string;
  readonly daysPastDue: number;
  readonly collectedToday: string;
  readonly remaining: string;
  /** L03 — a reminder was recorded for this loan today. */
  readonly remindedToday: boolean;
  readonly visit: {
    readonly outcome: VisitOutcome;
    readonly reason: string;
    readonly promisedOn: string | null;
  } | null;
}

export interface TodayRound {
  readonly on: string;
  readonly stops: readonly TodayStop[];
  readonly due: string;
  readonly collected: string;
  readonly short: string;
  readonly stopsCount: number;
  readonly done: number;
}

export interface CollectionPreview {
  readonly amount: string;
  readonly remainingAfter: string;
  readonly clears: readonly {
    readonly seq: number;
    readonly dueOn: string;
    readonly amount: string;
    readonly when: 'missed' | 'today' | 'ahead';
  }[];
}

export interface LendingRoute {
  readonly id: string;
  readonly name: string;
  readonly agent: { readonly id: string; readonly name: string } | null;
  readonly isActive: boolean;
  readonly loans: number | null;
  readonly version: number;
}

export interface BorrowerRow {
  readonly id: string;
  readonly number: string;
  readonly partyId: string;
  readonly name: string;
  readonly mobile: string | null;
  readonly area: string;
  readonly route: { readonly id: string; readonly name: string } | null;
}

export interface LoanFormValues {
  borrowerMode: 'new' | 'existing';
  borrowerId: string;
  borrowerName: string;
  name: string;
  mobile: string;
  area: string;
  routeId: string;
  planType: PlanType;
  principal: string;
  fileCharge: string;
  rate: string;
  rateUnit: 'per_month' | 'per_year';
  frequency: Frequency;
  instalmentCount: string;
  perInstalmentAmount: string;
  disbursedOn: string;
  firstDueOn: string;
  collectionWeekdays: number;
  paymentMode: LendingPaymentMode;
  notes: string;
  /** LEN-09 — the late-fee rule agreed with the borrower; `none` unless they agreed. */
  lateFeeKind: LateFeeKind;
  lateFeeValue: string;
  lateFeeCap: string;
  lateFeeGraceDays: string;
}

export type LateFeeKind = 'none' | 'flat_once' | 'per_day' | 'simple_interest';
export const LATE_FEE_KINDS: readonly LateFeeKind[] = [
  'none',
  'flat_once',
  'per_day',
  'simple_interest',
];

export interface LoanLateFeeRule {
  readonly kind: LateFeeKind;
  readonly value: string | null;
  readonly cap: string | null;
  readonly graceDays: number;
}

/** LEN-09 — one instalment's late-fee suggestion and what each part can still forgive. */
export interface LoanDueFigures {
  readonly dueId: string;
  readonly seq: number;
  readonly status: string;
  readonly lateFee: {
    readonly rule: LateFeeKind;
    readonly daysLate: number;
    readonly ruleAmount: string;
    readonly alreadyCharged: string;
    readonly suggested: string;
  } | null;
  readonly waivable: {
    readonly interest: string;
    readonly fee: string;
    readonly principal: string;
  };
}

export interface CollectFormValues {
  amount: string;
  mode: LendingPaymentMode;
  reference: string;
  note: string;
}
