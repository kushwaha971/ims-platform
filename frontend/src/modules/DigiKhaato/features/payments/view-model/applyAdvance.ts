import { subtractMoney, sumMoney } from 'src/utils/money';

import { fifoPreview } from './paymentDisplay';

import type { ApplyRowForm, OpenDocument } from '../types/payment.types';

/**
 * A4a (FRD 00 PLT-X03 §2, §8) — Apply to bills, as pure decisions.
 *
 * The dialog's own helpers, loaded with its `dynamic()` chunk. What the receipt PAGE needs (may it
 * be applied at all, and the request's rows) is in `applyGate.ts`, which imports nothing of
 * `paymentDisplay.ts` — that module names message ids of the money catalogue the receipt route
 * does not load.
 */

/** The dialog's rows, pre-filled oldest first up to what is not yet applied (§8). */
export const applyPrefill = (
  documents: readonly OpenDocument[],
  unallocated: string
): ApplyRowForm[] => {
  const preview = fifoPreview(unallocated, documents);
  return documents.map((doc) => ({
    documentType: doc.documentType,
    documentId: doc.documentId,
    number: doc.number,
    documentDate: doc.documentDate,
    due: doc.amountDue,
    amount: preview.allocations[doc.documentId] ?? '',
  }));
};

const clean = (amount: string): string => (amount && amount.trim() ? amount.trim() : '0.00');

/** The footer: "Applying ₹1,770 · ₹1,230 stays as advance". */
export const applyTotals = (
  rows: readonly Pick<ApplyRowForm, 'amount'>[],
  unallocated: string
): { readonly applying: string; readonly remaining: string } => {
  const applying = sumMoney(rows.map((row) => clean(row.amount)));
  return { applying, remaining: subtractMoney(clean(unallocated), applying) };
};
