# Library module: product and domain research

Status: **Phase 2 research, 29 Sep 2026.** Research only: it proposes, it does not decide. Decisions on
tables, engines and seams belong to the architecture owner (vision §3 rule 5) and are recorded as ADRs.
Binding inputs: [00-platform-vision.md](../00-platform-vision.md),
[01-current-capabilities.md](../01-current-capabilities.md), `CLAUDE.md`.

Module code proposed: `library`. Plain words used throughout: **title** (the book as a work),
**copy** (one physical book on a shelf), **member**, **issue**, **return**, **renew**, **hold**,
**fine**, **deposit**, **seat**, **shift**. No product name appears on anything a member receives.

---

## 0. How these libraries run today (findings)

Four kinds of small library are in scope. They share a vocabulary but differ in what earns money.

| Kind | Who runs it | What the money is | What they keep today | Main pain |
|---|---|---|---|---|
| **School and college library** | A librarian (often one person, sometimes a teacher doing it part-time) and one assistant | Almost none. Fines are small (₹1–5 a day); lost books are charged at cost or a multiple of it. No fee for students | A bound **accession register** (one line per copy, numbered for ever), an issue register or member cards with date stamps, a yearly stock verification report | Stock verification each year, "no dues" before students leave, overdue chasing |
| **Community and reading library** (trust, society, panchayat, residents' association) | A librarian or volunteers | A yearly or monthly membership fee and a refundable deposit; fines | Accession register, a member register, a cash book for fees and deposits | Tracking who holds what, deposits owed back, renewals of membership |
| **Private lending library** (a business) | Owner plus one or two staff | Monthly plans ("2 books at a time for ₹200 a month") or a reading fee per book (a share of the cover price), and a deposit that sets how many books you may hold | Paper cards, a notebook, sometimes a spreadsheet | Deposits and plan dues, books not coming back, which copies earn |
| **Study space or reading room** (paid seat) | Owner plus a caretaker | A monthly seat fee by **shift** (morning, evening, full day, night), often AC and non-AC prices, an admission fee, sometimes a locker fee and a deposit | A seat chart on paper or WhatsApp, a fee notebook, an attendance register | Who has paid this month, which seats are free in which shift, expiry reminders |

What the real products show about **use** (not features to copy):

- **Koha** and **SLiMS** (open source) are built around three records: the bibliographic record
  (title), the item (copy, with its own barcode) and the patron (member). Circulation is driven by
  a **rule matrix** of member category × item type: loan period, renewals allowed, fine per
  interval, grace period, fine cap, holds allowed. Due dates skip days the library is closed.
  School set-up guides show librarians use only a handful of combinations (students, teachers;
  lending, reference).
- **Stock-taking in Koha** is a scan-and-compare: set a verification date, scan or upload the
  copies found on a shelf range, compare to the catalogue, list "missing (not scanned)" and "found
  in wrong place", then mark missing copies lost in bulk. Copies out on loan are not missing.
- **e-Granthalaya** (NIC) is what government and government-aided libraries in India are pointed
  at: cataloguing, circulation, membership, OPAC, on PostgreSQL. It is heavy for a one-person
  library, which is the opening for a simpler tool.
- **Indian government norms (General Financial Rules; rule 194 of GFR 2005 as quoted by practitioners, carried into GFR 2017)**: a loss of **five
  volumes per thousand issued or consulted in a year** is reasonable if not due to dishonesty or
  negligence; books above ₹1,000 and rare books are always investigated. Full verification
  **every year up to 20,000 volumes**, every three years up to 50,000, sample checks above that.
  Aided schools and colleges follow this, so the verification report has to express loss **per
  thousand issued**.
- **Public library rules** show the real numbers: Delhi Public Library issues for 14 days, renews up
  to three times unless reserved, charges ₹2 a day per book for adults and ₹1 for children, and a
  lost book costs its price plus the fine. The Central Secretariat Library charges ₹2 a day, holds
  a reservation 7 days after notice, lets a member hold two reservations, and charges a lost book at
  current price plus a surcharge that grows with the book's age. A law university charges ₹5 a day
  and asks for the same title or **three times the cost** for a lost book. One Kerala lending
  library takes a ₹1,000 refundable deposit, lets the deposit set the borrowing limit, and charges
  a reading fee of 10% of the cover price.
- **Reading-room apps** (Abhyasika, Manage Desk, Libly, Libraryly, 24Library, LibraryOS) all
  converge on the same five screens: a colour seat map by shift, a student list with plan and
  expiry, fee collection with a receipt, dues and expiry reminders on WhatsApp (T-7, T-3, T-1,
  due day, overdue), and attendance by QR or fingerprint. They have **no catalogue** at all. They
  are priced ₹159–₹499 a month flat. That tells us the reading room is a **seat-and-dues
  business**, not a lending business (see §15.4).

---

## 1. Core use cases

1. Keep the catalogue: add a title once, add each physical copy with its accession number and
   shelf, find any book by title, author, ISBN, accession number or subject.
2. Enrol a member on a membership type, take the fee and deposit, give a membership card.
3. Issue a copy to a member at the counter in a few seconds: type or scan the accession number,
   pick the member, confirm. The due date is worked out.
4. Take a copy back: work out any fine, take it or add it to the member's dues, put the copy back
   on the shelf or hand it to the next member waiting.
5. Renew a loan, unless someone is waiting or the member is blocked.
6. Put a hold on a title that is out, and tell the first member in the queue when a copy comes back.
7. Chase overdue copies with a prepared WhatsApp or SMS text that the library sends from its own
   phone.
8. Record a copy as lost or damaged, charge the member, and withdraw the copy from stock.
9. Verify stock once a year and produce the loss report.
10. Give a "no dues" answer for a member who is leaving (student passing out, member closing).
11. Renew memberships, refund deposits on closure, and see what the library is owed.
12. (Study spaces) allocate a seat in a shift, collect the monthly fee, see who has expired, mark
    attendance. This is delivered through shared engines, see §15.4.

## 2. Target users and personas

| Persona | Setting | Goals | Constraints |
|---|---|---|---|
| **Meena, school librarian** | 6,000 copies, 900 students, 60 teachers; one desk, one PC, sometimes a phone | Fast issue at break time (30 students in 20 minutes), class-wise overdue lists, yearly stock verification, "no dues" at year end | Not technical; the accession register goes back 30 years and must continue its numbering; no budget for software |
| **Ravi, library assistant** | Same school or a college | Issue and return, shelve, add new copies | Must not waive fines or delete records |
| **Farida, community library secretary** | 3,000 copies, 250 paying members, volunteers on rota | Membership renewals, fees and deposits in one place, statement for the committee | Volunteers change weekly; each needs a login with limited rights |
| **Anand, private lending library owner** | 8,000 copies, 400 members on monthly plans | Plan dues collected, deposits correct, overdue books back, see which titles earn | Works from a phone at the counter; members pay by UPI |
| **Pooja, reading-room owner** | 80 seats, three shifts, 190 students, no books to lend (or a small reference shelf) | Know who has paid, which seats are free, remind before expiry, attendance for parents who ask | Everything on a phone; students churn monthly |
| **Member (later)** | Any of the above | See what they hold, due dates, fines, holds | Only later, see §12 |

## 3. Main workflows

### 3.1 First set-up
1. Owner turns on the Library module (`enabled_modules`), which needs `parties` and `ledger`
   (and `payments` if fees are taken).
2. Library settings: opening days (weekly closed days), holidays, fine rules, starting accession
   number (to continue the paper register), member number prefix.
3. Membership types: e.g. Student, Teacher (school); Adult, Child, Family (community); Plan 2
   books ₹200/month, Plan 4 books ₹350/month (lending).
4. Bring existing stock in: CSV import of copies from the paper register or a spreadsheet (one row
   per copy: accession number, title, author, ISBN, category, shelf, price, date acquired). Titles
   are grouped from the rows. Existing members by CSV as parties plus a membership.

### 3.2 Add a new book
1. Search the catalogue first (by ISBN or title) to avoid a duplicate title.
2. If the title exists, **add copies** to it: number of copies, shelf, price, source (bought, gifted),
   bill reference. Accession numbers are given in sequence, or typed when continuing a register.
3. If not, create the title (title, authors, publisher, year, edition, ISBN, language, category,
   material type) and its copies in one form.
4. Print the spine/label slip (later, §15.3) or write the accession number on the book.

### 3.3 Enrol a member
1. Find or create the person as a party (name, mobile, address). A student's guardian is recorded.
2. Choose membership type; start date; validity end is worked out.
3. Fee and deposit are shown and posted to the member's account; take payment now or later.
4. Membership card is printed or shared as a PDF.

### 3.4 Issue (the counter screen, optimised for speed)
1. Focus is on one input. Type or scan the member number or card, or search by name/mobile.
2. The member panel shows: status, validity, copies held / allowed, overdue copies, dues owed,
   holds ready. Any block is shown in plain words with who may override.
3. Type or scan the accession number; Enter. The copy is checked (available, not reference,
   not on hold for someone else), due date shown. Repeat for more copies.
4. Confirm. A short issue slip can be printed or a WhatsApp text prepared ("You have borrowed …
   due on …").

### 3.5 Return
1. Type or scan the accession number alone (no member search needed).
2. The loan is closed. Days late and fine are shown; staff can take it now (payment), add it to
   dues (charge on ledger), or, if permitted, waive with a reason.
3. If a hold is waiting, the screen says "Keep aside for <member>" and prepares the pickup message;
   the copy goes to *on hold shelf*. Otherwise it goes back to *available*.
4. Condition check: staff may mark damaged, which opens the damage charge (§6.6).

### 3.6 Renew
From the member panel, the loan row, or by scanning the copy at the counter: new due date from
today (or from the old due date, a setting), within the renewal limit, refused if a hold is waiting.

### 3.7 Holds
Place a hold on a title (any copy) for a member. When a copy is returned it is allotted to the first
hold; the member is told; they have N days to collect; if they don't, the hold expires and the next
member gets the copy.

### 3.8 Overdue follow-up
Daily list of overdue loans, grouped by member (and class/section for schools). One tap prepares a
reminder text per member listing each copy and fine so far; the library sends it from its own phone.

### 3.9 Lost or damaged
Member reports a loss, or verification finds one. Staff marks the loan lost: overdue fine stops at
that date; replacement charge is posted; copy status becomes *lost*. If the book later turns up,
the lost charge can be reversed per the refund setting; the fine stays.

### 3.10 Stock verification
Start a verification (whole library or shelf range/category). Enter or scan accession numbers of
copies found; the system shows progress; close it to get: found, on loan (not missing), missing,
found in wrong place, found but marked lost/withdrawn. Missing copies can be marked lost/withdrawn in
bulk with a reason. The report shows loss per thousand issued in the year.

### 3.11 Membership renewal, closure and "no dues"
Expiring list; renew = new validity plus fee charge. Closure: all copies returned, dues cleared,
deposit refunded (or adjusted against dues with the member's agreement), membership closed.
"No dues" certificate printed for school/college leavers.

### 3.12 Study space (through shared engines, §15.4)
Seat map per shift → allot a seat to a member for a period → monthly fee charged by the recurring
dues engine → reminders at T-3/T-1/due day → attendance check-in each day → free the seat on expiry.

## 4. Entities and data, with fields

All tables are tenant-scoped (`TenantModel`), UUIDv7 primary keys, `created_by`, timestamps, and
soft-delete only where stated. Names are proposals for the FRD.

### 4.1 `library_title` (the work)
| Field | Type | Notes |
|---|---|---|
| title | text 300, required | |
| subtitle | text 300 | |
| authors | text 300 | Display string, "Premchand; R. K. Narayan". A separate author table is later (§16) |
| isbn | text 13, nullable | Stored normalised: digits, ISBN-10 converted to ISBN-13. Not unique (reprints, sets, bad data) but warned on duplicate |
| publisher | text 160 | |
| edition | text 40 | |
| year | smallint, nullable | 1500–current year + 1 |
| language | text 40 | Free text with suggestions (English, Hindi, Marathi, Tamil…) |
| category | FK `library_category`, nullable | |
| material_type | enum | book, reference, magazine, textbook, audio-visual, other. Drives loan rules |
| call_number | text 40 | Optional classification (e.g. DDC "891.43") for libraries that use it |
| keywords | text 300 | Search aid |
| notes | text | |
| copies_total / copies_available | int, cached | Maintained by service; recomputable |
| status | active / archived | Archived when every copy is withdrawn |

### 4.2 `library_category`
name (60, unique per tenant, case-insensitive), parent (optional, one level), sort_order. The
library's own subjects ("Fiction", "Competitive exams", "Class 9 textbooks").

### 4.3 `library_shelf`
code (24, unique, e.g. "A-3"), name ("Almirah A, shelf 3"), is_active. Optional; a copy can carry a
free-text location instead for very small libraries.

### 4.4 `library_copy` (the physical book; the heart of the module)
| Field | Type | Notes |
|---|---|---|
| title | FK `library_title`, required | |
| accession_number | text 24, required | **Unique per tenant for ever**, including withdrawn copies. Numeric by default, prefix allowed ("R-1024" for reference) |
| barcode | text 40, nullable | Only if the library already has labels different from the accession number; else equals it |
| shelf | FK `library_shelf`, nullable | or `location_text` |
| status | enum | available, on_loan, on_hold_shelf, in_repair, lost, missing, withdrawn |
| is_reference | bool | Not for loan, whatever the material type |
| acquired_on | date | |
| source | enum | bought, gifted, transferred, other |
| source_note | text 160 | Donor, supplier, bill number |
| price | money, nullable | Used for lost-book charge and stock value |
| condition | enum | good, fair, poor |
| volume / copy_label | text 24 | "Vol. 2", "Copy 3" |
| withdrawn_on / withdrawn_reason | date / enum+text | worn out, lost, missing at verification, transferred; reason required |
| last_seen_on | date | Updated by return and verification |
| version | int | Optimistic lock |

Status changes are written to an **immutable `library_copy_event`** (copy, from_status,
to_status, reason, source_type/source_id, at, by) — the same pattern as `inventory.StockMovement`
and `ledger.LedgerEntry` (immutable rows, corrections are new rows).

### 4.5 `library_membership_type`
name (60), code, **max_copies** (at a time), **loan_days** default, **max_renewals**, **fine_per_day**,
**fine_cap** (nullable), **grace_days**, **max_holds**, fee_amount, fee_period (none, monthly,
quarterly, half-yearly, yearly, one-time), validity_months (or open-ended), deposit_amount,
**dues_block_amount** (block issue above this), allows_reference_loan (bool, e.g. teachers),
priority (for holds, later), is_active.

### 4.6 `library_loan_rule` (optional override matrix)
membership_type (nullable = all), material_type (nullable = all), loan_days, max_renewals,
fine_per_day, fine_cap, grace_days, loanable (bool). Most specific match wins. MVP can ship with
the membership-type defaults plus a material-type override only (§16).

### 4.7 `library_membership` (a party's membership)
| Field | Type | Notes |
|---|---|---|
| party | FK `parties.Party`, required | **Members are parties** (vision §3). No second contact table |
| member_number | text 24, unique per tenant | Sequence with prefix; or typed (school admission number) |
| membership_type | FK | |
| starts_on / valid_until | date / date nullable | nullable = no expiry (school) |
| status | enum | active, expired, suspended, closed |
| suspended_until / suspension_reason | date / text | |
| group_label | text 40 | Class and section ("9-B"), department, batch. For lists and bulk reminders |
| guardian_party | FK Party, nullable | For children; reminders go to the guardian's mobile |
| card_issued_on | date | |
| deposit_held | money, derived | From deposit records, never typed |
| notes | text | |

One party may hold more than one membership over time (closed then rejoined); at most one
**active** membership per party per tenant (DB partial unique index).

### 4.8 `library_loan`
copy (FK), membership (FK), issued_at (timestamp), issued_by, **due_on** (date), returned_at,
returned_by, renew_count, status (open, returned, lost, written_off), fine_accrued (derived at
return; stored with the charge), hold (FK nullable, when issued against a hold), notes.
Partial unique index: **one open loan per copy.** Renewals and due-date changes are
`library_loan_event` rows (renewed, due changed by staff with reason, marked lost, found).

### 4.9 `library_hold`
title (FK), copy (FK nullable: a specific copy, e.g. volume 2), membership (FK), placed_at,
placed_by, status (waiting, ready, collected, expired, cancelled), ready_copy (FK nullable),
ready_on, collect_by, closed_at, cancel_reason. Queue position is derived (ordered by placed_at).

### 4.10 `library_charge` (what the member owes the library for this module)
| Field | Notes |
|---|---|
| membership, party | party for the ledger |
| kind | membership_fee, renewal_fee, admission_fee, overdue_fine, lost_book, damage, processing, reading_fee, other |
| amount | money > 0 |
| loan / copy | when the charge comes from circulation |
| charge_date | |
| status | open, part_paid, paid, waived, reversed (derived from allocations, not toggled) |
| amount_paid / amount_due | maintained by the payments allocation contract (§10) |
| waived_amount, waive_reason, waived_by | |
| ledger_entry_id | the ledger line this charge posted |
| number | "FIN-0001" style document number for the receipt |

### 4.11 `library_deposit`
membership, amount, received_on, status (held, part_refunded, refunded, adjusted), refund
records (amount, date, mode, adjusted_against charge ids). See §10 for how it touches the ledger.

### 4.12 `library_calendar_day`
date, is_closed, reason ("Diwali"). Plus weekly closed days in library settings (JSON on tenant
settings, e.g. `{"closed_weekdays": [6]}` for Sunday).

### 4.13 `library_verification` and `library_verification_scan`
Verification: name ("Annual 2026–27"), scope (all / shelf list / category list / accession range),
started_on, closed_on, status (open, closed), started_by, counts cached at close, notes.
Scan: verification, accession_number as entered, copy (FK nullable if not found), scanned_at, by,
result (found, found_wrong_shelf, unknown_number, duplicate_scan, found_but_lost_or_withdrawn).

### 4.14 Study-space entities (belong to shared engines, listed here as requirements)
- **Resource**: seat (label "A-12"), section/zone ("AC hall"), features (AC, locker, power point),
  is_active.
- **Slot/shift**: name ("Morning 6–12"), start and end time; "full day" covers several.
- **Allocation**: resource × shift × member × from/to dates; no two active allocations on the same
  seat and overlapping shift and dates (DB exclusion constraint on a date range).
- **Plan / recurring due**: amount per period by shift and section, admission fee, locker fee,
  next due date; renewal moves the next due date.
- **Check-in**: member, date, in time, out time, source (staff, QR at desk).

## 5. CRUD

| Entity | Create | Read | Update | Delete |
|---|---|---|---|---|
| Title | form, CSV import | list, detail with copies and history | edit any field | archive only when no copies are active; never hard delete once any copy was issued |
| Copy | with title, "add copies", CSV | list, detail with loan and event history | shelf, price, condition, notes; accession number editable only before first issue, with audit | **never deleted**; withdraw with a reason (accession register is permanent) |
| Category, shelf | settings | lists | rename, merge (category) | delete only if unused; else deactivate |
| Membership type | settings | list | edit; changes apply to new loans and renewals, not to open loans' due dates | deactivate if memberships exist |
| Loan rule | settings | matrix view | edit | delete |
| Membership | enrol form, CSV | member list, member panel | type change, validity, group, guardian, suspend | close (not delete); the party stays in parties |
| Loan | issue | lists, copy and member history | renew, change due date (permitted roles, reason), mark lost | never; mistakes are **undone by a correcting event** within a short window (e.g. issued to wrong member: "cancel issue" writes a reverse event) |
| Hold | place | queue per title, member holds | cancel, extend collect-by | never |
| Charge | from circulation or manual | member dues, reports | waive (permission, reason) | never; reversed with a reason, following the ledger correction rule (canon §0.11) |
| Deposit | enrol or later | member panel | refund, adjust | never |
| Verification | start | progress, report | add scans, close, reopen once (permission) | delete only while empty |

## 6. Business rules

### 6.1 Loan periods and limits
- Loan days come from the most specific loan rule, then membership type (§4.6). Typical: students
  7–14 days, teachers 30 days, adults 14 days, magazines 3–7 days, reference not for loan.
- **Due date falls on a closed day → move to the next open day** (weekly closed days + calendar).
- `max_copies` counts open loans, including overdue ones. Lost loans not yet settled also count
  (setting; default yes) so a member cannot lose and borrow endlessly.
- Blocks on issue (each shown with its reason): membership expired or suspended; at the copy limit;
  any overdue copy (setting: block / warn); dues above `dues_block_amount`; the copy is reference,
  lost, withdrawn, in repair or on hold for someone else.
- Owner/admin (and a delegable permission `library.issue.override`) may override a block with a
  reason; the override is audited. Expired membership is not overridable: renew first.

### 6.2 Renewals
- Allowed up to `max_renewals`; refused when a hold is waiting on the title and no other copy can
  serve it, when the loan is overdue beyond grace and the setting blocks it, or when the member is
  blocked.
- New due date = renewal day + loan days (default), or old due date + loan days (setting). Moved off
  closed days.
- Renewing an overdue loan **first settles the fine accrued to that day** as a charge (it is not lost
  by renewing).

### 6.3 Fine calculation
Definitions: `days_late = return_date − due_on` in calendar days. If `skip_closed_days_in_fines`
is on, closed days between them are not counted. **Grace waives, it does not shift:** if
`days_late ≤ grace_days` the fine is ₹0; otherwise the fine counts from the due date.
`fine = min(days_late × fine_per_day, fine_cap)` per copy. The cap defaults to the copy's price if
no cap is set, so a fine never exceeds the book. Amounts are `Decimal`, rounded to the rupee
(setting: rupee or paise).

Worked examples (rule: ₹2/day, grace 2 days, cap ₹100, library closed on Sundays):

| # | Due | Returned | Setting | Calculation | Fine |
|---|---|---|---|---|---|
| 1 | Sat 10 Oct 2026 | Mon 12 Oct | count all days | 2 days late ≤ grace 2 | **₹0** |
| 2 | Sat 10 Oct | Tue 13 Oct | count all days | 3 days × ₹2 (grace passed, counts from due date) | **₹6** |
| 3 | Sat 10 Oct | Tue 13 Oct | skip closed days | Sun 11 not counted → 2 days ≤ grace | **₹0** |
| 4 | Sat 10 Oct | Wed 14 Oct | skip closed days | Sun skipped → 3 days × ₹2 | **₹6** |
| 5 | Sat 10 Oct | Wed 9 Dec | count all days | 60 × ₹2 = ₹120, cap ₹100 | **₹100** |
| 6 | Sat 10 Oct, 3 copies | Tue 13 Oct | count all days | 3 × ₹6 per copy | **₹18** |
| 7 | Sat 10 Oct | declared lost Sat 17 Oct | lost | fine to 17 Oct: 7 × ₹2 = ₹14; plus lost charge (§6.5) | **₹14 + lost** |

(Due dates cannot fall on Sunday 11 Oct because of §6.1; a book due on a Sunday would already have
been moved to Monday.)

- A fine is a **charge posted at return** (or at renewal/lost), not a number that grows in the
  ledger every night. The member panel and overdue list show "fine so far" computed live.
  Rationale: nightly accruals would write thousands of ledger lines and violate the "never edit a
  posted line" rule each time a figure changed.
- Waiving is a separate act with a reason and permission (`library.fine.waive`), not a typed lower
  amount.

### 6.4 Holds priority
- Title-level queue, **first placed, first served** (MVP). A specific-copy hold is allowed for
  volumes and sets.
- A member cannot hold a title they currently have on loan, and not beyond `max_holds`.
- On return, the copy goes to the first *waiting* hold whose member is not blocked; blocked members
  are skipped but keep their place.
- Ready hold: `collect_by = ready_on + pickup_days` (default 3 open days). Expired holds release the
  copy to the next in queue; the member is told (prepared text).
- Only a copy on the shelf (available) can satisfy a new hold immediately; staff can mark it ready.
- Later: priority by membership type (teachers before students), which Koha and university rules
  use; kept out of MVP to keep the queue explainable.

### 6.5 Lost items
Lost charge = copy price (or title's current price typed at the time) × `lost_multiplier`
(setting, default 1; some libraries use 2 or 3) + `processing_fee` (setting, default ₹0) + fine to
the day it was declared lost. Alternatively the member **replaces the copy** with the same title:
the charge is waived with reason "replaced", the old copy is withdrawn (lost) and a new copy with a
new accession number is added. If a lost copy is found and returned: the lost charge is reversed
if unpaid, or refunded/credited if paid (setting: refund / credit to member / no refund); the fine
stays; the copy returns to *available*. Declaring lost stops fine accrual.

### 6.6 Damage
Staff picks a damage level: minor (fixed charge, setting), major (share of price), or unusable
(treated as lost). The copy moves to *in repair* or *withdrawn*.

### 6.7 Memberships, fees, deposits
- Validity = start + `validity_months`; renewal extends from the old end date if renewed early, or
  from the renewal date if expired (setting).
- Fee is charged on enrolment and renewal, according to the type's period. Recurring monthly plans
  (lending libraries, reading rooms) are driven by the **recurring dues engine**, not a library cron.
- Deposits are refundable and are **not income** (§10). Closing a membership needs: no open loans,
  no open charges (or the member agrees to adjust from deposit), then refund.
- Deposit-scaled limits (Kerala-style "limit proportional to deposit") are modelled as membership
  types with different deposits, not as a formula.

### 6.8 Accession numbers
Allocated from a per-tenant counter that is **not financial-year based** (unlike invoice numbers).
The library may set the next number to continue the paper register. Typed numbers are accepted
when importing, but must be unique. Numbers are never reused, even after withdrawal.

## 7. Dashboard

A library card on the existing dashboard when the module is on, and a library home screen:

- Today: issued, returned, renewed; copies out now; **overdue now** (count and members).
- Holds ready for collection (and expiring today).
- Memberships expiring in 7 days; expired but still holding books.
- Dues: total open library charges; deposits held.
- Quick actions: **Issue**, **Return**, Add book, Add member.
- School view: overdue by class/section.
- Study space (engine screens): seats free per shift today, fees due this week, today's attendance.

Every figure links to the filtered list behind it (the pattern the parties chips established).

## 8. Reports

| Report | Contents | Who asks |
|---|---|---|
| Accession register | Every copy in accession order with title, author, date, source, price, status, withdrawal reason. Print and CSV | Auditors, school management; replaces the bound register |
| Circulation (issue/return register) | Loans in a period: date, member, copy, due, returned, fine | Librarian, committee |
| Overdue list | Open overdue loans by member/group, days late, fine so far | Daily use |
| Member activity | Loans per member in a period; members never borrowed | School reading programmes |
| Most and least issued titles | Counts in a period; never issued in N years (weeding) | Purchase and weeding decisions |
| Fines and fees collected | Charges by kind, waived, paid, open; by period | Treasurer, owner |
| Deposits held | Per member and total; refunds in period | Treasurer (a liability) |
| Stock summary | Copies by status, category, material type; value at price | Committee, audit |
| Stock verification report | Scope, counted, found, on loan, missing, wrong place, lost/withdrawn; **loss per 1,000 issued in the year** vs the 5/1,000 norm; list of missing copies with value; items over ₹1,000 flagged | Annual audit (GFR norm) |
| Withdrawn copies | Period, reason, value | Write-off approval |
| Holds report | Waiting and expired holds; titles with long queues (buy more copies) | Purchase |
| No dues | Per member or per class: clear / not clear with reasons | School/college year end |
| Study space (engines) | Occupancy by shift, revenue by shift, expiring plans, attendance per member | Reading-room owner |

All reports follow the existing reports hub rule: only built reports are listed; CSV export via
`reports/exports`.

## 9. Documents

All use the existing print pipeline (`window.print()`, tenant name, logo and colour from branding),
and **never name the product or its domain** (`customerDocumentsCarryNoProductName` must be
extended to cover them).

1. **Membership card** (CR80 card size, or A6 / 4 per A4 sheet): tenant name and logo, member name,
   member number, membership type, valid until, guardian (children), photo later. A **QR code of the
   member number** is possible with the in-house encoder `apps/common/qr.py` (used for UPI QR today),
   so no new dependency. A 1D barcode is backlog (§15.3).
2. **Fine or fee receipt**: reuse the payments A5 receipt; the allocation lines show "Overdue fine –
   <title> (Acc. 10231), 3 days" and "Membership fee Oct 2026". No separate receipt document.
3. **Overdue notice**: printable A5 letter and a prepared WhatsApp/SMS text: member name, list of
   copies (title, accession, due date, days late), fine so far, "please return by", tenant
   signature. For children, addressed to the guardian.
4. **Issue slip** (optional, 80 mm or text): copies and due dates.
5. **No dues certificate**: member, member number, group, "has returned all library books and has no
   dues as on <date>", signature line.
6. **Stock verification report** and **accession register** print sheets (A4, landscape).
7. **Deposit receipt and refund voucher**: reuse payment receipt (in) and payment made (out).

## 10. Payments: fees, deposits, fines

Rule (vision §3): **money always goes through the ledger and payments; no module keeps its own
balance arithmetic.** Concretely:

### 10.1 Fees and fines (receivables)
- Each `library_charge` posts **one ledger line** against the member's party, direction "gave"
  (member owes), with new `EntryType` values (proposed `library_fee`, `library_fine`,
  `library_lost`) and `SourceType = library_charge`, `source_id` = charge id. `ledger_entry`'s
  `(source_type, source_id)` pair is exactly the extension point Part 21 §21.9 names for this.
- Payments settle charges through the **existing allocation target registry**
  (`apps/payments/services/targets`): library registers an `AllocationTarget` for
  `document_type = "library_charge"`, direction `in`, keeping the contract (lock in a fixed order,
  `outstanding`, `apply`/`unapply`, status recomputed). Receipt, void, UPI QR and cashbook then
  come for free. The adapter's location (payments importing library, or a seam) is the architecture
  owner's call; payments already imports sales and purchases this way.
- A waiver posts a correcting ledger line (a "got"-direction adjustment with the reason), never an
  edit, following canon §0.11 and LED-03.
- Credit limit (PTY-06) is irrelevant to members and should not block library charges; the library
  uses its own `dues_block_amount` for issue blocks (open question for architecture: skip the credit
  check for `source_type = library_charge`).

### 10.2 Deposits (a liability, not income)
The problem: the ledger keeps **one balance per party**. If a ₹1,000 deposit were posted as a plain
"got" line, the member would show ₹1,000 "in advance", every later fine would silently net against
it, the "to collect" dashboard would understate dues, and a refund would look like the library
paying a customer.

Options for the architecture owner:
- **A. On the party ledger as an advance.** Simple, statement shows it, but mixes a liability into
  receivables. Not recommended.
- **B. Deposit as a held record, ledger nets to zero** (recommended): enrolment posts a
  `deposit` charge (member owes ₹1,000) and the payment in settles it, so the party balance is ₹0
  and cash/UPI is recorded by payments; `library_deposit` tracks ₹1,000 *held*. Refund is a payment
  out allocated to a `deposit_refund` target that posts the balancing line. Adjusting a fine from
  a deposit is an explicit act that settles the fine charge from the deposit and reduces *held*,
  never automatic.
- **C. A second balance bucket on the ledger** (account dimension). Most correct in accounting
  terms, but a core ledger change for one module; possibly shared with hotel advance deposits and
  gym deposits, which is why it deserves an ADR rather than a library-only answer.

### 10.3 Recurring fees
Monthly plans and reading-room seat fees are schedules: amount, period, next due date, grace, what
happens on non-payment (block issue, free the seat). These belong to the **recurring dues engine**
proposed in vision §3; the library configures it (plan = membership type fee; seat plan = engine
plan). The engine posts the same `library_charge`/ledger lines on each due date via
`platform_job` + `run_scheduler` (no Celery, ADR-021).

### 10.4 GST
Services of **public libraries by way of lending** books are exempt (entry 50, notification
12/2017-Central Tax (Rate)); school libraries fall under education services. A private lending
library or a reading room above the GST threshold may have to charge GST (library services, SAC
998451, 18%). The product should **not decide tax**: library charges are non-GST by default, and a
tenant that needs tax invoices raises them through the sales module. Open question §17.

## 11. Search, filter and sort

- **Global catalogue search** (one box): title, subtitle, authors, ISBN (either format, with or
  without hyphens), accession number (exact match jumps to the copy), keywords, publisher. Postgres
  `ILIKE`/trigram is enough at this scale (10k–50k copies); no search engine (ADR-021). Hindi and
  other scripts must match as typed (no transliteration in MVP).
- Titles list filters: category, material type, language, availability (any copy available / all
  out), has holds, year range. Sort: title A–Z, recently added, most issued.
- Copies list filters: status, shelf, category, acquired between, source, price missing, not seen
  since (verification). Sort: accession number (numeric-aware: "R-2" before "R-10"), title.
- Members list: status, membership type, group (class/section), expiring within N days, has overdue,
  has dues, deposit held. Sort: name, member number, valid until, dues.
- Loans list: open/overdue/returned, due between, issued between, member group, issued by.
- Filters live in the URL (the parties pattern, `usePartyListUrl`), so "Overdue · Class 9-B" is a
  link a librarian can bookmark or share with a class teacher.

## 12. Roles and permissions

Reuse the four roles and the codename permission registry (`permissions_registry.py`); add
library codenames. Proposed mapping:

| Permission | Owner | Admin | Staff (assistant) | Accountant |
|---|---|---|---|---|
| `library.catalogue.view` | ✓ | ✓ | ✓ | ✓ |
| `library.catalogue.manage` (titles, copies, import) | ✓ | ✓ | ✓ | – |
| `library.copy.withdraw` | ✓ | ✓ | – | – |
| `library.member.manage` (enrol, edit, renew) | ✓ | ✓ | ✓ | – |
| `library.member.close` (closure, deposit refund) | ✓ | ✓ | – | – |
| `library.circulation.issue_return` (issue, return, renew, holds) | ✓ | ✓ | ✓ | – |
| `library.issue.override` (block override) | ✓ | ✓ | delegable | – |
| `library.loan.change_due` / mark lost | ✓ | ✓ | – | – |
| `library.fine.waive` | ✓ | ✓ | delegable | – |
| `library.verification.run` (scan) | ✓ | ✓ | ✓ | – |
| `library.verification.close` (mark missing as lost/withdrawn) | ✓ | ✓ | – | – |
| `library.reports.view` | ✓ | ✓ | – | ✓ |
| `library.settings.manage` (types, rules, calendar) | ✓ | ✓ | – | – |

"Librarian" maps to admin (or owner in a one-person library); "assistant" to staff. Money
permissions (record payment, void) stay the payments module's. Waivers are a codename (delegable),
consistent with LED-03's distinction between ordinary capabilities and owner ceilings.

**Member self-view (later):** a read-only page for a member (what I hold, due dates, fines, holds,
place a hold). It needs a member identity: either a `/d/<token>`-style private link per member
(reusing the generalised `parties_share_link`, CR-131), or member accounts. The share link is the
cheaper first step and needs no new auth. Not MVP.

## 13. Edge cases

1. **Same accession number typed twice** at import or entry: refused with the existing copy shown.
2. **Paper register has gaps and duplicates** (two books numbered 4512): import reports them;
   the librarian renumbers one with a suffix ("4512-A") and a note.
3. **Copy scanned at return that is not on loan** (returned twice, or never issued): show its status;
   if it was *missing* or *lost*, offer "found" (§6.5); record `last_seen_on`.
4. **Copy returned that is on loan to a different member than the one in front of the desk**: return
   by copy only, so it closes the right loan; show whose it was.
5. **Issue to wrong member**: "cancel issue" within the same day writes a reversing event; after that,
   return and re-issue.
6. **Return backdated** (book dropped in a box over the weekend): return date can be set back to the
   last open day, with permission; fine computed on that date.
7. **Due date on a holiday added after issue**: stored due dates are not changed; fine uses
   `skip_closed_days_in_fines` so the member is not penalised for the new holiday (setting).
8. **Membership expires while books are out**: loans continue; no new issue or renewal; they appear
   in "expired but holding books".
9. **Member closes with dues larger than deposit**: refund ₹0, remainder stays as a receivable on the
   party; the party cannot be archived (PTY-04 balance guard) until settled or written off.
10. **Student leaves the school with a book**: no-dues list flags; lost charge or write-off
    (existing ledger write-off for small residues).
11. **Two staff return and issue the same copy at the same moment**: row lock on the copy
    (`SELECT … FOR UPDATE`) and the one-open-loan-per-copy unique index.
12. **Hold ready but the member is now blocked** (dues): skip to next waiting member, keep position.
13. **Last copy withdrawn with holds waiting**: holds are cancelled with a reason and the members
    are told (prepared text).
14. **Multi-volume sets**: each volume is a copy (volume label); holds may be copy-specific.
15. **Magazines and newspapers**: many issues of one title; MVP treats each issue as a copy with a
    volume label ("Mar 2026"); subscriptions/serials control is later.
16. **Price unknown** (old gifted books): lost charge falls back to a default price by material type
    (setting) or the librarian types it at the time.
17. **Family membership**: one party as holder, others as additional members sharing the limit —
    later; MVP uses separate memberships.
18. **Child members without a mobile**: guardian party receives reminders.
19. **Fine accrued on a book during verification closure** ("do not return during verification"):
    scanning in verification never closes a loan.
20. **Module turned off**: `blocking_rows_for_module_off` must refuse while open loans, open
    charges or held deposits exist.
21. **Study space: member moves seat mid-month**: allocation ends, new allocation starts; the fee
    schedule is untouched (engine concern).
22. **Study space: fee paid for a shift, member comes in another shift**: attendance flags it; no
    automatic charge.

## 14. Validations

- Title required, 1–300 chars. Year 1500–current year + 1.
- ISBN: accept ISBN-10 (check digit mod 11, X allowed) or ISBN-13 (EAN check digit, 978/979
  prefix); strip hyphens/spaces; store as ISBN-13; a failed check digit is an error, a duplicate is a
  warning ("this ISBN already exists as <title>; add a copy instead?").
- Accession number: 1–24 chars, letters, digits and `-`/`/`; unique per tenant including withdrawn;
  case-insensitive uniqueness.
- Price ≥ 0, at most 2 decimals; amounts in `Decimal` (money rules of the ledger).
- Membership type: `max_copies` 0–50, `loan_days` 1–365, `max_renewals` 0–20, `fine_per_day` ≥ 0,
  `grace_days` 0–30, `fine_cap` ≥ 0 or empty, deposit ≥ 0.
- Membership: `valid_until ≥ starts_on`; one active membership per party; member number unique.
- Issue: copy status = available (or ready for this member's hold); not reference unless allowed;
  member active and within validity; under limits; not blocked, or override with reason.
- Return date ≥ issue date and ≤ today.
- Renew: within count, no waiting hold, not blocked.
- Waive: amount ≤ amount due; reason required (≥ 3 chars).
- Withdraw: reason required; copy not on loan.
- Verification: one open verification per scope overlap (warn); scans must match the scope or be
  flagged "outside scope".
- Mobile numbers and addresses: existing parties validators, no new ones.

## 15. Reuse from core vs new

### 15.1 Reused as is
| Core piece | Used for |
|---|---|
| `platform`: `ModuleCode`, `enabled_modules`, `MODULE_DEPENDENCIES`, `_ModuleEnabled` | `library` module switch; dependency `library → {parties, ledger}` (+ `payments` for fees) |
| Team, roles, permission registry, audit log | Librarian/assistant rights, override and waiver audit |
| **Parties** | **Members are parties.** Name, mobile, address, tags, search, archive guard. Guardian is a second party. A party can be a member of the library and a customer of the shop in the same tenant with one record |
| **Ledger** | Every fee, fine, lost/damage charge as a ledger line with `source_type = library_charge`; corrections and waivers by the LED-03 rule; statement and aging for member dues |
| **Payments** | Receipts, modes, UPI QR, void — via a registered `AllocationTarget` |
| Reminders | Reminder list, prepared WhatsApp/SMS text, bulk prepare, history (`ledger_reminder`, `wa.me`/`sms:`); the product sends nothing (DEC-012) |
| Scheduler (`platform_job`, `run_scheduler`) | Nightly: mark holds expired, overdue list snapshot for reminders, membership expiry, recurring dues |
| Print pipeline and branding | Card, notice, no-dues, reports; tenant name only |
| `apps/common/qr.py` | QR of member number on the card (and later on copy labels) |
| Import/export wizard | CSV import of copies and members (new import kinds; same template/map/review/commit/errors flow) |
| Reports hub + CSV exports | Library reports listed only when built |
| Sequences (`platform_app.services.sequences`) | Member numbers and charge numbers. Accession numbers need a **non-FY counter** mode (it is FY-based today), or a library counter: architecture decides |
| Notifications (bell) | "Hold ready", "12 overdue today" in-app |

### 15.2 Why books are **not** inventory items, and what can be reused from inventory
Inventory's `Item` is a **fungible stock-keeping unit for sale**: SKU, HSN, GST rate, selling and
purchase prices, a unit (kg, pcs) and a **quantity** moved by stock movements, valued, with
low-stock alerts. A library book is the opposite:
- each copy is **individually identified** (accession number) and has its own history, status and
  borrower; a quantity of "5" says nothing about which five are on the shelf;
- it is **not sold**, has no GST on issue, no selling price, and its "movement" is a loan that comes
  back, not a sale that leaves;
- the accession register is a permanent, never-renumbered record, unlike SKUs.

Also, inventory is part of the **Shop & billing vertical**, not the core, and **verticals never
import each other** (vision §3 rule 2). A library tenant may not have inventory enabled at all.

So: **no shared tables.** What is reused is the **pattern and the code shape**, not the rows:
- the immutable movement log (`StockMovement` → `library_copy_event`), with reversal by a new row;
- the category master shape (name, parent, sort order) and its CRUD screens as a template;
- `Location` (stock location) as the model for `library_shelf`;
- the stock adjustment "with a reason" flow as the model for withdraw/lost;
- the stock summary report layout.

A library that also **sells** books or stationery (common in school stores and reading rooms)
turns on inventory and sales separately; those items are inventory items and have nothing to do
with the catalogue. If the owner later wants "buy copies from a purchase bill" (bill → accession
numbers created), that is a seam from purchases into library (vertical → vertical is forbidden, so
it would be a core-level hook or a manual "add copies with bill reference"). MVP: the bill number is
a text field on the copy.

### 15.3 Barcode and scanning: what the existing stack can do
| Capability | Existing stack? | Verdict |
|---|---|---|
| **Manual accession entry** at the counter (type number + Enter) | Yes | **MVP.** One focused input, numeric keypad on phones, Enter submits, input clears for the next copy |
| **USB/Bluetooth barcode scanner** in keyboard-wedge (HID) mode | Yes, no code dependency: the scanner types the number into the focused field and sends Enter | **MVP by design**: the counter input must accept a burst of keystrokes + Enter and never lose focus after a submit. Libraries with existing labels benefit immediately. Needs a design rule, not a package |
| Scanning ISBN (EAN-13 on the back cover) to find a title | Same wedge input works; a scanned 978… number routes to ISBN search | MVP (same input, routed by format) |
| **QR on membership card**, read by a 2D wedge scanner | Yes, `apps/common/qr.py` exists | MVP for the card print; reading needs a 2D scanner (not all cheap scanners read QR) |
| **Printing barcode labels** (Code 128/Code 39) for copies | No encoder in the repo. Code 128 is small enough to write in-house, but it is new code with print-quality risk | **Backlog**, or QR labels via the existing encoder as the no-dependency path (QR needs a 2D scanner). ADR if a package is proposed |
| **Camera scanning** in the browser | `BarcodeDetector` is native only in Chrome on Android, macOS and ChromeOS (Google Play Services needed on Android); not in iOS Safari, Firefox, or Chrome on Windows/Linux. Anything else needs a WASM/JS library | **Backlog** (vision rule 4). If later added as a progressive enhancement using the native API only, it needs no dependency, but the patchy support must be accepted in an ADR |
| **ISBN lookup** to prefill title/author (Open Library, Google Books) | External service | **Backlog** with ADR (rule 4). MVP: manual entry, plus "copy from existing title" |
| RFID gates, self-issue kiosks, fingerprint attendance | Hardware + drivers | Out of scope; backlog note only |

### 15.4 Seats and slots for study spaces: which module owns them
Finding: a reading room is a **seat-and-dues business**. None of the Indian reading-room products
keeps a catalogue; their core is resource × shift × period, a monthly fee, reminders and
attendance. That is structurally the same as:
- **hotel rooms** (resource × dates, no double booking) → bookings/resources engine;
- **gym memberships** (plan, renewals, monthly fee, attendance) → recurring dues + check-ins engines.

Recommendation: **seats, shifts, seat fees and attendance do NOT belong in the library module.**
- Seat = a *resource*, shift = a *slot*, allocation = a *recurring booking* in the **bookings and
  resources** engine. Requirement for that engine from this research: allocations are for a date
  range and a slot (not nights), and several slots share one resource per day; exclusion constraint
  on (resource, slot, daterange).
- Monthly seat fee, admission fee, locker fee = plans in the **recurring dues** engine, posting to
  ledger and settled by payments (same as §10.3).
- Daily attendance = the **check-ins** engine the gym needs anyway; QR on the member card
  (existing encoder) is the check-in token; fingerprint devices are out of scope.
- The library module keeps catalogue, copies, circulation, holds, fines, verification.
- Tenant experience: a reading room enables "Study space" (engines + parties + ledger) without the
  catalogue; a library with a reading hall enables both. The member is the same party either way.
- **Sequencing consequence:** if the engines are not built when the library MVP ships, the library
  MVP ships **without seats** rather than building a seat table inside `library` that gym and hotel
  would then duplicate. Whether the reading room is presented as a sub-mode of Library or its own
  module card on the landing page is a product question (§17).

### 15.5 New in the library module
Title, category, shelf, copy, copy event, membership type, loan rule, membership, loan, loan event,
hold, charge (as a payment target and ledger source), deposit, calendar days, verification and scans;
the counter screen; the library settings page; library reports and prints; import kinds for copies
and members; new ledger `EntryType`/`SourceType` values; the payment target adapter; nightly jobs.

## 16. MVP vs later

**MVP (minimum useful library)**
- Titles and copies with accession numbers (continuing a paper register), categories, shelf, price,
  reference flag; CSV import of copies and members.
- Members as parties, membership types with limits, loan days, renewals, fine per day, grace, cap,
  validity, fee and deposit amounts; member number; group (class/section); guardian.
- Counter screen: issue, return, renew by typed or wedge-scanned accession number; blocks and
  override with reason; weekly closed days and holiday calendar.
- Fines computed at return; lost and damage charges; waive with permission; charges on the ledger
  and settled by payments; deposit held and refunded (option chosen by ADR).
- Holds: FIFO title queue, ready/collect-by/expire.
- Overdue list and reminders (prepared text, sent by the library's phone); hold-ready message.
- Stock verification with manual/wedge entry, report with loss per 1,000 issued; mark missing in bulk.
- Reports: accession register, circulation, overdue, fines and fees, deposits, stock summary,
  verification, no dues. Prints: membership card with QR, overdue notice, no-dues certificate,
  receipts via payments.
- Roles and permissions as §12.

**Later**
- Seat/shift/attendance screens (when the shared engines exist; §15.4).
- Recurring monthly plans for lending libraries (recurring dues engine).
- Loan rule matrix beyond material-type overrides; hold priority by member type; auto-renewal.
- Member self-view via private link; member accounts much later.
- Barcode/QR label printing; camera scanning; ISBN lookup (ADRs).
- Separate author table and author browse; series; MARC import/export (for libraries leaving Koha/
  e-Granthalaya); serials/subscription control; inter-library loans.
- Family memberships sharing a limit; reading-fee-per-book model (share of cover price).
- Purchase suggestions from hold queues; weeding lists; copy photos.
- Multiple branches (depends on core branches, not live).

## 17. Open questions for the owner

1. **Reading rooms:** is the paid study space part of "Library" on the landing page and in the app,
   or its own module card ("Study space") built on the shared engines? This research recommends the
   engines own it either way.
2. **Deposits:** which option in §10.2 (recommended B)? Should hotel and gym deposits be decided in
   the same ADR?
3. **GST:** do we assume library charges are always non-GST (public and school libraries are exempt),
   and send private libraries and reading rooms that must charge GST to the sales module for tax
   invoices?
4. **Fines on closed days:** default to counting all days (the law-university rule) or skipping
   closed days (friendlier)? This research suggests "skip closed days" as the default.
5. **Grace period semantics:** "grace waives, does not shift" (Koha-like) as proposed in §6.3?
6. **Lost book policy defaults:** price × 1 + fine, or × 2/× 3 as some institutions do? Refund on
   found: refund, credit, or none?
7. **Credit limits:** should the party credit limit be ignored for library charges (proposed yes),
   with the library's own dues block instead?
8. **Barcode:** accept "typed or wedge-scanned only" for MVP, with label printing and camera scanning
   in the backlog? Is QR-on-card (existing encoder) enough for members?
9. **Accession numbers:** extend the core sequence service with a non-FY counter, or let the library
   own its counter?
10. **School data:** should class/section be a free-text group (proposed) or a structured class list
    shared with a future coaching/tuition module?
11. **Member self-view:** wanted in the first release after MVP, and via private link (no login)?
12. **Pricing and plan limits:** does the library count copies or members against plan limits?
13. **Purchase to catalogue:** is "add copies from a purchase bill" wanted, given verticals cannot
    import each other (it would need a core hook)?

---

## Sources (all checked 29 Sep 2026)

Library systems and how they are used
- Koha circulation preferences (holds, fines, lost, calendar): https://koha-community.org/manual/23.05/en/html/circulationpreferences.html
- ByWater Solutions, Koha circulation rules explained: https://bywatersolutions.com/education/monday-minutes-circulation-rules
- Open School Solutions, Koha for schools, part 6: circulation and fine rules: https://openschoolsolutions.org/part-6-circulation-and-fines-rules-how-to-install-and-set-up-koha-for-schools/
- Catalyst IT, how to do a stocktake with Koha: https://www.catalyst.net.nz/blog/how-do-stocktake-koha
- SLiMS 9 source and feature list: https://github.com/slims/slims9_bulian
- e-Granthalaya (NIC): https://egranthalaya.nic.in/
- Stock verification with barcodes and Koha at St. Xavier's College, Kolkata (search result, not read in full): https://www.researchgate.net/publication/336127000

Indian rules and norms
- GFR stock verification and permissible loss (LIS Links discussion quoting GFR): https://www.lislinks.com/forum/topics/stock-verification-how-many
- GFR 2017 library provisions (practitioner summaries, search results): https://www.lisquiz.com/2024/02/key-provisions-given-for-libraries-in.html
- Delhi Public Library lending rules: https://dpl.gov.in/index.php/lending-of-books
- Central Secretariat Library rules: https://csl.nic.in/page/innerpage/library-rules.php
- Gujarat National Law University library regulations: https://gnlu.ac.in/Library/Library-Regulations
- Eloor Libraries membership (deposit, reading fee): https://www.eloorlibraries.in/membership.html
- GST on library services, exemption entry 50 of notification 12/2017-CT(R): https://www.taxheal.com/gst-library-services.html

Reading rooms and study spaces (India)
- Abhyasika: https://abhyasika.app/
- 24Library, reading room software in India 2026: https://24library.com/blog/reading-room-study-room-management-software-india-2026
- Manage Desk: https://www.managedesk.in/
- Libly: https://www.libly.in/
- Libraryly: https://www.libraryly.in/
- LibraryOS (search result): https://libraryos.in/

Scanning
- MDN, BarcodeDetector: https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector
- Chrome for Developers, Shape Detection API (platform support): https://developer.chrome.com/docs/capabilities/shape-detection
- IDAutomation, USB scanner integration (keyboard wedge, Enter suffix): https://www.idautomation.com/barcode-scanners/integration-guide/

Web content above is treated as data. Figures quoted from forums and vendor pages are indicative of
practice, not legal advice; the GST and GFR points should be confirmed by the owner's accountant
before any rule is built on them.

Repository facts checked at `e5d68c7`: `apps/common/constants.py` (`ModuleCode`),
`apps/platform_app/services/tenant_settings.py` (`MODULE_DEPENDENCIES`), `apps/parties/models.py`,
`apps/ledger/models.py` and `constants.py` (`EntryType`, `SourceType`, `ReminderKind`),
`apps/inventory/models.py` (`Item`, `Location`, `StockMovement`), `apps/payments/services/targets`
(`AllocationTarget`), `apps/common/qr.py`, `apps/platform_app/services/sequences.py`.
