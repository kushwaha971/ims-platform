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
Do not move pricing/contact onboarding ahead of WP-07. Read the newest QA.md entry
and git history/status for exact published commits and final gate results.

Completed: owner resolved D-01 (weighted-average stock costing, original-bill
supplier credit); corrected docs and numeric replay tests. Sales drafts preserve
their route family on reload, retain newer typing during a slow save, and now
have durable first-create identity/recovery. Read
09-draft-recovery-contract.md and ADR-063 before touching that protocol.

**Next: purchase bill/order recovery**, still in WP-02. Source inspection found
unprotected first draft POSTs and the same unconditional autosave dirty reset in
purchases/hooks/usePurchaseBillEditor.ts. Demonstrate failures, then reuse shared
lifecycle mechanics with typed domain adapters. Do not copy the whole sales
editor or import the sales financial model into purchases. Preserve payable,
stock receipt, recording and supplier duplicate-number rules.

Sales recovery owners: hooks/useInvoiceEditor.ts and its first-save lazy helper
hooks/draftRecovery.ts, useDraftAutosave.ts, invoiceEditorSlice.ts,
src/utils/localDrafts.ts, backend/apps/sales/services/documents.py and its thin
estimate/order/challan adapters. Claims/tombstones survive short cache expiry;
recovery reads current server data without applying stale request contents.
Version-1 recovery saves current typing by explicit optimistic PATCH; newer
versions require conflict review. Never replay posting as part of recovery.

Use isolated fixtures and preserve unrelated work. The owner requested pushing
tested code to dev and a continuation prompt; inspect current publication status
before repeating a push. Do not claim Railway deployed without verification.
Never wipe real databases, send real messages or access phone contacts in QA.
Keep QA.md, the acceptance tracker and this handoff current. Full release/device
sign-off, purchase recovery and multiple unsynced new-tab behavior are not proved
by sales unit tests. Design/UX readiness is not yet 9/10.
