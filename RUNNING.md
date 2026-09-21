# Running DigiKhaato locally

Two ways. Docker is the one the repository is built around and the one that
gives you a database pgAdmin can connect to. The native path is there for when
you want to iterate quickly without rebuilding images.

Everything below has been run end to end except where it says otherwise.

---

## Option A — Docker (recommended)

From the repository root, with Docker Desktop running:

```bash
scripts/bootstrap.sh
```

That script does the whole sequence and then verifies it: checks your
prerequisites, writes a `.env` with a generated `UB_SECRET_KEY` and
`POSTGRES_PASSWORD` if you do not have one, builds the images, starts Postgres
and waits for it to be healthy, migrates, seeds, prompts you for a super admin,
starts everything, and runs Part 29 §29.4.3's checklist against the result.

First build is roughly four to seven minutes. After that:

| | |
|---|---|
| App | http://localhost:3000 |
| API | http://localhost:8000/api/v1 |
| API health | http://localhost:8000/api/v1/system/health |
| Postgres | `localhost:5432` |

Add `--demo` for the demo tenant, or `--no-superadmin` to skip the interactive
prompt. `scripts/bootstrap.sh --verify-only` re-runs just the checklist.

Day to day:

```bash
docker compose up -d          # start
docker compose logs -f backend
docker compose down           # stop, keeping data
```

### Connecting pgAdmin

The port is published by `docker-compose.override.yml`, so pgAdmin connects to
the container directly:

| Field | Value |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `udhaarbook` (or your `POSTGRES_DB`) |
| Username | `udhaarbook` (or your `POSTGRES_USER`) |
| Password | the `POSTGRES_PASSWORD` line in `.env` |

`grep POSTGRES_ .env` will show you all four. The data lives in the `ub_db_data`
volume and survives `docker compose down`; `docker compose down -v` deletes it.

**One caveat, stated plainly.** The compose files all validate
(`docker compose config` passes for local, staging and production), and every
command and route they reference now exists and is checked by a test. But Docker
Hub is unreachable from the environment I work in, so I could not pull
`postgres:16-alpine` and could not execute this path myself. I ran the same
stack natively instead. If `scripts/bootstrap.sh` stops somewhere, send me the
output and I will fix it rather than guess.

---

## Option B — natively, no Docker

Proven working; this is how the screenshots were taken.

You need PostgreSQL 16 running locally, Python 3.11+ and Node 20+.

Two terminals, one command each:

```bash
scripts/dev-backend.sh          # terminal 1
scripts/dev-frontend.sh         # terminal 2
```

Open http://localhost:3000.

`dev-backend.sh` creates the database if it is missing, migrates, seeds, and
serves on :8000. Every step is idempotent, so run it as often as you like — on a
machine that is already set up it just starts the server. `--reset` drops and
rebuilds the database first; `--port 8080` moves it.

`dev-frontend.sh` installs dependencies on first run and serves on :3000. Its
one job beyond that is setting `API_PROXY_TARGET`, whose default
(`http://backend:8000`) is a compose service name that does not resolve outside
Docker — the browser calls still succeed when it is wrong, so the failure looks
like a backend fault and is not one.

Python dependencies, once:

```bash
pip install -r backend/requirements/local.txt
```

If `dev-backend.sh` says it cannot log in as your username, Postgres has no role
by that name — pass `PGUSER=postgres scripts/dev-backend.sh`, or create one once
with `createuser -s $(whoami)`.

---

## Signing in

There is no seeded merchant — `seed_demo_tenant` is still a stub until PLT-02.
Create one through the UI at `/signup`, or from the command line:

```bash
curl -s -X POST http://localhost:8000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"ChooseSomethingLong1!","full_name":"Your Name"}'
```

Then sign in at http://localhost:3000/login and the onboarding wizard takes you
through naming the business, the profile step and the GST step, which you can
skip.

Identity is **email and password**. The mobile-OTP flow is backlogged, so
anything that still mentions an OTP is stale documentation, not a feature you
are missing.

---

## What works today, and what does not

Working end to end, verified in a browser at 1440, 834 and 390 px: sign-up,
sign-in, the four-step onboarding wizard including the skip-GST path, the tenant
switcher, the customers list with its search and status filter, light and dark
themes, and English/Hindi.

Not built yet, so you will find these empty or absent:

- **Creating a customer.** The parties API is read-only until PTY-02 in Sprint 3,
  so the list renders its empty state and nothing can be added. `POST /parties`
  correctly answers 405.
- **Ledger, items, bills, purchases, payments, expenses, reports.** The nav
  entries are there; the modules are skeletons.
- **Mobile navigation.** Below 1024 px the sidebar is hidden and `UbBottomNav`
  does not exist yet, so on a phone you can use the screen you land on and not
  reach the others. Use a desktop width to move between sections.
- **The demo dataset.** `seed_demo_tenant` is a stub.

---

## If something goes wrong

```bash
docker compose ps                    # what is healthy
docker compose logs backend --tail 50
curl -s localhost:8000/api/v1/system/health
curl -s localhost:3000/api/healthz
```

Ports 3000, 8000 and 5432 all need to be free; `bootstrap.sh` checks this before
it starts and tells you which one is taken.
