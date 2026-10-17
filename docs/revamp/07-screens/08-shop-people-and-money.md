# Shop: people and money

Status: **specified, round 2 review passes provisionally (8.74)**, 17 Oct 2026. Wave 2. Not approved; not built (R-DEC-01).

Covers the Shop's Customers and Suppliers lists, the shared person page read in the Shop book, its statement, the tags manager, Payments, the Receive payment / Pay supplier drawer with everything it opens, the payment receipt and its message, the Cash book, and Expenses. 20 screens and overlays.

Visual reference: `docs/revamp/design/counter-mode.html` sections `#pay` (Receive payment, eight states), `#customers` (table, phone list, filter sheet, settle dialog), `#billactions` (consequence-first destructive dialogs), `#share` (receipt message), `#pickers` (date picker), `#footer` (`UbTotalDock`), `#settings` (unsaved-changes, staff lock). This file copies those decisions; it does not redesign them.

Paths: `F/` = `frontend/src/modules/DigiKhaato/features/`. Endpoints are under `/api/v1/` (02 §1). Code read at `dev` 31784ab.

## 0. Rules that hold on every screen in this file

### 0.1 One book (DEC-019)

| Rule | How it shows | Where it is enforced today |
|---|---|---|
| Shop screens read only the Shop book (`shop_balance`, bucket `shop`) | every figure is labelled "To collect" / "To pay" (Shop words), never "You will get / give" (Udhaar words) | `PartyListPageContent` `book="shop"` → `SHOP_BOOK_WORDS` (`F/parties/constants/partyFilters.ts:78`); person page `useAppWords().book`; statement `?book=shop` (`statementService.ts:128`); ledger lines `ledgerService.ts:203`; Cash book is Shop-only on the server (`backend/apps/expenses/selectors/cashbook.py:120,182`) |
| Customers and suppliers are never netted | a person who is both appears in both lists, each with only that side's figure, and a quiet "Also a supplier" badge | design `#customers`; `PartyListPageContent` `kind` |
| Netting only by an explicit settlement | "Settle…" is a **proposal** (§3.3). Until the owner decides, it is not built and no screen offers it | R-DEC open (Q1 below) |
| No Udhaar tool on a Shop screen | no You gave / You got, opening balance, credit limit, Udhaar reminder or write-off on the Shop person page | `PartyDetailPageContent.tsx:384,454,467,512` — **except two leaks found, §3.1 C-2** |

### 0.2 Feedback and duplicate protection (05 §3–4), applied to every write below

| Moment | Spec for every control in this file |
|---|---|
| Finger down | pressed look in one frame (`:active`, 0.98, darker fill) on buttons, rows, chips, tabs |
| Tap that navigates (row, tab, "View receipt", "Statement") | row shows its spinner after 120 ms, 2 px `RouteProgress`, then the target's `loading.tsx` skeleton (list / detail / form family, 02-global-shell) |
| Tap that saves | button becomes busy at once with its own verb ("Receiving…", "Paying…", "Saving…", "Cancelling…"), the form locks, `UbForm` ignores a second submit, `useAsyncAction` ignores a second tap (06 §3) |
| Request | every money write already carries an `Idempotency-Key`, minted per logical write and **reused on retry** (`useIdempotencyKey` → `rotate()` only after success or a validation answer, `usePaymentForm.ts:73-160`). Server scopes: `payment_create`, `payment_void`, `payment_allocate` (`backend/apps/payments/views/payment.py:109,124,141`), `expense_create`, `expense_void` (`expenses/views/expense.py:159,183`), `party_create`, `party_archive`, `party_bulk_archive` (`parties/views/party.py:343,391,497`). Client allowlist `IDEMPOTENT_POST_PATHS` (`src/api/APIPaths.ts:308`) covers `/payments/**`, `/expenses/**`, `/parties/**` by prefix. **No gap found for this module**; tag writes are exempt because they are idempotent by construction (`APIPaths.ts` `IDEMPOTENCY_EXEMPT_PATHS`). |
| Slow (> 3 s) | under the busy button: "Still working… it won't be saved twice." |
| Failed | sheet stays open with everything typed; red banner "Didn't go through. Nothing was saved." (`role="alert"`); button reads "Try again" and resends with the **same key** |
| Saved | the result says what was saved, with its number, and the one useful next action |
| Offline | `NetworkStrip`; payments and expenses are write class A "queueable" (`usePaymentForm.ts:78`, `useExpenseForm`): Save reads "Save on this phone" and the result says "Saved on this phone. It will be sent when you're back online." **Verify in Phase 4 that the outbox really carries `POST /payments` and `/expenses`; if it does not, Save is disabled with "No internet. Your entry is kept."** Voids, archive and party edits are not queued: disabled with the reason. |
| Session expired mid-write | shell sheet "You've been signed out…" (02-global-shell); the open form's values are kept in memory for the sign-in round trip and the same idempotency key is reused, so a request that did land is not saved twice |
| No permission | hidden, not disabled (§19.7.5, already the code's rule); read-only screens say once "You can see payments but not record them." (`payments.readOnly`) |

### 0.3 Text and numbers

- Money with `UbAmount`/`formatInr`, Indian grouping, sign never inside the number; `₹12,40,378.00` must fit every money cell at 320 px. Phone rows put the amount on its own right-aligned line when the name wraps (never shrink the amount).
- Names wrap to two lines (`line-clamp-2`), never "Shri Balaji Hardw…"; the title owns its line, badges go to the caption line (LED-03 rule).
- 320 px Hindi: every button label checked at 320 px in Hindi with the measuring check (`scrollWidth` and text-node-vs-box, 11 "Measuring checks"). Two-word buttons that don't fit stack, they are not cut.
- Plain words. Renames proposed in this file (copy only, same keys' meaning):

| Today (`locales/catalogues/*.en.json`) | Proposed | Why |
|---|---|---|
| "Record payment" / "Record payment · {name}" | "Receive payment" / "Receive payment · {name}" | design `#pay`; the counter word |
| "Save payment ₹{amount}" | "Receive ₹{amount}" / "Pay ₹{amount}" | the button names the act and the exact amount |
| "Void", "Void payment", "Void {number}?" | "Cancel receipt", "Cancel {number}?" (Hindi already says रद्द) | "void" is accounting jargon |
| "Allocations exceed the payment" | "You've put ₹{x} on bills but are receiving only ₹{y}." | jargon, no numbers |
| "No open bills — the full amount will be recorded on the khata" | "No unpaid bills. The full ₹{amount} is kept as advance for the next bill." | "khata" is the Udhaar book's word (DEC-019) |
| `payments.out.hint` "…stays as an advance on their khata" | "…anything more stays as advance with them in the Shop." | same |
| "Cashbook" | "Cash book" (Hindi रोकड़ बही stays) | two plain words |
| "Statement" Hindi "हिसाब" | keep | already plain |

## 1. Customers · `/customers`

| Field | |
|---|---|
| Purpose | Who owes the shop on bills, who is most late, and reach any customer fast. |
| Who and when | Owner and counter staff; many times a day, mostly to find one person or to start a collection round. |
| Phone layout | Header "Customers" + ⋯ (Tags, Import, Export) + bell. Sticky search "Name or mobile" with a Filters button showing its applied count (design `#customers` phone). Quick chips under it: **Owe you · 12**, **Late · 6** (only once P-08-03 lands), **Paid you in advance · 1**. Summary sentence (not tiles) "12 owe you ₹18,450 in total · most late first" — states it counts *every matching customer*, not the rows on screen (`meta.totals`, PTY-02). Card list (`UbDataGrid` card tier): name (2 lines), caption "42 days late · promised ₹1,500 today · Route 2", amount right with "to collect" under it, one trailing action **Remind** (customer owes) — or nothing. "Show more (7 left)" (`UbLoadMore`). FAB "+ Add customer" above the bottom bar. Bottom bar tab Customers active. |
| Desktop layout | Sidebar. Header: "Customers" with "Shop book · 48 active customers", Import, **+ Add customer** (marigold). Toolbar: search (300 px), the same chips, Sort ("Most late first"), Filters (opens a 360 px right drawer, same groups as the phone sheet). Summary line "Showing customers who owe you · 12 match · they owe ₹18,450 in total · rows 1–8". Table: Customer (name + mobile + one fact) · To collect · Late by (P-08-03) or Last Shop activity · Actions (Remind, ⋯). Selection at `lg` with a bar: Add tag · Archive · Clear. Row opens the person page. |
| What matters most | search → the summary sentence → most-late rows with their Remind. |
| Components | `PartyListPageContent kind="customer" book="shop"`, `PartyListStats` (becomes the one-line summary on phones; tiles stay at `md`+; the count tile is already dropped below `md` by the 23 Sep phone-fold decision, Part 43 CR-129–134), `PartyListFilters`, `PartyListSortSheet`, `UbDataGrid`, `UbFilterChip`, `UbStatusBadge` ("Also a supplier"), `UbFab`, `UbLoadMore`, `PartyFormDrawer` (lazy), `PartyBulkTagDialog`/`PartyBulkArchiveDialog` (lazy). Nothing NEW. |
| Main / other actions | open a customer / Add customer, Remind, filter, sort, tag, archive (bulk), export, import. |
| Navigation | in: bottom tab, sidebar, Home "To collect" lane (sorted most late), `/parties/tags` "Camp Area · 34" link (`?tag=`). Out: row → `/parties/[id]` with `history.state.yourkhataApp='shop'` so the person page reads the Shop book (`historyApp.ts`); Remind → Shop reminder flow (TV-02 dependency). Filters live in the URL (`usePartyListUrl`), so Back restores them. |
| Loading | 8 skeleton cards / rows, summary line shimmers (never ₹0) — existing `statsLoading`. A later filter change keeps rows dimmed under the grid's progress bar (`busy={isRefreshing}`). |
| Empty / first use | approved empty-book design (12 Oct): one sentence "No customers yet", one button "+ Add customer"; no search, no filters, no FAB (`emptyBook`). |
| Filtered empty | search: "No one called 'ramesh'" + **+ Add "ramesh"** (prefilled form) + Clear filters; chips only: "No customers match these filters" + Clear filters (existing two variants). Archived tab: "Nobody archived". |
| Error | whole list: in-page error with Try again, no request id (UbRequestId draws nothing). Refresh failed over a saved answer: amber "Showing saved list · balances may be out of date" + Try again, rows kept (FR-15). |
| Partial failure | tags or roles fail to load: the list still shows; the tag filter group says "Tags couldn't load · Try again". Totals missing from `meta`: the honest page-sum fallback with "These 25 rows" wording (`totalsScope='page'`). |
| Success | after Add customer saves: drawer closes, snackbar "Added Anita Verma", the new row is on top (invalidation registry). |
| Offline | cached list readable with "As of 4:12 pm, no internet" under the summary; Add customer disabled with "Needs internet" (party create is not queued today). |
| No permission | no `parties.party.read`: route shows "You don't have access to this. Ask the owner." Read-only role: no Add, no selection bulk Archive, no Import; Export hidden without `parties.party.export`. |
| Long names, big amounts | "Shri Balaji Hardware & Electricals Private Limited" wraps to 2 lines; ₹12,40,378.00 sits on its own line on a 320 px card. |
| 320 px Hindi | chips scroll horizontally inside their row (the page never does); "लेना है" under the amount; FAB label collapses to "+" with `aria-label` "ग्राहक जोड़ें". |
| Thousands of rows | server paging (25/50/100) and keyset-safe ordering (`StableOrderingFilter`, `ix_party_tenant_activity`); phone uses "Show more" which appends a page; desktop paginates. Tested on the 2k-party scale seed. |
| Repeated taps | row open: second tap during pending is ignored (`useNavigate`); Remind: opens one sheet only; bulk Archive: dialog's confirm busy + keyed. |
| Expired session | shell sheet; filters survive in the URL. |
| Accessibility | table has caption "Customers who owe you"; each card reads "Sharma General Store, to collect 3,100 rupees, 42 days late"; chips are toggle buttons with `aria-pressed`; Filters button label "Filters, 1 applied"; status in words, not colour. |
| Must keep working | `?book=shop` reading; URL filters; warm-up claim-once (`partyListWarmup.ts`) and its request key including every filter; `meta.totals` over the filtered set; NULLS LAST ordering; filtered-empty Add with the typed name; archive refused on any non-zero balance; bulk tag undo from what the server wrote; drawers `dynamic()`. |
| Fewer taps | "Owe you" chip is one tap (no sheet); Remind on the row (no need to open the person); the add-from-search button prefills the name. |

Tracking: problems — Late-by needs a server field (P-08-03); TV-02 Shop reminders; summary tiles cost a phone screen (fixed by the one-line summary) · decisions — chips + sheet split copied from `#customers`; filter sheet applies on Show, not live (draft count on the button) · dependencies — P-08-03, TV-02 · risks — chip row discoverability at 320 px Hindi · approval — pending · build — not started · tests — `e2e/parties.mjs` (network assertions), `e2e/tags.mjs`, `--shots` at 320/360/390/768/1280 · outcome — —

### 1.1 Filter sheet and sort sheet (phone) / filter drawer (desktop)

| Field | |
|---|---|
| Purpose | Narrow the list without losing place. |
| Layout | Phone bottom sheet "Filter customers": groups **Balance** (Any · Owes you · Paid you in advance · Settled), **Late by** (Any · Not due yet · 1–30 days · Over 30 days — only with P-08-03), **Tags** (searchable, several), **Status** (Active · Archived). Footer: Reset · **Show 12 customers** (count updates as a draft). Closing keeps the old filters ("Close without changing filters"). Desktop: the same in a 360 px right drawer. Sort is its own one-tap sheet (UAT D5): Most recent · Most to collect · Least · Name. |
| States | count loading: button reads "Show customers" with a small spinner, still tappable; count failed: "Show results"; zero: "Show 0 customers" enabled (the list's filtered-empty explains). |
| Components | `PartyListFilters compact`, `UbFilters`/`UbFilterSheet`, `PartyTagFilter`, `PartyListSortSheet`. The draft-count needs a count request per change: reuse `GET /parties?…&page_size=1` (`meta.total`), debounced 250 ms, cancelled on change. |
| Accessibility | each group a `radiogroup`/`group` with its legend; focus returns to the Filters button. |
| Must keep | "Paid you in advance" is the existing `i_owe` filter, worded for customers; credit chip group hidden in the Shop book (credit limits are Udhaar's). |

## 2. Suppliers · `/suppliers`

Same screen as §1 with `kind="supplier"`; only the differences are listed.

| Field | |
|---|---|
| Purpose | Whom the shop owes on purchase bills, and pay them. |
| Phone layout | "Suppliers"; chips **You owe · 9**, **Due this week** (P-08-03), **They owe you · 1** (an advance paid to them); summary "You owe 9 suppliers ₹42,600 in total"; row trailing action **Pay** (opens §6 with `direction='out'`). Payable is shown first (`payableFirst`). |
| Desktop layout | table columns Supplier · To pay · Due by (P-08-03) or Last Shop activity · Actions (Pay, ⋯). |
| Words | "To pay", "Pay supplier", never "You will give". |
| First use | "No suppliers yet · + Add supplier" (`parties.list.supplier.empty.*`). |
| Dual role | Ramesh Traders appears here with only his supplier figure (₹600 to pay) and "Also a customer"; caption "His customer balance is under Customers". |
| Main / other | open / Add supplier, Pay, filter, sort, tag, archive. |
| All other fields | as §1, including every state, accessibility and must-keep row. |

Tracking: problems — Pay on the row is new placement of an existing drawer · decisions — Pay is the supplier's row action as Remind is the customer's (design research: Khatabook lane pattern) · dependencies — P-08-03 for "Due this week" · risks — a Pay tap opening a money form from a list must still show the bills before saving (it does: §6) · approval — pending · build — not started · tests — parties e2e with `kind=supplier`, double-tap on Pay · outcome — —

## 3. Person page in the Shop book · `/parties/[id]` (opened from Shop)

### 3.1 The page

| Field | |
|---|---|
| Purpose | One customer's or supplier's Shop money: what is due on which bills, what they paid, and the next move (receive, pay, remind, statement). |
| Who and when | Counter, while the person stands there; or the owner checking before a call. |
| Phone layout | Header: Back + name (wraps, 2 lines) + ⋯. Bottom bar hidden (as today). **Balance card**: "To collect ₹445" (or "To pay ₹600"), as-of "Last Shop activity 16 Oct", badges Customer / Supplier, code, mobile with Call and Copy. If both roles: **two figures side by side, never one** ("As a customer: to collect ₹1,000" · "As a supplier: to pay ₹600"). Then "Bills and payments" list (the Shop book's lines, `PartyLedgerTimeline book="shop"`, read-only: each line is fixed by its document and opens it via `EntrySourceLink`). "Details" collapsible (GSTIN, address, price list, collection date). **Docked action bar (NEW placement, P-08-01)**: customer → **Receive payment** (marigold) + **+ New bill** (secondary); supplier-only → **Pay supplier** (marigold) + **+ Purchase bill**; both roles → Receive payment + Pay supplier. ⋯ sheet: Statement, Remind (customer with dues; TV-02), Show UPI QR, Edit, Archive. |
| Desktop layout | Breadcrumb "Customers › Anita Verma" (or Suppliers, from `history.state`); header with the same two actions as buttons on the right plus ⋯; balance card; two columns from `lg`: lines (left) and sticky 320 px details rail (right) with module panels (deposits) under it. |
| What matters most | the Shop figure with its direction word → the main action → open bills and recent payments. |
| Components | `PartyDetailPageContent`, `PartyDetailHeader` (Shop words via `headerT`), `PartyHeaderMenu`, `PartyLedgerTimeline book="shop"`, `PartyInfoPanel`, `PartyCollectionDate`, `PartyModulePanels`, `UbBottomBar` (the dock, today used only for You gave / You got), `UbStatusBanner` (archived). Overlays lazy: `PaymentFormDrawer`, `CollectQrSheet`, `PartyFormDrawer`, `PartyArchiveDialog`, `PartyReminderSheet`. NEW: none (dock contents change). |
| Main / other actions | Receive payment or Pay supplier / New bill, Statement, Remind, UPI QR, Edit, Archive, Restore (archived). |
| Navigation | in: Customers/Suppliers rows, Home lanes, search, bill pages (party link), notifications. Back: to the list it came from (`peopleHref` per app), never browser history outside the app (04 §5). Out: line → its bill/receipt; Statement → `/parties/[id]/statement?book=shop`. |
| Loading | FR-1 kept: the header paints at once from the cached list row (`cachedRow`), the rest shimmers (detail skeleton family); balance shows a small "Updating" while `status='refreshing'`. |
| First use | no Shop lines: "No bills or payments yet · Bills and payments with this person will show here." plus "+ New bill" (customer) or "+ Purchase bill" (supplier) as the empty state's action. |
| Error | detail failed and nothing cached: "Couldn't open this customer" + Try again + "Back to Customers". Not found: "This customer isn't in your book" + Back. |
| Partial failure | lines failed: only that card says "Couldn't load bills and payments · Try again"; relations or module panel failed: that panel only. |
| Success | after a payment: dock button returns to idle, balance and lines refresh (invalidation `postPayment` must refetch `partyDetail`; a declared `patch` that no reducer performs is the LED-01 defect, check it). |
| Offline | cached detail readable with "As of …"; Receive payment opens and saves on this phone if the outbox covers payments (§0.2), otherwise disabled with the reason; Edit/Archive disabled "Needs internet". |
| No permission | no `payments.payment.write`: dock shows only "+ New bill" (if allowed) — never a disabled Receive; no `ledger.entry.read`: no Statement row; staff cannot Archive. |
| Archived | amber banner "Anita Verma is archived" + Restore (owner); no dock; lines read-only. |
| Long names, big amounts | name wraps 2 lines in the header (never "Ramesh Trad…", the LED-04 lesson); "To collect ₹12,40,378.00" on its own line at 320 px; dual-role figures stack vertically below 360 px. |
| 320 px Hindi | dock buttons "भुगतान लें" / "+ नया बिल" in two equal columns; if either label exceeds its box, the bar stacks (same rule as `UbTotalDock` TV-03). |
| Thousands of rows | lines keyset-paged ("Load more", `timelinePaging.ts`); a 5,000-line customer stays smooth. |
| Repeated taps | dock button opens one drawer (second tap ignored while the chunk loads; the button shows its spinner after 120 ms because the drawer is `dynamic()`). |
| Expired session | shell sheet, then back to this page. |
| Accessibility | balance is a labelled group "To collect, 445 rupees, last Shop activity 16 October"; both roles read as two separate sentences; dock is a `region` "Actions for Anita Verma"; ⋯ returns focus to itself after any dialog (QA D1). |
| Must keep working | DEC-019 book from `useAppWords`; `canRecord` false in the Shop book (no You gave/You got); `canPay` / `canCollect` gates; drawers `dynamic()` (+58.6 KB lesson); archive guard on any non-zero balance, server-side; `/parties/[id]` keeps working for Udhaar and Library with their own books. |
| Fewer taps | Receive payment was ⋯ → Record payment (2 taps + reading a menu); now 1 tap from the dock, amount prefilled with what is due. |

**C-1 (current problem)**: in the Shop book the page has no visible main action: Record payment and Pay supplier live only in the ⋯ sheet (`PartyHeaderMenu.tsx`, `PartyDetailPageContent.tsx:457-465`) and the bottom bar is hidden on this page. P-08-01 docks them.

**C-2 (current problem, DEC-019 leak)**: the archive dialog's "Record payment" opens the **Udhaar** entry drawer (`PartyDetailPageContent.tsx:713-727`, `entryForm.openEntry`) and its write-off path writes off the Udhaar `balance` (`parties/services/write_off.py`), even when the page was opened from the Shop. In the Shop book the blocked dialog must say "Anita owes ₹445 on bills" (the server already returns `parties.archive.owesOnBills` from `shop_balance`, `backend/apps/parties/services/archive.py:150`) and its button must open §6 (Receive payment) — no write-off offered. Frontend-only fix; no endpoint change.

Tracking: problems — C-1, C-2 · decisions — P-08-01 dock content (Q2 for the owner) · dependencies — TV-02 for Remind; invalidation entry for payments → partyDetail · risks — dock covers the last line: `--ub-nav-offset`-style padding via `UbBottomBar` (already publishes its height) · approval — pending · build — not started · tests — `e2e/ledger.mjs` shots extended to `?book=shop`, scrollWidth at 320, double-tap on the dock, archive-blocked in Shop opens the payment drawer · outcome — —

### 3.2 Overlays opened from the person page

| Overlay | Spec (all are `dynamic()` and keep their current fields and validation) |
|---|---|
| **Edit customer / supplier** · `PartyFormDrawer`, `PATCH /parties/{id}` | Right drawer 440 px desktop, full-height sheet phone. Name, mobile, type (customer / supplier / both), GSTIN and address under "More details", tags (create inline). Save "Save changes" → busy "Saving…"; leaving dirty asks "Leave without saving?" (`#settings`); a duplicate mobile shows the server's message on the field. Offline: Save disabled "Needs internet". The **opening balance and credit limit fields are not shown** in the Shop book (Udhaar tools). |
| **Archive** · `PartyArchiveDialog`, `POST /parties/{id}/archive` (keyed) | Consequence-first, as `#billactions`: "Archive Anita Verma? She leaves Customers. Her bills and payments stay. You can restore her." Buttons Keep (focused by default — the autoFocus dialog fix) · Archive. Blocked (409): swaps in place to "Anita owes ₹445 on bills. Receive it first." + **Receive payment** (opens §6 prefilled ₹445) — C-2 fix. Open records (open orders, deposits) listed from the server's answer. |
| **Restore** · `POST /parties/{id}/restore` | Button in the archived banner, busy "Restoring…", snackbar "Anita Verma is back in Customers". |
| **Remind** · `PartyReminderSheet` / `UbShareSheet` | Only after TV-02 gives the Shop its own reminder text (today the reminder is the Udhaar book's and is hidden on the Shop page, `PartyDetailPageContent.tsx:454`). Same honest wording as the receipt message: "WhatsApp opened", never "Reminder sent" (DEC-012). |
| **Show UPI QR** · §8 | |
| **Settle two balances** · §3.3 | proposal only. |

### 3.3 Settle a customer who is also a supplier — **proposal only, not built** (R-DEC open)

| Field | |
|---|---|
| Purpose | The one explicit step that may net a customer balance against a supplier balance (02 §1.4). |
| Layout | Dialog (desktop) / sheet (phone), exactly `#customers` "Settle Ramesh Traders' two balances · No cash changes hands": the two figures side by side; "Amount to settle" prefilled with the smaller (₹600), capped at it; "After this: He owes you ₹400 · You owe him ₹0"; plain description of what is recorded; buttons Keep separate (default focus) · Settle ₹600. |
| What it would record | design proposal: one receipt of ₹600 from Ramesh (customer side) and one payment of ₹600 to Ramesh (supplier side), mode "Settled against each other", linked, dated today, cancellable only together. **Needs a backend proposal (new linkage and a mode)**: to be written in 08 as BP-08 by the coordinating session; nothing here assumes it. |
| Where offered | Customers/Suppliers row action "Settle…" for dual-role people, the person page ⋯, the bill "Something's wrong" sheet (`#billactions`, disabled with its reason for others). |
| States | the two figures changed meanwhile → refuse with the new figures (server check); either side zero → not offered; duplicate taps → keyed. |
| Until decided | nothing is shown; the Ramesh row keeps "Remind" / "Pay" like any other. |

Tracking: Q1 for the owner · BP-08 to be written · tests — figure check that neither list ever shows a netted figure (G7).

## 4. Statement in the Shop book · `/parties/[id]/statement?book=shop`

| Field | |
|---|---|
| Purpose | A passbook the shopkeeper can put in front of a customer or supplier who disputes a figure, and print or send. |
| Who and when | At the counter during a dispute, or month end. |
| Phone layout | Back + "Statement · Anita Verma" (name wraps; never cut — LED-04 fix). Period chips: This month · Last month · This year · Custom (`STATEMENT_PRESETS`); custom opens `UbDateRangePicker`. Summary: Brought forward · Bills ₹ · Payments ₹ · Closing "To collect ₹445". Rows as stacked cards: date, particulars (bill / receipt number in words), amount with its column word ("Bill" / "Paid") and running balance under it. Toggle "Show cancelled lines". Docked bar: **Print or save PDF** (primary) · Share · Download (CSV) in ⋯. |
| Desktop layout | Ruled passbook table: Date · Particulars · Bill (Out) · Paid (In) · Balance; filter bar on top; actions right in the header. Column words in the Shop book come from `SHOP_STATEMENT_WORDS` ("Out" / "In" today; proposed "Bills" / "Paid" for customers and "Bills" / "You paid" for suppliers — copy only). |
| What matters most | closing figure and direction → the rows that make it up → print. |
| Components | `PartyStatementPageContent`, `StatementFilterBar`, `StatementPrintView` (print sheet via `window.print()`), `DepositHeldBlock`, `UbDateRangePicker`, `UbSwitch`, `UbDataGrid`/rows, `UbBottomBar`. |
| Navigation | from the person page ⋯ (first row); a row opens its bill or receipt; Back → person page. |
| States | **Loading**: header + 8 row skeleton; **empty period**: "Nothing in this period · Closing balance ₹445 (same as brought forward)"; **first use** (no lines at all): "No bills or payments yet"; **before opening**: existing warning; **refused range** (> allowed span): field message, not a page error; **error**: page error with Try again; **partial**: deposits block fails alone; **success** of print: browser dialog; EC-9 print blocked in a PWA → "Your phone blocked printing. Use Share → Save as PDF" banner (existing); **offline**: last loaded period readable, period change disabled "Needs internet"; **no permission**: no ledger read → the ⋯ row is not shown, a direct link shows the no-access page; export is throttled separately from viewing (CLAUDE.md LED-04) — a 429 on Download says "Too many downloads this hour. Try after {time}." |
| Long names, big amounts | ₹12,40,378.00 balance column fits at 320 px because rows are cards; print sheet uses tabular figures and wraps particulars. |
| 320 px Hindi | period chips scroll; column words "बिल" / "जमा". |
| Thousands of rows | keyset pages with `carried_forward()` (the page-two window trap is written into the selector; must keep); print fetches the whole period before `window.print()` with "Preparing 1,240 lines…" progress. |
| Repeated taps | Print: one fetch then one dialog (`wantsPrint` ref); Download: busy until the file starts. |
| Expired session | shell sheet; period kept in the URL. |
| Accessibility | table caption "Statement for Anita Verma, 1 to 31 October"; running balance read with its direction; print view has a real heading order. |
| Must keep working | running balance from the SQL window function, never stored; closing of an unbounded statement equals `shop_balance` (BR-3); `?book=shop`; printed sheet signed with the business name only — **no product name or domain** (`customerDocumentsCarryNoProductName.test.tsx`). |
| Fewer taps | Print is docked (was a header button off-screen on phones). |

Tracking: problems — "Out/In" words · decisions — keep window function and print path · dependencies — share links (`parties_share_link`, CR C1 decided) for a Share-as-link; until built, Share sends the printed PDF via the system share sheet · risks — print on iOS PWA · approval — pending · build — not started · tests — `e2e/statement.mjs` + shots with `?book=shop`, closing = `shop_balance` · outcome — —

## 5. Tags manager · `/parties/tags`

| Field | |
|---|---|
| Purpose | Name groups of people (Route 2, Camp Area) to filter and remind by group. |
| Who and when | Owner, occasionally. |
| Phone layout | Back + "Tags" + "+ New tag". Line "184 of 200 tags used" (FR-13). Search. Cards: colour dot, tag name (2 lines), "34 people" link → `/customers?tag=Camp Area`, ⋯ (Rename, Change colour, Merge into…, Delete). Unused tags first under "Not used by anyone". |
| Desktop layout | table Name · People · Colour · Actions; client-side search and sort (≤ 200 rows by design). |
| Components | `PartyTagsPageContent`, `PartyTagFormDialog`, `PartyTagMergeDialog`, `PartyBulkTagDialog` (from lists), `UbTag` (palette tokens `viz-1…8`, theme-aware), `UbDataGrid`. |
| Actions | new, rename, recolour, merge (dry-run count first: "34 people move to Route 2"), delete ("Removes the tag. All 34 people stay."). |
| Navigation | from list header (Tags link) and ⋯ sheet on phones; count link opens the Shop list filtered — **in the Shop the link goes to `/customers?tag=`, not `/parties`**, so the person stays in their app's book (today the manager links to `/parties?tag=`, which reads the Udhaar book: verify and fix the target per open app). |
| States | loading list skeleton; first use "No tags yet · Tags group people, like 'Route 2'. + New tag"; error with Try again; partial: a merge dry-run fails → the merge dialog says so and keeps the choice; success snackbars "Renamed to Route 2", "Merged 34 people into Route 2"; offline read-only with reason; no permission: read-only list, no ⋯ (counts still useful); 200 reached: New tag disabled with "You've used all 200 tags. Delete or merge one first." |
| Long names, Hindi | tag names wrap; a comma is refused at entry (EC-14) with "A tag name can't have a comma"; "Rename" never renders as "e" (PTY-05 defect) — measured. |
| Thousands | max 200 tags; counts come from the server. |
| Repeated taps | create is idempotent by name (200 returns the existing tag); merge replays 404 → treated as done; delete button busy. |
| Expired session | shell sheet. |
| Accessibility | colour is never the only cue (name always shown); dialogs return focus to the row ⋯. |
| Must keep | tags travel by NAME in the URL; case-insensitive match; undo built from what the server wrote. |
| Fewer taps | count link filters the list in one tap. |

Tracking: problems — count link target per app (verify) · decisions — none new · dependencies — none · risks — low · approval — pending · build — not started · tests — `e2e/tags.mjs --shots` · outcome — —

## 6. Receive payment / Pay supplier drawer · `PaymentFormDrawer`

Opened from: person page dock, Customers/Suppliers row (Pay), `/payments` header, invoice and purchase bill pages (`RecordPaymentButton`), Collect QR "Mark received", Home "Receive money" and find-or-start ("mohan 2000"). One drawer for all, `dynamic()`.

| Field | |
|---|---|
| Purpose | Take money from a customer (or pay a supplier) against their bills in a few seconds, with no doubt about what it settles. |
| Who and when | Counter staff mid-queue; amount typed with the number keypad. |
| Phone layout | Bottom sheet to 92% height, grab handle. Header "Receive payment" + "Anita Verma · owes ₹445" + × ("Close without saving"). Body (scrolls between header and footer): **Customer** (picked, with "1 unpaid bill"; a picker when opened from `/payments`, `ExpensePartyField`); **Amount** focused with `inputmode="decimal"`, prefilled with what is due (`defaultAmount`), helper "₹245 will still be due after this."; **Paid by** chips Cash · PhonePe · Google Pay · Paytm · Other UPI · Card · Bank (`PaymentMethodField`; last used on this device, `LAST_MODE_KEY`) with reference for non-cash; **+ Split into two ways** (`PaymentModeEditor`, up to `MAX_MODE_LINES`, "Fill remaining ₹…"); **Auto, oldest first** switch (on) with the bill rows showing what each gets ("INV-0412 · 8 Oct · ₹445 left → ₹200 · ₹245 left"); **More details** collapsed "Today · no note ▾" (date with Today/Yesterday, max today; private note "Only you and your staff see this. It is never put in a receipt or message."). **Footer** (sits on the keypad, visual viewport): "Still due after this ₹245" left, Cancel, **Receive ₹200** (marigold). |
| Desktop layout | 440 px right drawer, same order; Enter in Amount moves to Paid by; `Ctrl ↵` saves. |
| Pay supplier | same drawer `direction='out'`: title "Pay supplier · Mahalaxmi Wholesale · you owe ₹5,000", bills are purchase bills, button **Pay ₹5,000**, hint "Money paid to a supplier. It settles their oldest bills first; anything more stays as advance with them." From `/payments` the direction is a two-chip choice "Money in · Money out" (`UbChoiceChips`). |
| What matters most | who and how much → what stays due → the button with the exact amount. |
| Components | `PaymentFormDrawer`, `PaymentModeEditor`, `PaymentAllocationPicker`, `BillPickRow`, `UbMoneyInput`, `UbChoiceChips`, `UbSwitch`, `UbDisclosure` (More details, NEW use here), `UbDateInput`, `UbConfirmDialog` (early date), `UbStatusBanner`, `CompactDrawer`. Nothing NEW. |
| Main / other | Receive ₹X (Pay ₹X) / split mode, untick Auto and type per bill ("Fill ₹…", "Max ₹898"), change date, note, Cancel. |
| States (from `#pay`) | **Ready**: as above. **Several bills**: Mohan Dairy ₹2,000 UPI over three bills, two "clears it", third "₹860 left". **Amount missing**: only after pressing Receive, "Enter an amount." — never on open (mode `onTouched` + the `MLDialog` focus fix). **More than due**: amber "₹155 more than she owes. It stays with her as advance, not a refund." and an "Advance · ₹155 · Shop book" row before saving. **Changed elsewhere**: amber banner "Anita's dues changed on another device. She now owes ₹245, not ₹445." + "Use the new figures" — today the server answers `document_not_open` only when a bill closed; a lower due on a still-open bill is not caught → **P-08-04**: re-read `GET /payments/open-documents` when the app regains focus and just before Save (client only); a server-side due check is a BP candidate. **Saving**: button "Receiving…" busy, fields locked, Cancel disabled. **Didn't go through**: red banner, everything kept, "Try again" same key. **Saved**: see Success. **Early date**: confirm "Payment dated before the bill" (existing). **No open bills**: "No unpaid bills. The full ₹500 is kept as advance for the next bill." **Allocation over**: "You've put ₹700 on bills but are receiving only ₹500." Save disabled until fixed. |
| Loading | open documents skeleton (2 rows) while the amount is already typeable; button enabled (server allocates FIFO under its lock if the preview is not back). |
| Error / partial | open-documents read failed: rows area says "Couldn't load bills · Try again"; saving still allowed with Auto (server decides) and the footer says "Bills will be matched oldest first when saved." |
| Success | today the drawer swaps to a saved panel ("Received ₹200 · RCT/26-27/0233", advance line) with Done and View receipt, **and** a snackbar says the same. Proposed: saved panel keeps one message (no duplicate snackbar while it shows) and gains **Share receipt** (primary, opens §9 directly) and Print; Done closes. When the global snackbar gains an action slot (needed by Udhaar undo too), switch to the design's close + toast "Received ₹200 from Anita Verma. ₹245 still due · RCT-0233 · Share receipt" — Q3 for the owner. |
| Offline | see §0.2 (queue if the outbox covers it, else disabled with reason). Bills shown are "as of" the last read. |
| No permission | without `payments.payment.write` the drawer is never offered (all openers hide it); opened by a stale link: info banner "You can see payments but not record them." and no button. |
| Long names, big amounts | header name wraps; ₹12,40,378.00 fits the amount field at 320 px (field is full width); bill rows put the amount under the number below 360 px. UPI single-payment cap hint shown only on the QR sheet. |
| 320 px Hindi | footer stacks "बाकी रहेगा ₹245" above the buttons when "₹200 लें" + Cancel don't fit (TV-03 rule). |
| Thousands | a supplier with 400 open bills: the list shows the 20 oldest and "Show all 400" (client); Auto still allocates server-side over all. |
| Repeated taps | locked button + `UbForm` in-flight guard + same idempotency key → one receipt (double-tap script, 11). |
| Expired session | sheet over the drawer; after sign-in the drawer is still open with values; Save resends with the same key. |
| Accessibility | sheet is a dialog labelled "Receive payment from Anita Verma"; amount focused on open; the "still due" figure is `aria-live="polite"`; banners `role="alert"` only for failure; keypad does not cover the footer (visual-viewport, device-verify). |
| Must keep working | FIFO preview is a preview; server allocates under lock (FR-5); payment-mode lines sum to the amount (never typed); `confirmEarlyAllocation`; `toFormPath` server error mapping; `bucket` sent where the context has one; key rotation rules; `dynamic()` everywhere. |
| Fewer taps | prefilled amount + remembered mode: open → Receive = 2 taps for a full payment; find-or-start "mohan 2000" opens it filled. |

Tracking: problems — duplicate success feedback; no "changed elsewhere" check; jargon copy · decisions — copy and states from `#pay` · dependencies — P-08-04, snackbar action slot (Q3), outbox verification · risks — keypad/footer on iOS · approval — pending · build — not started · tests — PaymentFormDrawer unit tests kept; double-tap and forced-failure retry; 320 px Hindi shots of all 8 states · outcome — —

## 7. Apply advance to bills · `ApplyAdvanceDialog`, `POST /payments/{id}/allocations` (keyed)

| Field | |
|---|---|
| Purpose | Use money kept as advance on bills made later. |
| Layout | Dialog desktop / sheet phone from the receipt page "Apply to bills": "Apply RCT/26-27/0233 to bills · ₹3,000 not used yet"; open bills oldest first, prefilled oldest first, each editable with "Max ₹…"; footer "Applying ₹1,770 · ₹1,230 stays as advance"; Cancel · **Apply ₹1,770**. |
| States | loading rows skeleton; no bills "No unpaid bills for Anita right now. The advance stays."; a bill paid elsewhere meanwhile → server's words above the button, list re-read; saving "Applying…"; success snackbar "Applied ₹1,770 to 2 bills" and the receipt's "Settled" list updates; offline disabled "Needs internet"; no permission: button absent. |
| Must keep | no ledger line moves (the money was already in the book); `bucket` of the payment sent to open-documents. |
| Repeated taps / session | keyed scope `payment_allocate`; same key on retry. |
| Accessibility | each row's input labelled "Amount for INV-0402, at most 1,300 rupees". |

## 8. Collect by UPI QR · `CollectQrSheet`

| Field | |
|---|---|
| Purpose | Show the shop's UPI QR for an amount; the customer scans and pays. |
| Layout | Sheet (phone, full width, turned to the customer) / dialog (desktop): "Collect from Anita Verma"; amount (prefilled with what is due) → **Show QR**; the QR black on white in any theme (`UbQrCode`, server encoder `GET /payments/qr.svg`, intent `POST /payments/upi-intent`, exempt from keys because it writes nothing); "Scan with any UPI app"; Open UPI app (phone); **Mark received** (opens §6 with UPI and this amount). "Showing a QR records nothing" stated under the QR (BR-7). |
| States | no UPI ID set: "Add your UPI ID in Business profile to show a QR" + link (owner) / "Ask the owner to add a UPI ID" (staff); amount over the common cap: hint "UPI limit ₹1,00,000 per payment in most apps"; QR failed: "Couldn't make the QR · Try again"; offline: QR can't be made (needs server) → "Needs internet"; loading: QR-shaped skeleton; no write permission: QR shown, no Mark received. |
| Accessibility | QR has `aria-label` "UPI QR for 445 rupees to Shree Ganesh Kirana"; amount and payee repeated as text. |
| Must keep | nothing names the product; the QR payee is the business. |

## 9. Payments · `/payments`

| Field | |
|---|---|
| Purpose | Every receipt and supplier payment in the Shop, to find one, check a day, or cancel a wrong one. |
| Who and when | Owner at day end; staff finding a receipt to reprint. |
| Phone layout | Reached from the App sheet "More in Shop → Payments". Header "Payments" + "+ Receive payment". Two figures: **Received ₹18,240 · 42 payments** and **Paid out ₹9,600 · 6 payments** (separate, never netted; voids not counted). Search "Name or receipt number"; Filters button (sheet: Show All · Received · Paid out · Cancelled; Period; Mode). Cards: name (or "Walk-in customer"), "RCT/26-27/0233 · Cash · 4:31 pm", amount with "received"/"paid" word; cancelled rows struck through with a "Cancelled" badge. Show more. |
| Desktop layout | tabs All · Received · Paid out · Cancelled; period chips + mode select in the filter bar; table Date · Number · Name · Mode · Amount · Status; row opens the receipt. |
| Components | `PaymentsPageContent`, `PaymentColumns`, `UbStatCard`, `UbDataGrid`, `UbFilterSheet`, `UbFilterSelect`, `UbChipTabs`, `PaymentFormDrawer` (lazy). |
| Navigation | row → `/payments/[id]`; + Receive payment → §6 with `entry='list'` (direction chips). Shared route: keeps the open app via `history.state` (04 §2). |
| **Book (C-3)** | the list request sends no app or bucket today (`paymentService.ts:220` sends `bucket` only when a filter sets it), so a business with the Library on may see fee receipts in the Shop's Payments. **Verify on a two-app seed**; if confirmed, send `bucket=shop` from the Shop (the server already has the filter, `backend/apps/payments/filters.py:36`) — frontend only, no endpoint change. |
| States | loading skeleton + figure shimmer; first use "No payments yet · Money a customer pays against bills shows here" + Receive payment; period empty "No payments in this period" + change period; filtered empty + Clear filters; error with Try again; stale banner over saved rows; offline cached readable; no permission page "Payments are not available to you"; success after a new payment: row on top + snackbar. |
| Long / big / Hindi | names wrap; ₹12,40,378.00 on its own line; "रद्द" badge; tabs scroll at 320 px. |
| Thousands | server paged; default period "This month" keeps the first page small. |
| Repeated taps | row open guarded; + Receive opens one drawer. |
| Accessibility | figures as labelled group; cancelled rows say "Cancelled" in words; table caption. |
| Must keep | totals over the filtered set; voids visible and struck (PAY-05 FR-8); filters in the URL. |
| Fewer taps | search by receipt number finds a receipt in one step. |

Tracking: problems — C-3, jargon "Void" · dependencies — two-app seed check · risks — low · approval — pending · build — not started · tests — payments e2e (new harness or journey extension), `bucket=shop` network assertion · outcome — —

## 10. Payment receipt · `/payments/[id]`

| Field | |
|---|---|
| Purpose | The receipt as it will print (A5), and what can be done with it: share, print, apply advance, cancel. |
| Phone layout | Back + "RCT/26-27/0233" + "Anita Verma"; badges Received / Cancelled. Summary panel: Date, Amount and how it was paid (mode lines), **Settled** list ("INV-0412 · ₹200 · ₹245 still due"), "₹155 not used yet · Apply to bills" when there is advance, private note (staff only), Recorded by. Then the receipt preview (scrolls sideways inside its own box only). Docked: **Share receipt** (primary) · Print · ⋯ (Cancel receipt — owner/admin; "Ask owner to cancel" for staff, copies a message). Cancelled: red-free grey banner "Cancelled on 17 Oct · Reason: wrong customer" + **Record again** (prefilled drawer). |
| Desktop layout | header actions Share receipt · Print · ⋯; panel left, preview right. `?print=1` opens print on arrival. |
| Components | `PaymentReceiptPageContent`, `PaymentReceiptPrint` (lazy), `VoidPaymentDialog` (lazy), `ApplyAdvanceDialog` (lazy), `PaymentFormDrawer` (lazy), `UbShareSheet`, `UbInfoRow`, `UbPanel`, `UbStatusBadge`, `UbBottomBar`. |
| States | loading detail skeleton; not found / error page with Back to Payments; partial: share text fails to load → Share button shows "Couldn't prepare the message · Try again" (snackbar), Print still works; success of print/share as below; offline: cached receipt readable and printable, Share needs the server text → disabled "Needs internet", Cancel disabled; no permission: no `payments.payment.read` → no-access page. |
| Long / big / Hindi | name wraps; ₹12,40,378.00 in the A5 print fits (tabular, 2 lines if needed); receipt print in the business's language choice. |
| Repeated taps | Share: one `POST /payments/{id}/share` (key minted by caller) then one sheet; Print once. |
| Accessibility | print preview region labelled and keyboard-scrollable (Sprint 12 fix kept). |
| Must keep | print/PDF and message carry **no product name or domain**; voided receipt keeps its number. |

### 10.1 Cancel receipt (void) · `VoidPaymentDialog`, `POST /payments/{id}/void` (keyed)

Consequence-first like `#billactions`: title "Cancel RCT/26-27/0233?"; "What will change" list computed from the held receipt — "INV-0412 will be due again: ₹445", "₹155 advance is removed", deposit lines; reason (quick chips + 3–160 characters); footnote "The receipt keeps its number and shows as Cancelled. This can't be undone."; Keep receipt (default focus) · **Cancel receipt** (destructive). Saving "Cancelling…"; failure keeps the reason; success: banner swaps in place, snackbar "RCT/26-27/0233 cancelled". Walk-in warning kept. Offline disabled. Staff: not shown (Ask owner instead).

### 10.2 Receipt message · `UbShareSheet` (design `#share`)

| Field | |
|---|---|
| Layout | Sheet/dialog "Share receipt · RCT-0233 · ₹200 from Anita Verma"; To: name and mobile; **Message** editable (server text from `POST /payments/{id}/share`): "Namaste Anita Verma, Received ₹200 in cash on 17 Oct 2026 for bill INV-0412. Receipt RCT-0233. Still due: ₹245. Receipt: https://…/d/… Shree Ganesh Kirana"; "Use the default text"; counter "of 900 characters"; honest line "Sends this text with the link to the receipt page. The app you choose opens with it, and you press Send there, so we can't tell whether it was delivered. Closing this sends nothing. Your private note is not included."; buttons Copy text · SMS · **Open WhatsApp**. |
| States | no mobile: To shows "No mobile saved · Add mobile", WhatsApp opens the contact picker; text failed to load: retry; offline: Copy text works from cached text only if loaded; Hindi text when the business language is Hindi. |
| Feedback | "WhatsApp opened" (never "Sent", DEC-012); Copy → "Copied". |
| Must keep | the private note is never copied in; the message and `/d/` page are signed with the business name only. |

Tracking (§10): problems — "Void" wording; Share placement on phones · decisions — Share is the primary action on a receipt · dependencies — none · approval — pending · build — not started · tests — receipt print shot with `emulateMedia print`, share sheet text check for no product name · outcome — —

## 11. Cash book · `/cashbook`

| Field | |
|---|---|
| Purpose | "How much cash should be in the drawer, and how much in the bank?" for the Shop. |
| Who and when | Owner at closing time; accountant monthly. |
| Phone layout | Header "Cash book" + "+ Add expense". Period chips Today · Yesterday · This week · This month · Custom (range in the URL); Cash · Bank · Both switch. Four figures as a 2 × 2 grid: Opening · In · Out · Closing, each with "as on 1 Oct" / "in this period" (`UbStatCard`). Days newest first (`CashbookDayCard`), today open: "17/10 · Sat — In ₹12,400 · Out ₹3,180 · Closing ₹41,220"; rows "Received from Anita Verma · Cash +₹200", "Rent −₹12,000". In green with "+", out plain ink with "−" (an expense is not an error). **Close the day** panel when the range is today: "Count the cash in your drawer" → "Matches" or "Short by ₹120" with the fixes it can do: **Add the missing expense** and **Receive a payment you forgot** (payments exist now; the code comment saying they don't is stale, `CashbookPageContent.tsx:55`). Counted cash is stored nowhere (FR-8), and the screen says so. |
| Desktop layout | figures in one ruled line of four; days as a list with expandable rows; close-the-day panel on the right. |
| Components | `CashbookPageContent`, `CashbookDayCard`, `UbStatCard`, `UbDateRangePicker`, `UbChoiceChips`, `ExpenseFormDrawer` (lazy), `PaymentFormDrawer` (lazy, NEW opener). |
| Navigation | from App sheet More / sidebar Money; a row opens its receipt or expense. |
| States | loading figure + day skeletons; first use "No money in or out yet · When you receive a payment or pay an expense, each day's cash and bank show here" + Add expense; quiet range "No money came in or went out in this range" (controls kept); error with Try again; partial: one source (e.g. sales cash) fails → that figure says "Couldn't load sales cash" and Closing says "Not complete"; negative closing in error tone with its label "Cash below zero — an entry is probably missing" (BR-9); offline cached; staff scope banner (existing `cashbook.staffScope`); no permission page. |
| Opening | "Opening is everything recorded before 1 Oct" (the opening cash anchor screen is not built; say where it comes from, don't offer a control). |
| Long / big / Hindi | day header wraps to two lines below 360 px; ₹12,40,378.00 fits the figure tiles (2 × 2, figures on their own line). |
| Thousands | days paged by range; a month of a busy shop is ~30 day cards, each lazy-expanded. |
| Repeated taps | Add expense / Receive open one drawer. |
| Accessibility | each figure labelled; in/out said in words, not only colour; close-the-day result `aria-live`. |
| Must keep | Shop-only on the server (`app="shop"`, bucket SHOP); unpaid expenses never appear (BR-4); voided items noted per day. |
| Fewer taps | close-the-day offers the fix in place. |

Tracking: problems — stale "payments not built" assumption; name "Cashbook" · decisions — add Receive as a close-the-day fix · dependencies — none · risks — low · approval — pending · build — not started · tests — cashbook unit tests kept; shots at 320 Hindi · outcome — —

## 12. Expenses · `/expenses`

| Field | |
|---|---|
| Purpose | Note every rupee that goes out (rent, tea, transport) so the cash book tallies; see where money went. |
| Phone layout | Header "Expenses" + "+ Add expense" (FAB on phones). Period chips; Filters (category, mode). Total "₹41,230 · 62 expenses" and the top 3 categories under it. Tabs All · Unpaid · Cancelled. Cards: category, "EXP/26-27/0031 · Cash · 17 Oct", note, amount; Unpaid badge with "owed to Gupta Oil Mills". |
| Desktop layout | filter bar (period + category + mode), tabs with search, table Date · Number · Category · Paid to · Mode · Amount · Status; row opens the detail drawer. |
| Components | `ExpensesPageContent`, `ExpenseColumns`, `UbStatCard`, `UbDataGrid`, `ExpenseFormDrawer`, `ExpenseDetailDrawer`, `VoidExpenseDialog` (all lazy). |
| States | loading; first use "No expenses yet · Rent, salaries, tea, transport — note every rupee that goes out so the cash book tallies." + Add expense; filtered empty + Clear filters; error; stale; offline cached + Add queued if covered (§0.2); no permission page; app-scoped: `expenseAppOf(app)` sends `app=shop` so Library rent never shows here (DEC-019, QA B10). |
| Long / big / Hindi / thousands / taps / session / a11y | as §9. |
| Must keep | total over the filtered set; voids visible; app scoping. |

### 12.1 Add expense · `ExpenseFormDrawer`, `POST /expenses` (keyed)

| Field | |
|---|---|
| Layout | Sheet/drawer "Add expense": **Amount** first and focused (numeric keypad); Category (create inline, `ExpenseCategoryField`); Date (Today/Yesterday); **Paid now** on: "Paid by" chips + reference; off: "I still owe this" → **Owed to** (party picker) + **Pay by** date and hint "This is added to Gupta Oil Mills' Shop balance as money you owe." Note optional. Footer: **Save** (marigold) · "Save and add another". |
| DEC-019 check | an unpaid expense posts a credit through `post_source_entry` without a bucket (`backend/apps/expenses/services/ledger_link.py:67-96`), so the bucket is the source's registered one; the copy today says "in the khata of {name}". **Verify the expense source's bucket is `shop` when the expense is the Shop's**; the copy must say "Shop balance", never "khata". |
| States | Amount missing only after Save; saving "Saving…"; failed keeps values, same key; success snackbar "Saved ₹500 · Tea and snacks · EXP/26-27/0031"; "Save and add another" clears amount and note, keeps category, date and mode, rotates the key, focuses Amount; offline queued or disabled; read-only banner; receipt photo **not offered** (no `/attachments`). |
| Fewer taps | "₹500 tea, cash, today" = amount, category chip, Save: three taps. |

### 12.2 Expense detail and cancel · `ExpenseDetailDrawer`, `VoidExpenseDialog`, `POST /expenses/{id}/void` (keyed)

Detail drawer: number, status badge (Paid / Unpaid / Cancelled), category, date, mode, reference, paid to / owed to, pay by, note, recorded by, and for unpaid "This is in Gupta Oil Mills' Shop balance as money you owe." One action: **Cancel expense** (needs `expenses.expense.void`), consequence-first: "Cancel EXP/26-27/0031 · ₹12,000 rent? It leaves the cash book." (paid) or "…It also comes off Gupta Oil Mills' balance." (unpaid); reason required; Keep (default focus) · Cancel expense. Success swaps the badge in place (AC-6). Edit and Duplicate are not offered (not built).

Tracking (§12): problems — "khata" copy for unpaid expenses; bucket to verify · decisions — none new · dependencies — bucket check · approval — pending · build — not started · tests — expenses unit tests, double-tap on Save and on Save-and-add-another · outcome — —

## 13. Proposals raised by this file (for the coordinating session to log)

| ID | What | Kind | Needs |
|---|---|---|---|
| P-08-01 | Docked main action on the Shop person page (Receive payment / Pay supplier / + New bill) | frontend | owner (Q2) |
| P-08-02 | Shop-book archive dialog opens Receive payment, no Udhaar write-off (C-2) | frontend bug fix | none beyond review |
| P-08-03 | "Late by" days / "Due this week" per party in the Shop list, as a field and a filter | **backend** (list annotation + filter) | a BP in 08 with tests on the 2k-party plan (`test_party_list_plans.py`) |
| P-08-04 | Re-read open bills before Save and on focus ("changed elsewhere") | frontend; server due-check later as a BP | — |
| P-08-05 | Scope `/payments` to `bucket=shop` in the Shop (C-3), after verification | frontend | two-app seed check |
| P-08-06 | Copy renames in §0.3 | copy | i18n split/check |
| BP-08 (to write) | Settle a dual-role person (§3.3) | backend | owner decision first (Q1) |

## Review

Rubric and pass mark from [09](../09-design-review.md): Mobile 20%, Ease 15%, Visual 15%, Feedback 15%, A11y 10%, Desktop 10%, Safety 10%, Reuse 5%; pass strictly above 8.6. Scored only what this file specifies. Weighted = 0.20·M + 0.15·E + 0.15·V + 0.15·F + 0.10·A + 0.10·D + 0.10·S + 0.05·R.

### Round 1 (first draft) — fails

| Area | M | E | V | F | A | D | S | R | Arithmetic | **Weighted** |
|---|---|---|---|---|---|---|---|---|---|---:|
| Customers, Suppliers lists | 8.5 | 8.4 | 8.6 | 8.3 | 8.2 | 8.6 | 8.6 | 9.0 | 1.700+1.260+1.290+1.245+0.820+0.860+0.860+0.450 | **8.49** |
| Person page (Shop) + overlays | 8.0 | 7.9 | 8.4 | 8.2 | 8.1 | 8.4 | 7.8 | 8.8 | 1.600+1.185+1.260+1.230+0.810+0.840+0.780+0.440 | **8.15** |
| Statement | 8.5 | 8.5 | 8.6 | 8.4 | 8.3 | 8.7 | 9.0 | 9.0 | 1.700+1.275+1.290+1.260+0.830+0.870+0.900+0.450 | **8.58** |
| Tags manager | 8.4 | 8.5 | 8.5 | 8.4 | 8.3 | 8.7 | 9.0 | 9.0 | 1.680+1.275+1.275+1.260+0.830+0.870+0.900+0.450 | **8.54** |
| Payments list | 8.3 | 8.3 | 8.5 | 8.3 | 8.2 | 8.6 | 7.9 | 8.9 | 1.660+1.245+1.275+1.245+0.820+0.860+0.790+0.445 | **8.34** |
| Receive / Pay drawer + advance, QR | 8.4 | 8.3 | 8.5 | 8.2 | 8.2 | 8.5 | 8.4 | 8.8 | 1.680+1.245+1.275+1.230+0.820+0.850+0.840+0.440 | **8.38** |
| Receipt, cancel, message | 8.3 | 8.4 | 8.5 | 8.3 | 8.3 | 8.5 | 8.7 | 8.9 | 1.660+1.260+1.275+1.245+0.830+0.850+0.870+0.445 | **8.44** |
| Cash book | 8.2 | 8.3 | 8.5 | 8.3 | 8.2 | 8.5 | 8.8 | 8.9 | 1.640+1.245+1.275+1.245+0.820+0.850+0.880+0.445 | **8.40** |
| Expenses + form + cancel | 8.4 | 8.5 | 8.5 | 8.3 | 8.3 | 8.5 | 8.8 | 8.9 | 1.680+1.275+1.275+1.245+0.830+0.850+0.880+0.445 | **8.48** |
| **Module (mean of 9)** | | | | | | | | | 75.780 / 9 | **8.42** |

### Shortcomings found in round 1, and what changed

| Area | Shortcoming | Change made (now in the spec above) |
|---|---|---|
| Person page | The draft described the page as built: main action hidden in ⋯ on phones, bottom bar hidden too, so "receive money from this person" took a menu read (C-1) | docked Receive payment / Pay supplier / New bill (P-08-01), with a 320 px Hindi stacking rule |
| Person page | Draft missed that the archive dialog opens the Udhaar entry drawer and write-off in the Shop (C-2, DEC-019 leak) | Shop-book archive opens Receive payment, no write-off (P-08-02) |
| Person page | Dual-role figures could read as one | two labelled figures side by side, separate sentences for screen readers; settle as proposal only |
| Payments list | Book not checked: list may mix Library receipts into the Shop (C-3) | verify on a two-app seed, then `bucket=shop` (server filter exists) |
| Drawer | Saved state shown twice (panel + snackbar); no "changed elsewhere"; jargon ("Allocations exceed", "khata") | one success message with Share receipt as the next step; P-08-04 re-read; copy table §0.3 |
| Drawer | Offline behaviour assumed | class A queueable stated, with a verification gate and a fallback |
| Lists | Summary tiles pushed rows below the fold; "Late by" drawn as if it existed | one-line summary on phones; Late by marked as P-08-03 (server), not shown until built |
| Lists / Tags | Tag count link sends Shop users into the Udhaar book | link target per open app |
| Receipt | Share was a header button that runs off a phone; "Void" wording | Share docked as primary; "Cancel receipt" consequence-first dialog |
| Cash book | Close-the-day offered only "add expense" because of a stale assumption | adds Receive a forgotten payment; partial-source failure says "Not complete" |
| Expenses | Unpaid-expense copy says "khata"; bucket unverified | Shop wording; bucket verification listed |
| All | Repeated-tap, expired-session and 320 px Hindi rules repeated inconsistently | §0.2 and §0.3 apply to every screen, each screen lists only its specifics |

### Round 2 (current spec) — passes, provisionally

| Area | M | E | V | F | A | D | S | R | Arithmetic | **Weighted** |
|---|---|---|---|---|---|---|---|---|---|---:|
| Customers, Suppliers lists | 8.8 | 8.8 | 8.7 | 8.8 | 8.5 | 8.8 | 8.9 | 9.0 | 1.760+1.320+1.305+1.320+0.850+0.880+0.890+0.450 | **8.78** |
| Person page (Shop) + overlays | 8.8 | 8.8 | 8.6 | 8.8 | 8.5 | 8.6 | 8.7 | 8.8 | 1.760+1.320+1.290+1.320+0.850+0.860+0.870+0.440 | **8.71** |
| Statement | 8.8 | 8.7 | 8.7 | 8.7 | 8.6 | 8.8 | 9.1 | 9.0 | 1.760+1.305+1.305+1.305+0.860+0.880+0.910+0.450 | **8.78** |
| Tags manager | 8.7 | 8.7 | 8.6 | 8.8 | 8.5 | 8.8 | 9.1 | 9.0 | 1.740+1.305+1.290+1.320+0.850+0.880+0.910+0.450 | **8.75** |
| Payments list | 8.7 | 8.7 | 8.6 | 8.7 | 8.5 | 8.8 | 8.7 | 8.9 | 1.740+1.305+1.290+1.305+0.850+0.880+0.870+0.445 | **8.69** |
| Receive / Pay drawer + advance, QR | 8.9 | 8.8 | 8.7 | 9.0 | 8.6 | 8.7 | 8.8 | 8.8 | 1.780+1.320+1.305+1.350+0.860+0.870+0.880+0.440 | **8.81** |
| Receipt, cancel, message | 8.7 | 8.8 | 8.7 | 8.8 | 8.6 | 8.7 | 8.9 | 8.9 | 1.740+1.320+1.305+1.320+0.860+0.870+0.890+0.445 | **8.75** |
| Cash book | 8.7 | 8.7 | 8.6 | 8.7 | 8.5 | 8.7 | 8.9 | 8.9 | 1.740+1.305+1.290+1.305+0.850+0.870+0.890+0.445 | **8.70** |
| Expenses + form + cancel | 8.8 | 8.8 | 8.6 | 8.8 | 8.6 | 8.7 | 8.9 | 8.9 | 1.760+1.320+1.290+1.320+0.860+0.870+0.890+0.445 | **8.76** |
| **Module (mean of 9)** | | | | | | | | | 78.695 / 9 | **8.74** |

Every area is above 8.6; the weakest are Payments list (8.69) and Cash book (8.70). Payments list safety (8.7) is **conditional on C-3**: if the two-app check shows mixed books and the fix isn't made, safety drops to 8.2 and the area to 8.64 (8.685 − 0.05): a pass by 0.04 that this review will not accept for a book leak, so the area is treated as failing until C-3 is fixed.

### What each score still needs before it counts

| Score | Needs |
|---|---|
| Feedback (all areas) | tap-to-first-change and INP on the reference phone for: list row → person page, dock → drawer open (dynamic chunk), Receive → saved (05 §5–6); the double-tap script on Receive, Pay, Apply, Cancel receipt, Add expense, Save-and-add-another, Archive (11) |
| Mobile | keypad + docked footer on a real low-end Android and an iPhone (visual viewport); person-page dock above the gesture bar in the installed PWA; outbox proof that payments and expenses queue offline |
| A11y | axe at 390 and 1280 in both themes on all 20 screens; TalkBack reading of dual-role figures and the drawer's live "still due"; 200% text at 320 px Hindi |
| Visual | the measuring checks (scrollWidth and text-node vs box) at 320/360/390/768/1280, English and Hindi, for lists, person page dock, drawer 8 states, receipt, cash book; print shots (`emulateMedia print`) for statement and receipt |
| Ease | the 9-task script plus "take ₹2,000 from Mohan across three bills", "find who is most late", "cancel a wrong receipt", "share a receipt in Hindi" with 5–8 shopkeepers |
| Safety | C-2 and C-3 verified and fixed; expense bucket verified; statement closing = `shop_balance` on the scale seed; no-product-name test on receipt, statement and message; P-08-03 and BP-08 not built without 08 approval |
| Desktop | keyboard pass: `Ctrl ↵` save, Enter field order, focus return from every dialog to its ⋯ |

### Strongest criticisms still standing

1. Three findings (C-2, C-3, the expense bucket) are DEC-019 risks found by reading code, not by running it; until they are run on a two-app seed, the safety scores are claims.
2. "Late by" is the most useful number for collection and needs a server change; without it the Customers list sorts by "most to collect", which is not the same as "most late".
3. The success pattern (panel vs toast with action) is unresolved and touches the Udhaar undo too; deciding it twice would be the mistake CLAUDE.md warns against.

### Open questions for the owner

- **Q1 · Settling dual-role people** — record it as two linked payments (design proposal) / a new settlement record / don't offer it. Recommendation: two linked payments, written up as BP-08 before any build.
- **Q2 · Shop person page main action** — docked Receive payment + New bill (recommended) / Receive payment only / keep it in ⋯.
- **Q3 · After a payment saves** — keep the saved panel with Share receipt (works today, recommended now) / close and show a toast with Share receipt (needs the snackbar action slot, shared with Udhaar undo).
