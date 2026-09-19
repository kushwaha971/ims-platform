'use client';

import { useCallback, useEffect, useState } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDegradedNetwork } from 'src/hooks/useDegradedNetwork';
import type { ApiErrorShape } from 'src/types/api.types';
import { applyServerErrors } from 'src/utils/applyServerErrors';
import { readLocal, writeLocal, removeLocal } from 'src/utils/storage';

import { LAST_EMAIL_KEY, REMEMBER_EMAIL_KEY } from '../constants/authDefaults';
import {
  authErrorCleared,
  lastEmailRestored,
  selectAuthEmail,
  selectAuthError,
  selectAuthStatus,
  selectThrottledUntil,
} from '../redux/authSlice';
import { passwordLogin } from '../redux/authThunk';
import { deviceLabelFrom } from '../view-model/authDisplay';

import { useCountdown } from './useCountdown';

import type { PasswordLoginFormValues } from '../validation/authSchemas';
import type { UseFormSetError } from 'react-hook-form';

/**
 * Part 19 §19.1.1 layer 4 — the login screen's only door into Redux. Selectors
 * in, thunks out, memoised handlers back, a plain typed object (R-H-1, R-H-2).
 * No JSX.
 *
 * **CR-2026-09-19-A.** There is one way in now, so the tab state, the remembered
 * method and the `submitOtpRequest` handler are gone. What is left:
 *
 *  - **The remembered address** (PLT-01 §8). `localStorage` is touched through
 *    `src/utils/storage.ts` only, and what it holds is a preference — never
 *    anything trusted for authorisation (§19.7.1). The password is never stored.
 *  - **The offline gate** (PLT-01 §5, §19.10.4). Auth is a class-B write and
 *    class B is DISABLED — never hidden — in confirmed `offline`, with the
 *    banner saying why. Hiding the login button from a merchant whose shutter is
 *    half down would read as the app being broken.
 */
export interface UseLoginResult {
  readonly rememberedEmail: string | null;
  readonly isSubmitting: boolean;
  readonly error: ApiErrorShape | null;
  /** Seconds left on a 429 lockout; `0` when not throttled. */
  readonly throttledSeconds: number;
  readonly isThrottled: boolean;
  /** False in confirmed `offline` — the submit is disabled, not hidden. */
  readonly canSubmit: boolean;
  readonly isOffline: boolean;
  readonly formErrors: readonly string[];
  readonly submitPasswordLogin: (
    values: PasswordLoginFormValues,
    setError: UseFormSetError<PasswordLoginFormValues>
  ) => Promise<void>;
  readonly clearError: () => void;
}

export const useLogin = (): UseLoginResult => {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectAuthStatus);
  const error = useAppSelector(selectAuthError);
  const throttledUntil = useAppSelector(selectThrottledUntil);
  const storedEmail = useAppSelector(selectAuthEmail);
  const { state: networkState, canWrite } = useDegradedNetwork();

  const [formErrors, setFormErrors] = useState<readonly string[]>([]);

  // PLT-01 §8 — restore the preference once, into the slice, so the prefilled
  // address survives a remount of the screen.
  useEffect(() => {
    const remember = readLocal<boolean>(REMEMBER_EMAIL_KEY, true);
    dispatch(lastEmailRestored(remember ? readLocal<string | null>(LAST_EMAIL_KEY, null) : null));
  }, [dispatch]);

  const throttledSeconds = useCountdown(throttledUntil);
  const isOffline = networkState === 'offline';
  // Auth is class B: enabled in `online` and `degraded`, disabled in `offline`.
  const canSubmit = canWrite('deferred') && throttledSeconds === 0;

  const clearError = useCallback(() => {
    setFormErrors([]);
    dispatch(authErrorCleared());
  }, [dispatch]);

  /** PLT-01 §8 — the address is remembered only when the tick is left on. */
  const rememberEmail = useCallback((email: string, remember: boolean) => {
    writeLocal(REMEMBER_EMAIL_KEY, remember);
    if (remember) writeLocal(LAST_EMAIL_KEY, email);
    else removeLocal(LAST_EMAIL_KEY);
  }, []);

  const submitPasswordLogin = useCallback(
    async (values: PasswordLoginFormValues, setError: UseFormSetError<PasswordLoginFormValues>) => {
      setFormErrors([]);
      try {
        await dispatch(
          passwordLogin({
            email: values.email,
            password: values.password,
            deviceLabel: deviceLabelFrom(
              typeof navigator === 'undefined' ? '' : navigator.userAgent,
              'Browser'
            ),
          })
        ).unwrap();
        rememberEmail(values.email, values.rememberEmail);
        // The redirect is `useAuthRedirect`'s job, driven by `result`.
      } catch (thrown) {
        const apiError = thrown as ApiErrorShape;
        if (apiError.code === 'validation_error') {
          setFormErrors(applyServerErrors(apiError, setError, ['email', 'password']));
          return;
        }
        if (apiError.code === 'invalid_credentials') {
          // AC-5 — one message, under the password field, for both a wrong
          // password and an address nobody has. Anything else enumerates users.
          setError(
            'password',
            { type: 'server', message: apiError.message },
            { shouldFocus: true }
          );
        }
        // Everything else is already in the slice and rendered as the banner.
      }
    },
    [dispatch, rememberEmail]
  );

  return {
    rememberedEmail: storedEmail,
    isSubmitting: status === 'loading',
    error,
    throttledSeconds,
    isThrottled: throttledSeconds > 0,
    canSubmit,
    isOffline,
    formErrors,
    submitPasswordLogin,
    clearError,
  };
};
