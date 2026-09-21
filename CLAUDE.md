# DigiKhaato — working notes for Claude

Read this before changing anything. It records decisions that have already been
made and paid for; re-litigating them costs a rewrite.

## What this is

A multi-tenant business-ledger and inventory SaaS for Indian small merchants —
parties, you-gave/you-got, running balances, stock, invoices. Runs locally for
one owner first and must stay extensible to a hosted, white-labelled product
without rework.

Django 5 + DRF on PostgreSQL 16, Next.js 16 + React 19 + TypeScript strict.
`backend/`, `frontend/`, specification in `docs/` (49 chapters, `docs/000-index.md`).

## Standing constraints — do not quietly break these

**Minimal third-party dependencies (ADR-021).** No Celery, no Redis: background
work is `platform_job` rows drained by a cron-driven `manage.py run_scheduler`
using `FOR UPDATE SKIP LOCKED`. No S3/MinIO (local `MEDIA_ROOT`), no
Sentry/OTel/Prometheus, client-side PDF via `window.print()`, adapter-only
messaging, local UPI QR. Anything else needs a new ADR. If a fix seems to need a
package, say so instead of adding one.

**Identity is email and password (DEC-010).** The mobile-OTP flow was removed.
Anything still mentioning OTP or SMS is stale documentation or backlogged work,
not a gap to fill. Do not build OTP.

**Nothing is emailed (DEC-012).** `UB_EMAIL_BACKEND` is the console backend and
no provider is being paid for until the platform earns. So an owner adds staff by
creating the account — the server mints a temporary password, returns it once,
and the owner sends it by hand, which is WhatsApp in practice. The invitation
token flow is kept, untouched, because it *is* the email flow the day email
lands. Do not write copy that implies a message was sent.

**The frontend follows BrandHub's Customer module exactly.** Redux Toolkit slices
with `createAsyncThunk`, React Hook Form, a central `useValidationSchemas()` Yup
hook, an `api/<x>Service.ts` layer, shared `utils/` and enums. **TanStack Query is
not used** — this overrides any earlier suggestion to the contrary. TanStack
*Table* inside the data grid is a different thing and is fine.

**No raw host elements in feature code.** No `h1`, `div`, `span` outside
`src/design-system/**` and `app/layout.tsx`; use design-system components.
`react/forbid-elements` enforces it. Central utils and enums, no duplication —
if you write something twice, extract it.

**Errors surface through the global snackbar**, mounted once in `AppProviders`,
never per page.

**Product name is DigiKhaato; the folder stays `ims-platform`** so the name can
change later without a repo move.

## How to work here

The owner asked for a specific loop, in these words: **review, build, look,
report** — design review *before* implementing, not screenshots afterwards. And
after each feature: **bring the stack up, test it like a tester, fix what you
find, then move on.** The step most often skipped is *look*: actually run it and
look at the result.

This has repeatedly paid off. Five separate defects shipped green tests because
nothing exercised the real path: `seed_all`, `seed_demo` and `seed_e2e` were
named by the Makefile and did not exist; `create_superadmin` likewise;
`/api/healthz` was probed by compose and had no route. Two more only appeared
when the two tiers ran together — every cross-origin request failed preflight
because `X-Request-Id` was not in `CORS_ALLOW_HEADERS`, and `/login` redirected
to itself unboundedly. **Verify before fixing**: much of `docs/review/` is
already closed, and re-fixing something is worse than not touching it.

`tests/architecture/test_operator_surface.py` now guards that class — it asserts
every `manage.py` command the Makefile, `bootstrap.sh` and the compose files name
actually exists.

## Running it

```bash
scripts/bootstrap.sh        # Docker: everything, first run creates .env
scripts/dev-backend.sh      # native: creates db, migrates, seeds, serves :8000
scripts/dev-frontend.sh     # native: serves :3000
```

`RUNNING.md` has the detail, including pgAdmin connection and what is not built.
There is no seeded merchant — sign up at `/signup`.

## Gates

```bash
cd backend  && python3 -m pytest -q          # 777 passing
cd frontend && npm run type-check && npm run lint && npm test   # 779 passing
cd frontend && npm run build && npm run bundle:check            # 228.1 KB gz
node e2e/journey.mjs && node e2e/security.mjs && node e2e/credentials.mjs
```

All must stay green. The bundle budget has ~0.9 KB of headroom on `sharedApp`,
and `bundle-budgets.json` explains why that keeps happening: every feature slice
`store.ts` registers statically ships to every route, including the ones that
render a paragraph of text. It has cost +4.5 KB across two features and ledger,
inventory, sales, purchases and reports are all still to come. **§19.3.9 needs a
decision from the owner before the ledger slice lands** — either the shell keeps
growing with every feature, or the store admits lazily registered reducers.

## State

Sprint 1 is in. Parties is **read-only** until PTY-02 in Sprint 3; ledger,
inventory, sales and purchases are skeletons; `seed_demo_tenant` is a stub;
there is no mobile navigation below `lg` (`UbBottomNav` is unbuilt).

`docs/review/01`–`04` are audit findings with their status. `docs/DECISIONS.md`,
`docs/BACKLOG.md` and `docs/CR-LOG.md` carry decisions, deferred work and change
requests. `STATUS.md` is the running summary.

Open decisions needing the owner: DEC-002 (document rendering), DEC-004 (partner
BD owner), DEC-005 (compliance owner). Also unresolved: the party list orders by
`last_activity_at DESC`, and Postgres puts NULLs first, so never-transacted
parties sort to the top — 13.7 ms and 10,001 rows read to return 25 on a tenant
with bulk-imported contacts, against 0.113 ms without. Fixing it means `NULLS
LAST` plus an index, which changes visible ordering and wants a decision.

## Conventions

Commit messages explain *why*, in prose, not bullet lists — they are the main
handover between sessions. Tests get docstrings saying what defect they prevent.
A fix without a test that fails before it is not finished.
