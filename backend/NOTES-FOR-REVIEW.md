# Notes for review — Sprint 0 backend

Everything below is a place where the specification said one thing and the
repository does another, or where the specification said two things. Nothing here
was decided quietly: each item names the chapter, the conflict and the choice.

## 1. Dependencies outside the ADR-021 allow-list that were *not* added

ADR-021 (canon §0.4) is a closed allow-list. These are named in the corpus but are
not installed, and the work they would have done is done without them.

| Package | Named in | What we did instead |
|---|---|---|
| `uuid6` | Part 20 §20.13.4 proposes it as "the single addition to the backend list", carrying a hypothetical ADR-021a | Implemented `uuid7()` from RFC 9562 §5.7 in `apps/common/db/fields.py` (~35 lines, with the §6.2 Method-1 monotonic counter). **Part 32 §32.3.8's risk register already decided this the other way** — "UUID v7 generation needs a library outside ADR-021 → Implement `uuid7()` in `apps/common/db/fields.py` in ~20 lines from RFC 9562; no dependency" — so the sprint plan and the architecture chapter disagreed and the sprint plan governs the sprint. `tests/architecture/test_dependencies.py::test_uuid7_is_implemented_in_house_not_installed` is which answer the repository implements. |
| `ruff` | Part 26 §26.14 gives a full `[tool.ruff]` configuration; Part 32 §32.3.3 task S0-02 requires `ruff check` to run | The configuration **is** committed in `pyproject.toml` verbatim, because Part 26 owns it. The package is not in `requirements/dev.txt`, because ADR-021's dev list is `pytest, pytest-django, black, isort, flake8, factory-boy`. `flake8` is installed and configured in `setup.cfg` with the subset of the same rules it can express. **Either ADR-021 gains `ruff` (and drops `flake8`) or Part 26 §26.14 drops the ruff block — they cannot both stand.** |
| `mypy` | Part 26 §26.12 R12.2 and task S0-02 ("mypy strict on `apps/*/services` and `apps/common`") | The `[tool.mypy]` configuration is committed; the package is not installed, same reason. Type hints are written everywhere R12.1 requires them, so turning mypy on later is an install, not a rewrite. |
| `django-debug-toolbar` | Part 20 §20.2.5 (`if settings.DEBUG: import debug_toolbar`) and §20.2.1 (`dev.txt`) | Not installed and not imported. `config/urls.py` keeps the `DEBUG`-only `static()` line and omits the toolbar include, so nothing fails at import when it is absent. |
| `psycopg` **is** installed (`psycopg[binary]`, which ADR-021 names) and `environs` **is** installed (ADR-021 names "python-decouple/environs"). | | |

`gunicorn` is in `requirements/prod.txt`. It is not in ADR-021's library list, but
ADR-019 and Part 20 §20.13.5 both specify it as the production server rather than
as a library; `test_prod_requirements_add_only_the_production_server` allows it and
nothing else.

## 2. Specification conflicts encountered

### 2.1 `reports.export` breaks canon §0.9's own format rule

Canon §0.9 states the format `<module>.<resource>.<action>` and then lists
`reports.export`, which has two parts. The registry reproduces canon **exactly**
(the registry test is the authority), so the format assertion in
`apps/common/tests/test_permissions.py` names the exception rather than widening
to "two or three parts" — widening it would let a genuine typo through.
`test_the_only_two_part_codename_is_the_documented_one` pins the exception set to
that one string. **Canon should either rename it `reports.report.export` or state
the exception.**

### 2.2 `platform_role_permission` versus `platform_role.permissions text[]`

Canon §0.6 lists a `platform_role_permission` table. Part 21 §21.3.1 instead puts
`permissions text[]` on `platform_role`, and Part 20 §20.1.2's list of the tables
the `platform` app owns has no `platform_role_permission` in it. Canon §0.12 T-08
makes Part 21 §21.3 the owner of table and column definitions, so the array column
is what is built and there is **no `platform_permission` or
`platform_role_permission` table**. The permission *catalogue* lives in code, in
`apps/common/permissions_registry.py`, which Part 20 §20.5.5 makes the authority
for the four system roles. `seed_reference_data` copies those sets into the rows
and `test_the_seeded_role_rows_never_diverge_from_the_code_registry` asserts they
never drift. **Canon §0.6 should drop the `platform_role_permission` entry.**

### 2.3 The claim query uses `clock_timestamp()`, not `now()`

Part 20 §20.8.5's `CLAIM_SQL` filters `run_after <= now()`. In PostgreSQL `now()`
is the *transaction start* timestamp. A job enqueued inside the transaction that
then claims — which is every test and every eager-mode run — is invisible to it,
and a long-lived runner transaction would never see work that became due during
it. The repository uses `clock_timestamp()`, which is the same instant in the
production path (the claim is its own single-statement transaction) and correct in
the others. The comment in `apps/common/jobs.py` says so.

### 2.4 `Membership.role_id` cascade

Part 21 §21.5's cascade table covers `User → membership` (CASCADE) but not
`Role → membership`. `platform_membership.role_id` is `ON DELETE RESTRICT` here,
consistent with rule 10's posture that a referenced master row is never silently
removed. Worth a line in §21.5.

### 2.5 Sprint 0 scope versus S0-39

Part 32 §32.3.4 puts `seed_tax_rates`, `seed_units` and `seed_expense_categories`
(S0-39) inside the Sprint 0 commitment, but S0-38 lists only the `platform` initial
migration. The seed command cannot be real without the tables it seeds, so three
small reference tables were built from their Part 21 specifications:
`tax_rate` and `tax_hsn` (§21.3.5), `inventory_unit` (§21.3.6) and
`expenses_category` (§21.3.10). Nothing else from those apps exists. The
alternative — a seed command that prints "not yet" — would have made S0-39's
acceptance check ("running twice changes no row count"; "`tax_rate` contains
`GST12` with `effective_to = 2025-09-21`") untestable, which is the thing Sprint 0
exists to avoid.

### 2.6 GST-2.0 slab dates

Part 21 §21.3.5 gives the code list and says `GST12` ends 2025-09-21, but gives no
`effective_from` for the reform slabs. `GST40` is seeded from **2025-09-22** (the
day after the stated boundary) and `GST28` is given the same `effective_to` as
`GST12`, since both are pre-reform slabs. If either is wrong it is a one-line seed
change, and `test_gst40_starts_at_the_reform_date` is where to change it.

## 3. Things deliberately left as shells

These have their signature, flags, exit-code contract and docstring, and an empty
body, because the tables they operate on do not exist until a later sprint. Each
says so in its own docstring rather than only here.

* `manage.py recalc_balances` — body lands with `LED-01` (Sprint 2).
* `manage.py recalc_stock` — body lands with `INV-06` (Sprint 5).
* `manage.py check_invariants` — body lands with the same two.
* `manage.py seed_demo_tenant` — Part 32 carries S0-40 into Sprint 1. Its refusal
  gate (`DEBUG=0` without `--force`) is implemented now, because that is the part
  that must never be forgotten.
* `apps/common/integrations/upi/qr.py::svg_qr` — raises `NotImplementedError`;
  `PAY-04` builds the encoder.
* `apps/common/tenancy.py::_resolve_impersonation` — returns `None`. There is no
  impersonation-grant table yet, and an unimplemented grant must not become an
  implicit one. `test_impersonation_claim_grants_nothing_without_a_grant` pins it.

## 4. Two `objects` managers on one model

`TenantModel` and `SoftDeleteModel` both declare `objects`. A model that inherits
both (today: `Party`) must re-declare `objects = SoftDeleteManager()` and
`all_objects = AllObjectsManager()` on itself, or which manager it gets depends on
the MRO rather than on intent — and the failure mode is silent: soft-deleted rows
come back. `apps/common/models.py` says so on `SoftDeleteModel`, and
`test_objects_hides_soft_deleted_rows_and_all_objects_shows_them` is the guard.
Part 26 R3.9 does not mention it.

## 5. `allocate_proportional` tie-breaking

Part 20 §20.7.3 says the residual of a document-discount split goes "to the largest
line" and, three rows later, that a payment-allocation residual is "absorbed by the
last document in FIFO order". Neither says what happens when two lines tie. This
implementation gives the residual to the **last** of the tied lines, so the two
rules of the same table do not disagree. `[100.00] / [1,1,1]` is therefore
`[33.33, 33.33, 33.34]`.

## 6. Additions to the normative middleware list

Part 20 §20.4.3 fixes `MIDDLEWARE`. One entry is added:
`django.middleware.clickjacking.XFrameOptionsMiddleware`, between
`CommonMiddleware` and `CsrfViewMiddleware`. Without it `prod.py`'s
`X_FRAME_OPTIONS = "DENY"` (which §20.13.4 does require) does nothing and
`manage.py check --deploy` reports `security.W002`. The three positions §20.4.3
actually fixes — request id first, tenant context after authentication, access log
last — are unaffected, and `test_the_middleware_order_is_the_normative_one`
asserts exactly those three.

## 7. `pg_column_size` needs raw SQL

`ck_job_payload_size` (Part 21 §21.3.1, `CHECK (pg_column_size(payload) < 65536)`)
cannot be written as a Django `CheckConstraint`, so it is added by
`apps/platform_app/migrations/0002_add_job_payload_size_check.py` with `RunSQL`
and a reversible `DROP CONSTRAINT`. It is therefore invisible to
`makemigrations --check`, which is why
`test_the_payload_ceiling_is_enforced_by_the_database` exercises it against the
real database rather than trusting the model.

## 8. Interfaces the repository-root infrastructure expects

`/home/claude/app/docker-compose.yml` (owned by the infrastructure work, not by
this package) builds `./backend` and expects three things the specification does
not name. All three are implemented:

* **`target: ${BACKEND_TARGET:-runtime}`** — the Dockerfile's final stage is named
  `runtime`.
* **`run_scheduler --loop`** — accepted, meaning "run continuously". It is the
  default whenever `--interval` is not 0; the flag exists so a long-lived service
  can state its intent. `--loop` with `--interval 0` resolves in favour of
  `--loop`.
* **`manage.py scheduler_health --max-age 300`** — implemented. It exits 1 when a
  job has been due and unclaimed for longer than `--max-age`, which catches a
  scheduler that is alive but wedged; a process liveness probe would not.

Two further notes on that file:

* It defaults `UB_SMS_BACKEND` to `platform.messaging.backends.ConsoleSmsBackend`
  and `UB_WHATSAPP_BACKEND` to `platform.messaging.backends.DeepLinkWhatsAppBackend`.
  The dotted paths this package implements are
  `apps.common.integrations.sms.console.ConsoleSmsBackend` and
  `apps.common.integrations.whatsapp.deep_link.WaMeBackend`
  (Part 20 §20.2.2's tree). Nothing imports the setting at Sprint 0, so nothing
  breaks today; **one of the two spellings has to give before `NTF-01`.**
* `backend/entrypoint.sh` existed when this work started (it is referenced from
  `scripts/wait-for-db.sh`). Part 20 §20.2.1 puts the entrypoint at
  `backend/docker/entrypoint.sh`, which is what the Dockerfile's `ENTRYPOINT`
  names. Rather than keep two copies that drift, `backend/entrypoint.sh` is now a
  three-line shim that `exec`s the canonical one, so either path works.

## 9. `get_effective_tenant` memoises on the underlying request

DRF wraps the Django `HttpRequest` in its own `Request`, and that wrapper proxies
attribute *reads* but not *writes*. Memoising `_ub_tenant` on the wrapper —
which is the literal reading of Part 20 §20.4.2 — resolves the tenant once per
wrapper and leaves the underlying request permanently `"unset"`, which is what
`TenantContextMiddleware` and the access log read. The memo therefore lives on
`getattr(request, "_request", request)`.
`test_the_tenant_is_resolved_once_per_http_request` pins it. Without this the
`X-Tenant-Scope` header of §20.4.3 is never emitted, which is how the bug was
found.
