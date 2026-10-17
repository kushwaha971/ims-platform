# 12 · Decisions and progress log

Newest first. Each decision says who made it and when. "Open" means it waits for the owner.

## Decisions

| ID | Decision | Status | By, date |
|---|---|---|---|
| R-DEC-01 | Revamp is planning and design only until the owner approves a phase. No app code changes. | decided | owner, 17 Oct 2026 |
| R-DEC-02 | Keep the Counter Mode direction: teal and marigold, white page background, dark teal sidebar. Changes `tokens/light.css` canvas when built. | decided | owner, 17 Oct 2026 |
| R-DEC-03 | Shop Home: four-figure line (current spec) vs the earlier big sentence; proposal is both — sentence as a one-line phone header above the grid. | **open** | — |
| R-DEC-04 | Shop phone tab order: Home · Bills · Customers · Suppliers (design page) vs Home · Customers · Suppliers · Bills (manifest today). | **open** | — |
| R-DEC-05 | PWA shortcuts become generic per app and are guarded; `start_url` goes through the landing resolver. | proposed | — |
| N-1 | Phone module switching: the 5th bottom-bar slot becomes the App button with one App sheet (apps, more, you). Alternative B: 3 tabs + App + More. | **open** | — |
| N-2 | Notifications: popover on desktop, page on phones; same backend. | proposed | — |
| BP-01…07 | Backend proposals in 08. None approved. | **open** | — |
| L-01 | Library and Lending: UI only; contracts in 02 are fixed. | decided | owner, 17 Oct 2026 |

## Progress

| Date | What was done | Files |
|---|---|---|
| 17 Oct 2026 | Read-only audit of frontend, backend, existing docs and performance facts | 01, 02 |
| 17 Oct 2026 | Goals, principles, navigation strategy, feedback and performance plan, shared components | 03, 04, 05, 06 |
| 17 Oct 2026 | Screen specs for sign-in and onboarding, global shell, notifications, four module entry points | 07-screens/01–07 |
| 17 Oct 2026 | Backend proposals BP-01…07 (none approved) | 08 |
| 17 Oct 2026 | Design review rounds 1 and 2 for the foundation; whole-module scores deferred until their screens are specified | 09 |
| 17 Oct 2026 | Roadmap and QA plan | 10, 11 |

## Next

1. Owner answers N-1, R-DEC-03, R-DEC-04 and which BP items to consider.
2. Phase 1 measurements (05 §6), which turn H1–H8 into facts.
3. Wave 2 screen specs: Shop and Udhaar screens, shared overlays.
