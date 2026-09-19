import { resetAllFeatureState } from 'src/redux/actions';
import type { ApiErrorShape } from 'src/types/api.types';

import authReducer, {
  authResultConsumed,
  resetRequestCleared,
  type AuthState,
} from './authSlice';
import {
  confirmPasswordReset,
  passwordLogin,
  registerAccount,
  requestPasswordReset,
  setPassword,
} from './authThunk';

import type { AuthResult } from '../types/auth.types';

/**
 * R-RX-5 — every thunk handles all three lifecycle cases, and a reducer test is
 * where that is cheap to prove. Behaviour, not implementation (R-T-6).
 */
const initial = authReducer(undefined, { type: '@@init' }) as AuthState;

const AUTH_RESULT: AuthResult = {
  userId: 'u1',
  name: 'Ramesh',
  email: 'ramesh@example.com',
  mobile: null,
  locale: 'en',
  isNew: false,
  hasPassword: true,
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
  details: Record<string, string[]> = {}
): ApiErrorShape => ({
  code,
  message: 'nope',
  details,
  requestId: 'req_1',
  status: 400,
  warnings: [],
});

describe('authSlice — CR-2026-09-19-A sign-up', () => {
  it('stores the result, the address and that a password now exists', () => {
    const state = authReducer(initial, {
      type: registerAccount.fulfilled.type,
      payload: AUTH_RESULT,
      meta: { arg: { email: 'ramesh@example.com', password: 'kirana2026' }, requestId: 'r' },
    });

    expect(state.status).toBe('succeeded');
    expect(state.result).toEqual(AUTH_RESULT);
    expect(state.email).toBe('ramesh@example.com');
    expect(state.passwordSet).toBe(true);
  });

  it('takes `isNew` from the SERVER, never from the fact that it registered', () => {
    const state = authReducer(initial, {
      type: registerAccount.fulfilled.type,
      payload: { ...AUTH_RESULT, isNew: true, tenants: [] },
      meta: { arg: {}, requestId: 'r' },
    });
    expect(state.isNew).toBe(true);
  });

  it('keeps a validation_error without guessing at a field', () => {
    const state = authReducer(initial, {
      type: registerAccount.rejected.type,
      payload: error('validation_error', { email: ['That address is already registered.'] }),
      meta: { arg: {}, aborted: false, requestId: 'r' },
    });

    expect(state.status).toBe('failed');
    expect(state.error?.code).toBe('validation_error');
    expect(state.result).toBeNull();
  });

  it('ignores an aborted request — it is a remount, not a failure', () => {
    const state = authReducer(initial, {
      type: registerAccount.rejected.type,
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

  it('turns a 429 into an absolute throttle deadline from details.retry_after', () => {
    const before = Date.now();
    const state = authReducer(initial, {
      type: passwordLogin.rejected.type,
      payload: error('login_throttled', { retry_after: ['120'] }),
      meta: { arg: {}, aborted: false, requestId: 'r' },
    });

    // Absolute, not remaining: a backgrounded tab must come back correct.
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
    type: registerAccount.fulfilled.type,
    payload: AUTH_RESULT,
    meta: { arg: {}, requestId: 'r' },
  });

  it('drops the result once the redirect hook has acted on it', () => {
    expect(authReducer(loaded, authResultConsumed()).result).toBeNull();
  });

  it('clears everything on the teardown signal once the result is consumed', () => {
    const consumed = authReducer(loaded, authResultConsumed());

    expect(authReducer(consumed, resetAllFeatureState())).toEqual({
      ...initial,
      // The address is a preference, not previous-session data.
      email: 'ramesh@example.com',
      passwordSet: true,
    });
  });

  it('carries a result the redirect hook has not read yet ACROSS the teardown', () => {
    // `registerAccount` is mapped to `resetAll`, and the listener dispatches
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
