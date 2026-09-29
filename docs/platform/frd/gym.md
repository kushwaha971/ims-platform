# Gym & fitness — Functional Requirements Document (FRD)

Status: **DRAFT FOR REVIEW, 29 Sep 2026 (Phase 3, step 4: document the modules).** Written by the BA
for the gym module. Nothing here is built. Per the in-app rule (vision §4), none of it may appear in
the app until it ships, and the module code stays in `UNRELEASED_MODULES` until its release CR
(10-architecture §2.4).

**Binding inputs, in order of precedence:** [00-platform-vision.md](../00-platform-vision.md) (§7 is
this document's template), [10-architecture.md](../10-architecture.md),
[11-contracts.md](../11-contracts.md), ADR-041 to ADR-055 in
[Part 38](../../38-architecture-decision-records.md), `CLAUDE.md`. **Main input:**
[research/gym.md](../research/gym.md) (cited as "research §n"). Also read:
[research/shared-engines.md](../research/shared-engines.md), the house FRD style
([17-00](../../17-00-frd-template.md), [17-02](../../17-02-frd-ledger-payments.md)), and the code of
`apps/sales`, `apps/payments`, `apps/parties`, `apps/ledger` (reminders), `apps/notifications` and
`apps/tax` at commit 30798d2.

**Relation to [00-core-and-engines.md](00-core-and-engines.md)** (the Wave A and engine FRD,
committed while this one was written). Its feature IDs are used here beside the 10-architecture
names: A1 = PLT-X11, A4 = PLT-X03, A5 = PLT-X05, A6 = PLT-X04, A7 = PLT-X06, A8 = PLT-X07, A9 =
PLT-X08 and PLT-X09, A10 = PLT-X13, A11 = PLT-X14, engine enablement = PLT-X10, row scoping =
PLT-X12, dues = DUE-01…06, attendance = ATT-01…05. Where its examples name gym codenames
(`gym.membership.read`, `gym.membership.write`, `gym.attendance.read`, `gym.batch.write`) they are
illustrations; the gym's codenames are this FRD's §0.7, and its engine-read entries are stated in
[C13](#contract-questions). Its contract questions CQ-2, CQ-14, CQ-17 and CQ-24 overlap this FRD's
C3, the preset seed, C10 and C13, and are cross-referenced there.

**What this FRD may and may not do.** It adds fields to the gym's **own** tables. It does not change
anything in 11-contracts. Its contract questions were **resolved on 30 Sep 2026** by the architecture
owner (10-architecture §17, 11-contracts v1); the table under
[Contract questions](#contract-questions) records each answer, and the body below follows the
answers, not the fallbacks it carried before.

---

## How to read this document

Every feature `GYM-nn` has the fourteen sections of vision §7, always in this order and always all
fourteen. A section that has nothing specific to say says so and why, as the house template does.
Material shared by several features is stated once in [§0 Cross-cutting](#0-cross-cutting) and
referenced by number (for example "§0.5 E3"), so each feature's section carries only what is its
own.

Numbering inside a feature: user flows `F-n`, business rules `BR-n`, edge cases `EC-n`, tests
`T-GYM-nn-n`. Worked examples are in §9 of the feature they belong to.

**Feature list.**

| ID | Feature | Research | Main engine or core piece |
|---|---|---|---|
| [GYM-01](#gym-01--module-switch-settings-and-presets) | Module switch, settings and presets | §15.6, §15.7 | platform (release gate, presets) |
| [GYM-02](#gym-02--members-guardians-and-payers) | Members, guardians and payers | §4, §15.1 | parties, `parties_relation`, `register_party_role` |
| [GYM-03](#gym-03--enquiries) | Enquiries (name and mobile only) | W1, §15.1 | vertical table (ADR-046) |
| [GYM-04](#gym-04--membership-plans) | Membership plans and tax codes | §4, §6.14 | `tax` rates |
| [GYM-05](#gym-05--sell-a-membership-validity-period-and-joining-fee) | Sell a membership: validity period and joining fee | W2, §6.1, §6.3, §6.8 | document port |
| [GYM-06](#gym-06--money-documents-through-the-sales-port) | Money documents through the sales port | §9, §10, E7, E8 | document port, origin listener |
| [GYM-07](#gym-07--instalments-through-the-dues-engine) | Instalments through the dues engine | §6.10, §15.3 | dues engine (charge mode, document posting) |
| [GYM-08](#gym-08--renewal-and-rejoin) | Renewal and rejoin | W5, §6.4, §6.8 | — |
| [GYM-09](#gym-09--freeze-and-resume) | Freeze and resume | W6, §6.5 | calendar |
| [GYM-10](#gym-10--extensions-and-closure-days) | Extensions and closure days | §6.13 | calendar |
| [GYM-11](#gym-11--upgrade-and-downgrade) | Upgrade and downgrade (pro-rata credit note held as advance) | §6.6 | document port |
| [GYM-12](#gym-12--transfer-to-another-person) | Transfer to another person | §6.7 | — |
| [GYM-13](#gym-13--cancel-and-refund) | Cancel and refund (refund owner-only) | §6.9 | document port, refund seam |
| [GYM-14](#gym-14--desk-check-in) | Desk check-in with the eligibility hook | W3 | attendance engine |
| [GYM-15](#gym-15--batches-and-batch-attendance) | Batches and batch attendance | W4 | attendance engine |
| [GYM-16](#gym-16--membership-card-and-qr-scanning) | Membership card and QR scanning | §9, §15.4 | `apps/common/qr.py`, `BarcodeDetector` |
| [GYM-17](#gym-17--expiry-and-renewal-reminders) | Expiry and renewal reminders | §6.12 | reminders (ADR-054) |
| [GYM-18](#gym-18--trainer-role-and-personal-training-sessions) | Trainer role, and personal-training sessions | §12, W8 | module roles (ADR-052), attendance |
| [GYM-19](#gym-19--dashboard-section) | Dashboard section | §7 | `register_dashboard_section` |
| [GYM-20](#gym-20--reports) | Reports | §8 | `register_report` |
| [GYM-21](#gym-21--privacy-and-data-minimisation) | Privacy and data minimisation | §13a | parties consent fields, ADR-053 |

**Scope note (what of the research MVP is not here, and why).** Research §16 lists, beyond the items
above, three MVP items that this FRD moves to a follow-up revision so that the first release proves
the two engines and the port on the smallest money path: **academy monthly batch fees** (W9, §6.11 —
a recurring dues schedule per enrolment; GYM-07 builds the dues wiring it needs), **CSV import of
existing members** (W10 — a new import template; needs the member, plan and term tables of this FRD
first) and the **enrolment form print** (research §9, marked "later" there). The IDs `GYM-22`
(academy fees) and `GYM-23` (member import) are reserved for them. Personal-training packages are in
scope as session-pack plans with a trainer (GYM-04, GYM-18); they need no table of their own because
a logged session is an attendance mark.

---

## 0. Cross-cutting

### 0.1 Module shape

| Item | Value | Source |
|---|---|---|
| Module code | `ModuleCode.GYM = "gym"`, listed in `UNRELEASED_MODULES` until the release CR | 11-contracts §1.1 |
| Django app | `apps/gym`, label `gym`, tables `gym_*` | 10-architecture §2.1 |
| Frontend folder | `frontend/src/modules/DigiKhaato/features/gym/{api,components,hooks,redux,types,constants,view-model,validation}` | 10-architecture §2.1, §6 |
| App pages | `frontend/app/(app)/gym/…` | §7 of 10-architecture |
| API prefix | `/api/v1/gym/` | 10-architecture §7 |
| Module dependencies | `MODULE_DEPENDENCIES["gym"] = {"parties", "ledger", "payments", "sales"}` | 10-architecture §2.3 |
| Engines used | `ENGINES_USED_BY["gym"] = {"dues", "attendance"}`. The import matrix also allows `bookings`; the MVP does not use it | 10-architecture §2.3, §10.1 |
| Imports allowed | `CORE ∪ {dues, attendance, bookings}`; never `sales`, `purchases`, `inventory`, `expenses` or another vertical, **deferred imports included** | 10-architecture §3, §10.1 |
| Money | Gym posts **nothing** to the ledger directly. Every rupee is a sales document through the port (11-contracts §1.5) or a payment (§1.4) | 11-contracts §1.2 ("Gym and hospitality post nothing directly") |

### 0.2 Registrations in `GymConfig.ready()`

Every upward call is a registry (ADR-042). The gym registers exactly these; each has a contract test
(10-architecture §11).

| # | Registry (10-architecture §4.2) | What gym registers | Feature |
|---|---|---|---|
| R4 | `register_module_off_guard` | Counters: memberships active, upcoming or frozen today; open visits of `module="gym"` are the attendance engine's own counter | GYM-01 |
| R5 | `register_origin("gym_membership", module="gym", listener=GymMembershipOrigin())` | `on_void`, `on_settlement_changed`, `check_void` | GYM-06 |
| R6 | `register_party_role("gym_member", …)`, `register_party_role("gym_trainer", …)`, `register_archive_guard("gym", …)` | Role filters and badges; archive refused while a party is the member or payer of an open term | GYM-02, GYM-18 |
| R7 | `register_reminder_source("gym_membership", module="gym", candidates=…)`, `register_reminder_policy("gym", …)` | Expiry and renewal notices | GYM-17 |
| R8 | `register_dashboard_section("gym.today", …)`, `("gym.money", …)` | Dashboard tiles | GYM-19 |
| R9 | `register_report("gym.<key>", …)` × 12 | Reports | GYM-20 |
| R10 | `register_schedule(Schedule("gym.daily", period="daily", at_hour_ist=1, minute=10))` | Enquiry purge, notification of renewals due | GYM-03, GYM-17 |
| R11 | `register_number_kind("gym_member", module="gym", mode="perpetual", default_prefix="M-", padding=4, label_id="gym.numbering.member")` | Member codes | GYM-02 |
| R13 | `tenant_data.register(...)` for every `gym_*` table | Export and deletion | all |
| R14 | `job_handler("gym.daily_for_tenant")` | The per-tenant fan-out of R10 | GYM-03, GYM-17 |
| R15 | dues `register_subject("gym_membership", module="gym", label=…, on_due_changed=…, reminder_template_key="gym.instalment")` | Instalment dues | GYM-07 |
| R15 | attendance `register_checkin_policy("gym_membership", module="gym", policy=…)`, `register_mark_listener("gym_membership", module="gym", on_marked=…)` | Eligibility and freeze-ending override | GYM-14, GYM-15, GYM-18 |
| R16 | `register_notification_type("gym.renewals_due", …)` | One in-app row a day | GYM-17 |

The gym registers **no** posting source and **no** allocation target: it posts nothing and payments
settle sales documents (11-contracts §1.4 "Charge-mode dues that raised a sales document are not
targets").

### 0.3 Data model overview

```
parties_party ──1:1── gym_member ──< gym_membership >── gym_plan
      │   (member_party)   │                │  │  └──< gym_membership_freeze
      │                    │                │  ├──< gym_membership_extension >── gym_closure
      │ parties_relation   │                │  └──< gym_membership_document  (document_id → sales_document, by uuid)
      │ (guardian, payer)  │                │
      ├──1:1── gym_trainer │                ├── dues_schedule (instalments, FK: vertical → engine)
      │                    │                ├── attendance_entitlement (session packs, FK)
      │                    │                └── attendance_mark.context_id (engine → vertical, by uuid)
      └── gym_enquiry.party_id (set on conversion; an enquiry is not a party)
gym_batch ──1:1── attendance_group (presence) ──< attendance_group_member (the enrolment)
```

Tables owned by gym (each detailed in the §5 of the feature that owns it): `gym_member` (GYM-02),
`gym_enquiry`, `gym_enquiry_followup` (GYM-03), `gym_plan` (GYM-04), `gym_membership`,
`gym_membership_document` (GYM-05, GYM-06), `gym_membership_freeze` (GYM-09),
`gym_membership_extension`, `gym_closure` (GYM-10), `gym_batch` (GYM-15), `gym_trainer` (GYM-18).

Conventions (10-architecture §5, restated only where they bite): every table extends `TenantModel`
(UUIDv7 `id`, `tenant` RESTRICT, `created_by`, timestamps); FKs to `parties.Party` are `RESTRICT`;
profile tables use `OneToOneField("parties.Party", on_delete=RESTRICT, related_name="+")`; no FK from
gym to `sales_document` (gym may not import sales — the link is a `uuid` plus the port's
`document_summaries`); money is `MoneyField` (`numeric(14,2)`); business dates are tenant-local
`date`; mutable rows two people can edit carry `version` (409 `stale_version`); per-tenant
uniqueness is a partial unique index including `tenant`.

### 0.4 Membership status (derived, never stored as a nightly flag)

A term has a **stored `state`**: `active` (not terminated), `cancelled`, `transferred`, `changed`
(upgraded or downgraded). Everything time-based is **derived** for a day `d` (research §6.2), in this
order, and the same function serves the API, the check-in policy, the lists and the reports:

| Order | Status | Condition on day `d` |
|---|---|---|
| 1 | `cancelled` / `transferred` / `changed` | `state` is terminal **and** `d > ended_on` |
| 2 | `frozen` | a freeze of the term covers `d` (`start_on ≤ d ≤ coalesce(actual_end_on, planned_end_on)`) |
| 3 | `upcoming` | `d < start_on` |
| 4 | `active` | `d ≤ end_on` and (the plan has no session count, or `used < sessions_total`) |
| 5 | `in_grace` | `d ≤ end_on + grace_days` and the term was not exhausted by sessions |
| 6 | `expired` | otherwise |

A **member's status** is the best status of their *access* terms (plan category `access` or `trial`,
GYM-04) in the order `active > frozen > in_grace > upcoming > expired`, or `never_joined` when they
have none. Class and PT terms show on the member page but do not decide the member's status. The
function lives once, in `apps/gym/services/terms.py` (`term_status(term, on, *, grace_days,
freezes, used)`), and once more as a SQL expression in `apps/gym/selectors/status.py` for lists;
`test_status_sql_matches_python` fuzzes both over the same rows (the LED-03 "second route" rule).

"Lapsed" in reports and on the dashboard means **expired and not renewed** — a member whose status is
`expired`. The UI word is "Expired" / "खत्म".

### 0.5 Error codes

Every code is registered in `apps/common/error_codes.py` and Part 22 §22.1.1, named
`<subject>_<condition>` (§22.1.2). **Reused** (same state, same meaning): `validation_error`,
`not_found`, `permission_denied`, `module_disabled`, `stale_version`, `duplicate_code`,
`override_not_allowed`, `document_not_open`, `party_archived`, `credit_limit_exceeded`,
`over_allocated`, `pause_limit_reached` (a freeze beyond the plan's days or count is the same state
as a dues pause beyond its limit), and the engine and port codes `attendance_blocked`,
`attendance_duplicate`, `entitlement_exhausted`, `document_origin_locked`, `party_has_open_records`,
`reminder_cap_reached`.

**New, gym-owned:**

| # | Code | HTTP | `details` | Raised when | Feature |
|---|---|---|---|---|---|
| E1 | `membership_overlap` | 409 | `membership_id`, `next_start_on` | A new access term would overlap another access term of the same member | GYM-05, GYM-08, GYM-12 |
| E2 | `membership_not_open` | 409 | `status` | Freeze, change, transfer, cancel or extend a term whose derived status does not allow it | GYM-09…GYM-13 |
| E3 | `plan_retired` | 409 | `plan_id` | A sale or renewal names a retired plan | GYM-04, GYM-05 |
| E4 | `plan_not_priced` | 409 | `plan_id` | A sale names a plan whose price is not set yet (seeded plans, GYM-01) | GYM-04, GYM-05 |
| E5 | `freeze_overlaps_visit` | 409 | `on_date`, `mark_id` | A freeze would start on or before a day the member already checked in within the freeze window | GYM-09 |
| E6 | `freeze_ended` | 409 | `actual_end_on` | Resume or remove a freeze that has already ended | GYM-09 |
| E7 | `closure_overlap` | 409 | `closure_id`, `from_on`, `to_on` | A bulk closure overlaps an existing closure | GYM-10 |
| E8 | `batch_full` | 409 | `capacity`, `enrolled` | Enrolment beyond a batch's capacity without the over-capacity override | GYM-15 |
| E9 | `enquiry_converted` | 409 | `party_id` | Converting an enquiry a second time | GYM-03 |
| E10 | `transfer_disabled` | 409 | — | Transfer while the tenant setting `gym.transfer_allowed` is off | GYM-12 |
| E11 | `refund_exceeds_paid` | 409 | `paid`, `refundable` | A refund above what was paid on the term's documents less what the credit must first clear | GYM-13 |
| E12 | `id_number_not_allowed` | 400 | `field` | A free-text gym field contains a 12-digit sequence (an Aadhaar-shaped number) | GYM-21 |

### 0.6 Audit actions

Constants on `AuditAction`, one `write_audit` row per logical event in its transaction
(10-architecture §5): `gym.member.created|updated|erased`, `gym.enquiry.created|followed_up|converted|lost|purged`,
`gym.plan.created|updated|retired`, `gym.membership.sold|renewed|voided|frozen|resumed|freeze_removed|extended|changed|transferred|cancelled|refunded|override_used`,
`gym.closure.created|reversed`, `gym.batch.created|updated|retired|enrolled|unenrolled`,
`gym.trainer.created|assigned|retired`, `gym.settings.updated`. Engine and port actions
(`attendance.mark.*`, `dues.schedule.*`, `invoice.*`, `credit_note.*`, `payment.*`) are written by
their owners; gym never duplicates them.

### 0.7 Permission codenames and the role matrix

Declared once in `apps/common/permissions_registry.py` (strings only, rule L4); `MODULE_OF` derives
`gym`, so every codename disappears when the module is off. Adding them amends canon §0.9 and needs a
CR (the registry test compares it string for string). **Business ceilings are role checks, not
codenames** (CLAUDE.md, LED-03 rule): the refund (owner only), the override of a blocked credit limit
(owner/admin, existing), voiding a check-in on an earlier day (owner/admin) and backdating a sale or a
freeze beyond the staff window (owner) are checked against `ctx.role`.

| Codename | Owner | Admin | Staff (front desk) | Accountant | `gym_trainer` (module role) |
|---|---|---|---|---|---|
| `gym.member.read` | ✅ | ✅ | ✅ | ✅ | ✅ **scoped** (GYM-18) |
| `gym.member.read_all` (scope bypass, ADR-052) | ✅ | ✅ | ✅ | ✅ | ❌ |
| `gym.member.write` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `gym.member.contact` (mobile, email, emergency contact, guardian contact) | ✅ | ✅ | ✅ | ✅ | ❌ (grantable) |
| `gym.member.erase` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `gym.enquiry.read` | ✅ | ✅ | ✅ | ❌ (removed from the accountant set, GYM-21) | ❌ |
| `gym.enquiry.write` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `gym.plan.manage` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `gym.membership.sell` (new, renewal, rejoin) | ✅ | ✅ | ✅ | ❌ | ❌ |
| `gym.membership.money_read` (prices, dues, document links) | ✅ | ✅ | ✅ | ✅ | ❌ |
| `gym.membership.freeze` (within plan limits) | ✅ | ✅ | ✅ | ❌ | ❌ |
| `gym.membership.override` (limits, dates, price, check-in refusal) | ✅ | ✅ | ❌ (grantable) | ❌ | ❌ |
| `gym.membership.extend` (incl. closures) | ✅ | ✅ | ❌ | ❌ | ❌ |
| `gym.membership.change` (upgrade, downgrade, transfer) | ✅ | ✅ | ❌ | ❌ | ❌ |
| `gym.membership.cancel` (cancel; a refund additionally needs the owner **role**) | ✅ | ✅ | ❌ | ❌ | ❌ |
| `gym.checkin.write` | ✅ | ✅ | ✅ | ❌ | ✅ scoped: roll-call of own batches, PT sessions of own clients |
| `gym.checkin.void` (same day; earlier days need owner/admin role) | ✅ | ✅ | ✅ | ❌ | ❌ |
| `gym.batch.manage` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `gym.reports.read` | ✅ | ✅ | ✅ | ✅ | ❌ |
| `gym.settings.manage` | ✅ | ✅ | ❌ | ❌ | ❌ |

The staff set in `permissions_registry._STAFF` gains every ✅ in the Staff column; the accountant set
is `.read` codenames plus `gym.member.read_all`, `gym.member.contact`, `gym.membership.money_read`,
`gym.reports.read`, **minus** `gym.enquiry.read` (an accountant has no purpose for a prospect's
mobile). `gym_trainer` is a system `platform_role` row (`tenant=NULL`, `is_system=True`,
`code="gym_trainer"`), assignable only while gym is enabled, holding exactly `gym.member.read` and
`gym.checkin.write` — **no** `parties.*`, `ledger.*`, `payments.*`, `sales.*` or `reports.*`
codename (ADR-052, 11-contracts §3). The role is proposed and needs the owner's confirmation
(10-architecture §16 item 1).

### 0.8 Frontend shell

- **Routes** (added to `ROUTES` in `src/routes.ts`, the prefix `/gym` to `GUARDED_ROUTE_PREFIXES`
  and `CRAWL_DISALLOW`): listed per feature in §7. `tests/routes.test.ts` asserts every `ready` nav
  item has a page.
- **Navigation** (`sidebarConfig.ts`, `module: "gym"`): Check-in (`/gym/check-in`,
  `gym.checkin.write`), Members (`/gym/members`, `gym.member.read`), Renewals (`/gym/renewals`,
  `gym.member.read_all`), Enquiries (`/gym/enquiries`, `gym.enquiry.read`), Batches
  (`/gym/batches`, `gym.checkin.write`), Plans (`/gym/plans`, `gym.plan.manage`). With a second
  vertical on, they group under "Gym" (`group` field, 10-architecture §6 item 2). A trainer sees only
  Members (their own) and Batches.
- **Client `ModuleCode`** list is replaced with the server's by the first module's change
  (10-architecture §6 item 3); gym depends on it.
- **Slices are lazily injected only** (`slice.injectInto(rootReducer)`, CR-134 pattern), none in
  `store.ts`'s static reducers; `bundle-budgets.json`'s `sharedApp` budget must not move.
- **Forms and drawers are `dynamic()`** so they load with the chunk that opens them (CLAUDE.md:
  +58.6 KB on `/parties/[id]` when the correction drawer was static). The check-in screen's search and
  result cards are **not** lazy — they are what the desk taps first.
- **Services** `api/gym<X>Service.ts`; thunks with `createAsyncThunk`; React Hook Form with schemas
  from the central `useValidationSchemas()`; errors through the global snackbar; invalidations in
  `src/redux/invalidation/{registry,map}.ts`. No TanStack Query.
- **Design system only** (`Ub*`; no raw `div`/`span`/`h1`, `react/forbid-elements`). Two new shared
  components move into `src/design-system/` because a second feature needs them: `UbQrCode` (today
  `features/sales/components/print/UbQrCode.tsx`, which gym may not import, 10-architecture §6 item 7)
  and `UbCameraScanner` (GYM-16).
- **Locales**: `locales/catalogues/gym.{en,hi}.json`, prefix `gym.`; `split-locales.mjs` and
  `check-locales.mjs` keep them in step. Hindi uses ordinary words (vision §4). Core vocabulary used
  throughout:

| Key | English | Hindi |
|---|---|---|
| `gym.member` | Member | सदस्य |
| `gym.membership` | Membership | सदस्यता |
| `gym.plan` | Plan | प्लान |
| `gym.checkIn` | Check in | एंट्री करें |
| `gym.status.active` | Active | चालू |
| `gym.status.inGrace` | In grace | छूट के दिन |
| `gym.status.expired` | Expired | खत्म |
| `gym.status.frozen` | Frozen | रुकी हुई |
| `gym.status.upcoming` | Starts {date} | {date} से शुरू |
| `gym.renew` | Renew | फिर से लें |
| `gym.freeze` | Freeze | रोकें |
| `gym.joiningFee` | Joining fee | दाखिला फ़ीस |
| `gym.dues` | Due | बाकी |
| `gym.enquiry` | Enquiry | पूछताछ |
| `gym.batch` | Batch | बैच |
| `gym.trainer` | Trainer | ट्रेनर |
| `gym.upgrade` | Change plan | प्लान बदलें |
| `gym.refund` | Refund | पैसे वापस |

- **Customer documents** (the card, prepared texts) extend
  `customerDocumentsCarryNoProductName.test.tsx`: tenant name only, never YourKhata's name or domain.

### 0.9 Tenant settings

Stored in `platform_tenant_setting` under `gym.*`, read with defaults, written by
`PATCH /api/v1/gym/settings` (`gym.settings.manage`, audit `gym.settings.updated`). The full list with
defaults is the [Defaults the owner may change](#defaults-the-owner-may-change) table; each feature's
§9 names the keys it reads.

### 0.10 Lock order

The global order is **party → documents → payments → stock → sequence**, with engine rows after
documents and before payments (11-contracts, notation). Gym rows go **after the party and before
documents**: payer party (`parties.services.balance.lock_party`) → `gym_member` of the member (the
per-member serialiser for overlap checks, because ADR-049 rules out an exclusion constraint) →
`gym_membership` rows in `(start_on, id)` order → documents (inside the port) → engine rows
(`dues_*`, `attendance_entitlement`) → payments → sequence. When member and payer differ only the
payer's party row is locked (only its balance moves); the `gym_member` row serialises the member.

---

## GYM-01 — Module switch, settings and presets

### 1. Product requirements
A gym, studio or academy owner turns the gym module on and is ready to sell within minutes: default
plans exist (unpriced), the settings have sensible values, the front-desk attendance group exists, and
the module's pages appear in the menu. Switching off is refused while there are open memberships
(10-architecture §9). Success: a new tenant sells its first membership in under five minutes from
switching the module on; zero tenants see a gym page before the release CR.

### 2. User flows
- **F-1 Switch on.** Settings → Features → Gym → On. The server checks the plan and partner, then
  `MODULE_DEPENDENCIES` (parties, ledger, payments, sales must be on; until the onboarding checklist
  of shared-engines §5.2 ships, the refusal names the missing module), switches on, and runs the gym
  preset seed (BR-3) in the same transaction. The menu gains the gym items on the next
  `enabled_modules` read.
- **F-2 First-run banner.** `/gym/plans` shows "Set your prices to start selling" over the seeded
  plans, each with a "Set price" chip, until at least one plan is priced.
- **F-3 Settings.** `/settings/gym` — grace days, renewal start rule, rejoin-fee gap, check-in rules,
  reminder offsets, trainer contact visibility, enquiry retention, transfers allowed.
- **F-4 Switch off.** Refused with 409 `module_has_data` and the count while any term is active,
  upcoming or frozen today, or a visit is open; otherwise allowed, and nothing is deleted.

### 3. Features
**MVP:** switch on/off through the existing `update_enabled_modules`; release gate; preset seed;
settings screen; module-off guard. **Later:** the onboarding checklist that switches dependencies on
automatically and the business-type picker (shared-engines §5.2; ships with the first released
vertical, 10-architecture §13.2 item 5); a "sports academy" preset with an 18% default tax code
(research Q17, pending the CA, [T2](#tax-review-items-for-a-ca)).

### 4. Entities and relationships
No gym entity of its own. Uses `platform_tenant.enabled_modules`, `platform_tenant_setting` (`gym.*`),
`gym_plan` (seeded rows), `attendance_group` (two seeded rows: the front desk and personal training).

### 5. Database
No new table. Seeded rows (idempotent, keyed so a second run writes nothing):

| Table | Rows | Key |
|---|---|---|
| `gym_plan` | Monthly (1 month), Quarterly (3 months, freeze ≤ 15 days × 1, min 7), Yearly (12 months, freeze ≤ 30 days × 2, min 7), 12-session pack (sessions 12, valid 60 days); all `category` as named in GYM-04, `price NULL`, `tax_code 'GST5'`, `sac '999723'`, `price_includes_tax true`, `joining_fee 0` | `(tenant, seed_key)` — `gym_plan.seed_key varchar(24) null`, partial unique where not null |
| `attendance_group` | "Front desk": `module='gym'`, `subject_type='gym_desk'`, `subject_id=tenant.id`, `mark_kind='visit'`, `dedupe_minutes=180`, `one_per_day=false`, `edit_window_hours=24`. "Personal training": same, `subject_type='gym_pt'`, `dedupe_minutes=30` | `(tenant, module, subject_type, subject_id)` looked up before insert |
| `platform_tenant_setting` | none written; defaults are read-time | — |

### 6. API
Existing: `GET /api/v1/settings/modules`, `PATCH /api/v1/settings/modules` (unchanged shape).
New: `GET /api/v1/gym/settings` → `{data: {grace_days: 5, renewal_start: "continuous_within_grace", …}}`
(every key of the defaults table, resolved); `PATCH /api/v1/gym/settings` with any subset, validated
per key (400 `validation_error`, `details.<key>`), `If-Match` version (409 `stale_version`).
Errors: `module_disabled` (403, gym off or unreleased), `module_has_data` (409, switch-off),
`permission_denied`.

### 7. Frontend
Route `/settings/gym` (`app/(app)/settings/gym/page.tsx`), page `GymSettingsPage`, lazy slice
`gymSettingsSlice`, service `api/gymSettingsService.ts` (`getSettings`, `updateSettings`). The module
row in Settings → Features is the existing screen. Nav rows as in §0.8.

### 8. UI/UX
One scrolling form in `UbPanel` sections (Memberships, Check-in, Reminders, Trainers, Enquiries),
single column below `sm`, a sticky Save bar on phones (`env(safe-area-inset-bottom)`). Each numeric
setting is `UbQuantityInput` with the unit in the addon ("days"). Each choice is `UbRadioGroup` with a
one-line consequence under each option ("Renewals made within grace start the day after expiry, so no
days are lost"). Copy: `gym.settings.title` "Gym settings" / "जिम की सेटिंग"; `gym.settings.graceDays`
"Grace days after expiry" / "खत्म होने के बाद छूट के दिन".

### 9. Validation and business rules
- BR-1 The code `gym` is invisible (not in `available`, `locked` or `enabled`) and refused by
  `update_enabled_modules` and `ModuleEnabled` while in `UNRELEASED_MODULES`, unless
  `UB_UNRELEASED_MODULES=1` (development, CI, the e2e stack).
- BR-2 Switch-on requires the four dependencies on; the refusal is the existing one.
- BR-3 The preset seed writes only gym's own rows (above) and touches no other module's settings
  (shared-engines §5.5); a second run writes nothing (`test_gym_preset_is_idempotent`). It runs from
  the module-enable hook that 00-core-and-engines CQ-14 proposes
  (`register_module_enable_hook("gym", seed_gym_presets)`, inside `update_enabled_modules`'
  transaction); until that hook exists, the gym's first request after switch-on runs the same
  idempotent seed under the tenant lock.
- BR-4 Switch-off blocking rows (10-architecture §9): terms whose derived status today is `active`,
  `upcoming` or `frozen` (a member in grace does not block: their term has ended), plus the
  attendance engine's open-visit counter for `module="gym"` and the dues engine's counter (schedules
  `active`/`paused`, dues `due`/`overdue` with `module="gym"`). Closed history never blocks.
- BR-5 Settings validation: `grace_days` 0–30; `rejoin_fee_after_days` 0–3650; reminder offsets a set
  of up to 6 integers in −60…+60; `checkin_dedupe_minutes` 0–720; `enquiry_retention_days` 30–730;
  `backdate_sale_days` 0–90; `backdate_freeze_days` 0–30; `renewal_start` one
  of `continuous_within_grace | always_from_expiry | always_from_today`; `dues_checkin_rule` one of
  `show | warn | block_after_days`, with `dues_block_days` 1–365 when `block_after_days`.
- BR-6 Changing `checkin_dedupe_minutes` updates the two seeded attendance groups' `dedupe_minutes`
  in the same transaction (the engine reads the group, not the setting).

### 10. Permissions
Switching modules: `platform.tenant.manage` (existing). Reading gym settings: any `gym.*` holder
(the desk needs grace days to explain a banner). Writing: `gym.settings.manage`.

### 11. Reports
None of its own. The audit log shows `gym.settings.updated` with before/after.

### 12. Testing
- T-GYM-01-1 `test_gym_absent_from_modules_view_while_unreleased` — the in-app rule.
- T-GYM-01-2 `test_switch_on_refused_without_sales` — dependency refusal names `sales`.
- T-GYM-01-3 `test_gym_preset_is_idempotent` — two runs, same rows.
- T-GYM-01-4 `test_module_off_guard_counts_open_terms_only` — 0 for an empty tenant; a tenant whose
  only term expired beyond grace is not blocked; one frozen term blocks with count 1.
- T-GYM-01-5 `test_dedupe_setting_moves_both_groups` (BR-6).
- e2e `gym.mjs` check "module on seeds four unpriced plans and the menu shows Check-in".

### 13. Edge cases
- EC-1 Switched off with no open terms, then on again: nothing is re-seeded (BR-3 keys), history is
  back (PLT-06 BR-4).
- EC-2 Sales switched off while gym is on: the existing dependency check refuses switching sales off
  (sales is a dependency). If a legacy tenant somehow has it off, `issuer_available` is false and a
  sale returns 403 `module_disabled` with `details.module = "sales"`; the sale screen shows the
  message and no partial row is written.
- EC-3 Two owners save settings at once: `stale_version` on the second.

### 14. Future
The onboarding checklist and business-type picker; per-branch settings when branches exist; a
"sports academy" preset (18% default, CA-dependent).

---

## GYM-02 — Members, guardians and payers

### 1. Product requirements
A member is a `parties_party` with a `gym_member` profile (ADR-046: the profile **is** the role). A
guardian (for a minor) and a payer (parent, spouse, employer) are ordinary parties linked through the
core `parties_relation` table (11-contracts §1.3). There is no second contacts table. The desk can
find a member by name, the last digits of a mobile, or the member code. Success: every member, guardian
and payer is one party row; the members list answers any status filter in < 300 ms p95 at 5,000
members.

### 2. User flows
- **F-1 Create member** (drawer from Members or from the sale screen): name, mobile, optional photo,
  date of birth or an "Under 18" switch, guardian (pick or create a party) when under 18, emergency
  contact, source, consent (GYM-21). Save creates or links the party, creates `gym_member` with the
  next member code, and the guardian relation.
- **F-2 Existing party becomes a member.** Picking a party that already exists (a shop customer)
  creates only the profile: one contact per person across modules.
- **F-3 Set a payer.** Member page → "Paid by" → pick a party → relation `payer`. New sales default to
  that payer (BR-6).
- **F-4 Find.** Members list: search, status chips with counts, filters in the URL (the PTY-05
  lesson: filters live in the address bar).
- **F-5 Member page** `/gym/members/[id]`: header (photo, name, code, status badge, end date, sessions
  left, dues), terms timeline, visits, guardian and payer, actions.

### 3. Features
**MVP:** profile, member code, photo, minor + guardian, payer relation, list with filters, member
page, party-page panel ("Gym: Active till 31 Dec") through the frontend module-panel registry,
archive guard. **Later:** merge duplicate members (core party merge already exists; the profile merge
rule is later), family groups, member import (GYM-23).

### 4. Entities and relationships
`parties_party` (member, guardian, payer) 1 — 0..1 `gym_member`; `parties_relation` (member → guardian,
kind `guardian`; member → payer, kind `payer`); `files_attachment` (`owner_type = "gym_member"`,
`owner_id = gym_member.id`) for the photo; `gym_member` 1 — * `gym_membership`.

### 5. Database
`gym_member`

| Column | Type | Constraint / note |
|---|---|---|
| `party` | `OneToOneField(Party, RESTRICT, related_name="+")` | unique `(tenant, party)` |
| `member_code` | `varchar(24)` | NOT NULL; unique `(tenant, member_code)`; from `allocate_counter(kind="gym_member")` |
| `date_of_birth` | `date` null | not in the future; age 3–100 |
| `is_minor` | `bool` default false | when `date_of_birth` is set, the server derives it on every read and write (BR-3) |
| `gender` | `varchar(8)` null | `female`, `male`, `other`; accepted only when `gym.collect_gender` is on (GYM-21) |
| `emergency_contact_name` | `varchar(80)` default `''` | |
| `emergency_contact_phone` | `varchar(15)` default `''` | party mobile rule |
| `photo_file_id` | `uuid` null | a `files_attachment` id with `owner_type='gym_member'` |
| `joined_on` | `date` null | first ever access term start (set by GYM-05) |
| `source` | `varchar(12)` | `walk_in`, `phone`, `referral`, `social`, `enquiry`, `other` |
| `enquiry` | FK `gym_enquiry` SET NULL, null | the converted enquiry |
| `health_declaration_on` | `date` null | GYM-21: the date only |
| `id_seen_type` | `varchar(16)` null | GYM-21: `aadhaar_card`, `pan`, `driving_licence`, `voter_id`, `passport`, `other` — the type seen, never a number |
| `id_seen_on` | `date` null | CHECK both id fields null or both set |
| `guardian_consent_party` | FK `parties.Party` RESTRICT, null | GYM-21 |
| `guardian_consent_at` | `timestamptz` null | |
| `guardian_adult_confirmed` | `bool` default false | |
| `consent_notice_version` | `varchar(16)` default `''` | the notice text version consented to |
| `default_trainer_party` | FK `parties.Party` RESTRICT, null | a party with a `gym_trainer` profile |
| `profile_erased_at` | `timestamptz` null | GYM-21 erasure |
| `version` | `int` default 1 | optimistic concurrency |

CHECK `ck_gym_member_minor_consent`: `NOT is_minor OR (guardian_consent_party_id IS NOT NULL AND
guardian_consent_at IS NOT NULL AND guardian_adult_confirmed)`. Indexes: `(tenant, member_code)`
(unique), `(tenant, party)` (unique), `(tenant, joined_on)`. The check-in search (GYM-14) reads
`parties_party` through its existing trigram indexes, `ix_party_name_upper_trgm`
(`GIN (upper(name) gin_trgm_ops)`) and `ix_party_mobile_trgm` (`GIN (mobile gin_trgm_ops)`, which
serves a `LIKE '%4821'` suffix match); no core index is added.

`parties_relation` (core, 11-contracts §1.3) rows: `(party=member, related_party=guardian,
kind='guardian', receives_messages=true)`, `(party=member, related_party=payer, kind='payer',
receives_messages=false)`.

### 6. API
- `GET /api/v1/gym/members?q=&status=&plan_id=&category=&batch_id=&trainer_id=&has_dues=&expiring_within=&not_visited_days=&joined_from=&joined_to=&tag=&ordering=&page=`
  → `{data: [MemberRow], meta: {page, total, counts: {active, in_grace, expired, frozen, upcoming, never_joined}}}`.
  `MemberRow = {id, party_id, member_code, name, mobile?, photo_url?, status, end_on, sessions_left, plan_name, last_visit_on, dues?}`;
  `mobile` needs `gym.member.contact`, `dues` needs `gym.membership.money_read` (RestrictedFieldsMixin).
  Default ordering `end_on` ascending for active; `ordering ∈ {end_on, -end_on, name, last_visit_on, -dues, joined_on}`.
- `POST /api/v1/gym/members` `{party_id? | party: {name, mobile, email?}, date_of_birth?, is_minor?, guardian_party_id? | guardian: {name, mobile}, emergency_contact_name?, emergency_contact_phone?, source, consent: {...}}`
  → 201 `{data: Member}`. Idempotency key required.
- `GET /api/v1/gym/members/{id}` → `{data: Member, terms: [...], relations: [...], summary: {status, end_on, sessions_left, dues?, last_visit_on}}`.
- `PATCH /api/v1/gym/members/{id}` (`If-Match`), `POST /api/v1/gym/members/{id}/photo` (multipart,
  through `files`), `DELETE /api/v1/gym/members/{id}/photo`.
- `POST /api/v1/gym/members/{id}/relations` `{kind, related_party_id | party:{name, mobile}}` and
  `DELETE …/relations/{rid}` — call the core relations service under the gym codename
  (`gym.member.write`), so the desk needs no `parties.party.write` for it.
- Errors: `validation_error` (`details.guardian_party_id: ["A member under 18 needs a guardian."]`),
  `duplicate_code`, `stale_version`, `party_archived`, `party_has_open_records` (archive from core).

### 7. Frontend
Routes `/gym/members` (`MembersListPage`), `/gym/members/[id]` (`MemberPage`). Lazy slices
`gymMemberListSlice`, `gymMemberDetailSlice`; services `api/gymMemberService.ts` (`list`, `get`,
`create`, `update`, `uploadPhoto`, `removePhoto`, `addRelation`, `removeRelation`). Drawer
`MemberFormDrawer` (`dynamic()`). Hook `useMemberListUrl` (filters ↔ URL, the `usePartyListUrl`
pattern). Party-page panel `GymMemberPanel` registered in `features/parties/modulePanels.ts`.

### 8. UI/UX
- **Members list** — `UbDataGrid` with the card layout below `md`: photo disc (initials when none —
  never for a non-person, the PTY-05 lesson), name owning its line (`line-clamp-2`, the LED-03 rule),
  a caption line "M-0142 · Quarterly · till 31 Dec", status `UbStatusBadge` in the caption, not beside
  the name. Status chips over the filtered set with counts (PTY-02); a pressed chip never disappears
  when narrowing (the PTY-06 lesson: counts of the filtered set can be zero for the pressed chip).
- **Status tones:** active `success`, in grace `warning` ("Expired 3 days ago · renew"), frozen
  `info`, upcoming `default`, expired `danger`. Always the word with the colour.
- **Member page on a phone:** header card, then the primary action row (Check in · Renew · ⋯) — at
  most two buttons plus ⋯ at 360 px (the LED-02 275 px lesson); Freeze, Change plan, Transfer, Cancel,
  Card live in the ⋯ sheet.
- **Hindi:** `gym.members.title` "Members" / "सदस्य"; `gym.member.guardian` "Guardian" / "अभिभावक";
  `gym.member.paidBy` "Paid by" / "भुगतान करने वाले"; `gym.member.under18` "Under 18" / "18 साल से कम".

### 9. Validation and business rules
- BR-1 Name 2–160 characters and mobile a 10-digit Indian mobile (the party rules). A mobile is
  required for the member **or** their guardian (a child may have none).
- BR-2 A party has at most one `gym_member` (unique). Creating a member for a party that has one
  returns the existing profile with 200, not a duplicate.
- BR-3 `is_minor` = age < 18 on today's date when `date_of_birth` is set; otherwise the stored switch.
  A member who turns 18 stops needing a guardian from that day; the relation stays.
- BR-4 A minor needs a guardian relation to a different party who is not a minor, plus the recorded
  guardian consent (GYM-21). The guardian is the default payer and receives reminders
  (`receives_messages = true`).
- BR-5 Member code: `allocate_counter(kind="gym_member")` → `M-0001`…; editable once, for an imported
  member only (GYM-23); `duplicate_code` if taken.
- BR-6 Default payer for a new sale: the member's `payer` relation → else the guardian if a minor →
  else the member.
- BR-7 **Archive guard** (`register_archive_guard("gym", …)`): archiving a party is refused with 409
  `party_has_open_records` (`module="gym"`, `count`, `label_id="gym.archive.openTerms"`) while the
  party is the member **or the payer** of a term whose status today is active, upcoming, frozen or in
  grace. The existing `balance ≠ 0` guard stays (PTY-04).
- BR-8 Party role registrations: `gym_member` → `party_ids(tenant) = gym_member.party_id` (all
  profiles, including erased ones); `GET /parties?role=gym_member` then works in core with no import.
- BR-9 Photo: optional, JPEG/PNG/WebP, compressed client-side to ≤ 300 KB (the LED-01 rule), stored
  through `files`; removable without touching the member (GYM-21).

### 10. Permissions
Read: `gym.member.read` (scoped for trainers). Contact fields: `gym.member.contact`. Create, edit,
photo, relations: `gym.member.write`. Archive is the core party action (`parties.party.delete`)
with the gym guard.

### 11. Reports
The members list with its filters is exportable as CSV (`gym.member.read_all` + `reports.export`);
contact columns only with `gym.member.contact`. "Active members" (GYM-20) counts from here.

### 12. Testing
- T-GYM-02-1 `test_member_is_one_party_across_modules` — a shop customer becomes a member with no new party.
- T-GYM-02-2 `test_minor_needs_guardian_and_consent` — the CHECK and the service agree.
- T-GYM-02-3 `test_archive_refused_for_payer_of_open_term` (BR-7) — and allowed once the term expired beyond grace.
- T-GYM-02-4 `test_mobile_absent_without_contact_codename` — the key is absent, not `null`.
- T-GYM-02-5 `test_member_list_plan` — `EXPLAIN` of the default list and of `status=expired` uses the indexes (the `test_party_list_plans.py` pattern).
- T-GYM-02-6 `test_member_list_filters_hit_the_network` — e2e asserts the request, not the chip (the PTY-02 warm-up lesson).

### 13. Edge cases
- EC-1 Shared family mobile (research E4): parties allow it; search shows every match with photos.
- EC-2 The guardian is also a member (a parent who trains): two profiles, one relation; fine.
- EC-3 A payer with a GSTIN (employer): invoices become B2B through sales' own rules (GYM-06).
- EC-4 A member party archived through core while only an expired term exists: allowed; the member
  page shows "Archived" and offers Restore.
- EC-5 Same person at two gyms (two tenants): two parties; nothing shared (research E5).
- EC-6 Date of birth making the member 17 at sale and 18 a month later: the guardian stays on record;
  reminders go to the member from their 18th birthday unless the relation is kept with
  `receives_messages`.

### 14. Future
Profile merge on party merge; family groups with one payer; member import (GYM-23); birthday
greetings are **not** planned (they need everyone's date of birth, against minimisation).

---

## GYM-03 — Enquiries

### 1. Product requirements
The desk records a walk-in or phone enquiry, follows it up and converts it into a member. An enquiry
is **not a party** (ADR-046): it holds a name and a mobile, a status and follow-ups, **and nothing
else about the person** — no address, no money, no documents, never a payer. Lost enquiries are purged
after the tenant's retention period (default 180 days). Success: conversion is measurable
(joined ÷ enquiries by source) and no enquiry ever appears in the parties list.

### 2. User flows
- **F-1 Record**: name, mobile, interest, source, follow-up date (default tomorrow), assigned to (a
  team member, default me), optional first follow-up note.
- **F-2 Follow up**: from the dashboard's "Follow-ups today" or the list, log an attempt (outcome,
  note, next date). Outcome `not_interested` offers "Close as lost" with a reason.
- **F-3 Trial**: "Start trial" sells a trial plan (price 0, GYM-04) — which converts the enquiry
  first, because a trial's check-ins need a party (the trial member is a person on the premises).
- **F-4 Convert**: "Convert" opens the member drawer prefilled (name, mobile, source `enquiry`); on
  save the enquiry becomes `joined`, `party_id` is set, and its own name and mobile are cleared (BR-4);
  the sale screen opens next.
- **F-5 Purge**: the daily job blanks lost enquiries older than the retention period.

### 3. Features
**MVP:** enquiry CRUD (no delete), follow-ups, convert, lost with reason, daily purge, list with
filters, dashboard tile. **Later:** duplicate warning against existing parties by mobile (needs a
read of parties the desk already holds — allowed, but deferred for copy review), referral credit.

### 4. Entities and relationships
`gym_enquiry` 1 — * `gym_enquiry_followup`; `gym_enquiry` * — 0..1 `parties_party` (after conversion);
`gym_member.enquiry` points back.

### 5. Database
`gym_enquiry`

| Column | Type | Constraint / note |
|---|---|---|
| `name` | `varchar(120)` | NOT NULL until purged or converted; then `''` |
| `mobile` | `varchar(15)` | as `name` |
| `interest` | `varchar(8)` | `access`, `class`, `pt`, `trial`, `other` |
| `source` | `varchar(12)` | `walk_in`, `phone`, `referral`, `social`, `other` |
| `status` | `varchar(8)` | `open`, `trial`, `joined`, `lost` |
| `follow_up_on` | `date` null | |
| `assigned_to` | FK `platform.User` SET NULL, null | |
| `lost_reason` | `varchar(16)` null | `price`, `timing`, `location`, `joined_elsewhere`, `no_response`, `other`; required when `lost` |
| `party` | FK `parties.Party` RESTRICT, null | set on conversion |
| `converted_at`, `lost_at`, `purged_at` | `timestamptz` null | |

CHECKs: `status='joined' ⇔ party_id IS NOT NULL`; `status='lost' ⇒ lost_reason IS NOT NULL`;
`purged_at IS NOT NULL ⇒ name = '' AND mobile = ''`. Indexes: `(tenant, status, follow_up_on)`,
`(tenant, created_at desc)`, `(tenant, right(mobile, 4))` where `purged_at IS NULL`.

`gym_enquiry_followup`: `enquiry` FK CASCADE (these rows are not money; purge deletes them), `at
timestamptz`, `by` FK `platform.User` SET NULL, `outcome varchar(16)` (`interested`, `call_back`,
`no_answer`, `not_interested`, `joined`), `note varchar(160)` default `''`, `next_on date` null.
Index `(enquiry, at desc)`.

### 6. API
- `GET /api/v1/gym/enquiries?q=&status=&source=&interest=&follow_up=today|overdue|upcoming&assigned_to=&ordering=follow_up_on|-created_at`
- `POST /api/v1/gym/enquiries` `{name, mobile, interest, source, follow_up_on?, assigned_to?, note?}` → 201.
- `PATCH /api/v1/gym/enquiries/{id}` (status to `lost` with `lost_reason`, reassign, follow-up date).
- `POST /api/v1/gym/enquiries/{id}/followups` `{outcome, note?, next_on?}` → 201, updates
  `follow_up_on` to `next_on`.
- `POST /api/v1/gym/enquiries/{id}/convert` `{member: <GYM-02 create payload>}` → 201
  `{data: {enquiry, member}}`; 409 `enquiry_converted` (D `party_id`) the second time.
- No `DELETE`. Errors: `validation_error`, `id_number_not_allowed` (on `note`, GYM-21),
  `enquiry_converted`.

### 7. Frontend
Route `/gym/enquiries` (`EnquiriesPage`, list + filters in URL). Lazy slice `gymEnquirySlice`; service
`api/gymEnquiryService.ts`. Drawers `EnquiryFormDrawer`, `FollowUpDrawer` (both `dynamic()`).

### 8. UI/UX
List rows: name (owning its line), caption "Wants PT · walk-in · follow up today", a Call button
(`tel:`) and ⋯ (Log follow-up, Convert, Close as lost). Overdue follow-ups carry a `warning` badge in
the caption. The form is five fields and fits one phone screen without scrolling at 360 × 780. Copy:
`gym.enquiry.new` "New enquiry" / "नई पूछताछ"; `gym.enquiry.followUp` "Follow up" / "फिर से बात करें";
`gym.enquiry.convert` "Make member" / "सदस्य बनाएं"; the note field's hint "About the visit only.
Don't write health or ID details." / "सिर्फ़ बातचीत के बारे में लिखें। सेहत या पहचान पत्र की जानकारी न लिखें।"

### 9. Validation and business rules
- BR-1 Name and mobile required (party rules); follow-up date not in the past on create.
- BR-2 An enquiry never becomes a payer: no document, payment or reminder may name it (there is no
  API that could; `test_enquiry_has_no_money_path` asserts no gym serializer accepts an enquiry id
  where a party is expected).
- BR-3 Convert creates or links a party (an existing party with the same mobile is **offered**, not
  auto-linked: the desk chooses).
- BR-4 On conversion the enquiry's `name` and `mobile` are set to `''`: the party now holds them, and
  one person has one contact record (ADR-046, minimisation). The conversion report reads the party.
- BR-5 Purge: every day, enquiries `lost` for more than `gym.enquiry_retention_days` (default 180)
  **and** `open` enquiries with no follow-up activity for the same period are blanked (`name`,
  `mobile` → `''`, follow-ups deleted, `purged_at` set); status, source, interest and dates stay so the
  conversion report still counts them. Audit `gym.enquiry.purged` once per run with the count.
- BR-6 A trial (F-3) converts first; the enquiry's status becomes `trial` and then `joined` on the
  first paid sale, or `lost` by the desk.

### 10. Permissions
`gym.enquiry.read`, `gym.enquiry.write` (owner, admin, staff). Accountants and trainers hold neither.

### 11. Reports
"Enquiry conversion" (GYM-20): enquiries by source and outcome, conversion rate, median days to join.

### 12. Testing
- T-GYM-03-1 `test_convert_clears_enquiry_contact` (BR-4).
- T-GYM-03-2 `test_purge_blanks_lost_after_retention` and keeps counts.
- T-GYM-03-3 `test_enquiry_never_in_party_list` — `GET /parties` after 20 enquiries returns none.
- T-GYM-03-4 `test_convert_twice_is_409`.
- e2e: record → follow up → convert → sale screen prefilled.

### 13. Edge cases
- EC-1 The same person enquires twice: two rows; the second shows "Enquired before on 3 Sep" when the
  mobile matches an unpurged enquiry.
- EC-2 An enquiry for a child: the enquiry holds the parent's name and mobile (the person the desk
  speaks to); converting creates the child as member and the parent as guardian.
- EC-3 Purge runs while someone is editing: the edit's `version` check fails with `stale_version`.

### 14. Future
Referral tracking with a credit (needs a money rule), campaign sources, a public enquiry form (needs a
public route and spam controls).

---

## GYM-04 — Membership plans

### 1. Product requirements
The owner defines what they sell: time plans (monthly, quarterly, yearly, or N days), session packs
(N sessions within a validity), personal-training packs (sessions with a trainer) and trials. Each
plan carries its **price, whether the price includes tax, a tax code and a SAC** — default **GST 5%
(`GST5`) and SAC 999723**, which the research gives for gym and fitness services from 22 Sep 2025,
**without input tax credit** (research §6.14, S13–S15). The product seeds that default and does not
give tax advice: every tax item is in [Tax review items for a CA](#tax-review-items-for-a-ca).

### 2. User flows
- **F-1 Price the seeded plans** (first run): tap "Set price", type the price, save.
- **F-2 Create a plan**: name, category, length (months or days), sessions (packs), price, "price
  includes tax" (on), tax code (a picker of the tenant's active `tax_rate` codes, default `GST5`),
  SAC (default 999723), joining fee, freeze limits, part payment and instalments, batch (class
  plans), trainer required (PT).
- **F-3 Change a price**: affects new sales and renewals only; sold terms keep their snapshot.
- **F-4 Retire**: hidden from new sales; history untouched. A plan never sold may be deleted.

### 3. Features
**MVP:** CRUD with retire, categories `access`, `class`, `pt`, `trial`; kinds `duration`,
`sessions`; tax code and SAC per plan; joining fee; freeze limits and freeze fee; part payment and
maximum instalments. **Later:** family plans priced per head, add-on category (lockers — bookings
engine), price schedules (a new price from a date), sibling discounts (with GYM-22).

### 4. Entities and relationships
`gym_plan` * — 0..1 `gym_batch` (class plans enrol into a batch); `gym_plan` 1 — * `gym_membership`
(snapshot copied at sale); `gym_plan.tax_code` names a `tax_rate.code` (resolved by date at issue,
by sales).

### 5. Database
`gym_plan`

| Column | Type | Constraint / note |
|---|---|---|
| `name` | `varchar(80)` | unique `(tenant, lower(name))` where `status='active'` |
| `category` | `varchar(8)` | `access` (the gym floor), `class` (batch or class access), `pt` (personal training), `trial` |
| `kind` | `varchar(10)` | `duration`, `sessions` |
| `duration_value` | `smallint` | 1–3650 for days, 1–60 for months |
| `duration_unit` | `varchar(5)` | `day`, `month` |
| `sessions_count` | `smallint` null | 1–500; required iff `kind='sessions'` |
| `price` | `MoneyField` null | `NULL` = not priced yet (seeded plans); ≥ 0 |
| `price_includes_tax` | `bool` default true | maps to the sales line's `tax_inclusive` |
| `tax_code` | `varchar(16)` default `'GST5'` | must exist in `tax_rate` for the tenant (`code_exists`) |
| `sac` | `varchar(8)` default `'999723'` | 4, 6 or 8 digits (sales' `HSN_RE`) |
| `joining_fee` | `MoneyField` default 0 | ≥ 0; applies to `access` plans only (BR-6) |
| `freeze_max_days`, `freeze_max_count`, `freeze_min_days` | `smallint` default 0 | ≥ 0; `freeze_min_days ≤ freeze_max_days`; freezing allowed iff `freeze_max_days > 0` |
| `freeze_fee` | `MoneyField` default 0 | a sales line when a freeze is recorded (GYM-09) |
| `allow_part_payment` | `bool` default true | |
| `max_instalments` | `smallint` default 1 | 1–6; 1 means no instalments (GYM-07) |
| `batch` | FK `gym_batch` RESTRICT, null | class plans only |
| `trainer_required` | `bool` default false | true for `pt` |
| `status` | `varchar(8)` default `'active'` | `active`, `retired` |
| `sort_order` | `smallint` default 0 | |
| `seed_key` | `varchar(24)` null | GYM-01; partial unique `(tenant, seed_key)` |
| `version` | `int` default 1 | |

CHECKs: `(kind='sessions') = (sessions_count IS NOT NULL)`; `duration_unit='day' ⇒ duration_value
BETWEEN 1 AND 3650`; `duration_unit='month' ⇒ duration_value BETWEEN 1 AND 60`;
`freeze_min_days <= freeze_max_days`; `category='pt' ⇒ kind='sessions' AND trainer_required`;
`category='trial' ⇒ price = 0 OR price IS NULL`; `batch_id IS NULL OR category='class'`. Index
`(tenant, status, sort_order)`.

### 6. API
- `GET /api/v1/gym/plans?status=active|retired&category=` → rows with `price` only for
  `gym.membership.money_read` holders (a trainer sees names and lengths).
- `POST /api/v1/gym/plans`, `PATCH /api/v1/gym/plans/{id}` (`If-Match`), `POST …/{id}/retire`,
  `POST …/{id}/restore`, `DELETE …/{id}` (a plan never sold only; otherwise 409 `plan_in_use`, the
  existing code for "a plan that has been used cannot be deleted", reused because the state is the
  same).
- `GET /api/v1/gym/plans/tax-codes` → the tenant's active tax codes with today's rate, for the picker
  (a projection of `tax` selectors; gym may import `tax`).
- Errors: `validation_error`, `plan_in_use`, `stale_version`.

### 7. Frontend
Route `/gym/plans` (`PlansPage`: grouped by category, a card per plan). Lazy slice `gymPlanSlice`;
service `api/gymPlanService.ts`. Drawer `PlanFormDrawer` (`dynamic()`), with a `UbDisclosure`
"Freeze and payment rules" collapsed by default so the common case is five fields.

### 8. UI/UX
Plan card: name, "3 months" or "12 sessions in 60 days", price `UbAmount` with "incl. 5% GST" in the
caption (the rate read from the tax code, so it never lies after a rate change), joining fee if any,
freeze summary "Freeze up to 15 days". Retired plans in a collapsed section. The tax code picker shows
"GST 5% (no input credit)" for `GST5` on a plan whose SAC is 999723, with a `UbHelpHint` "Ask your CA
which rate applies to you". Hindi: `gym.plan.months` "{n} महीने", `gym.plan.sessions` "{n} सेशन,
{days} दिन में", `gym.plan.inclTax` "{rate}% GST सहित".

### 9. Validation and business rules
- BR-1 The rules of the table above, server-side; the Yup schema previews them.
- BR-2 A price change never touches sold terms (they hold a snapshot, GYM-05 BR-2) or issued
  documents (research E9, E10).
- BR-3 The tax code is resolved **by sales at issue** for the document date (`rate_for(code,
  document_date)`), so a rate change on a date applies to documents dated on or after it; a term that
  spans a rate change is not re-taxed (research E10). See [Contract question C3](#contract-questions)
  for how the code reaches the port line.
- BR-4 For a `composition` or `unregistered` tenant the tax engine forces every rate to 0
  (`TAX_FREE_GST_TYPES`); the plan's tax code is kept but has no effect on its documents, and the plan
  card says "No GST on your bills" instead of the rate.
- BR-5 Session plans: validity from `duration_*`, count from `sessions_count`; the term ends at
  whichever comes first (GYM-05 BR-4).
- BR-6 The joining fee applies to `access` plans only; class, PT and trial plans never charge one.
- BR-7 A plan that has been sold cannot be deleted, only retired (`plan_in_use`).

### 10. Permissions
Manage: `gym.plan.manage` (owner, admin). Read names and lengths: `gym.member.read`. Prices:
`gym.membership.money_read`.

### 11. Reports
"Membership sales" and "Renewals due" filter by plan (GYM-20). No report of its own.

### 12. Testing
- T-GYM-04-1 `test_plan_checks` — every CHECK has a refusing case.
- T-GYM-04-2 `test_price_change_does_not_touch_sold_terms`.
- T-GYM-04-3 `test_trainer_plan_list_has_no_price_key`.
- T-GYM-04-4 `test_seeded_plan_cannot_be_sold_until_priced` (`plan_not_priced`).
- T-GYM-04-5 `test_composition_tenant_plan_card_says_no_gst` (component).

### 13. Edge cases
- EC-1 The tenant deactivates `GST5` in tax settings: existing plans keep the code; a sale returns
  sales' `tax_rate_inactive` through the port, and the plan card shows "Tax code inactive — edit plan".
- EC-2 A plan price of ₹0 on an `access` plan (a free staff plan): allowed; the sale issues no document
  when the total is 0 (GYM-05 BR-9).
- EC-3 A 30-day plan and a 1-month plan are different plans (research §6.1): a month is counted in
  months.

### 14. Future
Per-head family pricing, dated price schedules, add-ons (lockers through the bookings engine),
sibling discounts, an 18% "sports coaching" preset if the CA confirms (T2).

---

## GYM-05 — Sell a membership: validity period and joining fee

### 1. Product requirements
The desk sells a term in one screen: pick the member, pick the plan, confirm the start date, see the
end date, the joining fee, any discount and the tax, take full, part or no payment, and save. **In one
transaction**: the term (a validity period), an issued sales document through the port (an invoice,
or a bill of supply for a composition tenant, with a line per charge), the ledger debit (sales'), the
payment and its receipt (payments'). A membership is a validity period, not a schedule (research
§15.3, shared-engines §2.11). Success: a cash sale takes ≤ 40 s at the counter (the SAL-02 target);
zero sales where the term exists without its document or the reverse.

### 2. User flows
- **F-1 New sale** (`/gym/sell?member=<id>`): member → plan chips (priced active plans) → start date
  (default today; chips Today · Tomorrow · Pick) → the quote panel (period "1 Oct 2026 – 31 Dec
  2026", plan price, joining fee with a Waive switch, discount, tax, total) → optional trainer (PT,
  required), batch (class plans, preset) → payer (default BR-6 of GYM-02) → payment (full by default;
  part if allowed; the mode chips of LED-01) → optional instalments (GYM-07) → **Sell**.
- **F-2 After save**: a success sheet with the invoice number, receipt number, "Print invoice",
  "Share invoice" (existing share sheet), "Print card" (GYM-16) and "Welcome message" (prepared text,
  sent by the merchant; nothing is sent by the product, DEC-012).
- **F-3 Add-on on the same sale**: "Add personal training" adds a second term (PT plan) to the same
  document as a second line.
- **F-4 Backdated sale** (a paper slip from last week): a start date up to `gym.backdate_sale_days`
  (default 30) in the past with a warning; the document date is the real sale date; older needs the
  owner role (research E1).

### 3. Features
**MVP:** single and multi-term sale, quote endpoint, joining fee with waiver, discount (amount or
percent, ≤ price), backdating with limits, part payment, trial (price 0, no document), overlap refusal
with a "Start after the current term" fix. **Later:** family and corporate multi-member sale on one
document (research E22, E23 — the port supports several lines to one payer; the multi-member picker
is the later work), price override "honour old price" is in GYM-08.

### 4. Entities and relationships
`gym_membership` * — 1 `gym_member` (via `member_party`), * — 1 payer party, * — 1 `gym_plan`,
0..1 — `gym_membership` (renewal_of, changed_from, transferred_from), 1 — * `gym_membership_document`,
0..1 — `attendance_entitlement` (session plans), 0..1 — `dues_schedule` (instalments), 0..1 —
`attendance_group_member` (class plans with a batch).

### 5. Database
`gym_membership`

| Column | Type | Constraint / note |
|---|---|---|
| `member_party` | FK `parties.Party` RESTRICT | must have a `gym_member` |
| `payer_party` | FK `parties.Party` RESTRICT | the document's party |
| `plan` | FK `gym_plan` RESTRICT | |
| `plan_name`, `category`, `kind`, `duration_value`, `duration_unit`, `sessions_total`, `tax_code`, `sac`, `price_includes_tax`, `freeze_max_days`, `freeze_max_count`, `freeze_min_days`, `freeze_fee` | snapshot columns, types as in `gym_plan` | copied at sale; never re-read from the plan |
| `price` | `MoneyField` | the term's list price at sale (plan price or an override) |
| `discount_amount` | `MoneyField` default 0 | `0 ≤ discount_amount ≤ price` |
| `joining_fee_charged` | `MoneyField` default 0 | |
| `joining_fee_waived_reason` | `varchar(160)` default `''` | required when a due fee was waived |
| `start_on` | `date` | |
| `base_end_on` | `date` | from the plan period rule (BR-3) |
| `end_on` | `date` | `base_end_on` + freeze days + extension days (GYM-09, GYM-10) |
| `sale_kind` | `varchar(10)` | `new`, `renewal`, `rejoin`, `upgrade`, `downgrade`, `transfer`, `trial`, `import` |
| `renewal_of`, `changed_from`, `transferred_from` | FK self RESTRICT, null | lineage |
| `trainer_party` | FK `parties.Party` RESTRICT, null | required when the plan requires a trainer |
| `batch` | FK `gym_batch` RESTRICT, null | |
| `entitlement` | FK `attendance.Entitlement` RESTRICT, null | session plans (vertical → engine FK, allowed) |
| `dues_schedule` | FK `dues.Schedule` RESTRICT, null | GYM-07 |
| `state` | `varchar(12)` default `'active'` | `active`, `cancelled`, `transferred`, `changed` |
| `ended_on` | `date` null | last day of access for a terminal state |
| `end_reason` | `varchar(160)` default `''` | |
| `sold_on` | `date` | the document date of the sale |
| `version` | `int` default 1 | |

CHECKs: `base_end_on >= start_on`; `end_on >= start_on`; `discount_amount BETWEEN 0 AND price`;
`(state = 'active') = (ended_on IS NULL)`; `ended_on IS NULL OR ended_on >= start_on - 1` (a term
cancelled before it starts ends the day before its start); `category <> 'pt' OR trainer_party_id IS NOT NULL`.
Indexes: `(tenant, member_party, start_on)`, `(tenant, end_on)` where `state='active'` (expiring
lists), `(tenant, payer_party)`, `(tenant, sold_on)` (sales report), `(tenant, trainer_party)` where
not null, `(tenant, batch)` where not null.

**No database overlap constraint** (ADR-049 rules out `btree_gist`): overlap of access terms is
refused by the service under the `gym_member` row lock (§0.10), and `check_integrity` — a nightly
report-only job like `recalc_balances` — reports any overlapping pair, which a test seeds and expects.

### 6. API
- `POST /api/v1/gym/memberships/quote` (no side effects) with
  `{member_id, plan_id, start_on?, discount?: {type, value}, waive_joining_fee?: bool, trainer_party_id?, add_ons?: [{plan_id, trainer_party_id?}], instalments?: [...]}`
  →
  ```json
  {"data": {"terms": [{"plan_id": "…", "start_on": "2026-10-01", "end_on": "2026-12-31",
     "sale_kind": "new", "price": "4200.00", "discount_amount": "0.00"}],
   "joining_fee": {"due": true, "amount": "500.00", "reason": "first_access_term"},
   "lines": [{"description": "Quarterly membership, 1 Oct 2026 – 31 Dec 2026", "sac": "999723",
     "tax_code": "GST5", "qty": "1", "unit_price": "4200.00", "tax_inclusive": true},
     {"description": "Joining fee", "sac": "999723", "tax_code": "GST5", "qty": "1",
     "unit_price": "500.00", "tax_inclusive": true}],
   "document_kind": "invoice", "estimated_total": "4700.00",
   "warnings": [{"code": "backdated_sale", "days": 3}]}}
  ```
  The quote's tax figures are labelled estimated; the issued document is the truth (sales computes).
- `POST /api/v1/gym/memberships` (Idempotency-Key) with the quote payload plus
  `payer_party_id?`, `document_date?`, `payment?: {payment_date, mode_breakup: [{mode, amount, reference?}]}`,
  `confirm_backdated?: bool`, `version_of_member?` → 201
  `{data: {terms: [...], document: IssuedDocument, payment?: {id, number, amount}, dues_schedule_id?}, warnings: [...]}`.
- `GET /api/v1/gym/memberships?member_id=&state=&status=&plan_id=&start_from=&start_to=&end_from=&end_to=&payer_id=`
  and `GET /api/v1/gym/memberships/{id}` (with freezes, extensions, documents, visits count).
- Errors: `validation_error`, `membership_overlap` (D `membership_id`, `next_start_on` — the UI offers
  "Start on {next_start_on}"), `plan_retired`, `plan_not_priced`, `credit_limit_exceeded` (from sales,
  counter sale, BR-10), `module_disabled` (sales unavailable), `override_not_allowed` (backdate beyond
  the staff window), `idempotency_conflict`.

### 7. Frontend
Route `/gym/sell` (`SellMembershipPage`; query `member`, `plan`, `renew`, `rejoin`). Lazy slice
`gymSaleSlice` (quote state, debounced 300 ms re-quote on change); service
`api/gymMembershipService.ts` (`quote`, `sell`, `get`, `list`). Components: `PlanChips`,
`TermQuotePanel`, `JoiningFeeRow`, `PaymentBlock` (reuses the payments feature's mode chips component —
core feature, importable), `SaleSuccessSheet` (`dynamic()`).

### 8. UI/UX
- **Phone (360 px):** one column: member chip (tap to change), plan chips wrapping two per row, start
  date chips, the quote panel as a `UbCard` with the period in `ds-h3` ("1 Oct – 31 Dec 2026"), then
  payment, then a pinned bottom bar "Sell · ₹4,700" (grouped with `formatInr`, never a raw string —
  the fifth-time lesson of LED-04).
- **Tablet (768 px, landscape desk):** two panes — plan and dates left, quote and payment right; the
  Sell button in the right pane's footer.
- **Keyboard:** Enter moves field to field; Ctrl/Cmd+Enter sells; the amount field opens the numeric
  keypad (`inputMode="decimal"`). Focus lands on the plan chips on open; the page is not a dialog, so
  the MLDialog focus trap does not apply, but any drawer inside it follows the LED-01 autofocus fix.
- **Copy:** `gym.sell.title` "Sell membership" / "सदस्यता बेचें"; `gym.sell.period` "{from} to {to}" /
  "{from} से {to} तक"; `gym.sell.joiningFeeDue` "Joining fee (first membership)" / "दाखिला फ़ीस (पहली
  सदस्यता)"; `gym.sell.overlap` "{name} already has {plan} till {end}. Start this one on {next}?" /
  "{name} की {plan} {end} तक चालू है। यह {next} से शुरू करें?"; `gym.sell.sold` "Sold. Invoice
  {number} · Receipt {receipt}" / "बिक गई। बिल {number} · रसीद {receipt}".

### 9. Validation and business rules
- BR-1 Plan active and priced; start date within `[today − backdate_sale_days, today + 365]`
  (owner role: any past date, with `confirm_backdated`); trainer set when required; batch has room
  (GYM-15); discount ≤ price.
- BR-2 The term snapshots the plan (name, kind, length, sessions, tax code, SAC, inclusive flag, price)
  at sale.
- BR-3 **Period rule** (research §6.1; `apps/gym/services/terms.py:end_of_term(start_on, value,
  unit)`), start and end **inclusive**:
  - day plans: `end_on = start_on + days − 1`;
  - month plans: add N months; if the start's day exists in the target month, `end_on` is that date
    minus one day; if it does not, `end_on` is the target month's last day.
  The rule is pure, uses no `dateutil` (ADR-021), and is property-tested against
  `common.recurrence.occurrences` month-end clamping for agreement on anchors 1–28.
- BR-4 Session plans end at `end_on` or when `used = sessions_total`, whichever first; the
  entitlement is granted at sale with `total = sessions_total`, `valid_from = start_on`,
  `valid_to = end_on` (`attendance.grant_entitlement`).
- BR-5 **Overlap** (research §6.3): two access terms (`access` or `trial`) of one member may not
  overlap. The check runs under the `gym_member` lock against every non-terminal access term and every
  terminal one's `[start_on, ended_on]`. On conflict: 409 `membership_overlap` with the next free
  start date. Class and PT terms may overlap anything.
- BR-6 **Joining fee** (research §6.8) on an `access` plan: due when the member has **no earlier access
  term** (first ever), or when the gap since the latest access term's last day (`ended_on` or
  `end_on`) **exceeds `gym.rejoin_fee_after_days`** (default 90). Never on a renewal inside the gap.
  Waivable by anyone holding `gym.membership.sell` with a reason (3–160 characters) — promotions
  waive it; it is a line of its own and never part of pro-rating (GYM-11, GYM-13).
- BR-7 **Lines** (research §9): one line per term — description "{plan} membership, {start} – {end}"
  ("Quarterly membership, 1 Oct 2026 – 31 Dec 2026"), for session plans "{plan}, {n} sessions,
  {start} – {end}", for PT "… trainer: {trainer name}"; `sac` and tax code from the snapshot;
  `qty 1`, `unit_price = price`, `discount_amount`, `tax_inclusive = price_includes_tax`,
  `item_id None`, `unit_code "NOS"`. A joining-fee line "Joining fee" with the access plan's tax code
  and SAC (see [T6](#tax-review-items-for-a-ca)).
- BR-8 **Issue** through `documents.issue_document(ctx=…, request={origin_type: "gym_membership",
  origin_id: <first term id>, party_id: payer, document_date: sold_on, due_on: sold_on, lines,
  payment, apply_open_advances: True, credit_check: "enforce", meta_block: {"membership":
  {"member": name, "code": member_code, "period": "1 Oct 2026 – 31 Dec 2026"}}})`. The kind is sales'
  `kind_for(tenant)`: an invoice for `regular` and `unregistered` tenants (no tax for the latter),
  a bill of supply for `composition` (GYM-06, [C7](#contract-questions)). Every term on the document
  gets a `gym_membership_document` row `role='sale'`.
- BR-9 A sale whose total is ₹0 (trial, free plan, fully waived) issues **no document** and records no
  payment; the term is still audited.
- BR-10 A counter sale is `credit_check="enforce"`: a part-paid sale over the payer's credit limit is
  refused or warned exactly as a counter invoice is; the override is the existing owner/admin role
  check through the port's error, re-submitted with the sale.
- BR-11 Part payment: allowed when the plan's `allow_part_payment` and the tenant's
  `gym.part_payment_allowed` are both on; otherwise the payment must equal the total (400
  `validation_error`, `payment: ["Collect the full ₹4,700 for this plan."]`). An over-payment is an
  advance (the existing sales payment seam).
- BR-12 `gym_member.joined_on` is set to the first access term's start when null.
- BR-13 Everything above is one `transaction.atomic()` in the lock order of §0.10; a port refusal
  rolls back the term.

**Worked examples — end dates (BR-3), all verified against the rule:**

| Start | Plan | End (inclusive) | Why |
|---|---|---|---|
| 15 Jan 2026 | 1 month | 14 Feb 2026 | 15 Feb exists → minus a day |
| 1 Oct 2026 | 3 months | 31 Dec 2026 | 1 Jan exists → 31 Dec |
| 1 Apr 2026 | 12 months | 31 Mar 2027 | |
| 31 Aug 2026 | 1 month | 30 Sep 2026 | 31 Sep does not exist → last day of September |
| 31 Jan 2027 | 1 month | 28 Feb 2027 | month end, non-leap year |
| 29 Jan 2027 | 1 month | 28 Feb 2027 | 29 Feb 2027 does not exist |
| 30 Jan 2028 | 1 month | 29 Feb 2028 | month end, **leap year** |
| 29 Jan 2028 | 1 month | 28 Feb 2028 | 29 Feb 2028 exists → minus a day |
| 1 Mar 2027 | 12 months | 29 Feb 2028 | the year crosses a leap day: 1 Mar 2028 − 1 |
| 29 Feb 2028 | 12 months | 28 Feb 2029 | 29 Feb 2029 does not exist → last day (366 days of access) |
| 31 Dec 2026 | 2 months | 28 Feb 2027 | |
| 15 Feb 2028 | 30 days | 15 Mar 2028 | day plan, leap February (29 days) |
| 15 Feb 2027 | 30 days | 16 Mar 2027 | day plan, ordinary February |
| 1 Oct 2026 | 12 sessions, 60 days | 29 Nov 2026, or the 12th session | whichever first (BR-4) |

Note (tested, not a defect): 31 Jan and 1 Feb monthly starts both end on 28 Feb 2027 — a month is a
calendar month, so the first member gets 29 days and the second 28. The card and invoice print both
dates, so neither is surprised.

**Worked example — a first sale.** Rahul, no earlier term, buys Quarterly ₹4,200 (incl. 5% GST) with
a ₹500 joining fee on 1 Oct 2026, pays ₹3,000 cash. Invoice lines: "Quarterly membership, 1 Oct 2026
– 31 Dec 2026" ₹4,200.00 (taxable ₹4,000.00, CGST ₹100.00, SGST ₹100.00) and "Joining fee" ₹500.00
(taxable ₹476.19, CGST ₹11.90, SGST ₹11.91 — the tax engine's split: CGST = q2(t × r/200), SGST =
q2(t × r/100) − CGST). Grand total ₹4,700.00; paid ₹3,000.00; due ₹1,700.00 on the payer's khata. The term is
active 1 Oct – 31 Dec 2026.

### 10. Permissions
`gym.membership.sell`; price override and backdating beyond the staff window: `gym.membership.override`
and, for backdating beyond `backdate_sale_days`, the owner role. Seeing prices and the document:
`gym.membership.money_read`. Payment recording rides the sale (the port's payment), so the desk needs
no `payments.payment.write` of its own beyond what staff already hold.

### 11. Reports
"Membership sales" (GYM-20) — every sale with its kind (new, renewal, rejoin, upgrade, downgrade,
transfer, trial), plan, amount, tax and document number.

### 12. Testing
- T-GYM-05-1 `test_end_of_term_table` — the worked-example table, row for row, plus a fuzz of 10,000
  random starts against a naive month walker.
- T-GYM-05-2 `test_sale_is_one_transaction` — a port that raises leaves no term, no link, no
  entitlement (fake issuer registered through `_reset_for_tests`).
- T-GYM-05-3 `test_overlap_refused_under_concurrency` — two threads selling overlapping access terms
  for one member; exactly one succeeds.
- T-GYM-05-4 `test_joining_fee_first_and_after_gap` (BR-6, GYM-08 examples).
- T-GYM-05-5 `test_zero_total_issues_no_document` (BR-9).
- T-GYM-05-6 `test_gym_never_imports_sales` — the whole-AST import test (10-architecture §10.1).
- T-GYM-05-7 `test_first_sale_invoice_figures` — the worked example's lines to the paisa against a
  live sales issuer.
- e2e: sell with part payment at 360 px; the success sheet shows invoice and receipt numbers; the
  khata of the payer shows ₹1,700 due.

### 13. Edge cases
- EC-1 Overlapping sale (research E6): refused with the fix offered; the desk taps "Start on 1 Jan".
- EC-2 The payer differs from the member (parent): the invoice is the parent's; the term is the
  child's; the child's member page shows "Paid by Suresh (father)".
- EC-3 The same idempotency key replayed after a timeout: the stored response, no second term.
- EC-4 Backdated start with check-ins already recorded on paper: fine; no marks are created
  retroactively (visits before the product are not history it has).
- EC-5 Plan retired between quote and sell: `plan_retired`; the screen reloads the chips.
- EC-6 A payer with a GSTIN in another state: sales sets place of supply and IGST by its own rules.

### 14. Future
Multi-member family and corporate sales on one document; price override from a dated price table;
a member-facing receipt link through `parties_share_link` when it exists.

---

## GYM-06 — Money documents through the sales port

### 1. Product requirements
Every gym document that carries money is a **sales document** raised through the core document port
(ADR-045, 11-contracts §1.5): the membership invoice (or bill of supply), instalment invoices (GYM-07),
freeze-fee and transfer-fee invoices, and credit notes for upgrades, downgrades and refunds. Receipts
are the payments module's. Gym never computes tax, never numbers a document and never posts to the
ledger. When a gym document is voided or its settlement changes, sales tells gym **in the same
transaction** through the origin listener, so a voided sale can never leave a live membership behind
(research E7). Success: zero memberships in state `active` whose sale document is void
(`check_integrity` reports it; a test seeds one).

### 2. User flows
- **F-1 Print or share** the invoice from the sale success sheet or the member page's Documents list:
  the existing sales print (A4 or 80 mm, `window.print()`) and share sheet; the port's `meta_block`
  prints a "Membership" block (member, code, period) on the document.
- **F-2 Receipt** for any payment: the existing A5 receipt.
- **F-3 Collect a balance**: member page → "Collect ₹1,700" → the existing payments collect sheet
  pre-allocated to the gym documents with `amount_due > 0`, oldest first (a core payments screen,
  reached by route; gym never imports the payments feature's internals beyond its public collect
  component).
- **F-4 Void a sale from the membership** (`gym.membership.cancel` + `sales.invoice.void`): "Void this
  sale" shows what happens ("Membership ends today. 6 visits stay in history. ₹4,700 comes off
  Rahul's khata.") and asks for a reason; it calls `documents.void_document`.
- **F-5 Void from the Invoices screen** (sales' own flow): allowed unless `check_void` says why not;
  `on_void` ends the membership in the same transaction.

### 3. Features
**MVP:** the origin listener, the `gym_membership_document` projection, documents list on the
member and membership pages, gym-side void action, collect deep link, bill of supply for composition
tenants. **Later:** share links for the card and a member statement through `parties_share_link`
(CR-131, not built).

### 4. Entities and relationships
`gym_membership` 1 — * `gym_membership_document` (by `document_id`, a uuid, no FK); the sales
document carries `origin_module='gym'`, `origin_type='gym_membership'`, `origin_id=<term id>`
(11-contracts §1.5 sales changes). Instalment invoices carry `origin_type='dues_due'` and are the dues
engine's (GYM-07); gym reads them through dues selectors, not through this table.

### 5. Database
`gym_membership_document`

| Column | Type | Constraint / note |
|---|---|---|
| `membership` | FK `gym_membership` RESTRICT | |
| `document_id` | `uuid` | unique `(tenant, document_id, membership)` — one document may cover several terms (a membership and a PT add-on) |
| `role` | `varchar(14)` | `sale`, `change_credit`, `refund_credit`, `freeze_fee`, `transfer_fee` |
| `kind` | `varchar(16)` | `invoice`, `bill_of_supply`, `credit_note` (from `IssuedDocument.kind`) |
| `number` | `varchar(32)` | |
| `status` | `varchar(16)` | **projection** of the document's status |
| `grand_total` | `MoneyField` | projection |
| `amount_due` | `MoneyField` | **projection**; for a credit note, its open credit |
| `synced_at` | `timestamptz` | |

Indexes `(tenant, membership)`, `(tenant, document_id)`. The projection is written only by the
sale services (from the `IssuedDocument` returned) and by `on_settlement_changed`/`on_void`; it is a
cache of sales' figure, not gym arithmetic, and `test_document_projection_replays` compares every row
with `documents.document_summaries` over a fuzzed history (the ADR-031 replay rule).

### 6. API
- `GET /api/v1/gym/memberships/{id}/documents` → the projection rows plus `document_summaries` for
  freshness (`gym.membership.money_read`).
- `POST /api/v1/gym/memberships/{id}/void-sale` `{reason}` (Idempotency-Key) → 200
  `{data: {membership, voided: [{document_id, number}]}}`; errors `document_origin_locked` (from
  `check_void`, D `origin_type`, `reason`), `document_already_void`, `validation_error` (reason 3–160),
  `permission_denied`.
- No gym endpoint issues or voids a credit note directly; GYM-11 and GYM-13 call the port.

### 7. Frontend
`MembershipDocumentsList` on `/gym/memberships/[id]` and in the member page's Money tab (hidden
without `gym.membership.money_read`); `VoidSaleDialog` (`dynamic()`, `UbReasonDialog`, opens on
Cancel — the safe choice — per the LED-01 autofocus fix); links to `/sales/invoices/[id]` (a route,
not an import).

### 8. UI/UX
Documents list rows: number owning its line, caption "Invoice · 1 Oct 2026 · ₹4,700 · ₹1,700 due" or
"Credit note · held as advance ₹3,515.22"; status badge in the caption. Void dialog states the
consequence first ("The membership ends today"), then the reason field, then the destructive button.
Copy: `gym.void.title` "Void this sale" / "बिक्री रद्द करें"; `gym.void.consequence` "The membership
ends today" / "सदस्यता आज खत्म हो जाएगी" (plain Hindi, no mixed-script verbs).

### 9. Validation and business rules
- BR-1 Kind: the port uses `kind_for(tenant)`; gym never asks for a kind. `regular` → tax invoice;
  `composition` → bill of supply ("Bill of Supply", the composition footer, no tax); `unregistered` →
  a plain "Invoice" with no tax (sales SAL-02 FR-1). The brief's "bill of supply below the threshold"
  is therefore what sales issues for **composition** tenants; for **unregistered** tenants sales issues
  a tax-free "Invoice" titled "Invoice" / "बिल". Which title an unregistered gym should print is a tax
  question ([T4](#tax-review-items-for-a-ca)) and, if it changes, a sales change
  ([C7](#contract-questions)); gym follows whatever `kind_for` returns.
- BR-2 **`on_void(origin_id, document, reason)`** (inside sales' void transaction; gym locks
  `gym_member` then the terms linked to that `document_id`):
  - role `sale`: every linked term in state `active` becomes `cancelled` with
    `ended_on = max(start_on − 1, today − 1)` and `end_reason = "Sale voided: <reason>"`; its batch
    enrolment ends yesterday (`set_members(to_on=today − 1)`); its dues schedule is cancelled
    (`dues.cancel_schedule`, which voids instalment invoices already raised — the member owes nothing
    for a sale that did not happen); upcoming terms of the member are **not** moved (a gap appears,
    which is true). Audit `gym.membership.voided`.
  - role `freeze_fee`, `transfer_fee`: nothing but the projection (the fee is gone; the freeze or
    transfer stands).
- BR-3 **`check_void(origin_id)`** returns `block` with a reason (→ 409 `document_origin_locked`) when:
  - the sale's term is `changed` or `transferred` ("This membership was changed to Yearly on 16 Oct.
    Its credit note depends on this invoice.");
  - the document is a gym credit note (`change_credit`, `refund_credit`): "Made by a membership change
    or refund; it cannot be voided on its own." (Undoing a change is later, §14.)
  Otherwise `None`.
- BR-4 **`on_settlement_changed(origin_id, document)`**: update the projection's `status`,
  `amount_due`, `synced_at` for that `document_id`. Nothing else: dues on a membership are the
  document's, and the term's validity never depends on payment (research E8: a voided payment makes
  the balance reappear as a due; the term stays).
- BR-5 A term with check-ins asks for confirmation before its invoice is voided (research E7). The
  gym's origin listener answers `check_void` with `confirm: "This membership has {n} visits. Void the
  invoice and cancel the membership?"`; sales' void endpoint then answers 409
  `document_origin_confirm` until the request carries `confirm_origin: true`, so the question is asked
  from the Invoices screen and from the gym's own void action alike (C9 → R55).
- BR-6 The `meta_block` printed on the document names the member and the period; the member's
  mobile is never printed on a document whose party is the payer (a parent's invoice does not carry
  the child's number).
- BR-7 Customer documents carry the tenant's branding only (the existing rule and test).

### 10. Permissions
Documents list: `gym.membership.money_read`. Void from gym: `gym.membership.cancel` and the sales
codename `sales.invoice.void` (the port's `void_document` is a service call with no permission check
of its own; the gym view checks both, so the gym path is never wider than the sales path).

### 11. Reports
GST summary and sales register are sales' own and include gym documents with no change; the sales
register can filter `origin_module=gym` (the new column).

### 12. Testing
- T-GYM-06-1 Origin-listener contract suite (10-architecture §11): `on_void` and
  `on_settlement_changed` are called inside the transaction, and a listener that raises rolls the void
  back.
- T-GYM-06-2 `test_void_sale_cancels_term_and_schedule`.
- T-GYM-06-3 `test_check_void_of_changed_term` and `test_check_void_of_gym_credit_note`.
- T-GYM-06-4 `test_document_projection_replays` (fuzzed).
- T-GYM-06-5 `test_bill_of_supply_for_composition_tenant` — same sale, `kind='bill_of_supply'`, zero
  tax.
- T-GYM-06-6 `test_payer_invoice_does_not_print_child_mobile` (BR-6).
- e2e: void from the Invoices screen → the member page shows "Cancelled · sale voided".

### 13. Edge cases
- EC-1 Payment voided (research E8): `on_settlement_changed` raises `amount_due`; the term stays.
- EC-2 An invoice covering a membership and a PT add-on is voided: both terms cancelled.
- EC-3 Voiding the invoice of a term that had an upgrade credit applied to it: sales releases the
  credit application (`_release_credit_applications`), the credit note becomes open again as an
  advance; gym cancels the new term (BR-2). The old term stays `changed` (its access ended when it was
  changed); the owner resells if needed.
- EC-4 A document raised by gym is voided while the gym module is switched off: the listener is
  registered at start-up regardless of the switch, so it still runs (the switch gates endpoints, not
  listeners).

### 14. Future
Undo an upgrade or a refund as one guided reversal; member statement and card share links through
`parties_share_link`; a receipt voucher for advances if the CA requires one (T12, ADR-045 trigger).

---

## GYM-07 — Instalments through the dues engine

### 1. Product requirements
Many gyms let a member pay a term in parts ("₹2,100 now, ₹2,100 on the 31st") and then forget to
collect (research §6.10, S6). The gym records the instalment dates once at sale; the **dues engine**
(ADR-048, 11-contracts §2.1) raises each later instalment on its date, reminds before and after it,
and marks it paid when its invoice is settled. Success: every instalment appears on the payer's khata
on its due date without anyone doing anything, and in the reminders list three days before.

### 2. User flows
- **F-1 At sale**: "Pay in parts" (shown when the plan's `max_instalments > 1` and part payment is
  allowed) → the default split (equal parts, one a month from the sale date, the last on or before the
  term's end) → edit amounts and dates → the first part is collected now with the joining fee.
- **F-2 On each due date**: the dues run raises the instalment invoice through the port; it appears
  on the payer's khata and in the member's Money tab; reminders follow the dues buckets.
- **F-3 Collect**: the payment settles the instalment invoice; the due follows (`on_settlement_changed`
  on `dues_due`).
- **F-4 Change the plan of parts**: before a part is raised, the owner may move its date or amount
  (`dues.reschedule` from the next unraised part); raised parts are invoices and change only by credit
  note.

### 3. Features
**MVP:** split at sale, dues schedule per term, automatic raising, reminders, end of schedule on
change, transfer, cancel and void. **Later:** instalments on renewals by default, penalties for late
parts (the engine supports them; gyms rarely charge them, and the policy text needs owner review).

### 4. Entities and relationships
`gym_membership.dues_schedule` → `dues_schedule` (engine; `subject_type='gym_membership'`,
`subject_id=<term>`, `module='gym'`, `party=payer`, `beneficiary_party=member`) 1 — * `dues_due` →
`sales_document` (origin `dues_due`). One `dues_plan` per tenant per tax combination, created by gym on
first use: `mode='charge'`, `posting='document'`, `amount_rule='supplied'`, `recurrence freq='once'`,
tax fields from the term's plan (see C3), `auto_apply_advance=true`, `grace_days` = the tenant's gym
grace days, `penalty_kind='none'`, `closed_day_rule='ignore'`.

### 5. Database
No new gym table; `gym_membership.dues_schedule` (GYM-05). `gym_membership_document` does not hold
instalment invoices (their origin is `dues_due`); the Money tab lists them from
`dues.selectors.dues_for_subject` plus `documents.document_summaries` of their `document_id`s.

### 6. API
- Instalments ride the sale: `POST /api/v1/gym/memberships` accepts
  `instalments: [{due_on, amount}]`, where the first element is the part collected at sale
  (`due_on = sold_on`). The quote (`/memberships/quote`) returns a proposed split and the per-part
  lines.
- `PATCH /api/v1/gym/memberships/{id}/instalments` `{from_seq, parts: [{due_on, amount}], reason}` →
  calls `dues.reschedule` (owner/admin, `gym.membership.override`).
- Reads: `GET /api/v1/gym/memberships/{id}` includes `instalments: [{seq, due_on, amount, status,
  settled_amount, document_number?}]` (money codename).
- Errors: `validation_error` (sum, dates, count), `schedule_not_active`, `due_not_open`,
  `module_disabled` (sales off; a document-posting plan cannot be created without the issuer,
  11-contracts §2.1).

### 7. Frontend
`InstalmentEditor` inside the sale page's payment block (`dynamic()`, loads when "Pay in parts" is
switched on); `InstalmentList` on the membership page. Service calls in `gymMembershipService`
(`quote`, `sell`, `reschedule`). Shared dues UI (a due status badge) comes from `features/dues`
(engine shared UI, allowed).

### 8. UI/UX
The editor is a short list: "Part 1 · today · ₹2,600 (incl. joining fee)", "Part 2 · 31 Oct · ₹2,100",
each date a `UbDateInput`, each amount a `UbMoneyInput`, a running "Total ₹4,700 · matches" line in
success tone, or "₹200 short" in danger tone with Sell disabled. On a phone each part is one row;
no table. Copy: `gym.instalments.toggle` "Pay in parts" / "किस्तों में भुगतान"; `gym.instalments.part`
"Part {n}" / "किस्त {n}".

### 9. Validation and business rules
- BR-1 Parts: 2 ≤ count ≤ `plan.max_instalments`; the first part's `due_on = sold_on`; later dates
  strictly increasing, each in `(sold_on, end_on]`; amounts > 0; Σ parts = term total after discount
  (joining fee excluded — it is always collected in part 1). The default split is
  `common.money.split_total(total, n, rule="rupee")` — whole rupees, the last part absorbs the residue.
- BR-2 Part 1 is on the **sale invoice** (GYM-05), its line described "… · part 1 of N"; the term's
  line on the sale invoice carries part 1's amount, not the whole price.
- BR-3 Parts 2…N are a dues schedule: `dues.create_schedule(module="gym", plan_id=<tenant instalment
  plan>, party_id=payer, subject_type="gym_membership", subject_id=term.id, start_on=<part 2 due_on>,
  end_on=term.end_on, beneficiary_party_id=member, supplied=[…])`. On each `due_on` the engine raises
  an invoice through the port with `credit_check="skip"` (an agreed charge is never refused by the
  limit, ADR-048) and `apply_open_advances=True`.
- BR-4 Line description of a raised part: the subject label plus the period label ([C6](#contract-questions)):
  "Quarterly membership, 1 Oct – 31 Dec 2026 · Rahul Sharma (M-0142) · part 2 of 2".
- BR-5 The term's validity never depends on parts being paid; the **check-in policy** reads overdue
  parts per `gym.dues_checkin_rule` (GYM-14 BR-6).
- BR-6 A term that ends early by **upgrade, downgrade or cancellation** ends its schedule:
  `dues.end_schedule(on=<last day>, reason, leave_policy="no_refund")` cancels parts not yet raised;
  raised parts stay as invoices, and GYM-11/GYM-13 compute any credit from what was invoiced (their
  "invoiced value" rule). A **transfer** does not end it: the original payer still owes the price they
  agreed (GYM-12 BR-4). A void of the **sale** invoice cancels the schedule (`cancel_schedule`), which
  voids raised parts too (GYM-06 BR-2).
- BR-7 A freeze does **not** move instalment dates (the money was agreed on dates); the owner may
  reschedule (F-4).

**Worked example.** Quarterly ₹4,200 incl. 5% GST, joining fee ₹500, sold 1 Oct 2026 to Rahul in two
parts. Part 1 (sale invoice, 1 Oct): "Quarterly membership, 1 Oct 2026 – 31 Dec 2026 · part 1 of 2"
₹2,100.00 (taxable ₹2,000.00, CGST ₹50.00, SGST ₹50.00) + "Joining fee" ₹500.00 = ₹2,600.00, paid in
cash. Part 2: a `dues_due` for ₹2,100.00 due 31 Oct 2026. On 28 Oct it appears in reminders ("due in 3
days"); on 31 Oct the 00:30 run raises invoice INV/26-27/0419 for ₹2,100.00 and the khata shows
₹2,100 due; with grace 5 days the due becomes `overdue` on 6 Nov. If Rahul had paid ₹2,100 on 20 Oct
(before the part was raised), the payment sat as an advance and the run applied it to the new invoice
(`apply_open_advances`): the part is paid on the day it is raised.

### 10. Permissions
Set parts at sale: `gym.membership.sell`. Reschedule: `gym.membership.override`. See parts:
`gym.membership.money_read`.

### 11. Reports
"Dues on memberships" (GYM-20) includes raised unpaid parts; the dues engine's
`collection_vs_expected(module="gym")` feeds "Instalments due this month".

### 12. Testing
- T-GYM-07-1 `test_parts_sum_and_dates` (BR-1) — every refusal.
- T-GYM-07-2 `test_part_two_raised_on_due_date` — the run on 31 Oct raises one invoice; a second run
  raises nothing (idempotency key of the engine).
- T-GYM-07-3 `test_missed_run_raises_with_own_due_on` — the run skipped for three days raises the part
  dated 31 Oct, not the run date (ADR-048).
- T-GYM-07-4 `test_upgrade_ends_schedule_keeps_raised_parts`.
- T-GYM-07-5 `test_void_sale_voids_raised_parts`.
- T-GYM-07-6 `test_advance_applies_to_raised_part`.

### 13. Edge cases
- EC-1 The payer changes after sale: the schedule keeps its payer (`dues_due.party` never changes);
  the new payer applies to the next term.
- EC-2 The sales module is switched off (impossible while gym is on, GYM-01 EC-2); if the run finds
  the issuer unavailable it records `dues.run_failed` (owners' bell) and retries next day.
- EC-3 The last part's date falls after an early end (term cancelled on 15 Oct): cancelled with the
  schedule; nothing is raised.

### 14. Future
One invoice with expected dates instead of an invoice per part: decided against for now (C5 → R53,
ADR-059); it is reconsidered if the CA's answer to T7 requires the whole term to be invoiced at sale;
penalties for late parts; standing instructions (needs a gateway, never claimed).

---

## GYM-08 — Renewal and rejoin

### 1. Product requirements
Renewal is where the money is (research §1). The desk renews in two taps from the renewals list, the
member page or the check-in banner; the new term's start date follows the tenant's rule, **by default
continuous within grace**: renewed on or before `end_on + grace_days` → the new term starts the day
after the old one ends; renewed later → it starts today and the sale is a **rejoin**, with the joining
fee charged only when the gap exceeds `gym.rejoin_fee_after_days` (default 90).

### 2. User flows
- **F-1 Renew** (`/gym/sell?renew=<term id>`): the sale screen prefilled with the same plan at today's
  price and the proposed start; the desk may change the plan and (audited) the start date.
- **F-2 Early renewal**: the new term is `upcoming` and shows on the member page as "Next: 1 Jan – 31
  Mar 2027".
- **F-3 Rejoin**: an expired member ("Expired 40 days ago") → Renew → start today, fee rule applied.
- **F-4 Renewals list** `/gym/renewals`: tabs "Ending in 7 days", "In grace", "Expired this month",
  each with Remind (GYM-17) and Renew.

### 3. Features
**MVP:** the three start rules, early renewal chaining, rejoin with fee gap, renewals list, "honour old
price" override. **Later:** auto-renew suggestions for session packs at the last session; bulk renewal
(corporate batch).

### 4. Entities and relationships
New `gym_membership` with `renewal_of` → the term it continues (renewal) or the member's last access
term (rejoin); `sale_kind` `renewal` or `rejoin`.

### 5. Database
No new table. `gym_membership.renewal_of`, `sale_kind`. Index `(tenant, renewal_of)` where not null
(the retention report joins on it).

### 6. API
- `POST /api/v1/gym/memberships/{id}/renewal-quote` `{plan_id?, start_on?}` →
  `{data: {start_on, end_on, sale_kind, start_rule, joining_fee: {...}, lines, …}}` (the GYM-05 quote
  shape).
- Sell with `POST /api/v1/gym/memberships` and `renewal_of`. A start date different from the proposal
  is accepted and audited (`gym.membership.override_used` when it moves earlier than the proposal,
  because that gives away days).
- `GET /api/v1/gym/renewals?tab=ending|grace|expired&within=7&plan_id=&trainer_id=` →
  `{data: [{member, term, end_on, days_left | days_since, renewal_price, last_reminder_at}], meta: {counts, renewal_value}}`.
- Errors: as GYM-05.

### 7. Frontend
Route `/gym/renewals` (`RenewalsPage`), lazy slice `gymRenewalsSlice`, service
`api/gymRenewalService.ts` (`list`, `quote`). Renew reuses `/gym/sell`.

### 8. UI/UX
Renewals rows: name, caption "Quarterly · ends 5 Oct · ₹4,200", two trailing buttons at ≥ 768 px
(Remind, Renew) and one plus ⋯ at 360 px. The sale screen shows the rule in words under the start
date: "Starts the day after the current membership (renewed within grace)" / "मौजूदा सदस्यता खत्म
होने के अगले दिन से (छूट के दिनों में नवीनीकरण)". Tone: in grace `warning`, expired `danger`.

### 9. Validation and business rules
- BR-1 **Start rule** (`gym.renewal_start`, default `continuous_within_grace`), with `L` = the member's
  latest access term (the last one in the chain, upcoming included) and `today` the sale date:
  - `continuous_within_grace`: if `today ≤ L.end_on + grace_days` → `start_on = L.end_on + 1`,
    `sale_kind = renewal`; else `start_on = today`, `sale_kind = rejoin`;
  - `always_from_expiry`: `start_on = L.end_on + 1` always (back-fills lapsed days), `renewal`;
  - `always_from_today`: `start_on = max(today, L.end_on + 1)` (never overlaps), `renewal` if
    `today ≤ L.end_on + grace_days` else `rejoin`.
- BR-2 The end date follows GYM-05 BR-3 **from the new start** (never "old end plus a month").
- BR-3 **Joining fee on rejoin**: `gap_days = start_on − (last access day of L)`; the fee is due when
  `gap_days > rejoin_fee_after_days`. A renewal never charges it.
- BR-4 Renewal price is the plan's **current** price; "Honour old price" (`gym.membership.override`)
  uses `L.price` with a reason.
- BR-5 Renewal of a PT or class term follows the same rule on its own chain (terms of the same plan
  category and trainer or batch) and never charges a joining fee.

**Worked examples** (monthly plan, term 1 Sep – 30 Sep 2026, grace 5 days, so grace ends 5 Oct):

| Renewed on | Rule | New term | Kind | Joining fee |
|---|---|---|---|---|
| 25 Sep | continuous within grace (early) | 1 Oct – 31 Oct 2026 (upcoming until 1 Oct) | renewal | no |
| 3 Oct | continuous within grace (**in grace**) | 1 Oct – 31 Oct 2026 — the grace-day visits of 1–3 Oct fall inside the new term | renewal | no |
| 12 Oct | continuous within grace (**after grace**) | 12 Oct – 11 Nov 2026 | rejoin | no (gap 12 days ≤ 90) |
| 12 Oct | always from expiry | 1 Oct – 31 Oct 2026 | renewal | no |
| 3 Oct | always from today | 3 Oct – 2 Nov 2026 | renewal | no |

**Rejoin after a gap** (access term ended 30 Jun 2026, `rejoin_fee_after_days` 90):

| Rejoins on | Gap | New term (monthly) | Joining fee |
|---|---|---|---|
| 15 Aug 2026 | 46 days | 15 Aug – 14 Sep 2026 | no |
| 15 Nov 2026 | 138 days | 15 Nov – 14 Dec 2026 | **yes**, the plan's joining fee |

**Leap-year renewal**: a yearly term 1 Mar 2026 – 28 Feb 2027 renewed within grace starts 1 Mar 2027
and ends **29 Feb 2028**.

### 10. Permissions
Renew and rejoin: `gym.membership.sell`. A start earlier than proposed, and "honour old price":
`gym.membership.override`.

### 11. Reports
"Renewals due", "Lapsed members", "Retention" (renewed ÷ due, by month and plan) — GYM-20.

### 12. Testing
- T-GYM-08-1 `test_renewal_start_rules` — the worked tables row by row, for all three settings.
- T-GYM-08-2 `test_early_renewal_chains_after_upcoming` — two early renewals chain 1 Oct and 1 Nov.
- T-GYM-08-3 `test_rejoin_fee_gap_boundary` — gap exactly 90 → no fee, 91 → fee.
- T-GYM-08-4 `test_leap_year_renewal`.
- e2e: in-grace member at the desk → banner "Expired 3 days ago · Renew" → renew → banner gone.

### 13. Edge cases
- EC-1 Renewing a term that is frozen now: the renewal chains after the term's **current** end, and
  moves if the freeze ends early (GYM-09 BR-6).
- EC-2 Renewing to a different plan category (monthly access → yearly access): a renewal; access
  categories chain with each other.
- EC-3 A member with an upcoming renewal renews again: the third term chains after the second.
- EC-4 Grace days changed by the owner: applies to derived statuses from that moment; nothing stored
  moves.

### 14. Future
Suggested renewals at the last session of a pack; bulk corporate renewals; "renew for a year and save"
upsell copy.

---

## GYM-09 — Freeze and resume

### 1. Product requirements
A member travelling, ill or in exams asks to freeze. A freeze **extends the end date by the frozen
days** — the rule, not an option (research §6.5: a freeze that does not extend is "missing days",
which staff could record as nothing at all). Limits come from the plan: minimum days per freeze,
maximum total days per term, maximum number of freezes; the owner may exceed them with a reason.
Check-ins during a freeze are refused; an override ends the freeze that day.

### 2. User flows
- **F-1 Freeze** (member page ⋯ → Freeze): from (today or later; up to 7 days back), to, reason,
  optional fee (the plan's freeze fee, waivable). The screen shows "Ends 14 Feb 2027 instead of 31 Jan
  2027".
- **F-2 Resume early**: "Member is back" → resume date (default today) → the end date is recomputed
  from the days actually frozen.
- **F-3 Remove** a freeze that has not started.
- **F-4 At the desk** during a freeze: blocked "Frozen till 23 Dec"; an override (with reason) checks
  in and ends the freeze yesterday.

### 3. Features
**MVP:** freeze, resume, remove, limits with override, freeze fee through the port, upcoming terms
moved, session-pack validity moved. **Later:** medical-proof freeze type (the proof stays on paper;
only the type is recorded), freeze requests from members (needs member identity).

### 4. Entities and relationships
`gym_membership` 1 — * `gym_membership_freeze`; a freeze fee document is a `gym_membership_document`
row with role `freeze_fee`.

### 5. Database
`gym_membership_freeze`

| Column | Type | Constraint / note |
|---|---|---|
| `membership` | FK `gym_membership` RESTRICT | |
| `start_on` | `date` | |
| `planned_end_on` | `date` | `≥ start_on` |
| `actual_end_on` | `date` null | set on early resume, or on an override check-in; `start_on ≤ actual_end_on ≤ planned_end_on` |
| `days` | `smallint` | cache: `coalesce(actual_end_on, planned_end_on) − start_on + 1`; replayed by `test_freeze_days_replay` |
| `reason` | `varchar(160)` | 3–160 characters; Aadhaar-shaped numbers refused (GYM-21) |
| `override_reason` | `varchar(160)` default `''` | set when a limit was exceeded |
| `removed_at` | `timestamptz` null | a freeze removed before it started; excluded from every sum |
| `fee_document_id` | `uuid` null | |

CHECKs as in the table. Index `(tenant, membership, start_on)`. Two freezes of one term may not
overlap (service check under the term lock; `check_integrity` reports any).

### 6. API
- `POST /api/v1/gym/memberships/{id}/freezes/quote` `{start_on, planned_end_on}` →
  `{data: {days, new_end_on, moved_terms: [{id, start_on, end_on}], limits: {max_days, used_days, max_count, used_count, min_days}, fee}}`.
- `POST /api/v1/gym/memberships/{id}/freezes` `{start_on, planned_end_on, reason, charge_fee: bool, override_reason?, payment?}`
  (Idempotency-Key) → 201 `{data: {freeze, membership, moved_terms, document?}}`.
- `POST /api/v1/gym/freezes/{id}/resume` `{on}` → `actual_end_on = on − 1`.
- `DELETE /api/v1/gym/freezes/{id}` → only when `start_on > today`; sets `removed_at`.
- Errors: `membership_not_open` (term expired, cancelled…), `pause_limit_reached` (D `limit`,
  `used`, and `kind: "days" | "count" | "min"`), `freeze_overlaps_visit` (D `on_date`, `mark_id`),
  `freeze_ended`, `override_not_allowed` (a start more than `backdate_freeze_days` back without the
  owner role), `validation_error`.

### 7. Frontend
`FreezeDrawer` (`dynamic()`), `ResumeDialog`; freezes listed on the membership page. Service calls in
`gymMembershipService` (`freezeQuote`, `freeze`, `resume`, `removeFreeze`).

### 8. UI/UX
The drawer shows the consequence as a sentence, recalculated as dates change: "Frozen 14 days. Ends
14 Feb 2027 instead of 31 Jan 2027. Next membership moves to 15 Feb – 14 May 2027." Limits as a
small line: "12 of 30 freeze days used · 1 of 2 freezes". Over a limit: the line turns danger with
"Owner can allow" and an override reason field for holders of `gym.membership.override`. Hindi:
`gym.freeze.title` "सदस्यता रोकें"; `gym.freeze.resume` "सदस्य वापस आ गए"; `gym.freeze.moves` "खत्म
होने की तारीख {old} की जगह {new} होगी".

### 9. Validation and business rules
- BR-1 Allowed only when the term's snapshot allows it (`gym_membership.freeze_max_days > 0`, copied
  from the plan at sale, GYM-05 §5). A later change to the plan neither grants nor removes freezing on
  terms already sold.
- BR-2 The term's status on `start_on` must be `active` or `upcoming` (not in grace, expired or
  terminal); `start_on ≥ term.start_on` and `start_on ≤ term.end_on`.
- BR-3 Limits: `days ≥ freeze_min_days`; Σ days of non-removed freezes ≤ `freeze_max_days`; count of
  non-removed freezes ≤ `freeze_max_count` (0 = unlimited count). Exceeding any needs
  `gym.membership.override` and `override_reason`.
- BR-4 `start_on ≥ today − backdate_freeze_days` (default 7); earlier needs the owner role. A freeze
  may not start on or before a day in its window on which the member has a live check-in:
  `freeze_overlaps_visit`.
- BR-5 `end_on = base_end_on + Σ freeze.days + Σ extension.days` — always recomputed from the rows,
  never incremented (the LED-03 "second route" rule applies to this cache too).
- BR-6 **Upcoming terms move** (research §6.3): every later access term of the member in the chain is
  re-started at the previous term's new `end_on + 1` and its end **recomputed with GYM-05 BR-3** (not
  shifted by the same number of days — the two differ around month ends). Same transaction, same
  lock.
- BR-7 **Resume early** on day `r`: `actual_end_on = r − 1`, `days` recomputed; the term and the chain
  are recomputed as BR-5/BR-6. `r` must satisfy `start_on ≤ r ≤ planned_end_on + 1`; `r = start_on`
  is a removal.
- BR-8 **Check-in during a freeze** is blocked by the policy (GYM-14). With an override, the mark
  listener sets `actual_end_on = mark.on_date − 1` (or removes the freeze if it started that day) —
  the member is back.
- BR-9 Session packs: the freeze extends validity only. The same transaction calls
  `attendance.extend_entitlement(entitlement_id, valid_to=<new end_on>, reason="freeze")`, so the
  engine's `valid_to` always equals the term's `end_on` (C10 → R18); a resume that shortens the freeze
  calls it again with the earlier date.
- BR-10 Freeze fee: when `charge_fee` and the snapshot fee > 0, one document through the port, line
  "Freeze fee, {from} – {to}", the term's tax code and SAC, `credit_check="enforce"`, role
  `freeze_fee`. Waiving it needs no permission beyond `gym.membership.freeze` (it is optional by
  design) and is audited.

**Worked example** (research §6.5): quarterly term 1 Nov 2026 – 31 Jan 2027, plan allows 30 freeze
days, minimum 7. A renewal is already bought: 1 Feb – 30 Apr 2027.
1. Freeze 10 Dec – 23 Dec (14 days): `end_on` = 31 Jan + 14 = **14 Feb 2027**; the renewal moves to
   start 15 Feb and is recomputed: 15 Feb + 3 months → **15 Feb – 14 May 2027**.
2. The member returns on 19 Dec (resume `r` = 19 Dec): frozen 10 – 18 Dec = 9 days; `end_on` = 31 Jan
   + 9 = **9 Feb 2027**; the renewal starts 10 Feb and is recomputed: **10 Feb – 9 May 2027**.
3. Limits after this: "9 of 30 days used · 1 freeze".

**Limit example.** Yearly plan, 30 days × 2, minimum 7. First freeze 20 days (accepted). Second freeze
asked for 12 days → Σ 32 > 30 → 409 `pause_limit_reached` `{kind: "days", limit: 30, used: 20}`; the
drawer offers "Freeze 10 days". A 5-day freeze → `{kind: "min", limit: 7}`. A third freeze after two →
`{kind: "count", limit: 2, used: 2}`.

### 10. Permissions
Freeze, resume, remove within limits: `gym.membership.freeze`. Beyond limits:
`gym.membership.override`. Backdating beyond the window: owner role.

### 11. Reports
"Freeze log" (GYM-20): every freeze, days, reason, by whom, overrides flagged.

### 12. Testing
- T-GYM-09-1 `test_freeze_worked_example` — steps 1–3 to the day.
- T-GYM-09-2 `test_chain_recomputed_not_shifted` — a renewal starting 31 Jan moved by one day is
  recomputed (1 Feb + 1 month → 28 Feb, not 1 Mar).
- T-GYM-09-3 `test_freeze_limits` — days, min, count, override.
- T-GYM-09-4 `test_freeze_refused_over_visit` (BR-4).
- T-GYM-09-5 `test_override_checkin_ends_freeze` (BR-8, mark listener).
- T-GYM-09-6 `test_end_on_replays_from_rows` — fuzzed freezes and extensions vs a recompute.

### 13. Edge cases
- EC-1 A freeze running past the term's original end (research E11): allowed — the end moves out
  with it; a freeze is never on two terms.
- EC-2 A freeze on an upcoming term (starts in the future): allowed from its start.
- EC-3 Two desks freeze the same term at once: the term lock serialises; the second sees the first's
  days in the limit.
- EC-4 A freeze whose fee invoice is voided: the freeze stands (GYM-06 BR-2).
- EC-5 Closure days inside a freeze are not extended again (GYM-10 BR-3).

### 14. Future
Freeze types (medical, travel) with separate limits; a member-initiated freeze request; freeze
"credits" that carry into a renewal.

---

## GYM-10 — Extensions and closure days

### 1. Product requirements
The owner can give a member days (goodwill, a correction) and can extend **every** active or frozen
term when the gym closes (Diwali, renovation) with one action and one reason (research §6.13). No end
date moves without a row saying why. A closure also marks the days closed in the tenant calendar so
check-in and batch sessions know the gym is shut.

### 2. User flows
- **F-1 Extend one term**: membership ⋯ → Add days → days (± up to 365), reason.
- **F-2 Closure**: `/gym/closures` → New closure → from, to, reason → preview "142 memberships get 3
  days" → confirm.
- **F-3 Undo a closure**: reverses every extension it made and removes its closed days.

### 3. Features
**MVP:** single extension (positive or negative), bulk closure with preview, undo, calendar closed
days (module `gym`). **Later:** partial closures (a batch cancelled — the attendance session's
`cancelled` status covers it without extending memberships).

### 4. Entities and relationships
`gym_membership` 1 — * `gym_membership_extension` * — 0..1 `gym_closure`; `gym_closure` 1 — *
`platform_closed_day` (by date and `module='gym'`, no FK).

### 5. Database
`gym_membership_extension`: `membership` FK RESTRICT, `days smallint` (−365…365, ≠ 0), `kind
varchar(12)` (`goodwill`, `correction`, `closure`, `reversal`), `reason varchar(160)`, `closure` FK
`gym_closure` RESTRICT null, `reverses` FK self null (a reversal points at what it undoes; an
extension is never edited or deleted). Index `(tenant, membership)`, `(tenant, closure)`.

`gym_closure`: `from_on date`, `to_on date` (`≥ from_on`, at most 60 days), `reason varchar(60)`,
`extended_count int`, `reversed_at timestamptz null`. No two non-reversed closures overlap (service
check; `closure_overlap`).

### 6. API
- `POST /api/v1/gym/memberships/{id}/extensions` `{days, reason, kind}` → 201.
- `POST /api/v1/gym/closures/preview` `{from_on, to_on}` → `{data: {days, affected_count, sample: [...]}}`.
- `POST /api/v1/gym/closures` `{from_on, to_on, reason}` (Idempotency-Key) → 201
  `{data: {closure, extended_count}}` — runs in one transaction for up to 5,000 terms; above that it is
  a `platform_job` with progress (the bulk pattern of imports).
- `POST /api/v1/gym/closures/{id}/reverse` `{reason}`; `GET /api/v1/gym/closures`.
- Errors: `closure_overlap`, `membership_not_open`, `validation_error`.

### 7. Frontend
Route `/gym/closures` (`ClosuresPage`); `ExtendDrawer`, `ClosureDrawer` (`dynamic()`); service
`api/gymClosureService.ts`.

### 8. UI/UX
Closure preview states the effect before the button: "Gym closed 20–22 Oct (3 days). 142 memberships
end later: members get the closed days back." The confirm button reads "Close and extend 142". Hindi:
`gym.closure.title` "जिम बंद रहेगा"; `gym.closure.effect` "{count} सदस्यताएं {days} दिन आगे बढ़ेंगी".

### 9. Validation and business rules
- BR-1 Single extension: the term is not terminal; `end_on` after the change `≥ start_on` and, for a
  negative extension, `≥ today` (days already given and used cannot be taken back into the past).
- BR-2 Closure scope: every access, class and PT term whose `[start_on, end_on]` intersects the
  closure and which is not terminal.
- BR-3 Days given to a term = the closure dates inside `[start_on, end_on]` **minus** dates already
  covered by one of its freezes (the member is getting those back already).
- BR-4 The closure writes `platform_closed_day` rows (`module='gym'`, reason) for each date; check-in
  on a closed day **warns** "Gym is marked closed today" (it does not block — the owner may open for a
  few hours), and batch sessions on those days are not generated (`generate_sessions` skips closed
  days).
- BR-5 Chains move as GYM-09 BR-6.
- BR-6 Undo writes one `reversal` extension per closure extension (negative days), deletes the closed
  days of that closure, sets `reversed_at`.

**Worked example.** Closure 20 – 22 Oct 2026 (3 days):
- Rahul's quarterly 1 Oct – 31 Dec 2026 → +3 → **3 Jan 2027**.
- Asha's monthly 22 Sep – 21 Oct 2026: closure days inside = 20, 21 Oct → +2 → **23 Oct 2026**.
- Vikram, frozen 15 – 25 Oct, quarterly 1 Sep – 30 Nov (already extended to 11 Dec by the 11-day
  freeze): closure days inside the freeze = all three → +0; his end stays 11 Dec.
- Priya's monthly starting 21 Oct (upcoming on 20 Oct): days inside `[21 Oct, 20 Nov]` = 21, 22 Oct
  → +2 → ends **22 Nov 2026**.

### 10. Permissions
`gym.membership.extend` (owner, admin).

### 11. Reports
The freeze log includes closure extensions under their own heading; the audit log carries
`gym.closure.created|reversed`.

### 12. Testing
- T-GYM-10-1 `test_closure_worked_example` — the four members.
- T-GYM-10-2 `test_closure_overlap_refused`.
- T-GYM-10-3 `test_closure_undo_restores_end_dates`.
- T-GYM-10-4 `test_checkin_on_closed_day_warns`.

### 13. Edge cases
- EC-1 Closure entered twice for overlapping dates (research E16): refused.
- EC-2 A closure entered after the fact: allowed; it extends every non-terminal term that intersected
  it, including one that has expired since — its end moves out, which can bring it back into active
  or grace. That is the intended effect of giving back closed days, and the preview lists such terms
  separately ("5 expired memberships become active again").
- EC-3 A negative extension that would end a term before today: refused (BR-1).

### 14. Future
Holiday calendars shared with library and lending (the platform calendar already is); partial-day
closures; a notice to members about a closure (prepared text).

---

## GYM-11 — Upgrade and downgrade

### 1. Product requirements
A member moves to a different plan mid-term with the unused value carried over (research §6.6). The
old term ends yesterday (state `changed`), the new term starts today at its full price, and the money
is right in the existing pipeline: a **credit note** against the old invoice for the unused value,
**held as an advance** (`Settlement.HOLD_ADVANCE`), then applied to the new invoice. No negative
invoice line (sales lines require `qty > 0`). Owner and admin only by default.

### 2. User flows
- **F-1** Member page ⋯ → Change plan → pick the new plan → the change quote: "Unused: 77 of 92 days
  of Quarterly = ₹3,515.22 credit. Yearly ₹11,999.00. To pay ₹8,483.78." → optional credit override
  (a round figure, with a reason) → payment → **Change plan**.
- **F-2** Downgrade: the same screen; when the credit exceeds the new price, the rest "stays as advance
  on Rahul's account" or, for the owner, "Refund the rest" (hands over to GYM-13's refund step in the
  same transaction).
- **F-3** After save: documents list shows the credit note and the new invoice; the card can be
  reprinted with the new dates.

### 3. Features
**MVP:** upgrade and downgrade between any two plans of the same category family (access ↔ access,
class ↔ class, PT ↔ PT); day-ratio and session-ratio pro-rating; credit override; instalment-aware
credit; chain move of upcoming terms. **Later:** undo a change; a change effective on a future date
(for example "from next month").

### 4. Entities and relationships
Old `gym_membership` (`state='changed'`, `ended_on = change_on − 1`) ← `changed_from` — new
`gym_membership` (`sale_kind` `upgrade` or `downgrade`); `gym_membership_document` rows: the credit
note(s) on the old term (`role='change_credit'`), the new invoice on the new term (`role='sale'`).

### 5. Database
No new table. `gym_membership.changed_from`; `sale_kind` values `upgrade` (new price > old price) and
`downgrade` (otherwise).

### 6. API
- `POST /api/v1/gym/memberships/{id}/change-quote` `{plan_id, change_on?, credit_override?: {amount, reason}}` →
  ```json
  {"data": {"old": {"start_on": "2026-10-01", "end_on": "2026-12-31", "total_days": 92,
     "used_days": 15, "remaining_days": 77, "ratio": "77/92", "taxable_price": "4000.00",
     "invoiced_taxable": "4000.00"},
   "credit": {"taxable": "3347.83", "tax": "167.39", "total_before_round_off": "3515.22",
     "round_off": "-0.22", "total": "3515.00", "against": [{"document_id": "…", "number": "INV/26-27/0311"}]},
   "new": {"start_on": "2026-10-16", "end_on": "2027-10-15", "price": "11999.00"},
   "to_pay": "8484.00", "sale_kind": "upgrade", "moved_terms": []}}
  ```
- `POST /api/v1/gym/memberships/{id}/change` (Idempotency-Key) with the quote payload plus
  `payment?`, `remainder: "hold_advance" | "refund"` (refund needs the owner role), `refund?` →
  201 `{data: {old, new, credit_notes: [IssuedDocument], document: IssuedDocument, payment?}}`.
- Errors: `membership_not_open` (only an `active` term may change; a frozen one is resumed first,
  in the same call, if `resume_freeze: true`), `validation_error` (same plan; category family
  mismatch; override above the ceiling), `override_not_allowed` (refund remainder without the owner
  role), `document_origin_locked` (a credit on a document that cannot take one), port errors.

### 7. Frontend
`ChangePlanPage` at `/gym/memberships/[id]/change` (a page, not a drawer: it carries a quote, a
payment block and possibly a refund block; the phone would scroll a drawer inside a drawer). Lazy
slice `gymChangeSlice`; service calls `changeQuote`, `change` in `gymMembershipService`.

### 8. UI/UX
The quote is three stacked cards — "What's left of Quarterly", "New plan", "To pay" — each figure a
`UbAmount` grouped with `formatInr`. The ratio is shown as words and numbers ("77 of 92 days left"),
because the member will check it (shared-engines §2.6: "the formula is printed … because the customer
will check it"). The credit note's line on print reads "Unused Quarterly membership, 16 Oct – 31 Dec
2026 (77 of 92 days)". Hindi: `gym.change.unused` "बचा हुआ हिस्सा"; `gym.change.toPay` "देने हैं";
`gym.change.keepAdvance` "बाकी रकम खाते में जमा रहेगी".

### 9. Validation and business rules
- BR-1 The old term is `active` on `change_on`. `change_on` defaults to today; a date up to 7 days
  back needs the owner role; a future date is not allowed in the MVP (§14).
- BR-2 **Unused ratio.** `total_days = end_on − start_on + 1` (the current end, freezes and extensions
  included), `remaining_days = end_on − change_on + 1`. Session plans: `min(remaining_sessions /
  sessions_total, remaining_days / total_days)`.
- BR-3 **Credit value.** Let `P` = the old term's taxable price (excluding the joining fee, which is
  never refunded or credited), `I` = the taxable value **invoiced so far** for the term's line(s)
  (sale part plus raised instalment parts), `U = P × used_days / total_days` (the value consumed).
  Credit taxable `C = max(0, I − U)`, rounded half-up to paise. For a fully invoiced term `I = P` and
  `C = P × remaining / total` (the research formula). When `I < U` (a term on instalments changed early,
  consumed more than invoiced) the shortfall `U − I` is added to the **new invoice** as a line
  "Balance of {old plan}, {start} – {change_on − 1}" at the old term's tax code, and `C = 0`.
- BR-4 **Credit note(s).** `documents.issue_credit_note(against_id=<invoice>, origin_type=
  "gym_membership", origin_id=<old term>, lines=[…], settlement="hold_advance", reason="Plan changed to
  {new plan}")`, one per invoice credited, **newest invoice first**, each capped by that invoice's
  uncredited value on the term's line. The line is a **value credit** (`CreditLine{against_line_id,
  taxable_value}`, exact paise, tax copied from the invoice line; C2 → R51, ADR-057), so the credit
  equals the quote to the paisa and the invoice line's `returned_qty` does not move.
- BR-5 Sales applies each credit note to its own invoice's open amount first (SAL-04 BR-3: an
  unpaid part is cleared before anything is held); the rest is open credit — an advance.
- BR-6 **New term** from `change_on`, full current price (or an override), no joining fee (not a first
  term, no gap), issued as in GYM-05 with `apply_open_advances: True` **and the open credit notes from
  BR-4 applied to it** through `IssueRequest.apply_credit_note_ids=[…]` (C1 → R50); the issuer
  applies them before it allocates payments, and the payment covers the remainder. `check_integrity`
  still lists any gym credit note left open for more than a day, as a guard.
- BR-7 **Old term**: `state='changed'`, `ended_on = change_on − 1`; its schedule ends (GYM-07 BR-6);
  its batch enrolment ends; a running freeze is resumed first (`actual_end_on = change_on − 1`).
- BR-8 **Chain**: an upcoming access term after the old term is moved to start after the new term's
  end and recomputed (GYM-09 BR-6). The quote lists it.
- BR-9 **Override** (`credit_override`): any amount `0 ≤ C' ≤ I − (credit already issued on the term)`
  with a reason; audited `gym.membership.override_used`.
- BR-10 **Rounding.** The credit note inherits its invoice's round-off (sales copies
  `round_off_enabled` from the invoice). With round-off on (the tenant default), a credit of ₹3,515.22
  prints as ₹3,515.00 (round-off −₹0.22). Whether a credit note should round is a CA question
  ([T13](#tax-review-items-for-a-ca)).
- BR-11 Payer: the credit note goes to the old invoice's party; the new invoice to the new term's
  payer. If they differ, the credit cannot apply to the new invoice (sales requires the same party)
  and stays as the old payer's advance; the quote says so.

**Worked example — upgrade** (research §6.6; prices include 5% GST):
- Old: Quarterly ₹4,200.00 (taxable ₹4,000.00, GST ₹200.00), 1 Oct – 31 Dec 2026, **92 days**, fully
  paid.
- Upgrade to Yearly ₹11,999.00 on **16 Oct 2026**: used 15 days (1–15 Oct), remaining **77 days**.
- Credit taxable = 4,000.00 × 77 ÷ 92 = **₹3,347.83**; GST 5% = ₹167.39 (CGST ₹83.70, SGST ₹83.69);
  credit note **₹3,515.22** before round-off.
- New invoice: "Yearly membership, 16 Oct 2026 – 15 Oct 2027" **₹11,999.00** (taxable ₹11,427.62,
  CGST ₹285.69, SGST ₹285.69).
- Apply the credit: the member pays **₹8,483.78** with round-off off, or **₹8,484.00** with the
  tenant's default round-off (credit note ₹3,515.00).
- (The quantity-credit fallback, ₹3,515.40, is withdrawn: value credits are exact, R51.)

**Worked example — downgrade.** Yearly ₹11,999.00 (taxable ₹11,427.62), 1 Oct 2026 – 30 Sep 2027,
365 days, paid. Downgrade to Monthly ₹1,500.00 on 1 Nov 2026: used 31, remaining 334. Credit taxable
= 11,427.62 × 334 ÷ 365 = ₹10,457.06; GST ₹522.85 (CGST ₹261.43, SGST ₹261.42); credit ₹10,979.91
(₹10,980.00 with round-off). New invoice "Monthly membership, 1 Nov – 30 Nov 2026" ₹1,500.00, fully
covered by the credit; **₹9,479.91** (₹9,480.00) stays as an advance on the member's account for the
next renewals, or the owner refunds it (GYM-13).

**Worked example — changed while on instalments.** Quarterly ₹4,200 in two parts of ₹2,100 (GYM-07),
only part 1 invoiced (`I` = ₹2,000.00 taxable), upgraded on 16 Oct: `U` = 4,000 × 15 ÷ 92 = ₹652.17;
`C` = 2,000.00 − 652.17 = ₹1,347.83 taxable (₹1,415.22 with GST); part 2 is cancelled with the
schedule. Had the change been on 20 Dec (used 80 days, `U` = ₹3,478.26 > `I`), `C` = 0 and the new
invoice carries "Balance of Quarterly, 1 Oct – 19 Dec 2026" ₹1,478.26 taxable plus tax.

### 10. Permissions
`gym.membership.change` (owner, admin); credit override: `gym.membership.override`; refunding a
remainder: owner role.

### 11. Reports
"Membership sales" shows the change as `upgrade`/`downgrade` with the credit; the GST summary shows
the credit note in its own section (sales).

### 12. Testing
- T-GYM-11-1 `test_upgrade_worked_example` — both round-off settings, to the paisa, against the live
  issuer.
- T-GYM-11-2 `test_downgrade_remainder_stays_advance`.
- T-GYM-11-3 `test_change_on_instalments_credit_and_shortfall` — both branches of BR-3.
- T-GYM-11-4 `test_change_moves_upcoming_chain`.
- T-GYM-11-5 `test_change_is_one_transaction` — a port failure on the new invoice leaves the old
  term active and no credit note.
- T-GYM-11-6 `test_joining_fee_never_credited`.

### 13. Edge cases
- EC-1 Change on the term's first day: remaining = total; the whole taxable price is credited.
- EC-2 Change on the last day: remaining 1 day.
- EC-3 Change of a session pack with 5 of 12 used on day 16 of 60: ratio `min(7/12, 45/60)` = 7/12.
- EC-4 The old invoice already partly credited (an earlier goodwill note): the cap of BR-4 applies.
- EC-5 Voiding the new invoice later: GYM-06 EC-3.

### 14. Future
Undo a change; future-dated changes; family plan splits.

---

## GYM-12 — Transfer to another person

### 1. Product requirements
The owner moves the remaining period of a term to another person (research §6.7): the old term ends
the day before the transfer (state `transferred`), and the recipient gets a new term with
`transferred_from`, **price 0 and no invoice** — the money was received from the original payer and
stays on their invoice. A transfer fee, if the tenant sets one, is an ordinary sales line to whoever
pays it. Transfers can be switched off (`gym.transfer_allowed`).

### 2. User flows
- **F-1** Member page ⋯ → Transfer → pick or create the recipient member → the quote: "Remaining: 1
  Oct 2026 – 31 Mar 2027 (182 days). Transfer fee ₹0. Joining fee for Priya: ₹500 (first membership)
  — waive?" → **Transfer**.
- **F-2** After save: both member pages show the link ("Transferred to Priya on 1 Oct").

### 3. Features
**MVP:** transfer of access, class and PT terms (PT keeps the trainer unless changed), session packs
(remaining sessions move), transfer fee, joining fee rule for the recipient. **Later:** transfer
between branches; limits such as "once a year" (Crunch India's rule, research S5) as a setting.

### 4. Entities and relationships
Old term `state='transferred'`; new term `transferred_from` → old; optional transfer-fee document with
`role='transfer_fee'` on the new term.

### 5. Database
No new table.

### 6. API
- `POST /api/v1/gym/memberships/{id}/transfer-quote` `{to_member_id | to_member: {...}, transfer_on?}`.
- `POST /api/v1/gym/memberships/{id}/transfer` (Idempotency-Key) `{to_member_id, transfer_on, fee_payer: "from" | "to", waive_joining_fee?, reason, payment?}` →
  201 `{data: {old, new, document?}}`.
- Errors: `transfer_disabled`, `membership_not_open` (needs an `active` term with ≥ 1 day left),
  `membership_overlap` (the recipient has an overlapping access term), `validation_error`
  (recipient is the same member).

### 7. Frontend
`TransferDrawer` (`dynamic()`), reusing the member picker and the GYM-02 create drawer.

### 8. UI/UX
The drawer shows both names with an arrow and the period that moves. Copy: `gym.transfer.title`
"Transfer membership" / "सदस्यता किसी और को दें"; `gym.transfer.moves` "{from} – {to} moves to {name}"
/ "{from} – {to} {name} को मिलेगा".

### 9. Validation and business rules
- BR-1 The old term is `active` on `transfer_on` (default today) with at least one day left.
- BR-2 Old: `state='transferred'`, `ended_on = transfer_on − 1`. New: `start_on = transfer_on`,
  `base_end_on = end_on = old.end_on` (the old term's freezes and extensions already moved it; they
  are the old member's history), `price = 0`, `sale_kind='transfer'`, snapshot copied, freeze limits
  reduced by what the old term used.
- BR-3 Session packs: the new entitlement's total = the old term's remaining sessions.
- BR-4 The original payer's dues schedule (GYM-07) **stays** on the old term: they still owe the price
  they agreed. The recipient owes only the fees below.
- BR-5 Joining fee for the recipient per GYM-05 BR-6 (first access term, or gap > 90 days), unless
  waived with a reason; transfer fee `gym.transfer_fee` (default ₹0) to `fee_payer`. Both, when due,
  go on one document through the port (role `transfer_fee`; lines "Transfer fee", "Joining fee").
- BR-6 The recipient's overlap check is GYM-05 BR-5.

**Worked example** (research §6.7): Yearly 1 Apr 2026 – 31 Mar 2027 transferred on 1 Oct 2026 → the
old term ends **30 Sep 2026**; the new term is **1 Oct 2026 – 31 Mar 2027**, price ₹0; the recipient,
new to the gym, owes the ₹500 joining fee unless waived.

### 10. Permissions
`gym.membership.change`.

### 11. Reports
"Membership sales" lists transfers with ₹0 and any fee; retention treats a transfer as neither a lapse
nor a renewal.

### 12. Testing
- T-GYM-12-1 `test_transfer_worked_example`.
- T-GYM-12-2 `test_transfer_keeps_original_payer_schedule`.
- T-GYM-12-3 `test_transfer_disabled_setting`.
- T-GYM-12-4 `test_transfer_pack_moves_remaining_sessions`.

### 13. Edge cases
- EC-1 Transfer to a family member who is a minor: the recipient needs a guardian (GYM-02 BR-4).
- EC-2 The old term is frozen: resume it first (the drawer offers it).
- EC-3 Voiding the old sale invoice after a transfer: refused by `check_void` (GYM-06 BR-3).

### 14. Future
Transfer limits and windows; branch transfers.

---

## GYM-13 — Cancel and refund

### 1. Product requirements
The owner cancels a term with or without a refund (research §6.9). Many gyms have a no-refund policy;
the product supports both. **Refunds are owner-only** — a role check, not a delegable codename, because
money leaves the business (the LED-03 rule: a business ceiling is not delegable). The system proposes
the pro-rated unused value less a cancellation charge; the owner enters the final amount (0 up to what
was paid, never more). The money moves through a credit note with `Settlement.REFUND` and sales'
refund seam, which records the payment out.

### 2. User flows
- **F-1 Cancel without refund** (owner, admin): ⋯ → Cancel → effective date (default today; access
  stops after it) → reason → Cancel.
- **F-2 Cancel with refund** (owner): the same screen with "Refund" on: proposed "Unused 77 of 92 days
  ₹3,515.22 − cancellation charge ₹0 = ₹3,515.22; the unpaid ₹1,700 is cleared first; refund up to
  ₹1,815.22" → final amount → refund mode (cash, UPI, bank…) → Cancel and refund. The receipt for the
  payment out prints from the success sheet.

### 3. Features
**MVP:** cancel with an effective date, refund proposal, cancellation charge setting, owner-only
refund, clearing an unpaid balance first, schedule end. **Later:** refund requests queued for the owner
from the desk (a notification) — until then the desk tells the owner.

### 4. Entities and relationships
Term `state='cancelled'`, `ended_on`; credit note `role='refund_credit'`; the refund payment is
payments' (`direction='out'`, `context='refund'`, `meta.credit_note_id`), created by sales' refund seam
and returned to gym as `IssuedDocument.refund_payment` (C4 → R52).

### 5. Database
No new table. Setting `gym.cancellation_charge` (`{type: "amount" | "percent", value}`, default
amount 0).

### 6. API
- `POST /api/v1/gym/memberships/{id}/cancel-quote` `{effective_on?}` →
  `{data: {unused: {taxable, tax, total}, charge, proposed_refund, open_due, max_refund, paid}}`.
- `POST /api/v1/gym/memberships/{id}/cancel` (Idempotency-Key)
  `{effective_on, reason, refund?: {amount, payment_date, mode_breakup: [{mode, amount, reference?}], note?}}` →
  200 `{data: {membership, credit_note?, refund_payment?}}`.
- Errors: `membership_not_open`, `override_not_allowed` (refund by a non-owner; D `required_role:
  "owner"`), `refund_exceeds_paid` (D `paid`, `refundable`), `validation_error` (reason 3–160, date).

### 7. Frontend
`CancelMembershipPage` at `/gym/memberships/[id]/cancel`; the refund block renders only for the owner
role (the server still checks). Service calls `cancelQuote`, `cancel`.

### 8. UI/UX
The page opens on the non-destructive state: refund off, reason empty, the Cancel button secondary
until a reason is typed. With refund on, the arithmetic is a small table that the owner can read out to
the member. Copy: `gym.cancel.title` "Cancel membership" / "सदस्यता रद्द करें"; `gym.cancel.refund`
"Refund" / "पैसे वापस करें"; `gym.cancel.clearedFirst` "₹{due} still unpaid is cleared first" /
"पहले ₹{due} बाकी रकम कटेगी".

### 9. Validation and business rules
- BR-1 The term is not terminal; `effective_on ≥ today` for staff-free cases, ≥ `start_on − 1`; access
  stops after `effective_on` (`ended_on = effective_on`). Cancelling an upcoming term ends it the day
  before its start.
- BR-2 **Proposal**: the unused value of GYM-11 BR-2/BR-3 from `effective_on + 1` (GST at the term's
  rate), minus the cancellation charge (percent of the unused value or a fixed amount, never below 0).
- BR-3 **Owner only**: any refund > 0 needs `ctx.role == "owner"`; otherwise 403
  `override_not_allowed`. Cancel without refund needs `gym.membership.cancel`.
- BR-4 **Money**: the credit note for the final amount `F` (tax inclusive; taxable back-computed at
  the term's rate) against the sale invoice(s) newest first, `settlement="refund"`, with the refund
  payload. Sales applies the credit to the invoice's open amount first and refunds at most the rest
  (SAL-04 BR-3, `record_refund`'s `open_credit` ceiling). `F = 0` issues no credit note.
- BR-5 **Cap**: `F ≤ min(unused value, paid on the term's documents)`, and the cash refunded
  `≤ F − open due cleared` → otherwise `refund_exceeds_paid`.
- BR-6 The term's schedule ends (GYM-07 BR-6), batch enrolment ends, a running freeze is resumed at
  `effective_on`, upcoming terms are **not** moved (they are separate purchases; cancelling them is a
  separate act).
- BR-7 The joining fee is never refunded.

**Worked examples** (Quarterly ₹4,200 incl. 5% GST, 1 Oct – 31 Dec 2026, cancelled effective 15 Oct,
so 77 days unused; no cancellation charge; round-off off):
- **Fully paid**: unused ₹3,515.22; the owner refunds ₹3,515.22 in cash; credit note ₹3,515.22
  (taxable ₹3,347.83), refund payment out ₹3,515.22, khata nets to zero.
- **Part paid** (paid ₹3,000 of the ₹4,700 invoice, ₹1,700 due): credit ₹3,515.22 clears the ₹1,700
  due first; at most **₹1,815.22** can be refunded; the owner refunds ₹1,815.
- **Unpaid** (₹0 paid): the credit clears the due; refundable ₹0 (research E17); the owner may still
  cancel without refund.
- **With a ₹500 cancellation charge**: proposed ₹3,015.22.

### 10. Permissions
Cancel: `gym.membership.cancel` (owner, admin). Refund: owner role (not grantable).

### 11. Reports
"Membership sales" shows cancellations and refunds; payments' own registers show the payment out.

### 12. Testing
- T-GYM-13-1 `test_refund_is_owner_only` — admin and staff get 403 even with every gym codename
  granted through `permissions_override` (the reason it is a role check).
- T-GYM-13-2 `test_part_paid_refund_clears_due_first`.
- T-GYM-13-3 `test_refund_cap`.
- T-GYM-13-4 `test_cancel_upcoming_ends_before_start`.
- T-GYM-13-5 `test_voiding_refund_payment_releases_credit` (sales FR-10 through gym's documents).

### 13. Edge cases
- EC-1 Death or long illness (research E21): cancel with a refund to the payer, or transfer to family
  (GYM-12).
- EC-2 Refund of a term paid by an employer: the refund goes to the payer party, never to the member.
- EC-3 A refund recorded in the wrong mode: void the refund payment (payments' void; sales releases
  the credit), then refund again.

### 14. Future
Refund requests from the desk to the owner's bell; refund policies by plan; statutory refund
timelines if a state requires them (none found for gyms in the research).

---

## GYM-14 — Desk check-in

### 1. Product requirements
Hundreds of check-ins a day, most at 6 am and 7 pm (research U4, persona "Front desk"). The desk finds
a member in two keystrokes or one scan, sees at a glance whether they may come in, and records the
visit in one tap. The attendance engine records the mark (ADR-050); the **gym's policy hook** decides:
**expired members are blocked** (override with a reason, audited), **members in grace are allowed with
a warning**, frozen and not-yet-started members are blocked, used-up session packs are blocked, dues
are shown (or warned or blocked, per setting). Success: p95 search ≤ 150 ms server, p95 check-in
≤ 250 ms server; a check-in takes ≤ 5 s at the counter.

### 2. User flows
- **F-1 Search and tap**: `/gym/check-in` opens with the search field focused; type "4821" (mobile
  last digits), "M-014" (code prefix) or "rah" (name) → top 5 cards with photo, name, code, plan, end
  date, status, sessions left, dues → tap **Check in** (or Enter when one match) → a banner: green
  "Rahul checked in · till 31 Dec", amber "Checked in. Expired 3 days ago — renew", or red "Expired on
  5 Oct" with **Renew** and **Let in (reason)**.
- **F-2 Scan** (GYM-16): the Scan button (only where `BarcodeDetector` supports QR) opens the camera;
  a read code runs F-1's search and, on a unique match, checks in.
- **F-3 Already here**: a second check-in within the dedupe window shows "Already checked in at
  06:12" (info tone) and records nothing.
- **F-4 Void** a mistaken check-in from today's list ("Wrong person", reason).
- **F-5 Today's list**: the right pane (tablet) or a tab (phone): the day's visits, newest first, with
  overrides flagged.

### 3. Features
**MVP:** fast search, policy with allow/warn/block, override with reason, dedupe, void, today's list,
session-pack consumption at the desk, closed-day warning, dues rule. **Later:** check-out and "in the
gym now", self check-in at a kiosk or the door (needs member identity, research §15.4), biometric and
turnstiles (hardware and a vendor SDK; biometric templates never reach the product, research §13a
point 7).

### 4. Entities and relationships
`attendance_mark` (engine): `group` = the tenant's "Front desk" group (GYM-01), `party` = member,
`context_type='gym_membership'`, `context_id` = the term, `method` `desk` or `qr`, `override_reason`,
`marked_by`. `attendance_entitlement_use` for session packs.

### 5. Database
No gym table. Engine indexes relied on (asked of the engine's FRD): `attendance_mark (tenant, on_date,
check_in_at desc)`, `(tenant, party, on_date)`, `(tenant, context_type, context_id)`. Gym's own for the
policy: `gym_membership (tenant, member_party, start_on)` and `gym_membership_freeze (tenant,
membership, start_on)` (GYM-05, GYM-09). The search uses `parties_party`'s trigram index on name,
`gym_member (tenant, member_code)` with `varchar_pattern_ops` for prefix, and the party trigram
index on mobile (GYM-02 §5).

### 6. API
- `GET /api/v1/gym/check-in/search?q=` (min 2 characters; digits ≥ 4 match the mobile's last digits,
  `M-` or a digit-led code matches the code prefix, otherwise the name) → at most 5:
  ```json
  {"data": [{"member_id": "…", "name": "Rahul Sharma", "member_code": "M-0142", "photo_url": "…",
    "term": {"id": "…", "plan_name": "Quarterly", "end_on": "2026-12-31", "sessions_left": null},
    "status": "in_grace", "days_since_end": 3,
    "preview": {"decision": "warn", "reason": "Expired 3 days ago · renew"},
    "dues": "1700.00", "checked_in_today_at": null}]}
  ```
  (`dues` only with `gym.membership.money_read`; no mobile in this response at all — the desk does not
  need it to let someone in.)
- `POST /api/v1/gym/check-ins` `{member_id, membership_id?, method: "desk" | "qr", override_reason?}`
  (Idempotency-Key) → 201 `{data: {mark_id, check_in_at, decision, warnings: [...], sessions_left?}}`.
  Errors: 409 `attendance_blocked` (D `reason`, `override_permission: "gym.membership.override"`),
  409 `attendance_duplicate` (D `mark_id`, `check_in_at`), 409 `entitlement_exhausted`, 404 (member
  not found or out of scope).
- `GET /api/v1/gym/check-ins?date=&member_id=&method=&overrides_only=` (today by default).
- `POST /api/v1/gym/check-ins/{mark_id}/void` `{reason}` → `attendance.void_mark` (gives a session
  back).

### 7. Frontend
Route `/gym/check-in` (`CheckInPage`), **statically imported** search and result card (the first tap
must not wait for a chunk — the `EntryActionsMenu` precedent); `OverrideDialog` and `VoidCheckInDialog`
are `dynamic()`. Lazy slice `gymCheckInSlice` (query, results, last banner, today's list); service
`api/gymCheckInService.ts` (`search` with 150 ms debounce — shorter than the 300 ms list default because
the desk types two or three characters and waits — `checkIn`, `list`, `void`).

### 8. UI/UX
- **The check-in screen** is built for a tablet on the desk and works on the receptionist's phone:
  - search field full width, 56 px tall, `inputMode="search"`, autofocus on open and **re-focused
    after every check-in** so the next member can be typed at once; the field clears after a
    successful check-in;
  - result cards 72 px tall with a 48 px photo disc, the name owning its line, caption "M-0142 ·
    Quarterly · till 31 Dec", the status badge in the caption, and a 48 × 48 px **Check in** button —
    the whole card is also tappable;
  - the result banner sits **above** the field (never under the on-screen keyboard), stays until the
    next search, and is announced with `aria-live="polite"` (assertive for a block);
  - blocked state: red banner with the reason, **Renew** (primary, opens the sale prefilled) and
    **Let in** (secondary; only for holders of the override codename; opens a reason dialog with the
    reason focused, 3–160 characters);
  - tablet landscape (≥ 1024 px): search and banner left 60%, "Today · 143 visits" list right 40%;
    phone: a tab bar "Check in · Today".
  - The measuring checks of the e2e sweep apply: no horizontal scroll at 360 px; every text node
    inside its box (the "Rename" → "e" class).
- **Colour and words**: green `success` "Checked in", amber `warning` "In grace", red `danger`
  "Not allowed", blue `info` "Already checked in". Always a word with the colour.
- **Hindi**: `gym.checkin.search` "नाम, मोबाइल के आख़िरी 4 अंक या सदस्य नंबर" ; `gym.checkin.done`
  "{name} की एंट्री हो गई · {date} तक"; `gym.checkin.grace` "एंट्री हो गई। सदस्यता {n} दिन पहले खत्म
  हुई — फिर से लें"; `gym.checkin.blocked` "एंट्री नहीं हो सकती: {reason}"; `gym.checkin.already`
  "{time} पर एंट्री हो चुकी है"; `gym.checkin.letIn` "फिर भी अंदर जाने दें".

### 9. Validation and business rules
- BR-1 **Context resolution** (gym, before calling the engine), for member `m` on day `d`: the access
  term whose status on `d` is `active` → else an active session pack of category `access` or `class`
  → else the access term in `in_grace` → else the latest term of any status (to produce the right
  refusal). No term at all → block "No membership · Sell one".
- BR-2 **Policy** `gym_checkin_policy(tenant, party_id, context_id, on)` → `PolicyResult`:

| Term status on `d` | Decision | Reason shown | Override |
|---|---|---|---|
| active (duration plan) | allow | — | — |
| active (session pack, sessions left) | allow, `entitlement_id` = the pack's | "{n} sessions left" | — |
| active (session pack, none left) | block | "No sessions left" | no (sell) |
| in grace | **warn** (`gym.grace_checkin = "warn"`, default) or block | "Expired {n} days ago · renew" | — / `gym.membership.override` |
| frozen | block | "Frozen till {date}" | `gym.membership.override`; the override ends the freeze (GYM-09 BR-8) |
| upcoming | block | "Starts {date}" | `gym.membership.override` |
| expired | **block** | "Expired on {date}" | `gym.membership.override` |
| cancelled / transferred / changed | block | "Cancelled on {date}" / "Transferred" / "Changed to {plan}" | `gym.membership.override` |

  Then, independently, the **dues rule** (`gym.dues_checkin_rule`): `show` (default: no effect on the
  decision; the card shows dues), `warn` (add "₹{amount} due since {date}"), or `block_after_days`
  (block when the oldest unpaid gym document or overdue instalment is older than
  `gym.dues_block_days`; override `gym.membership.override`). And the **calendar**: a closed day
  (`is_open(tenant, d, module="gym")` false) adds a warning. The final decision is the strongest:
  block > warn > allow.
- BR-3 The policy is **one indexed read** of the term, its freezes covering `d`, and — only when the
  dues rule is not `show` — the term's document projection and `dues.selectors.arrears`
  (ADR-050: the hottest desk path). An `EXPLAIN` test holds it.
- BR-4 Dedupe: the Front desk group's `dedupe_minutes` (`gym.checkin_dedupe_minutes`, default 180):
  a second check-in inside it → `attendance_duplicate`, shown as info. A later visit the same day
  (morning and evening) is recorded (research E14).
- BR-5 Override: `override_reason` 3–160 characters and the codename the policy names; audited by the
  engine (`attendance.mark.overridden`) and by gym (`gym.membership.override_used`).
- BR-6 Void: `gym.checkin.void` on the same day; an earlier day needs the owner or admin role;
  a voided pack visit gives the session back.
- BR-7 Time: the server's clock and the tenant's time zone decide the day (research E15, E25); a
  24-hour gym's visit at 00:30 belongs to the new day.
- BR-8 A trainer never uses this screen (no desk nav item); the endpoint is `gym.checkin.write` with
  scope, so a trainer's call for a member outside their scope is 404.

**Worked examples** (grace 5 days; Quarterly 1 Oct – 31 Dec 2026):

| Day | Status | Result at the desk |
|---|---|---|
| 15 Nov 2026 | active | green, recorded |
| 3 Jan 2027 | in grace (3 days) | amber "Expired 3 days ago · renew", recorded |
| 6 Jan 2027 | expired (grace ended 5 Jan) | red "Expired on 31 Dec", not recorded; "Let in" with a reason records it and flags it |
| 15 Dec 2026, frozen 10–23 Dec | frozen | red "Frozen till 23 Dec"; "Let in" records it and the freeze ends 14 Dec, so the end date is recomputed: 5 frozen days (10–14 Dec) → ends **5 Jan 2027** instead of 14 Jan |
| 12-session pack, 12th used | active, none left | red "No sessions left" with Sell |

### 10. Permissions
Check in: `gym.checkin.write`. Override: `gym.membership.override` (owner, admin; grantable to staff).
Void: `gym.checkin.void` + the role rule of BR-6. See dues on the card: `gym.membership.money_read`.

### 11. Reports
"Attendance register", "Absentees", "Peak hours" (GYM-20) from the engine's selectors; today's count
on the dashboard (GYM-19).

### 12. Testing
- T-GYM-14-1 `test_policy_table` — every row of BR-2, including the strongest-decision rule.
- T-GYM-14-2 `test_policy_is_one_query` — `assertNumQueries` for the `show` rule, and `EXPLAIN` uses
  indexes.
- T-GYM-14-3 `test_search_plan` — trigram name, code prefix, mobile suffix each use an index at
  5,000 members.
- T-GYM-14-4 `test_duplicate_within_window_not_recorded`.
- T-GYM-14-5 `test_override_needs_reason_and_codename`.
- T-GYM-14-6 `test_void_gives_back_session`.
- T-GYM-14-7 `test_search_has_no_mobile_key`.
- e2e: F-1 for an active, an in-grace, an expired and a frozen member; the field is focused after each
  check-in (asserted with `document.activeElement`, because jsdom's focus is not the browser's — the
  LED-01 lesson).

### 13. Edge cases
- EC-1 Shared family mobile (research E4): the last-4 search returns several; no auto check-in; the
  desk taps the right photo.
- EC-2 Two desks check the same member in at the same second: the engine's dedupe under its lock
  records one.
- EC-3 A member with an access term and a PT pack: the desk check-in uses the access term (no session
  consumed); PT sessions are logged by the trainer (GYM-18).
- EC-4 A member whose party is archived: not found by search (archived parties are excluded).
- EC-5 The network drops at the desk: the check-in shows "Not saved · Retry" and the same idempotency
  key is reused on retry (LED-01 FR-12); the product never claims offline mode.

### 14. Future
Check-out and live occupancy; kiosk and door self check-in with a rotating card token; turnstile
integration through an ADR; "not visited in 14 days" nudges on the desk card.

---

## GYM-15 — Batches and batch attendance

### 1. Product requirements
Studios and academies run batches ("6 am yoga", "evening kids' cricket") with a capacity and a
trainer, and mark attendance once per session (research W4, U13). A batch is a presence group in the
attendance engine; its enrolment is the engine's group membership; its sessions come from the shared
recurrence and skip closed days. Marking uses the same eligibility policy as the desk.

### 2. User flows
- **F-1 Create a batch** (owner): name, weekdays, start and end time, capacity, trainer.
- **F-2 Enrol**: automatically when a class plan tied to the batch is sold (GYM-04 `batch`), for the
  term's dates; or directly from the batch page ("Add member") for members whose access term includes
  classes.
- **F-3 Roll-call** (`/gym/batches/[id]/roll-call?date=`): the list of enrolled members, all absent by
  default, tap each present one, **Save** once. Late additions ("Add to today") for trial students or
  guests with a valid term.
- **F-4 Register**: the month's grid (members × sessions) for printing or sharing with a parent.

### 3. Features
**MVP:** batch CRUD with retire, capacity with owner override, enrolment through plans and directly,
sessions generated 14 days ahead, roll-call with the policy, monthly register print. **Later:** late
and excused statuses (the engine has them; the MVP marks present or absent), class booking with
waitlists (bookings engine), academy monthly fees per enrolment (GYM-22).

### 4. Entities and relationships
`gym_batch` 1 — 1 `attendance_group` (`mark_kind='presence'`, `subject_type='gym_batch'`,
`subject_id=batch.id`, recurrence from the batch's weekdays) 1 — * `attendance_group_member`
(enrolment) and * `attendance_session`; `gym_batch` * — 0..1 trainer party; `gym_plan.batch`.

### 5. Database
`gym_batch`

| Column | Type | Constraint / note |
|---|---|---|
| `name` | `varchar(60)` | unique `(tenant, lower(name))` where `status='active'` |
| `weekdays` | `smallint` | bitmask Mon=1 … Sun=64 (the `Recurrence.by_weekday` encoding), ≥ 1 |
| `start_time`, `end_time` | `time` | `end_time > start_time` |
| `capacity` | `smallint` | 1–500 |
| `allow_over_capacity` | `bool` default false | |
| `trainer_party` | FK `parties.Party` RESTRICT, null | a party with a `gym_trainer` profile |
| `attendance_group` | OneToOne `attendance.Group` RESTRICT | vertical → engine FK |
| `status` | `varchar(8)` | `active`, `retired` |
| `version` | `int` | |

Index `(tenant, status)`, `(tenant, trainer_party)`.

### 6. API
- `GET/POST /api/v1/gym/batches`, `GET/PATCH /api/v1/gym/batches/{id}`, `POST …/{id}/retire`.
- `GET /api/v1/gym/batches/{id}/members?on=`; `POST …/{id}/members` `{member_id, from_on, to_on?, over_capacity_reason?}`;
  `DELETE …/{id}/members/{party_id}?on=` (ends the enrolment).
- `GET /api/v1/gym/batches/{id}/roll-call?date=` →
  `{data: {session: {id, starts_at, status}, members: [{member_id, name, photo_url, mark: null | "present" | "absent", preview: {decision, reason}}]}}`
  (generates the session if it is due and missing).
- `POST /api/v1/gym/sessions/{id}/roll-call` `{present: [member_id], absent: [member_id], add: [member_id]}`
  → `{data: {marked: n, blocked: [{member_id, reason}]}}`.
- `GET /api/v1/gym/batches/{id}/register?month=2026-10` (JSON for the grid; print through the print
  pipeline).
- Errors: `batch_full` (D `capacity`, `enrolled`), `attendance_blocked` per member inside
  `blocked`, `validation_error`.

### 7. Frontend
Routes `/gym/batches` (`BatchesPage`), `/gym/batches/[id]` (`BatchPage`),
`/gym/batches/[id]/roll-call` (`RollCallPage`), `/gym/batches/[id]/register` (`BatchRegisterPrint`).
Lazy slice `gymBatchSlice`; service `api/gymBatchService.ts`.

### 8. UI/UX
Roll-call is a list of big rows (photo, name, a two-state toggle "Present"), a sticky bottom bar
"Save · 18 present of 24"; blocked members show greyed with the reason ("Expired on 5 Oct · ask the
desk") and cannot be toggled by a trainer. Works one-handed on a phone. The register prints A4
landscape with the tenant's name, P and A in the cells, and nothing else about the children
(shared-engines §4.9 point 6). Hindi: `gym.rollcall.save` "हाज़िरी सेव करें · {present}/{total}";
`gym.rollcall.present` "हाज़िर"; `gym.rollcall.absent` "गैरहाज़िर".

### 9. Validation and business rules
- BR-1 Capacity: under a lock on the `gym_batch` row, the count of enrolments overlapping the new
  enrolment's dates must be `< capacity`; else `batch_full`, unless `allow_over_capacity` or the owner
  gives an `over_capacity_reason` (research E19).
- BR-2 Selling a class plan with a batch enrols the member from `start_on` to `end_on`
  (`attendance.set_members`); freezes, extensions and changes move `to_on` with the term.
- BR-3 Sessions: `attendance.generate_sessions(group_id, until=today + 14)` in the daily job and on
  demand; closed days are skipped (calendar).
- BR-4 Roll-call save: for each **present** member, `attendance.check_in(session_id=…, context_type=
  "gym_membership", context_id=<resolved term>, method="roll_call")` so the policy and session-pack
  consumption apply exactly as at the desk ([C12](#contract-questions)); for each **absent** member,
  `attendance.roll_call(session_id, {party: "absent"})`. The unique `(session, party)` makes a second
  save an update, not a duplicate.
- BR-5 Blocked members are returned in `blocked` and not marked; a holder of the override codename
  (the desk) may mark them from the desk flow with a reason.
- BR-6 Editing a mark after the engine's window (24 h) needs `gym.checkin.void` and owner/admin
  (`attendance.edit_mark`).

### 10. Permissions
Manage batches and direct enrolment: `gym.batch.manage`. Roll-call: `gym.checkin.write` (a trainer:
own batches only, by scope). Register print: `gym.member.read`.

### 11. Reports
"Attendance register" and batch attendance % (engine `attendance_percent`, `register_grid`), with the
engine's rule that sessions before a member's enrolment are "not enrolled", not absent.

### 12. Testing
- T-GYM-15-1 `test_batch_capacity_under_concurrency`.
- T-GYM-15-2 `test_class_plan_sale_enrols_for_term`.
- T-GYM-15-3 `test_rollcall_uses_policy_and_consumes_pack`.
- T-GYM-15-4 `test_sessions_skip_closed_days`.
- T-GYM-15-5 `test_trainer_rollcall_other_batch_is_404`.
- e2e: trainer signs in (own context, asserting who is signed in first — the CLAUDE.md harness
  lesson), marks 3 of 5 present, one blocked member is refused.

### 13. Edge cases
- EC-1 Session cancelled (trainer absent): the session's `cancelled` status; no marks; excluded from
  percentages; packs not consumed.
- EC-2 A member joins mid-month: earlier sessions are "not enrolled".
- EC-3 A batch's trainer leaves: reassign (GYM-18 EC-1); history keeps the old trainer on past marks
  (`marked_by`).
- EC-4 Two trainers save the same roll-call: the unique `(session, party)` and the engine's lock keep
  one mark each.

### 14. Future
Late and excused statuses; per-session class booking with waitlists (bookings engine, research §15.5);
academy fees per enrolment (GYM-22); a parent-facing monthly register share link.

---

## GYM-16 — Membership card and QR scanning

### 1. Product requirements
Each member can be handed a card: the business's logo and name, the member's photo (if any), name,
member code, plan, valid-from and valid-to, and a **QR of the member code**, drawn locally by the
existing encoder (`apps/common/qr.py`, the UPI QR's). At the desk the QR is **scanned with the
browser's own `BarcodeDetector`** where it supports QR codes (Chrome on Android and desktop) and
**typed** everywhere else (Safari, Firefox) — no library is added (ADR-025, ADR-021). A hardware
scanner that types like a keyboard works on every browser because it types into the focused search
field. The card carries the tenant's name only.

### 2. User flows
- **F-1 Print one card**: member page ⋯ → Card → preview → Print (A4 sheet, the card at its real size
  85.6 × 54 mm with crop marks) or **Share as picture** (a phone-screen PNG).
- **F-2 Print many**: Members list → select → "Print cards" → an A4 sheet of up to 10 cards.
- **F-3 Scan at the desk**: Check-in → Scan → camera opens → the code is read → the member's card
  appears and, on a unique match, is checked in (GYM-14 F-2).
- **F-4 No camera support**: the Scan button is absent; the hint under the search field reads "Type
  the number on the card".

### 3. Features
**MVP:** card print sheet (single and bulk), share as picture, QR of the member code, native scanner
component with feature detection, keyboard-wedge support. **Later:** a rotating card token for door
self check-in (needs member identity); a universal JS decoder (needs an ADR, research Q16); card share
links (`parties_share_link`).

### 4. Entities and relationships
Reads `gym_member`, the current or next access term, `files_attachment` (photo), tenant branding.
No new entity.

### 5. Database
None.

### 6. API
- `GET /api/v1/gym/members/{id}/card` →
  ```json
  {"data": {"business": {"name": "Fit Zone", "logo_url": "…", "accent": "viz-3"},
   "member": {"name": "Rahul Sharma", "code": "M-0142", "photo_url": "…"},
   "term": {"plan_name": "Quarterly", "valid_from": "2026-10-01", "valid_to": "2026-12-31"},
   "qr": {"payload": "M-0142", "size": 21, "modules": ["111111101…", "…"]}}}
  ```
  `qr` from `common.qr.encode(member_code)` and `matrix_rows` (level M, byte mode; a member code fits
  version 1).
- `POST /api/v1/gym/cards` `{member_ids: [...]}` (≤ 50) → the same shape as a list, for the bulk sheet.
- Errors: `not_found`, `too_many_ids`.

### 7. Frontend
Routes `/gym/members/[id]/card` (`MemberCardPrint`) and `/gym/cards?ids=` (`MemberCardSheet`), both
print sheets using the existing print conventions (`@media print`, `window.print()`). Design-system
additions (task list): **`UbQrCode`** moved from `features/sales/components/print/UbQrCode.tsx` to
`src/design-system/UbQrCode/` (sales re-imports it from there; gym may not import sales), and
**`UbCameraScanner`** (`src/design-system/UbCameraScanner/`): props `{formats: ["qr_code"], onResult,
onUnavailable}`; it feature-detects `'BarcodeDetector' in globalThis` and
`BarcodeDetector.getSupportedFormats()` including `qr_code`, opens
`getUserMedia({video: {facingMode: "environment"}})`, runs `detect()` on video frames about eight times
a second, stops the stream on the first result or on close, and renders nothing when unsupported.
"Share as picture" draws the card's SVG to a canvas and calls `navigator.share({files})` where
available, else downloads the PNG (no dependency).

### 8. UI/UX
The card: logo top-left, business name, the member's photo on the left (or their initials), name in
`ds-h3` wrapping to two lines, code in `ds-mono`, plan and "Valid 1 Oct 2026 – 31 Dec 2026", QR at the
right, and at the bottom "Show this card at the desk. The desk checks validity." / "यह कार्ड डेस्क पर
दिखाएं। वैधता डेस्क पर जांची जाती है।" (the card shows dates at issue; the desk is the authority,
research §9). No mobile number, no price, no YourKhata name or domain. The scanner is a full-screen
sheet with a square viewfinder, a Close button, and an Enter-code link. Camera permission denied:
"Camera not allowed. Type the number on the card instead." and the sheet closes to the focused field.

### 9. Validation and business rules
- BR-1 QR payload is exactly the member code; the scanner accepts a scan only if it matches the code
  pattern of this tenant's `gym_member` kind (prefix + digits), otherwise "Not a membership card".
- BR-2 The card prints the **current** access term, or the next upcoming one if there is no current
  term; with neither, "No active membership".
- BR-3 A card never proves validity: every scan goes through the GYM-14 policy.
- BR-4 Tenant branding only; `customerDocumentsCarryNoProductName.test.tsx` covers both print sheets
  and the shared picture.

### 10. Permissions
Print and share: `gym.member.read` (a trainer may print for scoped members only). Scan: part of
check-in (`gym.checkin.write`).

### 11. Reports
None.

### 12. Testing
- T-GYM-16-1 `test_card_qr_decodes_to_member_code` — the encoder's own independent-decoder test
  pattern (`apps/common/qr.py` tests).
- T-GYM-16-2 `UbCameraScanner.test.tsx` — renders nothing without `BarcodeDetector`, calls
  `onUnavailable`; with a stubbed detector returns the first result and stops the tracks.
- T-GYM-16-3 `test_card_has_no_product_name` (the shared customer-documents test).
- T-GYM-16-4 e2e print sweep: the card sheet captured with `emulateMedia({media: "print"})` at the four
  widths; the measuring check asserts the name is not clipped.

### 13. Edge cases
- EC-1 Long names ("Venkatanarasimharajuvaripeta Subramanyam"): wrap to two lines, never truncate
  the code.
- EC-2 No photo: initials disc (a person, so initials are right here).
- EC-3 An old card after a renewal: still scans (the code is unchanged); the desk shows the new dates.
- EC-4 A card photographed and shown on another phone: works like the card; the desk sees the photo
  on screen to match the person.

### 14. Future
Rotating card tokens for self check-in; wallet passes (need signing keys, an ADR); a JS decoder if the
owner wants scanning on iPhones (an ADR amending ADR-025).

---

## GYM-17 — Expiry and renewal reminders

### 1. Product requirements
The front desk forgets to follow up (research §1, S6). The product puts every expiring member on a
list at set offsets from the end date (default −7, −3, 0 and +3 days), prepares the message, and
records that it was sent; the merchant sends it from their own phone (DEC-012: the product sends
nothing). Renewal notices are **notices** (no amount owed — `ReminderKind.NOTICE`, ADR-054);
instalment reminders are the dues engine's; balances on invoices are the core party reminders.

### 2. User flows
- **F-1 Daily round**: `/gym/renewals` → "Ending in 7 days" → **Remind** → the share sheet
  (WhatsApp, SMS app, copy) with the prepared text → sending records a manual reminder with
  `module='gym'`, `source_type='gym_membership'`, `source_id=<term>`.
- **F-2 Reminders screen** (core `/ledger/reminders`, filter "Gym"): the same candidates alongside
  dues reminders.
- **F-3 The bell**: once a day "12 memberships end this week" to members who can see renewals.

### 3. Features
**MVP:** reminder source with offsets, notice kind, prepared texts (English and Hindi), recipient
rule (guardian for minors), cap of one per term per day, bell notification. **Later:** automated
sending through a paid provider (DEC-012 must change first), welcome and freeze-ending texts as
candidates (the MVP offers them as share-sheet texts only, not list items).

### 4. Entities and relationships
`ledger_reminder` rows (core) with `module='gym'`, `source_type='gym_membership'`, `source_id`,
`kind='notice'`, `subject_label`, `snapshot_balance NULL`.

### 5. Database
No gym table (ADR-054 columns are core). Setting `gym.reminder_offsets` (default `[-7, -3, 0, 3]`).

### 6. API
Core endpoints serve the list and the send (`/ledger/reminders…`, `…/{id}/send`), each calling
`check_reminder_allowed`. Gym adds `GET /api/v1/gym/renewals` (GYM-08) with `last_reminder_at` and a
`POST /api/v1/gym/memberships/{id}/remind` `{channel}` convenience that records the manual reminder
through the core service and returns the prepared text: `{data: {text, recipient: {name, mobile?}}}`.
Errors: `reminder_cap_reached` (D `cap`, `next_allowed_at`), `reminder_not_sendable` (no mobile).

### 7. Frontend
Remind buttons on `/gym/renewals` and the member page open the existing `UbShareSheet` with the text;
templates in `locales/catalogues/gym.{en,hi}.json` under `gym.reminder.*`.

### 8. UI/UX
Prepared texts, signed with the business name only:
- `gym.reminder.before` — "Hi {name}, your {plan} membership at {business} ends on {end}. Renew for
  {price} to keep coming without a break. — {business}" / "नमस्ते {name}, {business} में आपकी {plan}
  सदस्यता {end} को खत्म हो रही है। बिना रुकावट आते रहने के लिए {price} में फिर से लें। — {business}"
- `gym.reminder.today` — "…ends today…" / "…आज खत्म हो रही है…"
- `gym.reminder.after` — "Hi {name}, your {plan} membership at {business} ended on {end}. Renew by
  {grace_end} to continue from where you left off. — {business}" / "…{end} को खत्म हो गई। {grace_end}
  तक फिर से लें तो सदस्यता वहीं से आगे चलेगी। — {business}"
- `gym.reminder.instalment` (dues) — "Hi {name}, part {n} of your {plan} membership, {amount}, is due
  on {due}. — {business}"
For a minor the greeting names the guardian: "Hi {guardian}, {name}'s {plan} membership…".

### 9. Validation and business rules
- BR-1 **Candidates** (`register_reminder_source("gym_membership", module="gym",
  candidates=gym_renewal_candidates)`): for day `d`, every access term (and session pack) not
  terminal, **with no later access term in its chain** (not already renewed), whose `end_on − d` is
  in `−offsets` (i.e. `d = end_on + offset` for each offset). Candidate: `party_id = member`,
  `source_type='gym_membership'`, `source_id = term`, `due_on = end_on`, `amount = None` (notice),
  `subject_label = "{plan} · ends {end}"` (≤ 120), `params = {"plan", "price", "ends_on"}` for the
  template (C8 → R10), `template_key` `gym.reminder.before |
  today | after`, `recipient_party_id` = the guardian with `receives_messages` for a minor, else
  `None` (the member).
- BR-2 **Policy** `register_reminder_policy("gym", {"daily_cap_per_source": 1})` — at most one
  reminder per term per day; no time window by default (10-architecture §16 item 4 is the owner's
  call); a tenant may narrow one through `reminders.gym.window`.
- BR-3 Renewing removes the term from every later day's candidates (BR-1's "no later term").
- BR-4 A frozen term's end date is its moved end date; reminders follow it.
- BR-5 The automated SMS job (LED-07) does not send gym notices in the MVP.
- BR-6 Notification `gym.renewals_due` (`register_notification_type`): category reminders, severity
  info, `required_permission="gym.member.read_all"`, title "{count} memberships end this week",
  route `/gym/renewals?tab=ending`, `group_window` 24 h; raised by the gym daily job only when count
  > 0.

**Worked example** (offsets −7, −3, 0, +3; term ends 5 Oct 2026): candidates on **28 Sep**, **2 Oct**,
**5 Oct** and **8 Oct**. The member renews on 2 Oct after the second reminder: no candidate on 5 or
8 Oct. A second "Remind" tap on 2 Oct → `reminder_cap_reached` with `next_allowed_at` 3 Oct 00:00.

### 10. Permissions
Remind: `ledger.reminder.write` (existing; staff hold it) and `gym.member.read_all`. Seeing the price
in the text requires nothing extra (the price is the renewal offer, not a figure owed).

### 11. Reports
"Renewals due" shows the last reminder per term; the core reminder history per party shows gym
notices with their subject label.

### 12. Testing
- T-GYM-17-1 `test_candidates_on_offsets` — the worked example.
- T-GYM-17-2 `test_renewed_term_leaves_candidates`.
- T-GYM-17-3 `test_minor_reminder_goes_to_guardian`.
- T-GYM-17-4 `test_cap_one_per_term_per_day`.
- T-GYM-17-5 `test_reminder_texts_have_no_product_name` and the Hindi catalogue has every key.

### 13. Edge cases
- EC-1 No mobile on the member or guardian: listed with "No mobile" and no send button.
- EC-2 Two terms of one member end the same day (access and PT): two candidates, two sources — the
  widened unique index `(party, due_on, kind, source_id)` keeps them apart (ADR-054).
- EC-3 Offsets changed by the owner: applies from the next day's list.

### 14. Future
Automated sending when a provider is paid for; welcome, freeze-ending and "we miss you" (absentee)
notices as candidates; a per-member opt-out for notices.

---

## GYM-18 — Trainer role and personal-training sessions

### 1. Product requirements
A trainer uses their own phone and must see **only their assigned members**, with **no money** (no
prices, dues, invoices, payments) and **no phone numbers** unless the owner grants contact visibility
(research §12: "a trainer leaving to start their own gym with the client list is a real owner
fear"). Assigned means: a term of the member names the trainer, or the member is enrolled in the
trainer's batch, or the trainer is the member's default trainer. The trainer marks their batches and
logs personal-training sessions, which consume the member's PT pack. This is the ADR-052 module role
`gym_trainer` with a fail-closed `scope_filter()`.

### 2. User flows
- **F-1 Owner adds a trainer**: Gym → Trainers (in Plans' settings area) → "Add trainer" → name,
  mobile, speciality → optional "Give a login": the team flow creates the account with role "Trainer
  (gym)"; the server mints a temporary password shown once; the owner sends it by hand (DEC-012).
- **F-2 Trainer signs in**: the menu shows Members (theirs) and Batches (theirs); nothing else.
- **F-3 Log a PT session**: My members → a PT client → "Log session" (today, now; note optional) →
  "Session 4 of 12 logged · 8 left".
- **F-4 Trainer leaves**: owner → trainer → Retire → "Reassign 23 clients and 2 batches to…" → pick.

### 3. Features
**MVP:** trainer profile, module role, scope filter, restricted fields, PT session logging (a mark),
bulk reassign, "My sessions" count on the trainer's home. **Later:** trainer payouts and commissions
(needs expenses or payroll, research §16), trainer availability and PT booking (bookings engine),
missed and member-cancelled session statuses.

### 4. Entities and relationships
`gym_trainer` 1:1 `parties_party`; `gym_trainer.membership` 0..1 → `platform_membership` (the login);
scope links: `gym_membership.trainer_party`, `gym_batch.trainer_party`,
`gym_member.default_trainer_party`. A PT session is an `attendance_mark` in the tenant's "Personal
training" group with `context_id` = the PT term and `marked_by` = the trainer's user.

### 5. Database
`gym_trainer`: `party` OneToOne `parties.Party` RESTRICT (`related_name="+"`); `membership` FK
`platform.Membership` SET NULL, null, unique `(tenant, membership)` where not null; `speciality
varchar(60)` default `''`; `is_active bool` default true; `retired_on date` null. Unique `(tenant,
party)`.

Module role row (data migration of the gym app, ADR-052): `platform_role(tenant=NULL, is_system=True,
code="gym_trainer", name="Trainer (gym)", permissions=["gym.member.read", "gym.checkin.write"])`,
assignable only while gym is enabled.

### 6. API
- `GET/POST /api/v1/gym/trainers`, `PATCH /api/v1/gym/trainers/{id}`, `POST …/{id}/retire`
  `{reassign_to_party_id?}` (owner/admin, `gym.batch.manage`).
- Trainer-scoped reads are the ordinary gym endpoints: `GET /gym/members`, `/gym/members/{id}`,
  `/gym/batches…` — `ScopedViewSetMixin` with `scope_all_permission="gym.member.read_all"`.
- `POST /api/v1/gym/pt-sessions` `{membership_id, at?, note?}` (Idempotency-Key) → the check-in
  path with the PT group and the PT term as context → 201 `{data: {mark_id, session_no, sessions_left}}`.
- `GET /api/v1/gym/pt-sessions?trainer_id=&member_id=&from=&to=`.
- Errors: 404 (out of scope — never 403, so existence is not revealed), `attendance_blocked` (term not
  active), `entitlement_exhausted`, `attendance_duplicate` (dedupe 30 minutes).

### 7. Frontend
The same pages, rendered from what the server sends: absent keys mean absent UI (no "₹—"
placeholders). Trainer home `/gym/members` defaults to "My members". `LogPtSessionDrawer`
(`dynamic()`). Team screen: the role picker lists "Trainer (gym)" only when gym is enabled (core team
feature reads the roles endpoint).

### 8. UI/UX
A trainer's member page: photo, name, code, plan, dates, sessions left, health-form date, "Log
session", visits — and nothing about money or contact. The ⋯ sheet has no Freeze, Renew or Card
unless held. Copy: `gym.trainer.myMembers` "My members" / "मेरे सदस्य"; `gym.pt.log` "Log session" /
"सेशन दर्ज करें"; `gym.pt.logged` "Session {n} of {total} logged · {left} left" / "सेशन {n}/{total}
दर्ज · {left} बाकी".

### 9. Validation and business rules
- BR-1 **Scope filter** (required, fail closed): for the signed-in member's trainer party `t`
  (`gym_trainer.membership = request.membership`), members `m` such that
  - a term of `m` that is not terminal, or ended within the last 30 days, has `trainer_party = t`; or
  - `m` has an attendance group membership active today in a batch with `trainer_party = t`; or
  - `m.default_trainer_party = t`.
  A signed-in user with `gym_trainer` but no `gym_trainer` profile row sees **nothing**.
- BR-2 **Restricted fields** (`RestrictedFieldsMixin`): `mobile`, `email`, `emergency_contact_*`,
  guardian and payer contact → `gym.member.contact`; `price`, `discount_amount`, `joining_fee_*`,
  `dues`, `documents`, `instalments`, payer name → `gym.membership.money_read`; `id_seen_*`,
  `date_of_birth` (age band "under 18" is shown instead) → `gym.member.write`. The trainer holds none.
- BR-3 A PT session: the term is a `pt` term, active today, `trainer_party = t` (or the actor holds
  `gym.member.read_all`, i.e. the desk logs on a trainer's behalf and names the trainer); consumes one
  entitlement use; void through the desk (GYM-14 BR-6) gives it back.
- BR-4 Trainer contact visibility: `gym.trainer_sees_contact` (default off) grants
  `gym.member.contact` to the `gym_trainer` role **per tenant** through each trainer's
  `permissions_override.allow` (the role row is global; a tenant's choice is per member).
- BR-5 Retire: `is_active = false`, `retired_on`; the reassign moves `trainer_party` on non-terminal
  terms, batches and default trainer in one transaction; marks keep `marked_by`.
- BR-6 **Engine read endpoints** must not widen the scope: they return every gym row of the tenant,
  unscoped. The gym's entries in `ENGINE_READ_PERMISSIONS` (00-core-and-engines CQ-24) are therefore
  codenames a trainer never holds — `attendance: gym.member.read_all`, `dues:
  gym.membership.money_read` ([C13](#contract-questions)) — and the test below proves a trainer gets
  403 there.

### 10. Permissions
As §0.7; the trainer's two codenames are scoped by BR-1.

### 11. Reports
"Trainer sessions" (GYM-20): PT sessions per trainer per month, per member, sessions left — the basis
for payouts done outside the product (owner, admin). The trainer's own count shows on their home, not
as a report.

### 12. Testing
- T-GYM-18-1 `test_trainer_sees_only_scoped_members` — list and detail; out-of-scope id → 404.
- T-GYM-18-2 `test_trainer_payload_has_no_money_or_contact_keys` — every gym endpoint a trainer can
  reach, keys asserted absent.
- T-GYM-18-3 `test_trainer_blocked_from_core_endpoints` — `/parties`, `/ledger…`, `/payments…`,
  `/sales…`, `/reports/dashboard` → 403.
- T-GYM-18-4 `test_trainer_blocked_from_engine_reads` (BR-6).
- T-GYM-18-5 `test_scope_filter_is_required` — a gym viewset without `scope_filter` fails its test
  (ADR-052's base class raises).
- T-GYM-18-6 `test_pt_session_consumes_and_void_restores`.
- e2e: a trainer context of its own, asserting the signed-in user's name before any check (the
  CLAUDE.md harness lesson); menu count, a member page with no ₹ and no mobile anywhere in
  `innerText`.

### 13. Edge cases
- EC-1 Trainer leaves (research E18): retire and reassign; history keeps the old name on marks and
  terms.
- EC-2 A trainer who is also a member of the gym: two profiles on one party; the scope does not
  include themselves unless assigned.
- EC-3 A trainer without a login: allowed; the desk logs their sessions naming them.
- EC-4 The owner revokes contact visibility: the next request omits the keys; nothing is cached on
  the device beyond the session's slices, which are cleared on sign-out.

### 14. Future
Payouts, availability and PT booking, session notes with a separate consent (health data), trainer
ratings (no).

---

## GYM-19 — Dashboard section

### 1. Product requirements
The owner's morning question — who is active, who expires this week, who came in today, who owes —
answered on the existing `/dashboard` as a gym section, not a second dashboard (research §7). Each
tile taps into the filtered list (the PTY-02 pattern).

### 2. User flows
- **F-1** Open `/dashboard` → the Gym section below the core tiles → tap "Expiring this week · 12" →
  `/gym/renewals?tab=ending`.

### 3. Features
**MVP tiles**: Active members (with net change this month: joined − lapsed), Expiring this week (count;
renewal value with the money codename), In grace, Today's check-ins (with the same weekday last week),
Dues on memberships (amount and oldest age; money codename), Follow-ups due today, Frozen now, Batches
today (enrolled / capacity). **Later:** occupancy now (needs check-out), revenue charts (reports),
academy fee tiles (GYM-22).

### 4. Entities and relationships
Reads gym tables, the engine's marks, the dues selectors and the document projection.

### 5. Database
None; the tiles rely on the indexes of GYM-05, GYM-06, GYM-14.

### 6. API
`GET /api/v1/reports/dashboard` (core) returns `sections: [{key: "gym.today", module: "gym", data:
{...}}, {key: "gym.money", …}]` for enabled modules and held permissions (11-contracts §1.9):
- `register_dashboard_section("gym.today", module="gym", permission="gym.member.read_all",
  selector=gym_today, order=40)` → `{active: {count, net_change_month}, expiring_week: {count},
  in_grace: {count}, checkins_today: {count, same_weekday_last_week}, followups_today: {count},
  frozen: {count}, batches_today: [{id, name, starts_at, enrolled, capacity}]}`;
- `register_dashboard_section("gym.money", module="gym", permission="gym.membership.money_read",
  selector=gym_money, order=41)` → `{dues: {amount, members, oldest_days}, expiring_week_value}`.

### 7. Frontend
`features/reports/dashboardSections.ts` gains `gym.today` and `gym.money` entries, each a `dynamic()`
import of `features/gym/components/dashboard/GymTodaySection` and `GymMoneySection`, rendered only
when `gym` is in `enabled_modules` (10-architecture §6 item 8).

### 8. UI/UX
`UbStatCard`s in a 2-column grid on a phone, 4 on a laptop; each card's caption says what the number
counts ("ending 29 Sep – 5 Oct"). Money tiles use `UbAmount` with grouping. The section heading is
"Gym" only when a second vertical is on (the nav grouping rule). Hindi: `gym.dash.active` "चालू सदस्य";
`gym.dash.expiringWeek` "इस हफ़्ते खत्म"; `gym.dash.checkinsToday` "आज की एंट्री"; `gym.dash.dues`
"सदस्यों पर बाकी".

### 9. Validation and business rules
- BR-1 **Active members** = members whose status today is `active` (GYM §0.4). Net change this month
  = members whose first access term started this month or who rejoined this month − members whose
  status became `expired` this month.
- BR-2 **Expiring this week** = access terms with no later access term in the chain and
  `end_on ∈ [today, today + 6]` (a rolling seven days, the dashboard's "this week"); value = Σ current
  plan prices of those terms.
- BR-3 **Today's check-ins** = non-voided marks of `module='gym'` in the Front desk group dated today
  (batch and PT marks are counted in their own tiles, not here).
- BR-4 **Dues on memberships** = Σ `amount_due` of gym documents with role `sale`, `freeze_fee`,
  `transfer_fee` (projection, GYM-06) + Σ open amounts of overdue gym instalment dues (dues
  selectors); oldest days = today − the oldest such document's date or due's `due_on`. Not the payer's
  whole khata: a shop customer who also trains shows only the gym part here.
- BR-5 Every tile is one indexed query; the section returns within 300 ms p95 at 5,000 members
  (`test_gym_dashboard_plan`).

**Worked example** (today 29 Sep 2026): a term ending 5 Oct is counted; one ending 6 Oct is not; a
term ending 30 Sep already renewed (an upcoming term from 1 Oct) is not.

### 10. Permissions
`gym.today`: `gym.member.read_all` (not trainers). `gym.money`: `gym.membership.money_read`.

### 11. Reports
Each tile's list is the report of the same name (GYM-20) for the tile's window.

### 12. Testing
- T-GYM-19-1 `test_dashboard_definitions` — BR-1…BR-4 on a seeded tenant, including the worked
  example.
- T-GYM-19-2 `test_money_section_absent_without_codename`.
- T-GYM-19-3 `test_gym_dashboard_plan` (`EXPLAIN`).
- e2e: tiles visible for the owner, the money section absent for a staff member with
  `gym.membership.money_read` denied through `permissions_override`.

### 13. Edge cases
- EC-1 Gym on, no members: first-use empty state ("Sell your first membership") with the primary CTA.
- EC-2 Gym switched off: the section disappears (not "0").

### 14. Future
Occupancy now; trends; academy fees; a "renewal rate this month" tile once there is a month of data.

---

## GYM-20 — Reports

### 1. Product requirements
The owner and the accountant get the gym's reports through the existing reports hub, with CSV export
and print; only built reports are listed (research §8, 11-contracts §1.9).

### 2. User flows
- **F-1** Reports → Gym → pick a report → filters (period, plan, trainer, batch…) → view → Export CSV
  or Print.

### 3. Features

| Key | Report | Content | Filters | Permission |
|---|---|---|---|---|
| `gym.membership_sales` | Membership sales | Each sale: date, member, plan, kind (new, renewal, rejoin, upgrade, downgrade, transfer, trial), period, price, discount, joining fee, credit, document number | Period, plan, kind, staff | `gym.reports.read` + money |
| `gym.renewals_due` | Renewals due | Terms ending in the period, renewed or not, renewal value, last reminder | Period, plan, trainer | `gym.reports.read` |
| `gym.lapsed` | Lapsed members | Expired and not renewed: end date, last visit, days since | Period, plan | `gym.reports.read` |
| `gym.retention` | Retention | By month and plan: terms ending, renewed within grace, renewal rate | Period, plan | `gym.reports.read` |
| `gym.active_members` | Active members | At each month end: active, joined, lapsed | Period | `gym.reports.read` |
| `gym.attendance_register` | Attendance register | Visits by day and member; batch grids | Date range, batch, member | `gym.reports.read` |
| `gym.absentees` | Absentees | Active members with no visit for N days (engine `not_visited_since`) | N (default 10), plan, trainer | `gym.reports.read` |
| `gym.peak_hours` | Peak hours | Visits per hour of day (engine `visits_by_hour`) | Date range | `gym.reports.read` |
| `gym.dues` | Dues on memberships | Members with gym documents or instalments due, age buckets 0–30, 31–60, 61–90, 90+ | Age, plan | `gym.reports.read` + money |
| `gym.freeze_log` | Freeze log | Every freeze and closure extension: days, reason, by whom, overrides | Period | `gym.reports.read` |
| `gym.enquiry_conversion` | Enquiry conversion | By source: enquiries, joined, lost, conversion rate, median days to join | Period, source | `gym.reports.read` + `gym.enquiry.read` |
| `gym.trainer_sessions` | Trainer sessions | PT sessions per trainer per month, per member, sessions left | Period, trainer | `gym.reports.read` |

GST summary, sales register, collections, day book: core and unchanged (gym documents are ordinary
sales documents). **Later:** academy fees (GYM-22), payouts.

### 4. Entities and relationships
Selectors over gym tables, engine selectors (`marks_for`, `register_grid`, `attendance_percent`,
`not_visited_since`, `visits_by_hour`, `dues_for_subject`, `collection_vs_expected`) and
`document_summaries`. `reports` imports nothing from gym (the registry, 10-architecture §3).

### 5. Database
None beyond the indexes of the owning features.

### 6. API
Each report is `register_report(key, module="gym", permission=…, label_id="gym.report.<key>",
selector=…, csv=…)`; the hub's existing endpoints serve them (`GET /api/v1/reports`,
`GET /api/v1/reports/{key}?…`, `?format=csv` under the export throttle — the LED-04 lesson: the view
is not throttled as an export, the CSV is).

### 7. Frontend
The reports hub renders registered reports; gym supplies `features/gym/components/reports/*`
renderers through the frontend report registry (a `dynamic()` entry per key).

### 8. UI/UX
Tables become cards below `md`; totals rows reflect the filtered set; money columns grouped. Dates
dd/mm/yyyy. Hindi labels per key (`gym.report.*`).

### 9. Validation and business rules
- BR-1 **Renewal rate** for month M = terms (access) whose `end_on` is in M, not changed or
  transferred, that have a successor in the chain sold on or before `end_on + grace_days`, ÷ all such
  terms ending in M. Cancelled terms are excluded from both.
- BR-2 **Lapsed** = status `expired` on the report's end date (§0.4).
- BR-3 Session and dues figures come from the engines, never recomputed by gym.
- BR-4 CSV cells are escaped by the existing `csv_cells` rules (formula injection guarded).

**Worked example (retention).** In October 2026, 40 access terms end; 2 were changed and 1
transferred (excluded); of the 37 left, 26 have a successor sold by `end_on + 5` → 26 ÷ 37 = **70.3%**.

### 10. Permissions
As the table. Accountants hold `gym.reports.read` and the money codename; they do not hold
`gym.enquiry.read`, so enquiry conversion is hidden for them.

### 11. Reports
This feature is the reports.

### 12. Testing
- T-GYM-20-1 A selector test per report on a seeded tenant, with the retention worked example.
- T-GYM-20-2 `test_reports_list_only_registered` — nothing unbuilt listed.
- T-GYM-20-3 `test_csv_matches_view` for each report.
- T-GYM-20-4 `test_reports_do_not_import_gym` (the import matrix).

### 13. Edge cases
- EC-1 A report over a period with a rate change: amounts are the documents' own.
- EC-2 A member erased (GYM-21): name shown as recorded on documents; profile fields absent.

### 14. Future
Academy fees, payouts, cohort retention curves.

---

## GYM-21 — Privacy and data minimisation

### 1. Product requirements
The gym is the Data Fiduciary for its members' data and YourKhata a Data Processor (research §13a;
DPDP Act 2023 and Rules 2025, fiduciary obligations from about May 2027 — built compliant from the
start). The module records **consent for a stated purpose**, **verifiable guardian consent for
minors**, **no Aadhaar number and no ID copies** (ADR-053; gym records only "ID seen: type, date"),
and for health **only the date a declaration was received** — never the answers. Photos are optional
and deletable; profile fields can be erased on request while invoices and ledger lines are kept for
the 72-month GST retention. Not legal advice: the consent text needs a lawyer's review before launch.

### 2. User flows
- **F-1 Consent at enrolment**: the member drawer shows the notice (purposes: membership, billing,
  attendance, reminders) and records how consent was given (verbal, form, link — the party's
  `consent_source`) and when (`consent_at`), with the notice version.
- **F-2 Minor**: "Under 18" (or a date of birth that says so) reveals the guardian block: pick or
  create the guardian, "Guardian has signed the consent form" (required), "Guardian is an adult"
  (required).
- **F-3 ID seen** (optional): type chips and a date; no number field exists.
- **F-4 Health declaration**: "Received on" date; the hint "Keep the signed form on paper".
- **F-5 Erase profile** (owner, admin): member page ⋯ → "Erase personal details" → a list of what goes
  and what stays → confirm with a reason.
- **F-6 Export a member's data** (owner, admin): ⋯ → "Download member's data" (CSV of profile, terms,
  visits; documents listed by number).

### 3. Features
**MVP:** consent record, guardian consent for minors, no ID numbers anywhere, ID-number guard on free
text, health date only, photo deletion, profile erasure, per-member export, accountant excluded from
enquiries, trainer excluded from contacts. **Later:** automatic erasure of inactive members after a
retention period with the 48-hour notice (a prepared message), a withdrawable separate consent for
body measurements (with their feature), a printable enrolment form with the notice.

### 4. Entities and relationships
`parties_party.consent_source`, `consent_at` (core, existing); `gym_member` privacy columns (GYM-02
§5); `parties_relation` (guardian).

### 5. Database
Columns in GYM-02 §5: `is_minor`, `date_of_birth`, `gender` (only with `gym.collect_gender`),
`guardian_consent_party`, `guardian_consent_at`, `guardian_adult_confirmed`,
`consent_notice_version`, `health_declaration_on`, `id_seen_type`, `id_seen_on`, `photo_file_id`,
`profile_erased_at`, and the CHECK `ck_gym_member_minor_consent`. **There is no column for any ID
number, health answer or medical note.** Settings `gym.consent_notice_text` (≤ 1,000 characters,
English and Hindi) and `gym.consent_notice_version`.

### 6. API
- Consent and guardian fields ride `POST/PATCH /gym/members` (GYM-02).
- `POST /api/v1/gym/members/{id}/erase-profile` `{reason}` (`gym.member.erase`) → 200
  `{data: {erased: ["date_of_birth", "gender", "emergency_contact_name", "emergency_contact_phone",
  "health_declaration_on", "id_seen_type", "id_seen_on", "photo"], kept: ["member_code", "terms",
  "visits", "documents"]}}`.
- `GET /api/v1/gym/members/{id}/export` (`gym.member.erase` holders; CSV).
- Errors: `id_number_not_allowed` (400, D `field`) on every gym free-text field; `validation_error`
  (guardian block incomplete).

### 7. Frontend
`ConsentBlock`, `GuardianBlock`, `IdSeenChips`, `HealthDateField` inside `MemberFormDrawer`;
`EraseProfileDialog` (`dynamic()`, opens on Cancel).

### 8. UI/UX
The notice is short and readable on a phone (≤ 6 lines), in the member's language choice (English or
Hindi), with the business's name — never YourKhata's. The erase dialog lists what goes and what stays
in two short lists. Copy: `gym.privacy.notice` "{business} keeps your name, mobile and visits to run
your membership, bills and reminders." / "{business} आपकी सदस्यता, बिल और याद दिलाने के लिए आपका नाम,
मोबाइल और हाज़िरी रखता है।"; `gym.privacy.guardianSigned` "Guardian has signed the consent form" /
"अभिभावक ने सहमति फ़ॉर्म पर हस्ताक्षर किए हैं"; `gym.privacy.idSeen` "ID seen (type only)" / "पहचान पत्र
देखा (सिर्फ़ प्रकार)"; `gym.privacy.health` "Health form received on" / "सेहत फ़ॉर्म मिला".

### 9. Validation and business rules
- BR-1 Consent (`consent_source`, `consent_at`) is required to create a member; for a minor, the
  guardian's consent is recorded on the member row pointing at the guardian party, with source `form`
  (verifiable parental consent; research §13a point 2), and `guardian_adult_confirmed = true`.
- BR-2 **No ID numbers.** No gym field stores one. Every gym free-text field (enquiry follow-up note,
  freeze reason, override reasons, end reason, extension and closure reasons, void reasons) is checked
  server-side: a run of 12 digits, optionally grouped 4-4-4 by spaces or hyphens
  (`\b\d{4}[ -]?\d{4}[ -]?\d{4}\b`), is refused with `id_number_not_allowed` and "Don't type ID numbers
  here." A 10-digit mobile passes. (Core free-text fields such as party notes are outside this FRD; the
  same guard is proposed for them in the task list.)
- BR-3 **Health**: only `health_declaration_on`; the UI offers no other health field in the MVP.
- BR-4 **Photo**: purpose "identification at the desk"; removable at any time without affecting the
  member; removed by erasure.
- BR-5 **Erasure** blanks the listed profile fields, deletes the photo attachment, sets
  `profile_erased_at`, and keeps the party (name and mobile stay, because issued documents and the
  ledger name the party and GST retention is 72 months), member code, terms, marks and documents.
  A party-level erasure is the core party feature's, not gym's.
- BR-6 **Minimisation defaults**: date of birth optional (the "Under 18" switch suffices); gender off
  unless `gym.collect_gender` (research Q10, for women-only batches); ID seen off by default.
- BR-7 **Children**: no behavioural monitoring and no targeted messages — the module has neither;
  birthday greetings are not built; a minor's reminders go to the guardian.
- BR-8 **Access**: accountants do not read enquiries; trainers do not read contacts (GYM-18); ID and
  date of birth are restricted to `gym.member.write` holders.

### 10. Permissions
Erase and export: `gym.member.erase` (owner, admin). Everything else as GYM-02.

### 11. Reports
None of its own; the audit log carries `gym.member.erased` with the reason.

### 12. Testing
- T-GYM-21-1 `test_no_id_number_columns` — a schema test: no gym column name matches
  `(aadhaar|id_number|pan_number|passport_no)`, and no column is longer than `varchar(16)` among the
  ID fields.
- T-GYM-21-2 `test_aadhaar_shaped_text_refused` on every free-text field; `test_mobile_in_text_allowed`.
- T-GYM-21-3 `test_minor_without_guardian_consent_refused`.
- T-GYM-21-4 `test_erase_keeps_documents_and_terms`.
- T-GYM-21-5 `test_accountant_cannot_read_enquiries`.
- T-GYM-21-6 `test_consent_notice_has_no_product_name`.

### 13. Edge cases
- EC-1 A member asks to erase while a term is active: allowed (profile fields are not needed to honour
  the term); the photo disappears from the desk card.
- EC-2 A guardian withdraws consent: the owner ends the minor's term (cancel, with or without refund);
  attendance stops; the record keeps the history needed for the invoices.
- EC-3 A member turns 18: their own consent is recorded at the next renewal; the guardian consent stays
  as history.

### 14. Future
Automatic erasure after inactivity with the 48-hour notice; body measurements with their own consent;
a signed-form upload is **not** planned (it would store health answers as an image).

---

## Appendix A — The e2e harness `e2e/gym.mjs` and its screenshot sweep

Every feature's §12 names its unit and API tests; this appendix is the live-stack harness they share,
run against a stack served by `./e2e/serve-api.sh && ./e2e/serve.sh` with `UB_UNRELEASED_MODULES=1`
(the only way the unreleased code can be switched on). It follows the house lessons in `CLAUDE.md`:
assert the **network**, not the controls (the PTY-02 warm-up defect); give every role its **own
browser context** and assert **who is signed in** before anything else (the staff-permission harness
defect); **measure**, don't read (page `scrollWidth` against the viewport, every text node against its
own box).

**Fixtures** (`e2e/lib/fixtures.mjs` helpers, plus a `gymTenant()` helper added there): an owner with
gym, sales, payments on; plans priced (Monthly ₹1,500, Quarterly ₹4,200 with ₹500 joining fee,
Yearly ₹11,999, 12-session pack ₹3,000, PT 12 sessions ₹6,000); members in each status — active,
in grace (ended 3 days ago), expired (ended 40 days ago), frozen, upcoming, never joined, a minor with
a guardian, a member on instalments with part 2 overdue; a staff login; a trainer login with two
assigned members and one batch.

**Checks** (target ≈ 60):

| Group | Checks |
|---|---|
| Module | switched on seeds four unpriced plans; menu shows Check-in, Members, Renewals, Enquiries, Batches, Plans for the owner |
| Members | create with guardian; list chip "In grace" issues a request with `status=in_grace` (network asserted); member page shows status and end date |
| Enquiries | record → follow up → convert → sale page prefilled; the party list does not contain unconverted enquiries |
| Sale | quarterly with joining fee, part paid: invoice and receipt numbers on the success sheet; payer's khata shows ₹1,700 due; composition tenant gets a bill of supply |
| Instalments | two parts; part 2 raised by `manage.py run_scheduler` with a frozen clock; reminder candidate 3 days before |
| Renewal | the three start rules; rejoin after 138 days charges the joining fee |
| Freeze | the GYM-09 worked example to the day; chain moved |
| Closure | 20–22 Oct: the four members' end dates |
| Change | the GYM-11 upgrade: ₹8,484.00 to pay with round-off on |
| Transfer, cancel | transfer example; owner refund of a part-paid term refunds at most ₹1,815.22; staff never see the refund block and a forged request is 403 |
| Check-in | active green, in grace amber (recorded), expired red (not recorded), override with reason recorded, duplicate within 3 h shown as info; the search field is focused after each check-in (`document.activeElement`) |
| Batches | trainer roll-call of own batch; other batch 404 |
| Card | card JSON QR payload equals the code; print sheet has no product name |
| Trainer | own context; asserts the signed-in name; two members listed; no `₹` and no 10-digit number anywhere in `innerText` of the member page; `/parties` and engine read endpoints 403 |
| Privacy | Aadhaar-shaped text in a freeze reason refused; erase keeps documents |
| Void | void the sale from the Invoices screen → the membership shows "Cancelled · sale voided" |

**`node e2e/gym.mjs --shots`** sweeps into `/tmp/e2e-shots/gym` at the four sizes of the existing
harnesses — phone 360 × 780, tablet 768 × 1024, laptop 1280 × 800, desktop 1440 × 900 — in each
condition below, and runs the two measuring checks on every shot:

1. Check-in: empty; a search with five matches; the green, amber, red and info banners; the override
   dialog; today's list with 30 visits (tablet two-pane).
2. Members list: every status chip pressed; a filtered-empty state; a member with a very long name.
3. Member page: active, in grace, frozen, expired, a minor with guardian, the ⋯ sheet open; the
   trainer's view of the same member.
4. Sale page: new with joining fee; overlap refusal with the fix; instalments on and unbalanced; the
   success sheet.
5. Freeze drawer: within limits, over the day limit with the override field; change-plan page for the
   upgrade and the downgrade; cancel page with refund (owner) and without (admin).
6. Renewals tabs; enquiries list with overdue follow-ups; plans page with the first-run banner.
7. Batch roll-call with a blocked member; the monthly register **in print media**.
8. Membership card and the bulk card sheet **in print media** (`emulateMedia({media: "print"})`,
   the LED-04 method); the invoice of a gym sale in print media showing the membership block.
9. Dashboard gym section for the owner, and for staff without the money codename.

The sweep is the check that has found defects every unit test passed (CLAUDE.md, five sweeps so far);
it is part of the gym's definition of done, not a nicety.

---

## Defaults the owner may change

Tenant settings (`gym.*`, GYM-01 §9 BR-5 validates them) and seeded plan values. Research references
in brackets.

| Setting | Default | Choices / range | Used by | Why this default |
|---|---|---|---|---|
| `gym.grace_days` | **5** | 0–30 | §0.4, GYM-08, GYM-14, GYM-17 | Products surveyed use 5–7 [S9]; research Q2 |
| `gym.renewal_start` | **`continuous_within_grace`** | `always_from_expiry`, `always_from_today` | GYM-08 | No lost days for the gym, no back-filled days for the member (research §6.4, Q3) |
| `gym.rejoin_fee_after_days` | **90** | 0–3650 | GYM-05, GYM-08, GYM-12 | research §6.8 |
| `gym.part_payment_allowed` | **on** | on, off (plans may still forbid) | GYM-05 | Indian gyms commonly allow it (research §6.10, Q7) |
| `gym.dues_checkin_rule` | **`show`** | `warn`, `block_after_days` | GYM-14 | research §6.10: default never refuse, show |
| `gym.dues_block_days` | 30 (used only with `block_after_days`) | 1–365 | GYM-14 | |
| `gym.grace_checkin` | **`warn`** | `warn`, `block` | GYM-14 | The brief: warn during grace |
| Expired / frozen / upcoming at check-in | **block**, overridable with a reason | — (fixed; the override is the owner's lever) | GYM-14 | The brief: the hook blocks expired members |
| `gym.checkin_dedupe_minutes` | **180** | 0–720 | GYM-14 | research W3 |
| PT session dedupe | 30 minutes | 0–720 (the PT group) | GYM-18 | Back-to-back sessions are rare |
| `gym.backdate_sale_days` | **30** (owner: any) | 0–90 | GYM-05 | research E1 |
| `gym.backdate_freeze_days` | **7** (owner: any) | 0–30 | GYM-09 | research §6.5 |
| `gym.reminder_offsets` | **−7, −3, 0, +3** days | up to 6 values in −60…+60 | GYM-17 | research §6.12 |
| Reminder window for gym | **none** (tenant may narrow) | a window | GYM-17 | 10-architecture §16 item 4 (owner's call) |
| Reminder cap | **1 per term per day** | — | GYM-17 | ADR-054 |
| `gym.trainer_sees_contact` | **off** | on, off | GYM-18 | research §12, Q9; the brief |
| `gym.transfer_allowed` | **on** | on, off | GYM-12 | research Q13 |
| `gym.transfer_fee` | **₹0** | ≥ 0 | GYM-12 | Crunch India charges ₹1,000 + GST [S5]; left to the owner |
| `gym.cancellation_charge` | **₹0** | amount or percent | GYM-13 | Many gyms refund nothing; the owner decides per case |
| `gym.enquiry_retention_days` | **180** | 30–730 | GYM-03 | ADR-046 |
| `gym.collect_gender` | **off** | on, off | GYM-02, GYM-21 | Minimisation; on for women-only batches (research Q10) |
| `gym.consent_notice_text` / `_version` | a short notice (§GYM-21 §8) / `v1` | text ≤ 1,000 | GYM-21 | Lawyer review before launch |
| Plan: tax code | **`GST5`** | any active tax code | GYM-04 | 5% without ITC from 22 Sep 2025 [S13–S15]; **CA to confirm** (T1) |
| Plan: SAC | **999723** | 4, 6 or 8 digits | GYM-04 | [S14]; **CA to confirm** |
| Plan: price includes tax | **on** | on, off | GYM-04 | Gyms quote inclusive prices |
| Plan: joining fee | ₹0 on seeded plans | ≥ 0 | GYM-05 | Set by the owner |
| Plan: freeze limits | Monthly none; Quarterly 15 days × 1 (min 7); Yearly 30 days × 2 (min 7); packs none | ≥ 0 | GYM-09 | Up to 30 days a year is common [S9] |
| Plan: max instalments | 1 (none) on seeded plans | 1–6 | GYM-07 | Opt-in per plan |
| Member code | prefix **`M-`**, 4 digits, perpetual | settings numbering screen | GYM-02 | 11-contracts §1.7 |
| Round-off on documents | the sales setting (`sales.round_off_default`) | on, off | GYM-06, GYM-11, GYM-13 | Sales' own; credit notes inherit the invoice's (T13) |

**Rules that are not defaults** (not changeable by the owner in the MVP, and why): refunds are
**owner-only** (a business ceiling, role-checked); a freeze **always extends** the end date (research
§6.5); the joining fee is **never credited or refunded**; the product **never stores an ID number or
health answers** (ADR-053, GYM-21); the product **never sends** a message (DEC-012).

---

## Tax review items for a CA

YourKhata does not give tax advice. The product seeds defaults and lets the owner change them; each
item below is what the product does today and the question the tenant's CA should answer before the
module is released (and ideally a CA engaged by the product for the defaults).

| # | Item | What the product does | Question for the CA | Source |
|---|---|---|---|---|
| T1 | Rate for gym, fitness centre, yoga and similar services | Seeds `GST5` (5%) on every plan, SAC **999723**, prices inclusive | Is 5% **without input tax credit** the correct and mandatory rate from 22 Sep 2025 for these services, and is 999723 the right SAC? | research §6.14; S13, S14, S15 |
| T2 | Sports academies and structured coaching | Same default; the owner can pick another tax code per plan | When is coaching 18% rather than 5%, and which SAC applies? Should the product seed 18% for a "sports academy" business type? | research §6.14, Q17; S16 |
| T3 | Charitable entities (section 12AB) | No special handling; the owner can set `GST0` per plan | When is coaching or fitness by such an entity exempt, and what must the document say? | S16 |
| T4 | Businesses below the registration threshold | Sales issues a plain "Invoice" with **no tax** for `unregistered` tenants and a **bill of supply** for `composition` tenants (`kind_for`) | Should an unregistered gym's document be titled "Bill of supply" rather than "Invoice"? Which threshold applies (₹20 lakh for services in most states; lower in special-category states)? | research §6.14; S14; GYM-06 BR-1, C7 |
| T5 | Composition scheme for service providers | Bill of supply, zero tax on the document (tax engine forces 0) | Is a gym eligible for the services composition scheme, and is a zero-tax bill of supply with the composition footer correct for it? | GYM-06 BR-1 |
| T6 | Joining fee | Its own line at the access plan's tax code and SAC | Is a joining fee taxed at the membership's rate and SAC (a naturally bundled supply), or separately? | research §6.8 |
| T7 | Instalments | Part 1 on the sale invoice; each later part a separate invoice raised on its due date | Is invoicing each instalment on its due date correct (continuous supply of services, time of supply), or must the whole term be invoiced at sale? | GYM-07; S17 |
| T8 | Pro-rata credit note on upgrade and downgrade | A credit note against the original invoice for the unused value, reason "Plan changed to …", held as an advance and applied to the new invoice | Is a credit note the right instrument for the unused value of a service already invoiced, with which reason, and within which time limit (Section 34)? | research §6.6; GYM-11 |
| T9 | Refund with a cancellation charge | The credit note is for the refunded amount only; the retained charge is simply not credited | Is the retained cancellation charge a separate taxable supply needing its own invoice? | GYM-13 |
| T10 | Transfer fee and freeze fee | Ordinary lines at the term's tax code and SAC | Correct rate and SAC for each? | GYM-09, GYM-12 |
| T11 | Advances before an invoice (a renewal paid early; an instalment paid before it is raised) | Recorded as an unallocated payment (an advance) and applied when the invoice is issued; **no receipt voucher with tax** | Is GST due on the advance for services at receipt, needing a receipt voucher? (The port cannot issue one today; ADR-045's trigger.) | research §6.14, Q6; ADR-045 |
| T12 | Corporate payers | B2B invoice to the employer's GSTIN (sales' own rules), members named in the membership block | Can the employer claim input tax credit on gym membership (blocked credits for health and fitness memberships)? The product makes no claim either way | research E22 |
| T13 | Round-off on credit notes | A credit note inherits its invoice's round-off (₹3,515.22 prints as ₹3,515.00) | Is rounding a credit note to the rupee acceptable, or should credit notes always carry exact paise? | GYM-11 BR-10 |
| T14 | Rate changes | Issued documents keep their rate; new documents use the rate in force on their date; a term spanning a change is not re-taxed | Confirm, including for instalment invoices raised after a rate change for a term sold before it | research E10 |
| T15 | The gym's own purchases | Out of the gym module; the purchases module records input tax on bills as it does for any tenant | With 5% "without ITC", should the gym tenant's purchases be flagged so no input credit is claimed? | research §6.14; S15 |
| T16 | Place of supply | Sales' rules: the tenant's state for unregistered members; the recipient's state for a registered payer | Confirm for an employer in another state paying for local members | GYM-05 EC-6 |

---

## Implementation task list

Ordered; each task names the core and engine items it needs, **as they are named in 10-architecture
§13 (Wave A items A1–A11) and 11-contracts**. No gym task starts before its prerequisites are merged
with their contract tests. Gym is Wave C (10-architecture §13.2): it follows the dues engine's charge
mode and the attendance engine.

**Prerequisites (not gym's work, listed so the order is visible):**

| Item | Name in 10-architecture / 11-contracts | Why gym needs it |
|---|---|---|
| P1 | **A1** (PLT-X11) release gate (`UNRELEASED_MODULES`, `UB_UNRELEASED_MODULES`) | GYM-01 |
| P2 | **A4** (PLT-X03) payments: target protocol v2, **`allocate_existing`** | `apply_open_advances` on every gym document |
| P3 | **A5** (PLT-X05) document port + sales issuer (`common/seams/documents.py`, origin columns, `check_void`/`on_void`/`on_settlement_changed`, `credit_check="skip"`), **with answers to C1–C4, C14 (and core CQ-1, CQ-2)** | GYM-05, GYM-06, GYM-11, GYM-13 |
| P4 | **A6** (PLT-X04) party roles, relations (`parties_relation`), archive guards | GYM-02 |
| P5 | **A7** (PLT-X06) reminders: source link, `notice` kind, policy (`register_reminder_source`, `register_reminder_policy`) | GYM-17 |
| P6 | **A8** (PLT-X07) counters + number kinds (`register_number_kind`, `allocate_counter`) | member codes |
| P7 | **A9** (PLT-X08, PLT-X09) calendar + recurrence + periods + rounding (`platform_closed_day`, `common/recurrence.py`, `common/periods.py`, `split_total`) | GYM-05 BR-3 agreement test, GYM-07, GYM-10, GYM-15 |
| P8 | **A10** (PLT-X13) registries: `register_schedule`, `register_dashboard_section`, `register_report`, `register_notification_type` | GYM-03, GYM-17, GYM-19, GYM-20 |
| P9 | **A11** (PLT-X14) import test (whole-AST walk for the new apps) | every gym task |
| P10 | **Dues engine, charge mode with document posting** (DUE-01…DUE-06) (11-contracts §2.1), with C5/C6 answered | GYM-07 |
| P11 | **Attendance engine** (ATT-01…ATT-05) (11-contracts §2.3): groups, sessions, marks, policy hook, mark listener, entitlements, with C10–C13 answered | GYM-14, GYM-15, GYM-18 |
| P12 | **Row scoping** (PLT-X12) and engine enablement (PLT-X10) `apps/common/scoping.py` (`ScopedViewSetMixin`, `RestrictedFieldsMixin`, 11-contracts §3) and module roles (ADR-052), owner-confirmed | GYM-18 |
| P13 | Client `MODULE_CODES` replaced with the server's list (10-architecture §6 item 3) | frontend |

**Gym tasks:**

| # | Task | Depends on | Delivers |
|---|---|---|---|
| TSK-GYM-01 | App skeleton: `apps/gym`, `ModuleCode.GYM` in `UNRELEASED_MODULES`, `MODULE_DEPENDENCIES["gym"]`, `ENGINES_USED_BY["gym"]`, import-matrix row, `tenant_data.py`, module-off guard (terms), empty `GymConfig.ready()` | P1, P9 | GYM-01 BR-1, BR-4 |
| TSK-GYM-02 | Codenames in `permissions_registry` (canon §0.9 CR), staff and accountant sets, `gym_trainer` role data migration (ADR-052 CR) | TSK-GYM-01, P12 | §0.7 |
| TSK-GYM-03 | Settings read/write + preset seed (plans, the two attendance groups) | TSK-GYM-01, P11 | GYM-01 |
| TSK-GYM-04 | Pure term engine `services/terms.py`: `end_of_term`, `term_status`, chain recompute; SQL status expression; the worked-example tables as tests | P7 | §0.4, GYM-05 BR-3 |
| TSK-GYM-05 | Members: `gym_member`, member code kind, relations via core, party roles, archive guard, photo, list with filters (URL), member page; party-page panel | TSK-GYM-02, P4, P6 | GYM-02 |
| TSK-GYM-06 | Privacy fields and guards: consent block, guardian consent CHECK, ID-number text guard, erase, export | TSK-GYM-05 | GYM-21 |
| TSK-GYM-07 | Enquiries + follow-ups + convert + daily purge (`register_schedule`, `job_handler`) | TSK-GYM-05, P8 | GYM-03 |
| TSK-GYM-08 | Plans (CRUD, retire, tax-code picker) | TSK-GYM-03 | GYM-04 |
| TSK-GYM-09 | Sale: quote, sell through the port, `gym_membership_document` projection, origin listener (`on_void`, `on_settlement_changed`, `check_void`), void-sale action, `check_integrity` | TSK-GYM-04, TSK-GYM-08, P2, P3 | GYM-05, GYM-06 |
| TSK-GYM-10 | Renewal and rejoin: quote, start rules, renewals list | TSK-GYM-09 | GYM-08 |
| TSK-GYM-11 | Instalments: tenant instalment dues plans, schedule at sale, reschedule, Money tab | TSK-GYM-09, P10 | GYM-07 |
| TSK-GYM-12 | Freeze and resume, freeze fee document, chain move | TSK-GYM-09 | GYM-09 |
| TSK-GYM-13 | Extensions and closures (closed days in the platform calendar) | TSK-GYM-12, P7 | GYM-10 |
| TSK-GYM-14 | Check-in: context resolver, policy, mark listener (freeze-ending override), search, desk endpoints and screen | TSK-GYM-09, TSK-GYM-12, P11 | GYM-14 |
| TSK-GYM-15 | Card and QR: card endpoints, print sheets; move `UbQrCode` to the design system; `UbCameraScanner` | TSK-GYM-05, TSK-GYM-14 | GYM-16 |
| TSK-GYM-16 | Batches: `gym_batch` + attendance group, enrolment via class plans, sessions, roll-call, register print | TSK-GYM-14 | GYM-15 |
| TSK-GYM-17 | Upgrade and downgrade | TSK-GYM-11, TSK-GYM-12, P3 (C1, C2) | GYM-11 |
| TSK-GYM-18 | Transfer | TSK-GYM-17 | GYM-12 |
| TSK-GYM-19 | Cancel and refund (owner-only) | TSK-GYM-17 | GYM-13 |
| TSK-GYM-20 | Trainer profile, scope filter, restricted fields, PT sessions, reassign | TSK-GYM-14, TSK-GYM-16, P12 | GYM-18 |
| TSK-GYM-21 | Reminders source, policy, texts, notification type | TSK-GYM-10, P5, P8 | GYM-17 |
| TSK-GYM-22 | Dashboard sections (backend selectors + frontend registry entries) | TSK-GYM-14, TSK-GYM-11, P8 | GYM-19 |
| TSK-GYM-23 | Reports (12 registrations + renderers + CSV) | TSK-GYM-22 | GYM-20 |
| TSK-GYM-24 | Frontend shell: routes, `GUARDED_ROUTE_PREFIXES`, `CRAWL_DISALLOW`, nav rows, locales catalogue, lazy slices, ESLint boundary zone; bundle gate unchanged | alongside TSK-GYM-05 onward, P13 | §0.8 |
| TSK-GYM-25 | `e2e/gym.mjs` and the `--shots` sweep (Appendix A); fix what the sweep finds | all above | Appendix A |
| TSK-GYM-26 | Core follow-up raised by this FRD (separate owner): the ID-number text guard for core free-text fields such as party notes (GYM-21 BR-2) | — | proposal |
| TSK-GYM-27 | Release CR: remove `gym` from `UNRELEASED_MODULES`; data migration adding `gym` to `MVP_MODULES` and qualifying partners (10-architecture §2.4); landing config status | owner sign-off, all above green | release |

---

## Contract questions

Places where this FRD needs something 11-contracts does not provide, or where the code and the
contract disagree. **Nothing here changes the contracts**; each has the fallback this FRD uses until
the architecture owner answers (vision §3 rule 5).

| # | Question | Where it bites | What 11-contracts / the code says | Proposal | Fallback used in this FRD | Resolved → |
|---|---|---|---|---|---|---|
| C1 | **Applying an open credit note to a new invoice through the port.** | GYM-11 BR-6 | `IssueRequest.apply_open_advances` allocates open **payments** (`allocate_existing`); a credit note held as advance is open credit on a `sales_document`, applied only by sales' `apply_credit_note` (`credit_note_apply.py:48`), which the port does not expose | Either `apply_open_advances` also applies the party's open credit notes, oldest first, or `IssueRequest.apply_credit_note_ids: list[UUID]` | The party's ledger balance is already right; the new invoice shows the credit unapplied; the membership page links to the sales credit-note screen; `check_integrity` lists gym credit notes left open over a day | **R50** — `IssueRequest.apply_credit_note_ids`, explicit; body BR-6 updated |
| C2 | **Value credits against an invoice line.** | GYM-11 BR-4, GYM-13 BR-4 | The port's `issue_credit_note(…, lines: list[DocumentLine])` carries prices; sales' against-invoice mode prices **only by quantity** of the invoice line, ≤ 3 decimals (`credit_note_lines.py`), so 77/92 of a line cannot be expressed exactly and every return moves `returned_qty` | A value line: `against_line_id` + `taxable_value` (or inclusive amount), tax copied from the invoice line, capped by Σ credited value ≤ the line's taxable value, not touching `returned_qty` | `qty = ratio` rounded to 3 decimals; the quote shows sales' figure (₹3,515.40 instead of ₹3,515.22 before round-off in the worked example) | **R51** — value credit lines (ADR-057, Wave A task A15); fallback withdrawn |
| C3 | **Tax code, not only a rate, on a port line and a dues plan.** Same finding as 00-core-and-engines CQ-2 (port line); this adds the dues plan | GYM-04 BR-3, GYM-07 | `DocumentLine.gst_rate` and `dues_plan.gst_rate` carry a rate; sales lines store a `tax_code` resolved by `(code, document_date)` (`lines.py:98`, `rate_for`), which is how a rate change on a date works | Add `tax_code: str | None` to `DocumentLine` and `dues_plan`, preferred when given (the rate stays for hospitality's slab) | Gym resolves the rate from `tax` for the document date and passes `gst_rate`; the issuer maps it to the active code with that rate (ambiguous if two codes share a rate) | **R2** — `tax_code` on `DocumentLine` and `dues_plan` (ADR-057) |
| C4 | **The refund payment in the credit-note result.** | GYM-13 F-2 (receipt for the payment out) | `issue_credit_note` returns `IssuedDocument`, which has no payment fields; the refund payment id and number are in the note's `meta.refund` (`refund_seam.py`) | `IssuedDocument.refund_payment: {id, number, amount} | None` | Gym reads the payment through `payments` selectors by `meta.credit_note_id` | **R52** — `IssuedDocument.refund_payment` |
| C5 | **Instalments against one invoice.** | GYM-07 | Dues modes are `charge` (each due raises a document or a charge) and `expectation` (for loans: `loan` bucket, principal never posts, settled through `dues_instalment`). Research §6.10 wanted one invoice with expected dates that drive reminders only | An `expectation`-like variant in the `main` bucket whose settlement follows an existing document | Split invoicing: part 1 on the sale invoice, later parts as `charge`/`document` dues (tax question T7) | **R53** — no new mode; split invoicing is the design (ADR-059); revisit on CA T7 |
| C6 | **Line description of a document raised by a due.** | GYM-07 BR-4 | `register_subject` supplies a `label` and `amount_hook`, not a line description; the engine's description for a document-posting due is unspecified | A `line_hook(tenant, due) -> DocumentLine` override, or at least `description` | Subject label + period label ("Quarterly membership, 1 Oct – 31 Dec 2026 · Rahul Sharma (M-0142) · part 2 of 2") | **R54** — `register_subject(line_hook=…)` |
| C7 | **Unregistered tenants and "bill of supply".** | GYM-06 BR-1 | The brief asks for a bill of supply for businesses below the threshold; 11-contracts §1.5 fixes the kind as `kind_for(tenant)`, which gives `bill_of_supply` only for `composition` and a tax-free `invoice` for `unregistered` (`apps/sales/constants.py:114-118`) | A sales decision after the CA's answer (T4) | Gym follows `kind_for` | **R3** — `kind_for(tenant, None)`; title question to the CA (owner Q17) |
| C8 | **Template parameters on a reminder candidate.** | GYM-17 BR-1 | `ReminderCandidate` has `subject_label` and `amount` (None for a notice) but no parameters, so the renewal price cannot reach the template except through the label | `params: dict[str, str]` on the candidate | The price is part of `subject_label` ("Quarterly ₹4,200 · ends 5 Oct") | **R10** — `ReminderCandidate.params` |
| C9 | **A void that needs confirmation rather than refusal.** | GYM-06 BR-5 | `blocks_void` returns a reason or `None`; research E7 wanted a confirmation when the term has visits | A soft answer (`{confirm: "6 visits…"}`) that sales' void dialog shows | Gym's own void action confirms; a void from the Invoices screen does not ask | **R55** — `check_void` returns `confirm`; 409 `document_origin_confirm` |
| C10 | **Changing an entitlement's validity.** Raised also as 00-core-and-engines CQ-17 (`extend_entitlement`) | GYM-09 BR-9, GYM-10, GYM-11 | The attendance engine has `grant_entitlement` only; freezes and extensions move a pack's end | `extend_entitlement(entitlement_id, valid_to, reason)` (and an `end_entitlement` for changes, transfers and cancellations) | The gym policy is the authority for pack dates; the engine's `valid_to` is informational | **R18** — `extend_entitlement`, `end_entitlement` |
| C11 | **Open visits and switching the module off.** | GYM-01 BR-4 | 10-architecture §9 counts "open check-ins (not checked out)" as blocking; the gym MVP records no check-outs, so every visit of the day is open until the engine's close job runs | Count only visits of earlier days left open, or exempt `visit` groups with no check-out | Accepted as written: the module can be switched off after the nightly close | **R56** — only earlier days' open visits block switch-off |
| C12 | **Roll-call through `check_in` with a session.** | GYM-15 BR-4 | `roll_call(session_id, marks)` takes no context per mark, so it cannot run the policy or consume a pack; `check_in` accepts `session_id` | Confirm `check_in(session_id=…)` on a presence group writes `present` and honours the unique `(session, party)` | As proposed: present via `check_in`, absent via `roll_call` | **R57** — accepted as proposed |
| C13 | **Engine read endpoints and scoped roles.** 00-core-and-engines CQ-24 proposes `ENGINE_READ_PERMISSIONS` and asks each vertical FRD for its codename | GYM-18 BR-6 | 10-architecture §5: engine reads pass on "`<module>.<resource>.read` of any consuming module"; a trainer holds `gym.member.read` and would read every mark and every due of the tenant through `/api/v1/attendance/` and `/api/v1/dues/`, which apply no vertical scope | State in 10-architecture §5 that a vertical with a scoped role names an **unscoped** codename there. Gym's entries: `ENGINE_READ_PERMISSIONS["attendance"]["gym"] = "gym.member.read_all"`, `["dues"]["gym"] = "gym.membership.money_read"` | As proposed; a test proves a trainer gets 403 on both | **R25** — accepted; values in 11-contracts §3 (ADR-058) |
| C14 | **Origin listener on credit-note voids.** | GYM-06 BR-3 | 11-contracts §1.5 says `void_invoice` calls `blocks_void`/`on_void`; credit notes are voided by `void_credit_note` (`credit_note_apply.py:129`), which the contract does not mention | `void_credit_note` calls the origin listener the same way | Until then a gym credit note can be voided from the Invoices screen; `check_integrity` reports a gym credit note voided while its term is `changed` | **R58** — `void_credit_note` calls the listener |
| C15 | **Dedupe for desk visits.** | GYM-01 §5, GYM-14 BR-4 | 11-contracts puts `dedupe_minutes` on `attendance_group`, and 00-core-and-engines ATT-02 describes desk visits with **no** group, which leaves the window of a group-less visit unspecified | A per-module dedupe setting for group-less visits, or confirm that verticals pass a desk group | Gym passes its seeded "Front desk" group (`group_id`, visit kind) on every desk check-in, so the group's `dedupe_minutes` applies | **R59** — desk group passed; a group-less visit has no dedupe |

---

## Questions for the owner

Decided by the brief and recorded here so they are not re-asked: renewal continues within grace by
default; freezes extend the end date; refunds are owner-only; trainers see no money and no phone
numbers; no Aadhaar and only the health-declaration date; QR scanning only where the browser supports
it. Still open:

1. **Trainer module role** (ADR-052, 10-architecture §16 item 1): confirm `gym_trainer`; it amends
   canon §0.9 and needs a CR.
2. **Grace days default**: 5 is proposed (research Q2 offered 0, 3, 5, 7).
3. **Gender field**: off by default; confirm, or on for studios with women-only batches (research Q10).
4. **Transfers**: allowed by default with no fee (research Q13) — confirm.
5. **Reminder window** for gym notices: none by default (10-architecture §16 item 4).
6. **First target**: the independent gym or the studio/academy (research Q1) — decides whether GYM-22
   (academy fees) follows immediately.

---

## Traceability to the research

| Research | Where in this FRD |
|---|---|
| §1 use cases U1–U17 | U1 GYM-03; U2 GYM-05; U3 GYM-06, GYM-16; U4 GYM-14; U5 GYM-17; U6 GYM-08; U7 GYM-06, GYM-07; U8 GYM-09; U9 GYM-11; U10 GYM-12; U11 GYM-13; U12 GYM-18; U13 GYM-15; U14 GYM-22 (reserved); U15 GYM-19; U16 GYM-20; U17 GYM-23 (reserved) |
| §3 workflows W1–W10 | W1 GYM-03; W2 GYM-05; W3 GYM-14; W4 GYM-15; W5 GYM-08, GYM-17; W6 GYM-09; W7 GYM-11–13; W8 GYM-18; W9, W10 reserved |
| §4 entities | §0.3 and each feature's §5; `gym_pt_session` replaced by attendance marks (GYM-18); `gym_batch_enrolment` replaced by `attendance_group_member` (GYM-15); `checkin_event` is `attendance_mark` (ADR-050) |
| §6 business rules | 6.1 GYM-05; 6.2 §0.4; 6.3 GYM-05, GYM-09; 6.4 GYM-08; 6.5 GYM-09; 6.6 GYM-11; 6.7 GYM-12; 6.8 GYM-05, GYM-08; 6.9 GYM-13; 6.10 GYM-05, GYM-07, GYM-14; 6.11 reserved; 6.12 GYM-17; 6.13 GYM-10; 6.14 GYM-04, T-table |
| §7 dashboard, §8 reports, §9 documents | GYM-19, GYM-20, GYM-06 and GYM-16 |
| §12 roles | §0.7, GYM-18 |
| §13 edge cases E1–E25 | E1 GYM-05; E2 reserved (import); E3 GYM-02, GYM-21; E4 GYM-02, GYM-14; E5 GYM-02; E6 GYM-05; E7 GYM-06; E8 GYM-06; E9 GYM-04; E10 GYM-04, T14; E11 GYM-09; E12 GYM-09, GYM-14; E13 GYM-05; E14 GYM-14; E15 GYM-14; E16 GYM-10; E17 GYM-13; E18 GYM-18; E19 GYM-15; E20 GYM-02; E21 GYM-13; E22 GYM-05 (later), T12; E23 GYM-05 (later); E24 GYM-05; E25 GYM-14 |
| §13a privacy | GYM-21 |
| §15 reuse | §0.1, §0.2 and the task list |
| §17 open questions | Decided by the brief or the ADRs, or listed under Questions for the owner |
