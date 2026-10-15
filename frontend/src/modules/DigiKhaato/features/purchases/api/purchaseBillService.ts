import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import { toQueryString } from 'src/utils/queryString';

import type {
  DuplicateSupplierInvoice,
  PurchaseBill,
  PurchaseBillEnvelope,
  PurchaseBillLine,
  PurchaseBillListPage,
  PurchaseBillListRow,
  PurchaseBillTab,
  PurchaseBillTabCounts,
  PurchaseDocRef,
  PurchaseKind,
  PurchaseLinks,
} from '../types/purchase.types';

/**
 * Part 19 §19.3.4 — PUR-01/03/04's endpoints: one async function each, the
 * snake ⇄ camel mapping and nothing else. Money stays a string.
 */

type Wire = Record<string, unknown>;
const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const sn = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

const toLine = (row: Wire): PurchaseBillLine => ({
  id: sn(row.id),
  lineNo: Number(row.line_no),
  itemId: sn(row.item_id),
  description: s(row.description),
  hsnSac: sn(row.hsn_sac),
  qty: s(row.qty),
  unitCode: s(row.unit_code),
  unitCost: s(row.unit_cost),
  discountType: (row.discount_type as PurchaseBillLine['discountType']) ?? null,
  discountValue: sn(row.discount_value),
  discountAmount: s(row.discount_amount),
  taxableValue: s(row.taxable_value),
  taxCode: s(row.tax_code),
  taxRate: s(row.tax_rate),
  cgst: s(row.cgst),
  sgst: s(row.sgst),
  igst: s(row.igst),
  cess: s(row.cess),
  lineTotal: s(row.line_total),
  inboundUnitCost: sn(row.inbound_unit_cost),
  trackStock: Boolean(row.track_stock),
});

const toPerson = (raw: unknown): PurchaseBill['createdBy'] => {
  if (!raw || typeof raw !== 'object') return null;
  const person = raw as Wire;
  return { id: s(person.id), name: s(person.name) };
};

export const toBill = (row: Wire): PurchaseBill => {
  const party = row.party as Wire | null;
  const snapshot = row.party_snapshot as Wire | null;
  const ledger = row.ledger_entry as Wire | null;
  const links = (row.links ?? {}) as Wire;
  const ref = (raw: unknown): PurchaseDocRef | null => {
    if (!raw || typeof raw !== 'object') return null;
    const doc = raw as Wire;
    return { id: s(doc.id), kind: s(doc.kind), number: sn(doc.number), status: s(doc.status) };
  };
  return {
    id: s(row.id),
    kind: (row.kind === 'purchase_order' || row.kind === 'debit_note'
      ? row.kind
      : 'purchase_bill') as PurchaseKind,
    number: sn(row.number),
    fyLabel: s(row.fy_label),
    status: row.status as PurchaseBill['status'],
    version: Number(row.version),
    party: party
      ? {
          id: s(party.id),
          name: s(party.name),
          gstin: sn(party.gstin),
          mobile: sn(party.mobile),
          stateCode: sn(party.state_code),
          creditDays:
            party.credit_days === null || party.credit_days === undefined
              ? null
              : Number(party.credit_days),
        }
      : null,
    partySnapshot: snapshot
      ? {
          name: s(snapshot.name),
          gstin: sn(snapshot.gstin),
          stateCode: sn(snapshot.state_code),
          mobile: sn(snapshot.mobile),
        }
      : null,
    supplierInvoiceNumber: sn(row.supplier_invoice_number),
    supplierInvoiceDate: sn(row.supplier_invoice_date),
    documentDate: s(row.document_date),
    dueOn: sn(row.due_on),
    isInterState: Boolean(row.is_inter_state),
    reverseCharge: Boolean(row.reverse_charge),
    itcEligible: Boolean(row.itc_eligible),
    discountType: (row.discount_type as PurchaseBill['discountType']) ?? null,
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
    lines: ((row.lines ?? []) as Wire[]).map(toLine),
    notes: s(row.notes),
    ledgerEntryId: ledger ? sn(ledger.id) : null,
    payments: ((row.payments ?? []) as Wire[]).map((p) => ({
      id: s(p.id),
      number: s(p.number),
      paymentDate: s(p.payment_date),
      primaryMode: s(p.primary_mode),
      amount: s(p.amount),
      status: s(p.status),
    })),
    createdBy: toPerson(row.created_by),
    recordedAt: sn(row.recorded_at),
    voidedAt: sn(row.voided_at),
    voidedBy: toPerson(row.voided_by),
    voidReason: sn(row.void_reason),
    links: {
      bill: ref(links.bill),
      order: ref(links.order),
      cancelReason: sn(links.cancel_reason),
      against: ref(links.against),
      reason: (links.reason as PurchaseLinks['reason']) ?? null,
      restock: Boolean(links.restock),
      applied: s(links.applied ?? '0.00'),
      supplierInvoiceNumber: sn(links.supplier_invoice_number),
      debitNotes: ((links.debit_notes ?? []) as Wire[]).map((n) => ({
        id: s(n.id),
        number: sn(n.number),
        status: s(n.status),
        grandTotal: s(n.grand_total),
        documentDate: s(n.document_date),
      })),
      debitApplied: s(links.debit_applied ?? '0.00'),
      returned: (links.returned ?? {}) as Record<string, string>,
    },
    updatedAt: s(row.updated_at),
  };
};

interface EnvelopeWire {
  readonly data: Wire;
  readonly meta?: Wire | null;
}

export const toEnvelope = (body: EnvelopeWire): PurchaseBillEnvelope => {
  const meta = body.meta ?? {};
  const paid = meta.payment as Wire | null | undefined;
  return {
    bill: toBill(body.data),
    warnings: (meta.warnings ?? []) as PurchaseBillEnvelope['warnings'],
    partyBalance: sn(meta.party_balance),
    payment: paid
      ? { paymentId: s(paid.payment_id), number: s(paid.number), amount: s(paid.amount) }
      : null,
    /* The payments listener answers objects; anything else (a bare id) is not
       a payment this screen can name, so it is dropped rather than shown raw. */
    releasedPayments: ((meta.released_payments ?? []) as unknown[])
      .filter((row): row is Wire => !!row && typeof row === 'object')
      .map((row) => ({
        paymentId: s(row.payment_id),
        number: s(row.number),
        amount: s(row.amount),
      })),
  };
};

const toListRow = (row: Wire): PurchaseBillListRow => ({
  id: s(row.id),
  number: sn(row.number),
  status: row.status as PurchaseBillListRow['status'],
  party: (row.party as PurchaseBillListRow['party']) ?? null,
  supplierInvoiceNumber: sn(row.supplier_invoice_number),
  documentDate: s(row.document_date),
  dueOn: sn(row.due_on),
  grandTotal: s(row.grand_total),
  amountPaid: s(row.amount_paid),
  amountDue: s(row.amount_due),
  isOverdue: Boolean(row.is_overdue),
});

// ── Endpoints ───────────────────────────────────────────────────────────────

export interface PurchaseBillListQuery {
  /** Shop item 3 — which list: bills (absent) or orders. Never sent as a parameter. */
  readonly kind?: PurchaseKind;
  readonly tab: PurchaseBillTab;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly partyId: string | null;
  readonly q: string;
  readonly page: number;
}

export const purchaseBillListQuery = (filters: PurchaseBillListQuery): string =>
  toQueryString({
    tab: filters.tab !== 'all' ? filters.tab : undefined,
    date_from: filters.dateFrom || undefined,
    date_to: filters.dateTo || undefined,
    party_id: filters.partyId || undefined,
    q: filters.q.trim() || undefined,
    page: filters.page > 1 ? filters.page : undefined,
  });

/* Shop item 3 — an order is written through the bill's calls, on its own routes. */
const LIST_PATH: Readonly<Record<PurchaseKind, string>> = {
  purchase_bill: API_PATHS.PURCHASE_BILLS,
  purchase_order: API_PATHS.PURCHASE_ORDERS,
  debit_note: API_PATHS.DEBIT_NOTES,
};
const DETAIL_PATH: Readonly<Record<PurchaseKind, (id: string) => string>> = {
  purchase_bill: API_PATHS.PURCHASE_BILL,
  purchase_order: API_PATHS.PURCHASE_ORDER,
  debit_note: API_PATHS.DEBIT_NOTE,
};

export const listPurchaseBills = async (
  filters: PurchaseBillListQuery,
  signal?: AbortSignal,
  kind: PurchaseKind = 'purchase_bill'
): Promise<PurchaseBillListPage> => {
  const response = await api.get<{ data: Wire[]; meta: Wire }>(
    `${LIST_PATH[kind]}${purchaseBillListQuery(filters)}`,
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
    counts: meta.counts as PurchaseBillTabCounts,
    ...(typeof meta.has_any === 'boolean' ? { hasAny: meta.has_any } : {}),
  };
};

/**
 * FR-7 — the blur pre-check: a recorded, non-void bill of this supplier with this
 * number, other than the one being edited. Quiet: a failed check is no warning,
 * and the server's 409 at Record is the guarantee.
 */
export const findDuplicateSupplierInvoice = async (
  partyId: string,
  supplierInvoiceNumber: string,
  excludeId: string | null
): Promise<DuplicateSupplierInvoice | null> => {
  const query = toQueryString({
    party_id: partyId,
    supplier_invoice_number: supplierInvoiceNumber,
  });
  const response = await api.get<{ data: Wire[] }>(
    `${API_PATHS.PURCHASE_BILLS}${query}`,
    ubConfig({ suppressErrorSnackbar: true })
  );
  const match = response.data.data
    .map(toListRow)
    .find((row) => row.id !== excludeId && row.status !== 'void' && row.status !== 'draft');
  return match && match.number
    ? { id: match.id, number: match.number, documentDate: match.documentDate }
    : null;
};

export const getPurchaseBill = async (
  id: string,
  signal?: AbortSignal,
  kind: PurchaseKind = 'purchase_bill'
): Promise<PurchaseBillEnvelope> =>
  toEnvelope((await api.get<EnvelopeWire>(DETAIL_PATH[kind](id), ubConfig({ signal }))).data);

/** The draft body (snake_case) — built by `view-model/purchaseBillForm.toWireBody`. */
export type PurchaseBillWireBody = Record<string, unknown>;

/** PUR-01 FR-6h — "Paid now" on the record call: PAY-01's `mode_breakup`, money as strings. */
export interface PurchasePaymentWireBody {
  readonly payment_date: string;
  readonly mode_breakup: readonly {
    mode: string;
    amount: string;
    reference: string;
    upi_app?: string;
  }[];
}

export const createPurchaseBill = async (
  body: PurchaseBillWireBody,
  options: { readonly quiet?: boolean; readonly kind?: PurchaseKind } = {}
): Promise<PurchaseBillEnvelope> =>
  toEnvelope(
    (
      await api.post<EnvelopeWire>(
        LIST_PATH[options.kind ?? 'purchase_bill'],
        body,
        ubConfig({ suppressErrorSnackbar: options.quiet ?? false })
      )
    ).data
  );

/** PATCH a draft; `quiet` for autosave, whose failures the header indicator shows. */
export const updatePurchaseBill = async (
  id: string,
  body: PurchaseBillWireBody,
  options: { readonly quiet?: boolean; readonly kind?: PurchaseKind } = {}
): Promise<PurchaseBillEnvelope> =>
  toEnvelope(
    (
      await api.patch<EnvelopeWire>(
        DETAIL_PATH[options.kind ?? 'purchase_bill'](id),
        body,
        ubConfig({ suppressErrorSnackbar: options.quiet ?? false })
      )
    ).data
  );

export const deletePurchaseBill = async (
  id: string,
  kind: PurchaseKind = 'purchase_bill'
): Promise<void> => {
  await api.delete(DETAIL_PATH[kind](id));
};

/**
 * Shop item 3 — an order's moves: `send` numbers it, `cancel` carries the reason,
 * `create-bill` answers 201 with the new DRAFT bill (whose envelope this returns).
 */
export const movePurchaseOrder = async (
  id: string,
  verb: 'send' | 'cancel' | 'create-bill',
  body: PurchaseBillWireBody = {}
): Promise<PurchaseBillEnvelope> =>
  toEnvelope((await api.post<EnvelopeWire>(API_PATHS.PURCHASE_ORDER_ACTION(id, verb), body)).data);

/**
 * BR-13 — the key is minted per logical Record and REUSED on a retry. The
 * duplicate-invoice 409 is shown in place as a banner, not as a toast.
 */
export const recordPurchaseBill = async (
  id: string,
  body: PurchaseBillWireBody,
  idempotencyKey: string
): Promise<PurchaseBillEnvelope> =>
  toEnvelope(
    (
      await api.post<EnvelopeWire>(
        API_PATHS.PURCHASE_BILL_RECORD(id),
        body,
        ubConfig({ headers: { 'Idempotency-Key': idempotencyKey } })
      )
    ).data
  );

/** PUR-04 — `insufficient_stock` is shown in the dialog, so this call is quiet. */
export const voidPurchaseBill = async (id: string, reason: string): Promise<PurchaseBillEnvelope> =>
  toEnvelope(
    (
      await api.post<EnvelopeWire>(
        API_PATHS.PURCHASE_BILL_VOID(id),
        { reason },
        ubConfig({ suppressErrorSnackbar: true })
      )
    ).data
  );

/** Shop P0 — what goes back on a debit note: the bill's line and how many. */
export interface DebitNoteWireBody {
  readonly against_id: string;
  readonly document_date: string;
  readonly reason: string;
  readonly reason_note: string;
  readonly restock: boolean;
  readonly lines: readonly { bill_line_no: number; qty: string }[];
}

/** PUR-07 — written and issued in one call; `insufficient_stock` is shown in the drawer. */
export const issueDebitNote = async (
  body: DebitNoteWireBody,
  idempotencyKey: string
): Promise<PurchaseBillEnvelope> =>
  toEnvelope(
    (
      await api.post<EnvelopeWire>(
        API_PATHS.DEBIT_NOTES,
        body,
        ubConfig({ suppressErrorSnackbar: true, headers: { 'Idempotency-Key': idempotencyKey } })
      )
    ).data
  );

export const voidDebitNote = async (id: string, reason: string): Promise<PurchaseBillEnvelope> =>
  toEnvelope((await api.post<EnvelopeWire>(API_PATHS.DEBIT_NOTE_VOID(id), { reason })).data);
