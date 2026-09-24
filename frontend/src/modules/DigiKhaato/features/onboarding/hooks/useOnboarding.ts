'use client';

import { useCallback, useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';

import { useAppDispatch, useAppSelector } from 'src/hooks/useAppStore';
import { useDegradedNetwork } from 'src/hooks/useDegradedNetwork';
import { useIdempotencyKey } from 'src/hooks/useIdempotencyKey';
import { selectLocale } from 'src/redux/slice/localeSlice';
import {
  selectActiveTenant,
  selectEnabledModules,
  selectSessionUser,
} from 'src/redux/slice/sessionSlice';
import { showSnackbar } from 'src/redux/slice/snackbarSlice';
import { ONBOARDING_STEP_MAX, ROUTES, onboardingStepPath } from 'src/routes';
import type { ApiErrorShape } from 'src/types/api.types';
import type { ModuleCode } from 'src/types/domain.types';
import { applyServerErrors } from 'src/utils/applyServerErrors';
import { newRequestId } from 'src/utils/requestId';
import { readLocal, removeLocal, writeLocal } from 'src/utils/storage';

import {
  draftChanged,
  onboardingErrorCleared,
  selectOnboardingCompleted,
  selectOnboardingCompletedStep,
  selectOnboardingCreateKey,
  selectOnboardingDraft,
  selectOnboardingError,
  selectOnboardingResumable,
  selectOnboardingResumableStatus,
  selectOnboardingResumeStatus,
  selectOnboardingStatus,
  selectOnboardingStep,
  selectOnboardingTenantId,
  selectOnboardingWarnings,
  stateCodeAdopted,
  stepChanged,
  tenantCreateKeyMinted,
  tenantCreateKeyRotated,
} from '../redux/onboardingSlice';
import {
  completeOnboarding,
  createTenant,
  findResumableBusiness,
  resumeOnboarding,
  saveAddressStep,
  saveBusinessStep,
  saveGstStep,
} from '../redux/onboardingThunk';
import { isOnboardingComplete, shouldResumeFromServer } from '../view-model/onboardingDisplay';

import type { OnboardingDraft, ResumableBusiness } from '../redux/onboardingSlice';
import type { OnboardingResult, OnboardingWarning } from '../types/onboarding.types';
import type {
  AddressStepFormValues,
  BusinessStepFormValues,
  GstStepFormValues,
} from '../validation/onboardingSchemas';
import type { UseFormSetError } from 'react-hook-form';

/**
 * Part 19 §19.1.1 layer 4 — the wizard's only door into Redux.
 *
 * It owns what the four step components must not each own:
 *
 *  - **The URL is the step** (FR-9). `/onboarding/step/3` is a real, resumable
 *    address; the slice's `step` follows the route and the route follows a
 *    successful save. A wizard whose progress lives only in memory loses a
 *    merchant to one accidental reload.
 *  - **The idempotency key for step 1** (EC-7), minted once by
 *    `useIdempotencyKey()` and reused on every retry, so a lost 201 replays the
 *    created tenant rather than creating a second business. It is persisted,
 *    so a reload does not mint a new one (NEW-1).
 *  - **Resume after a reload** (FR-9, NEW-1): the business is read back from
 *    the server before a step is drawn.
 *  - **The offline gate** (§19.10.4). Tenant creation is class C: never queued,
 *    disabled — not hidden — in confirmed `offline`.
 */
/** The RHF paths each step owns, so `applyServerErrors()` knows what to anchor. */
const BUSINESS_FIELDS = ['name', 'businessType', 'stateCode', 'ownerName'];
const GST_FIELDS = ['gstType', 'gstin', 'legalName', 'pan'];
const ADDRESS_FIELDS = ['line1', 'line2', 'city', 'district', 'pincode', 'phone', 'email'];

/**
 * Defect NEW-1 — where step 1's `Idempotency-Key` outlives a browser refresh.
 *
 * The slice alone could not: Redux is memory, and a refresh minted a new key,
 * which the server rightly treated as a new request. `localStorage`, through
 * `utils/storage` (which already wraps every access in try/catch, so private
 * mode or a full quota degrades to "in memory only" rather than a crash).
 * `sessionStorage` would do for a refresh but not for the tab the merchant
 * closed with the response lost; a device-wide key costs nothing here.
 *
 * It is not scoped to the user, and does not need to be: the server keys
 * `POST /tenants` idempotency by (user, key), so another account on the same
 * device presenting this key is a fresh claim, not somebody else's replay.
 * Logout clears it with the rest of the `ub.` namespace.
 *
 * It is REMOVED once a create succeeds, because from then on step 1 is a
 * PATCH and the key has no further use — and a key left behind would be
 * presented by the next "Add a business" and replayed as the first one.
 *
 * This is the belt; the braces are server-side. `POST /tenants` resumes the
 * caller's unfinished business instead of creating another, so even a lost key
 * cannot produce a duplicate.
 */
const CREATE_KEY_STORAGE = 'onboarding.tenantCreateKey';

/** Where step 1 goes next: the first step the server has not recorded as done. */
const stepAfterBusiness = (onboardingStep: number | null | undefined): number =>
  Math.min(ONBOARDING_STEP_MAX, Math.max(2, (onboardingStep ?? 1) + 1));

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
  /**
   * NEW-1 — the wizard is reading its business back from the server after a
   * reload. The step is not drawn meanwhile: its form takes its values once, at
   * mount, and mounting it on an empty draft is how step 1 showed blank.
   */
  readonly isResuming: boolean;
  /**
   * L7 — the step the progress bar names. While the business is read back it
   * is the step the URL asked for: the slice's `step` is still clamped against
   * an empty `completedStep`, which put "Step 1 of 4 · Tell us about your
   * business" over the skeleton of step 2.
   */
  readonly progressStep: number;
  /**
   * M2 — the unfinished business step 1 will continue, when "Add a business"
   * found one. Step 1 names it and shows its values; Continue finishes it.
   */
  readonly resumableBusiness: ResumableBusiness | null;
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
  const tenantId = useAppSelector(selectOnboardingTenantId);
  const resumeStatus = useAppSelector(selectOnboardingResumeStatus);
  const resumable = useAppSelector(selectOnboardingResumable);
  const resumableStatus = useAppSelector(selectOnboardingResumableStatus);
  const activeTenant = useAppSelector(selectActiveTenant);

  /**
   * EC-7 — ONE key for this wizard's `POST /tenants`, however many times the
   * hook is remounted.
   *
   * `useIdempotencyKey` mints on mount, and every step of this wizard is its
   * own route, so the hook remounts on each navigation and the key changed
   * underneath the one write that must not change it. The key is therefore
   * stored in the slice on first use and read back from there afterwards,
   * which is exactly what that hook's docstring prescribes for a write with
   * slice state.
   */
  const storedCreateKey = useAppSelector(selectOnboardingCreateKey);
  const { key: mintedKey } = useIdempotencyKey();
  const idempotencyKey = storedCreateKey ?? mintedKey;

  // NEW-1 — a key persisted before a reload is adopted in preference to the
  // one this mount minted; see `CREATE_KEY_STORAGE`.
  useEffect(() => {
    if (storedCreateKey !== null) return;
    const key = readLocal<string | null>(CREATE_KEY_STORAGE, null) ?? mintedKey;
    writeLocal(CREATE_KEY_STORAGE, key);
    dispatch(tenantCreateKeyMinted(key));
  }, [dispatch, storedCreateKey, mintedKey]);

  /**
   * NEW-1 / FR-9 — after a reload the slice is empty but the server is not.
   * When the session's active business is this owner's unfinished one, read it
   * back before drawing a step, so step 1 shows what was saved and step 3 is
   * reachable by its own URL. Once the slice holds a tenant — from this read or
   * from a step write — there is nothing to resume.
   */
  const needsResume = tenantId === null && shouldResumeFromServer(activeTenant);
  useEffect(() => {
    if (needsResume && resumeStatus === 'idle') void dispatch(resumeOnboarding({ routeStep }));
  }, [dispatch, needsResume, resumeStatus, routeStep]);

  /**
   * M2 — "Add a business" opens this wizard from a FINISHED business, and
   * `POST /tenants` will quietly continue the caller's unfinished one if the
   * server judges it an abandoned attempt. Ask which, before step 1 is drawn
   * (its form takes its values once, at mount), so step 1 can say so and show
   * that business's values instead of a blank form whose new name would
   * rename it. Keyed off the session rather than a flag set by the switcher,
   * so a reload of step 1 asks again.
   */
  const needsResumableCheck =
    tenantId === null &&
    !needsResume &&
    activeTenant !== null &&
    isOnboardingComplete(activeTenant.onboardingStep);
  useEffect(() => {
    if (needsResumableCheck && resumableStatus === 'idle') void dispatch(findResumableBusiness());
  }, [dispatch, needsResumableCheck, resumableStatus]);
  const isCheckingResumable =
    needsResumableCheck && (resumableStatus === 'idle' || resumableStatus === 'loading');

  const isResuming = (needsResume && resumeStatus !== 'failed') || isCheckingResumable;

  const [formErrors, setFormErrors] = useState<readonly string[]>([]);

  // FR-9 — the route is the truth about which step is showing. The slice is
  // told, not the other way round, so a deep link and a Back gesture both work.
  useEffect(() => {
    dispatch(stepChanged(routeStep));
  }, [dispatch, routeStep]);

  // §9 "Completed" — the preset has been applied; the customer list's
  // first-use state (FR-11) is where the merchant belongs, not a wizard they
  // finished. Straight to it: there is no dashboard in the product (RPT-01 is
  // unbuilt), and `/dashboard` survives only as a redirect for old links.
  useEffect(() => {
    if (completed) router.replace(ROUTES.PARTIES);
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

  /**
   * FR-2 the first time, FR-9 every time after.
   *
   * The stepper makes a completed step navigable for EDITS (`UbStepper`'s
   * `number <= completed`), and step 1 is the business name — the single most
   * likely thing a merchant comes back to fix. This handler used to call
   * `createTenant` unconditionally, so that edit created a SECOND business,
   * which then became the active tenant and which cannot be deleted at MVP.
   * The branch is on the tenant the slice already holds, which is the only
   * thing that distinguishes "create" from "correct".
   *
   * On an edit the wizard does NOT jump to step 2: the merchant came back
   * deliberately, and `goToStep` will take them wherever they were.
   */
  const submitBusinessStep = useCallback(
    async (values: BusinessStepFormValues, setError: UseFormSetError<BusinessStepFormValues>) => {
      setFormErrors([]);
      // Held in a const so the narrowing survives into the retry closure below.
      const { businessType } = values;
      if (!businessType) return;
      const isEdit = tenantId !== null;
      try {
        if (isEdit) {
          const result = await dispatch(
            saveBusinessStep({
              name: values.name,
              businessType,
              stateCode: values.stateCode,
              ownerName: values.ownerName,
            })
          ).unwrap();
          // An edit returns the merchant to where they were, which the SERVER
          // knows: `onboarding_step` is untouched by this PATCH, so the next
          // unfinished step is still the right destination. Reading it off the
          // response rather than off `completedStep` avoids resuming from the
          // value this render closed over.
          advance(stepAfterBusiness(result.tenant.onboardingStep));
          return;
        }
        const create = (key: string) =>
          dispatch(
            createTenant({
              name: values.name,
              businessType,
              stateCode: values.stateCode,
              ownerName: values.ownerName,
              idempotencyKey: key,
            })
          ).unwrap();
        let created: OnboardingResult;
        try {
          created = await create(idempotencyKey);
        } catch (thrown) {
          // NEW-1 — the persisted key was spent on a create whose response was
          // lost, and these values differ from that attempt's. Retrying under
          // it can only ever answer 409, so it is replaced once; the server's
          // resume guard makes the retry land on that same business.
          if ((thrown as ApiErrorShape).code !== 'idempotency_conflict') throw thrown;
          const fresh = newRequestId();
          writeLocal(CREATE_KEY_STORAGE, fresh);
          dispatch(tenantCreateKeyRotated(fresh));
          created = await create(fresh);
        }
        // The key has done its job; from here step 1 is a PATCH.
        removeLocal(CREATE_KEY_STORAGE);
        // A new business is at step 1, so this is step 2. One the server
        // RESUMED (NEW-1) goes on from where it had got to, as an edit does.
        advance(stepAfterBusiness(created.tenant.onboardingStep));
      } catch (thrown) {
        const apiError = thrown as ApiErrorShape;
        if (apiError.code === 'validation_error') {
          setFormErrors(applyServerErrors(apiError, setError, [...BUSINESS_FIELDS]));
          return;
        }
        // L8 — another tab is still creating this very business under the
        // same key, and the thunk has already waited for it three times. Say
        // so: `createTenant` suppresses the global toast, so without this the
        // merchant stayed on step 1 with nothing on screen. Pressing Continue
        // again replays the other tab's business once it lands.
        if (apiError.code === 'idempotency_in_progress') {
          dispatch(showSnackbar({ severity: 'warning', id: 'onboarding.error.inProgress' }));
        }
        // `gstin_in_use` cannot occur on step 1; everything else is the banner.
      }
    },
    [dispatch, idempotencyKey, advance, tenantId]
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
      dispatch(showSnackbar({ severity: 'success', id: 'onboarding.done' }));
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
    isResuming,
    progressStep: isResuming ? Math.min(ONBOARDING_STEP_MAX, Math.max(1, routeStep)) : step,
    resumableBusiness: tenantId === null ? resumable : null,
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
