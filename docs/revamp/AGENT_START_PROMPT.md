# Portable start prompt for the YourKhata revamp

Give the block below to any coding agent (Codex, Cursor, Claude Code, Copilot, Windsurf, or a person) with this repository checked out. It is written so every tool continues the work in the same way and to the same standard. Paths are relative to the repository root. Tools and permissions differ between agents; the rules, order of work, document formats and evidence standards do not.

Replace the line marked `TASK` with what you want done next. If you leave it out, the agent does the next item in `docs/revamp/12-decision-log.md` → "Next".

```text
You are continuing the YourKhata revamp: a redesign of the whole app (Shop, Udhaar
book, Library, Lending and everything around them) and a fix for slow, silent taps
in the installed PWA. The plan lives in docs/revamp/. You continue it; you do not
start a new one.

TASK: <what to do now, e.g. "write the wave 2 screen specs for Shop customers and
suppliers", or "run Phase 1 measurements"; if empty, do the first item under
"Next" in docs/revamp/12-decision-log.md>

## 1. Read first, in this order
1. CLAUDE.md at the repository root (project rules; they apply to every tool, not
   only Claude) and AGENTS.md if present.
2. docs/revamp/README.md (master plan and document map).
3. docs/revamp/12-decision-log.md (what is decided, what is open, what is next).
4. docs/revamp/02-preserve-and-contracts.md (what must never change).
5. The documents your TASK touches, and docs/DESIGN-SYSTEM.md before any UI work.
6. The visual reference: docs/revamp/design/counter-mode.html (open in a browser).
Then inspect the real code for anything you are about to describe. The docs can be
out of date; the code is the truth. If they disagree, say so in the decision log.

## 2. Rules that do not bend
- Planning and design only, unless docs/revamp/12-decision-log.md records the
  owner's approval for the implementation phase you are in (R-DEC-01). No
  application code, migrations, package installs or deployments without it.
- Library and Lending are live. For them, only presentation may change. Their
  endpoints, request/response shapes, calculations, rules, models and workflows in
  02 are fixed. Any functional idea goes to 08 as a proposal, never into code.
- Shop and Udhaar: improvements may be proposed; everything listed in 02 §4 keeps
  working.
- Each app keeps its own money (DEC-019). Customers and suppliers are never netted
  without an explicit settlement. Plain everyday words; Udhaar alone says
  You gave / You got; Lending says Lent / Collected; Library says Fee / Paid.
- Nothing a merchant's customer receives names the product or its domain.
- Keep the agreed look: teal #0E7C86, marigold #F59E1B with dark ink for the one
  main action, white page, dark teal sidebar, Plus Jakarta Sans + Mukta.
- Phones: bottom bar with 4 app tabs + the App button (N-1, approved). Desktop:
  app tree in the sidebar. Never copy the phone bar to desktop.
- Reuse first: check src/design-system (92 parts) and 06 before proposing a new
  component. No new dependency without an ADR. Redux Toolkit, no TanStack Query.
- Backend changes only when proven necessary, written in 08 with: why, endpoint,
  before/after, risk, compatibility, data impact, tests, rollback.
- Never claim a speed improvement without before/after numbers, never claim
  safety without the regression and contract checks in 11, never inflate a score.

## 3. How to do the work
- Screen specs: one section per screen in docs/revamp/07-screens/<area>.md using
  the template in 07-screens/README.md, every field filled (purpose, who, phone,
  desktop, hierarchy, components, actions, navigation, all states, accessibility,
  must-keep, fewer taps) plus the tracking line. Cite real files and endpoints.
- Every screen covers: loading, empty, first use, error, partial failure, success,
  offline, no permission, long names, large amounts (₹12,40,378.00), 320 px Hindi,
  thousands of rows, repeated taps, expired session.
- Feedback rules in 05 §3 apply to every interactive element you specify.
- Measurements: use the method in 05 §6; write results to docs/performance/ with
  the date; mark each hypothesis H1–H8 proven or disproven.
- Scoring: use the weighted rubric in 09 exactly. Score only what is specified.
  Pass is strictly above 8.6 per module and overall. If below, list shortcomings,
  change the specs, and score again (keep both rounds). List what each score
  still needs (devices, users, accessibility, measurements) before it counts.

## 4. Keep the documents true (every session, before you stop)
1. Update the documents you changed; keep each file's "Status" line current.
2. Add a dated row to 12-decision-log.md → Progress: what you did, which files.
3. Record any new decision with who made it; owner decisions only from the owner's
   own words. Move answered items out of "Open".
4. Update "Next" in 12 so the following agent knows exactly where to start.
5. Update the document table in README.md if you added a file.
6. Edit existing documents instead of creating parallel ones. Never delete a
   decision; mark it superseded with the date and reason.
7. Commit with a message that explains why, in prose (repository convention).

## 5. What to report back
Lead with anything the owner must decide (one question, short options, your
recommendation). Then what changed, with file links, what was measured or checked
and how, and what is still unproven. Keep it short; details belong in the docs.
```

## Notes for specific tools

- **Codex** reads `AGENTS.md` at the root automatically; it points here.
- **Cursor** also reads `AGENTS.md`; for older setups, add this file under Rules ("Add rule → reference file").
- **Claude Code** reads `CLAUDE.md` automatically and `AGENTS.md` when asked; the prompt above covers both.
- **Any chat-only tool** without repository access: paste the prompt, then paste README.md, 12-decision-log.md, 02 and the files your task touches.
