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
| A9b closed-day calendar | done | `d5efcaf` |
| A6 party roles, relations | in progress (A2 merged `472cb21`) | — |
| A7 reminders | waits for A2, A6, A10 | — |

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

## Decisions log

- (A1) "test" is accepted as an environment for the flag alongside `ci`/`e2e`, because the CI suite
  runs under `config.settings.test` (`ENV_NAME="test"`); the refusal is placed in the production
  settings module so it cannot be bypassed there.

## Change-request drafts (lead moves these to CR-LOG)

(none yet)

## Next steps

1. A1: write tests, implement, gates, QA, merge.
