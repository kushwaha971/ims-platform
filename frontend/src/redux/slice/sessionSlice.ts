import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import type { RootState } from 'src/redux/store';
import type { ApiErrorShape } from 'src/types/api.types';
import type { Locale, ModuleCode, PermissionCode } from 'src/types/domain.types';

import {
  fetchSession,
  logout,
  switchTenant,
} from 'modules/UdhaarBook/features/auth/redux/sessionThunk';
import { completeOnboarding } from 'modules/UdhaarBook/features/onboarding/redux/onboardingThunk';
import {
  leaveTenant,
  setDefaultTenant,
} from 'modules/UdhaarBook/features/tenant-switcher/redux/tenantSwitcherThunk';

/**
 * Part 19 §19.7 — the session. This is the slice the task brief calls
 * `authSlice`; §19.2.1 and §19.7 name it `sessionSlice`, the transport layer
 * imports `sessionExpired` from it, and the spec wins on names (§19.0).
 *
 * Tokens are NOT here and never will be: `ub_access` and `ub_refresh` are
 * httpOnly cookies the browser attaches and JavaScript cannot read (§19.7.1).
 * What lives here is the session SUMMARY, rehydrated from `GET /auth/me` on
 * every app load, so a role change is never stale.
 */
export type SessionStatus =
  | 'idle'
  | 'loading'
  | 'authenticated'
  | 'anonymous'
  /** A new user with no business yet — onboarding, not login (§19.7.3). */
  | 'no_tenant';

/**
 * CR-2026-09-19-A — the identity is the email. `mobile` stays on the user
 * because parties, invoices and the later WhatsApp reminders all want a number
 * to prefill, but it is a profile field now and an account may not have one, so
 * it is nullable and `email` is not.
 */
export interface SessionUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly mobile: string | null;
  readonly locale: Locale;
}

/**
 * PLT-04 FR-1 — the switcher lists every membership with its role and which one
 * is the default, so the four fields below are part of the SESSION summary and
 * not a second fetch. Part 22 §22.2's `/auth/me` returns them on each tenant
 * row; they are optional here because Sprint 0's fixture did not carry them and
 * a session without a role is still a usable session.
 */
export interface SessionTenant {
  readonly id: string;
  readonly name: string;
  readonly timezone: string;
  /** `owner | admin | staff | accountant`, as the caller holds it here. */
  readonly role?: string | null;
  readonly isDefault?: boolean;
  /** `active | invited | suspended | removed`. */
  readonly status?: string;
  /** The caller's OWN membership row id — what FR-5 and FR-7 act on. */
  readonly membershipId?: string | null;
  /** PLT-03 FR-9 — `< 4` means this business's wizard is unfinished. */
  readonly onboardingStep?: number | null;
}

export interface SessionState {
  status: SessionStatus;
  user: SessionUser | null;
  activeTenant: SessionTenant | null;
  tenants: SessionTenant[];
  permissions: PermissionCode[];
  enabledModules: ModuleCode[];
  error: ApiErrorShape | null;
  /** The token's `ver` claim; a change forces a re-read (Part 22 §22.2). */
  version: number | null;
  lastFetchedAt: number | null;
}

const initialState: SessionState = {
  status: 'idle',
  user: null,
  activeTenant: null,
  tenants: [],
  permissions: [],
  enabledModules: [],
  error: null,
  version: null,
  lastFetchedAt: null,
};

export interface SessionPayload {
  readonly user: SessionUser;
  readonly activeTenant: SessionTenant | null;
  readonly tenants: readonly SessionTenant[];
  readonly permissions: readonly PermissionCode[];
  readonly enabledModules: readonly ModuleCode[];
  readonly version: number | null;
}

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    sessionRequested(state) {
      state.status = state.status === 'authenticated' ? 'authenticated' : 'loading';
      state.error = null;
    },
    sessionLoaded(state, action: PayloadAction<SessionPayload>) {
      const payload = action.payload;
      state.user = payload.user;
      state.activeTenant = payload.activeTenant;
      state.tenants = [...payload.tenants];
      state.permissions = [...payload.permissions];
      state.enabledModules = [...payload.enabledModules];
      state.version = payload.version;
      state.lastFetchedAt = Date.now();
      state.error = null;
      state.status = payload.activeTenant ? 'authenticated' : 'no_tenant';
    },
    sessionAnonymous(state, action: PayloadAction<ApiErrorShape | null>) {
      Object.assign(state, initialState);
      state.status = 'anonymous';
      // See partyListSlice: a frozen, never-mutated ApiErrorShape in a draft.
      state.error = action.payload as Draft<ApiErrorShape> | null;
    },
    /** Dispatched by the transport layer when the refresh itself failed. */
    sessionExpired: () => ({ ...initialState, status: 'anonymous' as const }),
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSession.pending, (state) => {
        state.status = state.status === 'authenticated' ? 'authenticated' : 'loading';
        state.error = null;
      })
      .addCase(fetchSession.fulfilled, (state, action) => {
        sessionSlice.caseReducers.sessionLoaded(state, {
          type: 'session/sessionLoaded',
          payload: action.payload,
        });
      })
      .addCase(fetchSession.rejected, (state, action) => {
        // An aborted bootstrap is a remount, not a logout.
        if (action.meta.aborted) return;
        Object.assign(state, initialState);
        state.status = 'anonymous';
        state.error = (action.payload ?? null) as Draft<ApiErrorShape> | null;
      })
      // PLT-04 FR-5 / FR-7 — both re-read `/auth/me` and hand back the whole
      // summary, so the membership list is PATCHED in place here rather than
      // marked stale (the INVALIDATION map's `patch` entries say exactly this).
      .addCase(setDefaultTenant.fulfilled, (state, action) => {
        sessionSlice.caseReducers.sessionLoaded(state, {
          type: 'session/sessionLoaded',
          payload: action.payload,
        });
      })
      .addCase(leaveTenant.fulfilled, (state, action) => {
        sessionSlice.caseReducers.sessionLoaded(state, {
          type: 'session/sessionLoaded',
          payload: action.payload,
        });
      })
      // PLT-03 FR-5 — completing the wizard applies the preset, which changes
      // `enabled_modules` and the tenant summary the navigation reads.
      .addCase(completeOnboarding.fulfilled, (state, action) => {
        sessionSlice.caseReducers.sessionLoaded(state, {
          type: 'session/sessionLoaded',
          payload: action.payload.session,
        });
      })
      .addCase(switchTenant.fulfilled, (state, action) => {
        sessionSlice.caseReducers.sessionLoaded(state, {
          type: 'session/sessionLoaded',
          payload: action.payload,
        });
      })
      .addCase(logout.fulfilled, () => ({ ...initialState, status: 'anonymous' as const }))
      // A tenant switch keeps the session and clears everything else; the
      // session itself is refetched immediately afterwards (§19.6.5 step 2).
      .addCase(resetAllFeatureState, (state) => {
        state.error = null;
      });
  },
});

export const { sessionRequested, sessionLoaded, sessionAnonymous, sessionExpired } =
  sessionSlice.actions;

export default sessionSlice.reducer;

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectSessionStatus = (state: RootState): SessionStatus => state.session.status;
export const selectSessionUser = (state: RootState): SessionUser | null => state.session.user;
export const selectActiveTenant = (state: RootState): SessionTenant | null =>
  state.session.activeTenant;
export const selectPermissions = (state: RootState): readonly PermissionCode[] =>
  state.session.permissions;
export const selectEnabledModules = (state: RootState): readonly ModuleCode[] =>
  state.session.enabledModules;
export const selectTenantTimezone = (state: RootState): string | null =>
  state.session.activeTenant?.timezone ?? null;
/** PLT-04 FR-1 — every membership the switcher may list. */
export const selectSessionTenants = (state: RootState): readonly SessionTenant[] =>
  state.session.tenants;
