import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import type { RootState } from 'src/redux/store';
import type { ApiErrorShape, RequestStatus } from 'src/types/api.types';
import type { Locale } from 'src/types/domain.types';

import { ONBOARDING_STEP_COUNT } from '../constants/onboardingSteps';

import {
  completeOnboarding,
  createTenant,
  saveAddressStep,
  saveBusinessStep,
  saveGstStep,
} from './onboardingThunk';

import type { BusinessType, GstType } from '../constants/businessTypes';
import type {
  OnboardingAddress,
  OnboardingTenant,
  OnboardingWarning,
} from '../types/onboarding.types';

/**
 * Part 19 §19.3.2 — the wizard's slice.
 *
 * The draft is kept here rather than in four component `useState`s because
 * PLT-03 FR-9 requires RESUME: a merchant who abandons at step 2, closes the
 * tab and logs in the next morning must land on step 3 with steps 1–2 ticked.
 * The server owns what has been completed (`onboarding_step`); this slice owns
 * what is on screen and what the last response said.
 *
 * `completedStep` is the SERVER's number, never the client's optimism. A step
 * whose PATCH failed is not complete however far the user scrolled.
 */
export interface OnboardingDraft {
  name: string;
  businessType: BusinessType | null;
  stateCode: string | null;
  ownerName: string | null;
  gstType: GstType;
  gstin: string | null;
  legalName: string | null;
  pan: string | null;
  address: OnboardingAddress;
  phone: string | null;
  email: string | null;
  locale: Locale | null;
}

export interface OnboardingState {
  /** 1–4; the step being shown. */
  step: number;
  /** What the SERVER says is done. The stepper ticks these and no others. */
  completedStep: number;
  draft: OnboardingDraft;
  tenantId: string | null;
  /** FR-3 — non-blocking server notes, e.g. `gstin_state_mismatch`. */
  warnings: OnboardingWarning[];
  status: RequestStatus;
  error: ApiErrorShape | null;
  /** §9 "Completed" — the preset has been applied; the dashboard is next. */
  completed: boolean;
  /**
   * PLT-03 EC-7 — the `Idempotency-Key` for `POST /tenants`, minted ONCE for
   * this wizard and held here rather than in the hook.
   *
   * `useIdempotencyKey`'s own docstring says "a remount must not mint a new
   * one, which is why a write with slice state also stores it in the slice" —
   * and this wizard has slice state and did not. Every step is a route, so
   * `useOnboarding` is remounted on each navigation and minted a fresh key
   * each time: a retry after a lost 201 carried a key the server had never
   * seen, and created a second business, which is the exact failure the header
   * exists to prevent.
   */
  tenantCreateKey: string | null;
}

const emptyAddress: OnboardingAddress = {
  line1: null,
  line2: null,
  city: null,
  district: null,
  pincode: null,
};

const initialDraft: OnboardingDraft = {
  name: '',
  businessType: null,
  stateCode: null,
  ownerName: null,
  // §8 — "Default GST choice is 'Not registered'", which is the true state of
  // most of the businesses this product is for.
  gstType: 'unregistered',
  gstin: null,
  legalName: null,
  pan: null,
  address: emptyAddress,
  phone: null,
  email: null,
  locale: null,
};

const initialState: OnboardingState = {
  step: 1,
  completedStep: 0,
  draft: initialDraft,
  tenantId: null,
  warnings: [],
  status: 'idle',
  error: null,
  completed: false,
  tenantCreateKey: null,
};

/** Fold a server tenant back into the draft, so a resume shows real values. */
const applyTenant = (state: Draft<OnboardingState>, tenant: OnboardingTenant): void => {
  state.tenantId = tenant.id;
  state.completedStep = Math.min(ONBOARDING_STEP_COUNT, tenant.onboardingStep);
  state.draft.name = tenant.name;
  state.draft.businessType = tenant.businessType;
  state.draft.stateCode = tenant.stateCode;
  state.draft.gstType = tenant.gstType;
  state.draft.gstin = tenant.gstin;
  state.draft.legalName = tenant.legalName;
  state.draft.pan = tenant.pan;
  state.draft.phone = tenant.phone;
  state.draft.email = tenant.email;
  state.draft.locale = tenant.locale;
  state.draft.address = { ...tenant.address };
};

const onboardingSlice = createSlice({
  name: 'onboarding',
  initialState,
  reducers: {
    stepChanged(state, action: PayloadAction<number>) {
      // FR-9 — a completed step is navigable for edits; a future one is not
      // reachable by typing a URL, because its prerequisites are not saved.
      const target = Math.max(1, Math.min(ONBOARDING_STEP_COUNT, action.payload));
      state.step = Math.min(target, state.completedStep + 1);
      state.error = null;
    },
    draftChanged(state, action: PayloadAction<Partial<OnboardingDraft>>) {
      Object.assign(state.draft, action.payload);
    },
    /** FR-3's "Use state from GSTIN" offer, accepted. */
    stateCodeAdopted(state, action: PayloadAction<string>) {
      state.draft.stateCode = action.payload;
      state.warnings = state.warnings.filter((warning) => warning.code !== 'gstin_state_mismatch');
    },
    /** EC-7 — minted once per wizard, by the first mount that needs it. */
    tenantCreateKeyMinted(state, action: PayloadAction<string>) {
      if (state.tenantCreateKey === null) state.tenantCreateKey = action.payload;
    },
    warningsDismissed(state) {
      state.warnings = [];
    },
    onboardingErrorCleared(state) {
      state.error = null;
    },
    resetOnboarding: () => initialState,
  },
  extraReducers: (builder) => {
    const pending = (state: Draft<OnboardingState>): void => {
      state.status = 'loading';
      state.error = null;
    };
    const rejected = (
      state: Draft<OnboardingState>,
      action: { payload?: ApiErrorShape; meta: { aborted: boolean } }
    ): void => {
      if (action.meta.aborted) return;
      state.status = 'failed';
      state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
    };

    builder
      .addCase(createTenant.pending, pending)
      .addCase(createTenant.fulfilled, (state, action) => {
        state.status = 'succeeded';
        applyTenant(state, action.payload.tenant);
        state.warnings = [...action.payload.warnings];
        state.step = 2;
      })
      .addCase(createTenant.rejected, rejected)

      // FR-9 — step 1 EDITED. Same three fields, other verb, and crucially
      // `step` is NOT forced to 2: an edit returns the merchant to where the
      // stepper sent them from, it does not replay the wizard at them.
      .addCase(saveBusinessStep.pending, pending)
      .addCase(saveBusinessStep.fulfilled, (state, action) => {
        state.status = 'succeeded';
        applyTenant(state, action.payload.tenant);
        state.warnings = [...action.payload.warnings];
      })
      .addCase(saveBusinessStep.rejected, rejected)

      .addCase(saveGstStep.pending, pending)
      .addCase(saveGstStep.fulfilled, (state, action) => {
        state.status = 'succeeded';
        applyTenant(state, action.payload.tenant);
        state.warnings = [...action.payload.warnings];
        state.step = 3;
      })
      .addCase(saveGstStep.rejected, rejected)

      .addCase(saveAddressStep.pending, pending)
      .addCase(saveAddressStep.fulfilled, (state, action) => {
        state.status = 'succeeded';
        applyTenant(state, action.payload.tenant);
        state.warnings = [...action.payload.warnings];
        state.step = 4;
      })
      .addCase(saveAddressStep.rejected, rejected)

      .addCase(completeOnboarding.pending, pending)
      .addCase(completeOnboarding.fulfilled, (state, action) => {
        state.status = 'succeeded';
        applyTenant(state, action.payload.tenant);
        state.completed = true;
      })
      // §9 "Failed" — a preset error leaves the wizard on step 4 with Retry and
      // the tenant at `onboarding_step=3`; the step is NOT advanced.
      .addCase(completeOnboarding.rejected, rejected)

      /**
       * A logout or a tenant switch abandons a half-finished wizard — with the
       * same bounded exception `authSlice` carries, and for the same reason.
       *
       * `createTenant` is mapped to `resetAll` because it re-issues the token
       * with a new `tid`, and everything cached for the previous tenant (or for
       * no tenant) must go. The listener dispatches that teardown AFTER this
       * slice's own `fulfilled` reducer has run, so a naive `() => initialState`
       * would destroy the very tenant the wizard just created and bounce the
       * merchant back to step 1 of a business that already exists.
       *
       * What is carried across is only what a SUCCESSFUL step write just put
       * here. The guard is `tenantId`: while this slice holds one, the only
       * `resetAll` that can reach it is its own, because the wizard lives in the
       * `(auth)` route group, which has no tenant switcher, no logout control
       * and no other tenant-scoped screen. "Add a business" (FR-6) enters from
       * the app and clears this slice explicitly before navigating.
       */
      .addCase(resetAllFeatureState, (state) =>
        state.tenantId === null
          ? initialState
          : {
              ...initialState,
              step: state.step,
              completedStep: state.completedStep,
              draft: state.draft,
              tenantId: state.tenantId,
              warnings: state.warnings,
              completed: state.completed,
              status: state.status,
            }
      );
  },
});

export const {
  stepChanged,
  draftChanged,
  stateCodeAdopted,
  tenantCreateKeyMinted,
  warningsDismissed,
  onboardingErrorCleared,
  resetOnboarding,
} = onboardingSlice.actions;

export default onboardingSlice.reducer;

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectOnboardingStep = (state: RootState): number => state.onboarding.step;
export const selectOnboardingCompletedStep = (state: RootState): number =>
  state.onboarding.completedStep;
export const selectOnboardingDraft = (state: RootState): OnboardingDraft => state.onboarding.draft;
export const selectOnboardingStatus = (state: RootState): RequestStatus => state.onboarding.status;
export const selectOnboardingError = (state: RootState): ApiErrorShape | null =>
  state.onboarding.error;
export const selectOnboardingWarnings = (state: RootState): readonly OnboardingWarning[] =>
  state.onboarding.warnings;
export const selectOnboardingTenantId = (state: RootState): string | null =>
  state.onboarding.tenantId;
/** EC-7 — the one key `POST /tenants` may carry for this wizard. */
export const selectOnboardingCreateKey = (state: RootState): string | null =>
  state.onboarding.tenantCreateKey;
export const selectOnboardingCompleted = (state: RootState): boolean => state.onboarding.completed;
