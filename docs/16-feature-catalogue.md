# Part 16 — Feature Catalogue

The catalogue is the index of everything UdhaarBook does or will do. Each row is a feature with a stable ID (Part 0 §0.5), its module, the release phase, the personas it serves, and a one-line definition. Detailed specifications for MVP and Phase 2 features are in Part 17 (FRD); later phases are specified to catalogue level only and elaborated when they enter a release.

Legend — Phase: **M** = MVP, **2** = Phase 2, **3** = Phase 3, **F** = Future/Enterprise. Persona codes: **OW** owner, **ST** staff/salesperson, **AC** accountant/CA, **PA** partner admin, **SA** super admin (Metis ops), **CU** end customer (party).

## 16.1 Platform (PLT)

| ID | Feature | Phase | Personas | Definition |
|---|---|---|---|---|
| PLT-01 | Mobile OTP sign-up & login | M | OW, ST | Sign up / log in with Indian mobile number + 6-digit OTP; throttled; device session created. |
| PLT-02 | Password login & set/reset | M | ST, AC | Optional password for staff/desktop; set via invite link; reset via OTP. |
| PLT-03 | Business onboarding wizard | M | OW | Create tenant: business name, business type, GST type + GSTIN, address/state, language; seeds defaults. |
| PLT-04 | Multiple businesses & switch | M | OW | A user can own/join several tenants and switch; token re-issued with new tenant. |
| PLT-05 | Team & roles (system roles) | M | OW | Invite members by mobile, assign owner/admin/staff/accountant, suspend/remove. |
| PLT-06 | Tenant settings | M | OW | Numbering series, default due days, units, tax defaults, reminder templates, currency/locale, feature toggles per module. |
| PLT-07 | Business profile & documents header | M | OW | Legal name, trade name, GSTIN, PAN, address, contact, bank details, UPI VPA, signature image, terms. |
| PLT-08 | Audit log viewer | M | OW, AC | Filterable list of who did what when, with before/after for critical entities. |
| PLT-09 | Session & device management | M | OW | List active sessions/devices; revoke; forced logout on role change. |
| PLT-10 | Account deletion & data export (DPDP) | M | OW | Owner can export all tenant data (CSV bundle) and request deletion with cool-off. |
| PLT-11 | App lock / PIN (PWA) | 2 | OW, ST | Local PIN/biometric gate for the installed app. |
| PLT-12 | Custom roles & permission matrix | 3 | OW | Define roles from permission codenames. |
| PLT-13 | API keys & webhooks (tenant) | 3 | OW | Outbound webhooks and scoped API keys for integrators. |
| PLT-14 | Super-admin console (Metis ops) | M | SA | Partner/tenant list, entitlement overrides, impersonation with consent, health. |
| PLT-15 | Plan entitlements | M | SA, PA | Plan → module & limit map (users, parties, invoices/month); enforcement hooks; billing itself is Phase 3. |
| PLT-16 | Subscription billing | 3 | OW, PA | Self-serve plans (Razorpay subscriptions) or partner-billed. |

## 16.2 White-label (WLB)

| ID | Feature | Phase | Personas | Definition |
|---|---|---|---|---|
| WLB-01 | Tenant branding | M | OW | Logo, primary/secondary colours, document header/footer, app display name; applied at runtime via CSS variables and PDF templates. |
| WLB-02 | Partner configuration | M | SA, PA | Partner record with default branding, allowed modules, support contact, legal footer; tenants inherit. |
| WLB-03 | Partner domain & login page | 2 | PA | Partner-specific hostname resolves branding before login; partner logo on auth screens. |
| WLB-04 | Partner admin console | 2 | PA | Manage own tenants, view usage, set entitlements within Metis-granted limits. |
| WLB-05 | Theme tokens & typography overrides | 2 | PA | Extended token overrides (radius, font pairing) validated for contrast. |
| WLB-06 | Partner-branded messaging | 2 | PA | SMS sender headers, WhatsApp templates and email domains per partner. |

## 16.3 Parties (PTY)

| ID | Feature | Phase | Personas | Definition |
|---|---|---|---|---|
| PTY-01 | Create/edit party | M | OW, ST | Name, mobile (unique per tenant), type flags (customer/supplier), GSTIN (validated), billing/shipping address, state (place of supply), notes, opening balance, collection date, credit limit. |
| PTY-02 | Party list with totals | M | OW, ST | Search, filters (owes me / I owe / settled / archived / customers / suppliers / tags), sort; header totals "You will get / You will give". |
| PTY-03 | Party detail (khata page) | M | OW, ST | Header balance, quick actions (You gave / You got / Bill / Remind / Share), timeline of ledger entries and documents. |
| PTY-04 | Archive / restore party | M | OW | Soft archive; blocked while balance ≠ 0 unless a write-off entry is posted. |
| PTY-05 | Tags & groups | M | OW | Free tags (area, route, category); filter by tag. |
| PTY-06 | Credit limit & alerts | M | OW | Optional limit; warn/block on new credit sale or entry exceeding limit (setting: warn or block). |
| PTY-07 | Add from phone contacts | 2 | OW, ST | Contact picker (Web Contacts API / Capacitor) — on-device, no address-book upload. |
| PTY-08 | Merge duplicate parties | 2 | OW | Merge two parties; ledger entries re-pointed with audit. |
| PTY-09 | Party self-view link | 2 | CU | Public read-only "view your khata" link with OTP-less token, expiring, revocable. |
| PTY-10 | Import parties (CSV) | M | OW | Template CSV with opening balances; validation preview; commit. |

## 16.4 Ledger (LED)

| ID | Feature | Phase | Personas | Definition |
|---|---|---|---|---|
| LED-01 | Record "You gave" / "You got" | M | OW, ST | Amount, date (default today, past allowed), note, optional photo, payment mode (for "got"); posts immutable entry; balance updates atomically. |
| LED-02 | Opening balance | M | OW | Posted as first entry of type `opening` in either direction. |
| LED-03 | Correct or reverse an entry | M | OW (admin) | Correction = reversal + replacement (`supersedes_id`); reversal alone = delete semantics; reason required; statement shows corrections toggle. |
| LED-04 | Party statement with running balance | M | OW, ST, AC | Date range, include corrections toggle, document links; PDF (server) with branding; share via WhatsApp deep link or link. |
| LED-05 | Collection date & reminder buckets | M | OW, ST | Per-party collection date; dashboard buckets Due today / Overdue / Upcoming. |
| LED-06 | Manual reminder (WhatsApp/SMS/call) | M | OW, ST | One tap opens wa.me with templated message (balance, shop name, UPI link); log the nudge; bulk select on list. |
| LED-07 | Automated reminders (SMS) | M* | OW | D-1 and D0 SMS via DLT-registered provider when configured; per-party opt-out. *Config-gated at MVP. |
| LED-08 | Transaction SMS to party | M* | CU | SMS on every entry ("₹500 udhaar added… balance ₹2,300") when provider configured and party opted in. |
| LED-09 | Ledger summary & aging | M | OW, AC | Totals receivable/payable; aging buckets 0–30/31–60/61–90/90+ per party and overall. |
| LED-10 | Ledger ↔ documents integration | M | all | Invoices, purchase bills, payments, credit/debit notes and expenses paid to a party post ledger entries automatically; entries link back to source document. |
| LED-11 | Write-off / settle small balance | M | OW | Post `write_off` entry with reason to zero a balance. |
| LED-12 | Automated WhatsApp reminders (API) | 2 | OW | Utility templates via WhatsApp Cloud API/BSP; opt-in recorded; per-message cost surfaced. |
| LED-13 | Recurring reminders & schedules | 2 | OW | Weekly hisaab day per party/route; reminder cadence rules. |
| LED-14 | Interest / late fee on udhaar | 3 | OW | Optional simple interest accrual entries for wholesale credit. |
| LED-15 | Collection routes & salesman collections | 3 | OW, ST | Assign parties to routes/collectors; daily collection sheet; staff-wise collected totals. |

## 16.5 Inventory (INV)

| ID | Feature | Phase | Personas | Definition |
|---|---|---|---|---|
| INV-01 | Create/edit item | M | OW, ST | Name, type goods/service, SKU (auto-suggest, unique), barcode, category, unit, HSN/SAC, GST rate (slab from tax table), purchase price, selling price, MRP, track stock flag, reorder point, image, description. |
| INV-02 | Item list & search | M | OW, ST | Search name/SKU/barcode (scanner-typed), filters category/low stock/archived/type, sort; stock badge tones. |
| INV-03 | Item detail & movement history | M | OW, ST | Prices, on-hand, valuation, movement ledger with document links. |
| INV-04 | Categories & units masters | M | OW | Per-tenant lists; GST UQC mapping for units; inline create from item form. |
| INV-05 | Opening stock | M | OW | Posted as `opening` movement with unit cost. |
| INV-06 | Stock adjustment | M | OW (ST if allowed) | ± qty with reason (damage, theft, count, personal use, other), optional cost; negative stock blocked unless setting allows. |
| INV-07 | Low-stock alerts | M | OW | Dashboard bucket + in-app notification on crossing reorder point (once per crossing). |
| INV-08 | Stock summary & valuation | M | OW, AC | On-hand × weighted-average cost per item/category. |
| INV-09 | Import items (CSV) | M | OW | Template with opening stock; validate; commit. |
| INV-10 | Barcode scanning (camera) | 2 | ST | getUserMedia + JS decoder in item search and billing. |
| INV-11 | Multi-location & transfers | 2 | OW | Locations master; transfer document posts −out/+in atomically; per-location on-hand. |
| INV-12 | Item variants | 2 | OW | Attribute-based variants (size/colour) sharing item, each with SKU/barcode/stock. |
| INV-13 | Price lists | 2 | OW | Named lists (retail/wholesale), per-party default; line price defaults from list. |
| INV-14 | Secondary units & conversions | 2 | OW | e.g. 1 BOX = 12 NOS; sell/buy in either unit. |
| INV-15 | Barcode label printing | 2 | OW | Generate label PDFs (Code128/EAN) with price. |
| INV-16 | Batches & expiry | 3 | OW | Optional per item; FEFO pick; expiry report. |
| INV-17 | Stock take sessions | 3 | OW, ST | Count → variance → adjustment posting. |
| INV-18 | Serial numbers | 3 | OW | Optional per item for electronics. |
| INV-19 | Composite items / BOM | F | OW | Kits and simple assemblies. |

## 16.6 Sales (SAL)

| ID | Feature | Phase | Personas | Definition |
|---|---|---|---|---|
| SAL-01 | Estimate / quotation (kachha bill) | M | OW, ST | Non-tax document; convert to invoice; share PDF. |
| SAL-02 | Tax invoice / bill of supply | M | OW, ST | GST-compliant per Rule 46: lines (item search/scan, qty, unit, price, discount), tax breakup CGST/SGST or IGST by slab, document discount, round-off, party or walk-in, due date, payment on the spot (multi-mode) or credit → ledger; numbering per FY series; stock deducted atomically. |
| SAL-03 | Invoice PDF, print & share | M | OW, ST | A4 and 80mm thermal templates with tenant branding, UPI QR (static/dynamic), wa.me share, public link. |
| SAL-04 | Credit note / sales return | M | OW | Against invoice (full/partial lines) or standalone; restocks; posts credit entry; refund or hold as advance. |
| SAL-05 | Void / cancel invoice | M | OW | Void with reason before/after issue; reverses stock and ledger; number retained. |
| SAL-06 | Draft autosave & duplicate | M | ST | Drafts persist; duplicate any document. |
| SAL-07 | Walk-in / cash sale | M | ST | No party; payment must be recorded in full; optional customer mobile for SMS. |
| SAL-08 | Sales list & filters | M | OW, ST, AC | Status tabs (all/unpaid/overdue/paid/draft), date range, party, amount; totals. |
| SAL-09 | Delivery challan | 2 | OW | Goods movement without invoice; convert to invoice. |
| SAL-10 | Recurring invoices | 2 | OW | Schedules for service businesses. |
| SAL-11 | Sales orders | 3 | OW, ST | Order → invoice, backorder visibility. |
| SAL-12 | e-Invoice (IRN) | 3 | OW, AC | GSP adapter: JSON schema, IRN, signed QR on PDF, cancel within 24h. |
| SAL-13 | e-Way bill | 3 | OW | Part A/B generation via API. |
| SAL-14 | Customer-facing invoice page & pay | 2 | CU | Public link shows invoice and UPI/PA pay button; status updates. |

## 16.7 Purchases (PUR)

| ID | Feature | Phase | Personas | Definition |
|---|---|---|---|---|
| PUR-01 | Purchase bill entry | M | OW, ST | Supplier, supplier invoice no./date, lines (item, qty, cost, tax), totals; posts +in movements with cost (weighted average update) and a ledger credit to supplier; payment now or later. |
| PUR-02 | Supplier payment | M | OW | Payment out with mode/reference; allocate to bills; posts ledger debit. |
| PUR-03 | Purchase list & filters | M | OW, AC | Status tabs, supplier, date range; payables totals. |
| PUR-04 | Void purchase bill | M | OW | Reverses stock and ledger. |
| PUR-05 | Purchase order | 2 | OW | Draft → sent → received; share PDF. |
| PUR-06 | Goods receipt against PO | 2 | OW, ST | Partial receipts; over-receipt warning. |
| PUR-07 | Debit note / purchase return | 2 | OW | −out movements; supplier ledger debit. |
| PUR-08 | Landed cost allocation | 2 | OW | Freight/other charges spread into unit cost. |

## 16.8 Payments (PAY)

| ID | Feature | Phase | Personas | Definition |
|---|---|---|---|---|
| PAY-01 | Record payment in/out | M | OW, ST | Party, amount, date, mode (cash/UPI/bank/cheque/card/other), reference/UTR, note; posts ledger entry; optional allocation to open documents (auto-FIFO or manual). |
| PAY-02 | Multi-mode split payment | M | ST | One receipt split across modes (e.g. ₹700 UPI + ₹300 cash). |
| PAY-03 | UPI static QR & intent link | M | OW, CU | Tenant VPA renders QR on invoices/statements; dynamic intent link with amount + reference. |
| PAY-04 | Payment receipt PDF/share | M | ST, CU | Receipt document with branding. |
| PAY-05 | Void payment | M | OW | Reverses ledger and allocations. |
| PAY-06 | Payment aggregator integration | 2 | OW, CU | Razorpay adapter: orders/payment links/QR, webhooks, idempotent posting, settlement view. |
| PAY-07 | Unmatched payments queue | 2 | OW | Credits without party context; one-tap map; learn payer VPA → party. |
| PAY-08 | Bank statement import & matching | 3 | AC | CSV import; suggested matches. |
| PAY-09 | Cheque tracking (PDC) | 3 | OW | Post-dated cheques with clear/bounce. |

## 16.9 Expenses (EXP)

| ID | Feature | Phase | Personas | Definition |
|---|---|---|---|---|
| EXP-01 | Record expense | M | OW, ST | Category, amount, date, mode, party (optional), GST (optional), receipt photo. |
| EXP-02 | Expense categories | M | OW | Per-tenant list with defaults seeded. |
| EXP-03 | Cashbook view | M | OW | Day-wise cash/bank in & out from payments and expenses with opening/closing. |
| EXP-04 | Recurring expenses | 2 | OW | Rent, salaries schedules. |

## 16.10 Reports (RPT)

| ID | Feature | Phase | Personas | Definition |
|---|---|---|---|---|
| RPT-01 | Dashboard | M | OW | Tiles: to collect, to pay, due today, overdue, today's sales, cash in hand, low stock; recent activity; top debtors. |
| RPT-02 | Day book | M | OW, AC | All entries for a day/range: sales, purchases, payments, expenses. |
| RPT-03 | Sales register | M | AC | Invoice-wise with tax breakup; CSV/Excel. |
| RPT-04 | Purchase register | M | AC | Bill-wise with tax; CSV/Excel. |
| RPT-05 | Receivables / payables aging | M | OW, AC | Party-wise buckets. |
| RPT-06 | Stock summary & low stock | M | OW | On-hand, value, below reorder. |
| RPT-07 | GST summary | M | AC | Outward/inward by slab (CGST/SGST/IGST), HSN summary, document series summary — GSTR-1/3B preparation aid. |
| RPT-08 | Export (CSV/Excel) | M | AC | Every report; async job for large ranges with download link. |
| RPT-09 | Item movement & fast/slow movers | 2 | OW | Velocity over window. |
| RPT-10 | Profit summary | 2 | OW | Sales − COGS (avg cost) − expenses, by period. |
| RPT-11 | Staff performance | 2 | OW | Sales and collections by user. |
| RPT-12 | GSTR-1 JSON export | 2 | AC | Offline-tool schema. |
| RPT-13 | Tally XML export | 3 | AC | Vouchers/masters export. |
| RPT-14 | Scheduled reports | 3 | OW | Daily summary via WhatsApp/email. |

## 16.11 Notifications (NTF)

| ID | Feature | Phase | Personas | Definition |
|---|---|---|---|---|
| NTF-01 | In-app notification inbox | M | OW, ST | Bell with unread count; types: reminder due, low stock, payment received, member joined, import done. |
| NTF-02 | Messaging provider adapters | M | SA, PA | SMS adapter interface with console/dev backend; template registry with DLT IDs; message log. |
| NTF-03 | WhatsApp deep-link share | M | OW, ST | Prefilled wa.me text for statements, invoices, reminders; PDF via public link. |
| NTF-04 | Web push | 2 | OW | Reminder and payment alerts. |
| NTF-05 | WhatsApp Business API | 2 | OW, PA | Template send/receive status; cost accounting. |
| NTF-06 | Email (invoices/statements) | 2 | AC | Optional email channel. |

## 16.12 Import / Export (IMP)

| ID | Feature | Phase | Personas | Definition |
|---|---|---|---|---|
| IMP-01 | CSV import framework | M | OW | Upload → validate (row errors) → preview → commit as background job; templates for parties, items. |
| IMP-02 | Bulk export | M | OW, AC | Any list to CSV/Excel with current filters. |
| IMP-03 | Excel templates & bulk edit | 2 | OW | XLSX import; bulk price update. |
| IMP-04 | Migration from Khatabook/Vyapar exports | 3 | OW | Mappers for known export formats. |

## 16.13 Help (HLP)

| ID | Feature | Phase | Personas | Definition |
|---|---|---|---|---|
| HLP-01 | In-app help centre | 2 | OW, ST | Topic → article, search with Hinglish synonyms, FAQ, "was this helpful". |
| HLP-02 | Contextual help & tours | 2 | OW | "?" per screen; 4 guided tours. |
| HLP-03 | What's new | 2 | OW | Release notes list. |

## 16.14 Loans (LON) — optional module carried from DigiKhaato

| ID | Feature | Phase | Personas | Definition |
|---|---|---|---|---|
| LON-01 | Borrowers & loans | 3 | OW | Principal, interest, EMI/daily collection schedule. |
| LON-02 | Daily collections & correction flow | 3 | ST | Collector entry with transaction-safe recalculation. |
| LON-03 | Overdue tracking & reports | 3 | OW | Buckets, collector performance. |

## 16.15 Phase totals

| Phase | Features | Notes |
|---|---|---|
| MVP | 74 (incl. 2 config-gated) | Everything a business needs to replace paper khata + bill book + stock register on day one. |
| Phase 2 | 37 | Depth for staffed/wholesale businesses and partners. |
| Phase 3 | 19 | Compliance automation, verticals, integrations. |
| Future | 1 + accounting module | Not to influence MVP architecture beyond the extension points listed in Part 20. |
| **Total** | **131** | The sum of the module tables in §16.1–§16.14. |

> **Correction, 2026-09-18.** This table previously read 67 MVP / 41 Phase 2 / 24 Phase 3 / 5 Future = 137. Those figures were an early estimate that was never re-derived after the module tables were finalised, and they are wrong. A row-by-row count of the phase column across all fourteen module tables gives **74 / 37 / 19 / 1 = 131**, and the table above now states those numbers. The rows themselves are unchanged; only the summary was corrected. Per-module counts (MVP / P2 / P3 / Future): PLT 12/1/3/0, WLB 2/4/0/0, PTY 7/3/0/0, LED 11/2/2/0, INV 9/6/3/1, SAL 8/3/3/0, PUR 4/4/0/0, PAY 5/2/2/0, EXP 3/1/0/0, RPT 8/4/2/0, NTF 3/3/0/0, IMP 2/1/1/0, HLP 0/3/0/0, LON 0/0/3/0. The MVP figure counts LED-07 and LED-08 (marked `M*`) as MVP; they are built at MVP and gated on provider configuration. Anyone holding the old totals should note that the MVP scope is **larger** than previously reported and the later phases correspondingly smaller — the drift came from features being pulled forward into MVP without the summary being updated. Part 43 records this as CR-118.
