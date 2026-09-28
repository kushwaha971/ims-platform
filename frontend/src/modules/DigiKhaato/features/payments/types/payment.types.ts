import type { PaymentMode, UpiApp } from 'src/types/domain.types';

/**
 * PAY-01 … PAY-05 domain shapes, camelCase. Money is a decimal STRING all the
 * way through (R-TS-7) — there is no `Number(amount)` anywhere in this feature.
 */

export type PaymentDirection = 'in' | 'out';
export type PaymentStatus = 'recorded' | 'void';

export interface PaymentPerson {
  readonly id: string;
  readonly name: string;
}

export interface PaymentParty extends PaymentPerson {
  readonly mobile: string | null;
}

/** One `mode_breakup` line (PAY-02). */
export interface PaymentModeLine {
  readonly mode: PaymentMode;
  readonly amount: string;
  readonly reference: string;
  readonly upiApp: UpiApp | null;
}

export interface PaymentAllocation {
  readonly documentType: string;
  readonly documentId: string;
  readonly number: string | null;
  readonly kind: string | null;
  readonly documentDate: string | null;
  /** The bill's CURRENT status and due (PAY-04 BR-1), not as of the payment. */
  readonly status: string | null;
  readonly amountDue: string | null;
  readonly amount: string;
}

export interface PaymentBusiness {
  readonly name: string;
  readonly legalName: string | null;
  readonly gstin: string | null;
  readonly phone: string | null;
  readonly address: Readonly<Record<string, string>>;
  readonly upiVpa: string | null;
}

/** A row of the list. */
export interface PaymentRow {
  readonly id: string;
  readonly number: string;
  readonly direction: PaymentDirection;
  readonly party: PaymentParty | null;
  readonly paymentDate: string;
  readonly amount: string;
  readonly primaryMode: PaymentMode;
  readonly modesCount: number;
  readonly reference: string;
  readonly status: PaymentStatus;
  readonly unallocatedAmount: string;
  readonly allocatedAmount: string;
}

/** `GET /payments/{id}` — the receipt. */
export interface Payment {
  readonly id: string;
  readonly number: string;
  readonly direction: PaymentDirection;
  readonly party: PaymentParty | null;
  readonly paymentDate: string;
  readonly amount: string;
  readonly modeBreakup: readonly PaymentModeLine[];
  readonly primaryMode: PaymentMode;
  readonly reference: string;
  readonly note: string;
  readonly status: PaymentStatus;
  readonly unallocatedAmount: string;
  readonly allocations: readonly PaymentAllocation[];
  /** The khata as of this payment's line; null for a walk-in sale. */
  readonly partyBalanceAfter: string | null;
  readonly context: string | null;
  readonly business: PaymentBusiness;
  readonly voidReason: string | null;
  readonly voidedAt: string | null;
  readonly voidedBy: PaymentPerson | null;
  readonly createdBy: PaymentPerson | null;
  readonly createdAt: string;
}

/** A bill the allocation panel offers, oldest first (FR-2). */
export interface OpenDocument {
  readonly documentType: string;
  readonly documentId: string;
  readonly number: string;
  readonly documentDate: string;
  readonly dueOn: string | null;
  readonly grandTotal: string;
  /** What it can still take. */
  readonly amountDue: string;
  readonly status: string;
}

/** Where the drawer was opened from, and what it is preset with (FR-1). */
export interface PaymentContext {
  readonly direction: PaymentDirection;
  readonly partyId?: string;
  readonly partyName?: string;
  /**
   * The default amount from a khata: what the party owes the shop for money
   * in, what the shop owes the supplier for money out (PUR-02), as a magnitude.
   */
  readonly receivable?: string;
  /** An invoice or purchase bill page: this bill is allocated first, with its due as the amount. */
  readonly documentId?: string;
  readonly documentNumber?: string;
  readonly documentDue?: string;
  /** PAY-03 FR-9 "Mark received": UPI, this amount. */
  readonly presetMode?: PaymentMode;
  readonly presetAmount?: string;
  /** PAY-05 FR-7 "Record again": the voided payment's lines. */
  readonly presetLines?: readonly PaymentModeLine[];
  readonly entry: 'party' | 'invoice' | 'bill' | 'list' | 'collect' | 'again';
}

export interface PaymentLineForm {
  mode: PaymentMode | '';
  upiApp: UpiApp | '';
  amount: string;
  reference: string;
}

export interface AllocationRowForm {
  documentType: string;
  documentId: string;
  number: string;
  documentDate: string;
  due: string;
  amount: string;
}

export interface PaymentFormValues {
  direction: PaymentDirection;
  partyId: string;
  partyName: string;
  paymentDate: string;
  lines: PaymentLineForm[];
  autoAllocate: boolean;
  allocations: AllocationRowForm[];
  note: string;
}

export interface PaymentDocumentMove {
  readonly documentId: string;
  readonly status: string;
  readonly amountDue: string;
}

export interface PaymentSaveResult {
  readonly payment: Payment;
  readonly partyBalance: string | null;
  readonly documents: readonly PaymentDocumentMove[];
}

export type PaymentTab = 'all' | 'in' | 'out' | 'void';

export interface PaymentFilters {
  readonly preset: string;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly tab: PaymentTab;
  readonly mode: PaymentMode | null;
  readonly q: string;
  readonly page: number;
}

export interface PaymentTotals {
  readonly count: number;
  readonly amountIn: string;
  readonly amountOut: string;
}

export interface PaymentPage {
  readonly rows: readonly PaymentRow[];
  readonly totals: PaymentTotals;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

/** PAY-03 — the Collect QR. */
export interface CollectQr {
  readonly upiUrl: string;
  readonly amount: string | null;
  readonly vpa: string;
  readonly payee: string;
  readonly qr: { readonly size: number; readonly modules: readonly string[] };
}
