import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import type {
  InvoiceListPage,
  InvoiceListRow,
  InvoiceTab,
  PaymentBreakupRow,
  SalesDocument,
  SalesDocumentEnvelope,
  SalesDocumentLine,
  ShareLink,
  UpiIntent,
} from '../types/sales.types';

/**
 * Part 19 §19.3.4 — SAL-02/03/06/07/08's endpoints: one async function each,
 * the snake ⇄ camel mapping and nothing else. Money stays a string.
 */

// ── Wire shapes (only what is mapped) ───────────────────────────────────────

type Wire = Record<string, unknown>;
const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const sn = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

const toLine = (row: Wire): SalesDocumentLine => ({
  id: sn(row.id),
  lineNo: Number(row.line_no),
  itemId: sn(row.item_id),
  description: s(row.description),
  hsnSac: sn(row.hsn_sac),
  qty: s(row.qty),
  unitCode: s(row.unit_code),
  unitPrice: s(row.unit_price),
  taxInclusive: Boolean(row.tax_inclusive),
  discountType: (row.discount_type as SalesDocumentLine['discountType']) ?? null,
  discountValue: sn(row.discount_value),
  discountAmount: s(row.discount_amount),
  taxableValue: s(row.taxable_value),
  taxCode: s(row.tax_code),
  taxRate: s(row.tax_rate),
  cessRate: s(row.cess_rate),
  cgst: s(row.cgst),
  sgst: s(row.sgst),
  igst: s(row.igst),
  cess: s(row.cess),
  lineTotal: s(row.line_total),
});

const toAddress = (raw: unknown) => (raw && typeof raw === 'object' ? (raw as Wire) : {});

export const toDocument = (row: Wire): SalesDocument => {
  const party = row.party as Wire | null;
  const snapshot = row.party_snapshot as Wire | null;
  const supplier = (row.supplier ?? {}) as Wire;
  const payment = row.payment as Wire | null;
  return {
    id: s(row.id),
    kind: row.kind as SalesDocument['kind'],
    number: sn(row.number),
    fyLabel: s(row.fy_label),
    status: row.status as SalesDocument['status'],
    version: Number(row.version),
    party: party
      ? {
          id: s(party.id),
          name: s(party.name),
          gstin: sn(party.gstin),
          mobile: sn(party.mobile),
          stateCode: sn(party.state_code),
        }
      : null,
    partySnapshot: snapshot
      ? {
          name: s(snapshot.name),
          gstin: sn(snapshot.gstin),
          stateCode: sn(snapshot.state_code),
          mobile: sn(snapshot.mobile),
          address: toAddress(snapshot.address),
        }
      : null,
    walkInName: sn(row.walk_in_name),
    walkInMobile: sn(row.walk_in_mobile),
    supplier: {
      name: s(supplier.name),
      legalName: sn(supplier.legal_name),
      gstin: sn(supplier.gstin),
      gstType: (supplier.gst_type as SalesDocument['supplier']['gstType']) ?? 'unregistered',
      stateCode: s(supplier.state_code),
      phone: sn(supplier.phone),
      email: sn(supplier.email),
      address: toAddress(supplier.address),
      upiVpa: sn(supplier.upi_vpa),
      bankDetails: (supplier.bank_details ?? {}) as Record<string, string>,
    },
    documentDate: s(row.document_date),
    dueOn: sn(row.due_on),
    placeOfSupplyState: s(row.place_of_supply_state),
    isInterState: Boolean(row.is_inter_state),
    reverseCharge: Boolean(row.reverse_charge),
    discountType: (row.discount_type as SalesDocument['discountType']) ?? null,
    discountValue: sn(row.discount_value),
    roundOffEnabled: Boolean(row.round_off_enabled),
    subtotal: s(row.subtotal),
    discountAmount: s(row.discount_amount),
    taxableTotal: s(row.taxable_total),
    cgstTotal: s(row.cgst_total),
    sgstTotal: s(row.sgst_total),
    igstTotal: s(row.igst_total),
    cessTotal: s(row.cess_total),
    roundOff: s(row.round_off),
    grandTotal: s(row.grand_total),
    amountPaid: s(row.amount_paid),
    amountDue: s(row.amount_due),
    payment: payment
      ? {
          paymentDate: s(payment.payment_date),
          modeBreakup: ((payment.mode_breakup ?? []) as Wire[]).map((r) => ({
            mode: r.mode as PaymentBreakupRow['mode'],
            amount: s(r.amount),
            reference: s(r.reference),
          })),
          note: s(payment.note),
        }
      : null,
    lines: ((row.lines ?? []) as Wire[]).map(toLine),
    notes: s(row.notes),
    terms: s(row.terms),
    docDiscountAllocation: (row.doc_discount_allocation ?? {}) as Record<string, string>,
    createdBy: (row.created_by as SalesDocument['createdBy']) ?? null,
    issuedAt: sn(row.issued_at),
    createdAt: s(row.created_at),
    updatedAt: s(row.updated_at),
  };
};

interface EnvelopeWire {
  readonly data: Wire;
  readonly meta?: Wire | null;
}

export const toEnvelope = (body: EnvelopeWire): SalesDocumentEnvelope => {
  const meta = body.meta ?? {};
  return {
    document: toDocument(body.data),
    warnings: (meta.warnings ?? []) as SalesDocumentEnvelope['warnings'],
    rule46: (meta.rule46 ?? null) as SalesDocumentEnvelope['rule46'],
    partyBalance: sn(meta.party_balance),
    ledgerEntryId: sn(meta.ledger_entry_id),
  };
};

const toListRow = (row: Wire): InvoiceListRow => ({
  id: s(row.id),
  kind: row.kind as InvoiceListRow['kind'],
  number: sn(row.number),
  status: row.status as InvoiceListRow['status'],
  party: (row.party as InvoiceListRow['party']) ?? null,
  walkInName: sn(row.walk_in_name),
  walkInMobileMasked: sn(row.walk_in_mobile_masked),
  documentDate: s(row.document_date),
  dueOn: sn(row.due_on),
  grandTotal: s(row.grand_total),
  amountPaid: s(row.amount_paid),
  amountDue: s(row.amount_due),
  isOverdue: Boolean(row.is_overdue),
  createdBy: (row.created_by as InvoiceListRow['createdBy']) ?? null,
});

// ── Endpoints ───────────────────────────────────────────────────────────────

export interface InvoiceListQuery {
  readonly tab: InvoiceTab;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly partyId: string | null;
  readonly q: string;
  readonly page: number;
}

export const invoiceListQuery = (filters: InvoiceListQuery): string =>
  toQueryString({
    tab: filters.tab !== 'all' ? filters.tab : undefined,
    date_from: filters.dateFrom || undefined,
    date_to: filters.dateTo || undefined,
    party_id: filters.partyId || undefined,
    q: filters.q.trim() || undefined,
    page: filters.page > 1 ? filters.page : undefined,
  });

export const listInvoices = async (
  filters: InvoiceListQuery,
  signal?: AbortSignal
): Promise<InvoiceListPage> => {
  const response = await api.get<{ data: Wire[]; meta: Wire }>(
    `${API_PATHS.SALES_INVOICES}${invoiceListQuery(filters)}`,
    ubConfig({ signal })
  );
  const { data, meta } = response.data;
  const totals = (meta.totals ?? {}) as Wire;
  return {
    rows: data.map(toListRow),
    page: Number(meta.page ?? 1),
    pageSize: Number(meta.page_size ?? 25),
    total: Number(meta.total ?? data.length),
    totals: {
      count: Number(totals.count ?? 0),
      grandTotal: s(totals.grand_total ?? '0.00'),
      amountDue: s(totals.amount_due ?? '0.00'),
    },
    tabs: meta.tabs as InvoiceListPage['tabs'],
  };
};

export const getInvoice = async (
  id: string,
  signal?: AbortSignal
): Promise<SalesDocumentEnvelope> =>
  toEnvelope((await api.get<EnvelopeWire>(API_PATHS.SALES_INVOICE(id), ubConfig({ signal }))).data);

/** The draft body (snake_case) — built by `view-model/invoiceForm.toWireBody`. */
export type InvoiceWireBody = Record<string, unknown>;

export const createInvoice = async (
  body: InvoiceWireBody,
  options: { readonly quiet?: boolean } = {}
): Promise<SalesDocumentEnvelope> =>
  toEnvelope(
    (
      await api.post<EnvelopeWire>(
        API_PATHS.SALES_INVOICES,
        body,
        ubConfig({ suppressErrorSnackbar: options.quiet ?? false })
      )
    ).data
  );

/** PATCH a draft; `quiet` for autosave, whose failures the header indicator shows (SAL-06 §9). */
export const updateInvoice = async (
  id: string,
  body: InvoiceWireBody,
  options: { readonly quiet?: boolean } = {}
): Promise<SalesDocumentEnvelope> =>
  toEnvelope(
    (
      await api.patch<EnvelopeWire>(
        API_PATHS.SALES_INVOICE(id),
        body,
        ubConfig({ suppressErrorSnackbar: options.quiet ?? false })
      )
    ).data
  );

export const deleteInvoice = async (id: string): Promise<void> => {
  await api.delete(API_PATHS.SALES_INVOICE(id));
};

/** FR-13 — the key is minted per logical issue and REUSED on retry (EC-8). */
export const issueInvoice = async (
  id: string,
  body: InvoiceWireBody,
  idempotencyKey: string
): Promise<SalesDocumentEnvelope> =>
  toEnvelope(
    (
      await api.post<EnvelopeWire>(
        API_PATHS.SALES_INVOICE_ISSUE(id),
        body,
        ubConfig({ headers: { 'Idempotency-Key': idempotencyKey } })
      )
    ).data
  );

export const createShareLink = async (
  id: string,
  channel: 'link' | 'whatsapp'
): Promise<ShareLink> => {
  const response = await api.post<{ data: { url: string; expires_at: string } }>(
    API_PATHS.SALES_INVOICE_SHARE_LINKS(id),
    { channel }
  );
  return { url: response.data.data.url, expiresAt: response.data.data.expires_at };
};

/** SAL-03 FR-4 — quiet: a shop with no UPI ID simply prints no QR. */
export const getUpiIntent = async (id: string): Promise<UpiIntent | null> => {
  try {
    const response = await api.get<{ data: Wire }>(
      API_PATHS.SALES_INVOICE_UPI_INTENT(id),
      ubConfig({ suppressErrorSnackbar: true })
    );
    const data = response.data.data;
    return {
      upiUrl: s(data.upi_url),
      amount: sn(data.amount),
      qr: data.qr as UpiIntent['qr'],
    };
  } catch {
    return null;
  }
};
