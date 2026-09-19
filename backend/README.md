# DigiKhaato — backend

Sprint 0: the chassis and the walking skeleton. No business logic
(Part 32 §32.3).

## Running it

```bash
pip install -r requirements/dev.txt
cp .env.example .env
make migrate        # an explicit step — the entrypoint never migrates
make seed           # idempotent reference data
make run
```

The scheduler is a second process against the same image:

```bash
make scheduler      # python manage.py run_scheduler --interval 5
```

## Checking it

```bash
make ci             # lint + django checks + missing-migration gate + tests
```

## What is here

| Path | What it is |
|---|---|
| `config/settings/{base,local,staging,prod,test}.py` | The four permitted settings modules (Part 20 §20.13.1) |
| `apps/common/` | The shared kernel: tenancy, `Ctx`, envelope, exceptions, money, jobs, audit, idempotency, permissions |
| `apps/platform_app/` | Label `platform`. Partner, plan, tenant, user, membership, role, invitation, OTP, session, settings, sequences, audit log, job, idempotency key |
| `apps/parties/` | The walking skeleton: `Party` plus a read-only, tenant-scoped, permission-checked `GET /api/v1/parties` |
| The other eleven app packages | Real layout, empty-but-valid — the label and the table prefix are reserved from the first commit |
| `tests/architecture/` | The import matrix, the dependency allow-list and the settings posture, as tests |

`NOTES-FOR-REVIEW.md` lists every place the specification said two things and what
was chosen.

## The layering rule

`view → serializer → service → selector → model`, and nothing skips a step.
All business logic lives in `services/`; every read that is more than a
filter-by-pk lives in `selectors/`. The reason is testable: every business
behaviour must be reachable without HTTP, because the API, a CSV import row, a
`platform_job` handler and a management command must all go through the identical
function.
