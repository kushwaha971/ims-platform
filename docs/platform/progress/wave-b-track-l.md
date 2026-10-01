# Wave B · Track L (Library backend) — progress

Owner: Track L developer (backend). Branch `wave-b/track-l`, worktree `/home/claude/wt/track-l`
(`scripts/worktree-bootstrap.sh track-l`), test database `UB_TEST_DB_NAME=test_ub_track_l`.

Sequence (plan §3.1, dependency order): **B01 → B02 → B03 → B04 → B05 → B06 → B08 → B10 → B07 →
B09 → B11 → B12 → B13 → B14 → B15 → B16 → B17 → B18**, then E01–E04. Two order changes are proposed
below and wait for the lead: B10 effectively runs after B05 and B06 (G17, G19), and FRD B10's lost,
found, replace and damage work moves to a new **B10b** after B09 (G19).

Owner-question defaults in use (13-owner-questions.md): Q2 `platform.calendar.manage` (built, A9b);
Q5 no reminder window for library; Q6 library grace 0 per membership type; Q12 reading rooms later,
no seat table; Q20 library charges are non-GST ledger charges (D3). Contracts v1 win over the FRD
wherever they differ.

**Core heads verified on disk (plan §3):** `ledger/0007_reminder_source`, `parties/0010_party_relation`,
`payments/0004_held_deposit`, `sales/0005_document_origin`, `platform/0013_closed_day` all exist
(`ledger 0007` itself depends on `parties 0010` and `platform 0013`). Nothing blocks B01.

**Library migration numbers (one owner per app per wave, plan §1.4):** `0001_initial` (B01),
`0002_settings` (B03), `0003_catalogue` (B05), `0004_membership_types` (B06, see G17),
`0005_charges` (B10); later tasks continue in merge order.

## Status

| Task | State | Commit |
|---|---|---|
| B01 skeleton | built; ready for QA | a3ef128 |
| B02 codenames, errors, audit | design written; not started | — |
| B03 settings, seed, numbering | design written; not started | — |
| B04 ISBN and accession helpers | design written; not started | — |
| B05 catalogue | design written; not started | — |
| B06 membership types, loan rules | design written; not started | — |
| B08 due dates | design written; not started | — |
| B10 charges and waivers | design written; not started | — |

---

## B01 — app skeleton

### Design note (review step)

Status: design written; not started.

Inputs: FRD LIB-01 FR-7, §0.4, task list B01; plan §1.3, §1.4, §3; 10-architecture §2.1, §2.4,
§5 rule 7, §7, §10, §10.1; contracts §1.1; ADR-041; R11, R27.

**Already done by Wave A (verified; not redone):** `ModuleCode.LIBRARY` (`apps/common/constants.py:33`);
`library` in `UNRELEASED_MODULES` (`apps/platform_app/constants.py:96`); `MODULE_DEPENDENCIES` and
`ENGINES_USED_BY` rows (`services/tenant_settings.py:51,62`); `hidden_modules()` /
`effective_modules()` honour `UB_UNRELEASED_MODULES` at call time (`services/entitlements.py:98-147`);
`ModuleEnabled` refuses a hidden module first (`apps/common/permissions.py:134-169`); `prod.py:46`
refuses the flag outside ci/e2e; `ALLOWED["library"]` is already in
`tests/architecture/test_import_rules.py` and its whole-AST walker applies the moment the folder exists
(the file's docstring: "no later task edits this file to add one"). So FRD FR-7's "the code lands
with 0001" and the plan's "import row, env flag" need no new code.

Adds:
- `apps/library/{__init__,apps,urls,tenant_data}.py`. `LibraryConfig(name="apps.library",
  label="library")`, `ready()` empty with a docstring listing what B03/B05/B10 will register.
  `urls.py` has `urlpatterns = []`. `tenant_data.py` registers nothing yet (`PENDING_APPS` stays
  empty, `apps/common/tenant_data.py:83`).
- `apps/library/migrations/0001_initial.py`: no operations; `dependencies` = `ledger 0007`,
  `parties 0010`, `payments 0004`, `platform 0013` (see G2 for `sales 0005`).
- `config/settings/base.py` `INSTALLED_APPS` += `"apps.library"`; `config/urls.py` +=
  `path("library/", include("apps.library.urls"))` (one line each, hot-file rule).
- `tests/migrations/test_reversibility.py` `LOCAL_APP_LABELS` += `"library"` (G1).
- `apps/library/tests/conftest.py`: a `library_on` fixture putting `library` on the plan, the
  partner and `enabled_modules` under `override_settings(UB_UNRELEASED_MODULES=True)` — the
  `_with_new_modules` pattern of `apps/platform_app/tests/test_release_gate.py:31-42`.

Tests to write first:
1. `test_library_is_unreleased_without_the_flag`: plan, partner and `enabled_modules` all name
   library and `effective_modules` still lacks it. Prevents the fixture becoming a release leak.
2. `test_the_fixture_really_turns_library_on`: with `library_on`, `effective_modules` contains it.
   Prevents a fixture that cannot fail, the harness lesson CLAUDE.md records (LED-03 staff check).
3. `test_0001_depends_on_the_wave_b_heads`: the migration graph edges of `library 0001` are the
   fixed heads. Prevents a dependency on a branch migration (plan §1.4 rule 2).
4. These existing suites must stay green and now cover library: the import matrix (app on disk),
   `test_tenant_data` (no unregistered model), the reversibility round trip, `makemigrations --check`.

Edge cases: an app with migrations and no models is valid; `ready()` must import no models; with no
routes, nothing is reachable yet, so T-LIB-01-5's API half is already A1's `test_release_gate.py`.

Gaps:
- **G1** `LOCAL_APP_LABELS` (`tests/migrations/test_reversibility.py:32-48`) is a literal that is
  never compared with `INSTALLED_APPS`, so a new app's migrations are **silently skipped** by the
  round trip. Default: append `library` here. Propose a guard test (labels equal the installed local
  apps). Tracks D and T append to the same tuple, so merges will conflict on it.
- **G2** Plan §3 lists `sales 0005` among the Wave B heads. Library has no FK to sales and may not
  import it. Default: leave it out. Adding it is harmless if the lead wants the plan applied literally.
- **G3** Even with the flag, library is "not included in your plan" (`update_enabled_modules`,
  `tenant_settings.py:486-492`): `seed_plans.MVP_MODULES` and the default partner's `allowed_modules`
  lack it, and `plan.overrides.modules_extra` is also intersected with the partner
  (`entitlements.py:73-76`). Nothing puts library on a dev or e2e tenant's plan. This is not B01's
  job (release data is T-R1's), but E01 is blocked without it. Lead to choose: a dev/e2e-only
  command, or `seed_plans` adding unreleased modules while the flag is on.

### Built (1 Oct 2026)

Landed as the note says, with no deviation: `apps/library/{__init__,apps,urls,tenant_data}.py`,
an empty `migrations/0001_initial.py` on `ledger 0007`, `parties 0010`, `payments 0004` and
`platform 0013` (G2 default, no `sales 0005`), one `# ── B01 ──` block each in `INSTALLED_APPS`,
`config/urls.py` (`library/`) and `LOCAL_APP_LABELS` (G1 default). `apps/library/tests/conftest.py`
has `library_on` and the plain helper `entitle_library`; `test_skeleton.py` holds the three
note tests plus an installed-label check. Gates: `apps/library` 4 passed; `tests/architecture`
111 passed, 6 skipped (library is now walked by the import matrix, no longer skipped);
`tests/migrations` 60 passed (the slow round trip included, with library in it);
`test_tenant_data` + `test_release_gate` 38 passed; `makemigrations --check` clean.

---

## B02 — codenames, error codes, audit actions, canon CR text

### Design note (review step)

Status: design written; not started.

Inputs: FRD LIB-14 (§1, §9 codename table, §10 matrix, §12), Appendix A (30 codes), Appendix B; D27,
D28; contracts §3 (R47, R70), §4; ADR-052, ADR-058; CR-2026-09-30-PLATFORM-ROLES items 2–3; owner
Q1 default; plan §1.3 hot-file rule.

Adds (each in a `# ── B02 ── library (LIB-14) ──` block, append-only):
- `apps/common/permissions_registry.py`: the 16 codenames into `PERMISSIONS` (`:19`). `_STAFF`
  (`:92`) gains seven: `catalogue.read/write`, `member.read/write`, `loan.read/write`,
  `verification.run`. Admin and accountant derive automatically: `_ADMIN` is owner minus
  `platform.tenant.manage` (`:90`), and `_ACCOUNTANT` takes every `.read` (`:118`), which gives it
  the four library reads. `MODULE_OF` (`:85`) maps them. `permissions_for` drops them while library
  is hidden (`:181`). `ENGINE_READ_PERMISSIONS["dues"]["library"]` (`:73`) starts naming a real
  codename.
- `apps/common/error_codes.py`: the 30 Appendix A codes, all `(409, False)` except
  `library_waiver_over_ceiling (403, False)`. The 30 rows are also appended to
  `docs/22-api-specification.md` §22.1.1.
- `apps/common/audit.py` `AuditAction`: one constant per Appendix B `library.*` action
  (`LIBRARY_COPY_WITHDRAWN = "library.copy.withdrawn"`, …). The core actions are reused, never
  duplicated: `DEPOSIT_*`, `COUNTER_RAISED`, `PAYMENT_*`.
- `apps/library/constants.py`: TextChoices whose values are exactly the FRD §5 CHECK lists:
  `MaterialType` (B05 and B06 both need it), `CopyStatus`, `CopySource`, `CopyCondition`,
  `WithdrawReason`, `CopyEventReason`, `ChargeKind`, `ChargeStatus`, `WaiverKind`, `MembershipStatus`,
  `PeriodKind`, `FineRounding`, `OverdueIssueRule`, `RenewFrom`, `RenewOverdue`, `LostFoundPaid`.
- Test literals: `apps/common/tests/test_permissions.py` `CANON_PERMISSIONS` gains the 16; its
  action set (`:81`) gains `withdraw`, `close`, `override`, `waive`, `run` (CR item 2: "the
  per-module verbs each FRD lists"). `apps/common/tests/test_exceptions.py:52` changes from 166 to
  196.
- The canon §0.9 / Part 22 CR text is drafted in this file for the gate to move into `docs/CR-LOG.md`.

Tests to write first:
1. T-LIB-14-2: staff holds exactly the seven library codenames, accountant exactly four, admin all
   sixteen. Prevents a `.read`-suffix slip handing the accountant a write.
2. T-LIB-14-3: library enabled but hidden (no flag), or switched off: `permissions_for` holds no
   `library.*`, even with an override `allow`.
3. Registry equals canon, and the format test runs with the widened action set. Prevents an invented
   action such as `library.copy.retire`.
4. 196 codes, and `library_waiver_over_ceiling == (403, False)`. Prevents a 409/403 mix-up: the waive
   dialog shows this refusal inline rather than in the snackbar (LIB-07 §8).
5. Every `LIBRARY_*` audit value starts with `library.` and is ≤ 64 characters
   (`platform_app/models/audit.py:29`). Prevents truncation at insert.
6. `seed_reference_data` drift test stays green (`test_seeds.py:41`, `seed_roles` at
   `seed_reference_data.py:183`); the engine-read scoping tests (`test_module_scoping.py:120-137`)
   still pass now that `library.member.read` exists.

Edge cases: on an existing database the seeded `platform_role.permissions` rows drift until
`seed_reference_data` runs. There is no runtime effect, because `permissions_for` reads
`system_role_permissions` and not the column. `HasPermission` refuses an unknown codename at import
time (`permissions.py:91-94`), so B02 must merge before any library view.

Gaps:
- **G4** CR-PLATFORM-ROLES item 3 says a module's *release* CR adds its codenames to `_STAFF` and
  `_ACCOUNTANT`; FRD B02 adds them now. Default: add them now. It is harmless while the module is
  unreleased (hidden codenames are dropped) and needed for the T-LIB-14-4 matrix under the flag. The
  release CR records it.
- **G5** `test_permissions.py` and `test_exceptions.py` are not on plan §1.3's hot-file list, yet
  every module edits their literals. Track D's DUE-01 also adds error codes (contracts §4) and edits
  the same count line, so a conflict is certain. Default: recount at merge. Propose adding both files
  to the hot list.

---

## B03 — library settings, preset seed, off-guard, number kinds

### Design note (review step)

Status: design written; not started.

Inputs: LIB-01 FR-1–FR-5, §5, §6, §9 (BR-1–BR-4), §12 (T-LIB-01-1…4), §13; contracts §1.1 (R14,
R15), §1.7, §1.8; R26, R32, R43 (the typed `library_settings` model is explicitly allowed);
10-architecture §9; §18 W-P2, W-P3, W-P5; ADR-051.

Adds:
- `apps/library/models/settings.py` `LibrarySettings(TenantModel)`: FRD §5 columns, `version`,
  named CHECKs, unique `tenant`, and `overdue_reminder_days = ArrayField(SmallIntegerField)` with
  default `[1,7,14,30]` (`django.contrib.postgres` is installed, `base.py:36-43`). Migration
  `0002_settings`. Registered in `tenant_data.py`.
- `services/settings.py`:
  - `settings_for(tenant)`: get-or-create, because the enable hook is bypassed when
    `enabled_modules` is written directly (flagged dev databases, fixtures).
  - `seed_library(ctx, tenant)`: BR-4, idempotent.
  - `update_settings(ctx, data, version)`: raises `StaleVersion` (`apps/common/exceptions.py:94`) or
    `ValidationFailed`, and writes `LIBRARY_SETTINGS_UPDATED` with `diff_fields`.
  - `raise_number(ctx, kind, next_number)`: calls `sequences.raise_counter(ctx=…, kind=…,
    next_number=…, via="settings")` (`services/sequences.py:209`; `via` is W-P2).
- `ready()`:
  - `register_number_kind` three times, exactly as contracts §1.7 (`sequences.py:61`):
    `library_member` (perpetual, `"M-"`, padding 4), `library_accession` (perpetual, `""`, 0),
    `library_charge` (fy, `"FIN"`, 4); `label_id` is `library.numbering.*`.
  - `register_module_enable_hook("library", seed_library)` (`services/guards.py:105`).
  - `register_calendar_reader("library")` (`services/calendar.py:54`). Without it, `validate_module`
    (`:211`) refuses `module="library"` and `closed_weekdays()` hides the library override (`:181`).
- Views: `GET`/`PUT /library/settings` and `POST /library/settings/numbering`, with
  `permission_classes = [IsAuthenticated, ModuleEnabled("library"), HasPermission(…)]`.
  `meta.numbering.accession.next` comes from `peek_counter` (`:201`); the member series takes its
  prefix from the `DocumentSequence` row, else the spec. `meta.closed_weekdays` =
  `closed_weekdays(t)["modules"].get("library", closed_weekdays(t)["value"])`.

Tests to write first:
1. T-LIB-01-1: seeding twice leaves one row. Prevents duplicates after switching off and on (EC-2).
2. Enabling library through `PATCH /tenants/current` under the flag runs the seed inside that
   transaction, and a raising seed leaves library off. Prevents "on and half-seeded".
3. T-LIB-01-3: a stale `version` is 409 `stale_version` with `current_version`; staff `PUT` is 403;
   an accountant gets `GET` 200 but `PUT` 403.
4. T-LIB-01-4: a lower number is 409 `sequence_backwards` with `details.current`; an equal one is 200
   with no audit row; a higher one writes exactly one `counter.raised` row with `via="settings"`.
5. `kind="library_charge"` is 400. `raise_counter` raises `ImproperlyConfigured` for an FY kind
   (`sequences.py:158-162`), so without this check the request is a 500.
6. Field rules return 400 per key: reminder days de-duplicated and sorted, each 1–365, at most six;
   pickup days 1–30; multiplier 0–10 at 2 dp; money bounds.
7. The core numbering view lists the three kinds only while library is effective (A8's pattern,
   `test_number_kinds.py`).
8. The support-session walk (`test_support_session_view_only.py:94`) picks up the new writes
   automatically, and must stay green.

Edge cases:
- A `GET` before any seed returns defaults.
- Concurrent raises serialise on the sequence row (EC-3).
- The core numbering screen can change `library_accession`'s prefix (`_validate_numbering` accepts
  `^[A-Z0-9/-]{0,12}$`), so B05 must read typed numbers against the row's prefix.
- Do not register a deposit off-guard. Payments already counts library deposits
  (`apps/payments/apps.py:47-56`, `payments.off.depositsOpen`), so a second counter would double
  the count.

Gaps:
- **G7** FR-5's switch-off counters count loans (B09), charges (B10) and holds (B11), none of which
  exist at B03. Default: each table's task registers its own counter, labelled
  `library.off.<thing>` (A12 convention).
- **G8** FRD §6 `PUT /library/settings/closed-weekdays` contradicts §18 W-P3 ("one write path,
  `PUT /calendar/weekdays`"). The core view already lets `library.settings.manage` write the library
  override alone (`views/calendar.py:37-42,140-160`). Default: not built; F02 calls the core endpoint.
- **G9** `GET` needs "settings.manage **or** any `library.*.read`", but `HasPermission` maps one
  codename per action (`permissions.py:75-130`). Default: a library-local
  `HasAnyPermission(*codenames)` in `apps/library/permissions.py`, checked against `PERMISSIONS` at
  import. Lead to say whether it belongs in `common`.
- The FRD seed creates the "Standard" membership type, whose table is B06's. B06 extends the seed (a
  module may register several hooks).

---

## B04 — ISBN and accession helpers

### Design note (review step)

Status: design written; not started.

Inputs: LIB-02 FR-5, FR-9, §5 `accession_sort`, §9 (the ISBN row, BR-2, BR-3, BR-4, BR-8), EC-3,
EC-5; T-LIB-02-1, T-LIB-02-2; LIB-04 §5 `member_number_sort` ("as `accession_sort`").

Adds pure modules, with no database access and no Django imports:
- `apps/library/services/isbn.py`:
  - `normalise(raw)`: strips spaces and hyphens and upper-cases `x`.
  - `is_valid_isbn10`: mod 11, with `X` allowed only last.
  - `is_valid_isbn13`: EAN check with a 978/979 prefix.
  - `to_isbn13(raw) -> str | None`: converts 10 → 13 as 978 + the nine digits + a new check digit.
  - `to_isbn10`: for display; `None` for 979.
- `apps/library/services/codes.py`:
  - `validate_number(raw)`: 1–24 characters matching `^[A-Za-z0-9][A-Za-z0-9/-]*$`, trimmed.
    Characters are ASCII only (Python's `str.isdigit()` is true for Devanagari ०–९, so it is never
    used).
  - `number_key(raw)`: upper-case, for lookup and uniqueness.
  - `natural_sort_key(raw)`: BR-4.
  - `numeric_value(raw) -> int | None`: all digits only, so `"0042"` is 42 (BR-2, EC-3); takes the
    series prefix (B03 edge case).
  - `classify(code)`: returns `{number_key, isbn13 | None}` for the counter's resolver. The order of
    matching is B05's and B07's (BR-8).

Tests to write first:
1. ISBN vectors are computed, never copied: `978-81-7371-146-6` is valid; its ISBN-10 is
   `8173711461`. A check digit `X` is accepted only last; lowercase `x` passes; prefix 977 fails;
   letters inside fail; a 979 number has no ISBN-10.
2. Sort vector (corrected, G12): `9, 10, 100, 4512, 4512-A, R-2, R-10`.
3. A fuzz test compares `natural_sort_key` order with a reference Python natural sort over random
   legal numbers. Prevents padding regressions.
4. `classify("8173711461")` gives both a number key and an ISBN. Accession wins in B05, so a
   ten-digit register number is never read as a book (BR-8).
5. Devanagari digits and spaces inside a number are refused with "Use letters, numbers, - or /."

Gaps:
- **G11** T-LIB-02-1's example "817371146X-style" is not this book's ISBN-10 (the check digit is 1).
  Use computed vectors; `X` arises only when the weighted sum leaves a remainder of 1 mod 11.
- **G12** T-LIB-02-2 expects `R-2, R-10, 9, 10, …`, which contradicts BR-4: padded digits
  (`000000000009`) sort before letters in every collation. Default: follow BR-4 and fix the test
  vector. The column gets `db_collation="C"`, so a glibc or ICU locale (which ignores `-` at the first
  level) cannot reorder `4512-A` and `4512A`.
- **G13** `varchar(48)` overflows. A legal 24-character number with 12 digit runs (`1/1/1/…`) pads to
  155 characters, and a run longer than 12 digits misorders. Default: `varchar(160)` (a library-owned
  column) and pad each run to `max(12, len)`. The same applies to `member_number_sort`.

---

## B05 — catalogue: models, services, API, lookup

### Design note (review step)

Status: design written; not started.

Inputs: LIB-02 §1–§13, T-LIB-02-3…8; contracts §1.7; ADR-051; 10-architecture §5, §10 rule 4
(`pg_trgm` only), §11 (replay); CLAUDE.md PTY-02 (index direction, `StableOrderingFilter`) and PTY-03
(omit, never fake, keys whose tables do not exist).

Adds:
- `models/catalogue.py`:
  - `LibraryCategory` and `LibraryLocation` (`TenantModel + SoftDeleteModel`).
  - `LibraryTitle`: `search_text` as a `GeneratedField`, the two caches, `version`.
  - `LibraryCopy`: `accession_sort` uses C collation (G12, G13); plus `issued_ever` and `version`.
  - `LibraryCopyEvent` (`TenantModel + ImmutableModel`).
  - FRD §5 constraints: `uq_library_copy_accession` on `Upper(accession_number)` with **no**
    soft-delete exclusion; the partial barcode unique; `ck_library_copy_withdrawn`.
  - `GinIndex(OpClass("search_text", "gin_trgm_ops"))` (precedent `parties/migrations/0002`).
  - Migration `0003_catalogue`. Five tables registered in `tenant_data.py`.
- `services/copy_status.py` `move_copy(ctx, copy, to_status, reason_code, source, on_date)` is the
  **only** writer of `copy.status`. It writes the event and moves the title caches with `F()`, never
  bumping `version`. Otherwise every issue would make an open title editor answer 409.
- `services/catalogue.py`:
  - create a title with its copies; add copies; patch a title or copy (number frozen once
    `issued_ever`); withdraw, repair, back to shelf; archive and restore; categories (merge,
    delete-or-deactivate, one level); locations.
  - Numbers: `allocate_counter(tenant=, kind="library_accession")` per copy (`sequences.py:187`),
    taken last. Typed numbers: the largest `numeric_value ≥ peek_counter` gives one
    `raise_counter(next=n+1, via="typed")`, also last.
- `selectors/catalogue.py` (read-only; `test_selectors_never_write` applies): search over the trigram
  `search_text`, the normalised ISBN and an exact number; `lookup` in BR-8 order (number, barcode,
  ISBN; member numbers are B07's).
- Views per §6:
  - `POST` is wrapped in `@idempotent("library.title.create")` (`apps/common/idempotency.py:51`).
  - `StableOrderingFilter` (`apps/common/filters.py:64`); `ordering=accession` sorts on
    `accession_sort`.
  - Omitted until their tables exist: `holds_waiting`, `holds`, `issues_12m`, `due_on`, `borrower`,
    `loans`. Until then `has_holds` and `-issues_12m` are 400, not silently ignored.
- `management/commands/library_recount.py`.

Tests to write first:
1. T-LIB-02-3: `4513`/`4513` and `r-1`/`R-1` raise `IntegrityError`, and so does reusing a withdrawn
   copy's number. Prevents reuse (FR-5).
2. T-LIB-02-4: typing 9000 raises the counter to 9001 with one audit row; `4512-A` does not move it.
3. A typed number already taken on copy 3 of a create gives 409 `library_accession_taken {number,
   copy_id, title}`; the counter and copies 1–2 are rolled back (BR-1, "no gap").
4. T-LIB-02-5 replay: 200 fuzzed `move_copy` steps, then `library_recount` changes nothing.
5. T-LIB-02-6: a frozen number gives 409 `library_accession_frozen`; a stale `version` gives 409.
6. Withdrawal is refused while `on_loan` or `on_hold_shelf` (BR-7). Withdrawing the last copy
   archives the title (FR-12). A manual archive with copies left is 409 `library_title_has_copies`.
7. T-LIB-02-7 `EXPLAIN` at 50,000 copies: search uses `ix_library_title_search`, and a number lookup
   uses the unique index (the `tests/performance/test_party_list_plans.py` pattern).
8. A duplicate ISBN gives 201 with `meta.warnings` (BR-5). The same number twice in one request, or a
   count over 200, is 400 before any write (EC-1).
9. Merging categories moves the titles, then soft-deletes. Deleting a used category or location
   gives 409 `*_in_use {count}`. A parent may not have a parent.
10. A cross-tenant id is 404. Staff withdraw is 403. An accountant `POST` is 403.

Edge cases:
- Two devices typing the same number collide on the unique index. Catch it in a savepoint and map it
  to 409 with details read afterwards.
- Lock order: the copies in id order, then the title's `F()` update; never the title first.
- A search under three characters cannot use trigrams, so it falls back to a prefix match on
  `lower(title)`. That needs `text_pattern_ops` or C collation on `ix_library_title_list`.
- Devanagari titles match through trigrams as typed (EC-5).

Gaps:
- **G14** A generated column must be IMMUTABLE. Confirm with `sqlmigrate` that Django 5.2.6's `Concat`
  compiles to `||` with `COALESCE`, not `CONCAT()` (which is STABLE and refused). Fallback: a `Func`
  with an explicit `||` template.
- **G15** `copies_available` is "available and not reference". Default: exclude both
  `copy.is_reference` and a title whose `material_type` is reference (LIB-05 BR-1). The UI label reads
  "available to borrow", not "on shelf".
- **G16** `library_code_ambiguous` (BR-8) needs member numbers. B05 checks barcode against accession;
  B07 adds the member side. Cancelling holds on the last withdrawal (LIB-08 EC-4) is a B11 hook.
- Size: the FRD says L and the plan says M. This is the largest task in this set.

---

## B06 — membership types and loan rules

### Design note (review step)

Status: design written; not started.

Inputs: LIB-04 FR-1, §5 (`library_membership_type`); LIB-05 FR-1, §4–§6, §9 BR-1/BR-2,
T-LIB-05-1, EC-4; D29, D31; Q6 (library grace 0).

Adds:
- `LibraryMembershipType`: FRD §5 columns and CHECKs, a unique `(tenant, Lower(name))`, and
  `version`.
- `LibraryLoanRule`: unique `(tenant, membership_type, material_type)` with `nulls_distinct=False`
  (precedent `ledger/migrations/0007_reminder_source.py:106`; PostgreSQL 16).
- Migration `0004_membership_types`, which also creates the membership tables (G17).
- `services/rules.py`, pure: `resolve_rule(type, rows, material, is_reference) -> ResolvedRule
  {loanable, loan_days, max_renewals, fine_per_day, fine_cap, grace_days, source}`.
  - Columns are resolved one at a time: (T,M), then (null,M), then T's defaults (BR-1).
  - `is_reference` resolves as `reference`.
  - `allows_reference_loan` makes a non-loanable reference loanable (BR-2, D29).
  - B08, B09 and B10b call it.
- `services/membership_types.py`: create, and patch with `version`. A type is deactivated, never
  deleted (FR-1).
- `services/loan_rules.py`: `replace_rules(ctx, rows)` in one transaction, serialised on the
  settings row (rules have no `version`).
- Seed extension (B03's hook): the "Standard" type only when the tenant has no type, and the
  `(null, reference, loanable=false)` rule only when it has no rule (BR-4).
- Views: `GET`/`POST /library/membership-types`, `PATCH /{id}`; `GET`/`PUT /library/loan-rules`, with
  the resolved matrix in `meta.effective`. Audit `LIBRARY_MEMBERSHIP_TYPE_*` and
  `LIBRARY_LOAN_RULES_UPDATED`.

Tests to write first:
1. T-LIB-05-1: all eight combinations, including a mixed resolution (`loan_days` from (T,M) and
   `fine_per_day` from (null,M)). Prevents a whole-row "most specific wins" bug.
2. A reference copy of a "book" title resolves as reference; a type with `allows_reference_loan`
   lends it for the resolved number of days.
3. Two `(null, magazine)` rows raise `IntegrityError`. Prevents duplicate defaults that would make
   resolution depend on row order.
4. `PUT` with one bad row is 400 `rows.N.field`, and nothing changes.
5. The type CHECKs hold in the database and in the service (`max_copies` 0–50 and so on). A
   case-insensitive duplicate name is 400.
6. Seeding twice is idempotent, and a tenant that deleted its reference rule does not get it back.
7. There is no `DELETE` on types (405). Staff `POST` is 403; an accountant `GET` is 200.

Edge cases:
- A deactivated type still resolves for the memberships that hold it.
- A rule change never touches open loans (EC-4; the snapshot is B09's).
- Deleting the reference rule makes reference copies loanable. That is allowed, and the settings tab
  must say so.

Gaps:
- **G17** `library_charge.membership_id` is NOT NULL and points at `library_membership`, which the plan
  gives to B07. B07 runs after B10 and must post fee charges through it, so neither order works as
  written. Default (proposed): B06's migration also creates the **schema only** of
  `library_membership` and `library_membership_period`. B07 keeps their services, API, party role and
  archive guard.
- Read access is "any `library.*.read`" (G9).

---

## B08 — due dates over the core calendar

### Design note (review step)

Status: design written; not started.

Inputs: LIB-05 FR-2–FR-8, §6, §9 BR-3–BR-5 with worked examples 1–5, T-LIB-05-2/-3/-5, EC-1, EC-2,
EC-5; contracts §1.8 (R32, inclusive); ADR-055.

Adds (`services/due_dates.py`):
- `compute_due(raw: date, closed: set[date]) -> (due_on, moved_from | None)`: pure, so the worked
  examples run without a database.
- `due_on_for_issue(tenant, issued_on, loan_days)`. It applies `next_open_day(tenant, issued_on +
  loan_days, module="library")` (`services/calendar.py:158`) through a single `closed_days_between`
  read (`:137`; one SQL statement, `:88-99`).
- `renewal_due_on(tenant, *, renewal_day, old_due_on, loan_days, renew_from)`: when the result is not
  later than the old due date, it refuses with 409 `library_renewal_refused` and
  `{reason: "no_gain", overridable: false}` (BR-4).
- `ImproperlyConfigured` from `next_open_day` (`calendar.py:167`) is caught and raised as 409
  `library_calendar_all_closed` (BR-3), never a 500.

Tests to write first:
1. T-LIB-05-2: the five worked examples, against real `platform_closed_day` rows and the
   `calendar.closed_weekdays.library` key. The dates are verified: 26 Sep 2026 is a Saturday, 9 Nov a
   Monday and 11 Nov a Wednesday.
2. Weekday precedence: the library override beats the tenant's weekdays both ways. A tenant-wide
   closure (module null) closes the library too (EC-1).
3. Renewal from today and from the due date (examples 4 and 5); `no_gain` when the result is not
   later.
4. An issue on a closed day is allowed and dated as issued (EC-2). `issued_on` comes from
   `tenant_today` (`apps/common/dates.py:23`), never the server date (EC-5).
5. Query budget: one due-date computation is one query. Prevents a per-day calendar read at a busy
   counter.
6. All days closed gives 409. It can be reached only with 366 dated closures, or by writing the
   setting row directly, because the core refuses seven closed weekdays (`_clean_weekdays`,
   `calendar.py:220-232`).

Edge cases: a holiday added later never moves stored dates (FR-7, BR-5); a 45-day vacation moves the
due date to the first open day after it (EC-3).

Gaps:
- **G18** FRD and plan B08 include `GET /library/loans/due-on` and `POST /library/loans/shift-due`.
  Both read or write `library_loan` and its `due_changed` events, which are B09's. They also include
  `GET /library/due-date-preview?membership_id&copy_id`, which needs B07 and B05. None of these
  exists after B06. Default: B08 ships the services and pure functions; the three endpoints, with the
  shapes unchanged, land with B09.
- BR-4 refuses a renewal that gives an *earlier* due date. Default: an *equal* date is refused too,
  because it gains nothing.
- T-LIB-05-5 ("every weekday closed") cannot be set through the core API, as noted in test 6.

---

## B10 — charges and waivers, posting sources, target, fine calculator

### Design note (review step)

Status: design written; not started.

Inputs: LIB-07 §1–§13 (BR-1–BR-14, the twelve worked examples, T-LIB-07-1…10); LIB-04 BR-4;
contracts §1.2 (sources table, rules 1–3), §1.4 (protocol v2, R30, R36, R6), §1.7; 10-architecture
§5 (ceilings are role checks), §11; ADR-047, ADR-048; D3, D5, D7, D19, D24, D27.

Adds (scope as proposed in G19):
- `models/charges.py`:
  - `LibraryCharge` and `LibraryWaiver`, with the FRD §5 CHECKs and the partial FIFO index.
  - Migration `0005_charges`, after `0003` (copy) and `0004` (membership). B09 adds the `loan` FK
    with `AddField`.
  - A `document_date` property returning `charge_date`, because payments sorts and the contract
    suite reads `document.document_date` (`payments/services/record.py:294`,
    `tests/contracts/test_allocation_targets.py:162`).
  - `objects.open()` = `amount_due > 0 AND reversed_at IS NULL` (G20).
- `services/fines.py`: the pure calculator `calculate_fine(*, due_on, returned_on, closed,
  skip_closed, fine_per_day, grace_days, fine_cap, price, fallback_price, already_charged,
  rounding) -> FineCalc`, following FRD §9 with `round_amount` (`apps/common/money.py:101`).
- `services/charges.py`:
  - `create_charge`:
    - locks the party (`lock_party`, `parties/services/balance.py:32`), then the membership;
    - takes the number last with `allocate_number(kind="library_charge", on_date=…)`
      (`sequences.py:123`);
    - posts with `post_source_entry(entry_type="charge", source_type="library_charge",
      bucket="main", note=description, source_number=…)` (`ledger/services/postings.py:205`);
    - never runs a credit check (D7).
  - `waive`: needs the codename; when the ceiling applies, the role must be owner or admin, else
    `BusinessRuleViolation("library_waiver_over_ceiling", details={"ceiling"})`. Posts
    `adjustment_credit` through `library_waiver`.
  - `reverse`: only when `amount_paid = 0`, else 409 `library_charge_has_payments {payment_ids}`
    from the live allocations. Calls `reverse_source_entries` (`postings.py:287`) for the charge and
    for each standing waiver.
  - Manual charges (`processing`, `other`).
  - Status comes from one derivation function (BR-4).
- `LibraryChargeTarget`, registered with `register_target` (`payments/services/targets/__init__.py:137`):
  `in`, `main`, `auto=True`; locks in `(charge_date, number, id)` order; `summary.label =
  description[:120]` (R30 caps a label at 120, `description` holds 160).
- `ready()`:
  - `register_posting_source` for `library_charge {charge: debit}` and `library_waiver
    {adjustment_credit: credit}`, both `main` (`postings.py:96`; contracts §1.2 table).
  - Two source resolvers (`ledger/selectors/sources.py:42`).
  - An off-guard, `library.off.chargesOpen`.
- API: `GET /library/charges` and `GET /{id}`; `POST /library/charges` (idempotent); `POST
  /{id}/waive`; `POST /{id}/reverse`.
- `tests/contracts/test_allocation_targets.py` `FACTORIES` (`:114`) gains `library_charge`.
  Otherwise `test_every_registered_target_is_under_contract` fails.

Tests to write first:
1. T-LIB-07-1: the twelve examples, table-driven and pure. All twelve were re-derived for this
   review (for example: example 11 skips 8, 9 and 10 Nov, so 3 days and ₹6; example 12 has room
   ₹94).
2. T-LIB-07-2 cap room property test, and T-LIB-07-3 status derivation over every combination.
3. T-LIB-07-4: the shared target suite passes through the new factory.
4. T-LIB-07-5: the registration shape is right, and posting in the `loan` bucket raises
   `LedgerPostingError`.
5. T-LIB-07-6 / T-LIB-14-5: staff with an override waive ₹100 and are refused ₹101 with 403; an
   admin waives ₹250.
6. T-LIB-07-8: reverse is refused with a payment and allowed after its void; the waivers are
   reversed too and the khata nets to zero.
7. An `"auto"` payment settles an older fine before a newer invoice (`merge_oldest_first`,
   `record.py:297`). An earmarked payment is skipped.
8. A party over its credit limit still gets its charge (D7). T-LIB-07-10: the ledger trigger refuses
   an `UPDATE`.
9. The off-guard counts open charges only. A paid, waived or reversed charge never blocks.
10. Replay subset of T-LIB-07-9: `amount_paid` = Σ live allocations and `waived_amount` = Σ standing
    waivers.

Edge cases:
- A fine of ₹0 writes no charge (EC-2).
- `already_charged` excludes reversed fines.
- Price `0.00` versus unknown: default `None` only means unknown, so a ₹0 price caps the fine at ₹0.
  Flag for the owner.
- A waiver racing a payment sees the committed `amount_due` (EC-4).
- A manual charge on a closed membership is 409 `library_membership_closed`.

Gaps:
- **G19** Plan B10 says "after B03", but `library_charge` needs FKs to membership (B07), copy (B05)
  and loan (B09). The FRD's B10 also includes lost, found, replace, damage and `fine-preview`, all of
  which need loans. Default: B10 runs after B05 and B06 (with G17); `loan_id` is added by B09; that
  work becomes **B10b** after B09.
- **G20** The FRD CHECK `amount_due = amount − amount_paid − waived_amount` leaves a *reversed* charge
  with `amount_due > 0` for ever. Every "open" query must also test `reversed_at IS NULL`, or a
  reversed fine blocks switching the module off and inflates dues. Default: the single
  `objects.open()`.
- **G21** Voiding the payment of a lost charge that was later refunded (found) makes the target's
  `unapply` breach `refunded_amount ≤ amount_paid`, and the void becomes an `IntegrityError`, a 500.
  Default: `unapply` refuses first with 409 `library_charge_not_open {status: "refunded"}`. Lead to
  confirm that the core void path surfaces it.
- **G22** The ceiling compares each waiver separately, so three ₹90 waivers pass a ₹100 ceiling.
  Default: compare cumulatively per charge (`waived_amount + amount > ceiling`) for `kind=waiver`.
  T-LIB-14-5 is unchanged.
- **G23** `SourceSummary` (`sources.py:24-35`) carries no link or subject id, so FR-11's "links to the
  member page" cannot come from the resolver. Default: the khata shows the number and the ledger note
  in the MVP, and a v1.1 optional link key is proposed (like W-P6). F06 must label the new `kind`
  values, or a raw message id is shown again (the CLAUDE.md LED-04 defect).

---

## Open questions for the lead

1. **G17 / G19 (order):** move the `library_membership` and period *schema* into B06, run B10 after
   B05 and B06, and split lost/found/replace/damage into **B10b** after B09?
2. **G18:** the due-on, shift-due and due-date-preview endpoints move from B08 to B09?
3. **G3:** how does a dev or e2e tenant get library on its plan and partner while it is unreleased?
   E01 is blocked without it.
4. **G1, G5:** add `tests/migrations/test_reversibility.py`, `apps/common/tests/test_permissions.py`
   and `test_exceptions.py` to the hot-file list, since three tracks edit their literals. Also add a
   guard so `LOCAL_APP_LABELS` cannot miss an installed app.
5. **G8:** confirm that weekdays are written only through `PUT /calendar/weekdays` (W-P3), and drop
   FRD `PUT /library/settings/closed-weekdays`.
6. **G9:** should `HasAnyPermission` live in library or in `common/permissions.py`?
7. **G12, G13:** correct T-LIB-02-2's expected order to match BR-4, and widen the sort columns to
   `varchar(160)` with C collation?
8. **G20–G22:** the open-charge predicate, the `unapply` refusal on a refunded charge, and the
   cumulative waiver ceiling.
9. **G2:** library `0001` without a dependency on `sales 0005`?
10. **G23:** a v1.1 link key on `SourceSummary` for module charges, or no link in the MVP?

## Lead rulings (1 Oct 2026)

- **Engine test subjects** live in the engine's own tests: `backend/apps/dues/tests/subject.py` and `backend/apps/attendance/tests/subject.py`. They do not go in `tests/fixtures/`, which would shadow `tests/fixtures.py`, or in a shared `tests/engine_subjects/`, which neither track would own. 10-architecture §11's path is superseded by this.
- **ADR-062 F-62-1 approved.** ADR-062 and ADR-061 are amended in place (1 Oct, before any code). Registration lives in `redux/<module>Invalidation.ts`, which every thunk file of the module bare-imports and which is listed in `sideEffects`. Module `patch` may name only the module's own slices. `register.ts` carries no message ids. F01 adds the frontend core-to-vertical boundary zone.
- Every other open question keeps the default recorded above until the next lead session or the owner answers.
