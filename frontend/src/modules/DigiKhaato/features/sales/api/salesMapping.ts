import type {
  DocumentOrigin,
  InvoiceListPage,
  InvoiceListRow,
  PaymentBreakupRow,
  SalesDocument,
} from '../types/sales.types';
import type {
  CreditNoteReason,
  RefundRecord,
  SalesCreditUse,
  SalesDocRef,
  SalesDocumentLinks,
  Settlement,
  UnallocatedPayment,
} from '../types/salesFlows.types';

/**
 * The snake ⇄ camel mapping every sales service shares: list rows and pages,
 * and SAL-01/04/05's additions to the document (`links`, validity, void).
 * No request is made here, so each `<x>Service.ts` imports only what it maps.
 */

type Wire = Record<string, unknown>;
const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const sn = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

/** A5 — `origin: {module, type, id, label} | null`. */
export const toOrigin = (raw: unknown): DocumentOrigin | null => {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Wire;
  return { module: s(row.module), type: s(row.type), id: s(row.id), label: sn(row.label) };
};

export const toListRow = (row: Wire): InvoiceListRow => ({
  origin: toOrigin(row.origin),
  id: s(row.id),
  kind: row.kind as InvoiceListRow['kind'],
  number: sn(row.number),
  status: row.status as InvoiceListRow['status'],
  party: (row.party as InvoiceListRow['party']) ?? null,
  walkInName: sn(row.walk_in_name),
  walkInMobileMasked: sn(row.walk_in_mobile_masked),
  documentDate: s(row.document_date),
  dueOn: sn(row.due_on),
  validUntil: sn(row.valid_until),
  grandTotal: s(row.grand_total),
  amountPaid: s(row.amount_paid),
  amountDue: s(row.amount_due),
  isOverdue: Boolean(row.is_overdue),
  voidReason: sn(row.void_reason),
  createdBy: (row.created_by as InvoiceListRow['createdBy']) ?? null,
});

export const toListPage = <TTabs>(
  data: Wire[],
  meta: Wire
): Omit<InvoiceListPage, 'tabs'> & { tabs: TTabs } => {
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
    tabs: meta.tabs as TTabs,
  };
};

const toRef = (raw: unknown): SalesDocRef | null => {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Wire;
  return {
    id: s(row.id),
    kind: s(row.kind),
    number: sn(row.number),
    documentDate: sn(row.document_date),
    status: s(row.status),
    grandTotal: s(row.grand_total),
  };
};

const toUses = (raw: unknown): SalesCreditUse[] =>
  ((raw ?? []) as Wire[]).map((row) => ({
    ...(toRef(row) as SalesDocRef),
    amount: s(row.amount),
  }));

const toRefund = (raw: unknown): RefundRecord | null => {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Wire;
  return {
    paymentDate: s(row.payment_date),
    modeBreakup: ((row.mode_breakup ?? []) as Wire[]).map((r) => ({
      mode: r.mode as PaymentBreakupRow['mode'],
      amount: s(r.amount),
      reference: s(r.reference),
    })),
  };
};

export const toLinks = (raw: unknown): SalesDocumentLinks => {
  const row = (raw ?? {}) as Wire;
  const reason = (row.reason ?? {}) as Wire;
  return {
    convertedTo: toRef(row.converted_to),
    convertedFrom: toRef(row.converted_from),
    creditNotes: ((row.credit_notes ?? []) as Wire[]).map((r) => toRef(r) as SalesDocRef),
    creditApplications: toUses(row.credit_applications),
    against: toRef(row.against),
    applications: toUses(row.applications),
    refund: toRefund(row.refund),
    reason: { code: (reason.code as CreditNoteReason | null) ?? null, note: s(reason.note) },
    restock: row.restock === undefined ? true : Boolean(row.restock),
    settlement: (row.settlement as Settlement | undefined) ?? 'hold_advance',
    openCredit: sn(row.open_credit),
  };
};

/** SAL-01/04/05 — the document fields the invoice core did not carry. */
export const toFlowFields = (
  row: Wire
): Pick<SalesDocument, 'validUntil' | 'voidedAt' | 'voidReason' | 'links' | 'origin'> => ({
  origin: toOrigin(row.origin),
  validUntil: sn(row.valid_until),
  voidedAt: sn(row.voided_at),
  voidReason: sn(row.void_reason),
  links: toLinks(row.links),
});

export const toUnallocated = (raw: unknown): UnallocatedPayment[] =>
  ((raw ?? []) as Wire[]).map((row) => ({
    paymentId: sn(row.payment_id),
    number: sn(row.number),
    amount: s(row.amount),
    walkIn: Boolean(row.walk_in),
  }));
