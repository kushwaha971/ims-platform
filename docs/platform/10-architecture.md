# Platform architecture for the modules

Status: **ACCEPTED (architecture owner), 29 Sep 2026, Phase 3 step 1.** The owner may revisit any
decision here; until then it binds every FRD and every implementation agent (vision §3 rule 5).
The decisions are recorded as ADR-041 to ADR-055 in
[Part 38](../38-architecture-decision-records.md). The function signatures, tables, error codes and
events the FRDs cite are in [11-contracts.md](11-contracts.md).

Scope: lending, library, gym and hospitality, and the three shared engines they need. Coaching is
not in scope (owner, 29 Sep); `research/coaching.md` was read only for engine insights.

Every claim about the existing code carries a `file:line` reference, read at commit c3e84c1.
Paths are relative to `backend/` or `frontend/` unless they start with `docs/`.

---

## 1. What already exists and is reused

The platform expansion is built on mechanisms that are already in the code. None of them is
replaced; several are extended.

| Mechanism | Where it is | What it does today |
|---|---|---|
| Module codes | `apps/common/constants.py:13-28` (`ModuleCode`) | 13 codes; no vertical codes yet |
| Owner switch | `apps/platform_app/models/tenant.py:46` (`enabled_modules`) | Array of codes |
| Plan × partner × switch | `apps/platform_app/services/entitlements.py:98-106` (`effective_modules`) | The one answer to "is this on" |
| Endpoint gate | `apps/common/permissions.py:113-145` (`ModuleEnabled` → `_ModuleEnabled`) | 403 `module_disabled` |
| Dependencies | `apps/platform_app/services/tenant_settings.py:46` (`MODULE_DEPENDENCIES`), checked at `:394-399` | Only `sales → parties, ledger` today |
| Switch-off refusal | `apps/platform_app/services/guards.py:33-44`, used at `tenant_settings.py:401-411` | 409 `module_has_data` with a count |
| Ledger posting | `apps/ledger/services/postings.py:100-176` (`post_source_entry`), `:179-253` (`reverse_source_entries`) | Idempotent by `(source_type, source_id, entry_type)`; the caller locks the party |
| Immutability | `apps/ledger/migrations/0002_forbid_update_delete.py`, re-created in `0004_entry_upi_app.py:34-75` | Only `status` and `reversed_by_id` may change |
| Party balance cache | `apps/parties/services/balance.py:100-135` (`apply_entry`) | The one writer of `balance` |
| Lock order | `apps/parties/services/balance.py:53-66` | party → documents → payments → stock → sequence |
| Payment targets | `apps/payments/services/targets/__init__.py:37-92` | `register_target`, the `AllocationTarget` protocol |
| Seam pattern | `apps/purchases/services/payment_seam.py:56-60` (`register_void_listener`) | Listener registered in `ready()` |
| Source names | `apps/ledger/selectors/sources.py:39-41` (`register_source_resolver`) | The khata names a document's number |
| Sales pipeline | `apps/sales/services/documents.py:72` (`create_draft`), `issue.py:58` (`issue_invoice`), `void.py:80` (`void_invoice`), `amounts.py:56` (`refresh_invoice_amounts`) | Draft → issue → ledger debit; void → reversal |
| Numbering | `apps/platform_app/services/sequences.py:38-62` (`allocate_number`) | Per financial year only |
| Scheduler | `apps/common/jobs.py:48-70` (`job_handler`), `:398-439` (`SCHEDULES`), `:459` | `platform_job` rows, per-tenant fan-out |
| Reminders | `apps/ledger/models.py:211-263` (`Reminder`) | Party-level, money-only, no source link |
| Parties | `apps/parties/models.py:19-90` | `is_customer`/`is_supplier` booleans, one `balance` |
| Files | `apps/files/models.py:17-36` (`Attachment`) | Polymorphic `owner_type`/`owner_id` |
| Audit | `apps/common/audit.py:238` (`write_audit`) | One row per logical event, in the transaction |
| Tenant data | `apps/common/tenant_data.py:87-100` | Export and deletion registry |
| Import rules | `tests/architecture/test_import_rules.py` | Module-level imports against a matrix |
| Store | `frontend/src/redux/store.ts:80-82` | `combineSlices(...).withLazyLoadedSlices()` |
| Navigation | `frontend/src/modules/DigiKhaato/features/navigation/sidebarConfig.ts` | Data, gated by `module` and `permission` |

---

## 2. Module boundaries

### 2.1 One module is one Django app plus one frontend feature folder

| Module | ModuleCode | Django app (label = table prefix) | Frontend feature folder | App route prefix | API prefix |
|---|---|---|---|---|---|
| Lending & collections | `lending` | `apps/lending` (`lending_*`) | `features/lending` | `/lending` | `/api/v1/lending/` |
| Library | `library` | `apps/library` (`library_*`) | `features/library` | `/library` | `/api/v1/library/` |
| Gym & fitness | `gym` | `apps/gym` (`gym_*`) | `features/gym` | `/gym` | `/api/v1/gym/` |
| Hotel & stays | `hospitality` | `apps/hospitality` (`hospitality_*`) | `features/hospitality` | `/hospitality` | `/api/v1/hospitality/` |

Frontend folders are under `frontend/src/modules/DigiKhaato/features/`, pages under
`frontend/app/(app)/<prefix>/`. The URL segment equals the module code so no mapping table can
drift; the words a merchant reads are copy, not paths.

### 2.2 The shared engines are three new core apps

| Engine | Django app | Frontend folder (shared UI only, no nav) | Read API |
|---|---|---|---|
| Recurring dues and schedules | `apps/dues` (`dues_*`) | `features/dues` | `/api/v1/dues/` |
| Bookings and resources | `apps/bookings` (`bookings_*`) | `features/bookings` | `/api/v1/bookings/` |
| Check-ins and attendance | `apps/attendance` (`attendance_*`) | `features/attendance` | `/api/v1/attendance/` |

**Why separate apps and not inside `ledger`, `payments` or `parties`** (ADR-041):
- Each engine owns tables with their own state machines (a due, a booking, a mark). Putting them in
  `ledger` would put non-money rows next to the one table whose rule is "nothing changes"; putting
  them in `parties` would force `parties` to import `ledger` and `payments`, which Part 20 §20.1.4
  forbids.
- An app per engine gives each its own migrations, `tenant_data.py`, `tasks.py`, and a line in the
  import matrix, so the import test can prove the engines never import each other or a vertical.
- The name `dues` (lending.md §16.4) is used rather than `schedules` (shared-engines.md §2): the
  app owns dues; a "schedule" is one of its tables, and `schedules` reads like the scheduler.

Shared primitives that hold no rows go in `common` (rule D1 allows pure code there):
`apps/common/recurrence.py`, `apps/common/periods.py`, and rounding helpers added to
`apps/common/money.py` (which already has `half_up` and `allocate_proportional`,
`apps/common/money.py:31,56`). The tenant calendar has a table, so it goes in `platform_app`
(ADR-055).

### 2.3 Module codes, dependencies and engine use

Added to `ModuleCode` (`apps/common/constants.py:13`): `LENDING = "lending"`, `LIBRARY =
"library"`, `GYM = "gym"`, `HOSPITALITY = "hospitality"`. Engines get **no** module code (ADR-041).

`MODULE_DEPENDENCIES` (`apps/platform_app/services/tenant_settings.py:46`) gains:

```python
MODULE_DEPENDENCIES = {
    "sales": frozenset({"parties", "ledger"}),
    "lending": frozenset({"parties", "ledger", "payments"}),
    "library": frozenset({"parties", "ledger", "payments"}),
    "gym": frozenset({"parties", "ledger", "payments", "sales"}),
    "hospitality": frozenset({"parties", "ledger", "payments", "sales"}),
}
```

A new map beside it says which engines a module uses. It is data, read by `engine_enabled()`:

```python
ENGINES_USED_BY = {
    "lending": frozenset({"dues"}),
    "library": frozenset({"dues"}),          # recurring fees; seats and visits come later
    "gym": frozenset({"dues", "attendance"}),
    "hospitality": frozenset({"bookings", "dues"}),  # dues only for long stays (later)
}
```

`gym` and `hospitality` depend on the `sales` **module** because their money is tax invoices. That is
a runtime dependency (sales must be switched on), not an import: neither app imports `apps.sales`
(§4.3). Hospitality does not depend on `inventory`; a folio extra may name an inventory item when
inventory is on, and is an item-less line with a SAC when it is off.

### 2.4 The release gate

`modules_view` lists every `ModuleCode` except `help` as available or locked
(`tenant_settings.py:145-150`), so adding `GYM` to the enum before the gym is built would put a
locked "Gym" row in Settings. That breaks the in-app rule (vision §4: no unbuilt feature is shown).

So a module code lands with the first migration of its app, and is listed in
`UNRELEASED_MODULES` (in `apps/platform_app/constants.py`) until the module's CR moves it to live:

- `modules_view` leaves unreleased codes out of `available`, `locked` and `enabled`;
- `update_enabled_modules` refuses them as "not included in your plan";
- `ModuleEnabled` refuses them unless the environment sets `UB_UNRELEASED_MODULES=1` (development,
  CI and the e2e stack only);
- the frontend needs no gate of its own, because the server never reports an unreleased code in
  `enabled_modules`.

**Plan and partner rows.** `seed_plans` re-asserts the plans' module lists on every run
(`apps/platform_app/management/commands/seed_plans.py:98-104`), but `seed_default_partner` sets
`allowed_modules` only when it creates the partner (`seed_plans.py:113-128`). So the day a module is
released, its CR ships a data migration that adds the code to `MVP_MODULES` and to every partner
that has `allowed_modules ⊇ MVP_MODULES` of the day before. Without it the module is on nobody's plan.

---

## 3. The layering rule

```
            ┌──────────────── Verticals ─────────────────┐    ┌── Shop & billing (existing) ─┐
            │  lending    library     gym    hospitality  │    │ sales  purchases  inventory  │
            └────┬───────────┬──────────┬───────────┬─────┘    │ expenses                     │
                 │           │          │           │          └───────────┬──────────────────┘
                 ▼           ▼          ▼           ▼                      │ implements ports
            ┌──────────────── Engines ───────────────────┐                  │
            │        dues        attendance     bookings │                  │
            └────┬───────────────────┬──────────────┬────┘                  │
                 ▼                   ▼              ▼                       ▼
            ┌──────────────────────────── Core ───────────────────────────────────┐
            │ payments → ledger → parties → files → tax → platform → common       │
            │ notifications, imports, reports (registries that others fill)       │
            │ common/seams (ports: documents)                                      │
            └──────────────────────────────────────────────────────────────────────┘
```

**Rules** (ADR-041, enforced by the import test in §10.1):

1. **L1 — down only.** A vertical may import engines and core. An engine may import core. Core
   imports neither. Nobody imports sideways: no vertical imports another vertical, no engine imports
   another engine, and no new vertical imports `sales`, `purchases`, `inventory` or `expenses`.
2. **L2 — deferred imports count.** The existing test walks only top-level imports
   (`tests/architecture/test_import_rules.py`, `_module_level_imports`), which is right for rule D5's
   one permitted cycle. For the new apps, a deferred import is still an import: their test walks the
   whole AST.
3. **L3 — upward calls go through a registry.** When core or an engine must call a vertical (to name
   a source, to ask if a check-in is allowed, to tell it an invoice was voided), the vertical
   registers a function in `AppConfig.ready()` and the lower layer calls whatever is registered (§4).
4. **L4 — strings are not imports.** Core may hold the *names* of vertical things — a module code in
   `MODULE_DEPENDENCIES`, a `subject_type` string on an engine row, a codename in the permission
   registry — because a name does not execute vertical code.
5. **L5 — a module dependency is not an import dependency.** `gym` needs the sales module switched
   on, and never imports `apps.sales`.

**The existing exception, recorded and not extended.** `payments` imports `sales` and `purchases`
at module level (`apps/payments/apps.py:21-35`, `apps/payments/services/targets/purchases.py:44-46`;
allowed by the matrix, `test_import_rules.py` `ALLOWED["payments"]`). The vision counts sales and
purchases as the Shop & billing vertical and `payments` as core, so this is core importing a vertical.
It predates the vision and is grandfathered. New targets are registered by their owners from
their own `ready()` (`register_target` is already public), so `payments` never imports lending,
library, gym or hospitality.

**`reports` is the second existing exception.** It may import every app's selectors
(`test_import_rules.py`, `ALLOWED["reports"] = ALL_APPS - {"reports", "help"}`). Adding the new apps
to `ALL_APPS` would silently let `reports` import verticals. The matrix is changed so that `reports`
keeps its current set, and the verticals publish their dashboard sections and reports through
registries in `reports` (§4.1, rows R8 and R9).

---

## 4. Seams and registries

### 4.1 The pattern

The code already has the pattern eight times: the lower app owns a small registry module; the
higher app registers a function in its `AppConfig.ready()`; the lower app calls what is registered,
inside the caller's transaction. Examples: `register_target` (payments), `register_void_listener`
(purchases), `register_source_resolver` (ledger), `register_module_off_guard` (platform),
`register_write_off_handler` and `register_settle_handler` (parties), `job_handler` (common),
`tenant_data.register` (common).

Rules for every registry (ADR-042):
- It lives in the **lowest** app that must call it, in a module named `registry.py` or
  `services/<name>_seam.py`, with a `Protocol` or `TypedDict` for the payload.
- Registration is **idempotent** and keyed (by `document_type`, `source_type`, `subject_type` or
  module code), so a second `ready()` is harmless.
- A registered function **runs inside the caller's transaction and lock order** and may raise a
  `BusinessRuleViolation` to refuse. It never opens its own transaction and never enqueues a job
  except through `enqueue()` (which is transactional, `apps/common/jobs.py:76-110`).
- A missing registration is a **clear state, not a crash**: an unregistered source shows "Document
  not found", an unregistered subject type refuses the write with a 500 in tests only.
- Every registry has a `_reset_for_tests()` that restores the start-up snapshot, as
  `guards._reset_for_tests` does (`apps/platform_app/services/guards.py:54-73`).
- Signals are never used for this (rule D9).

### 4.2 The registries this expansion uses

| # | Registry | Lives in | Registered by | Status |
|---|---|---|---|---|
| R1 | `register_target` (allocation targets) | `payments/services/targets/__init__.py` | dues, lending, library, payments (deposits) | **Exists**; protocol extended (bucket, auto, payment id) |
| R2 | `register_source_resolver` | `ledger/selectors/sources.py` | every app that posts | **Exists** |
| R3 | `register_posting_source` (posting matrix) | `ledger/services/postings.py` | dues, lending, library, payments | **New**; replaces editing `POSTING_MATRIX` |
| R4 | `register_module_off_guard` | `platform_app/services/guards.py` | every vertical, every engine | **Exists** |
| R5 | Document issuer port and origin listeners | `common/seams/documents.py` | sales (issuer); dues, gym, hospitality (origins) | **New** |
| R6 | `register_party_role`, `register_archive_guard` | `parties/services/roles.py`, `parties/services/archive.py` | every vertical | **New** |
| R7 | `register_reminder_source`, `register_reminder_policy` | `ledger/services/reminder_seam.py` | dues, library, gym, lending | **New** |
| R8 | `register_dashboard_section` | `reports/registry.py` | every vertical | **New** |
| R9 | `register_report` | `reports/registry.py` | every vertical | **New** |
| R10 | `register_schedule` | `common/jobs.py` | engines, verticals | **New**; today `SCHEDULES` is a literal list (`jobs.py:398`) |
| R11 | `register_number_kind` | `platform_app/services/sequences.py` | verticals | **New** |
| R12 | `imports` registry | `imports/registry.py` | verticals (member, copy, loan imports) | **Exists** |
| R13 | `tenant_data.register` | `common/tenant_data.py` | every new app | **Exists** |
| R14 | `job_handler` | `common/jobs.py` | every new app | **Exists** |
| R15 | Engine hooks (`register_subject`, `register_checkin_policy`, `register_booking_subject`) | `dues/registry.py`, `attendance/registry.py`, `bookings/registry.py` | verticals | **New** |
| R16 | `register_notification_type` | `notifications/services/notify.py` | verticals | **New**; today `REGISTRY` is a literal dict (`notify.py:72`) |

The signatures are in [11-contracts.md](11-contracts.md) §2.

### 4.3 How a vertical gets a tax invoice without importing sales

The document port (ADR-045) is a registry in `common/seams/documents.py`. `sales` registers the
issuer in its `ready()`; the dues engine, gym and hospitality call `documents.issue_document(...)`
and register an **origin listener** for their own origin type. When a document with an origin is
voided, or its settlement changes, `sales` calls the origin's listener inside its own transaction.
`sales` never imports the caller; the caller never imports `sales`.

---

## 5. Tenancy and permission conventions for new tables

**Tables** (Part 21 §21.1, unchanged; restated because every FRD's database section must follow it):
1. Every business table extends `TenantModel` (`apps/common/models.py:21-47`): UUIDv7 `id`, `tenant`
   RESTRICT, `created_by` SET NULL, timestamps. Name `<app>_<snake>`.
2. Foreign keys to `parties.Party` are `RESTRICT`. A profile table uses
   `OneToOneField("parties.Party", on_delete=RESTRICT, related_name="+")`: `related_name="+"` so the
   core `Party` model grows no accessor into a vertical.
3. **No foreign key from core or an engine to a vertical table.** Engines point at vertical rows with
   `subject_type` (`varchar(48)`, `"<app>_<model>"`) and `subject_id` (`uuid`), the ledger's
   `source_type`/`source_id` pattern (`apps/ledger/models.py:82-85`). Every engine row also carries
   `module` (`varchar(32)`), so a module-off guard and a module filter need no join.
4. A vertical **may** hold a real FK to an engine row or a core row (it sits above them).
5. Money is `MoneyField` (`numeric(14,2)`); business dates are `date` in the tenant's timezone
   (`apps/common/dates.py:18-27`); instants are `timestamptz`.
6. Per-tenant uniqueness is a partial unique index that includes `tenant` and excludes soft-deleted
   rows. Master data is soft-deleted; documents and events are voided or cancelled; money rows are
   never deleted.
7. Every new app has a `tenant_data.py` registering every table (the deletion job refuses to run
   around an unregistered table, `apps/common/tenant_data.py:88-95`).
8. Mutable operational rows carry `version` (optimistic concurrency, `stale_version` 409) where two
   people can edit the same row (a booking, a membership).
9. Immutable event rows (a copy's status history, a check-in void) follow `ImmutableModel`
   (`apps/common/models.py:70`); a trigger is added only for tables that carry money evidence.

**Scoping.** Tenant scoping is fail-closed with 404 semantics (ADR-032): viewsets extend the tenant
base classes, serializers use `TenantPrimaryKeyRelatedField`, and a cross-tenant id is 404.
Row scoping below the tenant (collection agents, trainers) is ADR-052: a module role plus a
`scope_filter()` the vertical's viewset must implement.

**Permissions.** Codenames follow canon §0.9, `<module>.<resource>.<action>`, and are declared once
in `apps/common/permissions_registry.py` (strings only, L4). `MODULE_OF` derives the module from the
prefix (`permissions_registry.py:63`), so a switched-off module's codenames disappear from every
member automatically (`permissions_for`). Engines have no codenames of their own for writes: a write
reaches an engine through a vertical endpoint, which checks the vertical's codename. Engine read
endpoints (§8) check a codename of each consuming module (`<module>.<resource>.read`) and pass if any
one is held. Business ceilings (waive a fee above a limit, refund, write off) are **role checks**, not
codenames — the LED-03 rule CLAUDE.md records.

**Endpoint order** stays `authentication → ModuleEnabled → PlanLimit → HasPermission`
(`apps/common/permissions.py:1-5`). Vertical viewsets add `ModuleEnabled("<module>")`; engine read
viewsets add `EngineEnabled("<engine>")` (§8).

**Audit.** Every service that changes state writes one `write_audit` row in its transaction, with
actions named `<module>.<entity>.<verb>` and declared as constants on `AuditAction`
(`apps/common/audit.py:16-21`).

**Errors.** Every code a module raises is registered in `apps/common/error_codes.py` and Part 22
§22.1.1 and obeys the naming rule (§22.1.2: `<subject>_<condition>`, one condition one code).

---

## 6. Frontend conventions for modules

1. **Route groups.** Module pages live under `frontend/app/(app)/<module>/…` and inherit the `(app)`
   layout (session, shell, snackbar). Each module adds its paths to `ROUTES` (`src/routes.ts`), its
   prefix to `GUARDED_ROUTE_PREFIXES` (`src/routes.ts:232`) and to `CRAWL_DISALLOW`
   (`src/utils/seo.ts:67`). `tests/routes.test.ts` already asserts every `ready` nav item has a page.
2. **Navigation from `enabled_modules`.** Each module contributes `NavItemConfig` rows with its own
   `module` and `permission` (`sidebarConfig.ts:31-58`). `useNavigation()` already drops a row whose
   module is off, whose permission is not held, or which is not `ready`. No component branches on a
   module. When two or more verticals are on, rows group under a module heading (a `group` field on
   `NavItemConfig`); with one vertical there are no headings, which is today's look.
3. **`ModuleCode` on the client.** `MODULE_CODES` in `src/types/domain.types.ts:10-25` carries
   `loans` and `accounting`, which the server does not have, and lacks `team`, which it does.
   The first module's change replaces the list with the server's (`lending`, `library`, `gym`,
   `hospitality` added, `loans` and `accounting` removed, `team` added) and adds a test that the two
   lists are equal.
4. **Lazily injected slices only.** A module registers **no** slice in `store.ts`'s static reducers.
   Every module slice declares itself on `LazyLoadedSlices` and calls `slice.injectInto(rootReducer)`
   in its own module (the CR-134 pattern, `src/redux/store.ts:36-82`; example
   `features/sales/redux/invoiceListSlice.ts:101-105`). The bundle gate: adding a module must not move
   the `sharedApp` budget in `bundle-budgets.json`.
5. **BrandHub patterns, unchanged.** `api/<x>Service.ts`, Redux Toolkit slices with
   `createAsyncThunk`, React Hook Form with the central `useValidationSchemas()`, no TanStack Query,
   errors through the global snackbar, invalidations in `src/redux/invalidation/{registry,map}.ts`.
6. **Design system.** `Ub*` components only (`src/design-system/`), no raw host elements
   (`react/forbid-elements`), BrandHub visual language (`docs/DESIGN-SYSTEM.md`). A component two
   modules need is added to the design system, never copied. Forms and drawers are `dynamic()` so
   they load with the chunk that opens them (the CLAUDE.md rule).
7. **Feature boundaries.** A vertical's feature folder may import `features/{dues,bookings,
   attendance}`, core features (`parties`, `payments`, `ledger`, `reminders`, `reports`) and shared
   `src/` code. It may not import another vertical's folder or `features/{sales,purchases,inventory,
   expenses}`. An ESLint `no-restricted-imports` zone per vertical enforces it.
8. **Shared UI hosted by core screens.** The party page shows module panels, and the dashboard shows
   module sections, through frontend registries keyed by module code
   (`features/parties/modulePanels.ts`, `features/reports/dashboardSections.ts`), each entry a
   `dynamic()` import, rendered only when the module is in `enabled_modules`.
9. **Locales.** One catalogue per module and engine (`locales/catalogues/<module>.{en,hi}.json`,
   prefix `<module>.` in `locales/catalogues.json`), kept in step by `split-locales.mjs` and
   `check-locales.mjs`. Hindi copy uses ordinary Hindi words (vision §4).
10. **Customer documents** (receipts, cards, confirmations, statements) extend
    `customerDocumentsCarryNoProductName.test.tsx`.

---

## 7. URL and API prefixes

| Kind | Prefix | Notes |
|---|---|---|
| Vertical API | `/api/v1/<module>/…` | `path("<module>/", include("apps.<module>.urls"))` in `config/urls.py:12-28`. Resource names plural, kebab-case (`/api/v1/lending/loans`, `/api/v1/library/copies`) |
| Engine read API | `/api/v1/dues/…`, `/api/v1/bookings/…`, `/api/v1/attendance/…` | GET only (§8) |
| Core additions | existing prefixes | `/api/v1/deposits`, `/api/v1/payments/{id}/allocations`, `/api/v1/parties/{id}/relations`, `/api/v1/calendar/closed-days` |
| App pages | `/<module>/…` | `/lending/loans/[id]`, `/library/counter`, `/gym/check-in`, `/hospitality/calendar` |
| Public pages | `/d/<token>` | Module documents share through the generalised `parties_share_link` (CR-131) once it exists; no module adds a public route of its own |

---

## 8. Engine read endpoints

Engines expose **read-only** endpoints for cross-module views: a party's dues across modules, a
day's check-ins, an availability grid. Every **write** goes through the vertical's endpoint, so the
vertical's codename, wording and validation apply (shared-engines Q8).

`EngineEnabled(engine)` (new, beside `ModuleEnabled` in `apps/common/permissions.py`) passes when
any module in `effective_modules(tenant)` lists the engine in `ENGINES_USED_BY`, and raises
`module_disabled` with `details.module = <engine>` otherwise. Results are filtered to rows whose
`module` is enabled, so a switched-off module's rows never appear in a cross-module list.

---

## 9. Switching a module on and off

**On.** `update_enabled_modules` (`tenant_settings.py:374-432`) is unchanged in shape:
- a released module in the plan and partner may be switched on;
- its `MODULE_DEPENDENCIES` must already be on (the refusal stays; the onboarding checklist of
  shared-engines §5.2, which switches dependencies on automatically, ships with the first vertical
  that goes live);
- switching on runs the module's **preset seed** for that module only (default plans, labels,
  settings rows), idempotently, and touches no other module's settings (shared-engines §5.5);
- engines need no switch: `engine_enabled()` is derived.

**Off.** Refused while the module has **open** records, with the count, 409 `module_has_data`
(existing code and message, `tenant_settings.py:401-411`). Closed history never blocks: switching off
deletes nothing (PLT-06 BR-4), and switching back on restores everything. The purchases guard already
counts open bills rather than all bills (`apps/purchases/services/guards.py:25-34`); every new guard
follows it. What counts as open:

| Module | Open records that block switching it off |
|---|---|
| lending | loans `active`; held deposits (none in MVP) |
| library | open loans (copies out); charges with `amount_due > 0`; held deposits; waiting or ready holds |
| gym | memberships active, upcoming or frozen; open check-ins (not checked out); held deposits |
| hospitality | bookings `tentative`, `confirmed` or `checked_in`; folio charges not invoiced; held deposits |
| engines (per consuming module) | dues: schedules `active`/`paused` and dues `due`/`overdue` with that `module`; bookings: active bookings; attendance: open visits |

Each vertical registers its own counters; each engine registers one counter per module in
`ENGINES_USED_BY` that counts its rows with that `module`; `payments` registers a held-deposit counter
per module. `blocking_rows_for_module_off` sums them (`guards.py:43-44`).

This **overrides lending.md EC-13**, which proposed allowing lending to be switched off with active
loans. The rule is one rule for every module: a module with open money records stays on.

---

## 10. Migration and ordering rules

1. **Order of landing.** Core changes (Wave A, §13) land first as migrations in their owning core
   apps. Engine apps' `0001` migrations depend on those. Vertical `0001` migrations depend on the
   engines they use. No core migration ever depends on an engine or vertical migration; no engine
   migration depends on another engine; no vertical migration depends on another vertical.
2. **Any new `ledger_entry` column re-creates `forbid_update_delete()` in the same migration** with
   the column frozen, and adds a test that `QuerySet.update()` of it raises. The trigger lists frozen
   columns one by one, so a column it does not name is mutable (`apps/ledger/models.py:46-51`; the
   `upi_app` precedent is `0004_entry_upi_app.py:73-75`).
3. **Data migrations are idempotent and reversible**, and never import a model class directly (use
   `apps.get_model`). A migration that changes a cache (`balance`, `settled_amount`) is followed by a
   replay test against the recompute command.
4. **Extensions.** `pg_trgm` is installed by `apps/common/migrations/0001_enable_extensions.py`. No
   other extension is added by this expansion (ADR-049).
5. **Release data migration** per module (§2.4): plans and partners gain the code.
6. **`makemigrations --check --dry-run`** stays in the backend gate (HANDOFF §4).
7. **Reversal.** Every schema migration has a working reverse; RunSQL carries `reverse_sql`.

### 10.1 The import matrix after this expansion

```python
ALLOWED |= {
    "dues":        {"common", "platform_app", "tax", "files", "parties", "ledger", "payments", "notifications"},
    "bookings":    {"common", "platform_app", "files", "parties"},
    "attendance":  {"common", "platform_app", "parties"},
    "lending":     CORE | {"dues"},
    "library":     CORE | {"dues", "bookings", "attendance"},
    "gym":         CORE | {"dues", "attendance", "bookings"},
    "hospitality": CORE | {"bookings", "dues"},
}
# CORE = {"common", "platform_app", "tax", "files", "parties", "ledger", "payments", "notifications"}
# "reports" keeps its current set; it gains no vertical and no engine.
```

Plus a new test, `test_new_apps_never_import_sideways_even_deferred`, that walks every node
(`ast.walk`, not `tree.body`) of the seven new apps and fails on an import outside the matrix.

---

## 11. Testing conventions

**Engines are tested without verticals.** Each engine ships a test-only subject
(`tests/fixtures/engine_subjects.py`, subject type `test_subject`, module `test`) registered by a
fixture, so dues, bookings and attendance are proven before any vertical exists. The fixture uses
the registries' `_reset_for_tests()`.

**Contract tests for every seam.**
- Every registered `AllocationTarget` passes one shared contract suite: lock order
  `(document_date, number, id)`, `apply` then `unapply` restores the row exactly, status is re-derived
  and never toggled, `outstanding` is never negative, bucket and `auto` are declared.
- Every origin listener is called on void and on settlement change, inside the transaction, and a
  listener that raises rolls the void back.
- Every registered posting source posts only its declared entry types and buckets.
- Every module-off guard returns 0 for an empty tenant and the right count for open records only.

**Replay tests for every cache.** `settled_amount` on a due, `used` on an entitlement, `held_amount`
on a deposit, `loan_balance` and `deposit_held` on a party are each proven equal to a recompute from
their source rows, by the `recalc_balances` pattern (ADR-031; CLAUDE.md LED-03 records why a cache is
trusted only when a second route re-derives it). A fuzzed test per cache.

**Money invariants.** Σ instalments = total (lending §6.6 rule 3); a statement's closing balance
equals `party.balance`; a deposit never moves `party.balance`.

**Plans.** Hot queries (the lending Today list, the dues run, availability for a date range, the gym
check-in search) carry an `EXPLAIN` test (`tests/performance/test_party_list_plans.py` pattern).

**Row scoping.** A scoped user requesting an out-of-scope id gets 404; the test asserts who is signed
in before asserting anything else (the CLAUDE.md harness lesson).

**Verticals.** Each has a unit suite, an e2e harness (`e2e/<module>.mjs`) against a live stack, and a
`--shots` sweep at four widths with the measuring checks (page `scrollWidth`, every text node inside
its box), which is the check that has found defects every unit test passed.

**Architecture.** The import test (§10.1), the route-coverage test (every route tenant-scoped or
listed public), the error-code equality test, the permission-registry test, and the
`tenant_data` coverage test all extend to the new apps.

---

## 12. Reuse map

Every need the four modules raised, and what serves it. **NEW** means a new component; **EXT** means
an existing component is extended; the ADR says why.

| Need | Modules | Served by | Status |
|---|---|---|---|
| Module switch, gate, dependencies | all | `ModuleCode`, `enabled_modules`, `MODULE_DEPENDENCIES`, `ModuleEnabled` | EXT: codes + `UNRELEASED_MODULES` (ADR-041) |
| Engine enablement | all | `ENGINES_USED_BY`, `engine_enabled()`, `EngineEnabled` | NEW (ADR-041) |
| Refuse switch-off with open records | all | `register_module_off_guard` | Exists; new counters |
| People (member, borrower, guest, trainer, guardian, payer) | all | `parties_party` | Exists |
| Module role on a party | all | module profile table + `register_party_role` | NEW (ADR-046) |
| Guardian / payer link | gym, library | `parties_relation` | NEW (ADR-046) |
| Enquiries before a party | gym | `gym_enquiry` (name + mobile only) | NEW, vertical (ADR-046) |
| Co-guests | hospitality | `hospitality_stay_occupant` register rows | NEW, vertical (ADR-046) |
| Archive blocked by open module records | all | `register_archive_guard` | NEW (ADR-046) |
| Money owed | all | `ledger_entry` + `post_source_entry` | Exists |
| New posting sources | dues, lending, library | `register_posting_source` | NEW (ADR-042) |
| Generic charge, credit | dues, lending, library | `EntryType.CHARGE`, `EntryType.ADJUSTMENT_CREDIT` | EXT (ADR-048) |
| Interest | lending | `EntryType.INTEREST` (declared, `ledger/constants.py:41`) | Exists |
| Loan outstanding kept apart in aging | lending | `ledger_entry.bucket = loan`, `party.loan_balance` | NEW (ADR-043) |
| Held deposits | library, gym, hospitality | `payments_held_deposit` + `bucket = deposit` + `party.deposit_held` | NEW (ADR-044) |
| Corrections | all | LED-03 reversal pairs, `reverse_source_entries` | Exists |
| Collections, receipts, void, UPI QR | all | `payments_payment`, `record_payment`, `void_payment`, receipt, `CollectQrSheet` | Exists |
| Allocate to dues | dues, lending | `payments_allocation` + `dues_due` / `dues_instalment` targets + `dues_settlement` split | EXT (ADR-047) |
| Apply an existing advance later | hospitality, dues, sales | `payments.services.allocate.allocate_existing` | NEW (ADR-047) |
| Disbursal | lending | payment out allocated to `lending_loan` target (`auto=False`, bucket `loan`) | EXT (ADR-047) |
| Tax invoices, bills of supply, credit notes | gym, hospitality, dues | sales pipeline behind the document port | EXT (ADR-045) |
| Per-night GST slab | hospitality | port line carries its own `gst_rate`; dated slab table in `tax` | NEW (ADR-045) |
| Recurring and instalment dues | lending, gym, library | `apps/dues` | NEW (ADR-048) |
| Rooms, nights, holds | hospitality (later: seats, lockers) | `apps/bookings` | NEW (ADR-049) |
| Check-ins, roll-call, session packs | gym (later: library visits) | `apps/attendance` | NEW (ADR-050) |
| Recurrence, periods, rounding | engines | `common/recurrence.py`, `common/periods.py`, `common/money.py` | NEW / EXT (ADR-055) |
| Closed days and holidays | library, lending, gym | `platform_closed_day` + `calendar.closed_weekdays` | NEW (ADR-055) |
| Document numbers (loan, booking, member, receipt) | all | `allocate_number` + `register_number_kind` | EXT (ADR-051) |
| Accession numbers (never reset) | library | `allocate_counter` (perpetual mode) | NEW (ADR-051) |
| Background runs | all | `platform_job`, `run_scheduler`, `register_schedule` | EXT |
| Reminders with an amount | all | `ledger_reminder` + source link + `register_reminder_source` | EXT (ADR-054) |
| Non-money notices (hold ready, renewal) | library, gym | `ledger_reminder.kind = notice` | EXT (ADR-054) |
| Reminder time window and daily cap | lending (any module may) | reminder policy | NEW (ADR-054) |
| In-app notifications | library, hospitality | `notifications` + `register_notification_type` | EXT |
| Row-level scope (agents, trainers) | lending, gym | module roles + `scope_filter()` | NEW (ADR-052) |
| Housekeeping view | hospitality | module role | NEW (ADR-052) |
| ID type + last 4 | lending, hospitality, gym | vertical columns; no images | Rule (ADR-053) |
| Photos | gym | `files_attachment` (`owner_type = gym_member`) | Exists |
| Print documents | all | `window.print()` pipeline, branding, "no product name" test | Exists |
| Share links for module documents | all | `parties_share_link` (CR-131) | Exists as a decision; table not built |
| QR on cards | library, gym | `apps/common/qr.py` | Exists |
| Barcode wedge scanners | library | a focused input; no dependency | Rule (library §15.3) |
| Camera QR scanning | gym, library | native `BarcodeDetector` only (ADR-025) | Exists as a decision |
| Imports (members, copies, loans) | all | `imports/registry.py` | Exists |
| Export and deletion | all | `tenant_data.register` | Exists |
| Dashboard sections | all | `register_dashboard_section` + frontend registry | NEW (ADR-042) |
| Reports | all | `register_report`, reports hub, CSV | NEW registry |
| Audit | all | `write_audit` | Exists |
| Import boundaries | all | matrix + deferred-import test | EXT |

---

## 13. Dependency graph and build order

### 13.1 What depends on what

```
Wave A (core)        A1 release gate · A2 ledger bucket + posting registry + new entry types
                     A3 party caches (loan_balance, deposit_held) · A4 payments: target protocol v2,
                     allocate_existing, held deposits, adjustment mode · A5 document port + sales issuer
                     · A6 party roles, relations, archive guards · A7 reminders: source link, notices,
                     policy · A8 counters + number kinds · A9 calendar + recurrence + periods + rounding
                     · A10 registries: schedules, dashboard, reports, notifications · A11 import test
                               │
          ┌────────────────────┼──────────────────────────────┐
          ▼                    ▼                              ▼
Wave B   Library           Dues engine                    Attendance engine
         (A2 A3 A4 A6      (charge: document + ledger;    (visit, presence, policy hook,
          A7 A8 A9)         advances; then expectation     entitlements)
                            with components)
          │                    │           │                  │
          │                    ▼           ▼                  │
Wave C    │                  Lending      Gym ◄────────────────┘
          │                  (dues expectation, A7 policy,  (dues charge/document, A5,
          │                   row scope ADR-052)             attendance, module roles)
          ▼
Wave D   Library later: recurring fees (dues), seats (bookings), visits (attendance)
                                   Bookings engine ──► Hospitality (A4 allocate_existing,
                                                        A5 per-night lines, ADR-053)
```

### 13.2 Build order, and why

1. **Wave A, core foundations.** Everything below needs at least one of them, and each is a change to
   a load-bearing table (`ledger_entry`, `parties_party`, `payments_*`, `sales_document`) that must
   land once, with its replay tests, before any module writes a row. Doing them per module would mean
   four teams changing the ledger trigger.
2. **Wave B, in parallel: Library, the dues engine, the attendance engine.**
   - **Library first among the verticals.** The owner said "I need library mgmt system". Library's MVP
     (catalogue, copies, counter, fines, deposits, holds, verification) needs only Wave A: fines are
     per-issue charges posted directly (shared-engines §2.11), fees at enrolment are charges,
     accession numbers are A8, the closed-day calendar is A9, deposits are A4. Seats and study space
     wait for bookings (library §15.4), which is what the library research asked for.
   - **Dues, charge mode first** (both postings), then expectation mode with components. Charge mode
     unlocks gym; expectation unlocks lending.
   - **Attendance** is small and only gym needs it in scope.
3. **Wave C: Gym, then Lending** (parallel if capacity allows; the box runs three tracks at most,
   HANDOFF §3).
   - Gym exercises two engines and the document port, which proves the platform's claim that
     verticals are configuration over shared engines.
   - Lending is the most legally sensitive module (lending §15), needs expectation mode and components,
     the reminder policy and row scoping. Building it after gym means the engine it depends on has
     already carried one vertical.
4. **Wave D: Bookings engine, then Hospitality.** Hospitality is the largest module (folio, per-night
   GST slabs, guest register, Form III list, housekeeping) and the only in-scope consumer of bookings.
   Building bookings earlier would build an engine with no consumer, which is how an engine gets the
   wrong shape.
5. **The onboarding checklist and navigation ordering** (shared-engines §5.2–5.4) ship with the first
   vertical released, because the in-app rule forbids showing any of it before then.

Each wave ends at the vision §5 gate: committed, docs updated, owner's Mac fast-forwarded, handoff.

---

## 14. Where the research disagrees with the code

Checked against the code; each item is corrected by the ADR or contract named.

| # | Research says | The code says | Resolution |
|---|---|---|---|
| 1 | shared-engines §2.4, §2.10: an unregistered tenant's due raises an **estimate** (`default_kinds`) | Sales issues an **invoice** for unregistered tenants: `KIND_FOR_GST_TYPE["unregistered"] = INVOICE` (`apps/sales/constants.py:114-118`), used by `kind_for` (`apps/sales/services/payload.py:39-47`). The `sales.default_kind` setting seeded from `default_kinds` (`presets.py:28-34`, `onboarding.py:479`) is **not read** by sales | The port uses `kind_for`; an estimate never posts a receivable, so a due never raises one (ADR-045). The unread setting is reported to the owner |
| 2 | shared-engines §5.3 option A: engines as ModuleCodes, hidden from the checklist | `modules_view` renders every ModuleCode except `help` (`tenant_settings.py:145-150`), and plans/partners would need the codes | Engines are not ModuleCodes (ADR-041) |
| 3 | lending EC-13: lending can be switched off with active loans | `update_enabled_modules` refuses a module with blocking rows (`tenant_settings.py:401-411`) | Refused, one rule for all modules (§9) |
| 4 | library §15.1 and §6.8: sequences are FY-based, a counter mode is needed | True, and further: `reset_fy` is stored and shown (`tenant_settings.py:81-107`) but `allocate_number` ignores it and always keys and formats by FY (`sequences.py:38-62`) | Perpetual counters (ADR-051); the ignored `reset_fy=false` is reported as a latent defect |
| 5 | shared-engines §3.4, hospitality §6.1: a range exclusion constraint needs "a Postgres extension", which is new | `pg_trgm` is already a contrib extension installed by migration (`apps/common/migrations/0001_enable_extensions.py`), so a second one is not unprecedented | Slot rows still win on merit (ADR-049) |
| 6 | library §4.14: "DB exclusion constraint on a date range" for seats | — | Slot rows with a unique constraint (ADR-049) |
| 7 | hospitality §6.7: payments can allocate only when recorded | Confirmed: `record_payment` takes `allocations` once (`apps/payments/services/record.py:170-188`); nothing allocates an existing payment | `allocate_existing` (ADR-047) |
| 8 | lending §4.4 and shared-engines Q11: extend `payments_allocation` with a `component` column | `uq_allocation_target (payment, document_type, document_id)` (`apps/payments/models.py:148-150`) forbids two rows per due, and every target would have to ignore the column | The split lives in the engine (`dues_settlement`) (ADR-047) |
| 9 | shared-engines §0.1 rule 3: add new `SourceType` values | `POSTING_MATRIX` is a literal dict (`postings.py:57-73`) that core would have to edit for every vertical | `register_posting_source` (ADR-042) |
| 10 | several docs: `reverse_source_entries` reverses "the posting" | It reverses **every** posted line of the source (`postings.py:196-205`) | One source row per postable fact (contracts §1.2) |
| 11 | shared-engines §5.1: "`module_has_data` refuses turning off a module with records" | It refuses only where a guard is registered: inventory, sales, purchases today, counting open rows | Every new module registers open-record guards (§9) |
| 12 | gym §6.12, lending §16.1: reminders can snapshot a due | `ledger_reminder` has no source link and a unique index on `(party, due_on, kind)` for auto kinds (`apps/ledger/models.py:227-258`), so two loans due the same day collide | Source columns and a widened index (ADR-054) |
| 13 | shared-engines §2.4 Q5: does a charge-mode due respect the credit limit? | `post_source_entry` never checks a limit; only sales `credit_check` does (`apps/sales/services/issue_parts.py:66`) | Not refused; the document port asks sales to skip the check (ADR-048) |
| 14 | several docs: `payments` is core and never imports a vertical | `payments` imports `sales` and `purchases` at module level (`apps/payments/apps.py:21-35`) | Grandfathered, not extended (§3) |
| 15 | shared-engines §2.4: the daily run is "a `platform_job` per tenant" | `SCHEDULES` is a literal list at IST hours (`jobs.py:398-439`); per-tenant fan-out computes `tenant_today` (`apps/ledger/tasks.py:44-66`) | `register_schedule` + the fan-out pattern (contracts §2.10) |
| 16 | frontend `ModuleCode` matches the canon | It has `loans`, `accounting`, and no `team` (`src/types/domain.types.ts:10-25`) | Replaced and tested (§6 item 3) |
| 17 | hospitality §6.11: optional "keep full ID numbers" for non-Aadhaar IDs | — | Refused by the binding rule: type + last 4 only (ADR-053) |

---

## 15. Where each research question was decided

| Question | Decision | Record |
|---|---|---|
| shared-engines Q1 — held deposits | Payments record, `deposit` bucket, adjustment payments | ADR-044 |
| Q2 — engines as ModuleCodes | No; derived from `ENGINES_USED_BY` | ADR-041 |
| Q3 — taxable due as a sales document | Yes, through the core document port with origin listeners | ADR-045 |
| Q4 — `btree_gist` | No; slot rows with a unique constraint | ADR-049 |
| Q5 — credit limit on charge-mode dues | Never refused; shown crossed | ADR-048 |
| Q6 — refund entry type | None; `PAYMENT_OUT` plus `ADJUSTMENT_CREDIT` or a credit note | ADR-048 |
| Q7 — party roles | Profile table is the role; `register_party_role` | ADR-046 |
| Q8 — engine read endpoints | Read-only, `EngineEnabled`; writes via verticals | ADR-041, §8 |
| Q9 — materialisation window | 24 months or the whole fixed plan; extended daily | ADR-048 |
| Q10 — recurrence location and storage | `common/recurrence.py`; typed columns + `date[]` | ADR-055 |
| Q11 — due allocation and statuses | `payments_allocation` + engine split; part-paid and waived derived | ADR-047, ADR-048 |
| lending Q3 — one balance | Yes, with a `loan` bucket and `loan_balance` | ADR-043 |
| lending Q11 — disbursal | A payment out to a `lending_loan` target, `auto = False` | ADR-047 |
| lending §12 — agent scoping | Module role + `scope_filter()` | ADR-052 |
| library Q2 — deposits | As Q1 | ADR-044 |
| library Q9 — accession counter | Perpetual counter in the core allocator | ADR-051 |
| gym Q14 — enquiries outside parties | Allowed, name and mobile only, purged when lost | ADR-046 |
| gym Q8, hospitality Q2 — trainer, housekeeping | Module roles (owner to confirm) | ADR-052 |
| hospitality Q4 — co-guests | Register rows, optional party link | ADR-046 |
| hospitality Q19 — bookings app, generic slot | Engine app; `slot_key` covers nights, days, shifts, slots | ADR-041, ADR-049 |
| hospitality Q20 — per-night rows | Yes | ADR-049 |
| hospitality Q21 — `allocate_existing` | Approved as a core payments service | ADR-047 |
| hospitality Q22 — room slab table | In `tax`, dated | ADR-045 |
| hospitality §6.11 — full ID numbers option | Refused | ADR-053 |
| lending §15.4 — reminder guardrails | Core policy per module | ADR-054 |

Nothing in shared-engines §6 is deferred. Deferred on purpose, each with its reason: free-range
(`span`) bookings (no module in scope needs them, ADR-049); `quantity` attendance marks (daily
delivery is not in scope, ADR-050); the onboarding checklist and nav ordering (ship with the first
released vertical, §13.2); ID images (need an encryption ADR, ADR-053).

---

## 16. Questions left for the owner

Architecture has decided everything above. These are product or legal choices the architecture
makes room for but does not make:

1. **Module roles** (ADR-052): confirm the three — collection agent (lending), trainer (gym),
   housekeeping (hospitality). They amend canon §0.9's four roles and need a CR.
2. **ID last-4 rule and Form III** (ADR-053): foreign guests' passport and visa numbers are not stored
   in full; the clerk types them into e-FRRO from the passport. Confirm, or ask a lawyer whether a
   narrower exception is justified later.
3. **Lending allocation default** (ADR-047): fees last (borrower-fair, research) or fees first
   (common lender practice). The engine supports both; the tenant setting needs a default.
4. **Reminder window for modules other than lending** (ADR-054): none by default (today's behaviour),
   or 08:00–21:00 for every module.
5. The unread `sales.default_kind` setting (§14 item 1) and the ignored `reset_fy=false` (item 4):
   fix, or remove from the settings screen.
