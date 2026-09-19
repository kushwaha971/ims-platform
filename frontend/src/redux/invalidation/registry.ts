import {
  confirmPasswordReset,
  passwordLogin,
  registerAccount,
  requestPasswordReset,
  setPassword,
} from 'modules/DigiKhaato/features/auth/redux/authThunk';
import {
  fetchSession,
  logout,
  switchTenant,
} from 'modules/DigiKhaato/features/auth/redux/sessionThunk';
import {
  completeOnboarding,
  createTenant,
  saveAddressStep,
  saveBusinessStep,
  saveGstStep,
} from 'modules/DigiKhaato/features/onboarding/redux/onboardingThunk';
import { fetchPartyList } from 'modules/DigiKhaato/features/parties/redux/partyListThunk';
import { fetchPlanLimits } from 'modules/DigiKhaato/features/plan/redux/planThunk';
import {
  leaveTenant,
  setDefaultTenant,
} from 'modules/DigiKhaato/features/tenant-switcher/redux/tenantSwitcherThunk';

/**
 * Part 19 §19.3.6 — every async thunk in the codebase is registered exactly
 * once, as a QUERY or a MUTATION. This is what makes completeness CHECKABLE
 * rather than remembered: `invalidation.registry.test.ts` parses every
 * `features/**\/redux/*Thunk.ts`, collects every `createAsyncThunk(` call and
 * fails CI naming any thunk that is in neither list.
 *
 * Sprint 0 has exactly the thunks the chassis and the walking skeleton need.
 * The lists grow one line per thunk; the machinery does not.
 */
export const QUERIES = {
  // session
  fetchSession,
  // PLT-15 — the plan's modules and member count, read from /auth/me
  fetchPlanLimits,
  // parties (the walking skeleton, Part 32 S0-71)
  fetchPartyList,
} as const;

export const MUTATIONS = {
  // platform & settings
  switchTenant,
  logout,
  // CR-2026-09-19-A — email + password sign-up replaces the OTP pair
  registerAccount,
  // PLT-02 — password login, set and reset
  passwordLogin,
  setPassword,
  requestPasswordReset,
  confirmPasswordReset,
  // PLT-03 — the onboarding wizard, one mutation per step
  createTenant,
  saveBusinessStep,
  saveGstStep,
  saveAddressStep,
  completeOnboarding,
  // PLT-04 — multiple businesses
  setDefaultTenant,
  leaveTenant,
} as const;

export type TQueryName = keyof typeof QUERIES;
export type TMutationName = keyof typeof MUTATIONS;

/** Every registered thunk, for the completeness test and the listener. */
export const REGISTERED_THUNK_NAMES: readonly string[] = [
  ...Object.keys(QUERIES),
  ...Object.keys(MUTATIONS),
];
