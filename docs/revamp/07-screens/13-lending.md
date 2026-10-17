# Lending: every screen except Today (UI only)

Status: **specified, not approved**, 17 Oct 2026. Wave 3. Today is in [06-lending-today.md](06-lending-today.md). The README coverage table still lists this work as "11-lending-*.md, to do"; this file is that entry under the name the task gave it (the table is not edited here; the next session that may edit README.md should point the row at this file).

**Frozen contract.** Lending is live (02 §3, L-01). This file changes only how screens look and are arranged. Every figure shown comes from a field the server already returns; every action calls an endpoint the client already calls, or uses a query value the endpoint already accepts (marked **[existing param]**). Nothing here recomputes interest, dues, late fees, payoff, the write-off figure, a split or a status. Any idea that needs a new field, endpoint or rule is in §P, "Functional proposals", and is not part of the redesign.

Words: Lent / Collected; **Late**, never "arrears" or "overdue" on screen (the server's bucket key `overdue` is shown as "Late"); "Running" for `active`; no "EMI", "defaulter" or threatening word (the server's `FORBIDDEN_WORDS` list is the floor for screen copy too). `F/` = `frontend/src/modules/DigiKhaato/features/lending/`, `B/` = `backend/apps/lending/`.

---

## 0. What the server returns (read from the code, 17 Oct 2026)

| Endpoint | Fields the screens may show | Where |
|---|---|---|
| `GET loans?status=&route=&borrower=&q=&page=` | per row `loan_json`: id, number, status, close_reason, closed_on, borrower {id, number, party_id, name, mobile, area, status}, route {id, name}, route_seq, plan_type, frequency, principal, rate, rate_unit, instalment_count, instalment_amount, total_interest, total_payable, deductions_total, cash_handed_over, effective_annual_rate, disbursed_on, first_due_on, maturity_on, notes, status_reason, late_fee {kind, value, cap, grace_days}, version + figures {due_today, arrears, remaining, collected, days_past_due, next_due_on, next_due_amount}. `meta {page, page_size (25), total, total_pages, has_loans}`. `status` defaults to `active`; any other value filters by it; `all` is everything. Order: route order, stop number, loan number. | `B/views/loans.py:39`, `B/services/loans.py:689`, `:829`, `:937` |
| `GET loans/{id}` | the above + lender {name, legal_name, address[], phone, gstin}, write_off_amount (running only), has_collections, deductions[] {kind, label, amount}, schedule[] {id, seq, due_on, amount, settled, outstanding, late_fee, waived, status ∈ scheduled/due/overdue/paid/skipped/cancelled} | `loans.py:869-908` |
| `POST loans/preview` | data: cash_handed_over, deductions_total, instalment_amount, total_interest, total_payable, maturity_on, effective_annual_rate, effective_annual_rate_display, schedule[] {seq, due_on, amount, principal, interest}; meta.warnings[] codes `interest_above_principal`, `ends_early` | `B/services/calculator.py:408`, `:276`, `:385` |
| `POST loans` (keyed `lending.loan.create`) | the created loan with schedule | `views/loans.py:57` |
| `GET loans/{id}/collections` | data[] {id, collected_on, amount, mode, reference, note, receipt_number, opening, voided}; meta.visits[] (last 50) {on_date, outcome, reason, promised_on}; meta.messages[] (last 50) {id, kind, subject, channel, at} | `B/services/collections.py:479`, `:500`; `messages.py` `loan_messages` |
| `POST loans/{id}/collections/preview` | amount, remaining_after, clears[] {seq, due_on, amount, when ∈ missed/today/ahead}; refusal `collection_over_payoff` {payoff} | `collections.py` `preview` |
| `POST loans/{id}/collections` (keyed, key optional) | collection_id, payment_id, receipt_number, amount, mode, loan_status, figures | `collections.py` `collect` |
| `POST loans/{id}/visits` (**not keyed**) | id, outcome | `collections.py` `record_visit` |
| `GET borrowers?status=&q=&page=` | per row: id, number, party_id, name, mobile, area, route, notes, status, blocked_at, blocked_reason, version, summary {loans, running, given, collected, left, late}; meta.totals {left, late} for the whole book | `views/loans.py:116`, `loans.py:726`, `:796` |
| `GET/PATCH borrowers/{id}`, `POST …/block {reason?}`, `…/unblock` | one borrower with summary; edits and blocks are owner or admin only | `views/loans.py:156-200` |
| `POST borrowers/{id}/collections/preview` | borrower_id, name, amount, left_after, loans[] {loan_id, number, amount, due_now, late, left_after}; refusals `lending_nothing_due`, `collection_over_payoff` {payoff} | `B/services/borrower_collections.py:62` |
| `POST borrowers/{id}/collections` (keyed, key optional) | amount, left_after, collections[] (one per loan, each as a single collect result + loan_id, number); refusal `balance_changed` {split} | `borrower_collections.py:133` |
| `GET loans/{id}/dues/{due_id}` | due_id, seq, status, late_fee {rule, days_late, rule_amount, already_charged, suggested} or null, waivable {interest, fee, principal} | `B/services/late_fees.py:230` |
| `POST late-fees`, `POST waivers` (both keyed) | adjustment_id, amount, loan (fresh detail) | `views/loans.py:213-260` |
| `POST write-off {amount, reason_code, reason}` (owner only; amount must match; not keyed) / `POST cancel {reason}` (refused after any collection; not keyed) | loan (fresh detail); refusals `balance_changed` {balance}, `nothing_to_write_off`, `loan_has_collections` {count}, `loan_not_active` | `B/services/closing.py:118`, `:183` |
| `GET reminders` (unpaged) | rows {loan_id, number, name, area, route, bucket ∈ overdue/due_today/due_tomorrow, amount, date (dd/mm/yyyy), has_mobile, sent_today {at, channel}} sorted late → today → tomorrow, then loan number | `B/services/messages.py` `due_list` |
| `GET loans/{id}/message/{kind}`, `POST …/preview`, `POST …` (keyed, key optional) | kind, bucket, template, text, sms_text, wa_url, sms_url, tel_url, recipient {name, has_mobile}, last_today, allowed, refusal {code, message, next_allowed_at, window_start, window_end}, changes_in_seconds; send returns reminder_id, channel, deep_link | `messages.py` `preview`, `send` |
| `GET routes` / `POST routes {name}` | id, name, agent {id, name}, is_active, loans (running count), version | `views/collections.py:116`, `B/services/routes.py:17` |
| `PATCH routes/{id}`, `PUT routes/{id}/stops` | exist on the server; **the client calls neither today** (`F/api/lendingPaths.ts` has no stops path) | `routes.py:47`, `:98` |
| `POST collections/{id}/void {reason}` | exists; **no screen calls it today** | `views/collections.py:96` |

## 1. Module-wide rules (apply to every screen below)

**L-R1 Money writes and the request key** (05 §3–4, 08 BP-05). The server keys loan create, collection, borrower collection, late fee, waiver and message send, but the key is optional, so the client is the guard. The spec for every keyed write:
1. One key is minted when the sheet opens (`useIdempotencyKey`, existing).
2. **The key is kept** when the request fails without a server answer (no network, timeout, 5xx, aborted) — the same body is retried with the same key, so a save that reached the server is replayed, not repeated.
3. **The key is rotated** only after success, or after the server refused with a 4xx (nothing was saved), or when the body changes (new amount, new split): the server's idempotency layer refuses a reused key with a different body.
4. **Finding, client-only fix:** `CollectDialog.tsx`, `CollectFromBorrowerDialog.tsx` and `NewLoanPageContent.tsx` call `rotate()` after every result, failures included. A collector who loses signal mid-save and taps "Try again" sends a new key; if the first request had landed, the money is recorded twice. The redesign moves `rotate()` behind rule 3. No contract change.
5. Message send is keyed on the server and the client sends no key; the redesign sends one per sheet (same header, optional on the server).
6. Visits (`Not paid`) and write-off / cancel have no key on the server. Write-off and cancel are safe by state (a second call is refused `loan_not_active`); visits are not (PRODUCT-REVIEW L8). The UI locks the button and, after a failure without an answer, re-reads the loan's visits before offering "Try again" (see Not paid). The server-side fix is proposal FP-1.

**L-R2 Busy, success, failure** (05 §3). Finger down: pressed look in one frame. Save: button turns "Saving…" at once, the sheet's fields lock, a second tap does nothing (`UbButton busy` + the `UbForm` in-flight guard, 06 §3). After 3 s: "Still saving… it won't be saved twice" under the button. Success: the sheet closes; the global snackbar names what was saved and offers the one next step (e.g. "₹500 from Ramesh recorded. Receipt R-0142 · Send receipt"). Failure: the sheet stays open with everything typed, the server's message under the field it concerns or as a banner, nothing claimed saved, "Try again" uses L-R1. Optimistic updates: never for money; allowed only for filter and tab changes.

**L-R3 Offline** (05 §3, 06-lending-today). Lists and the loan page stay readable from what was loaded, with the existing network strip and "As of 10:42" on figures. Every money write (Collect, Collect from, Give loan, late fee, waiver, write-off, cancel) is **disabled** with the reason under it: "No internet. Collect when you're back online." Not paid and Remind are disabled the same way. No offline queue for money.

**L-R4 Permissions.** Each control renders only if the session can use it (02 §1.7): `lending.loan.read/create`, `lending.collection.create`, `lending.visit.write`, `lending.charge.create`, `lending.waiver.create`, `lending.loan.close`, `lending.reminder.send`, `lending.route.read/manage`, `lending.borrower.read/write`. Owner-only: write-off (`platform.tenant.manage` on the client, owner role on the server). Owner or admin: borrower edit, block, unblock; waivers (server `may_override`). A page the role cannot read shows the existing "No access" panel, never an empty list.

**L-R5 Expired session.** A 401 on a read goes through the existing refresh queue; if refresh fails, the sign-in screen returns to the same URL. A 401 on a write keeps the sheet's typed values in memory, signs in, and returns with the sheet open and the **same key** (rule 2), so the retried collection cannot double. The sheet says "You were signed out. Nothing was saved yet. Check and save again."

**L-R6 Figures.** Every amount is `UbAmount`/`formatInr` of a server string, grouped Indian style (₹12,40,378.00), tabular digits, never truncated: a figure wider than its slot wraps the label, not the number. Direction words always accompany colour ("Late", "Left to collect"). The only client arithmetic kept is what exists today and adds two server figures for a button prefill (`askedToday` = due_today + arrears, `F/view-model/lendingDisplay.ts:23`); new screens show the two parts separately wherever there is room.

**L-R7 Long text and 320 px Hindi.** Names wrap to two lines (`line-clamp-2`), never "Ramesh Kum…"; loan numbers are `ds-mono` and never cut; badges sit on the caption line, not beside the title (the CLAUDE.md rule the title owns its line). At 320 px in Hindi ("वसूलना बाकी", "{name} से वसूली") buttons go full-width and stack; the `scrollWidth` check from the e2e harnesses is required on every screen here.

**L-R8 Thousands of rows.** Lists are server-paged (25 per page, `page=`), "Load more" (`UbLoadMore`) on phones and numbered pages on desktop; nothing renders more than the loaded pages. Loan schedules up to 1,000 rows (`COUNT_MAX.daily`) render the open instalments first and the rest behind "Show all {n}" with windowed rendering (05 F8).

---

## Loans list · `/lending/loans`

| Field | |
|---|---|
| Purpose | The loan book: find a loan, see what is left and how late it is, open it or collect. |
| Who and when | Lender at the desk reviewing the book; collector looking up one loan at a door. |
| Phone layout | Header "Loans" with **+ New loan** (32 px icon button, label on `sm`+). One row: search ("Name, mobile or loan number") + a **Filters** button with a count badge. Filters sheet (`UbDialog` + `UbChoiceChips`): **Status** Running · Closed · Written off · Cancelled · All **[existing param: server filters any status value]**; **Route** from `GET routes` + "No route" not offered (the server has no "none" value) **[existing param `route`]**. Active filters show as removable chips under the search. Cards (`CompactCard`), one per loan: line 1 name (wraps); line 2 `LN-0042 · Route 2 · next 18/10/2026` in caption; right column **Left to collect ₹12,000.00**; caption line badges: "5 days late" (error tone, from `days_past_due`), status badge when not Running. A card with something due shows one compact **Collect** text button at its foot (only for `lending.collection.create`, Running, online). Tap the card → loan page. |
| Desktop layout | `UbDataGrid` table: Loan no. · Borrower (name + area) · Route · Given on · Lent (principal) · Collected · Left to collect · Late (₹ arrears + days) · Next due · Status · ⋯ (Open, Collect). Filters as a `UbFilterBar` row (Status chips, Route select) with search on the left. Row opens the loan page; middle-click opens a new tab. Sort stays the server's (route order); no client re-sort of a paged list. |
| What matters most | the loan's name → left to collect → late → Collect. |
| Components | `LoansPageContent` (kept), `UbSearchInput`, `UbFilterSelect`/`UbFilterBar`, `UbFilterChip`, `UbDataGrid` (table + card), `UbAmount`, `UbStatusBadge`, `UbLoadMore`, `UbPageSkeleton`, `UbEmptyState`, `CollectDialog` (dynamic). No new component. |
| Main / other actions | Open loan / Collect, New loan, import (`ImportActionLink`, desktop only on the header). |
| Navigation | In: bottom tab "Loans", sidebar, Today, Borrower page's loan rows, notifications. Out: loan page (Back returns here with filters and scroll kept: filters in the URL, `?status=&route=&q=`), New loan. |
| States | **Loading**: card/table skeleton of 6 rows; header and filters are real at once. **First use** (`has_loans` false): no search, no filters; "No loans yet. Give your first loan and it appears here." + **New loan**. **Empty filtered**: "No loans match" + "Clear filters". **Error**: `UbEmptyState variant="error"` "Loans could not load" + Try again; loaded rows stay if a later page fails ("Couldn't load more · Try again" at the foot = partial failure). **Success** after a collection: the row's figures refresh from the collect response's `figures`, no full reload. **Offline**: rows readable, "As of 10:42", Collect disabled with reason, Load more disabled "No internet". **No permission**: no-access panel; Collect hidden without `lending.collection.create`; New loan hidden without `lending.loan.create`. **Long names**: two lines then wrap in the name cell. **Large amounts**: ₹12,40,378.00 fits the right column at 320 px by moving the badge line below. **320 px Hindi**: Filters button is icon + count; search placeholder "नाम, मोबाइल या कर्ज़ नंबर" wraps never truncates. **3,000 loans**: 120 pages; desktop numbered pages with "1–25 of 3,000"; phone Load more; each page is one request (BP-02 notes the per-row figures cost). **Repeated taps**: a second tap on a card while the loan page is loading does nothing (pending spinner on the tapped card after 120 ms, 05 §3); Load more busy until the page lands. **Expired session**: L-R5. |
| Accessibility | Cards are `UbPressable` rows with a name "LN-0042, Ramesh Kumar, 12,000 rupees left to collect, 5 days late"; the Collect button is a separate control (not nested inside the row button). Filter sheet traps focus; the result count is announced ("24 loans"). |
| Must keep working | `GET loans` params and order; `has_loans` behaviour (no search over an empty book); figures as returned; borrower page reuse of the same component. |
| Fewer taps | Collect from the list (today: open loan → Collect = 2 taps + sheet; now 1 + sheet). Written-off / cancelled loans reachable in 2 taps instead of "All" + scrolling (PRODUCT-REVIEW L7, presentation half). Route filter: 2 taps instead of searching names. |

Tracking: problems — written-off and cancelled loans hidden in All, no route filter in the UI, phone grid of cards on desktop · decisions — status chips use the existing `status` param, route filter uses existing `route` param, desktop gets a table · dependencies — BP-02 (optional speed) · risks — new request variants appear in the contract snapshot (expected, same endpoint) · approval — pending · build — not started · tests — status/route filter request-key test (the PTY-02 "chip that issues no request" lesson: assert the NETWORK), double-tap Collect, 3,000-loan scale seed, 320 px width check · outcome — —

---

## New loan · `/lending/loans/new`

| Field | |
|---|---|
| Purpose | Give a loan (or bring one in from the paper book) and see exactly what it costs before saving. |
| Who and when | Owner or counter staff with `lending.loan.create`, borrower sitting in front of them; occasionally entering old paper loans in bulk. |
| Phone layout | Header × "New loan" (editor header, 04 §4); bottom bar hidden. Four steps on one scrolling page with sticky section headings: **1 Who** (New person / Existing borrower chips; new: name, mobile with phone-contact picker, area; existing: searchable picker of `status=active` borrowers; route select). When an existing borrower is picked, a one-line card under the picker shows their server summary: "2 loans running · ₹18,400 left · ₹1,200 late" (from `GET borrowers/{id}`, already fetched for "+ Loan" from their page) with "See their loans" link — presentation of existing data (PRODUCT-REVIEW L6, first half). **2 Plan** (plan chips, frequency chips limited to `PLAN_FREQUENCIES`, count, rate + unit or per-instalment amount for fixed daily, money given on, first due on, collection days). **3 Money** (amount lent, file charge, late-fee rule disclosure, already-running toggle with collected by instalments/amount, given by mode, notes). **4 What this loan costs** — the server preview — shown as a **docked summary bar** at the bottom on phones: "Cash handed over ₹9,500.00 · Total to collect ₹12,000.00" + **Give ₹9,500.00** (marigold). Tapping the bar expands a sheet with the full preview. |
| Desktop layout | Two columns: form on the left (sections as cards), preview on the right as a sticky panel, always visible: Cash handed over, Total to collect, **Interest** (`total_interest`) and **Charges** (`deductions_total`) as two lines — replacing today's client sum "Interest and charges" (`NewLoanPageContent.tsx:746`, `addMoney`) — Effective yearly rate (`effective_annual_rate_display` %), "{n} instalments, last on {date}", warnings, schedule (first 6 + Show all). Save button at the foot of the panel. |
| What matters most | cash handed over → total to collect → instalment amount and dates → warnings → Give. |
| Components | `NewLoanPageContent` (kept), `UbForm`/`UbField`, `UbChoiceChips`, `UbMoneyInput`, `UbDateInput`, `UbCombobox`, `UbAsyncCombobox`, `UbPhoneInput`, `UbDisclosure`, `UbStatusBanner`, `UbBottomBar` (phone summary dock), `UbStatSummary`. |
| Main / other actions | Give ₹X (or "Save loan" for an already-running one) / see full schedule, cancel (× with unsaved-changes guard). |
| Navigation | In: Loans, Borrowers, borrower page "+ Loan" (`?borrower=&name=`), Today first-use. Out: on success to the new loan's page (existing `router.push`), with a snackbar "Loan LN-0043 given to Ramesh. ₹9,500.00 handed over." × asks "Discard this loan?" when anything was typed. |
| States | **Loading**: form renders at once; borrower and route pickers load on open. **First use**: same form; route select hidden when no routes exist, with a link "Add routes later" (PRODUCT-REVIEW checklist order: loan first). **Preview working**: the preview panel keeps the previous numbers dimmed with "Working it out…" (existing debounce 350 ms, earlier requests cancelled); Give is disabled until a preview for the current values has arrived ("Fill in the loan" when empty). **Preview refused**: the server's field errors go under their fields (existing QA B6 behaviour); the panel says "Fix the marked fields to see the cost." **Warnings**: `interest_above_principal` → info banner "Interest and charges add up to more than the amount lent."; `ends_early` (returned today, not shown — finding) → info banner "The loan is repaid in {instalments} instalments, before the count you chose." Both read from `meta.warnings`, never derived. **Error on save**: banner + fields kept; blocked borrower `borrower_blocked` → "This borrower is blocked. Unblock them to give a new loan." with link to their page (owner/admin only); `party_archived` likewise. **Success**: navigate to the loan page. **Partial failure**: routes list fails → route select shows "Routes could not load · Try again", rest of the form usable. **Offline**: form fillable, preview and Give disabled: "No internet. The cost is worked out by the server, so connect to see it and give the loan." **No permission**: no-access panel. **Long names**: picker rows wrap. **Large amounts**: up to ₹99,99,99,999.99 (`PRINCIPAL_MAX`) fits the dock by wrapping the label above the figure. **320 px Hindi**: the dock shows one figure (cash handed over) and the button; the rest in the expanded sheet. **Thousands of borrowers**: picker is server search (`q`), first page only, "Type to find more". **Repeated taps**: Give locks at once; L-R1 keeps the key on a network failure — the double-give risk today. **Expired session**: L-R5; the form is kept. |
| Accessibility | Each section is a `fieldset` with a legend; the preview panel is a live region announcing only "Total to collect ₹12,000.00, 10 instalments" after it settles (not every keystroke); chips have visible labels (L02 QA). |
| Must keep working | `POST loans/preview` and `POST loans` bodies (`toTermsBody`, `toLoanBody`), keyed `lending.loan.create`, calculator validation messages as returned, already-running loan (QA F8), blocked/archived refusals, first-due defaulting (QA B46/F12). |
| Fewer taps | Preview always visible (dock/panel) instead of scrolling past the form; existing borrower's loans visible without leaving the form. |

Tracking: problems — preview below the fold on phones, client sum of interest + charges, `ends_early` never shown, key rotated after a failed save · decisions — docked summary on phone, two separate cost lines, warnings shown from `meta.warnings` · dependencies — none · risks — low · approval — pending · build — not started · tests — preview-gated save, network-drop retry replays (same key) on a seeded server, warning banners render for both codes, 320 px dock width · outcome — —

---

## Loan page · `/lending/loans/[loanId]` (also the loan drawer on a borrower's page)

| Field | |
|---|---|
| Purpose | One loan as agreed and as it stands: what is due, what is late, every instalment, every collection and visit, and every action on the loan. |
| Who and when | Collector at the door (phone); owner reviewing, fixing, ending, printing (desktop). |
| Phone layout | Header ← "LN-0042" + ⋯. **Who strip**: borrower name (wraps; tap → borrower page), `tel:` mobile, area, route; caption badges Running/Closed/…, "5 days late". **Figures card**: three server figures in a row — **Today** (`due_today`), **Late** (`arrears`, red, with "5 days" from `days_past_due`), **Left to collect** (`remaining`) — and under it "Collected ₹6,000.00 · next ₹1,200.00 on 18/10/2026" (`collected`, `next_due_amount`, `next_due_on`). **Action row** (Running only): **Collect ₹X** (marigold, full width; X = existing prefill), then a row of secondary buttons: **Not paid** (only when something is due today or late, existing rule), **Remind** (when the server would prepare one), **UPI QR** (existing `UpiPayQrDialog`). After the first screenful the Collect button docks at the bottom (`UbBottomBar`, only once the header one scrolls away — DESIGN-SYSTEM §3 rule). **Tabs** (`UbTabs`, 44 px): **Instalments** · **Collections** · **Visits** · **Messages** · **Terms**. Instalments: open ones first (existing "Show all {n}"), each row "3 · 18/10/2026 · ₹1,200.00", status badge (Paid, Paid ahead when scheduled and nothing outstanding — existing rule, Due today, Late, Upcoming, Skipped, Cancelled), "₹200 late fee · ₹100 waived" caption; ⋯ per open row with **Add late fee** / **Waive** (existing gating: `canCharge`, rule ≠ none, status overdue; `canWaive`). Collections: date, amount, mode, reference, note, receipt number, "Collected before (from old book)" for `opening`, "Voided" struck through; per row ⋯ **Print receipt**, **Send receipt**. Visits: date, outcome words, promised date, reason. Messages: subject, channel, time ("WhatsApp opened 10:42", see Messages). Terms: plan, frequency, rate/unit, principal, cash handed over, total to collect, effective yearly rate, deductions list, late-fee rule, given on, ends on, notes, status reason. **⋯ menu** (`UbMoreActions`): Print statement · Print closure letter (closed and nothing left) · Write off (owner, Running, `write_off_amount` > 0) · Cancel loan (`lending.loan.close`, no collections) — destructive ones last, separated. |
| Desktop layout | Breadcrumb "Loans › LN-0042". Two columns: left 2/3 — figures card with actions inline (Collect primary, Not paid, Remind, UPI QR), then the same tabs as a table each; right 1/3 sticky rail — Borrower (name, mobile, area, route, link to their page with their summary line), Terms, Papers (Print statement / receipt / closure as buttons), and an "End this loan" panel with Write off / Cancel explained in one line each. Keyboard: `C` opens Collect when focus is on the page. |
| What matters most | due today + late → Collect → what is left → instalments → history. |
| Components | `LoanPageContent` (kept, regrouped), `CompactCard`, `UbAmount`, `UbStatusBadge`, `UbTabs`, `UbDataGrid`, `UbMoreActions`, `UbBottomBar`, `UbStatusBanner`, dialogs `CollectDialog`, `NotPaidDialog`, `AdjustDueDialog`, `EndLoanDialog`, `MessageDialog`, `UpiPayQrDialog`, `LoanPapersPrint` (all dynamic, as today). |
| Main / other actions | Collect / Not paid, Remind, UPI QR, late fee, waive, print papers, send receipt, write off (owner), cancel. |
| Navigation | In: Loans, Today stop, Borrower page (drawer on phone and desktop — existing `LoanWorkspaceLazy` embedded), Messages row, notifications. Out: borrower page, back to the list it came from (`upHref` = Loans). A closed / written-off / cancelled loan shows the existing banner ("Written off on 17/10/2026 · reason") and hides every write. |
| States | **Loading**: header and skeleton of figures + 5 rows; Collections tab loads its own request (`GET …/collections`) with its own skeleton. **Not found**: "This loan does not exist." + Back to loans (existing). **Error**: page-level error with Try again; **partial failure**: if `/collections` fails, the figures and instalments still show and the tab says "History could not load · Try again". **First use**: n/a (a loan exists). **Success** after any write: figures replaced from the response (`figures` on collect, `loan` on late fee/waiver/end), tabs refetched by the invalidation registry; snackbar per L-R2. **Offline**: readable as loaded; every write disabled with reason; print still works (print is client-side `window.print()` over loaded data). **No permission**: buttons absent per L-R4; a reader without collect sees figures and history only. **Owner-only**: Write off appears only for the owner; an admin sees "Only the owner can write off a loan." in the End panel on desktop, nothing on phone. **Long names**: borrower strip wraps; title is the loan number (never cut). **Large amounts**: three figure columns become two rows below 360 px. **320 px Hindi**: figure labels "आज", "देर से", "वसूलना बाकी" over figures; secondary buttons wrap to two rows with 12 px gaps. **1,000-instalment daily loan**: open + next 6 shown; Show all renders windowed. **Repeated taps**: Collect/Not paid buttons lock while their sheet is opening (chunk load) — a ⋯ that waits shows a spinner in place; writes per L-R1. **Expired session**: L-R5. |
| Accessibility | Figures are a `dl`; "Late" is text, not only red; tabs are real tabs with counts in their names ("Collections, 14"); the per-row ⋯ is labelled "More for instalment 3". |
| Must keep working | `figures` and `schedule[]` shown as given; write-off amount pinned and refreshed on `balance_changed`; cancel only with no collections; late fee ≤ suggested; waiver owner/admin; papers carry the lender's letterhead only (no product name); receipt offered only for the latest standing non-opening collection. |
| Fewer taps | Collect is one tap from the top and from the dock; papers out of the action row into ⋯ / rail (today they share a row with Write off, which put a destructive act next to "Print"). |

### Printable loan papers (part of the loan page)

Statement, receipt (per collection) and closure letter are `LoanPapersPrint` over loaded data, printed with `window.print()` (ADR-021). Spec: an A5/A4 sheet with the lender's `lender {name, legal_name, address, phone, gstin}` at the top, never the product's name or domain (CLAUDE.md; `customerDocumentsCarryNoProductName.test.tsx`). Statement: loan terms, instalments with paid/left, collections with receipt numbers; voided rows marked VOID. Receipt: number, date, amount, mode, reference, "Left after this" from loaded figures. Closure letter only when closed with nothing left. The print button shows "Preparing…" while the print chunk loads; offline printing works. Hindi print uses Mukta; amounts stay "₹" on paper (messages use "Rs", NTF-02).

### Add late fee / Waive (`AdjustDueDialog`)

Opens from an instalment's ⋯. Reads `GET dues/{due_id}` first (skeleton until it arrives). Late fee: "So far: {days_late} days late, rule gives ₹{rule_amount}, ₹{already_charged} already charged" and the amount prefilled with `suggested`, capped ("At most ₹X under the agreed rule", existing). Waive: part chips Interest · Late fee · Principal with each `waivable` amount; amount ≤ that part. Reason required. Keyed (existing). States: refusal `penalty_cap_reached` / `late_fee_not_in_terms` shown as banner with Close; offline disabled; repeated taps per L-R1. Only staff with the codename see it; waivers additionally refused by the server for non-owner/admin, so the client hides Waive for them (session role).

### End loan (`EndLoanDialog`)

Write off (owner): body "₹{write_off_amount} still owed by {name} will be written off. Nothing is deleted…" (existing), reason select (cannot trace / passed away / bad debt / other), reason text, tick "I understand ₹X is written off"; the button names the act "Write off ₹X". On `balance_changed` the new figure replaces the old, the tick clears, banner "What is owed changed just now…" (existing). Cancel: "Use this only for a loan entered by mistake…", reason, "Cancel loan" button; refused `loan_has_collections` → "Money has been collected on this loan, so it cannot be cancelled. Write it off instead." The safe button ("Keep the loan") has initial focus (the CLAUDE.md MLDialog autoFocus lesson — must be verified in a real browser). Not keyed on the server: the button locks; a second call after a lost answer is refused `loan_not_active`, which the dialog turns into "This loan is already ended" and refreshes the page.

Tracking: problems — 3 figures in a cramped grid, destructive Write off beside Print, no tabbed history on phone, long schedules · decisions — Today/Late/Left as three server figures, ⋯ for papers and ending, tabs, desktop rail · dependencies — none · risks — low (same dialogs) · approval — pending · build — not started · tests — figure parity old/new page, write-off `balance_changed` path, cancel refusal, owner-only visibility per role, print has no product name, 1,000-instalment render time · outcome — —

---

## Collect · `CollectDialog` (one loan)

| Field | |
|---|---|
| Purpose | Record money taken for one loan, after showing what it clears. |
| Who and when | Collector at the door, one hand, weak signal; desk staff entering yesterday's cash. |
| Phone layout | Bottom sheet, title "Collect from {name}", caption `LN-0042`. **Amount** (`UbMoneyInput`, numeric keypad, autofocus that actually works in the browser — verify, CLAUDE.md MLDialog lesson), prefilled with the existing suggestion; quick chips under it: "Today ₹500" (due_today), "Today + late ₹1,500" (the existing prefill sum), "Instalment ₹500" (`instalment_amount`) — each a server figure or the existing prefill, chosen not computed. **This clears** card (server preview): "2 missed instalments · ₹1,000.00", "Today's instalment · ₹500.00", "1 instalment ahead · ₹500.00", then **Left after this: ₹10,000.00** (`remaining_after`). **Mode** chips Cash · UPI · Bank · Cheque; reference when not cash; **Collected on** (today, max today); note (optional, collapsed behind "Add a note" on phones). Footer: **Save ₹2,000.00** (marigold; the amount in the label) and Cancel. |
| Desktop layout | Centred dialog 480 px, same order; Enter saves when the preview matches. |
| What matters most | amount → what it clears and what is left → Save. |
| Components | `CollectDialog` (kept), `CompactDialog`, `UbMoneyInput`, `UbChoiceChips`, `UbDateInput`, `CompactCard`, `UbButton busy`. |
| Main / other | Save / Cancel; after success the snackbar offers **Send receipt** (opens `MessageDialog` kind receipt for that collection) and the loan page offers Print receipt. |
| Navigation | From Today stop, Loans row, loan page, borrower page (via Collect from → one loan). Closing returns focus to the button that opened it. |
| States | **Preview loading**: card shows "Working it out…" with the previous result dimmed; **Save is disabled until a preview for exactly the amount in the box has arrived** (finding: today's `CollectDialog` lets Save run without a preview; 02 §3 requires the preview before saving; `CollectFromBorrowerDialog` already gates). **Refused preview** `collection_over_payoff` → under the amount: "This is more than the ₹10,000.00 still owed on the loan." + chip "Collect ₹10,000.00" (the `payoff` from the refusal) — closing the loan in one tap. **Saving**: L-R2; slow > 3 s message. **Success**: snackbar "₹2,000 from Ramesh recorded. Receipt R-0142" or "…The loan is fully paid." (`loan_status` closed). **Failure with answer** (4xx, e.g. loan no longer running): message, key rotated. **Failure without answer**: "Not sure it was saved. Checking…" → the sheet re-reads the loan's collections; if a collection with this amount and the save's time appears, it shows "It was saved" and closes; otherwise "Not saved. Try again" with the **same key** (L-R1). **Offline**: the sheet opens read-only with "No internet. Collect when you're back online." **No permission**: never opened. **Long names**: title wraps. **Large amounts**: Save label drops the amount when it would wrap below 360 px ("Save collection"). **320 px Hindi**: chips wrap; footer stacks, primary on top (existing `MLDialogFooter` order). **Repeated taps**: lock + key; double-tap e2e must post once. **Expired session**: L-R5, same key. |
| Accessibility | The preview card is `role="status"`; refusal text is linked to the amount with `aria-describedby`; the Save label includes the amount for screen readers even when shortened visually. |
| Must keep working | preview endpoint, payoff cap, oldest-first allocation, `collected_on` rules (not future, not before given), keyed `lending.collection.create`, auto-close messages. |
| Fewer taps | Quick amount chips (no typing for the common case); "Collect ₹payoff" on an over-payment. |

Tracking: problems — save not gated on preview, key rotated on failure (double-post), no quick amounts · decisions — gate, keep-key rule, chips from server figures only · dependencies — 08 BP-05 (server key stays optional; client always sends) · risks — medium (money) → covered by double-tap and network-drop tests · approval — pending · build — not started · tests — double-tap posts once; drop network after request leaves, retry replays (one row); preview mismatch blocks save; over-payoff chip · outcome — —

---

## Collect from a borrower · `CollectFromBorrowerDialog` (one handover, several loans)

| Field | |
|---|---|
| Purpose | One cash handover from a person with several running loans, split by the server across them, shown loan by loan before saving. |
| Who and when | Collector at Geeta's door; she hands over ₹650 for two loans. |
| Phone layout | Sheet "Collect from Geeta". Top: segmented control **All running loans** · one chip per running loan "LN-0042 · ₹3,400 left" (replaces today's `UbSelect`, which hid the choice in a dropdown; same options, same behaviour: picking one loan switches to the single-loan Collect). Hint: "One amount for all of Geeta's running loans. What is due now is paid first, the oldest first; the rest goes ahead." **Amount**. **How it is split** (server `loans[]`, only rows with an amount): per loan "LN-0042 · clears all that is due now · ₹400.00 left after" with the share on the right; "LN-0057 · ₹150 of ₹300 due now · …". The caption words are today's `shareCaption`, which compares server figures to choose a phrase; the ₹ in the "due now + ahead" phrase is the difference of two server figures and is kept as today (no new rule). Below: **Left on all loans after this: ₹9,850.00** (`left_after`). Mode, collected on, note as Collect. Footer **Save 2 collections** (count of shares). |
| Desktop layout | Dialog 560 px; split as a small table Loan · Due now · This collection · Left after. |
| What matters most | amount → the split per loan → left after → Save. |
| Components | `CollectFromBorrowerDialog` (kept), `UbChipTabs` (loan choice), `UbMoneyInput`, `CompactCard`, `UbAmount`. |
| Main / other | Save N collections / pick one loan / Cancel. |
| Navigation | From the borrower page (button and dock), Today when a stop's borrower has more than one running loan (a "Collect for all of Geeta's loans" link in the Collect sheet — uses the existing dialog, no new call). |
| States | **Preview loading / mismatch**: Save disabled until the split's `amount` equals the box (existing). **`lending_nothing_due`**: "Geeta has no running loan with anything left to pay." and Close. **`collection_over_payoff`**: "This is more than the ₹X left on all of Geeta's loans." + chip "Collect ₹X". **`balance_changed` on save**: the fresh split from the refusal replaces the shown one, warning "Something was collected on these loans meanwhile. Check the new split, then save." (existing); key rotates because the body changes (L-R1). **Success**: "₹650 from Geeta recorded on 2 loans." + "Send receipts" opens the loan list of receipts (one per loan; each send is its own sheet — the server records per loan). **Partial failure**: impossible by design (server all-or-none, `@transaction.atomic`); the copy never says "some saved". **Failure without answer**: as Collect: re-read the borrower's loans; if their `collected` moved by the amount, say "It was saved"; else retry with the same key. **Offline / permission / expired / repeated taps**: as Collect. **Long names / Hindi**: title "{name} से वसूली" wraps to two lines; loan chips scroll sideways inside a padded track (6 px, a11y rule). **Many loans** (e.g. 12): chips become a select again above 5 loans; the split list scrolls inside the sheet with the totals pinned. |
| Accessibility | Split is a list with each row "Loan LN-0042, 250 rupees, clears all due now, 400 left after"; the "changed" warning is `role="status"`. |
| Must keep working | `borrowers/{id}/collections/preview` and save with the split sent back unchanged; one collection per loan; keyed `lending.collection.create`; refusal shapes. |
| Fewer taps | One handover, one save (vs one sheet per loan); loan choice visible without opening a select. |

Tracking: problems — loan choice hidden in a select, key rotation on failure, success offers no receipts · decisions — chip choice up to 5 loans, keep-key rule, receipts link · dependencies — none · risks — medium (money), covered as Collect · approval — pending · build — not started · tests — `test_collect_from_borrower.py` stays green; e2e two-loan split; balance_changed with a second browser; double-tap once · outcome — —

---

## Not paid · `NotPaidDialog` (a visit with no money)

| Field | |
|---|---|
| Purpose | Record that the stop was walked and why no money came: not paid, not at home, or promised a date. |
| Who and when | Collector on the round, seconds per stop. |
| Phone layout | Sheet "No money from {name}". Outcome chips: **Not paid** · **Not at home** · **Promised to pay** (large, 44 px). Promised → date field (min today) appears with quick chips "Tomorrow", "In 2 days", "Next week" that only fill the date field (calendar arithmetic on today's date, no money rule). Reason (optional, placeholder "e.g. shop closed today"). Footer **Save** (marigold) / Cancel. |
| Desktop layout | Dialog 420 px, same. |
| What matters most | outcome → (date) → Save. |
| Components | `NotPaidDialog` (kept), `UbChoiceChips`, `UbDateInput`, `UbTextInput`. |
| Main / other | Save / Cancel. |
| Navigation | Today stop, loan page. After save the stop shows the visit line ("Promised for 19/10/2026") from the refetched round. |
| States | **Validation**: promised without a date → "When did they promise to pay?" (existing). **Saving**: L-R2. **Success**: "Visit to {name} noted." **Failure with answer**: the server's message (`loan_not_active`, field errors). **Failure without answer**: the server has no key for visits, so a blind retry can make two rows (L8). The sheet says "Not sure it was saved. Checking…", re-reads `GET …/collections` (its `meta.visits`) and if a visit with today's date and this outcome exists says "It was saved" and closes; otherwise retries once on the user's tap. **Offline**: disabled with reason (a visit is not money, but without a key an offline queue could duplicate; FP-1 would allow queueing later). **No permission** (`lending.visit.write`): button absent. **Long names / 320 px Hindi** ("नहीं मिला"): chips wrap to two rows. **Repeated taps**: locked while saving. **Expired session**: L-R5. |
| Accessibility | Chips are a radio group with a visible legend "What happened"; the date field is announced when it appears. |
| Must keep working | `POST visits {outcome, reason, promised_on}`; offered only when something is due (existing rule). |
| Fewer taps | Date chips for the common promise. |

Tracking: problems — duplicate visit on retry (no server key) · decisions — check-before-retry · dependencies — FP-1 for a real guard · risks — low (no money) · approval — pending · build — not started · tests — double-tap once; retry after drop shows "It was saved" · outcome — —

---

## Borrowers list · `/lending/borrowers`

| Field | |
|---|---|
| Purpose | The book of people: who owes what across all their loans, who is late, who is blocked. |
| Who and when | Owner reviewing the book; collector finding a person. |
| Phone layout | Header "Borrowers" + **+ New loan**. A one-line book summary from `meta.totals`: "Left on all loans ₹4,82,300 · Late now ₹36,200" (server sum, never the page added up). Search (name, mobile, borrower number) + Status filter (All · Active · Blocked). Cards: name (two lines), "3 loans · 2 running" (`summary.loans`, `summary.running`), right column **Left ₹18,400.00**; caption badges "Late ₹1,200" (from `summary.late`, only when > 0), "Blocked". Tap → the borrower page (drawer today; see next screen). |
| Desktop layout | Four stat cards above the table: To collect today, Collected today (from `GET today`, loaded **after** the list so the slow round never delays the list — BP-01), Left on all loans, Late now (`meta.totals`). Table: Borrower (name, area, number) · Loans (n · running) · Given in all · Got back · Left · Late now · Status. Row opens the borrower page in the right drawer (existing `BorrowerDetailDrawer`), with "Open full page" in the drawer header. |
| What matters most | person → left → late → open. |
| Components | `BorrowersPageContent` (kept), `UbDataGrid`, `UbStatCard`, `UbSearchInput`, `UbFilterSelect`, `UbStatusBadge`, `UbLoadMore`. |
| Main / other | Open borrower / New loan, search, filter. |
| Navigation | Bottom tab "Borrowers"; out to borrower page; Back keeps search and scroll (in the URL `?q=&status=`). |
| States | **Loading**: skeleton rows, summary line skeleton. **First use**: "No borrowers yet. Give a loan, and the person who takes it is added here." + New loan (existing). **Empty filtered**: "No borrowers match" + Clear. **Error**: error state + Try again; **partial**: today's figures fail → the two today cards say "Couldn't load today's round · Try again", the rest stands; totals absent from an older server → the summary line is hidden, not ₹0. **Offline**: readable as loaded, "As of". **No permission**: no-access panel; the today cards need `lending.today.read` and are omitted without it. **Long names**: two lines. **Large amounts**: right column wraps label above. **320 px Hindi**: "सभी कर्ज़ों पर बाकी" on its own line above the figure. **3,000 borrowers**: server pages of 25; desktop numbered pages; summary is the server's whole-book sum. **Repeated taps**: row pending spinner; drawer opens once. **Expired session**: L-R5. |
| Accessibility | Each row reads "Geeta Devi, 3 loans, 2 running, 18,400 rupees left, 1,200 late". |
| Must keep working | `GET borrowers` params and `meta.totals`; blocked people listed (they still owe); summary as returned. |
| Fewer taps | Late and blocked visible on the row; one tap to the person's loans. |

Tracking: problems — today's round fetched on this page delays it on large books · decisions — load today's cards after the list · dependencies — BP-01 · risks — low · approval — pending · build — not started · tests — totals equal the server's; 3,000-borrower scale page · outcome — —

---

## Borrower page — one person, several loans · `BorrowerDetailDrawer` / `/lending/loans?borrower={id}`

This is the screen PRODUCT-REVIEW §1.3 (L2, L5) asked for. A borrower and a loan are different things; every money path stays per loan; the person's page only gathers them.

| Field | |
|---|---|
| Purpose | Everything one person has had from the lender: all their loans, what is due now on each, what is left in all, and one Collect for the lot. |
| Who and when | Collector at the door of someone with two or three loans; owner deciding on a new loan for a repeat borrower. |
| Phone layout | Full-height sheet (or the `?borrower=` page) with header ← **Geeta Devi** + ⋯ (Edit, Block/Unblock — owner or admin only). Contact strip: `tel:` mobile, area, route, borrower number. Blocked banner when blocked: "Blocked · No new loans. Collections on running loans continue." + reason. **Person summary** (server `summary`): big **Left on all loans ₹18,400.00**; under it two figures **Late now ₹1,200.00** (red, only > 0) and **Got back ₹21,600.00**; caption "Given in all ₹40,000.00 · 3 loans · 2 running". *Due today across loans is not in `summary`; it is not computed here* (see FP-3) — each loan card says its own. **Primary action**: **Collect from Geeta** (marigold, full width; only when `running` > 0 and the role can collect) and **+ Loan** (secondary; hidden when blocked). **Running loans** section (count in heading): one card per running loan, ordered late first (by `days_past_due`, then `next_due_on` — a presentation sort of returned fields), each: "LN-0042 · ₹10,000 lent 02/09/2026", the loan's own **Today ₹500 · Late ₹1,000 (5 days)** line, **Left ₹6,400.00**, next due line, and a small **Collect** button for that loan alone. **Finished loans** section, collapsed by default: closed, written off, cancelled, each with status badge and closed date; a cancelled loan is captioned "Not counted in the totals" (the server excludes it from `summary`, `loans.py:759`). Tap a loan card → the loan page in a stacked drawer (existing `LoanWorkspaceLazy`), Back returns here. A dock with **Collect from Geeta** appears when the header button scrolls away. |
| Desktop layout | Drawer `sm:max-w-2xl` from Borrowers (existing) with "Open full page"; the full page `/lending/loans?borrower=` has the summary as four stat cards (Left, Late now, Got back, Given in all with "3 loans · 2 running") and the loans as a table: Loan · Lent · Given on · Today · Late · Left · Next due · Status · Collect. |
| What matters most | left on all → late now → Collect from Geeta → each loan's due now. |
| Components | `LoansPageContent` with `borrowerId` (kept), `BorrowerHeaderMenu`, `UbStatCard`/`UbStatSummary`, `CompactCard`, `UbDisclosure` (finished loans), `UbBottomBar`, `CollectFromBorrowerDialog`, `CollectDialog`, `BorrowerEditDrawer`, `BorrowerBlockDialog` (all dynamic). |
| Main / other | Collect from {name} / Collect one loan, + Loan, open a loan, call, Edit, Block/Unblock. |
| Navigation | From Borrowers row, a loan page's borrower link ("Account" today → renamed "All of Geeta's loans"), New loan's existing-borrower card. "+ Loan" opens New loan with `?borrower=&name=` (existing). |
| States | **Loading**: header from the row already in hand (name), summary and loans skeletons. **Partial failure**: borrower read fails but loans load → loans show, summary says "Totals could not load · Try again" (never ₹0); loans fail → summary shows, list error with retry. **One loan only**: no "Collect from" — the single loan's Collect is the primary (same sheet either way; avoids a split of one). **No running loan**: summary shows "Nothing left on any loan"; no Collect; + Loan primary. **Blocked**: banner; + Loan hidden; collections continue (server rule). **More than 25 loans** (finding: the page asks for page 1 only, `LoansPageContent.tsx:137`, so loans 26+ are silently missing): Load more using the existing `page` param [existing param]. **Offline**: readable, Collect disabled with reason. **No permission**: ⋯ absent for non-owner/admin; Collect absent without `lending.collection.create`; + Loan absent without `lending.loan.create`. **Long names**: title two lines. **Large amounts**: the big figure wraps its label above. **320 px Hindi**: "{name} से वसूली" button full width, two lines allowed. **Repeated taps**: as Collect. **Expired session**: L-R5. |
| Accessibility | Sections are headings with counts ("Running loans, 2"); each card's Collect is labelled "Collect for loan LN-0042". |
| Must keep working | `GET borrowers/{id}` summary, `GET loans?borrower=&status=all`, the split dialog, owner/admin-only edit and block, blocked = no new loan only. |
| Fewer taps | One Collect for all loans from the person's page; per-loan Collect without opening the loan; finished loans out of the way. |

Tracking: problems — loans beyond 25 hidden, no "due now" for the person (no field), Collect-from loan choice hidden · decisions — per-loan due lines, late-first order, finished collapsed, Load more · dependencies — FP-3 (person-level due today), FP-5 (one reminder per person) · risks — low · approval — pending · build — not started · tests — `test_many_loans_one_borrower.py`; e2e 3 loans with different terms: totals on screen equal server summary; 30-loan borrower shows all after Load more · outcome — —

### Borrower edit drawer (`BorrowerEditDrawer`)

Owner or admin only. Fields: name, mobile (`UbPhoneInput`), area, notes (existing; route is not edited here today — the server accepts `route_id`, see FP-6). Name and mobile are the shared person record (DEC-019): the drawer says so under the fields: "Name and mobile are shared with your other apps." Save sends `version`; a stale version → the drawer reloads the borrower and the snackbar asks for the change again (existing). Duplicate mobile → error on the mobile field. Phone: full-height sheet with Save docked above the keyboard; desktop: right drawer. States: loading n/a (row in hand), saving L-R2, offline disabled, expired L-R5, repeated taps locked; 320 px Hindi labels above fields.

### Block / Unblock (`BorrowerBlockDialog`)

Owner or admin only, from ⋯. Block: title "Block {name}?", body "No new loans for {name}. Collections on their running loans continue.", optional reason (≤ 160), button "Block". Unblock: confirm "New loans are allowed again." No dismissal on a stray backdrop tap (existing `UbConfirmDialog` rules); Cancel has initial focus. Success snackbar; the page banner appears/disappears from the response. Failure keeps the dialog open. Not money; not keyed; a repeated block is a no-op on the server state.

---

## Routes · `/lending/routes`

| Field | |
|---|---|
| Purpose | The collection rounds and which loans are on each, in walking order. |
| Who and when | Owner setting up rounds; collector checking their round. |
| Phone layout | Header "Routes" + **Add route** (for `lending.route.manage`) opening a small sheet with the name field (≤ 60, "e.g. Market lane"). List of routes: name, "{n} running loans", "walked by {agent}" (existing fields), inactive routes under "Not in use" collapsed. Tap a route → **Route stops** view (read only): the loans on that route in walking order, read from the existing `GET loans?route={id}&status=active` [existing param], whose server order is route order then stop number; each stop "3 · Geeta Devi · LN-0042 · Left ₹6,400". Buttons: **Open today's round** → `/lending?route={id}` (existing Today filter). Reordering stops, renaming, assigning an agent and switching a route off exist on the server but not in the client; they are FP-2, not part of this redesign, and nothing on the screen pretends they work. |
| Desktop layout | Two panes: routes on the left, the selected route's stops on the right as a table (Stop · Borrower · Loan · Left · Late · Next due). |
| What matters most | route → its stops in order → today's round for it. |
| Components | `RoutesPageContent` (kept), `CompactCard`, `UbListItemText`, `UbDrawer` (phone stops view), `UbDataGrid`, `UbLoadMore`. |
| Main / other | Open route / add route, open today's round. |
| Navigation | Bottom tab "Routes"; Today's route chip links here when empty ("No routes yet"). |
| States | **Loading** skeleton list. **First use**: "No routes yet. A route is the area your collectors visit, like Market lane or Station road." + Add route (only if manage), otherwise only the sentence (PRODUCT-REVIEW wording). **Error**: "Routes could not load" + Try again (string exists, `lending.routes.error`). **Add route errors**: "A route with this name exists." under the field. **Partial**: stops fail → route list stays. **Offline**: read only, Add disabled with reason. **No permission**: `lending.route.read` missing → no-access panel. **Long names**: wrap. **320 px Hindi**: "वसूली रूट". **Hundreds of stops**: stops paged 25 with Load more. **Repeated taps**: Add locks while saving (no key; a duplicate name is refused by the server, so a double tap cannot make two). **Expired**: L-R5. |
| Accessibility | Stops are an ordered list (`ol`) so the order is announced. |
| Must keep working | `GET/POST routes`; route assignment at loan creation; Today's `route` filter. |
| Fewer taps | See a round's order without opening Today. |

Tracking: problems — no way to see a route's stops; ordering only through loan creation · decisions — read-only stops view from the existing loans list; ordering left to FP-2 · dependencies — FP-2 · risks — low · approval — pending · build — not started · tests — stops order equals `route_seq` order from the server · outcome — —

---

## Messages · `/lending/messages`, and the message sheet (`MessageDialog`)

| Field | |
|---|---|
| Purpose | Today's reminders to borrowers, sent by hand from the lender's own phone, and a record of who was told when. The product sends nothing (DEC-012). |
| Who and when | Owner or collector in the morning, 08:00–19:00. |
| Phone layout | Header "Messages". Rule line (existing, reworded to not imply delivery): "You send reminders from your own phone between 08:00 and 19:00, at most once a day for each loan. Late ones first." Three sections in the server's order with counts: **Late** (`overdue`), **Due today**, **Due tomorrow**; each row: name (two lines), `LN-0042 · Route 2`, amount (`amount`) with the date the text names (`date`), and either **Remind** (opens the sheet) or, when `sent_today`, "WhatsApp opened at 10:42" / "SMS opened at…" / "Called at…" (channel words) with no button; a person with no mobile shows "No mobile number for {name}" and an "Add number" link to the borrower edit (owner/admin). Rows for the same person on two loans sit together with a caption "2 loans" — grouping only; each still has its own Remind, because the server caps per loan (see FP-5). Tap a row elsewhere → loan page. |
| Desktop layout | Table with section headers: Borrower · Loan · Route · Amount · Date · Status (Not yet / opened at) · Remind. |
| Message sheet | Title "Remind {name}" (or "Receipt for {name}"); bucket badge ("Late", "Due today", "Due tomorrow"); the **editable text** (`UbTextArea`, prefilled from the server's `text`, "Reset text" restores it; edits are previewed through `POST …/preview` so the shared text is the server's composition with the edit); buttons **Open WhatsApp** (marigold, a real link to `wa_url`), **Open SMS**, **Call**. A tap opens the app and records it (`POST …/{kind}` with channel; a request key per sheet, L-R1 rule 5). Copy after the tap: "WhatsApp opened. Send the message there." — **never "sent" or "delivered"**: the app only knows a link was opened. Snackbar "Reminder to {name} noted." (today: "recorded"; kept meaning). When not allowed: no buttons; the server's reason and next time ("Reminders can go from 08:00. Next: tomorrow 08:00", "Already reminded today at 10:42 · WhatsApp"); the sheet re-asks at `changes_in_seconds` and on returning to the app (existing). |
| What matters most | who is late → Remind → proof it was opened today. |
| Components | `MessagesPageContent`, `MessageDialog` (kept), `UbSectionHeading`, `UbStatusBadge`, `UbTextArea`, `UbActionLink`. |
| Main / other | Remind / open loan, add mobile. |
| Navigation | Bottom App sheet / sidebar "Messages"; Remind on the loan page and on Today use the same sheet. |
| States | **Loading** skeleton by section. **Empty**: "No reminders due today or tomorrow." **First use**: same sentence (no loans → nothing due); with no loans at all, add "Give a loan first" link. **Error**: "Messages could not load" + Try again. **Partial**: preview of one sheet fails → "Could not prepare the message · Try again" in the sheet, list unaffected. **Outside 08:00–19:00**: the list still shows; Remind buttons read "From 08:00" disabled with the reason. **Offline**: Remind disabled ("No internet. The text comes from the server."). **No permission** (`lending.reminder.send`): page absent from navigation; direct URL → no-access panel. **Long names / Hindi**: text area grows; 320 px buttons stack full width. **3,000 loans**: the endpoint is unpaged and builds figures per loan (BP-02); the list renders sections collapsed after 50 rows each with "Show all {n}" and windowed rendering. **Repeated taps**: the link opens once per tap by nature; the record is keyed so a double tap records one row; the server cap refuses a second reminder the same day anyway. **Expired session**: the sheet keeps the edited text and asks to sign in before recording. |
| Accessibility | Sections are headings with counts; the disabled state is text, not a greyed button alone; the text area is labelled "Message text, you can change it". |
| Must keep working | buckets late → today → tomorrow; send window and daily cap; forbidden words; "Rs" in texts; the lender's own name; links prepared before the tap (pop-up blocking). |
| Fewer taps | Same-person rows grouped; sent rows visibly done. |

Tracking: problems — "Reminded at" reads as delivered, one person with two loans gets two rows and two messages (L9), unpaged list on big books · decisions — "opened" wording, grouping without merging, windowed sections · dependencies — BP-02, FP-5 · risks — low · approval — pending · build — not started · tests — no screen string contains "sent"/"delivered" for lending messages; sheet off at 18:59; keyed record · outcome — —

---

## P. Functional proposals (need approval, not part of the redesign)

Each goes to 08 if the owner wants it. None is assumed by any screen above.

| ID | Proposal | Why | Touches | Risk |
|---|---|---|---|---|
| FP-1 | Idempotency key (optional, like collections) on `POST loans/{id}/visits` | a retried Not paid makes two visits (L8); with it the client can retry blind and even queue visits offline later | one decorator; same shape as 08 BP-05 | low |
| FP-2 | Use the existing `PUT routes/{id}/stops` and `PATCH routes/{id}` in the client: drag to reorder stops, rename, set agent, switch off | stops order today only follows loan creation | **no backend change**, but a new client workflow on a frozen module and new calls in the contract snapshot | low–medium (route order drives Today) |
| FP-3 | Add `due_today` to the borrower `summary` | the person page cannot say "₹1,700 due today across loans" without summing per-loan figures in the client, which the rules forbid | `borrower_summaries`; additive field | low |
| FP-4 | Show **Void collection** (existing `POST collections/{id}/void`, reason ≥ 3 chars) on the loan page for the owner | a wrong collection can only be fixed outside the app today | no backend change; new client action on money; who may void needs a decision (`lending.collection.void`) | medium |
| FP-5 | One reminder per person for several loans | two loans due = two messages a day (L9) | messages service, cap rule, templates | medium (legal guardrail) |
| FP-6 | Edit a borrower's route in the edit drawer (`PATCH` already accepts `route_id`) | moving a person between rounds needs a new loan today | no backend change; new client field | low |
| FP-7 | A "date" parameter on `GET today` | a "Tomorrow's round" view (noted in 06-lending-today) | Today endpoint | low |
| FP-8 | Top-up, reschedule, early-settlement rebate (L7) | common lender requests | calculator, dues, ledger | high |
| FP-9 | Server-side Payments guard so loan instalments cannot be settled outside a collection (L4) | correctness of "collected today" and the cancel rule | payments | medium |

---

## Review

Rubric: [09](../09-design-review.md) §1, weights Mobile 0.20 · Ease 0.15 · Visual 0.15 · Feedback 0.15 · A11y 0.10 · Desktop 0.10 · Safety 0.10 · Reuse 0.05. Pass is **strictly above 8.6**. Scored only what this file specifies, plus Lending Today from 09 to give the module figure. Self-assessed; §R5 says what must happen before the numbers count.

### R1. Round 1 (first draft) — fails

The first draft was the current screens regrouped: tabs on the loan page, a docked preview on New loan, the split dialog as is, and the Routes list as it stands. It did not yet have the key rule, the preview gate on Collect, offline/expired-session rules per sheet, or the borrower page's 25-loan fix.

| Screen | M | E | V | F | A | D | S | R | Arithmetic | **Weighted** |
|---|---|---|---|---|---|---|---|---|---|---:|
| Loans list | 8.3 | 8.4 | 8.4 | 8.2 | 8.2 | 8.2 | 8.8 | 9.0 | 1.66+1.26+1.26+1.23+0.82+0.82+0.88+0.45 | **8.38** |
| New loan | 8.1 | 8.3 | 8.4 | 8.4 | 8.2 | 8.5 | 8.6 | 8.9 | 1.62+1.245+1.26+1.26+0.82+0.85+0.86+0.445 | **8.36** |
| Loan page (+ papers, adjust, end) | 8.1 | 8.2 | 8.3 | 8.3 | 8.2 | 8.4 | 8.7 | 8.9 | 1.62+1.23+1.245+1.245+0.82+0.84+0.87+0.445 | **8.315** |
| Collect + Collect from borrower | 8.6 | 8.6 | 8.5 | 8.2 | 8.3 | 8.4 | 8.0 | 9.0 | 1.72+1.29+1.275+1.23+0.83+0.84+0.80+0.45 | **8.435** |
| Not paid | 8.7 | 8.7 | 8.5 | 8.3 | 8.4 | 8.4 | 8.3 | 9.1 | 1.74+1.305+1.275+1.245+0.84+0.84+0.83+0.455 | **8.53** |
| Borrowers list | 8.5 | 8.4 | 8.5 | 8.4 | 8.3 | 8.6 | 9.0 | 9.0 | 1.70+1.26+1.275+1.26+0.83+0.86+0.90+0.45 | **8.535** |
| Borrower page (multi-loan, edit, block) | 8.3 | 8.2 | 8.4 | 8.3 | 8.2 | 8.3 | 8.6 | 9.0 | 1.66+1.23+1.26+1.245+0.82+0.83+0.86+0.45 | **8.355** |
| Routes | 8.2 | 7.6 | 8.3 | 8.2 | 8.3 | 8.2 | 9.2 | 9.0 | 1.64+1.14+1.245+1.23+0.83+0.82+0.92+0.45 | **8.275** |
| Messages (+ sheet) | 8.6 | 8.5 | 8.5 | 8.5 | 8.3 | 8.4 | 8.5 | 9.1 | 1.72+1.275+1.275+1.275+0.83+0.84+0.85+0.455 | **8.52** |
| Lending Today (09 round 1) | | | | | | | | | from 09 §3 | **8.49** |
| **Lending module** (mean of 10) | | | | | | | | | (75.705 + 8.49) / 10 | **8.42** |

### R2. Shortcomings found in round 1, and what changed

| Screen | Shortcoming (honest) | Change now in the spec |
|---|---|---|
| Collect, Collect from, New loan | `rotate()` after every result: a retry after a lost answer sends a new key and can record money twice; Collect could save without a preview | L-R1 keep-key rule; Save gated on a preview for the exact amount; "Not sure it was saved. Checking…" re-read before retry |
| Not paid | visits are unkeyed; a retry duplicates | check-before-retry; FP-1 for the real guard |
| Borrower page | loans after the 25th silently missing; no person-level "due today"; loan choice in Collect-from hidden in a select | Load more with the existing `page`; per-loan Today/Late lines instead of a client sum (FP-3 for the field); chip choice up to 5 loans |
| Loan page | three figures cramped, papers beside Write off, long history on one scroll | Today / Late / Left as three server figures, tabs, ⋯ for papers and ending, desktop rail, Collect dock |
| New loan | preview below the fold on phones; client sum "Interest and charges"; `ends_early` never shown | docked summary; two server lines; both warning codes shown |
| Loans list | written-off/cancelled only under All; no route filter; phone cards on desktop | status chips and route filter on existing params; desktop table |
| Routes | nothing to see inside a route | read-only stops view in walking order from the existing loans list; open today's round for the route |
| Messages | "Reminded at" reads as delivered; same person twice | "WhatsApp opened at"; rows grouped by person; windowed sections |
| All | offline, expired session, 320 px Hindi and 3,000-row behaviour not stated per screen | L-R3…L-R8 plus each screen's states row |

### R3. Round 2 (current specs) — passes

| Screen | M | E | V | F | A | D | S | R | Arithmetic | **Weighted** |
|---|---|---|---|---|---|---|---|---|---|---:|
| Loans list | 8.8 | 8.8 | 8.6 | 8.8 | 8.6 | 8.8 | 9.0 | 9.0 | 1.76+1.32+1.29+1.32+0.86+0.88+0.90+0.45 | **8.78** |
| New loan | 8.7 | 8.7 | 8.6 | 8.8 | 8.5 | 8.8 | 9.0 | 8.9 | 1.74+1.305+1.29+1.32+0.85+0.88+0.90+0.445 | **8.73** |
| Loan page (+ papers, adjust, end) | 8.7 | 8.8 | 8.6 | 8.8 | 8.6 | 8.8 | 9.1 | 8.9 | 1.74+1.32+1.29+1.32+0.86+0.88+0.91+0.445 | **8.765** |
| Collect + Collect from borrower | 9.0 | 8.9 | 8.6 | 9.0 | 8.6 | 8.6 | 9.2 | 9.0 | 1.80+1.335+1.29+1.35+0.86+0.86+0.92+0.45 | **8.865** |
| Not paid | 9.0 | 8.9 | 8.6 | 8.8 | 8.6 | 8.5 | 8.8 | 9.1 | 1.80+1.335+1.29+1.32+0.86+0.85+0.88+0.455 | **8.79** |
| Borrowers list | 8.8 | 8.7 | 8.6 | 8.7 | 8.6 | 8.9 | 9.1 | 9.0 | 1.76+1.305+1.29+1.305+0.86+0.89+0.91+0.45 | **8.77** |
| Borrower page (multi-loan, edit, block) | 8.9 | 8.9 | 8.6 | 8.8 | 8.6 | 8.7 | 9.0 | 9.0 | 1.78+1.335+1.29+1.32+0.86+0.87+0.90+0.45 | **8.805** |
| Routes | 8.7 | 8.3 | 8.6 | 8.7 | 8.6 | 8.6 | 9.3 | 9.0 | 1.74+1.245+1.29+1.305+0.86+0.86+0.93+0.45 | **8.68** |
| Messages (+ sheet) | 8.9 | 8.8 | 8.6 | 8.8 | 8.6 | 8.7 | 9.1 | 9.1 | 1.78+1.32+1.29+1.32+0.86+0.87+0.91+0.455 | **8.805** |
| Lending Today (09 round 2) | | | | | | | | | from 09 §4 | **8.74** |
| **Lending module** (mean of 10) | | | | | | | | | (78.99 + 8.74) / 10 | **8.77** |

Every screen and the module are above 8.6. Routes passes by the smallest margin (8.68): its Ease is held at 8.3 because stop ordering is a proposal (FP-2), not part of this redesign. Visual is 8.6 everywhere because no Lending screen has been drawn on the Counter Mode page yet; the score assumes the agreed tokens and is not evidence of a good-looking screen.

### R4. Production safety, justified

Safety scores 8.8–9.3 because: (1) no endpoint, field, calculation or rule changes; every figure is a server string (§0); (2) the three client-side money fixes (keep the key on a lost answer, gate Collect on its preview, re-read before retrying a visit) **reduce** risk without touching the contract — the key header is already accepted and optional; (3) new request *variants* to existing endpoints (`status=written_off|cancelled`, `route=` on Loans, `page=` on the borrower page, `route=` for a stops view) will appear in the 02 §6 contract snapshot and must be accepted there by name — they are reads, and the server already handles them (`loans.py:940-946`); (4) the borrower page keeps every money path per loan, and the split stays the server's, sent back unchanged. Not paid stays 8.8 because the server still cannot de-duplicate a visit (FP-1). Nothing here is proven until the checks in R5 run.

### R5. What each score still needs before it counts

| Score | Needs |
|---|---|
| Safety (all) | API contract snapshot of every Lending call before/after, diff empty except the named read variants; figure parity on a seeded book (old vs new screen, every figure); `apps/lending/tests` and `test_many_loans_one_borrower.py` green |
| Collect, Collect from, New loan safety + feedback | double-tap e2e (0 duplicate collections, loans, late fees, waivers); network-drop-after-send test proving the retry replays (one row) with the same key |
| Mobile | installed PWA on a low-end Android and an iPhone: Collect one-handed at 320 px, keypad opens on the amount (the MLDialog autoFocus defect must be confirmed fixed in a real browser), docks clear the gesture bar |
| A11y | axe at 390 and 1280 both themes on all nine screens; TalkBack pass of Collect and the split; 320 px Hindi with large system text; the `scrollWidth` and text-box measuring checks |
| Feedback | tap-to-first-change and INP on the loan page and Collect on the reference phone (05 §5) |
| Ease | the lending tasks of the 9-task script with 5 lenders/collectors, including "collect ₹650 from a person with two loans" |
| Desktop | a desktop pass of loan page rail and borrower drawer at 1280 and 1024 |
| Visual | Lending screens drawn on the Counter Mode page and reviewed by the owner |
| Routes ease | FP-2 decided either way |
| Messages / Borrowers speed | BP-01 / BP-02 measured on 3,000 loans (Phase 1) |

### R6. Owner questions

1. **FP-3: add `due_today` to the borrower summary?** Without it the person page shows each loan's due today but no total for the person. Recommendation: yes (additive, low risk).
2. **FP-2 / FP-6: let the app use the route and borrower-route endpoints the server already has?** No backend change, but it is a new workflow on a frozen module. Recommendation: yes for stop order, after the redesign ships.
3. **FP-4: who may void a wrong collection, and should the loan page offer it?** Recommendation: owner only, with a reason, shown on the collection row.
