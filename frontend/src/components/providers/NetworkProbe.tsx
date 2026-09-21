'use client';

import { useDegradedNetwork } from 'src/hooks/useDegradedNetwork';

/**
 * Part 19 §19.10.3 — the probe effect, and nothing else. It renders `null`.
 *
 * ── Why it is not in `NetworkStrip` any more ────────────────────────────────
 *
 * The probe used to be mounted by `NetworkStrip`, which lives in `UbAppShell`,
 * which lives inside `RequireSession` in `app/(app)/layout.tsx`. So the one
 * mechanism that can move the network state OUT of `degraded` without the
 * merchant generating traffic ran only on the signed-in routes — and never on
 * `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/set-password`,
 * `/legal/*` or `/d/[token]`.
 *
 * That is backwards, because those routes feed the state just as much as the
 * app does. `SessionBootstrap` is mounted by the ROOT layout, so a cold load of
 * `/login` fires `GET /auth/me` on every visit; `authService.getSession` sends
 * it at the default `net: 'interactive'` class, so a transport-level failure
 * there dispatches `transportFailed` and the state becomes `degraded`. On the
 * `(app)` routes a probe would then re-test the link every 10 s and return the
 * state to `online` on the first success. On `/login` nothing did, and
 * `networkSlice` has exactly one other way out — `responseObserved`, which
 * needs a completed response, which needs the merchant to press a button.
 *
 * So the state could sit at `degraded` on the sign-in screen for as long as the
 * merchant took to type their password, long after the link had recovered.
 *
 * ── Why mounting it here is nearly free ─────────────────────────────────────
 *
 * The probe effect returns immediately while `state === 'online'`, and `online`
 * is the initial state. Nothing is requested on a healthy connection, so the
 * public and auth routes pay one `useEffect` that returns `undefined` and no
 * network traffic at all. `GET /system/health` is only ever issued after a real
 * transport failure has already been observed.
 *
 * ── This is the same move `SnackbarHost` already made ───────────────────────
 *
 * `AppProviders` carries the reasoning: §19.12.2's "no failure is ever silent"
 * was untrue outside `(app)` for exactly as long as the snackbar hung off the
 * `(app)` shell. §19.10.3's connectivity model had the same shape of bug for
 * the same reason, and it gets the same answer — the thing that must be true
 * everywhere is mounted above the guard, and the thing that is only *painted*
 * inside the shell stays in the shell.
 *
 * `NetworkStrip` keeps the painting and now passes `withProbe: false`, so the
 * probe is mounted exactly once on an app route rather than twice.
 */
export function NetworkProbe(): null {
  useDegradedNetwork({ withProbe: true });
  return null;
}
