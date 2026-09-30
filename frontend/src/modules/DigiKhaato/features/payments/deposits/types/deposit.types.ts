import type { PaymentMode, UpiApp } from 'src/types/domain.types';

/**
 * A4b — held deposits on the client (FRD 00 PLT-X02 §6). Money is a decimal
 * STRING all the way through (R-TS-7), as in the rest of payments.
 */
export type DepositStatus = 'expected' | 'held' | 'released';

export interface Deposit {
  readonly id: string;
  readonly party: { readonly id: string; readonly name: string };
  readonly module: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly purpose: string;
  readonly expectedAmount: string;
  readonly receivedAmount: string;
  readonly appliedAmount: string;
  readonly refundedAmount: string;
  readonly heldAmount: string;
  readonly status: DepositStatus;
  readonly note: string;
  readonly version: number;
  readonly createdAt: string;
}

export interface DepositPaymentRow {
  readonly id: string;
  readonly number: string;
  readonly paymentDate: string;
  readonly amount: string;
  readonly primaryMode: string;
  readonly status: 'recorded' | 'void';
  /** R37 — money received before go-live; printed "Opening deposit". */
  readonly opening: boolean;
}

export interface DepositApplicationRow {
  readonly id: string;
  readonly amount: string;
  readonly reason: string;
  readonly createdAt: string;
  readonly voidedAt: string | null;
  readonly refundPayment: { readonly id: string; readonly number: string };
  readonly settlePayment: { readonly id: string; readonly number: string };
}

export interface DepositDetail extends Deposit {
  readonly receipts: readonly DepositPaymentRow[];
  readonly applications: readonly DepositApplicationRow[];
  readonly refunds: readonly DepositPaymentRow[];
}

/**
 * What a deposit may be adjusted against. The VERTICAL supplies these (its own
 * charges, and the invoices of its module): the core never decides which of a
 * party's documents a deposit may pay (FRD 00 PLT-X02 §8).
 */
export interface DepositCharge {
  readonly documentType: string;
  readonly documentId: string;
  readonly number: string;
  readonly due: string;
}

export interface DepositMoneyFormValues {
  amount: string;
  mode: PaymentMode | '';
  upiApp: UpiApp | '';
  reference: string;
  /** Required for a return; not asked for a receipt. */
  reason: string;
}

export interface ApplyDepositRowForm {
  documentType: string;
  documentId: string;
  number: string;
  due: string;
  amount: string;
}

export interface ApplyDepositFormValues {
  rows: ApplyDepositRowForm[];
  reason: string;
}

export interface DepositWriteResult {
  readonly deposit: DepositDetail;
  /** The payment the write recorded (for apply, the IN half that settled the charges). */
  readonly paymentNumber: string;
}
