import type { ShowSnackbarPayload } from 'src/redux/slice/snackbarSlice';
import { compareMoney, formatInr, sumMoney } from 'src/utils/money';

import type { PurchaseBillEnvelope } from '../types/purchase.types';

/*
 * PUR-02 — what the record and the void say in the snackbar. A module of its
 * own rather than lines in `purchaseBillDisplay.ts`, because the EDITOR imports
 * it statically and that module brings the list's period presets with it — and
 * those drag the payment-mode labels' catalogue into the editor's first paint.
 */

/**
 * §8 / PUR-02 FR-8 — the record toast in the supplier's terms. The khata's
 * balance after the record (and any "Paid now") decides the words, because a
 * payment can leave the supplier settled or holding an advance, and "You will
 * give ₹200" about a supplier who owes US ₹200 is the wrong way round.
 * `formatInr` here: these message strings carry no ₹ of their own.
 */
export const recordedToast = (
  result: PurchaseBillEnvelope,
  fallbackName: string
): ShowSnackbarPayload => {
  const balance = result.partyBalance ?? '0.00';
  const base = {
    number: result.bill.number ?? '',
    name: result.bill.partySnapshot?.name || fallbackName,
    amount: formatInr(balance.replace('-', '')),
  };
  if (!result.payment) {
    return { severity: 'success', id: 'purchases.editor.recorded', params: base };
  }
  const params = { ...base, paid: formatInr(result.payment.amount) };
  const sign = compareMoney(balance, '0.00');
  const id =
    sign < 0
      ? 'purchases.editor.recordedPaid'
      : sign === 0
        ? 'purchases.editor.recordedSettled'
        : 'purchases.editor.recordedAdvance';
  return { severity: 'success', id, params };
};

/** PUR-02 BR-4 — "₹600 stays as advance": the payments a void released, summed. */
export const releasedTotal = (result: PurchaseBillEnvelope): string | null =>
  result.releasedPayments.length
    ? sumMoney(result.releasedPayments.map((row) => row.amount))
    : null;
