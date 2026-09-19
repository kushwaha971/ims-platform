import { createAsyncThunk } from '@reduxjs/toolkit';

import type { SessionPayload } from 'src/redux/slice/sessionSlice';
import type { ApiErrorShape } from 'src/types/api.types';
import { toApiError } from 'src/utils/apiError';

import { getSession } from '../../auth/api/authService';
import * as onboardingService from '../api/onboardingService';

import type {
  OnboardingAddressStep,
  OnboardingBusinessStep,
  OnboardingGstStep,
  OnboardingResult,
  OnboardingSummaryStep,
} from '../types/onboarding.types';

/**
 * Part 19 §19.3.3 — one service call per thunk, three type arguments, and a
 * catch that normalises. Nothing here decides what the wizard shows next; that
 * is `useOnboarding()` reading the step the server confirmed.
 */

export interface CreateTenantArg extends OnboardingBusinessStep {
  /**
   * EC-7 — minted ONCE by `useIdempotencyKey()` before the first attempt and
   * reused on every retry, so a lost response replays the created tenant
   * instead of creating a second business (§19.1.3 note 1).
   */
  readonly idempotencyKey: string;
}

/** MUTATION — PLT-03 FR-2. Creates the tenant and re-issues the token. */
export const createTenant = createAsyncThunk<
  OnboardingResult,
  CreateTenantArg,
  { rejectValue: ApiErrorShape }
>('onboarding/createTenant', async ({ idempotencyKey, ...input }, { rejectWithValue }) => {
  try {
    return await onboardingService.createTenant(input, idempotencyKey);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'onboarding.error.create'));
  }
});

/**
 * MUTATION — PLT-03 FR-9. Step 1 EDITED, on a tenant that already exists.
 *
 * This is the other half of `createTenant`: the stepper makes a completed step
 * navigable, and `POST /tenants` is the wrong verb for a business the merchant
 * already owns. No idempotency key, because a PATCH of three named fields is
 * idempotent by construction — a replayed retry writes the same three values.
 */
export const saveBusinessStep = createAsyncThunk<
  OnboardingResult,
  OnboardingBusinessStep,
  { rejectValue: ApiErrorShape }
>('onboarding/saveBusinessStep', async (input, { rejectWithValue }) => {
  try {
    return await onboardingService.updateBusinessStep(input);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'onboarding.error.save'));
  }
});

/** MUTATION — PLT-03 FR-3. May return `warnings[]`; they are not failures. */
export const saveGstStep = createAsyncThunk<
  OnboardingResult,
  OnboardingGstStep,
  { rejectValue: ApiErrorShape }
>('onboarding/saveGstStep', async (input, { rejectWithValue }) => {
  try {
    return await onboardingService.updateGstStep(input);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'onboarding.error.save'));
  }
});

/** MUTATION — PLT-03 FR-4. */
export const saveAddressStep = createAsyncThunk<
  OnboardingResult,
  OnboardingAddressStep,
  { rejectValue: ApiErrorShape }
>('onboarding/saveAddressStep', async (input, { rejectWithValue }) => {
  try {
    return await onboardingService.updateAddressStep(input);
  } catch (error) {
    return rejectWithValue(toApiError(error, 'onboarding.error.save'));
  }
});

export interface CompleteOnboardingResult extends OnboardingResult {
  /**
   * §19.6.5 step 2 — the preset the server applies changes `enabled_modules`,
   * and the navigation and the plan card both read them from the session. The
   * re-read happens inside the thunk so that `sessionSlice` can apply it in its
   * own extraReducers on this one action, which is what the INVALIDATION map's
   * `patch` entry declares.
   */
  readonly session: SessionPayload;
}

/**
 * MUTATION — PLT-03 FR-5. `onboarding_step: 4` is what triggers the preset
 * application, and BR-3 makes that idempotent, so a retry after a lost response
 * is safe without an idempotency key.
 */
export const completeOnboarding = createAsyncThunk<
  CompleteOnboardingResult,
  OnboardingSummaryStep,
  { rejectValue: ApiErrorShape }
>('onboarding/completeOnboarding', async (input, { rejectWithValue }) => {
  try {
    const result = await onboardingService.completeOnboarding(input);
    const session = await getSession();
    return { ...result, session };
  } catch (error) {
    return rejectWithValue(toApiError(error, 'onboarding.error.complete'));
  }
});
