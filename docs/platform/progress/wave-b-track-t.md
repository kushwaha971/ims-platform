# Wave B · Track T (attendance engine, then library frontend) — progress

Owner: Track T developer (backend engine, then frontend). Branch `wave-b/track-t`, worktree
`/home/claude/wt/track-t` (made with `scripts/worktree-bootstrap.sh track-t`), test database
`UB_TEST_DB_NAME=test_ub_track_t`.

Sequence (plan §3, §3.1, §3.3): **ATT-01…05** (one XL task, FRD 00 #15) → **F01 → F02 → F03 → F04 →
F05 → F06 → F07 → F08 → F09 → F10 → F11 → F12 → F13**. F01 needs only B01 (Track L); F02 onward wait
for their B-tasks as plan §3.1 lists.

Core heads this wave's `0001` migrations depend on (verified on disk, `dev`, 1 Oct 2026):
`ledger 0007_reminder_source`, `parties 0010_party_relation`, `payments 0004_held_deposit`,
`sales 0005_document_origin`, `platform 0013_closed_day` (app label `platform`, package
`apps/platform_app`, `apps/platform_app/apps.py:18`).

QA note: this step is **review only**. Nothing below has been built or run; the environment had no
packages installed, so no test, lint or type-check was executed. Every code reference was read on
disk; anything I could not verify by reading is marked **(unverified)**.

---

## ATT-01…05 — the check-ins and attendance engine (`apps/attendance`)

Status: **design written; not started**

### Design note (review step)

**Inputs read.** FRD 00 Part C (ATT-01…05, `frd/00-core-and-engines.md:3001-3455`) and §0.3
conventions; contracts v1 §2.3, §3 (`ENGINE_READ_PERMISSIONS`), §4 (three codes), §5 (audit actions,
`on_marked`); 10-architecture §2.2, §3 (L1–L5), §6, §8, §9 (engine off-guards), §10, §10.1 (matrix
row `attendance: {common, platform_app, parties}`), §11 (test-only subject, replay), §17 R18, R25,
R56, R57, R59; ADR-041, ADR-042, ADR-050, ADR-055, ADR-058; gym FRD (the only consumer, Wave C:
"Front desk" group `gym.md:369`, roll-call `gym.md:2389-2397`, desk rules `gym.md:2240-2256`, C10,
C12, C15); 13-owner-questions (nothing attendance-specific; Q1/Q2 defaults already filed).

#### 1. Shape of the app

```
backend/apps/attendance/
  __init__.py
  apps.py            AttendanceConfig(name="apps.attendance", label="attendance"); ready():
                     import tasks, tenant_data; register_schedules(); register_off_guards()
  constants.py       MarkKind, MarkStatus, Method, SessionStatus, Decision (TextChoices);
                     CONSUMING = {"present","late","visit"}; GENERATE_AHEAD_DAYS = 56;
                     MAX_UNTIL_DAYS = 182; FUTURE_SKEW = 5 min; REASON_MIN = 3; REASON_MAX = 160
  models.py          Group, GroupMember, Session, Mark, Entitlement, EntitlementUse
  migrations/0001_initial.py
  registry.py        PolicyResult, register_checkin_policy, register_mark_listener,
                     policy_for, listeners_for, _reset_for_tests
  services/groups.py      create_group, set_members, end_membership*, generate_sessions,
                          cancel_session*, update_group* (* = not in contracts v1, see §6)
  services/marks.py       check_in, check_out, roll_call, edit_mark, void_mark, close_open_visits
  services/entitlements.py grant_entitlement, extend_entitlement, end_entitlement,
                          entitlement_for*, _consume, _give_back
  services/guards.py      OpenVisitsOfEarlierDays (frozen dataclass counter), register_off_guards
  services/access.py      actor_holds(ctx, codename) — one Membership read, permissions_for
  selectors.py       expected_members, marks_for, open_visits, register_grid, attendance_percent,
                     not_visited_since, visits_by_hour
  serializers.py, views.py, urls.py     eight GET endpoints, nothing else (ADR-041 §8)
  tasks.py           four job handlers (two fan-outs, two per-tenant)
  tenant_data.py     six TenantTable rows
  management/commands/recalc_entitlements.py   --check | --apply
  tests/             (see §4)
```

Import surface (L1, whole-AST walk, `tests/architecture/test_import_rules.py:136`, row already
declared by A11, so **no edit to that file**): `apps.common.*`, `apps.platform_app.services.{calendar,
entitlements,guards}`, `apps.platform_app.models` (Membership, for `actor_holds`), `apps.parties.models`
and `apps.parties.services.balance.lock_party`. Nothing from `ledger`, `payments`, `reports`,
`notifications`, `dues`, `bookings` or any vertical — including deferred imports and migrations.

Shared hot files, append-only blocks headed `# ── ATT ──` (plan §1.3): `apps/common/error_codes.py`
(3 codes), `apps/common/audit.py` (`AuditAction`), `config/settings/base.py` (`"apps.attendance"`),
`config/urls.py` (`path("attendance/", include("apps.attendance.urls"))`), Part 22 §22.1.1 rows.
`apps/common/permissions_registry.py` is **not** touched: the engine owns no codename
(`ENGINE_READ_PERMISSIONS["attendance"]` is already at `permissions_registry.py:79`).

#### 2. Schema (`attendance/0001_initial.py`)

Dependencies: `("parties", "0010_party_relation")`, `("platform", "0013_closed_day")` — the two apps
the tables reference (Party; Tenant and User). Plan §1.4 rule 2 lists five heads; depending on
`ledger`, `payments` and `sales` would be a migration edge to apps the engine may not import.
**Default: the two**; the lead may prefer all five for uniformity (question 1).

All six models extend `TenantModel` (`apps/common/models.py:21`: UUIDv7 id, `tenant` RESTRICT,
`created_by` SET NULL, timestamps).

- **`attendance_group`**: `module varchar(32)`, `name varchar(80)`, `subject_type varchar(48)`,
  `subject_id uuid NULL`, `mark_kind varchar(8)` CHECK in (`visit`,`presence`), recurrence columns,
  `session_start time NULL`, `session_minutes smallint NULL` CHECK 1–1440, `default_mark varchar(8)`
  CHECK in (`present`,`absent`) default `present`, `one_per_day bool` default false,
  `dedupe_minutes smallint` default 5 CHECK 0–720 (gym allows 0–720, `gym.md:409`),
  `edit_window_hours smallint` default 24 CHECK 0–720, `is_active bool` default true.
  CHECK `(freq IS NULL) = (session_start IS NULL)` and `(session_start IS NULL) = (session_minutes IS
  NULL)`. Index `(tenant_id, module, is_active)`; unique `(tenant_id, module, subject_type,
  subject_id)` **WHERE subject_id IS NOT NULL** (gym looks its seeded groups up by that tuple,
  `gym.md:369`; not in the FRD — additive, own table).
  *Recurrence:* the FRD names `OptionalRecurrenceFields`, which **does not exist**: the only mixin is
  `RecurrenceFields` (`apps/common/db/recurrence.py:46`) with `freq` and `anchor` NOT NULL. Options:
  (a) add `OptionalRecurrenceFields` to `common/db/recurrence.py` (A9a's file, Wave A, closed);
  (b) subclass `RecurrenceFields` in `attendance/models.py` and override `freq`/`anchor` with
  `null=True` (Django allows overriding abstract-base fields), keeping
  `[*RecurrenceFields.Meta.constraints, …]` so `test_every_concrete_model_with_the_mixin_carries_
  every_check` (`apps/common/tests/test_recurrence_fields.py:105`) still applies, plus an all-or-none
  CHECK `(freq IS NULL) = (anchor IS NULL)`. Postgres passes a CHECK that evaluates to NULL, so the
  mixin's `freq IN (...)` and `until >= anchor` CHECKs accept the null rule unchanged.
  **Default (b)**, local to the engine; `Group.recurrence` returns `None` when `freq` is null.
- **`attendance_group_member`**: `group` FK RESTRICT, `party` FK RESTRICT, `from_on`, `to_on NULL`;
  CHECK `to_on IS NULL OR to_on >= from_on`; unique `(group_id, party_id, from_on)`; index
  `(tenant_id, party_id)`. Overlap refused in the service under a lock on the group row.
- **`attendance_session`**: `group` FK RESTRICT, `starts_at`, `ends_at`, `status varchar(10)` CHECK,
  `booking_unit_id uuid NULL` (no FK: bookings is a sibling engine, L1), `cancel_reason
  varchar(160)` default `''`; unique `(group_id, starts_at)`; CHECK `ends_at > starts_at`; CHECK
  `status <> 'cancelled' OR cancel_reason <> ''`; index `(tenant_id, group_id, starts_at)`.
- **`attendance_mark`**: as FRD ATT-02 §5, `module varchar(32) NOT NULL` (R18), `auto_closed` (R18),
  `marked_by` FK user SET NULL. Constraints: partial unique `uq_attendance_session_party (session_id,
  party_id) WHERE session_id IS NOT NULL AND voided_at IS NULL`; CHECK `check_out_at IS NULL OR
  check_out_at >= check_in_at`; CHECK `(voided_at IS NULL) = (void_reason IS NULL)`; CHECK `status <>
  'visit' OR check_in_at IS NOT NULL`; CHECK `session_id IS NULL OR group_id IS NOT NULL` (a session
  mark always names its group — makes the group/module consistency checks one join, additive);
  CHECK `override_reason IS NULL OR length(override_reason) >= 3`. Indexes: partial
  `ix_attendance_open_visits (tenant_id, module, on_date) WHERE status='visit' AND check_out_at IS
  NULL AND voided_at IS NULL`; `ix_attendance_party_date (tenant_id, party_id, on_date)`;
  `ix_attendance_module_date (tenant_id, module, on_date)`; and `(tenant_id, session_id)` for the
  register (FK index Django adds anyway).
- **`attendance_entitlement`**: `party` FK RESTRICT, `module varchar(32) NOT NULL` (R18),
  `subject_type`, `subject_id`, `total int` CHECK `> 0`, `used int` default 0 CHECK `used >= 0 AND
  used <= total`, `valid_from`, `valid_to` CHECK `>= valid_from`; indexes `(tenant_id, party_id,
  valid_to)`, `(tenant_id, subject_type, subject_id)`.
- **`attendance_entitlement_use`**: `entitlement` FK RESTRICT, `mark` FK RESTRICT, `delta smallint`
  CHECK in (1,−1), index `(tenant_id, entitlement_id)`. **The FRD's unique `(mark_id, delta)` is
  wrong** (contradiction C3 below): BR-4 lets a mark go present → absent → present, which needs a
  second `+1` row for the same mark. **Default:** `seq smallint` (0, 1, 2 … per mark) with unique
  `(mark_id, seq)`; the service keeps Σ delta per mark ∈ {0, 1}, alternating, and
  `recalc_entitlements --check` asserts it per mark as well as per entitlement.

No trigger: marks are not money (ADR-050, "editable within a window with audit").

#### 3. Behaviour, function by function (with the existing APIs each one uses)

**Registry** (`registry.py`, ADR-042 rules: keyed, idempotent for an equal entry, a different entry
under a used key raises `ImproperlyConfigured`, `_reset_for_tests()` restores the start-up snapshot —
same shape as `register_schedule`, `apps/common/jobs.py:477-499`):
`register_checkin_policy(context_type, *, module, policy)` keyed by `context_type`;
`register_mark_listener(context_type, *, module, on_marked)` keyed by `(context_type, on_marked)`
(several listeners per context allowed, called in registration order). `policy_for(context_type)`
raises `ImproperlyConfigured` when unregistered (EC-2: refuse, never allow by default).

**Groups and sessions (ATT-01).**
- `create_group(*, ctx, module, data)` — validates with `validate_recurrence`
  (`apps/common/recurrence.py:86`) when a rule is given; mark_kind `presence` with a rule needs
  `session_start` and `session_minutes`; audit `attendance.group.created` (new action, see C9).
- `set_members(*, ctx, group_id, party_id, from_on, to_on=None)` — locks the group row (serialises
  overlap checks), refuses an overlap with 400 `validation_error {from_on: [...]}`; party must be in
  the tenant (404 otherwise, via `Party.objects.for_tenant`).
- `end_membership(*, ctx, group_member_id, on)` — FRD ATT-01 §6; `to_on = on` (inclusive last day).
- `generate_sessions(*, tenant, group_id, until) -> int` — refuses `until > tenant_today + 182 days`
  (400); reads closed days **once** with `closed_days_between(tenant, start, until,
  module=group.module)` (`apps/platform_app/services/calendar.py:137`, inclusive, one query) instead
  of the FRD's per-date `is_open` (which is one query per date); occurrences from
  `occurrences(rule, start=…, end=…)` (`recurrence.py:211`); local time `session_start` on the
  date in `tenant_timezone(tenant)` (`apps/common/dates.py:18`) → `timestamptz`; `bulk_create(…,
  ignore_conflicts=True)` on `(group_id, starts_at)` so it is idempotent; returns rows created.
  BR-5 timetable change: from the first date ≥ today with no mark, a scheduled session whose
  `starts_at` no longer matches the rule is **deleted if it has no mark row at all**, otherwise
  (voided marks only, FK RESTRICT) set `cancelled` with reason "Timetable changed". The same pass
  cancels an unmarked future session that now falls on a closed day (reason "Closed"); a marked one
  is never touched (calendar BR-4, "never rewrites history"). Inactive group → 0.
- `cancel_session(*, ctx, session_id, reason)` — FRD ATT-01 §6; refuses a session with live marks
  (400) — the FRD is silent; default refuses, because cancelling would orphan counted marks.
- Weekly schedule: `register_schedule(Schedule("attendance.extend_sessions", period="weekly",
  weekday=0, at_hour_ist=1, minute=30, grace_minutes=240))` (`jobs.py:356`, `:477`); handler
  `@job_handler("attendance.extend_sessions", requires_tenant=False)` fans out one
  `attendance.extend_sessions_for_tenant` job per tenant **that has an active group with a rule**
  (not every tenant), idempotency token `extend-sessions:<tenant>:<ISO week>` — the
  `ledger.schedule_auto_reminders` pattern (`apps/ledger/tasks.py:44-66`).

**Check-in / check-out (ATT-02).** `check_in(*, ctx, module, party_id, context_type, context_id,
group_id=None, session_id=None, at=None, method="desk", override_reason=None) -> CheckInResult`.
Order (contract + FRD, lock order party → entitlement → mark):
1. `at = at or timezone.now()`; refuse `at > now + 5 min` (400 `{at: [...]}`). Also refuse `at` older
   than the group's `edit_window_hours` (24 h when group-less) — **not in the FRD**; without it a
   backdated check-in bypasses ATT-03's closed-edit rule (C10).
2. `lock_party(tenant=ctx.tenant, party_id=…)` (`apps/parties/services/balance.py:32`) → 404 if
   `None`; refuse an archived party (400).
3. Load group / session (one query, `select_related("group")`); `group.module == module`, session
   belongs to group, session not `cancelled` (BR-4: `{session_id: ["This session was cancelled."]}`),
   presence group requires `session_id`, visit group forbids it.
4. Policy: `policy_for(context_type)(tenant, party_id, context_id, on_date)`; the registered `module`
   must equal `module` (else `ImproperlyConfigured`). `block` without `override_reason` →
   `BusinessRuleViolation("attendance_blocked", reason, details={"reason", "override_permission"})`;
   with it: length 3–160 (400) **and** `actor_holds(ctx, override_permission)` else
   `PermissionDenied` (`apps/common/exceptions.py:51`); `override_permission is None` on a block
   means "nobody may override" → 403.
5. Dedupe (BR-3, R59): only when `group_id` is set and `dedupe_minutes > 0`: a live mark of the same
   party, group, `context_type`, `context_id` with `|at − check_in_at| < dedupe_minutes` →
   `attendance_duplicate {mark_id}` (strict `<`: the edge minute is a new visit). `one_per_day`:
   any live visit of that party in the group on that `on_date` → `attendance_duplicate`. Group-less
   visit: neither (R59). Session marks: a live mark for `(session, party)` is the R57 upsert below,
   not a 409.
6. Entitlement (if the policy named one): `_consume` (ATT-04) before the mark insert so the order is
   party → entitlement → mark.
7. Insert the mark (`status='visit'` for a visit group or group-less, `'present'` for a session;
   `on_date` = tenant-local date of `at` for visits (BR-4), **the session's local date** for session
   marks (C11)); session `scheduled → held` (ATT-03 BR-4); the use row; listeners
   `on_marked(ctx, mark, created=True)`; `write_audit(ctx=…, action="attendance.mark.created", …)`
   (`apps/common/audit.py:271`) and, when overridden, `attendance.mark.overridden` with reason and
   `override_permission` in metadata (T-ATT-02-7).
8. Return `{"mark", "decision": "allow"|"warn"|"block_overridden", "reason", "entitlement":
   {id,total,used,left}|None}`.

R57 upsert for `session_id`: if a live mark for `(session, party)` exists — consuming status → return
it unchanged (`decision` from the policy, no second use, no audit); non-consuming (absent, excused) →
run the policy, consume, change status to `present`, audit `attendance.mark.edited` with before/after.
This is gym BR-4's "a second save is an update, not a duplicate" (`gym.md:2389-2393`). The partial
unique index is the backstop for two writers (the party lock already serialises them).

`check_out(*, ctx, mark_id, at=None)`: lock the mark; refuse voided, already checked out, auto-closed,
non-visit, `at < check_in_at`, `at` > now + 5 min (400). Audit `attendance.mark.edited`.

`close_open_visits(*, tenant, on) -> int`: every live open visit with `on_date <= on` (not only `=
on`: a missed night heals on the next run) gets `check_out_at` = 23:59:59 tenant-local of its own
`on_date`, `auto_closed=True`; one `UPDATE … RETURNING`, idempotent. Daily fan-out `attendance.
close_open_visits` at 00:05 IST, child per tenant with open visits, payload `on = tenant_today − 1`
(`apps/common/dates.py:23`), token `close-visits:<tenant>:<on>`. Audit: one system row per tenant run
with the count (an audit row per auto-closed visit is noise; default, C9).

Query budget (T-ATT-02-5 "≤ 6 including the fake policy"): group-less, no entitlement = party lock,
policy, mark insert, audit = **4**; desk group, no pack = 6 (group, dedupe); desk group + pack = **9**
(entitlement `UPDATE … SET used = used + 1 WHERE … AND used < total RETURNING` is lock + check + write
in one, plus the use insert). **The FRD's 6 cannot hold for the pack path** (C8). Default: assert ≤ 6
for the no-pack desk path and ≤ 9 with a pack, and say so in the test docstring.

**Roll-call, edit, void (ATT-03).**
- `roll_call(*, ctx, session_id, marks: dict[UUID, str]) -> list[Mark]`: session locked; cancelled →
  400; every party must be expected (ATT-01 BR-3 via `expected_members`, else 400 naming the party);
  status in the five minus `visit`. Upsert: no live mark → insert (no policy, no consumption — R57:
  "records absences and bulk marks without a policy"); same status → nothing written (BR-2);
  changed → edit path (window rule, audit before/after, use ±1 per ATT-04 BR-4 only if the mark has a
  use history, see C4). First mark → session `held`.
- `edit_mark(*, ctx, mark_id, status, reason)`: reason 3–160; window = `edit_window_hours` after the
  session's `ends_at` or the visit's `check_in_at` (BR-3); after it, `actor_holds(ctx,
  f"{mark.module}.attendance.edit_closed")` else 403 (C5). `visit` ↔ presence statuses refused.
  Use rows per ATT-04 BR-4. Listeners `created=False`. Audit `attendance.mark.edited`.
- `void_mark(*, ctx, mark_id, reason)`: sets `voided_at`, `void_reason`; if Σ delta for the mark is
  1 → one `−1` row and `used − 1`; listeners `created=False`; audit `attendance.mark.voided`. The
  partial unique index frees `(session, party)` (BR-5). Void is **not** window-limited in the FRD;
  gym limits it itself (`gym.md:2252`). Default: the engine applies the same closed-edit rule to void
  (one rule for every module) — question 4.

**Entitlements (ATT-04).** `grant_entitlement(*, ctx, party_id, subject_type, subject_id, total,
valid_from, valid_to)` — **the contract has no `module`, but the table requires it (R18)** (C1).
Default: add `module` as a required keyword (contract v1.1 amendment needed); audit
`attendance.entitlement.granted`. `_consume(ent, mark, on)`: locked by the conditional `UPDATE`;
`on ∉ [valid_from, valid_to]` → `entitlement_exhausted {total, used, expired: true}`; `used = total`
→ `entitlement_exhausted {total, used}`; the entitlement's `party_id`/`module` must match the mark
(else `ImproperlyConfigured`: a policy bug). `extend_entitlement(*, ctx, entitlement_id, valid_to,
reason)` — `valid_to >= valid_from`, allowed after expiry (EC-2), audit `attendance.entitlement.
extended` with before/after. `end_entitlement(*, ctx, entitlement_id, on, reason)` — `valid_to = on`
(inclusive last valid day, the same meaning as `to_on`), refuses `on < valid_from` (400; C6), refuses
an `on` later than the current `valid_to` (that is an extend), audit `attendance.entitlement.ended`.
Neither touches `used`. `entitlement_for(tenant, subject_type, subject_id)` (FRD-only, additive).
`manage.py recalc_entitlements [--check|--apply]`: `used` vs Σ delta per entitlement and Σ ∈ {0,1}
per mark; `--check` exits 1 on drift (the `recalc_balances` pattern, ADR-031).

**Reads and reports (ATT-05).** Selectors as contracts §2.3; every one filters `tenant` first and
`module__in` the readable set. Endpoints, all `GET`, all with `permission_classes = [IsAuthenticated,
EngineEnabled("attendance"), HasEngineReadPermission("attendance")]` (`apps/common/permissions.py:172,
228`) and rows narrowed by `readable_engine_modules(request, "attendance")` (`:200`); a `module` query
parameter outside that set → empty list, a foreign `group_id` → 404:
`/attendance/groups`, `/sessions` (with `marked_count`, `expected_count`), `/open-visits` (with
`context_label` — **the engine has no label source** (C12); default omit the key until a listener
supplies `labels(*, tenant, ids)`, the W-M6/W-F9 rule), `/marks`, `/register`, `/percent`,
`/not-visited`, `/visits-by-hour`.
- `register_grid`: columns are the month's non-cancelled sessions **plus closed days the rule would
  have produced**; the FRD's `cells: {session_id: …}` cannot hold a "closed" cell, because a closed
  day has no session (C13). Default: `columns: [{key, date, session_id|null, kind:
  "session"|"closed"}]`, `cells` keyed by column `key`. An expected member with no mark on a held
  session is `"A"`; not enrolled `"-"`.
- `attendance_percent`: BR-1 with `Decimal` and `ROUND_HALF_UP` to 0.1 (`apps/common/money.py:31`
  `half_up` style); a zero denominator → `null` ("—"), never a division error. Worked example 11/12 →
  91.7.
- `not_visited_since(tenant, *, module, days, party_ids=None)`: BR-2 says "among parties with a live
  context (the vertical passes which)" but the engine endpoint has no such input (C14). Default: the
  selector takes `party_ids`; the engine endpoint returns every party with a live mark in the module
  and none in N days; the vertical's report narrows.
- `visits_by_hour`: `EXTRACT(HOUR/ISODOW FROM check_in_at AT TIME ZONE <tenant tz>)`.
- **"Registered reports with CSV"** (ATT-05 §3/§11) are **not possible from the engine**: R27 lets
  only verticals import `apps.reports.registry`, and `test_import_rules.py` gives engines no such
  exception (C2). Default: the engine ships selectors + CSV-ready rows; the vertical registers the
  reports (gym, Wave C).

**Off-guard (R56).** `register_off_guards()` registers, for each module `m` with `"attendance" in
ENGINES_USED_BY[m]` (`apps/platform_app/services/tenant_settings.py:60`; only `gym` today),
`register_module_off_guard(m, OpenVisitsOfEarlierDays(module=m), label_id="attendance.off.
openVisits")` (`guards.py:45`). The counter is a **frozen dataclass with `__call__`**, because the
guard registry dedupes by `==` (`guards.py:41-61`) and a `functools.partial` compares by identity —
a second `ready()` would double the count. It counts live visits with `check_out_at IS NULL` and
`on_date < tenant_today(tenant)` (uses `ix_attendance_open_visits`). The frontend needs a
`"attendance.off.": "settings"` line in `locales/catalogues.json` (the A12 convention,
`wave-a-track-p.md:128-132`).

**Tenant data.** `tenant_data.py` registers the six tables (`apps/common/tenant_data.py:97`), export
names `attendance_groups.csv` … ; uses before marks before sessions before groups is computed from
the RESTRICT FKs.

**Shared UI** (`frontend/src/modules/DigiKhaato/features/attendance/`): `api/attendanceService.ts`
(reads only), `types/attendance.types.ts`, `redux/attendanceThunk.ts` (queries only),
`redux/attendanceSlice.ts` (lazy, `injectInto(rootReducer)`, `store.ts:82`), components
`SessionList`, `GroupMembersTable`, `CheckInResultBanner`, `OverrideDialog` (`dynamic()`), `InNowList`,
`useCheckInDesk`, `RollCallList`, `EditMarkDialog`, `VoidMarkDialog`, `EntitlementChip`, `RegisterGrid`,
`AttendancePercentTable`, `RegisterPrint`, `AttendancePartyPanel`; catalogue `attendance.{en,hi}.json`
+ prefix line. Writes come in as props from the vertical. Three gaps: **`UbReasonDialog` does not
exist** (only `features/admin/components/AdminReasonDialog.tsx`), so it is a design-system addition
here (library F03 needs it too, same track); the FRD registers `AttendancePartyPanel` under core key
`attendance`, but `registerPartyPanel` requires `<module>.<name>` and shows a panel only when its
module is in `enabled_modules` (`features/parties/modulePanels.ts:62-99`), and an engine is never in
it — so the vertical registers the engine's component (`gym.attendance`), as W-F6 settled for
deposits (C15); and the engine's thunks would have to go into core `QUERIES` unless ADR-062's module
registry exists first, which is F01's (sequencing, question 3).

#### 4. Tests to write first (each names the defect it prevents)

Test-only subject: **not** at `tests/fixtures/engine_subjects.py` (10-architecture §11). A
`tests/fixtures/` package would shadow the existing module `backend/tests/fixtures.py`, which
`tests/conftest.py:8` and at least six app suites import (`from tests.fixtures import …`); packages
win over modules on import. Default: `backend/apps/attendance/tests/subject.py` — module `test`,
context type `test_subject`, a configurable fake policy and listener, `_entitle(tenant, "test")` as
in `apps/platform_app/tests/test_engine_enablement.py:46-59`, `ENGINES_USED_BY` patched with
`"test": {"attendance"}`, and `ENGINE_READ_PERMISSIONS["attendance"]["test"] = "parties.party.read"`
(the A12 trick of standing a core codename in for a vertical's, `test_engine_enablement.py:177-181`).
`test.attendance.edit_closed` and the override codename are monkeypatched into `PERMISSIONS` and
`MODULE_OF` for the window tests. Track D needs the same decision (question 2).

Unit / DB (`apps/attendance/tests/`):
1. `test_generation_skips_the_closed_monday` — T-ATT-01-1: Mon/Wed/Fri for 8 weeks, one closed Monday →
   23. Prevents sessions on holidays.
2. `test_generation_reads_the_calendar_once` — `django_assert_num_queries`; prevents 56 calendar queries
   per group per week (the per-date `is_open` the FRD wrote).
3. `test_regeneration_is_idempotent_and_keeps_marked_sessions` — T-ATT-01-2, BR-5.
4. `test_six_am_ist_is_stored_as_half_past_midnight_utc` — EC-3.
5. `test_expected_members_respect_join_leave_and_archive` — T-ATT-01-3; prevents "absent" for days
   before enrolment.
6. `test_overlapping_member_ranges_are_refused`.
7. `test_policy_allow_warn_block_and_override_with_and_without_the_codename` — T-ATT-02-1; prevents a
   block that anyone can override.
8. `test_an_unregistered_context_type_is_refused_not_allowed` — EC-2.
9. `test_dedupe_window_edges_and_one_per_day` — T-ATT-02-2 at window −1 s / exactly / +1 s.
10. `test_a_group_less_visit_is_never_deduplicated` — R59.
11. `test_two_concurrent_check_ins_of_one_party_give_one_mark_and_one_409` — T-ATT-02-3, `TransactionTestCase`,
    **with a desk group** (group-less visits have no dedupe, so the FRD's test as worded would pass two marks).
12. `test_auto_close_uses_the_tenant_day_and_is_idempotent` — T-ATT-02-4; plus a missed night heals.
13. `test_check_in_query_budget` and `test_open_visits_plan_uses_the_partial_index` (`EXPLAIN`,
    `tests/performance/test_party_list_plans.py` pattern) — T-ATT-02-5.
14. `test_override_is_audited_with_reason_and_actor` — T-ATT-02-7.
15. `test_check_in_after_midnight_belongs_to_the_new_day` — EC-1.
16. `test_session_check_in_upserts_an_absent_mark` — R57 / gym BR-4; prevents a 409 on a second roll-call save.
17. `test_roll_call_unchanged_writes_nothing_changed_writes_audit` — T-ATT-03-1.
18. `test_edit_window_edges_with_and_without_edit_closed` — T-ATT-03-2 (±1 minute).
19. `test_second_live_mark_raises_integrity_error_until_void` — T-ATT-03-3.
20. `test_void_gives_back_the_use` — T-ATT-03-4.
21. `test_unexpected_member_and_cancelled_session_are_refused` — BR-1, BR-4, EC-1.
22. `test_pack_worked_example_12_of_12` — T-ATT-04-1.
23. `test_present_absent_present_consumes_twice_and_used_matches` — the C3 case; fails against the FRD's
    unique `(mark_id, delta)`.
24. `test_two_check_ins_at_total_minus_one` — T-ATT-04-2 (concurrency).
25. `test_entitlement_replay_fuzz` — T-ATT-04-3: seeded marks/edits/voids/extends/ends; `used == Σ delta`;
    `call_command("recalc_entitlements", "--check")` exits 0, and exits 1 after a planted drift.
26. `test_extend_after_expiry_and_end_before_start` — EC-2, C6.
27. `test_percent_worked_example_and_zero_denominator` — T-ATT-05-1 (91.7; "—").
28. `test_register_plan_for_sixty_members` — T-ATT-05-2 (`EXPLAIN`).
29. `test_off_guard_counts_only_earlier_days_and_registers_once` — T-ATT-05-4, R56, the dataclass equality.
30. `test_engine_reads_404_cross_tenant_and_hide_unreadable_modules` — T-ATT-01-4, W-P4 (asserts who is signed
    in first, the CLAUDE.md harness lesson).
31. `test_a_listener_that_raises_rolls_the_mark_back` — 10-architecture §11 seam contract.
32. `tests/contracts/test_attendance_policy_contract.py` — T-ATT-02-6: every registered policy answers in
    one query for a member with a year of history; vacuous until gym, with a planted fake policy so it
    is not vacuous today.

Architecture suites extended, not edited: import rules (row exists), error-code equality, route
coverage, `tenant_data` coverage, `test_recurrence_fields` (picks up `Group` automatically).

Frontend (shared UI): component tests per component; `RegisterGrid` scrolls in its own box;
`RegisterPrint` joins `customerDocumentsCarryNoProductName.test.tsx` (T-ATT-05-3);
`lazySlices.test.ts` gains `attendance`; `OverrideDialog` opens on the reason field through the
dialog's own focus hook, not `autoFocus` (the LED-01 `MLDialog` finding).

#### 5. Edge cases

- Tenant timezone other than IST: the 00:05 IST fan-out is already the next day east of India and
  still the previous day west of it; `on = tenant_today − 1` per tenant plus `<=` makes both safe.
- A party archived with live group memberships: not expected from that day (BR-3); history kept;
  the engine registers **no** archive guard (that is the vertical's, and a mark is not an open record).
- A module switched off then on: its groups and marks are hidden from engine reads while off
  (`enabled_modules_using`), and nothing is deleted.
- Check-in to an inactive group: 400 (EC-2 "no new sessions" extended to marks).
- Two packs for one member: the policy names one (EC-1); the engine never chooses.
- A listener that writes (gym ends a freeze): runs inside the transaction; its queries are outside the
  engine's budget and the contract test says so.
- `dedupe_minutes = 0`: no window (gym allows 0).
- `roll_call` with an empty dict: no-op, session stays `scheduled`.
- DST tenants: `ZoneInfo` with `fold=0`; a non-existent local time moves forward (documented, untested
  beyond one case).

#### 6. Contradictions and gaps (default taken; none blocks starting ATT-01)

| # | Where | Contradiction | Default |
|---|---|---|---|
| C1 | contracts §2.3 vs R18 | `grant_entitlement` has no `module`, the table requires it | Required `module=` keyword; **v1.1 amendment** |
| C2 | FRD ATT-05 §3/§11 vs R27 + `test_import_rules.py` | Engine cannot import `apps.reports.registry` | Engine ships selectors/rows; the vertical registers reports |
| C3 | FRD ATT-04 §5 vs BR-4 | Unique `(mark_id, delta)` forbids present→absent→present | `seq` column, unique `(mark_id, seq)`, Σ per mark ∈ {0,1} (own table) |
| C4 | R57 vs ATT-04 BR-2/BR-4 | `roll_call` has no policy, so a `late`/`present` written there cannot know a pack | Consumption only through `check_in`, or ± on a mark that already has a use history |
| C5 | FRD ATT-03 vs gym BR-6 | Closed edit is `<module>.attendance.edit_closed` vs gym's `gym.checkin.void` + owner/admin | Engine checks the FRD 00 codename; gym reconciles in its own FRD |
| C6 | R18 | `end_entitlement` "on" semantics and `on < valid_from` unspecified | `on` is the last valid day; earlier than `valid_from` refused |
| C7 | contracts §2.3 vs FRD ATT-01 §6 and gym BR-6 | `cancel_session`, `end_membership`, `entitlement_for` in the FRD only; gym needs `update_group` (dedupe setting moves both groups, `gym.md:413`) which neither has | Build all four as additive public functions; **v1.1 amendment** lists them |
| C8 | T-ATT-02-5 | ≤ 6 queries is impossible with a pack | ≤ 6 without a pack, ≤ 9 with one |
| C9 | contracts §5 | No audit action for group create/update, session cancel, auto-close | Add `attendance.group.created|updated`, `attendance.session.cancelled`, `attendance.visits.auto_closed`; **v1.1** |
| C10 | FRD ATT-02 | `at` may be backdated without limit, bypassing the edit window | Refuse older than the edit window |
| C11 | FRD ATT-02 BR-4 vs ATT-03 | A roll-call saved next morning would date session marks by save time | Session marks take the session's local date |
| C12 | FRD ATT-02 §6 | `context_label` has no source | Omit until a vertical listener supplies `labels()` |
| C13 | FRD ATT-05 §6 | "closed" cells keyed by `session_id` for days with no session | Column list with `kind`; cells keyed by column |
| C14 | FRD ATT-05 BR-2 | Live contexts are the vertical's, the endpoint has no input for them | `party_ids` on the selector; endpoint unfiltered |
| C15 | FRD ATT-05 §7 vs A6 registry | Panel under core key `attendance` can never render | The vertical registers the engine component |
| C16 | 10-architecture §11 vs repo | `tests/fixtures/` package would shadow `tests/fixtures.py` | Subject in `apps/attendance/tests/subject.py` |
| C17 | FRD ATT-01 §5 vs code | `OptionalRecurrenceFields` does not exist | Local subclass of `RecurrenceFields` with nullable `freq`/`anchor` |

Unverified: that Django lets a concrete model override an abstract mixin field *and* keep the mixin's
constraint names valid in the autodetector (believed so since Django 1.10; checked first in the
build step); the exact query counts in C8 (estimated from the plan, not measured).

---

## F01 — Library feature skeleton, ADR-061 registrations, ADR-062 module invalidation

Status: **design written; not started**

### Design note (review step)

**Inputs read.** Plan §3.1 F01 row; library FRD F01 row (`frd/library.md:3179`), §7 nav table
(`library.md:315-324`), URL-state and mapping (`:596-600`), permissions §7 (`:3033`); ADR-061,
ADR-062 (`docs/38-architecture-decision-records.md:1313-1366`); 10-architecture §6, §18 W-F1, W-F3,
W-P5, W-G1; Wave A track notes on label routing (`wave-a-track-p.md:128-132, 272-274, 499-501`)
and A11's "no core→vertical zone" (`wave-a-track-f.md`, A11 design note).

Code read: `frontend/package.json` `sideEffects`; `src/tests/sideEffectImports.test.ts`;
`src/redux/store.ts` (static reducers, `LazyLoadedSlices` at :80, `rootReducer` at :82, `RootState`
at :168); `src/redux/invalidation/{registry,map,listener,types}.ts`; `src/tests/invalidation.
{registry,map}.test.ts`; `src/tests/lazySlices.test.ts`; `eslint.config.mjs` (A11 zones :125-181,
`no-restricted-syntax` base + party-fetch at :21-26 / :93-125, the allowlist block at :439, the
`**/*Slice.ts` block at :457); `src/tests/moduleBoundaryLintRule.test.ts` and its fixtures;
`features/parties/modulePanels.ts`, `features/parties/components/PartyModulePanels.tsx`,
`features/payments/deposits/partyPanel.ts`, `features/reports/dashboardSections.ts`,
`features/reports/components/DashboardModuleSections.tsx`, `features/reports/reportsRegistry.ts`,
`features/reminders/moduleTabs.ts` and its readers; `src/routes.ts`; `src/utils/seo.ts`;
`src/types/domain.types.ts`; `features/navigation/sidebarConfig.ts`; `locales/catalogues.json`,
`scripts/split-locales.mjs`, `scripts/check-locales.mjs`, `scripts/lib/i18n-graph.mjs`.

#### 1. Skeleton (the plan row as written)

- `features/library/` with `types/library.types.ts`, `api/libraryMapping.ts` (wire ↔ camelCase, empty
  until F02), `hooks/useLibraryListUrl.ts` (modelled on `usePartyListUrl`: seed once, write back).
- `src/routes.ts`: **flat** keys `LIBRARY_HOME`, `LIBRARY_COUNTER`, `LIBRARY_MEMBERS`,
  `LIBRARY_CATALOGUE`, `LIBRARY_HOLDS`, `LIBRARY_VERIFICATION`, `LIBRARY_REPORTS`, `LIBRARY_SETTINGS`
  in a `// ── library ──` block. The FRD's `ROUTES.library.*` is a nested object; `ROUTES` is flat
  and `Route = (typeof ROUTES)[RouteKey]` (`routes.ts:144`) is a union of strings, so nesting breaks
  the type and `routes.test.ts`. `'/library'` appended to `APP_ROUTE_PREFIXES` (`routes.ts:216`);
  `CRAWL_DISALLOW` (`src/utils/seo.ts:67`) derives from `GUARDED_ROUTE_PREFIXES`, so it needs no edit
  (10-architecture §6.1 says "and to CRAWL_DISALLOW" — already true by construction).
- `sidebarConfig.ts`: the eight rows of `library.md:315-324`, `module: 'library'`, **without
  `ready`**, so none renders until its page exists (`routes.test.ts` asserts every `ready` row has a
  page). Each later F-task sets `ready: true` with its page. No `group` field yet: one vertical
  needs no headings (10-architecture §6.2).
- `PERMISSION_CODES` (`domain.types.ts:46`) gains the sixteen library codenames **in lockstep with
  B02** (Track L), not before: F01 depends on B01 only, and the nav rows need the codenames to
  type-check. Default: F01 lands after B02 or adds exactly B02's list from its PR (question 6).
  `MODULE_CODES` already has `library` (`domain.types.ts:35`).
- Catalogue: `locales/catalogues.json` gains `"library.": "library"`, `"library.off.": "settings"`,
  `"library.role.": "team"`, `"library.archive.": "parties"`, `"library.reminders.": "reminders"`
  (W-P5's routing lines, so server-sent labels resolve where they are drawn); `nav.module.library`
  and the eight `nav.library.*` labels go to the shell (`nav.` is shell, `catalogues.json:30`).
  Then `npm run i18n:split` generates `src/i18n/catalogues/library.ts`.
- **Route gate** (not in the plan; gap G1): `app/(app)/library/layout.tsx` renders the not-found
  state when `library` is not in `selectEnabledModules`. Today no module route has a gate (no
  `RequireModule` exists); a typed `/library` URL for a tenant without the module would draw the
  page shell and a 403 snackbar, which is an unbuilt feature shown (vision §4).
- **Lint zones** (W-F1): a zone `app/(app)/library/**` may not import other verticals, Shop & billing
  or unused engines; and the **core → vertical/engine zone that does not exist today** (G2, below).

#### 2. ADR-061 concretely

Files:

```ts
// frontend/src/modules/registrations.ts  (new; outside features/, so no A11 zone targets it)
/**
 * ADR-061 — THE one place core reaches a vertical: each vertical's register.ts,
 * imported for its side effect. Imported only by the registry READERS
 * (PartyModulePanels, DashboardModuleSections, RemindersPageContent,
 * ReminderSettingsDialog, and the reports hub once F11 builds it) — never by
 * a layout or AppProviders, so /login pays nothing. Listed in package.json
 * sideEffects; src/tests/verticalRegistrations.test.ts fails for any other
 * importer of a register.ts and for a vertical missing from this list.
 */
import 'modules/DigiKhaato/features/library/register';
```

```ts
// frontend/src/modules/DigiKhaato/features/library/register.ts  (new; data + dynamic() only)
import { registerPartyPanel } from 'modules/DigiKhaato/features/parties/modulePanels';
// F01: empty of entries; F04 adds the panel, F08 the reminder tab, F10 the section, F11 reports.
export {};
```

- `package.json` `sideEffects` gains `"./src/modules/registrations.ts"` and
  `"./src/modules/DigiKhaato/features/*/register.ts"`, with a line in `//sideEffects` saying why
  (the A4b defect). The existing guard's `globToRegExp` turns the second into
  `^src/modules/DigiKhaato/features/[^/]*/register\.ts$`, which matches the resolved path
  (`sideEffectImports.test.ts:23-34`). Verified by reading, not run.
- Readers each add `import 'src/modules/registrations';` with a comment: `PartyModulePanels.tsx`
  (beside the existing deposit-panel import at :12, which stays — deposits are core, keyed
  `payments.deposits`), `DashboardModuleSections.tsx`, `RemindersPageContent.tsx` **and
  `ReminderSettingsDialog.tsx`** (a second reader of `reminderTabsFor`, `:18`, that ADR-061 does not
  name — if it is ever opened from a screen that has not imported the list, the library tab's window
  row vanishes). The reports hub has **no reader yet** (`visibleModuleReports` is unused;
  `reportsRegistry.ts:14-18` defers it to F11), so F11 adds that import.
- New `src/tests/verticalRegistrations.test.ts` (the ADR's "jest guard"): (1) walks `src/` and `app/`
  for any `import`/`import()`/`export … from` whose resolved target matches
  `features/<vertical>/register.ts`, spelled `modules/…`, `src/modules/…` or relative, and fails for
  any importer other than `src/modules/registrations.ts`; (2) every vertical folder that has a
  `register.ts` is listed in `registrations.ts`; (3) `registrations.ts` itself is imported only by the
  allowed readers (not by `app/**/layout.tsx`, `AppProviders`, `store.ts`); (4) after importing
  `src/modules/registrations`, each vertical's own registry test sees its entries (added by F04/F08/
  F10/F11, one per entry). Defect prevented: the A4b class (dropped registration), and a shell import
  that would put every vertical's registration on `/login`.
- `sideEffectImports.test.ts`'s "not vacuous" check gains `registrations.ts` and `library/register.ts`.

**Flaws in ADR-061 as written** (none blocks F01; each has a default):

- **F-61-1, i18n.** `check-locales.mjs` rule 4 walks the static import graph and treats any string
  literal equal to a message id as "rendered by this chunk" (`scripts/lib/i18n-graph.mjs:227-240`).
  `register.ts` is statically reachable from the khata, dashboard and reminders routes, so a
  `labelId: 'library.reminders.tab'` there makes `check-locales` demand the **whole** `library`
  catalogue on those routes (or fail). Default: every id a `register.ts` names must live in a
  catalogue the reader route already loads — `library.reminders.` routed to `reminders`, panel and
  section words inside their `dynamic()` chunks, and `nav.module.library` (shell) as the fallback.
  The guard test asserts it (`register.ts` string literals ⊆ shell ∪ reader's catalogues).
- **F-61-2, "the A11 boundary lint rule" does not stop core importing a vertical.** The zones target
  only engine and vertical folders (`eslint.config.mjs:166-181`); A11 deliberately added no core →
  vertical zone (`wave-a-track-f.md`, A11: "a zone now could forbid the mechanism before it is
  written"). The mechanism now exists, so F01 adds zones whose **targets are the core feature
  folders** (every `features/*` that is not an engine or vertical, plus `src/components`,
  `src/redux`, `src/hooks`, `src/print`) and whose **from** are the vertical and engine folders.
  `src/modules/registrations.ts` is outside every target, which is the ADR's one hole. Fixture
  `CoreImportsVertical.ts.fixture` (fires) and `RegistrationsImportsVertical` (none) in
  `src/tests/lint-fixtures/module-boundaries/`. Caveat (unverified): a core feature that renders an
  engine's shared component directly would now fire; none does today, and the ADR-041 rule says it
  should go through a registry anyway.
- **F-61-3, readers.** Four readers today, not the ADR's four named ones (see above).
- **F-61-4, panel cost.** A library panel registered without `appliesTo` loads its chunk on every
  khata of a library tenant; F04 should pass `appliesTo` on the party's library role (A6 roles), as
  deposits do (`partyPanel.ts:16-20`).
- **F-61-5, engines.** The ADR covers verticals only. Engines register nothing (C15 above): their
  components are registered by the consuming vertical, so `features/attendance/register.ts` must not
  exist. The guard test asserts that too.

#### 3. ADR-062 concretely

Files:

```ts
// src/redux/invalidation/moduleRegistry.ts  (new, core)
export type TModuleInvalidationEntry = Omit<TInvalidationEntry, 'resetAll'>;   // resetAll stays core-only
const BY_ACTION = new Map<string, Map<string, TModuleInvalidationEntry>>();      // `${typePrefix}/fulfilled` -> module -> entry
export function registerInvalidation<N extends string>(
  module: string,
  mutations: Readonly<Record<N, string>>,                 // the module's MUTATIONS: name -> typePrefix
  map: Readonly<Record<N, TModuleInvalidationEntry>>,     // total over the module's own names
  coreExtras?: Partial<Readonly<Record<TMutationName, TModuleInvalidationEntry>>>, // core thunk -> module slices
): void   // idempotent per module key: a second call REPLACES that module's rows (HMR, re-injection)
export function moduleEntriesFor(actionType: string): readonly TModuleInvalidationEntry[]
export function registeredInvalidationModules(): readonly string[]
export function resetModuleInvalidationForTests(): void
```

```ts
// features/library/redux/libraryInvalidation.ts  (new; the ONLY place library calls registerInvalidation)
export const LIBRARY_QUERIES = { /* name: typePrefix, F02 onward */ } as const;
export const LIBRARY_MUTATIONS = { /* name: typePrefix */ } as const;
export type TLibraryMutationName = keyof typeof LIBRARY_MUTATIONS;
export const LIBRARY_INVALIDATION: Readonly<Record<TLibraryMutationName, TModuleInvalidationEntry>> = {};
export const LIBRARY_CORE_EXTRAS = { archiveParty: { stale: ['libraryMemberList'] } };   // F04
registerInvalidation('library', LIBRARY_MUTATIONS, LIBRARY_INVALIDATION, LIBRARY_CORE_EXTRAS);
```

- **Listener** (`listener.ts:45-77`): predicate `FULFILLED.has(type) || moduleEntriesFor(type).length
  > 0`; effect: a core `resetAll` wins and returns; otherwise the union of core and module entries —
  `now = ⋃ refetch`, `nextMount = ⋃ stale − now` — dispatched as at most one `cacheInvalidated` per
  urgency, so each slice is signalled once (today a slice in both lists gets two signals; harmless
  but the ADR asks for once). `patch` is never dispatched (unchanged).
- **Registry and map tests.** `invalidation.registry.test.ts` today fails on the first library thunk:
  "registers every createAsyncThunk exactly once" checks only core `QUERIES`/`MUTATIONS`, and "holds
  every entry to its thunk's real typePrefix" lists any thunk outside core as `unregistered`
  (`:41-99`). Both are extended to: for a thunk file under `features/<m>/redux/` where
  `features/<m>/redux/<m>Invalidation.ts` exists, check against that module's
  `<M>_QUERIES`/`<M>_MUTATIONS`; otherwise core. Typeprefix drift and uniqueness are checked over the
  union. `invalidation.map.test.ts` gains, per module: every mutation has a non-empty entry; every
  slice named is a real store key after importing the module's slice files (the existing "names only
  real store keys" mechanism, `:80-90`); a module entry never `patch`es a slice it does not own
  (a core slice's reducer cannot reference a module thunk without core importing the vertical); and a
  printed union table per action (the ADR's "one command").
- **Per-module registration test** (the ADR's mandatory one), `features/library/redux/
  libraryInvalidation.test.ts`: in an isolated module registry (`jest.isolateModules`), import **each
  library thunk file alone** and assert `registeredInvalidationModules()` contains `library`.
- **Lint.** A separate constant `MODULE_INVALIDATION_SYNTAX = [{ selector:
  "CallExpression[callee.name='registerInvalidation']", message: … }]`, added to the main block's
  `no-restricted-syntax` **and** to the party-fetch allowlist block's restatement (`:439-443`), and
  switched off by a new block for `src/modules/DigiKhaato/features/*/redux/*Invalidation.ts`,
  `src/redux/invalidation/**` and tests that restates the other two lists. Flat config **replaces**
  a rule's options per matching block (`eslint.config.mjs:13-19`), so a careless block for
  `**/*Slice.ts` setting `no-restricted-syntax` would silently drop the party-fetch selectors from
  every slice. A `src/tests/lint-fixtures/invalidation/` probe (fires in a component, none in an
  `*Invalidation.ts`) proves it, on the `partyFetchLintRule.test.ts` mechanics.
- `package.json` `sideEffects` gains `"./src/modules/DigiKhaato/features/*/redux/*Invalidation.ts"`.

**Flaws in ADR-062 as written** — F-62-1 is the one the lead must rule on before F01 merges:

- **F-62-1, the ordering claim is false for this codebase, and the mandated test cannot pass with
  registration in the slice file.** The ADR says "a module's thunks are dispatched only from that
  module's chunks, and those chunks import the slice module that registers the map", and its test
  "imports the module's thunk file alone, then asserts the map is registered". Thunk files import no
  slice (e.g. `features/sales/redux/salesThunk.ts` imports only RTK, types and `toApiError`); slices
  import thunks for `extraReducers`. A component that dispatches a mutation without reading the
  module's slice (a `dynamic()` dialog opened from a core screen, or a panel) would fire a mutation
  with **no entry registered**, and its core-slice invalidations (the khata's balance after a library
  charge) would silently not happen — the A4b class again, and invisible to jest because the test
  setup imports everything. Importing the slice from the thunk instead is a cycle
  (`import/no-cycle`, `eslint.config.mjs`, maxDepth 4) and a TDZ risk at evaluation. **Default:** the
  call moves to `redux/<module>Invalidation.ts` (data + one call); **every module thunk file
  bare-imports it** (`import './libraryInvalidation';`), the sideEffects glob keeps it, and the
  slice files need not import it at all. The ADR's test then passes as written, and the lint
  restriction targets `*Invalidation.ts` rather than `*Slice.ts`. This amends the ADR's "from the
  same module file that injects its slice" (question 5).
- **F-62-2, keys.** "Keyed by thunk `typePrefix`" and "typed `Record<TLibraryMutationName, …>`"
  disagree, as do `registerInvalidation(map)` and "idempotent per module key". The signature above
  takes both the name→prefix table and the name→entry map, which keeps totality at compile time.
- **F-62-3, queries.** The ADR moves mutations only, but the registry test requires every thunk,
  queries included, to be registered somewhere; module queries need the module file too.
- **F-62-4, `patch`.** A module entry that patches a core slice is unimplementable without core
  reducers naming module thunks; forbidden by type comment and map test.
- **F-62-5, measurement.** The reversal trigger (< 0.3 KB saving) needs a counterfactual build; F13
  records it by building once with the library map spread into `map.ts` and once registered.
- Verified by reading: `TSliceKey = keyof RootState` already admits lazily injected keys (core
  `map.ts` names `statement`, `cashbook`, `reminders`, which are lazy, `map.ts:235-270`), so a module
  map naming its own lazy slice type-checks once the slice file declares itself on `LazyLoadedSlices`.

#### 4. Tests to write first (F01)

1. `verticalRegistrations.test.ts` (four cases above) — dropped or shell-loaded registrations.
2. `sideEffectImports.test.ts` additions — the glob lines exist and match.
3. `moduleBoundaryLintRule.test.ts` fixtures for core → vertical (fires), registrations → vertical
   (none), `app/(app)/library` → gym (fires) — the boundary the ADR assumes.
4. `moduleRegistry.test.ts` — idempotent per module key (second call replaces, no doubling);
   `resetAll` rejected by type; union with core entry dispatches each slice once with `now` winning;
   a core `resetAll` short-circuits module entries.
5. `invalidation.registry.test.ts` / `invalidation.map.test.ts` extensions — with a planted fixture
   module so they are not vacuous before F02's first thunk.
6. `libraryInvalidation.test.ts` — thunk-file-alone registration (vacuous in F01; made real by F02's
   first thunk; the test asserts at least one thunk file exists once F02 lands).
7. `invalidationLintRule.test.ts` — `registerInvalidation(` outside `*Invalidation.ts` fires.
8. `routes.test.ts` — library prefix guarded; no library nav row `ready` without a page.
9. Route gate test — `/library` for a tenant without `library` renders not-found, not a 403 toast.
10. `localeCatalogues` / `npm run i18n:check` — `library` catalogue paired, routed prefixes resolve.
11. `lazySlices.test.ts` — no library key in the store at start-up (vacuous until F02, asserted then).

#### 5. Edge cases

- Hot reload re-evaluates `libraryInvalidation.ts`: replace, not double (test 4).
- A tenant with library off: `registrations.ts` still imports `register.ts` (tens of bytes); readers
  filter by `enabled_modules`; nothing renders and no chunk loads.
- `resetPartyPanelsForTests` snapshots its baseline at first call (`modulePanels.ts:103-108`); a test
  file that imports `registrations.ts` after its first reset loses library's entries from the
  baseline — vertical registry tests import `registrations.ts` at the top.
- Registry readers in a test render the real registrations; `PartyModulePanels.test` expectations
  that "no panel renders" for a library-enabled tenant change once F04 registers one.

#### 6. Contradictions and gaps (F01)

| # | Contradiction | Default |
|---|---|---|
| G1 | No module route gate exists; library pages reachable by URL when off | `app/(app)/library/layout.tsx` gate |
| G2 | ADR-061 relies on a core → vertical lint rule that does not exist | Add the zones in F01 |
| G3 | FRD `ROUTES.library.*` nested vs flat `ROUTES` | Flat `LIBRARY_*` keys |
| G4 | FRD says "the ESLint `no-restricted-imports` zone"; A11 built `import/no-restricted-paths` zones and the library zone already exists (`eslint.config.mjs:152`) | Only the `app/(app)/library` zone is new (W-F1) |
| G5 | Plan: F01 after B01; nav rows need B02's codenames | Land with or after B02 |
| G6 | F-61-1…5, F-62-1…5 above | As stated |

---

## Open questions for the lead

1. Attendance `0001` dependencies: the two referenced apps (`parties 0010`, `platform 0013`) or all
   five Wave B heads (plan §1.4 rule 2)?
2. Engine test subjects cannot live in `backend/tests/fixtures/` (shadows `tests/fixtures.py`). Same
   location for Track D's dues subject — `apps/<engine>/tests/subject.py`?
3. Sequencing: ATT's shared-UI thunks need ADR-062's module registry, which is F01's. Merge ATT's
   backend first, then F01, then ATT's shared UI (as part of the same XL task, second merge)? The
   alternative puts engine queries in core `QUERIES` (shell growth ADR-062 exists to stop).
4. Should `void_mark` follow the closed-edit window like `edit_mark` (one engine rule), or stay
   unrestricted with each vertical limiting it?
5. **ADR-062 F-62-1**: approve moving `registerInvalidation` from the slice file to
   `redux/<module>Invalidation.ts`, bare-imported by each thunk file and listed in `sideEffects`?
   Without it the ADR's own mandatory test cannot pass, and a thunk dispatched without its slice
   loaded invalidates nothing.
6. F01 timing against B02's codenames (G5).
7. Contracts v1.1 amendment for the engine: `grant_entitlement(module=…)` (C1); `cancel_session`,
   `end_membership`, `entitlement_for`, `update_group` (C7); audit actions (C9). Who files it, and may
   ATT build them before it is recorded?
8. ATT-05's "registered reports" (C2) and the party panel (C15) move to gym in Wave C — confirm, so
   the Wave B gate does not expect them from the engine.
9. Where may the engine's shared UI be *looked at* in Wave B, with no vertical to host it? Proposal:
   a section of the internal `app/(internal)/design-system` page with fixture data, so the
   "review, build, look" loop has something to look at; or accept jest only until gym.

## Lead rulings (1 Oct 2026)

- **Engine test subjects** live in the engine's own tests: `backend/apps/dues/tests/subject.py` and `backend/apps/attendance/tests/subject.py`. They do not go in `tests/fixtures/`, which would shadow `tests/fixtures.py`, or in a shared `tests/engine_subjects/`, which neither track would own. 10-architecture §11's path is superseded by this.
- **ADR-062 F-62-1 approved.** ADR-062 and ADR-061 are amended in place (1 Oct, before any code). Registration lives in `redux/<module>Invalidation.ts`, which every thunk file of the module bare-imports and which is listed in `sideEffects`. Module `patch` may name only the module's own slices. `register.ts` carries no message ids. F01 adds the frontend core-to-vertical boundary zone.
- Every other open question keeps the default recorded above until the next lead session or the owner answers.
