# Wave A · Track F (foundations) — progress

Owner: Track F lead (backend / full-stack). Branch `wave-a/track-f`, worktree `/home/claude/wt/track-f`,
test database `UB_TEST_DB_NAME=test_ub_track_f`.

Sequence (plan §2): **A11 → A9a → A10 → A16 → A15 → A4b**.

QA note: this session has no Agent tool, so no separate QA agent can be spawned. Each task gets a
separate adversarial review pass by me after implementation, recorded under its heading as
"Adversarial pass (self, no Agent tool)".

---

## A11 — import matrix for the seven apps

Status: **done, merged** (see commit `A11:` on main)

### Design note (review step)

Inputs: FRD 00 PLT-X14, 10-architecture §3 (L1–L5) and §10.1, R27, R72, contracts §1.5 (seam) and §1.9
(registry import rule), ADR-041.

Backend (`tests/architecture/test_import_rules.py`, owned by A11):

- The seven apps (`dues`, `bookings`, `attendance`, `lending`, `library`, `gym`, `hospitality`) are
  not on disk yet. The matrix declares them now; the "matrix covers every app on disk" test becomes
  *every app on disk is in the matrix, every existing app is on disk, and nothing but the seven
  planned apps may be absent*. So B01 and the other skeleton tasks add no `ALLOWED` row: the row is
  already here and starts applying the moment the folder exists.
- `ALLOWED["reports"]` becomes a **literal** frozen set of today's apps minus `reports` and `help`
  instead of `ALL_APPS - {...}`, so adding the seven apps to `ALL_APPS` does not widen it (BR-3). A
  test asserts it contains no engine and no vertical.
- `ALLOWED["payments"]` is left as it is: R72 removes `sales` and `purchases` in **A14** (Track M),
  which edits that one line.
- New whole-AST check for the seven apps (BR-1, L2): every `Import`/`ImportFrom` node anywhere
  (function bodies, `TYPE_CHECKING` blocks — EC-1), relative imports resolved to absolute names,
  and `importlib.import_module("apps.…")` / `__import__` with a literal string. Tests excluded;
  migrations included (a migration is code that runs).
- R27: verticals (not engines) may import exactly `apps.reports.registry` and `apps.imports.registry`
  (`import apps.reports.registry`, `from apps.reports.registry import x`, `from apps.reports import
  registry`), nothing else from `reports` or `imports`. Both registry modules may import, at import
  time (everything outside function bodies), only the standard library, Django and `apps.common` —
  plus themselves (`imports.registry` defers `apps.imports.mappers` inside a function, which is
  outside the import-time rule).
- BR-2: `apps/common/seams/**` imports no other app anywhere in the AST (the contract's "rule D1 holds
  — it imports nothing from `apps.*`"; `apps.common` itself is D1-compatible). Vacuous until A5 writes
  the file; it bites the day it exists.
- Extra, same rule from the other side (L1 "core imports neither"): no existing app imports an engine
  or a vertical anywhere in its AST, deferred included. The existing module-level walker cannot see a
  deferred one.
- T-PLT-X14-1: a planted fixture tree `tests/architecture/fixtures/planted_apps/` (files end in
  `.fixture` so ruff, mypy and pytest leave them alone) with a deferred, a `TYPE_CHECKING`, a
  relative, an `import_module` and a non-registry `reports` import in a fake `gym`, plus an
  engine→vertical import in a fake `dues`; the checker must report exactly those and not the allowed
  registry imports or the test file.

Frontend (`frontend/eslint.config.mjs`, owned by A11):

- FRD 00 X14 §7 and 10-architecture §6.7 say "ESLint `no-restricted-imports` zone". **Decision:** the
  zones are written with `import/no-restricted-paths` (the rule this config already calls "zones",
  Part 19 §19.1.2), appended to the main block's `zones` list. Reasons: it matches on the RESOLVED
  path, so `modules/…`, `src/modules/…` and `../../library/…` are one rule rather than three spellings
  to enumerate; it sees `import()` inside `dynamic()`, which `no-restricted-imports` does not (and a
  cross-vertical panel is exactly what a `dynamic()` would carry); and `no-restricted-imports` options
  are replaced wholesale by later `files` blocks, so a per-vertical copy would silently drop off
  test files through the party-fetch allowlist block. Same intent, stronger mechanism; flagged as a
  question for the architecture owner in case the rule name was meant literally.
- Zones: each engine folder (`dues`, `bookings`, `attendance`) may not import another engine, any
  vertical, or `sales`/`purchases`/`inventory`/`expenses`. Each vertical may not import another
  vertical, Shop & billing, or an engine it does not use (lending→dues; library→dues, bookings,
  attendance; gym→dues, attendance, bookings; hospitality→bookings, dues — the backend matrix).
- No core→vertical zone on the frontend: 10-architecture §6.8 has core screens host module panels and
  sections through registries whose entries are `dynamic()` imports; how those entries are wired is
  A6/A10's and a zone now could forbid the mechanism before it is written.
- T-PLT-X14-2: `src/tests/moduleBoundaryLintRule.test.ts`, the party-fetch test's mechanics (write
  fixtures to real paths inside the TS project, lint as one process, delete), fixtures in
  `src/tests/lint-fixtures/module-boundaries/`.

### Built

- `backend/tests/architecture/test_import_rules.py`: matrix rows for the seven apps (§10.1 verbatim),
  `REPORTS_ALLOWED` literal, whole-AST walker (relative, `TYPE_CHECKING`, deferred, `import_module`,
  `__import__`), R27 registry exception and purity check, BR-2 seam check, core-never-imports-new-apps
  (deferred included), planted fixture tree `tests/architecture/fixtures/planted_apps/**.py.fixture`.
  `test_import_rules.py` 21 → 51 items (8 skip until the seven folders and `reports/registry.py` exist).
- `frontend/eslint.config.mjs`: `MODULE_BOUNDARY_ZONES` appended to the main block's
  `import/no-restricted-paths` zones; probe folders inside feature folders ignored.
- `frontend/src/tests/moduleBoundaryLintRule.test.ts` + 12 fixtures in
  `src/tests/lint-fixtures/module-boundaries/` (7 must fire, 5 controls): 14 tests.
- Both guards proven to fail first: removing the zones fails 7 of 14; swapping `ast.walk` for
  `tree.body` fails the planted backend test.

### Adversarial pass (self, no Agent tool)

Tried: `from apps import gym`, `import apps.gym as g`, `from apps.reports import registry, selectors`
(the second name is caught), `apps.reports.registry_helpers` (refused: prefix match is on `registry.`),
a star import of `reports` (refused), an engine using the R27 exception (refused), a `.py.fixture`
test file (excluded), class-body and `TYPE_CHECKING` imports in a registry (counted as import-time).
Frontend: relative, `src/` alias, type-only, `export … from`, and `import()` spellings all fire; a
vertical importing the engines it uses, `parties` and `src/utils` does not.

Known limits, left as written in FRD 00 EC-2: an f-string `import_module(f"apps.{x}")` and
`apps.get_model("gym", …)` are review-only. **Gap for the module skeleton tasks (F01 and the other
verticals' frontend shells):** the zones cover `features/<module>/**`; route files under
`app/(app)/<module>/**` are thin by rule but not zoned — the first vertical's skeleton should add a
zone for its route folder (the parentheses in `(app)` need checking against minimatch first).

### Questions for the architecture owner

1. FRD 00 X14 §7 and 10-architecture §6.7 name the rule `no-restricted-imports`; A11 uses
   `import/no-restricted-paths` zones (reasons in the design note). Same boundary, stronger check. If
   the rule name was meant literally, say so and a per-folder `no-restricted-imports` block can be
   added alongside.

---

## A9a — recurrence, periods, rounding primitives

Status: **done, merged** (commit `A9a:` on main)

### Design note (review step)

Inputs: FRD 00 PLT-X09, contracts §1.8, ADR-055, R13, shared-engines research §1.1–1.3.

- `apps/common/recurrence.py` — `Recurrence` (`frozen=True, kw_only=True`), `occurrences`,
  `next_occurrence`, `period_after`, `validate_recurrence`, `weekday_mask`/`mask_weekdays`. Every
  occurrence is computed from the anchor by index (no stepping from the previous date, so no drift).
  Semantics decided where the FRD is silent, all documented in the module docstring:
  occurrences are never before the anchor (a rule "on the 5th" anchored on the 12th starts next
  month); `count` counts from the anchor, not from the read window; `until` is inclusive; `count`
  and `until` also bound `explicit_dates`; `period_after` uses the rule without `count`/`until` (the
  last month of a 3-month plan is still a month) and raises for `once`/last explicit date.
  `validate_recurrence` also refuses `by_weekday` on a non-weekly rule and `by_month_day` on a
  non-monthly/yearly one (a rule meaning something other than what was chosen).
- `apps/common/periods.py` — `Period` `[start, end)` (+ `days`, `last_day`), `period_label` with
  the five styles in `en` and `hi`. Hindi months are CLDR `hi-IN` abbreviations without the "॰"
  mark (matches the FRD's "अक्टू 2026"); quarter "तिमाही 3, वित्त वर्ष 2026-27", fy "वित्त वर्ष …",
  following the existing catalogue's words. Unknown language falls back to English; unknown style
  raises.
- `apps/common/money.py` — `round_amount`, `split_total` (+ `ROUNDING_RULES`). `split_total` refuses
  a negative total, a sub-paisa total, no parts, negative/all-zero weights and a negative last share.
- `RecurrenceFields` lives in **`apps/common/db/recurrence.py`** (FRD 00 X09 §4), not
  `common/models.py` as the plan's Owns column guessed; `common/models.py` is untouched. It carries
  the six CHECKs with `%(app_label)s_%(class)s_` names, `.recurrence` and `.set_recurrence()`, and a
  guard test that fails for any installed model whose child `Meta.constraints` replaced them.
- **Not built, deliberately:** FRD 00 X09 §7's frontend `src/utils/recurrence.ts`
  (`describeRecurrence`). It is not in A9a's plan row, it has no caller until the first engine UI
  (Wave B), and it needs catalogue copy in both languages. Recorded for DUE-01/ATT-01's frontend.

### Tests

`apps/common/tests/test_recurrence.py` 28 (worked examples, BR-1…6, EC-1…5, validation, R13, three
seeded fuzz loops against a direct-from-anchor oracle, purity/no-clock), `test_periods.py` 15,
`test_money.py` +17 (worked examples, edges, 5,000-case exact-sum fuzz), `test_recurrence_fields.py`
14 (each CHECK on a throwaway table in an isolated registry, round trip, names, the lost-constraints
guard). `apps/common` + `tests/architecture`: 393 passed, 8 skipped before the oracle test was added.

### Adversarial pass (self, no Agent tool)

Added a fourth fuzz loop with a genuinely independent oracle — a day-by-day membership predicate
over every calendar day — for all four frequencies with count/until and windows before, at and long
after the anchor (1,500 rules). It agreed. Probed by hand: leap-year yearly on 29 Feb and on
`by_month_day=-1`, fortnightly anchored on a Sunday, monthly `by_month_day` before the anchor day,
`ten_up` splits that go negative (refused), a zero-weight last share (refused, honestly), `hi-IN` tags.
No defects found. Dates are plain `date`s throughout, so IST's lack of DST is not a variable here.

### Questions for the architecture owner

2. `period_label` has no tenant argument (contracts §1.8), so quarter and fy labels assume an April
   financial year. Every tenant has `fy_start_month = 4` today; if a tenant ever may change it, the
   signature needs an optional `fy_start_month` (additive, a v1.1 amendment).

---

## A10 — registries

Status: **done, merged** (commit `A10:` on main), except the settings wiring, which is in a file
Track P owns (see "Handed to Track P" below).

### Design note (review step)

Inputs: FRD 00 PLT-X13, contracts §1.9, R8–R10, R12, R16, R27–R29, R43, ADR-042, 10-arch §4 and §6.8.

- **`register_schedule`** (`common/jobs.py`): appended to `SCHEDULES`, so `enqueue_scheduled`,
  `check_expected_runs` and the double-run proof see a module's schedule exactly like a core one.
  Idempotent by `job_type` for an equal schedule, and a different one under a used type (a core one
  included) raises. A core entry with no handler is still skipped (Sprint 0's rule); a *registered*
  one with no handler makes `materialise_due_schedules` raise `ImproperlyConfigured` (T-PLT-X13-4:
  "fails loudly").
- **`apps/reports/registry.py`** (new): `register_dashboard_section`, `register_report`, readers,
  `_reset_for_tests`, `SECTION_QUERY_BUDGET = 3`. Keys are `<module>.<name>` with the registrant's
  prefix (BR-2). It imports only stdlib, Django and common, which A11's purity test now enforces
  (it stopped being a skip). The report `csv` contract: `csv(tenant, params)` yields the header row,
  then rows (numbers as Decimal/int, the rest text). A vertical cannot import `reports.exporting`
  (R27), so the registry defines its own contract.
- **Dashboard** (`reports/views/dashboard.py`): `sections: [{key, module, order, data}]` filtered by
  `effective_modules` and the reader's codenames. Computed **per request, not in the 60 s snapshot**,
  because the snapshot is dropped only by core writes and a vertical's save could not drop it. Each
  selector runs in a savepoint; a failure is logged and returned as `{…, error: "unavailable"}`. With
  nothing registered it reads nothing (adversarial finding, below).
- **`GET /api/v1/reports`** (`reports/urls_root.py`, one line in `config/urls.py` in an `A10` block,
  because the `reports/` include cannot produce a bare collection path) and
  **`GET /api/v1/reports/<module>.<name>`** (`views/module_reports.py`). The detail route matches
  dotted keys only, so no core report path can reach it. It refuses exactly what the list hides
  (404, 403 `module_disabled`, 403). CSV goes through `authorise_export` (cross-site, `reports.export`,
  budget spent on the file only), the audit row, BOM + CRLF, numbers as decimals and text
  neutralised. Registered-report files are streamed synchronously and capped at `MAX_EXPORT_ROWS`;
  the async >5,000-row path stays with the core exporters (it replays a source the job can find
  again). The core hub keeps its static catalogue, so `GET /reports` is `[]` for every tenant today.
- **`register_notification_type`** (`notifications/services/notify.py`): `<module>.<event>` codes
  only (BR-3, which also means a core code can never be re-registered); idempotent; reset.
- **`register_default_templates`** (`notifications/services/templates.py`): `<module>_<purpose>`
  (≤ 48), channel × locale, `en` required per channel (the resolver's fallback), never replaces an
  existing body, and the whole mapping is validated before anything is stored.
- **Imports** (`imports/registry.py`): `register` is idempotent for the same or an equal spec, and a
  different spec under a used kind still raises; `ImporterSpec.example_key` (default `name`) drives
  `is_example`; `_reset_for_tests`.
- **Settings** (`platform_app/settings_schema.py`): `register_setting_spec` accepts a module's own
  namespace only (not a core key, core prefix or core section; section = module code); plus
  `specs_for(tenant)`, `spec_for(tenant, key)` (module keys only while the module is effectively
  on), `module_of`, `_reset_for_tests`.
- **Frontend**: `features/reports/dashboardSections.ts` (keyed registry, each entry `dynamic()`),
  `components/DashboardModuleSections.tsx` (drawn only when the server returned the key AND a module
  registered a component; unavailable is a one-line card with Retry; module headings only when two
  or more modules contribute, titled `nav.module.<code>`). Dashboard types and service map
  `sections`. `features/reports/reportsRegistry.ts` + `api/moduleReportsService.ts` give the
  server∩client intersection (EC-2). **Hub rendering of module reports is deferred to the first
  vertical's reports task (library B15/F11)**, because there is nothing to lay out until then. One
  catalogue key was added in both languages (`reports.dashboard.section.unavailable`).

### Handed to Track P: settings wiring in `platform_app/services/tenant_settings.py`

That file is owned by A1/A12 (Track P), which is editing it now, so I did not touch it. The lead was
told by message. Until the patch below lands, a registered module key is neither shown nor writable,
which fails safe. No module registers one in Wave A.

```python
# _values_view(tenant, rows):   for key, spec in schema.specs_for(tenant).items():
# settings_payload(tenant):     "sections": {k: s.section for k, s in schema.specs_for(tenant).items()},
# preset_payload(tenant):       values = {k: s.default(tenant.business_type)
#                                         for k, s in schema.specs_for(tenant).items()}
# _validate_values(tenant, …):  spec = schema.spec_for(tenant, key)
# save_settings(…):             "schema_version": schema.spec_for(tenant, key).schema_version
```
The acceptance test for whoever applies it: register a probe spec for an enabled module and assert
it appears in `GET /tenants/current/settings` and is accepted by `PUT`; switch the module off and
assert it disappears and a `PUT` of it is 400 "This is not a setting." The schema half is tested in
`apps/platform_app/tests/test_setting_spec_registry.py`.

### Tests

Backend: `reports/tests/test_registry.py` 24, `common/tests/test_schedule_registry.py` 6,
`notifications/tests/test_module_registries.py` 17, `imports/tests/test_registry_idempotent.py` 5,
`platform_app/tests/test_setting_spec_registry.py` 11. Related suites (reports, notifications,
imports, platform_app, common, tests/): **1753 passed, 7 skipped**. Frontend: reports feature jest
**91 → 102** (dashboardSections 7 including parametrised cases, DashboardPageContent +4) plus
reportsRegistry 2; `tsc`, eslint, prettier and i18n:check are clean.

### Adversarial pass (self, no Agent tool)

- **Found and fixed:** the dashboard read `effective_modules` (plan and partner rows) on every
  request even with no section registered, which added queries to every merchant's landing screen
  today. A test that fails first proves zero queries now.
- Probed: a failing section that runs broken SQL (savepoint keeps the request alive); a section of a
  disabled module or without the codename; cached tiles with fresh sections; a core URL
  (`/reports/day-book`) against the generic route; CSV with a formula-leading cell and a negative
  Decimal; staff reading JSON but refused the CSV; template registration trying to overwrite a core
  body; a Hindi-only template; notification codes without a module prefix; a setting in `ledger.*`;
  a re-imported importer spec.
- Not built on purpose: the frontend wiring that makes a vertical's `register*` calls run (the first
  vertical's frontend shell decides where its registrations are imported; no core-to-vertical
  import is written ahead of it).

### Questions for the architecture owner

3. Where do verticals' frontend registrations (`registerDashboardSection`, `registerModuleReport`,
   A6's `registerPartyPanel`) get imported from? A core file importing each vertical's
   `register.ts` breaks the no-core-to-vertical direction; a build-time generated list, or
   `src/modules/registrations.ts` as the one sanctioned exception, both work. This needs deciding
   before library F01.
4. Registered-report CSVs are synchronous with the 1,00,000-row cap. If a module report can pass
   5,000 rows, the async path needs the registry's `csv` to be replayable by the export job
   (key → spec lookup), which is additive.
