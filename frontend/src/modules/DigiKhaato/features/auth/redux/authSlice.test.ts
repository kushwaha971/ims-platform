import { resetAllFeatureState } from 'src/redux/actions';
import type { ApiErrorShape } from 'src/types/api.types';

import authReducer, { authResultConsumed, resetRequestCleared, type AuthState } from './authSlice';
import {
  confirmPasswordReset,
  passwordLogin,
  requestOtp,
  requestPasswordReset,
  setPassword,
  verifyOtp,
} from './authThunk';

import type { AuthResult } from '../types/auth.types';

/**
 * R-RX-5 — every thunk handles all three lifecycle cases, and a reducer test is
 * where that is cheap to prove. Behaviour, not implementation (R-T-6).
 */
const initial = authReducer(undefined, { type: '@@init' }) as AuthState;

const AUTH_RESULT: AuthResult = {
  landing: null,
  userId: 'u1',
  name: 'Ramesh',
  email: 'ramesh@example.com',
  mobile: null,
  locale: 'en',
  isNew: false,
  hasPassword: true,
  mustChangePassword: false,
  passwordExpiresAt: null,
  activeTenantId: 't1',
  tenants: [
    {
      id: 't1',
      name: 'Sharma',
      timezone: 'Asia/Kolkata',
      role: 'owner',
      isDefault: true,
      status: 'active',
      membershipId: 'm1',
      onboardingStep: 4,
    },
  ],
  permissions: [],
  enabledModules: [],
};

const error = (
  code: ApiErrorShape['code'],
  details: Record<string, unknown> = {}
): ApiErrorShape => ({
  code,
  message: 'nope',
  details,
  requestId: 'req_1',
  status: 400,
  warnings: [],
});

describe('authSlice — mobile + OTP (owner, 9 Oct 2026)', () => {
  const sent = (_now: number) =>
    authReducer(initial, {
      type: requestOtp.fulfilled.type,
      payload: { challengeId: 'c-1', expiresIn: 600, retryAfter: 60 },
      meta: { arg: { mobile: '+919845011122' }, requestId: 'r' },
    });

  it('holds the number, the challenge and the resend moment as a DEADLINE', () => {
    const before = Date.now();
    const state = sent(before);
    expect(state.otp?.mobile).toBe('+919845011122');
    expect(state.otp?.challengeId).toBe('c-1');
    // An absolute moment, so a backgrounded tab comes back to the right number.
    expect(state.otp?.resendAt).toBeGreaterThanOrEqual(before + 60_000);
    expect(state.otp?.resendAt).toBeLessThanOrEqual(Date.now() + 60_000);
  });

  it('moves the resend deadline when the server refuses an early resend', () => {
    const state = authReducer(sent(Date.now()), {
      type: requestOtp.rejected.type,
      payload: error('otp_throttled' as ApiErrorShape['code'], { retry_after: 45 }),
      meta: { arg: { mobile: '+919845011122' }, aborted: false, requestId: 'r' },
    });
    expect(state.otp?.resendAt).toBeLessThanOrEqual(Date.now() + 45_000);
    expect(state.otp?.resendAt).toBeGreaterThan(Date.now() + 40_000);
    // The form is not locked: the code already sent still works.
    expect(state.throttledUntil).toBeNull();
  });

  it('stores the result and forgets the challenge once a code is verified', () => {
    const state = authReducer(sent(Date.now()), {
      type: verifyOtp.fulfilled.type,
      payload: { ...AUTH_RESULT, isNew: true, tenants: [] },
      meta: { arg: {}, requestId: 'r' },
    });
    expect(state.status).toBe('succeeded');
    expect(state.isNew).toBe(true);
    expect(state.otp).toBeNull();
  });

  it('ignores an aborted request — it is a remount, not a failure', () => {
    const state = authReducer(initial, {
      type: verifyOtp.rejected.type,
      payload: undefined,
      meta: { arg: {}, aborted: true, requestId: 'r' },
    });
    expect(state.status).toBe('idle');
    expect(state.error).toBeNull();
  });
});

describe('authSlice — PLT-02 password login', () => {
  it('records the result and the address on a login', () => {
    const state = authReducer(initial, {
      type: passwordLogin.fulfilled.type,
      payload: AUTH_RESULT,
      meta: { arg: {}, requestId: 'r' },
    });
    expect(state.passwordSet).toBe(true);
    expect(state.email).toBe('ramesh@example.com');
    expect(state.result).toEqual(AUTH_RESULT);
  });

  it('stores an invalid_credentials failure without guessing at a field', () => {
    const state = authReducer(initial, {
      type: passwordLogin.rejected.type,
      payload: error('invalid_credentials'),
      meta: { arg: {}, aborted: false, requestId: 'r' },
    });
    expect(state.status).toBe('failed');
    expect(state.error?.code).toBe('invalid_credentials');
    expect(state.error?.requestId).toBe('req_1');
    // An unknown address and a wrong password must be indistinguishable, so a
    // 401 may never set the throttle countdown either.
    expect(state.throttledUntil).toBeNull();
  });

  /**
   * PLT-02 FR-6. `login_throttled` is a `D` envelope and `retry_after` is a
   * SCALAR — `passwords.py` sends `details={"retry_after": int(retry_after)}`
   * and `throttle.py` locks an identifier for 900 seconds.
   *
   * This case used to build the fixture as `{ retry_after: ['120'] }`, an
   * array the server cannot produce, and so asserted the client's assumption
   * rather than the contract. Against the old reader
   * (`details.retry_after?.[0]`) a scalar yields `undefined`, `Number(undefined)`
   * is `NaN`, and the 60-second floor won: the screen told a merchant locked
   * out for 15 minutes to wait one, then handed them another 429 fourteen more
   * times.
   */
  it('turns a 429 into an absolute deadline from the SCALAR details.retry_after', () => {
    const before = Date.now();
    const state = authReducer(initial, {
      type: passwordLogin.rejected.type,
      payload: error('login_throttled', { retry_after: 900 }),
      meta: { arg: {}, aborted: false, requestId: 'r' },
    });

    // Absolute, not remaining: a backgrounded tab must come back correct.
    expect(state.throttledUntil).toBeGreaterThanOrEqual(before + 900_000);
    // And emphatically not the 60-second floor.
    expect(state.throttledUntil).toBeGreaterThan(before + 60_000);
  });

  /**
   * The backend half of this contract is being revisited concurrently. The
   * reader takes a one-element array too, so whichever spelling lands, the
   * countdown is the server's number and not the floor.
   */
  it('also accepts the array spelling, so the shape need not be guessed', () => {
    const before = Date.now();
    const state = authReducer(initial, {
      type: passwordLogin.rejected.type,
      payload: error('login_throttled', { retry_after: ['120'] }),
      meta: { arg: {}, aborted: false, requestId: 'r' },
    });

    expect(state.throttledUntil).toBeGreaterThanOrEqual(before + 120_000);
  });

  it('falls back to a sane throttle window when the server sends no retry_after', () => {
    const before = Date.now();
    const state = authReducer(initial, {
      type: passwordLogin.rejected.type,
      payload: error('login_throttled'),
      meta: { arg: {}, aborted: false, requestId: 'r' },
    });

    // A missing value must never produce a permanently disabled screen.
    expect(state.throttledUntil).toBeGreaterThanOrEqual(before + 60_000);
    expect(state.throttledUntil).toBeLessThan(before + 120_000);
  });

  it('marks the password as set after a successful set', () => {
    const state = authReducer(initial, {
      type: setPassword.fulfilled.type,
      meta: { arg: {}, requestId: 'r' },
    });
    expect(state.passwordSet).toBe(true);
  });
});

describe('authSlice — PLT-02 reset', () => {
  const requested = authReducer(initial, {
    type: requestPasswordReset.fulfilled.type,
    payload: undefined,
    meta: { arg: { email: 'ramesh@example.com' }, requestId: 'r' },
  });

  it('flags that a reset was asked for, and remembers only the typed address', () => {
    expect(requested.resetRequested).toBe(true);
    expect(requested.email).toBe('ramesh@example.com');
  });

  /**
   * BR-2 — the fulfilled payload is `void` on purpose. There is nothing in this
   * state that differs between an address somebody has and one nobody has, so
   * no screen reading it can leak the difference.
   */
  it('reaches the identical state for an address nobody has', () => {
    const unknown = authReducer(initial, {
      type: requestPasswordReset.fulfilled.type,
      payload: undefined,
      meta: { arg: { email: 'nobody@example.com' }, requestId: 'r' },
    });
    expect({ ...unknown, email: null }).toEqual({ ...requested, email: null });
  });

  it('goes back to the form when the user asks to try another address', () => {
    const state = authReducer(requested, resetRequestCleared());
    expect(state.resetRequested).toBe(false);
    expect(state.status).toBe('idle');
  });

  it('ends the reset with a session and no outstanding request', () => {
    const state = authReducer(requested, {
      type: confirmPasswordReset.fulfilled.type,
      payload: AUTH_RESULT,
      meta: { arg: {}, requestId: 'r' },
    });
    expect(state.result).toEqual(AUTH_RESULT);
    expect(state.resetRequested).toBe(false);
    expect(state.passwordSet).toBe(true);
  });

  it('keeps a spent token on the slice as the banner error', () => {
    const state = authReducer(requested, {
      type: confirmPasswordReset.rejected.type,
      payload: error('invalid_token'),
      meta: { arg: {}, aborted: false, requestId: 'r' },
    });
    expect(state.error?.code).toBe('invalid_token');
    expect(state.result).toBeNull();
  });
});

describe('authSlice — teardown', () => {
  const loaded = authReducer(initial, {
    type: verifyOtp.fulfilled.type,
    payload: AUTH_RESULT,
    meta: { arg: {}, requestId: 'r' },
  });

  it('drops the result once the redirect hook has acted on it', () => {
    expect(authReducer(loaded, authResultConsumed()).result).toBeNull();
  });

  it('clears everything on the teardown signal once the result is consumed', () => {
    const consumed = authReducer(loaded, authResultConsumed());

    expect(authReducer(consumed, resetAllFeatureState())).toEqual(initial);
  });

  it('carries a result the redirect hook has not read yet ACROSS the teardown', () => {
    // `verifyOtp` is mapped to `resetAll`, and the listener dispatches
    // that teardown after this slice's own reducer has run. Dropping the result
    // here would leave a signed-in user sitting on the sign-up screen.
    const afterTeardown = authReducer(loaded, resetAllFeatureState());

    expect(afterTeardown.result).toEqual(AUTH_RESULT);
    // Everything that IS previous-session data is gone all the same.
    expect(afterTeardown.error).toBeNull();
    expect(afterTeardown.throttledUntil).toBeNull();
    expect(afterTeardown.resetRequested).toBe(false);
  });
});
