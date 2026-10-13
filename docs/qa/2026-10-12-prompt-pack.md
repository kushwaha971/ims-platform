# YourKhata — Claude Code fix prompts

Each section below is a complete, self-contained prompt. Paste ONE prompt at a time into Claude Code opened in the YourKhata repo (or point Claude Code at the individual file in `prompts/`).

Recommended order: P1 bugs → go-live features (F1, F2, F4/B51, F6, F8, F10, B26) → P2 bugs → UI/UX design-token pass (U9 first) → feedback → edge-case requirements.

## Index

| ID | Title | Type | Priority |
| --- | --- | --- | --- |
| B1 | Issuing a bill above stock on hand fails silently | Frontend/UI (+ small feature: stock hint) | P1 |
| B3 | Same person shows different amounts owed in Lending and Shop; Shop payments never reach the loan | Full-stack (needs product decision first) | P1 |
| B4 | Security deposit never charged when “Collect now” is off at admission | Full-stack (check request payload first; likely backend) | P1 |
| B47 | Signed-in user sent to Login after idle/reload although session is valid | Frontend/UI (auth bootstrap / 401 interceptor) — includes B2 | P1 |
| B50 | Mobile PWA slow to start and unresponsive to taps at first | Frontend/UI (performance) + infra | P1 |
| B5 | Renew on a no-expiry plan dead-ends with a meaningless error | Frontend/UI (+ backend error message) | P2 |
| B6 | “Please check the highlighted fields” with nothing highlighted (cross-field and server errors) | Frontend/UI | P2 |
| B7 | Raw translation key “validation.required” shown to users | Frontend/UI (i18n) | P2 |
| B8 | Invoice line discount over 100% accepted | Frontend/UI (API already rejects) | P2 |
| B9 | Library charges mislabelled on Shop party page | Frontend/UI (copy) | P2 |
| B10 | Shop expenses appear in Library profit report | Full-stack (data model + UI) | P2 |
| B11 | Back button after app switch shows wrong app context and wrong role tag | Frontend/UI (routing) | P2 |
| B12 | “To collect today” includes money collected in advance | Backend/API (aggregation) — verify where computed | P2 |
| B13 | Library counter keeps old session after Finish | Frontend/UI (state) | P2 |
| B14 | Negative amount silently turned positive | Frontend/UI (input) | P2 |
| B15 | Misleading or stale validation messages | Frontend/UI (validators) | P2 |
| B16 | Floating Feedback tab covers buttons, inputs and amounts | Frontend/UI (CSS) | P2 |
| B17 | Truncation and horizontal overflow at desktop width | Frontend/UI (CSS) | P2 |
| B18 | Layout shifts after load move click targets | Frontend/UI | P2 |
| B19 | Toasts cover page title and top actions | Frontend/UI | P2 |
| B20 | Internal jargon visible to users | Frontend/UI (copy) | P2 |
| B21 | Server 503s on prefetch and auth request bursts | Backend/infra (503) + Frontend (request loop) | P2 |
| B22 | Mobile counter shows selected member below the whole log | Frontend/UI | P2 |
| B23 | Mobile bottom nav label truncated (“Custome...”) | Frontend/UI | P2 |
| B24 | Add Library / Add Lending gives no feedback | Frontend/UI | P2 |
| B25 | Collapsed accordion renders an empty strip | Frontend/UI (CSS) | P2 |
| B26 | New student on a ₹0 / no-expiry plan shows “Paid”; plan auto-selected; fee status model | Full-stack (status rule + labels) | P2 |
| B27 | Import review totals include rows that will not be imported | Backend/API (summary) | P2 |
| B28 | Item with the same name as an existing item imported silently | Backend/API (validation) | P2 |
| B29 | Opening balance without direction defaults to “They owe me” | Backend/API (validation) | P2 |
| B30 | Formula-like text accepted as a name (CSV injection risk on export) | Backend/API (security) | P2 |
| B31 | Import status page stops updating | Frontend/UI (polling) | P2 |
| B32 | Imports are slow even for tiny files | Backend/API (performance) | P2 |
| B34 | Import review shows only the first 20 rows | Frontend/UI | P2 |
| B35 | Imported balances show “Last entry: Today” | Backend/API | P2 |
| B36 | Old dues headline does not match its own table | Full-stack | P2 |
| B37 | Payment dated before its bill is accepted | Backend/API (validation) | P2 |
| B38 | Back-dated sale before the item's opening stock date | Backend/API | P2 |
| B39 | Migrated opening balance can't be selected when recording a payment | Full-stack | P2 |
| B40 | Library “Plan till” can't be set in the past; “Joined” not editable | Frontend/UI + backend rule | P2 |
| B41 | Date pickers make old dates slow to reach | Frontend/UI | P2 |
| B42 | Hard reload of a Shop page can open it in Library navigation | Frontend/UI (app context) | P2 |
| B43 | Quantity box cuts decimals | Frontend/UI | P2 |
| B44 | Import button says “customers” for suppliers too | Frontend/UI (copy) | P2 |
| B45 | Past loan collections can only be recorded as today's cash | Full-stack | P2 |
| B46 | Changing “Money given on” doesn't move “First instalment on” | Frontend/UI | P2 |
| B48 | Sign in and Sign up pages open while already signed in | Frontend/UI (route guard) | P2 |
| B49 | Sign-in/sign-up page flashes before the app opens | Frontend/UI (auth bootstrap) | P2 |
| F1 | Back-dated admission for existing students (migration) | Feature (full-stack) | Go-live |
| F2 | Any amount and all payment modes at admission | Feature (frontend + API) | Go-live |
| F3 | Advance applied automatically at renewal | Feature (backend) | P2 |
| F4 | Reminders for any due, custom and bulk messages, templates, log | Feature (full-stack) | Go-live |
| F5 | Shift capacity and waitlist | Feature (full-stack) | P2 |
| F6 | Shift-aware seat map with occupancy indicators and a per-seat student list | Feature/UI (frontend + seat API) | P1 for Library |
| F7 | Attendance: several visits a day, auto check-out, out-of-shift warning | Feature | P2 |
| F8 | Migrate a running loan + holiday calendar | Feature (full-stack) | Go-live |
| F9 | Early closure (foreclosure) quote for loans | Feature | P2 |
| F10 | Import for every module with column mapping, partial import and undo | Feature (full-stack) | Go-live |
| F11 | Walk-in sale that can't be paid in full | Feature | P2 |
| F12 | Default first instalment = given date + 1 period | Feature/UX (frontend) | P2 |
| F13 | Historical GST rates for back-dated bills and stock | Feature (backend tax rules) | P2 |
| B33 | Import good rows and skip bad ones | Feature (full-stack) | P2 |
| B51 | Message any student/customer regardless of status | Feature + Frontend/UI | Go-live |
| U1 | Type scale too small | Frontend/UI (design tokens) | P2 |
| U2 | Menus behave differently (modal vs dropdown) | Frontend/UI | P2 |
| U3 | Mixed form controls and person pickers | Frontend/UI | P2 |
| U4 | Status colours don't match outcomes | Frontend/UI | P2 |
| U5 | Destructive items next to everyday ones in app switcher | Frontend/UI | P2 |
| U6 | Icon-only primary actions on mobile | Frontend/UI | P2 |
| U7 | Summary cards scroll sideways with no hint | Frontend/UI | P2 |
| U8 | Money hierarchy and visibility in lists | Frontend/UI | P2 |
| U9 | Design-token pass: radius, control heights, spacing, card padding, table rows | Frontend/UI (design system) | P2 |
| U10 | Mobile inputs and tap targets | Frontend/UI | P2 |
| U11 | Visible app switcher and per-app home | Frontend/UI | P2 |
| U12 | Person page: one money strip and one timeline across apps | Frontend/UI + API | P2 |
| U13 | Every action gives feedback; undo for money entries | Frontend/UI | P2 |
| U14 | Accessibility pass before launch | Frontend/UI | P2 |
| FB1 | Show the fee total before Admit | Frontend/UI | P2 |
| FB2 | “Processing fee” chip should prefill the description | Frontend/UI | P2 |
| FB3 | Receipt wording and original amount | Frontend/UI (copy) | P2 |
| FB4 | Counter helper text should follow the step | Frontend/UI (copy) | P2 |
| FB5 | Warn on very high effective yearly rate | Frontend/UI | P2 |
| FB6 | Add supplier inline from a purchase bill | Feature (frontend) | P2 |
| FB7 | Show where the unpaid remainder goes | Frontend/UI | P2 |
| FB8 | Out-of-stock notification wording | Frontend/UI (copy) | P2 |
| FB9 | Consistent mobile number masking | Frontend/UI (privacy) | P2 |
| FB10 | Overnight shift indicator | Frontend/UI | P2 |
| E-L3 | Admission booked for a future start date | Requirement (verify, then build) | P2 |
| E-L7 | Billing cycle: from join date or calendar month, optional pro-rata | Requirement (verify, then build) | P2 |
| E-L8 | Discount / concession per student | Requirement (verify, then build) | P2 |
| E-L9 | Duplicate student (same mobile) | Requirement (verify, then build) | P2 |
| E-L10 | Guardian mobile required when student has none | Requirement (verify, then build) | P2 |
| E-L12 | Change plan or shift mid-term | Requirement (verify, then build) | P2 |
| E-L14 | Renew pressed twice / early renewal | Requirement (verify, then build) | P2 |
| E-L15 | Arrears for skipped periods | Requirement (verify, then build) | P2 |
| E-L16 | Plan price change | Requirement (verify, then build) | P2 |
| E-L17 | Pause / put on hold | Requirement (verify, then build) | P2 |
| E-L18 | Exit checklist (dues, books, deposit) | Requirement (verify, then build) | P2 |
| E-L19 | Former student rejoins | Requirement (verify, then build) | P2 |
| E-L20 | Reverse a payment (cheque bounce / wrong entry) | Requirement (verify, then build) | P2 |
| E-S7 | Shift time edited after students assigned | Requirement (verify, then build) | P2 |
| E-S8 | Disable/remove shift or seat in use | Requirement (verify, then build) | P2 |
| E-S9 | Swap seats between two students | Requirement (verify, then build) | P2 |
| E-S10 | Auto-release seat after N days unpaid | Requirement (verify, then build) | P2 |
| E-S14 | Rotating check-in QR | Requirement (verify, then build) | P2 |
| E-R7 | No mobile / WhatsApp not available | Requirement (verify, then build) | P2 |
| E-R9 | One combined reminder per person across apps | Requirement (verify, then build) | P2 |
| E-N5 | Part-prepayment on a loan | Requirement (verify, then build) | P2 |
| E-N6 | Missed instalments: reschedule / restructure | Requirement (verify, then build) | P2 |
| E-N7 | Top-up / second loan exposure | Requirement (verify, then build) | P2 |
| E-N8 | Interest-free loan (0%) | Requirement (verify, then build) | P2 |
| E-N11 | Agent collection corrections and day-end cash handover | Requirement (verify, then build) | P2 |
| E-N12 | Recovery after write-off | Requirement (verify, then build) | P2 |
| E-N13 | Loan on hold (death/dispute) | Requirement (verify, then build) | P2 |
| E-N14 | Guarantor / co-borrower | Requirement (verify, then build) | P2 |
| E-H3 | Decimal quantity for counted units (manual entry) | Requirement (verify, then build) | P2 |
| E-H4 | Partial return / credit note | Requirement (verify, then build) | P2 |
| E-H5 | Credit limit exceeded | Requirement (verify, then build) | P2 |
| E-H7 | Same draft open on two devices | Requirement (verify, then build) | P2 |
| E-H8 | Network drop while issuing (idempotency) | Requirement (verify, then build) | P2 |
| E-H10 | Price changed after a draft was saved | Requirement (verify, then build) | P2 |
| E-X3 | Merge duplicate parties | Requirement (verify, then build) | P2 |
| E-X4 | Turning off an app with live data | Requirement (verify, then build) | P1 to verify |
| E-X5 | Roles per app | Requirement (verify, then build) | P2 |
| E-X7 | Receipt series per app | Requirement (verify, then build) | P2 |
| E-X8 | Financial-year rollover and locking | Requirement (verify, then build) | P2 |
| E-X10 | Day boundaries in business time zone | Requirement (verify, then build) | P2 |


---

# P1 bugs

---

# B1 · Issuing a bill above stock on hand fails silently

**Type:** Frontend/UI (+ small feature: stock hint)  
**Priority:** P1  
**Module:** Shop · Bills  
**Platform:** Desktop (mobile not retested)

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Route /sales/invoices/new → Issue → payment panel. API: POST /api/v1/sales/invoices/{id}/issue returns HTTP 409.

## Steps to reproduce
1. Have an item with 5 in stock (e.g. QA Pen).
2. Bills → New bill → pick any party → add the item with qty 7 (also reproduced with qty 50 when stock was 8).
3. Click Issue → choose “Received ₹x · Issue” or “Full credit”.

## Current behaviour
The payment panel stays open and nothing happens. The issue request returns 409 but no toast, inline error or console error is shown. The qty field never warns that qty is above stock. With qty ≤ stock the same bill issues normally (INV/26-27/0001).

## Expected behaviour
Show the server's 409 message (e.g. “QA Pen: only 5 in stock”), highlight the offending line, keep the panel open so the user can fix the qty. While typing qty, show “5 in stock” under the line and turn it amber when qty > stock. Optional business setting “Allow negative stock”.

## Acceptance criteria
- [ ] Any non-2xx from /issue shows a visible error with the server message (generic fallback if the body has none).
- [ ] Qty > on-hand shows an inline warning before Issue.
- [ ] Qty ≤ stock still issues and creates the INV number.
- [ ] Automated test covers the 409 path.

## Notes
Check the issue mutation's error handling in the invoice editor / payment panel; it appears to swallow non-2xx responses.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B3 · Same person shows different amounts owed in Lending and Shop; Shop payments never reach the loan

**Type:** Full-stack (needs product decision first)  
**Priority:** P1  
**Module:** Cross-app · Lending + Shop  
**Platform:** All

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Lending loan page /lending/loans/{id} (“Left to collect”) vs Shop party page /customers/{id} (balance, “Loan left”) and Shop dashboard “You will get”.

## Steps to reproduce
1. Create loan LN-0002 for QA Borrower: ₹1,000 lent incl. ₹100 file charge, 100 × ₹12 = ₹1,200 to collect.
2. Collect ₹36 in Lending.
3. Open QA Borrower in Shop.

## Current behaviour
Lending shows Left to collect ₹1,164; Shop shows ₹964 “You will get” and “Loan left ₹964” (principal only). For pre-existing borrower Suraj, the Shop ledger has “You got ₹36” and “You got ₹10” but loan LN-0001 shows Collected ₹0 — money recorded in Shop is never applied to the loan.

## Expected behaviour
One agreed definition, shown with the same label everywhere. Proposal: party balance shows per-app lines (Library dues, Loan left — with and without interest, labelled — Shop khata) and a total. Recording “You got” in Shop for a person with a running loan asks which debt to apply it to; if Loan, it creates a loan collection and updates the schedule.

## Acceptance criteria
- [ ] Lending and Shop show the same loan figure with the same label.
- [ ] A Shop payment applied to a loan updates that loan's Collected and instalments.
- [ ] Dashboard “You will get” states whether loan interest is included.

## Notes
PRODUCT DECISION REQUIRED: confirm whether receivables include unearned interest before coding.

## What to do
1. **Stop and ask me first** about the product decision noted below before writing code; propose 1–2 options with trade-offs.
2. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
3. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
4. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B4 · Security deposit never charged when “Collect now” is off at admission

**Type:** Full-stack (check request payload first; likely backend)  
**Priority:** P1  
**Module:** Library · Admission  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
/library/members → New admission; API /api/v1/library/members (create).

## Steps to reproduce
1. Plan QA Monthly: fee ₹1,000, admission fee ₹200, security deposit ₹500.
2. New admission → Someone in my book → Suraj → plan QA Monthly.
3. Turn off Collect now (help text says “The fees and the deposit are added to what is due”) → Admit.

## Current behaviour
Due = ₹1,200. The student page shows deposit “₹0.00 of ₹500.00” and there is no deposit line to collect against.

## Expected behaviour
Due = ₹1,700 with a separate “Security deposit (refundable)” line that can be taken later. Deposit is never counted as income.

## Acceptance criteria
- [ ] Collect now off → deposit appears as an open due line.
- [ ] Collect now on → behaviour unchanged (deposit receipted and held).
- [ ] Income & expenses never counts the deposit as income.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B47 · Signed-in user sent to Login after idle/reload although session is valid

**Type:** Frontend/UI (auth bootstrap / 401 interceptor) — includes B2  
**Priority:** P1  
**Module:** Platform · Auth  
**Platform:** All

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Any page; observed on /library/members (reload) and /lending/loans/{id} (idle).

## Steps to reproduce
1. Use the app ~10+ minutes or leave a tab idle.
2. Reload, navigate, or click anything.

## Current behaviour
Redirect to /login?next=…. Network: GET /api/v1/auth/me 401 → POST /api/v1/auth/refresh 200 → GET /auth/me 200, but the redirect already happened. On the login page /auth/me returns 200; opening the next URL works without signing in.

## Expected behaviour
On 401: one shared refresh promise, retry the request, redirect only if refresh fails. On tab focus/visibility, refresh silently before any redirect. If the session truly ended, Login says why.

## Acceptance criteria
- [ ] Expired access + valid refresh token → page loads, no Login.
- [ ] Login never shown while /auth/me is 200.
- [ ] Concurrent 401s trigger one refresh.
- [ ] Unsaved drafts survive a real re-login.

## Notes
Look for a route guard or token-expiry timer that redirects before the refresh promise resolves.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B50 · Mobile PWA slow to start and unresponsive to taps at first

**Type:** Frontend/UI (performance) + infra  
**Priority:** P1  
**Module:** Platform · PWA  
**Platform:** Mobile (installed app)

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Installed PWA (manifest start_url /dashboard?src=pwa).

## Steps to reproduce
1. Install to home screen on Android; cold-open; tap a button immediately.

## Current behaviour
Manifest present (standalone, 3 icons) but no service worker registered. Dashboard loads 38 JS files ≈ 1.44 MB uncompressed + 173 KB CSS. /auth/me starts ~665 ms, dashboard data only after (~1,017 ms), charts ~1,645 ms (desktop). Pages appear before they respond.

## Expected behaviour
Tappable within ~3 s on a mid-range Android on 4G; repeat launches start from cache.

## Acceptance criteria
- [ ] Lighthouse mobile /dashboard: TBT < 300 ms, TTI < 3.5 s.
- [ ] Second launch works offline (shell + last data).
- [ ] Buttons pressed before hydration show a loading state.

## Notes
Plan: service worker (app shell + JS/CSS stale-while-revalidate); route-level code splitting; defer charts/analytics/surveys; fetch auth and data in parallel or on the server; fix B21 bursts.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.


---

# P2 bugs

---

# B5 · Renew on a no-expiry plan dead-ends with a meaningless error

**Type:** Frontend/UI (+ backend error message)  
**Priority:** P2  
**Module:** Library · Students  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
/library/members/{id} → Renew; API POST /api/v1/library/members/{id}/renew → 400.

## Steps to reproduce
1. Admit a student on the default “Standard” plan (₹0, no expiry).
2. Open the student → Renew → Renew.

## Current behaviour
Dialog shows “Please check the highlighted fields.” but the dialog has no fields; API returns 400.

## Expected behaviour
Renew is hidden or disabled with tooltip “This plan has no end date”, with a “Change plan” option. For periodic plans the confirm dialog states the amount and new end date (“Adds ₹1,000 · valid till 11/12/2026”).

## Acceptance criteria
- [ ] No Renew action on no-expiry plans.
- [ ] Any renew error shows the server reason.
- [ ] Periodic plan renew dialog shows amount and new end date.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B6 · “Please check the highlighted fields” with nothing highlighted (cross-field and server errors)

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** Lending · New loan, Routes  
**Platform:** Desktop + Mobile

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
/lending/loans/new cost summary panel; /lending/routes Add route.

## Steps to reproduce
1. New loan: loan ₹1,000, file charge ₹2,000 → summary error.
2. Or loan ₹1,000 with 100 × ₹5 instalments (₹500 total) → same.
3. Routes: add a route named like an existing one (“Sakalpur”).

## Current behaviour
Generic “Please check the highlighted fields.” with no field marked and no reason; Give button disabled. On mobile the message is at the bottom and the problem field is off-screen. (Single-field errors like interest 999 are highlighted correctly.)

## Expected behaviour
Field-level messages: “File charge can't be more than the loan”, “Instalments total ₹500 is less than the loan ₹1,000”, “A route named Sakalpur already exists”. Scroll to and focus the first invalid field.

## Acceptance criteria
- [ ] Every cross-field and server validation error maps to a named field with a specific message.
- [ ] Generic text appears only as a last-resort fallback.
- [ ] On mobile the page scrolls to the first error.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B7 · Raw translation key “validation.required” shown to users

**Type:** Frontend/UI (i18n)  
**Priority:** P2  
**Module:** Library · Seats, Fees  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
/library/seats → Shifts and seats → Add shift (empty name); /library/fees → Add plan (empty name).

## Steps to reproduce
1. Click Add shift with an empty name.
2. Click Save plan with an empty plan name.

## Current behaviour
Error text reads `validation.required`.

## Expected behaviour
“Enter a shift name” / “Enter a plan name”.

## Acceptance criteria
- [ ] No raw i18n keys anywhere in the UI.
- [ ] CI/build check fails on missing translation keys.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B8 · Invoice line discount over 100% accepted

**Type:** Frontend/UI (API already rejects)  
**Priority:** P2  
**Module:** Shop · Bills  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
/sales/invoices/new, line Disc. %. Autosave PATCH /api/v1/sales/invoices/{id} returns 400.

## Steps to reproduce
1. Add an item line, set Disc. % = 150.

## Current behaviour
Accepted; line total clamps to ₹0.00; Issue stays enabled; autosave fails with 400 and shows “Couldn't save” with no reason.

## Expected behaviour
Input limited to 0–100 with message “Discount can be 0–100%”. Autosave errors show the server's reason.

## Acceptance criteria
- [ ] Values < 0 or > 100 cannot be entered/saved.
- [ ] Autosave failure messages include the reason.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B9 · Library charges mislabelled on Shop party page

**Type:** Frontend/UI (copy)  
**Priority:** P2  
**Module:** Cross-app · Party page  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Shop party page for a Library student (e.g. QA Student One).

## Steps to reproduce
1. Open a Library student in Shop (global search → student).

## Current behaviour
Library fee charge shows under “You gave in all ₹500”; fee dues show as “Shop balance ₹300”. Imported opening balances also show as “You gave in all”.

## Expected behaviour
Labels by source: “Library charges”, “Library dues”, “Opening balance”. “You gave” only for money actually given.

## Acceptance criteria
- [ ] No library or opening entries labelled “You gave”.
- [ ] Balances block labels match the app the amount came from.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B10 · Shop expenses appear in Library profit report

**Type:** Full-stack (data model + UI)  
**Priority:** P2  
**Module:** Cross-app · Expenses  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
/expenses (shared) → /library/money (Income & expenses).

## Steps to reproduce
1. In Shop add expense ₹150, category Food.
2. Open Library → Income & expenses.

## Current behaviour
The Shop expense reduces Library “Left over” to ₹1,250.

## Expected behaviour
Each expense has an app: Shop / Library / Lending / Shared. Default = current app. Library report counts Library + Shared (or its share).

## Acceptance criteria
- [ ] New `app` field on expenses; old rows backfilled as Shared.
- [ ] Library report excludes Shop-only expenses.

## Notes
PRODUCT DECISION: how Shared expenses are split between apps.

## What to do
1. **Stop and ask me first** about the product decision noted below before writing code; propose 1–2 options with trade-offs.
2. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
3. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
4. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B11 · Back button after app switch shows wrong app context and wrong role tag

**Type:** Frontend/UI (routing)  
**Priority:** P2  
**Module:** Cross-app · Navigation  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Any Shop party page → switch to Library via business menu → browser Back.

## Steps to reproduce
1. Open QA Borrower in Shop.
2. Switch app to Library.
3. Press browser Back.

## Current behaviour
The Shop party page renders inside Library navigation; QA Borrower (never a student) is tagged “Student”; no sidebar item active.

## Expected behaviour
Back restores the Shop app context (each route declares its app), and role tags reflect real roles regardless of current app.

## Acceptance criteria
- [ ] Back after switching shows the page in its own app's navigation.
- [ ] Role tags never depend on the current app.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B12 · “To collect today” includes money collected in advance

**Type:** Backend/API (aggregation) — verify where computed  
**Priority:** P2  
**Module:** Lending · Today, Borrowers  
**Platform:** Desktop + Mobile

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
/lending (Today summary), /lending/borrowers header.

## Steps to reproduce
1. Loan whose first instalment is tomorrow; nothing due today (To collect today ₹0).
2. Collect ₹36 (3 future instalments).

## Current behaviour
To collect today changes from ₹0 to ₹36; row shows To collect ₹0 / Paid ₹36.

## Expected behaviour
To collect today = instalments due today + overdue − amounts paid toward them. Advance payments appear only under Collected.

## Acceptance criteria
- [ ] Unit test: advance-only day → to collect ₹0, collected ₹36.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B13 · Library counter keeps old session after Finish

**Type:** Frontend/UI (state)  
**Priority:** P2  
**Module:** Library · Counter  
**Platform:** Desktop + Mobile

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
/library/counter; localStorage key ub.library.counter.session.

## Steps to reproduce
1. Issue/return a few books, click Finish.
2. Open Counter again later (or on another device/session).

## Current behaviour
The old activity log and the last mode (Return) remain; typing a member number in Return mode gives no feedback.

## Expected behaviour
Finish clears log and selected member and resets mode to Issue. In Return mode, typing a member number lists their books out.

## Acceptance criteria
- [ ] After Finish the counter is empty and in Issue mode.
- [ ] Member lookup works in all modes.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B14 · Negative amount silently turned positive

**Type:** Frontend/UI (input)  
**Priority:** P2  
**Module:** Library · Settings · Fines  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
/library/settings → Fines → “Staff may waive up to”.

## Steps to reproduce
1. Type −50 and Save.

## Current behaviour
Saved as ₹50.00 with a success toast.

## Expected behaviour
Inline error “Enter 0 or more”; nothing saved.

## Acceptance criteria
- [ ] Negative values rejected with a message on all money inputs.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B15 · Misleading or stale validation messages

**Type:** Frontend/UI (validators)  
**Priority:** P2  
**Module:** Library, Shop, Lending  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Library settings → Next book number; Add book ISBN; Add party GSTIN; Seats range; Lending Collect.

## Steps to reproduce
1. Next book number “abc”.
2. ISBN “12345”.
3. GSTIN “ABC123”.
4. Seats From 10 To 5, then fix From to 1.
5. Collect ₹5,000 on a loan owing ₹1,200.

## Current behaviour
“abc” → “That number is already used or passed”; ISBN “12345” → “check digit is wrong”; GSTIN “ABC123” → “check digit is wrong”; seat error stays after fixing From; collect error shown twice (red and amber).

## Expected behaviour
“Enter a number”; “ISBN must have 10 or 13 digits”; “GSTIN must be 15 characters”; dependent fields revalidate together; each error shown once.

## Acceptance criteria
- [ ] Each case above shows the expected message.
- [ ] Format/length checks run before checksum checks.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B16 · Floating Feedback tab covers buttons, inputs and amounts

**Type:** Frontend/UI (CSS)  
**Priority:** P2  
**Module:** All  
**Platform:** Desktop + Mobile

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Global floating “Feedback” tab on the right edge.

## Steps to reproduce
1. Desktop 1057 px: Library → Fees (Add plan button).
2. Mobile 359 px: Library → Fees (Take fee buttons), invoice line Rate field, loan amounts.

## Current behaviour
The tab overlaps interactive elements and amounts.

## Expected behaviour
Move Feedback into the header/account menu, or make it a small icon with reserved right padding so it never overlaps content.

## Acceptance criteria
- [ ] No interactive element or amount is covered at 360, 768, 1024 and 1440 px.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B17 · Truncation and horizontal overflow at desktop width

**Type:** Frontend/UI (CSS)  
**Priority:** P2  
**Module:** All  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Students table, invoice/purchase line tables, invoice view header, Customers table, New loan mobile field.

## Steps to reproduce
1. Use a 1057 px wide viewport.

## Current behaviour
Fee due “₹300.00...” and Fee column cut; line-item tables scroll sideways (GST column cut, item search “Search or sc...”); invoice number “INV/26-27/0...”; customer mobile “+91 90000 000...”; placeholder “Enter mobile numb”; qty “2.5” shows “2.”.

## Expected behaviour
Amounts and document numbers never truncate; tables reflow or hide low-priority columns; inputs wide enough for their content.

## Acceptance criteria
- [ ] No truncated money or document numbers at ≥ 1024 px.
- [ ] No horizontal scroll in forms at ≥ 1024 px.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B18 · Layout shifts after load move click targets

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** Library · Students; Shop · Invoice  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Students summary line (“1 student · ₹300 fee due”), invoice “Draft saved” line.

## Steps to reproduce
1. Open Students and click the search box immediately.
2. Edit a new invoice; when the draft saves, a line appears.

## Current behaviour
Late content pushes fields down; clicks land on the wrong element.

## Expected behaviour
Reserve space (skeleton) for late lines; CLS < 0.1.

## Acceptance criteria
- [ ] Lighthouse CLS < 0.1 on these pages.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B19 · Toasts cover page title and top actions

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** All  
**Platform:** Desktop + Mobile

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Global toast container.

## Steps to reproduce
1. Save any record (loan, purchase bill) and look at the header.

## Current behaviour
Toast covers the page title and top-right buttons (e.g. Collect on mobile).

## Expected behaviour
Desktop: below the header, top-right. Mobile: above the bottom navigation. Never over primary actions.

## Acceptance criteria
- [ ] Toasts never overlap the page title or primary buttons.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B20 · Internal jargon visible to users

**Type:** Frontend/UI (copy)  
**Priority:** P2  
**Module:** Shop · Bills, Purchases  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Invoice summary “Rule 46 check 7/9”; purchase “Supplier state unknown — assumed 03.”

## Steps to reproduce
1. Create an invoice; look under Grand total.
2. Create a purchase for a supplier without state.

## Current behaviour
Unexplained, non-clickable technical text.

## Expected behaviour
Plain language with a fix link (“Add the supplier's state”), or a checklist popover explaining which invoice fields are missing.

## Acceptance criteria
- [ ] No internal rule codes or state codes shown without explanation.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B21 · Server 503s on prefetch and auth request bursts

**Type:** Backend/infra (503) + Frontend (request loop)  
**Priority:** P2  
**Module:** Platform  
**Platform:** All

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
GET /sales/invoices?_rsc=…, /imports?_rsc=… (Next.js RSC prefetch); POST /api/v1/auth/switch-app; GET /api/v1/auth/me.

## Steps to reproduce
1. Open DevTools Network; navigate between pages and switch apps.

## Current behaviour
RSC prefetch requests return 503 repeatedly; each app switch fires ~10 switch-app POSTs and ~10 /auth/me GETs (71 auth calls in ~10 minutes).

## Expected behaviour
No 5xx on prefetch; one switch-app call per switch and one /auth/me per page load (cached).

## Acceptance criteria
- [ ] Network log on app switch shows ≤ 2 auth calls.
- [ ] No 503 on RSC requests under normal use.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B22 · Mobile counter shows selected member below the whole log

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** Library · Counter  
**Platform:** Mobile

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
/library/counter at 360 px.

## Steps to reproduce
1. Select a member in the counter on a phone.

## Current behaviour
Member card renders at the very bottom, after the full activity log.

## Expected behaviour
Member card pinned under the scan box.

## Acceptance criteria
- [ ] Selected member visible without scrolling at 360 px.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B23 · Mobile bottom nav label truncated (“Custome...”)

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** Shop · Navigation  
**Platform:** Mobile

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Shop bottom navigation.

## Steps to reproduce
1. Open Shop at 360 px.

## Current behaviour
Label shows “Custome...”.

## Expected behaviour
Label fits (“Parties” or smaller font).

## Acceptance criteria
- [ ] All bottom-nav labels fully visible at 360 px.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B24 · Add Library / Add Lending gives no feedback

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** Business switcher  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Business switcher → Add Library / Add Lending.

## Steps to reproduce
1. Click Add Library.

## Current behaviour
Menu closes; nothing visible for 3–5 s; then the app switches.

## Expected behaviour
Spinner on the item, repeat clicks disabled, then toast “Library added” and navigation.

## Acceptance criteria
- [ ] Loading state visible within 100 ms.
- [ ] Double-click cannot enable twice.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B25 · Collapsed accordion renders an empty strip

**Type:** Frontend/UI (CSS)  
**Priority:** P2  
**Module:** Library · Add book  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Add book → “More details” sections (×2).

## Steps to reproduce
1. Open Add book.

## Current behaviour
Under each collapsed “More details” header there is an empty bordered strip.

## Expected behaviour
Collapsed sections show only the header.

## Acceptance criteria
- [ ] No empty area when collapsed.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B26 · New student on a ₹0 / no-expiry plan shows “Paid”; plan auto-selected; fee status model

**Type:** Full-stack (status rule + labels)  
**Priority:** P2  
**Module:** Library · Students  
**Platform:** All

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Student badge, Students list, New admission Plan field.

## Steps to reproduce
1. Admit a student on “Standard” (₹0) with nothing collected.

## Current behaviour
Badge “Paid”, “Nothing due”. Plan field auto-selects a plan (the newest one became default).

## Expected behaviour
Badges computed from dates and money: No fee, Paid till {date}, Part paid, Advance {n} months, Due soon, Overdue, On hold, Left. “Paid” never appears without a payment for the current period. Plan field starts empty and is required. Admission asks “How is this student paying?”: Collect now (any amount) / Pay later (dues) / Already paid — existing student (joined on, paid till, deposit held; no receipt, no cash today).

## Acceptance criteria
- [ ] ₹0 plan → “No fee”.
- [ ] Admission without a plan shows “Choose a plan”.
- [ ] Each of the three payment choices produces the correct dues, receipts and badge.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B27 · Import review totals include rows that will not be imported

**Type:** Backend/API (summary)  
**Priority:** P2  
**Module:** Import  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
/imports/{id} review; GET /api/v1/imports/{id}.

## Steps to reproduce
1. Upload a parties CSV with 27 rows of which 16 have problems.

## Current behaviour
“You will get ₹1,30,250.50” though valid rows total ₹1,28,950.50; items “Opening stock value ₹55,240” vs ₹51,190 after fixing.

## Expected behaviour
Totals include only rows that will import; optionally “₹1,300 in rows with problems” shown separately.

## Acceptance criteria
- [ ] Review total equals the success-screen total for the same file.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B28 · Item with the same name as an existing item imported silently

**Type:** Backend/API (validation)  
**Priority:** P2  
**Module:** Import · Items  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Items import.

## Steps to reproduce
1. Import a row named exactly like an existing item (“QA Pen”).

## Current behaviour
A second item “QA Pen” (QA-PEN-002) is created with no warning; billing shows two identical names.

## Expected behaviour
“Thing to check: an item named QA Pen already exists — update it, skip, or create new”. Same for parties without mobile.

## Acceptance criteria
- [ ] Duplicate names surface as a check with a choice.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B29 · Opening balance without direction defaults to “They owe me”

**Type:** Backend/API (validation)  
**Priority:** P2  
**Module:** Import · Parties  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Parties import.

## Steps to reproduce
1. Row with opening_balance 300 and blank opening_type.

## Current behaviour
Imported as “They owe me” with no warning.

## Expected behaviour
Row problem “Choose to_receive or to_pay for this balance”.

## Acceptance criteria
- [ ] Blank opening_type with non-zero balance is a row problem.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B30 · Formula-like text accepted as a name (CSV injection risk on export)

**Type:** Backend/API (security)  
**Priority:** P2  
**Module:** Import / Export  
**Platform:** All

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Parties import; CSV exports (Customers, Old dues, Items).

## Steps to reproduce
1. Import a party named =HYPERLINK("http://x").
2. Export customers/old dues to CSV and open in Excel.

## Current behaviour
Name stored and displayed as-is; export not yet verified.

## Expected behaviour
On every CSV export, cells starting with = + - @ (and tab/CR) are prefixed with an apostrophe. Optionally warn on import.

## Acceptance criteria
- [ ] Exported file opens in Excel showing text, not a formula/link.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B31 · Import status page stops updating

**Type:** Frontend/UI (polling)  
**Priority:** P2  
**Module:** Import  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
/imports/{id}.

## Steps to reproduce
1. Upload a file and wait on the page.

## Current behaviour
Page stays on “Queued — starting shortly” or “Importing 7 rows…” after the API already returned ready/completed (completed 15:51:08 UTC; page unchanged 2 min later). Polling stopped after 3 requests; only a reload updates it.

## Expected behaviour
Poll (or SSE) until a final status; show elapsed time and progress; notify when done.

## Acceptance criteria
- [ ] Page reaches ready/completed state without reload.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B32 · Imports are slow even for tiny files

**Type:** Backend/API (performance)  
**Priority:** P2  
**Module:** Import  
**Platform:** All

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Import worker/queue.

## Steps to reproduce
1. Import 27 parties; 21 items; commit 11 rows.

## Current behaviour
Check ~35 s for 27 rows; ~70 s for 21 items (mostly queued); commit ~40 s for 11 rows.

## Expected behaviour
Check of 1,000 rows < 10 s; queue wait < 5 s; progress percentage.

## Acceptance criteria
- [ ] Benchmarked 1,000-row and 5,000-row files meet targets.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B34 · Import review shows only the first 20 rows

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** Import  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Import review “How we read your file — First 20 rows”.

## Steps to reproduce
1. Upload a file with > 20 rows.

## Current behaviour
Rows 21+ (e.g. a defaulted direction) are never visible before saving.

## Expected behaviour
Paginated preview of all rows with a filter “Only rows with checks/problems”.

## Acceptance criteria
- [ ] Every row can be previewed before Import.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B35 · Imported balances show “Last entry: Today”

**Type:** Backend/API  
**Priority:** P2  
**Module:** Shop · Customers  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
/customers list Last entry column.

## Steps to reproduce
1. Import a party with opening_date 01/04/2025.

## Current behaviour
Last entry shows “Today” (creation time).

## Expected behaviour
Last entry = latest transaction date (01/04/2025); sorting uses it.

## Acceptance criteria
- [ ] Last entry and its sort use transaction date.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B36 · Old dues headline does not match its own table

**Type:** Full-stack  
**Priority:** P2  
**Module:** Shop · Old dues  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
/ledger/aging.

## Steps to reproduce
1. Have loans and shop dues; open Old dues.

## Current behaviour
Headline “You will get ₹1,37,528.50”; age buckets add to ₹1,31,414.50. Gap ₹6,114 = loans (QA Borrower ₹964, QA Mobile Borrower ₹5,000, Suraj loan ₹150) in headline but not in the table.

## Expected behaviour
Same scope in headline and table, or a separate Loans row/tab with its own ageing.

## Acceptance criteria
- [ ] Headline equals sum of rows for the same filter.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B37 · Payment dated before its bill is accepted

**Type:** Backend/API (validation)  
**Priority:** P2  
**Module:** Shop · Payments  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Invoice → Record payment → Date.

## Steps to reproduce
1. Invoice dated 15/03/2026.
2. Record payment dated 01/03/2026 allocated to it.

## Current behaviour
Saved as RCT/25-26/0001 against INV/25-26/0001; no warning.

## Expected behaviour
Block, or warn “Payment date is before the bill date — record as advance instead?”.

## Acceptance criteria
- [ ] Allocation to a later-dated bill is blocked or explicitly confirmed.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B38 · Back-dated sale before the item's opening stock date

**Type:** Backend/API  
**Priority:** P2  
**Module:** Shop · Stock  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Invoice dated in the past for a stocked item.

## Steps to reproduce
1. Item opening stock dated 01/04/2026.
2. Sell 2.5 kg on an invoice dated 15/03/2026.

## Current behaviour
No warning; stock history goes negative before the opening date.

## Expected behaviour
Warning “No stock on 15 Mar 2026 — opening stock starts 1 Apr 2026”; owner may continue per setting.

## Acceptance criteria
- [ ] Warning shown when sale date precedes available stock.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B39 · Migrated opening balance can't be selected when recording a payment

**Type:** Full-stack  
**Priority:** P2  
**Module:** Shop · Payments  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Record payment → Against bills.

## Steps to reproduce
1. Party with opening balance ₹2,300.50 (01/04/2025) and one invoice.
2. Record payment.

## Current behaviour
Only the invoice is listed; the older opening balance isn't allocatable.

## Expected behaviour
Opening balance appears as a line and is first under “Auto — oldest first”.

## Acceptance criteria
- [ ] Opening balance can be settled and shows as paid.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B40 · Library “Plan till” can't be set in the past; “Joined” not editable

**Type:** Frontend/UI + backend rule  
**Priority:** P2  
**Module:** Library · Students  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Student → More → Edit details → Plan till.

## Steps to reproduce
1. Try to set Plan till to a date before today.

## Current behaviour
Past dates disabled; Joined cannot be edited — migrated students whose plan already ended can't be recorded as overdue.

## Expected behaviour
Past Plan till allowed (student shows Overdue); Joined editable (at least during migration).

## Acceptance criteria
- [ ] Plan till 05/10 → student shows Overdue 7 days on 12/10.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B41 · Date pickers make old dates slow to reach

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** All date fields  
**Platform:** All

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Invoice date, payment date, loan dates, Plan till.

## Steps to reproduce
1. Pick a date 2 years ago.

## Current behaviour
Month arrows only (≈24 clicks for 2 years); typing not possible.

## Expected behaviour
Type dd/mm/yyyy, or month and year dropdowns.

## Acceptance criteria
- [ ] Any date within 5 years reachable in ≤ 3 interactions.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B42 · Hard reload of a Shop page can open it in Library navigation

**Type:** Frontend/UI (app context)  
**Priority:** P2  
**Module:** Navigation  
**Platform:** Desktop (observed once)

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
/imports/{id} reload.

## Steps to reproduce
1. Reload a Shop route after using Library.

## Current behaviour
Library sidebar shown (“Test · Library”) on a Shop page.

## Expected behaviour
App context derived from the route's module.

## Acceptance criteria
- [ ] Every route renders in its own app's navigation after reload.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B43 · Quantity box cuts decimals

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** Shop · Bills  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Invoice line Qty.

## Steps to reproduce
1. Enter 2.5 for a KGS item.

## Current behaviour
Field shows “2.”.

## Expected behaviour
Field wide enough for 3 decimals.

## Acceptance criteria
- [ ] “1,250.750” fully visible.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B44 · Import button says “customers” for suppliers too

**Type:** Frontend/UI (copy)  
**Priority:** P2  
**Module:** Import  
**Platform:** Desktop

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
Import review button.

## Steps to reproduce
1. Import a file with customer, supplier and both rows.

## Current behaviour
“Import 11 customers”.

## Expected behaviour
“Import 11 parties (9 customers, 1 supplier, 1 both)”.

## Acceptance criteria
- [ ] Label reflects party types.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B45 · Past loan collections can only be recorded as today's cash

**Type:** Full-stack  
**Priority:** P2  
**Module:** Lending · Collect  
**Platform:** All

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
/lending/loans/{id} → Collect dialog.

## Steps to reproduce
1. New loan given 01/08/2026, 10 × ₹120 from 03/08 (shows 70 days late).
2. Collect ₹720 that was actually paid in August.

## Current behaviour
No date field; saved 12/10/2026 as Cash with receipt RCT/26-27/0009; counted in today's Collected and Cash in hand; still “63 days late”.

## Expected behaviour
Collection date field (past allowed, not future) or a migration option “Already collected before YourKhata” (no receipt, no cash today). Late days and fees follow real dates.

## Acceptance criteria
- [ ] Collection dated 13/08 clears instalments 1–6 on that date.
- [ ] Today's Collected and Cash in hand unchanged.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B46 · Changing “Money given on” doesn't move “First instalment on”

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** Lending · New loan  
**Platform:** All

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
/lending/loans/new.

## Steps to reproduce
1. Change Money given on from 12 Oct to 1 Aug 2026.

## Current behaviour
First instalment stays 13 Oct (2.5-month gap; yearly rate jumps).

## Expected behaviour
If not manually edited, First instalment = Money given on + 1 period.

## Acceptance criteria
- [ ] Changing given date updates first instalment until the user edits it.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B48 · Sign in and Sign up pages open while already signed in

**Type:** Frontend/UI (route guard)  
**Priority:** P2  
**Module:** Platform · Auth  
**Platform:** All

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
/login, /signup (/ already redirects to /dashboard).

## Steps to reproduce
1. While signed in, open /login and /signup.

## Current behaviour
Forms render; user can request a WhatsApp code or start a second account.

## Expected behaviour
Redirect signed-in users to a safe same-site `next` or /dashboard; offer explicit “Sign out and use another number”.

## Acceptance criteria
- [ ] /login and /signup redirect when /auth/me is 200.
- [ ] next accepts same-site paths only.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B49 · Sign-in/sign-up page flashes before the app opens

**Type:** Frontend/UI (auth bootstrap)  
**Priority:** P2  
**Module:** Platform · Auth  
**Platform:** All

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Where
App start / any hard navigation.

## Steps to reproduce
1. Open the app with an expired access token (valid refresh token).

## Current behaviour
Signed-out page (or an empty skeleton without sidebar/header) paints first, then the app jumps inside.

## Expected behaviour
Single neutral splash or app-frame skeleton until auth + refresh finish; never paint Sign in unless signed out. Prefer server-side session check (middleware).

## Acceptance criteria
- [ ] Sign in page never painted for a valid session.
- [ ] Skeleton includes app frame (no layout jump).

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.


---

# Features and requirements

---

# F1 · Back-dated admission for existing students (migration)

**Type:** Feature (full-stack)  
**Priority:** Go-live  
**Module:** Library · Admission

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
“Joined” is always today and not editable; no “Paid till”; deposit can't be marked as already held; Plan till can't be set in the past. Migrating a register forces either a fake receipt/cash today (Collect now on) or a fake due (Collect now off).

## Required behaviour
Admission option “Already paid — existing student” with fields Joined on (past or future), Paid till, Deposit already held ₹, optional old dues ₹ (dated). Creates no receipt and no cash today; plan end, status badge and reminders follow these dates. Joined and Plan till editable later (with audit log).

## Acceptance criteria
- [ ] Student joined 1 Aug, paid till 31 Oct → Plan till 31 Oct, no due, no receipt, Cash in hand unchanged.
- [ ] Paid till 5 Oct → student shows Overdue on 12 Oct.
- [ ] Deposit held ₹500 shows as Security held without a receipt.

## What to do
1. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
2. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
3. Write tests for every acceptance criterion (API + UI where relevant).
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# F2 · Any amount and all payment modes at admission

**Type:** Feature (frontend + API)  
**Priority:** Go-live  
**Module:** Library · Admission

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Collect now is all-or-nothing; only Cash or UPI.

## Required behaviour
Amount box (part, exact, or more). Remainder stays due; extra becomes advance. Same payment modes as Take fee (Cash, PhonePe, Google Pay, Paytm, Other UPI, Bank, Cheque, Card, Other) and split payment.

## Acceptance criteria
- [ ] Admit with ₹500 of ₹1,700 → due ₹1,200, receipt ₹500.
- [ ] Admit with ₹3,700 → ₹2,000 advance shown.
- [ ] Mode list identical to Take fee.

## What to do
1. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
2. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
3. Write tests for every acceptance criterion (API + UI where relevant).
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# F3 · Advance applied automatically at renewal

**Type:** Feature (backend)  
**Priority:** P2  
**Module:** Library · Fees

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Overpayment is “kept as advance” on Take fee, but Plan till doesn't extend; renewal behaviour with advance untested.

## Required behaviour
“Pay N months” at admission and Take fee; each renewal draws from advance first and extends Plan till; badge shows “Advance {n} months”.

## Acceptance criteria
- [ ] Pay 3 months → Plan till +3 months, no due until then.
- [ ] Renewal with sufficient advance creates a fully paid charge.

## What to do
1. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
2. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
3. Write tests for every acceptance criterion (API + UI where relevant).
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# F4 · Reminders for any due, custom and bulk messages, templates, log

**Type:** Feature (full-stack)  
**Priority:** Go-live  
**Module:** Library / Lending / Shop · Messages

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Messages open WhatsApp/SMS on the owner's phone one at a time. Library has only fee reminder, last receipt and welcome; fee reminder appears only for students who owe money; Library Messages lists only plan-end reminders; no custom or group message.

## Required behaviour
“Send message” on every person (any status) with templates (fee due, plan ending, renewal thanks, receipt, welcome, custom). Bulk send to a filter (unpaid, shift, route, all) with preview and personalised text ({name}, {amount}, {due_date}, {upi_link}). Editable English/Hindi templates. Balance re-checked at send time. Guardian receives minors' messages. Message log per person. Optional server-sent WhatsApp Business/SMS with opt-out and quiet hours.

## Acceptance criteria
- [ ] Paid student can be sent “Plan ends on {date}” and a custom message.
- [ ] Bulk send to Fee unpaid prepares one message per student with correct amount.
- [ ] Each send appears in the person's log.

## What to do
1. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
2. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
3. Write tests for every acceptance criterion (API + UI where relevant).
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# F5 · Shift capacity and waitlist

**Type:** Feature (full-stack)  
**Priority:** P2  
**Module:** Library · Seats

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Taken seats are hidden in the admission list, but “No seat yet” always allows admission; no capacity per shift.

## Required behaviour
Capacity per shift (default = seats). When full: block, or “Admit to waitlist”; notify when a seat frees.

## Acceptance criteria
- [ ] Admission into a full shift is blocked or waitlisted.
- [ ] Freed seat triggers a waitlist notification.

## What to do
1. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
2. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
3. Write tests for every acceptance criterion (API + UI where relevant).
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# F6 · Shift-aware seat map with occupancy indicators and a per-seat student list

**Type:** Feature/UI (frontend + seat API)  
**Priority:** P1 for Library  
**Module:** Library · Seats

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Seat map is per selected shift. Seat colour shows only fee state (Paid / Due soon / Unpaid / Overdue / Free). A seat booked in another overlapping shift (A1 booked 18:00–10:00) shows as “Unpaid” in the 06:00–12:00 view with no hint that it belongs to another shift. Clicking a seat shows one student card for the current view only (name, number, shift name, Collect) — no shift times, no other students on the same seat. Every shift shows “2 of 5 filled”. No whole-day view.

## Required behaviour
1) Whole-day view (default) where each seat tile shows its occupancy across shifts: Free · Morning taken · Evening taken · Morning + Evening (full) · All-day taken, using distinct colours/split tiles (e.g. left half = morning, right half = evening) plus a legend; fee state shown as a small dot/badge, not the tile colour. 2) Per-shift view keeps current behaviour but marks seats taken by an overlapping shift as “Taken (other shift)”. 3) Selecting a seat opens a panel BELOW the map listing ALL students on that seat: name, member no., shift name + times, plan till, fee status, mobile, actions (Collect, Message, Change seat, Free seat). 4) Filters: shift, hall/zone, free only, unpaid only. 5) Per-shift counts that match the colours (“Morning 4/5 · Evening 2/5”).

## Acceptance criteria
- [ ] Seat with a morning and an evening student shows as “both full” with both names in the panel.
- [ ] Seat booked only in evening shows “Evening taken” in the whole-day view and “Taken (other shift)” in the morning view.
- [ ] Selecting any seat lists every student assigned to it with shift times.
- [ ] Legend explains every colour; colour is not the only signal (text label/icon).

## Notes
Requested explicitly by the product owner (12 Oct 2026). Use seat/shift time-overlap logic already used in the admission seat list.

## What to do
1. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
2. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
3. Write tests for every acceptance criterion (API + UI where relevant).
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# F7 · Attendance: several visits a day, auto check-out, out-of-shift warning

**Type:** Feature  
**Priority:** P2  
**Module:** Library · Attendance

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
After Out, the student cannot check In again that day; no auto check-out; out-of-shift check-in not checked (fee warning works).

## Required behaviour
Multiple In/Out per day with total hours; auto check-out at shift end marked “auto”; warn on check-in outside own shift or after plan end (owner setting to block).

## Acceptance criteria
- [ ] In → Out → In works the same day.
- [ ] Forgotten check-out closes at shift end.

## What to do
1. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
2. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
3. Write tests for every acceptance criterion (API + UI where relevant).
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# F8 · Migrate a running loan + holiday calendar

**Type:** Feature (full-stack)  
**Priority:** Go-live  
**Module:** Lending · New loan

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Back-dated loans work (shows 70 days late), but past collections can only be recorded as today's cash (B45); collection days are weekday-only with no holidays.

## Required behaviour
“Already collected before YourKhata: ₹X / N instalments” recorded as history (no receipt, no today cash); holiday list per business that shifts schedules without late fees.

## Acceptance criteria
- [ ] Loan given 1 Aug with 60 of 100 instalments paid imports with correct late days.
- [ ] Holiday on a collection day moves that instalment and the end date.

## What to do
1. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
2. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
3. Write tests for every acceptance criterion (API + UI where relevant).
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# F9 · Early closure (foreclosure) quote for loans

**Type:** Feature  
**Priority:** P2  
**Module:** Lending

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
No close-early flow found.

## Required behaviour
“Close now” shows principal left + interest to date per the loan's rule, optional rebate, then closes with a receipt.

## Acceptance criteria
- [ ] Quote matches the loan rule; closing marks the loan Closed and posts a receipt.

## What to do
1. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
2. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
3. Write tests for every acceptance criterion (API + UI where relevant).
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# F10 · Import for every module with column mapping, partial import and undo

**Type:** Feature (full-stack)  
**Priority:** Go-live  
**Module:** Import

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Import page offers only Customers/Suppliers and Items (template-based). No import for students, books (with issued copies), loans (with collected so far), unpaid bills, expenses. One bad row blocks the whole file (B33).

## Required behaviour
Imports for all modules; a column-mapping step with presets for Khatabook, OkCredit, Vyapar and Excel registers; full paginated preview; per-row errors and checks; duplicates: skip / update / create; “Import good rows, skip bad”; downloadable error file; undo a batch within 24 h; imported history never sends reminders, never creates receipts or today's cash.

## Acceptance criteria
- [ ] Students CSV with joined/paid-till/deposit imports correctly.
- [ ] Loans CSV with given date and collected so far imports with correct late days.
- [ ] Khatabook export maps without editing headers.

## What to do
1. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
2. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
3. Write tests for every acceptance criterion (API + UI where relevant).
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# F11 · Walk-in sale that can't be paid in full

**Type:** Feature  
**Priority:** P2  
**Module:** Shop · Bills

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Walk-in requires full payment (“Split amounts must add up to ₹20.00”).

## Required behaviour
“Add name and mobile” converts the walk-in into a party and puts the remainder on khata.

## Acceptance criteria
- [ ] Walk-in ₹20 bill, ₹10 paid → party created, ₹10 due.

## What to do
1. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
2. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
3. Write tests for every acceptance criterion (API + UI where relevant).
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# F12 · Default first instalment = given date + 1 period

**Type:** Feature/UX (frontend)  
**Priority:** P2  
**Module:** Lending · New loan

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Weekly/fortnightly/monthly loans default first instalment to the next day.

## Required behaviour
Default = Money given on + 7 / 14 days / 1 month (daily stays +1 day), until the user edits it.

## Acceptance criteria
- [ ] Weekly loan given 12 Oct → first instalment 19 Oct by default.

## What to do
1. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
2. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
3. Write tests for every acceptance criterion (API + UI where relevant).
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# F13 · Historical GST rates for back-dated bills and stock

**Type:** Feature (backend tax rules)  
**Priority:** P2  
**Module:** Shop · Tax

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Tax code GST12 rejected as “Unknown or expired” in item import.

## Required behaviour
Tax codes carry valid-from/valid-to dates; an older rate is allowed on bills dated before it ended; item import accepts historical codes with a check.

## Acceptance criteria
- [ ] Bill dated before a rate change can use the old rate; new bills cannot.

## Notes
Verify the exact effective dates of the 2025 GST rate rationalisation before coding.

## What to do
1. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
2. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
3. Write tests for every acceptance criterion (API + UI where relevant).
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B33 · Import good rows and skip bad ones

**Type:** Feature (full-stack)  
**Priority:** P2  
**Module:** Import

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
“Fix 16 rows first” — the 11 valid rows can't be imported until every problem row is fixed.

## Required behaviour
“Import 11 good rows, skip 16” with skipped rows in the downloadable problem file; the all-or-nothing option remains available.

## Acceptance criteria
- [ ] Partial import creates only valid rows and reports the skipped ones.

## What to do
1. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
2. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
3. Write tests for every acceptance criterion (API + UI where relevant).
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# B51 · Message any student/customer regardless of status

**Type:** Feature + Frontend/UI  
**Priority:** Go-live  
**Module:** Messaging

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Student who owes: Send fee reminder / Pay by UPI / Welcome / Last receipt. Paid student: only Welcome and Last receipt — no plan-ending reminder, no custom message. No group messaging. Each message needs one WhatsApp tap per person on the owner's phone.

## Required behaviour
See F4. Minimum for go-live: “Send message” on every person with templates incl. “Plan ends on {date}” and custom text, plus bulk send to a filter with preview.

## Acceptance criteria
- [ ] Paid student: plan-ending and custom messages available.
- [ ] Bulk send to a filter works with per-person text.

## What to do
1. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
2. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
3. Write tests for every acceptance criterion (API + UI where relevant).
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.


---

# UI/UX design items

---

# U1 · Type scale too small

**Type:** Frontend/UI (design tokens)  
**Priority:** P2  
**Module:** All

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour
~80% of text is 12 px/17 px; sidebar group labels and app name 10 px; card titles 14 px; fractional sizes 13.9688 px and 11.9924 px.

## Expected behaviour
Body/table 14/20, secondary 13/18, caption 12/16 (captions only), H1 24/32, H2 18/26, card title 16/24, sidebar labels 11–12 px; whole-pixel tokens; tabular figures for money.

## Acceptance criteria
- [ ] No body text under 13 px.
- [ ] Money uses tabular-nums.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# U2 · Menus behave differently (modal vs dropdown)

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** All

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour
“More actions” on Books and Student pages open a centred modal; business switcher and pickers are dropdowns.

## Expected behaviour
One dropdown/menu component for action lists; modals only for forms and confirmations.

## Acceptance criteria
- [ ] All “More” menus use the same dropdown component.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# U3 · Mixed form controls and person pickers

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** All forms

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour
Native selects (Plan, Shift, Seat) vs searchable comboboxes (Unit, Category); Library type-ahead person picker vs Lending text box + separate select; item search keeps old text after reopening.

## Expected behaviour
One searchable picker component everywhere; one person-picker; search box clears on open.

## Acceptance criteria
- [ ] Admission, loan, invoice and item forms use the same picker.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# U4 · Status colours don't match outcomes

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** All

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour
Green tick for “No new seats: those numbers exist already”; green “Paid” for ₹0 plan; amber used for both warnings and unpaid.

## Expected behaviour
Green = done/received; neutral = nothing changed; amber = attention/due soon; red = error/overdue; a fixed badge set.

## Acceptance criteria
- [ ] Badge/toast colours follow the mapping on all pages.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# U5 · Destructive items next to everyday ones in app switcher

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** Business switcher

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour
“Turn off Library” and red “Leave business” sit directly under the app list (especially on mobile).

## Expected behaviour
Move to Settings, or separate with a divider; confirmation names the data affected.

## Acceptance criteria
- [ ] No destructive action in the same group as app switching.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# U6 · Icon-only primary actions on mobile

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** Lending

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour
New loan is a bare “+” on mobile.

## Expected behaviour
Labelled button or extended FAB “+ New loan”.

## Acceptance criteria
- [ ] Every primary action has a visible text label.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# U7 · Summary cards scroll sideways with no hint

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** Shop · Dashboard (mobile)

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour
“Upcoming” card cut at the right edge; no scroll indicator.

## Expected behaviour
2×N grid, or visible peek + dots.

## Acceptance criteria
- [ ] All KPI cards discoverable at 360 px.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# U8 · Money hierarchy and visibility in lists

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** All lists

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour
Mobile Students list hides the amount (only “Fee unpaid”); amounts truncated on desktop; status without dates.

## Expected behaviour
Amount owed on every person row, right-aligned, tabular figures, red/green + text sign; statuses with dates (“Paid till 11 Nov”, “Overdue 63 days”); exact value on tap for abbreviated amounts (₹1.3 L).

## Acceptance criteria
- [ ] Every person row shows amount and dated status at 360 px and 1024 px.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# U9 · Design-token pass: radius, control heights, spacing, card padding, table rows

**Type:** Frontend/UI (design system)  
**Priority:** P2  
**Module:** All

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour
Radii 4/8/12/16/999; button heights 28/32/34/36/40/46/56 on one page; inputs 38 vs 40 px; table rows 48/53/56 px with cell padding 0 12px vs 8px 12px; card padding applied on children (cards report 0 px) so inner sections drift; cards nested in cards; almost no elevation for popovers.

## Expected behaviour
Radii 6 / 12 / full; buttons 32 / 40 / 48 (mobile primary); inputs 40 desktop, 48 mobile; table rows 52 px with 12–16 px cell padding; one card padding token (16 mobile, 20–24 desktop); no nested bordered cards; small elevation scale for popovers/menus/dialogs; spacing scale 4/8/12/16/24/32.

## Acceptance criteria
- [ ] Tokens defined once (CSS variables/Tailwind theme) and used by all components.
- [ ] Visual regression snapshots of 10 key pages approved.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# U10 · Mobile inputs and tap targets

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** All (mobile)

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour
Inputs use 14 px text (iOS Safari zooms on focus below 16 px); 28–36 px buttons and small chips (“Today”, “Yesterday”); sheet footers take ~20% of screen.

## Expected behaviour
16 px input text on mobile; tap targets ≥ 44 px; compact sheet footer (one primary + overflow).

## Acceptance criteria
- [ ] No auto-zoom on input focus in iOS Safari.
- [ ] All tap targets ≥ 44×44 px at 360 px.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# U11 · Visible app switcher and per-app home

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** Navigation

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour
Apps live inside the business menu; sidebar shows only the current app; app name 10 px; Shop sidebar has 20+ items.

## Expected behaviour
Segmented app switch (Library · Lending · Shop) at the top of the sidebar/header; each app home with 3 KPIs + an action list; rarely used Shop documents grouped under “More documents”; modules can be hidden.

## Acceptance criteria
- [ ] Switching app is one tap from any page.
- [ ] Shop sidebar ≤ 12 visible items by default.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# U12 · Person page: one money strip and one timeline across apps

**Type:** Frontend/UI + API  
**Priority:** P2  
**Module:** Party/Student/Borrower pages

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour
Balances block shows Loan left / Shop balance / Deposit held with confusing labels; entries split by app.

## Expected behaviour
Top strip: Total owed · Library dues · Loan left (incl./excl. interest) · Shop khata · Deposit held; below it one timeline of all entries with app tags and filters.

## Acceptance criteria
- [ ] Same totals as each app's own page.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# U13 · Every action gives feedback; undo for money entries

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** All

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour
Some actions give no feedback (Issue 409, Add app, import status, autosave errors); no undo on payments, charges, imports.

## Expected behaviour
Pressed/loading state within 100 ms; every failure shows reason + next step; toast with Undo for 10 s on money entries; confirmations state money effect.

## Acceptance criteria
- [ ] No silent failures in a scripted click-through of all primary actions.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# U14 · Accessibility pass before launch

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** All

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour
Automated check on 6 Library pages: no contrast failures, no unlabelled controls. Not yet verified: focus visibility, screen-reader labels for icon buttons (bell, +, ⋯), colour-only meaning for owed vs received.

## Expected behaviour
WCAG 2.2 AA: visible focus ring, labelled icon buttons, text/sign alongside colour, logical heading order, keyboard-operable menus and dialogs.

## Acceptance criteria
- [ ] axe-core run clean on top 20 pages.
- [ ] Manual keyboard and TalkBack/VoiceOver pass on core flows.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.


---

# Usability feedback

---

# FB1 · Show the fee total before Admit

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** Library · Admission

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour
Fees/deposit summary appears only at the bottom of a long sheet.

## Expected behaviour
Sticky summary near Plan (“₹1,200 fees + ₹500 deposit”).

## Acceptance criteria
- [ ] Total visible without scrolling.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# FB2 · “Processing fee” chip should prefill the description

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** Library · Add charge

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour
Choosing the chip still requires typing a description.

## Expected behaviour
Chip prefills “Processing fee” (editable).

## Acceptance criteria
- [ ] Add charge with chip + amount saves without typing.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# FB3 · Receipt wording and original amount

**Type:** Frontend/UI (copy)  
**Priority:** P2  
**Module:** Library · Receipts

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour
Student receipt says “Customer's balance”; fee line shows remaining (₹300) not original (₹500).

## Expected behaviour
“Student's balance”; show original, paid and remaining.

## Acceptance criteria
- [ ] Library receipts use student wording.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# FB4 · Counter helper text should follow the step

**Type:** Frontend/UI (copy)  
**Priority:** P2  
**Module:** Library · Counter

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour
Stays “Scan a member card or type a name.” after a member is chosen.

## Expected behaviour
“Scan a book to issue to {name}”.

## Acceptance criteria
- [ ] Helper text changes per step.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# FB5 · Warn on very high effective yearly rate

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** Lending · New loan

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour
189% / 999% / 2,429% yearly shown without any warning.

## Expected behaviour
Warning above a configurable threshold, shown before Give.

## Acceptance criteria
- [ ] Warning appears above threshold.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# FB6 · Add supplier inline from a purchase bill

**Type:** Feature (frontend)  
**Priority:** P2  
**Module:** Shop · Purchases

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour
“No supplier matches. Add them in Parties as a supplier.” (nav says Suppliers; must leave the bill).

## Expected behaviour
“+ Add supplier ‘QA Supplier’” inline, keeping the draft.

## Acceptance criteria
- [ ] Supplier created without leaving the bill.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# FB7 · Show where the unpaid remainder goes

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** Payments

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour
Partial payment panel doesn't say the rest goes to khata; walk-in message mentions “Split” when not splitting.

## Expected behaviour
“₹43 will go to their khata”; walk-in: “Walk-in bills must be paid in full”.

## Acceptance criteria
- [ ] Remainder line shown for partial payments.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# FB8 · Out-of-stock notification wording

**Type:** Frontend/UI (copy)  
**Priority:** P2  
**Module:** Notifications

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour
“1 item is low on stock” when stock is 0.

## Expected behaviour
“1 item is out of stock”.

## Acceptance criteria
- [ ] Out vs low distinguished.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# FB9 · Consistent mobile number masking

**Type:** Frontend/UI (privacy)  
**Priority:** P2  
**Module:** All

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour
Dashboard masks (“+91 91••• ••425”) but person search shows full number (+919193526425, unformatted).

## Expected behaviour
One masking rule per role; format +91 XXXXX XXXXX.

## Acceptance criteria
- [ ] Same masking on all screens.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# FB10 · Overnight shift indicator

**Type:** Frontend/UI  
**Priority:** P2  
**Module:** Library · Shifts

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour
18:00–10:00 accepted silently.

## Expected behaviour
Label “overnight · 16 h” and confirm when end < start.

## Acceptance criteria
- [ ] Overnight shifts labelled.

## What to do
1. Find the code for the route(s)/endpoint(s) in **Where** (front end and API).
2. Write a failing automated test that reproduces **Current behaviour** (unit/integration; add an end-to-end test if the bug is UI-only).
3. Fix the root cause so behaviour matches **Expected behaviour**. Keep the change minimal and do not alter unrelated behaviour.
4. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
5. Run the full test suite, lint and type-check.
6. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.


---

# Edge-case requirements (verify first)

---

# E-L3 · Admission booked for a future start date

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Library · Admission

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Not tested; no start-date field seen.

## Required behaviour
Start date may be in the future; seat reserved from that date and shown as “Booked from {date}”; not counted as filled before.

## Acceptance criteria
- [ ] Future admission does not occupy the seat today but blocks it from the start date.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-L7 · Billing cycle: from join date or calendar month, optional pro-rata

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Library · Plans

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Monthly plan runs from join date (12 Oct → 11 Nov).

## Required behaviour
Per-plan setting “from join date” or “calendar month” with optional pro-rata first fee.

## Acceptance criteria
- [ ] Calendar-month plan joined 15 Oct → first fee pro-rated, renews 1 Nov.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-L8 · Discount / concession per student

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Library · Fees

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Only Waive after the fact.

## Required behaviour
Per-student discount (% or ₹) with reason; shown on receipts and reports.

## Acceptance criteria
- [ ] Discounted fee appears with reason on charge and receipt.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-L9 · Duplicate student (same mobile)

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Library · Admission

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Not tested in Library (Shop blocks duplicates well).

## Required behaviour
Warn “Already student M-0001 — open?”; never create two members for one mobile without confirmation.

## Acceptance criteria
- [ ] Duplicate mobile shows warning with link.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-L10 · Guardian mobile required when student has none

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Library · Admission

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Guardian fields optional.

## Required behaviour
If student has no mobile, guardian mobile required; messages go to guardian.

## Acceptance criteria
- [ ] Admission without any mobile is blocked or warned.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-L12 · Change plan or shift mid-term

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Library · Students

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Not tested.

## Required behaviour
“Change plan”: credit unused part, start new term, re-check seat for the new shift.

## Acceptance criteria
- [ ] Change monthly→quarterly mid-term produces correct credit and new due.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-L14 · Renew pressed twice / early renewal

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Library · Renew

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Not tested.

## Required behaviour
Idempotent renew (same request id); second renew within a short window warns “Already renewed till {date}”.

## Acceptance criteria
- [ ] Double click creates one renewal only.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-L15 · Arrears for skipped periods

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Library · Fees

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Dues appear to be created only on Renew.

## Required behaviour
Option to auto-raise each period's fee, or “Renew × N” to catch up.

## Acceptance criteria
- [ ] Student absent 2 months shows 2 periods due when auto-raise is on.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-L16 · Plan price change

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Library · Plans

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Not tested.

## Required behaviour
New price applies to new terms only; optional “apply on next renewal for all”.

## Acceptance criteria
- [ ] Existing students keep old price until renewal.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-L17 · Pause / put on hold

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Library · Students

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
“Put on hold” exists; effect on Plan till and seat not tested.

## Required behaviour
Hold extends Plan till by paused days; choose hold or release seat; reminders paused.

## Acceptance criteria
- [ ] 10-day hold extends Plan till by 10 days.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-L18 · Exit checklist (dues, books, deposit)

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Library · Mark as left

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
“Mark as left” exists; checks not tested.

## Required behaviour
Exit flow lists dues, books out and deposit; refund/adjust/forfeit deposit with receipt; block or note exit with dues.

## Acceptance criteria
- [ ] Exit with books out is blocked or warned.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-L19 · Former student rejoins

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Library · Admission

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Not tested.

## Required behaviour
Reactivate same member number and history.

## Acceptance criteria
- [ ] Rejoin keeps M-number and past payments.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-L20 · Reverse a payment (cheque bounce / wrong entry)

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Payments (all apps)

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Not tested (Void exists on receipts).

## Required behaviour
Reverse with reason; due reopens; receipt marked void; audit log.

## Acceptance criteria
- [ ] Voided receipt reopens the due amount.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-S7 · Shift time edited after students assigned

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Library · Shifts

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Not tested.

## Required behaviour
On save, list clashing students and require reassignment.

## Acceptance criteria
- [ ] Clashes listed before save completes.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-S8 · Disable/remove shift or seat in use

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Library · Shifts

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Not tested.

## Required behaviour
Block, or force reassignment first.

## Acceptance criteria
- [ ] Cannot remove a seat with active students silently.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-S9 · Swap seats between two students

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Library · Seats

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Only Change seat one at a time (fails because target is taken).

## Required behaviour
“Swap with…” action in one step.

## Acceptance criteria
- [ ] Two students swap seats atomically.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-S10 · Auto-release seat after N days unpaid

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Library · Seats

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Missing.

## Required behaviour
Optional setting with warning message before release.

## Acceptance criteria
- [ ] Seat released after N days with prior notice.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-S14 · Rotating check-in QR

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Library · Attendance

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Not tested.

## Required behaviour
QR rotates every few minutes or works only on the library network.

## Acceptance criteria
- [ ] Screenshot of an old QR fails to check in.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-R7 · No mobile / WhatsApp not available

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Messaging

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Shop shows “no mobile saved, so WhatsApp will ask you to choose the chat”.

## Required behaviour
Show “Can't remind — no mobile” in lists; fallback share link or SMS.

## Acceptance criteria
- [ ] People without mobile are flagged in reminder lists.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-R9 · One combined reminder per person across apps

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Messaging

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Not tested.

## Required behaviour
Combine Library/Lending/Shop dues into one message per person per day.

## Acceptance criteria
- [ ] Person with two debts gets one message.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-N5 · Part-prepayment on a loan

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Lending

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Not tested.

## Required behaviour
Ask: reduce instalment or reduce term; show new schedule.

## Acceptance criteria
- [ ] Prepayment of ₹2,000 regenerates the schedule correctly.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-N6 · Missed instalments: reschedule / restructure

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Lending

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Late fee options exist; restructure not seen.

## Required behaviour
Late list by days late; reschedule action with history.

## Acceptance criteria
- [ ] Restructured loan keeps old schedule in history.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-N7 · Top-up / second loan exposure

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Lending

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Not tested.

## Required behaviour
Show running loans and total exposure before Give; optional per-borrower limit.

## Acceptance criteria
- [ ] Exposure shown on New loan for existing borrower.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-N8 · Interest-free loan (0%)

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Lending

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Not tested.

## Required behaviour
Allow 0% with a clear label.

## Acceptance criteria
- [ ] 0% loan saves; yearly rate shows 0%.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-N11 · Agent collection corrections and day-end cash handover

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Lending · Routes

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Not tested.

## Required behaviour
Reverse with reason and owner approval; route-wise handover report.

## Acceptance criteria
- [ ] Reversal requires reason and appears in audit.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-N12 · Recovery after write-off

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Lending

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Not tested.

## Required behaviour
Allow “Recovered after write-off” receipts on closed loans.

## Acceptance criteria
- [ ] Recovery updates income without reopening the loan.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-N13 · Loan on hold (death/dispute)

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Lending

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Missing.

## Required behaviour
Status “On hold” with note; stop reminders and late fees.

## Acceptance criteria
- [ ] On-hold loan excluded from reminders.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-N14 · Guarantor / co-borrower

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Lending

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Missing.

## Required behaviour
Optional guarantor with mobile and KYC photo.

## Acceptance criteria
- [ ] Guarantor visible on loan and statement.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-H3 · Decimal quantity for counted units (manual entry)

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Shop · Bills

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Import rejects 2.5 NOS; manual invoice not tested.

## Required behaviour
Decimals only for weight/volume units on all entry points.

## Acceptance criteria
- [ ] Invoice rejects 1.5 NOS.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-H4 · Partial return / credit note

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Shop · Returns

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Return items exists; not tested.

## Required behaviour
Partial return → credit note, stock back, refund or khata credit.

## Acceptance criteria
- [ ] Return 2 of 5 adjusts stock and balance.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-H5 · Credit limit exceeded

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Shop · Bills

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Credit limit field exists; enforcement not tested.

## Required behaviour
Warn or block at Issue with owner override.

## Acceptance criteria
- [ ] Bill over limit shows warning.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-H7 · Same draft open on two devices

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Shop · Bills

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Not tested.

## Required behaviour
Detect concurrent edit; warn before overwrite.

## Acceptance criteria
- [ ] Second device sees “Edited elsewhere”.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-H8 · Network drop while issuing (idempotency)

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Shop · Bills / all money actions

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Not tested.

## Required behaviour
Idempotency key per submit; retries never create duplicates; show “Already issued INV/…”.

## Acceptance criteria
- [ ] Repeated POST with same key returns the same document.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-H10 · Price changed after a draft was saved

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Shop · Bills

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Not tested.

## Required behaviour
Flag changed prices when reopening a draft.

## Acceptance criteria
- [ ] Draft shows price-changed badge.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-X3 · Merge duplicate parties

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Parties

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Missing.

## Required behaviour
Merge tool combining history and balances.

## Acceptance criteria
- [ ] Merged party has combined ledger.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-X4 · Turning off an app with live data

**Type:** Requirement (verify, then build)  
**Priority:** P1 to verify  
**Module:** Business settings

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Not run (irreversible).

## Required behaviour
Warn with counts (“3 students owe ₹2,500”); keep data read-only; reminders stop.

## Acceptance criteria
- [ ] Turn off shows impact summary and requires confirmation.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-X5 · Roles per app

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Team

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Not tested.

## Required behaviour
Roles: Library staff, Collector, Cashier, Owner; per-app access; hide money where needed.

## Acceptance criteria
- [ ] Library staff cannot see Lending amounts.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-X7 · Receipt series per app

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Numbering

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
One shared RCT series across apps.

## Required behaviour
Optional per-app prefixes (LIB/, LN/, RCT/).

## Acceptance criteria
- [ ] Setting switches new receipts to per-app series.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-X8 · Financial-year rollover and locking

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Numbering / Accounting

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Last-FY bill numbered INV/25-26/0001 correctly; edits to old FY allowed freely.

## Required behaviour
Auto rollover to /27-28/ on 1 Apr; optional lock of filed periods with owner override.

## Acceptance criteria
- [ ] 1 Apr numbering starts at /27-28/0001.
- [ ] Locked period edits require owner.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.

---

# E-X10 · Day boundaries in business time zone

**Type:** Requirement (verify, then build)  
**Priority:** P2  
**Module:** Platform

You are working in the YourKhata codebase. Fix/implement the item below end to end.

## Product context
YourKhata (https://yourkhata.com) is a bookkeeping web app for small Indian businesses, also installable as a mobile PWA. One business can turn on three apps that share the same people (parties), receipts and cash:
- **Library** – study-room seats and shifts, students, plans/fees, attendance, book catalogue and issue counter.
- **Lending** – daily/weekly loans, schedules, collections, routes.
- **Shop** – customers/suppliers, items/stock, bills, purchases, payments, expenses, imports.
The front end appears to be Next.js (App Router / RSC) calling a REST API under `/api/v1`. Amounts are INR with Indian grouping; dates are dd/mm/yyyy; business time zone IST.
Found during manual QA on 12 Oct 2026 (business "Test", desktop 1057 px and mobile 359 px).

## Current behaviour / gap
Not tested.

## Required behaviour
All “today”, due and late calculations use the business's time zone (IST).

## Acceptance criteria
- [ ] Entry at 23:55 IST counts for that day.

## What to do
1. First **verify the current behaviour** in the code (and with a quick test). If it already works as expected, tell me and stop; otherwise continue.
2. Read the related code (routes, API handlers, data model) and write a short implementation plan (data/schema changes, API, UI) before coding.
3. Implement behind small, reviewable commits; add a migration if the data model changes (with safe defaults for existing rows).
4. Write tests for every acceptance criterion (API + UI where relevant).
5. Check desktop (≥1024 px) and mobile (360 px) layouts for any UI you touch; reuse existing components and design tokens.
6. Run the full test suite, lint and type-check.
7. Reply with: root cause / design summary, files changed, tests added, and any follow-ups or risks.