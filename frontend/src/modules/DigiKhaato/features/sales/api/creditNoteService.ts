import { API_PATHS } from 'src/api/APIPaths';
import { api, ubConfig } from 'src/api/AxiosInstances';

import { toUnallocated } from './salesMapping';
import { toEnvelope } from './salesService';

import type { SalesDocumentEnvelope } from '../types/sales.types';
import type { VoidResult } from '../types/salesFlows.types';

/**
 * SAL-04 §14 / SAL-05 §14 — the credit note's writes, and the two voids.
 *
 * The editor issues in ONE request (`POST /credit-notes?issue=true`) with an
 * Idempotency-Key minted per logical issue and reused on a retry, exactly as
 * the bill's issue does (SAL-02 EC-8): a return is not something a merchant
 * saves half of and comes back to at the counter.
 */

type Wire = Record<string, unknown>;
interface EnvelopeWire {
  readonly data: Wire;
  readonly meta?: Wire | null;
}

export interface CreditNoteIssued extends SalesDocumentEnvelope {
  readonly invoice: {
    readonly id: string;
    readonly amountDue: string;
    readonly status: string;
  } | null;
}

const toInvoiceMeta = (meta: Wire | null | undefined): CreditNoteIssued['invoice'] => {
  const invoice = (meta ?? {}).invoice as Wire | undefined;
  return invoice
    ? {
        id: String(invoice.id),
        amountDue: String(invoice.amount_due),
        status: String(invoice.status),
      }
    : null;
};

export const createAndIssueCreditNote = async (
  body: Wire,
  idempotencyKey: string
): Promise<CreditNoteIssued> => {
  const response = await api.post<EnvelopeWire>(
    `${API_PATHS.SALES_CREDIT_NOTES}?issue=true`,
    body,
    ubConfig({ headers: { 'Idempotency-Key': idempotencyKey } })
  );
  return { ...toEnvelope(response.data), invoice: toInvoiceMeta(response.data.meta) };
};

/** FR-9 — open credit onto another unpaid bill of the same party. */
export const applyCreditNote = async (
  id: string,
  invoiceId: string,
  amount: string
): Promise<CreditNoteIssued> => {
  const response = await api.post<EnvelopeWire>(API_PATHS.SALES_CREDIT_NOTE_APPLY(id), {
    invoice_id: invoiceId,
    amount,
  });
  return { ...toEnvelope(response.data), invoice: toInvoiceMeta(response.data.meta) };
};

export type VoidedEnvelope = SalesDocumentEnvelope & { readonly voidResult: VoidResult };

const toVoided = (body: EnvelopeWire): VoidedEnvelope => {
  const envelope = toEnvelope(body);
  const meta = body.meta ?? {};
  return {
    ...envelope,
    voidResult: {
      documentId: envelope.document.id,
      unallocatedPayments: toUnallocated(meta.unallocated_payments),
      partyBalance: meta.party_balance === undefined ? null : String(meta.party_balance),
    },
  };
};

/**
 * SAL-05 — 409 `document_already_void` is the answer to a second tap.
 * A5 (R55) — `confirmOrigin` answers an origin's `document_origin_confirm` question.
 */
const voidBody = (reason: string, confirmOrigin?: boolean): Record<string, unknown> =>
  confirmOrigin ? { reason, confirm_origin: true } : { reason };

export const voidInvoice = async (
  id: string,
  reason: string,
  confirmOrigin?: boolean
): Promise<VoidedEnvelope> =>
  toVoided(
    (
      await api.post<EnvelopeWire>(
        API_PATHS.SALES_INVOICE_VOID(id),
        voidBody(reason, confirmOrigin)
      )
    ).data
  );

export const voidCreditNote = async (
  id: string,
  reason: string,
  confirmOrigin?: boolean
): Promise<VoidedEnvelope> =>
  toVoided(
    (
      await api.post<EnvelopeWire>(
        API_PATHS.SALES_CREDIT_NOTE_VOID(id),
        voidBody(reason, confirmOrigin)
      )
    ).data
  );
