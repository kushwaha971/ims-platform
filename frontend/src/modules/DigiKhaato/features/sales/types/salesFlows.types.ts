import type { PaymentBreakupRow } from './sales.types';

/**
 * SAL-01 / SAL-04 / SAL-05 — what an estimate, a credit note and a void add to
 * the §22.7 common document shape. The server nests every cross-document tie
 * under `links` (serializers/links.py), so an invoice read and a credit note
 * read differ only there; this file is that object, camelCased.
 */

/** How one document names another: enough to render "INV/26-27/0042 · 12/09/2026". */
export interface SalesDocRef {
  readonly id: string;
  readonly kind: string;
  readonly number: string | null;
  readonly documentDate: string | null;
  readonly status: string;
  readonly grandTotal: string;
}

/** A credit application: the other document, and how much of the credit it took. */
export interface SalesCreditUse extends SalesDocRef {
  readonly amount: string;
}

export const CREDIT_NOTE_REASONS = [
  'sales_return',
  'post_sale_discount',
  'rate_correction',
  'qty_correction',
  'deficiency',
  'other',
] as const;
export type CreditNoteReason = (typeof CREDIT_NOTE_REASONS)[number];

export const SETTLEMENTS = ['hold_advance', 'refund'] as const;
export type Settlement = (typeof SETTLEMENTS)[number];

export interface RefundRecord {
  readonly paymentDate: string;
  readonly modeBreakup: readonly PaymentBreakupRow[];
}

/** Empty object members are simply absent for the kinds that do not carry them. */
export interface SalesDocumentLinks {
  /** estimate → the invoice it became */
  readonly convertedTo: SalesDocRef | null;
  /** invoice → the estimate it came from, the notes against it, credit used on it */
  readonly convertedFrom: SalesDocRef | null;
  readonly creditNotes: readonly SalesDocRef[];
  readonly creditApplications: readonly SalesCreditUse[];
  /** credit note → its invoice, where its credit went, its refund and settlement */
  readonly against: SalesDocRef | null;
  readonly applications: readonly SalesCreditUse[];
  readonly refund: RefundRecord | null;
  readonly reason: { readonly code: CreditNoteReason | null; readonly note: string };
  readonly restock: boolean;
  readonly settlement: Settlement;
  readonly openCredit: string | null;
}

/** SAL-05 FR-6 — a payment the void detached; `walkIn` when there is no party to hold it. */
export interface UnallocatedPayment {
  readonly paymentId: string | null;
  readonly number: string | null;
  readonly amount: string;
  readonly walkIn: boolean;
}

export interface VoidResult {
  readonly documentId: string;
  readonly unallocatedPayments: readonly UnallocatedPayment[];
  readonly partyBalance: string | null;
}

/** The two kinds with their own list and detail routes. */
export type FlowKind = 'estimate' | 'credit_note';

/** SAL-01 FR-10 / SAL-04 §14 — the lists' tabs, each a set of statuses on the server. */
export const ESTIMATE_TABS = ['all', 'draft', 'sent', 'accepted', 'expired', 'converted'] as const;
export const CREDIT_NOTE_TABS = ['all', 'open', 'applied', 'draft', 'void'] as const;
export type EstimateTab = (typeof ESTIMATE_TABS)[number];
export type CreditNoteTab = (typeof CREDIT_NOTE_TABS)[number];
export type FlowTab = EstimateTab | CreditNoteTab;

/** The estimate status moves the detail page offers (§9). */
export type EstimateMove = 'sent' | 'accepted' | 'rejected';
