# 05 · Interaction feedback and performance

Status: **findings are hypotheses until Phase 1 measures them**, 17 Oct 2026.
Nothing in this file claims an improvement. Every "fix" names the number that must move.

## 1. The reported problem

> In the installed app, a tap sometimes takes a while to navigate or respond. Nothing shows that the tap worked, so people tap again, which can repeat an action.

Two separate things are tangled here and need separate fixes:
1. **Silence**: the time between the tap and the first visible change.
2. **Slowness**: the time between the tap and the finished screen or saved record.

Silence is the one people complain about. It can be fixed almost entirely without speeding anything up. Slowness still has to be measured and fixed, or the skeletons just become a nicer way to wait.

## 2. Likely causes, ranked, each with how to prove it

| ID | Hypothesis | Why it's likely | How Phase 1 proves or kills it |
|---|---|---|---|
| H1 | **Navigations wait for the server with nothing on screen.** The App Router fetches the next page's server payload before it shows anything, unless a `loading.tsx` boundary exists. There are none, and the root layout reads `cookies()`, so every route is dynamic and every navigation waits a round trip. | 0 `loading.tsx` (01 §1); `app/layout.tsx:100` | Record tap → first paint on 10 common navigations, throttled; then add `loading.tsx` to one segment in a spike branch and record again |
| H2 | **Handler navigations don't prefetch.** 110 `router.push` calls; links in menus, rows and the switcher never prefetch, so their round trip starts on tap. | 01 §1 | Same trace: count requests started before vs after tap |
| H3 | **Data waits for `/auth/me`.** Shop tabs other than parties fetch only after the session call returns (M7). | review/03; `AppRouteWarmup` covers 2 routes | Network waterfall on cold open of `/dashboard`, `/sales/invoices`, `/items` |
| H4 | **Main thread is busy on a cheap phone.** ~317 KB median first load, hydrating a large shell (18 static slices, intl catalogue, axios) on a 4× slowed CPU. | 01 §7 | Long tasks > 50 ms during first load and during navigation, 4× CPU |
| H5 | **Session replay costs input delay.** PostHog recording runs after idle on phones. | DEC-017; unmeasured | INP with analytics on vs off, same script |
| H6 | **Buttons don't show a pressed state on touch.** Some controls rely on hover styles; touch gets no change until the work finishes. | to verify per component | Visual check of every `UbButton` variant, list row and tab at 390 px |
| H7 | **Service worker off or cold** in production, so every start downloads the shell. | `NEXT_PUBLIC_SW_ENABLED=false` in `.env.example` | Check the production env and `navigator.serviceWorker.controller` on a real install |
| H8 | **Large lists render all rows** on Library members, Lending loans, reports. | to verify | React profiler with 2k rows |

## 3. Feedback rules (apply to every screen)

| Moment | What the person sees | Built with |
|---|---|---|
| Finger down | pressed look within one frame: darker fill, 0.98 scale, no layout change | CSS `:active` on `UbButton`, list rows, tabs, chips (existing tokens `--dur-instant`) |
| Tap that navigates | the tapped row or tab shows a small spinner after 120 ms; a 2 px teal progress line at the top of the page; the new screen's skeleton as soon as the route starts | `loading.tsx` per route group (H1), a `useNavigate` wrapper with `useTransition` (pending state for `router.push`), prefetch on rows likely to be tapped |
| Tap that saves | the button turns into its busy state at once ("Saving…"), the form locks, a second tap does nothing | `UbButton busy`, plus a new in-flight guard in `UbForm` and a shared `useAsyncAction` (06) |
| Saved | the sheet closes, a short message names what was saved, with the one useful next action | global snackbar (existing) |
| Failed | the form stays open with everything typed; a plain message says nothing was saved; "Try again" reuses the same request key | existing idempotency keys |
| Slow (> 3 s) | "Still working… you can wait or come back, it won't be saved twice" | same busy state, timed message |
| Offline | the network strip (existing `NetworkStrip`) and a disabled Save with "No internet. Your entry is kept." where drafts exist | existing offline queue where it applies |

**Optimistic updates** only for things that are cheap to undo and carry no money: marking a notification read, toggling a filter, pinning. Never for payments, bills, loans, repayments, fees or ledger entries: those wait for the server and show the busy state.

## 4. Duplicate-action protection

| Layer | Today | Proposed |
|---|---|---|
| Button | `busy` when the caller remembers | `useAsyncAction` sets busy automatically for any async `onClick`; double taps within the pending window are ignored |
| Form | no guard in `UbForm` | `UbForm` ignores submits while one is in flight |
| Request | `Idempotency-Key` on allowlisted POSTs | audit the allowlist against every money write (needs backend report 02 §3); add missing paths on the client; any server gap goes to 08 as a proposal |
| Server | per-endpoint | unchanged unless 08 proves a gap |

## 5. Performance targets

Reference profile: a 2–3 GB Android phone class (Moto G-class), Chrome, 4× CPU slowdown and "Fast 3G" (1.6 Mbps, 150 ms RTT) for lab runs; D-06 in shop-ims-readiness picks the physical device.

| Metric | Where | Target | Today |
|---|---|---|---|
| Tap → first visible change | 10 key navigations, lab | ≤ 100 ms p95 | unmeasured |
| INP | app routes, lab and field | ≤ 200 ms p75 | unmeasured |
| LCP, warm start (installed, SW on) | Home of each app | ≤ 1.5 s | unmeasured |
| LCP, cold start | Home of each app | ≤ 2.5 s | unmeasured |
| CLS | all app routes | ≤ 0.05 | measured only on landing |
| Long tasks during navigation | 4× CPU | none > 200 ms | unmeasured |
| First-load JS | median app route | stop the ratchet now; then −15% | ~317 KB |
| API p95 | list and home endpoints | ≤ 500 ms at scale seed | measured, passing (scale run) |
| Duplicate writes | double-tap script on every money form | 0 | partially protected |

## 6. Benchmark method (before and after)

1. **Lab**: a new `e2e/perf-app.mjs` modelled on `e2e/landing.mjs --perf`, run against the standalone build with the scale seed, at 390 and 1280, throttled. Records LCP, CLS, INP (scripted taps), tap-to-first-change, long tasks, JS bytes per route, request waterfall. Output: a dated file in `docs/performance/`.
2. **Field**: `useReportWebVitals` (built into Next, no new package) sending LCP, INP, CLS to the existing PostHog, sampled at 10%, only where analytics consent rules allow (`analyticsRules.ts`).
3. **Device**: one real low-end Android, installed PWA, the 9-task script timed by hand once per phase.
4. Every change in Phase 7 lands with its before/after numbers in the PR and in `docs/performance/`.

## 7. Fix list, in the order to try (Phase 7, after measuring)

| # | Fix | Expected effect | Risk |
|---|---|---|---|
| F1 | `loading.tsx` per route group with the screen's own skeleton | removes the silent wait on every navigation (H1) | low; presentation only |
| F2 | `useNavigate` with `useTransition` + pressed/pending states | tapped control answers at once (H2, H6) | low |
| F3 | prefetch on visible list rows and tabs (`router.prefetch` on pointer down / visible) | shortens the wait itself | medium: more requests on weak networks; cap it |
| F4 | start each app's home fetch in parallel with `/auth/me` (extend the warm-up) | removes M7 waterfall (H3) | medium; copy the claim-once pattern |
| F5 | turn on the service worker in production and precache the shell for installed users | instant warm starts (H7) | medium; test updates and sign-out clearing |
| F6 | defer session replay on phones, or sample it | lower INP (H5) | low; DEC-017 owner call |
| F7 | trim shell: lazy intl catalogues per route (BACKLOG), drop unused deps after proof | smaller first load (H4) | medium |
| F8 | virtualise or page long lists | smooth scrolling (H8) | medium; Library/Lending lists keep their API |

## 8. Installed-PWA checklist (G3)

- Opens to the person's last app, not always the Shop.
- Header clears the status bar; bottom bar clears the gesture bar.
- No browser chrome flash; splash uses the brand colour; icons are maskable.
- Android back closes sheets first, never leaves the app from a nested screen.
- Works for reading with no signal (cached homes and lists); writes say clearly they need a connection.
- A new version shows "Update ready · Reload" instead of changing under the person.
- Text inputs are 16 px so iOS doesn't zoom.
