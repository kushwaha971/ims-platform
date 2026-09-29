# Candidate modules and all-in-one competitors

Status: **RESEARCH, Phase 2, 29 Sep 2026.** Written by the platform strategy and competitor research agent.
It covers Task A (which candidate modules come next) and Task B (how multi-vertical products handle
modules and pricing). It **proposes and does not decide**. Module status changes only through a CR
(vision §2), and architecture belongs to the architecture agent (vision §3 rule 5).

Scope boundary: lending, library, gym and hospitality are researched by other agents at the same
time. They appear here only where a candidate overlaps with them or shares an engine. The shared
engines are specified in [shared-engines.md](shared-engines.md).

Binding inputs: [00-platform-vision.md](../00-platform-vision.md),
[01-current-capabilities.md](../01-current-capabilities.md), `CLAUDE.md`.

Web content was read as data. Every figure below has a numbered source in §9, with the access date.
Where a page could not be fetched and only its search listing was seen, §9 says so. Treat those
claims as leads, not facts.

---

## 1. Summary

| Recommendation | Module | Why |
|---|---|---|
| **Next, first** | **Coaching and tuition** | Large demand: about 27% of school students take private coaching [S2], and the sector is worth about USD 7.2 bn [S1]. It uses the core almost entirely (parties, ledger, payments, reminders, receipts). It validates two engines at once: recurring dues (fee instalments) and attendance (batch roll-call). Regulatory risk is low and specific: the 2024 guidelines require a pro-rata refund when a student leaves [S4], which the dues engine can calculate. |
| **Next, second** | **Rent and property** | About a third of urban households rent (Census 2011) [S5], and many small landlords keep records on paper or in chat. This is the smallest module that proves the dues engine in "charge when due" mode. It also forces the one missing ledger concept that four modules need: a **held deposit** that is not income and must not offset rent (§3.2). |
| Watch list | Daily delivery subscriptions (milk, meals, water cans, newspapers) | Good fit (monthly bill from a daily delivery log, plus pause for holidays) [S17]. Not in the brief, so recorded here for the owner. Reconsider once engines 1 and 3 exist. |
| Later, as configuration | Events and venue bookings | Mostly a configuration of the bookings engine that hospitality builds first. There is no case for a separate module until that engine exists. |
| Later, as a Shop and billing extension | Service and repair job cards | Real demand, but it reuses sales and inventory, not the shared engines. It belongs in Shop and billing as a document type, not as a new vertical. |
| Defer | Housing society or association | Crowded market [S7]. Societies need audited accounts (P&L and balance sheet, which are on the never-claim list), statutory rules on arrears interest [S8] and GST thresholds [S9]. The dues engine fits; the rest does not yet. |
| Defer (fold into coaching) | School fees | 3.4 lakh private unaided schools [S13], but schools buy full school ERPs and face state fee-regulation acts [S14]. A small school that only wants fee collection can use the coaching module. |
| **Reject** | Clinics and patient records | Health data is sensitive personal data. The DPDP Act 2023 adds consent, breach notice and penalties up to ₹250 crore [S10]. The files pipeline has no field-level protection, and there is no need for the core to carry that risk. |
| **Reject** | Chit funds | Chit Funds Act 1982, s.4: "No chit shall be commenced or conducted without obtaining the previous sanction of the State Government" [S15]. Most chit groups a small user would record are unregistered. Keeping their books would be record-keeping for an unlawful scheme. Registered chit companies need foreman registers the Act prescribes, which is a specialist product. |

The lesson from the competitors (§6) is the same one the vision already states: **one contacts table,
one money ledger, one price, and switch modules on by what the business does.** The products that
split these (Zoho One's separate apps, add-on pricing in gym software) collect the most complaints.

---

## 2. Scoring method

Each candidate gets four scores from 1 to 5, where **5 is always best for YourKhata**:

| Criterion | Weight | 5 means | 1 means |
|---|---|---|---|
| **Demand** in the Indian SMB market | 30% | Millions of potential tenants, paying for software today, evidence in public data | Niche, or served only by enterprise software |
| **Reuse** of the core and the shared engines | 30% | Nearly everything is parties, ledger, payments, reminders, print, plus one or more engines | Needs new core concepts that no other module wants |
| **Regulatory risk** (inverted) | 20% | General law only (consumer protection, GST) | Licensing, sectoral regulator, or sensitive data |
| **Build size** (inverted) | 20% | S: about one sprint on top of the engines | XL: a product in its own right |

Build size assumes the three engines exist, because hospitality, gym and lending need them anyway. A
candidate that needs an engine nobody else has asked for scores lower on reuse.

---

## 3. Candidates in detail

### 3.1 Coaching and tuition (students, batches, fees, attendance)

**What the business does.** A tutor or coaching centre enrols students into batches (subject, time,
teacher). It collects a course fee, usually in instalments or monthly, records attendance, and tells
parents about dues and absences. Small centres have 30 to 60 students per batch [S3].

**Demand: 5.**
- The CMS Education survey (NSS 80th round, April–June 2025) found about 27% of students take
  private coaching: 30.7% urban and 25.5% rural. Average urban spend is ₹3,988 a year per student,
  rising to ₹9,950 at higher secondary [S2].
- IMARC sizes the coaching institute market at USD 7.2 bn in 2025, with a forecast CAGR of 10.3%
  to 2034 [S1].
- Small centres already pay ₹3,000–8,000 a month for software [S3]. That price shows willingness to
  pay, and it is also a price point YourKhata can undercut, because fees are a subset of what those
  products do.
- The long tail (home tutors, one-room centres) is exactly the paper-and-WhatsApp user YourKhata is
  built for.

**Reuse: 5.**
- Student and parent are `parties` with a role; the parent is the contact who pays.
- A fee plan (total, instalments or monthly, due dates, late fee) is the **recurring dues engine**,
  and it posts to the ledger.
- Payments, receipts (A5 print), reminders with the exact amount, statements and aging are all live.
- A batch is a group with a timetable. Roll-call is the **attendance engine**.
- A demo-class slot could use the bookings engine later, but it is not needed.
- New concepts: batch and course (thin), and the student–guardian link (which the gym and library
  modules may also want for minors).

**Regulatory risk: 4 (low, specific).**
- The Ministry of Education's *Guidelines for Registration and Regulation of Coaching Centres*
  (15 Jan 2024, sent to states to implement) [S4] require:
  - registration;
  - no students under 16;
  - a prospectus with fees;
  - a pro-rata refund of the remaining fee within 10 days when a student leaves mid-course.
- The product only records. The refund rule is still a feature requirement: the dues engine must
  compute "fee for the unexpired period" and the ledger must post the refund. States implement the
  guidelines differently; the Andhra Pradesh draft rules of 2026 add fee transparency [S4 listing].
- **Minors' data.** Students are often under 18. Under the DPDP Act the tenant (the coaching centre)
  is the data fiduciary and needs a parent's consent. YourKhata should keep only what a fee record
  needs (name, guardian, phone), with no marks, health or photos in the first version. This
  follows the same data-minimisation idea as the clinic rejection.
- GST: coaching is a taxable service. A registered centre bills at 18%, so a fee due may need to be
  issued as a tax invoice (open question Q3 in shared-engines.md).

**Build size: 4 (S–M on the engines).** Batches, a student list (a parties view), enrolment (which
creates a dues schedule and attendance membership), a batch roll-call screen, and a fee-dues report.
Tests, marks, a parent app and online classes are out of scope. Those belong to the LMS vendors
[S3], and competing with them is not the goal.

**Overlap.** Gym also has "member + plan + attendance". Coaching and gym should differ only in
configuration: gym plans are memberships with renewal and freeze, while coaching plans are
course fees with instalments and a refund rule. If the two FRDs start to look different at the
engine level, that is a design smell for the architecture agent.

**Weighted score: 4.6.**

### 3.2 Rent and property (tenants, monthly rent, deposits, maintenance)

**What the business does.** A landlord with a few flats or shops, or a hostel or shared-room
operator, collects monthly rent. They hold a security deposit, record maintenance and repair
spend, raise the rent yearly, issue rent receipts (tenants need them for their HRA claims) and settle
the deposit at move-out.

**Demand: 4.**
- Census 2011: about 31% of urban households live in rented housing, roughly 24.5 million
  households [S5]. That is ten years old, and urban renting has grown since.
- Rent receipts are a separate search market: NoBroker runs a free HRA rent-receipt generator
  [S-listing, NoBroker]. Several India-specific rent-management apps exist [S-listing: Rentrovio,
  MyRentMitra, RentOk], which shows demand but no dominant incumbent.
- The landlord with 2–20 units is under-served: property-management software targets agencies,
  and society apps target residents.

**Reuse: 5.**
- The tenant is a `party`. The unit (flat, shop, room, bed) is a thin resource record.
- Monthly rent is the dues engine in its simplest form: fixed monthly amount, due on day N, grace,
  late fee, yearly escalation.
- Maintenance and repairs are `expenses` with the unit as a tag or reference.
- Receipts, statement, reminders and UPI QR are all live.
- **The new concept is the held deposit.** Recording a ₹40,000 deposit as "you got" makes the
  tenant look ₹40,000 in advance, and the next rent would silently net against it. The ledger needs
  a way to hold money that is owed back and not available for allocation. This is the most
  important cross-module finding in this document. Gym security deposits, library refundable
  deposits, hotel advances and hall-booking advances all have the same shape (shared-engines.md
  §2.9 and Q1).

**Regulatory risk: 4 (low).**
- The Model Tenancy Act 2021 (approved 2 Jun 2021) is a *model* for states to adopt [S6]. It caps
  deposits at two months' rent for residential premises and six for non-residential. It requires a
  written agreement notified to a Rent Authority within two months.
- The product records. It should show the deposit-to-rent ratio and let the landlord note the
  agreement date, but it must not tell them the cap applies: that depends on the state.
- GST applies to commercial rent billed by a registered landlord, so the same invoice question
  arises as for coaching (Q3).
- Monthly shared-room housing can be GST-exempt at up to ₹20,000 per person per month for stays
  of 90 days or more. The hospitality research found this (hospitality.md §1, Notification
  12/2017-CT(R) as amended in 2024) and puts such stays in this candidate, not in hospitality.
- **Not verified in this pass:** TDS obligations when rent exceeds statutory thresholds (a tenant
  obligation, not the landlord's record). Do not put it in product copy until verified.

**Build size: 4 (S on the engines).** Units, tenancies (party + unit + rent + deposit + dates),
the monthly run, escalation, move-out settlement (deposit minus dues minus deductions), and rent
receipts. An owner portal, agreement e-stamping and payment collection are out of scope. There is
no gateway, and the UPI QR is already live.

**Overlap.** Hospitality covers short stays (nights, check-in and check-out). Rent covers long
stays (months). A hostel sits in between: monthly rent per bed. The boundary is **a stay billed per
night is hospitality, and a tenancy billed per month is rent.** The hospitality research reached the
same boundary independently (hospitality.md §1). Both can point at the same resource table
(shared-engines.md §3).

**Weighted score: 4.3.**

### 3.3 Housing society or association (maintenance dues, expenses, notices)

**Demand: 3.** Real and large, but served. MyGate, NoBrokerHood, ApnaComplex, ADDA and at least six
others compete, at roughly ₹200–500 a month and up, and several are free with add-ons [S7]. Their
entry point is **gate and visitor management** (guards, deliveries, facial recognition), which
YourKhata will not build. A society chooses software by committee vote, which is a slow sale.

**Reuse: 4.** Maintenance is the dues engine with one extra amount mode, per unit area (area ×
rate, plus fixed heads such as sinking fund, parking and water). Expenses, receipts and reminders are
live. Notices would be share texts, because the product sends nothing (DEC-012).

**Regulatory risk: 2 (medium).**
- **Arrears interest is capped by bye-law.** In Maharashtra, model bye-laws 68–69 allow simple
  interest up to 21% a year on overdue maintenance, and never compound [S8]. The dues engine must
  support simple-interest penalties with a ceiling, and never compounding by default.
- **GST:** 18% on the *whole* maintenance amount when a member's charge exceeds ₹7,500 a month
  *and* the society's turnover exceeds ₹20 lakh. Municipal pass-throughs are excluded from the
  threshold [S9].
- **Audited accounts.** Cooperative societies file audited annual accounts under state acts. That
  needs double-entry books (income and expenditure, balance sheet), which YourKhata does not have
  and must not claim (capabilities doc, "Never claim").
- Statutory member registers and elections are specialist and state-specific.

**Build size: 2 (M–L)** because of the accounts, not the dues.

**Recommendation: defer.** Revisit when the product has a P&L and balance sheet. Until then, a small
association (a club, a welfare group, a residents' group without a registered society) can use
the coaching or gym configuration of the dues engine for its member dues. It needs no new module
for that.

**Weighted score: 2.9.**

### 3.4 Clinics (appointments, patient records)

**Demand: 4.** Many single-doctor clinics and diagnostic centres, most on paper.

**Reuse: 2.** Appointments would use the bookings engine. Billing works today with Shop and billing.
Patient records (history, prescriptions, reports) share nothing with the core.

**Regulatory risk: 1 (high).**
- Health information is *sensitive personal data* under the IT Act SPDI rules.
- Under the DPDP Act 2023, the clinic is a data fiduciary. It must give notice, take specific,
  withdrawable consent, have a retention schedule, give access and correction rights, and notify
  breaches to the Data Protection Board and to patients. Penalties go up to ₹250 crore [S10].
- Clinical Establishments rules set record retention. Telemedicine guidelines apply if any remote
  consultation is recorded [S10].
- YourKhata's files app is local `MEDIA_ROOT` with magic-byte checks. It has no field encryption, no
  consent ledger and no breach workflow. Adding them would be an ADR-scale change for one module.

**Build size: 1 (L–XL).**

**Recommendation: reject the clinic module.** A clinic can still use YourKhata today for **billing
and dues** (Shop and billing, ledger, reminders). It can later use the bookings engine for
**appointment slots holding a name and phone only**, if the hospitality booking work makes that free.
Clinical notes, prescriptions and reports stay out of the product. This line should be written into
the product decision log so no later agent re-opens it casually.

**Weighted score: 2.2.**

### 3.5 Service and repair jobs (job cards)

**Demand: 4.** Mobile and electronics repair, appliance service, two-wheeler and car garages,
tailoring and alteration, computer service. These are numerous and paper-heavy.
Garage-specific Indian software exists (GarageSaarthi, TTN Garage, GarageBox) [S11, listings].

**Reuse: 2 for the engines, 4 for the core.** The job card flow is:
1. Receive the item (customer, item, problem, accessories left, photos).
2. Estimate, then customer approval.
3. Parts used (inventory issue) and labour.
4. Status: received → diagnosing → waiting approval → in repair → ready → delivered.
5. Invoice on delivery, with an advance taken at intake.
6. Warranty period on the repair.

GarageBox's features confirm this shape (estimates with approval, parts requisition, check-in to
checkout, invoicing) [S11]. Every step after intake is **Shop and billing** (estimate, invoice,
inventory, payments). None of it is recurring dues, bookings or attendance. The only new object
is the job card with its status and intake record.

**Regulatory risk: 5 (low).** Consumer protection and GST only.

**Build size: 3 (M).** A job card document, status board, intake print (the customer's slip),
estimate-to-invoice conversion (which the estimate flow already has) and a parts issue.

**Recommendation: later, as a Shop and billing feature, not a vertical.** It fails the vision's test
for candidates (it "comes in only if it reuses the shared engines"). It passes a different and
equally good test: it deepens the live module. Log it in `docs/BACKLOG.md` under sales.

**Weighted score: 3.4.**

### 3.6 Events and bookings (halls, venues, equipment and tent hire)

**Demand: 3.** Banquet halls, community halls, party lawns, and hire of chairs, tents, sound and
generators. Indian banquet-hall software exists (NextEvent, Banqetly, Zitlin's free banquet PMS)
[listings, S12]. Most operators use a paper diary and a WhatsApp calendar.

**Reuse: 4.**
- The booking engine handles resource = hall, full-day or session slots, a **hold** for a date
  until the advance comes in, and conflict checks.
- Money is an advance, then an instalment plan to the event date (the dues engine in
  "expectation" mode, shared-engines.md §2.4), then extras at settlement.
- Equipment hire adds quantity-based capacity (40 of 200 chairs), which the engine's capacity-N
  mode covers.

**Regulatory risk: 5.** **Build size: 4** once hospitality has built the bookings engine.

**Recommendation: later, and possibly never as its own module.** If the bookings engine lands with
hospitality, venue booking is a preset of it. Decide after the hospitality FRD, not now.

**Weighted score: 3.9**, conditional on the engine existing.

### 3.7 School fees

**Demand: 3.** UDISE+ counts about 14.9 lakh schools, of which about 3.4 lakh (about 23%) are
private unaided [S13]. But a school buys a school ERP (admissions, timetable, exams, report cards,
transport, UDISE+ returns), and those are cheap: from about ₹9,000 a year [S13]. Fee-only software
is a hard sell to a school.

**Reuse: 4** (the dues engine with fee heads, concessions and sibling discounts).

**Regulatory risk: 3.**
- Several states regulate private school fees by statute, for example the Rajasthan Schools
  (Regulation of Fee) Act 2016 [S14].
- RTE s.12 reimbursement adds a government-receivable concept.
- Minors' data rules apply to every student.

**Build size: 2** if schools expect ERP parity.

**Recommendation: do not build a school module.** Make the coaching module's fee plans general
enough (fee heads, concessions, instalments, refunds) that a small school or a hobby class can
collect fees with it. Market it as "fees and dues", not as school software.

**Weighted score: 3.1.**

### 3.8 Chit funds

**Demand: 3.** Informal rotating savings groups are common. Registered chit companies are a
regulated industry of their own.

**Reuse: 3.** Monthly contributions fit the dues engine. The auction, dividend and prize-money
arithmetic are chit-specific.

**Regulatory risk: 1 (disqualifying).**
- The Chit Funds Act 1982, s.4: no chit may be "commenced or conducted without obtaining the
  previous sanction of the State Government", and it must be registered. Sanction can be refused
  to a foreman with relevant convictions or defaults [S15].
- The Act prescribes the foreman's security, agreement, minutes of each draw filed with the
  Registrar, and books [S16].
- Most groups a YourKhata user would record are informal and therefore unregistered, so the product
  would be keeping the books of a scheme that is not lawfully conducted.
- The lending research covers the Banning of Unregulated Deposit Schemes Act 2019 (lending.md
  §15.6). Money taken with a promise to return it, under a scheme not registered with a regulator,
  is banned. How that Act treats an unregistered chit specifically was **not verified in this
  pass**. It is one more reason for counsel, not a product agent, to own this.

**Build size: 3.**

**Recommendation: reject, and put a guard on lending.** The lending FRD must not grow group
contributions, draws or auctions. If a user records a pooled scheme as individual loans, that is
their record, but the product must not offer a chit template, a chit word, or chit arithmetic.

**Weighted score: 2.6**, overridden by the regulatory veto.

### 3.9 Not in the brief: daily delivery subscriptions

Milk, meals, water cans, newspapers and laundry are all recurring deliveries with a monthly bill.
Products such as Milkride serve dairy, meals, water, produce and groceries with daily,
alternate-day and custom schedules plus billing [S17].

- The shape is a daily *quantity* log: 1.5 litres today, none on Sunday, pause while the customer
  is away. It rolls up into a monthly due.
- That is engine 3 (a mark per party per day, holding a quantity instead of present or absent) plus
  engine 1 (monthly charge computed from the log, with pause).
- It scores about **4.0** on the same method (demand 4, reuse 4, regulatory 5, build 3).

**Recommendation:** the owner may want it ahead of events. It is the strongest test that the
attendance engine is general, not gym-shaped.

### 3.10 Score table

| Candidate | Demand | Reuse | Reg. risk (inv.) | Build (inv.) | Weighted | Engines used | Verdict |
|---|---|---|---|---|---|---|---|
| Coaching and tuition | 5 | 5 | 4 | 4 | **4.6** | Dues, attendance | **Next, first** |
| Rent and property | 4 | 5 | 4 | 4 | **4.3** | Dues (+ deposit), resources | **Next, second** |
| Daily delivery subscriptions | 4 | 4 | 5 | 3 | 4.0 | Dues, attendance (quantity) | Watch list |
| Events and venues | 3 | 4 | 5 | 4 | 3.9* | Bookings, dues | After hospitality |
| Service and repair jobs | 4 | 2 | 5 | 3 | 3.4 | none (sales, inventory) | Shop and billing backlog |
| School fees | 3 | 4 | 3 | 2 | 3.1 | Dues | Fold into coaching |
| Housing society | 3 | 4 | 2 | 2 | 2.9 | Dues | Defer (needs accounts) |
| Chit funds | 3 | 3 | 1 | 3 | 2.6 | Dues | **Reject** (Chit Funds Act s.4) |
| Clinics | 4 | 2 | 1 | 1 | 2.2 | Bookings | **Reject** (health data) |

\* Only once hospitality has built the bookings engine.

### 3.11 Why coaching and rent together

The two recommended candidates were chosen as a pair, and the reason is test coverage of the engines:

| Engine behaviour | Coaching | Rent | Also exercised by |
|---|---|---|---|
| Dues: fixed instalment plan with a total | ✔ course fee in 3 parts | | lending (expectation mode) |
| Dues: open-ended monthly, charge on due | ✔ monthly tuition | ✔ | gym, library membership |
| Dues: pro-rata start and refund on exit | ✔ (the guideline) | ✔ (move-in, move-out) | gym |
| Dues: escalation (price change on a date) | | ✔ yearly | gym renewals |
| Dues: late fee, simple interest with a cap | ✔ | ✔ | society (later), lending |
| Held deposit, settled at exit | | ✔ | gym, library, hospitality, events |
| Attendance: session roll-call | ✔ | | gym classes |
| Resources: long-lived assignment (unit) | | ✔ | hospitality (nights), library seats |

If the engines are built for lending, gym and hospitality alone, the monthly-charge path gets tested
by the gym only, and the deposit gets no module that depends on it. Coaching and rent close both gaps
at small build cost.

---

## 4. What the candidates imply for the landing page and copy

- Candidates are **not** on the module map until a CR adds them (vision §2). If the owner accepts
  coaching and rent, they go in as **Planned** in `features/landing/config/modules.ts`, with text only.
- Plain words: "Coaching and tuition" (students, batches, fees, attendance) and "Rent and property"
  (tenants, rent, deposits). Avoid "PG" and other local shorthand in copy. Write "shared rooms and
  hostels" instead.
- No regulatory claims in copy. Do not write "compliant with the coaching guidelines" or "Model
  Tenancy Act ready". Say what the product does ("works out the refund for the unused months").

---

## 5. Competitor set for Task B

| Product | Type | Why it is in the set |
|---|---|---|
| **Zoho One** | Suite of 45+ separate apps, one licence | The clearest "many apps, one bill" in India |
| **Odoo** | One database, installable apps | The clearest "many modules, one data model" |
| **Vyapar** | Single billing app with settings toggles and industry pages | The closest Indian SMB competitor to Shop and billing |
| **myBillBook** | Single billing app, tiered plans | Same market, tier-by-feature pricing |
| **Square** | Vertical editions merged into one app in 2025 | A recent, public reversal from per-vertical products |
| **Gym and studio SaaS** (Mindbody, Glofox, PushPress, Gymdesk) | Vertical SaaS with add-on modules | Shows what per-module pricing does to small businesses |
| **Khatabook** | Ledger app that expanded by launching and buying separate apps | The Indian ledger-app incumbent's expansion pattern |

---

## 6. How they structure modules, and what they get right and wrong

### 6.1 Zoho One

**Structure.**
- More than 45 separate applications (CRM, Books, People, Desk, Projects and others) under one
  licence, with a unified directory and admin [S18, S21].
- Each app has its own navigation, settings and data model. The suite is a bundle of products.

**Pricing.**
- Two models. **All-employee**: every person on the payroll must be licensed. In India that is about
  ₹1,500 per employee a month or ₹18,000 a year. **Flexible**: about ₹3,500 per named user a month
  [S19]. The global page lists Flexible Standard at USD 90 per user per month [S18].
- 18% GST on top in India [S19].
- The trial unlocks everything [S18].

**What it gets right.**
- One price for everything. Reviewers consistently call it the most software per rupee [S20].
- The trial shows the whole thing, so users discover modules.

**What it gets wrong.** This is the most instructive part for YourKhata.
- **The apps do not share data by default.** "Zoho One is sold as an integrated suite but doesn't
  always behave like one out of the box" [S20]. Reviewers report "manual re-entry of company details
  across multiple apps" and separate order processing between CRM and Books [S21], and "nothing
  syncs properly … event subscriptions are incomplete and inconsistent across modules" [S22].
- **Navigation fragments.** Each app is its own UI. Reviewers call the interface "cluttered and dated",
  say it needs more clicks [S20], and mention hours of how-to videos [S22].
- **Onboarding is long.** Timelines run from weeks to 10+ months for full activation. Phased rollouts
  beat big-bang ones [S21].
- **Unused breadth.** "With so many apps included, some feel basic or outdated" [S22].
- All-employee licensing forces a business to pay for people who never log in [S19].

**Lesson for YourKhata.** This validates vision rule 3: one parties table, one ledger, one print
pipeline. A vertical that keeps its own member list or its own balance recreates Zoho's worst
review. Also: **enable few modules at signup, and let the rest be found later.** Do not switch on
everything because it is free.

### 6.2 Odoo

**Structure.**
- One database and one data model. Apps are *installed* into it and bring their dependencies with
  them (installing a sales app pulls in the invoicing pieces it needs).
- Every app uses the **same contacts model** (`res.partner`) for customers, vendors, individuals and
  even system users. A contact can be both customer and supplier [S25].
- One web client, one navigation pattern (an app launcher, then the same list, form and kanban views
  in every app).

**Pricing.**
- **One App Free**: one app, unlimited users, free for ever [S23].
- **Standard**: all apps, per user (USD 24.90 a month on the yearly plan globally). In India it is
  about ₹580–725 per user a month yearly, or ₹760 monthly [S23, S24].
- **Custom**: adds Studio, multi-company and API access (about ₹1,080–1,350) [S24].
- Pricing is per user, not per app, and portal users (customers, suppliers) are free [S23].

**What it gets right.**
- **A single partner model** is the exact pattern the vision mandates for `parties`, proven at scale.
- **Dependencies are automatic.** `MODULE_DEPENDENCIES` is the same idea. YourKhata already refuses a
  module whose dependencies are off, and it could also turn them on in the same step (§7.4).
- **"One app free"** is an honest free tier that maps well onto "core + one vertical free".
- **Consistent views** across apps, so learning one app teaches all of them.

**What it gets wrong.**
- The per-user price hurts in India, where a shop has one or two logins. India is one of Odoo's more
  expensive price tiers relative to local purchasing power [S24].
- Implementation often needs a partner. That is not a model for a self-serve SMB product.
- Configuration depth (Studio, many settings) is power for a mid-size firm and noise for a tutor.

**Lesson.** Copy the data model and the dependency behaviour. Do not copy per-user pricing.

### 6.3 Vyapar

**Structure.**
- One billing app. It markets industry solutions (retail, pharmacy, grocery, restaurant, jewellery,
  clothing, distribution) [S26].
- Behaviour changes through **settings toggles**: estimates, orders, delivery challans, batch,
  serial and expiry tracking, barcode and so on [S26]. From the feature list, the industry pages
  appear to be marketing over one configurable app, not separate builds. That is an inference, not
  a Vyapar statement.

**Pricing.** The mobile app is free. The desktop app has a 15-day trial, then a premium licence.
The fetched page gave no prices [S26].

**What it gets right.**
- One app, and industry fit by configuration. This is YourKhata's PLT-03 preset rule ("presets never
  hard-wire behaviour").
- Industry landing pages capture search traffic ("billing software for pharmacy") without forking
  the product.

**What it gets wrong (risk for YourKhata).**
- Toggles pile up in one settings screen, and every industry's options are visible to every
  business.
- YourKhata's answer is module-level switches (`enabled_modules`), with settings inside each
  module, so a gym never sees batch-expiry settings.

### 6.4 myBillBook

**Structure.** One billing app. It has no industry editions on the pricing page [S27].

**Pricing.** Tiers by feature and seat [S27]:
- **Plus**: ₹3,490 a year, 1 business, 1 user plus a CA.
- **Pro**: ₹3,990 a year. Adds the desktop app, messaging credits and unlimited warehouses.
- **Pro Max**: from ₹6,840 a year, 2 businesses and 3 users. Adds e-way bill, e-invoice, POS and
  **recurring billing**.
- It also offers multi-year discounts and a 7-day refund.

**Lessons.**
- The **price anchor** for Indian SMB billing is about ₹3,500–7,000 a year. A YourKhata vertical
  priced as a separate ₹3,000–8,000 *per month* coaching product [S3] would be out of line with the
  core. Priced inside a plan, it is a strong wedge.
- myBillBook puts **recurring billing** in its top tier. Recurring dues are a premium feature in the
  shop market, which supports making the dues engine a core strength.
- Seat counts and business counts are the upgrade levers, not modules.

### 6.5 Square: the reversal

**What happened.**
- Square used to sell vertical products (Square for Retail, Square for Restaurants, Square
  Appointments) with separate subscriptions: 18 à la carte subscriptions in all.
- On **6 Oct 2025** it replaced them with three unified plans: Free, Plus (USD 49 per location a
  month) and Premium (USD 149).
- Industry fit now comes from "seven point-of-sale modes" inside one adaptable app [S28].
- Square's stated reason was complexity for sellers. It also reported that seller cohorts adopting
  its software see 9% higher sales [S28].

**Lesson.**
- This is the strongest recent evidence against per-vertical pricing and per-vertical apps.
- It is also evidence *for* a "mode" that shapes the home screen and default navigation by business
  type. That is exactly what `enabled_modules` plus a primary-module setting can do (shared-engines
  §5).

### 6.6 Gym and studio vertical SaaS

**Pricing patterns** [S29]:
- tiers by active member count (for example Gymdesk USD 75–200, Zen Planner USD 99–289);
- feature tiers (PushPress Free, Pro, Max);
- **module add-ons** (a CRM and marketing module at USD 329 a month on top);
- "contact sales" for base prices;
- payment-processing margins of 2.75–4.99%.

**What goes wrong.**
- "Starting at $159" became "$664+/mo" after add-ons [S29].
- A pricing page that promises "transparent pricing" while showing no prices [S29].
- Revenue from payments and marketplace commissions.

**Lesson for YourKhata.**
- Per-module add-on pricing is where small-business trust is lost. YourKhata has no gateway and
  takes no payment margin, and that is a selling point to state plainly.
- The honest-landing-page rule already forbids the "no hidden fees on a page with no prices" pattern.

### 6.7 Khatabook

Khatabook grew by **launching and buying separate apps** rather than adding modules inside the
ledger:
- it bought Biz Analyst in 2021 [S30 listing];
- it launched staff and payroll apps in 2020 to compete with PagarBook [S31 listing].

This is the opposite pattern to the vision. The user ends up with several apps, logins and
contact lists, which is the Zoho failure in a smaller form. It is also a positioning opportunity:
"one app, one contacts list, one ledger" is a claim the ledger-app incumbent's portfolio cannot make.

### 6.8 Cross-cutting findings

| Dimension | Gets it right | Gets it wrong | YourKhata position (existing or proposed) |
|---|---|---|---|
| **Data sharing** | Odoo: one contacts model, one DB | Zoho: separate apps, manual sync, re-entry | **Existing rule.** One `parties`, one ledger. Verticals never import each other. Engines are shared. |
| **Navigation** | Odoo: same views in every app. Square: one app, modes | Zoho: every app its own UI. Vyapar: one long settings list | Navigation is data (`sidebarConfig`), filtered by `enabled_modules`. Proposed: a primary module orders the menu and home (shared-engines §5.4). |
| **Onboarding** | Square: business type picks a mode. Odoo: pick apps, dependencies follow | Zoho: everything on, months to activate | Business type → preset → a *suggested* set of modules the user confirms. Only live modules are shown. Dependencies are switched on automatically. |
| **Pricing** | Odoo: one price, all apps. Square 2025: unify. myBillBook: tiers by seats and businesses | Gym SaaS: add-ons. Zoho: all-employee licensing | **Proposed for the owner:** price by tier (seats, businesses, record limits), with modules included and not sold one by one. `plan.modules` can already gate modules if the owner chooses otherwise. |
| **Breadth vs depth** | Square: modes, not products | Zoho: 45 apps, many shallow | Few verticals, each built on shared engines. Reject candidates that need their own core (clinics, societies for now). |
| **Customer-facing brand** | | Many vertical SaaS products brand the member app or receipt | **Existing rule.** The tenant's name only on every document. |

### 6.9 Pricing mechanics already in the code (for the owner's decision)

- `_seed_modules` computes BASE ∪ {inventory if the preset says so} ∩ `partner.allowed_modules`
  ∩ `plan.modules`.
- `_ModuleEnabled` checks `effective_modules(tenant)` from `platform_app.services.entitlements`.

So the code **can already** do per-plan module gating (a "Coaching" plan whose `plan.modules`
includes `coaching`) without new mechanism. The research recommendation is still **not to**:

1. **Square's 2025 unification [S28] and the gym add-on complaints [S29]** both point away from
   selling modules separately.
2. **A multi-vertical tenant is YourKhata's advantage.** A coaching centre that also sells books,
   or a gym that sells supplements, should not pay twice for one ledger.
3. **The free plan can be "core + Shop and billing + one vertical".** That is Odoo's "One App Free"
   translated to this product [S23]. The paid tiers then lift seats, businesses and limits, as
   myBillBook does [S27].

Pricing is the owner's call. The landing page already says module pricing is decided at launch
(STATUS.md, Phase 1).

---

## 7. Recommendations for the next phases

1. **CR to add two candidates as Planned:** Coaching and tuition, then Rent and property. They
   are researched here to FRD-ready depth for their shared parts. Their own research docs
   (`research/coaching.md`, `research/rent.md`) can be short, because §3.1 and §3.2 are most of it.
2. **Record the rejections in the decision log (Part 39):** clinics (health data, DPDP) and chit
   funds (Chit Funds Act s.4). Also record the lending guard: no pooled or chit arithmetic.
3. **Backlog:** job cards under Shop and billing. Venue booking as a bookings preset, to be revisited
   after the hospitality FRD. Daily delivery subscriptions on the watch list.
4. **Architecture agent inputs:** the held-deposit concept (Q1 in shared-engines.md) and the
   "due as a tax invoice" question (Q3) block coaching and rent, and they also block gym and
   hospitality. They need ADRs before any FRD's database section is written.
5. **Owner:** pricing by tier rather than by module (§6.9).

---

## 8. Open questions for the owner

1. Should the daily delivery subscriptions candidate be taken ahead of events? It was not in the
   brief.
2. Should small associations and clubs be told they can use the coaching or gym configuration for
   member dues, or is that a separate positioning?
3. Pricing: tiers with all modules included (this research's recommendation), or modules per plan
   (which the code already supports)?

---

## 9. Sources

All accessed **29 Sep 2026**. "Listing" means only the search-result title and URL were seen, and
the page itself was not fetched. Treat those as leads.

| # | Source | URL |
|---|---|---|
| S1 | IMARC, *India Coaching Institutes Market* (USD 7.2 bn 2025; 10.29% CAGR 2026–34) | https://www.imarcgroup.com/india-coaching-institutes-market |
| S2 | Business Standard, MoSPI CMS Education 2025 (NSS 80th round, Apr–Jun 2025): 27% take coaching; spend by level | https://www.business-standard.com/education/news/education-mospi-survey-private-school-government-scholarship-fees-coaching-tuition-urban-rural-125082601316_1.html |
| S3 | IntelGrader, *Best Coaching Management Software India 2026* (₹3,000–8,000/month for small centres; 30–60 per batch) | https://intelgrader.com/blog/best-coaching-management-software-india |
| S4 | India TV, MoE *Guidelines for Registration and Regulation of Coaching Centres 2024* (15 Jan 2024; pro-rata refund within 10 days; minimum age 16) | https://www.indiatvnews.com/education/news/ministry-of-education-releases-guidelines-to-regulate-coaching-centers-details-here-2024-01-18-912448 |
| S4 listing | Careers360, Andhra Pradesh draft coaching rules 2026 | https://news.careers360.com/andhra-pradesh-draft-coaching-institutions-regulation-control-rules-2026-mandatory-wellness-cells-dlmc-monitoring-fee-transparency/amp |
| S5 | Ideas for India, *India's housing situation* (Census 2011: 69% of urban households own, so about 31% rent) | https://www.ideasforindia.in/topics/macroeconomics/indias-housing-situation |
| S6 | PRS India, *The Model Tenancy Act, 2021* (approved 2 Jun 2021; deposit caps 2 and 6 months; Rent Authority) | https://prsindia.org/billtrack/the-model-tenancy-act-2021 |
| S-listing | NoBroker rent receipt generator; Rentrovio; MyRentMitra; RentOk (rent-app market) | https://www.nobroker.in/online-rent-receipt-generator/ · https://rentrovio.com/best-rent-management-app-india · https://www.myrentmitra.in/blog/best-rent-management-software-india-2026 · https://rentok.com/blogs/growth/best-apps-for-landlords-to-collect-rent-in-2023 |
| S7 | NoBroker, *Top 10 Society Management Apps in India* (competitors and price points) | https://www.nobroker.in/blog/society-management-apps/ |
| S8 | LawCrust, *Penalty charges in societies: legal limits in Maharashtra* (bye-laws 68–69; 21% simple p.a.) | https://lawcrust.in/penalty-charges-society-law/ |
| S9 | ClearTax, *GST on housing maintenance charges* (₹7,500 per member per month and ₹20 lakh turnover; 18% on the full amount) | https://cleartax.in/s/gst-housing-maintenance-charges |
| S10 | Ring2Doc, *DPDP Act compliance for clinics* (consent, breach notice, penalties up to ₹250 crore; SPDI; CE rules) | https://ring2doc.com/blog/dpdp-act-compliance-for-clinics |
| S11 | GarageBox, repair and service centre software (job card flow) | https://www.garagebox.io/en/solutions/repair-and-service-centre-management-software |
| S11 listing | GarageSaarthi; TTN Garage | https://garagesaarthi.com/solutions/auto-repair-shop-software/ · https://tightthenut.com/ |
| S12 listing | Banqetly; NextEvent; Zitlin (banquet software in India) | https://banqetly.com/banquet-management-software-india-2025/ · https://nexteventapp.com/ · https://zitlin.com/pms/free-banquet-hall-management/ |
| S13 | EduGradUP, *How many schools are in India* (UDISE+: about 14.9 lakh schools, about 3.4 lakh private unaided; ERP from ₹9,000/yr) | https://schoolsoftwareindia.com/blog/how-many-schools-in-india/ |
| S14 listing | Rajasthan Schools (Regulation of Fee) Act 2016, India Code | https://www.indiacode.nic.in/bitstream/123456789/18865/1/14_of_2016.pdf |
| S15 | Indian Kanoon, Chit Funds Act 1982, s.4 | https://indiankanoon.org/doc/174502023/ |
| S16 listing | Chit Funds Act 1982, full text, India Code | https://www.indiacode.nic.in/bitstream/123456789/15355/1/the_chit_funds_act,_1982.pdf |
| S17 | Milkride (subscription delivery: dairy, meals, water; daily, alternate and custom schedules) | https://milkride.com/ |
| S18 | Zoho One pricing page (All Employee vs Flexible; USD 90 Flexible) | https://www.zoho.com/one/pricing/ |
| S19 | Sirius Star, *Zoho One India pricing* (₹1,500/employee/month; ₹3,500/user/month; 18% GST) | https://siriusstar.in/cloud-solutions/zoho-one-india-pricing/ |
| S20 | Featurebase, *Zoho review 2026* | https://www.featurebase.app/blog/zoho-review |
| S21 | The Ravenlabs, *Honest Zoho One review 2026* | https://www.theravenlabs.com/zoho-one-review-2026-tested-all-45-apps-heres-what-actually-works/ |
| S22 | Capterra, Zoho One reviews | https://www.capterra.com/p/166175/Zoho-One/reviews/ |
| S23 | Odoo pricing page (One App Free; Standard and Custom per user; all apps) | https://www.odoo.com/pricing |
| S24 | OEC.sh, *Odoo pricing in India* (INR per user) | https://oec.sh/odoo-pricing/india |
| S25 | Odoo Tricks, *Contacts / partners in Odoo* (`res.partner` across apps) | https://odootricks.tips/about/odoo-applications/contacts-partners-in-odoo/ |
| S26 | Vyapar, feature list (industry solutions; settings toggles) | https://vyaparapp.in/blog/vyapar-app-features/ |
| S27 | myBillBook pricing plans (Plus, Pro, Pro Max) | https://mybillbook.in/pricing-plans |
| S28 | Square press release, unified pricing and packaging (6 Oct 2025) | https://squareup.com/us/en/press/unified-pricing-and-packaging |
| S29 | Gymdesk, *Gym software cost guide 2026* | https://gymdesk.com/blog/gym-management-software-cost |
| S30 listing | Entrackr, *Khatabook acquires Biz Analyst* (Mar 2021) | https://entrackr.com/2021/03/khatabook-acquires-biz-analyst/ |
| S31 listing | Entrackr, *OkCredit and Khatabook enter PagarBook's forte with new apps* (Nov 2020) | https://entrackr.com/2020/11/exclusive-okcredit-and-khatabook-enter-pagarbooks-forte-with-new-apps/ |

Internal sources: `backend/apps/platform_app/services/onboarding.py` (`_seed_modules`),
`services/presets.py` (PLT-03 FR-7/FR-8), `apps/common/permissions.py` (`_ModuleEnabled`),
`frontend/…/features/navigation/sidebarConfig.ts`, all read at commit e5d68c7.
