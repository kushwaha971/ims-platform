# Lending and collections: module research

Status: **Phase 2 research, 29 Sep 2026.** Research only. Nothing here is a decision. The
architecture agent decides ADRs (vision §3 rule 5) and the owner decides scope. This file feeds
`docs/platform/frd/lending.md` (Phase 4) and the reuse review (Phase 5).

Binding inputs: [00-platform-vision.md](../00-platform-vision.md) (module map, rules, terminology),
[01-current-capabilities.md](../01-current-capabilities.md) (what is live), `CLAUDE.md`, and the
house style of `docs/17-02-frd-ledger-payments.md`. The module code is `lending`. It isn't in
`ModuleCode` yet (`apps/common/constants.py`).

**The one-sentence position.** YourKhata keeps the lender's register: who borrowed what, on what
terms, what fell due, what was collected, by whom, and what is left. It does not lend, move
money, score anybody, take deposits or chase borrowers. Every design choice below follows from
that sentence and from §15.

Terminology. This file uses plain words: *borrower*, *lender*, *loan*, *instalment*,
*collection*, *collection route*, *collection agent*, *money borrowed*. Regional names for daily
schemes, routes and interest styles are deliberately left out (vision §4).

---

## 1. Core use cases

| # | Use case | Who | How often |
|---|---|---|---|
| UC-1 | Record a new loan: borrower, principal, cash actually handed over, interest terms, frequency, tenure, first due date. The schedule is generated. | Owner | Several a week |
| UC-2 | See who is due today, in route order, and how much each owes today. | Owner, agent | Daily, often before 8 am |
| UC-3 | Record a collection (full, part, or more than due) and give a receipt. | Agent, owner | Tens to hundreds a day |
| UC-4 | Know what is pending and overdue, per loan, per borrower, per route and in total. | Owner | Daily |
| UC-5 | Send a polite, exact reminder from the lender's own phone. | Owner, agent | Daily |
| UC-6 | Add a late fee the loan terms allow; waive interest or a fee with a reason. | Owner | Weekly |
| UC-7 | Close a loan: normal completion, early closure with a payoff figure, or a top-up that folds the old loan into a new one. Issue a closure letter. | Owner | Weekly |
| UC-8 | Show the borrower their full history: a statement with the schedule, every collection and the balance. | Owner | On demand, and yearly |
| UC-9 | End of day: how much each agent collected, by mode, against what was due. | Owner | Daily |
| UC-10 | Month end: principal out, interest earned, collections, arrears. | Owner, accountant | Monthly |
| UC-11 | Correct a mistake without erasing it: a wrong amount, the wrong borrower, a duplicate. | Owner | Weekly |
| UC-12 *(later)* | Record money the lender has itself borrowed from family or partners, and the interest owed on it. | Owner | Monthly |

Out of scope: pawn and gold loans (separately regulated, and the Karnataka 2025 law bans pledges
on small loans), chit funds (the Chit Funds Act, 1982), group or joint-liability microfinance, loan
origination (applications, KYC checks, bureau pulls), disbursing or collecting online, and
anything that locks or tracks a borrower's device.

## 2. Target users and personas

The market, from the competitor survey in §17 and the sources: individual lenders and small
finance firms with 10 to 500 active loans, often split into two to six collection routes of 30 to
80 borrowers each, walked or ridden by one agent every morning. Records today:

- a bound register per route, with one line per borrower and a column per day or week;
- a pocket book the agent carries, reconciled with the owner in the evening;
- a spreadsheet, or one of the single-purpose finance-register apps listed in §17;
- a general khata app with no idea of instalments, which leaves the lender to do the arithmetic.

The common pains: end-of-day totals that don't match the cash, disputes over "I paid on
Tuesday", no view of arrears by age, interest worked out by hand on every early closure, and no
receipt the borrower trusts.

| Persona | Description | Goals | Constraints |
|---|---|---|---|
| **P1 Owner-lender** (OW) | Runs the book alone or with one or two helpers. 30 to 300 loans, mixed frequencies. Often also runs a shop on YourKhata. | Knows today's due and yesterday's shortfall at a glance. No arithmetic. Disputes settled by the receipt. | Mid-range Android phone; limited typing; Hindi or English. |
| **P2 Collection agent** (AG) | Employee or relative on a route every morning, 30 to 80 stops, mostly cash and some UPI. | Record each collection in under 10 seconds; see only their route; give a receipt; know what to hand over in the evening. | Poor network on the route; phone may be shared; must not see other routes or business totals. |
| **P3 Small finance firm manager** (the OW role with several agents) | Registered firm or partnership, 300 to 2,000 loans, several routes. | Agent accountability, arrears by route, a monthly portfolio view, yearly statements to borrowers. | Needs a licence number on documents, and may be audited under a state Act. |
| **P4 Accountant** (AC) | Visits monthly or at year end. | Interest income, disbursals, collections, exports. | Read-only; never posts. |
| **P5 Borrower** (BO, not a user) | Receives receipts, reminders and statements on WhatsApp or paper. | Knows what they owe and has proof of what they paid. | Never signs in. Documents carry the lender's name only. |
| **P6 Funder** (FU, not a user, later) | A relative or partner who gave the lender money and receives interest. | Knows what is owed to them. | See §15.6 before anything is built. |

## 3. Main workflows, step by step

### W1 Create a loan (owner)
1. From the borrower's page, or from Lending → **New loan**, pick or create the borrower. The
   borrower is a party (§16). Creating one inline uses the existing party form, with the borrower
   role ticked.
2. Enter the **principal**: the amount the borrower owes as principal.
3. Enter any **amount deducted at disbursal**, such as a processing fee or upfront interest, with
   its label. The screen shows **Cash handed over = principal − deductions** live.
4. Choose the **repayment plan** (§6): flat interest, reducing balance, interest only, a fixed
   daily plan (a set amount each day for a set number of days), or an open loan with no schedule.
5. Enter the rate and its unit (per month or per year), the frequency (daily, weekly, fortnightly
   or monthly), the tenure (a number of instalments), the collection days (for daily plans, for
   example Monday to Saturday) and the first due date.
6. Optional: the late-fee rule allowed by the agreement, the route, the agent, a guarantor
   (another party), a note, and the agreement reference (a paper number).
7. **Preview**: the full schedule, total payable, total interest and charges, and the **effective
   annual rate** (§6.7). A warning appears if the effective rate is above the tenant's own ceiling
   setting (§15.3).
8. Save. This writes the loan, its schedule and one disbursal posting (§16), and assigns the loan
   number. Print or share the **loan summary** (§9.1).
9. Record how the cash was handed over (cash, UPI, bank, cheque), with a reference.

### W2 Morning collection round (agent)
1. Open **Today**. It lists the loans on my routes due today or in arrears, in route order, each
   showing the borrower, the amount due today, the arrears and a one-tap **Collect**.
2. At the doorstep, tap **Collect**. The amount is prefilled with *due today plus arrears*. Change
   it for a part or larger payment, pick the mode (cash by default) and save.
3. Share the receipt from the saved screen (WhatsApp text or PDF), or print it.
4. If the borrower doesn't pay, tap **Not paid** and optionally pick a reason from a fixed list
   (not at home, promised a date, refused, other) and a promise date. This writes a *visit note*,
   not money.
5. At day end, **My day** shows collected by mode, due versus collected, and the stops not
   visited. The agent hands the cash to the owner.

### W3 Owner end of day
1. The dashboard shows collected today per agent and per mode, and the shortfall against due.
2. *(Later)* Record the handover: the cash received from each agent, and any difference with a
   note.
3. Review the new overdue list and plan follow-ups.

### W4 Part payment, advance and allocation
1. The collection amount is allocated oldest instalment first. Within an instalment the order is
   interest, then principal. Fees and penalties come last (§6.8).
2. A shortfall leaves the instalment **part paid**. The rest is arrears.
3. An excess pays future instalments in order and shows them as **paid in advance**. If the
   excess is more than the whole remaining schedule, the form stops and offers **close the loan**
   instead (W6).

### W5 Late fee and waiver
1. **Late fee:** only when the loan's terms carry a late-fee rule. MVP: the owner adds it by hand
   on an overdue instalment, prefilled from the rule. Later: suggested automatically after the
   grace days, and never posted without the owner's tap (§15.3).
2. **Waiver:** the owner waives all or part of interest, a fee or a penalty due, with a required
   reason. This posts a non-cash credit (§16), and the waiver appears on the statement.

### W6 Close a loan
1. **Normal completion:** the last collection brings the outstanding balance to zero. The loan
   moves to **closed** on its own and offers the closure letter.
2. **Early closure:** tap **Close early**. The payoff is calculated by the loan's early-closure
   rule (§6.9) and itemised: principal, interest to date, fees due, and any rebate. The owner may
   waive part of it. Record the final collection, and the loan closes.
3. **Top-up:** tap **Top up**. A new loan is drafted for the same borrower. The old loan's payoff
   is shown as *settled from the new loan*, and cash handed over = new principal − deductions −
   old payoff. Saving closes the old loan with a non-cash **settled by new loan** collection and
   opens the new one, and both documents name each other.
4. **Write-off:** the owner writes off the remaining balance with a reason (bad debt, death,
   uncollectable). The loan moves to **written off**. The history remains.

### W7 Reminders
1. The reminder list (existing `/ledger/reminders`) gains the loans due tomorrow, due today and
   overdue.
2. Tap **Remind** to open a prepared, fixed-tone text with the exact amount and due date in
   WhatsApp or SMS on the lender's own phone. The product sends nothing (DEC-012). The reminder is
   recorded.
3. Guardrails (§15.4): the action is available only between 08:00 and 19:00 tenant time, at most
   one reminder per loan per day, and it goes only to the borrower's own number (and the
   guarantor's, when one is recorded).

### W8 Statement and yearly statement
1. From the loan: **Statement** shows the schedule with the status of each instalment and every
   posting with a running balance. It can be printed or shared.
2. After the financial year ends: **Yearly statements** produces one per active borrower for the
   year. Some state Acts require this; Gujarat's is a Form 15 statement within 30 days of year
   end (§15.1).

### W9 Correct a mistake
Corrections reuse the ledger's pattern (LED-03): **reverse** or **correct**, never delete. A wrong
collection is voided through the payments void, with a reason, and the allocations return to the
instalments. A wrong loan (wrong principal or terms) that has **no collections** can be cancelled,
which reverses the disbursal posting. A loan that has collections is fixed by **reschedule** (a
new schedule from today, keeping the history) or by closing it and opening a new loan.

## 4. Required entities and data, with fields

Proposed names only. The architecture agent owns table names. Money is `numeric(14,2)` (the
existing `MoneyField`) and dates are business dates in tenant time.

### 4.1 Borrower: a party, not a new table
`parties_party` plus a role flag `is_borrower` (next to `is_customer` and `is_supplier`), or a
generalised role set if the architecture agent prefers one for all verticals. Lending-specific
extras go in a 1:1 profile:

| Field | Type | Notes |
|---|---|---|
| party_id | FK party | 1:1 |
| occupation | text ≤ 80 | optional |
| address_for_collection | text ≤ 255 | optional; the party address is the default |
| id_proof_kind | enum (none, voter id, driving licence, PAN, other) | optional |
| id_proof_last4 | char(4) | **only the last four characters**. No full Aadhaar or other number, and no image in MVP (§15.5) |
| guarantor_party_id | FK party | optional |
| notes | text ≤ 500 | |

### 4.2 Loan (`lending_loan`)
| Field | Type | Notes |
|---|---|---|
| id, tenant_id | uuid | TenantModel |
| number | text | from the numbering service, for example `LN-0042` |
| borrower_id | FK party | RESTRICT |
| status | enum | `active`, `closed`, `written_off`, `cancelled` (§6.10) |
| plan_type | enum | `flat`, `reducing`, `interest_only`, `fixed_daily`, `open` |
| principal | money | > 0 |
| deductions_total | money | ≥ 0; the sum of the deduction lines |
| cash_handed_over | money | = principal − deductions_total; stored for the document and checked |
| rate | numeric(7,4) | percent; 0 is allowed (an interest-free loan) |
| rate_unit | enum | `per_month`, `per_year`; `none` for fixed_daily |
| frequency | enum | `daily`, `weekly`, `fortnightly`, `monthly`; null for open |
| instalment_count | int | tenure in instalments |
| instalment_amount | money | computed; stored (§6) |
| collection_days | int bitmask or array | daily plans: which weekdays are collection days |
| disbursed_on | date | ≤ today |
| first_due_on | date | ≥ disbursed_on |
| maturity_on | date | computed: the last due date |
| total_interest | money | contracted, from the schedule |
| total_payable | money | principal + total_interest + scheduled fees |
| effective_annual_rate | numeric(7,2) | computed, for disclosure (§6.7) |
| rounding_rule | enum | `paise`, `rupee_up`, `ten_up` (§6.6) |
| late_fee_rule | json | null or `{kind: per_instalment|per_day, amount, grace_days, cap}` |
| early_closure_rule | enum | `interest_to_date`, `full_contracted`, `owner_decides` |
| route_id | FK route | optional |
| agent_user_id | FK user | optional; the route's agent is the default |
| agreement_ref | text ≤ 40 | paper agreement or register number |
| topped_up_from_id / topped_up_into_id | FK loan | top-up chain |
| closed_on, close_reason | date, enum | `completed`, `early`, `top_up`, `write_off`, `cancelled` |
| note | text ≤ 500 | |
| created_by, created_at, updated_at | | audit |

### 4.3 Deduction line (`lending_loan_deduction`)
`loan_id`, `kind` (`processing_fee`, `upfront_interest`, `documentation`, `other`), `label ≤ 60`
and `amount > 0`. Shown on the loan summary as *deducted from the amount handed over*.

### 4.4 Schedule and instalments: the shared recurring-dues engine
A generic **due** row that lending, gym memberships, fees and rent can all use (vision §3 rule 3).
Proposed shape:

| Field | Type | Notes |
|---|---|---|
| id, tenant_id | uuid | |
| plan_source_type / plan_source_id | text / uuid | the owner of the plan (`lending_loan`, later `gym_membership`); polymorphic, like `ledger_entry.source_type` |
| party_id | FK party | who owes |
| seq | int | 1..n |
| due_on | date | |
| amount_due | money | the total for this due |
| components | small child table or json | lending: `principal`, `interest`, `fee`; other verticals: `fee` only |
| amount_paid | money | sum of allocations |
| amount_waived | money | |
| status | enum | `upcoming`, `due`, `part_paid`, `paid`, `overdue`, `waived`, `cancelled` |
| paid_on | date | when it became fully paid |
| interest_posted_entry_id | uuid | the ledger line that accrued this due's interest (§16) |

`due_allocation`: `due_id`, `payment_id` (or ledger entry id), `component` and `amount`. It
mirrors `payments_allocation`, which is deleted on void, never flagged.

### 4.5 Charge (`lending_charge`)
Penalty or late fee after disbursal: `loan_id`, `due_id` (optional), `kind` (`late_fee`,
`bounce_fee`, `other`), `amount`, `reason`, `charged_on`, and `status` (posted or reversed). Each
one posts a ledger debit.

### 4.6 Waiver (`lending_waiver`)
`loan_id`, `component` (`interest`, `fee`, `principal`), `amount`, `reason` (required), `waived_on`
and `approved_by`. Posts a non-cash ledger credit.

### 4.7 Collection
**Reuses `payments_payment`** (direction in, mode, reference, receipt number, void with reason)
with allocations to the loan's dues through a lending payment target (§16). Lending adds only
`collected_by_user_id` (who took the money) and `collected_at` (a timestamp, for the route
report), if `payments_payment` doesn't already carry them. The payment's own `created_by` may be
enough.

### 4.8 Visit note (`lending_visit`)
`loan_id`, `agent_user_id`, `visited_at`, `outcome` (`paid`, `not_home`, `promised`, `refused`,
`other`), `promise_on` (optional) and `note ≤ 255`. No money. Its purpose is to answer "did anyone
go there?"

### 4.9 Collection route (`lending_route`)
`name ≤ 40`, `agent_user_ids` (one or more), `collection_days`, `is_active`, and an ordered member
list (`route_id`, `loan_id` or `party_id`, `position`). Party **tags** are already used for areas
(`CLAUDE.md` PTY-05 mentions "Route 2"). A route is separate because it needs an order and it
drives agent access.

### 4.10 Agent handover *(later)*
`agent_user_id`, `business_date`, `expected_cash` (computed), `received_cash`, `difference`,
`note` and `received_by`.

### 4.11 Money borrowed by the lender *(later, see §15.6)*
The same loan table with `direction = taken`: the tenant is the borrower and the funder is a
party with a `is_funder` role. No new table.

## 5. CRUD operations

| Entity | Create | Read | Update | Delete |
|---|---|---|---|---|
| Borrower (party) | party form + borrower role | list, detail, loans tab | party form | **never**; archive is blocked while the balance isn't zero (existing PTY-04 rule) |
| Loan | W1; only one path | list, detail, schedule, statement | only `note`, `route`, `agent`, `agreement_ref` and `late_fee_rule` **before the first due**. Terms are **never edited** after save; they change by *reschedule* or *top-up*, and both keep history | **never**. *Cancel* is allowed only with no collections, and posts reversals |
| Deduction | with the loan | on the loan | no (cancel the loan instead) | no |
| Schedule / due | generated | on the loan | through the engine only: allocation, waiver, reschedule. Never edited by hand | no; a reschedule marks the old future dues `cancelled` and writes new ones |
| Collection (payment) | W2 | receipts, registers | no | **void** with a reason (existing PAY void), which removes the allocations |
| Charge | W5 | on the loan | no | reverse with a reason |
| Waiver | W5 | on the loan | no | reverse with a reason (owner only) |
| Visit note | W2 step 4 | on the loan, route report | own note within 15 minutes | no |
| Route | settings | list | rename, reorder members, assign agents | archive (only when empty) |
| Handover *(later)* | W3 | report | the same day only | no |

## 6. Business rules, with worked interest examples

All arithmetic is `Decimal`, quantised with `apps.common.money.half_up` (**ROUND_HALF_UP, always**),
in rupees with two decimals, which is paise precision. The server computes and the client only
previews (house convention).

### 6.1 Flat interest (per month or per year)
Interest is computed on the **original principal** for the whole tenure, whatever has been
repaid.

`total_interest = principal × rate × periods`, where *periods* are in the rate's unit (months for
`per_month`; for `per_year`, `tenure_days / 365`).

**Example F1: ₹20,000 at 2% per month flat, 10 monthly instalments.**
- Interest = 20,000 × 0.02 × 10 = **₹4,000.00**. Total payable **₹24,000.00**.
- Instalment = 24,000 ÷ 10 = **₹2,400.00**, split as ₹2,000.00 principal and ₹400.00 interest.
- Effective annual rate (§6.7): the monthly IRR is 3.460%, which is **41.5% a year** nominal
  (50.4% compounded). "2% a month flat" reads like 24% a year and costs the borrower nearly
  double that.

**Example F2: residue handling. ₹25,000 at 1.5% per month flat, 7 monthly instalments.**
- Interest = 25,000 × 0.015 × 7 = ₹2,625.00. Total ₹27,625.00.
- 27,625 ÷ 7 = 3,946.428… The instalment rounds to **₹3,946.43**. Six of them make ₹23,678.58,
  so **the last instalment is ₹3,946.42** (the remainder, not the rounded figure).
- With `rupee_up` rounding: the instalment is ⌈3,946.43⌉ = **₹3,947**, six make ₹23,682, and the
  last is **₹3,943**.
- The principal and interest split per instalment is proportional (`allocate_proportional`), and
  the last instalment takes each component's remainder, so Σ principal is exactly 25,000.00 and
  Σ interest is exactly 2,625.00.

### 6.2 Reducing balance (EMI)
Interest is charged each period on the principal still outstanding.
`r = rate per period` (per-year rate ÷ 12 for monthly, ÷ 52 weekly, ÷ 365 daily).
`EMI = P·r·(1+r)^n / ((1+r)^n − 1)`, rounded half-up to paise, or up to ₹1/₹10 by the rounding
rule. Each period: `interest_k = half_up(balance × r)`, `principal_k = EMI − interest_k`. **The
last instalment = remaining balance + its interest.**

**Example R1: ₹20,000 at 2% per month reducing, 10 monthly instalments.**
(1.02)^10 = 1.218994…, so EMI = 400 × 1.218994 / 0.218994 = **₹2,226.53**.

| # | Payment | Interest | Principal | Balance after |
|---|---|---|---|---|
| 1 | 2,226.53 | 400.00 | 1,826.53 | 18,173.47 |
| 2 | 2,226.53 | 363.47 | 1,863.06 | 16,310.41 |
| 3 | 2,226.53 | 326.21 | 1,900.32 | 14,410.09 |
| 4 | 2,226.53 | 288.20 | 1,938.33 | 12,471.76 |
| 5 | 2,226.53 | 249.44 | 1,977.09 | 10,494.67 |
| 6 | 2,226.53 | 209.89 | 2,016.64 | 8,478.03 |
| 7 | 2,226.53 | 169.56 | 2,056.97 | 6,421.06 |
| 8 | 2,226.53 | 128.42 | 2,098.11 | 4,322.95 |
| 9 | 2,226.53 | 86.46 | 2,140.07 | 2,182.88 |
| 10 | **2,226.54** | 43.66 | 2,182.88 | 0.00 |

Total interest is **₹2,265.31**, against ₹4,000 flat on the same headline rate. The last row
absorbs a one-paisa residue. That is the rule, and a test must pin it.

### 6.3 Interest only, principal at the end
Each period collects `half_up(principal × rate)`, and the principal is due with the last
instalment (or whenever the borrower returns it: an open-ended monthly interest arrangement).

**Example I1: ₹50,000 at 3% per month, interest only, 12 months.** ₹1,500.00 a month; month 12
is ₹51,500.00. A part repayment of principal (say ₹10,000 in month 5) reduces later interest to
₹1,200.00 a month from the next due. The schedule is **regenerated from the next due**, and the
history remains.

### 6.4 Fixed daily plan
The borrower pays a fixed amount per collection day for N collection days. The lender often
deducts an amount at disbursal. The plan is defined by its amounts, not by a rate, so the product
**derives** the interest and the effective rate and shows both.

**Example D1: principal ₹10,000; ₹1,000 deducted at disbursal; ₹100 a day for 100 collection
days.**
- Cash handed over = **₹9,000.00**. Total collected = **₹10,000.00**.
- Postings on day 0 (§16): the cash actually handed over, ₹9,000.00 (a debit, with its mode),
  plus the upfront charge, ₹1,000.00 (a debit labelled "deducted at disbursal", non-cash). The
  borrower's balance is **₹10,000.00 from day 0**, which is what they agreed to repay, and the
  documents say plainly that only ₹9,000 changed hands. Each ₹100 collection reduces the balance.
- Cost of credit: ₹1,000 on ₹9,000 of cash for about 100 days. The daily IRR is 0.2126%, which
  is **about 78% a year** nominal.
- Collection days exclude the non-collection weekdays (for example Sundays) and the tenant's
  holiday list. So 100 collection days Monday to Saturday span about 117 calendar days. Maturity
  is computed from the calendar, not from `first_due + 99`.

**Example D2: no deduction; principal ₹10,000; ₹120 a day for 100 days.** Total ₹12,000; the
interest is ₹2,000 derived. The daily IRR is 0.3732%, **about 136% a year** nominal. Both D1 and
D2 are common shapes in the competitor apps (§17), and both are far above every state ceiling
found in §15.1. That is why §15.3 makes the effective rate visible on every loan summary, and
why the tenant can set a ceiling warning.

Residue rule for fixed plans: if principal + interest isn't a whole multiple of the per-day
amount, the **last** collection day carries the remainder (smaller, never larger).

### 6.5 Open loan (no schedule)
Money given at a monthly rate with no fixed instalments ("pay when you can"). Interest accrues as
**simple interest on the outstanding principal, day by day, Actual/365 (always 365, including in
leap years)**, and is posted monthly on the loan's anniversary day or at month end (a tenant
setting). **No compounding**: unpaid interest never earns interest (§15.1). Collections pay
accrued interest first, then principal.

**Example O1:** ₹30,000 at 24% a year, given 1 Jan. On 31 Jan, 30 days' interest =
half_up(30,000 × 0.24 × 30/365) = **₹591.78**. On 10 Feb the borrower pays ₹5,000: ₹591.78 to
the January interest, 10 days' interest (half_up(30,000 × 0.24 × 10/365) = ₹197.26) to date, and
**₹4,210.96** to principal. The principal is now ₹25,789.04.

### 6.6 Rounding rules (paise)
1. Every stored amount has 2 decimals, and every intermediate result is quantised with
   `half_up(…, 0.01)` at the point it becomes a row, never earlier. A rate × balance product
   isn't rounded before the multiplication by days.
2. Instalment rounding (`rounding_rule`): `paise` (default, half-up to 0.01), `rupee_up` (ceiling
   to ₹1) or `ten_up` (ceiling to ₹10). Rounding always goes **up** on regular instalments and the
   last instalment is **reduced**, so the borrower never pays more than the contracted total.
3. **Σ schedule = total_payable exactly.** It is a database-checked invariant (a test fuzzes
   principal, rate, n and rounding).
4. Component splits use `allocate_proportional`, and the remainder goes to the last row.
5. Accrued interest (§6.5) is rounded per posting, so a statement's interest lines sum exactly to
   the ledger.
6. The effective rate is displayed to one decimal place and is never stored as money.

### 6.7 Effective annual rate (disclosure figure)
Computed as the IRR of the cash flows *as the borrower sees them*: −cash_handed_over on
`disbursed_on`, and +each scheduled instalment on its `due_on`. It is annualised nominally
(periodic rate × periods a year) and labelled "effective yearly rate". It is the same idea as the
RBI's APR in the Key Facts Statement (§15.2). It is information, not a legal test: the product
never says a rate is legal or illegal. Computed server-side by bisection (no new dependency).

### 6.8 Allocation of a collection
1. Oldest unpaid due first, whatever its component.
2. Within a due: **interest, then principal**.
3. **Fees and penalties are paid last**, after every scheduled due that is currently due. This
   stops a small penalty pushing a borrower into permanent arrears. The owner can pick a
   different order per tenant (§18 Q6).
4. Any excess pays future dues in order (**advance**). It is never silently refunded, and never
   kept as an unallocated credit unless the loan closes.
5. A collection can't exceed the payoff amount (§6.9) plus zero tolerance. Any more is refused
   with an offer to close the loan.

### 6.9 Early closure payoff
- `interest_to_date` (default, borrower-fair): outstanding principal + interest accrued up to the
  closure date (flat: pro-rata by days elapsed within the current period; reducing: the current
  period's interest pro-rata) + fees due − advance held.
- `full_contracted`: every remaining scheduled amount (the lender's paper term for some flat and
  daily plans).
- `owner_decides`: shows both and lets the owner enter a figure between them. The difference is
  recorded as a waiver with a reason.

The payoff sheet always itemises the calculation. Some lenders charge a foreclosure charge; it is
allowed only if it was declared in the loan's terms at creation.

### 6.10 Status machine
`active → closed` (outstanding = 0 and every due is paid or waived) · `active → written_off`
(owner, with a reason) · `active → cancelled` (only with no collections) · `active → closed` by a
top-up. A due is `overdue` when `due_on < today` and it isn't fully paid or waived. **Days past
due** = today − the oldest unpaid `due_on`. No state goes backwards except by voiding the
collection that caused it (a voided last collection reopens a closed loan and writes an audit
row).

### 6.11 Money-invariant rules
- The loan's outstanding balance is **Σ of its ledger postings** (principal + posted interest +
  charges − collections − waivers). The loan keeps no balance of its own (vision §3). The
  schedule says what is **due**; the ledger says what is **owed**.
- `principal − deductions_total = cash_handed_over`, checked on save.
- The disbursal, each interest accrual, each charge and each waiver post exactly one ledger line,
  idempotent on `(source_type, source_id, entry_type)` (the existing `post_source_entry`
  contract).

## 7. Dashboard requirements

A lending section on `/dashboard` (visible only when `lending` is enabled), plus a Lending home.

| Tile / list | Definition | Tap goes to |
|---|---|---|
| **Due today** | count and amount of dues with `due_on = today` not fully paid, plus arrears on those loans | Today list |
| **Collected today** | Σ lending collections today; split by mode and by agent | Collection register (today) |
| **Shortfall today** | due today − collected against today's dues | Today list, filtered to unpaid |
| **Overdue** | count of loans and amount, bucketed 1–7, 8–30, 31–90, 90+ days past due | Arrears report |
| **Active loans** | count; principal outstanding; total outstanding | Loan list |
| **Disbursed this month** | count, principal, cash handed over | Disbursal register |
| **Interest this month** | interest posted (accrued) and interest collected; shown side by side, labelled | Interest report |
| **Closing this week** | loans with a maturity in the next 7 days | Loan list |
| **Agent strip** | per agent: due, collected, stops visited / on route | Agent report |

The agent's own home shows only **my routes' due today, my collected today, and my stops left**.
It shows no business totals (§12). The existing "To collect" and "Overdue" core tiles need a
decision (§16.3), because a loan's principal isn't overdue just because it is old.

## 8. Reports

All reports reuse the reports hub, and are listed only when built (existing rule). Every report
has CSV export and a print sheet.

| Report | Contents | MVP? |
|---|---|---|
| **Collection sheet** (per route, per date) | route order, borrower, loan no., due today, arrears, blank "collected" column; printable A4 for agents on paper | MVP |
| **Collection register** | every collection in a date range: time, receipt no., borrower, loan, amount, mode, agent; totals by mode and agent | MVP |
| **Arrears (overdue) report** | loans with an overdue amount, days past due, bucket, last collection date, promise date | MVP |
| **Loan book** | every active loan: principal, paid, outstanding principal, interest due, next due, status | MVP |
| **Disbursal register** | loans opened in a range: principal, deductions, cash handed over, mode | MVP |
| **Interest and charges report** | interest accrued vs collected, fees, penalties, waivers, by month | Later-1 |
| **Agent performance** | per agent per day: due, collected, visits, not-paid reasons | Later-1 |
| **Closed loans** | closed in a range, reason, total collected vs principal | Later-1 |
| **Borrower yearly statement batch** | one statement per borrower for a financial year | Later-1 |
| **Cash position** *(needs handover)* | cash with agents, handed over, differences | Later-2 |
| **Expected collections (forecast)** | Σ scheduled dues per week or month ahead | Later-2 |

## 9. Documents

All documents use the existing print pipeline (`window.print()`; A4, A5 and 80 mm sheets) and
the tenant's branding (logo, name, address, signature, colour). **None of them names the product
or its domain** (`customerDocumentsCarryNoProductName.test.tsx` must cover each new one). Every
document can carry the tenant's **licence or registration number** when one is set (§15.1). The
wording is plain and factual, in the borrower's chosen language (English or Hindi to start).

### 9.1 Loan summary (the key-facts sheet)
It is **not** a loan agreement. The product doesn't draft legal agreements (§15.7). It sits
alongside the lender's own paper. Contents:
- lender (tenant) name, address and licence number; borrower name, mobile and address; loan
  number; date;
- principal; each deduction with its label; **cash handed over**, and how;
- plan in words ("₹2,400 every month for 10 months"), rate as entered and its method (flat or
  reducing, per month or per year);
- **total interest, total payable, and the effective yearly rate**;
- the full schedule table (due date, amount, principal and interest split);
- the late-fee rule and the early-closure rule, exactly as configured; "No other charges apply"
  when there are none;
- guarantor, if any; agreement reference; lender and borrower signature lines.

### 9.2 Collection receipt
A5 and 80 mm, reusing the payments receipt: receipt number, date and time, borrower, loan number,
**amount received, mode and reference**, how it was applied (interest, principal, fee), **balance
outstanding after this collection**, next due date and amount, and collected by (first name). It
is prepared as a WhatsApp text as well as a PDF. A void prints **VOID** with the reason.

### 9.3 Loan statement
It follows the LED-04 statement: the period, brought forward, every posting (disbursal, interest,
charge, collection, waiver, reversal) with a running balance, and the schedule with each due's
status. The corrections toggle is inherited. A yearly variant covers a financial year.

### 9.4 Closure letter (no-dues letter)
Loan number, borrower, principal, dates opened and closed, total collected, the statement "all
amounts due under this loan have been received; nothing further is payable", and a signature
line. For a top-up closure: "settled by new loan LN-xxxx". A **written-off** loan gets **no**
closure letter. Its status is visible only to the lender.

### 9.5 Payoff sheet *(with early closure)*
The itemised calculation from §6.9, valid for the stated date.

## 10. Payments and collections

- **Collections are payments.** Each one is a `payments_payment` (direction in), with the
  existing modes (cash, UPI, bank, cheque, card, other), reference, receipt, void and
  idempotency key. Lending adds a *payment target* that allocates to dues (the
  `payments/services/targets/*` pattern) and a seam in `lending/services/payment_seam.py` shaped
  like `purchases.services.payment_seam` (`apply_payment`, `register_void_listener`).
- **Disbursal** is money out to the borrower. It is recorded as a payment out (the mode lives on
  the payment row, because `ck_ledger_entry_debit_has_no_mode` forbids a mode on a ledger debit)
  or as a lending-sourced ledger debit with the mode on the loan. The architecture agent decides;
  §16.2 gives the trade-off.
- **UPI QR:** the existing local QR (`CollectQrSheet`) can be shown with the amount due. The money
  goes straight to the lender's own UPI ID and never through the product. After the borrower pays,
  the agent still records the collection by hand (no bank sync, which is never claimed).
- **Cheque bounce:** void the collection (reason "cheque returned"), then optionally add a bounce
  fee, only if the loan's terms declared one.
- **Cash limits:** disbursal or collection in **cash of ₹20,000 or more** for a single loan (in
  one transaction or per person per day) shows a non-blocking warning. Income-tax rules
  (s.269SS/269T, with a 100% penalty under s.271D/271E) restrict cash loans and repayments at that
  level. Wording: "Cash of ₹20,000 or more on a loan may break income-tax rules. Check with your
  accountant." Needs review by an accountant (§18).
- **No money movement:** no gateway, no payout, no auto-debit, no e-mandate, no NACH. These are
  never built in this module (§15.7).

## 11. Search, filter and sort

**Loan list** (`/lending/loans`, with filters in the URL like `usePartyListUrl`):
- search `q`: borrower name, mobile (last 4+ digits), loan number, agreement reference;
- filters: status (active, closed, written off, cancelled), plan type, frequency, route, agent,
  days-past-due bucket, *due today*, *closing this week*, disbursed date range, principal range,
  borrower tag;
- sort: next due date (default, nulls last, following the StableOrderingFilter rule),
  overdue amount desc, days past due desc, outstanding desc, disbursed date, loan number,
  route order (when filtered to one route).

**Today list:** fixed to today; filter by route and by *unpaid only*; sort by route order (default)
or by amount due.

**Collection register:** date range, agent, mode, route, loan, voided included or not; sort by
time.

**Borrower list:** the existing party list with a `role=borrower` filter and an `active loans`
chip.

The totals in `meta.totals` are over the **filtered** set (the PTY-02 convention), and each chip
count uses the same predicate as the list it opens (AC-2 lesson in `collection.py`).

## 12. Roles and permissions

The roles stay the four existing codes (owner, admin, staff, accountant). A *collection agent* is
a **staff** member with lending codenames **plus route scoping**. The scoping is new: a row-level
filter by assigned routes. Proposed codenames (`lending.*`), following the `ledger.entry.correct`
precedent that *ordinary capabilities are codenames and business ceilings are role checks*:

| Capability | Owner | Admin | Staff / agent | Accountant |
|---|---|---|---|---|
| `lending.loan.view` (all) | ✓ | ✓ | only loans on own routes | ✓ |
| `lending.loan.create` / top-up | ✓ | ✓ | – (configurable) | – |
| `lending.loan.cancel` / reschedule | ✓ | ✓ | – | – |
| `lending.collection.create` | ✓ | ✓ | ✓ own routes | – |
| `lending.collection.void` | ✓ | ✓ | only own, same day, within 15 minutes (configurable) | – |
| `lending.charge.create` | ✓ | ✓ | – | – |
| `lending.waiver.create` | ✓ | role check: owner may allow admin | – | – |
| `lending.writeoff` | ✓ (role check, not delegable) | – | – | – |
| `lending.route.manage` | ✓ | ✓ | – | – |
| `lending.reports.view` | ✓ | ✓ | own day only | ✓ |
| `lending.export` | ✓ | ✓ | – | ✓ |
| Reminder action | ✓ | ✓ | ✓ own routes | – |
| See business totals and other agents | ✓ | ✓ | **no** | ✓ |

Agent-specific rules:
- An agent sees the borrower name, mobile, collection address, due today, arrears and their own
  collections. The agent does **not** see ID-proof fields, guarantor details, the loan's
  interest income or other routes.
- The scoping is enforced server-side in the selectors (`tenant` + `route ∈ my routes`), never in
  the client. A test signs in as an agent and requests another route's loan by id and gets 404,
  not 403, so existence isn't revealed. The e2e test must assert **who** is signed in first (the
  `CLAUDE.md` harness lesson).
- Waivers and write-offs reduce what is owed. They are business-ceiling decisions and are role
  checks, like LED-01's credit-limit override.

## 13. Edge cases

| # | Case | Expected behaviour |
|---|---|---|
| EC-1 | The same collection is submitted twice (a slow network or a double tap) | Idempotency key: one payment. The second response returns the first |
| EC-2 | A collection is more than the whole payoff | Refused with an offer to close early. Never a negative balance on the loan |
| EC-3 | A collection is backdated before `disbursed_on` | Refused |
| EC-4 | A borrower has several active loans and pays one amount | The agent picks the loan. The default is the loan with the oldest overdue due. MVP doesn't split one payment across loans (two receipts) |
| EC-5 | The due date falls on a non-collection day or a holiday | Daily plans skip it (the schedule is built on collection days). Weekly and monthly plans keep the date, and the owner can move it by rescheduling |
| EC-6 | A monthly due on the 29th, 30th or 31st | Clamped to the last day of shorter months, and the anchor day is kept for later months (31 Jan → 28/29 Feb → 31 Mar) |
| EC-7 | Leap year in per-year daily accrual | Actual/365 always; 366-day years are not special-cased (the stated rule, which must be on the loan summary) |
| EC-8 | A rate of 0 (interest-free help to a relative) | Allowed; the schedule is principal only; the effective rate is 0 |
| EC-9 | A void of the collection that closed a loan | The loan reopens to `active`, the closure letter is marked superseded, and an audit row is written |
| EC-10 | The agent recorded against the wrong borrower | The agent can't correct after 15 minutes. The owner voids it and re-records it; both remain visible |
| EC-11 | The borrower dies or disappears | Write-off with a reason; any guarantor is recorded. Reminders stop at once (they are suppressed for written-off loans) |
| EC-12 | Archiving a borrower with an active loan | Already blocked by the non-zero balance guard (PTY-04). A closed loan with a zero balance allows archive |
| EC-13 | The tenant turns off the `lending` module with active loans | Allowed (the data is kept), but the settings dialog warns with the count. Postings stay on the party ledger. Turning it back on restores everything |
| EC-14 | The borrower is also a shop customer | One party, one ledger balance that includes loan lines (§16.3). The loan screen shows the loan-only figure |
| EC-15 | A top-up where the old payoff exceeds the new principal | Refused: "The new loan must be larger than what is still owed" |
| EC-16 | The rate or tenure changes by agreement mid-loan | Reschedule from the next due, with the old dues after that point `cancelled` and new ones generated. The loan summary is reissued as version 2. History remains |
| EC-17 | A penalty on a loan whose terms declared none | Refused. The owner must first record the borrower's agreement (a note plus a changed rule), and the version is kept |
| EC-18 | A reminder outside 08:00–19:00 | The Remind button is disabled with the reason. A reminder can be scheduled for 08:00 |
| EC-19 | The agent's phone is offline on the route | MVP: the save fails and the draft is kept with **Retry** (the LED-01 FR-12 pattern). Offline mode isn't built and is never claimed. This is the largest gap (§18 Q2) |
| EC-20 | A cheque collection later bounces | Void and optional bounce fee (only if declared); the due returns to overdue |
| EC-21 | A 1-paisa residue after reducing-balance rounding | Absorbed by the last instalment (§6.2). The invariant Σ = total is tested |
| EC-22 | A disbursal that was never handed over (recorded by mistake) | Cancel (no collections), which reverses the postings |
| EC-23 | Timezone: an agent collects at 23:50 | The business date is the tenant timezone's date (Asia/Kolkata by default) |
| EC-24 | A very large book (2,000 loans × 100 daily dues) | The dues table is about 200k rows per tenant: index `(tenant, status, due_on)` and `(tenant, plan_source_id, seq)`. The Today query must use the index (the EXPLAIN test pattern) |

## 14. Validations

| Field / action | Rule | Message key (example) |
|---|---|---|
| principal | > 0; ≤ 9,99,99,999.99 | `lending.loan.principal.range` |
| deductions | each > 0; Σ < principal | `lending.loan.deductions.tooLarge` |
| rate | 0 ≤ rate ≤ 100 (per month) or ≤ 1,200 (per year); up to 4 decimals | `lending.loan.rate.range` |
| rate_unit | required unless fixed_daily or open with rate 0 | |
| frequency | required unless open | |
| instalment_count | daily 1–1,000; weekly 1–520; fortnightly 1–260; monthly 1–360 | |
| fixed_daily amount | > 0; count × amount ≥ principal (otherwise it's a loss-making plan, and the lender must confirm) | `lending.loan.fixedPlan.belowPrincipal` |
| disbursed_on | ≤ today; not more than 10 years back (for importing old paper loans) | |
| first_due_on | ≥ disbursed_on; ≤ disbursed_on + 1 year | |
| collection_days | at least one weekday for daily plans | |
| computed instalment | ≥ ₹1.00 | |
| late_fee_rule | amount > 0; grace 0–90 days; cap required for per-day fees | |
| collection amount | > 0; ≤ payoff; 2 decimals | `lending.collection.overPayoff` |
| collection date | disbursed_on ≤ date ≤ today | |
| mode | required; reference ≤ 64 when not cash | |
| cash ≥ ₹20,000 | warning, not a block (§10) | `lending.cash.limitWarning` |
| waiver / charge / write-off / void / cancel reason | required, 3–255 characters | reuses `reasonValidation()` |
| waiver amount | ≤ the component outstanding | |
| top-up | new principal > old payoff | |
| effective rate > tenant ceiling | warning with explicit confirmation; the confirmation is audited | `lending.loan.rateAboveCeiling` |
| id_proof_last4 | exactly 4 alphanumeric characters; nothing longer is ever accepted | |

Server-side validation is authoritative. The Yup schemas mirror it in `useValidationSchemas()`
(house convention).

## 15. Legal and compliance findings, and product guardrails

**This is not legal advice.** It is a research summary for the owner and a lawyer to review
before Phase 4. Law differs by state and changes: Karnataka legislated in 2025, and RBI's recovery
directions were being revised in 2026.

### 15.1 State money-lending law
Most states have a money-lending Act. Common features found:

- **Licence or registration** before lending as a business. Maharashtra requires a licence from
  the district registrar (the 2014 Act, s.39 penalty for lending without one). Gujarat requires
  registration renewed every 5 years (the 2011 Act). Karnataka's 2025 law requires *all* lenders,
  including individual lenders, to register with the district authority, and treats loans by
  unregistered lenders as discharged.
- **Interest ceilings** notified by the state. Maharashtra's reported ceilings are **15% a year
  on secured and 18% on unsecured** loans (secondary source; confirm the current notification).
  Gujarat and others notify maxima. Several Acts allow only **simple interest** ("no interest on
  interest", Gujarat) and cap the total interest recoverable at the principal (the long-standing
  rule that interest can't exceed principal, applied by Gujarat's Act).
- **Prohibition of exorbitant interest.** Tamil Nadu (2003) and Kerala (2012) make it an offence
  to charge interest styles above the state rate that are charged daily, hourly or per day on
  unpaid amounts, or collected daily together with principal. That describes exactly the fixed
  daily plans of §6.4 when their effective rate exceeds the notified rate. Penalty in Tamil Nadu:
  up to 3 years and a fine.
- **Books and documents.** Licensed lenders must keep a cash book, a ledger and a register of
  debtors in prescribed forms; issue a **receipt for every repayment**; give pass books or
  statements; and give a **yearly statement of account** to each debtor (Gujarat: Form 15 within
  30 days of year end; Maharashtra s.24–25). Gujarat also requires a CA audit.
- **Molestation.** Every Act found makes harassing a debtor for recovery an offence (Maharashtra
  s.45; Tamil Nadu s.4; Karnataka's 2025 law bans "any form of coercive recovery", with up to 10
  years and ₹5 lakh).

### 15.2 RBI rules (context, not directly binding on unregulated lenders)
RBI's rules bind banks, NBFCs and other regulated entities, not an individual lender. They are
still the best available statement of **fair practice**, and a registered NBFC tenant would be
bound by them.
- **Fair Practices Code and recovery agents:** calls only between **08:00 and 19:00**; no abusive
  language, intimidation, excessive calling, misleading claims or public humiliation; no contact
  during bereavement or family occasions (the Feb 2026 draft directions, proposed effective 1 Jul
  2026); written notice when recovery is assigned; recorded calls with notice.
- **Key Facts Statement (from 1 Oct 2024):** the **APR**, the full repayment schedule, and every
  charge disclosed before the loan. Nothing not in the KFS may be charged without consent.
- **Penal charges (from 1 Apr 2024):** penalties are *charges*, not penal *interest*; **never
  capitalised or compounded**; reasonable, disclosed up front.

### 15.3 What the product MUST do
1. **A receipt for every collection** (§9.2), numbered and sequential, with the balance after.
   It is available the moment the collection is saved.
2. **Clear interest disclosure** on the loan summary: the rate as agreed, the method, total
   interest, total payable, cash actually handed over, every deduction, and the **effective
   yearly rate** (§6.7), on every loan with no opt-out.
3. **The full schedule** given to the borrower (the loan summary and the statement).
4. **Immutable history:** no edit or delete of money rows. Corrections are reversal pairs (LED-03)
   and payment voids with reasons. Every action is in the audit log with who and when.
5. **Simple interest only.** Unpaid interest never earns interest. Penalties are never added to
   principal and never earn interest.
6. **Charges only as declared.** A late fee, bounce fee or foreclosure charge can only be applied
   if it was in the loan's terms at creation, or if a recorded variation (with a note of the
   borrower's agreement) added it later.
7. **A yearly statement** per borrower, in a batch, for the financial year.
8. **The licence or registration number** as an optional tenant setting, printed on every lending
   document when set. When it is empty, the loan screens show a one-time neutral notice: "Some
   states require money lenders to be licensed or registered. Add your number in settings."
9. **A rate-ceiling warning** the tenant configures (Settings → Lending → "Warn me above __% a
   year"). **The product ships no state-by-state table and never says a rate is legal.** A
   hard-coded legal table would be legal advice and would go stale. The owner or a lawyer may
   decide to ship a default (§18 Q1).
10. **Data export** of every loan, due, collection and document (it extends the existing tenant
    export).

### 15.4 Reminder and collection guardrails (MUST NOT harass)
- The product never sends anything. The lender sends from their own phone (DEC-012, unchanged).
- **Fixed, polite templates only**, with the amount, due date, loan number and the lender's name.
  There is no free-text "tone" option, no threats, no mention of police, court, family,
  neighbours or employer, and no shaming words. Templates are reviewed like copy and pinned by a
  test that rejects a list of forbidden words.
- **08:00–19:00 only** for the Remind and Call actions (tenant time), and **at most one reminder
  per loan per day**. The record makes the frequency visible.
- **Recipients:** the borrower's own number and, if recorded, the guarantor's. There is **no
  sending to any other contact**, no contact-list import from the phone, and no group messages.
- **No public defaulter list**, no cross-tenant "bad borrower" lookup, and no sharing of a
  borrower's arrears outside the tenant.
- The visit-note reasons are neutral ("not at home", "promised a date"). There is no "refused
  rudely" or other reason that invites escalation.

### 15.5 Data protection (DPDP Act 2023; Rules notified 13 Nov 2025)
The core obligations apply from about **May 2027**, and the design should meet them now.
- **Roles:** the tenant (lender) is the Data Fiduciary for borrower data, and YourKhata is its
  **Data Processor**. The terms of service and the DPA need to say so (§18).
- **Minimisation:** collect name, mobile and collection address only. ID proof: kind plus the
  **last four characters**, never a full Aadhaar or PAN and never an image in MVP. No photos of
  the borrower or their home, no GPS tracking of borrowers, and no device data.
- **Purpose:** borrower data is used only to keep this lender's records, never for analytics
  across tenants, marketing, scoring or model training.
- **Security:** it is covered by tenant isolation, role scoping (agents see less, §12), audit logs
  (kept at least one year under the Rules) and the existing export and deletion flows.
- **Erasure versus retention:** a borrower's erasure request conflicts with the lender's duty to
  keep books (state Acts) and the limitation period for recovery. Proposed: keep financial rows
  while any statutory period runs; minimise identifying fields after closure + N years. **N is for
  a lawyer to decide** (§18).
- **Breach:** the existing incident process must be able to notify tenants in time for their
  72-hour report to the Board.

### 15.6 Deposits and funders (Banning of Unregulated Deposit Schemes Act, 2019)
The owner asked about "people who give money on interest": funders whose money the lender lends
out.
- Under the BUDS Act a *deposit* is any money received as an advance or loan **with a promise to
  return it**, with or without interest, by any deposit taker, **including an individual**.
  Accepting deposits under a scheme not registered with a regulator is banned (2–7 years and ₹3–10
  lakh). Advertising or soliciting it is also banned.
- **Excluded from "deposit":** loans an individual receives **from relatives**; loans a firm
  receives from its partners' relatives; partners' capital; and bank or NBFC loans. Amounts
  genuinely connected to a business (trade advances) are also excluded.
- State laws on the protection of depositors' interests (for example Maharashtra's 1999 Act) add
  further offences for financial establishments.

**Conclusion: funders are NOT in the minimum scope.**
1. The MVP lender's core job (loans out, collections in) doesn't depend on it.
2. A feature called "investors" or "depositors", which pools money from many people with a
   promised return, is exactly the pattern the Act bans. Building it would help a tenant run an
   illegal scheme.
3. The legitimate need (the lender owes a relative or partner money and pays them interest) is
   **the same loan engine in the other direction**. The tenant is the borrower, the funder is a
   party, and the ledger shows a payable. It is safe to add later as **"Money borrowed"**, with
   guardrails: it is labelled borrowed, never "deposit", "investment" or "scheme"; there are no
   public or shareable sign-up pages, no advertised returns and no pooled plans; and there is a
   one-time notice about the BUDS Act exclusion for relatives. It needs a lawyer's review first.

### 15.7 What the product must NOT do
- **Lend, disburse, collect, hold or move money:** no gateway, payout, auto-debit, NACH,
  e-mandate or escrow. The UPI QR is local and pays the lender directly (existing).
- **Credit scoring,** borrower ratings, "eligibility" or approval suggestions, bureau pulls, or
  any shared borrower database across tenants.
- **Take deposits,** or any "investor/deposit scheme" feature (§15.6).
- **Harassment-style reminders or collection tooling** (§15.4), device locking or contact
  scraping. (One competitor advertises remote locking of financed phones. We will never build
  that.)
- **Draft legal agreements** or declare a rate or practice legal. The loan summary is a record,
  not a contract.
- **Collateral or pawn tracking** in this module (separately regulated, and banned for small
  loans in Karnataka).
- **Marketing claims** that the module makes a lender "compliant" or "legal". The landing page
  says what it records, and only once it is live.

### 15.8 Items needing the owner's or a lawyer's review
L1 whether to ship any default rate ceiling, and how to word the warning. L2 the no-legal-advice
wording on the loan summary and settings. L3 the retention period after closure and how erasure
requests are handled. L4 the processor terms (DPA) for borrower data. L5 the "Money borrowed"
feature and its BUDS Act wording. L6 whether serving *unregistered* lenders in states such as
Karnataka creates exposure for the platform, and whether sign-up should ask for a licence number.
L7 the cash-limit warning wording (with an accountant; the Income-tax Act 2025 renumbering from
1 Apr 2026 should be checked). L8 whether the effective-rate display for fixed daily plans should
also show "interest as % of cash handed over" in plain words.

## 16. What we can reuse from the existing core, and what is new

### 16.1 Reuse, concretely

| Need | Existing piece | How it is reused | Gap |
|---|---|---|---|
| Borrower | `parties_party` (`is_customer`/`is_supplier` booleans, tags, mobile, archive guard, import) | Borrower = party + `is_borrower` role (or a generalised role set). One contact, whatever modules use it (vision rule "people are always parties") | A role flag and the lending profile (§4.1); the party list gets a role filter |
| Money owed | `ledger_entry`, which is immutable, with a DB trigger and `(source_type, source_id)` polymorphism, and `post_source_entry()` in `ledger/services/postings.py`, which is idempotent on source + entry type | The disbursal, interest accruals, charges and waivers post **ledger lines** with `source_type=lending_*`. The loan's outstanding balance = Σ its lines. No second balance | New `SourceType` values and a `POSTING_MATRIX` row. `EntryType.INTEREST` **already exists** (declared "Phase 3"). It may need `loan_disbursal`, `loan_charge` and `loan_waiver` entry types. This is a core change, so it goes through the architecture agent and a CR |
| Corrections | LED-03 reverse/correct pairs; `reverse_source_entries()` | A cancelled loan or reversed charge reverses its source entries | none |
| Collections | `payments_payment` (modes, reference, receipt number, void with reason, idempotency), `payments_allocation`, the targets pattern, and `purchases.services.payment_seam` as the model | A collection = a payment in, allocated to dues through a lending target and `lending/services/payment_seam.py` | A lending target; a `collected_by` field if `created_by` isn't enough |
| Receipt | the A5 payment receipt, the 80 mm print sheet, `UbShareSheet` | The collection receipt extends it with the loan block (applied to, balance after, next due) | A loan block on the receipt |
| Statement | LED-04 statement (window-function running balance, corrections toggle, CSV, print) | The loan statement = the party statement filtered to `source_type=lending_*` and `source_id=loan`, plus the schedule table | The filter by source, and the schedule panel |
| Reminders | `ledger_reminder` (party, due_on, channel, kind, status, snapshot_balance), the reminder list and bulk sheet, the 09:00 auto job for D-1/D0, `wa.me`/`sms:` links | Loan dues feed the reminder list; a reminder snapshots the loan's due amount | `ledger_reminder` has no source link; it needs `source_type/source_id` (or a loan id) and the 08:00–19:00 and once-a-day guardrails. Today's auto job reads `party.collection_date`, and lending would supply the next due date |
| Promise date | `party.collection_date` (PTY-03), used by `ledger/selectors/collection.py` buckets | A "promised" visit note may set it | Decide whether a loan-level promise date is needed or the party's is enough |
| Aging | `/ledger/aging` receivable buckets | **Don't reuse for loans.** Aging by entry age would call a 60-day-old disbursal "overdue" when nothing is due yet. Loan arrears come from the dues engine | Aging should exclude lending-sourced lines, or label them (§16.3) |
| Credit limit | PTY-06 limit enforced at save | Optional: a limit could warn when a new loan pushes the party over. Default off for borrowers | Decide if a disbursal counts against the limit |
| Scheduler | `platform_job` + `run_scheduler` (60-second tick, `FOR UPDATE SKIP LOCKED`, idempotent tasks) | A daily job: dues due → `due`/`overdue`; interest accrual postings (§6.5 and per-due interest); reminder candidates | New tasks only; no new infrastructure |
| Numbering | `numbering` in tenant settings | Loan numbers `LN-`, and receipt numbers through payments | A new series |
| Roles | `permissions_registry.py`, four roles, codename checks, `_ModuleEnabled` | `lending.*` codenames; the module gate | **Row scoping by route for agents** is new; nothing in core scopes rows below the tenant today |
| Module switch | `ModuleCode`, `enabled_modules`, `MODULE_DEPENDENCIES` | `LENDING = "lending"`; deps `{"parties", "ledger", "payments"}` | Three one-line additions |
| Reports | reports hub, CSV exports, day book | The lending reports register in the hub; collections appear in the day book as payments | Report definitions |
| Documents | print pipeline, branding, the "no product name" test | All §9 documents | Four templates |
| Import | the CSV import wizard (parties, items) | Later: import existing loans from a register or spreadsheet | A lending import profile |
| Audit | `platform.audit.record()` | Every lending service writes it | none |
| Cashbook | `expenses` cashbook | Disbursals (cash out) and collections (cash in) appear if they flow through payments | Confirm the cashbook reads payments |

### 16.2 The disbursal posting choice (for the architecture agent)
- **(a) Payment out** allocated to the loan. The mode and reference live on the payment, the
  cashbook sees cash out, and the payments void undoes it. The drawback is that a "payment out"
  to a borrower reads like paying a supplier unless the label is lending-specific.
- **(b) A lending-sourced ledger debit** (`loan_disbursal`) with the mode on the loan row. It is
  simpler and reads correctly, but the cashbook and payment registers don't see it without
  another seam.
Research leans to **(a)** for one money path: every rupee that moves is a payment, and every
obligation is a ledger line.

### 16.3 One balance per party (a decision needed before the FRD)
Today a party has one `balance`. If a shop customer also borrows, their shop credit and loan
share one figure, the core "To collect" tile includes loan principal, and aging calls old loans
overdue. The options are:
1. keep one balance (it is the true total owed), show loan figures on lending screens, and
   exclude `lending_*` lines from aging and from the reminders' generic "who owes" list;
2. introduce per-module sub-balances on the party (a core change affecting every vertical: gym
   fees and rent would want the same);
3. have borrowers as separate parties (this breaks "one person, one contact").
Research recommends **(1) now, with (2) evaluated in the Phase 5 reuse review**, because gym, fees
and rent will ask the same question.

### 16.4 What is new
1. **The recurring-dues engine (shared).** A plan becomes a generated schedule of dues with
   components. Payments are allocated oldest first. Status moves upcoming → due → part paid → paid
   or overdue. It handles waivers, reschedules (cancel future dues and regenerate) and
   calendar rules (collection weekdays, holidays, month-end clamping). Lending plugs in
   **interest strategies** (flat, reducing, interest only, fixed daily, open accrual). Gym, fees
   and rent use it with a single `fee` component and no interest. This research **confirms the
   vision's candidate**: lending needs everything the others need, plus interest components.
   The engine should live in core (for example `apps/dues`) so verticals never import each other.
2. **Loan** entity, deductions, charges, waivers, top-up and closure logic, and the payoff
   calculator.
3. **Effective-rate calculator** (bisection IRR; no dependency).
4. **Collection routes**, ordered membership and agent assignment, and **row-level scoping** for
   agents.
5. **Visit notes** (non-money outcomes).
6. **Holiday calendar** per tenant (shared with the dues engine; gym and library will want it).
7. **Four documents** (§9) on the existing pipeline.
8. **Lending reports** (§8) and a dashboard section.
9. *(Later)* agent handover and cash position; "Money borrowed" in reverse direction.

## 17. MVP versus later

### 17.1 Competitor scan (what the market presents, read as data)
| Product | What it offers | What we take and what we leave |
|---|---|---|
| Khatabook | General credit ledger; WhatsApp and SMS reminders with a date; UPI payment requests and QR; PDF reports; bot call reminders were announced | Take: reminder with the exact amount, PDF statement. Leave: automated calls (we send nothing). No instalment or interest engine: that is our gap to fill |
| Interest-ledger apps (for example "Byaj Khata Book") | Simple and compound interest over many periods, penalty and discount, PDF reports, interest-first payment option | Take: interest-first allocation, clear PDF. **Leave: compound interest** (§15.3.5) |
| Daily-finance collection apps (for example Vasool, Daily Finance, DailyFinance, Daily/Weekly Cash Collections) | Daily, weekly and monthly plans; flat, reducing and interest-only; routes with street order; agent apps; voice entry; photo proof; offline; thermal-printer receipts; WhatsApp receipts; daybook per route; automated penalties and grace | Take: routes in order, agent-scoped view, daybook per route, receipts, flat/reducing/interest-only, grace days. Later: offline, thermal printing. Leave: photo-of-borrower proof (DPDP minimisation), automated penalties without an owner tap |
| Small-lender loan-management tools (for example Lendstack, Freebird) | Borrower app, SMS/WhatsApp reminders sent by the product, projected cash flow, multi-branch, and **remote device locking** (Freebird) | Take: expected-collections forecast (later). **Leave: device locking, product-sent reminders, borrower app** |
| Enterprise loan systems (Finflux, Pennant, Finezza) | Origination, KYC, bureau, NACH, co-lending | Out of scope: these are for regulated lenders, and they move money |

Our distinct position: the lender's register **inside the same app** as their shop books, with
the ledger, receipts, statements and reminders they already trust, and with **disclosure and
fair-collection guardrails** that the single-purpose apps don't advertise.

### 17.2 MVP (minimum useful set)
1. Borrower role on parties, with the minimal lending profile.
2. Loan create with four plans: **flat, reducing, interest only, fixed daily**. Deductions at
   disbursal, weekday collection days, rounding rules, and the preview with the effective rate.
3. The **recurring-dues engine** (shared) with oldest-first allocation, statuses and a daily
   overdue job.
4. **Collections** as payments: part, full and advance; receipt (A5, 80 mm, WhatsApp text); void.
5. **Today list** in route order; **collection routes** with agent assignment; **agent
   scoping**.
6. **Arrears** with days-past-due buckets; the **visit note** ("Not paid" plus a promise date).
7. **Early closure** with the payoff sheet (interest-to-date and full-contracted rules), normal
   closure, **write-off**, cancel (no collections), and the **closure letter**.
8. **Waiver** with a reason; **manual late fee**, only when declared in the loan terms.
9. **Loan summary**, **receipt**, **loan statement**, **closure letter**; all tenant-branded.
10. **Reminders** through the existing pipeline, with the 08:00–19:00, once-a-day and fixed-template
    guardrails.
11. Dashboard section; reports: collection sheet, collection register, arrears, loan book,
    disbursal register.
12. Permissions (§12), audit, export, the licence number setting, and the rate-ceiling warning
    setting.

### 17.3 Later-1
Top-up; reschedule mid-loan; open loans with daily accrual (§6.5); automatic late-fee
*suggestions* after grace; holiday calendar; yearly statements batch; interest report; agent
performance; closed-loans report; CSV import of existing loans; statement share links (once
`parties_share_link` lands); a loan-level promise date.

### 17.4 Later-2
Agent cash handover and cash position; expected-collections forecast; "Money borrowed" (§15.6,
after legal review); thermal-printer direct printing (needs an ADR); offline collection (needs an
ADR, and it is the largest field gap); regional-language documents beyond Hindi and English;
guarantor reminders.

### 17.5 Never
Money movement, credit scoring or shared borrower lists, deposit or investor schemes, device
locking, contact scraping, compound interest, product-sent messages (until DEC-012 changes, and
even then only fixed templates), and collateral or pawn tracking.

## 18. Open questions for the owner

| # | Question | Why it matters | Research suggestion |
|---|---|---|---|
| Q1 | Should the rate-ceiling warning ship empty (the tenant sets it) or with a default such as 24% a year? | A default looks like legal advice; no default leaves users unwarned | Empty, with a neutral prompt; lawyer to confirm (L1) |
| Q2 | Is online-only acceptable for agents in MVP? Offline is the most requested field feature in competitors and would need an ADR | Routes have poor network | Accept online-only for MVP, with retry-safe drafts; decide on the offline ADR in Phase 5 |
| Q3 | Does a borrower's loan balance share the party's single balance (§16.3 option 1)? | It affects the dashboard, aging and reminders for every vertical | Option 1 now; review sub-balances in Phase 5 |
| Q4 | Are "Money borrowed" funders wanted at all, given the BUDS Act (§15.6)? | Legal exposure | Not in MVP; later only for relatives and partners, after a lawyer's review |
| Q5 | Which plans matter most to the first users: fixed daily, monthly flat, or reducing? | Build order within the MVP | All four are cheap once the engine exists; test fixed daily first if daily finance is the lead segment |
| Q6 | Allocation order: fees last (borrower-fair, recommended) or fees first (common lender practice)? | It changes who falls into arrears | Fees last by default, as a tenant setting |
| Q7 | Default early-closure rule: interest-to-date or full contracted? | It changes the payoff figure a borrower is shown | Interest-to-date by default; show both |
| Q8 | May an agent void their own collection (the same day, within 15 minutes)? | Fraud control versus typo recovery | Yes, within 15 minutes, audited; otherwise owner only |
| Q9 | May staff create loans, or only the owner and admin? | Exposure control | Owner and admin only by default; a codename can grant it |
| Q10 | Should sign-up for the lending module ask for a licence or registration number (optional)? | Karnataka treats unregistered lending as void; it creates platform exposure (L6) | Optional field, shown on documents; lawyer to advise |
| Q11 | Is the disbursal a payment out (§16.2 a) or a ledger debit (b)? | One money path versus a simpler label | (a); the architecture agent decides |
| Q12 | Retention after closure, and erasure requests (L3)? | DPDP versus book-keeping duty | Lawyer to set N years |
| Q13 | Whole-rupee rounding by default for daily plans? | Agents collect round amounts | `rupee_up` default for fixed daily; `paise` for the others |

---

## Sources (all checked 29 Sep 2026)

State money-lending law
- Maharashtra Money-Lending (Regulation) Act, 2014: India Code, https://www.indiacode.nic.in/handle/123456789/19683?view_type=browse
- Maharashtra Act section list (s.24 accounts, s.25 statements, s.31 interest limits, s.39 unlicensed, s.45 molestation): https://lawgist.in/states/maharashtra/maharashtra-moneylending-regulation-act-2014
- Maharashtra licence, reported 15%/18% ceilings, registers and receipt books (secondary; verify against the current notification): https://www.lendastra.com/blog/maharashtra-money-lending-act-2014-license-limits-liabilities
- Gujarat Money-Lenders Act, 2011, bare act: https://www.indiacode.nic.in/handle/123456789/19571?view_type=browse
- Gujarat Act highlights (registration, forms, receipts, yearly statement, simple interest, audit): https://canirmalg.com/2011/06/16/thegujaratmoneylendersact2011/
- Tamil Nadu Prohibition of Charging Exorbitant Interest Act, 2003 (text): https://prsindia.org/files/bills_acts/acts_states/tamil-nadu/2003/2003TN38.pdf
- Kerala Prohibition of Charging Exorbitant Interest Act, 2012: India Code, https://www.indiacode.nic.in/handle/123456789/20258?locale=en
- Karnataka Micro Loan and Small Loan (Prevention of Coercive Actions) Ordinance, 2025, explained: https://thesouthfirst.com/karnataka/explained-karnataka-microfinance-ordinance-no-coercive-recovery-ban-on-pawn/
- Karnataka ordinance key features: https://www.lexology.com/library/detail.aspx?g=3834ef18-0173-488e-83eb-425c28cd031a

RBI
- Draft recovery norms, 08:00–19:00 and harassment ban (Feb 2026 draft): https://upstox.com/news/business-news/financial-regulations/rbi-proposes-overhaul-of-loan-recovery-norms-draft-rules-ban-harassment-cap-calls-to-8am-7pm/article-189398/
- RBI directs recovery agents not to intimidate borrowers (2022): https://www.business-standard.com/amp/article/finance/rbi-directs-loan-recovery-agents-not-to-intimidate-borrowers-no-calling-before-8am-after-7pm-122081201144_1.html
- Key Facts Statement circular, 15 Apr 2024: https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12663&Mode=0
- KFS analysis (APR, schedule, effective 1 Oct 2024): https://vinodkothari.com/2024/04/the-key-to-loan-transparency-rbi-frames-kfs-norms-for-all-retail-and-msme-loans/
- Penal charges in loan accounts, FAQs (no capitalisation or compounding; from 1 Apr 2024): https://vinodkothari.com/2023/08/faqs-on-penal-charges-in-loan-accounts/

Deposits
- Banning of Unregulated Deposit Schemes Bill, 2019, summary: https://prsindia.org/billtrack/the-banning-of-unregulated-deposit-schemes-bill-2019
- BUDS Bill text (s.2(4) definition and exclusions, s.3 ban): https://prsindia.org/files/bills_acts/bills_parliament/2019/The%20Banning%20of%20Unregulated%20Deposit%20Schemes%20Bill,%202019%20Text_0.pdf
- BUDS Act, India Code: https://www.indiacode.nic.in/handle/123456789/11641?view_type=browse

Data protection
- DPDP Rules, 2025, notified (PIB): https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf
- DPDP Act and Rules timeline and obligations: https://www.taxmann.com/post/blog/analysis-indias-dpdp-act-and-rules

Income tax (cash limits)
- Sections 269SS/269T, ₹20,000 cash limit, 100% penalty: https://cleartax.in/s/section-269ss-269t

Competitors and tools
- Khatabook features: https://khatabook.com/blog/khatabook-app-features/
- Byaj Khata Book (interest ledger app): https://play.google.com/store/apps/details?id=com.clothol.byajkhatabook
- Vasool daily collection app: https://vasool.app/daily-collection-app
- Lendstack daily finance software: https://www.lendstack.in/daily-finance-collection-software-india/
- Daily/Weekly Cash Collections app: https://play.google.com/store/apps/details?id=com.vjgroups.collectionbook&hl=en_SG&gl=US
- DailyFinance app: https://play.google.com/store/apps/details?id=com.prayuta.dailyfinance&hl=en_IN
- Freebird: Lender & EMI Manager: https://play.google.com/store/apps/details?id=com.tilicho.lendpal&hl=en_IN

Code read for §16 (commit on main, 29 Sep 2026): `backend/apps/ledger/models.py`,
`ledger/constants.py`, `ledger/services/postings.py`, `ledger/selectors/collection.py`,
`payments/models.py`, `purchases/services/payment_seam.py`, `parties/models.py`,
`common/constants.py`, `common/money.py`, `platform_app/services/tenant_settings.py`.
