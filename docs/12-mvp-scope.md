# Part 12 — MVP Scope

## 12.1 What "MVP" means in this specification

The MVP is not a demo, a pilot or a feature-reduced preview. It is defined as **the smallest product with which a real Indian small business can stop using paper for its udhaar, its bill book and its stock register on the same day, and never need to go back to them**. That definition sets the bar much higher than the word "minimum" usually implies, and it is deliberate: the research is unambiguous that a merchant who has to keep the notebook alongside the app keeps the notebook and abandons the app. A half-migrated ledger is worse than no ledger.

Three consequences follow, and they govern every decision in this part.

**Parity comes before novelty.** Everything on the Common list of Part 11 §11.1 is in the MVP. There is no version of this product that ships without a party statement, without a reminder, or without a GST-compliant invoice, because each of those absences is individually disqualifying in the first session.

**Depth is where MVP cuts, not breadth.** The MVP covers every module a target business touches daily — ledger, parties, sales, purchases, inventory, payments, expenses, reports — but at one location, one price per item, four roles, two document templates and weighted-average costing. Part 11 §11.4 lists these reductions and each one has a growth path. Cutting a whole module would leave a merchant reconciling by hand; cutting depth inside a module leaves them working.

**Config-gated features ship complete.** `LED-07` and `LED-08` carry the `M*` marker of Part 10 §10.3. Their code, templates, opt-in flags, message-log rows, tests and Hindi copy are all in the MVP; only the DLT-registered provider is absent, and with the `ConsoleSmsBackend` of ADR-015 they behave correctly by logging a `skipped` message. They are not deferred and must not be cut.

The MVP contains **74 features** across twelve module prefixes. (Part 16 §16.15 states 67; the row-by-row count of Part 16 is 74 MVP, 37 Phase 2, 19 Phase 3 and 1 Future. The summary table is a documentation defect and is logged as an open question in Part 18 §18.15; the per-row phase markers are authoritative.)

## 12.2 The complete MVP feature list

| ID | Module | Name | MVP scope in one line |
|---|---|---|---|
| PLT-01 | Platform | Mobile OTP sign-up & login | 10-digit Indian mobile + 6-digit OTP, throttled, device session created; console SMS backend at MVP |
| PLT-02 | Platform | Password login & set/reset | Optional password for staff and desktop use; set via invite link, reset via OTP |
| PLT-03 | Platform | Business onboarding wizard | Create tenant: name, business type, GST type + GSTIN, address/state, language; seeds defaults per business type |
| PLT-04 | Platform | Multiple businesses & switch | One user owns or joins several tenants; switching re-issues the token with a new `tid` |
| PLT-05 | Platform | Team & roles | Invite by mobile; assign owner/admin/staff/accountant; suspend and remove; forced logout on role change |
| PLT-06 | Platform | Tenant settings | Numbering series, due days, units, tax defaults, reminder templates, locale, per-module toggles |
| PLT-07 | Platform | Business profile & document header | Legal and trade name, GSTIN, PAN, address, contact, bank details, UPI VPA, signature image, terms |
| PLT-08 | Platform | Audit log viewer | Filterable who-did-what-when with before/after for critical entities |
| PLT-09 | Platform | Session & device management | List active sessions, revoke individually or all; revocation on role change |
| PLT-10 | Platform | Account deletion & data export | Owner exports the full tenant as a CSV bundle; deletion request with cool-off, per DPDP |
| PLT-14 | Platform | Super-admin console | Metis ops: partner and tenant list, entitlement overrides, consented impersonation, health |
| PLT-15 | Platform | Plan entitlements | Plan → module and limit map (users, parties, invoices/month) with enforcement hooks; billing itself is Phase 3 |
| WLB-01 | White-label | Tenant branding | Logo, primary/secondary colours, document header and footer, app display name, applied via runtime CSS variables |
| WLB-02 | White-label | Partner configuration | Partner record with default branding, allowed modules, support contact and legal footer; tenants inherit |
| PTY-01 | Parties | Create/edit party | Name, mobile unique per tenant, customer/supplier flags, validated GSTIN, addresses, state, notes, opening balance, collection date, credit limit |
| PTY-02 | Parties | Party list with totals | Search, filters (owes me / I owe / settled / archived / customers / suppliers / tags), sort, header totals |
| PTY-03 | Parties | Party detail (khata page) | Balance header, quick actions (You gave / You got / Bill / Remind / Share), unified timeline of entries and documents |
| PTY-04 | Parties | Archive / restore party | Soft archive, blocked while balance ≠ 0 unless a write-off is posted |
| PTY-05 | Parties | Tags & groups | Free tags for area, route and category; filter by tag |
| PTY-06 | Parties | Credit limit & alerts | Optional per-party limit with tenant-level mode `off` / `warn` / `block` and an audited override |
| PTY-10 | Parties | Import parties (CSV) | Template with opening balances, row-level validation, preview, commit |
| LED-01 | Ledger | Record "You gave" / "You got" | Amount, date, note, optional photo, payment mode for credits; immutable entry, atomic balance update |
| LED-02 | Ledger | Opening balance | First entry of type `opening` in either direction |
| LED-03 | Ledger | Correct or reverse an entry | Correction = reversal + replacement with `supersedes_id`; reason required; statement toggle |
| LED-04 | Ledger | Party statement with running balance | Date range, corrections toggle, document links, branded print view, WhatsApp or link share |
| LED-05 | Ledger | Collection date & reminder buckets | Per-party collection date driving Due today / Overdue / Upcoming buckets |
| LED-06 | Ledger | Manual reminder | One tap to `wa.me` with a templated message including balance, shop name and UPI link; SMS and call; bulk select |
| LED-07 | Ledger | Automated reminders (SMS) | D-1 and D0 scheduled sends when a provider is configured; per-party opt-out — **config-gated** |
| LED-08 | Ledger | Transaction SMS to party | Message on every entry with the new balance when a provider is configured and the party opted in — **config-gated** |
| LED-09 | Ledger | Ledger summary & aging | Receivable and payable totals; 0–30 / 31–60 / 61–90 / 90+ buckets per party and overall |
| LED-10 | Ledger | Ledger ↔ documents integration | Invoices, purchase bills, payments, credit notes and party-linked expenses post ledger entries with a link back to source |
| LED-11 | Ledger | Write-off / settle small balance | `write_off` entry with reason to zero a balance |
| INV-01 | Inventory | Create/edit item | Goods or service, SKU, barcode, category, unit, HSN/SAC, tax rate, purchase and selling price, MRP, track-stock flag, reorder point, image |
| INV-02 | Inventory | Item list & search | Search by name, SKU or typed barcode; filters by category, low stock, archived and type; stock badge tones |
| INV-03 | Inventory | Item detail & movement history | Prices, on-hand, valuation, movement ledger with document links |
| INV-04 | Inventory | Categories & units masters | Per-tenant lists with GST UQC mapping; inline create from the item form |
| INV-05 | Inventory | Opening stock | `opening` movement with unit cost |
| INV-06 | Inventory | Stock adjustment | ± quantity with a reason from a fixed list and an optional cost; negative stock blocked unless a setting allows |
| INV-07 | Inventory | Low-stock alerts | Dashboard bucket and one in-app notification per reorder-point crossing |
| INV-08 | Inventory | Stock summary & valuation | On-hand × weighted-average cost by item and category |
| INV-09 | Inventory | Import items (CSV) | Template with opening stock; validate, preview, commit |
| SAL-01 | Sales | Estimate / quotation | Non-tax kachha bill; convert to invoice; share |
| SAL-02 | Sales | Tax invoice / bill of supply | Rule 46-compliant lines, CGST/SGST or IGST by slab, document discount, round-off, party or walk-in, due date, immediate payment or credit, FY series, atomic stock deduction |
| SAL-03 | Sales | Invoice PDF, print & share | A4 and 80 mm thermal templates with branding and UPI QR; WhatsApp share; public link |
| SAL-04 | Sales | Credit note / sales return | Against an invoice or standalone; optional restock; posts a ledger credit; refund or hold as advance |
| SAL-05 | Sales | Void / cancel invoice | Reason-captured void reversing stock and ledger; number retained |
| SAL-06 | Sales | Draft autosave & duplicate | Drafts persist across sessions; any document can be duplicated |
| SAL-07 | Sales | Walk-in / cash sale | No party; full payment required; optional mobile for the receipt message |
| SAL-08 | Sales | Sales list & filters | Status tabs, date range, party, amount, with totals reflecting the filter |
| PUR-01 | Purchases | Purchase bill entry | Supplier, supplier bill number and date, lines with cost and tax; posts stock in at cost with weighted-average update and a supplier ledger credit |
| PUR-02 | Purchases | Supplier payment | Payment out with mode and reference; allocation to bills; posts a ledger debit |
| PUR-03 | Purchases | Purchase list & filters | Status tabs, supplier, date range, payables totals |
| PUR-04 | Purchases | Void purchase bill | Reason-captured void reversing stock and ledger |
| PAY-01 | Payments | Record payment in / out | Party, amount, date, mode, reference, note; ledger entry; FIFO or manual allocation to open documents |
| PAY-02 | Payments | Multi-mode split payment | One receipt split across modes, e.g. ₹700 UPI + ₹300 cash |
| PAY-03 | Payments | UPI static QR & intent link | QR from the tenant VPA on invoices and statements; dynamic intent link with amount and reference |
| PAY-04 | Payments | Payment receipt print / share | Branded receipt document |
| PAY-05 | Payments | Void payment | Reason-captured void reversing ledger entries and allocations |
| EXP-01 | Expenses | Record expense | Category, amount, date, mode, optional party, optional GST fields, receipt photo |
| EXP-02 | Expenses | Expense categories | Per-tenant list with sensible defaults seeded |
| EXP-03 | Expenses | Cashbook view | Day-wise cash and bank in and out from payments and expenses with opening and closing balances |
| RPT-01 | Reports | Dashboard | To collect, to pay, due today, overdue, today's sales, cash in hand, low stock; recent activity; top debtors |
| RPT-02 | Reports | Day book | Every entry for a day or range across sales, purchases, payments and expenses |
| RPT-03 | Reports | Sales register | Invoice-wise with tax breakup; CSV and Excel |
| RPT-04 | Reports | Purchase register | Bill-wise with tax; CSV and Excel |
| RPT-05 | Reports | Receivables / payables aging | Party-wise buckets with drill-through |
| RPT-06 | Reports | Stock summary & low stock | On-hand, value and items below reorder point |
| RPT-07 | Reports | GST summary | Outward and inward by slab, HSN summary, document series summary — a GSTR-1/3B preparation aid |
| RPT-08 | Reports | Export (CSV / Excel) | Every report and list, with the current filters applied; background job with download link for large ranges |
| NTF-01 | Notifications | In-app notification inbox | Bell with unread count; reminder due, low stock, payment received, member joined, import done |
| NTF-02 | Notifications | Messaging provider adapters | SMS adapter interface with a console backend, template registry with DLT IDs, message log |
| NTF-03 | Notifications | WhatsApp deep-link share | Prefilled `wa.me` text for statements, invoices and reminders, with a public link for the document |
| IMP-01 | Import/Export | CSV import framework | Upload → validate with row errors → preview → commit as a background job; templates for parties and items |
| IMP-02 | Import/Export | Bulk export | Any list to CSV or Excel with the current filters |

Twelve of the fourteen module prefixes appear. `HLP` (in-app help) is entirely Phase 2 and `LON` (loans) entirely Phase 3; both are absent from the MVP by design.

## 12.3 The MVP user journey, end to end

This is the spine that the feature list above must support without a gap. It is written as one continuous path because that is how a merchant experiences it; Part 15 breaks the same ground into twelve separate journeys with failure modes and emotional beats.

A merchant installs the web app or opens a partner-branded link. The first screen is a language choice, then a mobile number, then a six-digit OTP (`PLT-01`). The onboarding wizard asks four things — business name, business type, GST status with GSTIN if registered, and state — and nothing else (`PLT-03`). Choosing "Kirana / retail" turns inventory on and sets a NOS default unit; choosing "Services" turns stock tracking off and defaults documents to services with SAC codes. Within ninety seconds the merchant is on a dashboard with zero in every tile and a single obvious next action.

They add their first party — a name, a mobile number, and the balance from the notebook typed into the opening-balance field (`PTY-01`, `LED-02`). If they have thirty or three hundred of these, they download the CSV template, fill it in or have a partner field agent fill it in, upload it, see which rows failed validation and why, fix those, and commit (`PTY-10`, `IMP-01`). The party list now shows "You will get ₹2,14,300 / You will give ₹48,000" (`PTY-02`).

The daily loop begins. A customer takes goods on credit: open the party, tap **You gave**, type the amount, save; the balance updates and, if a provider is configured, the customer's phone shows an SMS with the new balance (`LED-01`, `LED-08`). A customer pays: tap **You got**, choose the mode, save (`LED-01`). At month end, the merchant opens the party's statement for the last thirty days, checks the running balance against what the customer says, and shares it on WhatsApp (`LED-04`, `NTF-03`).

Collection becomes systematic. Each credit party gets a collection date (`LED-05`). The dashboard shows Due today, Overdue and Upcoming buckets (`RPT-01`). The merchant multi-selects eight overdue parties and sends reminders (`LED-06`); each opens a prefilled WhatsApp message with the balance, the shop name and a UPI link. Where a provider is configured, D-1 and D0 messages go out without anyone acting (`LED-07`). Money arriving by UPI is recorded with its UTR, allocated against open invoices, and the balance closes (`PAY-01`, `PAY-03`).

The formal side follows. The merchant adds items — either one at a time with a price and a tax rate, or by importing a spreadsheet with opening stock (`INV-01`, `INV-09`, `INV-05`). They raise an estimate for a customer who wants a price first (`SAL-01`), convert it to a tax invoice when the order is confirmed, add lines by searching an item, see CGST and SGST computed by slab, choose "on credit" with a due date, and issue it (`SAL-02`). Stock drops, the ledger takes a debit against the party, the invoice appears in the sales list as unpaid, and the merchant shares the PDF with its UPI QR on WhatsApp (`SAL-03`). A walk-in customer paying cash gets the same document without a party attached (`SAL-07`).

Supply comes in. A supplier's bill is entered with its own number and date; stock goes up at cost, the weighted average moves, and the supplier's ledger shows what is owed (`PUR-01`). The merchant pays part of it by bank transfer and allocates it to two bills (`PUR-02`). Rent and electricity go into expenses with a photographed receipt (`EXP-01`), and the cashbook shows the day's cash position (`EXP-03`).

Control arrives with scale. A shop assistant is invited by mobile number and given the staff role; they can bill and record payments but cannot void an invoice, correct a ledger entry or see the financial reports (`PLT-05`). Every action they take is attributed and auditable (`PLT-08`). A stock count at the end of the month finds two damaged units; the merchant posts an adjustment with the reason "damage" (`INV-06`). A wrong entry from last week is corrected, leaving a reversal, a replacement and a reason in the statement (`LED-03`).

Finally, the month closes. The accountant is invited with the accountant role — read everything, export everything, write nothing. They open the sales register, the purchase register and the GST summary, check the HSN and series summaries, export to Excel, and file (`RPT-03`, `RPT-04`, `RPT-07`, `RPT-08`). Nothing in this loop requires the merchant to open a second app or to touch the notebook.

## 12.4 Explicitly excluded from the MVP

Exclusion is only meaningful when the destination is named. Everything below is out of the MVP and in a specific phase; the Avoid list of Part 11 §11.3 covers what is in no phase at all.

| Excluded from MVP | Phase | Why it can wait |
|---|---|---|
| Barcode scanning by camera (`INV-10`) | 2 | Typed and pasted barcodes work in `INV-02` search at MVP; the scanner is a speed improvement for a retail counter, not an enabler |
| Multi-location stock and transfers (`INV-11`) | 2 | One default location covers single-shop businesses; the `location_id` column and one seeded row already exist so nothing migrates |
| Item variants (`INV-12`) | 2 | Garment and footwear sellers can model size and colour as separate items at MVP; painful but workable, and variants touch every document line |
| Price lists (`INV-13`) | 2 | Line-level price override covers wholesale pricing manually |
| Secondary units, barcode labels (`INV-14`, `INV-15`) | 2 | Single unit per item plus a conversion done by the merchant is the current paper behaviour |
| Purchase orders, goods receipt, debit notes, landed cost (`PUR-05`–`PUR-08`) | 2 | The purchase bill covers the money and the stock; POs are a workflow layer that only staffed wholesalers need |
| Delivery challan, recurring invoices, customer-facing invoice page (`SAL-09`, `SAL-10`, `SAL-14`) | 2 | Challans matter to distributors, recurring billing to services; both are additive to `SAL-02` rather than structural |
| Payment aggregator and unmatched-payments queue (`PAY-06`, `PAY-07`) | 2 | Requires a PA contract and KYC that cannot be completed before launch; the manual UTR path in `PAY-01` is the honest MVP answer |
| Automated WhatsApp templates, web push, email (`LED-12`, `NTF-04`, `NTF-05`, `NTF-06`) | 2 | Requires Meta business verification and template approval; `wa.me` deep links deliver the same message at zero cost with a human tap |
| Recurring reminders and schedules (`LED-13`) | 2 | D-1/D0 on a collection date is the proven default; cadence rules are for route-based wholesale |
| Party self-view link, contacts import, party merge (`PTY-07`, `PTY-08`, `PTY-09`) | 2 | The statement share link covers the customer's need to see their khata; merge needs the audit machinery to be proven first |
| App lock / PIN (`PLT-11`) | 2 | The device's own lock covers it until the PWA install path is the primary one |
| Recurring expenses (`EXP-04`) | 2 | Monthly rent typed twelve times is tolerable; a scheduler for it is not |
| Item movement analysis, profit summary, staff performance, GSTR-1 JSON (`RPT-09`–`RPT-12`) | 2 | All are derived from MVP data with no new capture; none blocks a month-end close |
| Excel templates and bulk edit (`IMP-03`) | 2 | CSV import covers migration; bulk edit is an efficiency feature |
| In-app help centre, tours, what's new (`HLP-01`–`HLP-03`) | 2 | MVP ships contextual `UbHelpHint` tooltips and partner-assisted onboarding instead of a content system |
| Custom roles, API keys and webhooks, subscription billing (`PLT-12`, `PLT-13`, `PLT-16`) | 3 | Four system roles cover the observed shapes; billing at MVP is partner-invoiced or manual |
| Interest and late fees, collection routes (`LED-14`, `LED-15`) | 3 | Both are wholesale-specific and interest accrual has tax consequences that need a compliance owner |
| Batches and expiry, stock take sessions, serial numbers (`INV-16`–`INV-18`) | 3 | Pharma and FMCG verticals are not the launch segment; `INV-06` covers count corrections |
| Sales orders, e-invoice (IRN), e-way bill (`SAL-11`–`SAL-13`) | 3 | e-invoicing applies above a ₹5 Cr turnover threshold that the launch segment is below; it needs a GSP contract |
| Bank statement import, cheque tracking (`PAY-08`, `PAY-09`) | 3 | Manual entry with a reference covers both at the launch scale |
| Tally XML export, scheduled reports (`RPT-13`, `RPT-14`) | 3 | CSV and Excel are what accountants actually take today |
| Migration from competitor exports (`IMP-04`) | 3 | Generic CSV import plus a documented mapping covers it manually |
| Loans module (`LON-01`–`LON-03`) | 3 | An optional vertical module, not part of the core promise |
| Composite items / BOM (`INV-19`) | Future | See Part 11 §11.3 item 6 |

## 12.5 MVP success criteria

The MVP is judged on four kinds of number: whether merchants complete the migration, whether they keep using it, whether it is correct, and whether it is fast enough on the phones they own. Feature counts are not a success criterion.

**Adoption and activation.** Measured on the first hundred merchants onboarded, whether directly or through a launch partner.

| Metric | Target | How it is measured |
|---|---|---|
| Sign-up to first party created | ≤ 5 minutes, median | `ub.platform.signup_completed` → `ub.parties.party_created` |
| Merchants who reach 10 parties with balances within 7 days | ≥ 70 % | Cohort query on `parties_party` count with non-zero opening balance |
| Merchants who complete a CSV import when they have > 25 parties | ≥ 50 % | `ub.imports.commit_succeeded` over eligible cohort |
| Merchants posting a ledger entry on day 7 | ≥ 60 % | Daily-active by tenant |
| Merchants posting a ledger entry on day 30 | ≥ 40 % | Same; this is the single most important retention number |
| Merchants issuing at least one tax invoice or bill of supply in 30 days | ≥ 35 % of GST-registered tenants | `sales_document` count by tenant `gst_type` |
| Merchants who invite a second member in 30 days | ≥ 20 % | `platform_membership` count > 1 |
| Businesses that stop maintaining the paper khata (self-reported at day 45) | ≥ 50 % | Structured interview during the pilot; the only qualitative criterion, and the one the definition in §12.1 rests on |

**Correctness.** These are pass/fail, not targets. A single failure blocks launch.

- Zero balance drift: the nightly `recalc_balances` job finds no difference between `parties_party.balance` and the sum over `ledger_entry` for any tenant, on a dataset of at least 100,000 entries including backdated, reversed, corrected and voided rows.
- Zero stock drift: on-hand from `inventory_item_stock` equals the sum of `inventory_stock_movement` for every item and location.
- GST arithmetic verified against a hand-computed fixture set covering every slab, intra-state and inter-state, composition, unregistered, line discount, document discount, round-off and reverse charge — including at least one document dated before 22 September 2025 to prove rate history works.
- Invoice numbering: no gaps, no duplicates, no series longer than sixteen characters, correct reset at the financial-year boundary, verified under concurrent issue by two users.
- Tenant isolation: an automated test issues every read and write endpoint with an ID belonging to another tenant and asserts 404, never 403 and never data.
- Idempotency: every document and payment POST replayed with the same key returns the same body and creates one row.

**Performance, measured on the target device.** The device target is a 2 GB RAM Android phone on a 3G-equivalent connection, in Chrome, at 360 px width.

| Budget | Target |
|---|---|
| `POST /ledger-entries` server time, P95 | ≤ 250 ms |
| Party page open to ledger drawer visible | ≤ 100 ms |
| Party page first contentful paint on 3G | ≤ 2.5 s |
| Invoice issue (number, stock, ledger, payment) server time, P95 | ≤ 600 ms |
| Party list with 2,000 parties, first page | ≤ 1.5 s |
| Statement with 5,000 entries, first page | ≤ 1.5 s |
| Dashboard load, P95 | ≤ 1.2 s |
| Crash-free sessions | ≥ 99.5 % |
| Uncaught client errors per 1,000 sessions | ≤ 5 |

**Quality gates.** Backend line coverage ≥ 80 % overall and ≥ 95 % on service-layer modules that write money or stock; every MVP feature has its `T-` tests from FRD §21 implemented and passing; every MVP feature has `en` and `hi` copy keys with no missing-key warnings in either locale; axe-core reports zero critical violations on every MVP screen; permission tests exist for all four roles on every write endpoint.

## 12.6 The day-one demo script

Eight minutes, one phone, one laptop, no slides, no pre-seeded data except the demo tenant's items. This is the sequence that must work flawlessly on launch day, because it is simultaneously the sales demo, the partner training script and the smoke test. Every step names the features it exercises.

| Time | Step | What is shown | Features |
|---|---|---|---|
| 0:00–0:45 | Sign up on the phone as "Sharma General Store", Hindi interface, kirana business type, unregistered GST | The whole onboarding is four questions; the interface is in Hindi from the first screen | `PLT-01`, `PLT-03` |
| 0:45–1:30 | Add Ramesh Traders with a mobile number and an opening balance of ₹2,300 | Typing yesterday's notebook balance is one field, not a migration project | `PTY-01`, `LED-02` |
| 1:30–2:15 | Tap **You gave** ₹500, note "Sugar 10 kg", save. Balance shows ₹2,800 in red with "You will get" | The eight-second entry; colour and words together; the timeline row with attribution | `LED-01`, `PTY-03` |
| 2:15–2:45 | Tap **You got** ₹300, mode UPI, reference typed, save. Balance ₹2,500 | The mode toggle, the reference field appearing only for non-cash | `LED-01`, `PAY-01` |
| 2:45–3:30 | Open the statement for this month, toggle corrections off, tap Share → WhatsApp | A real WhatsApp compose window opens with the running balance and a link | `LED-04`, `NTF-03` |
| 3:30–4:00 | Set a collection date of Friday; show the dashboard's Due today / Overdue buckets; multi-select three parties and send reminders | Collection becomes a list, not a memory exercise | `LED-05`, `LED-06`, `RPT-01` |
| 4:00–5:15 | Switch to the laptop. Create a tax invoice for Ramesh Traders: search two items, quantities, watch CGST and SGST compute, choose credit with 15 days, issue | The GST half of the product on a real keyboard; stock drops and the ledger moves in the same action | `SAL-02`, `INV-02`, `LED-10` |
| 5:15–5:45 | Print preview the A4 invoice with the logo and the UPI QR; switch to the 80 mm thermal template | Two templates, tenant branding, a scannable QR | `SAL-03`, `WLB-01`, `PAY-03` |
| 5:45–6:30 | Enter a supplier bill for 20 units at ₹42; show the item's on-hand rise and the average cost change; show the supplier now owed | Purchases feed stock and the supplier ledger in one entry | `PUR-01`, `INV-03` |
| 6:30–7:00 | Post a stock adjustment of −2 with reason "damage"; show the movement history with the reason and the person | Reason capture instead of an approval chain | `INV-06`, `PLT-08` |
| 7:00–7:30 | Correct the ₹500 entry to ₹450 with reason "counted wrong"; show the reversal, the replacement and the reason in the statement | Nothing is ever deleted; the audit is visible to the merchant, not hidden in a log | `LED-03` |
| 7:30–8:00 | Open the GST summary and the receivables aging; export the sales register to Excel and open the file | The accountant's hand-off in two clicks | `RPT-07`, `RPT-05`, `RPT-03`, `RPT-08` |

Rules for the demo: it runs on the real production build against a real tenant, never a mock; it runs once end to end on every release candidate as a manual smoke test; if any step needs an apology, that step is a launch blocker. The demo deliberately shows a correction and an adjustment, because the trust differentiator of Part 11 §11.2 is invisible unless a mistake is made on purpose.

## 12.7 The cut-line policy

If the build runs late, scope is cut in a fixed order that is agreed now, while nobody is under pressure. The purpose is to make the decision mechanical rather than political at the moment it is needed.

**Never cut, under any circumstance.** These are the product. Cutting any of them produces something that is not the MVP defined in §12.1 and should be given a different name and a different launch date.

`PLT-01`, `PLT-03`, `PLT-05`, `PLT-06` · `PTY-01`, `PTY-02`, `PTY-03` · `LED-01`, `LED-02`, `LED-03`, `LED-04`, `LED-09`, `LED-10` · `SAL-02`, `SAL-03` · `PAY-01` · `INV-01`, `INV-02` · `RPT-01` · `NTF-03` · `IMP-01` · the tenant-isolation, immutability, `Decimal` money, atomic-transaction, audit-row and idempotency rules of canon §0.11, which are not features and are not negotiable · `en` and `hi` copy for everything that ships.

**Cut in this order, first to last.** Each line states what is lost and what the merchant does instead.

1. **`PLT-14` super-admin console.** Metis ops runs on Django admin plus SQL for the first cohort. Loses convenience, loses nothing for the merchant. Restore in the first patch release.
2. **`IMP-02` bulk export from lists.** `RPT-08` already exports every report; list-level export with filters is a duplicate path. Loses a convenience the accountant has another route to.
3. **`PLT-09` session and device management.** Logout-everywhere on password change covers the security need; the session list is visibility, not control. Note that forced logout on role change is part of `PLT-05` and is not cut.
4. **`EXP-03` cashbook view.** Expenses are still recorded (`EXP-01`) and appear in the day book (`RPT-02`); the merchant loses the opening/closing cash presentation and computes it from the day book.
5. **`RPT-04` purchase register.** The purchase list (`PUR-03`) with export covers the accountant's need less comfortably. Do not cut `RPT-03`, which is the GST-critical one.
6. **`SAL-01` estimates.** Merchants quote on WhatsApp today; they can issue a draft invoice and share it instead. This one hurts wholesalers, so it is cut only if the alternative is delaying launch by more than two weeks.
7. **`PTY-05` tags.** Grouping by area and route is lost; the search field carries the load. Cheap to restore.
8. **`INV-09` item CSV import.** Items are added manually or by a partner field agent. Do not cut `PTY-10`, the party import, which is the migration path and therefore adoption-critical.
9. **`PLT-10` export and deletion.** This is a DPDP obligation, not a feature, and cutting it is only permissible if the launch date precedes the obligation's commencement and a manual, documented, SLA-backed process exists in its place, recorded in Part 39. It is on this list solely so nobody cuts it silently.
10. **`INV-06` stock adjustment.** The last resort before the never-cut list. Losing it means stock can only be corrected through documents, which breaks the count-and-adjust cycle. Cutting this means the inventory module is not really shipped; prefer to launch inventory-disabled for the first cohort over shipping it without adjustment.

**Rules that govern the cutting.** A cut is a Class C change and is recorded in Part 39 with the date, the reason and the release it returns in. Nothing is cut by leaving it half-built: a cut feature is removed from the navigation, its endpoints are absent rather than returning 501, and its catalogue row is marked "deferred to <release>". Cutting depth inside a kept feature is preferred to cutting a feature, but only where the FRD names a reduction that does not break an acceptance criterion. A cut that removes an `en`/`hi` key, a permission check, an audit row or a test is not a cut — it is a defect, and canon §0.11 rule 6 forbids it.

## 12.8 Launch-readiness checklist

The MVP is ready when every line below is true. This is the gate, not a wish list; Part 35's definition of done is its per-feature equivalent.

**Product completeness**
- [ ] All 74 MVP features present, or any absentee formally cut per §12.7 with a Part 39 entry
- [ ] Every MVP feature's FRD acceptance criteria demonstrated on the release candidate
- [ ] The eight-minute demo script of §12.6 executed end to end without apology on the production build
- [ ] Every screen has its three empty states (first-use, filtered-empty, error) and its loading and error states
- [ ] `en` and `hi` complete with no missing-key warnings; Indian number grouping and dd/mm/yyyy dates verified in both

**Correctness and data**
- [ ] Balance-drift and stock-drift jobs clean on the seeded 100,000-row dataset
- [ ] GST fixture suite green, including a pre-22-September-2025 document
- [ ] Invoice numbering verified under concurrency, including the FY rollover
- [ ] Cross-tenant probe suite green on every endpoint (404 everywhere)
- [ ] Idempotency replay suite green on every document and payment POST
- [ ] Migrations run forward cleanly on a copy of the pilot data; a documented rollback exists for each

**Performance and devices**
- [ ] All budgets in §12.5 met on the 2 GB Android reference device over a throttled connection
- [ ] Party list, statement and sales list verified at 2,000 parties, 5,000 entries and 5,000 invoices
- [ ] Print output verified on one A4 laser and one 80 mm thermal printer physically
- [ ] PWA installs and launches from the home screen on Android Chrome

**Security, privacy and compliance**
- [ ] Permission matrix tested for all four roles on every write endpoint
- [ ] JWT rotation, refresh-family reuse detection and revocation on role change verified
- [ ] Attachments validated by magic bytes, EXIF stripped, served through the tenant-checked storage path
- [ ] Rate limits active on OTP, login, share-link and export endpoints
- [ ] DPDP posture documented: what is collected, on whose behalf, the retention rule, the export path (`PLT-10`), the deletion path with its cool-off, the grievance contact, and the party opt-out flags that gate `LED-07` and `LED-08`
- [ ] No mobile number, party name, note or amount appears in any analytics event or log line
- [ ] Public share links: hashed tokens, expiry, revocation, `noindex`, no referrer

**Operations**
- [ ] `docker-compose` brings up `db`, `backend`, `scheduler` and `frontend` from a clean checkout on a single VPS, documented end to end
- [ ] The scheduler runs the reminder, low-stock, overdue-refresh and export tasks idempotently; a double run is proven harmless
- [ ] Automated database backup with a **restore** rehearsed and timed, not merely configured
- [ ] `/system/health` and `/system/version` live; structured JSON logs carry `request_id` and `tenant_id`
- [ ] Error budget, on-call route and a status page or its equivalent agreed
- [ ] A documented data-export path exists for a merchant who wants to leave, and it has been executed once

**Go-to-market and support**
- [ ] The partner configuration path (`WLB-02`) exercised with at least one real partner record, including branding and module entitlements
- [ ] Onboarding collateral in Hindi and English: the CSV templates, a one-page migration guide, and the demo script
- [ ] Support ownership defined in writing — partner L1, Metis L2 — with response targets, because the research names support as the category's largest failure mode
- [ ] Pricing published and the renewal commitment stated, because renewal price rises rank third among churn causes
- [ ] Ten merchants have completed the pilot and at least five have reported at day 45 that they no longer maintain the paper khata
