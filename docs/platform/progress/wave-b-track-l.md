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
| B01 skeleton | done (QA round 1: no code defect) | 5b031af4 |
| B02 codenames, errors, audit | done (QA closed: 536d9436, CR 63f0a8db) | 8824cdc4 |
| B03 settings, seed, numbering | built; ready for QA | 49ecdd0f |
| B04 ISBN and accession helpers | done (QA closed: bac48ccc) | ad287ba5 |
| B05 catalogue | built; ready for QA | 1072746b |
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

### QA round 1 (2 Oct 2026, independent QA, branch `wave-b/qa-b01`)

Reviewed `5b031af4` and `50e77422` as they stand on `dev` (`6bd6d142`), against FRD LIB-01 FR-7 and
T-LIB-01-5/6/7, the task row B01 (FRD §Implementation task list), plan §1.3, §1.4 and §3,
10-architecture §2.1, §2.4, §7 and §10, and the lead rulings above.

**Findings: no code defect, so this round adds no failing tests.** One documentation slip:

- **QA-B01-1 (low, docs)** — the Status table above (`| B01 skeleton | … | a3ef128 |`) names a commit
  that does not exist in the repository (`git cat-file -t a3ef128` → "not a valid object name").
  The change is on `dev` as `5b031af4` (code) and `50e77422` (this file). `50e77422` exists only to
  record the commit id, and it recorded the id from before the change was rebased or cherry-picked
  onto `dev`. Expected: the row names `5b031af4`. No test, because the defect is in a document.

**Checked and sound** (gate run on `test_ub_qa`):
- `apps/library` 4, `apps/platform_app/tests/test_tenant_data.py` + `test_release_gate.py`, and
  `tests/migrations`, the slow round trip included: 103 passed. `library` is in `LOCAL_APP_LABELS`
  and the round trip applies, unapplies and re-applies `library 0001`. `makemigrations --check
  --dry-run` reports no changes. `black`, `isort` and `flake8` are clean on `apps/library`.
- `tests/architecture`: every test passes except `test_settings.py::test_prod_settings_refuse_the_development_defaults`.
  That one fails here only because this Mac's `backend/.env` sets a real `UB_SECRET_KEY`. The lead
  confirmed it is fixed on `dev` in `b3730e7a`, so it is not a B01 finding. `test_import_rules` walks
  `apps/library` now. The only skips are the five apps not yet on disk (attendance, bookings, gym,
  hospitality, lending).
- Migration graph: `library 0001_initial` is `initial`, has no operations, and has exactly four
  parents: `ledger 0007_reminder_source`, `parties 0010_party_relation`, `payments 0004_held_deposit`
  and `platform 0013_closed_day`. All four are fixed Wave B heads (plan §1.4 rule 2). Leaving out
  `sales 0005` is G2's recorded default and stays valid. 10-architecture §10 rule 1 ("vertical `0001`
  depends on the engines it uses") is met vacuously, because the library MVP uses no engine table
  (plan §3). Note that `ENGINES_USED_BY["library"] = {"dues"}` (Wave A) still switches on
  `EngineEnabled("dues")` for a library tenant. If a later library migration takes an FK to a `dues_*`
  table, it must add a `dues` dependency then.
- Hot files: one `# ── B01 ──` block each, appended in `INSTALLED_APPS`, `config/urls.py` and
  `LOCAL_APP_LABELS` (plan §1.3). The mount `path("library/", include("apps.library.urls"))` matches
  10-architecture §2.1 and §7 (`/api/v1/library/`). With `urlpatterns = []`, nothing under the prefix
  resolves, with or without the flag.
- `LibraryConfig`: name `apps.library`, label `library` (table prefix `library_*`). `ready()` imports
  nothing. `tenant_data.py` registers nothing and `PENDING_APPS` stays empty, which is correct with
  no models (T-LIB-01-7).
- Release gate (FR-7, T-LIB-01-5): `ModuleCode.LIBRARY` and its `UNRELEASED_MODULES` entry predate
  B01 (A1). `test_release_gate.py` covers `modules_view`, `/auth/me`, `ModuleEnabled`,
  `permissions_for` and the profile for all four new codes, and `src/types/moduleCodes.test.ts` keeps
  the client `MODULE_CODES` equal to the server enum. `prod.py:46` refuses the flag outside `ci`/`e2e`,
  and both `.env.example` files ship `UB_UNRELEASED_MODULES=0`.
- `library_on` fixture: `hidden_modules()` is read at call time, so `override_settings` takes effect.
  `for_tenant`'s per-instance cache is not primed before the fixture writes the plan and partner. The
  factories' tenant already has `parties`, `ledger` and `payments` on, so the fixture never produces a
  state that `MODULE_DEPENDENCIES` would refuse. The two release tests can each fail for the reason
  they name, and together they rule out a fixture that hides library through the entitlement instead
  of the flag.

**Not a finding, for the lead (open question 4):** nothing yet guards `LOCAL_APP_LABELS` against a
missing installed app. All 16 local apps that have migrations are listed today (`help`, which has none, is listed too), so a guard test would
pass, which is why this round adds none.

---

## B02 — codenames, error codes, audit actions, canon CR text

### Design note (review step)

Status: built; ready for QA (see "Built" below).

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

**Note refreshed before building (2 Oct):** DUE-01 is on dev and moved the error-code count to 167,
so B02 takes it to **197**, not 196. Nothing else in the note changed on disk.

### Built (2 Oct 2026)

Landed as the note says. Each shared file carries one `── B02 ── library (LIB-14) ──` block,
appended:
- `apps/common/permissions_registry.py`: the sixteen codenames at the end of `PERMISSIONS`, and the
  seven at the end of `_STAFF`. Admin and accountant derive (verified: admin all sixteen, accountant
  exactly the four `.read`). `ENGINE_READ_PERMISSIONS["dues"]["library"]` now names a real codename.
- `apps/common/error_codes.py`: the thirty Appendix A codes after DUE-01's block, all `(409, False)`
  except `library_waiver_over_ceiling (403, False)`, each with its `details` keys in a comment.
- `apps/common/audit.py`: 58 `LIBRARY_*` constants, exactly Appendix B, after DUE-01's block. Core
  actions (deposit, payment, counter, reminder) are reused, not copied.
- `apps/library/constants.py` (new): the sixteen vocabularies, values in FRD §5 order.
- `docs/22-api-specification.md` §22.1.1: a new **table L — Library** after table I, thirty rows with
  envelope, condition, English message and `hi` key.
- Test literals: `apps/common/tests/test_permissions.py` (`CANON_PERMISSIONS` +16; the action set +
  `withdraw`, `close`, `override`, `waive`, `run`), `apps/common/tests/test_exceptions.py` (167 → 197).

New tests: `apps/library/tests/test_codenames.py` (8: the sixteen; staff seven; accountant four;
owner and admin sixteen; the dues engine codename exists; hidden library grants nothing even to an
`allow`; switched-off library grants nothing; the positive control with delegation and deny) and
`apps/library/tests/test_vocabulary.py` (7: Appendix A codes and statuses; the 403; audit actions
equal Appendix B; ≤ 64 characters and name = value; core actions not duplicated; vocabularies equal
the FRD CHECK lists; values fit their columns). The six registry tests failed before the change; the
two hidden/off tests are guards that passed before (nothing granted library) and are kept honest by
the positive control.

Gates: `apps/library` + `apps/common/tests` + `tests/architecture` + `test_release_gate` +
`apps/dues/tests` **528 passed, 12 skipped**; the other suites that read the registry or role sets
(`apps/platform_app` whole, `tests/contracts`, notifications, the expenses/tax/parties/reports tests
that use `ROLE_PERMISSIONS`, `test_list_page_size_queries`) **1011 passed, 1 skipped**;
`makemigrations --check` clean; `black`, `isort`, `flake8` clean on every touched file. No screen.

Deviations from the note:
- The count is 197 (above).
- Part 22 rows go in a new table L rather than being "appended" to table I, because §22.1.1 groups
  codes by area and none of A–I is the library's.
- Part 22 §22.1.3 rule 3 asks for `errors.<code>` in `locales/en.json` and `hi.json` in the same
  change. Not done here: `locales/en.json` carries 25 `errors.*` keys for 167 existing codes (the rule is not
  enforced by `check-locales.mjs`), the library's copy belongs in its own catalogue
  (`library.{en,hi}.json`, F01), and B02 is backend-only. Table L's header says so.
- The frontend `PermissionCode` union (LIB-14 §7) is F01's, not B02's; nothing on the frontend reads
  a library codename yet.

New contradiction: none. Note only — FRD LIB-10 §6 lets `library.verification.run` close a stock
check while §9 row 14 lists "close" under `library.verification.close`; §9's own row 13 says run
covers "start, scan, close", so §6 and row 13 agree and row 14's word means *reopen and mark
missing*. B13 should read it that way.

### Canon CR draft — for the lead to file in `docs/CR-LOG.md` / Part 43

> **CR-2026-10-02-LIB-14 — canon §0.9 and Part 22 §22.1.1: the library's codenames, error codes and
> audit actions**
>
> **State:** `raised` (built by Wave B task B02 behind `UNRELEASED_MODULES`). Drafted by Track L in
> `docs/platform/progress/wave-b-track-l.md`.
> **Target:** Part 0 §0.9 (codenames), Part 20 §20.5.5 (role sets), Part 22 §22.1.1 (table L),
> Part 21 §21.3.1 (audit vocabulary); `apps/common/permissions_registry.py`,
> `apps/common/error_codes.py`, `apps/common/audit.py`.
>
> *Change.*
> 1. **Codenames.** Canon §0.9 gains sixteen, in the `<module>.<resource>.<action>` format, using
>    the per-module verbs CR-2026-09-30-PLATFORM-ROLES item 2 admitted (`withdraw`, `close`,
>    `override`, `waive`, `run`): `library.catalogue.read|write`, `library.copy.withdraw`,
>    `library.member.read|write|close`, `library.loan.read|write|override|adjust`,
>    `library.charge.waive|write`, `library.verification.run|close`, `library.reports.read`,
>    `library.settings.manage`.
> 2. **Role sets** (FRD LIB-14 §10). Owner and admin hold all sixteen. Staff holds seven:
>    `catalogue.read|write`, `member.read|write`, `loan.read|write`, `verification.run`. The
>    accountant holds the four reads (`catalogue`, `member`, `loan`, `reports`) through its `.read`
>    rule. `loan.override`, `loan.adjust`, `charge.waive` and `copy.withdraw` are off for staff and
>    grantable per member through `permissions_override.allow` (FR-3). A waiver above the ceiling
>    (D27) and a deposit refund (D28) are role checks inside the service and no override can grant
>    them (FR-4) — the LED-03 distinction between a business ceiling and an ordinary capability.
>    This adds library codenames to `_STAFF` at build time rather than at release (item 3 of the
>    PLATFORM-ROLES CR said the release CR does it): while the module is in `UNRELEASED_MODULES`
>    `permissions_for` drops every `library.*`, so nobody holds them until release, and the T-LIB-14-4
>    matrix needs them under the flag. The release CR (T-R1) records the matrix as live.
> 3. **Error codes.** Part 22 §22.1.1 gains table L, thirty codes from FRD library Appendix A, all
>    409 and not retryable except `library_waiver_over_ceiling`, which is **403**: it is a role
>    ceiling, not a conflict with the row's state, and LIB-07 §8 shows it inline in the waive dialog
>    naming who can waive. The fifteen core codes Appendix A lists as reused are not duplicated.
> 4. **Audit actions.** Part 21 §21.3.1 gains the 58 `library.<entity>.<verb>` actions of Appendix B.
>    Deposit, payment, counter and reminder rows written by library flows use the core actions.
>
> *Why.* The registry test asserts equality with canon §0.9, and Part 22 §22.1.1 is the closed error
> registry; every library view names a codename and every refusal a code, so both must exist before
> the first library view (B03), and `HasPermission` refuses an unknown codename at import time.
>
> *Effect today:* none for any tenant — library is unreleased, so no member holds a library codename
> and no library endpoint exists. `seed_reference_data` rewrites the system roles' `permissions`
> column on its next run; nothing reads that column at runtime (`system_role_permissions` is the
> source). *Reversal:* remove the three `── B02 ──` blocks and table L; no table changes.

### QA round 1 (3 Oct 2026, independent QA)

Commit under test `8824cdc4`; failing tests committed in `6e88f67f`
(`backend/apps/library/tests/test_qa_b02.py`). One finding, documentation only; the code is sound.

**QA-B02-1 — Part 22 table L misstates four library codes.** Severity: **low–medium** (no runtime
effect today; Part 22 is the closed registry a client switches on, and the tasks that implement these
codes — B05, B09, B11, F05 — would build to the wrong contract from it).
- `docs/22-api-specification.md:281` `library_renewal_refused` lists reasons `overdue` and "a due date
  that would move earlier"; LIB-06 §6 (`library.md:1512`) defines `details.reason` as
  `max_renewals | hold_waiting | overdue_blocked | member_blocked | no_gain`. `overdue` is not a token
  the server sends; `overdue_blocked` and `member_blocked` are missing.
  Test: `test_renewal_refused_row_names_only_the_frd_reasons`.
- `docs/22-api-specification.md:288` `library_hold_refused` names `already_borrowed`; LIB-08 §6
  (`library.md:2128`) names `already_on_loan`. Test: `test_hold_refused_row_names_only_the_frd_reasons`.
- `docs/22-api-specification.md:267` `library_code_ambiguous` is described (and its English message
  worded, "Pick one.") as a lookup that matches several records. LIB-02 BR-8 (`library.md:652-655`)
  says the lookup's first hit wins and the 409 is raised when a second record is **created** with a
  clashing code. Test: `test_code_ambiguous_is_raised_on_create_not_on_lookup`.
- `docs/22-api-specification.md:270` `library_title_has_copies` says "a title with copies on the
  shelf"; LIB-02 FR-12 (`library.md:433-434`) allows a hand archive only when **every** copy is
  withdrawn (on loan, in repair, lost and missing copies block it too).
  Test: `test_title_has_copies_covers_every_copy_not_withdrawn`.

Expected: each row's condition restates the FRD (reason tokens exactly the FRD's §6 lists; code
ambiguity raised at create; title archive blocked by any non-withdrawn copy), and the `ambiguous`
message reworded to a creation refusal.

**Checked and sound.**
- The sixteen codenames equal LIB-14 §9 and land in `PERMISSIONS`/`MODULE_OF`; staff holds exactly
  §10's seven, accountant exactly the four `.read`s, owner and admin all sixteen; the four FR-3
  delegables are off for staff and reach a member through `allow` (positive control is real: it
  asserts the full set under the flag, so the hidden/off tests cannot pass vacuously).
- `permissions_for` drops every `library.*` while library is hidden or switched off, including an
  explicit `allow`; `ENGINE_READ_PERMISSIONS["dues"]["library"]` now names a real codename.
- The format test's widened verb set (`withdraw`, `close`, `override`, `waive`, `run`) is a named
  list, so an invented verb still fails.
- Thirty Appendix A codes registered with the right status (all 409, `library_waiver_over_ceiling`
  403 per Appendix A and LIB-14 §6), none retryable; table L's code set, HTTP statuses, `details` keys
  and `errors.<code>` keys match Appendix A exactly (scripted comparison); the fifteen reused core
  codes all exist in the registry.
- Fifty-eight `LIBRARY_*` audit constants equal Appendix B, all three-part (pass the audit
  selector's `ACTION_RE`), longest 38 characters against `varchar(64)`; core deposit/payment/counter
  actions not duplicated.
- The sixteen vocabularies match every FRD §5 CHECK list they claim, in order, and fit their widths.
- Suites: `apps/library`, `apps/common/tests`, `apps/platform_app/tests`, `tests/contracts`,
  `apps/dues/tests` green. `tests/architecture/test_module_scoping.py` currently fails on
  `LibrarySettingsView`/`LibraryNumberingView` — that is B03's uncommitted in-flight work, not B02.

**Notes, not findings.** §22.1.3 rule 3 (`errors.<code>` in `en.json`/`hi.json` in the same change)
is not met, as the Built section records; the rule is unenforced and 25 of ~200 codes have keys, so
it is a pre-existing gap — but F01 must put these keys under `errors.` (the shell catalogue by
`catalogues.json`) or add an `errors.library_` prefix line, since the library catalogue's own prefix
is `library.`. `constants.py` covers the sixteen vocabularies of the design note; the title, loan,
loan-event, hold and verification CHECK lists are not there yet and belong to B05/B09/B11/B13.

---

## B03 — library settings, preset seed, off-guard, number kinds

### Design note (review step)

Status: built; ready for QA (see "Built" below).

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

### Built (3 Oct 2026)

Note unchanged by the code since it was written (B02's codenames and `LIBRARY_SETTINGS_UPDATED` are
on dev). Landed, all inside `apps/library` — **no shared hot file touched**:
- `models/__init__.py`, `models/settings.py` `LibrarySettings`: the §5 columns and defaults,
  `version`, `uq_library_settings_tenant`, and named CHECKs for the five vocabularies, pickup days
  1–30, multiplier 0–10, major percent 1–100, money ≥ 0 (nullable for `fallback_price` and
  `waiver_ceiling`), and `cardinality(overdue_reminder_days) ≤ 6`.
- `migrations/0002_settings.py` (on `library 0001`, `platform 0013`; the generated `initial = True`
  removed, since 0001 is the initial one).
- `tenant_data.py` registers `library.LibrarySettings` (`library_settings.csv`).
- `services/settings.py`: `settings_for` (race-safe get-or-create), `seed_library` (the enable
  hook), `settings_json`, `numbering_meta`, `closed_weekdays_for`, `clean_settings` (every field,
  per-key messages), `update_settings` (row lock, `StaleVersion(current)`, no write and no audit for
  an unchanged body, `diff_fields` audit), `raise_number` (only `library_accession` and
  `library_member`; then `raise_counter(via="settings")`). `EDITABLE_FIELDS` is the PUT body.
- `permissions.py` `HasAnyPermission(*codenames)` (G9 default, library-local) and
  `SETTINGS_READERS` (every library `.read` plus `settings.manage`). Refuses unsafe methods, so it
  can only gate reads.
- `views.py` `LibrarySettingsView` (GET any reader, PUT `settings.manage`, via `get_permissions`)
  and `LibraryNumberingView`; both carry `scope_exempt` for the module-scoping walk. `urls.py`:
  `library/settings` (`v1:library-settings`) and `library/settings/numbering`.
- `apps.py` `ready()`: the three number kinds exactly as contracts §1.7, the enable hook, the calendar
  reader. No off-guard (G7; payments already counts library deposits).

Tests: `apps/library/tests/test_settings.py`, 40 including parametrised cases — registrations;
no doubled deposit guard; seed twice leaves one row and keeps edits; one row per tenant in the DB;
switching on through `PATCH /tenants/current` seeds; a raising seed leaves library off with no row;
GET defaults before any seed; `closed_weekdays` is the library override else the tenant's; PUT
saves, bumps and audits only the diff; stale version 409 with `current_version`; unchanged PUT no
audit; 16 per-field 400s; a missing field named and null clearing optional money; staff and
accountant read but neither PUT nor raise (who-is-signed-in asserted first); all reads denied → 403;
unreleased → `module_disabled`; two tenants independent; raise lower/equal/higher; the member
prefix read from the core row; five 400 kinds/numbers (incl. `library_charge`, a would-be 500); the
core numbering screen lists the kinds only while library is effective.

Gates: `apps/library` + `tests/architecture` **208 passed, 4 skipped**; with `tests/migrations`
(round trip includes 0002), `tests/contracts`, all of `apps/platform_app` (support-session walk
included — it now walks the two library writes), `apps/common/tests` and the deposit tests:
**1464 passed, 12 skipped** (the 4 B02 QA tests that were failing in that run were the lead's
round-1 tests, green once 07b3eb67 landed). `makemigrations --check` clean; `black`, `isort`,
`flake8` clean on `apps/library`. No screen (F02 is the settings page).

Deviations from the note:
- `update_settings(ctx, data)` takes `version` inside `data` (it is a body field), not as an
  argument.
- An unchanged PUT returns 200 without bumping `version` or writing an audit row (an untouched Save
  is not an event); a test pins it.
- The DB CHECK on `overdue_reminder_days` holds the count only; element range and de-duplication are
  the service's (a 365-element `<@` literal in a CHECK buys nothing a second writer is likely to
  break).
- `apps/library/permissions.py` imports `_authenticated_membership` and `_method_has_no_handler` from
  `apps.common.permissions` so that "who is asking" is decided exactly as `HasPermission` decides it
  (token-stale included). If G9 moves `HasAnyPermission` into `common`, those stay private.

New contradictions: none. G7–G9 stand with their defaults.

---

### QA round 1 (3 Oct 2026, independent QA)

Reviewed 49ecdd0f/ce80cb80 against LIB-01 (§1 FR-1–FR-5, §5, §6, §9, §10, §12), contracts §1.1
R15 and §1.7, and the design note. Failing tests: `apps/library/tests/test_qa_b03.py` (commit
d3bd2941). Both fail on 49ecdd0f for the reason they name.

| Id | Severity | Where | Failing test | Expected |
|---|---|---|---|---|
| QA-B03-1 | medium | `services/settings.py:166` (`_decimal`) | `test_qa_b03_1_an_oversized_number_is_a_400_on_its_key_not_a_500` (4 cases) | LIB-01 §6: `400 validation_error` per field; §9 money ≤ 99,999,999.99, multiplier 0–10. `number.quantize(...)` runs outside the `try`, and quantising a value with more than 28 significant digits (`"1e30"`, `10**40`, a 30-digit string) raises `decimal.InvalidOperation`. The PUT then answers **500 `server_error`** instead of naming the key. Fix: catch `InvalidOperation` around the quantize, or bound the magnitude before it. |
| QA-B03-2 | low | `views.py:46` (`get_permissions`) | `test_qa_b03_2_head_is_answered_like_get_for_a_read_only_role` | LIB-01 §10: staff and accountant may view. Only `method == "GET"` gets the reader set. HEAD, which DRF serves with the GET handler, falls through to `HasPermission("library.settings.manage")`, so staff get GET 200 but HEAD 403. OPTIONS behaves the same way. Fix: branch on `SAFE_METHODS`. |

Checked and found sound:
- The three number kinds match §1.7 exactly.
- The enable hook runs inside `update_enabled_modules`' transaction, and a raising seed leaves library off.
- The seed is idempotent and keeps edits; the row is `UNIQUE (tenant)`.
- `settings_for` is race-safe (a savepoint inside the outer atomic).
- PUT locks the row; a stale version is 409 with `current_version`.
- An unchanged PUT writes nothing and no audit row; the audit is `diff_fields` only.
- The reminder days are de-duplicated, sorted, each 1–365, at most six.
- `raise_number` refuses `library_charge` (400, not 500). `raise_counter` validates the number, refuses a lower one with 409 `sequence_backwards`, treats an equal one as a no-op and writes one `counter.raised` with `via="settings"`.
- Staff and support PUT/POST are refused (the `imp` check is in `HasPermission`). An unreleased module is `module_disabled`.
- `meta.closed_weekdays` reads the library override, else the tenant's value. The member prefix comes from the core row.
- The migration's CHECKs match §5. 0002 round-trips (`tests/migrations` green).
- `tenant_data` is registered.
- The deposit off-guard is not doubled (payments owns it).
- `apps/library` + `tests/architecture` are green apart from the two QA tests.

Notes, not defects:
- A GET before the seed creates the defaults row, including under a support session. This is benign: it holds the same values the read would show.
- T-LIB-01-1's "one type" waits for B06 (recorded).
- Validation messages are plain strings, as in `parties`.

Not checked: concurrency under real parallel connections (code-reviewed only). No frontend exists yet (F02).

## B04 — ISBN and accession helpers

### Design note (review step)

Status: built; ready for QA (see "Built" below).

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

### Built (2 Oct 2026)

Note unchanged by the code since it was written. Landed: `apps/library/services/__init__.py`,
`services/isbn.py` (`normalise`, `is_valid_isbn10`, `is_valid_isbn13`, `to_isbn13`, `to_isbn10`) and
`services/codes.py` (`validate_number` raising `InvalidNumber` with `.message` = "Use letters,
numbers, - or /.", `number_key`, `natural_sort_key`, `numeric_value(raw, *, prefix="")`,
`classify` → frozen `Classified(number_key, isbn13)`, and the constants `NUMBER_MAX = 24`,
`SORT_KEY_MAX = 160`, `RUN_WIDTH = 12` for B05/B07's columns). Both modules import nothing from
Django or `apps` (`codes` imports `isbn` relatively); a test walks each module's AST to hold that.
No shared hot file touched, no migration.

Tests: `apps/library/tests/test_isbn.py` (10) and `test_codes.py` (21 with parametrised cases). The
ISBN vectors come from reference functions written by a different route (whole weighted sums against
a residue, not a computed check character); the `X` case is found by searching stems near the
book's, a 977 periodical EAN is built by the reference, and 500 fuzzed stems check 10 → 13 → 10 and
that one changed digit is always refused. The sort test uses the corrected G12 vector; a fuzz test
sorts 2,000 random legal numbers by the key and by a tokenising natural sort and requires identical
orders. Gates: `apps/library` + `tests/architecture` **162 passed, 5 skipped**; `black`, `isort`,
`flake8` clean on `apps/library`; `makemigrations --check` clean. No screen.

Deviations from the note:
- **G13's padding rule is refined.** `max(12, len)` does not fix the misorder it was meant to fix:
  `1000000000000` (13) still compares `1` against `9` with `999999999999` and sorts first. Instead a
  run is reduced to its significant digits; up to 12 it is padded to 12 exactly as BR-4 says (so every
  realistic number has the BR-4 key), and 13–24 significant digits become `:` + the value padded to
  24. `:` (0x3A) is after every digit and before every letter in C collation, so a long run sorts
  after every short one, long runs order among themselves, and runs equal in value (`0042`, `42`)
  get equal keys — EC-3 keeps them different *numbers* (`number_key`), only their sort ties. The
  worst legal key is 156 characters, inside G13's `varchar(160)`. B05 and B07 must still declare
  the column `varchar(160)` with `db_collation="C"` (G12).
- The note's regex `^…$` is applied with `fullmatch` after `strip()`, since `$` alone accepts a
  trailing newline and `isalnum()` accepts non-ASCII code points (both have tests).

New contradictions: none beyond G11–G13, which remain the FRD's to correct (T-LIB-02-1's vector,
T-LIB-02-2's order, `accession_sort varchar(48)` in LIB-02 §5 and `member_number_sort` in LIB-04 §5).

### QA round 1 (3 Oct 2026)

Result: **no code defect found; no failing test committed.** Reviewed `ad287ba5` (`services/isbn.py`,
`services/codes.py`, both test files) against LIB-02 §9, BR-2–BR-4, BR-8, EC-3, T-LIB-02-1/2 and
LIB-04 §5/§9 (`member_number`).

Checked and sound:
- ISBN-10 mod-11 and ISBN-13 EAN checks, `X` only last and in either case, 978/979 only, 10 → 13
  and 13 → 10 (none for 979), spaces/hyphens stripped, ASCII digits only (`[0-9]` with `fullmatch`;
  Devanagari and Arabic-Indic digits refused). The developer's G11 claim is right: the FRD's
  `817371146X` is not a valid ISBN-10 (the book's is `8173711461`).
- `validate_number`: trimmed, 1–24, the §9 regex via `fullmatch` (no trailing-newline hole),
  non-ASCII letters and digits refused; `number_key` upper-cases for FR-5.
- `natural_sort_key` and the G13 deviation: independently re-fuzzed 200 × 500 numbers weighted
  towards long runs (12, 13, 14, 20, 24 digits) with leading zeros against a tokenising natural sort
  — identical order every time, and every key ≤ 160 (worst legal is 156, as stated). The `:` mark
  (0x3A) is consistent with how separators and letters compare against padded digits, so short and
  long runs order the same way relative to `-`, `/` and letters. The tie between `0042` and `42`
  follows from BR-4's own padding and does not touch EC-3 (identity is `number_key`, which keeps them
  distinct). The corrected G12 vector holds.
- `numeric_value`: all-digit only after an optional case-insensitive series prefix; `4512-A`, `M-`,
  `+42`, non-ASCII digits → `None` (BR-2, BR-3, EC-3).
- `classify`: a ten-digit register number yields both keys, a spaced ISBN only the ISBN, a suffixed
  number only the number key; scanner CR/LF is stripped by both paths (BR-8 ordering is B05/B07's).
- Purity: no Django or `apps` import in either module; `black`, `flake8` clean; the 31 B04 tests pass
  on `test_ub_qa2`.

Notes for later tasks (not B04 defects, no test):
- **For B05/B07 (BR-2):** `numeric_value` returns any 24-digit value, but `raise_counter` refuses
  anything above `MAX_NEXT_NUMBER` (2^31 − 1) with a `next_number` validation error. A legal typed
  accession such as `9999999999` would therefore surface an error on a field the merchant never saw.
  B05 must decide what a typed all-digit number beyond the counter's range does (store it and leave
  the counter alone is the reading closest to BR-3) and test it.
- **Test strength (low):** `test_codes.py::test_the_module_is_pure` checks only `level == 0` imports,
  so a relative `from ..models import …` would pass it. It cannot fail today because the module is
  pure; tightening it (refuse any relative import other than `from . import isbn`) is a cheap hardening.

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

### Built (3 Oct 2026)

Landed in `apps/library` only (no shared hot file): `models/catalogue.py` (five tables, every §5
CHECK and index, `accession_sort` varchar(160) C collation, `search_text` GeneratedField),
`migrations/0003_catalogue.py`, five `tenant_data` rows, `services/copy_status.py` (`move_copy`,
the only status writer: event + copy `version` bump + title caches by `F()`, title `version`
untouched; `record_new_copies`; set-based `recount_titles`), `services/catalogue.py` (create title
with copies, add copies, patch title/copy, withdraw/repair/back-to-shelf, archive/restore,
categories with merge, locations), `selectors/catalogue.py`, `serializers.py`, `views/` (now a
package: `__init__` = B03 settings, `catalogue.py` = 17 routes in `urls.py`),
`management/commands/library_recount.py`, `constants.py` (`TitleStatus`, widths).

Decisions: **B04 QA note 1** — a typed all-digit number whose value + 1 exceeds `MAX_NEXT_NUMBER`
is accepted as typed and does not raise the counter (the counter can never reach it, so BR-2's
collision cannot happen); tested at 99999999999 and at MAX−1 (raises to MAX). **G14** settled:
`sqlmigrate` shows `||` over COALESCE; the migration applies. **G15** default taken (reference copy
or reference title is not "available to borrow"; a title's material-type change or a copy's
`is_reference` change recounts that title). **G16**: barcode vs accession clash is 409
`library_code_ambiguous` on create/patch; members join in B07.

Tests: `test_catalogue.py` 24 (reuse in any case incl. withdrawn; consecutive auto numbers and
announced; typed 9000 raises, 4512-A does not; beyond-range number; taken on copy 3 rolls back
title, copies and counter with `{number, copy_id, title}`; 5 bad copies blocks 400 before any
write; ISBN normalise/check/duplicate warning; idempotent create; frozen number and stale version;
barcode clash; withdraw rules, staff 403, last withdrawal archives, manual archive 409 with count;
repair/back-to-shelf caches; reference availability; 200-step fuzz equals recount; search by words,
ISBN, number, Devanagari and a 2-letter prefix; numeric copy order; unbuilt filters 400; lookup
BR-8; categories one level/merge/in-use; location in use; cross-tenant 404 and accountant read-only)
and `test_catalogue_plans.py` 2 (slow: trigram index for search, unique index for number lookup, at
50,000 rows). Gates: `apps/library` + `tests/architecture` + `tests/migrations` **303 passed, 4
skipped** (plans included); `makemigrations --check` clean; black/isort/flake8 clean. No screen
(F03).

Deviations: ordering is an explicit map (`title`, `-created_at`; copies `accession`, `title`), each
ending in `id`, instead of `StableOrderingFilter` — same total order, and it is what lets
`accession` mean `accession_sort` and an unknown value be 400. Lists use `PagePagination` (`meta:
page, page_size, total, total_pages`) rather than the FRD's `{count, page}`. A short (< 3 char)
search uses `istartswith` on the title without a `text_pattern_ops` index. `library_copy_on_loan`
carries `details: {}` until B09 can fill `loan_id` (PTY-03: no faked key). Omitted keys:
`holds_waiting`, `holds`, `issues_12m`, `due_on`, `borrower`, `loans`. Withdraw from the hold shelf
answers `library_copy_unavailable {status}`. No DB guard for barcode-vs-accession across columns
(service check only).

### QA round 1 (3 Oct 2026, independent QA)

Reviewed 1072746b/ed0df93d against LIB-02 (BR-1–BR-8, EC-1–EC-8, T-LIB-02-3…7) and the design
note. Failing tests: `apps/library/tests/test_qa_b05.py` (commit f7eb4b5f). Both fail on 1072746b
for the reason they name.

| Id | Severity | Where | Failing test | Expected |
|---|---|---|---|---|
| QA-B05-1 | medium | `services/catalogue.py` `_insert_copies` (the counter branch) | `test_qa_b05_1_an_automatic_number_never_equals_another_copys_barcode` | BR-8: the lookup tries the accession number before the barcode, and a clash "is refused when the second is created" (409 `library_code_ambiguous`). Only TYPED numbers go through `_taken`'s barcode check. A number taken from the counter is inserted unchecked. So a copy barcoded `2` (allowed while no copy is numbered 2) is shadowed when the counter reaches 2: `GET /library/lookup?code=2` returns the new copy. Fix: refuse, or skip barcoded values when allocating. A barcode patch could also refuse a value the counter will reach. |
| QA-B05-2 | low | `services/catalogue.py` `_raise_for_typed` (`highest + 1 > MAX_NEXT_NUMBER`) | `test_qa_b05_2_a_typed_number_at_the_counters_ceiling_cannot_be_reallocated` | The skip claims the counter "can never reach" the typed number. That is false exactly AT `MAX_NEXT_NUMBER`: `raise_counter` accepts MAX and `allocate_counter` hands it out. After typing 2147483647, `POST /library/settings/numbering {next_number: 2147483647}` is 200. LIB-01 BR-2 requires 409 `sequence_backwards` (≤ a number already imported). LIB-02 BR-2 exists so automatic and typed numbers never collide. Fix: treat `highest >= MAX` as unreachable only above MAX, or cap the raise. |

Observed, not filed as B05 findings:
- **Core, A8.** With the counter at MAX (typing MAX−1 gets it there, as the dev's own edge test does), the next automatic create runs `allocate_counter`'s `next_number = MAX + 1`. That overflows the `integer` column, a `DataError` and a 500. It belongs to the core allocator; raised here for the lead.
- **Race, code review only, untested.** `recount_titles` (called on an `is_reference` or `material_type` change) computes its CTE from a snapshot and locks no copies. A concurrent `move_copy` on another copy of the same title can commit its `F()` shift in between, and the recount then overwrites it with the stale derived count. `library_recount` would repair it. Locking the title's copies (or the title row) before the recount closes it.
- No DB guard for barcode against accession across columns (recorded deviation).

Checked and found sound:
- `move_copy` is the only writer of `status`. It writes the event, bumps the copy's version and moves the caches by the difference with `F()`; the title's version is untouched. `recount_titles` is an independent set-based route.
- The caches' CHECK; `ck_library_copy_withdrawn`.
- The unique `Upper(accession_number)` with no soft-delete exclusion (withdrawn numbers stay taken). The partial unique `Upper(barcode)`.
- A typed number taken on copy 3 rolls back the title, copies 1–2 and the counter, with details. Auto numbers are taken last.
- `4512-A` and leading zeros (EC-3) behave as specified.
- A number is frozen after first issue; a stale version is 409.
- Withdraw is refused on loan and on the hold shelf; the last withdrawal archives the title. A manual archive with copies is 409.
- The withdraw permission is separate (staff 403); every method reads its codename (HEAD/OPTIONS map to GET, unlike B03).
- Body ids from another tenant are field errors; path ids are 404.
- Soft-deleted categories and locations are excluded by their managers. Merge is guarded.
- `apps/library` is green apart from the QA tests.

Not checked: the EXPLAIN plan tests were not re-run separately (they are in the developer's 303), and there is no frontend (F03).

### QA round 1 fixes (3 Oct 2026)

- **QA-B05-1:** `_counter_numbers` passes over a counter number equal to an existing barcode and
  takes the next (the value is already spent as a label; the sequence row stays the last lock).
  Chosen over a 409 because a refusal would block every later create until someone renamed the
  barcode, since a rolled-back create returns the same number.
- **QA-B05-2:** at the ceiling, `_raise_for_typed` parks the counter AT `MAX_NEXT_NUMBER` instead
  of skipping; only a number above MAX is skipped. `raise_number` for `library_accession` also
  refuses (409 `sequence_backwards`, `current` = highest + 1) a request at or below the highest
  all-digit number in the register (LIB-01 BR-2), which the counter alone cannot say at its ceiling.
- **Lead item (b), core A8:** `allocate_counter` refuses at `MAX_NEXT_NUMBER` with the new 409
  `sequence_exhausted {kind, max}` (`error_codes.py` `── B05 ──` block, count 200 → 201, Part 22 row
  after `sequence_backwards`). The last value is never handed out, which is what makes parking the
  counter there a guard.
- **Lead item (a):** the `is_reference` recount locks the title FOR UPDATE after the copy;
  `move_copy` now also locks the title after the copy and reads `material_type` from the locked
  row, so a material-type recount (title locked by `update_title`) and a concurrent loan serialise
  and the delta is computed against what the recount committed. Test: the PATCH's queries lock the
  copy before the title.
- Gates: `apps/library` + `test_number_kinds` + `test_exceptions` + `tests/architecture` (not slow)
  288 passed, 4 skipped.

---

## B06 — membership types and loan rules

### Design note (review step)

Status: **built; QA round 1 clean** (see below).

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

### Built (4 Oct 2026)

`models/members.py` + `0004_membership_types` (types with every §5 CHECK and a unique
`(tenant, lower(name))`; rules with `UNIQUE NULLS NOT DISTINCT (tenant, membership_type,
material_type)`; and, per G17, the schema of `library_membership` and `library_membership_period`
— `period.fee_charge` waits for B10's `library_charge`), four `tenant_data` rows,
`services/rules.py` (pure `resolve_rule`, column by column, reference copies as `reference`,
`allows_reference_loan`), `services/membership_types.py` (create, patch with `version`, no delete),
`services/loan_rules.py` (`replace_rules` validates every row first and serialises on the settings
row; `effective_matrix` for `meta.effective`), the seed (a "Standard" type and the
`(null, reference, loanable=false)` rule only when the business has no type), `views/members.py`
(`GET/POST /library/membership-types`, `PATCH /{id}`, `GET/PUT /library/loan-rules`), and
`services/fields.py`: the catalogue's field cleaners, extracted for their second caller (+ `integer`).
Tests: `test_members_config.py` (16: T-LIB-05-1 as eight cases incl. the mixed one, reference
resolution, duplicate every-type rows, a bad row changes nothing, the matrix, bounds and a
case-insensitive name, version and no delete, staff 403 / accountant 200, the seed).
Gates: backend non-slow 3523 passed; black/isort/flake8; `makemigrations --check` clean.

### QA round 1 (4 Oct 2026)

Re-read against LIB-04 §5–§6, LIB-05 §5–§9 and the design note. No defect found: a deactivated
type still resolves (the resolver never reads `is_active`); a rule change touches no open loan
(there are none until B09, and loans will snapshot); deleting the reference rule makes reference
copies loanable, which the settings tab must say (F02).

---

## B08 — due dates over the core calendar

### Design note (review step)

Status: **built; QA round 1 clean** (see below).

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

### Built (4 Oct 2026)

`services/due_dates.py`: `compute_due` (pure; `(due_on, moved_from)`; 409
`library_calendar_all_closed` past the horizon), `due_on_for_issue`, `renewal_due_on` (from the
renewal day or the old due date; an earlier OR equal result is 409 `library_renewal_refused
{reason: no_gain}`). One `closed_days_between` read per computation. The three loan endpoints wait
for B09 (G18). Tests `test_due_dates.py` (9): the five worked examples against real closures and the
library weekday key, `no_gain`, a business-wide closure, weekday precedence both ways, one query,
all-closed is 409. QA round 1: no defect on a second read; the library tests pass (with B06).

---

## B10 — charges and waivers, posting sources, target, fine calculator

### Design note (review step)

Status: **built (B10a); QA round 1 clean.** Lost, found, replace, damage and the fine preview are B10b, after B09 (G19).

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

### Built (4 Oct 2026)

`models/charges.py` + `0005_charges` (charge and waiver with every §5 CHECK, `objects.open()` =
owing AND not reversed (G20), the partial FIFO index on the same predicate, `document_date`
property; `library_membership_period.fee_charge` FK added here), `services/fines.py` (pure
`calculate_fine` → `FineCalc` with `as_json`), `services/charges.py` (`derive_status` BR-4 and one
`_save`; `create_charge` — party locked by the caller, number last, `post_source_entry` with no
credit check (D7), zero refused (EC-2); `create_manual_charge` (409 on a closed membership); `waive`
— cumulative ceiling per charge (G22) as a ROLE check through `may_override`; `reverse` — refused
with the live payment ids, reverses the charge and every standing waiver; `LibraryChargeTarget`
(main, auto, `(charge_date, number, id)`, `label` = description[:120], `unapply` refuses below
`refunded_amount` (G21)); resolvers; `OpenChargesCounter`), `ready()` registrations, and
`views/charges.py` (`GET/POST /library/charges` with `meta.totals`, `GET /{id}` with waivers and
allocations, `/waive`, `/reverse`). The contract suite has a `library_charge` factory
(`tests/factories.py` writes a membership row directly until B07). Three registry-order assertions in
payments and purchases now list `library_charge` between sales and dues (app order).

Tests `test_charges.py` (35): the twelve worked examples (13 rows incl. paise and count-all
variants) and example 10, the cap-room property (200 random loans), status over eight combinations,
posting kind/bucket and the loan-bucket refusal, D7, the ledger trigger, the ceiling (staff with the
codename at ₹101, cumulative ₹60 + ₹60, admin ₹250), waiver bounds and reason, reverse refused with
payment ids then netting the khata to zero after the void, auto FIFO across charges, the off-guard,
a closed membership, and a 40-step fuzz (Σ live allocations, Σ standing waivers, `recalc_balances`).
Gates: backend non-slow 3574 passed; black/isort/flake8 on `apps/library`; migrations clean.

### QA round 1 (4 Oct 2026)

No defect on a second read. Noted for F06: the khata's `sourceDisplay.ts` names only the core kinds,
so a library charge's row shows its number without a badge until F06 adds `library_charge` and
`library_waiver` labels (null, not a raw id — checked).

---

## B07 — memberships, periods, deposits, party role, archive guard

### Design note (review step, 4 Oct 2026)

Inputs: LIB-04 FR-1…FR-12, §5–§13 (BR-1…BR-10, T-LIB-04-1…7, EC-1…EC-8); contracts §1.3
(relations), §1.4 (held deposits), §1.6 (party roles, archive guards); ADR-044, ADR-046; D17, D25,
D28, D31; B06's schema (G17) and B10's `create_charge`.

Adds `services/members.py` (one writer of `library_membership` and its periods), selectors, views:
- `effective_status(m, today)` (BR-1) and `valid_until_for(start, months)` (BR-2, month-end clamped).
- Member number: typed (shape and case-insensitive uniqueness, 409 `library_member_number_taken`,
  and 409 `library_code_ambiguous` against a copy's accession or barcode, BR-8) or the
  `library_member` counter, taken last.
- Enrol: party by id or created through `parties.services.crud.create_party`; 409
  `library_membership_exists {membership_id, status}` (BR-7, EC-5); guardian by
  `create_relation(kind=guardian)`; fees as `create_charge` (admission, membership); the deposit by
  `open_deposit`; collect-now as two payments — fees through `record_payment` allocated to the new
  charges, the deposit through `receive_deposit` — so one payment never mixes buckets (FR-4).
- Renew (BR-3, D17), change type (period row, FR-6), suspend / reactivate, close (BR-6: apply the
  deposit to open library charges oldest first, then refund — the refund is a ROLE check, D28),
  re-join (same row, C10), deposit receive / apply / refund.
- `member_blocks(m, today)` (BR-10) for the blocks this task can see: expired, suspended, closed,
  dues over limit, deposit not received. Loan blocks (`copy_limit_reached`, `has_overdue`) and the
  close guard on open loans and holds are B09's/B11's hooks: until `library_loan` exists there is
  nothing to count, and the summary omits `loans_*` and `holds_ready` rather than sending 0 (PTY-03).
- Party role `library_member`, the archive guard (an active or suspended membership blocks),
  and the lookup's member arm (BR-8 order: accession, barcode, member number, ISBN).

Gaps / defaults:
- **G24** Close's "refused while any loan is open" and "holds cancelled" cannot run before B09/B11;
  B09 adds the loan check to `close` and B11 the hold cancellation (tests land with them).
- **G25** FR-2 "member number is the next `library_member` number or typed (a school admission
  number)": a typed all-digit number raises the counter like accession numbers (ADR-051, BR-2 of
  LIB-02), reusing `codes.numeric_value` with the series prefix.

### Built (4 Oct 2026)

`services/members.py` (effective status, validity, blocks; enrol with party create or pick,
guardian relation, admission and membership fees as charges, the held deposit, collect-now as two
payments; patch with `version`; renew; change type; suspend / reactivate; close with apply then
refund (refund a ROLE check); re-join on the same row; deposit receive (incl. `opening`) / apply /
refund; `member_party_ids` and `archive_guard`), `services/numbering.py` (the typed-number counter
rule, extracted from B05 for its second counter), `selectors/members.py` (list by EFFECTIVE status
in SQL, expiring within N days, type, group, has dues, search by name, mobile or exact number;
`meta.totals`), `views/memberships.py` + routes (`/library/members`, `/{id}`, and nine acts), the
lookup's member arm, the catalogue refusing a copy number or barcode a member wears (and the
accession counter passing over one), `ready()` registrations (role `library_member`, archive
guard), and the two words the parties screens render (`library.role.member`,
`library.archive.member`; the categories page now spells its ids out so the locale checker does
not tie it to every catalogue a `library.*` key lives in).

Tests `test_members.py` (21): effective status ×8 (T-LIB-04-1), validity clamping, enrol with both
blocks (T-LIB-04-2), the deposit block, one membership per party and re-join (BR-7, C10), a typed
number raising the counter and refused as a copy's, a copy refused as a member's, renewal early and
late (T-LIB-04-3), close with apply and refund (T-LIB-04-4), refund as a role (T-LIB-04-5), the
archive guard and role filter (T-LIB-04-7), the scan, the list by effective status. Gates: backend
non-slow 3607 passed; black/isort/flake8; migrations clean; frontend library + `src/tests` 648
passed, lint clean, locales in step.

### QA round 1 (4 Oct 2026)

| Id | Severity | Where | Fixed |
|---|---|---|---|
| QA-B07-1 | medium | `numbering.counter_prefix` read the prefix from the sequence row, which does not exist until the first automatic number; so a typed `M-0042` before any automatic member number was read against prefix "", never raised the counter, and the counter would later hand out M-0042 again (caught by `test_a_typed_member_number_raises_the_counter…` before commit) | falls back to the kind's registered `default_prefix` |

Still open by design: G24 (close's loan and hold checks come with B09 and B11).

## B09 — loans: issue, return, renew, cancel, change due

### Design note (review step, 4 Oct 2026)

Inputs: LIB-06 §1–§13 (BR-1…BR-8, T-LIB-06-1…8, EC-1…EC-9), LIB-05 FR-6/§6 (G18's three endpoints),
LIB-07 FR-1 (the fine at return and at an overdue renewal), LIB-04 BR-6/BR-10 (close guard, loan
blocks). Scope: `library_loan` and `library_loan_event` with the rule snapshot as typed columns and
`uq_library_loan_open_copy`; `library_charge.loan`; services for issue (blocks and override, the
override codename read from the body), return (fine charged at once, backdating needs
`library.loan.adjust`, EC-1 last seen, EC-6), renew (snapshot limit, `renew_overdue`), renew all,
cancel (same day, D20), change due, due-on / shift-due / due-date preview; the member summary with
its loans. Holds (the hold shelf, a waiting hold refusing a renewal, routing a return to the hold
shelf) are B11's; damage, lost and found are B10b's; the issue slip text is B12's (templates).

### Built (4 Oct 2026)

`models/loans.py` + `0006_loans`; `services/loans.py`; `views/loans.py` and routes (`/library/loans`,
`/{id}`, `/{id}/renew|cancel|change-due`, `/library/returns`, `/library/loans/due-on`,
`/shift-due`, `/library/due-date-preview`, `/library/members/{id}/summary|renew-all`); B07's
`member_blocks` now adds the two loan blocks from one `figures()` read (three queries for the whole
panel), the summary carries `loans_open` / `loans_overdue`, and `close` refuses while a book is out
(G24's loan half). A renewal ignores the copy limit and the issue rule's overdue block: it adds no
book, and an overdue loan is `renew_overdue`'s to decide.

Tests `test_loans.py` (17): issue with snapshot, the copy limit refused then overridden (staff 403,
the `overridden` event names the block), expired member, a copy out with someone else (`with`),
reference not loanable, the second open loan refused by the database, an idempotent replay, the
query budget, a late return's fine charged at once, not-on-loan and `offer_found`, backdating needs
adjust, the renewal limit, an overdue renewal charging the fine first, cancel same day only, close
refused with a book out, a holiday moving due dates, the fine so far computed and not stored.
Gates: backend non-slow 3632 passed; black/isort/flake8; migrations clean.

### QA round 1 (4 Oct 2026)

| Id | Severity | Where | State |
|---|---|---|---|
| QA-B09-1 | medium | T-LIB-06-8 asks ≤ 12 queries per issue and return; measured 38 / 41, cut to 36 / 38 (40 / 37 after B10b's lost-book count) by reading the member's figures once (`members.figures`) instead of ten separate counts | **open for the lead**: about twenty are fixed costs every write here pays (session, idempotency row, audit row, eight savepoint pairs from nested `atomic`); reaching 12 means changing those core paths, not the library. The budget test holds the measured figures. |

---

## B10b — lost, found, replaced, damaged; the fine preview

### Built (4 Oct 2026)

`services/losses.py`: `mark_lost` (the fine to the declared day as its own charge, then `lost_book`
= round(base × `lost_multiplier`, paise) + `lost_processing_fee`; base = price, else the fallback,
else the typed price, which is saved to the copy, EC-1); `mark_found` (a `found` waiver of what is
unpaid; when `lost_found_paid = refund`, a payment OUT with `allocations: none`, context
`library_refund`, plus a `found_refund` waiver of what was paid; the loan becomes `returned`; the
copy goes back on the shelf; a refund needs `payments.payment.write`); `replace` (only an unpaid lost
book, BR-10/EC-7: a new copy through the catalogue's `add_copies` with "Replacement for …", the
charge waived `replaced`, the lost copy withdrawn as `lost`; needs `library.catalogue.write` too);
damage at return (minor → shelf, major → repair at `damage_major_percent` of the price, unusable →
a `lost_book` charge and the copy withdrawn as `damaged`; lowering the proposed amount is allowed,
raising it needs `library.charge.write`). BR-7: a lost book with its charge still owed counts toward
`max_copies` while `lost_counts_toward_limit`. Endpoints `/loans/{id}/lost`, `/loans/{id}/replace`,
`/loans/{id}/fine-preview`, `/copies/{id}/found`; `/returns` takes `damage`. The `desk` fixture
moved to the library conftest, its helpers to `tests/counter.py`.

Tests `test_losses.py` (11): example 7, the limit with a lost book, found unpaid, found after payment
with the refund and the khata back to zero (T-LIB-07-7), replacement, a paid book not replaceable,
damage ×3 routes, lowering versus raising a damage charge, the preview charging nothing. Gates:
backend non-slow 3646 passed; flake8/black/isort; migrations clean.

### QA round 1 (4 Oct 2026)

| Id | Severity | Where | Fixed |
|---|---|---|---|
| QA-B10b-1 | high | `create_charge` and the waiver posting handed `post_source_entry` the party instance loaded at the start of the transaction; `apply_entry` writes the balance from the instance, so a waiver posted after a payment in the same transaction (a found book's refund) wrote back the balance from before the payment — the member was left ₹250 in credit for money they had been handed back. Caught by T-LIB-07-7 before commit. | every library posting now re-reads the locked party (`_fresh_party`, re-entrant) |

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
