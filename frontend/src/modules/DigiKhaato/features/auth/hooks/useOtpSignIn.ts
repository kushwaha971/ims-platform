'use client';

import { useCallback, useEffect, useState } from 'react';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDegradedNetwork } from 'src/hooks/useDegradedNetwork';
import { useTranslation } from 'src/hooks/useTranslation';
import { endSessionLocally, selectHoldsSession } from 'src/redux/slice/sessionSlice';
import type { ApiErrorShape } from 'src/types/api.types';
import type { Locale } from 'src/types/domain.types';
import { applyServerErrors } from 'src/utils/applyServerErrors';
import { readDetailNumber } from 'src/utils/errorDetails';

import {
  authErrorCleared,
  otpCleared,
  selectAuthStatus,
  selectOtp,
  selectThrottledUntil,
  type OtpState,
} from '../redux/authSlice';
import { requestOtp, verifyOtp } from '../redux/authThunk';
import { deviceLabelFrom } from '../view-model/authDisplay';

import { useCountdown } from './useCountdown';

import type { UseFormSetError } from 'react-hook-form';

/**
 * Owner, 9 Oct 2026 — the sign-in and sign-up screen's only door into Redux:
 * a mobile number, then the four-digit code. One flow for both, because the
 * server answers `otp/request` identically for a number with an account and
 * one without, and `otp/verify` creates the account when the number is new
 * (`isNew` on the result routes it to onboarding).
 *
 * The resend clock is the SERVER's: `retry_after` (sixty seconds) arrives with
 * every code, the slice keeps it as an absolute deadline, and a resend asked
 * for early is refused by the server and moves the same deadline. The screen
 * only shows it.
 */
export interface MobileFormValues {
  mobile: string;
}

export interface CodeFormValues {
  code: string;
}

export interface UseOtpSignInResult {
  /** `null` until a code has been sent; then the number it went to. */
  readonly otp: OtpState | null;
  readonly isSending: boolean;
  readonly isVerifying: boolean;
  /** Seconds until "Resend code" unlocks; `0` when it may be pressed. */
  readonly resendSeconds: number;
  /** Seconds left on a lockout (too many wrong codes); `0` when none. */
  readonly throttledSeconds: number;
  readonly canSubmit: boolean;
  readonly isOffline: boolean;
  readonly formErrors: readonly string[];
  readonly sendCode: (
    values: MobileFormValues,
    setError: UseFormSetError<MobileFormValues>
  ) => Promise<void>;
  readonly resend: () => Promise<void>;
  readonly verify: (
    values: CodeFormValues,
    setError: UseFormSetError<CodeFormValues>
  ) => Promise<void>;
  readonly changeNumber: () => void;
}

const deviceLabel = (): string =>
  deviceLabelFrom(typeof navigator === 'undefined' ? '' : navigator.userAgent, 'Browser');

export const useOtpSignIn = (): UseOtpSignInResult => {
  const dispatch = useAppDispatch();
  const { t, locale } = useTranslation();
  const status = useAppSelector(selectAuthStatus);
  const otp = useAppSelector(selectOtp);
  const throttledUntil = useAppSelector(selectThrottledUntil);
  const { state: networkState, canWrite } = useDegradedNetwork();
  const [formErrors, setFormErrors] = useState<readonly string[]>([]);

  // NEW-1, as on the password screen this replaces: a sign-in screen that
  // OPENS over a held session ends it, read once at mount, so the next person
  // at a shared counter never signs in over the last one's business.
  const holdsSession = useAppSelector(selectHoldsSession);
  const [heldAtMount] = useState(holdsSession);
  useEffect(() => {
    if (heldAtMount) endSessionLocally(dispatch);
  }, [heldAtMount, dispatch]);

  const resendSeconds = useCountdown(otp?.resendAt ?? null);
  const throttledSeconds = useCountdown(throttledUntil);
  const isOffline = networkState === 'offline';
  const canSubmit = canWrite('deferred') && throttledSeconds === 0;
  const lang = (locale === 'hi' ? 'hi' : 'en') as Locale;

  const sendCode = useCallback(
    async (values: MobileFormValues, setError: UseFormSetError<MobileFormValues>) => {
      setFormErrors([]);
      dispatch(authErrorCleared());
      try {
        await dispatch(requestOtp({ mobile: values.mobile, locale: lang })).unwrap();
      } catch (thrown) {
        const apiError = thrown as ApiErrorShape;
        if (apiError.code === 'validation_error') {
          setFormErrors(applyServerErrors(apiError, setError, ['mobile']));
        }
        // A 429 is in the slice and drawn as the banner; anything else is the
        // global snackbar's (§19.12.2).
      }
    },
    [dispatch, lang]
  );

  const resend = useCallback(async () => {
    if (!otp) return;
    setFormErrors([]);
    try {
      await dispatch(requestOtp({ mobile: otp.mobile, locale: lang })).unwrap();
    } catch {
      // An early resend moves the countdown (the slice); nothing to say here.
    }
  }, [dispatch, otp, lang]);

  const verify = useCallback(
    async (values: CodeFormValues, setError: UseFormSetError<CodeFormValues>) => {
      if (!otp) return;
      setFormErrors([]);
      try {
        await dispatch(
          verifyOtp({
            challengeId: otp.challengeId,
            code: values.code,
            deviceLabel: deviceLabel(),
            locale: lang,
          })
        ).unwrap();
        // The redirect is `useAuthRedirect`'s job, driven by `result`.
      } catch (thrown) {
        const apiError = thrown as ApiErrorShape;
        if (apiError.code !== 'otp_invalid') return;
        const reason = (apiError.details as { reason?: unknown } | undefined)?.reason;
        const left = readDetailNumber(apiError.details, 'attempts_left') ?? 0;
        // A wrong code says how many tries remain; a code that can no longer
        // work (expired, used up, replaced by a newer one) says to ask again,
        // because typing it more carefully will not help.
        const message =
          reason === 'incorrect' && left > 0
            ? t('auth.otp.wrong', { count: left })
            : t('auth.otp.dead');
        setError('code', { type: 'server', message }, { shouldFocus: true });
      }
    },
    [dispatch, otp, lang, t]
  );

  const changeNumber = useCallback(() => {
    setFormErrors([]);
    dispatch(otpCleared());
  }, [dispatch]);

  return {
    otp,
    isSending: status === 'loading' && (otp === null || otp.busy === 'sending'),
    isVerifying: otp?.busy === 'verifying',
    resendSeconds,
    throttledSeconds,
    canSubmit,
    isOffline,
    formErrors,
    sendCode,
    resend,
    verify,
    changeNumber,
  };
};
