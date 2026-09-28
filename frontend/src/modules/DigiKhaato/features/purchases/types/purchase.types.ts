/**
 * PUR-01 / PUR-03 / PUR-04 — the purchase bill as the client holds it,
 * camelCased from the server's §22.7 shape by `api/purchaseBillService.ts`.
 * Money is a STRING everywhere (canon rule 3): the editor previews with the
 * sales tax engine and never stores its own figure.
 */

export const PURCHASE_BILL_STATUSES = [
  'draft',
  'recorded',
  'partially_paid',
  'paid',
  'overdue',
  'void',
] as const;
export type PurchaseBillStatus = (typeof PURCHASE_BILL_STATUSES)[number];

/** PUR-03 FR-1 — the list's tabs, each a set of statuses on the server. */
export const PURCHASE_BILL_TABS = ['all', 'unpaid', 'overdue', 'paid', 'draft', 'void'] as const;
export type PurchaseBillTab = (typeof PURCHASE_BILL_TABS)[number];

export type PurchaseDiscountType = 'percent' | 'amount';

export interface PurchasePerson {
  readonly id: string;
  readonly name: string;
}

export interface PurchaseSupplierRef {
  readonly id: string;
  readonly name: string;
  readonly gstin: string | null;
  readonly mobile: string | null;
  readonly stateCode: string | null;
  readonly creditDays: number | null;
}

export interface PurchaseSupplierSnapshot {
  readonly name: string;
  readonly gstin: string | null;
  readonly stateCode: string | null;
  readonly mobile: string | null;
}

export interface PurchaseBillLine {
  readonly id: string | null;
  readonly lineNo: number;
  readonly itemId: string | null;
  readonly description: string;
  readonly hsnSac: string | null;
  readonly qty: string;
  readonly unitCode: string;
  readonly unitCost: string;
  readonly discountType: PurchaseDiscountType | null;
  readonly discountValue: string | null;
  readonly discountAmount: string;
  readonly taxableValue: string;
  readonly taxCode: string;
  readonly taxRate: string;
  readonly cgst: string;
  readonly sgst: string;
  readonly igst: string;
  readonly cess: string;
  readonly lineTotal: string;
  /** §17.7.0 — the valuation cost the stock movement carried; null for a draft or a free-text line. */
  readonly inboundUnitCost: string | null;
  /** BR-9 — whether this line moves stock (the void dialog lists only these). */
  readonly trackStock: boolean;
}

/** PUR-02 FR-6 — a supplier payment allocated to this bill (the bill page's "Payments"). */
export interface PurchaseBillPayment {
  readonly id: string;
  readonly number: string;
  readonly paymentDate: string;
  readonly primaryMode: string;
  /** What THIS bill received from the payment, not the payment's total. */
  readonly amount: string;
  readonly status: string;
}

/** PUR-01 FR-6h — the PAYOUT voucher "Paid now" wrote at record. */
export interface PurchaseBillPaidNow {
  readonly paymentId: string;
  readonly number: string;
  readonly amount: string;
}

/** PUR-02 BR-4 — a payment a bill void left as advance. */
export interface PurchaseReleasedPayment {
  readonly paymentId: string;
  readonly number: string;
  readonly amount: string;
}

export interface PurchaseBill {
  readonly id: string;
  readonly number: string | null;
  readonly fyLabel: string;
  readonly status: PurchaseBillStatus;
  readonly version: number;
  readonly party: PurchaseSupplierRef | null;
  readonly partySnapshot: PurchaseSupplierSnapshot | null;
  readonly supplierInvoiceNumber: string | null;
  readonly supplierInvoiceDate: string | null;
  readonly documentDate: string;
  readonly dueOn: string | null;
  readonly isInterState: boolean;
  readonly reverseCharge: boolean;
  readonly itcEligible: boolean;
  readonly discountType: PurchaseDiscountType | null;
  readonly discountValue: string | null;
  readonly roundOffEnabled: boolean;
  readonly subtotal: string;
  readonly discountAmount: string;
  readonly taxableTotal: string;
  readonly cgstTotal: string;
  readonly sgstTotal: string;
  readonly igstTotal: string;
  readonly cessTotal: string;
  readonly roundOff: string;
  readonly grandTotal: string;
  readonly amountPaid: string;
  readonly amountDue: string;
  readonly lines: readonly PurchaseBillLine[];
  readonly notes: string;
  readonly ledgerEntryId: string | null;
  readonly payments: readonly PurchaseBillPayment[];
  readonly createdBy: PurchasePerson | null;
  readonly recordedAt: string | null;
  readonly voidedAt: string | null;
  readonly voidedBy: PurchasePerson | null;
  readonly voidReason: string | null;
  readonly updatedAt: string;
}

export interface PurchaseWarning {
  readonly code: string;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
}

export interface PurchaseBillEnvelope {
  readonly bill: PurchaseBill;
  readonly warnings: readonly PurchaseWarning[];
  readonly partyBalance: string | null;
  /** Present only after a record with "Paid now". */
  readonly payment: PurchaseBillPaidNow | null;
  /** Present only after a void that released supplier payments. */
  readonly releasedPayments: readonly PurchaseReleasedPayment[];
}

export interface PurchaseBillListRow {
  readonly id: string;
  readonly number: string | null;
  readonly status: PurchaseBillStatus;
  readonly party: PurchasePerson | null;
  readonly supplierInvoiceNumber: string | null;
  readonly documentDate: string;
  readonly dueOn: string | null;
  readonly grandTotal: string;
  readonly amountPaid: string;
  readonly amountDue: string;
  readonly isOverdue: boolean;
}

export interface PurchaseBillTotals {
  readonly count: number;
  readonly grandTotal: string;
  readonly amountDue: string;
}

export type PurchaseBillTabCounts = Readonly<Record<PurchaseBillTab, number>>;

export interface PurchaseBillListPage {
  readonly rows: readonly PurchaseBillListRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totals: PurchaseBillTotals;
  readonly counts: PurchaseBillTabCounts;
}

/** FR-7 — "Already recorded as PB/26-27/0003 on 12/08/2026". */
export interface DuplicateSupplierInvoice {
  readonly id: string;
  readonly number: string;
  readonly documentDate: string;
}
