# Gym & fitness: domain research

Status: **Phase 2 research, 29 Sep 2026.** Written by the Product and Domain Research agent. This is
research, not a decision record. Where it recommends a table, a seam or a rule, the recommendation
goes to the architecture agent (vision §3 rule 5) and, where marked, to the owner (§17). Nothing
here is built; per the in-app rule, none of it may appear in the app or on the landing page as
available until it is.

Binding inputs: [00-platform-vision.md](../00-platform-vision.md),
[01-current-capabilities.md](../01-current-capabilities.md), `CLAUDE.md`. Web material was read as
data; the claims used are listed with URLs in §18.

**Scope.** Independent gyms, fitness studios, yoga classes, dance classes and sports academies
(cricket, football, badminton, swimming, martial arts and similar). Chains with many branches,
franchise management, member mobile apps, online class booking, payroll and diet planning are out of
scope for the first version; §16 says where each one goes.

**The shape of the business, in one paragraph.** Across every product and policy page read, the
business is the same: a person pays in advance for the right to attend for a period (a month, a
quarter, a year) or for a number of sessions, sometimes with a one-time joining fee and sometimes
with a trainer on top. The owner's daily worries are also the same: who expires this week, who has
not renewed, who still owes part of the fee, who is attending, and whether the front desk collected
and recorded what it should have. One comparison of Indian gym software puts the pain in owners'
words as "lost revenue from untracked dues and missed renewals" and "front desk staff forget to
follow up" [S6]. Academies differ in one way that matters: they usually bill a **fixed monthly fee
per batch, due on a fixed day**, and the payer is a parent rather than the person attending [S11, S12].

---

## 1. Core use cases

| # | Use case | Who | How often |
|---|---|---|---|
| U1 | Record an enquiry (walk-in, phone, referral), follow it up, convert it into a member | Front desk | Daily |
| U2 | Enrol a new member: details, plan, start date, joining fee, trainer or batch, payment | Front desk | Daily |
| U3 | Issue the membership invoice or bill and a receipt, and hand over a membership card | Front desk | At every sale |
| U4 | Check members in at the desk and see at a glance whether they are allowed in (active, in grace, expired, frozen, owes money) | Front desk | Hundreds a day |
| U5 | See who expires in the next 7 days and send each one a renewal reminder | Front desk, owner | Daily |
| U6 | Renew a membership, early, on time or after it lapsed | Front desk | Daily |
| U7 | Collect a balance due on a membership sold on part payment | Front desk | Daily |
| U8 | Freeze (pause) a membership for travel, illness or exams, and resume it | Front desk, owner | Weekly |
| U9 | Upgrade or downgrade a plan mid-term, with the unused value carried over | Owner | Monthly |
| U10 | Transfer the remaining period to another person | Owner | Rare |
| U11 | Cancel with or without a refund | Owner | Rare |
| U12 | Sell a personal-training (PT) package, assign a trainer, log sessions as they happen | Front desk, trainer | Weekly |
| U13 | Run batches (6 am yoga, evening kids' cricket) with a capacity, and mark batch attendance | Trainer, coach | Daily |
| U14 | Academy fee cycle: raise this month's fee for every enrolled student, remind parents, record collections | Owner | Monthly |
| U15 | Morning dashboard and end-of-day collection check | Owner | Daily |
| U16 | Reports: membership sales, renewals and lapses, attendance, dues, GST summary, trainer sessions | Owner, accountant | Weekly, monthly |
| U17 | Move existing members off a paper register or spreadsheet with their current expiry and balance | Owner | Once |

U4, U5 and U7 are where the money is. Every Indian product surveyed leads with renewals, dues and
reminders [S6, S7, S8]; attendance is the most frequent action, but it earns money only through the
renewal and absentee lists it feeds.

## 2. Target users and personas

| Persona | Business | Uses the app for | Constraints |
|---|---|---|---|
| **Gym owner** (owner role) | Independent gym, 150 to 600 members, 2 to 6 trainers, one front desk | Dashboard, pricing, refunds and transfers, reports, the renewal round | Distrusts staff handling cash unwatched. Wants the day's collection to tie out. Often on a phone. |
| **Front desk** (staff role) | Same gym, one or two shifts | Enquiries, enrolment, check-in, renewals, collections, reminders | Fast at the counter, a queue at 6 am and 7 pm, a shared desktop or tablet |
| **Trainer** (proposed trainer role) | Floor trainer or PT coach | Their assigned members, session log, batch attendance | Must not see fees, dues or other trainers' clients. Uses a personal phone. |
| **Solo studio owner** (owner role, alone) | Yoga or dance teacher with 30 to 120 students in batches | Batches, monthly fees, attendance, reminders | Owner is the front desk and the trainer at once. Wants the fewest taps. |
| **Academy owner or head coach** | Cricket, football, swimming, dance academy with age-group batches | Monthly batch fees due on a fixed day, parent reminders, attendance | The payer is a parent. Many students are minors, which matters for privacy (§13, §14). |
| **Accountant** (accountant role) | External CA or part-time bookkeeper | GST summary, sales register, exports | Read only |
| **Member or parent** (no login) | The gym's customer | Receives the invoice, receipt, card and reminder texts | Never sees YourKhata's name (existing rule). Has no account in the first version. |

## 3. Workflows

### W1. Enquiry to member
1. Front desk records an enquiry: name, mobile, interest (gym, yoga, PT, batch), source (walk-in,
   phone, referral, social media), a follow-up date and a note ("price-sensitive, wants mornings").
2. Optional free trial: a trial pass of N days or sessions, recorded as a membership with price 0 on
   a trial plan, so the trial's check-ins count like any others.
3. Follow-ups appear on the dashboard on their date. Each attempt is logged with an outcome
   (interested, call back, not interested, joined).
4. On joining, "Convert" creates the member (a party, §15) prefilled from the enquiry and opens W2.
   The enquiry is closed as *joined* and linked to the member, which is how conversion is counted.

### W2. Enrolment (new sale)
1. Pick or create the member. Fields: §4 `Member profile`. Photo optional.
2. Pick a plan. Start date defaults to today, and may be a future date or, with a warning, a past
   date (§13 E1).
3. The system proposes the end date (§6.1), the joining fee (when due, §6.8), the price, a discount
   and the tax.
4. Optional: trainer, batch, PT add-on on the same sale.
5. Who pays: the member by default; a parent, spouse or employer if set (§4 `payer`).
6. Payment: full, part or none (if the tenant allows credit, §6.10). Modes are the existing ones
   (cash, UPI, bank, card, cheque, other); the UPI QR is the existing local one.
7. On save, in one transaction: the membership, an **issued** sales invoice (or bill of supply)
   with one line per charge, the ledger debit, and a payment with its receipt. All but the first are
   existing pipelines (§15).
8. Offer: print or share the invoice, print the card, share a welcome text via WhatsApp (prepared,
   sent by the merchant from their phone; the product sends nothing, DEC-012).

### W3. Check-in at the desk
1. Search by name, mobile (last 4 digits is enough), or member code; or scan the card's QR where the
   browser can (§15.4).
2. The result shows photo, name, plan, end date, a status badge, sessions left, and dues if any.
3. One tap records a check-in. Status decides what happens:
   active → recorded; in grace → recorded with an amber "expired N days ago, renew" banner;
   expired or frozen → refused by default, with an override for staff that records a reason;
   session pack used up → refused, offer renewal; owes money → recorded, dues shown.
4. A second check-in by the same member within the dedupe window (default 3 hours) is shown as
   "already checked in at 06:12" and not recorded twice.

### W4. Batch attendance (studios, academies)
1. The trainer opens today's batch: the list of enrolled members, all marked absent.
2. Tap each present student, save once. Late additions and trial students can be added.
3. The result is the same check-in rows as W3, carrying the batch.

### W5. Renewal round (daily)
1. The dashboard's "Expiring in 7 days" and "In grace" lists.
2. For each member: "Remind" opens the existing share sheet with a prepared text ("Your membership
   at <Business> ends on 5 Oct. Renew for ₹4,200.") and records that a reminder was sent.
3. "Renew" opens W2 prefilled with the same plan; the start date follows §6.4.
4. Lapsed members (expired more than grace days, not renewed) go to the "Lapsed" list for a
   win-back call, with the reason logged (moved, cost, injury, joined elsewhere).

### W6. Freeze and resume
1. Freeze from the membership: start date (today or later), planned end date, reason, optional
   freeze fee (a sales line).
2. Limits from the plan (§6.5) are checked. The end date moves out by the frozen days.
3. Resume early, or let the planned end pass; the extension is recomputed from the actual days frozen.

### W7. Upgrade, downgrade, transfer, cancel
Owner-only by default (§12). Each is a guided flow built on a credit note plus a new sale, so the
money and the tax stay right in the existing pipeline (§6.6, §6.7, §6.9).

### W8. PT package and session log
1. Sell a PT plan (sessions, validity, trainer) as in W2, alone or with a gym membership.
2. The trainer logs each session (date, time, note); a session consumes one credit.
3. The owner sees sessions per trainer per month, the basis for trainer payouts (payouts are later).

### W9. Academy monthly fee cycle
1. Students are enrolled in a batch with a monthly fee and a due day (say the 5th).
2. On each cycle the scheduler prepares that month's fee for every active enrolment (§6.11), shows
   it for review, and on the due day issues it: the student's payer now owes it.
3. Reminders go to parents (prepared texts). Collections are recorded against the fee.
4. A student taking a month off is marked *skip* before issue, and no fee is raised.

### W10. Move off the register (one time)
CSV import of members with their plan, start and end dates, and balance due, through the existing
import wizard (template, mapping, review, errors CSV). Imported memberships carry no invoice; their
dues become the party's opening balance (existing PTY-01/LED-02 path).

## 4. Entities and fields

Names are working names for the FRD. "Core" marks an entity that already exists.

**Party** (core, `parties_party`). The member, the payer, and the trainer are each a party. Reused
fields: name, mobile, alt phone, email, address, state code, GSTIN (a corporate payer), notes, tags,
consent source and consent date, status.

**Member profile** (new, `gym_member`, one to one with party)
- `party_id` (unique per tenant), `member_code` (tenant sequence, for example M-0142)
- `date_of_birth` (optional; needed to know a minor), `gender` (optional; only if the tenant runs
  women-only batches, §17 Q10)
- `guardian_party_id` (required when under 18), `emergency_contact_name`, `emergency_contact_phone`
- `photo_file_id` (optional, core `files`), `joined_on` (first ever enrolment), `source`
- `health_declaration_on` (date the paper or signed declaration was received; see §13 privacy)
- `default_trainer_party_id`, `status` (derived: see §6.2)

**Trainer profile** (new, `gym_trainer`, one to one with party): `party_id`, optional
`membership_id` of a team login, `speciality`, `active`. A trainer without a login is allowed.

**Enquiry** (new, `gym_enquiry`): `name`, `mobile`, `interest`, `source`, `status` (open, trial,
joined, lost), `follow_up_on`, `assigned_to` (user), `lost_reason`, `party_id` (set on conversion),
`note`, timestamps. **Enquiry follow-up** (`gym_enquiry_followup`): `enquiry_id`, `at`, `by`,
`outcome`, `note`, `next_on`.

**Plan** (new, `gym_plan`)
- `name`, `category` (gym access, class or batch, PT, trial, add-on)
- `kind`: `duration` | `sessions` | `duration_and_sessions`
- `duration_value` + `duration_unit` (`day` | `month`), `sessions_count`
- `price`, `price_includes_tax`, `joining_fee` (optional), `tax_code` and `sac` (default 999723)
- `max_freeze_days`, `max_freezes`, `min_freeze_days`, `freeze_fee`
- `batch_id` (optional; a batch plan), `trainer_required` (PT)
- `allow_part_payment`, `status` (active, retired), `sort_order`
- Retiring a plan hides it from new sales; memberships keep a snapshot.

**Membership** (new, `gym_membership`), one term of one plan for one member
- `member_party_id`, `payer_party_id` (defaults to member)
- `plan_id` plus snapshot: `plan_name`, `kind`, `duration_value`, `duration_unit`, `sessions_total`
- `start_on`, `base_end_on` (from the plan), `end_on` (base plus freeze extensions plus manual
  extensions), `sessions_used`
- `price`, `discount_amount`, `joining_fee_charged`, `sales_document_id` (null for imported and
  transferred terms), `renewal_of_id`, `transferred_from_id`, `changed_from_id` (upgrade/downgrade)
- `trainer_party_id`, `batch_id`
- `state`: `active` | `cancelled` | `transferred` | `changed` (stored; the time-based states are
  derived, §6.2)
- `cancelled_on`, `cancel_reason`, `created_by`, timestamps

**Freeze** (new, `gym_membership_freeze`): `membership_id`, `start_on`, `planned_end_on`,
`actual_end_on`, `days` (derived), `reason`, `fee_document_id`, `created_by`.

**Extension** (new, `gym_membership_extension`): `membership_id`, `days`, `reason` (gym closed,
goodwill, correction), `bulk_id` (for a gym-wide closure). A separate row so no end date moves
without a trail.

**Batch** (new, `gym_batch`): `name`, `days_of_week`, `start_time`, `end_time`, `capacity`,
`trainer_party_id`, `monthly_fee` and `due_day` (academy-style billing, optional), `status`.
**Batch enrolment** (`gym_batch_enrolment`): `batch_id`, `member_party_id`, `from_on`, `to_on`,
`payer_party_id`, `status`.

**Check-in** (proposed shared engine, §15.4; `checkin_event`): `subject_party_id`, `context_type`
(`gym_membership`), `context_id`, `batch_id` (optional), `at`, `method` (`desk`, `batch_roll`,
`qr`), `by_user`, `override_reason`, `voided_at`, `void_reason`.

**PT session** (new, `gym_pt_session`): `membership_id`, `trainer_party_id`, `at`, `note`,
`status` (done, missed, cancelled by member), `logged_by`.

**Recurring schedule** (proposed shared engine, §15.3): used for instalment plans on a membership
and for academy monthly fees.

**Later, not modelled now:** body measurement, workout and diet plan, locker, equipment and its
maintenance, trainer payout.

Relationships: a party has at most one member profile; a member has many memberships (at most one
*gym access* term active at a time, §6.3, plus any number of PT or class terms); a membership has
many freezes, extensions, check-ins and PT sessions, and at most one originating sales document; a
batch has many enrolments and check-ins.

## 5. CRUD

| Entity | Create | Read | Update | Delete |
|---|---|---|---|---|
| Enquiry | Front desk, owner | Front desk, owner | Status, follow-ups, note | Never; closed as lost |
| Member profile | On enrolment or conversion | Front desk, owner; trainer sees assigned members, limited fields | Details, photo, guardian | Never while memberships or balance exist; the party is archived (core PTY-04 guard) |
| Plan | Owner | Everyone signed in | Price and limits; changes affect new sales only | Retire only once used |
| Membership | By sale, renewal, import, transfer or change | By role | Trainer, batch, note; dates only through freeze, extension, change | Never; cancelled. A wrong sale is voided through its invoice (§13 E7) |
| Freeze | Front desk (within plan limits) | Everyone who can read the membership | Planned end; early resume | Remove only if it has not started |
| Extension | Owner | As above | No | Reversed by a negative extension with a reason |
| Batch | Owner | Everyone | Times, capacity, trainer | Retire only once used |
| Check-in | Front desk, trainer (own batches) | By role | No | Voided with a reason, same day by staff, any day by owner |
| PT session | Trainer, front desk | Trainer (own), owner | Note only | Voided with a reason; restores the credit |
| Invoice, receipt, payment | Existing sales and payments rules | Existing | Existing | Existing void rules |

Nothing that carries money or history is hard-deleted, which matches canon §0.11 and the 72-month
GST retention rule already applied to parties.

## 6. Business rules

All dates are calendar dates in the tenant's time zone (IST today). Start and end dates are both
**inclusive**: a membership ending 14 Feb lets the member in on 14 Feb.

### 6.1 Plan period (end date)
- **Day plans:** `end_on = start_on + days − 1`. A 30-day plan from 1 Oct ends 30 Oct.
- **Month plans:** add N months. If the start day exists in the target month,
  `end_on = that date − 1 day`; if it does not (31 Jan plus one month), `end_on` is the last day of
  the target month.
  - 15 Jan, 1 month → 14 Feb. 1 Oct, 3 months → 31 Dec. 1 Apr 2026, 12 months → 31 Mar 2027.
  - 31 Jan 2027, 1 month → 28 Feb 2027. 30 Jan 2028 (leap year), 1 month → 29 Feb 2028.
  - 29 Jan 2027, 1 month → 28 Feb 2027 (29 Feb 2027 does not exist).
- **Session plans:** `end_on` is the validity window (day or month rule); the term also ends when
  `sessions_used = sessions_total`, whichever comes first. A 12-class yoga pack valid 60 days from
  1 Oct ends 29 Nov or at the 12th class.
- Month plans are counted in months, not in 30-day blocks. Indian products and gym terms all speak
  in months, quarters and years [S3, S5, S9]; a 30-day plan is a separate day plan.

### 6.2 Status (derived, never stored as a nightly flag)
On a given day `d`, in this order: `cancelled`/`transferred`/`changed` (stored) → **frozen** if a
freeze covers `d` → **upcoming** if `d < start_on` → **active** if `d ≤ end_on` and sessions remain
→ **in grace** if `d ≤ end_on + grace_days` → **expired**. A member's status is the best status of
their gym-access terms. Deriving it avoids a nightly job that can miss a night and leave "active"
members who expired days ago; the scheduler only prepares reminders (§6.12).

### 6.3 Overlap
- Two gym-access terms may not overlap. A renewal bought before expiry is **upcoming** and starts
  the day after the current `end_on`.
- PT and class terms may run alongside a gym-access term and alongside each other.
- When a freeze or extension moves `end_on`, any upcoming term for the same member moves by the same
  number of days, in the same transaction.

### 6.4 Renewal start date
Tenant setting `renewal_start`, default **continuous within grace**:
- renewed on or before `end_on + grace_days` → new `start_on = end_on + 1` (no gap, no lost days
  for the gym);
- renewed later → new `start_on = today`.

Alternatives the owner may choose: *always from expiry* (back-fills the lapsed days; a few gyms do
this) and *always from today*. Staff may change the proposed start date; the change is audited.

Worked example (monthly plan, 1 Sep to 30 Sep 2026, grace 5 days):

| Renewed on | Rule | New term |
|---|---|---|
| 25 Sep | early | 1 Oct to 31 Oct (upcoming until 1 Oct) |
| 3 Oct | within grace | 1 Oct to 31 Oct |
| 12 Oct | after grace | 12 Oct to 11 Nov |
| 12 Oct, *always from expiry* | back-fill | 1 Oct to 31 Oct |

### 6.5 Freeze
- Allowed only on an active or upcoming term, only if the plan allows it (`max_freeze_days > 0`).
- A freeze runs `start_on` to `planned_end_on` inclusive; each freeze is at least `min_freeze_days`;
  the total across the term is at most `max_freeze_days`; at most `max_freezes` freezes per term.
  Common practice: up to 30 days a year [S9]; some brands allow no freeze except on medical proof
  [S5]. Owner may override limits with a reason.
- The freeze **extends `end_on` by the frozen days**. Gymdesk makes this optional per studio [S2];
  we make it the rule, because a freeze that does not extend is just "missing days", which staff
  can record as nothing at all.
- An early resume sets `actual_end_on = resume date − 1` and recomputes the extension.
- A freeze may start up to 7 days in the past (member phoned late); further back needs the owner.
- A freeze may not start on a day the member already checked in.
- Check-ins during a freeze are refused (override records a reason and, by default, ends the freeze
  that day).
- Session packs: a freeze extends the validity window only; sessions are unchanged.

Worked example: quarterly term 1 Nov 2026 to 31 Jan 2027, plan allows 30 freeze days, min 7.
Freeze 10 Dec to 23 Dec (14 days) → `end_on` 14 Feb 2027. The member returns on 19 Dec → frozen
10 to 18 Dec (9 days) → `end_on` 9 Feb 2027. A quarterly renewal already bought for 1 Feb to
30 Apr 2027 now starts 10 Feb and is **recomputed from its new start with §6.1**: 10 Feb plus 3
months → 9 May 2027. (Shifting its end by 9 days gives the same date here, but the two methods can
differ by a day around month ends, so the rule is to recompute.)

### 6.6 Upgrade and downgrade (pro-rating)
- **Unused value** = the old term's *taxable* price (excluding the joining fee, which is not
  refundable) × remaining days ÷ total days of the term, including freeze extensions. Session
  plans use remaining sessions ÷ total sessions, or the day ratio, whichever is smaller.
- The old term ends yesterday (state `changed`). The new term starts today at its full price.
- Money: a **credit note** against the old invoice for the unused value, held as an advance, then
  applied to the new invoice. The sales module already does exactly this (`Settlement.HOLD_ADVANCE`
  and credit application). No negative invoice line is needed; sales lines require `qty > 0`.
- The owner may override the credit amount (a round figure), with a reason.

Worked example, prices including 5% GST:
- Quarterly ₹4,200 (taxable ₹4,000, GST ₹200), 1 Oct to 31 Dec 2026, 92 days.
- Upgrade to yearly ₹11,999 on 16 Oct. Used 15 days, remaining 77 days.
- Unused taxable value = 4,000 × 77 ÷ 92 = ₹3,347.83; GST 5% = ₹167.39 (CGST ₹83.70, SGST ₹83.69);
  credit note ₹3,515.22.
- New invoice ₹11,999.00 (taxable ₹11,427.62, GST ₹571.38) for 16 Oct 2026 to 15 Oct 2027.
- Apply the credit: the member pays ₹8,483.78 (or ₹8,484 with the invoice's round-off on the amount
  due, if the tenant prefers whole rupees; §17 Q5).

A downgrade is the same flow. If the credit exceeds the new price, the difference stays as an
advance on the payer's account or is refunded (§6.9).

### 6.7 Transfer to another person
- Only the remaining days move, to a new member; the old term ends the day before the transfer
  (state `transferred`); the new term has `transferred_from_id`, no invoice and price 0 (the money
  was received from the original payer and stays on their invoice).
- A transfer fee (Crunch India, for example: ₹1,000 plus GST, once a year, to non-members only
  [S5]) is an ordinary sales line to whoever pays it.
- Joining fee rules apply to the new person unless waived.
- Example: yearly 1 Apr 2026 to 31 Mar 2027, transferred on 1 Oct 2026 → old term ends 30 Sep;
  new term 1 Oct 2026 to 31 Mar 2027.

### 6.8 Joining fee
- Charged on a member's first ever gym-access term, as its own invoice line.
- Charged again on rejoin when the gap since the last `end_on` exceeds `rejoin_fee_after_days`
  (tenant setting, default 90). Renewal within the gap never charges it.
- Waivable by staff with a reason (promotions often waive it); not refundable in pro-rating.
- Example: term ended 30 Jun; rejoins 15 Aug (46 days) → no fee; rejoins 15 Nov (138 days) → fee.

### 6.9 Cancellation and refund
- Many gyms have a no-refund policy [S5]; the product must support both. Cancel sets state
  `cancelled` and `cancelled_on`; access stops the next day.
- Refund: the system proposes the pro-rated unused value (§6.6 formula) less a cancellation charge
  if the tenant sets one; the owner enters the final amount (0 up to the amount paid, never more).
  Money moves through a credit note with `Settlement.REFUND` and the existing refund seam, which
  posts the payment out and the ledger line.
- If the term was not fully paid, the refund is first set against the balance due.

### 6.10 Part payment and dues
- A tenant setting decides whether a membership may start with a balance due, and plans may forbid
  it (`allow_part_payment`). Indian gyms commonly do allow it and chase the balance; this is where
  the "untracked dues" pain comes from [S6].
- The due is the payer's ledger balance, from the invoice; nothing gym-side keeps its own figure
  (vision §3.3 "money always goes through the ledger").
- An optional instalment schedule (for example, 50% now, 50% in 30 days) sets expected dates that
  drive reminders and the core promise date. It does not raise a second invoice.
- Tenant setting: refuse check-in when dues are older than N days (default: never refuse, show).

### 6.11 Academy monthly fees
- An enrolment with a batch fee and a due day generates one fee per calendar month.
- **Prepare** 5 days before the due day (a scheduler job), shown in a review list where staff can
  *skip* a student; **issue** on the due day: one invoice or bill per payer, with a line per student
  (siblings with one parent pay on one bill).
- First month when joining mid-month: tenant setting `first_month` = full (default), pro-rata by
  days, or free until next cycle. Pro-rata example: ₹2,500 a month, joined 18 Oct → 14 of 31 days →
  ₹1,129.03, rounded to ₹1,129 if whole-rupee rounding is on.
- A sibling discount is a percentage on the second and later lines of the same payer (§17 Q12).

### 6.12 Reminders
- Offsets from `end_on` (tenant setting, default −7, −3, 0, +3 days) put members on the reminder
  list; the merchant sends each prepared text from their own phone. Indian products send at 7, 3
  and 1 day before [S9]; we prepare, never send (DEC-012).
- Dues reminders reuse the core reminders list, which already keys on a party's balance and
  collection date.
- A reminder records the amount quoted at the time (core `snapshot_balance`).

### 6.13 Gym closure
- The owner can extend every active and frozen term by N days for a closure (Diwali, renovation):
  one bulk extension with one reason; upcoming terms move per §6.3. Undo by a reverse bulk.

### 6.14 Money and tax
- Prices are stored with `price_includes_tax` per plan; the invoice line uses the sales line's
  existing `tax_inclusive` flag and the pipeline computes CGST/SGST (or IGST) and round-off.
- **Rates (to be confirmed by the tenant's CA; YourKhata does not give tax advice).** From 22 Sep
  2025, gym, fitness centre, yoga and similar physical well-being services are 5% GST **without
  input tax credit**, and CBIC called the 5% rate mandatory, not optional [S13, S14, S15]. SAC
  999723 [S14]. Structured sports coaching may be 18%, and coaching by a charitable entity
  registered under section 12AB may be exempt [S16]. So `tax_code` lives on the plan, not in the
  module; the product seeds 5% / 999723 as the default and lets the owner change it.
- A business below the GST registration threshold (₹20 lakh for services in most states [S14])
  issues a **bill of supply**, which the sales module already has (`DocumentKind.BILL_OF_SUPPLY`).
- Time of supply for services is broadly the earlier of invoice and payment [S17]. Because W2
  issues the invoice at the sale, the invoice date is the tax point and the question does not arise
  in the default flow. An academy fee paid before its invoice is an advance and needs the CA's view
  (§17 Q6).
- Plan and rate are snapshotted on the line; a later rate change does not touch issued documents.
- Supplements and merchandise are goods with their own rates, sold through ordinary sales invoices
  with inventory items. That already works.

## 7. Dashboard

The gym dashboard is a section on the existing `/dashboard` when the module is on, not a second
dashboard. Tiles in priority order, each tappable into a filtered list (the PTY-02 pattern):

1. **Checked in today** (count, and against the same weekday last week)
2. **Expiring in 7 days** (count, total renewal value)
3. **In grace** and **lapsed this month** (not renewed)
4. **Dues** on members (core receivable, filtered to members), with the oldest age
5. **Collected today** by mode (core payments), so the owner can tie out the cash drawer
6. **Follow-ups due today** (enquiries) and **new enquiries this week**
7. **Active members** (count) and net change this month (joined minus lapsed)
8. **Frozen now**
9. **Batches today** with enrolled against capacity (studios and academies)
10. For academies: **this month's fees**: issued, collected, outstanding

Not on the first dashboard: birthdays (it needs date of birth for everyone, which runs against data
minimisation, §13), occupancy "right now" (no check-out is recorded), revenue charts (reports).

## 8. Reports

All through the existing reports hub, CSV export and print; only built reports are listed.

| Report | Content | Filters |
|---|---|---|
| Membership sales | Each sale: date, member, plan, new/renewal/rejoin/upgrade, amount, tax, invoice no. | Period, plan, staff, type |
| Renewals due | Terms ending in a period, renewed or not, value | Period, plan, trainer |
| Lapsed members | Expired beyond grace, not renewed, last visit, lapse reason | Period, plan |
| Retention | Renewal rate by month and by plan (renewed ÷ due) | Period |
| Active members | Count at each month end, joined, lapsed | Period |
| Attendance register | Check-ins by day, member and batch; batch roll sheets | Date range, batch, member |
| Absentees | Active members with no check-in for N days (the early warning for a lapse) | N, plan, trainer |
| Dues | Members with a balance, age buckets (core aging, filtered) | Age, plan |
| Collections | Payments by day and mode (core day book and payments) | Period, mode, staff |
| Freeze log | Every freeze, days, reason, by whom | Period |
| PT sessions | Sessions per trainer, per member, credits left | Period, trainer |
| Enquiry conversion | Enquiries by source and outcome, conversion rate, days to join | Period, source |
| Academy fees | By month and batch: issued, collected, skipped, outstanding | Month, batch |
| GST summary, sales register | Core, unchanged | Core |

## 9. Documents

Every document is the tenant's: business name, logo, colour and signature from branding; never
YourKhata's name or domain (the existing rule and test).

- **Membership invoice or bill of supply**: the existing sales document, printed A4 or 80 mm by
  `window.print()`. Lines: "Quarterly membership, 1 Oct 2026 to 31 Dec 2026", "Joining fee",
  "Personal training, 12 sessions, trainer: <name>". The period is in the line description; the
  membership id goes in the document's `meta` so the invoice page can link back.
- **Receipt**: the existing A5 payment receipt.
- **Credit note**: existing, for upgrades, downgrades and refunds.
- **Membership card** (new print sheet): business logo and name, member photo if present, name,
  member code, plan, valid-from and valid-to, and a QR of the member code (generated locally by the
  existing encoder used for the UPI QR). Card size for printing on A4 and cutting, and a
  phone-screen size the merchant can share as a picture. A card shows dates at issue; the desk is
  the authority, so the card says "check validity at the desk".
- **Renewal, welcome, dues and freeze texts**: prepared message templates in the existing share
  sheet, sent by the merchant.
- **Enrolment form and health declaration** (later): a printable form with the consent notice
  (§13) for gyms that want a signed paper copy.
- **Share links** for invoices already exist (`/d/<token>`). A share link for the card waits for
  the generalised `parties_share_link` (C1, decided 23 Sep 2026).

## 10. Payments

- Everything is the core payments module: modes, allocation against invoices, receipts, void with
  reason, local UPI QR. Money never passes through YourKhata.
- Payment at the sale uses the sales payment seam (`payment_seam.validate_payment`), so a membership
  paid at the counter looks the same as any invoice paid at issue.
- A payment against a later balance is an ordinary payment allocated to the membership invoice.
- Advances (a member paying before the renewal is created) sit on the party's account and are
  applied when the invoice is issued, which the ledger and payments already support.
- A family or corporate payer pays one invoice covering several members.
- Online collection, autopay mandates and card-on-file recurring billing, which Gymdesk and
  Mindbody centre on [S1, S4], need a payment gateway, which the platform does not have and must
  not claim. Backlog.

## 11. Search, filter and sort

**Members list** (a gym view over parties that have a member profile):
- Search: name, mobile (any 4 or more digits), member code, and guardian name for minors.
- Filters, kept in the URL as for parties: status (active, upcoming, in grace, expired, lapsed,
  frozen, never joined), plan, category, batch, trainer, has dues, expiring within N days, last
  visit older than N days, joined in period, tags (core).
- Sort: end date (default, soonest first for active), name, last visit, dues, joined date.
- Chips with counts over the filtered set, the PTY-02 pattern.
- Check-in search is a separate fast path: prefix match on code and mobile's last digits, top 5,
  no filters.

**Enquiries**: search name and mobile; filter status, source, interest, follow-up due (today,
overdue), assigned to; sort follow-up date, created.

**Check-ins**: by date range, member, batch, method, overrides only.

**Memberships** (for reports and bulk actions): plan, state, start and end ranges, payer.

## 12. Roles and permissions

The platform has four system roles today: owner, admin, staff, accountant. Gym work maps as below;
"trainer" is the only new role proposed (§17 Q8). Codenames follow the `module.object.action`
convention and are gated by `_ModuleEnabled`.

| Permission | Owner | Admin | Front desk (staff) | Trainer (proposed) | Accountant |
|---|---|---|---|---|---|
| `gym.enquiry.read` / `.write` | yes | yes | yes | no | read |
| `gym.member.read` | yes | yes | yes | assigned members, limited fields | read |
| `gym.member.write` | yes | yes | yes | no | no |
| `gym.plan.manage` | yes | yes | no | no | read |
| `gym.membership.sell` (new, renew) | yes | yes | yes | no | no |
| `gym.membership.freeze` (within plan limits) | yes | yes | yes | no | no |
| `gym.membership.override` (limits, dates, price, check-in refusal) | yes | yes | off by default, grantable | no | no |
| `gym.membership.change` (upgrade, downgrade, transfer) | yes | yes | no | no | no |
| `gym.membership.cancel` (with refund) | yes | no* | no | no | no |
| `gym.membership.extend` (incl. bulk closure) | yes | yes | no | no | no |
| `gym.checkin.write` | yes | yes | yes | own batches | no |
| `gym.checkin.void` | yes | yes | same day | no | no |
| `gym.pt_session.write` | yes | yes | yes | own clients | no |
| `gym.batch.manage` | yes | yes | no | no | read |
| `gym.reports.read` | yes | yes | basic | own sessions | yes |
| Sales, payments, ledger | as today | as today | as today | **none** | as today |

\* Refunds move money out; like the credit-limit override, this should be a role check on owner,
not a delegable codename (the LED-03 rule: a business ceiling is not delegable). Open for the
architecture agent.

**The trainer's view** is the one new idea: a row-level scope (members whose term names this
trainer, or who are enrolled in this trainer's batches) and a field-level scope (name, photo, plan,
dates, sessions left; no fees, dues, mobile or documents). Mobile is hidden because a trainer
leaving to start their own gym with the client list is a real owner fear; the owner can grant it.

## 13. Edge cases

- **E1 Backdated sale.** Recording a sale from last week's paper slip: allowed up to 30 days back
  with a warning; the invoice date is the real date of sale, not today; older needs the owner.
- **E2 Imported member.** Imported terms have no invoice; their dues are an opening balance. The
  first renewal goes through the normal flow.
- **E3 Minor.** Under 18 needs a guardian party, and the guardian is the payer by default. Privacy
  rules for children apply (§13a).
- **E4 Shared mobile.** A family on one mobile: parties allow it; check-in search shows all matches
  with photos.
- **E5 Same person, two gyms.** Each tenant has its own party; nothing is shared across tenants.
- **E6 Overlapping sale.** A second gym-access term that would overlap is queued as upcoming, never
  overlapped (§6.3).
- **E7 Invoice voided.** Voiding the membership's invoice (a wrong sale) cancels the membership in
  the same transaction, through a void seam from sales to gym (the purchases `payment_seam`
  pattern). A term with check-ins asks for confirmation first.
- **E8 Payment voided.** The term stays; the balance reappears as a due.
- **E9 Plan price changed** after sale: the term keeps its snapshot; renewals use the new price
  unless the owner honours the old one (price override).
- **E10 GST rate changed** (as on 22 Sep 2025): issued documents keep their rate; new sales use the
  plan's current tax code. A term spanning the change date is not re-taxed.
- **E11 Freeze across renewal.** A freeze on the current term that runs past its end moves the
  upcoming term (§6.3); a freeze cannot be placed on two terms at once.
- **E12 Check-in during freeze** ends the freeze by default when overridden (§6.5).
- **E13 Session pack exhausted before its date,** or the date before the sessions: whichever
  first; unused sessions lapse (plan setting could allow carry-over later).
- **E14 Double check-in** within the dedupe window is shown, not recorded; a later second visit the
  same day (morning and evening) is recorded.
- **E15 Late-night gyms.** A 5 am to 11 pm gym has no midnight issue; a 24-hour gym's "today" is
  the calendar day of the check-in.
- **E16 Gym closure** extends everyone (§6.13); a closure entered twice is refused for overlapping
  dates.
- **E17 Refund larger than paid** is refused; refund of an unpaid term is zero.
- **E18 Trainer leaves.** Their trainer profile is retired; the owner reassigns their clients and
  batches in bulk. History keeps the old name.
- **E19 Batch full.** Enrolment beyond capacity is refused, or allowed as over-capacity with a
  reason (owner setting).
- **E20 Member archived** while a term is active or a balance is due: refused (the balance part is
  the existing PTY-04 guard; the term part is new).
- **E21 Death or long illness.** Owner cancels with a refund to the payer or a transfer to family;
  both flows exist.
- **E22 Corporate plan.** The employer is the payer (with GSTIN, so a B2B invoice); employees are
  members; one invoice for many members.
- **E23 Couple or family plan.** One plan, several members, one invoice; each member has their own
  term so check-ins and freezes are per person. Priced per plan in the first version.
- **E24 Month-end starts** (§6.1) and leap years are covered by the one rule and tested.
- **E25 Clock or device date wrong** on the desk device: check-in time is the server's.

### 13a. Privacy and health data (DPDP Act 2023 and DPDP Rules 2025)

Not legal advice; the owner should have a lawyer review the consent text before launch.

- **Roles.** The gym is the Data Fiduciary for its members' data; YourKhata, holding it on the
  gym's behalf, is a Data Processor. The platform must give the gym the means to meet its
  obligations: notice, consent record, correction, erasure, export and security.
- **No separate sensitive category.** The Act treats all personal data alike, including health and
  biometric data [S19]; the old IT Act SPDI Rules' "sensitive" list does not carry over. The duty is
  consent for a stated purpose, purpose limitation, reasonable security safeguards and erasure once
  the purpose is served [S19]. Penalties for failing security safeguards go up to ₹250 crore [S19].
- **Timing.** The Rules were notified on 14 Nov 2025 [S18]; Data Fiduciary obligations apply 18
  months later (around May 2027) [S20]. Breach: inform affected people and the Board, with a
  detailed report within 72 hours [S20]. People must get 48 hours' notice before erasure [S20].
  The module will very likely go live before May 2027, so it should be built compliant from the
  start rather than retrofitted.
- **Children.** Processing a child's data (under 18) needs verifiable consent of a parent or
  guardian, and the fiduciary must verify the parent is an adult, for example from details it
  already holds or through DigiLocker [S21]; no behavioural monitoring or targeted advertising of
  children [S20]. The Fourth Schedule exempts educational institutions, crèches and healthcare
  providers for tracking in the interests of safety, and **has no exemption for sports or fitness**
  [S22]. So an academy's attendance record of a child needs the guardian's consent, recorded.
- **What the module should do:**
  1. A consent notice shown and recorded at enrolment (reuse `consent_source`, `consent_at` on the
     party), with the purposes: membership, billing, attendance, reminders.
  2. For a minor, the guardian's consent, recorded on the guardian party, and the guardian as the
     person reminders go to.
  3. **Data minimisation:** no Aadhaar number, no copy of ID documents (a common paper habit);
     if the gym wants ID seen, record only "ID seen: type, date". Date of birth optional, needed only
     to know a minor. Gender optional.
  4. **Health:** the first version stores only the *date* a health declaration was received (the
     form stays on paper), never the answers. Free-text medical notes, measurements and progress
     photos are "later", behind a separate, withdrawable consent and a narrower permission.
  5. **Photo:** optional, purpose "identification at the desk", deletable on request without
     deleting the member.
  6. **Erasure:** on request, or when a member has been inactive past a tenant retention period,
     erase the profile fields (photo, date of birth, emergency contact, health date) while keeping
     invoices and ledger lines for the 72-month GST retention, which the party model already does.
  7. **Biometrics** stay out (§15.4); if they ever come in, the template must stay on the device
     vendor's hardware and never reach YourKhata.

## 14. Validations

| Field or action | Rule |
|---|---|
| Member name | Required, 2 to 160 characters (party rule) |
| Mobile | Required for a member or their guardian; 10-digit Indian mobile (party rule) |
| Date of birth | Not in the future; age 3 to 100; under 18 requires a guardian party who is not the member |
| Member code | Unique per tenant; generated, editable once for imported members |
| Plan | Name unique among active plans; duration 1 to 3,650 days or 1 to 60 months; sessions 1 to 500; price ≥ 0; joining fee ≥ 0; freeze limits ≥ 0 and `min_freeze_days ≤ max_freeze_days` |
| Plan kind | `sessions` needs `sessions_count` and a validity; `duration` must not set `sessions_count` |
| Sale | Plan active; start date not more than 30 days back (owner: any) or 365 days ahead; no overlap with another gym-access term; trainer set when the plan needs one; batch not full; discount ≤ price |
| Payment at sale | Σ modes ≤ total unless the excess is an advance (existing seam); part payment only where plan and tenant allow |
| Freeze | Term active or upcoming; plan allows it; length ≥ min; total ≤ max; count ≤ max; no check-in on the start day; start not more than 7 days back |
| Resume | Not before the freeze start; not after the planned end |
| Extension | Days −365 to 365, non-zero; reason required |
| Upgrade/downgrade | Old term active; new plan different; credit ≤ unused value unless overridden with reason |
| Transfer | Old term active with ≥ 1 day left; recipient is not the same member; recipient has no overlapping gym-access term |
| Refund | 0 ≤ amount ≤ amount paid on the term; reason required |
| Check-in | Member exists; status rules of W3; dedupe window; override needs a reason (3 to 160 characters) |
| PT session | Term is PT, active, credits left; trainer is the term's trainer or the owner overrides |
| Batch | Capacity 1 to 500; end time after start time; at least one weekday |
| Enquiry | Name and mobile required; follow-up date not in the past on create |

Money fields are two decimal places, validated server-side; the client never pre-judges a limit
from a figure it may hold stale (the PTY-04 rule).

## 15. Reuse from core vs new

### 15.1 Members are parties
Yes. A member, a guardian, a corporate payer and a trainer are each a `parties_party`, with a
module profile table keyed one to one on the party (`gym_member`, `gym_trainer`). This is vision
§3.3 "people are always parties, with a role or type per module". It inherits search, tags,
archive guard, consent fields, statement, reminders and CSV import. **Needed from core:** a way for a
module to add a "role" to a party without adding booleans for every vertical (`is_customer` and
`is_supplier` exist today). Proposal for the architecture agent: the profile table *is* the role;
the parties list gains a `module_role=gym_member` filter. The gym's members list is that filter
plus the gym columns.

**Enquiries are not parties** until they convert. An enquiry is a pipeline record with a name and
mobile snapshot, exactly as a walk-in sale keeps `walk_in_name` and `walk_in_mobile` on
`SalesDocument` without creating a party. Making every walk-in enquiry a party would fill the
contacts list with people who never paid, and a lost enquiry would need archiving. Flagged for the
architecture agent because it reads close to "a second contacts table"; the defence is that it
holds one name and one number, is never a payer, and becomes a party the moment it matters.

### 15.2 Invoices through sales
Yes, entirely. The membership sale calls a **sales issue seam** with the payer, lines (description
with the period, SAC, tax code, `tax_inclusive`, amount, `item = null`), the document date, the
payment and `meta.gym_membership_id`. The sales module already supports item-less lines, SAC,
bills of supply, payment at issue, credit notes with hold-as-advance or refund, and void. Plans
carry their own tax code and SAC, so a gym does not need the inventory module on. (Alternative: a
service `inventory.Item` per plan; rejected because it would make inventory a dependency of gym and
put memberships in the stock screens.) `MODULE_DEPENDENCIES["gym"] = {parties, ledger, sales,
payments}`.

Seams needed (new, in sales, following `purchases.services.payment_seam`): `issue_for_module(...)`
and a void callback so that voiding a document tells the gym module (E7). Core never imports gym;
gym registers a handler.

### 15.3 Memberships and the "recurring dues and schedules" engine
**Partly, and the split matters.** A gym membership is two things:
1. **A validity period** (who may come in, until when, frozen or not). This is gym-specific and
   stays in `gym_membership`. Freezes, extensions, upgrades and transfers are about validity.
2. **Money expected on dates.** For a prepaid term that is one charge at the sale, which is just an
   invoice; no schedule. The engine is needed for:
   - **instalments on one invoice** (50% now, 50% in 30 days): schedule lines are expected dates
     that drive reminders; the money is the invoice's balance. Lending's collection plans and hotel
     advance deposits have the same shape.
   - **recurring charges** (academy monthly batch fees, W9): the engine prepares and issues one
     charge per period per enrolment. Tuition fees and rent have the same shape.

So the research **confirms the engine** (vision §3.3) with two modes, *instalments against a
document* and *recurring charges that raise documents*, and it recommends that a gym membership
itself is **not** modelled as a schedule. Proposed engine shape for the architecture agent:
`schedule` (owner module, subject party, payer party, mode, frequency, amount, due day, start,
end, status) and `schedule_line` (due_on, amount, state: prepared, skipped, issued, settled;
`sales_document_id`). Preparation and issue run as `platform_job` rows from `run_scheduler`
(ADR-021), idempotent per `(schedule, period)`.

### 15.4 Attendance and the "check-ins" engine
**Yes.** Check-ins are the same for a gym, an academy, a coaching class and, with a room context,
a hotel guest arrival. The engine owns the event row (§4 `checkin_event`), dedupe, void and the
attendance reports; the module supplies a **context resolver** that answers "may this person check
in now, and against which term?" (the W3 status rules) and receives "a check-in happened" so it can
consume a session. Core never imports the module; the module registers its resolver.

- **Manual desk check-in and batch roll**: MVP, no dependency.
- **QR on the member card**: generating it reuses the local QR encoder. **Scanning** at the desk
  can use the browser's built-in `BarcodeDetector` where it exists (Chrome on Android and desktop);
  where it does not (Safari, Firefox), the desk falls back to typing the code. No library is added.
  If the owner wants scanning on every browser, a JS decoder is a new dependency and needs an ADR:
  backlog.
- **Self check-in** (a QR at the door the member scans with their own phone) needs member
  identity, which there is none of: backlog.
- **Biometric or turnstile** needs hardware and a vendor SDK: backlog, and see §13a point 7.

### 15.5 Bookings and resources engine
**Not needed for the first version.** Batches are enrolment (a standing place), not per-session
booking. Per-class booking with waitlists (the Mindbody model) and lockers would use the engine
when the hotel module builds it. Recorded here as a confirmed *later* consumer.

### 15.6 Everything else reused

| Need | Core piece |
|---|---|
| Dues, balances, statement | Ledger (via sales documents) |
| Collections, receipts, UPI QR | Payments |
| Renewal and dues texts | Reminders list, `UbShareSheet`, reminder history |
| Daily reminder preparation | `run_scheduler` + `platform_job` |
| Member import | Import wizard (a new template and mapper) |
| Numbering (member code) | `platform_app.services.sequences` |
| Photo, logo | `files` |
| Card and documents | Print pipeline, tenant branding |
| Roles | `permissions_registry`, `_ModuleEnabled`, `Membership.permissions_override` |
| Audit | Activity log |
| Reports | Reports hub and CSV export |
| Module switch | `ModuleCode.GYM`, `enabled_modules`, `MODULE_DEPENDENCIES` |

### 15.7 New in the gym module
`gym_member`, `gym_trainer`, `gym_enquiry` (+ follow-ups), `gym_plan`, `gym_membership`,
`gym_membership_freeze`, `gym_membership_extension`, `gym_batch`, `gym_batch_enrolment`,
`gym_pt_session`, the check-in context resolver, the membership card print sheet, gym dashboard
tiles, gym reports, and the tenant settings (grace days, renewal start rule, rejoin-fee gap,
part-payment policy, dedupe window, reminder offsets, first-month fee rule).

## 16. MVP vs later

**MVP (minimum useful set for an independent gym, studio or academy):**
- Members (parties with a member profile), guardians for minors, photo, consent record.
- Enquiries with follow-ups and conversion; trial plans.
- Plans: duration, sessions, duration-and-sessions; joining fee; freeze limits; tax code.
- Sale, renewal (with the renewal-start rule), rejoin, part payment and dues, instalment dates.
- Invoice or bill of supply, receipt, credit note: all through sales and payments.
- Freeze and resume, extension, bulk closure extension.
- Upgrade and downgrade (credit note flow), cancel with or without refund, transfer.
- PT packages with trainer and session log.
- Batches with capacity and roll-call attendance; academy monthly fees through the schedules
  engine.
- Desk check-in (manual) with status rules; QR on the card, scanned where the browser supports it.
- Renewal, dues and welcome texts via the share sheet.
- Dashboard tiles §7 and reports §8.
- Roles: owner, admin, front desk (staff), trainer, accountant.
- Membership card print sheet.
- CSV import of existing members.

**Later (backlog, with reasons):**
- **Body measurements and progress** (weight, BMI, girths, photos): not in the MVP. It is health
  data under a separate consent (§13a); it does not move money or renewals; trainers already keep it
  on paper or their phones; and it brings charts and comparison screens. First candidate after the
  MVP, with consent built in.
- Workout and diet plans: same reasons, and a large content feature.
- Lockers (rental, assignment, expiry, key deposit): uses the bookings/resources engine when built;
  a locker rental can meanwhile be sold as a plan in the "add-on" category.
- Equipment register and maintenance log: small, but not asked for by the money path.
- Trainer payouts and commission on PT: needs expenses or a payroll view; sessions per trainer is
  already reported.
- Per-class booking, waitlists, member self-service app, online booking: need member identity.
- Self check-in, biometric, turnstile, universal QR scanning: hardware or a dependency (§15.4).
- Autopay, payment links, gateway: not on the platform (never claim).
- Multi-branch memberships (one term usable at two branches): branches are not on the platform.
- Family plans priced per head (Gymdesk's model [S3]); in the MVP a family plan is a fixed price.
- Birthdays and anniversary greetings: need date of birth for all; marketing, not records.
- Sending texts automatically: needs a paid provider (DEC-012).

## 17. Open questions for the owner

1. **Minimum business.** Is the first target the independent gym (renewals and dues) or the
   studio or academy (batches and monthly fees)? The MVP covers both; the order of building differs.
2. **Grace days default:** 0, 3, 5 or 7? (Products surveyed use 5 to 7 [S9].)
3. **Renewal start rule default:** continuous within grace (recommended), always from expiry, or
   always from today?
4. **Freeze always extends the end date?** Recommended yes; Gymdesk makes it optional [S2].
5. **Rounding:** should pro-rated credits, refunds and first-month fees round to whole rupees?
6. **Academy fees:** issue the invoice on the due day for every enrolled student (the fee is owed
   even if unpaid), or only when collected? The first shows who has not paid as a real due; the
   second avoids voids for students who quietly left. Recommended: issue on the due day, with the
   review-and-skip step before it. The tax point of an advance needs the CA's view.
7. **Part payment:** allowed by default? Refuse check-in when dues are older than N days?
8. **Trainer role:** add a fifth system role `trainer`, or use staff with narrower overrides?
   Recommended: a new role, because the trainer's row-level and field-level scope (§12) is not
   something the staff role can express.
9. **Trainer sees mobile numbers?** Recommended off by default.
10. **Gender field:** needed (women-only batches, ladies' timings) or leave it out (minimisation)?
11. **Refunds:** role-bound to owner only (recommended), or delegable to admin?
12. **Sibling and family discounts:** needed in the first version for academies?
13. **Transfer rules:** allowed at all? A fee? Only to non-members?
14. **Enquiries outside parties** (§15.1): acceptable, given the vision's "people are always
    parties" rule? The architecture agent must rule on it either way.
15. **Health declaration:** record only the date received (recommended), or nothing at all?
16. **QR scanning** only where the browser supports it (no dependency), or is universal scanning
    worth an ADR for a small decoder library?
17. **Sports academies at 18% vs 5%:** the plan's tax code handles either; should the product
    seed a different default when the business type is "sports academy"?

## 18. Sources

All checked on **29 Sep 2026**. Web content was read as data; product pages were used to learn how
the business runs, not copied.

| # | Source | URL | Used for |
|---|---|---|---|
| S1 | Gymdesk, glossary | https://docs.gymdesk.com/en/help/docs/gymdesk-glossary-0 | Member, visitor, lead, trial, freeze, check-in terms |
| S2 | Gymdesk, freezing and unfreezing members | https://docs.gymdesk.com/en/help/docs/freezing-unfreezing-members | Scheduled freeze, optional extension by freeze days, check-in blocked |
| S3 | Gymdesk, private training schedule and family memberships | https://gymdesk.com/blog/feature-update-private-training-schedule-family-memberships-enhancement-and-more/ | PT schedule, family pricing by head count |
| S4 | Mindbody, updating studio pricing | https://www.mindbodyonline.com/business/education/blog/how-update-your-fitness-studio-pricing | Drop-in vs pack vs unlimited; few pricing options |
| S5 | Crunch Fitness India, terms and conditions | https://www.crunchindia.com/terms-conditions | No freeze except medical; transfer ₹1,000 + GST once a year; upgrade windows; no refunds; minors |
| S6 | Organised Gym, best gym software in India 2026 | https://organisedgym.com/blog/best-gym-management-software-india-2026 | Indian products and owners' pain points |
| S7 | ManageGym24 | https://www.managegym24.com/ | WhatsApp reminders, QR and biometric, trainer assignments |
| S8 | Easy Gym Software | https://easygymsoftware.com/ | Enquiry follow-up, freeze, transfer, upgrade, BMI, lockers, GST and non-GST bills |
| S9 | MyGymDesk, managing member plans | https://mygymdesk.com/blog/manage-member-plans-subscriptions-mygymdesk | Grace 5 to 7 days, 30 freeze days a year, pro-rata upgrade, 7/3/1-day reminders |
| S10 | StudioPartner, dance studio features | https://studiopartner.app/features | Batches, batch attendance, dues, enquiry conversion |
| S11 | FastFee, sports and dance academy software | https://fastfee.in/sports-academy-management-software | Monthly batch fees, registration vs monthly fee, parent reminders |
| S12 | Web search: Indian sports academy fee software (CoFee, SportStr, ArenaFlow, RemindPaisa) | https://fastfee.in/sports-academy-management-software (representative) | Fixed monthly due dates, parent payers |
| S13 | Business Today, CBIC on 5% GST for salons, gyms, yoga from 22 Sep 2025 | https://www.businesstoday.in/india/story/gst-rate-cut-salon-visits-gyms-yoga-classes-to-get-cheaper-from-sept-22-says-cbic-494193-2025-09-16 | 5% without ITC, mandatory |
| S14 | MyGymDesk, GST for gyms in India 2026 | https://mygymdesk.com/blog/gst-for-gyms-india-simple-guide-2026 | SAC 999723, 5% without ITC, ₹20 lakh threshold, CGST/SGST split |
| S15 | TaxTMI forum, GST rate change on gymnasium services | https://www.taxtmi.com/forum/issue?id=120580 | ITC treatment after 22 Sep 2025 |
| S16 | TAXAJ, GST on sports, fitness and coaching | https://www.taxaj.com/learn/gst-sports-fitness-coaching-services/ | Structured sports coaching 18%; charitable coaching exempt |
| S17 | Masters India, time of supply of services | https://www.mastersindia.co/blog/time-supply-services-section-13-cgst-act/ | Time of supply, earliest of invoice or payment |
| S18 | Wikipedia, DPDP Rules 2025 | https://en.wikipedia.org/wiki/Digital_Personal_Data_Protection_Rules,_2025 | Notified 14 Nov 2025 |
| S19 | K&S Partners, biometric data under the DPDP Act | https://ksandk.com/data-protection-and-data-privacy/regulation-of-biometric-data-under-the-dpdp-act/ | No sensitive category; purpose, security, erasure; ₹250 crore |
| S20 | EY India, DPDP Act and Rules 2025 | https://www.ey.com/en_in/insights/cybersecurity/transforming-data-privacy-digital-personal-data-protection-rules-2025 | Phasing (12 and 18 months), 72-hour breach report, 48-hour erasure notice, children |
| S21 | DPDPA.com, Rule 10 | https://www.dpdpa.com/dpdparules/rule10.html | Verifiable parental consent, adult verification, DigiLocker |
| S22 | PrivacyLawHub, DPDP Rules Fourth Schedule | https://privacylawhub.com/bare-acts/dpdp-rules-2025/schedule-iv-fourth-schedule-exemptions-from-section-9-1-and-9-3- | Exemptions list; none for sports or fitness |

Code read for §15 (commit e5d68c7): `backend/apps/parties/models.py`, `backend/apps/sales/models.py`
and `constants.py` (item-less lines, SAC, bill of supply, settlements), `sales/services/payment_seam.py`,
`backend/apps/ledger/models.py` (`Reminder`, `SourceType`), `backend/apps/common/jobs.py`
(`platform_job`, schedules), `backend/apps/common/permissions_registry.py` (roles),
`backend/apps/platform_app/services/tenant_settings.py` (`MODULE_DEPENDENCIES`).
