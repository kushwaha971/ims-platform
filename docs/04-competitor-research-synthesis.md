# Part 4 — Competitor Research Synthesis

*This chapter is the single comparative reference for UdhaarBook's competitive landscape. It covers Zoho Inventory and Zoho Books, Khatabook, OkCredit, Vyapar, myBillBook, TallyPrime and the long tail of Busy, Marg, Swipe and the departed QuickBooks. It provides a capability-coverage matrix, a pricing comparison, a positioning analysis, and — for each competitor — what it gets right that UdhaarBook must match and what it gets wrong that UdhaarBook must beat. It closes with a numbered list of competitive commitments: things UdhaarBook must do at MVP purely because a competitor has trained the market to expect them.*

---

## 4.1 The competitive field

Seven products and one departed incumbent define this market. They divide into three groups that compete with each other far less than they compete with paper.

**Ledger-first, free or near-free, phone-only.** Khatabook (50M+ installs, 4.5★ on ~586K reviews) and OkCredit (10M+ installs, 4.6★ on ~432K reviews) digitise the udhaar khata. They are multilingual — 12–13 and 11 Indian languages respectively — and weak at inventory and GST [R2 §B.1, §B.2].

**Billing-first, paid, mobile plus desktop.** Vyapar (10M+ installs, 4.8★ on ~187K reviews), myBillBook/FloBooks (10M+ installs, 4.7★ on ~147K) and Swipe (1M+ installs, 4.6★ on ~14.6K) sell GST billing with inventory. Vyapar's flagship is a Windows desktop application and full offline operation; myBillBook leads with multi-godown and POS; Swipe is web-first with unlimited e-invoice and e-way bill on mobile [R2 §B.1, §B.2].

**Compliance-first, desktop, partner-sold.** TallyPrime (2.5M+ businesses, 28,000+ partners), Busy and Marg ERP 9+ are the incumbent tier, priced at ₹8,000–₹68,000, sold and serviced by local partners, and trusted by the CA [R3 §0.1, §8.1].

**Cloud suites.** Zoho Inventory and Zoho Books (India edition) are the only products in the set with genuine architectural breadth — multi-warehouse, serial and batch tracking, approvals, custom modules, a full API — priced at ₹749–₹7,999 per month and shaped for a digitally-native seller rather than a kirana [R1 §Part B; R3 §3.1].

**QuickBooks Online exited India on 30 April 2023** rather than maintain GST localisation, issuing refunds; Zoho and Tally captured the churn [R3 §7.4]. That exit is the clearest single statement of how expensive Indian compliance is for a global product.

---

## 4.2 Capability coverage matrix

Legend: **Strong** = a first-class, well-reviewed capability; **Partial** = present but limited, gated to a higher tier, or reported as unreliable; **Absent** = not offered.

| Capability area | Zoho Inv/Books | Khatabook | OkCredit | Vyapar | myBillBook | TallyPrime | UdhaarBook target |
|---|---|---|---|---|---|---|---|
| **Party ledger with running balance (khata UX)** | Partial — AR/AP and statement PDF only; explicitly *no* khata view, no non-invoice cash entries, no interest, no SMS collections [R1 §E.2] | **Strong** — the core product; two-button gave/got, passbook, settle [R2 §A.1 F3–F4] | **Strong** — same model; QR auto-settles balance [R2 §B.2] | Partial — party ledger inside billing | Partial | Partial — AR/AP ledgers in accounting vocabulary | **Strong** — first-class immutable `LedgerEntry` (LED-01…11) |
| **Customer SMS on every entry** | Absent (SMS credits are paid, invoice-centric) | **Strong** — free, DLT-registered, with view-khata link [R2 §A.1 F6] | Partial — free tier sends from merchant's own SIM; server SMS at ₹99/mo | Partial | Partial | Absent | Partial at MVP (provider-gated LED-08), Strong at Phase 2 |
| **Reminders: manual, bulk, scheduled** | Partial — up to 3 automated per type; WhatsApp reminders since Apr 2024 [R1 §A.18] | **Strong** — Remind button, bulk multi-select, collection date with auto D-1/D0 [R2 §A.1 F7] | **Strong** | Strong | Strong | Partial (rule-based) | **Strong** (LED-05/06/07/12/13) |
| **Collection date per party** | Partial (payment terms/due date) | **Strong** | **Strong** | Partial (invoice due date only) | Partial | Partial | **Strong** (LED-05) |
| **Credit limits & ageing on the ledger** | Partial (credit limit on contact; ageing reports) | Absent | Partial (defaulters view, paid tier) | Absent from base tier | Absent from base tier | Strong (accounting ageing) | **Strong** (PTY-06, LED-09) — an identified category gap [R3 §5 #12] |
| **GST invoice / bill of supply** | **Strong** — Rule 46, 16 mandatory fields, GST treatments, place-of-supply logic [R1 §A.24] | Partial — paid reseller SKU | Partial — ₹75/mo tier | **Strong** | **Strong** | **Strong** | **Strong** (SAL-02) |
| **GST returns (GSTR-1/3B)** | Partial — **not in Zoho Inventory; lives in Zoho Books** on a shared org [R1 §E.2] | Partial — paid tier | Absent | Strong | Strong | **Strong** | Partial at MVP (GST summary RPT-07), Strong at P2 (GSTR-1 JSON RPT-12) |
| **e-Invoice (IRN)** | **Strong** — Zoho is a registered GSP; one-click IRN + signed QR; bulk JSON [R1 §A.24] | Partial (reseller-listed) | Absent | Partial — Gold tier | Partial — Pro Max/Enterprise | Strong | Phase 3 (SAL-12) |
| **e-Way bill** | **Strong** — from invoice/credit note/challan; custom threshold; bulk JSON | Partial | Absent | Strong | Partial — 50/yr Platinum | Strong | Phase 3 (SAL-13) |
| **Inventory: items, stock, low-stock** | **Strong** — accounting vs physical stock, committed vs available, reorder points, replenishments [R1 §A.0, §A.28] | Partial — paid tier | Partial — ₹75/mo tier | **Strong** | **Strong** — multi-godown | **Strong** | **Strong** (INV-01…09) |
| **Multi-location / godown** | **Strong** — but capped by plan: Free 1, Standard 2, Premium 4, Plus 6, Enterprise 10 [R1 §Part B] | Absent | Absent | Partial | **Strong** — "unlimited godowns" on Pro | Strong | Phase 2 (INV-11) |
| **Batch / expiry** | Partial — **Premium tier only, ₹2,299/mo** [R1 §Part B] | Absent | Absent | Partial — Gold/Pro | Partial | Strong | Phase 3 (INV-16) |
| **Serial numbers** | Partial — Premium tier; ≤1,000 per transaction | Absent | Absent | Partial | Absent | Strong | Phase 3 (INV-18) |
| **Barcode scan & label print** | Partial — generation is Premium+ [R1 §A.3] | Absent | Absent | Strong (with reported bugs) | **Strong** — headline Plus/Pro feature | Strong | Phase 2 (INV-10, INV-15) |
| **Composite items / kits / BOM** | **Strong** — Assemblies and Kits since Apr 2025 [R1 §A.4] | Absent | Absent | Partial — manufacturing tier | Absent | Strong | Future (INV-19) |
| **Purchases: bills, POs, GRN, returns** | **Strong** — PO → receive → bill with derived statuses [R1 §A.11–A.14] | Partial | Absent | Strong | Strong | **Strong** | Partial at MVP (PUR-01…04), Strong at P2 (PUR-05…08) |
| **UPI QR / payment link auto-posting to ledger** | Partial — gateways (Razorpay, Paytm, Zoho Payments) but **no documented offline-UPI auto-match flow** [R1 §E.2] | **Strong** — Khatabook Pay: link, digital + physical QR, auto ledger entry [R2 §A.1 F12] | **Strong** — QR auto-settles | Partial — via gateway | Partial | Absent | Strong at MVP for QR/intent (PAY-03), Strong at P2 for aggregator + unmatched queue (PAY-06/07) |
| **Multi-mode split payment** | Partial | Absent | Absent | Partial — a known complaint that split payments aren't tracked accurately [R2 §A.1 F3] | Partial | Strong | **Strong** (PAY-02) |
| **Multi-user with roles** | **Strong** — Super Admin/Admin/Staff plus custom roles, per-module and per-report access, location and reporting-tag segmentation [R1 §A.34] | Partial — paid tier staff permissions | Partial — multi-device only | Partial — Gold | Strong — 3 users + CA on Pro Max | Strong (LAN users) | **Strong** (PLT-05, four system roles) |
| **Desktop / web** | **Strong** (web-native) | Partial — paid Windows + web | Partial — ₹75/mo | **Strong** — Windows desktop is the flagship | Strong — desktop + web | **Strong** (desktop only) | **Strong** — responsive web + PWA (ADR-020) |
| **Offline operation** | **Absent** — online only | Partial | Strong | **Strong** — desktop is offline-first | Partial — a named weakness [R3 §2.2] | **Strong** | Partial at MVP, Strong at P2 (offline write queue) |
| **Languages** | Absent for India UI — English only [R1 §E.2] | **Strong** — 12–13 Indian languages incl. Hinglish | **Strong** — 11 | Partial — English + Hindi; "missing multilanguage" complaints | Partial — 5 | Partial | Strong — `en`+`hi` at MVP, 10+ on roadmap |
| **Reporting breadth** | **Strong** — 11 categories, ~70 named reports, custom reports, scheduling [R1 §A.29] | Absent — thin, a named complaint | Absent | Partial | Partial | **Strong** | Partial at MVP (9 core reports), Strong later |
| **Tally export / CA hand-off** | **Absent** — no native Tally integration; community requests exist [R1 §E.2] | Absent | Absent | Partial | Partial — Pro Max hook, with reported problems | n/a (is Tally) | Phase 3 (RPT-13); CSV/Excel at MVP |
| **Audit trail with before/after** | **Strong** — Comments & History on every record, Activity Logs & Audit Trail report [R1 §A.40] | Absent | Absent | Absent | Absent | Partial | **Strong** (PLT-08, Part 0 §0.11) |
| **Import / export everywhere** | **Strong** — every module, saved mappings, password-protected exports [R1 §A.38] | Partial — per-party PDF | Partial | Partial — "bulk uploads can have glitches" | Partial | Partial — "piece by piece to Excel" | **Strong** (IMP-01/02) |
| **White-label / partner tenancy** | Absent | Absent | Absent | Absent | Absent | Absent | **Strong** — the structural differentiator (WLB-01…06) |
| **Advertisements in free tier** | None | None (but loan banners) | **Heavy — the category's #1 complaint** [R2 §D #1] | None | None | n/a | **Never** |
| **In-app lending** | Absent | Strong — ₹10K–₹5L at 15–24% via NBFC partners | Partial — scaled down 2025 | Partial | Partial | Absent | Phase 3, opt-in, partner-distributed only |

Two readings of this matrix matter. First, **no product has a Strong rating in both the ledger column and the inventory-plus-GST columns**. That is the gap. Second, **no product has white-label tenancy at all**, which is why UdhaarBook's `Partner` abstraction is a structural rather than cosmetic differentiator.

---

## 4.3 Pricing comparison

All figures are September 2026 list prices in INR, generally excluding 18% GST. Sources: [R1 §Part B] for Zoho Inventory, [R2 §B.3] for the ledger apps, [R3 §3.1] for the full set.

| Product | Free tier | Entry paid | Mid tier | Top tier | Pricing unit |
|---|---|---|---|---|---|
| **Khatabook** | Ledger, SMS, reminders, PDF, QR — fully free, ad-free | "GST Billing Software" 1–2 yr reseller licence; **price not published** (est. ₹1,000–₹4,000/yr, unverified) | — | — | Per business, reseller-sold |
| **OkCredit** | Ledger **with ads** and a capped daily transaction count; SMS from merchant's own SIM | ₹30/mo — unlimited transactions (ads remain) | ₹75/mo — Ads-Free++: no ads, multi-device, GST bills, defaulters view, desktop, stock | ₹99/mo — Premium: + unlimited server-sent SMS | Per business/month; "prices will remain stable" |
| **Vyapar** | **Mobile app free forever** — billing, inventory, ledger, reminders, offline | Silver mobile ₹699/yr; **Desktop Silver ~₹3,399/yr**; combo ~₹4,010–4,399 | Gold ₹799 / ₹4,099 / ₹4,799 — unlimited e-invoice, credit limits, up to 5 companies, TDS/TCS | Retail/Distributor/Manufacturing Pro & Platinum ₹1,599–₹2,399 (basis unclear) | Per device/year; 3-yr bundles discounted |
| **myBillBook** | **None** — 7-day trial + money-back only | Plus ₹3,490/yr (list ₹4,833) — 1 business, 1 user + CA | Pro ₹3,990/yr — desktop app, 500 SMS/WA, godowns | Pro Max ~₹570/mo billed yearly — 2 businesses, 3 users + CA, POS, e-invoice, unlimited e-way, **Tally export** | Per business/year |
| **Swipe** | "Lifetime free" — unlimited invoices, purchases, quotes, WhatsApp share | From ₹250/mo incl. tax — desktop+tablet+mobile, GSTR-1, 40+ reports, unlimited e-invoice/e-way, gateway | — | — | Per business/month; 3-yr plan rose ₹2,899 → ₹6,499 |
| **Zoho Books IN** | Free if revenue ≤ ₹25 L/yr — 1 user + 1 accountant, 1,000 invoices/yr, GST reports | Standard ₹749/mo annual (₹899 monthly), 3 users, e-invoice | Professional ₹1,499/mo (5 users); Premium ₹2,999 (10 users, payroll) | Elite ₹4,999 (15 users, warehouses, batch/serial); Ultimate ₹7,999 (25 users) | Per org/month + ₹150/user add-on |
| **Zoho Inventory IN** | ₹0 — **50 sales orders, 50 invoices, 20 POs, 20 bills per month**, 1 user, 1 location | Standard ₹999/mo annual (₹1,199 monthly) — 500 SO/invoices, 3 users, 2 locations | Premium ₹2,299/mo — 3,000 docs, 5 users, 4 locations, **serial/batch, barcode, e-invoicing** | Plus ₹4,999; Enterprise ₹7,499 — 7,500–15,000 docs, 10 users, 6–10 locations | Per org/month, **metered by document count** |
| **TallyPrime** | None | Silver ₹22,500 one-time + TSS ₹4,500/yr; rental ₹750/mo | — | Gold ₹67,500 one-time + TSS ₹13,500/yr; rental ₹2,250/mo; cloud access from ₹600/user/mo | Perpetual + annual support subscription |
| **Busy** | None | Start ₹5,000/yr single user | Smart ₹8,000/yr; multi-user ₹12,499–₹17,999 | Power ₹12,000/yr; multi-user ₹24,999 | Per licence/year |
| **Marg ERP 9+** | None | Basic ₹8,100 one-time + AMC ₹2,000–5,500/yr | Silver ₹12,600 (3 users) | Gold ₹25,200 (5 users); Marg Cloud ~₹999/user/mo | Perpetual + AMC |

**Zoho Inventory's add-ons** deserve separate mention because they show how an inventory product monetises depth: extra user $7.50/mo, +500 orders $7.50/mo, extra location $10/mo, Advanced Autoscans (50 scans) $8/mo, and **Advanced Warehousing at $124.17/mo** to obtain bins, picklists, move orders, putaways and stock counts outside the Enterprise plan [R1 §Part B].

Four conclusions follow.

**The micro ceiling is ₹3,400–₹4,000/year and it is set by two independent companies.** Vyapar Desktop Silver at ~₹3,399 and myBillBook Plus at ₹3,490 converge from different directions [R3 §3.1].

**Metering by document count is the loudest pricing complaint in the set.** Zoho counts sales orders *and* invoices *and* purchase orders *and* bills separately, so a wholesaler issuing 20 invoices a day exhausts the Standard plan; reviewers also report "plan limitations based on line item counts" [R1 §Part B observations, §E.1 #1]. UdhaarBook's Principle 6 (Part 2 §2.4) is a direct response.

**Batch and expiry — essential for pharma, FMCG and any kirana selling food — sits behind Zoho's ₹2,299/month tier**, which is roughly 8× the entire annual budget of the micro segment [R1 §Part B; R3 §3.1]. This is the clearest single example of a capability priced out of the Indian mass market.

**Renewal pricing is a churn trigger even at ₹3,000–₹5,000/year.** Busy raises prices "every year or 2", Marg charges AMC above the quoted rate, myBillBook adds surprise charges for new features, Swipe's three-year plan rose from ₹2,899 to ₹6,499, and OkCredit is the only vendor in the set that publicly promises "prices will remain stable" [R3 §3.3; R2 §B.3]. That promise is worth copying.

---

## 4.4 The positioning map, in prose

Place two axes across this market. The horizontal axis is **ledger depth** — how completely the product expresses a running party account with non-invoice cash entries, collection dates, reminders, statements and settlement. The vertical axis is **billing and inventory depth** — GST correctness, stock movement, purchases, multi-location, compliance outputs.

The **lower-right quadrant** (high ledger depth, low billing depth) contains Khatabook and OkCredit. They own the ledger completely: two-button entry, red/green semantics, running passbook, customer SMS, collection date with automatic D-1 and D0 reminders, QR that auto-settles, PDF statement shared over WhatsApp. They have essentially no inventory and no GST depth in the free product, and what exists is a separately-licensed reseller SKU (Khatabook) or a ₹75/month tier (OkCredit) [R2 §B.2].

The **upper-left quadrant** (high billing depth, low ledger depth) contains everything else. Zoho Inventory is the extreme case — a product with 11 report categories, two stock modes, FIFO and weighted-average valuation, serial and batch tracking, bins, picklists, replenishments, approvals, custom modules and a full REST API, which nonetheless offers **no khata view whatsoever**: receivables are invoice-centric, there is no running party ledger accepting cash-in/cash-out entries without an invoice, no interest or late fee, and no SMS collection at scale without paid IM credits [R1 §E.2]. Vyapar, myBillBook and Swipe sit lower on billing depth than Zoho but higher on ledger depth, since a party ledger exists inside their billing modules. TallyPrime, Busy and Marg sit highest on compliance depth and lowest on mobile accessibility.

The **upper-right quadrant is empty.** No product in this research combines a genuine, first-class khata with genuine GST billing and inventory at a price the Indian micro and small segment pays. That emptiness is not an accident of product management; it is a consequence of origin. The ledger apps started from a consumer-simplicity premise and could not add depth without violating it — Khatabook's own reviewers now complain that "the interface is denser… can overwhelm less tech-savvy owners" [R2 §D #14]. The billing apps started from an accounting premise and treat the khata as a derived report because that is what it is in double-entry terms.

UdhaarBook enters the empty quadrant **from the ledger side**, because entering from the billing side has been tried five times and always produces a product where udhaar is a receivables screen. The architectural expression of that choice is that `LedgerEntry` is a first-class immutable primitive rather than a view over invoices (Part 0 §0.2, §0.11).

A third axis, invisible on the map but decisive commercially, is **delivery model**. Every product listed is sold under its own brand. None offers white-label tenancy, and no public case exists of an Indian bank, NBFC or telecom licensing a third-party khata-plus-billing SaaS [R3 §8.2]. UdhaarBook's `Partner` abstraction therefore occupies uncontested space — with the caveat, recorded honestly in [R3 #12], that the demand for it is inferred rather than proven.

---

## 4.5 Competitor by competitor: what to match, what to beat

### Zoho Inventory and Zoho Books

**What it gets right that UdhaarBook must match.**

Zoho's status vocabularies are exemplary and are the model for Part 0 §0.7. Every document has an unambiguous status set — invoices are `draft`, `sent`, `viewed`, `unpaid`, `partially_paid`, `paid`, `overdue`, `void`; purchase orders are Draft, Issued, Partially Received, Received, Cancelled with derived In Transit, Yet to be Received and Billed indicators; transfer orders are Draft → In Transit → Transferred — and the sales-order list shows three coloured dots for invoice, package and shipment status so a user reads order state at a glance [R1 §A.15, §A.11, §A.8, §E.3].

Every transaction carries **Comments & History**, and the Activity Logs and Audit Trail report records old and new field values with click-through [R1 §A.40, §E.3]. Import and export exist on every module with saved field mappings and password-protected exports [R1 §A.38]. The **Sales Order Cycle automation** — one click producing invoice, package, shipment and recorded payment — is explicitly named as a good model for UdhaarBook's "record sale → bill → stock → ledger → WhatsApp" single-tap flow [R1 §E.3]. PDF templating is consistent, per-customer-associable and multilingual [R1 §A.37].

Zoho also exposes **both stock realities plainly**: Stock on Hand, Committed Stock, Available for Sale, In-Transit, and a per-item toggle between them — because SMBs argue constantly about "how many do I actually have" [R1 §A.0, §C.3 lesson 4].

**What it gets wrong that UdhaarBook must beat.**

*No khata.* The single most important gap: invoice-centric receivables, no running party ledger with non-invoice cash entries, no interest or late fee, no scalable SMS collection [R1 §E.2].

*Price and gating.* ₹999–₹7,499/month per organisation, with serial/batch behind ₹2,299/month, barcode generation behind Premium, and Advanced Warehousing as a $124/month add-on [R1 §Part B].

*Metering by document count* — the observation that a wholesaler doing 20 invoices a day exhausts Standard [R1 §Part B].

*GST returns are not in the product.* An Indian SMB needing GSTR-1 or 3B must run Zoho Books as well, on the same organisation [R1 §E.2].

*Clutter.* "Doesn't allow removing unneeded features"; "steep learning curve"; "I see a lot of tools I don't really know how to use"; "clinical interface" [R1 §E.1 #3].

*Mobile thinner than web* — no default sales UoM on mobile, some edits web-only, stock-count approval web-only [R1 §E.1 #4].

*No Tally integration, English-only Indian UI, and only Delhivery, Shiprocket and Envia for shipping* [R1 §E.2].

*e-Invoicing setup requires GSP and IRP API-user registration* — non-trivial for a shop owner, with help text still citing the obsolete ₹500 crore threshold [R1 §E.2].

### Khatabook

**What it gets right that UdhaarBook must match.**

Almost the entire ledger interaction model. Onboarding is OTP on a mobile number with the **language picker as the first screen** and no forms or documents [R2 §A.1 F1]. Parties are added from phone contacts — a specifically praised feature [R2 §A.1 F2]. Entry is two large buttons, red "You gave" and green "You got", an amount keypad, an optional note and photo, a date defaulting to today with backdating allowed, and an instant balance update [R2 §A.1 F3]. The passbook shows a running balance after each row like a bank statement, with month separators [R2 §A.1 F3]. Settlement pre-fills a full-balance "You got" entry [R2 §A.1 F4].

The **customer-facing SMS on every entry** is the trust primitive that makes disputes vanish, and it is the most-praised feature in the category [R2 §A.1 F6, §D]. **Remind** is a first-class button beside Call, offering WhatsApp, SMS or dialler, with bulk multi-select [R2 §A.1 F7]. The **collection date** produces automatic reminders one day before and on the date — no infinite nagging, which is a good default [R2 §A.1 F7]. Statements are free PDFs shareable over WhatsApp [R2 §A.1 F9]. Multiple businesses under one account are standard [R2 §A.1 F14]. Twelve to thirteen Indian languages including Hinglish transliteration [R2 §A.0].

**What it gets wrong that UdhaarBook must beat.**

*Depth stops at the ledger.* Billing, inventory, staff roles and desktop are a reseller-sold licence with unpublished pricing [R2 §A.0].

*Loan banners pollute the core flow* and loan processing delays and rejections dominate negative Play reviews [R2 §A.1 F20, §D #4].

*Payment reconciliation fails.* "₹650 QR payment missing, 72-hour support SLA"; "notification system lags behind" — the category's second-ranked pain point [R2 §D #2].

*Performance regressions.* "Extremely slow and keeps hanging while entering transactions", freezes and crashes reported as recently as September 2026 [R2 §A.0, §D #3].

*Reminders route through external platforms* rather than being genuinely automatic on WhatsApp [R2 §D #12].

*Thin reporting, no integrations, no customisable templates* [R3 §2.2].

*Deletion semantics are destructive* — "delete khatas and start fresh anytime" — where soft delete with audit is required [R2 §A.1 F3].

*Feature creep without progressive disclosure* — "interface is denser… can overwhelm" [R2 §D #14].

### OkCredit

**What it gets right that UdhaarBook must match.**

The **QR that auto-settles the ledger balance** is the single most valuable reconciliation behaviour in the category and is explicitly flagged as the key win to replicate [R2 §A.1 F4]. Full offline functionality with cloud backup [R2 §B.2]. Eleven Indian languages. A **published, stable price list** with the explicit promise that "prices will remain stable" — unique in a market where renewal hikes are the top pricing complaint [R2 §B.3]. And the commercial proof point: profitability in November 2025 with 2 lakh-plus paying shopkeepers, reached by *abandoning* lending and charging ₹30–₹99/month [R2 §A.0, §B.4].

**What it gets wrong that UdhaarBook must beat.**

*Heavy advertisements in the free tier* — the number-one ranked pain point across the entire category, with a 13% one-star share [R2 §D #1].

*Capped daily transactions on free*, with ₹30/month to remove the cap — metering the habit itself [R2 §A.1 F3, §B.3].

*SMS sent from the merchant's own SIM on the free tier*, with server-sent SMS at ₹99/month — cost-shifting onto the user [R2 §A.1 F6].

*A deleted customer's number cannot be re-added* — a specific, fixable data-model failure that argues for soft delete plus restore [R2 §A.1 F2, §D #8].

*Subscription billing errors* — "duplicate monthly charges despite paying" [R2 §D #5].

### Vyapar

**What it gets right that UdhaarBook must match.**

Simplicity at scale — "staff learn quickly" — combined with genuine all-in-one coverage of billing, GST, inventory and expenses [R3 §2.2]. **Full offline operation**, with the desktop application offline-first; this is the reason it is the highest-rated app in the set at 4.8★ [R2 §B.2]. WhatsApp invoicing as a headline capability. The freemium structure — mobile free forever, desktop paid — is the proven Indian conversion wedge [R3 §3.1]. And the partner channel: 27,000 partners with top performers earning ₹2 lakh a month [R3 §8.1].

**What it gets wrong that UdhaarBook must beat.**

*Support* — "zero communication even during the free trial" [R3 §2.2].

*Data integrity* — "missing data, mismatched totals at audit" is the most dangerous complaint category in this research [R3 §2.2, §2.3].

*Glitches* — blank WhatsApp PDFs, hangs, barcode printing failures [R3 §2.2].

*Split payments not tracked accurately* (part cash, part UPI) — which is why PAY-02 is an MVP feature [R2 §D #7].

*Missing multilanguage support* in a billing product [R2 §D #10].

*Date-entry friction* — "the date feature is annoying and hard to change", which is why quick chips (Today / Yesterday / pick) are specified [R2 §D #15].

*No mobile e-way bill generation* [R2 §D #16].

*Unit economics* — ₹2.04 spent per ₹1 earned, cash down 93% [R3 §3.4].

### myBillBook (FloBooks)

**What it gets right that UdhaarBook must match.**

The easiest UI in the paid set (4.7 ease-of-use on Capterra), GST invoices across devices, barcode and batch inventory, P&L/GSTR/sales reports, WhatsApp support, unlimited godowns on the Pro tier, and — the top-tier hook that reveals what growing firms actually want — **Tally export** [R3 §2.2, §3.1].

**What it gets wrong that UdhaarBook must beat.**

*Calculation errors* — "cost me thousands" [R3 §2.2].

*Crashes and resets after updates*; black-screen and data-not-opening bugs [R3 §2.2; R2 §D #18].

*Offline gaps* — "requires stable internet" [R3 §2.2].

*Surprise add-on charges for new features* and price rises [R3 §2.2, §3.3].

*Tally integration problems* despite selling Tally export as the top-tier hook [R3 §2.2].

*No perpetual free tier* — a 7-day trial only, which forecloses the acquisition play entirely [R3 §3.1].

### TallyPrime (and Busy, Marg)

**What it gets right that UdhaarBook must match.**

Keyboard-driven entry speed — a genuine advantage at a billing counter that mobile-first products routinely underestimate. Statutory depth and GST correctness that the CA trusts. Multi-tasking (opening a report without losing the entry in progress). Robust inventory. Cost-effectiveness against global alternatives [R3 §2.2]. Busy adds fast GST updates, batch and multi-location inventory, and customisable financial reports; Marg adds a genuine pharma and FMCG vertical fit with batch, expiry, schemes and sub-stockist handling [R3 §2.2].

**What it gets wrong that UdhaarBook must beat.**

*No mobile app* — TallyPrime's number-one G2 con with 18 mentions [R3 §2.2].

*No native cloud* — Busy requires third-party RDP; Marg's number-three complaint is "not cloud based/SaaS"; Tally sells cloud access as a ₹600/user/month add-on [R3 §1.4].

*Performance and hangs in multi-user mode*; slowness with large data [R3 §2.2].

*Manual extraction* — "piece by piece" to Excel [R3 §2.2].

*Old-school UI and a steep curve for non-accountants* [R3 §2.2].

*Support and channel failure* — Marg's 2.9 support score, "charging more AMC than mentioned on site", "no training provided", policy changes imposed on existing customers [R3 §2.2].

*Price increases every one to two years* at Busy [R3 §2.3].

### The long tail: Swipe, QuickBooks, Bharat Khata

**Swipe** is the mobile-compliance specialist: unlimited e-invoice and e-way bill on mobile is its differentiator, and its free tier covers unlimited invoices, purchases, quotes and WhatsApp share [R2 §B.2, §B.3]. Its weaknesses are speed ("speed is very poor"), support quality ("zero accounting knowledge") and a three-year plan price rise from ₹2,899 to ₹6,499 [R2 §D #3, #6, #11].

**QuickBooks Online exited India on 30 April 2023** [R3 §7.4]. Its review profile before exit — prices "keep going up", steep tier jumps, a help centre described as "a nightmare", bank-sync drops and account lockouts over billing [R3 §2.2] — is a catalogue of what not to do, and its exit is evidence that GST localisation is a genuine moat.

**Bharat Khata** (`com.bharatkhata.erp`) is no longer a general udhaar app; it is a CredServ channel-finance product doing invoice approval, credit limits, eNACH and SMS-reading for underwriting. No evidence was found of a Dukaan-owned "Bharat Khata" ledger product [R2 §B.1 naming note]. It is listed here only to close the reference.

---

## 4.6 The gap UdhaarBook occupies

Stated precisely, the gap is defined by five simultaneous conditions that no existing product satisfies together:

1. **A first-class party ledger** that accepts non-invoice cash entries, maintains a running balance with vernacular red/green semantics, and drives collection dates, reminders and statements — which only Khatabook and OkCredit have, and which Zoho explicitly lacks [R1 §E.2].
2. **Genuine GST billing and inventory** in the same product, at the same price, without a reseller licence or a tier jump — which only the billing-first products have, and which they gate or price above the micro segment.
3. **Priced flat per business with published, grandfathered renewals and no metering of entries or invoices** — which only OkCredit approximates, and only for the ledger.
4. **Vernacular in both halves of the product**, ledger and billing — which nobody does; Khatabook has language without billing depth, Vyapar has billing without languages [R2 §B.2, §D #10].
5. **Deliverable under a partner's brand**, with partner-owned branding, entitlements and support — which nobody offers at all [R3 §8.2].

The defensibility of this position rests on the argument in Part 2 §2.8: feature parity is copyable, but the ledger graph, accumulated data trust, partner switching costs and the compliance treadmill compound.

---

## 4.7 Competitive commitments

These are things UdhaarBook **must do at MVP**, not because they are strategically clever but because a competitor has already trained the Indian market to expect them. Failing any one of these makes the product feel broken rather than different. Each carries its feature ID from Part 16 and its evidence.

1. **Two-button ledger entry — red "You gave", green "You got" — with amount keypad, optional note, optional photo and a date defaulting to today with backdating allowed.** The colour convention is stable across every app in the category and must not be inverted. *(LED-01; [R2 §A.1 F3, §C.4])*

2. **A running balance shown after every row, passbook-style, with the party's net balance in large type at the top of the khata page.** *(LED-04, PTY-03; [R2 §A.1 F3–F4])*

3. **Opening balance on party creation**, posted as a dated first entry so statements begin correctly. Day-one adoption is impossible without it. *(LED-02, PTY-01; [R2 §A.1 F5])*

4. **A party statement PDF with the business's name, logo and contact, a selectable date range, Indian digit grouping, and one-tap WhatsApp sharing.** *(LED-04, NTF-03; [R2 §A.1 F9])*

5. **A "Remind" button as a first-class action beside Call, offering WhatsApp deep link, SMS and dialler — plus bulk multi-select from the party list.** *(LED-06; [R2 §A.1 F7])*

6. **A collection date per party with automatic reminders at D-1 and D0** — no more frequent, because Khatabook's restrained default is correct and reminder fatigue is a real churn risk. *(LED-05, LED-07; [R2 §A.1 F7])*

7. **A UPI QR and intent link carrying amount and reference, rendered on invoices and statements**, so the reminder itself carries a way to pay. *(PAY-03; [R2 §A.1 F12, §C.2])*

8. **Multi-mode split payment on a single receipt** (e.g. ₹700 UPI + ₹300 cash) — because Vyapar's failure to track this accurately is a named complaint. *(PAY-02; [R2 §D #7])*

9. **Party list with "You will get / You will give" totals pinned at the top, and filters for owes-me, I-owe, settled and archived.** *(PTY-02; [R2 §A.1 F2])*

10. **Multiple businesses under one login, with a switcher in the header.** Every ledger app offers this and users expect it. *(PLT-04; [R2 §A.1 F14])*

11. **GST-compliant tax invoice meeting Rule 46 in full**, with CGST/SGST versus IGST determined by place of supply, HSN/SAC on lines, UQC units, and a per-financial-year numbering series of at most 16 characters. *(SAL-02; [R2 §C.1])*

12. **Bill of Supply for composition and unregistered businesses, and an estimate/quotation as the kachha bill** — using the market's own words. *(SAL-01, SAL-02; [R2 §C.4])*

13. **80mm thermal and A4 print templates with tenant branding.** Counter billing is a printing job. *(SAL-03; [R3 §5 #4])*

14. **Barcode-typed search in item lookup at MVP** (scanner-as-keyboard), with camera scanning in Phase 2 — because 64% of inventory buyers rate barcode scanning critical and it rises to must-have in retail. *(INV-02, INV-10; [R3 §1.2])*

15. **Low-stock alerts against a per-item reorder point**, surfaced on the dashboard and in the notification inbox. Inventory control and optimisation are rated critical by 94% and 82% of buyers respectively. *(INV-07; [R3 §1.2])*

16. **CSV import for parties with opening balances and items with opening stock, with row-level validation and a preview before commit.** Two-thirds of buyers arrive from paper or Excel. *(IMP-01, PTY-10, INV-09; [R3 §1.2])*

17. **CSV/Excel export on every list and every report.** Excel is the universal "integration" in this market. *(IMP-02, RPT-08; [R3 §6])*

18. **Receivables and payables ageing in 0–30 / 31–60 / 61–90 / 90+ buckets**, party-wise and overall — the capability absent from every mobile app's base tier. *(LED-09, RPT-05; [R3 §5 #12])*

19. **Credit limit per party with a warn-or-block setting.** Also absent from mobile base tiers, and required for the wholesale segment. *(PTY-06; [R3 §5 #12])*

20. **Soft delete with restore for parties and items, and corrections as reversal-plus-replacement for ledger entries — never a hard delete.** OkCredit's inability to re-add a deleted customer's number is the cautionary case. *(PTY-04, LED-03, INV-01; [R2 §D #8])*

21. **An audit trail on every financial entity showing who changed what, when, with before and after values.** Zoho sets this expectation; the Indian mobile apps do not meet it, and the data-integrity complaint is why they lose customers. *(PLT-08; [R1 §A.40, §E.3]; [R3 #11])*

22. **A GST summary, sales register, purchase register and HSN summary exportable for the CA.** The CA is the second seat in every SMB and inability to hand off is a switch trigger. *(RPT-03, RPT-04, RPT-07; [R3 §3.3, §5 #8])*

23. **A free accountant seat in every plan, including free.** The "1 user + 1 CA" structure appears in myBillBook and Zoho Books Free and is now an expectation. *(PLT-05; [R3 §4.2])*

24. **Hindi and English throughout — both the ledger and the billing screens — with the vernacular vocabulary of [R2 §C.4] as the copy source.** *(ADR-006; [R2 §A.0, §D #10])*

25. **No advertisements, no entry caps, no invoice caps on any tier including free.** The two most-hated monetisation patterns in the category. *(Part 2 §2.4 Principle 6; [R2 §D #1; R1 §E.1 #1])*

26. **Offline-tolerant entry with sub-400ms perceived write latency on a 2 GB Android device**, and a visible sync indicator. Slowness during transaction entry is the third-ranked category pain point. *(ADR-020; [R2 §D #3])*

27. **Published prices, with renewals grandfathered at the original price.** Renewal increases are the single most cited pricing complaint across five products, and OkCredit's public stability promise is the competitive benchmark. *(Part 1 §1.9; [R3 §3.3])*

28. **Account deletion and full data export in-app.** Khatabook already lists deletion in its Play data-safety declaration, and DPDP makes it mandatory from Phase 3. *(PLT-10; [R2 §A.1 F19, §C.6])*

Commitments 1 through 10 are ledger parity with Khatabook and OkCredit. Commitments 11 through 19 are billing and inventory parity with Vyapar and myBillBook. Commitments 20 through 28 are the trust, language and pricing behaviours that no competitor delivers consistently — and which, taken together, constitute the product's actual differentiation.
