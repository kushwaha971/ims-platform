/**
 * F06 (LIB-07 §6) — a library charge as the server answers it, and the
 * totals its list carries over the filtered set. Money is a decimal string.
 */
export const CHARGE_STATUSES = [
  'open',
  'part_paid',
  'paid',
  'waived',
  'refunded',
  'reversed',
] as const;
export const MANUAL_CHARGE_KINDS = ['processing', 'other'] as const;
export type ManualChargeKind = (typeof MANUAL_CHARGE_KINDS)[number];

export interface ChargeRow {
  readonly id: string;
  readonly membershipId: string;
  readonly partyId: string;
  readonly number: string;
  readonly kind: string;
  readonly amount: string;
  readonly chargeDate: string;
  readonly description: string;
  readonly fineDays: number | null;
  readonly amountPaid: string;
  readonly waivedAmount: string;
  readonly refundedAmount: string;
  readonly amountDue: string;
  readonly status: string;
  readonly reversedAt: string | null;
}

export interface ChargeTotals {
  readonly amount: string;
  readonly paid: string;
  readonly waived: string;
  readonly due: string;
}

export interface WaiveFormValues {
  amount: string;
  reason: string;
}

export interface ManualChargeFormValues {
  kind: ManualChargeKind;
  amount: string;
  description: string;
}
