'use client';

import { useCallback, useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDegradedNetwork } from 'src/hooks/useDegradedNetwork';
import { useIdempotencyKey } from 'src/hooks/useIdempotencyKey';
import { selectLocale } from 'src/redux/slice/localeSlice';
import { selectEnabledModules, selectSessionUser } from 'src/redux/slice/sessionSlice';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { ROUTES, onboardingStepPath } from 'src/routes';
import type { ApiErrorShape } from 'src/types/api.types';
import type { ModuleCode } from 'src/types/domain.types';
import { applyServerErrors } from 'src/utils/applyServerErrors';

import {
  draftChanged,
  onboardingErrorCleared,
  selectOnboardingCompleted,
  selectOnboardingCompletedStep,
  selectOnboardingDraft,
  selectOnboardingError,
  selectOnboardingStatus,
  selectOnboardingStep,
  selectOnboardingWarnings,
  stateCodeAdopted,
  stepChanged,
} from '../redux/onboardingSlice';
import {
  completeOnboarding,
  createTenant,
  saveAddressStep,
  saveGstStep,
} from '../redux/onboardingThunk';

import type { OnboardingDraft } from '../redux/onboardingSlice';
import type { OnboardingWarning } from '../types/onboarding.types';
import type {
  AddressStepFormValues,
  BusinessStepFormValues,
  GstStepFormValues,
} from '../validation/onboardingSchemas';
import type { UseFormSetError } from 'react-hook-form';

/**
 * Part 19 §19.1.1 layer 4 — the wizard's only door into Redux.
 *
 * It owns three things the four step components must not each own:
 *
 *  - **The URL is the step** (FR-9). `/onboarding/step/3` is a real, resumable
 *    address; the slice's `step` follows the route and the route follows a
 *    successful save. A wizard whose progress lives only in memory loses a
 *    merchant to one accidental reload.
 *  - **The idempotency key for step 1** (EC-7), minted once by
 *    `useIdempotencyKey()` and reused on every retry, so a lost 201 replays the
 *    created tenant rather than creating a second business.
 *  - **The offline gate** (§19.10.4). Tenant creation is class C: never queued,
 *    disabled — not hidden — in confirmed `offline`.
 */
/** The RHF paths each step owns, so `applyServerErrors()` knows what to anchor. */
const BUSINESS_FIELDS = ['name', 'businessType', 'stateCode', 'ownerName'];
const GST_FIELDS = ['gstType', 'gstin', 'legalName', 'pan'];
const ADDRESS_FIELDS = ['line1', 'line2', 'city', 'district', 'pincode', 'phone', 'email'];

export interface UseOnboardingResult {
  readonly step: number;
  readonly completedStep: number;
  readonly draft: OnboardingDraft;
  readonly warnings: readonly OnboardingWarning[];
  readonly isSubmitting: boolean;
  readonly error: ApiErrorShape | null;
  readonly canSubmit: boolean;
  readonly isOffline: boolean;
  readonly completed: boolean;
  readonly formErrors: readonly string[];
  /** The owner's name, so step 1 only asks when it is genuinely blank (BR-7). */
  readonly needsOwnerName: boolean;
  readonly goToStep: (step: number) => void;
  readonly patchDraft: (patch: Partial<OnboardingDraft>) => void;
  readonly adoptGstinState: (stateCode: string) => void;
  readonly submitBusinessStep: (
    values: BusinessStepFormValues,
    setError: UseFormSetError<BusinessStepFormValues>
  ) => Promise<void>;
  readonly submitGstStep: (
    values: GstStepFormValues,
    setError: UseFormSetError<GstStepFormValues>
  ) => Promise<void>;
  readonly submitAddressStep: (
    values: AddressStepFormValues,
    setError: UseFormSetError<AddressStepFormValues>
  ) => Promise<void>;
  readonly skipGstStep: () => Promise<void>;
  readonly skipAddressStep: () => Promise<void>;
  readonly finish: () => Promise<void>;
  readonly clearError: () => void;
}

export const useOnboarding = (routeStep: number): UseOnboardingResult => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const step = useAppSelector(selectOnboardingStep);
  const completedStep = useAppSelector(selectOnboardingCompletedStep);
  const draft = useAppSelector(selectOnboardingDraft);
  const warnings = useAppSelector(selectOnboardingWarnings);
  const status = useAppSelector(selectOnboardingStatus);
  const error = useAppSelector(selectOnboardingError);
  const completed = useAppSelector(selectOnboardingCompleted);
  const locale = useAppSelector(selectLocale);
  const user = useAppSelector(selectSessionUser);
  const { state: networkState, canWrite } = useDegradedNetwork();
  const { key: idempotencyKey } = useIdempotencyKey();

  const [formErrors, setFormErrors] = useState<readonly string[]>([]);

  // FR-9 — the route is the truth about which step is showing. The slice is
  // told, not the other way round, so a deep link and a Back gesture both work.
  useEffect(() => {
    dispatch(stepChanged(routeStep));
  }, [dispatch, routeStep]);

  // §9 "Completed" — the preset has been applied; the dashboard's first-use
  // state (FR-11) is where the merchant belongs, not a wizard they finished.
  useEffect(() => {
    if (completed) router.replace(ROUTES.DASHBOARD);
  }, [completed, router]);

  const goToStep = useCallback(
    (next: number) => {
      dispatch(stepChanged(next));
      router.push(onboardingStepPath(next));
    },
    [dispatch, router]
  );

  const patchDraft = useCallback(
    (patch: Partial<OnboardingDraft>) => {
      dispatch(draftChanged(patch));
    },
    [dispatch]
  );

  const adoptGstinState = useCallback(
    (stateCode: string) => {
      dispatch(stateCodeAdopted(stateCode));
    },
    [dispatch]
  );

  const clearError = useCallback(() => {
    setFormErrors([]);
    dispatch(onboardingErrorCleared());
  }, [dispatch]);

  const advance = useCallback(
    (next: number) => {
      router.push(onboardingStepPath(next));
    },
    [router]
  );

  const submitBusinessStep = useCallback(
    async (values: BusinessStepFormValues, setError: UseFormSetError<BusinessStepFormValues>) => {
      setFormErrors([]);
      if (!values.businessType) return;
      try {
        await dispatch(
          createTenant({
            name: values.name,
            businessType: values.businessType,
            stateCode: values.stateCode,
            ownerName: values.ownerName,
            idempotencyKey,
          })
        ).unwrap();
        advance(2);
      } catch (thrown) {
        const apiError = thrown as ApiErrorShape;
        if (apiError.code === 'validation_error') {
          setFormErrors(applyServerErrors(apiError, setError, [...BUSINESS_FIELDS]));
        }
        // `gstin_in_use` cannot occur on step 1; everything else is the banner.
      }
    },
    [dispatch, idempotencyKey, advance]
  );

  const submitGstStep = useCallback(
    async (values: GstStepFormValues, setError: UseFormSetError<GstStepFormValues>) => {
      setFormErrors([]);
      try {
        await dispatch(
          saveGstStep({
            gstType: values.gstType,
            gstin: values.gstin,
            legalName: values.legalName,
            pan: values.pan,
          })
        ).unwrap();
        advance(3);
      } catch (thrown) {
        const apiError = thrown as ApiErrorShape;
        if (apiError.code === 'validation_error') {
          setFormErrors(applyServerErrors(apiError, setError, [...GST_FIELDS]));
          return;
        }
        if (apiError.code === 'gstin_in_use') {
          // 409 — another business already holds this GSTIN. It is anchored on
          // the field, with the server's own guidance, rather than toasted:
          // the merchant has to change that value or stop.
          setError('gstin', { type: 'server', message: apiError.message }, { shouldFocus: true });
        }
      }
    },
    [dispatch, advance]
  );

  const submitAddressStep = useCallback(
    async (values: AddressStepFormValues, setError: UseFormSetError<AddressStepFormValues>) => {
      setFormErrors([]);
      try {
        await dispatch(
          saveAddressStep({
            address: {
              line1: values.line1,
              line2: values.line2,
              city: values.city,
              district: values.district,
              pincode: values.pincode,
            },
            phone: values.phone,
            email: values.email,
          })
        ).unwrap();
        advance(4);
      } catch (thrown) {
        const apiError = thrown as ApiErrorShape;
        if (apiError.code === 'validation_error') {
          setFormErrors(applyServerErrors(apiError, setError, [...ADDRESS_FIELDS]));
        }
      }
    },
    [dispatch, advance]
  );

  /** FR-10 — skipping step 2 means `gst_type='unregistered'`, explicitly. */
  const skipGstStep = useCallback(async () => {
    try {
      await dispatch(
        saveGstStep({ gstType: 'unregistered', gstin: null, legalName: null, pan: null })
      ).unwrap();
      advance(3);
    } catch {
      // The banner already carries it.
    }
  }, [dispatch, advance]);

  /** FR-10 — skipping step 3 leaves `address={}` and `phone` = user mobile. */
  const skipAddressStep = useCallback(async () => {
    try {
      await dispatch(
        saveAddressStep({
          address: { line1: null, line2: null, city: null, district: null, pincode: null },
          phone: user?.mobile ?? null,
          email: null,
        })
      ).unwrap();
      advance(4);
    } catch {
      // The banner already carries it.
    }
  }, [dispatch, advance, user]);

  const finish = useCallback(async () => {
    try {
      await dispatch(completeOnboarding({ locale: draft.locale ?? locale })).unwrap();
      dispatch(showSnackbar({ severity: 'success', message: 'onboarding.done' }));
    } catch {
      // §9 "Failed" — the wizard stays on step 4 with Retry and the request id.
    }
  }, [dispatch, draft.locale, locale]);

  return {
    step,
    completedStep,
    draft,
    warnings,
    isSubmitting: status === 'loading',
    error,
    // Tenant creation is class C — online only, disabled rather than hidden.
    canSubmit: canWrite('online-only'),
    isOffline: networkState === 'offline',
    completed,
    formErrors,
    needsOwnerName: !user?.name,
    goToStep,
    patchDraft,
    adoptGstinState,
    submitBusinessStep,
    submitGstStep,
    submitAddressStep,
    skipGstStep,
    skipAddressStep,
    finish,
    clearError,
  };
};

/**
 * EC-6 / PLT-15 FR-2 — the tenant's EFFECTIVE module set, after the server has
 * intersected plan and partner. Step 4's summary needs it to say "Stock: not
 * available in your plan" instead of promising what the preset will drop.
 */
export const useEffectiveModules = (): readonly ModuleCode[] =>
  useAppSelector(selectEnabledModules);
