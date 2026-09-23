import { creditCaption, creditTone, showsCreditBar } from './creditDisplay';

import type { PartyCredit } from '../types/party.types';

const credit = (overrides: Partial<PartyCredit>): PartyCredit => ({
  limit: '50000.00',
  days: 30,
  exposure: '10000.00',
  available: '40000.00',
  overBy: '0.00',
  usagePct: 20,
  mode: 'warn',
  status: 'ok',
  ...overrides,
});

describe('creditTone', () => {
  /**
   * FR-10's bands, and they are deliberately NOT the plan meter's.
   *
   * A plan quota turns amber at 80 % because the next member is the problem. A
   * credit limit turns amber at 70 % because the merchant needs TIME — a
   * customer at seven tenths of their cap is somebody to ring this week, not
   * somebody to stop at the counter.
   */
  it('is calm well inside the limit', () => {
    expect(creditTone(0)).toBe('success');
    expect(creditTone(69)).toBe('success');
  });

  it('turns amber at seven tenths, not eight', () => {
    expect(creditTone(70)).toBe('warning');
    expect(creditTone(99)).toBe('warning');
  });

  it('turns red only once the limit is actually crossed', () => {
    /** 100 % is AT the limit and is over nothing (EC-12) — but a bar that is
     *  full has no headroom left, and that is the thing to show in red. */
    expect(creditTone(100)).toBe('error');
    expect(creditTone(999)).toBe('error');
  });

  it('treats a party with no percentage as calm', () => {
    /** `null` is "no limit", and a party outside the question is not a
     *  problem. The bar is not drawn for them at all. */
    expect(creditTone(null)).toBe('success');
  });
});

describe('creditCaption', () => {
  it('says what is left when there is room', () => {
    expect(creditCaption(credit({ status: 'ok' }))).toEqual({
      id: 'parties.credit.left',
      /* GROUPED, and with no symbol: the ₹ belongs to the sentence, because
         Hindi puts it in the other order. Until this was formatted here the
         caption shipped as "₹40000.00 left of ₹50000.00". */
      values: { available: '40,000.00', limit: '50,000.00' },
    });
  });

  it('says how far over, and never with a minus sign', () => {
    /**
     * §23.2.6 rule 3, one layer away from `UbAmount` — which is exactly where
     * it has been reintroduced twice before in this module. A merchant does not
     * think "−₹1,700 available", they think "₹1,700 over". The direction is in
     * the wording.
     */
    const caption = creditCaption(
      credit({ status: 'over', available: '0.00', overBy: '1700.00' })
    );

    expect(caption.id).toBe('parties.credit.over');
    expect(caption.values).toEqual({ over: '1,700.00', limit: '50,000.00' });
    expect(JSON.stringify(caption)).not.toContain('-');
  });

  it('says what is left for a party who is merely near', () => {
    /** "Near" is a tone, not a different sentence: the merchant still wants to
     *  know the headroom, and "₹5,000 left of ₹50,000" is that. */
    expect(creditCaption(credit({ status: 'near', available: '5000.00' })).id).toBe(
      'parties.credit.left'
    );
  });
});

describe('showsCreditBar', () => {
  it('draws nothing for a party with no limit', () => {
    expect(showsCreditBar(null)).toBe(false);
  });

  it('draws nothing when the business has switched checks off', () => {
    /**
     * FR-10. The limit is still data and still editable in that state (§9,
     * "Disabled") — what is hidden is the METER, because a meter for a rule
     * nobody is enforcing is a number inviting a decision the product will not
     * act on.
     */
    expect(showsCreditBar(credit({ mode: 'off' }))).toBe(false);
  });

  it('draws for both of the modes that mean something', () => {
    expect(showsCreditBar(credit({ mode: 'warn' }))).toBe(true);
    expect(showsCreditBar(credit({ mode: 'block' }))).toBe(true);
  });
});
