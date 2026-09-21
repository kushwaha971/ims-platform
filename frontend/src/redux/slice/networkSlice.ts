import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { RootState } from 'src/redux/store';
import type { TWriteClass } from 'src/types/api.types';

/**
 * Part 19 §19.10.3 — the three-state network model, and the ONLY place the
 * application keeps a view of connectivity.
 *
 * Why three and not two: `navigator.onLine === false` is trustworthy, but
 * `true` means nothing. The shop's real failure mode — shutter half down, tower
 * visible, packet dying — is exactly the case where the browser reports online
 * and the request times out. `degraded` is that case, and it is the common one.
 *
 * The transport layer feeds this (`responseObserved` / `transportFailed`); the
 * probe effect lives in `useDegradedNetwork()`. No feature implements its own
 * online check, and a lint rule fails any other read of `navigator.onLine`.
 */
export type TNetworkState = 'online' | 'degraded' | 'offline';

/** §19.10.3 — the constants ARE the policy. */
export const NET_SLOW_MS = 4_000;
export const NET_FAILS_TO_DEGRADE = 1;
export const NET_PROBE_DEGRADED_MS = 10_000;
export const NET_PROBE_OFFLINE_MS = 15_000;
export const NET_PROBES_TO_OFFLINE = 3;
/**
 * The ceiling the probe backs off to. See `netProbeSpacingMs` below: a model
 * that costs requests on a failing link and saves none is worse than no model,
 * and a fixed 15 s probe on a dead connection was **20 requests every five
 * minutes, forever**.
 */
export const NET_PROBE_BACKOFF_MAX_MS = 120_000;
/** A queueable write stops waiting and goes to the outbox after this. */
export const WRITE_HANDOFF_MS = 8_000;

export interface NetworkState {
  state: TNetworkState;
  /** Consecutive failed probes; `NET_PROBES_TO_OFFLINE` of them means offline. */
  failedProbes: number;
  /** ISO timestamp of the last observed HTTP response. */
  lastOnlineAt: string | null;
  /** Outbox depth for this tenant, mirrored for the shell strip's count. */
  pendingWrites: number;
  /** True once the user has been told we are back, so it announces once. */
  recoveryAnnounced: boolean;
}

const initialState: NetworkState = {
  state: 'online',
  failedProbes: 0,
  lastOnlineAt: null,
  pendingWrites: 0,
  recoveryAnnounced: true,
};

const networkSlice = createSlice({
  name: 'network',
  initialState,
  reducers: {
    /** Signal 1 — any completed HTTP status, INCLUDING a 4xx or a 5xx. */
    responseObserved(state) {
      state.failedProbes = 0;
      state.lastOnlineAt = new Date().toISOString();
      if (state.state !== 'online') {
        state.state = 'online';
        state.recoveryAnnounced = false;
      }
    },
    /** Signal 2 — an ApiError with code network_error | timeout | offline. */
    transportFailed(state) {
      if (state.state === 'online') state.state = 'degraded';
    },
    /** Signal 3 — a request silent for NET_SLOW_MS without response headers. */
    requestSilent(state) {
      if (state.state === 'online') state.state = 'degraded';
    },
    /** Signal 4 — the browser `offline` event. Its `false` is trusted. */
    browserWentOffline(state) {
      state.state = 'offline';
    },
    /**
     * Signal 4 — the browser `online` event, treated only as a hint to probe.
     * Never a jump straight to `online`: `navigator.onLine === true` on a
     * captive-portal Wi-Fi is the lie this model exists to absorb.
     */
    browserCameOnline(state) {
      // The counter is reset as well as the state, because the backoff below is
      // keyed on it: a Wi-Fi that has just reconnected is NEW evidence, and
      // making the merchant wait out a two-minute backoff they earned during
      // the outage is the one case where backing off would cost them.
      state.failedProbes = 0;
      if (state.state === 'offline') state.state = 'degraded';
    },
    /** Signal 5 — one successful `GET /system/health`. */
    probeSucceeded(state) {
      state.failedProbes = 0;
      state.lastOnlineAt = new Date().toISOString();
      if (state.state === 'offline') {
        state.state = 'degraded';
      } else if (state.state === 'degraded') {
        state.state = 'online';
        state.recoveryAnnounced = false;
      }
    },
    probeFailed(state) {
      state.failedProbes += 1;
      if (state.state === 'degraded' && state.failedProbes >= NET_PROBES_TO_OFFLINE) {
        state.state = 'offline';
      }
    },
    pendingWritesChanged(state, action: PayloadAction<number>) {
      state.pendingWrites = Math.max(0, action.payload);
    },
    recoveryAnnounced(state) {
      state.recoveryAnnounced = true;
    },
  },
});

export const {
  responseObserved,
  transportFailed,
  requestSilent,
  browserWentOffline,
  browserCameOnline,
  probeSucceeded,
  probeFailed,
  pendingWritesChanged,
  recoveryAnnounced,
} = networkSlice.actions;

export default networkSlice.reducer;

// ── Selectors ────────────────────────────────────────────────────────────────

export const selectNetworkState = (state: RootState): TNetworkState => state.network.state;
export const selectNetworkImpaired = (state: RootState): boolean =>
  state.network.state !== 'online';
export const selectPendingWrites = (state: RootState): number => state.network.pendingWrites;
export const selectFailedProbes = (state: RootState): number => state.network.failedProbes;
export const selectLastOnlineAt = (state: RootState): string | null => state.network.lastOnlineAt;
export const selectRecoveryAnnounced = (state: RootState): boolean =>
  state.network.recoveryAnnounced;

/**
 * How long to wait before the next `GET /system/health`, given the state and
 * how many probes have failed in a row. Pure, so the policy is one readable
 * expression and the hook only holds a timer.
 *
 * ── Why it backs off ────────────────────────────────────────────────────────
 *
 * The probe is the only honest way to detect recovery, so it stays. But at a
 * fixed spacing it was the one part of the network model that CHANGED the
 * merchant's traffic, and it changed it the wrong way: five minutes of bad
 * signal cost roughly **30 extra requests on the connection that is already
 * failing**, each of them competing with the retries of the request the
 * merchant actually cares about.
 *
 * The shape below keeps the part of that which is evidence and drops the part
 * which is noise:
 *
 *  · The first `NET_PROBES_TO_OFFLINE` failures are at the base spacing, so
 *    §19.10.3's "roughly 35 s of honest evidence before the word offline
 *    appears on screen" is unchanged to the second.
 *  · Every failure beyond that doubles the wait, to a two-minute ceiling.
 *    Those are the probes of a link that has already proved itself dead, and
 *    the fifth identical answer is worth less than the first.
 *
 * Measured against the same five-minute spell: **7 probes instead of ~30**, and
 * recovery is still noticed within two minutes at the very worst — usually far
 * sooner, because ANY completed response (`responseObserved`) and the browser's
 * own `online` event both reset this to the base spacing without a probe.
 */
export const netProbeSpacingMs = (state: TNetworkState, failedProbes: number): number => {
  const base = state === 'offline' ? NET_PROBE_OFFLINE_MS : NET_PROBE_DEGRADED_MS;
  const beyondEvidence = Math.max(0, failedProbes - NET_PROBES_TO_OFFLINE);
  return Math.min(base * 2 ** beyondEvidence, NET_PROBE_BACKOFF_MAX_MS);
};

/**
 * §19.10.4's gate, as a pure function so the hook, the tests and the outbox all
 * ask the same question. Class A is enabled in all three states; B and C are
 * disabled — never hidden — in confirmed `offline`.
 */
export const canWriteIn = (state: TNetworkState, writeClass: TWriteClass): boolean =>
  state !== 'offline' || writeClass === 'queueable';
