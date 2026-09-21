import reducer, {
  browserCameOnline,
  browserWentOffline,
  canWriteIn,
  netProbeSpacingMs,
  NET_PROBE_BACKOFF_MAX_MS,
  NET_PROBE_DEGRADED_MS,
  NET_PROBE_OFFLINE_MS,
  NET_PROBES_TO_OFFLINE,
  probeFailed,
  probeSucceeded,
  responseObserved,
  transportFailed,
} from './networkSlice';

/**
 * §19.10.3's three states, and the probe policy that is the one part of the
 * model which changes how much the merchant's connection is asked to carry.
 *
 * The review's finding was that the model reported impairment and never reduced
 * work — it ADDED it, at roughly 30 extra requests over a five-minute bad-signal
 * spell on the connection that was already failing. These tests pin the two
 * halves of the answer: the evidence window is unchanged, and everything after
 * it backs off.
 */
describe('netProbeSpacingMs', () => {
  it('keeps the first three failures at the base spacing, so the 35 s evidence window is unchanged', () => {
    for (let failures = 0; failures <= NET_PROBES_TO_OFFLINE; failures += 1) {
      expect(netProbeSpacingMs('degraded', failures)).toBe(NET_PROBE_DEGRADED_MS);
    }
    // Three probes at 10 s is the "roughly 35 s" §19.10.3 promises before the
    // word "offline" is allowed on screen.
    expect(NET_PROBE_DEGRADED_MS * NET_PROBES_TO_OFFLINE).toBe(30_000);
  });

  it('doubles the wait for every failure beyond the evidence window, to a ceiling', () => {
    expect(netProbeSpacingMs('offline', NET_PROBES_TO_OFFLINE)).toBe(NET_PROBE_OFFLINE_MS);
    expect(netProbeSpacingMs('offline', NET_PROBES_TO_OFFLINE + 1)).toBe(NET_PROBE_OFFLINE_MS * 2);
    expect(netProbeSpacingMs('offline', NET_PROBES_TO_OFFLINE + 2)).toBe(NET_PROBE_OFFLINE_MS * 4);
    expect(netProbeSpacingMs('offline', NET_PROBES_TO_OFFLINE + 99)).toBe(
      NET_PROBE_BACKOFF_MAX_MS
    );
  });

  it('costs about a quarter of the requests over five minutes of a dead link', () => {
    const count = (limitMs: number): number => {
      let elapsed = 0;
      let failures = 0;
      let state: 'degraded' | 'offline' = 'degraded';
      while (elapsed < limitMs) {
        elapsed += netProbeSpacingMs(state, failures);
        if (elapsed > limitMs) break;
        failures += 1;
        if (failures >= NET_PROBES_TO_OFFLINE) state = 'offline';
      }
      return failures;
    };

    const backedOff = count(5 * 60_000);
    // What the fixed 10 s / 15 s spacing used to cost over the same spell.
    const fixed = 3 + Math.floor((5 * 60_000 - 30_000) / NET_PROBE_OFFLINE_MS);

    expect(fixed).toBeGreaterThanOrEqual(20);
    expect(backedOff).toBeLessThanOrEqual(8);
  });
});

describe('the three-state model', () => {
  const at = (
    state: 'online' | 'degraded' | 'offline',
    failedProbes = 0
  ): ReturnType<typeof reducer> => ({
    state,
    failedProbes,
    lastOnlineAt: null,
    pendingWrites: 0,
    recoveryAnnounced: true,
  });

  it('degrades on a transport failure and recovers on any completed response', () => {
    expect(reducer(at('online'), transportFailed()).state).toBe('degraded');
    expect(reducer(at('degraded'), responseObserved()).state).toBe('online');
  });

  it('needs three failed probes to say offline', () => {
    let next = at('degraded');
    next = reducer(next, probeFailed());
    next = reducer(next, probeFailed());
    expect(next.state).toBe('degraded');
    next = reducer(next, probeFailed());
    expect(next.state).toBe('offline');
  });

  it('a browser online event resets the backoff as well as the state', () => {
    const stale = reducer(at('offline', 9), browserCameOnline());
    expect(stale.state).toBe('degraded');
    // Without this, a reconnected Wi-Fi would wait out a two-minute backoff it
    // earned during the outage before anything checked.
    expect(stale.failedProbes).toBe(0);
    expect(netProbeSpacingMs(stale.state, stale.failedProbes)).toBe(NET_PROBE_DEGRADED_MS);
  });

  it('a successful probe steps offline → degraded → online, never straight across', () => {
    const recovering = reducer(at('offline', 5), probeSucceeded());
    expect(recovering.state).toBe('degraded');
    expect(recovering.failedProbes).toBe(0);
    expect(reducer(recovering, probeSucceeded()).state).toBe('online');
  });

  it('only a confirmed offline blocks a non-queueable write', () => {
    expect(canWriteIn('degraded', 'online-only')).toBe(true);
    expect(canWriteIn('offline', 'online-only')).toBe(false);
    expect(canWriteIn('offline', 'queueable')).toBe(true);
    expect(reducer(at('degraded'), browserWentOffline()).state).toBe('offline');
  });
});
