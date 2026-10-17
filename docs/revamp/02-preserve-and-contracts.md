# 02 · What must not change: functionality and backend contracts

Status: **binding for the whole revamp**, 17 Oct 2026. Source: read-only audit of `backend/` and `frontend/` at 31784ab.

Library and Lending are live and used by paying customers. For them, everything in §2 and §3 is a **fixed contract**: the redesign may change how a screen looks and is arranged, and nothing else. A change to anything listed here needs a written proposal in [08](08-backend-change-proposals.md) and the owner's approval before any work.

## 1. Rules for every module

1. All API calls stay under `/api/v1/`, no trailing slashes, envelope `{data, meta}`. The revamp adds no endpoint unless 08 approves it.
2. The client keeps sending `Idempotency-Key` where it does today (`src/api/AxiosInstances.ts:118-133`) and `X-CSRF-Token` on writes.
3. Each app reads its own book (DEC-019). A screen shows a person's money only from the book of the app it is in.
4. Customers and suppliers stay separate; nothing nets two balances without an explicit settlement.
5. Errors keep coming through the global snackbar; no request id is shown (owner, 7 Oct).
6. Nothing a merchant's customer receives (prints, PDFs, `/d/`, `/pay/`, `/in/`, message texts) names the product or its domain.
7. Who can see and do what follows the session's `permissions[]` and `accessible_apps`; the revamp never hides a permission check behind a design change, and never shows an action a role can't use.
8. Existing URLs keep working. A route that moves gets a redirect, so bookmarks, installed shortcuts and links in messages survive.

## 2. Library — frozen

### Screens that exist (16 routes) — all keep their data and actions
`/library` (home), `/library/counter`, `/library/members`, `/library/members/[membershipId]`, `/library/seats`, `/library/fees`, `/library/attendance`, `/library/messages`, `/library/money`, `/library/settings`, `/library/catalogue`, `/library/catalogue/[titleId]`, `/library/catalogue/categories`, `/library/catalogue/locations`, `/library/copies`, `/library/copies/[copyId]`; public `/in/[token]` (self check-in).
Dialogs and drawers keep their fields and validations: `EnrolMemberDrawer`, `MemberEditDrawer`, `MemberDetailDrawer`, `SeatSetupDrawer`, `BulkMessageDrawer`, `CatalogueDrawers`, `ChargeDialogs`, `PlanDialog`, `SeatDialog`, `MemberActionDialog`, `MessageDialog`, `AttendanceOverrideDialog`, `RaiseNumberDialog`, `WithdrawCopyDialog`, `CheckInPosterDialog`.
Client code that is part of the contract: 14 slices, 12 thunk files, 11 services in `F/library/api/`, `libraryPaths.ts`, `libraryMapping.ts`, the validation schemas.

### Endpoints (all under `/library/`, gated by `ModuleEnabled("library")` + codename)
settings, numbering · titles, copies, lookup, categories, locations · membership-types, loan-rules · shifts, seats, seats/row, **seat-map** · attendance (+ out), checkin-poster, members/{id}/attendance, public/in/{token} · fee-reminders, messages/bulk, members/{id}/message/{kind}, members/{id}/messages · charges (+ waive, reverse) · **members** (+ renew, change-type, suspend, reactivate, close, rejoin, deposit receive/apply/refund, renew-all, summary, card, slip, overdue-notice, no-dues) · loans (+ renew, cancel, change-due, lost, replace, fine-preview), returns, due-date-preview · holds · overdue · verifications · home, fees/board, reports, profit, cards.

### Calculations the design must display exactly as returned, never recompute

| Rule | Where it lives |
|---|---|
| Seat day state free / partial / full; view state free / taken / other shift | `services/seats.py:424` |
| Shift overlap, overnight shifts, seat clash refusal `library_seat_taken` | `seats.py:43`, `:51`, `:371`, `:219` |
| Fee state: left, on_hold, overdue, part_paid, unpaid, no_fee, due_soon (7 days), paid | `seats.py:93`, `constants.py:304` |
| Member status: closed > suspended > expired > active | `services/members.py:76` |
| Validity = start + months − 1 day, month-end clamped | `members.py:95`, `:88` |
| Renewal start date; `library_plan_no_end` | `members.py:840` |
| Enrolment charges, existing-student path, fee collection oldest first, extra kept as advance | `members.py:650`, `:388` |
| Dues = open charges' amount due; borrowing blocks | `members.py:102`, `:166`; `loans.py:158` |
| Fines: closed days skipped, grace, rounding, cap | `services/fines.py:79`, `:64` |
| Due dates skip closed days | `due_dates.py:37`, `:64` |
| Fee reminder schedule 7/3/1 days before, 1/3/7 after; one per day | `fee_messages.py:82-84`; `reminders.py` |
| Check-in: block closed/suspended, warn expired/unpaid | `services/attendance.py:63` |
| Staff may only change seat, shift, locker on a member | `views/memberships.py:46` |

**Design rule that follows**: every Library figure on screen (dues, fee state, seat state, days left) is taken from the API field that already carries it. A design that needs a new figure (for example "fees due this week" on a tile) must either use a field that exists (`fees/board`, `home`, `fee-reminders`) or go to 08.

## 3. Lending — frozen

### Screens that exist (7 routes)
`/lending` (Today), `/lending/loans`, `/lending/loans/new`, `/lending/loans/[loanId]` (+ printable loan papers), `/lending/borrowers`, `/lending/routes`, `/lending/messages`.
Dialogs and drawers keep their fields and rules: `CollectDialog`, `CollectFromBorrowerDialog`, `NotPaidDialog`, `AdjustDueDialog`, `EndLoanDialog`, `BorrowerBlockDialog`, `MessageDialog`, `BorrowerDetailDrawer`, `BorrowerEditDrawer`, `BorrowerHeaderMenu`.
Client contract: `lendingService.ts`, `lendingMessageService.ts`, `lendingPaths.ts`, 4 slices, 2 thunk files, `lendingSchemas.ts`, `borrowerSplit.ts`, `lendingDisplay.ts`.

### Endpoints (all under `/lending/`, gated by `ModuleEnabled("lending")`)
loans/preview · loans (list, create — keyed `lending.loan.create`) · loans/{id} · borrowers (list, get, patch, block, unblock) · borrowers/{id}/collections/preview, borrowers/{id}/collections (keyed) · loans/{id}/dues/{due_id} · late-fees, waivers (keyed) · write-off (owner) · cancel · **today** · loans/{id}/collections/preview, loans/{id}/collections (keyed) · visits · collections/{id}/void · reminders, message/{kind} (+ preview) · routes, routes/{id}, routes/{id}/stops.

### Calculations the design must display exactly as returned

| Rule | Where |
|---|---|
| Plan validation: frequencies, count and rate caps, dates, deductions < principal | `services/calculator.py:107`, `:34`, `:43` |
| Due dates per frequency, closed days moved | `calculator.py:185`, `:170` |
| Flat, reducing (EMI), interest-only, fixed daily, flexible interest | `calculator.py:229`, `:258`, `:284`, `:292`, `:300` |
| Effective annual rate (IRR) | `calculator.py:318` |
| Every instalment ≥ ₹1; invariants | `calculator.py:373`, `:399` |
| Loan figures: due today, arrears, remaining, collected, days past due, next due | `services/loans.py:689`; `dues/services/settlement.py:75` |
| Collection cap = payoff; oldest first; auto-close early/completed | `collections.py:199`, `:54`, `:275-290` |
| Borrower split across loans: "now" amounts first, then "left" | `borrower_collections.py:60`, `:109-115` |
| Late fee kinds, grace, rounding, cap | `late_fees.py:66`, `:92` |
| Write-off amount must match; cancel refused after any collection | `closing.py:77`, `:118`, `:183` |
| Reminder buckets overdue → today → tomorrow, send window, daily cap | `messages.py:250`, `:454` |

**Design rule that follows**: the loan screen shows `figures` and `schedule[]` as given; the borrower screen shows `summary {loans, running, given, collected, left, late}` as given; "Collect" always shows the server's preview (`collections/preview`) before saving, as today.

## 4. Shop and Udhaar book — keep working

Shop and Udhaar can get UX improvements and, with approval, functional ones. These behaviours stay:
- Ledger entries are never edited or deleted; corrections are reversal + replacement (LED-03).
- Credit limit checks inside the write transaction; owner-only override.
- Opening balances posted once (LED-02).
- Statement running balance from the window function; closing equals the party balance (LED-04).
- Archive refused on any non-zero balance; archive is a status change.
- Invoice issue, credit-note issue, purchase bill record and stock adjustments **require** an idempotency key (`sales/views/invoices.py:47`, `credit_notes.py:49`, `purchases/views/bills.py:53`, `inventory/views/items.py:410`).
- Void rules in `sales/services/void.py` (payments detached, credit-note refusal).
- Draft recovery for bills (shop-ims 09).

## 5. App access contract

The design reads which apps a person can open only from `GET auth/me`: `apps[]`, `active_app`, `accessible_apps`, `permissions[]`, `active_tenant.enabled_modules`. Switching uses the existing `POST auth/switch-app`; adding or turning off an app uses `POST tenants/current/apps` (owner only). No new access logic in the client.

## 6. How we prove nothing changed (used in Phase 8)

| Proof | What it checks |
|---|---|
| API contract snapshot | record request/response shapes of every Library and Lending endpoint the client calls, before and after; diff must be empty |
| Existing backend tests | `apps/library/tests`, `apps/lending/tests`, full `pytest` — 100% pass |
| Existing e2e harnesses | journey, parties, ledger, statement, credit, tags, security, credentials, onboarding-apps, library/lending looks |
| Figure parity | for a seeded Library and Lending book, every figure on every old screen appears with the same value on the new screen |
| Desktop-unchanged gate | `e2e/desktop-unchanged.mjs` for screens not in the current phase |
