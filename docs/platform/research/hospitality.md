# Hotel and stays (`hospitality`): research

Status: **Phase 2 research, 29 Sep 2026.** Research only: no code, no decisions. The architecture
agent decides the shape (vision §3 rule 5); this document proposes. It is bound by
[00-platform-vision.md](../00-platform-vision.md), [01-current-capabilities.md](../01-current-capabilities.md)
and `CLAUDE.md`. Legal and tax findings are from public sources checked on the date shown in
§18; they are research notes for the owner and a chartered accountant, not legal advice.

**Scope.** Small hotels, lodges, guest houses, homestays and hostels with dormitory beds: roughly 1
to 40 rooms, one property per business, one GSTIN, a front desk that is often the owner.

**The PG question, answered first.** Monthly-stay paying-guest (PG) accommodation does **not**
belong in this module. It belongs with the **recurring dues** engine (the "rent collection"
candidate in vision §2), which borrows two things from here: the bed or room as a resource, and
the guest register. The reasons:

| | Nightly stay (this module) | Monthly PG (recurring dues) |
|---|---|---|
| The unit being sold | a room-night | a bed-month |
| Money shape | one folio, one invoice at check-out, advances before | a monthly due, a security deposit, late fees, a notice period |
| The daily question | who arrives and leaves today, which rooms are free | who hasn't paid this month |
| GST | 5% or 18% by the per-night value (§6.5) | exempt when ≤ ₹20,000 per person per month and the stay is at least 90 continuous days (Entry 12A, Notification 12/2017-CT(R), as amended in 2024) |
| Products studied | eZee, Hotelogix, small-hotel apps: a calendar and a folio | RentOk, PG apps: rent collection, dues, reminders, KYC |

A hostel that sells dormitory beds by the night stays here: a bed is a room with a capacity of one.
A hotel's month-long corporate guest also stays here: it is a long stay with nights. The monthly
PG resident is a recurring due.

---

## 1. Core use cases

1. **"Is a room free on these dates, and at what price?"** Asked on the phone dozens of times a
   day. The answer has to be right, because a double-sold room on a festival weekend is the worst
   thing that happens at a small hotel.
2. **Take a booking with an advance.** A name, a mobile number, dates, a room type, a price, and
   usually a token advance by UPI. Send a confirmation on WhatsApp.
3. **A walk-in guest.** No booking: find a free, clean room, quote, check in within two minutes.
4. **Check in.** Record the guest and co-guests, capture ID, assign a room, take or top up the
   advance, have the guest sign the registration card, hand over the key.
5. **Keep the police and immigration obligations.** Keep the guest register. Report every foreign
   national on the Bureau of Immigration's Form C (now Form III) within 24 hours of arrival and of
   departure. Upload guest details to state police portals where they apply.
6. **Charge the stay.** Room nights, an extra bed, early check-in or late check-out, and extras
   such as food, laundry, minibar, a taxi or a tour, all on the guest's folio.
7. **Check out.** Show the folio, take the balance, issue a GST tax invoice (to a company GSTIN if
   the guest asks), mark the room dirty.
8. **Cancellations and no-shows.** Keep or refund the advance under the hotel's policy.
9. **Housekeeping.** Know which rooms are clean, dirty or out of order, so the front desk never
   sells a dirty room to a walk-in.
10. **Close the day.** Count cash, see who didn't arrive, see who is still in the house and who
    owes money.
11. **Know how the business is doing.** Occupancy, average room rate, room revenue, revenue by
    source (walk-in, phone, OTA, agent), and money still to collect.
12. **Agents and companies on credit.** A travel agent or company sends guests and pays monthly.
    This is the existing ledger's job, and it is the reason a records platform is a good home for
    this module.

## 2. Target users and personas

| Persona | Setting | What they need | What they don't need |
|---|---|---|---|
| **Owner-operator** (primary) | A 12-room lodge near a bus stand, pilgrim town or highway. The owner sits at the desk by day; a relative or one clerk takes the night. Today it's a paper register, a diary of bookings and a cash box. | A calendar that stops double-selling, a guest register the police accept, a GST bill, a cash and advances total at night. Works on a phone. | Revenue management, yield rules, a POS with tables and KOTs, multi-property. |
| **Front-desk clerk** | Night shift, often alone. Handles walk-ins at 1 a.m. and early check-outs at 5 a.m. | Fast check-in, the ID fields the police want, a way to take cash that the owner can later see. | Rate editing, deleting anything, reports. |
| **Housekeeping staff** | One to four people, sometimes shared with the kitchen. Low literacy is common; Hindi is common. | A list of rooms with a big status button: dirty → clean. | Guest names, money, ID. |
| **Homestay host** | 2–5 rooms in their own home, in the hills or a heritage town. Many foreign guests. Everything on the phone. | Bookings, Form C discipline, a nice confirmation and bill with their own name. | Night audit, housekeeping workflow. |
| **Hostel manager** | Dormitory beds and a few private rooms, young and foreign guests, OTA-heavy. | Bed-level availability, passport capture, Form C volume. | Company billing. |
| **Accountant (CA)** | Outside the business, monthly. | Invoices with the right GST slab, advances received this month, the GST summary, exports. | Operational screens. |

Two numbers from the research shape the design. Form C carries a compounding amount of ₹50,000
per case for accommodation providers under the Immigration and Foreigners Act, 2025 (§18 [S6]),
so a missed filing costs more than a year of software. And under GST 2.0 most small hotels charge
5% on rooms, but a single room priced above ₹7,500 changes the slab for that night (§6.5).

## 3. Workflows

### 3.1 Phone or direct booking

1. Front desk opens **Availability** (a calendar of rooms by nights) or the quick **Is it free?**
   search: dates, adults and children, room type.
2. The system shows free units per room type for each night, with the rate plan price for each
   night (weekday, weekend and season can differ).
3. Enter the guest: mobile first. An existing guest is found by mobile; a new one is created as a
   party (§15). Fill in dates, room type (optionally a specific room), rate plan, the agreed price,
   the number of guests, the source (phone, walk-in, agent, OTA, website) and any note.
4. Status is **Tentative** (held until a time) or **Confirmed**. A tentative hold expires on its
   own through the scheduler (§6.2).
5. Take the advance: this records a payment through the existing payments service with the booking
   as its context (§10). Print or share the receipt.
6. Share the **booking confirmation** as a prepared WhatsApp message or a share link (§9). The
   product sends nothing itself (DEC-012).

### 3.2 Walk-in

1. **Walk-in** button → dates default to tonight → next morning. The system lists rooms that are
   free **and clean** now.
2. Pick a room → guest details → check-in happens in the same flow (§3.3). A walk-in is a booking
   created and checked in at once, so that reports and the calendar need no special case.

### 3.3 Check-in

1. From **Today's arrivals**, open the booking. Assign a room if none is assigned (only free rooms,
   warning if the room isn't clean).
2. **Guest register**: the primary guest's full name, address, mobile, nationality, the purpose of
   the visit, where they are coming from and going to, the ID type and number, and every
   co-guest's name, age and relation (§4, §6.9). A foreign national also needs passport and visa
   details, and the stay goes on the **Form C due** list (§6.10).
3. **ID capture**: the ID type and a masked number are recorded. Storing ID images is not in the
   MVP, for the privacy reasons in §6.11.
4. Confirm the rate, the extra bed and the plan (room only, or room with breakfast), and take or
   top up the advance.
5. Print the **guest registration card** for the guest's signature, which is still normal practice
   in India and what a police inspection asks to see. Actual arrival time is stamped.
6. The room shows **Occupied**, and the folio opens.

### 3.4 During the stay

- **Post an extra** to the folio: an item (dinner, laundry, water, taxi) with its quantity and
  price. The item carries its own GST rate and SAC or HSN code (§6.6).
- **Room change** from a date: each part keeps its own rate.
- **Extend or shorten**: availability is re-checked and the nights are re-derived.
- **Take a payment**: a part payment or a deposit top-up.

### 3.5 Check-out

1. Open the stay from **Today's departures** or the in-house list. The system computes room nights
   (§6.3), early or late charges (§6.4) and extras, and shows the folio preview, slab by night.
2. Choose the bill-to: the guest, or a company or agent party with a GSTIN.
3. **Issue the invoice**: the folio lines become a sales invoice through the sales seam (§15), and
   the number comes from the existing invoice series.
4. Settle: apply the advances, then take the balance, or leave it on the bill-to party's account
   when its credit limit allows.
5. The room turns **Dirty**. A foreign guest's departure joins the Form C due list.

### 3.6 Cancellation and no-show

**Cancel before arrival** with a reason. The policy suggests a charge (for example, free until
48 h before arrival, then one night). The front desk can lower it (a permission); only the owner
or an admin can waive it. The charge is invoiced (§6.8) and settled from the advance. The rest is
refunded as a payment out, or held on the guest's account.

**No-show**: after the cut-off, or at day close, a confirmed arrival not checked in is offered as
a no-show. It's treated like a late cancellation, with its own reason code for reports.

### 3.7 Housekeeping

Housekeeping sees rooms by floor, each with its status and one button, **Mark clean**.
Supervisors can also mark a room:

- **Inspected**;
- **Out of order**: can't be sold, and needs a reason and dates;
- **Out of service**: can be sold, with a note such as "AC noisy".

A check-out makes a room Dirty. Occupied rooms can also turn Dirty every morning, if the business
turns on stay-over cleaning.

### 3.8 Day close (night audit, simplified)

Once a day, at a time the business chooses (default 02:00, or on demand), the owner or clerk runs
**Day close**:

1. **Arrivals not checked in**: mark as a no-show, or roll the date forward.
2. **Departures not checked out**: extend the stay, or check out now.
3. **In-house stays**: this night is counted and each folio's accrued room charge is shown. Nothing
   is posted to the ledger, because the ledger moves only when the invoice is issued (§15).
4. **Money today**: cash, UPI and card received today by mode, against what the payments recorded,
   with a field for the counted cash and the difference.
5. **Open folios**: guests with an unpaid balance.
6. **Form C due**: any foreign arrival or departure not yet marked as filed.
7. The business date moves on. Later, closed dates are locked against backdated changes (§16).

eZee's night audit does the same checks (pending arrivals, departures, unsettled folios, nightly
room charges, then a new business day) and **blocks** check-ins until it is run (§18 [S12]). We
should not block. A small lodge where the owner forgets the audit must still be able to check in
a guest at 1 a.m. So day close is a checklist and a date roll, not a gate.

## 4. Entities and fields

Names are proposals for the architecture agent. **Engine** means the shared bookings/resources
engine (vision §3 rule 3), which hospitality configures and which gym slots or library holds
might reuse later. **Hosp** means the hospitality app. Every table has `id` (uuid7), `tenant_id`
and the usual audit timestamps.

### 4.1 Engine: resources and bookings

| Entity | Fields | Notes |
|---|---|---|
| **`resource_type`** ("room type": Deluxe, Standard, Dormitory bed) | `module`, `code`, `name`, `base_capacity`, `max_capacity` (with an extra bed), `max_children`, `extra_bed_allowed`, `amenities` (tags), `description`, `display_order`, `is_active` | Archive only, once there are no future bookings |
| **`resource`** ("room" or "bed") | `resource_type_id`, `label` ("101", "Dorm A – Bed 3"), `floor`/`area`, `parent_resource_id` (a bed in a dorm room), `sort_order`, `is_active`, `notes` | A retired room keeps its history |
| **`booking`** | `module`, `number` (series BKG, per financial year, the existing numbering service); `status` (`tentative`, `confirmed`, `checked_in`, `checked_out`, `cancelled`, `no_show`); `party_id` (booker or primary guest); `bill_to_party_id` (optional: company or agent); `source` (`walk_in`, `phone`, `direct`, `agent`, `ota`, `other`); `source_name` ("Booking.com", an agent); `external_ref` (the OTA's id); `arrival_date`, `departure_date`, `expected_arrival_time`, `hold_until`; `adults`, `children`; `notes`, `special_requests`; `cancel_reason`, `cancelled_at`, `cancellation_charge`; `created_by`, `version`, `meta` | One booking can hold several rooms |
| **`booking_unit`** (one per room in the booking) | `booking_id`, `resource_type_id`, `resource_id` (null until assigned), `start_date`, `end_date` (a room change splits the line), `adults`, `children`, `extra_beds`, `rate_plan_id`, `status` (per unit), `actual_check_in_at`, `actual_check_out_at` | One room of three can check out early |
| **`resource_night`** (the availability ledger) | `resource_id`, `night_date`, `booking_unit_id`; **`unique(tenant_id, resource_id, night_date)`** | One row per room per night held. The database, not the code, refuses a double sale (§6.1) |
| **`type_night_hold`** (later) | `resource_type_id`, `night_date`, `held` | For unassigned bookings (§6.1) |

### 4.2 Hosp: rates

| Entity | Fields | Notes |
|---|---|---|
| **`rate_plan`** | `resource_type_id`, `name` ("Room only", "With breakfast"), `meal_plan` (`room_only`, `breakfast`, `half_board`, `full_board`), `base_rate` per night **before GST**, `extra_adult_rate`, `extra_child_rate`, `weekend_rate`, `weekend_days` (default Fri and Sat nights), `min_nights`, `meal_component` (the meal value inside the rate), `is_active` | The trade short forms EP/CP/MAP/AP appear only in help text, never as labels |
| **`rate_season`** | `rate_plan_id`, `name`, `start_date`, `end_date`, `rate`, `weekend_rate`, `extra_adult_rate` | Where seasons overlap, the shorter range wins; saving an overlap warns |
| **`booking_night_rate`** (snapshot) | `booking_unit_id`, `night_date`, `room_rate`, `extra_bed_amount`, `early_late_amount`, `discount_amount`, `net_value`, `gst_rate` (§6.5, recomputed until invoiced), `rate_source` (plan, season, manual), `reason` | "The price we quoted on the phone". Copied from the plan when booked, so a later rate change doesn't reprice a confirmed booking |

### 4.3 Hosp: stay, guests, register

| Entity | Fields | Notes |
|---|---|---|
| **`stay`** (1:1 with a checked-in `booking_unit`) | `booking_unit_id`, `resource_id`, `checked_in_at`/`_by`, `checked_out_at`/`_by`, `arriving_from`, `going_to`, `purpose` (tourism, business, pilgrimage, medical, family, other), `vehicle_number`, `registration_card_printed_at`, `invoice_id` | `vehicle_number` is asked by several state registers |
| **`stay_occupant`** (everyone in the room, including the primary guest) | `stay_id`, `party_id` (required for the primary guest, optional for co-guests, §15.2), `full_name`, `gender`, `age` or `date_of_birth`, `relation_to_primary`, `nationality` (ISO), `is_foreign_national` (derived), `id_type` (Aadhaar, passport, driving licence, voter ID, PAN, other photo ID), `id_number_masked`, `id_number_last4`, `id_number_full` (**never for Aadhaar**; other IDs only when "keep full ID numbers" is on, restricted read, §6.11), `address_line`, `city`, `state`, `country`, `mobile`, `retention_until` | The primary guest's contact details come from the party |
| **`foreign_guest_detail`** (1:1 with a foreign occupant) | `passport_number`, `_place_of_issue`, `_issue_date`, `_expiry_date`; `visa_number` or e-visa number, `visa_type`, `_place_of_issue`, `_issue_date`, `_expiry_date`; `oci_card_number`; `arrived_in_india_on`, `arrived_from_country`, `port_of_entry`; `form_c_arrival_ref`/`_filed_at`/`_filed_by`; `form_c_departure_ref`/`_filed_at`/`_filed_by` | OCI holders are now reported too (§6.10) |
| **`police_register_submission`** | `stay_id`, `portal` (tenant-defined text such as "Pathik"), `submitted_at`, `submitted_by`, `reference` | Optional; for state portals |

### 4.4 Hosp: folio

**`folio_charge`**: a line on a stay's folio. **It isn't a ledger entry** (§15.3).
- Fields: `stay_id` (or `booking_id` for a cancellation charge), `kind`, `service_date`,
  `description`, `item_id` (an inventory item, for extras), `hsn_sac`, `qty`, `unit_price`,
  `tax_inclusive`, `discount_amount`, `gst_rate`, `tax_code`, `status`, `invoice_line_id`,
  `posted_by`, `posted_at`, `void_reason`.
- `kind` is one of `room_night`, `extra_bed`, `early_check_in`, `late_check_out`, `extra`,
  `cancellation` or `adjustment`.
- `status` is `open`, `invoiced` or `voided`. A void keeps the row and its reason; nothing is
  deleted.
- Room nights are **derived** from `booking_night_rate` when the folio is shown or invoiced.
  Extras are stored as they are posted.

### 4.5 Hosp: housekeeping, settings

- **`room_status`** (current) and **`room_status_event`** (history): `resource_id`; `status`
  (`clean`, `dirty`, `inspected`, `out_of_order`, `out_of_service`); `reason`; `from_date` and
  `to_date` (for out of order); `changed_by` and `changed_at`. Occupancy (vacant, occupied, due
  out) is **derived** from stays, never stored.
- **Hospitality settings** (in `tenant_settings`, through the existing settings service):
  `check_in_time` (12:00), `check_out_time` (11:00), `checkout_mode` (`fixed_time` or `24_hour`),
  the early and late bands (§6.4), cancellation tiers (hours before arrival → nights or %),
  `no_show_charge`, `tentative_hold_hours`, `day_close_time`, `specified_premises` per financial
  year (§6.6), `default_sac_room` (996311), `guest_id_retention_days` (365),
  `keep_full_id_numbers` (off), `registration_card_terms`, `stay_over_cleaning`,
  `required_register_fields`, `front_desk_max_discount_pct`.

## 5. CRUD

| Entity | Create | Read | Update | Delete |
|---|---|---|---|---|
| Room type | owner/admin | all hospitality roles | owner/admin | archive only when no future bookings |
| Room / bed | owner/admin | all | owner/admin (the label is editable; the history follows the id) | archive; never deleted once it has any night |
| Rate plan, season | owner/admin | front desk sees prices, not the plan editor | owner/admin; a change doesn't touch booked nights | archive |
| Booking | front desk and up | front desk and up; housekeeping sees room and dates only | until checked in: dates, rooms, guests, rate (a permission for below-plan prices) | **never**: cancel, with a reason |
| Night rate snapshot | with the booking | front desk and up | front desk (within the discount permission) until invoiced | re-derived, not deleted |
| Stay (check-in) | front desk | front desk and up | occupants, purpose, vehicle while in house; times correctable by owner/admin with an audit row | undo check-in within N minutes if nothing is posted (§13); otherwise not |
| Occupant, ID | front desk | ID fields need `hospitality.guest_id.read` | while in house; afterwards owner/admin only | purged by retention (§6.11), never by hand from a list |
| Folio charge | front desk | front desk and up | before invoice only | void with a reason; invoiced lines are corrected by a credit note |
| Invoice | through check-out | the existing sales screens | the existing sales rules (draft only) | the existing void |
| Room status | housekeeping and up | all | housekeeping: dirty/clean; supervisor: the rest | history kept |
| Form C / police marks | front desk | front desk and up | the reference can be corrected, with an audit row | no |
| Settings | owner/admin | owner/admin | owner/admin | n/a |

Every state change writes the existing audit log (`/settings/activity`).

## 6. Business rules

### 6.1 Availability and overbooking prevention

- A room is **available for a night** when it is active, not out of order on that night, and has
  no `resource_night` row for that night.
- **Room-level guarantee.** Assigning room R to a unit for nights N1…Nk inserts k `resource_night`
  rows in the same transaction as the booking. The unique constraint makes a second writer fail at
  commit, whichever device it came from. This is the simplest correct mechanism, needs no Postgres
  extension, and a 40-room hotel produces at most about 15,000 rows a year. (The alternative, an
  exclusion constraint on a `daterange`, needs `btree_gist`, which is an ADR question under
  ADR-021.)
- **Type-level guarantee** (booked as "one Deluxe" with no room assigned yet). Unassigned units
  must not exceed the free rooms of that type on any night. Proposed: lock a per-type-per-night
  counter row (`type_night_hold`, `SELECT … FOR UPDATE` in date order to avoid deadlocks), or
  assign a room on every booking. **Recommendation for the MVP: always assign a room at booking**,
  which the front desk can change later. Small hotels mostly think in rooms ("give them 104"), and
  it removes a whole class of overbooking bugs. Type-level holds come later with OTA inventory.
- **Out of order** blocks new holds on its nights. Setting a room out of order when it already has
  bookings on those nights is refused, with the list of bookings to move first.
- **Deliberate overbooking** (selling more than exists, which big hotels do): **not supported**.
  A small hotel has no walk-out budget.
- **Tentative holds** block the room like a confirmed booking until `hold_until`. Then a scheduler
  job (`platform_job`) releases them: status `cancelled`, reason `hold_expired`, rows removed.
- Cancelled and no-show bookings release their nights in the same transaction.

### 6.2 Booking states

```
tentative ──confirm──▶ confirmed ──check-in──▶ checked_in ──check-out──▶ checked_out
    │                     │    │                    │
    └──expire/cancel──▶ cancelled   └──no-show──▶ no_show     (undo check-in: back to confirmed,
                                                            only if nothing posted; §13)
```

A multi-room booking has a state per unit, and the booking's own state rolls up from them: checked
in if any unit is in, checked out when all are out.

### 6.3 Night counting, check-in and check-out times

- **Nights = departure date − arrival date** (calendar dates), with a minimum of 1. The night of
  date D is the night that starts on D. Arrive 12 Oct, leave 15 Oct: the nights of 12, 13 and 14,
  so 3 nights.
- **Fixed-time mode** (the default): standard check-in at 12:00 and check-out at 11:00, each
  configurable. A guest arriving at 03:00 on the 13th for a booking starting the 13th has an early
  check-in (§6.4), not an extra night. Unless the policy says otherwise, early arrival before 06:00
  is charged as the previous night (a common Indian lodge rule, configurable).
- **24-hour mode** (common in pilgrim towns and highway lodges): each night runs 24 hours from the
  actual check-in time. Check in at 20:00, check out by 20:00 the next day. Nights = ceil((checkout
  − checkin) ÷ 24 h), with a grace period (default 60 min) before an extra night or a late charge
  applies. In this mode the calendar still books by date, and the "night" is the date of check-in.
  The departure date is the one on which the last 24-hour period ends.
- **Day use** (a room for a few hours, same date): zero nights. Charged as a day-use rate, and it
  holds the room for that date's night only if the business says so (the default is no, because
  the room can be sold again that night after cleaning). The MVP records it as a one-night booking
  with a day-use rate. A true zero-night stay comes later.
- **Business date vs clock date.** Until day close runs, the business date is the previous date
  (a check-in at 01:30 on the 13th before day close is the night of the 12th). If day close is
  never run, the business date follows the clock at `day_close_time`. The front desk sees one
  "today" and it matches their paper register.

### 6.4 Early check-in and late check-out

Policy bands, configured per business. The defaults below are illustrative:

| Case | Default rule | Charge line |
|---|---|---|
| Early check-in, up to 3 h before the check-in time | free if a clean room is available | none |
| Early check-in, 3–6 h early | 50% of the night's rate | `early_check_in` |
| Early check-in, more than 6 h early (or before 06:00) | a full night (the previous night) | `room_night` for the previous date, which needs that night free |
| Late check-out, up to 1 h | free | none |
| Late check-out, 1–6 h (up to 18:00) | 50% of the night's rate | `late_check_out` |
| Late check-out after 18:00 | a full night | `room_night`, which needs the next night free |

- Charging a full extra night **needs availability** for that night. If the room is sold, the
  front desk is told and can move the next guest.
- For GST, an early or late charge is part of the accommodation for that date. It is added to
  that date's value to decide the slab (§6.5). A half-day charge that pushes the day's value above
  ₹7,500 moves that day to 18%. This follows the "value per unit per day" wording; it is also in
  the questions for a CA (§17).
- Early check-out: the unused nights are released from `resource_night`. Whether they are charged
  (a retention charge) follows the cancellation policy, and the MVP default is not charged.

### 6.5 GST on room tariffs (GST 2.0, from 22 Sep 2025)

**The rate today** (verified 29 Sep 2026, §18 [S1]–[S4]):

| Value of supply per unit per day | GST | Input tax credit |
|---|---|---|
| up to and including ₹7,500 | **5%** (CGST 2.5% + SGST 2.5%) | **not available** to the hotel; mandatory, the hotel can't choose 18% |
| above ₹7,500 | **18%** (CGST 9% + SGST 9%) | available |

- Before 22 Sep 2025 the ₹1,001–₹7,500 band was 12% with ITC. Rooms at ₹1,000 or less were exempt
  until 17 Jul 2022 and taxable after that. The change came from the 56th GST Council; the
  notification cited is Notification 15/2025-CT(R), effective 22.09.2025 ([S2]).
- Since 1 Apr 2025 the test uses the **actual value charged** (the transaction value), not a
  "declared tariff" ([S4]). A discount that brings a ₹8,000 room down to ₹7,200 makes it 5%.
- **The unit is the room.** Each room in a multi-room booking is judged separately, and **each
  day** separately. The extra-bed charge counts towards that room's day ([S2]).
- **Place of supply** for hotel accommodation is the location of the property (IGST Act §12(3)),
  so it is **always CGST + SGST** of the hotel's state, even for a company from another state
  ([S5]). The sales document must be built with `place_of_supply_state = the tenant's state`,
  whatever the bill-to party's state. The existing tax engine then produces CGST and SGST.
- **SAC 996311** (room or unit accommodation services by hotels, inns, guest houses, clubs) for
  room lines.
- **A hotel below the registration threshold** (turnover under ₹20 lakh for services; ₹10 lakh in
  special-category states) charges no GST. The tenant's GSTIN field (optional in onboarding) is
  the switch that already exists: with no GSTIN, lines carry no tax, as sales already does.
- A 5% room is treated like an exempt supply for the hotel's ITC. The hotel reverses ITC
  proportionately under Rules 42 and 43 ([S2]). That is the CA's work. The product's job is a
  report splitting the turnover by slab (§8).

**How the product decides the slab.** For each `booking_night_rate` row:
`net_value = room_rate + extra_bed_amount + early/late charge for that date − discount for that
date`, computed exclusive of tax. If `net_value ≤ 7500.00`, the rate is 5%; otherwise 18%. The
threshold is a dated table value, not a constant, because it has changed twice in three years.
Invoice lines are grouped by (room, rate, slab), so one line can say "3 nights × ₹2,499".

**Worked examples** (intra-state; the engine's rules: line tax rounded half-up to paise, CGST
= round(taxable × rate ÷ 200), SGST = tax − CGST; grand total rounded to the rupee):

| # | Case | Per-night value | Slab | Taxable | CGST | SGST | Total |
|---|---|---|---|---|---|---|---|
| 1 | Standard room ₹3,200 × 2 nights | 3,200 | 5% | 6,400.00 | 160.00 | 160.00 | 6,720.00 |
| 2 | Room ₹7,000 + extra bed ₹800, 1 night | 7,800 | 18% | 7,800.00 | 702.00 | 702.00 | 9,204.00 |
| 3 | Room listed at ₹8,000, 10% discount, 1 night | 7,200 | 5% | 7,200.00 | 180.00 | 180.00 | 7,560.00 |
| 4 | Fri ₹6,500, Sat ₹8,200 (weekend), Sun ₹6,500 | 6,500 / 8,200 / 6,500 | 5% / 18% / 5% | 13,000.00 at 5%; 8,200.00 at 18% | 325.00 + 738.00 | 325.00 + 738.00 | 23,326.00 |
| 5 | Two rooms, one booking: ₹4,000 and a ₹9,000 suite, 1 night | per room | 5% and 18% | 4,000.00; 9,000.00 | 100.00; 810.00 | 100.00; 810.00 | 14,820.00 |
| 6a | Room ₹7,400 × 2 nights, early check-in at 50% (₹3,700) on the arrival date | 11,100 (arrival date); 7,400 | 18%; 5% | 11,100.00 at 18%; 7,400.00 at 5% | 999.00 + 185.00 | 999.00 + 185.00 | 20,868.00 |
| 6b | Room ₹7,400 × 1 night, late check-out at 50% (₹3,700) on the departure date | 7,400 (arrival); 3,700 (departure) | 5%; 5% | 11,100.00 | 277.50 | 277.50 | 11,655.00 |
| 7 | ₹2,499 × 3 nights | 2,499 | 5% | 7,497.00 | 187.43 | 187.42 | 7,871.85 → **7,872** (round-off +0.15) |
| 8 | Dinner ₹600 (not specified premises) + laundry ₹200 | n/a | 5% and 18% | 600.00; 200.00 | 15.00; 18.00 | 15.00; 18.00 | 866.00 |

Note on 6a and 6b: each charge belongs to a **date**. An early check-in charge falls on the
arrival date, adds to that night's value, and here takes a 5% room to 18% for that date. That's a
₹1,998 tax on an ₹11,100 day, where two separate readings would give ₹555; the front desk must see
it before charging. A late check-out charge falls on the departure date, whose night the guest
hasn't bought, so it stands alone and stays at 5%. This "date the charge belongs to" reading is
the proposed rule. It is in §17 for a CA to confirm, and the per-night folio preview makes the
effect visible either way.

**Prices that include tax.** Many lodges quote "₹2,100 including GST". An inclusive price P is
converted by trying 5% first: P ÷ 1.05 ≤ 7,500 means 5%. Otherwise try 18%: P ÷ 1.18 > 7,500 means
18%. **There's a gap**: for P from ₹7,875.01 to ₹8,850.00, neither slab is consistent (at 5% the
value is above ₹7,500; at 18% it is at or below it). The product must refuse an inclusive price in
that range and ask for an exclusive price. Examples: ₹5,250 inclusive → ₹5,000 + ₹250. ₹9,440
inclusive → ₹8,000 + ₹1,440. ₹8,000 inclusive → refused, with the message "Enter the price before
tax: prices from ₹7,876 to ₹8,850 including tax can't be split into a valid rate".

**Must not be done at document level.** The existing engine spreads a **document-level discount**
across lines *after* each line's rate is set (`tax_engine._allocate`). A document discount on a
hotel invoice could therefore take an 18% night below ₹7,500 and leave it wrongly at 18%, or the
reverse. **Rule: the hospitality seam never sends a document-level discount.** Every discount is
applied per night before the slab is decided, and the line carries its final rate.

**Advances and GST.** For a service, GST is due at the **earlier** of the invoice or the receipt of
payment (CGST Act §13). An advance for a stay is taxable in the month it is received, needs a
**receipt voucher** (Rule 50) showing the tax, is reported in GSTR-1 Table 11A, and is adjusted
against the invoice later (Table 11B) ([S7]). The goods-only relief (Notification 66/2017) doesn't
cover services. This matters for any registered hotel that takes advances in one month for stays
in the next. **Today's payments receipt is not a GST receipt voucher.** The MVP proposal is in §10;
the choice is in §17.

**Changes between booking and stay.** The rate follows the time of supply. The booking
confirmation should say "GST as applicable on the date of stay" ([S13]). The slab table is dated,
so a booking made before a change is priced correctly when it is invoiced.

### 6.6 Extras, food and "specified premises"

- Each extra is an **inventory item** (reuse): a service item (laundry, taxi, airport pickup) or a
  goods item (water bottle, minibar). The item has its own HSN or SAC code and GST rate. A goods
  item moves stock through the existing sales stock posting when invoiced.
- **Food.** Restaurant service at a hotel is 18% with ITC if the premises are "specified premises"
  (any unit priced above ₹7,500 per day in the preceding financial year, or opted in by
  declaration). Otherwise it is 5% without ITC ([S2]). The product:
  1. keeps `specified_premises` as a per-financial-year setting;
  2. at the start of each financial year, suggests the value from last year's room lines (any
     night above ₹7,500 → "your premises are specified premises this year: check with your CA");
  3. uses it to choose between two food tax codes. The owner confirms; the product doesn't decide.
- **Meals inside a room rate** (a plan with breakfast): a composite supply, taxed at the
  accommodation rate, with the whole value judged by the per-day test ([S2]). The folio shows one
  room line. The breakfast value appears as descriptive text only.
- Spa, gym or wellness services are 5% without ITC under GST 2.0 ([S2]). They are items like any
  other.

### 6.7 Advance adjustment

- Every advance is a **payment in** on the booker's party, with no allocation (it stays as advance
  on the account, the existing `allocations: "none"` path), and its `meta` carries the
  `booking_id`.
- At check-out the invoice is issued and the booking's advances are **allocated to that
  invoice**, oldest first. **Gap in core:** payments can allocate only at the moment they are
  recorded; there is no "apply an existing advance to a later invoice". The party balance nets
  correctly through the ledger even without it, but the invoice would show "unpaid" and the
  receipt couldn't point at the bill. This needs a small public service in `payments`
  (`allocate_existing(payment, document, amount)`), which sales credit notes would use too. It is
  a core change, and it is §15's first item.
- If the bill-to party differs from the booker (a company pays), the booker's advance stays with
  the booker. The front desk either refunds it, or re-records it with the bill-to party's
  consent. Moving money between two parties' accounts is not a silent operation; it goes to §17.
- An advance above the final invoice stays as advance on the party (the existing behaviour), or is
  refunded as a payment out. A **walk-in without a party can't exist here**: every stay has a
  party (§15.2), so the "walk-in has no account for an advance" problem in `void_seam` doesn't
  arise.
- A cancellation with a charge is an invoice for the charge, settled from the advance, with the
  rest refunded or held (§3.6).

### 6.8 Cancellation and no-show charges

- The charge is computed from the policy tier in force at the moment of cancelling: hours before
  `arrival_date` + `check_in_time`.
- A cancellation charge on a registered hotel is a taxable supply. Treat it as a charge for the
  accommodation that was reserved: the same SAC (996311) and the slab of the first night. This is
  the trade's common practice. The GST treatment of retention charges has had varying rulings, so
  it goes to §17.
- A waiver needs `hospitality.booking.waive_charge` (owner or admin by default), following the
  credit-limit principle: a ceiling the owner set can't be lowered by the counter.

### 6.9 Guest register (police and local rules)

There is **no single national guest-register law** for domestic guests. The obligation comes from
state police acts, local licensing rules (hotel and lodging-house licences) and preventive orders
issued by police commissioners or district magistrates, now under **Section 163 of the Bharatiya
Nagarik Suraksha Sanhita (BNSS)**. Disobeying such an order is an offence under BNS Section 223.
Examples found:

- **Gujarat: PATHIK** (Programme for Analysis of Travellers and Hotel Informatics), a police
  portal where hotels upload guest details. It is now mandatory for PG residents too, and a hotel
  manager in Ahmedabad has been booked for not uploading ([S8], [S9]).
- **Haryana (Gurugram)**: the Police Commissioner ordered hotels to register on CCTNS and record
  every guest, with FIRs for failures (May 2025) ([S10]).
- **Madhya Pradesh (Indore)**: a Section 163 BNSS order of 4 Nov 2025 required hotels, hostels
  and lodges to share guest and tenant details. Thirteen FIRs followed within a week ([S11]).
- Other states and cities run similar portals or orders, often refreshed after a security
  incident. The rules differ by district and change without notice.

**Product consequence.** The product can't know every district's current order, and it must not
claim "police compliant". What it does:

1. **Capture a superset** of the fields these registers ask for: the name of every adult, age,
   gender, address, mobile, nationality, ID type and number (masked), arrival date and time,
   departure, where from and where to, purpose, vehicle number, and the room.
2. **Print the register** for any date range, in the column order of a paper register, and
   **export it as CSV** for upload to a portal where the portal accepts a file. (There is no
   integration: each portal is an external service, §16.)
3. **Mark each stay as submitted** to a named portal, with a reference, so the owner can prove it.
4. Leave the tenant to decide **which fields are required** (settings), with a sensible default
   set.

### 6.10 Foreign nationals: Form C (now Form III)

- **Law.** The **Immigration and Foreigners Act, 2025** came into force on **1 Sep 2025**,
  replacing the Foreigners Act, 1946 and the Registration of Foreigners Rules, 1992. Its Section 8
  and the Immigration and Foreigners Rules, 2025 carry the duty formerly called Form C, now **Form
  III** ([S6], [S14]).
- **Who reports.** The accommodation provider (hotels, guest houses, hostels, homestays, PGs),
  not the guest. **OCI cardholders are now included** ([S14]). Nepal and Bhutan citizens were
  treaty-exempt under the old rules ([S15]), and whether this still holds under the 2025 rules
  goes to §17. Default: include them on the list, with a note.
- **When.** Within **24 hours of arrival and within 24 hours of departure** ([S6]).
- **How.** Online on the Bureau of Immigration's e-FRRO portal (indianfrro.gov.in), after the host
  registers once as an accommodation provider ([S14]). There is no public API for a third party to
  file; the portal needs a logged-in host with OTP.
- **Penalty.** Compounding of ₹50,000 per case for accommodation providers ([S6]). The Act
  provides for up to three years' imprisonment and fines up to ₹3 lakh ([S14]).
- **Fields** (from the portal and guides, [S15]): name, nationality, passport number, place and
  date of issue and expiry, visa or OCI number, type, place and date of issue and expiry, date of
  arrival in India, port and country of arrival, arrival at the hotel, intended duration, next
  destination, purpose, address in India, and contact numbers in India and abroad.

**Product consequence.**
- A foreign nationality on any occupant makes `foreign_guest_detail` required before check-in can
  complete. The front desk can override this with a reason, because a guest at 1 a.m. without a
  visa copy is real. The override puts the stay on an **exceptions** list.
- A **Form C due** list: every foreign arrival and departure with a countdown from the actual
  check-in or check-out time. It turns amber at 12 h and red at 20 h, and the in-app bell raises a
  notification at 12 h. It is the dashboard's one warning tile that can't be dismissed.
- **Copy the fields** in portal order (a "copy all" or a print sheet the clerk types from), and
  **mark filed** with the FRRO reference number, separately for arrival and departure.
- Nothing is filed by the product.

### 6.11 ID capture and privacy (DPDP Act 2023, DPDP Rules 2025, Aadhaar)

**The rules as found.**
- The **DPDP Rules, 2025** were notified on 13–14 Nov 2025 (sources differ by a day). The Data
  Protection Board provisions began at once, and consent-manager registration begins about 12
  months later. The **core obligations begin about 18 months after notification, around 13–14 May
  2027**: notice, security safeguards, breach notification and data principal rights ([S16],
  [S17]). Today (29 Sep 2026) they are not yet in force. A module built now will be in use when
  they are.
- Rule 6 security safeguards: encryption, obfuscation or masking, access control, logs of access
  kept at least one year, and backups. A breach is reported to the Board within 72 hours, with no
  minimum size ([S17]). Under the Act's Schedule, penalties go up to ₹250 crore for failing to take
  reasonable security safeguards and up to ₹200 crore for failing to notify a breach.
- Processing for a **legal obligation** (the police register, Form III) is a "legitimate use"
  under the Act, so the guest's consent isn't the basis. A notice is still owed, and data must not
  be kept longer than the purpose needs.
- **Aadhaar.** Keeping photocopies of Aadhaar cards is a practice UIDAI calls contrary to the
  Aadhaar Act. In Dec 2025 UIDAI approved a rule making hotels register as verifying entities and
  verify through the offline QR or the Aadhaar app instead of photocopies. It was "to be notified
  soon" at the time of the source ([S18], [S19]). Aadhaar numbers must be shown masked (last four
  digits) in any case.
- Retention: the state orders we found don't state one period. The old Form C guidance says keep
  records at least 12 months ([S15]). GST requires invoices (and the guest name on them) for 72
  months, which the existing sales documents already keep.

**What the product must and must not do.**

| Must | Must not |
|---|---|
| Store the ID **type** and a **masked number** (last four) by default | Store a full Aadhaar number, **ever**, or an Aadhaar image |
| Show a short privacy notice at check-in (on the registration card and screen), in the tenant's name: what is collected, why (a legal requirement), how long it is kept | Use guest ID data for marketing, reminders or any purpose except the register and the bill |
| Restrict ID fields to `hospitality.guest_id.read`, and log every read of a full ID number or passport in the audit log (one-year retention, Rule 6) | Show ID details to housekeeping, or in lists, exports or share links |
| Purge ID numbers, passport and visa details, dates of birth and addresses of co-guests after `guest_id_retention_days` (default 365 days after check-out, configurable, with a floor the tenant can't go below without confirming). The name, dates and room stay in the register | Delete the invoice or the party. Those are GST and ledger records with their own retention rules |
| Include the guest data in the existing "export everything" and deletion flows, which already exist per tenant | Keep ID images in the MVP |

**ID images: later, and why.** Front desks want a photo of the ID (it is what police inspections
ask for). Storing images of government IDs safely needs encryption at rest with a managed key.
The only encryption library in reach, `cryptography`, isn't a project dependency; `credentials.py`
records that ADR-021 keeps it out. Storing ID images unencrypted under `MEDIA_ROOT` beside logos
is exactly the breach DPDP Rule 6 describes. So: **no ID images in the MVP**, and an ADR for the
later version, which would cover an encryption dependency, key handling, a separate storage kind
with no public URL, automatic purge, and Aadhaar excluded altogether. Until then, a hotel that
must keep a copy keeps paper, as it does today.

## 7. Dashboard

The hospitality home screen, for the front desk and the owner:

1. **Today strip**: the business date, the rooms available tonight and the occupancy percentage.
2. **Arrivals today**: count; list of name, room, nights and balance due; buttons to check in or
   mark a no-show. Overdue arrivals (past the check-in time plus 6 h) are marked.
3. **Departures today**: count; list with the folio balance; check-out button. Overdue ones (past
   the check-out time) are marked.
4. **In house**: count of stays and guests, with a link to the list.
5. **Rooms by status**: vacant clean, vacant dirty, occupied, out of order, as a small grid of
   room labels coloured by status (text labels, never colour alone).
6. **Form C due**: count, red when any is past 20 h (§6.10). Hidden when zero.
7. **Money today**: advances received, check-out collections, balances left on account.
8. **Next 7 days**: occupancy per night as a bar (booked, tentative, free).

Rules carried over: the dashboard shows only what's built (the in-app UI rule), and every number
links to the list it counts.

## 8. Reports

All reports go on the existing reports hub (listed only when built), filter by date range, and
export to CSV through `reports/exports`.

| Report | Definition |
|---|---|
| **Occupancy** | Per night and per period: occupied room-nights ÷ available room-nights × 100. *Available* = active rooms − out-of-order rooms on that night. Day-use doesn't count as occupied unless it holds the night. Split by room type. Dorm beds are counted as beds in a separate figure. |
| **ADR** (average room rate) | Room revenue ÷ occupied room-nights. *Room revenue* = the taxable value of `room_night` and `extra_bed` lines (excluding GST, extras, early or late charges and cancellation charges). Shown as "Average room rate", with ADR in help text. |
| **RevPAR** | Room revenue ÷ available room-nights (= ADR × occupancy). Shown as "Revenue per available room". |
| **Revenue** | By category (rooms, food, laundry, other extras, cancellation charges), by source (walk-in, phone, agent, OTA name), by room type; taxable value, GST and total. Reconciles with the sales register for the same period. |
| **Room turnover by GST slab** | Room lines at 5% and at 18%, per month. It feeds the CA's ITC reversal (§6.5) and next year's "specified premises" question (§6.6). |
| **Guest register** | For a period: every stay with every occupant, the fields in §6.9, in register order. Printable (A4 landscape) and CSV. ID numbers masked in the print unless the viewer has `guest_id.read` and chooses "full". |
| **Foreign guests (Form C)** | Arrivals and departures with the filing status and reference, and the exceptions (overdue or overridden). |
| **Arrivals / departures / in-house** | Operational lists for any date. |
| **Cancellations and no-shows** | Count, lead time, charge collected and waived, by source. |
| **Advances held** | Advances received and not yet invoiced, as of a date, by booking. For registered hotels this is the GSTR-1 Table 11A figure the CA needs (§6.5). |
| **Day close history** | Each closed day: counted cash against recorded cash, and who closed it. |

Later: booking pace (on the books for future dates compared with last year), guest nationality
mix, length-of-stay distribution, repeat-guest rate.

## 9. Documents (tenant-branded)

Every document uses the existing print pipeline (`window.print()`, A4, A5 or 80 mm) and carries
the **business's name, logo, address and GSTIN, never the product's name**
(`customerDocumentsCarryNoProductName.test.tsx` must extend to cover them).

| Document | Content | Pipeline |
|---|---|---|
| **Booking confirmation** | Booking number, guest, dates, nights, room type (room if assigned), guests, rate per night and total, GST note ("as applicable on the date of stay"), advance received, balance, check-in and check-out times, cancellation policy in words, the hotel's address, map link and phone | New print template. Shared as a prepared WhatsApp text and as a share link through the generalised `parties_share_link` table (C1, decided 23 Sep 2026) once it exists |
| **Advance receipt** | The existing payment receipt (A5), plus booking number and dates. For a registered hotel it adds the **receipt voucher particulars** (Rule 50: supply description, rate, tax amount) if the owner chooses that option (§10, §17) | Existing receipt, extended |
| **Guest registration card** | The hotel's header, guest particulars, co-guests, ID type and masked number, foreign guest block, arrival and departure, room, rate, and the hotel's terms and privacy notice, with signature lines for guest and front desk | New print template (A5 or A4) |
| **Folio (pre-bill)** | Every charge by date, advances, balance. Headed "Folio: not a tax invoice" | New print template; not a sales document |
| **Tax invoice** | The **existing sales invoice**, with a stay block: arrival and departure dates and times, room(s), nights, guests, the booking number. Lines grouped by (room, rate, slab); SAC 996311; CGST and SGST | Existing sales invoice, with a `meta.stay` block its print template renders when present |
| **Credit note** | A refund or correction after check-out | Existing credit notes |
| **Cancellation invoice** | The cancellation charge as an invoice | Existing sales invoice |
| **Register print** | §8 guest register | Report print |

Sharing follows DEC-012: the merchant sends WhatsApp messages from their own phone, and the copy
never says a message was sent.

## 10. Payments

- **Modes**: the existing ones (cash, UPI, bank, cheque, card, other) and split tender (up to four
  mode lines). UPI collection uses the existing local QR, with no gateway.
- **Advance on booking**: a payment in on the booker's party, `allocations: "none"`, with
  `meta.booking_id`. The receipt names the booking.
- **During the stay**: more payments in, the same way.
- **At check-out**: the invoice is issued, then advances are allocated to it (the core gap in
  §6.7), then the balance is collected. Or it's left on the party's account if the bill-to party
  has a credit limit that allows it (reusing PTY-06 limits: a company or agent with a ₹50,000
  limit).
- **Refunds**: payment out (existing), for a cancellation refund or an overpaid advance.
- **Security deposit** (some lodges take ₹500–₹1,000 against damage and return it at check-out):
  record it as an advance and refund it at check-out. It never becomes revenue unless a damage
  charge is invoiced. Reports must not count it as income.
- **OTA-collected bookings** ("prepaid" on the OTA): the guest paid the OTA, and the OTA pays the
  hotel net of commission and TCS later. Record them as: bill-to party = the OTA (a party), invoice
  to the guest or the OTA according to the CA's view, and the OTA's payment to the hotel as a
  payment in from that party. Commission goes in as an expense or purchase bill from the OTA. The
  OTA collects TCS at 1% under Section 52 ([S5]). These are records only; nothing is integrated.
- **GST receipt voucher on advances** (§6.5): options for the owner in §17. **Proposed MVP**: the
  receipt shows the tax contained in the advance for registered hotels (the voucher particulars),
  and the "Advances held" report gives the CA the Table 11A figure. The GST summary report isn't
  changed in the MVP.

## 11. Search, filter and sort

| List | Search | Filters | Default sort |
|---|---|---|---|
| Bookings | booking number, guest name, mobile, OTA reference, room label | status, arrival date range, stay date (covers a date), source, room type, has balance, tentative expiring today | arrival date ascending (upcoming first); cancelled hidden unless filtered |
| Availability calendar | jump to date | room type, floor, status (show out of order), only free | room sort order × date |
| In house | name, room | room type, has balance, foreign guests | room label |
| Guests (a parties view) | name, mobile, company | nationality, repeat guest (stays ≥ 2), has balance | last stay descending |
| Guest register | name, ID last four, mobile | date range, nationality, submitted to portal or not | check-in time |
| Form C due | name, passport last four | arrival/departure, overdue, filed | time remaining ascending |
| Housekeeping | room label | status, floor | floor, then room |
| Folio charges | description | kind, date, invoiced or open | service date |

Filters live in the URL (the PTY-05 lesson: a filter that lives only in state can't be linked to),
null values never outrank present ones (`StableOrderingFilter`), and every list uses the existing
data grid with its card view on a phone.

## 12. Roles and permissions

The platform has four system roles (owner, admin, staff, accountant) and per-codename checks
(`permissions_registry.py`). Hospitality needs a **housekeeping** role that sees rooms and nothing
else. Options are in §17: a fifth system role, or custom roles. The proposed codenames and their
default grants:

| Codename | Owner | Admin | Staff (front desk) | Housekeeping | Accountant |
|---|---|---|---|---|---|
| `hospitality.room.manage` (room types, rooms) | ✓ | ✓ | | | |
| `hospitality.rate.manage` (plans, seasons, policies) | ✓ | ✓ | | | |
| `hospitality.booking.read` | ✓ | ✓ | ✓ | (room, dates only) | ✓ |
| `hospitality.booking.write` (create, edit, cancel) | ✓ | ✓ | ✓ | | |
| `hospitality.booking.rate_override` (below plan price) | ✓ | ✓ | up to N% (setting) | | |
| `hospitality.booking.waive_charge` (cancellation/no-show) | ✓ (role check) | ✓ | | | |
| `hospitality.stay.check_in` / `check_out` | ✓ | ✓ | ✓ | | |
| `hospitality.stay.undo_check_in` | ✓ | ✓ | within 15 min, own only | | |
| `hospitality.folio.post` / `folio.void` | ✓ | ✓ | ✓ / own, same day | | |
| `hospitality.guest_id.read` (full ID, passport, visa) | ✓ | ✓ | ✓ while the guest is in house | | |
| `hospitality.register.export` | ✓ | ✓ | | | ✓ (masked) |
| `hospitality.housekeeping.update` (dirty ↔ clean) | ✓ | ✓ | ✓ | ✓ | |
| `hospitality.housekeeping.block` (out of order) | ✓ | ✓ | | | |
| `hospitality.day_close.run` | ✓ | ✓ | ✓ | | |
| `hospitality.reports.read` | ✓ | ✓ | | | ✓ |

The existing codenames still govern the money: issuing the invoice needs the sales codenames, and
recording a payment needs the payments ones. A front desk clerk therefore needs both sets, and the
check-out screen must say which one is missing rather than fail half way. The waiver is a **role**
check and not a codename, under the same principle as the credit-limit override (CLAUDE.md,
LED-03): a ceiling the owner set can't be delegated to the counter.

## 13. Edge cases

| # | Case | Handling |
|---|---|---|
| 1 | Two devices sell the last room in the same second | One commit wins on the `resource_night` unique constraint. The other gets a 409 ("Room 104 was just booked for 14 Oct. Choose another room") and keeps everything typed |
| 2 | A guest arrives a day early | The booking's dates change, if the new night is free |
| 3 | A guest arrives after midnight for "tonight" (01:30 on the 13th for the 12th) | The business date is still the 12th until day close (§6.3). This is the night of the 12th, not an early check-in on the 13th |
| 4 | A guest leaves without checking out | Day close lists them. The front desk checks out at the actual time and leaves the balance on the party's account |
| 5 | Room change mid-stay, to another type at another rate | `booking_unit` splits at the date. Each part keeps its rate; the slab is per night per room |
| 6 | A free upgrade | New room type, old rate kept (`rate_source = manual`, reason "complimentary upgrade") |
| 7 | Rate plan edited after bookings were confirmed | Confirmed bookings keep their snapshot; only new bookings see the new rate |
| 8 | A group booking: 8 rooms, one agent pays | One booking, eight units. One invoice (default), or one per room (an option at check-out) |
| 9 | Split billing: the company pays the room, the guest pays the bar | **Later**. The MVP gives one invoice per stay and one bill-to party |
| 10 | Long stay (30+ nights) | MVP: one invoice at check-out, lines grouped. **Later**: interim weekly or monthly invoices that close those nights |
| 11 | The extra bed takes one night above ₹7,500 | That night is 18%, the others 5% (§6.5 example 2). The per-night folio preview shows why |
| 12 | An inclusive price in the ₹7,875–₹8,850 gap | Refused, with the message in §6.5 |
| 13 | "Cancel" after check-in | It is an early check-out, not a cancellation |
| 14 | The wrong booking was checked in | Undo is allowed within 15 minutes if there's no charge, payment or invoice. Otherwise check out and correct |
| 15 | The guest disputes a charge after the invoice | The existing credit note, against that line |
| 16 | A returning guest still owes money from before | The party's balance shows at booking and at check-in (the ledger gives this for free) |
| 17 | A foreign guest with no visa copy at night | Override with a reason. The stay goes on the exceptions list and the Form C tile stays red until the details are complete |
| 18 | A citizen of Nepal or Bhutan | Flagged as possibly exempt and kept on the Form C list with a note until §17 Q17 is answered |
| 19 | Minors | Age is recorded; ID is optional under 18 (configurable). A minor can't be the primary guest |
| 20 | A room is set out of order over existing bookings | Refused until the bookings are moved (§6.1) |
| 21 | The tenant adds a GSTIN mid-year | Invoices before the registration date have no tax; later ones do. A stay spanning the date goes to a CA (§17) |
| 22 | The GST slab changes between booking and stay (it did on 22 Sep 2025) | The rate follows the time of supply. An advance received before the change falls under the rate-change rules (CGST Act §14, [S2]). The product flags these stays for the CA |
| 23 | Day close skipped for three days | The business date follows the clock (§6.3). The next day close offers "close up to today" |
| 24 | The module is switched off with guests in the house | `blocking_rows_for_module_off` counts future and in-house bookings, and the switch is refused |
| 25 | The tenant deletes their data (existing flow) | Guest ID data is included. Invoices follow the existing retention rule |
| 26 | The same OTA booking entered twice (from the email and from the phone call) | Warn on the same source plus `external_ref`, and on the same mobile with overlapping dates |
| 27 | A mixed group in a female-only dorm | A resource-type attribute checked against occupants' gender (**later**) |
| 28 | A stay spans 31 March | The invoice takes the new year's number at check-out. The new year's "specified premises" setting applies to food posted from 1 April |

## 14. Validations

- `departure_date > arrival_date`. The arrival date isn't more than 1 day in the past for a new
  booking (backdating is allowed, but only for owner/admin, with a reason; walk-ins are always
  today). The booking window is at most 18 months ahead.
- Occupants: `adults ≥ 1`; `adults + children ≤ max_capacity` of the room type, counting extra
  beds. `extra_beds ≤ 1` unless the room type allows more. Primary guest age ≥ 18.
- The room is assigned before check-in, active, not out of order, and free on every night. A
  dirty room gives a warning, not a block.
- Rate: `room_rate ≥ 0`, with ₹0 only with a reason (complimentary). A price below the plan by
  more than the clerk's allowed percentage needs `rate_override`. An inclusive price isn't in the
  impossible band (§6.5).
- Mobile: the existing Indian mobile rule for the primary guest, with a foreign number allowed
  when the nationality isn't Indian.
- Bill-to GSTIN: the existing GSTIN validator (format and checksum). The invoice's place of supply
  is forced to the tenant's state.
- Foreign occupant: passport number, nationality, visa (or OCI) number, and visa expiry ≥ arrival
  date are required to complete check-in, or an override with a reason. A passport expiring
  before departure gives a warning.
- ID: type chosen, and last four characters present. An Aadhaar number longer than four digits is
  refused (only the last four are kept, even if the clerk types all twelve).
- Folio: `qty > 0`; `unit_price ≥ 0`; `service_date` within the stay (arrival − 1 day to
  departure); nothing posted after the invoice is issued (post to a new invoice later).
- Cancellation: only `tentative` or `confirmed` can be cancelled. Charge ≤ total booking value. A
  refund ≤ the advance held.
- Season: `end_date ≥ start_date`, with a warning on overlaps. Rate plan: `extra_adult_rate ≥ 0`,
  `min_nights ≥ 1`.
- Every write carries the `version` (optimistic concurrency, as sales drafts do), so two clerks
  editing a booking don't overwrite each other.
- Server-side messages are in plain words and in both Hindi and English, like every existing
  message.

## 15. Reuse from core vs new

### 15.1 Reuse map

| Need | Reuse | New (where) | Core change needed? |
|---|---|---|---|
| Module switch | `ModuleCode.HOSPITALITY`, `enabled_modules`, `_ModuleEnabled` | the constant and a dependency line: `hospitality → parties, ledger, sales, payments, inventory` | a constant plus `blocking_rows_for_module_off` for bookings |
| Rooms and bookings | — | **the shared bookings/resources engine**: `resource_type`, `resource`, `booking`, `booking_unit`, `resource_night`. Generic: no GST or guest fields. Hospitality configures it (nights, check-in times) as gym slots or library holds might later (hours or days) | a new shared app (the architecture agent decides whether it is core or a shared engine that verticals call through a public service) |
| Guests | **`parties`**: the booker, the primary guest and the bill-to company/agent are parties (type customer). A "guest" flag or tag marks them. Search by mobile, credit limits for agents, balance, statement | `stay_occupant` and `foreign_guest_detail` as module-owned **extensions** holding register and ID data, not a second contacts table | party type or role vocabulary if "guest" is to show as a type (a canon change) |
| Advances, balance, refunds | **`payments.record_payment`** (`allocations: "none"`, `meta.booking_id`); payment out for refunds; receipt A5; UPI QR | none | **yes: `allocate_existing`**, to apply an existing advance to a later invoice (§6.7) |
| Folio → invoice | **`sales`**: the draft and issue services, the tax engine, numbering, Rule 46 checks, the print template, share link, void and credit notes. Folio lines become invoice lines through a seam (`hospitality.services.invoice_seam` → `sales.services.documents.create_draft` + `issue.issue_invoice`), in the pattern of `purchases.services.payment_seam` | the seam; `meta.stay` on the document; a stay block in the invoice template | the invoice template renders `meta.stay`. The seam must send the per-line rate and no document discount (§6.5); a small public entry point in sales may be needed so hospitality doesn't reach into sales internals |
| Extras | **`inventory`** items (service and goods), tax codes, HSN/SAC; stock moves for goods when invoiced | none | none |
| Ledger | the ledger moves **only** through sales (invoice) and payments. No hospitality posting, and no balance arithmetic in the module (vision rule) | none | none |
| Tax | `tax` rates, HSN/SAC master (add 996311 if missing), the GST summary | a dated **room slab table** (threshold, low rate, high rate, from date); per-night slab decision in hospitality | a table (it's tax data; the architecture agent chooses where) |
| Reminders | existing reminders for balances owed by agents or companies; the **scheduler** (`platform_job`) for tentative hold expiry, the Form C countdown notification, day-close reminder | jobs | none |
| Notifications | the in-app bell | Form C notices | none |
| Documents | the print pipeline, branding, share links (`parties_share_link`, generalised, C1) | booking confirmation, registration card, folio, register print | the share-link owner type for bookings |
| Reports | reports hub, CSV exports | occupancy, ADR, RevPAR, register, Form C, advances held | none |
| Team and audit | roles, codenames, audit log | hospitality codenames; the housekeeping role question | registry entries; possibly a role |
| Import | CSV import wizard | rooms import (later) | a new import kind |
| Data export and deletion | existing | include hospitality tables | tenant data registry (`tenant_data.py` pattern) |

### 15.2 Guests as parties: the proposal and its limit

- **Every booking has a party.** A walk-in guest is created as a party at check-in (a mobile is
  required anyway for the register). This keeps "guest" and "customer" one person: a guest who
  later buys on credit, or an agent who sends guests and pays monthly, has one account and one
  statement.
- **Co-guests are not parties by default.** A family of four would otherwise make four contacts,
  three of whom never transact. They are `stay_occupant` rows, with optional linking to a party
  for regulars. This is a reading of vision rule "no module keeps a second contacts table": an
  occupant row is a register entry, not a contact. **The architecture agent must confirm it**
  (§17).
- The party list gets many one-night guests. A "Guests" chip (a filter on the guest tag) keeps
  them apart from the shop's customers for businesses that run both.

### 15.3 Why room charges aren't posted nightly

Big hotel systems post each night's room charge at the night audit. Here, the ledger moves only
when an invoice is issued (sales) or money moves (payments), and the ledger canon says a posted
line is never edited or deleted. Posting nightly would mean ledger entries before any tax invoice
exists, and every room change or extension a correction pair. So the folio holds the nights as
derived lines from `booking_night_rate`. The day close *shows* the accrued charge, and the invoice
at check-out is the single posting. A long stay's interim invoice (later) closes a range of nights
in the same way.

### 15.4 Candidate for the shared bookings/resources engine: what this module proves

The engine needs: a resource type with capacity, resources (optionally nested: a bed in a room),
a booking with units over a **date range with a per-date hold**, a hold status with expiry, a
unique per-resource-per-slot guarantee, and a calendar read (resources × slots). Hospitality's
slot is a **night**. A gym class slot or a library hold would use a **time slot** or a **day**. If
the engine's slot is generic (`slot_key`: a date or a datetime start), one unique constraint
serves all three. This is the input the architecture review (phase 4) needs.

## 16. MVP vs later

### MVP (the minimum useful set for a 5–30 room lodge or homestay)

- Room types, rooms, beds; rate plans with weekday, weekend and season prices; extra bed.
- Availability calendar and "Is it free?" search; bookings (tentative with expiry, confirmed),
  a room assigned at booking; walk-in; multi-room bookings.
- Check-in with the guest register fields, co-guests, ID type and masked number, foreign guest
  details; registration card print.
- Form C due list with countdown, copy sheet and mark-filed; guest register print and CSV;
  mark-submitted to a police portal.
- Folio: room nights (derived), extra bed, early and late charges by policy, extras from inventory
  items.
- Check-out → sales invoice through the seam, with per-night GST slab, CGST and SGST only, SAC
  996311, a bill-to company GSTIN, and a stay block on the invoice.
- Advances as payments; allocation to the invoice (after the core `allocate_existing` lands);
  refunds; security deposit as advance.
- Cancellation and no-show with policy charge, waiver by role.
- Housekeeping status: clean, dirty, out of order, with history.
- Day close as a checklist and date roll (no lock).
- Dashboard (§7); reports: occupancy, ADR, RevPAR, revenue, slab turnover, guest register,
  Form C, advances held.
- Booking confirmation print and WhatsApp text; advance receipt with GST particulars (§10).
- Privacy: masked IDs, restricted access, access audit, a retention purge job, the privacy notice.
- Roles and codenames (§12); Hindi and English.

### Later

| Item | Why later |
|---|---|
| **OTA channel manager (Booking.com, MakeMyTrip/Goibibo, Agoda, Airbnb)** | **Backlog under ADR-021.** A channel manager is a two-way live integration with external services. It pushes availability, rates and restrictions (ARI) to each OTA and pulls reservations, modifications and cancellations in near-real time. Booking.com only connects through **certified connectivity partners**, which requires a certification process, commercial terms and a production-grade API client ([S20]). MakeMyTrip's connectivity is similar. It would need outbound HTTPS clients per channel, webhook endpoints, stored OTA credentials, retries and reconciliation, and a background worker faster than the cron scheduler: every one of them is a new dependency or external service. It also brings a new failure mode (an overbooking caused by a sync delay) that the unique-constraint guarantee can't prevent, because the other side of the race is an OTA's server. Even the "simple" iCal sync (Airbnb, Booking.com) means fetching external URLs on a schedule. **MVP instead:** record OTA bookings by hand with source, `external_ref` and commission; duplicate detection; the OTA as a party for prepaid bookings and commission bills. Goes to `docs/BACKLOG.md` with this reason. |
| Form C / police portal **filing** | No public API; OTP-bound portals (§6.10). Keep "copy and mark filed". |
| ID **images** (and the Aadhaar offline QR verification) | Encryption dependency plus a UIDAI verifying-entity registration and API (§6.11): an ADR plus an external service. |
| Online booking engine on the tenant's website, and payment links | A public booking page is possible with the share-link pattern, but taking payment online needs a gateway ("never claim": payment gateway). |
| Interim invoices for long stays; split folios; transfer charges between rooms | Needed by corporate long-stay hotels, not by the core persona. |
| Type-level (unassigned) inventory holds | Needed with OTAs; the MVP always assigns a room. |
| Day close **locking** of past dates | Needs a platform-wide "period lock", which sales and ledger would want too; design once. |
| Restaurant POS (tables, orders, kitchen tickets), room-service orders | A separate module candidate; the MVP posts food as an extra. |
| Rate rules (length-of-stay discounts, occupancy-based pricing), packages | Not needed at this size. |
| Housekeeping task assignment, linen, maintenance tickets | Beyond status. |
| Guest messaging (pre-arrival, feedback) | The product sends nothing (DEC-012); prepared texts only. |
| Multiple properties per business | "Branches" is on the never-claim list. |
| Booking pace, nationality mix, repeat-guest reports | Nice to have. |
| e-invoice (IRN) for B2B hotel invoices above the threshold | Not live anywhere in the product. |

## 17. Open questions for the owner

**Product**

1. **PG placement.** Confirm that monthly PG goes to the recurring-dues engine (the rent
   collection candidate) and is not part of Hotel & stays. Nightly dorm beds stay here.
2. **Housekeeping role.** Add a fifth system role "housekeeping", or introduce custom roles
   (owner-defined codename sets)? Custom roles are more general, and gym and library will want
   them too.
3. **Walk-in guests as parties.** Every stay creates or reuses a party. Is that acceptable for a
   shop that also runs a lodge (their customer list fills with guests), with a Guests filter to
   separate them?
4. **Co-guests.** Confirm that co-occupants are register rows, not parties (a question for the
   architecture agent too).
5. **Day close.** A checklist that never blocks check-in (proposed), or a hard gate like eZee?
6. **Rate override.** What discount may front desk staff give without the owner: 0%, 10%, or set
   per business?
7. **Default policies**: check-in and check-out times, 24-hour mode as an option, the early/late
   bands, cancellation tiers, whether tentative holds exist, and the hold length.
8. **ID retention default.** 365 days after check-out (proposed). Is there a known state order
   with a longer period that we should default to?
9. **Registration card.** Does the owner want a signed paper card (proposed; it is the police
   inspection artefact), or a screen signature later?
10. **Security deposits**: in the MVP (proposed as a special advance) or later?

**Tax (for a CA; the product will implement what they say)**

11. **GST on advances.** Should the MVP issue a proper **receipt voucher** with tax for registered
    hotels (proposed: tax particulars on the receipt and an "advances held" report), or leave
    advance tax entirely to the CA outside the product?
12. **Early and late charges** and the per-day slab: is the "date the charge belongs to" reading in
    §6.5 (examples 6a and 6b) right?
13. **Meals included in the room rate** (breakfast plans): is the ₹7,500 test applied to the
    package value, making a ₹7,000 room with ₹800 breakfast an 18% supply?
14. **Cancellation and no-show charges**: taxable at the accommodation rate of the first night
    (proposed), or 18% as a separate "tolerating an act" service?
15. **Dorm beds**: is "per unit per day" per bed (proposed), or per room?
16. **Tax-inclusive prices** in the ₹7,875–₹8,850 band: refuse (proposed), or treat the
    inclusive price as final at 5%?
17. **Nepal and Bhutan citizens** under Form III of the 2025 rules: still exempt?
18. **OTA-prepaid bookings**: is the invoice raised to the guest or to the OTA, and how is the 1%
    TCS credit shown?

**Architecture (for the phase-4 architecture agent)**

19. Is the bookings/resources engine a core app or a shared engine app, and is its slot generic
    (a date or a datetime)?
20. Per-night hold rows (proposed) or a `daterange` exclusion constraint (needs `btree_gist`, an
    ADR-021 question)?
21. `payments.allocate_existing`: approve it as a core change serving hospitality, sales credit
    notes and later modules.
22. Where does the dated room-slab table live (`tax` or `hospitality`)?

## 18. Sources

All checked on **29 Sep 2026**. Web content was treated as data, and secondary sources were
cross-checked against at least one other. The primary texts (CBIC notifications, the Gazette text
of the 2025 Act and Rules, the UIDAI regulation) should be read by a CA or lawyer before the FRD
is final.

| Ref | Source | Used for |
|---|---|---|
| S1 | ClearTax, "GST on Hotel Rooms 2026": https://cleartax.in/s/impact-of-gst-hospitality-industry | 5% ≤ ₹7,500 without ITC, 18% above, from 22 Sep 2025; specified premises |
| S2 | TaxGuru, "Changes in Hospitality Sector on account of GST 2.0: Practical FAQs" (30 Sep 2025): https://taxguru.in/goods-and-service-tax/hospitality-sector-account-gst-2-0-practical-faqs.html | Notification 15/2025-CT(R); extra bed counted; composite meals; mandatory 5%; specified premises; spa 5%; transition rules; ITC reversal |
| S3 | TaxGuru, "GST Implication on Hotel Industry due to Rate Rationalization in GST 2.0": https://taxguru.in/goods-and-service-tax/gst-implication-hotel-industry-due-rate-rationalization-gst-2-0-regime.html | 12% → 5% "per unit per day", ITC reversal |
| S4 | Jhattse blog, "Hotel GST in India 2026: B2B, B2C and OTA rules": https://blog.jhattse.com/hotel-gst-india-cgst-sgst-igst-b2b-b2c-ota-rules/ | actual value basis from Apr 2025; place of supply; B2B GSTIN; OTA TCS and §9(5) |
| S5 | CBIC, IGST Act §12: https://taxinformation.cbic.gov.in/content/html/tax_repository/gst/acts/2017_IGST_Act/active/chapterv/section12_v1.00.html, and TaxGuru, "Place of supply under GST regarding immovable property services": https://taxguru.in/goods-and-service-tax/place-supply-gst-immovable-property-services-faqs.html | place of supply = location of the property |
| S6 | Nicobar Times, "Immigration & Foreigners Act 2025 comes into force; guidelines on Form-III and Form-II": https://nicobartimes.com/local-news/immigration-detailed-guidelines-issued-on-form-iii-and-form-ii-submissions/ | in force 1 Sep 2025; Form III; 24 h on arrival and departure; ₹50,000 compounding |
| S7 | ClearTax, "Treatment of Advance Received under GST": https://cleartax.in/s/advance-received-under-gst | GST on advances for services, receipt voucher, GSTR-1 Table 11A/11B |
| S8 | Gujarat Samachar, "Ahmedabad hotel manager booked for failing to upload guest details on Pathik": https://english.gujaratsamachar.com/news/gujarat/ahmedabad-hotel-manager-booked-for-failing-to-upload-guest-details-on-police-pathik-portal-83221132553.html | PATHIK enforcement |
| S9 | Gujarat Samachar, "Pathik registration mandatory for PG residents in Gujarat": https://english.gujaratsamachar.com/news/gujarat/pathik-registration-mandatory-for-pg-residents-in-gujarat-84589904035.html | PATHIK for PGs |
| S10 | The Tribune, "Gurugram cops to crack down on hotel owners failing to keep record of visitors" (May 2025): https://www.tribuneindia.com/news/delhi/gurugram-cops-to-crack-down-on-hotel-owners-failing-to-keep-record-of-visitors/amp | CCTNS guest records, Haryana |
| S11 | ANI, "MP Police file FIRs against 13 hotel and hostel operators in Indore" (12 Nov 2025): https://aninews.in/news/national/general-news/mp-police-file-firs-against-13-hotel-and-hostel-operators-in-indore-for-failing-to-share-guest-details20251112135338/ | BNSS §163 order, BNS §223 |
| S12 | eZee Absolute help, "How to perform Night audit or Day close": https://yanoljacloudsolution.freshdesk.com/en/support/solutions/articles/9000234653-how-to-perform-night-audit-or-day-close-in-ezee-absolute- ; eZee blog on night audit: https://yanoljacloudsolution.com/blog/night-audit-in-hotel | night audit steps and blocking behaviour |
| S13 | DJUBO blog, "GST Reforms 2025: hotels and restaurants": https://www.djubo.com/blog/gst-reforms-2025-hotels-restaurants | confirmation wording, auto slab in a PMS |
| S14 | NRI Information, "Form C (Form-III): what you must report when a foreigner stays": https://nriinformation.com/visa-oci/c-form-hosting-foreign-guest-india | OCI now included; host registration; departure within 24 h; penalties |
| S15 | OnlineHotelier, "Form C for Hotels": https://www.onlinehotelier.com/guides/compliance/form-c-hotel.html | fields; Nepal/Bhutan exemption (old rules); 12-month retention guidance |
| S16 | Wikipedia, "Digital Personal Data Protection Rules, 2025": https://en.wikipedia.org/wiki/Digital_Personal_Data_Protection_Rules,_2025 ; PIB note: https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf | notification date; phased start |
| S17 | Privacy World, "India passes the DPDP Rules" (Nov 2025): https://www.privacyworld.blog/2025/11/india-passes-the-digital-personal-data-protection-rules-ushering-in-a-new-digital-age-in-india/ | stages (Nov 2025, Nov 2026, May 2027); Rule 6 safeguards; 72 h breach notice; one-year logs |
| S18 | MediaNama, "UIDAI to bar hotels from collecting Aadhaar photocopies" (Dec 2025): https://www.medianama.com/2025/12/223-explained-uidais-new-rule-aadhaar-based-verification/ | proposed rule, offline QR and app verification |
| S19 | Outlook Money, "UIDAI approves rule mandating registration for entities to seek Aadhaar verification" (8 Dec 2025): https://www.outlookmoney.com/news/uidai-approves-rule-mandating-registration-for-entities-to-seek-aadhaar-verification | approved, "to be notified soon"; photocopies contrary to the Aadhaar Act |
| S20 | Booking.com for Partners, "Connectivity Partner Programme": https://partner.booking.com/en-gb/help/channel-manager/partner-programme/how-find-right-channel-manager-or-property-management-system ; Booking.com Connectivity API docs: https://developers.booking.com/connectivity/docs | OTA connectivity only through certified partners |
| S21 | TaxGuru, "GST on PG Accommodation: 90-Day Exemption FAQs": https://taxguru.in/goods-and-service-tax/gst-pg-accommodation-90-day-exemption-itc-taxability-faqs.html | Entry 12A: ≤ ₹20,000 per person per month, ≥ 90 days |
| S22 | Hotelogix, "Best Hotel Management Software in India: 2026 PMS Guide": https://www.hotelogix.com/blog/hotel-management-software-india | what an Indian PMS covers (usage, not copied) |
| S23 | RentOk (PG app): https://rentok.com/ | PG workflows are rent and dues, which supports the PG decision |

Code read for §15 (commit on `main`, 29 Sep 2026): `backend/apps/sales/models.py`,
`sales/services/*`, `tax/services/tax_engine.py` (per-line rounding, document-discount allocation),
`payments/services/record.py` and `payments/models.py` (advances as `unallocated_amount`),
`files/constants.py`, `platform_app/services/credentials.py` (the `cryptography` exclusion),
`common/constants.py` and `platform_app/services/tenant_settings.py` (module codes and
dependencies).
