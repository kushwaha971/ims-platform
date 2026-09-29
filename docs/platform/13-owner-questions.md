# Questions for the owner

Status: **OPEN, 30 Sep 2026 (architecture owner, Phase 3 step 3).** Every owner-level question the
five FRDs raised, plus the ones left in 10-architecture §16 (which this list supersedes),
de-duplicated and ranked by how much of the build waits on them. **Each has a default that the
build uses if there is no answer**, so nothing blocks work in progress; an answer that differs from the
default is a CR and, where it says so, a small change.

Where each question came from is in the "Raised by" column: `00` = frd/00-core-and-engines.md,
`LIB`, `LEN`, `GYM`, `HTL` = the module FRDs, `10-arch` = 10-architecture.md.

---

## 1. Decisions needed before Wave A merges

| # | Question | Default the build uses | Why it matters | Raised by |
|---|---|---|---|---|
| **Q1** | **Three new module roles** — `lending_agent` (collection agent), `gym_trainer` (trainer), `hospitality_housekeeping` (housekeeping) — as system roles owned by their modules (ADR-052). They amend **canon §0.9** (four fixed roles), and the same CR widens its closed action set to the actions the code already uses (`read_all`, `reveal`, `void`, `adjust`, …), adds each module's codenames to the `staff` and `accountant` sets per its FRD, and renames lending's `id_read` to `reveal` (ADR-058) | **Adopt all three**; one canon CR for all four modules | Row scoping cannot be built safely without them: a `staff` member can read every party and balance through core screens (ADR-052). Wave A task A13 builds the mechanism; each role row ships with its module | 10-arch §16.1; LEN CQ-12, §A; GYM Q1, C13; HTL Q2, C11, C16 |
| **Q2** | **A new core permission `platform.calendar.manage`** (owner, admin) for tenant-wide closed days, so an admin can enter a holiday without the owner-only `platform.tenant.manage`; a module's own holidays need only its settings codename | **Adopt** (in the Q1 CR) | Wave A task A9b; libraries and gyms are run by admins | 00 CQ-25; LIB C8 |
| **Q3** | **Shop write-off cap.** The existing "write off a small balance" (LED-11) defaults to, and is capped at, the **trade** balance (balance minus loan outstanding), so a shop write-off can never forgive a loan; loans are forgiven only by lending's own write-off | **Cap at the trade balance** (a CR amends LED-11) | Wave A task A2. Without the cap, one tap on a shop screen could silently forgive a loan | 00 CQ-22 |

## 2. Decisions the modules' defaults depend on

| # | Question | Default the build uses | Raised by |
|---|---|---|---|
| **Q4** | **Lending allocation order**: which part of a collection is settled first | **`fees_last`** — every scheduled instalment due now before any late fee, so a small fee never keeps a borrower in arrears (borrower-fair). `fees_first` (common lender practice) and `oldest_first` are offered as a setting | 10-arch §16.3; LEN §A, R§18 Q6 |
| **Q5** | **Reminder windows for modules other than lending.** Lending is fixed at 08:00–19:00, one reminder per loan per day, fixed templates (ADR-054; a tenant may narrow it, never widen it) | **No window** for library, gym and hospitality (today's behaviour); a tenant may set one. Alternative: 08:00–21:00 for every module | 10-arch §16.4; GYM Q5, §Defaults; LIB D21; LEN §A |
| **Q6** | **Grace days defaults** | **Gym 5 days** (grace keeps a member "in grace" after expiry; research offered 0/3/5/7). **Library 0** per membership type (grace waives the fine, never shifts it). **Lending 0** (a late fee needs its own agreed grace, 0–90). **Dues plans 0** | GYM Q2; LIB D5; LEN §A |
| **Q7** | **Gym's first target**: the independent gym (renewals and dues) or the studio/academy (batches and monthly fees) | **Independent gym**; academy monthly fees (GYM-22) follow immediately after the MVP | GYM Q6 |
| **Q8** | **Front-desk discount at the hotel** without the owner | **10% per night**, a setting (0% is the cautious choice) | HTL Q6 |
| **Q9** | **ID rule and Form III.** Only an ID's type and last four characters are stored, never an image (ADR-053, binding). Foreign guests' full passport and visa numbers are typed into e-FRRO by the clerk from the passport and not kept | **As ADR-053**; a hotel that must keep a copy keeps paper. A lawyer confirms (L-group, HTL TL-17) | 10-arch §16.2; HTL TL-17 |
| **Q10** | **Staff may create loans; agents may void their own collection** | Staff **may not** create loans (granted per member); an agent may void their own collection within **15 minutes** | LEN §A, R§18 Q8, Q9 |
| **Q11** | **Gym member fields**: gender, and transfers | Gender **off** (on for women-only batches); transfers **allowed, no fee** | GYM Q3, Q4 |
| **Q12** | **Reading rooms**: part of Library or their own module card | **Under Library**, built later on the bookings, dues and attendance engines; no seat table in the MVP | LIB D1 |
| **Q13** | **Hotel defaults**: security deposit, ID retention | Security deposit **off** (a held deposit when turned on); guest ID data purged **365 days** after check-out (floor 180) | HTL Q8, Q10 |
| **Q14** | **Two settings the code shows but ignores**: `sales.default_kind` (never read; sales chooses by GST type) and `reset_fy = false` on number series (ignored; every series resets each financial year) | **Remove both from the settings screen** until they are wired; module documents use sales' `kind_for` | 10-arch §16.5, §14 items 1 and 4 |
| **Q15** | **Lending rate-ceiling warning** | **Ships empty** (the tenant sets a figure); a default figure could read as legal advice. Lawyer confirms (L1) | LEN §A, R§18 Q1 |

## 3. Tax items for a chartered accountant (grouped)

The product implements the reading in each FRD until a CA answers; each answer is a CR. Those marked
**R** block the module's release.

| # | Group | Items | Default reading |
|---|---|---|---|
| **Q16** | **Gym GST** | T1 rate and SAC (5% without ITC, SAC 999723) **R**; T2 sports academies at 18%; T3 charitable entities; T5 composition; T6 joining fee; **T7 instalments invoiced part by part** (decides ADR-059) **R**; T8 pro-rata credit notes; T9 cancellation charge; T10 transfer and freeze fees; T11 advances before an invoice; T12 corporate ITC; T13 credit-note round-off; T14 rate changes; T15 input credit on the gym's purchases; T16 place of supply | GYM §Tax review items |
| **Q17** | **Unregistered tenants' document title** | Gym T4 and hospitality TL-21: should an unregistered business's document say "Bill of supply" rather than "Invoice"? Sales issues a tax-free "Invoice" today (`kind_for`) | Sales' `kind_for` unchanged |
| **Q18** | **Hotel GST** | TL-1 room slab bands and dates **R**; TL-2 early/late date belonging; TL-3 extra bed; TL-4 meal plans; TL-5 cancellation and no-show rate; TL-6 dorm beds; TL-7 the inclusive-price gap; TL-8 which date decides the slab; TL-9 GST on advances **R**; TL-10 place of supply (CGST + SGST at the property); TL-11 per-night discounts; TL-12 specified premises; TL-13 registration mid-stay; TL-14 OTA-prepaid bookings and TCS; TL-15 complimentary nights; TL-20 forfeited deposits; TL-22 early check-out retention; TL-23 long-stay invoice timing; TL-24 round-off; the `NOS` unit for nights (R71) | HTL §Tax/legal review items |
| **Q19** | **Lending and cash** | L7 the ₹20,000 cash warning's wording and sections after the Income-tax Act 2025 renumbering **R**; L8 the effective-yearly-rate method (with a lawyer) **R**; L11 write-off after recovery (with a lawyer) | LEN §B |
| **Q20** | **Library GST** | Library charges are non-GST ledger charges; a private library that must charge GST raises invoices through the sales module (a document posting option later) | LIB D3 |

## 4. Legal items for a lawyer (grouped)

| # | Group | Items | Default reading |
|---|---|---|---|
| **Q21** | **Lending — before release** | L2 "not a loan agreement" line **R**; L4 processor terms (DPA) **R**; L6 serving unregistered lenders (e.g. Karnataka 2025), licence number at sign-up **R**; L8 effective rate (with the CA) **R**; L9 reminder templates and the forbidden-words list **R**; L10 the closure letter's sentence **R** | LEN §B |
| **Q22** | **Lending — later** | L1 ceiling figure; L3 retention and erasure; L5 "money borrowed" under the BUDS Act; L12 ID kinds; L13 yearly statements; L14 the "adds up to more than lent" line; L15 fixed daily plans above state rates | LEN §B |
| **Q23** | **Guest data and registers** | TL-16 Form III under the 2025 Act (Nepal and Bhutan citizens); TL-17 type plus last four for state registers and Form III (see Q9); TL-18 retention 365 days; TL-19 DPDP notice wording, legitimate use, the Aadhaar verifying-entity rule | HTL §Tax/legal review items |
| **Q24** | **Gym consent and minors** | The consent notice text and version; guardian consent for minors; health declaration recorded as a date only | GYM §Defaults, GYM-21 |

## 5. Already decided — not to be re-asked

Recorded so they are not raised again: deposits (ADR-044); the accession counter (ADR-051); fines
skip closed days and grace waives (LIB D4, D5); refunds are owner-only (gym, library); freezes always
extend the end date; trainers see no money and no mobiles by default; no Aadhaar numbers or ID images
(ADR-053); QR scanning only where the browser supports it (ADR-025); co-guests are register rows
(ADR-046); every hotel stay has a party; OTA channel managers stay in the backlog (ADR-021).

## 6. Ranking, in one line each

1. Q1 module roles and the canon §0.9 CR · 2. Q2 `platform.calendar.manage` · 3. Q3 write-off cap ·
4. Q4 lending allocation order · 5. Q5 reminder windows · 6. Q6 grace days · 7. Q16–Q20 the CA
group (T7 and TL-1/TL-9 first) · 8. Q21 the lending lawyer items that block release · 9. Q9 the ID
rule and Form III · 10. Q7 gym's first target · then Q8, Q10–Q15, Q22–Q24.
