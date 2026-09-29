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
