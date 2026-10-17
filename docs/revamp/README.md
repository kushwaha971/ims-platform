# YourKhata revamp — master plan

**What this is**: the living plan for redesigning the whole app (Shop, Udhaar book, Library, Lending, and everything around them) and fixing slow, silent taps in the installed app. **Planning and design only.** No application code is changed by anything in this folder until the owner approves a phase (R-DEC-01).

**Start here if you are continuing this work** (any AI tool or person): follow [AGENT_START_PROMPT.md](AGENT_START_PROMPT.md). In short, read this page, then [12-decision-log.md](12-decision-log.md) for what is decided and open, then [02-preserve-and-contracts.md](02-preserve-and-contracts.md) before touching anything in Library or Lending.

Last updated: 17 Oct 2026, on `dev` at 31784ab.

## Documents

| # | Document | What it holds | Status |
|---|---|---|---|
| 01 | [Audit and inventory](01-audit-and-inventory.md) | every route, nav, notifications, PWA, feedback, measured performance, problems A-01…A-15 | done (first pass) |
| 02 | [Preserve and contracts](02-preserve-and-contracts.md) | Library and Lending frozen endpoints and rules with file:line; Shop/Udhaar behaviours to keep; how we prove nothing changed | binding |
| 03 | [Goals and principles](03-goals-and-principles.md) | measurable goals G1–G7, ten principles, visual direction | draft for approval |
| 04 | [Navigation strategy](04-navigation-strategy.md) | business → app → section model, phone App button (N-1, approved), desktop sidebar, back, notifications, start screen, You page | proposed |
| 05 | [Feedback and performance](05-feedback-and-performance.md) | causes H1–H8 with how to prove each, feedback rules, duplicate protection, targets, benchmark method, fix list | hypotheses until Phase 1 |
| 06 | [Shared components and architecture](06-shared-components-and-architecture.md) | reuse map of 92 design-system parts, the few new pieces, duplication to remove | proposed |
| 07 | [Screen specs](07-screens/README.md) | template; specs for sign-in, onboarding, shell, notifications, four module entry points | foundation done; waves 2–3 to do |
| 08 | [Backend change proposals](08-backend-change-proposals.md) | BP-01…07, each with risk, compatibility, tests, rollback | none approved |
| 09 | [Design review](09-design-review.md) | weighted rubric, round 1 (failed) and round 2 (passes provisionally), what each score still needs | foundation only |
| 10 | [Roadmap](10-roadmap.md) | phases 1–8 with deliverables, risks and done-when | plan |
| 11 | [QA and regression](11-qa-and-regression.md) | existing gates, added checks, rollout exit criteria | plan |
| 12 | [Decisions and progress](12-decision-log.md) | every decision and activity | living |
| — | [AGENT_START_PROMPT.md](AGENT_START_PROMPT.md) | the prompt to give any coding agent (Codex, Cursor, Claude Code, others) to continue this work the same way | current |
| — | [design/counter-mode.html](design/counter-mode.html) | the visual reference page (open in a browser) | current |

## Where this sits among older plans

This folder extends, and does not replace: `docs/mobile-redesign/` (bottom nav and mobile patterns, mostly built), `docs/platform/14` (app switcher), `docs/DESIGN-SYSTEM.md` (theme and rules), `docs/shop-ims-readiness/` (Shop programme, TV gaps). Where they disagree, 01 §8 lists it and 12 records the decision.

## The short version

1. **The slow-tap problem is probably silence first, slowness second.** There are no route loading boundaries and most navigations happen in click handlers, so a tap shows nothing until the next page arrives (H1, H2). Phase 1 measures this before anything is changed.
2. **Phones get an App button** in the bottom bar's fifth slot: one sheet with your apps, the rest of the menu and your account. Desktop keeps switching in the sidebar, as an app tree. Approved by the owner (N-1).
3. **Notifications** become a popover on desktop and a page on phones, with the same backend.
4. **Library and Lending change only how they look.** Their endpoints and rules are listed in 02 and checked by contract snapshots and figure parity before release.
5. **The foundation design scores 8.74 provisionally**; whole-module scores wait until each module's screens are specified, and every score lists what still has to be measured or tested before it counts.
