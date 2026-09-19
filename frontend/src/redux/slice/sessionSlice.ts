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

export interface SessionUser {
  readonly id: string;
  readonly name: string;
  readonly mobile: string;
  readonly locale: Locale;
}

export interface SessionTenant {
  readonly id: string;
  readonly name: string;
  readonly timezone: string;
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
