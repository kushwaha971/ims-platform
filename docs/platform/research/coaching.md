# Coaching & tuition: domain research

Status: **Phase 2 research, 29 Sep 2026.** Written by the Product and Domain Research agent for the
module the owner added on 29 Sep (CR-2026-09-29-PLATFORM-D). This is research, not a decision
record. Where it recommends a table, a seam or a rule, the recommendation goes to the architecture
agent (vision §3 rule 5) and, where marked, to the owner (§18). Nothing here is built. Under the
in-app rule, none of it may appear in the app until it is built.

Binding inputs: [00-platform-vision.md](../00-platform-vision.md),
[01-current-capabilities.md](../01-current-capabilities.md), `CLAUDE.md`, [candidates §3.1](candidates-and-competitors.md),
[shared-engines.md](shared-engines.md) (engines 1 and 3, PROPOSED). [gym.md](gym.md) is the sibling
document; this one follows its structure and **does not repeat** memberships, freezes, desk check-in
or the gym's GST, and points at the shared engine where the two share a shape. Web material was read
as data; §19 lists sources.

**Scope.** Tuition centres; coaching institutes (school subjects and competitive-exam preparation);
home tutors with many students; music, art and dance classes; language and skill classes (spoken
English, computers, abacus). Out of scope for the first version: online classes, a student or
parent app, recorded video, question banks and test engines, hostels (rent or hospitality covers
those), and multi-branch chains (branches are not on the platform).

**The shape of the business, in one paragraph.** A centre enrols a student in a **course** (Class
10 Maths and Science, JEE two-year, Guitar Grade 2), places them in a **batch** that meets at fixed
times with a teacher, and collects a fee in one of three ways: **monthly**, **a course fee in
instalments**, or **one payment up front**. The payer is usually a parent. The owner's daily worries
are the same across every product and guide read: who has not paid this month, who is absent, which
parent must be told, and how full each batch is [S3, S11, S11b]. Two things make coaching different
from a gym. Most students are **children**, so every record is a child's record under the DPDP Act
(§15.2). And a centre that is covered by the 2024 guidelines must **refund the unused part of the
fee within 10 days** when a student leaves mid-course (§15.1).

**What real products show (read, not copied).** Classplus and Teachmint are app-and-content first:
online classes, tests, study material and in-app messages, with fees as one feature [S9]; Teachmint
has withdrawn its standalone fee module to focus on teaching [S10]. School ERPs model fee heads per
class, concessions by category (sibling 10%, staff ward 50%), late fines with grace and caps, and
refunds by authorised staff only [S11b, S11c]. Small fee tools centre on instalments set at
admission, branded receipts and overdue lists [S11]. The gap YourKhata fits is **fees, attendance and
guardian texts on a real ledger**, without an app, content or a gateway.

---

## 1. Core use cases

| # | Use case | Who | How often |
|---|---|---|---|
| U1 | Record an enquiry (walk-in, phone, referral), book a demo class, follow up, convert it to an admission | Front office | Daily in admission season |
| U2 | Admit a student: student and guardian details, consent, course, batch, fee plan, concession, first payment | Front office | Daily in season |
| U3 | Define courses, batches and the weekly timetable, and assign teachers | Owner | Each term |
| U4 | Take roll-call for a batch session | Teacher | Every session |
| U5 | Tell a guardian their child was absent today, as a prepared WhatsApp text the centre sends | Front office | Daily |
| U6 | See whose fees are due and overdue, and send each payer a reminder with the exact amount | Front office, owner | Daily in the first ten days of a month |
| U7 | Collect a fee (cash, UPI, cheque) and hand over a receipt | Front office | Many times a day |
| U8 | Give a concession: sibling, scholarship, staff ward, one-off waiver | Owner | At admission, occasionally later |
| U9 | Charge a late fee, or waive it | Front office (charge), owner (waive) | Monthly |
| U10 | Move a student to another batch, or pause for a break month | Front office | Weekly |
| U11 | Record that a student is leaving, work out the pro-rata refund, pay it within the deadline | Owner | Occasionally |
| U12 | Print an admission form, ID card, monthly attendance report and fee statement | Front office | At admission, month end, on request |
| U13 | See the day's batches, pending roll-calls, dues, collections and refunds due on one dashboard | Owner | Daily |
| U14 | Move off the paper register or spreadsheet once | Owner | Once |

## 2. Target users and personas

| Persona | Business | What they need first | What they will not do |
|---|---|---|---|
| **Neha, home tutor** | Teaches 35 school students in four batches in her living room. Monthly fee ₹1,500–2,500 due by the 10th. No staff. Not GST-registered. | A list of who has paid this month, one-tap reminders to parents, and a receipt parents can keep | Learn "fee heads", set up a timetable grid, or type in 35 addresses |
| **Rakesh, tuition centre owner** | 180 students, classes 6–12, three rooms, four part-time teachers, one front-office person. Monthly fees with a sibling discount. Registered for GST. | Monthly dues with invoices, attendance by batch, absence texts to parents, teacher logins that cannot see fees | Pay ₹3,000–8,000 a month for an app-first product whose app his students do not use [S3] |
| **Farah, exam-prep institute director** | 600 students, JEE and NEET courses of 1–2 years, fees of ₹60,000–1,50,000 in 3–4 instalments, scholarships by an entrance test. Covered by the 2024 guidelines and by state rules. | Instalment schedules, scholarship records, a refund calculator with the 10-day deadline, and reports she can show an inspector | Keep marks and content in this product (she already uses an LMS) |
| **Joseph, music school** | Guitar, keyboard and vocals; 120 students aged 6–50; monthly fee or a term fee of 12 classes; external grade exams | Per-student batches (often one student), make-up classes, adult and child students in one list | Treat every student as a minor |
| **Front office (Priya)** | Staff at Rakesh's centre | Fast admission, fast fee entry, the day's absent list with a "tell parent" button | Decide concessions or refunds |
| **Teacher (Sunil)** | Teaches Maths to five batches | His batches, today's roll-call, a monthly register | See fees, parents' phone numbers or other batches |
| **Guardian (not a user)** | Pays, receives texts and receipts | Exact amounts, the period covered, the centre's name on everything | Install an app or create an account |

The long tail (Neha) is the paper-and-WhatsApp user the platform is built for. The large institute
(Farah) is where the regulatory features (refund window, fee transparency) matter most.

## 3. Workflows

### W1. Enquiry to admission
1. Front office records an enquiry: student and guardian name, mobile, class or level, course of
   interest, source, preferred timing. Optionally a **demo class** (date, batch), recorded on the
   enquiry; the visitor is not on the roll-call, because they are not a party yet (§16.1).
2. Follow-ups carry an outcome and a next date. **Convert** opens W2 prefilled; **Lost** needs a
   reason (fee, timing, distance, joined elsewhere).

### W2. Admission
1. **Student**: name, date of birth (optional, but it decides whether the student is a minor),
   school and class (optional), photo (optional).
2. **Guardian** (required for a minor): find a party by mobile (a sibling's parent is already there)
   or create one; relation; whether this guardian **pays** and **receives alerts**.
3. **Consent** (§15.2): notice shown; consent recorded with date, method and how the guardian was
   verified as an adult. A minor's admission cannot be saved without it.
4. **Course and batch** with free places; the timetable is shown.
5. **Fee plan** and **concessions** (sibling proposed automatically when the payer already has an
   active student, §6.4; scholarship with a reason, owner only), plus one-time heads (registration,
   material). A preview lists every due: "₹1,084 for 18–31 Oct, then ₹2,400 on the 5th monthly."
6. **Payment** now (optional, part or full) through the core payments flow.
7. Save creates the profile, enrolment, batch assignment, dues schedule (engine 1) and roll-call
   membership (engine 3) in one transaction, issues the admission number, and offers the admission
   form and ID card for printing.

### W3. Course, batch and timetable set-up (owner)
Course (name, category, level, duration or open-ended, default fee plans, SAC and tax) → batch
(name "10-A Evening", dates, capacity, room label, session label "2026-27") → timetable slots
(weekday, start, end, subject, teacher). The slots are the recurrence engine 3 uses to generate
sessions; the tenant calendar's holidays produce none (shared-engines §1.4).

### W4. Roll-call (teacher)
1. **Today** lists the teacher's sessions (not taken, taken, cancelled). A session opens the
   students assigned on that date, all **present** by default (batch setting).
2. Tap the absent ones, optionally late or excused, save once. A cancelled session (teacher ill,
   centre closed) has a reason, no marks, and is left out of every percentage.
3. Same-day corrections are free; later ones need a permission (engine §4.6).

### W5. Absence alerts to guardians
1. After roll-call, **Absent today** lists each absent student and the guardian who receives alerts.
2. **Tell guardian** opens the existing share sheet with a prepared WhatsApp text (§9.6), sent from
   the centre's own phone; the send is recorded ("told at 17:42"). "Prepare all" queues one tap per
   guardian, as bulk reminders do.
3. **Absent 3 sessions in a row** and **below 75% this month** use the same action (thresholds are
   settings). YourKhata sends no SMS, email or WhatsApp itself (DEC-012).

### W6. Monthly fee cycle
1. A **review list** a few days before the due date (default 3) lets front office **skip** a student
   on a break (a pause, engine §2.8) before anything posts.
2. On the due date the daily run (engine 1) raises each due, as an invoice or bill of supply through
   the sales seam (Q3); siblings with one payer share one document, a line per student.
3. Dues appear in the existing reminders list; the text names the student, period and exact amount.
   After grace, the plan's late fee applies (§6.5).

### W7. Instalment course fee
The plan splits the total into instalments (equal, percentages, or explicit amounts and dates). Each
instalment raises its own invoice on its due date (charge mode, §16.2); **future instalments are
never invoiced early**, which keeps the tax point right (§10) and a mid-course exit simple (§6.3).

### W8. Batch change, course change, break
- **Batch change, same course**: the batch assignment ends yesterday and a new one starts today; the
  fee schedule belongs to the enrolment, so it does not change.
- **Course change**: the old enrolment ends with its leaving rule and a new one starts with its
  joining rule (engine §2.6 "change plan mid-period").
- **Break month** (exams, summer): a pause with `effect=skip`, recorded before or during the window.

### W9. Leaving mid-course and the refund
1. Owner chooses **Leaving**: last day attended, request date, reason.
2. The system ends the enrolment and batch assignment, cancels every `scheduled` due (never posted),
   and computes the settlement by the plan's leaving rule (§6.3): value used, invoiced, paid, and the
   result (refund, or balance still owed).
3. **Refund due by** = request date + refund window (default 10 days), on the dashboard with days
   left until the refund payment is recorded.
4. The owner may change the amount with a reason; computed and final figures are both kept.
5. Money: a credit note with a refund settlement against the student's invoices (latest first), and
   a payment made to the payer (§10). The **settlement slip** prints the formula (§9.5).

### W10. Move off the register (one time)
CSV import (students, guardians, course, batch, plan, next due date, balance) through the existing
wizard; balances become the payer's opening balance (PTY-01, LED-02). Imported consent for minors is
marked "to confirm" and asked for at the next visit (§15.2).

## 4. Entities and fields

Working names for the FRD. "Core" marks an entity that exists; "engine" marks a PROPOSED shared
engine entity from shared-engines.md.

**Party** (core, `parties_party`). Student, guardian, and teacher are each a party. Reused fields:
name, mobile, alt phone, email, address, notes, tags, `consent_source`, `consent_at`, `sms_opt_in`,
status.

**Student profile** (new, `coaching_student`, one to one with a party): `party_id` (unique per
tenant), `admission_no` (tenant sequence, e.g. 2026/0142), `date_of_birth` (optional; decides
`is_minor`), `is_minor_declared` (when no DOB is given), `school_name`, `school_class` (optional),
`photo_file_id` (optional; purpose "ID card"), `admitted_on`, `source`, `enquiry_id`, `status`
(derived: active, on break, left), `left_on`, `left_reason`, `data_erased_at` (§15.2).

**Guardian link** (new, `coaching_guardian_link`; a candidate for core, §16.1): `student_party_id`,
`guardian_party_id`, `relation`, `is_payer` (exactly one payer per student at a time; an adult may
pay for themselves), `receives_alerts`, `is_primary`, `consent_id`.

**Consent record** (new, `coaching_consent`; a candidate for core): `student_party_id`,
`given_by_party_id` (guardian, or the adult student), `purposes` (records, fees and receipts,
attendance, alerts, ID-card photo; each a flag), `method` (signed form, in person),
`adult_verified_by` (known to the centre, ID seen in person; DigiLocker later), `notice_version`,
`given_at`, `withdrawn_at`, `recorded_by`. No ID number or copy is stored (§15.2).

**Teacher profile** (new, `coaching_teacher`, one to one with a party): `party_id`, optional
`membership_id` of a team login, `subjects`, `active`. A teacher without a login is allowed (the
owner takes roll-call for them).

**Enquiry** (new, `coaching_enquiry`) and **follow-up** (`coaching_enquiry_followup`): as gym.md §4,
plus `student_name`, `guardian_name`, `class_or_level`, `course_id`, `preferred_timing`,
`demo_on`, `demo_batch_id`, `demo_attended`.

**Course** (new, `coaching_course`): `name`, `category`, `level`, `duration_months` (null =
open-ended), `default_plan_ids`, `sac` (default 999293), `tax_code`, `status` (active, retired).

**Batch** (new, `coaching_batch`): `course_id`, `name`, `session_label`, `starts_on`, `ends_on`
(nullable), `capacity`, `room_label`, `default_mark` (present or absent), `status`. It owns one
engine `attendance_group` (`subject_type='coaching_batch'`).

**Timetable slot** (new, `coaching_timetable_slot`): `batch_id`, `weekday`, `start_time`,
`end_time`, `subject`, `teacher_party_id`, `valid_from`, `valid_to` (so a timetable change does not
rewrite history).

**Enrolment** (new, `coaching_enrolment`), one student on one course: `student_party_id`,
`payer_party_id` (changeable forward only), `course_id`, `plan_id`, `schedule_id` (engine 1,
`subject_type='coaching_enrolment'`), `starts_on`, `ends_on` (null if open-ended), `state` (active,
on_break, completed, left, changed), `changed_to_id`.

**Batch assignment** (new, `coaching_batch_assignment`): `enrolment_id`, `batch_id`, `from_on`,
`to_on`. It maps to engine `attendance_group_member` rows one to one.

**Concession** (new, `coaching_concession`): `enrolment_id`, `kind` (sibling, scholarship, staff
ward, other), `basis` (percent or fixed per due, or fixed off the course total), `value`,
`applies_to_heads` (tuition only by default), `from_on`, `to_on`, `reason`, `approved_by`. It is
applied by the engine as a `discount` adjustment when each due is prepared (§16.2).

**Withdrawal** (new, `coaching_withdrawal`): `enrolment_id`, `requested_on`, `last_attended_on`,
`reason`, `computed_refund`, `final_refund`, `override_reason`, `refund_due_by`,
`credit_note_id`, `refund_payment_id`, `settled_on`.

**Engine rows used as they are:** `schedules_plan` (module `coaching`, configured per §16.2),
`schedules_schedule`, `schedules_due`, `schedules_adjustment`, `schedules_pause`;
`attendance_group`, `attendance_group_member`, `attendance_session`, `attendance_mark`
(`mark_kind = presence`). **Later:** tests, results, material register, certificates, payouts.

Relationships: a student party has one profile, one or more guardian links (exactly one payer at a
time), and many enrolments. An enrolment has one fee schedule, many batch assignments over time, any
number of concessions, and at most one withdrawal. A batch has timetable slots, one attendance group
and many assignments. A payer party can pay for several students (siblings).

## 5. CRUD

| Entity | Create | Read | Update | Delete |
|---|---|---|---|---|
| Enquiry | Front office, owner | Front office, owner | Status, follow-ups, demo | Never; closed as lost |
| Student profile | At admission or import | Owner, front office; teacher sees name, photo, batch only | Details, photo, school | Never while an enrolment is active or a balance exists; profile fields erasable on request (§15.2) |
| Guardian link | At admission | Owner, front office | Relation, payer (forward only), alerts | Removed only if another guardian remains for a minor |
| Consent | At admission | Owner, front office | Withdrawal only | Never (it is the evidence) |
| Teacher profile | Owner | Owner, front office | Subjects, login link | Retire |
| Course | Owner | All signed in | Name, SAC, tax (new enrolments only) | Retire once used |
| Batch | Owner | All; teacher sees own | Capacity, room, end date, default mark | Retire once used |
| Timetable slot | Owner | All | By a new slot from a date (history kept) | Only if no session was generated |
| Enrolment | Admission, course change, import | By role | Payer forward, note | Never; ended as left, completed or changed |
| Batch assignment | Admission, batch change | By role | End date | Only on the same day it was created with no marks |
| Concession | Owner | Owner, front office, accountant | End date | Ended, never deleted; posted discounts stay |
| Withdrawal | Owner | Owner, accountant | Final amount before the refund is paid | Undo only before the credit note is issued |
| Marks | Teacher (own batches), front office | By role | Same day; later with permission | Never; corrected with an audit row |
| Dues, invoices, receipts, payments | Engine and existing sales and payments rules | Existing | Existing | Existing void and reversal rules |

Nothing that carries money or history is hard-deleted (canon §0.11, the 72-month GST retention
rule already applied to parties).

## 6. Business rules, with worked examples

All dates are calendar dates in the tenant's time zone. Periods include both their first and last
day. Rounding is to ₹1, half-up, by default (engine §1.3). Tax figures are illustrations of how the
pipeline computes; the rate is the tenant's choice with their CA (§10).

### 6.1 Joining mid-month (monthly plans)

The plan chooses one joining rule (engine §2.6): `full`, `by_days`, `half_rule`, `next_period` or
`align_to_join`. **Recommended default for coaching: `by_days`** for monthly tuition, because
parents check the arithmetic, and `half_rule` as the simple alternative many small centres already
use.

Worked example. Monthly plan ₹2,400, due on the 5th, periods are calendar months. Aarav joins on
**18 Oct 2026**.
- `by_days`: 18–31 Oct is 14 of 31 days: 2,400 × 14 ÷ 31 = 1,083.87 → **₹1,084**, due 18 Oct.
- `half_rule` (N = 15): joined after the 15th → **₹1,200**. `full`: **₹2,400**. `next_period`:
  nothing now. `align_to_join`: ₹2,400 on the 18th of each month for 18th–17th periods.
- From November: ₹2,400 on the 5th. Sessions before 18 Oct are "not enrolled", not absent, so
  October's attendance % starts on 18 Oct (engine §4.9 item 1).

### 6.2 Instalments (course fee)

Worked example. "JEE one-year" runs **1 Jun 2026 – 31 Mar 2027** (304 days). Fee ₹59,000
including 18% GST (taxable ₹50,000, GST ₹9,000). Plan: three instalments of 40%, 30% and 30%.

| # | Due on | Amount | Taxable | CGST 9% | SGST 9% |
|---|---|---|---|---|---|
| 1 | 1 Jun 2026 (admission) | ₹23,600 | ₹20,000 | ₹1,800 | ₹1,800 |
| 2 | 1 Sep 2026 | ₹17,700 | ₹15,000 | ₹1,350 | ₹1,350 |
| 3 | 1 Dec 2026 | ₹17,700 | ₹15,000 | ₹1,350 | ₹1,350 |
| | **Total** | **₹59,000** | ₹50,000 | ₹4,500 | ₹4,500 |

- Each instalment is invoiced on its due date, not all at admission (§10, CGST s.31(5)(a)).
- If a split does not divide evenly (₹50,000 in 3 equal parts), the last instalment absorbs the
  rounding: ₹16,667 + ₹16,667 + ₹16,666 (engine §1.3), so the total is exact.
- A scholarship of 20% on the course: the total becomes ₹47,200 and each instalment carries its
  own 20% discount line (₹18,880, ₹14,160, ₹14,160), so every invoice shows the gross and the
  concession.
- A plan may offer "pay in full at admission" at a lower total. That is a separate plan with one
  due, not a discount on the instalment plan, so the refund arithmetic stays clear.
- Rajasthan's 2025 Bill requires an option to pay in **at least four instalments** [S7]. The
  engine allows any count; the product does not enforce a state minimum (§15.1).

### 6.3 Pro-rata refund on leaving mid-course

**Formula (plan leaving rule `by_days`, the recommended default for course fees):**
- value used = course total × days used ÷ course days (days used counts from the course start, or
  the student's joining date if later, to the last day attended, inclusive);
- settlement = amount paid − value used, where only invoiced dues count as paid or owed; dues not
  yet raised are cancelled.
- Positive: a refund to the payer. Negative: the payer still owes that much, and the rest of the
  invoiced amount is credited.

Continuing the example (304 days, ₹59,000). Diya's last day is **15 Nov 2026**; the request is
made the same day. Days used: 1 Jun–15 Nov = 30 + 31 + 31 + 30 + 31 + 15 = **168**. Days
remaining: **136**.
- Value used: 59,000 × 168 ÷ 304 = **₹32,605.26**. Value of the remaining period: ₹26,394.74.

| Case | Invoiced | Paid | Instalment 3 (due 1 Dec) | Result |
|---|---|---|---|---|
| A. Paid the whole fee at admission (a single-due plan) | ₹59,000 | ₹59,000 | n/a | **Refund ₹26,395** (26,394.74 rounded), by credit note (taxable ₹22,368.42 + GST ₹4,026.32) |
| B. Paid instalments 1 and 2 | ₹41,300 | ₹41,300 | cancelled, never invoiced | **Refund ₹8,695** (41,300 − 32,605.26 = 8,694.74) |
| C. Paid instalment 1 only | ₹41,300 | ₹23,600 | cancelled | Credit ₹8,694.74 against invoice 2; **still owed ₹9,005.26** (17,700 − 8,694.74), which the reminders list shows |

- **Refund due by 25 Nov 2026** (request date + 10 days). The dashboard shows "10 days left".
- A plan may choose `by_months` instead (unused whole months, counting the leaving month as used).
  In the example: 4.5 of 10 months remain → the tenant's rule decides whether the half month counts.
  The formula chosen prints on the slip.
- `by_sessions` (share of scheduled sessions not yet held) suits term-based music classes: a
  12-class term of ₹3,600 left after 5 classes → ₹2,100.
- A **monthly** plan's leaving is simpler: the current month pro-rates the same way (Aarav leaving on
  10 Nov after paying ₹2,400 for November: 20 unused of 30 days → refund ₹1,600), and no later month
  is raised.
- Non-refundable heads (a registration fee, study material already handed over) are marked on the
  plan. The slip lists them. The product warns that the published policy and state rules decide
  whether they may be withheld (§15.1). It does not decide.

### 6.4 Sibling discount

Rule (recommended default): when one payer has two or more active students, the discount applies to
**every student except the one with the highest monthly tuition**, as a percentage of tuition only
(not of registration, material or exam heads). It is re-evaluated when each due is **prepared**, never
retroactively.

Worked example. Payer: Mrs Kapoor. Aarav, Class 10, ₹2,400 a month. Diya, Class 7, ₹1,800 a
month. Sibling discount 10%.
- Diya's due: 1,800 − 180 = **₹1,620**. Aarav: **₹2,400**. One invoice to Mrs Kapoor, two lines,
  total **₹4,020**; the discount prints as its own figure on Diya's line.
- Aarav leaves on 31 Dec. From January, Diya is the only active student, so her due is ₹1,800 again.
  December's discount stays as posted.
- A third child joining mid-month gets the discount on their pro-rated first due as well.
- Siblings are recognised by the **payer**, not by surname or address. Two students with different
  payers are not siblings in the system even if they are, and the owner can add a manual concession.

### 6.5 Late fee

Worked example. Monthly ₹2,400 due on **5 Oct**, grace 5 days (the due becomes overdue on 11 Oct),
late fee `per_day` ₹10 capped at ₹200 per due.
- Paid on **25 Oct**: overdue days 11–25 Oct = 15 → **₹150**. The display shows "late fee so far
  ₹150" while it accrues; it posts when the due is settled (engine §2.7). The payer pays ₹2,550.
- Paid on 20 Nov: 41 days → ₹410, capped → **₹200**.
- Alternative `flat_once` ₹100 on the 11th: posts on that day.
- Waiver: owner, with a reason; a posted late fee is reversed, never edited.
- A late fee never applies to a skipped (break) month, or to the days a later-voided payment stood
  (engine §2.14 item 4).
- A late fee on a taxable fee is itself part of the value of the supply and is likely taxed at the
  same rate; the CA decides, and the document follows the plan's tax code (§10, §18 Q9).

### 6.6 Other rules
- **No fee increase during a running course.** The 2024 guidelines prohibit it [S4, S5]. Enrolments
  keep their plan snapshot (engine §2.14 item 1), so a plan price change affects new admissions
  only. An escalation on a running course enrolment is refused unless the owner overrides with a
  reason, and the override is audited. Open-ended monthly tuition may have a yearly price change
  from a date, announced ahead, which is the tenant's decision.
- **Batch capacity.** Admission beyond capacity is refused, or allowed with a reason (owner setting).
- **Payer change.** Forward only, from the next due; posted dues stay with the old payer.
- **Minimum age (tenant setting, off by default).** When on, admitting a student under the set age
  (16 in the guidelines) is refused, and the owner may override with a reason (§15.1).
- **Adult students.** At 18 a student may be their own payer and consenting party. A student who
  turns 18 mid-course keeps the guardian link; the next consent renewal is theirs.

## 7. Dashboard

A coaching section on the existing `/dashboard` when the module is on (shared-engines §5.4 item 6),
not a second dashboard. Tiles in priority order, each tapping into a filtered list:

1. **Today's sessions**: count, and **roll-calls not taken** (red after the session end time)
2. **Absent today**: students absent, and how many guardians are not yet told
3. **Fees due this week** and **overdue** (count, amount, oldest age), from the dues engine
4. **Collected today** by mode (core payments), to tie out the cash drawer
5. **Refunds due** with the nearest deadline ("Diya Kapoor, ₹8,695, 3 days left"); overdue refunds
   in red
6. **Follow-ups due today** and **demos today** (enquiries)
7. **Admissions this month** and **left this month**
8. **Batch fill**: enrolled against capacity for batches over 90% or under 30%
9. **Low attendance**: students below the threshold this month
10. **This month's fees**: raised, collected, outstanding, skipped

Not on the first dashboard: marks, birthdays (they need DOB for everyone, against minimisation),
revenue charts (reports), teacher performance.

## 8. Reports

All through the existing reports hub, with CSV export and print; only built reports are listed.

| Report | Content | Filters |
|---|---|---|
| Fee register | Every due: student, payer, course, period, gross, concession, late fee, net, invoiced, paid, status | Month, course, batch, status, plan |
| Collection vs expected | By month and plan: expected, raised, collected, skipped, outstanding | Period, course, batch |
| Defaulters | Payers with overdue dues, age buckets, late fee so far, last reminder sent | Age, batch, course |
| Concessions | Every concession: kind, student, amount given in the period, approved by | Period, kind |
| Refunds | Each withdrawal: requested on, due by, computed, final, override reason, paid on, **days taken** | Period, status (due, paid, late) |
| Admissions and leavers | Joined, left, reasons, course, source | Period, course |
| Enquiry conversion | Enquiries by source and outcome, demo-to-admission rate, days to admit | Period, source, course |
| Attendance register | Students × dates for a batch and month, P/A/L/E, sessions held and cancelled | Batch, month |
| Attendance % | Per student per batch per period; list below the threshold | Period, batch, threshold |
| Absence alerts log | Alerts prepared and sent, by whom, when | Period, batch |
| Batch strength | Enrolled, capacity, joined and left per batch | Session label, course |
| Teacher load | Sessions scheduled, held, cancelled; roll-calls not taken, per teacher | Period, teacher |
| Payer statement | Core statement for the payer, lines labelled with student and period | Core |
| GST summary, sales register, day book | Core, unchanged | Core |

The **refunds** report is the one a covered centre will show an inspector: it proves each refund
and its date. It reports facts; it does not say "compliant".

## 9. Documents

Every document is the tenant's: business name, logo, colour, signature, address and, where set,
the centre's registration number; never YourKhata's name or domain (the existing rule and
`customerDocumentsCarryNoProductName.test.tsx`). All print through `window.print()` (ADR-021).

| Document | New or existing | Content |
|---|---|---|
| **Fee receipt** | Existing A5 receipt, coaching line wording | Student and admission number, course and batch, the **period** each allocation covers ("Tuition, Nov 2026"; "Instalment 2 of 3, JEE one-year"), heads, concession, late fee, mode and reference, balance after, received by. The guidelines ask for a receipt for every fee [S5]; this is it. Invoices and bills of supply are the existing sales documents with the same wording |
| **Admission form** | New print sheet | Student, guardian(s), course, batch, timetable, every due with its date, concessions, the tenant's own refund-policy text, the privacy notice version and consent given, signature boxes. Printable blank for paper-first centres. No promise of ranks or results (§15.1) |
| **Student ID card** | New print sheet | Card size on A4 and a phone image: logo, centre name and phone, student name, admission number, course, batch, valid until. Photo only with the ID-card consent. **No DOB, address or guardian phone** (a lost card must not expose a child). QR later |
| **Attendance report** | New, from engine 3's register (§4.7) | Per student per month for the guardian (dates, P/A/L/E, sessions held, %), and the batch register (students × dates) for the centre |
| **Settlement and refund slip** | New, from engine 1's slip (§2.6) | Period, days (or months or sessions) used and remaining, the formula with figures, invoiced, paid, heads withheld and why, computed and final amounts, override reason, refund due by, later the refund's date and mode |
| **Fee and refund policy sheet** | New print sheet | Generated from the tenant's courses and plans: fees, instalments, concessions, refund method and window. Covered centres must publish this in a prospectus [S5]; the product prints the tenant's data and words and claims nothing about sufficiency |
| **Prepared texts** | Existing share sheet; wording in LED-08's templates table, Hindi and English | Absence: "Diya was absent from Maths (7-B, 4:00 pm) today, 12 Oct. — Kapoor Classes, 98xxxxxx". Fee due: "Fees for Aarav and Diya for Nov 2026: ₹4,020, due 5 Nov. — Kapoor Classes". Also overdue, welcome and refund-paid texts. They name the student and the centre only |

## 10. Payments

- Everything is the core payments module: modes, allocation, receipts, void with reason, the local
  UPI QR. Money never passes through YourKhata. No gateway, autopay or payment links (never claim).
- A payment allocates to the payer's oldest open due across all their students unless chosen, so
  a parent paying "₹4,020 for both" settles both lines.
- **Advance**: a parent paying for three months ahead leaves an unallocated amount that the engine
  auto-applies as each month's due is raised (engine §2.9). The receipt says "advance". Whether an
  advance for a taxable fee is taxed on receipt is the CA's call (time of supply; §18 Q9).
- **Refund**: a credit note with a refund settlement against the student's invoices, then a payment
  made to the payer (the gym's path, gym.md §6.9). If the payment was by UPI, the refund's mode and
  reference are recorded; the product does not move money.
- **Payment voided** after allocation: the due reopens; late fee rules as engine §2.14 item 4.
- **GST (verified 29 Sep 2026; the tenant's CA decides, and the product gives no tax advice):**
  - Private coaching and tuition is taxable at **18%**, SAC **999293** (commercial training and
    coaching services) [S12, S13, S14]. Cultural education (music, dance, art) is **999291** and
    sports coaching **999292**, also 18% [S15].
  - The **22 Sep 2025 rate rationalisation did not change** the coaching rate or the exemption for
    recognised educational institutions (entry 66 of notification 12/2017-CT(R) was not modified)
    [S13, S14]. It cut rates on some educational stationery, which matters only for goods a centre
    sells [S14].
  - A **Gujarat AAR ruling of 20 May 2026** (Friends Classes) held that academic coaching for
    classes 5–12 is not an "educational institution" service and is taxable at 18% [S12].
  - **Yoga** is in the 5% fitness group from 22 Sep 2025 (gym.md §6.14); a yoga class run under
    the coaching module takes that tax code from its course.
  - Registration threshold for services: **₹20 lakh** (₹10 lakh in special-category states) [S16].
    An unregistered centre issues a bill of supply or an estimate by the existing preset
    `default_kinds`. The composition scheme for services was not verified in this pass.
  - **Invoice timing:** a course running more than three months with periodic payments is a
    continuous supply of services, and where the contract fixes the due dates the invoice is issued
    **on or before each due date** (CGST s.31(5)(a)) [S17]. That is why each instalment raises its
    own invoice on its due date (charge mode), and why future instalments are never invoiced early.
  - Material bundled in the fee is most likely one supply taxed as coaching; material sold
    separately is a goods sale with its own HSN (CA to confirm). SAC and tax code live on the
    **course** and are snapshotted on each due, so a later rate change leaves issued documents alone.

## 11. Search, filter and sort

| List | Search | Filters (kept in the URL, the PTY-05 pattern) | Sort |
|---|---|---|---|
| **Students** (a view over parties with a student profile, shared-engines §5.4 item 5) | Name, admission number, guardian name, 4+ digits of any mobile | Status, course, batch, teacher, session label, overdue, this month's fee status (paid, part, unpaid, skipped), concession kind, attendance below N%, minor or adult, consent to confirm, joined in period, tags | Name (default), admission no., dues, last payment, attendance %, joined |
| **Guardians / payers** | Name, mobile | Has overdue, number of students | Balance, name |
| **Enquiries** | Name, mobile | Status, source, course, follow-up due, demo date | Follow-up date, created |
| **Batches** | Name | Course, teacher, weekday, time of day, fill (over 90%, under 30%), session label | Start time, fill |
| **Attendance** | Student | Date range, batch, teacher, status, not taken, cancelled | Date |
| **Dues** (engine register) | Payer, student | Period, status, plan, course, batch | Due date, amount |

Chips carry counts over the filtered set (PTY-02).

## 12. Roles and permissions

Four system roles exist today: owner, admin, staff, accountant. Front office is **staff**. Teacher
is the one new role, and it is the same idea as the gym's proposed trainer (gym.md §12, §17 Q8):
**the architecture agent should consider one shared role (for example "instructor") with a row
scope of "the groups I am assigned to"**, rather than two module roles. Codenames follow
`module.object.action`, gated by `_ModuleEnabled`.

| Permission | Owner | Admin | Front office (staff) | Teacher (proposed) | Accountant |
|---|---|---|---|---|---|
| `coaching.enquiry.read` / `.write` | yes | yes | yes | no | no |
| `coaching.student.read` | yes | yes | yes | own batches: name, photo, batch only | read |
| `coaching.student.write` (admit, edit, guardians, consent) | yes | yes | yes | no | no |
| `coaching.course.manage`, `coaching.batch.manage`, timetable | yes | yes | no | no | read |
| `coaching.enrolment.change` (batch change, break) | yes | yes | yes | no | no |
| `coaching.enrolment.course_change` | yes | yes | no | no | no |
| `coaching.concession.grant` | yes | grantable | no | no | read |
| `coaching.withdrawal.settle` (leave with refund) | **owner role** | no* | no | no | read |
| `schedules.penalty.waive` (late fee) | yes | yes | off, grantable | no | no |
| `attendance.mark.write` | yes | yes | yes | own sessions | no |
| `attendance.mark.edit_closed` | yes | yes | no | no | no |
| `coaching.alert.prepare` (absence texts) | yes | yes | yes | off, grantable | no |
| `coaching.reports.read` | yes | yes | basic | own batches' attendance | yes |
| Sales, payments, ledger | as today | as today | as today | **none** | as today |

\* A refund moves money out and settles a regulatory obligation; like the credit-limit override it
should be a role check on owner, not a delegable codename (the LED-03 rule). Same question as gym.md
§17 Q11.

**The teacher's view**: row scope (sessions and students of batches where a timetable slot names
them) and field scope (name, photo, batch, marks; no fees, no guardian phone, no address, no school).
A guardian's phone is hidden because the centre, not the teacher, is the party the guardian
consented to (§15.2), and because a teacher leaving with the parent list is a real owner fear.

## 13. Edge cases

| # | Case | Behaviour |
|---|---|---|
| E1 | Student without a phone (normal for children) | Guardian mobile required; student's optional |
| E2 | Two guardians, separated parents | Two links, one payer, alerts to either or both; the owner can turn one guardian's alerts off |
| E3 | Payer is neither parent (grandparent, sponsor, employer) | Any party can pay; a company with a GSTIN gets a B2B invoice |
| E4 | One mobile shared by two families | Allowed; admission search shows every match with student names |
| E5 | A student in two courses | Two enrolments, one payer, one invoice with two lines; not siblings |
| E6 | Home tutor with one-student batches | Capacity 1 allowed; roll-call is one tap |
| E7 | Make-up class after a cancelled session | An extra session with the affected students; the cancelled one stays out of % |
| E8 | Substitute teacher | The session records who took it; the substitute gets that session only |
| E9 | Holiday declared after sessions were generated | Future sessions that day are cancelled with the holiday reason |
| E10 | Break declared after the due was raised | Cancel-and-reverse with a reason (engine §2.8); a payment already made becomes an advance |
| E11 | Backdated admission | Up to 30 days back with the backdated-dues confirmation (engine §2.4); older needs the owner |
| E12 | Student stops coming without a word | Dues keep being raised; "absent 10 in a row and unpaid" prompts the owner to record the leaving with the last attended date, which cancels later dues |
| E13 | Leaving request long after the last attendance | "Used" runs to the last attended date; the deadline runs from the request date; both shown |
| E14 | Refund larger than paid | Refused; a negative settlement is a balance owed (§6.3 case C) |
| E15 | Refund after the deadline | Allowed and recorded; the report shows days taken; never blocked |
| E16 | Student returns after a refund | New enrolment with the joining rule; the old settlement stays |
| E17 | Concession granted after dues were raised | From the next prepared due; a posted due only by credit note (owner) |
| E18 | Sibling on a break | Not active that period, so the other pays full; a setting can keep the discount |
| E19 | Batch moved to another time | New timetable slot from a date; a prepared text to every guardian in the batch |
| E20 | Batch over capacity after merging two batches | Allowed with a reason; flagged on the fill tile |
| E21 | Student turns 18 mid-course | "Adult since" on the profile; consent renewal prompt; payer unchanged |
| E22 | Guardian withdraws consent | Alerts stop at once; the centre decides whether the admission continues; tax records kept (§15.2) |
| E23 | Minor brought by an older sibling, no guardian present | Saved as "consent to confirm" only by owner override; no alerts or photo until confirmed |
| E24 | Imported students with balances | Opening balance on the payer; consent marked to confirm (W10) |
| E25 | Invoice for a due voided, or its entry reversed by hand | The due reopens; the engine detects the reversal (engine §2.14 item 5) |
| E26 | Scheduler down for days | Catch-up raises missed dues with their own dates (engine §2.14 item 6) |
| E27 | Exam-board fees collected for a board | A separate head; taxable value is a CA question (§18 Q10) |
| E28 | Minimum-age rule on, school-tuition batch under 16 | Owner override with a reason, in the audit log |

## 14. Validations

| Field or action | Rule |
|---|---|
| Student name | Required, 2–160 characters (party rule) |
| Date of birth | Not in the future; age 3–80; under 18 (by DOB or declaration) requires a guardian link with consent |
| Guardian | Not the student; mobile required (10-digit Indian mobile, party rule); exactly one payer per student |
| Consent | Required for a minor before save (override only by owner, E23); at least the "records" and "fees" purposes |
| Admission number | Unique per tenant; from the sequence; editable once on import |
| Course | Name unique among active courses; duration 1–60 months or open-ended; SAC 6 digits |
| Batch | Capacity 1–500; end after start; belongs to an active course |
| Timetable slot | End after start; at least one weekday; a teacher's two slots may not overlap (warn, overridable); optional warnings for more than 5 hours a day per batch or no weekly off (§15.1) |
| Fee plan (coaching) | Amount ≥ 0; instalments 1–24, percentages sum to 100 or amounts sum to the total; due day 1–28 or last; grace 0–60; late fee cap ≥ 0 |
| Admission | Batch not full (or override); start not more than 30 days back (owner: any) or 180 days ahead; minimum age rule if on |
| Concession | 0–100% or ≤ the head amount; reason required for scholarship and other; owner permission |
| Batch change | New batch of the same course, not full; effective date not before the last marked session in the old batch |
| Break | Start not in the past beyond today; length within plan limits |
| Withdrawal | Last attended ≥ enrolment start and ≤ request date; final refund 0 ≤ amount ≤ paid on the enrolment; override needs a reason (3–240 characters) |
| Marks | Session held (not cancelled), student assigned on that date, within the edit window unless permitted |
| Absence alert | Guardian has `receives_alerts` and consent for alerts; not already prepared for that session |
| Enquiry | Student or guardian name and a mobile required; follow-up date not in the past on create |

Money fields are two decimals, validated server-side; the client never pre-judges a limit from a
stale figure (the PTY-04 rule).

## 15. Legal and compliance guardrails

Not legal advice. The owner should have counsel review the consent notice, the refund-policy
wording and the minimum-age behaviour before launch.

### 15.1 The coaching centre guidelines and state law

**What the guidelines say.** The Ministry of Education's *Guidelines for Registration and Regulation
of Coaching Center 2024* (sent to states and union territories in January 2024; sources give dates
from 15 to 18 Jan) [S4, S5, S6]:
- apply to a coaching centre with **more than 50 students** [S5, S6];
- require **registration** with the competent authority, a separate registration per branch, and a
  prospectus and website showing courses, duration, fees, the exit policy and the refund
  procedure [S5, S6];
- forbid enrolling a student **below 16 years**, or before the secondary school examination
  [S4, S5];
- require tutors to be at least graduates, no misleading promises of ranks or marks, no more than 5
  hours of classes a day, no very early or very late classes, a weekly off, and a counselling
  mechanism [S5];
- require fees to be "fair and reasonable", with receipts, and **no increase during the course**,
  including hostel charges [S5, S6];
- on leaving: "If the student has paid for the course in full and is leaving the course in the
  middle of the prescribed period, a student will be refunded out of the fees deposited earlier for
  the remaining period on a pro-rata basis within 10 days", and hostel and mess fees are refunded too
  [S6];
- set penalties of ₹25,000 for a first offence, ₹1 lakh for a second, and revocation after that
  [S6, S5].

**They are guidelines to states, not a central Act.** States implement them in their own way.
Rajasthan's Coaching Centres (Control and Regulation) Bill 2025 uses a threshold of **more than 100
students**, requires pro-rata refunds of course, hostel and mess fees, forbids fee increases during
a course, requires an option of **at least four instalments**, and sets penalties of ₹50,000 and ₹2
lakh [S7, S8]. Its passage after the select committee (report 1 Sep 2025) was **not verified** in
this pass. Andhra Pradesh published draft rules in 2026 with fee transparency (candidates §3.1). A
home tutor with 35 students is outside the central definition; a school-tuition centre with 80
students of age 12 may or may not be covered depending on its state.

**What the product MUST do**
1. Compute the pro-rata settlement for every leaving, show the formula, and show the **refund due by**
   date (window setting, default 10 days) on the dashboard until the refund payment is recorded.
2. Keep the evidence: the withdrawal record, the slip, the credit note, the refund payment, and the
   refunds report with days taken.
3. Keep course fees fixed for a running enrolment by default (plan snapshot), and audit any override.
4. Issue a detailed receipt for every fee collected, with heads and period.
5. Support any number of instalments, so a centre can meet a state's minimum.
6. Let the tenant record its registration number and print it on its documents, and print its fee
   and refund policy from its own data.
7. Offer the minimum-age rule as a tenant setting that refuses under-age admission when on, with an
   owner override and a reason.

**What the product MUST NOT do**
1. Decide whether the guidelines or a state law apply to a tenant, or say that a tenant is compliant.
   No copy such as "compliant with the coaching guidelines" anywhere, including the landing page
   (candidates §4).
2. Refuse admission of minors by default. Most tuition is for school children and is outside the
   guidelines.
3. Move money, or pay a refund automatically. It records a refund the centre made.
4. Block a late refund, or hide one.
5. Ship admission-form or prospectus templates containing promises of ranks, results or selection.
6. Offer a "no refund" policy template. The tenant can write its own policy text; the product still
   computes and shows the pro-rata figure next to it.
7. Store teacher qualifications, counselling records or student-distress notes in the first version
   (they are sensitive and not needed for fees and attendance).

**Optional warnings** (tenant setting, off by default, worded as information only): a batch timetable
with more than 5 hours a day, classes before 7 am or after 9 pm, no weekly off, a test scheduled the
day after the weekly off (later, with tests).

### 15.2 Children's data: DPDP Act 2023 and the DPDP Rules 2025

- **Roles.** The centre is the **Data Fiduciary**; YourKhata, holding the records on its behalf, is
  a **Data Processor**. The platform gives the centre the means to meet its duties: notice, consent
  record, correction, erasure, export and security (the same position as gym.md §13a).
- **A child is anyone under 18.** Section 9 requires **verifiable consent of the parent or lawful
  guardian** before processing a child's data, and forbids tracking, behavioural monitoring and
  targeted advertising directed at children [S18, S21]. A breach of the section 9 duties can attract
  a penalty of up to ₹200 crore [S21].
- **Rule 10** (verifiable consent): the fiduciary must take appropriate measures to verify that the
  person consenting is an adult, using reliable identity and age details **it already holds**, or
  details the parent provides, or a virtual token from a DigiLocker provider [S19]. For a centre, the
  practical path is the first two: the parent comes in person, is known to the centre, or shows an
  ID that is **seen and not copied**. The product records the method, not the document.
- **Fourth Schedule exemption.** An "educational institution" (defined as "an institution of
  learning that imparts education, including vocational education") is exempt from section 9(1) and
  9(3) **only for tracking and behavioural monitoring for its educational activities or in the
  interest of the safety of the children enrolled** [S20]. Attendance tracking plausibly falls inside
  that for a centre that is an educational institution. **Whether a private coaching centre or a home
  tutor counts as one is not settled** in the sources read [S22], and the exemption does not cover
  fee records, reminders or photos. So the product records the guardian's consent for every minor
  regardless (§18 Q6).
- **Timing.** The Rules were notified on **14 Nov 2025**; most fiduciary duties, including consent
  for children, apply 18 months later, around May 2027 (gym.md §13a) [S18]. The module is likely to
  ship before that, so it is built compliant from the start.
- **What the module does:**
  1. A notice and consent step at admission (§3 W2), with purposes: records, fees and receipts,
     attendance, absence and fee alerts, ID-card photo. Each is a flag; alerts and photo are
     separately withdrawable.
  2. Consent sits on the guardian (or the adult student), with method, adult-verification method,
     notice version and time.
  3. **Minimisation.** Collected: names, guardian mobile, relation, DOB or a minor declaration,
     school and class (optional), photo (optional). **Not collected:** Aadhaar number or any ID copy,
     caste or category, income (a need-based scholarship records "need-based", not the evidence),
     health, marks and remarks (not in MVP), the child's own mobile unless the guardian wants it.
  4. **No profiling**: no rankings, engagement scores or marketing lists from children's data; alerts
     go to the guardian, never to the child's number by default.
  5. **Erasure.** On request, or after a tenant retention period once a student has left, the
     profile fields (DOB, school, photo, guardian links' alert flags) are erased while invoices,
     receipts and ledger lines stay for the 72-month GST retention (the party model already does
     this). The ID card and attendance register reprint with "erased" where a field was.
  6. **Access and breach**: teachers see the minimum (§12); student exports are owner-only and
     audited; the platform's incident process lets the centre notify guardians and the Board within
     the 72-hour window (gym.md §13a).

### 15.3 Messaging
The product sends nothing (DEC-012). Absence and fee texts are prepared and sent by the centre from
its own phone. That keeps the centre, not YourKhata, as the sender, and it keeps TRAI commercial
messaging rules out of the product's scope. `sms_opt_in` on the guardian party is respected as "do
not prepare texts".

### 15.4 GST
§10. The product seeds 18% / 999293 on a new course and lets the owner change it; it never labels a
course "exempt" on its own.

## 16. Reuse from core and shared engines, and what is new

### 16.1 Students, guardians and teachers are parties
Yes (vision §3 "people are always parties"). Each is a `parties_party`, with module profile tables
keyed one to one on the party (`coaching_student`, `coaching_teacher`) and a link table
(`coaching_guardian_link`). This is the same pattern as gym.md §15.1 (`gym_member`, `gym_trainer`)
and library.md (`guardian_party`). It inherits search, tags, the archive guard, consent fields,
statements, reminders and CSV import. **The profile table is the role** (the gym proposal for Q7);
the parties list gains `module_role=coaching_student` and `coaching_guardian` filters.

- The **payer** (usually the guardian) is the party whose ledger carries the dues, as `payer_party_id`
  is for the gym. Every due and line names the student.
- **Enquiries are not parties** until admitted, exactly as gym.md §15.1 argues (one name and one
  number, never a payer). The architecture agent rules on both modules together.
- **A student–guardian link is wanted by three modules** (gym `guardian_party_id`, library
  `guardian_party`, coaching `coaching_guardian_link`). **Recommendation: a core
  `parties_guardian_link` (minor party, guardian party, relation, is_payer, receives_alerts) and a
  core consent record**, rather than three local versions. Add it to the reconciliation table of
  shared-engines §0.3 as a fourth "local workaround for one concept", like the held deposit.

### 16.2 Fees through the dues engine, in charge-on-due mode
Every coaching fee is engine 1 (`schedules`) in **`charge`** mode, one `schedules_schedule` per
enrolment (`subject_type='coaching_enrolment'`), `party_id` = the payer:

| Coaching fee | `recurrence` | `amount_rule` | Join / leave policy | Notes |
|---|---|---|---|---|
| Monthly tuition | `monthly`, `by_month_day` = due day, open-ended or `until` course end | `fixed` | `by_days` (or `half_rule`) / `by_days` | The case candidates §3.11 said only the gym and rent tested |
| Course fee in instalments | `explicit_dates` (or monthly × N) | `total_split` | none (the course start) / `by_days`, `by_months` or `by_sessions` | Last instalment absorbs rounding |
| One-time course fee | `once` | `fixed` | / `by_days` | Refund is case A of §6.3 |
| Term of N classes (music) | `once` per term, or `monthly` | `fixed` | / `by_sessions` | `by_sessions` reads engine 3 |
| Registration, material, exam | heads on the first due, or a `once` schedule | `fixed` | non-refundable flag per head | Heads print on the receipt |

- **Each due raises a sales document** (invoice, bill of supply or estimate by preset) through the
  issuer seam proposed as Q3; this research agrees with the gym and shared-engines on (a), and adds a
  tax reason (§10, s.31(5)). The fallback if Q3 says no is the engine's `schedule_due` ledger entry.
- **Concessions** are `schedules_adjustment(kind='discount')` on each due as it is prepared, with the
  `coaching_concession` as its source, so the discount is one figure in one place for reports and
  prints as a line discount.
- **Late fees**: the plan's `penalty_rule` and `grace_days` (engine §2.7), waived with
  `schedules.penalty.waive`.
- **Breaks**: `schedules_pause` with `effect=skip` (engine §2.8, which already names "coaching
  holiday month").
- **Leaving**: the engine's leave calculator and settlement slip (§2.6), `schedules_adjustment(kind=
  'refund')`, and the credit-note refund path. **The 10-day window is coaching configuration**, not
  engine law (engine §2.13 "the coaching refund window"): `refund_due_by` lives on
  `coaching_withdrawal`.
- **Fixed course fee**: the plan snapshot on the schedule (engine §2.14 item 1) is the mechanism;
  coaching adds the refusal of escalation on course enrolments.
- **Two engine gaps coaching finds**:
  1. `by_months` as a leave policy (engine §2.6 has `by_days` and `by_sessions`). Small.
  2. **Sibling concessions depend on other schedules of the same payer.** The engine should call a
     vertical **amount hook at preparation** (the same listener pattern as engine 3's policy hook), so
     coaching can apply "every student but the highest" without the engine knowing about siblings.
- **Why not `expectation` mode for instalments** (invoice the whole course at admission, then
  expected dates): it would put a whole year's tax on the admission date against s.31(5)(a); a
  student leaving in month 2 would need a large credit note for money never paid; and the reminders
  list would show the whole course as owed from day one. It stays available for a centre that
  deliberately bills the full course up front (§18 Q3).

### 16.3 Roll-call through the attendance engine
Engine 3 (`attendance`), `mark_kind = presence`:
- One `attendance_group` per batch (`subject_type='coaching_batch'`); sessions generated from the
  timetable slots' recurrence (engine §1.1) and the tenant calendar; one session per slot, or one per
  day for a batch that sets "one roll-call per day".
- `attendance_group_member` rows mirror `coaching_batch_assignment` (from–to), so mid-month joiners
  and batch changes are "not enrolled" before and after, never absent (engine §4.9 item 1).
- Capture method: **roll-call** (engine §4.4 item 1), default all present.
- Policy hook: coaching returns `allow`, or `warn("₹2,400 overdue")` for front office only; it
  **never blocks** a child from class over fees. The teacher's screen does not show the warning.
- Entitlements are not used in MVP; a term of 12 classes may use them later.
- Corrections: the engine's window and `attendance.mark.edit_closed`.
- Registers and % reports: the engine's (§4.7), printed through the print pipeline.
- Naming note: gym.md §4 calls the row `checkin_event`; this document follows shared-engines'
  `attendance_mark`. The architect picks one.

### 16.4 Absence alerts through the existing reminder pipeline
- The prepared text, `UbShareSheet` (`wa.me`), and the send record (`reminders/<id>/send`) are
  reused as they are.
- **Gap:** today's reminders are about money (they carry `snapshot_balance` and key on a balance and
  due date). An absence alert is a message without an amount. Recommendation: a reminder or message
  **kind** `attendance_absence` whose subject is the `attendance_mark`, recorded through the same send
  path and history. The templates table LED-08 owns holds the wording. Gym's "not visited in N days"
  and library notices will want the same kind of non-money message.

### 16.5 Bookings engine
Not needed in the first version. Batches are standing places, not per-session bookings. Demo-class
slots and room clashes (two batches in Room 2 at 5 pm) are later consumers; in MVP a room is a label
and a clash is a warning computed from timetable slots.

### 16.6 Everything else reused
Ledger (balances, statements, aging), sales (invoices, bills of supply, credit notes with
`Settlement.REFUND`), payments (modes, receipts, UPI QR, advances), the reminders list with
`UbShareSheet` and history, `run_scheduler` + `platform_job` for the daily run, the tenant calendar
(shared-engines §1.4), the import wizard (a new template and mapper), `platform_app.services.sequences`
for admission numbers, `files` for photos, the print pipeline with tenant branding,
`permissions_registry` with `_ModuleEnabled` and per-member overrides, the activity log, and the
reports hub with CSV export. Module switch: `ModuleCode.COACHING` in `enabled_modules`, with
`MODULE_DEPENDENCIES["coaching"] = {parties, ledger, sales, payments, schedules, attendance}` (engine
codes per shared-engines Q2 option A).

### 16.7 New in the coaching module
`coaching_student`, `coaching_teacher`, `coaching_guardian_link` and `coaching_consent` (unless core
takes them, §16.1), `coaching_enquiry` (+ follow-ups), `coaching_course`, `coaching_batch`,
`coaching_timetable_slot`, `coaching_enrolment`, `coaching_batch_assignment`, `coaching_concession`,
`coaching_withdrawal`; the sibling amount hook and the attendance policy hook; the admission form, ID
card, attendance report, settlement slip and policy sheet print sheets; coaching dashboard tiles and
reports; settings (refund window, joining rule default, sibling rule, grace and late fee defaults,
default mark, alert thresholds, minimum-age rule, optional timetable warnings, registration number).

### 16.8 Overlap with the gym (the design-smell check)
Candidates §3.1 asked for coaching and gym to differ only in configuration. At the engine level they
do: the gym's academy fee cycle (gym.md W9, §6.11) is the same engine-1 configuration as coaching's
monthly tuition, and both use engine 3 roll-call. Two things are duplicated in the two proposals and
should be reconciled by the architect: **the batch** (`gym_batch` and `coaching_batch`, each a thin
wrapper around an attendance group with a timetable) and **the guardian link** (§16.1). A sports or
dance academy could run on either module; that is acceptable if both are configuration over the same
engines.

## 17. MVP vs later

**MVP (the minimum useful set for a home tutor, a tuition centre and a small institute):**
students with guardians, payer and consent for minors; enquiries with demo, follow-ups and
conversion; courses, batches, timetable, teachers, holidays; the admission flow with the dues
preview; fee plans (monthly, instalments, one-time, heads, joining rules, grace, late fee, breaks,
sibling and scholarship concessions); invoices or bills of supply per due, receipts, credit notes
and refunds through sales and payments; leaving with the pro-rata settlement, refund-due date and
slip; roll-call with corrections; absence and fee texts through the share sheet; dashboard §7;
reports §8; documents §9; roles §12; CSV import.

**Later, with reasons:**
- **Tests and marks: later, not MVP.** They move no money and do not affect dues or refunds; they
  are a child's performance data, the processing most likely to be read as behavioural monitoring
  under section 9(3), and the Fourth Schedule exemption for coaching centres is unsettled (§15.2);
  the candidates research already set "no marks in the first version"; and the larger institutes
  already run tests in an LMS (Classplus and similar centre their product on tests and content
  [S9]). First candidate after MVP, **after counsel confirms the exemption**: a test (batch, date,
  subject, maximum marks), marks per student, a printed report card for the guardian, no ranking
  across students by default.
- **Study material handouts: later.** A handout register (what was given to whom, when) is small, but
  material sold for money already works in MVP as a head or as a sales invoice with inventory
  items. Distributing files needs student or parent access, which does not exist.
- Also later: per-class billing (`from_log` over presence marks, an engine extension); session
  packs with entitlements; demo slots and room clashes through the bookings engine; teacher payouts
  (needs an expenses or payroll view); certificates; QR attendance (no reader, no student sign-in);
  a parent app, payment links or autopay (identity and a gateway, never claim); automatic sending
  (DEC-012); transport and hostels (rent or hospitality); branches (not on the platform).

## 18. Open questions for the owner

1. **First target:** home tutors and small tuition centres (monthly fees, attendance) or exam-prep
   institutes (instalments, refunds, scholarships)? The MVP covers both; the build order differs.
2. **Who carries the dues:** the payer (guardian), as recommended, so siblings share one balance, one
   reminder and one receipt; or each student's own party?
3. **Instalments as dues raising their own invoices** (recommended), or one invoice for the whole
   course at admission for centres that want it? The CA's view on s.31(5) settles most of it.
4. **Default joining rule** for monthly fees: pro-rata by days (recommended) or the half-month rule?
5. **Refund window default:** 10 days (the central guidelines), editable per tenant? Should the
   product show the window even to tenants who are not covered, as good practice?
6. **Consent for every minor** (recommended), even where a centre may be exempt for attendance under
   the Fourth Schedule? Counsel should confirm whether coaching centres and home tutors are
   "educational institutions".
7. **Minimum-age setting:** offer it, off by default, with an owner override (recommended)?
8. **Teacher role:** one shared "instructor" role with the gym's trainer (recommended), or a
   coaching-only role? Should teachers be able to prepare absence texts themselves?
9. **Late fee tax and advance tax:** accept that late fees follow the course's tax code, and take the
   CA's view on advances before build?
10. **Exam-board fees** collected on behalf of a board: a separate non-taxable head, or ordinary
    income? CA question.
11. **Sibling rule:** "all but the highest fee" (recommended) or "second and later by joining date"?
    Keep the discount during a sibling's break?
12. **Tests and marks** as the first post-MVP feature (recommended), subject to counsel on §15.2?
13. **Should the core take the guardian link and consent record** (recommended), given gym and
    library need the same thing? This is also a question for the architecture agent.

## 19. Sources

All checked on **29 Sep 2026**. Web content was read as data; product pages were used to learn how
the business runs, not copied. "Listing" means only the search result was seen.

| # | Source | URL | Used for |
|---|---|---|---|
| S1 | IMARC, India coaching institutes market | https://www.imarcgroup.com/india-coaching-institutes-market | Market size (via candidates §3.1) |
| S2 | Business Standard, MoSPI CMS Education 2025 | https://www.business-standard.com/education/news/education-mospi-survey-private-school-government-scholarship-fees-coaching-tuition-urban-rural-125082601316_1.html | 27% of students take coaching (via candidates §3.1) |
| S3 | IntelGrader, best coaching management software India 2026 | https://intelgrader.com/blog/best-coaching-management-software-india | Price points, batch sizes, expected features |
| S4 | Rau's IAS Compass, guidelines restrict coaching above 16 years | https://compass.rauias.com/current-affairs/guidelines-restrict-coaching-above-16-years/ | Definition (>50), age, tutor qualification, 5 hours, weekly off, refund, prospectus, complaints in 30 days |
| S5 | Vajiram & Ravi, Guidelines for Registration and Regulation of Coaching Center 2024 | https://vajiramandravi.com/current-affairs/coaching-centre/ | Registration per branch, prospectus contents, no fee increase, penalties |
| S6 | Entrepreneur India (Franchise India), govt issues guidelines for coaching centres | https://www.entrepreneurindia.com/blog/en/article/govt-issues-guidelines-for-coaching-centres.55425 | Exact refund wording, hostel and mess refund, receipts |
| S6b | The News Minute, guidelines and penalties | https://www.thenewsminute.com/news/govt-issues-guidelines-for-coaching-centres-violators-to-face-penalties-up-to-rs-1-lakh | Penalties, no fee increase, detailed receipt |
| S7 | PRS India, Rajasthan Coaching Centres (Control and Regulation) Bill 2025 | https://prsindia.org/bills/state-legislative-briefs/the-rajasthan-coaching-centres-control-and-regulation-bill-2025 | Threshold >100, four instalments, pro-rata refund, penalties |
| S8 | PRS India, legislative brief PDF (2 Sep 2025) | https://prsindia.org/files/bills_acts/bills_states/rajasthan/2025/Legislative_Brief_Rajasthan_Coaching_Centres_(Control_and_Regulation)_Bill_2025.pdf | Introduced 19 Mar 2025, select committee report 1 Sep 2025 |
| S9 | GetApp, Classplus | https://www.getapp.com/education-childcare-software/a/classplus/ | App-first product: online fees, tests, study material, messaging |
| S10 | Teachmint, fee management page | https://www.teachmint.com/features/fee-management-software | The standalone fee module is no longer offered |
| S11 | ClassTotal, fee management software | https://classtotal.com/fee-management-software | Instalments at admission, concessions, branded receipts, overdue lists |
| S11b | Campus 24x7, school fee structure in ERP | https://campus24x7.in/blogs/school-fee-structure-erp-setup-guide-india | Fee heads, sibling 10%, staff ward, late fee ₹50/day or flat with cap, mid-year joiners |
| S11c | Fedena, school fees management | https://fedena.com/feature-tour/school-fees-management-system | Fee particulars, discounts, fines, refunds by authorised staff, defaulters |
| S12 | Taxscan, Gujarat AAR: academic coaching taxable at 18% (20 May 2026) | https://www.taxscan.in/top-stories/academic-coaching-for-students-taxable-at-18gst-aarclarifies-scope-of-educational-institution-under-notification-read-order-1446273 | Classes 5–12 coaching not exempt; SAC 999293 |
| S13 | Tax Garden, GST on education and coaching services 2026 | https://taxgarden.in/blog/gst-on-education-coaching-services-india-2026 | 18% unchanged under GST 2.0; entry 66 not modified |
| S14 | ClearTax, GST on educational institutions | https://cleartax.in/s/gst-educational-institutions | Coaching 18%; Sep 2025 changes limited to stationery |
| S15 | ClearTax, education services SAC 9992 | https://cleartax.in/s/education-services-gst-rates-sac-code-9992 | SAC 999291–999294 at 18% |
| S16 | FeeAlert, GST and receipts for coaching institutes 2026 | https://www.feealert.in/blog/gst-income-tax-digital-receipts-coaching-institute-tutors-india-2026 | ₹20 lakh / ₹10 lakh threshold; receipt contents |
| S16b | GST Invoices, GST on coaching classes | https://gstinvoices.in/blog/gst-on-coaching-classes | 18%, SAC 999293, online coaching same |
| S17 | Indian Kanoon, CGST Act s.31(5) | https://indiankanoon.org/doc/126426153/ | Invoice on or before the due date for continuous supply |
| S18 | EY India, DPDP Act and Rules 2025 (via gym.md S20) | https://www.ey.com/en_in/insights/cybersecurity/transforming-data-privacy-digital-personal-data-protection-rules-2025 | Notified 14 Nov 2025, 18-month phasing, children |
| S19 | DPDPA.com, Rule 10 | https://www.dpdpa.com/dpdparules/rule10.html | Verifiable parental consent methods; adult = 18 |
| S20 | PrivacyLawHub, DPDP Rules Fourth Schedule | https://privacylawhub.com/bare-acts/dpdp-rules-2025/schedule-iv-fourth-schedule-exemptions-from-section-9-1-and-9-3- | Educational institution exemption and its definition |
| S21 | K&S Partners, child data protection under the DPDP Act (listing) | https://ksandk.com/data-protection-and-data-privacy/child-data-protection-under-dpdp-act-parental-consent-rules/ | Section 9 duties; the ₹200 crore penalty is from the Act's Schedule and was not re-read in this pass |
| S22 | Fox Mandal, children's data: rethinking Schedule IV exemptions | https://foxmandal.in/childrens-data-rethinking-schedule-iv-exemptions/ | Exemptions are from 9(1) and 9(3) only; coaching centres not addressed |

Code read (commit 1e2a38e): `backend/apps/parties/models.py` (`consent_source`, `consent_at`,
`sms_opt_in`), `backend/apps/ledger/constants.py` (`EntryType`, `SourceType`),
`backend/apps/sales/constants.py` (`DocumentKind` incl. `BILL_OF_SUPPLY`),
`backend/apps/common/constants.py` (`ModuleCode`, `RoleCode`),
`backend/apps/platform_app/services/tenant_settings.py` (`MODULE_DEPENDENCIES`, `module_has_data`),
`backend/apps/purchases/services/payment_seam.py` and `sales/services/payment_seam.py` (seam pattern).
