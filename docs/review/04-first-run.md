# Review 04 — the first-run path, executed

Unlike reviews 01–03, this one ran. A native PostgreSQL 16 instance stood in for the
Docker image (Docker Hub is unreachable from this environment, so `postgres:16-alpine`
cannot be pulled; all four compose files were validated with `docker compose config`
instead). The database was dropped and recreated from nothing, migrated, seeded, and
then walked as a merchant would walk it: register, create a business, three wizard
steps, list parties.

Both findings below are things no test suite could have caught, because both live in
the gap between what the fixtures build and what a real first request does.

## B1 — `make bootstrap` had never worked from a clean clone (fixed)

**Severity: blocking.** The first-run path was broken end to end.

Registration succeeded. The very next call answered:

```
POST /api/v1/tenants
404  No partner is configured. Run `manage.py seed_plans`.
```

So a clean clone could create an account and then not create a business — the whole
product, one step in.

The cause was a naming split. `scripts/bootstrap.sh`, the `Makefile` and Part 29 §29.4
all invoke `seed_all`, `seed_demo` and `seed_e2e`. The commands that exist are
`seed_plans`, `seed_reference_data` and `seed_demo_tenant`. None of the three documented
names resolved, so the documented setup path had never once run to completion.

The test suite could not see this: fixtures build a partner and a plan directly, so
every test ran against a database that had been seeded by a route no user has.

Fixed by creating `apps/platform_app/management/commands/seed_all.py` — one idempotent
command that seeds plans and the default partner first (`platform_tenant` carries
NOT NULL FKs to both) and reference data second — and repointing `Makefile` and
`scripts/bootstrap.sh` at the names that exist. Verified on a virgin database, and
verified a second run is a no-op.

## B2 — an unimplemented method answered 403, not 405 (fixed)

**Severity: major.** Not a hole; a lie.

`POST /parties` returned `403 permission_denied` to an owner holding every permission
in the system. `PartyViewSet` is read-only until `PTY-02` in Sprint 3 — there is no
`create` handler, and the router maps only `get` on that route. But DRF checks
permissions in `initial()`, before dispatch resolves a handler, so the request reached
`HasPermission`, found no `create` entry in the map, and was denied by the fail-closed
rule.

The response told the caller to go and ask their owner for rights. No rights would ever
have made it work, because the endpoint does not implement the method.

A test asserted this behaviour deliberately, citing Part 20 §20.5.5. That was an
over-reading: §20.5.5 governs *actions* — things a viewset does — and says nothing about
HTTP methods with no handler. The spec does not mention 405 anywhere.

Fixed with `_method_has_no_handler()` in `apps/common/permissions.py`, consulted by both
`HasPermission` and `ModuleEnabled`. Where the route's `action_map` has no entry for the
method, the permission class steps aside and lets dispatch answer 405. This grants
nothing: there is no handler to reach.

**The fail-closed rule is unweakened, and that is tested separately.** An action the
viewset *does* implement and the permission map does not cover is still denied — the
accident the rule exists to catch, a handler shipped without its permission entry. See
`test_an_implemented_action_missing_from_the_map_is_still_denied`. The 405 test was
confirmed to fail against the pre-fix code before being kept.

## What this pass did not cover

* **The frontend was not exercised against the live backend.** Nothing has yet driven
  both tiers together through a browser; this walked the API directly over HTTP.
* **Ledger, inventory, sales and purchases are stubs**, so the journey stops after the
  party list. The you-gave/you-got round trip and the running balance are the first
  things to add here once `PTY-02` and the ledger slice land.
* **Docker was not used for the database.** The compose files validate but the images
  cannot be pulled from this environment, so "works under compose" remains unproven.
* **Only the happy path plus one refusal.** Duplicate registration was observed
  returning a correct `validation_error`; no other error path was walked.
