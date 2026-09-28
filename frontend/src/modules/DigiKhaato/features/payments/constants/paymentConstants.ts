/**
 * Payment constants, in a module that imports NOTHING — a lazily injected
 * slice and the shell-level launcher read them without dragging a schema or a
 * service into their chunk (the statement's `statementPeriod.ts` lesson).
 */

/** The list's period chips (the expense list's, so the two screens agree). */
export type PaymentPreset = 'today' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'thisFy' | 'custom';

export const PAYMENT_PRESETS: readonly PaymentPreset[] = [
  'today',
  'thisWeek',
  'thisMonth',
  'lastMonth',
  'thisFy',
  'custom',
];
export const DEFAULT_PAYMENT_PRESET: PaymentPreset = 'thisMonth';
export const PAYMENT_PAGE_SIZE = 25;

/** PAY-02 BR-5 — at most four mode lines. */
export const MAX_MODE_LINES = 4;

/** PAY-05 FR-2 — the quick reasons, as message ids. */
export const VOID_REASON_IDS: readonly string[] = [
  'payments.void.reason.wrongParty',
  'payments.void.reason.wrongAmount',
  'payments.void.reason.duplicate',
  'payments.void.reason.chequeBounced',
  'payments.void.reason.refunded',
];

/** PAY-02 §8 — the first line's mode is the one this device used last. */
export const LAST_MODE_KEY = 'ub.payments.lastMode';
