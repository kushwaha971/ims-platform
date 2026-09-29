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
| A1 release gate | done | pending merge |
| A12 engine enablement | done | pending merge |
| A13 scoping, module roles | in progress (backend done) | — |
| A8 perpetual counters | waits for A10 | — |
| A9b closed-day calendar | waits for A8, A9a | — |
| A6 party roles, relations | waits for A2 | — |
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

## Decisions log

- (A1) "test" is accepted as an environment for the flag alongside `ci`/`e2e`, because the CI suite
  runs under `config.settings.test` (`ENV_NAME="test"`); the refusal is placed in the production
  settings module so it cannot be bypassed there.

## Change-request drafts (lead moves these to CR-LOG)

(none yet)

## Next steps

1. A1: write tests, implement, gates, QA, merge.
