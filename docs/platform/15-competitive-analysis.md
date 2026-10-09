# 15 — Module-by-module competitive analysis

Status: written 5 Oct 2026, on `dev` after `6180ec6`. The owner's brief was "from every point of view, a proper analysis comparing what we built for each module, because I'm going to compete with all these". It also asked for item-level truth in the Shop: the same product bought from two suppliers at two costs, sold to different customers at different prices, and the margin of each.

**Corrections, 6 Oct 2026.** Before building each gap the code is checked again, and four rows of this table were wrong: cost on sale lines, UPI link/QR and the thermal print were already built, and the GST summary already exports (CSV, not the portal's JSON). The rows say so where they changed.

**How this was done.** Our side is read from the code on `dev` (models, endpoints, menu rows and screens), not from the FRDs, so "we have it" means it is built. The competitors' side is read from their own current public feature pages, linked at the end; it is what they advertise, not a hands-on test, and a later hands-on pass should confirm the rows that drive decisions.

Legend: **✓** built · **◐** partly (the note says what is missing) · **✗** not built.

## 1. Shop & billing

Compared with Vyapar (the closest Indian small-business product), Zoho Inventory/Books (the full-stack reference), and myBillBook and Khatabook (the khata-first products).

### 1.1 Selling, buying and money

| Capability | YourKhata | Vyapar | Zoho | Note |
|---|---|---|---|---|
| GST invoice, bill of supply | ✓ | ✓ | ✓ | |
| Estimates / quotations | ✓ | ✓ | ✓ | |
| Credit notes / sale returns | ✓ | ✓ | ✓ | |
| Sales orders | ✓ | ✓ | ✓ | 7 Oct: `/sales/orders` — confirm (SO/ number), convert to invoice, cancel with a reason; the whole order at once (no backorders) |
| Delivery challans | ✓ | ✓ | ✓ | 7 Oct: `/sales/challans` — type (approval, job work, branch transfer, sample), transporter, vehicle, e-way bill no.; issuing (DC/ number) takes the goods out of stock; convert to invoice without a second deduction; void brings them back. No part conversion or part returns yet |
| Purchase bills | ✓ | ✓ | ✓ | |
| Purchase orders → bill | ✓ | ✓ | ✓ | 7 Oct: `/purchases/orders` — send (PO/ number, expected date), Create bill (a draft bill with the order's lines), cancel; no goods-received notes or part receipts yet |
| Purchase returns / debit notes | ✓ | ✓ | ✓ | 7 Oct: "Return goods" on a bill → debit note (DN/ number) with lines, reason, goods-back switch; stock out at the bill's cost, khata and the bill's due both less, the rest open credit; void with a reason. No standalone notes, apply-to-another-bill or print yet |
| Payments in and out, linked to bills | ✓ | ✓ | ✓ | |
| Khata (you gave / you got), corrections that stay visible | ✓ | ◐ | ◐ | our strongest area: correct balances, reversals kept, aging |
| Payment reminders (WhatsApp by hand, logged) | ✓ | ✓ | ✓ | theirs also send automatically |
| Cashbook, expenses | ✓ | ✓ | ✓ | |
| UPI collection link / QR on invoice | ✓ | ✓ | ✓ | corrected 6 Oct: built (PAY-03 `payments/services/upi.py`, the invoice print's QR and the bill's UPI intent); this row was wrong |
| e-Invoice (IRN) and e-way bill | ✗ | ✓ | ✓ | must-have above the turnover threshold |
| Thermal / POS billing, barcode scan at counter | ◐ | ✓ | ✓ | corrected 6 Oct: 80 mm thermal print and barcode scan into a bill line are built; a dedicated POS counter screen is not |
| Online store / catalogue link | ✗ | ✓ | ✓ | |
| Tally export | ◐ | ✓ | ✓ | corrected 6 Oct: registers export as CSV laid out for an accountant importing into Tally; no Tally XML |

### 1.2 Items and stock — the owner's point

| Capability | YourKhata | Vyapar | Zoho | Note |
|---|---|---|---|---|
| Item master with one default purchase and selling price, MRP, HSN, tax | ✓ | ✓ | ✓ | |
| Stock on hand, weighted average cost, stock value, movements, adjustments, low stock | ✓ | ✓ | ✓ | the cost engine is sound: `avg_cost`, `value_after` on every movement |
| Locations | ◐ | ✓ | ✓ | the model has locations; no transfer screen |
| **Cost per supplier** (same item, two suppliers, two costs; last and average per supplier) | ✗ | ◐ | ✓ | the data exists on purchase lines; nothing shows or uses it |
| **Price per customer** (remembered last rate; price lists per customer group) | ✗ | ✓ party-wise rate | ✓ price lists | |
| **Margin per sale line** (cost of goods kept on the line) | ✓ | ✓ bill-wise profit | ✓ | the cost was already frozen on every line at issue (`unit_cost_snapshot`; this row was wrong on 5 Oct); 6 Oct: items that keep no stock are costed at their purchase price then, and each bill shows its profit (`GET /sales/invoices/{id}/profit`) |
| Item-wise P&L, party-wise P&L, bill-wise profit | ✓ | ✓ | ✓ | bill-wise profit on every bill (6 Oct); 7 Oct: `/reports/profit` by item, customer, category or bill, with the period P&L (gross profit, expenses, net) and CSV |
| Item page tabs: purchases by supplier, sales by customer | ✗ | ✓ item report by party | ✓ | ours shows pricing, stock and movements only |
| Multiple units with conversion (box = 12 pcs) | ✗ | ✓ | ✓ | |
| Batch and expiry; serial numbers | ✗ | ✓ | ✓ | must-have for pharmacy and FMCG |
| Variants / item groups, bundles | ✗ | ◐ | ✓ | |

### 1.3 Reports

| Report | YourKhata | Vyapar | Zoho |
|---|---|---|---|
| Dashboard, day book, sales and purchase registers | ✓ | ✓ | ✓ |
| GST summary | ✓ | ✓ | ✓ |
| GSTR-1 / 3B filing exports (JSON) | ✓ | ✓ | ✓ | 7 Oct: GSTR-1 and GSTR-3B JSON for the offline tool, one closed month, refused with the documents named when the portal would reject it |
| Receivables and payables aging | ✓ | ✓ | ✓ |
| Stock summary | ✓ | ✓ | ✓ |
| Profit & loss, balance sheet, cash flow | ✗ | ✓ | ✓ |
| Item-wise / party-wise / category-wise profit | ✓ | ✓ | ✓ |

### 1.4 What to build, in order

The owner's item point is the right first move. It is what makes the Shop an inventory product rather than a billing app, and it is mostly a matter of showing data we already keep correctly.

1. **Cost of goods on every sale line — done (it already existed; bill-wise profit shown 6 Oct).** When an invoice is issued, write the line's cost (the weighted average at that moment, which the stock movement already computes) onto the line, and reverse it with the line on a credit note. This one column is what every margin report stands on; computing margin later from today's average would be wrong for every past sale.
2. **Item page tabs.** Overview, Stock (by location), Purchases (by supplier: quantity, last cost, average cost, last date), Sales (by customer: quantity, last price, average price, margin), Movements.
3. **Supplier and customer memory.** An `item_supplier` row per item and supplier (last cost, last bought on, preferred), kept by purchase posting. The customer's last price for the item is offered on the next invoice.
4. **Price lists.** Per customer or customer group, as Zoho does, after the memory above, which covers the common case.
5. **Profit reports.** Bill-wise, item-wise, party-wise and category-wise profit; then P&L.
6. **Separate menus in the Shop app.** Customers and Suppliers as two lists (one parties table underneath); Sales (invoices, estimates, credit notes, later orders and challans); Purchases (bills, later orders and returns); Items & stock; Reports. This is a Shop navigation manifest in step 3 of `14`, not a change to other apps.
7. **Then the compliance and counter gaps:** e-invoice and e-way bill, GSTR exports, UPI link/QR, purchase orders and returns, units, batch/expiry, thermal POS.

## 2. Library (study library / reading room)

Compared with the reading-room products Indian exam-prep libraries use (TrackMyLibrary and similar: seats, shifts, fees and WhatsApp alerts, around ₹249 a month).

| Capability | YourKhata | Typical competitor | Note |
|---|---|---|---|
| Students, admission with plan, shift, seat, locker | ✓ | ✓ | |
| Seat map by shift, free seats, change seat | ✓ | ✓ | |
| Fee plans (monthly to yearly, admission fee, refundable security) | ✓ | ✓ | security deposit is rarer elsewhere |
| Who has to pay, fee due / overdue / unpaid states | ✓ | ✓ | |
| WhatsApp fee messages (due T-7/3/1, overdue, welcome, receipt), logged | ✓ | ✓ | theirs send automatically from a paid sender |
| Attendance (desk check-in/out) | ✓ | ✓ | |
| QR self check-in, biometric | ◐ | ◐ | 8 Oct: a printed door QR; the student scans it with their own phone, types their number and the last 4 of their mobile, and is checked in under the desk's rules. No biometric |
| Online fee payment (UPI link/QR) | ✓ | ✓ | 8 Oct: fee reminders carry the pay page link (QR + "Pay by UPI"); "Pay the fee by UPI" QR on the student page. No gateway: money goes straight to the library's UPI ID |
| Book counter (catalogue, issue/return, fines, holds, stock-take) | ✓ | ✗ | an advantage for libraries that lend books |
| Home dashboard (occupancy, collections, dues) | ✓ | ✓ | |
| Library expenses and profit (rent, electricity, salaries) | ✓ | ◐ | 9 Oct: Expenses in the Library menu; "Income & expenses" shows fees collected, expenses by category and what is left, this month / last month / this year |
| Enquiries / leads and seat waitlist | ✗ | ◐ | |
| Student app / portal | ✗ | ◐ | |
| Multi-branch | ◐ | ◐ | separate businesses today; no combined view |

**Where we win:** the book counter and an honest fee ledger, in Hindi, at the same price. **Next:** UPI fee collection, QR check-in, library expenses with a profit view, and enquiries and a waitlist.

## 3. Lending & collections (daily / weekly / monthly lenders)

Compared with daily-collection and small-lender software (Intelligrow's daily-loan and collection products, LendStack for MFIs and cooperatives).

| Capability | YourKhata | Competitors | Note |
|---|---|---|---|
| Plans: fixed daily, flat, reducing, interest-only, flexible | ✓ | ✓ | |
| True cost shown before lending (effective yearly rate) | ✓ | ◐ | ours is unusually honest; a regulator-friendly point |
| Deductions at disbursal (file charge, upfront interest) | ✓ | ✓ | |
| Collect any amount, oldest first; lump sums after a gap | ✓ | ✓ | |
| Visits: not paid, not at home, promised date | ✓ | ◐ | |
| Routes and today's round in route order | ✓ | ✓ | |
| Reminders with legal guardrails (08:00–19:00, one a day, polite fixed text) | ✓ | ◐ | a real differentiator under fair-practice rules |
| Receipt print, statement, closure letter, loan agreement | ◐ | ✓ | 8 Oct: receipt (per collection, VOID mark), loan statement (terms, every instalment, payments) and no-dues closure letter for a paid-off loan, printed from the loan page under the lender's letterhead; no loan agreement yet |
| Late fees / penal interest, waivers | ✓ | ✓ | 8 Oct: late-fee rule agreed in the terms (fixed once, per day capped, % a year capped, grace days), suggested per late instalment and added by the owner, never automatic; waivers of late fee, interest or principal with a reason, owner or admin only |
| Write-off, cancel, foreclosure | ◐ | ✓ | 8 Oct: write-off (owner, pinned figure, reason, history kept, reminders stop) and cancel (nothing collected: the books are undone); early closure with a payoff sheet not yet |
| Agent role scoped to their routes; agent app; offline | ✗ | ✓ | the module role exists in the platform; not yet used by lending |
| KYC documents and photos, geo-tagged visits | ✗ | ✓ | |
| Guarantor | ✗ | ◐ | FRD has it |
| UPI / e-NACH collection | ◐ | ✓ | 8 Oct: UPI pay link in every instalment reminder and a "UPI QR" on the loan page; no e-NACH auto-debit |
| Portfolio reports: outstanding, aging / overdue buckets, collection efficiency, agent performance | ✗ | ✓ | |
| Lender's cash book and interest income | ✗ | ✓ | |

**Where we win:** a correct money model (every rupee on the borrower's ledger), the cost-before-you-lend view and the reminder guardrails. **Next:** documents, late fees and waivers, write-off and closure, the agent role with route scoping, and portfolio reports.

## 4. Gym & fitness (planned)

Compared with Indian gym software (Easy Gym Software, OkFit, MyGymDesk). Our FRD is `docs/platform/frd/gym.md`; nothing is built, which is the right order.

The table stakes are plans with freeze and renewals; attendance by QR or biometric; GST invoices with UPI and recurring billing; renewal, birthday and missed-visit WhatsApp messages; personal-training sessions; leads and enquiries; and a multi-branch dashboard.

What we already have that they must build: the dues engine (renewals and part payments), the attendance engine, the WhatsApp-like-reminders seam, apps per person (a trainer's grant to the Gym app only) and one account across a gym and a shop.

## 5. Hotel & stays (planned)

Compared with small-hotel PMS (myHotelLine, Stayflexi, eZee). Our FRD is `docs/platform/frd/hospitality.md`.

The table stakes are a front desk with a room chart, reservations, a channel manager for OTAs, a booking engine, GST folios, housekeeping status, a restaurant POS and guest messaging. A channel manager is the expensive part: it is an integration business, so the realistic entry is homestays and small lodges with a direct-booking link first, and OTA sync through a partner later.

## 6. Across every module

| Concern | Us | The market | Our position |
|---|---|---|---|
| One account, many businesses, a role per app | ✓ (steps 1–2 of `14`) | rare; Vyapar has multi-firm | a real edge: the owner who works at one business and owns another |
| Hindi throughout | ✓ | ◐ | an edge in tier-2/3 |
| Messages | by hand from the owner's WhatsApp, free, logged | automatic, paid credits | add an optional paid sender later, behind the same policy |
| Online payments (UPI link/QR, gateway) | ◐ | ✓ everywhere | 8 Oct: built once — a signed pay page (/pay/…) with the QR and a UPI button, linked from every payment WhatsApp in every app; no gateway or auto-reconciliation |
| Offline / mobile app | web, works on a phone | native apps, offline | PWA offline for the counter and the round |
| Price | — | ₹249–₹1,000+ a month per app | bundle apps per business; owner pays, staff free (§6.1 of `14`) |

## 6.1 Insights (owner, 5 Oct 2026: "and what about the insight section, like graphs?")

The design system already has the chart primitives (`UbTrendArea`, `UbAgingBars`, `ChartBarRow`, `UbStatCard`), but no screen uses them except the aging bars. The Shop dashboard is tiles and lists. Vyapar's dashboard and Zoho's 75+ reports lead with charts. Each app gets its own Insights section in its own menu:

- **Shop:** sales vs purchases over time; cash in vs out; receivables and payables; top items and customers; margin by item, category and customer; stock value and slow movers.
- **Library:** seat occupancy by shift; fees collected vs due; renewals vs drop-outs; attendance trend.
- **Lending:** disbursed vs collected; collection efficiency by day, route and agent; overdue buckets; interest earned.

The Shop's sales, cash and dues charts come right after cost of goods on sale lines; margin charts need that column, or they would be wrong for every past sale.

## 7. The recommendation

Finish the platform-shell refactor (steps 3–7 of `14`): it is what lets each app grow its own menus, words and reports without touching the others. Then build in this order, each one a step with QA:

1. Shop item truth: cost on sale lines, item tabs, supplier and customer memory, then profit reports and the Shop's Insights (§6.1).
2. UPI collection (link and QR on every invoice, fee and instalment), once in the platform.
3. Lending documents, late fees and waivers, write-off, agent scoping.
4. Library UPI fees, QR check-in, expenses and profit.
5. Shop compliance: e-invoice, e-way bill, GSTR exports; then orders, returns, units, batches.

## Sources

- Vyapar — complete feature list: https://vyaparapp.in/blog/vyapar-app-complete-feature-list-all-about-your-favorite-billing-software/
- Zoho Inventory — features (PDF): https://zoho.com/inventory/features/ebook/zoho-inventory-features.pdf
- myBillBook — features page: https://freetrial.mybillbook.in/best-billing-software-v3.html
- Khatabook — Capterra profile: https://www.capterra.com/p/197475/KhataBook/
- TrackMyLibrary — product and pricing: https://trustmrr.com/startup/trackmylibrary-smart-library-management-for-competitive-exam-libraries
- Intelligrow — loan collection software: https://intelligrow.co/loan-collection-software/ and daily loan software: https://intelligrow.co/?p=10992
- LendStack — profile: https://www.softwaresuggest.com/lendstack
- Easy Gym Software — gym management features: https://easygymsoftware.com/gym-management-software
- myHotelLine — hotel PMS features: https://www.myhotelline.com/property-management-system-pms-for-hotels-in-lucknow-uttar-pradesh
