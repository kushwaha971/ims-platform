import { createAsyncThunk } from '@reduxjs/toolkit';

import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import * as authService from '../api/authService';

import type {
  AuthResult,
  PasswordLoginInput,
  PasswordResetConfirmInput,
  PasswordSetInput,
  RegisterInput,
} from '../types/auth.types';

/**
 * Part 19 §19.3.3 — every thunk is `createAsyncThunk` with all three type
 * arguments filled in and a body that is exactly a `try` calling ONE service
 * function and a `catch` calling `rejectWithValue(toApiError(error))`.
 *
 * No JSX, no `window`, no snackbar, no axios, no business rules. In particular
 * no thunk here decides where the user goes next — that is `postAuthDestination()`
 * in the view-model, called by the hook, because a routing rule with five
 * branches (PLT-01 FR-9) belongs somewhere a unit test can reach without a
 * router.
 *
 * **CR-2026-09-19-A.** `requestOtp` and `verifyOtp` are gone; `registerAccount`
 * replaces the account creation the OTP verify used to do implicitly. Every name
 * here appears in `src/redux/invalidation/registry.ts` — that is what the
 * completeness test checks, and it is not optional.
 */

/** MUTATION — CR-2026-09-19-A FR-S1. On success the session cookies exist. */
export const registerAccount = createAsyncThunk<
  AuthResult,
  RegisterInput,
  { rejectValue: ApiErrorShape }
>('auth/registerAccount', async (input, { rejectWithValue }) => {
  try {
    return await authService.register(input);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'auth.signUp.error'));
  }
});

/** MUTATION — PLT-02 FR-1. */
export const passwordLogin = createAsyncThunk<
  AuthResult,
  PasswordLoginInput,
  { rejectValue: ApiErrorShape }
>('auth/passwordLogin', async (input, { rejectWithValue }) => {
  try {
    return await authService.passwordLogin(input);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'auth.login.error'));
  }
});

/** MUTATION — PLT-02 FR-3. The user stays logged in afterwards (FR-9). */
export const setPassword = createAsyncThunk<void, PasswordSetInput, { rejectValue: ApiErrorShape }>(
  'auth/setPassword',
  async (input, { rejectWithValue }) => {
    try {
      await authService.setPassword(input);
    } catch (error) {
      return rejectWithValue(toApiError(error, 'auth.password.error'));
    }
    return undefined;
  }
);

/**
 * MUTATION — PLT-02 FR-4. Returns nothing, deliberately: the response is
 * identical for an address nobody has (BR-2), so there is nothing for the
 * fulfilled reducer to store beyond "the request went through".
 */
export const requestPasswordReset = createAsyncThunk<
  void,
  { readonly email: string },
  { rejectValue: ApiErrorShape }
>('auth/requestPasswordReset', async ({ email }, { rejectWithValue }) => {
  try {
    await authService.requestPasswordReset(email);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'auth.password.reset.error'));
  }
  return undefined;
});

/** MUTATION — PLT-02 FR-5. Revokes every other session of the user. */
export const confirmPasswordReset = createAsyncThunk<
  AuthResult,
  PasswordResetConfirmInput,
  { rejectValue: ApiErrorShape }
>('auth/confirmPasswordReset', async (input, { rejectWithValue }) => {
  try {
    return await authService.confirmPasswordReset(input);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'auth.password.reset.error'));
  }
});
