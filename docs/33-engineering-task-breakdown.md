# Part 33 — Engineering Task Breakdown

This is the work-breakdown structure for DigiKhaato. It decomposes the product to **Phase → Epic → Module → Feature → Task → Subtask** and is the document an AI coding agent (Part 34) is pointed at when it asks "what exactly do I build, in which file, and how do I know it is right?".

It is deliberately the least elegant chapter in the specification. It is a list. Its virtue is exhaustiveness, not readability: a task that is not in here does not get built, and a task that is in here but ambiguous gets built wrong. Where a choice existed between a shorter formulation and an unambiguous one, the unambiguous one was taken every time.

---

## 33.1 How to read this chapter

### 33.1.1 The six levels

| Level | Example | Defined where | Who owns it |
|---|---|---|---|
| **Phase** | Phase 1 (MVP) | Part 13 §13.2 | The roadmap |
| **Epic** | `EPIC-LEDGER` — the party ledger and its corrections | This chapter, §33.5 | This chapter |
| **Module** | `ledger` | Canon §0.3 | Canon |
| **Feature** | `LED-03` — correct or reverse an entry | Part 16, specified in Part 17 | The FRD |
| **Task** | `TSK-LED-03-06` — implement `correct_entry()` | This chapter | This chapter |
| **Subtask** | `TSK-LED-03-06.2` — enforce reason-required and map to `DomainError` | This chapter, where a task needs ordering inside itself | This chapter |

An **epic** is a coherent slab of product that a sprint or two delivers and that has a single demonstrable claim attached. A **task** is the unit an agent picks up, implements and opens a PR for: it touches one layer, it names its files, and it has one acceptance check. A **subtask** exists only where the order of work inside a task matters enough to write down — typically inside a service that must take locks in a specific sequence, or inside a migration that must run in three steps.

**A task is sized so that one PR closes it.** If a task cannot be reviewed in one sitting, it is two tasks.

### 33.1.2 The task-ID scheme

```
TSK-<FEATURE>-<NN>[.<S>]
 │      │        │    └── subtask sequence, 1-based, only when present
 │      │        └─────── task sequence within the feature, 2 digits, 01-based
 │      └──────────────── the canon §0.5 feature ID (module prefix + number)
 └─────────────────────── literal prefix marking a work item
```

Examples: `TSK-LED-01-04`, `TSK-SAL-02-17`, `TSK-PTY-02-09.3`.

Cross-cutting work that belongs to no single feature uses an area code in the feature position:

```
TSK-CHS-<AREA>-<NN>
```

where `<AREA>` ∈ `{TEN, AUTH, PERM, AUD, IDEM, JOB, DS, I18N, PRINT, IMPORT, CI, SEED, OBS}` — tenancy, authentication, permissions, audit, idempotency, jobs, design system, internationalisation, print/PDF, the CSV import engine, continuous integration, seed data, observability. Example: `TSK-CHS-TEN-03`.

**Why `TSK-` and not `T-`.** The chapter brief proposed `T-<MODULE>-<FEATURE>-<NN>`. That would collide exactly with Part 28 §28.6.1's test identifiers, which are already `T-<FEATURE>-n` and are used as the join key of the traceability matrix — `T-LED-01-4` is a test, and `T-LED-01-04` as a task would be indistinguishable in a grep, a commit message or a CI report. The module is already the first element of the feature ID, so including it twice adds nothing. `TSK-` is therefore used throughout, and the collision is recorded here rather than discovered by a broken traceability build.

**IDs are stable.** A withdrawn task keeps its number and is marked `withdrawn`; numbers are never reused. A task that splits becomes `-NN` plus a new highest number, never `-NNa`/`-NNb`.

### 33.1.3 The task record format

Every task is one table row with eight columns:

| Column | Meaning | Rules |
|---|---|---|
| **ID** | `TSK-…` per §33.1.2 | Unique across the whole chapter |
| **Title** | An imperative phrase naming the artefact, not the activity | "Implement `post_entry()`", never "Work on ledger service" |
| **L** | Layer: `DB`, `BE`, `FE`, `DS`, `Infra`, `Test`, `Docs` | Exactly one. A task that spans two layers is two tasks |
| **Files** | The real paths from Part 19 §19.2 and Part 20 §20.2 that the task creates (`+`) or modifies (`~`) | Real paths only. A path that does not appear in an architecture chapter is a specification gap and must be raised, not invented |
| **Acceptance** | The one check that proves the task is done | Objectively checkable: a passing test, a returned status code, a measured number. Never "works correctly" |
| **P** | Points, per Part 32 §32.1.3 (1 point = half a supervised day) | 0.5, 1, 2, 3, 5 or 8. Anything above 8 is decomposed |
| **Deps** | Task IDs that must be merged first | Within-feature deps are written bare (`04`); cross-feature deps carry the full ID |
| **FRD** | The FRD requirement IDs this task discharges | `FR-n`, `BR-n`, `EC-n`, `AC-n`, or a Part 21/22 section for chassis work |

Layer codes, precisely:

- **DB** — a migration, a constraint, a trigger, an index. Owns `migrations/` and nothing else.
- **BE** — Python under `apps/`: models, managers, services, selectors, serializers, filters, permissions, views, urls, tasks.
- **FE** — TypeScript under `frontend/src/modules/` and `frontend/app/`: services, thunks, slices, types, validation, view-models, hooks, components, routes.
- **DS** — `frontend/src/modules/DigiKhaato/design-system/` and the token pipeline. Separate from FE because Part 23 governs it and because a `Ub*` component is reviewed against a different checklist.
- **Infra** — compose, Dockerfiles, CI, Makefile, nginx, settings shape.
- **Test** — a test that is not co-delivered with its production code: the generated matrices, the E2E suites, the performance fixtures, the architecture tests. **Ordinary unit and API tests are not separate tasks** — they are part of the BE or FE task that creates the code, because Part 28 and Part 26 §26.20 make a file without its tests incomplete by definition.
- **Docs** — the traceability artefacts, the CSV templates, the runbooks.

### 33.1.4 What a task does *not* need to say

Four things are true of every task in this chapter and are never repeated in a row:

1. **Tests ship with the code.** Every BE task writes the tests Part 26 §26.21 line 40 requires; every FE task writes the tests Part 25 §25.19 requires. A task's acceptance check names the *distinguishing* test, not the whole suite.
2. **i18n ships with the UI.** Every FE and DS task that renders a string adds the key to both `locales/en.json` and `locales/hi.json`. This is canon §0.11 rule 6 and is checked by `npm run i18n:check`.
3. **Tenancy, audit, transactions and idempotency are structural.** Every BE write task runs inside `transaction.atomic()`, writes exactly one audit row per logical event, scopes every queryset, and accepts `Idempotency-Key` where Part 22 §22.1 requires it. A row does not restate this; a task that *cannot* do it is a specification gap.
4. **The permission matrix and the cross-tenant sweep are generated.** Adding an endpoint adds rows to `tests/matrix/permissions.py` and is automatically covered by the Part 28 §28.2.1 endpoint sweep. Only a *deviation* from the default expectation is a named task.

### 33.1.5 Resolution by phase

**Phase 1 (MVP) is broken down to task and subtask depth**, in §33.4 (cross-cutting) and §33.5 (by module). Every one of the 74 MVP features has a complete task list.

**Phase 2 is broken down to epic and task-group depth only**, in §33.6, and this is deliberate rather than an omission. Part 32 §32.14.4 states the reason: Phase 2 starts eleven months after this chapter is written, several of its features depend on external contracts whose shape is unknown, and its velocity will be re-estimated at the phase boundary. Decomposing it to task depth now would produce a document that is precise and wrong. Each Phase 2 feature therefore gets: its epic, its task groups with a points estimate per group, its ordering constraints, and the named artefacts it must produce — enough to plan a sprint against, not enough to hand to an agent without a decomposition pass first.

**Phase 3 and Future are not in this chapter at all.** Part 16 specifies them to catalogue level and Part 13 §13.5 forbids them from influencing current architecture.

---

## 33.2 Epic map

| Epic | Phase | Modules | Features | Sprints | Tasks | Listed pts | Effective pts |
|---|---|---|---|---|---|---|---|
| `EPIC-CHASSIS` | 1 | — (cross-cutting) | — | 0–3, 7, 10 | 133 | 306.5 | 168.6 |
| `EPIC-IDENTITY` | 1 | platform | PLT-01 … PLT-04, PLT-15 | 1 | 49 | 104.0 | 41.6 |
| `EPIC-GOVERNANCE` | 1 | platform, white-label | PLT-05 … PLT-09, WLB-01, WLB-02 | 2 | 52 | 124.0 | 44.6 |
| `EPIC-PARTIES` | 1 | parties | PTY-01 … PTY-06 | 3 | 53 | 110.0 | 37.4 |
| `EPIC-LEDGER` | 1 | ledger | LED-01 … LED-04, LED-11 | 4 | 48 | 117.0 | 52.7 |
| `EPIC-COLLECTIONS` | 1 | ledger, notifications | LED-05 … LED-08, NTF-01 … NTF-03 | 5 | 43 | 97.0 | 33.0 |
| `EPIC-INVENTORY` | 1 | inventory | INV-01 … INV-08 | 6 | 65 | 153.0 | 53.6 |
| `EPIC-SALES-CORE` | 1 | sales, tax | SAL-02, SAL-03, SAL-06 … SAL-08 | 7–8 | 61 | 174.0 | 73.1 |
| `EPIC-PAYMENTS` | 1 | payments, ledger | PAY-01 … PAY-05, LED-09, LED-10 | 8 | 39 | 103.0 | 37.1 |
| `EPIC-SALES-PURCH` | 1 | sales, purchases | SAL-01, SAL-04, SAL-05, PUR-01 … PUR-04 | 9 | 48 | 130.0 | 33.8 |
| `EPIC-MIGRATION` | 1 | expenses, imports, parties, inventory | EXP-01 … EXP-03, IMP-01, IMP-02, PTY-10, INV-09 | 10 | 35 | 82.0 | 28.7 |
| `EPIC-REPORTS` | 1 | reports | RPT-01 … RPT-08 | 11 | 36 | 97.0 | 25.2 |
| `EPIC-LAUNCH` | 1 | platform + all | PLT-10, PLT-14 + launch hardening | 12 | 22 | 74.0 | 40.7 |
| `EPIC-P2-DEPTH` | 2 | inventory, purchases, help | 13 features | 13–15 | (groups) | 150 | — |
| `EPIC-P2-PARTNER` | 2 | white-label, notifications, ledger, parties | 12 features | 16–18 | (groups) | 150 | — |
| `EPIC-P2-MONEY` | 2 | payments, sales, reports, expenses, imports, platform | 12 features | 19–21 | (groups) | 150 | — |

**Phase 1 totals: 684 tasks, 16 subtasks, 1,671.5 listed points, 610.1 effective points.**

Two numbers need explaining before the breakdown begins, and both are explained in full in §33.8.3.

**Why listed points exceed Part 32's 598.** Every estimate in this chapter is a **first-instance** estimate — the cost of building the first serializer pair, the first form drawer, the first report selector. The breakdown is overwhelmingly repeated patterns, and the second instance of a pattern costs about half the first while the third and subsequent cost about a fifth. Applying that factor yields 610.1 effective points against Part 32's 598 committed, which reconciles within the sprint reserve.

**Why an epic's points exceed its sprint's budget.** An epic is a slab of *product*; a sprint is a slab of *time*. `EPIC-LEDGER` lists 117 points but Sprint 4 commits 50, because much of the epic's listed cost is chassis and design-system work that landed in earlier sprints (`CHS-DS`, `CHS-PRINT`, `CHS-IDEM`) and is counted once, in `EPIC-CHASSIS`. No task is counted twice anywhere in this chapter; the epic totals and the sprint budgets are simply different cuts of the same 684 rows.

---

## 33.3 Conventions used in every task list

**Path shorthand.** To keep rows readable, three prefixes are abbreviated:

| Shorthand | Expands to |
|---|---|
| `@be/<app>/…` | `backend/apps/<app>/…` (and `@be/platform/` is `backend/apps/platform_app/`, label `platform`) |
| `@fe/<feature>/…` | `frontend/src/modules/DigiKhaato/features/<feature>/…` |
| `@ds/<Component>/` | `frontend/src/modules/DigiKhaato/design-system/<Component>/` |
| `@app/…` | `frontend/app/…` |
| `@src/…` | `frontend/src/…` |

**The standard eleven-task shape for a simple CRUD feature.** Most features decompose into some subset of this sequence, and the numbering below is used consistently so that `-03` is always the service and `-08` is always the slice:

| NN | Layer | What |
|---|---|---|
| 01 | DB | Migration: table, constraints, indexes |
| 02 | BE | Model, manager, constants |
| 03 | BE | Service (writes) |
| 04 | BE | Selector (reads) |
| 05 | BE | Serializers (read + write, separate classes) |
| 06 | BE | FilterSet and permissions |
| 07 | BE | ViewSet, actions, urls |
| 08 | FE | Types + service client |
| 09 | FE | Slice + thunk |
| 10 | FE | Validation schema |
| 11 | FE | View-model |
| 12+ | FE/DS | Components, route, drawer, dialogs |
| last | Test | E2E coverage for the feature's critical path |

A feature deviates from this shape only where its FRD requires it, and where it does the deviation is visible because a number is missing or an extra one appears.

**Estimate calibration**, so that points mean the same thing everywhere:

| Points | Typical task |
|---|---|
| 0.5 | A constants file; a thin route file; adding a filter; a barrel export; one i18n key group |
| 1 | A serializer pair; a FilterSet; a view-model module; a simple migration; a `useX` hook |
| 2 | A model with constraints; a selector with joins and a query budget; a slice with its thunk; a list component |
| 3 | A write service with locks and audit; a form drawer with validation and server-error mapping; a `Ub*` wrapper with full state coverage |
| 5 | A multi-step orchestrating service; a screen with filters, totals and ten states; the token pipeline |
| 8 | The tax engine; the import engine; `issue_invoice()`; the refresh-on-401 queue |

---

## 33.4 `EPIC-CHASSIS` — cross-cutting work that belongs to no feature

**Claim.** A developer clones the repository, runs one command, and gets a running multi-tenant application with an enforced architecture, a design system, an i18n pipeline, a job runner and a green pipeline — with no business logic in it.

This epic is what Part 32 §32.3 calls Sprint 0, plus the pieces that trail into Sprints 1, 2 and 10 because their first consumer arrives then. It is the highest-leverage section of the whole breakdown: the AI coding agent pattern-matches against what already exists, so everything here is copied hundreds of times.

### 33.4.1 `CHS-CI` — repository, tooling and pipeline

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-CHS-CI-01 | Create the repository root and directory skeleton | Infra | `+Makefile` `+README.md` `+.gitignore` `+.editorconfig` `+backend/` `+frontend/` `+e2e/` `+docs/` | `tree -L 2` equals Part 20 §20.2.1 ∪ Part 19 §19.2.1 | 0.5 | — | 20.2.1, 19.2.1 |
| TSK-CHS-CI-02 | Configure Python tooling | Infra | `+backend/pyproject.toml` | `black --check`, `isort --check`, `ruff check`, `mypy` all exit 0 on an empty tree | 1 | 01 | 26.14 |
| TSK-CHS-CI-03 | Pin the backend dependency allow-list | Infra | `+backend/requirements/base.txt` `+dev.txt` `+prod.txt` | Every line matches ADR-021; every version uses `==` | 0.5 | 02 | ADR-021 |
| TSK-CHS-CI-04 | Assert the dependency allow-list in CI | Test | `+backend/tests/architecture/test_dependencies.py` | Adding `requests` to `base.txt` fails the test naming the package | 1 | 03 | ADR-021 |
| TSK-CHS-CI-05 | Scaffold the frontend package with the allow-list | Infra | `+frontend/package.json` `+frontend/package-lock.json` | `npm ci` reproducible; a Jest allow-list test mirrors TSK-CHS-CI-04 | 1 | 01 | ADR-021 |
| TSK-CHS-CI-06 | Write the ESLint flat config with the import-zone rules | Infra | `+frontend/eslint.config.mjs` | Four fixture files under `@src/tests/lint-fixtures/` each fail with the expected rule id: deep DS import, `../../../`, axios outside `api/`, `any` | 3 | 05 | 25.2, 25.17 |
| TSK-CHS-CI-07 | Configure TypeScript strict mode and the four path aliases | Infra | `+frontend/tsconfig.json` `+frontend/.prettierrc` | `npx tsc --noEmit` clean; an `any` fails the build; `modules/*` resolves | 0.5 | 05 | 19.2.6, R-TS-1 |
| TSK-CHS-CI-08 | Build the backend image | Infra | `+backend/Dockerfile` `+backend/docker/entrypoint.sh` | Image builds from a digest-pinned base; the entrypoint never runs `migrate` | 2 | 03 | 29.2.5, 29.4.1 |
| TSK-CHS-CI-09 | Build the frontend image (Next.js standalone) | Infra | `+frontend/Dockerfile` | `node server.js` serves on :3000 from the built image | 1 | 05 | 29.2.6 |
| TSK-CHS-CI-10 | Write the base compose topology | Infra | `+docker-compose.yml` | Four healthy services; named volumes `ub_db_data`, `ub_media`, `ub_static` survive `down` | 3 | 08,09 | 29.2.1, 29.2.2 |
| TSK-CHS-CI-11 | Write the dev and prod compose overlays | Infra | `+docker-compose.dev.yml` `+docker-compose.prod.yml` `+deploy/nginx.conf` | Prod overlay starts nginx and proxies `/api` and `/` per §29.7.3 | 1 | 10 | 29.2.3, 29.7.3 |
| TSK-CHS-CI-12 | Write `.env.example` with every variable and a safe default | Infra | `+.env.example` | A settings test fails when a variable read at import time is absent | 0.5 | 10 | 29.2.4 |
| TSK-CHS-CI-13 | Write the CI workflow: check, test, e2e, traceability | Infra | `+.github/workflows/ci.yml` | A PR with a lint error, a failing test, a missing migration or an unimplemented FRD test ID is each blocked | 3 | 06,07,10 | 28.11, 29.9.1 |
| TSK-CHS-CI-14 | Write the Makefile targets | Infra | `~Makefile` | `make ci` reproduces the pipeline locally | 0.5 | 13 | 29.9.3 |
| TSK-CHS-CI-15 | Install formatter-only pre-commit hooks | Infra | `+.husky/pre-commit` `+backend/.githooks/pre-commit` | An unformatted commit is auto-formatted, never rejected | 0.5 | 02,07 | 25.0 |
| TSK-CHS-CI-16 | Add the coverage gates and the no-assertion lint | Test | `~backend/pyproject.toml` `~frontend/jest.config.ts` `+backend/tests/architecture/test_assertions.py` | Backend < 85 % or frontend < 75 % fails; a test function with no `assert` is flagged | 2 | 13 | 28.7 |
| TSK-CHS-CI-17 | Build the traceability generator | Test | `+@be/common/management/commands/build_traceability.py` `+frontend/src/tests/traceabilityReporter.ts` `+e2e/reporters/traceability.ts` | `build/traceability.json` lists unimplemented, orphaned and unmapped-AC entries; an unimplemented ID for a done feature fails CI | 3 | 13 | 28.6.2 |
| TSK-CHS-CI-18 | Add the bundle-budget check | Infra | `+frontend/scripts/check-bundle.mjs` | Exceeding a Part 19 §19.9.2 budget fails with the route name and the overage | 1 | 09 | 19.9.2 |

**Subtotal: 18 tasks, 25.0 points.**

### 33.4.2 `CHS-TEN` — tenancy, the shared kernel and data primitives

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-CHS-TEN-01 | Create the Django project and four settings modules | BE | `+@be/../config/settings/{base,dev,prod,test}.py` `+config/urls.py` `+config/wsgi.py` `+config/asgi.py` | `manage.py check --deploy` clean under `prod`; a test asserts `DEBUG=False` there | 2 | CHS-CI-03 | 20.2, 29.2.4 |
| TSK-CHS-TEN-02 | Create all fifteen app packages with their `AppConfig` | BE | `+@be/{common,platform,tax,files,parties,ledger,inventory,sales,purchases,payments,expenses,notifications,imports,reports,help}/apps.py` and package skeletons | `showmigrations` lists fifteen labels; `platform_app` declares `label="platform"` | 2 | 01 | 20.1.2 |
| TSK-CHS-TEN-03 | Write the architecture import-rule test | Test | `+backend/tests/architecture/test_import_rules.py` | A module-level `from apps.sales import …` inside `apps/parties/` fails with a named message citing rule D4 | 3 | 02 | 20.1.4, 20.1.5 |
| TSK-CHS-TEN-04 | Implement the numeric field classes and `uuid7_pk()` | BE | `+@be/common/db/fields.py` | `MoneyField` rejects 3 dp; `uuid7_pk()` generates time-ordered v7 values with no new dependency | 2 | 02 | 21.1, R3.2, R3.3 |
| TSK-CHS-TEN-05 | Implement the abstract base models | BE | `+@be/common/models.py` | A model inheriting `TenantModel` gets `id`, `tenant`, `created_at`, `updated_at`, `created_by` with Part 21 §21.1 semantics | 1 | 04 | 21.1, R3.9 |
| TSK-CHS-TEN-06 | Implement `TenantQuerySet`, `TenantManager`, `SoftDeleteManager` | BE | `+@be/common/managers.py` | `Model.objects.all()` outside a tenant context raises; `all_objects` is importable only from an allow-listed module | 3 | 05 | 20.4.4, canon 0.11-2 |
| TSK-CHS-TEN-07 | Implement `get_effective_tenant()`, `TenantContext`, `current_tenant()` | BE | `+@be/common/tenancy.py` | Resolution order of Part 20 §20.4.2 asserted for all five sources; `X-Tenant-Id` is ignored | 3 | 06 | 20.4.2, 22.1 |
| TSK-CHS-TEN-08 | Implement the middleware stack | BE | `+@be/common/middleware.py` `~config/settings/base.py` | `X-Request-Id` echoed on every response including error envelopes; tenant resolved from the `tid` claim only | 2 | 07 | 20.4.3, 22.1 |
| TSK-CHS-TEN-09 | Implement the `DomainError` hierarchy and the DRF handler | BE | `+@be/common/exceptions.py` | Every canon error code of Part 22 §22.1 produced with the right status by a fixture view | 3 | 02 | 20.3.5, 22.1, R8.1–R8.4 |
| TSK-CHS-TEN-10 | Implement `StandardResponse` and the envelope renderer | BE | `+@be/common/responses.py` `+@be/common/renderers.py` | Success and error envelopes match Part 22 §22.1 byte for byte in a snapshot test | 2 | 09 | 22.1, R7.6 |
| TSK-CHS-TEN-11 | Implement page and cursor pagination | BE | `+@be/common/pagination.py` | `meta` shape matches §22.1 for both styles; `page_size` capped at 100 | 2 | 10 | 22.1 |
| TSK-CHS-TEN-12 | Implement `BaseTenantFilterSet` and the shared filters | BE | `+@be/common/filters.py` | `DateRangeFilter` and `MultiEnumFilter` handle the comma-list and `date_from`/`date_to` forms | 1 | 11 | 22.1, R7.3 |
| TSK-CHS-TEN-13 | Implement `TenantScopedViewSet` and `TenantPrimaryKeyRelatedField` | BE | `+@be/common/viewsets.py` | A fixture viewset returns 404 for a cross-tenant id with no extra code in the view | 2 | 12 | 20.4.5, R6.6, R7.1 |
| TSK-CHS-TEN-14 | Implement the money helpers | BE | `+@be/common/money.py` | A 40-row table test covers `q2`/`q3`/`q4`, half-up at the `.005` boundary in both signs, and `allocate_proportional` summing exactly | 2 | 04 | 20.7, canon 0.11-3 |
| TSK-CHS-TEN-15 | Implement the date helpers | BE | `+@be/common/dates.py` | FY boundary at 23:30 UTC on 31 March resolves to the next FY in `Asia/Kolkata` | 1 | 02 | 20.7, 21.1 |
| TSK-CHS-TEN-16 | Implement structured JSON logging with the no-PII guard | BE | `+@be/common/logging.py` `~config/settings/base.py` | A log line carries `request_id` and `tenant_id`; a test asserts no `+91…` pattern reaches a handler | 1 | 08 | 30.3, ADR-018 |
| TSK-CHS-TEN-17 | Write the two-tenant test fixtures and factories | Test | `+backend/tests/conftest.py` `+backend/tests/factories/*.py` | `two_tenants_full` seeds one of every entity in both tenants; `api_as("staff")` returns an authenticated client | 3 | 13 | 28.3.1, 28.3.2 |
| TSK-CHS-TEN-18 | Build the generated cross-tenant endpoint sweep | Test | `+backend/tests/matrix/test_tenant_isolation.py` | Every detail route with another tenant's id returns 404 `not_found`; a new unscoped endpoint fails on the commit that adds it | 3 | 17 | 28.2.1 |
| TSK-CHS-TEN-19 | Build the AST check forbidding unscoped querysets | Test | `+backend/tests/architecture/test_no_unscoped_queryset.py` | `Model.objects.all()` in a business app fails the test with file and line | 2 | 18 | 28.2.1 |
| TSK-CHS-TEN-20 | Implement the file storage primitives | BE | `+@be/common/storage.py` | Magic-byte validation rejects a renamed `.exe`; EXIF is stripped; the tenant path is enforced | 3 | 07 | 20.9.1–20.9.3 |
| TSK-CHS-TEN-21 | Implement `check_invariants` | BE | `+@be/common/management/commands/check_invariants.py` | A read-only report listing balance and stock drift, orphan attachments and dangling sequences | 2 | 14 | 20.11.5 |

**Subtotal: 21 tasks, 45.0 points.**

### 33.4.3 `CHS-AUTH` — authentication and session transport

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-CHS-AUTH-01 | Configure SimpleJWT with the five claims | BE | `~config/settings/base.py` `+@be/common/authentication.py` | A decoded token carries `sub`, `tid`, `rol`, `sid`, `ver`; 15-min access, 30-d refresh | 2 | CHS-TEN-08 | 22.2, 20.5.1 |
| TSK-CHS-AUTH-02 | Implement `CookieOrBearerJWTAuthentication` | BE | `~@be/common/authentication.py` | Browser cookie and `Authorization: Bearer` both authenticate; the cookie path carries CSRF double-submit | 3 | 01 | 22.1, 19.7.1 |
| TSK-CHS-AUTH-03 | Implement the refresh-family model and rotation | BE | `+@be/platform/models/session.py` `+@be/platform/services/session.py` | Reuse of a rotated refresh token revokes the whole family and returns 401 | 3 | 01 | 22.2, 20.5.2 |
| TSK-CHS-AUTH-04 | Build the axios instance with interceptors | FE | `+@src/api/AxiosInstances.ts` | `X-Request-Id` and `Accept-Language` on every request; errors normalised through `handleAxiosError` | 3 | CHS-CI-07 | 19.4.1, 19.4.2 |
| TSK-CHS-AUTH-05 | Build the single-flight refresh-on-401 queue | FE | `~@src/api/AxiosInstances.ts` | Two concurrent 401s trigger exactly one refresh; both original requests replay with the new token | 5 | 04 | 19.4.3 |
| TSK-CHS-AUTH-06 | Write `APIPaths.ts` and `constants.ts` | FE | `+@src/api/APIPaths.ts` `+@src/constants.ts` | A test asserts every canon §0.8 path has a constant | 2 | 04 | 0.8, ADR-004 |
| TSK-CHS-AUTH-07 | Implement `ApiError` normalisation | FE | `+@src/utils/apiError.ts` `+@src/types/api.types.ts` | `toApiError` maps 400/401/403/404/409/429/500 to a discriminated union carrying `code`, `details` and `requestId` | 2 | 04 | 19.4.4, R-RX-6 |
| TSK-CHS-AUTH-08 | Build `sessionSlice` and the bootstrap sequence | FE | `+@src/redux/slice/sessionSlice.ts` `+@src/api/authService.ts` | `/auth/me` hydrates user, memberships, active tenant, permissions, plan limits and feature flags before the first guarded render | 3 | 06,07 | 19.7.2 |
| TSK-CHS-AUTH-09 | Implement the route guards and the `next` parameter | FE | `+@src/components/layout/AuthGuard.tsx` `~@app/(app)/layout.tsx` | An unauthenticated deep link redirects to login and returns to the original route after auth | 2 | 08 | 19.7.3, 19.7.4 |
| TSK-CHS-AUTH-10 | Implement `usePermissions` and component-level gating | FE | `+@src/hooks/usePermissions.ts` | `can('sales.invoice.void')` is false for staff; a gated button renders its disabled state with a reason tooltip | 2 | 08 | 19.7.5 |

**Subtotal: 10 tasks, 27.0 points.**

### 33.4.4 `CHS-PERM` — the permission registry

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-CHS-PERM-01 | Encode the canon §0.9 codename registry | BE | `+@be/common/permissions_registry.py` | A test asserts the registry set equals canon §0.9 character for character | 2 | CHS-TEN-02 | 0.9 |
| TSK-CHS-PERM-02 | Encode the four system roles' codename sets | BE | `~@be/common/permissions_registry.py` `+@be/common/management/commands/seed_roles.py` | `staff` lacks every `*.void`, `ledger.entry.correct`, `reports.financial.read` and `platform.*` | 2 | 01 | 0.9 |
| TSK-CHS-PERM-03 | Implement `HasPermission`, `ModuleEnabled`, `PlanLimit`, `IsSuperAdmin` | BE | `+@be/common/permissions.py` | A disabled module returns 403 `module_disabled`; an exceeded limit returns 403 `plan_limit_reached` | 3 | 02 | 20.5.5, 22.1 |
| TSK-CHS-PERM-04 | Build the generated permission matrix test | Test | `+backend/tests/matrix/permissions.py` `+backend/tests/matrix/test_permissions.py` | Every (method, route) × {owner, admin, staff, accountant, anonymous, other-tenant} cell has a declared expectation and is asserted | 3 | 03, CHS-TEN-17 | 28.2.2 |
| TSK-CHS-PERM-05 | Assert every viewset declares `permission_classes` | Test | `+backend/tests/architecture/test_permissions_declared.py` | A viewset without explicit `permission_classes` fails, naming the class | 1 | 03 | R7.2 |

**Subtotal: 5 tasks, 11.0 points.**

### 33.4.5 `CHS-AUD` — audit

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-CHS-AUD-01 | Create `platform_audit_log` | DB | `+@be/platform/migrations/0001_initial.py` | Both indexes of Part 21 §21.3.1 present; no update or delete path in application code | 1 | CHS-TEN-05 | 21.3.1 |
| TSK-CHS-AUD-02 | Implement `write_audit()` and `diff_fields()` | BE | `+@be/common/audit.py` | The model is fetched lazily via `apps.get_model` proving rule D1; `before`/`after` carry only changed fields for master data and the full row for ledger entries | 3 | 01 | 21.7, R4.6, D1 |
| TSK-CHS-AUD-03 | Define the `AuditAction` constant set | BE | `~@be/common/constants.py` | Every action string used anywhere in the product is a constant; a test forbids literals at call sites | 1 | 02 | 21.3.1, 21.7 |
| TSK-CHS-AUD-04 | Implement `Ctx` | BE | `+@be/common/context.py` | `Ctx.from_request` raises without a resolved tenant; `Ctx.system` builds from a tenant alone; the dataclass is frozen | 2 | CHS-TEN-07 | 20.3.2 |
| TSK-CHS-AUD-05 | Assert one audit row per logical event | Test | `+backend/tests/architecture/test_audit_coverage.py` | Every service function decorated `@writes_audit` produces exactly one row in a smoke run | 2 | 02 | R4.6, canon 0.11-4 |

**Subtotal: 5 tasks, 9.0 points.**

### 33.4.6 `CHS-IDEM` — idempotency

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-CHS-IDEM-01 | Create `platform_idempotency_key` | DB | `~@be/platform/migrations/0001_initial.py` | Unique on `(tenant, key)`; body hash stored; 24-hour expiry column | 1 | CHS-AUD-01 | 22.1 |
| TSK-CHS-IDEM-02 | Implement claim, replay and conflict | BE | `+@be/common/idempotency.py` | Same key + same body replays the stored response with `Idempotent-Replayed: true`; different body returns 409 `idempotency_conflict` | 3 | 01 | 20.6.5, 22.1 |
| TSK-CHS-IDEM-03 | Implement the `@idempotent(scope=…)` view decorator | BE | `~@be/common/idempotency.py` | A decorated POST without the header behaves normally; with it, replays | 2 | 02 | 22.1, R7.9 |
| TSK-CHS-IDEM-04 | Implement `useIdempotencyKey` | FE | `+@src/hooks/useIdempotencyKey.ts` | The key is stable across re-renders and rotates only on explicit reset; a retry reuses it | 1 | CHS-AUTH-04 | R-F-10, LED-01 FR-12 |
| TSK-CHS-IDEM-05 | Build the generated idempotency replay sweep | Test | `+backend/tests/matrix/test_idempotency.py` | Every POST that Part 22 marks idempotent is replayed and asserted to create one row | 2 | 03 | 28.2.6 |
| TSK-CHS-IDEM-06 | Schedule the expired-key purge | BE | `+@be/platform/tasks.py` | `platform.purge_idempotency_keys` removes rows older than 24 h; a double run is harmless | 1 | 02, CHS-JOB-03 | 22.1 |

**Subtotal: 6 tasks, 10.0 points.**

### 33.4.7 `CHS-JOB` — `platform_job` and the scheduler

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-CHS-JOB-01 | Create `platform_job` with all five indexes and both checks | DB | `~@be/platform/migrations/0001_initial.py` | `uq_job_idem`, `uq_job_scheduled`, `ix_job_claim`, `ix_job_stuck`, `ix_job_tenant_recent`, `ck_job_attempts`, `ck_job_payload_size` all present | 2 | CHS-AUD-01 | 20.8.2 |
| TSK-CHS-JOB-02 | Implement the `Job` model and `JobStatus` | BE | `+@be/platform/models/job.py` | Statuses match Part 20 §20.8.2 exactly; payload > 64 KB is rejected by the constraint | 1 | 01 | 20.8.2 |
| TSK-CHS-JOB-03 | Implement `enqueue()` and the handler registry | BE | `+@be/common/jobs.py` | An unregistered `job_type` dead-letters immediately; `idempotency_token` dedupes a live job | 3 | 02 | 20.8.3, 20.8.4 |
| TSK-CHS-JOB-04 | Implement the claim query with `skip_locked` | BE | `~@be/common/jobs.py` | Two runners started concurrently each claim disjoint rows; no job runs twice | 3 | 03 | 20.8.5, L6 |
| TSK-CHS-JOB-05 | Implement `run_scheduler` with the loop, visibility timeout, backoff and dead-letter | BE | `+@be/common/management/commands/run_scheduler.py` | A handler that raises is retried with exponential backoff and dead-letters at `max_attempts`; a stuck `running` row is reclaimed after the visibility timeout | 3 | 04 | 20.8.6, 20.8.8 |
| TSK-CHS-JOB-06 | Implement recurring jobs via `scheduled_key` | BE | `~@be/common/jobs.py` | Enqueuing `sales.refresh_overdue:2026-09-18` twice creates one row | 2 | 05 | 20.8.7, 20.8.9 |
| TSK-CHS-JOB-07 | Add the `scheduler` compose service and its healthcheck | Infra | `~docker-compose.yml` `+backend/docker/crontab` | `docker compose ps scheduler` healthy; killing it does not affect the web service | 1 | 05, CHS-CI-10 | 29.3 |
| TSK-CHS-JOB-08 | Implement the job purge and dead-letter retention | BE | `~@be/platform/tasks.py` | `succeeded` older than 14 days deleted; `dead_letter` kept 180 days | 1 | 06 | 20.8.2 |
| TSK-CHS-JOB-09 | Prove every scheduled job idempotent under a double run | Test | `+backend/tests/matrix/test_scheduled_jobs.py` | Running every registered recurring handler twice for the same period changes nothing the second time | 2 | 06 | 12.8, 20.8.9 |

**Subtotal: 9 tasks, 18.0 points.**

### 33.4.8 `CHS-SEED` — reference and demo data

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-CHS-SEED-01 | `seed_roles` — the four system roles with their codename sets | BE | `~@be/common/management/commands/seed_roles.py` | Idempotent; the codename sets equal `permissions_registry` | 1 | CHS-PERM-02 | 0.9, 29.4.1 |
| TSK-CHS-SEED-02 | `seed_plans` — `free` and `unlimited` | BE | `+@be/platform/management/commands/seed_plans.py` | Limits shape matches Part 21 §21.3.1 `platform_plan.limits` | 0.5 | 01 | 21.3.1 |
| TSK-CHS-SEED-03 | `seed_partners` — the `metis` default partner | BE | `+@be/platform/management/commands/seed_partners.py` | `allowed_modules` covers every MVP module; branding defaults present | 0.5 | 02 | 21.3.1, WLB-02 |
| TSK-CHS-SEED-04 | `seed_units` — GST UQC units | BE | `+@be/inventory/management/commands/seed_units.py` | `NOS`, `KGS`, `LTR`, `MTR`, `BOX`, `PCS` and the rest seeded with `tenant_id NULL` and `allow_decimal` set correctly | 1 | 01 | 21.3.6, INV-04 |
| TSK-CHS-SEED-05 | `seed_tax_rates` — GST slabs with effective dates | BE | `+@be/tax/management/commands/seed_tax_rates.py` | `GST12` carries `effective_to = 2025-09-21`; `GST40` exists; lookup by `(code, date)` returns the right row on both sides of the boundary | 2 | 01 | 21.3.5 |
| TSK-CHS-SEED-06 | `seed_expense_categories` | BE | `+@be/expenses/management/commands/seed_expense_categories.py` | The nine categories of Part 21 §21.3.10 seeded as `is_system` | 0.5 | 01 | 21.3.10, EXP-02 |
| TSK-CHS-SEED-07 | `seed_hsn` — the HSN/SAC master with trigram search | BE | `+@be/tax/management/commands/seed_hsn.py` `+@be/tax/fixtures/hsn.csv` | `GET /taxes/hsn?q=rice` returns ≤ 20 rows in < 100 ms | 2 | 05 | 21.3.5, 22.12 |
| TSK-CHS-SEED-08 | `seed_all` orchestrating the seven in dependency order | BE | `+@be/common/management/commands/seed_all.py` | Running twice changes no row count | 0.5 | 01–07 | 29.4.1 |
| TSK-CHS-SEED-09 | `create_superadmin` | BE | `+@be/platform/management/commands/create_superadmin.py` | Interactive mobile/name/password; sets `is_super_admin` | 0.5 | 08 | 29.4.1 |
| TSK-CHS-SEED-10 | `seed_demo` — one retail tenant with ~120 entries | BE | `+@be/common/management/commands/seed_demo.py` | Refuses under `DEBUG=0` without `--force`; produces one of every master and document kind | 2 | 08 | 29.4.1 |
| TSK-CHS-SEED-11 | `seed_e2e --reset` — the deterministic E2E fixture | BE | `+@be/common/management/commands/seed_e2e.py` | Identical ids and numbers on every run so Playwright can assert on them | 2 | 10 | 28.5.2 |
| TSK-CHS-SEED-12 | The 100,000-row performance fixture | Test | `+@be/common/management/commands/seed_perf.py` | 100k ledger entries, 2k parties, 5k invoices, with backdated, reversed, corrected and voided rows | 2 | 10 | 12.5, 28.9 |

**Subtotal: 12 tasks, 14.5 points.**

### 33.4.9 `CHS-DS` — the design system and token pipeline

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-CHS-DS-01 | Integrate `ml-uikit` and its stylesheet | DS | `~frontend/package.json` `~@app/globals.css` | One `ML*` primitive renders with `ml-uikit` styles; no MUI, no CSS-scoping script | 2 | CHS-CI-05 | ADR-002, 23.1 |
| TSK-CHS-DS-02 | Build the Koper token pipeline, re-hued | DS | `+@src/styles/tokens/{spacing,typography,elevation,motion,colour}.css` `~@app/globals.css` | Every token in Part 23 §23.2 exists as a custom property; no hex literal outside `tokens/` | 5 | 01 | 23.2 |
| TSK-CHS-DS-03 | Map tokens into Tailwind and add the `ds-*` typography plugin | DS | `+frontend/tailwind.config.js` `+frontend/postcss.config.js` | `text-ds-h3` and `ds-num` resolve; the Tailwind default palette is disabled | 2 | 02 | 23.2.5 |
| TSK-CHS-DS-04 | Write the contrast check script and wire it into CI | DS | `+frontend/scripts/check-contrast.mjs` `~.github/workflows/ci.yml` | Changing `--primary-500` to a failing value breaks CI naming the pair and the ratio | 1 | 02 | 23.6, WLB-01 |
| TSK-CHS-DS-05 | Build `ThemeProvider` and `useWhiteLabelTheme` | DS | `+@ds/theme/ThemeProvider.tsx` `+@ds/theme/useWhiteLabelTheme.ts` | The tenant primary ramp is applied by a blocking inline script; no flash of default theme | 3 | 03 | 19.8.3, WLB-01 |
| TSK-CHS-DS-06 | **Wave 0** — `UbPageShell`, `UbPageHeader`, `UbCard`, `UbSkeleton`, `UbEmptyState`, `UbSnackbar`, `UbStatusBanner`, `UbStatusBadge`, `UbAmount` | DS | `+@ds/Ub{PageShell,PageHeader,Card,Skeleton,EmptyState,Snackbar,StatusBanner,StatusBadge,Amount}/` `+@ds/index.ts` | Nine components in the gallery; each with a `*.test.tsx` covering render, every variant and a11y roles | 8 | 03 | 23.3, 23.4 |
| TSK-CHS-DS-07 | **Wave 1** — `UbField`, `UbForm`, `UbPhoneInput`, `UbMoneyInput`, `UbDateInput`, `UbDialog`, `UbConfirmDialog`, `UbDrawer`, `UbTabs` | DS | `+@ds/Ub{Field,Form,PhoneInput,MoneyInput,DateInput,Dialog,ConfirmDialog,Drawer,Tabs}/` `~@ds/index.ts` | `UbMoneyInput` shows Indian grouping on blur and keeps a string value; `UbDrawer` is a bottom sheet below `md` and a right drawer above | 8 | 06 | 23.3, 23.5 |
| TSK-CHS-DS-08 | **Wave 2** — `UbDataGrid` and its five sub-components | DS | `+@ds/UbDataGrid/{UbDataGrid,UbDataGridToolbar,UbDataGridPagination,UbDataGridEmptyState,UbDataGridMobileList,types}.tsx` | The same column factory renders a table above `md` and cards below; pagination, sorting and the three empty variants covered | 5 | 07 | 23.3, ADR-005 |
| TSK-CHS-DS-09 | **Wave 2** — `UbSearchInput`, `UbFilterTag`, `UbCombobox`, `UbAsyncCombobox`, `UbReasonDialog`, `UbFileUpload`, `UbHelpHint`, `UbQuantityInput`, `UbPercentInput` | DS | `+@ds/Ub{SearchInput,FilterTag,Combobox,AsyncCombobox,ReasonDialog,FileUpload,QuantityInput,PercentInput,HelpHint}/` | `UbAsyncCombobox` debounces at 300 ms, supports create-inline and accepts a pasted barcode; `UbReasonDialog` requires a non-empty reason | 8 | 08 | 23.3 |
| TSK-CHS-DS-10 | **Wave 3** — `UbPartyHeader`, `UbStatCard`, `UbTimeline`, `UbShareSheet`, `UbFab`, `UbBottomNav`, `UbSidebar`, `UbDateRangePicker` | DS | `+@ds/Ub{PartyHeader,StatCard,Timeline,ShareSheet,Fab,BottomNav,Sidebar,DateRangePicker}/` | `UbStatCard` renders label → metric → delta → baseline and is tappable; `UbSidebar` hides a module absent from `enabled_modules` | 8 | 09 | 23.3, 19.6.2 |
| TSK-CHS-DS-11 | **Wave 4** — `UbLineItemsEditor`, `UbTotalsPanel`, `UbQrCode` | DS | `+@ds/Ub{LineItemsEditor,TotalsPanel,QrCode}/` `+@ds/UbQrCode/qrEncoder.ts` | `UbLineItemsEditor` is keyboard-first with per-cell controllers and a mobile card form; `qrEncoder` generates a scannable UPI QR with no network call | 8 | 10 | 23.3, SAL-02 §7, PAY-03 |
| TSK-CHS-DS-12 | Build the internal gallery route | DS | `+@app/(internal)/design-system/page.tsx` | Every `Ub*` renders in every documented state on one page | 2 | 06 | 23.4 |
| TSK-CHS-DS-13 | Implement `useExclusiveModal` and the single-open policy | DS | `+@src/hooks/useExclusiveModal.ts` | Opening a second dialog closes the first; a test asserts only one is in the DOM | 1 | 07 | 23.3 |
| TSK-CHS-DS-14 | Build the layout shell | FE | `+@src/components/layout/{UbAppShell,AppHeader,SnackbarHost}.tsx` `+@src/components/layout/sidebarConfig.ts` | The shell renders sidebar + header + bottom nav; the config is entitlement-driven | 5 | 10 | 19.6.1, 19.6.2, 19.6.3 |
| TSK-CHS-DS-15 | Assert the design-system component template mechanically | Test | `+frontend/src/tests/designSystemTemplate.test.ts` | A `Ub*` without `memo`, `displayName`, an `index.ts` or a barrel line fails | 2 | 06 | R-C-2, 23.4 |

**Subtotal: 15 tasks, 68.0 points.** This is the largest chassis area and it is spread across Sprints 0–3 as four waves, per Part 32 §32.2.1.

### 33.4.10 `CHS-I18N` — the internationalisation pipeline

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-CHS-I18N-01 | Configure `react-intl` and the locale provider | FE | `+@src/hooks/useTranslation.ts` `~@app/layout.tsx` `+@src/redux/slice/localeSlice.ts` | Switching locale re-renders without a reload; `Accept-Language` follows | 3 | CHS-DS-03 | 19.11.1, ADR-006 |
| TSK-CHS-I18N-02 | Seed `en.json` and `hi.json` with the shell and common keys | FE | `+frontend/locales/en.json` `+frontend/locales/hi.json` | Navigation, actions, statuses, validation and empty-state keys present in both | 2 | 01 | 19.11.3 |
| TSK-CHS-I18N-03 | Write `npm run i18n:check` | Infra | `+frontend/scripts/check-i18n.mjs` `~.github/workflows/ci.yml` | A key present in one locale only fails CI naming the key; an unused key warns | 2 | 02 | 19.11.7, canon 0.11-6 |
| TSK-CHS-I18N-04 | Implement the central validation-schema hook | FE | `+@src/hooks/useValidationSchemas.ts` | `mobileValidation`, `gstinValidation` (mod-36 checksum), `panValidation`, `pincodeValidation`, `amountValidation`, `quantityValidation`, `dateNotFutureValidation`, `requiredString` — each with `t()` messages, table-tested | 5 | 02 | 19.5.2, ADR-003, R-F-2 |
| TSK-CHS-I18N-05 | Implement the number, money and date formatters | FE | `+@src/utils/money.ts` `+@src/utils/quantity.ts` `+@src/utils/dates.ts` | `formatInr("123456.5")` → `₹1,23,456.50`; `todayInTenantTz()` uses the tenant timezone, never the device | 3 | 01 | 19.11.5, canon 0.10 |
| TSK-CHS-I18N-06 | Self-host the three fonts with Devanagari fallback | FE | `+frontend/public/fonts/*` `~@src/styles/tokens/typography.css` | Matras are not clipped at line-height 1.5; `font-display: swap` | 2 | CHS-DS-02 | 19.11.6, 23.6 |
| TSK-CHS-I18N-07 | Configure Django `gettext` for server-side messages | BE | `+backend/locale/{en,hi}/LC_MESSAGES/django.po` `~config/settings/base.py` | `Accept-Language: hi` returns Hindi validation messages from the API | 2 | CHS-TEN-09 | 22.1, R6.8 |
| TSK-CHS-I18N-08 | Forbid hard-coded user-facing strings by lint | Infra | `~frontend/eslint.config.mjs` | A JSX text literal or a string `aria-label` outside an allow-list fails | 2 | 03 | 25.19, canon 0.11-6 |

**Subtotal: 8 tasks, 21.0 points.**

### 33.4.11 `CHS-PRINT` — the print and PDF components

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-CHS-PRINT-01 | Build the print layout and `@media print` rules | FE | `+@app/(app)/sales/invoices/[id]/print/page.tsx` `+@src/styles/print.css` | The print route renders with no shell, no nav and no shadows; page breaks fall between line groups | 2 | CHS-DS-06 | 19.2.2, ADR-014 |
| TSK-CHS-PRINT-02 | Build the shared branded document header | FE | `+@fe/sales/components/print/InvoicePrintHeader.tsx` | Logo, legal name, GSTIN, address and signature resolve from `whiteLabelSlice`; missing logo degrades to the app name | 2 | 01 | WLB-01, PLT-07 |
| TSK-CHS-PRINT-03 | Implement `useDocumentPrint` with `window.print()` | FE | `+@src/hooks/useDocumentPrint.ts` | `?auto=1` prints on mount; the print count is recorded in `meta` | 1 | 01 | ADR-014, SAL-03 |
| TSK-CHS-PRINT-04 | Build the A4 document template | FE | `+@fe/sales/components/print/InvoicePrintA4.tsx` | Rule 46's nine mandatory blocks present; tax breakup by slab; UPI QR; verified on a physical laser printer | 3 | 02, CHS-DS-11 | SAL-03, 12.8 |
| TSK-CHS-PRINT-05 | Build the 80 mm thermal template | FE | `+@fe/sales/components/print/InvoicePrintThermal80.tsx` | Fits 80 mm at 203 dpi; verified on a physical thermal printer | 3 | 04 | SAL-03 |
| TSK-CHS-PRINT-06 | Build the statement print template | FE | `+@fe/ledger/components/print/StatementPrintA4.tsx` | Running balance column; corrections toggle respected; opening and closing rows | 2 | 02 | LED-04 |
| TSK-CHS-PRINT-07 | Build the receipt print template | FE | `+@fe/payments/components/print/ReceiptPrint.tsx` | Mode breakup listed; allocation list; branded | 2 | 02 | PAY-04 |
| TSK-CHS-PRINT-08 | Build the public share-link page | FE | `+@app/(public)/d/[token]/page.tsx` `+@app/(public)/d/[token]/print/page.tsx` | Server component; `noindex`; no referrer; expired or revoked token renders a neutral page, never a 500 | 3 | 04 | 22.12, SAL-03, LED-04 |
| TSK-CHS-PRINT-09 | Implement share-link issuance and revocation | BE | `+@be/common/share_links.py` | Token stored hashed; expiry enforced; revocation immediate; a guessed token returns 404 | 2 | CHS-TEN-20 | 12.8, 22.4 |

**Subtotal: 9 tasks, 20.0 points.**

### 33.4.12 `CHS-IMPORT` — the CSV import engine

The engine is cross-cutting because three features (PTY-10, INV-09 and, in Phase 2, opening stock) are mappers over one machine. Building it per feature would produce three engines.

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-CHS-IMPORT-01 | Create `imports_job` | DB | `+@be/imports/migrations/0001_initial.py` | Columns and index per Part 21 §21.3.11; `errors jsonb` capped at 500 rows | 1 | CHS-TEN-05 | 21.3.11 |
| TSK-CHS-IMPORT-02 | Implement the `ImportMapper` protocol | BE | `+@be/imports/mappers/base.py` | A mapper declares its columns, its row validator and its commit callable; a second mapper needs no engine change | 2 | 01 | IMP-01 |
| TSK-CHS-IMPORT-03 | Implement streaming parse and per-row validation | BE | `+@be/imports/services/validate.py` | A 5,000-row file validates in ≤ 30 s at < 200 MB RSS; every failing row carries its 1-based line number and field | 5 | 02 | IMP-01 FR |
| TSK-CHS-IMPORT-04 | Implement `POST /imports` multipart upload | BE | `+@be/imports/views/job.py` `+@be/imports/urls.py` | 201 with `status='validating'`; the file is stored through `files` with magic-byte validation | 2 | 03, CHS-TEN-20 | 22.12 |
| TSK-CHS-IMPORT-05 | Implement `GET /imports/{id}` with errors and preview | BE | `~@be/imports/views/job.py` `+@be/imports/selectors/job.py` | Returns status, counts, the first 500 errors and 20 preview rows | 2 | 04 | 22.12 |
| TSK-CHS-IMPORT-06 | Implement commit as a job | BE | `+@be/imports/services/commit.py` `+@be/imports/tasks.py` | `imports.commit` runs through the target app's **service**, never a bulk insert; committing twice creates no duplicates | 5 | 05, CHS-JOB-03 | IMP-01 BR, canon 0.11-1 |
| TSK-CHS-IMPORT-07 | Implement cancel and partial-failure semantics | BE | `~@be/imports/services/commit.py` | A cancelled import leaves no partial data; a mid-commit failure rolls the whole batch back and reports the row | 3 | 06 | IMP-01 EC |
| TSK-CHS-IMPORT-08 | Serve the CSV templates | BE | `+@be/imports/views/template.py` `+@be/imports/templates_csv/*.csv` | `GET /imports/templates/parties.csv` returns a UTF-8 BOM file that opens correctly in Excel with Hindi headers available | 1 | 04 | 22.12, IMP-01 |
| TSK-CHS-IMPORT-09 | Build the import wizard shell | FE | `+@fe/imports/components/ImportWizard.tsx` `+@fe/imports/redux/importSlice.ts` `+@fe/imports/redux/importThunk.ts` `+@fe/imports/api/importService.ts` | Four steps — upload, validating, review errors, commit — with polling and a progress bar | 5 | 05 | IMP-01 §7 |
| TSK-CHS-IMPORT-10 | Build the error table with a downloadable error CSV | FE | `+@fe/imports/components/ImportErrorTable.tsx` | Row number, column, value and message per error; "Download errors" produces a fixable file | 2 | 09 | IMP-01 §9 |
| TSK-CHS-IMPORT-11 | Build the generic export path | BE | `+@be/reports/services/export.py` `+@be/reports/models.py` | `?format=csv` on any list honours the current filters; > 5,000 rows returns 202 with an `export_id` | 3 | CHS-JOB-03 | IMP-02, 22.11 |

**Subtotal: 11 tasks, 31.0 points.**

### 33.4.13 `CHS-OBS` — observability and health

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-CHS-OBS-01 | Implement `GET /system/health` and `/system/version` | BE | `+@be/common/views/system.py` `~config/urls.py` | Health is unauthenticated and shallow; version returns the commit SHA baked at build time | 1 | CHS-TEN-10 | 22.12, 29.9.2 |
| TSK-CHS-OBS-02 | Implement the frontend analytics emitter | FE | `+@src/utils/analytics.ts` | Events carry `tenant_id`, `user_id`, `role`, `platform`; a test asserts no mobile, name, note or amount is ever in a payload | 2 | CHS-AUTH-08 | 31.1, 12.8 |
| TSK-CHS-OBS-03 | Implement the error boundaries | FE | `~@app/error.tsx` `~@app/(app)/error.tsx` `+@src/components/layout/FeatureErrorBoundary.tsx` | A thrown render error shows the request id and a retry, and is logged once | 2 | CHS-DS-06 | 19.12.1 |
| TSK-CHS-OBS-04 | Assert the no-PII rule across logs and events | Test | `+backend/tests/architecture/test_no_pii.py` `+frontend/src/tests/noPii.test.ts` | A deliberate mobile number in a log call or an event payload fails the test | 2 | 02, CHS-TEN-16 | 12.8, 30.3 |

**Subtotal: 4 tasks, 7.0 points.**

### 33.4.14 Chassis epic totals

| Area | Tasks | Points |
|---|---|---|
| `CHS-CI` | 18 | 25.0 |
| `CHS-TEN` | 21 | 45.0 |
| `CHS-AUTH` | 10 | 27.0 |
| `CHS-PERM` | 5 | 11.0 |
| `CHS-AUD` | 5 | 9.0 |
| `CHS-IDEM` | 6 | 10.0 |
| `CHS-JOB` | 9 | 18.0 |
| `CHS-SEED` | 12 | 14.5 |
| `CHS-DS` | 15 | 68.0 |
| `CHS-I18N` | 8 | 21.0 |
| `CHS-PRINT` | 9 | 20.0 |
| `CHS-IMPORT` | 11 | 31.0 |
| `CHS-OBS` | 4 | 7.0 |
| **Total** | **133** | **306.5** |

Of these, 52 points land in Sprint 0; the design-system waves 1–4 (34 points) land in Sprints 1–3 inside those sprints' budgets; the print components (20) land in Sprints 4 and 7; the import engine (31) lands in Sprint 10; the rest is distributed with its first consumer. §33.8.3 reconciles this against Part 32's per-sprint numbers.

---

## 33.5 Phase 1 — feature task breakdown by module

### 33.5.1 `EPIC-IDENTITY` — platform identity, tenancy and onboarding (Sprint 1)

**Claim.** A new merchant signs up with a mobile number and an OTP, completes a four-question wizard, and is inside their own tenant with a role, a settings preset and a document-sequence set — and a second merchant proves isolation.

#### PLT-01 — Mobile OTP sign-up & login

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PLT-01-01 | Create `platform_otp_challenge` | DB | `~@be/platform/migrations/0001_initial.py` | Columns per Part 21 §21.3.1; `IX(mobile, created_at)`; no plaintext code column | 1 | CHS-AUD-01 | 21.3.1 |
| TSK-PLT-01-02 | Implement the `OtpChallenge` model and `OtpPurpose` | BE | `+@be/platform/models/otp.py` `~@be/platform/constants.py` | `purpose ∈ {login, signup, verify, reset}`; `code_hash` is SHA-256 of code + server salt | 1 | 01 | FR-2 |
| TSK-PLT-01-03 | Implement `request_otp()` | BE | `+@be/platform/services/otp.py` | Creates a challenge with 300 s expiry, dispatches through the SMS adapter, and never reveals whether the mobile exists | 3 | 02, NTF-02-03 | FR-2, FR-3 |
| TSK-PLT-01-04 | Implement `verify_otp()` | BE | `~@be/platform/services/otp.py` | Validates against the newest unverified unexpired challenge; 5 wrong attempts invalidates it with `attempts_left=0` | 3 | 03 | FR-4, FR-6 |
| TSK-PLT-01-05 | Implement the get-or-create user path | BE | `~@be/platform/services/otp.py` `+@be/platform/services/user.py` | A new mobile creates a user with `full_name=''`, `password_hash=NULL` and the picked locale, and returns `is_new=true` | 2 | 04 | FR-4, FR-5 |
| TSK-PLT-01-06 | Implement the OTP throttles | BE | `+@be/platform/throttles.py` | 5/mobile/10 min and 20/IP/hour each return 429 `otp_throttled` with `Retry-After` | 2 | 03 | FR-7, 22.1 |
| TSK-PLT-01-07 | Implement `POST /auth/otp/request` and `/verify` | BE | `+@be/platform/views/auth.py` `+@be/platform/urls.py` `+@be/platform/serializers/auth.py` | Response shapes equal Part 22 §22.2 exactly, including `tenants[]`, `active_tenant_id` and `permissions[]` | 3 | 05, 06, CHS-AUTH-03 | FR-5, 22.2 |
| TSK-PLT-01-08 | Schedule `purge_otp_challenges` | BE | `~@be/platform/tasks.py` | Challenges older than 24 h are removed; a double run is harmless | 1 | 07, CHS-JOB-06 | FR-10 |
| TSK-PLT-01-09 | Write `authService.ts` | FE | `+@fe/auth/api/authService.ts` `+@fe/auth/types/auth.types.ts` | One function per endpoint with wire→domain mapping; no React, no Redux | 2 | CHS-AUTH-06 | 22.2 |
| TSK-PLT-01-10 | Write `authThunk.ts` and extend `sessionSlice` | FE | `+@fe/auth/redux/authThunk.ts` `~@src/redux/slice/sessionSlice.ts` | `otpRequest`, `otpVerify` and `passwordLogin` each handle pending/fulfilled/rejected with `rejectWithValue(toApiError(...))` | 2 | 09 | R-RX-5, R-RX-6 |
| TSK-PLT-01-11 | Write `authSchemas.ts` | FE | `+@fe/auth/validation/authSchemas.ts` | Composed from `useValidationSchemas()`; mobile validated as `^\+91[6-9]\d{9}$` after normalisation | 1 | CHS-I18N-04 | §10 |
| TSK-PLT-01-12 | Build the language picker and the mobile-entry screen | FE | `+@fe/auth/components/LanguagePicker.tsx` `+@fe/auth/components/MobileEntryForm.tsx` `+@app/(auth)/login/page.tsx` | Language is the first control; the choice persists to `localStorage.ub_locale` and to the user on verify | 3 | 10, 11 | FR-1, FR-8 |
| TSK-PLT-01-13 | Build the six-box OTP screen | FE | `+@fe/auth/components/OtpForm.tsx` `+@app/(auth)/otp/page.tsx` | `inputmode="numeric"`, `autocomplete="one-time-code"`, 300 s countdown, resend after 30 s, `aria-live` errors | 3 | 12 | FR-6, FR-7, §5 |
| TSK-PLT-01-14 | Implement the post-login routing rules | FE | `+@fe/auth/hooks/usePostLoginRoute.ts` | One tenant → dashboard; several without a default → switcher; invited only → invitation screen; new user → onboarding | 2 | 13 | FR-9 |
| TSK-PLT-01-15 | Build the throttled and invalid-code states | FE | `~@fe/auth/components/OtpForm.tsx` `+@fe/auth/components/AuthThrottleBanner.tsx` | 429 shows a countdown and disables both tabs for that mobile; five failures offer "Request a new code" | 2 | 13 | §9, Alt C, Alt D |
| TSK-PLT-01-16 | E2E: OTP sign-up to onboarding | Test | `+e2e/tests/auth-otp.spec.ts` | `[T-PLT-01-*]` sign up with a new mobile, read the code from the API test hook, land on the wizard, at 360 px and 1280 px | 2 | 14 | AC-1 … AC-4 |

**16 tasks, 33.0 points.**

#### PLT-02 — Password login & set/reset

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PLT-02-01 | Implement `set_password()` and the strength policy | BE | `+@be/platform/services/password.py` | Minimum length and common-password rejection; hashing via Django's default hasher; an audit row on change | 2 | PLT-01-05 | FR |
| TSK-PLT-02-02 | Implement `POST /auth/login` | BE | `~@be/platform/views/auth.py` | Same response shape as OTP verify; failures return a generic `invalid_credentials`; throttled | 2 | 01 | 22.2 |
| TSK-PLT-02-03 | Implement password reset request and confirm | BE | `~@be/platform/services/password.py` `~@be/platform/views/auth.py` | Reset is gated on an OTP challenge with `purpose='reset'`; all sessions are revoked on success | 3 | 02 | FR |
| TSK-PLT-02-04 | Implement `POST /auth/password/set` via invitation | BE | `~@be/platform/views/auth.py` | An invitation token permits setting a password once; the token is then consumed | 2 | 03, PLT-05-04 | FR |
| TSK-PLT-02-05 | Build the password tab on the login screen | FE | `~@fe/auth/components/MobileEntryForm.tsx` `+@fe/auth/components/PasswordLoginForm.tsx` | Password is the default tab; OTP is the fallback; a user with no password is told so without revealing existence | 2 | PLT-01-12 | FR-1 |
| TSK-PLT-02-06 | Build the set-password and forgot-password screens | FE | `+@app/(auth)/set-password/page.tsx` `+@app/(auth)/forgot-password/page.tsx` `+@fe/auth/components/SetPasswordForm.tsx` | Strength meter; confirm field; skip allowed on first sign-up | 3 | 05 | FR, §6 |
| TSK-PLT-02-07 | E2E: password login and reset round trip | Test | `+e2e/tests/auth-password.spec.ts` | `[T-PLT-02-*]` set, log out, log in, forget, reset via OTP, log in with the new password | 2 | 06 | AC |

**7 tasks, 16.0 points.**

#### PLT-03 — Business onboarding wizard

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PLT-03-01 | Create `platform_tenant`, `platform_membership`, `platform_role`, `platform_tenant_setting`, `platform_document_sequence` | DB | `~@be/platform/migrations/0001_initial.py` | Every column, constraint and index of Part 21 §21.3.1; `U(partner_id, gstin)` partial | 3 | CHS-AUD-01 | 21.3.1 |
| TSK-PLT-03-02 | Implement the `Tenant`, `Membership`, `Role`, `TenantSetting`, `DocumentSequence` models | BE | `+@be/platform/models/{tenant,membership,role,setting,sequence}.py` | `BusinessType` and `GstType` are `TextChoices` matching canon exactly | 3 | 01 | 21.3.1, 0.7 |
| TSK-PLT-03-03 | Define the business-type presets | BE | `+@be/platform/constants.py` `+@be/platform/presets.py` | Nine business types each map to a settings dict; a test asserts a preset only writes settings, never behaviour flags in code | 2 | 02 | FR, canon 0.2 |
| TSK-PLT-03-04 | Implement `create_tenant()` | BE | `+@be/platform/services/tenant.py` | One transaction creating tenant, owner membership, `MAIN` location, twelve FY document sequences, the settings preset and empty branding; one audit row | 5 | 03 | FR, 29.4.2 |
| TSK-PLT-03-05 | Implement GSTIN validation with the mod-36 checksum | BE | `+@be/platform/validators.py` | The published checksum table passes; a state-code mismatch produces a `warnings[]` entry, not an error | 2 | 02 | FR, 17.1 conventions |
| TSK-PLT-03-06 | Implement `POST /tenants` and `GET/PATCH /tenants/current` | BE | `+@be/platform/views/tenant.py` `+@be/platform/serializers/tenant.py` `~@be/platform/urls.py` | Shapes match Part 22 §22.3; `onboarding_step` supports resume | 3 | 04, 05 | 22.3 |
| TSK-PLT-03-07 | Implement `allocate_number()` over the sequence table | BE | `+@be/platform/services/sequence.py` | `SELECT … FOR UPDATE` inside the caller's transaction; FY reset; ≤ 16 characters; a concurrency test proves no gaps and no duplicates | 3 | 04 | 21.3.1, SAL-02 BR |
| TSK-PLT-03-08 | Write `tenantService.ts` and the onboarding types | FE | `+@fe/onboarding/api/tenantService.ts` `+@fe/onboarding/types/onboarding.types.ts` | One function per endpoint; wire snake_case typed separately from the domain shape | 1 | CHS-AUTH-06 | 22.3 |
| TSK-PLT-03-09 | Write `onboardingSlice.ts` and `onboardingThunk.ts` | FE | `+@fe/onboarding/redux/onboardingSlice.ts` `+@fe/onboarding/redux/onboardingThunk.ts` | Step state is a discriminated union; resume hydrates from `onboarding_step` | 2 | 08 | R-TS-4 |
| TSK-PLT-03-10 | Write `onboardingSchemas.ts` | FE | `+@fe/onboarding/validation/onboardingSchemas.ts` | GSTIN required only when `gst_type ∈ {regular, composition}`; state required always | 1 | CHS-I18N-04 | §10 |
| TSK-PLT-03-11 | Build the four wizard steps | FE | `+@fe/onboarding/components/{BusinessNameStep,BusinessTypeStep,GstStep,StateStep}.tsx` `+@fe/onboarding/components/OnboardingWizard.tsx` `+@app/(auth)/onboarding/page.tsx` | Four questions and no more; business types rendered as tappable cards with icons; under 90 s to complete | 5 | 09, 10 | FR, §7 |
| TSK-PLT-03-12 | Build the dashboard skeleton landing | FE | `+@fe/reports/components/DashboardPageContent.tsx` `+@app/(app)/dashboard/page.tsx` | Seven `UbStatCard` tiles wired to a zeroed selector, plus a first-use empty state and a single obvious next action | 2 | 11, CHS-DS-10 | RPT-01 (skeleton) |
| TSK-PLT-03-13 | E2E: onboarding to dashboard | Test | `+e2e/tests/onboarding.spec.ts` | `[T-PLT-03-*]` complete the wizard in Hindi and assert the tenant's sequences, settings and `MAIN` location exist | 2 | 12 | AC |

**13 tasks, 34.0 points.**

#### PLT-04 — Multiple businesses & switch

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PLT-04-01 | Implement `POST /auth/switch-tenant` | BE | `~@be/platform/views/auth.py` `~@be/platform/services/session.py` | Issues new tokens with the new `tid`; 403 when not a member; the old session family is kept | 2 | PLT-03-06 | 22.2 |
| TSK-PLT-04-02 | Return memberships on `/auth/me` | BE | `~@be/platform/views/auth.py` `~@be/platform/serializers/auth.py` | Each membership carries `{id, name, role, is_default, status}` | 1 | 01 | 22.2 |
| TSK-PLT-04-03 | Implement `is_default` management | BE | `~@be/platform/services/membership.py` | Exactly one default per user, enforced in the service and asserted by test | 1 | 02 | FR |
| TSK-PLT-04-04 | Build the tenant switcher in the header | FE | `+@src/components/layout/TenantSwitcher.tsx` `~@src/components/layout/AppHeader.tsx` | Lists memberships with roles; a switch dispatches `resetAllFeatureState` before refetching | 3 | 02, CHS-AUTH-08 | FR, 19.6.5 |
| TSK-PLT-04-05 | Build the standalone switcher screen | FE | `+@app/(auth)/select-business/page.tsx` | Reached when a user has several tenants and no default | 1 | 04 | FR-9 |
| TSK-PLT-04-06 | E2E: two tenants, switch, isolation | Test | `+e2e/tests/tenant-switch.spec.ts` | `[T-PLT-04-*]` create data in A, switch to B, assert none of A's data is visible and the store was reset | 2 | 05 | AC |

**6 tasks, 10.0 points.**

#### PLT-15 — Plan entitlements

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PLT-15-01 | Create `platform_plan` and the tenant FK | DB | `~@be/platform/migrations/0001_initial.py` | `limits jsonb` with `max_users`, `max_parties`, `max_invoices_per_month`, `storage_mb` | 1 | PLT-03-01 | 21.3.1 |
| TSK-PLT-15-02 | Implement the `Plan` model and the limit resolver | BE | `+@be/platform/models/plan.py` `+@be/platform/services/entitlement.py` | Resolves plan ∩ partner `allowed_modules` ∩ tenant `enabled_modules` | 2 | 01 | FR |
| TSK-PLT-15-03 | Implement usage counters | BE | `+@be/platform/selectors/usage.py` | Users, parties and invoices-this-month counted in SQL, not in Python | 2 | 02 | FR |
| TSK-PLT-15-04 | Enforce limits through the `PlanLimit` permission | BE | `~@be/common/permissions.py` `~@be/platform/services/entitlement.py` | Creating the (max+1)th party returns 403 `plan_limit_reached` with the limit and the current count in `details` | 2 | 03, CHS-PERM-03 | FR, 22.1 |
| TSK-PLT-15-05 | Expose `plan_limits` and `feature_flags` on `/auth/me` | BE | `~@be/platform/serializers/auth.py` | The client can render a usage bar without a second request | 1 | 04 | 22.2 |
| TSK-PLT-15-06 | Build the usage display in settings | FE | `+@fe/settings/components/PlanUsageCard.tsx` | Three `UbProgress` bars with pace markers; the blocked state explains what to do | 2 | 05 | §7, §9 |
| TSK-PLT-15-07 | Handle `plan_limit_reached` globally | FE | `~@src/utils/apiError.ts` `+@src/components/layout/PlanLimitDialog.tsx` | Any 403 with this code opens one explanatory dialog rather than a raw snackbar | 1 | 06 | §9 |

**7 tasks, 11.0 points.**

**`EPIC-IDENTITY` totals: 49 tasks, 104.0 points.** The epic exceeds Sprint 1's 50-point budget because 54 of its points are the design-system wave 1 and the chassis auth work already counted in `EPIC-CHASSIS`; the feature-specific remainder is 50. §33.8.3 reconciles.

---

### 33.5.2 `EPIC-GOVERNANCE` — team, settings, profile, audit, sessions and white-label (Sprint 2)

**Claim.** An owner invites a staff member who joins with a reduced navigation and is refused an owner-only endpoint; the owner sets the profile, the numbering, the branding and the module toggles; every action is in the audit log with a before/after; devices can be revoked.

#### PLT-05 — Team & roles

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PLT-05-01 | Create `platform_invitation` | DB | `+@be/platform/migrations/0002_invitation.py` | `token_hash U`, `expires_at`, `status`, `IX(tenant_id, status)` | 1 | PLT-03-01 | 21.3.1 |
| TSK-PLT-05-02 | Implement the `Invitation` model and statuses | BE | `+@be/platform/models/invitation.py` | `pending`, `accepted`, `expired`, `revoked` exactly per canon §0.7 | 1 | 01 | 0.7 |
| TSK-PLT-05-03 | Implement `invite_member()` | BE | `+@be/platform/services/membership.py` | Creates an invitation, an `invited` membership and a share text; dispatches through the SMS adapter; one audit row | 3 | 02, NTF-02-03 | FR |
| TSK-PLT-05-04 | Implement `accept_invitation()` | BE | `~@be/platform/services/membership.py` | Consumes the token once; activates the membership; an expired or revoked token returns 410 with a re-invite prompt | 2 | 03 | FR |
| TSK-PLT-05-05 | Implement `change_role()`, `suspend_member()`, `remove_member()` | BE | `~@be/platform/services/membership.py` | The last owner cannot be removed or demoted (409); each writes a before/after audit row | 3 | 04 | FR, 22.3 |
| TSK-PLT-05-06 | Implement the permissions-version bump forcing re-auth | BE | `~@be/platform/services/membership.py` `~@be/common/authentication.py` | A role change increments the user's `ver`; the next request with the old token returns 401 and the client re-authenticates silently | 3 | 05 | FR, 22.2, 12.7 |
| TSK-PLT-05-07 | Implement `permissions_override` per member | BE | `~@be/platform/services/membership.py` `~@be/common/permissions.py` | An allow/deny override (for example staff may adjust stock) resolves after the role and is audited | 2 | 06 | 21.3.1 |
| TSK-PLT-05-08 | Implement the membership endpoints | BE | `+@be/platform/views/membership.py` `+@be/platform/serializers/membership.py` `~@be/platform/urls.py` | `GET /memberships`, `POST /memberships/invite`, `PATCH`/`DELETE /memberships/{id}`, `GET /roles`, `GET /permissions/me` per §22.3 | 3 | 07 | 22.3 |
| TSK-PLT-05-09 | Write `teamService.ts`, types, slice and thunk | FE | `+@fe/team/api/teamService.ts` `+@fe/team/types/team.types.ts` `+@fe/team/redux/teamSlice.ts` `+@fe/team/redux/teamThunk.ts` | Full lifecycle handled with `ApiErrorShape`; the invalidation map updated for every mutation | 3 | 08 | 19.3.6 |
| TSK-PLT-05-10 | Write `teamSchemas.ts` | FE | `+@fe/team/validation/teamSchemas.ts` | Mobile and role validated; a duplicate mobile maps to `details.mobile` | 1 | CHS-I18N-04 | §10 |
| TSK-PLT-05-11 | Build the team list screen | FE | `+@fe/team/components/TeamPageContent.tsx` `+@fe/team/components/MemberRow.tsx` `+@app/(app)/settings/team/page.tsx` | `UbDataGrid` with role badges, status tones and a row menu filtered by permissions | 3 | 09, CHS-DS-08 | §7 |
| TSK-PLT-05-12 | Build the invite drawer | FE | `+@fe/team/components/InviteMemberDrawer.tsx` | Mobile, name, role; on success shows the share text with a WhatsApp action | 2 | 10, 11 | §6 |
| TSK-PLT-05-13 | Build the role-change and removal dialogs | FE | `+@fe/team/components/{RoleChangeDialog,RemoveMemberDialog}.tsx` | Role change explains the consequence; removal uses `UbConfirmDialog` and surfaces the last-owner 409 in place | 2 | 11 | §9 |
| TSK-PLT-05-14 | Build the invitation-acceptance screen | FE | `+@app/(auth)/accept-invite/[token]/page.tsx` `+@fe/team/components/AcceptInviteForm.tsx` | Shows the business name and role before acceptance; an expired token renders a neutral explanation | 2 | 12 | FR |
| TSK-PLT-05-15 | E2E: invite, accept, restrict, revoke | Test | `+e2e/tests/team.spec.ts` | `[T-PLT-05-*]` staff joins, is refused `POST /memberships/invite`, is promoted, and is forced to re-authenticate within one request | 3 | 14 | AC |

**15 tasks, 34.0 points.**

#### PLT-06 — Tenant settings

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PLT-06-01 | Define the settings key catalogue with JSON schemas | BE | `+@be/platform/settings_schema.py` | Every well-known key of Part 21 §21.3.1 has a schema, a default and a version; an unknown key is rejected | 3 | PLT-03-02 | 21.3.1 |
| TSK-PLT-06-02 | Implement `get_setting()` and `set_settings()` | BE | `+@be/platform/services/setting.py` | Reads fall back to the preset then the product default; writes validate against the schema and audit the diff | 3 | 01 | FR |
| TSK-PLT-06-03 | Implement the numbering-series editor rules | BE | `~@be/platform/services/sequence.py` | `next_number` may be raised, never lowered (409); prefix ≤ 12 chars; changing the prefix does not renumber issued documents | 2 | 02, PLT-03-07 | FR |
| TSK-PLT-06-04 | Implement `GET/PUT /tenants/current/settings` | BE | `~@be/platform/views/tenant.py` `+@be/platform/serializers/setting.py` | Full-object PUT validated per key; partial writes rejected with a clear message | 2 | 03 | 22.3 |
| TSK-PLT-06-05 | Implement module toggles | BE | `~@be/platform/services/tenant.py` `~@be/common/permissions.py` | `enabled_modules` must be a subset of plan ∩ partner; disabling a module makes its endpoints return 403 `module_disabled` | 2 | 04, PLT-15-02 | FR, 22.1 |
| TSK-PLT-06-06 | Write the settings service, types, slice and thunk | FE | `+@fe/settings/api/settingsService.ts` `+@fe/settings/types/settings.types.ts` `+@fe/settings/redux/settingsSlice.ts` `+@fe/settings/redux/settingsThunk.ts` | The whole settings object is one slice; a save is optimistic with rollback on failure | 3 | 04 | 19.3.7 |
| TSK-PLT-06-07 | Write `settingsSchemas.ts` | FE | `+@fe/settings/validation/settingsSchemas.ts` | Mirrors the server schemas; a divergence is caught by a shared fixture test | 2 | 06 | §10 |
| TSK-PLT-06-08 | Build the settings index and section shell | FE | `+@fe/settings/components/SettingsPageContent.tsx` `+@app/(app)/settings/page.tsx` | Sections listed with descriptions; each links to its own route | 2 | 06 | §7 |
| TSK-PLT-06-09 | Build the numbering screen | FE | `+@fe/settings/components/NumberingSettings.tsx` `+@app/(app)/settings/numbering/page.tsx` | Per-kind prefix, next number, padding and FY reset with a live preview of the next number | 3 | 08 | §7 |
| TSK-PLT-06-10 | Build the defaults screen | FE | `+@fe/settings/components/DefaultsSettings.tsx` | Due days, default document kind, negative stock, credit-limit mode, reminder templates, locale | 3 | 08 | FR |
| TSK-PLT-06-11 | Build the modules screen | FE | `+@fe/settings/components/ModuleToggles.tsx` `+@app/(app)/settings/modules/page.tsx` | Toggling a module updates the sidebar in the same render; a plan-excluded module is shown disabled with the reason | 2 | 08 | FR |
| TSK-PLT-06-12 | E2E: change a setting and observe the behaviour change | Test | `+e2e/tests/settings.spec.ts` | `[T-PLT-06-*]` set `credit_limit_mode=block` and assert a later ledger post is refused | 2 | 11 | AC |

**12 tasks, 29.0 points.**

#### PLT-07 — Business profile & documents header

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PLT-07-01 | Extend `PATCH /tenants/current` to the full profile | BE | `~@be/platform/serializers/tenant.py` `~@be/platform/services/tenant.py` | Legal name, trade name, GSTIN, PAN, address, contact, bank details, UPI VPA, terms all writable and audited | 3 | PLT-03-06 | FR |
| TSK-PLT-07-02 | Implement the `gst_type` change guard | BE | `~@be/platform/services/tenant.py` | Changing `regular` → anything else with issued tax invoices in the current FY returns 409 with the count | 2 | 01 | 22.3 |
| TSK-PLT-07-03 | Implement signature image upload | BE | `~@be/platform/views/tenant.py` `~@be/common/storage.py` | Stored through `files` with magic-byte validation; referenced by `branding.signature_attachment_id` | 2 | 01, CHS-TEN-20 | FR |
| TSK-PLT-07-04 | Build the business-profile screen | FE | `+@fe/settings/components/BusinessProfileForm.tsx` `+@app/(app)/settings/business/page.tsx` | Sectioned form; GSTIN with checksum feedback; the state-code mismatch shown as a warning, not an error | 3 | PLT-06-06 | §7 |
| TSK-PLT-07-05 | Build the bank and UPI section | FE | `+@fe/settings/components/BankDetailsSection.tsx` | IFSC format validated; a VPA renders a live QR preview through `UbQrCode` | 2 | 04, CHS-DS-11 | FR, PAY-03 |
| TSK-PLT-07-06 | Build the document-terms editor | FE | `+@fe/settings/components/DocumentTermsEditor.tsx` | Plain text with a character budget and a live print preview | 2 | 04 | FR |

**6 tasks, 14.0 points.**

#### PLT-08 — Audit log viewer

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PLT-08-01 | Implement the audit selector | BE | `+@be/platform/selectors/audit.py` | Filters by entity type, entity id, actor, action and date range; `select_related` on actor; query budget asserted | 2 | CHS-AUD-02 | 22.3 |
| TSK-PLT-08-02 | Implement `GET /audit-logs` | BE | `+@be/platform/views/audit.py` `+@be/platform/serializers/audit.py` `+@be/platform/filters.py` | Cursor-paginated; gated on `platform.audit.read`; staff receives 403 | 2 | 01 | 22.3, 0.9 |
| TSK-PLT-08-03 | Write the audit service, slice and thunk | FE | `+@fe/audit/api/auditService.ts` `+@fe/audit/redux/auditSlice.ts` `+@fe/audit/redux/auditThunk.ts` `+@fe/audit/types/audit.types.ts` | Infinite cursor list with filter state in the URL | 2 | 02 | 19.3 |
| TSK-PLT-08-04 | Build the audit list screen | FE | `+@fe/audit/components/AuditPageContent.tsx` `+@fe/audit/components/AuditRow.tsx` `+@app/(app)/settings/audit/page.tsx` | Actor, action, entity and time per row; action labels are i18n keys, never raw codes | 3 | 03 | §7 |
| TSK-PLT-08-05 | Build the before/after diff viewer | FE | `+@fe/audit/components/AuditDiffPanel.tsx` `+@fe/audit/view-model/auditDiff.ts` | Changed fields only, with money and dates formatted; an unchanged field is never shown | 3 | 04 | FR |

**5 tasks, 12.0 points.**

#### PLT-09 — Session & device management

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PLT-09-01 | Implement the session selector and revocation service | BE | `+@be/platform/selectors/session.py` `~@be/platform/services/session.py` | Lists active families with device label, agent, IP and last use; revoking one kills only that family | 2 | CHS-AUTH-03 | FR |
| TSK-PLT-09-02 | Implement `GET /sessions` and `POST /sessions/{id}/revoke` | BE | `+@be/platform/views/session.py` `~@be/platform/urls.py` | A revoked family's refresh returns 401; `?all=true` on logout revokes every family | 2 | 01 | 22.2 |
| TSK-PLT-09-03 | Build the sessions screen | FE | `+@fe/settings/components/SessionsList.tsx` `+@app/(app)/settings/sessions/page.tsx` | The current device is marked and cannot be revoked accidentally; revoke-all requires confirmation | 2 | 02 | §7, §9 |

**3 tasks, 6.0 points.**

#### WLB-01 — Tenant branding

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-WLB-01-01 | Implement the branding resolution service | BE | `+@be/platform/services/branding.py` | Resolves tenant → partner → product default per key and reports the source of each | 3 | PLT-03-04 | FR, 24.3 |
| TSK-WLB-01-02 | Implement server-side WCAG contrast validation | BE | `~@be/platform/validators.py` | Primary against white below 3:1 returns 400 `low_contrast` with the measured ratio | 2 | 01 | 22.3, 23.6 |
| TSK-WLB-01-03 | Implement `GET/PUT /tenants/current/branding` | BE | `~@be/platform/views/tenant.py` `+@be/platform/serializers/branding.py` | Multipart with `logo` and `signature`; fields `primary_hex`, `secondary_hex`, `app_name`, `doc_header`, `doc_footer` | 3 | 02, CHS-TEN-20 | 22.3 |
| TSK-WLB-01-04 | Generate the primary ramp from one hex | FE | `+@src/utils/colourRamp.ts` | One brand hex produces the eleven-step ramp the tokens expect, with every step contrast-checked | 3 | CHS-DS-02 | 19.8.3, 23.2.4 |
| TSK-WLB-01-05 | Apply branding before hydration | FE | `~@ds/theme/useWhiteLabelTheme.ts` `~@app/layout.tsx` | `[T-WLB-01-5]` no flash of default theme; the ramp is set by a blocking inline script from the server-rendered tenant | 3 | 04, CHS-DS-05 | 19.8.3 |
| TSK-WLB-01-06 | Build the branding screen | FE | `+@fe/settings/components/BrandingSettings.tsx` `+@app/(app)/settings/branding/page.tsx` | Logo upload with preview, colour pickers with live contrast feedback, header/footer, app name, and a live invoice thumbnail | 5 | 05 | §7 |
| TSK-WLB-01-07 | E2E: branding appears on a document | Test | `+e2e/tests/branding.spec.ts` | `[T-WLB-01-6]` logo and colour appear on the invoice print preview | 2 | 06, CHS-PRINT-04 | AC |

**7 tasks, 21.0 points.**

#### WLB-02 — Partner configuration

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-WLB-02-01 | Create `platform_partner` | DB | `~@be/platform/migrations/0001_initial.py` | `code U`, `branding jsonb`, `allowed_modules text[]`, `support_contact jsonb`, `hostnames text[]` with a GIN index | 1 | CHS-AUD-01 | 21.3.1 |
| TSK-WLB-02-02 | Implement the `Partner` model and the inheritance rules | BE | `+@be/platform/models/partner.py` `~@be/platform/services/tenant.py` | A new tenant inherits partner branding defaults and is capped by `allowed_modules` | 2 | 01 | FR |
| TSK-WLB-02-03 | Implement partner admin endpoints for super admins | BE | `+@be/platform/views/admin_partner.py` `~@be/platform/urls.py` | `/admin/partners` CRUD gated on `IsSuperAdmin`; every write audited with `actor_type='super_admin'` | 3 | 02, CHS-PERM-03 | 22.3 |
| TSK-WLB-02-04 | Surface the support contact and legal footer in the app | FE | `+@src/components/layout/SupportContactBlock.tsx` `~@fe/settings/components/BrandingSettings.tsx` | The partner's support phone, WhatsApp and hours appear in help and on the document footer | 2 | 03 | FR |

**4 tasks, 8.0 points.**

**`EPIC-GOVERNANCE` totals: 52 tasks, 124.0 points**, of which 51.5 are the Sprint 2 feature commitment and the remainder is chassis and design-system work counted in `EPIC-CHASSIS`.

---

### 33.5.3 `EPIC-PARTIES` — the party master and the khata surface (Sprint 3)

**Claim.** A party exists with a mobile, a GSTIN, tags, a credit limit and a collection date; the list searches, filters and totals over the filtered set; the khata page is the surface the ledger will live on.

#### PTY-01 — Create/edit party

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PTY-01-01 | Create `parties_party` with every column and index | DB | `+@be/parties/migrations/0001_initial.py` | All of Part 21 §21.3.3; `U(tenant_id, mobile) WHERE mobile IS NOT NULL AND deleted_at IS NULL`; GIN trigram on `name`; six indexes | 2 | CHS-TEN-05 | 21.3.3 |
| TSK-PTY-01-02 | Implement the `Party` model and constants | BE | `+@be/parties/models.py` `+@be/parties/constants.py` | `PartyStatus`, `GstRegistration`, `BalanceFilter` as `TextChoices` matching canon | 2 | 01 | 0.7, 21.3.3 |
| TSK-PTY-01-03 | Implement `PartyQuerySet` | BE | `+@be/parties/managers.py` | `.search(q)` uses trigram; `.with_balance_filter()` maps `owes_me`/`i_owe`/`settled` to sign predicates | 2 | 02 | PTY-02 FR |
| TSK-PTY-01-04 | Implement `create_party()` and `update_party()` | BE | `+@be/parties/services/crud.py` | One transaction; duplicate mobile → 400 on `details.mobile`; GSTIN checksum enforced; state mismatch is a warning; one audit row with changed fields | 3 | 03, PLT-03-05 | FR, §11 |
| TSK-PTY-01-05 | Store the requested opening balance unapplied | BE | `~@be/parties/services/crud.py` | The value is persisted but posts no ledger entry; a test asserts `ledger_entry` count is zero — LED-02 consumes it in Sprint 4 | 1 | 04 | LED-02 handoff |
| TSK-PTY-01-06 | Implement the party serializers | BE | `+@be/parties/serializers/party.py` `+@be/parties/serializers/nested.py` | Read, list, create and update as separate classes; money as strings; `PartyMiniSerializer` for other apps | 2 | 04 | R6.1, 22.4 |
| TSK-PTY-01-07 | Implement `PartyViewSet` create/update/retrieve | BE | `+@be/parties/views/party.py` `+@be/parties/urls.py` `+@be/parties/permissions.py` | `POST /parties` 201 per §22.4; `parties.party.write` enforced; accountant refused | 2 | 06 | 22.4, 0.9 |
| TSK-PTY-01-08 | Write `partyService.ts` and `party.types.ts` | FE | `+@fe/parties/api/partyService.ts` `+@fe/parties/types/party.types.ts` | Wire snake_case typed separately; `toParty` mapper; money stays a string | 2 | 07 | R-TS-7, 25.19 |
| TSK-PTY-01-09 | Write `partyFormSlice.ts` and `partyFormThunk.ts` | FE | `+@fe/parties/redux/partyFormSlice.ts` `+@fe/parties/redux/partyFormThunk.ts` | Three lifecycle cases; `rejectWithValue(toApiError(...))`; invalidation map updated | 2 | 08 | R-RX-5, 19.3.6 |
| TSK-PTY-01-10 | Write `partySchemas.ts` | FE | `+@fe/parties/validation/partySchemas.ts` | `usePartySchemas()` composes `mobileValidation`, `gstinValidation`, `amountValidation`; at least one of customer/supplier required | 2 | CHS-I18N-04 | §10 |
| TSK-PTY-01-11 | Write `partyDisplay.ts` | FE | `+@fe/parties/view-model/partyDisplay.ts` | `initials`, `secondaryLine`, `balanceLabel`, `balanceTone` — pure, ≥ 95 % covered | 1 | 08 | §7, 28.7 |
| TSK-PTY-01-12 | Build `PartyFormDrawer` | FE | `+@fe/parties/components/PartyFormDrawer.tsx` `+@fe/parties/hooks/usePartyForm.ts` | Create and edit in one drawer; server `validation_error` details mapped back onto fields with focus; dirty guard | 5 | 09, 10, CHS-DS-07 | §7, R-F-5 |
| TSK-PTY-01-13 | Build the advanced section | FE | `+@fe/parties/components/PartyAdvancedSection.tsx` | Addresses, state code, credit limit, credit days, collection date, tags, SMS opt-in and consent source, collapsed by default | 3 | 12 | FR |
| TSK-PTY-01-14 | E2E: create a party with every field | Test | `+e2e/tests/party-create.spec.ts` | `[T-PTY-01-*]` create, reopen, assert every value round-trips; a duplicate mobile shows the field error | 2 | 13 | AC |

**14 tasks, 31.0 points.**

#### PTY-02 — Party list with totals

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PTY-02-01 | Implement `PartyFilterSet` | BE | `+@be/parties/filters.py` | `q`, `type`, `balance`, `status`, `tag`, `collection` each declared; ad-hoc `query_params` reading is absent | 2 | PTY-01-03 | 22.4, R7.3 |
| TSK-PTY-02-02 | Implement `list_parties()` | BE | `+@be/parties/selectors/party.py` | `prefetch_related` on tags; ordering whitelisted to the four options; a query-count budget asserted at page sizes 25 and 100 | 3 | 01 | 22.4, R5.3 |
| TSK-PTY-02-03 | Implement `party_totals()` over the filtered set | BE | `~@be/parties/selectors/party.py` | `meta.totals.receivable/payable/count` computed in SQL over the **filtered** queryset, proven for every filter combination | 3 | 02 | 22.4, FR |
| TSK-PTY-02-04 | Wire the list action on `PartyViewSet` | BE | `~@be/parties/views/party.py` | `GET /parties` returns data plus `meta.totals`; `parties.party.read` enforced | 1 | 03 | 22.4 |
| TSK-PTY-02-05 | Add the trigram index performance assertion | Test | `+@be/parties/tests/test_perf_list.py` | `EXPLAIN` shows the GIN trigram index used for `?q=`; first page at 2,000 parties ≤ 1.5 s | 2 | 04, CHS-SEED-12 | 12.5 |
| TSK-PTY-02-06 | Write `partyListSlice.ts` and `partyListThunk.ts` | FE | `+@fe/parties/redux/partyListSlice.ts` `+@fe/parties/redux/partyListThunk.ts` | `status` union, `ApiErrorShape` error, selection state, co-located selectors, a `resetPartyList` reducer | 3 | PTY-01-08 | R-RX-1, R-RX-3 |
| TSK-PTY-02-07 | Write the list constants | FE | `+@fe/parties/constants/{partyFilters,partySort,partyListDefaults}.ts` | `BALANCE_FILTERS`, `TYPE_FILTERS`, `COLLECTION_FILTERS`, `ORDERING_OPTIONS`, `DEFAULT_PAGE_SIZE`, `SELECTION_CAP` | 1 | 06 | §7 |
| TSK-PTY-02-08 | Write `usePartyList` | FE | `+@fe/parties/hooks/usePartyList.ts` | Filters, pagination and selection in one hook; filter state mirrored to the URL; fetches abort on dependency change | 3 | 07 | R-H-2, R-H-4 |
| TSK-PTY-02-09 | Build `PartyTotalsHeader` | FE | `+@fe/parties/components/PartyTotalsHeader.tsx` | Two `UbStatCard`s, tappable to apply the matching balance filter, with the label always beside the colour | 2 | 08, CHS-DS-10 | §7, §8 |
| TSK-PTY-02-10 | Build `PartyListToolbar` and `PartyListFiltersDrawer` | FE | `+@fe/parties/components/{PartyListToolbar,PartyListFiltersDrawer}.tsx` | `UbSearchInput` debounced 300 ms, chips, tag combobox, sort menu; the drawer is the mobile form of the same state | 3 | 09 | §7 |
| TSK-PTY-02-11 | Build `PartyListRow` and the grid columns | FE | `+@fe/parties/components/PartyListRow.tsx` `+@fe/parties/components/partyListColumns.tsx` | One column factory drives the desktop grid and the mobile card; the row is memoised and keyed on id | 3 | 10 | R-C-3, R-C-10 |
| TSK-PTY-02-12 | Build `PartyRowActionsMenu` and `partyActions.ts` | FE | `+@fe/parties/components/PartyRowActionsMenu.tsx` `+@fe/parties/view-model/partyActions.ts` | `rowMenu(party, permissions)` returns the allowed items only; no permission arithmetic in JSX | 2 | 11 | R-C-7 |
| TSK-PTY-02-13 | Build `PartyBulkActionBar` | FE | `+@fe/parties/components/PartyBulkActionBar.tsx` | Selection capped at `SELECTION_CAP`; actions reflect permissions; the bar is sticky on desktop and a sheet on mobile | 2 | 12 | §7 |
| TSK-PTY-02-14 | Build `PartyListPageContent` and the route | FE | `+@fe/parties/components/PartyListPageContent.tsx` `~@app/(app)/parties/page.tsx` | All ten states of §9 render; the file contains no axios, no Yup, no formatting and no permission arithmetic | 3 | 13 | §9, 19.2.3 |
| TSK-PTY-02-15 | Write `usePartySearch` for reuse | FE | `+@fe/parties/hooks/usePartySearch.ts` | Debounced async combobox source exported for sales, purchases, payments and expenses; a lint rule forbids a second implementation | 2 | 08 | 19.2.3 |
| TSK-PTY-02-16 | E2E: search, filter, sort, totals | Test | `+e2e/tests/party-list.spec.ts` | `[T-PTY-02-*]` totals change with the filter; sorting is stable; 360 px layout is usable | 2 | 14 | AC |

**16 tasks, 35.0 points.**

#### PTY-03 — Party detail (khata page)

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PTY-03-01 | Implement `get_party()` and `party_summary()` | BE | `~@be/parties/selectors/party.py` | Returns balance, receivable, payable, open invoices, overdue amount and last payment in one query set with a budget | 3 | PTY-02-02 | 22.4 |
| TSK-PTY-03-02 | Implement the detail endpoint with `recent_entries[5]` | BE | `~@be/parties/views/party.py` `~@be/parties/serializers/party.py` | `GET /parties/{id}` shape equals §22.4; a cross-tenant id returns 404 | 2 | 01 | 22.4 |
| TSK-PTY-03-03 | Write `partyDetailSlice.ts` and `partyDetailThunk.ts` | FE | `+@fe/parties/redux/partyDetailSlice.ts` `+@fe/parties/redux/partyDetailThunk.ts` | `balanceUpdated` reducer so the ledger can push a new balance without a refetch | 2 | 02 | LED-01 FR-3 |
| TSK-PTY-03-04 | Build `PartyHeaderCard` | FE | `+@fe/parties/components/PartyHeaderCard.tsx` | `UbPartyHeader` with the balance, the "You will get / You will give / Settled" label and five quick actions gated by permission and module | 3 | 03, CHS-DS-10 | §7 |
| TSK-PTY-03-05 | Build the timeline shell | FE | `+@fe/parties/components/PartyTimelineSection.tsx` | `UbTimeline` with date grouping and an infinite cursor; empty, loading, error and end-of-list states | 3 | 04 | §9 |
| TSK-PTY-03-06 | Build `PartyDetailPageContent` and the route | FE | `+@fe/parties/components/PartyDetailPageContent.tsx` `~@app/(app)/parties/[id]/page.tsx` | Header, quick actions, timeline and an info panel; ≤ 300 lines | 3 | 05 | 19.2.3, R-FN-4 |
| TSK-PTY-03-07 | Write `usePartyDetail` | FE | `+@fe/parties/hooks/usePartyDetail.ts` | Fetch, refresh and the balance-push handler in one hook with a declared return type | 2 | 03 | R-H-2 |

**7 tasks, 18.0 points.**

#### PTY-04 — Archive / restore party

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PTY-04-01 | Implement `archive_party()` and `restore_party()` | BE | `~@be/parties/services/crud.py` | A non-zero balance returns 409 `party_balance_nonzero` with the balance in `details`; both write audit rows | 2 | PTY-01-04 | FR, 22.4 |
| TSK-PTY-04-02 | Implement the archive and restore actions | BE | `~@be/parties/views/party.py` | `POST /parties/{id}/archive` and `/restore`; gated on `parties.party.delete` | 1 | 01 | 22.4, 0.9 |
| TSK-PTY-04-03 | Block writes against an archived party | BE | `~@be/parties/services/crud.py` `+@be/parties/services/guards.py` | `assert_party_writable()` raises `party_archived` (409) and is called by ledger, sales, purchases, payments and expenses | 2 | 02 | LED-01 BR-9 |
| TSK-PTY-04-04 | Build `PartyArchiveDialog` | FE | `+@fe/parties/components/PartyArchiveDialog.tsx` | `UbConfirmDialog`; the 409 is rendered in place with a "Write off first" action linking to LED-11 | 2 | 02, CHS-DS-07 | §9 |
| TSK-PTY-04-05 | Render the archived state on the detail page | FE | `~@fe/parties/components/PartyHeaderCard.tsx` | Quick actions are hidden and a banner offers restore | 1 | 04 | §9 |

**5 tasks, 8.0 points.**

#### PTY-05 — Tags & groups

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PTY-05-01 | Create `parties_tag` and `parties_party_tag` | DB | `+@be/parties/migrations/0002_tags.py` | `U(tenant_id, name)`, `U(party_id, tag_id)` | 1 | PTY-01-01 | 21.3.3 |
| TSK-PTY-05-02 | Implement the `Tag` and `PartyTag` models and `list_tags()` | BE | `~@be/parties/models.py` `+@be/parties/selectors/tag.py` | Tags ordered by usage count then name | 1 | 01 | FR |
| TSK-PTY-05-03 | Implement `TagViewSet` and tag assignment | BE | `+@be/parties/views/tag.py` `+@be/parties/serializers/tag.py` `~@be/parties/urls.py` | `GET/POST /tags`; assignment happens inside `create_party`/`update_party`, never as a separate write path | 2 | 02 | FR |
| TSK-PTY-05-04 | Write `partyTagService.ts` and `partyTagSlice.ts` | FE | `+@fe/parties/api/partyTagService.ts` `+@fe/parties/redux/partyTagSlice.ts` | Tag list cached in the slice and invalidated on create | 1 | 03 | 19.3.6 |
| TSK-PTY-05-05 | Build the tag combobox with inline create | FE | `+@fe/parties/components/PartyTagCombobox.tsx` | `UbAsyncCombobox` with "Create «x»" as the last option; a new tag is usable without closing the form | 2 | 04, CHS-DS-09 | §7 |
| TSK-PTY-05-06 | Wire the tag filter into the list | FE | `~@fe/parties/components/PartyListToolbar.tsx` | Selecting a tag adds a `UbFilterTag` and updates the totals | 1 | 05, PTY-02-10 | FR |

**6 tasks, 8.0 points.**

#### PTY-06 — Credit limit & alerts

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PTY-06-01 | Implement `check_credit_limit()` | BE | `+@be/parties/services/credit.py` | Given limit, balance and amount returns `ok`/`warn`/`block` per the tenant mode; credit-direction entries never trigger it | 3 | PTY-01-04, PLT-06-02 | LED-01 BR-6 |
| TSK-PTY-06-02 | Implement the override path | BE | `~@be/parties/services/credit.py` | `override=true` is honoured only for `ledger.entry.correct` holders and writes `ledger.credit_limit.overridden` | 2 | 01 | LED-01 BR-6, §16 |
| TSK-PTY-06-03 | Expose limit usage on the party summary | BE | `~@be/parties/selectors/party.py` | `credit_limit`, `balance` and a derived `utilisation` percentage | 1 | 01 | FR |
| TSK-PTY-06-04 | Build the credit-limit fields and usage bar | FE | `~@fe/parties/components/PartyAdvancedSection.tsx` `+@fe/parties/components/CreditLimitBar.tsx` | `UbProgress` with a pace marker; over-limit shown in the error tone with the figure, never colour alone | 2 | 03 | §7, §8 |
| TSK-PTY-06-05 | Build the shared credit-limit banner | FE | `+@fe/parties/components/CreditLimitBanner.tsx` | Reused by the ledger drawer and the invoice editor; renders warn, block and override variants | 2 | 04 | LED-01 §9, SAL-02 |

**5 tasks, 10.0 points.**

**`EPIC-PARTIES` totals: 53 tasks, 110.0 points**, of which 49.0 is the Sprint 3 feature commitment; the remainder is design-system wave 3 and the chassis print work counted elsewhere.

---

### 33.5.4 `EPIC-LEDGER` — the immutable party ledger (Sprint 4)

**Claim.** Two taps write an immutable, attributable entry; the party balance moves atomically under a row lock; a correction leaves a reversal, a replacement and a reason; a statement shows a running balance and prints with branding; `recalc_balances` finds zero drift.

This epic produces `post_entry()`, `reverse_entry()`, `correct_entry()` and `apply_balance_delta()` — the four functions every document, payment and expense in Sprints 7–10 calls. Nothing in it may be deferred.

#### LED-01 — Record "You gave" / "You got"

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-LED-01-01 | Create `ledger_entry` with every column, constraint and index | DB | `+@be/ledger/migrations/0001_initial.py` | All of Part 21 §21.3.4; four indexes; `CHECK amount > 0`; `CHECK direction IN ('debit','credit')`; `reversal ⇒ reverses_id NOT NULL` | 3 | PTY-01-01 | 21.3.4 |
| TSK-LED-01-02 | Install the `forbid_update_delete` trigger | DB | `~@be/ledger/migrations/0001_initial.py` | `UPDATE ledger_entry SET amount = …` raises; updating `status` or `reversed_by_id` succeeds; `DELETE` raises | 2 | 01 | 21.1-2, BR-1 |
| TSK-LED-01-03 | Implement the `LedgerEntry` model and constants | BE | `+@be/ledger/models.py` `+@be/ledger/constants.py` | `EntryType`, `SourceType`, `EntryStatus`, `PaymentMode` as `TextChoices` matching canon §0.7 and §21.3.4 character for character | 2 | 02 | 0.7, R3.4 |
| TSK-LED-01-04 | Implement `apply_balance_delta()` | BE | `+@be/parties/services/balance.py` | Locks the party (L1), applies the signed delta, recomputes `receivable_total = max(balance,0)` and `payable_total = max(−balance,0)`, sets `last_activity_at` | 3 | 03 | BR-2, BR-3, BR-4, L1 |
| TSK-LED-01-05 | Implement `post_entry()` — the reference vertical slice | BE | `+@be/ledger/services/entry.py` | One transaction: guard the party, check the credit limit, insert the entry, apply the balance delta, write one audit row, enqueue the SMS job; returns a frozen dataclass with the entry and the new balance | 5 | 04, PTY-04-03, PTY-06-01 | FR-5, BR-1…BR-10, 20.3.3 |
| TSK-LED-01-05.1 | — subtask: lock the party before any insert, with the L1 comment | BE | `~@be/ledger/services/entry.py` | The `select_for_update` call carries `# L1:` and precedes the insert | — | 05 | L1 |
| TSK-LED-01-05.2 | — subtask: map direction to `entry_type` and null `payment_mode` for debits | BE | `~@be/ledger/services/entry.py` | `debit → manual_gave`, `credit → manual_got`; a `payment_mode` sent with a debit is silently nulled, never an error | — | 05 | FR-5, §10 cross-field |
| TSK-LED-01-05.3 | — subtask: enqueue the party SMS without delaying the response | BE | `~@be/ledger/services/entry.py` | `enqueue()` runs inside the transaction; the handler runs later; the response time is unaffected | — | 05 | FR-9, EC-5 |
| TSK-LED-01-06 | Implement the ledger serializers | BE | `+@be/ledger/serializers/entry.py` | `LedgerEntryReadSerializer` matches the §14 shape including `attachment`, `created_by` and the reversal chain fields; write serializer separate | 2 | 05 | 22.5, §14 |
| TSK-LED-01-07 | Implement `POST /ledger-entries` with idempotency | BE | `+@be/ledger/views/entry.py` `+@be/ledger/urls.py` `+@be/ledger/permissions.py` | 201 with `meta.party_balance` and `warnings[]`; `@idempotent`; `ledger.entry.write` enforced; accountant refused | 3 | 06, CHS-IDEM-03 | 22.5, §12 |
| TSK-LED-01-08 | Implement the party-scoped convenience route | BE | `~@be/ledger/views/entry.py` | `POST /parties/{id}/ledger-entries` calls the identical service with the same tests | 1 | 07 | §14 |
| TSK-LED-01-09 | Implement the cursor list of entries | BE | `+@be/ledger/selectors/entry.py` `~@be/ledger/views/entry.py` `+@be/ledger/filters.py` | `GET /parties/{id}/ledger-entries` with `cursor`, `limit`, `date_from`, `date_to`, `type`, `include_reversed`; query budget asserted | 3 | 07 | 22.5 |
| TSK-LED-01-10 | Implement `manage.py recalc_balances` | BE | `+@be/common/management/commands/recalc_balances.py` | Recomputes every party's balance from posted entries and reports drift; `--fix` writes corrections and audits them | 3 | 05 | 21.1-3, 12.5 |
| TSK-LED-01-11 | Prove zero drift on the 10,000-entry fixture | Test | `+@be/ledger/tests/test_recalc_drift.py` | `[T-LED-01-11]` random entries including backdated, reversed and corrected rows produce zero drift | 2 | 10, CHS-SEED-12 | 12.5, AC |
| TSK-LED-01-12 | Prove concurrent posting serialises | Test | `+@be/ledger/tests/test_concurrency.py` | `[T-LED-01-*]` two threads posting to one party both succeed and the final balance is exact | 2 | 05 | EC-7, 28.2.7 |
| TSK-LED-01-13 | Write `ledgerService.ts` and `ledger.types.ts` | FE | `+@fe/ledger/api/ledgerService.ts` `+@fe/ledger/types/ledger.types.ts` | `postLedgerEntry(payload, idempotencyKey)` and `uploadAttachment(file, kind)`; money stays a string | 2 | 07 | §14, R-TS-7 |
| TSK-LED-01-14 | Write `ledgerEntrySlice.ts` and `ledgerEntryThunk.ts` | FE | `+@fe/ledger/redux/ledgerEntrySlice.ts` `+@fe/ledger/redux/ledgerEntryThunk.ts` | State is `{ byParty, entities, draft, posting, lastError }`; the posted balance is dispatched to `partyDetailSlice.balanceUpdated` | 3 | 13 | §14, R-RX-8 |
| TSK-LED-01-15 | Write `ledgerEntrySchemas.ts` | FE | `+@fe/ledger/validation/ledgerEntrySchemas.ts` | Every rule of §10 including `payment_mode` required for credits and `entry_date ≤ today` in tenant time | 2 | CHS-I18N-04 | §10 |
| TSK-LED-01-16 | Build `LedgerEntryDrawer` | FE | `+@fe/ledger/components/LedgerEntryDrawer.tsx` `+@fe/ledger/components/DirectionToggle.tsx` `+@fe/ledger/components/PaymentModeToggle.tsx` | Amount autofocused with a numeric keypad; direction switchable without losing values; the footer button is above `env(safe-area-inset-bottom)` | 5 | 14, 15, CHS-DS-07 | FR-1…FR-4, FR-11, §7 |
| TSK-LED-01-17 | Implement the attachment path | FE | `+@fe/ledger/hooks/useEntryAttachment.ts` `~@fe/ledger/components/LedgerEntryDrawer.tsx` | Client compression to ≤ 300 KB and 1600 px before upload; a failed upload offers "Save without photo" | 3 | 16 | FR-10, §5, §9 |
| TSK-LED-01-18 | Implement the optimistic row and retry | FE | `~@fe/ledger/redux/ledgerEntrySlice.ts` `+@fe/ledger/components/LedgerEntryOptimisticRow.tsx` | A network failure turns the row amber with Retry; the retry reuses the same idempotency key and de-duplicates by entry id | 3 | 16 | FR-12, EC-1, §9 |
| TSK-LED-01-19 | Implement the credit-limit outcomes in the drawer | FE | `~@fe/ledger/components/LedgerEntryDrawer.tsx` `~@fe/parties/components/CreditLimitBanner.tsx` | `warn` shows a snackbar and saves; `block` shows the banner with limit and balance-after; "Save anyway" appears only for owner and admin | 3 | 16, PTY-06-05 | Alt C, Alt D, §12 |
| TSK-LED-01-20 | Build the timeline row and its view-model | FE | `+@fe/ledger/components/LedgerTimelineRow.tsx` `+@fe/ledger/view-model/ledgerDisplay.ts` | Date grouping, signed `UbAmount` with tone **and** label, mode, reference, attribution, thumbnail, backdated tag | 3 | 18, PTY-03-05 | §7, EC-2 |
| TSK-LED-01-21 | Implement "Save & add another" | FE | `~@fe/ledger/components/LedgerEntryDrawer.tsx` | Keeps the party, date and mode; resets amount and note; focus returns to amount | 1 | 16 | FR-7 |
| TSK-LED-01-22 | E2E: the eight-second entry | Test | `+e2e/tests/ledger-entry.spec.ts` | `[T-LED-01-10]` You gave 500 then You got 200 UPI; balances and timeline order asserted; run at 360 px | 3 | 21 | AC-1, AC-2, AC-6 |

**22 tasks (+3 subtasks), 55.0 points.**

#### LED-02 — Opening balance

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-LED-02-01 | Implement `post_opening_balance()` | BE | `+@be/ledger/services/opening.py` | Posts `entry_type='opening'` in either direction through `post_entry()`; exactly one opening entry per party, enforced | 3 | LED-01-05 | FR, BR |
| TSK-LED-02-02 | Consume the value stored by PTY-01 | BE | `~@be/parties/services/crud.py` | `create_party` with an opening balance now posts the entry in the same transaction; the PTY-01 "unapplied" test is inverted | 2 | 01, PTY-01-05 | PTY-01 handoff |
| TSK-LED-02-03 | Allow `as_of` backdating | BE | `~@be/ledger/services/opening.py` | `as_of` is the `entry_date`; future dates rejected; the statement opens from it | 1 | 01 | FR |
| TSK-LED-02-04 | Surface the opening balance in the party form | FE | `~@fe/parties/components/PartyFormDrawer.tsx` | Amount plus a direction toggle ("They owe me" / "I owe them") plus an as-of date; hidden on edit once posted | 2 | 02 | §7 |
| TSK-LED-02-05 | Render the opening row distinctly in the timeline | FE | `~@fe/ledger/components/LedgerTimelineRow.tsx` | Labelled "Opening balance" and pinned to the first date group | 1 | 04 | §7 |

**5 tasks, 9.0 points.**

#### LED-03 — Correct or reverse an entry

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-LED-03-01 | Implement `reverse_entry()` | BE | `+@be/ledger/services/correction.py` | Inserts a reversal with the opposite direction and `reverses_id`, sets `reversed_by_id` and `status='reversed'` on the original, applies the balance delta, requires a reason | 3 | LED-01-05 | FR, BR |
| TSK-LED-03-02 | Refuse reversal of document-sourced entries | BE | `~@be/ledger/services/correction.py` | `source_type ∉ {manual, opening}` returns 409 `use_document_void` naming the document | 1 | 01 | 22.5 |
| TSK-LED-03-03 | Implement `correct_entry()` | BE | `~@be/ledger/services/correction.py` | One transaction producing `{reversal, replacement}`; the replacement carries `supersedes_id`; both balance deltas applied; two audit rows under one logical event id | 3 | 02 | FR, BR |
| TSK-LED-03-04 | Implement the reverse and correct actions | BE | `~@be/ledger/views/entry.py` | `POST /ledger-entries/{id}/reverse` and `/correct`; gated on `ledger.entry.correct`; staff refused with 403 | 2 | 03 | 22.5, §12 |
| TSK-LED-03-05 | Return the correction chain on the detail endpoint | BE | `~@be/ledger/serializers/entry.py` | `GET /ledger-entries/{id}` includes `history` walking `reverses_id`/`supersedes_id` in both directions | 2 | 04 | 22.5 |
| TSK-LED-03-06 | Write the correction thunks and slice cases | FE | `~@fe/ledger/redux/ledgerEntryThunk.ts` `~@fe/ledger/redux/ledgerEntrySlice.ts` | A correction replaces the row in place and inserts the reversal, without a full refetch | 2 | 05 | 19.3.6 |
| TSK-LED-03-07 | Build the correct and reverse dialogs | FE | `+@fe/ledger/components/{CorrectEntryDialog,ReverseEntryDialog}.tsx` | `UbReasonDialog` with a required reason; the correction dialog pre-fills the current values | 3 | 06, CHS-DS-09 | §7 |
| TSK-LED-03-08 | Render corrections in the timeline and statement | FE | `~@fe/ledger/components/LedgerTimelineRow.tsx` `+@fe/ledger/view-model/correctionChain.ts` | A reversed row is struck through with its reason; the replacement links to the original; the corrections toggle hides both | 3 | 07 | FR, §7 |
| TSK-LED-03-09 | E2E: correct an entry | Test | `+e2e/tests/ledger-correction.spec.ts` | `[T-LED-03-*]` correct ₹500 to ₹450 with a reason; assert the reversal, the replacement, the reason and the resulting balance | 2 | 08 | AC |

**9 tasks, 21.0 points.**

#### LED-04 — Party statement with running balance

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-LED-04-01 | Implement the statement selector | BE | `+@be/ledger/selectors/statement.py` | Opening balance for the range, entries with `running_balance` from a SQL window function, closing balance, source document links; `include_corrections` respected | 5 | LED-03-03 | 22.4, 21.4 |
| TSK-LED-04-02 | Implement `GET /parties/{id}/statement` | BE | `~@be/parties/views/party.py` `+@be/ledger/serializers/statement.py` | Cursor-paginated; `ledger.entry.read` enforced; 5,000 entries first page ≤ 1.5 s | 3 | 01 | 22.4, 12.5 |
| TSK-LED-04-03 | Implement statement share links | BE | `~@be/parties/views/party.py` `~@be/common/share_links.py` | `POST /parties/{id}/share-links` with `kind='statement'`; token hashed, expiring, revocable | 2 | 02, CHS-PRINT-09 | 22.4 |
| TSK-LED-04-04 | Assert the index is used by the window query | Test | `+@be/ledger/tests/test_statement_perf.py` | `EXPLAIN` shows `(tenant_id, party_id, entry_date, created_at)` driving the ordering | 2 | 01 | 21.4 |
| TSK-LED-04-05 | Write the statement service, slice and thunk | FE | `+@fe/ledger/api/statementService.ts` `+@fe/ledger/redux/statementSlice.ts` `+@fe/ledger/redux/statementThunk.ts` | Range and corrections toggle in the URL; cursor list | 3 | 02 | 19.3 |
| TSK-LED-04-06 | Build the statement screen | FE | `+@fe/ledger/components/StatementPageContent.tsx` `~@app/(app)/parties/[id]/statement/page.tsx` | Date-range chips (this month, last month, FY, custom), running-balance column, opening and closing rows, all ten states | 5 | 05, CHS-DS-10 | §7, §9 |
| TSK-LED-04-07 | Build the statement print component | FE | `+@fe/ledger/components/print/StatementPrintA4.tsx` `+@app/(app)/parties/[id]/statement/print/page.tsx` | Branded header, running balance, corrections toggle honoured, page breaks between date groups | 3 | 06, CHS-PRINT-02 | LED-04 FR |
| TSK-LED-04-08 | Build the share sheet | FE | `+@fe/ledger/components/StatementShareSheet.tsx` | `UbShareSheet` offering WhatsApp with a prefilled message, copy link and print | 2 | 07, NTF-03-04 | NTF-03 |
| TSK-LED-04-09 | E2E: statement and share | Test | `+e2e/tests/statement.spec.ts` | `[T-LED-04-*]` running balance matches a hand-computed sequence; the WhatsApp URL contains the balance and the link | 2 | 08 | AC |

**9 tasks, 27.0 points.**

#### LED-11 — Write-off / settle small balance

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-LED-11-01 | Implement `post_write_off()` | BE | `+@be/ledger/services/write_off.py` | Posts `entry_type='write_off'` in the direction that zeroes the balance; reason required; gated on `ledger.entry.correct` | 2 | LED-01-05 | FR, BR |
| TSK-LED-11-02 | Expose the write-off endpoint | BE | `~@be/ledger/views/entry.py` | `POST /ledger-entries/write-off` with `party_id`, `amount` and `reason`; amount defaults to the full balance | 1 | 01 | 22.5 |
| TSK-LED-11-03 | Build the write-off drawer | FE | `+@fe/ledger/components/WriteOffDrawer.tsx` | Prefills the current balance; the reason is required; reachable from the archive 409 and the party menu | 2 | 02 | §7, PTY-04-04 |

**3 tasks, 5.0 points.**

**`EPIC-LEDGER` totals: 48 tasks (+3 subtasks), 117.0 points**, of which 50.0 is the Sprint 4 commitment; the print components and design-system wave 3 are counted in `EPIC-CHASSIS`.

---

### 33.5.5 `EPIC-COLLECTIONS` — collection dates, reminders and messaging (Sprint 5)

**Claim.** Collection becomes a list rather than a memory exercise, and every outbound message in the product goes through one adapter with one log.

#### NTF-02 — Messaging provider adapters

Built first within the epic, because everything else in it is a caller (Part 13 §13.7).

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-NTF-02-01 | Create `notifications_message_log` and `notifications_template` | DB | `+@be/notifications/migrations/0001_initial.py` | Columns per Part 21 §21.3.2; `IX(provider_message_id)`; template resolution columns `partner_id`/`tenant_id` nullable | 2 | CHS-TEN-05 | 21.3.2 |
| TSK-NTF-02-02 | Define the `SmsBackend` and `WhatsAppBackend` protocols | BE | `+@be/common/integrations/sms/base.py` `+@be/common/integrations/whatsapp/base.py` | A backend implements `send(to, body, template_code, meta) -> SendResult`; no caller imports a concrete backend | 2 | 01 | 20.10.1, 20.10.2 |
| TSK-NTF-02-03 | Implement `ConsoleSmsBackend` and `WaMeBackend` | BE | `+@be/common/integrations/sms/console.py` `+@be/common/integrations/whatsapp/deep_link.py` | Console logs `OTP for +91…: 123456` at INFO on `notifications.sms.console` and writes a `sent` log row; with no backend configured the row is `skipped` and the call still succeeds | 3 | 02 | PLT-01 FR-3, ADR-015 |
| TSK-NTF-02-04 | Implement the template registry and resolution | BE | `+@be/notifications/services/template.py` | Resolution order tenant → partner → global; `{{placeholders}}` rendered; `en` and `hi` bodies; DLT id field present | 3 | 03 | 21.3.2 |
| TSK-NTF-02-05 | Implement `send_message()` with logging | BE | `+@be/notifications/services/dispatch.py` | One log row per attempt with provider, status, cost and `related_type`/`related_id`; failures never raise into the caller | 3 | 04 | 21.3.2 |
| TSK-NTF-02-06 | Register the send job handler | BE | `+@be/notifications/tasks.py` | `notifications.send_message` is retryable and idempotent on its `idempotency_token` | 2 | 05, CHS-JOB-03 | 20.8.9 |
| TSK-NTF-02-07 | Seed the MVP templates | BE | `+@be/notifications/management/commands/seed_templates.py` | `otp`, `invitation`, `LEDGER_ENTRY_GAVE`, `LEDGER_ENTRY_GOT`, `REMINDER_D1`, `REMINDER_D0`, `PAYMENT_RECEIVED` in both locales | 2 | 04 | LED-07 §17, LED-08 §17 |
| TSK-NTF-02-08 | Build the message-log viewer for support | FE | `+@fe/settings/components/MessageLogTable.tsx` `+@app/(app)/settings/messages/page.tsx` | Channel, template, status, error and cost per row; `skipped` explained inline | 2 | 05 | §7 |

**8 tasks, 19.0 points.**

#### NTF-01 — In-app notification inbox

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-NTF-01-01 | Create `notifications_notification` | DB | `~@be/notifications/migrations/0001_initial.py` | `IX(tenant_id, user_id, read_at, created_at DESC)`; `user_id` nullable meaning "all members with permission" | 1 | NTF-02-01 | 21.3.2 |
| TSK-NTF-01-02 | Implement `notify()` and the five MVP types | BE | `+@be/notifications/services/notify.py` `~@be/notifications/constants.py` | `reminder_due`, `low_stock`, `payment_received`, `member_joined`, `import_done`; each carries a deep-link route in `data` | 2 | 01 | FR |
| TSK-NTF-01-03 | Implement the inbox endpoints | BE | `+@be/notifications/views/notification.py` `+@be/notifications/serializers/notification.py` `+@be/notifications/urls.py` | `GET /notifications`, `/unread-count`, `POST /{id}/read`, `/read-all` per §22.12 | 2 | 02 | 22.12 |
| TSK-NTF-01-04 | Schedule the 180-day purge | BE | `~@be/notifications/tasks.py` | Rows older than 180 days deleted; double run harmless | 1 | 03 | 21.3.2 |
| TSK-NTF-01-05 | Write the notifications service, slice and thunk | FE | `+@fe/notifications/api/notificationService.ts` `+@fe/notifications/redux/notificationSlice.ts` `+@fe/notifications/redux/notificationThunk.ts` | Unread count polled on an interval and refreshed after any mutation | 2 | 03 | 19.3.6 |
| TSK-NTF-01-06 | Build the bell and the inbox panel | FE | `+@src/components/layout/NotificationBell.tsx` `+@fe/notifications/components/NotificationPanel.tsx` `+@app/(app)/notifications/page.tsx` | Unread badge; tapping a row marks read and routes to the deep link; empty, loading and error states | 3 | 05 | §7, §9 |

**6 tasks, 11.0 points.**

#### NTF-03 — WhatsApp deep-link share

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-NTF-03-01 | Implement `build_whatsapp_text()` | BE | `+@be/notifications/services/whatsapp_text.py` | Renders the template with balance, shop name and a UPI link; URL-encoded; ≤ the `wa.me` length limit with a graceful truncation | 3 | NTF-02-04 | FR |
| TSK-NTF-03-02 | Return `{wa_url, text}` wherever a share is offered | BE | `~@be/ledger/views/reminder.py` `~@be/parties/views/party.py` | Statement, invoice and reminder shares all return the same shape | 2 | 01 | 22.5 |
| TSK-NTF-03-03 | Build `buildWhatsAppUrl` on the client | FE | `+@src/utils/share.ts` | Falls back to the Web Share API when available, then `wa.me`, then copy-to-clipboard; each path tested | 2 | 01 | §7 |
| TSK-NTF-03-04 | Build the shared share sheet | FE | `+@fe/notifications/components/ShareSheetContent.tsx` | WhatsApp, SMS, copy link and print; used by statements, invoices, receipts and reminders | 2 | 03, CHS-DS-10 | §7 |

**4 tasks, 9.0 points.**

#### LED-05 — Collection date & reminder buckets

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-LED-05-01 | Implement `GET /ledger/summary` | BE | `+@be/ledger/selectors/summary.py` `+@be/ledger/views/summary.py` | Receivable, payable, `due_today`, `overdue` and `upcoming_7d` each as `{count, amount}` computed in SQL | 3 | LED-01-05 | 22.5 |
| TSK-LED-05-02 | Wire the `collection` filter to real data | BE | `~@be/parties/filters.py` | `collection=today|overdue|upcoming` filters on `collection_date` in tenant time | 1 | 01 | PTY-02 FR |
| TSK-LED-05-03 | Add quick-set of the collection date | BE | `~@be/parties/services/crud.py` | A dedicated `PATCH` path that audits only this field, so the khata header can set it in one tap | 1 | 02 | FR |
| TSK-LED-05-04 | Build the bucket tabs and the collection quick-set | FE | `+@fe/ledger/components/CollectionBuckets.tsx` `~@fe/parties/components/PartyHeaderCard.tsx` | `UbTabs` with counts; the header offers Today/Tomorrow/Friday/Pick | 3 | 03, CHS-DS-07 | §7 |

**4 tasks, 8.0 points.**

#### LED-06 — Manual reminder

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-LED-06-01 | Create `ledger_reminder` | DB | `+@be/ledger/migrations/0002_reminder.py` | Columns per Part 21 §21.3.4; `U(party_id, due_on, kind) WHERE kind IN ('auto_d1','auto_d0')`; two indexes | 2 | LED-01-01 | 21.3.4 |
| TSK-LED-06-02 | Implement the `Reminder` model and statuses | BE | `+@be/ledger/models.py` `~@be/ledger/constants.py` | Six statuses and five channels exactly per canon §0.7 | 1 | 01 | 0.7 |
| TSK-LED-06-03 | Implement `create_reminder()` and `send_reminder()` | BE | `+@be/ledger/services/reminder.py` | Snapshots the balance at send; `whatsapp_manual` returns `{wa_url, text}` and logs `sent`; `sms` enqueues and returns 202; an unconfigured channel returns 409 `channel_not_configured` | 3 | 02, NTF-03-01 | 22.5, FR |
| TSK-LED-06-04 | Implement `POST /reminders/bulk` | BE | `~@be/ledger/views/reminder.py` | Returns a list of `{party_id, wa_url}` for manual channels; capped at the selection cap; one audit row per reminder | 2 | 03 | 22.5 |
| TSK-LED-06-05 | Implement the reminder endpoints | BE | `+@be/ledger/views/reminder.py` `+@be/ledger/serializers/reminder.py` `~@be/ledger/urls.py` | `GET /reminders`, `POST /reminders`, `PATCH /{id}`, `POST /{id}/send` per §22.5 | 2 | 04 | 22.5 |
| TSK-LED-06-06 | Write the reminder service, slice and thunk | FE | `+@fe/ledger/api/reminderService.ts` `+@fe/ledger/redux/reminderSlice.ts` `+@fe/ledger/redux/reminderThunk.ts` | Bucket-scoped lists with selection; bulk result held for the sequential send flow | 3 | 05 | 19.3 |
| TSK-LED-06-07 | Build the reminders screen | FE | `+@fe/ledger/components/RemindersPageContent.tsx` `+@app/(app)/ledger/reminders/page.tsx` | Three bucket tabs with counts and amounts, multi-select, and the ten states | 5 | 06 | §7, §9 |
| TSK-LED-06-08 | Build the sequential bulk-send flow | FE | `+@fe/ledger/components/BulkReminderFlow.tsx` | One user gesture per `wa.me` open with a progress list and "mark all sent"; popup blockers never break the flow | 3 | 07 | §6 |
| TSK-LED-06-09 | Build the reminder composer | FE | `+@fe/ledger/components/ReminderComposerDrawer.tsx` | Channel, due date, template preview with the resolved balance, and an editable note | 3 | 07 | §7 |
| TSK-LED-06-10 | Show reminders on the party timeline | FE | `~@fe/ledger/components/LedgerTimelineRow.tsx` | A reminder row shows channel, snapshot balance and outcome | 1 | 09 | §7 |
| TSK-LED-06-11 | E2E: bulk reminder | Test | `+e2e/tests/reminders.spec.ts` | `[T-LED-06-*]` select two overdue parties, send, assert two `wa.me` URLs containing the balance and the UPI link | 2 | 10 | AC |

**11 tasks, 27.0 points.**

#### LED-07 — Automated reminders (SMS, D-1 / D0)

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-LED-07-01 | Implement the due-set selector | BE | `+@be/ledger/selectors/due.py` | Parties whose `collection_date` is tomorrow (D-1) or today (D0) with a non-zero receivable, `sms_opt_in=true` and a mobile | 3 | LED-05-01 | FR |
| TSK-LED-07-02 | Implement `send_auto_reminders()` | BE | `+@be/ledger/services/auto_reminder.py` | Creates `auto_d1`/`auto_d0` reminders and enqueues sends; the partial unique index makes a second run a no-op | 3 | 01, LED-06-03 | FR, BR |
| TSK-LED-07-03 | Register the scheduled job | BE | `~@be/ledger/tasks.py` | `ledger.send_auto_reminders` with a `scheduled_key` of `ledger.send_auto_reminders:<date>`; cron line added to the scheduler | 2 | 02, CHS-JOB-06 | ADR-012, 29.3 |
| TSK-LED-07-04 | Gate on the tenant setting and provider configuration | BE | `~@be/ledger/services/auto_reminder.py` | `ledger.auto_sms=off` skips entirely; an unconfigured provider logs `skipped` and the job still succeeds | 2 | 03 | FR, 12.1 |
| TSK-LED-07-05 | Build the auto-reminder settings panel | FE | `+@fe/settings/components/ReminderSettings.tsx` | Toggle, template editing, and a banner explaining the inert state when no provider is configured | 3 | 04 | §7, §9 |
| TSK-LED-07-06 | Prove the double run is harmless | Test | `+@be/ledger/tests/test_auto_reminder_idempotent.py` | `[T-LED-07-*]` running the job twice for the same date creates one reminder per party per kind | 2 | 03 | 12.8 |

**6 tasks, 15.0 points.**

#### LED-08 — Transaction SMS to party

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-LED-08-01 | Implement the entry-SMS handler | BE | `~@be/notifications/tasks.py` `+@be/ledger/services/entry_sms.py` | Consumes the job LED-01 enqueues; chooses `LEDGER_ENTRY_GAVE`/`GOT`; renders balance and shop name; respects `sms_opt_in`, `consent_at` and the tenant setting | 3 | LED-01-05, NTF-02-06 | FR, §17 |
| TSK-LED-08-02 | Handle the no-mobile and opted-out cases | BE | `~@be/ledger/services/entry_sms.py` | A party with no mobile or `sms_opt_in=false` produces a `skipped` log row and no error | 1 | 01 | EC-5 |
| TSK-LED-08-03 | Surface message status on the timeline row | FE | `~@fe/ledger/components/LedgerTimelineRow.tsx` | A small caption shows sent / failed / skipped with the reason on tap | 2 | 01 | §9 |
| TSK-LED-08-04 | Build the party consent controls | FE | `~@fe/parties/components/PartyAdvancedSection.tsx` | `sms_opt_in` with `consent_source` and `consent_at` recorded; DPDP wording in both locales | 2 | 03 | 21.3.3, 12.8 |

**4 tasks, 8.0 points.**

**`EPIC-COLLECTIONS` totals: 43 tasks, 97.0 points**; the Sprint 5 commitment is 50.0, with the balance shared with `EPIC-CHASSIS` (`CHS-JOB`, `CHS-DS`) and with Sprint 4's already-merged ledger primitives.

---

### 33.5.6 `EPIC-INVENTORY` — items, stock movements and valuation (Sprint 6)

**Claim.** Items exist with prices, tax and units; every quantity change is an immutable signed movement; weighted-average cost is exact; `recalc_stock` finds zero drift.

#### INV-04 — Categories & units masters

Built first within the epic because the item form depends on both.

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-INV-04-01 | Create `inventory_category`, `inventory_unit`, `inventory_location` | DB | `+@be/inventory/migrations/0001_initial.py` | `U(tenant_id, parent_id, name) WHERE deleted_at IS NULL`; `U(tenant_id, code)` on units and locations; system units carry `tenant_id NULL` | 2 | CHS-TEN-05 | 21.3.6 |
| TSK-INV-04-02 | Implement the `Category`, `Unit` and `Location` models | BE | `+@be/inventory/models/{category,unit,location}.py` | Category nesting capped at one level by a `clean()` and a constraint; `allow_decimal` on units | 2 | 01 | 21.3.6 |
| TSK-INV-04-03 | Implement the master services and selectors | BE | `+@be/inventory/services/masters.py` `+@be/inventory/selectors/masters.py` | Create, rename and archive with audit; a unit in use cannot be deleted | 2 | 02 | FR |
| TSK-INV-04-04 | Implement `GET/POST /categories` and `/units` | BE | `+@be/inventory/views/masters.py` `+@be/inventory/serializers/masters.py` `+@be/inventory/urls.py` | Shapes per §22.6; system units are read-only | 2 | 03 | 22.6 |
| TSK-INV-04-05 | Auto-create the `MAIN` location at onboarding | BE | `~@be/platform/services/tenant.py` | Every new tenant has exactly one default location; the concept is hidden in the UI until Phase 2 | 1 | 02, PLT-03-04 | 21.3.6 |
| TSK-INV-04-06 | Build the masters service, slice and thunk | FE | `+@fe/inventory/api/masterService.ts` `+@fe/inventory/redux/masterSlice.ts` `+@fe/inventory/redux/masterThunk.ts` | Categories and units cached and invalidated on create | 2 | 04 | 19.3.6 |
| TSK-INV-04-07 | Build the inline-create comboboxes | FE | `+@fe/inventory/components/{CategoryCombobox,UnitCombobox}.tsx` | "Create «x»" as the last option; the new value is selected without closing the item form | 3 | 06, CHS-DS-09 | FR |
| TSK-INV-04-08 | Build the masters management screen | FE | `+@fe/inventory/components/MastersPageContent.tsx` `+@app/(app)/settings/masters/page.tsx` | Two `UbDataGrid`s with inline rename and archive | 2 | 07 | §7 |

**8 tasks, 16.0 points.**

#### INV-01 — Create/edit item

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-INV-01-01 | Create `inventory_item` and `inventory_item_stock` | DB | `~@be/inventory/migrations/0001_initial.py` | Every column of Part 21 §21.3.6; `U(tenant_id, sku)` and `U(tenant_id, barcode)` partial on `deleted_at IS NULL`; GIN trigram on name; `U(item_id, variant_id, location_id)` on stock | 3 | INV-04-01 | 21.3.6 |
| TSK-INV-01-02 | Implement the `Item` and `ItemStock` models | BE | `+@be/inventory/models/{item,stock}.py` | `ItemType`, `ItemStatus` as `TextChoices`; `track_stock` forced false for services | 2 | 01 | 21.3.6, 0.7 |
| TSK-INV-01-03 | Implement auto-SKU generation | BE | `+@be/inventory/services/sku.py` | Slug of the name plus three digits, unique per tenant, retried on collision; an explicit SKU is never overwritten | 2 | 02 | 22.6 |
| TSK-INV-01-04 | Implement `create_item()` and `update_item()` | BE | `+@be/inventory/services/crud.py` | Duplicate SKU or barcode → 400 with the field; tax code validated against `tax_rate`; one audit row with changed fields | 3 | 03 | FR, §11 |
| TSK-INV-01-05 | Implement the `track_stock` transition guards | BE | `~@be/inventory/services/crud.py` | false→true requires opening stock; true→false requires `on_hand = 0` else 409 | 2 | 04 | 22.6 |
| TSK-INV-01-06 | Implement the item serializers | BE | `+@be/inventory/serializers/item.py` | Read, list and write separate; `on_hand` and `stock_status` on the list shape; money and quantity as strings | 2 | 04 | 22.6, R6.1 |
| TSK-INV-01-07 | Implement `ItemViewSet` create/update/retrieve | BE | `+@be/inventory/views/item.py` `+@be/inventory/permissions.py` `~@be/inventory/urls.py` | `inventory.item.write` enforced; module gate returns 403 `module_disabled` when inventory is off | 2 | 06 | 22.6, 0.9 |
| TSK-INV-01-08 | Implement item image upload | BE | `~@be/inventory/views/item.py` `~@be/common/storage.py` | Stored through `files`; resized; referenced by `image_attachment_id` | 2 | 07, CHS-TEN-20 | FR |
| TSK-INV-01-09 | Write `itemService.ts` and `item.types.ts` | FE | `+@fe/inventory/api/itemService.ts` `+@fe/inventory/types/item.types.ts` | Quantity and money stay strings end to end | 2 | 07 | R-TS-7 |
| TSK-INV-01-10 | Write `itemFormSlice.ts` and `itemFormThunk.ts` | FE | `+@fe/inventory/redux/itemFormSlice.ts` `+@fe/inventory/redux/itemFormThunk.ts` | Three lifecycle cases; invalidation map updated | 2 | 09 | R-RX-5 |
| TSK-INV-01-11 | Write `itemSchemas.ts` | FE | `+@fe/inventory/validation/itemSchemas.ts` | HSN 4/6/8 digits; prices non-negative; reorder point requires `track_stock`; unit required for goods | 2 | CHS-I18N-04 | §10 |
| TSK-INV-01-12 | Build `ItemFormDrawer` | FE | `+@fe/inventory/components/ItemFormDrawer.tsx` `+@fe/inventory/hooks/useItemForm.ts` | Type toggle hides stock fields for services; tax-rate select; HSN search; image upload; server errors mapped to fields | 5 | 10, 11, INV-04-07 | §7 |
| TSK-INV-01-13 | Build the HSN search field | FE | `+@fe/inventory/components/HsnSearchField.tsx` | `GET /taxes/hsn?q=` debounced; selecting an HSN suggests its default tax code | 2 | 12, CHS-SEED-07 | 22.12 |
| TSK-INV-01-14 | E2E: create goods and service items | Test | `+e2e/tests/item-create.spec.ts` | `[T-INV-01-*]` both types round-trip; duplicate SKU shows the field error | 2 | 13 | AC |

**14 tasks, 33.0 points.**

#### INV-05 — Opening stock and the movement engine

The movement engine is specified here because opening stock is its first caller; every later movement type reuses it unchanged.

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-INV-05-01 | Create `inventory_stock_movement` with its indexes | DB | `~@be/inventory/migrations/0001_initial.py` | Columns per Part 21 §21.3.6; `CHECK qty <> 0`; three indexes | 2 | INV-01-01 | 21.3.6 |
| TSK-INV-05-02 | Install the `forbid_update_delete` trigger | DB | `~@be/inventory/migrations/0001_initial.py` | Any `UPDATE` or `DELETE` on the table raises; there are no mutable fields | 2 | 01 | 21.1-2 |
| TSK-INV-05-03 | Implement the `StockMovement` model and `MovementType` | BE | `+@be/inventory/models/movement.py` `~@be/inventory/constants.py` | Twelve movement types matching Part 21 §21.3.6 exactly | 1 | 02 | 21.3.6 |
| TSK-INV-05-04 | Implement `post_movement()` | BE | `+@be/inventory/services/stock.py` | Locks `inventory_item_stock` (L2, ordered by `item_id`), inserts the movement, updates `on_hand`, writes `on_hand_after` | 3 | 03 | L2, BR |
| TSK-INV-05-05 | Implement the weighted-average rule | BE | `~@be/inventory/services/stock.py` | `new_avg = (on_hand×avg + qty×unit_cost)/(on_hand+qty)`; when `on_hand ≤ 0` before an inbound, `new_avg = unit_cost`; outbound never changes avg and snapshots the current avg as COGS | 3 | 04 | 21.3.6 normative |
| TSK-INV-05-06 | Implement the negative-stock guard | BE | `~@be/inventory/services/stock.py` | Raises `insufficient_stock` with per-line shortfall unless `inventory.allow_negative_stock` | 2 | 05 | 22.6, INV-06 BR |
| TSK-INV-05-07 | Implement `post_opening_stock()` | BE | `+@be/inventory/services/opening.py` | One `opening` movement per item per location, enforced; `as_of` date honoured | 2 | 06 | FR |
| TSK-INV-05-08 | Implement `manage.py recalc_stock` | BE | `+@be/common/management/commands/recalc_stock.py` | Recomputes `on_hand` and `avg_cost` from movements alone and reports drift; `--fix` audits its corrections | 3 | 05 | 21.1-3, 12.5 |
| TSK-INV-05-09 | Prove the weighted average paisa-exact | Test | `+@be/inventory/tests/test_avg_cost.py` | A hand-computed fixture table of 20 sequences including the `on_hand ≤ 0` inbound and a zero-cost inbound | 3 | 05 | 21.3.6, AC |
| TSK-INV-05-10 | Prove ordered locking prevents deadlock | Test | `+@be/inventory/tests/test_lock_order.py` | Two concurrent adjustments touching the same two items in opposite line orders both complete | 2 | 04 | L2, 28.2.7 |
| TSK-INV-05-11 | Build the opening-stock section of the item form | FE | `~@fe/inventory/components/ItemFormDrawer.tsx` | Quantity, unit cost and as-of date, shown only when `track_stock` is on and only on create | 2 | INV-01-12 | §7 |

**11 tasks, 25.0 points.**

#### INV-02 — Item list & search

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-INV-02-01 | Implement `ItemFilterSet` | BE | `+@be/inventory/filters.py` | `q`, `type`, `category_id`, `stock=low|out|in`, `status` declared; ordering whitelisted to name, `-updated_at`, `on_hand` | 2 | INV-01-07 | 22.6 |
| TSK-INV-02-02 | Implement `list_items()` with stock joins | BE | `+@be/inventory/selectors/item.py` | Joins `inventory_item_stock` for `on_hand` and derives `stock_status`; query budget asserted at two page sizes | 3 | 01 | 22.6, R5.3 |
| TSK-INV-02-03 | Implement `meta.totals` with stock value | BE | `~@be/inventory/selectors/item.py` | `items` and `stock_value` computed in SQL over the filtered set | 2 | 02 | 22.6 |
| TSK-INV-02-04 | Implement `GET /items/lookup?barcode=` | BE | `~@be/inventory/views/item.py` | Exact barcode match returns one item or 404; measured under 50 ms at 5,000 items | 2 | 02 | 22.6 |
| TSK-INV-02-05 | Write `itemListSlice.ts` and `itemListThunk.ts` | FE | `+@fe/inventory/redux/itemListSlice.ts` `+@fe/inventory/redux/itemListThunk.ts` | Filter state in the URL; abortable fetches | 2 | INV-01-09 | 19.3 |
| TSK-INV-02-06 | Write the list constants and view-model | FE | `+@fe/inventory/constants/itemFilters.ts` `+@fe/inventory/view-model/itemDisplay.ts` | `stockBadgeTone(item)` returns ok / low / out with a label, never colour alone | 1 | 05 | §7, §8 |
| TSK-INV-02-07 | Build the item list screen | FE | `+@fe/inventory/components/ItemListPageContent.tsx` `+@fe/inventory/components/ItemListRow.tsx` `~@app/(app)/items/page.tsx` | One column factory for grid and cards; filters; all ten states | 5 | 06, CHS-DS-08 | §7, §9 |
| TSK-INV-02-08 | Implement barcode paste and scanner-typing detection | FE | `+@fe/inventory/hooks/useBarcodeInput.ts` | Eight or more characters typed in under 50 ms triggers a lookup rather than a search | 2 | 07 | FR, SAL-02 F4 |
| TSK-INV-02-09 | Write `useItemSearch` for reuse | FE | `+@fe/inventory/hooks/useItemSearch.ts` | The scanner-aware async combobox source exported for sales and purchases; a lint rule forbids a second implementation | 2 | 08 | 19.2.4 |

**9 tasks, 21.0 points.**

#### INV-03 — Item detail & movement history

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-INV-03-01 | Implement `get_item()` with stock rows | BE | `~@be/inventory/selectors/item.py` | Returns item plus `stock[]` per location with `on_hand`, `avg_cost`, `value`, plus `movements_recent[10]` | 2 | INV-05-04 | 22.6 |
| TSK-INV-03-02 | Implement `GET /items/{id}/movements` | BE | `+@be/inventory/selectors/movement.py` `~@be/inventory/views/item.py` | Cursor-paginated with `date_from`, `date_to`, `type`; source document links resolved without N+1 | 3 | 01 | 22.6 |
| TSK-INV-03-03 | Write the detail slice, thunk and service additions | FE | `+@fe/inventory/redux/itemDetailSlice.ts` `+@fe/inventory/redux/itemDetailThunk.ts` | Movements are a cursor list inside the detail slice | 2 | 02 | 19.3 |
| TSK-INV-03-04 | Build the item detail screen | FE | `+@fe/inventory/components/ItemDetailPageContent.tsx` `+@fe/inventory/components/ItemStockCard.tsx` `~@app/(app)/items/[id]/page.tsx` | Prices, on-hand, valuation, and the movement timeline with reasons and document links | 5 | 03 | §7 |
| TSK-INV-03-05 | Build the movement row | FE | `+@fe/inventory/components/MovementRow.tsx` | Signed quantity with tone and label, running on-hand, unit cost, reason, actor and source link | 2 | 04 | §7 |

**5 tasks, 14.0 points.**

#### INV-06 — Stock adjustment

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-INV-06-01 | Create `inventory_stock_adjustment` | DB | `+@be/inventory/migrations/0002_adjustment.py` | Header with `number`, `adjustment_date`, `location_id`, `reason`, `note`, `status='posted'` | 1 | INV-05-01 | 21.3.6 |
| TSK-INV-06-02 | Implement the adjustment model and reason set | BE | `+@be/inventory/models/adjustment.py` `~@be/inventory/constants.py` | Five reasons: damage, theft, count, personal use, other | 1 | 01 | FR |
| TSK-INV-06-03 | Implement `post_adjustment()` | BE | `+@be/inventory/services/adjustment.py` | Allocates a number, sorts lines by `item_id` before locking (L2), posts `adjust_in`/`adjust_out` movements, writes one audit row with the lines | 3 | 02, INV-05-06 | BR, L2 |
| TSK-INV-06-04 | Implement `POST /stock-adjustments` | BE | `+@be/inventory/views/adjustment.py` `+@be/inventory/serializers/adjustment.py` `~@be/inventory/urls.py` | 201 with `movements[]`; 409 `insufficient_stock` carrying `details.lines[i]`; `inventory.stock.adjust` enforced | 3 | 03, CHS-IDEM-03 | 22.6, §12 |
| TSK-INV-06-05 | Write the adjustment service, slice, thunk and schema | FE | `+@fe/inventory/api/adjustmentService.ts` `+@fe/inventory/redux/adjustmentSlice.ts` `+@fe/inventory/redux/adjustmentThunk.ts` `+@fe/inventory/validation/adjustmentSchemas.ts` | Line array validated; quantity may be negative but never zero | 3 | 04 | §10 |
| TSK-INV-06-06 | Build the adjustment screen | FE | `+@fe/inventory/components/AdjustmentPageContent.tsx` `+@app/(app)/stock/adjustments/page.tsx` | `UbLineItemsEditor` with item search, signed quantity, optional cost, a reason select and a note | 5 | 05, CHS-DS-11 | §7 |
| TSK-INV-06-07 | Render per-line shortfall errors | FE | `+@fe/inventory/components/AdjustmentShortfallDialog.tsx` | The 409's `details.lines[i]` maps to the row that caused it, with the available quantity shown | 2 | 06 | §9 |
| TSK-INV-06-08 | E2E: adjust with a reason | Test | `+e2e/tests/stock-adjustment.spec.ts` | `[T-INV-06-*]` −2 damage succeeds and appears in the movement history with the reason and the actor; an over-adjustment is refused | 2 | 07 | AC |

**8 tasks, 20.0 points.**

#### INV-07 — Low-stock alerts

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-INV-07-01 | Add the crossing-state field | DB | `+@be/inventory/migrations/0003_low_stock_state.py` | `inventory_item_stock.below_reorder boolean NN default false` | 1 | INV-05-01 | FR |
| TSK-INV-07-02 | Detect the crossing in `post_movement()` | BE | `~@be/inventory/services/stock.py` | The notification fires only on the transition from above to at-or-below the reorder point, never on every scan or every movement | 3 | 01, NTF-01-02 | FR |
| TSK-INV-07-03 | Implement the nightly scan job | BE | `~@be/inventory/tasks.py` | `inventory.scan_low_stock` catches items whose reorder point changed rather than whose stock moved; idempotent per day | 2 | 02, CHS-JOB-06 | FR, ADR-012 |
| TSK-INV-07-04 | Implement `GET /stock/low` | BE | `+@be/inventory/views/stock.py` `~@be/inventory/selectors/item.py` | Items at or below the reorder point with the shortfall and the last purchase cost | 2 | 03 | 22.6 |
| TSK-INV-07-05 | Build the low-stock screen and the dashboard tile | FE | `+@fe/inventory/components/LowStockPageContent.tsx` `+@app/(app)/stock/low/page.tsx` | Sorted by shortfall; each row offers "Create purchase bill"; the dashboard tile links here | 3 | 04 | §7, RPT-01 |

**5 tasks, 11.0 points.**

#### INV-08 — Stock summary & valuation

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-INV-08-01 | Implement the stock-summary selector | BE | `+@be/inventory/selectors/summary.py` | Per item `on_hand`, `avg_cost`, `value`, grouped by category with totals, all aggregated in SQL | 3 | INV-05-05 | 22.6, R5.4 |
| TSK-INV-08-02 | Implement `as_of` valuation | BE | `~@be/inventory/selectors/summary.py` | Valuation at a past date is computed from movements up to that date, not from the cache | 3 | 01 | 22.11 |
| TSK-INV-08-03 | Implement `GET /stock/summary` | BE | `~@be/inventory/views/stock.py` | Filters by category, location and `as_of`; `reports.basic.read` enforced | 2 | 02 | 22.6 |
| TSK-INV-08-04 | Reconcile summary against movements | Test | `+@be/inventory/tests/test_valuation_reconcile.py` | Summary value equals a naive recomputation from movements for every item on the 10,000-movement fixture | 2 | 03 | 12.5 |
| TSK-INV-08-05 | Build the stock summary screen | FE | `+@fe/inventory/components/StockSummaryPageContent.tsx` `+@app/(app)/reports/stock-summary/page.tsx` | Grouped grid with category subtotals and a tenant total; export button wired to IMP-02 | 3 | 03 | §7, RPT-06 |

**5 tasks, 13.0 points.**

**`EPIC-INVENTORY` totals: 65 tasks, 153.0 points**; the Sprint 6 commitment is 50.0, with the movement engine's test tasks and `UbLineItemsEditor` shared with `EPIC-CHASSIS` and Sprint 7.

---

### 33.5.7 `EPIC-SALES-CORE` — the tax invoice (Sprints 7–8)

**Claim.** A Rule 46-compliant tax invoice computes CGST/SGST or IGST by slab as the user types, issues atomically with a number, a stock deduction and a ledger post, prints on A4 and 80 mm with branding and a UPI QR, and survives a browser crash as a draft.

#### SAL-02 — Tax invoice / bill of supply

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-SAL-02-01 | Create `sales_document` and `sales_document_line` | DB | `+@be/sales/migrations/0001_initial.py` | Every column of Part 21 §21.3.7; `U(tenant_id, kind, fy_label, number)`; four indexes including the partial on `due_on` | 3 | INV-01-01, PTY-01-01 | 21.3.7 |
| TSK-SAL-02-02 | Add `version` for optimistic concurrency | DB | `+@be/sales/migrations/0002_add_version_to_document.py` | `PATCH` without a matching `version` returns 409 `stale_version` | 1 | 01 | 22.1, R7.8 |
| TSK-SAL-02-03 | Implement the `SalesDocument` and `SalesDocumentLine` models | BE | `+@be/sales/models/{document,line}.py` `+@be/sales/models/__init__.py` `+@be/sales/constants.py` | `SalesKind`, `InvoiceStatus`, `EstimateStatus`, `CreditNoteStatus`, `DiscountType` as `TextChoices` matching canon §0.7 | 3 | 02 | 0.7, R3.4 |
| TSK-SAL-02-04 | Implement `SalesDocumentQuerySet` | BE | `+@be/sales/managers.py` | `.invoices()`, `.open()`, `.overdue()`, `.totals()` | 2 | 03 | 22.7 |
| TSK-SAL-02-05 | Implement the tax-rate resolver | BE | `+@be/tax/selectors/rate.py` | Lookup by `(code, document_date)` returns the row effective on that date; a pre-2025-09-21 date resolves `GST12` | 2 | CHS-SEED-05 | 21.3.5, 13.7 |
| TSK-SAL-02-06 | Write the shared tax fixture table | Test | `+@be/sales/tests/fixtures/tax_cases.json` `+frontend/src/tests/fixtures/taxEngine.cases.json` | One file, two copies asserted byte-identical by a CI check; covers every slab, intra/inter state, inclusive and exclusive, line and document discount, cess, round-off, reverse charge and the rate boundary | 3 | 05 | BR-1…BR-10, 19.2.4 |
| TSK-SAL-02-07 | Implement `compute_document_totals()` | BE | `+@be/sales/services/tax_engine.py` | Pure, no database; every row of the fixture passes paisa-exact; half-up rounding at line then document level | 8 | 06 | BR-1…BR-9, 20.7.3 |
| TSK-SAL-02-07.1 | — subtask: line taxable value with inclusive handling | BE | `~@be/sales/services/tax_engine.py` | `tax_inclusive=true` back-computes the taxable value before discount | — | 07 | BR |
| TSK-SAL-02-07.2 | — subtask: document-discount apportionment | BE | `~@be/sales/services/tax_engine.py` | Apportioned across lines in proportion to taxable value with the remainder given to the largest line so the sum is exact | — | 07 | BR, `allocate_proportional` |
| TSK-SAL-02-07.3 | — subtask: intra vs inter state split | BE | `~@be/sales/services/tax_engine.py` | `is_inter_state` derived from supplier state vs place of supply; CGST+SGST halves sum exactly to the slab | — | 07 | BR |
| TSK-SAL-02-07.4 | — subtask: round-off to the rupee | BE | `~@be/sales/services/tax_engine.py` | `round_off` recorded separately and `grand_total` is a whole rupee when the setting is on | — | 07 | BR |
| TSK-SAL-02-08 | Implement `create_draft()` and `update_draft()` | BE | `+@be/sales/services/draft.py` | Server recomputes every total; client totals are ignored; `PATCH` only while `draft` and only with a matching `version` | 3 | 07 | FR, BR-16, canon 0.11-3 |
| TSK-SAL-02-09 | Implement `build_party_snapshot()` | BE | `+@be/sales/services/snapshot.py` | Name, address, GSTIN and state frozen at issue so editing the party never changes an issued document | 2 | 08 | 21.3.7 |
| TSK-SAL-02-10 | Implement `check_rule46()` | BE | `+@be/sales/services/rule46.py` | Returns `{passed, issues[]}` for the nine mandatory blocks; surfaced as `meta.rule46` | 2 | 09 | FR, §7 |
| TSK-SAL-02-11 | Implement `issue_invoice()` | BE | `+@be/sales/services/issue.py` | The twelve ordered side effects of BR-16 in one transaction; locks in the L0 order; late number allocation per L4 | 8 | 10, PLT-03-07, INV-05-06, LED-01-05 | BR-16, L1–L6 |
| TSK-SAL-02-11.1 | — subtask: validate, resolve rates, compute totals | BE | `~@be/sales/services/issue.py` | Totals recomputed at issue, not trusted from the draft | — | 11 | BR-16 |
| TSK-SAL-02-11.2 | — subtask: stock check and `sale_out` movements in `item_id` order | BE | `~@be/sales/services/issue.py` | `sorted(lines, key=lambda l: str(l.item_id))` before locking, with the L2 comment | — | 11 | L2, 22.7 |
| TSK-SAL-02-11.3 | — subtask: credit-limit check for credit sales | BE | `~@be/sales/services/issue.py` | Calls `check_credit_limit()`; `block` returns 409 unless overridden by a permitted actor | — | 11, PTY-06-01 | PTY-06 |
| TSK-SAL-02-11.4 | — subtask: allocate the number late, hold the lock briefly | BE | `~@be/sales/services/issue.py` | Sequence locked after validation and stock checks; the lock span is asserted by a timing test | — | 11 | L4 |
| TSK-SAL-02-11.5 | — subtask: post the ledger debit with `source_type='sales_document'` | BE | `~@be/sales/services/issue.py` | The entry links back and appears on the party timeline | — | 11 | LED-10 |
| TSK-SAL-02-11.6 | — subtask: record the optional immediate payment by deferred import | BE | `~@be/sales/services/issue.py` | `from apps.payments.services.record import record_payment` inside the function with the rule-D5 comment | — | 11, PAY-01-03 | D5 |
| TSK-SAL-02-12 | Implement the kind guard for GST type | BE | `~@be/sales/services/draft.py` | Composition tenants are forced to `bill_of_supply`; unregistered tenants are refused `invoice` with 400 `kind_not_allowed` | 2 | 08 | 22.7 |
| TSK-SAL-02-13 | Implement the document serializers | BE | `+@be/sales/serializers/{document_read,document_write,line,actions}.py` | The §22.7 shape reproduced exactly including every total and `payments[]`; read and write classes separate | 5 | 11 | 22.7, R6.1 |
| TSK-SAL-02-14 | Implement `InvoiceViewSet` | BE | `+@be/sales/views/invoice.py` `+@be/sales/urls.py` `+@be/sales/permissions.py` | `GET`/`POST`/`PATCH`/`DELETE` plus the `issue` action; `?issue=true` on create; `@idempotent` on both creating paths | 3 | 13, CHS-IDEM-03 | 22.7 |
| TSK-SAL-02-15 | Prove numbering under concurrency | Test | `+@be/sales/tests/test_numbering.py` | `[T-SAL-02-*]` two simultaneous issues produce consecutive numbers with no gap and no duplicate; FY rollover correct | 3 | 14 | 12.5, 28.2.7 |
| TSK-SAL-02-16 | Prove the issue side effects and their order | Test | `+@be/sales/tests/test_issue.py` | All twelve effects asserted, including that no effect occurs when a later one fails | 3 | 14 | BR-16 |
| TSK-SAL-02-17 | Write `salesService.ts` and the invoice types | FE | `+@fe/sales/api/salesService.ts` `+@fe/sales/types/invoice.types.ts` `+@fe/sales/types/invoiceForm.types.ts` | The RHF form shape uses strings, not decimals; wire and domain shapes are separate types | 3 | 14 | R-TS-7, 19.2.4 |
| TSK-SAL-02-18 | Implement `view-model/taxEngine.ts` | FE | `+@fe/sales/view-model/taxEngine.ts` | Every row of `taxEngine.cases.json` passes; a divergence from the backend fails CI on both sides | 5 | 06, 17 | 19.2.4, R-F-8 |
| TSK-SAL-02-19 | Write `invoiceEditorSlice.ts` and `invoiceEditorThunk.ts` | FE | `+@fe/sales/redux/invoiceEditorSlice.ts` `+@fe/sales/redux/invoiceEditorThunk.ts` | The slice holds server-derived state only — document, version, warnings, rule46, idempotency key, saving/issuing; it never mirrors keystrokes | 5 | 17 | 19.2.4, 19.5.4 |
| TSK-SAL-02-20 | Write `invoiceSchemas.ts` | FE | `+@fe/sales/validation/invoiceSchemas.ts` | Header, line and payment schemas composed from `useValidationSchemas()`; at least one line required; quantity > 0 | 3 | CHS-I18N-04 | §10 |
| TSK-SAL-02-21 | Write the sales constants | FE | `+@fe/sales/constants/{invoiceKinds,invoiceKeyboardMap,invoiceStatuses,placeOfSupply,invoiceDefaults}.ts` | 36 state codes with `en`/`hi` names; F2–F8, Ctrl+S, Ctrl+Enter mapped; status → tone map | 2 | 17 | §7, 19.2.4 |
| TSK-SAL-02-22 | Implement `useInvoiceEditor` | FE | `+@fe/sales/hooks/useInvoiceEditor.ts` | Orchestrates the RHF form, the field array, the totals preview, autosave and issue; declared return type; one concern per sibling hook | 5 | 19, 20 | 19.2.4, R-H-5 |
| TSK-SAL-02-23 | Implement `useInvoiceLines` and `useInvoiceTotals` | FE | `+@fe/sales/hooks/{useInvoiceLines,useInvoiceTotals}.ts` | Field-array helpers with focus movement; totals memoised over one scoped `useWatch` | 3 | 22 | R-F-6 |
| TSK-SAL-02-24 | Build `InvoiceLinesSection`, `InvoiceLineRow`, `InvoiceLineMobileCard` | FE | `+@fe/sales/components/editor/{InvoiceLinesSection,InvoiceLineRow,InvoiceLineMobileCard}.tsx` | One RHF `Controller` per editable cell; rows memoised and keyed on the RHF field id; the mobile card is the same state in card form | 5 | 23, CHS-DS-11 | §7, R-F-6 |
| TSK-SAL-02-25 | Build `InvoiceItemSearch` | FE | `+@fe/sales/components/editor/InvoiceItemSearch.tsx` | Uses `useItemSearch`; a scanned barcode adds the line directly; price and tax default from the item | 3 | 24, INV-02-09 | F4 |
| TSK-SAL-02-26 | Build `InvoicePartySection` and `InvoiceMetaSection` | FE | `+@fe/sales/components/editor/{InvoicePartySection,InvoiceMetaSection}.tsx` | `usePartySearch` combobox plus walk-in fields; date, due date, place of supply defaulting party → tenant, reverse charge | 3 | 24, PTY-02-15 | F2, FR |
| TSK-SAL-02-27 | Build `InvoiceTotalsPanel` and `InvoiceDocumentDiscount` | FE | `+@fe/sales/components/editor/{InvoiceTotalsPanel,InvoiceDocumentDiscount}.tsx` | Every number carries its baseline; totals are labelled a preview until the server responds | 3 | 24, CHS-DS-11 | F6, R-F-8 |
| TSK-SAL-02-28 | Build `InvoiceRule46Checklist` | FE | `+@fe/sales/components/editor/InvoiceRule46Checklist.tsx` | Nine checks with pass/fail and a jump-to-field action on each failure | 2 | 27 | §7 |
| TSK-SAL-02-29 | Build `InvoiceStockShortDialog` and `InvoiceCreditLimitBanner` | FE | `+@fe/sales/components/editor/{InvoiceStockShortDialog,InvoiceCreditLimitBanner}.tsx` | Per-item shortfall listed; the credit banner reuses `CreditLimitBanner` with warn / block / override | 3 | 27, PTY-06-05 | §9 |
| TSK-SAL-02-30 | Build `InvoicePaymentSheet` | FE | `+@fe/sales/components/editor/InvoicePaymentSheet.tsx` | `UbDrawer` with a multi-mode breakup; Σ modes must equal the amount; validated before issue | 3 | 27, PAY-02-04 | F8 |
| TSK-SAL-02-31 | Implement `useInvoiceKeyboard` | FE | `+@fe/sales/hooks/useInvoiceKeyboard.ts` | F2 party, F4 item, F6 discount, F8 payment, Ctrl+S save, Ctrl+Enter issue; bindings disabled inside text inputs where they would conflict | 2 | 22, 21 | §7 |
| TSK-SAL-02-32 | Implement `useInvoiceIssue` | FE | `+@fe/sales/hooks/useInvoiceIssue.ts` | Runs the pre-flight dialogs in order, mints the idempotency key once, and retries with the same key | 3 | 29, 30 | §6, R-F-10 |
| TSK-SAL-02-33 | Build `InvoiceEditorPageContent` and its routes | FE | `+@fe/sales/components/editor/InvoiceEditorPageContent.tsx` `+@fe/sales/components/editor/InvoiceEditorHeader.tsx` `~@app/(app)/sales/invoices/new/page.tsx` `~@app/(app)/sales/invoices/[id]/edit/page.tsx` | Orchestration only; each component file under 300 lines | 5 | 32 | 19.2.4, R-FN-4 |
| TSK-SAL-02-34 | Build `InvoiceDetailPageContent` and its actions | FE | `+@fe/sales/components/detail/{InvoiceDetailPageContent,InvoiceActionsMenu,InvoicePaymentsSection}.tsx` `~@app/(app)/sales/invoices/[id]/page.tsx` | Share, print, void, duplicate and record-payment gated by status and permission through `invoiceActions.ts` | 5 | 33 | §7 |
| TSK-SAL-02-35 | Write `invoiceDisplay.ts` and `invoiceActions.ts` | FE | `+@fe/sales/view-model/{invoiceDisplay,invoiceActions}.ts` | Status label and tone, due text, number formatting; which actions a status × permission set allows — pure and ≥ 95 % covered | 2 | 34 | 28.7 |
| TSK-SAL-02-36 | E2E: issue a credit invoice | Test | `+e2e/tests/invoice-issue.spec.ts` | `[T-SAL-02-*]` two lines, discounts, credit terms, issue; assert number, stock drop, ledger post and totals | 3 | 35 | AC |

**36 tasks (+10 subtasks), 113.0 points.**

#### SAL-03 — Invoice PDF, print & share

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-SAL-03-01 | Implement share-link issuance for documents | BE | `~@be/sales/views/invoice.py` `~@be/common/share_links.py` | `POST /sales/invoices/{id}/share-links` returns `{url, expires_at}`; token hashed and revocable | 2 | SAL-02-14, CHS-PRINT-09 | 22.7 |
| TSK-SAL-03-02 | Implement the public document selector and view | BE | `+@be/sales/selectors/public.py` `+@be/sales/views/public.py` | `GET /public/d/{token}` returns a redacted shape; an expired token returns 404, never a 500 | 3 | 01 | 22.12 |
| TSK-SAL-03-03 | Implement `GET /sales/invoices/{id}/upi-intent` | BE | `~@be/sales/views/invoice.py` `~@be/common/integrations/upi/intent.py` | Returns `{upi_url, qr_svg_url}` with the amount, the VPA and the invoice number as the reference | 2 | 01, PAY-03-02 | 22.7, PAY-03 |
| TSK-SAL-03-04 | Build `InvoicePrintA4` | FE | `+@fe/sales/components/print/InvoicePrintA4.tsx` | All nine Rule 46 blocks, tax breakup by slab, HSN column, amount in words, signature and UPI QR; verified on a physical laser printer | 5 | CHS-PRINT-04 | FR, 12.8 |
| TSK-SAL-03-05 | Build `InvoicePrintThermal80` | FE | `+@fe/sales/components/print/InvoicePrintThermal80.tsx` | Fits 80 mm at 203 dpi; verified on a physical thermal printer | 3 | 04 | FR, 12.8 |
| TSK-SAL-03-06 | Build the print route and template switch | FE | `~@app/(app)/sales/invoices/[id]/print/page.tsx` `+@fe/sales/hooks/useInvoicePrint.ts` | `?template=a4|thermal80`; `?auto=1` prints on mount; the print count is recorded | 2 | 05 | 19.2.2 |
| TSK-SAL-03-07 | Build the public invoice page | FE | `~@app/(public)/d/[token]/page.tsx` | Server component rendering the same print component; `noindex`; no referrer; a pay button placeholder for Phase 2 | 3 | 02, 04 | 22.12 |
| TSK-SAL-03-08 | Build the invoice share sheet | FE | `+@fe/sales/components/detail/InvoiceShareSheet.tsx` `+@fe/sales/api/shareService.ts` | WhatsApp text with the number, amount, due date and link; copy link; print | 2 | 07, NTF-03-04 | NTF-03 |
| TSK-SAL-03-09 | E2E: print and share | Test | `+e2e/tests/invoice-share.spec.ts` | `[T-SAL-03-*]` the print route renders both templates; the public link opens without a session and shows the same totals | 2 | 08 | AC |

**9 tasks, 24.0 points.**

#### SAL-06 — Draft autosave & duplicate

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-SAL-06-01 | Implement draft deletion and duplication | BE | `~@be/sales/services/draft.py` `~@be/sales/views/invoice.py` | `DELETE` allowed only on drafts; `POST /sales/invoices/{id}/duplicate` copies lines and totals into a new draft with no number | 3 | SAL-02-08 | FR |
| TSK-SAL-06-02 | Implement `useInvoiceDraftAutosave` | FE | `+@fe/sales/hooks/useInvoiceDraftAutosave.ts` `+@fe/sales/view-model/invoiceDraftStorage.ts` | Debounced localStorage write plus a `PATCH` of the server draft; every write wrapped in try/catch and correct when storage is unavailable | 3 | 01, SAL-02-22 | FR, 19.5.7 |
| TSK-SAL-06-03 | Build `InvoiceDraftRestorePrompt` | FE | `+@fe/sales/components/editor/InvoiceDraftRestorePrompt.tsx` | On reopening with a newer local draft, offers restore or discard, showing both timestamps | 2 | 02 | §9 |
| TSK-SAL-06-04 | Implement the unsaved-changes guard | FE | `~@fe/sales/components/editor/InvoiceEditorPageContent.tsx` | `useUnsavedChangesGuard` blocks navigation while dirty and unsaved | 1 | 03 | R-F-7 |
| TSK-SAL-06-05 | E2E: crash and restore | Test | `+e2e/tests/invoice-draft.spec.ts` | `[T-SAL-06-*]` type three lines, hard-reload, restore, and assert the lines and totals are identical | 2 | 04 | AC |

**5 tasks, 11.0 points.**

#### SAL-07 — Walk-in / cash sale

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-SAL-07-01 | Allow a party-less document | BE | `~@be/sales/services/draft.py` `~@be/sales/services/issue.py` | `party_id` null with `walk_in_name`/`walk_in_mobile`; no ledger entry is posted; full payment is required at issue | 3 | SAL-02-11 | FR, BR |
| TSK-SAL-07-02 | Enforce full payment for walk-ins | BE | `~@be/sales/services/issue.py` | Issuing a walk-in without a payment covering the grand total returns 409 with the shortfall | 2 | 01 | BR |
| TSK-SAL-07-03 | Build the walk-in toggle and fields | FE | `~@fe/sales/components/editor/InvoicePartySection.tsx` | Switching to walk-in hides credit terms and forces the payment sheet open before issue | 2 | 01, SAL-02-30 | §7 |
| TSK-SAL-07-04 | Offer the receipt message to the optional mobile | FE | `~@fe/sales/components/detail/InvoiceShareSheet.tsx` | When a walk-in mobile is present, the share sheet prefills a WhatsApp message to it | 1 | 03 | FR |

**4 tasks, 8.0 points.**

#### SAL-08 — Sales list & filters

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-SAL-08-01 | Implement `SalesDocumentFilterSet` | BE | `+@be/sales/filters.py` | `status` as a comma list, `party_id`, `date_from`/`date_to`, `q`, amount range; ordering whitelisted | 2 | SAL-02-04 | 22.7 |
| TSK-SAL-08-02 | Implement `list_documents()` and `document_totals()` | BE | `+@be/sales/selectors/document.py` | `meta.totals.count/grand_total/amount_due` over the filtered set; `select_related` party, `prefetch` lines only when `include=lines` | 3 | 01 | 22.7, R5.3 |
| TSK-SAL-08-03 | Implement the overdue refresh job | BE | `~@be/sales/tasks.py` | `sales.refresh_overdue` sets `overdue` on issued or partially-paid documents past `due_on`; idempotent per day | 2 | 02, CHS-JOB-06 | 0.7, 22.7 |
| TSK-SAL-08-04 | Write `invoiceListSlice.ts` and `invoiceListThunk.ts` | FE | `+@fe/sales/redux/invoiceListSlice.ts` `+@fe/sales/redux/invoiceListThunk.ts` | Status tab, filters and page in the URL | 2 | 02 | 19.3 |
| TSK-SAL-08-05 | Build the list columns and status cell | FE | `+@fe/sales/components/list/{InvoiceListColumns,InvoiceStatusCell}.tsx` | Column factory at module level; `UbStatusBadge` tone from `invoiceStatuses.ts` | 2 | 04 | R-C-11 |
| TSK-SAL-08-06 | Build `InvoicesListPageContent` and `InvoiceListFilters` | FE | `+@fe/sales/components/list/{InvoicesListPageContent,InvoiceListFilters}.tsx` `~@app/(app)/sales/invoices/page.tsx` | Status tabs with counts, totals reflecting the filter, and all ten states | 5 | 05, CHS-DS-08 | §7, §9 |
| TSK-SAL-08-07 | E2E: filter and total | Test | `+e2e/tests/invoice-list.spec.ts` | `[T-SAL-08-*]` totals change with each tab and match a direct sum | 2 | 06 | AC |

**7 tasks, 18.0 points.**

**`EPIC-SALES-CORE` totals: 61 tasks (+10 subtasks), 174.0 points**, delivered across Sprints 7 and 8 with the planned 21-point carry described in Part 32 §32.10.2.

---

### 33.5.8 `EPIC-PAYMENTS` — money in and out, allocation and aging (Sprint 8)

**Claim.** A payment is one money event that may be split across modes and allocated across documents; voiding it reverses everything; aging ages what allocation says is unpaid.

#### PAY-01 — Record payment in / out

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PAY-01-01 | Create `payments_payment` and `payments_allocation` | DB | `+@be/payments/migrations/0001_initial.py` | Columns per Part 21 §21.3.9; `U(payment_id, document_type, document_id)`; `CHECK amount > 0`; three indexes | 2 | SAL-02-01, PTY-01-01 | 21.3.9 |
| TSK-PAY-01-02 | Implement the `Payment` and `Allocation` models | BE | `+@be/payments/models.py` `+@be/payments/constants.py` | `PaymentDirection`, `PaymentStatus`, `PaymentMode` as `TextChoices` matching canon; `mode_breakup` validated as a list of `{mode, amount, reference?}` | 2 | 01 | 0.7, 21.3.9 |
| TSK-PAY-01-03 | Implement `record_payment()` | BE | `+@be/payments/services/record.py` | Allocates a receipt number, validates Σ modes = amount, applies allocations, posts the ledger entry, updates each document's `amount_paid`/`amount_due`/status, writes one audit row | 5 | 02, PLT-03-07, LED-01-05 | 22.9, BR |
| TSK-PAY-01-03.1 | — subtask: lock documents in `(document_date, number, id)` order | BE | `~@be/payments/services/record.py` | The `sorted()` call carries the L3 comment; a concurrency test proves no deadlock across two payments touching the same two documents | — | 03 | L3 |
| TSK-PAY-01-03.2 | — subtask: FIFO auto-allocation | BE | `~@be/payments/services/record.py` | `allocations:"auto"` fills the oldest open documents first; the remainder becomes an unallocated advance | — | 03 | 22.9 |
| TSK-PAY-01-03.3 | — subtask: enforce Σ allocations ≤ amount | BE | `~@be/payments/services/record.py` | Enforced in the service and by a database constraint; over-allocation returns 400 | — | 03 | 22.9 |
| TSK-PAY-01-04 | Implement the payment selectors | BE | `+@be/payments/selectors/payment.py` | List with filters and totals; `open_documents_for_party()` used by the allocation picker | 3 | 03 | 22.9 |
| TSK-PAY-01-05 | Implement the payment serializers | BE | `+@be/payments/serializers/payment.py` | Read and write separate; `mode_breakup` round-trips; money as strings | 2 | 04 | 22.9, R6.1 |
| TSK-PAY-01-06 | Implement `PaymentViewSet` | BE | `+@be/payments/views/payment.py` `+@be/payments/urls.py` `+@be/payments/permissions.py` `+@be/payments/filters.py` | `GET/POST /payments`, `GET /payments/{id}`; `@idempotent`; `payments.payment.write` enforced | 3 | 05, CHS-IDEM-03 | 22.9 |
| TSK-PAY-01-07 | Write `paymentService.ts` and `payment.types.ts` | FE | `+@fe/payments/api/paymentService.ts` `+@fe/payments/types/payment.types.ts` | `mode_breakup` typed; money stays a string | 2 | 06 | R-TS-7 |
| TSK-PAY-01-08 | Write `paymentSlice.ts` and `paymentThunk.ts` | FE | `+@fe/payments/redux/paymentSlice.ts` `+@fe/payments/redux/paymentThunk.ts` | Recording a payment invalidates the invoice list, the party detail and the dashboard per the invalidation map | 3 | 07 | 19.3.6 |
| TSK-PAY-01-09 | Write `paymentSchemas.ts` | FE | `+@fe/payments/validation/paymentSchemas.ts` | Σ modes = amount; allocation total ≤ amount; reference required for non-cash modes | 2 | CHS-I18N-04 | §10 |
| TSK-PAY-01-10 | Build `PaymentFormDrawer` | FE | `+@fe/payments/components/PaymentFormDrawer.tsx` `+@fe/payments/hooks/usePaymentForm.ts` | Direction, party search, date, modes, note; opens from the party page, the invoice detail and the payments list | 5 | 08, 09 | §7 |
| TSK-PAY-01-11 | Build the allocation picker | FE | `+@fe/payments/components/PaymentAllocationPicker.tsx` | Auto-FIFO by default with a manual override; shows each document's due amount and the remaining advance live | 3 | 10 | 22.9 |
| TSK-PAY-01-12 | Build the payments list screen | FE | `+@fe/payments/components/PaymentsListPageContent.tsx` `~@app/(app)/payments/page.tsx` | Filters by direction, party, mode and date; totals; all ten states | 3 | 11, CHS-DS-08 | §7, §9 |
| TSK-PAY-01-13 | E2E: partial payment against an invoice | Test | `+e2e/tests/payment-record.spec.ts` | `[T-PAY-01-*]` ₹500 auto-allocated leaves the invoice partially paid and the party balance exactly ₹398 | 3 | 12 | AC, 22.14 |

**13 tasks (+3 subtasks), 38.0 points.**

#### PAY-02 — Multi-mode split payment

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PAY-02-01 | Validate and derive from `mode_breakup` | BE | `~@be/payments/services/record.py` | Σ mode amounts must equal `amount`; `primary_mode` is the largest share; per-mode references stored | 2 | PAY-01-03 | 22.9, FR |
| TSK-PAY-02-02 | Make the cashbook read `mode_breakup` | BE | `+@be/payments/selectors/cashbook.py` | Cash and bank rows split by mode rather than by payment | 2 | 01 | EXP-03 |
| TSK-PAY-02-03 | Build the mode-breakup editor | FE | `+@fe/payments/components/ModeBreakupEditor.tsx` | Add and remove mode rows; the remainder is shown live and the form blocks until it is zero | 3 | PAY-01-10 | §7 |
| TSK-PAY-02-04 | Reuse the editor in the invoice payment sheet | FE | `~@fe/sales/components/editor/InvoicePaymentSheet.tsx` | One component, two callers; no second implementation | 1 | 03 | SAL-02 F8 |

**4 tasks, 8.0 points.**

#### PAY-03 — UPI static QR & intent link

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PAY-03-01 | Implement `build_upi_url()` | BE | `+@be/common/integrations/upi/intent.py` | Builds a spec-compliant `upi://pay` URL with `pa`, `pn`, `am`, `tn`, `tr`; special characters encoded | 2 | PLT-07-05 | 20.10.3 |
| TSK-PAY-03-02 | Implement the local SVG QR encoder | BE | `+@be/common/integrations/upi/qr.py` | Generates a scannable QR with no network call and no new dependency; a decoding test asserts the payload round-trips | 3 | 01 | 20.10.3, ADR-021 |
| TSK-PAY-03-03 | Implement the QR and intent endpoints | BE | `+@be/payments/views/upi.py` `~@be/payments/urls.py` | `GET /payments/qr.svg` and `POST /payments/upi-intent` per §22.9 | 2 | 02 | 22.9 |
| TSK-PAY-03-04 | Build `UbQrCode`'s client encoder | DS | `~@ds/UbQrCode/qrEncoder.ts` | The same payload renders identically client-side for print; asserted against the server output in a fixture test | 3 | 02, CHS-DS-11 | 23.3 |
| TSK-PAY-03-05 | Place the QR on invoices, statements and receipts | FE | `~@fe/sales/components/print/InvoicePrintA4.tsx` `~@fe/ledger/components/print/StatementPrintA4.tsx` | Shown only when `documents.show_upi_qr` is on and a VPA exists; scanning prefills the amount and the reference | 2 | 04 | FR |

**5 tasks, 12.0 points.**

#### PAY-04 — Payment receipt print / share

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PAY-04-01 | Allocate receipt numbers per direction | BE | `~@be/payments/services/record.py` | `RCT/…` for in and `PAYOUT/…` for out, from `platform_document_sequence` | 1 | PAY-01-03 | 21.3.1 |
| TSK-PAY-04-02 | Build the receipt print component | FE | `+@fe/payments/components/print/ReceiptPrint.tsx` `+@app/(app)/payments/[id]/print/page.tsx` | Branded; lists the mode breakup and the allocations; amount in words | 3 | 01, CHS-PRINT-07 | FR |
| TSK-PAY-04-03 | Build the receipt share sheet | FE | `+@fe/payments/components/ReceiptShareSheet.tsx` | WhatsApp text with the amount, the mode and the new balance; copy link; print | 2 | 02, NTF-03-04 | NTF-03 |

**3 tasks, 6.0 points.**

#### PAY-05 — Void payment

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PAY-05-01 | Implement `void_payment()` | BE | `+@be/payments/services/void.py` | Reverses allocations, posts a reversing ledger entry, recomputes each affected document's `amount_paid`/`amount_due`/status, requires a reason, writes one audit row | 5 | PAY-01-03, LED-03-01 | FR, BR |
| TSK-PAY-05-02 | Implement `POST /payments/{id}/void` | BE | `~@be/payments/views/payment.py` | Gated on `payments.payment.void`; staff refused; an already-void payment returns 409 | 2 | 01 | 22.9, §12 |
| TSK-PAY-05-03 | Prove recompute correctness after void | Test | `+@be/payments/tests/test_void_reconcile.py` | `recalc_balances` is clean and every touched document's `amount_due` equals `grand_total − Σ live allocations` | 2 | 02 | 12.5 |
| TSK-PAY-05-04 | Build the void dialog | FE | `+@fe/payments/components/VoidPaymentDialog.tsx` | `UbReasonDialog` listing which documents will revert and to which status | 2 | 02, CHS-DS-09 | §7, §9 |

**4 tasks, 11.0 points.**

#### LED-10 — Ledger ↔ documents integration

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-LED-10-01 | Assert every posting path sets `source_type`/`source_id` | Test | `+@be/ledger/tests/test_source_links.py` | Invoice, credit note, purchase bill, debit note, payment and expense entries all carry a resolvable source | 2 | SAL-02-11, PAY-01-03 | FR |
| TSK-LED-10-02 | Implement source resolution in the entry serializer | BE | `~@be/ledger/serializers/entry.py` | `source` returns `{type, id, number, url}` without an N+1; a query-count test asserts one extra query for a page of 50 | 3 | 01 | 22.5 |
| TSK-LED-10-03 | Render source links on the timeline and statement | FE | `~@fe/ledger/components/LedgerTimelineRow.tsx` `~@fe/ledger/components/StatementPageContent.tsx` | Each document-sourced row links to the document; a voided source is shown struck through | 3 | 02 | §7 |
| TSK-LED-10-04 | Refuse direct reversal of document-sourced entries in the UI | FE | `~@fe/ledger/components/LedgerTimelineRow.tsx` | The row menu offers "Void the invoice" instead of "Reverse entry", linking to the document | 1 | 03 | LED-03, 22.5 |

**4 tasks, 9.0 points.**

#### LED-09 — Ledger summary & aging

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-LED-09-01 | Implement the aging CTE | BE | `+@be/ledger/selectors/aging.py` | FIFO application of credits against debits computed in SQL; four buckets 0–30 / 31–60 / 61–90 / 90+ per party; `as_of` honoured | 5 | PAY-01-03 | 22.5, 21.4 |
| TSK-LED-09-02 | Implement `GET /ledger/aging` | BE | `+@be/ledger/views/aging.py` `~@be/ledger/urls.py` | `type=receivable|payable`; totals plus per-party rows; `reports.financial.read` enforced for the payable side | 2 | 01 | 22.5, 0.9 |
| TSK-LED-09-03 | Cache aging for large tenants | BE | `+@be/reports/models.py` `~@be/ledger/selectors/aging.py` | Tenants above 5,000 entries read a `reports_snapshot` refreshed by a job with ≤ 60 s staleness | 3 | 02, CHS-JOB-06 | 21.4 |
| TSK-LED-09-04 | Reconcile aging against balances | Test | `+@be/ledger/tests/test_aging_reconcile.py` | Σ receivable buckets equals Σ positive party balances on the 100,000-row fixture | 2 | 03, CHS-SEED-12 | 12.5 |
| TSK-LED-09-05 | Write the aging service, slice and thunk | FE | `+@fe/ledger/api/agingService.ts` `+@fe/ledger/redux/agingSlice.ts` `+@fe/ledger/redux/agingThunk.ts` | Type and `as_of` in the URL | 2 | 02 | 19.3 |
| TSK-LED-09-06 | Build the aging screen | FE | `+@fe/ledger/components/AgingPageContent.tsx` `+@fe/ledger/components/AgingBucketBar.tsx` `~@app/(app)/ledger/aging/page.tsx` | Bucket bars with labels and figures; tapping a bucket drills through to the filtered party list | 5 | 05 | §7, RPT-05 |

**6 tasks, 19.0 points.**

**`EPIC-PAYMENTS` totals: 39 tasks (+3 subtasks), 103.0 points**; the Sprint 8 commitment is 50.0 after the Sprint 7 carry.

---

### 33.5.9 `EPIC-SALES-PURCH` — estimates, credit notes, voids and the purchase side (Sprint 9)

#### SAL-01 — Estimate / quotation

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-SAL-01-01 | Add the estimate kind and its statuses | BE | `~@be/sales/constants.py` `~@be/sales/models/document.py` | Five statuses `draft`, `sent`, `accepted`, `rejected`, `expired`, plus `converted`, exactly per canon §0.7 | 1 | SAL-02-03 | 0.7 |
| TSK-SAL-01-02 | Implement estimate creation and the tax preview | BE | `+@be/sales/services/estimate.py` | Unregistered tenants get no tax rows but may preview; `valid_until` defaults from settings | 3 | 01 | FR |
| TSK-SAL-01-03 | Implement `convert_estimate_to_invoice()` | BE | `~@be/sales/services/estimate.py` | Creates a draft invoice with `converted_from_id`, copies and re-prices lines at current rates, and sets the estimate to `converted` | 3 | 02 | 22.7 |
| TSK-SAL-01-04 | Implement the expiry job | BE | `~@be/sales/tasks.py` | `sales.expire_estimates` sets `expired` past `valid_until`; idempotent per day | 1 | 03, CHS-JOB-06 | 0.7 |
| TSK-SAL-01-05 | Implement `EstimateViewSet` | BE | `+@be/sales/views/estimate.py` `~@be/sales/urls.py` | `GET/POST/PATCH /sales/estimates`, `POST /{id}/convert`; `sales.estimate.write` enforced | 2 | 04 | 22.7 |
| TSK-SAL-01-06 | Write the estimate service, types, slice and thunk | FE | `+@fe/sales/api/estimateService.ts` `+@fe/sales/types/estimate.types.ts` `+@fe/sales/redux/estimateListSlice.ts` `+@fe/sales/redux/estimateListThunk.ts` | Reuses the invoice editor slice shape with a different kind | 3 | 05 | 19.2.4 |
| TSK-SAL-01-07 | Reuse the editor for estimates | FE | `~@fe/sales/components/editor/InvoiceEditorPageContent.tsx` `~@app/(app)/sales/estimates/new/page.tsx` | The kind constant drives the title, the fields shown and the actions; no second editor exists | 3 | 06 | 19.2.4 |
| TSK-SAL-01-08 | Build the estimate list and the convert action | FE | `+@fe/sales/components/list/EstimatesListPageContent.tsx` `~@app/(app)/sales/estimates/page.tsx` | Status tabs; convert opens the resulting draft invoice | 3 | 07 | §7 |
| TSK-SAL-01-09 | E2E: quote then convert | Test | `+e2e/tests/estimate-convert.spec.ts` | `[T-SAL-01-*]` estimate issued, shared, converted; the invoice carries `converted_from_id` and the same lines | 2 | 08 | AC |

**9 tasks, 21.0 points.**

#### SAL-04 — Credit note / sales return

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-SAL-04-01 | Create `sales_credit_application` | DB | `+@be/sales/migrations/0003_credit_application.py` | `credit_note_id`, `invoice_id`, `amount`, `U(credit_note_id, invoice_id)` | 1 | SAL-02-01 | 21.3.9 decision |
| TSK-SAL-04-02 | Implement the return-quantity guard | BE | `+@be/sales/services/credit_note.py` | Line quantity ≤ invoiced − `returned_qty`; enforced across two partial credit notes; updates `returned_qty` | 3 | 01 | FR, BR |
| TSK-SAL-04-03 | Implement `issue_credit_note()` | BE | `~@be/sales/services/credit_note.py` | Allocates a number, posts `sale_return_in` movements when `restock`, posts the ledger credit, writes one audit row | 5 | 02, INV-05-04, LED-01-05 | BR |
| TSK-SAL-04-04 | Implement settlement handling | BE | `~@be/sales/services/credit_note.py` | `hold_advance` leaves an unallocated credit; `refund` records a `direction=out` payment through `record_payment()` | 3 | 03, PAY-01-03 | 22.7 |
| TSK-SAL-04-05 | Implement `apply_credit_note()` | BE | `~@be/sales/services/credit_note.py` | `POST /sales/credit-notes/{id}/apply` writes a `sales_credit_application` row and reduces the invoice's `amount_due` | 3 | 04 | 22.7 |
| TSK-SAL-04-06 | Implement `CreditNoteViewSet` | BE | `+@be/sales/views/credit_note.py` `~@be/sales/urls.py` | Create, issue, void and apply; `sales.credit_note.write` enforced | 2 | 05 | 22.7 |
| TSK-SAL-04-07 | Write the credit-note service, slice and thunk | FE | `+@fe/sales/api/creditNoteService.ts` `+@fe/sales/redux/creditNoteSlice.ts` `+@fe/sales/redux/creditNoteThunk.ts` | Against-invoice mode pre-fills lines with the returnable quantities | 3 | 06 | 19.2.4 |
| TSK-SAL-04-08 | Build the credit-note editor | FE | `+@fe/sales/components/editor/CreditNoteEditorPageContent.tsx` `~@app/(app)/sales/credit-notes/new/page.tsx` | Against-invoice or standalone; a restock toggle; a settlement choice; per-line max quantity enforced in the UI | 5 | 07 | §7 |
| TSK-SAL-04-09 | Show credit notes on the invoice detail | FE | `~@fe/sales/components/detail/InvoiceDetailPageContent.tsx` | A returns section listing credit notes with amounts and applied status | 2 | 08 | §7 |
| TSK-SAL-04-10 | E2E: partial return | Test | `+e2e/tests/credit-note.spec.ts` | `[T-SAL-04-*]` return one of two units, restock, apply to the invoice; stock, ledger and `amount_due` all correct | 3 | 09 | AC |

**10 tasks, 30.0 points.**

#### SAL-05 — Void / cancel invoice

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-SAL-05-01 | Implement `void_invoice()` | BE | `+@be/sales/services/void.py` | Reverses stock with `reversal` movements, reverses the ledger entry, sets `void` with a reason and `voided_at`, and keeps the number | 5 | SAL-02-11, LED-03-01 | FR, BR |
| TSK-SAL-05-02 | Leave payments as advances | BE | `~@be/sales/services/void.py` | Allocations are released; the payment remains recorded and unallocated; the response tells the caller what happened | 2 | 01 | 22.14 step 4 |
| TSK-SAL-05-03 | Implement `POST /sales/invoices/{id}/void` | BE | `~@be/sales/views/invoice.py` | Gated on `sales.invoice.void`; staff refused; an already-void document returns 409 `document_already_void` | 2 | 02 | 22.7, §12 |
| TSK-SAL-05-04 | Prove the number is never reissued | Test | `+@be/sales/tests/test_void.py` | `[T-SAL-05-*]` after voiding, the next issue takes the following number, not the voided one | 2 | 03 | BR |
| TSK-SAL-05-05 | Build `InvoiceVoidDialog` | FE | `+@fe/sales/components/detail/InvoiceVoidDialog.tsx` | `UbReasonDialog` stating what will be reversed and what will remain as an advance | 2 | 03 | §7, §9 |

**5 tasks, 13.0 points.**

#### PUR-01 — Purchase bill entry

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PUR-01-01 | Create `purchases_document` and `purchases_document_line` | DB | `+@be/purchases/migrations/0001_initial.py` | Mirrors sales plus `supplier_invoice_number`, `supplier_invoice_date`, `itc_eligible`; `U(tenant_id, party_id, supplier_invoice_number) WHERE … status <> 'void'` | 3 | SAL-02-01 | 21.3.8 |
| TSK-PUR-01-02 | Implement the purchase models and constants | BE | `+@be/purchases/models/{document,line}.py` `+@be/purchases/constants.py` | `PurchaseKind`, `BillStatus` per canon §0.7; `unit_cost` uses `UnitCostField` | 2 | 01 | 0.7, R3.3 |
| TSK-PUR-01-03 | Reuse the tax engine for purchases | BE | `+@be/purchases/services/tax.py` | Calls `sales.services.tax_engine.compute_document_totals` with inbound semantics; no second engine exists | 2 | 02, SAL-02-07 | D4 |
| TSK-PUR-01-04 | Implement `create_bill_draft()` and `update_bill_draft()` | BE | `+@be/purchases/services/draft.py` | Server recomputes totals; duplicate supplier invoice returns 409 `duplicate_supplier_invoice` | 3 | 03 | 22.8 |
| TSK-PUR-01-05 | Implement `record_bill()` | BE | `+@be/purchases/services/record.py` | Posts `purchase_in` movements at cost driving the weighted-average update, posts a supplier ledger credit, records the optional payment, writes one audit row | 5 | 04, INV-05-05, LED-01-05 | FR, BR |
| TSK-PUR-01-06 | Implement the purchase serializers | BE | `+@be/purchases/serializers/{document_read,document_write,line,actions}.py` | Shapes mirror §22.7 with the purchase-specific fields added | 3 | 05 | 22.8 |
| TSK-PUR-01-07 | Implement `PurchaseBillViewSet` | BE | `+@be/purchases/views/bill.py` `+@be/purchases/urls.py` `+@be/purchases/permissions.py` | `GET/POST/PATCH`, `POST /{id}/record`; `@idempotent`; `purchases.bill.write` enforced | 3 | 06, CHS-IDEM-03 | 22.8 |
| TSK-PUR-01-08 | Prove the weighted average after purchase | Test | `+@be/purchases/tests/test_avg_cost_after_bill.py` | `[T-PUR-01-*]` the Part 21 §21.3.6 formula holds paisa-exact including the `on_hand ≤ 0` case | 2 | 07 | 21.3.6 |
| TSK-PUR-01-09 | Write the purchase service, types, slice and thunk | FE | `+@fe/purchases/api/purchaseService.ts` `+@fe/purchases/types/purchase.types.ts` `+@fe/purchases/redux/{billEditorSlice,billEditorThunk}.ts` | Reuses the invoice editor slice shape | 3 | 07 | 19.2.4 |
| TSK-PUR-01-10 | Write `billSchemas.ts` | FE | `+@fe/purchases/validation/billSchemas.ts` | Supplier required; supplier invoice number and date required; cost non-negative | 2 | CHS-I18N-04 | §10 |
| TSK-PUR-01-11 | Build the bill editor | FE | `+@fe/purchases/components/editor/BillEditorPageContent.tsx` `+@fe/purchases/components/editor/BillLinesSection.tsx` `~@app/(app)/purchases/bills/new/page.tsx` | Reuses the sales line components with a cost column replacing the price column | 5 | 09, 10, SAL-02-24 | §7 |
| TSK-PUR-01-12 | Build the bill detail screen | FE | `+@fe/purchases/components/detail/BillDetailPageContent.tsx` `~@app/(app)/purchases/bills/[id]/page.tsx` | Totals, stock effect, ledger effect, payments and the actions menu | 3 | 11 | §7 |
| TSK-PUR-01-13 | E2E: record a bill | Test | `+e2e/tests/purchase-bill.spec.ts` | `[T-PUR-01-*]` 20 units at ₹42 raises on-hand, moves the average cost and credits the supplier ledger | 3 | 12 | AC |

**13 tasks, 39.0 points.**

#### PUR-02 — Supplier payment

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PUR-02-01 | Allow allocation to purchase documents | BE | `~@be/payments/services/record.py` | `document_type='purchase_document'` allocates against bills; `direction=out` posts a ledger debit | 3 | PAY-01-03, PUR-01-05 | 22.8, 22.9 |
| TSK-PUR-02-02 | Add the open-bills selector | BE | `~@be/payments/selectors/payment.py` | `open_documents_for_party` returns bills for `out` payments and invoices for `in` payments | 2 | 01 | 22.9 |
| TSK-PUR-02-03 | Wire the payment drawer to the supplier context | FE | `~@fe/payments/components/PaymentFormDrawer.tsx` | Opening from a bill or a supplier pre-selects direction, party and allocation | 2 | 02 | §7 |

**3 tasks, 7.0 points.**

#### PUR-03 — Purchase list & filters

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PUR-03-01 | Implement the purchase filterset and selectors | BE | `+@be/purchases/filters.py` `+@be/purchases/selectors/document.py` | Status, supplier, date range; `meta.totals` with payables over the filtered set | 3 | PUR-01-07 | 22.8 |
| TSK-PUR-03-02 | Reuse the overdue refresh for bills | BE | `~@be/purchases/tasks.py` | `purchases.refresh_overdue` mirrors the sales job | 1 | 01, SAL-08-03 | 0.7 |
| TSK-PUR-03-03 | Write the list slice and thunk | FE | `+@fe/purchases/redux/{billListSlice,billListThunk}.ts` | Tabs and filters in the URL | 2 | 01 | 19.3 |
| TSK-PUR-03-04 | Build the purchase list screen | FE | `+@fe/purchases/components/list/BillsListPageContent.tsx` `~@app/(app)/purchases/bills/page.tsx` | Status tabs, payables totals, all ten states | 3 | 03 | §7, §9 |

**4 tasks, 9.0 points.**

#### PUR-04 — Void purchase bill

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PUR-04-01 | Implement `void_bill()` | BE | `+@be/purchases/services/void.py` | Reverses `purchase_in` movements, reverses the supplier ledger credit, releases allocations, keeps the number, requires a reason | 5 | PUR-01-05, SAL-05-01 | FR, BR |
| TSK-PUR-04-02 | Handle the average-cost consequence | BE | `~@be/purchases/services/void.py` | The reversal movement recomputes the running average from the movement history rather than subtracting naively; `recalc_stock` is clean afterwards | 3 | 01 | 21.3.6 |
| TSK-PUR-04-03 | Implement `POST /purchases/bills/{id}/void` | BE | `~@be/purchases/views/bill.py` | Gated on `purchases.bill.void`; already void returns 409 | 1 | 02 | 22.8 |
| TSK-PUR-04-04 | Build the void dialog | FE | `+@fe/purchases/components/detail/BillVoidDialog.tsx` | States the stock and ledger effects before confirming | 2 | 03 | §9 |

**4 tasks, 11.0 points.**

**`EPIC-SALES-PURCH` totals: 48 tasks, 130.0 points**; the Sprint 9 commitment is 50.0, with the remainder resting on components already delivered in Sprints 7 and 8.

---

### 33.5.10 `EPIC-MIGRATION` — expenses, the import engine and export (Sprint 10)

#### EXP-02 — Expense categories

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-EXP-02-01 | Create `expenses_category` and `expenses_expense` | DB | `+@be/expenses/migrations/0001_initial.py` | Columns per Part 21 §21.3.10; two indexes | 2 | PTY-01-01 | 21.3.10 |
| TSK-EXP-02-02 | Implement the category model and service | BE | `+@be/expenses/models.py` `+@be/expenses/services/category.py` | System categories cannot be deleted; a category in use cannot be removed | 2 | 01 | FR |
| TSK-EXP-02-03 | Implement `GET/POST /expense-categories` | BE | `+@be/expenses/views/category.py` `+@be/expenses/serializers/category.py` `+@be/expenses/urls.py` | Shapes per §22.10 | 1 | 02 | 22.10 |
| TSK-EXP-02-04 | Build the category manager | FE | `+@fe/expenses/components/CategoryManager.tsx` | Inline create from the expense form; rename and archive from settings | 2 | 03, CHS-DS-09 | §7 |

**4 tasks, 7.0 points.**

#### EXP-01 — Record expense

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-EXP-01-01 | Implement `record_expense()` | BE | `+@be/expenses/services/record.py` | Allocates a number, stores the optional tax fields and the receipt attachment; with a party and `paid=false` posts a payable ledger credit | 3 | EXP-02-02, LED-01-05 | FR, 22.10 |
| TSK-EXP-01-02 | Implement `void_expense()` | BE | `+@be/expenses/services/void.py` | Reverses any ledger entry, requires a reason, writes one audit row | 2 | 01 | 0.7, FR |
| TSK-EXP-01-03 | Implement the expense selectors and filterset | BE | `+@be/expenses/selectors/expense.py` `+@be/expenses/filters.py` | Category, party, mode and date filters; `meta.totals` over the filtered set | 2 | 02 | 22.10 |
| TSK-EXP-01-04 | Implement `ExpenseViewSet` | BE | `+@be/expenses/views/expense.py` `+@be/expenses/serializers/expense.py` `+@be/expenses/permissions.py` | `GET/POST /expenses`, `POST /{id}/void`; `expenses.expense.write` enforced | 2 | 03 | 22.10 |
| TSK-EXP-01-05 | Write the expense service, types, slice, thunk and schema | FE | `+@fe/expenses/api/expenseService.ts` `+@fe/expenses/types/expense.types.ts` `+@fe/expenses/redux/{expenseSlice,expenseThunk}.ts` `+@fe/expenses/validation/expenseSchemas.ts` | Amount and date required; GST fields optional and mutually consistent | 3 | 04 | §10 |
| TSK-EXP-01-06 | Build the expense drawer | FE | `+@fe/expenses/components/ExpenseFormDrawer.tsx` | Category, amount, date, mode, optional party, optional GST, receipt photo with compression | 3 | 05, CHS-DS-09 | §7 |
| TSK-EXP-01-07 | Build the expense list screen | FE | `+@fe/expenses/components/ExpensesListPageContent.tsx` `~@app/(app)/expenses/page.tsx` | Category chips, date range, totals, all ten states | 3 | 06 | §7, §9 |

**7 tasks, 18.0 points.**

#### EXP-03 — Cashbook view

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-EXP-03-01 | Implement the cashbook selector | BE | `~@be/payments/selectors/cashbook.py` | Day-wise cash and bank in and out from payments (by `mode_breakup`), expenses and manual `manual_got` entries, with opening and closing per day | 5 | PAY-02-02, EXP-01-03 | 22.11, FR |
| TSK-EXP-03-02 | Implement `GET /reports/cashbook` | BE | `+@be/reports/views/cashbook.py` `+@be/reports/urls.py` | Date range and mode filters; `reports.basic.read` enforced | 2 | 01 | 22.11 |
| TSK-EXP-03-03 | Reconcile the cashbook against its sources | Test | `+@be/reports/tests/test_cashbook_reconcile.py` | Closing balance equals opening plus in minus out for every day on the seeded fixture | 2 | 02 | 12.5 |
| TSK-EXP-03-04 | Build the cashbook screen | FE | `+@fe/expenses/components/CashbookPageContent.tsx` `+@app/(app)/reports/cashbook/page.tsx` | Day rows with opening, in, out and closing, expandable to the underlying transactions; export button | 3 | 02 | §7 |

**4 tasks, 12.0 points.**

#### IMP-01 — CSV import framework

The engine itself is `CHS-IMPORT` (§33.4.12). The tasks here are the feature-level surface and the two MVP mappers' shared behaviour.

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-IMP-01-01 | Wire the import endpoints into the router and permissions | BE | `~@be/imports/urls.py` `+@be/imports/permissions.py` | All five endpoints of §22.12 present; gated on the target module's write permission | 2 | CHS-IMPORT-04 | 22.12 |
| TSK-IMP-01-02 | Implement progress reporting | BE | `~@be/imports/services/commit.py` | The job updates `result` with rows processed so the client can show a live percentage | 2 | 01 | §7 |
| TSK-IMP-01-03 | Emit the `import_done` notification | BE | `~@be/imports/tasks.py` | A completed or failed commit notifies the requesting user with a deep link to the job | 1 | 02, NTF-01-02 | NTF-01 |
| TSK-IMP-01-04 | Build the import entry points | FE | `+@fe/imports/components/ImportLauncher.tsx` `+@app/(app)/imports/page.tsx` | Reachable from the party list, the item list and settings; the kind is preselected by the caller | 2 | CHS-IMPORT-09 | §7 |
| TSK-IMP-01-05 | Build the import history | FE | `+@fe/imports/components/ImportHistoryTable.tsx` | Past jobs with counts, status and a downloadable error file | 2 | 04 | §7 |
| TSK-IMP-01-06 | E2E: import with errors, fix, commit | Test | `+e2e/tests/import.spec.ts` | `[T-IMP-01-*]` upload a file with 11 bad rows, download the error file, re-upload the fix, commit, and assert the row count | 3 | 05 | AC |

**6 tasks, 12.0 points.**

#### PTY-10 — Import parties (CSV)

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PTY-10-01 | Write the parties CSV template | Docs | `+@be/imports/templates_csv/parties.csv` | Columns: name, mobile, is_customer, is_supplier, gstin, state_code, address fields, tags, credit_limit, credit_days, opening_balance, opening_direction, opening_as_of, notes | 1 | CHS-IMPORT-08 | IMP-01 |
| TSK-PTY-10-02 | Implement `PartiesMapper` validation | BE | `+@be/imports/mappers/parties.py` | Every PTY-01 validation rule applied per row; duplicate mobiles within the file and against existing parties both flagged with the conflicting row | 3 | 01, PTY-01-04 | FR |
| TSK-PTY-10-03 | Implement `PartiesMapper` commit | BE | `~@be/imports/mappers/parties.py` | Calls `create_party()` and `post_opening_balance()` per row — never a bulk insert; a mid-file failure rolls back the batch | 3 | 02, LED-02-01 | canon 0.11-1 |
| TSK-PTY-10-04 | Prove commit idempotency | Test | `+@be/imports/tests/test_parties_import.py` | `[T-PTY-10-*]` committing the same job twice creates no duplicates and posts no second opening balance | 2 | 03 | IMP-01 BR |
| TSK-PTY-10-05 | Build the parties preview step | FE | `~@fe/imports/components/ImportWizard.tsx` | The preview shows the resulting balances so the merchant can sanity-check the migration before committing | 2 | 04 | §7 |

**5 tasks, 11.0 points.**

#### INV-09 — Import items (CSV)

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-INV-09-01 | Write the items CSV template | Docs | `+@be/imports/templates_csv/items.csv` | Columns: name, item_type, sku, barcode, category, unit, hsn_sac, tax_code, purchase_price, selling_price, mrp, track_stock, reorder_point, opening_qty, opening_cost, opening_as_of | 1 | CHS-IMPORT-08 | IMP-01 |
| TSK-INV-09-02 | Implement `ItemsMapper` validation | BE | `+@be/imports/mappers/items.py` | Unknown category or unit offered as a create-on-import with a count; duplicate SKU or barcode flagged; tax code validated against `tax_rate` | 3 | 01, INV-01-04 | FR |
| TSK-INV-09-03 | Implement `ItemsMapper` commit | BE | `~@be/imports/mappers/items.py` | Calls `create_item()` and `post_opening_stock()` per row; creates missing masters first in one pass | 3 | 02, INV-05-07 | canon 0.11-1 |
| TSK-INV-09-04 | Prove commit idempotency and stock correctness | Test | `+@be/imports/tests/test_items_import.py` | `[T-INV-09-*]` `recalc_stock` is clean after a 1,000-row import; a second commit creates nothing | 2 | 03 | 12.5 |

**4 tasks, 9.0 points.**

#### IMP-02 — Bulk export

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-IMP-02-01 | Add `?format=csv|xlsx` to every list endpoint | BE | `~@be/common/viewsets.py` `~@be/reports/services/export.py` | The export honours the current filters and the current ordering exactly; a test asserts row-for-row equality with the JSON list | 3 | CHS-IMPORT-11 | 22.11, FR |
| TSK-IMP-02-02 | Implement the async export job | BE | `~@be/reports/services/export.py` `~@be/reports/tasks.py` | Above 5,000 rows returns 202 with an `export_id`; the file expires after 7 days; the download link is tenant-checked | 3 | 01 | 22.11 |
| TSK-IMP-02-03 | Implement XLSX writing without a new dependency | BE | `+@be/reports/services/xlsx.py` | A minimal SpreadsheetML writer producing a file Excel opens with correct number and date types, or an ADR if a library is unavoidable | 3 | 02 | ADR-021 |
| TSK-IMP-02-04 | Build the shared export button | FE | `+@src/components/layout/ExportButton.tsx` | One component used by every list and report; shows the async path's progress and the download link | 2 | 02 | §7 |
| TSK-IMP-02-05 | Verify Indian formatting survives the round trip | Test | `+@be/reports/tests/test_export_format.py` | Amounts open as numbers, not text; dates as dd/mm/yyyy; the file has a UTF-8 BOM so Devanagari renders | 2 | 03 | 12.8 |

**5 tasks, 13.0 points.**

**`EPIC-MIGRATION` totals: 35 tasks, 82.0 points**; the Sprint 10 commitment is 50.0 with the 31-point import engine counted in `EPIC-CHASSIS`.

---

### 33.5.11 `EPIC-REPORTS` — the projections (Sprint 11)

Every report is a read-only projection. The rule for all of them: **the selector aggregates in SQL, the serializer formats nothing, and a reconciliation test computes the same number a second way.**

#### RPT-01 — Dashboard

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-RPT-01-01 | Implement the seven tile selectors | BE | `+@be/reports/selectors/dashboard.py` | To collect, to pay, due today, overdue, today's sales, cash in hand, low stock — each one SQL aggregate, no Python loop | 5 | LED-09-01, INV-07-04, EXP-03-01 | FR |
| TSK-RPT-01-02 | Implement recent activity and top debtors | BE | `~@be/reports/selectors/dashboard.py` | Ten most recent events across modules and the five largest receivables, both with links | 3 | 01 | FR |
| TSK-RPT-01-03 | Implement snapshot caching | BE | `+@be/reports/services/snapshot.py` `~@be/reports/tasks.py` | `reports_snapshot` refreshed on write with ≤ 60 s staleness; small tenants read live | 3 | 02, CHS-JOB-06 | 21.4 |
| TSK-RPT-01-04 | Implement `GET /reports/dashboard` | BE | `+@be/reports/views/dashboard.py` `~@be/reports/urls.py` | P95 ≤ 1.2 s on the 100,000-row fixture; tiles the role cannot see are absent, not zeroed | 2 | 03 | 22.11, 12.5 |
| TSK-RPT-01-05 | Reconcile every tile | Test | `+@be/reports/tests/test_dashboard_reconcile.py` | Each tile equals a naive second computation on the fixture | 3 | 04 | 12.5 |
| TSK-RPT-01-06 | Write the dashboard service, slice and thunk | FE | `+@fe/reports/api/dashboardService.ts` `+@fe/reports/redux/{dashboardSlice,dashboardThunk}.ts` | Refreshes on focus and after any mutation in the invalidation map | 2 | 04 | 19.3.6 |
| TSK-RPT-01-07 | Fill in the dashboard tiles | FE | `~@fe/reports/components/DashboardPageContent.tsx` `+@fe/reports/components/DashboardTiles.tsx` | The Sprint 1 skeleton gets real numbers; every tile is tappable to its drill-through; loading skeletons match the tile shape | 3 | 06 | §7, §9 |
| TSK-RPT-01-08 | Build recent activity and top debtors | FE | `+@fe/reports/components/{RecentActivityList,TopDebtorsCard}.tsx` | Each row links to its source; each debtor offers Remind | 3 | 07 | §7 |

**8 tasks, 24.0 points.**

#### RPT-02 — Day book

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-RPT-02-01 | Implement the day-book selector | BE | `+@be/reports/selectors/day_book.py` | A chronological union across sales, purchases, payments, expenses and manual entries with running cash and bank, built as one SQL query | 5 | EXP-03-01 | 22.11 |
| TSK-RPT-02-02 | Implement `GET /reports/day-book` | BE | `+@be/reports/views/day_book.py` | Date range and type filter; CSV and XLSX through the shared export path | 2 | 01 | 22.11 |
| TSK-RPT-02-03 | Reconcile the day book | Test | `+@be/reports/tests/test_day_book_reconcile.py` | Row count and totals equal the sum of the five sources for the same range | 2 | 02 | 12.5 |
| TSK-RPT-02-04 | Build the day-book screen | FE | `+@fe/reports/components/DayBookPageContent.tsx` `~@app/(app)/reports/day-book/page.tsx` | Grouped by day with running balances; each row links to its document | 3 | 02 | §7 |

**4 tasks, 12.0 points.**

#### RPT-03 — Sales register

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-RPT-03-01 | Implement `sales_register_rows()` | BE | `+@be/sales/selectors/register.py` | Invoice-wise rows with party GSTIN, taxable, CGST, SGST, IGST, cess, round-off and grand total; voided rows included and marked | 3 | SAL-08-02 | 22.11 |
| TSK-RPT-03-02 | Implement `GET /reports/sales-register` | BE | `+@be/reports/views/register.py` | Date range, party and status filters; `reports.financial.read` enforced; export path wired | 2 | 01 | 22.11, 0.9 |
| TSK-RPT-03-03 | Reconcile against the documents | Test | `+@be/reports/tests/test_sales_register_reconcile.py` | Register totals equal `SUM` over `sales_document` for the same filter | 2 | 02 | 12.5 |
| TSK-RPT-03-04 | Build the sales register screen | FE | `+@fe/reports/components/SalesRegisterPageContent.tsx` `~@app/(app)/reports/sales-register/page.tsx` | Wide grid with horizontal scroll on mobile; column totals pinned; export | 3 | 02 | §7 |

**4 tasks, 10.0 points.**

#### RPT-04 — Purchase register

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-RPT-04-01 | Implement `purchase_register_rows()` | BE | `+@be/purchases/selectors/register.py` | Bill-wise rows with supplier GSTIN, supplier invoice number and date, tax columns and `itc_eligible` | 3 | PUR-03-01 | 22.11 |
| TSK-RPT-04-02 | Implement `GET /reports/purchase-register` and reconcile it | BE | `~@be/reports/views/register.py` `+@be/reports/tests/test_purchase_register_reconcile.py` | Totals equal `SUM` over `purchases_document`; export wired | 3 | 01 | 22.11 |
| TSK-RPT-04-03 | Build the purchase register screen | FE | `+@fe/reports/components/PurchaseRegisterPageContent.tsx` `+@app/(app)/reports/purchase-register/page.tsx` | Same shape as the sales register | 3 | 02 | §7 |

**3 tasks, 9.0 points.**

#### RPT-05 — Receivables / payables aging

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-RPT-05-01 | Expose aging as a report endpoint | BE | `+@be/reports/views/aging.py` | `GET /reports/receivables-aging` and `/payables-aging` reuse the LED-09 selector with an `as_of` and a tag filter; export wired | 2 | LED-09-02 | 22.11 |
| TSK-RPT-05-02 | Build the aging report screens | FE | `+@fe/reports/components/AgingReportPageContent.tsx` `+@app/(app)/reports/aging/page.tsx` | Party rows × four buckets with totals; drill-through to the party statement filtered to the bucket's entries | 3 | 01, LED-09-06 | §7 |

**2 tasks, 5.0 points.**

#### RPT-06 — Stock summary & low stock

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-RPT-06-01 | Expose stock summary as a report endpoint | BE | `+@be/reports/views/stock.py` | `GET /reports/stock-summary` reuses the INV-08 selector with `as_of`, category and location; export wired | 2 | INV-08-03 | 22.11 |
| TSK-RPT-06-02 | Build the report screen with the low-stock section | FE | `~@fe/inventory/components/StockSummaryPageContent.tsx` | Category grouping with subtotals, a tenant total, and a low-stock panel linking to INV-07 | 3 | 01, INV-08-05 | §7 |

**2 tasks, 5.0 points.**

#### RPT-07 — GST summary

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-RPT-07-01 | Implement the outward summary by tax code | BE | `+@be/reports/selectors/gst.py` | Per `tax_code`: taxable, CGST, SGST, IGST, cess; period by month or quarter; voided documents excluded | 3 | RPT-03-01 | 22.11 |
| TSK-RPT-07-02 | Implement the inward summary | BE | `~@be/reports/selectors/gst.py` | Same shape from purchases with `itc_eligible` split out | 2 | 01 | 22.11 |
| TSK-RPT-07-03 | Implement the HSN summary | BE | `~@be/reports/selectors/gst.py` | Per HSN: description, UQC, total quantity, taxable value and each tax component | 3 | 02 | FR |
| TSK-RPT-07-04 | Implement the document-series summary | BE | `~@be/reports/selectors/gst.py` | Per series: from, to, total number, cancelled count — the GSTR-1 documents table | 2 | 03 | FR |
| TSK-RPT-07-05 | Implement the B2B / B2C split | BE | `~@be/reports/selectors/gst.py` | Split on the presence of a party GSTIN in the snapshot, not on the party's current GSTIN | 2 | 04 | FR |
| TSK-RPT-07-06 | Implement `GET /reports/gst-summary` | BE | `+@be/reports/views/gst.py` | Period and type parameters; `reports.financial.read` enforced; export wired | 2 | 05 | 22.11 |
| TSK-RPT-07-07 | Reconcile against both registers | Test | `+@be/reports/tests/test_gst_reconcile.py` | GST summary taxable and tax totals equal the sales register and purchase register totals to the paisa for the same period | 3 | 06 | 12.5 |
| TSK-RPT-07-08 | Verify against the rate-change boundary | Test | `+@be/reports/tests/test_gst_rate_boundary.py` | A period spanning 2025-09-21 reports both the old and the new slab correctly | 2 | 07 | 12.5, 21.3.5 |
| TSK-RPT-07-09 | Build the GST summary screen | FE | `+@fe/reports/components/GstSummaryPageContent.tsx` `+@fe/reports/components/{GstSlabTable,HsnSummaryTable,SeriesSummaryTable}.tsx` `~@app/(app)/reports/gst-summary/page.tsx` | Four sections with a period picker; each figure drills through to its documents; export | 5 | 06 | §7 |

**9 tasks, 24.0 points.**

#### RPT-08 — Export (CSV / Excel)

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-RPT-08-01 | Register every report with the export service | BE | `~@be/reports/services/export.py` | Each report declares its columns, headers and number formats once; a test asserts every report is registered | 3 | IMP-02-02 | 22.11 |
| TSK-RPT-08-02 | Implement `GET /reports/exports/{id}` | BE | `~@be/reports/views/export.py` | Status and a tenant-checked download URL; an expired export returns 404 | 2 | 01 | 22.11 |
| TSK-RPT-08-03 | Throttle exports | BE | `~@be/reports/views/export.py` | 10 per hour per user, returning 429 with `Retry-After` | 1 | 02 | 22.1, 12.8 |
| TSK-RPT-08-04 | Wire the export button into every report | FE | `~@src/components/layout/ExportButton.tsx` | Present on all eight reports and every list; the async path shows progress and a notification on completion | 2 | 03, IMP-02-04 | §7 |

**4 tasks, 8.0 points.**

**`EPIC-REPORTS` totals: 36 tasks, 97.0 points**; the Sprint 11 commitment is 50.0, the remainder having landed with the selectors built in Sprints 6, 8 and 10.

---

### 33.5.12 `EPIC-LAUNCH` — DPDP, super admin and the launch checklist (Sprint 12)

#### PLT-10 — Account deletion & data export

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PLT-10-01 | Implement the full-tenant export job | BE | `+@be/platform/services/tenant_export.py` `~@be/platform/tasks.py` | Produces a zip of CSVs covering every business table for the tenant; the file expires after 7 days and the link is tenant-checked | 5 | IMP-02-02 | FR, 12.8 |
| TSK-PLT-10-02 | Implement `POST /tenants/current/export` | BE | `~@be/platform/views/tenant.py` | 202 with a job id; owner only; each request audited | 2 | 01 | 22.3 |
| TSK-PLT-10-03 | Implement the deletion request with a cool-off | BE | `+@be/platform/services/tenant_delete.py` | Requires OTP re-verification; sets `pending_deletion` and `deletion_requested_at`; a 30-day cool-off; `delete-cancel` restores | 3 | 02, PLT-01-04 | FR, 21.3.1 |
| TSK-PLT-10-04 | Implement the deletion job | BE | `~@be/platform/tasks.py` | Deletes children in the Part 21 §21.5 dependency order after the cool-off, with the export produced first; a dry-run mode reports the plan | 5 | 03 | 21.5, FR |
| TSK-PLT-10-05 | Build the export and deletion screens | FE | `+@fe/settings/components/{DataExportPanel,DeleteBusinessPanel}.tsx` `+@app/(app)/settings/data/page.tsx` | The deletion flow states exactly what will be deleted and when, requires typing the business name, and shows the cool-off countdown with a cancel action | 5 | 04 | §7, §9 |
| TSK-PLT-10-06 | Document the DPDP posture | Docs | `+docs/appendix/dpdp-posture.md` | What is collected, on whose behalf, retention, the export path, the deletion path, the grievance contact, and the party opt-out flags gating LED-07 and LED-08 | 2 | 05 | 12.8 |

**6 tasks, 22.0 points.**

#### PLT-14 — Super-admin console

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-PLT-14-01 | Implement the admin selectors | BE | `+@be/platform/selectors/admin.py` | Partner and tenant lists with usage, plan, status and last activity; super-admin only | 3 | PLT-15-03 | 22.3 |
| TSK-PLT-14-02 | Implement entitlement overrides | BE | `~@be/platform/services/entitlement.py` | A per-tenant override on top of the plan, audited with `actor_type='super_admin'` | 2 | 01 | FR |
| TSK-PLT-14-03 | Implement consented impersonation | BE | `+@be/platform/services/impersonation.py` `~@be/platform/views/admin_tenant.py` | Requires a recorded consent flag on the tenant, is time-boxed, writes an audit row on entry and exit, and is visible to the tenant in their audit log | 5 | 02, CHS-AUD-02 | 22.3, 20.4.8 |
| TSK-PLT-14-04 | Implement the admin endpoints | BE | `+@be/platform/views/admin_tenant.py` `~@be/platform/urls.py` | `/admin/partners`, `/admin/tenants`, `/admin/tenants/{id}/impersonate`, `/admin/plans` | 3 | 03 | 22.3 |
| TSK-PLT-14-05 | Build the super-admin console screens | FE | `+@fe/admin/components/{PartnersPageContent,TenantsPageContent,TenantDetailPanel}.tsx` `+@app/(app)/admin/page.tsx` | Search, filter, usage bars, an entitlement editor and an impersonation control with an explicit consent check | 5 | 04 | §7 |
| TSK-PLT-14-06 | Show an impersonation banner to the impersonator | FE | `+@src/components/layout/ImpersonationBanner.tsx` | A persistent banner naming the tenant, the elapsed time and an exit action | 2 | 05 | 20.4.8 |

**6 tasks, 20.0 points.**

#### Launch hardening tasks

| ID | Title | L | Files | Acceptance | P | Deps | FRD |
|---|---|---|---|---|---|---|---|
| TSK-CHS-CI-19 | Run and record the performance suite on the reference device | Test | `+backend/tests/perf/test_budgets.py` `+e2e/perf/` | Every budget in Part 12 §12.5 measured and met at 100,000 ledger rows, 2,000 parties and 5,000 invoices | 5 | CHS-SEED-12 | 12.5 |
| TSK-CHS-CI-20 | `EXPLAIN` review of every list endpoint | Test | `+backend/tests/perf/test_explain.py` | No sequential scan on a table above 10,000 rows in any list query | 3 | 19 | 21.4 |
| TSK-CHS-OBS-05 | Rate-limit the sensitive endpoints | BE | `~@be/platform/throttles.py` `~config/settings/base.py` | OTP, login, share-link and export limits active and asserted | 2 | PLT-01-06 | 12.8, 22.1 |
| TSK-CHS-OBS-06 | Run the PII sweep over logs, events and jobs | Test | `~backend/tests/architecture/test_no_pii.py` | No mobile, party name, note or amount appears in any log line, analytics event or job payload | 3 | CHS-OBS-04 | 12.8 |
| TSK-CHS-CI-21 | Accessibility sweep | Test | `+e2e/a11y/axe.spec.ts` | axe-core reports zero critical violations on every MVP screen at 360 px and 1280 px | 5 | — | 12.8, 23.6 |
| TSK-CHS-I18N-09 | Locale completion sweep | Test | `~frontend/scripts/check-i18n.mjs` | Zero missing keys in either locale; Indian grouping and dd/mm/yyyy verified in both; Devanagari checked on the reference device | 3 | CHS-I18N-03 | 12.8 |
| TSK-CHS-CI-22 | Rehearse and time a restore from backup | Docs | `+docs/appendix/restore-rehearsal.md` | A full restore performed on a clean machine, timed, with the RPO and RTO recorded | 3 | CHS-CI-11 | 12.8, 29.5.1 |
| TSK-CHS-CI-23 | Walk every runbook once | Docs | `~docs/appendix/runbooks.md` | Each of the seven Part 29 §29.11 runbooks executed and corrected | 2 | 22 | 29.11 |
| TSK-CHS-CI-24 | Traceability at 100 % | Test | `~@be/common/management/commands/build_traceability.py` | Zero unimplemented FRD test IDs for any MVP feature; orphans reviewed | 3 | CHS-CI-17 | 28.6.2 |
| TSK-CHS-CI-25 | Rehearse the demo script three times on the production build | Docs | `+docs/appendix/demo-script.md` | The eight-minute script of Part 12 §12.6 executed end to end without an apology, three times, recorded once | 3 | 24 | 12.6, 12.8 |

**10 tasks, 32.0 points.**

**`EPIC-LAUNCH` totals: 22 tasks, 74.0 points**; the Sprint 12 commitment is 49.0, the remainder being hardening that runs continuously from Sprint 10 onward.

---

## 33.6 Phase 2 — epic and task-group breakdown

Phase 2 is given at **epic and task-group depth, not task depth**, for the reasons stated in §33.1.5 and Part 32 §32.14.4: it begins eleven months after this chapter is written, four of its epics depend on external contracts whose shape is unknown, and its velocity will be re-estimated at the phase boundary against Phase 1's actuals.

Each feature below states: its task groups, the points per group, the artefacts it must produce, and its ordering constraints. Decomposing a group into tasks is the first act of the sprint that commits it, using the §33.3 standard shape.

### 33.6.1 `EPIC-P2-DEPTH` — inventory and purchases depth, help (Sprints 13–15, 150 points)

| Feature | Task groups | Pts | Must produce | Ordering |
|---|---|---|---|---|
| **INV-11** Multi-location & transfers | (a) location CRUD surfaced in the UI; (b) `inventory_stock_transfer` + line tables and migration; (c) `post_transfer()` posting `transfer_out`/`transfer_in` atomically under L2 ordering; (d) per-location `on_hand` in every selector, filter and report; (e) transfer editor and list screens; (f) a migration test proving existing stock lands on `MAIN` with zero drift | 22 | A transfer document; per-location stock everywhere; zero drift across locations | Before PUR-06 |
| **INV-14** Secondary units & conversions | (a) `secondary_unit_id`/`conversion_factor` on items; (b) unit selection on every document line with server-side conversion; (c) display in movement history and stock summary | 10 | Buy in boxes, sell in pieces, one on-hand number | After INV-11 |
| **INV-12** Item variants | (a) `inventory_item_variant` table; (b) nullable `variant_id` on `inventory_item_stock`, `inventory_stock_movement`, `sales_document_line`, `purchases_document_line` — **additions only**, never a change of meaning; (c) variant matrix editor; (d) variant-aware search, stock and reports; (e) a migration assigning existing rows a null variant and a test proving pre-variant documents render identically | 26 | Size/colour variants addressable on every line | Before INV-13 and INV-15; bound by Part 13 §13.7's cross-phase constraint |
| **INV-13** Price lists | (a) `inventory_price_list` + items; (b) per-party default; (c) line price resolution order list → item → manual | 12 | Named retail and wholesale pricing | After INV-12 |
| **INV-15** Barcode label printing | (a) Code128/EAN encoder; (b) label sheet layout component; (c) print route with a size picker | 10 | Label PDFs with price | After INV-12 |
| **INV-10** Camera barcode scanning | (a) `getUserMedia` permission flow with a graceful denial; (b) a JS decoder inside the existing `useBarcodeInput` seam; (c) scan mode in item search and the invoice editor | 12 | Camera scanning with the typed path still working | Independent |
| **PUR-05** Purchase order | (a) `kind='purchase_order'` with its six statuses; (b) PO editor reusing the bill editor; (c) share and print | 14 | Draft → sent → received flow | Before PUR-06 |
| **PUR-06** Goods receipt against PO | (a) `kind='goods_receipt'` with `po_id`; (b) partial receipt with `received_qty` tracking; (c) over-receipt warning; (d) receipt into a location | 16 | Partial receipts against a PO | After PUR-05 and INV-11 |
| **PUR-07** Debit note / purchase return | (a) `kind='debit_note'` with `against_id`; (b) `purchase_return_out` movements; (c) supplier ledger debit; (d) application to bills | 14 | Supplier returns mirroring SAL-04 | After PUR-01 |
| **PUR-08** Landed cost allocation | (a) `landed_cost_share` on lines; (b) apportionment by value or weight; (c) unit-cost recomputation feeding the weighted average | 10 | Freight spread into cost | After PUR-06 |
| **HLP-01/02/03** Help centre, contextual help, what's new | (a) `help_article` + feedback + search log tables; (b) Hinglish synonym search; (c) article renderer; (d) `UbHelpHint` wired per screen id; (e) four guided tours; (f) release-notes list. **The content is a project that starts on day one of Sprint 13**; this is only its engineering tail | 24 | A searchable help centre with measurable deflection | Content precedes engineering |

### 33.6.2 `EPIC-P2-PARTNER` — partner platform and messaging channels (Sprints 16–18, 150 points)

| Feature | Task groups | Pts | Must produce | Ordering |
|---|---|---|---|---|
| **WLB-03** Partner domain & login page | (a) hostname → partner resolution middleware ahead of authentication; (b) branded auth screens resolved server-side; (c) certificate and DNS runbook | 18 | A partner hostname branding the login page | Before WLB-06 |
| **WLB-05** Theme tokens & typography overrides | (a) extended token override schema; (b) contrast validation across the whole override set; (c) font-pairing selection | 12 | Validated deep theming | After WLB-03 |
| **WLB-04** Partner admin console | (a) partner-scoped tenant list and usage; (b) entitlement editing within Metis limits; (c) partner-scoped isolation tests (`T-ISO-P*`) | 22 | A console a partner operates themselves | After WLB-03 |
| **NTF-05** WhatsApp Business Platform | (a) `WhatsAppCloudBackend` behind the existing protocol; (b) template registration and status; (c) delivery webhooks; (d) cost accounting per message | 22 | Real template sends with receipts and cost | Before LED-12; Meta verification starts Sprint 13 |
| **NTF-06** Email channel | (a) `EmailBackend` behind the same protocol; (b) document and statement email with the print component as HTML; (c) bounce handling | 14 | Optional email delivery | Independent |
| **WLB-06** Partner-branded messaging | (a) per-partner sender IDs, templates and email domains; (b) resolution from the partner context | 12 | A partner's own sender identity | After WLB-03 and NTF-05 |
| **NTF-04** Web push | (a) service-worker push registration; (b) subscription storage; (c) reminder and payment notifications | 12 | PWA push | After the service worker is live |
| **LED-12** Automated WhatsApp reminders | (a) template selection per bucket; (b) opt-in recording; (c) per-message cost surfaced to the merchant | 12 | Utility-template reminders | After NTF-05 |
| **LED-13** Recurring reminders & schedules | (a) cadence rules per party or route; (b) weekly hisaab day; (c) schedule editor | 12 | Cadence-driven collection | After LED-12 |
| **PTY-07** Add from phone contacts | (a) Web Contacts API with a Capacitor seam; (b) an explicitly on-device picker with no address-book upload; (c) duplicate detection before create | 8 | Contact picking with no upload | Independent |
| **PTY-08** Merge duplicate parties | (a) candidate detection; (b) `merge_parties()` re-pointing ledger entries, documents, payments and reminders in one transaction; (c) a full audit trail making the merge reconstructible; (d) a reconciliation test proving balances survive | 14 | A reversible, auditable merge | Deliberately after eighteen sprints of audit machinery |
| **PTY-09** Party self-view link | (a) `parties_share_link`; (b) a public khata page reusing the statement print component; (c) expiry, revocation and view counting | 12 | An expiring public khata link | After CHS-PRINT-08 |

### 33.6.3 `EPIC-P2-MONEY` — aggregator, sales additions and analytical reports (Sprints 19–21, 150 points)

| Feature | Task groups | Pts | Must produce | Ordering |
|---|---|---|---|---|
| **PAY-06** Payment aggregator | (a) `payments_request` surfaced; (b) a Razorpay adapter behind a provider protocol; (c) orders, payment links and QR; (d) signature-verified webhooks idempotent on `provider_payment_id`; (e) posting **through `record_payment()`**, never a second path; (f) a settlement view | 34 | Auto-posted payments | Before PAY-07; KYC starts Sprint 13 |
| **PAY-07** Unmatched payments queue | (a) unmatched detection; (b) one-tap mapping; (c) `payments_vpa_mapping` learning payer VPA → party; (d) queue-clearance metrics | 16 | An unmatched rate below 5 % | After PAY-06 |
| **SAL-14** Customer-facing invoice page & pay | (a) pay button on the public document page; (b) status polling; (c) receipt on success | 12 | A payable public invoice | After PAY-06 |
| **SAL-09** Delivery challan | (a) `kind='delivery_challan'`; (b) stock movement without a ledger post; (c) conversion to invoice | 12 | Goods movement without an invoice | Independent |
| **SAL-10** Recurring invoices | (a) schedule model; (b) a generation job reusing `issue_invoice()`; (c) a schedule manager screen | 14 | Recurring billing for services | Uses the MVP scheduler |
| **EXP-04** Recurring expenses | (a) schedule model shared with SAL-10; (b) generation job | 8 | Rent and salaries on a cadence | After SAL-10 |
| **IMP-03** Excel templates & bulk edit | (a) XLSX reader behind the existing `ImportMapper`; (b) a bulk price-update mapper; (c) round-trip export → edit → import | 14 | XLSX import and bulk edit | Uses the MVP import engine |
| **PLT-11** App lock / PIN | (a) local PIN with a WebAuthn seam; (b) lock on background; (c) recovery through OTP | 10 | A PWA gate | Independent |
| **RPT-09** Item movement & fast/slow movers | (a) velocity selector over a window; (b) ABC-style banding; (c) screen and export | 10 | Movement velocity | Projection only |
| **RPT-10** Profit summary | (a) COGS from `unit_cost_snapshot`; (b) sales − COGS − expenses by period; (c) reconciliation against the sales register and stock valuation | 14 | A profit number that reconciles | Projection only |
| **RPT-11** Staff performance | (a) sales and collections grouped by `created_by`; (b) period comparison | 8 | Per-user performance | Projection only |
| **RPT-12** GSTR-1 JSON export | (a) the offline-tool schema; (b) section builders B2B, B2CL, B2CS, HSN, DOCS; (c) schema validation against the published spec | 18 | A JSON the offline tool accepts | Builds the schema knowledge Phase 3's e-invoicing needs |

**Phase 2 totals: 34 features' worth of groups across three epics, 450 points**, matching Part 32 §32.14's three 150-point trains.

---

## 33.7 The dependency graph, in text

A drawn graph would be unreadable at 684 nodes. What follows is the same information as a layered description: each layer may only depend on layers above it, and named exceptions are stated.

### 33.7.1 Layer 0 — the substrate (no dependencies)

`CHS-CI-01…07` (repository, tooling, lint, types) and `CHS-TEN-01…02` (project, apps). Nothing else can start until these exist, because every file written before the lint rules exist is a file that has to be re-reviewed after.

### 33.7.2 Layer 1 — the kernel (depends on Layer 0 only)

`CHS-TEN-04…19` (fields, base models, managers, tenancy, middleware, exceptions, envelope, pagination, filters, viewsets, money, dates, logging, fixtures, the isolation sweep), `CHS-AUD-01…05` (audit and `Ctx`), `CHS-IDEM-01…03`, `CHS-JOB-01…09`, `CHS-PERM-01…05`, `CHS-SEED-01…08`.

Within this layer the order is strict and non-obvious in two places:

- **`Ctx` (`CHS-AUD-04`) depends on tenancy resolution (`CHS-TEN-07`), not the other way round.** A `Ctx` built before `get_effective_tenant()` exists would have to be re-shaped.
- **The permission registry (`CHS-PERM-01`) must precede `seed_roles` (`CHS-SEED-01`)**, because the seeded role is the registry's set, not a hand-written list. Seeding first guarantees the two diverge.

### 33.7.3 Layer 2 — the client substrate (depends on Layer 0; partly on Layer 1's API shape)

`CHS-DS-01…15` (tokens, theme, the four waves, the shell), `CHS-I18N-01…08`, `CHS-AUTH-04…10` (axios, refresh queue, paths, errors, session, guards, permissions).

The one hard cross-dependency: **`CHS-AUTH-07` (`ApiError` normalisation) depends on `CHS-TEN-09`/`10` (the exception hierarchy and the envelope)** existing first, because the client switches on the server's `code` strings. Building the client's error union first guarantees a mismatch.

### 33.7.4 Layer 3 — platform features

`PLT-01` → `PLT-02` (password reuses the OTP challenge) → `PLT-03` (onboarding needs a verified user) → `PLT-04` (switching needs more than one tenant) → `PLT-05` (invitations need tenants and roles) → `PLT-06` (settings need a tenant) → `PLT-07` (profile extends the tenant) → `PLT-08`, `PLT-09` (read-only views over what exists). `PLT-15` depends on `PLT-03`; `WLB-02` precedes `WLB-01` logically (a tenant inherits partner defaults) but may be built after, because the inheritance is a resolution-order change rather than a schema change.

**The strongest edge in this layer:** `PLT-03-07` (`allocate_number()`) is depended on by `SAL-02`, `PUR-01`, `PAY-04`, `INV-06` and `EXP-01`. It is small, early and load-bearing, and it is the only place in the product where a hot lock is taken.

### 33.7.5 Layer 4 — parties

`PTY-01` → `PTY-02` (the list needs the model and the queryset) → `PTY-03` (the detail needs the list's selectors) → `PTY-04`, `PTY-05`, `PTY-06`.

`PTY-04-03` (`assert_party_writable()`) is depended on by every module that writes against a party: ledger, sales, purchases, payments, expenses. `PTY-06-01` (`check_credit_limit()`) is depended on by `LED-01` and `SAL-02`. `PTY-02-15` (`usePartySearch`) is depended on by four features' editors.

### 33.7.6 Layer 5 — the ledger spine

`LED-01-04` (`apply_balance_delta`) → `LED-01-05` (`post_entry`) → everything.

`post_entry()` is the single most depended-upon function in the product. Its direct dependents are `LED-02`, `LED-03`, `LED-11`, `SAL-02-11`, `SAL-04-03`, `PUR-01-05`, `PAY-01-03`, `EXP-01-01` and `PTY-10-03`. Its indirect dependents are every report.

`LED-03-01` (`reverse_entry`) is depended on by `SAL-05`, `PUR-04` and `PAY-05` — every void path in the product reverses a ledger entry, and none of them may implement the reversal itself.

`LED-04-01` (the statement selector) is depended on by `RPT-02` and by the print components.

### 33.7.7 Layer 6 — messaging

`NTF-02-02` (the backend protocols) → `NTF-02-03` (concrete backends) → `NTF-02-05` (`send_message`) → `PLT-01-03` (OTP dispatch), `PLT-05-03` (invitations), `LED-06-03` (reminders), `LED-07-02` (auto reminders), `LED-08-01` (transaction SMS), and every Phase 2 channel.

Note the inversion this creates: **`PLT-01` in Sprint 1 depends on `NTF-02-03` in Sprint 5.** This is the one deliberate forward dependency in the plan, and it is resolved by building `ConsoleSmsBackend` and the protocol in Sprint 1 as part of `PLT-01-03`, with the template registry, the message log and the dispatch service following in Sprint 5. The Sprint 1 version writes a log line; the Sprint 5 version writes a `notifications_message_log` row through the same interface. `PLT-01-03`'s acceptance check is written so that both satisfy it.

### 33.7.8 Layer 7 — inventory

`INV-04` (masters) → `INV-01` (items) → `INV-05` (the movement engine) → `INV-02`, `INV-03`, `INV-06`, `INV-07`, `INV-08`.

`INV-05-04` (`post_movement`) and `INV-05-05` (the weighted average) are depended on by `SAL-02-11`, `SAL-04-03`, `PUR-01-05` and `INV-06-03`. `INV-02-09` (`useItemSearch`) is depended on by the invoice and bill editors.

`CHS-SEED-05` (`seed_tax_rates`) is depended on by `INV-01-04` (tax code validation) and `SAL-02-05` (rate resolution). Part 13 §13.7: "tax rates before any document."

### 33.7.9 Layer 8 — documents and money

`SAL-02-07` (the tax engine) → `SAL-02-11` (`issue_invoice`) → `SAL-03`, `SAL-05`, `SAL-08`, `PUR-01-03` (which reuses the engine), `SAL-01-03` (conversion), `SAL-04-03`.

`PAY-01-03` (`record_payment`) → `PAY-02`, `PAY-04`, `PAY-05`, `PUR-02`, `SAL-04-04` (refund settlement), `SAL-02-11.6` (immediate payment), and in Phase 2 `PAY-06` (the aggregator posts through it).

**The one genuine cycle** is `sales ⇄ payments`, broken by the deferred import in `SAL-02-11.6` under rule D5. No second cycle is permitted; if one appears the design is wrong.

### 33.7.10 Layer 9 — projections

Every `RPT-*` task depends on the selectors of the layers above and on nothing in its own layer except `RPT-08` (export), which every other report registers with. `reports` imports selectors only, never services (rule D4).

`EXP-03-01` (cashbook) is the exception that proves the rule: it depends on `PAY-02-02` (mode breakup) and `EXP-01-03`, and it is built in Sprint 10 with expenses rather than Sprint 11 with reports, because it is the consumer that forces `mode_breakup` to be queryable.

---

## 33.8 The critical path

### 33.8.1 The path itself

The longest chain of strictly sequential work through the MVP, with no slack, is:

```
CHS-CI-01 ─ CHS-TEN-02 ─ CHS-TEN-04 ─ CHS-TEN-05 ─ CHS-TEN-06 ─ CHS-TEN-07
   └─ CHS-AUD-04 (Ctx) ─ CHS-PERM-01 ─ CHS-SEED-01
        └─ PLT-03-01 ─ PLT-03-02 ─ PLT-03-04 ─ PLT-03-07 (allocate_number)
             └─ PTY-01-01 ─ PTY-01-02 ─ PTY-01-04
                  └─ LED-01-01 ─ LED-01-02 ─ LED-01-04 ─ LED-01-05 (post_entry)
                       └─ INV-01-01 ─ INV-05-01 ─ INV-05-04 ─ INV-05-05 (weighted average)
                            └─ SAL-02-01 ─ SAL-02-06 ─ SAL-02-07 (tax engine)
                                 └─ SAL-02-11 (issue_invoice)
                                      └─ PAY-01-03 (record_payment)
                                           └─ LED-09-01 (aging CTE)
                                                └─ RPT-07-01 (GST summary)
                                                     └─ CHS-CI-24 (traceability 100 %)
                                                          └─ CHS-CI-25 (demo rehearsal)
```

**Length: 24 tasks, 78.5 points of strictly sequential work.** Everything else in the 684-task breakdown can, in principle, be reordered around it.

### 33.8.2 What the critical path means at a team of one

With a single developer there is no parallel work to absorb slack, so the critical path is not a scheduling device — it is a **risk register**. Its value is that it names the eleven tasks whose slippage moves the launch date one-for-one, and those eleven get the most careful decomposition, the earliest test-first treatment and the most senior review attention:

| Task | Why it is on the path | What slipping it costs |
|---|---|---|
| `CHS-TEN-06` tenant manager | Canon §0.11 rule 2 is un-retrofittable | Every queryset written afterwards must be re-audited |
| `CHS-AUD-04` `Ctx` | Every service signature takes it | Every service signature changes |
| `PLT-03-04` `create_tenant` | Nothing exists without a tenant | All feature work blocks |
| `PLT-03-07` `allocate_number` | Five document kinds need it; it holds the hottest lock | Every document issue blocks |
| `LED-01-05` `post_entry` | Nine callers | Ledger, documents, payments and expenses all block |
| `LED-03-01` `reverse_entry` | Three void paths | Every void path blocks |
| `INV-05-05` weighted average | Sales COGS, purchase costing and valuation | Inventory and both registers block |
| `SAL-02-07` tax engine | Every document total; two implementations must agree | The whole GST half of the product blocks |
| `SAL-02-11` `issue_invoice` | Twelve ordered side effects across four apps | Sales, payments and reports block |
| `PAY-01-03` `record_payment` | Six callers including the Phase 2 aggregator | Payments, allocation and aging block |
| `LED-09-01` aging CTE | Two reports and the dashboard | Collection reporting blocks |

Four of these eleven are money-writing services. That is the reason Part 28 §28.7 puts the 95 % coverage floor on `services/` and the reason Part 34 §34.4 requires test-first for exactly this class of work.

### 33.8.3 Reconciling the bottom-up estimate with Part 32's top-down budget

The two chapters were estimated independently and by different methods, and they disagree. That disagreement is the most important planning fact in this specification, so it is stated plainly rather than smoothed over.

| | Method | Total |
|---|---|---|
| **Part 32** | Top-down: 13 sprints × 50 committed points | **598 points** |
| **Part 33** | Bottom-up: the sum of 684 task estimates | **1,671.5 points** |
| | Ratio | **2.80×** |

Three explanations are possible, and only one of them survives scrutiny.

**(a) The task estimates are simply wrong.** Rejected. They were calibrated against the §33.3 table and cross-checked against the two sampled FRD features; a systematic 2.8× error in the same direction across 684 independent estimates is implausible.

**(b) Part 32's agent multiplier of ×3.0 is too low.** Partly true but insufficient. A multiplier of ×8.4 would close the gap, and no observed figure for supervised agent work on a real codebase supports that.

**(c) The task estimates are *first-instance* estimates, and the breakdown is overwhelmingly repeated patterns.** This is the correct explanation, and it is what §33.3's calibration table actually measures. "3 points for a write service with locks and audit" is the cost of the *first* such service. The thirtieth serializer pair, the fortieth filterset and the twenty-fifth form drawer are not the cost of the first, because the agent is copying a proven pattern from the same repository and the reviewer is checking a diff against a template they have read twenty-four times.

**The reconciliation rule is therefore normative:**

> Every point estimate in §33.4–§33.6 is a **first-instance** estimate. Effective cost is `listed × f`, where `f = 1.00` for the first instance of a pattern in the repository, `0.50` for the second, and `0.20` for the third and every subsequent instance. A "pattern" is a row of the §33.3 standard eleven-task shape, or a named cross-cutting artefact (a `Ub*` wrapper, a print template, a report selector).

Applying the rule to the classified breakdown:

| Class | Share of listed points | Factor | Effective |
|---|---|---|---|
| First instances (the chassis, the tax engine, `post_entry`, `record_payment`, the import engine, the first of each layer artefact) | 18 % — 301 pts | 1.00 | 301.0 |
| Second instances | 7 % — 117 pts | 0.50 | 58.5 |
| Third and subsequent instances (the bulk: repeated serializers, filtersets, slices, drawers, list screens, print variants, report selectors) | 75 % — 1,253 pts | 0.20 | 250.6 |
| **Total effective** | | | **610.1** |

610 effective points against Part 32's 598 committed — a 2 % overage, comfortably inside the 10-point-per-sprint reserve. The two chapters reconcile.

**Two consequences follow, and both are load-bearing.**

First, **the order of the breakdown is not merely a dependency order, it is an economic one.** Building the first instance of every pattern early, deliberately and well is what makes the remaining 75 % cost a fifth of its listed estimate. This is the same argument Part 32 §32.3.2 makes for Sprint 0, expressed in points.

Second, **the reconciliation is falsifiable and must be checked.** Part 32 §32.16.1's velocity recording captures actual points per sprint against listed points. If the observed `f` for third-and-subsequent instances is materially above 0.20 — say 0.35 by the end of Sprint 4 — the MVP takes roughly 19 sprints rather than 13, and Part 32 §32.15.2's re-base trigger fires. **Checking `f` at the end of Sprint 4 is the single highest-value measurement in the whole plan**, because Sprint 4 is the first sprint in which most tasks are repeat instances and it is early enough for a re-base to cost a day rather than a launch.

---

## 33.9 Task and points summary

### 33.9.1 By epic

| Epic | Tasks | Subtasks | Listed pts | Effective pts | Sprints |
|---|---|---|---|---|---|
| `EPIC-CHASSIS` | 133 | — | 306.5 | 168.6 | 0–3, 7, 10 |
| `EPIC-IDENTITY` | 49 | — | 104.0 | 41.6 | 1 |
| `EPIC-GOVERNANCE` | 52 | — | 124.0 | 44.6 | 2 |
| `EPIC-PARTIES` | 53 | — | 110.0 | 37.4 | 3 |
| `EPIC-LEDGER` | 48 | 3 | 117.0 | 52.7 | 4 |
| `EPIC-COLLECTIONS` | 43 | — | 97.0 | 33.0 | 5 |
| `EPIC-INVENTORY` | 65 | — | 153.0 | 53.6 | 6 |
| `EPIC-SALES-CORE` | 61 | 10 | 174.0 | 73.1 | 7–8 |
| `EPIC-PAYMENTS` | 39 | 3 | 103.0 | 37.1 | 8 |
| `EPIC-SALES-PURCH` | 48 | — | 130.0 | 33.8 | 9 |
| `EPIC-MIGRATION` | 35 | — | 82.0 | 28.7 | 10 |
| `EPIC-REPORTS` | 36 | — | 97.0 | 25.2 | 11 |
| `EPIC-LAUNCH` | 22 | — | 74.0 | 40.7 | 12 |
| **Phase 1 total** | **684** | **16** | **1,671.5** | **610.1** | **0–12** |
| `EPIC-P2-DEPTH` | (groups) | — | 150 | — | 13–15 |
| `EPIC-P2-PARTNER` | (groups) | — | 150 | — | 16–18 |
| `EPIC-P2-MONEY` | (groups) | — | 150 | — | 19–21 |

### 33.9.2 By module

| Module | Features | Tasks | Listed pts | Note |
|---|---|---|---|---|
| — (cross-cutting) | — | 133 | 306.5 | The chassis; 45 % of it is the design system and the import engine |
| `platform` | PLT-01…10, 14, 15 | 88 | 199.0 | Largest feature module; identity and governance |
| `white-label` | WLB-01, 02 | 11 | 29.0 | |
| `parties` | PTY-01…06, 10 | 58 | 121.0 | |
| `ledger` | LED-01…11 | 58 | 145.0 | Includes aging and the document integration |
| `notifications` | NTF-01…03 | 18 | 39.0 | The adapter layer is disproportionately early-load-bearing |
| `inventory` | INV-01…09 | 69 | 162.0 | Largest module by task count; the movement engine dominates |
| `tax` | (cross-cutting) | 3 | 7.0 | Seed, resolver, HSN |
| `sales` | SAL-01…08 | 76 | 217.0 | Largest module by points; the tax engine and the editor |
| `purchases` | PUR-01…04 | 24 | 66.0 | Mirrors sales at a third of the cost — the pattern-reuse effect made visible |
| `payments` | PAY-01…05 | 29 | 75.0 | |
| `expenses` | EXP-01…03 | 15 | 37.0 | |
| `imports` | IMP-01, 02 | 11 | 25.0 | Plus 11 engine tasks in the chassis |
| `reports` | RPT-01…08 | 36 | 97.0 | Every task a projection |
| **Total** | **74** | **684** | **1,671.5** | |

### 33.9.3 By layer

| Layer | Tasks | Share | Listed pts | Share | Reading |
|---|---|---|---|---|---|
| **BE** | 274 | 40.1 % | 655.0 | 39.2 % | The largest share, as expected: the invariants live here |
| **FE** | 241 | 35.2 % | 604.5 | 36.2 % | Close behind, because every feature has a screen with ten states |
| **DS** | 20 | 2.9 % | 86.0 | 5.1 % | Few tasks, high points — the `Ub*` waves are large tasks |
| **DB** | 34 | 5.0 % | 58.0 | 3.5 % | Small because migrations are mechanical once the field classes exist |
| **Test** | 62 | 9.1 % | 148.0 | 8.9 % | *Only* the tests that are not co-delivered with their code; the real testing effort is inside the BE and FE numbers |
| **Infra** | 36 | 5.3 % | 92.0 | 5.5 % | Almost entirely Sprint 0 |
| **Docs** | 17 | 2.5 % | 28.0 | 1.7 % | Templates, runbooks, the DPDP posture, the demo script |
| **Total** | **684** | 100 % | **1,671.5** | 100 % | |

Two readings worth recording.

**The BE/FE split is almost exactly even.** That is unusual for a product described as "a backend with screens", and it is correct here: Part 25's ten-state requirement, the i18n obligation, the design-system template and the ban on business logic in components mean a screen is genuinely as much work as the service behind it. A plan that assumed a 70/30 backend split would be six sprints wrong.

**The `Test` layer's 9 % is a floor, not the testing budget.** Part 33 counts only the generated matrices, the E2E suites, the performance fixtures and the reconciliation tests as separate tasks. Unit and API tests are inside their BE and FE tasks by §33.1.4 rule 1, and Part 28's coverage floors mean they are roughly a third of those tasks' points. The true testing share of the MVP is therefore closer to **35 %**, which is what a product whose failure mode is silent arithmetic error should spend.

### 33.9.4 Where the work actually is

| Rank | Slab | Listed pts | Share |
|---|---|---|---|
| 1 | The design system and token pipeline (`CHS-DS`) | 68.0 | 4.1 % |
| 2 | The invoice editor and tax engine (`SAL-02`) | 113.0 | 6.8 % |
| 3 | The ledger spine (`LED-01`) | 55.0 | 3.3 % |
| 4 | The tenancy kernel (`CHS-TEN`) | 45.0 | 2.7 % |
| 5 | The purchase bill (`PUR-01`) | 39.0 | 2.3 % |
| 6 | Record payment (`PAY-01`) | 38.0 | 2.3 % |
| 7 | Team and roles (`PLT-05`) | 34.0 | 2.0 % |
| 8 | Onboarding (`PLT-03`) | 34.0 | 2.0 % |
| 9 | The party list (`PTY-02`) | 35.0 | 2.1 % |
| 10 | The item form (`INV-01`) | 33.0 | 2.0 % |
| | **Top ten combined** | **494.0** | **29.6 %** |

Thirty percent of the listed work is in ten places, and eight of those ten are on or adjacent to the critical path of §33.8.1. That is the sentence to remember from this chapter: **the MVP is not 684 equally risky tasks, it is ten hard things and 674 applications of a pattern.** The plan's whole strategy — Sprint 0's chassis, the design-system waves, the worked examples of Part 34 §34.6, the pattern-reuse factor of §33.8.3 — is built on making the 674 cheap by getting the ten right.
