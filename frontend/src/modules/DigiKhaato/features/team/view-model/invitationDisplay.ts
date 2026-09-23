import type { InvitationStatus } from 'src/types/domain.types';

/**
 * Part 19 §19.1.1 layer 6 — pure functions, no React, no Redux, no `t()`.
 *
 * The one judgement here is that an invitation's STATUS and its EXPIRY are the
 * same fact told twice, and the row must tell it once. A `pending` row whose
 * `expires_at` is in the past is not pending — the server will refuse the token
 * — so the screen calls it expired rather than inviting the merchant to wait
 * for something that can never arrive.
 */

export type InvitationTone = 'info' | 'success' | 'warning' | 'neutral';

/** The status to SHOW, which is not always the status the server stored. */
export const effectiveStatus = (
  status: InvitationStatus,
  expiresAt: string,
  nowMs: number
): InvitationStatus => {
  if (status !== 'pending') return status;
  const expiry = Date.parse(expiresAt);
  // An unparseable date is not evidence of expiry; leave the server's word.
  if (Number.isNaN(expiry)) return status;
  return expiry <= nowMs ? 'expired' : 'pending';
};

export const statusTone = (status: InvitationStatus): InvitationTone => {
  switch (status) {
    case 'accepted':
      return 'success';
    case 'expired':
      return 'warning';
    case 'revoked':
      return 'neutral';
    default:
      return 'info';
  }
};

/**
 * Only a genuinely pending invitation can be revoked. Revoking an accepted one
 * is a different act (removing a member) on a different endpoint, and offering
 * it here would be a control that fails every time it is pressed.
 */
export const isRevocable = (status: InvitationStatus, expiresAt: string, nowMs: number): boolean =>
  effectiveStatus(status, expiresAt, nowMs) === 'pending';
