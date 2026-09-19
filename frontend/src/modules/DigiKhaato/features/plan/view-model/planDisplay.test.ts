import type { ApiErrorShape } from 'src/types/api.types';

import {
  findLimit,
  isAtLimit,
  isNearLimit,
  isUnlimited,
  limitPercent,
  nounIdFor,
  planContactAction,
  toPlanLimitHit,
} from './planDisplay';

import type { PlanLimit } from '../types/plan.types';

/**
 * PLT-15's pure layer, built to DEC-001: modules and the member count are the
 * only things gated at MVP, and the ledger is never capped.
 */
const error = (details: Record<string, unknown>): ApiErrorShape => ({
  code: 'plan_limit_reached',
  message: "Your plan's limit has been reached.",
  details,
  requestId: 'req_5',
  status: 403,
  warnings: [],
});

const limit = (over: Partial<PlanLimit> = {}): PlanLimit => ({
  key: 'max_users',
  limit: 3,
  used: 1,
  ...over,
});

describe('toPlanLimitHit — the two documented envelopes (FR-4 vs §22.1.1)', () => {
  /**
   * The envelope the server ACTUALLY sends. `plan_limit_reached` is a `D`
   * envelope — Part 22 §22.1.1: "the named keys listed in the cell, at the top
   * level of `details`, with their natural JSON types (amounts as strings,
   * counts as numbers)" — and `entitlements.raise_plan_limit` sends exactly
   * this, `support_contact` nested.
   *
   * Every other case in this describe block used the `F` field-map spelling
   * (`limit: ['3']`), which is what let `details[key][0]` look correct: it is
   * the one shape that indexing `[0]` happens to work on. Against the old
   * reader this test fails on the FIRST assertion, because `"max_users"[0]` is
   * the string `"m"` and fails `isPlanLimitKey`.
   */
  it('reads the scalar `D` envelope the server sends (Part 22 §22.1.1)', () => {
    const hit = toPlanLimitHit(
      error({
        limit_key: 'max_users',
        limit: 3,
        used: 3,
        plan_code: 'free',
        support_contact: {
          phone: '+919111111111',
          whatsapp: '+919000000000',
          email: 'support@metis.example',
        },
      })
    );

    expect(hit.limitKey).toBe('max_users');
    expect(hit.limit).toBe(3);
    expect(hit.used).toBe(3);
    // Not "f".
    expect(hit.planCode).toBe('free');
    expect(hit.supportContact.whatsapp).toBe('+919000000000');
    expect(hit.supportContact.phone).toBe('+919111111111');
    expect(hit.supportContact.email).toBe('support@metis.example');
  });

  it('keeps a zero limit as 0 rather than losing it to a falsy check', () => {
    const hit = toPlanLimitHit(error({ limit: 0, used: 0 }));
    expect(hit.limit).toBe(0);
    expect(hit.used).toBe(0);
  });

  it("reads PLT-15 FR-4's spelling: limit_key, limit, used, plan_code", () => {
    const hit = toPlanLimitHit(
      error({
        limit_key: ['max_users'],
        limit: ['3'],
        used: ['3'],
        plan_code: ['free'],
      })
    );

    expect(hit.limitKey).toBe('max_users');
    expect(hit.limit).toBe(3);
    expect(hit.used).toBe(3);
    expect(hit.planCode).toBe('free');
    expect(hit.requestId).toBe('req_5');
  });

  it("reads Part 22 §22.1.1's spelling: current and maximum", () => {
    // The two chapters disagree about this one envelope; the client cannot
    // choose which the backend ships, and dropping the numbers would leave the
    // dialog saying "limit reached" with nothing in it.
    const hit = toPlanLimitHit(error({ current: ['3'], maximum: ['3'] }));

    expect(hit.limit).toBe(3);
    expect(hit.used).toBe(3);
  });

  it('refuses a limit key that is not in the registry', () => {
    expect(toPlanLimitHit(error({ limit_key: ['max_elephants'] })).limitKey).toBeNull();
  });

  it('survives a 403 with no details at all', () => {
    const hit = toPlanLimitHit(error({}));
    expect(hit.limitKey).toBeNull();
    expect(hit.limit).toBeNull();
    expect(hit.used).toBeNull();
    // The server's own sentence is still shown, so the dialog is never blank.
    expect(hit.message).toContain('limit');
  });

  /**
   * `support_contact` is a NESTED object on the wire. This case used to build
   * it as two literal flat keys — `'support_contact.whatsapp'` — a spelling
   * the server has never emitted, so it certified that the contact block
   * worked while every real 403 left `planContactAction` with nothing to
   * offer and PLT-15 FR-6 with no route to a human.
   */
  it('keeps the partner support contact, which arrives nested', () => {
    const hit = toPlanLimitHit(
      error({
        support_contact: { whatsapp: '+919000000000', name: 'Metis' },
      })
    );
    expect(hit.supportContact.whatsapp).toBe('+919000000000');
    expect(hit.supportContact.name).toBe('Metis');
    expect(planContactAction(hit.supportContact, 'help')?.channel).toBe('whatsapp');
  });

  it('survives a details value of an unexpected shape rather than throwing', () => {
    const hit = toPlanLimitHit(error({ limit_key: { nope: true }, limit: null, used: [] }));
    expect(hit.limitKey).toBeNull();
    expect(hit.limit).toBeNull();
    expect(hit.used).toBeNull();
  });
});

describe('nounIdFor — FR-8', () => {
  it('names the limit the merchant hit', () => {
    expect(nounIdFor('max_users')).toBe('plan.noun.max_users');
    expect(nounIdFor('storage_mb')).toBe('plan.noun.storage_mb');
  });

  it('falls back to a generic noun rather than an empty sentence', () => {
    expect(nounIdFor(null)).toBe('plan.noun.generic');
  });
});

describe('planContactAction — FR-6', () => {
  const text = 'I need a higher limit.';

  it('prefers WhatsApp, which is the channel these merchants use', () => {
    const action = planContactAction(
      { whatsapp: '+91 90000 00000', phone: '+919111111111', email: 'a@b.c', name: 'Metis' },
      text
    );
    expect(action?.channel).toBe('whatsapp');
    expect(action?.href).toContain('https://wa.me/919000000000');
    expect(action?.href).toContain(encodeURIComponent(text));
  });

  it('falls back to a phone call, then to email', () => {
    expect(
      planContactAction(
        { whatsapp: null, phone: '+91 91111 11111', email: 'a@b.c', name: null },
        text
      )?.channel
    ).toBe('phone');
    expect(
      planContactAction({ whatsapp: null, phone: null, email: 'a@b.c', name: null }, text)?.channel
    ).toBe('email');
  });

  it('offers nothing rather than a dead link when the partner has no contact', () => {
    expect(
      planContactAction({ whatsapp: null, phone: null, email: null, name: null }, text)
    ).toBeNull();
  });
});

describe('limit arithmetic — DEC-001 keeps this to the member count', () => {
  it('treats a null limit as unlimited and never fills the bar', () => {
    const unlimited = limit({ limit: null, used: 999 });
    expect(isUnlimited(unlimited)).toBe(true);
    expect(limitPercent(unlimited)).toBe(0);
    expect(isNearLimit(unlimited)).toBe(false);
    expect(isAtLimit(unlimited)).toBe(false);
  });

  it('warns at 80 % and not before (FR-7)', () => {
    expect(isNearLimit(limit({ limit: 10, used: 7 }))).toBe(false);
    expect(isNearLimit(limit({ limit: 10, used: 8 }))).toBe(true);
  });

  it('stops warning and starts blocking at 100 %', () => {
    expect(isNearLimit(limit({ limit: 3, used: 3 }))).toBe(false);
    expect(isAtLimit(limit({ limit: 3, used: 3 }))).toBe(true);
  });

  it('tolerates usage above the limit after a downgrade (BR-3)', () => {
    // Over-limit usage is never trimmed; the meter just reads full.
    expect(limitPercent(limit({ limit: 3, used: 9 }))).toBe(100);
    expect(isAtLimit(limit({ limit: 3, used: 9 }))).toBe(true);
  });

  it('finds a limit by key and returns null rather than undefined', () => {
    const limits = [limit({ key: 'max_users' })];
    expect(findLimit(limits, 'max_users')?.limit).toBe(3);
    expect(findLimit(limits, 'storage_mb')).toBeNull();
  });
});
