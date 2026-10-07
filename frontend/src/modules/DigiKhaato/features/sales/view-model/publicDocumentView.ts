import type { UbStatusBadgeTone } from 'src/design-system';

import type { SalesDocument } from '../types/sales.types';

/**
 * SAL-03 FR-5 / SAL-14 FR-8 — what the customer's page SAYS about a bill, as
 * pure decisions so each is tested without a DOM.
 *
 * The page speaks to the CUSTOMER, not the merchant: "Issued" is the shop's
 * word for a bill it has sent; the person holding it reads "Payment due".
 * The merchant's `sales.status.*` labels are therefore not reused here.
 */

const PAYABLE_KINDS: ReadonlySet<SalesDocument['kind']> = new Set(['invoice', 'bill_of_supply']);

export const isPayableKind = (doc: Pick<SalesDocument, 'kind'>): boolean =>
  PAYABLE_KINDS.has(doc.kind);

const isZero = (amount: string): boolean => Number(amount) === 0;

export interface PublicStatus {
  readonly labelId: string;
  readonly tone: UbStatusBadgeTone;
}

export const publicStatus = (doc: Pick<SalesDocument, 'kind' | 'status'>): PublicStatus => {
  if (doc.status === 'void') return { labelId: 'publicDocument.status.void', tone: 'error' };
  // The title already says "Estimate" / "Credit note"; the badge says where it stands.
  if (doc.kind === 'estimate') {
    if (doc.status === 'expired')
      return { labelId: 'publicDocument.status.expired', tone: 'neutral' };
    if (doc.status === 'accepted' || doc.status === 'converted') {
      return { labelId: 'publicDocument.status.accepted', tone: 'success' };
    }
    return { labelId: 'publicDocument.status.valid', tone: 'info' };
  }
  // Shop item 3 — an order says whether it stands, was billed, or was called off.
  if (doc.kind === 'sales_order') {
    if (doc.status === 'cancelled')
      return { labelId: 'publicDocument.status.cancelled', tone: 'neutral' };
    if (doc.status === 'converted')
      return { labelId: 'publicDocument.status.billed', tone: 'success' };
    return { labelId: 'publicDocument.status.orderConfirmed', tone: 'info' };
  }
  // Shop item 4 — a challan says the goods went, were billed, or came back.
  if (doc.kind === 'delivery_challan') {
    if (doc.status === 'converted')
      return { labelId: 'publicDocument.status.billed', tone: 'success' };
    return { labelId: 'publicDocument.status.dispatched', tone: 'info' };
  }
  if (doc.kind === 'credit_note') {
    return doc.status === 'applied'
      ? { labelId: 'publicDocument.status.adjusted', tone: 'success' }
      : { labelId: 'publicDocument.status.creditOpen', tone: 'info' };
  }
  switch (doc.status) {
    case 'paid':
      return { labelId: 'publicDocument.status.paid', tone: 'success' };
    case 'partially_paid':
      return { labelId: 'publicDocument.status.partlyPaid', tone: 'warning' };
    case 'overdue':
      return { labelId: 'publicDocument.status.overdue', tone: 'error' };
    default:
      return { labelId: 'publicDocument.status.due', tone: 'warning' };
  }
};

export interface HeadlineAmount {
  readonly labelId: string;
  readonly value: string;
}

/** The one figure the page leads with: what is left to pay, or what the paper is worth. */
export const headlineAmount = (
  doc: Pick<SalesDocument, 'kind' | 'status' | 'grandTotal' | 'amountDue'>
): HeadlineAmount => {
  if (doc.kind === 'estimate') {
    return { labelId: 'publicDocument.amount.estimate', value: doc.grandTotal };
  }
  if (doc.kind === 'sales_order') {
    return { labelId: 'publicDocument.amount.order', value: doc.grandTotal };
  }
  if (doc.kind === 'delivery_challan') {
    return { labelId: 'publicDocument.amount.challan', value: doc.grandTotal };
  }
  if (doc.kind === 'credit_note') {
    return { labelId: 'publicDocument.amount.creditNote', value: doc.grandTotal };
  }
  if (doc.status !== 'void' && !isZero(doc.amountDue)) {
    return { labelId: 'publicDocument.amount.due', value: doc.amountDue };
  }
  return {
    labelId: doc.status === 'void' ? 'publicDocument.amount.total' : 'publicDocument.amount.paid',
    value: doc.grandTotal,
  };
};

/** The sentence under the figure, when the kind needs one. */
export const kindNoteId = (doc: Pick<SalesDocument, 'kind' | 'status'>): string | null => {
  if (doc.status === 'void') return 'publicDocument.note.void';
  if (doc.kind === 'estimate') return 'publicDocument.note.estimate';
  if (doc.kind === 'sales_order') return 'publicDocument.note.order';
  if (doc.kind === 'delivery_challan') return 'publicDocument.note.challan';
  if (doc.kind === 'credit_note') return 'publicDocument.note.creditNote';
  return null;
};
