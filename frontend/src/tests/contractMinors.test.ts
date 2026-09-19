import { AxiosError, AxiosHeaders } from 'axios';


import { shouldToast, toApiError } from 'src/utils/apiError';
import { snakeToCamelPath } from 'src/utils/caseMapper';
import { REGEX } from 'src/utils/regexConstants';

import en from 'locales/en.json';
import hi from 'locales/hi.json';

import { GST_STATE_CODES } from 'modules/DigiKhaato/features/onboarding/constants/gstStates';
import { PLAN_LIMIT_KEYS } from 'modules/DigiKhaato/features/plan/types/plan.types';
import { nounIdFor } from 'modules/DigiKhaato/features/plan/view-model/planDisplay';

/**
 * The small contract drifts from reviews 01 and 02 that have no natural home in
 * a feature's own test file. Each one is a closed set that had drifted open.
 */

describe('the error-code registry is closed on the client too (m-5)', () => {
  const axios401 = (body?: unknown): AxiosError => {
    const error = new AxiosError('Unauthorized');
    error.response = {
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      config: { headers: new AxiosHeaders() },
      data: body,
    };
    return error;
  };

  /**
   * `mapStatusToCode(401)` returned `invalid_credentials`, which is in
   * `LOCALLY_PRESENTED` — so a 401 with no body was classified as "the login
   * screen is already showing this under the password field" when no login
   * screen was involved, and the failure was reported nowhere at all.
   */
  it('calls a bodyless 401 `unauthenticated`, not `invalid_credentials`', () => {
    const error = toApiError(axios401());

    expect(error.code).toBe('unauthenticated');
    // And therefore it is reported, rather than silently swallowed.
    expect(shouldToast(error)).toBe(true);
  });

  it('still takes the server at its word when the 401 names its own code', () => {
    const error = toApiError(
      axios401({ error: { code: 'invalid_credentials', message: 'Wrong password.' } })
    );

    expect(error.code).toBe('invalid_credentials');
    // PLT-02 AC-5 — one message, under the password field, and no toast.
    expect(shouldToast(error)).toBe(false);
  });
});

describe('no bulk case converter is reachable from the transport (m-7b)', () => {
  /**
   * The wire is snake_case and each service hand-maps its own shapes, so
   * nothing in this codebase double-converts a key. `camelizeKeys` and
   * `snakeifyKeys` were exported with no caller anywhere — a recursive
   * whole-payload converter sitting beside the transport layer, waiting for
   * someone to wire it into an interceptor and convert everything twice.
   */
  it('does not export a whole-payload converter', async () => {
    const mapper: Record<string, unknown> = await import('src/utils/caseMapper');

    expect(mapper.camelizeKeys).toBeUndefined();
    expect(mapper.snakeifyKeys).toBeUndefined();
  });

  it('keeps the per-KEY mapping the error path genuinely needs', () => {
    // Composed wire paths are not known ahead of time the way a service's own
    // shapes are, which is the one case a helper is still right for.
    expect(snakeToCamelPath('address.line_1')).toBe('address.line1');
    expect(snakeToCamelPath('lines.2.unit_price')).toBe('lines.2.unitPrice');
  });
});

describe('DEC-010 / DEC-001 left no orphan copy behind (m6)', () => {
  const keys = Object.keys(en);

  /**
   * Review 02 m6 listed `plan.noun.max_parties` and
   * `plan.noun.max_invoices_per_month` among six orphans left by DEC-001.
   * They are NOT orphans: `nounIdFor` builds `plan.noun.${key}` from a
   * `PlanLimitKey` at runtime, and `plan.types.ts` keeps all four keys in the
   * type ON PURPOSE — "the client renders whatever limit the server names in a
   * `plan_limit_reached`, and MEASURES only members". A grep for the literal
   * key finds nothing because the key is composed, not written.
   *
   * So this is m6's other remedy: the assertion that makes them live. Every
   * limit key the client can be handed has copy, and there is no copy for a
   * key it cannot be handed.
   */
  it('has exactly one noun per limit key the client can be handed', () => {
    const nouns = keys.filter((key) => key.startsWith('plan.noun.') && key !== 'plan.noun.generic');
    const expected = PLAN_LIMIT_KEYS.map((key) => nounIdFor(key));

    expect(nouns.sort()).toEqual([...expected].sort());
  });

  it('has no sign-up mobile copy, which CR-2026-09-19-D removed the field for', () => {
    expect(keys).not.toContain('auth.mobile.label');
    expect(keys).not.toContain('auth.mobile.hint');
  });

  it('has no OTP error copy, which left with the OTP screens', () => {
    // The codes stay in `ApiErrorCode` because the server's registry still has
    // them; the COPY does not, because a server error message arrives already
    // localised via `Accept-Language` and the client never mints one.
    expect(keys).not.toContain('errors.otp_invalid');
    expect(keys).not.toContain('errors.otp_throttled');
  });

  it('keeps en and hi exactly in step after the removals', () => {
    expect(Object.keys(hi).sort()).toEqual(keys.sort());
  });
});

describe('the GST state-code rule matches the server (m8)', () => {
  /**
   * EC-4 refuses `99` (Centre jurisdiction), and `StateCodeField` enforces it.
   * The client's regex was `/^\d{2}$/`, which accepts `00` and `99` — laxer
   * than the server, in the safe direction, but a rule that said nothing.
   */
  it('accepts every code in the closed list and nothing else', () => {
    GST_STATE_CODES.forEach((code) => {
      expect(REGEX.GST_STATE_CODE.test(code)).toBe(true);
    });

    ['00', '39', '40', '98', '99', '1', '100', 'ab'].forEach((code) => {
      expect(REGEX.GST_STATE_CODE.test(code)).toBe(false);
    });
  });

  it('is exactly as wide as the table, so the two cannot drift', () => {
    const matched = Array.from({ length: 100 }, (_, n) => String(n).padStart(2, '0')).filter(
      (code) => REGEX.GST_STATE_CODE.test(code)
    );

    expect(matched.sort()).toEqual([...GST_STATE_CODES].sort());
  });
});
