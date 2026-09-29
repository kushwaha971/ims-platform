# Shared engines: proposed requirements

Status: **PROPOSED, Phase 2 research, 29 Sep 2026.** Everything in this document is a proposal.
It is input for the architecture agent (Phase 4), who decides and records ADRs in Part 38
(vision §3 rule 5). No table, name or endpoint here is agreed until an ADR says so.

Written by the platform strategy and competitor research agent. Companion document:
[candidates-and-competitors.md](candidates-and-competitors.md).

**Where the needs come from.** The domain needs are inferred from:
- the module map (lending, library, gym, hospitality) in [00-platform-vision.md](../00-platform-vision.md);
- the candidates researched in the companion document (coaching, rent, venues, daily deliveries);
- the live code at commit e5d68c7.

The lending, library, gym and hospitality research docs were written in parallel. They landed
before this document was committed and were read for the engine sections only. §0.3 lists where
they agree and where they differ. On domain detail **theirs win**; on cross-module shape this
document proposes. The architecture agent reconciles the differences.

---

## 0. The three engines at a glance

| Engine | PROPOSED app | It owns | It never owns |
|---|---|---|---|
| **1. Recurring dues and schedules** | `schedules` | Plans, schedules, the dues each schedule produces, pause, grace, penalties, pro-rating, and the daily run that turns a due into a ledger posting | Balances (the ledger), payments (payments), the domain object the due is *for* (a membership, a loan, a tenancy) |
| **2. Bookings and resources** | `bookings` | Resource types, resources, availability, bookings with holds, the conflict rule, stay and slot status | Prices and folios (the vertical computes them; money goes through the ledger), and the guest or member (parties) |
| **3. Check-ins and attendance** | `attendance` | Sessions, marks (present, absent and so on, or a quantity), visit check-in and check-out, entitlement counters | Whether the person *may* attend (the vertical asks engine 1 or its own rules), and money |

### 0.1 Rules that bind all three (from the vision and the code)

1. **Engines are core, not verticals.** They may be imported by any vertical. They import only core
   (parties, ledger, payments, notifications, files, platform). They **never** import a vertical
   (vision §3 rule 2).
2. **Engines reference vertical objects polymorphically**, as `(subject_type, subject_id)`. This is
   the same extension point the ledger uses (`source_type`, `source_id`, Part 21 §21.9) and
   payments uses (`document_type`, `document_id` in `payments_allocation`). A foreign key per
   vertical is forbidden, because it would make core import the vertical.
3. **Money only through `ledger.services.postings.post_source_entry` and `reverse_source_entries`**:
   - idempotent by `(source_type, source_id, entry_type)`;
   - the caller holds the transaction and has locked the party with `lock_party`.

   New `SourceType` and `EntryType` values are added, never a parallel balance.
4. **People are `parties`.** The engines hold `party_id` and nothing else about a person.
5. **Background work is `platform_job` rows drained by `manage.py run_scheduler`**
   (`FOR UPDATE SKIP LOCKED`). No Celery, no Redis, no new dependency (ADR-021).
6. **The product sends nothing** (DEC-012). Reminders are prepared texts that the tenant shares from
   their own phone, recorded through the existing reminder path.
7. **Customer-facing output carries the tenant's name only**: receipts, booking confirmations,
   attendance slips.
8. **A posted ledger line is never edited.** Engine records that have posted money are corrected
   by reversal, never by update.
9. **Whether an engine is on follows the modules that need it** (§5.3). A tenant never switches on
   "schedules" by hand.

### 0.2 Which module uses what

| Module | Engine 1: dues | Engine 2: bookings | Engine 3: attendance |
|---|---|---|---|
| Lending | **Yes**: collection plan in *expectation* mode (§2.4) | No | No |
| Library | Membership fee; fines are per-issue, not dues (§2.11) | Seats in a reading room (optional). Title holds are **not** bookings (§3.10) | Optional visit log |
| Gym | **Yes**: memberships, renewals, freeze | Class slots and trainer sessions (later) | **Yes**: visits, class roll-call, session packs |
| Hospitality | Long-stay monthly billing only | **Yes**: rooms, nights, holds, check-in and check-out | No (a stay check-in is a booking status) |
| Coaching (candidate) | **Yes**: course fee instalments, monthly fees, pro-rata refund | Demo slots (later) | **Yes**: batch roll-call |
| Rent (candidate) | **Yes**: monthly rent, escalation, deposit | Unit as a long-lived assignment (§3.2) | No |
| Venues (later) | Advance and instalments to the event date | **Yes**: halls, full-day slots, quantity hire | No |
| Daily delivery (watch list) | Monthly bill from the log | No | **Yes**: quantity per day (§4.2) |

### 0.3 Reconciliation with the parallel research (read 29 Sep 2026)

| Topic | This doc | Parallel doc | Status |
|---|---|---|---|
| Dues engine exists and lives in core | Yes (`schedules`) | lending.md §16.4 (`apps/dues`); gym.md §15.3 | **Agreed.** The name is the architect's. |
| Two money modes | `charge` and `expectation` (§2.4) | gym.md §15.3: "recurring charges that raise documents" and "instalments against a document". lending.md: dues carry principal, interest and fee components against a disbursed loan | **Agreed in substance.** Gym's framing makes Q3 (a due raises a sales document) the default for `charge` mode. |
| A gym membership is not a schedule | Not stated | gym.md §15.3: validity (freeze, extend) stays in `gym_membership`; a prepaid term is one invoice | **Adopted** (§2.11) |
| Due status set | `scheduled, due, overdue, paid, skipped, cancelled`; part-paid is derived | lending.md §4.4 adds `part_paid` and `waived` as statuses | **Differs.** Q11 |
| Allocation | reuse `payments_allocation` with a `schedule_due` target | lending.md §4.4: a `due_allocation` with a **component** column (principal, interest, fee) | **Differs.** Lending needs per-component allocation, which `payments_allocation` lacks. Q11 |
| Holiday and closed-day calendar | Not in the first draft | lending.md §16.4 item 6; library.md §4.12 | **Adopted** as a shared primitive (§1.4) |
| Held deposit | Core concept needed (Q1) | library.md §4.11 has a `library_deposit` table. hospitality.md §6 records the deposit "as an advance". gym.md mentions advance deposits | **Three local workarounds for one concept.** This strengthens Q1. |
| Check-in hook | policy hook registered by the vertical (§4.5) | gym.md §15.4: "context resolver", the same idea | **Agreed** |
| Hotel guest arrival | a booking status, not engine 3 | gym.md §15.4 suggests a check-in with room context | **Differs, minor.** This doc keeps stay check-in in bookings, because a stay has a folio and a range and a visit has neither. |
| Booking conflict rule | lock plus overlap query; `btree_gist` by ADR | hospitality.md §15.4: per-slot rows (`resource_night`, generic `slot_key`) with a plain **unique constraint** | **Alternative adopted** into §3.4. It needs no extension. |
| Library title holds | a queue, not bookings | hospitality.md mentions library holds as a possible engine consumer | Library research to confirm |
| Reading-room seats by shift | not in the first draft | library.md §4.14: seat × shift × date range, with no overlap | **Adopted** as the `shifts` time mode (§3.3) |
| Monthly shared-room housing | rent candidate, not hospitality | hospitality.md §1: goes to recurring dues. GST-exempt at ≤ ₹20,000 per person per month for stays of 90+ days | **Agreed** |

---

## 1. Shared primitives (used by more than one engine)

These should live once, in core. Probably `apps/common/recurrence.py` and `apps/common/periods.py`
(PROPOSED).

### 1.1 Recurrence rule

A small, typed value object with no dependency (no `dateutil.rrule`, per ADR-021):

| Field | Values | Used by |
|---|---|---|
| `freq` | `once`, `daily`, `weekly`, `monthly`, `yearly` | all |
| `interval` | integer ≥ 1 (every 2 weeks, every 3 months = quarterly, every 6 = half-yearly) | all |
| `by_weekday` | set of Mon–Sun (weekly: Mon, Wed, Fri classes; daily delivery skipping Sunday) | bookings series, attendance sessions, delivery |
| `by_month_day` | 1–31 or `last` | dues (rent on the 5th, or month-end) |
| `anchor` | a date (first occurrence) | all |
| `count` or `until` | end after N occurrences, or on a date, or open-ended | all |
| `explicit_dates` | a list of dates, which replaces the rule (custom instalments) | dues |

**Month-end clamping.** Day 31 in a 30-day month falls on the 30th. Day 29–31 in February falls on
the last day of February. The next month returns to the anchor day, so the rule does not drift.
Rent due on the 31st is due on 28 Feb and 31 Mar, not 28 Mar.

All dates are in the **tenant's timezone** (the same rule as LED-10's void dating).

### 1.2 Period

A due, a session or a booking is *for* a period: `[start, end)` as dates, plus a label ("Oct 2026",
"Q3 FY 2026-27", "12 Oct – 11 Nov"). Statements, receipts and reminders print the label, so a
merchant's customer reads "Rent for Oct 2026" and not a UUID.

### 1.3 Money rounding

Every computed amount (pro-rata, penalty, interest) is rounded to **₹1 by default** using
half-up. The tenant can choose ₹0.01. The rounding difference is never carried silently: the last
instalment of a fixed-total plan absorbs it, so Σ instalments = total exactly.

### 1.4 Tenant calendar (closed days and holidays)

- Weekly closed days, plus dated closures with a reason. Lending (collection days), library (fine
  days exclude closures) and gym (freeze on closure) all asked for it.
- Engines consult it through one function, for example `is_open(tenant, date)`.
- Each plan or group chooses what a closed day does:
  - move the due to the next open day;
  - skip it;
  - ignore the calendar.

---

## 2. Engine 1: recurring dues and schedules (PROPOSED)

### 2.1 What it is for

Anything where a party is expected to pay amounts on dates, and the tenant wants to see what is
coming, what is due, what is overdue and what was collected:
- gym memberships;
- library membership fees;
- coaching fees;
- rent;
- society maintenance (later);
- hotel long-stay billing;
- lender collection plans;
- venue advances;
- daily delivery bills.

### 2.2 Entities (PROPOSED)

| Entity | Purpose | Key fields |
|---|---|---|
| `schedules_plan` | A reusable template the tenant defines once: "Gym monthly ₹1,200", "JEE course ₹60,000 in 3 parts", "Flat 2B rent" | `module`, `name`, `mode` (§2.4), `recurrence`, `amount_rule` (§2.5), `proration` (§2.6), `grace_days`, `penalty_rule` (§2.7), `pause_rule` (§2.8), `tax` (optional, §2.10), `heads[]`, `active` |
| `schedules_schedule` | One party on one plan, for one subject | `party_id`, `plan_id` (a snapshot of the plan's terms is copied, so a later plan edit does not rewrite running schedules), `subject_type`/`subject_id` (the membership, loan, tenancy or enrolment), `start_on`, `end_on` (nullable), `status` (`active`, `paused`, `ended`, `cancelled`), `ended_reason` |
| `schedules_due` | One instalment | `schedule_id`, `seq`, `period_start`, `period_end`, `period_label`, `due_on`, `amount`, `heads` (breakdown), `status` (§2.3), `posted_entry_id` (nullable), `settled_amount` (a cache, like `unallocated_amount`) |
| `schedules_adjustment` | Anything that changes what a due asks for: penalty, waiver, discount, pro-rata credit | `due_id`, `kind` (`penalty`, `waiver`, `discount`, `proration`, `refund`), `amount` (signed), `reason`, `actor`, `posted_entry_id` |
| `schedules_pause` | A freeze window | `schedule_id`, `from_on`, `to_on`, `reason`, `effect` (`shift` or `skip`) |

Allocation of payments to dues reuses **`payments_allocation`** with `document_type='schedule_due'`
registered in `payments/services/targets/`. That is the extension point the payments module's
docstring names. There is no second allocation table.

### 2.3 Due status

```
scheduled ──(due_on reached, daily run)──▶ due ──(due_on + grace passed)──▶ overdue
    │                                      │                                  │
    │                                      └──────(fully allocated)──────┬────┘
    │                                                                    ▼
    ├──(schedule paused, effect=skip)──▶ skipped                        paid
    └──(schedule ended/cancelled before due_on)──▶ cancelled
due/overdue ──(cancelled after posting)──▶ cancelled  (the posting is reversed, never deleted)
```

- **`scheduled` dues are not debts.** They are not in any balance. They can be regenerated freely
  (a plan change, a pause, a changed end date) because nothing has posted.
- **`part_paid`** is not a status. It is `settled_amount > 0` on a `due` or `overdue` row, so
  aging and filters keep one status column (the same reasoning as canon §0.7's two ledger statuses).

### 2.4 The two posting modes: the most important decision in this engine

| Mode | Meaning | Who uses it | What posts to the ledger |
|---|---|---|---|
| **`charge`** (charge on due) | Each due **creates** a receivable on its due date | Gym (recurring batch fees), library fees, coaching, rent, maintenance, long stays, daily delivery | On `due_on`, the due **raises a document** (a sales invoice, or an estimate or bill of supply per the tenant's `default_kinds`), which posts through LED-10 as documents do today (Q3; gym.md §15.3 proposes the same). The fallback, if Q3 says no, is one ledger entry per due: `entry_type='schedule_due'` (new), debit, dated `due_on`, source `('schedule_due', due.id)`. Penalties post as their own entries (`entry_type='penalty'`, new). |
| **`expectation`** (collection plan) | The debt **already exists** in the ledger (a loan given as "You gave", or an event total invoiced). The dues say *when* it is expected back. | Lending, venue balances after an invoice | **Nothing** for the instalment itself. Only charges that add to the debt post: interest (`EntryType.INTEREST` already exists), penalty, and fees. Payments allocate against dues to show on-time or late, while the ledger balance moves by the payment as it does today. |

**Why two modes.**
- In `charge` mode, posting a loan's instalments would count the principal twice: once at
  disbursal, again at every EMI.
- In `expectation` mode, gym fees would never appear in the balance, and the reminders list (which
  reads the ledger) would never show them.
- One engine with one flag keeps a single due and collection model while respecting the ledger's
  meaning.

**Posting rules (both modes).**
- The **daily run** (a `platform_job` per tenant, from `run_scheduler`) moves `scheduled → due` for
  every due with `due_on ≤ today`.
- **Idempotent.** A missed day or a rerun posts the missed dues with their **own** `due_on` dates,
  never today's. The key is `(source_type, source_id, entry_type)`, the rule LED-10 BR-1 already
  enforces.
- **Backdated start.** Creating a schedule that starts 3 months ago generates 3 past dues. The UI
  shows them and asks for confirmation before the first post: "This adds 3 dues totalling ₹3,600 to
  Ramesh's balance." The schedule saves only after that.
- **Future dues never post early.** "Post all 12 months now" is not offered. Advance payment
  (§2.9) is how a customer pays ahead.
- **Credit limit.** A `charge`-mode due is not refused by the party's credit limit, because it is an
  agreed charge and not a new sale. The limit is shown as crossed. **Open question Q5.**

### 2.5 Amount rules

| Rule | Example | Module |
|---|---|---|
| `fixed` | ₹1,200 every month | gym, rent, coaching monthly |
| `total_split` | ₹60,000 in 3 instalments of 40/30/30%, or equal parts; the last absorbs rounding | coaching course, venue |
| `per_unit` | area 950 sq ft × ₹3.20 + fixed heads | society (later), rent per bed |
| `from_log` | Σ(quantity × rate) from engine 3's marks in the period | daily delivery |
| `supplied` | The vertical supplies each due's amount (a calculator the vertical owns) | **lending** (EMI, reducing or flat interest): the lending module computes and the engine stores |
| `escalation` | +5% every 11 or 12 months from the anchor, or a set new amount from a date | rent, gym price change |

**Heads.** A due can carry named parts (tuition ₹4,000 + exam ₹500 + transport ₹800). Heads are
labels on one due. They are printed on the receipt and summed in reports, but they are not
separate ledger lines. The exception is when heads have different tax treatment (§2.10).

### 2.6 Pro-rating (start, end and change mid-period)

A plan chooses **one** policy for each event:

| Event | Policies |
|---|---|
| **Join mid-period** | `full` (charge the whole first period) · `by_days` (amount × remaining days ÷ days in period) · `half_rule` (full if joining before day N, else half) · `next_period` (first due at the next anchor, nothing now) · `align_to_join` (periods run from the join date, so no pro-rata) |
| **Leave mid-period** | `no_refund` · `by_days` refund of the unexpired part · `by_sessions` (the unattended share of a session-count plan, using engine 3) · `custom` amount with a reason |
| **Change plan mid-period** | end the old schedule with its leave policy, and start the new one with its join policy. This is the **only** way to change terms: no in-place edit of a posted due. |

- **Refunds** post as `schedules_adjustment(kind='refund')`, which writes a credit entry
  (`entry_type='refund'`, new, or `manual_got`, **Q6**). The money going back is a payment *made*
  through the payments app.
- The coaching guideline requires a pro-rata refund within 10 days of leaving
  (candidates §3.1). So the leave flow shows **"refund due by <date>"** and puts it on the
  dashboard until the payment is recorded.
- Days are counted in calendar days of the period, including the leave date. The formula and its
  rounding (§1.3) are printed on the settlement slip, because the customer will check it.

### 2.7 Grace and penalties

- `grace_days` (default 0) moves a due from `due` to `overdue`. Reminder buckets and aging use
  `overdue`.
- **Penalty rules** (one per plan, optional):

| Kind | Computation | Cap options |
|---|---|---|
| `flat_once` | ₹100 once the due becomes overdue | none |
| `percent_once` | 2% of the unpaid amount, once | max ₹ |
| `per_day` | ₹10 per overdue day, counted from end of grace | max ₹, or max days |
| `simple_interest` | unpaid × rate p.a. × days ÷ 365, **never compounded** | a hard rate ceiling set by the tenant (for example 21%, which Maharashtra society bye-laws allow, candidates §3.3) |

- **When penalties post.**
  - Once-off penalties post on the day they arise.
  - Accruing penalties (`per_day`, `simple_interest`) are **computed live for display** and
    **posted when the due is settled**, or at a period close the tenant chooses (monthly). That
    avoids a ledger line per day.
  - The live figure is labelled "late fee so far", and it is not in the balance until it posts.
- **Waiver.** Any penalty can be waived, in part or in full, with a reason (audit log, a codename
  permission `schedules.penalty.waive`). A waiver of a posted penalty reverses it; it does not edit
  it.
- **The engine stores rates and caps. It does not know the law.** It never says a rate is legal.
  The lending research must set what the lending module must refuse (state money-lending act
  ceilings), and that is **enforced by the lending module's validation**, not by the engine.
- **Penalties never apply to a paused period or to a `skipped` due.**

### 2.8 Pause (freeze, vacation, break)

- A schedule can be paused for a window. The plan sets `max_pause_days_per_year`, `min_pause_days`
  and `max_pauses`, plus whether a fee applies (a "freeze fee" is its own due).
- `effect=shift` (gym freeze): every future due and the `end_on` move by the pause length. The
  member gets the days back.
- `effect=skip` (daily delivery, coaching holiday month): dues whose period falls entirely in the
  window become `skipped`. Partial periods pro-rate by the join and leave `by_days` rule.
- A pause is recorded before or during the window, never after it. A retroactive pause over dues
  that already posted is a **cancel-and-reverse** of those dues (with a reason), not a pause.
- **Pause posts nothing.** Reminders and penalties ignore paused schedules.

### 2.9 Advances, credits and **held deposits**

- **Advance.** A payment with no due to allocate to leaves `unallocated_amount` on the payment, as
  today. When the daily run posts a new due for that party, it **auto-allocates** open advances,
  oldest first, if the plan says `auto_apply_advance` (default on). The receipt for the original
  payment does not change. The due's detail shows "paid from advance of 3 Sep".
- **Held deposit: a gap in the core, and a question for the architecture agent (Q1).**
  - Rent deposits, gym and library refundable deposits, hotel advances held against damages, and
    venue security deposits are money the tenant **holds and must return**.
  - Recorded as "You got" today, it (a) shows the party as in advance, and (b) would be
    auto-allocated to the next due. Both are wrong.
  - Options for the architect:
    - (a) a `bucket` column on `ledger_entry` (`main` | `deposit`), with the party balance and
      allocation looking only at `main` and a second cached figure for `deposit`;
    - (b) a separate "held" party balance maintained by the ledger;
    - (c) a deposits table in core that posts nothing until it is applied or refunded, which breaks
      "money always goes through the ledger".
  - **This research recommends (a).** The parallel docs already show the cost of not deciding:
    library proposes its own `library_deposit` table, hospitality records the deposit "as an
    advance" and must keep it out of income by report logic, and gym mentions advance deposits.
    That is three modules and three answers (§0.3).
  - Whichever is chosen, the flows are:
    - *receive deposit*;
    - *apply deposit to dues* (at exit, an explicit act with a slip);
    - *deduct for damage* (it becomes income, posted as a charge and applied);
    - *refund balance* (a payment made).

### 2.10 Tax on dues

- Coaching fees, commercial rent, society maintenance above threshold, gym memberships and hotel
  stays can all carry **GST** when the tenant is registered.
- A raw ledger entry is not a tax invoice.
- **Q3 for the architect:** for a plan marked taxable, does the daily run
  - (a) issue a **sales document** (invoice kind) through a sales seam, which then posts via LED-10
    as invoices do today; or
  - (b) post a `schedule_due` entry and issue a tax invoice on demand?
- This research leans to **(a) for every tenant**, with the document kind taken from the existing
  preset `default_kinds` (unregistered → estimate, composition → bill of supply, regular →
  invoice). The numbering, HSN/SAC, place of supply and GST summary report then stay correct
  without a second tax path. Gym research reached the same conclusion independently (gym.md §15.3,
  where a `schedule_line` carries a `sales_document_id`).
- It needs a **public sales seam** (vision §3 rule 2), because engines are core and core must not
  import `sales`. The dependency direction must be settled by ADR. One route is a registered
  "document issuer" callback, the pattern `purchases.services.payment_seam.register_void_listener`
  already uses.

### 2.11 What is *not* engine 1

- **Library overdue fines** are charged per late *issue* (days late × rate per item). They are an
  event on a loan of a book, not a recurring due. The library module posts them itself through
  `post_source_entry`. It may reuse the `per_day` calculator from §2.7 as a function.
- **Hotel folio charges** (room nights, extras) are posted by hospitality. Only a long-stay monthly
  arrangement uses a schedule.
- **A membership's validity** (active until, frozen, extended, upgraded) is the gym's (and the
  library's) own record, per gym.md §15.3. A prepaid term is one invoice. The engine is used only
  when that money comes in instalments (`expectation`) or recurs per period (`charge`).
- **Interest calculation for loans** belongs to lending (the `supplied` amount rule). The engine
  stores, posts and reminds.

### 2.12 Reminders, statements and reports

- Dues feed the **existing reminders list** (`/ledger/reminders`), with buckets *due in 3 days*,
  *due today*, *overdue 1–7*, *8–30* and *30+*.
- The prepared text names the period label and the exact amount. It is shared through
  `UbShareSheet` (`wa.me` and `sms:`). **Nothing is sent by the product.**
- Party statement: posted dues appear as ledger lines labelled with the period. Upcoming
  (`scheduled`) dues are **not** in the statement. A separate "upcoming" block can be printed on
  request.
- Reports (PROPOSED):
  - dues register (by period, status and plan);
  - collection vs expected (a month's expected dues vs collected, by plan), which is the lending
    officer's and the landlord's main question;
  - overdue list (party, days, amount, late fee so far);
  - expiring soon (memberships ending in N days, for renewal);
  - refunds due.

### 2.13 Fixed (engine) vs configured (module)

| Fixed in the engine | Configured per module or plan |
|---|---|
| Entities, the due state machine, the daily run, idempotent posting, reversal on cancel | Posting mode (`charge` or `expectation`) |
| Recurrence and month-end clamping, rounding, period labels | Frequency, anchor, count or until |
| Allocation via `payments_allocation`, advance auto-apply | Amount rule, heads, escalation |
| Penalty calculators (four kinds), cap enforcement, "never compound" | Grace days, penalty kind, rate, cap |
| Pause mechanics (`shift`, `skip`), limits enforcement | Pause allowed, limits, freeze fee |
| Pro-rating calculators and settlement slip | Join, leave and change policies |
| Reminder buckets and the share text frame | Wording per module ("membership", "rent", "instalment", "fee") |
| Audit of every adjustment and waiver | Who may waive (permissions per module) |
| No legal judgement | The lending module's statutory ceilings, the coaching refund window |

### 2.14 Edge cases the FRDs must cover

1. **Plan edited while schedules run.** Schedules keep their snapshot. An explicit "apply the new
   price from <date>" is an escalation event on the chosen schedules, and it is never retroactive.
2. **Party archived with an active schedule.** Archive is already blocked by a non-zero balance
   (PTY-04). Also block it while a schedule is `active` or `paused`, with the message "End <plan>
   first".
3. **Party merged or deleted.** Schedules follow the party's existing rules. There is no special path.
4. **Payment voided** after it was allocated to a due. The due reopens and the penalty clock resumes
   from its original date, but a penalty is never charged for the days the payment stood.
5. **A due's ledger entry reversed by hand** (LED-03) instead of through the engine. The engine must
   detect it (the posted entry is `reversed`) and mark the due `cancelled` with reason "reversed in
   ledger". Otherwise the two disagree.
6. **The scheduler down for a week.** The catch-up posts every missed due with its own date. Penalty
   accrual uses real dates, so the result equals an on-time run.
7. **Timezone boundary.** A due on the 1st posts at tenant-local midnight, not UTC.
8. **Very long schedules.** Materialise dues only for a rolling window (for example 24 months, or the
   whole fixed-count plan), and extend it in the daily run. This keeps lists and indexes small.
9. **Two schedules for one party** (gym plus locker rent). They are independent. Allocation of a
   payment across them is oldest-due-first unless chosen.
10. **Zero-amount dues** (a free month). They are allowed, post nothing and show as `paid`.

---

## 3. Engine 2: bookings and resources (PROPOSED)

### 3.1 What it is for

Anything where a party holds a **resource** for a **time range** and two parties must not hold it
at once, or not more than its capacity:
- hotel rooms (nights);
- gym classes and trainer sessions (slots);
- reading-room seats (days or months);
- halls and lawns (days or sessions);
- equipment hire (quantity × days);
- rental units (months, candidate rent);
- demo classes.

### 3.2 Entities (PROPOSED)

| Entity | Purpose | Key fields |
|---|---|---|
| `bookings_resource_type` | A kind of thing: "Deluxe room", "Yoga class", "Hall A", "Plastic chairs", "Reading seat" | `module`, `name`, `time_mode` (§3.3), `capacity_mode` (§3.4), `default_capacity`, `check_in_time`/`check_out_time` (nights), `slot_minutes` (slots), `hold_minutes` (default hold expiry), `cancellation_policy` (§3.7) |
| `bookings_resource` | One unit: "Room 101", "Hall A", "Seat 14", "Chairs (stock 200)" | `type_id`, `label`, `capacity`, `status` (`available`, `out_of_service` with a date range, `retired`), `attributes` (floor, AC, beds; module-defined keys) |
| `bookings_availability` | When a resource or type can be booked | weekly opening hours, date exceptions (closed on a date), blackout ranges |
| `bookings_booking` | A party's claim | `party_id`, `type_id`, `resource_id` (nullable until assigned), `quantity`, `range` (`[start, end)`), `status` (§3.5), `hold_expires_at`, `source` (walk-in, phone, the tenant's staff), `subject_type`/`subject_id` (the vertical's stay, reservation or class enrolment), `quoted_amount` (a snapshot; the price is the vertical's), `notes`, `series_id` (recurring) |
| `bookings_series` | A recurring booking (every Mon and Wed 7 am, for 3 months) | a `recurrence` (§1.1), generating bookings in a rolling window |

### 3.3 Time modes

| `time_mode` | Unit | Range semantics | Example |
|---|---|---|---|
| `nights` | date | `[check-in date, check-out date)`. The check-out day is free for the next arrival. Check-in and check-out *times* are type settings, used for early and late fees. | hotel rooms, hostel beds by night |
| `slots` | time | fixed slot grid from `slot_minutes` and opening hours | classes, courts, trainer sessions, demo classes |
| `span` | datetime | free start and end within availability | a hall 6 pm–11 pm, equipment 3 days |
| `days` | date | whole days, inclusive | a hall for a 2-day wedding, reading seats |
| `open_ended` | date | `[start, null)` until ended; a long-lived assignment | a rental unit, a monthly seat, a hostel bed on monthly rent |
| `shifts` | date range × named daily window | a seat for the "Morning 6–12" shift from 1 to 31 Oct. Conflict only if the dates **and** the shifts overlap (a full day covers several shifts). | reading-room seats (library.md §4.14), gym batch slots held monthly |

### 3.4 Capacity modes and the conflict rule

| `capacity_mode` | Rule | Example |
|---|---|---|
| `exclusive` | At most one active booking per resource per overlapping range | a room, a hall, a unit |
| `shared` | Σ `quantity` of active bookings overlapping any instant ≤ resource `capacity` | a class of 20, a reading room of 40 seats (as a pool) |
| `pooled_by_type` | Book the **type** ("2 Deluxe rooms for 12–14 Oct"). The count of active type bookings overlapping any night ≤ the count of available resources of that type. A specific room is assigned later (at check-in or earlier). | hotel inventory by category |
| `stock` | quantity out ≤ stock on every day of the range | chairs, tents, generators |

**Active** means status in {`hold` (not expired), `confirmed`, `checked_in`}.

**Enforcement (PROPOSED, the architect to decide).**
- **In the service.** Lock the resource row (or the type row for `pooled_by_type`) `FOR UPDATE`, run
  the overlap query, then insert. This is the lock discipline the ledger already uses (party lock
  first).
- **In the database, as defence** where it can be expressed: for `exclusive`, a Postgres
  **exclusion constraint** on `(resource_id WITH =, range WITH &&)` filtered to active statuses.
  - It needs the `btree_gist` extension. That is a contrib extension shipped with Postgres 16, not a
    Python package, but it is new infrastructure, so it **needs an ADR** under ADR-021's spirit.
  - Without it, the service lock is the only guard, and a second writer (an import, psql) can
    double-book.
- **Alternative with no extension** (hospitality.md §15.4): materialise one row per resource per
  **slot key**, where the slot key is a night, a day, a shift-day or a slot start. A plain
  `UNIQUE (resource_id, slot_key)` over active rows then forbids double booking, and a
  `pooled_by_type` or `stock` count becomes a count of rows per slot key.
  - It fits `nights`, `days`, `slots` and `shifts`, which are the discrete modes.
  - It does not fit a free `span` (a hall 6 pm–11 pm), which would need 5-minute buckets or the
    range constraint.
  - **This research now leans to slot rows for the discrete modes, and to the lock alone for
    `span` until an ADR decides on `btree_gist`.**
- Capacity modes (`shared`, `pooled_by_type`, `stock`) cannot be expressed as an exclusion
  constraint. For those the service lock (or the slot-row count) is the rule, and a nightly
  integrity check reports over-capacity instants, like `manage.py recalc_balances` and
  `check_balances` do for balances.

### 3.5 Booking status

```
hold ──(confirm: advance recorded or staff confirms)──▶ confirmed ──(check-in)──▶ checked_in ──(check-out / end)──▶ completed
  │                                                       │   │                      │
  └─(hold_expires_at passes, daily/15-min job)─▶ expired  │   └─(no-show rule)─▶ no_show
                                                          └─(cancel)─▶ cancelled   (fee per policy, §3.7)
checked_in ──(extend / move resource / early check-out)──▶ checked_in   (range or resource changes, re-checked for conflict)
```

- **Holds.** A tentative booking blocks availability until `hold_expires_at` (the type default, for
  example 30 minutes for a class and 48 hours for a hall until the advance arrives).
  - Expiry is by a `platform_job`. Availability queries also treat an expired hold as free even if
  the job has not run yet, so correctness never waits on the scheduler.
  - A hold can be extended by staff with a new expiry.
- **Check-in and check-out** are statuses of the booking.
  - The **stay** check-in for hospitality is here.
  - A gym member walking in is **engine 3**, not a booking, unless the visit is to a booked slot.
    Then engine 3's mark references the booking.
- **No-show.** After `start + no_show_after` (a type setting) a confirmed booking can be marked
  no-show, manually or by the job. Any fee follows the cancellation policy.
- **Move and extend.** Changing the resource or the range is a re-validation under lock. History is
  kept as an audit row, and the booking id stays the same.

### 3.6 Money and bookings

**A booking posts nothing by itself.** It is a claim on time, not a debt. Money is the vertical's
decision, through the ledger:

| When | Posting | Who |
|---|---|---|
| Advance taken at hold or confirm | a payment received (payments), left unallocated or held as a deposit (§2.9 Q1) | vertical, via payments |
| Charge at confirm | e.g. a hall booking invoiced on confirmation | vertical, through sales or `post_source_entry` |
| Charge per night | hotel night audit posts room charges per night to the folio | hospitality |
| Charge at check-out | settle the folio | hospitality |
| Cancellation fee | per policy, posted as a charge with the booking as source | vertical, using the engine's policy calculator |
| Instalments to the event date | an engine-1 schedule in `expectation` mode against the invoice | venues |

The engine provides `quoted_amount` storage and the cancellation calculator. The **rate** (weekday
and weekend, season, per person, per hour) is computed by the vertical and stored as a snapshot.

### 3.7 Cancellation policy (configured, calculated by the engine)

A list of tiers, for example:
- free until 48 h before start;
- 50% of the first night, or of the quoted amount, between 48 h and 24 h;
- 100% within 24 h or on no-show.

The engine returns the fee and the tier. The vertical posts it. Staff can override with a reason
(audit, permission `bookings.cancel.override_fee`).

### 3.8 Views the engine must support (UI is per module, data is shared)

- **Availability search:** type, range and quantity give free resources or free count, with the
  reason when not free (booked, out of service, closed).
- **Grid** ("tape chart"): resources × dates (nights, days) or resources × time (slots). It is
  read-only data from the engine, and each vertical renders it with design-system components.
- **Day sheet:** arrivals, departures, in-house (nights). Today's slots with filled and free counts
  (slots).
- **A party's bookings**, on the party page, from every module.

### 3.9 Fixed vs configured

| Fixed in the engine | Configured per module or resource type |
|---|---|
| Entities, status machine, hold expiry, conflict rule per capacity mode, locking | Time mode, capacity mode, capacity |
| Availability evaluation (hours, exceptions, blackouts, out-of-service) | Opening hours, slot length, check-in and check-out times |
| Series generation from the shared recurrence rule | Hold duration, no-show threshold |
| Cancellation fee calculator, audit of moves and overrides | Cancellation tiers, overbooking allowed (default **no**) |
| Integrity check for over-capacity | Resource attributes (keys defined by the module) |
| Party-level "all bookings" read | Rates and folio (entirely the module's) |

### 3.10 What is *not* engine 2

- **Library holds and reservations on a title** ("next copy of *Wings of Fire*") are a **queue**:
  first in line when any copy returns, with no time range. The library module keeps its own queue.
  The research recommends **not** forcing it into bookings. The library researcher should confirm.
- **Clinic appointments** are out of scope (candidates §3.4) unless a later CR allows slot bookings
  with name and phone only.
- **Staff rosters and shifts** are not bookings, and they are not in any current module.

### 3.11 Edge cases for the FRDs

1. **Back-to-back nights.** Check-out 12 Oct and check-in 12 Oct on the same room is not a conflict
   (half-open range).
2. **A resource taken out of service** with future bookings. The service refuses unless the bookings
   are moved first, and it lists them.
3. **Pooled type overbooked by an out-of-service room.** Taking room 101 out of service while
   Deluxe is fully booked must be refused, or it must warn and list the nights that go over.
4. **A long `open_ended` assignment and a short booking** on the same resource (a hostel bed on
   monthly rent that someone tries to book for a night). This is a conflict. `open_ended` blocks
   everything from its start.
5. **Series edits:** this occurrence, this and following, all. The same three choices every calendar
   offers. Past occurrences are never rewritten.
6. **DST** does not apply in India. Store `timestamptz` anyway, and render in the tenant timezone.
7. **Two staff booking the last room at once.** The lock serialises them, and the loser gets a 409
   carrying the reason, like the credit-limit refusal.

---

## 4. Engine 3: check-ins and attendance (PROPOSED)

### 4.1 What it is for

Recording that a party **was there** (or received something) on a date:
- gym visits and class roll-call;
- coaching batch attendance;
- library visits (optional);
- daily delivery quantities (watch list);
- session-pack consumption (a 10-class pack goes down by one per attended class).

**Not for:**
- hotel stay check-in (a booking status, §3.5);
- staff attendance and payroll (team members are users, not parties, and payroll is not a module).

### 4.2 Entities (PROPOSED)

| Entity | Purpose | Key fields |
|---|---|---|
| `attendance_group` | Who is expected: a batch, a class, a delivery route | `module`, `name`, `subject_type`/`subject_id`, `recurrence` for sessions (optional), `mark_kind` (§4.3) |
| `attendance_group_member` | A party in a group from a date to a date | `group_id`, `party_id`, `from_on`, `to_on` |
| `attendance_session` | One occurrence: "Batch A, 12 Oct 7 am" | `group_id`, `starts_at`, `ends_at`, `status` (`scheduled`, `held`, `cancelled`), `booking_id` (optional link to engine 2) |
| `attendance_mark` | One party's mark | `session_id` (nullable for open visits), `party_id`, `on_date`, `status` **or** `quantity`, `check_in_at`, `check_out_at`, `method` (§4.4), `marked_by`, `note` |
| `attendance_entitlement` | A countable allowance, not money: "12 classes in 30 days", "20 visits" | `party_id`, `subject_type`/`subject_id` (the membership), `total`, `used` (a cache), `valid_from`, `valid_to` |

**Unique keys** (proposed):
- `(session_id, party_id)` for session marks;
- `(party_id, group_id, on_date)` for daily quantity marks;
- open visits allow several per day, each with its own check-in time.

### 4.3 Mark kinds (configured per group)

| `mark_kind` | Values | Example |
|---|---|---|
| `presence` | `present`, `absent`, `late`, `excused`, `leave` | coaching roll-call |
| `visit` | a check-in (and optional check-out) timestamp; no absent marks | gym walk-in, library visit |
| `quantity` | a decimal quantity and unit (litres, meals, cans), default from the member's standing order; `0` = not delivered | daily delivery |

### 4.4 How marks are captured (v1 is staff-operated)

1. **Roll-call.** The session's expected list with one tap per student. Default all present or all
   absent (a group setting), and "mark all". This is the coaching screen.
2. **Search and tap.** The front desk types a name or phone and taps check in. This is the gym
   desk.
3. **Standing order with exceptions.** Quantities pre-fill from the member's default. Staff edit
   only the exceptions (away, extra). This is daily delivery.
4. **Later, not v1.** Member self check-in by scanning a QR at the desk needs a member-facing sign-in
   or a kiosk session, and neither exists. Biometric or face devices need integrations and new
   dependencies (an ADR). **Never claim offline mode** (capabilities doc).

### 4.5 Entitlement checks at check-in (engine 3 asks, the vertical decides)

At check-in the engine calls a **policy hook the vertical registers** (the listener pattern of
`payment_seam.register_void_listener`). It gets `(party, group or subject, date)` and returns one of:
- `allow`;
- `warn(reason)`, for example "membership ended 3 days ago" or "₹1,200 overdue";
- `block(reason)`.

- The gym decides from its membership and engine-1 dues status. Coaching may only warn.
- The engine **never** reads dues itself, which keeps engines 1 and 3 independent.
- Staff may override a `block` with permission `attendance.override`, and it is audited.
- **Entitlement consumption.** When a mark is `present` or `visit` and an entitlement applies,
  `used += 1` under a row lock. Unmarking gives it back. Expiry is by date. A 0-left entitlement
  returns `block` or `warn` per the vertical's hook.

### 4.6 Corrections

- Marks are **editable** within a window (default: the same day, or until the session's register is
  closed), and every change is audited with before and after.
- After the window, editing needs `attendance.mark.edit_closed`.
- Marks are not money, so the ledger's never-edit rule does not apply. **But** a `quantity` mark
  that has already fed a posted `from_log` due (§2.5) is locked. Changing it requires cancelling and
  reissuing that due (a reversal), so the bill and the log never disagree.

### 4.7 Reports and outputs

- **Monthly register:** parties × days grid, with P, A, L and E or quantities. It prints through the
  print pipeline with the tenant's name only, and it is the document a coaching centre hands a parent.
- **Attendance %** per party per group per period. Threshold list (below 75%).
- **Absent today** or **absent N sessions in a row.** A share text to the guardian, sent by the
  tenant.
- **Not visited in N days** (gym churn risk). The last visit is shown on the party page.
- **Peak hours** (visits per hour), for the gym.
- **Delivery sheet:** today's quantities by route, and the month's totals per member (these feed
  the `from_log` due).

### 4.8 Fixed vs configured

| Fixed in the engine | Configured per module or group |
|---|---|
| Entities, uniqueness, capture flows (roll-call, search and tap, standing order) | Mark kind, status labels, default (all present or all absent) |
| Session generation from the shared recurrence | Session timetable, group membership dates |
| Entitlement counters, locking, consume and give-back | Entitlement size and validity (from the vertical's plan) |
| Policy hook call and override audit | The hook itself (gym blocks, coaching warns) |
| Correction window and permission | Window length |
| Registers and % reports | Thresholds (75%), churn days |
| Lock of quantity marks that fed a posted due | Unit and rate for quantity marks |

### 4.9 Edge cases for the FRDs

1. **A student joins a batch mid-month.** Sessions before `from_on` are "not enrolled", not absent,
   so the % excludes them.
2. **A session cancelled** (teacher absent). No marks, and it is excluded from %. Entitlements are
   not consumed.
3. **Two check-ins in one day** at the gym. Two visits by default. The group may set "one per day".
4. **Check-out never recorded.** The visit is open. The daily job closes it at closing time and marks
   it "auto-closed".
5. **Party archived.** Past marks stay. The party is removed from future sessions from the archive
   date.
6. **Minors.** The guardian is the party contact that the share text goes to (candidates §3.1). No
   photos, biometrics or notes beyond attendance in v1.

---

## 5. Onboarding and navigation: picking a business type and turning modules on (PROPOSED)

### 5.1 What the code does today

- A four-step wizard (`/onboarding/step/[n]`): name, **business type**, state, GSTIN.
- `BusinessType` is `retail`, `wholesale`, `distribution`, `services`, `trader`, `manufacturer`,
  `professional`, `food` or `other`.
- `presets.preset_for(business_type)` supplies the defaults written once at onboarding.
- `_seed_modules` sets `enabled_modules = (BASE_MODULES ∪ {inventory if the preset says}) ∩
  partner.allowed_modules ∩ plan.modules`.
- **Binding rule (PLT-03 FR-8, enforced by a test): nothing may branch on `Tenant.business_type`.**
  It is a label. Presets write editable rows once. After onboarding, only `enabled_modules` and
  settings decide behaviour.
- Settings allow turning modules on and off. The dependency check refuses a module whose
  dependencies are off. `module_has_data` refuses turning off a module with records.
- Navigation is data (`sidebarConfig.ts`). `useNavigation()` intersects it with `enabled_modules`
  and permissions. An item that is not `ready` is not rendered. Modules not enabled simply do not
  exist in the menu.

The proposal below **keeps every one of those rules** and extends the data.

### 5.2 Proposed onboarding flow

**Step 2 becomes "What kind of business or organisation is this?"**
- It offers a list of plain-word types grouped by what the business does.
- **Only types whose modules are live are listed** (the in-app rule: no unbuilt features).
- Today that is the shop types. When the gym module goes live, "Gym or fitness centre" appears.

| Group | Business types (PROPOSED additions in bold) | Suggested modules (preset) | Party label |
|---|---|---|---|
| Shop and trade | Retail, Wholesale, Distribution, Trader, Manufacturer, Food | Shop and billing (+ inventory per preset) | Customer, Supplier |
| Services | Services, Professional, **Repair and service** | Shop and billing (inventory off) | Client, Supplier |
| Money | **Lender or finance records** | Lending | Borrower, Lender |
| Membership | **Gym or fitness centre**, **Library or reading room** | Gym, or Library | Member |
| Education | **Coaching or tuition** (candidate) | Coaching | Student (guardian as contact) |
| Stays and property | **Hotel, lodge or guest house**, **Rental property or hostel** (candidate) | Hospitality, or Rent | Guest, Tenant |
| Other | Other | Shop and billing | Customer, Supplier |

**New step "Choose what to keep records of"** (between type and state, or inside step 2):
- A checklist of **live** modules, each with one line of plain description.
- Pre-ticked from the preset. The user can tick more or untick.
- The **core is always on** and shown as included, not as a choice.
- Dependencies are **switched on automatically** and shown ("Gym needs Payments, so it is on too").
  This is Odoo's behaviour (candidates §6.2), rather than today's refusal. The refusal stays for the
  settings screen's turn-off path.
- The result is written to `enabled_modules`, intersected with partner and plan as today.
- A **primary module** (the first ticked vertical, or Shop and billing) is written to a tenant
  setting row (PROPOSED key `nav.primary_module`). It is a **setting, not a branch on
  business_type**. The merchant can change it in Settings, and the FR-8 test stays green.
- The **party labels** from the preset are written as editable settings rows, as the existing
  `party_labels` preset does.

**Why a checklist and not type-only.**
- Multi-vertical tenants are the platform's advantage: a coaching centre with a book counter, a gym
  that sells supplements, a lodge with a small shop.
- Square found one business can need several modes (candidates §6.5).
- Zoho's "everything on" produced the heaviest onboarding complaints (candidates §6.1).
- So: few on, chosen by the user, with more found later in Settings.

### 5.3 Engines and `MODULE_DEPENDENCIES`

- Engines are **core apps** with no nav entry of their own.
- **Two options** for the architect:
  - (A) Engines get a `ModuleCode` and appear only in `MODULE_DEPENDENCIES`, e.g.
    `"gym": {"parties", "ledger", "payments", "schedules", "attendance"}`. `_ModuleEnabled("schedules")`
    then guards any engine endpoint. Settings hides engine codes from the checklist and switches
    them with their dependants.
  - (B) Engines are always present, like `ledger`, and only vertical codes gate.
- **This research recommends (A).**
  - The existing dependency and `module_has_data` machinery then protects engine data: a tenant
    cannot turn off the last module that uses schedules while dues are open.
  - `effective_modules` stays the single answer to "is this on".
- Turning a vertical off while its schedules, bookings or marks are open follows `module_has_data`
  ("This feature still has records that need attention"). The engines provide the counts per module
  (`blocking_rows_for_module_off`).

### 5.4 How navigation adapts

Extend the navigation data. Do not branch in components.

1. **Each vertical contributes `NavItemConfig` rows** with its own `module` code. This is already
   the design. For example, gym contributes Members, Plans, Check-in and Memberships due.
2. **Ordering.** Items from the `nav.primary_module` sort first in the `daily` section. The rest keep
   their `order`. A gym-first tenant sees *Check-in, Members, Dues* at the top, and *Invoices* lower.
   A shop sees today's menu unchanged.
3. **Grouping when more than one vertical is on.** Items group under a module heading ("Gym",
   "Shop and billing"). With one vertical, there are no headings, which is today's look.
4. **Bottom navigation on a phone** (max 4 + More). The primary module's `bottomNav` items take the
   slots first. Core items (Parties, Payments) fill the rest.
5. **The parties list gains role filters** from enabled modules (Members, Students, Tenants,
   Borrowers, Guests, alongside Customers and Suppliers). Each vertical's "Members" screen is a
   filtered parties view plus its own columns, never a second contacts table (vision §3). **Q7** asks
   how roles are stored.
6. **The dashboard is a registry of tiles** contributed by enabled modules: *expiring memberships*,
   *today's arrivals*, *rent due this week*, *collections due today*. The primary module's tiles come
   first. Core tiles (to collect, to pay) stay.
7. **Reminders** remain one list across modules (§2.12), filterable by module.
8. **Settings** gets one section per enabled vertical. The engine settings (grace, penalties,
   cancellation tiers) are edited *inside* the vertical's section, in its words, never as a
   separate "Schedules" settings page.

### 5.5 Changing course later

- Turning a module on later runs its preset defaults for that module only (plans, labels,
  dashboard tiles) and does not touch other modules' settings.
- Changing `business_type` still changes only the label (FR-8).
- Changing the primary module only reorders navigation and home.

---

## 6. Open questions for the architecture agent

| # | Question | Why it blocks | Research lean |
|---|---|---|---|
| **Q1** | How is a **held deposit** represented? (§2.9) | Rent, gym, library, hospitality and venues all hold refundable money. Recording it as "You got" corrupts balance and allocation. | A `bucket` on `ledger_entry` (`main` or `deposit`), with a second cached figure on the party |
| Q2 | Engines as `ModuleCode`s in `MODULE_DEPENDENCIES`, or always-on core? (§5.3) | Guards, turn-off safety, entitlement checks | ModuleCodes, hidden from the checklist |
| **Q3** | Does a taxable due become a **sales document**? And how does core call sales without importing it? (§2.10) | Coaching, commercial rent, gym and hotel GST | Yes, through a registered issuer seam |
| Q4 | `btree_gist` exclusion constraint for exclusive bookings? (§3.4) | Double-booking safety against a second writer | Yes, by ADR; the service lock stays primary |
| Q5 | Does a `charge`-mode due respect the party's **credit limit**? (§2.4) | LED-01 refuses writes over the limit inside the transaction | No refusal; show it as crossed |
| Q6 | A refund entry type: a new `refund`, or reuse `manual_got`? (§2.6) | Statement wording, reports | New type |
| **Q7** | How are **party roles per module** stored (member, student, tenant, borrower, guest)? Flags like `is_customer`, a `parties_role` table `(party, module, role)`, or tags? | Every vertical's list screen, and the onboarding labels | A role table; tags stay user-owned |
| Q8 | Do engine records need their own public read endpoints (a party's dues across modules), or are they reached only through vertical endpoints? | API design and `_ModuleEnabled` gating | Shared read endpoints, gated by "any dependant module on" |
| Q9 | Rolling materialisation window for dues and series (§2.14 item 8) | Table size, indexes, the daily run cost | 24 months, or the whole fixed-count plan |
| Q10 | Where does the shared recurrence value object live, and is it persisted as JSON or columns? | Used by all three engines | `apps/common/recurrence.py`; typed columns for the queried fields, JSON for `explicit_dates` |
| **Q11** | Due allocation: extend `payments_allocation` with an optional `component` (lending needs principal, interest and fee), or have a separate `due_allocation` as lending.md §4.4 proposes? And is `part_paid` or `waived` a status or derived? | Two allocation tables would split "what did this payment settle" across two places | Extend `payments_allocation` (a nullable `component`); keep part-paid and waived as derived figures |

---

## 7. Suggested build order (for Phase 4 to confirm)

1. **Shared primitives** (§1): recurrence, period and rounding. Small, pure and heavily tested
   (month-end clamping, leap years).
2. **Engine 1 in `charge` mode with advances.** It unlocks gym, coaching and rent.
3. **Q1 (held deposit).** It unlocks rent move-out and gym and library deposits.
4. **Engine 3, presence and visit kinds**, with the policy hook and entitlements. It unlocks gym and
   coaching.
5. **Engine 1 in `expectation` mode.** It unlocks lending's collection plan.
6. **Engine 2** (nights, exclusive and pooled_by_type first). It unlocks hospitality.
7. **Onboarding checklist and navigation ordering** (§5), shipped with the first vertical to go
   live, because the in-app rule forbids showing any of it before then.

Each step lands with its own tests under the existing gates. A replay check for every cache the
engine adds (`settled_amount`, `used`) follows the `recalc_balances` pattern: a cache is only trusted
when a second route re-derives it.

---

## 8. Sources

External (all accessed **29 Sep 2026**). Detail and more sources are in
[candidates-and-competitors.md §9](candidates-and-competitors.md#9-sources).

| Topic | Source | URL |
|---|---|---|
| Coaching refund within 10 days, pro-rata; minimum age 16 (MoE guidelines, 15 Jan 2024) | India TV | https://www.indiatvnews.com/education/news/ministry-of-education-releases-guidelines-to-regulate-coaching-centers-details-here-2024-01-18-912448 |
| Society arrears interest, 21% simple p.a., never compound (Maharashtra bye-laws 68–69) | LawCrust | https://lawcrust.in/penalty-charges-society-law/ |
| GST on maintenance: ₹7,500 per member per month and ₹20 lakh; 18% on the whole amount | ClearTax | https://cleartax.in/s/gst-housing-maintenance-charges |
| Deposit caps 2 and 6 months; written agreement (Model Tenancy Act 2021) | PRS India | https://prsindia.org/billtrack/the-model-tenancy-act-2021 |
| Daily, alternate-day and custom delivery schedules with pause and monthly billing | Milkride | https://milkride.com/ |
| Batches of 30–60; attendance and fee features expected by coaching centres | IntelGrader | https://intelgrader.com/blog/best-coaching-management-software-india |
| One contacts model across apps; dependencies between apps | Odoo Tricks | https://odootricks.tips/about/odoo-applications/contacts-partners-in-odoo/ |
| One adaptable app with "modes" per business type (6 Oct 2025) | Square | https://squareup.com/us/en/press/unified-pricing-and-packaging |
| Suite apps that do not share data by default | Featurebase; Ravenlabs | https://www.featurebase.app/blog/zoho-review · https://www.theravenlabs.com/zoho-one-review-2026-tested-all-45-apps-heres-what-actually-works/ |
| Gym check-in, member-count tiers, add-on modules | Gymdesk | https://gymdesk.com/blog/gym-management-software-cost |

Internal (read at commit e5d68c7):
- `backend/apps/ledger/services/postings.py`: `post_source_entry`, `reverse_source_entries`, and
  idempotency by `(source_type, source_id, entry_type)`.
- `backend/apps/ledger/constants.py`: `EntryType` (including `INTEREST`, `WRITE_OFF`) and `SourceType`.
- `backend/apps/payments/models.py`: `payments_allocation`, whose polymorphic
  `(document_type, document_id)` targets are registered in `services/targets/`.
- `backend/apps/purchases/services/payment_seam.py`: `register_void_listener`, the listener seam pattern.
- `backend/apps/parties/services/balance.py`: `lock_party`, `apply_entry`.
- `backend/apps/platform_app/services/onboarding.py`: `_seed_modules`.
- `backend/apps/platform_app/services/presets.py`: PLT-03 FR-7 and FR-8.
- `backend/apps/platform_app/services/tenant_settings.py`: `MODULE_DEPENDENCIES` and the
  `module_has_data` guard.
- `backend/apps/platform_app/services/entitlements.py`: `effective_modules`.
- `backend/apps/common/permissions.py`: `_ModuleEnabled`.
- `backend/apps/common/management/commands/run_scheduler.py`.
- `frontend/src/modules/DigiKhaato/features/navigation/sidebarConfig.ts`.
