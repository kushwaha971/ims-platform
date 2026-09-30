# Wave A — Track P (platform) progress

Owner: Track P lead (backend/full-stack). Branch `wave-a/track-p`, worktree `/home/claude/wt/track-p`,
test database `UB_TEST_DB_NAME=test_ub_track_p`.

Sequence (plan §2): A1 → A12 → A13 → A8 (after A10) → A9b (after A8, A9a) → A6 (after A2) → A7
(after A2, A6, A10).

Owner-question defaults in use (13-owner-questions.md): Q1 adopt the three module roles; Q2 adopt
`platform.calendar.manage`; Q5 no reminder window outside lending; Q14 remove `sales.default_kind`
and `reset_fy` from the settings screen.

## Status

| Task | State | Commit on main |
|---|---|---|
| A1 release gate | done | `910d961` |
| A12 engine enablement | done | `3e67449` |
| A13 scoping, module roles | done | `03fcbda` |
| A8 perpetual counters | done | `daa289a` |
| A9b closed-day calendar | done | `4ef1484` (the table's `d5efcaf` was the pre-amend hash) |
| A6 party roles, relations | done | see `git log --grep '^A6:'` on main (merged after A5, `a2ad208`) |
| A7 reminders seam | done | see `git log --grep '^A7:'` on main |
| A10 settings wiring (Track F hand-over) | already done in A8 | `daa289a` — `_shown_specs` uses `specs_for`, validation and save use `spec_for`; acceptance test `test_a_module_setting_is_shown_and_writable_only_while_its_module_is_on` in `platform_app/tests/test_number_kinds.py` |

## A1 — release gate (FRD 00 PLT-X11, R11)

### Design note

What the code does today: `modules_view` lists every `ModuleCode` except `help`
(`tenant_settings.py:134-151`); `update_enabled_modules` refuses what is not in `modules_view`'s
`available`; `effective_modules` is `for_tenant().modules ∩ enabled_modules ∪ {platform}`
(`entitlements.py:98-106`) and is what `ModuleEnabled`, `/auth/me` (`session_payload.py:100`),
`plan_limits.modules` and the admin console read; `permissions_for` gates codenames by the raw
`tenant.enabled_modules`.

Decisions:

1. `ModuleCode` gains `LENDING`, `LIBRARY`, `GYM`, `HOSPITALITY`. `UNRELEASED_MODULES` is a
   frozenset of those four in `apps/platform_app/constants.py`.
2. `released_modules()` and `hidden_modules()` live in `entitlements.py` and read
   `settings.UB_UNRELEASED_MODULES` **at call time** (so `override_settings` works and no import-time
   snapshot can go stale).
3. The filter is applied in `effective_modules` (R11) and in `modules_view` (universe and
   available), NOT in `for_tenant`. Reason: `reconcile_entitlements` switches off whatever
   `for_tenant().modules` lacks, so filtering there would wipe a developer's `enabled_modules` the
   first time the nightly job ran without the flag — EC-1 says data stays and the flag restores it.
4. `ModuleEnabled` gets an explicit early refusal for a hidden code as well as the
   `effective_modules` check (belt and braces: a single line that makes the gate independent of how
   `effective_modules` evolves).
5. `permissions_for` drops codenames of hidden modules (deferred import of the constant, no DB
   read), so a module's codenames, which land in the registry with its first commit, are never held
   while it is unreleased. It keeps reading `enabled_modules` rather than `effective_modules`,
   because switching it to the entitlement would add queries to every permission check and change
   behaviour for today's tenants.
6. Start-up refusal (BR-3) lives in `config/settings/prod.py` (which `staging.py` imports): the
   flag is refused unless `UB_ENV_NAME` is `ci` or `e2e`. `local.py` is DEBUG and `test.py` is the
   CI suite's own settings, so both may set it. Refusal is `ImproperlyConfigured`, not `assert`, so
   it survives `python -O`.
7. The flag is catalogued in `env_catalogue.py` and both `.env.example` files (backend one is the
   one the test reads).
8. Frontend `MODULE_CODES` becomes exactly the server's list (drop `loans`, `accounting`; add
   `team`, `lending`, `library`, `gym`, `hospitality`), with `src/types/moduleCodes.test.ts` parsing
   `backend/apps/common/constants.py`'s `ModuleCode` block and asserting equality in order.
   No frontend gate: the server never reports a hidden code.

### Tests (T-PLT-X11-1…6)

`apps/platform_app/tests/test_release_gate.py`, `tests/architecture/test_settings.py` additions,
`frontend/src/types/moduleCodes.test.ts`.

### A1 QA (adversarial self-review; no Agent tool in this session)

The Agent tool is not available to this session, so each task gets a separate adversarial pass by
the lead instead, recorded here. A1 findings:

1. **Fixed** — `GET`/`PATCH /tenants/current`, tenant creation and the onboarding resume serialised
   the RAW `enabled_modules`, so a stored gym came back in the profile while `/auth/me` hid it.
   `TenantReadSerializer.to_representation` now filters hidden codes; test
   `test_the_tenant_profile_never_echoes_an_unreleased_code` failed before the fix.
2. **Fixed during design** — a PATCH rewrote `enabled_modules` from what the client was shown, so
   an ordinary switch flip would have deleted a stored hidden code (EC-1). Hidden codes already on
   the row are carried through (`test_switching_another_module_does_not_wipe_a_stored_unreleased_code`).
3. Accepted — the tenant data export (`tenant_export.py`) still writes the stored column: it is the
   tenant's own data, not a module listing, and only a flagged dev database can hold such a code.
4. Accepted — with a hidden gym stored, switching `sales` off is not refused by gym's dependency
   (the dependency check runs on what the client can see). Only reachable on a dev database; when
   the flag returns, gym is effective without sales until sales is switched back on.
5. Environmental — `tests/migrations/test_reversibility.py` uses a fixed scratch database
   (`test_ub_migration_roundtrip`) shared by all tracks, and failed once when another track ran it
   concurrently. Not A1's; **for the lead**: derive the scratch name from `UB_TEST_DB_NAME`.

## A12 — engine enablement and off-guards (FRD 00 PLT-X10, R14, R15, R25)

### Design note

- `MODULE_DEPENDENCIES` gains the four verticals (10-architecture §2.3); `ENGINES_USED_BY` sits
  beside it in `tenant_settings.py` (strings only).
- `enabled_modules_using(tenant, engine)` = `ENGINES_USED_BY` ∩ `effective_modules`, and
  `engine_enabled` is its truthiness — so the release gate and the owner's switches both apply.
  Both in `entitlements.py`, reading `tenant_settings.ENGINES_USED_BY` at call time.
- `guards.py`: `register_module_off_guard(module, counter, *, label_id=None)` deduplicated by counter
  identity (it used to append; a second `ready()` doubled every count). Labels are held in a
  parallel map so `_MODULE_OFF_GUARDS` keeps its old `dict[str, list[Counter]]` shape — the sales,
  purchases and inventory suites monkeypatch it. `module_off_blockers` returns `[{label_id, count}]`
  for counters with count > 0; `blocking_rows_for_module_off` sums it. GST-lock counters are also
  deduplicated.
- `register_module_enable_hook(module, hook)`; `update_enabled_modules` runs hooks for newly enabled
  modules inside its transaction after the dependency check, after clearing the per-instance
  entitlement cache (a hook may ask `effective_modules` about the new module). A raising hook rolls
  the switch back.
- 409 `module_has_data` gains `details.breakdown` (additive). Two existing tests asserted the exact
  details dict and were updated to the contract shape.
- `EngineEnabled(engine)` (403 `module_disabled`, `details.module = engine`),
  `HasEngineReadPermission(engine)` (GET only; passes when the member holds the codename of any
  effective consuming module) and `readable_engine_modules(request, engine)` for the queryset
  filter. **Stricter than the contract's minimum**: rows are narrowed to modules that are enabled
  AND whose codename the member holds, so a member granted library's reader never sees gym's marks
  through a shared endpoint. Codenames go through `permissions_for`, so a codename a module has not
  yet registered cannot be held — fail closed.
- `HasPermission`'s membership preamble (active membership + `token_stale`) is extracted to
  `_authenticated_membership` and shared, so the two classes cannot disagree about who is asking.
- `ENGINE_READ_PERMISSIONS` appended to `permissions_registry.py` in a `# ── A12 ──` block.
- Frontend: the 409's breakdown is kept in the settings slice (`moduleRefusal`, read by the pure
  `moduleRefusalFrom`) and drawn under the refused switch as a warning `UbStatusBanner`
  ("Close them first, then turn this off." + one line per open thing). A label whose catalogue is
  not loaded on the settings screen falls back to the generic "N records are still open" rather
  than printing a message id. The global snackbar still carries the server message.
- **Convention for the verticals and A4b** (for the lead to pass on): an off-guard `label_id` is
  `<module>.off.<thing>` taking `{count}`, and the module's catalogue line must route that prefix
  to the `settings` catalogue in `locales/catalogues.json` (`"library.off.": "settings"`), or the
  settings screen shows the generic line. Today no labelled counter exists, so nothing changes on
  screen for any current tenant.

### A12 QA (adversarial self-review)

1. **Fixed** — deduplication by `is` let a bound-method counter or hook (a new object on every
   attribute access) register twice and double its count; now `==`
   (`test_a_bound_method_counter_registered_twice_counts_once` failed first).
2. **Fixed** — the refusal banner lived in a session-long lazy slice, so the next visit to Settings
   opened on a stale "N records are still open"; now cleared when Settings loads
   (`settingsSlice.test.ts` failed first).
3. Accepted — onboarding writes `enabled_modules` directly (`apply_preset`) without running enable
   hooks; it only ever enables core and shop modules (`_seed_modules`), never a vertical, and the
   later onboarding checklist switches modules through `update_enabled_modules`. A vertical's
   presets therefore always seed through the hook.
4. Accepted — engine reads accept no write method at all (`HasEngineReadPermission` refuses
   non-safe methods), matching ADR-041.
5. Visual check of the refusal banner is folded into the A13 screenshot pass (it needs a labelled
   counter to appear, and none exists for today's tenants).

Gates run: full backend suite on the A1+A12 tree, **2624 passed, 0 failed**; frontend settings
jest 20 passed; `tsc`, eslint and prettier clean on the changed files; locales split and checked.

## A13 — row scoping and module roles (FRD 00 PLT-X12, R66, R70, R47)

### Design note

- `apps/common/scoping.py`: `ScopedViewSetMixin` (put before the tenant base viewset). Its
  `get_queryset` refuses at the first request, for everybody including the owner, when
  `scope_filter` is not overridden (checked before the `read_all` bypass so the owner's first visit
  finds it) or `scope_all_permission` is empty; otherwise narrows the tenant queryset unless the
  member holds `scope_all_permission`. No resolvable member → no rows. Out-of-scope ids are 404
  because the filter is on the queryset. `scoped_queryset(...)` is the same rule for plain APIViews.
- `RestrictedFieldsMixin` in `apps/common/serializers.py`: the KEY is dropped without the codename;
  codenames from `context["permissions"]` (exports, jobs) or the request's member; neither → every
  restricted field dropped (fail closed).
- `permissions_registry.py` (append-only `# ── A13 ──` block): `register_module_role(code, *,
  module, codenames, label_id)` per contracts §3 (the FRD's `permissions=` keyword is the contract's
  `codenames=`). Refused at start-up unless the code is `<module>_<role>` ≤ 32 and not canon, the
  module is one of the four verticals (a role "owned" by parties would be a way around the rule),
  and every codename exists, belongs to that module and is not a `read_all`. Idempotent for an equal
  spec; a different spec under a used code raises. `system_role_permissions(code)` resolves canon
  or module roles and returns ∅ for an unknown system code — `permissions_for` used to raise
  `KeyError` there. Module gating in `permissions_for` already removes a switched-off module's
  codenames (BR-6).
- `GET /api/v1/roles` (`RoleListView`, `platform.members.manage`): the canon four (owner not
  assignable) then module roles of effective modules, each `{code, module, label_id, assignable,
  is_module_role}`.
- `POST /members` and `POST /invitations` refuse a module role whose module is not effective (or a
  system code nobody registered): 400 `{role: ["This role belongs to a feature that is off."]}`.
- Member rows gain `role_module`, `role_active`, `role_label_id`; invitation rows `role_label_id`.
  The member list computes `effective_modules` once per page (serializer context).
- `module_role_migration(code, *, name, codenames)` returns the `(forwards, backwards)` pair a
  vertical's data migration runs to upsert its `platform_role` row (idempotent; the reverse refuses
  while a member holds the role).
- Architecture test `tests/architecture/test_module_scoping.py`: every view in a vertical app is
  scoped or declares `scope_exempt = "<reason>"` (proven on a planted module), no module role holds
  a core read / `read_all` / `reports.*` / another module's codename, no module role holds an
  engine-read codename (R25), every `read_all` is held by owner, admin and accountant (BR-4), no
  `.reveal` reaches the accountant (ADR-058).
- Frontend `features/team`: `roleService` + lazily injected `roleSlice` + `useRoles` (fetched when a
  dialog opens); the add and invite dialogs offer `GET /roles`' assignable roles (fallback: the
  canon three, never an empty picker, never owner) and the schemas take the offered codes;
  `MemberRoleCell` shows the role and, for a module role, a wrapping caption: what it cannot see
  (`<label_id>.caption`), the module's name, or "Inactive while <module> is off". A label or module
  name with no copy on the screen falls back to plain words ("Feature role"), never a message id
  or a raw module code. `MemberRoleCode = TenantRole | \`${ModuleCode}_${string}\``.
- **Convention for the verticals** (for the lead): module role labels are `<module>.role.<name>`
  and `<module>.role.<name>.caption`; the vertical's catalogue line routes `"<module>.role."` to
  the `team` catalogue in `locales/catalogues.json`, or the team screen shows "Feature role".
- Found while wiring it: a `tenant.role.${…}` template inside `memberService` pins every
  `tenant.role.*` key to the app shell, because the member slice is statically registered and
  `split-locales` follows the shell's import graph. The canon fallback key is therefore built in
  the view-model, not in the service.

### Canon §0.9 CR draft (owner Q1 and Q2 defaults adopted) — for the lead to file in CR-LOG / Part 43

> **CR-2026-09-30-PLATFORM-ROLES — canon §0.9: module roles, the widened action set, and
> `platform.calendar.manage`.**
>
> *Change.* Canon §0.9 fixes four system roles and a closed action set. It is amended to:
> 1. **Module roles.** A module may own system roles, `platform_role` rows with `tenant` NULL,
>    `is_system` true and `code = "<module>_<role>"`, registered through
>    `permissions_registry.register_module_role` and seeded by the module's own data migration. Three
>    are adopted (owner Q1): `lending_agent` (collection agent — loans on the agent's routes),
>    `gym_trainer` (trainer — members whose term or batch names the trainer; no fees, dues or
>    mobiles unless granted) and `hospitality_housekeeping` (housekeeping — the room board, no
>    guest contact or ID fields, no folio, no money). A module role holds ONLY its module's
>    codenames: never `parties.party.read`, `ledger.entry.read`, `payments.payment.read`,
>    `reports.*`, `ledger.reminder.write` or any `read_all`. It is assignable only while its module
>    is enabled; while the module is off its codenames vanish and the membership remains.
> 2. **Action set.** The closed set `read | write | delete | export | void | correct | manage |
>    adjust` widens to the actions the registry and the FRDs use: `read_all` (reads beyond a row
>    scope; owner and admin by default and **explicitly** accountant, whose automatic set matches
>    only `.read`), `reveal` (identity fields, ADR-053/058; never implied by `*.read`, so never the
>    accountant's automatically), `void_own`, `money_read`, and the per-module verbs each FRD lists.
>    Lending's `lending.borrower.id_read` is renamed `lending.borrower.reveal` (ADR-058).
> 3. **Staff and accountant sets.** Each module's release CR adds its codenames to `_STAFF` and
>    `_ACCOUNTANT` as its FRD's permission matrix says (R47).
> 4. **`platform.calendar.manage`** (owner Q2) — a new core codename held by owner and admin, to
>    write tenant-wide closed days without the owner-only `platform.tenant.manage`; a closed day
>    with `module = X` may also be written by X's settings codename (R26). (Implemented by A9b.)
>
> *Why.* Row scoping cannot be made safe with the canon roles: `staff` holds tenant-wide core reads,
> so a scope applied only to a vertical's tables would leak through `/parties` (ADR-052). And the
> accountant's `*.read` rule would hand identity fields to accountants automatically (ADR-058).
>
> *Implemented by.* Wave A task A13 (mechanism: `ScopedViewSetMixin`, `RestrictedFieldsMixin`,
> `register_module_role`, `GET /roles`, the team screen, the architecture test). Each role row ships
> with its vertical. *Reversal.* Remove the roles' registrations and rows; no core table changes.

### A13 QA (adversarial self-review plus the look pass)

Look pass: a local production build of the worktree on :3100 against the worktree API on :8100
(scratch database `ub_trackp_dev`, `UB_UNRELEASED_MODULES=1`, a stand-in `lending_agent` role over
two stand-in lending codenames, a switchable labelled off-guard on expenses). Team list with module
roles active and inactive, the add-member picker, the Settings refusal banner, and the agent signing
in; 390 and 1280 px, English and Hindi; `scrollWidth` and per-element clipping measured
(`/tmp/e2e-shots/trackp/`). Findings:

1. **Fixed (found by looking)** — the inactive caption rendered "Inactive while its featu", cut
   mid-word with no ellipsis, at both widths: grid cells and card meta slots are `truncate`, which
   defeats `line-clamp-2`. The caption opts out (`whitespace-normal break-words`); a class guard in
   `ModuleRoles.test.tsx` failed first; the re-shoot measures no clipping.
2. **Fixed** — the tenant switcher, the business chooser and the activity log each built
   `tenant.role.<code>` themselves, so a collection agent would read "tenant.role.lending_agent"
   under their business. One `src/utils/roleLabel.ts` now names every role (canon key, sent label,
   `<module>.role.<name>` by convention, else "Feature role"); `roleLabel.test.ts` failed first.
3. **Fixed** — a raw module code ("lending") leaked into the caption and the picker label when the
   module's name had no copy; now plain words (`roleDisplay.test.ts`).
4. **Fixed** — `permissions_override.allow` was applied after the role's set, so an agent row edited
   in the admin to allow `parties.party.read` would read every balance: a module role's grants are
   now confined to its own module and never include a `read_all`
   (`test_an_override_cannot_hand_a_module_role_a_core_read` failed first).
5. **Fixed during build** — a `tenant.role.*` template in `memberService` pinned those keys to the
   app shell (see the design note).
6. Verified — the agent's `/auth/me` holds exactly the two lending codenames and none of the core
   reads; every business-ceiling check in the code tests canon role codes, so a module role can
   never reach one (BR-5); `seed_reference_data` touches only the canon rows.
7. **For the lead** — with the dev flag on, the Features screen shows raw ids for the unreleased
   modules (`nav.module.lending`, `settings.module.lending.description`, locked `nav.module.gym`…).
   Merchants never see it (A1), but each vertical's first commit must add `nav.module.<code>` and
   `settings.module.<code>.description`, or its own `--shots` sweep will photograph raw ids.
8. **For A16 (Track F)** — a scoped member without `reports.basic.read` currently lands on
   `/set-password` then `/dashboard`; R49's first-visible-item landing is A16's.
9. Harness lesson (not product): a click before hydration submits the login form natively as a GET
   (`/login?email=…&password=…`); and a restarted `next-server` whose standalone directory was
   rebuilt keeps its port with a deleted cwd, serving old HTML over new chunks (500 text/plain) —
   find it by its listening socket, not by its cwd.

Gates: platform_app, common, architecture and integration suites green; frontend team, settings,
audit-log, tenant-switcher, utils and api jest 117 passed; `tsc`, eslint, prettier clean; locales
split and checked (3900 keys).

## A8 — number kinds and the perpetual counter (FRD 00 PLT-X07, ADR-051) + owner Q14

### Design note

- `sequences.py`: `register_number_kind(kind, *, module, mode, default_prefix, padding, label_id)`
  (fits the row or refused at start-up: kind ≤ 24, prefix ≤ 12, padding 0–10, mode `fy`|`perpetual`,
  not a core series; idempotent; conflicting spec raises). `allocate_counter` takes the `'*'` row
  (race-safe get-or-create then `FOR UPDATE`) and prints `prefix + zfill(padding)`;
  `peek_counter` creates and locks nothing; `raise_counter(*, ctx, kind, next_number, via="import")`
  refuses lower (409 `sequence_backwards {current, requested}`), is a no-op when equal, and writes
  `counter.raised {kind, before, after, via}`. **One additive keyword beyond contracts §1.7:**
  `via`, because FRD §6's audit row names it. `allocate_number` refuses a perpetual kind and a
  registered FY kind takes its registered prefix and padding.
- Migration `platform 0012_sequence_perpetual`: `ck_sequence_fy_label CHECK (fy_label = '*' OR
  fy_label ~ '^[0-9]{4}-[0-9]{2}$')`. Round-tripped by the reversibility suite and forward/back on a
  scratch database holding 96 real `2026-27` rows.
- Settings numbering payload: every row gains `mode`; a registered kind of an effective module adds
  `kind`, `module`, `label_id` and a mode-correct preview (`M-0001`, `1024`, `LN/26-27/0001`).
  PUT accepts those kinds (perpetual rows validated without the year, padding 0 allowed), writes
  the `'*'` row, and lowering is 409. A switched-off module's series is "not a document series".
- **Owner Q14 (default adopted), which overrides FRD X07 BR-6** ("keep showing `reset_fy`"): the
  question postdates the FRD and the task instructions name it. `reset_fy` is gone from the
  numbering rows and ignored on PUT; `sales.default_kind` is gone from `values`, `sections` and the
  defaults endpoint and ignored on PUT (an old client is not refused). The stored rows stay where
  onboarding wrote them. The `kind_not_allowed` rule of that key's validator is still pinned by a
  direct test, ready for the day it is wired.
- **A10's handover applied** (Track F progress, "Handed to Track P"): `_values_view`,
  `settings_payload.sections`, `preset_payload`, `_validate_values` and the save's
  `schema_version` now use `specs_for` / `spec_for`, with A10's acceptance test
  (`test_a_module_setting_is_shown_and_writable_only_while_its_module_is_on`).
- Frontend: there is no numbering table on the Settings screen yet (the page defers Documents and
  numbering until they have a consumer on screen), so A8 changes only `NumberingRow`'s type. The
  "Never resets" caption and the lower-bound schema land with that screen.

### A8 QA (adversarial self-review)

1. Accepted — every numbering row gains `mode`, so each tenant's settings ETag changes once at
   deploy; a client holding the old one gets the existing 412 "changed elsewhere" once and reloads.
2. Verified — 20 threads allocating a fresh perpetual kind (the first allocation races to CREATE the
   row) get `M-0001…M-0020`, no IntegrityError; a rolled-back transaction returns its number.
3. Verified — the settings path writes the `'*'` row for a perpetual kind that has none yet, and a
   perpetual `next_number` past 2^31 is a 400, not a DataError.
4. The tests-first run failed on every new test (no functions, no CHECK) before the code existed.

## A9b — the closed-day calendar (FRD 00 PLT-X08, ADR-055, R26, R32)

### Design note

- `platform 0013_closed_day`: `platform_closed_day (TenantModel, date, reason ≤ 60, module NULL)`,
  `uq_closed_day UNIQUE NULLS NOT DISTINCT (tenant, date, module)`, `ix_closed_day_range (tenant,
  date)`; registered in `platform_app/tenant_data.py` (exported as `closed_days.csv`).
- **Weekday storage follows contracts v1 (R32), not FRD §5's single nested key**:
  `calendar.closed_weekdays` → `{"value": [6]}` and `calendar.closed_weekdays.<module>` →
  `{"value": [0, 6]}`. The `{"value": …}` object follows the settings rows' convention.
- `services/calendar.py`: `is_open`, `next_open_day` (≤ 366-day horizon, one query),
  `closed_days_between` (inclusive, **one query** — the weekday rows and the closures in a single
  `UNION ALL`), `register_calendar_reader`/`readers_for`, `set_closed_weekdays` (BR-2 refuses a
  list closing all seven days for the tenant or any module; `None` drops an override; one audit row
  per real change), `add_closed_days` (≤ 31 days, reason 1–60, module must be an effective reader;
  BR-3 skips and counts existing days; one audit row), `delete_closed_day` (hard delete, audited).
  Audit actions `calendar.closed_day.created|deleted`, `calendar.weekdays.updated`.
- API: `GET /calendar/closed-days?from&to&module` (any active member, ≤ 400 days; meta carries
  `closed_weekdays`, `module_weekdays` and **`readers`** — additive, the screen's overrides and
  "Applies to" choices); `POST` (201 with `meta.skipped_existing`); `DELETE /{id}` (cross-tenant
  404); `PUT /calendar/weekdays`. Writes: `platform.calendar.manage` (new codename, owner + admin,
  owner Q2), or for a module's own row/override that module's `<module>.settings.manage` (R26). A
  support session cannot write.
- **Weekdays are written only through `PUT /calendar/weekdays`**, not also through the generic
  `PUT /tenants/current/settings` the FRD offers as an alternative: one write path, one validator.
- `calendar_readers` is in `/auth/me`'s active tenant (FRD §7) **and** in the settings payload. The
  client reads it from the settings payload for the hub link, because the session slice is static
  and a new field there would grow the app shell for one link.
- Frontend `features/calendar` (R33): `calendarService`, lazily injected `calendarSlice`,
  `useBusinessDays` (weekday changes save at once, like the Features switches), pure
  `calendarDisplay`, `WeekdayChips` (the last open day's chip is disabled — BR-2), the
  `ClosedDayDialog` loaded with `dynamic()`, the page at `/settings/business-days`, and a
  "Business days" hub link only while `calendar_readers` is non-empty. Past dates may be added
  (BR-4). Copy in a new `calendar` catalogue, English and Hindi. `src/utils/loadedMessage.ts` is
  the one "key or null" check now shared by roleLabel, roleDisplay and the calendar.

### A9b QA (adversarial self-review plus the look pass)

Look pass (`/tmp/e2e-shots/trackp-calendar/`), same stack as A13's plus
`register_calendar_reader("lending")`:

1. **Fixed (found by looking)** — at 390 px the seven weekday chips did not fit and "Sun" / "रवि"
   was cut in half: `UbFilterChipGroup` is built not to wrap (filter bars scroll). `WeekdayChips`
   tells it to wrap; a class guard failed first; the re-shoot shows the row wrapping.
2. **Fixed (found by looking)** — a module without a name on the screen read "When on, This
   feature is closed…", a fallback word spliced mid-sentence. `moduleName` now returns `null` and
   callers use whole generic sentences ("A feature uses different days", "One feature only").
3. **Fixed** — the list's `module_weekdays` read every stored override, naming a switched-off (or,
   on a flagged dev database, unreleased) module in the response; now only effective readers, and
   the stored row is kept for the module's return (test failed first).
4. **Fixed while writing** — `UbEmptyState` without its required `variant` crashed the render
   (caught by the component test before tsc).
5. **Fixed (A13 miss, found by the full `src/tests` run)** — A13's `fetchRoles` thunk was never
   listed in the invalidation registry, so `invalidation.registry.test.ts` has been red on main
   since `03fcbda` (the A13 gate ran the team suites, not `src/tests`). It and the three calendar
   mutations (`calendar/saveWeekdays`, `calendar/add`, `calendar/delete`, each patching
   `calendar.data`) are registered now, and the map test injects `calendarSlice`. The track's
   jest gate is `src/tests` plus the feature suites from here on.
6. Verified on the re-shoot — the hub link appears only with a reader on; the staff view is read-only
   (no add, no remove, every chip disabled, "View only"); no page overflow at 390 or 1280 in either
   language; `0013` round-trips in the reversibility suite and on the scratch database.

Gates: platform_app, common, architecture, integration and the 0013 round trip green; calendar,
settings, team, utils and `src/tests` (463) jest green; `tsc`, eslint, prettier clean; locales 3964 keys checked.

## A6 — party roles, relations and archive guards (FRD 00 PLT-X04, ADR-046, contracts §1.3)

### Design note

- **Roles** (`parties/services/roles.py`): `register_party_role(code, *, module, label_id,
  party_ids)` under the ADR-042 rules (idempotent for an equal spec, a conflict raises, a slug code,
  `_reset_for_tests`). Only roles of *effective* modules count (BR-1, EC-2), and with nothing
  registered every function returns without a query, so no query budget moved. `?role=` is a
  declared filter (`PartyFilterSet.filter_roles`): `id IN party_ids(tenant)` OR'd within the group
  and ANDed with the rest; an unknown or switched-off code is 400 `{role: ["Unknown role."]}`.
  Badges are ONE query per page whatever the number of roles: an `ARRAY_REMOVE(ARRAY[CASE WHEN id IN
  (…) THEN code END, …])` annotation over the page's ids. `GET /parties/roles` is one aggregate
  (active parties only, the list's BR-4 reason). The list CSV gains `roles` from the same annotation.
- **Payload shape.** List rows carry `roles` (codes) and the detail `roles: [{code, module,
  label_id}]` *only while a module with roles is on*, the A2 rule for bucket figures, so every
  tenant today reads byte-identical payloads. The client uses that absence: no role chips request,
  no relations section, no relations request for a plain shop.
- **Relations** (`parties_relation`, parties 0010): the FRD §5 columns and constraints, both FKs
  RESTRICT, registered in `tenant_data`. `services/relations.py`: create (both parties locked in id
  order; self and duplicate 400; either end archived 409 `party_archived` (EC-4); a future `from_on`
  400); an ENDED duplicate is re-opened (200) rather than refused, because the unique key covers
  ended rows and "re-add Rahul's father" must work; remove deletes an unused relation (204) and ends
  a used one (200 with `to_on`) through `register_relation_history(counter)`, which A7 fills from
  reminder history. `receiving_parties(tenant, party)` is what reminder sources read (BR-7).
  Routes are actions on `PartyViewSet` (`roles`, `relations` GET/POST, `relations/<rid>` DELETE),
  so they inherit its module gate, tenant scoping and 404 for another tenant's ids. Codenames per
  §10 (`parties.party.read` / `.write`). Audit `party.relation.created|deleted` (`metadata.ended`).
- **Archive guards** (`parties/services/archive.py`): `register_archive_guard(module, guard)`,
  several per module, deduplicated with `==`. Single archive calls the guards after the write-off
  handler and the balance check, under the lock (BR-3) — so a refusal rolls the write-off back. Bulk
  archive runs them for each locked eligible id and reports `party_has_open_records` with `module`,
  `count`, `label_id` in `skipped` (BR-4). A disabled module's guard is never called. New error code
  `party_has_open_records` (409). Parties registers its own BR-6 guard: an active GUARDIAN of an
  active party cannot be archived (payers are not guarded; BR-6 names the guardian).
- **Frontend.** Role chips on the list (the module's word via its `label_id`, a plural ICU message
  on `{count}` — "Members" on the chip, "Member" on the badge), shown when the rows carry `roles` or
  a `role` filter is applied, in the URL (`role=` codes only), counted in "Clear filters", and a
  server 400 on a stale role drops that one filter instead of an error screen. Khata: role badges,
  the "Guardian and payer" section (`UbPanel`, `dynamic()`), the add dialog (RHF + central schema,
  the one party search minus the party itself, Guardian / Pays for, "Send reminders to them"),
  remove with a confirm that says a used link is ended instead. `features/parties/modulePanels.ts`
  (`registerPartyPanel`, ADR-042 rules, `dynamic()` per panel, drawn while the module is enabled).
  Archive and bulk archive dialogs render the module's sentence with the number, falling back to
  whole generic sentences. Roles and relations calls live in `api/partyRelationService.ts`, relation
  copy in a new `partyLinks` catalogue (see QA 5).
- **Not in A6, and why.** The core deposit guard (BR-5) needs `payments_held_deposit`, which is A4b's
  (Track F, not merged); A4b's row in the plan lists "deposit guard", so it registers
  `register_archive_guard("payments", …)` there. "Pick or **create** a party" in the relation dialog
  is pick-only: creating inline would put the party form inside a dialog inside the khata; the
  no-match line says to add them first. A module's own archive "link" (§2 flow 4) has no field in
  the contract's `ArchiveBlock`; the dialog names the module and the next step instead.

### A6 tests

Backend 35 new: `parties/tests/test_party_roles.py` 12 (registry, `?role=` OR/AND and totals,
disabled/unknown 400, switch-off EC-2, `/parties/roles` counts and scoping, badges on list and
detail, ONE badge query for 50 rows × 3 roles and exactly +1 query on the list at two page sizes,
zero queries unregistered, CSV `roles`, the EXPLAIN reaching a profile table's unique party index),
`test_archive_guards.py` 5 (409 details, disabled guard not called, balance first, bulk skip, a
refusal rolls a write-off back), `test_relations.py` 15, `tests/contracts/test_archive_guards.py` 3
(every registered guard: `None` for a party with no records, ≤ 3 queries, block shape).
Frontend 32 new across `PartyRoleChips`, `PartyRelations`, `PartyBulkArchiveDialog`,
`partyRelationService`, `partyRoleDisplay`, `modulePanels`, `apiError`.

### A6 QA (adversarial self-review plus the look pass)

Look pass (`/tmp/e2e-shots/trackp-a6/`): the A13 stack plus a stand-in `lending_borrower` role
(parties tagged "Loan") and a stand-in lending archive guard. List with the role chip (the chip's
tap asserted on the NETWORK: `role=` sent at every size), both khatas (person and guardian), the add
dialog, both archive refusals; 390 and 1280 px, en and hi. No page overflow, no raw message id.

1. **Fixed (found by a test first)** — `?role=` in a shared link was ignored: the parser branch had
   not landed in `readFilters`. The pressed-chip test failed; it passes now.
2. **Fixed (found by looking)** — the archive refusal also toasted the server's English fallback and
   a request id over the dialog that already explained it; `party_has_open_records` joined the
   locally-presented codes (a `shouldToast` test fails without it).
3. **Fixed (found by looking)** — with no catalogue for the module the badge read just "Role", which
   says nothing; a badge with no word is not drawn now (the chip keeps its fallback: it is a control).
4. **Fixed (found by looking)** — the section was a `UbCard` with a louder heading than the info
   panel above it; it is a `UbPanel`/`UbPanelSection` like the rail's other sections.
5. **Fixed (found by measuring)** — first build: shared app +0.6 KB and 47 more routes over budget
   than the baseline. `partyService` is in the app shell (the list warm-up), so the roles/relations
   calls moved to `partyRelationService.ts`; the relation copy moved to a `partyLinks` catalogue
   (the `parties` catalogue ships with every party picker). Measured against a baseline build of the
   same commit with A6 stashed: shared app 104.6 → 105.0 KB (at budget), `(app)` route chunks
   +0.3–0.4 KB (store registry entries, `partyService` mapping), `/parties` +2.1 KB (role chips,
   hook, lazy slice, thunk), `/parties/[id]` +1.2 KB. Baseline already has 18 routes over; with A6,
   64. **For the lead:** `bundle-budgets.json` is shared, so I have not raised it; these are the
   honest figures for the budget pass.
6. **Fixed (A13 miss)** — `TeamPageContent.test.tsx` "confirms before revoking" has failed since
   `03fcbda` (checked at `c2134c2`: green; `03fcbda`: red). A13's unmocked `GET /roles` fails in
   jsdom as a transport error, the network slice goes `degraded` and the invalidation refetch is
   withheld. The test mocks `roleService` now.
7. Verified — a switched-off module's role 400s and disappears; archived parties are not counted;
   another tenant's profile rows match nothing; a guard of a disabled module is not called; a relation
   id through another party's URL is 404; accountants read and cannot write; the scratch DB
   migrated `0010` forward.

Gates after rebasing onto A5 (`a2ad208`): backend parties, ledger, common, platform_app, sales,
payments, architecture, integration, contracts and the query budgets green, `makemigrations
--check` clean; frontend full jest 2745/2745 (`src/tests/invalidation.registry.test.ts` included,
and green on main itself at `a2ad208`); `tsc`, eslint and prettier on changed files; locales 4034
keys in 45 catalogues.

**Notes for the lead / verticals.** (a) A vertical's `<module>.role.*` and `<module>.archive.*` keys
must be in a catalogue the parties screens load (route them to `parties` or `partyLinks` in
`catalogues.json`), or the chip, badge and refusal fall back to generic words. (b) `label_id` for a
role is an ICU plural on `{count}`; an archive guard's `label_id` takes `{count}` and `{name}`.
(c) A4b registers the deposit guard. (d) A7 registers `register_relation_history` and reads
`receiving_parties`.

## A7 — the reminder seam (FRD 00 PLT-X06, ADR-054, owner Q5)

### Design note

- **One table, widened.** `ledger_reminder` (0007) gains `module`, `source_type`/`source_id`,
  `subject_label`, `recipient_party` (RESTRICT) and `message_group_id`. A module's reminder is
  ABOUT a record (an instalment, a book, a membership) and TO a party or the guardian A6 links, so
  a second table would split "what did we send this person" in two. The auto unique index now covers
  `(party, due_on, kind, source_id)` for `auto_d1/auto_d0/due/notice` with `NULLS NOT DISTINCT`, so
  two loans due the same day are two rows and today's party rows (NULL source) stay unique. CHECKs:
  a source is both halves or neither; a `notice` carries no amount.
- **The seam is `ledger/services/reminder_seam.py`**, registries by ADR-042's rules:
  `register_reminder_source(source_type, module=, candidates=, lookup=None)` yields
  `ReminderCandidate`s (the source's CURRENT amount, template key, recipient);
  `register_reminder_policy(module, {window, daily_cap_per_source, fixed_templates,
  forbidden_words})`. `check_reminder_allowed` is the ONE gate: every recording path (create, send,
  bulk, the job, `record_source_reminders`) calls it and a refusal is 409 `reminder_outside_window`
  or `reminder_cap_reached` with `next_allowed_at` in the tenant's offset. Preview never refuses; it
  reports `allowed`/`next_allowed_at`. The clock is `reminder_seam.now()`/`today(tenant)`, read
  through the module so tests stop it.
- **Windows are tenant-local `[start, end)`; caps count `sent` and `scheduled` rows** on
  `Coalesce(sent_at, scheduled_for)` inside the tenant's day, excluding the row being sent (a row
  must not refuse itself).
- **Owner Q5 default:** only a module whose policy has a window gets one; the tenant may NARROW it,
  never widen (`reminders.<module>.window`, validated against the policy, half-hour steps in the UI,
  written by `platform.tenant.manage` only — 403 otherwise). The shop's own reminders have no window,
  exactly as before.
- **The job.** `schedule_for_tenant` adds a module half: one row per candidate, `scheduled_for` the
  next allowed moment (09:00 run, 10:00 window → 10:00), enqueued `run_after` it. At send time it
  re-reads the source, recipient, opt-in, mobile, setting and policy, and cancels with a note rather
  than sending a stale figure (EC-6).
- **BR-7:** a party's reminder figure is the trade balance, `balance − loan_balance`; lending's
  money is never in a shop reminder. Buckets, due list, bulk and the job all use `TRADE`.
- **Frontend.** `registerReminderTab(module, {labelId, order})`; the reminders screen draws a
  Shop / module tab row only when an enabled module registered one, so a plain shop is unchanged
  (a test asserts no tab and no request). The module tab is core's `ModuleRemindersPanel`: records
  grouped by bucket, the record as the row's title, party "· to" recipient under it, Remind or
  "Next: …". The sheet is `UbShareSheet` over the server's text; a not-now preview replaces the
  channels with the rule and the next time. Everything is a lazy slice and a lazy chunk.
- **Deferred:** the multi-select bulk UI for a module tab (the API takes `sources`; no vertical has
  rows yet), and the vertical's own tab words (`<module>.reminders.tab`, else `nav.module.<code>`,
  else "Feature").

### A7 tests

Backend: `ledger/tests/test_reminder_seam.py` (21: registries, window validation, the gate, caps
across statuses and the day boundary, `next_allowed_at`), `test_module_reminders.py` (12: the
endpoints end to end with a stand-in `test` module), `test_module_reminder_job.py` (7: the index,
the CHECKs, the job's deferral and re-check, the guardian's number, A6's relation history),
`tests/contracts/test_reminder_paths.py` (6, T-PLT-X06-3: no path records what the policy refuses),
`tests/contracts/test_reminder_templates.py` (T-PLT-X06-6: a module's templates use none of its
forbidden words, parametrised over registered policies, with a stand-in proving it can fail).
Frontend: `components/ModuleReminders.test.tsx` (8), `moduleReminders.unit.test.ts` (11: tab
registry, words, half hours, both services' wire mapping).

### A7 QA (adversarial self-review plus the look pass)

Look pass (`/tmp/e2e-shots/trackp-a7/`): the worktree API on :8100 with a stand-in
`lending_instalment` source over parties tagged "Loan" (one linked to a guardian), lending's policy
and templates, the clock pinned at 10:30 IST, and a build with a look-only tab registration (not
committed). Shop tab, module tab, sheet, after-send, the stale-screen refusal, the owner's hours
open; 390 and 1280 px, en and hi. No page overflow; no raw ids.

1. **Fixed (found by looking)** — every row carried a bucket badge repeating its group heading
   word for word ("Overdue 30+ days" over "Overdue 30+ days"). The heading carries it alone.
2. **Fixed (found by looking)** — at 1280 a guardian row read "Reminded" and still offered Remind.
   The sheet closes on the tap and the tab refetched then, before the create-then-send pair was
   recorded, so the server truthfully said "allowed". The tab now refetches when a send LANDS
   (counted, not by distinct id: a second send for the same record adds no id), and ignores a list
   answer older than the newest request. `take Remind off a row once its send lands…` fails with
   either half removed.
3. Verified — the message is in the tenant's messaging locale in both UIs (it is the customer's
   text, not the viewer's; same as the shop path); the recipient line and "To Mohan" show; "Next"
   is in the tenant's zone; the hour options stop at the module's window (08:00–18:30 for a
   19:00 end); a non-owner sees the hours as text.
4. Verified (backend) — the job never sends outside the window or over the cap and cancels a closed
   record; a shop party's figure excludes `loan_balance`; the scratch DB migrated 0007 forward.

Bundle, against a build of main at `a45e528`: shared app 105.0 → 105.0 KB; `/ledger/reminders`
61.0 → 62.4 KB (+1.4, now 1.4 over its 61 KB budget: the tab row, the lazy panel's loader, the
windows rows' code and ~20 English catalogue strings); the 48 `(app)` routes +0.2–0.3 KB each. That
last figure is NOT A7 code: per route the only new bytes are the invalidation-map entry (+153 B
raw). Turbopack re-split two chunks every one of those routes loads together (79,222 B raw in both
builds, split 41.7/37.5 KB before and 50.8/28.5 KB after), which moves their gzip total. Routes over
budget: unchanged. `bundle-budgets.json` not edited (shared file) — for the lead's budget pass.

Gates on the A7 commit: backend full suite 3160 passed, 8 skipped; `makemigrations --check`
clean; frontend full jest 2765/2765 in 249 suites; `tsc`, eslint and prettier on changed files; locales
4060 keys in 45 catalogues; `invalidation.registry.test.ts` and `invalidation.map.test.ts` green.

**Notes for the lead / verticals.** (a) A vertical registers its source, policy and templates in
`apps.py` and its tab in its feature entry; its template keys are `<module>_<purpose>`. (b) A
vertical endpoint that records reminders calls `record_source_reminders` and adds a case to
`tests/contracts/test_reminder_paths.py`. (c) `e2e/node_modules` on main is a symlink to itself
(created 03:15 today, not by this track); the look pass ran from a scratch copy.

## Decisions log

- (A1) "test" is accepted as an environment for the flag alongside `ci`/`e2e`, because the CI suite
  runs under `config.settings.test` (`ENV_NAME="test"`); the refusal is placed in the production
  settings module so it cannot be bypassed there.

## Change-request drafts (lead moves these to CR-LOG)

(none yet)

## Next steps

1. Wave A Track P complete; remaining questions are in the final report.
