import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';
import type { PaymentMode, UpiApp } from 'src/types/domain.types';
import { toQueryString } from 'src/utils/queryString';

import type {
  AllocateResult,
  CollectQr,
  OpenDocument,
  Payment,
  PaymentAllocation,
  PaymentBucket,
  PaymentDirection,
  PaymentFilters,
  PaymentFormValues,
  PaymentModeLine,
  PaymentPage,
  PaymentParty,
  PaymentPerson,
  PaymentRow,
  PaymentSaveResult,
  PaymentStatus,
} from '../types/payment.types';

/**
 * Part 19 §19.3.4 — PAY-01 … PAY-05's endpoints. One async function each, the
 * snake ⇄ camel mapping and nothing else: no React, no Redux, no `Ub*`.
 */

// ── Wire shapes ──────────────────────────────────────────────────────────────

type Wire = Record<string, unknown>;

interface ModeLineApi {
  readonly mode: PaymentMode;
  readonly amount: string;
  readonly reference?: string;
  readonly upi_app?: UpiApp;
}

interface PaymentRowApi {
  readonly id: string;
  readonly number: string;
  readonly direction: PaymentDirection;
  readonly party: PaymentParty | null;
  readonly payment_date: string;
  readonly amount: string;
  readonly primary_mode: PaymentMode;
  readonly modes_count: number;
  readonly reference: string;
  readonly status: PaymentStatus;
  readonly unallocated_amount: string;
  readonly allocated_amount: string;
}

interface PaymentApi {
  readonly id: string;
  readonly number: string;
  readonly direction: PaymentDirection;
  readonly party: PaymentParty | null;
  readonly payment_date: string;
  readonly amount: string;
  readonly mode_breakup: readonly ModeLineApi[];
  readonly primary_mode: PaymentMode;
  readonly reference: string;
  readonly note: string;
  readonly status: PaymentStatus;
  readonly unallocated_amount: string;
  readonly allocations: readonly Wire[];
  readonly party_balance_after: string | null;
  readonly context: string | null;
  readonly business: Wire;
  readonly void_reason: string | null;
  readonly voided_at: string | null;
  readonly voided_by: PaymentPerson | null;
  readonly created_by: PaymentPerson | null;
  readonly created_at: string;
  /** A4a — additive; absent from an older server. */
  readonly bucket?: PaymentBucket;
  /** A4b — additive: the other half of a deposit adjustment, or null. */
  readonly deposit_pair?: Wire | null;
}

interface WriteResponse {
  readonly data: PaymentApi;
  readonly meta?: {
    readonly party_balance?: string;
    readonly documents?: readonly { document_id: string; status: string; amount_due: string }[];
  } | null;
}

// ── Mappers ─────────────────────────────────────────────────────────────────

const s = (value: unknown): string => (typeof value === 'string' ? value : '');
const sn = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export const toModeLine = (row: ModeLineApi): PaymentModeLine => ({
  mode: row.mode,
  amount: row.amount,
  reference: row.reference ?? '',
  upiApp: row.upi_app ?? null,
});

const toAllocation = (row: Wire): PaymentAllocation => ({
  documentType: s(row.document_type),
  documentId: s(row.document_id),
  number: sn(row.number),
  kind: sn(row.kind),
  documentDate: sn(row.document_date),
  status: sn(row.status),
  amountDue: sn(row.amount_due),
  amount: s(row.amount),
  appliedLaterOn: sn(row.applied_later_on),
  label: sn(row.label),
});

export const toPaymentRow = (row: PaymentRowApi): PaymentRow => ({
  id: row.id,
  number: row.number,
  direction: row.direction,
  party: row.party,
  paymentDate: row.payment_date,
  amount: row.amount,
  primaryMode: row.primary_mode,
  modesCount: row.modes_count,
  reference: row.reference ?? '',
  status: row.status,
  unallocatedAmount: row.unallocated_amount,
  allocatedAmount: row.allocated_amount,
});

/** A4b — `deposit_pair`, or null for every payment that is not half of an adjustment. */
const toDepositPair = (pair: Wire | null | undefined): Payment['depositPair'] => {
  if (!pair) return null;
  const partner = (pair.partner ?? {}) as Wire;
  return {
    applicationId: s(pair.application_id),
    amount: s(pair.amount),
    depositId: s(pair.deposit_id),
    partnerNumber: s(partner.number),
    voided: pair.voided === true,
  };
};

export const toPayment = (row: PaymentApi): Payment => ({
  id: row.id,
  number: row.number,
  direction: row.direction,
  party: row.party,
  paymentDate: row.payment_date,
  amount: row.amount,
  modeBreakup: row.mode_breakup.map(toModeLine),
  primaryMode: row.primary_mode,
  reference: row.reference ?? '',
  note: row.note ?? '',
  status: row.status,
  unallocatedAmount: row.unallocated_amount,
  allocations: row.allocations.map(toAllocation),
  partyBalanceAfter: row.party_balance_after,
  context: row.context,
  business: {
    name: s(row.business?.name),
    legalName: sn(row.business?.legal_name),
    gstin: sn(row.business?.gstin),
    phone: sn(row.business?.phone),
    address: (row.business?.address ?? {}) as Record<string, string>,
    upiVpa: sn(row.business?.upi_vpa),
  },
  voidReason: row.void_reason,
  voidedAt: row.voided_at,
  voidedBy: row.voided_by,
  createdBy: row.created_by,
  createdAt: row.created_at,
  bucket: row.bucket ?? 'main',
  depositPair: toDepositPair(row.deposit_pair),
});

const toSaveResult = (body: WriteResponse): PaymentSaveResult => ({
  payment: toPayment(body.data),
  partyBalance: body.meta?.party_balance ?? null,
  documents: (body.meta?.documents ?? []).map((d) => ({
    documentId: d.document_id,
    status: d.status,
    amountDue: d.amount_due,
  })),
});

/**
 * The POST body. The server derives `amount` and `primary_mode` from the lines
 * (PAY-02 BR-1), so the client sends lines only. A cash line sends no
 * reference, and only a UPI line sends an app.
 *
 * Allocations: `"auto"` when the switch is on; otherwise the rows with an
 * amount, and `[]` (all advance) when none has one.
 */
export const toWireBody = (values: PaymentFormValues): Record<string, unknown> => ({
  direction: values.direction,
  party_id: values.partyId || null,
  payment_date: values.paymentDate,
  note: values.note.trim(),
  mode_breakup: values.lines.map((line) => ({
    mode: line.mode,
    amount: line.amount,
    ...(line.mode !== 'cash' && line.reference.trim() ? { reference: line.reference.trim() } : {}),
    ...(line.mode === 'upi' && line.upiApp ? { upi_app: line.upiApp } : {}),
  })),
  allocations: values.autoAllocate
    ? 'auto'
    : values.allocations
        .filter((row) => row.amount && row.amount !== '0' && row.amount !== '0.00')
        .map((row) => ({
          document_type: row.documentType,
          document_id: row.documentId,
          amount: row.amount,
        })),
});

/** The list query for a set of filters — shared by the page and its tests. */
export const paymentListQuery = (filters: PaymentFilters): string =>
  toQueryString({
    date_from: filters.dateFrom || undefined,
    date_to: filters.dateTo || undefined,
    direction: filters.tab === 'in' || filters.tab === 'out' ? filters.tab : undefined,
    status: filters.tab === 'void' ? 'void' : undefined,
    mode: filters.mode || undefined,
    q: filters.q.trim() || undefined,
    page: filters.page > 1 ? filters.page : undefined,
  });

// ── Endpoints ───────────────────────────────────────────────────────────────

export const listPayments = async (
  filters: PaymentFilters,
  signal?: AbortSignal
): Promise<PaymentPage> => {
  const response = await api.get<{
    data: readonly PaymentRowApi[];
    meta: {
      page: number;
      page_size: number;
      total: number;
      totals: {
        count: number;
        count_in?: number;
        count_out?: number;
        amount_in: string;
        amount_out: string;
      };
    };
  }>(`${API_PATHS.PAYMENTS}${paymentListQuery(filters)}`, ubConfig({ signal }));
  const { data, meta } = response.data;
  return {
    rows: data.map(toPaymentRow),
    totals: {
      count: meta.totals.count,
      countIn: meta.totals.count_in ?? 0,
      countOut: meta.totals.count_out ?? 0,
      amountIn: meta.totals.amount_in,
      amountOut: meta.totals.amount_out,
    },
    page: meta.page,
    pageSize: meta.page_size,
    total: meta.total,
  };
};

export const getPayment = async (id: string, signal?: AbortSignal): Promise<Payment> => {
  const response = await api.get<{ data: PaymentApi }>(API_PATHS.PAYMENT(id), ubConfig({ signal }));
  return toPayment(response.data.data);
};

export const listOpenDocuments = async (
  partyId: string,
  direction: PaymentDirection,
  signal?: AbortSignal,
  /** A4a — Apply to bills asks for the payment's bucket; the record panel sends none. */
  bucket?: PaymentBucket
): Promise<readonly OpenDocument[]> => {
  const response = await api.get<{ data: readonly Wire[] }>(
    `${API_PATHS.PAYMENTS_OPEN_DOCUMENTS}${toQueryString({ party_id: partyId, direction, bucket })}`,
    ubConfig({ signal })
  );
  return response.data.data.map((row) => ({
    documentType: s(row.document_type),
    documentId: s(row.document_id),
    number: s(row.number),
    documentDate: s(row.document_date),
    dueOn: sn(row.due_on),
    grandTotal: s(row.grand_total),
    amountDue: s(row.amount_due),
    status: s(row.status),
  }));
};

/**
 * Record one payment. `idempotencyKey` is minted per logical save and REUSED on
 * a retry, so a slow-but-successful first attempt never becomes two receipts.
 */
export const recordPayment = async (
  values: PaymentFormValues,
  idempotencyKey: string,
  context: string
): Promise<PaymentSaveResult> => {
  const response = await api.post<WriteResponse>(
    API_PATHS.PAYMENTS,
    { ...toWireBody(values), context },
    ubConfig({ headers: { 'Idempotency-Key': idempotencyKey } })
  );
  return toSaveResult(response.data);
};

/**
 * A4a (PLT-X03) — apply part of a payment's advance to open documents. Posts no khata line: the
 * money was on the khata already. `idempotencyKey` is minted per logical apply and reused on a
 * retry, so a slow first attempt never applies twice.
 */
export const allocateExisting = async (
  id: string,
  body: {
    readonly allocations:
      | 'auto'
      | readonly {
          readonly documentType: string;
          readonly documentId: string;
          readonly amount: string;
        }[];
    readonly reason?: string;
  },
  idempotencyKey: string
): Promise<AllocateResult> => {
  const response = await api.post<{
    data: {
      payment: PaymentApi;
      allocations: readonly Wire[];
      documents: readonly Wire[];
    };
    meta?: { party_balance?: string } | null;
  }>(
    API_PATHS.PAYMENT_ALLOCATIONS(id),
    {
      allocations:
        body.allocations === 'auto'
          ? 'auto'
          : body.allocations.map((row) => ({
              document_type: row.documentType,
              document_id: row.documentId,
              amount: row.amount,
            })),
      reason: body.reason ?? '',
    },
    ubConfig({ headers: { 'Idempotency-Key': idempotencyKey } })
  );
  const { data, meta } = response.data;
  return {
    payment: toPayment(data.payment),
    applied: data.allocations.map((row) => ({
      documentType: s(row.document_type),
      documentId: s(row.document_id),
      number: sn(row.number),
      amount: s(row.amount),
    })),
    partyBalance: meta?.party_balance ?? null,
  };
};

export const voidPayment = async (
  id: string,
  reason: string,
  idempotencyKey: string
): Promise<PaymentSaveResult> => {
  const response = await api.post<WriteResponse>(
    API_PATHS.PAYMENT_VOID(id),
    { reason },
    ubConfig({ headers: { 'Idempotency-Key': idempotencyKey } })
  );
  return toSaveResult(response.data);
};

/** PAY-04 BR-4 — the server writes the words; the client only hands them over. */
export const shareReceipt = async (
  id: string,
  locale: string,
  idempotencyKey: string
): Promise<{ readonly text: string; readonly mobile: string | null }> => {
  const response = await api.post<{ data: { text: string; mobile: string | null } }>(
    API_PATHS.PAYMENT_SHARE(id),
    { locale, channel: 'whatsapp' },
    ubConfig({ headers: { 'Idempotency-Key': idempotencyKey } })
  );
  return response.data.data;
};

/** PAY-03 — the Collect QR (dynamic with an amount, static without). */
export const createUpiIntent = async (body: {
  readonly amount?: string;
  readonly partyId?: string;
}): Promise<CollectQr> => {
  const response = await api.post<{ data: Wire }>(
    API_PATHS.PAYMENTS_UPI_INTENT,
    {
      ...(body.amount ? { amount: body.amount } : {}),
      ...(body.partyId ? { party_id: body.partyId } : {}),
    },
    ubConfig({ suppressErrorSnackbar: true })
  );
  const data = response.data.data;
  const qr = (data.qr ?? {}) as { size?: number; modules?: readonly string[] };
  return {
    upiUrl: s(data.upi_url),
    amount: sn(data.amount),
    vpa: s(data.vpa),
    payee: s(data.payee),
    qr: { size: qr.size ?? 0, modules: qr.modules ?? [] },
  };
};
