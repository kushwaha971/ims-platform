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

---

## A16 — frontend shared primitives

Status: **done, merged** (commit `A16:` on main)

### Design note (review step)

Inputs: R33, R49, contracts §1.9 (frontend primitives), 10-architecture §6 items 4 and 6.

- `UbQrCode` moved (git rename) from `features/sales/components/print/` to
  `src/design-system/UbQrCode/`, exported from the barrel. Its test moved with it. Invoice A4 and
  80 mm, the public share page, the Collect sheet and the receipt import it from `src/design-system`.
- `src/print/` (new): `brandingPrintService.ts` (`PrintBranding` plus `getPrintBranding`, which reads
  through the branding feature's service inside the call), `printBrandingThunk.ts`
  (`printBranding/fetchPrintBranding`), `printBrandingSlice.ts` (lazily injected, reset by
  `resetAllFeatureState`), `usePrintBranding()` (fetch on mount, abort on unmount, the same
  lifecycle each screen had before).
- The two duplicated `branding` fields (`invoiceDetail`, `paymentReceipt`) and sales'
  `fetchPrintBranding`/`PrintBranding` are gone. `useInvoiceDetail` and `usePaymentReceipt` return
  `branding` from `usePrintBranding()`, so no component changed its props.
- The invalidation registry entry moved from the sales block to an `A16` block with the new
  prefix. `invalidation.registry.test.ts` now also walks `src/print/*Thunk.ts`, so the "every thunk
  registered, every prefix real" guarantee still covers the moved thunk.
- R49: `navigation/landing.ts` + `useLandingPath()`. The rule "dashboard with
  `reports.basic.read`, else the first nav item you can see" is exactly the navigation's order,
  because the dashboard row is first and is gated on that codename. `/dashboard` (every sign-in's
  address) now sends a non-reader to the first visible item instead of always to Customers, with a
  loop guard and Customers as the fallback when nothing is visible.

### Gates

- Full frontend jest (maxWorkers=1): **225 suites, 2631 tests, all green** (run before the last two
  test additions; `src/print` +3, the UbQrCode test moved, not added).
- `tsc`, eslint and prettier are clean on every changed file.
- Bundle, main vs branch, both built with hard-linked `node_modules` (the `vendor/ml-uikit`
  symlink also had to become a hard-linked copy: Turbopack will not follow a symlink out of the
  project root). **`sharedApp` 104.2 → 104.2 KB.** Routes: `/payments/[id]` 57.0 → 56.6,
  `/sales/invoices/[id]` 61.4 → 61.5, `/dashboard` 58.3 → 58.4, `/payments` 96.7 → 97.3, all within
  budget; `bundle:check` passes. No change to `bundle-budgets.json`, which stays the lead's.

### Adversarial pass (self, no Agent tool)

- The R49 test was run against the old page and fails there (it sends a billing-only member to
  `/parties`, which they cannot read).
- Added `src/print/usePrintBranding.test.tsx` for three risks: another business's letterhead
  surviving a sign-in (a reset clears it), a read landing after unmount, and extra wire fields
  leaking into what a sheet prints.
- No stale reference to `print/UbQrCode`, `salesThunk`'s `PrintBranding` or
  `invoice/fetchPrintBranding` remains anywhere (grep over ts, tsx, mjs and md).
- **Not done: the "look" step against a live stack.** The shared servers on :3000 and :8000 serve
  main and must not be restarted. The visible changes are none (the QR and the letterhead render
  from the same components with the same props) plus the landing redirect, which the component
  test drives through the router. The Wave A gate's QA pass at 390 and 1280 px should include a
  billing-only login landing on Bills and an invoice print with a logo.

---

## A15 — sales value credit lines (R51, ADR-057)

Status: **done, merged** (commit `A15:` on main)

### Design note (review step)

Inputs: contracts §1.5 (`CreditLine`, "Sales changes behind it"), R51, ADR-057, gym.md GYM-11 BR-3 to
BR-10 and the worked examples, and the real code: `credit_note_lines.py`, `credit_note_issue.py`,
`credit_notes.recompute`, `payload.apply_payload`, `tax_engine`, `credit_note_apply` (void),
`stock_link.restock_rows`, `reports/selectors/{gst,registers}.py`.

- **Schema** (`sales 0004_credit_value_lines`): `sales_document_line.credit_mode varchar(8)
  default 'qty'` + CHECK `credit_mode='qty' OR (credit_mode='value' AND against_line IS NOT NULL)`.
  `against_line_id` and the exact `taxable_value` (numeric(14,2)) already existed, so no other
  column is needed. The table is tenant-scoped through `document`, as before.
- **A value line** (`{"against_line_id", "taxable_value", "description"?}`) is built as ONE engine
  line: qty 1, exclusive, no discount, at the value, with the source line's tax code and
  snapshotted `tax_rate`/`cess_rate`. The engine therefore returns that taxable value to the
  paisa and the invoice line's tax on it, and the place of supply and reverse charge come from the
  invoice as for any note. The stored row has `qty = 1` and `unit_price = value`, which the print
  sheet renders as-is.
- **The cap** is by value across both modes: Σ `taxable_value` of issued, non-void credit lines
  against the line ≤ its taxable value. It is checked on the draft (advisory) and again on the
  LOCKED invoice lines at issue, the EC-9 pattern. A value line moves no `returned_qty` and no
  stock (restock gets quantity rows only), and on void it gives no quantity back
  (`_give_back_quantities` filter).
- **Refinement found while designing:** the value cap binds a *quantity* return only on a line a
  value credit has already touched. Separate partial returns each round to the paisa (SAL-04 EC-3,
  accepted), so their sum can pass the invoice figure by a paisa. A cap on every quantity return
  would have refused the counter's last unit, which is a behaviour change (see the adversarial
  pass).
- **One mode per note.** A quantity return carries a share of the invoice's document discount,
  which the engine spreads over every line of the note, so a mixed note would shave a value line's
  paise. This is refused with a message.
- **Reports:** a value credit reduces taxable and tax everywhere (rate-wise, HSN, CDNR, GSTR-3B
  3.1(a), register) but adds **no quantity** (HSN `total_qty`, register `s_qty`), because it changed
  the value of a supply, not the quantity supplied (`VALUE_CREDIT` in `reports/constants_tax.py`).
- **HTTP unchanged:** the counter's `CreditNoteLineSerializer` has no `taxable_value`, so value
  lines are service-level only, for the document port (A5). A test holds this.

### Files outside A15's Owns column (each minimal, labelled `A15`)

- `sales/services/credit_note_apply.py` (`_give_back_quantities` filter, 2 lines). A5 owns this
  file but has not started (it waits on A15); A5 rebases onto it.
- `sales/constants.py` (`CreditMode`), `reports/constants_tax.py` (`VALUE_CREDIT`),
  `reports/selectors/registers.py` (the line `s_qty` When). These three are in no task's Owns.

### Tests

`apps/sales/tests/test_value_credits.py`, 20 tests:
- gym.md's worked example to the paisa: 3,347.83 / 83.70 / 83.69 / 3,515.22 → 3,515.00 with
  round-off −0.22;
- no `returned_qty` and no stock; IGST inter-state;
- the cap on the draft, on the locked line, value-after-quantity and quantity-after-value;
- void frees the value and leaves `returned_qty`;
- validation (5 cases); one mode per note; no document discount on a value note; header-only
  PATCH round-trips a value line; the counter API stays quantity-only;
- **the reconciliation**: rate-wise = HSN = GSTR-3B 3.1(a) = register taxable (5,000.00 −
  3,347.83), tax heads equal, CDNR row exact, value line qty 0 in HSN and the register;
- two adversarial tests (below).

`apps/sales`, `apps/reports`, `apps/payments` and `tests/architecture`: **491 passed, 7 skipped**
before the two adversarial additions. The GST summary suite and every existing sales test are
green. `makemigrations --check` is clean.

### Adversarial pass (self, no Agent tool)

- Fuzzed the property the design rests on: 5,000 random values across every GST rate, with and
  without cess, intra- and inter-state. A one-unit exclusive line keeps its taxable value exactly
  and gets exactly the engine's documented heads.
- **Found and fixed (in design, locked by a test):** a naive value cap on quantity returns refuses
  unit-by-unit returns whose paise overshoot. The concrete case: 2 × ₹15.00 incl. 5% is ₹28.57 on
  the invoice and 2 × ₹14.29 = ₹28.58 returned. The test fails under the naive rule (verified by
  swapping it in) and passes under the real one.
- Concurrency: two notes for one line serialise on the party lock, then on the invoice-line lock;
  the credited sum is read after the lock, so the second sees the first.

### Questions for the architecture owner

5. A value line is stored as `qty 1 × taxable_value` and prints that way. Whether a CA wants the
   quantity column blank on a value credit note is a print question (gym T13's neighbour); the
   data would not change.

---

## A4b — held deposits (PLT-X02; R4, R12, R24, R35, R36, R37)

Status: **merged** — 51ec3df, fast-forwarded onto main at 2d5bccd (A4a ba2be39, A5, A6 and A7 were
already on main). The session was cut off by a usage limit once; the coordinator saved the work as a WIP commit
(9d73cb0), which was soft-reset and continued.

Checkpoint log:
- Backend built, 40 new tests green (adjustment refusal ×7, deposits ×23, API ×11).
- After the rebase: conflicts in `audit.py`, `error_codes.py`, `test_exceptions.py` (count now
  166), `invalidation/registry.ts` and `invalidation/map.ts`, all append-block unions.
- A wide run found five exact-list tests that did not expect payments' own targets. Four assert
  `targets_for_direction(...)` in full; they are now scoped to `bucket="main"` (and the purchases
  one also checks `auto_only`), which is what they meant. The allocation-target contract suite
  gained `held_deposit` and `held_deposit_refund` factories and a per-type settled status (`held`,
  `released`; `paid` for bills). The fifth, the 2,000-party plan test, is a planner flake under
  shared load: it passes on rerun and A4b touches no ledger query.
- A6's `register_archive_guard` is on main, so `deposits_archive_guard` is registered under
  `payments` (PLT-X04 BR-5, PLT-X02 EC-7). The A6 contract suite now drives it into refusing, and
  there is an HTTP test (409 `party_has_open_records`, then 200 after the return).
- Frontend is built. The pieces:
  - service, view-model, thunks and a lazy `deposit` slice;
  - registry and map entries, schemas, the hook with one idempotency key per act;
  - components: `DepositPanel` (party panel `payments.deposits`, rendered only when the party
    payload carries `depositHeld`), `DepositMoneyDrawer` (Take and Return: one form, two
    directions, `dynamic()`), `ApplyDepositDialog` (`dynamic()`), `print/DepositSlipPrint`
    (printed through a body portal plus an A4b print rule in `globals.css`);
  - the void dialog's `depositPair` consequence line;
  - locale keys: `ledger.mode.adjustment` "Adjustment · deposit", plus `payments.deposit.*` and
    `payments.void.consequence.depositPair`. `catalogues.json` gained three prefix lines so each
    label a server sends rides with the screen that shows it: `payments.off.` → settings,
    `payments.reports.` → reports, `payments.deposit.archiveBlock` → parties.

### Files outside A4b's Owns column (each minimal, labelled `A4b`)
- `common/constants.py` has the new `PaymentMode` and `MONEY_PAYMENT_MODES`. The ledger and
  expenses choices and validators switch to money-only, with the same stored values, so no
  migration is needed.
- `reports/selectors/cash_sources.py` (BR-10) and `reports/apps.py` (the report registration).
- Test edits:
  - `reports/tests/test_registry.py`: the exact list now includes the deposits report;
  - `payments/tests/test_payments_v2.py`, `purchases/tests/test_supplier_payment.py`,
    `payments/tests/test_decoupled_from_documents.py`: scoped to `bucket="main"`;
  - `tests/contracts/test_allocation_targets.py`: factories for the two deposit targets;
  - `tests/contracts/test_archive_guards.py`: a payments fixture.
- `parties/components/PartyModulePanels.tsx`: one side-effect import that registers the panel.
- `app/(app)/payments/[id]/page.tsx`: dropped `import catalogues/sales`. It was only there for
  A16's letterhead-error fallback key, which is now the shell's `error.generic`.
- `app/globals.css`: the A4b print block, appended.

### Adversarial pass (self, no Agent tool)
- **Held total drifted after a write.** The row was patched from the 201, but the panel's "₹N
  held" is the server's `meta.totals.held`, so it stayed on the old figure. Re-summing on the
  client would be money arithmetic (canon rule 3), so `deposit` joined the three writes' `refetch`
  lists. A test failed before the fix and passes after.
- **Letterhead fetched for every khata.** The panel called `usePrintBranding()` on mount, which is
  one extra request on every khata with a deposit panel. The panel now fetches the letterhead only
  when a slip is printed. The test run's ECONNREFUSED noise disappeared with it.
- **One idempotency key shared by three acts.** A dropped Take followed by a Return would have
  replayed the wrong endpoint's key. There is now one key per act.
- **Archive guard skipped when payments is switched off.** A6 skips guards of unreachable
  modules (BR-3), so with payments off an archive could go through while a deposit holds money.
  PLT-X10's module-off guard refuses to switch a deposit-writing vertical off while it holds
  money, but nothing refused switching payments itself off. Fixed: `payments` now has its own
  module-off guard, `held_deposit_counter` (label `payments.off.depositsHeld`), with a test.
- **Deposit words shipped with every payments screen.** They landed in the `payments` catalogue,
  which added 0.8 KB to /payments. They now have their own `deposits` catalogue, loaded only by
  the deposit components.

### Tests
- Backend, 42 new:
  - adjustment refused: 7 (payments 4, ledger 2, expenses 1);
  - `test_deposits.py`: 24, covering the worked example, the caps, voids and pairing, the replay
    fuzz, the cashbook, concurrency, list totals and both module-off guards;
  - `test_deposits_api.py`: 11, covering HTTP, permissions, idempotent replay, stale version,
    tenant isolation, the report, `deposit_pair`, and the archive refusal.
- Contract suites, 12 new parametrisations: two targets × five allocation clauses, and the
  payments archive guard × two.
- Frontend, 20 new: 18 across four suites (service, view-model, `ApplyDepositDialog`,
  `DepositPanel` including the print flow), plus the slip in `customerDocumentsCarryNoProductName`
  and the `depositPair` consequence.

### Gates (after the rebase onto 2d5bccd)
- Backend: the full suite (excluding performance) is green. A second run covered payments,
  platform, architecture, contracts and performance after the last change, also green.
  `makemigrations --check` reports no changes. black, isort and flake8 are clean on the changed
  files.
- Frontend:
  - `tsc` passes; eslint and prettier are clean on the changed files;
  - full jest: 253 suites. The one failure, the map test's lazy-slice import list, is fixed;
    the payments, parties, tests and print suites were rerun (57 suites, 818 tests);
  - `i18n:split` and `i18n:check` pass.
- Bundle, measured against a build of main with the same tooling:
  - main already exceeds 74 budgets; this branch exceeds 73;
  - shell +0.1 KB, /parties/[id] +0.2, /payments +0.1, /settings +0.3 (the module-off labels);
  - /payments/[id] −4.4 KB (it no longer loads the sales catalogue);
  - `bundle-budgets.json` is the lead's and is untouched.
- No "look" pass: this session has no browser on the stack, and the shared servers on :3000 and
  :8000 are not mine to restart.

### Questions for the architecture owner
1. FRD §7 says to register the panel "under the core key `deposits`". A6's registry requires
   `<module>.<name>` keys, so it is `payments.deposits`, gated on `payments` being enabled.
2. The khata's panel has no Adjust action. Apply needs the charges a vertical allows (§8), and the
   khata has no vertical context. Verticals render `DepositPanel` with `chargesFor`. Should the
   khata instead list the party's open `main` invoices?
3. The slip prints from the khata through a body portal plus a `data-printing-slip` rule. Should a
   `/deposits/[id]/print` route replace this when one exists?
4. `subject_label` is omitted from the detail response until a vertical resolves it (§6 lists it).

### Design note (review step, drafted while waiting)

Inputs: FRD 00 PLT-X02 (all 14 sections), contracts §1.4, ADR-044, R4/R12/R24/R35/R36/R37, A2's
buckets (`apply_entry` moves only `deposit_held` for bucket `deposit`, in the opposite sense) and
the A4a protocol v2 (`bucket`, `auto`, `payment_id`, `ctx`, one bucket per payment).

- **Migration** `payments 0004_held_deposit`, not the FRD's `0003_held_deposits` (plan §1.4
  reserves 0003 for A4a). Tables `payments_held_deposit` and `payments_deposit_application`
  exactly as FRD §5, including CHECKs, indexes and `tenant_data` registration. Also the payment
  CHECK `ck_payment_adjustment_is_whole`.
- `PaymentMode.ADJUSTMENT` goes in the `PaymentMode` block of `common/constants.py` (A4b owns it).
  It is refused by `record_payment`'s public validation, LED-01's entry validator and the expenses
  validator (R24), with one test each.
- `payments/services/deposits.py`: `open_deposit` (idempotent by module, subject and purpose while
  not released), `receive_deposit(opening=…)` (R37: mode forced to `adjustment`, receipt "Opening
  deposit"), `adjust_expected` (R35), `apply_deposit` (`_record_adjustment_pair`: OUT
  `held_deposit_refund`/deposit plus IN caller allocations/main, then the application row),
  `refund_deposit`, `deposits_for`, `cancel_expected_deposit` (EC-5). Locks: party → deposit →
  payments.
- Targets `held_deposit` (in, deposit, auto=False) and `held_deposit_refund` (out, deposit,
  auto=False), registered by payments itself.
- **Void pairing**: voiding either adjustment voids its partner and stamps `voided_at`; voiding a
  receipt that would push `held` below zero gives 409 `deposit_insufficient`.
- **Cashbook** (R4): `PaymentCashSource.rows` and `_NET_SQL` skip `adjustment` parts; the name is
  `cash_bucket` for the cashbook's notion.
- **API**: `GET /deposits`, `GET /deposits/{id}`, `POST /deposits/{id}/receive|apply|refund`.
- **Guards**: a per-module off-guard counter (`status <> 'released'`), via A12's
  `register_module_off_guard(label_id=…)`. The party archive guard (EC-4) goes through A6's
  `register_archive_guard` if A6 is merged by then; otherwise it is left as a note for A6.
- **Report**: "Deposits held" through A10's `register_report` (`payments.deposits_held`,
  `reports.financial.read`, CSV).
- **Frontend**: `features/payments/deposits/*`, i.e. the service, lazily injected slice and thunks,
  invalidations, `DepositPanel`, `ReceiveDepositDrawer`, `ApplyDepositDialog`,
  `RefundDepositDrawer`, `DepositSlipPrint`, and the void dialog's consequence line.
