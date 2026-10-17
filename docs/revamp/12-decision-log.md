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
| N-1 | Phone module switching: the 5th bottom-bar slot becomes the App button with one App sheet (apps, more, you). Alternative B (3 tabs + App + More) rejected. | decided | owner, 17 Oct 2026 |
| N-2 | Notifications: popover on desktop, page on phones; same backend. | proposed | — |
| BP-01…07 | Backend proposals in 08. None approved. | **open** | — |
| R-DEC-06 | Keep the existing YourKhata logo and mark (`UbLogo`, `frontend/public/brand/yourkhata-*.svg`, rules in DESIGN-SYSTEM.md §7). On the dark sidebar it sits on a white rounded tile so it stays visible; the mark is never recoloured. | decided | owner, 17 Oct 2026 |
| L-01 | Library and Lending: UI only; contracts in 02 are fixed. | decided | owner, 17 Oct 2026 |
| R-DEC-07 | Every UI piece built (form, card, drawer, sheet, dialog, list, any screen) is delivered with screenshots of it on a phone and on desktop, in each of its states, before the next piece starts. See 11 "Screenshots after each piece". | decided | owner, 17 Oct 2026 |

## Progress

| Date | What was done | Files |
|---|---|---|
| 17 Oct 2026 | Read-only audit of frontend, backend, existing docs and performance facts | 01, 02 |
| 17 Oct 2026 | Goals, principles, navigation strategy, feedback and performance plan, shared components | 03, 04, 05, 06 |
| 17 Oct 2026 | Screen specs for sign-in and onboarding, global shell, notifications, four module entry points | 07-screens/01–07 |
| 17 Oct 2026 | Backend proposals BP-01…07 (none approved) | 08 |
| 17 Oct 2026 | Design review rounds 1 and 2 for the foundation; whole-module scores deferred until their screens are specified | 09 |
| 17 Oct 2026 | Roadmap and QA plan | 10, 11 |
| 17 Oct 2026 | Owner chose the App button (N-1) | 04, 07-screens/02 |
| 17 Oct 2026 | Owner: keep the existing logo (R-DEC-06) | 03, AGENT_START_PROMPT.md |
| 17 Oct 2026 | Owner: screenshots on phone and desktop after every built UI piece (R-DEC-07) | 11, AGENT_START_PROMPT.md |
| 17 Oct 2026 | Wave 2 and 3 screen specs for Shop (two files), Udhaar, Library, Lending and shared overlays; each failed round 1 and passes round 2 provisionally; module scores in 09 §5a | 07-screens/08–13, 09 |
| 17 Oct 2026 | Tool-neutral start prompt for any coding agent; root AGENTS.md; design page copied into the repo | AGENT_START_PROMPT.md, design/ |

## Next

1. Owner answers the open questions gathered on 17 Oct (the list is in the thread and in each 07-screens file's review): R-DEC-03, R-DEC-04, dual-role settle, the Shop person page main action, Udhaar undo and reminder tabs, the Library expired word, the Lending FP questions, and which BP items to consider.
2. Phase 1 measurements (05 §6) finish, turning H1–H8 into facts (docs/performance/2026-10-17-app-baseline.md).
3. Write the new proposals the specs raised into 08 (BP-08 dual-role settle; Library P-01…06; Lending FP-1…9; Shop P-08-01…06), each with the full proposal fields.
4. List the six new overlay pieces from 12-shared-overlays in 06.
5. Then ask the owner to approve Phase 2 (build) under R-DEC-01; nothing is built before that.
