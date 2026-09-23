import { createSlice, type Draft, type PayloadAction, type UnknownAction } from '@reduxjs/toolkit';

import { resetAllFeatureState } from 'src/redux/actions';
import type { RootState } from 'src/redux/store';
import type { ApiErrorShape } from 'src/types/api.types';
import type { Locale, ModuleCode, PermissionCode } from 'src/types/domain.types';

import {
  confirmPasswordReset,
  passwordLogin,
  registerAccount,
} from 'modules/DigiKhaato/features/auth/redux/authThunk';
import {
  fetchSession,
  logout,
  switchTenant,
} from 'modules/DigiKhaato/features/auth/redux/sessionThunk';
import { completeOnboarding } from 'modules/DigiKhaato/features/onboarding/redux/onboardingThunk';
import {
  leaveTenant,
  setDefaultTenant,
} from 'modules/DigiKhaato/features/tenant-switcher/redux/tenantSwitcherThunk';

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
  /**
   * DEC-012 — this account is signed in on a password a business owner created
   * for them and sent by hand. The SERVER is the authority and refuses every
   * route but the change itself; this field exists so `RequireSession` can send
   * them to that screen instead of letting them walk into a wall of 403s on
   * their first ever sign-in.
   */
  readonly mustChangePassword: boolean;
  /** ISO 8601, or `null` once they have chosen their own password. */
  readonly passwordExpiresAt: string | null;
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
  /**
   * N1-P1 — has THIS DOCUMENT (this JS runtime) held a session before?
   *
   * It survives every reset in this slice — logout, expiry, the login screen's
   * teardown, a new sign-in — and is cleared only by a page load, which is the
   * point: `useAuthRedirect` reads it to decide that a sign-in following an
   * earlier session in the same runtime must finish with a DOCUMENT load, not
   * a client navigation. See `useAuthRedirect` for why.
   */
  heldInThisDocument: boolean;
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
  heldInThisDocument: false,
};

/**
 * A session that has just ended, or not yet begun: everything back to
 * `initialState` and `anonymous` — except `heldInThisDocument`, which only a
 * page load clears.
 */
const endedSession = (state: SessionState): SessionState => ({
  ...initialState,
  status: 'anonymous',
  heldInThisDocument: state.heldInThisDocument,
});

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
      state.heldInThisDocument = true;
    },
    sessionAnonymous(state, action: PayloadAction<ApiErrorShape | null>) {
      Object.assign(state, endedSession(state));
      // See partyListSlice: a frozen, never-mutated ApiErrorShape in a draft.
      state.error = action.payload as Draft<ApiErrorShape> | null;
    },
    /** Dispatched by the transport layer when the refresh itself failed. */
    sessionExpired: (state) => endedSession(state),
    /**
     * The session exactly as a freshly loaded document has it —
     * `heldInThisDocument` included. Nothing in the product dispatches this:
     * only a page load clears that flag. It is the test seam for the singleton
     * store, as `resetAuth` is for the auth slice.
     */
    resetSession: () => initialState,
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
        Object.assign(state, endedSession(state));
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
      .addCase(logout.fulfilled, (state) => endedSession(state))
      /* NEW-1 — a successful sign-in, sign-up or reset-confirm is a NEW
         session, and whatever summary the store held belongs to the previous
         one. It is cleared here, on the fulfilled action itself, before
         `useAuthRedirect` asks `/auth/me` who this is.

         Leaving it was the second half of NEW-1: a session that ended by
         cookie expiry was still in the store (tenant B), the new user signed
         in to tenant A, and `/auth/me` answered with `X-Tenant-Id: A` — which
         the stale-tab guard compared against B, took for "switched in another
         tab", and answered with a hard reload back to /login. Meanwhile the
         shell had painted B's business name for the new user. With no
         `activeTenant` the guard has nothing to compare against, which is its
         documented one-sided behaviour for "before `/auth/me` has said which
         tenant this tab is in"; it is armed again the moment `/auth/me` lands.

         `anonymous` rather than `loading`: nothing is being fetched yet, and
         `fetchSession.pending` moves it to `loading` in the same tick
         `useAuthRedirect` dispatches it. */
      .addCase(passwordLogin.fulfilled, (state) => endedSession(state))
      .addCase(registerAccount.fulfilled, (state) => endedSession(state))
      .addCase(confirmPasswordReset.fulfilled, (state) => endedSession(state))
      // A tenant switch keeps the session and clears everything else; the
      // session itself is refetched immediately afterwards (§19.6.5 step 2).
      .addCase(resetAllFeatureState, (state) => {
        state.error = null;
      });
  },
});

export const { sessionRequested, sessionLoaded, sessionAnonymous, sessionExpired, resetSession } =
  sessionSlice.actions;

/**
 * FB-3 / NEW-1 — end the session on this device, as logout does, without a
 * request: the session goes anonymous first (so `RequireSession` unmounts every
 * screen in the same render and none of them can refetch into a 401), then the
 * one teardown every feature slice answers.
 *
 * One function because there are two callers and the ORDER is the point: the
 * transport host's `onSessionExpired` (the refresh itself 401'd) and the login
 * screen finding a session in the store that the cookies no longer back.
 */
export const endSessionLocally = (dispatch: (action: UnknownAction) => unknown): void => {
  dispatch(sessionExpired());
  dispatch(resetAllFeatureState());
};

/**
 * NEW-1 — does the store hold a session summary a login screen must not sit
 * over? `authenticated` and `no_tenant` both carry a user; `idle` and `loading`
 * are a bootstrap still deciding, and `anonymous` is already torn down.
 */
export const selectHoldsSession = (state: RootState): boolean =>
  state.session.status === 'authenticated' || state.session.status === 'no_tenant';

export default sessionSlice.reducer;

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectSessionStatus = (state: RootState): SessionStatus => state.session.status;
/** N1-P1 — see `SessionState.heldInThisDocument`. */
export const selectSessionHeldInThisDocument = (state: RootState): boolean =>
  state.session.heldInThisDocument;
export const selectMustChangePassword = (state: RootState): boolean =>
  state.session.user?.mustChangePassword ?? false;
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
/**
 * The caller's role IN THE ACTIVE BUSINESS, or `null`.
 *
 * Added for LED-01's "Save anyway" (BR-8), which is the one place in this
 * product where a decision turns on a role rather than a permission codename —
 * a tenant that grants a staff member `ledger.entry.write`, which is the
 * ordinary thing to do because staff work the counter, must not thereby hand
 * them the power to lend past the cap the owner set.
 *
 * The client uses it only to decide which button to draw. The server checks the
 * same thing again inside the transaction that writes, because a client that
 * was told "you may override" a minute ago is repeating what it was told.
 */
export const selectActiveRole = (state: RootState): string | null =>
  state.session.activeTenant?.role ?? null;

export const selectSessionTenants = (state: RootState): readonly SessionTenant[] =>
  state.session.tenants;
