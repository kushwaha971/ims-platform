import { formatAmount } from 'src/utils/money';

import type { PartyCredit } from '../types/party.types';

/**
 * PTY-06 — turning the credit block into a bar, a tone and a sentence.
 *
 * Part 19 §19.1.1 layer 3. Everything here is a pure function of the server's
 * own figures: the percentage is computed with `Decimal` server-side and
 * arrives as an integer, and the rupees arrive as strings. Nothing in this file
 * does money arithmetic, and that is the point — dividing two floats parsed
 * from decimal strings is exactly what canon rule 3 forbids, and a client that
 * recomputed the percentage would eventually disagree with the caption beside
 * it by a point.
 */

/**
 * FR-10's bands, and they are not the plan meter's.
 *
 * A plan quota turns amber at 80 % because the next member is the problem. A
 * credit limit turns amber at 70 % because the merchant needs TIME — a customer
 * at seven tenths of their cap is somebody to ring this week, not somebody to
 * stop at the counter. Two meters measuring different things do not share a
 * scale.
 */
export const CREDIT_WARN_PCT = 70;
export const CREDIT_OVER_PCT = 100;

export type CreditTone = 'success' | 'warning' | 'error';

export const creditTone = (usagePct: number | null): CreditTone => {
  if (usagePct === null) return 'success';
  if (usagePct >= CREDIT_OVER_PCT) return 'error';
  if (usagePct >= CREDIT_WARN_PCT) return 'warning';
  return 'success';
};

export interface CreditCaption {
  /** `parties.credit.left` or `parties.credit.over`. */
  readonly id: string;
  readonly values: Readonly<Record<string, string>>;
}

/**
 * The line under the bar, as a message id and its values.
 *
 * Two sentences rather than one with a sign, for the reason §23.2.6 rule 3
 * gives about every figure in this product: a merchant does not think
 * "−₹1,700 available", they think "₹1,700 over". The direction is in the
 * wording and never in a minus sign.
 *
 * The caption is what makes the colour non-essential (R-A-2): a reader who
 * cannot tell amber from red reads the same fact in the same place.
 *
 * ── The figures are GROUPED here, and the ₹ is in the copy ────────────────
 * `formatAmount`, not `formatInr`: the message is "₹{available} left of
 * ₹{limit}" and the symbol belongs to the sentence rather than to the number,
 * because Hindi puts them in the other order — "₹{limit} में से ₹{available}
 * बचे". A formatter that carried the symbol would put it in the wrong place in
 * one of the two languages, every time.
 *
 * Formatting here rather than in the component is what stops the caption
 * shipping as "₹40000.00 left of ₹50000.00", which is what it did until a test
 * read the rendered text rather than the message id.
 */
export const creditCaption = (credit: PartyCredit): CreditCaption =>
  credit.status === 'over'
    ? {
        id: 'parties.credit.over',
        values: { over: formatAmount(credit.overBy), limit: formatAmount(credit.limit) },
      }
    : {
        id: 'parties.credit.left',
        values: {
          available: formatAmount(credit.available),
          limit: formatAmount(credit.limit),
        },
      };

/**
 * Should the bar be drawn at all?
 *
 * Not when the tenant has switched checks off (FR-10). The limit is still data
 * and still editable in that state (§9, "Disabled") — what is hidden is the
 * meter, because a meter for a rule nobody is enforcing is a number that
 * invites a decision the product is not going to act on.
 */
export const showsCreditBar = (credit: PartyCredit | null): credit is PartyCredit =>
  credit !== null && credit.mode !== 'off';
