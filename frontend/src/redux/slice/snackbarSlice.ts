import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { RootState } from 'src/redux/store';

/**
 * Part 19 §19.12.2 — THE single toast channel. Nothing else in the application
 * shows a transient message, which is what makes "no failure is ever silent"
 * checkable rather than aspirational.
 *
 * ── CR-2026-09-19-E — brought to BrandHub's shape ───────────────────────────
 * BrandHub's `apps/frontend/src/redux/slice/snackbarSlice.ts` is the reference
 * and four things here now match it rather than differing for no reason:
 *
 *  1. **It REPLACES, it does not queue.** BrandHub's state is one message —
 *     `snackbarOpen` / `snackbarMessage` / `snackbarSeverity` — and `showSnackbar`
 *     overwrites it. Ours pushed onto `queue[]`, so a burst of failures lined up
 *     behind each other and the newest — the one the merchant just caused — was
 *     shown last. Replacing is also what makes "one channel" literally true.
 *  2. **The action names are BrandHub's**: `showSnackbar` / `hideSnackbar`.
 *     Ours said `snackbarDismissed` / `snackbarCleared`.
 *  3. **`id` + `params`.** BrandHub carries an optional i18n key and its
 *     placeholders beside the raw string, and the HOST resolves it — because
 *     the dispatcher is often below the React tree (an axios interceptor, the
 *     store's transport host) and has no `t()`. Ours had one `message` field
 *     that callers were passing translation KEYS into, so
 *     `tenant.switcher.staleTab` reached the user as the literal string
 *     "tenant.switcher.staleTab". That is fixed by adopting their shape.
 *  4. **The severity vocabulary** is theirs verbatim:
 *     `'success' | 'error' | 'warning' | 'info'`.
 *
 * Two deliberate differences from BrandHub, both additive:
 *  - `requestId`, because R-E-4 requires the trace id on a failure and BrandHub
 *    has no equivalent to lose.
 *  - BrandHub's `isLoading` flag is NOT carried. It drives their MUI
 *    `BHBackdropLoader`; this product has no global backdrop (skeletons and the
 *    three-state network model of §19.10.3 do that job), and a state field
 *    nothing reads is a state field that silently rots.
 *
 * Thunks never dispatch this (R-RX-7): deciding whether a user should see a
 * toast is a presentation decision. API FAILURES are the documented exception
 * and they are dispatched centrally, from the transport host in
 * `src/redux/store.ts` — never from a feature component (§19.4.3).
 */
export type SnackbarSeverity = 'success' | 'error' | 'warning' | 'info';

export interface SnackbarState {
  /** Whether the snackbar is currently visible. */
  snackbarOpen: boolean;
  /** Already-resolved copy. Empty when `id` carries the message instead. */
  snackbarMessage: string;
  snackbarSeverity: SnackbarSeverity;
  /** i18n key the HOST resolves, for dispatchers with no `t()` in scope. */
  id?: string;
  /** Placeholders for `id`. */
  params?: Record<string, string | number>;
  /** Rendered as `ds-mono` caption so a screenshot carries the trace (R-E-4). */
  requestId: string | null;
}

const initialState: SnackbarState = {
  snackbarOpen: false,
  snackbarMessage: '',
  snackbarSeverity: 'info',
  id: undefined,
  params: {},
  requestId: null,
};

export interface ShowSnackbarPayload {
  readonly severity: SnackbarSeverity;
  /** A resolved string. Omit it when `id` is given. */
  readonly message?: string;
  readonly id?: string;
  readonly params?: Record<string, string | number>;
  readonly requestId?: string | null;
}

const snackbarSlice = createSlice({
  name: 'snackbar',
  initialState,
  reducers: {
    showSnackbar(state, action: PayloadAction<ShowSnackbarPayload>) {
      state.snackbarOpen = true;
      state.snackbarMessage = action.payload.message ?? '';
      state.snackbarSeverity = action.payload.severity;
      state.id = action.payload.id ?? undefined;
      state.params = action.payload.params ?? {};
      state.requestId = action.payload.requestId ?? null;
    },

    hideSnackbar(state) {
      state.snackbarOpen = false;
      state.snackbarMessage = '';
      state.id = undefined;
      state.params = {};
      state.requestId = null;
    },
  },
});

export const { showSnackbar, hideSnackbar } = snackbarSlice.actions;

export default snackbarSlice.reducer;

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectSnackbar = (state: RootState): SnackbarState => state.snackbar;
