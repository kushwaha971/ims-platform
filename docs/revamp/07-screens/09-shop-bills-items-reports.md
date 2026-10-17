# Shop: bills, purchases, items, stock, imports, reports and settings

Status: **specified (wave 2), not approved**, 17 Oct 2026. Planning and design only (R-DEC-01): nothing here changes code.
Read with [02](../02-preserve-and-contracts.md) (what must keep working), [05 §3–4](../05-feedback-and-performance.md) (feedback and duplicate protection), [06](../06-shared-components-and-architecture.md) (reuse), the template in [README](README.md), and the Counter Mode design page (`docs/revamp/design/counter-mode.html`, sections `#billactions`, `#share`, `#pickers`, `#footer`, `#settings`), whose decisions are reused here rather than redesigned.

Paths: `F/` is `frontend/src/modules/DigiKhaato/features/`; endpoints are under `/api/v1/` (constants in `frontend/src/api/APIPaths.ts`). Code was read at `dev` on 17 Oct 2026. Where the code and an older doc disagree, the code is described and the difference is listed in §12.

Every money figure on these screens is the **Shop's book** (DEC-019: ledger bucket `shop`, party cache `shop_balance`). Customers and suppliers are never netted. Udhaar words (You gave / You got) never appear here; the Shop says **Billed, Received, Paid out, Due, To collect, To pay**.

---

## 0. Rules shared by every screen in this file

These apply to every section below. A screen's own **States** field lists only what differs or what it adds.

### 0.1 States, in one place

| State | Default behaviour (every screen) |
|---|---|
| Loading | route `loading.tsx` skeleton of the screen's family (list, detail, form, report) at once (02-global-shell "Route loading"); in-page refetch keeps old rows dimmed with a thin progress line on the panel, never a blank screen |
| Empty (filtered) | `UbEmptyState` "No bills match these filters" + **Clear filters**; a search with no result offers to create that thing only where creating is possible and allowed |
| First use | the server's `hasAny === false` decides (pattern already in `InvoicesListPageContent.tsx:190`): one card with the first action and one line on why; no ₹0 totals, no tabs, no period over nothing |
| Error (whole screen) | `UbEmptyState variant="error"` with **Try again**; message plain; no request id is drawn (`UbRequestId` draws nothing, owner 7 Oct) |
| Partial failure | the failing panel only says "Couldn't load … · Try again"; the rest stays usable (profit card, trade tabs, totals strip, GST section) |
| Success | the global snackbar names what was saved with one next action ("Bill INV/26-27/0419 saved · Print"); money words in Shop terms |
| Offline | existing `NetworkStrip` under the header; cached reads stay readable with "As of 4:12 pm"; every write button is disabled with the reason under it ("No internet. Nothing is saved until you're back online."); editors with a device copy say "Kept on this phone" |
| No permission | a screen the role can't read: "You don't have access to this. Ask the owner." with a button to Shop Home; inside a screen, actions the role can't use are **not drawn** (02 §1.7) and figures it can't see are replaced by a lock line ("Cost and profit are visible to the owner") |
| Long names | titles and party names wrap to two lines (`line-clamp-2`), never "Ramesh Trad…" (CLAUDE.md, LED-03 rule "the title owns its line"); badges sit on the caption line |
| Large amounts | every figure is laid out for **₹12,40,378.00** at 320 px with `UbAmount` (grouped, tabular); a figure never shrinks its font and never truncates; a row that can't fit name + amount puts the amount on its own line, right-aligned |
| 320 px Hindi | every label checked in Hindi at 320 px with large system text; words wrap, never cut; the bottom dock stacks (TV-03); icon-only header actions keep their accessible names in Hindi |
| Thousands of rows | server paging (25 per page, `UbLoadMore` "Show 25 more"), counts and totals from `meta` over the filtered set, never summed on the client; the grid virtualises past 200 rendered rows (F8, measure first) |
| Repeated taps | 05 §4: the control goes busy on the first tap (`useAsyncAction`/`UbForm` in-flight guard), later taps are ignored; writes reuse the caller's `Idempotency-Key`; a 409 `document_already_void` / replayed 200 is treated as the success it is |
| Expired session | the shell's "Signed out" sheet (02-global-shell); editors keep typed work (sales: device copy; purchases: see §3.1 risk) and return to the same screen after sign-in |

### 0.2 Feedback (05 §3) for every control here

- Finger down: pressed look in one frame on buttons, rows, chips, tabs.
- A row or tab that navigates: spinner on the tapped row after 120 ms + top `RouteProgress` + target skeleton.
- A write: button busy at once with its own word ("Issuing…", "Recording…", "Cancelling…"), form locked; after 3 s "Still working… it won't be saved twice".
- Failed write: form stays open with everything typed, plain sentence of what was not saved, **Try again** reuses the same key.
- Never optimistic for bills, payments, returns, stock or voids.

### 0.3 Duplicate protection on this file's writes (02 §4, 05 §4)

| Write | Endpoint | Server rule | Client today | Design rule |
|---|---|---|---|---|
| Issue invoice / bill of supply | `POST /sales/invoices/{id}/issue` | key **required** (`sales/views/invoices.py:47` `_require_key`) | editor mints and reuses | keep; Issue + Ctrl+Enter + payment sheet confirm share one in-flight guard |
| Create sales draft | `POST /sales/invoices` (+ estimates, orders, delivery-challans) | `client_draft_key` claim (09-draft-recovery) | `useDraftSaveQueue` | keep |
| Issue credit note | `POST /sales/credit-notes` issue path | key **required** (`sales/views/credit_notes.py:49`) | keyed | keep |
| Record purchase bill | `POST /purchases/bills?record=true`, `POST /purchases/bills/{id}/record` | key **required** (`purchases/views/bills.py:53`) | `purchaseBillService.ts:368-412` | keep; Record + Paid-now confirm share one guard |
| Stock adjustment | `POST /stock-adjustments` | key **required** (`inventory/views/items.py:410`) | allowlisted | keep |
| Debit note | `POST /purchases/debit-notes` | allowlisted on client (`DEBIT_NOTES`) | keyed | keep |
| Import commit | `POST /imports/{id}/commit` | `@idempotent("import_commit")` | key sent by `importService.ts:149-155` | keep |
| Item create | `POST /items` | allowlisted (INV-01) | keyed | keep |
| Purchase order create, price list create, master create | `POST /purchases/orders`, `/price-lists`, `/categories`, `/units` | not on `IDEMPOTENT_POST_PATHS` (`APIPaths.ts:308`) | none | **audit item for Phase 7** (05 §4): orders have a draft claim; price lists and masters are name-unique — confirm each is idempotent by construction or add to 08 |
| Voids and cancels | `…/void`, `…/cancel` | 409 `document_already_void` on repeat | dialog can't close mid-request (`ReasonConfirmDialog`) | treat repeat 409 as success |

### 0.4 Money and cost rules that bind every screen

- **Cost and margin never reach a customer**: not on prints, PDFs, `/d/<token>`, share text or the editor's printed preview. Server allow-list `apps/sales/serializers/public.py`; tests `test_a_customer_never_sees_what_the_shop_paid` and `src/tests/customerDocumentsCarryNoProductName.test.tsx`. On screen, cost and margin show only with `reports.financial.read` (`InvoiceProfitCard`, `ItemPriceFields`, picker detail line), always inside `ub-print-hide`.
- **The item's usual price and the bill's price are different things** (14-item-pricing): the picker says "₹450 usual price"; changing the rate on a line says "For this bill only. The usual price stays ₹450." A price-list rate says "Wholesale list rate". Editing a bill never edits the item; editing an item never edits an issued bill.
- **Prints carry the business's name only**, never YourKhata or its domain.
- **Displayed figures are the server's**: totals preview from the editor's tax engine must equal the server's issue result (already checked by `e2e/counter-entry-timing.mjs`); reports never re-add rows on the client.

---

## 1. Sales lists · `/sales/invoices`, `/sales/estimates`, `/sales/orders`, `/sales/challans`, `/sales/credit-notes`

| Field | |
|---|---|
| Purpose | Find a sales document fast and see what is unpaid, overdue or pending across one period. |
| Who and when | Owner and counter staff, many times a day ("did Sharma pay INV-0418?"); accountant at month end. |
| Phone layout | Header: "Bills" + search icon + ⋯ (switch to Estimates · Orders · Challans · Returns, from `SalesSectionLinks.tsx`). Money strip: **Billed** and **Due** for the filtered set (count tile dropped below `md`, owner 23 Sep; `InvoiceListStats.tsx`). Search field + one **Filters** button with a badge counting changes (status, period, origin — `InvoicesListPageContent.tsx:207-240`). Status as scrollable chips under the search (All · Unpaid · Overdue · Paid · Draft · Cancelled) with counts — the one change from today, where status lives inside the sheet: it is the most used filter and costs two taps there. Rows as cards: line 1 party name (wraps 2 lines) · amount right; line 2 number · date · status word badge · "₹1,240 due" when due ≠ total. Bills tab active in the bottom bar. The marigold **+ New bill** sits in the header as an icon+word button (not a FAB; header rule). |
| Desktop layout | Sidebar Shop › Bills active. `UbPageHeader` title, section links (Estimates, Orders, Challans, Returns) and **+ New bill** (marigold). `UbStatGrid` of Count · Billed · Due. `UbTabs` status row with counts. `UbFilterBar`: search left, period `UbDateRangePicker` and origin on the right. `UbDataGrid` table: Number · Date · Party · Total · Due · Status · Origin; sortable headers; `N` opens a new bill (existing shortcut, ignored while typing). |
| What matters most | what is due → find one bill → start a new one. |
| Components | `UbPageHeader`, `UbActionLink`, `UbStatGrid`/`UbStatCard`, `UbTabs` (desktop), `UbChoiceChips` (phone status chips), `UbFilterBar`, `UbFilterSheet`, `UbSearchInput`, `UbDataGrid` (table + card), `UbStatusBadge`, `UbAmount`, `UbLoadMore`, `OriginBadge`. No new component. |
| Main / other actions | + New bill (+ New estimate / order / challan on those lists). **Credit notes have no New** — a return starts from its bill (`SalesFlowListPageContent.tsx` docstring); the first-use card says "Returns start from a bill: open the bill and choose Something's wrong › Goods came back." |
| Navigation | In: bottom bar Bills, sidebar, Home register rows, person page "Bills" panel. Out: row → `/sales/<kind>/[id]`; New → `/sales/<kind>/new`; filters live in the URL (as party list does) so Back restores them. |
| States | §0.1, plus: **first use** "No bills yet. Your first bill takes about a minute. + New bill" · **filtered empty** keeps tabs, totals and period · **no permission** estimates/orders need `sales.estimate.read`, invoices/challans/notes `sales.invoice.read` — section links the role can't read are not drawn · **offline** list as of last load, New disabled with reason · **thousands** 20k bills at scale seed: server paging, tab counts from `meta` (`list.tabs`). Status words: Draft · Unpaid · Part paid · Paid · Overdue · Cancelled (the API's `void` is shown as **Cancelled**, matching the design page; keep the status key). |
| Accessibility | tabs/chips are a radio group with counts in the name ("Overdue, 4 bills"); card is one button named "INV/26-27/0418, Sharma General Store, ₹1,240, due ₹1,240, Unpaid"; status never by colour alone. |
| Must keep working | SAL-08 counts over date+search, totals over the filtered set, `N` shortcut, origin filter when modules issue documents, per-kind read permissions, `hasAny` first-use rule, URL filters. |
| Fewer taps | status chips visible on phone (−2 taps per filter); search accepts a bill number or an amount ("1240"). |

Tracking: problems — status hidden in the phone sheet; "void" shown as a code-ish word · decisions — status chips on phone, "Cancelled" as the word · dependencies — none (presentation) · risks — chip row width at 320 px Hindi (scrolls horizontally inside its own row, never the page) · approval — pending · build — not started · tests — `InvoicesListPageContent.test.tsx`, `final-sales-qa.mjs`, `sales-look.mjs` at 320/390/768/1280, both themes · outcome — —

---

## 2. Sale document detail · `/sales/{invoices|estimates|orders|challans|credit-notes}/[id]`

One page for five kinds (`InvoiceDetailPageContent.tsx`, `kind` prop); actions from `DocumentActions.tsx` decided by `flowDisplay.ts`.

| Field | |
|---|---|
| Purpose | See one bill as the customer sees it, take money against it, share or print it, and fix it when something went wrong. |
| Who and when | Counter staff right after issuing; owner when a customer disputes; accountant reading. |
| Phone layout | Header: Back + number (title) + party name (wraps) + ⋯. Under it: status badge and **one summary block**: Total · Paid · **Due** (large), date, due date. **Primary action row** (equal width, two buttons): **Receive money** (marigold; only issued/part paid/overdue with a party, `RecordPaymentButton`) and **Share**. Then **Print** as a secondary full-width button with the paper chosen in Settings (§9.2) and "Change paper" link. Then **Document links** panel (`DocumentLinksPanel`: void banner + reason, "From estimate EST/…", "Converted to INV/…", returns against it, credit applied). Then **Payments** list (each links to `/payments/[id]`). Then **Profit** card (only `reports.financial.read`). Then the **bill as lines**: a phone-native list (item, qty × rate, amount; GST breakup and grand total at the end) **instead of the A4 sheet in a sideways-scrolling box** (today `overflow-x-auto` region at `InvoiceDetailPageContent.tsx:279`). "See as printed" opens the real print sheet full screen, fit to width, pinch to zoom. ⋯ sheet: **Something's wrong…** (invoices), Edit (drafts), Convert (estimate/order/challan), Mark accepted/rejected (estimate), Cancel order (order), Apply credit (credit note with open credit), Reset share link (owner/admin). Bottom bar shown (read-only detail). |
| Desktop layout | Breadcrumb Bills › INV/26-27/0418. Header actions: Receive money (marigold), Share, Print ▾ (A4 · 80 mm), ⋯ (same items). Two columns from 1280: left the print sheet as today; right rail (360 px) with summary, links, payments, profit card. Below 1280 one column, rail first. |
| What matters most | how much is due → receive or share → is it linked/cancelled → the lines. |
| Components | `UbPageHeader` + `UbPageHeaderMobileActions`, `UbStatusBadge`, `UbInfoRow` (summary), `UbButton`, `UbActionSheet`, `DocumentLinksPanel`, `OriginBadge`, `InvoiceProfitCard`, `PaymentFormDrawer` (lazy), `InvoiceShareSheet` → `UbShareSheet`, `InvoicePrintSheet` (A4, thermal 80), `VoidDocumentDialog`, `CancelOrderDialog`, `ApplyCreditDialog` (all `dynamic()`). **NEW (feature, small)**: `SomethingWrongSheet` — the "What happened?" chooser from `#billactions`, built from `UbActionSheet` rows; **NEW (feature)**: `DocumentLinesList` phone view built from `UbInfoRow`/`UbListItemText` over the same `printModel.ts` (so on-screen lines and paper can't disagree). |
| Main / other actions | Receive money · Share (WhatsApp, SMS, copy link, through the editable composer; never says "sent") · Print · Something's wrong… → four answers (below) · Edit draft · Convert · Cancel order · Apply credit. |
| Navigation | In: list rows, issued dialog "View", Home register, person page, payments. Out: Edit → `/edit`; Return → `/sales/credit-notes/new?against=<id>`; Convert → the new invoice; payment rows → `/payments/[id]`; links → the linked document. Back → the list it came from (filters kept) or Bills. `?print=1` keeps opening the print dialog on arrival. |
| States | §0.1, plus: **draft** — "Draft · not issued" with Edit and Delete only, no share/print-to-customer · **cancelled (void)** — red-bordered banner "Cancelled on 16 Oct · Reason: made by mistake", no Receive/Share, Print shows "CANCELLED" on paper (existing) · **paid** — Receive hidden, "Paid in full" · **walk-in** — no party, Receive hidden (paid at issue) · **partial failure** — profit card or share-link read fails alone · **share link fails** — "Couldn't make the link. Try again"; nothing opens, because the message promises a link and sending it without one would mislead the customer · **offline** — Receive, Share, Something's wrong disabled with reason; Print works from the loaded sheet · **no permission** — Void only for `sales.invoice.void` (owner/admin); Receive needs `payments.payment.write`; profit needs `reports.financial.read` · **long names** — party wraps under the number · **₹12,40,378.00** — summary "Due" on its own line at 320 px · **a payment made on another device** — after any write the page re-reads (`detail.reload`), and on focus after 60 s it re-reads silently. |
| Accessibility | summary is a `dl`; the lines list is a table for screen readers (caption "Items on this bill"); "See as printed" is a dialog with its own title; destructive confirms open focused on the safe choice ("Keep bill"), which needs the MLDialog autoFocus fix CLAUDE.md records — verify on each. |
| Must keep working | void rules (`backend/apps/sales/services/void.py`): drafts are deleted not voided; refused while a non-void credit note stands against the bill ("Void credit note CN/… first."); party payments **detached and kept as advance**, never voided (BR-4); a walk-in's counter receipt is voided with the bill; other notes' credit returns to open credit (BR-5); number kept (BR-1); reason 3–160 characters; origin lock/confirm 409s (`document_origin_locked`, `document_origin_confirm` → "Cancel anyway"). Payment drawer allocates to this bill first (PAY-01 FR-1). Share link reuse; rotate only by owner/admin. Print sheets unchanged; no product name, no cost. |
| Fewer taps | Receive money on the page, not in ⋯ (1 tap). Share is one tap to the composer. Something's wrong replaces hunting for Void vs Return. |

### 2.1 "Something's wrong…" chooser (from `#billactions`)

Title "What happened with INV-0418?" with party · total · paid state. Four rows, each says what it does to stock and money **before** the tap:

| Row | Shown when | Opens | Server rule it maps to |
|---|---|---|---|
| The bill was a mistake — "Cancel it. Stock comes back and it leaves Sharma's dues. The number stays, marked Cancelled." | issued, not void, role has `sales.invoice.void` | `VoidDocumentDialog` with consequences from `voidConsequences.ts` (stock lines, khata change, "₹500 stays with Anita as advance") and the reason box | `void_invoice` |
| Goods came back — "Take items back with a credit note. You pick which items and how many." | `canReturn` (flowDisplay) | credit-note editor `?against=<id>` (§4) | SAL-04 |
| Give money back — "Nothing was paid on this bill, so there's nothing to refund." (disabled with that sentence) / enabled when an advance exists after a cancel or a return | always listed, enabled only with money to give back | `PaymentFormDrawer` direction **out** prefilled for this customer (Paid out) | PAY "paid out" |
| Settle with his supplier balance — "Only for someone who is also your supplier." | **hidden until the owner decides how a settlement is recorded** (open question Q1) | — | not built |

**Freshness before cancelling**: when the chooser opens, the page re-reads the bill (`GET /sales/invoices/{id}`, no new endpoint) and the cancel dialog says "Checked just now" only after that read returns; while reading, the row shows a spinner. A refusal is shown inside the dialog: "Can't cancel. INV-0399 has a credit note, CN-012. Cancel the credit note first, or take more items back instead." with a link to the note, and the confirm disabled (`VoidDocumentDialog` already does this).

### 2.2 Payment drawer (Receive money)

Reuses `PaymentFormDrawer` + `PaymentAllocationPicker` + `PaymentModeEditor` exactly as the `#pay` design: amount prefilled with this bill's due, allocated to this bill first, the rest oldest first or kept as advance (server's rule), modes split, date with Today/Yesterday, private note never copied into the receipt. Busy "Receiving…", one key per open of the drawer. Saved → drawer closes, snackbar "₹1,240 received from Sharma · Share receipt", page re-reads. Offline: disabled with reason.

### 2.3 Share sheet

`InvoiceShareSheet` over `UbShareSheet` with the editable message (`#share`): recipient visible, the text with the live link, 900-character counter, WhatsApp/SMS as real links, Copy. Copy says "Link copied", never "Sent". The message is signed with the business name only.

Tracking: problems — A4 sheet scrolls sideways on phones; Void and Return are separate ⋯ items with no explanation; "Checked just now" needs a fresh read · decisions — phone lines list from `printModel`, chooser, settle row hidden · dependencies — owner Q1 (settle), MLDialog autoFocus fix · risks — chooser adds one step for owners who knew "Void" (mitigated: desktop ⋯ keeps the four rows one tap away) · approval — pending · build — not started · tests — `SalesFlows.test.tsx`, `final-sales-qa.mjs`, void API tests, a new e2e: cancel with a payment → advance shown on the person page in the Shop book · outcome — —

---

## 3. Bill editor · `/sales/invoices/new`, `/sales/invoices/[id]/edit` (and estimates, orders, challans)

`InvoiceEditorPageContent.tsx` (one editor for four kinds), `useInvoiceEditor`, `InvoicePartySection`, `InvoiceLinesSection` + `ItemLineCell`, `InvoiceTotalsPanel`, `UbTotalDock`, `InvoicePaymentDrawer`, `InvoiceIssuedDialog`, `InvoiceEditorDialogs`, `InvoiceSaveIndicator`, `useDraftAutosave` (device copy 500 ms, server 3 s), `draftRecovery.ts`.

| Field | |
|---|---|
| Purpose | Make a correct bill at a busy counter in as few keys as possible, and never lose or double it. |
| Who and when | Counter staff and owner, dozens of times a day, often with the customer waiting. |
| Phone layout | Header: × + "New bill" + save state caption ("Draft saved 4:39 pm" / "Kept on this phone" / "Couldn't save"). Bottom bar hidden (editor). **Customer**: one field "Customer or walk-in" (`usePartySearch`, "+ Add Ramesh" when no match); once picked, it collapses to one line "Sharma General Store · ₹3,100 due in Shop" (Shop book) with Change. **More details** fold (date, due date, place of supply, notes) closed with a one-line summary; forced open on an error or duplicate warning (as built 16 Oct). **Items**: an always-visible item search at the top of the lines ("Add item: name, code or scan"), `UbAsyncCombobox` + `useItemSearch`; each option shows usual price, unit, GST incl./excl., stock in words, and cost/margin only with permission (`#pickers`); no match → archived look-alike "Restore Ragi flour 1 kg" first, then "+ Create 'ragi'" (only for `inventory.item.write`; others read "Ask the owner to add it."). **Line rows (compact, NEW behaviour)**: each added line is one 56–64 px row — name (2 lines max) · "2 × ₹450" · amount; tapping a row expands it in place to qty (`UbQuantityInput`), rate (`UbMoneyInput`), discount, GST, remove; only one row expanded at a time; the last-added row is expanded with focus on Qty. Under a changed rate: "For this bill only. The usual price stays ₹450." **Totals**: `InvoiceTotalsPanel` under the lines (subtotal, discount, taxable, CGST/SGST or IGST, cess, round-off). **Dock** (`UbTotalDock`): "Total · 3 items · incl. GST ₹18.00 / ₹378.00" with Save draft and **Issue** (marigold); below `sm` the buttons stack under the total (TV-03) so ₹12,40,378.00 and Hindi "कुल · 48 सामान" never cut; dock rides above the keyboard (04 §6). |
| Desktop layout | Header: × + "New bill" + save caption; Delete for drafts. Lines as a table whenever they fit (`tableWhen="fits"`, built 16 Oct): # · Item · Qty · Unit · Rate · Disc · GST · Amount · remove. Below 1536 px totals sit under the lines and Save draft / Issue ride in `UbTotalDock` (`useDocksEditorTotals`); from 1536 px the totals panel is the right column with Save draft (Ctrl+S) and Issue (Ctrl+Enter) in the header. Keyboard kept exactly: Enter, ↑/↓, Alt+N, Alt+Backspace, Ctrl+Enter; Enter after a pick moves to Qty (`afterPick`); Enter waits for a pending search (`usePagedSearch.pending`). |
| What matters most | customer → items and quantities → total → Issue. |
| Components | `UbPageHeader`, `UbAsyncCombobox`, `usePartySearch`, `useItemSearch`, `ItemLineCell`, `UbLineItemsEditor`, `UbQuantityInput`, `UbMoneyInput`, `UbDateInput`, `UbDisclosure`, `InvoiceTotalsPanel`, `UbTotalDock`, `UbStatusBanner`, `InvoicePaymentDrawer`, `InvoiceIssuedDialog`, `InvoiceEditorDialogs`. **Changed**: `UbLineItemsEditor` card mode gains a compact collapsed row (design-system change, prop `cards="compact"`; the editor's measured finding is ~285 px per card, 50 lines ≈ 15,000 px on a phone); `UbTotalDock` stacks below `sm` (TV-03, already proposed in 06). |
| Main / other actions | **Issue** (invoice) / **Save & send** (estimate) / **Issue challan** / **Confirm order**; Save draft; Delete draft; Restore archived item; Create item (drawer). Issue for a **walk-in** opens the payment sheet (full amount in cash by default, split allowed, must add up — `InvoicePaymentDrawer`); for a **party** the same sheet offers part, all, more (advance) or **Full credit**. |
| Navigation | In: + New bill (Home, Bills, find-or-start "mohan 2000" style prefill is for payments only), list Edit, `N`, PWA shortcut "New bill". Out: issued dialog → Print (`/[id]?print=1`), View, **New bill** (fresh editor, same customer cleared). × with unsaved local changes: nothing to ask — the draft is saved; × while a save is in flight: "Saving… leave anyway? Your bill is kept as a draft." |
| States | §0.1, plus: **draft recovery** — on open, if this device holds a newer copy: "You have an unsaved bill from 4:12 pm on this phone · Restore · Start new" (`InvoiceEditorDialogs`); version conflict with another device: "This bill was changed on another device · Use the saved one · Keep mine" (existing); a recovered issued document opens read-only and is never issued again (09-draft-recovery) · **issuing** — whole form locked, Issue reads "Issuing…", dock and header buttons both busy · **issue refused** — `UbStatusBanner` above the lines with the server's sentence (credit limit with owner-only override, stock short "Rice would go to −3 bags", duplicate number); the payment sheet closes so the banner is visible (existing) · **issued** — `InvoiceIssuedDialog`: number, khata effect "₹1,772 added to Ramesh's Shop dues" or "Paid ₹1,772 · Cash", Print · View · New bill; it is the only modal after issue · **offline** — typing continues, caption "Kept on this phone", Issue disabled "No internet. Your bill is kept; issue it when you're back online." · **slow** — after 3 s "Still issuing… it won't be issued twice" · **expired session** — device copy holds the bill; after sign-in the editor reopens with "Restore" · **no permission** — no `sales.invoice.write`: the editor route shows the no-access page; cost/margin hidden in picker; credit-limit override only for owner · **out of stock** — option says "Out of stock · can't be billed while selling below zero is off in Settings" when `inventory.allow_negative_stock` is off · **50+ lines** — compact rows; a line count chip in the dock opens a "Jump to line" list · **long item names** — 2 lines in the row, full in the expanded row. |
| Accessibility | lines are a grid with row headers by item name; expanded row announces "Editing line 3, Basmati rice"; totals panel is a polite live region (existing §5); dock buttons ≥ 44 px; Issue's accessible name includes the total ("Issue bill, ₹378.00"). |
| Must keep working | Issue requires an Idempotency-Key (`invoices.py:47`); `client_draft_key` creation claim and 200 `draft_recovered`; autosave queue reads the acknowledged version; walk-in can't go on credit; credit limit check inside the write transaction with owner-only override; tax engine one formula (`netOfInclusive`); keyboard shortcuts; usual price vs bill price separation; cost never printed; estimate never posts stock/ledger/payment. |
| Fewer taps | item search always open (no "Add line" first: −1 tap per line); after a pick focus goes to Qty; compact rows remove scrolling; issued dialog "New bill" starts the next one in one tap. |

### 3.1 Purchases share this editor's shape — see §6.

Tracking: problems — 285 px phone line cards; dock cuts large totals in Hindi (TV-03); out-of-stock reason unclear · decisions — compact rows, always-open item search, settings-driven out-of-stock sentence · dependencies — `UbLineItemsEditor` compact cards, `UbTotalDock` stack, keyboard detection (04 §6) · risks — compact rows hide discount/GST until expanded (mitigation: a line with a non-default discount shows "−5%" in its row) · approval — WP-05 layout A approved 16 Oct; phone compact rows pending (Q3) · build — layout A built; rest not started · tests — `InvoiceEditor.test.tsx`, `counter-editor-review.mjs`, `counter-entry-timing.mjs` re-run at 390 with 1/10/50 lines, `sales-recovery-look.mjs`, double-tap Issue script (05 §5 "0 duplicates") · outcome — —

---

## 4. Credit-note editor (return items) · `/sales/credit-notes/new?against=<invoice>`

| Field | |
|---|---|
| Purpose | Take goods back against a bill and say exactly what happens to stock and money before saving. |
| Who and when | Counter staff when a customer returns goods; owner for price corrections. |
| Phone layout | Header × + "Return items · INV-0418". Party line (Shop dues). The bill's lines as compact rows, each with "Billed 6 · Already returned 2 · Return [ 0 ]" stepper (`UbQuantityInput`, max = what can still come back), priced as billed. Then `CreditNoteSettlement`: date (on/after the bill, not future), reason (required), **Put back on the shelf** switch (only when the bill has item lines), and **What happens to the credit**: "Take it off this bill's due" (automatic) and for the rest "Keep as advance" / "Give money back now" (only when there is something left). **Consequence line** above the dock: "Stock +3 Cooking oil · ₹465.81 off INV-0418's due · ₹0 kept as advance". Dock: total of the return + **Save return** (marigold). |
| Desktop layout | Same order in one column at measure width with the consequence panel on the right from 1280. |
| What matters most | which items and how many → what happens to money → save. |
| Components | `CreditNoteEditorPageContent`, `CreditNoteLinesSection`, `CreditNoteSettlement`, `UbQuantityInput`, `UbSwitch`, `UbRadioGroup`, `UbDateInput`, `UbTextArea`, `UbTotalDock`. No new component. |
| Main / other actions | Save return · Cancel. No standalone note from here (a return starts from its bill). |
| Navigation | In: sale detail › Something's wrong › Goods came back. Out: saved → the new credit note's detail with a snackbar "Return CN-013 saved · ₹465.81 off INV-0418"; × → back to the bill. |
| States | §0.1, plus: **nothing left to return** — lines show "All returned" and Save is disabled with that sentence · **bill cancelled meanwhile** — refusal banner "INV-0418 was cancelled. Nothing to return." · **saving** — "Saving return…", form locked, key reused · **offline** — Save disabled with reason · **no permission** — needs `sales.invoice.write`; refund row needs `payments.payment.write` · **quantity over the max** — field error "Only 4 can come back" (server re-checks). |
| Accessibility | each stepper is labelled with the item and the maximum; consequence line is a live region. |
| Must keep working | credit-note issue requires an Idempotency-Key (`credit_notes.py:49`); restock only for item lines; refund only when something is left; a standing note blocks voiding its invoice; void of a note puts stock and credit back. |
| Fewer taps | quantities default to 0 with a "Return all" button for the common whole-bill return. |

Tracking: problems — none severe; consequence line below the fold on phones today · decisions — consequence line pinned above the dock · dependencies — `UbTotalDock` stack · risks — "Return all" on a 30-line bill (confirmation is the consequence line) · approval — pending · build — not started · tests — `SalesFlows.test.tsx`, credit-note API tests, double-tap Save · outcome — —

---

## 5. Purchases lists · `/purchases/bills`, `/purchases/orders`, `/purchases/debit-notes`

`PurchaseBillsListPageContent.tsx` (one component, three kinds), `PurchaseBillColumns`, `PurchaseBillListStats`, `usePurchaseBillList`. Endpoints `GET /purchases/bills`, `/purchases/orders`, `/purchases/debit-notes`.

| Field | |
|---|---|
| Purpose | See what the shop bought, what it still owes suppliers, and find a supplier bill by its number. |
| Who and when | Owner and the staff member who enters supplier bills; when goods arrive and when paying suppliers. |
| Phone layout | Reached from the App sheet › More in Shop › Purchases (not a tab). Header "Purchases" + ⋯ (Orders, Returns to supplier). Money strip: **Bought** and **To pay** (filtered set, Shop book, "To pay" never mixed with customer dues). Search ("supplier, our number or their bill number") + status chips (All · To pay · Overdue · Paid · Draft · Cancelled) + Filters (period). Cards: supplier (wraps) · amount; number · their number · date · status · "₹4,000 to pay". |
| Desktop layout | Sidebar Shop › Purchases. Header with Orders / Returns links and **+ Record bill** (marigold). Stats, tabs, filter bar, table: Number · Their no. · Date · Supplier · Total · To pay · Status. |
| What matters most | to pay → find a bill → record a new one. |
| Components | same as §1. No new component. |
| Main / other actions | + Record bill / + New order. Debit notes: no New (from a bill, "Return goods"). |
| Navigation | rows → detail; New → editor; Back keeps filters. |
| States | §0.1, plus first use "Record your first supplier bill to keep stock and supplier dues right"; no permission needs `purchases.bill.read`; cost is visible on purchase rows to roles that hold `purchases.bill.read` (owner's open question in 14 — staff entering bills see costs; recommended yes). |
| Accessibility | as §1. |
| Must keep working | supplier dues in the Shop book only; duplicate supplier number rule; list paging and totals from the server. |
| Fewer taps | status chips visible; search matches the supplier's own bill number. |

Tracking: problems — Purchases lives only in More on phones · decisions — no fifth Shop tab (N-1 keeps 4 + App) · dependencies — R-DEC-04 · risks — none new · approval — pending · build — not started · tests — `final-sales-qa.mjs` purchase part, list e2e at 4 widths · outcome — —

---

## 6. Purchase detail · `/purchases/{bills|orders|debit-notes}/[id]`

`PurchaseBillDetailPageContent.tsx` (three kinds), `PurchaseBillVoidDialog`, `DebitNoteDrawer`, `PurchaseOrderCancelDialog`, `PurchasePaidNowDrawer`.

| Field | |
|---|---|
| Purpose | Check a supplier bill, pay it, return goods, or cancel it when it was entered wrongly. |
| Who and when | Owner/bill-entry staff after recording; when the supplier calls about payment. |
| Phone layout | Back + number + supplier (wraps) + ⋯. Summary: Total · Paid · **To pay**; their bill no. and date; due date. Primary row: **Pay supplier** (marigold; `PaymentFormDrawer` direction out, allocated to this bill) and **Something's wrong…**. Lines list (item, qty × cost, amount — cost is right here: it is the shop's own bill). Links: "From order PO-0004", debit notes against it, payments. ⋯: Edit (draft), Delete draft, Create bill (order, once — server rule), Cancel order, Reset nothing else. |
| Desktop layout | breadcrumb; header actions Pay supplier, Something's wrong…, ⋯; two columns from 1280 (lines left, summary/links/payments right). |
| What matters most | to pay → pay → links → lines. |
| Components | `UbPageHeader`, `UbInfoRow`, `UbStatusBadge`, `PaymentFormDrawer`, `DebitNoteDrawer`, `PurchaseBillVoidDialog`, `PurchaseOrderCancelDialog`, `UbActionSheet`. Reuse `SomethingWrongSheet` from §2 with supplier words. |
| Main / other actions | Pay supplier · Something's wrong… → **The bill was entered wrongly** (void: "Stock goes back out, the bill leaves what you owe Mahalaxmi, payments stay as advance with them") · **Goods went back** (`DebitNoteDrawer`: per line what can still go back, reason, "Goods leave the shelf" switch off for a price correction) · **Supplier gave money back** (Paid in from supplier — only when an advance exists) · Create bill from order · Cancel order. |
| Navigation | In: list, Home "To pay" lane, supplier page. Out: links, payment detail, editor. |
| States | §0.1, plus: **void refused because goods were sold** — 409 `insufficient_stock` shown in the dialog per line: "Rice would go to −8 bags. Sell or adjust stock first, or allow selling below zero in Settings." · **debit note stands** — "Cancel debit note DN-003 first" (`has_dependent_documents`) with link · **supplier archived** — "This supplier is archived. Restore them to cancel this bill." (`party_archived`) with Restore link (owner) · **order already billed** — Create bill hidden (server rule) · **paid-now failed for permission** — never silent (§7) · **offline** — writes disabled with reason. |
| Accessibility | as §2. |
| Must keep working | `purchases/services/void.py`: void keeps rows and number, reverses stock (negative-stock policy applies), reverses supplier credit dated today, payments become advance; average cost **does** change on void (CR-2026-09-24-INV-A; never print "Average cost unchanged"); refused with a standing debit note; debit note amounts are the server's; order billed once. |
| Fewer taps | Pay supplier on the page; chooser instead of separate Void / Debit note items. |

Tracking: problems — purchase actions scattered in ⋯ · decisions — same chooser as sales, supplier words · dependencies — §2 chooser · risks — "Supplier gave money back" depends on the payments "paid in from supplier" direction existing (verify in Phase 2; hide if not) · approval — pending · build — not started · tests — `apps/purchases/tests/test_void.py`, `purchase-recovery-look.mjs` · outcome — —

---

## 7. Purchase editor and Paid-now · `/purchases/bills/new`, `/[id]/edit`, `/purchases/orders/new`, `/[id]/edit`

`PurchaseBillEditorPageContent.tsx`, `PurchaseBillHeaderSection`, `PurchaseSupplierField`, `PurchaseBillLinesSection`, `PurchaseBillTotalsPanel`, `PurchasePaidNowDrawer`, `usePurchaseBillEditor`.

| Field | |
|---|---|
| Purpose | Enter a supplier's bill as printed, so stock, cost and what the shop owes are right. |
| Who and when | Owner or bill-entry staff when goods arrive, often with the paper bill in hand. |
| Phone layout | As §3 with supplier words: × + "Record bill" + save caption. Supplier field; once filled, **one-line summary** "Mahalaxmi Wholesale · MW-1043 · 16 Oct · due 16 Oct" with Edit (built 16 Oct below 1536); reverse charge and supplier invoice date stay inside and stay required where law needs them. Item search on top, compact line rows with **Cost** instead of rate; under a changed cost "This bill's cost. The item's purchase price will update to ₹42 when you record." (`last_cost.py` behaviour, said plainly). Totals under the lines. Dock: total + Save draft + **Record** (marigold). |
| Desktop layout | As built (layout A, 16 Oct): table when it fits (bill minimum ~824 px, so 1024 still cards), totals under lines below 1536, side panel from 1536; same keyboard. |
| What matters most | supplier and their bill number → lines with cost → total matches the paper → Record. |
| Components | as §3 plus `PurchaseSupplierField`, `PurchasePaidNowDrawer`. |
| Main / other actions | Record → when the role may pay suppliers and total > 0, **Paid now?** drawer: default full amount in cash, split by mode, part, more (advance), or **Pay later** (all on "To pay"). Save draft. Delete draft. Orders: Save, Send. |
| Navigation | Out: recorded → bill detail with snackbar "Bill PB-0007 recorded · ₹5,000 to pay Mahalaxmi" (supplier terms); Paid now → "· ₹5,000 paid in cash". |
| States | §0.1, plus: **duplicate supplier number** — warning opens the fold, names the earlier bill with a link · **no device copy (risk)** — purchases keep the creation key in memory only (09-draft-recovery "Purchase limits"): the save caption says "Saved" only after the server acknowledges; while offline or unsaved it says "Not saved yet — don't close this screen", and × asks "Leave? This bill isn't saved." Expired session: the sign-in sheet must re-authenticate **without a page reload** (dependency on the shell) or the unsaved part is lost — stated as a risk, not hidden · **record refused for payment permission** — 403 naming `details.payment`: "You can record bills but not pay suppliers. Record it as Pay later, or ask the owner." with **Record as Pay later** (the whole request is refused today, so nothing was half-saved) · **recorded on retry** — a recovered recorded bill locks the editor and opens it read-only · **loose units** — "6.000" shown as "6" (fixed 16 Oct). |
| Accessibility | as §3; Paid-now drawer opens focused on the amount (autoFocus fix). |
| Must keep working | Record requires an Idempotency-Key (`bills.py:53`); `?record=true` ignores `client_draft_key`; Paid-now goes in the same request and becomes a PAYOUT voucher in the same transaction; a role without `payments.payment.write` never sees Paid now; last cost updates on record, not on void; draft recovery for bills and orders (16 Oct). |
| Fewer taps | supplier summary line; Pay later is one tap; Record + Paid now confirm is one flow, not two screens. |

Tracking: problems — purchase drafts not kept on device; permission refusal wording · decisions — honest "Not saved yet" caption; Record as Pay later · dependencies — in-place re-auth (shell), compact rows · risks — data loss on reload after a lost reply is documented (draft remains listed under Drafts) · approval — pending · build — not started · tests — `purchase-recovery-look.mjs`, double-tap Record, permission matrix test for paid-now · outcome — —

---

## 8. Items, stock and masters

### 8.1 Items list · `/items`

`ItemListPageContent.tsx`, `ItemListColumns`, `useItemList`; `GET /items` (cost fields popped without `reports.financial.read`, `inventory/views/items.py:66-72`).

| Field | |
|---|---|
| Purpose | Find an item, see its stock and usual price, and add new ones. |
| Who and when | Owner when setting up and restocking; staff to check stock or price. |
| Phone layout | Reached from App sheet › More in Shop › Items. Header "Items" + ⋯ (Stock summary, Low stock, Price lists, Categories and units, Import items). Search ("name, code or scan" — scanner Enter looks up by code via `useScannerListener`). Chips: All · Low · Out of stock + Filters (type, category, archived). Cards: kind disc (package/service, never initials) · name (2 lines) · price right ("₹450 usual price"); caption: code · "24 bags in stock" / "Low: 3 left" / "Out of stock" as words. |
| Desktop layout | header with + Add item (marigold), Import, Export; tabs; table: Name · Code · Category · Stock · Unit · Usual price · Purchase price (with permission) · Stock value (with permission). |
| What matters most | find → stock in words → price → add. |
| Components | `UbDataGrid`, `UbFilterBar`, `UbFilterSheet`, `UbSearchInput`, `StockBadge`, `UbAmount`, `ListHeaderActions` (import/export), `ItemFormDrawer` (lazy). |
| Main / other actions | + Add item · Import · Export (CSV, gated the same as cost) · open item. |
| Navigation | row → `/items/[id]`; Import → `/imports?kind=items`. |
| States | §0.1, plus first use "Add your first item, or import a list from Excel" with two buttons · no cost permission: cost/value columns absent (not ₹0) · scan with no match: "No item with code 8901234567890 · + Add it" (write role) · thousands: 5k items paged. |
| Accessibility | stock state in words; the disc is decorative. |
| Must keep working | cost hidden without `reports.financial.read` (server-side); archived items filtered out by default; one item search source (`useItemSearch`). |
| Fewer taps | scan from the list; chips for low/out. |

### 8.2 Item detail · `/items/[id]`

`ItemDetailPageContent.tsx` (tabs movements · sales · purchases, lazy), `ItemTradePanel`, `ItemMovementList`, `LastRateNote`, `AdjustmentDetailDialog`; `GET /items/{id}`, `/items/{id}/movements`, `/reports/items/{id}/trade`, `/reports/items/{id}/last-rate`.

| Field | |
|---|---|
| Purpose | Know an item's stock, prices and recent movement, and fix its stock. |
| Who and when | Owner; staff checking "how many left". |
| Phone layout | Back + item name (wraps) + ⋯ (Edit, Archive/Restore). Stock block: **24 bags in stock** large, location if more than one, "Low below 5". Primary row: **Adjust stock** · **Edit**. Price panel: Usual price ₹450 (incl. GST 5%); Purchase price ₹390 and **Margin 9.0%** (permission only, "−14.3% · selling below cost" warning tone). Tabs as chips: Movements · Sales · Purchases (each loads on tap). Movement rows: date · type word ("Sold on INV-0418", "Adjusted: damaged") · ±qty · after. |
| Desktop layout | header actions Adjust stock, Edit, ⋯; two columns: stock and price left, tabs right. |
| What matters most | stock now → price → what moved it. |
| Components | `UbPageHeader`, `UbStatCard`, `UbInfoRow`, `UbChipTabs`, `ItemMovementList`, `ItemTradePanel`, `StockAdjustmentDrawer`, `ItemFormDrawer`. |
| Main / other actions | Adjust stock · Edit · Archive · Restore. |
| Navigation | movement rows link to their document; Back → Items. |
| States | §0.1, plus a tab failing alone; archived item banner with Restore; service items show no stock block ("Services have no stock"); ⋯ actions must open their drawer (the `UbActionSheet` capture-phase defect fixed 17 Oct is re-tested here). |
| Accessibility | stock figure has unit in words; margin warning not colour-only. |
| Must keep working | margin computed (never stored) from the two prices at the item's GST (`itemMargin`); cost and margin permission-gated; issued bills untouched by item edits. |
| Fewer taps | Adjust stock on the page, not in ⋯. |

### 8.3 Item form · `ItemFormDrawer` (create/edit)

| Field | |
|---|---|
| Purpose | Add or change an item quickly, with the price and tax right. |
| Who and when | Owner, at setup or when a new product arrives; inline from the bill editor's "+ Create". |
| Phone layout | Full-height sheet: Name · Type (Goods/Service chips) · Unit (create inline) · **Usual selling price** with "Includes GST" switch · Save. Below, `UbDisclosure` folds: **Cost and margin** (permission only: Purchase price and Margin % side by side, `ItemPriceFields`, `priceAfterEdit`; margin disabled until a cost exists: "Add the cost to see margin"; ≥ 100% refused; below cost warns), **Tax** (HSN picker fills GST rate), **Stock** (opening stock, low-stock level), **Codes** (SKU, barcode — scanner Enter checks for a duplicate instead of submitting), **Category**. Dock: Save (marigold). |
| Desktop layout | right drawer 480 px, same order. |
| What matters most | name → unit → usual price → save. |
| Components | `UbDrawer`, `UbForm`, `UbTextInput`, `UbChoiceChips`, `UbCombobox` (create), `UbMoneyInput`, `UbSwitch`, `UbDisclosure`, `ItemPriceFields`. |
| Main / other actions | Save · Cancel; from the bill editor, Save returns the new item into the line. |
| Navigation | opened from Items, item detail, editor picker; closes back where it opened. |
| States | §0.1, plus duplicate barcode "Already used by Basmati rice 5 kg · Open it"; duplicate name warning; no cost permission: cost fold absent and nothing sent (server refuses `purchase_price` for that role); unsaved changes → "Leave without saving?". |
| Accessibility | focus starts on Name (autoFocus fix); margin/price recalculation announced politely. |
| Must keep working | `POST /items` idempotency (INV-01); price rounding and margin rules from 14; HSN fill rule; scanner Enter rule. |
| Fewer taps | fast path five fields; everything else folded. |

### 8.4 Stock adjustment · `StockAdjustmentDrawer`

| Field | |
|---|---|
| Purpose | Correct stock after counting, damage, or loss, with a reason. |
| Who and when | Owner or trusted staff, after a shelf count. |
| Phone layout | Sheet: Reason (chips: Counted, Damaged, Lost, Free sample, Other + note) · Date · lines (item search, then per line: On hand · **Mode** "Add / Remove / Set to" · Qty · After). Consequence line above the dock: "2 items · −₹312.00 stock value" (value only with permission; else "2 items · −4 bags"). Dock: **Save adjustment**. |
| Desktop layout | drawer 640 px with the line table (`UbLineItemsEditor` adjustment subset). |
| What matters most | reason → items → after-figures → save. |
| Components | `UbDrawer`, `UbChoiceChips`, `UbLineItemsEditor`, `UbQuantityInput signed`, `adjustmentMath.ts`. |
| Main / other actions | Save adjustment. |
| Navigation | from item detail (prefilled with that item), stock summary, low stock; saved → snackbar "Stock adjusted · View" → `AdjustmentDetailDialog`. |
| States | §0.1, plus 409 short lines: every short line marked at once with what is available (existing); offline disabled; no `inventory.stock.write`: entry points hidden. |
| Accessibility | "After" announced per line. |
| Must keep working | `POST /stock-adjustments` requires an Idempotency-Key (`items.py:410`); mandatory reason is the confirmation (no extra dialog). |
| Fewer taps | reason chips instead of typing. |

### 8.5 Categories and units · `/items/masters`

`InventoryMastersPageContent.tsx`, `MasterFormDialog`; `GET/POST /categories`, `/units`.

| Field | |
|---|---|
| Purpose | Keep the short lists items depend on. |
| Who and when | Owner at setup, rarely after. |
| Phone layout | Two sections (chips Categories · Units). Categories: name + live item count. Units: standard GST codes marked "Standard" (locked), the shop's own below. + Add in each section header. |
| Desktop layout | two panels side by side. |
| What matters most | find → add. |
| Components | `UbPanel`, `UbChipTabs`, `UbListItemText`, `MasterFormDialog`. |
| Main / other actions | Add category · Add unit. No rename/delete (create-only at MVP; no control promises what isn't built). |
| Navigation | from Items ⋯. |
| States | §0.1, plus duplicate name "Already exists"; repeated Add taps → one row (name-unique; audit §0.3). |
| Accessibility | locked units say "Standard unit, can't be changed". |
| Must keep working | create-only; standard unit codes locked. |
| Fewer taps | units can also be created inline in the item form. |

### 8.6 Price lists · `/items/price-lists`, `/items/price-lists/[id]`

`PriceListsPageContent`, `PriceListDetailPageContent`, `PriceListFormDialog`, `PartyPriceListControl`; `/price-lists`, `/price-lists/{id}/rates`, `/rate`, `/assign`, `/for-party`.

| Field | |
|---|---|
| Purpose | Give a group of customers their own rates ("Wholesale: 5% below usual price, a few exact rates"). |
| Who and when | Owner, occasionally. |
| Phone layout | List: name · rule ("5% below usual price") · "12 customers". Detail: rule card with Edit; **Pinned rates** list (item · usual ₹450 → list ₹420); "Pin a rate" row (item search + rate). Customers are put on a list from their person page (`PartyPriceListControl`). |
| Desktop layout | table of lists; detail with rule left and pinned rates table right. |
| What matters most | the rule → pinned exceptions. |
| Components | `UbDataGrid`, `UbPanel`, `UbAsyncCombobox`, `UbMoneyInput`, `PriceListFormDialog`. |
| Main / other actions | New price list · Pin a rate · Remove a pin. |
| Navigation | from Items ⋯; bills for that customer start from the list's rate (editor line says "Wholesale list rate"). |
| States | §0.1, plus first use "Make a list when some customers pay different rates" · no write permission: read only. |
| Accessibility | rule written as a sentence. |
| Must keep working | rates apply on new bills only; bill price still editable per line. |
| Fewer taps | pin rate inline. |

### 8.7 Stock summary · `/stock/summary` and Low stock · `/stock/low`

`StockSummaryPageContent`, `LowStockPageContent`, `useStockReports`; `GET /stock/summary`, `/stock/low`.

| Field | |
|---|---|
| Purpose | Summary: what stock is worth and where it is. Low stock: what to reorder. |
| Who and when | Owner weekly; before calling a supplier. |
| Phone layout | Summary: figure line (items · stock value with permission) then cards: item · on hand · value. Low: cards: item · "3 left · reorder below 5" · Purchase price (permission; the word unified 17 Oct) · **Order** button (opens a new purchase order with the item, where purchases are on). |
| Desktop layout | tables with the same columns; Low stock gets a selection bar "Order selected" → one purchase order per supplier is **not** promised (needs a supplier on the item; verify), else one order. |
| What matters most | low items → act. |
| Components | `UbDataGrid`, `UbStatGrid`, `StockBadge`, `UbButton`. |
| Main / other actions | Adjust stock · Order · Export. |
| Navigation | rows → item detail. |
| States | §0.1, plus "Nothing is low" success empty state; stock off (`inventory.enabled` false): pages say "Stock tracking is off in Settings" with a link (owner). |
| Accessibility | as lists. |
| Must keep working | potential sale value definition unchanged (RPT-06 BR-10; change request pending in 14). |
| Fewer taps | Order from the low-stock row. |

Tracking (all of §8): problems — Items buried in More; low stock has no next action · decisions — Adjust stock on the item page; Order from low stock · dependencies — purchase order prefill (route query, no new endpoint — verify the editor accepts it) · risks — "Order selected" grouping by supplier unproven · approval — pending · build — not started · tests — `item-pricing-review.mjs`, `stock-date-look.mjs`, inventory unit tests · outcome — —

---

## 9. CSV import wizard · `/imports`, `/imports/[id]`

`ImportPageContent` → `ImportWizard` (lazy): `ImportKindPicker` → `ImportUploadStep` → `ImportReviewStep` (+ `ImportRowsReview`, `ImportSummaryPanel`, `ImportFailedPanel`), `ImportJobView`, `pollDelay`. Endpoints `POST /imports`, `GET /imports/{id}`, `/rows`, `/errors.csv`, `POST /commit` (keyed), `/cancel`, `GET /imports/templates/{kind}.csv`.

| Field | |
|---|---|
| Purpose | Bring an existing list (customers/suppliers, items) in from Excel without typing it. |
| Who and when | Owner, once at setup and occasionally after. |
| Phone layout | A stepper "1 Choose · 2 Upload · 3 Check and import" (a map, not a skip control). Step 1: choice cards (People, Items; Students/Loans only inside their own apps). Step 2: **Download the template** (first, prominent) · **Choose file** (`UbFileUpload`; wrong type or over 5 MB refused here with the server's sentence). Step 3: four tiles (Will import · Have problems · Already in your book · Total opening ₹), then "Problems" as cards (row 14 · Mobile · "Has 9 digits") with **Download problem rows**; "Already in your book" as a choice (Skip · Update); rows as understood, paged. Dock: **Import 412 rows** (count in the label) with its disabled reason underneath when disabled. Job view: progress with "You can leave this screen; we'll keep going", then the result. |
| Desktop layout | same steps; step 3 has tiles on top and the two grids (problems, rows) as tables. |
| What matters most | the template → the problems → the count that will import. |
| Components | `UbStepper`/existing stepper, `UbFileUpload`, `UbStatCard`, `UbDataGrid`, `UbButton`, `ExportReadyPanel`. |
| Main / other actions | Import N rows · Cancel import · Download problem rows · Start another. |
| Navigation | from Items ⋯ / Customers ⋯ / Settings › Data; the job page is addressable (`/imports/[id]`), so leaving and coming back works. |
| States | §0.1, plus **reading the file** — polling with backoff (`pollDelay`), progress words not a bare spinner · **all rows have problems** — Import disabled "Fix the problem rows in the file and upload again" · **partial** — good rows import, problem rows stay in the error file (B33) · **cancelled mid-read** — "Import cancelled. Nothing was added." · **commit tapped twice** — one job (keyed `@idempotent("import_commit")`) · **no permission** — kinds the role can't import are not offered (`importAccess.ts`) · **thousands of rows** — server paging of rows (B34) · **phone file picking** — accepts .csv only; one line says "Save your Excel sheet as CSV first" with a 3-step how-to fold. |
| Accessibility | stepper announces "Step 2 of 3"; disabled reason is visible text, not a tooltip. |
| Must keep working | totals count only rows that will import, problem money said apart (B27); duplicates are a choice (B28); party button names customers/suppliers/both (B44); Library/Lending kinds unchanged (frozen apps; presentation only). |
| Fewer taps | template first; one Import with the count. |

Tracking: problems — Excel-to-CSV step unexplained on phones · decisions — how-to fold · dependencies — none · risks — phone CSV handling across Android file pickers (device test) · approval — pending · build — not started · tests — `import-look.mjs`, `import-app-look.mjs`, `import-verticals-look.mjs` · outcome — —

---

## 10. Reports

### 10.0 The phone rule for every report (fixes A-11)

**No report is a wide table that scrolls sideways on a phone.** Each report on a phone has three layers:

1. **Answer first**: a figure line of 2–4 totals for the period with one-line basis ("23 bills · with GST"), from the server's totals.
2. **Rows as cards, grouped**: a date band (or party/item band) with the band's subtotal on the right; each card shows at most **three things**: what (party or item, 2 lines), when/which (number · date · type word), and one amount. The card's field order is fixed per report (below).
3. **The whole row on tap**: a bottom sheet listing every column of that row as label/value pairs (`UbInfoRow`), with "Open bill" when the row has a document.

Plus: the period as `UbDateRangePicker` chips (Today · This week · This month · Last month · This FY · Custom); **Download** (CSV for Excel) and **Print** as the way to get the full wide table; sort as a single-choice sheet (DESIGN-SYSTEM §3). The grids already have a card tier (`useGridTier`, `isCards` in `RegisterReport.tsx:95`, `ProfitReportPageContent.tsx:62`, `DayBookDayGroups`), so this is a presentation tightening, not a rebuild; the remaining sideways regions (A4 print previews, GSTR-3B boxes) are replaced as stated per report. Verify with a measuring check: `scrollWidth ≤ viewport` and no clipped text node at 320/360/390 (the CLAUDE.md measuring rule).

`ReportPageShell` (scope bar, Export, `ReportStateBody` states) is the one frame for all of them.

### 10.1 Reports hub · `/reports`

| Field | |
|---|---|
| Purpose | Find the right report by the question it answers. |
| Who and when | Owner weekly/monthly; accountant at month end. |
| Phone layout | Groups from `reportCatalogue.ts` as headed lists: **Money** (Day book, Cash book), **People** (Who owes you — aging receivable, What you owe — aging payable), **Stock** (Stock summary, Low stock), **Sales and tax** (Sales register, Purchase register, Profit, GST summary). Each row: plain question as title ("What happened today?") with the report name as caption. |
| Desktop layout | the same groups as a two-column card grid. |
| What matters most | the question → the report. |
| Components | `UbPanel`, `UbMenuList`/`UbPressable` rows, `UbSectionHeading`. |
| Main / other actions | open a report. |
| Navigation | App sheet › More in Shop › Reports; desktop sidebar. Module reports appear only when registered and listed by the server (`reportsRegistry.ts`). |
| States | §0.1, plus a role sees only reports whose permissions it holds (catalogue `permissions`); none → "No reports for your role. Ask the owner." |
| Accessibility | rows are links with the question and report name. |
| Must keep working | catalogue permission and module filter; intersection rule for module reports. |
| Fewer taps | questions as titles cut guessing. |

### 10.2 Day book · `/reports/day-book`

`DayBookPageContent`, `DayBookDayGroups`, `DayBookColumns`; `GET /reports/day-book`. Default period Today (FR-5); type chips; Show cancelled (FR-7); `balancesVisible` gates cash/bank running columns.

| Field | |
|---|---|
| Purpose | Tally the drawer: everything that happened today, in order, with cash after each line. |
| Who and when | Owner at closing; accountant monthly. |
| Phone layout | Figure line: Money in · Money out · Cash at close (if visible). Date bands with day in/out. Card: **what** (party or "Walk-in"; 2 lines) · **which** (time · type word "Bill INV-0418" / "Payment received" / "Expense: tea") · **amount** signed in words (In ₹1,240 / Out ₹200). Running cash appears in the row sheet, not on the card. |
| Desktop layout | table as today (Time · Type · Number · Party · In · Out · Cash after · Bank after). |
| What matters most | cash at close → each line. |
| Components | `ReportPageShell`, `UbDataGrid`, `DayBookDayGroups`, `UbInfoRow`, `UbActionSheet` (row sheet). |
| Main / other actions | period · type chips · Show cancelled · Download · Print. |
| Navigation | row sheet → Open document. |
| States | §0.1 + `ReportStateBody`; **no balance permission** — rows and day in/out, hint "Cash and bank balances are visible to the owner"; **quiet day** — "Nothing recorded on 17 Oct". |
| Accessibility | in/out in words; bands are headings. |
| Must keep working | Shop book only — Udhaar entries must not appear (verify against the server's sources in Phase 2; DEC-019); `balancesVisible` server decision; CSV equals the query. |
| Fewer taps | Today default. |

### 10.3 Sales register · `/reports/sales-register` and 10.4 Purchase register · `/reports/purchase-register`

`RegisterReport` (book sales/purchase, `level` document/line), `RegisterColumns`, `RegisterTotals`; `GET /reports/sales-register`, `/reports/purchase-register`.

| Field | |
|---|---|
| Purpose | Every bill (or bill line) in a period with its tax, for the accountant and GST filing. |
| Who and when | Accountant monthly; owner checking a month. |
| Phone layout | Figure line: Bills · Taxable · GST · Total. Level chip: By bill · By item line. Cards (by bill): party/supplier · number · date · total; row sheet: taxable, CGST, SGST, IGST, cess, round-off, GSTIN, place of supply. Band by date with subtotal. |
| Desktop layout | the existing wide table with totals row. |
| What matters most | totals → find a bill. |
| Components | `RegisterReport`, `RegisterTotals`, `UbChoiceChips`, row sheet. |
| Main / other actions | Download (CSV) · Print. |
| Navigation | row → document. |
| States | §0.1; permissions `reports.basic.read` + `sales.invoice.read` / `purchases.bill.read`; cancelled bills shown struck with "Cancelled" word when included. |
| Accessibility | totals as `dl`. |
| Must keep working | figures as returned; CSV unchanged. |
| Fewer taps | none needed beyond the period. |

### 10.5 GST summary · `/reports/gst-summary`

`GstSummaryPageContent`, `GstReport`, `GstSection`, `Gstr3bBoxes`, `GstReturnJsonButton`; `GET /reports/gst-summary`, `/reports/gst-returns/{kind}`.

| Field | |
|---|---|
| Purpose | See the month's GST by return section and download the JSON for the GST portal. |
| Who and when | Owner or accountant, monthly. |
| Phone layout | Month picker (closed months only for JSON). Figure line: Output GST · Input GST · Net payable. Sections (B2B, B2C, credit notes, HSN…) as collapsible panels, each with its own totals as label/value rows; the section's rows as cards (party/HSN · invoice count · taxable · tax). **GSTR-3B boxes** as a stacked list of labelled boxes (3.1(a)…), never a grid that scrolls. **Download GSTR-1 JSON / GSTR-3B JSON** buttons with "For the GST offline tool" caption. |
| Desktop layout | sections as tables; 3B boxes as the official grid. |
| What matters most | net payable → sections → JSON. |
| Components | `GstSection`, `Gstr3bBoxes` (phone list variant), `UbDisclosure`, `GstReturnJsonButton`. |
| Main / other actions | JSON download · CSV · Print. |
| Navigation | rows → documents. |
| States | §0.1; `reports.financial.read` only; open month: JSON disabled "Available after the month closes"; download busy and single-flight. |
| Accessibility | box codes read with their meaning ("3.1(a) Outward taxable supplies"). |
| Must keep working | figures, JSON shape and month rule untouched. |
| Fewer taps | net payable first. |

### 10.6 Profit · `/reports/profit`

`ProfitReportPageContent`, `ProfitSummary`, `ProfitColumns`; `GET /reports/profit`. Cost frozen per sale line (`apps/reports/selectors/profit.py`).

| Field | |
|---|---|
| Purpose | How much the shop earned on what it sold, by bill, item, customer or day. |
| Who and when | Owner, weekly/monthly. Never staff. |
| Phone layout | Figure line: Sales (net) · Cost · **Profit** · Margin %. Group chips: By item · By bill · By customer · By day. Cards: name · "Sold ₹12,400 · Profit ₹1,120" · margin %. Row sheet: qty, sale, cost, profit, margin. A one-line basis: "Cost is what each item cost when it was sold." |
| Desktop layout | the table with group switch. |
| What matters most | profit → which items earn. |
| Components | `ProfitSummary`, `UbDataGrid`, `UbChoiceChips`, row sheet. |
| Main / other actions | Download · Print (owner's copy; never a customer document). |
| Navigation | rows → item/bill/person. |
| States | §0.1; requires `reports.basic.read` + `sales.invoice.read` + `reports.financial.read`, else not listed in the hub and the route shows no-access; items sold with no cost recorded: "3 items had no cost; their profit is not counted" with a link to fix costs. |
| Accessibility | negative profit in words "Loss ₹200". |
| Must keep working | frozen line cost; margin = profit ÷ net sale; never on any customer surface. |
| Fewer taps | group chips. |

### 10.7 Aging (who owes / what you owe) · `/reports/aging`

`AgingPageContent book="shop"` (from `F/ledger`), `?type=payable` for suppliers; `GET /ledger/aging` with the Shop book.

| Field | |
|---|---|
| Purpose | Who is most late, by age bucket, in the Shop's book. |
| Who and when | Owner before a collection round or paying suppliers. |
| Phone layout | Switch: **Customers owe you** · **You owe suppliers** (separate, never netted). `UbAgingBars` totals per bucket (0–30, 31–60, 61–90, 90+ days) with tap-to-filter. Cards: name · total due · "oldest 74 days" · bucket chip; row sheet with each bucket's amount and **Remind** (customers; depends on TV-02 Shop reminders) / **Pay** (suppliers). |
| Desktop layout | table Name · Total · 0–30 · 31–60 · 61–90 · 90+ with the bars above. |
| What matters most | 90+ bucket → the people in it → act. |
| Components | `UbAgingBars`, `UbDataGrid`, `UbChoiceChips`, row sheet. |
| Main / other actions | Remind · Pay · Download. |
| Navigation | rows → person page in the Shop context (`history.state.yourkhataApp`). |
| States | §0.1; settled book "Nobody owes you anything in the Shop" (no ₹0 table); `ledger.entry.read` required. |
| Accessibility | buckets as words; bars have a table alternative (`UbChartTable`). |
| Must keep working | `book="shop"` (DEC-019); customers and suppliers separate (TV-01 server netting fix is a dependency). |
| Fewer taps | Remind from the row sheet. |

Tracking (all of §10): problems — A-11 wide tables on phones; GSTR-3B grid sideways · decisions — answer/cards/row-sheet rule; questions as hub titles · dependencies — TV-01, TV-02 for aging actions; day book source check · risks — accountants may want the table on a phone (Download covers it) · approval — pending · build — not started · tests — `final-reports-qa.mjs`, `RegisterPages.test.tsx`, `DayBookPageContent.test.tsx`, a new measuring check (no horizontal scroll, no clipped text) at 320/360/390 · outcome — —

---

## 11. Settings · `/settings` and `/settings/*`

Hub: `SettingsPageContent.tsx` (links + `LedgerSettingsSection` + `ModuleToggleList`), `SettingsGate`, `useSettingsAccess`; `GET/PUT /tenants/current/settings` (+ `/defaults`). The design page's `#settings` is the reference: every row shows its current value, phones have every row desktops have, unsaved changes ask before leaving, a failed save keeps changes.

### 11.1 Settings hub · `/settings`

| Field | |
|---|---|
| Purpose | One place for the business's own setup. |
| Who and when | Owner, rarely; staff to read. |
| Phone layout | Rows with current value as caption: **Business details** ("Shree Ganesh Kirana · GST regular") · **Bills and printing** ("INV- next 0419 · 80 mm") · **Reminders and messages** (today's `LedgerSettingsSection` moved to its own page) · **Items and stock** ("Selling below zero: off") · **Team and roles** ("4 people") · **Apps** (`ModuleToggleList`) · **Branding** · **Business days** ("Closed Sunday") · **Devices** · **Plan** · **Activity log** · **Your data**. Personal items (language, theme) are on the You page (04 §9), not here. |
| Desktop layout | Left list of sections (240 px), selected section on the right (design page). |
| What matters most | current values at a glance → open one. |
| Components | `UbPanel`, `UbPanelSection`, `UbLink` rows, `UbInfoRow`. |
| Main / other actions | open a section. |
| Navigation | App sheet › You/More › Settings; desktop sidebar bottom. |
| States | §0.1; staff: rows read-only ("Only the owner can change bill settings. You can see them."); rows for pages a role can't open are not drawn (Your data is owner-only by role name). |
| Accessibility | each row's name includes its value. |
| Must keep working | `PUT` round-trips the whole object; version conflict dialog ("Changed on another device · Reload"); module toggles through `POST /tenants/current/apps` (owner). |
| Fewer taps | values on rows avoid opening sections to check. |

### 11.2 Bills and printing (NEW section page, existing server keys) · `/settings/bills` (new route; the hub link replaces nothing)

| Field | |
|---|---|
| Purpose | Decide how new bills are numbered, printed and shared. |
| Who and when | Owner at setup and at a new financial year. |
| Phone layout | Rows (from `#settings`): **Next bill number** "INV- [0419] · New bills only; old bills keep their numbers" — checked before save: "INV-0400 is already used. The next free number is INV-0419." · **Payment due after** "15 days" (`sales.default_due_days`) · **Paper** A4 · 80 mm · 58 mm — **kept on this device** ("This phone prints on 80 mm") because the printer belongs to the device; today the template is component state defaulting to A4 (`useInvoiceDetail.ts:100`), so a per-device preference needs no server change (local storage, try/catch, falls back to A4) · **Note at the bottom** (`documents.terms`, counter) · **UPI QR on bills** (`documents.show_upi_qr`; disabled with "Coming soon" is NOT allowed — row hidden until PAY-03's encoder ships) · **Preview** "80 mm bill · Preview" opens the real thermal sheet with the example bill. Sticky bar: "2 changes not saved · fix the bill number to save · Discard · Save changes". |
| Desktop layout | section form left, live 80 mm/A4 preview right (existing print components). |
| What matters most | next number → paper → note. |
| Components | `UbPanel`, `UbTextInput`, `UbNativeSelect`, `UbChoiceChips`, `UbTextArea`, `UbBottomBar`, `InvoicePrintThermal80`/`InvoicePrintA4` for preview, `UbConfirmDialog` (leave). |
| Main / other actions | Save changes · Discard · Preview. |
| Navigation | from hub; leaving with changes → "Leave without saving? Your 2 changes to Bills and printing will be lost. · Stay · Leave". |
| States | §0.1; numbering conflict (server `numbering_row_errors` in `platform_app/settings_schema.py:417`); save failed "Couldn't save. Your changes are still here."; staff read-only; **"Show GST breakup" from the design page is not offered** — no server key exists; listed as an owner question/backend proposal rather than a switch that does nothing (PLT-06 rule). |
| Accessibility | number field announces the conflict; preview has a text description. |
| Must keep working | numbering lives on `platform_document_sequence` via `services.tenant_settings` (only `reset_fy` stored in the row); new numbers affect new bills only; bills print the business name only. |
| Fewer taps | paper chosen once per device; Print on bills uses it without asking. |

### 11.3 Items and stock (NEW section page, existing keys)

Rows: Track stock (`inventory.enabled`), **Selling below zero** (`inventory.allow_negative_stock`, with what it means: "If off, an item with no stock can't be billed"), Favourite units (`inventory.favourite_units`). Same save bar and states as 11.2. Must keep: the editor's out-of-stock sentence reads this setting.

### 11.4 Business details · `/settings/profile`

`BusinessProfilePageContent`, `DocumentHeaderPreview`; `GET/PATCH /tenants/current`. Phone: one form in folds (Name and address · GST · Bank and UPI · Contact) with the bill header preview under the form ("This is how your bills start"). GST type change confirmed first ("This changes what kind of bill you issue"). Accountant reads with bank number and PAN masked **by the server**. States per §0.1; save bar as 11.2. Must keep: masking server-side; UPI VPA validated to the server pattern; no live QR (PAY-03).

### 11.5 Team · `/settings/team`

`TeamPageContent`, `MembersSection`, `AddMemberDialog`, `EditMemberDialog`, `MemberActionsMenu`, `CredentialsDialog`, `InviteMemberDialog` (lazy); `/members`, `/memberships`, `/invitations`, block/unblock/remove, revoke sessions. Phone: people as cards (name · mobile · role · "Signed in today"), **+ Add person** (name, mobile, role — DEC-013; signs in with that number; copy never says a message was sent, DEC-012); ⋯ per person: Change role, Block, Remove, Sign out everywhere. Desktop: table. States: owner can't remove themself; plan seat limit → `PlanLimitDialog`; repeated Add → one member (keyed `/members`); a temporary password (email accounts) shown once with Copy and "Give this to them yourself". Must keep: invitation token flow untouched; module roles (`ModuleRoles`).

### 11.6 Branding · `/settings/branding`

`BrandingPageContent`, `BrandingPreview`, `ColourField`; `/tenants/current/branding`. Logo, brand colour (with contrast check), app name, two bill lines; each field says where its value comes from (shop / partner default / product default / partner lock with reason); live preview. Owner/admin edit (`platform.branding.manage`), others read. The YourKhata mark in the app shell is unchanged (R-DEC-06); a shop's logo appears on its bills, never ours.

### 11.7 Business days · `/settings/business-days`

`BusinessDaysPageContent`, `WeekdayChips`, `ClosedDayDialog`; `/calendar/weekdays`, `/calendar/closed-days`. Weekday chips (closed days filled), per-feature override rows, dated closures for 12 months grouped by month with + Add closed day. Everyone reads; `platform.calendar.manage` edits. Reached directly with no feature reading the calendar → "No app uses business days yet". Library/Lending due-date rules read this calendar: presentation only (02 §2–3).

### 11.8 Your data · `/settings/data` (owner only)

`AccountDataPageContent`, `DataExportPanel`, `SupportAccessPanel`, `DeleteBusinessPanel`, `DeleteBusinessDialog`, `PendingDeletionBanner`; `/tenants/current/export(s)`, `/deletion`, `/delete-request`, `/delete-cancel`. Three panels: **Download everything** (busy while building; returns the export in flight on repeat), **Let support in for a day**, **Delete this business** (type the business name, 30 days to change mind, banner while pending with Cancel deletion). Admin is told no by role name (server refuses too).

### 11.9 Devices · `/settings/devices`

`DevicesPageContent`, `DeviceCard`, `RenameDeviceDialog`; `/auth/sessions`. Cards: device name · "This device" badge · last active · place; Rename; Sign out. Header: **Sign out everywhere** with a confirm that says it signs this device out too. Every person sees their own devices regardless of role. Also linked from the You page (04 §9).

### 11.10 Plan · `/settings/plan`

`PlanPageContent`, `PlanUsageCard`, `PlanLimitBanner`. Two things only (DEC-001): people used of the plan's seats, apps included; and the sentence "Udhaar entries are never limited." No upsell banners elsewhere.

### 11.11 Activity log · `/settings/activity`

`AuditLogPageContent`, `AuditColumns`, `AuditDetailDrawer`; `/audit-logs`, `/audit-logs/actors`. Opens on Today; period right; Who and What selects; search. Phone: cards "Ravi cancelled INV-0418 · 4:12 pm" with the reason in a second line; tap → detail drawer (before/after in words). Export = the filtered rows. Owner, admin, accountant.

Settings shared fields (11.4–11.11):

| Field | |
|---|---|
| Phone / desktop | every row the desktop has, phone stacks; desktop left section list + content |
| States | §0.1; read-only roles see values without controls; failed save keeps changes; conflict → reload dialog; offline → Save disabled with reason |
| Accessibility | forms labelled; switches name their effect; destructive confirms focused on the safe choice |
| Must keep working | permissions per page as listed; no email is sent (DEC-012); no request id shown |
| Fewer taps | values on hub rows; Sign out everywhere one confirm |

Tracking (all of §11): problems — bill settings exist on the server and have no screen (PLT-06 docstring: they join "with the features that consume them", which now exist); `LedgerSettingsSection` sits on the hub page itself · decisions — Bills and printing + Items and stock pages over existing keys; paper per device; GST-breakup switch not offered · dependencies — new route `/settings/bills` and `/settings/stock` (presentation only, no endpoint) · risks — numbering edits near FY change (server rule governs) · approval — pending · build — not started · tests — `wave1-settings-qa.mjs`, `qa_settings.py`, `SettingsHub.test.tsx`, unsaved-change guard e2e · outcome — —

---

## 12. Differences found between docs and code (for the decision log; not edited here)

1. `07-screens/README.md` names these specs `08-shop-*.md`; this file was requested as `09-shop-bills-items-reports.md`.
2. PRODUCT-REVIEW / A-11 says reports are wide tables on phones; the code already has a card tier for registers, profit, GST sections and day book. What remains sideways: the A4 print preview on the bill page and GSTR-3B boxes. 10.0 keeps the measuring check to prove it.
3. The PLT-06 docstring says bill settings wait for consumers; bills, stock and printing now exist.
4. `POST /purchases/orders`, `/price-lists`, `/categories`, `/units` are not on `IDEMPOTENT_POST_PATHS` — to audit (05 §4), not assumed safe or unsafe.
5. The print template is chosen per visit (`useState('a4')`), not remembered anywhere.

## 13. Owner questions

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q1 | "Settle with his supplier balance" in the Something's wrong chooser | A hide until settlement recording is decided · B show disabled | **A**: a row that can't work teaches the product is broken |
| Q2 | Default paper for printing | A per device (no server change) · B per business (needs a settings key, a backend proposal) | **A**: the printer is attached to the device |
| Q3 | Bill lines on phones | A compact rows, one expanded at a time · B today's full cards | **A**: 50 lines go from ~15,000 px to ~3,500 px; needs a timed phone test |

---

## Review

Rubric and weights from [09-design-review.md](../09-design-review.md): Mobile 20%, Ease 15%, Visual 15%, Feedback 15%, A11y 10%, Desktop 10%, Safety 10%, Reuse 5%. Pass is **strictly above 8.6** per area and overall. Self-assessed; §R4 says what each score still needs.

### R1. Round 1 (first draft of this file) — failed

The first draft described today's screens with the shared rules but kept: the A4 sheet in a sideways box on the phone bill page; separate Void and Return items in ⋯; phone line cards at ~285 px; purchase drafts described without their no-device-copy risk; reports "card tier exists" without a rule for what a card shows; Settings without the bill/printing section.

| Area | Mobile | Ease | Visual | Feedback | A11y | Desktop | Safety | Reuse | Weighted |
|---|---|---|---|---|---|---|---|---|---:|
| Sales lists | 8.5 | 8.6 | 8.6 | 8.4 | 8.3 | 8.6 | 9.0 | 9.0 | **8.58** |
| Sale document detail | 8.2 | 8.4 | 8.5 | 8.5 | 8.2 | 8.5 | 8.8 | 8.8 | **8.44** |
| Bill editor | 8.0 | 8.6 | 8.5 | 8.6 | 8.2 | 8.8 | 9.0 | 8.8 | **8.50** |
| Credit-note editor | 8.4 | 8.5 | 8.5 | 8.5 | 8.3 | 8.5 | 9.0 | 9.0 | **8.54** |
| Purchases (lists, detail, editor) | 8.2 | 8.4 | 8.5 | 8.4 | 8.2 | 8.5 | 8.6 | 8.8 | **8.41** |
| Items and stock | 8.5 | 8.6 | 8.6 | 8.4 | 8.3 | 8.6 | 8.8 | 9.0 | **8.56** |
| CSV import | 8.4 | 8.6 | 8.5 | 8.5 | 8.4 | 8.6 | 8.9 | 9.0 | **8.56** |
| Reports | 7.9 | 8.3 | 8.5 | 8.3 | 8.1 | 8.7 | 8.7 | 8.8 | **8.34** |
| Settings | 8.3 | 8.4 | 8.5 | 8.4 | 8.3 | 8.5 | 8.6 | 8.8 | **8.44** |
| **Overall (mean of 9)** | | | | | | | | | **8.48** |

Arithmetic (each row = Σ score × weight), for example:
- Sales lists: 8.5×0.20 + 8.6×0.15 + 8.6×0.15 + 8.4×0.15 + 8.3×0.10 + 8.6×0.10 + 9.0×0.10 + 9.0×0.05 = 1.70 + 1.29 + 1.29 + 1.26 + 0.83 + 0.86 + 0.90 + 0.45 = **8.58**
- Bill editor: 1.60 + 1.29 + 1.275 + 1.29 + 0.82 + 0.88 + 0.90 + 0.44 = **8.495 → 8.50**
- Reports: 1.58 + 1.245 + 1.275 + 1.245 + 0.81 + 0.87 + 0.87 + 0.44 = **8.335 → 8.34**
- Overall: (8.58 + 8.44 + 8.495 + 8.535 + 8.405 + 8.56 + 8.56 + 8.335 + 8.435) ÷ 9 = 76.345 ÷ 9 = **8.48**

### R2. Shortcomings and what changed

| Area | Shortcoming in round 1 | Change made (now in the spec) |
|---|---|---|
| Sales lists | status filter two taps deep on phones; "void" as a word | status chips visible (§1); "Cancelled" as the word |
| Sale detail | A4 sheet scrolls sideways; Void vs Return unexplained; "checked just now" unbacked; Receive in ⋯ | phone lines list from `printModel` + "See as printed" (§2); Something's wrong chooser with consequences and fresh read (§2.1); Receive and Share as the primary row |
| Bill editor | ~285 px cards (15,000 px for 50 lines); dock cut at 320 px Hindi; "Add line" before search; offline Issue unclear | compact rows, always-open search, focus to Qty (§3); stacked dock (TV-03); explicit offline and slow states; Issue's accessible name carries the total |
| Credit note | consequence below the fold | consequence line pinned above the dock; Return all |
| Purchases | in-memory draft risk unstated; payment-permission 403 confusing; void refusals generic | honest "Not saved yet" caption and leave guard; "Record as Pay later"; per-line insufficient stock, debit-note and archived-supplier refusals named (§6–7) |
| Items and stock | adjust in ⋯; low stock had no next action | Adjust on item page; Order from low stock; scan from list |
| Import | Excel → CSV step unexplained on phones | how-to fold; template first; count on the button |
| Reports | no rule for phone cards; GSTR-3B grid sideways | answer → cards (3 fields) → row sheet rule, per-report field order, 3B as a list, measuring check (§10.0) |
| Settings | server bill settings had no screen; paper not remembered; GST-breakup switch would do nothing | Bills and printing + Items and stock pages over existing keys; paper per device; switch not offered (§11.2–11.3) |

### R3. Round 2 (current spec) — passes, provisionally

| Area | Mobile | Ease | Visual | Feedback | A11y | Desktop | Safety | Reuse | Weighted |
|---|---|---|---|---|---|---|---|---|---:|
| Sales lists | 8.8 | 8.8 | 8.6 | 8.8 | 8.5 | 8.7 | 9.1 | 9.0 | **8.77** |
| Sale document detail | 8.8 | 8.9 | 8.6 | 8.8 | 8.5 | 8.7 | 9.1 | 8.9 | **8.78** |
| Bill editor | 8.7 | 8.9 | 8.6 | 9.0 | 8.4 | 8.9 | 9.1 | 8.8 | **8.80** |
| Credit-note editor | 8.7 | 8.8 | 8.6 | 8.8 | 8.5 | 8.6 | 9.1 | 9.0 | **8.74** |
| Purchases | 8.7 | 8.8 | 8.6 | 8.8 | 8.4 | 8.7 | 9.0 | 8.9 | **8.73** |
| Items and stock | 8.8 | 8.8 | 8.6 | 8.7 | 8.5 | 8.7 | 9.0 | 9.0 | **8.75** |
| CSV import | 8.7 | 8.8 | 8.6 | 8.8 | 8.5 | 8.7 | 9.0 | 9.0 | **8.74** |
| Reports | 8.8 | 8.7 | 8.6 | 8.7 | 8.5 | 8.8 | 8.9 | 8.8 | **8.72** |
| Settings | 8.7 | 8.7 | 8.6 | 8.8 | 8.5 | 8.7 | 8.9 | 8.9 | **8.71** |
| **Overall (mean of 9)** | | | | | | | | | **8.75** |

Arithmetic, for example:
- Sale detail: 8.8×0.20 + 8.9×0.15 + 8.6×0.15 + 8.8×0.15 + 8.5×0.10 + 8.7×0.10 + 9.1×0.10 + 8.9×0.05 = 1.76 + 1.335 + 1.29 + 1.32 + 0.85 + 0.87 + 0.91 + 0.445 = **8.78**
- Bill editor: 1.74 + 1.335 + 1.29 + 1.35 + 0.84 + 0.89 + 0.91 + 0.44 = **8.795 → 8.80**
- Settings (lowest): 1.74 + 1.305 + 1.29 + 1.32 + 0.85 + 0.87 + 0.89 + 0.445 = **8.71**
- Overall: (8.77 + 8.78 + 8.795 + 8.74 + 8.725 + 8.745 + 8.74 + 8.72 + 8.71) ÷ 9 = 78.725 ÷ 9 = **8.75**

Every area is above 8.6; the smallest margins are Settings (8.71) and Reports (8.72). Visual stays at 8.6 everywhere because nothing here has been drawn beyond the design page's sections; Accessibility stays at 8.4–8.5 because no axe or screen-reader pass has run on these screens.

### R4. What each score still needs before it counts

| Score | Needs |
|---|---|
| Mobile (all) | the measuring check (no horizontal scroll, no clipped text) at 320/360/390 on every screen here, in Hindi with large system text; keyboard-open dock on a real Android and iPhone |
| Bill editor Mobile/Ease | `counter-entry-timing.mjs` at 390 px with compact rows (1/10/50 lines) and 5–8 shopkeepers keying a 10-line bill (G5); owner answer Q3 |
| Feedback (all) | tap-to-first-change and INP on the reference phone (05 §5–6); the double-tap script on Issue, Record, Save return, Save adjustment, Import, Receive money: 0 duplicates |
| A11y (all) | axe sweep at 390 and 1280 both themes; TalkBack pass on editor, chooser and report row sheet; the MLDialog autoFocus fix verified on every confirm here |
| Safety: sales and purchases | regression: void API tests, `test_a_customer_never_sees_what_the_shop_paid`, `customerDocumentsCarryNoProductName.test.tsx`, recovery looks; the idempotency audit in §0.3 closed |
| Safety: reports | day book confirmed to exclude the Udhaar book; aging lanes depend on TV-01 (no netting) and Remind on TV-02 |
| Sale/purchase detail | owner answer Q1; "Supplier gave money back" direction verified to exist in payments |
| Settings | owner answer Q2; numbering conflict path tested near a financial-year change |
| Visual (all) | drawn screens at 4 widths, both themes, reviewed by the owner (only the design page's sections exist today) |
| Desktop (all) | `e2e/desktop-unchanged.mjs` for screens not in the phase; 1024/1280/1440 sweeps |

### R5. Strongest criticisms still standing

1. The "Something's wrong" chooser is one more step for owners who already know Void; only a timed test shows whether clarity wins.
2. Purchase drafts are still lost on a full reload after a lost reply; the spec states the risk and leans on in-place re-auth, which the shell has not built.
3. Compact line rows hide discount and GST until a row is opened; the "−5%" marker is a mitigation, not proof.
4. Reports' cards show three fields; an accountant on a phone may still want the table, and the answer offered is Download.
