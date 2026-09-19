import { createSlice, nanoid, type PayloadAction } from '@reduxjs/toolkit';

import type { RootState } from 'src/redux/store';

/**
 * Part 19 §19.12.2 — THE single toast channel. Nothing else in the application
 * shows a transient message, which is what makes "no failure is ever silent"
 * checkable rather than aspirational.
 *
 * Thunks never dispatch this (R-RX-7): deciding whether a user should see a
 * toast is a presentation decision and belongs to the component. The one
 * exception is the transport-level error toast of §19.4.3.
 */
export type SnackbarSeverity = 'success' | 'info' | 'warning' | 'error';

export interface SnackbarMessage {
  readonly id: string;
  readonly severity: SnackbarSeverity;
  /** Already-resolved copy, or an i18n key the host resolves. */
  readonly message: string;
  /** Rendered as `ds-mono` caption with a copy button (R-E-4). */
  readonly requestId: string | null;
  /** Optional one action: "the move it enables", never a second sentence. */
  readonly actionLabel?: string;
}

export interface SnackbarState {
  queue: SnackbarMessage[];
}

const initialState: SnackbarState = { queue: [] };

const snackbarSlice = createSlice({
  name: 'snackbar',
  initialState,
  reducers: {
    showSnackbar: {
      reducer(state, action: PayloadAction<SnackbarMessage>) {
        state.queue.push(action.payload);
      },
      prepare(input: {
        severity: SnackbarSeverity;
        message: string;
        requestId?: string | null;
        actionLabel?: string;
      }) {
        return {
          payload: {
            id: nanoid(),
            severity: input.severity,
            message: input.message,
            requestId: input.requestId ?? null,
            ...(input.actionLabel ? { actionLabel: input.actionLabel } : {}),
          } satisfies SnackbarMessage,
        };
      },
    },
    snackbarDismissed(state, action: PayloadAction<string>) {
      state.queue = state.queue.filter((message) => message.id !== action.payload);
    },
    snackbarCleared: () => initialState,
  },
});

export const { showSnackbar, snackbarDismissed, snackbarCleared } = snackbarSlice.actions;

export default snackbarSlice.reducer;

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectSnackbarQueue = (state: RootState): readonly SnackbarMessage[] =>
  state.snackbar.queue;
