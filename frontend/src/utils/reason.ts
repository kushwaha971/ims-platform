/**
 * Imports nothing, on purpose: the shared text helpers ship on the sign-in
 * routes, and these constants would have added bytes to every one of them.
 */

/**
 * WP-03 D-04b — a reason the merchant must write (a void, a cancel, a
 * correction, an override) is three to 160 characters, the same bounds as the
 * server's `VOID_REASON_MIN` / `VOID_REASON_MAX` (a contract test keeps them
 * equal). Ten dialogs and eleven schemas used to write these numbers out.
 */
export const REASON_MIN_CHARS = 3;
export const REASON_MAX_CHARS = 160;

/** True once a reason has enough to say, spaces not counted. */
export const hasReason = (text: string | null | undefined): boolean =>
  (text ?? '').trim().length >= REASON_MIN_CHARS;
