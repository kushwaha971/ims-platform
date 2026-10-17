# App baseline — 17 Oct 2026 (revamp Phase 1: measure, don't fix)

Status: **measured in a lab, nothing changed.** This is the "before" for every
fix in `docs/revamp/05-feedback-and-performance.md` §7. It turns H1–H8 into
numbers where a lab can, and says plainly where it cannot.

**A cloud container is not a phone.** Every client number here comes from
headless Chromium 141 on a 4-vCPU Xeon (2.1 GHz) container, with CDP's 4× CPU
slowdown and network shaping standing in for a Moto-G-class phone on a weak 4G.
CPU throttling multiplies a fast desktop core; it does not reproduce a phone's
thermal limits, GPU, memory pressure or radio wake-up. Treat the throttled
column as a *floor* for a real low-end Android, not as its value. The device
run in 05 §6 step 3 is still owed.

## Method

| | |
|---|---|
| Code | `dev` at `4492d5f`, unmodified. |
| Frontend | `next build` (Next 16.3.8, Turbopack, `output: standalone`) served by `e2e/serve.sh`. Built with `NEXT_PUBLIC_API_BASE_URL=/api/v1` and `API_PROXY_TARGET=http://127.0.0.1:8000` (the same-origin rewrite the Railway image uses), `NEXT_PUBLIC_SW_ENABLED=false`, `NEXT_PUBLIC_ANALYTICS_ENABLED=false`. |
| API | `e2e/serve-api.sh`: `runserver --noreload`, `config.settings.local` (DEBUG on, console OTP provider, default throttles). A WSGI server in production will differ; DEBUG adds overhead to the client-side API times, not to the in-process server timings below. |
| Data | `manage.py seed_scale --entries 100000 --parties 2000 --items 5000 --invoices 20000` (48 s), the 28 Sep scale book. Library and Lending were switched on for the same business through `POST /tenants/current/apps`, then seeded through the public API: 3 shifts, 60 seats, **1,760 library members** (one per active customer; a third paid a ₹900 fee), **1,576 lending loans** (fixed daily, all weekdays, disbursed 1–60 days ago; half with one collection). 432 of the 2,000 loan requests failed — see Caveats. |
| Harness | **`e2e/perf-app.mjs`** (new; modelled on `landing.mjs --perf`). Raw JSON of these runs was written to `/tmp/claude-0/perf-app-2026-10-17.json` (cold, press, lists) and `/tmp/claude-0/perf-app-nav3.json` (navigations); the container is ephemeral, so the numbers that matter are copied below. |
| Viewports | 390×844 (mobile emulation, touch, DPR 2) and 1280×800. |
| Profiles | **unthrottled**, and **throttled** = 4× CPU + 1.6 Mbps down / 750 kbps up / 150 ms RTT (CDP `Emulation.setCPUThrottlingRate`, `Network.emulateNetworkConditions`), the profile in 05 §5. |
| Navigations | 10 per viewport, 3 repetitions each (57 per profile). Each one loads its start page, waits for 1.5 s of network quiet (so `next/link` prefetch has run), then taps. Timed **inside the page** from the `pointerdown` event: first DOM mutation in `<body>` (scripts/styles and the screenshot caret excluded) = *first change*; `location.pathname` becoming the target = *commit*; last mutation in `<main>` before 800 ms of quiet with no loading indicator = *content*. Loading UI = any new `[aria-busy=true]`, indeterminate `[role=progressbar]` or `.animate-pulse`. Requests are attributed to the navigation they belong to. INP sample = the Event Timing duration of the tap. |
| Cold opens | A fresh browser context (empty HTTP cache, valid session cookies) per route; LCP, CLS, long tasks until 2 s of network quiet; CDP request waterfall. |

Run it again with:

```bash
./e2e/serve-api.sh && ./e2e/serve.sh       # a seeded book signed in as E2E_EMAIL / E2E_PASSWORD
NODE_PATH=$(npm root -g) node e2e/perf-app.mjs --reps=3 [--only=nav,cold,press,lists] [--shots]
```

## 1–2. Tap → first change → content, and what was fetched

Median of 3 (worst in brackets), milliseconds from the tap. *Prefetched* = RSC
requests for the target that had already been made before the tap. After every
one of the 57 navigations per profile, **one non-prefetch RSC request for the
target left on the tap**, and the screen did not change until it came back.

| Navigation | How it navigates | Prefetched | 390 unthrottled: first change / content | 390 throttled: first change / content | 1280 throttled: first change / content | API calls after |
|---|---|---:|---|---|---|---:|
| Shop Home → Customers | bottom tab / sidebar `Link` | 2 | 59 / 149 | 387 (693) / 701 (1,030) | 498 (720) / 1,057 (1,484) | 3 |
| Customers → Bills | tab / sidebar | 2 | 48 / 140 | 291 (665) / 611 (1,096) | 508 (679) / 834 (1,071) | 1 |
| Bills → More (phone) | tab | 2 | 46 / 46 | 328 (488) / 328 (488) | — | 0 |
| More → Items (phone) · Bills → Items (desktop) | `Link` row / sidebar | 2 | 48 / 247 | 352 (704) / 664 (1,212) | 402 (654) / 739 (900) | 3 |
| Customer row → person page | `router.push` | **0** | 54 / 511 | 353 (669) / 1,273 (1,570) | 387 (674) / 1,229 (1,489) | 5 |
| App switcher → Udhaar `/khata` | `router.push` | **0** | 5 (menu closes) / 158 · commit 53 | 34 (menu closes) / 756 · **commit 409** | 14 / 912 · **commit 407** | 5 |
| Udhaar People → Aging | tab / sidebar | 2 | 52 / 316 | 361 (654) / 743 (977) | 366 (604) / 734 (1,117) | 2 |
| Library Home → Students | tab / sidebar | 2–3 | 34 / 371 | 314 (547) / 874 (1,142) | 319 (525) / 925 (1,173) | 4 |
| Library Students → Seats | tab / sidebar | 2 | 34 / 114 | 257 (510) / 620 (856) | 244 (515) / 546 (858) | 1 |
| Lending Today → Loans | tab / sidebar | 2 | 167 / 359 | **819 (1,296)** / 1,200 (1,626) | **763 (1,313)** / 1,108 (1,717) | 1 |

| All 57 navigations | Unthrottled | Throttled | Target (05 §5) |
|---|---:|---:|---:|
| Tap → first visible change, p50 / p95 | 47 / 167 ms | **363 / 819 ms** | ≤ 100 ms p95 |
| Tap → content, p50 / p95 | 259 / 521 ms | 864 / 1,570 ms | — |
| Navigation RSC round trip (tab routes), median | 56–78 ms | 231–307 ms | — |
| Loading UI shown *before* the new page committed | 0 of 57 | 0 of 57 | every navigation |
| Long task > 200 ms between tap and content | 0 of 57 | **7 of 57** (max 621 ms) | none |
| INP sample (tap), p75 / max | 32 / 64 ms | 56 / 176 ms | ≤ 200 ms p75 |

What the timings say:

- **The first visible change *is* the new page.** In every navigation except the
  switcher (whose menu closes at once) the first mutation lands within a frame
  of the URL changing. Nothing between the tap and the commit changes on
  screen: a 390 px screenshot taken right after tapping *Bills* is pixel-for-pixel
  the Customers page, with the Customers tab still highlighted.
- **The wait before the commit is one server round trip plus route JavaScript.**
  Throttled, the navigation's RSC request comes back at 231–307 ms; route chunks
  (2–9 scripts per navigation, fetched only after the tap) push the commit to
  250–530 ms. Every route is dynamic (`app/layout.tsx:100` reads `cookies()`), so
  even a prefetched tab fetches its payload again on the tap.
- **Skeletons exist, but only after the commit.** Each new page renders its own
  client skeleton ("Loading totals", "Loading bills…") the moment it mounts,
  which is why first change ≈ commit. There is no `loading.tsx` (0 in `app/`), so
  nothing can draw earlier.
- **Lending Today → Loans is the slowest tap in the product, and the cost is
  leaving Today**: Today has 1,576 rows mounted (§8), unmounting them is a
  606–621 ms long task at 4× CPU, and the commit lands at 763–819 ms.
- Prefetch does not buy much while routes are dynamic: prefetched tab taps
  (2 RSC prefetches each) commit at 250–530 ms throttled; the unprefetched
  customer row commits at 413–440 ms.

## 3–4. Cold open: the waterfall, LCP, CLS, long tasks

Fresh context, empty cache. Times from the document request.

| Route | Viewport | LCP unthrottled / throttled | CLS (throttled) | Long tasks during load (throttled): count, max, sum | JS on the wire | `/auth/me` (throttled) | First data request (throttled) | Data waits for `/auth/me`? |
|---|---|---|---:|---|---:|---|---|---|
| `/dashboard` | 390 | 436 / **3,876** | 0.058 | 8, 291, 997 ms | 383 KB | 2,866 → 3,032 | `reports/dashboard` @ 3,407 | **yes** (+375 ms) |
| `/sales/invoices` | 390 | 560 / **4,008** | 0.044 | 6, 378, 907 ms | 378 KB | 2,887 → 3,055 | `sales/invoices` @ 3,649 | **yes** (+594 ms) |
| `/items` | 390 | 392 / **3,444** | 0.048 | 6, 297, 821 ms | 375 KB | 2,913 → 3,076 | `items` @ 3,375 | **yes** (+299 ms) |
| `/khata` | 390 | 428 / **3,620** | 0 | 5, 457, 911 ms | 375 KB | 2,870 → 3,048 | `parties` @ 2,866 | no (warm-up) |
| `/dashboard` | 1280 | 372 / 3,620 | 0.012 | 7, 320, 1,090 ms | 383 KB | 3,011 → 3,181 | @ 3,579 | **yes** (+398 ms) |
| `/sales/invoices` | 1280 | 400 / 3,548 | **0.161** | 6, 436, 895 ms | 406 KB | 2,864 → 3,032 | @ 3,904 | **yes** (+872 ms) |
| `/items` | 1280 | 444 / 3,532 | **0.146** | 7, 383, 1,020 ms | 411 KB | 2,910 → 3,076 | @ 3,462 | **yes** (+386 ms) |
| `/khata` | 1280 | 388 / 3,452 | **0.080** (0.142 unthrottled) | 9, 396, 1,086 ms | 411 KB | 2,808 → 2,990 | @ 2,803 | no (warm-up) |

- On the throttled profile **nothing asks the API for ~2.8 s**: that is the
  ~380 KB of JavaScript downloading at 1.6 Mbps and hydrating at 4× CPU.
  `/auth/me` is the first call; the Shop's data then waits for it (300–870 ms
  more) everywhere except `/khata` and `/parties`, which `AppRouteWarmup`
  starts in parallel.
- `/dashboard` additionally calls `auth/switch-app` and a second `/auth/me` when
  the last app used was another one (here Library), before the charts load at
  4,250 ms.
- CLS on desktop `/sales/invoices`, `/items` and `/khata` (0.08–0.16) is above the
  0.05 target; phones are 0–0.058.
- TTFB from Navigation Timing read 8–19 ms on both profiles, which shows the
  document request bypassed CDP's shaping; it is not reported as a result.

## 5. JavaScript per route (from the build)

`npm run bundle:check` on this build (gzip -9, modern browsers): framework
127.3 KB + shared app 111.9 KB = **239.2 KB every route pays**. Median first
load over 117 routes **314.0 KB**; heaviest 392.6 KB (sales/purchase editors).

| Route | Route JS | First load |
|---|---:|---:|
| `/dashboard` | 74.8 | 314.0 |
| `/customers`, `/suppliers`, `/khata` | 80.9 | 320.1 |
| `/sales/invoices` | 80.4 | 319.6 |
| `/items` | 79.9 | 319.1 |
| `/parties/[id]` | 105.4 | 344.6 |
| `/library` · `/library/members` · `/library/seats` | 74.3 · 81.5 · 76.2 | 313.5 · 320.7 · 315.4 |
| `/lending` · `/lending/loans` | 66.8 · 71.7 | 306.0 · 310.9 |

This build exceeds 8 budgets by ≤ 0.1 KB each (`/reports/profit`,
`/library/catalogue`, `/library/copies/[copyId]`, `/lending/loans`,
`/library/catalogue/[titleId]`, `/stock/low`, `/payments/[id]`, `/set-password`);
build-time public variables differ from CI's, so treat this as noise until CI
says otherwise.

## 6. Server timing: Library and Lending reads

In-process DRF with an owner token, throttles off, 20 runs after one warm-up —
the `scale_probe` method of 28 Sep. Rows = rows returned.

| Endpoint | Rows | P50 / P95 (ms) | Queries | Body | N+1 |
|---|---:|---|---:|---:|---|
| `GET /lending/today` | **1,576 (all)** | **6,703 / 7,737** | **1,584** | 540 KB | **yes, ≈ 1 query per loan** |
| `GET /lending/loans` (default 25) | 25 | 128 / 154 | 30 | 25 KB | **yes: 10 at 5 rows, 30 at 25, 55 at 50 (5 + 1/row)** |
| `GET /lending/loans?page_size=50` | 50 | 248 / 286 | 55 | 50 KB | |
| `GET /lending/borrowers` | 25 | 169 / 270 | 8 | 9 KB | no |
| `GET /library/members` (default 25) | 25 | 262 / 310 | **159** | 15 KB | **yes: 39 at 5, 159 at 25, 309 at 50 (9 + 6/row)** |
| `GET /library/members?page_size=50` | 50 | 487 / 539 | 309 | 30 KB | |
| `GET /library/seat-map` | 60 seats | 14 / 19 | 6 | 12 KB | no |
| `GET /parties` (for comparison) | 25 | 26 / 32 | 8 | 8 KB | no |
| `GET /auth/me` | — | 19 / 21 | 8 | 6 KB | — |

`/lending/today` fails the 500 ms API p95 target by fifteen times and grows
with the book; the two list endpoints grow per row. Library and Lending are
live and frozen (revamp 02), so these go to `docs/revamp/08` as proposals, not
into code.

## 7. Service worker in deploy files

| File | `NEXT_PUBLIC_SW_ENABLED` |
|---|---|
| `Dockerfile` (repository root; "Railway builds from the repository root") | `ARG NEXT_PUBLIC_SW_ENABLED=true` → **on by default** in the Railway image, unless the Railway service overrides the build variable (not visible in the repo) |
| `frontend/Dockerfile`, `docker-compose.yml`, `docker-compose.prod.yml`, `docker-compose.staging.yml` | not passed → **off** on the compose path |
| `frontend/.env.example` / `.env.local.example` | `false` / `true` |

The build measured here had it off, so no warm start was measured and
`navigator.serviceWorker.controller` on a real install was not checked.

## 8. Pressed state (H6)

CDP touch events do not set `:active` in headless Chromium (calibrated with an
injected `#calib:active { background: red }` button: no change at 50, 120, 300
or 600 ms), so the press was a mouse press at the same layout, held 150 ms,
compared with the resting look (what a finger sees) and the hover look.

| Control | Rest → press | Press differs from hover? | Source |
|---|---|---|---|
| Phone bottom tab (Bills) | **no change at all** | no | `UbBottomNav` has no `active:` and no hover style |
| Desktop sidebar row | changes, but only its hover style | no | `NavSections`: hover only |
| Phone list row (customer) | `rgb(230,244,245)` tint | yes | `UbDataGridMobileList`: `active:bg-surface-active` — the tint is also visible in a real-tap screenshot |
| Desktop table row | **no change** | no | |
| Primary button (Add customer) | `#F59E1B` → `rgb(217,133,10)` | **no** | `active:bg-cta-press`, but `--cta-press` = `--cta-hover` = `--accent-600` |
| Secondary button (Sort / Export) | slight darkening | no | `secondary`, `outlineNeutral`, `ghost`, `link`, `destructive` have hover styles only |

No control scales to 0.98 on press except the 6 `.ub-lift` cards and the video
play button.

## 9. Long lists (H8)

DOM after load at 390 px (1280 px gives the same row counts; Customers is a
25-row table there, 1,049 nodes), then after three long scrolls.

| Screen | Book | Rows in DOM on load → after 3 scrolls | DOM nodes |
|---|---:|---|---:|
| Lending Today (`/lending`) | 1,576 due | **1,576 → 1,576** (5,487 buttons) | **34,835** |
| Lending Loans | 1,576 | 25 → 100 (loads 25 more per scroll) | 582 → 1,557 |
| Library Students | 1,760 | 25 → 100 (same) | 672 → 1,721 |
| Shop Customers | 1,760 | 25, paged | 948 |

## Hypotheses

| ID | Verdict | The number |
|---|---|---|
| H1 Navigations wait for the server with nothing on screen | **Proven.** | Throttled tap → first change p50 **363 ms**, p95 **819 ms** (target ≤ 100 ms p95; unthrottled 47 / 167). In 57 of 57 navigations a fresh RSC request left on the tap and nothing changed until it and the route's chunks arrived; loading UI appeared *before* the commit in 0 of 57. 0 `loading.tsx`. The spike branch with one `loading.tsx` (05 §2) was not done: this phase changes no code. |
| H2 Handler navigations don't prefetch | **Proven, but it is not the main cost.** | `router.push` navigations (customer row, app switcher) had **0** prefetch requests in 12 of 12 runs; every `next/link` tab or sidebar row had 2–3. Yet prefetched tabs still commit at 250–530 ms throttled and the unprefetched row at 413–440 ms, because the routes are dynamic and refetch on the tap. |
| H3 Data waits for `/auth/me` | **Proven** for `/dashboard`, `/sales/invoices`, `/items`. | First data request starts **+299 to +872 ms** after `/auth/me` returns (throttled); `/khata` starts its list 4 ms *before* `/auth/me` (warm-up). Larger still: on the throttled profile nothing calls the API for ~2.8 s while the shell downloads and hydrates. |
| H4 Main thread busy on a cheap phone | **Proven** for first load; **partly** for navigation. | First load, 4× CPU: 5–9 long tasks, **max 291–457 ms, 0.8–1.1 s in total** per route; LCP **3.4–4.0 s** (target ≤ 2.5 s cold). Navigation: long task > 200 ms in 7 of 57 throttled navigations; the worst (621 ms) is leaving Lending Today (H8). Others peak at 205 ms. |
| H5 Session replay costs input delay | **Not measured.** | Analytics are off in this build (no PostHog key). Measuring needs replay actually recording, i.e. sending lab sessions to the owner's live PostHog project, or a stub of PostHog's endpoints; both need an owner decision. The baseline INP without analytics is p75 56 ms, max 176 ms (throttled taps). |
| H6 No pressed state on touch | **Proven for tabs, table rows and every non-primary button.** | Bottom tab: 0 style change on press. Desktop table row: 0. Secondary/outline/ghost: press = hover. Primary: press colour = hover colour (`--cta-press` = `--cta-hover`), so it changes on touch but not under a mouse. Only mobile list rows have a distinct press tint. No 0.98 scale. |
| H7 Service worker off or cold in production | **Not proven; the repository says the opposite for Railway.** | Root `Dockerfile`: `ARG NEXT_PUBLIC_SW_ENABLED=true`; compose files and `frontend/Dockerfile`: not set (off). The Railway service's own variables and a real install's `navigator.serviceWorker.controller` were not checked. |
| H8 Large lists render all rows | **Proven for Lending Today; disproven for Library Students, Lending Loans, Customers.** | `/lending`: **1,576 rows, 34,835 DOM nodes** at once, fed by `GET /lending/today` returning every loan (540 KB, **6.7 s** server P50, 1,584 queries). Students and Loans load 25 at a time (100 after three scrolls); Customers pages 25. Reports were not measured. |

## Caveats

- **Container, not phone** (top of this file). The throttled column is a floor.
- **Loan seeding hit server errors.** 432 of 2,000 `POST /lending/loans`, sent six
  at a time, failed with HTTP 500: `canceling statement due to statement timeout`
  (15 s). The book has 1,576 loans instead of 2,000. Concurrent loan creation at
  this rate is not a counter workload; it is recorded, not investigated.
- The seed book is the Shop's; its customers' Shop balances read ₹0.00 on
  `/customers` (the scale seed posts to the Udhaar book). That changes figures on
  screen, not the work the screens do.
- Every loan is daily on all weekdays, so all 1,576 are "due today". A real
  lender's Today is a subset; the per-loan cost and the absence of paging are
  what the numbers show.
- Event Timing durations are only of the scripted navigation taps; field INP
  needs `useReportWebVitals` (05 §6 step 2), which does not exist yet.
- `firstChange` was briefly contaminated by Playwright's screenshot caret
  handling (`--shots`); the harness now ignores attribute changes on inputs and
  the numbers above come from a run without `--shots`.
- The API ran under Django's development server with DEBUG on; client-observed
  API latency includes that. The §6 table is in-process server time.
