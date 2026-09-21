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

---

# Second pass — the two tiers running together

The first pass drove the API over HTTP. This one ran the real frontend against
the real backend in a real browser (Chromium via Playwright, three viewports:
1440×900, 834×1112, 390×844), because nothing had yet exercised both tiers as
one system. Two blocking defects, both of which made the product unusable, and
neither of which any test could have seen.

## B3 — every cross-origin request failed preflight, so nobody could sign in (fixed)

**Severity: blocking.** Sign-in was impossible in the only topology developers run.

The browser console said it plainly:

```
Access to XMLHttpRequest at 'http://localhost:8000/api/v1/auth/login'
from origin 'http://localhost:3000' has been blocked by CORS policy:
Request header field x-request-id is not allowed by
Access-Control-Allow-Headers in preflight response.
```

`AxiosInstances` mints an `X-Request-Id` on every call. It was not in
`CORS_ALLOW_HEADERS`, and a request header outside that list does not arrive
stripped — the preflight fails and the browser never sends the request at all.
So every call failed, including login.

What makes this one worth dwelling on: `CORS_EXPOSE_HEADERS` sits directly above
the gap, and its comment reasons correctly and at length about exactly the right
thing — that dev is cross-origin and production is same-origin behind nginx, so
a header rule can pass in one and silently do nothing in the other. It then
applies that reasoning only to *response* headers and misses the request-header
half, which is the half that stops the product working rather than merely
blinding a client.

Invisible to 676 backend tests because Django's test client calls the view
directly and never performs an OPTIONS preflight. Invisible in production
because same-origin requests are not subject to CORS. Wrong in exactly the
topology every developer runs, right in the two that are tested.

Fixed by adding `CORS_ALLOW_HEADERS` built from `corsheaders.defaults` plus the
four headers this client actually sends. Note `X-CSRF-Token` is not
`x-csrftoken`: the library default carries Django's spelling and the client uses
the conventional one, so neither covers the other. `apps/common/tests/test_cors.py`
drives real preflights; all six tests were confirmed to fail before the fix.

## B4 — the login page redirected to itself, forever (fixed)

**Severity: blocking.** The login form rendered and was navigated away from
several times a second, so it could never be typed into.

With CORS fixed, the page went blank. It was not blank — it was looping:

```
NAV /login
401 /api/v1/auth/me
NAV /login?next=%2Flogin
401 /api/v1/auth/me
NAV /login?next=%2Flogin%3Fnext%3D%252Flogin
...
```

`SessionBootstrap` calls `GET /auth/me` from the **root** layout, so it runs on
the login screen too and answers 401 for the entirely ordinary reason that
nobody has signed in yet. The transport layer's 401 handler redirected to
`/login?next=<current path>` — and the current path was `/login`. Each pass was
a full page load that re-ran the bootstrap and re-encoded `next`, so the address
doubled in length every time.

The `redirectToLoginOnce` guard could not help: `redirected` is module-level
state and `window.location.assign` is a full page load, so the module is
re-evaluated and the flag is back to `false` on the other side. It stops
concurrent 401s racing; it cannot stop a loop, because the loop goes through the
one operation that resets it.

Fixed by adding `PUBLIC_ROUTE_PREFIXES` and `isPublicPath` to `src/routes.ts` —
where addresses belong — and returning early when the caller is already on an
auth screen. Sending someone who is on the login page to the login page was
never meaningful, so nothing of value was lost. Five tests in
`src/tests/routes.test.ts`, including one asserting the public and app prefix
lists stay disjoint, since a path in both would be guarded as an app route and
skipped as a public one, which is how the loop returns.

## Verified working, all three viewports

Login → `/parties`, at 1440, 834 and 390 px. The rail collapses to a compact
tenant bar below `lg`, search and filter stack, and the empty state reads
correctly. No console errors beyond the expected pre-login 401.

## Known gap, not a defect

**There is no mobile navigation.** Below `lg` the sidebar is hidden and
`UbBottomNav` does not exist yet — `UbAppShell` says so in its own docstring and
names it as post-Sprint-1. A merchant on a phone can reach the screen they land
on and no other. Worth knowing before testing on a phone; it is scheduled work,
not something this pass broke.

## Still not covered

* **Docker.** Hub is unreachable from this environment, so images cannot be
  pulled and the compose path remains validated (`docker compose config`) but
  unproven. The stack was run natively instead: PostgreSQL 16, Django on :8000,
  Next.js on :3000.
* **Only the parties screen.** Dashboard, reminders and settings were not driven.
* **No write path.** Ledger, inventory, sales and purchases are stubs and
  parties is read-only until PTY-02, so nothing has yet been created through the
  UI.
