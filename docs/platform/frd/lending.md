# FRD: Lending & collections (`lending`)

Status: **DRAFT FOR REVIEW, 29 Sep 2026 (Phase 3, module documentation).** Business analyst's
requirements for the Lending & collections module. Nothing here is code. It is written against, and
bound by:

- [00-platform-vision.md](../00-platform-vision.md), whose §7 is this document's 14-section template;
- [10-architecture.md](../10-architecture.md) and [11-contracts.md](../11-contracts.md), which this
  FRD cites and never changes (contradictions are in §C, *Contract questions*);
- ADR-041 to ADR-055 in [Part 38](../../38-architecture-decision-records.md), of which ADR-043 (the
  `loan` bucket), ADR-047 (allocation), ADR-048 (dues in expectation mode), ADR-052 (agent scoping)
  and ADR-054 (reminder guardrails) carry most of this module;
- [research/lending.md](../research/lending.md) (the main input, cited as *R§n*) and
  [research/shared-engines.md](../research/shared-engines.md) (*SE§n*);
- the house FRD style of [Part 17.0](../../17-00-frd-template.md) and
  [17-02](../../17-02-frd-ledger-payments.md) (numbered `FR-n`, `BR-n`, `EC-n`, `T-<ID>-n`);
- `CLAUDE.md` (email identity, nothing emailed, BrandHub frontend patterns, no raw host elements,
  errors through the global snackbar, documents never name the product).

The core and engine items this FRD depends on are specified by `frd/00-core-and-engines.md`, which is
being written in parallel. They are cited here by their names in 10-architecture §13 (Wave A items
**A1–A11**, the **dues engine**) and 11-contracts (function and table names), never by section numbers
of that FRD.

**The one-sentence position (R§0, vision §4).** YourKhata keeps the lender's register: who borrowed
what, on what terms, what fell due, what was collected, by whom, and what is left. It does not lend,
move money, score anybody, take deposits or chase borrowers.

Every money figure in the worked examples was computed with a `Decimal` script before it was written
here, and the tests in each feature's §12 pin them.

---

## Contents

- [0. Conventions used by every feature](#0-conventions-used-by-every-feature)
- [LEN-01 Module switch, settings and notices](#len-01--module-switch-settings-and-notices)
- [LEN-02 Borrower profile and guarantor](#len-02--borrower-profile-and-guarantor)
- [LEN-03 Loan terms, schedule calculator and effective yearly rate](#len-03--loan-terms-schedule-calculator-and-effective-yearly-rate)
- [LEN-04 Create a loan and record the disbursal](#len-04--create-a-loan-and-record-the-disbursal)
- [LEN-05 Loan list and loan page](#len-05--loan-list-and-loan-page)
- [LEN-06 Collections: record, allocate, receipt, void](#len-06--collections-record-allocate-receipt-void)
- [LEN-07 Collection routes, agents and scoping](#len-07--collection-routes-agents-and-scoping)
- [LEN-08 Today list, arrears and "not paid" visit notes](#len-08--today-list-arrears-and-not-paid-visit-notes)
- [LEN-09 Late fees and waivers](#len-09--late-fees-and-waivers)
- [LEN-10 Closing a loan: normal, early, write-off, cancel](#len-10--closing-a-loan-normal-early-write-off-cancel)
- [LEN-11 Documents](#len-11--documents)
- [LEN-12 Reminders with guardrails](#len-12--reminders-with-guardrails)
- [LEN-13 Dashboard section and reports](#len-13--dashboard-section-and-reports)
- [LEN-14 Legal guardrails as testable rules](#len-14--legal-guardrails-as-testable-rules)
- [A. Defaults the owner may change](#a-defaults-the-owner-may-change)
- [B. Legal review items](#b-legal-review-items-for-a-lawyer-or-ca)
- [C. Contract questions](#c-contract-questions)
- [D. Implementation task list](#d-implementation-task-list)
- [E. Out of scope, and why](#e-out-of-scope-and-why)

---

## 0. Conventions used by every feature

Stated once; every feature below relies on them.

### 0.1 Words

Plain words only (vision §4): *borrower*, *lender* (the tenant), *guarantor*, *loan*, *instalment*,
*collection*, *collection route*, *collection agent*, *visit note*, *waiver*, *late fee*, *write-off*.
No regional names for daily schemes, routes or interest styles.

| English | Hindi (ordinary words) | Key |
|---|---|---|
| Loan | कर्ज़ | `lending.word.loan` |
| Borrower | कर्ज़ लेने वाले | `lending.word.borrower` |
| Guarantor | ज़मानतदार | `lending.word.guarantor` |
| Instalment | किस्त | `lending.word.instalment` |
| Collect | वसूली दर्ज करें | `lending.action.collect` |
| Not paid | नहीं मिला | `lending.action.notPaid` |
| Due today | आज देय | `lending.word.dueToday` |
| Arrears | बकाया | `lending.word.arrears` |
| Days past due | दिन से बकाया | `lending.word.daysPastDue` |
| Effective yearly rate | असल सालाना दर | `lending.word.effectiveRate` |
| Cash handed over | हाथ में दी गई रकम | `lending.word.cashHandedOver` |
| Receipt | रसीद | `lending.word.receipt` |
| Waiver | छूट | `lending.word.waiver` |
| Late fee | देरी शुल्क | `lending.word.lateFee` |
| Write off | बट्टे खाते में डालें | `lending.action.writeOff` |
| Closure letter | हिसाब पूरा होने का पत्र | `lending.doc.closureLetter` |
| Collection route | वसूली रूट | `lending.word.route` |
| Today | आज की वसूली | `lending.today.title` |

The Hindi words are a first pass for the copy review; `hindiSpellingConsistency.test.ts` pins them
once agreed.

### 0.2 Where things live

| Concern | Convention (10-architecture §2, §5, §6) |
|---|---|
| Module code | `lending` (`ModuleCode.LENDING`), in `UNRELEASED_MODULES` until its release CR (A1) |
| Django app | `backend/apps/lending`, tables `lending_*`, every one a `TenantModel` (UUIDv7 `id`, `tenant` RESTRICT, `created_by` SET NULL, timestamps) |
| API prefix | `/api/v1/lending/…`, resources plural and kebab-case |
| Frontend | `frontend/src/modules/DigiKhaato/features/lending/{api,components,hooks,redux,types,constants,view-model,validation}`; pages under `frontend/app/(app)/lending/…` |
| Slices | lazily injected only (`slice.injectInto(rootReducer)`, declared on `LazyLoadedSlices`); none in `store.ts`'s static reducers; adding the module must not move the `sharedApp` bundle budget |
| Locales | `locales/catalogues/lending.{en,hi}.json`, prefix `lending.` |
| Imports | `lending` may import `CORE ∪ {dues}` (10-architecture §10.1); never `sales`, `purchases`, `inventory`, `expenses`, or another vertical; the frontend folder likewise (ESLint zone) |
| Money | `MoneyField` (`numeric(14,2)`), `Decimal` everywhere, `half_up` (ROUND_HALF_UP) at the point a figure becomes a row; API strings with two decimals |
| Dates | business dates are `date` in the tenant's timezone (`platform_tenant.timezone`, `Asia/Kolkata` default); instants are `timestamptz` |
| Errors | every code registered in `apps/common/error_codes.py` and Part 22 §22.1.1 (§0.7); the client maps `error.code` to `errors.<code>` and shows it through the global snackbar |
| Idempotency | every create-POST carries `Idempotency-Key` (one per form mount, reused on retry, regenerated after a 2xx or a changed body) |
| Audit | one `write_audit` row per logical event, in the transaction, action `lending.<entity>.<verb>` declared on `AuditAction` (§0.9) |

### 0.3 The money model in one table

This is the whole of how a loan touches money. Every rupee that moves is a **payment**; every
obligation that is not a payment is a **ledger line**; the **dues engine** says when money is
expected. The loan keeps no balance of its own (vision §3, R§6.11).

| Fact | Recorded as | Ledger line (bucket `loan`, ADR-043) | Moves `party.balance` and `party.loan_balance` |
|---|---|---|---|
| Cash handed over at disbursal | `payments_payment` **out**, allocated to the `lending_loan` target (`auto=False`, bucket `loan`, ADR-047) | `payment_out`, debit, source `payment` | + cash handed over |
| Each deduction at disbursal (processing fee, upfront interest…) | `lending_loan_deduction` row | `charge`, debit, source `lending_deduction` | + deduction |
| An instalment's interest (and any scheduled fee) falling due | `dues_due_component`, posted by the dues engine on `due_on` | `interest` (or `charge`), debit, source `dues_component` | + interest |
| An instalment's principal falling due | `dues_due_component` (principal) | **nothing**: principal is already owed from disbursal (ADR-048) | none |
| A late fee (declared in the terms) | `dues_adjustment` kind `penalty`, via `dues.add_penalty` | `charge`, debit, source `dues_adjustment` | + fee |
| A waiver of interest, fee or principal on a due | `dues_adjustment` kind `waiver`, via `dues.waive` | `adjustment_credit`, credit, source `dues_adjustment` | − waiver |
| A write-off | `lending_waiver` row | `adjustment_credit`, credit, source `lending_waiver` | − amount |
| A collection | `payments_payment` **in**, allocated to `dues_instalment` targets; the component split in `dues_settlement` (ADR-047) | `payment_in`, credit, source `payment` | − collection |

So a borrower's `loan_balance` (for one loan) is always **principal outstanding + interest and fees
posted and not yet paid − anything paid in advance against interest not yet posted**. LEN-06 BR-9
states it as an invariant and LEN-06 §12 replays it.

### 0.4 Figures every screen uses (one definition each)

| Figure | Definition | Source |
|---|---|---|
| **Owed now** | Σ of the loan's own `loan`-bucket ledger lines, posted and not reversed (debits − credits) | `lending.selectors.loan_ledger(loan)` (LEN-06 §5) |
| **Principal outstanding** | principal − Σ principal settled − Σ principal waived | dues components |
| **Due today** | Σ outstanding of the loan's dues with `due_on = today` | dues |
| **Arrears** | Σ outstanding of the loan's dues with status `overdue` (`due_on < today`, grace 0), including posted late fees | dues |
| **Days past due (DPD)** | today − the oldest `due_on` among dues that still have unpaid **principal or interest**; 0 when none. A due whose only remainder is a fee or late fee does **not** set DPD (§C CQ-6) | dues |
| **Remaining under the schedule** | Σ outstanding of every open and scheduled due, including interest not yet posted | dues |
| **Payoff today** | LEN-10 BR-3, by the loan's early-closure rule | lending calculator over `dues.payoff` |
| **Collected** | Σ recorded (not void) collection payments of the loan | payments + `lending_collection` |

"Outstanding" of a due is `amount + Σ penalties − settled_amount − waived_amount`.

### 0.5 Actors

| Code | Actor | Signs in? | Role |
|---|---|---|---|
| OW | Owner-lender | yes | `owner` |
| AD | Admin (manager of a finance firm) | yes | `admin` |
| ST | Office staff | yes | `staff` |
| AG | Collection agent | yes | module role `lending_agent` (ADR-052, 11-contracts §3) — pending the owner's confirmation (10-architecture §16 item 1) |
| AC | Accountant | yes | `accountant` (read and export only) |
| BO | Borrower | **never** | receives receipts, reminders and statements on paper or WhatsApp; documents carry the lender's name only |
| GU | Guarantor | **never** | a party named on a loan; may receive a reminder (LEN-12) |

### 0.6 Status machines

**Loan** (`lending_loan.status`):

```
                       ┌──(last due settled, owed now = 0)──▶ closed (close_reason = completed)
                       ├──(close early, payoff collected)────▶ closed (close_reason = early)
   (save) ──▶ active ──┼──(owner writes off, reason)─────────▶ written_off
                       └──(no collections, reason)───────────▶ cancelled
   closed ──(the collection that closed it is voided)──▶ active     (audited; letter marked no longer valid)
```

No other transition exists. `written_off` and `cancelled` are terminal in the MVP (recovery after a
write-off is LEN-10 §14).

**Due** (the dues engine's, 11-contracts §2.1): `scheduled → due → overdue → paid`, plus `cancelled`
and `skipped`. *Part paid* and *waived* are derived (`settled_amount`, `waived_amount`). Lending shows
them as: Upcoming, Due, Overdue, Part paid, Paid, Paid in advance (paid before `due_on`), Waived,
Cancelled.

### 0.7 Error codes

New codes this module registers (named by Part 22 §22.1.2, one condition one code):

| Code | HTTP | `details` | Raised when | Feature |
|---|---|---|---|---|
| `loan_not_active` | 409 | `status` | a write to a closed, written-off or cancelled loan | all |
| `loan_terms_locked` | 409 | `fields` | a PATCH of a terms field | LEN-04 |
| `loan_rate_above_warning` | 409 | `effective_annual_rate`, `warning_rate` | save above the tenant's warning rate without confirmation | LEN-03, -04 |
| `loan_preview_changed` | 409 | `preview` | the pinned preview differs from the server's at save | LEN-04 |
| `loan_disbursal_locked` | 409 | `loan_id` | the disbursal payment is voided outside a cancel | LEN-04 |
| `loan_has_collections` | 409 | `count` | cancel of a loan with a recorded collection | LEN-10 |
| `collection_over_payoff` | 409 | `payoff`, `amount` | a collection at or above the payoff | LEN-06 |
| `collection_void_window_passed` | 409 | `window_minutes` | an agent's void after the window | LEN-06 |
| `late_fee_not_in_terms` | 409 | — | a late fee on a loan whose terms declared none | LEN-09 |
| `payoff_changed` | 409 | `payoff` | close early with a stale pinned payoff | LEN-10 |
| `closure_letter_unavailable` | 409 | `status` | a closure letter for a loan that is not `closed` | LEN-11 |
| `route_has_loans` | 409 | `count` | archiving a route with active loans | LEN-07 |
| `visit_edit_window_passed` | 409 | `window_minutes` | editing a visit note after the window | LEN-08 |

Reused, same state (11-contracts §4 and the existing registry): `validation_error`, `not_found`,
`permission_denied`, `module_disabled`, `module_has_data`, `party_has_open_records`,
`party_archived`, `schedule_backdated_unconfirmed`, `due_not_open`, `penalty_cap_reached`,
`reminder_outside_window`, `reminder_cap_reached`, `reminder_not_sendable`, `balance_changed`,
`nothing_to_write_off`, `payment_already_void`, `mode_sum_mismatch`, `upi_vpa_missing`,
`idempotency_conflict`, `stale_version`.

### 0.8 Codenames

Declared once in `apps/common/permissions_registry.py` (strings only, 10-architecture §3 L4);
`MODULE_OF` derives `lending` from the prefix, so they disappear from every member when the module is
off.

`lending.loan.read`, `lending.loan.read_all`, `lending.loan.terms_read`, `lending.loan.create`,
`lending.loan.write`, `lending.loan.close`, `lending.loan.cancel`, `lending.borrower.read`,
`lending.borrower.write`, `lending.borrower.id_read`, `lending.collection.create`,
`lending.collection.read`, `lending.collection.void`, `lending.collection.void_own`,
`lending.visit.write`, `lending.charge.create`, `lending.waiver.create`, `lending.route.read`,
`lending.route.manage`, `lending.today.read`, `lending.myday.read`, `lending.reminder.send`,
`lending.report.read`, `lending.report.export`.

**Role checks, not codenames** (business ceilings, the LED-03 rule): write-off (owner only), waivers
(owner; admin when `lending.waiver_by_admin`), confirming a rate above the warning (owner or admin),
reminding a guarantor (owner or admin).

| Role | Holds |
|---|---|
| owner | every codename (the existing `_OWNER = PERMISSIONS`) |
| admin | every codename (`_ADMIN`) |
| staff | LEN-07 §10's list (a canon amendment, §C CQ-12) |
| accountant | every `lending.*.read`, `lending.loan.read_all`, `lending.loan.terms_read`, `lending.report.export` |
| `lending_agent` | LEN-07 §10's list only |

### 0.9 Audit actions

`lending.borrower.created|updated`; `lending.loan.created|updated|rate_warning_confirmed|closed|
closed_early|written_off|cancelled|reopened`; `lending.collection.recorded|voided`;
`lending.visit.created|edited`; `lending.late_fee.added`; `lending.waiver.created`;
`lending.route.created|updated|archived|agents_changed|stops_reordered`; `lending.reminder.prepared`.
The engine and payments write their own (`dues.*`, `payment.*`) in the same transaction.

---

## LEN-01 — Module switch, settings and notices

### 1. Product requirements

A lender turns the module on from Settings → Features, answers a short set of lending settings, and
from then on sees a Lending group in the menu. Until the release CR the module is invisible to
merchants (10-architecture §2.4).

- FR-1 `ModuleCode.LENDING = "lending"` lands with `apps/lending`'s first migration and is listed in
  `UNRELEASED_MODULES` until the release CR (A1). `MODULE_DEPENDENCIES["lending"] = {parties, ledger,
  payments}`; `ENGINES_USED_BY["lending"] = {dues}`.
- FR-2 Switching the module on runs the **lending preset seed** idempotently: the `loan` number kind
  (A8, `register_number_kind("loan", module="lending", mode="fy", default_prefix="LN", padding=4)`,
  numbers like `LN/26-27/0042`), the lending settings rows at their defaults (§A), and the
  `lending_agent` system role becoming assignable. It touches no other module's settings.
- FR-3 Switching it off is refused while any loan is `active` — 409 `module_has_data` with the count
  (10-architecture §9; this **overrides R§13 EC-13**). Closed, written-off and cancelled loans never
  block. Switching back on restores everything; nothing is deleted.
- FR-4 **Settings → Lending** holds the settings in §A. Each is a tenant setting under the key prefix
  `lending.` (see §C CQ-8 for how module keys register).
- FR-5 **Licence or registration number** (`lending.licence`): optional `{number ≤ 40, authority ≤ 80}`.
  When set it prints on every lending document (LEN-11). When empty, the loan list and the new-loan
  form show one **neutral, dismissible notice** once per member: "Some states require money lenders
  to be licensed or registered. You can add your number in Settings → Lending." Dismissal is
  remembered per member (a `localStorage` convenience, wrapped in try/catch; losing it only shows the
  notice again).
- FR-6 **Rate-ceiling warning** (`lending.rate_ceiling`): optional, `{percent_per_year: 0.01–999.99}`,
  **empty by default** (R§18 Q1; legal item L1). The settings screen explains it in neutral words:
  "Warn me when a loan's effective yearly rate is above ___ %." It never names a state, a law or a
  "legal" rate. It drives LEN-03 BR-12.
- FR-7 A one-time **what this module does** panel on the Lending home for the owner, dismissible:
  "YourKhata keeps your lending records: loans, instalments, collections and receipts. It does not
  lend or move money, check anyone's credit, or send messages for you." (This is in-app copy for the
  lender, never on a borrower's document; LEN-14 G-1, G-2.)

### 2. User flows

- **Turn on.** Settings → Features → Lending & collections → switch on (parties, ledger and payments
  are core and always on) → the lending settings sheet opens once with the defaults of §A pre-filled
  → Save → the menu gains *Today*, *Loans*, *Routes*, *Collections* (under a "Lending" heading only
  when two or more verticals are on, 10-architecture §6 item 2).
- **Turn off with active loans.** Switch off → 409 `module_has_data` → dialog: "12 loans are still
  active. Close, write off or cancel them before switching Lending off." No data is touched.
- **Add the licence number.** Notice → *Add number* → Settings → Lending → Save → the notice stops
  showing and every new print carries the number.

### 3. Features

| MVP | Later |
|---|---|
| Module code, gate, dependencies, preset seed, off-guard | Onboarding checklist that switches dependencies on (ships with the first released vertical, 10-architecture §13.2 item 5) |
| Settings of §A, licence number, rate-ceiling warning, notices | A lawyer-approved default ceiling, if the owner decides one (L1) |
| | Asking for the licence number at lending sign-up (L6, R§18 Q10) |

### 4. Entities and relationships

No lending table. Settings are `platform_tenant_setting` rows (`lending.*`); the number kind is a
`platform_document_sequence` row of kind `loan`; the role is a `platform_role` system row
`lending_agent`.

### 5. Database

- `platform_tenant_setting`: keys of §A (value shapes are small objects, the catalogue's convention:
  `{"value": …}`, `{"percent_per_year": "36.00"}`, `{"number": "…", "authority": "…"}`).
- `platform_document_sequence`: `(tenant, kind='loan', fy_label)` rows created on demand by
  `allocate_number`.
- `platform_role`: one system row `code='lending_agent'`, `tenant=NULL`, `is_system=True`, codenames
  per LEN-07 §10.
- Module-off guard: `register_module_off_guard("lending", count_active_loans)` —
  `SELECT count(*) FROM lending_loan WHERE tenant_id=$1 AND status='active'`, served by
  `ix_lending_loan_status` (LEN-04 §5). The dues engine's own guard for `module='lending'` also runs
  (11-contracts §2.1).

### 6. API

| Method and path | Permission | Body / result | Errors |
|---|---|---|---|
| `PATCH /api/v1/tenants/current` with `enabled_modules` (existing, PLT-06 FR-4, `update_enabled_modules`) | existing settings permission (owner, admin) | `{enabled_modules: [...]}` | 403 `module_disabled` (not in plan or partner, or unreleased); 409 `module_has_data {module, count}` |
| `GET /api/v1/tenants/current/settings` (existing) | existing `SettingsPermission` (read: owner, admin, accountant) | includes the `lending.*` keys when the module is on | — |
| `PUT /api/v1/tenants/current/settings` (existing) | existing `SettingsPermission` (write: owner, admin) | any subset of `lending.*` | 400 `validation_error {details.<key>}` |

### 7. Frontend

- Route: `/settings/lending` (inside the existing settings shell; a section shown only when the module
  is in `enabled_modules`).
- Components: `LendingSettingsForm` (RHF + `lendingSettingsSchema` from `useValidationSchemas()`),
  `LicenceNotice`, `ModuleIntroPanel`.
- Service: `api/lendingSettingsService.ts` wraps the existing settings endpoints for the `lending.`
  keys. No new slice: the settings slice already exists.
- `MODULE_CODES` on the client is replaced by the server's list (10-architecture §6 item 3) as part of
  this module's first change, with the equality test.

### 8. UI/UX

- Settings form, single column on a phone: Allocation order (radio with a one-line explanation per
  choice), Early-closure rule (radio), Rounding (radio), Warn above __ % a year (`UbPercentInput`,
  empty allowed, hint "Leave empty for no warning"), Licence or registration number and authority
  (`UbTextInput`), Agent may void own collection within __ minutes (0–60), Admins may give waivers
  (switch), Reminder hours (two time selects, bounded by 08:00–19:00 and only narrower).
- Allocation order explanations (en): *Fees last* — "Money pays instalments first, then late fees. A
  small fee never keeps an instalment unpaid." *Oldest first* — "Money pays the oldest instalment in
  full, including its late fee, before the next one." *Fees first* — "Money pays late fees first,
  then instalments." Hindi keys `lending.settings.order.*`.
- No copy anywhere in the module says a rate or practice is legal, allowed, compliant or approved
  (LEN-14 G-4).

### 9. Validation and business rules

| Key | Rule | Message |
|---|---|---|
| `lending.rate_ceiling.percent_per_year` | empty, or 0.01–999.99, two decimals | "Enter a rate between 0.01 and 999.99, or leave it empty." |
| `lending.licence.number` | ≤ 40 characters, trimmed | "Keep the number under 40 characters." |
| `lending.licence.authority` | ≤ 80 characters | |
| `lending.agent_void_minutes`, `lending.visit_edit_minutes` | integer 0–60 | |
| `reminders.lending.window` | `start ≥ 08:00`, `end ≤ 19:00`, `start < end`, 15-minute steps | "Reminders can only be between 8 am and 7 pm." |

- BR-1 A settings change applies to **new** loans only, except the licence number (printed on every
  document from now on) and the reminder window (applies from the next reminder). A loan snapshots
  its allocation order, early-closure rule and rounding rule at creation (LEN-04 BR-6), because they
  are part of what the borrower was told.
- BR-2 The reminder window may be narrowed, never widened (ADR-054).

### 10. Permissions

| Action | Who |
|---|---|
| Switch the module on or off | owner, admin (the existing settings permission, PLT-06 §12) |
| Edit Settings → Lending | owner, admin |
| Read Settings → Lending | owner, admin, accountant |
| See the licence notice and intro panel | owner, admin |

### 11. Reports

None of its own. The licence number appears in the header of every lending report's print sheet.

### 12. Testing

- T-LEN-01-1 (unit) `modules_view` omits `lending` while it is in `UNRELEASED_MODULES` and
  `UB_UNRELEASED_MODULES` is unset; lists it when set.
- T-LEN-01-2 (unit) switching on runs the preset seed once; a second switch-on changes nothing (row
  counts equal).
- T-LEN-01-3 (API) switch-off with one active loan → 409 `module_has_data {count: 1}`; with only closed
  loans → 200 and every row still present.
- T-LEN-01-4 (unit) the reminder window setting refuses 07:30–19:00 and 08:00–20:00, accepts
  09:00–18:00.
- T-LEN-01-5 (component) the licence notice shows when the number is empty and not dismissed; hides
  after dismissal; renders correctly when `localStorage` throws.
- T-LEN-01-6 (copy) covered by LEN-14 T-LEN-14-4.

### 13. Edge cases

1. EC-1 The plan or partner does not include lending → the switch shows the existing "not included in
   your plan" state; the release data migration adds it (10-architecture §2.4).
2. EC-2 A ceiling is set after loans exist → existing loans are not re-warned; the loan list's "Above
   your warning rate" chip (LEN-05) shows them.
3. EC-3 The owner narrows the reminder window to 10:00–12:00 while an agent has the Remind sheet open
   at 12:05 → the server refuses (`reminder_outside_window`), and the sheet shows the next allowed time.

### 14. Future

Onboarding checklist entry for lenders; a default ceiling only if the owner and a lawyer decide one
(L1); a licence-number field at lending sign-up (L6).

---

## LEN-02 — Borrower profile and guarantor

### 1. Product requirements

A borrower is a **party** (vision §3; ADR-046) with a **lending profile**; the profile's existence is
the borrower role. A guarantor is another party named on a loan. One person has one contact record,
whatever else they do with the business (a shop customer who borrows is one party).

- FR-1 `lending_borrower` is a 1:1 profile on `parties_party` (`related_name="+"`). Creating it makes
  the party a borrower; nothing is added to `parties_party` (ADR-046).
- FR-2 Profile fields (minimised, R§15.5, ADR-053): occupation, collection address (defaults to the
  party's address when empty), ID proof **type** and **last four characters only**, preferred document
  language (English or Hindi), notes.
- FR-3 A borrower can be created three ways: from the party page (*Add lending profile*), from
  Lending → Borrowers → *New*, and inline from the new-loan form. Inline creation uses the existing
  party form fields (name, mobile, address) plus the profile fields, in one request.
- FR-4 `register_party_role("lending_borrower", module="lending", label_id="lending.role.borrower",
  party_ids=…)` and `register_party_role("lending_guarantor", …, party_ids=guarantors of active
  loans)`, so `GET /parties?role=lending_borrower` filters the core party list and the party page
  shows a *Borrower* or *Guarantor* badge (A6).
- FR-5 **Guarantor** is chosen per loan (LEN-04 FR-4) from the party list or created inline (name and
  mobile only). A guarantor needs no profile. A borrower cannot be their own guarantor.
- FR-6 `register_archive_guard("lending", guard)`: archiving a party is refused while they are the
  borrower or the guarantor of an `active` loan — 409 `party_has_open_records {module: "lending",
  count, label_id: "lending.archive.blocked"}` (A6). The existing non-zero-balance guard still applies
  (ADR-043).
- FR-7 The party page shows a **Lending panel** through the frontend module-panel registry
  (`features/parties/modulePanels.ts`, 10-architecture §6 item 8): loans as borrower and as guarantor,
  owed now, next due, and *New loan*.
- FR-8 ID fields are **restricted fields** (`RestrictedFieldsMixin`, 11-contracts §3): they appear only
  to members holding `lending.borrower.id_read` (owner, admin), never in lists, exports, share links,
  documents or to agents.

### 2. User flows

- **From the party page.** Party → Lending panel → *Add lending profile* → sheet with the profile
  fields → Save → the badge *Borrower* appears; *New loan* becomes available.
- **Inline in the new-loan form.** New loan → Borrower → type a name → *Create "Sunita Devi"* → name,
  mobile (`UbPhoneInput`), address line, occupation (optional) → Create → the borrower is selected and
  the form continues.
- **Guarantor.** New loan → *Add guarantor* → pick a party or *Create* (name and mobile) → shown on the
  loan and the loan summary.
- **Archive refused.** Party → Archive → 409 → "Sunita Devi has 1 active loan. Close it before
  archiving."

### 3. Features

| MVP | Later |
|---|---|
| Profile, ID type + last 4, collection address, document language | Guarantor reminders by default (R§17.4); guarantor consent note |
| Borrower and guarantor roles in the party list and badges | Import borrowers with loans (LEN-04 §14) |
| Archive guard, restricted ID fields, party page panel | Retention purge of ID fields after closure + N years (L3) |

### 4. Entities and relationships

```
parties_party 1 ── 0..1 lending_borrower          (profile = role)
parties_party 1 ── 0..* lending_loan (borrower)
parties_party 1 ── 0..* lending_loan (guarantor)  (a guarantor needs no profile)
```

### 5. Database

**`lending_borrower`** (TenantModel)

| Column | Type | Constraint |
|---|---|---|
| `party_id` | uuid | `OneToOneField("parties.Party", on_delete=RESTRICT, related_name="+")`; unique |
| `occupation` | varchar(80) | default `''` |
| `collection_address` | varchar(255) | default `''`; empty = use the party's billing address |
| `id_proof_kind` | varchar(16) | `CHECK IN ('none','voter_id','driving_licence','pan','ration_card','other')`, default `'none'` |
| `id_proof_last4` | varchar(4) | default `''`; `CHECK (char_length(id_proof_last4) <= 4)`; `CHECK (id_proof_kind <> 'none' OR id_proof_last4 = '')` |
| `document_language` | varchar(2) | `CHECK IN ('en','hi')`, default `'en'` |
| `notes` | varchar(500) | default `''` |

Indexes: the one-to-one unique on `party_id` (serves the role subquery `id IN (SELECT party_id …)`);
`(tenant_id, created_at)` for the borrower list. `tenant_data.register` covers the table. No soft
delete: the profile lives as long as the party.

### 6. API

| Method and path | Codename | Request / response | Errors |
|---|---|---|---|
| `GET /lending/borrowers?q&has_active&route_id&page` | `lending.borrower.read` (scoped for agents to borrowers of their routes' loans) | `{data: [{party_id, name, mobile_masked, active_loans, owed_now, next_due_on}], meta: {page, totals}}` | — |
| `POST /lending/borrowers` | `lending.borrower.write` | `{party_id}` **or** `{party: {name, mobile, billing_address}}`, plus `{occupation, collection_address, id_proof_kind, id_proof_last4, document_language, notes}` → 201 `Borrower` | 400 `validation_error`; 404 party; the existing PTY-01 duplicate-mobile warning is returned in `meta.warnings` exactly as the party form does today |
| `GET /lending/borrowers/{party_id}` | `lending.borrower.read` | `Borrower` (ID fields only with `lending.borrower.id_read`) | 404 (cross-tenant or out of scope) |
| `PATCH /lending/borrowers/{party_id}` | `lending.borrower.write` | any profile field | 400 |
| `GET /parties?role=lending_borrower` | existing `parties.party.read` | the core list filtered (A6) | — |

`Borrower` = `{party_id, name, mobile, collection_address, occupation, document_language, notes,
id_proof_kind?, id_proof_last4?, loans: {active, closed}, created_at}`.

Server rule for `id_proof_last4` (ADR-053): the server **refuses** a value longer than four characters
with 400 `validation_error {id_proof_last4: "Enter only the last 4 characters."}` rather than
truncating it, so a full number is never accepted silently; the field is excluded from request
logging.

### 7. Frontend

- Routes: `/lending/borrowers` (list); a borrower's home is the party page `/parties/[id]` with the
  Lending panel.
- Components: `BorrowerProfileSheet` (`UbDrawer`), `BorrowerPicker` (`UbAsyncCombobox` over
  `/parties?role=lending_borrower` with *Create*), `GuarantorPicker`, `LendingPartyPanel` (registered
  in `features/parties/modulePanels.ts`, a `dynamic()` import).
- Service: `api/lendingBorrowerService.ts`. Slice: `borrowerSlice` (lazy).
- Schema: `borrowerProfileSchema` in `useValidationSchemas()`.

### 8. UI/UX

- Phone: the profile sheet is a bottom sheet, single column, with *ID proof* collapsed under "Add ID
  details (optional)". The last-4 field is 4 characters wide, `maxLength=4`, hint "Only the last 4
  characters. Never the full number."
- Badges on the party page: *Borrower* / कर्ज़ लेने वाले and *Guarantor* / ज़मानतदार.
- Agents never see the ID section or the notes.

### 9. Validation and business rules

| Field | Rule | Message key |
|---|---|---|
| `id_proof_last4` | 0 or 4 characters `[A-Za-z0-9]`; required when kind ≠ none | `lending.borrower.idLast4` |
| `occupation` | ≤ 80 | |
| `collection_address` | ≤ 255 | |
| guarantor | ≠ borrower; an active party | `lending.loan.guarantorSelf` |

- BR-1 The profile is never deleted while the party has any loan row (RESTRICT from `lending_loan`).
- BR-2 A guarantor is recorded, not scored: the product never rates a guarantor or borrower (G-2).
- BR-3 Audit `lending.borrower.created|updated` (ID fields masked in the snapshot).

### 10. Permissions

| Action | Codename | OW | AD | ST | AG | AC |
|---|---|---|---|---|---|---|
| Read borrower | `lending.borrower.read` | yes | yes | yes | own routes: name, mobile, collection address only | yes |
| Create / edit profile | `lending.borrower.write` | yes | yes | yes | no | no |
| Read ID fields | `lending.borrower.id_read` | yes | yes | no | no | no |

### 11. Reports

Borrower name, mobile and loan number appear in the lending reports; ID fields never do.

### 12. Testing

- T-LEN-02-1 (unit) creating a profile adds no column or row to `parties_party` beyond the party
  itself; `GET /parties?role=lending_borrower` returns exactly the profiled parties.
- T-LEN-02-2 (API) `id_proof_last4 = "12345"` → 400; `"1234"` → 201; the stored value is `"1234"`.
- T-LEN-02-3 (API) an agent reading a borrower sees no `id_proof_*` or `notes` keys (absent, not null).
- T-LEN-02-4 (API) archive a borrower with an active loan → 409 `party_has_open_records`; the same for a
  guarantor of an active loan; after closure → 200.
- T-LEN-02-5 (unit) the archive guard of a switched-off module is not called (A6 contract).

### 13. Edge cases

1. EC-1 The borrower is also a shop customer → one party; the party header shows the total balance;
   the Lending panel shows the loan-only figure; PTY-06's credit limit uses the trade figure (ADR-043).
2. EC-2 The same mobile already belongs to another party → the existing duplicate warning offers *Use
   existing party*.
3. EC-3 A guarantor later borrows → they gain a profile; both badges show.
4. EC-4 A party is merged (a later core feature) → loans follow the party's merge rules; no special
   path (SE§2.14 item 3).

### 14. Future

Guarantor consent record; retention purge of ID fields (L3); borrower import with loans.

---
## LEN-03 — Loan terms, schedule calculator and effective yearly rate

### 1. Product requirements

The lender types the terms; the product works out the whole schedule, the total payable, the total
interest and the **effective yearly rate**, and shows them before anything is saved. The server
computes; the client only previews (house convention). This feature is the calculator and its
preview endpoint; LEN-04 saves.

- FR-1 Four plans (R§17.2 item 2):
  | `plan_type` | Meaning | Frequencies |
  |---|---|---|
  | `flat` | interest on the original principal for the whole term | weekly, fortnightly, monthly |
  | `reducing` | equal instalments; each period's interest on the principal still outstanding (EMI) | weekly, fortnightly, monthly |
  | `interest_only` | each instalment is interest; the principal is due with the last | weekly, fortnightly, monthly |
  | `fixed_daily` | a fixed amount per collection day (or week) for a set count; no rate is typed — the interest is derived | daily (default), weekly |
- FR-2 **Deductions at disbursal**: zero or more lines, each `{kind, label, amount}`; kinds
  `processing_fee`, `upfront_interest`, `documentation`, `other`. **Cash handed over = principal −
  Σ deductions** is shown live.
- FR-3 Rate: a percentage with up to 4 decimals and a unit, `per_month` or `per_year`. `0` is allowed
  (an interest-free loan to a relative). `fixed_daily` takes no rate.
- FR-4 Term: `instalment_count`; first due date; for daily plans the **collection weekdays** (default
  Monday to Saturday). Dates come from the dues engine's recurrence and the tenant calendar (A9),
  never from `first_due + n − 1`.
- FR-5 Rounding (`rounding_rule`): `paise` (default), `rupee_up`, `ten_up` (R§6.6). Regular
  instalments round **up** under `rupee_up` and `ten_up`; the **last instalment absorbs the
  remainder** and is never larger than a regular one under those two rules.
- FR-6 Optional terms that are part of the loan from the start, and only as typed: **late fee rule**
  (LEN-09), **early-closure rule** (`interest_to_date` default, `full_contracted`, `owner_decides`),
  **foreclosure charge** (none by default; LEN-10), **allocation order** (tenant default, §A).
- FR-7 **Preview**: the full schedule (date, amount, principal, interest), total payable, total
  interest, total deductions, cash handed over, maturity date, and the **effective yearly rate**, on
  every plan, with no opt-out (R§15.3 item 2; G-8).
- FR-8 **Rate-ceiling warning** (LEN-01 FR-6): when a ceiling is set and the effective yearly rate is
  above it, the preview shows a neutral warning and saving needs an explicit confirmation, which is
  audited (G-5).
- FR-9 **Interest above principal** (information only, legal item L14): when total interest plus
  deductions exceeds the principal, the preview shows a neutral line: "Interest and deductions add up
  to more than the amount lent." It never blocks and never says why it might matter.
- FR-10 The calculator is a pure module, `apps/lending/services/calculator.py`, with no database
  access except the dates it asks the dues engine for (`dues.preview_schedule`) and the calendar.

### 2. User flows

New loan → Terms step → choose a plan (four cards with one-line descriptions) → type principal,
deductions, rate and unit, frequency, count, first due date (and collection weekdays for daily) → the
preview panel updates (debounced 400 ms, `POST /lending/loans/preview`) → the owner reads the schedule
and the effective yearly rate → Continue (LEN-04). A ceiling warning shows as a banner with *I
understand, continue*.

### 3. Features

| MVP | Later |
|---|---|
| Four plans, deductions, rounding rules, daily collection weekdays, closed days from the calendar | Open loans with day-by-day simple interest (R§6.5) |
| Preview, effective yearly rate, ceiling warning, interest-above-principal line | Daily frequency on rate-based plans (flat daily); step-up plans |
| Schedule sums checked on every save | "Interest as % of cash handed over" in plain words for fixed plans (L8) |

### 4. Entities and relationships

No table of its own. Its inputs are the terms columns of `lending_loan` and `lending_loan_deduction`
(LEN-04 §5); its outputs are the `supplied` dues passed to `dues.create_schedule`, and the derived
columns of `lending_loan` (`instalment_amount`, `total_interest`, `total_payable`, `maturity_on`,
`effective_annual_rate`).

### 5. Database

Nothing new; see LEN-04 §5. Each saved schedule is checked by service assertions (BR-8) and by the
property tests of §12, not by a trigger: the dues are engine rows and the engine owns their table.

### 6. API

`POST /api/v1/lending/loans/preview` — codename `lending.loan.create`; no write; no idempotency key.

Request (`LoanTerms`):

```json
{
  "plan_type": "flat",
  "principal": "20000.00",
  "deductions": [],
  "rate": "2.0000", "rate_unit": "per_month",
  "frequency": "monthly", "instalment_count": 10,
  "per_instalment_amount": null,
  "collection_weekdays": null,
  "disbursed_on": "2026-01-05", "first_due_on": "2026-02-05",
  "rounding_rule": "paise",
  "late_fee": {"kind": "none"},
  "early_closure_rule": "interest_to_date",
  "foreclosure_charge": {"kind": "none"}
}
```

Response 200:

```json
{
  "data": {
    "cash_handed_over": "20000.00", "deductions_total": "0.00",
    "instalment_amount": "2400.00", "total_interest": "4000.00", "total_payable": "24000.00",
    "maturity_on": "2026-11-05", "effective_annual_rate": "41.76",
    "effective_annual_rate_display": "41.8",
    "schedule": [{"seq": 1, "due_on": "2026-02-05", "amount": "2400.00",
                  "principal": "2000.00", "interest": "400.00", "fee": "0.00"}]
  },
  "meta": {"warnings": [
    {"code": "rate_above_warning", "effective_annual_rate": "41.8", "warning_rate": "36.00"}
  ]}
}
```

Warnings: `rate_above_warning`, `interest_above_principal`, `ends_early` (BR-3). Errors: 400
`validation_error` with `details.<field>` (§9); 403 `module_disabled`, `permission_denied`.

### 7. Frontend

- Components: `LoanTermsStep` (inside `LoanFormStepper`, LEN-04), `PlanTypeCards`,
  `DeductionLinesEditor`, `WeekdayPicker`, `SchedulePreviewTable` (`UbDataGrid` in card mode below
  `md`, first 5 and last 2 rows with "Show all 100"), `EffectiveRateBanner`, `RateWarningBanner`.
- Hook `useLoanPreview(terms)`: debounced call through `lendingLoanService.previewLoan`; cancels the
  previous request (AbortController) so a slow answer never overwrites a newer one.
- Slice: `loanFormSlice` holds `{terms, preview, previewStatus, warnings}` (lazy).
- The client computes **nothing** it shows as money except *cash handed over* (a subtraction for
  instant feedback, replaced by the server's figure on the next preview).

### 8. UI/UX

- Phone first: the terms are one column; the preview is a sticky summary card at the bottom of the
  step ("₹2,400 × 10 months · Total ₹24,000 · Effective yearly rate 41.8%") that expands to the full
  table.
- The effective yearly rate is always shown next to the rate as typed, with the same weight — never
  in a tooltip: "2% a month, flat · effective yearly rate 41.8%". Hindi: "2% महीना, फ्लैट · असल सालाना
  दर 41.8%".
- Plan cards (en): *Flat* — "Interest on the full amount for the whole term."; *Reducing* — "Equal
  instalments; interest only on what is still owed."; *Interest only* — "Pay interest each time; the
  amount lent at the end."; *Fixed daily* — "A fixed amount every collection day."
- The rate warning banner (en): "The effective yearly rate is 66.4%. You asked to be warned above
  36%." Buttons: *Change terms* (default focus), *I understand, continue*. No other wording.

### 9. Validation and business rules

**Validation** (server authoritative; mirrored by `loanTermsSchema` in `useValidationSchemas()`):

| Field | Rule | Message key |
|---|---|---|
| `principal` | > 0; ≤ 9,99,99,999.99; 2 dp | `lending.loan.principal.range` |
| `deductions[].amount` | each > 0; Σ < principal | `lending.loan.deductions.tooLarge` |
| `deductions[].label` | 1–60 characters | |
| `rate` | flat, reducing, interest_only: 0 ≤ rate ≤ 100 (`per_month`) or ≤ 1,200 (`per_year`), ≤ 4 dp; `fixed_daily`: must be absent | `lending.loan.rate.range` |
| `frequency` | allowed per plan (FR-1) | |
| `instalment_count` | daily 1–1,000; weekly 1–520; fortnightly 1–260; monthly 1–360 | `lending.loan.count.range` |
| `per_instalment_amount` | `fixed_daily` only; > 0; 2 dp; count × amount ≥ principal (otherwise the collections never repay the principal) | `lending.loan.fixedPlan.belowPrincipal` |
| `collection_weekdays` | daily: at least one weekday (bitmask Mon=1 … Sun=64) | |
| `disbursed_on` | ≤ today; ≥ today − 10 years (old paper loans) | |
| `first_due_on` | > `disbursed_on`; ≤ `disbursed_on` + 1 year | `lending.loan.firstDue.range` |
| every instalment | ≥ ₹1.00 after rounding | `lending.loan.instalment.tooSmall` |
| `late_fee` | see LEN-09 §9 | |
| `foreclosure_charge` | `flat` > 0, or `percent_of_principal_outstanding` 0.01–10.00 | |

**Business rules.** All arithmetic is `Decimal`; `half_up(…, 0.01)` is applied where a figure becomes
a row, never earlier (R§6.6 rule 1). `split_total(total, n, rule="paise")` (A9) gives n − 1 equal
rounded parts and a last part equal to the remainder.

- BR-1 **Periods per year** `m`: monthly 12, fortnightly 26, weekly 52, daily 365. A `per_month` rate
  is converted to a yearly rate by × 12; the **periodic rate** is `r = yearly / m / 100`.
- BR-2 **Flat.** `total_interest = half_up(principal × r × n)`. Interest per instalment =
  `split_total(total_interest, n)`. Instalment = `round_by_rule((principal + total_interest) / n)`; the
  last instalment = `total_payable − (n − 1) × instalment`. Principal per instalment = instalment − its
  interest; the last row takes the principal remainder. So Σ principal = principal and Σ interest =
  total interest exactly.
- BR-3 **Reducing.** `EMI = round_by_rule(P·r·(1+r)^n / ((1+r)^n − 1))` (for r = 0, `EMI =
  round_by_rule(P / n)`). For k = 1…n: `interest_k = half_up(balance_{k−1} × r)`; for k < n
  `principal_k = EMI − interest_k`; **the last instalment = remaining balance + its interest**. If a
  rounded-up EMI would clear the balance before n, the schedule ends early, `instalment_count` is
  stored as the actual count, and the preview carries `ends_early`.
- BR-4 **Interest only.** Each instalment `interest = half_up(principal × r)`; the last also carries the
  whole principal.
- BR-5 **Fixed daily.** `total_payable = count × per_instalment_amount`; derived `total_interest =
  total_payable − principal` (≥ 0 by validation). Interest per instalment = `split_total(total_interest,
  n)`; principal per instalment = amount − its interest; the last row takes both remainders. A variant
  input, `total_payable` with the per-day amount, derives `count = ⌈total / amount⌉` and makes the
  **last collection the remainder** (smaller, never larger) (R§6.4).
- BR-6 **Rounding rules.** `paise`: half-up to 0.01. `rupee_up`: ceiling to ₹1. `ten_up`: ceiling to ₹10.
  Only the instalment amount is rounded by the rule; components are always paise.
- BR-7 **Dates.** The loan's recurrence is `monthly` on the first due date's day (month-end clamped,
  anchor day kept: 31 Jan → 28/29 Feb → 31 Mar, R§13 EC-6), `weekly` (interval 1), `fortnightly`
  (weekly, interval 2) or `daily` on the collection weekdays. Daily plans do not collect on closed days
  (tenant calendar, A9): the count is kept and the plan runs longer (§C CQ-9). Weekly, fortnightly and
  monthly plans keep their dates on closed days by default (`closed_day_rule = ignore`), because a
  borrower was told a date.
- BR-8 **Invariants, checked before any save** (a failure is a 500 `server_error` and a defect, never a
  user message): Σ instalments = `total_payable`; Σ principal components = principal; Σ interest
  components = `total_interest`; no component negative; every instalment ≥ ₹1.00; dates strictly
  increasing.
- BR-9 **Effective yearly rate** (R§6.7, the idea of the RBI APR). The internal rate of return of the
  cash flows as the borrower sees them: **− cash handed over** on `disbursed_on`, and **+ each
  scheduled instalment** on its `due_on`. The periodic rate `ρ` solves
  `Σ_k A_k / (1 + ρ)^(m · d_k / 365) = cash handed over`, where `d_k` is the number of calendar days
  from `disbursed_on` to `due_on_k` and `m` is BR-1's periods per year; the effective yearly rate is
  `ρ × m × 100`, **nominal**. It is computed on actual calendar dates, so uneven months, Sundays and
  holidays count as time the borrower had the money.
- BR-10 **How it is computed.** `Decimal` bisection (no dependency, no `float`), precision 34 digits,
  on `[0, hi]` where `hi` doubles from 1 until the present value is below the cash handed over, until
  the bracket is narrower than `1e-12` or after 200 steps. Stored `half_up` to 2 dp in
  `effective_annual_rate`; displayed to 1 dp. A zero-rate loan with no deductions is `0.00`. Late fees
  and foreclosure charges are **not** in it (they are contingent); scheduled fees would be.
- BR-11 The effective yearly rate is information. The product never says a rate is legal, illegal,
  allowed, fair or high (G-4).
- BR-12 **Ceiling warning.** When `lending.rate_ceiling` is set and `effective_annual_rate >
  percent_per_year`, the preview carries `warnings[rate_above_warning]` and LEN-04's save is refused
  with 409 `loan_rate_above_warning` unless the request has `confirm_rate_above_warning: true` from an
  owner or admin; the confirmation is audited `lending.loan.rate_warning_confirmed` with both figures.

#### Worked example F1 — flat: ₹20,000 at 2% a month, 10 monthly instalments

Disbursed 5 Jan 2026, first due 5 Feb 2026, monthly on the 5th, `paise` rounding, no deductions.

- `total_interest` = 20,000.00 × 0.02 × 10 = **₹4,000.00**; total payable **₹24,000.00**.
- Interest per instalment = `split_total(4,000.00, 10)` = 400.00 each.
- Instalment = 24,000.00 / 10 = **₹2,400.00**; principal per instalment 2,000.00.

| # | Due on | Amount | Principal | Interest |
|---|---|---|---|---|
| 1 | 05 Feb 2026 | 2,400.00 | 2,000.00 | 400.00 |
| 2–9 | 5th of Mar … Oct 2026 | 2,400.00 each | 2,000.00 each | 400.00 each |
| 10 | 05 Nov 2026 | 2,400.00 | 2,000.00 | 400.00 |
| **Σ** | | **24,000.00** | **20,000.00** | **4,000.00** |

In paise: 10 × 2,40,000 = 24,00,000 paise; principal 20,00,000; interest 4,00,000. **Effective yearly
rate 41.8%** (stored 41.76). "2% a month flat" reads like 24% a year and costs the borrower 41.8% on
the money they actually had, for as long as they had it. (R§6.1 gives 41.5%, treating every month as
equal; BR-9 counts the real days from 5 Jan, and a test pins this figure.)

#### Worked example F2 — flat with a remainder: ₹25,000 at 1.5% a month, 7 monthly instalments

- Interest = 25,000.00 × 0.015 × 7 = ₹2,625.00; total ₹27,625.00; 27,625.00 / 7 = 3,946.428571…
- `paise`: instalments 1–6 = **₹3,946.43**, Σ = 23,678.58; **instalment 7 = ₹3,946.42** (27,625.00 −
  23,678.58). Interest 375.00 each (2,625.00 / 7 is exact). Principal 3,571.43 × 6 = 21,428.58 and the
  last 3,571.42; Σ principal = 25,000.00.
- `rupee_up`: instalments 1–6 = ⌈3,946.43⌉ = **₹3,947.00**, Σ = 23,682.00; **instalment 7 = ₹3,943.00**.
  Principal 3,572.00 × 6 = 21,432.00 and the last 3,568.00; interest 375.00 each; Σ principal =
  25,000.00, Σ interest = 2,625.00.

#### Worked example R1 — reducing: ₹20,000 at 2% a month, 10 monthly instalments (same dates as F1)

`r` = 0.02; (1.02)^10 = 1.2189944…; EMI = half_up(20,000 × 0.02 × 1.2189944 / 0.2189944) = **₹2,226.53**.

| # | Due on | Payment | Interest | Principal | Balance after |
|---|---|---|---|---|---|
| 1 | 05 Feb 2026 | 2,226.53 | 400.00 | 1,826.53 | 18,173.47 |
| 2 | 05 Mar 2026 | 2,226.53 | 363.47 | 1,863.06 | 16,310.41 |
| 3 | 05 Apr 2026 | 2,226.53 | 326.21 | 1,900.32 | 14,410.09 |
| 4 | 05 May 2026 | 2,226.53 | 288.20 | 1,938.33 | 12,471.76 |
| 5 | 05 Jun 2026 | 2,226.53 | 249.44 | 1,977.09 | 10,494.67 |
| 6 | 05 Jul 2026 | 2,226.53 | 209.89 | 2,016.64 | 8,478.03 |
| 7 | 05 Aug 2026 | 2,226.53 | 169.56 | 2,056.97 | 6,421.06 |
| 8 | 05 Sep 2026 | 2,226.53 | 128.42 | 2,098.11 | 4,322.95 |
| 9 | 05 Oct 2026 | 2,226.53 | 86.46 | 2,140.07 | 2,182.88 |
| 10 | 05 Nov 2026 | **2,226.54** | 43.66 | 2,182.88 | 0.00 |
| **Σ** | | **22,265.31** | **2,265.31** | **20,000.00** | |

The last row absorbs a one-paisa remainder (balance 2,182.88 + interest 43.66 = 2,226.54); a test pins
it (R§13 EC-21). **Total interest ₹2,265.31 against ₹4,000.00 flat on the same headline rate.
Effective yearly rate 24.1%** (stored 24.13) — slightly above 24.0% because February is shorter than
the month the rate assumes; that is BR-9 working as defined, not an error.

#### Worked example I1 — interest only: ₹50,000 at 3% a month, 12 months

Each instalment half_up(50,000 × 0.03) = ₹1,500.00; instalment 12 = 1,500.00 + 50,000.00 =
**₹51,500.00**; total payable ₹68,000.00, total interest ₹18,000.00. Effective yearly rate **36.0%**
(stored 36.03).

#### Worked example D1 — fixed daily: ₹10,000 principal, ₹1,000 deducted, ₹100 a day for 100 collection days

Disbursed Thursday 1 Oct 2026; collection days Monday to Saturday; first due Friday 2 Oct 2026; no
closed days listed.

- Cash handed over = 10,000.00 − 1,000.00 = **₹9,000.00**; total payable = 100 × 100.00 =
  **₹10,000.00**; derived interest = 10,000.00 − 10,000.00 = **₹0.00** — the whole cost of credit is the
  ₹1,000.00 deduction.
- The 100th collection day is **Tuesday 26 Jan 2027**, 117 calendar days after disbursal (Sundays
  skipped). If the tenant lists 26 Jan as closed, the 100th due moves to Wednesday 27 Jan 2027.
- Each due: amount 100.00, principal 100.00, interest 0.00.
- **Postings on 1 Oct 2026** (LEN-04): a payment out of ₹9,000.00 (its mode on the payment row) and a
  `charge` of ₹1,000.00 labelled "Processing fee — deducted at disbursal". The borrower's loan balance
  is **₹10,000.00** from day 0, which is what they agreed to repay; the documents say plainly that
  ₹9,000.00 changed hands.
- **Effective yearly rate 66.4%** (ρ per day ≈ 0.1819%, × 365). R§6.4 quotes 78%, which counts each
  *collection day* as a period and so ignores the Sundays; this FRD counts calendar days (BR-9) — a
  choice recorded for review as legal item L8.

#### Worked example D2 — fixed daily with interest in the instalments

₹10,000 principal, no deduction, ₹120 a day for 100 days (same dates): total ₹12,000.00, derived
interest ₹2,000.00 = 20.00 per due (`split_total(2,000.00, 100)` is exact), principal 100.00 per due.
Effective yearly rate **116.5%** (stored 116.54).

#### Worked example D3 — fixed daily with remainders

Principal ₹15,000; deductions ₹500 processing fee and ₹1,000 upfront interest (cash handed over
₹13,500.00); ₹130 a day for 130 collection days from Friday 2 Oct 2026 (Mon–Sat; last due Tuesday
2 Mar 2027).

- Total payable 130 × 130.00 = ₹16,900.00; derived interest 16,900.00 − 15,000.00 = ₹1,900.00.
- Interest per due = `split_total(1,900.00, 130)`: 14.62 × 129 = 1,885.98 and the **last 14.02**.
- Principal per due = 130.00 − 14.62 = 115.38 × 129 = 14,884.02 and the **last 115.98**.
- Σ amounts 16,900.00; Σ principal 15,000.00; Σ interest 1,900.00. Effective yearly rate **111.6%**.
- The ₹1,000 "upfront interest" deduction is a `charge` line, not an `interest` line: it was taken from
  the principal at disbursal, and the loan summary lists it among the deductions.

### 10. Permissions

The preview needs `lending.loan.create` (owner, admin; staff only when granted per member). It is the
same calculation LEN-04 saves.

### 11. Reports

The loan book (LEN-13) shows `effective_annual_rate` per loan; the disbursal register shows it per loan
opened.

### 12. Testing

- T-LEN-03-1 (unit) F1, F2 (both rules), R1, I1, D1, D2, D3 reproduce every figure in §9 exactly,
  including R1's last-row 2,226.54 and D3's last-row 14.02 / 115.98.
- T-LEN-03-2 (property, seeded) **a schedule always sums to the agreed total**: 5,000 generated term
  sets (seeded `random.Random(20260929)`, no new dependency) over all four plans, principals 1.00 to
  9,99,99,999.99, rates 0 to the maxima, counts 1 to the maxima, all three rounding rules: Σ amounts =
  `total_payable`, Σ principal = principal, Σ interest = `total_interest`, no negative component, every
  instalment ≥ 1.00 or the terms are refused, and under `rupee_up`/`ten_up` the last instalment is ≤ a
  regular one.
- T-LEN-03-3 (unit) effective yearly rate: F1 41.76, R1 24.13, I1 36.03, D1 66.40, D2 116.54, D3 111.60;
  a zero-rate, no-deduction loan 0.00; a loan whose cash handed over equals the total payable 0.00.
- T-LEN-03-4 (unit) month-end clamping: first due 31 Jan 2026 → 28 Feb, 31 Mar, 30 Apr; 2028 gives
  29 Feb.
- T-LEN-03-5 (unit) a daily plan over a listed closed day keeps its count and ends one collection day
  later.
- T-LEN-03-6 (API) `rate_above_warning` appears exactly when a ceiling is set and exceeded; never when
  the setting is empty.
- T-LEN-03-7 (static) `calculator.py` uses no `float` and imports nothing outside `common`,
  `platform_app.services.calendar` and `dues` (the import test, 10-architecture §10.1).

### 13. Edge cases

1. EC-1 Rate 0 → schedule is principal only; effective yearly rate 0.0% (R§13 EC-8).
2. EC-2 `reducing` with `rupee_up` so large the balance clears early → fewer instalments; the preview
   shows "Ends after 9 instalments".
3. EC-3 A first due date more than one period after disbursal (disbursed 1 Jan, first due 15 Feb) →
   allowed; BR-9 counts the extra days, so the effective rate is lower than with a 1 Feb start.
4. EC-4 A `per_year` rate on a weekly plan → `r = yearly / 52`.
5. EC-5 Deductions equal to principal − ₹0.01 → allowed (cash handed over ₹0.01); the effective rate is
   shown as computed, displayed "above 9,999%" and stored 9,999.99 when larger.
6. EC-6 A holiday added to the calendar after a loan is saved → saved loans keep their dates (the
   engine materialised them); only new loans see it.

### 14. Future

Open loans with Actual/365 simple interest (R§6.5); rate-based daily plans; step-up plans; a
lawyer-reviewed "interest as % of cash handed over" line (L8).

---

## LEN-04 — Create a loan and record the disbursal

### 1. Product requirements

Saving a loan writes, in **one transaction**: the loan and its deductions, a dues plan and schedule in
**expectation** mode (ADR-048), a ledger `charge` per deduction, the **disbursal as a payment out**
allocated to the `lending_loan` target (ADR-047), and the loan number. The borrower's loan balance is
the principal from day 0.

- FR-1 Only one path creates a loan: `POST /lending/loans` (from Lending → New loan, the party page, or
  the borrower's Lending panel).
- FR-2 The form is a three-step `UbStepper`: **Borrower** (LEN-02) → **Terms** (LEN-03) → **Handed
  over** (how the cash was given: modes and reference, reusing the payments mode editor; route; note;
  agreement reference; guarantor). A review panel before Save repeats the preview.
- FR-3 Saving posts the disbursal on `disbursed_on` with the modes typed (cash, UPI, bank, cheque, card,
  other; split allowed, Σ = cash handed over). The payment's number comes from the payments voucher
  series (`PAYOUT/…`); its `meta` is `{context: "lending_disbursal", loan_id}` so every register labels
  it "Loan given".
- FR-4 Optional at creation: guarantor (party), route (LEN-07) and position (end of route by default),
  agreement reference (the paper register number, ≤ 40), note (≤ 500).
- FR-5 After save: the loan page opens with a success banner and three actions: **Print loan summary**,
  **Share loan summary** (WhatsApp text + PDF), **Done**.
- FR-6 **Terms never change after save** (R§5): principal, deductions, plan, rate, frequency, count,
  dates, rounding, late-fee rule, early-closure rule, foreclosure charge and allocation order are
  frozen (`loan_terms_locked`). Only `note`, `agreement_ref`, `guarantor`, `route` and
  `route_position` are editable. A wrong loan is **cancelled** (LEN-10) if it has no collections;
  otherwise it is closed and a new one opened. Reschedule and top-up are Later-1 (§14).
- FR-7 **Backdated loans** (a paper loan brought in): `disbursed_on` up to 10 years back. Past dues are
  created by the engine with their own dates; the engine refuses until confirmed (409
  `schedule_backdated_unconfirmed` with the preview, 11-contracts §2.1), and the form shows: "7
  instalments are already past. They will show as overdue until you record what was collected." Past
  collections are then recorded with their own dates (LEN-06).
- FR-8 **Cash warning** (R§10, legal item L7): when the cash mode lines of the disbursal total ₹20,000
  or more, the Handed-over step shows a non-blocking warning: "Cash of ₹20,000 or more on a loan may
  break income-tax rules. Check with your accountant." The response carries
  `warnings[cash_at_or_above_20000]`.
- FR-9 Registrations at start-up (`LendingConfig.ready()`):
  - `register_target(LendingLoanTarget)` — `document_type="lending_loan"`, `direction="out"`,
    `bucket="loan"`, `auto=False` (R1, 11-contracts §1.4);
  - `register_posting_source("lending_deduction", module="lending", entry_types={"charge": "debit"},
    buckets={"loan"})`, likewise `lending_waiver` (`adjustment_credit` → credit) and `lending_charge`
    (§C CQ-5) (R3);
  - `register_source_resolver` for `lending_deduction` and `lending_waiver`, so the khata names the loan
    ("LN/26-27/0042 · Processing fee") (R2);
  - `dues.register_subject("lending_loan", module="lending", label=loan numbers,
    on_due_changed=lending.services.hooks.on_due_changed, reminder_template_key="lending.due_today")`
    (R15);
  - `register_number_kind("loan", …)` (R11), `register_party_role` × 2 and `register_archive_guard`
    (R6), `register_module_off_guard` (R4), `register_reminder_source` and `register_reminder_policy`
    (R7, LEN-12), `register_dashboard_section` and five `register_report` (R8, R9, LEN-13),
    `tenant_data.register` for every table (R13).

### 2. User flows

**Primary (owner, phone).** Lending → *New loan* → Borrower: search "Sun" → *Sunita Devi* → Terms:
*Flat*, ₹20,000, 2% a month, monthly, 10, first due 05/02/2026 → preview "₹2,400 × 10 · Total ₹24,000 ·
Effective yearly rate 41.8%" → Continue → Handed over: Cash ₹20,000 (the cash warning shows: ₹20,000 is
at the threshold) → route "Market road", guarantor none → Review → **Save** → the loan page: "Loan
LN/26-27/0042 saved. ₹20,000.00 handed over in cash." → *Share loan summary*.

**Alternate A — deductions.** Terms: fixed daily, ₹10,000, deduction *Processing fee* ₹1,000 → "Cash
handed over ₹9,000.00" live → Handed over: the modes must total ₹9,000.00.

**Alternate B — backdated.** Disbursed 01/04/2026 on 29/09/2026 → Save → 409 → confirmation dialog
listing the past dues and their total → *Confirm* → saved with `confirm_backdated=true`.

**Alternate C — above the warning rate.** Save → 409 `loan_rate_above_warning` → banner → *I understand,
continue* → re-submitted with the confirmation (the body changed, so the client uses a new idempotency
key for the confirmed request).

**Alternate D — network failure.** The draft stays in `loanFormSlice` with *Retry*; the retry reuses the
idempotency key (LED-01 FR-12 pattern), so a slow first request cannot create two loans.

### 3. Features

| MVP | Later |
|---|---|
| Create with the four plans, deductions, guarantor, route, backdating | Top-up (fold the old payoff into a new loan, R§3 W6.3) |
| Disbursal as a payment out; deductions as charges; schedule in expectation mode | Reschedule mid-loan by agreement (R§13 EC-16), loan summary v2 |
| Editable non-terms fields; terms frozen | CSV import of existing loans (imports registry, R12) |
| Cash warning; ceiling confirmation | Disbursal in two tranches |

### 4. Entities and relationships

```
parties_party (borrower) 1 ─── * lending_loan * ─── 0..1 parties_party (guarantor)
lending_loan 1 ─── * lending_loan_deduction            (each posts one ledger charge)
lending_loan 1 ─── 1 dues_plan (per-loan terms)  1 ─── 1 dues_schedule ─── * dues_due ─── * dues_due_component
lending_loan 1 ─── 1 payments_payment (out, the disbursal) via payments_allocation(document_type='lending_loan')
lending_loan * ─── 0..1 lending_route
```

A loan's dues plan is **its own** (one `dues_plan` per loan, `name = <loan number>`), because every
loan's terms differ and the schedule snapshots the plan (11-contracts §2.1). Lending's plans are never
listed as reusable plans.

### 5. Database

**`lending_loan`** (TenantModel)

| Column | Type | Constraint / note |
|---|---|---|
| `number` | varchar(32) | from `allocate_number(kind="loan")`, e.g. `LN/26-27/0042`; `UNIQUE (tenant, number)` |
| `borrower_id` | uuid | FK `parties.Party` RESTRICT, `related_name="+"` |
| `guarantor_id` | uuid null | FK `parties.Party` RESTRICT, `related_name="+"`; `CHECK (guarantor_id IS NULL OR guarantor_id <> borrower_id)` |
| `status` | varchar(12) | `CHECK IN ('active','closed','written_off','cancelled')`, default `active` |
| `plan_type` | varchar(16) | `CHECK IN ('flat','reducing','interest_only','fixed_daily')` |
| `principal` | numeric(14,2) | `CHECK (principal > 0)` |
| `deductions_total` | numeric(14,2) | `CHECK (deductions_total >= 0 AND deductions_total < principal)` |
| `cash_handed_over` | numeric(14,2) | `CHECK (cash_handed_over = principal - deductions_total)` |
| `disbursed_amount` | numeric(14,2) | cache moved only by the `lending_loan` target; `CHECK (disbursed_amount BETWEEN 0 AND cash_handed_over)` |
| `rate` | numeric(9,4) null | `CHECK ((plan_type = 'fixed_daily') = (rate IS NULL))` |
| `rate_unit` | varchar(10) null | `CHECK IN ('per_month','per_year')` |
| `frequency` | varchar(12) | `CHECK IN ('daily','weekly','fortnightly','monthly')` |
| `instalment_count` | integer | `CHECK (instalment_count BETWEEN 1 AND 1000)` |
| `instalment_amount` | numeric(14,2) | the regular instalment (fixed plans: the per-day amount) |
| `collection_weekdays` | smallint | bitmask Mon=1 … Sun=64; `CHECK (frequency <> 'daily' OR collection_weekdays > 0)` |
| `disbursed_on` | date | |
| `first_due_on` | date | `CHECK (first_due_on > disbursed_on)` |
| `maturity_on` | date | the last due's date |
| `total_interest` | numeric(14,2) | `CHECK (total_interest >= 0)` |
| `total_payable` | numeric(14,2) | `CHECK (total_payable >= principal)` |
| `effective_annual_rate` | numeric(7,2) | LEN-03 BR-10; information, never money |
| `rounding_rule` | varchar(8) | `CHECK IN ('paise','rupee_up','ten_up')` |
| `allocation_order` | varchar(12) | snapshot; `CHECK IN ('fees_last','oldest_first','fees_first')` |
| `early_closure_rule` | varchar(18) | `CHECK IN ('interest_to_date','full_contracted','owner_decides')` |
| `late_fee_kind` | varchar(16) | `CHECK IN ('none','flat_once','per_day','simple_interest')`, default `none` |
| `late_fee_value` | numeric(10,4) null | ₹ for `flat_once` / `per_day`, % a year for `simple_interest` |
| `late_fee_grace_days` | smallint | default 0, `CHECK BETWEEN 0 AND 90` |
| `late_fee_cap` | numeric(14,2) null | per instalment; `CHECK (late_fee_kind NOT IN ('per_day','simple_interest') OR late_fee_cap IS NOT NULL)` |
| `foreclosure_kind` | varchar(40) | `CHECK IN ('none','flat','percent_of_principal_outstanding')`, default `none` |
| `foreclosure_value` | numeric(10,4) null | |
| `dues_plan_id` | uuid | FK `dues.Plan` RESTRICT (a vertical may hold an engine FK, 10-architecture §5 rule 4) |
| `dues_schedule_id` | uuid | FK `dues.Schedule` RESTRICT; unique |
| `disbursal_payment_id` | uuid | FK `payments.Payment` RESTRICT; unique |
| `route_id` | uuid null | FK `lending_route` RESTRICT — a route with active loans cannot be archived (LEN-07) |
| `route_position` | integer null | `CHECK (route_id IS NOT NULL OR route_position IS NULL)` |
| `agreement_ref` | varchar(40) | default `''` |
| `note` | varchar(500) | default `''` |
| `closed_on` | date null | |
| `close_reason` | varchar(12) null | `CHECK IN ('completed','early','write_off','cancelled')`; `CHECK ((status = 'active') = (close_reason IS NULL))` |
| `closure_payment_id` | uuid null | FK `payments.Payment` RESTRICT — the collection that closed it |
| `closure_letter_issued_at` | timestamptz null | LEN-10 FR-5 |
| `status_reason` | varchar(255) | write-off and cancel reasons, default `''` |
| `rate_warning_confirmed_by_id` | uuid null | FK user SET NULL; with `rate_warning_confirmed_at timestamptz null` |
| `version` | integer | optimistic concurrency for PATCH (`stale_version`) |

Indexes: `ix_lending_loan_status (tenant, status)`; `ix_lending_loan_borrower (tenant, borrower_id,
status)`; `ix_lending_loan_guarantor (tenant, guarantor_id) WHERE guarantor_id IS NOT NULL`;
`ix_lending_loan_route (tenant, route_id, route_position) WHERE status = 'active'` (the Today list);
`ix_lending_loan_maturity (tenant, maturity_on) WHERE status = 'active'` (closing this week);
`ix_lending_loan_number_trgm` GIN `number gin_trgm_ops` (search; `pg_trgm` is already installed).

**`lending_loan_deduction`** (TenantModel)

| Column | Type | Constraint |
|---|---|---|
| `loan_id` | uuid | FK `lending_loan` RESTRICT |
| `kind` | varchar(16) | `CHECK IN ('processing_fee','upfront_interest','documentation','other')` |
| `label` | varchar(60) | not empty |
| `amount` | numeric(14,2) | `CHECK (amount > 0)` |
| `ledger_entry_id` | uuid | the posted `charge` (source `lending_deduction`, this row's id) |

Index `(tenant, loan_id)`. Rows are never updated or deleted (a cancel reverses the posting).

**Rows written by the save** (existing and engine tables): `dues_plan` (mode `expectation`, posting
`none`, `amount_rule='supplied'`, recurrence columns, `penalty_kind='none'` — lending owns late fees,
LEN-09 — `grace_days=0`, `allocation_order`, `rounding_rule`, `closed_day_rule`), `dues_schedule`
(`subject_type='lending_loan'`, `subject_id`, `party=borrower`, `module='lending'`), `dues_due` and
`dues_due_component` (principal, interest), `ledger_entry` × (1 per deduction + 1 payment), the
`payments_payment` and its `payments_allocation`, `platform_document_sequence` (LN and PAYOUT),
`platform_audit_log`.

**Lock order** (11-contracts preamble): borrower party → the new engine rows → payments → sequences,
the loan number (`LN`) before the voucher number (`PAYOUT`), both after every lock on an existing row.
The loan row is inserted before `record_payment` so the `lending_loan` target can lock it; ids of the
loan and deductions are generated in the service first (UUIDv7) so engine and payment rows can name
them.

### 6. API

**`POST /api/v1/lending/loans`** — codename `lending.loan.create`; `Idempotency-Key` required.

Request: `LoanTerms` (LEN-03 §6) plus

```json
{
  "borrower_id": "0192…", "borrower": null,
  "guarantor_id": null,
  "route_id": "0192…", "route_position": null,
  "agreement_ref": "Reg-2 p.14", "note": "",
  "disbursal": {"mode_breakup": [{"mode": "cash", "amount": "20000.00"}], "reference": ""},
  "confirm_backdated": false,
  "confirm_rate_above_warning": false,
  "expected": {"total_payable": "24000.00", "effective_annual_rate": "41.76"}
}
```

`borrower` (instead of `borrower_id`) creates the party and profile inline (LEN-02 §6 shape).
`expected` is optional: when sent and the server's figures differ (a closed day added between preview
and save), 409 `loan_preview_changed {preview}`.

Response 201:

```json
{
  "data": {"loan": "Loan", "disbursal": {"payment_id": "…", "number": "PAYOUT/26-27/0007"},
           "schedule": ["Due"]},
  "meta": {"party_balance": "20000.00", "party_loan_balance": "20000.00",
           "warnings": [{"code": "cash_at_or_above_20000"}]}
}
```

`Loan` = `{id, number, status, borrower: {id, name, mobile}, guarantor, plan_type, principal,
deductions: [...], cash_handed_over, rate, rate_unit, frequency, instalment_count, instalment_amount,
collection_weekdays, disbursed_on, first_due_on, maturity_on, total_interest, total_payable,
effective_annual_rate, rounding_rule, allocation_order, early_closure_rule, late_fee: {...},
foreclosure: {...}, route: {id, name, position}, agreement_ref, note, figures: {owed_now,
principal_outstanding, due_today, arrears, days_past_due, remaining_scheduled, collected, next_due:
{due_on, amount}}, closed_on, close_reason, version, created_by, created_at}`.

Errors: 400 `validation_error`, `mode_sum_mismatch`; 403 `permission_denied`, `module_disabled`; 404
borrower, guarantor, route; 409 `schedule_backdated_unconfirmed {dues, total}` (passed through from the
engine), `loan_rate_above_warning {effective_annual_rate, warning_rate}`, `loan_preview_changed
{preview}`, `party_archived`, `idempotency_conflict`.

**`PATCH /api/v1/lending/loans/{id}`** — `lending.loan.write`; body any of `{note, agreement_ref,
guarantor_id, route_id, route_position, version}`; any terms field → 409 `loan_terms_locked {fields}`; a
closed, written-off or cancelled loan → 409 `loan_not_active {status}` (except `note`); a stale
`version` → 409 `stale_version`.

### 7. Frontend

- Routes: `/lending/loans/new` (`?borrower=<partyId>` pre-selects), `/lending/loans/[id]` (LEN-05).
- Components: `LoanFormStepper` (`UbStepper`), `BorrowerStep`, `LoanTermsStep` (LEN-03),
  `HandedOverStep` (reuses the `features/payments` `PaymentModeEditor` — a core feature, allowed by the
  boundary rule), `LoanReviewPanel`, `BackdatedDuesDialog`, `RateWarningBanner`, `CashWarningHint`.
  Every drawer and dialog is `dynamic()`.
- Service `api/lendingLoanService.ts`: `previewLoan`, `createLoan`, `patchLoan`, `getLoan`, `listLoans`,
  `getSchedule`. Thunks in `redux/loanThunk.ts`. Slices `loanFormSlice`, `loanDetailSlice` (lazy).
- Invalidations (`src/redux/invalidation/map.ts`): `createLoan` refetches the borrower's `partyDetail`
  (the balance changed — a refetch, not a claimed `patch`, the LED-01 lesson), the loan list, the Today
  list and the dashboard section.
- Analytics: `ub.lending.loan_created {plan_type, frequency, has_deductions, backdated, above_warning,
  count_bucket}` — no names, mobiles or amounts beyond buckets.

### 8. UI/UX

- Phone: each step fits a 360 × 780 screen with the primary button pinned in the footer
  (`env(safe-area-inset-bottom)`); amount fields use `inputMode="decimal"` and the numeric keypad; the
  principal field takes focus on entering the Terms step (the stepper is a page, not an `MLDialog`, so
  `autoFocus` works; a test asserts it).
- The review panel reads like the loan summary: "Sunita Devi borrows ₹20,000. ₹20,000 handed over in
  cash on 05/01/2026. ₹2,400 every month for 10 months from 05/02/2026. Total ₹24,000. Effective yearly
  rate 41.8%."
- Success copy: "Loan LN/26-27/0042 saved." — never "sent", "approved" or "disbursed to the borrower's
  account" (the product moves no money, G-1).

### 9. Validation and business rules

Validation: LEN-03 §9, plus: disbursal modes Σ = `cash_handed_over` (`mode_sum_mismatch`); reference
≤ 64; route active; borrower an active party.

- BR-1 **One transaction.** Everything in FR-1 to FR-3 commits together or not at all.
- BR-2 **Postings** (all `bucket='loan'`, all dated `disbursed_on`): one `charge` per deduction (source
  `lending_deduction`, the deduction id; note "<label> — deducted at disbursal"); the payment out's one
  `payment_out` line (source `payment`). Party `balance` and `loan_balance` both move by + principal.
- BR-3 **No principal line.** The schedule's principal components never post (expectation mode,
  ADR-048); interest components post on their `due_on` through the dues engine's daily run as
  `interest` lines, source `dues_component`.
- BR-4 **The disbursal target.** `LendingLoanTarget.outstanding = cash_handed_over − disbursed_amount`;
  `apply` adds to `disbursed_amount`; `is_open` while outstanding > 0; `unapply` **refuses** with 409
  `loan_disbursal_locked` unless the loan is being cancelled in the same transaction (LEN-10 BR-5), so a
  disbursal cannot be voided from the generic Payments screen and leave a loan with no money behind it.
- BR-5 **Credit limit.** A disbursal never consumes or checks the shop credit limit (ADR-043: PTY-06
  compares against the trade figure).
- BR-6 **Snapshots.** `allocation_order`, `early_closure_rule` and `rounding_rule` default from the
  tenant settings (§A) and are stored on the loan; changing the setting later never changes a saved
  loan (LEN-01 BR-1).
- BR-7 **Numbering.** `allocate_number(kind="loan", on_date=disbursed_on)`; a backdated loan takes the
  number of its financial year's series.
- BR-8 **Audit.** `lending.loan.created` with the full terms, the schedule totals, the effective yearly
  rate, the disbursal payment id and number, and `metadata.backdated`, `metadata.rate_warning`.

### 10. Permissions

| Action | Codename / check | OW | AD | ST | AG | AC |
|---|---|---|---|---|---|---|
| Preview / create a loan | `lending.loan.create` | yes | yes | no (grantable per member, R§18 Q9) | no | no |
| Edit note, agreement ref, guarantor, route | `lending.loan.write` | yes | yes | no | no | no |
| Confirm above the warning rate | role check owner or admin | yes | yes | — | — | — |

### 11. Reports

Feeds the disbursal register and the loan book (LEN-13). The disbursal also appears in the payments
register, the cashbook (cash out) and the day book as "Loan given · LN/26-27/0042", because it is a
payment.

### 12. Testing

- T-LEN-04-1 (API) F1 saved → one loan, 10 dues Σ 24,000.00, 20 components, one payment out 20,000.00
  (`PAYOUT/…`), one ledger line `payment_out` 20,000.00 in bucket `loan`; `party.balance` and
  `party.loan_balance` both 20,000.00.
- T-LEN-04-2 (API) D1 saved → ledger lines 9,000.00 (`payment_out`) + 1,000.00 (`charge`,
  `lending_deduction`); balances 10,000.00.
- T-LEN-04-3 (API) a failure injected after the payment is created (the engine raises) leaves **no**
  row in any lending, dues, payments or ledger table, and no sequence number consumed.
- T-LEN-04-4 (API) idempotent replay returns the same loan; a different body with the same key → 409
  `idempotency_conflict`.
- T-LEN-04-5 (API) PATCH `rate` → 409 `loan_terms_locked {fields: ["rate"]}`; PATCH `note` on a closed
  loan → 200.
- T-LEN-04-6 (API) voiding the disbursal through `POST /payments/{id}/void` → 409
  `loan_disbursal_locked`; the payment stays recorded.
- T-LEN-04-7 (contract) `LendingLoanTarget` passes the shared target contract suite (10-architecture
  §11): lock order, apply/unapply symmetry (in the cancel context), status re-derived, `auto=False`,
  `bucket="loan"`, never chosen by `"auto"` allocation of a supplier payment.
- T-LEN-04-8 (API) backdated save without confirmation → 409 with the preview; with it → 201 and the
  past dues `overdue`.
- T-LEN-04-9 (unit) `/ledger/aging` for a party with only this loan shows nothing: its lines are in the
  `loan` bucket (ADR-043).

### 13. Edge cases

1. EC-1 Double tap on Save → one loan (idempotency key).
2. EC-2 The borrower is archived between form open and Save → 409 `party_archived`.
3. EC-3 Two owners create loans at the same moment → numbers `…0042` and `…0043`, never the same
   (sequence lock).
4. EC-4 A disbursal that was never handed over (recorded by mistake) → cancel (LEN-10), which reverses
   everything (R§13 EC-22).
5. EC-5 A disbursal by cheque that bounces → cancel if no collections; otherwise the owner records the
   facts in the note and closes the loan with a waiver (a rarity; top-up and reschedule are Later).
6. EC-6 `disbursed_on` in a previous financial year → allowed; the voucher and loan numbers are that
   year's.
7. EC-7 The tenant has no route yet → the route field is optional and the loan appears under "No route"
   in the owner's Today list.

### 14. Future

Top-up (new principal > old payoff; the old loan closes with a non-cash "settled by new loan"
collection, R§3 W6.3); reschedule by agreement with a summary v2 (R§13 EC-16); loan import through the
imports registry; tranche disbursals.

---
## LEN-05 — Loan list and loan page

### 1. Product requirements

- FR-1 **Loan list** `/lending/loans`: every loan the member may see, searchable and filterable, with
  totals over the filtered set (the PTY-02 convention) and each filter chip's count computed with the
  same predicate as the list it opens (the `collection.py` AC-2 lesson).
- FR-2 **Loan page** `/lending/loans/[id]`: a header with the number, borrower, status, owed now, next
  due and days past due; the actions the member may take; and four tabs — **Schedule** (every due with
  its status, split and settlements), **Collections** (receipts, with void), **Activity** (visit
  notes, reminders, late fees, waivers, status changes), **Terms** (as saved; frozen).
- FR-3 The party page's Lending panel (LEN-02 FR-7) links to each loan; the loan page links back to the
  party.
- FR-4 Agents see the list and page **scoped** to their routes and **reduced** (LEN-07 BR-4): no terms
  tab, no rate or interest figures, no guarantor, no ID, no other agents' collections.

### 2. User flows

- Owner: Lending → Loans → chip *Overdue 8–30* → sort *Days past due* → tap a loan → Schedule tab
  shows instalments 3 and 4 overdue → *Collect* (LEN-06).
- Accountant: Loans → filter *Disbursed in* Apr–Jun → Export CSV (the loan book, LEN-13).
- Agent: Today → tap a stop's name → the scoped loan page (header, Schedule without the split,
  own Collections, Activity).

### 3. Features

| MVP | Later |
|---|---|
| Search, filters, sort, totals, CSV (via the loan book report) | Saved views; bulk reassign route |
| Loan page with four tabs; party panel | Loan-level promise date separate from visit notes (R§17.3) |

### 4. Entities and relationships

Reads `lending_loan`, `lending_loan_deduction`, `lending_route`, the loan's `dues_*` rows, its
`lending_collection` rows and payments, `lending_visit`, the loan's reminders (`ledger_reminder` with
`module='lending'`), and the loan's ledger lines (LEN-06 §5 `loan_ledger`).

### 5. Database

No new table. The list query joins `lending_loan` to a per-loan aggregate of `dues_due` (open dues:
`due_on`, outstanding) computed in one grouped subquery keyed `(tenant, module='lending', status IN
('due','overdue'))` — the engine's index `(tenant, module, status, due_on)`. Search uses
`ix_lending_loan_number_trgm` and the party name trigram index that already exists for the party list.

### 6. API

**`GET /api/v1/lending/loans`** — `lending.loan.read` (scoped, LEN-07).

Query: `q` (borrower name, mobile last 4+ digits, loan number, agreement ref), `status` (default
`active`), `plan_type`, `frequency`, `route_id` (`none` for no route), `agent_id`, `dpd` (`0`,
`1-7`, `8-30`, `31-90`, `90+`), `due_today=1`, `closing_within_days=7`, `above_warning=1`,
`disbursed_from`, `disbursed_to`, `principal_min`, `principal_max`, `tag` (party tag),
`ordering` (`next_due_on` default, nulls last; `-arrears`, `-days_past_due`, `-owed_now`,
`-disbursed_on`, `number`, `route_position` — only with one `route_id`), `page`, `page_size ≤ 100`.
`StableOrderingFilter` adds `id` as the final key.

Response: `{data: [LoanRow], meta: {page, page_size, count, totals: {count, principal, owed_now,
arrears, due_today}, chips: {dpd: {"1-7": n, …}, due_today: n, closing_within_days: n,
above_warning: n}}}`. `LoanRow` = `{id, number, borrower: {id, name, mobile_masked}, status,
plan_type, frequency, principal, owed_now, due_today, arrears, days_past_due, next_due: {due_on,
amount}, route: {id, name, position}, effective_annual_rate?}` (`effective_annual_rate` and
`principal` are restricted fields, absent for agents).

**`GET /api/v1/lending/loans/{id}`** — `Loan` (LEN-04 §6); restricted fields per LEN-07 BR-4.
**`GET /api/v1/lending/loans/{id}/schedule`** — `{data: [Due]}`, `Due` = `{id, seq, due_on, amount,
components: {principal, interest, fee}, penalties, settled, waived, outstanding, status,
display_status, paid_on, settlements: [{payment_id, number, date, principal, interest, fee}]}`.
**`GET /api/v1/lending/loans/{id}/activity?cursor`** — visits, reminders, late fees, waivers and
status events, newest first, cursor-paginated (50).

Errors: 404 for a cross-tenant or out-of-scope id (never 403, ADR-052).

### 7. Frontend

- Routes: `/lending/loans`, `/lending/loans/[id]` (tabs in the URL as `?tab=schedule|collections|
  activity|terms`, the only list state kept in the URL besides filters, 17.0.3).
- Components: `LoanListPageContent` (`UbDataGrid`, card mode below `md`), `LoanFilterBar`
  (`UbFilterBar`, `UbFilterChip`), `LoanHeader`, `LoanActionsBar` (at most three visible actions; the
  rest behind a ⋯ sheet — the LED-02 width lesson), `LoanScheduleTab`, `LoanCollectionsTab`,
  `LoanActivityTab`, `LoanTermsTab`.
- Hooks: `useLoanListUrl` (the `usePartyListUrl` pattern), `useLoanDetail`.
- Slices: `loanListSlice`, `loanDetailSlice` (lazy).

### 8. UI/UX

- Phone card (list): line 1 borrower name and `UbStatusBadge`; line 2 loan number · route; right side
  `UbAmount` owed now; line 3 "Due today ₹2,400 · 12 days past due" in the warning tone when DPD > 0.
  Text accompanies every colour.
- Loan header (phone): owed now large; "Next due 05/06/2026 · ₹2,400"; a DPD chip; the three visible
  actions for an owner are **Collect**, **Not paid**, **Remind**; ⋯ holds Statement, Loan summary,
  Late fee, Waive, Close early, Write off, Cancel, Edit.
- Schedule rows show `display_status` words (Upcoming, Due, Overdue, Part paid, Paid, Paid in
  advance, Waived, Cancelled), never colour alone.
- The Terms tab shows the effective yearly rate beside the rate as typed (LEN-03 §8).

### 9. Validation and business rules

- BR-1 Figures are the §0.4 definitions, computed server-side; the client never sums dues.
- BR-2 `dpd` buckets: 0 (current), 1–7, 8–30, 31–90, 90+ (R§7).
- BR-3 A closed loan shows its closure line ("Closed 12/11/2026 · completed"); a written-off loan shows
  "Written off" and **no** closure-letter action (R§9.4).
- BR-4 `above_warning=1` compares each loan's stored rate to the **current** ceiling setting.

### 10. Permissions

| Action | Codename | OW | AD | ST | AG | AC |
|---|---|---|---|---|---|---|
| List and open loans | `lending.loan.read` | all | all | all | own routes | all |
| See every route (bypass scope) | `lending.loan.read_all` | yes | yes | yes | no | yes |
| See terms, rates, interest, guarantor | `lending.loan.terms_read` (restricted fields) | yes | yes | yes | no | yes |

### 11. Reports

The list is not a report; the loan book (LEN-13) is its exportable form.

### 12. Testing

- T-LEN-05-1 (API) totals and chip counts equal a direct count over the same filtered rows, for each
  chip (the AC-2 lesson).
- T-LEN-05-2 (API) an agent listing loans receives only their routes' loans and no
  `effective_annual_rate`/`principal` keys; opening another route's loan id → 404 (after asserting
  who is signed in).
- T-LEN-05-3 (perf) `EXPLAIN` of the default list for a 2,000-loan tenant uses
  `ix_lending_loan_status` and the dues index; no sequential scan of `dues_due`.
- T-LEN-05-4 (component) the header's action bar never exceeds 360 px (the `scrollWidth` check in
  the shots sweep, §LEN-14 T-LEN-14-9).

### 13. Edge cases

1. EC-1 A loan with no route → shown to members with `read_all` under "No route"; invisible to agents.
2. EC-2 Sorting by `route_position` without one route filter → refused with 400 (positions are only
   comparable within a route).
3. EC-3 A borrower with three loans → three rows; the party panel sums them as "3 loans · owed now
   ₹41,200".

### 14. Future

Saved views; bulk route reassignment; a map view is **not** planned (no borrower location is stored,
R§15.5).

---

## LEN-06 — Collections: record, allocate, receipt, void

### 1. Product requirements

A collection is a **payment in** (`payments_payment`), allocated to the loan's dues through the
`dues_instalment` target; the dues engine splits each allocation into principal, interest and fee in
`dues_settlement` by the loan's **allocation order** (ADR-047). A receipt exists the moment it is
saved (R§15.3 item 1). A wrong collection is **voided** with a reason, never edited or deleted.

- FR-1 `POST /lending/loans/{id}/collections` records a collection for one loan: amount, date,
  modes (cash default, UPI, bank, cheque, card, other; split allowed), reference, note.
- FR-2 The server asks the engine for the allocation (`dues.plan_allocation(schedule_id, amount,
  order=loan.allocation_order)`), then calls `record_payment` with those explicit allocations
  (`document_type="dues_instalment"`) and `meta = {context: "lending_collection", loan_id}`. The
  payment's ledger line is `payment_in`, bucket `loan`. A payment never spans two loans (R§13 EC-4)
  and never mixes buckets (11-contracts §1.4).
- FR-3 A `lending_collection` row records who collected it, on which route, and for which loan
  (FR-12's projection), in the same transaction.
- FR-4 **Allocation order** (§A, snapshotted on the loan): `fees_last` (default), `oldest_first`,
  `fees_first` — BR-4. The default and its alternatives are listed for the owner in §A and in
  Settings → Lending (10-architecture §16 item 3).
- FR-5 **Part, full and advance.** A shortfall leaves a due part paid; an excess pays **future** dues
  in order and shows them as *paid in advance*. A collection **at or above the payoff** is refused with
  an offer to close early (LEN-10), so a borrower never pays future interest by accident (R§6.8
  rule 5).
- FR-6 **Prefill**: the collection sheet opens with *due today + arrears* (Σ outstanding of dues with
  `due_on ≤ today`, including posted late fees), capped at payoff − ₹0.01.
- FR-7 **Allocation preview**: before saving, the sheet shows in one line what the amount pays
  ("Pays instalment 3 in full and ₹200 of instalment 4") from `GET …/allocation-preview`.
- FR-8 **Receipt** (LEN-11 §9.2 layout): number from the payments receipt series (`RCT/…`), date and
  time, borrower, loan number, amount, modes and reference, **how it was applied** (interest,
  principal, fee), **owed now after this collection**, next due date and amount, and "Collected by
  <first name>". Share as WhatsApp text (server-rendered, like PAY-04) or PDF; print A5 or 80 mm.
- FR-9 **UPI QR**: *Show QR* in the sheet renders the tenant's static UPI QR with the amount
  (`apps/common/qr.py`); the money goes straight to the lender's UPI ID; the agent still records the
  collection by hand. No bank sync is claimed (R§10).
- FR-10 **Void** `POST /lending/collections/{payment_id}/void` with a reason calls `void_payment`;
  the target's `unapply` removes the settlements, the engine re-derives the dues, and lending's
  `on_due_changed` hook reopens a closed loan (LEN-10 BR-8). The receipt prints **VOID** and the
  reason. Agents may void only their own collection, the same business day, within
  `lending.agent_void_minutes` (default 15) of saving (R§18 Q8).
- FR-11 **Cash warning**: when the cash collected on one loan on one day reaches ₹20,000 (this
  collection included), a non-blocking warning (LEN-04 FR-8 wording).
- FR-12 **Collection register** `GET /lending/collections`: every collection in a range with totals by
  mode and by agent; agents see only their own.
- FR-13 Collections are ordinary payments, so they also appear in the Payments register, the cashbook
  and the day book, labelled "Loan collection · LN/…".

### 2. User flows

**Primary — at the doorstep (agent, two taps).** Today → stop card → **Collect** (tap 1) → the sheet
opens with ₹2,400.00 prefilled, *Cash* selected, the line "Pays instalment 5 in full" → **Save** (tap
2) → the sheet turns into the saved state: "₹2,400 collected · Receipt RCT/26-27/0311 · Owed now
₹10,000" with **Share receipt** (WhatsApp) and **Done**.

**Alternate A — part payment.** Change the amount to ₹1,000 → "Pays ₹1,000 of instalment 5 (interest
₹249.44, principal ₹750.56)" → Save.

**Alternate B — more than due.** ₹5,000 → "Pays instalment 5 in full and ₹2,600 of instalments 6–7
in advance" → Save.

**Alternate C — at or above the payoff.** ₹10,700 on a loan whose payoff today is ₹10,599.62 → 409
`collection_over_payoff {payoff: "10599.62"}` → the sheet says "This is more than the ₹10,599.62
needed to close the loan today." Owner/admin see **Close early instead** (LEN-10); agents see "Ask the
owner to close this loan."

**Alternate D — UPI.** Collect → *UPI* → *Show QR* → the borrower pays → Save (reference optional).

**Alternate E — wrong amount (agent, within 15 minutes).** Collections tab → the receipt → **Void** →
reason (≥ 3 characters) → confirm → the dues reopen; the agent records the right amount.

**Alternate F — network failure on the street.** Save fails → the sheet keeps the draft with **Retry**
and an amber "Not saved" line; retry reuses the idempotency key (R§13 EC-19). Offline mode is not
built and is never claimed.

### 3. Features

| MVP | Later |
|---|---|
| Record, allocate by order, part/full/advance, payoff cap | One amount across several loans of one borrower (two receipts today) |
| Receipt A5, 80 mm, WhatsApp text; void with reason; agent void window | Thermal-printer direct print (needs an ADR, R§17.4) |
| UPI QR, cash warning, collection register | Offline collection with a queue (needs an ADR; the largest field gap, R§18 Q2) |
| | Agent cash handover and cash position (R§4.10) |

### 4. Entities and relationships

```
lending_loan 1 ── * lending_collection 1 ── 1 payments_payment (in)
payments_payment 1 ── * payments_allocation (document_type='dues_instalment') * ── 1 dues_due
payments_payment 1 ── * dues_settlement (payment_id, due, component) — the split (engine table)
lending_collection * ── 0..1 lending_route (snapshot)     lending_collection * ── 1 user (collected by)
```

### 5. Database

**`lending_collection`** (TenantModel) — a projection that makes Today, My day, the register and
agent scoping one indexed query each. It holds no money rule: the amount and status are the payment's.

| Column | Type | Constraint |
|---|---|---|
| `payment_id` | uuid | FK `payments.Payment` RESTRICT; **unique** |
| `loan_id` | uuid | FK `lending_loan` RESTRICT |
| `route_id` | uuid null | FK `lending_route` RESTRICT — the loan's route **at the time** (reports stay right after a loan moves) |
| `collected_by_id` | uuid null | FK user SET NULL (= the payment's `created_by`) |
| `business_date` | date | = `payment.payment_date` |
| `kind` | varchar(12) | `CHECK IN ('collection','closure')` (`closure` = LEN-10's final collection) |
| `allocation_order` | varchar(12) | the order used (the loan's snapshot) |

Indexes: `(tenant, business_date, collected_by_id)` (My day, register by agent);
`(tenant, loan_id, business_date)`; `(tenant, route_id, business_date)`.

Void does **not** touch this row; its status is read from `payments_payment.status` (one source of
truth).

**`lending.selectors.loan_ledger(loan)`** — the loan's own ledger lines, the union of: `payment`
lines of the disbursal and of every `lending_collection.payment_id`; `lending_deduction` lines of its
deductions; `lending_waiver` lines of its waivers; `dues_component` and `dues_adjustment` lines whose
source rows belong to its schedule. Used by *owed now*, the loan statement (LEN-11) and the replay
test.

### 6. API

| Method and path | Codename | Request → response | Errors |
|---|---|---|---|
| `GET /lending/loans/{id}/allocation-preview?amount&date` | `lending.collection.create` | → `{allocations: [{due_id, seq, due_on, principal, interest, fee, pays_in_full}], owed_now_after, payoff}` | 409 `collection_over_payoff`, `loan_not_active` |
| `POST /lending/loans/{id}/collections` (`Idempotency-Key`) | `lending.collection.create` | `{amount, payment_date, mode_breakup, reference, note, context: "today"\|"loan"}` → 201 `{collection: Collection, receipt: {number, share_text}, loan: {figures}, meta: {party_balance, warnings}}` | 400 `validation_error`, `mode_sum_mismatch`; 404; 409 `loan_not_active {status}`, `collection_over_payoff {payoff, amount}`, `idempotency_conflict` |
| `GET /lending/collections?date_from&date_to&collected_by&route_id&mode&loan_id&include_void` | `lending.collection.read` (agents: own only) | → `{data: [Collection], meta: {totals: {amount, count, by_mode: {...}, by_agent: [...]}}}` | — |
| `GET /lending/collections/{payment_id}` | `lending.collection.read` | → `Collection` with `split` | 404 |
| `GET /lending/collections/{payment_id}/receipt` | `lending.collection.read` | → the print payload and `share_text` (en or hi by the borrower's document language) | 404 |
| `POST /lending/collections/{payment_id}/void` | `lending.collection.void`, or `lending.collection.void_own` within the window | `{reason}` → 200 `{collection, loan: {status, figures}}` | 400 reason; 404; 409 `payment_already_void`, `collection_void_window_passed {window_minutes}` |
| `GET /lending/loans/{id}/collect-qr.svg?amount` | `lending.collection.create` | the static UPI QR, amount pre-filled | 409 `upi_vpa_missing` (existing code) |

`Collection` = `{payment_id, number, loan: {id, number}, borrower: {id, name}, amount, payment_date,
recorded_at, mode_breakup, reference, note, status, void_reason, collected_by: {id, first_name},
route: {id, name}, kind, split: {principal, interest, fee}, dues: [{seq, principal, interest, fee}]}`.

### 7. Frontend

- Components: `CollectionSheet` (`UbDrawer`, bottom sheet on a phone; `dynamic()`), `AmountField`
  (`UbMoneyInput`, focused on open), `ModeChips` (reuses payments' mode editor in its compact form),
  `AllocationLine`, `CollectedState` (receipt number, owed now, Share), `VoidCollectionDialog`
  (`UbReasonDialog`), `CollectionRegisterPageContent`, `CollectionReceiptPrint` (`print/`), and
  `CollectQrSheet` reused from `features/payments` with a lending QR source.
- Route: `/lending/collections` (register), `/lending/collections/[paymentId]` (receipt page with
  Print and Share).
- Service `api/lendingCollectionService.ts`: `previewAllocation`, `recordCollection`,
  `listCollections`, `getCollection`, `getReceipt`, `voidCollection`, `qrUrl`.
- Slice `collectionSlice` (lazy): `{draftByLoan: Record<loanId, Draft>, posting, lastError,
  lastSaved}`; the draft survives a failed save and is cleared after a 2xx.
- Invalidations: `recordCollection` and `voidCollection` refetch the loan detail, the Today list row
  (a targeted row refetch, not the whole list), My day, the dashboard section and the borrower's
  `partyDetail` if mounted.
- The share opens `wa.me` with the server's text through `UbShareSheet`; the UI says "Opened
  WhatsApp", never "Sent" (DEC-012).

### 8. UI/UX

- **Two taps** from the Today card to a saved collection (Collect, Save) when the prefilled amount and
  cash are right, which is the common case. The Save button is pinned in the sheet footer above the
  keyboard; `Enter` in the amount field saves.
- The amount field opens focused with the numeric keypad **and no error state** (the MLDialog focus
  defect recorded in CLAUDE.md: the sheet sets initial focus to the amount explicitly and the
  resolver does not run until the field changes or Save is pressed). A shots-sweep condition captures
  the sheet on open to prove it.
- The allocation line is one sentence, not a table: "Pays instalment 5 in full" / "किस्त 5 पूरी".
- Colour semantics: a collection is money received — success tone, always with the word
  "Collected" / "वसूली हुई".
- The saved state is readable at arm's length on the street: amount in `ds-h2`, receipt number
  `ds-mono`, "Owed now ₹10,000".

### 9. Validation and business rules

| Field | Rule | Message key |
|---|---|---|
| `amount` | > 0; 2 dp; < payoff (BR-6) | `lending.collection.amount`, `lending.collection.overPayoff` |
| `payment_date` | `disbursed_on ≤ date ≤ today`; agents: today only | `lending.collection.date` |
| `mode_breakup` | 1–3 lines; Σ = amount; reference ≤ 64 when not cash | existing payments rules |
| void `reason` | 3–160 characters (the payments void rule) | `reasonValidation()` |

- BR-1 **One loan, one bucket.** Allocations name only the loan's own dues; the payment's line is
  `loan` bucket. `record_payment` refuses mixed buckets (11-contracts §1.4).
- BR-2 **Which dues are eligible**, in order: every open due with `due_on ≤ payment_date`, oldest
  first; then future dues (`scheduled`, `due_on > payment_date`) in `seq` order (the advance).
- BR-3 **Within-due component order** is interest, then principal, then fees and late fees, for
  `oldest_first`; BR-4 changes where fees go.
- BR-4 **The three orders** (ADR-047):
  - `fees_last` (default): pass 1 pays **interest then principal** of every eligible due with
    `due_on ≤ payment_date`, oldest first; pass 2 pays **fees and late fees** of those dues, oldest
    first; pass 3 pays future dues (interest, then principal).
  - `oldest_first`: every component of the oldest due (interest, principal, fee) before the next due.
  - `fees_first`: pass 1 pays fees and late fees of every eligible due, oldest first; pass 2 pays
    interest then principal, oldest first; pass 3 future dues.
- BR-5 **Rounding.** Each allocated piece is a whole number of paise; the split never rounds (it moves
  exact amounts already in paise); Σ split = the collection exactly.
- BR-6 **Payoff cap.** `amount < payoff(payment_date)` (LEN-10 BR-3). At or above it the collection is
  refused (`collection_over_payoff`) and the close-early path is offered. The cap is re-checked under
  the lock.
- BR-7 **Lock order**: borrower party → the loan (`SELECT … FOR UPDATE`) → `dues_schedule` →
  `dues_due` rows in `(due_on, seq)` order → payments → the receipt sequence (11-contracts §2.1).
- BR-8 **Status after a collection.** Dues statuses are the engine's (derived). When the last open
  due is settled and owed now is 0, the loan closes (LEN-10 BR-1) in the same transaction.
- BR-9 **Invariant (checked by the replay test, §12).** For an active loan:
  `owed_now(loan) = principal_outstanding + Σ posted interest and fee components outstanding + Σ
  posted late fees outstanding − Σ settlements on components not yet posted`, and `owed_now(loan)` =
  Σ `loan_ledger(loan)`. For a closed, written-off or cancelled loan, Σ `loan_ledger(loan)` = 0. And
  `party.loan_balance` = Σ over the party's loans of `loan_ledger`.
- BR-10 **Agent void window**: `collected_by = me` and `business_date = today` and `now −
  recorded_at ≤ lending.agent_void_minutes`. Owners and admins void any collection with a reason.
- BR-11 **Audit**: `lending.collection.recorded {payment_id, number, loan_id, amount, split,
  allocation_order, route_id}`; `lending.collection.voided {payment_id, reason, reopened_loan}`. The
  payments app writes its own `payment.*` rows too.

#### Worked example C1 — part payment, one due (reducing loan R1, `fees_last`)

Instalment 5 of R1 (due 05 Jun 2026: interest 249.44, principal 1,977.09, total 2,226.53) is due
today and nothing else is open. The borrower pays **₹1,000.00** (1,00,000 paise).

| Pass | Component | Paid | Left on instalment 5 |
|---|---|---|---|
| 1 | interest | 249.44 (24,944 p) | 0.00 |
| 1 | principal | 750.56 (75,056 p) | 1,226.53 |
| | **Σ** | **1,000.00 (1,00,000 p)** | **1,226.53** |

Instalment 5 is *Part paid*; principal outstanding falls from 12,471.76 to 11,721.20.

#### Worked example C2 — one part payment under each allocation order (flat loan F1)

State on **12 May 2026**. Instalments 1 and 2 are paid. Instalment 3 (due 05 Apr) and instalment 4
(due 05 May) are unpaid; each is interest 400.00 + principal 2,000.00, and each carries a **declared**
late fee of ₹100.00 (the loan's rule: `flat_once` ₹100 after 3 grace days; added by the owner on
09 Apr and 09 May, LEN-09). Owed now = principal 16,000.00 + posted interest 800.00 + late fees
200.00 = **₹17,000.00**. The borrower pays **₹2,600.00** (2,60,000 paise).

| Order | Inst. 3 interest | Inst. 3 principal | Inst. 3 fee | Inst. 4 interest | Inst. 4 principal | Inst. 4 fee | Σ |
|---|---|---|---|---|---|---|---|
| `fees_last` | 400.00 | 2,000.00 | 0.00 | 200.00 | 0.00 | 0.00 | 2,600.00 |
| `oldest_first` | 400.00 | 2,000.00 | 100.00 | 100.00 | 0.00 | 0.00 | 2,600.00 |
| `fees_first` | 400.00 | 2,000.00 | 100.00 | 0.00 | 0.00 | 100.00 | 2,600.00 |

What is left afterwards (owed now ₹14,400.00 in every case — the order changes *what* is paid, never
*how much*):

| Order | Left on inst. 3 | Left on inst. 4 | Fees left | DPD after |
|---|---|---|---|---|
| `fees_last` | fee 100.00 | interest 200.00, principal 2,000.00, fee 100.00 | 200.00 | **7** (from inst. 4; inst. 3's fee alone does not count, §0.4) |
| `oldest_first` | nothing (Paid) | interest 300.00, principal 2,000.00, fee 100.00 | 100.00 | 7 |
| `fees_first` | nothing (Paid) | interest 400.00, principal 2,000.00 | 0.00 | 7 |

#### Worked example C3 — why the default is fees last

Same state, but the borrower pays exactly one instalment, **₹2,400.00**.

| Order | Pays | Left | DPD after |
|---|---|---|---|
| `fees_last` | inst. 3 interest 400.00 + principal 2,000.00 | inst. 3 fee 100.00; inst. 4 in full + fee | **7** |
| `oldest_first` | inst. 3 interest 400.00 + principal 2,000.00 (nothing left for its fee) | inst. 3 fee 100.00; inst. 4 in full + fee | 7 |
| `fees_first` | fees 100.00 + 100.00, inst. 3 interest 400.00 + principal 1,800.00 | inst. 3 principal 200.00; inst. 4 interest and principal | **37** (from inst. 3) |

Under `fees_first` a borrower who hands over a full instalment stays 37 days in arrears for want of
₹200 — the "small penalty pushes a borrower into permanent arrears" effect R§6.8 rule 3 describes.

#### Worked example C4 — advance (F1, `fees_last`)

On 05 Feb 2026 (instalment 1 due today, nothing overdue) the borrower pays **₹3,000.00**: instalment 1
interest 400.00 + principal 2,000.00; then **future** instalment 2 interest 400.00 + principal 200.00
(*Paid in advance*, ₹1,800.00 left on it).

| Date | Ledger lines of the loan (bucket `loan`) | Σ = owed now | BR-9: principal outstanding + posted unpaid − prepaid not yet posted |
|---|---|---|---|
| 05 Jan | + 20,000.00 disbursal | 20,000.00 | 20,000.00 + 0 − 0 |
| 05 Feb | + 400.00 inst. 1 interest posted; − 3,000.00 collection | 17,400.00 | 17,800.00 + 0 − 400.00 |
| 05 Mar | + 400.00 inst. 2 interest posted (already settled) | 17,800.00 | 17,800.00 + 0 − 0 |

The advance paid instalment 2's interest before it was posted, so on 05 Feb owed now is below the
principal outstanding; when the engine posts that interest on 05 Mar, owed now rises to the
principal outstanding and instalment 2 shows ₹1,800.00 left. The replay test checks exactly this
sequence, in paise: 20,00,000 → 17,40,000 → 17,80,000.

### 10. Permissions

| Action | Codename | OW | AD | ST | AG | AC |
|---|---|---|---|---|---|---|
| Record a collection | `lending.collection.create` | yes | yes | yes | own routes, today only | no |
| Read collections / register | `lending.collection.read` | all | all | all | own only | all |
| Void any collection | `lending.collection.void` | yes | yes | no | no | no |
| Void own, same day, within the window | `lending.collection.void_own` | — | — | no | yes | no |
| Backdate a collection | role check owner, admin, staff (agents today only) | yes | yes | yes | no | — |

### 11. Reports

Feeds the collection register and the collection sheet (LEN-13), the dashboard's *Collected today*
and *Shortfall*, and the agent's *My day* (LEN-08).

### 12. Testing

- T-LEN-06-1 (unit) C1, C2 (all three orders), C3 and C4 produce exactly the tables above.
- T-LEN-06-2 (property, seeded) **a replay of collections equals the ledger**: 500 generated loans
  over the four plans, each with a random sequence (seeded) of collections (part, full, advance),
  late fees, waivers and voids on random dates, across all three orders; after every step:
  Σ `loan_ledger(loan)` = BR-9's dues-derived figure; `party.loan_balance` = Σ of the party's loans;
  `manage.py recalc_balances` reports zero drift; Σ `dues_settlement` of a payment = its allocations =
  its amount (voided payments contribute nothing).
- T-LEN-06-3 (API) collection at the payoff → 409 `collection_over_payoff`; at payoff − 0.01 → 201.
- T-LEN-06-4 (API) two concurrent collections on one loan serialise (the loan lock); the second's
  allocation starts where the first ended; no due is over-settled.
- T-LEN-06-5 (API) agent void at minute 14 → 200; at minute 16 → 409
  `collection_void_window_passed`; another agent's collection → 404.
- T-LEN-06-6 (API) the void of the collection that closed a loan → loan `active`, audit
  `lending.loan.reopened`.
- T-LEN-06-7 (unit) a collection's payment carries one `payment_in` line in bucket `loan`, and
  `/ledger/aging` is unchanged by it.
- T-LEN-06-8 (component) the sheet opens with the amount focused, keypad `inputMode="decimal"`, and
  no field in the error state.
- T-LEN-06-9 (copy) the receipt share text contains the shop's name and no product name or domain
  (extends `customerDocumentsCarryNoProductName.test.tsx`).

### 13. Edge cases

1. EC-1 Double tap on Save → one payment (idempotency key); the second response replays the first.
2. EC-2 Collection dated before `disbursed_on` → 400 (R§13 EC-3).
3. EC-3 A cheque collection that bounces → void with reason "Cheque returned"; the dues return to
   overdue; there is no bounce fee in the MVP, because the terms cannot declare one yet (LEN-09 §14) (R§13 EC-20).
4. EC-4 Recorded against the wrong borrower → the owner voids and re-records; both stay visible
   (R§13 EC-10).
5. EC-5 A collection at 23:50 → `business_date` is the tenant's date (R§13 EC-23).
6. EC-6 A collection voided from the generic Payments screen (owner) → the same unapply path runs;
   the loan reopens if needed; the lending audit row is written by the hook.
7. EC-7 A late fee added after a collection was allocated → it is a new component; the next
   collection pays it per the order.
8. EC-8 The dues engine's daily run posts an instalment's interest while a collection is being
   recorded → both take the schedule lock; whichever is second sees the other's result.

### 14. Future

Split one amount across several loans (with two receipts); offline queue (ADR); thermal printing
(ADR); agent handover with expected versus received cash (R§4.10).

---

## LEN-07 — Collection routes, agents and scoping

### 1. Product requirements

A **collection route** is an ordered list of loans walked or ridden by one or more agents. It drives
the Today list's order and **what an agent may see**.

- FR-1 Routes: name (≤ 40), optional collection weekdays (information for the collection sheet),
  agents (one or more users), and an ordered set of active loans. A loan is on at most one route.
- FR-2 Reorder stops by drag on a desktop and by *Move up / Move down / Move to position* on a phone
  (no drag on touch; long lists need a number).
- FR-3 **Module role** `lending_agent` (ADR-052, 11-contracts §3), shown as "Collection agent" on the
  Team screen only while lending is enabled. The owner creates the agent's account the existing way
  (email and a temporary password shown once, sent by hand — DEC-010, DEC-012).
- FR-4 **Scope**: every lending viewset implements `scope_filter()` (`ScopedViewSetMixin`); an agent
  without `lending.loan.read_all` sees only loans on routes they are assigned to; an out-of-scope id
  is **404**. The agent's role holds **no** `parties.*`, `ledger.*`, `payments.*` or `reports.*`
  codename, so no core endpoint shows them other borrowers (ADR-052).
- FR-5 **Reduced view** for agents (restricted fields): borrower name, mobile, collection address, due
  today, arrears, DPD, next due, last visit note, their own collections. Not: rates, effective rate,
  interest, deductions, principal, guarantor, ID, notes, other agents' collections, business totals.
- FR-6 An agent's landing page is **Today**; their menu has Today, My day and Loans (scoped).
- FR-7 Archiving a route is refused while it has active loans (409 `route_has_loans {count}`).

### 2. User flows

- **Set up (owner).** Lending → Routes → *New route* "Market road" → agents: Ramesh → *Add loans*
  (multi-select from loans with no route, filtered by tag or search) → order them → Save.
- **Hand a route to a new agent.** Team → *Add member* → role *Collection agent* → the temporary
  password is shown once → Routes → Market road → agents: add Suresh.
- **Agent signs in.** Lands on Today, sees only Market road's stops.
- **Move a loan.** Loan page → Edit → Route "Station side", position 12 → Save; it disappears from
  Ramesh's list at once.

### 3. Features

| MVP | Later |
|---|---|
| Routes, ordered stops, agents, module role, scoped endpoints, reduced view | Per-loan agent override; route day plans |
| | Custom roles (PLT-12) absorbing module roles as presets |

### 4. Entities and relationships

```
lending_route 1 ── * lending_route_agent * ── 1 platform user (membership in this tenant)
lending_route 1 ── * lending_loan (route_id, route_position)
```

### 5. Database

**`lending_route`** (TenantModel, soft-archived)

| Column | Type | Constraint |
|---|---|---|
| `name` | varchar(40) | unique `(tenant, lower(name)) WHERE archived_at IS NULL` |
| `collection_weekdays` | smallint | bitmask, default 63 (Mon–Sat) |
| `note` | varchar(255) | default `''` |
| `archived_at` | timestamptz null | |

**`lending_route_agent`** (TenantModel)

| Column | Type | Constraint |
|---|---|---|
| `route_id` | uuid | FK `lending_route` RESTRICT |
| `user_id` | uuid | FK user RESTRICT; the user must hold an active membership in the tenant |

`UNIQUE (route_id, user_id)`; index `(tenant, user_id)` — the scope filter's lookup. (11-contracts §3
writes `lending_route.agent_user_ids`; a join table is used instead, see §C CQ-7.)

Stops are `lending_loan.route_id` + `route_position` (LEN-04 §5), indexed `ix_lending_loan_route`.
Positions are integers renumbered 10, 20, 30 … on every reorder, in one transaction under a lock on
the route row.

### 6. API

| Method and path | Codename | Body → result | Errors |
|---|---|---|---|
| `GET /lending/routes` | `lending.route.read` (agents: their routes) | → `[{id, name, agents: [{id, first_name}], active_loans, collection_weekdays}]` | — |
| `POST /lending/routes` | `lending.route.manage` | `{name, collection_weekdays, note}` → 201 | 400 (name taken: `details.name`) |
| `PATCH /lending/routes/{id}` | `lending.route.manage` | `{name?, collection_weekdays?, note?}` | 400; 404 |
| `PUT /lending/routes/{id}/agents` | `lending.route.manage` | `{user_ids: [...]}` → the route | 400 `validation_error {user_ids: "Not a member of this business."}` |
| `PUT /lending/routes/{id}/stops` | `lending.route.manage` | `{loan_ids: [ordered]}` (the full order) → the route with stops | 400 (a loan not active or on another route: `details.loan_ids`) |
| `POST /lending/routes/{id}/archive` | `lending.route.manage` | → 200 | 409 `route_has_loans {count}` |

Scoping (`apps/lending/views/base.py`): `LendingScopedViewSet(ScopedViewSetMixin, TenantViewSet)`
with `scope_all_permission = "lending.loan.read_all"` and `scope_filter()` returning
`Q(route__agents__user_id=request.user.id, route__archived_at__isnull=True)` for loans, and the
matching path (`loan__route__agents__user_id`) for collections, visits and dues projections. A viewset
that forgets `scope_filter()` raises `NotImplementedError` in tests (fail closed).

### 7. Frontend

- Routes: `/lending/routes`, `/lending/routes/[id]`.
- Components: `RouteListPageContent`, `RouteEditor` (name, weekdays, agents via `UbCombobox` over
  members), `RouteStopsEditor` (desktop drag; phone *Move to position* sheet), `AddLoansToRouteDialog`.
- Service `api/lendingRouteService.ts`; slice `routeSlice` (lazy).
- Navigation rows in `sidebarConfig.ts` (module `lending`): Today (`lending.today.read`), Loans
  (`lending.loan.read`), Routes (`lending.route.manage`), Collections (`lending.collection.read`), My
  day (`lending.myday.read`); `ready` only once each page exists (routes.test.ts).

### 8. UI/UX

- Phone: a route's stops are a numbered list (position, borrower, loan number); *Move to position*
  opens a sheet with a number input; the list never scrolls sideways.
- The Team screen shows "Collection agent — sees only the loans on their routes" as the role's
  one-line description.

### 9. Validation and business rules

- BR-1 A loan belongs to at most one route; `PUT …/stops` with a loan on another route is refused
  (move it first), so a stop is never silently stolen from another agent.
- BR-2 Only `active` loans are stops; closing a loan leaves its `route_id` for history but removes it
  from Today (Today reads active loans only).
- BR-3 Removing an agent from a route removes their access immediately (the next request); their past
  collections stay theirs in the register.
- BR-4 **Restricted fields** (serializer `RestrictedFieldsMixin`): `principal`, `rate`, `rate_unit`,
  `effective_annual_rate`, `total_interest`, `deductions`, `guarantor`, `late_fee`, `foreclosure`,
  `note`, `agreement_ref` need `lending.loan.terms_read`; ID fields need `lending.borrower.id_read`.
  An absent field is absent, not `null`.
- BR-5 **Audit**: `lending.route.created|updated|archived`, `lending.route.agents_changed {added,
  removed}`, `lending.route.stops_reordered {count}`.

### 10. Permissions

`lending_agent` module role codenames: `lending.today.read`, `lending.myday.read`,
`lending.loan.read`, `lending.borrower.read`, `lending.route.read`, `lending.collection.create`,
`lending.collection.read`, `lending.collection.void_own`, `lending.visit.write`,
`lending.reminder.send`. Nothing else.

| Action | Codename | OW | AD | ST | AG | AC |
|---|---|---|---|---|---|---|
| Manage routes, stops, agents | `lending.route.manage` | yes | yes | no | no | no |
| Read routes | `lending.route.read` | all | all | all | own | all |

Canon role additions (a CR with the module role, §C CQ-12): `staff` gains `lending.today.read`,
`lending.loan.read`, `lending.loan.read_all`, `lending.loan.terms_read`, `lending.borrower.read`,
`lending.borrower.write`, `lending.route.read`, `lending.collection.create`,
`lending.collection.read`, `lending.visit.write`, `lending.reminder.send`, `lending.myday.read`;
`accountant` gains every `lending.*.read` and `lending.report.export` by the existing `.read` rule.

### 11. Reports

The collection sheet is per route; the collection register and the dashboard's agent strip group by
agent and route (LEN-13).

### 12. Testing

- T-LEN-07-1 (API, scoping) signed in as agent A (assert `GET /auth/me` names A first): list, detail,
  schedule, collections, visits and receipt of a loan on route B → 404 each; on route A → 200.
- T-LEN-07-2 (API) agent A calls `GET /parties`, `/ledger-entries`, `/payments`, `/reports/dashboard`
  → 403 `permission_denied` each (the role holds no core codename).
- T-LEN-07-3 (architecture) every viewset in `apps/lending/views` is a `ScopedViewSetMixin` or is
  listed as unscoped with a reason (routes admin, settings); a new viewset without `scope_filter()`
  fails.
- T-LEN-07-4 (API) removing A from route A → A's next request for that loan → 404.
- T-LEN-07-5 (API) `PUT …/stops` with a loan already on route B → 400; archive a route with an active
  loan → 409 `route_has_loans`.
- T-LEN-07-6 (API) an agent's loan JSON has none of BR-4's keys.

### 13. Edge cases

1. EC-1 The owner is also on a route → they hold `read_all`; the route only orders their Today list.
2. EC-2 Two agents share a route → both see it; the register shows who collected each.
3. EC-3 The lending module is switched off → the agent role cannot be assigned (it is not offered);
   existing agents' requests get 403 `module_disabled` (the module gate runs before permissions).
4. EC-4 A phone shared between two agents → each signs in with their own account; the session is the
   scope (R§2 P2).

### 14. Future

Per-loan agent override; custom roles; route performance history.

---
## LEN-08 — Today list, arrears and "not paid" visit notes

### 1. Product requirements

The screen an agent opens before 8 am (R§1 UC-2). It lists, **in route order**, every stop that has
something to collect today, with one-tap **Collect** and **Not paid**.

- FR-1 **Today** `/lending/today` lists active loans on the member's routes (all routes and "No route"
  for members with `read_all`) that have **any** of: a due with `due_on = today` not fully settled;
  arrears > 0; a visit note whose promise date is today.
- FR-2 Order: route (by name, or the member's single route), then `route_position`, then loan number.
  A stop that is **done for today** — collected in full, or a *Not paid* note recorded today — moves
  to a "Done" group at the bottom, keeping its order, so the next stop is always at the top.
- FR-3 Each stop shows: position, borrower name, loan number, collection address (first line),
  **to collect today** (= due today + arrears), arrears and DPD when > 0, last visit note (outcome and
  promise date), and today's collections on it.
- FR-4 Filters: route, *Unpaid only* (hides the Done group); sort: route order (default) or amount
  to collect. Search by name or loan number within today's stops.
- FR-5 **Not paid** records a **visit note** (not money): outcome from a fixed, neutral list — *Not at
  home*, *Promised a date*, *Could not pay today*, *Other* — an optional promise date (today to
  today + 60 days) and an optional note (≤ 255). The author may edit it within
  `lending.visit_edit_minutes` (default 15); after that it is immutable (R§5).
- FR-6 **My day** `/lending/my-day`: collected today (count and amount, by mode), due on my routes
  versus collected against it, stops visited (collected or noted) out of stops due, and the list of
  **stops not visited**. Owners may pick any agent and date. It shows no business totals to an agent.
- FR-7 **Arrears** `/lending/arrears`: every active loan with arrears, with DPD, bucket (1–7, 8–30,
  31–90, 90+), oldest unpaid due, last collection (date, amount), last visit outcome and promise
  date; filter by route, agent and bucket. This page is the arrears report's screen (LEN-13).
- FR-8 DPD follows §0.4: the oldest due with unpaid principal or interest; a fee-only remainder does
  not set DPD (see §C CQ-6).

### 2. User flows

- **Agent's morning.** Sign in → Today (Market road, 43 stops, "₹38,400 to collect") → stop 1
  *Collect* → Save → stop 1 moves to Done; stop 2 is at the top → … → stop 7 not at home → *Not paid*
  → *Not at home* → Save (two taps) → stop 7 moves to Done with "Not at home".
- **Promise.** *Not paid* → *Promised a date* → date chips *Tomorrow*, *In 2 days*, *Pick* → Save; on
  that date the stop appears in Today even if nothing new falls due.
- **Evening.** My day → "Collected ₹31,200 (cash ₹27,000, UPI ₹4,200) · 38 of 43 stops visited" →
  "Not visited: 5" list → the agent hands the cash over (recorded on paper in the MVP; handover is
  Later).
- **Owner's follow-up.** Arrears → bucket *31–90* → a loan → Remind (LEN-12) or call.

### 3. Features

| MVP | Later |
|---|---|
| Today in route order, Done group, filters | Offline Today with a queued collection (ADR, R§18 Q2) |
| Not-paid visit notes with neutral outcomes and promise date | Loan-level promise date feeding reminders (R§17.3) |
| My day, Arrears | Agent performance report (R§8 Later-1); handover (R§4.10) |

### 4. Entities and relationships

```
lending_loan 1 ── * lending_visit * ── 1 user (visited by)     lending_visit * ── 0..1 lending_route (snapshot)
```

### 5. Database

**`lending_visit`** (TenantModel)

| Column | Type | Constraint |
|---|---|---|
| `loan_id` | uuid | FK `lending_loan` RESTRICT |
| `visited_by_id` | uuid null | FK user SET NULL |
| `route_id` | uuid null | FK `lending_route` RESTRICT (snapshot) |
| `visited_at` | timestamptz | default now |
| `business_date` | date | tenant-local date of `visited_at` |
| `outcome` | varchar(16) | `CHECK IN ('not_home','promised','could_not_pay','other')` |
| `promise_on` | date null | `CHECK (outcome <> 'promised' OR promise_on IS NOT NULL)`; `CHECK (promise_on IS NULL OR promise_on >= business_date)` |
| `note` | varchar(255) | default `''` |
| `edited_at` | timestamptz null | |

Indexes: `(tenant, loan_id, business_date DESC)`; `(tenant, business_date, visited_by_id)`;
`(tenant, promise_on) WHERE promise_on IS NOT NULL`.

**The Today query** (one statement, `lending.selectors.today`): active loans in scope
(`ix_lending_loan_route`) joined to an aggregate of their `dues_due` rows with `status IN
('due','overdue')` and `due_on ≤ today` (the engine's `(tenant, module, status, due_on)` index),
left-joined to today's `lending_collection` sums and the latest `lending_visit`, plus loans with a
visit `promise_on = today`. An `EXPLAIN` test pins the plan (10-architecture §11).

### 6. API

| Method and path | Codename | Result | Errors |
|---|---|---|---|
| `GET /lending/today?route_id&unpaid_only&q&ordering` | `lending.today.read` | `{data: {routes: [{id, name, stops: [Stop], done: [Stop]}], no_route?: {...}}, meta: {date, totals: {stops, to_collect, collected_today, left}}}` | — |
| `GET /lending/my-day?date&agent_id` | `lending.myday.read` (`agent_id` needs `read_all`) | `{collected: {count, amount, by_mode}, due_on_routes, collected_against_due, stops_due, stops_visited, not_visited: [Stop]}` | 404 agent |
| `GET /lending/arrears?route_id&agent_id&bucket&page` | `lending.report.read` | `{data: [ArrearsRow], meta: {totals: {loans, amount, by_bucket}}}` | — |
| `POST /lending/loans/{id}/visits` (`Idempotency-Key`) | `lending.visit.write` | `{outcome, promise_on, note}` → 201 `Visit` | 400; 404; 409 `loan_not_active` |
| `PATCH /lending/visits/{id}` | `lending.visit.write` (author, within the window) | `{outcome?, promise_on?, note?}` | 409 `visit_edit_window_passed {window_minutes}`; 404 |

`Stop` = `{loan_id, loan_number, position, borrower: {id, name, mobile}, collection_address,
to_collect, due_today, arrears, days_past_due, collected_today, state: "to_collect" | "part_collected"
| "collected" | "not_paid" | "promised_today", last_visit: {outcome, promise_on, at} | null}`.

### 7. Frontend

- Routes: `/lending/today` (the agent's landing page; also `/lending` redirects here for agents and to
  the loans list for others), `/lending/my-day`, `/lending/arrears`.
- Components: `TodayPageContent`, `TodaySummaryBar`, `TodayStopCard`, `NotPaidSheet` (outcome chips,
  date chips, note), `MyDayPageContent`, `ArrearsPageContent` (`UbDataGrid`).
- Service `api/lendingTodayService.ts` (`getToday`, `getMyDay`, `getArrears`, `recordVisit`,
  `editVisit`). Slices `todaySlice`, `myDaySlice`, `arrearsSlice` (lazy). After a collection or a
  visit, only that stop is refetched and moved (`todaySlice.stopUpdated`), so a 60-stop list never
  reloads on the street.

### 8. UI/UX

- **Phone first (360 px).** A stop card: line 1 position badge, borrower name (truncates with
  ellipsis, full name as the accessible name); line 2 loan number · first address line; right column
  "To collect" `UbAmount` large; line 3 "Arrears ₹2,400 · 12 days" in the warning tone, or "Promised
  today"; footer: **Collect** (primary, full-width half) and **Not paid** (secondary). ⋯ holds Remind,
  Call, Open loan.
- Tap targets ≥ 44 px; the two buttons never wrap to three lines at 360 px (the shots sweep measures
  it).
- **The collection sheet in two taps** is LEN-06 §8; **Not paid in two taps**: *Not paid* → *Not at
  home* (chip saves immediately when no date or note is needed; *Promised a date* opens the date chips).
- The Done group is collapsed by default with its count ("Done · 12").
- Hindi: *Collect* वसूली दर्ज करें, *Not paid* नहीं मिला, *Not at home* घर पर नहीं थे, *Promised a date*
  तारीख का वादा किया, *Could not pay today* आज नहीं दे पाए, *Other* अन्य, *Done* हो गया, *To collect* लेना है.
- The visit outcomes are neutral by design; there is no "refused", "rude" or "absconding" (R§15.4).

### 9. Validation and business rules

- BR-1 Today is the **tenant's** date (`tenant_today`), never the device's.
- BR-2 A stop is `collected` when `collected_today ≥ to_collect` at the start of the day; `part_collected`
  when 0 < collected < to_collect; `not_paid` when a visit note exists today; `promised_today` when a
  visit's `promise_on = today` and nothing has been collected today.
- BR-3 A visit note never touches money, dues or the party's `collection_date` (which drives the shop
  reminders of LED-07; a loan promise must not trigger a trade-balance SMS).
- BR-4 `promise_on` ∈ [today, today + 60].
- BR-5 Audit `lending.visit.created`, `lending.visit.edited {before, after}`.

### 10. Permissions

| Action | Codename | OW | AD | ST | AG | AC |
|---|---|---|---|---|---|---|
| Today | `lending.today.read` | all | all | all | own routes | all (read only) |
| My day (own) | `lending.myday.read` | yes | yes | yes | yes | yes |
| My day of any agent | `lending.loan.read_all` | yes | yes | yes | no | yes |
| Record / edit a visit note | `lending.visit.write` | yes | yes | yes | own routes; edit own within window | no |
| Arrears | `lending.report.read` | yes | yes | no | no | yes |

### 11. Reports

Arrears is the arrears report (LEN-13); the collection sheet prints Today for one route and date on
paper; My day feeds the dashboard's agent strip.

### 12. Testing

- T-LEN-08-1 (API) a loan with a due today, a loan with only arrears, a loan with only a promise
  today, and a loan with a future due only → the first three are stops; the fourth is not.
- T-LEN-08-2 (API) order: positions 10, 20, 30 on route A; a collection on stop 10 moves it to Done;
  the order of the rest is unchanged.
- T-LEN-08-3 (perf) `EXPLAIN` of Today for an 80-stop route in a tenant with 2,000 loans × 100 dues
  uses `ix_lending_loan_route` and the dues index; p95 < 300 ms on the reference box.
- T-LEN-08-4 (API) visit edit at minute 14 → 200; minute 16 → 409 `visit_edit_window_passed`.
- T-LEN-08-5 (unit) DPD with a fee-only remainder on the oldest due counts from the next due with
  unpaid principal or interest (C2's `fees_last` row: 7, not 37).
- T-LEN-08-6 (copy) the outcome list is exactly the four neutral values in en and hi; T-LEN-14-5's
  forbidden-words test covers their labels.

### 13. Edge cases

1. EC-1 The agent opens Today at 23:55 and collects at 00:05 → the second is the next business day;
   Today refreshes its date on focus and after midnight.
2. EC-2 A loan moved to another route mid-morning → it disappears from the first agent's list on the
   next refresh; a collection already recorded stays theirs.
3. EC-3 Two agents on one route collect the same stop → the second sees "Collected today ₹2,400 by
   Ramesh" on the card before tapping Collect (refetched on sheet open); if both save, both are real
   payments and the second is an advance (visible, voidable).
4. EC-4 A 1,000-due daily loan with 40 days of arrears → one stop, "Arrears ₹4,000 · 40 days".

### 14. Future

Offline Today; loan-level promises feeding reminders; agent handover; route day plans.

---

## LEN-09 — Late fees and waivers

### 1. Product requirements

- FR-1 **Late fees only when declared.** A late fee can be added only if the loan's terms carry a
  late-fee rule (LEN-04 §5 `late_fee_*`); otherwise 409 `late_fee_not_in_terms` (R§15.3 item 6;
  G-7). A rule cannot be added to a saved loan (terms are frozen); a variation with the borrower's
  agreement is Later (reschedule, §14).
- FR-2 **Rule kinds**: `flat_once` (₹ once per overdue instalment), `per_day` (₹ per day after grace,
  **capped** per instalment), `simple_interest` (% a year on the instalment's unpaid principal and
  interest, day by day, **capped**, **never compounded**: never charged on fees, late fees or earlier
  interest-on-arrears). Grace days 0–90.
- FR-3 **Never automatic in the MVP.** The product computes and shows "Late fee so far" on each
  overdue instalment; the owner taps **Add late fee**, prefilled with the rule's figure, and may lower
  it but never raise it (R§3 W5.1; SE§2.7). The dues plan's own `penalty_kind` is `none`, so the
  engine's daily run never posts one (LEN-04 §5).
- FR-4 Adding posts through `dues.add_penalty(due_id, amount, reason)`: a `dues_adjustment` of kind
  `penalty`, a `charge` line in bucket `loan`. It is collected by the ordinary allocation order.
- FR-5 **Waivers**: the owner (and admins, when `lending.waiver_by_admin` is on) waives all or part of
  an instalment's **interest**, **fee / late fee** or **principal**, with a required reason, through
  `dues.waive(due_id, amount, reason, component)`: an `adjustment_credit` line in bucket `loan`, shown
  on the statement as "Waiver — <reason>" (R§3 W5.2).
- FR-6 A late fee added by mistake is removed by **waiving it** with a reason (the ledger keeps both
  lines, LED-03 spirit). A dedicated reversal is §C CQ-10.

### 2. User flows

- **Add a late fee.** Loan → Schedule → instalment 3 (Overdue, "Late fee so far ₹100") → *Add late
  fee* → amount ₹100.00, reason prefilled "Late fee as agreed: ₹100 after 3 days" → Save → the
  instalment shows "+ ₹100 late fee"; owed now + ₹100.
- **Waive.** Loan → ⋯ → *Waive* → instalment 3 → component *Late fee* → ₹100 → reason "First time,
  paid same week" → Save.

### 3. Features

| MVP | Later |
|---|---|
| Three declared rule kinds, live "late fee so far", manual add, waivers with reason | Suggested late fees on a list after grace, still one tap each (R§17.3) |
| Waiver as the undo for a mistaken fee | Bounce fee and other declared charges; recorded variations with the borrower's agreement (R§15.3 item 6) |

### 4. Entities and relationships

No lending table: late fees and waivers are `dues_adjustment` rows on the loan's dues (11-contracts
§2.1). The rule is on `lending_loan`.

### 5. Database

- `dues_adjustment` (engine): `kind='penalty'` with `amount > 0`, or `kind='waiver'` with a negative
  signed amount and `component`; `posted_entry_id`; `reason`.
- `ledger_entry`: `charge` (debit) or `adjustment_credit` (credit), source `dues_adjustment`, bucket
  `loan`.
- No new index: the loan's schedule tab reads adjustments by `due_id`.

### 6. API

| Method and path | Codename | Body → result | Errors |
|---|---|---|---|
| `GET /lending/loans/{id}/late-fees/preview?due_id&on` | `lending.charge.create` | → `{rule, days_late, base, rule_amount, already_charged, suggested, cap_left}` | 409 `late_fee_not_in_terms`, `due_not_open` |
| `POST /lending/loans/{id}/late-fees` (`Idempotency-Key`) | `lending.charge.create` | `{due_id, amount, reason}` → 201 `{adjustment, due, loan: {figures}}` | 400 (amount > suggested: `details.amount`); 409 `late_fee_not_in_terms`, `penalty_cap_reached {cap}`, `due_not_open {status}`, `loan_not_active` |
| `POST /lending/loans/{id}/waivers` (`Idempotency-Key`) | `lending.waiver.create` + role check | `{due_id, component: "interest"\|"fee"\|"principal", amount, reason}` → 201 | 400 (amount > component outstanding); 403 `permission_denied` (role); 409 `due_not_open`, `loan_not_active` |

### 7. Frontend

`LateFeeDialog` and `WaiverDialog` (`UbDialog`, `dynamic()`), opened from the schedule row's menu or
the loan's ⋯ sheet; `LateFeeSoFarChip` on overdue rows. Service calls in `lendingLoanService.ts`;
schemas `lateFeeSchema`, `waiverSchema`.

### 8. UI/UX

- "Late fee so far ₹53.65" is informational; it is **not** in owed now until added, and says so on
  tap: "Not added yet. Add it only if the borrower agreed to late fees."
- The waiver dialog shows what remains after it ("Instalment 3 will have ₹0 late fee left").
- Reasons are free text 3–255 characters; no preset reason implies blame.

### 9. Validation and business rules

**Late-fee arithmetic** (`lending/services/late_fees.py`, pure; `Decimal`, `half_up` once, at the end):

- `start = due_on + grace_days`; `days_late(on) = max(0, on − start)` (calendar days).
- `flat_once`: `rule_amount = value` once `days_late ≥ 1`; a second flat fee on the same instalment is
  refused (`penalty_cap_reached`).
- `per_day`: `rule_amount = min(value × days_late, cap)`.
- `simple_interest`: `rule_amount = min(half_up(Σ_{d = start+1 … on} unpaid_PI(d) × value / 100 / 365),
  cap)`, where `unpaid_PI(d)` is the instalment's unpaid principal + interest at the end of day `d`
  (settlements reduce it from their payment date). Fees and late fees are never in the base (G-6).
- `suggested = max(0, rule_amount − already_charged − already_waived_of_fees)`; the owner may add any
  amount in (0, suggested].
- Waivers: `amount ≤` the component's outstanding; interest and fee waivers only on **posted**
  components (`due_on ≤ today`) — unposted future interest is not owed yet, and reducing it is a
  reschedule (Later); principal waivers on any open or scheduled due.

**Worked example L1** — F1's instalment 3 (due 05 Apr 2026, ₹2,400.00 unpaid), grace 3 days, so late
days count from 08 Apr:

| Rule | On 20 Apr 2026 (12 days late) | On 12 May 2026 (34 days late) |
|---|---|---|
| `flat_once` ₹100 | 100.00 | 100.00 (once) |
| `per_day` ₹10, cap ₹300 | 120.00 | 300.00 (capped; 340.00 uncapped) |
| `simple_interest` 24% a year, cap ₹500 | 2,400.00 × 0.24 × 12 / 365 = 9.4684… → **9.47** | 2,400.00 × 0.24 × 34 / 365 = 53.6547… → **53.65** |

If the owner added ₹9.47 on 20 Apr, the suggestion on 12 May is 53.65 − 9.47 = **₹44.18**. If ₹1,000.00
of instalment 3 was collected on 25 Apr, the base is 2,400.00 for 17 days (08 Apr → 25 Apr) and
1,400.00 for 17 days (25 Apr → 12 May): 2,400 × 0.24 × 17/365 + 1,400 × 0.24 × 17/365 = 26.8274… +
15.6493… = 42.4767… → **₹42.48** by 12 May. The ₹100 flat fee of example C2, if present, is never in
the base.

- BR-1 A late fee is a **charge**, never interest, and never earns interest (RBI's penal-charges rule
  as fair practice, R§15.2; G-6).
- BR-2 Waivers are a business ceiling: role check owner (admin by setting), never a delegable codename
  alone (the LED-03 rule).
- BR-3 A written-off, closed or cancelled loan takes neither (`loan_not_active`).
- BR-4 Audit `lending.late_fee.added {due, rule, days_late, rule_amount, amount}`,
  `lending.waiver.created {due, component, amount, reason}` (the engine writes `dues.adjustment.created`
  too).

### 10. Permissions

| Action | Codename / check | OW | AD | ST | AG | AC |
|---|---|---|---|---|---|---|
| Add a late fee | `lending.charge.create` | yes | yes | no | no | no |
| Waive | `lending.waiver.create` + role owner (admin if `lending.waiver_by_admin`) | yes | by setting | no | no | no |

### 11. Reports

Late fees and waivers appear on the loan statement, the loan book (in owed now) and the dashboard's
"Interest this month" tile's footnote (fees and waivers this month).

### 12. Testing

- T-LEN-09-1 (unit) L1's six figures and both follow-ups (44.18, 42.48).
- T-LEN-09-2 (property, seeded) `simple_interest` late fees never include a fee or late fee in their
  base, and Σ late fees on an instalment ≤ the cap, over random collection histories.
- T-LEN-09-3 (API) late fee on a loan with `late_fee_kind = none` → 409 `late_fee_not_in_terms`.
- T-LEN-09-4 (API) amount above the suggestion → 400; a second `flat_once` → 409 `penalty_cap_reached`.
- T-LEN-09-5 (API) an admin waiving with `lending.waiver_by_admin` off → 403; on → 201.
- T-LEN-09-6 (unit) the dues plan of every lending loan has `penalty_kind = 'none'`; the daily run
  posts no penalty on a lending due.

### 13. Edge cases

1. EC-1 A collection voided after a late fee was added → the fee stays (it was earned while unpaid);
   the owner may waive it.
2. EC-2 A waiver of principal on the last instalment that brings owed now to 0 → the loan closes
   (LEN-10 BR-1), close reason `completed`.
3. EC-3 The due was paid between the dialog opening and Save → 409 `due_not_open`.

### 14. Future

A suggestions list after grace (still one owner tap each); declared bounce and other charges;
recorded variations of terms with the borrower's agreement; reversal of an adjustment (§C CQ-10).

---

## LEN-10 — Closing a loan: normal, early, write-off, cancel

### 1. Product requirements

- FR-1 **Normal closure**: when the last open due is settled (or waived) and owed now is 0, the loan
  moves to `closed` with `close_reason = completed` in the same transaction, and the closure letter is
  offered (R§3 W6.1).
- FR-2 **Early closure**: *Close early* shows a **payoff sheet** itemising principal outstanding,
  interest and fees owed now, interest to date for the current period, any declared foreclosure
  charge, and anything already paid in advance; the owner records the final collection and the loan
  closes (R§3 W6.2, R§6.9).
- FR-3 **Write-off**: the owner writes off what is still owed with a reason; the loan becomes
  `written_off`; history stays; reminders stop at once; no closure letter (R§3 W6.4, R§9.4).
- FR-4 **Cancel**: only for a loan with **no recorded collection** (void ones do not count); it
  reverses every posting and voids the disbursal, so the loan never happened in the books (R§3 W9).
- FR-5 **Reopen**: voiding the collection that closed a loan reopens it (`active`), with an audit row;
  a closure letter already printed is marked as no longer valid on the loan page (R§13 EC-9).

### 2. User flows

- **Early closure (owner).** Loan → ⋯ → *Close early* → payoff sheet for today ("Payoff today
  ₹10,599.62") with the breakdown → optional *Change date* (≤ today) → amount received (prefilled with
  the payoff) and mode → *Close loan* → "Loan closed. Collected ₹10,599.62." → *Print closure letter*.
- **Owner decides a lower figure.** Payoff sheet shows two figures for `owner_decides` (interest to
  date ₹10,200.00; full contracted ₹12,000.00) → the owner types ₹11,000.00 → Close.
- **Write-off.** ⋯ → *Write off* → "₹14,400.00 will be written off. Nothing is deleted." → reason
  (*Cannot trace* / *Death* / *Other*, plus text) → tick "I understand ₹14,400.00 is written off" →
  Confirm.
- **Cancel.** ⋯ → *Cancel loan* (shown only when no collection exists) → reason → Confirm → "Loan
  cancelled. The ₹20,000.00 disbursal and its postings are reversed."

### 3. Features

| MVP | Later |
|---|---|
| Normal, early (three rules), write-off, cancel, reopen on void | Top-up (settle the old loan from a new one, R§3 W6.3) |
| Payoff sheet and quote | Recovery after write-off (a collection on a written-off loan, posted as income recovered) |
| Declared foreclosure charge | Payoff quote as a shareable document valid for a date (R§9.5) |

### 4. Entities and relationships

Closure writes to `lending_loan` (status, `closed_on`, `close_reason`, `closure_payment_id`,
`status_reason`), `lending_collection` (`kind='closure'`), `lending_waiver` (write-off), and the
engine's rows through its services.

### 5. Database

**`lending_waiver`** (TenantModel) — credits that lending posts itself, not tied to one due.

| Column | Type | Constraint |
|---|---|---|
| `loan_id` | uuid | FK `lending_loan` RESTRICT |
| `kind` | varchar(12) | `CHECK IN ('write_off')` in the MVP (a closure rebate goes through `dues.waive` on the closure due) |
| `amount` | numeric(14,2) | `CHECK (amount > 0)` |
| `reason_code` | varchar(16) | `CHECK IN ('cannot_trace','death','bad_debt','other')` |
| `reason` | varchar(255) | 3–255 characters |
| `ledger_entry_id` | uuid | the `adjustment_credit` line, source `lending_waiver`, this row's id, bucket `loan` |

`UNIQUE (loan_id) WHERE kind = 'write_off'`. Never updated or deleted.

**`lending_loan`** gains, for FR-5: `closure_letter_issued_at timestamptz null` (set the first time the
letter is printed or shared) — a reopened loan with this set shows the "no longer valid" banner.

### 6. API

| Method and path | Codename / check | Body → result | Errors |
|---|---|---|---|
| `GET /lending/loans/{id}/payoff?on` | `lending.loan.close` | → `Payoff` | 409 `loan_not_active`; 400 `on` in the future or before disbursal |
| `POST /lending/loans/{id}/close-early` (`Idempotency-Key`) | `lending.loan.close` (owner, admin) | `{on, amount, mode_breakup, reference, expected_payoff, waiver_reason?}` → 201 `{loan, collection, receipt}` | 409 `payoff_changed {payoff}`, `collection_over_payoff`, `loan_not_active`; 400 (amount below payoff without `waiver_reason`); 403 (waiver role) |
| `POST /lending/loans/{id}/write-off` | role check **owner** | `{amount, reason_code, reason}` → 200 `{loan}` | 409 `balance_changed {balance}` (the pinned amount, the PTY-04 pattern), `loan_not_active`, `nothing_to_write_off` (existing codes) |
| `POST /lending/loans/{id}/cancel` | `lending.loan.cancel` (owner, admin) | `{reason}` → 200 `{loan}` | 409 `loan_has_collections {count}`, `loan_not_active` |

`Payoff` = `{on, rule, principal_outstanding, owed_interest_and_fees, interest_to_date,
foreclosure_charge, paid_in_advance, payoff, full_contracted, floor (owner_decides),
lines: [{label, amount}]}`.

### 7. Frontend

`PayoffSheet` (`UbDrawer`), `CloseEarlyForm`, `WriteOffDialog` (the PTY-04 write-off dialog's
confirm-the-amount pattern), `CancelLoanDialog` (`UbReasonDialog`), `ReopenedBanner`. Service calls in
`lendingLoanService.ts`; schemas `closeEarlySchema`, `writeOffSchema`, `cancelLoanSchema`.

### 8. UI/UX

- The payoff sheet is itemised in plain words, one line each, and ends in one bold figure:
  "Principal still owed ₹10,494.67 · Interest for 15 of 30 days ₹104.95 · **Payoff today
  ₹10,599.62**". Hindi: "बचा हुआ मूलधन", "30 में से 15 दिन का ब्याज", "आज पूरा हिसाब".
- Write-off copy never says "loss recovered", "legal action" or "defaulter" (G-3, G-4); the
  status badge reads *Written off* / बट्टे खाते में.
- Cancel is not offered once any collection exists; the ⋯ sheet shows only what can be done.

### 9. Validation and business rules

- BR-1 **Normal closure** runs inside the transaction that settles the last due, from the dues
  `on_due_changed` hook: `closed_on = payment_date`, `close_reason = completed`, `closure_payment_id`.
- BR-2 **Early closure transaction** (owner or admin): lock borrower party → loan → schedule and dues;
  recompute the payoff for `on`; if `expected_payoff` ≠ payoff → 409 `payoff_changed`; replace every
  due from the first due with unposted interest onward by **one closure due** dated `on` through
  `dues.reschedule(schedule_id, from_seq, supplied=[{seq, amount, components: {principal, interest,
  fee}}], reason="Closed early")`, whose principal is the **gross** principal of the replaced dues,
  whose interest is the interest to date (or the remaining interest under `full_contracted`) and whose
  fee is the foreclosure charge; settlements already made on the replaced dues are carried onto it,
  interest first, then principal, then fee, each capped at the component (§C CQ-4); if `amount < payoff`,
  `dues.waive` the difference on the closure due (interest first, then fee, then principal), which
  needs `waiver_reason` and the waiver role; `record_payment` allocated to every open due, closure due
  last; the loan closes (`close_reason = early`); `lending_collection.kind = 'closure'`.
- BR-3 **Payoff**, by the loan's `early_closure_rule`, on date `on`:
  - `interest_to_date` (default): **owed now** + **interest to date** + declared **foreclosure
    charge**. *Interest to date* = the current period's scheduled interest × days elapsed / days in
    the period, `half_up` once; the period runs from the previous `due_on` (or `disbursed_on` for the
    first) to the next `due_on`. Anything already paid in advance on that interest is **not**
    subtracted again here: owed now already nets it (§0.3). For `fixed_daily` it is 0: each day's
    interest has already posted by its own date.
  - `full_contracted`: owed now + every remaining **unposted** scheduled interest and fee + foreclosure
    charge (= remaining under the schedule + foreclosure charge).
  - `owner_decides`: both figures are shown; the owner collects any amount between them; below the
    lower one is a waiver (BR-2).
  - **Foreclosure charge** only when declared in the terms (`flat` ₹, or % of principal outstanding),
    otherwise 0 (R§6.9; G-7).
- BR-4 **Write-off** (owner only, not delegable, R§12): amount = owed now under the lock and must equal
  the pinned `amount` (else 409 `balance_changed`); posts one `lending_waiver` (`adjustment_credit`,
  bucket `loan`); ends the schedule with no further postings (§C CQ-3); status `written_off`,
  `status_reason`; reminders stop (LEN-12 BR-5). Owed now becomes 0.
- BR-5 **Cancel** (no recorded collection): in one transaction — status `cancelled` first (so the
  `lending_loan` target permits `unapply`, LEN-04 BR-4), `dues.cancel_schedule` (reverses any posted
  interest and adjustments), `reverse_source_entries` for each `lending_deduction`, then `void_payment`
  of the disbursal with the reason. Owed now becomes 0; `party.loan_balance` falls by the principal.
- BR-6 A loan is never deleted; every closure keeps its history (R§5).
- BR-7 Closure letters exist only for `closed` loans (R§9.4).
- BR-8 **Reopen**: when a void (LEN-06 FR-10) leaves an open due on a `closed` loan, the hook sets
  `active`, clears `closed_on`, `close_reason`, `closure_payment_id`, and writes
  `lending.loan.reopened {voided_payment_id}`. A `written_off` or `cancelled` loan never reopens.
- BR-9 Audit `lending.loan.closed {reason}`, `lending.loan.closed_early {payoff, amount, waived,
  rule}`, `lending.loan.written_off {amount, reason_code}`, `lending.loan.cancelled {reason}`.

**Worked example P1 — early closure of F1 (flat) on 20 Jun 2026.** Instalments 1–5 paid on their dates;
instalment 6 is due 05 Jul (period 05 Jun → 05 Jul = 30 days; 15 elapsed on 20 Jun).

| Line | `interest_to_date` | `full_contracted` |
|---|---|---|
| Principal outstanding (20,000.00 − 5 × 2,000.00) | 10,000.00 | 10,000.00 |
| Interest and fees owed now (all posted interest paid) | 0.00 | 0.00 |
| Interest to date: 400.00 × 15 / 30 | 200.00 | — |
| Remaining unposted interest (instalments 6–10: 5 × 400.00) | — | 2,000.00 |
| **Payoff** | **10,200.00** (10,20,000 p) | **12,000.00** (12,00,000 p) |

With a declared foreclosure charge of 2% of principal outstanding: + 200.00 → 10,400.00 and 12,200.00.
Under `owner_decides` the owner may collect anything from 10,200.00 to 12,000.00. The closure due
replaces instalments 6–10: principal 10,000.00, interest 200.00 (`interest_to_date`).

**Worked example P2 — early closure of R1 (reducing) on 20 Jun 2026**, same history:

| Line | `interest_to_date` | `full_contracted` |
|---|---|---|
| Principal outstanding (balance after instalment 5) | 10,494.67 | 10,494.67 |
| Interest to date: 209.89 × 15 / 30 = 104.945 → | 104.95 | — |
| Remaining unposted interest (209.89 + 169.56 + 128.42 + 86.46 + 43.66) | — | 637.99 |
| **Payoff** | **10,599.62** (10,59,962 p) | **11,132.66** (11,13,266 p) |

`full_contracted` equals the five remaining instalments (4 × 2,226.53 + 2,226.54 = 11,132.66), as it
must. A collection of ₹10,599.62 or more through the ordinary Collect path is refused
(`collection_over_payoff`, LEN-06 BR-6) and routed here.

**Worked example P3 — early closure after an advance.** F1 after example C4 (₹400.00 of instalment
2's interest and ₹200.00 of its principal paid in advance on 05 Feb), closed on 20 Feb 2026 (period
05 Feb → 05 Mar = 28 days, 15 elapsed):

- Owed now = **17,400.00** (C4). Interest to date = 400.00 × 15 / 28 = 214.2857… → **214.29**.
  Payoff = 17,400.00 + 214.29 = **17,614.29** (17,61,429 p).
- The closure due replaces instalments 2–10: principal 18,000.00 (gross: 1 × 2,000.00 + 8 × 2,000.00),
  interest 214.29. The ₹600.00 settled on instalment 2 is carried: 214.29 to interest, the remaining
  385.71 to principal (200.00 + 185.71). Left on the closure due: 18,000.00 − 385.71 = 17,614.29 =
  the payoff, so the final collection settles it exactly.

The borrower gets credit for every rupee paid in advance.

### 10. Permissions

| Action | Codename / check | OW | AD | ST | AG | AC |
|---|---|---|---|---|---|---|
| Payoff quote, close early | `lending.loan.close` | yes | yes | no | no | read quote only (`lending.loan.read`) |
| Waive part of a payoff | waiver role (LEN-09 BR-2) | yes | by setting | no | no | no |
| Write off | role check owner, not delegable | yes | no | no | no | no |
| Cancel | `lending.loan.cancel` | yes | yes | no | no | no |

### 11. Reports

The loan book filters by status; closed and written-off loans appear in the collection register with
their closure collection (`kind = closure`); a *Closed loans* report is Later-1 (R§8).

### 12. Testing

- T-LEN-10-1 (unit) P1, P2 and P3 figures, and the foreclosure variants.
- T-LEN-10-2 (API) close early with a stale `expected_payoff` → 409 `payoff_changed`; with the right
  one → loan `closed`, `close_reason = early`, owed now 0, `party.loan_balance` reduced by exactly the
  loan's owed now.
- T-LEN-10-3 (API) write-off by an admin → 403; by the owner with a stale amount → 409
  `balance_changed`; then → `written_off`, one `lending_waiver` line, owed now 0, no reminder
  candidate for the loan, closure letter → 409 `closure_letter_unavailable`.
- T-LEN-10-4 (API) cancel with one recorded collection → 409 `loan_has_collections {count: 1}`; after
  voiding it → cancel succeeds; the disbursal payment is `void`; Σ `loan_ledger` = 0; `recalc_balances`
  shows zero drift.
- T-LEN-10-5 (API) void the closing collection → the loan is `active`; `closure_letter_issued_at` kept;
  the banner shows.
- T-LEN-10-6 (property) for every generated loan of T-LEN-06-2, closing early at a random date leaves
  Σ `loan_ledger` = 0 and every due `paid` or `cancelled`.

### 13. Edge cases

1. EC-1 Close early on the day an instalment falls due → that instalment's interest has posted (it is
   in owed now); interest to date for the new period is 0.
2. EC-2 Close early with overdue instalments → they are in owed now and are paid first by the final
   collection.
3. EC-3 A write-off where a late fee was added but not collected → included in owed now, written off
   with the rest.
4. EC-4 The borrower dies with a guarantor recorded → the owner may remind the guarantor (LEN-12) or
   write off; the product never suggests pursuing family (G-15).
5. EC-5 Cancel of a backdated loan whose past interest posted → `cancel_schedule` reverses those
   postings; the statement shows each line and its reversal.

### 14. Future

Top-up (R§3 W6.3); recovery after write-off; a dated payoff-quote document (R§9.5).

---

## LEN-11 — Documents

### 1. Product requirements

Four documents, all on the existing print pipeline (`window.print()`; A4, A5 and 80 mm), all
**tenant-branded** (logo, name, address, phone, signature, colour), **never naming the product or its
domain** (CLAUDE.md; `customerDocumentsCarryNoProductName.test.tsx` extended to each), all printing
the tenant's **licence or registration number** when set, and all showing the loan's **effective
yearly rate** (R§9, R§15.3). Language: the borrower's `document_language` (English or Hindi to start).

| Document | Size | When | Content |
|---|---|---|---|
| **Loan summary** (key-facts sheet) | A4 | on save, any time after | §9.1 below |
| **Collection receipt** | A5, 80 mm, WhatsApp text | every collection | §9.2 |
| **Loan statement** | A4, CSV | on demand; any period | §9.3 |
| **Closure letter** | A4 | `closed` loans only | §9.4 |

- FR-1 Each is a print page under `/lending/…/print/…` with *Print* (→ PDF through the browser) and
  *Share* (`UbShareSheet`: WhatsApp text with the key figures, download PDF). Public share links
  (`/d/<token>`) come when `parties_share_link` exists (10-architecture §7); until then the share
  text carries no link (the PAY-04 decision).
- FR-2 The loan summary is **not** a loan agreement and says so in one neutral line: "This is a record
  of the loan terms. It is not a loan agreement." (R§15.7; L2.)
- FR-3 A voided receipt still prints, with **VOID / रद्द** and the reason (PAY-04 FR-8).

### 2. User flows

Loan saved → *Print loan summary* → the A4 sheet → browser print → PDF → WhatsApp. Collection saved →
*Share receipt* → WhatsApp text. Loan → ⋯ → *Statement* → period *This financial year* → Print.
Loan closed → *Print closure letter*.

### 3. Features

| MVP | Later |
|---|---|
| Four documents, en and hi, three sizes, share text | Yearly statements batch per financial year (R§15.3 item 7; some Acts require it) |
| Licence number, effective yearly rate on each | Public share links; payoff quote document; regional languages beyond Hindi |

### 4. Entities and relationships

No table. Documents render from the loan, its schedule, its ledger lines (`loan_ledger`), payments and
tenant branding. `closure_letter_issued_at` (LEN-10 §5) is the only thing a document writes.

### 5. Database

Reads only. The statement's running balance is a SQL window function over `loan_ledger(loan)` ordered
`(entry_date, created_at, id)`, computed per page with the carried-forward figure added (the LED-04
selector's approach, whose trap — Django not wrapping `.annotate(Window).filter(keyset)` in a subquery —
this reuses rather than re-discovers).

### 6. API

| Method and path | Codename | Result |
|---|---|---|
| `GET /lending/loans/{id}/documents/summary` | `lending.loan.read` + `terms_read` | the print payload: branding, licence, loan, deductions, schedule, rules, guarantor, effective yearly rate, share text |
| `GET /lending/collections/{payment_id}/receipt` | `lending.collection.read` | LEN-06 §6 |
| `GET /lending/loans/{id}/documents/statement?from&to&include_reversed&format=json\|csv` | `lending.loan.read` + `terms_read` | `{opening, lines: [{date, label, debit, credit, balance, source}], closing, schedule: [Due]}` |
| `GET /lending/loans/{id}/documents/closure-letter` | `lending.loan.read` + `terms_read` | the payload; the first call by a member holding `lending.loan.close` sets `closure_letter_issued_at`; 409 `closure_letter_unavailable {status}` unless `closed` |

Agents receive the receipt only (they share it at the doorstep); the summary and statement need
`terms_read`.

### 7. Frontend

- Pages: `/lending/loans/[id]/print/summary`, `/lending/loans/[id]/print/statement`,
  `/lending/loans/[id]/print/closure-letter`, `/lending/collections/[paymentId]/receipt` (screen +
  print), each `dynamic()` so its catalogue loads with its chunk.
- Components in `features/lending/components/print/`: `LoanSummaryPrint`, `CollectionReceiptPrintA5`,
  `CollectionReceiptPrint80`, `LoanStatementPrint`, `ClosureLetterPrint` (raw table elements allowed
  in `print/` only, as today).
- **Shared print parts must move out of `features/sales`.** `UbQrCode` and the `PrintBranding` type
  live in `features/sales/…/print` today and the payments receipt imports them from there
  (`PaymentReceiptPrint.tsx`); lending may not import `features/sales` (10-architecture §6 item 7). They
  move to the design system (`UbQrCode`) and `src/print/branding` (a type and a hook), which is task
  TSK-LEN-05. No copy of them is made.

### 8. UI/UX

- Plain, factual wording; dates dd/mm/yyyy; amounts en-IN grouped with ₹; digits are 0–9 in both
  languages and only the words change in Hindi.
- The effective yearly rate appears in the key-figures block of the summary with the same size as the
  total payable, in the statement header, in the closure letter's summary line, and on the receipt's
  loan block in small type.
- 80 mm receipt: one column, ≤ 32 characters per line where possible, no table borders.

### 9. Validation and business rules

**9.1 Loan summary.** Lender name, address, phone and licence number (when set); borrower name, mobile
and collection address; loan number and date; **principal**; each **deduction** with its label and
"deducted from the amount handed over"; **cash handed over** and how (modes, reference); the plan in
words ("₹2,400 every month for 10 months, from 05/02/2026"); the rate as agreed and its method ("2% a
month, flat"); **total interest, total payable, effective yearly rate**; the full schedule (due date,
amount, principal, interest); the late-fee rule and the early-closure rule and any foreclosure charge
exactly as configured, or "No other charges apply." when there are none; the rounding note when not
paise ("Instalments are rounded up to the rupee; the last is smaller."); guarantor (when any);
agreement reference; the not-an-agreement line; signature lines for lender and borrower.

**9.2 Collection receipt.** Receipt number, date and time; borrower; loan number; **amount received,
modes and reference**; how it was applied (interest, principal, fee / late fee); **owed now after this
collection**; next due date and amount; "Collected by <first name>"; the loan's effective yearly rate
(small); lender name, address, licence. WhatsApp text (en): "Receipt RCT/26-27/0311 from {business}.
Received ₹2,400.00 in cash on 05/06/2026 for loan LN/26-27/0042. Applied: interest ₹400.00, principal
₹2,000.00. Still owed: ₹10,000.00. Next due: ₹2,400.00 on 05/07/2026. Thank you." Hindi equivalent in
the catalogue.

**9.3 Loan statement.** The period; brought forward; every posting of the loan (disbursal, deduction,
interest, late fee, collection, waiver, write-off, reversal) with a running balance; the schedule with
each due's status; the corrections toggle (`include_reversed`, hidden by default, as LED-04);
**the closing balance of an unbounded statement equals owed now** (the LED-04 BR-3 assertion, per
loan). CSV has the same columns.

**9.4 Closure letter.** Loan number, borrower, principal, dates opened and closed, total collected,
and: "All amounts due under this loan have been received. Nothing further is payable under this
loan." (L10.) A top-up closure (Later) says "settled by new loan LN/…". A written-off or cancelled
loan has **no** closure letter.

- BR-1 No document names YourKhata or yourkhata.com, in any language, in any size (G-13).
- BR-2 No document says a rate, charge or practice is legal, lawful, permitted, approved or compliant
  (G-4).
- BR-3 ID fields never print (ADR-053).
- BR-4 Printing and sharing write no money row; sharing the closure letter sets
  `closure_letter_issued_at` once.

### 10. Permissions

| Document | OW | AD | ST | AG | AC |
|---|---|---|---|---|---|
| Loan summary, statement | yes | yes | yes | no | yes |
| Receipt | yes | yes | yes | own collections | yes |
| Closure letter | yes | yes | yes | no | yes |

### 11. Reports

The statement's CSV is the per-loan export; the loan book is the portfolio export (LEN-13).

### 12. Testing

- T-LEN-11-1 (component) each of the five print components renders the shop's name and **no** product
  name or domain in en and hi (extends `customerDocumentsCarryNoProductName.test.tsx`); the share
  texts likewise (server test).
- T-LEN-11-2 (component) each shows the effective yearly rate; the summary shows every deduction and
  cash handed over.
- T-LEN-11-3 (API) the unbounded statement's closing balance equals owed now for 200 generated loans
  (the T-LEN-06-2 corpus), and page two of a 120-line statement carries forward correctly (the LED-04
  trap).
- T-LEN-11-4 (API) closure letter for an active or written-off loan → 409
  `closure_letter_unavailable`.
- T-LEN-11-5 (copy) LEN-14 T-LEN-14-4 scans every document string for legal claims.
- T-LEN-11-6 (shots) each document at A4/A5/80 mm widths; the 80 mm receipt has no text node wider
  than its box.

### 13. Edge cases

1. EC-1 No licence number set → the line is omitted (not "Licence: —").
2. EC-2 The borrower's language is Hindi but the tenant has no Devanagari-capable font set in
   branding → the existing `font_missing_devanagari` rule applies; the receipt falls back to English
   and the share sheet says so.
3. EC-3 A loan with 1,000 daily dues → the summary's schedule prints in four columns on A4 with the
   first and last dates and "100 collections of ₹100.00" on one line; the full table is on page 2+.
4. EC-4 A receipt reprinted after a later collection → it shows the owed-now figure **as at that
   collection** (computed from the ledger up to that payment), not today's.

### 14. Future

Yearly statements batch within 30 days of year end (R§15.1 Gujarat Form 15; L13); share links; payoff
quote; more languages.

---
## LEN-12 — Reminders with guardrails

### 1. Product requirements

The lender sends a polite, exact reminder **from their own phone**; the product prepares the text,
records that it was prepared, and enforces the guardrails structurally (ADR-054; R§15.4). **The
product sends nothing** (DEC-012).

- FR-1 Lending registers a reminder **source** per loan, `register_reminder_source("lending_loan",
  module="lending", candidates=…)` (A7), one candidate per active loan per day in one of three
  buckets: *due tomorrow*, *due today*, *overdue*. Amount: the instalment due (tomorrow, today) or
  due today + arrears (overdue). `subject_label`: "Instalment 5 of LN/26-27/0042". The candidates show
  in the existing reminder list (`/ledger/reminders`, filterable by module) and on the loan and Today
  screens. (Why lending's own source rather than the engine's per-due `dues_due` source: §C CQ-1.)
- FR-2 Lending registers its **policy** (A7, 11-contracts §1.6):
  `register_reminder_policy("lending", {window: (08:00, 19:00), daily_cap_per_source: 1,
  fixed_templates: True, forbidden_words: LENDING_FORBIDDEN_WORDS})`. Every path that records,
  prepares or sends a lending reminder — the loan's *Remind*, the Today card's *Remind*, the generic
  reminder list's send and bulk prepare — calls `check_reminder_allowed`, which raises 409
  `reminder_outside_window` or `reminder_cap_reached` with `next_allowed_at`.
- FR-3 **Window**: 08:00 (inclusive) to 19:00 (exclusive), **tenant-local time**. The tenant may narrow
  it (`reminders.lending.window`), never widen it. The **Call** action (`tel:`) is under the same
  window and is recorded as a reminder with channel `call`.
- FR-4 **At most one reminder per loan per tenant-local day**, whichever channel, whoever sends it
  (owner, staff or agent).
- FR-5 **Fixed polite templates only** (en and hi): no free-text message body, no tone option. The
  template keys are `lending.due_tomorrow`, `lending.due_today`, `lending.overdue` and
  `lending.guarantor_overdue`, in the LED-08 template registry. The lender may **not** edit them; the
  tenant's business name is the only signature.
- FR-6 **Recipients**: the borrower's own mobile; or, when the loan names a guarantor and the member
  chooses it, the guarantor's own mobile (owner and admin only; §C CQ-2). No other contact, no typed
  number, no group message, no contact import (R§15.4).
- FR-7 **Suppression**: no candidate and no send for a loan that is not `active` (written off, closed,
  cancelled) — a written-off borrower's reminders stop at once (R§13 EC-11).
- FR-8 **No automated sending for lending in the MVP.** The LED-07 auto job does not take lending
  candidates; `reminders.lending.auto` is not offered. (If automation is ever added it passes the same
  `check_reminder_allowed`, which is why the policy is core.)

### 2. User flows

- **Owner at 10:14.** Loan → *Remind* → sheet: recipient *Sunita Devi (borrower)*, the prepared text
  (read-only), *WhatsApp* / *SMS* / *Call* → *WhatsApp* → WhatsApp opens with the text → back in the
  app the loan shows "Reminded today at 10:14 · WhatsApp".
- **A second reminder the same day.** *Remind* is disabled: "Already reminded today at 10:14. Next
  reminder from 08:00 tomorrow."
- **At 07:40 on the route.** The Today card's ⋯ → *Remind* is disabled: "Reminders can be sent from
  8 am." *Call* likewise.
- **Guarantor (owner).** Loan with guarantor → *Remind* → recipient *Anil Kumar (guarantor)* → the
  guarantor template.

### 3. Features

| MVP | Later |
|---|---|
| Per-loan candidates, three buckets, fixed en/hi templates, WhatsApp/SMS/Call deep links | Scheduled reminder "at 08:00" queued for the lender to open (R§13 EC-18) |
| Window, one per loan per day, recipients limited, suppression | Guarantor reminders by default for overdue > N days (R§17.4) |
| Template forbidden-words test | Automated SMS through an adapter, only if DEC-012 changes, same policy |

### 4. Entities and relationships

`ledger_reminder` rows with `module='lending'`, `source_type='lending_loan'`, `source_id=<loan>`,
`kind='due'`, `subject_label`, `snapshot_balance` = the amount quoted (A7, 11-contracts §1.6); the
party is the borrower (or the guarantor, §C CQ-2).

### 5. Database

No lending table. `ledger_reminder`'s widened unique index `(party, due_on, kind, source_id) NULLS NOT
DISTINCT` (A7) makes a rerun harmless; the **cap** is enforced by `check_reminder_allowed` counting
the loan's reminders of the tenant-local day, not by the index (a manual reminder is not an auto kind).
Index used: `ix_reminder_status_due` and the source columns' index added by A7.

### 6. API

| Method and path | Codename | Body → result | Errors |
|---|---|---|---|
| `GET /lending/loans/{id}/reminders/preview?recipient` | `lending.reminder.send` | → `{template_key, text, recipient: {party_id, name, mobile_masked}, allowed: true\|false, next_allowed_at, last_today: {at, channel}\|null}` | 404; 409 `loan_not_active` |
| `POST /lending/loans/{id}/reminders` (`Idempotency-Key`) | `lending.reminder.send` | `{recipient: "borrower"\|"guarantor", channel: "whatsapp_manual"\|"sms_manual"\|"call"}` → 201 `{reminder_id, text, deep_link}` | 409 `reminder_outside_window {window_start, window_end, next_allowed_at}`, `reminder_cap_reached {cap, next_allowed_at}`, `loan_not_active`; 400 `validation_error {recipient}` (no guarantor, or not permitted), `reminder_not_sendable` (existing: no mobile) |
| existing `POST /reminders/{id}/send`, `POST /reminders/bulk` | existing `ledger.reminder.write` | unchanged shape | the same 409s for `module='lending'` rows |

The body never carries message text: the server renders it from the template (FR-5).

### 7. Frontend

`LoanReminderSheet` (`UbDrawer`, `dynamic()`), `ReminderGuardHint` (the disabled reason and next
time), the Today card's ⋯ actions; `lendingReminderService.ts`; the deep link is opened through
`UbShareSheet`'s WhatsApp and SMS arms and `tel:` for Call. The generic reminder list shows lending
rows with a *Lending* module chip (the reminders feature is core; lending adds only a filter value).

### 8. UI/UX

- The prepared text is shown read-only in a card, exactly as it will appear; there is no edit
  control.
- The disabled Remind button always says why and when: "Reminders can be sent from 8 am" / "Already
  reminded today at 10:14". Copy never says "sent" (DEC-012): "Opened WhatsApp", "Reminder recorded".
- Templates (en):
  - `lending.due_tomorrow`: "Namaste {name}. A reminder from {business}: instalment {seq} of loan
    {loan_number}, ₹{amount}, is due tomorrow, {date}. Thank you."
  - `lending.due_today`: "Namaste {name}. A reminder from {business}: ₹{amount} for loan {loan_number}
    is due today, {date}. Thank you."
  - `lending.overdue`: "Namaste {name}. {business} here. Our records show ₹{amount} due on loan
    {loan_number} since {date}. Please pay when you can, or tell us if your records are different.
    Thank you."
  - `lending.guarantor_overdue`: "Namaste {name}. {business} here. You are named as guarantor on loan
    {loan_number} of {borrower_name}. Our records show ₹{amount} due since {date}. Thank you."
- Templates (hi):
  - `lending.due_tomorrow`: "नमस्ते {name}। {business} की ओर से याद दिला रहे हैं: कर्ज़ {loan_number} की
    किस्त {seq}, ₹{amount}, कल {date} को देय है। धन्यवाद।"
  - `lending.due_today`: "नमस्ते {name}। {business} की ओर से याद दिला रहे हैं: कर्ज़ {loan_number} के
    ₹{amount} आज, {date} को देय हैं। धन्यवाद।"
  - `lending.overdue`: "नमस्ते {name}। {business} से। हमारे हिसाब में कर्ज़ {loan_number} के ₹{amount}
    {date} से बाकी हैं। जब हो सके दे दीजिए, या आपका हिसाब अलग हो तो बताइए। धन्यवाद।"
  - `lending.guarantor_overdue`: "नमस्ते {name}। {business} से। आप कर्ज़ {loan_number} ({borrower_name})
    में ज़मानतदार हैं। हमारे हिसाब में ₹{amount} {date} से बाकी हैं। धन्यवाद।"

### 9. Validation and business rules

- BR-1 **Window check** uses the tenant's timezone (`platform_tenant.timezone`): allowed iff
  `window_start ≤ local_time(at) < window_end`.
- BR-2 **Cap check**: count of the loan's lending reminders (any channel, any recipient, any sender)
  whose `created_at` falls on the same tenant-local date; allowed iff 0. `next_allowed_at` = the next
  day's `window_start`.
- BR-3 **Recipient check** (lending's, before the core check): `borrower`, or `guarantor` when the
  loan names one, the member is owner or admin, and §C CQ-2 is accepted; anything else is 400.
- BR-4 **Templates** are fixed strings with placeholders; a template test asserts that no template in
  either language contains a word of `LENDING_FORBIDDEN_WORDS`:
  en — police, court, legal, lawyer, advocate, case, FIR, jail, arrest, warrant, notice, final,
  warning, action, consequences, family, relatives, neighbour, employer, office, boss, shame,
  default, defaulter, blacklist, CIBIL, credit score, seize, recovery agent, immediately, last chance;
  hi — पुलिस, थाना, कोर्ट, अदालत, वकील, केस, जेल, गिरफ्तार, नोटिस, चेतावनी, कार्रवाई, परिवार, रिश्तेदार,
  पड़ोसी, मालिक, दफ्तर, बदनाम, शर्म, डिफॉल्टर, ब्लैकलिस्ट, सिबिल, ज़ब्त, तुरंत, आखिरी मौका. (The list is
  reviewed with the templates, L9.)
- BR-5 Suppression (FR-7) is part of the candidates function **and** of the send path.
- BR-6 Audit `lending.reminder.prepared {loan_id, recipient, channel, template_key}`; the reminder row
  itself is the frequency record (R§15.4).

### 10. Permissions

| Action | Codename | OW | AD | ST | AG | AC |
|---|---|---|---|---|---|---|
| Remind / call the borrower | `lending.reminder.send` | yes | yes | yes | own routes | no |
| Remind the guarantor | role check owner, admin | yes | yes | no | no | no |
| See reminder history on the loan | `lending.loan.read` | yes | yes | yes | own routes | yes |

### 11. Reports

None in the MVP; reminder history is on the loan's Activity tab. An agent-performance report with
reminders is Later-1.

### 12. Testing

- T-LEN-12-1 (guardrail, unit) `check_reminder_allowed(module="lending", at=…)` with the tenant in
  `Asia/Kolkata`: 07:59:59 → `reminder_outside_window` (next 08:00 same day); 08:00:00 → allowed;
  18:59:59 → allowed; 19:00:00 → refused (next 08:00 tomorrow); 23:30 → refused. The same five with the
  tenant in `Asia/Dubai`, proving the check is tenant-local and not IST.
- T-LEN-12-2 (guardrail, unit) a narrowed window 10:00–12:00 refuses 09:59 and 12:00; a widening
  attempt (07:00–21:00) is refused by settings validation.
- T-LEN-12-3 (guardrail, API) the second reminder for the same loan on the same tenant-local day →
  409 `reminder_cap_reached`, by a different sender and a different channel too; a reminder for a
  second loan of the same borrower that day → allowed; at 00:00 tenant-local the cap resets.
- T-LEN-12-4 (guardrail, API) the generic `POST /reminders/{id}/send` of a lending row outside the
  window → the same 409 (no path bypasses the policy).
- T-LEN-12-5 (template) no lending template in en or hi contains a forbidden word (case-insensitive,
  whole word, Devanagari included); every template names `{business}` and no product name.
- T-LEN-12-6 (API) recipient `guarantor` by staff → 400; by the owner with a guarantor → 201; any typed
  number field in the body → ignored (the schema has none) and a test sends one to prove it.
- T-LEN-12-7 (API) a written-off loan → no candidate; `POST …/reminders` → 409 `loan_not_active`.
- T-LEN-12-8 (e2e) `e2e/lending.mjs` step R: with the tenant timezone set so that local time is
  outside 08:00–19:00, the Remind button is disabled with the reason, and the API refuses.

### 13. Edge cases

1. EC-1 The agent opens the sheet at 18:58 and taps WhatsApp at 19:01 → the POST is refused; the text
   is not shown for copying either (the preview's `allowed` is re-checked on the POST).
2. EC-2 Two loans due the same day for one borrower → two reminders allowed (per loan), each naming
   its loan (the widened index, A7).
3. EC-3 The borrower has no mobile → `reminder_not_sendable` (existing), Call hidden.
4. EC-4 The tenant changes its timezone → the window follows the new timezone from the next request.

### 14. Future

A queued "remind at 08:00" for the lender to open; guarantor reminders by default after N days;
automated SMS only if DEC-012 changes, through the same policy.

---

## LEN-13 — Dashboard section and reports

### 1. Product requirements

- FR-1 A **Lending section** on `/dashboard`, registered with `register_dashboard_section("lending",
  module="lending", permission="lending.report.read", selector=lending.selectors.dashboard, order=20)`
  (R8) and rendered through `features/reports/dashboardSections.ts` (a `dynamic()` entry), only when
  lending is enabled. The core "To collect" tile is unchanged (Σ positive balances, the true total,
  ADR-043); the lending section shows loan figures separately.
- FR-2 Tiles (R§7), each tapping through to the list it summarises:
  | Tile | Definition | Opens |
  |---|---|---|
  | Due today | count of loans with a due today not fully settled; amount = due today + arrears on those loans | Today |
  | Collected today | Σ lending collections today (not void); by mode; by agent | Collection register, today |
  | Shortfall today | Σ due today − Σ collected **against** today's dues (from `dues_settlement`) | Today, unpaid only |
  | Overdue | loans with arrears and Σ arrears; split 1–7, 8–30, 31–90, 90+ days past due | Arrears |
  | Active loans | count; principal outstanding; owed now | Loan list |
  | Disbursed this month | count; principal; cash handed over | Disbursal register |
  | Interest this month | interest **posted** and interest **collected**, side by side and labelled; late fees and waivers as a footnote | Loan book |
  | Closing this week | active loans with `maturity_on` within 7 days | Loan list, filtered |
  | Agent strip | per agent: due on their routes today, collected today, stops visited / stops due | My day of that agent |
- FR-3 **Five reports** registered with `register_report` (R9), each with a screen, CSV export and a
  print sheet, listed in the reports hub only when built:
  1. `lending.collection_sheet` — per route and date, in route order: position, borrower, mobile,
     loan number, due today, arrears, DPD, to collect, and blank **Collected** and **Note** columns,
     printable A4 for an agent working on paper.
  2. `lending.collection_register` — every collection in a date range: date and time, receipt number,
     borrower, loan, amount, modes, reference, agent, route, split (principal, interest, fee), status;
     totals by mode and by agent; voids included on request.
  3. `lending.arrears` — every active loan with arrears: loan, borrower, route, arrears, DPD, bucket,
     oldest unpaid due, last collection (date, amount), last visit outcome and promise date; totals by
     bucket.
  4. `lending.loan_book` — every loan (status filter, default active): loan, borrower, plan,
     disbursed on, principal, cash handed over, effective yearly rate, collected, principal
     outstanding, interest and fees owed, owed now, next due, DPD, status, route; totals.
  5. `lending.disbursal_register` — loans opened in a range: date, loan, borrower, plan, principal,
     each deduction, deductions total, cash handed over, modes and reference, voucher number,
     effective yearly rate; totals.
- FR-4 An agent never sees the dashboard section or any report except the **collection sheet of their
  own routes**; their summary is My day (LEN-08).

### 2. User flows

Owner opens the dashboard at 19:30 → Lending: "Collected today ₹84,200 of ₹96,000 due · Shortfall
₹11,800" → the agent strip shows Ramesh 38/43 stops → taps Ramesh → his My day → the not-visited list.
Accountant at month end → Reports → Loan book → Export CSV.

### 3. Features

| MVP | Later |
|---|---|
| Dashboard section, nine tiles | Interest and charges report by month; agent performance; closed loans; yearly statement batch (R§8 Later-1) |
| Five reports with CSV and print | Expected collections forecast; cash position with handover (Later-2) |
| | "As of" a past date for arrears and the loan book |

### 4. Entities and relationships

Reads only: `lending_loan`, `lending_collection`, `lending_visit`, `dues_due`, `dues_settlement`,
`payments_payment`, `ledger_entry` (interest posted: `entry_type='interest'`, bucket `loan`, source
`dues_component` of lending schedules).

### 5. Database

No table. Report selectors live in `apps/lending/selectors/reports.py` and are registered from
`LendingConfig.ready()`, so `reports` never imports `lending` (10-architecture §3). Each selector is
one grouped query over the indexes already listed (LEN-04 §5, LEN-06 §5, LEN-08 §5, the engine's
`(tenant, module, status, due_on)`); the dashboard selector is at most six statements.

### 6. API

| Method and path | Codename | Result |
|---|---|---|
| `GET /reports/dashboard` (existing, extended by A10) | per section | `sections: [{key: "lending", module: "lending", data: {...tiles}}]` |
| `GET /reports` (existing) | per report | lists the five with `label_id` |
| the report route of the reports registry (named by the core FRD), `?format=json\|csv` and each report's filters | `lending.report.read` (collection sheet: `lending.route.read`, scoped); CSV needs `lending.report.export` | rows + `meta.totals` |

Filters: collection sheet `route_id` (required), `date` (default today); register `date_from`,
`date_to` (≤ 366 days), `collected_by`, `route_id`, `mode`, `loan_id`, `include_void`; arrears
`route_id`, `agent_id`, `bucket`; loan book `status`, `route_id`, `plan_type`; disbursal register
`date_from`, `date_to`.

### 7. Frontend

`LendingDashboardSection` (tiles with `UbStatCard`, the agent strip as a compact list),
`CollectionSheetReport`, `CollectionRegisterReport` (reuses LEN-06's page), `ArrearsReport` (LEN-08's
page), `LoanBookReport`, `DisbursalRegisterReport`, each with a print sheet under `print/`.
`lendingReportService.ts`; slices `lendingDashboardSlice`, `lendingReportSlice` (lazy).

### 8. UI/UX

- Phone: tiles stack two per row; the agent strip is a list below; figures use `UbAmount` with
  labels, never colour alone. Interest posted and collected always appear together with their labels
  ("Interest posted ₹18,400 · collected ₹15,900") so neither is read as profit.
- The collection sheet prints with the route name, date, lender name and licence number in the
  header, and the blank columns wide enough to write in.

### 9. Validation and business rules

- BR-1 All tiles and reports use the §0.4 definitions; totals are over the filtered set.
- BR-2 *Shortfall today* counts only money settled against **today's** dues, so an arrears collection
  does not hide today's shortfall.
- BR-3 *Interest posted* = Σ `interest` lines of lending sources this month; *interest collected* = Σ
  `dues_settlement.component = 'interest'` of recorded payments this month.
- BR-4 Reports never include ID fields, notes or guarantor mobiles; the collection sheet includes the
  borrower's mobile (an agent needs it).
- BR-5 Nothing here shares data outside the tenant: no report has a public link, and no report ranks,
  scores or labels borrowers (G-2, G-3).

### 10. Permissions

| View | Codename | OW | AD | ST | AG | AC |
|---|---|---|---|---|---|---|
| Dashboard section, reports 2–5 | `lending.report.read` | yes | yes | no | no | yes |
| Collection sheet | `lending.route.read` (scoped) | yes | yes | yes | own routes | yes |
| CSV export | `lending.report.export` | yes | yes | no | no | yes |

### 11. Reports

This feature is the reports.

### 12. Testing

- T-LEN-13-1 (API) each tile equals an independent query over the same rows for a seeded tenant
  (three routes, two agents, forty loans, a month of collections and voids).
- T-LEN-13-2 (API) *Shortfall today* with a collection that pays only arrears is unchanged.
- T-LEN-13-3 (API) an agent calling the dashboard or any report other than their collection sheet →
  403; their collection sheet for another route → 404.
- T-LEN-13-4 (API) CSV columns equal the JSON rows; totals row present; no ID or note column.
- T-LEN-13-5 (perf) each report's `EXPLAIN` for a 2,000-loan tenant uses the listed indexes.
- T-LEN-13-6 (architecture) `reports` imports nothing from `lending` (the registry is filled by
  `ready()`).

### 13. Edge cases

1. EC-1 A tenant with lending and a shop → the core tiles are unchanged; the lending section sits below
   them; aging stays trade-only (ADR-043).
2. EC-2 A collection voided after the day → yesterday's register shows it as void when voids are
   included; today's tiles are unaffected.
3. EC-3 An agent removed from a route → the strip shows their collections today under their name, with
   "0 stops due".

### 14. Future

Interest and charges by month, agent performance, closed loans, yearly statements batch, forecast, cash
position, "as of" dates.

---

## LEN-14 — Legal guardrails as testable rules

### 1. Product requirements

The research's legal findings (R§15) become **rules the code can be tested against**. This is not
legal advice and does not claim the module makes a lender compliant; it records what the product
must and must not do. Items needing a lawyer or a CA are in §B.

| # | Rule | Enforced by | Test |
|---|---|---|---|
| **G-1** | **No moving money.** No gateway, payout, auto-debit, e-mandate, NACH, escrow or bank integration. The UPI QR is local and pays the lender directly. Copy never says money was "sent", "transferred" or "disbursed to the account". | Architecture: `apps/lending` has no outbound network code; copy review | T-LEN-14-1: an AST scan of `apps/lending` fails on any import of `requests`, `httpx`, `urllib.request`, `http.client`, `socket`, `smtplib`, or a payments-provider module; T-LEN-14-4 scans copy |
| **G-2** | **No credit scoring.** No score, rating, grade, risk band, eligibility, approval suggestion or ranking of borrowers or guarantors; no bureau pull; no cross-tenant borrower data. Sorting by DPD or arrears is a list order, not a label. | Schema and serializer review | T-LEN-14-2: no lending model field, serializer field, report column or catalogue key matches `score\|rating\|grade\|risk\|eligib\|approv\|blacklist\|defaulter\|cibil\|creditworth`; every lending query is tenant-scoped (the existing route-coverage and tenant-scoping architecture tests extended to `apps/lending`) |
| **G-3** | **No defaulter sharing.** No public list, no share link for arrears or any list, no cross-tenant lookup, no export outside the tenant's own export; reminders only to the borrower or guarantor (LEN-12). | Routes, permissions | T-LEN-14-3: the route-coverage test lists **no** public lending route; no lending report or list has a share action; the only lending documents with a share arm are the four of LEN-11, each about one borrower's own loan and sent by the lender's own phone |
| **G-4** | **No claim that a rate is legal.** No copy, document, tooltip, error or report says a rate, charge or practice is legal, lawful, illegal, permitted, allowed, approved, within limits, compliant or RBI-approved. | Copy test | T-LEN-14-4: every string in `lending.{en,hi}.json`, the server-rendered share texts and the print components is scanned for `legal\|lawful\|illegal\|permitted\|allowed rate\|approved\|within (the )?limit\|compliant\|compliance\|RBI` and their Hindi equivalents (`कानूनी`, `गैरकानूनी`, `वैध`, `अवैध`, `मान्य`, `अनुमत`); an allow-list holds the one neutral licence notice (LEN-01 FR-5), which names no law |
| **G-5** | **Rate-ceiling warning.** A tenant-set ceiling on the effective yearly rate, empty by default; above it, saving needs an explicit, audited confirmation; the wording names no law or state. | LEN-01 FR-6, LEN-03 BR-12 | T-LEN-03-6, T-LEN-14-5 (the confirmation writes `lending.loan.rate_warning_confirmed` with both figures) |
| **G-6** | **Simple interest only; nothing compounds.** Interest is computed on principal (flat, interest-only) or on principal outstanding (reducing), never on unpaid interest; late fees are charges, never interest, and never earn interest or late fees. | Calculator, late-fee calculator | T-LEN-09-2; T-LEN-14-6: for generated loans, no interest or late-fee component's base includes an interest, fee or late-fee amount |
| **G-7** | **Charges only as declared.** A late fee or foreclosure charge only when the loan's terms declared it at creation. | LEN-09 FR-1, LEN-10 BR-3 | T-LEN-09-3; T-LEN-14-7: payoff has no foreclosure line when `foreclosure_kind = none` |
| **G-8** | **Disclosure on every loan.** The effective yearly rate, total interest, total payable, every deduction and the cash handed over are on the preview and the loan summary, with no opt-out; the rate is on all four documents. | LEN-03 FR-7, LEN-11 | T-LEN-11-2 |
| **G-9** | **A receipt for every collection**, numbered, available at save. | LEN-06 FR-8 | T-LEN-06-1 (every recorded collection has a receipt payload) |
| **G-10** | **Immutable history.** No edit or delete of money rows; corrections are voids and reversals with reasons; every action is audited. | Ledger trigger, payments void, audit | existing trigger tests; T-LEN-14-8: every lending state-changing service writes exactly one `lending.*` audit row |
| **G-11** | **Minimisation.** ID: type and last four characters only; no images; agents never see ID, guarantor details or terms; no GPS, photos of borrowers or device data. | ADR-053, LEN-02, LEN-07 BR-4 | T-LEN-02-2, T-LEN-02-3, T-LEN-07-6 |
| **G-12** | **Cash at or above ₹20,000** on a loan (disbursal, or collections on one loan in one day) shows a non-blocking warning to check with an accountant. | LEN-04 FR-8, LEN-06 FR-11 | T-LEN-14-10 |
| **G-13** | **Customer documents never name the product** or its domain. | LEN-11 BR-1 | T-LEN-11-1 |
| **G-14** | **Funders and deposits are out of scope.** Lending registers no `held_deposit` target, opens no deposit, and has no "investor", "depositor", "scheme", "returns" or "money borrowed" screen or copy (R§15.6; BUDS Act). | Scope | T-LEN-14-11: lending code never calls `apps.payments.services.deposits`; the copy scan rejects `investor\|depositor\|deposit scheme\|returns\|निवेशक\|जमा योजना` |
| **G-15** | **Fair collection.** Fixed polite templates; 08:00–19:00 tenant time; one reminder per loan per day; borrower or guarantor only; neutral visit outcomes; no contact import, device locking or group messages. | LEN-12, LEN-08 | T-LEN-12-1 … T-LEN-12-8, T-LEN-08-6 |
| **G-16** | **Licence number** printed when set; a single neutral notice when empty. | LEN-01 FR-5 | T-LEN-01-5 |

### 2. User flows

None of their own: each guardrail lives inside the flows of LEN-01 to LEN-13. The one visible flow is
the rate-ceiling confirmation (LEN-03 §2).

### 3. Features

| MVP | Later |
|---|---|
| G-1 to G-16 | A lawyer-reviewed default ceiling (L1); yearly statements (L13); retention purge (L3) |

### 4. Entities and relationships

None.

### 5. Database

None beyond the audit rows. The `lending_borrower.id_proof_last4` length CHECK is G-11's database
guard.

### 6. API

No endpoint. Guardrails appear as behaviour of LEN-01 to LEN-13's endpoints and as error codes
(`loan_rate_above_warning`, `late_fee_not_in_terms`, `reminder_outside_window`,
`reminder_cap_reached`).

### 7. Frontend

`tests/lending/lendingCopyMakesNoLegalClaim.test.ts` (G-4, G-14 copy),
`tests/lending/lendingDocumentsCarryNoProductName.test.tsx` (or the extension of the existing test,
G-13), and the forbidden-words template test (server side, G-15).

### 8. UI/UX

Guardrails are quiet: a disabled button with its reason, a warning banner with a neutral sentence, a
missing action. The product never lectures the lender and never mentions penalties, police or courts
to them either.

### 9. Validation and business rules

Each row of §1 is a business rule. Where a rule and a lender's request conflict (a free-text
reminder, a compounding late fee, a 21:00 call), the rule wins and the product offers the nearest
allowed action ("Reminders can be sent from 8 am").

### 10. Permissions

No role can switch a guardrail off. The reminder window can be narrowed by the owner, never widened.

### 11. Reports

No report ranks, scores or labels borrowers (G-2); none is shareable outside the tenant (G-3).

### 12. Testing

- T-LEN-14-1 no outbound network code in `apps/lending` (AST, whole tree, deferred imports included).
- T-LEN-14-2 the scoring denylist over models, serializers, report columns and catalogue keys.
- T-LEN-14-3 no public lending route; no share action on lists or reports.
- T-LEN-14-4 the legal-claim copy scan (en and hi) over catalogues, share texts and print components.
- T-LEN-14-5 the ceiling confirmation is audited with both figures.
- T-LEN-14-6 no compounding: generated loans and late fees never take interest or fees into a base.
- T-LEN-14-7 no undeclared charge reaches a payoff or an instalment.
- T-LEN-14-8 one `lending.*` audit row per state-changing service call.
- T-LEN-14-9 **e2e `e2e/lending.mjs`** against the live stack (`./e2e/serve-api.sh && ./e2e/serve.sh`,
  with `UB_UNRELEASED_MODULES=1`), asserting **who is signed in before anything else** at every role
  switch (the CLAUDE.md harness lesson):
  1. sign up an owner; switch lending on; set a warning rate of 36%;
  2. create route "Market road" and an agent account (temporary password shown once);
  3. create borrower Sunita Devi inline; preview F1 → schedule Σ ₹24,000.00, effective yearly rate
     41.8%, the 36% warning shown; confirm; save → voucher `PAYOUT/…`, party balance ₹20,000.00;
  4. create D1 on the same route → cash handed over ₹9,000.00, effective yearly rate 66.4%;
  5. sign in as the agent → `/auth/me` is the agent → Today shows two stops in route order; open a loan
     id from another route → 404;
  6. collect in **two taps** (Collect, Save) → receipt number shown → Share opens a `wa.me` link whose
     text names the shop and not the product;
  7. *Not paid* → *Not at home* on the second stop → it moves to Done;
  8. void own collection within the window → dues reopen; sign in as the owner → the loan is active;
  9. reminder guardrail: set the tenant timezone so that local time is outside 08:00–19:00 → Remind is
     disabled with the reason and `POST …/reminders` → 409; set it back → one reminder → a second →
     409 `reminder_cap_reached`;
  10. close early F1 → payoff equals the API's quote → closure letter prints with the shop name;
  11. write off D1 as the owner → Today no longer lists it; an admin's write-off → 403;
  12. dashboard section tiles equal the API's figures.
  **`node e2e/lending.mjs --shots`** sweeps, into `/tmp/e2e-shots/lending`, at **360 × 780, 390 × 844,
  768 × 1024 and 1280 × 800**: the new-loan stepper (each step, the preview with and without the
  warning, the backdated dialog), the loan page (each tab; active, closed, written off), Today (empty,
  one route, three routes, with a Done group, an 80-stop route), the collection sheet (on open,
  filled, part, advance, over payoff, network failure), Not paid, My day, Arrears, the reminder sheet
  (allowed, outside the window, capped), the payoff sheet, each print document, the dashboard section
  and each report. Every image passes the **measuring checks**: page `scrollWidth` ≤ viewport width,
  and every text node inside its own box (the checks that found the defects every unit test passed,
  CLAUDE.md). The sheet-on-open image proves no field opens in the error state.
- T-LEN-14-10 cash warning at ₹19,999.99 absent, at ₹20,000.00 present, for a disbursal and for the
  day's collections on one loan.
- T-LEN-14-11 no deposits or funders: code and copy scans.

### 13. Edge cases

1. EC-1 A lender asks for compound interest → not offered; there is no setting.
2. EC-2 A lender types "police" into a visit note → allowed (it is the lender's own private note, never
   sent); templates are what the borrower receives, and they are fixed.
3. EC-3 A registered NBFC tenant bound by RBI's rules → the guardrails are a subset of fair practice;
   the product claims nothing more (L6).

### 14. Future

A lawyer-reviewed default ceiling and wording; yearly statements; retention and erasure after
closure + N years; "Money borrowed" only after a lawyer's review of the BUDS Act exclusions (R§15.6),
never as "deposits" or "investments".

---

## A. Defaults the owner may change

Every default below is a tenant setting (Settings → Lending) unless marked. A loan snapshots the
first three at creation (LEN-04 BR-6). **Allocation order is the owner's decision to confirm**
(10-architecture §16 item 3; R§18 Q6).

| Setting | Default | Choices | Why this default | Changed by |
|---|---|---|---|---|
| `lending.allocation_order` | **`fees_last`** | `fees_last`, `oldest_first`, `fees_first` | Borrower-fair: a late fee never keeps an instalment unpaid or lengthens days past due (LEN-06 C3). `fees_first` is common lender practice and is offered, not recommended | owner, admin |
| `lending.early_closure_rule` | `interest_to_date` | `interest_to_date`, `full_contracted`, `owner_decides` | The borrower pays for the time they had the money (R§18 Q7) | owner, admin |
| `lending.rounding_rule` | `paise` | `paise`, `rupee_up`, `ten_up` | Exact; agents on daily plans type round per-day amounts anyway (R§18 Q13) | owner, admin |
| `lending.rate_ceiling` | **empty** (no warning) | 0.01–999.99 % a year | A default figure would read as legal advice (R§18 Q1; L1) | owner, admin |
| `lending.licence` | empty | number ≤ 40, authority ≤ 80 | Only the lender knows it | owner, admin |
| `reminders.lending.window` | 08:00–19:00 | any narrower window in 15-minute steps | RBI fair-practice hours (R§15.2); never wider | owner, admin |
| `lending.agent_void_minutes` | 15 | 0–60 (0 = agents cannot void) | Typo recovery without a fraud window (R§18 Q8) | owner |
| `lending.visit_edit_minutes` | 15 | 0–60 | Same | owner |
| `lending.waiver_by_admin` | off | on, off | Waivers reduce what is owed: a business ceiling (R§12) | owner |
| New-loan form: collection weekdays for daily plans | Monday–Saturday | any non-empty set | The common route week (R§6.4) | per loan |
| New-loan form: late-fee rule | none | `flat_once`, `per_day` + cap, `simple_interest` + cap; grace 0–90 | No charge unless agreed (G-7) | per loan |
| New-loan form: foreclosure charge | none | flat ₹, or % of principal outstanding | No charge unless agreed | per loan |
| Staff may create loans | no | granted per member (`Membership.permissions_override` + `lending.loan.create`) | Exposure control (R§18 Q9) | owner |
| `lending_agent` codenames | as LEN-07 §10 | none (a system role) | Scope is structural (ADR-052) | — |
| Cash warning threshold | ₹20,000 | **not a setting** | It restates a tax rule; a CA reviews the wording (L7) | — |

---

## B. Legal review items (for a lawyer or CA)

This FRD records what the product does; these items need a professional's view **before release**
(the module stays in `UNRELEASED_MODULES` until then). None is decided here.

| # | Item | Why | Reviewer | Blocks release? |
|---|---|---|---|---|
| L1 | Whether to ship any default rate-ceiling figure, and the exact warning sentence (LEN-01 FR-6, LEN-03 §8) | A figure or a state name could read as legal advice; no figure leaves lenders unwarned | Lawyer | No (ships empty) |
| L2 | The "not a loan agreement" line on the loan summary, and whether any no-advice sentence is needed on settings (LEN-11 FR-2) | The product must not look like it drafts agreements (R§15.7) | Lawyer | Yes |
| L3 | Retention after closure and erasure requests: keep financial rows while statutory periods run; purge ID fields and addresses after closure + N years (R§15.5) | DPDP Act versus state book-keeping duties and limitation periods | Lawyer | No (no purge in MVP) |
| L4 | Processor terms (DPA): the tenant is the data fiduciary for borrower data, YourKhata the processor | DPDP Act roles | Lawyer | Yes |
| L5 | Confirm funders and "money borrowed" stay out of scope; any future wording under the BUDS Act relatives exclusion (G-14) | Deposit-taking bans | Lawyer | No |
| L6 | Serving unregistered lenders in states that require registration (e.g. Karnataka 2025, loans by unregistered lenders treated as discharged); whether lending sign-up should ask for a licence number | Platform exposure | Lawyer | Yes |
| L7 | The ₹20,000 cash warning's wording and section references after the Income-tax Act 2025 renumbering (s.269SS/269T and their penalties) (G-12) | Tax rule, cited to lenders | **CA** | Yes |
| L8 | The effective-yearly-rate method: actual calendar days, nominal, periodic × periods a year (LEN-03 BR-9). D1 shows 66.4% this way and 78% counting collection days (R§6.4). Which figure, and whether to add "interest as % of cash handed over" in words for fixed plans | Disclosure accuracy (the RBI APR idea) | Lawyer and CA | Yes |
| L9 | Reminder templates in en and hi, the guarantor template, and the forbidden-words list (LEN-12) | Anti-harassment provisions in state Acts (R§15.1) | Lawyer | Yes |
| L10 | The closure letter's sentence "Nothing further is payable under this loan" (LEN-11 §9.4) | A document the borrower may rely on | Lawyer | Yes |
| L11 | Write-off wording and whether a written-off balance may later be collected and how it is shown (LEN-10 §14) | Recovery after write-off; fair practice | Lawyer and CA | No |
| L12 | Recording "ration card" and other ID kinds by last four characters; whether any kind should be excluded (LEN-02) | Aadhaar Act and DPDP minimisation | Lawyer | No |
| L13 | Yearly statements to each borrower (Gujarat Form 15 within 30 days of year end; Maharashtra s.24–25) — whether the Later-1 batch must be in the MVP for some tenants | Statutory duty for licensed lenders | Lawyer | No (Later-1) |
| L14 | The neutral "interest and deductions add up to more than the amount lent" line (LEN-03 FR-9), given Acts that cap total interest at the principal | Could be read as advice; could be expected | Lawyer | No |
| L15 | Fixed daily plans above a state's notified rate being an offence in some states (Tamil Nadu 2003, Kerala 2012) — whether the product should say anything beyond showing the rate (it currently says nothing) | The product never says a rate is legal or illegal (G-4) | Lawyer | No |

---

## C. Contract questions

Contradictions or gaps against [11-contracts.md](../11-contracts.md) and the ADRs. This FRD does
**not** change the contracts; each item is for the architecture owner, with what the FRD assumes
meanwhile.

| # | Contract says | Lending needs | FRD assumes until answered |
|---|---|---|---|
| CQ-1 | §2.1: the dues engine registers `register_reminder_source("dues_due", …)`, one candidate **per due**; §1.6: lending registers `daily_cap_per_source=1` | ADR-054 and R§15.4 say **one reminder per loan per day**. With per-due sources a loan with three overdue instalments yields three reminders a day, and the cap is per due | Lending registers its own source `lending_loan` (one candidate per loan); the dues engine's `dues_due` source **skips subjects whose module registered its own source** (a flag on `register_subject`, e.g. `own_reminder_source=True`). Cap per source = per loan |
| CQ-2 | §1.6: `ReminderCandidate.recipient_party_id` exists, but `ledger_reminder` gains no recipient column; the reminder's `party` is the one reminded | A reminder to the **guarantor** about the borrower's loan must record both: whose loan, and who was contacted | Add `recipient_party_id uuid null` to `ledger_reminder` (null = the party). Until then guarantor reminders are **not built** and LEN-12 FR-6's guarantor arm moves to Later |
| CQ-3 | §2.1: `end_schedule(on, reason, leave_policy, custom_amount) -> Settlement` is shaped for memberships (refunds, credits); `cancel_schedule` reverses postings | A **write-off** must stop an expectation-mode schedule — scheduled dues cancelled, open dues closed — **without reversing** posted interest and fees (the vertical posts one offsetting `lending_waiver` credit) | `end_schedule(…, reason="written_off")` on an expectation schedule cancels scheduled dues, sets open dues `cancelled` with `cancel_reason`, posts nothing and reverses nothing. Fallback if refused: `dues.waive` every open component of every due (many ledger lines) then `end_schedule` |
| CQ-4 | §2.1: `reschedule(schedule_id, from_seq, supplied, reason)`; nothing on settlements of replaced dues or on posting a supplied due dated today | **Early closure** replaces future dues with one closure due dated today; it must (a) post the closure due's interest and fee **in the same transaction** (it is due now), and (b) **carry** settlements already made on replaced dues (paid in advance) onto it, interest → principal → fee, capped per component, re-pointing `dues_settlement` and `payments_allocation` | Both, as LEN-10 BR-2 and example P3 describe. Without (b), early closure is refused while any replaced due holds a settlement |
| CQ-5 | §1.2 registers `lending_charge` (`charge`, bucket `loan`) | Every collectible lending charge must sit **on a due**, because collections allocate only to `dues_instalment` targets and an unallocated payment is `main` bucket (§1.4). A loan-level `lending_charge` could never be collected into the `loan` bucket | MVP late fees are `dues.add_penalty`; foreclosure charges are the closure due's `fee` component. `lending_charge` is registered but unused; drop it, or give it a collectible target |
| CQ-6 | §2.1: `arrears(...) -> {overdue_amount, oldest_due_on, days_past_due}` | Under `fees_last`, a due whose only remainder is a late fee must **not** set days past due, or the default order does not deliver its purpose (LEN-06 C2, C3) | `arrears()` computes DPD from the oldest due with unpaid **principal or interest** components, and reports fee-only remainders as `fees_overdue` |
| CQ-7 | §3: the agent scope is "loans on the agent's routes (`lending_route.agent_user_ids`)" | Referential integrity for agents (a removed member) and an index for the scope filter | A join table `lending_route_agent (route, user)`; the scope semantics are identical |
| CQ-8 | §1.6 names the setting `reminders.<module>.window`; no contract says how a module's settings keys register (`settings_schema.SETTINGS` is a literal in `platform_app`) | Lending's nine `lending.*` keys with validators | A `register_setting_spec(spec)` registry in `platform_app` (validators are pure functions owned by the module), or the keys added to the core catalogue by the lending CR if the owner prefers literals |
| CQ-9 | §2.1: `closed_day_rule ('move'\|'skip'\|'ignore')`; `skip` is undefined for count-based plans | A daily plan of 100 collections over a closed day must still have **100** collections (LEN-03 BR-7, D1) | `skip` on a plan with `count` keeps the count (the occurrence is dropped and the schedule extends) |
| CQ-10 | §2.1 lists `add_penalty` and `waive`, and the audit action `dues.adjustment.reversed`, but no reversal service | Removing a late fee added by mistake reads better as a reversal than as a waiver | `dues.reverse_adjustment(ctx, adjustment_id, reason)`; until then a mistaken fee is waived (LEN-09 FR-6) |
| CQ-11 | §2.1: `add_penalty` "checks plan cap"; lending plans use `penalty_kind='none'` so the engine never auto-posts | Lending owns late-fee rules and caps (the engine "does not know the law", ADR-048) | `add_penalty` is permitted on a `penalty_kind='none'` plan with no engine cap; the daily run never posts penalties for such plans |
| CQ-12 | §3 lists the module role; canon §0.9's `staff` set is fixed in `permissions_registry.py` | Office staff should record collections and read loans without being agents | The lending CR adds the LEN-07 §10 codenames to `_STAFF` (a canon amendment alongside the module role) |
| CQ-13 | §1.2: "Statement shows every bucket"; LED-04's statement is per party | A **per-loan** statement over `loan_ledger(loan)`, with LED-04's carried-forward paging | Lending builds its own selector over the ledger (read-only, allowed: `lending` may import `ledger` selectors); asks whether the core statement selector should accept a source filter instead |
| CQ-14 | 10-architecture §6 item 7: a vertical may not import `features/sales`; `features/payments/…/PaymentReceiptPrint.tsx` imports `UbQrCode` and `PrintBranding` from `features/sales` | Lending's receipt needs both | Move them to the design system and `src/print` (TSK-LEN-05) before lending's print work |
| CQ-15 | ADR-052: an agent's role holds no `reports.*`; the post-login landing today is the dashboard | An agent must land on Today | The core routes a member to the first nav item they can see when they lack the dashboard's permission |

---

## D. Implementation task list

Ordered. Sizes: **S** ≤ 1 day, **M** 2–3 days, **L** 4–6 days. "Needs" names the core and engine
items by their 10-architecture §13 and 11-contracts names; `frd/00-core-and-engines.md` specifies
them.

| # | Task | Size | Needs |
|---|---|---|---|
| TSK-LEN-01 | `apps/lending` skeleton: app, `ModuleCode.LENDING` in `UNRELEASED_MODULES`, `MODULE_DEPENDENCIES`/`ENGINES_USED_BY` entries, `tenant_data.py`, import-matrix line and the deferred-import test, error codes, audit actions, codenames in `permissions_registry.py`, locales `lending.{en,hi}.json` | M | A1 release gate; A11 import test |
| TSK-LEN-02 | `lending_agent` module role and `ScopedViewSetMixin` use; `lending.*` codenames on `staff` and `accountant` (CR) | M | 11-contracts §3 (`apps/common/scoping.py`); CQ-12; owner's confirmation of module roles |
| TSK-LEN-03 | Settings keys and the settings screen; licence notice; module intro panel | S | CQ-8 (settings registration); A7 policy setting `reminders.lending.window` |
| TSK-LEN-04 | `lending_borrower`, party roles, archive guard, party page panel | M | A6 (`register_party_role`, `register_archive_guard`, frontend `modulePanels.ts`) |
| TSK-LEN-05 | Move `UbQrCode` and `PrintBranding` out of `features/sales` (design system and `src/print`) | S | — (frontend refactor; CQ-14) |
| TSK-LEN-06 | The calculator: four plans, rounding, invariants, effective yearly rate (Decimal bisection), late-fee calculator; the property tests T-LEN-03-2, T-LEN-09-2 | L | A9 (`split_total`, `round_amount`, `Recurrence`, calendar); dues `preview_schedule` |
| TSK-LEN-07 | `POST /lending/loans/preview` and the Terms step UI | M | TSK-LEN-06 |
| TSK-LEN-08 | Loan create: `lending_loan`, deductions, per-loan dues plan and schedule (expectation), deduction postings, disbursal payment, loan number; `LendingLoanTarget`; posting sources; source resolvers; subject registration; the stepper UI | L | A2 (bucket, `register_posting_source`, `CHARGE`), A3 (`loan_balance`), A4 (target protocol v2), A8 (`register_number_kind`), **dues engine expectation mode with components**; TSK-LEN-04, -07 |
| TSK-LEN-09 | Loan list and loan page (four tabs), `loan_ledger` selector | M | TSK-LEN-08 |
| TSK-LEN-10 | Collections: `lending_collection`, allocation preview, record (via `dues.plan_allocation` + `record_payment`), void with the agent window, `on_due_changed` hook (close/reopen), collection sheet UI, register | L | A4; dues `dues_instalment` target with `dues_settlement` split and the three orders; CQ-6; TSK-LEN-08 |
| TSK-LEN-11 | The replay property test (T-LEN-06-2) and the `recalc_balances` check for `loan_balance` | M | A3 replay; TSK-LEN-10 |
| TSK-LEN-12 | Routes, route agents, stops, scoping on every lending viewset, reduced serializers | M | TSK-LEN-02, -08 |
| TSK-LEN-13 | Today, My day, Arrears, visit notes; the `EXPLAIN` tests | M | TSK-LEN-10, -12 |
| TSK-LEN-14 | Late fees and waivers | M | dues `add_penalty`, `waive`; CQ-11 (CQ-10 optional) |
| TSK-LEN-15 | Closure: normal (hook), early (payoff, `reschedule` into a closure due, carried settlements), write-off, cancel, reopen | L | dues `payoff`, `reschedule`, `end_schedule`, `cancel_schedule`; CQ-3, CQ-4; TSK-LEN-10, -14 |
| TSK-LEN-16 | Documents: loan summary, receipt (A5, 80 mm, share text), statement (JSON, CSV, print), closure letter; the no-product-name and effective-rate tests | L | TSK-LEN-05, -10, -15; CQ-13 |
| TSK-LEN-17 | Reminders: `lending_loan` source, policy, templates en/hi, forbidden-words test, the lending reminder endpoints and sheet; guardrail tests T-LEN-12-1 … 7 | M | A7 (source link, `DUE` kind, `register_reminder_source`, `register_reminder_policy`, `check_reminder_allowed`); CQ-1; CQ-2 for the guarantor arm |
| TSK-LEN-18 | Dashboard section and the five reports with CSV and print | M | A10 (`register_dashboard_section`, `register_report`, frontend `dashboardSections.ts`); TSK-LEN-10, -13 |
| TSK-LEN-19 | Legal-guardrail tests T-LEN-14-1 … 11 (AST network scan, scoring denylist, copy scans, deposits scan) | S | TSK-LEN-01 … -18 |
| TSK-LEN-20 | Navigation rows, routes in `ROUTES`, `GUARDED_ROUTE_PREFIXES`, `CRAWL_DISALLOW`; `MODULE_CODES` replaced by the server's list with the equality test; agent landing (CQ-15) | S | A1; TSK-LEN-13 |
| TSK-LEN-21 | `e2e/lending.mjs` and the `--shots` sweep at four widths with the measuring checks; fix what the sweep finds | L | everything above, on a live stack |
| TSK-LEN-22 | Release CR (after §B's blocking items are answered): remove from `UNRELEASED_MODULES`; data migration adding `lending` to plans and partners; `STATUS.md` pre-launch checklist | S | §B L2, L4, L6, L7, L8, L9, L10 |

Critical path: Wave A (A1–A4, A6–A10) and the dues engine's expectation mode → TSK-LEN-06 → -08 →
-10 → -15 → -16 → -21 → -22. TSK-LEN-04, -05, -12 and -17 can run beside it.

---

## E. Out of scope, and why

| Out | Why | Record |
|---|---|---|
| Funders, "money borrowed", deposits, investors, pooled schemes | BUDS Act 2019: accepting deposits under an unregistered scheme is banned; a feature of that shape would help a tenant run one | R§15.6; G-14; L5 |
| Moving money: gateways, payouts, auto-debit, NACH, e-mandate, escrow | The product records; it does not lend or collect | vision §4; R§15.7; G-1 |
| Credit scoring, ratings, bureau pulls, shared borrower lists, defaulter lists | Not the product's role; privacy; harassment risk | R§15.7; G-2, G-3 |
| Compound interest; penal interest | Several Acts allow simple interest only; RBI treats penalties as charges, never compounded | R§15.1–15.3; G-6 |
| Open loans with daily accrual; top-up; reschedule; loan import; yearly statements batch | Later-1 (R§17.3) | LEN-03, -04, -10, -11 §14 |
| Offline collection; thermal-printer direct print; agent handover; forecast | Later-2, each needing an ADR or a design (R§17.4) | LEN-06, -08 §14 |
| Pawn, gold loans, collateral tracking; chit funds; group lending; origination and KYC | Separately regulated or out of the register's job (R§1) | R§1 |
| Device locking, contact scraping, product-sent messages | Never (R§17.5); DEC-012 | G-15 |
| Switching lending off with active loans | One rule for every module (10-architecture §9), overriding R§13 EC-13 | LEN-01 FR-3 |

**End of the Lending & collections FRD.**
