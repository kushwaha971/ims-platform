import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';

import { toListPage } from './salesMapping';
import { invoiceListQuery, toEnvelope, type InvoiceListQuery } from './salesService';

import type { InvoiceListPage, SalesDocumentEnvelope } from '../types/sales.types';
import type { FlowMove, FlowTab, QuoteKind } from '../types/salesFlows.types';

/**
 * SAL-01 §14 — `/sales/estimates`: the same draft body as an invoice plus
 * `valid_until`, the three status moves as actions, and `convert`, which
 * answers with the new DRAFT invoice and `meta.warnings[]` (FR-7).
 */

type Wire = Record<string, unknown>;
interface EnvelopeWire {
  readonly data: Wire;
  readonly meta?: Wire | null;
}

export type FlowListQuery = Omit<InvoiceListQuery, 'tab'> & { readonly tab: FlowTab };
export type FlowListPage = Omit<InvoiceListPage, 'tabs'> & {
  readonly tabs: Readonly<Record<string, number>>;
};

const LIST_PATH = {
  estimate: API_PATHS.SALES_ESTIMATES,
  credit_note: API_PATHS.SALES_CREDIT_NOTES,
  sales_order: API_PATHS.SALES_ORDERS,
  delivery_challan: API_PATHS.SALES_CHALLANS,
} as const;
const DETAIL_PATH = {
  estimate: API_PATHS.SALES_ESTIMATE,
  credit_note: API_PATHS.SALES_CREDIT_NOTE,
  sales_order: API_PATHS.SALES_ORDER,
  delivery_challan: API_PATHS.SALES_CHALLAN,
} as const;

/** The estimates and credit notes lists share SAL-08's list shape (views/common.py). */
export const listFlowDocuments = async (
  kind: keyof typeof LIST_PATH,
  filters: FlowListQuery,
  signal?: AbortSignal
): Promise<FlowListPage> => {
  const response = await api.get<{ data: Wire[]; meta: Wire }>(
    `${LIST_PATH[kind]}${invoiceListQuery(filters as unknown as InvoiceListQuery)}`,
    ubConfig({ signal })
  );
  return toListPage<FlowListPage['tabs']>(response.data.data, response.data.meta);
};

export const getFlowDocument = async (
  kind: keyof typeof DETAIL_PATH,
  id: string,
  signal?: AbortSignal
): Promise<SalesDocumentEnvelope> =>
  toEnvelope((await api.get<EnvelopeWire>(DETAIL_PATH[kind](id), ubConfig({ signal }))).data);

/* Shop item 3 — a sales order is written through the estimate's calls, on its own routes. */
export const createEstimate = async (
  body: Wire,
  options: { readonly quiet?: boolean; readonly kind?: QuoteKind } = {}
): Promise<SalesDocumentEnvelope> =>
  toEnvelope(
    (
      await api.post<EnvelopeWire>(
        LIST_PATH[options.kind ?? 'estimate'],
        body,
        ubConfig({ suppressErrorSnackbar: options.quiet ?? false })
      )
    ).data
  );

export const updateEstimate = async (
  id: string,
  body: Wire,
  options: { readonly quiet?: boolean; readonly kind?: QuoteKind } = {}
): Promise<SalesDocumentEnvelope> =>
  toEnvelope(
    (
      await api.patch<EnvelopeWire>(
        DETAIL_PATH[options.kind ?? 'estimate'](id),
        body,
        ubConfig({ suppressErrorSnackbar: options.quiet ?? false })
      )
    ).data
  );

export const deleteEstimate = async (id: string, kind: QuoteKind = 'estimate'): Promise<void> => {
  await api.delete(DETAIL_PATH[kind](id));
};

/** `mark-sent` takes the number (FR-2); `mark-rejected` may carry the customer's reason. */
export const moveEstimate = async (
  id: string,
  move: FlowMove,
  body: Wire = {}
): Promise<SalesDocumentEnvelope> =>
  toEnvelope(
    (
      await api.post<EnvelopeWire>(
        move === 'confirm' || move === 'cancel'
          ? API_PATHS.SALES_ORDER_ACTION(id, move)
          : move === 'issue' || move === 'void'
            ? API_PATHS.SALES_CHALLAN_ACTION(id, move)
            : API_PATHS.SALES_ESTIMATE_MOVE(id, move),
        body
      )
    ).data
  );

/** FR-6 — 201 with the draft invoice; 409 `document_not_draft` when already converted. */
export const convertEstimate = async (
  id: string,
  kind: QuoteKind = 'estimate'
): Promise<SalesDocumentEnvelope> =>
  toEnvelope(
    (
      await api.post<EnvelopeWire>(
        kind === 'sales_order'
          ? API_PATHS.SALES_ORDER_ACTION(id, 'convert')
          : kind === 'delivery_challan'
            ? API_PATHS.SALES_CHALLAN_ACTION(id, 'convert')
            : API_PATHS.SALES_ESTIMATE_CONVERT(id),
        {}
      )
    ).data
  );
