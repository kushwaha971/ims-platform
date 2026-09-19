# Part 32 — Sprint Plan

This part converts the MVP scope of Part 12 and the dependency order of Part 13 §13.7 into a dated, committed sequence of sprints. It is the schedule the engineering task breakdown of Part 33 hangs from, and the thing an AI coding agent (Part 34) is pointed at when it asks "what do I build next?".

Everything here is normative in the same sense as the rest of the specification: a sprint's contents may be changed, but only by the mechanism in §32.16, and never silently. A feature that appears in no sprint is not in the MVP; a feature that appears in two sprints is a defect in this chapter.

---

## 32.1 Planning assumptions

### 32.1.1 Team shape

The plan assumes **one full-time developer working with an AI coding agent**, and it is written for that shape specifically rather than being a four-person plan with the numbers divided.

| Role | Who | Commitment | What they actually do |
|---|---|---|---|
| Lead developer | One person, full time | 5 days/week | Decomposes tasks against Part 33, directs the agent, reviews every diff, owns migrations, owns the release, owns the pilot relationship |
| AI coding agent | Claude-class model operating under Part 34 | Continuous, bounded by the developer's review throughput | Writes the code, the tests, the i18n keys and the migrations for one task at a time; never merges its own work |
| Product owner | The same person, wearing a different hat, two half-days a week | 1 day/week of the 5 | Accepts against FRD acceptance criteria, runs the demo script, makes cut-line calls |
| Design | None. Part 23 is the design authority | — | The design system is a specification, not a person; there is no design review loop in this plan |
| QA | None separate. Part 28 is the QA function | — | Quality is a gate in CI, not a stage after development |
| Pilot partner / merchants | External, from Sprint 6 onward | Ad hoc | Provide real data, receive weekly builds from Sprint 9 |

Three consequences follow from that shape, and they are the reason this plan does not look like a conventional agile plan.

**The bottleneck is review, not typing.** An agent can produce a viewset, its serializer, its tests and its i18n keys faster than a human can read them carefully. Every estimate in this chapter is therefore an estimate of *supervised throughput* — write, review, correct, re-review, merge — not of authoring time. Doubling the agent's speed does not halve a sprint.

**Context switching is the largest hidden cost.** One person cannot hold the invoice tax engine and the reminder scheduler in their head in the same week without both getting worse. Sprints are therefore themed tightly, and a sprint never mixes two modules that are structurally unrelated. Where a sprint contains two modules (Sprint 9, sales completion plus purchases) it is because they share a service shape and reviewing them together is cheaper than reviewing them apart.

**There is no parallelism to exploit, so there is no value in dependency-optimising beyond a strict linear order.** Conventional sprint planning spends effort finding work that can run concurrently. Here there is one worker, so the only question is order, and the order is dictated entirely by Part 13 §13.7.

### 32.1.2 Sprint length

**Two weeks — ten working days.** Not one, not three.

One-week sprints put a planning and review ceremony into every fifth working day, which at this team size is a 20 % ceremony tax for a team that has nobody to coordinate with. Three-week sprints let a mid-sprint slip hide for too long; with a single developer there is no second pair of eyes to notice that Tuesday of week two has gone wrong, so the feedback loop has to be short enough that the sprint boundary catches it.

Two weeks also aligns with the review cadence the pilot needs from Sprint 9 onward: a fortnightly build with a changelog is something a merchant will actually look at, where a weekly one is noise.

### 32.1.3 Velocity, and how it was derived

The unit is the **point**, defined concretely so that nobody has to calibrate by feel:

> **1 point = half a working day (≈ 4 hours) of developer-supervised agent output**, measured from the moment the task is picked up to the moment its PR is merged with all gates green.

That definition deliberately includes review, correction, test-writing and CI time, because those are where the time actually goes.

Deriving the sprint capacity:

| Step | Figure | Reasoning |
|---|---|---|
| Working days per sprint | 10 | Two five-day weeks |
| Half-days per sprint | 20 | The raw human ceiling if the developer wrote everything alone |
| Agent throughput multiplier | ×3.0 | Calibrated on the observed ratio for spec-complete, pattern-heavy CRUD work with an exhaustive style guide (Parts 25 and 26) and worked examples (Part 34 §34.6). It is lower than the ×5 sometimes claimed because review does not accelerate and because money, tenancy and immutability code is read line by line |
| Raw capacity | 60 points | 20 × 3.0 |
| Less ceremonies (§32.15) | −4 | Planning, review, retro, backlog grooming |
| Less pilot support and defect triage | −6 | Zero before Sprint 9, ~12 after; averaged |
| **Committed capacity** | **50 points** | The number a sprint may commit |
| Reserve | 10 points | Uncommitted. Absorbs the sprint's surprises without renegotiation |

**50 points committed, 60 available.** A sprint that finishes its commitment early pulls from the next sprint's list, in that sprint's declared order, and the pulled item's original sprint is credited. A sprint never invents work to fill the reserve.

Three honesty notes about this number. First, it is an estimate made before the build and will be wrong; Part 13 §13.8 requires that each sprint's actual points be recorded against its estimate, and §32.14 defines how the projection is re-based. Second, the multiplier is the single most fragile assumption in this chapter — if it turns out to be ×2.0 rather than ×3.0, the MVP takes 18 sprints rather than 12 and the cut-line policy of Part 12 §12.7 starts being exercised at Sprint 10. Third, Sprint 0 is deliberately estimated *without* the multiplier for its infrastructure half, because docker-compose files, CI pipelines and token pipelines are exactly the work an agent is worst at and a human is fastest at.

### 32.1.4 What a sprint commitment is

A sprint commitment is a list of task IDs from Part 33, not a list of features, and it carries four promises:

1. **Every committed task is decomposed before the sprint starts.** If a task's files, acceptance check and dependencies are not written down in Part 33 by the planning meeting, it cannot be committed. "We will figure out the shape of the reminder scheduler during the sprint" is not a commitment, it is a hope.
2. **Every committed task's dependencies are already merged.** A sprint never commits a task whose `depends_on` list contains an unmerged task from the same sprint *unless* both are committed and the order between them is recorded. Cross-sprint forward dependencies are forbidden outright.
3. **Every committed feature's exit is its FRD acceptance criteria**, demonstrated on the branch, not "the code is written". A feature whose AC-3 cannot be demonstrated is not done, regardless of how many of its tasks are merged.
4. **The commitment is a ceiling, not a target.** Delivering 42 of 50 committed points with everything demonstrable is a better sprint than delivering 50 with two features that pass no acceptance criterion.

### 32.1.5 What happens when a sprint misses

Missing is normal and the response is mechanical, so that it does not become a negotiation with oneself at 9 pm on a Friday.

**At the sprint boundary, every incomplete item is classified into exactly one of four buckets:**

| Bucket | Definition | Action |
|---|---|---|
| **Carry** | The feature is partially built and the remaining work is < 8 points | Carries into the next sprint as its *first* committed item, reducing that sprint's new commitment by the carried points. At most two carries per sprint |
| **Reset** | The feature is partially built and the remaining work is ≥ 8 points, or the approach was wrong | All of its merged code is reverted or feature-flagged off, the feature returns to the backlog, and its estimate is re-made. Half-built code is never left in `main` behind a `TODO` |
| **Split** | The feature has a demonstrable subset that meets a subset of its ACs, and the remainder is a named, specified reduction the FRD permits | The subset ships, the remainder becomes a new backlog item with its own ID, and a Part 39 entry records the split |
| **Cut** | The feature is on the cut-line list of Part 12 §12.7 and the sprint miss has put the launch date at risk | Cut per §12.7's fixed order, with its Part 39 entry. Never cut ad hoc, never cut out of order |

**Three consecutive sprints that miss by more than 20 % trigger a re-base**, not a heroic sprint. The re-base re-estimates every remaining sprint at the observed velocity (Part 13 §13.8: a phase that took 150 % of its estimate makes the next estimate 150 %), publishes the new launch date, and — if the new date is more than four weeks out from the committed one — starts the cut-line list from item 1.

**A sprint is never extended.** The boundary is a fixed date. Extending it destroys the only calibration signal the plan has.

### 32.1.6 What is deliberately not in this plan

No staffing ramp, no hiring plan, no "when we add a second engineer" branches. Adding a person mid-MVP to a codebase this specified would cost more in onboarding and review contention than it returns before launch; the plan assumes the team shape is constant to launch and revisited at the Phase 1 → Phase 2 boundary.

No buffer sprint between features and hardening. Hardening is Sprint 12, and it is a named sprint with content, not slack. Slack that is not named gets consumed by feature work.

No estimation in hours at the task level for anything below 0.5 points. Sub-half-day tasks are batched into their parent.

---

## 32.2 The sprint map at a glance

| # | Weeks | Theme | Features delivered | Pts | Cumulative MVP features |
|---|---|---|---|---|---|
| **0** | 1–2 | Chassis and walking skeleton | — (0 features; 100 % enabling) | 52 | 0 / 74 |
| **1** | 3–4 | Identity, tenancy, onboarding | PLT-01, PLT-02, PLT-03, PLT-04, PLT-15 | 50 | 5 |
| **2** | 5–6 | Governance and white-label | PLT-05, PLT-06, PLT-07, PLT-08, PLT-09, WLB-01, WLB-02 | 50 | 12 |
| **3** | 7–8 | Parties | PTY-01, PTY-02, PTY-03, PTY-04, PTY-05, PTY-06 | 49 | 18 |
| **4** | 9–10 | The ledger spine | LED-01, LED-02, LED-03, LED-04, LED-11 | 50 | 23 |
| **5** | 11–12 | Collections and messaging | LED-05, LED-06, LED-07, LED-08, NTF-01, NTF-02, NTF-03 | 50 | 30 |
| **6** | 13–14 | Inventory | INV-01 … INV-08 | 50 | 38 |
| **7** | 15–16 | Sales core: the tax invoice | SAL-02, SAL-03, SAL-06, SAL-07, SAL-08 | 50 | 43 |
| **8** | 17–18 | Payments and document↔ledger | PAY-01 … PAY-05, LED-09, LED-10 | 50 | 50 |
| **9** | 19–20 | Sales completion and purchases | SAL-01, SAL-04, SAL-05, PUR-01 … PUR-04 | 50 | 57 |
| **10** | 21–22 | Expenses, import and export | EXP-01, EXP-02, EXP-03, IMP-01, IMP-02, PTY-10, INV-09 | 50 | 64 |
| **11** | 23–24 | Reports | RPT-01 … RPT-08 | 50 | 72 |
| **12** | 25–26 | Platform close-out and launch hardening | PLT-10, PLT-14 + the whole of Part 12 §12.8 | 49 | **74 / 74** |
| — | 27 | **Release 1.0** | Launch | — | — |
| **13–15** | 28–33 | Phase 2 train 2.0 — inventory and purchases depth, help | INV-10 … INV-15, PUR-05 … PUR-08, HLP-01 … HLP-03 | 150 | 13 / 37 P2 |
| **16–18** | 34–39 | Phase 2 train 2.1 — partner platform and messaging | WLB-03 … WLB-06, NTF-04, NTF-05, NTF-06, LED-12, LED-13, PTY-07, PTY-08, PTY-09 | 150 | 25 / 37 |
| **19–21** | 40–45 | Phase 2 train 2.2 — payments, sales additions, reports | PAY-06, PAY-07, SAL-09, SAL-10, SAL-14, RPT-09 … RPT-12, EXP-04, IMP-03, PLT-11 | 150 | **37 / 37** |

Total to Release 1.0: **13 sprints, 26 weeks, 600 points.** Part 13 §13.2 estimates Phase 1 at 20–24 weeks with four to six engineers; 26 weeks with one engineer and an agent is consistent with that if the agent multiplier holds, and is the number this plan commits to.

### 32.2.1 Why this order and no other

Five ordering constraints, each traceable to Part 13 §13.7, produce the sequence above; every one of them is a "must land before" claim whose violation causes rework rather than inconvenience.

1. **The chassis before everything (Sprint 0).** Tenancy, the `Ctx` object, the tenant-scoped manager, the audit writer, the idempotency store, the money fields, `platform_job` and the response envelope are the substrate every subsequent line of business code sits on. Canon §0.11 rule 2 makes tenancy un-retrofittable: a `tenant_id` added in Sprint 6 means auditing and re-testing every queryset written in Sprints 1–5. Sprint 0 is therefore 100 % enabling work with zero features, and that is correct rather than wasteful.
2. **Platform before parties (Sprints 1–2 before 3).** A `Party` row needs a `Tenant` to belong to, a `Membership` to attribute its creation, a `Role` to gate it and a settings store to read `ledger.credit_limit_mode` from. Building parties first would mean stubbing four platform concepts and unstubbing them later.
3. **Parties before ledger (Sprint 3 before 4).** LED-01 §11 BR-2 posts against a party under a row lock and updates its denormalised balance; PTY-03 is the surface the ledger lives on. There is no meaningful ledger entry without a counter-party, and the party header is where the entry's result is displayed.
4. **Ledger before documents (Sprint 4 before 7–9).** LED-10 requires invoices, bills, payments and credit notes to post ledger entries that link back. If documents came first they would either post nothing and need rewriting, or the ledger would be designed around document shapes and the spine would invert — which is precisely the architecture Part 11 §11.2 exists to prevent.
5. **Inventory and tax before sales (Sprint 6 before 7).** SAL-02 deducts stock atomically at issue and resolves tax rates by document date. An invoice built against a placeholder item model gets the wrong line shape; a tax engine built before `tax_rate` has effective dates cannot handle the 2025-09-21 slab boundary that the GST fixture suite requires.

Two further placements are deliberate and worth stating because they look wrong at first glance:

**The design system is not a sprint.** It is spread across Sprints 0–3 as three waves (§32.3.4, §32.4.4, §32.5.4, §32.6.4), sized so that every `Ub*` component exists *before* the first screen that needs it. Part 23 §23.7 calls this the "Sprint 1–2 design-system workstream". Building it as one big sprint would delay the first demonstrable screen by a fortnight; building it lazily, component by component as screens need them, guarantees at least four screens get built twice — once with raw `ML*` primitives and again after the `Ub*` wrapper appears. The wave rule is: **a component enters the design system in the wave before the sprint whose features need it.**

**Reports are last within the phase.** Every report in RPT-01 … RPT-08 is a projection over data the other modules write (Part 13 §13.7, "reports last within a phase"). Building the GST summary before sales and purchases exist means building against a schema that is still moving. The cost is that the dashboard — the first screen a merchant sees — only appears in Sprint 11; the mitigation is that Sprint 1 ships a *skeleton* dashboard with real tiles wired to zeroed selectors, so the shell, the route and the empty states are proven early and Sprint 11 only fills in arithmetic.

---

## 32.3 Sprint 0 — Chassis and walking skeleton

**Weeks 1–2 · 52 points · 0 features**

### 32.3.1 Goal statement

> At the end of Sprint 0, `git clone && cp .env.example .env && docker compose up` on a clean machine produces a running application in which a seeded user logs in, a tenant-scoped `GET /api/v1/parties` returns an empty paginated envelope, and a Next.js screen at `/parties` renders that empty state through the `Ub*` design system in both English and Hindi — with the request traced end to end by one `X-Request-Id`, with CI green on lint, types, tests, architecture rules and migrations, and with no business logic written anywhere.

That sentence is the sprint's exit criterion, and it is deliberately one long sentence: the walking skeleton is a single thing, and a sprint that delivers nine of its ten parts has delivered none of it.

### 32.3.2 Why Sprint 0 exists at all, and why it is this long

Two weeks with no features is the most expensive-looking decision in this plan. It is also the cheapest thing in it, for one reason: every rule in Parts 25, 26 and 28 is either encoded in Sprint 0 or enforced by a human forever. A lint rule that forbids `Model.objects.filter()` without a tenant term, written once in Sprint 0, is worth more than a reviewer remembering to check it three hundred times. The AI coding agent of Part 34 pattern-matches against what already exists in the repository; if what exists in the repository is correct, the agent's output is largely correct, and if what exists is sloppy the agent industrialises the sloppiness. **Sprint 0 is the highest-leverage sprint in the project precisely because it sets the pattern the agent copies.**

### 32.3.3 Tasks — repository, tooling and CI

| ID | Task | Layer | Est | Acceptance check |
|---|---|---|---|---|
| S0-01 | Create the monorepo root with `backend/`, `frontend/`, `e2e/`, `docs/` (this specification, vendored), `Makefile`, `README.md`, `.gitignore`, `.editorconfig` | Infra | 0.5 | `tree -L 2` matches Part 20 §20.2.1 and Part 19 §19.2.1 |
| S0-02 | `backend/pyproject.toml` with `black`, `isort`, `ruff`, `mypy` (strict on `apps/*/services` and `apps/common`), `pytest` and `coverage` configuration per Part 26 §26.14 | Infra | 1 | `black --check`, `isort --check`, `ruff check`, `mypy` all run and pass on an empty tree |
| S0-03 | `backend/requirements/{base,dev,prod}.txt` containing exactly the ADR-021 allow-list, every version pinned with `==` | Infra | 0.5 | A test asserts every installed distribution appears in the ADR-021 list (`tests/architecture/test_dependencies.py`) |
| S0-04 | `frontend/package.json` with exactly the ADR-021 frontend allow-list; `package-lock.json` committed | Infra | 0.5 | `npm ci` reproducible; the same allow-list test in Jest |
| S0-05 | ESLint flat config with the import-zone rules of Part 25 §25.2/§25.17: no deep design-system imports, no `../../../`, no axios outside `api/`, no `any`, no default exports outside route files | Infra | 3 | Four deliberately-bad fixture files under `frontend/src/tests/lint-fixtures/` each fail with the expected rule id |
| S0-06 | Prettier, `tsconfig.json` with the four path aliases of Part 19 §19.2.6 and every strictness flag on | Infra | 0.5 | `npx tsc --noEmit` clean; an `any` in a scratch file fails the build |
| S0-07 | `Dockerfile` (backend, multi-stage, `python:3.12-slim-bookworm` pinned by digest) and `docker/entrypoint.sh` (wait-for-db, collectstatic, exec) | Infra | 2 | Image builds; entrypoint never runs `migrate` (Part 29 §29.4.1 step 5 is explicit) |
| S0-08 | `Dockerfile` (frontend, Next.js standalone output) | Infra | 1 | `node server.js` serves on :3000 from the built image |
| S0-09 | `docker-compose.yml` base with `db`, `backend`, `scheduler`, `frontend`; named volumes `ub_db_data`, `ub_media`, `ub_static`; healthchecks on all four | Infra | 3 | `docker compose ps` shows four healthy services; `docker compose down` preserves volumes |
| S0-10 | Compose overlays `docker-compose.dev.yml` and `docker-compose.prod.yml` (nginx, TLS, no bind mounts) per Part 29 §29.2.3 | Infra | 1 | Prod overlay starts nginx and proxies `/api` and `/` correctly |
| S0-11 | `.env.example` with every variable of Part 20 §20.13.2 and a safe default; `SECRET_KEY` generation documented | Infra | 0.5 | A settings test fails if any env var read at import time is missing from `.env.example` |
| S0-12 | GitHub Actions workflow implementing Part 29 §29.9.3: `check`, `test`, `e2e`, `traceability`; branch protection on `main` | Infra | 3 | A PR with a lint error, a failing test, a missing migration or an unimplemented traceability ID is each blocked |
| S0-13 | `Makefile` targets `check`, `test`, `e2e`, `ci`, `up`, `seed`, `deploy` | Infra | 0.5 | `make ci` reproduces the pipeline locally |
| S0-14 | Pre-commit hooks (husky on the frontend, a git hook on the backend) running formatters only — never tests | Infra | 0.5 | Commit with unformatted code is auto-formatted, not rejected |

**Subtotal: 18 points.**

### 32.3.4 Tasks — Django project skeleton and app boundaries

| ID | Task | Layer | Est | Acceptance check |
|---|---|---|---|---|
| S0-20 | `config/` with `settings/{base,dev,prod,test}.py`, `urls.py`, `wsgi.py`, `asgi.py`; settings read env through `environs` | BE | 2 | `manage.py check --deploy` clean under `prod`; `DEBUG=False` asserted by `tests/architecture/test_settings.py` |
| S0-21 | All fifteen app packages created with `apps.py`, `models.py`, `migrations/__init__.py`, an empty `services/`, `selectors/`, `serializers/`, `views/`, `tests/` — including `apps/platform_app/` with `label = "platform"` and `apps/help/` as an empty Phase 2 placeholder | BE | 2 | `python manage.py showmigrations` lists all fifteen labels; `platform_app` declares `label="platform"` |
| S0-22 | `tests/architecture/test_import_rules.py` — the AST walker enforcing rules D1–D9 of Part 20 §20.1.4 with the declared dependency matrix | Test | 3 | A deliberate `from apps.sales import ...` at module level in `apps/parties/` fails the test with a named message |
| S0-23 | `apps/common/db/fields.py` — `MoneyField`, `QuantityField`, `UnitCostField`, `RateField`, `uuid7_pk()` | BE | 2 | Round-trip test: `Decimal("1234.567")` into `MoneyField` raises; `"1234.56"` stores exactly |
| S0-24 | `apps/common/models.py` — `TimeStampedModel`, `TenantModel`, `SoftDeleteModel`, `ImmutableModel` | BE | 1 | A model inheriting `TenantModel` gets `id`, `tenant`, `created_at`, `updated_at`, `created_by` with the Part 21 §21.1 semantics |
| S0-25 | `apps/common/managers.py` + `tenancy.py` — `TenantQuerySet`, `TenantManager`, `get_effective_tenant()`, `TenantContext`, `current_tenant()`; `objects` scoped, `all_objects` unscoped and audited | BE | 3 | `Model.objects.all()` outside a tenant context raises; `all_objects` is importable only from an allow-listed module |
| S0-26 | `apps/common/middleware.py` — `RequestIdMiddleware`, `TenantContextMiddleware`, `AccessLogMiddleware` | BE | 2 | `X-Request-Id` echoed on every response including errors; tenant resolved from the `tid` claim only, never a header |
| S0-27 | `apps/common/exceptions.py` + `responses.py` + `renderers.py` — the `DomainError` hierarchy, `drf_exception_handler`, `StandardResponse`, `EnvelopeJSONRenderer` | BE | 3 | Every Part 22 §22.1 status code and error code shape produced by a fixture view; envelope asserted |
| S0-28 | `apps/common/pagination.py` + `filters.py` — `PagePagination`, `CursorPagination`, `BaseTenantFilterSet` | BE | 2 | `meta` shape matches Part 22 §22.1 for both styles |
| S0-29 | `apps/common/audit.py` — `write_audit()`, `AuditAction` constants, `diff_fields()`; `platform_audit_log` model and migration | BE | 2 | One audit row per call with `before`/`after` per Part 21 §21.7; lazy model import proves rule D1 |
| S0-30 | `apps/common/idempotency.py` + `platform_idempotency_key` model — claim, replay and conflict per Part 22 §22.1 | BE | 3 | Replay returns identical body plus `Idempotent-Replayed: true`; different body → 409 `idempotency_conflict` |
| S0-31 | `apps/common/money.py` — `D()`, `q2()`, `q3()`, `q4()`, `half_up()`, `allocate_proportional()` | BE | 2 | A table-driven test of 40 rounding cases including the `.005` boundary in both directions |
| S0-32 | `apps/common/dates.py` — `tenant_today()`, `fy_label_for()`, `fy_bounds()` | BE | 1 | 31 March / 1 April boundary in `Asia/Kolkata` correct at 23:30 UTC |
| S0-33 | `apps/common/jobs.py` + `platform_job` model and migration per Part 20 §20.8.2, with all five indexes and both check constraints | BE | 3 | `enqueue()` dedupes on `idempotency_token`; `scheduled_key` unique index rejects a double schedule |
| S0-34 | `manage.py run_scheduler` — claim loop with `skip_locked`, visibility timeout, backoff, dead-letter; `scheduler` compose service invoking it | BE | 3 | Two runners started concurrently process each job exactly once (`T-CONC-*`) |
| S0-35 | `apps/common/permissions.py` + `permissions_registry.py` — the canon §0.9 codename registry, the four system roles' codename sets, `HasPermission`, `ModuleEnabled`, `PlanLimit`, `IsSuperAdmin` | BE | 3 | A test asserts the registry equals canon §0.9 exactly, string for string |
| S0-36 | `apps/common/viewsets.py` — `TenantScopedViewSet`, `TenantScopeMixin`, `ReadWriteSerializerMixin`, `TenantPrimaryKeyRelatedField` | BE | 2 | A fixture viewset inheriting it returns 404 for a cross-tenant id with no extra code |
| S0-37 | `apps/common/logging.py` — `JsonFormatter`, request-id filter, `ub.<app>` logger tree; no PII assertions | BE | 1 | A log line contains `request_id` and `tenant_id`; a test asserts no mobile number pattern reaches the handler |
| S0-38 | The first migration: `platform` initial (tenant, partner, plan, user, membership, role, session, otp_challenge, tenant_setting, document_sequence, audit_log, job, idempotency_key) | DB | 3 | `migrate` forward clean; `migrate platform zero` reverses clean; `makemigrations --check` clean |
| S0-39 | `seed_all` and its component commands — `seed_roles`, `seed_plans`, `seed_partners`, `seed_units`, `seed_tax_rates` (with the 2025-09-21 boundary), `seed_expense_categories`, `seed_hsn` | BE | 3 | Idempotent: running twice changes no row count; `tax_rate` contains `GST12` with `effective_to = 2025-09-21` |
| S0-40 | `create_superadmin` and `seed_demo` (refuses under `DEBUG=0` without `--force`) | BE | 1 | Demo tenant has ~120 ledger entries and one of every master |
| S0-41 | `GET /system/health` and `GET /system/version` with build metadata from build args | BE | 1 | Version returns commit SHA baked at build time |
| S0-42 | `pytest` harness: `conftest.py` with `tenant`, `user`, `api_as(role)`, `two_tenants_full` fixtures; factory-boy factories for the platform models | Test | 3 | `two_tenants_full` seeds one of every entity in both tenants |

**Subtotal: 51 points across the backend chassis — of which 33 land in Sprint 0 and the remainder (audit detail, job retry/backoff polish, seed HSN) carries into Sprint 1 by design.** The Sprint 0 commitment takes S0-20 … S0-31, S0-33 … S0-36, S0-38, S0-39, S0-41 and S0-42; S0-32, S0-37 and S0-40 are Sprint 1's first items.

### 32.3.5 Tasks — Next.js skeleton, design-system wave 0 and the token pipeline

| ID | Task | Layer | Est | Acceptance check |
|---|---|---|---|---|
| S0-50 | `frontend/` scaffolded to the exact Part 19 §19.2.1 tree, with every directory present and an empty `.gitkeep` where a folder has no file yet | FE | 1 | `tree src app locales public` matches §19.2.1 line for line |
| S0-51 | `app/layout.tsx`, `globals.css`, `not-found.tsx`, `error.tsx`; the four route groups `(auth)`, `(app)`, `(public)`, `(internal)` with their layouts | FE | 2 | `(app)/layout.tsx` renders `UbAppShell`; `(auth)` renders the centred card with no shell |
| S0-52 | `ml-uikit` integrated: package installed from the internal registry, its stylesheet imported in `globals.css`, one `ML*` primitive rendered end to end | DS | 2 | An `MLButton` renders with `ml-uikit` styles and no MUI, no CSS-scoping script |
| S0-53 | **Koper token pipeline**: `tokens/spacing.css`, `typography.css`, `elevation.css`, `motion.css`, `colour.css` re-hued to the Part 23 §23.2.4 blue light-first theme; the shadcn alias layer; `tailwind.config.js` mapping per §23.2.5; the `ds-*` typography plugin | DS | 5 | Every token in Part 23 §23.2 exists as a CSS custom property; a Tailwind class `text-ds-h3` resolves; no hex literal appears outside `tokens/` |
| S0-54 | `scripts/check-contrast.mjs` — asserts the Part 23 §23.6 contrast pairs and runs in CI | DS | 1 | Changing `--primary-500` to a failing value breaks CI with a named pair |
| S0-55 | `ThemeProvider` + `useWhiteLabelTheme` — `data-theme` on `<html>`, `prefers-color-scheme`, the tenant `--primary-*` ramp applied from `whiteLabelSlice` before hydration | DS | 3 | No flash of unstyled theme; the ramp is applied in a blocking inline script |
| S0-56 | **Design-system wave 0**: `UbPageShell`, `UbPageHeader`, `UbCard`, `UbSkeleton`, `UbEmptyState`, `UbSnackbar`, `UbStatusBanner`, `UbStatusBadge`, `UbAmount` — each built to the exact §23.4 template with `memo`, `displayName`, `className` last, `index.ts`, barrel line, Jest test and gallery entry | DS | 8 | Nine components in `app/(internal)/design-system`; each has a passing `*.test.tsx` covering render, every variant and a11y roles |
| S0-57 | `src/api/AxiosInstances.ts` — one instance, cookie-Bearer interceptor, `X-Request-Id`, `Accept-Language`, the single-flight refresh-on-401 queue of Part 19 §19.4.3, `handleAxiosError` | FE | 5 | Two concurrent 401s trigger exactly one refresh; both original requests replay |
| S0-58 | `src/api/APIPaths.ts` — every canon §0.8 path as a typed constant; `src/constants.ts` with env-backed `API_BASE_URLS` | FE | 2 | A test asserts every path in canon §0.8 has a constant and no constant is unused-and-undocumented |
| S0-59 | `src/utils/apiError.ts` (`toApiError`, `ApiErrorShape`), `caseMapper.ts`, `queryString.ts`, `cn.ts`, `money.ts` (`formatInr` with Indian grouping), `quantity.ts`, `dates.ts` (`todayInTenantTz`), `cookieUtils.ts`, `storage.ts` | FE | 5 | `formatInr("123456.5")` → `₹1,23,456.50`; each util has ≥ 95 % line coverage |
| S0-60 | `src/redux/store.ts` with typed `RootState`/`AppDispatch`, the `resetAllFeatureState` action, and the cross-feature slices `snackbarSlice`, `sessionSlice`, `whiteLabelSlice`, `localeSlice`, `themeSlice` | FE | 3 | Dispatching `resetAllFeatureState` clears every registered feature slice |
| S0-61 | `src/hooks/useValidationSchemas.ts` — the central i18n-aware validator hook with `mobileValidation()`, `gstinValidation()` (mod-36 checksum), `panValidation()`, `pincodeValidation()`, `amountValidation()`, `quantityValidation()`, `dateNotFutureValidation()`, `requiredString()` | FE | 5 | Each validator's message comes from `t()`; a Hindi locale run produces Hindi messages; GSTIN checksum table-tested |
| S0-62 | `src/hooks/useTranslation.ts`, `react-intl` provider, `locales/en.json` and `locales/hi.json` seeded with the shell and common keys; `npm run i18n:check` comparing key sets | FE | 3 | Adding a key to `en.json` only fails `i18n:check` with the key name |
| S0-63 | `src/hooks/` — `useDebounce`, `useExclusiveModal`, `useIdempotencyKey`, `usePermissions`, `useOnlineStatus`, `useUnsavedChangesGuard` | FE | 3 | `useIdempotencyKey` returns a stable uuid across re-renders and rotates only on explicit reset |
| S0-64 | `src/components/layout/` — `UbAppShell`, `UbSidebar` (entitlement-driven `sidebarConfig`), header with tenant switcher stub, `UbBottomNav`, snackbar host | FE | 5 | Sidebar hides a module absent from `enabled_modules`; bottom nav appears below `md` only |
| S0-65 | Jest + RTL harness: `setupTests.ts`, `renderWithProviders.tsx` (store + Intl + Theme + Router), fixtures directory | Test | 2 | A component test can render any `Ub*` with one call |
| S0-66 | PWA manifest, icons 192/512 maskable, self-hosted Inter / Noto Sans Devanagari / IBM Plex Mono with `font-display: swap` | FE | 2 | Lighthouse "installable" passes; Devanagari matras are not clipped at line-height 1.5 |
| S0-67 | Playwright harness in `e2e/` with the smoke tag, the `seed_e2e` fixture, and mobile-viewport project at 360 px | Test | 2 | `npx playwright test --grep @smoke` runs against compose |

**Subtotal: 59 points across the frontend chassis — of which 19 land in Sprint 0** (S0-50 … S0-58, S0-60 partial, S0-62 partial, S0-65) **and the remainder is Sprint 1's design-system wave 1 and utility completion.** This split is deliberate: Sprint 0's frontend obligation is only what the walking skeleton needs.

### 32.3.6 The walking-skeleton proof

The last two points of Sprint 0 buy exactly one vertical slice, and it is not a feature:

| ID | Task | Layer | Est | Acceptance check |
|---|---|---|---|---|
| S0-70 | `apps/parties/` with the `Party` model (full Part 21 §21.3.3 columns), its initial migration, a read-only `PartyViewSet` inheriting `TenantScopedViewSet` with `PartyListSerializer` and `PartyFilterSet` stubbed to `q` only, and `list_parties()` in `selectors/party.py` | BE | 3 | `GET /api/v1/parties` as tenant A returns `{"data": [], "meta": {"page":1,"page_size":25,"total":0,"total_pages":0}}`; as an unauthenticated caller, 401 |
| S0-71 | `features/parties/` with `api/partyService.ts`, `redux/partyListSlice.ts` + `partyListThunk.ts`, `types/party.types.ts`, and `components/PartyListPageContent.tsx` rendering `UbPageShell` → `UbPageHeader` → `UbEmptyState` (first-use variant) with a loading `UbSkeleton` and an error state carrying the request id | FE | 3 | `/parties` shows the skeleton, then the first-use empty state; killing the backend shows the error state with the request id visible |
| S0-72 | `app/(app)/parties/page.tsx` — the thin route: `Suspense` wrapper + `<PartyListPageContent/>` | FE | 0.5 | The route file is under 15 lines and contains no logic |
| S0-73 | E2E `@smoke`: log in as the seeded user, land on `/parties`, assert the empty state in `en`, switch locale to `hi`, assert the Hindi string | Test | 1.5 | Passes in CI against compose, at 360 px and at 1280 px |
| S0-74 | Trace the whole slice: one `X-Request-Id` minted in the browser appears in the Next.js server log, the Django access log, the DRF response header and the error envelope | Infra | 1 | Grepping the compose logs for the id returns ≥ 3 lines from ≥ 2 services |

**Subtotal: 9 points.**

Note what this slice deliberately is not. It has no create form, no permissions beyond authentication, no balance, no totals and no filters. It exists to prove the *path* — browser → Next route → thin page → feature component → thunk → service → axios → interceptor → DRF → tenant middleware → viewset → selector → manager → Postgres, and back — and to prove that CI, the envelope, the request id, the design system, i18n, the store and the Docker topology all cooperate. PTY-02 proper is built in Sprint 3 on top of it.

### 32.3.7 Sprint 0 exit criteria

- [ ] `make ci` green from a clean clone on a machine that has never seen the project
- [ ] The Part 29 §29.4.1 bootstrap sequence executed verbatim, timed, and the timings recorded in the README
- [ ] `docker compose ps` shows `db`, `backend`, `scheduler`, `frontend` healthy
- [ ] `tests/architecture/test_import_rules.py` passes and fails correctly on a deliberately-bad import
- [ ] The dependency allow-list test passes on both stacks
- [ ] The contrast script passes and fails correctly on a deliberately-bad token
- [ ] `npm run i18n:check` passes and fails correctly on a one-sided key
- [ ] The walking skeleton renders in `en` and `hi` at 360 px and 1280 px
- [ ] A cross-tenant `GET /parties/{id}` with tenant B's id returns 404, not 403 — proven by test, even though the detail route is otherwise unused
- [ ] Zero business logic exists in the repository: a grep for `balance`, `tax`, `gst`, `invoice` outside `models.py`, `docs/` and seeds returns nothing

### 32.3.8 Sprint 0 risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `ml-uikit` is not installable from the environment available (private registry, auth, peer-dependency conflict with React 18.3 / Next 16) | Medium | High — the entire design-system layer blocks | Resolve on **day 1**, not day 8. If it cannot be installed, the fallback is a vendored copy of the primitives actually used (Part 23 §23.3 lists 30), recorded as an ADR amendment, and the `Ub*` layer is unchanged because features never import `ML*` directly |
| Koper token values are not available in a usable form and must be reconstructed from Part 23 §23.2 alone | Medium | Medium — a week of colour fiddling | Part 23 §23.2 is treated as complete and authoritative; anything absent from it is invented once, recorded in the tokens file with a comment, and never revisited |
| UUID v7 generation needs a library outside ADR-021 | Low | Low | Implement `uuid7()` in `apps/common/db/fields.py` in ~20 lines from RFC 9562; no dependency |
| The agent multiplier does not apply to infrastructure work and Sprint 0 overruns | High | Medium | Already priced in: Sprint 0's infrastructure tasks are estimated at ×1.0, not ×3.0. If it still overruns, Sprint 1 absorbs the carry and the re-base happens at Sprint 3, not Sprint 12 |
| Over-building the chassis — generic abstractions for Phase 3 needs | Medium | High — invisible cost, paid every sprint | Part 13 §13.5's rule applies: no nullable column, abstraction layer or config switch "for later". The reviewer's question on every Sprint 0 PR is "which MVP feature needs this?" |

---

## 32.4 Sprint 1 — Identity, tenancy and onboarding

**Weeks 3–4 · 50 points · PLT-01, PLT-02, PLT-03, PLT-04, PLT-15**

### 32.4.1 Goal statement

> A new merchant opens the app, picks Hindi, enters a mobile number, receives an OTP in the backend log, verifies it, completes a four-question onboarding wizard, and lands on a dashboard shell inside their own tenant — with a second tenant created by a second mobile proving isolation at the UI level, and a tenant switcher working between them.

### 32.4.2 Dependencies consumed

Sprint 0 in its entirety: the tenant model and manager, `Ctx`, the envelope, JWT-less session plumbing, the store, the validator hook, design-system wave 0.

### 32.4.3 Dependencies produced

A real authenticated session with a `tid` claim, a real `Tenant` with settings and a document-sequence set, a real `Membership` with a role, and `permissions[]` on the client — which everything from Sprint 2 onward assumes.

### 32.4.4 Tasks

**Backend**

| Group | Tasks | Est |
|---|---|---|
| Carried chassis | S0-32 (`dates.py`), S0-37 (logging), S0-40 (`create_superadmin`, `seed_demo`), S0-39 completion (`seed_hsn`) | 4 |
| PLT-01 OTP | `platform_otp_challenge` service (`request_otp`, `verify_otp` with hash, expiry, attempt count, throttle), `ConsoleSmsBackend` writing `notifications_message_log`, `purge_otp_challenges` scheduled job, `POST /auth/otp/request` and `/verify`, throttle classes at 5/mobile/10 min and 20/IP/hour | 8 |
| PLT-01/02 session | SimpleJWT configuration with the `sub`/`tid`/`rol`/`sid`/`ver` claims, `platform_session` refresh families with reuse detection, httpOnly cookie transport with CSRF double-submit, `POST /auth/refresh`, `/logout`, `GET /auth/me` | 8 |
| PLT-02 password | `set_password`, `reset/request`, `reset/confirm`, `POST /auth/login`, generic `invalid_credentials` | 3 |
| PLT-03 onboarding | `create_tenant()` service: tenant row, owner membership, `MAIN` location, FY document sequences for every kind, business-type setting preset, default branding; `POST /tenants` and `GET/PATCH /tenants/current` | 6 |
| PLT-04 switch | `POST /auth/switch-tenant` re-issuing the token; membership list on `/auth/me` | 2 |
| PLT-15 entitlements | `platform_plan` seeding, `PlanLimit` permission enforcement on party/invoice/user counts, `plan_limits` on `/auth/me`, `403 plan_limit_reached` | 3 |

**Frontend**

| Group | Tasks | Est |
|---|---|---|
| Design-system wave 1 | `UbField`, `UbForm`, `UbPhoneInput`, `UbMoneyInput`, `UbQuantityInput`, `UbPercentInput`, `UbDateInput`, `UbDialog`, `UbConfirmDialog`, `UbDrawer`, `UbTabs`, `UbFileUpload` — template, tests, gallery | 10 |
| Auth screens | `(auth)/login`, `/otp`, `/set-password`, `/forgot-password` with `sessionSlice`, `authService`, `authThunk`, the six-box OTP input with `autocomplete="one-time-code"`, countdown, throttle banner | 6 |
| Onboarding wizard | `(auth)/onboarding` four steps, business-type cards, GST-type branch with GSTIN validation, resume from `onboarding_step` | 5 |
| Tenant switch | Header switcher, `switchTenant` thunk, full store reset on switch (`resetAllFeatureState`) | 2 |
| Route guards | Authenticated/unauthenticated guards, `next` parameter, expired-session experience | 2 |
| Dashboard shell | `(app)/dashboard` with seven `UbStatCard` tiles wired to a zeroed selector and a first-use empty state — the skeleton Sprint 11 fills in | 2 |

*(Committed total trimmed to 50 by deferring three design-system components of wave 1 — `UbFileUpload`, `UbPercentInput`, `UbQuantityInput` — to wave 2, since no Sprint 1 or 2 screen needs them.)*

### 32.4.5 Demo script

1. Open the app on a phone-width window. Pick **हिन्दी**. Every subsequent string is Hindi.
2. Enter a mobile number, tap "कोड भेजें". Show the OTP in `docker compose logs backend`.
3. Enter the code. Land on the name + password screen; skip the password.
4. Run the wizard: "Sharma General Store", Kirana/retail, unregistered, Maharashtra. Under 90 seconds from the first screen.
5. Land on the dashboard with seven zeroed tiles and a first-use empty state.
6. Open a second browser profile, sign up a second merchant, switch back to the first. Show that the tenant name in the header changed and the store was reset.
7. Show `GET /auth/me` returning `permissions[]` for the owner role and `plan_limits`.
8. Attempt `GET /api/v1/tenants/current` with tenant B's cookie and tenant A's id — 404.

### 32.4.6 Exit criteria

- [ ] `T-PLT-01-*`, `T-PLT-02-*`, `T-PLT-03-*`, `T-PLT-04-*`, `T-PLT-15-*` all implemented and green
- [ ] OTP throttle proven at both limits; the 5-attempt invalidation proven
- [ ] Refresh-family reuse detection revokes the family (`T-PLT-09` prerequisite)
- [ ] A tenant created by the wizard has: owner membership, `MAIN` location, document sequences for all twelve kinds for the current FY, and the business-type setting preset
- [ ] Cross-tenant sweep green on every route added this sprint
- [ ] `en`/`hi` complete; `i18n:check` clean
- [ ] Auth bundle < 120 kB gzipped (PLT-01 §5)

### 32.4.7 Risks

| Risk | Mitigation |
|---|---|
| Cookie + CSRF + refresh-queue interaction is subtle and produces intermittent logout loops | Build the single-flight queue's test first (two concurrent 401s → one refresh) before any screen uses it; this test was already written in Sprint 0 |
| The onboarding wizard grows past four questions because "we need the address anyway" | PLT-03 FR list is the ceiling. Address is collected in PLT-07, not here. A fifth question is a Part 39 change |
| Business-type presets get hard-coded into behaviour rather than defaults | Canon §0.2: business type "never hard-wires behaviour". A test asserts that flipping every preset setting after onboarding produces the same behaviour as choosing a different type at onboarding |

---

## 32.5 Sprint 2 — Governance and white-label

**Weeks 5–6 · 50 points · PLT-05, PLT-06, PLT-07, PLT-08, PLT-09, WLB-01, WLB-02**

### 32.5.1 Goal statement

> The owner invites a staff member by mobile; the staff member joins, sees a reduced navigation, and is blocked from an owner-only endpoint with a 403 carrying a permission code. The owner sets the business profile, the numbering series and the branding; the logo and primary colour appear in the app shell within one render. Every action either took is visible in the audit log with a before/after, and the owner can revoke the staff member's device.

### 32.5.2 Dependencies consumed

Sprint 1's session, membership and role plumbing; Sprint 0's audit writer and permission registry.

### 32.5.3 Dependencies produced

**This sprint produces the permission surface every later sprint tests against.** From Sprint 3 onward, every feature's permission matrix test (Part 28 §28.2.2) runs against real roles rather than a fixture. It also produces the settings store that LED-01's credit-limit mode, SAL-02's default due days and INV-06's negative-stock flag read from, and the branding that every print template uses.

### 32.5.4 Tasks

**Backend**

| Group | Est | Notes |
|---|---|---|
| PLT-05 team & roles: `platform_invitation`, invite/accept/suspend/remove services, `GET /memberships`, `POST /memberships/invite`, `PATCH`/`DELETE`, last-owner guard (409), `ver` claim bump forcing re-auth on role change, `GET /roles`, `GET /permissions/me` | 7 | The `ver` bump is the mechanism by which "forced logout on role change" works; it is not cuttable (Part 12 §12.7 item 3) |
| PLT-06 tenant settings: `platform_tenant_setting` service with per-key JSON-schema validation, `GET`/`PUT /tenants/current/settings`, the well-known key catalogue of Part 21 §21.3.1, numbering-series editing with a "cannot lower `next_number`" guard | 6 | |
| PLT-07 business profile: `PATCH /tenants/current` full field set, GSTIN checksum validation, the `gst_type` change guard (409 when tax invoices exist in the current FY), bank details, UPI VPA, signature attachment | 4 | |
| PLT-08 audit viewer: `GET /audit-logs` with the full filter set, selector with `select_related`, permission `platform.audit.read` | 3 | |
| PLT-09 sessions: `GET /sessions`, `POST /sessions/{id}/revoke`, `?all=true` logout, device labels | 2 | |
| WLB-01 tenant branding: `GET`/`PUT /tenants/current/branding` multipart, logo and signature upload through `files`, WCAG contrast validation (400 `low_contrast`), branding resolution order tenant → partner → product default | 5 | |
| WLB-02 partner configuration: `platform_partner` admin surface, `allowed_modules`, support contact, legal footer, inheritance into tenant defaults | 3 | |
| `files` app: `files_attachment` model, `POST /attachments` multipart with magic-byte validation, EXIF stripping, Pillow compression, tenant-checked serving path, `files.gc_orphans` job | 5 | Required by WLB-01 and by LED-01 FR-10 in Sprint 4 |

**Frontend**

| Group | Est |
|---|---|
| Design-system wave 2: `UbDataGrid` (+ toolbar, pagination, empty state, mobile list), `UbSearchInput`, `UbFilterTag`, `UbCombobox`, `UbAsyncCombobox`, `UbReasonDialog`, `UbFileUpload`, `UbHelpHint` | 10 |
| Settings section: `(app)/settings/{page,business,numbering,branding,team,modules}` with their feature folder, slices, thunks, services, schemas | 6 |
| Team screen: member list (`UbDataGrid`), invite drawer, role change with confirm, suspend/remove with `UbConfirmDialog` | 4 |
| Branding screen: logo upload with preview, colour pickers with live contrast feedback, document header/footer, app name; `whiteLabelSlice` applying the ramp immediately | 4 |
| Audit log screen: filters, infinite list, before/after diff viewer | 3 |
| Sessions screen | 1.5 |
| `usePermissions` wiring: sidebar entries, row-action menus and disabled states driven by `permissions[]` | 2 |

*(Committed 50; the audit diff viewer and the sessions screen are the sprint's designated reserve consumers.)*

### 32.5.5 Demo script

1. Owner opens Settings → Team, invites `+919812345678` as **staff**. Show the invitation SMS in the log and the share text.
2. Accept the invitation in a second browser. The staff member lands in the same tenant.
3. Staff navigation shows fewer items. Staff attempts `POST /memberships/invite` directly — 403 `permission_denied`.
4. Owner changes the staff member's role to accountant. The staff session's next request 401s and re-authenticates with new permissions.
5. Owner sets branding: upload a logo, set primary `#0A66C2`. The shell re-colours without reload. Try `#FFFF99` — 400 `low_contrast` with the measured ratio.
6. Owner edits the numbering series to prefix `SGS/`. Attempt to lower `next_number` — rejected.
7. Open the audit log: every action above is a row with actor, action, entity and before/after.
8. Owner opens Sessions, revokes the staff device; the staff tab logs out on its next request.

### 32.5.6 Exit criteria

- [ ] The permission matrix test of Part 28 §28.2.2 runs across all four roles × every endpoint that exists so far, with the expectation table reviewed as a spec artefact
- [ ] Role change forces re-authentication within one request
- [ ] Branding resolution order proven for all three sources (`T-WLB-01-3`)
- [ ] Contrast validation rejects a failing pair server-side, not only client-side
- [ ] Attachment upload validated by magic bytes, EXIF stripped, and a cross-tenant fetch of an attachment returns 404
- [ ] Every settings key in Part 21 §21.3.1 has a schema and a test
- [ ] Audit rows exist for all of Part 21 §21.7's platform entities

### 32.5.7 Risks

| Risk | Mitigation |
|---|---|
| The permission matrix expectation table becomes a place to record what the code does rather than what the spec says | The table is written from canon §0.9 and the FRD §12 tables **before** the endpoints, and a mismatch is a code defect, not a table update |
| `UbDataGrid` is a two-week project on its own | It is scoped hard: TanStack Table v8, column factory, toolbar, pagination, empty state, mobile card list. No column resizing, no grouping, no virtualisation, no column pinning at MVP. Anything else is Phase 2 |
| Branding tokens leak into component code as props | The rule is one direction: tokens → CSS variables → Tailwind classes → components. A component never receives a colour as a prop |

---

## 32.6 Sprint 3 — Parties

**Weeks 7–8 · 49 points · PTY-01, PTY-02, PTY-03, PTY-04, PTY-05, PTY-06**

### 32.6.1 Goal statement

> The merchant creates a party with an opening balance, sees it in a searchable, filterable list whose header shows "You will get / You will give" totals over the filtered set, opens its khata page with a header balance and an empty timeline, tags it, sets a credit limit and a collection date, and archives it — with archive blocked while the balance is non-zero.

### 32.6.2 Dependencies consumed

Sprint 2's permissions, settings (`ledger.credit_limit_mode`) and audit; Sprint 0's `Party` model and walking-skeleton list.

### 32.6.3 Dependencies produced

The party master, the khata page surface, the party search combobox that sales, purchases, payments and expenses all consume, and the balance cache that Sprint 4 will start writing to.

### 32.6.4 Tasks

**Backend**

| Group | Est |
|---|---|
| PTY-01 create/edit: `create_party()`, `update_party()`, GSTIN validation with the state-code warning, duplicate-mobile constraint, the opening-balance hand-off (deferred: it enqueues nothing yet — Sprint 4 posts the `opening` entry; this sprint stores the requested opening balance on the party and a test asserts it is unapplied) | 5 |
| PTY-02 list: `PartyFilterSet` (`q` trigram, `type`, `balance`, `status`, `tag`, `collection`), whitelisted ordering, `meta.totals` computed over the filtered set in SQL, `select_related`/`prefetch` for tags, query-count budget | 6 |
| PTY-03 detail: `get_party()` + `party_summary()` selector returning balance, receivable, payable, open invoices (zero for now), overdue amount, last payment; `recent_entries[5]` | 3 |
| PTY-04 archive/restore with the `party_balance_nonzero` 409 and its audit rows | 2 |
| PTY-05 tags: `parties_tag`, `parties_party_tag`, `GET/POST /tags`, assignment, tag filter | 3 |
| PTY-06 credit limit: `credit_limit`, `credit_days` fields, `ledger.credit_limit_mode` setting read path, the check function (`check_credit_limit()` in `parties/services/`) that LED-01 and SAL-02 will both call, and its audited override | 4 |
| Tenancy + permission sweeps for every parties route | 2 |

**Frontend**

| Group | Est |
|---|---|
| Design-system wave 3: `UbPartyHeader`, `UbStatCard` (promoted from wave 0 stub to full Koper metric tile), `UbTimeline`, `UbShareSheet`, `UbFab`, `UbDateRangePicker` | 6 |
| PTY-02 list screen: `PartyTotalsHeader`, `PartyListToolbar`, `PartyListFiltersDrawer`, `PartyListRow` (memo), `PartyRowActionsMenu`, `PartyBulkActionBar`, `usePartyList`, `partyListSlice`/`Thunk`, `partyFilters`/`partySort`/`partyListDefaults` constants, `partyDisplay`/`partyActions` view-models | 8 |
| PTY-01 form drawer: `PartyFormDrawer`, `usePartyForm`, `partySchemas` composing `useValidationSchemas()`, server-error mapping, dirty guard | 5 |
| PTY-03 detail screen: `PartyDetailPageContent`, `PartyHeaderCard` with the five quick actions (three disabled until Sprint 4/7), `usePartyDetail` | 5 |
| PTY-04 archive dialog; PTY-05 tag combobox with inline create; PTY-06 limit fields and the usage bar | 4 |
| `usePartySearch` — the debounced async combobox source, exported for reuse by sales, purchases, payments and expenses | 2 |

### 32.6.5 Demo script

1. Empty state: "Add your first customer". Create **Ramesh Traders**, mobile, GSTIN, tag "Camp Area", credit limit ₹50,000, collection date Friday, opening balance ₹2,300 debit.
2. The list shows one row; the header shows "You will get ₹0" — because opening balances are not posted until Sprint 4, and that is *shown*, not hidden. (This is the one place in the plan where a demo is deliberately incomplete; Sprint 4 closes it.)
3. Create four more parties, one a supplier. Filter by "Suppliers" — header totals change with the filter.
4. Search "ram" — trigram match. Filter by tag. Sort by balance.
5. Open Ramesh's khata page: header, quick actions, empty timeline with its first-use empty state.
6. Archive a party with a zero balance — succeeds. Try one with a limit set and a balance — 409 with the merchant-readable message.
7. Staff user: can create and edit; cannot delete; cannot see the credit-limit override.

### 32.6.6 Exit criteria

- [ ] `T-PTY-01-*` … `T-PTY-06-*` green
- [ ] Party list query-count budget asserted at page sizes 25 and 100
- [ ] `meta.totals` proven to be over the filtered set, not the whole tenant, for every filter combination
- [ ] Trigram index present and used (`EXPLAIN` asserted in the performance test)
- [ ] 2,000-party fixture renders the first page in ≤ 1.5 s on the reference device profile
- [ ] Every one of the ten states of PTY-02 §9 rendered and component-tested

### 32.6.7 Risks

| Risk | Mitigation |
|---|---|
| The opening-balance hand-off between PTY-01 and LED-02 is built twice | It is specified once here as "stored, unapplied" with an explicit test, and Sprint 4's LED-02 task list begins with "consume the stored opening balance and post the entry" |
| `UbDataGrid` does not fit the mobile khata list and a second list component appears | The mobile rendering is `UbDataGridMobileList` — the *same columns*, card-rendered. A second component is a design-system change requiring a Part 23 amendment |
| Party search becomes four different implementations in four features | `usePartySearch` is written here, exported, and a lint rule forbids a second debounced party fetch outside it |

---

## 32.7 Sprint 4 — The ledger spine

**Weeks 9–10 · 50 points · LED-01, LED-02, LED-03, LED-04, LED-11**

This is the most important sprint in the project. Everything before it is scaffolding for it, and everything after it is a projection over it.

### 32.7.1 Goal statement

> The merchant taps "You gave ₹500" on a party page and the entry is written immutably, the party balance is updated under a row lock in the same transaction, an audit row is written, and the new balance is on screen in under 250 ms server time. They correct it to ₹450 and the statement shows a reversal, a replacement and a reason. They open a thirty-day statement with a running balance, print it with branding, and write off a ₹3 residue.

### 32.7.2 Dependencies consumed

Parties (master, header, timeline), settings (`credit_limit_mode`), `files` (attachments), `platform_job` (SMS enqueue, inert until Sprint 5), the permission registry.

### 32.7.3 Dependencies produced

`post_entry()`, `reverse_entry()`, `correct_entry()` and `apply_balance_delta()` — the four functions that every document, payment and expense in Sprints 7–10 calls. The statement selector that RPT-02 and RPT-05 project from. The immutability triggers that Part 28 §28.2.4 tests against forever.

### 32.7.4 Tasks

**Backend**

| Group | Est | Notes |
|---|---|---|
| `ledger_entry` model with every Part 21 §21.3.4 column, the four indexes, the `reversal ⇒ reverses_id NOT NULL` constraint, and the `forbid_update_delete()` trigger installed in the migration allowing only `status` and `reversed_by_id` | 4 | The trigger is defence in depth; the application already has no update path |
| `post_entry()` — the reference vertical slice of Part 20 §20.3.3: lock the party (L1), insert the entry, update `balance`/`receivable_total`/`payable_total`/`last_activity_at`, write one audit row, enqueue the SMS job, return the new balance | 5 | Every other service in the product copies this shape |
| `check_credit_limit()` integration: `off`/`warn`/`block`, `warnings[]` on 201, 409 `credit_limit_exceeded`, `override=true` gated on `ledger.entry.correct`, the override audit row | 3 | |
| `POST /ledger-entries` and `POST /parties/{id}/ledger-entries` with `@idempotent`, plus `GET /parties/{id}/ledger-entries` cursor-paginated and `GET /ledger-entries/{id}` with its history chain | 4 | |
| LED-02 opening balance: `entry_type='opening'`, consumed from the PTY-01 stored value, one per party enforced, backdating to `as_of` | 3 | |
| LED-03 reverse and correct: `POST /ledger-entries/{id}/reverse` (manual/opening only; 409 `use_document_void` otherwise), `POST /ledger-entries/{id}/correct` returning `{reversal, replacement}` atomically with `supersedes_id`, reason required | 5 | |
| LED-04 statement selector: opening balance for range, entries with `running_balance` computed by a SQL window function, closing balance, document links, `include_corrections` toggle, cursor pagination | 5 | |
| LED-11 write-off: `entry_type='write_off'` with reason, permission, audit | 2 | |
| `manage.py recalc_balances` and its drift test over a 10,000-entry random fixture including backdated, reversed and corrected rows | 3 | Part 12 §12.5's correctness gate begins passing here |
| Concurrency test: two staff posting to one party simultaneously serialise correctly on the party lock | 2 | |

**Frontend**

| Group | Est |
|---|---|
| `LedgerEntryDrawer` with `DirectionToggle`, `UbMoneyInput` autofocused, `UbDateInput` with Today/Yesterday/Pick chips, `PaymentModeToggle`, reference field conditional on mode, note with counter, `UbFileUpload` with client-side compression to ≤ 300 KB | 6 |
| `ledgerEntrySlice`/`Thunk`/`ledgerService`, optimistic timeline row, the retry path reusing the same idempotency key, the credit-limit banner with "Save anyway" for owner/admin | 5 |
| Party timeline: `UbTimeline` rows with date grouping, attribution, mode, reference, attachment thumbnail, backdated tag | 4 |
| LED-03 correction UI: correct/reverse from the row menu, `UbReasonDialog`, the corrections toggle on the statement | 3 |
| LED-04 statement screen `(app)/parties/[id]/statement` with date-range chips, running-balance column, `UbShareSheet` and the print route with the branded `StatementPrintA4` React print component | 6 |
| LED-11 write-off drawer | 1 |

### 32.7.5 Demo script

This is steps 1:30–3:30 and 7:00–7:30 of the Part 12 §12.6 launch demo, and it must run exactly as written there.

1. Ramesh's opening balance of ₹2,300 now appears — the PTY-01 hand-off closed.
2. **You gave** ₹500, note "Sugar 10 kg", save. Balance ₹2,800 in red with "You will get". Row appears with attribution.
3. **You got** ₹300, mode UPI, reference typed. Balance ₹2,500.
4. Backdate an entry to yesterday; it lands under yesterday's date group, not at the top.
5. Attach a photo to an entry; it compresses and shows a thumbnail.
6. Set `credit_limit_mode=block`, limit ₹2,600. Staff posts ₹500 → 409 with the figures. Owner repeats with "Save anyway" → posts, with an override audit row.
7. Correct the ₹500 entry to ₹450 with reason "counted wrong". Show the reversal, the replacement and the reason in the statement; toggle corrections off and see only the net.
8. Open the statement for this month, print-preview it with the logo, share it to WhatsApp.
9. Write off ₹3 with reason "rounding". Balance settles to a round number.
10. Run `manage.py recalc_balances` — zero drift.

### 32.7.6 Exit criteria

- [ ] `T-LED-01-*`, `T-LED-02-*`, `T-LED-03-*`, `T-LED-04-*`, `T-LED-11-*` green
- [ ] `UPDATE ledger_entry SET amount = …` raises from the database trigger (`T-LED-01-7`)
- [ ] `recalc_balances` reports zero drift on 10,000 mixed entries (`T-LED-01-11`)
- [ ] P95 `POST /ledger-entries` ≤ 250 ms measured against the 10,000-entry fixture
- [ ] Party page open → drawer visible ≤ 100 ms
- [ ] Idempotency replay returns an identical body and creates one row; conflicting body → 409
- [ ] Statement with 5,000 entries: first page ≤ 1.5 s
- [ ] Every ledger route in the cross-tenant sweep returns 404

### 32.7.7 Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| The correction chain (`reverses_id`, `reversed_by_id`, `supersedes_id`) is modelled wrong and has to be re-migrated after documents start posting entries | Medium | Build LED-03 in the **same sprint** as LED-01, not later. The shape is proven against corrections before any document depends on it |
| The running-balance window function is slow at 5,000 rows | Low | The index `(tenant_id, party_id, entry_date, created_at)` is exactly the window's ordering; asserted with `EXPLAIN` in the performance test |
| Balance drift appears only under concurrency and only in production | Medium | The concurrency test is a sprint deliverable, not a hardening task; `recalc_balances` runs nightly from this sprint onward in dev |
| The optimistic timeline row and the server row diverge, producing duplicates | Medium | De-duplication is by entry `id`; the optimistic row carries the idempotency key as a temporary id and is replaced, never appended to |

---

## 32.8 Sprint 5 — Collections and messaging

**Weeks 11–12 · 50 points · LED-05, LED-06, LED-07, LED-08, NTF-01, NTF-02, NTF-03**

### 32.8.1 Goal statement

> Every credit party has a collection date; the merchant sees Due today / Overdue / Upcoming buckets, multi-selects eight overdue parties and sends WhatsApp reminders in one action, each opening a prefilled `wa.me` message with the balance, the shop name and a UPI link. With a provider configured, D-1 and D0 reminders and per-entry transaction SMS go out from the scheduler; without one, every message is logged as `skipped` and nothing breaks.

### 32.8.2 Why messaging comes before documents

Part 13 §13.7: "notification adapters before any outbound message". NTF-02 defines the adapter interface, the template registry with DLT ids and the message log. LED-06, LED-07, LED-08, every Phase 2 channel and every document-share path are callers. Building a caller first scatters provider-specific code through the ledger.

### 32.8.3 Tasks

**Backend**

| Group | Est |
|---|---|
| NTF-02 adapter layer: `SmsBackend` protocol, `ConsoleSmsBackend`, `WaMeBackend`, `notifications_template` with tenant → partner → global resolution, `notifications_message_log`, the `skipped` path when unconfigured, template rendering with `{{placeholders}}` in `en` and `hi` | 7 |
| NTF-01 inbox: `notifications_notification`, `GET /notifications`, `/unread-count`, `/{id}/read`, `/read-all`, the five MVP types, 180-day purge job | 4 |
| NTF-03 WhatsApp deep link: `buildWhatsAppText()` server-side template plus the share-link issuance for statements and (later) documents | 2 |
| LED-05 collection dates and buckets: `GET /ledger/summary` with `due_today`, `overdue`, `upcoming_7d`; `collection` filter on the party list already built in Sprint 3 wired to real data | 3 |
| LED-06 manual reminder: `ledger_reminder` model, `POST /reminders`, `PATCH`, `POST /reminders/{id}/send` returning `{wa_url, text}` for `whatsapp_manual`, `POST /reminders/bulk`, snapshot balance at send time | 6 |
| LED-07 automated SMS: the `ledger.send_auto_reminders` scheduled job computing D-1 and D0 sets, the `U(party_id, due_on, kind)` guard making a double run harmless, per-party `sms_opt_in`, the `ledger.auto_sms` tenant setting, `channel_not_configured` behaviour | 6 |
| LED-08 transaction SMS: the job enqueued by `post_entry()` in Sprint 4 now has a handler; templates `LEDGER_ENTRY_GAVE`/`LEDGER_ENTRY_GOT`; opt-in and consent fields respected | 4 |
| `platform_job` scheduling hardening: recurring `scheduled_key` rows, the double-run proof, dead-letter visibility | 3 |

**Frontend**

| Group | Est |
|---|---|
| Reminder list screen `(app)/ledger/reminders` with the three buckets as `UbTabs`, bulk selection, the reminder composer drawer | 6 |
| Bulk WhatsApp flow: sequential `wa.me` opens with a progress list and a "mark all sent" action | 3 |
| Notification bell, unread badge, inbox panel, deep-link routing per type | 4 |
| Collection-date field on the party form and quick-set from the khata header | 1 |
| Settings → Reminders: templates, `auto_sms` toggle, the "provider not configured" banner | 2 |

### 32.8.4 Demo script

Steps 3:30–4:00 of the launch demo, extended.

1. Set collection dates on five parties, two in the past.
2. Dashboard/reminders screen shows Due today (1), Overdue (2), Upcoming (2) with amounts.
3. Multi-select the two overdue parties → Send reminder → WhatsApp → two `wa.me` windows with the balance, shop name and UPI link prefilled.
4. Each reminder is logged with `snapshot_balance` and appears on the party timeline.
5. Turn `ledger.auto_sms` on with no provider: run `manage.py run_scheduler --once`. Message log rows appear with `status='skipped'`; nothing errors.
6. Point `SMS_BACKEND` at the console backend and re-run: rows go to `sent`, the codes appear in the log, and a second run of the same day creates no duplicates.
7. Post a ledger entry with the party opted in: the transaction SMS job runs and logs "₹500 udhaar added… balance ₹2,800".
8. Notification bell shows "Reminder due" and "Low stock" (the latter inert until Sprint 6).

### 32.8.5 Exit criteria

- [ ] `T-LED-05-*` … `T-LED-08-*`, `T-NTF-01-*` … `T-NTF-03-*` green
- [ ] The scheduler's double-run is proven harmless for every recurring job that exists (Part 12 §12.8, Operations)
- [ ] No message is sent to a party with `sms_opt_in=false`, proven by test
- [ ] Every template exists in `en` and `hi` with a DLT id field present (null at MVP)
- [ ] No mobile number, party name or amount appears in any analytics event emitted this sprint

### 32.8.6 Risks

| Risk | Mitigation |
|---|---|
| The bulk WhatsApp flow is blocked by the browser's popup blocker after the first window | Specified as sequential, user-gesture-driven opens with an explicit "Next" affordance, not a loop of `window.open` |
| Auto-reminders double-send after a scheduler restart | The `U(party_id, due_on, kind)` partial unique index makes it structurally impossible, and the test asserts it by running the job twice |
| Message templates accumulate business logic | Templates render placeholders only. Any conditional ("if balance > 0 say X") lives in the service that chooses the template code |

---

## 32.9 Sprint 6 — Inventory

**Weeks 13–14 · 50 points · INV-01 … INV-08**

### 32.9.1 Goal statement

> The merchant creates items with prices, tax rates, units and reorder points, sets opening stock, searches by name, SKU or a typed barcode, sees on-hand and valuation per item and in a summary, posts an adjustment of −2 with reason "damage", and receives a low-stock notification the first time an item crosses its reorder point. Every quantity change is an immutable signed movement, and `recalc_stock` finds zero drift.

### 32.9.2 Dependencies consumed

`tax_rate` (seeded Sprint 0, with the 2025-09-21 boundary), units, categories, `files` (item images), notifications (low stock), the `MAIN` location created at onboarding.

### 32.9.3 Dependencies produced

`post_movement()` and the weighted-average rule that SAL-02 (out) and PUR-01 (in) both call; the item search combobox the invoice editor consumes; `inventory_item_stock` as the cache RPT-06 projects.

### 32.9.4 Tasks

**Backend**

| Group | Est |
|---|---|
| INV-04 masters: `inventory_category` (one level), `inventory_unit` with UQC mapping, `GET/POST /categories`, `/units`, inline-create semantics | 3 |
| INV-01 item: full Part 21 §21.3.6 model, auto-SKU generation, barcode uniqueness, `track_stock` semantics for goods vs service, `POST/PATCH /items`, the `track_stock` transition guards | 6 |
| INV-05 opening stock: `opening` movement with unit cost, posted through the same service as every other movement | 2 |
| `post_movement()` + the weighted-average rule of Part 21 §21.3.6 (normative formula), `avg_cost_after`/`on_hand_after` caches, L2 lock ordering by `item_id`, the `forbid_update_delete` trigger on `inventory_stock_movement` | 6 |
| INV-06 adjustment: `inventory_stock_adjustment` header, the five reasons, negative-stock guard driven by `inventory.allow_negative_stock`, `POST /stock-adjustments` with per-line `insufficient_stock` details | 5 |
| INV-02 list: filters (category, `stock=low|out|in`, status, type), trigram + SKU + barcode search, `GET /items/lookup?barcode=`, `meta.totals` with stock value | 4 |
| INV-03 detail + `GET /items/{id}/movements` cursor-paginated with source document links | 3 |
| INV-07 low stock: the `inventory.scan_low_stock` scheduled job, one notification per crossing (not per scan), the crossing-state field | 3 |
| INV-08 `GET /stock/summary` and `/stock/low` with valuation at weighted-average cost | 3 |
| `manage.py recalc_stock` and the drift test | 2 |

**Frontend**

| Group | Est |
|---|---|
| Item list screen with stock badge tones, filters, search with barcode paste handling | 6 |
| Item form drawer with category/unit inline create, tax-rate select from `/taxes/rates`, HSN search, image upload, opening-stock section | 6 |
| Item detail screen with stock card, valuation, movement timeline | 4 |
| Stock adjustment screen: multi-line editor using `UbLineItemsEditor` (built here, first consumer), reasons, per-line shortfall errors | 5 |
| Low-stock screen and dashboard tile wiring | 2 |
| `useItemSearch` — the scanner-aware async combobox source, exported for sales and purchases | 2 |

### 32.9.5 Demo script

Steps 5:45–7:00 of the launch demo.

1. Create a category "Grocery" and a unit "KGS" inline from the item form.
2. Create "Basmati Rice 5kg", GST5, HSN 1006, purchase ₹380, selling ₹450, reorder point 10, opening stock 40 @ ₹380.
3. Create a service item; note that stock fields disappear.
4. Item list: search "bas", filter by category, filter "Low stock" (empty).
5. Post an adjustment −2, reason "damage". On-hand 38; the movement history shows the reason and the person.
6. Post an adjustment −40 → 409 `insufficient_stock` with the shortfall; turn `allow_negative_stock` on and retry → succeeds.
7. Adjust down to 8; run the low-stock scan; a notification appears once. Run it again; no second notification.
8. Stock summary shows on-hand × avg cost with a tenant total.
9. `recalc_stock` → zero drift.

### 32.9.6 Exit criteria

- [ ] `T-INV-01-*` … `T-INV-08-*` green
- [ ] Weighted-average arithmetic asserted paisa-exact against a hand-computed fixture table including the `on_hand ≤ 0` inbound case
- [ ] `UPDATE inventory_stock_movement` raises from the trigger
- [ ] `recalc_stock` zero drift on a 10,000-movement fixture
- [ ] Movement locks proven to be taken in `item_id` order (an ordering test asserts the `sorted()` call, and a concurrency test posts two adjustments touching the same two items in opposite line orders without deadlock)
- [ ] Barcode lookup returns in < 50 ms at 5,000 items

### 32.9.7 Risks

| Risk | Mitigation |
|---|---|
| Weighted average is computed in Python from a stale read and drifts | The formula is applied inside the locked section against the row just read `FOR UPDATE`, and `recalc_stock` recomputes from movements alone — the test asserts equality, so any drift fails |
| `UbLineItemsEditor` is built for adjustments and does not fit invoices | It is built here to the *invoice* requirement (keyboard-first, per-cell controllers, mobile card form) and adjustments use a subset. Building it to the smaller requirement first guarantees a rewrite in Sprint 7 |
| Low-stock notifications spam on every scan | The crossing is a state transition, not a predicate: the notification fires when `on_hand` moves from `> reorder_point` to `≤ reorder_point`, and the state is stored |

---

## 32.10 Sprint 7 — Sales core: the tax invoice

**Weeks 15–16 · 50 points · SAL-02, SAL-03, SAL-06, SAL-07, SAL-08**

The hardest sprint. It is given only five features for that reason.

### 32.10.1 Goal statement

> The merchant creates a tax invoice with line items searched from inventory, watches CGST and SGST compute by slab as they type, applies a line discount and a document discount, sees the round-off, chooses credit with a due date, and issues it — allocating a number from the FY series, deducting stock atomically, posting a ledger debit that links back, and rendering an A4 and an 80 mm print view with branding and a UPI QR. A walk-in cash sale does the same without a party. Drafts autosave and survive a browser crash.

### 32.10.2 Tasks

**Backend**

| Group | Est | Notes |
|---|---|---|
| `sales_document` + `sales_document_line` models with every Part 21 §21.3.7 column, all four indexes, and `version` for optimistic concurrency | 4 | |
| `tax_engine.py` — `compute_document_totals()`, pure, no DB: line taxable value, inclusive/exclusive handling, line discount, document discount apportionment, CGST/SGST vs IGST by place of supply, cess, round-off, half-up at line and document level | 8 | The single most-tested function in the product. Its fixture table is shared with the frontend mirror |
| `allocate_number()` over `platform_document_sequence` with `SELECT … FOR UPDATE`, FY reset, padding, ≤ 16 characters, and the concurrency test proving no gaps and no duplicates | 3 | |
| `create_draft()`, `update_draft()` (version-checked), `delete_draft()` | 3 | |
| `issue_invoice()` — the twelve ordered side effects: validate, resolve tax rates by date, compute totals, check stock, check credit limit, allocate number (L4: late), snapshot party, insert lines, post `sale_out` movements (L2 order), post the ledger debit (L1), record the optional payment (deferred import, rule D5 — stubbed until Sprint 8), write audit, enqueue PDF/share snapshot | 8 | |
| `check_rule46()` — the nine mandatory-field checks surfaced as `meta.rule46` | 2 | |
| SAL-07 walk-in: no party, full payment required, optional mobile | 2 | |
| SAL-08 list: status tabs, filters, `meta.totals` over the filtered set, `sales.refresh_overdue` nightly job setting the derived `overdue` status | 4 | |
| SAL-03 share links and `GET /sales/invoices/{id}/upi-intent`; `payments/qr.svg` local QR encoder | 3 | |

**Frontend**

| Group | Est |
|---|---|
| `useInvoiceEditor` orchestrator + `invoiceEditorSlice`/`Thunk`: RHF form owns editable state, slice owns server-derived state, one handoff | 6 |
| `InvoiceLinesSection` / `InvoiceLineRow` / `InvoiceLineMobileCard` on `UbLineItemsEditor` with per-cell controllers, focus movement and the F2–F8 keyboard map | 6 |
| `view-model/taxEngine.ts` — the mirror, unit-tested against the *same* `taxEngine.cases.json` fixture as the backend | 4 |
| `InvoiceTotalsPanel`, `InvoiceDocumentDiscount`, `InvoiceRule46Checklist`, `InvoiceStockShortDialog`, `InvoiceCreditLimitBanner` | 5 |
| SAL-06 autosave: debounced localStorage + PATCH draft, `InvoiceDraftRestorePrompt`, dirty guard | 3 |
| SAL-08 list screen with status tabs and totals | 4 |
| SAL-03 print components `InvoicePrintA4`, `InvoicePrintThermal80`, `InvoicePrintHeader`, the print route, `UbQrCode` | 6 |

*(Committed 50; the frontend group above totals 34 and the backend 37, so the sprint carries 21 points of the print and list work into Sprint 8 by design — recorded here rather than discovered later. Sprint 8's commitment is reduced accordingly.)*

Because that carry is planned rather than accidental, Sprint 7 commits: all nine backend groups (37 points) plus the editor orchestrator, the line editor and the tax-engine mirror (16 points) = 53, trimmed to **50** by moving `InvoiceRule46Checklist` and the keyboard map to Sprint 8's first items.

### 32.10.3 Demo script

Steps 4:00–5:45 of the launch demo.

1. New invoice for Ramesh Traders. Search "bas" → Basmati Rice. Qty 2. Price defaults from the item. Watch CGST 2.5 % and SGST 2.5 % appear.
2. Add a second line, apply a 5 % line discount, then a ₹50 document discount. Watch the apportionment and the round-off.
3. Change the place of supply to a different state → IGST replaces CGST/SGST in one render.
4. Choose credit, 15 days. Issue. Number `INV/26-27/0001` allocated; stock drops from 38 to 36; Ramesh's balance rises by the grand total; the timeline row links to the invoice.
5. Print preview A4 with the logo and the UPI QR; switch to 80 mm thermal.
6. Start a new invoice, type three lines, close the browser tab, reopen — the draft is restored.
7. Walk-in sale: no party, cash, full payment enforced.
8. Sales list: status tabs, totals reflecting the filter.
9. Issue two invoices concurrently from two sessions — consecutive numbers, no gap, no duplicate.

### 32.10.4 Exit criteria

- [ ] `T-SAL-02-*`, `T-SAL-03-*`, `T-SAL-06-*`, `T-SAL-07-*`, `T-SAL-08-*` green
- [ ] The GST fixture suite green: every slab, intra and inter state, composition, unregistered, line discount, document discount, round-off, reverse charge, **and at least one document dated before 2025-09-21**
- [ ] The frontend and backend tax engines agree on every row of `taxEngine.cases.json` — a divergence fails CI on both sides
- [ ] Numbering under concurrency: no gaps, no duplicates, correct FY reset
- [ ] `insufficient_stock` blocks issue unless the setting allows, with per-line detail
- [ ] Invoice issue P95 ≤ 600 ms server time
- [ ] Print output verified on one A4 laser and one 80 mm thermal printer physically

### 32.10.5 Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Rounding disagreement between the two tax engines discovered at demo time | High | High | The shared fixture file is written **before** either engine, from SAL-02 §11 BR-1…BR-10 and the BR-10 worked example. Both engines are built against it |
| The invoice editor becomes a 2,000-line component | High | Medium | Part 25 R-FN-4 caps files at 300 lines; the component list in Part 19 §19.2.4 is the mandated decomposition and is not negotiable |
| Stock and ledger side effects are wired through signals "for cleanliness" | Medium | High | Rule D9 forbids it. `issue_invoice()` calls the services explicitly, in the order BR-16 specifies, inside one transaction |
| The sprint overruns and Sprint 8 loses payments | Medium | High | The 21-point carry is planned into Sprint 8's budget from the start, and payments work is ordered so that PAY-01 lands before the carried print work |

---

## 32.11 Sprint 8 — Payments and document ↔ ledger

**Weeks 17–18 · 50 points · PAY-01 … PAY-05, LED-09, LED-10**

### 32.11.1 Goal statement

> The merchant records a ₹500 UPI payment against an open invoice, auto-allocated FIFO, and the invoice becomes partially paid while the party balance falls by exactly ₹500. A split payment of ₹700 UPI plus ₹300 cash records as one receipt. Voiding a payment reverses its ledger entries and its allocations. The aging report shows receivables in four buckets, and every document type in the product now posts a linked ledger entry.

### 32.11.2 Tasks

| Group | Layer | Est |
|---|---|---|
| Carried from Sprint 7: `InvoiceRule46Checklist`, the keyboard map, the print components, the sales list screen, share links | FE | 12 |
| `payments_payment` + `payments_allocation` models, `mode_breakup` JSONB with the Σ = amount constraint | BE | 3 |
| `record_payment()`: lock order L3 over documents by `(document_date, number, id)`, FIFO auto-allocation, manual allocation, the unallocated advance, the ledger post, the audit row, idempotency | BE | 6 |
| PAY-02 split: validation that Σ modes = amount, `primary_mode` derivation, per-mode references | BE | 2 |
| PAY-05 void: reverse allocations, reverse the ledger entry, recompute `amount_paid`/`amount_due` on affected documents | BE | 3 |
| PAY-03 UPI: `build_upi_url()`, the local SVG QR encoder, static VPA QR and dynamic intent with amount and reference | BE | 3 |
| PAY-04 receipt: numbering, the `PaymentReceiptPrint` React component, share | FE+BE | 3 |
| LED-10 integration: the invoice, credit-note, purchase-bill, payment and expense ledger posts all carry `source_type`/`source_id`, and the timeline renders each with a link back | BE+FE | 4 |
| LED-09 summary and aging: `GET /ledger/aging` with FIFO application computed in a SQL CTE, four buckets, per-party and overall, `reports_snapshot` caching above 5,000 entries | BE | 6 |
| Payments list and record-payment drawer, allocation picker with "auto" and manual modes | FE | 6 |
| Aging screen `(app)/ledger/aging` with bucket bars and drill-through | FE | 2 |

### 32.11.3 Demo script

1. Ramesh has an open invoice of ₹898. Record ₹500 UPI with a UTR, allocation "auto". Invoice → partially paid, `amount_due` ₹398, balance ₹398.
2. Record ₹398 split ₹200 cash + ₹198 UPI. Invoice → paid. Balance 0.
3. Print the receipt with branding; share it.
4. Void the second payment with a reason. The invoice returns to partially paid; the ledger shows a reversal; the balance returns to ₹398.
5. Show the statement: invoice, payment, reversal, all linked to their sources.
6. Aging: four buckets, with a party in 31–60 because of a backdated entry from Sprint 4.
7. Show the invoice's UPI QR; scan it with a phone and confirm the amount and reference prefill.

### 32.11.4 Exit criteria

- [ ] `T-PAY-01-*` … `T-PAY-05-*`, `T-LED-09-*`, `T-LED-10-*` green
- [ ] Σ allocations ≤ payment amount enforced by constraint and by service, with a test for each
- [ ] A payment allocated across three documents locks them in `(document_date, number, id)` order — asserted
- [ ] Void restores `amount_paid`/`amount_due` exactly; `recalc_balances` clean afterwards
- [ ] Aging totals equal the party-balance total for receivables, proven on the 10,000-entry fixture
- [ ] Sprint 7's carry fully merged; the Part 12 §12.6 demo now runs from step 0:00 to step 5:45 without a gap

---

## 32.12 Sprint 9 — Sales completion and purchases

**Weeks 19–20 · 50 points · SAL-01, SAL-04, SAL-05, PUR-01 … PUR-04**

### 32.12.1 Goal statement

> The merchant quotes with an estimate and converts it to an invoice; returns two units against an invoice with a credit note that restocks and posts a credit; voids an invoice with a reason, reversing stock and ledger while keeping the number. On the supply side, a purchase bill posts stock in at cost with a weighted-average update and a supplier ledger credit, a supplier payment allocates against bills, and a void reverses both.

### 32.12.2 Why these two together

They share one service shape. `purchases` is `sales` with the direction flipped, one extra uniqueness constraint (`supplier_invoice_number`) and inbound rather than outbound movements. Reviewing them in the same fortnight, while the sales document service is still in the reviewer's head, is materially cheaper than reviewing them four weeks apart — and it is the only place in this plan where two modules share a sprint for that reason rather than a dependency one.

### 32.12.3 Tasks

| Group | Layer | Est |
|---|---|---|
| SAL-01 estimates: kind `estimate`, its five statuses, validity date, `POST /sales/estimates/{id}/convert` producing a draft invoice with `converted_from_id`, tax preview for unregistered tenants | BE+FE | 7 |
| SAL-04 credit note: `against_id` validation (qty ≤ invoiced − returned), optional restock producing `sale_return_in`, ledger credit, `settlement ∈ {hold_advance, refund}`, `sales_credit_application` and `POST /credit-notes/{id}/apply` | BE+FE | 9 |
| SAL-05 void: reason capture, stock reversal, ledger reversal, number retention, the "payments remain as advance" prompt of Part 22 §22.14 step 4 | BE+FE | 5 |
| `purchases_document` + line models, mirroring sales, with `supplier_invoice_number`, `supplier_invoice_date`, `itc_eligible` and the `duplicate_supplier_invoice` constraint | BE | 4 |
| PUR-01 `record_bill()`: `purchase_in` movements with unit cost driving the weighted-average update, supplier ledger credit, optional immediate payment | BE | 7 |
| PUR-02 supplier payment: `direction=out`, allocation to bills, ledger debit — reusing `record_payment()` with no second implementation | BE | 3 |
| PUR-03 list and filters with payables totals | BE+FE | 4 |
| PUR-04 void bill | BE | 3 |
| Purchase bill editor screen reusing the invoice editor's line components with a cost column | FE | 8 |

### 32.12.4 Exit criteria

- [ ] `T-SAL-01-*`, `T-SAL-04-*`, `T-SAL-05-*`, `T-PUR-01-*` … `T-PUR-04-*` green
- [ ] A voided invoice's number is never reissued, proven by test
- [ ] Credit-note quantity guard prevents over-return across two partial credit notes
- [ ] Weighted average after a purchase matches the Part 21 §21.3.6 formula paisa-exact, including the `on_hand ≤ 0` case
- [ ] `duplicate_supplier_invoice` returns 409 and the constraint holds under concurrency
- [ ] `recalc_stock` and `recalc_balances` both clean after a void of each document type

---

## 32.13 Sprints 10–12

### 32.13.1 Sprint 10 — Expenses, import and export

**Weeks 21–22 · 50 points · EXP-01, EXP-02, EXP-03, IMP-01, IMP-02, PTY-10, INV-09**

**Goal.** The merchant records rent with a photographed receipt, sees the day's cash position in the cashbook, downloads a CSV template, uploads 300 parties with opening balances, sees which eleven rows failed and why, fixes them, commits, and exports any list with its filters applied.

| Group | Layer | Est |
|---|---|---|
| EXP-02 categories with the nine seeded defaults; EXP-01 expense model, service, receipt attachment, optional party posting a payable ledger entry when unpaid, void | BE | 6 |
| EXP-03 cashbook: `GET /reports/cashbook` reading payments, expenses and manual `manual_got` entries by mode, opening/closing per day | BE | 4 |
| Expense screens: list, drawer, cashbook view | FE | 6 |
| **IMP-01 the import engine** — the cross-cutting piece: `imports_job`, multipart upload, streaming CSV parse, per-row validation producing `errors jsonb` (first 500), preview, `POST /imports/{id}/commit` as a `platform_job`, `GET /imports/templates/{kind}.csv`, cancel, progress polling | BE | 10 |
| PTY-10 the parties mapper (including opening balances posting through `post_entry()`, never by direct write) | BE | 4 |
| INV-09 the items mapper (including opening stock posting through `post_movement()`) | BE | 4 |
| Import wizard UI: upload, validating state, error table with row numbers and downloadable error CSV, preview, commit, progress | FE | 8 |
| IMP-02 bulk export: `?format=csv` on every list endpoint honouring the current filters, the > 5,000-row async path with `reports_export` and a download link | BE+FE | 6 |

**Exit criteria.** `T-EXP-*`, `T-IMP-*`, `T-PTY-10-*`, `T-INV-09-*` green; a 1,000-row party import with 40 deliberate errors validates in ≤ 30 s and commits idempotently; committing twice creates no duplicates; a cancelled import leaves no partial data; exported CSV opens in Excel with Indian number formatting intact.

**Risk.** The import engine is the sprint's whole risk. It is built once, generically, with two mappers — not twice, once per entity. A third mapper (opening stock) is a Phase 2 addition and its seam is proven by the two that exist.

### 32.13.2 Sprint 11 — Reports

**Weeks 23–24 · 50 points · RPT-01 … RPT-08**

**Goal.** Every number a merchant or accountant needs at month end is on a screen and in a file: the dashboard's seven tiles with real arithmetic, the day book, the sales and purchase registers, receivables and payables aging, stock summary, and the GST summary with slab, HSN and series breakdowns — each exportable, each drilling through to the rows behind it.

| Report | Layer | Est | Notes |
|---|---|---|---|
| RPT-01 dashboard: the seven tiles, recent activity, top debtors, low-stock count, `reports_snapshot` with ≤ 60 s staleness; the Sprint 1 skeleton now gets its arithmetic | BE+FE | 9 |
| RPT-02 day book: chronological across sales, purchases, payments, expenses and manual entries with running cash and bank | BE+FE | 6 |
| RPT-03 sales register with the full tax column set | BE+FE | 5 |
| RPT-04 purchase register | BE+FE | 4 |
| RPT-05 receivables/payables aging screens (the selector landed in Sprint 8; this is presentation, drill-through and export) | FE | 4 |
| RPT-06 stock summary and low stock | BE+FE | 4 |
| RPT-07 **GST summary**: outward and inward by tax code with taxable/CGST/SGST/IGST/cess, the HSN summary, the document-series summary, the B2B/B2C split | BE+FE | 10 |
| RPT-08 export: CSV and XLSX for every report, the async job above 5,000 rows, expiry after 7 days | BE+FE | 6 |
| Report shell: shared date-range control, filter bar, export button, empty and error states | FE | 2 |

**Exit criteria.** `T-RPT-01-*` … `T-RPT-08-*` green; every report's totals reconcile against a direct SQL query in a test; the GST summary reconciles against the sales register and the purchase register to the paisa; every report renders, exports and drills through; dashboard P95 ≤ 1.2 s.

**Risk.** Report arithmetic that disagrees with the ledger is the most damaging class of defect in the product, because it destroys trust silently. Mitigation: every report selector has a reconciliation test that computes the same number a second way — once through the selector, once through a naive aggregate — and asserts equality.

### 32.13.3 Sprint 12 — Platform close-out and launch hardening

**Weeks 25–26 · 49 points · PLT-10, PLT-14 + the whole of Part 12 §12.8**

**Goal.** Every line of the launch-readiness checklist is true, and the eight-minute demo runs on the production build without an apology.

| Group | Est |
|---|---|
| PLT-10 DPDP: `POST /tenants/current/export` producing the full CSV bundle as a job, `POST /delete-request` with OTP re-verification and a 30-day cool-off, `/delete-cancel`, the deletion job walking children in dependency order | 8 |
| PLT-14 super-admin console: partner and tenant lists, entitlement overrides, consented impersonation with audit, health view | 8 |
| Performance pass on the reference device: every budget in Part 12 §12.5 measured and met, bundle budgets enforced, `EXPLAIN` review of every list endpoint at 100,000 ledger rows | 8 |
| Security pass: rate limits on OTP, login, share-link and export; share-link token hashing, expiry, revocation, `noindex`, no-referrer; the PII sweep over logs and analytics; attachment magic-byte and EXIF verification | 6 |
| Operations: backup **and a rehearsed, timed restore**; the scheduler double-run proof across every job; `/system/health` and `/system/version`; the runbooks of Part 29 §29.11 walked once each | 6 |
| Accessibility pass: axe-core zero critical on every MVP screen; 44 px targets; focus order; contrast | 4 |
| i18n completion pass: zero missing keys in either locale, Indian grouping and dd/mm/yyyy verified in both, Devanagari rendering checked on the reference device | 3 |
| Demo rehearsal ×3 on the production build; defect burn-down; the traceability matrix at 100 % for every MVP feature | 6 |

**Exit criteria.** Part 12 §12.8 in full — every box ticked, with the evidence linked. No new feature work. A defect found in this sprint that cannot be fixed within it is a launch-blocking decision taken against §12.7, not absorbed silently.

---

## 32.14 Phase 2 — Sprints 13–21

Phase 2 is planned at lower resolution deliberately: it starts eleven months after this chapter is written, its entry criteria (Part 13 §13.3) include facts not yet known — a named partner, fifty active tenants, an aggregator contract in progress — and planning it to task depth now would be planning fiction. What is fixed is the **sprint themes, the feature assignment and the ordering constraints**; what is deferred is the task breakdown, which Part 33 §33.9 gives at epic level.

Each Phase 2 sprint keeps the same structure as an MVP sprint — theme, goal, features, dependencies consumed and produced, demo script, exit criteria, risks — but at one paragraph per section rather than one table.

### 32.14.1 Release train 2.0 — Sprints 13–15 (weeks 28–33)

**Theme: depth in inventory and purchases, plus the help centre.** 13 features, 150 points.

| Sprint | Features | Goal | Key dependency |
|---|---|---|---|
| **13** | INV-11 (multi-location & transfers), INV-14 (secondary units) | Locations become visible in the UI, a transfer document posts −out/+in atomically, and an item can be bought in boxes and sold in pieces | INV-11 **must precede** PUR-06 (Part 13 §13.7): a goods receipt receives into a location. The `location_id` column and the `MAIN` row have existed since Sprint 1, so this is a UI and service change, not a migration of existing stock |
| **14** | INV-12 (variants), INV-13 (price lists), INV-15 (label printing), INV-10 (camera barcode) | Size/colour variants addressable on every document line; named price lists with a per-party default; Code128/EAN label PDFs; `getUserMedia` scanning in item search and billing | INV-12 **must precede** INV-13 and INV-15, because both must be able to address a variant. This is the sprint that touches `sales_document_line` and `purchases_document_line` — under the Part 13 §13.7 cross-phase constraint, only by adding nullable `variant_id`, never by changing meaning |
| **15** | PUR-05 (purchase orders), PUR-06 (goods receipt), PUR-07 (debit notes), PUR-08 (landed cost), HLP-01, HLP-02, HLP-03 | Draft→sent→received PO flow with partial receipts and over-receipt warnings; supplier returns posting −out movements; freight spread into unit cost; the in-app help centre with Hinglish synonyms, contextual "?" per screen and four tours | PUR-05 before PUR-06. Help content is a **content project with an engineering tail** and starts on day one of Sprint 13, not in Sprint 15 — the engineering here is the last of it |

**Train 2.0 exit criteria.** Multi-location migration proven on at least five real tenants with zero stock drift across locations; variants live on documents with no change to line semantics; a PO round trip with a partial receipt; help-centre search answering the ten most common support questions; support contacts per active tenant trending down.

**Principal risk.** Variants are the single most invasive Phase 2 change: they touch every document line, every stock movement, every report grouping and every search. The mitigation is the nullable-`variant_id` rule plus a migration that assigns every existing stock row to a null variant and a test that asserts pre-variant documents render identically after the migration.

### 32.14.2 Release train 2.1 — Sprints 16–18 (weeks 34–39)

**Theme: the partner platform and real messaging channels.** 12 features, 150 points.

| Sprint | Features | Goal | Key dependency |
|---|---|---|---|
| **16** | WLB-03 (partner domain & login), WLB-05 (theme token overrides), WLB-04 (partner admin console) | A partner's hostname resolves branding *before* login; extended token overrides validated for contrast; partners manage their own tenants, usage and entitlements within Metis-granted limits | WLB-03 **must precede** WLB-06: sender identity is resolved from the partner context the domain establishes |
| **17** | NTF-05 (WhatsApp Business Platform), NTF-06 (email), WLB-06 (partner-branded messaging), NTF-04 (web push) | Real template sends with delivery status and per-message cost; an email channel for invoices and statements; per-partner sender IDs, WhatsApp templates and email domains; PWA push for reminders and payments | NTF-05 **must precede** LED-12. Meta business verification and template approval are started at the **beginning of Sprint 13**, six sprints earlier, because their lead time is outside the team's control |
| **18** | LED-12 (automated WhatsApp reminders), LED-13 (recurring reminders & schedules), PTY-07 (contacts picker), PTY-08 (party merge), PTY-09 (party self-view link) | Utility-template reminders with opt-in and cost surfaced; weekly hisaab days and cadence rules; on-device contact picking with no address-book upload; duplicate merge with ledger re-pointing and full audit; a public, expiring, revocable "view your khata" link | PTY-08 (merge) is placed **after** eighteen sprints of audit machinery deliberately — Part 12 §12.4 says merge needs the audit to be proven first |

**Train 2.1 exit criteria.** One partner live on its own hostname, with its own branding and its own sender identity, with at least ten of its merchants transacting; WhatsApp template sends with delivery receipts and a cost line; a merged party whose ledger reconciles exactly and whose merge is fully reconstructible from the audit log.

**Principal risk.** Every feature in this train depends on an external approval — a domain, a Meta verification, a DLT registration, an email domain. The mitigation is structural: each is behind an adapter written in Sprint 17 whose console/no-op backend is the MVP behaviour, so a failed approval delays a *configuration*, not a release.

### 32.14.3 Release train 2.2 — Sprints 19–21 (weeks 40–45)

**Theme: money in automatically, and the numbers that justify a subscription.** 12 features, 150 points.

| Sprint | Features | Goal | Key dependency |
|---|---|---|---|
| **19** | PAY-06 (payment aggregator), PAY-07 (unmatched queue), SAL-14 (customer-facing invoice page & pay) | Razorpay orders, payment links and QR with signature-verified idempotent webhooks; credits without party context landing in a one-tap mapping queue that learns payer VPA → party; a public invoice page with a pay button whose status updates | PAY-06 **must precede** PAY-07 — the queue is fed by webhooks. Aggregator KYC starts at the beginning of Sprint 13 |
| **20** | SAL-09 (delivery challan), SAL-10 (recurring invoices), EXP-04 (recurring expenses), PLT-11 (app lock/PIN), IMP-03 (Excel templates & bulk edit) | Goods movement without an invoice, convertible; schedules for service businesses; rent and salaries on a cadence; a local PIN/biometric gate for the installed PWA; XLSX import and bulk price update | All five reuse the scheduler and the import engine built at MVP; none needs new primitives |
| **21** | RPT-09 (item movement, fast/slow movers), RPT-10 (profit summary), RPT-11 (staff performance), RPT-12 (GSTR-1 JSON) | Velocity over a window; sales − COGS − expenses by period; sales and collections by user; the offline-tool JSON schema | All four are projections over data already captured at MVP. RPT-12 builds the schema knowledge that Phase 3's e-invoicing depends on |

**Train 2.2 exit criteria.** Payments auto-posting from the aggregator with an unmatched rate below 5 % and a queue that clears; a paying cohort exists — revenue collected from real merchants or from a partner per active merchant; profit summary reconciling against the sales register and the stock valuation.

**Principal risk.** The aggregator webhook is the first place in the product where an external system writes money into the ledger. The mitigation is that it writes through `record_payment()` — the same function a human uses — with an idempotency token derived from `provider_payment_id`, and never through a second code path.

### 32.14.4 What Phase 2 planning defers, and when it happens

| Deferred | Decided at |
|---|---|
| Task-level breakdown of all 37 features | The Phase 1 → Phase 2 boundary, using the observed Phase 1 velocity per Part 13 §13.8 |
| Whether the team is still one developer | The same boundary. If a second engineer joins, the three trains become partly parallel and the 18 sprints compress toward the 16–20 weeks of Part 13 §13.3 |
| Which partner drives WLB-03 … WLB-06 | Phase 2 entry criteria require a named partner with signed intent; features built speculatively will be built wrong |
| Whether HLP-01's content model needs a CMS | After the first fifty support conversations are categorised |

---

## 32.15 Sprint-to-feature coverage

Every MVP feature appears in exactly one sprint. This table is the proof, and it is the artefact a reviewer checks before accepting this chapter.

| Feature | Sprint | Feature | Sprint | Feature | Sprint |
|---|---|---|---|---|---|
| PLT-01 | 1 | LED-01 | 4 | PUR-01 | 9 |
| PLT-02 | 1 | LED-02 | 4 | PUR-02 | 9 |
| PLT-03 | 1 | LED-03 | 4 | PUR-03 | 9 |
| PLT-04 | 1 | LED-04 | 4 | PUR-04 | 9 |
| PLT-05 | 2 | LED-05 | 5 | PAY-01 | 8 |
| PLT-06 | 2 | LED-06 | 5 | PAY-02 | 8 |
| PLT-07 | 2 | LED-07 | 5 | PAY-03 | 8 |
| PLT-08 | 2 | LED-08 | 5 | PAY-04 | 8 |
| PLT-09 | 2 | LED-09 | 8 | PAY-05 | 8 |
| PLT-10 | 12 | LED-10 | 8 | EXP-01 | 10 |
| PLT-14 | 12 | LED-11 | 4 | EXP-02 | 10 |
| PLT-15 | 1 | INV-01 | 6 | EXP-03 | 10 |
| WLB-01 | 2 | INV-02 | 6 | RPT-01 | 11 |
| WLB-02 | 2 | INV-03 | 6 | RPT-02 | 11 |
| PTY-01 | 3 | INV-04 | 6 | RPT-03 | 11 |
| PTY-02 | 3 | INV-05 | 6 | RPT-04 | 11 |
| PTY-03 | 3 | INV-06 | 6 | RPT-05 | 11 |
| PTY-04 | 3 | INV-07 | 6 | RPT-06 | 11 |
| PTY-05 | 3 | INV-08 | 6 | RPT-07 | 11 |
| PTY-06 | 3 | INV-09 | 10 | RPT-08 | 11 |
| PTY-10 | 10 | SAL-01 | 9 | NTF-01 | 5 |
| | | SAL-02 | 7 | NTF-02 | 5 |
| | | SAL-03 | 7 | NTF-03 | 5 |
| | | SAL-04 | 9 | IMP-01 | 10 |
| | | SAL-05 | 9 | IMP-02 | 10 |
| | | SAL-06 | 7 | | |
| | | SAL-07 | 7 | | |
| | | SAL-08 | 7 | | |

**Count: 74 features, 74 assignments, no duplicates, no omissions.** Cross-checked against Part 12 §12.2 row by row.

### 32.15.1 Coverage by sprint

| Sprint | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Features | 5 | 7 | 6 | 5 | 7 | 8 | 5 | 7 | 7 | 7 | 8 | 2 | **74** |
| Points | 50 | 50 | 49 | 50 | 50 | 50 | 50 | 50 | 50 | 50 | 50 | 49 | 598 |
| Points/feature | 10.0 | 7.1 | 8.2 | 10.0 | 7.1 | 6.3 | 10.0 | 7.1 | 7.1 | 7.1 | 6.3 | 24.5 | 8.1 |

The points-per-feature column is the plan's own sanity check. Sprints 1, 4 and 7 carry the highest ratio because they contain the three structural pieces of the product — identity, the ledger spine and the tax engine. Sprint 12's ratio is meaningless because its work is the launch checklist, not its two features.

### 32.15.2 Burn-up projection

Cumulative MVP features delivered, assuming the committed 50 points per sprint hold:

| Sprint end | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Features (plan) | 0 | 5 | 12 | 18 | 23 | 30 | 38 | 43 | 50 | 57 | 64 | 72 | 74 |
| % of MVP | 0 | 7 | 16 | 24 | 31 | 41 | 51 | 58 | 68 | 77 | 86 | 97 | 100 |
| Points burned | 52 | 102 | 152 | 201 | 251 | 301 | 351 | 401 | 451 | 501 | 551 | 600 | — |
| Demo-script coverage | 0 % | 15 % | 15 % | 25 % | 55 % | 65 % | 65 % | 85 % | 90 % | 95 % | 95 % | 100 % | 100 % |

Three readings of this table matter more than the numbers.

**The curve is deliberately flat at the start and steep in the middle.** Sprints 0–2 deliver twelve features for 152 points, because they are building the chassis and the design system that Sprints 3–11 consume at 6–7 points per feature. A plan whose early sprints look productive on a feature count is a plan that will pay for it later.

**Demo-script coverage is a better progress signal than feature count**, and is tracked as the primary one. It is the proportion of the eight-minute launch demo (Part 12 §12.6) that runs end to end on the build at each sprint boundary. It jumps at Sprint 4 (the ledger, which is half the demo) and at Sprint 7 (the invoice), and it is the number reported to a pilot partner, because a partner does not care how many features exist — they care what they can show a merchant.

**The re-base trigger is drawn on this chart.** If cumulative points burned at the end of Sprint 3 is below 170 (that is, actual velocity below 42 points/sprint), the projection is re-based at the observed rate, the launch date moves, and the cut-line list of Part 12 §12.7 is opened at item 1. Re-basing at Sprint 3 costs a day of replanning; discovering the same fact at Sprint 10 costs the launch.

---

## 32.16 Ceremonies

At this team size most agile ceremony is theatre. What follows is the complete list of what is kept, what it costs, and — equally importantly — what is deliberately skipped and why.

### 32.16.1 Kept

| Ceremony | When | Duration | Output | Why it earns its time |
|---|---|---|---|---|
| **Sprint planning** | First Monday, 09:00 | 2 h | A committed list of Part 33 task IDs totalling ≤ 50 points, with every task's files, acceptance check and dependencies already written | This is not a meeting, it is the act of decomposition. Skipping it means the agent is directed ad hoc, which is the single fastest way to produce code that does not match the specification |
| **Daily written stand-up** | Every morning | 5 min, written | Three lines in a running file: yesterday, today, blocked | Written, not spoken, because there is nobody to speak to. Its value is entirely in the third line: a blocker written down at 09:00 is escalated on the same day rather than absorbed for a week |
| **Mid-sprint checkpoint** | Second Wednesday, 16:00 | 30 min | Burn-up updated; the carry/reset/split/cut classification of §32.1.5 applied *provisionally* | This is the ceremony that makes §32.1.5 possible. Classifying at the boundary is too late to act; classifying with four days left allows a split to be engineered rather than improvised |
| **Sprint review / demo** | Second Friday, 14:00 | 1 h | The sprint's demo script executed on the merged build, recorded as a screen capture, plus the demo-script coverage percentage | Recording it matters: the recording is the pilot partner's fortnightly update and the regression baseline for the next sprint |
| **Retrospective** | Second Friday, 15:00 | 30 min | Exactly **one** change to how the next sprint is run, written down. Never a list | One change is adoptable; five are ignored. The constraint is the point |
| **Backlog grooming** | Second Friday, 15:30 | 1 h | The next sprint's tasks decomposed in Part 33 to the record depth §32.1.4 requires | Without this, planning on Monday becomes decomposition on Monday and the sprint starts on Tuesday |
| **Velocity recording** | Second Friday, 16:30 | 15 min | Actual points completed appended to the estimate history (Part 13 §13.8) | Three data points make the next estimate evidence-based rather than optimistic. This is the cheapest ceremony and the one with the longest-lived value |

**Total ceremony cost: approximately 5.5 hours per two-week sprint** — about 4 points, which is what §32.1.3 deducted.

### 32.16.2 Deliberately skipped

| Skipped | Why |
|---|---|
| **Daily synchronous stand-up** | One person. A spoken status report to nobody is pure cost. The written form keeps the only useful part — the blocker |
| **Planning poker / estimation meetings** | Estimation by consensus requires more than one estimator. Estimates come from Part 33's task records and are corrected by the velocity history |
| **Story-point re-estimation mid-sprint** | Re-estimating work in flight produces a more accurate number about a decision already made. The mid-sprint checkpoint measures *progress*, not revised estimates |
| **Separate design review** | Part 23 is the design authority and it is already written. A review loop would be a review against the same document the implementer is already reading |
| **Separate architecture review board** | Parts 19 and 20 are the architecture, and `tests/architecture/test_import_rules.py` is its enforcement. A meeting cannot enforce a dependency rule that a test can |
| **Code review as a scheduled ceremony** | Review is continuous and per-PR, not batched. It is the sprint's actual work, not an event within it |
| **Definition-of-ready workshops** | The definition of ready is §32.1.4's four promises, and it is checked mechanically at planning |
| **Release planning meetings** | The release train is fixed in Part 13 §13.6. A feature that misses its release moves to the next one; there is nothing to meet about |
| **Stakeholder demo separate from sprint review** | The sprint review recording *is* the stakeholder demo. Producing two artefacts from one build is duplication |
| **Burndown charts** | A burndown within a two-week sprint for one person is noise. The burn-**up** across sprints (§32.15.2) is the signal, because it measures delivery against the whole, not consumption against a commitment |

### 32.16.3 The one ceremony that is added

**The specification-drift review**, thirty minutes at the end of every third sprint (3, 6, 9, 12). Its only question: *what did we build that the specification does not describe, and what does the specification describe that we built differently?* Every divergence found is resolved in one of two directions — the code changes, or a Part 39 change request updates the specification — and neither is allowed to be left open past the following sprint.

This exists because the failure mode of a heavily-specified project built by an AI agent is not that the agent ignores the specification; it is that small, locally-reasonable deviations accumulate until the specification silently stops describing the product, at which point every guarantee in Part 34 evaporates. Thirty minutes every six weeks is the cheapest insurance in this plan.

---

## 32.17 Changing this plan

A sprint's contents may be changed under exactly three conditions, and the change is recorded in Part 39 in every case:

1. **Before the sprint starts**, freely, at planning — subject to §32.2.1's five ordering constraints, which are not negotiable within Phase 1.
2. **During the sprint**, only by the carry/reset/split/cut mechanism of §32.1.5, applied at the mid-sprint checkpoint or the boundary. Adding work mid-sprint is forbidden outright; the reserve absorbs surprises, it does not fund new scope.
3. **At a re-base** (§32.1.5), when three consecutive sprints miss by more than 20 %, which re-estimates every remaining sprint at the observed velocity and may open the cut-line list.

A change that moves a feature from one sprint to another must name the feature that moves in the opposite direction, for the same reason Part 13 §13.8 requires it at phase scale: a sprint has a capacity, and adding to it without removing from it moves the date for everything downstream. The only exception is a regulatory change with a statutory deadline, which is treated as a defect against the current product and scheduled immediately.
