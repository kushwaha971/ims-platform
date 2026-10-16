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

## Current handoff — 16 October 2026 (after WP-03 and the first WP-04 slice)

WP-02 is implemented. Its remaining evidence needs the owner or a real
device. **WP-03** has had its first pass. Continue autonomously through
authorized work; a passing checkpoint is not a reason to stop. Do not move
pricing/contact onboarding ahead of WP-07. Read the newest QA.md entry and git
history for exact commits and gate results.

Completed in WP-02:
- D-01 resolved (weighted-average stock costing, original-bill supplier credit).
- Sales drafts (invoice/bill of supply, estimate, order, challan) and purchase
  bills and orders have durable first-create identity and recovery. See ADR-063
  and its addendum, plus 09-draft-recovery-contract.md. Read both before
  touching that protocol.
- Any new claim table must be registered for tenant export/deletion.

Completed in WP-03 (first pass): see 10-reuse-inventory.md. Read it before
adding a helper, because the owner may already exist.

Shared owners (reuse these, do not copy them):
- server, drafts: `backend/apps/common/draft_creation.py` and
  `DraftCreationBase`.
- server, udhaar balance move: `parties/services/balance.move_main_balance`.
  It writes balance, the receivable/payable split, last activity and the
  collection-date clear; `apply_entry` and LED-03 corrections both call it.
- server, purchase bill due: `purchases/services/payment_seam.outstanding`.
- client, drafts: `src/hooks/useDraftSaveQueue.ts` and
  `src/utils/draftCreation.ts`.
- client, credit-limit override: `selectMayOverrideCreditLimit` /
  `CREDIT_OVERRIDE_ROLES` in `sessionSlice`. This is a role, not a codename,
  and a contract test keeps it equal to the server's `OVERRIDE_ROLES`.
- client, WhatsApp/SMS links and phone display: `src/utils/share.ts`.
- client, money: `src/utils/money.ts` (Decimal; `moneyOrZero` for a figure
  shown while an amount is half-typed).
- client, calendar days: `src/utils/calendarDays.ts` (`daysBetweenIso`,
  `addDaysIso`). It imports nothing; `utils/dates.ts` brings dayjs.
- client, lending asked-today: `lendingDisplay.askedToday`.
- Guards: `frontend/src/tests/sharedOwners.test.ts`,
  `backend/tests/architecture/test_shared_owners.py` and
  `backend/apps/purchases/tests/test_bill_due_owner.py`. When you clear a debt,
  add its pattern there.
- Browser checks: `node e2e/purchase-recovery-look.mjs` and
  `node e2e/sales-recovery-look.mjs`, on a live stack.

WP-04 has started: read 11-message-inventory.md. `UbShareSheet` is the
editable composer for client-built messages, and its labels come from
`src/hooks/useShareSheetLabels.ts`. Never `window.open` a WhatsApp/SMS link
built from text; the source-scan guard fails on it. Lending/Library dialogs are
the server-prepared reference.

**Next, in order:**
1. WP-04 M-06: bulk "Remind all" (`BulkReminderDialog`,
   `ledger/services/reminders.bulk_reminders`). Add an editable template and
   preview step before the batch is built, and pass the approved text to the
   server so each `wa_url` uses it (MSG-07/08). Fail-first API and UI tests.
2. WP-04 MSG-10: when a khata/source reminder channel is tapped, record the
   merchant's final text, not only the server default.
3. WP-04 M-10 (library counter slip) and M-11 (pay-link text) onto a composer.
4. The UI-composition audit (WP-03 D-04) goes alongside WP-05. D-05
   (quantities) is optional.
5. Still owed to WP-02, needing the owner or a device: a physical
   network-interruption check on a phone, and the owner's SH-011 release
   review in the tracker. Do not wait on these.

Known limits (do not claim otherwise): the purchase editor keeps no device
copy, so its key is in memory only and a full reload after a lost reply starts
a new bill (the first draft stays under Drafts). Multiple unsynced new sales
drafts in separate tabs still share one device slot. Railway deployment,
physical-device evidence and 9/10 readiness are not verified.

Environment notes for a cloud sandbox (no owner .env): start PostgreSQL 16
locally with role/db `udhaarbook`/`udhaarbook`, `pip install -r
backend/requirements/dev.txt`, set `UB_TEST_DB_NAME` per concurrent pytest
run, build the frontend with `.env.local.example` exported (the build refuses
without `NEXT_PUBLIC_API_BASE_URL`), and run Playwright with
`PW_CHROMIUM=/opt/pw-browsers/chromium`. Measure bundle deltas against dev's
own build in the same environment before raising a budget. `dues`'
5,000-schedule timing test can exceed 60 s on a shared 4-core sandbox.

Use isolated fixtures and preserve unrelated work. Never wipe real databases,
send real messages or access phone contacts in QA. Keep QA.md, the acceptance
tracker and this handoff current.
