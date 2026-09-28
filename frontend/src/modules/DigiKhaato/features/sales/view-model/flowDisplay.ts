import { ROUTES } from 'src/routes';

import {
  CREDIT_NOTE_TABS,
  ESTIMATE_TABS,
  type FlowKind,
  type FlowTab,
} from '../types/salesFlows.types';

import { invoiceFiltersFromQuery, type InvoiceListFilters } from './invoiceDisplay';

import type { SalesDocument, SalesStatus } from '../types/sales.types';

/**
 * SAL-01 / SAL-04 — the pure decisions the estimate and credit note screens
 * make: which tabs a list has, where a row opens, which actions a document's
 * status allows. Decided once here so the list, the detail page and the tests
 * cannot disagree about, say, whether an expired estimate converts (BR-5: it does).
 */

export const FLOW_TABS: Readonly<Record<FlowKind, readonly FlowTab[]>> = {
  estimate: ESTIMATE_TABS,
  credit_note: CREDIT_NOTE_TABS,
};

export const FLOW_HOME: Readonly<Record<FlowKind, string>> = {
  estimate: ROUTES.SALES_ESTIMATES,
  credit_note: ROUTES.SALES_CREDIT_NOTES,
};

export interface FlowListFilters extends Omit<InvoiceListFilters, 'tab'> {
  readonly tab: FlowTab;
}

/** The invoice list's URL rules (period, dates, search, page), with this list's tabs. */
export const flowFiltersFromQuery = (
  kind: FlowKind,
  query: URLSearchParams,
  today: string
): FlowListFilters => {
  const base = invoiceFiltersFromQuery(query, today);
  const raw = query.get('tab') as FlowTab | null;
  return { ...base, tab: raw && FLOW_TABS[kind].includes(raw) ? raw : 'all' };
};

/** Where a list row opens: a draft estimate into its editor, everything else its page. */
export const flowRowHref = (kind: FlowKind, id: string, status: SalesStatus): string =>
  kind === 'estimate' && status === 'draft'
    ? `${ROUTES.SALES_ESTIMATES}/${id}/edit`
    : `${FLOW_HOME[kind]}/${id}`;

/** SAL-01 §9 — the moves an estimate's status allows. `rejected` is terminal. */
export const estimateActions = (
  status: SalesStatus
): { readonly accept: boolean; readonly reject: boolean; readonly convert: boolean } => ({
  accept: status === 'sent',
  reject: status === 'sent',
  convert: status === 'sent' || status === 'accepted' || status === 'expired',
});

/** SAL-05 FR-1 — the invoice statuses a void starts from. */
export const isVoidable = (doc: Pick<SalesDocument, 'kind' | 'status'>): boolean =>
  (doc.kind === 'invoice' || doc.kind === 'bill_of_supply'
    ? ['issued', 'partially_paid', 'paid', 'overdue']
    : ['issued', 'applied']
  ).includes(doc.status);

/** SAL-04 §10 / EC-7 — a return needs an issued, non-void bill with a party and a line left. */
export const canReturn = (doc: SalesDocument): boolean =>
  (doc.kind === 'invoice' || doc.kind === 'bill_of_supply') &&
  ['issued', 'partially_paid', 'paid', 'overdue'].includes(doc.status) &&
  doc.party !== null &&
  doc.lines.some((line) => Number(line.qty) > Number(line.returnedQty || '0'));

/** SAL-04 FR-9 — a note with open credit can be applied to another bill. */
export const canApply = (doc: SalesDocument): boolean =>
  doc.kind === 'credit_note' && doc.status === 'issued' && Number(doc.amountDue) > 0;

/** "INV/26-27/0042 · 12/09/2026"-style reference text is built by the caller's formatter. */
export const flowDetailHref = (kind: string, id: string): string =>
  kind === 'estimate'
    ? `${ROUTES.SALES_ESTIMATES}/${id}`
    : kind === 'credit_note'
      ? `${ROUTES.SALES_CREDIT_NOTES}/${id}`
      : `${ROUTES.SALES_INVOICES}/${id}`;
