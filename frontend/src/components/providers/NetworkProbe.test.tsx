import { act, render } from '@testing-library/react';

import { NetworkStrip } from 'src/components/layout/NetworkStrip';
import { AppProviders } from 'src/components/providers/AppProviders';
import {
  NET_PROBE_DEGRADED_MS,
  responseObserved,
  transportFailed,
} from 'src/redux/slice/networkSlice';
import { store } from 'src/redux/store';
import { renderWithProviders } from 'src/tests/renderWithProviders';

/**
 * Part 19 §19.10.3 — **the probe must run on the routes that feed the state,
 * not only on the routes that paint it.**
 *
 * The defect these tests hold down: the probe was mounted by `NetworkStrip`,
 * which is rendered by `UbAppShell`, which is rendered inside `RequireSession`
 * in `app/(app)/layout.tsx`. So it ran on the signed-in routes and on no others
 * — while `/login` feeds the very same state on every single visit, because
 * `SessionBootstrap` is mounted by the ROOT layout and fires `GET /auth/me` at
 * the default `interactive` network class.
 *
 * The consequence was a one-way door. `networkSlice` has exactly three ways out
 * of `degraded`: `probeSucceeded`, `responseObserved` and the browser's
 * `online` event (which only demotes `offline` to `degraded`). With no probe,
 * the only one available on the sign-in screen is `responseObserved` — and that
 * needs a completed HTTP response, which needs the merchant to press a button.
 * A flaky moment during the page's own bootstrap fetch left the application
 * believing the link was bad for as long as the merchant took to type their
 * password, however healthy the link had become in the meantime.
 */

const flushProbeTimer = async (): Promise<void> => {
  // The spacing carries ±20 % jitter; advancing past the ceiling covers it.
  await act(async () => {
    jest.advanceTimersByTime(NET_PROBE_DEGRADED_MS * 2);
  });
};

describe('the connectivity probe', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;
    // Every test starts from a link the application believes is healthy. The
    // store is a singleton and testing-library's cleanup runs after this
    // block's hooks, so both edges are wrapped: a bare dispatch here updates a
    // component that is still mounted.
    act(() => {
      store.dispatch(responseObserved());
    });
  });

  afterEach(() => {
    act(() => {
      store.dispatch(responseObserved());
    });
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const healthCalls = (): number =>
    fetchMock.mock.calls.filter(([url]) => String(url).includes('/system/health')).length;

  it('runs on a route outside the app shell once the link looks bad', async () => {
    // `AppProviders` is what `app/layout.tsx` wraps EVERY route in — the public
    // group, the auth group and `(app)` alike. Nothing here is inside
    // `RequireSession` or `UbAppShell`; this is the `/login` arrangement.
    render(<AppProviders>the sign-in screen</AppProviders>);

    // What a failed `GET /auth/me` on a flaky link does, via the transport.
    act(() => {
      store.dispatch(transportFailed());
    });
    expect(store.getState().network.state).toBe('degraded');

    await flushProbeTimer();

    expect(healthCalls()).toBeGreaterThan(0);
    // And having answered, the state is back to the truth without the merchant
    // having had to press anything.
    expect(store.getState().network.state).toBe('online');
  });

  it('issues nothing at all while the link is healthy', async () => {
    render(<AppProviders>the sign-in screen</AppProviders>);

    await flushProbeTimer();

    // This is what makes mounting it above the guard cheap: `online` is the
    // initial state, and the probe effect returns before arming any timer. The
    // public routes pay one `useEffect` and no network traffic.
    expect(healthCalls()).toBe(0);
  });

  it('is not also mounted by the strip, so an app route probes once and not twice', async () => {
    renderWithProviders(<NetworkStrip />);

    act(() => {
      store.dispatch(transportFailed());
    });

    await flushProbeTimer();

    // The strip paints the state; it does not measure it.
    expect(healthCalls()).toBe(0);
  });
});
