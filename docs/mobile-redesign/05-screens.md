# 05 — Screen-by-screen recommendations

Each entry: what changes, which audit finding it answers, and where to see it in
the [prototype](prototype/index.html). "Same pattern" means the screen gets the
list, detail or form pattern from 04 §6.3 with no screen-specific design.

## Shop

### Home (`/dashboard`) — A7, A8, A2
- App bar: business switcher with the full name and app ("Sharma General Store
  · Shop"), 🔍, 🔔.
- Hero pair: **To collect** / **To pay**, each opening Parties filtered.
- Strip: Sales today, Cash in hand, Bills due, Low stock (horizontal scroll).
- Quick actions: New bill, Gave / got (party picker → entry sheet), Add party,
  Expense.
- Needs attention: overdue bills → aging; not reminded → reminders; low/out
  stock → Items filtered.
- This week: one sparkline + "See insights" (the existing charts move to an
  Insights screen on mobile only).
- Recent: last entries, tappable to the khata.

### Parties (`/customers`, `/suppliers`) — A3, A4, A5, A6
- Tab title "Parties", ⋯ (Manage tags, Import, Download, Aging, Reminders).
- Segmented Customers / Suppliers — the URL stays `/customers` or
  `/suppliers`, so links and the address-bar filters (PTY-05) keep working.
- Summary line, search + Filter (balance, tags, show, sort), applied chips.
- Rows, continuous loading, FAB "Add customer" / "Add supplier".
- Filtered-empty keeps PTY-02's "add the party you searched for".

### Khata (`/parties/[id]`) — A9, A10, A11
- App bar: ←, name, 📞, ⋯ (Statement, Send reminder, Edit, Tags, Show
  corrections, Promise date, Archive).
- Identity row (avatar, badges, mobile), balance block (34 px figure, meaning,
  as-of, credit bar).
- Pills: Remind, Statement, Promise.
- Day-banded timeline; **tapping a row opens it** (detail sheet with Correct /
  Reverse); per-row ⋯ removed.
- **Docked You gave (red) / You got (green), always visible**, not only after
  scrolling. Hidden for archived parties and read-only roles, as today.

### Entry sheet (LED-01 drawer) — A12, A13
- Half/large sheet titled "You gave · Ramesh Traders".
- Segmented gave/got at top (to fix a wrong tap) instead of a radio pair.
- `UbAmountField` with the numeric keyboard; credit room shown under it.
- Date chips Today / Yesterday / Other date; note.
- One Save, coloured by direction. No Cancel button (✕, swipe, Escape).
- Credit-limit refusal shows in the sheet, in words.
- After save: snackbar "₹300 given to Ramesh Traders. Balance ₹800." + Undo;
  the row flashes.

### Statement (`/parties/[id]/statement`) — A15
- Period chips; one summary card (brought forward, gave, got, closing);
  rows oldest first with "Balance ₹x to give" wording matching the khata.
- Docked Print / Share; CSV in the share sheet.

### Bills (`/sales/invoices` and the other four sales lists) — A3, A4
- Title is a switcher: Bills · Estimates · Sales orders · Delivery challans ·
  Credit notes, each with its count. Routes do not change; the switcher
  navigates.
- Summary line (period, billed, due); status chips with counts; period chip.
- Rows: party, number · date, amount, status badge. FAB "New bill".

### New bill (`/sales/invoices/new`, and the other editors) — A14
- Full screen: ✕, "New bill", "Save draft".
- Walk-in / Party segmented; Party opens a full-height picker (`usePartySearch`).
- Items first: "Add item" opens a full-height picker (`useItemSearch`,
  frequently billed first); lines with steppers; the hardware scanner keeps
  working.
- **More options** disclosure with a summary: walk-in name and mobile, date,
  place of supply, discount, round off, note.
- Docked total + Save bill. Leaving with lines asks "Save as draft / Discard".
- Success screen: Send on WhatsApp, Print, Record payment, New bill.
- `UbLineItemsEditor` already renders cards below `md`; the change is the
  frame around it, not the editor.

### Bill detail (`/sales/invoices/[id]`) — same pattern
Status, amount, party; items card; totals card; docked Record payment (or
Print when paid); ⋯ Print, Edit, Duplicate, Credit note, Cancel.

### Items (`/items`) — A3
- ⋯ replaces six icon buttons: Stock summary, Categories and units, Price
  lists, Adjust stock, Import, Download.
- Search with scan; chips All / In stock / Low / Out with counts; Low/Out as
  badges; FAB Add item.

### More — A1
Grouped list of every remaining destination (03 §3), "Find a feature", then
Business (switcher, Settings, Team) and You (account, language, theme, sign
out).

### Settings (`/settings`) — A18
One list of groups; each group is its own page (profile, branding, business
days, data, devices, plan, activity). Same routes as today; the phone shows the
index first instead of every form stacked.

### Reports (`/reports`) — A17
Plain grouped rows with icon, title and one-line description. Each report:
summary card on top, rows below, period chips, export in ⋯.

### Aging (`/ledger/aging`) — A16
Segmented get/give; one card with the total and a stacked bucket bar; rows
show name, bucket and amount once.

### Purchases, orders, debit notes, expenses, payments, cashbook, price lists, stock, imports, team
Same list / detail / form patterns. Purchase bill new = the bill flow with
supplier instead of customer. Cashbook and day book = the khata's day-banded
list.

### Search
One overlay from 🔍: recent searches, then results grouped Parties / Bills /
Items. (Today's phone search is parties only; bills and items search exist as
list filters and would be queried in parallel.)

## Library (same shell, its own tabs)

- **Today:** hero In now / Fees due; strip (free seats, collected today,
  ending this week); quick actions Check in, Add student, Collect fee, Seat
  map; needs attention; FAB **Check in**.
- **Students:** the Parties pattern; chips Active / Fee due / Ending soon.
- **Seats:** shift chips, legend with counts, a 6-column grid of 48 px seats;
  a tap opens the seat sheet (who, until when, move; or give to a student).
- **Fees:** due queue with a per-row Collect; "Remind all on WhatsApp".
- **More:** counter, attendance, messages, money, expenses, catalogue, copies,
  settings.

## Lending

Same frame: **Today** (route for today, due, collected, FAB Collect), **Loans**,
**Borrowers**, **Routes**, More (messages, settings). Not prototyped; the
patterns are the Library's.

## Auth, onboarding, public pages

Out of scope for the shell (no nav bar), but the type and input rules apply:
16 px inputs, 52 px fields, the primary button docked above the keyboard on
the onboarding steps. The public `/d/<token>` share page carries no product
name (CLAUDE.md) and is not changed by this work.
