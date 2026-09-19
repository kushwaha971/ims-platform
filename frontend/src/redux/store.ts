import { configureStore } from '@reduxjs/toolkit';

import { registerTransportHost } from 'src/api/transportBridge';

// ── auth (PLT-01, PLT-02) ────────────────────────────────────────────────────
import authReducer from 'modules/DigiKhaato/features/auth/redux/authSlice';
// ── onboarding (PLT-03) ──────────────────────────────────────────────────────
import onboardingReducer from 'modules/DigiKhaato/features/onboarding/redux/onboardingSlice';
// ── parties ──────────────────────────────────────────────────────────────────
import partyListReducer from 'modules/DigiKhaato/features/parties/redux/partyListSlice';
// ── plan entitlements (PLT-15) ───────────────────────────────────────────────
import planReducer, { limitHit } from 'modules/DigiKhaato/features/plan/redux/planSlice';
import { toPlanLimitHit } from 'modules/DigiKhaato/features/plan/view-model/planDisplay';

import { invalidationListener } from './invalidation/listener';
// ── Cross-cutting ────────────────────────────────────────────────────────────
import localeReducer from './slice/localeSlice';
import networkReducer, { responseObserved, transportFailed } from './slice/networkSlice';
import offlineQueueReducer from './slice/offlineQueueSlice';
import sessionReducer, { sessionExpired } from './slice/sessionSlice';
import snackbarReducer, { showSnackbar } from './slice/snackbarSlice';
import themeReducer from './slice/themeSlice';
import whiteLabelReducer from './slice/whiteLabelSlice';

/**
 * Part 19 §19.3.9 — a flat `configureStore` with one key per slice, grouped and
 * commented by module, exactly BrandHub's arrangement. No `combineReducers`
 * nesting, no dynamic reducer injection, no persistence middleware, and no
 * hand-written middleware: the one listener is RTK's own, carrying the
 * invalidation map of §19.3.6.
 *
 * Two deliberate absences: `redux-persist` (the store is rebuilt from the API
 * on load) and TanStack Query (ADR-004 — one data-layer pattern only).
 *
 * Sprint 1 adds four keys and no mechanism: `auth`, `onboarding`, `plan`, and
 * PLT-04's state, which lives in the existing `session` key because a
 * membership list IS the session summary and a second copy of it would be a
 * second thing to keep true.
 */
export const store = configureStore({
  reducer: {
    snackbar: snackbarReducer,
    session: sessionReducer,
    whiteLabel: whiteLabelReducer,
    locale: localeReducer,
    theme: themeReducer,
    network: networkReducer,
    offlineQueue: offlineQueueReducer,

    auth: authReducer,
    onboarding: onboardingReducer,
    plan: planReducer,

    partyList: partyListReducer,
  },
  middleware: (getDefault) =>
    getDefault({
      // Money is strings, dates are ISO strings, errors are plain objects.
      // Nothing non-serialisable may enter the store; keep this check ON.
      serializableCheck: true,
      immutableCheck: process.env.NODE_ENV !== 'production',
    }).prepend(invalidationListener.middleware),
  devTools: process.env.NODE_ENV !== 'production',
});

/**
 * §19.4 — the transport's dependencies, supplied here rather than imported
 * there, so the dependency graph stays acyclic (see src/api/transportBridge.ts).
 */
registerTransportHost({
  getLocale: () => store.getState().locale.current,
  onResponseObserved: () => {
    store.dispatch(responseObserved());
  },
  onTransportFailure: () => {
    store.dispatch(transportFailed());
  },
  isNetworkImpaired: () => store.getState().network.state !== 'online',
  onSessionExpired: () => {
    store.dispatch(sessionExpired());
  },
  onErrorToast: (error) => {
    store.dispatch(
      showSnackbar({ severity: 'error', message: error.message, requestId: error.requestId })
    );
  },
  // PLT-15 FR-6 — one dialog answers for every module's plan limit.
  onPlanLimit: (error) => {
    store.dispatch(limitHit(toPlanLimitHit(error)));
    return true;
  },
  // PLT-04 FR-4 — the stale-tab guard's two dependencies.
  getActiveTenantId: () => store.getState().session.activeTenant?.id ?? null,
  onTenantMismatch: () => {
    // The message goes up before the reload, so the user sees WHY the page
    // jumped rather than watching it reload for no stated reason. The reload is
    // deferred a tick so the snackbar paints first.
    store.dispatch(
      showSnackbar({ severity: 'warning', message: 'tenant.switcher.staleTab', requestId: null })
    );
    if (typeof window !== 'undefined') {
      window.setTimeout(() => window.location.reload(), 600);
    }
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

/** The reducer map, exported for the invalidation map's runtime assertions. */
export type StoreReducerKey = keyof RootState;
