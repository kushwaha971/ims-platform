# Wave B — Track D (dues engine) progress

Owner: Track D developer (backend, plus the engine's shared UI). Branch `wave-b/track-d`, worktree
`/home/claude/wt/track-d` (made with `scripts/worktree-bootstrap.sh track-d`), test database
`UB_TEST_DB_NAME=test_ub_track_d`.

Sequence (plan §3.2): **DUE-01 → DUE-02 → DUE-03 → DUE-05 → DUE-04 → DUE-06** (DUE-06 also waits
for A7, which is merged).

Binding inputs read for this step: `CLAUDE.md`; `HANDOFF.md` §8i, §8k; `12-implementation-plan.md`
§1 and §3.2; `10-architecture.md` §2.2, §3, §4, §5, §8, §10, §11, §17 (R16, R17, R22, R38, R39,
R41, R44, R45, R46, R53, R54, R61, R10, R25); `11-contracts.md` v1 §1.2, §1.4, §1.5, §1.6, §1.8,
§1.9, §2.1, §4, §5; `13-owner-questions.md`; FRD 00 Part B (DUE-01…06), §I, §D and §C; ADR-041…062
(ADR-047, ADR-048, ADR-055, ADR-059 in particular). Code read at `560217e` on `dev`.

Owner-question defaults in use (13-owner-questions.md): **Q4** lending allocation order `fees_last`
(the plan default stays `oldest_first`, FRD DUE-01 §5; lending's preset sets `fees_last`);
**Q5** no reminder window outside lending; **Q6** dues plans grace 0; **Q16/T7** gym instalments
stay split invoicing (ADR-059, R53) — no third settlement path.

**Status of this step: review only. No code has been written and no gate has been run** (no
packages are installed in this session, so nothing here has been executed; every claim below is
from reading the code, with the file and function named).

## Status

| Task | State |
|---|---|
| DUE-01 plans, schedules, preview, backdated confirm, subject registry, read API | **built — ready for QA** (see "Built" under DUE-01) |
| DUE-02 daily run (ledger, then document posting), catch-up fuzz, `skip` keeps count | design written; not started |
| DUE-03 targets, settlement split, `plan_allocation`, `payoff`, origin listener, advances, replay, `recalc_dues` | design outline written; not started |
| DUE-05 pause, resume, reschedule | not started |
| DUE-04 penalties, waivers, `reverse_adjustment`, document-mode adjustments, end, cancel, slip | not started |
| DUE-06 selectors, read endpoints, reminder source, reports, guards, party panel | not started |

## Verified starting state

- **Migration heads** (the Wave B `0001` dependencies, plan §3) are exactly as the plan says:
  `ledger 0007_reminder_source`, `parties 0010_party_relation`, `payments 0004_held_deposit`,
  `sales 0005_document_origin`, `platform 0013_closed_day` (`apps/platform_app` has
  `label = "platform"`, `apps/platform_app/apps.py:18`). `tax` is at `0002`; dues needs no `tax`
  dependency (it stores a `tax_code` string, not a FK).
- **No `apps/dues` exists.** The import matrix already declares it:
  `ALLOWED["dues"] == CORE` (`tests/architecture/test_import_rules.py`, the A11 block), checked by
  the whole-AST walker on every file under `apps/dues/` **including migrations and excluding
  `tests/`** (`_new_app_files`). So dues may import `common`, `platform_app`, `tax`, `files`,
  `parties`, `ledger`, `payments`, `notifications`, and nothing of `sales`, `reports`, `imports`,
  any engine or any vertical, deferred or not. `test_the_matrix_covers_every_app_on_disk` already
  admits the folder.
- `ENGINES_USED_BY` (`apps/platform_app/services/tenant_settings.py:60-65`) and
  `ENGINE_READ_PERMISSIONS["dues"]` (`apps/common/permissions_registry.py:73-78`) are in place
  from A12; `EngineEnabled`, `HasEngineReadPermission` and `readable_engine_modules` exist in
  `apps/common/permissions.py:172-248`.
- `due_not_open` is **already registered** (A7 block, `apps/common/error_codes.py:200`; the A7
  reminder path raises it, `apps/ledger/services/reminders.py:478-496`). DUE-01 adds only
  `schedule_backdated_unconfirmed`; the other dues codes arrive with the task that raises them.
- There is no `backend/tests/fixtures/` directory, and there **cannot be one** as 10-architecture
  §11 names it: `backend/tests/fixtures.py` is a module that both conftests star-import (C-1 below).

---

## DUE-01 — Plans and schedules (FRD 00 #16, contracts §2.1, R16, R17, R44, R54, R10)

### Design note (review step)

#### Inputs

Contracts §2.1 (tables, `create_plan`, `update_plan`, `preview_schedule`, `create_schedule`,
`register_subject`), FRD DUE-01 §1–§13 (BR-1…BR-10, the worked examples, T-DUE-01-1…8,
EC-1…EC-5), R16 (no money in jsonb: heads tables, typed snapshot), R17 (`penalty_amount`,
`penalty_exempt_days`, settlements for every mode), R44 (`skip` keeps the count), R54
(`line_hook`), R10 (`own_reminder_source`), ADR-048 (modes, 24-month window, statuses), ADR-055
(typed recurrence), ADR-041 (no write endpoints in an engine).

#### What the engine calls (verified)

| Need | Real API | Where |
|---|---|---|
| Recurrence | `Recurrence` (frozen, `kw_only`), `occurrences(rule, *, start, end, limit=1000)`, `next_occurrence`, `period_after(rule, occurrence) -> Period`, `validate_recurrence(rule) -> dict` | `apps/common/recurrence.py:45-245` |
| Persisted rule | `RecurrenceFields` abstract model, `.recurrence`, `.set_recurrence()`, six CHECKs named `%(app_label)s_%(class)s_<suffix>` | `apps/common/db/recurrence.py` (**not** `common/models.py`, per Track F's note) |
| Periods | `Period(start, end)` `[start, end)`, `.days`, `period_label(period, *, style, locale)` styles `month`/`range`/`quarter`/`fy`/`day` | `apps/common/periods.py:39-120` |
| Rounding | `round_amount(value, rule)`, `split_total(total, parts, *, rule)` (last absorbs; refuses negatives) | `apps/common/money.py:97-150` |
| Calendar | `closed_days_between(tenant, start, end, *, module=None) -> set[date]` (one query, inclusive), `next_open_day(tenant, on, *, module=None)` | `apps/platform_app/services/calendar.py:137-167` |
| Party lock | `lock_party(*, tenant, party_id) -> Party | None` (`SELECT … FOR UPDATE`, tenant-scoped) | `apps/parties/services/balance.py:31` |
| Ledger posting | `post_source_entry(*, ctx, party, amount, entry_date, entry_type, source_type, source_id, note="", …, bucket="main") -> (entry, balance)`; refuses `amount <= 0`, an unregistered `(source_type, entry_type)`, a bucket the source did not register, and a call outside a transaction; idempotent by `(source_type, source_id, entry_type)` via `standing_source_entry` | `apps/ledger/services/postings.py:205-284` |
| Posting registry | `register_posting_source(source_type, *, module, entry_types, buckets)` (≤ 32 chars; direction must equal `POSTABLE_ENTRY_DIRECTIONS`; idempotent; `_reset_for_tests`) | `postings.py:96-175`, `apps/ledger/constants.py` (`CHARGE` debit, `ADJUSTMENT_CREDIT` credit, `INTEREST` debit) |
| Document port | `issuer_available(tenant)`; `issue_document(*, ctx, request)` raising `ModuleDisabled(details={"module": "sales"})` | `apps/common/seams/documents.py:218-234` |
| Tax code check | `code_exists(*, tenant, code) -> bool` | `apps/tax/selectors/rates.py:47` |
| Engine reads | `EngineEnabled("dues")`, `HasEngineReadPermission("dues")`, `readable_engine_modules(request, "dues") -> frozenset[str]` | `apps/common/permissions.py:172-248` |
| Enablement | `effective_modules(tenant)`, `engine_enabled`, `enabled_modules_using` | `apps/platform_app/services/entitlements.py` |
| Errors | `BusinessRuleViolation(code, message, *, details=None)`, `ValidationFailed(details)`, `NotFound`, `ModuleDisabled` | `apps/common/exceptions.py:25-118` |
| Audit | `write_audit(*, ctx, action, entity_type, entity_id, before, after, metadata)` | `apps/common/audit.py:271` |
| Tenant data | `tenant_data.register(TenantTable(model=…, …))`, deletion order derived from FKs | `apps/common/tenant_data.py:97, 168` |
| Dates | `tenant_today(tenant)` (tenant's `timezone`, default `Asia/Kolkata`) | `apps/common/dates.py:23` |
| Context | `Ctx.system(tenant)` for jobs | `apps/common/context.py:64` |

#### App skeleton (files DUE-01 owns)

`backend/apps/dues/`: `__init__.py`, `apps.py` (`DuesConfig`, `name="apps.dues"`, `label="dues"`),
`constants.py`, `models.py`, `migrations/0001_initial.py`, `registry.py`,
`services/{plans,schedules,preview,materialise,posting}.py`, `selectors/{dues,schedules}.py`,
`serializers.py`, `views.py`, `urls.py`, `tenant_data.py`, `tests/`.
Shared hot files touched, append-only in a `# ── dues ──` / `# ── DUE-01 ──` block (plan §1.3):
`config/settings/base.py` (`"apps.dues"` after `"apps.help"`), `config/urls.py`
(`path("dues/", include("apps.dues.urls"))`), `apps/common/error_codes.py`
(`schedule_backdated_unconfirmed`), `apps/common/audit.py` (`AuditAction` dues constants),
`docs/22-api-specification.md` §22.1.1 (one row). Frontend (see §7 below): `features/dues/**`,
`locales/catalogues/dues.{en,hi}.json` and one `catalogues.json` prefix line.

#### Tables (migration `apps/dues/migrations/0001_initial.py`)

`dependencies = [("ledger", "0007_reminder_source"), ("parties", "0010_party_relation"),
("payments", "0004_held_deposit"), ("sales", "0005_document_origin"), ("platform",
"0013_closed_day")]` (plan §3; strings, so the import walker is untouched). Every table extends
`TenantModel` (`apps/common/models.py:21`), money is `MoneyField` (`apps/common/db/fields.py:78`,
`numeric(14,2)`). **All nine tables land in `0001`** (FRD DUE-01 §5: "all tables of the engine are
specified once"), so later tasks add migrations only for indexes their `EXPLAIN` tests need.

- **`dues_plan`** (`DuesPlan(TenantModel, RecurrenceFields)`) — contracts §2.1 columns and FRD §5
  types: `module varchar(32)`, `name varchar(80)`, `mode varchar(12)`, `posting varchar(8)`,
  recurrence columns, `amount_rule varchar(12)`, `amount`/`total` nullable money,
  `split_weights numeric(9,4)[] default '{}'`, `join_policy varchar(14) default 'full'`,
  `leave_policy varchar(12) default 'no_refund'`, `grace_days smallint default 0`,
  `penalty_kind varchar(16) default 'none'`, `penalty_value numeric(10,4) null`, `penalty_cap`
  money null, `pause_max_days`/`pause_min_days`/`pause_max_count smallint null`,
  `hsn_sac varchar(8) null`, `tax_code varchar(16) null`, `tax_inclusive bool default false`,
  `rounding_rule varchar(8) default 'rupee'`, `allocation_order varchar(12) default
  'oldest_first'`, `auto_apply_advance bool default true`, `closed_day_rule varchar(8) default
  'ignore'`, `is_active bool default true`, `version int default 1`.
  CHECKs (FRD §5): mode/posting pairing; taxable ⇒ `document`; `amount_rule='fixed'` ⇒ `amount`;
  `total_split` ⇒ `total`; `(penalty_kind='none') = (penalty_value IS NULL)`; `amount >= 0`,
  `total > 0`, `penalty_cap >= 0`; plus enum CHECKs for every `varchar` vocabulary (the existing
  apps' habit, e.g. `ck_ledger_entry_*`). Unique `uq_dues_plan_name (tenant_id, module,
  lower(name)) WHERE is_active`; index `ix_dues_plan_module (tenant_id, module, is_active)`.
  **`Meta.constraints` must spread `*RecurrenceFields.Meta.constraints`** — a child `Meta` replaces
  the mixin's list (`apps/common/db/recurrence.py` docstring), and
  `test_every_concrete_model_with_the_mixin_carries_every_check`
  (`apps/common/tests/test_recurrence_fields.py:105`) becomes binding the moment this model exists.
- **`dues_plan_head`** — `plan` FK CASCADE, `seq smallint`, `label varchar(60)`, `amount` money
  `CHECK >= 0`; unique `(plan_id, seq)`. R16: no money in jsonb.
- **`dues_schedule`** (`DuesSchedule(TenantModel, RecurrenceFields)`) — `module`, `plan` FK
  RESTRICT, `party` FK `parties.Party` RESTRICT `related_name="+"`, `beneficiary_party` FK RESTRICT
  null `related_name="+"`, the **typed snapshot** (R16): recurrence columns, `amount`, `total`,
  `grace_days`, `penalty_kind`, `penalty_value`, `penalty_cap`, `allocation_order`,
  `closed_day_rule`, `rounding_rule` (FRD adds it), and — **additive, see C-6** — `mode` and
  `posting` as typed columns; `terms jsonb default '{}'` for the remaining non-money policy strings
  (`amount_rule`, `join_policy`, `leave_policy`, pause limits, `hsn_sac`, `tax_code`,
  `tax_inclusive`, `auto_apply_advance`, `split_weights` as strings); `subject_type varchar(48)`,
  `subject_id uuid`, `start_on date`, `end_on date null` (exclusive), `status varchar(10) default
  'active'`, `ended_reason varchar(160) default ''`, `materialised_until date`, `version int`.
  Unique `uq_dues_schedule_live_subject (tenant_id, subject_type, subject_id) WHERE status IN
  ('active','paused')`; indexes `ix_dues_schedule_party (tenant_id, party_id, status)`,
  `ix_dues_schedule_module (tenant_id, module, status)`, `ix_dues_schedule_window (tenant_id,
  materialised_until) WHERE status IN ('active','paused')`; CHECK `end_on IS NULL OR end_on >
  start_on`.
- **`dues_schedule_head`** — same shape as the plan's, under `schedule_id`; copied at creation.
- **`dues_due`** — `schedule` FK RESTRICT, `module`, `party` FK RESTRICT (copied, never changed),
  `seq int`, `period_start`, `period_end`, `period_label varchar(40)`, `due_on`, `amount`,
  `status varchar(10) default 'scheduled'`, `settled_amount`, `waived_amount`, `penalty_amount`
  (R17), `penalty_exempt_days smallint` (R17), `paid_on date null`, `document_id uuid null`,
  `posted_entry_id uuid null`, `cancel_reason varchar(160) default ''`. CHECKs exactly FRD §5
  (`settled + waived <= amount + penalty`, `period_end > period_start`, not both document and
  entry, `status <> 'paid' OR paid_on IS NOT NULL`, all money `>= 0`). Unique
  `uq_dues_due_seq (schedule_id, seq)`; indexes `ix_dues_due_status (tenant_id, status, due_on)`,
  `ix_dues_due_party (tenant_id, party_id, due_on)`, `ix_dues_due_module (tenant_id, module,
  status, due_on)`, `ix_dues_due_open_party (tenant_id, party_id, due_on, seq) WHERE status IN
  ('due','overdue')`.
- **`dues_due_component`**, **`dues_adjustment`** (with FRD's `document_id uuid null` — R22 needs
  it, contracts omit it), **`dues_pause`** (with FRD's `resumed_on`), **`dues_settlement`**
  (`payment_id uuid`, no FK — payments is below dues but a FK to `payments_payment` would put a
  RESTRICT on a table whose rows payments voids; uuid follows contracts) — all as FRD §5, unused
  until DUE-02…05 but created now.

`version` columns: plan and schedule (two people can edit them, 10-architecture §5 rule 8;
`StaleVersion`, `apps/common/exceptions.py:94`).

#### Services (contracts §2.1 signatures, verbatim)

- `create_plan(*, ctx, module, data) -> Plan` (`services/plans.py`) — BR-1: `module` in
  `effective_modules(ctx.tenant)` and in `enabled_modules_using(tenant, "dues")`, else
  `ModuleDisabled(details={"module": module})`; BR-2: `posting='document'` needs
  `issuer_available(tenant)` else 403 `module_disabled` with `details.module="sales"`; a taxable
  plan (`tax_code` or `hsn_sac`) must be `document` (400 `validation_error`), and `tax_code` must
  pass `code_exists`; recurrence validated by `validate_recurrence`; heads: Σ = `amount` for a
  `fixed` plan (400 on `heads`); `total_split` needs a bound (`count`, `explicit_dates` or
  weights). Audit `dues.plan.created`.
- `update_plan(*, ctx, plan_id, data) -> Plan` — `version` check, affects new schedules only
  (schedules hold their snapshot, BR-3); deactivate = `is_active=False` (EC-2). Audit
  `dues.plan.updated`.
- `preview_schedule(*, tenant, plan, start_on, end_on=None, supplied=None, join_on=None) ->
  list[DuePreview]` — pure over the plan (or a schedule snapshot) plus one calendar read; used by
  `create_schedule` so the 409's preview and what is written are one computation (BR-7).
- `create_schedule(*, ctx, module, plan_id, party_id, subject_type, subject_id, start_on,
  end_on=None, beneficiary_party_id=None, supplied=None, confirm_backdated=False) -> ScheduleResult`
  — order: subject registered for `subject_type` and its module equals `module` (else
  `ImproperlyConfigured` — ADR-042 "a 500 in tests"); `lock_party` (None → `NotFound`; archived →
  409 `party_archived`, EC-4, the code sales already uses at `apps/sales/services/issue.py:126`);
  plan active and same module (BR-1); snapshot (BR-3) into the schedule and its heads; materialise
  the window (BR-4); if any due has `due_on < today` and not `confirm_backdated` → 409
  `schedule_backdated_unconfirmed` `details={"dues": [DuePreview…], "total": "4800.00"}` **raised
  before any row is written** (the preview is computed first); then insert and post every due with
  `due_on <= today` (C-10, C-11). Audit `dues.schedule.created` (+ `dues.due.posted` per posted
  due). `ScheduleResult` = `{schedule, dues, posted: [due ids], warnings}`.

Materialisation (`services/materialise.py`, shared with DUE-02's step 1):
`materialise(*, schedule, through: date)` computes occurrences in `[from, through]` with **one**
`occurrences()` call and **one** `closed_days_between()` call over the window (never per due),
applies the join policy to the first period only (BR-6), the amount rule (BR-5: `fixed`;
`total_split` via `split_total(total, count or weights, rule=rounding_rule)`; `supplied` validated
one per occurrence or defining the dates, components summing to each amount), the subject's
`amount_hook` (BR-9), and `closed_day_rule` (`move` → next open day in the already-read set;
`skip` → `status='skipped'`, and for a count-bound rule the series is read with `count=None` and
stops when `count` **non-skipped** dues exist, R44; `ignore`). Period = `period_after(rule,
occurrence)`; label = `period_label(period, style=<derived>, locale=tenant.locale)` (C-8).
`materialised_until` = the horizon `min(today + 24 months, end of a fixed plan)` (C-9).

Posting (`services/posting.py`): `post_due(*, ctx, due) -> Due` — **the one posting routine**
(FRD DUE-02 §6). DUE-01 builds the `charge/ledger` branch and the zero-amount branch (BR-10: no
call to `post_source_entry`, which refuses `amount <= 0`; status `paid`, `paid_on = due_on`); the
`document` and `expectation` branches arrive in DUE-02 (C-10). Ledger branch:
`post_source_entry(ctx=ctx, party=<locked>, amount=due.amount, entry_date=due.due_on,
entry_type=EntryType.CHARGE, source_type="dues_due", source_id=due.id, note="<subject label> ·
<period label>", bucket="main")`; `posted_entry_id` set; status `due`, or `overdue` when
`due_on + grace_days < today` (catch-up). Conditional update (`filter(status='scheduled')`) so a
second call is a no-op on top of the ledger's own idempotency.

Posting sources registered in `DuesConfig.ready()` (contracts §1.2 table, verbatim):
`dues_due` `{charge: debit}` `{main}`; `dues_component` `{interest: debit, charge: debit}`
`{loan}`; `dues_adjustment` `{charge: debit, adjustment_credit: credit}` `{main, loan}`, all with
`module="dues"`. Registering all three now costs nothing and makes a wrong shape a start-up error
from day one.

#### Registry (`apps/dues/registry.py`)

`register_subject(subject_type, *, module, label, on_due_changed=None, amount_hook=None,
line_hook=None, own_reminder_source=False, reminder_template_key)` — contracts §2.1 verbatim.
Keyed by `subject_type` (≤ 48, the column), idempotent for an equal registration, a different one
under a used key is `ImproperlyConfigured` (the `register_target` rule,
`apps/payments/services/targets/__init__.py:139-163`); `subject_for(subject_type)`,
`registered_subjects()`, `_reset_for_tests()` snapshotting on first call (the `postings.py:164`
pattern). The label callable is `(ids) -> {id: label}` with no tenant (contracts); the engine only
ever passes ids read from the caller's tenant.

#### Selectors and read API

`selectors/dues.py`: `dues_queryset(tenant, *, modules)` (always `module__in=` the readable set),
`with_outstanding()` (annotation `amount + penalty_amount − waived_amount − settled_amount`),
`totals(qs) -> {outstanding, overdue}`. `selectors/schedules.py`: `schedule_detail(tenant, id, *,
modules)`. Subject labels batched per page per `subject_type` (one call each, the
`resolve_sources` pattern, `apps/ledger/selectors/sources.py:47-61`); party names in the same query
(`select_related`).

`views.py` — `TenantScopedReadOnlyViewSet` subclasses (`apps/common/viewsets.py:85`),
`permission_classes = [IsAuthenticated-equivalent, EngineEnabled("dues"),
HasEngineReadPermission("dues")]` in the canonical order (`apps/common/permissions.py:1-5`), queryset
filtered by `module__in=readable_engine_modules(request, "dues")`:

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/dues/schedules/{id}` | schedule with `dues[]`, `pauses[]`; a schedule of another tenant or of an unreadable module is 404 |
| GET | `/api/v1/dues/dues` | filters `party_id`, `module`, `status` (csv), `due_from`, `due_to`, `subject_type`, `subject_id`; `CursorPagination` (`apps/common/pagination.py:42`) keyed `(due_on, seq, id)`; `meta.totals {outstanding, overdue}` over the filtered set; 400 on a bad filter |

`Due` shape as FRD §6, **without `late_fee_so_far`** until DUE-04 can compute it (C-12). No
codenames are added: engine writes have none (10-architecture §5), reads use
`ENGINE_READ_PERMISSIONS`.

#### Error codes, audit actions

- New: `schedule_backdated_unconfirmed` (409, D `dues`, `total`) in a `# ── DUE-01 ──` block of
  `apps/common/error_codes.py`, its Part 22 row, and the count in
  `apps/common/tests/test_exceptions.py` (166 → 167; C-17).
- Reused: `validation_error`, `module_disabled`, `party_archived`, `not_found`, `stale_version`.
- Audit (contracts §5): `DUES_PLAN_CREATED = "dues.plan.created"`, `DUES_PLAN_UPDATED`,
  `DUES_SCHEDULE_CREATED`, `DUES_DUE_POSTED`; the rest are declared by the task that writes them.

#### Tenant data

`apps/dues/tenant_data.py` registers all nine tables; deletion order comes from the FKs
(`deletion_order`, Kahn over FKs, `tenant_data.py:168`), so `dues_*` precede `parties_party`.
`dues_settlement.payment_id` has no FK; it is deleted with its due. The coverage test
(`unregistered_tenant_models`) binds from the first model.

#### The test-only subject (10-architecture §11)

`backend/tests/engine_subjects/__init__.py` (empty) + `backend/tests/engine_subjects/dues.py`
(C-1: the documented path collides with `tests/fixtures.py`). A fixture `dues_test_subject` that:
calls `registry._reset_for_tests()`, `postings._reset_for_tests()` and
`documents._reset_for_tests()` before and after; registers `subject_type="test_subject"`,
`module="test"`, `label=lambda ids: {i: f"Subject {str(i)[-4:]}" for i in ids}`, a recording
`on_due_changed`, `reminder_template_key="test_due"`; entitles the tenant to module `test` on
plan, partner and `enabled_modules` (the `_entitle` helper of
`apps/platform_app/tests/test_engine_enablement.py:45-58`, which proves `effective_modules`
accepts an arbitrary code); `monkeypatch.setattr(tenant_settings, "ENGINES_USED_BY", {..., "test":
frozenset({"dues"})})`; `monkeypatch.setitem(ENGINE_READ_PERMISSIONS, "dues", {"test":
"parties.party.read"})` (the A12 test's technique, `test_engine_enablement.py:168-196`). No
vertical app exists or is imported; the Wave B gate requires exactly that (plan §3.4).

#### Tests to write first (each names the defect it prevents)

| Test | Defect it prevents |
|---|---|
| `test_plan_checks_refuse_taxable_ledger_and_expectation_document` (T-DUE-01-1, DB-level `IntegrityError` and service-level 400) | a taxable fee posted as a raw ledger line, which is not a tax invoice (ADR-045) |
| `test_every_recurrence_check_survives_on_plan_and_schedule` | a child `Meta` silently dropping the mixin's six CHECKs |
| `test_preview_reproduces_the_worked_examples` (fixed 4 × 120000 p = 480000 p; `total_split` 333300/333300/333400; `by_days` 12 Oct = 77400 p) (T-DUE-01-2) | rounding drift and a paisa nobody owes |
| `test_total_split_sums_to_total_exactly_for_random_plans` (fuzz) | Σ instalments ≠ total |
| `test_each_join_policy_changes_only_the_first_period` | a pro-rata rule leaking into later months |
| `test_backdated_without_confirmation_is_409_with_preview_and_total_and_writes_nothing` (T-DUE-01-3) | a past-dated debt added to a khata without the merchant seeing it |
| `test_confirmed_backdated_posts_each_due_with_its_own_date` | catch-up lines all dated today, wrong aging and statement |
| `test_a_due_today_posts_at_creation_without_confirmation` | a due created after 00:30 sitting unposted until tomorrow (C-11) |
| `test_editing_the_plan_changes_no_running_schedule` (T-DUE-01-4) | a price change rewriting agreed terms |
| `test_window_is_24_months_open_ended_and_whole_plan_when_fixed` (T-DUE-01-5) | unbounded materialisation, or a fixed plan cut short |
| `test_one_live_schedule_per_subject` (T-DUE-01-6) | two memberships billing one subject twice |
| `test_document_plan_with_sales_off_is_module_disabled_sales` (T-DUE-01-7) | a plan that can never post |
| `test_read_endpoints_gate_by_engine_and_module_codename` (T-DUE-01-8: no consumer → 403 `module_disabled {module: "dues"}`; codename missing → rows absent; other tenant → 404) — asserts who is signed in first | a library reader seeing gym dues through the shared endpoint |
| `test_skip_on_a_count_plan_keeps_the_count` (R44) and `test_move_uses_the_module_calendar` | a 12-instalment plan ending with 11 |
| `test_month_end_anchor_clamps` (EC-1) | the "28 Mar for ever" bug the recurrence module documents |
| `test_archived_party_cannot_start_a_schedule` (EC-4) | money owed by a party nobody can see in the list |
| `test_unregistered_subject_type_refuses` | engine rows pointing at nothing |
| `test_materialisation_reads_the_calendar_once` (`django_assert_num_queries` bound) | a per-due calendar query on a 730-due daily plan |
| `test_zero_amount_due_posts_nothing_and_is_paid_on_its_date` (BR-10) | `post_source_entry` refusing a 0 and failing the schedule |
| `test_posting_sources_are_registered_with_the_contract_shape` | a dues line in the wrong bucket |

#### Edge cases

- **Backdating** (BR-7): one computation for the 409 and the write; the 409 is raised before any
  insert, under the party lock, so a confirm-then-retry sees the same rows. Dues before the
  previous FY start cannot be issued as invoices (sales refuses, `issue.py:51-58`) — refused up
  front for document plans (C-13).
- **Idempotency**: `create_schedule` is not idempotent by itself; the vertical endpoint carries
  `@idempotent` (`apps/common/idempotency.py`), and the live-subject unique index makes a replay
  that slipped past it an `IntegrityError` (C-16). Posting is idempotent at the ledger.
- **Concurrency/locks**: party → schedule → dues (contracts §2.1 Locks). Two creates for one
  subject: the unique index decides. Plan edits racing a create: the create reads the plan once
  under no lock and snapshots it; `update_plan`'s `version` protects the plan only.
- **Closed days**: read once per window; a closure added later is DUE-02 EC-3's.
- **Two schedules for one party** (EC-3): independent rows; FIFO across them is DUE-03's.
- **`supplied` shorter than the rule** (EC-5): the list defines the dates (`freq='once'` +
  `explicit_dates`).

#### Frontend (FRD DUE-01 §7)

`features/dues`: `api/duesService.ts` (the two GETs), `types/dues.types.ts` (`Due`, `DuePreview`,
`Schedule`), `redux/duesSlice.ts` lazily injected (`injectInto`, CR-134; no mutations, so no
`registerInvalidation` of its own — verticals register entries for their thunks, ADR-062),
`SchedulePreviewTable`, `BackdatedConfirmDialog` (`dynamic()`), `DueStatusBadge`, `DuesTable`
(`UbDataGrid` preset); `duesPlanSchema` in `useValidationSchemas()`; the ESLint zone for
`features/dues` already exists (`frontend/eslint.config.mjs:147`). No host screen exists until a
vertical consumes the engine, so the *look* step for these components cannot happen in Wave B
(question Q-D5).

#### Contradictions and gaps for DUE-01 (default taken; contracts win)

- **C-1 Test-subject path.** 10-architecture §11 names `tests/fixtures/engine_subjects.py`, but
  `backend/tests/fixtures.py` is a module both conftests star-import; a `tests/fixtures/` package
  would shadow it (or be unreachable without `__init__`). Default: `tests/engine_subjects/`
  package, one module per engine (`dues.py` here, `attendance.py` for Track T), identical empty
  `__init__.py`.
- **C-2 `preview_schedule` has no `subject_type`**, so BR-9's `amount_hook` cannot run in the public
  preview. Default: an internal `_preview(..., subject_type)` used by `create_schedule` (so the 409
  and the write agree); the public signature is kept verbatim and documents that it ignores hooks.
  Proposed v1.1: an optional `subject_type=None` keyword.
- **C-3 `create_schedule` has no `join_on`** while `preview_schedule` does. Default: `join_on =
  start_on`; the first period is the rule's period containing `start_on`, and a stub due dated
  `start_on` covers `[start_on, first occurrence)` priced by `join_policy` (`next_period`: none).
- **C-4 Plan anchor.** `RecurrenceFields.anchor` is NOT NULL, but a plan has no meaningful anchor
  (the schedule's is `start_on`, or the join date for `align_to_join`). Default: the plan stores
  its creation date as a template anchor that no computation reads; the schedule's anchor is set
  at creation.
- **C-5 Does the join stub count toward `count`?** FRD is silent. Default: the stub is due `seq 1`
  and counts (a 12-part plan is 12 dues whatever the join day); `next_period` has no stub.
  Owner-visible; listed for the lead.
- **C-6 Snapshot columns.** Contracts list the typed snapshot as recurrence, amount, total, grace,
  penalty, allocation order, closed-day rule; FRD adds `rounding_rule` typed and puts "the rest"
  in `terms`. `mode` and `posting` are filtered on by the run and by DUE-03's FIFO (target open
  rows are "posting `ledger`"), and a jsonb predicate on the hottest query is the wrong shape.
  Default: `mode` and `posting` are **typed** snapshot columns too (additive; no money in jsonb
  either way). FRD-only additions taken as additive: `dues_plan.version`,
  `dues_adjustment.document_id`, `dues_pause.resumed_on`.
- **C-7 Period for `once` and the last explicit date.** `period_after` raises `ValueError` there
  (`recurrence.py:238-245`), and `dues_due` requires `period_end > period_start`. Default:
  `[due_on, end_on)` when the schedule has an end, else `[due_on, due_on + 1 day)`, labelled
  `day` style.
- **C-8 Period label style and locale** are not stored on the plan. Default: derived — `month`
  for a monthly rule on the 1st, `fy` for a yearly rule on 1 Apr, `range` otherwise — in
  `tenant.locale` (`apps/platform_app/models/tenant.py:44`), fixed at materialisation.
- **C-9 `materialised_until`** is "last `due_on` materialised" in FRD §5 but the window query is
  `materialised_until < today + window`; with last-due semantics every monthly schedule matches
  every day. Default: it records the **horizon** through which occurrences were computed.
- **C-10 Task split.** BR-7 / T-DUE-01-3 need past dues posted inside `create_schedule`, but
  posting is DUE-02's. Default: DUE-01 builds `post_due` for `charge/ledger` and zero amounts;
  `document` and `expectation` branches land in DUE-02; until then `create_schedule` refuses a
  document/expectation plan whose start would post anything (internal only — no vertical exists).
- **C-11 A due dated today at creation.** BR-7 confirms only `< today`. Default: `due_on == today`
  posts at creation without confirmation (otherwise it waits for tomorrow's 00:30 run).
- **C-12 `late_fee_so_far`** in the FRD `Due` shape has no source until DUE-04; sending `"0.00"`
  breaks the PTY-03 rule (a key that is always empty is a claim the code cannot verify). Default:
  omitted until DUE-04.

### Built (1 Oct 2026)

Commits on `wave-b/track-d`: `3a07bb0` schema, registry, plan services; `57f17c7` preview,
schedules, posting, read API; `c7dafce` frontend types/service/slice; plus the closing commit
(this section and the document-plan deactivation fix).

**What landed.** `backend/apps/dues/` — `apps.py` (the three posting sources, contracts §1.2),
`constants.py`, `models.py` + `migrations/0001_initial.py` (all nine tables; depends on the five
Wave B heads), `registry.py`, `services/{plans,preview,schedules,posting}.py`,
`selectors/{dues,schedules}.py`, `serializers.py`, `views.py`, `urls.py`, `tenant_data.py`;
tests `tests/{subject,conftest,test_plans,test_preview,test_schedules,test_read_api}.py`
(47 tests). Frontend `features/dues/{types/dues.types.ts,api/duesService.ts(+test),
redux/duesThunk.ts,redux/duesSlice.ts}`, no screens (Q-D5).

**Shared hot files (own blocks only):** `config/settings/base.py` and `config/urls.py`
(`# ── dues ──`), `apps/common/error_codes.py` (`# ── DUE-01 ──` `schedule_backdated_unconfirmed`),
`apps/common/audit.py` (four `DUES_*` actions), `apps/common/tests/test_exceptions.py` (count
166 → 167, commented), `tests/migrations/test_reversibility.py` (`"dues"` label),
`docs/22-api-specification.md` (one row in section G), `frontend/src/api/APIPaths.ts` and
`frontend/src/redux/invalidation/registry.ts` (`// ── dues ──`, two QUERIES).

**Gates.** `apps/dues` 47 passed; `tests/architecture` 111 passed, 6 skipped; `tests/contracts`
46 passed, 1 skipped; `apps/common/tests` 316 passed; tenant-data + engine-enablement + ledger
buckets 91 passed; `tests/migrations` 59 passed + the slow round trip 1 passed;
`makemigrations --check` clean; black/isort/flake8 clean on `apps/dues`. Frontend: `tsc` clean,
eslint + prettier clean on changed files, jest `features/dues` + `src/tests` 477 passed.

**Deviations from the note.**
- Test subject at `apps/dues/tests/subject.py` (Lead ruling), with a second fake module `test_b`
  (codename `platform.tenant.manage`, which an admin lacks) so T-DUE-01-8's "rows absent" is
  proven with real roles through the API.
- `post_due(*, ctx, due, party, today=None, subject_label=None)` reads posting mode and grace from
  `due.schedule` (the snapshot) rather than taking them as arguments.
- `preview_schedule` gained `subject_type=None` and `create_schedule` gained `join_on=None` as
  the additive v1.1 keywords (Q-D3), instead of a private `_preview`.
- The plan's template anchor (C-4) is moved to `until` when a plan's `until` is earlier than its
  creation date, because the mixin's `until >= anchor` CHECK applies to the plan row too.
- `update_plan` asks for sales only when the posting CHANGES to `document`, so a document plan can
  still be deactivated or renamed after sales is switched off (found while writing the note's
  EC-2; test `test_a_document_plan_can_be_deactivated_while_sales_is_off`).
- Labels: `range` style for a join stub, `day` style for supplied dates (C-7/C-8 extended).
- `ck_dues_due_settled_within_owed` is written `settled <= amount + penalty − waived`, the FRD's
  `settled + waived <= amount + penalty` rearranged.
- Frontend: no locale catalogue yet (the thunks fall back to `error.generic`); the
  `catalogues.json` prefix and `duesPlanSchema` arrive with the first component that needs words.

**New contradictions.** None blocking. C-13's FY check uses `fy_bounds` of the previous FY start,
mirroring `issue.py:51-58`; DUE-02 should re-read sales' own rule when the document branch lands.

### QA round 1 (1 Oct 2026)

QA committed 11 failing tests (`apps/dues/tests/test_qa_due01.py`, `4de3eef`); all pass and are
kept. Fixes:

- **QA-DUE-01-1** A split total is an agreed figure (BR-5), so a join stub on a `total_split` plan
  is its first PART and is not prorated again; the join policy prices stubs of fixed plans only.
- **QA-DUE-01-2** `until` is inclusive (contracts §1.8). **Chosen: refuse** — a start after the
  plan's `until` is 400 on `start_on` ("This plan ended on …"), because a schedule with no dues
  would occupy the subject's live-schedule slot and bill nothing, which no merchant means. A start
  ON `until` bills that one due.
- **QA-DUE-01-3** When `MAX_DUES` stops an open-ended series, the horizon
  (`materialised_until`) is the last due computed, so DUE-02 extends from there and skips
  nothing. A bounded plan the cap would cut short is refused (400 `recurrence`), as BR-4 says it
  is materialised whole.
- **QA-DUE-01-4** Supplied component amounts are parsed like the row amount: a bad one is 400 on
  `supplied.N.components`.
- **QA-DUE-01-5** Plan numbers are checked against their columns (numeric(14,2), (10,4), (9,4));
  a non-numeric `version` is 400 on `version`.
- **QA-DUE-01-6** `post_due` calls the subject's `on_due_changed(ctx, due, before, after)` after
  each status change, in the transaction (contracts §5).
- **QA-DUE-01-10** The split fuzz counts its cases and only `rupee_up` may refuse.

**Lead rulings recorded.**
- **QA-DUE-01-7** The two dues QUERIES in core `src/redux/invalidation/registry.ts` are a temporary
  exception; F01 (Track T) moves them to `features/dues/redux/duesInvalidation.ts`.
- **QA-DUE-01-8** `preview_schedule(subject_type=None)` and `create_schedule(join_on=None)` are
  ratified as v1.1 additive keywords; entry added to the Changelog of `11-contracts.md`.
- **QA-DUE-01-9** Q-D5: no dues screens this wave.

---

## DUE-02 — The daily run: materialise, post, overdue, catch-up (FRD 00 #17, R44, ADR-048)

### Design note (review step)

#### Inputs

FRD DUE-02 §1–§13 (steps 1–7, BR-1…BR-5, worked example, T-DUE-02-1…9, EC-1…EC-4); contracts
§2.1 "Daily run", "Modes and postings", "Locks"; plan §3.2 (DUE-02 = "ledger posting, then
document posting (origins `dues_due`, `dues_adjustment`), catch-up fuzz; `skip` keeps count").

#### Scope split with later tasks (plan §3.2 over FRD step list)

| FRD DUE-02 step | Built in |
|---|---|
| 1 Extend (materialise, closed-day rule) | DUE-02 (reuses DUE-01's `materialise`) |
| 2 Post (ledger, document, expectation) | DUE-02 |
| 3 Overdue | DUE-02 |
| 4 Once-off penalties, 5 accruing penalties | **DUE-04** (hook point left in the run; C-14) |
| 6 Advance auto-apply | **DUE-03** (needs the `dues_due` target) |
| 7 Pauses | **DUE-05** |

#### Scheduler wiring (verified)

- `apps/dues/tasks.py`, imported from `DuesConfig.ready()` (the `apps/ledger/apps.py` pattern):
  `@job_handler("dues.run", requires_tenant=False, max_attempts=3)` fans out, for every tenant
  with `status="active"`, `enqueue(job_type="dues.run_for_tenant", payload={"date":
  tenant_today(t).isoformat()}, tenant=t, idempotency_token=f"dues:{t.id}:{date}")` — the exact
  shape of `ledger.schedule_auto_reminders` (`apps/ledger/tasks.py:44-66`). Optimisation: only
  tenants with an engine consumer on (`enabled_modules_using(t, "dues")`) and at least one live
  schedule.
- `@job_handler("dues.run_for_tenant", max_attempts=3)` → `run_for_tenant(tenant=job.tenant,
  today=date.fromisoformat(job.payload["date"]))`. Handler signature is `(job, ctx)`
  (`apps/common/jobs.py:41-70`); `run_job` gives `Ctx.system(job.tenant)` and runs inside
  `TenantContext`, and **the handler owns its transactions** (`jobs.py:262-268`).
- `register_schedule(Schedule("dues.run", period="daily", at_hour_ist=0, minute=30))` in `ready()`
  (`jobs.py:477-489`) — contracts verbatim. `materialise_due_schedules` raises for a registered
  schedule with no handler (`jobs.py:502-512`), so the schedule and both handlers land in the same
  commit.
- Job dedupe: `uq_job_idem (tenant, job_type, idempotency_token) WHERE status IN
  ('queued','running','succeeded')` (`apps/platform_app/models/job.py:53-58`) — a succeeded day
  is never re-enqueued; a dead-lettered one is (C-15).
- `manage.py dues_run --tenant <id> --date <d>` (FRD §6) — calls `run_for_tenant` inline rather
  than enqueueing (C-15); listed in `tests/architecture/test_operator_surface.py` only if a
  Makefile/compose file names it (that test reads those files; it does not take a list).

#### `run_for_tenant(*, tenant, today) -> RunReport`

`RunReport = {"materialised", "posted", "overdue", "penalties", "advances_applied", "skipped",
"errors": [{"schedule_id", "code"}]}` (FRD §6; `penalties` and `advances_applied` stay 0 until
DUE-04/DUE-03 fill their steps).

Per schedule, in its **own outermost `transaction.atomic()`** (not one tenant-wide transaction
with savepoints — FRD says "per-schedule savepoints"; a tenant-wide transaction would hold every
party lock of the tenant for the whole run, T-DUE-02-9's 60 s, blocking the counter), in this
lock order: `lock_party` → `DuesSchedule.objects.select_for_update().get(...)` → due rows
`select_for_update().order_by("due_on", "seq")` → (document mode: the port's documents → payments →
sequence). **The party is locked first even for the materialise-only step**, because pause and
reschedule (DUE-05) take party → schedule, and a run that took schedule → party would deadlock
with them.

1. **Extend**: schedules from `ix_dues_schedule_window` with `materialised_until < today +
   24 months` → `materialise(schedule, through=horizon)`; re-apply `closed_day_rule` to
   `scheduled` dues dated `>= today` (EC-3; they hold no money).
2. **Post**: `scheduled` dues with `due_on <= today` (`ix_dues_due_status`), `(due_on, seq)` order,
   `post_due` each:
   - `charge/ledger`: DUE-01's branch.
   - `charge/document`: `issue_document(ctx=ctx, request={"origin_type": "dues_due", "origin_id":
     due.id, "party_id": due.party_id, "document_date": due.due_on, "due_on": due.due_on,
     "lines": <heads, else one line>, "credit_check": "skip", "apply_open_advances":
     terms.auto_apply_advance})`; each line `{description: "<subject label> · <period label>",
     qty: 1, unit_price, tax_code, hsn_sac, tax_inclusive}` overlaid by the subject's `line_hook`
     (R54); `document_id` set; `amount := grand_total` (FRD); `credit_check="skip"` is honoured by
     `SalesIssuer.issue` (`apps/sales/services/port_issuer.py:176-186`) and a crossed limit comes
     back in `warnings`. The port is idempotent per origin (`_standing`, `port_issuer.py:90-99`,
     BR-6 under the party lock), so a retried run returns `existing: True`.
   - `expectation`: each non-principal component posts as its own source
     `("dues_component", component.id)`, `INTEREST` or `CHARGE`, bucket `loan`, dated `due_on`
     (rule 2 of contracts §1.2: one source row per postable fact).
   - status `due`, `paid` for zero, or `overdue` directly when `due_on + grace_days < today`.
3. **Overdue**: conditional `UPDATE … SET status='overdue' WHERE status='due' AND due_on +
   grace_days < today AND outstanding > 0` (grace read from the schedule snapshot), then
   `on_due_changed(ctx, due, before, after)` per changed due.
4. **Hook points** for DUE-04 (penalties), DUE-03 (advances), DUE-05 (pauses), each a no-op until
   its task.

One schedule's failure rolls back that schedule's transaction only, lands in `errors`, and raises
one `dues.run_failed` notification per tenant per day (`notify(tenant, "dues.run_failed",
params=…, group_key=f"dues.run_failed:{today}")`, `apps/notifications/services/notify.py:244`),
registered with `register_notification_type` (`notify.py:211`) — C-19 for its route and
permission. `BR-3`: nothing ever posts before its `due_on`.

Source resolver: `register_source_resolver("dues_due", resolver)`
(`apps/ledger/selectors/sources.py:42`) returning `{id: {"number": "<subject label> · <period
label>", "status": due.status, "kind": "dues_due"}}`, batched per page; the label comes from the
subject registry (FRD §8 "Membership · Oct 2026"). Same for `dues_component` and
`dues_adjustment` when they first post.

**Origin listener.** `issue_document` refuses an unregistered origin type (`_required` raises,
`port_issuer.py:86-87`), so document posting needs `register_origin("dues_due", module=…,
listener=…)` in DUE-02, a task earlier than FRD DUE-03 places the listener. Default: DUE-02 lands
the whole listener — `check_void` (never blocks, FRD DUE-03 §6), `on_void` (due → `cancelled`,
`cancel_reason="Invoice voided: …"`) and `on_settlement_changed` (`settled_amount := grand_total −
amount_due`, status re-derived) — because a registered origin must pass the shared contract
(`tests/contracts/test_document_port.py:32-36`, `FACTORIES`) the moment it registers (C-18). The
`module` it registers with is C-2's question.

#### Tests to write first

| Test | Defect it prevents |
|---|---|
| `test_each_step_on_a_fixture_schedule` (T-DUE-02-1) | a step silently skipped |
| `test_catch_up_worked_example_without_penalty` — outage 28 Sep–6 Oct, run 7 Oct posts the 1 Oct due dated 1 Oct, `overdue`; the penalty half of FRD's example is DUE-04's | a missed day posting with today's date |
| `test_running_twice_for_one_date_is_a_no_op` (T-DUE-02-2; row counts, caches, audit counts equal) | double charges on a retried job |
| `test_catch_up_equals_day_by_day` (T-DUE-02-3, seeded property: random plans × random outages; compares rows, `entry_date`, amounts, statuses, ignoring invoice numbers and `created_at`) | catch-up drift from on-time results |
| `test_closed_day_move_and_skip` (T-DUE-02-4) incl. `test_closure_added_after_materialisation_is_reapplied_to_future_dues` (EC-3) | a fee due on a holiday the gym is closed |
| `test_one_failing_schedule_leaves_the_others_posted_and_notifies_once` (T-DUE-02-5) | one bad tax code stopping a tenant's billing |
| `test_run_and_payment_on_one_party_do_not_deadlock` (T-DUE-02-6, two threads, 20 runs) | the run locking schedule before party |
| `test_step_two_query_uses_ix_dues_due_status` (T-DUE-02-7, `EXPLAIN`, `tests/performance/test_party_list_plans.py` pattern) | a sequential scan of every due daily |
| `test_ist_tenant_at_1831_utc_posts_the_next_days_dues` (T-DUE-02-8) | a run dated by the server's UTC day |
| `test_five_thousand_schedules_run_under_a_minute` (T-DUE-02-9, `@pytest.mark.slow`) | a run that cannot finish nightly |
| `test_document_due_issues_through_the_port_with_skip_and_own_date` (uses sales' `shop` fixture, `apps/sales/tests/conftest.py`) | a dues invoice dated today, or refused by the credit limit |
| `test_retry_after_a_crash_mid_document_returns_the_standing_invoice` | two invoices for one due |
| `test_expectation_posts_only_non_principal_components_in_loan` | principal counted twice on a loan |
| `test_registered_schedule_has_a_handler` (via `materialise_due_schedules`) | a schedule that never runs |
| `test_dues_due_origin_passes_the_port_contract` (a `FACTORIES` row) | an origin listener untested by the shared suite |

#### Edge cases

- **Catch-up after missed days**: every missed due posts with its own `due_on`, in `(due_on, seq)`
  order; status computed against `today`, so a long-missed due goes straight to `overdue`.
- **Backdating across a financial year**: sales refuses documents dated before the previous FY
  start (`apps/sales/services/issue.py:51-58`); such a due errors (BR-2) and the owner is notified
  (C-13).
- **Closed days**: `move` at materialisation; re-applied to future `scheduled` dues only; a removed
  closure un-skips (and the surplus trailing due of a count plan is `cancelled`, reason "Business
  days changed") — never touches a posted due.
- **Archived party** (EC-1): ledger posting proceeds (it was agreed), but sales refuses an archived
  party (`issue.py:124-130`, `party_archived`) — document-mode dues error and notify (C-14).
- **Sales switched off since** (EC-2): `issue_document` raises `module_disabled`; the schedule
  errors and the owner is notified; the sales module-off guard should have refused it.
- **Concurrency**: one run per tenant per day by the job token; two operators running
  `dues_run` concurrently serialise on the party lock and the conditional status updates; the
  ledger's `(source_type, source_id, entry_type)` and the port's `(origin_type, origin_id)` make a
  second posting return the first.
- **Lock-order note**: the run takes party → due → (new) document; a void takes party → document →
  (`on_void`) due. Different relative order, but both hold the party lock first, so they serialise
  per party and cannot deadlock; the new document is invisible to anyone else until commit.

---

## DUE-03 — Settling dues (FRD 00 #18) — outline

**Status: design written; not started.**

- **Targets** `DuesDueTarget` (`dues_due`, in, `main`, `auto=True`, open = posting `ledger`,
  status `due`/`overdue`, outstanding > 0) and `DuesInstalmentTarget` (`dues_instalment`, in,
  `loan`, `auto=False`, posting `none`), registered from `DuesConfig.ready()` with
  `register_target` (`apps/payments/services/targets/__init__.py:139`), both ≤ 32 chars.
  `lock()` in `(due_on, seq, id)`, mapped to the protocol's `(document_date, number, id)` merge key
  (`record.py:292-305`) as `(due_on, "<label> · <period>", id)` — verify the merge key's types
  with Track M's W-M3 merge before building.
- **`apply`/`unapply`** split by `allocation_order` (BR-3; the three orders reproduce FRD's
  LN-0042 example), write/remove `dues_settlement` rows keyed by `payment_id`, move
  `settled_amount` and component `settled`, re-derive status (BR-4), add stood days to
  `penalty_exempt_days` on unapply (BR-8), call `on_due_changed`.
- `plan_allocation(*, tenant, schedule_id, amount, order=None)` and `payoff(*, tenant, schedule_id,
  on)` exactly as contracts §2.1; `plan_allocation` and `apply` share one split function.
- **Advance auto-apply** (DUE-02 step 6): `open_advances(tenant=…, party_id=…, bucket="main")`
  (`apps/payments/selectors/payments.py:175`, already excludes earmarks, refund vouchers, voids)
  → `allocate_existing(ctx=…, payment_id=…, allocations=[…])` (`apps/payments/services/allocate.py:181`).
- **Replay**: `manage.py recalc_dues --check` (settled = Σ settlements for ledger/expectation;
  `grand_total − amount_due` via `document_summaries` for document mode) and the seeded fuzz
  T-DUE-03-4 (a–d) including `recalc_balances --check`.
- **Shared files it must edit** (C-18): `tests/contracts/test_allocation_targets.py` needs a
  factory per new target (`test_every_registered_target_is_under_contract`, line 135).
- Open: the receipt `label` (R30) for a due is the subject label · period (≤ 120); `summary.number`
  in FRD is the same string — confirm no receipt prints it twice.

---

## Contradictions and gaps spanning the track

- **C-2 (blocking DUE-02's document posting, not DUE-01) — the origin's module.** `register_origin(
  origin_type, *, module, listener)` fixes one module per origin type, and `SalesIssuer.issue`
  stamps `sales_document.origin_module = origin.module` (`port_issuer.py:147, 164-169`). The dues
  engine serves gym, library and lending through one origin type `dues_due`, and has no module
  code (ADR-041). So every dues invoice would say `origin_module = "dues"`, and the sales
  register's module filter (10-architecture §4.3, contracts §1.5 "so registers can filter by
  module") cannot tell a gym fee from a library fee. Default if unanswered: register with
  `module="dues"` and let the listener's optional `labels()` name the subject. Proposed v1.1: an
  optional `IssueRequest.origin_module` the issuer prefers when the registered origin's module is
  an engine.
- **C-13 Sales refuses old dates and archived parties.** `_validate_issuable` refuses a
  `document_date` before the previous FY start (`issue.py:51-58`); `issue_invoice` refuses an
  archived party (`issue.py:124-130`). FRD DUE-02 EC-1 says an archived party's due "posts
  anyway". Default: `create_schedule` refuses a document plan whose backdated start is before the
  previous FY start (400 `validation_error` on `start_on`); the run records `party_archived` /
  `validation_error` in `errors` and notifies. Ledger mode is unaffected.
- **C-14 FRD DUE-02's worked example includes a penalty**, which plan §3.2 gives to DUE-04. Default:
  DUE-02 reproduces the posting and status half; the penalty assertion is added by DUE-04.
- **C-15 `dues_run` cannot re-enqueue a succeeded day** (`uq_job_idem` includes `succeeded`).
  Default: the command calls `run_for_tenant` inline in its own process (the run is idempotent),
  which is what an operator recovering a day wants.
- **C-16 No error code for a second live schedule.** FRD T-DUE-01-6 says "IntegrityError mapped to
  409 by the vertical"; contracts §4 has no code. Default: the engine lets the `IntegrityError` on
  `uq_dues_schedule_live_subject` propagate from a savepoint; each vertical maps it to its own
  code in its own error block.
- **C-17 `apps/common/tests/test_exceptions.py` asserts an exact registry count** (166) and every
  Wave B track that adds a code edits that line; it is not in plan §1.3's shared-file table.
  Default: edit it in the DUE-01 block with a comment; the lead resolves the count at merge.
- **C-18 Contract suites are shared files.** `tests/contracts/test_document_port.py` (`FACTORIES`)
  and `tests/contracts/test_allocation_targets.py` (factories) must gain dues rows when DUE-02
  registers the origin and DUE-03 the targets; neither file is in any task's Owns column. Default:
  append-only rows in a `# ── dues ──` block, as for hot files.
- **C-19 `dues.run_failed` has no screen to open.** `NotificationType.route` must start with `/`
  and the engine has no page. Default: route `/notifications`, `required_permission =
  "platform.tenant.manage"` (owners), severity danger, `group_window = 24 * 60`.
- **C-20 Engines may not import `apps.reports.registry`.** The import test allows R27's two
  registries to verticals only (`_allowed_for_new_app`; the planted fixture asserts a dues import
  of `apps.reports.registry.register_report` is a violation). DUE-06's "reports" and FRD DUE-03
  §11's "Collections by component" therefore cannot be registered by the engine. Default for
  DUE-06: engine read endpoints serve the data; the consuming vertical registers the report.
- **C-21 QA stand-ins.** `e2e/qa_standins` (Wave A gate) registers an origin listener named
  `dues_charge` under `qa_settings`; harmless (different key), but it should be deleted once the
  real `dues_due` origin lands so the QA settings do not drift from the product.

## Open questions for the lead

1. **Q-D1 (C-2)** Accept `module="dues"` on the `dues_due`/`dues_adjustment` origins for now, or
   amend contracts v1.1 with `IssueRequest.origin_module`? Needed before DUE-02's document branch.
2. **Q-D2 (C-1)** Confirm `backend/tests/engine_subjects/{__init__,dues,attendance}.py` in place of
   10-architecture §11's `tests/fixtures/engine_subjects.py`, and tell Track T.
3. **Q-D3 (C-2 of DUE-01, C-3)** v1.1 additions: optional `subject_type` on `preview_schedule`
   (BR-9 hooks in the preview) and `join_on` on `create_schedule`? Built meanwhile with the
   defaults above.
4. **Q-D4 (C-5)** Does a join stub count toward a fixed `count`? Default: yes.
5. **Q-D5** Build `features/dues` UI in DUE-01 although no screen can host it until Wave C (so the
   *look* step and the `--shots` sweep move to the first consuming vertical), or defer the
   components to the first vertical and ship only types, service and slice now?
6. **Q-D6 (C-10)** Accept DUE-01 owning `post_due`'s ledger and zero branches (so the backdated
   confirmation is real in DUE-01) with document and expectation branches in DUE-02?
7. **Q-D7 (C-17, C-18)** Add `apps/common/tests/test_exceptions.py` and the two
   `tests/contracts/*` suites to plan §1.3's shared hot-file table?
8. **Q-D8 (C-6)** Typed `mode`/`posting` on `dues_schedule` (and possibly a copied `posting` on
   `dues_due` for DUE-03's partial index, decided by its `EXPLAIN`) — accepted as additive?

Nothing blocks DUE-01 itself: every API it calls exists and was read; its defaults are recorded
above.

## Lead rulings (1 Oct 2026)

- **Engine test subjects** live in the engine's own tests: `backend/apps/dues/tests/subject.py` and `backend/apps/attendance/tests/subject.py`. They do not go in `tests/fixtures/`, which would shadow `tests/fixtures.py`, or in a shared `tests/engine_subjects/`, which neither track would own. 10-architecture §11's path is superseded by this.
- **ADR-062 F-62-1 approved.** ADR-062 and ADR-061 are amended in place (1 Oct, before any code). Registration lives in `redux/<module>Invalidation.ts`, which every thunk file of the module bare-imports and which is listed in `sideEffects`. Module `patch` may name only the module's own slices. `register.ts` carries no message ids. F01 adds the frontend core-to-vertical boundary zone.
- Every other open question keeps the default recorded above until the next lead session or the owner answers.
