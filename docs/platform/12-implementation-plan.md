# Consolidated implementation plan

Status: **ACCEPTED (architecture owner), 30 Sep 2026, Phase 3 step 3.** This is the order in which
the platform expansion is built, merged from the task lists of the five FRDs in `frd/` and the
resolutions of [10-architecture.md §17](10-architecture.md#17-contract-resolutions-phase-3-step-3-30-sep-2026).
The interfaces are [11-contracts.md](11-contracts.md) v1. Owner questions and the defaults the build
uses meanwhile: [13-owner-questions.md](13-owner-questions.md).

No module code is written before this phase gate closes (vision §5).

---

## 1. Rules for every wave

### 1.1 Sizes

One scale for every task, in agent-days including tests, the look-and-fix loop and the gates
(CLAUDE.md "review, build, look, report"): **S** ≤ 1, **M** 2–3, **L** 4–6, **XL** 7–10. FRD 00 and
lending already use it. Library's sizes (S ≤ ½ day, M 1–2, L 3–5) are converted here; gym and
hospitality had none and are sized here.

### 1.2 Tracks and worktrees

- At most **three tracks at once** (HANDOFF §3: 2 CPUs, 8 GB). Each track is a git worktree made
  with `scripts/worktree-bootstrap.sh <track>`, which sets `UB_TEST_DB_NAME=test_ub_<track>`.
- A task starts only when every task in its "After" column is **merged on main** with its contract
  and replay tests.
- Dev agents run targeted gates only (targeted jest with `--maxWorkers=1`, eslint and prettier on
  changed files, `tsc`, the app's pytest); the lead runs the full gates after each merge.
- A developer never verifies their own work: an independent QA agent does, per task (HANDOFF §3).

### 1.3 File ownership

Each task **owns** the files in its "Owns" column for its lifetime; no other open task edits them.
A set of **shared hot files** is edited by many tasks, and only in this way:

| Shared file | Rule |
|---|---|
| `backend/apps/common/error_codes.py`, `apps/common/audit.py` (`AuditAction`), `apps/common/permissions_registry.py`, `apps/common/constants.py` | Append-only, inside a block headed `# ── <task id or module> ──`; never reorder or edit another block |
| `backend/config/settings/base.py` (`INSTALLED_APPS`), `backend/config/urls.py` | One line per new app, appended in the new app's block |
| `backend/tests/architecture/test_import_rules.py` | Owned by A11 in Wave A; afterwards one `ALLOWED` row per new app, appended |
| `frontend/locales/{en,hi}.json`, `locales/catalogues.json`, `locales/catalogues/*` | A module adds only its own catalogue and one `catalogues.json` prefix; merged with `scripts/merge-json.py --sort`, then `split-locales.mjs` and `check-locales.mjs` |
| `frontend/bundle-budgets.json` | Only the lead edits it, with a dated note |
| `frontend/src/routes.ts`, `features/navigation/sidebarConfig.ts`, `src/redux/invalidation/registry.ts`, `src/types/domain.types.ts` | Append-only block per module; the lead merges with `scripts/union-conflicts.py` and `scripts/registry-merge.py` |
| `docs/22-api-specification.md` (§22.1.1 error table) | Rows appended per module; the lead merges |

Everything else belongs to exactly one task. A task that finds it needs a file another open task
owns stops and asks the lead; it does not edit it.

### 1.4 Migration numbering

1. **One owner per app per wave.** A core app's migrations in Wave A are reserved below by number and
   task. No other task adds a migration to that app during the wave.
2. **Engines and verticals start at `0001` in their own app**, so they cannot collide. Their `0001`
   depends on the **latest core migration fixed at the start of their wave** (listed per wave below),
   never on a migration still on a branch.
3. **Merge in number order.** A branch whose reserved predecessor is not merged waits, or rebases and
   renumbers **in the branch** before merge. `makemigrations --merge` is never used.
4. **Release and role data live in the vertical.** The release data migration (plans and partners,
   10-architecture §2.4) and a module role's `platform_role` row are data migrations in the
   vertical's own app, so no vertical ever adds a `platform_app` migration.
5. Every worktree runs `python manage.py makemigrations --check --dry-run` before asking for merge; the
   lead reruns it on main after the merge.
6. A new `ledger_entry` column re-creates `forbid_update_delete()` in the same migration
   (10-architecture §10 rule 2).

**Wave A reservations** (current heads at `30798d2`: `ledger 0005`, `parties 0008`, `payments 0002`,
`sales 0003`, `platform 0011`, `tax 0002`):

| App | Number | Task | Content |
|---|---|---|---|
| `ledger` | `0006_entry_bucket` | A2 | `bucket` + CHECK, trigger re-created, `source_type` loses `choices` (R8) |
| `ledger` | `0007_reminder_source` | A7 | reminder source columns, `recipient_party_id`, `message_group_id`, widened index (R9, R10) |
| `parties` | `0009_party_bucket_caches` | A2 | `loan_balance`, `deposit_held` |
| `parties` | `0010_party_relation` | A6 | `parties_relation` |
| `payments` | `0003_payment_bucket` | A4a | `payments_payment.bucket` (R5) |
| `payments` | `0004_held_deposit` | A4b | `payments_held_deposit`, `payments_deposit_application` |
| `sales` | `0004_credit_value_lines` | A15 | `sales_document_line.credit_mode` and value fields (R51) |
| `sales` | `0005_document_origin` | A5 | `origin_module`, `origin_type`, `origin_id` + index |
| `platform` | `0012_sequence_perpetual` | A8 | `fy_label` CHECK admitting `'*'` |
| `platform` | `0013_closed_day` | A9b | `platform_closed_day` |

Wave D reserves `tax 0003_room_slab` (D-core) and nothing else in core.

---

## 2. Wave A — core foundations

Everything in Waves B–D needs some of it, and each item changes a load-bearing table once
(10-architecture §13.2). Task names A1–A11 keep their 10-architecture §13.1 meanings (the FRDs cite
them); A12–A16 are new. "FRD 00 #" is the task number in `frd/00-core-and-engines.md` §I.

| Task | What | FRD 00 # | Resolutions | Size | After | Track | Owns |
|---|---|---|---|---|---|---|---|
| **A1** | Release gate: `ModuleCode` values, `UNRELEASED_MODULES`, env flag, gates in `modules_view`, `update_enabled_modules`, `ModuleEnabled` **and `effective_modules`**; frontend `MODULE_CODES` = server's list + equality test | 1 | R11 | M | — | P | `platform_app/constants.py`, `services/entitlements.py`, the `ModuleCode` block of `common/constants.py`, `src/types/domain.types.ts` |
| **A11** | Import matrix for the seven apps; whole-AST test with a planted fixture; the two registry modules allowed to verticals; ESLint `no-restricted-imports` zones | 2 | R27 | S | — | F | `tests/architecture/test_import_rules.py`, `frontend/eslint.config.mjs` |
| **A9a** | `recurrence.py` (`kw_only`), `periods.py`, `money.round_amount`/`split_total`, `RecurrenceFields` mixin, fuzz tests | 3 | R13 | M | — | F | `common/recurrence.py`, `common/periods.py`, `common/money.py`, `common/models.py` (mixin) |
| **A12** | Engine enablement: `ENGINES_USED_BY`, `engine_enabled`, `EngineEnabled`; labelled, deduplicated off-guards + `breakdown`; `register_module_enable_hook`; `ENGINE_READ_PERMISSIONS` | 13 | R14, R15, R25 | M | A1 | P | `platform_app/services/tenant_settings.py`, `services/guards.py`, `common/permissions.py` |
| **A14** | **Decouple payments** from sales and purchases: move both targets, the void-listener wiring and source resolvers to their owners' `ready()`; `ALLOWED["payments"]` shrinks. No behaviour change | — (new) | R72, ADR-056 | M | A11 | M | `payments/apps.py`, `payments/services/targets/{sales,purchases}.py` → `sales/services/payment_target.py`, `purchases/services/payment_target.py`, `sales/apps.py`, `purchases/apps.py` |
| **A10** | Registries: `register_schedule`; dashboard sections and reports (`reports/registry.py`, `GET /reports`, `sections`); notification types; **module settings** (`register_setting_spec`); **imports** idempotent `register` + `example_key`; **default templates**; frontend `dashboardSections.ts` | 4 | R28, R29, R43 | L | A9a | F | `common/jobs.py`, `reports/registry.py`, `reports/views/*dashboard*`, `notifications/services/{notify,templates}.py`, `imports/registry.py`, `platform_app/settings_schema.py`, `features/reports/dashboardSections.ts` |
| **A13** | Row scoping and module roles: `ScopedViewSetMixin`, `RestrictedFieldsMixin`, `register_module_role`, `permissions_for` for module roles, `.reveal`/`read_all` conventions, roles API filter, team UI; architecture test; **canon §0.9 CR drafted** (owner Q1, Q2) | 14 | R66, R70, R47 | M | A1, A12 | P | `common/scoping.py`, `common/serializers.py` (mixin), `platform_app/services/memberships.py`, `features/team/*` |
| **A2** (+A3) | Ledger `bucket` (migration + trigger), `register_posting_source` (four existing sources re-registered), `CHARGE`/`ADJUSTMENT_CREDIT`, `apply_entry(bucket)`, party caches, selectors/aging/statement/drift/`recalc_balances`, trade figure in credit exposure, **LED-11 write-off cap**, public statement helpers, statement deposit block | 5 | R8, R23, R48 | XL | A14 | M | `ledger/*` (models, constants, postings, entries, write_off, selectors), `ledger/0006`, `parties/models.py`, `parties/0009`, `parties/services/{balance,credit}.py`, ledger feature statement UI |
| **A8** | `register_number_kind`, `allocate_counter`/`peek`/`raise`, `fy_label` CHECK, settings numbering payload | 11 | — | S | A10 (settings) | P | `platform_app/services/sequences.py`, `platform/0012` |
| **A9b** | `platform_closed_day`, weekday settings (and `.<module>` key), calendar services and API, `platform.calendar.manage`, the Business days screen and `features/calendar` | 12 | R26, R32 | M | A8, A9a | P | `platform_app/services/calendar.py`, `platform/0013`, calendar views/urls, `features/calendar/*` |
| **A4a** | Payments v2: target protocol v2 (`bucket`, `auto`, `payment_id`, `ctx`, `label`), `payments_payment.bucket`, one-bucket rule, global auto FIFO, **earmarks**, 32-char check, `allocate_existing` service + endpoint, shared target contract suite, Apply-to-bills UI | 6 | R1, R5, R6, R7, R30, R61 | L | A2 | M | `payments/models.py`, `payments/0003`, `payments/services/{record,allocate}.py`, `payments/services/targets/__init__.py`, `features/payments/*allocate*` |
| **A6** | Party roles registry + `?role=` + badges; `parties_relation` + API + UI; archive guards in single and bulk archive; `features/parties/modulePanels.ts` | 9 | — | M | A2 | P | `parties/services/{roles,archive}.py`, `parties/0010`, parties views/urls, `features/parties/{modulePanels.ts,relations/*}` |
| **A16** | Frontend shared primitives: `UbQrCode` → design system; `PrintBranding` → `src/print/`; sales and payments re-pointed; post-login landing on the first visible nav item | — (new) | R33, R49 | M | A10 | F | `src/design-system/UbQrCode/`, `src/print/*`, the print imports in `features/{sales,payments}`, the auth landing |
| **A15** | **Sales value credit lines**: `against_line_id` + exact `taxable_value`, tax copied, value cap, no `returned_qty`/stock movement; GST summary and credit-note register reconciliation tests | — (new) | R51, ADR-057 | M | A16 | F | `sales/services/{credit_note_lines,credit_note_issue}.py`, `sales/models.py` (line), `sales/0004`, `reports/selectors/gst*.py` |
| **A7** | Reminders: source columns, recipient, message group, widened index; candidate and policy registries; `check_reminder_allowed` on every path; `record_source_reminders`; `params`; trade figure; module tabs; window settings | 10 | R9, R10 | L | A2, A6, A10 | P | `ledger/models.py` (`Reminder` only), `ledger/0007`, `ledger/services/{reminder_seam,reminders,auto_reminders}.py`, `features/reminders/*` |
| **A4b** | Held deposits: tables, services (`opening`, `adjust_expected`), `adjustment` mode and its refusals, cashbook exclusion, void pairing, deposits API, deposit guard, deposit components, deposits report | 7 | R4, R12, R24, R35, R36, R37 | L | A4a | F (after A15) | `payments/services/deposits.py`, `payments/0004`, `reports/selectors/cash_sources.py`, `features/payments/deposits/*`; the `PaymentMode` block of `common/constants.py` |
| **A5** | Document port: `common/seams/documents.py`, `SalesIssuer`, origin columns, `tax_code` lines + `code_for_rate`, `kind_for(tenant, None)`, `credit_check`, `override`, `place_of_supply_state`, `apply_credit_note_ids`, `apply_payment_ids`, open advances, `refund_payment`, `check_void` with confirm in `void_invoice` **and** `void_credit_note`, listener calls in `refresh_invoice_amounts` with `ctx`, void-dialog confirm UI, origin badge and filter | 8 | R1, R2, R3, R50, R52, R55, R58, R60, R61, R62 | XL | A4a, A15 | M | `common/seams/documents.py`, `sales/services/{port_issuer,issue,documents,void,amounts,credit_note_apply,payload}.py`, `sales/0005`, `tax/selectors/codes.py`, `features/sales/*void*` |

**Order per track** (critical path is Track M, about 20–29 agent-days):

| Track | Sequence |
|---|---|
| **M** (money) | A14 → A2 → A4a → A5 |
| **P** (platform) | A1 → A12 → A13 → A8 → A9b → A6 → A7 |
| **F** (foundations) | A11 → A9a → A10 → A16 → A15 → A4b |

A14 waits only for A11 (it edits one `ALLOWED` line A11 owns). A4b moves to Track F because Track F
finishes its own work first and A4b's files (`deposits.py`, `cash_sources.py`) do not meet A5's
(`sales/*`, `common/seams/*`).

**Wave A gate.** Every task merged; backend `pytest -q` green; `makemigrations --check` clean;
the architecture tests (import rules with the whole-AST walk, route coverage, error-code equality,
permission registry, `tenant_data` coverage) green; frontend `type-check`, `lint`, `jest`, `i18n:check`
green; `npm run build && npm run bundle:check` with **no `sharedApp` growth** beyond A16's dated
note; replay tests for `balance`, `loan_balance`, `deposit_held`, `held_amount` and the payment
bucket; the golden-file statement regression unchanged for existing tenants; the full e2e regression
(`node e2e/run-regression.mjs -j 3`) green, proving no shop-and-billing behaviour changed; an
independent QA pass over the ledger, payments, sales void and deposits screens at 390 and 1280 px in
English and Hindi; the canon §0.9 CR filed; the owner's Mac fast-forwarded (vision §5).

---

## 3. Wave B — Library first, with the dues and attendance engines

Core heads fixed for Wave B `0001` dependencies: `ledger 0007`, `parties 0010`, `payments 0004`,
`sales 0005`, `platform 0013`.

**Tracks:** **L** Library backend then end-to-end; **D** the dues engine; **T** the attendance
engine, then the library frontend. Library needs **no engine** for its MVP (library.md), so it starts
on the first day of the wave.

### 3.1 Library (`frd/library.md` §Implementation task list)

| Task | What | Size | After | Track |
|---|---|---|---|---|
| B01 | App skeleton, `0001_initial`, import row, env flag | S | Wave A | L |
| B02 | Codenames, error codes, audit actions, canon CR text | S | B01 | L |
| B03 | Settings, preset seed via the enable hook (R15), off-guard, number kinds | S | B02 | L |
| B04 | ISBN and accession helpers | S | B01 | L |
| B05 | Catalogue models, services, API, lookup | M | B03, B04 | L |
| B06 | Membership types and loan rules | S | B03 | L |
| B08 | Due dates over the core calendar | S | B06 | L |
| B10 | Charges and waivers, posting sources, target with `label`, fine calculator | M | B03 | L |
| B07 | Memberships, periods, deposits (opening path, R37), party role, archive guard | M | B06, B10 | L |
| B09 | Loans: issue, return, renew, cancel, change due | M | B05, B07, B08, B10 | L |
| B11 | Holds and expiry job | S | B09 | L |
| B12 | Reminders through `record_source_reminders`, templates, notification types | S | B09, B11 | L |
| B13 | Stock verification | S | B05, B09 | L |
| B14 | Dashboard section | S | B09–B11 | L |
| B15 | Reports and prints | S | B09, B10, B13 | L |
| B16 | Document payloads (card QR, notice, no-dues) | S | B07, B09, B10 | L |
| B17 | Importers (copies, members, books out) | S | B05, B07, B09 | L |
| B18 | Cross-cutting suites: replay, contract, fuzz, `EXPLAIN`, permission matrix | S | B09–B13 | L |
| F01 | Feature skeleton, routes, nav, catalogue, lint zone | S | B01 | T (after ATT) |
| F02 | Library settings page | S | F01, B03, B06, B08 | T |
| F03 | Catalogue screens | M | F01, B05 | T |
| F04 | Members screens and party panel | M | F01, B07 | T |
| F05 | **The counter** | M | F04, B09–B11 | T |
| F06 | Charges UI | S | F04, B10 | T |
| F07 | Holds UI | S | F03, B11 | T |
| F08 | Overdue and reminders | S | F04, B12 | T |
| F09 | Stock check | S | F05, B13 | T |
| F10 | Dashboard section, library home | S | B14 | T |
| F11 | Reports and print sheets | S | B15 | T |
| F12 | Documents; no-product-name test extended | S | B16 | T |
| F13 | Lazy-slice, bundle and i18n gates | S | F02–F12 | T |
| E01–E04 | `e2e/library.mjs`, checks, `--shots` sweep with measuring checks, regression registration | M | F02–F12 | L |

(F00 is done by Wave A tasks A6, A9b, A10 and A16.)

### 3.2 Dues engine (`frd/00-core-and-engines.md` Part B)

| Task | What | FRD 00 # | Size | After | Track |
|---|---|---|---|---|---|
| DUE-01 | Schema (heads tables, typed snapshot, penalty cache, R16, R17), plans, schedules, preview, backdated confirm, subject registry (`line_hook`, `own_reminder_source`), read API | 16 | L | Wave A | D |
| DUE-02 | Daily run: ledger posting, then document posting (origins `dues_due`, `dues_adjustment`), catch-up fuzz; `skip` keeps count (R44) | 17 | L | DUE-01 | D |
| DUE-03 | Targets `dues_due` and `dues_instalment`, settlement split with the three orders, `plan_allocation`, `payoff`, origin listener, advance auto-apply (skips earmarks), replay fuzz, `recalc_dues` | 18 | L | DUE-02 | D |
| DUE-05 | Pause, resume, reschedule with `post_now`/`carry_settlements` (R39) | 20 | M | DUE-02 | D |
| DUE-04 | Penalties (incl. `none` plans, R46), waivers (role ceiling), `reverse_adjustment` (R45), document-mode adjustments (R22), end (incl. `written_off`, R38), cancel, settlement slip | 19 | L | DUE-03 | D |
| DUE-06 | Selectors (`arrears` with `fees_overdue`, R41), read endpoints, reminder source, reports, guards, party panel | 21 | M | DUE-03, A7 | D |

### 3.3 Attendance engine (FRD 00 Part C)

| Task | What | FRD 00 # | Size | After | Track |
|---|---|---|---|---|---|
| ATT-01…05 | Schema (with R18 fields), groups and sessions, check-in/out with policy, override and dedupe (R59), session check-in (R57), roll-call, edit, void, entitlements with `extend`/`end` and replay, reads and reports, off-guard counting earlier days only (R56), shared UI, test subject | 15 | XL | Wave A | T |

### 3.4 Wave B gate

Engine suites green with the test-only subject and **no vertical present** (10-architecture §11);
dues replay fuzz (settlements, penalties) and entitlement replay green; library unit suite, contract
and replay suites green; `e2e/library.mjs` green against a live stack with `UB_UNRELEASED_MODULES=1`,
and its `--shots` sweep clean on both measuring checks at four widths; `EXPLAIN` tests for the counter
lookup and the overdue list; full regression green; bundle `sharedApp` unchanged; an independent QA
agent over the library at 390 and 1280 px in English and Hindi; owner's Mac fast-forwarded.
**Library release** (T-R1…T-R3, library.md) follows only after the owner's UAT and the release CR.

---

## 4. Wave C — Gym, then Lending

Core heads fixed at Wave B's close, plus `dues 00NN` and `attendance 00NN` latest.

**Tracks:** **G** gym (backend and frontend per task, as gym.md writes them); **N** lending; **Q** the
library release work and fixes from Wave B's UAT, then e2e support for G and N. Gym has priority: if
only two tracks are free, lending waits.

### 4.1 Gym (`frd/gym.md` §Implementation task list; sized here)

| Task | What | Size | After |
|---|---|---|---|
| TSK-GYM-01 | App skeleton, off-guard (terms) | S | Wave B gate |
| TSK-GYM-02 | Codenames, staff/accountant sets, `gym_trainer` role row (data migration in `gym`) | S | 01, A13 |
| TSK-GYM-03 | Settings (`register_setting_spec`) + presets (plans, desk and PT groups) | M | 01, ATT |
| TSK-GYM-04 | Pure term engine and worked examples | M | A9a |
| TSK-GYM-05 | Members, member code, relations, roles, archive guard, photo, list, page, panel | L | 02, A6, A8 |
| TSK-GYM-06 | Privacy fields and guards | M | 05 |
| TSK-GYM-07 | Enquiries, follow-ups, convert, purge | M | 05, A10 |
| TSK-GYM-08 | Plans (tax-code picker, R2) | M | 03 |
| TSK-GYM-09 | Sale through the port; origin listener with `check_void` confirm (R55) | L | 04, 08, A5 |
| TSK-GYM-10 | Renewal and rejoin | M | 09 |
| TSK-GYM-11 | Instalments as charge/document dues (R53) | M | 09, DUE-06 |
| TSK-GYM-12 | Freeze and resume; `extend_entitlement` (R18) | M | 09 |
| TSK-GYM-13 | Extensions and closures | S | 12, A9b |
| TSK-GYM-14 | Check-in: resolver, policy, mark listener, desk screen | L | 09, 12, ATT |
| TSK-GYM-15 | Card and QR (uses `UbQrCode` from A16), `UbCameraScanner` | M | 05, 14 |
| TSK-GYM-16 | Batches and roll-call (R57) | M | 14 |
| TSK-GYM-17 | Upgrade and downgrade: value credit notes (R51), `apply_credit_note_ids` (R50) | L | 11, 12, A15 |
| TSK-GYM-18 | Transfer (`end_entitlement`) | M | 17 |
| TSK-GYM-19 | Cancel and refund (owner-only; `refund_payment`, R52) | M | 17 |
| TSK-GYM-20 | Trainer scope, restricted fields, PT sessions | L | 14, 16, A13 |
| TSK-GYM-21 | Reminders (`params`, R10) | M | 10, A7 |
| TSK-GYM-22 | Dashboard sections | M | 11, 14 |
| TSK-GYM-23 | Reports | M | 22 |
| TSK-GYM-24 | Frontend shell, lint zone, lazy slices | M | alongside 05 onward |
| TSK-GYM-25 | `e2e/gym.mjs` and sweep | L | all above |
| TSK-GYM-26 | Core follow-up: ID-number text guard for core free text (separate owner, after the wave) | S | — |
| TSK-GYM-27 | Release CR | S | owner sign-off |

### 4.2 Lending (`frd/lending.md` §D)

| Task | Size | After | Note |
|---|---|---|---|
| TSK-LEN-01 skeleton | M | Wave B gate | |
| TSK-LEN-02 agent role, scoping, codenames (`lending.borrower.reveal`, R70) | M | 01, A13 | canon CR |
| TSK-LEN-03 settings (`register_setting_spec`, R43) | S | 01, A7, A10 | |
| TSK-LEN-04 borrower, roles, archive guard, panel | M | 01, A6 | |
| ~~TSK-LEN-05~~ | — | — | done by A16 |
| TSK-LEN-06 calculator and effective rate | L | A9a, DUE-01 | |
| TSK-LEN-07 preview endpoint and Terms step | M | 06 | |
| TSK-LEN-08 loan create, disbursal, targets, sources (no `lending_charge`, R40) | L | 04, 07, DUE-03 | |
| TSK-LEN-09 loan list and page, `loan_ledger` over public ledger helpers (R48) | M | 08 | |
| TSK-LEN-10 collections | L | 08, DUE-03 | |
| TSK-LEN-11 replay test, `loan_balance` check | M | 10 | |
| TSK-LEN-12 routes, `lending_route_agent` (R42), scoping | M | 02, 08 | |
| TSK-LEN-13 Today, My day, arrears (R41), visits | M | 10, 12 | |
| TSK-LEN-14 late fees, reversals, waivers | M | DUE-04 | |
| TSK-LEN-15 closure (R38, R39) | L | 10, 14, DUE-05 | |
| TSK-LEN-16 documents | L | 10, 15, A16 | |
| TSK-LEN-17 reminders (`lending_loan` source, guarantor arm, R9, R10) | M | A7 | |
| TSK-LEN-18 dashboard and reports | M | 10, 13, A10 | |
| TSK-LEN-19 legal-guardrail tests | S | 01–18 | |
| TSK-LEN-20 navigation, agent landing (A16) | S | A1, 13 | |
| TSK-LEN-21 e2e and sweep | L | all above | |
| TSK-LEN-22 release CR | S | lending.md §B blocking items | lawyer and CA |

### 4.3 Wave C gate

As Wave B's, plus: gym's term-engine worked examples and the upgrade example to the paisa (value
credits); the trainer and agent scope tests (404 for out-of-scope ids, 403 on engine reads, who is
signed in asserted first); lending's Σ-schedule invariant fuzz, the replay property test and the
legal-guardrail tests; reminder window and cap tests on every path; both harnesses green with their
sweeps; full regression green; bundle unchanged; independent QA of both modules; owner's Mac
fast-forwarded. Lending's release additionally waits for the lawyer and CA items marked "Blocks
release" in lending.md §B.

---

## 5. Wave D — Bookings engine, then Hospitality

**Tracks:** **K** the bookings engine, then hospitality backend; **X** the Wave D core tasks, then
hospitality backend tasks that do not touch the engine; **H** the hospitality frontend.

### 5.1 Wave D core tasks (core code, built by track X)

| Task | What | Resolutions | Size | After | Owns |
|---|---|---|---|---|---|
| D-core-1 | Item read port `common/seams/items.py`, registered by inventory | R63 | S | Wave C gate | `common/seams/items.py`, `inventory/apps.py`, `inventory/selectors/port.py` |
| D-core-2 | `tax_room_slab`, `room_slab_code` selector, seed per the CA's TL-1 | R67 | S | Wave C gate | `tax/models.py` (slab), `tax/0003_room_slab`, `tax/selectors/room_slab.py` |

### 5.2 Bookings engine (FRD 00 Part D)

| Task | What | FRD 00 # | Size | After |
|---|---|---|---|---|
| BKG-01 | Schema (slot `varchar(32)`, R21; statuses, no-show, slots fields, R19), resources, shifts, out of service with `end_out_of_service` (R65) | 22 | M | Wave C gate |
| BKG-02 | Availability and grid | 23 | M | BKG-01 |
| BKG-03 | Hold, book (with `number`, R20), confirm, slot rule with seat ordinals, lazy expiry, concurrency suite | 24 | L | BKG-02 |
| BKG-04 | Change, `add_unit`, `split_unit` (R64), check-in/out, `undo_check_in`, cancel, no-show, pure fee rule over passed tiers (R19) | 25 | M | BKG-03 |
| BKG-05 | Integrity check, day sheet, guards, party panel | 26 | S | BKG-03 |

### 5.3 Hospitality (`frd/hospitality.md` §Implementation task list; sized here)

| Task | Size | After | Track |
|---|---|---|---|
| HTL-T02 skeleton | S | Wave C gate | X |
| HTL-T03 rooms, types, beds (`0001` depends on `bookings 0001`) | M | T02, BKG-01 | K |
| HTL-T04 housekeeping, board, `hospitality_housekeeping` role | M | T03, A13 | K |
| HTL-T05 rate plans, seasons, slab decision | L | T03, D-core-2 | X |
| HTL-T06 reservations, numbers, guest role | L | T05, BKG-03 | K |
| HTL-T07 calendar and availability | M | T06 | K |
| HTL-T08 advances (earmarked, R61), refunds, deposits | M | T06 | X |
| HTL-T09 folio (item port, R63) | L | T06, D-core-1 | X |
| HTL-T10 check-in, occupants, `undo_check_in` | L | T09, BKG-04 | K |
| HTL-T11 Form III | M | T10 | X |
| HTL-T12 walk-in | S | T10 | K |
| HTL-T13 early/late, extension, shorten, move (`split_unit`) | M | T10, BKG-04 | K |
| HTL-T14 check-out through the port (R60–R62) | XL | T08, T09, T13 | K |
| HTL-T15 cancellation and no-show (tiers passed, R19) | M | T14 | X |
| HTL-T16 day close | S | T14 | X |
| HTL-T17 dashboard, Today | M | T14 | X |
| HTL-T18 reports | M | T14, T15 | X |
| HTL-T19 documents | M | T14 | X |
| HTL-T20 settings, presets, guards | M | T06, T08, T09 | X |
| HTL-T21 retention purge, notice | M | T10 | X |
| HTL-T22 frontend foundations | M | T02 | H |
| HTL-T23 frontend screens | XL | each backend task | H |
| HTL-T24 e2e and sweep | L | T23 | H |
| HTL-T25 concurrency and `EXPLAIN` suites | M | T14, T07 | K |
| HTL-T26 Part 21/22 docs, Part 43 CRs | S | T14 | X |
| HTL-T27 release | S | owner's CR, CA and lawyer items | — |
| HTL-T28 BACKLOG entry (OTA channel manager) | S | — | X |

### 5.4 Wave D gate

As Wave C's, plus: the bookings concurrency suite (two writers, 20 runs in a row, never a double
sale; shared capacity bounded by the unique index); the twelve check-out tax examples to the paisa
(per-night slab, CGST + SGST at the tenant's state); the ADR-053 tests (nothing longer than four
characters stored, `reveal` required, never to housekeeping or accountants); the retention purge test;
full regression; independent QA; owner's Mac fast-forwarded. Hospitality's release waits for the CA
and lawyer items TL-1…TL-24 marked for release.

---

## 6. After each wave

The vision §5 gate: work committed; docs updated (`STATUS.md`, `HANDOFF.md`, Part 22 error codes,
Part 21 tables, Part 43 CRs through the Project); the owner's Mac fast-forwarded and verified; a
handoff with a stand-up and contact sheets at 390 and 1280 px, English and Hindi. A module leaves
`UNRELEASED_MODULES` only by its release CR after the owner's UAT.
