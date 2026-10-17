# F1 route loading views: before and after (17 Oct 2026)

What changed: every `(app)` route got a `loading.tsx` re-exporting one of four views in `frontend/src/components/layout/RouteLoading.tsx` (commit `b168527`). Nothing else.

Method: identical to [2026-10-17-app-baseline.md](2026-10-17-app-baseline.md). Same container, same `seed_scale` book with Library and Lending, same standalone build flags, `node e2e/perf-app.mjs --reps=3 --only=nav`, 57 navigations per profile, nothing else running on the machine. "Before" is the baseline run at `4492d5f`; "after" is `b168527`. A container is not a phone: treat both as a floor, and compare them only with each other.

## All 57 navigations

| | Before | After | Target (05 §5) |
|---|---:|---:|---:|
| Throttled: tap → first visible change, p50 / p95 | 363 / 819 ms | **98 / 711 ms** | ≤ 100 ms p95 |
| Throttled: tap → content, p50 / p95 | 864 / 1,570 ms | 821 / 1,318 ms | — |
| Unthrottled: tap → first visible change, p50 / p95 | 47 / 167 ms | 35 / 113 ms | — |
| Loading view shown before the new page, throttled | 0 of 57 | **55 of 57** | every navigation |
| INP sample, throttled p75 / max | 56 / 176 ms | 56 / 72 ms | ≤ 200 ms p75 |

## Per tap, throttled, median first change (before → after)

| Navigation | How | Before | After |
|---|---|---:|---:|
| Shop Home → Customers (390 / 1280) | tab / sidebar link | 387 / 498 | **119 / 89** |
| Customers → Bills | tab / sidebar link | 291 / 508 | **111 / 110** |
| More → Items · Bills → Items | link | 352 / 402 | **128 / 84** |
| Udhaar People → Aging | tab / sidebar link | 361 / 366 | **82 / 105** |
| Library Home → Students | tab / sidebar link | 314 / 319 | **89 / 52** |
| Library Students → Seats | tab / sidebar link | 257 / 244 | **100 / 75** |
| Customer row → person page | `router.push` | 353 / 387 | 299 / 312 |
| Lending Today → Loans | tab / sidebar link | 819 / 763 | 868 / 618 |

## What it proves, and what it does not

- **H1 is fixed for link navigations.** Every tab and sidebar tap now draws the new screen's outline in 52–165 ms throttled, against 244–508 ms of a frozen screen before. The view is on the phone before the tap because `next/link` prefetches a dynamic route's `loading.tsx`; the root layout's `cookies()` did not stop it.
- **`router.push` taps are barely better** (299–312 ms): nothing prefetches them, so the loading view arrives with the server's answer. That is F2 (pending state on the tapped control, prefetch on press), the next piece.
- **Lending Today → Loans is unchanged** (618–868 ms): the delay is unmounting Today's 1,576 rows, a single 600 ms block of work before anything can paint, not the server. Lending is frozen (L-01), so the fix is a proposal (show Today in pages, as the other lists do), not code in this phase.
- **p95 is still 711 ms, so G1 is not met.** It is set by the two items above, which are 11 of the 57 navigations.
- Tap → content barely moved, as expected: the loading view changes what the merchant sees while waiting, not how long the data takes.

Screenshots of every case at 390, 320 and 1280 px, light and dark: `e2e/revamp-shots.mjs --piece=loading` (copied to the project's `revamp/shots/loading/`).
