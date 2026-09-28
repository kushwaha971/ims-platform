import Decimal from 'decimal.js-light';

import { computeDocumentTotals, type EngineGstType, type EngineResult } from './taxEngine';

import type { SalesDocument, SalesDocumentLine } from '../types/sales.types';
import type { CreditNoteFormValues, ReturnCaps } from '../validation/salesFlowSchemas';

/**
 * SAL-04 — the return form ⇄ the wire ⇄ the preview, mirroring
 * `services/credit_note_lines.py` so the figure the merchant watches is the
 * figure the server will store:
 *
 * * every tax-deciding value comes from the invoice line, including its
 *   SNAPSHOTTED rate (BR-1) — nothing is looked up at today's rate;
 * * an amount line discount and the line's share of the document discount
 *   are prorated by the returned fraction (FR-4), and the note carries the
 *   summed share as its own amount discount for the engine to spread.
 */

const HALF_UP = Decimal.ROUND_HALF_UP;
const q2 = (value: Decimal): Decimal => value.toDecimalPlaces(2, HALF_UP);
const num = (raw: string | null | undefined): Decimal => {
  const text = (raw ?? '').trim();
  return /^\d+(\.\d+)?$/.test(text) ? new Decimal(text) : new Decimal(0);
};

/** How much of an invoice line can still come back (`qty − returned_qty`). */
export const remainingQty = (line: SalesDocumentLine): number =>
  Math.max(Number(line.qty) - Number(line.returnedQty || '0'), 0);

export const returnCaps = (invoice: SalesDocument): ReturnCaps => ({
  remaining: Object.fromEntries(invoice.lines.map((line) => [line.id ?? '', remainingQty(line)])),
  invoiceDate: invoice.documentDate,
});

export const emptyCreditNoteForm = (
  invoice: SalesDocument,
  today: string
): CreditNoteFormValues => ({
  documentDate: today,
  reason: 'sales_return',
  reasonNote: '',
  restock: invoice.lines.some((line) => !!line.itemId),
  settlement: 'hold_advance',
  refundMode: 'cash',
  refundReference: '',
  lines: invoice.lines.map((line) => ({ againstLineId: line.id ?? '', qty: '' })),
});

interface Picked {
  readonly source: SalesDocumentLine;
  readonly qty: Decimal;
}

const picked = (invoice: SalesDocument, values: CreditNoteFormValues): Picked[] => {
  const byId = new Map(invoice.lines.map((line) => [line.id ?? '', line]));
  return values.lines.flatMap((row) => {
    const source = byId.get(row.againstLineId);
    const qty = num(row.qty);
    return source && qty.gt(0) ? [{ source, qty }] : [];
  });
};

/** The preview of what the server will compute for these quantities. */
export const creditNotePreview = (
  invoice: SalesDocument,
  values: CreditNoteFormValues
): EngineResult => {
  const rows = picked(invoice, values);
  let docDiscount = new Decimal(0);
  const lines = rows.map(({ source, qty }) => {
    const ratio = qty.div(num(source.qty));
    let discountValue = source.discountValue;
    if (source.discountType === 'amount' && discountValue !== null) {
      discountValue = q2(num(discountValue).times(ratio)).toFixed(2);
    }
    const share = invoice.docDiscountAllocation[String(source.lineNo)];
    if (share) docDiscount = docDiscount.plus(q2(num(share).times(ratio)));
    return {
      qty: qty.toString(),
      unitPrice: source.unitPrice,
      taxInclusive: source.taxInclusive,
      discountType: source.discountType,
      discountValue,
      rate: source.taxRate,
      cessRate: source.cessRate,
    };
  });
  return computeDocumentTotals({
    lines,
    gstType: invoice.supplier.gstType as EngineGstType,
    tenantState: invoice.supplier.stateCode,
    placeOfSupply: invoice.placeOfSupplyState,
    roundOffEnabled: invoice.roundOffEnabled,
    discountType: docDiscount.gt(0) ? 'amount' : null,
    discountValue: docDiscount.gt(0) ? docDiscount.toFixed(2) : null,
  });
};

/** A refund is sent only when something is left after the invoice's own due. */
const refunds = (values: CreditNoteFormValues, amount: string): boolean =>
  values.settlement === 'refund' && Number(amount) > 0;

/** The one-request issue body (`POST /credit-notes?issue=true`). */
export const creditNoteWireBody = (
  invoice: SalesDocument,
  values: CreditNoteFormValues,
  refundAmount: string
): Record<string, unknown> => ({
  against_id: invoice.id,
  document_date: values.documentDate,
  reason: values.reason,
  reason_note: values.reasonNote.trim(),
  restock: values.restock,
  settlement: refunds(values, refundAmount) ? 'refund' : 'hold_advance',
  refund: refunds(values, refundAmount)
    ? {
        payment_date: values.documentDate,
        mode_breakup: [
          {
            mode: values.refundMode,
            amount: refundAmount,
            reference: values.refundReference.trim(),
          },
        ],
      }
    : null,
  lines: picked(invoice, values).map(({ source, qty }) => ({
    against_line_id: source.id,
    qty: qty.toString(),
  })),
});

/**
 * BR-3 — how the credit will settle: first against the invoice's own due, the
 * rest held as an advance or refunded. The refund is the part the invoice does
 * not absorb (a refund of money never received would be a gift).
 */
export const settlementSplit = (
  invoice: SalesDocument,
  grandTotal: string
): { readonly applied: string; readonly left: string } => {
  const total = num(grandTotal);
  const due = num(invoice.amountDue);
  const applied = total.lt(due) ? total : due;
  return { applied: applied.toFixed(2), left: total.minus(applied).toFixed(2) };
};

/** §8 — "Stock +3 Cooking Oil · Ramesh −₹465.81", the parts in order. */
export const stockBackText = (invoice: SalesDocument, values: CreditNoteFormValues): string =>
  picked(invoice, values)
    .filter(({ source }) => !!source.itemId)
    .map(({ source, qty }) => `+${qty.toString()} ${source.description}`)
    .join(', ');
