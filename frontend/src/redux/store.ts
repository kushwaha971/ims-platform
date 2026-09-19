import { configureStore } from '@reduxjs/toolkit';

// ── parties ──────────────────────────────────────────────────────────────────
import { registerTransportHost } from 'src/api/transportBridge';

import partyListReducer from 'modules/UdhaarBook/features/parties/redux/partyListSlice';

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
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

/** The reducer map, exported for the invalidation map's runtime assertions. */
export type StoreReducerKey = keyof RootState;
