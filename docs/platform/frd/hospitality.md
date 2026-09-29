# Hotel & stays (`hospitality`): functional requirements

Status: **DRAFT FOR REVIEW, 29 Sep 2026 (Phase 3, module documentation).** Written by the BA for the
architecture owner and the implementing agents. It writes no code. It is bound by, in this order:
[00-platform-vision.md](../00-platform-vision.md), [10-architecture.md](../10-architecture.md),
[11-contracts.md](../11-contracts.md), ADR-041 to ADR-055 in
[Part 38](../../38-architecture-decision-records.md), and `CLAUDE.md`. Its main input is
[research/hospitality.md](../research/hospitality.md) (cited as *research §n*), with
[research/shared-engines.md](../research/shared-engines.md) §3 for the bookings engine.

Where this FRD needs something 11-contracts does not give, it does **not** change the contract: the
need is written as a question in [Contract questions](#contract-questions) and the feature says what
it does until the architecture owner answers. Tax and legal readings are for a chartered accountant
and a lawyer to confirm ([Tax/legal review items](#taxlegal-review-items)); the product implements
what they say.

**Scope.** Small hotels, lodges, guest houses, homestays and hostels with dormitory beds: about 1 to
40 rooms, one property, one GSTIN, a front desk that is often the owner (research §2). Monthly PG
accommodation is not this module (research, "the PG question").

**How to read.** §0 holds what every feature shares: the module map, the cross-cutting rules
(business date, lock order, money), the permissions matrix, error codes, audit actions, jobs and the
frontend map. Each feature HTL-01 to HTL-19 then follows the vision §7 template, all 14 sections.
A feature's §5 gives the full definition of every table it **owns**; a table another feature owns is
cited by name. Feature IDs, codenames, error codes and table names are normative. Line references
to code are at commit `30798d2`.

---

## 0. Module overview

### 0.1 Feature list

| ID | Feature | MVP |
|---|---|---|
| HTL-01 | Room types, rooms and beds | yes |
| HTL-02 | Rate plans: per night, weekend, extra bed, seasons, tax-inclusive prices | yes |
| HTL-03 | Housekeeping status and the room board (with the housekeeping module role) | yes |
| HTL-04 | Bookings calendar and availability | yes |
| HTL-05 | Bookings: create, hold, confirm, change; OTA bookings entered by hand | yes |
| HTL-06 | Advances, refunds and security deposits | yes |
| HTL-07 | Cancellation and no-show | yes |
| HTL-08 | Walk-in | yes |
| HTL-09 | Check-in and the guest register | yes |
| HTL-10 | Foreign guests and Form III | yes |
| HTL-11 | The folio: room nights and extras | yes |
| HTL-12 | Early check-in, late check-out, early check-out, extension | yes |
| HTL-13 | Check-out to a tax invoice through the document port | yes |
| HTL-14 | Day close checklist | yes |
| HTL-15 | Dashboard | yes |
| HTL-16 | Reports | yes |
| HTL-17 | Documents: confirmation, registration card, folio, invoice stay block, receipt | yes |
| HTL-18 | Settings, roles and switching the module on and off | yes |
| HTL-19 | Guest data privacy and the retention purge | yes |

Out of the MVP, each with its reason in the owning feature's §14: OTA channel managers (backlog under
ADR-021, HTL-05 §14), Form III or police-portal filing (no public API), ID images (ADR-053), 24-hour
check-out mode, day use as zero nights, split folios by charge, interim invoices for long stays,
type-level (unassigned) holds, restaurant POS, multiple properties.

### 0.2 Where things live

| Concern | Owner | How hospitality uses it |
|---|---|---|
| Rooms, nights, holds, conflicts | bookings engine (`apps/bookings`, 11-contracts §2.2) | `bookings_resource_type` (`time_mode='nights'`, `capacity_mode='exclusive'`), `bookings_resource` (one per room or bed), `bookings_booking` + `bookings_booking_unit` + `bookings_slot` (one row per room per night). Hospitality calls the engine's services; it never writes engine tables directly |
| People | parties (core) | the booker, primary guest and bill-to company or agent are parties; co-guests are register rows (ADR-046) |
| Money in and out | payments (core) | advances are payments with no allocation; applied later with `allocate_existing` (ADR-047); refunds are payments out; security deposits are held deposits (ADR-044) |
| Tax invoice | sales, behind the document port (`common/seams/documents.py`, ADR-045) | check-out and cancellation charges become one sales invoice each; hospitality never imports `apps.sales` |
| Tax arithmetic | tax (core) | the folio preview runs `tax_engine.compute_document_totals` itself, so the preview and the invoice are the same function; the dated room-slab table lives in `tax` |
| Extras | inventory items when inventory is on (read through a port, see C5), else item-less lines with SAC | |
| Numbers | `allocate_number` with kind `booking` (fy, `BKG`, 11-contracts §1.7) | `BKG/26-27/0001` |
| Background work | `platform_job` + `register_schedule` (hourly at the finest) | hold expiry (engine), Form III sweep, stay-over cleaning, retention purge |
| In-app bell | notifications + `register_notification_type` | `hospitality.form_iii_due`, `hospitality.form_iii_overdue` |
| Dashboard, reports | reports registries (R8, R9) | one dashboard section, nine reports |

The ledger moves only when sales issues an invoice or payments records money (research §15.3). No
hospitality table holds a balance, and nothing in this module does balance arithmetic (vision §3).

### 0.3 Entities at a glance

```
parties_party ─┬─< hospitality_reservation >── 1:1 ── bookings_booking ─< bookings_booking_unit ─< bookings_slot
 (guest, bill-to)│         │  │                                        │   (room, start_on, end_on)   UNIQUE(tenant, resource, slot_key)
               │         │  └─< hospitality_advance >── payments_payment │
               │         │                                              ├── 1:1 hospitality_stay ─< hospitality_stay_occupant ─ 1:1 hospitality_foreign_guest
               │         └─< hospitality_folio ─< hospitality_folio_charge │            │                                   └─< hospitality_form_iii
               │                   │   └─< hospitality_invoice_line       └─< hospitality_night (one per unit per night: the rate snapshot)
               │                   └── invoice_id (uuid) ── sales_document (through the port; no FK)
               └── 1:1 hospitality_guest (the role profile, ADR-046)

bookings_resource_type ── 1:1 hospitality_room_type ─< hospitality_rate_plan ─< hospitality_rate_season
bookings_resource      ── 1:1 hospitality_room ─< hospitality_room_status_event
hospitality_day_close (one per business date)          tax_room_slab (core tax, dated bands)
```

A **reservation** is the hotel's name for the engine's booking (the merchant reads "Booking"; the
table is `hospitality_reservation` so it cannot be confused with `bookings_booking`). A **unit** is
one room in it. A **stay** is a checked-in unit. A **folio** is what will become one invoice: by
default one per reservation, holding every stay of it and any cancellation charge.

No hospitality table has a foreign key to a sales or inventory table (10-architecture §3 L1 and §10
rule 1): `invoice_id` and `item_id` are plain `uuid` columns resolved through ports. Foreign keys to
engine and core rows are allowed (§5 rule 4).

### 0.4 Cross-cutting rules

**R1 Business date.** `business_date(now) = tenant-local date of (now − hospitality.day_starts_at)`,
default 06:00. A check-in at 01:30 on 13 Oct is the night of 12 Oct; one at 07:00 is the night of
13 Oct. It is stateless on purpose: two devices always agree, and running or not running day close
never changes it (research §3.8 proposed that day close rolls the date; that makes the date depend on
whether somebody remembered, which is the gate the owner rejected). Every "today" on a hospitality
screen is the business date; sales document dates stay `tenant_today()` (the clock), which sales
requires (`apps/sales/services/payload.py`, "Date cannot be in the future").

**R2 Nights.** The night of date D starts on D. A unit `[start_on, end_on)` holds the nights
`start_on … end_on − 1` and writes one `bookings_slot` row each (`slot_key = 'YYYY-MM-DD'`,
11-contracts §2.2). Nights = `end_on − start_on`, at least 1. Back-to-back is not a conflict.

**R3 A room is always assigned at booking** (research §6.1 recommendation). Every unit names a
resource from the moment it is created; there are no type-level holds in the MVP. So the engine's
unique constraint `UNIQUE (tenant, resource, slot_key)` is the whole overbooking guarantee, against
any writer.

**R4 Lock order.** Every hospitality write that touches money follows the global order
(11-contracts notation): **party → hospitality rows (reservation, folio, stay; in id order) → engine
rows (resource rows in resource-id order, then units) → documents (inside the port) → payments →
stock → sequence**. The one step that does not fit — applying advances after the invoice number is
allocated — is safe because every writer of those payments first locks the same party; it is still
raised as contract question C3.

**R5 Money.** Rates are `numeric(14,2)`, entered at two decimals. Hospitality prices nights, decides
each night's GST slab, and hands lines to the port with their final rate and their own discount;
the tax engine does all tax arithmetic (half-up to paise, CGST = round(t × r / 200), SGST = tax −
CGST, grand total to the rupee, `apps/tax/services/tax_engine.py:174-243`). The port never receives a
document-level discount (HTL-13 BR-6).

**R6 Place of supply** for accommodation is the hotel's state (IGST Act §12(3)), so every hospitality
invoice is CGST + SGST at the tenant's state, whatever the bill-to party's state (HTL-13 BR-3,
contract question C1).

**R7 Identity documents** are stored as type plus last four characters only, never an image
(ADR-053, binding). The server keeps only the last four of whatever it is sent; a database CHECK
refuses anything longer.

**R8 Versioning.** `hospitality_reservation`, `hospitality_stay`, `hospitality_folio`,
`hospitality_night` and `hospitality_room` carry `version`; a stale write is 409 `stale_version`
(10-architecture §5 rule 8).

**R9 Audit.** Every state change writes one `write_audit` row in its transaction, action
`hospitality.<entity>.<verb>` (§0.7).

### 0.5 Permissions matrix

Codenames are declared once in `apps/common/permissions_registry.py` (strings only, L4).
*Front desk* is the canon `staff` role. *Housekeeping* is the module role
`hospitality_housekeeping` (ADR-052, 11-contracts §3), assignable only while the module is on.

| Codename | Owner | Admin | Front desk | Housekeeping | Accountant |
|---|---|---|---|---|---|
| `hospitality.room.read` (rooms, types, board) | ✓ | ✓ | ✓ | ✓ | ✓ |
| `hospitality.room.manage` (types, rooms, archive) | ✓ | ✓ | | | |
| `hospitality.rate.manage` (plans, seasons) | ✓ | ✓ | | | |
| `hospitality.booking.read` (calendar, bookings, stays, folios) | ✓ | ✓ | ✓ | | ✓ |
| `hospitality.booking.write` (create, change, hold, confirm, cancel, no-show, walk-in) | ✓ | ✓ | ✓ | | |
| `hospitality.stay.check_in` | ✓ | ✓ | ✓ | | |
| `hospitality.stay.check_out` | ✓ | ✓ | ✓ | | |
| `hospitality.stay.undo_check_in` | ✓ | ✓ | ✓ (own, inside the window) | | |
| `hospitality.folio.post` | ✓ | ✓ | ✓ | | |
| `hospitality.folio.void` | ✓ | ✓ | ✓ (own, same business date) | | |
| `hospitality.guest_id.reveal` (ID type and last 4 in detail and print) | ✓ | ✓ | ✓ | | |
| `hospitality.register.read` (register view and print) | ✓ | ✓ | ✓ | | ✓ |
| `hospitality.register.export` (register CSV) | ✓ | ✓ | | | ✓ |
| `hospitality.form_iii.write` (mark filed, correct) | ✓ | ✓ | ✓ | | |
| `hospitality.housekeeping.update` (dirty, clean, inspected) | ✓ | ✓ | ✓ | ✓ | |
| `hospitality.housekeeping.block` (out of order) | ✓ | ✓ | | | |
| `hospitality.day_close.run` | ✓ | ✓ | ✓ | | |
| `hospitality.reports.read` | ✓ | ✓ | | | ✓ |
| `hospitality.settings.manage` | ✓ | ✓ | | | |

**Role checks, not codenames** (the LED-03 rule: a ceiling the owner set is not delegable):
waiving a cancellation or no-show charge; a per-night discount above
`hospitality.front_desk_max_discount_pct`; a ₹0 (complimentary) night; a new booking whose arrival is
before the business date; overriding the credit limit at check-out; changing check-in or check-out
times after the fact. All are `owner` or `admin`, refused with 403 `override_not_allowed`.

Why `guest_id.reveal` and not `guest_id.read`: the accountant role is built as "every codename ending
in `.read`" (`permissions_registry.py:96`), so a `.read` name would hand ID details to the accountant
automatically, which ADR-053's minimisation does not want.

Money codenames still apply on top: check-out needs `sales.invoice.write` and
`payments.payment.write`, an advance or refund needs `payments.payment.write`. A screen that needs one
the member lacks says which one before anything is sent (403 `permission_denied`, `details.missing`).

### 0.6 Error codes

New codes for `apps/common/error_codes.py` and Part 22 §22.1.1, named by §22.1.2. Engine codes
(`booking_slot_taken`, `booking_not_open`, `resource_booked`) and core codes (`validation_error`,
`stale_version`, `over_allocated`, `override_not_allowed`, `permission_denied`, `module_disabled`,
`deposit_insufficient`, `credit_limit_exceeded`, `insufficient_stock`) are reused.

| Code | HTTP | `details` | Raised when |
|---|---|---|---|
| `room_price_in_gst_gap` | 400 | `night_on`, `value`, `lower`, `upper` | A tax-inclusive night value that no slab can explain (HTL-02 BR-7) |
| `booking_duplicate_suspected` | 409 | `matches: [{reservation_id, number, reason}]` | Same OTA reference, or same mobile with overlapping nights, unless `confirm_duplicate` (HTL-05) |
| `occupancy_exceeded` | 400 | `max_occupancy`, `requested` | Adults + children above the room type's limit with the extra beds asked |
| `foreign_details_incomplete` | 409 | `occupant_index`, `missing: [...]` | A foreign occupant without the Form III fields and no override reason (HTL-10) |
| `stay_has_postings` | 409 | `charges`, `payments` | Undo check-in after anything was posted (HTL-09) |
| `undo_window_passed` | 409 | `deadline` | Undo check-in after the window (HTL-09) |
| `stay_not_in_house` | 409 | `status` | A stay action on a stay that is not checked in |
| `folio_not_open` | 409 | `status`, `invoice_number` | Posting to, or checking out, a folio already invoiced |
| `folio_charge_not_open` | 409 | `status` | Voiding an invoiced or voided charge |
| `folio_too_many_lines` | 409 | `lines`, `max` | The invoice would exceed sales' 100 lines (`apps/sales/constants.py`, `LINES_MAX`) |
| `room_type_has_bookings` | 409 | `booking_ids` | Archiving a room type with active future units |
| `form_iii_already_filed` | 409 | `filed_at`, `reference` | Marking filed twice |
| `extra_night_not_free` | 409 | `night_on`, `booking_ids` | A full-night early or late charge, or an extension, needs a night that is sold (HTL-12) |

### 0.7 Audit actions, notifications, jobs, registrations

**Audit actions** (constants on `AuditAction`): `hospitality.room_type.created|updated|archived`,
`hospitality.room.created|updated|archived|status_changed|out_of_order|returned_to_service`,
`hospitality.rate_plan.created|updated|archived`, `hospitality.season.created|updated|deleted`,
`hospitality.reservation.created|updated|confirmed|hold_extended|cancelled|no_show|charge_waived|duplicate_confirmed`,
`hospitality.night.rate_changed`, `hospitality.stay.checked_in|check_in_undone|updated|extended|moved|checked_out`,
`hospitality.occupant.added|updated`, `hospitality.folio.charge_posted|charge_voided|invoiced|reopened|separated`,
`hospitality.advance.recorded|refunded|applied`, `hospitality.form_iii.filed|corrected|overridden`,
`hospitality.police.submitted`, `hospitality.day_close.run`, `hospitality.register.printed|exported`,
`hospitality.guest_data.purged`, `hospitality.settings.updated`. The engine writes its own
`bookings.*` rows; hospitality's row carries the booking id so the activity log reads as one story.

**Notifications** (`register_notification_type`, in-app bell only, DEC-012):

| Code | Severity | Permission | Raised | Title (en) | Route |
|---|---|---|---|---|---|
| `hospitality.form_iii_due` | warning | `hospitality.form_iii.write` | first sweep after 12 h elapsed | "Form III due for {name}: {hours_left} h left" | `/hospitality/form-iii?status=due` |
| `hospitality.form_iii_overdue` | danger | `hospitality.form_iii.write` | first sweep after 24 h | "Form III overdue for {name}" | `/hospitality/form-iii?status=overdue` |

**Jobs** (`register_schedule`, `job_handler`, tenant fan-out as `apps/ledger/tasks.py:44-66`):

| Job type | Period | What |
|---|---|---|
| `bookings.expire_holds` | hourly (engine's) | tentative holds past `hold_expires_at` → `expired`; the engine also frees them lazily, so correctness never waits on it |
| `hospitality.form_iii_sweep` | hourly | raise the two notifications once per row (`notified_12h_at`, `notified_24h_at`) |
| `hospitality.stay_over_cleaning` | daily 06:10 IST | when the setting is on, occupied rooms → dirty |
| `hospitality.purge_guest_data` | daily 03:30 IST | HTL-19 |

The scheduler's finest period is hourly (`apps/common/jobs.py:382-389`). The Form III countdown on
screen is computed from `due_at`, so it is never late; only the bell can be up to an hour late.

**Registrations in `HospitalityConfig.ready()`:** `register_booking_subject("hospitality_reservation", ...)`;
`register_origin("hospitality_folio", module="hospitality", listener=FolioOriginListener())`;
`register_party_role("hospitality_guest", ...)`; `register_archive_guard("hospitality", ...)`;
`register_module_off_guard` (HTL-18); `register_number_kind("booking", module="hospitality", mode="fy",
default_prefix="BKG", padding=4, label_id="hospitality.number.booking")`; `register_dashboard_section`
(HTL-15); nine `register_report` (HTL-16); two notification types; four schedules and handlers;
`tenant_data.register` for every table; `register_source_resolver` is **not** needed (hospitality
posts no ledger line).

### 0.8 Frontend map

Feature folder `frontend/src/modules/DigiKhaato/features/hospitality/{api,components,hooks,redux,types,constants,view-model,validation}`;
pages under `frontend/app/(app)/hospitality/`. Every slice is lazily injected
(`slice.injectInto(rootReducer)`, the CR-134 pattern, `src/redux/store.ts:36-82`); none is added to the
static reducers, and adding the module must not move the `sharedApp` budget (10-architecture §6.4).
The shared availability grid lives in `features/bookings/components` (engine UI, no nav). The folder
may import `features/{bookings,parties,payments,reports}` and `src/`; it may **not** import
`features/{sales,inventory,purchases,expenses}` (ESLint zone, 10-architecture §6.7), which is why every
tax figure a hospitality screen shows comes from the hospitality API and not from sales'
`view-model/taxEngine.ts`.

| Route | Page | Slices (lazy) | Services |
|---|---|---|---|
| `/hospitality` | Today (dashboard) | `hospitalityToday` | `todayService` |
| `/hospitality/calendar` | Calendar grid (desktop), day list (phone) | `hospitalityCalendar` | `calendarService` |
| `/hospitality/bookings` | Booking list | `reservationList` | `reservationService` |
| `/hospitality/bookings/new` | New booking (also a drawer from the calendar) | `reservationForm` | `reservationService`, `quoteService` |
| `/hospitality/bookings/[id]` | Booking detail: rooms, nights, advances, folio, actions | `reservationDetail` | `reservationService`, `advanceService` |
| `/hospitality/walk-in` | Walk-in, one screen | `reservationForm`, `checkIn` | `walkInService` |
| `/hospitality/check-in/[unitId]` | Check-in and register | `checkIn` | `stayService` |
| `/hospitality/in-house` | In-house list | `stayList` | `stayService` |
| `/hospitality/stays/[id]` | Stay: folio, register, changes | `stayDetail` | `stayService`, `folioService` |
| `/hospitality/stays/[id]/check-out` | Check-out | `checkOut` | `folioService` |
| `/hospitality/housekeeping` | Room board | `housekeeping` | `housekeepingService` |
| `/hospitality/form-iii` | Form III list and copy sheet | `formIii` | `formIiiService` |
| `/hospitality/day-close` | Day close checklist and history | `dayClose` | `dayCloseService` |
| `/hospitality/register` | Guest register print | `register` | `registerService` |
| `/hospitality/setup/rooms` | Room types, rooms, beds | `roomSetup` | `roomSetupService` |
| `/hospitality/setup/rates` | Rate plans and seasons | `rateSetup` | `ratePlanService` |
| `/hospitality/settings` | Hospitality settings | `hospitalitySettings` | `hospitalitySettingsService` |

Reports open in the existing reports hub (`/reports/<key>`), not under `/hospitality`.

**Navigation** (`sidebarConfig.ts` rows, `module: 'hospitality'`, group "Hotel & stays" when another
vertical is on): Today, Calendar, Bookings, In house, Housekeeping (the only row housekeeping sees),
Form III (badge: due count), Day close, Setup. Bottom nav on a phone: Today, Calendar, Walk-in (+),
In house, More. Each module path goes into `ROUTES`, `GUARDED_ROUTE_PREFIXES` and `CRAWL_DISALLOW`
(10-architecture §6.1).

**Locales.** `locales/catalogues/hospitality.{en,hi}.json` (prefix `hospitality.`) and
`bookings.{en,hi}.json` for the grid. Ordinary Hindi words:

| English | Hindi | English | Hindi |
|---|---|---|---|
| Room | कमरा | Booking | बुकिंग |
| Room type | कमरे का प्रकार | Guest | मेहमान |
| Night / nights | रात / रातें | Advance | एडवांस |
| Tentative | कच्ची बुकिंग | Confirmed | पक्की बुकिंग |
| Check in / check out | चेक-इन / चेक-आउट | In house | ठहरे हुए |
| Arrivals / departures | आने वाले / जाने वाले | Walk-in | सीधे आए मेहमान |
| Free / occupied | खाली / भरा | Clean / needs cleaning | साफ़ / सफ़ाई बाकी |
| Out of order | बंद (खराब) | Housekeeping | सफ़ाई |
| Cancel / no-show | रद्द करें / नहीं आए | Guest register | मेहमान रजिस्टर |
| Day close | दिन का हिसाब | Bill (folio) | बिल का ब्योरा |
| Extra bed | अतिरिक्त पलंग | Security deposit | ज़मानत राशि |

Trade short forms (EP, CP, MAP, AP, ADR, RevPAR) appear only in help text, never as labels
(research §4.2).

---
## HTL-01 — Room types, rooms and beds

#### 1. Product requirements
- FR-1 The owner defines room types (Standard, Deluxe, Suite, Dormitory) with occupancy limits and
  extra-bed rules, and the rooms (or beds) of each type, each with a label and a floor.
- FR-2 Each room type is one `bookings_resource_type` (`module='hospitality'`, `time_mode='nights'`,
  `capacity_mode='exclusive'`, `default_capacity=1`, check-in and check-out times from HTL-18
  settings); each room or bed is one `bookings_resource`. Hospitality keeps its own fields in 1:1
  profile rows.
- FR-3 A dormitory is a room type with `is_dormitory = true`; its sellable units are **beds**, each a
  resource whose `parent` is the dorm room's resource (11-contracts §2.2 `parent FK null`). The dorm
  room itself is not sellable in the MVP (a whole-dorm booking is several beds).
- FR-4 Bulk add: "Rooms 101 to 110 on floor 1" creates ten rooms in one request.
- FR-5 Archive, never delete. A room type or room with active future units (hold, confirmed,
  checked in) cannot be archived; the refusal lists the bookings. An archived room keeps its history
  and disappears from availability, the calendar and the board.
- FR-6 The first-use state of the module is this screen: no room exists until the owner adds one
  (no seeded demo rooms, vision §4 no invented data).

#### 2. User flows
- Setup: Setup → Rooms → **Add room type** (drawer: name, base and maximum guests, children, extra
  beds allowed, dormitory switch) → Save → **Add rooms** (label from/to, floor) → Save → the rooms
  appear grouped by type with their housekeeping status (Clean).
- Rename "103" to "103A": edit the label; the history follows the id.
- Retire a room: ⋯ → Archive → confirm; refused with the list of future bookings if any, each linking
  to the booking so it can be moved.

#### 3. Features (MVP vs later)
MVP: types, rooms, dorm beds, floor, amenities as tags, bulk add, archive and restore, sort order.
Later: room import from CSV (import registry R12), room photos (files), per-type check-in times,
connecting rooms, a whole-dorm booking as one unit.

#### 4. Entities and relationships
`hospitality_room_type` 1:1 `bookings_resource_type`; `hospitality_room` 1:1 `bookings_resource`;
`hospitality_room` N:1 `hospitality_room_type`; a bed's resource has `parent` = the dorm room's
resource. Rate plans (HTL-02) hang off the room type; status events (HTL-03) off the room.

#### 5. Database
All tables extend `TenantModel` (UUIDv7 `id`, `tenant` RESTRICT, `created_by`, timestamps) and are
soft-deleted master data (`deleted_at`) with `archived_at` for archive.

`hospitality_room_type`

| Column | Type | Constraint |
|---|---|---|
| `resource_type_id` | uuid | OneToOne `bookings.ResourceType`, RESTRICT |
| `name` | varchar(60) | not blank |
| `base_occupancy` | smallint | ≥ 1; guests included in the room rate |
| `max_adults` | smallint | ≥ 1 |
| `max_children` | smallint | ≥ 0 |
| `max_occupancy` | smallint | ≥ `base_occupancy`; adults + children, extra beds counted |
| `max_extra_beds` | smallint | 0–3, default 0 |
| `is_dormitory` | boolean | default false; then `max_occupancy = 1`, `max_extra_beds = 0` (CHECK) |
| `amenities` | varchar(24)[] | ≤ 10 tags ("AC", "TV", "Hot water") |
| `description` | varchar(500) | default '' |
| `sort_order` | smallint | default 0 |
| `archived_at` | timestamptz | null |

Constraints: `uq_hospitality_room_type_name` UNIQUE `(tenant, lower(name))` WHERE `deleted_at IS NULL`;
`ck_hospitality_room_type_occupancy` (`max_occupancy >= base_occupancy AND max_adults <= max_occupancy`);
`ck_hospitality_room_type_dorm`.

`hospitality_room`

| Column | Type | Constraint |
|---|---|---|
| `resource_id` | uuid | OneToOne `bookings.Resource`, RESTRICT |
| `room_type_id` | uuid | FK `hospitality_room_type`, RESTRICT |
| `label` | varchar(24) | copy of `bookings_resource.label`, kept equal by the service |
| `floor` | varchar(16) | default '' ("Ground", "1") |
| `housekeeping_status` | varchar(16) | CHECK in (`clean`,`dirty`,`inspected`,`out_of_order`), default `clean` (HTL-03 owns it) |
| `status_changed_at` | timestamptz | |
| `status_changed_by_id` | uuid | FK user, SET NULL |
| `maintenance_note` | varchar(120) | default ''; sellable with a note ("AC noisy") |
| `sort_order` | smallint | |
| `archived_at` | timestamptz | null |
| `version` | integer | default 1 |

Constraints and indexes: `uq_hospitality_room_label` UNIQUE `(tenant, lower(label))` WHERE
`deleted_at IS NULL` (the engine's `(tenant, type, label)` is per type; a hotel's room numbers are
unique across types); `ix_hospitality_room_board (tenant, floor, sort_order)` WHERE `archived_at IS NULL`.

#### 6. API
Prefix `/api/v1/hospitality/`, `ModuleEnabled("hospitality")`.

| Method, path | Codename | Body / query | Response, errors |
|---|---|---|---|
| `GET /room-types` | `room.read` | `include_archived` | list with room counts |
| `POST /room-types` | `room.manage` | name, occupancy fields, amenities, description | 201; 400 `validation_error` |
| `PATCH /room-types/{id}` | `room.manage` | any field + `version` | 200; 409 `stale_version`; lowering `max_occupancy` below a future unit's guests is 409 `occupancy_exceeded` with the units |
| `POST /room-types/{id}/archive`, `/restore` | `room.manage` | — | 200; 409 `room_type_has_bookings` |
| `GET /rooms` | `room.read` | `room_type_id`, `floor`, `include_archived` | list |
| `POST /rooms` | `room.manage` | `room_type_id`, `label`, `floor`, `parent_room_id` (beds) | 201 |
| `POST /rooms/bulk` | `room.manage` | `room_type_id`, `prefix`, `from`, `to`, `floor` (≤ 60 rooms) | 201 `{created, skipped: [labels that exist]}` |
| `PATCH /rooms/{id}` | `room.manage` | label, floor, sort order, maintenance note, `version` | 200 |
| `POST /rooms/{id}/archive`, `/restore` | `room.manage` | — | 409 `resource_booked` (engine code, `booking_ids`) |

Services: `hospitality.services.rooms.create_room_type`, `create_rooms`, `archive_room` call
`bookings.services.create_resource_type` and `create_resource` in the same transaction.

#### 7. Frontend
Route `/hospitality/setup/rooms`; slice `roomSetup` (lazy); service `api/roomSetupService.ts`;
components `RoomTypeDrawer` and `RoomsBulkDrawer` (`dynamic()`), `RoomSetupList` (`UbDataGrid`, card
layout below `md`). Yup schemas `roomTypeSchema`, `roomsBulkSchema` in `useValidationSchemas()`.

#### 8. UI/UX
- Grouped list: type header ("Deluxe · 6 rooms · up to 3 guests"), then rooms as chips with label and
  floor. Phone: one card per type, rooms wrap as chips; no horizontal scroll.
- Bulk drawer shows a live preview "Creates 101, 102 … 110 (10 rooms)" and which labels already exist.
- Copy: `hospitality.setup.addRoomType` "Add room type" / "कमरे का प्रकार जोड़ें";
  `hospitality.setup.addRooms` "Add rooms" / "कमरे जोड़ें"; `hospitality.setup.dormitory` "Dormitory
  (sold by bed)" / "डॉरमेट्री (पलंग के हिसाब से)".
- First-use empty state: "Add your rooms to start taking bookings" with the primary action.

#### 9. Validation and business rules
- V: name 1–60, unique per tenant; label 1–24, unique per tenant, no comma; `from ≤ to`, ≤ 60 rooms.
- BR-1 A type's resource type gets `check_in_time`/`check_out_time` from settings; changing the
  settings updates every hospitality resource type in the same transaction.
- BR-2 Archive is refused while any active unit (hold not expired, confirmed, checked in) holds a slot
  on or after the business date.
- BR-3 A bed inherits the dorm's floor; a dorm with beds cannot be archived before its beds.

#### 10. Permissions
Read `hospitality.room.read` (everyone in the module, including housekeeping); write
`hospitality.room.manage` (owner, admin).

#### 11. Reports
Feeds occupancy's "available room-nights" (HTL-16): active, non-archived rooms (beds counted
separately).

#### 12. Testing
- T-HTL01-1 creating a type creates its engine resource type with `time_mode='nights'`, `exclusive`.
- T-HTL01-2 bulk 101–110 creates ten rooms and ten resources; rerun skips all ten.
- T-HTL01-3 archive with a confirmed booking next week → 409 with that booking's id; with only past
  stays → archived, the past stays still open.
- T-HTL01-4 cross-tenant room id → 404 (ADR-032).
- T-HTL01-5 `tenant_data` covers both tables; module-off with rooms but no open bookings is allowed
  (rooms are not open records).

#### 13. Edge cases
EC-1 Two types named "Deluxe" and "deluxe" → refused (case-folded). EC-2 Label change on a room with
past invoices: invoices keep the old label in their text; the register shows the label at the time
(snapshot on the stay). EC-3 A dorm bed sold to a family of two → refused (`occupancy_exceeded`);
they book two beds.

#### 14. Future
Room import; per-type times; gender-restricted dorms (research EC-27); whole-dorm unit.

---

## HTL-02 — Rate plans: per night, weekend, extra bed, seasons, tax-inclusive prices

#### 1. Product requirements
- FR-1 Each room type has one or more rate plans ("Room only", "With breakfast") with a base price
  per night, an optional weekend price, an extra-bed price per night and a minimum stay.
- FR-2 Seasons override a plan's prices for a date range ("Diwali week", "Summer").
- FR-3 A plan says whether its prices **include GST** (many lodges quote "₹2,100 including GST").
- FR-4 A quote service prices any `(room or type, plan, arrival, departure, extra beds, per-night
  discount)` night by night and returns each night's value, its GST slab and a preview total computed
  by the real tax engine.
- FR-5 A booking copies each night's price into `hospitality_night` when it is made (HTL-05), so a
  later rate change never reprices a confirmed booking (research EC-7).
- FR-6 The meal plan is descriptive: a breakfast plan is one room line on the invoice (composite
  supply at the accommodation rate); the meal value may be shown as text (research §6.6).

#### 2. User flows
- Setup → Rates → pick type → **Add plan** → name, meal plan, "Prices include GST" switch, base,
  weekend, extra bed, minimum nights → Save.
- **Add season** → name, from, to, price, weekend price, extra bed → Save; an overlap warns "Diwali
  week overlaps October; the shorter one wins".
- Quote at the phone: the booking drawer calls the quote on every date or plan change and shows
  "3 nights · ₹7,497 + GST ₹374.85 · ₹7,872".

#### 3. Features (MVP vs later)
MVP: plans, weekend nights (default Friday and Saturday nights), extra bed, seasons, minimum nights
(warning), tax-inclusive plans, the quote. Later: per-person pricing above base occupancy (the MVP
charges extra guests as extra beds), length-of-stay discounts, occupancy pricing, packages, rate
restrictions (closed to arrival), child age bands.

#### 4. Entities and relationships
`hospitality_rate_plan` N:1 `hospitality_room_type`; `hospitality_rate_season` N:1 plan;
`hospitality_night.rate_plan_id` points at the plan used (SET NULL on archive is not needed: plans
are archived, never deleted). `tax_room_slab` (core, `apps/tax`) gives the slab bands by date.

#### 5. Database
`hospitality_rate_plan`

| Column | Type | Constraint |
|---|---|---|
| `room_type_id` | uuid | FK, RESTRICT |
| `name` | varchar(60) | |
| `meal_plan` | varchar(12) | CHECK in (`room_only`,`breakfast`,`half_board`,`full_board`) |
| `tax_inclusive` | boolean | default false |
| `base_rate` | numeric(14,2) | ≥ 0 |
| `weekend_rate` | numeric(14,2) | null, ≥ 0 |
| `weekend_nights` | smallint | bitmask Mon=1 … Sun=64 (the `common/recurrence.py` convention), default 48 (Fri + Sat) |
| `extra_bed_rate` | numeric(14,2) | default 0, ≥ 0 |
| `min_nights` | smallint | default 1, 1–30 |
| `meal_value_note` | varchar(80) | default '' ("Breakfast ₹300 per person included") |
| `is_default` | boolean | at most one per room type (partial unique) |
| `sort_order` | smallint | |
| `archived_at` | timestamptz | null |

Constraints: `uq_hospitality_rate_plan_name` UNIQUE `(tenant, room_type_id, lower(name))` WHERE
`deleted_at IS NULL`; `uq_hospitality_rate_plan_default` UNIQUE `(tenant, room_type_id)` WHERE
`is_default AND archived_at IS NULL`; `ck_hospitality_rate_plan_amounts`.

`hospitality_rate_season`

| Column | Type | Constraint |
|---|---|---|
| `rate_plan_id` | uuid | FK, CASCADE (a season has no meaning without its plan; plans are never hard-deleted) |
| `name` | varchar(60) | |
| `start_on`, `end_on` | date | inclusive; CHECK `end_on >= start_on`, span ≤ 366 days |
| `rate` | numeric(14,2) | ≥ 0 |
| `weekend_rate` | numeric(14,2) | null |
| `extra_bed_rate` | numeric(14,2) | null (= the plan's) |

Index `ix_hospitality_season_plan_dates (tenant, rate_plan_id, start_on, end_on)`.

**Core table (owned by `tax`, ADR-045; shape proposed here, contract question C12)** —
`tax_room_slab`: `id`, `tenant` null (global rows), `effective_from date`, `effective_to date null`
(inclusive), `up_to numeric(14,2) null` (inclusive upper bound; null = no bound), `tax_code
varchar(16)` (a `tax_rate.code`). Seed rows:

| From | To | Up to | Code |
|---|---|---|---|
| 2017-07-01 | 2022-07-17 | 1,000.00 | EXEMPT |
| 2017-07-01 | 2022-07-17 | 7,500.00 | GST12 |
| 2017-07-01 | 2022-07-17 | — | GST18 |
| 2022-07-18 | 2025-09-21 | 7,500.00 | GST12 |
| 2022-07-18 | 2025-09-21 | — | GST18 |
| 2025-09-22 | — | 7,500.00 | GST5 |
| 2025-09-22 | — | — | GST18 |

(The pre-2022 exempt band and the 2017–2019 bands are to be confirmed by the CA before seeding,
review item TL-1; only the 2025-09-22 rows matter to a new tenant.)

#### 6. API
| Method, path | Codename | Notes |
|---|---|---|
| `GET /rate-plans?room_type_id` | `booking.read` or `rate.manage` | front desk sees prices, not the editor |
| `POST /rate-plans`, `PATCH /rate-plans/{id}`, `POST /rate-plans/{id}/archive` | `rate.manage` | archive refused for the last active plan of a type with future units (409 `validation_error`, "Keep one plan for Deluxe") |
| `GET/POST /rate-plans/{id}/seasons`, `PATCH/DELETE /seasons/{id}` | `rate.manage` | 201 carries `warnings: [{code: "season_overlap", with: [...]}]` |
| `POST /quote` | `booking.write` | body: `room_id` or `room_type_id`, `rate_plan_id`, `arrival_on`, `departure_on`, `extra_beds`, `nights: [{night_on, room_rate?, discount_amount?}]` overrides; response below |

Quote response:
```json
{ "nights": [{"night_on": "2026-10-16", "room_rate": "6500.00", "extra_bed_amount": "0.00",
    "discount_amount": "0.00", "value": "6500.00", "tax_inclusive": false,
    "tax_code": "GST5", "rate_source": "plan_weekday"}],
  "lines": [{"description": "Deluxe · 16–18 Oct · 2 nights", "qty": "2", "unit_price": "6500.00",
    "tax_code": "GST5", "taxable_value": "13000.00", "cgst": "325.00", "sgst": "325.00"}],
  "totals": {"taxable_total": "21200.00", "cgst_total": "1063.00", "sgst_total": "1063.00",
    "round_off": "0.00", "grand_total": "23326.00"},
  "warnings": [{"code": "min_nights", "min": 2}] }
```
Errors: 400 `room_price_in_gst_gap`, 400 `validation_error`.

#### 7. Frontend
Route `/hospitality/setup/rates`; slice `rateSetup`; `api/ratePlanService.ts`, `api/quoteService.ts`;
`RatePlanDrawer`, `SeasonDrawer` (`dynamic()`); `NightPriceStrip` (shared by booking, walk-in and
check-out) renders the quote's nights.

#### 8. UI/UX
- Plan card: "Room only · ₹3,200 a night · weekends ₹3,800 · extra bed ₹800 · prices before GST".
- Seasons as a list with date ranges; overlaps marked in words ("overlaps Summer").
- The quote strip shows each night as a chip: date, price, and "5%" or "18%" as text; a night whose
  slab differs from its neighbours is marked "18% · above ₹7,500" so the reason is visible.
- Copy: `hospitality.rates.includesGst` "Prices include GST" / "कीमत में GST शामिल है";
  `hospitality.rates.weekend` "Weekend price (Fri and Sat nights)" / "सप्ताहांत की कीमत (शुक्र और शनि की रात)".

#### 9. Validation and business rules
- BR-1 **Night price.** For night D: the season covering D with the shortest span wins (tie: the later
  `start_on`, then the later `created_at`); weekend if D's weekday bit is in `weekend_nights`.
  `room_rate` = season weekend rate (weekend, set) → season rate → plan weekend rate (weekend, set) →
  plan base rate. `rate_source` records which (`season_weekend`, `season`, `plan_weekend`,
  `plan_weekday`, `manual`, `complimentary`).
- BR-2 `extra_bed_amount = extra_beds × (season.extra_bed_rate ?? plan.extra_bed_rate)`.
- BR-3 A per-night discount is an amount (a percent from the UI is converted per night with `q2`);
  `0 ≤ discount ≤ room_rate + extra_bed_amount`.
- BR-4 **The night's value** for the slab is `room_rate + extra_bed_amount + (the early check-in
  charge belonging to D, HTL-12) − discount`, in the plan's tax basis. The unit is the room (or bed)
  and the day (research §6.5).
- BR-5 **Slab, exclusive prices.** Take the bands of `tax_room_slab` in force on the invoice date
  (quote and booking: the business date; review item TL-8); the first band whose `up_to ≥ value`
  (or whose `up_to` is null) gives the tax code. ₹7,500.00 is 5%; ₹7,500.01 is 18%.
- BR-6 **Slab, inclusive prices.** For each band in ascending order, compute
  `t = q2(value ÷ (1 + rate/100))` exactly as the engine backs tax out of an inclusive line
  (`tax_engine._taxable_line`); the band is consistent when `t` lies inside it. Use the first
  consistent band.
- BR-7 **The gap is refused.** When no band is consistent the night is refused with
  `room_price_in_gst_gap`. Under today's bands that is every inclusive value from **₹7,875.01 to
  ₹8,850.00**: at 5% the taxable value is above ₹7,500, at 18% it is not. Checked against the engine:
  ₹7,875.00 → taxable ₹7,500.00 at 5% (accepted); ₹7,875.01 → ₹7,500.01 (not a 5% value);
  ₹8,850.00 → ₹7,500.00 at 18% (not above ₹7,500); ₹8,850.01 → ₹7,500.01 at 18% (accepted). The
  research's message said "from ₹7,876"; the true lower edge at two decimals is ₹7,875.01. Message:
  "Enter the price before GST. A price from ₹7,875.01 to ₹8,850.00 including GST can't be split into
  a valid room rate." / "GST से पहले की कीमत डालें। GST सहित ₹7,875.01 से ₹8,850.00 तक की कीमत को सही
  दर में नहीं बाँटा जा सकता।" The same procedure finds the older gaps (₹8,400.01–₹8,850.00 under the
  12%/18% bands). The rule applies to the whole night value, so ₹7,000 + an extra bed ₹1,000 inclusive
  (₹8,000) is refused too.
- BR-8 **Unregistered and composition tenants** charge no GST (the engine forces rates to 0,
  `TAX_FREE_GST_TYPES`); the quote shows no slab and nothing is refused for the gap.
- BR-9 Minimum nights is a warning, never a refusal.
- BR-10 A plan or season edit never touches `hospitality_night` rows already written.

#### 10. Permissions
`hospitality.rate.manage` edits; `hospitality.booking.read` reads prices; `booking.write` quotes.

#### 11. Reports
None directly; `rate_source` feeds the revenue report's "discounted nights" figure.

#### 12. Testing
- T-HTL02-1 table test of BR-1: season inside season, weekend inside season, no season, ties.
- T-HTL02-2 the slab boundary exclusive: 7,500.00 → GST5, 7,500.01 → GST18.
- T-HTL02-3 the inclusive gap with the four edge values of BR-7, asserted through
  `compute_document_totals` so the rule and the engine cannot drift.
- T-HTL02-4 a fuzzed test: for 10,000 random inclusive values, either exactly one band is consistent
  or the value is in the gap, and every accepted value round-trips (the engine's taxable value lies in
  the chosen band).
- T-HTL02-5 the 2025-09-22 boundary: a quote dated 21 Sep 2025 uses GST12, 22 Sep uses GST5.
- T-HTL02-6 unregistered tenant: no refusal at ₹8,000 inclusive, totals without tax.
- T-HTL02-7 a plan edit after booking leaves the booking's nights unchanged.

#### 13. Edge cases
EC-1 Seasons with identical ranges → the later-created wins, and the second save warns. EC-2 A
weekend price lower than the weekday price is allowed (business hotels). EC-3 A season with a price
of 0 is refused (`validation_error`): a ₹0 night is a per-booking decision with a reason (HTL-05
BR-4), never a price list.

#### 14. Future
Per-person rates, child bands, length-of-stay discounts, packages, a rate calendar view.

---

## HTL-03 — Housekeeping status and the room board

#### 1. Product requirements
- FR-1 Each room has a housekeeping status: **Clean**, **Needs cleaning** (dirty), **Inspected**, or
  **Out of order** (cannot be sold, with dates and a reason). A sellable room may carry a maintenance
  note ("AC noisy").
- FR-2 Check-out sets the room to Needs cleaning (HTL-13); an optional daily stay-over rule sets
  occupied rooms to Needs cleaning at the start of the business day.
- FR-3 The **room board** shows every room by floor with its status and occupancy (Vacant, Occupied,
  Due out today, Arriving today), each with one large button (Mark clean).
- FR-4 The **housekeeping module role** sees the board and nothing else: no guest names, mobiles, IDs,
  prices, folios or money (ADR-052, contract §3). It can mark rooms clean or dirty.
- FR-5 Out of order goes through the engine (`set_out_of_service`), so the room cannot be booked on
  those nights by any path; it is refused over existing bookings with the list to move first.
- FR-6 Every change is kept in `hospitality_room_status_event`.

#### 2. User flows
- Housekeeping signs in on a shared phone → lands on `/hospitality/housekeeping` (the only nav row) →
  taps **Mark clean** on 104 → the card turns to "Clean" with the time.
- Supervisor: ⋯ on 206 → **Out of order** → from, to, reason "Leaking tap" → Save; refused if 206
  is booked on 14 Oct: "Move these bookings first: BKG/26-27/0042 (14–16 Oct)".
- Return early: ⋯ → **Back in service** (contract question C7).

#### 3. Features (MVP vs later)
MVP: four statuses, maintenance note, out-of-order dates, history, stay-over rule, board with
filters, housekeeping role. Later: task assignment per attendant, linen counts, maintenance tickets,
inspected-required-before-sale.

#### 4. Entities and relationships
`hospitality_room.housekeeping_status` is the current value (a cache of the last event);
`hospitality_room_status_event` N:1 room; out of order also writes one `bookings_out_of_service` row
whose id the event keeps. Occupancy is derived from engine units, never stored.

#### 5. Database
`hospitality_room_status_event` (immutable, `ImmutableModel`, `apps/common/models.py:70`)

| Column | Type | Constraint |
|---|---|---|
| `room_id` | uuid | FK, RESTRICT |
| `from_status`, `to_status` | varchar(16) | same CHECK as the room |
| `reason` | varchar(120) | required for `out_of_order` |
| `from_on`, `to_on` | date | set for `out_of_order`; CHECK `to_on >= from_on` |
| `out_of_service_id` | uuid | null; the engine row |
| `source` | varchar(12) | CHECK in (`manual`,`check_out`,`stay_over`,`return`) |
| `created_by_id`, `created_at` | | |

Index `ix_hospitality_room_status_event_room (tenant, room_id, created_at DESC)`. The room's
`housekeeping_status` and the latest event are written in one transaction under the room row lock
(`version` bumped).

#### 6. API
| Method, path | Codename | Notes |
|---|---|---|
| `GET /housekeeping/board?floor&status` | `room.read` | `[{room_id, label, floor, room_type, housekeeping_status, maintenance_note, occupancy: "vacant"|"occupied", due_out_today: bool, arriving_today: bool, status_changed_at}]` — **no** guest, booking or money field, for any caller |
| `POST /rooms/{id}/status` | `housekeeping.update` | `{status: clean|dirty|inspected, version}`; `inspected` also needs `housekeeping.block` |
| `POST /rooms/{id}/out-of-order` | `housekeeping.block` | `{from_on, to_on, reason}` → engine `set_out_of_service`; 409 `resource_booked` with `booking_ids` |
| `POST /rooms/{id}/return-to-service` | `housekeeping.block` | ends the current period today (C7) |
| `GET /rooms/{id}/status-history` | `room.read` | paged |

#### 7. Frontend
Route `/hospitality/housekeeping`; slice `housekeeping`; `api/housekeepingService.ts`; `RoomBoard`
(cards in a `UbGrid`, two columns on a phone), `OutOfOrderDrawer` (`dynamic()`). The board polls
every 60 s while visible (no socket: ADR-021).

#### 8. UI/UX
- Each card: room label large ("104"), floor, status as text and colour ("Needs cleaning"), a second
  line "Occupied · due out today" or "Vacant · arriving today", and one button sized for a thumb
  (≥ 48 px). Colour is never the only signal (research §7 item 5).
- Hindi is the default for the housekeeping role when the member's locale is `hi`; the words are
  short and ordinary: "साफ़", "सफ़ाई बाकी", "बंद (खराब)", "साफ़ कर दिया".
- Filters as chips in the URL: floor, status.
- Mark clean is instant (optimistic, then confirmed); a failure turns the card amber "Not saved ·
  Retry".

#### 9. Validation and business rules
- BR-1 Transitions: any → `clean`/`dirty`; `clean` → `inspected` (supervisor); `out_of_order` is left
  only by return-to-service or by the period's end (a daily check at the business-day start).
- BR-2 A room out of order on night D is not available on D (engine). The status shown is
  `out_of_order` only while today is inside a period; a future period shows as a note.
- BR-3 Check-in to a room marked Needs cleaning is a **warning**, never a block (research §14).
- BR-4 The board's projection is a separate serializer with a fixed field list; a test fails if a
  field is added that is not on the allow-list (the ADR-052 "restricted fields" rule in its strongest
  form).

#### 10. Permissions
Board: `room.read`. Clean/dirty: `housekeeping.update` (owner, admin, front desk, housekeeping).
Inspected and out of order: `housekeeping.block` (owner, admin). Housekeeping holds only
`hospitality.room.read` and `hospitality.housekeeping.update`; every other hospitality, parties,
ledger, payments, sales and reports endpoint answers it 403.

#### 11. Reports
Out-of-order nights reduce available room-nights (HTL-16). Status history feeds nothing else in the
MVP.

#### 12. Testing
- T-HTL03-1 a housekeeping member: board 200; `/hospitality/bookings`, `/parties`, `/payments`,
  `/sales/invoices`, `/reports/dashboard` all 403; the test asserts WHO is signed in first (the
  CLAUDE.md harness lesson).
- T-HTL03-2 the board JSON contains no key outside the allow-list, and no seeded guest name appears in
  the response text.
- T-HTL03-3 out of order over a booked night → 409 with the booking; over a free range → the engine
  refuses a booking on those nights afterwards.
- T-HTL03-4 check-out → room `dirty` with an event `source=check_out`.
- T-HTL03-5 stay-over job on: occupied rooms dirty, vacant untouched; rerun is a no-op.
- T-HTL03-6 concurrency: out of order and a booking of the same night race → exactly one wins
  (engine lock on the resource row).

#### 13. Edge cases
EC-1 Housekeeping marks an occupied room clean mid-stay → allowed (stay-over cleaning done). EC-2 A
room out of order for a month is booked for next month → allowed. EC-3 The housekeeping member's
module role is removed while signed in → the next request is 403 and the app shows the signed-out
state of the board.

#### 14. Future
Attendant assignment, "inspected before sale" as a setting, maintenance tickets with photos.

---

## HTL-04 — Bookings calendar and availability

#### 1. Product requirements
- FR-1 A **calendar grid** on desktop: rooms as rows (grouped by type), nights as columns, bookings as
  bars across the nights they hold.
- FR-2 A **day list** on a phone: pick a night; see Arriving, In house, Departing and Free rooms (clean
  first) as cards.
- FR-3 An **Is it free?** search: dates, guests, optional type → free rooms with the quote per room.
- FR-4 Availability comes from the engine (`availability()`) and the grid from engine slot rows; an
  expired hold counts as free before the job has run (11-contracts §2.2).
- FR-5 Every cell is actionable: an empty cell opens a new booking on that room and night; a bar
  opens the booking.

#### 2. User flows
- Phone call: Calendar → jump to 14 Oct → see 104 free on 14–15 → click 14 then 15 on row 104 →
  booking drawer opens with 104, 14–16 Oct, the default plan and the quote.
- Is it free?: dates 14–16 Oct, 2 adults → "4 rooms free: Standard 101, 103 (₹3,200 a night);
  Deluxe 204, 206 (₹4,500)" → tap a room → booking drawer.
- Phone day list: date strip → 14 Oct → "Free tonight: 3 clean, 1 needs cleaning".

#### 3. Features (MVP vs later)
MVP: grid (7, 14 or 31 nights), day list, search, filters (type, floor, free only), jump to date,
today marker, out-of-order shading, tentative bars distinct from confirmed. Later: drag to move a
booking, type-level free counts for unassigned holds, printing the grid.

#### 4. Entities and relationships
Reads `bookings_slot` → `bookings_booking_unit` → `bookings_booking` → `hospitality_reservation` →
`parties_party` (short name), `hospitality_room`, `bookings_out_of_service`.

#### 5. Database
No new table. Indexes this feature relies on: the engine's `UNIQUE (tenant, resource, slot_key)`
serves "which slots of these rooms in this range" as a range scan on `(tenant, resource, slot_key)`;
`bookings_booking_unit (tenant, resource_id, start_on)` (engine's). EXPLAIN test below.

#### 6. API
| Method, path | Codename | Notes |
|---|---|---|
| `GET /calendar?start_on&days=7|14|31&room_type_id&floor` | `booking.read` | `{rooms: [{room_id, label, type, housekeeping_status}], nights: [dates], bars: [{reservation_id, unit_id, room_id, start_on, end_on, status, guest_short_name, balance_due?, is_foreign}], out_of_order: [{room_id, from_on, to_on, reason}]}`; `days` > 31 is 400 |
| `GET /availability?arrival_on&departure_on&adults&children&extra_beds&room_type_id&clean_only` | `booking.read` | free rooms with `housekeeping_status`, the default plan's quote summary per type; calls engine `availability(type_id|resource_ids, start_on, end_on)` |
| `GET /api/v1/bookings/availability?...` (engine read API) | `EngineEnabled("bookings")` + `hospitality.booking.read` (C15) | the raw engine grid; hospitality screens use the module endpoint above |

`guest_short_name` is "Ramesh K." (first name and initial), never the mobile.

#### 7. Frontend
Route `/hospitality/calendar`; slice `hospitalityCalendar` (window, filters, data); service
`api/calendarService.ts`; the grid component `AvailabilityGrid` in `features/bookings/components`
(engine UI, reused later by seats), fed by a hospitality view-model `calendarDisplay.ts`. Filters and
the start date live in the URL (`?start=2026-10-14&days=14&type=…`, the PTY-05 lesson).

#### 8. UI/UX
- **Desktop grid** (≥ 1024 px): sticky first column (room label, type, a small status word), sticky
  header of nights ("Wed 14"), weekend columns tinted and labelled, today outlined. A bar shows the
  guest short name and nights; tentative bars are dashed with "Tentative · until 18:00"; checked-in
  bars solid with "In house"; out-of-order cells hatched with "Out of order". Keyboard: arrow keys
  move a focus ring cell to cell, Enter opens, Shift+arrows extend a selection.
- **Tablet** (768 px): 7 nights, the same grid.
- **Phone** (< 640 px): no grid. A 7-day date strip (`UbChipTabs`) and four sections of cards. The
  page never scrolls sideways (the measuring check, §12).
- Copy: `hospitality.calendar.free` "Free" / "खाली"; `hospitality.calendar.tentativeUntil`
  "Tentative · until {time}" / "कच्ची · {time} तक"; `hospitality.calendar.isItFree` "Is it free?" /
  "कमरा खाली है?".
- Empty: no rooms → HTL-01's first-use state; no bookings in range → the grid with a caption "No
  bookings in these dates".

#### 9. Validation and business rules
- BR-1 A room is free for night D when it is active, not out of order on D and has no slot row for D
  from an active unit (engine definition; research §6.1).
- BR-2 Search checks every night of the range; a room free on some nights only is listed under "Free
  on some nights" with the nights, never as free.
- BR-3 `clean_only` (walk-ins, HTL-08) lists Needs-cleaning rooms separately, after the clean ones.
- BR-4 Capacity: a room type is offered only if `adults + children ≤ max_occupancy` with the extra beds
  allowed.

#### 10. Permissions
`hospitality.booking.read`. Housekeeping has no calendar.

#### 11. Reports
The grid's data model is the occupancy report's (HTL-16), for one window.

#### 12. Testing
- T-HTL04-1 grid for 40 rooms × 31 nights is one query plus a bounded number (≤ 6); EXPLAIN shows an
  index scan on the slot constraint's index (10-architecture §11 "availability for a date range").
- T-HTL04-2 an expired hold shows free in both grid and search before `expire_holds` has run.
- T-HTL04-3 back-to-back bookings render as two bars meeting at the column edge, no overlap.
- T-HTL04-4 e2e: at 360 px the calendar page's `scrollWidth ≤` viewport and every text node sits
  inside its box; at 1280 px the grid shows 14 columns with sticky headers.
- T-HTL04-5 filters survive a reload (URL).

#### 13. Edge cases
EC-1 A 31-night window across a month end and a financial year end → one grid. EC-2 A room archived
mid-window → its row shows until the archive date, then greyed with "Archived". EC-3 A booking made
on another device while the grid is open → visible on the next refresh or on the 409 of a clash
(HTL-05).

#### 14. Future
Drag to move, type-level counts, a printable grid, live refresh without polling.

---

## HTL-05 — Bookings: create, hold, confirm, change; OTA bookings entered by hand

#### 1. Product requirements
- FR-1 A booking holds one or more rooms, each for a date range, with guest counts, a rate plan and
  the per-night prices quoted (HTL-02). **A room is always assigned** (R3).
- FR-2 The guest is a party, found by mobile first; a new guest is created with name and mobile in
  the same request (research §15.2). An optional bill-to party (company, agent, OTA) can be set.
- FR-3 Status is **Tentative** (engine `hold`, held until a time) or **Confirmed** (engine `book`). A
  tentative booking is confirmed by hand or automatically when an advance is recorded (setting). It
  expires on its own (engine job and lazy expiry).
- FR-4 Source: walk-in, phone, direct, agent, OTA, other; for OTA and agent a source name
  ("Booking.com") and the external reference.
- FR-5 **OTA and agent bookings are entered by hand** with the reference. A second booking with the
  same source name and external reference, or the same mobile with overlapping nights, is refused with
  `booking_duplicate_suspected` listing the matches, unless the clerk confirms it is not a duplicate
  (research EC-26). There is no channel manager (§14).
- FR-6 Changes before check-in: dates, room, guest counts, plan, per-night prices, bill-to, notes.
  Every change re-checks availability through the engine and re-prices only the nights that changed.
- FR-7 The booking number comes from `allocate_number(kind="booking")`, `BKG/26-27/0001`.
- FR-8 A booking confirmation can be printed and shared as a prepared WhatsApp text (HTL-17).
- FR-9 A booking is never deleted: it is cancelled (HTL-07) or expires.

#### 2. User flows
1. Calendar cell or **New booking** → drawer: mobile (search) → name if new → dates → room (free rooms
   of the chosen type, current one preselected) → adults, children, extra beds → plan → the night
   strip with prices and slabs → optional discount per night → source (chips) → status (Tentative with
   "hold until", or Confirmed) → optional advance (HTL-06) → **Save**.
2. Saved: snackbar "Booking BKG/26-27/0042 · Room 104 · 14–16 Oct" with **Share confirmation**.
3. Clash: 409 `booking_slot_taken` → the drawer keeps every value and shows "Room 104 was just
   booked for 14 Oct. Choose another room" with the free alternatives (research EC-1).
4. Duplicate: 409 `booking_duplicate_suspected` → "Booking.com reference 4471 is already booking
   BKG/26-27/0039" with **Open it** and **Save anyway (not a duplicate)**.
5. Multi-room: **Add another room** in the drawer adds a unit row; every unit is saved or none is.
6. Change dates: booking detail → **Change dates** → new range → the strip shows the new nights, with
   unchanged nights keeping their price → Save.

#### 3. Features (MVP vs later)
MVP: everything above, including multi-room and group bookings (one booking, many rooms, one folio).
Later: an online booking page on the tenant's site; unassigned (type-level) holds; recurring
corporate allotments; channel manager (backlog, §14).

#### 4. Entities and relationships
`hospitality_reservation` 1:1 `bookings_booking` (the subject: `subject_type =
"hospitality_reservation"`, `subject_id = reservation.id`); N:1 `parties_party` (guest) and N:1
`parties_party` (bill-to, nullable). Units are the engine's `bookings_booking_unit`; each unit has one
`hospitality_night` per night. `hospitality_guest` (the role profile) is created on the party's first
booking.

#### 5. Database
`hospitality_reservation`

| Column | Type | Constraint |
|---|---|---|
| `booking_id` | uuid | OneToOne `bookings.Booking`, RESTRICT |
| `number` | varchar(32) | `BKG/26-27/0042`; UNIQUE `(tenant, number)` |
| `party_id` | uuid | FK `parties.Party`, RESTRICT, `related_name="+"` |
| `bill_to_party_id` | uuid | null, FK `parties.Party`, RESTRICT |
| `source` | varchar(12) | CHECK in (`walk_in`,`phone`,`direct`,`agent`,`ota`,`other`) |
| `source_name` | varchar(60) | default '' |
| `external_ref` | varchar(60) | default ''; trimmed, case-folded for matching |
| `arrival_on`, `departure_on` | date | cache: min unit start, max unit end; CHECK `departure_on > arrival_on` |
| `expected_arrival_time` | time | null |
| `adults`, `children` | smallint | cache of Σ units; `adults ≥ 1` |
| `special_requests` | varchar(500) | default '' |
| `notes` | text | default '' (internal) |
| `cancel_reason` | varchar(160) | null |
| `cancelled_at`, `no_show_at` | timestamptz | null |
| `fee_computed`, `fee_charged` | numeric(14,2) | null (HTL-07) |
| `fee_waived_by_id` | uuid | null |
| `duplicate_confirmed_by_id` | uuid | null |
| `version` | integer | |

Indexes: `ix_hospitality_res_arrival (tenant, arrival_on)`, `ix_hospitality_res_departure (tenant,
departure_on)`, `ix_hospitality_res_party (tenant, party_id, arrival_on DESC)`,
`ix_hospitality_res_extref (tenant, lower(source_name), lower(external_ref))` WHERE `external_ref <> ''`
(a warning, deliberately **not** unique: two real OTA bookings can share a short reference across
channels), trigram on `number` is not needed (prefix search by btree).

`hospitality_night` (the rate snapshot; research §4.2 `booking_night_rate`)

| Column | Type | Constraint |
|---|---|---|
| `unit_id` | uuid | FK `bookings.BookingUnit`, RESTRICT |
| `reservation_id` | uuid | FK, RESTRICT |
| `room_id` | uuid | FK `hospitality_room`, RESTRICT (the room this night was in) |
| `night_on` | date | |
| `rate_plan_id` | uuid | null, FK |
| `room_rate` | numeric(14,2) | ≥ 0 |
| `extra_beds` | smallint | ≥ 0 |
| `extra_bed_amount` | numeric(14,2) | ≥ 0 |
| `discount_amount` | numeric(14,2) | CHECK `0 ≤ discount_amount ≤ room_rate + extra_bed_amount` |
| `tax_inclusive` | boolean | copied from the plan |
| `rate_source` | varchar(16) | HTL-02 BR-1 values |
| `reason` | varchar(120) | required for `manual` below plan and `complimentary` |
| `status` | varchar(10) | CHECK in (`open`,`invoiced`,`released`) |
| `folio_id` | uuid | null, FK `hospitality_folio` (set when invoiced) |
| `tax_code_invoiced` | varchar(16) | null (the slab decided at invoicing) |
| `version` | integer | |

Constraints: `uq_hospitality_night_unit` UNIQUE `(tenant, unit_id, night_on)` WHERE `status <>
'released'` — one live price per room per night of a unit. The **room-night guarantee itself** is the
engine's `UNIQUE (tenant, resource, slot_key)` on `bookings_slot`; hospitality's service writes a
`hospitality_night` only for a slot the engine has just inserted, in the same transaction, and a
nightly check (T-HTL05-9) asserts the two sets are equal. Indexes `ix_hospitality_night_res (tenant,
reservation_id, night_on)`, `ix_hospitality_night_open (tenant, night_on)` WHERE `status = 'open'`.

`hospitality_guest` (role profile, ADR-046): `party_id` OneToOne `parties.Party` RESTRICT
`related_name="+"`, `first_booked_on date`, `notes varchar(500)`. UNIQUE `(tenant, party_id)`.

#### 6. API
| Method, path | Codename | Notes |
|---|---|---|
| `GET /bookings?q&status&arrival_from&arrival_to&stay_on&source&room_type_id&has_balance&hold_expires_today&ordering` | `booking.read` | `q`: number, guest name, mobile, external ref, room label; default ordering `arrival_on` ascending; cancelled and expired hidden unless `status` asks; `StableOrderingFilter` |
| `POST /bookings` | `booking.write` | Idempotency-Key; body below; 201 `{reservation, warnings, advance?}` |
| `GET /bookings/{id}` | `booking.read` | units, nights, stays, folio summary (document port summaries), advances, deposit |
| `PATCH /bookings/{id}` | `booking.write` | guest counts, bill-to, source fields, requests, notes, `version` |
| `PATCH /bookings/{id}/units/{unit_id}` | `booking.write` | `{room_id?, start_on?, end_on?, version}` → engine `change_unit`; nights re-derived (BR-5) |
| `POST /bookings/{id}/units` | `booking.write` | add a room (C6) |
| `PATCH /bookings/{id}/nights/{night_id}` | `booking.write` | `{room_rate?, discount_amount?, reason?, version}`; role check above the allowance |
| `POST /bookings/{id}/confirm` | `booking.write` | engine `confirm` |
| `POST /bookings/{id}/extend-hold` | `booking.write` | `{hold_until}` ≤ arrival check-in time |
| `GET /bookings/{id}/confirmation` | `booking.read` | print data and the WhatsApp text (HTL-17) |

`POST /bookings` body:
```json
{ "party_id": null, "new_party": {"name": "Ramesh Kumar", "mobile": "9876543210"},
  "bill_to_party_id": null, "status": "tentative", "hold_until": "2026-10-10T18:00:00+05:30",
  "source": "ota", "source_name": "Booking.com", "external_ref": "4471-2231",
  "expected_arrival_time": "14:00", "special_requests": "Ground floor",
  "units": [{"room_id": "…", "start_on": "2026-10-14", "end_on": "2026-10-16", "adults": 2,
             "children": 0, "extra_beds": 0, "rate_plan_id": "…",
             "nights": [{"night_on": "2026-10-15", "discount_amount": "300.00", "reason": "Repeat guest"}]}],
  "advance": {"mode_breakup": [{"mode": "upi", "amount": "2000.00", "reference": "UTR…"}]},
  "confirm_duplicate": false, "version": null }
```

Service `hospitality.services.reservations.create_reservation(ctx, data)`, one transaction: validate
all → lock the guest party → create the party if new (`parties` public service) → duplicate check →
`allocate_number("booking")` is deferred to last (sequence is locked last, R4) → price every night
(HTL-02) → engine `hold()` or `book()` (locks resources in id order, inserts slot rows) → insert
reservation and nights → advance through HTL-06 if given → audit → number.

#### 7. Frontend
Routes `/hospitality/bookings`, `/bookings/new`, `/bookings/[id]`; slices `reservationList`,
`reservationForm`, `reservationDetail`; services `api/reservationService.ts`, `api/quoteService.ts`;
`BookingDrawer` (`dynamic()`, opened from the calendar, the list and the dashboard), `UnitRow`,
`NightPriceStrip`, `DuplicateBookingDialog`, `ChangeDatesDrawer`. Party search uses
`features/parties` (`UbAsyncCombobox` by mobile). Invalidations in `src/redux/invalidation/map.ts`:
`createReservation` refetches the calendar window and the today section; a false `patch` is not
declared (the LED-01 lesson).

#### 8. UI/UX
- The drawer is one column; the mobile field is first and autofocused with the numeric keypad; a known
  guest fills name, last stay and **balance owed** ("Owes ₹1,200 from 2 Aug", research EC-16).
- Dates: arrival and departure with a nights counter; departure defaults to arrival + 1.
- The night strip is visible without scrolling on a laptop; on a phone it collapses to "3 nights ·
  ₹7,872 · 1 night at 18%" with a disclosure.
- Status chips: "Tentative (hold until …)" / "Confirmed"; source chips; OTA shows name and reference.
- Save is disabled only while saving; every refusal keeps the typed values.
- Hindi: `hospitality.booking.new` "New booking" / "नई बुकिंग"; `hospitality.booking.holdUntil`
  "Hold until" / "कब तक रोकें"; `hospitality.booking.slotTaken` "Room {room} was just booked for
  {date}. Choose another room." / "कमरा {room} {date} के लिए अभी बुक हो गया। दूसरा कमरा चुनें।"

#### 9. Validation and business rules
- V-1 `end_on > start_on`; nights ≤ 90 per unit (longer: two bookings, or later interim invoices);
  arrival ≤ business date + `hospitality.booking_window_months` (18).
- V-2 Arrival before the business date: owner or admin only, with a reason (role check); walk-ins are
  always the business date.
- V-3 `adults ≥ 1`, `adults ≤ max_adults`, `children ≤ max_children`, `adults + children ≤
  base_occupancy + extra_beds`, `extra_beds ≤ max_extra_beds`, and the total ≤ `max_occupancy`
  (400 `occupancy_exceeded`).
- V-4 Mobile: the existing Indian mobile rule, or an international number when the guest's
  nationality (asked only when not Indian) is not IN.
- V-5 Every price passes HTL-02 BR-3 to BR-7.
- BR-1 One transaction: all units or none (research §4.1 "one booking can hold several rooms").
- BR-2 The engine refuses a taken slot with 409 `booking_slot_taken` (`resource_id`, `slot_keys`),
  which the API passes through unchanged, with the room label and dates added to the message.
- BR-3 Duplicate check (FR-5), before any lock is taken on resources: same `lower(source_name)` and
  `lower(external_ref)` on a non-cancelled reservation; or same party mobile with an overlapping
  active unit. `confirm_duplicate=true` saves and writes audit `duplicate_confirmed`.
- BR-4 Discount allowance: a front-desk member may discount a night by up to
  `front_desk_max_discount_pct` (default 10%) of the plan price; more, or a ₹0 night, needs owner or
  admin (role check); a ₹0 night needs a reason and `rate_source = complimentary`.
- BR-5 Changing dates or room: nights that remain keep their row and price; nights added are priced
  from the plan; nights removed become `released`. The engine's `change_unit` moves the slot rows
  under the resource lock; a clash is 409 and nothing changes.
- BR-6 Tentative holds: `hold_until` defaults to now + `tentative_hold_hours` (24), never after the
  arrival's check-in time. With `confirm_on_advance` on (default), recording an advance confirms.
- BR-7 The booking's status is the engine's (`hold`, `confirmed`, `checked_in`, `completed`,
  `cancelled`, `expired`, `no_show`), shown as Tentative, Confirmed, In house, Checked out, Cancelled,
  Hold expired, No-show. A multi-room booking is In house when any room is, Checked out when all are
  (C10).
- BR-8 The number is allocated even for a tentative booking; an expired hold keeps its number. Gaps in
  the BKG series are acceptable: it is not a tax document.

#### 10. Permissions
Read `booking.read`; write `booking.write`. Backdated arrival, discount above the allowance and ₹0
nights are role checks (§0.5).

#### 11. Reports
Source, lead time (created → arrival) and booking status feed revenue by source and the
cancellations report (HTL-16).

#### 12. Testing
- T-HTL05-1 **Concurrency, same room and night**: two transactions on two connections
  (`TransactionTestCase`, a barrier) book 104 for 14 Oct → exactly one 201, one 409
  `booking_slot_taken`; one slot row, one reservation, one BKG number consumed by the winner only.
- T-HTL05-2 **Overlapping ranges**: 14–17 and 16–18 on 104 race → one wins.
- T-HTL05-3 **Back-to-back**: 14–16 and 16–18 both succeed.
- T-HTL05-4 **Opposite room order**: booking A (101, 102) and booking B (102, 101) for the same night
  race → one wins, no deadlock within the lock timeout (resources locked in id order).
- T-HTL05-5 **Second writer**: a raw `INSERT` into `bookings_slot` for a held slot raises
  `IntegrityError` (the database, not the service, is the guarantee).
- T-HTL05-6 **Expired hold**: a hold that expired a minute ago and a new booking of that room → the
  booking succeeds before `expire_holds` runs; a concurrent `confirm` of the expired hold → 409
  `booking_not_open`.
- T-HTL05-7 **Change dates race**: extending one booking into 17 Oct while another books 17 Oct →
  one wins; the loser's booking is unchanged.
- T-HTL05-8 multi-room with one taken room → nothing is written (no partial booking, no nights).
- T-HTL05-9 nightly integrity: the set of live `hospitality_night` equals the set of active slots for
  hospitality units (report-only, like `check_balances`).
- T-HTL05-10 duplicate by OTA reference; by mobile and overlap; `confirm_duplicate` saves and audits.
- T-HTL05-11 discount above 10% by staff → 403 `override_not_allowed`; by owner → saved.
- T-HTL05-12 e2e: two browser contexts save 104 for the same night within 100 ms; one sees the
  booking, the other sees the clash message with its typed values intact.

#### 13. Edge cases
EC-1 The guest arrives a day early → change dates if the night is free (research EC-2). EC-2 Free
upgrade → change room to another type, keep prices, `rate_source = manual`, reason "Complimentary
upgrade" (research EC-6). EC-3 Group of 8 rooms, one agent pays → one booking, eight units, bill-to the
agent, one folio (research EC-8). EC-4 The same guest books two separate stays → two bookings; each
advance stays with its own booking (HTL-06). EC-5 A booking across 31 March → its number is from the
FY of the booking date; the invoice later takes the FY of the check-out date (research EC-28).
EC-6 A tentative booking reaches its hold time while the clerk is editing it → the save is 409
`booking_not_open` with "The hold expired at 18:00. Book again?" prefilled.

#### 14. Future
**OTA channel managers are out of scope and go to `docs/BACKLOG.md` under ADR-021**, with the
research's reason (research §16): a channel manager is a live two-way integration — pushing
availability and rates to each OTA and pulling reservations, changes and cancellations in near real
time; Booking.com connects only through certified connectivity partners; it needs per-channel HTTPS
clients, webhook endpoints, stored OTA credentials, retries, reconciliation and a worker faster than
the cron scheduler, each a new dependency or external service; and it creates an overbooking race
the unique constraint cannot close, because the other side of the race is the OTA's server. Even iCal
sync means fetching external URLs on a schedule. The MVP instead records OTA bookings by hand with the
source, the reference and the duplicate warning, and the OTA as a party for prepaid bookings and
commission bills. (This FRD does not edit `BACKLOG.md`; the entry is task HTL-T28.) Later also: an
online booking page, unassigned holds, allotments.

---
## HTL-06 — Advances, refunds and security deposits

#### 1. Product requirements
- FR-1 An **advance** is a payment in on the guest's party with **no allocation**
  (`record_payment(..., allocations="none")`), linked to the booking in `hospitality_advance`. Like
  every payment, it moves the party's balance into advance through the ledger. Hospitality holds no
  balance of its own.
- FR-2 At check-out (HTL-13), or when a cancellation charge is invoiced (HTL-07), the booking's
  advances are applied to that invoice with `allocate_existing` (ADR-047), oldest first.
- FR-3 A **refund** is a payment out on the same party with no allocation, linked as `kind=refund`.
- FR-4 A **security deposit** (off by default) is a held deposit (ADR-044):
  `open_deposit(module="hospitality", subject_type="hospitality_reservation", ...)`. It is received as
  a payment in to the `held_deposit` target (bucket `deposit`, never in the balance, never income). It
  is refunded at check-out, or applied to a damage charge with `apply_deposit`.
- FR-5 Every advance and refund prints the existing payment receipt (PAY-04). Its note names the
  booking: "Advance for BKG/26-27/0042, Room 104, 14–16 Oct".
- FR-6 The "Advances held" report (HTL-16) gives the CA the figure that GSTR-1 Table 11A needs
  (research §6.5). A GST receipt voucher on the receipt is a CA decision (TL-9) and is not in the MVP.

#### 2. User flows
- **Advance.** In the booking drawer or on the booking page, tap **Take advance** and enter the amount,
  the mode (split up to four) and the reference. Save. The receipt is ready to print or share. A
  tentative booking becomes Confirmed (setting).
- **During the stay.** The same act from the stay page ("Take payment"), linked to the booking.
- **Refund.** On the booking page, tap **Refund** and enter the amount (at most what is held for this
  booking), the mode and a reason. Save.
- **Deposit.** At check-in, "Security deposit ₹1,000" is received (when the setting is on). At
  check-out the deposit panel offers **Refund ₹1,000** or **Use for a charge**, which posts a damage
  charge and then applies the deposit to it.

#### 3. Features (MVP vs later)
**MVP:** advances, refunds, deposits, receipts, and the held figure per booking.

**Later:**
- a GST receipt voucher (Rule 50) with tax particulars;
- moving an advance from the booker to a bill-to company, which needs both parties' consent (research
  §6.7, owner question);
- payment links, which need a gateway.

#### 4. Entities and relationships
`hospitality_advance` is N:1 to `hospitality_reservation` and 1:1 to `payments_payment`. A deposit is a
`payments_held_deposit` whose `subject_id` is the reservation. Hospitality keeps no deposit table.

#### 5. Database
`hospitality_advance`

| Column | Type | Constraint |
|---|---|---|
| `reservation_id` | uuid | FK, RESTRICT |
| `payment_id` | uuid | OneToOne `payments.Payment`, RESTRICT (a core row, which 10-architecture §5 rule 4 allows) |
| `kind` | varchar(8) | CHECK in (`advance`,`refund`) |
| `created_by_id`, `created_at` | | |

Index `ix_hospitality_advance_res (tenant, reservation_id, created_at)`.

The held figure is derived, never cached. For a booking it is Σ `unallocated_amount` of its recorded
(not void) advances − Σ `amount` of its recorded refunds, floored at 0. A refund is its own payment out
and does not allocate against the advance, so the advance's `unallocated_amount` stays until an
invoice absorbs it; the formula nets the two. Replay test T-HTL06-5 proves it.

#### 6. API
| Method, path | Codename | Calls |
|---|---|---|
| `POST /bookings/{id}/advances` | `booking.write` + `payments.payment.write` | `record_payment(direction="in", party_id=reservation.party_id, allocations="none", note=…, meta={"module": "hospitality", "reservation_id": …}, context="hospitality")`; Idempotency-Key |
| `GET /bookings/{id}/advances` | `booking.read` | advances, refunds, applied amounts (from `payments_allocation`), the held figure |
| `POST /bookings/{id}/refunds` | `booking.write` + `payments.payment.write` | `record_payment(direction="out", allocations="none", …)`. A refund above the booking's held figure is 400 `validation_error`, "Refund at most ₹{held}" (`deposit_insufficient` is for deposits only) |
| `POST /bookings/{id}/deposit` | `booking.write` | `open_deposit` + `receive_deposit` |
| `POST /bookings/{id}/deposit/refund` | `stay.check_out` | `refund_deposit` |
| `POST /bookings/{id}/deposit/apply` | `stay.check_out` | `apply_deposit(allocations=[{document_type: "sales_document", document_id: invoice}])`, after the damage charge is invoiced |

Errors pass through from payments: `validation_error`, `over_allocated`, `payment_already_void`,
`deposit_insufficient`, `deposit_released`.

#### 7. Frontend
- Components in `features/hospitality/components`: `AdvanceDrawer`, `RefundDrawer` and `DepositPanel`,
  all loaded with `dynamic()`.
- Service: `api/advanceService.ts`.
- The mode-breakup input reuses `features/payments` components (allowed, because payments is a core
  feature).
- The receipt prints from the existing payments receipt route.

#### 8. UI/UX
- The booking header shows "Advance ₹2,000 · held" beside the total. After check-out it shows "Applied
  to INV/26-27/0311".
- Copy never says a receipt was sent (DEC-012): "Receipt ready · Share on WhatsApp".
- Copy keys:

| Key | English | Hindi |
|---|---|---|
| `hospitality.advance.take` | Take advance | एडवांस लें |
| `hospitality.deposit.title` | Security deposit | ज़मानत राशि |
| `hospitality.refund.max` | Refund at most {amount} | ज़्यादा से ज़्यादा {amount} लौटाएँ |

#### 9. Validation and business rules
- BR-1 An advance is always on one party, chosen by a `payer` field (`guest` or `bill_to`):
  - `guest` (the default): the booking's guest party, `reservation.party_id`;
  - `bill_to`: when a company pays in advance for its guest, the advance is the company's, on a booking
    whose bill-to is that company (`bill_to_party_id`).
- BR-2 Application at check-out uses only this booking's advances whose party equals the invoice's
  party. `allocate_existing` refuses a mismatch (target party ≠ payment party).
- BR-3 A deposit is never applied automatically. Both deposit targets are `auto = False` (ADR-044), and
  hospitality never calls `apply_deposit` without the clerk's act.
- BR-4 A deposit counts as an open record for the module-off and party-archive guards
  (10-architecture §9).
- BR-5 An advance payment can be voided (PAY-05) while it is unallocated. The booking's held figure
  drops at once.

#### 10. Permissions
Taking or refunding money needs `payments.payment.write` on top of `hospitality.booking.write`. The
screen names the missing codename before submitting.

#### 11. Reports
- "Advances held" (HTL-16), as of any date, by booking.
- "Money today" in the day close (HTL-14).

#### 12. Testing
- T-HTL06-1 An advance posts one ledger `payment_in` line in bucket `main`, the party goes into
  advance, and no hospitality table stores an amount.
- T-HTL06-2 Check-out applies the booking's advances oldest first. A second advance of the same party,
  for a different booking, is untouched.
- T-HTL06-3 A deposit receipt moves `party.deposit_held`, not `party.balance`, and the refund returns it
  to 0. The cashbook shows both; it excludes the adjustment payments of an application.
- T-HTL06-4 Concurrency: a refund and a check-out applying the same advance race. The totals never
  exceed the advance: one of the two sees the reduced figure and is refused or takes less.
- T-HTL06-5 Replay: the held figure recomputed from payments rows equals the one the screen shows, over
  a fuzzed sequence of advances, refunds, applications and voids.

#### 13. Edge cases
- EC-1 Booker and bill-to differ. The booker's advance stays the booker's. The check-out screen shows
  "₹2,000 advance is on Ramesh's account, not ABC Travels'" with a Refund action.
- EC-2 A hold expires with an advance taken (setting off). The booking shows "Hold expired · advance
  ₹2,000 held" in the advances report until it is refunded.
- EC-3 Another module (gym dues) auto-applies the same party's open advances, so the hotel advance
  could be consumed (contract question C3). Until that is answered, the booking page shows the document
  the advance went to, so the clerk can see where it went.

#### 14. Future
A GST receipt voucher with tax particulars (after the CA's answer); advance transfer between parties
with consent; payment links.

---

## HTL-07 — Cancellation and no-show

#### 1. Product requirements
- FR-1 Only Tentative or Confirmed bookings can be cancelled. "Cancel" after check-in is an early
  check-out (HTL-12, research EC-13).
- FR-2 The charge is suggested from the tier in force at the moment of cancelling, counted in hours
  before arrival (the arrival date at the check-in time). The default is free until 48 h before
  arrival, then one night.
- FR-3 The front desk may **lower** the charge. Only the owner or an admin may **waive** it (role
  check, research §6.8).
- FR-4 A charge above ₹0 is a supply:
  1. It is invoiced through the port on a folio of kind `cancellation`: one line, SAC 996311, at the
     slab of the first night's value (TL-5).
  2. The booking's advances are applied to that invoice.
  3. The rest is refunded (a payment out) or left on the party's account.
- FR-5 **No-show.** A confirmed arrival not checked in by `check-in time + no_show_after_hours` (6) is
  offered as a no-show, from the arrivals list and from the day close. The charge (default one night)
  follows FR-4, with its own reason code. Nothing marks a no-show automatically, because a no-show
  posts money.
- FR-6 Cancelling or marking a no-show releases every night in the same transaction (engine `cancel`
  and `mark_no_show` delete the slot rows).

#### 2. User flows
1. On the booking page, tap **Cancel booking**. The dialog opens with:
   - a reason (required, at least 3 characters);
   - the suggested charge and its tier in words: "Cancelled 20 h before arrival: one night, ₹3,200 +
     GST ₹160";
   - the amount, which front desk can only lower;
   - **Waive** (owner or admin only);
   - what happens to the ₹5,000 advance: "₹3,360 applied to the cancellation invoice, ₹1,640 → Refund
     now / Keep on account".
2. Tap **Cancel booking**. The result lists the invoice number and the refund receipt.

#### 3. Features (MVP vs later)
**MVP:** tiers by hours, charged as "nights" or as a "percent of the booking value"; lowering; waiving;
the invoice, the advance applied, and the refund or hold; no-show with the same machinery.

**Later:**
- per-plan policies (non-refundable rates);
- partial cancellation of one room of several (in the MVP, change the booking to drop the room, BR-6);
- a credit-note route for a charge waived after it was invoiced.

#### 4. Entities and relationships
- On `hospitality_reservation`: `fee_computed`, `fee_charged`, `cancel_reason`, `cancelled_at`,
  `no_show_at`.
- A `hospitality_folio` with `kind='cancellation'` or `'no_show'`, holding one
  `hospitality_folio_charge` of the same kind.
- The invoice, through the port.
- The advances, through HTL-06.

#### 5. Database
No new table: this feature uses HTL-05's columns and HTL-11's folio tables. The tiers are a setting,
`hospitality.cancellation_tiers`: a list of `{hours_before, charge_kind: "nights"|"percent", value}`
ordered by `hours_before` descending. Contract question C8 asks where the engine keeps tiers.

#### 6. API
| Method, path | Codename | Notes |
|---|---|---|
| `GET /bookings/{id}/cancellation-preview?at` | `booking.write` | `{tier, fee, fee_lines (priced), gst_preview, advances_held, settlement_options}` |
| `POST /bookings/{id}/cancel` | `booking.write` (+ `sales.invoice.write` if the fee > 0, + `payments.payment.write` if there is a refund) | `{reason, fee_amount, waive, settle: "refund"|"hold", refund_mode_breakup?, version}`; Idempotency-Key |
| `POST /bookings/{id}/no-show` | same | same body |

Errors:
- 409 `booking_not_open` (engine);
- 403 `override_not_allowed` (front desk raising or waiving the charge);
- 400 `validation_error` (a fee above the booking value, or a refund above the held figure).

Service order (R4):
1. Lock the party, then the reservation.
2. Engine `cancel`, which locks the resources and deletes the slots.
3. `issue_document` for the fee, with `origin_type="hospitality_folio"` and `credit_check="skip"`. An
   agreed charge is never refused by the credit limit; this applies ADR-048's rule here.
4. `allocate_existing` for the advances.
5. `record_payment(direction="out")` for the refund.
6. Audit.

#### 7. Frontend
`CancelBookingDialog` and `NoShowDialog`, both loaded with `dynamic()` and fed by the preview endpoint.
The reason uses the `UbReasonDialog` pattern.

#### 8. UI/UX
- The dialog states every consequence before the button (the Part 17 rule): the nights released, the
  invoice, the advance applied, the refund. The button reads "Cancel booking and refund ₹1,640".
- The safe choice has focus. Focus the "Keep booking" button explicitly rather than leaving it to the
  first focusable element (the CLAUDE.md autofocus lesson).
- Copy keys:

| Key | English | Hindi |
|---|---|---|
| `hospitality.cancel.title` | Cancel booking | बुकिंग रद्द करें |
| `hospitality.noShow.title` | Guest did not come | मेहमान नहीं आए |

#### 9. Validation and business rules
- BR-1 Hours before = (arrival_on at `check_in_time`, tenant-local) − now. The tiers are listed from the
  largest; the first tier whose `hours_before` is at most that figure gives the charge.
- BR-2 A "nights" charge prices the first N nights as booked (`room_rate + extra_bed_amount −
  discount`). A "percent" charge is that percent of the booking's room value, rounded with `q2`.
- BR-3 The fee's slab is the first night's (TL-5). Inclusive plans keep their inclusive basis.
- BR-4 `0 ≤ fee_amount ≤` the booking's room value. Front desk may lower the fee, not raise it.
  `waive=true`, or a fee of 0 when the tier suggests more, needs owner or admin.
- BR-5 A fee of 0 issues no invoice; the whole advance is refunded or held.
- BR-6 Dropping one room of a multi-room booking before arrival is a change (HTL-05 BR-5), not a
  cancellation, and charges nothing in the MVP.
- BR-7 A no-show uses `no_show_charge` (default one night) instead of the tiers.

#### 10. Permissions
`booking.write`, with the money codenames on top. Waiving and raising the charge are role checks.

#### 11. Reports
Cancellations and no-shows (HTL-16): the count, lead time, amount charged and amount waived, by source.

#### 12. Testing
- T-HTL07-1 Tier boundaries: 48 h 1 min before arrival is free; 47 h 59 min is one night.
- T-HTL07-2 A cancellation releases its slots: the room is bookable for those nights in the same
  second.
- T-HTL07-3 A fee of ₹3,200 at 5% gives an invoice of ₹3,360 (engine-checked). Against a ₹5,000
  advance, ₹3,360 is allocated and ₹1,640 refunded. The party balance ends at 0, and the ledger has the
  invoice debit, the advance credit and the refund debit.
- T-HTL07-4 A staff waiver is 403. An owner waiver issues no invoice and writes audit
  `charge_waived`.
- T-HTL07-5 Concurrency: a cancel and a check-in of the same booking race. One wins; the loser gets 409
  `booking_not_open`.
- T-HTL07-6 Voiding a cancellation invoice makes the origin listener reopen the folio, and the booking
  stays cancelled. The charge can be issued again or waived.

#### 13. Edge cases
- EC-1 Cancelling after the hold expired: there is nothing to cancel (`booking_not_open`). The advance
  is refunded from the advances panel.
- EC-2 A company bill-to with no advance: the fee invoice goes on the company's account.
- EC-3 A booking whose first night straddles a slab change: the slab set in force on the invoice date
  applies (TL-8).

#### 14. Future
Per-plan policies, non-refundable rates, and a retention charge for early check-out (research §6.4;
the MVP default is no charge).

---

## HTL-08 — Walk-in

#### 1. Product requirements
- FR-1 **Walk-in** creates a booking and checks it in, in one flow and one transaction, so reports and
  the calendar need no special case (research §3.2).
- FR-2 Dates default to tonight (the business date) through the next day. The room list shows rooms
  free for those nights, **clean first**, then Needs cleaning with a warning.
- FR-3 The guest is a party, created by mobile if new. There is no walk-in without a party: the
  register needs a mobile anyway (research §15.2), and the port requires the invoice's `party_id`.
- FR-4 Everything check-in needs (HTL-09) is captured on the same screen.

#### 2. User flows
1. Tap **+ Walk-in** in the bottom nav.
2. Choose the nights (1 is preselected).
3. Pick a free room from the cards, such as "103 · Standard · Clean · ₹3,200".
4. Enter the mobile, then the name.
5. Enter adults and children, then the register fields (HTL-09).
6. Optionally take an advance or a deposit.
7. Tap **Check in**. The stay page opens with the registration card ready to print.

#### 3. Features (MVP vs later)
**MVP:** as above.

**Later:** day use as a true zero-night stay. In the MVP a day use is a one-night booking at a manual
day-use price (research §6.3).

#### 4. Entities and relationships
The same as HTL-05 and HTL-09: one reservation (`source='walk_in'`), one unit, its nights, one stay and
its occupants.

#### 5. Database
No new table.

#### 6. API
`POST /walk-ins` (`booking.write` + `stay.check_in`, Idempotency-Key):
- **Body:** HTL-05's unit and party fields plus HTL-09's check-in body.
- **Engine calls:** `book()`, then `check_in()`, in one transaction.
- **Response:** 201 `{reservation, stay, warnings}`.
- **Errors:** the union of HTL-05's and HTL-09's.

#### 7. Frontend
- Route `/hospitality/walk-in`.
- Slices `reservationForm` and `checkIn`, both lazy.
- `WalkInPage` composes `RoomPicker` (free-room cards), `GuestFields` and `RegisterFields` (from
  HTL-09).

#### 8. UI/UX
- On a phone it is one scrolling page with a sticky **Check in** button. Sections collapse once
  complete, for example "Room 103 · 1 night · ₹3,360 ✓".
- Time targets: a returning domestic guest in at most 30 s, a new couple in at most 60 s (HTL-09 §8).

#### 9. Validation and business rules
- BR-1 Arrival is always the business date.
- BR-2 The room must be free for every night. A dirty room asks "Room 104 needs cleaning. Check in
  anyway?"
- BR-3 All of HTL-05 V-1 to V-5 and HTL-09's rules apply.

#### 10. Permissions
`booking.write` and `stay.check_in`. An advance adds `payments.payment.write`.

#### 11. Reports
Walk-ins appear as source `walk_in` in revenue by source.

#### 12. Testing
- T-HTL08-1 A walk-in writes the reservation, the unit (checked in), the nights, the stay and the
  occupants, or nothing at all.
- T-HTL08-2 **Concurrency**: a walk-in and a phone booking race for the last clean room tonight. One
  wins. The walk-in loser keeps its guest fields and is offered the next free room.
- T-HTL08-3 At 01:30, the walk-in's night is the previous date (R1).

#### 13. Edge cases
- EC-1 No clean room is free: the list shows Needs-cleaning rooms with the warning, and then "No room
  free tonight".
- EC-2 A walk-in at 05:00 who leaves at 11:00 stays one night, the previous date's (R1), with no early
  charge.

#### 14. Future
Zero-night day use. A kiosk-style self check-in would need guest identity and is not planned.

---

## HTL-09 — Check-in and the guest register

#### 1. Product requirements
- FR-1 Check-in turns a unit into a **stay** (engine `check_in(unit)`, status `checked_in`) and records
  the **guest register** rows for the primary guest and every co-guest (research §6.9).
- FR-2 The register fields are a **superset of the police-register fields** found (research §6.9):
  - the full name of every adult, their age and gender;
  - address, mobile and nationality;
  - ID type and last four characters;
  - arrival date and time, and expected departure;
  - coming from, going to, and purpose;
  - vehicle number and room.

  Which fields are required is a setting (`hospitality.required_register_fields`) with a sensible
  default.
- FR-3 **ID: type plus last four only** (ADR-053, binding). Whatever is typed into the ID field, the
  server keeps the last four characters, and the database refuses more. No image is stored, ever, in
  the MVP.
- FR-4 The primary guest is a party (the booking's guest by default). Co-guests are register rows with
  an optional link to a party for regulars (ADR-046). A minor cannot be the primary guest.
- FR-5 A **registration card** prints for the guest's signature, with the tenant's privacy notice
  (HTL-17, HTL-19).
- FR-6 **Undo check-in** is allowed within `undo_check_in_minutes` (15) if nothing was posted (no
  charge, payment or invoice). The unit returns to confirmed, and the stay and occupants are deleted
  with an audit row that keeps them (research EC-14).
- FR-7 **Check-in takes under a minute** for a domestic couple (§8).
- FR-8 A stay can be marked as **submitted to a police portal** (named by the tenant, such as "Pathik"
  or "CCTNS") with a reference, so the owner can show it (research §6.9 item 3).

#### 2. User flows
1. On Today, under Arrivals, tap **Check in** on "Ramesh K. · 104 · 2 nights".
2. The check-in page opens prefilled: name, mobile and address from the party, and the guest counts
   from the booking.
3. For the primary guest, pick the ID type chip (Aadhaar), type the last four ("4821"), confirm the
   nationality (India is preselected), pick the purpose chip, and enter where they came from and are
   going to.
4. Add a co-guest row: name, age and relation.
5. If the guest is early, the HTL-12 banner appears before the band applies.
6. Take the deposit, if the setting is on.
7. Tap **Check in**. The stay page opens with **Print registration card**.

#### 3. Features (MVP vs later)
**MVP:** the above, police-portal marks, the registration card and undo.

**Later:**
- a signature on screen;
- ID images (an ADR is needed);
- Aadhaar offline QR verification (under the UIDAI verifying-entity rule, and an external service);
- field presets per district.

#### 4. Entities and relationships
- `hospitality_stay`: 1:1 `bookings_booking_unit`; N:1 reservation, room and folio (HTL-11).
- `hospitality_stay_occupant`: N:1 stay, with an optional N:1 party.
- `hospitality_foreign_guest`: 1:1 occupant (HTL-10).
- `hospitality_police_submission`: N:1 stay.

#### 5. Database
`hospitality_stay`

| Column | Type | Constraint |
|---|---|---|
| `unit_id` | uuid | OneToOne `bookings.BookingUnit`, RESTRICT |
| `reservation_id` | uuid | FK, RESTRICT |
| `room_id` | uuid | FK `hospitality_room`, RESTRICT |
| `room_label` | varchar(24) | snapshot for the register |
| `folio_id` | uuid | FK `hospitality_folio`, RESTRICT |
| `checked_in_at` | timestamptz | |
| `checked_in_by_id` | uuid | FK user |
| `checked_out_at`, `checked_out_by_id` | | null |
| `arriving_from`, `going_to` | varchar(80) | default '' |
| `purpose` | varchar(12) | CHECK in (`tourism`,`business`,`pilgrimage`,`medical`,`family`,`education`,`other`) |
| `vehicle_number` | varchar(16) | default ''; upper-cased, spaces removed |
| `registration_card_printed_at` | timestamptz | null |
| `version` | integer | |

Index `ix_hospitality_stay_in_house (tenant, checked_in_at)` WHERE `checked_out_at IS NULL`.

`hospitality_stay_occupant`

| Column | Type | Constraint |
|---|---|---|
| `stay_id` | uuid | FK, RESTRICT |
| `party_id` | uuid | null; FK `parties.Party`, RESTRICT |
| `is_primary` | boolean | |
| `full_name` | varchar(120) | not blank (kept after the purge) |
| `gender` | varchar(10) | CHECK in (`female`,`male`,`other`,`not_stated`) |
| `age` | smallint | null; 0–120 |
| `relation` | varchar(40) | default '' ("Wife", "Son", "Colleague") |
| `nationality` | char(2) | ISO 3166-1 alpha-2; default `IN` |
| `is_foreign` | boolean | `nationality <> 'IN'`, set by the service (a CHECK keeps them equal) |
| `id_type` | varchar(16) | null; CHECK in (`aadhaar`,`passport`,`driving_licence`,`voter_id`,`pan`,`other_photo_id`) |
| `id_last4` | varchar(4) | null; **CHECK `char_length(id_last4) <= 4`** (ADR-053) |
| `address_line` | varchar(200) | default '' |
| `city` | varchar(60) | default '' |
| `state_code` | char(2) | null |
| `country` | char(2) | default `IN` |
| `mobile` | varchar(15) | default '' (optional for co-guests) |
| `retention_until` | date | set at check-out (HTL-19) |
| `purged_at` | timestamptz | null |

Constraints:
- `uq_hospitality_occupant_primary`: UNIQUE `(tenant, stay_id)` WHERE `is_primary`;
- `ck_hospitality_occupant_primary_party`: CHECK (`NOT is_primary OR party_id IS NOT NULL`);
- `ck_hospitality_occupant_primary_adult`: CHECK (`NOT is_primary OR age IS NULL OR age >= 18`).

Indexes:
- `ix_hospitality_occupant_stay (tenant, stay_id)`;
- `ix_hospitality_occupant_retention (tenant, retention_until)` WHERE `purged_at IS NULL`;
- a trigram index on `upper(full_name)` for register search (`pg_trgm` is already installed).

`hospitality_police_submission`: `stay_id` (FK, RESTRICT), `portal varchar(40)`,
`submitted_at timestamptz`, `submitted_by_id`, `reference varchar(60)`. UNIQUE
`(tenant, stay_id, lower(portal))`.

#### 6. API
| Method, path | Codename | Notes |
|---|---|---|
| `POST /bookings/{id}/units/{unit_id}/check-in` | `stay.check_in` | body below; engine `check_in(unit_id, at)`; 201 `{stay, form_iii: [...], warnings}` |
| `POST /stays/{id}/undo-check-in` | `stay.undo_check_in` | `{reason}`; 409 `stay_has_postings`, `undo_window_passed` |
| `GET /stays?in_house=true&q&room_type_id&has_balance&foreign` | `booking.read` | |
| `GET /stays/{id}` | `booking.read` | occupants without `id_type`/`id_last4` unless the member holds `guest_id.reveal` (`RestrictedFieldsMixin`) |
| `PATCH /stays/{id}` | `stay.check_in` | register fields while the guest is in house; after check-out, owner or admin only |
| `POST /stays/{id}/occupants`, `PATCH /occupants/{id}` | `stay.check_in` | |
| `GET /stays/{id}/registration-card` | `booking.read` | print data (HTL-17) |
| `POST /stays/{id}/police-submissions` | `stay.check_in` | `{portal, reference, submitted_at}` |

Check-in body:
```json
{ "at": null, "arriving_from": "Lucknow", "going_to": "Varanasi", "purpose": "pilgrimage",
  "vehicle_number": "UP32AB1234", "early_charge": {"accept": true},
  "occupants": [
    {"is_primary": true, "party_id": "…", "full_name": "Ramesh Kumar", "gender": "male", "age": 42,
     "nationality": "IN", "id_type": "aadhaar", "id_number": "XXXX XXXX 4821",
     "address_line": "12 Station Road", "city": "Lucknow", "state_code": "09", "mobile": "9876543210"},
    {"is_primary": false, "full_name": "Sunita Kumar", "gender": "female", "age": 39, "relation": "Wife"}],
  "deposit": null, "override_reason": null, "version": 3 }
```
`id_number` is accepted only to be cut. The service keeps `re.sub(r"[^0-9A-Za-z]", "", value)[-4:]` and
never logs, echoes or stores the input (T-HTL09-2). `at` (a backdated check-in time) is for owner or
admin only.

#### 7. Frontend
- Route `/hospitality/check-in/[unitId]`; slice `checkIn`; service `api/stayService.ts`.
- Components:
  - `RegisterFields` and `OccupantRows`;
  - `IdLast4Input`: a four-character input that accepts a paste of the full number and keeps the last
    four **on the client too**, so the full number never leaves the device;
  - `ForeignGuestFields` (HTL-10).
- The schema `checkInSchema` builds its required set from the settings.

#### 8. UI/UX
**Check-in in under a minute.** The default required set for a domestic stay is the primary guest's
name, mobile, city, ID type, ID last four and nationality (preselected), plus each co-guest's name and
age. That is **nine inputs for a couple, six of them already filled for a returning guest.** Everything
else is optional and collapsed under "More details".

Design rules that buy the time:
- Prefill from the party and the last stay: address, the city they came from, vehicle.
- Use chips instead of dropdowns for ID type, purpose, gender and relation.
- The ID field opens the numeric keypad for Aadhaar and the text keypad for a passport.
- "Add co-guest" adds a row with the name focused. "Same address as primary" is on by default.
- The Check in button is sticky, and enabled as soon as the required set is valid.
- Errors appear under a field only after it is left (`mode: 'onTouched'`). The page's first focus is set
  explicitly, so no field opens red (the LED-01 defect).
- The e2e harness fills the required set with scripted typing and asserts at most 9 required inputs and
  a completed check-in (T-HTL09-8).

Every label is in Hindi and English. Hindi examples: "पहचान पत्र का प्रकार", "आख़िरी 4 अंक", "कहाँ से
आए", "कहाँ जाएँगे", "आने का कारण", "गाड़ी नंबर", "साथ में कौन है".

Layout: a single column on a phone; two columns on desktop (guest | stay), with co-guests as a compact
table.

#### 9. Validation and business rules
- V-1 The unit is confirmed (not a hold, not closed); otherwise 409 `booking_not_open`. A tentative
  booking is confirmed implicitly by checking in.
- V-2 The room is free on every night (it is, because the unit holds the slots). A Needs-cleaning room
  gives a warning.
- V-3 The primary guest's age, when given, is at least 18 (research EC-19). Required fields follow the
  settings.
- V-4 ID: `id_type` from the list; `id_last4` is 1–4 characters after stripping. Under 18, ID is
  optional (setting). Aadhaar takes digits only.
- V-5 The occupant count equals the unit's `adults + children`. A mismatch gives a warning with "Update
  guest count", which changes the unit under HTL-05's rules.
- V-6 A foreign occupant needs HTL-10's fields or an override reason (409
  `foreign_details_incomplete`).
- BR-1 Check-in, in one transaction:
  - stamps `checked_in_at` (now, or `at` for owner or admin);
  - creates the stay on the reservation's open stay folio (creating the folio if there is none,
    HTL-11);
  - creates the occupants, and the Form III arrival rows for foreign occupants (HTL-10);
  - makes the room occupied (derived, not stored).
- BR-2 Early arrival bands (HTL-12) are evaluated from `checked_in_at` and shown before saving.
- BR-3 Undo is allowed only:
  - inside the window;
  - by owner or admin, or by the member who checked the guest in;
  - when the folio has no charge, the booking has no payment since check-in, and there is no invoice.

  The engine unit goes back to confirmed through the inverse of `bookings.check_in` (C10). The audit row
  keeps the deleted occupants, minus the ID fields.

#### 10. Permissions
- Check-in: `stay.check_in`.
- Showing ID fields: `guest_id.reveal`.
- Undo: `stay.undo_check_in` (front desk only for its own check-ins, within the window).
- A backdated `at` is a role check.

#### 11. Reports
The guest register (HTL-16) is these rows. They also feed the in-house and arrivals lists (HTL-15).

#### 12. Testing
- T-HTL09-1 Check-in writes the stay, the occupants and the Form III rows in one transaction.
- T-HTL09-2 **ADR-053**: an `id_number` of "1234 5678 9012" stores "9012". A raw INSERT with a
  five-character `id_last4` fails the CHECK. Neither the request log nor the audit row ever contains the
  twelve digits.
- T-HTL09-3 Stay detail without `guest_id.reveal` omits the `id_type` and `id_last4` keys entirely.
- T-HTL09-4 Undo inside 15 min with nothing posted returns the unit to confirmed. After a charge it is
  `stay_has_postings`; after 16 min it is `undo_window_passed`.
- T-HTL09-5 **Concurrency**: two devices check in the same unit. One gets 201; the other gets 409
  `booking_not_open` or `stale_version`. There is one stay row.
- T-HTL09-6 A primary guest aged 16 is refused with 400. A co-guest aged 16 without ID is saved.
- T-HTL09-7 Required fields follow the setting: turning "vehicle number" on makes it required.
- T-HTL09-8 e2e: a domestic couple's check-in with at most 9 required inputs, then the registration card
  in print media.

#### 13. Edge cases
- EC-1 A guest without any ID at 1 a.m.: the owner's setting decides whether ID is required. When it
  is, check-in is refused with the field named. The product offers no override for domestic ID, because
  the register exists for the police.
- EC-2 A family where the booker is not staying: the primary occupant is another party (created from
  the check-in form), and the booking's guest party stays the payer.
- EC-3 A regular co-guest: link them to their party with the search, and their details prefill.

#### 14. Future
On-screen signature, ID images under a future encryption ADR, Aadhaar verification, district presets.

---

## HTL-10 — Foreign guests and Form III

#### 1. Product requirements
- FR-1 A foreign nationality on any occupant (OCI cardholders included, research §6.10) requires the
  foreign-guest block before check-in completes. The clerk can instead override with a reason, because
  a guest at 1 a.m. without a visa copy is real. An override puts the stay on the **exceptions** list.
- FR-2 Every foreign occupant gets two **Form III** rows:
  - arrival, due 24 h after `checked_in_at`;
  - departure, due 24 h after `checked_out_at`, created at check-out.
- FR-3 Each row has a **countdown**: amber from 12 h elapsed, red from 20 h, and "Overdue" after 24 h.
  The bell raises `hospitality.form_iii_due` at 12 h and `hospitality.form_iii_overdue` at 24 h. The
  dashboard tile cannot be dismissed (research §6.10).
- FR-4 A **copy sheet** lists what the stay record holds, in portal order, so the clerk can type it
  into e-FRRO. **The clerk types the passport and visa numbers from the passport itself**, because the
  product holds only their last four (ADR-053).
- FR-5 **Mark filed** records the FRRO reference and the time, separately for arrival and departure. The
  reference can be corrected, with an audit row.
- FR-6 **The product cannot file Form III** and never claims to. There is no public API, and the portal
  needs a logged-in host with an OTP (research §6.10).
- FR-7 Nepal and Bhutan citizens stay on the list with the note "May be exempt: confirm with your
  adviser" until TL-16 is answered (research EC-18).

#### 2. User flows
**At check-in:**
1. Enter the nationality, for example "United Kingdom". The Foreign guest section opens.
2. Enter the passport's last four and expiry; the visa kind (e-Visa, regular or OCI); the visa's last
   four and expiry; the date of arrival in India; the port of arrival; the country arrived from; and the
   next destination.
3. Tap Check in. A banner shows "Form III due in 24 h".

**Filing:**
1. In the Form III list, open the row "J. Smith · arrival · 13 h left" (amber).
2. Open the **Copy sheet**, and file on e-FRRO.
3. Tap **Mark filed** and enter the reference ("FRRO-…"). The row turns to "Filed 14:20".

#### 3. Features (MVP vs later)
**MVP:** the above.

**Later:** portal filing (there is no API); a printable pack for several guests at once; visa-expiry
reminders for long stays.

#### 4. Entities and relationships
`hospitality_foreign_guest` is 1:1 with `hospitality_stay_occupant`. `hospitality_form_iii` is N:1 to
the occupant (two rows each).

#### 5. Database
`hospitality_foreign_guest`

| Column | Type | Constraint |
|---|---|---|
| `occupant_id` | uuid | OneToOne, CASCADE (purged together) |
| `passport_last4` | varchar(4) | CHECK `char_length <= 4` |
| `passport_country` | char(2) | |
| `passport_expiry_on` | date | null |
| `visa_kind` | varchar(10) | CHECK in (`e_visa`,`regular`,`oci`,`other`,`not_needed`) |
| `visa_last4` | varchar(4) | null; CHECK `<= 4` |
| `visa_expiry_on` | date | null (not for OCI) |
| `arrived_in_india_on` | date | null |
| `port_of_arrival` | varchar(60) | default '' |
| `arrived_from_country` | char(2) | null |
| `next_destination` | varchar(80) | default '' |
| `details_complete` | boolean | set by the service |
| `override_reason` | varchar(200) | null; set when checked in with details missing |

`hospitality_form_iii`

| Column | Type | Constraint |
|---|---|---|
| `occupant_id` | uuid | FK, RESTRICT |
| `stay_id` | uuid | FK, RESTRICT |
| `event` | varchar(10) | CHECK in (`arrival`,`departure`) |
| `event_at` | timestamptz | the check-in or check-out time |
| `due_at` | timestamptz | `event_at + 24 h` |
| `filed_at` | timestamptz | null |
| `filed_by_id` | uuid | null |
| `reference` | varchar(40) | default '' |
| `note` | varchar(200) | default '' |
| `notified_12h_at`, `notified_24h_at` | timestamptz | null |

Constraints: UNIQUE `(tenant, occupant_id, event)`; CHECK `filed_at IS NULL OR reference <> ''`.
Index `ix_hospitality_form_iii_open (tenant, due_at)` WHERE `filed_at IS NULL`.

#### 6. API
| Method, path | Codename | Notes |
|---|---|---|
| `GET /form-iii?status=open|overdue|filed|exceptions&event&q` | `booking.read` | default `open`, ordered by `due_at` ascending (least time left first) |
| `GET /form-iii/{id}/copy-sheet` | `form_iii.write` | see below; writes audit `hospitality.register.printed` |
| `POST /form-iii/{id}/file` | `form_iii.write` | `{reference, filed_at?}`; 409 `form_iii_already_filed` |
| `PATCH /form-iii/{id}` | `form_iii.write` | `{reference, reason}`, a correction |
| `PATCH /occupants/{id}/foreign` | `stay.check_in` | completes the details later, which clears the exception |

The copy sheet carries: name; nationality; passport last four and expiry; visa kind, last four and
expiry; arrival in India; port; country arrived from; hotel arrival time; intended stay; next
destination; purpose; and the hotel's address and phone.

#### 7. Frontend
- Route `/hospitality/form-iii`; slice `formIii`; service `api/formIiiService.ts`.
- Components:
  - `FormIiiList`, with a `CountdownBadge` (a design-system `UbStatusBadge` with a computed tone and a
    text label);
  - `CopySheet` (print);
  - `MarkFiledDialog`, loaded with `dynamic()`.
- The nav badge counts open rows.

#### 8. UI/UX
- The countdown is in words and numbers ("13 h left", "Overdue by 2 h"), toned by band, never by colour
  alone.
- The copy sheet follows portal order, with a **Copy** button per field. "Copy all" puts label: value
  lines on the clipboard. The passport and visa numbers read "Type from passport (ends 4821)".
- Copy keys:

| Key | English | Hindi |
|---|---|---|
| `hospitality.form3.due` | Form III due | फ़ॉर्म III जमा करना है |
| `hospitality.form3.markFiled` | Mark filed | जमा हो गया |

#### 9. Validation and business rules
- V-1 Required for completeness: nationality, passport last four, passport country and visa kind. For
  `e_visa` and `regular` visas, also the visa's last four and a `visa_expiry_on` on or after the arrival
  date. A passport that expires before departure gives a warning.
- BR-1 `due_at = event_at + 24 h`. The bands run on `now − event_at`:

| Elapsed | Band |
|---|---|
| under 12 h | normal |
| 12–20 h | amber |
| 20–24 h | red |
| 24 h or more | overdue |

- BR-2 The sweep raises each notification once (`notified_*_at`), coalesced per tenant per hour.
- BR-3 The departure row is created at check-out. An undone check-in deletes the arrival row.
- BR-4 An overridden check-in keeps the stay on `exceptions` until the details are complete.

#### 10. Permissions
Reading needs `booking.read`. Marking filed needs `form_iii.write` (front desk and up).

#### 11. Reports
The foreign guests report (HTL-16): arrivals and departures with filing status, reference and
exceptions.

#### 12. Testing
- T-HTL10-1 A foreign occupant creates an arrival row due exactly 24 h later. Check-out adds the
  departure row.
- T-HTL10-2 A missing visa without an override is 409 `foreign_details_incomplete`, naming the fields.
  With an override the stay is saved and put on exceptions.
- T-HTL10-3 The sweep at 12 h raises one `form_iii_due`; a rerun raises none. At 24 h it raises one
  overdue.
- T-HTL10-4 No endpoint accepts or returns more than four characters of a passport or visa number.
- T-HTL10-5 e2e shots: the list with a normal, an amber, a red and an overdue row, and the copy sheet in
  print media.

#### 13. Edge cases
- EC-1 An OCI holder: `visa_kind='oci'`, with no visa expiry.
- EC-2 A Nepal citizen: on the list, with the FR-7 note.
- EC-3 A foreign guest who checks out within 24 h of arrival has two open rows at once.
- EC-4 A guest whose nationality is changed from IN to foreign after check-in: the arrival row is
  created with `event_at` = the original check-in time. The countdown may already be red; that is the
  truth.

#### 14. Future
Filing integration, if the Bureau publishes an API; bulk copy sheets.

---
## HTL-11 — The folio: room nights and extras

#### 1. Product requirements
- FR-1 A **folio** is what becomes one invoice. By default a booking has one stay folio holding every
  room of it (research EC-8, "one invoice by default"); **Bill this room separately** moves a stay to a
  folio of its own before invoicing. Cancellation and no-show charges have their own folio kinds.
- FR-2 Folio lines are (a) the stay's **room nights** — derived from `hospitality_night`, never posted
  one by one (research §15.3) — with their extra-bed amounts and discounts, (b) early check-in and late
  check-out charges (HTL-12), and (c) **extras**: an inventory item when inventory is on (dinner,
  laundry, water, taxi), or an item-less line with a SAC when it is off (10-architecture §2.3).
- FR-3 A folio charge **is not a ledger entry**. Nothing moves the party's balance until the invoice
  is issued (HTL-13).
- FR-4 The folio shows the per-night slab table and a **preview computed by the real tax engine**
  (`compute_document_totals`, imported from `apps.tax`, which hospitality may import), grouped exactly
  as the invoice will be, so the preview and the invoice cannot disagree.
- FR-5 An extra is voided with a reason, never deleted; nothing can be posted to an invoiced folio.
- FR-6 A **pre-bill** prints as "Folio: not a tax invoice" (HTL-17).

#### 2. User flows
Stay page → Folio tab → **Add extra** → search items (or type a description and SAC) → qty → price
(the item's) → service date (today) → Save → the line appears; totals and slabs update. Void: ⋯ →
**Void** → reason. Split: booking with three rooms → stay 206 → **Bill this room separately**.

#### 3. Features (MVP vs later)
MVP: derived nights, extra bed, early and late lines, extras from items or free text with SAC, void,
separate folio per room, preview, pre-bill. Later: split one folio by charge between two payers
(research EC-9), transfer a charge between rooms, room-service orders, a POS.

#### 4. Entities and relationships
`hospitality_folio` N:1 reservation, N:1 bill-to party; `hospitality_stay.folio_id`;
`hospitality_folio_charge` N:1 folio (and N:1 stay for a room's extras); `hospitality_night.folio_id`
set at invoicing; `hospitality_invoice_line` N:1 folio (the snapshot of what was sent).

#### 5. Database
`hospitality_folio`

| Column | Type | Constraint |
|---|---|---|
| `reservation_id` | uuid | FK, RESTRICT |
| `kind` | varchar(12) | CHECK in (`stay`,`cancellation`,`no_show`) |
| `bill_to_party_id` | uuid | FK `parties.Party`, RESTRICT (defaults to the reservation's bill-to, else its guest) |
| `status` | varchar(10) | CHECK in (`open`,`invoiced`) |
| `invoice_id` | uuid | null — a `sales_document` id through the port; no FK (§0.3) |
| `invoice_number` | varchar(32) | null (cache from `IssuedDocument`) |
| `invoice_total`, `invoice_amount_due` | numeric(14,2) | null; refreshed by `on_settlement_changed` |
| `invoiced_at` | timestamptz | null |
| `previous_invoice_ids` | uuid[] | default '{}'; invoices voided off this folio |
| `version` | integer | |

Constraints: CHECK (`status = 'open'` AND `invoice_id IS NULL`) OR (`status = 'invoiced'` AND
`invoice_id IS NOT NULL`); `uq_hospitality_folio_invoice` UNIQUE `(tenant, invoice_id)` WHERE
`invoice_id IS NOT NULL`. Indexes `(tenant, reservation_id)`, `(tenant, status)` WHERE `status='open'`.

`hospitality_folio_charge`

| Column | Type | Constraint |
|---|---|---|
| `folio_id` | uuid | FK, RESTRICT |
| `stay_id` | uuid | null, FK |
| `kind` | varchar(16) | CHECK in (`extra`,`early_check_in`,`late_check_out`,`cancellation`,`no_show`) |
| `service_on` | date | the date the charge belongs to (HTL-12 BR-3) |
| `description` | varchar(255) | |
| `item_id` | uuid | null — an inventory item through the item port (C5); no FK |
| `hsn_sac` | varchar(8) | null; `^(\d{4}|\d{6}|\d{8})$` |
| `qty` | numeric(14,3) | CHECK `> 0` |
| `unit_code` | varchar(8) | default `NOS` |
| `unit_price` | numeric(14,2) | CHECK `>= 0` |
| `tax_inclusive` | boolean | |
| `discount_amount` | numeric(14,2) | CHECK `>= 0` and `<= qty × unit_price` |
| `tax_code` | varchar(16) | the item's code, or the slab code for early/late/cancellation lines |
| `status` | varchar(10) | CHECK in (`open`,`invoiced`,`voided`) |
| `void_reason` | varchar(160) | required when voided (CHECK) |
| `voided_at`, `voided_by_id` | | |
| `invoice_line_no` | smallint | null |

Index `ix_hospitality_charge_folio (tenant, folio_id, service_on)`.

`hospitality_invoice_line` (immutable once written; the snapshot reports read)

| Column | Type | Constraint |
|---|---|---|
| `folio_id` | uuid | FK, RESTRICT |
| `invoice_id` | uuid | |
| `line_no` | smallint | UNIQUE `(tenant, invoice_id, line_no)` |
| `kind` | varchar(16) | `room_night`,`extra_bed`,`early_check_in`,`late_check_out`,`extra`,`cancellation`,`no_show` |
| `room_id`, `room_type_id` | uuid | null |
| `first_night_on`, `last_night_on` | date | null |
| `nights` | smallint | null |
| `qty`, `unit_price`, `discount_amount` | | as sent |
| `tax_inclusive` | boolean | |
| `tax_code`, `tax_rate` | | |
| `taxable_value`, `cgst`, `sgst` | numeric(14,2) | from the engine run; T-HTL13-3 asserts equality with the sales line |

Index `ix_hospitality_invoice_line_period (tenant, first_night_on)`.

#### 6. API
| Method, path | Codename | Notes |
|---|---|---|
| `GET /folios/{id}` | `booking.read` | `{folio, nights_by_room: [{room, nights: [{night_on, value, tax_code, slab_reason}]}], charges, preview: {lines, totals}, advances_held, deposit, amount_to_collect}` |
| `POST /folios/{id}/charges` | `folio.post` | `{stay_id, kind: "extra", item_id?, description?, hsn_sac?, qty, unit_price?, tax_inclusive?, tax_code?, discount_amount?, service_on}`; 409 `folio_not_open` |
| `POST /folio-charges/{id}/void` | `folio.void` | `{reason}`; 409 `folio_charge_not_open` |
| `POST /stays/{id}/separate-folio` | `folio.post` | `{bill_to_party_id?}`; moves the stay, its open nights and charges |
| `GET /folios/{id}/pre-bill` | `booking.read` | print data |

#### 7. Frontend
Stay page Folio tab (`/hospitality/stays/[id]`); slice `stayDetail`; `api/folioService.ts`;
`FolioLines`, `NightSlabTable`, `AddExtraDrawer` (`dynamic()`; item search through the item port's
endpoint, C5), `VoidChargeDialog`.

#### 8. UI/UX
- Lines grouped as the invoice will be ("Room 104 · 12–14 Oct · 2 nights × ₹3,200"), extras by date;
  the slab table per room shows each night's value and "5%" or "18%" in words, with the reason when a
  night crossed ("₹7,000 + extra bed ₹800 = ₹7,800, above ₹7,500").
- Totals panel: taxable, CGST, SGST, round-off, total, advances held, **to collect**.
- Hindi: `hospitality.folio.addExtra` "Add extra" / "और सामान या सेवा जोड़ें";
  `hospitality.folio.notInvoice` "Folio: not a tax invoice" / "बिल का ब्योरा: यह टैक्स इनवॉइस नहीं है".

#### 9. Validation and business rules
- BR-1 **Grouping** (normative, because it changes paise): invoice lines are grouped by
  `(room, kind, unit_price, per-unit discount, tax_code, tax_inclusive)` in room-label order, kinds in
  the order room night, extra bed, early check-in, late check-out, then extras by `service_on`,
  cancellation last. Checked against the engine: ₹2,499 × 3 nights as **one** line gives CGST ₹187.43 /
  SGST ₹187.42; as three lines it gives ₹187.44 / ₹187.41 (the same total, ₹7,871.85 → ₹7,872). The
  folio preview and the invoice both use the grouped form.
- BR-2 An extra bed is its own line at the night's slab (its amount is part of the night's value,
  HTL-02 BR-4): ₹7,000 + ₹800 → both lines 18%.
- BR-3 Extras: `qty > 0`, `unit_price ≥ 0`, `service_on` between arrival − 1 day and departure.
  `tax_code` defaults to the item's; an item-less line needs a SAC and a code. Hospitality never
  decides a food rate; the "specified premises" setting only warns when a food item's code disagrees
  with it (research §6.6, TL-12).
- BR-4 A goods item moves stock only when the invoice is issued (sales' stock posting); a short item
  is sales' 409 `insufficient_stock` at check-out, shown against the line.
- BR-5 A folio of more than 100 grouped lines is refused at check-out with `folio_too_many_lines`
  (sales `LINES_MAX`); the long-stay answer is later interim invoices.
- BR-6 Void: `folio.void`; front desk only for charges it posted on the same business date.

#### 10. Permissions
Post `folio.post`; void `folio.void`; read `booking.read`.

#### 11. Reports
Revenue by category reads `hospitality_invoice_line` (HTL-16).

#### 12. Testing
- T-HTL11-1 the preview equals the issued invoice line for line and paisa for paisa, for every worked
  example of HTL-13 and 200 fuzzed folios (the preview and the port run the same engine on the same
  grouped lines).
- T-HTL11-2 BR-1's grouped-versus-split CGST figures above.
- T-HTL11-3 posting to an invoiced folio → 409; void keeps the row.
- T-HTL11-4 separate folio moves only open rows; two invoices result at check-out.
- T-HTL11-5 a charge posted by another device while the check-out preview is open → the check-out
  request carries the folio `version` and is refused with `stale_version`, so the guest is never billed
  a total they did not see.

#### 13. Edge cases
EC-1 Inventory switched off after extras were posted with items → the lines stay; at check-out they
are sent with `item_id=None` and their snapshot description, SAC and code. EC-2 An extra dated after
departure → refused. EC-3 A complimentary extra (₹0) → allowed, printed at ₹0.

#### 14. Future
Split by payer, transfer between rooms, POS and room-service orders, interim invoices.

---

## HTL-12 — Early check-in, late check-out, early check-out, extension

#### 1. Product requirements
- FR-1 **Early check-in** and **late check-out** are charged by bands the owner sets (research §6.4
  defaults below); the clerk sees the band and the charge before saving and may lower or remove it.
- FR-2 A **full-night** band charges the previous (early) or next (late) night as a room night, which
  **needs that night free**: the unit is extended through the engine, or the request is refused with
  `extra_night_not_free` naming the booking in the way.
- FR-3 Each part-day charge **belongs to a date**: early check-in to the arrival date (it adds to that
  night's value for the slab), late check-out to the departure date (a day whose night the guest did
  not buy, so it stands alone). The clerk sees when a charge moves a date to 18% (research §6.5, 6a).
- FR-4 **Early check-out**: leaving before the departure date releases the unused nights in the same
  transaction; the MVP charges nothing for them (research §6.4).
- FR-5 **Extension**: a later departure re-checks availability and prices the new nights from the plan.
- FR-6 **Room move mid-stay** splits the stay at a date, each part keeping its own price (research
  EC-5); it needs an engine service the contract does not list (C6).

#### 2. User flows
- Check-in at 07:30 for a 12:00 check-in: banner "Early check-in 4 h 30 min: 50% of the night,
  ₹1,600" with Keep / Change / No charge → Check in.
- Check-out at 15:00 for 11:00: the check-out screen shows "Late check-out 4 h: ₹1,600 on 15 Oct".
- Guest leaves on day 2 of 4: Check out → "2 unused nights (15, 16 Oct) will be released".
- Extend: stay page → **Extend** → new departure → the strip shows the added nights → Save.

#### 3. Features (MVP vs later)
MVP: bands, date belonging, full-night bands, early check-out release, extension, shorten. Later:
retention charge for early check-out, 24-hour check-out mode (research §6.3), mid-stay move if C6 is
not answered in time.

#### 4. Entities and relationships
`hospitality_folio_charge(kind='early_check_in'|'late_check_out', service_on)`; nights added or
released on the unit (engine `change_unit`).

#### 5. Database
No new table. Settings `hospitality.early_bands` and `hospitality.late_bands`: ordered lists of
`{up_to_minutes, charge: "free"|"percent"|"night", value}`.

#### 6. API
| Method, path | Codename | Notes |
|---|---|---|
| `GET /stays/{id}/early-late-preview?at&kind=early|late` | `booking.read` | band, charge, the date it belongs to, the slab effect |
| (check-in body) `early_charge: {accept, amount?}` | `stay.check_in` | HTL-09 |
| (check-out body) `late_charge: {accept, amount?}` | `stay.check_out` | HTL-13 |
| `POST /stays/{id}/extend` | `booking.write` | `{departure_on, version}`; 409 `booking_slot_taken` |
| `POST /stays/{id}/shorten` | `booking.write` | `{departure_on}` ≥ the next business date |
| `POST /stays/{id}/move` | `booking.write` | `{room_id, from_on}` (C6) |

#### 7. Frontend
`EarlyLateBanner` (shared by check-in and check-out), `ExtendStayDrawer` (`dynamic()`).

#### 8. UI/UX
- The banner names the band in words, the amount, the date it belongs to, and, when the slab moves,
  the tax difference: "This makes 12 Oct an 18% day: GST on 12 Oct ₹1,998 instead of ₹370."
- Hindi: `hospitality.early.banner` "Early check-in {duration}: {charge}" / "जल्दी चेक-इन {duration}:
  {charge}".

#### 9. Validation and business rules
Default bands (owner may change, see Defaults):

| Case | Band | Charge |
|---|---|---|
| Early, up to 3 h before check-in time | free | none |
| Early, 3–6 h | 50% of the arrival night's room rate | `early_check_in`, service_on = arrival date |
| Early, more than 6 h, or before `day_starts_at` | the previous night | a room night on arrival − 1 (needs it free) |
| Late, up to 1 h after check-out time | free | none |
| Late, 1–6 h | 50% of the last night's room rate | `late_check_out`, service_on = departure date |
| Late, more than 6 h | the next night | a room night on the departure date (needs it free) |

- BR-1 Bands are evaluated from the actual time against the settings' times in the tenant timezone.
- BR-2 The clerk may lower or remove a charge; raising it is a role check.
- BR-3 **Date belonging.** Early charge → arrival date's value (HTL-02 BR-4); late charge → a
  standalone day at the slab of its own value. Checked against the engine (research 6a and 6b):
  ₹7,400 × 2 nights with a 50% early charge (₹3,700) → arrival date ₹11,100 at 18% (CGST ₹666 + ₹333),
  second night ₹7,400 at 5% (₹185) → total **₹20,868.00**; ₹7,400 × 1 night with a 50% late charge →
  ₹7,400 at 5% and ₹3,700 at 5% → **₹11,655.00**. The reading is for the CA (TL-2).
- BR-4 Early check-out: nights after the business date of check-out become `released` and their slots
  are deleted through `change_unit(end_on=…)`; nights already slept stay.
- BR-5 An inclusive plan's early charge is inclusive, and the arrival date's inclusive value is checked
  against the gap (HTL-02 BR-7).

#### 10. Permissions
`stay.check_in`, `stay.check_out`, `booking.write`; raising a charge or changing times after the fact
are role checks.

#### 11. Reports
Early and late charges are excluded from room revenue and ADR, included in revenue by category
(research §8).

#### 12. Testing
- T-HTL12-1 band table boundaries, including exactly 3 h and exactly 6 h.
- T-HTL12-2 the 6a and 6b totals through the whole check-out path, not just the engine.
- T-HTL12-3 full-night early band with the previous night sold → 409 `extra_night_not_free`.
- T-HTL12-4 **concurrency**: an extension into 17 Oct and a new booking of 17 Oct race → one wins.
- T-HTL12-5 **concurrency**: an early check-out releasing 16 Oct and a booking of 16 Oct right after →
  the booking succeeds only after the release commits (never before, never lost).

#### 13. Edge cases
EC-1 Arrival at 01:30 for "tonight" → the night of the previous date (R1), not an early check-in
(research EC-3). EC-2 The guest leaves without checking out (research EC-4) → day close lists them;
the clerk checks out at the actual time and leaves the balance on the party's account. EC-3 A late
charge that pushes the departure day above ₹7,500 → that day is 18% (it stands alone).

#### 14. Future
24-hour mode, retention charges, mid-stay move without C6.

---

## HTL-13 — Check-out to a tax invoice through the document port

#### 1. Product requirements
- FR-1 Check-out issues **one sales invoice per folio** through `documents.issue_document`
  (ADR-045), with `origin_type="hospitality_folio"`, the folio's grouped lines, a **stay block**, and
  the bill-to party. The number comes from the tenant's invoice series (sales' own numbering).
- FR-2 **GST is always CGST + SGST at the hotel's state** (R6): the request carries the tenant's state
  as the place of supply whatever the bill-to party's state (C1).
- FR-3 **Per room, per night slab**: each night's value (room + extra bed + that date's early charge −
  that night's discount) ≤ ₹7,500 is 5% without ITC, above is 18% (research §6.5); lines carry their
  final tax code.
- FR-4 **Discounts are applied per night**, before the slab is decided; the port never receives a
  document-level discount.
- FR-5 **A tax-inclusive night value from ₹7,875.01 to ₹8,850.00 is refused** (HTL-02 BR-7), at
  pricing and again at check-out.
- FR-6 After issue, the booking's **advances are applied with `allocate_existing`**, oldest first, up
  to the invoice's amount due; the balance is collected at issue (the port's `payment`) or left on the
  bill-to party's account (subject to its credit limit).
- FR-7 The room becomes Needs cleaning; foreign occupants get their departure Form III rows; occupant
  retention dates are set (HTL-19).
- FR-8 An invoice void (in sales) reopens the folio through the origin listener; the stay stays
  checked out and the folio can be invoiced again.

#### 2. User flows
In house → **Check out** on 104 → the check-out page: time (now), late band (HTL-12), nights to
release (early check-out), the folio preview with the slab table, bill-to (guest, or a company with a
GSTIN), advances "₹2,000 will be applied", deposit (refund or use), **To collect ₹5,872** with the
payment modes, or **Leave on account** → **Check out and issue invoice** → result: invoice number with
Print (A4, 80 mm) and Share, the receipt, and the room shown as Needs cleaning.
Group: booking detail → **Check out all rooms** → one invoice for the folio's stays.

#### 3. Features (MVP vs later)
MVP: everything above; a bill-to company GSTIN; one invoice per folio. Later: interim invoices for long
stays (research EC-10), invoice per room chosen at check-out for a group without separating folios
first (MVP: separate the folio first, HTL-11), e-invoice (IRN).

#### 4. Entities and relationships
Folio → `IssueRequest` → `sales_document` (origin columns) ← `payments_allocation` (advances via
`allocate_existing`, the balance via the port's payment). `hospitality_invoice_line` records what was
sent. `FolioOriginListener` (`on_void`, `on_settlement_changed`, `blocks_void`).

#### 5. Database
No new table (HTL-11's). Writes: folio `status`, `invoice_*`; nights and charges `invoiced`,
`tax_code_invoiced`, `invoice_line_no`; `hospitality_invoice_line`; stay `checked_out_*`; room status
event; Form III departure rows; occupant `retention_until`.

#### 6. API
`POST /folios/{id}/check-out` (`stay.check_out` + `sales.invoice.write` + `payments.payment.write` when
collecting; Idempotency-Key):
```json
{ "stay_ids": ["…"], "at": null, "late_charge": {"accept": true, "amount": null},
  "bill_to_party_id": "…", "payment": {"mode_breakup": [{"mode": "upi", "amount": "5872.00"}]},
  "leave_on_account": false, "override_credit_limit": false, "deposit": {"action": "refund"},
  "version": 7 }
```
Response 201 `{invoice: IssuedDocument, applied_advances: [{payment_id, amount}], payment, deposit,
stays, warnings}`. `GET /folios/{id}/check-out-preview?at&late=` returns the same figures without
writing. Errors: 409 `folio_not_open`, `stay_not_in_house`, `stale_version`, `folio_too_many_lines`,
`credit_limit_exceeded` (from sales, with `limit`, `balance_after`), `insufficient_stock` (sales);
400 `room_price_in_gst_gap`; 403 `permission_denied` (`details.missing`), `override_not_allowed`.

**The IssueRequest hospitality builds** (11-contracts §1.5):
```python
IssueRequest(
    origin_type="hospitality_folio", origin_id=folio.id,
    party_id=folio.bill_to_party_id, document_date=tenant_today(tenant),
    lines=[DocumentLine(description="Room 104 · Deluxe · 12–14 Oct 2026 · 2 nights",
                        hsn_sac="996311", qty=Decimal("2"), unit_code="NOS",
                        unit_price=Decimal("3200.00"), tax_inclusive=False,
                        gst_rate=Decimal("5"),            # C2: a tax code is what sales stores
                        item_id=None, discount_amount=Decimal("0.00")), ...],
    notes="Booking BKG/26-27/0042",
    meta_block={"stay": {"booking_number": "BKG/26-27/0042", "arrival_at": "…", "departure_at": "…",
                         "rooms": [{"label": "104", "type": "Deluxe", "nights": 2}],
                         "guests": 2, "guest_name": "Ramesh Kumar"}},
    payment={...} or None,               # the balance collected now
    apply_open_advances=False,           # hospitality applies this booking's advances itself (C3)
    credit_check="enforce",              # leaving money on account is a credit sale
    # place_of_supply_state=tenant.state_code   ← needed, not in the contract (C1)
)
```

**Service order** (`hospitality.services.checkout.check_out`, one transaction, R4): lock the bill-to
party (and the guest party if different, in id order) → lock the folio and its stays (id order) and
check `version` → evaluate the late band, post the late charge → engine `change_unit` for early
check-out, then `check_out(unit)` per stay → build nights and lines, decide slabs, refuse the gap →
`issue_document(...)` (documents → stock → invoice sequence, inside sales) → `allocate_existing` for
each advance of this booking with party = bill-to, oldest first, until `amount_due = 0` → deposit
refund or application → write snapshots, statuses, room events, Form III rows → audit
`hospitality.folio.invoiced` and `hospitality.stay.checked_out`.

#### 7. Frontend
Route `/hospitality/stays/[id]/check-out`; slice `checkOut`; `api/folioService.ts`; `CheckOutPage`
(`NightSlabTable`, `EarlyLateBanner`, `BillToPicker` from `features/parties`, `AdvancesApplied`,
`CollectPanel` reusing `features/payments` mode inputs and UPI QR). The invoice print opens the sales
print route by URL (a page, not an import).

#### 8. UI/UX
- The page reads top to bottom as the act does: times → charges → tax by night → who pays → money.
- "To collect" is the largest figure; the button names the act and the amount.
- Missing codename: the page shows "You can check guests out but not issue invoices. Ask the owner for
  'Create invoices'" before anything is sent.
- Hindi: `hospitality.checkout.title` "Check out" / "चेक-आउट"; `hospitality.checkout.toCollect`
  "To collect" / "लेना बाकी"; `hospitality.checkout.leaveOnAccount` "Leave on account" / "खाते में
  बाकी रखें".

#### 9. Validation and business rules
- BR-1 Every stay in `stay_ids` is in house and on this folio; the folio is open and at `version`.
- BR-2 Slab per room per night (HTL-02 BR-4 to BR-7), from the `tax_room_slab` bands in force on the
  invoice date (TL-8). A dorm bed is the unit (TL-6).
- BR-3 **Place of supply = the tenant's state.** Checked against the engine: the same ₹3,200 night with
  the place of supply left to sales' `default_pos` (the party's state, `payload.py`) and a bill-to in
  Maharashtra (27) for a hotel in Uttar Pradesh (09) gives **IGST ₹160.00**, which is wrong for
  accommodation; with the place of supply forced to 09 it gives CGST ₹80.00 + SGST ₹80.00.
- BR-4 SAC 996311 on every room, extra-bed, early, late, cancellation and no-show line
  (`hospitality.default_sac_room`).
- BR-5 Lines are grouped per HTL-11 BR-1; each carries its own `discount_amount` (n × per-night
  discount) and its own tax code.
- BR-6 **Never a document-level discount.** Checked against the engine: a ₹1,100 document discount
  over a ₹8,000 night at 18% and a ₹3,000 night at 5% is spread to ₹7,200 and ₹2,700 *after* the rates
  were set, leaving a ₹7,200 night at 18% — a night that, discounted per night, is a 5% night
  (`tax_engine._allocate`). A test asserts the issued document's `discount_type IS NULL`.
- BR-7 Inclusive plans send inclusive lines (`tax_inclusive=True`) so the guest pays exactly what was
  quoted. Checked: ₹2,099 inclusive × 3 as one inclusive line → taxable ₹5,997.14, total ₹6,297.00; the
  same converted to an exclusive ₹1,999.05 × 3 → ₹6,297.01, rounded to ₹6,297 with −₹0.01 round-off.
- BR-8 Advances: only this booking's advances on the invoice's party; `allocate_existing` moves at most
  `unallocated_amount` of each; what remains stays as advance (refund from HTL-06).
- BR-9 Credit limit: the port runs sales' check on the amount left on credit (the party's balance
  already nets the advances); `block` mode refuses unless owner/admin override (C4).
- BR-10 **Origin listener.** `on_void`: the folio returns to `open`, its nights and charges to `open`,
  the invoice id moves to `previous_invoice_ids`, the allocations released by sales make the advances
  unallocated again, and an audit row `hospitality.folio.reopened`; `blocks_void` returns None;
  `on_settlement_changed` refreshes `invoice_amount_due`.
- BR-11 Unregistered or composition tenant: kind and tax are sales' (`kind_for`); lines still carry
  their codes and the engine zeroes them.

**Worked examples, each run through the real `compute_document_totals` (intra-state, round-off on):**

| # | Case | Lines sent (grouped) | Taxable | CGST | SGST | Round-off | Total |
|---|---|---|---|---|---|---|---|
| 1 | Standard ₹3,200 × 2 nights | 2 × 3,200 @ GST5 | 6,400.00 | 160.00 | 160.00 | 0.00 | **6,720.00** |
| 2 | Room ₹7,000 + extra bed ₹800, 1 night (₹7,800) | 7,000 @ GST18; 800 @ GST18 | 7,800.00 | 702.00 | 702.00 | 0.00 | **9,204.00** |
| 3 | Listed ₹8,000, ₹800 per-night discount (₹7,200) | 8,000 − 800 @ GST5 | 7,200.00 | 180.00 | 180.00 | 0.00 | **7,560.00** |
| 4 | Fri ₹6,500, Sat ₹8,200, Sun ₹6,500 | 2 × 6,500 @ GST5; 8,200 @ GST18 | 21,200.00 | 325 + 738 = 1,063.00 | 1,063.00 | 0.00 | **23,326.00** |
| 5 | Two rooms, one night: ₹4,000 and a ₹9,000 suite | 4,000 @ GST5; 9,000 @ GST18 | 13,000.00 | 100 + 810 = 910.00 | 910.00 | 0.00 | **14,820.00** |
| 6a | ₹7,400 × 2, early 50% (₹3,700) on arrival date | 7,400 @ GST18; 3,700 @ GST18; 7,400 @ GST5 | 18,500.00 | 666 + 333 + 185 = 1,184.00 | 1,184.00 | 0.00 | **20,868.00** |
| 6b | ₹7,400 × 1, late 50% (₹3,700) on departure date | 7,400 @ GST5; 3,700 @ GST5 | 11,100.00 | 277.50 | 277.50 | 0.00 | **11,655.00** |
| 7 | ₹2,499 × 3 nights | 3 × 2,499 @ GST5 | 7,497.00 | 187.43 | 187.42 | +0.15 | **7,872.00** |
| 8 | Dinner ₹600 (not specified premises) + laundry ₹200 | 600 @ GST5; 200 @ GST18 | 800.00 | 15 + 18 = 33.00 | 33.00 | 0.00 | **866.00** |
| 9 | ₹5,250 inclusive, 1 night | 5,250 incl @ GST5 | 5,000.00 | 125.00 | 125.00 | 0.00 | **5,250.00** |
| 10 | ₹9,440 inclusive, 1 night | 9,440 incl @ GST18 | 8,000.00 | 720.00 | 720.00 | 0.00 | **9,440.00** |
| 11 | ₹8,000 inclusive | refused: `room_price_in_gst_gap` | — | — | — | — | — |
| 12 | ₹8,000 × 2, ₹800 off each night | 2 × 8,000, discount 1,600 @ GST5 | 14,400.00 | 360.00 | 360.00 | 0.00 | **15,120.00** |

All eleven figures the research gives (§6.5 #1–#8 with 6a and 6b, and the two inclusive examples)
reproduce exactly with the engine's rounding: line tax half-up to paise, CGST = round(t × r / 200),
SGST = tax − CGST, grand total half-up to the rupee. Example 7's CGST/SGST split holds **only** with the
grouping of HTL-11 BR-1. These twelve rows are the fixture of T-HTL13-1.

#### 10. Permissions
`stay.check_out` plus `sales.invoice.write`, and `payments.payment.write` when collecting; the credit
override is a role check.

#### 11. Reports
The invoice is in the sales register and GST summary as any invoice (it is one); hospitality reports
read `hospitality_invoice_line` and reconcile totals with `document_summaries` (HTL-16).

#### 12. Testing
- T-HTL13-1 the twelve worked examples end to end (folio → port → issued document): every figure.
- T-HTL13-2 place of supply is the tenant's state for a bill-to in another state (IGST 0).
- T-HTL13-3 each `hospitality_invoice_line` equals its `sales_document_line` (taxable, CGST, SGST).
- T-HTL13-4 the issued document has no document discount, whatever the folio held.
- T-HTL13-5 advances: two advances (₹1,000 then ₹2,000) and a ₹6,720 invoice → both applied oldest
  first, ₹3,720 collected, invoice `paid`; an advance for another booking untouched.
- T-HTL13-6 **concurrency**: two devices check out the same folio → one invoice; the other 409
  `folio_not_open` or `stale_version`; one invoice number consumed.
- T-HTL13-7 idempotency: the same key replayed → the same invoice, no second allocation.
- T-HTL13-8 sales void → folio open, nights open, advances unallocated; re-check-out issues a new
  invoice and re-applies them (`previous_invoice_ids` has the first).
- T-HTL13-9 an origin listener that raises rolls the void back (contract test, 10-architecture §11).
- T-HTL13-10 lock order: a check-out and a counter sale to the same party with payment at issue, run
  concurrently 50 times, never deadlock (R4, C3).
- T-HTL13-11 unregistered tenant → no tax on any line; composition → bill of supply.

#### 13. Edge cases
EC-1 A company from another state with a GSTIN → CGST + SGST, the company's GSTIN on the invoice
(research §6.5). EC-2 Advance on the guest, bill-to a company → not applied, shown with Refund (HTL-06
EC-1). EC-3 A stay spanning 31 March → the invoice takes the FY of the check-out date (research EC-28).
EC-4 A tenant registered for GST mid-stay → the invoice date decides (sales' rule); flagged for the CA
(TL-13). EC-5 A goods extra short in stock → sales' `insufficient_stock`; the clerk voids or changes the
line. EC-6 The slab table changes between booking and check-out → the invoice date's bands apply, and
the check-out preview shows the new slab before the button (research EC-22, TL-8).

#### 14. Future
Interim invoices, invoice per room at check-out, e-invoice, a GST receipt voucher for advances.

---
## HTL-14 — Day close checklist

#### 1. Product requirements
- FR-1 Day close is a **checklist that never blocks** anything: check-in, check-out, bookings and
  payments work whether or not it was run (research §3.8; eZee's blocking night audit is deliberately
  not copied).
- FR-2 The checklist, for a business date: arrivals not checked in (offer no-show or change dates);
  departures not checked out (extend or check out); in-house stays with tonight's accrued room charge
  (shown, never posted, research §15.3); money today by mode (payments recorded by the tenant on that
  date for hospitality, with a counted-cash field and the difference); open folios with balances;
  Form III rows not filed; tentative holds expiring.
- FR-3 Running it records who ran it, when, the counted cash and the difference, and a snapshot of the
  counts. It can be re-run for the same date; the record is updated with an audit row.
- FR-4 It does not change the business date (R1) and does not lock past dates (later, research §16).

#### 2. User flows
Day close (nav, or the dashboard's "Close the day" at the end of the evening) → the checklist for
today's business date, each section with its items and one action per item → counted cash → **Record
day close** → history shows "13 Oct · closed 23:40 by Sunita · cash short ₹200".
Skipped days: opening day close after three days offers each missed date in turn (research EC-23).

#### 3. Features (MVP vs later)
MVP: checklist, counted cash, history, re-run. Later: locking closed dates (needs a platform-wide
period lock that sales and the ledger want too), a printable day report.

#### 4. Entities and relationships
`hospitality_day_close` stands alone; it reads reservations, stays, folios, payments and Form III rows.

#### 5. Database
`hospitality_day_close`

| Column | Type | Constraint |
|---|---|---|
| `business_date` | date | UNIQUE `(tenant, business_date)` |
| `closed_at` | timestamptz | |
| `closed_by_id` | uuid | FK user |
| `recorded_cash` | numeric(14,2) | cash payments in − out for hospitality on that date |
| `counted_cash` | numeric(14,2) | null |
| `difference` | numeric(14,2) | null; `counted − recorded` |
| `snapshot` | jsonb | counts only: `{arrivals_pending, departures_pending, in_house, open_folios, form_iii_open, holds_expiring}`; **no amounts** (canon rule 3: money is never jsonb) |
| `note` | varchar(200) | default '' |
| `version` | integer | |

"Hospitality payments" are payments linked through `hospitality_advance`, or allocated to invoices
whose origin module is hospitality (read through `document_summaries`), on that `payment_date`.

#### 6. API
| Method, path | Codename | Notes |
|---|---|---|
| `GET /day-close/preview?business_date` | `day_close.run` | the checklist with item lists |
| `POST /day-close` | `day_close.run` | `{business_date, counted_cash?, note?, version?}`; Idempotency-Key |
| `GET /day-close?from&to` | `day_close.run` or `reports.read` | history |

#### 7. Frontend
Route `/hospitality/day-close`; slice `dayClose`; `api/dayCloseService.ts`; `DayCloseChecklist`
(`UbDisclosure` per section), item actions open the existing dialogs (`NoShowDialog`,
`ExtendStayDrawer`, the check-out page).

#### 8. UI/UX
- Each section shows a count and "All done" when zero; nothing is red unless it is a legal deadline
  (Form III).
- The record button is always enabled: "Record day close (2 items still open)".
- Hindi: `hospitality.dayClose.title` "Close the day" / "दिन का हिसाब"; `hospitality.dayClose.cashCounted`
  "Cash counted" / "गिना हुआ नकद".

#### 9. Validation and business rules
- BR-1 Nothing in the module reads `hospitality_day_close` to decide whether to allow an action (a test
  greps the services for it).
- BR-2 `business_date ≤` today's business date.
- BR-3 Accrued tonight = Σ of tonight's open night values of in-house stays (exclusive), displayed with
  "not billed until check-out".

#### 10. Permissions
`day_close.run` (owner, admin, front desk).

#### 11. Reports
Day close history (HTL-16).

#### 12. Testing
- T-HTL14-1 check-in works with day close never run; with yesterday not closed; after it is run.
- T-HTL14-2 the checklist counts equal the lists they link to.
- T-HTL14-3 recorded cash equals the cashbook's hospitality cash for the date (adjustment mode
  excluded).
- T-HTL14-4 re-run updates the row and writes a second audit row.

#### 13. Edge cases
EC-1 Two clerks record the same date at once → one wins, the other `stale_version` with the latest
figures. EC-2 A payment backdated into a closed date → allowed (no lock); the history row shows
"changed after close" when the recorded figure moves.

#### 14. Future
Period lock, a printable day report, shift handover (cash per clerk).

---

## HTL-15 — Dashboard

#### 1. Product requirements
- FR-1 `/hospitality` is the module's home, and the same data is registered as the dashboard section
  `hospitality.today` (`register_dashboard_section`, R8), shown on `/dashboard` when the module is on
  and the member holds `hospitality.booking.read`.
- FR-2 Contents (research §7): business date; rooms free tonight; occupancy tonight; **arrivals** today
  (name, room, nights, balance due; Check in / No-show; overdue after check-in time + 6 h);
  **departures** today (folio balance; Check out; overdue after check-out time); **in house** (stays,
  guests); rooms by status (a grid of labels with words); **Form III due** (count, red past 20 h,
  hidden when zero, never dismissible); **money today** (advances received, check-out collections,
  balances left on account); **next 7 nights** occupancy (booked, tentative, free).
- FR-3 Every number links to the list it counts (research §7 rule).
- FR-4 It shows only what is built (vision §4).

#### 2. User flows
Open the app → Today → tap "Arrivals 5" → the arrivals list → Check in. Tap "Form III 2" → the list.

#### 3. Features (MVP vs later)
MVP: as above. Later: booking pace, a revenue sparkline.

#### 4. Entities and relationships
Reads only; no table.

#### 5. Database
No table. The selector's queries: arrivals and departures by `(tenant, arrival_on)`/`(tenant,
departure_on)` indexes; in-house by `ix_hospitality_stay_in_house`; next 7 nights by the slot index;
Form III by `ix_hospitality_form_iii_open`. EXPLAIN test.

#### 6. API
`GET /hospitality/today` (`booking.read`) and the section in `GET /reports/dashboard`:
`{business_date, rooms_total, free_tonight, occupancy_pct, arrivals: {count, overdue, items[≤10]},
departures: {...}, in_house: {stays, guests}, rooms_by_status: [{room_id, label, status, occupancy}],
form_iii: {open, red}, money_today: {advances, collections, left_on_account}, next_7: [{night_on,
booked, tentative, free}]}`. The item lists carry `guest_short_name`, never a mobile.

#### 7. Frontend
Route `/hospitality`; slice `hospitalityToday`; `api/todayService.ts`; the dashboard section entry in
`features/reports/dashboardSections.ts` (a `dynamic()` import, 10-architecture §6.8); `UbStatCard`
tiles, lists as `UbDataGrid` card layout on a phone; the 7-night bars with `src/design-system/charts`.

#### 8. UI/UX
- Phone: tiles in two columns, then Arrivals and Departures lists; the first arrival is above the fold
  at 360 × 780 (measured in the sweep; the CLAUDE.md "first list row at y=658" lesson).
- Numbers link; bars have text values; the Form III tile is the only danger tone.
- Hindi: `hospitality.today.arrivals` "Arriving today" / "आज आने वाले"; `hospitality.today.departures`
  "Leaving today" / "आज जाने वाले"; `hospitality.today.freeTonight` "Free tonight" / "आज रात खाली".

#### 9. Validation and business rules
- BR-1 Occupancy tonight = rooms with an active slot tonight ÷ (active rooms − out of order tonight);
  beds counted separately when the tenant has dorms.
- BR-2 Money today uses the business date's payments (HTL-14's definition).
- BR-3 Overdue arrival: now > arrival date at check-in time + `no_show_after_hours`.

#### 10. Permissions
`booking.read`; money tiles also need `payments.payment.read` (hidden otherwise). Housekeeping never
reaches it (its home is the board).

#### 11. Reports
Each tile's list is a report filter (HTL-16).

#### 12. Testing
- T-HTL15-1 counts equal the linked lists; T-HTL15-2 the section is absent when the module is off;
  T-HTL15-3 at 360 px the page does not scroll sideways and the first arrival row starts above 780 px;
  T-HTL15-4 the Form III tile appears only when open rows exist.

#### 13. Edge cases
EC-1 No rooms yet → the first-use state from HTL-01 instead of zeros. EC-2 Sales off for a moment is
impossible (dependency), but a member without `sales.invoice.read` sees balances without links.

#### 14. Future
Pace, forecast, a wall-display mode for the desk.

---

## HTL-16 — Reports

#### 1. Product requirements
Registered with `register_report` (R9), listed in the reports hub only when built, filtered by date
range, exported as CSV through `reports/exports` (research §8):

| Key | Report | Definition |
|---|---|---|
| `hospitality.occupancy` | Occupancy | per night and period: occupied room-nights ÷ available room-nights × 100. *Available* = active rooms − rooms out of order that night. *Occupied* (past nights) = nights of units checked in or completed; future nights are "on the books" (confirmed + tentative, separately). By room type; dorm beds as a separate figure |
| `hospitality.adr` | Average room rate and revenue per available room | Room revenue ÷ occupied room-nights sold; RevPAR = room revenue ÷ available room-nights. *Room revenue* = taxable value of `room_night` and `extra_bed` invoice lines (no GST, extras, early/late or cancellation charges) |
| `hospitality.revenue` | Revenue | by category (rooms, extra beds, early/late, extras by item or SAC, cancellations and no-shows), by source (walk-in, phone, agent, OTA by name), by room type; taxable, CGST, SGST, total; **reconciles** with the sales register for the same invoices (a footer line "Sales register: ₹… · difference ₹0.00") |
| `hospitality.slab_turnover` | Room turnover by GST slab | room lines at 5% and 18% per month — the CA's ITC-reversal input and next year's specified-premises question |
| `hospitality.guest_register` | Guest register | every stay and occupant in the period, in paper-register column order; print (A4 landscape) and CSV |
| `hospitality.form_iii` | Foreign guests | arrivals and departures with filing status, reference, exceptions |
| `hospitality.cancellations` | Cancellations and no-shows | count, lead time, charged, waived, by source |
| `hospitality.advances_held` | Advances held | as of a date, per booking: advances recorded − applied − refunded, not yet invoiced; for a registered tenant also "tax contained (estimate)" at the first night's slab — the GSTR-1 Table 11A figure (TL-9) |
| `hospitality.day_close` | Day close history | each closed date: recorded cash, counted, difference, who |

#### 2. User flows
Reports hub → Hotel & stays → Occupancy → range "This month" → table and a bar per night → Export CSV.
Guest register → range → **Print** (A4 landscape) or **Export CSV** (`register.export`).

#### 3. Features (MVP vs later)
MVP: the nine above. Later: booking pace, nationality mix, length of stay, repeat-guest rate
(research §8).

#### 4. Entities and relationships
Reads `hospitality_invoice_line`, `hospitality_night`, engine slots and units, `hospitality_room`,
`bookings_out_of_service`, occupants, Form III rows, `hospitality_advance` + payments, day close.

#### 5. Database
No table. Indexes: `ix_hospitality_invoice_line_period` on `(tenant, first_night_on)`, and the
invoice's `document_date` via `document_summaries` for period filters by invoice date (the revenue
report's basis is the **invoice date**, as the sales register's is).

#### 6. API
`GET /reports/<key>?from&to&room_type_id&source&format=csv` (`hospitality.reports.read`; the guest
register also needs `register.read`, its CSV `register.export`). CSV columns are named in English and
Hindi per the existing exports convention.

Guest register columns: Sr no, Room, Name, Age, Gender, Relation, Nationality, Address, Mobile, ID
type, ID last 4 (only with `guest_id.reveal` and the "Include ID" choice), Arrived (date, time), Coming
from, Purpose, Vehicle, Departed (date, time), Going to, Police portal and reference, Form III
reference. After the retention purge a row keeps name, dates and room; the purged cells read
"Removed after {n} days".

#### 7. Frontend
The reports hub entries (`features/reports`), pages rendered from each report's registered columns;
the register print sheet in `features/hospitality/components/print/RegisterPrint.tsx` (print media,
`window.print()`).

#### 8. UI/UX
Tables with totals rows; phone shows cards with the key figure; charts have text values; labels use
the plain words ("Average room rate", "Revenue per available room") with ADR and RevPAR in help text.

#### 9. Validation and business rules
- BR-1 Occupancy excludes archived rooms from the archive date and out-of-order nights.
- BR-2 ADR's denominator counts nights that were invoiced (a voided invoice's nights drop out until
  re-invoiced); complimentary nights count as occupied and add ₹0.
- BR-3 Revenue reconciles: Σ hospitality invoice lines of the period's hospitality invoices equals the
  sales register's total for documents with `origin_module = 'hospitality'` (T-HTL16-2).
- BR-4 Advances held never counts a held deposit (a deposit is not an advance, ADR-044).
- BR-5 Printing or exporting the register writes `hospitality.register.printed|exported` with the range
  and whether IDs were included.

#### 10. Permissions
`hospitality.reports.read` (owner, admin, accountant); register print `register.read`; CSV
`register.export`; IDs `guest_id.reveal`.

#### 11. Reports
This is the reports feature.

#### 12. Testing
- T-HTL16-1 occupancy for a fixture month by hand-computed figures, including an out-of-order week and
  a dorm.
- T-HTL16-2 revenue reconciles with the sales register to the paisa, including a voided and re-issued
  invoice.
- T-HTL16-3 ADR excludes early/late/extras.
- T-HTL16-4 advances held as of a past date (allocations after it are ignored).
- T-HTL16-5 the register CSV has no ID column without `guest_id.reveal`; the audit row records the
  export.
- T-HTL16-6 EXPLAIN on the occupancy query for a 40-room, 12-month range.

#### 13. Edge cases
EC-1 A stay across months → its nights split by night date for occupancy; revenue by invoice date.
EC-2 A tenant that changed GSTIN status mid-period → the slab report shows only taxable lines.

#### 14. Future
Pace, nationality mix, length of stay, repeat guests, a monthly PDF pack for the CA.

---

## HTL-17 — Documents

#### 1. Product requirements
All through the existing print pipeline (`window.print()`, A4, A5, 80 mm), tenant-branded (name,
logo, address, GSTIN) and **never naming the product** (CLAUDE.md;
`customerDocumentsCarryNoProductName.test.tsx` is extended to each):

| Document | Content | Pipeline |
|---|---|---|
| **Booking confirmation** | number, guest, dates, nights, room type and room, guests, price per night and total, "GST as applicable on the date of stay" (research §6.5), advance received, balance, check-in and check-out times, cancellation policy in words, the hotel's address, phone and map link | new print sheet (A4/A5) + a prepared WhatsApp text (DEC-012: the merchant sends it) |
| **Guest registration card** | the hotel's header, guest and co-guests, ID type and last four (with `guest_id.reveal`), foreign-guest block, arrival and departure, room, rate, the hotel's terms (`registration_card_terms`) and the privacy notice (HTL-19), signature lines | new print sheet (A5/A4) |
| **Folio (pre-bill)** | every charge by date, advances, balance; headed "Folio: not a tax invoice" | new print sheet |
| **Tax invoice with a stay block** | the existing sales invoice (A4 and 80 mm) with a block rendered from `meta_block.stay`: booking number, arrival and departure dates and times, rooms, nights, guests, guest name when the bill-to is a company | sales print, extended by sales (task list A5) |
| **Receipt** | the existing payment receipt (PAY-04), note naming the booking | existing |
| **Cancellation invoice** | the existing sales invoice for the charge | existing |
| **Register print** | HTL-16 | report print |

Share links for booking confirmations wait for `parties_share_link` (CR-131, table not built,
10-architecture §7); until then: print, and the WhatsApp text without a link (the PAY-04 precedent,
`apps/payments/services/receipt.py` docstring).

#### 2. User flows
Booking saved → **Share confirmation** → the share sheet (WhatsApp text, Print). Check-in → **Print
registration card**. Stay → Folio → **Print folio**. Check-out → invoice **Print** (A4 / 80 mm) and
**Share**.

#### 3. Features (MVP vs later)
MVP: the table. Later: share links, a GST receipt voucher on advances (TL-9), a screen signature.

#### 4. Entities and relationships
Reads reservation, stay, occupants, folio, branding (`features/branding`), settings.

#### 5. Database
No table; `hospitality_stay.registration_card_printed_at` is stamped on print.

#### 6. API
`GET /bookings/{id}/confirmation` (`booking.read`): `{print: {...}, share_text: {en, hi}}` rendered
server-side like the receipt text (the client never composes a sentence with money in it, PAY-04 BR-4);
`GET /stays/{id}/registration-card`; `GET /folios/{id}/pre-bill`. The invoice stay block needs no
hospitality endpoint: it is in the sales document's `meta`.

#### 7. Frontend
`features/hospitality/components/print/{BookingConfirmationPrint,RegistrationCardPrint,FolioPrint,RegisterPrint}.tsx`,
each `dynamic()`; locale catalogues imported by the print chunk (the `InvoicePrintSheet` pattern,
`features/sales/components/print/InvoicePrintSheet.tsx`). The invoice stay block is a sales component
(`InvoicePrintA4`, `InvoicePrintThermal80`) rendering `doc.meta.stay` when present.

#### 8. UI/UX
Black text on white, the tenant's primary colour on the header rule only (the invoice rule); every
document in the member's locale with the Hindi variant available; dates dd/mm/yyyy; amounts with Indian
grouping through `formatInr` (the CLAUDE.md "₹2800.00" lesson).
WhatsApp text (en): "Booking confirmed at {business}: {number}. {room_type}, {arrival} to {departure}
({nights} nights), {guests} guests. Total {total} (GST as applicable on the date of stay). Advance
received {advance}. Check-in from {check_in_time}. {business_phone}" — and its Hindi text.

#### 9. Validation and business rules
- BR-1 No document contains "YourKhata", "yourkhata.com" or the old name (test).
- BR-2 ID fields print only with `guest_id.reveal`, and never in the share text.
- BR-3 The confirmation never promises a GST amount: it prints "GST as applicable on the date of stay".

#### 10. Permissions
`booking.read` for all; ID lines `guest_id.reveal`.

#### 11. Reports
None.

#### 12. Testing
- T-HTL17-1 the no-product-name test covers the four new sheets and the invoice with a stay block.
- T-HTL17-2 print-media screenshots of each at A4 and A5 (and 80 mm for the invoice) in the sweep.
- T-HTL17-3 the share text never contains a mobile other than the business's, nor an ID.

#### 13. Edge cases
EC-1 A long group (8 rooms) → the confirmation lists rooms in a table that paginates. EC-2 A tenant
without a logo → the text header.

#### 14. Future
Share links, receipt voucher, screen signature, a thank-you text after check-out.

---

## HTL-18 — Settings, roles and switching the module on and off

#### 1. Product requirements
- FR-1 Switching Hotel & stays on requires parties, ledger, payments and sales on (`MODULE_DEPENDENCIES`,
  10-architecture §2.3) and runs the preset seed: the settings rows below with their defaults, the
  hospitality resource-type times, nothing else (no rooms, no demo data).
- FR-2 Switching off is refused while open records exist (10-architecture §9): bookings `hold`,
  `confirmed` or `checked_in`; open folios with any open night or charge; held deposits with the
  module; the engine's own counter for active hospitality bookings. 409 `module_has_data` with the count.
- FR-3 A party with an open booking, an open folio or a held deposit cannot be archived
  (`register_archive_guard`, 409 `party_has_open_records`).
- FR-4 The housekeeping module role (`hospitality_housekeeping`) is offered on the team screen only
  while the module is on (ADR-052).
- FR-5 Until the release CR, `hospitality` is in `UNRELEASED_MODULES` and invisible (10-architecture
  §2.4).
- FR-6 Settings screen: every key in "Defaults the owner may change" below.

#### 2. User flows
Settings → Features → Hotel & stays → on (dependencies switched on by the onboarding checklist when it
ships; until then the existing refusal names them) → Setup → Rooms. Team → Add member → Role
"Housekeeping" → the temporary password is shown once (DEC-012).

#### 3. Features (MVP vs later)
MVP: as above. Later: custom roles (PLT-12) absorbing the module role as a preset; per-room-type times.

#### 4. Entities and relationships
Settings rows (`platform_tenant_setting`, keys `hospitality.*`); `platform_role` system row
`hospitality_housekeeping` (tenant NULL, `is_system`, codenames `hospitality.room.read`,
`hospitality.housekeeping.update`).

#### 5. Database
No hospitality table. Data migration: the module role row; the release migration (plans and partners
gain the code, 10-architecture §2.4). `tenant_data.py` registers every `hospitality_*` table.

#### 6. API
`GET /hospitality/settings`, `PATCH /hospitality/settings` (`settings.manage`); validation per key;
changing check-in/out times updates the resource types (HTL-01 BR-1). The module switch is the existing
`PATCH /settings/modules`.

#### 7. Frontend
Route `/hospitality/settings`; slice `hospitalitySettings`; sections: Times, Early and late, Bookings and
holds, Cancellation, Front desk, Register and privacy, Tax, Housekeeping. Client `MODULE_CODES` gains
`hospitality` (10-architecture §6.3).

#### 8. UI/UX
Each setting shows its default and a one-line explanation; the retention setting shows the legal note
and a confirmation below the floor.

#### 9. Validation and business rules
- BR-1 Times are `HH:MM`; `check_out_time` may be earlier than `check_in_time` (the usual 11:00/12:00).
- BR-2 Tiers and bands are ordered and non-overlapping; percents 0–100.
- BR-3 `guest_id_retention_days` ≥ 180 without confirmation; ≥ 30 absolute.
- BR-4 The module-off guard counts only open records; closed history never blocks (PLT-06 BR-4).

#### 10. Permissions
`settings.manage` (owner, admin); the switch is the platform's existing owner permission.

#### 11. Reports
None.

#### 12. Testing
- T-HTL18-1 module off with a confirmed booking → 409 `module_has_data` (count 1); with only history →
  allowed, and switching on again restores everything.
- T-HTL18-2 the guard contract suite: 0 for an empty tenant, exact counts for open records only.
- T-HTL18-3 archive guard: a party with a tentative booking → 409 `party_has_open_records`.
- T-HTL18-4 `UNRELEASED_MODULES`: the module is absent from `/settings/modules` without
  `UB_UNRELEASED_MODULES=1`.
- T-HTL18-5 the housekeeping role cannot be assigned while the module is off.
- T-HTL18-6 import rules: `apps/hospitality` imports only CORE ∪ {bookings, dues} (whole-AST walk,
  10-architecture §10.1); no `apps.sales` or `apps.inventory` import, deferred ones included.

#### 13. Edge cases
EC-1 Sales switched off while hospitality is on → refused by the dependency rule. EC-2 A settings change
of check-out time with guests in house → applies to late bands from now; nothing already charged moves.

#### 14. Future
Custom roles, per-type times, a guided onboarding for hotels (shared-engines §5.2).

---

## HTL-19 — Guest data privacy and the retention purge

#### 1. Product requirements
- FR-1 Minimisation (ADR-053, DPDP Rules 2025 Rule 6, research §6.11): ID type and last four only; no
  images; ID fields restricted to `guest_id.reveal` and never in lists, exports without the choice,
  share links, notifications, or to housekeeping and the accountant.
- FR-2 A short **privacy notice** in the tenant's name on the check-in screen and the registration
  card: what is collected, why (the guest register and foreign-guest reporting are legal requirements),
  and how long it is kept. Default text (en): "{business} records these details because the law
  requires a guest register and the reporting of foreign guests. They are used for nothing else and are
  deleted {days} days after you leave." With a Hindi version.
- FR-3 A daily **purge** (`hospitality.purge_guest_data`): for occupants whose `retention_until` has
  passed, clear `id_type`, `id_last4`, `age`, `address_line`, `city`, `state_code`, co-guests' `mobile`,
  and delete their `hospitality_foreign_guest` row; keep name, gender, nationality, dates and room (the
  register's skeleton), set `purged_at`. Invoices, parties and ledger rows are untouched (GST and ledger
  retention, research §6.11).
- FR-4 Guest data is in the tenant's export-everything and deletion flows (`tenant_data.register`).
- FR-5 Guest data is never used for marketing or reminders: no reminder source or template reads
  occupants (a test).

#### 2. User flows
None for the clerk. The owner sets the retention in Settings → Register and privacy.

#### 3. Features (MVP vs later)
MVP: as above. Later: a data-principal request screen (DPDP rights, from about May 2027), ID images
under a new ADR, access logs of detail views.

#### 4. Entities and relationships
`hospitality_stay_occupant`, `hospitality_foreign_guest`.

#### 5. Database
`retention_until = checked_out_at::date + guest_id_retention_days` set at check-out;
`ix_hospitality_occupant_retention` (HTL-09) drives the purge.

#### 6. API
No endpoint; the purge is a job. Audit `hospitality.guest_data.purged` with counts, one row per run per
tenant.

#### 7. Frontend
The notice component `PrivacyNotice` on the check-in page and the registration card; the settings
section.

#### 8. UI/UX
The notice is two lines, in plain words, in the tenant's name, never the product's.

#### 9. Validation and business rules
- BR-1 The purge is idempotent and batched (1,000 rows per transaction).
- BR-2 An occupant of a stay still in house is never purged, whatever the date.
- BR-3 Lowering the retention later applies to future check-outs only; raising it extends
  `retention_until` for unpurged rows.

#### 10. Permissions
Settings `settings.manage`; no user can purge by hand from a list (research §5).

#### 11. Reports
The register shows purged cells as removed (HTL-16).

#### 12. Testing
- T-HTL19-1 purge clears exactly the listed columns and deletes foreign rows; reruns change nothing.
- T-HTL19-2 invoices and parties of purged stays are unchanged.
- T-HTL19-3 no API response, CSV or share text carries more than four ID characters (a sweep over every
  hospitality endpoint's response with a seeded twelve-digit Aadhaar typed at check-in).
- T-HTL19-4 the tenant export contains the occupant rows; tenant deletion removes them.

#### 13. Edge cases
EC-1 A guest returns after their data was purged → the party is intact; the new stay captures fresh
register details. EC-2 A police request for an old stay after the purge → the register skeleton
(name, dates, room) remains; the owner keeps paper if a longer duty applies (TL-18).

#### 14. Future
Data-principal requests, access logs, encrypted ID images (new ADR).

---
## Module testing: concurrency suite, e2e harness and screenshot sweep

The per-feature §12 lists name the unit and API tests. Three module-level suites sit on top.

**Concurrency suite** (`backend/apps/hospitality/tests/test_concurrency.py`, `TransactionTestCase`,
two or more real connections released together by a barrier, each run 20 times):
T-HTL05-1 same room and night; T-HTL05-2 overlapping ranges; T-HTL05-3 back-to-back (both succeed);
T-HTL05-4 opposite room order (no deadlock); T-HTL05-5 raw insert refused by the constraint;
T-HTL05-6 expired hold versus new booking and confirm; T-HTL05-7 and T-HTL12-4 extension versus new
booking; T-HTL12-5 early check-out release versus rebooking; T-HTL03-6 out of order versus booking;
T-HTL08-2 walk-in versus phone booking; T-HTL07-5 cancel versus check-in; T-HTL09-5 double check-in;
T-HTL13-6 double check-out; T-HTL06-4 refund versus advance application; T-HTL13-10 check-out versus a
counter sale to the same party. Every test asserts the end state (rows, slot count, numbers consumed,
party balance equal to `recalc_balances`), not just the status codes.

**`e2e/hospitality.mjs`** (against a live stack served by `e2e/serve-api.sh` and `e2e/serve.sh`, with
`UB_UNRELEASED_MODULES=1`), about 60 checks:
1. Owner signs up, switches the module on (dependencies on), sets up two types, six rooms, a dorm with
   four beds, a plan with a weekend price and a season.
2. Booking by phone with an advance; the confirmation text; the calendar bar.
3. **Double booking across two browser contexts**: both save room 104 for the same night; exactly one
   booking exists; the loser sees "Room 104 was just booked…" with its typed values intact (asserts the
   network: one 201, one 409).
4. OTA booking twice with the same reference → the duplicate dialog; Save anyway.
5. Inclusive ₹8,000 night → the gap message; ₹9,440 → accepted at 18%.
6. Walk-in at the business date; check-in of a domestic couple with ≤ 9 required inputs; registration
   card in print media.
7. Foreign guest with the visa missing → override → exceptions; Form III row counting down; mark filed.
8. Extras, an extra bed that crosses ₹7,500, an early check-in that moves the arrival date to 18%.
9. Check-out applying two advances; invoice with the stay block; CGST + SGST for an out-of-state
   company; the room turns Needs cleaning; the sales register shows the invoice.
10. Cancellation with a fee and a refund; no-show from the arrivals list.
11. Housekeeping member in **its own browser context**, asserting who is signed in first: sees the
    board only; marks a room clean; every other page is not in the menu; direct URLs for bookings,
    parties and payments show the not-permitted state; **no seeded guest name or mobile appears in any
    DOM text node** of the board.
12. Day close with the checklist, counted cash, history.
13. Reports: occupancy and revenue for the fixture month match the hand figures; the register CSV has
    no ID column without the choice.
14. Module-off refused with open bookings.

**`--shots`** sweeps every screen into `/tmp/e2e-shots/hospitality` at the four widths the other
harnesses use — phone 360 × 780, tablet 768 × 1024, laptop 1280 × 800, desktop 1440 × 900 — in these
conditions: Today empty (no rooms) and busy; setup rooms and rates; calendar with every bar kind
(tentative, confirmed, in house, out of order, back-to-back) and the phone day list; Is it free?;
booking drawer empty, filled, slot taken, duplicate, gap refused; booking detail with advance;
cancellation dialog; walk-in; check-in (domestic, foreign incomplete); registration card, confirmation,
folio and invoice (A4 and 80 mm) in `emulateMedia({ media: 'print' })`; folio with an 18% night;
check-out; housekeeping board as housekeeping; Form III list (normal, amber, red, overdue) and copy
sheet; day close; occupancy and register reports; settings. Every screenshot runs the two **measuring
checks** — the page's `scrollWidth` against the viewport, and every text node against its own box —
because those are the checks that found the defects every unit test passed (CLAUDE.md). The Hindi
locale is swept at the phone width for the check-in, housekeeping and Form III screens, where Hindi
words are longest relative to their controls.

---

## Defaults the owner may change

Every row is a `hospitality.*` tenant setting (HTL-18), seeded when the module is switched on.

| Setting | Default | Where it matters | Research |
|---|---|---|---|
| `check_in_time` | 12:00 | early bands, cancellation hours, confirmation | §6.3 |
| `check_out_time` | 11:00 | late bands, overdue departures | §6.3 |
| `day_starts_at` (business date boundary) | 06:00 | R1: which night a 01:30 arrival is | §6.3 (this FRD makes it stateless) |
| `checkout_mode` | fixed time (24-hour mode is later) | night counting | §6.3 |
| `tentative_holds` | on | booking status choice | Q7 |
| `tentative_hold_hours` | 24 | hold expiry | §6.1 |
| `confirm_on_advance` | on | an advance confirms a tentative booking | §3.1 |
| `booking_window_months` | 18 | latest arrival accepted | §14 |
| `early_bands` | ≤ 3 h free; 3–6 h 50%; > 6 h or before `day_starts_at`: previous night | HTL-12 | §6.4 |
| `late_bands` | ≤ 1 h free; 1–6 h 50%; > 6 h: next night | HTL-12 | §6.4 |
| `early_checkout_charge` | none | HTL-12 | §6.4 |
| `cancellation_tiers` | free until 48 h before arrival; then 1 night | HTL-07 | §3.6 |
| `no_show_charge` | 1 night | HTL-07 | §6.8 |
| `no_show_after_hours` | 6 (after the check-in time) | overdue arrivals, no-show offer | §7 |
| `front_desk_max_discount_pct` | 10% per night | HTL-05 BR-4 | Q6 (owner to confirm; 0% is the cautious choice) |
| `weekend_nights` (per plan) | Friday and Saturday nights | HTL-02 | §4.2 |
| `prices_include_gst` (per plan) | off | HTL-02 | §6.5 |
| `default_sac_room` | 996311 | every room-type line | §6.5 |
| `one_invoice_per_booking` | on (a room can still be billed separately) | HTL-11 | EC-8 |
| `security_deposit` | off; amount ₹0 when turned on | HTL-06 | Q10 |
| `undo_check_in_minutes` | 15 | HTL-09 | §12 |
| `required_register_fields` | primary: name, mobile, city, ID type and last 4, nationality; co-guests: name, age | HTL-09 | §6.9 |
| `id_optional_under_age` | 18 | HTL-09 | EC-19 |
| `registration_card_print_prompt` | on | HTL-09 | Q9 |
| `registration_card_terms` | empty (the owner writes them) | HTL-17 | §9 |
| `police_portal_name` | empty ("Pathik", "CCTNS" if the owner sets it) | HTL-09 | §6.9 |
| `guest_id_retention_days` | 365 after check-out (floor 180 without confirmation) | HTL-19 | Q8 |
| `stay_over_cleaning` | off | HTL-03 | §3.7 |
| `walk_in_clean_rooms_first` | on (dirty rooms listed with a warning) | HTL-08 | §3.2 |
| `specified_premises` (per financial year) | no; suggested each April from last year's room lines | food tax code warning | §6.6 |
| `form_iii_notice_hours` | 12 (and overdue at 24) | HTL-10 | §6.10 |

---

## Tax/legal review items

For a chartered accountant (TL-1 to TL-15, TL-20 to TL-24) and a lawyer (TL-16 to TL-19). The product
implements the "Product reading" until an answer changes it; each answer is a change request.

| # | Question | Product reading in this FRD | Where |
|---|---|---|---|
| TL-1 | Room slab: 5% without ITC up to ₹7,500 per unit per day, 18% with ITC above, from 22 Sep 2025 (Notification 15/2025-CT(R)); the bands for earlier dates, for backdated documents | Seeded as dated bands in `tax_room_slab`; earlier bands to be confirmed before seeding | HTL-02 §5 |
| TL-2 | Early check-in and late check-out: does each charge belong to a date (early → arrival day's value, late → a standalone departure day)? | Yes (research 6a/6b); the per-night preview shows the effect | HTL-12 BR-3 |
| TL-3 | Is the extra-bed charge part of that room's day value? | Yes (research [S2]) | HTL-02 BR-4 |
| TL-4 | Breakfast or meal plans: is the ₹7,500 test on the package value (a ₹7,000 room with ₹800 breakfast is 18%)? | Yes, one composite line at the accommodation rate | HTL-02 FR-6 |
| TL-5 | Cancellation and no-show charges: the accommodation rate of the first night (SAC 996311), or 18% as a separate service? | First night's slab, SAC 996311 | HTL-07 BR-3 |
| TL-6 | Dormitory beds: is the unit the bed or the room? | The bed | HTL-13 BR-2 |
| TL-7 | Tax-inclusive prices from ₹7,875.01 to ₹8,850.00: refuse, or treat as final at 5%? | Refuse and ask for the price before GST | HTL-02 BR-7 |
| TL-8 | Which date decides the slab set when rates change between booking, advance and stay (CGST Act §14)? | The invoice date (as sales resolves every rate by document date); such stays flagged in the slab report | HTL-02 BR-5, HTL-13 EC-6 |
| TL-9 | GST on advances for accommodation (time of supply §13; receipt voucher, Rule 50; GSTR-1 Table 11A/11B) | MVP: the "Advances held" report with the tax contained as an estimate; the receipt is not a receipt voucher | HTL-06 FR-6, HTL-16 |
| TL-10 | Place of supply for hotel accommodation is the property's location (IGST Act §12(3)), so CGST + SGST even for an out-of-state company with a GSTIN | Forced to the tenant's state | HTL-13 BR-3 |
| TL-11 | A per-night discount lowers the value for the slab (transaction value since 1 Apr 2025) | Yes; discounts are per night, never document-level | HTL-13 BR-6 |
| TL-12 | Specified premises (any unit above ₹7,500 in the preceding year, or declared) and the restaurant rate per financial year | A yearly setting the owner confirms; the product only warns | HTL-11 BR-3 |
| TL-13 | A tenant that registers for GST during a stay | Sales' rule: the invoice date decides; flagged | HTL-13 EC-4 |
| TL-14 | OTA-prepaid bookings: invoice to the guest or to the OTA; the 1% TCS under §52; §9(5) where the hotel is unregistered | Records only: the OTA as a party, the invoice to whom the CA says | research §10 |
| TL-15 | Complimentary (₹0) nights and upgrades: any valuation required? | Invoiced at ₹0 with a reason | HTL-05 BR-4 |
| TL-16 | Form III under the Immigration and Foreigners Act and Rules 2025: 24 h after arrival and after departure, OCI holders included; are Nepal and Bhutan citizens still exempt? | Report all, Nepal/Bhutan flagged "may be exempt" | HTL-10 FR-7 |
| TL-17 | Is type plus last four enough for state guest-register orders (PATHIK, CCTNS, BNSS §163 orders), and for Form III record-keeping, given that full passport and visa numbers are typed into e-FRRO and not stored (ADR-053)? | Yes by ADR-053; a hotel that must keep a copy keeps paper | HTL-09, HTL-10 |
| TL-18 | Retention of guest register data: is 365 days after check-out right, or does any state order require longer? | 365 days, floor 180 | HTL-19 |
| TL-19 | DPDP Act 2023 and Rules 2025: the notice wording, "legitimate use" for a legal obligation, the Aadhaar verifying-entity rule (UIDAI, Dec 2025) | Notice in the tenant's name; last four only; no Aadhaar image | HTL-19 FR-2 |
| TL-20 | A forfeited security deposit: taxable only when a damage charge is invoiced? | Damage is an invoice; the deposit is applied to it | HTL-06 FR-4 |
| TL-21 | Can a hotel be a composition taxpayer (bill of supply), and on what? | Whatever `tenant.gst_type` says; sales' `kind_for` | HTL-13 BR-11 |
| TL-22 | A retention charge for early check-out | Not charged in the MVP | HTL-12 FR-4 |
| TL-23 | Invoice timing for long stays (Rule 47) | One invoice at check-out; stays capped at 90 nights per unit; interim invoices later | HTL-05 V-1 |
| TL-24 | Round-off to the rupee at invoice level | Sales' setting, as for every invoice | HTL-13 |

---

## Implementation task list

Ordered. "Core" and "Engine" names are 10-architecture §13's (A1–A11) and 11-contracts §2.2. A task
starts only when every dependency is merged with its replay and contract tests. HTL-T numbers are
this module's.

| # | Task | Depends on | Done when |
|---|---|---|---|
| HTL-T01 | Architecture owner answers C1–C6 (C1, C2, C3 and C5 block HTL-13 and HTL-11) | — | answers recorded in 11-contracts |
| — | **Core A1** release gate: `ModuleCode.HOSPITALITY`, `UNRELEASED_MODULES`, `MODULE_DEPENDENCIES` and `ENGINES_USED_BY` lines | — | (core) |
| — | **Core A4** payments: target protocol v2, **`allocate_existing`**, held deposits, `adjustment` mode | — | (core) |
| — | **Core A5** document port + sales issuer: origin columns, `on_void`/`on_settlement_changed`/`blocks_void`, `credit_check`, **`meta_block` rendered by the invoice print (A4 and 80 mm)**, and the dated **`tax_room_slab`** table with its seed | C1, C2, C12 | (core) |
| — | **Core A6** party roles (`register_party_role`) and archive guards | — | (core) |
| — | **Core A8** number kinds (`register_number_kind`, kind `booking`) | — | (core) |
| — | **Core A10** registries: schedules, dashboard sections, reports, notification types | — | (core) |
| — | **Core A11** import test over the whole AST | — | (core) |
| — | **ADR-052 module roles** (`platform_role` system rows, `common/scoping.py`, `RestrictedFieldsMixin`) | C11 | (core) |
| — | **Engine: bookings** (`apps/bookings`): tables, `availability`, `hold`, `book`, `confirm`, `change_unit`, `check_in`, `check_out`, `cancel`, `mark_no_show`, `expire_holds`, `set_out_of_service`, `check_integrity`, `register_booking_subject`, read API with `EngineEnabled`, the engine test subject; plus the C6/C7/C8 answers | A1, A10, A11 | (engine, Wave D) |
| HTL-T02 | App skeleton: `apps/hospitality`, `AppConfig.ready()` registrations, codenames, error codes, audit actions, `tenant_data.py`, the ESLint zone and the client `MODULE_CODES` change | A1, A10, A11 | import test and route-coverage test green |
| HTL-T03 | HTL-01 rooms, types, beds (migration `0001` depends on `bookings.0001`) | T02, bookings engine | T-HTL01-* |
| HTL-T04 | HTL-03 housekeeping, board projection, the `hospitality_housekeeping` role row | T03, ADR-052 | T-HTL03-* |
| HTL-T05 | HTL-02 rate plans, seasons, quote, slab decision against `tax_room_slab` | T03, A5 (slab table) | T-HTL02-* incl. the fuzzed gap test |
| HTL-T06 | HTL-05 reservations, nights, duplicate check, `booking` numbers, guest role profile | T05, A6, A8, bookings engine | T-HTL05-1…12 incl. concurrency |
| HTL-T07 | HTL-04 calendar and availability endpoints | T06 | T-HTL04-1 EXPLAIN |
| HTL-T08 | HTL-06 advances, refunds, deposits | T06, A4 | T-HTL06-* incl. replay |
| HTL-T09 | HTL-11 folio tables, charges, grouping, server-side preview | T06, A5 (port line shape), C5 | T-HTL11-1 preview equals invoice |
| HTL-T10 | HTL-09 check-in, occupants, police marks, undo | T09 | T-HTL09-* incl. ADR-053 |
| HTL-T11 | HTL-10 foreign guests, Form III, sweep and notifications | T10, A10 | T-HTL10-* |
| HTL-T12 | HTL-08 walk-in | T10 | T-HTL08-* |
| HTL-T13 | HTL-12 early/late bands, extension, shorten, move (move behind C6) | T10, C6 | T-HTL12-* |
| HTL-T14 | HTL-13 check-out through the port, origin listener, advances via `allocate_existing` | T08, T09, T13, A4, A5, C1–C4 | T-HTL13-1 (the twelve examples) … 11 |
| HTL-T15 | HTL-07 cancellation and no-show | T14, C8 | T-HTL07-* |
| HTL-T16 | HTL-14 day close | T14 | T-HTL14-* |
| HTL-T17 | HTL-15 dashboard section and Today page | T14, A10 | T-HTL15-* |
| HTL-T18 | HTL-16 reports (nine) | T14, T15, A10 | T-HTL16-* incl. reconciliation |
| HTL-T19 | HTL-17 documents; extend `customerDocumentsCarryNoProductName.test.tsx` | T14, A5 (stay block) | T-HTL17-* |
| HTL-T20 | HTL-18 settings, presets, module-off and archive guards | T06, T08, T09 | T-HTL18-* |
| HTL-T21 | HTL-19 retention purge and privacy notice | T10 | T-HTL19-* |
| HTL-T22 | Frontend foundations: routes, `GUARDED_ROUTE_PREFIXES`, `CRAWL_DISALLOW`, nav rows, locale catalogues (`hospitality`, `bookings`), lazy slices, `bundle:check` with no `sharedApp` growth | T02 | routes test, bundle gate |
| HTL-T23 | Frontend screens in build order: setup → rates → calendar (`features/bookings/components/AvailabilityGrid`) → booking drawer → advances → check-in → folio → check-out → housekeeping → Form III → day close → Today → settings | each backend task, T22 | component tests; `type-check`, `lint`, `test` |
| HTL-T24 | `e2e/hospitality.mjs` with `--shots` | T23 | the harness green; the sweep's measuring checks clean |
| HTL-T25 | Concurrency suite and EXPLAIN tests (module-level) | T14, T07 | green 20 runs in a row |
| HTL-T26 | Part 21 (tables), Part 22 (endpoints, error codes), Part 43 CRs: canon §0.9 module role, the release CR | T14 | docs merged through the Project for Part 43 |
| HTL-T27 | Release: data migration adding `hospitality` to `MVP_MODULES` and partners (10-architecture §2.4) | all above, owner's CR | module visible without the env flag |
| HTL-T28 | `docs/BACKLOG.md`: "OTA channel manager (Booking.com, MakeMyTrip/Goibibo, Agoda, Airbnb) — deferred by ADR-021" with HTL-05 §14's reason | — | entry present (by whoever owns BACKLOG in that phase) |

---

## Contract questions

None of these changes 11-contracts; each needs the architecture owner. "Blocks" names what cannot be
built as specified without an answer, and "Meanwhile" what this FRD assumes.

| # | Question | Evidence | Blocks | Proposal / meanwhile |
|---|---|---|---|---|
| C1 | `IssueRequest` has no **place of supply**. Sales defaults it to the party's state (`default_pos`, `apps/sales/services/payload.py`), which makes an out-of-state company's hotel invoice IGST — wrong for accommodation (IGST Act §12(3)); engine-checked: IGST ₹160 instead of CGST ₹80 + SGST ₹80 | 11-contracts §1.5 `IssueRequest` | HTL-13 | Add `place_of_supply_state: str | None` to `IssueRequest`; hospitality always sends the tenant's state |
| C2 | `DocumentLine.gst_rate` is a number, but a sales line stores a `tax_code` resolved by date (`sales_document_line.tax_code`, `apps/sales/services/lines.py`), and several codes share a rate (GST0, EXEMPT, NIL, NONGST at 0%) | §1.5 `DocumentLine` | HTL-13, HTL-11 | Add `tax_code: str | None` to `DocumentLine` (the slab table already stores codes); meanwhile the issuer maps 5 → GST5, 18 → GST18 on the document date |
| C3 | `apply_open_advances: bool` applies **every** open advance of the party, but a hotel must apply only this booking's advances; and other callers of `allocate_existing` (the dues run's auto-apply) could consume a hotel booking's advance for a party who is also a gym member. Separately, applying advances after the port has taken the invoice sequence lock puts payments after a sequence in lock order | §1.4 `allocate_existing` callers; §1.5; the notation's lock order | HTL-13, HTL-06 | Either `IssueRequest.apply_payments: list[UUID]` (allocated by the issuer before it allocates the number, which also fixes the lock order), or an earmark on payments (`meta.earmark = {module, subject_id}`) that auto-apply skips; meanwhile hospitality calls `allocate_existing` after issue, safe because every writer of those payments locks the same party first |
| C4 | No way to pass an owner's **credit-limit override** through the port when `credit_check="enforce"` in block mode (sales' `issue_invoice(override=...)`) | §1.5 | HTL-13 | Add `override: bool` to `IssueRequest`, honoured only for owner/admin (sales' `may_override`) |
| C5 | No **item read port**: hospitality may not import inventory, yet 10-architecture §2.3 lets a folio extra name an inventory item; the folio preview needs its name, price, HSN/SAC, tax code and type before any document exists | 10-architecture §2.3, §3 L1 | HTL-11 | `common/seams/items.py`: `search_items(tenant, q, limit)`, `item_summaries(tenant, ids)`, registered by inventory; meanwhile extras are item-less lines with SAC |
| C6 | The bookings engine has no **add a unit to an existing booking** and no **split a unit at a date** (mid-stay room move); `change_unit` re-rooms the whole unit, slept nights included | §2.2 services | HTL-05 (add room), HTL-12 (move) | `add_unit(booking_id, unit)` and `split_unit(unit_id, on, resource_id)` |
| C7 | No engine service to **end or shorten** an out-of-service period (room back in service early) | §2.2 `set_out_of_service` only | HTL-03 | `end_out_of_service(oos_id, on)` |
| C8 | Where do **cancellation tiers** live? `cancel()` returns "a fee from policy tiers" and `cancellation_fee(tenant, booking_id, at)` exists, but no engine table holds tiers | §2.2 | HTL-07 | Tiers passed by the vertical (`cancellation_fee(..., tiers=...)`), since the price is the vertical's; meanwhile hospitality computes from its setting |
| C9 | `hold()`/`book()` do not take a `number`, so `bookings_booking.number` would stay null while the hotel's BKG number lives on `hospitality_reservation` | §2.2 | — | Accept `number` in `hold`/`book`, or drop the engine column |
| C10 | Unit statuses and the booking roll-up (in house if any unit is, completed when all are) are not stated; nor the inverse of `check_in` needed by undo | §2.2 | HTL-05 BR-7, HTL-09 FR-6 | State the roll-up; add `undo_check_in(unit_id)` |
| C11 | Housekeeping's scope: 11-contracts §3 says "rooms and today's arrivals and departures"; this module's brief says room status only. The FRD serves a room board with per-room "due out today"/"arriving today" flags and no names, which satisfies both. Also: module roles (ADR-052) are not one of Wave A's A1–A11 | §3; 10-architecture §13 | HTL-03 | Confirm the projection; name the wave item for module roles |
| C12 | The dated **room-slab table** is decided (ADR-045: in `tax`) but its shape is not in the contracts | ADR-045; 10-architecture §12 | HTL-02, A5 | `tax_room_slab(effective_from, effective_to, up_to, tax_code)` as in HTL-02 §5 |
| C13 | Origin type: 11-contracts' example is `hospitality_stay`; the FRD uses **`hospitality_folio`**, because one invoice can cover several rooms and a cancellation charge has no stay | §1.5 example | — | Confirm `hospitality_folio` |
| C14 | 10-architecture §9 names hospitality's blocking statuses "tentative, confirmed or checked_in"; the engine's status is `hold`, not `tentative` | §9 vs §2.2 | HTL-18 | Read "tentative" as engine `hold` |
| C15 | Engine read endpoints check "`<module>.<resource>.read`" of a consuming module; which one for hospitality? | 10-architecture §5, §8 | HTL-04 | `hospitality.booking.read` |
| C16 | The accountant role is "every `.read` codename" (`permissions_registry.py:96`), so any module's ID-bearing `.read` codename reaches accountants automatically, against ADR-053's minimisation | ADR-053; registry | HTL-09 | The FRD names it `hospitality.guest_id.reveal`; a rule for all modules would be better |
| C17 | `DocumentLine.qty` for nights uses unit `NOS`; there is no UQC for a night in the seeded units | seed units | HTL-13 | Accept `NOS` with the nights in the description, or seed `OTH` |

---

## Owner questions from the research, and where this FRD stands

| Research Q | Decision or assumption here |
|---|---|
| Q1 PG placement | Not in this module (research preamble) |
| Q2 Housekeeping role | Module role `hospitality_housekeeping` (ADR-052); owner to confirm with the CR (10-architecture §16 item 1) |
| Q3 Walk-in guests as parties | Yes; the role filter `?role=hospitality_guest` separates them in the party list |
| Q4 Co-guests | Register rows with an optional party link (ADR-046) |
| Q5 Day close | A checklist that never blocks (the brief) |
| Q6 Front-desk discount | 10% per night by default, a setting; owner to confirm |
| Q7 Default policies | "Defaults the owner may change" |
| Q8 ID retention | 365 days; TL-18 |
| Q9 Registration card | Printed paper card; screen signature later |
| Q10 Security deposits | In the MVP as held deposits (ADR-044), off by default |
| Q11–Q18 Tax | TL-1 to TL-16 |
| Q19–Q22 Architecture | Decided by ADR-041, 047, 049, 045 |
| §6.11 "keep full ID numbers" | Refused by ADR-053 (binding) |

---

## Sources

Research: `docs/platform/research/hospitality.md` (all sections), `research/shared-engines.md` §3.
Architecture: `docs/platform/00-platform-vision.md`, `10-architecture.md`, `11-contracts.md`, ADR-041
to ADR-055. House style: `docs/17-00-frd-template.md`, `docs/17-02-frd-ledger-payments.md`.

Code read at `30798d2`, and what each fixed in this FRD:
- `backend/apps/tax/services/tax_engine.py` — the rounding, per-line tax, inclusive back-out and the
  document-discount allocation; **every worked example in HTL-13 and every boundary in HTL-02 BR-7 was
  computed by importing this module and running it**, not by hand.
- `backend/apps/common/money.py` — `q2`, `to_rupee`, half-up everywhere.
- `backend/apps/common/management/commands/seed_reference_data.py` — the codes GST5, GST12 (to
  2025-09-21), GST18; the SAC master has 9963 but not 996311.
- `backend/apps/sales/models.py`, `services/payload.py` (`kind_for`, `default_pos`), `services/lines.py`
  (tax codes by document date), `services/issue.py` and `issue_parts.py` (credit check on the locked
  party, stock, number last), `services/void.py` (payments detached on void), `constants.py`
  (`LINES_MAX = 100`, `KIND_FOR_GST_TYPE`).
- `backend/apps/payments/models.py`, `services/record.py` (allocations `"none"`, `meta`, lock order),
  `services/receipt.py` (the share-text precedent).
- `backend/apps/parties/models.py` (state code, mobile), `apps/inventory/models.py` (`item_type`,
  `tax_code`, `selling_price`, `track_stock`), `apps/notifications/services/notify.py` (the registry),
  `apps/common/jobs.py` (`SCHEDULES`, hourly as the finest period), `apps/common/permissions_registry.py`
  (the accountant `.read` rule).
- `frontend/src/modules/DigiKhaato/features/sales/components/print/*` (the print pipeline the stay
  block extends), `features/navigation/sidebarConfig.ts`, `src/design-system/` (component inventory),
  `e2e/tags.mjs` (the four sweep widths).
