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
  readonly status: string;
}

export interface LoanDetail extends LoanRow {
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
}

export interface CollectFormValues {
  amount: string;
  mode: LendingPaymentMode;
  reference: string;
  note: string;
}
