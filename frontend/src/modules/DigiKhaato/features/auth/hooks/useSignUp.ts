'use client';

import { useCallback, useState } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDegradedNetwork } from 'src/hooks/useDegradedNetwork';
import type { ApiErrorShape } from 'src/types/api.types';
import { applyServerErrors } from 'src/utils/applyServerErrors';
import { writeLocal } from 'src/utils/storage';

import { LAST_EMAIL_KEY, REMEMBER_EMAIL_KEY } from '../constants/authDefaults';
import { selectAuthError, selectAuthStatus, selectThrottledUntil } from '../redux/authSlice';
import { registerAccount } from '../redux/authThunk';
import { deviceLabelFrom } from '../view-model/authDisplay';

import { useCountdown } from './useCountdown';

import type { SignUpFormValues } from '../validation/authSchemas';
import type { UseFormSetError } from 'react-hook-form';

/**
 * Part 19 §19.1.1 layer 4 — the sign-up screen's only door into Redux.
 *
 * CR-2026-09-19-A FR-S1. Sign-up needs its own hook rather than a flag on
 * `useLogin` because the two screens fail differently and that is the whole of
 * what a hook here owns: a login answers `invalid_credentials` and says nothing
 * about which half was wrong, while a registration answers `validation_error`
 * with `details.email` ("already registered") or `details.password` (the
 * server's policy), both of which must land ON the field that caused them.
 *
 * On success the account exists AND the session cookies are set, so nothing
 * navigates here: `useAuthRedirect` sees `result` and routes the new user into
 * the onboarding wizard, which is the same path PLT-03 has always expected.
 */
export interface UseSignUpResult {
  readonly isSubmitting: boolean;
  readonly error: ApiErrorShape | null;
  readonly throttledSeconds: number;
  readonly isThrottled: boolean;
  readonly canSubmit: boolean;
  readonly isOffline: boolean;
  readonly formErrors: readonly string[];
  readonly submitSignUp: (
    values: SignUpFormValues,
    setError: UseFormSetError<SignUpFormValues>
  ) => Promise<void>;
}

export const useSignUp = (): UseSignUpResult => {
  const dispatch = useAppDispatch();
  const status = useAppSelector(selectAuthStatus);
  const error = useAppSelector(selectAuthError);
  const throttledUntil = useAppSelector(selectThrottledUntil);
  const { state: networkState, canWrite } = useDegradedNetwork();

  const [formErrors, setFormErrors] = useState<readonly string[]>([]);
  const throttledSeconds = useCountdown(throttledUntil);

  const submitSignUp = useCallback(
    async (values: SignUpFormValues, setError: UseFormSetError<SignUpFormValues>) => {
      setFormErrors([]);
      try {
        /**
         * CR-2026-09-19-D — an address, a password and the device label, and
         * nothing else. `name` and `mobile` stay OPTIONAL on `RegisterInput`:
         * the wire contract did not change, this screen simply stopped asking
         * for two things it had no use for yet. Step 1 of the wizard sends the
         * name a moment later.
         */
        await dispatch(
          registerAccount({
            email: values.email,
            password: values.password,
            deviceLabel: deviceLabelFrom(
              typeof navigator === 'undefined' ? '' : navigator.userAgent,
              'Browser'
            ),
          })
        ).unwrap();
        // The address is remembered so the login screen is prefilled the next
        // time. Only the address: a password is never written to storage.
        writeLocal(REMEMBER_EMAIL_KEY, true);
        writeLocal(LAST_EMAIL_KEY, values.email);
      } catch (thrown) {
        const apiError = thrown as ApiErrorShape;
        if (apiError.code === 'validation_error') {
          // `full_name` is the server's spelling of `name`; `applyServerErrors`
          // camel-cases it to `fullName`, which is not a field on this form, so
          // it surfaces at form level rather than vanishing.
          // A 400 naming `full_name` or `mobile` has no field on this form to
          // sit under any more, so `applyServerErrors` surfaces it at form
          // level rather than dropping it (§19.5.6).
          setFormErrors(applyServerErrors(apiError, setError, ['email', 'password']));
        }
        // Everything else is already in the slice and rendered as the banner.
      }
    },
    [dispatch]
  );

  return {
    isSubmitting: status === 'loading',
    error,
    throttledSeconds,
    isThrottled: throttledSeconds > 0,
    canSubmit: canWrite('deferred') && throttledSeconds === 0,
    isOffline: networkState === 'offline',
    formErrors,
    submitSignUp,
  };
};
