import { ROUTES } from 'src/routes';

import type { LedgerEntrySource } from '../types/ledger.types';

/**
 * LED-10 §14 `sourceDisplay.ts` — a document-sourced khata line, named and
 * linked: "Invoice · INV/26-27/0042 →", "Payment received · RCT/26-27/0017 →".
 *
 * Pure, so the route table is a unit test away from being checked, and in the
 * ledger feature rather than beside each document, because the khata is the
 * one screen that renders all of them in a single list.
 *
 * `kind` is what the server resolved (an invoice or a bill of supply, a
 * payment in or out); `type` is the fallback when the resolver did not find
 * the document (§9 "Document not found") — the row still says what KIND of
 * document it was, and links nowhere.
 */

const LABEL_BY_KIND: Readonly<Record<string, string>> = {
  invoice: 'ledger.source.invoice',
  bill_of_supply: 'ledger.source.invoice',
  credit_note: 'ledger.source.credit_note',
  purchase_bill: 'ledger.source.purchase_bill',
  debit_note: 'ledger.source.debit_note',
  payment_in: 'ledger.source.payment_in',
  payment_out: 'ledger.source.payment_out',
  expense: 'ledger.source.expense',
};

const LABEL_BY_TYPE: Readonly<Record<string, string>> = {
  sales_document: 'ledger.source.invoice',
  purchase_document: 'ledger.source.purchase_bill',
  payment: 'ledger.source.payment',
  expense: 'ledger.source.expense',
};

/** The badge's message id, or null for a source this screen does not name. */
export const sourceLabelId = (source: LedgerEntrySource): string | null =>
  (source.kind ? LABEL_BY_KIND[source.kind] : undefined) ?? LABEL_BY_TYPE[source.type] ?? null;

/** Where the number links — the document's own page — or null when nothing can open it. */
export const sourceRoute = (source: LedgerEntrySource): string | null => {
  if (!source.number) return null; // not found: there is nothing to open
  const id = encodeURIComponent(source.id);
  switch (source.type) {
    case 'sales_document':
      // SAL-04 — a credit note has its own detail route; every other sales
      // kind (invoice, bill of supply) opens the invoice page.
      return source.kind === 'credit_note'
        ? `${ROUTES.SALES_CREDIT_NOTES}/${id}`
        : `${ROUTES.SALES_INVOICES}/${id}`;
    case 'purchase_document':
      return `${ROUTES.PURCHASE_BILLS}/${id}`;
    case 'payment':
      return `${ROUTES.PAYMENTS}/${id}`;
    case 'expense':
      // An expense opens in a sheet over its list; the list's search finds it by number.
      return `${ROUTES.EXPENSES}?period=thisFy&q=${encodeURIComponent(source.number)}`;
    default:
      return null;
  }
};

/** A document that has since been voided is labelled so on the row (LED-10 §9). */
export const isSourceVoid = (source: LedgerEntrySource): boolean => source.status === 'void';
