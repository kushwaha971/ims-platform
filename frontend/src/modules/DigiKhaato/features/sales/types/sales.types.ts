import type { PaymentMode } from 'src/types/domain.types';

import type { SalesDocumentLinks } from './salesFlows.types';

/**
 * SAL-02/03/06/07/08 — the sales document as the client holds it, camelCased
 * from the §22.7 common shape by `api/salesService.ts`. Money is a STRING
 * everywhere (canon rule 3): the client previews with `view-model/taxEngine`
 * and never stores its own figure; the server's is the one that is printed.
 */

export const SALES_KINDS = ['invoice', 'bill_of_supply', 'estimate', 'credit_note'] as const;
export type SalesKind = (typeof SALES_KINDS)[number];

export const SALES_STATUSES = [
  'draft',
  'issued',
  'partially_paid',
  'paid',
  'overdue',
  'void',
  // SAL-01 — estimates
  'sent',
  'accepted',
  'rejected',
  'expired',
  'converted',
  // SAL-04 — credit notes
  'applied',
] as const;
export type SalesStatus = (typeof SALES_STATUSES)[number];

/** SAL-08 FR-2 — the list's tabs, each a set of statuses on the server. */
export const INVOICE_TABS = ['all', 'unpaid', 'overdue', 'paid', 'draft', 'void'] as const;
export type InvoiceTab = (typeof INVOICE_TABS)[number];

export type DiscountType = 'percent' | 'amount';
export type GstType = 'regular' | 'composition' | 'unregistered';

export interface SalesPerson {
  readonly id: string;
  readonly name: string;
}

export interface SalesPartyRef {
  readonly id: string;
  readonly name: string;
  readonly gstin: string | null;
  readonly mobile: string | null;
  readonly stateCode: string | null;
}

export interface SalesAddress {
  readonly line1?: string;
  readonly line2?: string;
  readonly city?: string;
  readonly state?: string;
  readonly pincode?: string;
}

/** Frozen at issue (`party_snapshot`); for a draft the server fills it from the party. */
export interface PartySnapshot {
  readonly name: string;
  readonly gstin: string | null;
  readonly stateCode: string | null;
  readonly mobile: string | null;
  readonly address: SalesAddress;
}

/** The seller block a print needs (live tenant for a draft, GSTIN snapshotted at issue). */
export interface SalesSupplier {
  readonly name: string;
  readonly legalName: string | null;
  readonly gstin: string | null;
  readonly gstType: GstType;
  readonly stateCode: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly address: SalesAddress;
  readonly upiVpa: string | null;
  readonly bankDetails: Readonly<Record<string, string>>;
}

export interface PaymentBreakupRow {
  readonly mode: PaymentMode;
  readonly amount: string;
  readonly reference: string;
}

/**
 * SAL-07 — the money taken at issue. PAY-01 (next wave) replaces this with a
 * `payments_payment` row and an allocation; until then the document carries it
 * (`meta.payment` on the server) and `amountPaid` is the cache.
 */
export interface IssuePayment {
  readonly paymentDate: string;
  readonly modeBreakup: readonly PaymentBreakupRow[];
  readonly note: string;
}

export interface SalesDocumentLine {
  readonly id: string | null;
  readonly lineNo: number;
  readonly itemId: string | null;
  readonly description: string;
  readonly hsnSac: string | null;
  readonly qty: string;
  readonly unitCode: string;
  readonly unitPrice: string;
  readonly taxInclusive: boolean;
  readonly discountType: DiscountType | null;
  readonly discountValue: string | null;
  readonly discountAmount: string;
  readonly taxableValue: string;
  readonly taxCode: string;
  readonly taxRate: string;
  readonly cessRate: string;
  readonly cgst: string;
  readonly sgst: string;
  readonly igst: string;
  readonly cess: string;
  readonly lineTotal: string;
  /** SAL-04 — on an invoice line, how much credit notes returned; on a note's line, its source. */
  readonly returnedQty: string;
  readonly againstLineId: string | null;
}

export interface SalesDocumentTotals {
  readonly subtotal: string;
  readonly discountAmount: string;
  readonly taxableTotal: string;
  readonly cgstTotal: string;
  readonly sgstTotal: string;
  readonly igstTotal: string;
  readonly cessTotal: string;
  readonly roundOff: string;
  readonly grandTotal: string;
}

export interface SalesDocument extends SalesDocumentTotals {
  readonly id: string;
  readonly kind: SalesKind;
  readonly number: string | null;
  readonly fyLabel: string;
  readonly status: SalesStatus;
  readonly version: number;
  readonly party: SalesPartyRef | null;
  readonly partySnapshot: PartySnapshot | null;
  readonly walkInName: string | null;
  readonly walkInMobile: string | null;
  readonly supplier: SalesSupplier;
  readonly documentDate: string;
  readonly dueOn: string | null;
  readonly validUntil: string | null;
  readonly placeOfSupplyState: string;
  readonly isInterState: boolean;
  readonly reverseCharge: boolean;
  readonly discountType: DiscountType | null;
  readonly discountValue: string | null;
  readonly roundOffEnabled: boolean;
  readonly amountPaid: string;
  readonly amountDue: string;
  readonly payment: IssuePayment | null;
  /** PAY-01 — the receipts allocated to this bill, oldest first. */
  readonly payments: readonly InvoicePaymentRef[];
  readonly lines: readonly SalesDocumentLine[];
  readonly notes: string;
  readonly terms: string;
  readonly docDiscountAllocation: Readonly<Record<string, string>>;
  readonly createdBy: SalesPerson | null;
  readonly issuedAt: string | null;
  readonly voidedAt: string | null;
  readonly voidReason: string | null;
  readonly links: SalesDocumentLinks;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SalesWarning {
  readonly code: string;
  readonly message: string;
  readonly details: Readonly<Record<string, unknown>>;
}

/** FR-16 / BR-15 — `meta.rule46`, computed on every read and save, never stored. */
export interface Rule46Issue {
  readonly code: string;
  readonly field: string;
  readonly severity: 'hard' | 'soft';
}

export interface Rule46Check {
  readonly passed: boolean;
  readonly total: number;
  readonly satisfied: number;
  readonly issues: readonly Rule46Issue[];
}

export interface SalesDocumentEnvelope {
  readonly document: SalesDocument;
  readonly warnings: readonly SalesWarning[];
  readonly rule46: Rule46Check | null;
  readonly partyBalance: string | null;
  readonly ledgerEntryId: string | null;
}

export interface InvoiceListRow {
  readonly id: string;
  readonly kind: SalesKind;
  readonly number: string | null;
  readonly status: SalesStatus;
  readonly party: SalesPerson | null;
  readonly walkInName: string | null;
  readonly walkInMobileMasked: string | null;
  readonly documentDate: string;
  readonly dueOn: string | null;
  readonly validUntil: string | null;
  readonly grandTotal: string;
  readonly amountPaid: string;
  readonly amountDue: string;
  readonly isOverdue: boolean;
  readonly voidReason: string | null;
  readonly createdBy: SalesPerson | null;
}

export interface InvoiceListTotals {
  readonly count: number;
  readonly grandTotal: string;
  readonly amountDue: string;
}

export type InvoiceTabCounts = Readonly<Record<InvoiceTab, number>>;

export interface InvoiceListPage {
  readonly rows: readonly InvoiceListRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly totals: InvoiceListTotals;
  readonly tabs: InvoiceTabCounts;
}

/** SAL-03 FR-4 — the UPI string and the QR's module matrix (one row per string of 0/1). */
export interface UpiIntent {
  readonly upiUrl: string;
  readonly amount: string | null;
  readonly qr: { readonly size: number; readonly modules: readonly string[] };
}

export interface ShareLink {
  readonly url: string;
  readonly expiresAt: string;
}

export type PrintTemplate = 'a4' | 'thermal80';

/** PAY-01 — a receipt that settled (part of) a bill, as the invoice page lists it. */
export interface InvoicePaymentRef {
  readonly id: string;
  readonly number: string;
  readonly paymentDate: string;
  readonly primaryMode: PaymentBreakupRow['mode'];
  readonly amount: string;
  readonly status: 'recorded' | 'void';
}
