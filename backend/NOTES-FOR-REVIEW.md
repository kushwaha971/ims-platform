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

---

# Notes for review — Sprint 1 backend (PLT-01…PLT-04, PLT-15)

Same rule as above: every place where the specification said one thing and the
repository does another, or where the specification said two things. Each item
names the chapter, the conflict and the choice. The corresponding `CR-LOG`
entries are listed in the sprint report; `docs/` is not ours to edit.

## 10. The decision this sprint was built on

`DEC-001` was **defaulted** on 2026-09-19 to option (b): at MVP `PLT-15`
enforces **module entitlement and member count only**, the ledger is never
capped, `max_parties` and `max_invoices_per_month` are removed from enforcement
on every MVP plan, and the free tier is owner plus two members.

Where that shows up in the code:

* `apps/platform_app/services/entitlements.py` — `LIMIT_KEYS` is
  `("max_users", "storage_mb")` and `REMOVED_AT_MVP` names the two keys that are
  gone, so reintroducing one is an edit to a list rather than a forgotten `if`.
* `apps/common/permissions.py::PlanLimit` raises `ImproperlyConfigured` for a
  key outside `LIMIT_KEYS`, so a later sprint cannot quietly re-enable one.
* `manage.py seed_plans` seeds `free` with `max_users: 3` — **not** Part 24
  §24.9.1's `max_users: 1, max_parties: 300, max_invoices_per_month: 100` — and
  omits the two removed keys entirely rather than setting them to `null`, so a
  reader cannot mistake them for a limit that happens to be unlimited.
* `test_no_removed_limit_key_is_read_anywhere_in_the_codebase` is a structural
  assertion that no module outside those two files even mentions them.

`CR-124` (already named by `DEC-001`) is the change that makes Part 24 §24.9.1
match. Until it lands, Part 24 §24.9.1 and this repository disagree by design.

## 11. New tables, columns and claims the specification does not register

| Thing | Why it exists | What the specification says |
|---|---|---|
| `platform_rate_limit` | Part 27 §27.4.1 makes it a **normative implementation detail** that throttle state lives in PostgreSQL "(`platform_rate_limit` counter rows with a `window_start`), not in `LocMemCache`" — there is no shared cache (ADR-012) and a per-process counter is bypassed across gunicorn workers | Part 21 §21.3 (T-08, the owner of table definitions) does not define it. Part 22 §22.1.4 lists the *string* `platform_rate_limit` in its table of non-canonical **error-code** spellings, which is a different kind of name. Part 21 §21.3.1 needs the table. |
| `notifications_message_log.tenant_id` nullable | `PLT-01` FR-3 requires a `message_log` row for every OTP dispatch, and AC-5 makes the row the acceptance check. An OTP is sent before any tenant context exists. | Part 21 §21.3.2 does not mark the column nullable. |
| `platform_idempotency_key.tenant_id` nullable, plus `U(user_id, scope, key) WHERE tenant_id IS NULL` | `PLT-03` EC-7 requires `POST /tenants` to replay on retry, and that key is presented before a tenant exists. PostgreSQL treats NULLs as distinct, so the existing `U(tenant, scope, key)` would not lock the tenant-less case at all. | Part 21 §21.3.1 has `tenant_id` NOT NULL ("keys are scoped per tenant"). |
| `inventory_location` | `PLT-03` FR-6 seeds `MAIN`; Part 32 §32.4.4 lists it in PLT-03's task; Part 32 §32.9 says the row "has existed since Sprint 1" so `INV-11` is a UI change and not a migration of live stock. | Part 21 §21.3.6 defines the table; no sprint before this one built it. |
| `epo` access-token claim | Part 21 §21.3.1 requires that "access tokens carry the epoch they were minted under; the authentication class rejects a token whose epoch is behind the row", and Part 27 §27.4.4 step 2 makes bumping `token_epoch` the containment action for a stolen token. Without a claim there is no mechanism. | Part 20 §20.5.1's claim table lists `sub, tid, rol, sid, ver, typ, exp, iat, jti` and no epoch. |
| `parties.labels`, `inventory.favourite_units`, `plan.overrides` tenant-setting keys | The first two are required by `PLT-03` FR-6, which itself marks them "Canon change requests"; the third is read by `PLT-15` FR-2 and §15. | Part 21 §21.3.1's well-known key list (T-27) has none of the three. |
| `POST /tenants`, `POST /invitations/{token}/accept` | `PLT-03` §14 CCR-1 and `PLT-05` §14 CCR-5 both name them as change requests. | Canon §0.8's path inventory has neither. |
| `X-Tenant-Id` **response** header | `PLT-04` FR-4 CCR-3: the client's interceptor compares it with the active tenant and discards a stale-tab response. Emitted on `POST /auth/switch-tenant` and `POST /tenants`. | Part 22 §22.1 names `X-Tenant-Id` only as a **request** header that is never trusted. |
| `UB_ALLOW_CONSOLE_SMS` | `PLT-01` EC-6: `check --deploy` must fail when the console SMS backend meets `DEBUG=False`, "unless `ALLOW_CONSOLE_SMS=true` (single-user local deployment)". | Part 29 §29.2.4's catalogue (T-28) does not list it. It is added to `.env.example` and `apps/common/env_catalogue.py`. |

No new **error code** was invented: every code this sprint emits
(`otp_invalid`, `otp_throttled`, `login_throttled`, `invalid_credentials`,
`invalid_token`, `session_revoked`, `no_active_tenant`, `gstin_in_use`,
`last_owner`, `invitation_invalid`, `plan_limit_reached`, `module_disabled`,
`idempotency_conflict`, `idempotency_in_progress`, `validation_error`,
`not_found`, `permission_denied`, `unauthenticated`) is already in Part 22
§22.1.1.

## 12. Specification conflicts, and which side was built

### 12.1 Password composition rules — `PLT-02` FR-2 versus Part 27 §27.4.2

`PLT-02` FR-2 and §10 require "at least one letter and one digit" and cap the
length at 128. Part 27 §27.4.2's table says composition rules: **None** — "length
plus a breach check beats character classes" — and adds a **10-character minimum
for `owner` and `admin`** and `UserAttributeSimilarityValidator`, neither of
which the FRD mentions.

`apps/platform_app/services/passwords.py::validate` enforces the **union**: the
FRD's regex, the FRD's "not the mobile digits", Part 27's 10-character floor for
anyone holding `owner` or `admin` anywhere, and Django's whole validator stack.
A password that satisfies both readings is accepted either way; the only
observable difference is that an owner's nine-character password is refused by
the server although the client's mirrored regex would pass it.
**Either `PLT-02` §10 gains the privileged-length row, or Part 27 §27.4.2 drops
it.** `test_owners_and_admins_need_ten_characters` is where to change it.

### 12.2 Login throttle numbers — `PLT-02` FR-6 versus Part 27 §27.4.2

FR-6 says "10 failed attempts per mobile per **15 minutes** → 429". §27.4.2 says
"10 attempts per mobile per **10 min**, then **15-minute lockout**; 100 per IP
per hour". These are different mechanisms, not different numbers for one
mechanism. Part 27 is built, because it is the chapter that owns the control and
because "window plus lockout" is the only one of the two that a determined
attacker cannot simply wait out at a fixed rate. The IP ceiling exists only in
Part 27 and is built too.

The attempt that *reaches* the threshold still answers `401 invalid_credentials`
like the nine before it; the lockout applies from the next call. FR-6 counts the
eleventh as the throttled one, which is exactly this behaviour.

### 12.3 `admin` and `platform.tenant.manage`

Canon §0.9's role table excludes `platform.tenant.manage` from `admin` and
annotates the exclusion **"(partial)"**, explaining it as "everything except
tenant deletion, ownership transfer, billing". Sprint 0's registry cannot hold
"partial" and so gives `admin` the codename not at all
(`test_admin_lacks_only_tenant_manage`). But Part 22 §22.3 says `PATCH
/tenants/current` is "(owner/admin)" and `PLT-03` §12's matrix says "Complete/
edit wizard for current tenant — owner ✅ **admin ✅** staff ❌ accountant ❌".

The split therefore lives at the endpoint: `TenantManagePermission` admits the
codename **or** the `admin` role for the tenant *profile*, and the three things
canon actually withholds — `POST /tenants/current/delete-request` (PLT-10),
ownership transfer (PLT-05) and billing (PLT-16) — will require the codename
itself when they land. **Canon §0.9 should either split the codename in two
(`platform.tenant.manage` / `platform.tenant.delete`) or state the exception in
words a registry can hold.**

### 12.4 The console SMS logger's name

`PLT-01` FR-3 names the logger `notifications.sms.console` and the line
`OTP for +91XXXXXXXXXX (purpose=login): 123456`. Part 20 §20.5.4 names the
logger `ub.sms`. Sprint 0 built `ub.notifications` and logged the recipient
**masked** and the body **not at all**, which makes `PLT-01` AC-5 — "the code
appears in the backend log" — unachievable.

`ConsoleSmsBackend` now logs the full body (which contains the code) and keeps
the recipient masked. The pairing of a full number with a live code is what a
log must never hold; either half alone is useless. The logger stays
`ub.notifications`, because Part 20 §20.13.4's logging config is built on
`ub.<app>`. **Three chapters name three loggers; one of them has to give.**

### 12.5 `notifications_notification` is not written

`PLT-03` FR-11 wants an in-app `onboarding.completed` notification and `PLT-04`
§17 wants `team.member_left`; `PLT-15` §17 wants three more. The in-app inbox
table is `NTF-01`'s and does not exist. Every one of those events is written to
`platform_audit_log` instead, which is where an operator can already see it, and
`NTF-01` is where the inbox rows get added. Nothing is silently dropped: the
events exist, the delivery channel does not.

## 13. Two Sprint 0 defects this sprint had to fix

### 13.1 `idempotent()` burned a key when the view raised

`apps/common/idempotency.py` deleted the claimed key for a non-2xx **response**
but not for an **exception**, and a serializer rejection is an exception. The row
stayed `in_progress` for its full 24 hours, so a user who corrected the field
they got wrong was answered `409 idempotency_conflict` instead of the fix they
had just made. The wrapper now deletes the row in an `except` as well.
`test_a_short_name_or_an_unknown_type_is_a_validation_error` is the guard.

### 13.2 A revocation inside a failing transaction is not a revocation

Three places in this sprint had the same shape: detect a violation, write the
consequence, raise. Raising inside `transaction.atomic()` rolls the consequence
back, so the refresh-token family was never revoked, the expired invitation was
never marked `expired`, and the `plan.limit_hit` audit row §16 requires "even
though the request failed" never existed.

All three now decide inside the transaction and write outside it:
`sessions.rotate` does its refusals after the atomic block closes,
`memberships.accept_invitation` handles expiry in a first pass, and
`plan.limit_hit` is written by the DRF exception handler once the caller's
transaction has unwound — which is precisely `PLT-15` §16's "the audit write
happens in a separate autocommit call".

## 14. What `PLT-15` FR-3 names that Sprint 1 could not hook

| Limit key | Enforcement point | State |
|---|---|---|
| `max_users` | `POST /memberships/invite` | The endpoint is `PLT-05`. `entitlements.assert_can_add_member` is exported for it and is called at the other two points. |
| `max_users` | invitation accept, `PATCH status→active` | Built and tested. |
| `storage_mb` | any attachment upload | No upload endpoint exists until the `files` app. Reported by `/auth/me`, gated nowhere. |
| `max_parties`, `max_invoices_per_month` | — | Removed by `DEC-001`. |

## 15. `two_tenants_full` was not extended

The fixture's contract is that each sprint adds its rows to both tenants.
Sprint 1's tenant-scoped rows — `platform_tenant_setting`,
`platform_document_sequence`, `expenses_category`, `inventory_location` — have
no list endpoint yet, so the isolation sweep has nothing to sweep for them. They
should be added to the fixture by the sprint that exposes them (`PLT-06`,
`INV-11`, `EXP-02`), and the cross-tenant assertions for the endpoints that do
exist live in `tests/integration/test_sprint1_matrix.py`.

---

# Sprint 1a — identity moves from mobile to email (DEC-010)

The owner's decision: **at MVP, authentication is email plus password.** Mobile
OTP, the SMS adapters and everything else that needs a telecom provider move to
the backlog. The reason is not a change of mind about OTP — it is that this
product runs locally for its owner first, with as few third-party dependencies
as the feature set allows, and messaging features come later. Everything below
follows from that sentence.

Nothing was demolished. The OTP service, its model, its serializers, its views
and its 37 tests are intact; what changed is that they are behind a flag that is
off.

## 16. What identity is now

| | Before | After |
|---|---|---|
| Login identifier | `platform_user.mobile`, NOT NULL UNIQUE | `platform_user.email`, NOT NULL UNIQUE |
| `mobile` | the identity | optional profile field, still E.164-validated, still unique **where not null** |
| `USERNAME_FIELD` | `mobile` | `email` |
| Sign-up | `POST /auth/otp/request` → `/auth/otp/verify` | `POST /auth/register` |
| Sign-in | `POST /auth/login` with mobile *or* email | `POST /auth/login` with email |
| Reset | OTP to the mobile | single-use hashed link, delivered through the email adapter |

### 16.1 Why `mobile` keeps a unique index

The decision says uniqueness *moves* to email; it does not say the number may be
shared. `PLT-05`'s invitation flow still matches an invitation to a person by
number (`memberships.accept_invitation`), and two `platform_user` rows with the
same number would make that match ambiguous — a correctness bug, not a policy
one. So the column keeps `U WHERE mobile IS NOT NULL`. Two accounts with **no**
number do not collide, which is the case a plain unique index on a nullable
column already gets right and an empty-string default would have got wrong;
`UserManager.create_user` therefore coerces `""` to `NULL`.

`CR-LOG` carries the request that invitations move to email, which is where they
belong now and which is `PLT-05`'s to decide.

### 16.2 The OTP account's synthetic address

`email` is NOT NULL, and an OTP sign-up has no address to put in it. With the
flag on, `services.auth.get_or_create_user` writes
`919876543210@mobile.invalid` — `.invalid` is reserved by RFC 2606 §2 exactly so
such a value can never be routed anywhere. The account is reachable by OTP and by
nothing else, and a password reset for it can never be delivered. That is the
honest description of an account whose only proof is a phone number, and it is
the same value the data migration backfills for any pre-existing user without an
address.

## 17. Password reset with no mail provider, and no hand-waving

Part 27 §27.4.2 requires the reset token to be "single-use, 15-minute, hashed at
rest". All three are now properties of a row, `platform_auth_token`, rather than
of the code that reads it, so they stay true of whatever provider replaces the
console one.

Delivery goes through a new adapter seam that is deliberately the same shape as
the SMS one: `apps/common/integrations/email/{base,console}.py`, resolved from
`UB_EMAIL_ADAPTER`, writing one `notifications_message_log` row per attempt via
`services.messaging.send_email`. `ConsoleEmailBackend` logs the body — link
included — exactly as `ConsoleSmsBackend` logs the OTP, and masks the recipient
for the same reason: the pairing of a full address with a live token is what a
log must never hold.

Three properties are asserted rather than assumed
(`tests/test_passwords.py`): the token is never in the response body or in the
`MessageLog.payload`; the request answers identically for an address nobody has
registered; and asking twice kills the first link.

`UB_EMAIL_ADAPTER` is a **different setting** from `UB_EMAIL_BACKEND`. The
latter is Django's own `EMAIL_BACKEND`, which nothing in this product uses yet;
the former is our `MessageLog`-writing seam. Swapping in a real provider is one
line of `.env` and no code.

There is deliberately **no** `check --deploy` gate on the console *email*
backend, unlike the SMS one. A deployment whose reset links go to a log is the
single-user local deployment this product is being built for first; when a
provider is added, a gate mirroring `platform.E001` should be added with it.

## 18. Email verification: plumbed, off, and not a gate

`platform_user.email_verified_at`, the `email_verify` purpose on
`platform_auth_token`, `POST /auth/email/verify/request` and `/confirm`, the
`email_verify` template and the `UB_EMAIL_VERIFICATION_ENABLED` flag all exist.
With the flag on, registration sends the link and `/auth/me` reports
`email_verification_required: true`.

**It never blocks a login, in either flag state**, and
`test_with_the_flag_on_registration_sends_a_link_and_login_still_works` is the
assertion. Making it a gate needs a registered error code, and Part 22 §22.1.1
does not have one — `member_email_unverified` is listed there as an unregistered
Phase 2 spelling. Inventing a code is precisely what the registry exists to
prevent, so `CR-LOG` carries the request instead.

## 19. How OTP is retired

One flag, `UB_AUTH_OTP_ENABLED`, default `0`.

* `urls_auth.py` appends `urls_otp.py`'s patterns only when the flag is on. With
  it off the routes are **not in the URL map**: `reverse()` raises
  `NoReverseMatch` and the paths 404. Not 403, not 501 — a surface that refuses
  is still a surface.
* The OTP views and serializers were moved out of `views/auth.py` and
  `serializers/auth.py` into `views/otp.py` and `serializers/otp.py`, which
  `urls_otp.py` is the only importer of. So with the flag off nothing on the
  default path so much as imports the OTP service or the SMS adapters.
* `platform.E001` (`check --deploy`, console SMS outside DEBUG) returns clean
  whenever OTP is off. There is nothing to deliver, and a check that fires about
  a feature nobody is using trains the operator to ignore `check --deploy`.
* The 37 OTP tests **stay in the suite and run every time**. `test_otp.py` forces
  the flag on and rebuilds the URL map for its own duration (`reload_url_conf`
  in `tests/fixtures.py`), then restores both. They are not skipped: a skipped
  test is a test that has stopped telling the truth about whether the code works.
  `test_auth_flags.py` asserts the other half — that under the default
  configuration the endpoints are absent and the default sign-in path writes no
  OTP challenge and sends no SMS.

`platform_otp_challenge` is **not** dropped. Dropping a table is a destructive
migration in service of a decision that is explicitly reversible.

## 20. Error codes, and the one copy change

Every code emitted is in Part 22 §22.1.1. Three choices are worth naming:

| Situation | Code | Why |
|---|---|---|
| Sign-up with an address already taken | `validation_error`, field `email` | §22.1.2 rule 4 maps every `duplicate_*` spelling to `validation_error` with the field in `details`. |
| A reset link that is unknown, spent or expired | `validation_error`, field `token` | `invalid_token` is registered for "the access or refresh token fails signature, structure or expiry validation", which is the session pair, and its fixed copy ("Please sign in again") is wrong for a link a signed-out person clicked. |
| Reset or sign-up over its budget | `rate_limited` | `login_throttled` is registered against a *login* attempt budget. A reset request is not a login attempt. |

**The copy change.** Part 22 §22.1.1 fixes the message of `invalid_credentials`
as "Mobile number or password is incorrect." That now names a field the sign-in
form does not have, so the string is "Email or password is incorrect." in
`apps/common/exceptions.py` and `services/passwords.py`. The **code** is
unchanged. `CR-LOG` carries the copy change, which §22.1.1 says is reviewed like
any other.

Sign-up is the one endpoint that reveals whether an address is in use, because a
sign-up form has to be able to say "you already have an account". Login and reset
— the two places where enumeration actually buys an attacker something — reveal
nothing, and both have a test that proves the known and unknown answers are
identical.

## 21. What Part 27 §27.4.2 says "per mobile" and is now keyed per address

The budgets are Part 27's, unchanged in value: 10 failed logins per identifier
per 10 minutes then a 15-minute lockout, 100 per IP per hour. Only the key
changed, from the mobile hash to the address hash — still sha256, still in
`platform_rate_limit`, still never the raw value (§27.7.3). Two budgets are new
because two endpoints are new: 5 reset requests per address per hour 60 seconds
apart with 20 per IP per hour, and 20 registrations per IP per hour.

## 22. New columns, tables and settings this change adds

| Thing | Where | Registered in the corpus? |
|---|---|---|
| `platform_user.email` NOT NULL UNIQUE | migration `0004_email_identity` | Part 21 §21.3.1 says `NULL, U WHERE NOT NULL` — CR raised |
| `platform_user.mobile` nullable | same | Part 21 §21.3.1 says `NN, U` — CR raised |
| `platform_user.email_verified_at` | same | not in Part 21 — CR raised |
| `platform_auth_token` | migration `0005_auth_token` | not in Part 21 — CR raised |
| `POST /auth/register` | `urls_auth.py` | not in canon §0.8 or Part 22 §22.2 — CR raised |
| `POST /auth/email/verify/{request,confirm}` | `urls_auth.py` | same |
| `UB_AUTH_OTP_ENABLED`, `UB_RESET_TOKEN_TTL_SECONDS`, `UB_EMAIL_VERIFICATION_ENABLED`, `UB_VERIFY_TOKEN_TTL_SECONDS`, `UB_EMAIL_ADAPTER`, `UB_EMAIL_FROM` | `config/settings/base.py`, `env_catalogue.py`, `.env.example` | Part 29 §29.2.4 — CR raised |
| `auth.password_reset_requested`, `auth.email_verify_requested`, `auth.email_verified` | `apps/common/audit.py` | audit vocabulary — CR raised |

## 23. Migration reversibility

`0004_email_identity` is written by hand, not generated. The generated version
alters `email` to NOT NULL UNIQUE without first putting a value in the rows that
have none, which fails on any database that already holds a user; the backfill
has to run before the `AlterField`, and it has to be reversible.

Forward is safe on a populated database and was exercised on one: a legacy row
with `email IS NULL` becomes `<digits>@mobile.invalid`, and reversing restores
it to `NULL` while leaving a real address untouched. Reversing restores the
pre-DEC-010 shape exactly, which means it fails if any row created since has no
mobile — a row the old schema had no way to represent. That is a property of the
decision, not a defect in the migration.

## 24. What is unchanged

Onboarding, the business-type preset, tenant creation, memberships, document
sequences, multi-tenant switching and the `DEC-001` entitlement model (modules
and member count only; the ledger is never capped; no party or invoice ceilings)
are untouched. The only line any of them needed was
`onboarding.create_tenant`'s `phone=user.mobile or ""`: `PLT-03` BR-6 defaults
the tenant's phone to the owner's number, `platform_tenant.phone` is NOT NULL,
and since DEC-010 an owner may not have one.
