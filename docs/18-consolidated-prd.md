# Part 18 — Consolidated Product Requirements Document

## 18.1 Document control

| Field | Value |
|---|---|
| Document | UdhaarBook Product Requirements Document |
| Part | 18 of the UdhaarBook Single Source of Truth |
| Version | 1.0 (first signable issue) |
| Status | For approval |
| Date | 18 September 2026 |
| Product | UdhaarBook — mobile-first, white-label business operating system for Indian small businesses |
| Vendor | Metis Labs (Metis Labs B.V.) |
| Author | Product, Metis Labs |
| Approvers | Product owner; engineering lead; compliance owner; launch partner representative where a partner is contracted |
| Supersedes | None |
| Normative references | Part 0 (canon), Part 16 (feature catalogue), Part 17 (FRD), Part 21 (database architecture), Part 22 (API specification), Part 23 (design system) |
| Related | Parts 10–15 (how to read the requirements, scope, MVP, roadmap, personas, journeys), Parts 19–20 (architecture), Part 27 (security), Part 28 (testing), Part 35 (definition of done), Part 36 (risks), Part 38 (ADRs), Part 39 (decision log) |

**Purpose and standing.** This part is the formal product requirements document. It is written to be read and signed on its own by a stakeholder who has not read the rest of the specification, and it cross-references rather than duplicates the other parts. Where it states a requirement, that requirement is binding; where it summarises another part, the other part is authoritative and is named.

**Precedence.** In any conflict, the order of Part 10 §10.1 applies: canon, then schema and API, then FRD, then this document, then the narrative chapters. A conflict is a defect to be fixed by change control, never resolved by an engineer's preference.

**Versioning.** This document uses semantic versioning. A patch increment is editorial. A minor increment adds or clarifies a requirement without changing scope, a measurable target or a non-functional commitment. A major increment changes scope, a target, or a non-functional commitment, and requires re-approval by the approvers named above. Every increment is recorded in Part 39 with its date, its author and its reason.

**Change control.** Amendments follow Part 10 §10.7: Class A editorial changes are applied in place; Class B canon change requests are folded into Parts 0, 21 or 22; Class C scope changes require a written request, an impact statement, a Part 39 decision-log entry and, where they reverse an entry on the Avoid list of Part 11 §11.3, demonstration that the stated trigger has been met. Once a module's build has started, Class C changes to that module are held to the next phase boundary unless they are correctness or compliance defects.

## 18.2 Problem statement

An Indian small business keeps four records and reconciles them by hand.

The first is **udhaar** — credit extended to customers, written in a ruled notebook in pencil, indexed by person. For a kirana shop this is one to two lakh rupees of working capital; for a distributor it is thirty-five to forty-five lakh and is the single largest risk in the business. The notebook has no totals, no aging, no attribution and no copy. When it disagrees with the customer's memory, the argument is settled by whoever is more insistent.

The second is the **bill book**: kachha bills for the customers who do not need paper, tax invoices for those who do. GST compliance is the reason most of these businesses buy software at all, and non-compliance is expensive: an invoice series with a gap, a wrong place of supply or a rate applied from the wrong period produces a revised filing, a notice, or a buyer who loses input credit and stops buying.

The third is the **stock register**, which for the majority is a spreadsheet updated irregularly or the owner's memory. It is wrong by the end of most months, and the difference between what the shelf holds and what the record says is invisible until somebody counts.

The fourth is **cash** — a drawer, a bank account and a UPI app, reconciled at night by counting.

The software market has not solved this. It has divided into two clusters that each solve part of it. The **ledger cluster** is free, available in a dozen languages, phone-only, and reached tens of millions of installs; it digitises the notebook and stops there, and it could not be paid for — the category leader earned a hundred crore of revenue against a hundred and sixteen crore loss in FY24, on a lending thesis, while a competitor reached profitability only by abandoning lending and charging thirty to ninety-nine rupees a month. The **billing cluster** is paid at three to four thousand rupees a year, desktop-led, English-heavy, and treats udhaar as a receivables report; it spends two rupees to earn one. A merchant who needs both runs two applications and reconciles between them, which is the "multi-app trap" and is the actual daily experience of the target user.

The consequences are measurable. Credit is extended without limits or aging, so receivables age and are written off. Collection depends on remembering and on the social cost of asking. Invoices are compliant only to the extent the person writing them remembers the rules. Stock is discovered to be wrong rather than known to be right. And the accountant — present in almost every one of these businesses as a second, non-paying user — re-keys data that already exists in digital form, because what he receives is a PDF or a photograph rather than a file.

**The problem UdhaarBook addresses:** an Indian small business of any type has no single record that holds its udhaar, its bills, its stock and its cash together, is fast enough to use at a counter with a customer waiting, is available in the language the owner reads, is trustworthy enough that a disputed balance can be settled by looking at it, and hands clean data to the accountant without re-keying.

## 18.3 Goals and non-goals

### 18.3.1 Goals

**G1 — Replace the paper.** A business that adopts UdhaarBook stops maintaining its paper khata, its bill book and its stock register. *Target:* at least 50 % of pilot merchants report at day 45 that they no longer maintain the paper khata; at least 40 % of onboarded tenants are still posting ledger entries on day 30.

**G2 — Be faster than the pencil at the counter.** *Target:* median time from opening a party page to a saved ledger entry ≤ 8 seconds on a 2 GB Android phone; P95 server time for `POST /ledger-entries` ≤ 250 ms; ledger drawer visible ≤ 100 ms after tap.

**G3 — Make the ledger trustworthy enough to settle a dispute.** Entries and stock movements are immutable; corrections are reversals plus replacements with a mandatory reason, visible to the merchant and on the shared statement. *Target:* zero balance drift and zero stock drift on a 100,000-row dataset including backdated, reversed, corrected and voided rows; every financial state change carries an audit row with actor, reason, before and after.

**G4 — Be correct on GST.** *Target:* the GST summary reconciles to the sales register to the rupee; the fixture suite covering every slab, intra- and inter-state, composition, unregistered, discounts, round-off and reverse charge passes, including a document dated before the 22 September 2025 slab change; zero invoice-series gaps or duplicates under concurrent issue, with correct reset at the financial-year boundary.

**G5 — Reduce time to collect.** *Target:* for pilot merchants, the share of receivables older than 60 days falls over a quarter, and days sales outstanding for the wholesale cohort falls by at least one week.

**G6 — Work in the user's language on the user's device.** *Target:* 100 % of user-visible strings present in both `en` and `hi` with no missing-key warnings; all performance budgets met on the 2 GB Android reference device over a 3G-equivalent connection; zero critical accessibility violations.

**G7 — Be resellable.** A partner can brand the product, control which modules its merchants get, message under its own identity, and operate it within its own security review. *Target:* one partner live on its own hostname and sender identity with at least ten transacting merchants by the end of Phase 2.

**G8 — Hand clean data to the accountant.** *Target:* every report exports to CSV and Excel with numeric amounts and the expected columns; zero revised filings attributable to product error.

### 18.3.2 Non-goals

These are not deferred; they are excluded. Each is argued in Part 11 §11.3 with the trigger that would have to be met to reverse it, and no engineering decision may assume any of them.

**N1** Full double-entry accounting — general ledger, chart of accounts, journal vouchers, trial balance, profit and loss, balance sheet, bank reconciliation. **N2** Payroll, attendance and employment records. **N3** E-commerce storefront, online catalogue or ONDC seller app. **N4** CRM: leads, pipelines, campaigns, marketing automation. **N5** Multi-currency. **N6** Manufacturing bills of material, job-work costing, production orders and work in progress. **N7** Lending, credit marketplace or BNPL inside the product's own flows. **N8** In-app advertising or interstitial upsell — the one non-goal with no reversal trigger. **N9** Direct filing to the GST portal or operating as a GSP. **N10** Bank feeds and account-aggregator integration. **N11** Native iOS and Android applications at MVP. **N12** Marketplace and shipping integrations. **N13** Loyalty and coupon engines. **N14** A workflow builder, custom objects or a formula language.

## 18.4 Target users and market

**Market.** India first: INR, GST, UPI, WhatsApp, and English plus Hindi at launch. The architecture keeps tax regime, currency and locale tenant-configurable (Part 0 §0.1) so that a second region is possible, but no feature is built for one.

**Addressable base.** Roughly 7.8 crore Udyam-registered MSMEs and 1.67 crore active GST taxpayers, of which about 1.49 crore are regular registrants. Digital payment acceptance is near-universal; digital record-keeping is not — a substantial share of MSMEs remain fully offline, and over half report that finding and setting up digital tools is hard. The realistic commercial base is the GST-registered, staffed business with a computer, priced at three to four thousand rupees a year, reached through a partner channel rather than an app store.

**Target customers.** Owner-operated and staffed small businesses of **every type** — retail, wholesale and distribution, services, trading, small manufacturing and job-work, and professional practices. Business type is chosen at onboarding and tunes defaults only; it never hard-wires behaviour (Part 0 §0.2).

**Users.** Eight personas, specified in full in Part 14 and referenced by every FRD: Suresh Sharma the kirana owner; Ramesh Agarwal the wholesale distributor; Anjali Deshpande the services professional; Mahesh Patel the small manufacturer and job-worker; Sunita Kumari the counter staff member; Vikram Joshi the accountant and part-time CA; Neha Raghavan the white-label partner administrator; Arjun Menon the Metis super-admin. A ninth party — the end customer who owes money — is served without an account and is specified in Part 14 §14.9 and Part 15 §15.10.

**Delivery model.** Multi-tenant SaaS, optionally white-labelled per Partner — a bank, fintech, distributor or ERP vendor that resells to its merchant base. Metis Labs is itself the default partner. Evidence for the channel is direct: every distribution owner in this market has built or bought some merchant tool and stopped at the layer adjacent to its own revenue, and the incumbents move volume through tens of thousands of resellers.

## 18.5 Product principles

These nine principles decide the cases the requirements do not cover. They are ordered; where two conflict, the earlier wins.

**P1 — The ledger is the spine.** Every document — invoice, purchase bill, payment, credit note, party-linked expense — posts a ledger entry that links back to its source (`LED-10`). There is one balance per party, derived from one immutable series of entries. No module may maintain a second view of what a party owes.

**P2 — Nothing is edited; everything is a new event.** Ledger entries and stock movements are immutable. Corrections are reversals plus replacements; voids are reversals; adjustments are new movements. Every one carries a reason and an audit row. This is the product's trust proposition and it is also Part 0 §0.11's first rule.

**P3 — Speed at the counter beats everything except correctness.** A flow that is slower than paper will be replaced by paper, silently. Budgets in §18.8 are requirements, not aspirations.

**P4 — The user's words, not accounting's.** "You gave" and "You got", "You will get" and "You will give", baaki, hisaab, kachha and pakka bill. Red for receivable, green for received, always paired with words for accessibility. Both languages, everywhere, from the first commit.

**P5 — Simplify rather than omit.** Where the category over-builds, ship the reduced form with a stated growth path (Part 11 §11.4): locations rather than warehouse management, a per-party default price rather than a pricing engine, reason capture rather than approval workflows.

**P6 — Defaults, not configuration.** Business type seeds defaults; module toggles and settings adjust them. The answer to "we work differently" is a default, not a new feature and never a configuration language.

**P7 — Be honest about what the product cannot see.** A payment made to a static QR is invisible to the server; the product says so and gives a one-field manual path rather than pretending. An unmatched credit appears in a queue rather than disappearing.

**P8 — The customer is a participant.** The person who owes money receives the message, sees the statement, and can opt out. Their trust is what makes the merchant's ledger credible.

**P9 — Minimal dependencies, single-machine deployable.** Part 0 §0.4 ADR-021's allow-list, ADR-012's cron scheduler without Celery or Redis, ADR-013's local disk storage, ADR-014's client-side PDF. A partner's security review is a product requirement.

## 18.6 Functional scope

Scope is defined by feature ID against the catalogue in Part 16, specified at implementation depth in Part 17 for MVP and Phase 2 features, and catalogued only for Phase 3 and Future. Phase markers: **M** MVP, **M\*** MVP config-gated, **2** Phase 2, **3** Phase 3, **F** Future.

| Module | MVP | Phase 2 | Phase 3 | Future |
|---|---|---|---|---|
| **Platform (PLT)** | `PLT-01` OTP sign-up · `PLT-02` password login · `PLT-03` onboarding wizard · `PLT-04` multiple businesses · `PLT-05` team & roles · `PLT-06` tenant settings · `PLT-07` business profile · `PLT-08` audit log · `PLT-09` sessions · `PLT-10` export & deletion · `PLT-14` super-admin console · `PLT-15` plan entitlements | `PLT-11` app lock | `PLT-12` custom roles · `PLT-13` API keys & webhooks · `PLT-16` subscription billing | multi-org consolidation |
| **White-label (WLB)** | `WLB-01` tenant branding · `WLB-02` partner configuration | `WLB-03` partner domain · `WLB-04` partner console · `WLB-05` theme tokens · `WLB-06` partner messaging | — | — |
| **Parties (PTY)** | `PTY-01` create/edit · `PTY-02` list with totals · `PTY-03` khata page · `PTY-04` archive · `PTY-05` tags · `PTY-06` credit limits · `PTY-10` CSV import | `PTY-07` contacts picker · `PTY-08` merge · `PTY-09` self-view link | — | — |
| **Ledger (LED)** | `LED-01` you gave/you got · `LED-02` opening balance · `LED-03` correct/reverse · `LED-04` statement · `LED-05` collection date · `LED-06` manual reminder · `LED-07`\* auto SMS reminders · `LED-08`\* transaction SMS · `LED-09` summary & aging · `LED-10` document integration · `LED-11` write-off | `LED-12` WhatsApp API reminders · `LED-13` recurring reminders | `LED-14` interest/late fee · `LED-15` collection routes | — |
| **Inventory (INV)** | `INV-01` items · `INV-02` list & search · `INV-03` detail & movements · `INV-04` categories & units · `INV-05` opening stock · `INV-06` adjustments · `INV-07` low stock · `INV-08` summary & valuation · `INV-09` CSV import | `INV-10` barcode scan · `INV-11` multi-location · `INV-12` variants · `INV-13` price lists · `INV-14` secondary units · `INV-15` label printing | `INV-16` batches & expiry · `INV-17` stock take · `INV-18` serial numbers | `INV-19` composite items/BOM |
| **Sales (SAL)** | `SAL-01` estimate · `SAL-02` tax invoice/bill of supply · `SAL-03` PDF, print & share · `SAL-04` credit note · `SAL-05` void · `SAL-06` drafts & duplicate · `SAL-07` walk-in · `SAL-08` list & filters | `SAL-09` delivery challan · `SAL-10` recurring invoices · `SAL-14` customer invoice page | `SAL-11` sales orders · `SAL-12` e-invoice (IRN) · `SAL-13` e-way bill | marketplace sync |
| **Purchases (PUR)** | `PUR-01` purchase bill · `PUR-02` supplier payment · `PUR-03` list & filters · `PUR-04` void | `PUR-05` purchase order · `PUR-06` goods receipt · `PUR-07` debit note · `PUR-08` landed cost | — | — |
| **Payments (PAY)** | `PAY-01` record in/out · `PAY-02` split payment · `PAY-03` UPI QR & intent · `PAY-04` receipt · `PAY-05` void | `PAY-06` aggregator · `PAY-07` unmatched queue | `PAY-08` bank statement import · `PAY-09` cheque tracking | bank feeds |
| **Expenses (EXP)** | `EXP-01` record · `EXP-02` categories · `EXP-03` cashbook | `EXP-04` recurring | — | — |
| **Reports (RPT)** | `RPT-01` dashboard · `RPT-02` day book · `RPT-03` sales register · `RPT-04` purchase register · `RPT-05` aging · `RPT-06` stock summary · `RPT-07` GST summary · `RPT-08` export | `RPT-09` item movement · `RPT-10` profit summary · `RPT-11` staff performance · `RPT-12` GSTR-1 JSON | `RPT-13` Tally XML · `RPT-14` scheduled reports | BI connector |
| **Notifications (NTF)** | `NTF-01` in-app inbox · `NTF-02` provider adapters · `NTF-03` WhatsApp deep link | `NTF-04` web push · `NTF-05` WhatsApp Business API · `NTF-06` email | — | — |
| **Import/Export (IMP)** | `IMP-01` CSV import framework · `IMP-02` bulk export | `IMP-03` Excel templates & bulk edit | `IMP-04` competitor migration | — |
| **Help (HLP)** | — | `HLP-01` help centre · `HLP-02` tours · `HLP-03` what's new | — | — |
| **Loans (LON)** | — | — | `LON-01` borrowers & loans · `LON-02` daily collections · `LON-03` overdue tracking | — |
| **Accounting** | — | — | — | double-entry GL, P&L, balance sheet |
| **Totals** | **74** | **37** | **19** | **1 + accounting** |

\* Configuration-gated: code, templates, opt-in flags, message-log rows, tests and both locales ship at MVP; behaviour activates when an SMS provider is configured (ADR-015).

MVP contents are enumerated with one-line scopes in Part 12 §12.2; phase themes, entry and exit criteria and the release train are in Part 13; the cut-line policy if the build runs late is in Part 12 §12.7.

## 18.7 Cross-cutting requirements

These apply to every feature in every module and are not restated per feature. A feature that violates one of them is defective regardless of its own acceptance criteria.

**CC-1 Multi-tenancy.** Every business row carries `tenant_id`. Every queryset passes through the tenant-scoped manager, which fails closed. An identifier belonging to another tenant returns **404, never 403** — a 403 would confirm the row exists. Tenant resolution is from the `tid` claim in the access token, never from a request parameter or header. An automated probe suite issues every read and write endpoint with a foreign identifier and asserts 404 (Part 12 §12.8). PostgreSQL row-level security is an optional Phase 2 addition (ADR-008) and does not replace application-level scoping.

**CC-2 White-label.** A `Partner` owns default branding, allowed modules, entitlements, support contact and legal footer; a `Tenant` inherits and may override within the limits the partner is granted. Branding is applied at runtime through CSS variables and document templates — there is no per-partner build. Module entitlements are enforced server-side: a disabled module's endpoints return `module_disabled`, and its navigation entry is absent rather than empty. A partner administrator is **not** a tenant member and reaches tenant data only through impersonation that requires recorded tenant consent and is itself audited. From Phase 2 a partner hostname resolves branding before login (`WLB-03`) and messaging carries the partner's sender identity (`WLB-06`).

**CC-3 Roles and permissions.** Four system roles at MVP — `owner`, `admin`, `staff`, `accountant` — with the fixed permission matrix of Part 0 §0.9 expressed as codenames of the form `<module>.<resource>.<action>`. Permissions are enforced at the API, and the interface **hides** actions the user cannot perform rather than showing and refusing them. The `accountant` role has no write path of any kind. A role change forces a logout so a stale token cannot carry old permissions. Custom roles built from the same codenames are `PLT-12` in Phase 3.

**CC-4 Localisation.** English and Hindi at MVP, complete: every user-visible string has a key in both `en.json` and `hi.json`, and a build with a missing key fails. Vernacular terms follow Part 0 §0.2 — उधार दिया, जमा, बाकी, हिसाब. Numbers use `en-IN` grouping (₹1,23,456.50); dates display as dd/mm/yyyy; business dates are stored as `YYYY-MM-DD` in the tenant timezone, default `Asia/Kolkata`, and timestamps are UTC. The financial year runs 1 April to 31 March and is the default period for reports and the reset point for document series. Colour is never the sole carrier of meaning — red and green always accompany the words "You gave" and "You got".

**CC-5 Offline and poor-network behaviour.** The product is online-first with resilience, not offline-first, at MVP; an offline write queue is Phase 2 (ADR-020). Concretely: every form long enough to be interrupted retains its contents through a connection failure, a backgrounded app and a token refresh; writes whose outcome the client can predict show an optimistic row and a retry; writes that allocate a number, move stock or change history block honestly rather than faking success; every retry reuses its original `Idempotency-Key` so a lost response cannot produce a duplicate. Lists render skeletons rather than blank screens. Long operations — imports, large exports — run as server-side jobs whose status survives the client closing.

**CC-6 Audit.** Every state-changing operation runs inside `transaction.atomic()` and writes a `platform_audit_log` row through the service layer, carrying actor, tenant, entity type and identifier, action, before and after snapshots for critical entities, and metadata including request identifier, IP and user agent. Reasons captured for voids, reversals, corrections, adjustments, write-offs and credit-limit overrides are part of the audit record and are visible to the owner in `PLT-08`, not only to operations. Audit rows are append-only.

**CC-7 Data export and deletion under DPDP.** The merchant is the Data Fiduciary for their customers' data; UdhaarBook is the Data Processor for it and a Data Fiduciary for merchant accounts. Requirements: an owner can export the complete tenant as a CSV bundle at any time (`PLT-10`); an owner can request deletion, which runs after a stated cool-off, cascades to messaging logs, and preserves only what a statutory retention obligation requires — GST records for 72 months from the annual-return due date — with the retained set documented; every party carries per-channel opt-in and opt-out flags with the consent source and timestamp, and an opt-out suppresses every outbound message immediately; contacts-permission data is processed on-device and no address book is uploaded (`PTY-07`, Phase 2); a grievance contact is published in-product; security safeguards include encryption in transit and at rest, access control, and logs retained for at least a year; breach procedures meet the Data Protection Board's notification timelines and CERT-In's separate incident-reporting requirement; India-region hosting is preferred and cross-border transfer is a deployment decision recorded per partner; sign-up by anyone under 18 is blocked. Personal data never appears in analytics events or log lines — no mobile numbers, names, notes or amounts.

**CC-8 Messaging compliance.** SMS to Indian numbers requires DLT registration of the principal entity, a six-character alphabetic service header and content templates whose variables match exactly, or the message is dropped at scrubbing. Ledger-entry and reminder messages are service-implicit, never promotional. WhatsApp deep links (`wa.me`) are free, manual and need no approval and are the MVP mechanism; server-sent WhatsApp requires Meta business verification and approved Utility templates and is Phase 2 (`NTF-05`, `LED-12`), with per-message cost surfaced. Every outbound attempt writes a `notifications_message_log` row with provider identifier and status, including `skipped` when no provider is configured.

**CC-9 Money and quantity arithmetic.** `Decimal` end to end. Database: `numeric(14,2)` for money, `numeric(14,3)` for quantities, `numeric(14,4)` for unit costs. API amounts are strings with two decimals. Rounding is half-up at line and document level per GST rules. Totals are computed server-side; the client's figures are previews and are discarded on save. No floating-point arithmetic touches money at any layer.

**CC-10 Idempotency and concurrency.** Every POST that creates a document or a payment accepts an `Idempotency-Key`; the same key with the same body within 24 hours replays the original response, and the same key with a different body returns 409. Document numbers are allocated from per-tenant, per-kind, per-financial-year sequences under serialisation so that concurrent issue produces consecutive numbers with no gaps or duplicates. Party balance updates take a row lock. Mutable resources use optimistic concurrency with a `version` field.

## 18.8 Non-functional requirements

Each requirement is numbered, testable and owned by a verification method. "Verified by" names the mechanism that proves it, and every one of these is a release gate in §18.13.

### 18.8.1 Performance

| ID | Requirement | Target | Verified by |
|---|---|---|---|
| NFR-01 | Ledger entry creation, server time | P95 ≤ 250 ms, P99 ≤ 500 ms | Load test at 100,000 entries; CI performance assertion |
| NFR-02 | Ledger entry drawer open after tap | ≤ 100 ms, no network call | Component test; manual on reference device |
| NFR-03 | Invoice issue (number, stock, ledger, payment) server time | P95 ≤ 600 ms | Load test with 10 lines |
| NFR-04 | Party list, first page, 2,000 parties | ≤ 1.5 s end to end on 3G | Seeded dataset, throttled profile |
| NFR-05 | Party statement, first page, 5,000 entries | ≤ 1.5 s; cursor pagination, never full load | Seeded dataset |
| NFR-06 | Dashboard load | P95 ≤ 1.2 s | Seeded dataset at one year of data |
| NFR-07 | Report query, one month of data | P95 ≤ 2 s; larger ranges run as background jobs | Seeded dataset; `RPT-08` job path |
| NFR-08 | Party page first contentful paint on 3G-equivalent | ≤ 2.5 s | Lighthouse on throttled reference device |
| NFR-09 | Initial JavaScript bundle | ≤ 250 KB gzipped for the shell; features code-split per route | Build-size budget enforced in CI |
| NFR-10 | Client-side image compression before upload | ≤ 300 KB, longest edge 1600 px | Unit test on the upload path |
| NFR-11 | Database query count per list endpoint | No N+1; asserted query counts on hot endpoints | CI query-count assertions |
| NFR-12 | Scheduler tick | Every 60 s; each task idempotent; a double run is a no-op | Integration test running each task twice |

### 18.8.2 Availability and reliability

| ID | Requirement | Target | Verified by |
|---|---|---|---|
| NFR-13 | Service availability, single-VPS deployment | ≥ 99.5 % monthly, excluding announced maintenance | Uptime monitoring against `/system/health` |
| NFR-14 | Crash-free sessions | ≥ 99.5 % | Client error reporting |
| NFR-15 | Uncaught client errors | ≤ 5 per 1,000 sessions | Client error reporting |
| NFR-16 | Recovery point objective | ≤ 24 h at MVP (nightly backup); ≤ 1 h from Phase 2 (WAL archiving) | Backup configuration plus a rehearsed restore |
| NFR-17 | Recovery time objective | ≤ 4 h | Timed restore rehearsal, performed at least monthly |
| NFR-18 | Data durability | Zero accepted writes lost; every accepted write is committed or reported as failed | Transaction discipline; chaos test killing the process mid-request |
| NFR-19 | Migration safety | Every migration runs forward on a copy of production data with a documented rollback | Release checklist |
| NFR-20 | Third-party failure isolation | An SMS, WhatsApp or payment provider outage degrades only its channel; core flows are unaffected | Fault-injection test with each adapter failing |

### 18.8.3 Device, browser and accessibility

| ID | Requirement | Target | Verified by |
|---|---|---|---|
| NFR-21 | Reference device | Android 10+, 2 GB RAM, Chrome, 360 px viewport | Manual test matrix per release |
| NFR-22 | Browser support | Chrome and Android WebView last 2 versions, Safari/iOS last 2, Edge, Firefox | Compatibility matrix |
| NFR-23 | Responsive behaviour | Every form single column below 640 px; every table becomes cards below 768 px; the on-screen keyboard never covers the primary action | Component tests; visual review |
| NFR-24 | PWA | Installable with a manifest; launches from the home screen; app shell cached | Manual verification on Android |
| NFR-25 | Accessibility | WCAG 2.2 AA: contrast, focus order, labelled controls, `role` attributes on custom controls, colour never the sole meaning carrier | axe-core with zero critical violations on every screen; keyboard-only walkthrough of the invoice and ledger flows |
| NFR-26 | Touch targets | ≥ 44 × 44 px for primary actions; thumb-reachable primary action on mobile | Design review, component tests |
| NFR-27 | Print output | A4 and 80 mm thermal templates verified on physical printers | Manual print test per release |

### 18.8.4 Security

| ID | Requirement | Target | Verified by |
|---|---|---|---|
| NFR-28 | Authentication | JWT access token 15 min, rotating refresh 30 days in httpOnly cookies; refresh-family reuse detection revokes the family | Unit and API tests |
| NFR-29 | Tenant isolation | Cross-tenant identifiers return 404 on every endpoint | Automated cross-tenant probe suite |
| NFR-30 | Authorisation | Every write endpoint checks a permission codename; all four roles tested per endpoint | Permission test suite |
| NFR-31 | Rate limiting | OTP request and verify, login, password reset, share-link creation, export and test-send endpoints individually limited; 600 req/min/user general | API tests asserting 429 |
| NFR-32 | Transport and storage | TLS in transit; secrets and provider credentials encrypted at rest and write-only over the API; passwords hashed with the framework default | Configuration review; API tests asserting credentials are never returned |
| NFR-33 | File uploads | Validated by magic bytes, EXIF stripped, size-capped, served through a tenant-checked storage path; never executed | Unit tests with malicious fixtures |
| NFR-34 | Injection and XSS | Parameterised queries only; all rendering escaped; no user HTML is ever embedded; header values stripped of CR/LF | Static analysis; unit tests |
| NFR-35 | Public share links | Hashed tokens, expiry, revocation, `noindex`, no referrer, no enumeration | API tests |
| NFR-36 | PII in telemetry | No mobile number, name, note, address or amount in any analytics event or log line | Automated scan of event schemas and log samples |
| NFR-37 | Dependency hygiene | Only the ADR-021 allow-list; anything else requires an ADR; vulnerability scan on every build with no high or critical findings at release | CI dependency scan; ADR register |
| NFR-38 | Impersonation | Requires recorded tenant consent, is time-boxed, and writes an audit row | API tests; audit assertions |

### 18.8.5 Data, retention and observability

| ID | Requirement | Target | Verified by |
|---|---|---|---|
| NFR-39 | Ledger and stock immutability | Enforced by database trigger, not only by application code; only `status` and reversal links are updatable | Database-level test attempting an UPDATE |
| NFR-40 | Balance and stock integrity | Nightly recompute finds zero drift between denormalised and derived values | Scheduled job with alerting; 100,000-row test dataset |
| NFR-41 | Audit retention | Audit rows retained at least 12 months; append-only | Configuration and schema review |
| NFR-42 | Statutory retention | GST-relevant documents retained 72 months from the annual-return due date, surviving tenant deletion in an anonymised or legally-required form as documented in CC-7 | Deletion procedure review |
| NFR-43 | Export completeness | The `PLT-10` bundle contains every business entity of the tenant in a re-importable form | Export-and-reimport test |
| NFR-44 | Observability | Structured JSON logs carrying `request_id` and `tenant_id`; `/system/health` and `/system/version`; scheduler run outcomes recorded | Manual verification; log sampling |
| NFR-45 | Test coverage | Backend line coverage ≥ 80 % overall, ≥ 95 % on services that write money or stock; every FRD `T-` test implemented | Coverage report in CI |

## 18.9 Assumptions

Each assumption is stated with what happens if it proves false, because an unexamined assumption is a risk without an owner.

**A1** Merchants will accept a web application installed as a PWA rather than a native store app. *If false:* Capacitor wrappers move from Phase 3 into Phase 2 and the release train shifts by roughly six weeks.

**A2** A field agent — partner relationship manager, distributor salesman or Metis onboarder — will spend twenty minutes per merchant entering opening balances. *If false:* adoption stalls at the migration step regardless of product quality, and the answer is `IMP-04`-style importers and assisted onboarding, not more features.

**A3** English and Hindi are sufficient at launch. *If false:* the i18n architecture supports more locales without change, but translation, testing and support capacity must be funded before the next language ships.

**A4** DLT registration, a payment-aggregator contract, Meta business verification and a GSP relationship can each be obtained within their stated lead times when started at the beginning of the phase that consumes them. *If false:* the corresponding features remain config-gated and inert, which is why each sits behind an adapter and none is on a critical path.

**A5** The target segment is below the e-invoicing turnover threshold at launch. *If false for a specific tenant:* that tenant cannot legally use the product for B2B invoices until `SAL-12` ships in Phase 3, and this must be stated in sales conversations rather than discovered.

**A6** Weighted-average costing is acceptable to the target segment's accountants. *If false:* the costing method becomes a per-tenant setting, which is a schema and reporting change of significant size and a Class C decision.

**A7** A single-VPS deployment with PostgreSQL is sufficient for the launch cohort and the first partner. *If false:* ADR-019's Kubernetes path exists but is Phase 3 and would need to be pulled forward.

**A8** Merchants will not pay for the ledger alone, and will pay for multi-user access, stock depth and server-sent messaging. *If false in either direction:* the paid boundary described in Part 11 §11.2 moves, which is a commercial decision, not a product one — but it changes which Phase 2 features are urgent.

**A9** GST rules, slabs and thresholds will continue to change. *This assumption is certain to hold*, which is why rates carry effective dates, thresholds are settings rather than constants, and a compliance owner is a named role.

**A10** The BrandHub frontend conventions, `ml-uikit` primitives and the DigiKhaato ledger semantics are available and reusable as Part 0 §0.1 states. *If false:* the design-system and frontend-architecture estimates in Part 13 are understated by several weeks.

## 18.10 Constraints

**C1 Local-first deployment.** The product must run from a `docker-compose` stack of four services — `db`, `backend`, `scheduler`, `frontend` — on a single VPS or a developer's machine, and must be installable by a partner's own operations team (ADR-019).

**C2 Minimal third-party dependencies.** Only the libraries on ADR-021's allow-list may be used. Anything else requires an accepted ADR. This constraint exists to pass partner security reviews and to keep the maintenance surface small; it is the reason several otherwise-obvious library choices are absent.

**C3 No Celery, no Redis.** Scheduled and deferred work runs as idempotent `manage.py` commands driven by a 60-second scheduler loop, with a `platform_job` table and an `enqueue(task, payload)` abstraction so that a queue can replace the runner later without any caller changing (ADR-012).

**C4 No S3 or object storage at MVP.** Files are stored on local disk through Django's storage API; an S3-compatible backend is a settings switch only, from Phase 2 (ADR-013).

**C5 Client-side PDF.** Documents are rendered as React print components and produced through the browser's print path with tenant branding; public share links render the same view. Server-side PDF is Phase 2 and exists only because automated sending needs a file (ADR-014).

**C6 One data-layer pattern.** Redux Toolkit with per-feature slices and thunks calling service modules, exactly as the BrandHub Customer module does. TanStack Query is not used (ADR-004). One pattern, consistently applied, is worth more than a better pattern applied twice.

**C7 One UI foundation.** Tailwind CSS with `ml-uikit` `ML*` primitives and app-level `Ub*` wrappers; no second component library; a `Ub*` wrapper is created only when a pattern recurs in at least two features (ADR-002, Part 0 §0.11 rule 7).

**C8 Modular monolith.** One Django project, one application per module, PostgreSQL with shared schema and `tenant_id` scoping. No microservices (ADR-007, ADR-008).

**C9 Regulatory constants are configuration, not code.** GST slabs with effective dates, the e-invoice turnover threshold and reporting window, the e-way bill value threshold with state overrides, composition limits, the HSN digit rule, and the credit-note declaration deadline are all settings or data with effective dates.

**C10 Team and time.** Four to six engineers; Phase 1 in 20–24 weeks. The estimates in Part 13 assume the FRDs are complete before the build begins.

## 18.11 Dependencies and third-party surfaces

| Surface | Used for | MVP posture | Phase | Failure behaviour | Owner |
|---|---|---|---|---|---|
| SMS provider with DLT registration (MSG91, Kaleyra or equivalent) | OTP, transaction messages (`LED-08`), automated reminders (`LED-07`) | Adapter with `ConsoleSmsBackend`; provider optional | 2 for production sending | Message logged `skipped`; no flow blocks | Product + compliance |
| TRAI DLT registration | Principal entity, six-character service header, content templates | Started before launch; 2–4 week lead time | 1–2 | Without it, no SMS reaches any Indian number | Compliance owner |
| WhatsApp — `wa.me` deep links | Sharing statements, invoices, reminders | Live at MVP; free, manual, no approval | 1 | Falls back to SMS or copy-link | Product |
| WhatsApp Business Platform (Cloud API or BSP) | Server-sent Utility templates (`NTF-05`, `LED-12`) | Not at MVP | 2 | Channel disabled; deep links continue | Product |
| UPI — static and dynamic QR, intent links | Collection (`PAY-03`) | Live at MVP from the tenant's own VPA; no callback exists | 1 | None; generation is local | Engineering |
| Payment aggregator (Razorpay or equivalent) | Auto-posted payments, webhooks, unmatched queue (`PAY-06`, `PAY-07`) | Not at MVP; manual UTR entry instead | 2 | Manual recording remains the path | Product + finance |
| GSP / IRP | e-invoicing (`SAL-12`), e-way bill (`SAL-13`) | Not at MVP | 3 | Documented manual procedure during IRP downtime | Compliance owner |
| PostgreSQL 16 | Primary datastore | Required | 1 | None — it is the system of record | Engineering |
| Local disk (`MEDIA_ROOT`) | Attachments, generated exports | Required | 1 | Upload failure never blocks the parent write | Engineering |
| Browser print engine | All PDF output | Required | 1 | Public link renders the same view | Engineering |
| Hosting (single VPS, India region preferred) | Deployment | Required | 1 | Documented restore procedure | Operations |
| Error reporting (Sentry or equivalent) | Client and server errors | Optional, settings-gated (ADR-018) | 2 | Structured logs remain | Operations |
| Analytics sink | Product instrumentation | Console/no-op at MVP; events defined and emitted | 1–2 | Events are emitted and discarded; no flow depends on them | Product |

**Dependency rule.** No MVP flow may block on a third-party surface. Every adapter has a null or console implementation, every outbound attempt is logged with a status including `skipped`, and every feature that consumes an adapter has defined behaviour when the adapter is unconfigured. This is what allows Phase 1 to launch while contracts are still being signed.

## 18.12 Success metrics and instrumentation

### 18.12.1 Metrics

| Tier | Metric | Definition | Target |
|---|---|---|---|
| North star | Weekly transacting tenants | Tenants posting ≥ 5 ledger entries or ≥ 1 document in a week | Growth month on month; ≥ 40 % of onboarded tenants by week 4 |
| Activation | Time to first party | Sign-up completed → first party created | Median ≤ 5 min |
| Activation | Migration completion | Tenants with > 25 parties that commit a CSV import | ≥ 50 % |
| Activation | Ten parties with balances within 7 days | Cohort share | ≥ 70 % |
| Retention | Day 7 / Day 30 ledger activity | Share of onboarded tenants posting an entry | ≥ 60 % / ≥ 40 % |
| Depth | Invoice adoption | GST-registered tenants issuing ≥ 1 invoice in 30 days | ≥ 35 % |
| Depth | Second member invited | Tenants with > 1 active membership at 30 days | ≥ 20 % |
| Outcome | Receivables aged > 60 days | Share of total receivable, per tenant, quarter on quarter | Decreasing |
| Outcome | Days sales outstanding, wholesale cohort | Per tenant | −7 days over a quarter |
| Quality | Correction rate | Corrections as a share of entries posted | < 2 %; a rising rate indicates a usability defect |
| Quality | Crash-free sessions | Sessions without an uncaught error | ≥ 99.5 % |
| Quality | Support contacts per active tenant per month | Tickets ÷ active tenants | Decreasing after `HLP-01` |
| Partner | Active merchants as a share of partner portfolio | Per partner | Per contract |
| Commercial | Paid conversion and renewal rate | Of eligible tenants | Set at Phase 2 |

The qualitative criterion — at least half of pilot merchants reporting at day 45 that they no longer maintain the paper khata — sits above all of these, because it is the only direct measure of G1.

### 18.12.2 Instrumentation plan

Events follow the naming scheme `ub.<module>.<event>` defined in FRD §18 of each feature, emitted through a single client helper and a server-side equivalent. Every event carries `tenant_id`, `user_role` and `surface` (`mobile` or `desktop`). At MVP the sink is a console or no-op implementation: the events are defined, emitted and tested, and wiring a real sink is a configuration change. This is deliberate — instrumenting after launch means the first cohort is unmeasured, which is when measurement matters most.

**Rules.** No personal data in any event, ever: no mobile numbers, names, notes, addresses or raw amounts. Amounts are bucketed (`<100`, `100-999`, `1k-9k`, `10k-99k`, `1L+`). Every funnel event has a matching failure event with an `error_code`, because a funnel that only records success cannot explain a drop-off. Server-side events cover what the client cannot observe — scheduled sends, webhook outcomes, job completions. Dashboards exist for activation, the ledger-entry funnel, the invoice-issue funnel, import outcomes and messaging delivery before launch, not after.

## 18.13 Release criteria

The MVP is released when all of the following are true. The full operational checklist is Part 12 §12.8; this section is its contractual summary.

**R1 Scope.** All 74 MVP features present, or any absence formally cut under Part 12 §12.7 with a Part 39 decision-log entry. Every MVP feature's acceptance criteria demonstrated on the release candidate.

**R2 Correctness.** Zero balance drift and zero stock drift on the 100,000-row dataset. GST fixture suite green including a pre-22-September-2025 document. Invoice numbering verified under concurrency and across the financial-year boundary. Cross-tenant probe suite returning 404 on every endpoint. Idempotency replay suite green.

**R3 Non-functional.** Every NFR in §18.8 met and evidenced by its stated verification method, on the reference device and the throttled connection profile.

**R4 Quality gates.** Coverage thresholds met; every FRD `T-` test implemented; permission tests for all four roles on every write endpoint; zero critical accessibility violations; no high or critical dependency vulnerabilities.

**R5 Localisation.** Both locales complete with no missing keys; Indian number grouping and dd/mm/yyyy dates verified in both.

**R6 Operations.** The four-service stack brought up from a clean checkout and documented; scheduler tasks proven idempotent; a backup **restored** and timed, not merely configured; health and version endpoints live; on-call route agreed.

**R7 Compliance.** DPDP posture documented per CC-7; messaging compliance per CC-8 with DLT registration either complete or the channel provably inert; data export and deletion paths executed at least once end to end.

**R8 Demo.** The eight-minute script of Part 12 §12.6 executed end to end on the production build without apology.

**R9 Commercial and support.** Support ownership defined in writing with response targets; pricing published with a renewal commitment; partner configuration exercised with at least one real partner record; onboarding collateral available in both languages.

**R10 Pilot evidence.** Ten merchants through the pilot, of whom at least five report at day 45 that they no longer maintain the paper khata.

Phase 2 and Phase 3 release criteria are stated per phase in Part 13 §13.3 and §13.4 and are gated by the release train of §13.6.

## 18.14 Risks

Risks are registered in full in Part 36. The five that bear directly on the requirements in this document are noted here because they would change it.

**Adoption stalls at migration.** The product is only as good as the opening balances entered on day one, and entering them is manual. *Mitigation:* `PTY-10` and `IMP-01` with a validation preview that shows totals before commit; assisted onboarding as a partner obligation; the migration prompt on the dashboard for young tenants. *Would change:* A2 and the priority of `IMP-04`.

**Performance on the real device.** Every competitor in this category has shipped a version that hangs while entering transactions, and it is the top-ranked complaint. *Mitigation:* NFR-01 to NFR-12 as release gates on the reference device, not a developer laptop.

**A correctness defect in GST or the ledger.** One wrong filing or one changed balance destroys the trust proposition that Part 11 §11.2 rests on. *Mitigation:* immutability at the database level (NFR-39), drift detection (NFR-40), the fixture suite (R2), and the correction trail being visible to users rather than hidden.

**Partner dependency.** Phase 2's commercial model assumes a partner, and white-label demand in India is inferred from adjacent evidence rather than proven. *Mitigation:* `WLB-03` to `WLB-06` are gated on a named partner with signed intent (Part 13 §13.3 entry criteria); building them speculatively is explicitly disallowed.

**Scope drift into accounting.** The strongest gravitational pull on a product like this is towards a general ledger, one small feature at a time. *Mitigation:* N1 with its trigger, the freeze rule of §18.1, and the requirement that any future accounting be a projection over existing immutable data rather than a second source of truth.

## 18.15 Open questions register

Open questions are tracked here with an owner and the phase by which an answer is needed. An unanswered question is not a blocker unless its "needed by" has passed.

| ID | Question | Owner | Needed by | Notes |
|---|---|---|---|---|
| OQ-01 | Part 16 §16.15 states 67 MVP / 41 Phase 2 / 24 Phase 3 / 5 Future features and a total of 137; the row-by-row count is 74 / 37 / 19 / 1, totalling 131. Which is correct, and is the catalogue missing rows or is the summary wrong? | Product | Before build start | Per-row phase markers are treated as authoritative meanwhile (Part 12 §12.1). A documentation defect either way. |
| OQ-02 | Commercial model: flat annual per business with user-count steps, monthly subscription, or per-active-merchant to partners — and what is included free? | Product + commercial | Phase 2 entry | Determines what `PLT-15` must enforce and what `PLT-16` must bill. Research supports flat annual with the accountant as a free seat. |
| OQ-03 | Which SMS provider, and does DLT registration proceed under Metis Labs or per partner? | Compliance owner | Before launch | Per-partner registration changes `WLB-06`'s design and the template registry's scoping. |
| OQ-04 | Is a payment aggregator contracted directly by Metis or by each partner? | Product + finance | Phase 2 entry | Affects `PAY-06`'s settlement and reconciliation model and who holds merchant KYC. |
| OQ-05 | Hosting: Metis-operated multi-tenant, partner-hosted single-tenant, or both? | Operations + partner | Before first partner contract | Determines whether NFR-13's availability target is Metis's or the partner's obligation, and how upgrades are rolled out. |
| OQ-06 | Does the launch partner require data residency guarantees beyond India-region hosting? | Partner + compliance | Before first partner contract | May constrain the error-reporting and analytics surfaces of §18.11. |
| OQ-07 | Should the `staff` role's stock-adjustment permission be a per-membership flag at MVP, or should staff simply be unable to adjust until `PLT-12`? | Product | Before `INV-06` build | Part 14 §14.9 assumes a per-membership flag; this must be reflected in `PLT-05` and the permission model or explicitly deferred. |
| OQ-08 | Third language: which, and at what phase? | Product | Phase 2 exit | The i18n architecture is ready; translation and support capacity are not. |
| OQ-09 | Does the product need a "move entry to another party" correction preset, or is reversal-plus-new-entry acceptable? | Product + UX | Phase 2 | Noted as a future enhancement in `LED-03` §24; frequency in production telemetry should decide. |
| OQ-10 | Retention rule for `notifications_message_log` rows containing recipient numbers — how long, and is masking sufficient for DPDP? | Compliance owner | Before launch | Interacts with CC-7's deletion cascade and NFR-41. |
| OQ-11 | Pilot cohort composition: how many of each business type, and is at least one wholesale tenant with staff included? | Product | Before pilot | Without a staffed wholesaler the credit-limit, roles and aging features are untested against their intended user. |
| OQ-12 | Does `LON` (loans) belong in this product at all, or in a partner's? | Product | Phase 3 planning | Part 11 §11.3 item 7 distinguishes a merchant's own daily-collection book from UdhaarBook lending; the module's future should be reconfirmed before it is built. |

## 18.16 Approval

By approving this document the signatories accept the problem statement of §18.2, the goals and non-goals of §18.3 with their measurable targets, the functional scope of §18.6, the cross-cutting requirements of §18.7, the non-functional requirements of §18.8 as release gates, the assumptions of §18.9 and the constraints of §18.10, and the release criteria of §18.13. They further accept that amendments after approval follow the change-control process of §18.1 and Part 10 §10.7, that Class C changes to a module in build are held to the next phase boundary except for correctness and compliance defects, and that any reversal of a non-goal requires its stated trigger in Part 11 §11.3 to be demonstrably met and recorded in Part 39.

| Role | Name | Accepts | Date |
|---|---|---|---|
| Product owner | | Scope, goals, targets, release criteria | |
| Engineering lead | | Non-functional requirements, constraints, dependencies | |
| Compliance owner | | GST, DPDP, DLT and messaging requirements (CC-7, CC-8, §18.11) | |
| Launch partner representative | | White-label requirements (CC-2), support model, partner dependencies | |
