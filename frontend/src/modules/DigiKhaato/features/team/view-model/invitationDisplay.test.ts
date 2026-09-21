import { effectiveStatus, isRevocable, statusTone } from './invitationDisplay';

/**
 * The one judgement this screen makes about data the server sends, isolated
 * from React so the boundary can be asserted exactly.
 */
const NOW = Date.parse('2026-09-21T12:00:00Z');
const soon = '2026-09-24T12:00:00Z';
const gone = '2026-09-21T11:59:59Z';

describe('effectiveStatus', () => {
  it('leaves a live pending invitation pending', () => {
    expect(effectiveStatus('pending', soon, NOW)).toBe('pending');
  });

  /**
   * A `pending` row whose `expires_at` has passed is not pending: the server
   * will refuse the token. Showing "Waiting" beside a Revoke control invited
   * the merchant to act on something that had already lapsed.
   */
  it('reads a lapsed pending invitation as expired', () => {
    expect(effectiveStatus('pending', gone, NOW)).toBe('expired');
  });

  /** The boundary is inclusive: at the instant it expires, it has expired. */
  it('treats the expiry instant itself as expired', () => {
    expect(effectiveStatus('pending', '2026-09-21T12:00:00Z', NOW)).toBe('expired');
  });

  it('never overrides a status the server has already decided', () => {
    expect(effectiveStatus('revoked', gone, NOW)).toBe('revoked');
    expect(effectiveStatus('accepted', gone, NOW)).toBe('accepted');
  });

  /**
   * An unparseable date is not evidence of expiry. Reading `NaN <= now` as
   * `false` is what stops a malformed field silently retiring a live
   * invitation, which is the failure the merchant cannot see or undo.
   */
  it('keeps the server’s word when the date cannot be parsed', () => {
    expect(effectiveStatus('pending', 'not-a-date', NOW)).toBe('pending');
  });
});

describe('isRevocable', () => {
  it('is true only for an invitation that is genuinely still open', () => {
    expect(isRevocable('pending', soon, NOW)).toBe(true);
    expect(isRevocable('pending', gone, NOW)).toBe(false);
    expect(isRevocable('accepted', soon, NOW)).toBe(false);
    expect(isRevocable('revoked', soon, NOW)).toBe(false);
    expect(isRevocable('expired', soon, NOW)).toBe(false);
  });
});

describe('statusTone', () => {
  /** Colour is never alone — the badge carries the word too — but it must not
   *  contradict the word: a revoked invitation is not a warning to act on. */
  it('gives each status a tone that agrees with what it means', () => {
    expect(statusTone('pending')).toBe('info');
    expect(statusTone('accepted')).toBe('success');
    expect(statusTone('expired')).toBe('warning');
    expect(statusTone('revoked')).toBe('neutral');
  });
});
