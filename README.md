# UdhaarBook

A multi-tenant, India-first business ledger and inventory application for the small
shopkeeper: the *khata* (party ledger — "you gave", "you got") that Indian merchants
already keep by hand, plus the invoicing, stock, expenses and GST-shaped reporting
that a shop actually needs, in one application that a merchant's phone and a laptop
reach the same way. It is white-labelable, so a bank or a distributor can put its own
name and colours on it for its own merchants without seeing their books. It runs on
one machine first — one shopkeeper, one laptop, `docker compose up` — and the same
compose topology scales to a small production VPS serving a few hundred tenants
without a rewrite.

---

## Technology stack, and why

| Layer | Choice | |
|---|---|---|
| Backend | Python 3.12 · Django 5 · Django REST Framework | |
| Frontend | Node 20 LTS · Next.js (App Router, standalone output) · TypeScript · Tailwind | |
| Database | PostgreSQL 16 | |
| Background work | `platform_job` rows drained by `manage.py run_scheduler` | ADR-012 |
| Files | Local `MEDIA_ROOT` behind Django's storage API | ADR-013 |
| Observability | Structured JSON logs to stdout + `/system/health` | ADR-018 |
| Runtime | docker-compose: `db`, `backend`, `scheduler`, `frontend` (+ `nginx` in production) | ADR-019 |

Two sentences of reasoning. **Django and PostgreSQL because the product is a ledger
whose correctness is the product** — money, stock and tax need transactions, real
decimals, row locks and a migration story, and a boring ORM over one relational
database gives all four to a very small team without a distributed-systems budget.
**No Celery, no Redis, no S3, no Sentry, because every one of those is a service to
run, a failure mode to learn and a bill to pay for a product whose first deployment is
one laptop** — a job table drained by a supervised loop, a local media directory
behind the storage API and JSON on stdout do the same work at this scale, and each has
a named, ordered upgrade path (Part 29 §29.10) taken only when a measured trigger says
so.

---

## Repository layout

```
.
├── backend/                 Django project: config/, apps/, requirements/, tests/
│   ├── Dockerfile           multi-stage: `dev` (bind-mounted) and `runtime`
│   └── entrypoint.sh        waits for the database and execs — it never migrates
├── frontend/                Next.js app: app/, src/, locales/, public/
│   └── Dockerfile           multi-stage: `dev`, `build`, `runtime` (standalone)
├── e2e/                     Playwright specs, desktop and 360 px mobile projects
├── docs/                    the specification (vendored) — see below
├── nginx/                   production reverse proxy: TLS, static, X-Accel media
├── scripts/                 the operator's tools (see the table below)
├── ops/                     DEPLOY_LOG, INCIDENTS.md — written by operators
├── docker-compose.yml       base topology, used by every environment
├── docker-compose.override.yml   LOCAL, auto-loaded
├── docker-compose.staging.yml
├── docker-compose.prod.yml
├── .env.example             the complete environment catalogue (Part 29 §29.2.4)
└── Makefile                 the operator surface — `make help`
```

| Script | What it does |
|---|---|
| `scripts/bootstrap.sh` | Clean clone → working app, then Part 29 §29.4.3's verification checklist |
| `scripts/wait-for-db.sh` | Blocks until PostgreSQL is accepting connections (or the compose healthcheck passes) |
| `scripts/backup.sh` | One verified backup cycle: dump, media snapshot, **restore-verify**, retention, off-host copy |
| `scripts/backup-loop.sh` | The `backup` service's entrypoint: sleeps until `BACKUP_HOUR_UTC`, then runs the cycle |
| `scripts/restore.sh` | Part 29 §29.11.7, executable. Destructive, and refuses to run without saying so |
| `scripts/smoke.sh` | Post-deploy smoke test (Part 29 §29.6.3) |
| `scripts/check_table_ownership.py` | Canon §0.12.5: one owner per normative table, plus the error-code registry check |
| `scripts/check-contrast.mjs` | Part 23 §23.6: recomputes every WCAG pairing from `frontend/src/styles/tokens/*.css` |
| `scripts/postgres-init/` | Extensions and the read-only backup role, created once as the bootstrap superuser |

---

## Quickstart

Prerequisites: **Docker Engine ≥ 24 with Compose v2**, 8 GB RAM, 10 GB free disk,
ports 3000 / 8000 / 5432 free. Nothing else — no local Python, no local Node.

```bash
git clone <repo> udhaarbook && cd udhaarbook
./scripts/bootstrap.sh
```

That script *is* Part 29 §29.4.1, executed rather than copy-pasted: it checks the
prerequisites, writes `.env` from `.env.example` with a generated `UB_SECRET_KEY` and
`POSTGRES_PASSWORD`, builds the images, starts the database and waits for it to be
healthy, **runs migrations as an explicit step**, seeds reference data, creates the
super admin, starts everything and then runs §29.4.3's verification checklist. Add
`--demo` for a populated demo tenant. First build is 4–7 minutes.

By hand, if you would rather see each step:

```bash
cp .env.example .env && chmod 600 .env
python3 -c "import secrets; print('UB_SECRET_KEY=' + secrets.token_urlsafe(64))" >> .env
python3 -c "import secrets; print('POSTGRES_PASSWORD=' + secrets.token_urlsafe(24))" >> .env

docker compose build
docker compose up -d db && ./scripts/wait-for-db.sh --compose
docker compose run --rm backend python manage.py migrate     # step 5: explicit, always
docker compose run --rm backend python manage.py seed_all
docker compose run --rm backend python manage.py create_superadmin
docker compose up -d
open http://localhost:3000
```

**Why migrations are their own step and always will be.** The container entrypoint
waits for the database and then `exec`s its command — nothing more. It does not
migrate, because two containers starting together would race on the migration table,
because a failed migration must stop a deploy with a clear error rather than produce a
crash-looping container that hides the cause, and because the old code must keep
working against the new schema for the seconds between migrate and restart. The
consequence is intended: **a container started against an unmigrated database fails its
health check.** Run `make migrate` first. (Part 29 §29.5.2, Part 20 §20.13.5.)

Day to day:

```bash
make up          # start everything          make logs SERVICE=scheduler
make migrate     # apply migrations          make seed
make down        # stop; volumes survive     make nuke   # destroy all local data
make help        # everything else
```

> **Bootstrap timing.** Sprint 0's exit criteria (Part 32 §32.3.7) require the §29.4.1
> sequence to be executed verbatim, timed, and the timings recorded here.
> `scripts/bootstrap.sh` prints its elapsed time at the end. Record it below when you
> first run it on a clean machine.
>
> | Machine | Date | First build | Full bootstrap |
> |---|---|---|---|
> | _(record your first clean run here)_ | | | |

---

## Running the tests

```bash
make check       # lint, format, types, AST rules, makemigrations --check, spec checks
make test        # pytest (fast bands) + jest, both with coverage
make e2e         # Playwright @smoke against the compose stack
make ci          # all of the above plus traceability — what CI runs
```

Narrower:

```bash
make test-backend                 # pytest -m "not slow" --cov
make test-frontend                # jest --coverage
make check-spec                   # ownership + contrast + i18n key completeness
python3 scripts/check_table_ownership.py     # canon §0.12.5, standard library only
node scripts/check-contrast.mjs --print      # regenerates Part 23 §23.6's table
```

The commands are the contract and the CI platform is not: `.github/workflows/ci.yml`
runs exactly these, so a green `make ci` locally is a green pipeline. The gates that
block a merge are Part 28 §28.11.2 — lint and types clean, tests green, coverage at
the §28.7 floors and not down by more than 0.5 pp, query budgets respected,
traceability showing no unimplemented FRD test ID for a feature the PR marks done, the
permission-matrix and isolation sweeps passing, at most one new migration, `en` and
`hi` keys both present, and no secrets or production data in the tree.

One deliberate exception, and it is written down so nobody switches the check off: in
`check_table_ownership.py` the `DUPLICATE`, `DRIFT` and `PAIRED` classes block a merge
from the first run; the `ORPHAN` class (an error code used with an HTTP status and
absent from Part 22 §22.1.1) runs in **warn** mode until the §22.1.4 corrections land
in Parts 17-01…17-04, 20, 21, 24 and 27 — one change request per chapter, tracked in
`docs/CR-LOG.md` — and flips to blocking at the same commit as the last of them
(Part 22 §22.1.5). The split lives in the workflow, not in the script, so removing it
is one line.

---

## The specification

The whole specification is vendored in [`docs/`](docs/) and it is normative: where this
code and a chapter disagree, the chapter is right until a change request says otherwise.

- **Start at [`docs/000-index.md`](docs/000-index.md).** It is the entry point and maps
  every chapter to what it owns.
- **[`docs/00-canon.md`](docs/00-canon.md)** is the shared vocabulary, the path
  inventory, the table inventory and — in §0.12 — the ownership index that says which
  chapter owns each normative table. One owner, always; a copy is a defect, and
  `scripts/check_table_ownership.py` is the check that says so.
- **Open blocking items: [`docs/42-cross-role-review.md`](docs/42-cross-role-review.md)
  §42.6.1**, "The blocking checklist". Every item there must be true before the corpus
  is handed to an agent — five product decisions (the paid wall, document rendering,
  the dependency policy split, the Phase 2 variant, a compliance owner with DLT
  registration started) and the corpus-integrity amendments. Read it before assuming a
  chapter is settled.
- `scripts/check_table_ownership.py` resolves `docs/` as a sibling of `scripts/`, so
  the specification must be vendored into this repository for `make check-spec` and the
  CI `spec-consistency` job to run at all. CI says so explicitly rather than failing on
  a missing file.
- Change requests are tracked in [`docs/CR-LOG.md`](docs/CR-LOG.md) and decisions in
  [`docs/DECISIONS.md`](docs/DECISIONS.md) and
  [`docs/38-architecture-decision-records.md`](docs/38-architecture-decision-records.md).

Chapters this repository's infrastructure materialises directly: Part 29 (DevOps and
deployment — the compose files, both Dockerfiles, the entrypoint, the nginx config, the
backup and restore scripts and the `.env` catalogue), Part 28 §28.11 (the CI pipeline
and its gates), canon §0.12.5 and Part 22 §22.1.5 (the ownership check and its word
list), Part 23 §23.6 (the contrast gate) and Part 32 §32.3 (Sprint 0).

---

## Contributing

Read these three before your first pull request, and treat them as binding:

- **[`docs/25-frontend-coding-standards.md`](docs/25-frontend-coding-standards.md)** —
  the import zones, the component template, the state rules, the accessibility review
  checks. No deep design-system imports, no `../../../`, no axios outside `api/`, no
  `any`, no default exports outside route files.
- **[`docs/26-backend-coding-standards.md`](docs/26-backend-coding-standards.md)** —
  the app dependency matrix, services vs selectors, money and rounding, the tenant-scoped
  manager. `Model.objects` is scoped; `all_objects` is audited and importable only from
  an allow-listed module.
- **[`docs/35-definition-of-done.md`](docs/35-definition-of-done.md)** — what "done"
  means for a feature. A feature is not done when it works; it is done when it meets
  that list.

The practical rules that follow from them:

1. `make check && make test` before you push. Pre-commit hooks format; they never run
   tests, and they never reject you for formatting — they fix it.
2. A suppression (`# noqa`, `eslint-disable`, `@ts-ignore`) needs a trailing
   `— reason: …` on the same line, or CI fails.
3. One new migration per pull request, reversible or explicitly declared otherwise, and
   expand/contract only: never `NOT NULL` without a default in one step, never a rename,
   indexes added `CONCURRENTLY` (Part 29 §29.5.3).
4. A new endpoint arrives with its permission-matrix row, its tenant-isolation coverage
   and its `en` **and** `hi` keys, or the build fails.
5. Never commit `.env`, a real mobile number, or production data.
6. New colour token → add its pairing to `scripts/check-contrast.mjs`. New normative
   table → add its row to canon §0.12.2 in the same commit.

---

## Where this repository differs from Part 29

Three path differences, made deliberately and recorded here rather than left to be
discovered. Nothing about the shape or the behaviour of any artefact changed.

| Part 29 writes | Here | Why |
|---|---|---|
| `backend/ops/entrypoint.sh` | `backend/entrypoint.sh` | One file, at the root of its build context, referenced as `/app/entrypoint.sh` |
| `ops/nginx/nginx.conf`, `ops/nginx/conf.d/` | `nginx/nginx.conf`, `nginx/conf.d/` | The reverse proxy is a top-level concern, not a subdirectory of an ops grab-bag |
| `ops/backup/run.sh`, `ops/backup/loop.sh` | `scripts/backup.sh`, `scripts/backup-loop.sh` | All operator tooling in one directory; `scripts/` is mounted into the `backup` container at `/opt/ops` |
| `ops/postgres/init/` | `scripts/postgres-init/` | Same reason |

One functional correction, made because the artefact as written does not work:

- **`env_file: [.env]` on `backend`, `scheduler` and `backup`.** §29.2.2's
  `x-backend-env` block names about twenty of the roughly forty-five `UB_` variables
  the §29.2.4 catalogue defines. A variable that is in `.env` but in no `environment:`
  block is used by compose for *interpolation* and never reaches the container, so
  `UB_OTP_PEPPER`, `UB_COOKIE_SECURE`, `UB_RATE_LIMIT_*`, `UB_VERSION`, `UB_JOBS_EAGER`,
  `UB_DB_STATEMENT_TIMEOUT_MS` and a dozen others would be silently absent from Django's
  environment — exactly the "silent and deadly" failure §29.2.4 sets out to prevent.
  `env_file` loads the whole catalogue; the explicit `environment:` entries still win
  over it, so every default and every `:?required` guard in the chapter's file is
  unchanged. The consequence is that `.env` must exist before any compose command —
  `scripts/bootstrap.sh` creates it as its first action and CI writes it from
  `.env.example`.

Two content notes, both recorded where they were found:

- **Scheduler cadence.** Part 29 §29.2.2's compose file runs the loop at
  `--interval 60` (`UB_SCHEDULER_INTERVAL`, default 60) and the local overlay at 30;
  Part 20 §20.8.6.1's prose says "the compose `scheduler` service runs the loop
  (`--interval 15`)". Part 29 owns the compose file, so 60/30 is what is written here.
- **`.env.example` completeness.** §29.2.4's catalogue is reproduced in full and in
  order. Three variables the compose files interpolate are *not* in that catalogue
  because they are compose build selectors rather than application settings —
  `BACKEND_TARGET`, `FRONTEND_TARGET` and `NODE_ENV`. They are listed in a clearly
  separated final section so that the "every interpolated variable is in `.env.example`"
  check can pass without pretending they are application settings.
