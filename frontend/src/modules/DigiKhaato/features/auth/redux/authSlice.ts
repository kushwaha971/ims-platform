import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import type { RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';
import { readDetailNumber } from 'src/utils/errorDetails';

import {
  confirmPasswordReset,
  passwordLogin,
  registerAccount,
  requestPasswordReset,
  setPassword,
} from './authThunk';

import type { AuthResult } from '../types/auth.types';

/**
 * Part 19 §19.3.2 — the auth feature's own slice. It is NOT `sessionSlice`:
 * `sessionSlice` holds who the user IS once they are in, and survives; this
 * slice holds the state of the act of GETTING in, and is thrown away the moment
 * the session exists.
 *
 * **CR-2026-09-19-A.** With mobile OTP backlogged there is no challenge to
 * hold, so `challengeId`, `purpose`, `expiresAt`, `resendAt`, `attemptsLeft` and
 * `lastLoginMethod` left this file with the flow that wrote them. What remains
 * is small on purpose: an email to prefill, whether a reset was asked for, and a
 * throttle deadline — because `login_throttled` is still a registered error
 * code (Part 22 §22.1.1) and the server still counts failed passwords.
 *
 * `throttledUntil` is an ABSOLUTE epoch millisecond, not a remaining count. A
 * slice that counted down would need a tick action and would be wrong after a
 * backgrounded tab; a deadline is correct whenever it is read.
 */
export interface AuthState {
  status: RequestStatus;
  error: ApiErrorShape | null;
  /** The address last used or remembered, echoed back onto the login field. */
  email: string | null;
  /** Epoch ms from a 429's `Retry-After`; the submit is disabled until then. */
  throttledUntil: number | null;
  /** FR-5 — a new account routes to onboarding rather than to the dashboard. */
  isNew: boolean;
  /** PLT-02 FR-3 — whether the account has a password at all. */
  passwordSet: boolean;
  /**
   * PLT-02 FR-4 — a reset was requested. It says NOTHING about whether the
   * address exists, because the server's answer says nothing about it either
   * (BR-2); it is only what swaps the form for the confirmation panel.
   */
  resetRequested: boolean;
  /** The authenticated result, held until the hook has routed on it. */
  result: AuthResult | null;
}

const initialState: AuthState = {
  status: 'idle',
  error: null,
  email: null,
  throttledUntil: null,
  isNew: false,
  passwordSet: false,
  resetRequested: false,
  result: null,
};

/**
 * PLT-02 FR-6 — a 429 carries `Retry-After`. The server sends it as a header
 * and (per §22.1.1) as `details.retry_after`; the normalised error only keeps
 * `details`, so that is what is read, with a sane floor so a missing value never
 * produces a permanently disabled screen.
 *
 * `login_throttled` and `rate_limited` are **`D` envelopes**, so `retry_after`
 * is the SCALAR `900`, not `["900"]` — `passwords.py` sends
 * `details={"retry_after": int(retry_after)}` and the exception handler derives
 * the `Retry-After` header from that same scalar. This read used to be
 * `details.retry_after?.[0]`, which is `undefined` on a number: `Number(undefined)`
 * is `NaN`, the 60-second floor always won, and a merchant locked out for the
 * server's full 900 seconds was told to wait 60 and handed another 429 fourteen
 * more times.
 *
 * `readDetailNumber` accepts the scalar AND the one-element-array spelling, so
 * this stays correct whichever the server settles on — the shape is not
 * guessed at here.
 */
const throttleUntilFrom = (error: ApiErrorShape | null | undefined): number | null => {
  if (!error) return null;
  if (error.code !== 'login_throttled' && error.code !== 'rate_limited') return null;
  const seconds = readDetailNumber(error.details, 'retry_after');
  return Date.now() + (seconds !== null && seconds > 0 ? seconds : 60) * 1000;
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** PLT-01 §8 — restored from localStorage on mount by the hook. */
    lastEmailRestored(state, action: PayloadAction<string | null>) {
      state.email = action.payload;
    },
    /** The user asked to send the reset link again, or left the panel. */
    resetRequestCleared(state) {
      state.resetRequested = false;
      state.error = null;
      state.status = 'idle';
    },
    /** The hook has routed on `result`; it must not be acted on twice. */
    authResultConsumed(state) {
      state.result = null;
    },
    authErrorCleared(state) {
      state.error = null;
    },
    resetAuth: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      // ── CR-2026-09-19-A FR-S1 — sign up ─────────────────────────────────
      .addCase(registerAccount.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(registerAccount.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.result = action.payload as Draft<AuthResult>;
        state.email = action.payload.email;
        // A brand-new account has just set a password, by definition — the
        // register call would have been rejected without one.
        state.passwordSet = true;
        // FR-5: the SERVER decides this. A client that assumed "registered
        // therefore new" would send a returning user through the wizard again
        // if the backend ever makes register idempotent.
        state.isNew = action.payload.isNew;
      })
      .addCase(registerAccount.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        // See partyListSlice: a frozen, never-mutated ApiErrorShape in a draft.
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
        state.throttledUntil = throttleUntilFrom(action.payload);
      })

      // ── PLT-02 FR-1 — password login ────────────────────────────────────
      .addCase(passwordLogin.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(passwordLogin.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.result = action.payload as Draft<AuthResult>;
        state.email = action.payload.email;
        state.isNew = action.payload.isNew;
        state.passwordSet = true;
      })
      .addCase(passwordLogin.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
        state.throttledUntil = throttleUntilFrom(action.payload);
      })

      // ── PLT-02 FR-3 — set / change password ─────────────────────────────
      .addCase(setPassword.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(setPassword.fulfilled, (state) => {
        state.status = 'succeeded';
        state.passwordSet = true;
      })
      .addCase(setPassword.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })

      // ── PLT-02 FR-4/FR-5 — reset ────────────────────────────────────────
      .addCase(requestPasswordReset.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(requestPasswordReset.fulfilled, (state, action) => {
        state.status = 'succeeded';
        // BR-2 — this flag is set for EVERY successful request, whether or not
        // the address belongs to anybody. The screen it drives says "if that
        // address is registered", and it can only keep saying that honestly
        // because nothing here ever learned the answer.
        state.resetRequested = true;
        state.email = action.meta.arg.email;
      })
      .addCase(requestPasswordReset.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
        state.throttledUntil = throttleUntilFrom(action.payload);
      })
      .addCase(confirmPasswordReset.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(confirmPasswordReset.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.result = action.payload as Draft<AuthResult>;
        state.email = action.payload.email;
        state.passwordSet = true;
        state.resetRequested = false;
      })
      .addCase(confirmPasswordReset.rejected, (state, action) => {
        if (action.meta.aborted) return;
        state.status = 'failed';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })

      /**
       * Logout and tenant switch clear every feature slice (§19.6.5) — with one
       * carefully bounded exception.
       *
       * `registerAccount`, `passwordLogin` and `confirmPasswordReset` are mapped
       * to `resetAll` in the INVALIDATION map, because a new session means
       * nothing a previous one left behind may survive. The listener dispatches
       * that teardown AFTER this slice's own `fulfilled` reducer has run, so a
       * naive `() => initialState` here would destroy the very result the
       * redirect hook has not read yet, and the user would sit on the login
       * screen with a valid session behind them.
       *
       * `result` and the preferences beside it are therefore carried across:
       * they are not "state from the previous session", they are the statement
       * that a NEW one has just begun. On logout they are already null, so
       * nothing survives that should not.
       */
      .addCase(resetAllFeatureState, (state) => ({
        ...initialState,
        result: state.result,
        email: state.email,
        isNew: state.isNew,
        passwordSet: state.passwordSet,
      }));
  },
});

export const {
  lastEmailRestored,
  resetRequestCleared,
  authResultConsumed,
  authErrorCleared,
  resetAuth,
} = authSlice.actions;

export default authSlice.reducer;

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectAuthStatus = (state: RootState): RequestStatus => state.auth.status;
export const selectAuthError = (state: RootState): ApiErrorShape | null => state.auth.error;
export const selectAuthEmail = (state: RootState): string | null => state.auth.email;
export const selectThrottledUntil = (state: RootState): number | null => state.auth.throttledUntil;
export const selectAuthResult = (state: RootState): AuthResult | null => state.auth.result;
export const selectAuthIsNew = (state: RootState): boolean => state.auth.isNew;
export const selectPasswordSet = (state: RootState): boolean => state.auth.passwordSet;
export const selectResetRequested = (state: RootState): boolean => state.auth.resetRequested;
