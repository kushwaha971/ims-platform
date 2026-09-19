'use client';

import { useCallback, useState } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDegradedNetwork } from 'src/hooks/useDegradedNetwork';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import type { ApiErrorShape } from 'src/types/api.types';
import { applyServerErrors } from 'src/utils/applyServerErrors';

import {
  resetRequestCleared,
  selectAuthEmail,
  selectAuthError,
  selectAuthStatus,
  selectResetRequested,
  selectThrottledUntil,
} from '../redux/authSlice';
import { confirmPasswordReset, requestPasswordReset, setPassword } from '../redux/authThunk';

import { useCountdown } from './useCountdown';

import type {
  PasswordResetConfirmFormValues,
  PasswordResetRequestFormValues,
  PasswordSetFormValues,
} from '../validation/authSchemas';
import type { UseFormSetError } from 'react-hook-form';

/**
 * PLT-02 — the set-password and forgot-password screens' door into Redux.
 *
 * Both flows live in one hook because they are one flow with a different
 * starting point: reset is "prove the address, then set a password", and set is
 * the second half of it. Splitting them would duplicate the submit, the
 * server-error mapping and the snackbar.
 *
 * The snackbar is dispatched HERE, not in the thunk (R-RX-7): whether a user
 * should see a toast is a presentation decision, and "Password updated. Other
 * devices were logged out" is only true for the reset path.
 *
 * **CR-2026-09-19-A.** The reset now travels by a link the server creates, not
 * by a six-digit code, so `submitResetRequest` takes an email and returns
 * nothing the screen could branch on (BR-2), and `submitResetConfirm` takes the
 * token out of the link instead of a challenge held in the slice.
 */
export interface UsePasswordFlowResult {
  readonly isSubmitting: boolean;
  readonly error: ApiErrorShape | null;
  readonly email: string | null;
  /** True once a reset was asked for. Says NOTHING about whether it exists. */
  readonly resetRequested: boolean;
  readonly canSubmit: boolean;
  readonly isOffline: boolean;
  readonly throttledSeconds: number;
  readonly formErrors: readonly string[];
  readonly startOverRequest: () => void;
  readonly submitSetPassword: (
    values: PasswordSetFormValues,
    setError: UseFormSetError<PasswordSetFormValues>
  ) => Promise<void>;
  readonly submitResetRequest: (
    values: PasswordResetRequestFormValues,
    setError: UseFormSetError<PasswordResetRequestFormValues>
  ) => Promise<void>;
  readonly submitResetConfirm: (
    token: string,
    values: PasswordResetConfirmFormValues,
    setError: UseFormSetError<PasswordResetConfirmFormValues>
  ) => Promise<void>;
}

export const usePasswordFlow = (): UsePasswordFlowResult => {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectAuthStatus);
  const error = useAppSelector(selectAuthError);
  const email = useAppSelector(selectAuthEmail);
  const resetRequested = useAppSelector(selectResetRequested);
  const throttledUntil = useAppSelector(selectThrottledUntil);
  const { state: networkState, canWrite } = useDegradedNetwork();

  const [formErrors, setFormErrors] = useState<readonly string[]>([]);
  const throttledSeconds = useCountdown(throttledUntil);

  const startOverRequest = useCallback(() => {
    setFormErrors([]);
    dispatch(resetRequestCleared());
  }, [dispatch]);

  const submitSetPassword = useCallback(
    async (values: PasswordSetFormValues, setError: UseFormSetError<PasswordSetFormValues>) => {
      setFormErrors([]);
      try {
        await dispatch(setPassword({ newPassword: values.password })).unwrap();
        dispatch(showSnackbar({ severity: 'success', message: 'auth.password.updated' }));
      } catch (thrown) {
        const apiError = thrown as ApiErrorShape;
        if (apiError.code === 'validation_error') {
          // The server's policy and common-password rules (FR-2) arrive as
          // `details.new_password`, which maps to the `password` field here.
          setFormErrors(applyServerErrors(apiError, setError, ['name', 'password']));
        }
      }
    },
    [dispatch]
  );

  const submitResetRequest = useCallback(
    async (
      values: PasswordResetRequestFormValues,
      setError: UseFormSetError<PasswordResetRequestFormValues>
    ) => {
      setFormErrors([]);
      try {
        await dispatch(requestPasswordReset({ email: values.email })).unwrap();
        // No snackbar and no "we found you": the slice flag alone flips the
        // screen to a panel that says what actually happened, which is that a
        // link was created IF the address is registered (FR-4, BR-2).
      } catch (thrown) {
        const apiError = thrown as ApiErrorShape;
        if (apiError.code === 'validation_error') {
          // A malformed address is the ONE thing the server may say about this
          // field — it is a shape complaint, not an existence one.
          setFormErrors(applyServerErrors(apiError, setError, ['email']));
        }
      }
    },
    [dispatch]
  );

  const submitResetConfirm = useCallback(
    async (
      token: string,
      values: PasswordResetConfirmFormValues,
      setError: UseFormSetError<PasswordResetConfirmFormValues>
    ) => {
      if (!token) return;
      setFormErrors([]);
      try {
        await dispatch(confirmPasswordReset({ token, newPassword: values.password })).unwrap();
        // FR-5 — the revocation is the part the user must be told about.
        dispatch(showSnackbar({ severity: 'success', message: 'auth.password.resetDone' }));
      } catch (thrown) {
        const apiError = thrown as ApiErrorShape;
        if (apiError.code === 'validation_error') {
          setFormErrors(applyServerErrors(apiError, setError, ['password']));
        }
        // A spent or expired token is `invalid_token` (§22.1.1) and has no
        // field to sit under; the banner carries it.
      }
    },
    [dispatch]
  );

  return {
    isSubmitting: status === 'loading',
    error,
    email,
    resetRequested,
    canSubmit: canWrite('deferred') && throttledSeconds === 0,
    isOffline: networkState === 'offline',
    throttledSeconds,
    formErrors,
    startOverRequest,
    submitSetPassword,
    submitResetRequest,
    submitResetConfirm,
  };
};
