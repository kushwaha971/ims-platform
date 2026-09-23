/**
 * The form's field names, and the server-path → form-path map behind them.
 *
 * `applyServerErrors` needs the list to know which of the server's `details`
 * keys can be anchored on a control and which have to go to the form-level
 * block. A key that reaches neither is silently dropped, which is the one thing
 * error handling must never do — so the list lives beside the form values type
 * and a test asserts they match.
 */
export const LEDGER_ENTRY_FIELDS = [
  'direction',
  'amount',
  'entryDate',
  'note',
  'paymentMode',
  'reference',
] as const;

export type LedgerEntryField = (typeof LEDGER_ENTRY_FIELDS)[number];

/**
 * The two names that differ between the wire and the form.
 *
 * `applyServerErrors` converts snake_case to camelCase on its own, so most
 * fields need no entry — `payment_mode` becomes `paymentMode` without help.
 * These two are here because the conversion alone would not reach the control:
 * `entry_date` is `entryDate` (which the converter DOES handle, listed for
 * legibility), and `party_id` is not a form field at all — a server error about
 * the party belongs at form level, where the drawer prints it, rather than
 * against a control the merchant cannot see or fix.
 */
export const SERVER_FIELD_TO_FORM: Readonly<Record<string, string>> = {
  entry_date: 'entryDate',
  payment_mode: 'paymentMode',
};

/**
 * LED-03's form adds one field and drops none.
 *
 * A separate list rather than `[...LEDGER_ENTRY_FIELDS, 'reason']` spread at
 * the call site, for the reason the entry list exists at all: `applyServerErrors`
 * silently drops a `details` key that reaches neither a control nor the
 * form-level block, and "silently drops" is the one thing error handling must
 * never do. The list that decides it should be findable by the name of the form
 * it belongs to.
 */
export const LEDGER_CORRECTION_FIELDS = [
  'direction',
  'amount',
  'entryDate',
  'note',
  'paymentMode',
  'reference',
  'reason',
] as const;

export type LedgerCorrectionField = (typeof LEDGER_CORRECTION_FIELDS)[number];
