import { compareMoney, isZeroAmount } from 'src/utils/money';

import type { ApplyRowForm, Payment } from '../types/payment.types';

/**
 * A4a (FRD 00 PLT-X03 §7) — what the receipt page decides about Apply to bills, with no import
 * that would carry another catalogue's message ids into the receipt route.
 */

/**
 * May this receipt be applied to later bills? The SERVER's rules restated so the page draws the
 * button only where it can work (the server decides): recorded, a party's (a walk-in receipt has
 * no khata, EC-1), money left over, and not a credit note's refund voucher (EC-5).
 */
export const canApplyAdvance = (
  payment: Pick<Payment, 'status' | 'party' | 'unallocatedAmount' | 'context'>
): boolean =>
  payment.status === 'recorded' &&
  payment.party !== null &&
  compareMoney(payment.unallocatedAmount, '0.00') > 0 &&
  payment.context !== 'refund';

/** The rows the request carries: only those with an amount (a row of 0 is dropped, BR-2). */
export const applyRequestRows = (
  rows: readonly ApplyRowForm[]
): { documentType: string; documentId: string; amount: string }[] =>
  rows
    .filter((row) => row.amount.trim() !== '' && !isZeroAmount(row.amount))
    .map((row) => ({
      documentType: row.documentType,
      documentId: row.documentId,
      amount: row.amount.trim(),
    }));
