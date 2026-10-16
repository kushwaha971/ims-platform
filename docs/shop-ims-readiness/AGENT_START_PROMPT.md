# Portable coding-agent prompt

Paste the prompt below into Codex, Claude Code, Cursor or another coding agent with this repository checked out. Paths are repository-relative. Tools, permissions and browser capabilities depend on the environment; the requirements and evidence standards stay the same.

```text
You are implementing the entire Shop/IMS readiness programme in this repository.

Read applicable AGENTS.md or other repository instructions if present. Then read:
1. docs/shop-ims-readiness/README.md and every linked specification/tracker
2. docs/shop-ims-readiness/07-delivery-roadmap.md
3. docs/review/06-shop-user-audit.md
4. the latest relevant checkpoints in QA.md
5. docs/DECISIONS.md and docs/DESIGN-SYSTEM.md

The readiness pack is the current implementation brief. Older QA entries are
historical checkpoints, not proof that proposed features are finished. Follow
applicable higher-priority instructions and current explicit user direction.
Inspect the running product and source before changing behavior already fixed.

Objective: achieve at least 9.0/10 independently for design/UX and functionality/
business logic under the documented scorecards, with no unresolved critical/high
correctness or privacy defects in enabled scope. Do not invent ratings, evidence,
competitor claims, supported capabilities or delivery results.

Scope: the whole Shop/IMS daily business workflow, including dashboard, Customers,
Suppliers, billing/POS, sales documents, purchases, returns, items/stock/units/
prices, payments/advances/refunds, expenses/cashbook, dues, reports/documents,
permissions, recovery, mobile/tablet/desktop and declared business capabilities.

Non-negotiable requirements:
- Keep Udhaar independent from Shop and preserve app/book/tenant ownership.
  Keep Customers and Suppliers as separate sections and role-specific choices.
  Do not silently migrate business entries into personal Udhaar or invent a new
  dual-role settlement rule.
- Every default outgoing reminder/message must be editable before send/share.
  Cover receipts, documents, individual, bulk and scheduled flows in all supported
  apps. Use one shared composer/protocol with appropriate channel adapters,
  permissions, consent and retry protection. Never claim a WhatsApp/SMS handoff
  was delivered. A settled bill must not receive an unpaid reminder.
- Avoid duplicate code across the whole codebase. Inspect existing shared owners
  before adding helpers/components. Consolidate equivalent logic and migrate its
  callers; keep genuinely different domain rules separate. Record intentional
  exceptions. Do not remove authoritative server validation or independent test
  oracles merely to reduce apparent duplication.
- Reuse the existing design system/ml-uikit, compact primitives, Redux Toolkit,
  form/validation and service patterns. Preserve readable touch targets, focus,
  scroll restoration, safe areas, accessible labels and English/Hindi parity.
- Server-authoritative Decimal calculations, atomic/idempotent posting, immutable
  posted history, independent reconciliation and tenant/role checks are essential.
  Do not silently change return valuation, rounding or financial business rules.
- Use isolated non-production fixtures. Never reset real data, send real messages,
  publish, push or deploy without the authorization appropriate to that task.
  Do not expose credentials or private contact data in logs, screenshots or commits.

Execution:
Inspect git status/branch and preserve unrelated work. Follow work packages in
07-delivery-roadmap.md, starting with WP-01 decisions and risk fixtures. Bring
unresolved business-rule choices with concrete numeric examples and a clear
recommendation; continue independent authorized work while waiting. Do not ask
for routine permission already provided by the task.

For each package: review the task/design/data contract -> implement a small,
reviewable slice -> run appropriate automated checks -> exercise the actual user
journey -> inspect mobile and desktop -> reconcile money/stock where relevant ->
update QA.md and 08-acceptance-and-evidence-tracker.md with verified evidence.
For defects, demonstrate failure before and success after where feasible.

Use the browser tools permitted by your environment. If browser/device/provider
access is unavailable, mark that evidence Blocked or Not evaluated; do not replace
visual QA with an unsupported claim from unit tests. Test slow/out-of-order replies,
lost responses, retries, remounts, stale versions and user/business switches.

Continue beyond a plan into the authorized implementation. Keep shared behavior
compatible across Shop, Library, Lending and Udhaar. Run affected-module regressions
and current required types/lint/locales/contrast/build/bundle gates. Explain measured
budget changes; do not disable gates to get green results.

At handoff report: requirements completed, changes and why, evidence/tests with
exact results, unresolved decisions/risks, unsupported cases and the next work
package. Distinguish local implementation from deployed behavior. Readiness needs
all documented sign-offs and both scorecards; passing many tests alone is not enough.
```

## Resume an interrupted package

Append: “Resume from the latest verified QA.md checkpoint and acceptance tracker. Inspect the working tree, current diff and running services first. Preserve completed work and unresolved decisions; do not restart the programme or overwrite unrelated changes.”

## Current handoff — 16 October 2026

Resume **WP-02**, functionality/data reliability with regression testing. Continue
autonomously through authorized work; a passing checkpoint is not a reason to stop.
Do not move pricing/contact onboarding ahead of WP-07.

Verified local changes for this handoff:
- Owner resolved D-01: weighted-average supplier-return stock costing; original
  bill price/tax still determines supplier credit. Documentation corrected;
  180 purchases/inventory tests pass. No stock algorithm or history migration.
- Shared draft URL preserves invoice/estimate/order/challan family on first save.
- Autosave preserves newer edits made during a pending save and schedules the next
  save even if its debounce expired. 159 sales tests, types and affected lint pass.

**SH-011 remains open.** Next implement durable first-create identity and recovery
across lost POST response, retry and reload. Include tenant/user/family scoping,
concurrent manual/autosave requests, stale-version protection, and deleted-draft
tombstones so retry cannot resurrect discarded work. A recovered create must not
overwrite newer server edits or reapply stale wrapper metadata. Preserve posted
documents and invoice snapshots. The existing 24-hour idempotency cache alone does
not cover the seven-day local-draft recovery window.

Inspect shared owners first: sales/hooks/useInvoiceEditor.ts, useDraftAutosave.ts,
redux/salesThunk.ts, salesFlowThunk.ts, api/salesService.ts, estimateService.ts,
src/utils/localDrafts.ts and backend/apps/sales/services/documents.py with its
estimate/order/challan adapters. Keep one recovery protocol; no duplicated logic
per screen. Keep newer edits dirty after saving an older snapshot.

Use isolated fixtures. Preserve unrelated untracked files. Push this tested
checkpoint to dev only when requested; distinguish push from verified deployment.
Keep QA.md and the acceptance tracker truthful, with open work explicit.
