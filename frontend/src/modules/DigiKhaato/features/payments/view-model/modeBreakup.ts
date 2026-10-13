import type { PaymentLineForm } from '../types/payment.types';
/**
 * The mode lines as the server takes them (`mode_breakup`). Shared by the payment
 * drawer and every other form that takes money with the same editor (QA F2: the
 * library's admission), so a reference or a UPI app is sent the same way everywhere.
 */
export const toModeBreakup = (
  lines: readonly PaymentLineForm[]
): readonly Record<string, string>[] =>
  lines.map((line) => ({
    mode: line.mode,
    amount: line.amount,
    ...(line.mode !== 'cash' && line.reference.trim() ? { reference: line.reference.trim() } : {}),
    ...(line.mode === 'upi' && line.upiApp ? { upi_app: line.upiApp } : {}),
  }));
