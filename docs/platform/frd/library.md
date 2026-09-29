# Library module: functional requirements (LIB)

Status: **PHASE 3 FRD, 29 Sep 2026 (business analyst).** Documentation only; no application code is
written from this file until the vision §5 gate for Phase 4. Feature IDs are `LIB-01` to `LIB-14`.

**Binding inputs, in order of precedence:** [00-platform-vision.md](../00-platform-vision.md),
ADR-041 to ADR-055 in [Part 38](../../38-architecture-decision-records.md),
[10-architecture.md](../10-architecture.md), [11-contracts.md](../11-contracts.md), `CLAUDE.md`.
**Main input:** [research/library.md](../research/library.md) (cited below as *research §n*), with
[research/shared-engines.md](../research/shared-engines.md). House style follows Part 17
(`docs/17-00-frd-template.md`, `docs/17-02-frd-ledger-payments.md`), condensed to the 14-section
template of vision §7.

Where this FRD needed something 11-contracts did not provide, the item is listed in §0.7 *Contract
questions*. All thirteen were **resolved on 30 Sep 2026** by the architecture owner (10-architecture
§17; 11-contracts v1); the "Resolved →" column gives each answer and the text below follows it.

Every claim about existing code carries a `file:line` reference, read at commit `30798d2`. Paths are
relative to `backend/` or `frontend/` unless they start with `docs/` or `e2e/`.

---

## 0. The module at a glance

### 0.1 What Library is for

A small library (school, college, community, private lending) keeps four paper records today: the
**accession register** (one line per physical copy, numbered for ever), a **member register**, an
**issue register** or date-stamped cards, and a **cash book** for fees, fines and deposits. Once a
year it counts its stock against the register. The Library module replaces all four with one
catalogue, one counter screen and one set of reports, on the same parties, ledger and payments every
other YourKhata module uses (vision §3 rules 3–5).

The owner named Library as the module they need most ("I need library mgmt system"), and
10-architecture §13.2 puts it first among the verticals in Wave B, because its MVP needs only the
Wave A core changes and no engine.

### 0.2 Scope

**In the MVP** (research §16, confirmed against 10-architecture §13.2):

| # | Area | Feature |
|---|---|---|
| 1 | Switching the module on, library settings, numbering | LIB-01 |
| 2 | Catalogue: titles, copies with never-resetting accession numbers, categories, locations | LIB-02 |
| 3 | CSV import of copies and members | LIB-03 |
| 4 | Members: party + library profile, membership types, validity, fees, deposits (core held deposit) | LIB-04 |
| 5 | Due dates, loan rules and the closed-days calendar | LIB-05 |
| 6 | The counter: issue, return, renew (keyboard-first, USB wedge scanner) | LIB-06 |
| 7 | Fines at return (grace, cap at price), waivers, lost and damaged items | LIB-07 |
| 8 | Holds and reservations (title queue) | LIB-08 |
| 9 | Overdue reminders and hold-ready notices through the core reminders pipeline, as WhatsApp text | LIB-09 |
| 10 | Stock verification | LIB-10 |
| 11 | Library dashboard section and library home | LIB-11 |
| 12 | Reports | LIB-12 |
| 13 | Documents: membership card with QR, overdue notice, no-dues certificate, fine receipt | LIB-13 |
| 14 | Roles and permissions | LIB-14 |

**Out of the MVP, recorded as future work** (each feature's section 14 says where it goes):
- **Reading rooms, seats and shifts.** A reading room is a seat-and-dues business (research §15.4).
  Seats are `bookings_resource` rows with `time_mode = shifts` in the bookings engine (ADR-049,
  11-contracts §2.2), the monthly seat fee is a dues plan (ADR-048), and daily attendance is the
  attendance engine (ADR-050). The library module builds **no** seat table (10-architecture §13.1
  Wave D). See §0.8.
- Recurring monthly plans for private lending libraries (dues engine, charge mode, ledger posting).
- Member self-view, label printing, camera scanning, ISBN lookup, loan-rule matrix beyond
  material-type overrides, hold priority by member type, family memberships, serials, MARC,
  multiple branches (research §16 *Later*).

### 0.3 Words used

Plain product words (vision §4). *Title* is the book as a work; *copy* is one physical book;
*accession number* is the copy's permanent register number; *member*; *issue*, *return*, *renew*;
*hold*; *fine*; *deposit*; *location* (a shelf, almirah or rack). Hindi copy uses ordinary words
(§0.5). Nothing a member receives names the product (CLAUDE.md, vision §4).

### 0.4 How the module plugs into the platform

| Concern | Library's answer | Source |
|---|---|---|
| Module code | `ModuleCode.LIBRARY = "library"`, listed in `UNRELEASED_MODULES` until the release CR | 11-contracts §1.1, 10-architecture §2.4 |
| Django app / tables | `apps/library`, tables `library_*` | 10-architecture §2.1 |
| Frontend | `frontend/src/modules/DigiKhaato/features/library`, pages `frontend/app/(app)/library/…` | 10-architecture §2.1, §6 |
| API prefix | `/api/v1/library/` (`path("library/", include("apps.library.urls"))` in `config/urls.py:12-28`) | 10-architecture §7 |
| Dependencies | `MODULE_DEPENDENCIES["library"] = {parties, ledger, payments}` | 10-architecture §2.3 |
| Engines | `ENGINES_USED_BY["library"] = {dues}` (for later recurring fees). **The MVP calls no engine.** | 10-architecture §2.3, §13.2 |
| People | Members are `parties_party` rows; the role is the `library_membership` profile (1:1, `related_name="+"`); guardians are `parties_relation` (`kind = guardian`) | ADR-046, 11-contracts §1.3 |
| Money owed | Every fee, fine, lost and damage charge is a `library_charge` row posting **one** `CHARGE` ledger line, bucket `main` | ADR-048, 11-contracts §1.2 |
| Money reduced | Every waiver or credit is a `library_waiver` row posting one `ADJUSTMENT_CREDIT` line | 11-contracts §1.2 |
| Money received | Core payments; `library_charge` is a registered allocation target (`in`, `main`, `auto`) | ADR-047, 11-contracts §1.4 |
| Deposits | Core `payments_held_deposit` (`module = library`, `subject_type = library_membership`), bucket `deposit` | ADR-044, 11-contracts §1.4 |
| Numbers | `library_member` (perpetual, `M-`), `library_accession` (perpetual, numeric), `library_charge` (FY, `FIN`) | ADR-051, 11-contracts §1.7 |
| Calendar | `platform_closed_day` + `calendar.closed_weekdays` through `is_open`, `next_open_day`, `closed_days_between` with `module="library"` | ADR-055, 11-contracts §1.8 |
| Reminders | `register_reminder_source("library_loan")`, `("library_hold")`; kinds `notice` | ADR-054, 11-contracts §1.6 |
| In-app bell | `library.hold_ready`, `library.overdue_today` via `register_notification_type` | 11-contracts §1.9, §5 |
| Dashboard, reports | `register_dashboard_section("library")`, `register_report("library_*")` | 11-contracts §1.9 |
| Imports | two importer specs, `library_copies`, `library_members` (`imports/registry.py`) | 10-architecture §4.2 R12 (see §0.7 C1) |
| Party page | a Library panel in `features/parties/modulePanels.ts` | 10-architecture §6 item 8 |
| Switch-off | refused while open loans, open charges, held deposits, or waiting/ready holds exist | 10-architecture §9 |
| Archive | `register_archive_guard("library")`: refused while the party has a non-closed membership, an open loan or a live hold | 11-contracts §1.3 |
| Export and deletion | `apps/library/tenant_data.py` registers every `library_*` table | 10-architecture §5 rule 7 |
| Documents | `window.print()` sheets, tenant branding only; extend `customerDocumentsCarryNoProductName.test.tsx` | 10-architecture §6 item 10 |

### 0.5 Conventions every feature below follows

Stated once, as Part 17.2 does.

| Concern | Convention |
|---|---|
| Tables | Extend `TenantModel` (`apps/common/models.py:21-47`): UUIDv7 `id`, `tenant` RESTRICT, `created_by` SET NULL, `created_at`, `updated_at`. FKs to `parties.Party` are RESTRICT. Money is `MoneyField` (`numeric(14,2)`); business dates are `date` in the tenant timezone; instants `timestamptz`. Per-tenant uniqueness is a partial unique index including `tenant`. Master data (categories, locations) is soft-deleted; copies are **never** deleted; money rows are never deleted. Event rows (`*_event`, `*_period`, scans) are append-only (`ImmutableModel`, `apps/common/models.py:70`) — no trigger, because they carry no money (10-architecture §5 rule 9). Rows two people can edit carry `version` (409 `stale_version`) |
| Services | `apps/library/services/<x>.py`, keyword-only, `ctx: Ctx` first, inside the caller's `transaction.atomic()`, raising `DomainError` subclasses, one `write_audit` row per logical event with `library.<entity>.<verb>` actions declared on `AuditAction` |
| Lock order | **party → membership → copy (id order) → loan → holds → `library_charge` rows `(charge_date, number, id)` → held deposit → payments → sequence.** It is the global order of `apps/parties/services/balance.py:53-66` with the library's non-money rows placed after the party and before the documents (the charges), as engines do (11-contracts, Notation). A payment locks party → charges and never a copy, so the two paths cannot cycle |
| Viewsets | Tenant base classes; `permission_classes = [IsAuthenticated, ModuleEnabled("library"), HasPermission(<codename>)]` in that order (`apps/common/permissions.py:1-5`); cross-tenant id is 404 (ADR-032) |
| API | Canon envelope `{data, meta}`; lists paginated `?page&page_size` (default 50, max 200); `?ordering=` through `StableOrderingFilter` (nulls last); create-POSTs take `Idempotency-Key`; money as 2-dp strings; dates `YYYY-MM-DD` |
| Errors | Every code registered in `apps/common/error_codes.py` and Part 22 §22.1.1, named `<subject>_<condition>`. Existing codes reused where the state is the same: `validation_error`, `not_found`, `permission_denied`, `module_disabled`, `stale_version`, `idempotency_conflict`, `sequence_backwards`, `over_allocated`, `deposit_insufficient`, `deposit_released`, `party_has_open_records`, `module_has_data` |
| Frontend | `features/library/{api,components,hooks,redux,types,constants,view-model,validation,print}`; services `api/library<X>Service.ts`; Redux Toolkit slices with `createAsyncThunk`, **each injected lazily** (`slice.injectInto(rootReducer)` and a `LazyLoadedSlices` declaration, the pattern of `features/sales/redux/invoiceListSlice.ts:101-105`); **nothing added to `store.ts`'s static reducers**; React Hook Form with schemas from the central `useValidationSchemas()`; no TanStack Query; errors only through the global snackbar; invalidations in `src/redux/invalidation/{registry,map}.ts`; forms and drawers `dynamic()` |
| UI | `Ub*` design-system components only; no raw host elements (`react/forbid-elements`); BrandHub visual language (`docs/DESIGN-SYSTEM.md`); every list has first-use, filtered-empty and error states; filters live in the URL (`usePartyListUrl` pattern) |
| Locales | One catalogue: `locales/catalogues/library.{en,hi}.json`, prefix `library.` in `locales/catalogues.json`, loaded with the route chunk (`src/i18n/catalogueRegistry.ts`); `npm run i18n:split && npm run i18n:check` after every change. Hindi uses ordinary words: पुस्तकालय (library), किताब (book), प्रति (copy), किताब नंबर (accession number), सदस्य (member), जारी करना (issue), वापसी (return), अवधि बढ़ाना (renew), लौटाने की तारीख (due date), देर से (overdue), जुर्माना (fine), माफ़ करना (waive), जमानत राशि (deposit), आरक्षण (hold), जगह (location), सदस्यता कार्ड (membership card), कोई बकाया नहीं (no dues), किताबों की गिनती (stock verification) |
| Money display | `UbAmount` and `formatInr` only (CLAUDE.md records five `formatInr`-versus-raw-string defects); a charge is money the member owes (`destructive` tone, "Member owes"), a deposit is money held for the member (neutral tone, "Deposit held"), never shown as an advance |
| Analytics | `track('ub.library.<event>', props)`; no names, mobiles, titles or notes in properties |
| Widths | Every screen is checked at 360×780, 768×1024, 1280×800 and 1440×900 by `e2e/library.mjs --shots` with the two measuring checks (§12 of each feature) |

### 0.6 Defaults the owner may change

Each open owner question in the research, and each product choice this FRD had to make, is built
with the recommended default. Changing one is a setting change or a small CR, not a redesign.

| # | Question (source) | Default adopted | Where it is used | How to change |
|---|---|---|---|---|
| D1 | Reading rooms: part of Library or their own module card? (research §17 Q1) | Out of the MVP; built later **under Library** on the bookings, dues and attendance engines; no seat table in `library` | §0.8, LIB-11 §14 | Owner decision recorded as a CR; either presentation uses the same engines |
| D2 | Deposits (research §17 Q2) | **Decided by ADR-044**: core held deposit, bucket `deposit`, applied only by an explicit act | LIB-04 | Not an owner question any more |
| D3 | GST on library charges (Q3) | Library charges are **non-GST** ledger charges; a library that must issue tax invoices raises them in the sales module | LIB-07 §9 BR-14 | Later: a `document` posting option through the document port (ADR-045) |
| D4 | Fines on closed days (Q4) | **Skip closed days** when counting days late (`fine_skip_closed_days = true`) | LIB-07 | Library settings |
| D5 | Grace semantics (Q5) | **Grace waives, it does not shift**: within grace the fine is ₹0, past grace it counts from the due date | LIB-07 | Fixed rule; changing it is a CR |
| D6 | Lost-book policy (Q6) | Price × **1** + processing fee **₹0** + fine to the day declared lost; found and unpaid → the charge is reversed; found after payment → **refunded** | LIB-07 | Library settings (`lost_multiplier`, `lost_processing_fee`, `lost_found_paid`) |
| D7 | Credit limit on library charges (Q7) | **Never refused**: `post_source_entry` never checks a limit (10-architecture §14 item 13); the library's own `dues_block_amount` blocks issue instead | LIB-06, LIB-07 | — |
| D8 | Barcode (Q8) | **Typed or USB-wedge-scanned only**; QR on the card via `apps/common/qr.py`; label printing and camera scanning later | LIB-06, LIB-13 | ADR needed for either later item |
| D9 | Accession counter (Q9) | **Decided by ADR-051**: core perpetual counter | LIB-01, LIB-02 | — |
| D10 | Class and section (Q10) | Free-text `group_label` ("9-B") on the membership | LIB-04 | Later: a structured list if another module needs it |
| D11 | Member self-view (Q11) | **Later**, through a private share link (`parties_share_link`, CR-131) rather than member logins | LIB-13 §14 | — |
| D12 | Plan limits (Q12) | The library adds **no** plan limit; members are parties and fall under whatever party rules a plan has (only `max_users` is enforced today, `apps/platform_app/services/entitlements.py:109-154`) | LIB-01 | A plan-limit CR |
| D13 | Purchase bill to catalogue (Q13) | **Not in the MVP**; the bill reference is a text field on the copy (`source_note`) | LIB-02 | Needs a core hook; verticals may not import purchases |
| D14 | Overdue copies at issue (research §6.1 setting) | **Block** (overridable with a reason) | LIB-06 | Library settings: `block`, `warn`, `off` |
| D15 | Renewal start (research §6.2) | New due date counts **from the renewal day**; an overdue loan may be renewed and its fine to that day is charged | LIB-05, LIB-06 | Settings `renew_from`, `renew_overdue` |
| D16 | Hold pick-up window (research §6.4) | **3 open days**; first placed, first served; a blocked member is skipped and keeps their place | LIB-08 | Settings `hold_pickup_days` |
| D17 | Membership renewal start (research §6.7) | From the **old end date** when renewed on or before it; from **today** when already expired | LIB-04 | Fixed rule in the MVP |
| D18 | Lost loans and the copy limit (research §6.1) | A lost loan whose lost charge is not settled **counts** toward `max_copies` | LIB-06 | Settings `lost_counts_toward_limit` |
| D19 | Fine rounding (research §6.3) | To the **rupee**, half-up (`round_amount(value, "rupee")`) | LIB-07 | Settings `fine_rounding`: `rupee` or `paise` |
| D20 | Cancel a wrong issue (research §13 EC-5) | Only on the **same business day**, and only before any renewal or return | LIB-06 | Fixed rule |
| D21 | Overdue reminder timing (research §3.8) | Candidates at **1, 7, 14 and 30** days overdue; no "due tomorrow" reminder; one text per member listing all their overdue books, and at most one reminder per book per day (`daily_cap_per_source = 1`); no time window (10-architecture §16 item 4 default) | LIB-09 | Settings `overdue_reminder_days`, `remind_day_before`; a window if the owner answers §16 item 4 differently |
| D22 | Reminder recipient for a child (research §4.7) | The guardian, when a `parties_relation` guardian with `receives_messages = true` exists; else the member | LIB-09 | Per member |
| D23 | Damage charges (research §6.6) | Minor ₹20 fixed; major 50 % of the copy's price; unusable is treated as lost | LIB-07 | Settings |
| D24 | Fine cap (research §6.3) | The type's or rule's cap if set, and **never more than the copy's price** when a price is known | LIB-07 | Type/rule cap; price rule is fixed |
| D25 | Deposit against dues | Applied only by an explicit act (at closure or from the member page), never automatically | LIB-04 | Fixed (ADR-044) |
| D26 | Holidays when several modules are on | A holiday entered in Library settings applies to **Library only** (`module = "library"`); when Library is the only vertical the screen offers "whole business" as well | LIB-05 | Per holiday |
| D27 | Waivers and overrides for assistants | **Off** for staff; delegable per member through `permissions_override.allow`. A waiver above the **waiver ceiling** (₹100) needs the owner or an admin whatever the codenames (a role check, 10-architecture §5) | LIB-07, LIB-14 | Settings `waiver_ceiling`; per-member grants |
| D28 | Deposit refunds | The endpoint checks `library.member.close` **and** the refund itself needs owner or admin (a role check: refund is a business ceiling, 10-architecture §5) | LIB-04, LIB-14 | Fixed; see §0.7 C6 |
| D29 | Reference copies | Not issuable; overridable with a reason; a membership type may allow reference loans (teachers) | LIB-05, LIB-06 | Per type |
| D30 | Membership expiring before the due date | Warn only; the due date is **not** cut to the membership's end | LIB-06 | Later setting |
| D31 | A deposit expected but not yet received | **Blocks issue** (overridable with a reason) when the type has a deposit (`deposit_required_to_borrow = true`) | LIB-04, LIB-06 | Per membership type |

### 0.7 Contract questions

Found while writing this FRD; **resolved on 30 Sep 2026** (10-architecture §17). Every proposal was
accepted; the "Resolved →" column names the resolution and where it is built.

| # | Where | The question | Assumption in this FRD | Resolved → |
|---|---|---|---|---|
| C1 | 10-architecture §10.1 vs §4.2 (R8, R9, R12) | Library must call `apps.reports.registry.register_dashboard_section` / `register_report` and `apps.imports.registry.register`, but the matrix gives verticals `CORE ∪ engines`, and `CORE` excludes `reports` and `imports` (`tests/architecture/test_import_rules.py:37-61`). As written, registering is an import-rule failure | The matrix gains `reports.registry` and `imports.registry` (the registry modules only) as permitted targets for verticals; the library imports nothing else from either app | **R27** — the two registry modules allowed; matrix amended (A11) |
| C2 | 10-architecture §4.1 (idempotent registration) vs `apps/imports/registry.py:114-118` | `imports.registry.register` raises `ImproperlyConfigured` on a second registration, so a second `ready()` is not harmless, and `is_example` detects template rows by a `name` column (`registry.py:102-107`) that a copy import does not have (`title`) | The core track makes `register` idempotent by `kind` and lets a spec name its example key; until then the library's specs register once, guarded by a module flag | **R28** — idempotent `register`, `example_key` (A10) |
| C3 | 11-contracts §1.6 | A reminder candidate carries one `subject_label` (≤ 120) and one `amount`; it has no template parameters and no way to group several sources into one message. A librarian sends **one** text per member listing every overdue copy, and there is no public service for a vertical to record reminder rows with a source (`create_reminder` writes manual party reminders only, `apps/ledger/services/reminders.py:156-177`) | Core adds `record_source_reminders(*, ctx, party_id, recipient_party_id, module, kind, channel, sources: [{source_type, source_id, subject_label, amount}], text) -> list[Reminder]`, which calls `check_reminder_allowed`, writes one row per source sharing one `message_group_id`; the library composes the text itself. Kind is `notice` when `amount is None` | **R10** — `record_source_reminders`, rows share `message_group_id` |
| C4 | 11-contracts §1.6, `apps/notifications/services/templates.py:53` | `DEFAULT_TEMPLATES` is a literal dict; there is no registry for a vertical's default message templates (R16 covers in-app notification types only) | Core adds `register_default_templates(mapping)` in `notifications/services/templates.py` (ADR-042 pattern); library registers `library_overdue`, `library_hold_ready`, `library_issue_slip` bodies for `whatsapp`/`sms` × `en`/`hi` | **R29** — `register_default_templates` (A10) |
| C5 | 11-contracts §1.4 `AllocationTarget.summary()` | The summary has `number` and amounts but no line text, so the core receipt cannot print "Overdue fine – Wings of Fire (Acc. 10231), 3 days" (research §9.2) | `summary()` gains an optional `label` key the receipt prints under the number; absent for existing targets | **R30** — `summary()["label"]` |
| C6 | 10-architecture §5 vs 11-contracts §1.4 | §5 lists *refund* among business ceilings that are role checks, not codenames; §1.4 says the vertical's codename (for example `library.member.close`) applies to deposit endpoints | Both: the endpoint needs `library.member.close`; the refund step additionally requires `owner` or `admin` by role (D28) | **R31** — both: codename and role check |
| C7 | 11-contracts §1.8 | `closed_days_between` does not say whether its bounds are inclusive; the per-module weekday override's setting key is not named | Inclusive of both ends; the override key is `calendar.closed_weekdays.<module>`; the library calls `closed_days_between(tenant, due_on + 1, returned_on, module="library")` | **R32** — inclusive; key `calendar.closed_weekdays.<module>` |
| C8 | 10-architecture §7 (`/api/v1/calendar/closed-days`) | The codename that guards writes to the core calendar is not named; a librarian (admin) must be able to add a holiday, an assistant must not | A row with `module = "library"` may be written by a member holding `library.settings.manage`; a tenant-wide row (`module` null) needs `platform.tenant.manage` or admin role | **R26** — `platform.calendar.manage` for tenant-wide rows; module rows by `library.settings.manage` |
| C9 | 10-architecture §6 item 7 | The library may import only `features/{dues,bookings,attendance,parties,payments,ledger,reminders,reports}` and `src/`. It needs `UbQrCode` (today `features/sales/components/print/UbQrCode.tsx`) and `PrintBranding` (today `features/sales/redux/salesThunk`), which payments already reaches across into sales for (`features/payments/components/print/PaymentReceiptPrint.tsx:11-12`); and a closed-days editor with no core feature home | `UbQrCode` moves to `src/design-system/UbQrCode`; `PrintBranding` and its fetch move to `src/api/brandingPrint.ts`; the closed-days editor is a new core folder `features/calendar`, added to the allowed list (core task A9-FE) | **R33** — `UbQrCode`, `src/print/`, `features/calendar` in Wave A task A16 |
| C10 | ADR-046 / 10-architecture §5 rule 2 vs research §4.7 | The research lets a party hold several memberships over time; the contracts make the profile 1:1 with the party | 1:1 (contracts win). Re-joining re-opens the same `library_membership` row; each enrolment, renewal and re-join is an immutable `library_membership_period` row | **R34** — accepted (1:1 plus period rows) |
| C11 | 11-contracts §1.4 held deposits | `payments_held_deposit` has no `version`; a membership type change that changes the deposit amount must adjust `expected_amount` | Core adds `adjust_expected(*, ctx, deposit_id, expected_amount, reason)`; until then a type change never changes the expected deposit (the difference is taken or refunded explicitly) | **R35** — `adjust_expected` (A4) |
| C12 | `record_payment` refund voucher precedent | Refunding a paid lost charge when the copy is found is an `ADJUSTMENT_CREDIT` plus an unallocated payment OUT (the SAL-04 refund-voucher shape, `apps/payments/services/record.py:28-29`). An unallocated payment out is an "advance" that a later explicit `allocate_existing` could apply to a purchase bill of the same party | Accepted: `allocate_existing` is explicit only (11-contracts §1.4), and the payment's `meta.context = "library_refund"` lets the payments list label it | **R36** — accepted, with an earmark |
| C13 | 11-contracts §1.4 `receive_deposit` | A library going live holds deposits taken on paper years ago. Recording them through `receive_deposit` today puts paper-era cash in today's cashbook; there is no opening path like LED-02's opening entry | Core adds `receive_deposit(..., opening=True)` that the cashbook and collection reports exclude; until then deposits are not imported (LIB-03 EC-6) and are recorded one by one with mode `other`, reference "Opening" | **R37** — `receive_deposit(opening=True)` in mode `adjustment`; bulk import stays Later |

### 0.8 Reading rooms and seats (future, not built)

Recorded so no one builds a seat table inside `library`. When the bookings engine exists (Wave D):

| Research need (§4.14, §15.4) | Served by |
|---|---|
| Seat "A-12" in "AC hall" with features (AC, locker, power) | `bookings_resource` (`attributes` jsonb with library-defined keys), type `library_seat`, `capacity_mode = exclusive` |
| Shifts "Morning 6–12", "Evening", "Full day" | `bookings_shift` rows; `time_mode = shifts`; a full-day shift writes one slot row per shift it covers |
| Allot a seat for October in the morning shift | `bookings.book(module="library", subject_type="library_seat_allotment", …)`; slot keys `2026-10-01/MOR` … under `UNIQUE (tenant, resource, slot_key)` |
| Monthly seat fee, admission, locker | dues plans in charge mode, ledger posting (no GST) or document posting (GST, sales on) |
| Daily attendance by QR on the member card | attendance `visit` marks; the card's QR (LIB-13) is already the member number |
| Free the seat on expiry | the dues engine's `on_due_changed` hook and a library job ending the allotment |

`ENGINES_USED_BY["library"]` gains `bookings` and `attendance` in that CR. The member is the same party
either way.

---

## LIB-01 — Switch the module on, library settings and numbering

### 1. Product requirements
The owner turns Library on in Settings → Features and finds a working library with sensible defaults,
without a set-up wizard standing between them and the counter. Measured by: a new tenant issues its
first copy within 10 minutes of switching the module on (analytics `ub.library.first_issue`
`minutes_since_enabled`).

- FR-1 `library` is switchable only when released (not in `UNRELEASED_MODULES`) and in the plan and
  partner; `parties`, `ledger` and `payments` must be on (`MODULE_DEPENDENCIES`, refusal unchanged,
  `tenant_settings.py:394-399`).
- FR-2 Switching on runs the library **preset seed** once, idempotently, touching no other module's
  settings (10-architecture §9): one `library_settings` row with the defaults of §5, one membership
  type "Standard", and nothing else (no invented categories or locations).
- FR-3 The three number kinds are registered in `apps/library/apps.py` `ready()` with
  `register_number_kind` (11-contracts §1.7) and appear in the core numbering screen only while
  Library is on. Library settings shows the **next accession number** and the **next member number**
  and lets an admin raise either (to continue a paper register); lowering is refused 409
  `sequence_backwards`.
- FR-4 `/library/settings` edits every library setting in the library's own words, in five tabs:
  General, Membership types (LIB-04), Loans and calendar (LIB-05), Fines and lost books (LIB-07),
  Holds and reminders (LIB-08, LIB-09).
- FR-5 Switching off is refused 409 `module_has_data` while any of these exist (10-architecture §9):
  open loans, `library_charge` rows with `amount_due > 0`, held deposits with `module = library`, and
  holds `waiting` or `ready`. The count names each kind (`details.blocking = [{module, kind, count}]`).
  Closed history never blocks; switching off deletes nothing; switching back on restores everything.
- FR-6 When Library is on, the navigation shows its items (§7); when it is the only vertical, no
  module heading is shown (10-architecture §6 item 2).
- FR-7 `ModuleCode.LIBRARY` lands with `apps/library/migrations/0001_initial.py` and is listed in
  `UNRELEASED_MODULES`; the frontend `MODULE_CODES` list is replaced with the server's (10-architecture
  §6 item 3), since Library is the first module to change it.

### 2. User flows
**Switch on (owner).** Settings → Features → Library → toggle on → if a dependency is off, the
existing refusal names it → on success the snackbar says "Library is on. Start at the counter or add
your books." with actions **Add books** (`/library/catalogue?new=1`) and **Import from a sheet**
(`/imports/new?kind=library_copies`) → the sidebar gains the library items.

**Continue a paper register (admin).** Library settings → General → "Next book number 1" →
**Change** → types 4513 → Save → server `raise_counter(kind="library_accession", next_number=4513)`
→ "The next book added will be number 4513." A lower number is refused inline: "Number 4000 is
already used or passed. The next number must be 4513 or higher."

**Switch off (owner).** Settings → Features → Library → toggle off → 409 → dialog: "Library still has
12 books out, ₹340 in unpaid fines, 3 deposits held and 2 holds waiting. Return, settle and refund
them first." with links to each filtered list.

### 3. Features
**MVP:** preset seed; settings screen with five tabs; counter raise for accession and member numbers;
switch-off guard; navigation rows; the `library_settings` row.
**Later:** onboarding business type "Library or reading room" and the module checklist
(shared-engines §5.2), which ship **with the first vertical released** — that is this module
(10-architecture §13.2 item 5), so they are listed as a release task (T-R3) owned by the core track;
per-branch settings when branches exist.

### 4. Entities and relationships
`library_settings` (one per tenant) → read by every library service. Number kinds live in core
`platform_document_sequence` (`fy_label = '*'` for perpetual kinds). Weekly closed days live in the
core setting `calendar.closed_weekdays.library` (C7); dated closures in `platform_closed_day` (LIB-05).

### 5. Database
**`library_settings`** — one row per tenant.

| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id`, `tenant_id`, `created_by_id`, `created_at`, `updated_at` | TenantModel | | | |
| `version` | `integer` | no | 1 | optimistic lock |
| `fine_skip_closed_days` | `boolean` | no | `true` | D4 |
| `fine_rounding` | `varchar(8)` | no | `'rupee'` | CHECK in (`rupee`, `paise`) — D19 |
| `overdue_issue_rule` | `varchar(8)` | no | `'block'` | CHECK in (`block`, `warn`, `off`) — D14 |
| `lost_counts_toward_limit` | `boolean` | no | `true` | D18 |
| `renew_from` | `varchar(10)` | no | `'today'` | CHECK in (`today`, `due_date`) — D15 |
| `renew_overdue` | `varchar(12)` | no | `'charge_fine'` | CHECK in (`charge_fine`, `block`) — D15 |
| `hold_pickup_days` | `smallint` | no | 3 | CHECK 1–30 — D16 |
| `lost_multiplier` | `numeric(4,2)` | no | 1.00 | CHECK 0.00–10.00 — D6 |
| `lost_processing_fee` | `MoneyField` | no | 0.00 | CHECK ≥ 0 |
| `lost_found_paid` | `varchar(8)` | no | `'refund'` | CHECK in (`refund`, `keep`) — D6 |
| `fallback_price` | `MoneyField` | yes | null | price for a copy with none (research §13 EC-16) |
| `damage_minor_amount` | `MoneyField` | no | 20.00 | D23 |
| `damage_major_percent` | `smallint` | no | 50 | CHECK 1–100 |
| `waiver_ceiling` | `MoneyField` | yes | 100.00 | D27; null = no ceiling |
| `overdue_reminder_days` | `smallint[]` | no | `{1,7,14,30}` | D21; each 1–365, ≤ 6 values |
| `remind_day_before` | `boolean` | no | `false` | D21 |

Constraints: `UNIQUE (tenant_id)`. No soft delete. Registered in `tenant_data.py`.

**Number kinds** (code, not rows): `register_number_kind("library_member", module="library",
mode="perpetual", default_prefix="M-", padding=4, label_id="library.numbering.member")`;
`("library_accession", mode="perpetual", default_prefix="", padding=0, …)`;
`("library_charge", mode="fy", default_prefix="FIN", padding=4, …)` — 11-contracts §1.7.

### 6. API
| Method and path | Codename | Request | Response | Errors |
|---|---|---|---|---|
| `GET /library/settings` | `library.settings.manage` or any `library.*.read` (read-only for the latter) | — | `{data: LibrarySettings, meta: {numbering: {accession: {next: 4513}, member: {prefix: "M-", next: 43}}, closed_weekdays: [6]}}` | 403, `module_disabled` |
| `PUT /library/settings` | `library.settings.manage` | full `LibrarySettings` with `version` | 200 same shape | 400 `validation_error` (per field), 409 `stale_version` |
| `POST /library/settings/numbering` | `library.settings.manage` | `{kind: "library_accession" \| "library_member", next_number: 4513}` | 200 `{kind, next_number}` | 409 `sequence_backwards` (`details.current`), 400 |
| `PUT /library/settings/closed-weekdays` | `library.settings.manage` | `{weekdays: [6]}` (0 = Monday) | 200 | 400 |

`LibrarySettings` is the table's columns in snake case, money as strings. The switch itself is the
existing Settings → Features endpoint; the library adds only its module-off counter
(`register_module_off_guard("library", counter)`).

### 7. Frontend
- Route `app/(app)/library/settings/page.tsx` → `LibrarySettingsPageContent` (`dynamic()` tabs).
- `ROUTES.library.*` added to `src/routes.ts`; `/library` to `APP_ROUTE_PREFIXES` (and so to
  `GUARDED_ROUTE_PREFIXES`, `src/routes.ts:232`) and to `CRAWL_DISALLOW` (`src/utils/seo.ts:67`).
- Service `api/librarySettingsService.ts`: `getSettings()`, `putSettings(body)`,
  `raiseNumber(kind, next)`, `putClosedWeekdays(days)`.
- Slice `redux/librarySettingsSlice.ts` (lazy): `{settings, numbering, status, saving, error}`;
  thunks `fetchLibrarySettings`, `saveLibrarySettings`, `raiseLibraryNumber`.
- Schema `librarySettingsSchema` in `useValidationSchemas()`.
- Navigation rows in `sidebarConfig.ts`, all `module: 'library'`:

| key | label | href | section | permission | bottomNav | order |
|---|---|---|---|---|---|---|
| `libraryCounter` | Counter | `/library/counter` | daily | `library.loan.write` | yes | 10 |
| `libraryHome` | Library | `/library` | daily | `library.loan.read` | yes | 11 |
| `libraryMembers` | Members | `/library/members` | daily | `library.member.read` | — | 12 |
| `libraryCatalogue` | Books | `/library/catalogue` | daily | `library.catalogue.read` | — | 13 |
| `libraryHolds` | Holds | `/library/holds` | business | `library.loan.read` | — | 30 |
| `libraryVerification` | Stock check | `/library/verification` | business | `library.verification.run` | — | 31 |
| `libraryReports` | Library reports | `/library/reports` | insight | `library.reports.read` | — | 40 |
| `librarySettings` | Library settings | `/library/settings` | account | `library.settings.manage` | — | 60 |

### 8. UI/UX
- Desktop: `UbPageShell` + `UbTabs` across the top; each tab a `UbCard` form, one column ≤ 640 px
  wide, Save pinned in a `UbBottomBar`. Phone: the tabs become a `UbChipTabs` row that scrolls
  horizontally inside its own box (never the page), forms single-column.
- Each setting has a one-line plain explanation (`UbInputHint`), e.g. "Sundays and holidays are not
  counted as late days."
- The numbering card shows the next number large (`ds-num-lg`) and **Change**; the dialog explains
  "Numbers are never reused. You can only move forward."
- States: loading → `UbSkeleton` form; error → `UbEmptyState` error variant with retry and request id;
  stale version → snackbar "Someone else changed these settings. Reloaded." and the form reloads.
- Copy keys: `library.settings.title` "Library settings" / "पुस्तकालय की सेटिंग"; `library.settings.
  nextBookNumber` "Next book number" / "अगला किताब नंबर"; `library.settings.skipClosed` "Don't count
  closed days as late" / "बंद दिनों को देरी में न गिनें".

### 9. Validation and business rules
- BR-1 Settings are read once per service call; a change applies to the **next** action (a loan
  already issued keeps its due date).
- BR-2 `raise_counter` refuses a number ≤ the highest number already allocated or imported
  (`sequence_backwards`).
- BR-3 `overdue_reminder_days` values are unique, sorted on save, 1–365, at most six.
- BR-4 The preset seed is idempotent: it creates the settings row only if absent and the "Standard"
  type only if the tenant has no membership type at all.
- Field rules: `hold_pickup_days` 1–30; `lost_multiplier` 0–10 (2 dp); money ≥ 0, ≤ 99,999,999.99,
  2 dp; `damage_major_percent` 1–100.

### 10. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Switch the module on/off | `platform.tenant.manage` (existing) | ✅ | ❌ | ❌ | ❌ |
| View settings | any `library.*.read` | ✅ | ✅ | ✅ (read-only) | ✅ (read-only) |
| Change settings, raise numbers, weekly closed days | `library.settings.manage` | ✅ | ✅ | ❌ | ❌ |

### 11. Reports
Not applicable: settings produce no report. Every setting change is in the audit log
(`library.settings.updated`, `counter.raised`).

### 12. Testing
- T-LIB-01-1 (unit) preset seed run twice creates one settings row and one type.
- T-LIB-01-2 (unit) module-off counter returns 0 for an empty tenant and the right count per kind for
  open rows only (the shared contract suite, 10-architecture §11).
- T-LIB-01-3 (API) `PUT /library/settings` with a stale `version` → 409; staff → 403.
- T-LIB-01-4 (API) raising the accession counter to a lower number → 409 `sequence_backwards`.
- T-LIB-01-5 (architecture) `ModuleCode` server and client lists are equal; `library` is in
  `UNRELEASED_MODULES` and absent from `modules_view` without `UB_UNRELEASED_MODULES=1`.
- T-LIB-01-6 (architecture) `apps/library` passes the whole-AST import test (10-architecture §10.1).
- T-LIB-01-7 (architecture) every `library_*` table is registered in `tenant_data.py`.
- T-LIB-01-8 (bundle) adding the library feature does not move the `sharedApp` budget in
  `bundle-budgets.json`.
- E2E (`e2e/library.mjs`): `01-switch-on` enables the module through the API with the unreleased flag,
  asserts the nav rows appear and a staff login sees Counter but not Library settings; `02-switch-off-
  refused` with one open loan asserts the 409 body names the loan. Shots: settings at four widths,
  each tab; the measuring checks (page `scrollWidth ≤ clientWidth + 1`; no leaf text node with
  `scrollWidth − clientWidth > 1`, `sr-only` excluded — the `ledger.mjs:439-477` pattern).

### 13. Edge cases
- EC-1 A tenant's plan lacks `library`: the toggle is not offered (existing `modules_view`).
- EC-2 Switched off and on again: the settings row and all history are still there; the seed does
  not overwrite settings.
- EC-3 Two admins raise the counter at once: the sequence row lock serialises them; the second gets
  409 if its number is now lower.
- EC-4 A school continues register number "4512-A": the counter handles the numeric series only;
  suffixed numbers are typed per copy (LIB-02 BR-3).

### 14. Future
Onboarding checklist and "Library or reading room" business type (shared-engines §5.2, release task
T-R3); per-branch settings; a "study space" section in these settings when seats land (§0.8).

---

## LIB-02 — Catalogue: titles, copies, accession numbers, categories and locations

### 1. Product requirements
Every physical book has one permanent accession number and its own history; a title is entered once
and carries any number of copies. Finding a book by title, author, ISBN or number takes one search
box. Measured by: median catalogue search ≤ 300 ms at 50,000 copies; zero duplicate accession
numbers (a database constraint, not a hope).

- FR-1 A **title** holds the work: title, subtitle, authors (display string), ISBN, publisher,
  edition, year, language, category, material type, call number, keywords, notes.
- FR-2 A **copy** holds the physical book: accession number, optional barcode (only when existing
  labels differ from the number), location (or free-text location), status, reference flag,
  acquired on, source and source note (donor, supplier, bill number), price, condition, volume
  label, last seen on.
- FR-3 "Add book" searches first (ISBN or title) and offers **Add copies to this title** when a match
  exists, so a second title is not created for the same work (research §3.2).
- FR-4 Creating a title creates its first copies in the same form; **Add copies** later takes a
  count, a location, price, acquired on and source, and gives consecutive numbers from the
  `library_accession` counter — or takes typed numbers, one per copy, when continuing a register.
- FR-5 Accession numbers are **unique per tenant for ever**, compared case-insensitively, including
  withdrawn copies; a number is never reused and never renumbered after the copy's first issue.
- FR-6 A copy is **never deleted**. It leaves stock by **withdrawal** with a reason (worn out, lost,
  missing at verification, transferred, damaged, other + note), which needs `library.copy.withdraw`.
- FR-7 Every copy status change writes an immutable `library_copy_event` row (from, to, reason,
  source), the `inventory` stock-movement pattern reused as a pattern, not as rows (research §15.2).
- FR-8 **Categories** (name, optional parent, one level, sort order) and **locations** (code, name)
  are the library's own lists; each can be renamed, a category merged into another, and either
  deleted only while unused (else deactivated).
- FR-9 One search box searches title, subtitle, authors, publisher, keywords, ISBN (either format,
  with or without hyphens) and accession number; an exact accession or barcode match jumps straight
  to the copy; a 10- or 13-digit ISBN match lists that title first (research §11).
- FR-10 Title list filters: category, material type, language, availability (any copy on the shelf /
  all out), has holds, year range; sorts: title A–Z, recently added, most issued (12 months). Copy
  list filters: status, location, category, acquired between, source, price missing, not seen since;
  sorts: accession number (numeric-aware: "R-2" before "R-10"), title. Filters live in the URL.
- FR-11 A title shows its copies (number, location, status, due date if out, borrower if the viewer
  holds `library.member.read`), its hold queue (LIB-08) and 12-month issue count. A copy shows its
  event history and its loans.
- FR-12 A title is archived (hidden from default lists) automatically when every copy is withdrawn,
  and can be archived by hand only then; it is never deleted once any copy was issued.

### 2. User flows
**Add a new book (staff).** Books → **Add book** (or `N` on the catalogue page) → drawer opens with
the ISBN/title field focused → types or scans ISBN `978-81-7371-146-6` → debounced search finds
nothing → fills title "Wings of Fire", authors "A. P. J. Abdul Kalam; Arun Tiwari", language
"English", category "Biography" (create-inline), material type Book → copies section: count 3,
location "A-3", price ₹250, acquired today, source Bought, source note "Bill 118, Sharma Book Depot"
→ Save → snackbar "Added *Wings of Fire* with 3 copies: 4513, 4514, 4515." with action **Print
numbers** (a slip listing the numbers, to write in the books).

**Add copies to an existing title.** Search finds "Wings of Fire" → **Add copies to this title** →
count 2 → Save → "Added 2 copies: 4516, 4517."

**Continue a register with typed numbers.** In the copies section switch **Numbers** from
"Next available" to "I'll type them" → one field per copy → types 1024, 1025 → a taken number is
refused inline "1024 is already *Godaan* (copy 2)".

**Withdraw (admin).** Copy page → ⋯ → **Withdraw** → `UbReasonDialog` with reason chips and note →
"Withdraw copy 4514? It stays in the register as withdrawn; its number is never reused." → Confirm →
status `withdrawn`, event written, title counts updated; if it was the last copy and holds were
waiting, those holds are cancelled with reason "No copies left" (LIB-08 EC-4).

### 3. Features
**MVP:** titles, copies, categories, locations, search, filters, withdraw, repair status, copy
events, numeric-aware ordering, archive on last withdrawal, "print numbers" slip.
**Later:** separate author table and author browse; series; MARC import/export; ISBN lookup (external
service, ADR); spine/QR labels; copy photos; weeding list (never issued in N years, LIB-12 later);
"add copies from a purchase bill" (needs a core hook, D13).

### 4. Entities and relationships
```
library_category 1─* library_title 1─* library_copy *─1 library_location
                                           │
                                           ├─* library_copy_event   (immutable)
                                           ├─* library_loan          (LIB-06)
                                           └─* library_hold (copy-specific, LIB-08)
library_title 1─* library_hold (title queue, LIB-08)
```

### 5. Database
**`library_category`** (TenantModel + SoftDeleteModel)

| Column | Type | Null | Notes |
|---|---|---|---|
| `name` | `varchar(60)` | no | |
| `parent_id` | FK `library_category` RESTRICT | yes | one level: CHECK via service (a parent has no parent) |
| `sort_order` | `smallint` | no, 0 | |
| `is_active` | `boolean` | no, true | |

`UNIQUE (tenant_id, lower(name)) WHERE deleted_at IS NULL`.

**`library_location`** (TenantModel + SoftDeleteModel): `code varchar(24)` not null, `name
varchar(80)` default `''`, `is_active boolean` true, `sort_order smallint` 0.
`UNIQUE (tenant_id, upper(code)) WHERE deleted_at IS NULL`.

**`library_title`** (TenantModel)

| Column | Type | Null | Notes |
|---|---|---|---|
| `title` | `varchar(300)` | no | 1–300 chars |
| `subtitle` | `varchar(300)` | no, `''` | |
| `authors` | `varchar(300)` | no, `''` | "Premchand; R. K. Narayan" |
| `isbn13` | `varchar(13)` | yes | normalised ISBN-13, digits only |
| `publisher` | `varchar(160)` | no, `''` | |
| `edition` | `varchar(40)` | no, `''` | |
| `year` | `smallint` | yes | CHECK 1500 ≤ year ≤ 2100 (service: ≤ current year + 1) |
| `language` | `varchar(40)` | no, `''` | free text with suggestions |
| `category_id` | FK `library_category` RESTRICT | yes | |
| `material_type` | `varchar(16)` | no, `'book'` | CHECK in (`book`, `reference`, `magazine`, `textbook`, `audio_visual`, `other`) |
| `call_number` | `varchar(40)` | no, `''` | e.g. DDC "891.43" |
| `keywords` | `varchar(300)` | no, `''` | |
| `notes` | `text` | no, `''` | |
| `copies_total` | `integer` | no, 0 | cache: copies not withdrawn |
| `copies_available` | `integer` | no, 0 | cache: `status = available` and not reference |
| `status` | `varchar(10)` | no, `'active'` | CHECK in (`active`, `archived`) |
| `search_text` | `text` GENERATED ALWAYS AS `lower(title ‖ ' ' ‖ subtitle ‖ ' ' ‖ authors ‖ ' ' ‖ publisher ‖ ' ' ‖ keywords)` STORED | | Django `GeneratedField` |
| `version` | `integer` | no, 1 | |

Indexes: `ix_library_title_search` GIN (`search_text gin_trgm_ops`) — `pg_trgm` is already installed
(`apps/common/migrations/0001_enable_extensions.py`), no new extension (10-architecture §10 rule 4);
`ix_library_title_isbn (tenant_id, isbn13) WHERE isbn13 IS NOT NULL` (not unique: reprints, sets);
`ix_library_title_list (tenant_id, status, lower(title))`; `ix_library_title_category (tenant_id,
category_id)`. CHECKs: `copies_available ≤ copies_total`, both ≥ 0.

**`library_copy`** (TenantModel; never deleted)

| Column | Type | Null | Notes |
|---|---|---|---|
| `title_id` | FK `library_title` RESTRICT | no | |
| `accession_number` | `varchar(24)` | no | letters, digits, `-`, `/`; trimmed |
| `accession_sort` | `varchar(48)` | no | service-computed: each digit run left-padded to 12 → numeric-aware order |
| `barcode` | `varchar(40)` | yes | only when labels differ from the number |
| `location_id` | FK `library_location` RESTRICT | yes | |
| `location_text` | `varchar(80)` | no, `''` | small libraries without a location list |
| `status` | `varchar(16)` | no, `'available'` | CHECK in (`available`, `on_loan`, `on_hold_shelf`, `in_repair`, `lost`, `missing`, `withdrawn`) |
| `is_reference` | `boolean` | no, false | not for loan whatever the type |
| `acquired_on` | `date` | yes | |
| `source` | `varchar(12)` | no, `'bought'` | CHECK in (`bought`, `gifted`, `transferred`, `other`) |
| `source_note` | `varchar(160)` | no, `''` | donor, supplier, bill number |
| `price` | `MoneyField` | yes | CHECK ≥ 0 |
| `condition` | `varchar(8)` | no, `'good'` | CHECK in (`good`, `fair`, `poor`) |
| `volume_label` | `varchar(24)` | no, `''` | "Vol. 2", "Mar 2026" |
| `withdrawn_on` | `date` | yes | |
| `withdrawn_reason` | `varchar(16)` | yes | CHECK in (`worn_out`, `lost`, `missing`, `transferred`, `damaged`, `other`) |
| `withdrawn_note` | `varchar(160)` | no, `''` | |
| `last_seen_on` | `date` | yes | set by return, verification, found |
| `issued_ever` | `boolean` | no, false | set at first issue; freezes `accession_number` |
| `version` | `integer` | no, 1 | |

Constraints: `uq_library_copy_accession UNIQUE (tenant_id, upper(accession_number))` — **no**
soft-delete exclusion, so a withdrawn copy's number stays taken (FR-5);
`uq_library_copy_barcode UNIQUE (tenant_id, upper(barcode)) WHERE barcode IS NOT NULL`;
`ck_library_copy_withdrawn CHECK ((status = 'withdrawn') = (withdrawn_on IS NOT NULL))`.
Indexes: `(tenant_id, accession_sort)`, `(tenant_id, status)`, `(tenant_id, title_id)`,
`(tenant_id, location_id)`, `(tenant_id, last_seen_on)`.

**`library_copy_event`** (TenantModel + ImmutableModel)

| Column | Type | Notes |
|---|---|---|
| `copy_id` | FK `library_copy` RESTRICT | |
| `from_status` | `varchar(16)` null | null on creation |
| `to_status` | `varchar(16)` | |
| `reason_code` | `varchar(24)` | `created`, `issued`, `returned`, `set_aside`, `withdrawn`, `repair`, `back_to_shelf`, `lost`, `found`, `missing`, `cancelled_issue`, `imported`, `edited_number` |
| `note` | `varchar(160)` | |
| `source_type` / `source_id` | `varchar(48)` / `uuid` null | `library_loan`, `library_hold`, `library_verification`, `imports_job` |
| `on_date` | `date` | business date |

Index `(copy_id, created_at)`.

### 6. API
| Method and path | Codename | Request → response | Errors |
|---|---|---|---|
| `GET /library/titles` | `library.catalogue.read` | `?q&category&material_type&language&availability=on_shelf\|all_out&has_holds&year_from&year_to&status&ordering=title\|-created_at\|-issues_12m&page` → `{data: [TitleRow], meta: {count, page}}`; `TitleRow = {id, title, subtitle, authors, isbn13, category: {id, name}, material_type, copies_total, copies_available, holds_waiting, status}` | 400 |
| `POST /library/titles` | `library.catalogue.write` | `{title, subtitle, authors, isbn, publisher, edition, year, language, category_id, material_type, call_number, keywords, notes, copies: {count, numbers?: [str], location_id?, location_text?, price?, acquired_on?, source, source_note?, is_reference?, volume_label?}}` + `Idempotency-Key` → 201 `{data: TitleDetail, meta: {created_numbers: ["4513","4514"], warnings: [{code: "isbn_exists", title_id}]}}` | 400 `validation_error` (`isbn13`: "This ISBN's check digit is wrong."), 409 `library_accession_taken` (`details: {number, copy_id, title}`) |
| `GET /library/titles/{id}` | `library.catalogue.read` | → `TitleDetail = TitleRow + {publisher, edition, year, language, call_number, keywords, notes, copies: [CopyRow], holds: [HoldRow], issues_12m, version}` | 404 |
| `PATCH /library/titles/{id}` | `library.catalogue.write` | fields + `version` | 409 `stale_version` |
| `POST /library/titles/{id}/copies` | `library.catalogue.write` | same `copies` object → 201 `{data: [CopyRow], meta: {created_numbers}}` | 409 `library_accession_taken` |
| `POST /library/titles/{id}/archive` · `/restore` | `library.catalogue.write` | → 200 | 409 `library_title_has_copies` (`details.count`) |
| `GET /library/copies` | `library.catalogue.read` | `?q&status&location&category&acquired_from&acquired_to&source&price_missing&not_seen_since&title&ordering=accession\|title` → `[CopyRow]`; `CopyRow = {id, accession_number, barcode, title: {id, title, authors}, location: {id, code} \| null, location_text, status, is_reference, price, condition, volume_label, due_on?, borrower?: {membership_id, name, member_number}}` (`borrower` only with `library.member.read`) | |
| `GET /library/copies/{id}` | `library.catalogue.read` | → `CopyRow + {acquired_on, source, source_note, withdrawn_*, last_seen_on, events: [CopyEvent], loans: [LoanRow] (last 20), version}` | 404 |
| `PATCH /library/copies/{id}` | `library.catalogue.write` | location, price, condition, notes, volume label, barcode; `accession_number` only while `issued_ever = false` | 409 `library_accession_frozen`, `library_accession_taken`, `stale_version` |
| `POST /library/copies/{id}/withdraw` | `library.copy.withdraw` | `{reason_code, note}` | 409 `library_copy_on_loan` (`details.loan_id`) |
| `POST /library/copies/{id}/repair` · `/back-to-shelf` | `library.catalogue.write` | `{note?}` | 409 `library_copy_unavailable` (`details.status`) |
| `GET /library/lookup?code=` | `library.catalogue.read` | → `{kind: "copy"\|"member"\|"isbn"\|"none", copy?: CopyRow, member?: MemberSummary, titles?: [TitleRow]}` — the counter's resolver (LIB-06) | |
| `GET/POST /library/categories`, `PATCH/DELETE /library/categories/{id}`, `POST /library/categories/{id}/merge {into_id}` | read / `library.catalogue.write` | | 409 `library_category_in_use` (`details.count`) |
| `GET/POST /library/locations`, `PATCH/DELETE /library/locations/{id}` | read / `library.catalogue.write` | | 409 `library_location_in_use` |

New error codes: `library_accession_taken` (409), `library_accession_frozen` (409),
`library_copy_on_loan` (409), `library_copy_unavailable` (409), `library_title_has_copies` (409),
`library_category_in_use` (409), `library_location_in_use` (409), `library_code_ambiguous` (409).

### 7. Frontend
- Routes: `/library/catalogue` (titles), `/library/catalogue/[titleId]`, `/library/copies`,
  `/library/copies/[copyId]`, `/library/catalogue/categories`, `/library/catalogue/locations`.
- Components: `CatalogueListPageContent` (`UbDataGrid`, card layout below `md`), `TitleDetailPage
  Content`, `CopyDetailPageContent`, `AddBookDrawer` (`dynamic()`), `AddCopiesDrawer` (`dynamic()`),
  `WithdrawCopyDialog` (`UbReasonDialog`), `CategoryManager`, `LocationManager`, `CopyStatusBadge`
  (`UbStatusBadge` tone map in `view-model/copyDisplay.ts`).
- Services: `api/libraryCatalogueService.ts` (`listTitles`, `getTitle`, `createTitle`, `patchTitle`,
  `addCopies`, `listCopies`, `getCopy`, `patchCopy`, `withdrawCopy`, `lookup`, categories and
  locations CRUD); mapping in `api/libraryMapping.ts` (wire ↔ camelCase in one place).
- Slices (all lazy): `libraryTitleListSlice`, `libraryTitleDetailSlice`, `libraryCopyListSlice`,
  `libraryCopyDetailSlice`, `libraryCatalogueFormSlice` (drawer state, created numbers).
- URL state: `useLibraryListUrl(listKey)` — one hook for every library list, modelled on
  `usePartyListUrl` (seed once, write back on change).
- Invalidation: `createTitle`, `addCopies`, `withdrawCopy` invalidate `libraryTitleList`,
  `libraryTitleDetail`, `libraryCopyList`, `libraryHome`.

### 8. UI/UX
- **Desktop list**: `UbPageHeader` "Books" with search (`UbSearchInput`, 300 ms), **Add book**, ⋯
  (Import from a sheet, Categories, Locations); chips row (availability, material type, has holds);
  grid columns Title (title owns its line and wraps `line-clamp-2`; authors as caption), Category,
  Copies "2 of 3 on shelf", Holds. **Phone**: cards — title (wraps), authors caption, a status line
  "2 of 3 on shelf · 1 waiting"; the chip row scrolls in its own box.
- **Title page**: header (title, authors, badges Reference/Archived on the caption line, never
  truncating the title — the CLAUDE.md LED-03 rule); copies as a list with number in `ds-mono`,
  location, status badge, "Due 12 Oct · Asha K." when out; holds queue; ⋯ Add copies / Edit / Archive.
- **Add book drawer**: right 480 px on desktop, bottom sheet 92 vh on phone; the first field is
  focused **by the drawer's own focus hook**, not React `autoFocus`, which `MLDialog` overrides
  (CLAUDE.md, LED-01 finding); no field opens red; Save pinned in the footer above the keyboard.
- Empty states: first use — "Your catalogue is empty. Add your first book, or bring in your
  register from a spreadsheet." with **Add book** and **Import**; filtered empty — "No books match
  *wings*." with **Clear filters** and **Add "wings" as a new book**; error — retry + request id.
- Loading: skeleton rows; the search keeps the previous rows dimmed (`refreshing`) rather than
  blanking.
- Copy keys (en / hi): `library.catalogue.title` "Books" / "किताबें"; `library.copy.accession`
  "Book number" / "किताब नंबर"; `library.copy.status.available` "On shelf" / "अलमारी में";
  `.on_loan` "Out" / "जारी"; `.on_hold_shelf` "Kept aside" / "अलग रखी"; `.in_repair` "In repair" /
  "मरम्मत में"; `.lost` "Lost" / "खोई"; `.missing` "Missing" / "नहीं मिली"; `.withdrawn` "Withdrawn" /
  "हटाई गई"; `library.catalogue.added` "Added {title} with {count} copies: {numbers}."

### 9. Validation and business rules
| Field | Rule | Message (en) |
|---|---|---|
| title | required, 1–300 after trim | "Enter the book's title." |
| isbn13 | optional; accept ISBN-10 (mod-11, `X` allowed) or ISBN-13 (EAN, 978/979 prefix); strip spaces and hyphens; store ISBN-13 | "This ISBN's check digit is wrong." |
| year | 1500 … current year + 1 | "Enter a year between 1500 and {max}." |
| accession_number | 1–24, `^[A-Za-z0-9][A-Za-z0-9/-]*$`, unique case-insensitively | "Use letters, numbers, - or /." / "{n} is already {title}." |
| copies.count | 1–200 per request | "Add at most 200 copies at a time." |
| copies.numbers | when given, length = count, no repeats | "Each copy needs its own number." |
| price | ≥ 0, 2 dp, ≤ 99,999,999.99 | |
| withdraw reason | required; note required when `other` (≥ 3 chars) | "Say why this copy is withdrawn." |

- BR-1 Numbers come from `allocate_counter(kind="library_accession")` inside the create transaction,
  locked **last** (L4). A rolled-back create returns its numbers; the series has no gap.
- BR-2 A typed number that is all digits and ≥ `peek_counter` raises the counter to number + 1 in the
  same transaction (ADR-051), so the next automatic number never collides with it.
- BR-3 Suffixed numbers ("4512-A") are allowed as typed numbers; they never move the counter.
- BR-4 `accession_sort` = the number upper-cased with every run of digits left-padded to 12
  (`R-2` → `R-000000000002`), so `ORDER BY accession_sort` is numeric-aware in SQL.
- BR-5 A duplicate ISBN is a **warning** (201 with `meta.warnings`), never an error.
- BR-6 `copies_total` and `copies_available` are moved only by the copy status service in the same
  transaction as the event row; `manage.py library_recount` recomputes them and a replay test proves
  the incremental path (10-architecture §11).
- BR-7 Withdrawal is refused while the copy is `on_loan` or `on_hold_shelf`; it is allowed from
  `available`, `in_repair`, `lost`, `missing`.
- BR-8 A lookup code is matched in this order: exact accession number, exact barcode, member number
  (LIB-04), valid ISBN; the first hit wins, so a library whose barcodes equal member numbers cannot
  exist (both are unique per tenant; a clash is refused when the second is created, 409
  `library_code_ambiguous`).

### 10. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Browse catalogue and copies | `library.catalogue.read` | ✅ | ✅ | ✅ | ✅ |
| Add/edit titles and copies, categories, locations, repair | `library.catalogue.write` | ✅ | ✅ | ✅ | ❌ |
| Withdraw a copy | `library.copy.withdraw` | ✅ | ✅ | ❌ | ❌ |
| See who holds a copy | `library.member.read` | ✅ | ✅ | ✅ | ✅ |

### 11. Reports
Feeds the accession register and the stock summary (LIB-12). The "Print numbers" slip after adding
copies is a screen print, not a report.

### 12. Testing
- T-LIB-02-1 (unit) ISBN-10 `817371146X`-style check digits and ISBN-13 EAN digits; conversion
  10 → 13; hyphens stripped.
- T-LIB-02-2 (unit) `accession_sort` orders `R-2, R-10, 9, 10, 100, 4512, 4512-A`.
- T-LIB-02-3 (DB) inserting `4513` and `4513` (and `r-1` / `R-1`) in two transactions: the second
  raises `IntegrityError`; a withdrawn copy's number still blocks.
- T-LIB-02-4 (unit) typed number 9000 raises the counter to 9001; typed `4512-A` does not move it.
- T-LIB-02-5 (unit) `library_recount` equals the incremental caches after a fuzzed 200-step sequence
  of issues, returns, withdrawals and repairs.
- T-LIB-02-6 (API) PATCH `accession_number` after first issue → 409 `library_accession_frozen`.
- T-LIB-02-7 (performance) `EXPLAIN` of the catalogue search at 50,000 copies uses
  `ix_library_title_search` (the `tests/performance/test_party_list_plans.py` pattern).
- T-LIB-02-8 (component) Add book drawer opens with no error text, the first field focused, and
  "Add copies to this title" shown when the ISBN search returns a title.
- E2E `03-catalogue`: add a title with 3 copies through the UI and assert the **network** carried
  `copies.count = 3` and the grid shows "3 of 3 on shelf"; search by accession jumps to the copy;
  search by hyphenated ISBN finds the title. Shots: list (empty, filled, filtered-empty), title page
  with a copy out and a hold, add-book drawer (empty, filled, refused for a taken number), copy page
  with history — at four widths, with both measuring checks.

### 13. Edge cases
- EC-1 Same number typed twice in one request → 400 `validation_error` before any row is written.
- EC-2 Paper register has two books numbered 4512 → the second is added as `4512-A` with a note
  (research §13 EC-2); import reports the clash (LIB-03).
- EC-3 A number typed with leading zeros ("0042") is stored as typed; it does not equal "42"
  (registers differ; the library decides). The counter is raised by its numeric value.
- EC-4 Editing a copy whose status another device just changed → 409 `stale_version`.
- EC-5 Hindi titles ("गोदान") match as typed; trigram search works on Devanagari as on Latin text; no
  transliteration in the MVP.
- EC-6 Magazines: each issue is a copy with `volume_label = "Mar 2026"` (research §13 EC-15).
- EC-7 Multi-volume sets: each volume is a copy with a volume label; a hold may name the copy (LIB-08).
- EC-8 Withdrawing a lost copy that is later found: `found` is allowed from `withdrawn` only when the
  withdrawal reason was `lost` or `missing`; the copy returns to `available` and the event says so.

### 14. Future
Author table; series; MARC; ISBN lookup (ADR); label printing (Code 128 in-house or QR labels with
the existing encoder, ADR if a package is proposed, research §15.3); copy photos (`files_attachment`,
`owner_type = library_copy`); purchase-bill hook (core seam, D13); weeding list.

---

## LIB-03 — CSV import of copies, members and books already out

### 1. Product requirements
A library moving off paper brings its accession register, its member register and the books that
are out on go-live day into the product in one afternoon, through the existing import wizard
(template → upload → review → commit → errors file, IMP-01). Measured by: a 6,000-row register
imports with every rejected row explained in the errors file and none silently dropped.

- FR-1 Three importer kinds registered from `apps/library/apps.py` into `imports/registry.py`
  (C1, C2): `library_copies`, `library_members`, `library_open_loans`. Each declares
  `modules=("library",)`, so the wizard offers it only while Library is on.
- FR-2 **Copies**: one row per copy. Titles are **grouped** from the rows and matched to titles
  already in the catalogue, so the same file can be imported in parts and a second file adds copies
  to titles the first created.
- FR-3 Categories and locations named in the file are created when absent; the review step shows
  how many will be created ("3 new categories, 12 new locations") before anything is written.
- FR-4 After a copies import the accession counter is raised to the highest all-digit imported
  number + 1 (ADR-051); suffixed numbers never move it.
- FR-5 **Members**: one row per member; the party is matched by mobile (exact, normalised) or
  created; a guardian (name + mobile) is matched or created and linked by `parties_relation`
  (`kind = guardian`, `receives_messages = true`).
- FR-6 **Books already out**: one row per open loan (accession number, member number, issued on, due
  on), imported after copies and members. The copy becomes `on_loan`, a loan is written with an
  `imported` event, and **no fine is charged** for the past; a loan already past its due date shows
  as overdue from its due date onwards like any other.
- FR-7 Deposits and unpaid paper fines are **not imported** in the MVP (§13 EC-6); deposits held on
  paper are recorded one by one as opening deposits (LIB-04 FR-12, C13 → R37).

### 2. User flows
Books → ⋯ → **Import from a sheet** → `/imports/new?kind=library_copies` → **Download template**
(CSV with a `#` help line per column and two example rows) → fill in → upload → the review step
shows rows understood, errors and warnings, and the totals card ("5,980 copies in 2,113 titles; 3 new
categories; 12 new locations; accession numbers 1–6012; 20 rows need attention") → **Import 5,980
rows** → progress → completion card with **Go to books** and **Download the 20 rows that were not
imported**. Members and books-out follow the same path from Members → ⋯ → Import.

### 3. Features
**MVP:** the three kinds; grouping and matching; on-the-fly categories and locations; counter raise;
errors file; the totals card.
**Later:** MARC and Koha/e-Granthalaya exports (research §16); importing held deposits in bulk
through the opening-deposit path (R37) and paper fines; photos.

### 4. Entities and relationships
Writes `library_title`, `library_copy`, `library_copy_event` (`reason_code = imported`,
`source_type = imports_job`), `library_category`, `library_location`, `parties_party`,
`parties_relation`, `library_membership`, `library_membership_period`, `library_loan`,
`library_loan_event`. Reads `platform_document_sequence`. The job row is core `imports_job`.

### 5. Database
No new tables. The specs (Python, `apps/library/importers.py`) declare:

| Kind | Columns (`*` required) | Unique in file | Max rows |
|---|---|---|---|
| `library_copies` | `accession_number*`, `title*`, `subtitle`, `authors`, `isbn`, `publisher`, `edition`, `year`, `language`, `category`, `material_type`, `location`, `price`, `acquired_on`, `source`, `source_note`, `volume_label`, `is_reference`, `status` (`available` default, `lost`, `missing`, `withdrawn`), `withdrawn_reason`, `withdrawn_on` | `accession_number` (case-folded) | 10,000 (`registry.py:82`) |
| `library_members` | `name*`, `mobile`, `member_number`, `membership_type*` (by name), `starts_on`, `valid_until`, `group_label`, `guardian_name`, `guardian_mobile`, `address`, `notes` | `member_number`, `mobile` | 10,000 |
| `library_open_loans` | `accession_number*`, `member_number*`, `issued_on*`, `due_on*` | `accession_number` | 10,000 |

Aliases (header folding is the framework's): `acc_no`, `accession no`, `book number` → `accession_number`;
`author` → `authors`; `shelf`, `almirah` → `location`; `class`, `section`, `batch` → `group_label`;
`admission_no`, `roll_no` → `member_number`.

### 6. API
The existing import endpoints (IMP-01) with `kind` set; no library endpoint. Row error codes
(the framework's `(column, code, message)`):

| Code | Kind | Meaning |
|---|---|---|
| `duplicate_in_file` | all | framework's |
| `accession_taken` | copies | "4512 is already *Godaan* in your books." |
| `accession_invalid` | copies, loans | characters or length |
| `isbn_invalid` (warning) | copies | "ISBN check digit is wrong — imported without the ISBN." |
| `year_out_of_range` (warning) | copies | year dropped |
| `unknown_material_type` | copies | lists the allowed words |
| `status_not_importable` | copies | `on_loan` / `on_hold_shelf` — use the books-out import |
| `type_unknown` | members | "No membership type called *Teachr*." with the closest name |
| `member_number_taken` | members | |
| `mobile_invalid` | members | the parties validator's message |
| `party_name_differs` (warning) | members | mobile matched a party with another name; linked anyway |
| `already_member` | members | the party already has a membership that is not closed |
| `copy_not_found`, `member_not_found` | loans | |
| `copy_not_available` | loans | the copy's status is not `available` |
| `due_before_issue` | loans | |
| `issued_in_future` | loans | |

### 7. Frontend
No new route: the core wizard (`app/(app)/imports`) renders any registered kind. The library adds
entry points (⋯ menus on Books and Members, the empty states of both lists, the settings General tab)
and its column help strings to `locales/catalogues/library.{en,hi}.json` (the spec's `label` and
`help` are i18n keys). The totals card reads the spec's `totals()`.

### 8. UI/UX
The wizard's own layouts apply. The library's words: template example rows use real-looking but
invented books ("Godaan · Premchand", "Wings of Fire · A. P. J. Abdul Kalam"); the `is_example` guard
must recognise them by `title` (C2), so an untouched example row is flagged, not created. Hindi help
lines ("हर किताब की एक पंक्ति; किताब नंबर दोहराया न जाए").

### 9. Validation and business rules
- BR-1 Title grouping key: `isbn13` when the row has a valid ISBN; else
  `(casefold(title), casefold(authors), casefold(edition))`. Matching against existing titles uses
  the same key.
- BR-2 Within a group, title-level fields are taken from the **first** row; a later row that
  disagrees is a warning ("row 14 says publisher *NBT*, row 3 said *Rupa*; kept *Rupa*").
- BR-3 `commit_rows` runs in one transaction through library services only (IMP-01 BR-6: never a
  model write), so title caches, events and the counter move exactly as for hand entry.
- BR-4 A `withdrawn` row needs `withdrawn_reason`; `withdrawn_on` defaults to the import date.
- BR-5 Members: `starts_on` defaults to the import date; `valid_until` defaults to `starts_on +
  type.validity_months` (none when the type has no validity); **no fee charge is posted** by an import
  (the fee for the current period was collected on paper).
- BR-6 Books out: `due_on ≥ issued_on`; `issued_on ≤ today`; the member's limits are **not** checked
  (they describe the past); the copy must be `available` and the membership not closed.

### 10. Permissions
| Kind | Required to upload and commit | Read (template, job) |
|---|---|---|
| `library_copies` | `library.catalogue.write` + `import_export` module on | `library.catalogue.read` |
| `library_members` | `library.member.write`, `parties.party.write` | `library.member.read` |
| `library_open_loans` | `library.loan.write`, `library.loan.adjust` | `library.loan.read` |

Books-out import needs `library.loan.adjust` because it writes loans with past dates (staff do not
hold it by default).

### 11. Reports
The completion card and errors file are the framework's. The accession register (LIB-12) shows
imported copies with source "imported" in the event history.

### 12. Testing
- T-LIB-03-1 (unit) grouping: 3 rows with one ISBN → 1 title, 3 copies; 2 rows same title/author
  without ISBN → 1 title; a second import of the same ISBN adds copies to the existing title.
- T-LIB-03-2 (unit) counter after importing `1…6012` and `4512-A` is 6013.
- T-LIB-03-3 (unit) `accession_taken` against an existing withdrawn copy.
- T-LIB-03-4 (unit) members: mobile match links the existing party (no duplicate contact); guardian
  relation created once.
- T-LIB-03-5 (unit) books out: overdue imported loan appears in the overdue list and no
  `library_charge` exists.
- T-LIB-03-6 (contract) each spec's `validate_row` issues no query per row (the IMP-01 rule), measured
  with `django_assert_max_num_queries`.
- E2E `04-import`: upload a 25-row copies file with two bad rows through the wizard; assert 23 copies
  on the network response, the errors file holds exactly the two rows. Shots: review step and
  completion card at four widths, measuring checks.

### 13. Edge cases
- EC-1 A 30,000-copy register exceeds `max_rows`: the framework refuses with "Import at most 10,000
  rows at a time — split the file." (`engine.py:394-398`).
- EC-2 Two copies of one title in the file with different categories: first row wins, warning.
- EC-3 A member row whose mobile belongs to a party that is a shop customer: linked; the party gains
  the library role and keeps its khata (one person, one contact, ADR-046).
- EC-4 A books-out row for a copy imported as `lost`: `copy_not_available`.
- EC-5 Re-running the same file: every row fails `accession_taken` / `already_member`; nothing is
  duplicated.
- EC-6 Deposits held on paper: not imported. A deposit is money, and recording it as an ordinary
  payment today would put paper-era cash in today's cashbook, so the librarian records each with
  **Record deposit already held** (LIB-04 FR-12), which calls core
  `receive_deposit(..., opening=True)`: mode `adjustment`, excluded from the cashbook and the
  collection reports (C13 → R37).
- EC-7 Unpaid paper fines: entered as the party's opening balance (LED-02) or a manual charge
  (LIB-07), not imported.

### 14. Future
Bulk import of opening deposits (R37); MARC import/export; photo import; a Koha CSV preset mapping.

---

## LIB-04 — Members: membership types, validity, fees and deposits

### 1. Product requirements
A member is a person in `parties` with a library membership: one contact across every module
(ADR-046). Enrolling takes one form; the fee and deposit are shown, charged and collected in the same
step; the membership card prints straight after. Measured by: enrolment with payment in ≤ 60 s;
zero deposits counted as income (a report invariant, T-LIB-04-6).

- FR-1 **Membership types** carry the circulation defaults: max copies at a time, loan days, max
  renewals, fine per day, fine cap, grace days, max holds, validity (months, or none), fee per
  validity period, admission fee (once), deposit, dues block amount, whether reference copies may be
  borrowed. Types are edited in Library settings; a type with members is deactivated, never deleted.
- FR-2 **Enrol**: pick or create the party (name, mobile, address — the parties form and validators);
  choose type; start date (default today); valid until is computed and may be edited; member number
  is the next `library_member` number or typed (a school admission number); group label (class and
  section, department, batch); optional guardian (a party, linked by `parties_relation`).
- FR-3 At enrolment the server posts, as `library_charge` rows: the **admission fee** (if > 0) and the
  **membership fee** (if > 0), and opens a **held deposit** (`open_deposit`, expected = type deposit)
  if the type has one.
- FR-4 **Collect now** (optional, same screen): one amount-and-mode block for the fees and one for
  the deposit. The server records **two payments** when both are taken — one IN allocated to the fee
  charges (bucket `main`), one IN to the `held_deposit` target through `receive_deposit` (bucket
  `deposit`) — because one payment settles one kind of balance (11-contracts §1.4). The screen shows
  them as one act ("Collected ₹1,200: fees ₹200, deposit ₹1,000") with both receipts.
- FR-5 **Renew**: extends validity by the type's months (from the old end date when renewed on or
  before it, from today when already expired, D17), posts a `renewal_fee` charge, and offers Collect
  now.
- FR-6 **Change type**: applies to new loans and renewals only (open loans keep their due dates);
  writes a `type_change` period row; the deposit expectation is not changed automatically (C11).
- FR-7 **Suspend** (until a date, or indefinitely, with a reason) and **reactivate**.
- FR-8 **Close**: refused while the member has open loans; waiting and ready holds are cancelled
  with reason "Membership closed"; if the member owes library charges and holds a deposit, the
  screen offers **Adjust ₹X of the deposit against dues** (`apply_deposit`, explicit, D25), then
  **Refund the rest** (`refund_deposit`, owner/admin only, D28); what is left owed stays on the party
  (research §13 EC-9). Status becomes `closed`.
- FR-9 **Re-join**: a closed member is re-opened on the same row (C10) with a new type, dates, fees
  and deposit; the old member number is kept.
- FR-10 **Member page** (`/library/members/[id]`): header (name, number, type, status, valid until,
  group, guardian), the member panel figures (copies held of allowed, overdue, dues, deposit held,
  holds ready), tabs **Books** (open and past loans), **Charges** (with waive and collect), **Holds**,
  **History** (periods, suspensions, reminders sent), and actions Renew, Collect, Print card, No-dues
  certificate, Overdue notice, Suspend, Close.
- FR-11 The party page shows a **Library** panel (membership, books held, dues, deposit, link to the
  member page) through `features/parties/modulePanels.ts`, and `GET /parties?role=library_member`
  lists members (`register_party_role`).
- FR-12 **Record deposit already held** (for go-live, LIB-03 EC-6): `receive_deposit(...,
  opening=True, payment_date=<go-live date>)`; the receipt prints "Opening deposit" (C13 → R37).

### 2. User flows
**Enrol with payment (staff, phone at the counter).** Members → **Add member** → party picker
"Asha" → **Create "Asha Kulkarni"** inline (mobile 98xxxxxx21) → type "Student" → start today,
valid until 31 Mar 2027 (type 6 months, edited) → member number M-0043 (shown, editable) → group
"9-B" → guardian: create "Suresh Kulkarni", mobile → the fees card shows "Admission ₹50 · Membership
₹150 · Deposit ₹500 (returned when membership ends)" → **Collect now** on → fees: Cash ₹200;
deposit: UPI ₹500, UTR → Save → snackbar "Asha Kulkarni is member M-0043. Collected ₹700." with
**Print card** and **Go to counter**.

**Renew (staff).** Member page → **Renew** → dialog "Student · 1 Apr 2027 – 30 Sep 2027 · fee ₹150"
→ Collect now (cash) → Renew.

**Close with dues and a deposit (admin).** Member page → **Close membership** → step 1 "Books: all
returned ✓" (else "Return 2 books first" with the list, and the flow stops) → step 2 "Owes ₹40 in
fines · Deposit held ₹500" → **Adjust ₹40 from the deposit** (ticked) → step 3 "Refund ₹460" mode
Cash → reason "Passed out, class 12" → Close → two adjustment payments, one refund payment, status
closed; snackbar with **Print no-dues certificate**.

### 3. Features
**MVP:** types; enrol; renew; change type; suspend/reactivate; close; re-join; fees as charges;
held deposits (open, receive, apply, refund); collect-now; member list with filters; member page;
party panel and role filter; guardian by relation.
**Later:** recurring monthly plans through the dues engine (charge mode, ledger posting; subject
`library_membership`, 10-architecture §2.3); family memberships sharing a limit; reading fee per book;
pro-rata on type change; photos; member self-view (D11); deposit-scaled limits as a formula (today:
separate types, research §6.7).

### 4. Entities and relationships
```
parties_party 1─1 library_membership *─1 library_membership_type
      │                 │
      │                 ├─* library_membership_period   (immutable: enrol, renew, rejoin, type_change, suspend, reactivate, close)
      │                 ├─* library_loan, library_hold, library_charge
      │                 └── payments_held_deposit (subject_type = "library_membership", subject_id = membership.id)
      └─* parties_relation (kind = guardian) ─1 parties_party (the guardian)
library_membership_type 1─* library_loan_rule (LIB-05)
```

### 5. Database
**`library_membership_type`** (TenantModel)

| Column | Type | Null / default | Constraint |
|---|---|---|---|
| `name` | `varchar(60)` | no | unique `(tenant_id, lower(name))` |
| `code` | `varchar(16)` | `''` | |
| `max_copies` | `smallint` | 2 | CHECK 0–50 |
| `loan_days` | `smallint` | 14 | CHECK 1–365 |
| `max_renewals` | `smallint` | 2 | CHECK 0–20 |
| `fine_per_day` | `MoneyField` | 2.00 | CHECK ≥ 0 |
| `fine_cap` | `MoneyField` | null | CHECK ≥ 0 |
| `grace_days` | `smallint` | 0 | CHECK 0–30 |
| `max_holds` | `smallint` | 2 | CHECK 0–20 |
| `validity_months` | `smallint` | null | CHECK 1–120; null = no expiry |
| `fee_amount` | `MoneyField` | 0 | per validity period |
| `admission_fee` | `MoneyField` | 0 | once |
| `deposit_amount` | `MoneyField` | 0 | |
| `deposit_required_to_borrow` | `boolean` | true | effective only when `deposit_amount > 0` (D31) |
| `dues_block_amount` | `MoneyField` | null | block issue when open library dues exceed it |
| `allows_reference_loan` | `boolean` | false | |
| `is_active` | `boolean` | true | |
| `sort_order` | `smallint` | 0 | |
| `version` | `integer` | 1 | |

**`library_membership`** (TenantModel)

| Column | Type | Null / default | Notes |
|---|---|---|---|
| `party_id` | `OneToOneField("parties.Party", on_delete=RESTRICT, related_name="+")` | no | the role (ADR-046) |
| `member_number` | `varchar(24)` | no | unique `(tenant_id, upper(member_number))` |
| `member_number_sort` | `varchar(48)` | no | as `accession_sort` |
| `membership_type_id` | FK RESTRICT | no | |
| `starts_on` | `date` | no | |
| `valid_until` | `date` | yes | null = no expiry; CHECK `valid_until ≥ starts_on` |
| `status` | `varchar(10)` | `'active'` | CHECK in (`active`, `suspended`, `closed`); *expired* is derived |
| `suspended_until` | `date` | yes | null with `suspended` = until lifted |
| `suspension_reason` | `varchar(160)` | `''` | |
| `group_label` | `varchar(40)` | `''` | |
| `card_issued_on` | `date` | yes | set on first card print |
| `closed_on` | `date` | yes | CHECK `(status = 'closed') = (closed_on IS NOT NULL)` |
| `closed_reason` | `varchar(160)` | `''` | |
| `notes` | `text` | `''` | |
| `version` | `integer` | 1 | |

Indexes: `(tenant_id, status, valid_until)`, `(tenant_id, group_label)`, `(tenant_id,
membership_type_id)`, `(tenant_id, member_number_sort)`.

**`library_membership_period`** (TenantModel + ImmutableModel): `membership_id` FK, `kind`
(`enrol`, `renew`, `rejoin`, `type_change`, `suspend`, `reactivate`, `close`), `membership_type_id`,
`starts_on`, `valid_until` null, `fee_charge_id` FK `library_charge` null, `reason varchar(160)`,
`on_date date`. Index `(membership_id, created_at)`.

**Core rows used, not owned:** `payments_held_deposit` with `module = 'library'`, `subject_type =
'library_membership'`, `subject_id = membership.id`, `purpose = 'Library deposit'` (11-contracts
§1.4); `parties_relation` with `kind = 'guardian'` (11-contracts §1.3).

### 6. API
| Method and path | Codename | Request → response | Errors |
|---|---|---|---|
| `GET/POST /library/membership-types`, `PATCH /library/membership-types/{id}` | read: any `library.*.read`; write: `library.settings.manage` | `MembershipType` (columns) | 409 `stale_version` (a type in use is deactivated, never deleted) |
| `GET /library/members` | `library.member.read` | `?q&status=active\|expiring\|expired\|suspended\|closed&type&group&expiring_within=7&has_overdue&has_dues&deposit_held&ordering=name\|member_number\|valid_until\|-dues&page` → `[MemberRow]`, `meta.totals {members, dues, deposits_held}` | |
| `POST /library/members` | `library.member.write` (+ `parties.party.write` to create a party) | `{party_id \| party: {name, mobile, billing_address?}, membership_type_id, member_number?, starts_on?, valid_until?, group_label?, guardian: {party_id \| name+mobile}?, collect_fees?: PaymentBlock, collect_deposit?: PaymentBlock}` + `Idempotency-Key` → 201 `{data: MemberDetail, meta: {charges: [ChargeRow], payments: [{id, number, amount}], deposit: DepositRow \| null}}` | 409 `library_membership_exists` (`details.membership_id`, `status`), `library_member_number_taken`, 400 |
| `GET /library/members/{id}` | `library.member.read` | → `MemberDetail = MemberSummary + {party: {id, name, mobile, address}, guardian, periods, charges_open, deposit, notes, version}` | 404 |
| `PATCH /library/members/{id}` | `library.member.write` | group, valid_until, notes, member_number (until first loan), guardian | 409 `stale_version` |
| `POST /library/members/{id}/renew` | `library.member.write` | `{collect?: PaymentBlock}` | 409 `library_membership_closed` |
| `POST /library/members/{id}/change-type` | `library.member.write` | `{membership_type_id, reason}` | |
| `POST /library/members/{id}/suspend` · `/reactivate` | `library.member.close` | `{until?, reason}` | |
| `POST /library/members/{id}/close` | `library.member.close` (+ owner/admin role for a refund) | `{apply_to_dues: bool, refund?: {amount, mode_breakup, payment_date}, reason}` → 200 `{data: MemberDetail, meta: {applied, refunded, still_owed}}` | 409 `library_membership_has_loans` (`details.count`), `deposit_insufficient`, 403 `permission_denied` (refund without role) |
| `POST /library/members/{id}/rejoin` | `library.member.write` | as enrol minus party | 409 `library_membership_exists` |
| `POST /library/members/{id}/deposit/receive` | `library.member.write` | `PaymentBlock + {opening?: false}` | `deposit_released` |
| `POST /library/members/{id}/deposit/apply` | `library.member.close` | `{charge_ids?: [uuid], amount?, reason}` (default: oldest open charges first) | `deposit_insufficient`, `over_allocated` |
| `POST /library/members/{id}/deposit/refund` | `library.member.close` + owner/admin role | `{amount, mode_breakup, payment_date, reason}` | `deposit_insufficient` |

`PaymentBlock = {mode_breakup: [{mode, amount, reference?, upi_app?}], payment_date?}` — the
`record_payment` shape (`apps/payments/services/record.py:21-35`). `MemberSummary` (also used by the
counter) = `{membership_id, party_id, name, member_number, type: {id, name, max_copies}, status,
effective_status, valid_until, group_label, loans_open, loans_overdue, lost_unsettled, holds_ready,
dues_amount, deposit: {expected, held} | null, blocks: [Block], guardian_name}`, where `Block =
{code, overridable, params}`.

New error codes: `library_membership_exists`, `library_member_number_taken`,
`library_membership_closed`, `library_membership_has_loans` (all 409).

### 7. Frontend
- Routes: `/library/members`, `/library/members/[membershipId]`, `/library/members/new` (the enrol
  form as a page on phones; a drawer from the list on desktop).
- Components: `MemberListPageContent`, `MemberDetailPageContent`, `MemberPanel` (shared with the
  counter — one component, two hosts), `EnrolMemberForm` (`dynamic()`), `CollectBlock` (wraps
  payments' `PaymentModeEditor`, allowed import), `RenewMembershipDialog`, `CloseMembershipFlow`
  (`UbStepper`), `SuspendDialog`, `MembershipTypeEditor` (settings tab), `LibraryPartyPanel`
  (registered in `features/parties/modulePanels.ts`).
- Services: `api/libraryMemberService.ts` (`listMembers`, `getMember`, `enrol`, `patchMember`,
  `renew`, `changeType`, `suspend`, `reactivate`, `close`, `rejoin`, `receiveDeposit`,
  `applyDeposit`, `refundDeposit`, types CRUD).
- Slices (lazy): `libraryMemberListSlice`, `libraryMemberDetailSlice`, `libraryEnrolSlice`.
- Schemas: `libraryEnrolSchema`, `libraryMembershipTypeSchema`, `libraryCloseSchema` in
  `useValidationSchemas()`, composed from `amountValidation()`, `businessDateValidation()`,
  `mobileValidation()`, `reasonValidation()`.
- Invalidation: enrol/renew/close invalidate `libraryMemberList`, `libraryMemberDetail`,
  `partyDetail` (the balance moved — a real refetch, never a false `patch`, CLAUDE.md LED-01),
  `libraryHome`.

### 8. UI/UX
- **Member list**, desktop: columns Member (name owns its line; number and group as caption), Type,
  Valid until (red caption "Expired 3 days ago" when past), Books "2 of 3", Dues (`UbAmount`),
  Deposit held. Phone: card — name, "M-0043 · 9-B · Student", a status line "2 books · owes ₹40";
  status chips (Active, Expiring in 7 days, Expired, Suspended, Closed) scroll in their own box.
- **Enrol form**: one column; the fees card sits above Save and totals what will be charged; the
  deposit line always says "returned when membership ends" so nobody reads it as a fee.
- **Member page**: header like the party khata header (name, badges on the caption line, number
  in `ds-mono`); actions: Renew, Collect, Print card primary; the rest behind ⋯ (the LED-02 lesson:
  five buttons made the page 275 px wider than a phone).
- States: first use — "No members yet. Add your first member or import your register."; filtered
  empty — "No members match *asha* · Add Asha as a member"; closed member — a neutral banner "Closed
  on 31 Mar 2027 · Re-join"; suspended — warning banner with the reason and until date.
- Copy (en / hi): `library.member.title` "Members" / "सदस्य"; `library.member.deposit` "Deposit
  (returned when membership ends)" / "जमानत राशि (सदस्यता खत्म होने पर वापस)"; `library.member.
  validUntil` "Valid until" / "कब तक मान्य"; `library.member.status.expired` "Expired" / "समाप्त";
  `library.member.close` "Close membership" / "सदस्यता बंद करें".

### 9. Validation and business rules
| Field | Rule | Message |
|---|---|---|
| party | required; `status = active`; not already a member with a non-closed membership | "Asha Kulkarni is already member M-0043." |
| member_number | 1–24, letters/digits/`-`/`/`; unique case-insensitively | "M-0043 is already Asha Kulkarni." |
| valid_until | ≥ starts_on | "The end date is before the start date." |
| starts_on | ≤ today + 30 days; ≥ 2000-01-01 | |
| type fields | as §5 CHECKs | |
| guardian | not the member themself (`CHECK party <> related_party`, 11-contracts §1.3) | |
| collect blocks | `record_payment` rules; fees block ≤ fees charged; deposit block ≤ expected − held | "More than the fees due." |
| close reason | ≥ 3 chars | |

- BR-1 **Effective status**: `closed` if closed; else `suspended` if `status = suspended` and
  (`suspended_until` is null or ≥ today); else `expired` if `valid_until < today`; else `active`.
  No job flips statuses; every read derives it (so a missed job can never leave a member wrongly
  active).
- BR-2 **Validity**: `valid_until = starts_on + validity_months − 1 day` (1 Oct → 31 Mar for 6
  months; month-end clamped by `apps/common/recurrence.py`); none when the type has no validity.
- BR-3 **Renewal start** (D17): if today ≤ `valid_until`, the new period starts `valid_until + 1`;
  else it starts today.
- BR-4 **Fees are charges**: each fee is one `library_charge` (kinds `admission_fee`,
  `membership_fee`, `renewal_fee`) posting one `CHARGE` line through `post_source_entry(entry_type=
  "charge", source_type="library_charge", bucket="main")`, dated the action date. They are never
  refused by a credit limit (D7).
- BR-5 **Deposits are never income and never offset dues by themselves** (ADR-044): received through
  `receive_deposit`, applied only through `apply_deposit` with a reason, refunded only through
  `refund_deposit`. The member's `party.balance` never includes a deposit; `party.deposit_held` does.
- BR-6 **Closing**: refused while any loan is `open`; allowed with lost loans (their charges are
  charges like any other); holds cancelled in the same transaction; deposit applied then refunded
  in that order; `still_owed = Σ amount_due of open library charges` after application stays on the
  party and blocks archiving it through the ordinary balance guard.
- BR-7 One membership row per party (C10). `POST /library/members` for a party with a closed
  membership is 409 `library_membership_exists` with `status = closed`, and the client offers
  **Re-join**.
- BR-8 A type change never changes an open loan's due date, and the new limits apply from the next
  issue (a member now over the new `max_copies` keeps their books and cannot borrow more).
- BR-9 Lock order for enrol and close: party → membership → charges → deposit → payments → sequence.
- BR-10 **Blocks** (computed by `member_blocks(membership, today)`, shared with LIB-06):

| Code | When | Overridable |
|---|---|---|
| `membership_expired` | effective status expired | no — renew first |
| `membership_suspended` | effective status suspended | no — reactivate first |
| `membership_closed` | closed | no |
| `copy_limit_reached` | open loans (+ unsettled lost loans when D18) ≥ `max_copies` | yes |
| `has_overdue` | any open loan with `due_on < today` and `overdue_issue_rule = block` (`warn` → a warning) | yes |
| `dues_over_limit` | Σ open library `amount_due` > `dues_block_amount` | yes |
| `deposit_not_received` | `deposit_required_to_borrow` and held < expected | yes (D31) |

### 10. Permissions
| Action | Codename / role | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View members | `library.member.read` | ✅ | ✅ | ✅ | ✅ |
| Enrol, edit, renew, change type, re-join, receive deposit | `library.member.write` | ✅ | ✅ | ✅ | ❌ |
| Suspend, reactivate, close, apply deposit | `library.member.close` | ✅ | ✅ | ❌ | ❌ |
| Refund a deposit | `library.member.close` **and** role owner/admin (not delegable) | ✅ | ✅ | ❌ | ❌ |
| Edit membership types | `library.settings.manage` | ✅ | ✅ | ❌ | ❌ |
| Collect money | `payments.payment.write` (core) | ✅ | ✅ | ✅ | ❌ |

### 11. Reports
Feeds: fines and fees collected, deposits held (LIB-12), members expiring (dashboard), no dues.
Member activity and never-borrowed lists are later.

### 12. Testing
- T-LIB-04-1 (unit) effective status for every combination of status, `suspended_until` and
  `valid_until` around today, including the tenant-timezone boundary.
- T-LIB-04-2 (unit) enrol with admission ₹50, fee ₹150, deposit ₹500, collecting both: two payments;
  ledger has two `charge` lines (main), one `payment_in` main, one `payment_in` deposit;
  `party.balance = 0`, `party.deposit_held = 500`.
- T-LIB-04-3 (unit) renew early (valid until 31 Mar, renewed 20 Mar) → new period 1 Apr – 30 Sep;
  renew late (renewed 10 Apr) → 10 Apr – 9 Oct.
- T-LIB-04-4 (unit) close with ₹40 open fines and ₹500 held: apply 40 (two `adjustment` payments),
  refund 460; `deposit_held = 0`; fines paid; audit rows `library.membership.closed`,
  `deposit.applied`, `deposit.refunded`.
- T-LIB-04-5 (permission) staff with `library.member.close` granted by override still cannot refund
  (role check) → 403; the close without refund succeeds.
- T-LIB-04-6 (invariant) the cashbook and every income figure exclude deposit receipts and
  adjustments (`bucket_of` excludes `adjustment`, `apps/reports/selectors/cash_sources.py`).
- T-LIB-04-7 (contract) the archive guard returns a block for a party with an active membership and
  none after closure; the role filter lists members of enabled modules only.
- T-LIB-04-8 (replay) `held_amount` on each library deposit equals received − applied − refunded
  after a fuzzed sequence (core replay test, run with library subjects).
- E2E `05-members`: enrol with collect-now through the UI and assert the network carried two
  payment blocks; the party page shows the Library panel; renew; close with apply and refund as
  owner; a staff context (its own browser context, asserting who is signed in first) sees no Refund.
  Shots: list (empty, filled, filtered-empty), enrol form (empty, fees card, refused for an existing
  member), member page (active, expired, suspended, closed), close flow each step — four widths,
  both measuring checks.

### 13. Edge cases
- EC-1 The party already exists as a shop customer with a balance: enrol links it; the member page
  shows **library** dues only; the khata shows everything (one balance, ADR-043).
- EC-2 A child without a mobile: allowed; reminders go to the guardian (D22).
- EC-3 Membership expires while books are out: loans continue, no new issue or renewal; the member
  appears in "Expired, still holding books" (research §13 EC-8).
- EC-4 Close with dues larger than the deposit: apply all of it, refund ₹0, the rest stays owed.
- EC-5 Two devices enrol the same party: the 1:1 constraint makes the second 409
  `library_membership_exists`.
- EC-6 The deposit payment is voided later: `void_payment` reverses it; the deposit's `held_amount`
  drops (core); if it would go negative because part was applied, the void is refused by core.
- EC-7 A fee charge is wrong: it is reversed with a reason (LIB-07 §9 BR-11), never edited.
- EC-8 Staff try to archive a member's party: 409 `party_has_open_records` with `module = library`
  and a count, from the library's archive guard.

### 14. Future
Recurring monthly plans through the dues engine (subject `library_membership`, `register_subject`
with the membership label and `reminder_template_key = "library_fee_due"`); family memberships; photo
on the card (`files_attachment`); member self-view through a share link (D11); pro-rata on type
change; bulk import of opening deposits (R37).

---

## LIB-05 — Due dates, loan rules and the closed-days calendar

### 1. Product requirements
The due date is worked out, never typed, and never falls on a day the library is shut. The library
keeps one list of closed days, shared with any other module that asks (ADR-055: "three calendars
that disagree about Diwali" is what the core calendar prevents). Measured by: zero due dates on a
closed day (an invariant query in T-LIB-05-3).

- FR-1 **Loan rules** come from the membership type, overridden per **material type** (and
  optionally per type × material type): loanable or not, loan days, max renewals, fine per day, fine
  cap, grace days. Most specific match wins; a null column inherits (research §4.6, §16: the MVP
  ships type defaults plus material-type overrides).
- FR-2 **Due date** at issue: `next_open_day(issued_on + loan_days, module="library")`.
- FR-3 **Renewal due date**: from the renewal day (default) or from the old due date (setting
  `renew_from`, D15), plus loan days, moved to the next open day.
- FR-4 **Weekly closed days** (e.g. Sunday) are the core setting `calendar.closed_weekdays.library`
  (C7), edited on the Loans and calendar tab.
- FR-5 **Holidays and closures** (a date or a range, with a reason ≤ 60 chars) are core
  `platform_closed_day` rows with `module = "library"` (D26), written through the core endpoint
  `/api/v1/calendar/closed-days` (C8).
- FR-6 When a holiday is added over dates on which open loans fall due, the dialog offers **Move
  the N books due that day to {next open day}** (ticked by default); moving writes a `due_changed`
  loan event with reason "Library closed: {reason}" for each.
- FR-7 A holiday removed later does **not** move due dates back.
- FR-8 Staff with `library.loan.adjust` may change one loan's due date with a reason (LIB-06).

### 2. User flows
**Add Diwali (admin).** Library settings → Loans and calendar → Holidays → **Add** → date range
8 Nov – 10 Nov 2026, reason "Diwali" → Save → the core endpoint writes three `platform_closed_day`
rows → the library asks `GET /library/loans/due-on?from=2026-11-08&to=2026-11-10` → 14 open loans →
dialog "14 books are due on those days. Move them to Wed 11 Nov?" → **Move** → 14 `due_changed`
events → snackbar "Diwali added. 14 books now due on 11 Nov."

**Set a material-type rule (admin).** Loans and calendar → Loan rules → **Magazine**: loan days 3, max
renewals 0 → Save. **Reference**: not loanable (default).

### 3. Features
**MVP:** type defaults; material-type overrides with optional per-type rows; weekly closed days;
holidays; move-due on holiday add; due-date computation for issue and renewal.
**Later:** the full member-category × item-type matrix UI (the table already allows it); hourly
loans (reference desk, "return by 5 pm"); opening hours per weekday (for hourly loans and seats).

### 4. Entities and relationships
`library_membership_type 1─* library_loan_rule` (per material type, `membership_type` null = all
types). Core: `platform_closed_day` (date, reason, module), setting `calendar.closed_weekdays.library`.
Read by LIB-06 (due dates), LIB-07 (fine days), LIB-08 (collect-by), LIB-09 (reminder dates).

### 5. Database
**`library_loan_rule`** (TenantModel)

| Column | Type | Null | Notes |
|---|---|---|---|
| `membership_type_id` | FK RESTRICT | yes | null = every type |
| `material_type` | `varchar(16)` | no | same CHECK as `library_title.material_type` |
| `loanable` | `boolean` | no, true | `reference` rows default false |
| `loan_days` | `smallint` | yes | 1–365; null inherits the type |
| `max_renewals` | `smallint` | yes | 0–20 |
| `fine_per_day` | `MoneyField` | yes | ≥ 0 |
| `fine_cap` | `MoneyField` | yes | ≥ 0 |
| `grace_days` | `smallint` | yes | 0–30 |

`UNIQUE NULLS NOT DISTINCT (tenant_id, membership_type_id, material_type)` (PostgreSQL 16).
Seeded with one row: `(null, 'reference', loanable = false)`.

No library calendar table: the calendar is core (ADR-055).

### 6. API
| Method and path | Codename | Request → response | Errors |
|---|---|---|---|
| `GET /library/loan-rules` | any `library.*.read` | → `[LoanRule]` plus `meta.effective` for each type × material type (the resolved rule the counter will use) | |
| `PUT /library/loan-rules` | `library.settings.manage` | the whole list (replace, in one transaction) | 400 per row |
| `GET /library/loans/due-on?from&to` | `library.loan.read` | → `{count, by_date: {"2026-11-08": 9, …}, next_open_day}` | |
| `POST /library/loans/shift-due` | `library.settings.manage` | `{from, to, reason}` → `{moved: 14, to: "2026-11-11"}` | |
| `GET /library/due-date-preview?membership_id&copy_id&on` | `library.loan.read` | → `{due_on, rule: {loan_days, source: "type"\|"material"\|"type_material"}, moved_from?: date}` | |
| Core: `GET/POST/DELETE /calendar/closed-days?module=library` | C8 | 11-contracts §1.8, 10-architecture §7 | |

### 7. Frontend
- The Loans and calendar tab of `/library/settings`: `ClosedWeekdaysChips` (library), the shared
  `ClosedDaysEditor` from the new core folder `features/calendar` (C9), `LoanRulesTable`
  (per material type, one row each; an "Add type-specific rule" row per membership type),
  `MoveDueDialog`.
- Service additions in `librarySettingsService.ts`: `getLoanRules`, `putLoanRules`, `dueOn`,
  `shiftDue`, `dueDatePreview`.
- Slice: `librarySettingsSlice` holds rules and weekdays (no new slice).

### 8. UI/UX
- Weekly closed days: seven `UbChoiceChips` (Mon … Sun, हिंदी: सोम … रवि); hint "Books never fall due
  on these days."
- Holidays: a list grouped by month, each row "Sun 8 Nov – Tue 10 Nov · Diwali · Library only";
  add opens a small dialog with `UbDateRangePicker`; delete is a ⋯ action with confirm.
- Loan rules: desktop table (Material type, Loanable, Loan days, Renewals, Fine/day, Grace, Cap);
  empty cells read "Same as type" in tertiary text; phone: one card per material type with the same
  fields as rows.
- The counter shows the due date large on every issued row, and "moved from Sun 11 Oct" in the
  caption when it was moved.
- Copy: `library.calendar.closedWeekdays` "Closed every" / "हर हफ़्ते बंद"; `library.calendar.holiday`
  "Holiday or closure" / "छुट्टी"; `library.calendar.moveDue` "Move the {count} books due that day
  to {date}?" / "उस दिन लौटने वाली {count} किताबों की तारीख {date} कर दें?"

### 9. Validation and business rules
- BR-1 **Rule resolution** for (type T, material M): row (T, M) → row (null, M) → T's defaults, per
  column (a null column inherits). A copy with `is_reference = true` resolves as material
  `reference` whatever its title's material type.
- BR-2 **Loanable**: a resolved `loanable = false` refuses issue with block `not_loanable`, unless T
  has `allows_reference_loan` and M is `reference` (D29) — then it is loanable with the resolved
  days.
- BR-3 **Due date**: `due_on = next_open_day(issued_on + loan_days)`. If every day in the next 366
  is closed (a misconfiguration), the service raises 409 `library_calendar_all_closed`.
- BR-4 **Renewal**: `base = renewal_day` (or `old due_on` when `renew_from = due_date`);
  `due_on = next_open_day(base + loan_days)`; a renewal never makes a due date earlier than the old
  one (if it would, the old one stands and the renewal is refused 409 `library_renewal_refused`,
  `reason = no_gain`).
- BR-5 Holidays added after issue do not change stored due dates unless the move-due dialog is
  accepted; fines skip closed days anyway when D4 is on (LIB-07 BR-3), so the member is not
  penalised for a new holiday either way.

Worked due-date examples (Sunday closed; Diwali 8–10 Nov 2026 closed):

| # | Issued | Loan days | Raw due | Rule | Due on |
|---|---|---|---|---|---|
| 1 | Sat 26 Sep 2026 | 14 | Sat 10 Oct | open | **Sat 10 Oct** |
| 2 | Sun 27 Sep is closed; issued Mon 28 Sep | 13 | Sun 11 Oct | Sunday → next open | **Mon 12 Oct** |
| 3 | Mon 26 Oct | 14 | Mon 9 Nov | Diwali 8–10 Nov → next open | **Wed 11 Nov** |
| 4 | Renewed Thu 8 Oct, `renew_from = today` | 14 | Thu 22 Oct | open | **Thu 22 Oct** |
| 5 | Renewed Thu 8 Oct, `renew_from = due_date` (old due 10 Oct) | 14 | Sat 24 Oct | open | **Sat 24 Oct** |

### 10. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View rules and calendar | any `library.*.read` | ✅ | ✅ | ✅ | ✅ |
| Edit rules, weekly days, library holidays, move due dates | `library.settings.manage` | ✅ | ✅ | ❌ | ❌ |
| Tenant-wide holidays | core `platform.calendar.manage` (owner, admin; C8 → R26) | ✅ | ✅ | ❌ | ❌ |

### 11. Reports
None of its own; the circulation register shows moved due dates through the loan events.

### 12. Testing
- T-LIB-05-1 (unit) rule resolution for all eight null/non-null combinations of (T,M), (null,M), T.
- T-LIB-05-2 (unit) the five worked examples, with the calendar stubbed through
  `platform_app.services.calendar`.
- T-LIB-05-3 (invariant) after a fuzzed month of issues and renewals, `SELECT count(*) FROM
  library_loan WHERE status = 'open' AND NOT is_open(due_on)` is 0 (computed in Python over the
  core calendar).
- T-LIB-05-4 (API) shift-due moves exactly the loans due in range and writes one event each.
- T-LIB-05-5 (unit) a calendar with every weekday closed → 409 `library_calendar_all_closed`.
- E2E `06-calendar`: add a holiday through the settings UI over a date on which a seeded loan is
  due; accept the move; the loan's due date on the member page is the next open day. Shots: the tab
  with holidays and rules at four widths, the move-due dialog, measuring checks.

### 13. Edge cases
- EC-1 A tenant-wide holiday (module null) closes the library too; a library-only holiday does not
  close the shop's reminder days.
- EC-2 A loan issued on a closed day (a special opening): allowed; the issue date is what it was.
- EC-3 Loan days that end on a long closure (summer vacation, 45 days): due moves to the first open
  day after; the school may prefer extending loans — the move-due dialog does that.
- EC-4 A rule changed while loans are open: open loans keep their due dates; the new rule applies at
  the next issue or renewal.
- EC-5 Tenant timezone: `issued_on` is `tenant_today`, never the device date (CLAUDE.md LED-01 EC-8).

### 14. Future
Hourly loans with opening hours; a "vacation loan" preset (all loans due on the reopening day);
the full rule matrix UI; per-branch calendars when branches exist.

---

## LIB-06 — The counter: issue, return and renew

### 1. Product requirements
The counter is the screen the library uses most, at break time, with a queue of students. It is
keyboard-first, works with a USB or Bluetooth barcode scanner acting as a keyboard (it types the
number and presses Enter, research §15.3), and never needs the mouse for the common path. Measured
by: 30 issues in 20 minutes at one desk (research §2, Meena); P95 server time ≤ 250 ms for issue and
return; a burst of ten scans is processed in order with none lost; focus is back in the scan box
after every action, dialog or error.

- FR-1 `/library/counter` has one **scan box** and three modes — **Issue**, **Return**, **Renew** —
  chosen with chips or `Alt+I`, `Alt+R`, `Alt+N` (read from `event.code`, so macOS Option works).
  The mode is remembered per device.
- FR-2 Anything typed or scanned into the box is resolved by `GET /library/lookup?code=` (LIB-02
  BR-8): a **member number** (or the card's QR read by a 2D scanner, which is the member number)
  loads the member; an **accession number or barcode** acts on the copy in the current mode; a valid
  **ISBN** lists the title's copies with their status (to find which copy to pick from the shelf).
- FR-3 **Issue**: scan a member (or search by name or mobile in the same box: any text that is not a
  code is a member search, results in a list navigable with ↑/↓ and Enter); the **member panel**
  shows status, validity, books held of allowed, overdue, library dues, deposit, holds ready, and any
  **block** in plain words with who may override. Then each copy scanned is **issued at once** — one
  request per scan, no basket and no confirm step — and appears as a row with its due date.
- FR-4 A blocked issue shows the reasons in the member panel; a **non-overridable** block (expired,
  suspended, closed; the copy not available, kept aside for someone else, not loanable without
  override) stops there with the way forward ("Renew the membership first"). An **overridable** block
  (copy limit, overdue books, dues over limit, deposit not received, reference copy) offers
  **Override** (`Alt+O`) to a member holding `library.loan.override`: a one-line reason, Enter, and
  the scan is re-sent with `override_reason`. The override is audited.
- FR-5 **Return**: scan the copy alone; no member needed. The loan closes, the fine (if any) is
  computed (LIB-07) and **charged at once**; the row shows "3 days late · fine ₹6" with **Take ₹6**
  (`Alt+P`, opens the core payment drawer pre-allocated to the charge) and **Waive** (`Alt+W`, with
  `library.charge.waive`). Leaving it is "add to dues": the charge simply stays open.
- FR-6 On return, if a hold is waiting on the title (or that copy), the row says **"Keep aside for
  Rahul S. (M-0102)"** in a banner, the copy goes to `on_hold_shelf`, the hold becomes ready and the
  pickup notice is prepared (LIB-08, LIB-09). Otherwise the copy goes back to `available`.
- FR-7 **Condition at return**: `Alt+D` (or the row's ⋯) marks the copy damaged — minor, major or
  unusable — and posts the damage charge (LIB-07).
- FR-8 **Renew**: in Renew mode, scan the copy; or in Issue mode, the member panel lists the
  member's loans each with **Renew**; or **Renew all** (`Alt+A`) renews every loan that can be. A
  refused renewal says why (limit reached, someone is waiting, overdue and blocked, member blocked).
  An overdue loan renewed under `renew_overdue = charge_fine` charges the fine to that day first.
- FR-9 In Issue mode, scanning a copy that is **already on loan to the loaded member** asks
  "Already with Asha — **Return** (Enter) or **Renew** (N)?" instead of refusing; scanning a copy on
  loan to **someone else** says "Out with Rahul S., due 12 Oct" and offers **Return it first**.
- FR-10 **Cancel issue** (wrong member or wrong copy): each issued row has **Undo** while it is the
  same business day and the loan has not been renewed or returned (D20). Undo writes a `cancelled`
  event, sets the loan `cancelled`, and restores the copy (and a hold it was issued against) exactly.
- FR-11 **Finish** (`Esc`, or Enter on an empty box) clears the member and offers the **issue slip**:
  print (80 mm or A6) or a prepared WhatsApp text "Asha, you have borrowed: Wings of Fire (4513), due
  Sat 10 Oct …" (template `library_issue_slip`, C4), sent from the library's own phone (DEC-012).
- FR-12 **Backdated return** (a drop box over the weekend): the return date chip (Today / Last open
  day / Pick) is available to members holding `library.loan.adjust`; the fine is computed on that date.
- FR-13 A **session list** shows every action at this desk since the page opened, newest first,
  with its outcome; it survives a page reload for the same business day (per device, `localStorage`,
  wrapped in try/catch; server data is the truth).
- FR-14 The scan box accepts the next scan while the previous request is in flight: submissions go
  into a FIFO **queue** processed one at a time, each shown as a pending row, so a fast scanner never
  loses a book and two requests for one member never race.
- FR-15 An optional **beep** on refusal (Web Audio oscillator, no asset, no dependency), on by default,
  per device.

### 2. User flows
**Issue three books (staff, desktop, scanner).**
1. `/library/counter`, mode Issue, focus in the scan box.
2. Scan card QR → box submits `M-0043` → lookup → member panel: "Asha Kulkarni · M-0043 · Student ·
   9-B · valid till 31 Mar 2027 · 1 of 3 books · no dues".
3. Scan `4513` → `POST /library/loans` → row "Wings of Fire · 4513 · due Sat 10 Oct" ✓; panel "2 of 3".
4. Scan `4600` → row "Godaan · 4600 · due Sat 10 Oct" ✓; panel "3 of 3".
5. Scan `1024` → 409 `library_member_blocked` (`copy_limit_reached`, overridable) → beep → panel
   banner "Asha has 3 of 3 books. **Override** needs a reason." → the librarian presses `Alt+O`,
   types "Project work", Enter → re-sent with `override_reason` → row ✓ with an "Override" badge on
   the caption line.
6. `Esc` → "Finish with Asha? Print slip · WhatsApp · Done" → Enter (Done) → panel clears, focus in
   the box.

**Return with a fine and a waiting hold (staff).** Mode Return → scan `4513` → `POST
/library/returns` → row "Wings of Fire · returned by Asha K. · 3 days late · fine ₹6" + banner "Keep
aside for Rahul S. (M-0102) · pickup by Tue 20 Oct" → `Alt+P` → payment drawer "₹6 · Fine –
Wings of Fire (4513)" with Cash selected → Enter → receipt number in the row → focus back in the box.

**Renew at the desk (phone).** Mode Renew → type `4600` on the numeric keypad → Enter → "Godaan ·
renewed · now due Thu 22 Oct (renewal 1 of 2)".

**Wrong member (staff).** Issued 4513 to Asha, meant Aarti → row **Undo** → "Undo the issue of
Wings of Fire to Asha?" → Enter → row struck through "Issue undone"; copy on shelf; scan Aarti, scan
4513 again.

### 3. Features
**MVP:** the three modes; lookup; member search in the box; immediate issue; blocks and override;
return with fine, take payment, waive, add to dues; hold-ready on return; damage at return; renew
(single, from the panel, renew all); cancel issue (same day); backdated return; issue slip (print,
WhatsApp text); session list; scan queue; beep; keyboard shortcuts; change due date (from the loan
row, `library.loan.adjust`).
**Later:** camera scanning with the native `BarcodeDetector` (ADR-025, patchy support); self-issue
kiosk; RFID; auto-renewal; member photo in the panel.

### 4. Entities and relationships
```
library_membership 1─* library_loan *─1 library_copy
library_loan 1─* library_loan_event          (immutable)
library_loan 0..1─1 library_hold             (issued against a ready hold)
library_loan 1─* library_charge              (fines, lost, damage — LIB-07)
```

### 5. Database
**`library_loan`** (TenantModel)

| Column | Type | Null | Notes |
|---|---|---|---|
| `copy_id` | FK `library_copy` RESTRICT | no | |
| `membership_id` | FK `library_membership` RESTRICT | no | |
| `party_id` | FK `parties.Party` RESTRICT | no | copied from the membership at issue, never changed (money and reminders read it without a join) |
| `issued_on` | `date` | no | tenant business date |
| `issued_at` | `timestamptz` | no | |
| `due_on` | `date` | no | CHECK `due_on ≥ issued_on` |
| `returned_on` | `date` | yes | CHECK `returned_on ≥ issued_on` |
| `returned_at` | `timestamptz` | yes | |
| `status` | `varchar(10)` | no, `'open'` | CHECK in (`open`, `returned`, `lost`, `cancelled`) |
| `renew_count` | `smallint` | no, 0 | |
| `hold_id` | FK `library_hold` SET NULL | yes | |
| `rule_snapshot` | typed columns: `loan_days smallint`, `fine_per_day money`, `fine_cap money null`, `grace_days smallint`, `max_renewals smallint` | no | the resolved rule at issue, so a later rule change never rewrites a fine |
| `override_reason` | `varchar(160)` | `''` | |
| `lost_on` | `date` | yes | |
| `version` | `integer` | 1 | |

Constraints: `uq_library_loan_open_copy UNIQUE (copy_id) WHERE status = 'open'` — one open loan per
copy, the database's answer to two desks issuing one book (research §13 EC-11);
`ck_library_loan_returned CHECK (status <> 'returned' OR returned_on IS NOT NULL)` and
`ck_library_loan_open CHECK (status <> 'open' OR returned_on IS NULL)` (a lost-then-found loan is
`returned` with both `lost_on` and `returned_on`).
Indexes: `ix_library_loan_overdue (tenant_id, status, due_on)` — the overdue list and reminders;
`(tenant_id, membership_id, status)`; `(tenant_id, issued_on)` — circulation register and issued today;
`ix_library_loan_returned (tenant_id, returned_on) WHERE status = 'returned'` — returned today;
`(copy_id, issued_on DESC)` — copy history.

**`library_loan_event`** (TenantModel + ImmutableModel)

| Column | Type | Notes |
|---|---|---|
| `loan_id` | FK RESTRICT | |
| `kind` | `varchar(16)` | `issued`, `renewed`, `due_changed`, `returned`, `lost`, `found`, `cancelled`, `overridden`, `imported` |
| `from_due` / `to_due` | `date` null | renewals and changes |
| `on_date` | `date` | |
| `reason` | `varchar(160)` | |
| `charge_id` | FK `library_charge` null | the fine this event charged |
| `blocks_overridden` | `varchar(32)[]` | codes, for `overridden` |

Index `(loan_id, created_at)`.

### 6. API
| Method and path | Codename | Request → response | Errors |
|---|---|---|---|
| `GET /library/lookup?code=` | `library.catalogue.read` | LIB-02 | |
| `GET /library/members/{id}/summary` | `library.loan.read` | → `MemberSummary` + `loans: [LoanRow]` (open, oldest due first) | 404 |
| `POST /library/loans` | `library.loan.write` (+ `library.loan.override` when `override_reason` is sent) | `{membership_id, code \| copy_id, hold_id?, override_reason?}` + `Idempotency-Key` → 201 `{data: LoanRow, meta: {member: MemberSummary, warnings: [{code: "expires_before_due", valid_until}], due_moved_from?}}` | 409 `library_membership_inactive` (`details.effective_status`), 409 `library_member_blocked` (`details.blocks: [Block]`, `override_permission: "library.loan.override"`), 409 `library_copy_unavailable` (`details.status`, `with?: {name, member_number, due_on}`, `held_for?: {name, member_number}`), 409 `library_copy_not_loanable` (`details.material_type`, `overridable`), 403 `permission_denied` (override without the codename), 404 (code unknown) |
| `POST /library/returns` | `library.loan.write` (+ `library.loan.adjust` when `returned_on < today`) | `{code \| copy_id, returned_on?, damage?: {level: "minor"\|"major"\|"unusable", note}}` + `Idempotency-Key` → 200 `{data: LoanRow, meta: {fine: FineCalc \| null, charges: [ChargeRow], hold_ready: HoldRow \| null, copy_status, member: MemberSummary}}` | 409 `library_copy_not_on_loan` (`details.status`, `offer_found: bool`), 400 (`returned_on` in future or before issue) |
| `POST /library/loans/{id}/renew` | `library.loan.write` (+ override) | `{override_reason?}` → 200 `{data: LoanRow, meta: {fine_charge?: ChargeRow, member}}` | 409 `library_renewal_refused` (`details.reason`: `max_renewals` \| `hold_waiting` \| `overdue_blocked` \| `member_blocked` \| `no_gain`, `overridable`) |
| `POST /library/members/{id}/renew-all` | `library.loan.write` | → `{renewed: [LoanRow], refused: [{loan_id, reason}]}` | |
| `POST /library/loans/{id}/cancel` | `library.loan.write` | `{reason}` → 200 | 409 `library_cancel_window_passed` (`details.issued_on`) |
| `POST /library/loans/{id}/change-due` | `library.loan.adjust` | `{due_on, reason}` | 400 (closed day → moved and warned, before issue → error) |
| `GET /library/loans` | `library.loan.read` | `?status=open\|overdue\|returned\|lost\|cancelled&due_from&due_to&issued_from&issued_to&group&membership&copy&issued_by&ordering=due_on\|-issued_on&page` → `[LoanRow]` | |
| `GET /library/loans/{id}` | `library.loan.read` | → `LoanRow + {events, charges}` | |
| `POST /library/members/{id}/slip` | `library.loan.write` | `{loan_ids}` → `{text, wa_url, sms_url}` (composes, records nothing) | |

`LoanRow = {id, copy: {id, accession_number, title, authors}, membership: {id, member_number, name,
group_label}, issued_on, due_on, returned_on, status, renew_count, max_renewals, days_overdue,
fine_so_far, hold_ready_for_other: bool, version}`. `FineCalc` is LIB-07 §6.

New error codes (409): `library_membership_inactive`, `library_member_blocked`,
`library_copy_not_loanable`, `library_copy_not_on_loan`, `library_renewal_refused`,
`library_cancel_window_passed`, `library_calendar_all_closed`.

### 7. Frontend
- Route `app/(app)/library/counter/page.tsx` → `CounterPageContent`. Not `dynamic()`: it is the
  screen, and its first paint is the scan box. The payment drawer, waive dialog, damage dialog,
  override prompt and slip dialog **are** `dynamic()` (a form belongs in the chunk that opens it,
  CLAUDE.md), preloaded on idle after first paint so `Alt+P` never waits on a chunk.
- Components: `CounterScanBox` (the one input; `UbTextInput` with `inputMode` toggled by a
  "123 / ABC" chip remembered per device), `CounterModeChips` (`UbChipTabs`), `MemberPanel` (shared
  with LIB-04), `MemberSearchResults`, `CounterSessionList`, `CounterRow` (issued / returned /
  renewed / refused / pending / undone), `OverridePrompt`, `HoldReadyBanner`, `FinishDialog`,
  `ShortcutsSheet` (`?`).
- Hooks: `useCounterFocus` — returns focus to the scan box after every action, on dialog close
  (`onCloseAutoFocus`), after a snackbar action, and on window focus; the dialog's own initial focus
  is set by the dialog hook, never by `autoFocus` (CLAUDE.md, LED-01: `MLDialog` overrides it).
  `useCounterShortcuts` — `keydown` on the document with `event.code`. `useScannerListener`
  (`src/hooks/useScannerListener.ts`) catches a scan burst when focus has drifted off the input and
  routes it into the queue.
- Slice `redux/libraryCounterSlice.ts` (lazy): `{mode, member: MemberSummary | null, memberLoans,
  queue: [{key, code, kind, status: 'pending'|'done'|'failed', result?, error?}], session: CounterRow[],
  prompt: {kind: 'override'|'already_with_member'|'finish', payload} | null, returnDate:
  'today'|'last_open'|date}`. Thunks in `redux/libraryCounterThunk.ts`: `lookupCode`,
  `issueCopy`, `returnCopy`, `renewLoan`, `renewAll`, `cancelLoan`, `processCounterQueue` (drains
  one item at a time; each carries its own idempotency key, reused on retry).
- Service `api/libraryCirculationService.ts`: `lookup`, `memberSummary`, `issue`, `returnCopy`,
  `renew`, `renewAll`, `cancel`, `changeDue`, `listLoans`, `getLoan`, `slip`.
- Invalidation: issue/return/renew/cancel invalidate `libraryMemberDetail`, `libraryLoanList`,
  `libraryTitleDetail`, `libraryHome`, and — for returns with a fine — `partyDetail` (refetch).

### 8. UI/UX
**Desktop (≥ 1024 px).** Two columns. Left (≈ 60 %): the mode chips with their shortcut hints, the
scan box full width (`ds-h3` text size, placeholder "Scan or type a book or member number"), then the
session list. Right (≈ 40 %, sticky): the member panel — name (owns its line, wraps), caption
"M-0043 · Student · 9-B", status badge, four figures in a 2×2 grid (Books 2 of 3 · Overdue 0 · Dues
₹0 · Deposit ₹500), a block banner when blocked, the member's open loans with due dates and
**Renew**, holds ready. Keyboard hints in `ds-caption` under the box: "Enter to submit · Esc to
finish · Alt+I/R/N to switch · ? for shortcuts".

**Phone (360 px).** One column: mode chips and the scan box pinned at the top (the keypad must not
cover them: the page scrolls under a sticky header); the member panel collapses to one card
("Asha Kulkarni · 2 of 3 · owes ₹0", tap to expand); session rows are cards; row actions (Take ₹6,
Waive, Undo) sit on the card's second line, never in its trailing slot (the "Delet" finding in
CLAUDE.md), and at most two per row, the rest behind ⋯.

**Rows.** Title owns its line (`line-clamp-2`); caption "4513 · due Sat 10 Oct"; badges (Override,
Late, Kept aside, Damaged, Undone) on the caption line; the amount of a fine as `UbAmount`.

**States.**
| State | What the librarian sees |
|---|---|
| Initial (no member) | Issue mode: "Scan a member card or type a name." Return mode: "Scan a book to take it back." |
| Pending | A row with a spinner "4513 …"; the box stays enabled |
| Success | Row with ✓ and the result; the member panel updates from `meta.member` (no refetch) |
| Refused, overridable | Beep; red row "Not issued: 3 of 3 books"; panel banner with **Override** |
| Refused, final | Beep; red row with the way forward ("Membership expired on 31 Mar · Renew") |
| Unknown code | Row "No book or member with 4S13" (the typed text echoed in `ds-mono`) |
| Network failure | Amber row "Not sent · Retry" with the same idempotency key; the queue pauses until Retry or Skip |
| Module off / no permission | The route is not in the nav; a direct visit shows the ordinary 403 page |

**Words (en / hi).** `library.counter.title` "Counter" / "काउंटर"; `library.counter.issue` "Issue" /
"जारी करें"; `.return` "Return" / "वापसी"; `.renew` "Renew" / "अवधि बढ़ाएँ"; `.scanHint` "Scan or type a
book or member number" / "किताब या सदस्य नंबर स्कैन करें या लिखें"; `.dueOn` "due {date}" / "{date} तक
लौटाएँ"; `.late` "{days} days late · fine {amount}" / "{days} दिन देर · जुर्माना {amount}";
`.keepAside` "Keep aside for {name}" / "{name} के लिए अलग रखें"; `.override` "Override" / "फिर भी जारी
करें"; `.undo` "Undo" / "वापस लें".

Accessibility: results announced through an `aria-live="polite"` region ("Issued Wings of Fire, due
10 October"); refusals through `assertive`; the beep is never the only signal.

### 9. Validation and business rules
- BR-1 **Issue** runs, under the lock order (party → membership → copy): resolve the copy; check the
  copy state (`available`, or `on_hold_shelf` with a ready hold for **this** member → the hold is
  collected); resolve the rule (LIB-05); compute blocks (LIB-04 BR-10) plus copy blocks
  (`not_loanable`); if any non-overridable block → 409; if overridable blocks and no
  `override_reason` → 409 `library_member_blocked`; else insert the loan with `rule_snapshot`,
  set the copy `on_loan` (event), set `issued_ever`, move title caches, write `issued` (and
  `overridden`) events, audit `library.loan.issued` (+ `library.loan.overridden`).
- BR-2 **Return**: find the open loan of the copy (none → 409 `library_copy_not_on_loan`, and
  `offer_found = true` when the copy is `lost` or `missing`, which the client turns into **Mark found**,
  LIB-07); lock party → membership → copy → loan; `returned_on` = today or the chosen date (≤ today,
  ≥ `issued_on`); compute the fine with `rule_snapshot` (LIB-07); charge it if > 0; post the damage
  charge if given; route the copy: a waiting hold → `on_hold_shelf` + hold ready; minor damage →
  `available`; major → `in_repair`; unusable → lost handling (LIB-07 BR-8); else `available`;
  `last_seen_on = returned_on`; audit `library.loan.returned`.
- BR-3 **Renew**: open loan; `renew_count < max_renewals` (snapshot); no **waiting** hold on the
  title that no other available copy could serve (copy-specific holds on this copy always refuse);
  member not blocked except overridable blocks with a reason; an overdue loan past grace:
  `renew_overdue = block` → refused, `charge_fine` → the fine to today is charged, then renewed.
  New due per LIB-05 BR-4. Event `renewed` with from/to; audit.
- BR-4 **Cancel issue**: `issued_on = today`, status `open`, `renew_count = 0`; restores the copy to
  its previous status (`available`, or `on_hold_shelf` and the hold back to `ready` if the loan
  collected a hold); no money is involved, because an issue posts none.
- BR-5 **Idempotency**: every POST carries a key generated per queue item; a replay returns the
  first response (`Idempotent-Replayed: true`), so a retried scan never issues twice.
- BR-6 **Concurrency**: two desks returning and issuing one copy serialise on the copy row lock; the
  `uq_library_loan_open_copy` index refuses a second open loan from any writer.
- BR-7 The member search in the box starts at 2 characters, debounced 200 ms, and matches name,
  mobile (last 4+ digits), member number prefix, group label; it never fires for a code-shaped
  string submitted with Enter (that is a lookup).
- BR-8 The counter never pre-judges a block from data it holds: the server decides, the panel only
  shows what the last response said (the PTY-04 rule, CLAUDE.md).

### 10. Permissions
| Action | Codename / role | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Open the counter; issue, return (today), renew, cancel issue, slip | `library.loan.write` | ✅ | ✅ | ✅ | ❌ |
| Override an overridable block | `library.loan.override` (delegable) | ✅ | ✅ | ❌ (grantable) | ❌ |
| Backdate a return, change a due date | `library.loan.adjust` | ✅ | ✅ | ❌ (grantable) | ❌ |
| Take a fine payment | `payments.payment.write` | ✅ | ✅ | ✅ | ❌ |
| Waive a fine | `library.charge.waive` (delegable) + ceiling role check (LIB-07) | ✅ | ✅ | ❌ (grantable) | ❌ |
| View loans | `library.loan.read` | ✅ | ✅ | ✅ | ✅ |

### 11. Reports
Every issue, return, renewal, override and cancel feeds the circulation register (LIB-12); overrides
are listed in the audit log with their reasons; the dashboard's "today" figures are these events.

### 12. Testing
- T-LIB-06-1 (unit) every block code, overridable and not, from fixtures; override without the
  codename → 403; with it → 201 and an `overridden` event with the block codes.
- T-LIB-06-2 (unit) issue against a ready hold for this member collects it; for another member → 409
  `library_copy_unavailable` with `held_for`.
- T-LIB-06-3 (concurrency) two threads issuing one copy: exactly one 201, one 409; the database
  holds one open loan.
- T-LIB-06-4 (unit) return routes: hold waiting → `on_hold_shelf`; minor damage → available; major →
  `in_repair`; unusable → lost path; plain → available; `last_seen_on` set.
- T-LIB-06-5 (unit) renew refused for each reason; overdue renew with `charge_fine` posts one fine
  charge dated the renewal day and the loan's new due date is from the renewal day.
- T-LIB-06-6 (unit) cancel issue restores copy and hold exactly; next day → 409
  `library_cancel_window_passed`.
- T-LIB-06-7 (API) idempotent replay of an issue returns the same loan; a different body with the
  same key → 409 `idempotency_conflict`.
- T-LIB-06-8 (performance) issue and return each ≤ 12 queries (`django_assert_max_num_queries`);
  `EXPLAIN` of the overdue list uses `ix_library_loan_overdue`.
- T-LIB-06-9 (component) the scan box keeps focus after an issue, after the override prompt closes,
  after the payment drawer closes, and after a refusal; a burst of five keystroke sequences ending in
  Enter produces five queued requests in order.
- T-LIB-06-10 (component) the counter opens with no error text and no red state (the LED-01 "opened
  in a red state" defect).
- E2E `07-counter` — the heart of `e2e/library.mjs`, against the live stack:
  1. **Wedge scan simulated by the keyboard**: `page.keyboard.type('M-0043', {delay: 5})` + Enter,
     then `4513` + Enter ×3 copies within 300 ms; assert three `POST /library/loans` on the **network**
     in order, three rows, the panel "3 of 3".
  2. Limit block, override as owner with a reason; a staff context (its own browser context,
     asserting who is signed in first) sees no Override.
  3. Return with a fine: `POST /library/returns` response carries `fine.amount = "6.00"`; Take ₹6
     records a payment allocated to the charge (`payments_allocation.document_type =
     library_charge`); the member's dues return to ₹0.
  4. Return with a waiting hold: the banner names the holder; the copy status is `on_hold_shelf`.
  5. Undo an issue; the copy is on the shelf.
  6. **Focus**: after each of the above, `document.activeElement` is the scan box.
  7. Two tabs issue one copy at once: one succeeds, one shows "Out with …".
  Shots (`--shots`, `/tmp/e2e-shots/library/counter`): empty; member loaded; after three issues;
  overridable refusal with the prompt; final refusal (expired); return with fine and hold banner;
  renew refused (hold waiting); finish dialog; phone with the keypad-mode chip — at four widths, each
  with both measuring checks (page `scrollWidth`, every leaf text node inside its box).

### 13. Edge cases
- EC-1 A copy scanned in Return mode that is not on loan: the row shows its status; `lost` or
  `missing` offers **Mark found** (LIB-07); `available` says "Already on the shelf" and records
  `last_seen_on`.
- EC-2 A copy returned by someone other than the borrower: return by copy closes the right loan and
  the row says whose it was (research §13 EC-4).
- EC-3 A scan arrives while the override prompt is open: it is queued, not typed into the reason
  field (the prompt's input ignores bursts faster than 50 ms per key — the `useScannerListener`
  timing — and hands them to the queue).
- EC-4 The loaded member's membership expires at midnight while the page is open: the next issue is
  refused by the server with `library_membership_inactive`; the panel updates from the error body.
- EC-5 Staff renew a book due today on a Saturday before a Sunday closure: new due date from today,
  moved off closed days.
- EC-6 A return backdated to before the last renewal: refused 400 ("The book was renewed on 8 Oct;
  the return cannot be earlier.").
- EC-7 A code that is both an ISBN and an accession number (a library that uses ISBNs as numbers):
  the accession match wins (LIB-02 BR-8).
- EC-8 The printer is offline: the slip dialog offers WhatsApp or Done; nothing waits on the print.
- EC-9 Two members share one family card number: impossible (member numbers are unique); family
  memberships are later.

### 14. Future
Camera scanning (native `BarcodeDetector` as progressive enhancement, ADR); self-issue kiosk; RFID
gates; auto-renewal the night before due when nobody is waiting; hourly reference loans; issue to a
class in bulk (a teacher takes 40 textbooks).

---

## LIB-07 — Fines, waivers, lost and damaged items

### 1. Product requirements
Every rupee a member owes the library is a charge on their khata that the library can explain line
by line, and every rupee forgiven is a waiver with a reason and a name. The library keeps no balance
arithmetic of its own (vision §3): charges post to the ledger, payments settle them, deposits are
applied only by an explicit act. Measured by: Σ open `library_charge.amount_due` for a member equals
the library part of their khata (T-LIB-07-9); zero edited or deleted charges (immutability).

- FR-1 A **fine** is calculated when the copy comes back (or is renewed while overdue, or declared
  lost), with grace and a cap, and is **charged at that moment** as one `library_charge` of kind
  `overdue_fine`. It is never accrued nightly: the member panel and the overdue list show a live
  "fine so far" that is computed, not stored (research §6.3).
- FR-2 **Grace waives, it does not shift** (D5). **Closed days are skipped** when counting days
  late (D4). The fine is **capped** by the rule's cap and never exceeds the copy's price (D24),
  across every fine on the same loan.
- FR-3 A **waiver** reduces what a charge still owes, by an amount ≤ `amount_due`, with a reason
  (≥ 3 chars), by a member holding `library.charge.waive`; above the **waiver ceiling** (D27) only an
  owner or admin may waive (a role check, not a codename). A waiver is a `library_waiver` row posting
  one `ADJUSTMENT_CREDIT`; the charge is never edited.
- FR-4 **Declare lost** (from the loan row or the member page, `library.loan.adjust`): charges the
  fine to the declared day, then a `lost_book` charge = price × `lost_multiplier` +
  `lost_processing_fee` (D6); the copy becomes `lost`, the loan `lost`; fine accrual stops.
- FR-5 **Replacement**: the member brings the same title instead of paying: the lost charge's
  remaining due is waived with kind `replaced`, the new book is added as a new copy with a new
  accession number (source note "Replacement for 4513 by M-0043"), and the lost copy is withdrawn
  with reason `lost`. The fine stays.
- FR-6 **Found**: a lost copy comes back (scanned at return, or **Mark found** on the copy): the
  unpaid part of the lost charge is waived with kind `found`; the paid part is **refunded**
  (`lost_found_paid = refund`, D6) — a `found_refund` waiver plus a payment OUT of that amount — or
  kept (`keep`); the fine stays; the copy returns to `available` (or to a waiting hold).
- FR-7 **Damage** at return: minor (fixed `damage_minor_amount`), major (`damage_major_percent` of
  the price), unusable (treated as lost: a `lost_book` charge, the copy withdrawn with reason
  `damaged`). The librarian may edit the proposed amount **down** before confirming; up needs
  `library.charge.write`.
- FR-8 **Manual charges** (kinds `processing`, `other`: a lost card, a late membership form), with
  `library.charge.write`.
- FR-9 **Reverse a charge raised in error** (a wrong return date, a fee charged twice):
  `library.charge.write`, a reason, allowed only while nothing has been paid against it (void the
  payment first); it reverses the charge's ledger line and the lines of its standing waivers with
  `reverse_source_entries` (LED-03 reversal pairs).
- FR-10 **Collect**: any open charge can be paid through the core payment drawer, pre-allocated to
  it (target `library_charge`); several charges at once from the member page (**Collect ₹X**,
  oldest first); or from the member's deposit (LIB-04 `deposit/apply`).
- FR-11 The khata row of a charge reads "FIN/26-27/0012 · Overdue fine – Wings of Fire (4513),
  3 days" (source resolver) and links to the member page.

### 2. User flows
**Waive at the counter (admin).** Return → row "3 days late · fine ₹6" → `Alt+W` → dialog "Waive
₹6 fine for Asha K.?" amount prefilled ₹6, reason chips (First time, Illness, Library closed,
Other) → Enter → the row reads "Fine ₹6 · waived"; the member's dues are ₹0; the khata shows the
charge and the waiver.

**Declare lost (admin).** Member page → Books → Wings of Fire (due 10 Oct) → ⋯ → **Mark lost** →
dialog: "Lost on 17 Oct. Fine to that day ₹12 (6 days × ₹2). Book price ₹250 × 1 + processing ₹0 =
₹250. Total ₹262." (price editable when missing) → **Mark lost** → two charges; copy lost → **Take
payment** or **Close**.

**Found after payment (staff at the counter).** Mode Return → scan 4513 → 409
`library_copy_not_on_loan` with `offer_found` → row "4513 is marked lost · **Mark found**" → Enter
→ "Asha paid ₹250 for this book. Refund ₹250?" (refund needs no ceiling check: it returns what was
paid for this very charge; the payment OUT needs `payments.payment.write`) → mode Cash → confirm →
waiver `found_refund` ₹250 + payment OUT ₹250 → copy on the shelf (or kept aside for a hold).

### 3. Features
**MVP:** fine at return, renewal and lost; grace; skip closed days; cap by rule and price; rounding;
waivers with ceiling; lost with multiplier and processing fee; replacement; found with refund or keep;
damage three levels; manual charges; reverse in error; collect (single, several, from deposit);
source resolver; allocation target; charge numbers.
**Later:** age-based depreciation of the lost price (Central Secretariat Library's surcharge by age,
research §0); "same title or three times the cost" choice per type; recurring plan dues (dues engine);
GST on library services through the document port (D3); a member-facing fine statement page.

### 4. Entities and relationships
```
library_membership 1─* library_charge *─0..1 library_loan
                                 │  └─0..1 library_copy
                                 ├─* library_waiver                 (each posts ADJUSTMENT_CREDIT)
                                 ├─1 ledger_entry (source_type = library_charge, entry_type = charge)
                                 └─* payments_allocation (document_type = library_charge)
```

### 5. Database
**`library_charge`** (TenantModel)

| Column | Type | Null / default | Notes |
|---|---|---|---|
| `membership_id` | FK RESTRICT | no | |
| `party_id` | FK `parties.Party` RESTRICT | no | the ledger party (the member) |
| `number` | `varchar(32)` | no | `FIN/26-27/0012` from `allocate_number(kind="library_charge")`, locked last |
| `kind` | `varchar(16)` | no | CHECK in (`admission_fee`, `membership_fee`, `renewal_fee`, `overdue_fine`, `lost_book`, `damage`, `processing`, `other`) |
| `amount` | `MoneyField` | no | CHECK > 0 |
| `charge_date` | `date` | no | business date; the ledger `entry_date` |
| `loan_id` | FK `library_loan` RESTRICT | yes | circulation charges |
| `copy_id` | FK `library_copy` RESTRICT | yes | |
| `description` | `varchar(160)` | no | "Overdue fine – Wings of Fire (4513), 3 days"; the ledger note and the receipt label (C5) |
| `fine_days` | `smallint` | yes | days counted (after grace test) |
| `fine_rate` | `MoneyField` | yes | |
| `amount_paid` | `MoneyField` | 0 | cache, moved only by the allocation target |
| `waived_amount` | `MoneyField` | 0 | cache, moved only by the waiver service (kinds `waiver`, `found`, `replaced`) |
| `refunded_amount` | `MoneyField` | 0 | cache (kind `found_refund`) |
| `amount_due` | `MoneyField` | no | `amount − amount_paid − waived_amount` |
| `status` | `varchar(10)` | `'open'` | CHECK in (`open`, `part_paid`, `paid`, `waived`, `refunded`, `reversed`); derived, never toggled |
| `ledger_entry_id` | `uuid` | no | the posted line |
| `reversed_at` / `reversed_reason` | `timestamptz` / `varchar(160)` | null / `''` | |

CHECKs: `amount_due = amount − amount_paid − waived_amount`; `amount_due ≥ 0`;
`amount_paid ≥ 0`, `waived_amount ≥ 0`, `refunded_amount ≤ amount_paid`.
Unique `(tenant_id, number)`. Indexes: `ix_library_charge_fifo (tenant_id, party_id, charge_date,
number, id) WHERE amount_due > 0 AND reversed_at IS NULL` (the target's lock order,
`targets/__init__.py:15-19`); `(tenant_id, membership_id, status)`; `(tenant_id, kind,
charge_date)`; `(loan_id)`.

**`library_waiver`** (TenantModel; append-only except `reversed_at`)

| Column | Type | Notes |
|---|---|---|
| `charge_id` | FK `library_charge` RESTRICT | |
| `party_id` | FK `parties.Party` RESTRICT | |
| `kind` | `varchar(12)` | CHECK in (`waiver`, `found`, `replaced`, `found_refund`) |
| `amount` | `MoneyField` | CHECK > 0 |
| `reason` | `varchar(160)` | required for `waiver` |
| `on_date` | `date` | |
| `ledger_entry_id` | `uuid` | the `adjustment_credit` line |
| `refund_payment_id` | `uuid` null | the payment OUT for `found_refund` |
| `reversed_at` | `timestamptz` null | set when the charge is reversed |

Index `(charge_id)`, `(tenant_id, kind, on_date)`.

**Registrations** (`apps/library/apps.py` `ready()`):
- `register_posting_source("library_charge", module="library", entry_types={"charge": "debit"},
  buckets={"main"})` and `register_posting_source("library_waiver", module="library",
  entry_types={"adjustment_credit": "credit"}, buckets={"main"})` — 11-contracts §1.2.
- `register_target(LibraryChargeTarget())` — `document_type = "library_charge"`, `direction = "in"`,
  `bucket = "main"`, `auto = True`; `lock` in `(charge_date, number, id)`; `apply`/`unapply` move
  `amount_paid` and re-derive `amount_due` and `status` with the one formula below;
  `summary()` adds `label = description` (C5); `audit_action() = "library.charge.status_changed"`.
- `register_source_resolver("library_charge", …)` and `("library_waiver", …)` — the khata names the
  number and description and links to `/library/members/{membership_id}`.

### 6. API
| Method and path | Codename / role | Request → response | Errors |
|---|---|---|---|
| `GET /library/charges` | `library.member.read` | `?membership&party&kind&status=open\|paid\|waived\|refunded\|reversed&from&to&ordering=-charge_date&page` → `[ChargeRow]`, `meta.totals {amount, paid, waived, due}` | |
| `GET /library/charges/{id}` | `library.member.read` | → `ChargeRow + {waivers, allocations: [{payment_id, number, amount, payment_date}], ledger_entry_id}` | |
| `POST /library/charges` | `library.charge.write` | `{membership_id, kind: "processing"\|"other", amount, description, charge_date?}` + key → 201 | 400 |
| `POST /library/charges/{id}/waive` | `library.charge.waive` (+ owner/admin above the ceiling) | `{amount, reason}` → 200 `{data: ChargeRow, meta: {waiver, member}}` | 409 `library_charge_not_open` (`details.status`), 400 (`amount` > due), 403 `library_waiver_over_ceiling` (`details.ceiling`) |
| `POST /library/charges/{id}/reverse` | `library.charge.write` | `{reason}` | 409 `library_charge_has_payments` (`details.payment_ids`) |
| `POST /library/loans/{id}/lost` | `library.loan.adjust` | `{declared_on?, price?, reason?}` → 200 `{data: LoanRow, meta: {fine: FineCalc, charges: [ChargeRow]}}` | 409 `library_loan_not_open`, 400 (`price` required when the copy has none and no fallback) |
| `POST /library/copies/{id}/found` | `library.loan.write` (+ `payments.payment.write` for a refund) | `{refund?: PaymentBlock}` → 200 `{data: CopyRow, meta: {waivers, refund_payment?, hold_ready?}}` | 409 `library_copy_unavailable` (not lost or missing) |
| `POST /library/loans/{id}/replace` | `library.loan.adjust` + `library.catalogue.write` | `{new_copy: {accession_number?, location_id?, price?}}` → 200 | |
| `GET /library/loans/{id}/fine-preview?on=` | `library.loan.read` | → `FineCalc` | |

`FineCalc = {due_on, returned_on, calendar_days, closed_days_skipped, days_late, grace_days,
within_grace: bool, rate, raw_amount, rounded_amount, cap: {amount, source: "rule"\|"price"\|
"fallback_price"\|null}, already_charged_on_loan, amount}` — the client shows the calculation, never
recomputes it.

Payments use the core endpoints: `POST /payments` with `allocations: [{document_type:
"library_charge", document_id, amount}]` (`payments.payment.write`). New error codes:
`library_charge_not_open` (409), `library_charge_has_payments` (409), `library_waiver_over_ceiling`
(403), `library_loan_not_open` (409).

### 7. Frontend
- Components: `ChargeList` (member page tab), `WaiveChargeDialog` (`dynamic()`, `UbReasonDialog`
  with amount), `MarkLostDialog` (`dynamic()`, shows the `FineCalc` and the lost total), `FoundDialog`,
  `DamageDialog`, `ManualChargeDrawer`, `ReverseChargeDialog`, `FineBreakdown` (renders `FineCalc`:
  "Due Sat 10 Oct · returned Wed 14 Oct · 4 days, Sunday not counted → 3 days late · grace 2 days
  passed · 3 × ₹2 = ₹6").
- Collect uses payments' `PaymentFormDrawer` (allowed import) opened with a preset allocation list.
- Service `api/libraryChargeService.ts`: `listCharges`, `getCharge`, `createCharge`, `waive`,
  `reverse`, `markLost`, `markFound`, `replace`, `finePreview`.
- Slice: charges live in `libraryMemberDetailSlice.charges` (no new store key); the counter keeps its
  own rows.
- Invalidation: every charge write invalidates `libraryMemberDetail`, `libraryHome`, `partyDetail`
  (refetch), `paymentList` after a refund.

### 8. UI/UX
- Charges tab: rows "Overdue fine – Wings of Fire (4513)" (title owns its line), caption
  "FIN/26-27/0012 · 14 Oct · 3 days", right `UbAmount` of `amount_due` with a status badge on the
  caption line (Open, Part paid, Paid, Waived, Refunded, Reversed); a paid charge shows its receipt
  number; totals row "Owes ₹46 · paid ₹210 · waived ₹6".
- Every dialog that posts money states the consequence before confirming ("Asha will owe ₹262 more",
  "Asha's dues drop to ₹0") — Part 17.0.3's rule for financial state changes.
- Waiver ceiling refusal for a staff member with the codename: inline "Waivers above ₹100 need the
  owner or an admin." — not a snackbar, so the dialog stays with its reason typed.
- Copy (en / hi): `library.fine` "Fine" / "जुर्माना"; `library.fine.graceWaived` "Within the {days}-day
  grace · no fine" / "{days} दिन की छूट में · कोई जुर्माना नहीं"; `library.charge.waive` "Waive" /
  "माफ़ करें"; `library.charge.lost` "Lost book" / "खोई किताब"; `library.charge.found` "Found — the
  unpaid part is cancelled" / "मिल गई — बाकी रकम रद्द".

### 9. Validation and business rules
**The fine** (`apps/library/services/fines.py`, pure, tested without a database):
```
fine(loan, returned_on):
  if returned_on ≤ due_on:                                  return 0
  calendar_days = returned_on − due_on
  skipped = |closed_days_between(due_on + 1, returned_on, module="library")|  if fine_skip_closed_days else 0
  days_late = calendar_days − skipped
  if days_late ≤ grace_days:                                return 0          # grace waives (D5)
  raw = days_late × fine_per_day                                               # counts from the due date
  rounded = round_amount(raw, fine_rounding)                                   # rupee half-up (D19)
  cap = min(x for x in (rule.fine_cap, copy.price ?? fallback_price) if x is not None)  or None
  room = cap − Σ(fines already charged on this loan)   if cap is not None else ∞
  return max(0, min(rounded, room))
```
All inputs come from the loan's `rule_snapshot` and the copy; amounts are `Decimal`.

**Worked examples.** Rule: ₹2 a day, grace 2 days, cap ₹100, copy price ₹250, library closed on
Sundays; Diwali 8–10 Nov 2026 closed (research §6.3, extended).

| # | Due | Returned | Setting | Calculation | Fine |
|---|---|---|---|---|---|
| 1 | Sat 10 Oct 2026 | Mon 12 Oct | count all days | 2 days ≤ grace 2 | **₹0** |
| 2 | Sat 10 Oct | Tue 13 Oct | count all days | 3 days, grace passed → 3 × ₹2 from the due date | **₹6** |
| 3 | Sat 10 Oct | Tue 13 Oct | skip closed days (default) | Sun 11 skipped → 2 days ≤ grace | **₹0** |
| 4 | Sat 10 Oct | Wed 14 Oct | skip closed days | Sun skipped → 3 × ₹2 | **₹6** |
| 5 | Sat 10 Oct | Wed 9 Dec | count all days | 60 × ₹2 = ₹120; cap ₹100 | **₹100** |
| 6 | Sat 10 Oct, 3 copies | Tue 13 Oct | count all days | ₹6 per copy, one charge per copy | **₹18** (3 charges) |
| 7 | Sat 10 Oct | lost on Sat 17 Oct | count all days | 7 × ₹2 = ₹14; plus lost ₹250 × 1 + ₹0 | **₹14 + ₹250** |
| 7a | Sat 10 Oct | lost on Sat 17 Oct | skip closed days | 7 days − Sun 11 = 6 × ₹2 = ₹12; plus ₹250 | **₹12 + ₹250** |
| 8 | Sat 10 Oct, price ₹80, **no** rule cap | Wed 9 Dec | count all days | ₹120; cap = price ₹80 | **₹80** |
| 9 | Sat 10 Oct, ₹0.50 a day, grace 0 | Thu 15 Oct | count all, rupee rounding | 5 × ₹0.50 = ₹2.50 → half-up | **₹3** (₹2.50 with paise) |
| 10 | Sat 10 Oct, renewed Wed 14 Oct (overdue), new due Wed 28 Oct | Sat 31 Oct | skip closed days | at renewal: 3 days → ₹6 charged; at return: Thu–Sat 3 days → ₹6 | **₹6 + ₹6** (two charges) |
| 11 | Fri 6 Nov | Thu 12 Nov | skip closed days | 6 calendar days; 8 (Sun and Diwali, counted once), 9, 10 closed → 3 days late | **₹6** (₹12 counting all days) |
| 12 | a loan already charged ₹6 at a renewal, cap ₹100 | returned 60 days after its new due date | count all days | ₹120 raw; room = ₹100 − ₹6 | **₹94** |

(A due date cannot be a Sunday: LIB-05 moves it. A book due on Sunday 11 Oct is due Monday 12 Oct.)

**Other rules.**
- BR-1 One `library_charge` per postable fact: each fine, each fee, each lost or damage charge is its
  own row and its own ledger source, so a reversal reverses exactly one fact (11-contracts §1.2 rule 2).
- BR-2 Posting: `post_source_entry(ctx, party, amount, entry_date=charge_date, entry_type="charge",
  source_type="library_charge", source_id=charge.id, source_number=charge.number,
  note=description, bucket="main")` inside the caller's transaction, after the party lock. A waiver
  posts `entry_type="adjustment_credit"`, `source_type="library_waiver"`.
- BR-3 Days late use the calendar **as it is on the return day** (a holiday added after issue is
  skipped too — research §13 EC-7).
- BR-4 Status derivation (one function, used by the target and the waiver service): `reversed` if
  `reversed_at`; else if `amount_due > 0`: `part_paid` when `amount_paid > 0`, else `open`; else
  (`amount_due = 0`): `refunded` when `refunded_amount > 0`, `waived` when `waived_amount = amount`,
  else `paid`.
- BR-5 Waiver: `0.01 ≤ amount ≤ amount_due`; `kind = waiver` needs `library.charge.waive`; if
  `amount > waiver_ceiling` (when set) the actor's role must be owner or admin (role check, not
  delegable, 10-architecture §5); reason ≥ 3 chars. Locks party → charge.
- BR-6 Lost charge: `base = copy.price ?? fallback_price ?? typed price` (required if all absent);
  `amount = round_amount(base × lost_multiplier, "paise") + lost_processing_fee`; description "Lost
  book – {title} ({accession})". The loan's fine to the declared day is charged first (its own row).
- BR-7 A lost loan counts toward `max_copies` while its `lost_book` charge has `amount_due > 0`
  (D18).
- BR-8 Unusable damage = BR-6's charge with description "Damaged beyond use – …"; the loan is
  `returned` (the book came back), the copy `withdrawn` with reason `damaged`.
- BR-9 Found: for the copy's most recent `lost_book` charge: waive `amount_due` with kind `found`;
  if `amount_paid > 0` and `lost_found_paid = refund`: a `found_refund` waiver of `amount_paid`
  posting `adjustment_credit` **and** `record_payment(direction="out", allocations="none",
  meta={"context": "library_refund", "charge_id": …})` of the same amount in one transaction (C12);
  the loan gets a `found` event; the fine stays.
- BR-10 Replacement: waiver kind `replaced` of `amount_due`; new copy via the catalogue service; old
  copy withdrawn (`lost`). If the lost charge was already paid, replacement is refused ("already
  paid — use Found if the book is back").
- BR-11 Reverse: only with `amount_paid = 0`; `reverse_source_entries("library_charge", id)` and, for
  each standing waiver, `reverse_source_entries("library_waiver", waiver.id)`; `reversed_at` on
  both; audit `library.charge.reversed`.
- BR-12 Collecting several charges: the member page proposes allocations oldest first
  (`(charge_date, number, id)`); the merchant may untick; `record_payment` validates amounts against
  the locked charges (a racing payment sees the reduced due, EC-1 of PAY-01).
- BR-13 Credit limits never refuse a library charge (D7).
- BR-14 No GST: library charges are ledger charges without tax (D3). A private library above the GST
  threshold issues invoices from the sales module for its plans; that is outside this module.

### 10. Permissions
| Action | Codename / role | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| See charges | `library.member.read` | ✅ | ✅ | ✅ | ✅ |
| Waive up to the ceiling | `library.charge.waive` (delegable) | ✅ | ✅ | ❌ (grantable) | ❌ |
| Waive above the ceiling | owner or admin **role** | ✅ | ✅ | ❌ (not grantable) | ❌ |
| Mark lost, replace, backdate | `library.loan.adjust` | ✅ | ✅ | ❌ (grantable) | ❌ |
| Mark found | `library.loan.write` | ✅ | ✅ | ✅ | ❌ |
| Manual charge, reverse a charge | `library.charge.write` | ✅ | ✅ | ❌ | ❌ |
| Collect, refund payment | `payments.payment.write` | ✅ | ✅ | ✅ | ❌ |

### 11. Reports
Fines and fees collected (LIB-12) reads charges, waivers and allocations; the overdue list reads the
live fine so far; the dashboard's "open library charges" is Σ `amount_due`.

### 12. Testing
- T-LIB-07-1 (unit, pure) all twelve worked examples as a table-driven test.
- T-LIB-07-2 (unit) cap room across renewal fines never exceeds the cap or the price.
- T-LIB-07-3 (unit) status derivation for every combination of paid, waived, refunded, reversed.
- T-LIB-07-4 (contract) `LibraryChargeTarget` passes the shared target suite (lock order, apply then
  unapply restores the row exactly, status re-derived, `outstanding ≥ 0`, bucket and `auto`
  declared) — 10-architecture §11.
- T-LIB-07-5 (contract) the two posting sources post only `charge` / `adjustment_credit` in `main`.
- T-LIB-07-6 (unit) waiver above the ceiling by staff holding the codename → 403; by admin → 200.
- T-LIB-07-7 (unit) lost → found unpaid: `found` waiver, `amount_due = 0`, status `waived`; lost →
  paid → found with refund: `found_refund` waiver + payment OUT, `party.balance` back to where it was
  before the lost charge, status `refunded`.
- T-LIB-07-8 (unit) reverse refused with a payment; allowed without, reversing waivers too.
- T-LIB-07-9 (replay) after a fuzzed 300-step sequence of charges, payments, voids, waivers and
  reversals, each charge's `amount_paid` equals Σ its live allocations, `waived_amount` equals Σ its
  standing waivers, and the member's library charges net equals the ledger lines of their sources
  (10-architecture §11 replay pattern).
- T-LIB-07-10 (DB) `UPDATE ledger_entry SET amount = …` on a library line raises from the trigger
  (the core guarantee, asserted for this source).
- E2E `08-fines`: return late through the counter; take the fine by cash; waive a second fine as
  admin; a staff context with `library.charge.waive` granted is refused above ₹100; mark lost, then
  found with refund; the member's khata page shows the charge, payment, waiver and refund rows with
  the source resolver's text (no raw message id — the `ledger.entry.type.manual_got` defect of
  CLAUDE.md LED-04). Shots: charges tab (open, paid, waived, refunded), each dialog, the khata
  rows — four widths, measuring checks.

### 13. Edge cases
- EC-1 Price unknown and no fallback: Mark lost requires the librarian to type it; the typed price is
  saved to the copy for next time.
- EC-2 A fine of ₹0 after grace or cap: no charge is written; the row says "no fine".
- EC-3 A payment that paid a fine is voided later: the target's `unapply` reopens the charge;
  nothing else changes.
- EC-4 A waiver on a charge that another device just paid: locked; the waiver sees `amount_due` of
  the committed state and refuses more than it.
- EC-5 A school library with fines turned off: a type with `fine_per_day = 0` never charges; the
  overdue list still works.
- EC-6 Fine on a book dropped in the box over a long weekend: backdated return (LIB-06 FR-12) to the
  last open day.
- EC-7 A member pays the lost charge, then brings the same title as a replacement: refused
  (BR-10); the librarian uses Found if the original came back, or keeps the money.
- EC-8 Rounding makes a fine exceed the price by half a rupee: impossible, the cap is applied after
  rounding (example 8's order).

### 14. Future
Depreciation by age of the book; "same title or N× the price" per type; GST through the document port
(D3); per-day fine tiers (₹1 for the first week, ₹2 after); a fines amnesty (bulk waiver with one
reason, owner only).

---

## LIB-08 — Holds and reservations

### 1. Product requirements
A member can ask for the next copy of a title that is out, and the library keeps that promise in
order. A hold is a **queue**, not a booking: first in line when any copy returns, with no time
range, so it stays in the library module and does not use the bookings engine (shared-engines
§3.10; research §6.4). Measured by: no ready hold waits more than its pickup window without being
expired or collected; zero copies issued past a waiting member (T-LIB-08-4).

- FR-1 **Place** a hold on a title (any copy) or, for a volume or set, on one copy, for a member,
  from the title page, the member page or the counter.
- FR-2 **Queue**: first placed, first served (D16); the position is derived from `placed_at`;
  the title page shows the queue and each member sees their position.
- FR-3 **Allot on return**: when a copy of the title comes back, it goes to the first waiting hold
  whose member is active (a member whose membership is expired, suspended or closed is skipped and
  keeps their place); the copy moves to `on_hold_shelf`, the hold becomes `ready` with `collect_by`
  = the `hold_pickup_days`-th open day after today; a hold-ready notice is prepared (LIB-09) and the
  bell shows `library.hold_ready`.
- FR-4 **Copies on the shelf** when the hold is placed: the response lists them; the screen offers
  **Set aside now** (the hold becomes ready with that copy) or, at the counter with the member
  present, **Issue now**.
- FR-5 **Collect**: issuing the kept-aside copy to its member at the counter collects the hold
  (LIB-06 BR-1).
- FR-6 **Expire**: the daily job expires ready holds whose `collect_by` has passed; their copy goes
  to the next waiting hold (ready again) or back to `available`.
- FR-7 **Cancel** (member's request or staff), **extend** the pickup date, **move** a hold to
  another copy of the title (a damaged kept-aside copy).
- FR-8 **Renewals respect holds**: a waiting hold on a title refuses the renewal of a copy of it
  unless another available copy can serve the hold (LIB-06 BR-3).
- FR-9 **Last copy withdrawn**: waiting holds are cancelled with reason "No copies left", and the
  holds screen lists them under "Tell these members" with a prepared text.

### 2. User flows
**Place a hold at the counter (staff).** Issue mode, member Rahul loaded → type "wings" → the box's
results include titles → **Wings of Fire · all 3 out** → Enter → "Place a hold? Rahul would be 2nd in
line." → Enter → row "Hold placed · 2nd in line".

**Return triggers pickup.** Return 4513 → banner "Keep aside for Rahul S. (M-0102) · by Tue 20 Oct" →
the librarian puts the book on the hold shelf → the bell "1 book kept aside today"; Holds → Ready →
Rahul → **WhatsApp** (prepared text) → sent from the library's phone.

**Expiry.** Tue 20 Oct passes; the 06:15 job on Wed expires Rahul's hold; the next member in line gets
it (ready, new notice) or the copy goes back on the shelf; the Holds screen shows "Expired today: 1".

### 3. Features
**MVP:** title and copy holds; FIFO queue; set aside; allot on return; ready and collect-by; collect
at issue; expire job; cancel, extend, move; renewal refusal; last-copy cancellation; holds screen
(Waiting, Ready, Expired/cancelled today); `max_holds` per type.
**Later:** priority by membership type (teachers first); holds placed by members themselves through
self-view; "notify when available" without a hold; purchase suggestion from long queues (LIB-12 later).

### 4. Entities and relationships
`library_title 1─* library_hold *─1 library_membership`; `library_hold *─0..1 library_copy` (specific
copy); `library_hold 0..1─1 library_copy` (`ready_copy`, kept aside); `library_hold 1─0..1
library_loan` (collected).

### 5. Database
**`library_hold`** (TenantModel)

| Column | Type | Null / default | Notes |
|---|---|---|---|
| `title_id` | FK RESTRICT | no | |
| `copy_id` | FK `library_copy` RESTRICT | yes | copy-specific hold |
| `membership_id` | FK RESTRICT | no | |
| `party_id` | FK `parties.Party` RESTRICT | no | |
| `placed_on` / `placed_at` | `date` / `timestamptz` | no | |
| `status` | `varchar(10)` | `'waiting'` | CHECK in (`waiting`, `ready`, `collected`, `expired`, `cancelled`) |
| `ready_copy_id` | FK `library_copy` RESTRICT | yes | CHECK `status <> 'ready' OR ready_copy_id IS NOT NULL` |
| `ready_on` / `collect_by` | `date` | yes | |
| `closed_at` | `timestamptz` | yes | collected, expired, cancelled |
| `close_reason` | `varchar(160)` | `''` | |
| `loan_id` | FK `library_loan` SET NULL | yes | when collected |
| `version` | `integer` | 1 | |

Constraints: `uq_library_hold_live UNIQUE (membership_id, title_id) WHERE status IN ('waiting',
'ready')`; `uq_library_hold_ready_copy UNIQUE (ready_copy_id) WHERE status = 'ready'`.
Indexes: `ix_library_hold_queue (tenant_id, title_id, status, placed_at)`;
`ix_library_hold_expiry (tenant_id, status, collect_by)`; `(tenant_id, membership_id, status)`.

### 6. API
| Method and path | Codename | Request → response | Errors |
|---|---|---|---|
| `GET /library/holds` | `library.loan.read` | `?status&title&membership&ordering=placed_at\|collect_by` → `[HoldRow]` with `position` | |
| `POST /library/holds` | `library.loan.write` | `{membership_id, title_id, copy_id?}` + key → 201 `{data: HoldRow, meta: {position, available_copies: [CopyRow]}}` | 409 `library_hold_refused` (`details.reason`: `max_holds` \| `already_holding` \| `already_on_loan` \| `membership_inactive` \| `no_loanable_copy`) |
| `POST /library/holds/{id}/set-aside` | `library.loan.write` | `{copy_id}` → 200 | 409 `library_copy_unavailable`, `library_hold_not_open` |
| `POST /library/holds/{id}/cancel` | `library.loan.write` | `{reason}` → 200 `{meta: {next_ready?: HoldRow}}` | 409 `library_hold_not_open` |
| `POST /library/holds/{id}/extend` | `library.loan.write` | `{collect_by}` (≤ 30 days ahead) | 409 |
| `POST /library/holds/{id}/move` | `library.loan.write` | `{copy_id}` | |
| `GET /library/titles/{id}/holds` | `library.loan.read` | queue | |

`HoldRow = {id, title: {id, title}, copy?: {id, accession_number}, membership: {id, member_number,
name}, status, position, placed_on, ready_copy?: {id, accession_number}, ready_on, collect_by,
close_reason}`. New codes: `library_hold_refused`, `library_hold_not_open` (409).

### 7. Frontend
- Route `/library/holds` → `HoldsPageContent` with `UbChipTabs` Waiting · Ready · Closed today.
- Components: `PlaceHoldDialog` (`dynamic()`), `HoldQueue` (title page), `HoldRowActions`
  (WhatsApp, Cancel, Extend, Move behind ⋯), `HoldReadyBanner` (counter).
- Service `api/libraryHoldService.ts`; slice `libraryHoldListSlice` (lazy).
- Invalidation: hold writes invalidate `libraryHoldList`, `libraryTitleDetail`,
  `libraryMemberDetail`, `libraryHome`.

### 8. UI/UX
- Ready tab rows: member (owns the line), caption "Wings of Fire · 4513 · by Tue 20 Oct", a **Due
  today** badge on the caption line when `collect_by = today`; actions WhatsApp (primary), ⋯.
- Waiting tab grouped by title with the queue order.
- Empty: "No holds. When a member asks for a book that is out, place a hold from the counter or the
  book's page."
- Copy (en / hi): `library.hold.title` "Holds" / "आरक्षण"; `library.hold.position` "{n} in line" /
  "कतार में {n}वें"; `library.hold.ready` "Kept aside until {date}" / "{date} तक अलग रखी";
  `library.hold.expired` "Not collected" / "नहीं ली गई".

### 9. Validation and business rules
- BR-1 Placing: effective status active; `holds live < max_holds` (type); no live hold on this title;
  no open loan of this title for this member; at least one copy of the title that is not withdrawn,
  lost or missing and is loanable for this member's type.
- BR-2 Allotment on return (inside the return transaction, after the copy lock): candidate holds =
  waiting holds for this copy (copy-specific) first, then waiting title holds, ordered `placed_at`;
  the first whose member is effectively active wins; lock order party(returning member) → … → holds
  (id order); the hold's member's party is **not** locked (no money moves for them).
- BR-3 `collect_by = the N-th open day after ready_on` (`N = hold_pickup_days`, D16), using
  `next_open_day` repeatedly; a ready hold whose `collect_by < today` is expired by the job, and is
  treated as expired by any read before the job runs (the bookings engine's "an expired hold counts
  as free even before the job has run", applied here).
- BR-4 Expiry job `library.expire_holds`: registered with `register_schedule` daily at 06:15 IST,
  fanned out per tenant with the tenant-local date (the `apps/ledger/tasks.py:44-66` pattern),
  idempotency token `library_holds:<tenant>:<date>`; for each expired ready hold, in `collect_by`
  order: status `expired`, then re-run BR-2 for its copy.
- BR-5 Cancelling a ready hold re-runs BR-2 for its copy.
- BR-6 Renewal check (LIB-06 BR-3): a renewal is refused when the title has a waiting hold and the
  count of `available` loanable copies of the title is 0 (a copy on the shelf could serve the hold
  instead).
- BR-7 Withdrawing the last non-withdrawn copy cancels every waiting hold (FR-9) in the same
  transaction.

### 10. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View holds | `library.loan.read` | ✅ | ✅ | ✅ | ✅ |
| Place, set aside, cancel, extend, move | `library.loan.write` | ✅ | ✅ | ✅ | ❌ |

### 11. Reports
Holds waiting and expired (later report); the dashboard shows ready and expiring today. Long queues
feed the purchase-suggestion report later.

### 12. Testing
- T-LIB-08-1 (unit) FIFO with a skipped expired member: the second member gets the copy; the first
  keeps position 1 for the next copy.
- T-LIB-08-2 (unit) copy-specific holds take precedence for that copy only.
- T-LIB-08-3 (unit) `collect_by` over a Sunday and Diwali.
- T-LIB-08-4 (invariant) after a fuzzed sequence of returns, issues, holds and expiries, no loan was
  issued to member B while A's older waiting hold on the title existed and a copy was allotted — i.e.
  every `on_hold_shelf` copy maps to exactly one ready hold, and every ready hold's copy is
  `on_hold_shelf`.
- T-LIB-08-5 (job) running the expiry job twice for one date expires each hold once.
- T-LIB-08-6 (API) each `library_hold_refused` reason.
- E2E `09-holds`: place a hold on a title whose copies are all out; return one at the counter;
  assert the banner, the Ready tab, and the bell count; run the expiry with `manage.py library_expire_holds --date <day after collect_by>` (the operator
  command B11 ships) and assert the next member
  is ready. Shots: holds tabs (empty, waiting queue, ready with due-today badge), the place-hold
  dialog, the title queue — four widths, measuring checks.

### 13. Edge cases
- EC-1 Hold ready but the member is now blocked by dues: kept aside anyway (only an inactive
  membership skips), and the counter will show the dues block at collection (overridable).
- EC-2 The kept-aside copy is found damaged on the shelf: **Move** the hold to another copy, or
  cancel and re-run allotment.
- EC-3 A member places a hold and then borrows another copy of the same title: the hold is
  collected-by-proxy (status `collected`, `close_reason = "Borrowed another copy"`) at issue.
- EC-4 Last copy withdrawn with holds waiting: FR-9.
- EC-5 Two returns of copies of one title at two desks: each allots under its own copy lock; the
  hold queue's first member can be allotted only once because `uq_library_hold_ready_copy` and the
  status check run under the hold row lock.
- EC-6 Membership closed: its holds are cancelled at closure (LIB-04 BR-6).

### 14. Future
Priority by type; member-placed holds via self-view; a hold "not needed after" date; purchase
suggestion from queues; inter-library requests.

---

## LIB-09 — Overdue reminders and hold-ready notices

### 1. Product requirements
Chasing overdue books is daily work. The library sees who to remind, in one list grouped by member
(and by class for schools), and one tap prepares a polite WhatsApp text listing every overdue book and
the fine so far, which the library sends **from its own phone** — the product sends nothing (DEC-012).
Every reminder is recorded in the core reminders history (ADR-054), so a member's khata shows when
they were last asked. Measured by: overdue loans older than 30 days as a share of loans issued
(dashboard trend); time from list open to first text ≤ 5 s.

- FR-1 Library registers two reminder sources with `register_reminder_source` (11-contracts §1.6):
  `library_loan` (overdue books) and `library_hold` (hold ready). Both are kind **`notice`**: the
  book is what is due; the fine so far is information, not an amount owed (C3: `amount = None`).
- FR-2 **Candidates** for `library_loan` on a date: open loans whose days overdue is in
  `overdue_reminder_days` (default 1, 7, 14, 30 — D21), plus loans due tomorrow when
  `remind_day_before` is on. For `library_hold`: holds that became ready that day.
- FR-3 The **recipient** is the guardian when the membership has a `parties_relation` guardian with
  `receives_messages = true`, else the member (D22) — `recipient_party_id` on the candidate.
- FR-4 `/library/overdue` lists every member with overdue books (not only today's candidates),
  grouped by member, filterable by group label, days overdue (1+, 7+, 14+, 30+), type, and
  "not reminded in 7 days"; each member row shows the books, days late, fine so far and the last
  reminder.
- FR-5 **Remind** on a member row composes one text for all their overdue books
  (template `library_overdue`, C4), shows it, and opens WhatsApp (`wa.me`), the SMS app (`sms:`) or the
  dialler; the tap that opens the app records the reminders (one row per overdue loan, one shared
  message, C3), exactly as LED-06 records a manual reminder on the tap and not on the sheet opening
  (`apps/ledger/services/reminders.py:1-9`).
- FR-6 **Bulk**: select members (or a whole group, "9-B") → **Prepare texts** → a sequential sender
  lists each member with **Open WhatsApp**; each tap records that member's reminders. Up to 100
  members at a time (the LED-06 bulk ceiling, `BULK_REMINDER_MAX`).
- FR-7 **Hold ready**: the Holds screen's Ready tab has the same Remind action with template
  `library_hold_ready` ("Wings of Fire is kept for you until Tue 20 Oct").
- FR-8 In-app bell: `library.overdue_today` (daily, "12 books became overdue today", route
  `/library/overdue?days=1`) and `library.hold_ready` (grouped per day, "3 books kept aside today",
  route `/library/holds?tab=ready`), both through `register_notification_type` (11-contracts §5),
  visible to members holding `library.loan.read`.
- FR-9 The core reminders list (`/ledger/reminders`) shows library reminders in its history,
  filterable by module; the member's khata reminder strip shows them too.
- FR-10 **Policy**: `register_reminder_policy("library", {daily_cap_per_source: 1})` — the same book is
  not reminded twice in a day; no time window (10-architecture §16 item 4 default); a tenant may
  narrow it (`reminders.library.window`).

### 2. User flows
**Morning round (librarian, phone).** Bell "12 books became overdue today" → `/library/overdue?days=1`
→ member row "Asha Kulkarni · 9-B · 2 books · fine so far ₹12 · never reminded" → **Remind** → the
sheet shows the text:
> Hello Suresh ji, Asha (M-0043) has these books from Saraswati Vidya Mandir Library overdue:
> • Wings of Fire (4513), due 10 Oct, 4 days late
> • Godaan (4600), due 10 Oct, 4 days late
> Fine so far: Rs 12. Please return them soon.
> — Saraswati Vidya Mandir Library

→ **WhatsApp** → WhatsApp opens with the text (to the guardian's number) → the row shows "Reminded
today 09:12".

**Class-wise (school).** Filter group "9-B" → select all (8 members) → **Prepare texts** → the sender
steps through the eight with **Open WhatsApp** each.

### 3. Features
**MVP:** two sources; candidate rules; guardian recipient; overdue list grouped by member and group;
single and bulk prepare; WhatsApp/SMS-app/call; recording through the core pipeline; hold-ready
notice; two bell notifications; per-source daily cap; templates in en and hi.
**Later:** automated provider SMS for library notices (LED-07's job) when the tenant has a provider
and consent — the candidate source already feeds it; membership expiry notices (T-7) and recurring
fee dues (the dues engine's own source); a printed overdue list per class.

### 4. Entities and relationships
Core `ledger_reminder` rows with `module = 'library'`, `source_type ∈ {'library_loan',
'library_hold'}`, `source_id`, `subject_label`, `kind = 'notice'`; `message_group_id` shared by the
rows of one text, written by core `record_source_reminders` (C3 → R10). Core `notifications_notification` rows for the two bell types. No library table.

### 5. Database
No new table. Uses the ADR-054 columns on `ledger_reminder` (`module`, `source_type`, `source_id`,
`subject_label`) and the widened unique index `(party, due_on, kind, source_id) NULLS NOT DISTINCT`.
For a library candidate, `due_on` is the **date of the reminder run**, not the loan's due date, so
the day-1 and day-7 notices for one loan are two rows (assumption recorded under C3). Template rows
(when a tenant overrides a body) are core `notifications_template` rows with codes
`library_overdue`, `library_hold_ready`, `library_issue_slip`.

Default bodies (registered through C4; `{{…}}` placeholders only, NTF-02 rules; `Rs`, never `₹`):

| Code · channel · locale | Body |
|---|---|
| `library_overdue` · whatsapp · en | `Hello {{recipient_name}}, {{member_line}}these {{library}} books are overdue:\n{{book_lines}}{{fine_line}}Please return them soon.\n— {{library}}` |
| `library_overdue` · whatsapp · hi | `नमस्ते {{recipient_name}} जी, {{member_line}}{{library}} की ये किताबें लौटानी बाकी हैं:\n{{book_lines}}{{fine_line}}कृपया जल्दी लौटाएँ।\n— {{library}}` |
| `library_overdue` · sms · en | `{{library}}: {{count}} book(s) overdue for {{member_number}}. Fine so far Rs {{fine_so_far}}. Please return soon.` |
| `library_hold_ready` · whatsapp · en | `Hello {{recipient_name}}, {{title}} is kept for {{member_first}} at {{library}} until {{collect_by}}.\n— {{library}}` |
| `library_hold_ready` · whatsapp · hi | `नमस्ते {{recipient_name}} जी, {{title}} {{member_first}} के लिए {{collect_by}} तक {{library}} में रखी है।\n— {{library}}` |
| `library_issue_slip` · whatsapp · en | `{{member_first}}, you have borrowed from {{library}}:\n{{book_lines}}— {{library}}` |

`member_line` is empty when the recipient is the member, and "Asha (M-0043) has " style when a
guardian; `fine_line` is empty when the fine so far is ₹0. `library` is the tenant's business name
(`shop_name(tenant)`), never the product (CLAUDE.md).

### 6. API
| Method and path | Codename | Request → response | Errors |
|---|---|---|---|
| `GET /library/overdue` | `library.loan.read` | `?group&days_min=1\|7\|14\|30&type&not_reminded_days=7&q&page` → `[{membership: MemberRow, recipient: {name, has_mobile}, loans: [{loan_id, title, accession_number, due_on, days_late, fine_so_far}], fine_so_far_total, last_reminded_at}]`, `meta.totals {members, loans, fine_so_far}` | |
| `POST /library/overdue/{membership_id}/preview` | `library.loan.read` | → `{text, sms_text, wa_url, sms_url, tel_url, recipient, loan_ids}` (writes nothing) | 409 `library_nothing_overdue` |
| `POST /library/overdue/{membership_id}/remind` | `ledger.reminder.write` + `library.loan.read` | `{channel: "whatsapp_manual"\|"sms_manual"\|"call", loan_ids}` → 201 `{reminders: [ReminderRow], text}` | 409 `reminder_cap_reached` (core), `reminder_outside_window` (core, only if a tenant window is set) |
| `POST /library/overdue/bulk-prepare` | `ledger.reminder.write` | `{membership_ids ≤ 100 \| group}` → `{items: [{membership_id, recipient, text, wa_url, skip_reason?}]}` (writes nothing) | 400 `too_many_ids` |
| `POST /library/holds/{id}/remind` | `ledger.reminder.write` | `{channel}` → 201 | |

Candidate functions (Python, registered in `ready()`):
`library_loan_candidates(tenant, on) -> Iterable[ReminderCandidate]` and
`library_hold_candidates(tenant, on)`, each one indexed query (`ix_library_loan_overdue`,
`ix_library_hold_expiry`). New code: `library_nothing_overdue` (409).

### 7. Frontend
- Route `/library/overdue` → `OverduePageContent` (`UbDataGrid` of members, card layout on phone).
- Components: `OverdueMemberRow`, `LibraryReminderSheet` (built on the reminders feature's
  `PartyReminderSheet` layout — reminders is an allowed core import; the library passes its own
  preview), `BulkOverdueSender` (`dynamic()`).
- Service `api/libraryReminderService.ts`: `listOverdue`, `previewOverdue`, `remindOverdue`,
  `bulkPrepare`, `remindHold`.
- Slice `libraryOverdueSlice` (lazy).
- Invalidation: a reminder invalidates `libraryOverdue`, `libraryMemberDetail`, `reminderList`.

### 8. UI/UX
- Member rows: name (owns its line), caption "M-0043 · 9-B · 2 books · 4 days", right: fine so far
  (`UbAmount`, labelled "so far"), a "Reminded today" or "Last reminded 3 Oct" badge on the caption
  line; the books as a sub-list under the row on desktop, collapsed "2 books ▾" on phone.
- The sheet shows the exact text that will be sent (server-composed, the LED-06 preview rule), the
  recipient ("To Suresh Kulkarni, guardian"), and three buttons WhatsApp · SMS · Call; no mobile →
  the buttons are replaced by "No mobile for Suresh Kulkarni · Add one" (link to the party).
- Empty: "No books are overdue." (plain words; no emoji in product copy).
- Copy (en / hi): `library.overdue.title` "Overdue books" / "देर से लौटने वाली किताबें";
  `library.overdue.soFar` "so far" / "अब तक"; `library.overdue.remind` "Remind" / "याद दिलाएँ".

### 9. Validation and business rules
- BR-1 Fine so far = `fine(loan, today)` from LIB-07, computed at read time; never stored.
- BR-2 A candidate is produced once per (loan, run date); the widened unique index makes a second run
  of the job harmless.
- BR-3 The remind endpoint locks nothing but the reminder rows' party (the recipient's context is
  read-only); it calls `check_reminder_allowed` per source (core); a loan returned between preview
  and tap is dropped from `loan_ids` and the text is recomposed (the server composes; the client
  never edits the text).
- BR-4 Channel `sms_manual` uses the SMS body (short, GSM-7, `Rs`); `whatsapp_manual` the WhatsApp
  body; the message is truncated in its optional middle (the book list beyond five books becomes
  "and 3 more") before the fine line or signature, following LED-06 FR-7.
- BR-5 Members without a mobile on the recipient are skipped in bulk with `skip_reason = no_mobile`.
- BR-6 Nothing is sent by the product: `sent` means "the librarian was handed the message"
  (`reminders.py:1-9`).

### 10. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| See the overdue list | `library.loan.read` | ✅ | ✅ | ✅ | ✅ |
| Prepare and record reminders | `ledger.reminder.write` (core) | ✅ | ✅ | ✅ | ❌ |
| See the bell notices | `library.loan.read` | ✅ | ✅ | ✅ | ✅ |

### 11. Reports
The overdue list (LIB-12) is the printable form of FR-4; reminder history is the core reminders list
filtered by `module = library`.

### 12. Testing
- T-LIB-09-1 (unit) candidates on a date: loans exactly 1, 7, 14, 30 days overdue (days counted in
  calendar days, independent of closed days, so a reminder is never skipped by a holiday) and, with
  `remind_day_before`, loans due tomorrow.
- T-LIB-09-2 (unit) recipient is the guardian only with `receives_messages = true`.
- T-LIB-09-3 (unit) the composed text for two books, one guardian, fine ₹12, in en and hi; the
  signature is the tenant name; the text contains neither "YourKhata" nor the domain (extends the
  no-product-name rule to message texts).
- T-LIB-09-4 (unit) remind records one reminder per loan with one `message_group_id`, kind `notice`,
  `module = library`; a second tap the same day for the same loans → 409 `reminder_cap_reached`.
- T-LIB-09-5 (contract) the reminder source contract: candidates are idempotent per date; unknown
  tenant → empty.
- T-LIB-09-6 (template test) every library template renders with every placeholder supplied and
  none missing (NTF-02's strict renderer).
- E2E `10-reminders`: seed two members with overdue books (one with a guardian); open the overdue
  list; Remind → assert the `wa.me` URL's text parameter contains both titles and the fine, and the
  phone number is the guardian's; the row shows "Reminded today"; the core reminders page lists
  them under Library. Shots: overdue list (empty, grouped, filtered by class), the sheet (member,
  guardian, no mobile), bulk sender — four widths, measuring checks.

### 13. Edge cases
- EC-1 A member with 12 overdue books: the text lists five and "and 7 more"; the printed notice
  (LIB-13) lists all.
- EC-2 The guardian is also a member with overdue books: two separate texts (different members).
- EC-3 The member returned the books after the list loaded: the preview is recomposed at tap; with
  nothing overdue → 409 `library_nothing_overdue`, the row disappears.
- EC-4 A tenant sets a reminder window (08:00–19:00) for library: taps outside it get 409
  `reminder_outside_window` with `next_allowed_at`, shown inline.
- EC-5 A hold ready and an overdue book for one member on one day: two texts, two sources; the
  per-source cap allows both.

### 14. Future
Automated provider SMS for notices (LED-07) with consent; membership expiry notices; recurring fee
reminders from the dues engine; member self-view link in the text (D11, a `/d/<token>` page with no
product name).

---

## LIB-10 — Stock verification

### 1. Product requirements
Once a year (every year up to 20,000 volumes; GFR norms, research §0) the library counts its books
against the register. The product turns that into a scan-and-compare: scan what is on the shelves,
close, and read what is missing, what is out, what is in the wrong place, and the loss per thousand
issued that auditors ask for. Measured by: a 6,000-copy library verifies shelf by shelf over several
days without a single loan closed by a scan; the report reproduces the counts from the scan rows.

- FR-1 **Start** a verification with a name ("Annual 2026–27") and a scope: the whole library, some
  locations, some categories, or an accession range. Several verifications may be open (shelf by
  shelf); overlapping scopes are warned, not refused.
- FR-2 **Scan** (or type) accession numbers into a focused box, the counter's input rules (LIB-06
  FR-2, FR-14): each scan is classified at once and shown with a running tally. The librarian may
  pick the **location being counted**, so a copy found on another shelf is flagged.
- FR-3 A scan **never** closes a loan, moves a copy or charges anything (research §13 EC-19); it
  only records `last_seen_on`.
- FR-4 A scan can be **voided** (a wrong scan) by the person who made it or an admin.
- FR-5 **Close** compares the scans with the scope and fixes the counts: found, found in the wrong
  place, on loan (not missing), **missing** (expected on the shelf, not scanned), unknown numbers,
  found but marked lost/missing/withdrawn (offer **Mark found**), outside the scope, duplicate scans.
- FR-6 After closing, with `library.verification.close`: **Mark missing** (all or selected) sets the
  copies' status to `missing` with the verification as source; **Withdraw missing** withdraws them
  with reason `missing`, with a reason note (write-off approval is the library's own process).
- FR-7 **Reopen once** (a shelf was forgotten) with `library.verification.close` and a reason; the
  counts are recomputed at the next close.
- FR-8 The **verification report** (LIB-12) shows scope, counts, the missing list with prices, items
  above ₹1,000 flagged, and **loss per 1,000 issued** against the norm of 5 per 1,000.

### 2. User flows
Stock check → **Start** → name, scope "Locations A-1 to A-6" → Start → scan screen: location
selector "A-1" → scan 4513 ✓ found · 4514 ✓ · 1024 "found — belongs to B-2" (amber) · 7777 "no book
with this number" (red) · 4600 "on loan to Rahul S. — not missing" (grey) → progress "312 of 480
expected scanned" → next day continue → **Close** → summary "480 expected · 452 found · 9 wrong
place · 11 on loan · 8 missing (₹2,140) · 2 unknown" → **Mark 8 missing** (admin) → report →
**Print** (A4 landscape).

### 3. Features
**MVP:** start with scope; scan with classification; location selector; void scan; progress; close;
mark missing; withdraw missing; reopen once; report with loss per 1,000 and the ₹1,000 flag.
**Later:** upload a list of scanned numbers from a handheld's file; sample checks above 50,000
volumes (research §0); verification by volunteers on several phones at once (works in the MVP —
scans are per request — but without per-person tallies).

### 4. Entities and relationships
`library_verification 1─* library_verification_scan *─0..1 library_copy`; scope references
`library_location` and `library_category` ids.

### 5. Database
**`library_verification`** (TenantModel)

| Column | Type | Null / default | Notes |
|---|---|---|---|
| `name` | `varchar(80)` | no | |
| `scope_kind` | `varchar(12)` | no | CHECK in (`all`, `locations`, `categories`, `range`) |
| `location_ids` | `uuid[]` | `{}` | |
| `category_ids` | `uuid[]` | `{}` | |
| `range_from` / `range_to` | `varchar(24)` | `''` | compared by `accession_sort` |
| `started_on` | `date` | no | |
| `closed_on` | `date` | yes | |
| `status` | `varchar(8)` | `'open'` | CHECK in (`open`, `closed`) |
| `reopened` | `boolean` | false | CHECK: a closed verification that was reopened cannot reopen again (service) |
| `expected_count`, `found_count`, `wrong_location_count`, `on_loan_count`, `missing_count`, `unknown_count`, `flagged_count`, `outside_scope_count` | `integer` | 0 | cached at close; recomputable from scans |
| `missing_value` | `MoneyField` | 0 | Σ price of missing copies at close |
| `notes` | `text` | `''` | |
| `version` | `integer` | 1 | |

**`library_verification_scan`** (TenantModel + ImmutableModel, except `voided_at`)

| Column | Type | Notes |
|---|---|---|
| `verification_id` | FK RESTRICT | |
| `code_entered` | `varchar(40)` | as typed |
| `copy_id` | FK `library_copy` null | null for unknown numbers |
| `location_id` | FK `library_location` null | the location being counted |
| `result` | `varchar(24)` | CHECK in (`found`, `found_wrong_location`, `on_loan`, `unknown_number`, `found_flagged`, `outside_scope`, `duplicate_scan`) — at scan time; recomputed at close |
| `scanned_at` | `timestamptz` | |
| `voided_at` / `voided_by_id` | null | |

Indexes: `(verification_id, copy_id) WHERE voided_at IS NULL`; `(verification_id, scanned_at)`.

### 6. API
| Method and path | Codename | Request → response | Errors |
|---|---|---|---|
| `GET /library/verifications` | `library.verification.run` | → `[VerificationRow]` | |
| `POST /library/verifications` | `library.verification.run` | `{name, scope_kind, location_ids?, category_ids?, range_from?, range_to?}` → 201 `{data, meta: {expected_count, overlaps: [{id, name}]}}` | 400 |
| `GET /library/verifications/{id}` | `library.verification.run` | → `{…, progress: {expected, scanned_expected, extra}, recent_scans: [ScanRow]}` | |
| `POST /library/verifications/{id}/scans` | `library.verification.run` | `{code, location_id?}` + key → 201 `ScanRow = {id, code_entered, copy?: CopyRow, result, message_params}` | 409 `library_verification_closed` |
| `POST /library/verifications/{id}/scans/{scan_id}/void` | `library.verification.run` (own scan) or `library.verification.close` | → 200 | |
| `POST /library/verifications/{id}/close` | `library.verification.run` | → 200 with counts | 409 `library_verification_closed` |
| `POST /library/verifications/{id}/reopen` | `library.verification.close` | `{reason}` | 409 `library_verification_reopen_used` |
| `GET /library/verifications/{id}/results?bucket=missing\|wrong_location\|on_loan\|unknown\|flagged` | `library.verification.run` | → `[ResultRow]` | |
| `POST /library/verifications/{id}/mark-missing` | `library.verification.close` | `{copy_ids \| all: true, reason}` → `{marked}` | 409 `library_verification_open` |
| `POST /library/verifications/{id}/withdraw-missing` | `library.verification.close` + `library.copy.withdraw` | `{copy_ids \| all: true, note}` | |

New codes (409): `library_verification_closed`, `library_verification_open`,
`library_verification_reopen_used`.

### 7. Frontend
- Routes `/library/verification`, `/library/verification/[id]` (scan screen), `/library/verification/
  [id]/results`.
- Components: `VerificationListPageContent`, `StartVerificationDialog`, `VerificationScanPageContent`
  (reuses `CounterScanBox`, `useCounterFocus`, the queue thunk shape), `VerificationTally`
  (`UbProgress` + counts), `VerificationResults` (tabs per bucket), `MarkMissingDialog`.
- Service `api/libraryVerificationService.ts`; slices `libraryVerificationListSlice`,
  `libraryVerificationScanSlice` (lazy).

### 8. UI/UX
- Scan screen, desktop: location selector and scan box on top; the tally as five figures (Found ·
  Wrong place · On loan · Unknown · Remaining); recent scans list with coloured results (green found,
  amber wrong place, grey on loan, red unknown) and words, never colour alone. Phone: box and tally
  sticky, recent scans as cards.
- Close confirmation states what closing does ("Copies not scanned will be listed as missing. Nothing
  is changed until you mark them.").
- Copy (en / hi): `library.verify.title` "Stock check" / "किताबों की गिनती"; `library.verify.missing`
  "Missing" / "नहीं मिली"; `library.verify.wrongPlace` "Found in another place" / "दूसरी जगह मिली".

### 9. Validation and business rules
- BR-1 **Expected set** (evaluated at close): copies in scope with status in (`available`,
  `on_hold_shelf`, `in_repair`, `missing`); `on_loan` copies in scope are counted as **on loan**, not
  missing; `lost` and `withdrawn` are not expected.
- BR-2 **Classification of a scan**: unknown code → `unknown_number`; copy outside scope →
  `outside_scope`; copy already scanned (not voided) in this verification → `duplicate_scan`; copy
  `lost`, `missing` or `withdrawn` → `found_flagged` (offer Mark found); copy `on_loan` →
  `on_loan` (an anomaly worth reading: the book is on the shelf but the system says out); location
  selected and ≠ copy location → `found_wrong_location`; else `found`. Every non-unknown scan sets
  `last_seen_on`.
- BR-3 **Missing** = expected − scanned (excluding voided scans).
- BR-4 **Loss per 1,000 issued** = (copies marked `missing` by this verification + copies whose
  `lost` event falls in the 12 months ending `closed_on` and that have not been found since) ÷ (loans
  issued in those 12 months) × 1,000, to one decimal; "not applicable" when no loans were issued.
  Shown beside the norm "up to 5 per 1,000 is reasonable if not due to dishonesty or negligence
  (GFR)" — a statement of the norm, not a judgement.
- BR-5 **Flag** every missing copy priced above ₹1,000 ("always investigated", research §0).
- BR-6 Mark missing sets status `missing` with a copy event (`source_type = library_verification`);
  it charges nobody (no member is responsible for a shelf loss).
- BR-7 Scans lock nothing but their own insert; close locks the verification row.

### 10. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Start, scan, void own scans, close, view results | `library.verification.run` | ✅ | ✅ | ✅ | ❌ |
| Reopen, mark missing, void others' scans | `library.verification.close` | ✅ | ✅ | ❌ | ❌ |
| Withdraw missing copies | `+ library.copy.withdraw` | ✅ | ✅ | ❌ | ❌ |
| Read the report | `library.reports.read` | ✅ | ✅ | ❌ | ✅ |

### 11. Reports
The stock verification report (LIB-12, `library_verification`) and the withdrawn copies list.

### 12. Testing
- T-LIB-10-1 (unit) classification for every branch of BR-2.
- T-LIB-10-2 (unit) counts at close equal a recomputation from the scan rows; voided scans excluded.
- T-LIB-10-3 (unit) a scan of an on-loan copy leaves the loan open, the copy `on_loan`, and writes no
  charge (asserted by counting `library_loan`, `library_charge` and `ledger_entry` rows before and
  after).
- T-LIB-10-4 (unit) loss per 1,000 with 8 missing, 2 lost in the year, 2,000 loans → 5.0.
- T-LIB-10-5 (API) reopen twice → 409 `library_verification_reopen_used`.
- T-LIB-10-6 (performance) close over 20,000 copies in scope completes in ≤ 5 s (set-based SQL, no
  per-copy query).
- E2E `11-verification`: start a scope of two locations with ten copies; scan seven (one from the
  wrong location, one on loan, one unknown code); close; assert the counts; mark missing as admin;
  the copies show `missing`. Shots: scan screen mid-count, results tabs, report print sheet
  (`emulateMedia({media: 'print'})`, the LED-04 technique) — four widths, measuring checks.

### 13. Edge cases
- EC-1 A copy is issued during an open verification: counted as on loan at close (BR-1 is evaluated
  at close).
- EC-2 A copy returned during verification and never scanned: expected and missing — the librarian
  scans the returns shelf before closing (the close dialog says so).
- EC-3 The same copy scanned in two open verifications with overlapping scopes: found in both.
- EC-4 A missing copy turns up next month: Mark found (LIB-07) from the copy page; the verification
  keeps its historical count.
- EC-5 Accession range scope with suffixed numbers ("4512-A"): included by `accession_sort` order.

### 14. Future
Upload a scanner's stored list; sample verification for large libraries; per-volunteer tallies;
verification certificates for aided institutions in their prescribed format.

---

## LIB-11 — Dashboard section and library home

### 1. Product requirements
The owner opening YourKhata sees the library's day next to the shop's (when both are on), and the
librarian has a library home with the quick actions they use all day. Every figure links to the list
behind it (the parties chips pattern). Measured by: the library section renders in ≤ 150 ms server
time at 50,000 copies.

- FR-1 `register_dashboard_section("library", module="library", permission="library.loan.read",
  selector=library_dashboard, order=20)` (11-contracts §1.9): the core dashboard shows the section
  for members who hold the permission, when Library is on.
- FR-2 Figures: **today** issued, returned, renewed; **out now**; **overdue now** (loans and
  members); **holds ready** (and expiring today); **memberships expiring in 7 days**; **expired but
  still holding books**; **open library charges** (Σ `amount_due`); **deposits held** (Σ held, library
  module).
- FR-3 The library home `/library` shows the same figures plus quick actions **Counter**, **Add
  book**, **Add member**, **Stock check**, and, when members have group labels, **overdue by group**
  (the school view: "9-B · 6 overdue").
- FR-4 Money figures (charges, deposits) are visible only with `library.member.read`; a member without
  it sees the circulation figures only.

### 2. User flows
Owner opens `/dashboard` → the Library card "Out now 214 · Overdue 31 (18 members) · Kept aside 4 ·
Owed ₹1,240 · Deposits held ₹42,500" → taps **Overdue 31** → `/library/overdue`. Librarian opens
`/library` → **Counter**.

### 3. Features
**MVP:** the dashboard section; the library home with figures, quick actions and overdue by group.
**Later:** trends (issues per week), top titles this month, study-space tiles (seats free per shift,
fees due, attendance — §0.8).

### 4. Entities and relationships
Reads `library_loan`, `library_hold`, `library_membership`, `library_charge`, core
`payments_held_deposit`. Writes nothing.

### 5. Database
No new table. Queries use `ix_library_loan_overdue`, `ix_library_hold_expiry`,
`(tenant_id, status, valid_until)` on memberships, `ix_library_charge_fifo`, and LIB-06's
`(tenant_id, issued_on)` for issued today. Returned today uses `ix_library_loan_returned (tenant_id,
returned_on) WHERE status = 'returned'`, created in LIB-06's migration.

### 6. API
| Method and path | Codename | Response |
|---|---|---|
| `GET /reports/dashboard` (core) | as core | `sections: [{key: "library", module: "library", data: LibraryDashboard}]` |
| `GET /library/home` | `library.loan.read` | `{data: LibraryDashboard + {overdue_by_group: [{group_label, loans, members}] (top 12), quick_actions: [...]}}` |

`LibraryDashboard = {as_of, today: {issued, returned, renewed}, out_now, overdue: {loans, members},
holds: {ready, expiring_today}, memberships: {expiring_7d, expired_holding}, money?: {open_charges,
deposits_held}}` (`money` omitted without `library.member.read` — a key that is absent, not zeroed,
the CLAUDE.md PTY-03 rule).

### 7. Frontend
- `features/reports/dashboardSections.ts` gains `library: dynamic(() => import(
  'modules/DigiKhaato/features/library/components/LibraryDashboardSection'))` (10-architecture §6
  item 8).
- Route `/library` → `LibraryHomePageContent`; slice `libraryHomeSlice` (lazy); service
  `api/libraryHomeService.ts`.
- Each figure is a `UbStatCard` link to the filtered list URL (`/library/overdue`, `/library/holds?
  tab=ready`, `/library/members?status=expiring&within=7`, `/library/members?status=expired&
  holding=1`, `/library/charges?status=open`, `/library/members?deposit_held=1`).

### 8. UI/UX
- Dashboard card: a `UbSectionHeading` "Library" (shown only when more than one module section is
  present, matching nav grouping), four `UbStatCard`s on desktop in one row, 2×2 on phone. Below `md`
  the count tile is dropped (the 23 Sep phone-fold decision, Part 43 CR-129–CR-134, applies to module sections too), keeping
  Overdue, Kept aside and Owed.
- Library home: quick actions as a `UbGrid` of large buttons first on phone (the thumb zone), figures
  below; desktop: figures row, then quick actions, then overdue by group.
- Empty (new library): "Your library is ready. Add books or import your register, then start issuing
  at the counter." with the two actions.
- Copy: `library.home.outNow` "Out now" / "अभी बाहर"; `.overdue` "Overdue" / "देर से"; `.keptAside`
  "Kept aside" / "अलग रखी"; `.owed` "Owed to the library" / "पुस्तकालय का बकाया"; `.depositsHeld`
  "Deposits held" / "जमानत राशि जमा".

### 9. Validation and business rules
- BR-1 "Today" is `tenant_today`; issued counts loans with `issued_on = today` and status not
  `cancelled`.
- BR-2 Overdue = open loans with `due_on < today`; members = distinct memberships among them.
- BR-3 Deposits held = Σ `held_amount` of library deposits with status `held` (core
  `deposits_for(module="library")`); never added to any "to collect" figure (ADR-044).
- BR-4 The section is computed in at most six queries.

### 10. Permissions
| Figure | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Circulation figures, quick actions | `library.loan.read` | ✅ | ✅ | ✅ | ✅ |
| Money figures | `library.member.read` | ✅ | ✅ | ✅ | ✅ |
| Quick action Counter | `library.loan.write` | ✅ | ✅ | ✅ | ❌ (hidden) |

### 11. Reports
The dashboard is a summary of LIB-12's reports; each figure links to its list.

### 12. Testing
- T-LIB-11-1 (unit) each figure against a fixture with known counts, including a cancelled issue
  today (not counted) and a deposit refunded today (not held).
- T-LIB-11-2 (API) without `library.member.read` the `money` key is absent.
- T-LIB-11-3 (performance) ≤ 6 queries; `EXPLAIN` of the overdue and returned-today counts use their
  indexes.
- T-LIB-11-4 (component) every tile is a link to the documented URL; the section is absent from the
  dashboard when the module is off.
- E2E `12-dashboard`: after the counter checks, the dashboard's library figures equal the numbers the
  harness computed from its own actions. Shots: dashboard with the library section (shop on and off),
  library home (new library, busy day) — four widths, measuring checks.

### 13. Edge cases
- EC-1 Library on, sales off: the dashboard shows core tiles and Library only.
- EC-2 A member without `library.loan.read` (an accountant with it removed): no section.
- EC-3 A tenant with 200 group labels: overdue by group shows the top 12 by overdue count and "All
  groups" links to the filtered list.

### 14. Future
Trend sparklines; top titles; study-space tiles (§0.8); a primary-module ordering that puts the
library first on a library tenant's dashboard (shared-engines §5.4, with the onboarding checklist).

---

## LIB-12 — Reports

### 1. Product requirements
The library replaces its bound registers with reports it can print for an auditor or a committee and
export to a spreadsheet. Only built reports are listed (the reports hub rule, research §8).
Measured by: the accession register of a 6,000-copy library prints by range in under 10 s; every
money total in a report reconciles with the ledger (T-LIB-12-4).

- FR-1 Eight MVP reports, each registered with `register_report(key, module="library",
  permission="library.reports.read", label_id, selector, csv)` (11-contracts §1.9), listed in the
  core reports hub under a Library heading and opened at `/library/reports/[key]`:

| Key | Contents | Filters | Print | CSV |
|---|---|---|---|---|
| `library_accession_register` | Every copy in accession order: number, title, authors, publisher, year, acquired on, source and note, price, location, status, withdrawn on and reason | accession range, acquired between, status, category | A4 landscape, ≤ 2,000 rows per print (a range is required above that) | yes |
| `library_circulation` | Loans in a period: issued on, member (number, name, group), book number, title, due, returned, days late, fine charged, renewals, issued by | period (required, ≤ 366 days), group, type, status | A4 landscape | yes |
| `library_overdue` | As of a date: member, group, book number, title, due, days late, fine so far, last reminded; grouped by member or by group | as of, group, days min, type | A4 portrait (class-wise lists for teachers) | yes |
| `library_fines_fees` | By kind in a period: charged, collected, waived, refunded, still open; then the lines | period, kind, type | A4 portrait | yes |
| `library_deposits` | As of a date, per member: expected, received, applied, refunded, held; total held (a liability); refunds in the period | as of, status (held/released), type | A4 portrait | yes |
| `library_stock_summary` | Copies by status × category × material type; value at price of copies not withdrawn; copies without a price | category, material type, location | A4 portrait | yes |
| `library_verification` | A verification's scope, counts, missing list with prices, items above ₹1,000 flagged, loss per 1,000 issued against the 5 per 1,000 norm | verification | A4 landscape | missing list |
| `library_no_dues` | Per member or per group as of a date: Clear / Not clear with reasons (books out, lost unpaid, dues ₹) | as of, group, status | A4 portrait list; certificates in bulk (LIB-13) | yes |

- FR-2 Every report screen shows its filters in the URL, totals for the **filtered** set, and the
  three empty states.
- FR-3 Viewing is not throttled; **CSV export** is throttled with `throttle_scope = "export"` applied
  in the handler where `?format=csv` is visible (the LED-04 lesson in CLAUDE.md: a screen opened at a
  counter must not share the export budget).
- FR-4 Prints use `window.print()` sheets with tenant branding only (LIB-13's rules).

### 2. User flows
Reports (hub) → Library → **Accession register** → range 1–2000 → **Print** → the browser's print
dialog → Save as PDF. Treasurer: **Fines and fees** → this financial year → **Download CSV**.

### 3. Features
**MVP:** the eight reports with filters, totals, print and CSV.
**Later** (research §8): member activity and never-borrowed members; most and least issued titles
(weeding: never issued in N years); withdrawn copies register; holds report (long queues, buy more);
study-space occupancy and revenue (§0.8).

### 4. Entities and relationships
Read-only over every library table, core `payments_allocation` (collected amounts by payment date),
`payments_held_deposit`, `ledger_reminder` (last reminded).

### 5. Database
No new table. Selectors in `apps/library/selectors/reports.py`. The accession register orders by
`accession_sort` (index exists); circulation by `(tenant_id, issued_on)`; fines by `(tenant_id,
kind, charge_date)`; collected amounts join allocations on `document_type = 'library_charge'` —
**new index** on core `payments_allocation (tenant_id, document_type, document_id)` only if
`EXPLAIN` shows the existing one does not serve (checked by T-LIB-12-5; an index change in core is
a core-track task, not a library migration).

### 6. API
| Method and path | Codename | Response |
|---|---|---|
| `GET /reports` (core) | as core | lists registered, permitted reports, including the eight |
| `GET /library/reports/{key}` | `library.reports.read` | `?filters&page&page_size≤200` → `{data: {columns: [{key, label_id, kind}], rows: [...], totals: {...}}, meta: {count, filters}}` |
| `GET /library/reports/{key}?format=csv` | `library.reports.read`; throttled with scope `export` in the handler | `text/csv; charset=utf-8` with BOM (Excel opens Devanagari correctly), filename `<key>-<date>.csv` |
| `GET /library/reports/{key}/print` | `library.reports.read` | the same rows unpaginated, capped at 2,000 (`409 library_print_too_large` with `details.count` above it) |

Money as 2-dp strings; dates ISO in JSON, `dd/mm/yyyy` in CSV (the existing export convention).
New code: `library_print_too_large` (409).

### 7. Frontend
- Routes `/library/reports` (the library's own index, same list as the hub's Library group) and
  `/library/reports/[key]` → `LibraryReportPageContent` (one generic page driven by `columns`), with
  per-report filter components in `components/reports/`.
- Print sheets in `features/library/print/`: `AccessionRegisterPrint`, `OverdueListPrint`,
  `VerificationReportPrint`, `NoDuesListPrint` (raw `table` allowed in the print directory, as
  `PaymentReceiptPrint.tsx` is).
- Service `api/libraryReportService.ts`; slice `libraryReportSlice` (lazy, keyed by report).

### 8. UI/UX
- Desktop: filters bar, totals strip, `UbDataGrid`; Print and Download CSV in the header.
  Phone: filters in a `UbDrawer`, rows as cards, the totals strip first; Print is offered (phones
  print to PDF) but the accession register suggests a computer for long ranges.
- Print sheets: tenant name and logo top left, report name and filters top right, page numbers,
  "Printed on {date}" — and nothing naming the product (LIB-13 FR-6).
- Empty: "No loans in this period." with **Change period**; error: retry + request id.

### 9. Validation and business rules
- BR-1 Periods are business dates, inclusive; circulation ≤ 366 days per request.
- BR-2 Fines and fees: **collected** = Σ allocations to library charges by payment date (voided
  payments excluded); **charged** = Σ amounts by charge date (reversed excluded); **waived** = Σ
  waivers of kinds `waiver`, `found`, `replaced` by date (reversed excluded); **refunded** = Σ
  `found_refund`; **open** = Σ `amount_due` as of the period end.
- BR-3 Deposits: from `deposits_for(module="library")`; the total held is labelled a liability
  ("money held for members, to be returned").
- BR-4 No dues evaluation is LIB-13 BR-4's.
- BR-5 Stock value = Σ `price` of copies not withdrawn; copies without a price are counted and listed,
  never valued at zero silently.

### 10. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| View, print, CSV | `library.reports.read` | ✅ | ✅ | ❌ | ✅ |

### 11. Reports
This feature is the reports.

### 12. Testing
- T-LIB-12-1 (unit) each selector against a fixture with known answers, including cancelled loans,
  reversed charges and voided payments (excluded).
- T-LIB-12-2 (unit) accession register order with suffixed numbers.
- T-LIB-12-3 (API) CSV has a BOM, `dd/mm/yyyy` dates, and the export throttle applies to CSV only.
- T-LIB-12-4 (invariant) fines and fees: for any period, charged − waived − refunded equals Σ of the
  ledger lines of the `library_charge` and `library_waiver` sources dated in it, and for the period
  end, charged − collected − waived (all time, not reversed) equals Σ open `amount_due`.
- T-LIB-12-5 (performance) `EXPLAIN` for circulation over a year and the fines collected join.
- E2E `13-reports`: open each of the eight; totals equal the harness's own arithmetic; print the
  accession register with `emulateMedia({media: 'print'})`; download a CSV and parse it. Shots: each
  report (empty, filled) and the four print sheets — four widths, measuring checks.

### 13. Edge cases
- EC-1 A 50,000-copy register: the screen pages; print requires a range ≤ 2,000; CSV streams.
- EC-2 Devanagari titles in CSV: UTF-8 with BOM.
- EC-3 A report opened with the module off: 403 `module_disabled`; the hub does not list it.

### 14. Future
The later reports above; scheduled report emails are out (DEC-012: nothing is emailed).

---

## LIB-13 — Documents: membership card, overdue notice, no-dues certificate, fine receipt

### 1. Product requirements
Four things leave the library in a member's hand, and each carries the **library's** name, logo and
colours only — never the product's name or domain (CLAUDE.md; vision §4). All are client-side print
sheets through `window.print()` (ADR-021: no server PDF), shared as PDF or as prepared text.

- FR-1 **Membership card**: CR80 (85.6 × 54 mm) single card, and an A4 sheet of ten (2 × 5, with crop
  marks) for a class or a batch. It shows the library's logo and name, the member's name, member
  number (large, monospace), type, valid until (or "No expiry"), group label, the guardian's name for
  a child, and a **QR code of the member number** drawn from `apps/common/qr.py` (`encode`,
  `matrix_rows`), which a 2D wedge scanner reads straight into the counter. The QR encodes the member
  number **only** — no URL, so no domain.
- FR-2 **Overdue notice**: A5 letter to the member (or the guardian): the books (title, number, due,
  days late), fine so far, "Please return by {date}" (7 open days ahead by default), signature line
  "Librarian". Its text twin is LIB-09's WhatsApp message.
- FR-3 **No-dues certificate**: A5, only when the member is clear (BR-4): "This is to certify that
  {name} ({member number}, {group}) has returned all books of {library} and has no dues as on
  {date}." with a reference `NDC-{member number}-{yyyymmdd}`, signature and seal lines. When not
  clear the page shows why and **no certificate** (a false certificate is worse than none).
- FR-4 **Fine or fee receipt**: the core A5 payment receipt (`PaymentReceiptPrint`) — no library
  receipt document (research §9.2). Its allocation lines print the charge number and label
  ("FIN/26-27/0012 · Overdue fine – Wings of Fire (4513), 3 days") through the target summary's
  `label` (C5). Deposit receipts and refund vouchers are the core receipt and payment-made voucher
  for the `held_deposit` targets, labelled "Library deposit – M-0043".
- FR-5 **Issue slip** (optional, LIB-06 FR-11): 80 mm or A6, books and due dates.
- FR-6 Every sheet is covered by `src/tests/customerDocumentsCarryNoProductName.test.tsx`: rendered
  with a branding row whose `appName` is "YourKhata", the HTML contains neither "YourKhata", nor
  "DigiKhaato", nor "yourkhata.com".

### 2. User flows
Member page → **Print card** → preview (front) → Print → `card_issued_on` set on the first print.
Members list → select a group "9-B" → ⋯ → **Print cards (32)** → A4 sheets. Member page → ⋯ →
**No-dues certificate** → clear → Print; not clear → "Asha still has 1 book out (Godaan, due 10 Oct)
and owes ₹12" with links. Overdue list → member → ⋯ → **Print notice**.

### 3. Features
**MVP:** card (single, A4 sheet), overdue notice, no-dues certificate (single and bulk for a group),
receipts through core, issue slip.
**Later:** photo on the card; back of the card with library rules; 1D barcode on the card (Code 128,
ADR if a package); copy labels with QR; share links for documents (`parties_share_link`, CR-131) —
the member self-view (D11).

### 4. Entities and relationships
Read: `library_membership`, `library_loan`, `library_charge`, `parties_relation`, core branding and
the tenant business block. Write: `library_membership.card_issued_on`; audit rows.

### 5. Database
No new table. `card_issued_on` exists (LIB-04). Certificate issuance is audited
(`library.no_dues.issued` with the reference), not stored in a table: the certificate is
reproducible from the state on its date and the audit row proves it was issued.

### 6. API
| Method and path | Codename | Response | Errors |
|---|---|---|---|
| `GET /library/members/{id}/card` | `library.member.read` | `{business: {name, legal_name, phone, address}, member: {name, member_number, type, valid_until, group_label, guardian_name}, qr: {modules: ["1010…", …]}}` | |
| `GET /library/cards?ids=…\|group=…` | `library.member.read` | `{business, cards: [same]}` (≤ 50 per request) | 400 `too_many_ids` |
| `POST /library/members/{id}/card/printed` | `library.member.write` | sets `card_issued_on` if null; audit `library.card.printed` | |
| `GET /library/members/{id}/overdue-notice` | `library.loan.read` | `{business, recipient: {name, is_guardian}, member, loans: [...], fine_so_far_total, return_by}` | 409 `library_nothing_overdue` |
| `GET /library/members/{id}/no-dues` | `library.member.read` | `{clear: bool, as_on, reference?, member, reasons: [{code: "books_out"\|"lost_unpaid"\|"dues", count?, amount?, items?}]}`; audit `library.no_dues.issued` when `clear` and `?issue=1` | |
| `GET /library/no-dues?group=…` | `library.member.read` | bulk evaluation for a group | |

Branding (logo, colours) comes from the shared `PrintBranding` fetch (C9), exactly as the core receipt
gets it; the business block is the server's (`apps/payments/serializers/payment.py:151-161` shape).

### 7. Frontend
- Print routes (inside `(app)`, print stylesheet): `/library/members/[id]/card`,
  `/library/print/cards?group=…`, `/library/members/[id]/overdue-notice`,
  `/library/members/[id]/no-dues`, `/library/print/no-dues?group=…`.
- Print components in `features/library/print/`: `MembershipCardPrint` (CR80),
  `MembershipCardSheetA4`, `OverdueNoticePrint` (A5), `NoDuesCertificatePrint` (A5), `IssueSlipPrint`
  (80 mm / A6). The QR is `UbQrCode` from the design system (moved from `features/sales`, C9).
- Service `api/libraryDocumentService.ts`; no slice (a print page fetches once in its hook).

### 8. UI/UX
- Card: logo ≤ 10 mm high; name `ds-h3` equivalent in print units, wrapping to two lines rather than
  truncating (a card with half a name is useless at a school gate); member number in monospace
  ≥ 4 mm high; QR 20 × 20 mm with its quiet zone, `flex-shrink: 0` (the payment receipt's QR was
  squeezed unscannable in a narrow column once, `UbQrCode.tsx` comment); the tenant's brand colour as
  a 3 mm band, contrast-checked with text on it.
- Notice and certificate: A5 portrait, 12 mm margins, the library's address block, date top right;
  Hindi versions when the tenant's message locale is `hi` (the certificate body in ordinary Hindi:
  "प्रमाणित किया जाता है कि {name} ({number}) ने {library} की सभी किताबें लौटा दी हैं और {date} तक उन पर
  कोई बकाया नहीं है।").
- On screen the print pages show a preview at 100 % with **Print** and **Back**; the controls are
  `print:hidden`.

### 9. Validation and business rules
- BR-1 The QR payload is exactly `member_number` (UTF-8 bytes; `choose_version` picks v1–v2 for
  ≤ 24 chars); the counter's lookup resolves it (LIB-02 BR-8).
- BR-2 No document shows the product's name, logo or domain; the only name is the tenant's
  (`legal_name` or `name`).
- BR-3 `return_by` on the notice = the 7th open day after today (`next_open_day` repeated).
- BR-4 **Clear for no dues** as on date D: no loan `open`; no `lost` loan whose `lost_book` charge has
  `amount_due > 0`; Σ `amount_due` of the membership's library charges = 0. A held deposit does not
  prevent clearance (it is returned at closure); the certificate may state "Deposit ₹500 held, to be
  refunded on closing" when one is held.
- BR-5 A certificate reference is deterministic (`NDC-M-0043-20270331`), so reprinting on the same day
  gives the same reference; each issue is audited.

### 10. Permissions
| Document | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Card (single and sheet) | `library.member.read` (print) / `library.member.write` (mark printed) | ✅ | ✅ | ✅ | ✅ (print only) |
| Overdue notice | `library.loan.read` | ✅ | ✅ | ✅ | ✅ |
| No-dues certificate | `library.member.read` | ✅ | ✅ | ✅ | ✅ |
| Receipts | core `payments.payment.read` | ✅ | ✅ | ✅ | ✅ |

### 11. Reports
The no-dues report (LIB-12) is the list form; bulk certificates print from it.

### 12. Testing
- T-LIB-13-1 (unit, backend) the card's QR matrix decodes to the member number with an independent
  decoder where one is installed (the `apps/common/qr.py` test approach); it contains no `http`.
- T-LIB-13-2 (unit) no-dues evaluation for each reason and the clear case.
- T-LIB-13-3 (component) `customerDocumentsCarryNoProductName.test.tsx` extended with the card, the
  A4 sheet, the notice, the certificate, the issue slip and a receipt with library allocation labels.
- T-LIB-13-4 (component) a not-clear member renders reasons and no certificate text.
- T-LIB-13-5 (component) a 40-character name wraps on the card and no text node overflows its box.
- E2E `14-documents`: print pages captured with `emulateMedia({media: 'print'})` for card, sheet,
  notice, certificate (clear and not clear); assert the rendered HTML has no product name; measure
  the card's QR box is 20 mm ± 0.5 mm at print. Shots at four widths (screen) plus print captures.

### 13. Edge cases
- EC-1 No logo: the name alone, larger.
- EC-2 A member number longer than 12 characters: the QR stays v2; the printed number wraps.
- EC-3 A closed member asks for a no-dues certificate years later: evaluated as on today; clear if
  nothing is owed.
- EC-4 Printing on a phone: the browser's print-to-PDF; the card page offers "Share PDF" through the
  browser's own share sheet where available, never a product-hosted link.

### 14. Future
Photos on cards; card backs; 1D barcodes; QR copy labels; share links through `parties_share_link`
(CR-131) with a public `/d/<token>` page that names only the tenant; member self-view (D11).

---

## LIB-14 — Roles and permissions

### 1. Product requirements
The librarian runs the library; the assistant works the counter; volunteers change weekly and each
needs a login with limited rights (research §2, Farida); the committee's treasurer reads the money.
The platform's four roles serve all of them — **librarian = admin**, **assistant = staff**,
**treasurer = accountant**, the owner is the owner — with library codenames in the one registry
(`apps/common/permissions_registry.py`), and two capabilities an owner may hand to a trusted assistant:
**waiving** and **overriding a block**. No module role is needed (ADR-052 is for row scoping, which
the library does not do).

- FR-1 Sixteen codenames, format `<module>.<resource>.<action>` (canon §0.9), declared once in
  `PERMISSIONS`; `MODULE_OF` maps them to `library`, so switching the module off removes them from
  every member (`permissions_for`).
- FR-2 The role sets follow the table in §10; `_ADMIN` and `_ACCOUNTANT` gain theirs automatically
  (admin is owner minus `platform.tenant.manage`; accountant is every `.read`), `_STAFF` lists its
  seven explicitly.
- FR-3 **Delegable** (codenames off for staff, grantable per member through
  `Membership.permissions_override.allow`): `library.loan.override`, `library.charge.waive` — the
  two the brief names — and, if an owner chooses, `library.loan.adjust`, `library.copy.withdraw`.
- FR-4 **Not delegable** (role checks, 10-architecture §5; the LED-03 distinction CLAUDE.md records):
  a waiver above the waiver ceiling (D27); a deposit refund (D28, C6). No `permissions_override`
  can grant either.
- FR-5 The team screen's permission editor groups library codenames under "Library", shown only when
  the module is on, with plain labels ("Can waive fines and fees").
- FR-6 Every write names its codename in the viewset and is audited with `library.<entity>.<verb>`.
- FR-7 Canon §0.9 gains the sixteen codenames through a CR (the permission-registry test asserts
  equality with canon, `permissions_registry.py:1-6`).

### 2. User flows
**Delegate waiving (owner).** Settings → Team → Ravi (staff) → Permissions → Library → tick "Can
waive fines and fees (up to ₹100)" → Save → Ravi's next request carries the codename; a ₹250 waiver
by Ravi is refused "Waivers above ₹100 need the owner or an admin."

**Volunteer login (admin).** Team → Add member → role Staff → the temporary password is shown once and
sent by WhatsApp by hand (DEC-012) → the volunteer sees Counter, Books, Members, Library, Holds,
Stock check; no settings, reports or waivers.

### 3. Features
**MVP:** codenames, role sets, delegation of the four, two role checks, grouped permission editor,
audit.
**Later:** tenant-defined custom roles (PLT-12) with a "Library volunteer" preset; row scoping by
branch when branches exist.

### 4. Entities and relationships
Core `platform_role`, `platform_membership.permissions_override`; no library table.

### 5. Database
No table. `PERMISSIONS` gains the strings below; `_STAFF` gains seven.

### 6. API
No endpoint of its own. `GET /permissions/me` (core) lists library codenames when the module is on.
Refusals: 403 `permission_denied` (`details.permission`), 403 `library_waiver_over_ceiling`
(`details.ceiling`); refund without role → 403 `permission_denied` with `details.reason =
"role_required"`.

### 7. Frontend
`PermissionCode` union (`src/types/domain.types.ts`) gains the sixteen; nav rows and buttons gate on
them through `usePermissions()`; the team permission editor reads group labels from the library
catalogue (`library.permission.<codename>`).

### 8. UI/UX
Actions a member cannot take are **not rendered** (the in-app rule: nothing unbuilt, nothing
unusable); where an action is visible but limited (a waiver above the ceiling), the refusal is inline
in the dialog with who can do it.

### 9. Validation and business rules
**The codenames**

| # | Codename | What it allows |
|---|---|---|
| 1 | `library.catalogue.read` | browse titles, copies, categories, locations |
| 2 | `library.catalogue.write` | add and edit titles and copies; categories, locations; repair; import copies |
| 3 | `library.copy.withdraw` | withdraw a copy |
| 4 | `library.member.read` | see members, charges, deposits; print cards and certificates |
| 5 | `library.member.write` | enrol, edit, renew, change type, re-join; receive a deposit; import members |
| 6 | `library.member.close` | suspend, reactivate, close; apply a deposit (refund also needs the role) |
| 7 | `library.loan.read` | see loans, holds, overdue; library home and dashboard section |
| 8 | `library.loan.write` | issue, return (today), renew, cancel issue, holds, mark found |
| 9 | `library.loan.override` | override an overridable block (delegable) |
| 10 | `library.loan.adjust` | change a due date, backdate a return, mark lost, replace, import books out |
| 11 | `library.charge.waive` | waive a library charge up to the ceiling (delegable) |
| 12 | `library.charge.write` | manual charges; reverse a charge raised in error; raise a damage amount |
| 13 | `library.verification.run` | start, scan, close a stock check |
| 14 | `library.verification.close` | reopen; mark missing; void others' scans |
| 15 | `library.reports.read` | the eight reports, print, CSV |
| 16 | `library.settings.manage` | library settings, types, loan rules, library holidays, numbering |

- BR-1 Order of checks on every endpoint: authentication → `ModuleEnabled("library")` → `PlanLimit`
  (none for library) → `HasPermission(codename)` → role checks inside the service.
- BR-2 Money moved by the library's own endpoints needs the core payments codename as well when a
  payment is recorded (`payments.payment.write` for Collect, Take payment, refund payments).
- BR-3 Reminders need the core `ledger.reminder.write`.

### 10. Permissions
| Codename | owner | admin (librarian) | staff (assistant, volunteer) | accountant (treasurer) |
|---|---|---|---|---|
| `library.catalogue.read` | ✅ | ✅ | ✅ | ✅ |
| `library.catalogue.write` | ✅ | ✅ | ✅ | ❌ |
| `library.copy.withdraw` | ✅ | ✅ | ❌ (grantable) | ❌ |
| `library.member.read` | ✅ | ✅ | ✅ | ✅ |
| `library.member.write` | ✅ | ✅ | ✅ | ❌ |
| `library.member.close` | ✅ | ✅ | ❌ | ❌ |
| `library.loan.read` | ✅ | ✅ | ✅ | ✅ |
| `library.loan.write` | ✅ | ✅ | ✅ | ❌ |
| `library.loan.override` | ✅ | ✅ | ❌ (grantable) | ❌ |
| `library.loan.adjust` | ✅ | ✅ | ❌ (grantable) | ❌ |
| `library.charge.waive` | ✅ | ✅ | ❌ (grantable) | ❌ |
| `library.charge.write` | ✅ | ✅ | ❌ | ❌ |
| `library.verification.run` | ✅ | ✅ | ✅ | ❌ |
| `library.verification.close` | ✅ | ✅ | ❌ | ❌ |
| `library.reports.read` | ✅ | ✅ | ❌ | ✅ |
| `library.settings.manage` | ✅ | ✅ | ❌ | ❌ |
| Waiver above the ceiling (role) | ✅ | ✅ | never | never |
| Deposit refund (role) | ✅ | ✅ | never | never |

### 11. Reports
The audit log (core) lists every override and waiver with actor and reason; no library report.

### 12. Testing
- T-LIB-14-1 (architecture) the registry equals canon §0.9 including the sixteen; every library
  viewset action declares a codename that exists (the permission-registry test).
- T-LIB-14-2 (unit) role sets: staff has exactly the seven; accountant has the four `.read`; admin
  has all sixteen.
- T-LIB-14-3 (unit) module off → `permissions_for` returns no `library.*`.
- T-LIB-14-4 (API matrix) every endpoint × role, generated from the §6 tables of LIB-01 to LIB-13:
  allowed → 2xx/4xx-business, denied → 403; the test asserts **who is signed in** before asserting
  the status (the CLAUDE.md harness lesson).
- T-LIB-14-5 (unit) a staff member granted `library.charge.waive` waives ₹100 (ok) and ₹101 (403
  `library_waiver_over_ceiling`); granted `library.member.close`, cannot refund.
- E2E `15-permissions`: owner, staff and accountant contexts, each its own browser context, each
  asserting the signed-in name first; staff sees the seven-codename surface and no Settings,
  Reports, Waive or Override; accountant sees Reports and no Counter. Shots: the nav at four widths
  for each role, the team permission editor's Library group.

### 13. Edge cases
- EC-1 A staff member with `library.loan.override` granted, overriding an expired membership: still
  refused (expired is not overridable, LIB-04 BR-10).
- EC-2 An owner removes `library.loan.write` from a staff member mid-shift: the next request is 403;
  the counter shows "You can no longer issue books. Ask the owner." and keeps the session list.
- EC-3 The only admin leaves: the owner holds everything; nothing in the library needs a second
  person.

### 14. Future
Custom roles with a volunteer preset (PLT-12); a per-member waiver ceiling; branch-scoped librarians.

---

## Implementation task list

Ordered backend, then frontend, then end-to-end, then release. Sizes: **S** ≤ half a day, **M** one
to two days, **L** three to five days (one agent, with tests). Core and engine items are cited by
their Wave A names in 10-architecture §13.1 (`A1` … `A11`) and the 11-contracts section; the core FRD
`frd/00-core-and-engines.md` (being written in parallel) carries the same items. Contract questions
(§0.7) that block a task are named. **The library MVP needs no engine**: A5 (document port) is not a
dependency.

### Prerequisites owned by the core track

| Core item | What the library needs from it | Blocks |
|---|---|---|
| **A1** release gate (11-contracts §1.1) | `ModuleCode.LIBRARY`, `UNRELEASED_MODULES`, `MODULE_DEPENDENCIES`, `ENGINES_USED_BY` | B01 |
| **A2** ledger bucket, posting registry, `CHARGE` / `ADJUSTMENT_CREDIT` (§1.2) | `register_posting_source`, the two entry types | B10 |
| **A3** party caches (§1.3) | `party.deposit_held` | B07 |
| **A4** payments: target protocol v2, held deposits, adjustment mode (§1.4) | `register_target` v2 (`bucket`, `auto`), `open/receive/apply/refund_deposit` | B07, B10 |
| **A6** party roles, relations, archive guards (§1.3) | `register_party_role`, `parties_relation`, `register_archive_guard` | B07 |
| **A7** reminders: source link, notices, policy (§1.6) | `register_reminder_source`, `register_reminder_policy`, `check_reminder_allowed`; plus **C3** `record_source_reminders` | B12 |
| **A8** counters and number kinds (§1.7) | `register_number_kind`, `allocate_counter`, `peek_counter`, `raise_counter` | B03, B04 |
| **A9** calendar, recurrence, periods, rounding (§1.8) | `is_open`, `next_open_day`, `closed_days_between`, `round_amount`; the closed-days endpoint and **C8**; FE `features/calendar` (**C9**) | B08, B10, F02 |
| **A10** registries: schedules, dashboard, reports, notifications (§1.9) | `register_schedule`, `register_dashboard_section`, `register_report`, `register_notification_type`; plus **C4** templates | B11, B12, B14, B15 |
| **A11** import test (10-architecture §10.1) | the `library` row, the whole-AST test; plus **C1** (`reports.registry`, `imports.registry`) | B01 |
| imports registry fixes (**C2**) | idempotent `register`, example key per spec | B17 |
| target `summary().label` (**C5**) | receipt lines | B10, F12 |
| FE moves (**C9**) | `UbQrCode` to the design system, `PrintBranding` to `src/print/` (Wave A task A16, R33), `features/parties/modulePanels.ts`, `features/reports/dashboardSections.ts` | F00 |

### Backend

| # | Task | Size | Depends on |
|---|---|---|---|
| B01 | `apps/library` skeleton: `AppConfig` with an empty `ready()`, `urls.py` included at `library/`, `tenant_data.py`, `0001_initial` carrying the code; the import-matrix row and whole-AST test passing; `UB_UNRELEASED_MODULES` honoured | S | A1, A11, C1 |
| B02 | Sixteen codenames and role sets; every new error code in `apps/common/error_codes.py` (Appendix A) and Part 22 §22.1.1; `AuditAction` constants; canon §0.9 CR drafted | S | B01 |
| B03 | `library_settings` model, preset seed on switch-on, module-off counter, settings API, number kinds registered, numbering raise endpoint (LIB-01) | M | A8, B02 |
| B04 | Pure helpers: ISBN-10/13 validation and conversion, `accession_sort`, code classification for lookup (LIB-02 BR-4, BR-8) | S | B01 |
| B05 | Catalogue models and migration (category, location, title with generated `search_text` and GIN trigram index, copy, copy event); services (create title with copies, add copies, patch, withdraw, repair, back to shelf); title caches; `manage.py library_recount`; API; `GET /library/lookup` (LIB-02) | L | B03, B04, A8 |
| B06 | Membership types and loan rules: models, rule resolution, API (LIB-04 §5, LIB-05) | M | B03 |
| B07 | Membership and period models; enrol (party create or link, guardian relation, fee charges, `open_deposit`, collect-now two payments), renew, change type, suspend/reactivate, close (apply, refund with role check), re-join, deposit wrappers; party role, archive guard, party-panel data; member list and detail API with `MemberSummary` and blocks (LIB-04) | L | A3, A4, A6, B06, B10 |
| B08 | Due-date service over the core calendar; `due-on`, `shift-due`, `due-date-preview` endpoints (LIB-05) | S | A9, B06 |
| B09 | Loan and loan-event models (partial unique open-loan index, overdue and returned indexes); issue, return, renew, renew-all, cancel, change-due services with the lock order, blocks, overrides and idempotency; loans API; query-budget tests (LIB-06) | L | B05, B07, B08, B10 |
| B10 | Charges and waivers: models; posting-source and target registrations; source resolvers; the pure fine calculator with the twelve worked examples; waive (ceiling role check), reverse, manual charge, lost, found (refund per C12), replace, damage (LIB-07) | L | A2, A4, A8, A9, B03, C5 |
| B11 | Holds: model, place, allot on return, set aside, cancel, extend, move; `library.expire_holds` schedule and `manage.py library_expire_holds --date` for operators and the harness (added to `test_operator_surface.py`'s set) (LIB-08) | M | A10, B09 |
| B12 | Reminders: `library_loan` and `library_hold` candidate sources, policy, templates (C4), overdue list, preview, remind, bulk prepare, hold remind; the two notification types and the daily `library.overdue_today` job (LIB-09) | M | A7, A10, C3, C4, B09, B11 |
| B13 | Stock verification: models, start, scan classification, void, close with set-based counts, reopen once, mark missing, withdraw missing, results (LIB-10) | M | B05, B09 |
| B14 | Dashboard selector, `register_dashboard_section`, `GET /library/home` (LIB-11) | S | A10, B09, B10, B11 |
| B15 | Eight report selectors, CSV writers, print endpoints, `register_report`, export throttle on CSV only (LIB-12) | M | A10, B09, B10, B13 |
| B16 | Document payloads: card with QR matrix (`apps/common/qr.py`), bulk cards, overdue notice, no-dues evaluator and audit (LIB-13) | S | B07, B09, B10 |
| B17 | Importers `library_copies`, `library_members`, `library_open_loans` (LIB-03) | M | C1, C2, B05, B07, B09 |
| B18 | Cross-cutting suites: replay tests (title caches, charge caches, held deposits with library subjects), the target and posting-source contract suites, fuzzed invariants (T-LIB-07-9, T-LIB-08-4), `EXPLAIN` plans, the permission matrix (T-LIB-14-4) | M | B09–B13 |

### Frontend

| # | Task | Size | Depends on |
|---|---|---|---|
| F00 | Core-track moves consumed by the library (C9 → R33, **Wave A task A16**): `UbQrCode` → design system, `PrintBranding` → `src/print/`, `features/calendar` `ClosedDaysEditor`, the two frontend registries; `MODULE_CODES` replaced by the server's list with an equality test (10-architecture §6 item 3) | M | A6, A9, A10 (FE parts) |
| F01 | `features/library` skeleton: types, `api/libraryMapping.ts`, `ROUTES.library`, guarded prefix, `CRAWL_DISALLOW`, eight nav rows, `library.{en,hi}.json` catalogue and `catalogues.json` entry, the ESLint `no-restricted-imports` zone, `useLibraryListUrl` | S | F00, B01 |
| F02 | Library settings page: five tabs, types editor, loan rules table, weekly days and holidays with the move-due dialog, fines and lost, holds and reminders; `librarySettingsSlice`; schemas (LIB-01, LIB-04, LIB-05) | M | F01, B03, B06, B08 |
| F03 | Catalogue: titles list, title page, copies list, copy page, add-book and add-copies drawers (`dynamic()`), withdraw dialog, categories and locations managers; slices; invalidations (LIB-02) | L | F01, B05 |
| F04 | Members: list, member page with tabs, enrol form with collect blocks, renew, change type, suspend, close stepper, re-join; party-page Library panel; slices (LIB-04) | L | F01, B07 |
| F05 | The counter: scan box, mode chips, shortcuts, `useCounterFocus`, queue thunk, member search, member panel, rows, override prompt, return with fine, take payment (core drawer), waive, damage, hold banner, renew and renew-all, undo, finish and slip, beep, session persistence; idle preload of dialogs (LIB-06) | L | F04, B09, B10, B11 |
| F06 | Charges UI: charges tab, waive, mark lost, found, damage, manual charge, reverse, collect several (LIB-07) | M | F04, B10 |
| F07 | Holds page, place-hold dialog, title queue (LIB-08) | S | F03, B11 |
| F08 | Overdue page, reminder sheet, bulk sender (LIB-09) | M | F04, B12 |
| F09 | Stock check: list, scan screen (reusing the counter's box and queue), results, mark and withdraw missing (LIB-10) | M | F05, B13 |
| F10 | Dashboard section and library home (LIB-11) | S | F00, B14 |
| F11 | Report pages and four print sheets (LIB-12) | M | F01, B15 |
| F12 | Documents: card, A4 card sheet, overdue notice, no-dues certificate, issue slip; extend `customerDocumentsCarryNoProductName.test.tsx` (LIB-13) | M | F00, B16, C5 |
| F13 | Gates: `lazySlices.test.ts` covers every library slice; `npm run build && npm run bundle:check` shows no movement of the `sharedApp` budget; `i18n:split` and `i18n:check` clean | S | F02–F12 |

### End to end

| # | Task | Size | Depends on |
|---|---|---|---|
| E01 | `e2e/library.mjs` skeleton: the `ledger.mjs` shape (results table, exit code), owner, staff and accountant each in **their own browser context** asserting who is signed in first; data seeded **through the API only**; `SIZES` = 360×780, 768×1024, 1280×800, 1440×900; a `measure(page)` helper implementing both checks (page `scrollWidth − clientWidth ≤ 1`; no leaf text node, `sr-only` excluded, with `scrollWidth − clientWidth > 1`); `--shots` into `/tmp/e2e-shots/library/<screen>` | S | the live stack (`./e2e/serve-api.sh && ./e2e/serve.sh`) with `UB_UNRELEASED_MODULES=1` |
| E02 | Checks `01-switch-on` … `15-permissions` as listed in each feature's §12, asserting the **network** and the database-visible result, not only the controls (the PTY-02 lesson) | L | E01, F02–F12 |
| E03 | The shot sweep: every screen in each listed condition at four widths, with `measure()` on every shot, plus print captures with `emulateMedia({media: 'print'})` for the card, card sheet, notice, certificate, accession register and verification report | M | E02 |
| E04 | Register `library.mjs` in `e2e/run-regression.mjs`; record its check count for the CLAUDE.md gate line at release | S | E02 |

### Release (after QA, by CR)

| # | Task | Size | Depends on |
|---|---|---|---|
| T-R1 | Release CR: remove `library` from `UNRELEASED_MODULES`; data migration adding it to `MVP_MODULES` and to every partner whose `allowed_modules ⊇` the previous MVP set (10-architecture §2.4) | S | E04 |
| T-R2 | Landing: `features/landing/config/modules.ts` status to live and real recordings added (vision §4; no invented screenshots) | S | T-R1 |
| T-R3 | Onboarding "Library or reading room" business type, the module checklist and `nav.primary_module` (shared-engines §5.2–5.4), core-owned, shipping with the first released vertical (10-architecture §13.2 item 5) | M | T-R1 |

Critical path: A1/A11 → B01 → B03 → B05 → (A2, A4) B10 → B07 → B09 → B11 → F05 → E02. The counter
(F05) and the charges (B10) are the long poles; everything else can run beside them.

---

## Appendix A — New error codes

All registered in `apps/common/error_codes.py` and Part 22 §22.1.1 by B02.

| Code | HTTP | `details` | Feature |
|---|---|---|---|
| `library_accession_taken` | 409 | `number`, `copy_id`, `title` | LIB-02 |
| `library_accession_frozen` | 409 | `copy_id` | LIB-02 |
| `library_code_ambiguous` | 409 | `code`, `matches` | LIB-02 |
| `library_copy_on_loan` | 409 | `loan_id` | LIB-02 |
| `library_copy_unavailable` | 409 | `status`, `with?`, `held_for?` | LIB-02, LIB-06 |
| `library_title_has_copies` | 409 | `count` | LIB-02 |
| `library_category_in_use` | 409 | `count` | LIB-02 |
| `library_location_in_use` | 409 | `count` | LIB-02 |
| `library_membership_exists` | 409 | `membership_id`, `status` | LIB-04 |
| `library_member_number_taken` | 409 | `number`, `membership_id` | LIB-04 |
| `library_membership_closed` | 409 | `closed_on` | LIB-04 |
| `library_membership_has_loans` | 409 | `count` | LIB-04 |
| `library_membership_inactive` | 409 | `effective_status`, `valid_until` | LIB-06 |
| `library_member_blocked` | 409 | `blocks`, `override_permission` | LIB-06 |
| `library_copy_not_loanable` | 409 | `material_type`, `overridable` | LIB-06 |
| `library_copy_not_on_loan` | 409 | `status`, `offer_found` | LIB-06 |
| `library_renewal_refused` | 409 | `reason`, `overridable` | LIB-06 |
| `library_cancel_window_passed` | 409 | `issued_on` | LIB-06 |
| `library_calendar_all_closed` | 409 | — | LIB-05 |
| `library_loan_not_open` | 409 | `status` | LIB-07 |
| `library_charge_not_open` | 409 | `status` | LIB-07 |
| `library_charge_has_payments` | 409 | `payment_ids` | LIB-07 |
| `library_waiver_over_ceiling` | 403 | `ceiling` | LIB-07 |
| `library_hold_refused` | 409 | `reason` | LIB-08 |
| `library_hold_not_open` | 409 | `status` | LIB-08 |
| `library_nothing_overdue` | 409 | — | LIB-09, LIB-13 |
| `library_verification_closed` | 409 | — | LIB-10 |
| `library_verification_open` | 409 | — | LIB-10 |
| `library_verification_reopen_used` | 409 | — | LIB-10 |
| `library_print_too_large` | 409 | `count`, `max` | LIB-12 |

Reused core codes: `validation_error`, `not_found`, `permission_denied`, `module_disabled`,
`stale_version`, `idempotency_conflict`, `too_many_ids`, `sequence_backwards`, `over_allocated`,
`deposit_insufficient`, `deposit_released`, `party_has_open_records`, `module_has_data`,
`reminder_cap_reached`, `reminder_outside_window`.

## Appendix B — Audit actions

`library.settings.updated`; `library.title.created|updated|archived|restored`;
`library.copy.created|updated|withdrawn|repaired|back_to_shelf|found|marked_missing`;
`library.category.created|updated|merged|deleted`; `library.location.created|updated|deleted`;
`library.membership_type.created|updated`; `library.loan_rules.updated`;
`library.membership.enrolled|updated|renewed|type_changed|suspended|reactivated|closed|rejoined`;
`library.loan.issued|returned|renewed|cancelled|due_changed|lost|replaced|overridden|imported`;
`library.charge.created|waived|reversed|status_changed`;
`library.hold.placed|ready|set_aside|collected|expired|cancelled|extended|moved`;
`library.verification.started|closed|reopened|missing_marked|missing_withdrawn`;
`library.card.printed`; `library.no_dues.issued`. Core actions written through library flows:
`deposit.opened|received|applied|refunded`, `payment.recorded|voided`, `counter.raised`,
`reminder.sent`.

## Appendix C — Traceability from the research

| Research section | Where it is specified |
|---|---|
| §0 findings (Koha rule matrix, stock-take, GFR norms, public-library rules) | LIB-05, LIB-07 worked examples, LIB-10 BR-4/BR-5 |
| §1 use cases 1–11 | LIB-02, LIB-04, LIB-06, LIB-07, LIB-08, LIB-09, LIB-10, LIB-13 |
| §1 use case 12, §3.12, §4.14, §15.4 (study spaces) | §0.8 (future, engines) |
| §3.1 first set-up | LIB-01, LIB-03 |
| §3.2–3.11 workflows | LIB-02 … LIB-10 |
| §4.1–4.13 entities | LIB-02 §5, LIB-04 §5, LIB-05 §5, LIB-06 §5, LIB-07 §5, LIB-08 §5, LIB-10 §5; §4.11 deposit → core (ADR-044); §4.12 calendar → core (ADR-055) |
| §5 CRUD | each feature's §2 and §6 |
| §6 business rules | LIB-05 §9, LIB-06 §9, LIB-07 §9, LIB-08 §9, LIB-04 §9 |
| §7 dashboard | LIB-11 |
| §8 reports | LIB-12 |
| §9 documents | LIB-13 |
| §10 payments | LIB-04, LIB-07 (ADR-044, ADR-047, ADR-048) |
| §11 search | LIB-02 FR-9/FR-10 |
| §12 roles | LIB-14 |
| §13 edge cases 1–20 | each feature's §13 |
| §14 validations | each feature's §9 |
| §15 reuse | §0.4 |
| §16 MVP vs later | §0.2 and each feature's §3 and §14 |
| §17 open questions 1–13 | §0.6 D1–D13 |
