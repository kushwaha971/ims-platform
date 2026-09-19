# Part 2 — Product Vision

*This chapter states what UdhaarBook is trying to become, the principles that constrain how it gets there, how it is positioned against the two clusters of competitors that already exist, the wedge by which it enters the market, how a single product can honestly serve six kinds of business, what would make its position defensible, and — equally important — what it will never be.*

---

## 2.1 Vision statement

> **Every Indian business, of every type and every size, should be able to know exactly what it is owed, what it owes, what it holds and what it earned — from the phone in its pocket, in its own language, for a price it does not have to think about.**

That sentence contains four assertions worth making explicit, because each is a design constraint rather than a slogan.

*Every type.* The product is not a kirana app, a wholesaler app or a services app. Business type is a defaults-setter, never a fork in the codebase (Part 0 §0.2).

*From the phone.* Mobile is the primary surface, not a companion. The Indian market's mobile-first apps reach ten million registrations each while the desktop incumbents' top review complaint is the absence of a mobile app [R3 §2.2, §4.3]. But "mobile-first" does not mean "mobile-only": paid conversion in this market happens at the desktop counter, so the same application must run well on a billing PC [R3 #7, High].

*In its own language.* Vernacular support is present in the ledger half of the market and absent from the billing half [R2 §B.2]. Khatabook's own design lesson — that literal translations failed and Hinglish transliteration drove roughly 30% of non-English adoption [R2 §A.0] — is a product finding, not a localisation detail.

*A price it does not have to think about.* Renewal price increases are the single most cited pricing complaint across Busy, Marg, myBillBook, QuickBooks and Vyapar [R3 §3.3]. Predictability is a feature.

---

## 2.2 Mission

**UdhaarBook's mission is to collapse the four-app stack of the Indian small business — khata, bill book, stock register and WhatsApp — into one book of truth, and to do it so cheaply and so simply that not using it becomes the irrational choice.**

The de facto stack today is well documented: UPI QR plus soundbox for collection, WhatsApp for orders and reminders and invoice PDFs, paper or Khatabook for udhaar, Excel for stock and price lists, and Tally at the CA for GST [R3 §4.4]. The mission is not to replace that stack wholesale — that is the mistake that killed the storefront products — but to *become its centre* while accepting it as the integration surface. Software that does not import Excel, export to Tally, share over WhatsApp and reconcile UPI is fighting habit [R3 #4, High].

---

## 2.3 The ten-year view

Ten years out, the plausible end state is not "an Indian Zoho". It is an **operating record** — the authoritative, continuously-maintained, machine-readable account of what a small business does — with three layers built on top.

**Years 1–2: the book.** One product that a business runs its month on. Ledger, billing, stock, payments, compliance outputs. Direct and white-label delivery. The objective is *trust*: the numbers are right, the data never disappears, the app does not crash during billing.

**Years 3–5: the network.** Once a critical mass of businesses keep their books here, the interesting properties are relational rather than functional. A supplier and a retailer who both use UdhaarBook should not both key in the same invoice; a purchase bill issued by one can arrive as a draft at the other. Collection routes, distributor–retailer ordering and reconciled counter-party balances become possible because both sides of a transaction are on-platform. This is the direction Bizom approached from the brand side, with 800,000 retailers across 40-plus FMCG brands, and never completed because its retailer app is ordering-centric rather than books-centric [R3 §8.1].

**Years 5–10: the rails.** A business with two years of verified ledger, stock and GST history is an underwritable business. Every distribution owner in India already wants this — 45% of surveyed kiranas want credit support for working capital, Khatabook's entire thesis was free ledger → data → lend, and HDFC, Airtel and Bajaj Finance are assembling exactly these channels [R3 §4.4, §8.1]. The lesson from Khatabook, however, is decisive on *how*: lending must be a partner's product distributed through the platform, never the platform's own revenue thesis, because lending imports credit risk and regulatory whiplash that destroyed both Khatabook's economics and OkCredit's P2P product [R2 §B.4; R3 §7.4].

The ten-year vision is therefore: **UdhaarBook keeps the books; partners monetise the consequences.** Every strategic decision in Parts 1–23 should be checked against whether it makes the books more trustworthy and more complete, because that is the only asset that compounds.

---

## 2.4 Product principles

Each principle below is stated, justified from the research, and given a consequence pair — what we will do and what we will not do. These are binding on product decisions; a proposal that violates one needs an explicit, recorded exception.

### Principle 1 — The ledger is the spine

**Statement.** Every module exists to keep the party ledger true. A feature that does not ultimately improve what a business knows about who owes whom is a candidate for deletion.

**Justification.** The ledger is the one artefact that every Indian business already maintains, in every vertical, at every size. It is also the thing the deep products do worst: Zoho Inventory has no khata view at all, only invoice-centric receivables and a statement PDF [R1 §A.21, §E.2]. Khatabook proved 50 million installs of the ledger alone [R2 §A.0].

**We will** make `LedgerEntry` a first-class primitive that can be created directly, without an invoice, and make every document — invoice, purchase bill, payment, credit note, expense paid to a party — post into it automatically with a link back to its source (Part 16, LED-10).
**We will not** build any module whose data cannot be traced into or out of the party ledger, and we will not ship a "receivables report" as a substitute for a running khata.

### Principle 2 — Immutable truth, visible corrections

**Statement.** Financial records are never edited or deleted in place. Corrections post a reversal and a replacement, and the history is visible.

**Justification.** The second-most-dangerous complaint category across Indian products is data integrity: "missing data, mismatched totals at audit", "calculation errors — cost me thousands", Busy's lack of auto-save [R3 §2.2, §2.3, #11]. Once trust in the numbers breaks, the accountant advises switching. Zoho's counter-example is instructive: every transaction carries Comments & History and an audit trail with old and new values, and this is listed among the things it does well [R1 §E.3].

**We will** enforce immutability on `LedgerEntry` and `StockMovement` at the model layer, implement corrections as reversal plus `supersedes_id` replacement with a mandatory reason, wrap every state change in `transaction.atomic()`, and write an `AuditLog` row through the service layer (Part 0 §0.11).
**We will not** expose a hard delete on any financial row, and we will not let the client compute an authoritative total.

### Principle 3 — Progressive disclosure by business type

**Statement.** A business sees only the modules it has turned on. Complexity is opt-in and reversible.

**Justification.** Zoho's third-ranked complaint is clutter — "doesn't allow removing unneeded features"; "I see a lot of tools I don't really know how to use" [R1 §E.1 #3]. Khatabook is criticised on the same axis as it adds features: "interface is denser… can overwhelm less tech-savvy owners" [R2 §D #14]. And 52.6% of Indian MSMEs say finding the right tool is hard while 36.8% struggle to set one up [R3 §7.2].

**We will** seed module toggles from the onboarding business-type choice, let a services business run with inventory entirely hidden, and keep the ledger-only mode a first-class configuration rather than a degraded one.
**We will not** ship a settings screen as the answer to complexity, and we will not gate a module behind a plan in a way that leaves dead UI visible to a user who cannot use it.

### Principle 4 — Offline tolerance is a correctness requirement

**Statement.** Writes must feel instantaneous and must survive a bad network. Indian retail counters and wholesale godowns do not have reliable connectivity.

**Justification.** "App slow / hangs / crashes while entering transactions" is the third-ranked pain point across the category, named for Khatabook, Swipe and myBillBook alike [R2 §D #3]. Vyapar is *praised* for full offline operation and myBillBook is *criticised* for requiring stable internet [R3 §2.2]. Indian SMB "cloud" demand is really "multi-device plus backup plus accountant access", with offline tolerance as a hard constraint [R3 §1.4].

**We will** budget for a 2 GB Android device, keep local-first write semantics with client-generated UUIDs and a sync cursor (Phase 2 offline queue, ADR-020), lazily load history, and treat median entry-persist latency as a tracked SLO.
**We will not** add a feature to the entry path that requires a round trip before the user sees their balance update.

### Principle 5 — Vernacular is product, not translation

**Statement.** The words on the screen are the product's interface to a 45–54-year-old owner-operator who does not think in English accounting vocabulary.

**Justification.** India SME Forum's survey of 7,835 MSMEs finds 91% of respondents aged 45–54 [R3 §4.2]. Khatabook ships 12–13 Indian languages and reports that literal translation failed while Hinglish transliteration worked [R2 §A.0]. Vyapar's reviewers complain of "missing multilanguage support" in a *billing* product [R2 §D #10].

**We will** ship `en` and `hi` at MVP with ICU messages, use the vernacular vocabulary fixed in Part 0 §0.2 ("You gave", "You got", "Baaki", "Hisaab", "Party"), and require Hinglish synonyms in help search (HLP-01).
**We will not** machine-translate GST or accounting content, and we will not ship a language in the ledger that is missing from the billing screens.

### Principle 6 — Price for predictability, never meter the habit

**Statement.** Pricing is flat per business with user-count steps, published, and grandfathered at renewal. The ledger is never metered.

**Justification.** Renewal hikes are the top pricing complaint across five products [R3 §3.3]. Zoho's document-count caps — sales orders *and* invoices *and* POs *and* bills, separately, with a wholesaler doing 20 invoices a day exhausting the Standard plan — generate its loudest pricing complaints [R1 §Part B observations, §E.1 #1]. OkCredit caps daily transactions on its free tier and charges ₹30/month to remove the cap, which the research explicitly flags as something UdhaarBook should not copy [R2 §A.1 F3].

**We will** price by users and outlets, publish prices, hold renewal at the original price, include the CA seat free in every tier, and keep entry creation unlimited on every tier including free.
**We will not** cap ledger entries, invoices or parties as a monetisation lever, and we will not run advertisements — the most-hated pattern in the free tier of this category [R2 §D #1].

### Principle 7 — Meet the existing stack where it lives

**Statement.** WhatsApp, UPI, Excel and Tally are the integration surface. They are not competitors and not legacy.

**Justification.** [R3 #4, High] states it directly: integration priority is WhatsApp share/remind, UPI collection with ledger auto-settlement, Excel import/export, Tally XML export; e-commerce and shipping are segment-specific and can wait. Inability to export to Tally is itself a switch trigger for growing firms [R3 §3.3].

**We will** ship WhatsApp deep-link sharing and CSV import/export at MVP, UPI QR and intent links at MVP with aggregator reconciliation in Phase 2, and Tally XML in Phase 3.
**We will not** build an online storefront, a marketplace sync or a shipping integration before a specific partner pays for it — MyStore, OkShop and the Dukaan kirana product all shut [R3 #13, High].

### Principle 8 — One chassis for every entity

**Statement.** Statuses, audit history, attachments, comments, custom list views, import/export, bulk actions, PDF templates and share links are designed once and applied to every entity from the start.

**Justification.** This is the sharpest engineering lesson from Zoho's decade: the company spent 2025–26 retrofitting exactly this chassis onto its late modules — purchase receives, returns, transfer orders, packages [R1 §C.3 lesson 2]. Status granularity likewise grows under pressure; the purchase order gained In Transit, Yet to be Received and Billed a decade after launch [R1 §C.3 lesson 3].

**We will** define the canonical status vocabularies up front (Part 0 §0.7), give every business entity an audit trail and an export, and add new modules by instantiating the chassis.
**We will not** ship a module with a bespoke status model, a bespoke list page or no audit trail because it is "simple".

### Principle 9 — Support is a product surface

**Statement.** Self-service help, guided setup and honest status reporting are features with owners and budgets, not a cost centre.

**Justification.** Support is the lowest sub-score for every Indian product measured, and Marg's 3.2-star average with a 2.9 support score is a channel-service failure rather than a product one [R3 §2.1, #2, #9]. Zoho's complaint list includes "bug reports closed without explanation" and community threads unanswered for years [R1 §E.1 #6].

**We will** ship an in-app help centre with contextual per-screen articles and four guided tours in Phase 2 (HLP-01/02/03), WhatsApp support in regional languages, and a public status page; in white-label deals support ownership is contractual, partner L1 and Metis L2.
**We will not** treat documentation as a launch afterthought or route a merchant to a community forum as a primary support channel.

### Principle 10 — Compliance is configuration

**Statement.** No statutory threshold, rate or date is a constant in the source code.

**Justification.** India generated GST (2017), e-invoicing (2020), repeated e-way-bill iterations, the 22 September 2025 slab restructure, and Income Tax Act 2025 TDS/TCS sections inside nine years [R1 §C.3 lesson 6, §A.24]. Invoices dated before 22 September 2025 must still compute at the old slabs, so rate history by effective date is mandatory, not optional [R2 §C.1]. The dossier supplies an explicit list of constants to keep configurable [R2 Appendix].

**We will** model `TaxRate` with effective dates and cess, keep e-invoice, e-way-bill, composition, HSN-digit and credit-note-deadline thresholds in tenant or platform settings, and version them.
**We will not** hard-code a rate, a threshold or a compliance date anywhere in the application.

---

## 2.5 Positioning statement

> **For** Indian small businesses of any type that run on credit and are tired of keeping their khata, their bills, their stock and their GST in four different places,
> **UdhaarBook is** a mobile-first business book
> **that** keeps one running account per party and feeds it automatically from GST-compliant billing, inventory and UPI payments,
> **unlike** free khata apps that stop at the ledger and paid billing suites that treat udhaar as a report,
> **because** it is built ledger-first for the phone, priced flat and predictably, available in the owner's own language, and delivered either directly or under a partner's brand.

The competitive landscape divides into two clusters that do not overlap well [R2 §B.4]. Ledger-first products — Khatabook, OkCredit — are free or near-free, multilingual, phone-only and weak at inventory and GST. Billing-first products — Vyapar, myBillBook, Swipe, Zoho, and the desktop incumbents Tally, Busy and Marg — are paid, English or English-plus-Hindi, desktop-heavy, and treat udhaar as receivables. Plotted on two axes — *ledger depth* against *billing and inventory depth* — the upper-right quadrant is empty. That quadrant, entered from the ledger side at a mobile price point, is UdhaarBook's position.

---

## 2.6 The wedge strategy

The wedge is a sequencing argument: **start where demand is proven and free, expand into where willingness to pay is proven and dear.**

**Step 1 — Enter at the ledger, where Khatabook proved demand.** Khatabook reached 50 million installs, 10 million monthly actives and 264 million customer records [R2 §A.0]. That is not a hypothesis about demand; it is a measurement. Entry cost is low because the feature set is small and the value is immediate: a merchant sees their own dues on day one. UdhaarBook's MVP ledger is deliberately at or above Khatabook free-tier parity — parties, gave/got entries, running balance, opening balance, statement PDF, collection date with D-1/D0 reminders, WhatsApp share, UPI QR, multiple businesses, app lock, account deletion [R2 Appendix] — plus the things Khatabook's users complain are missing: no ads, no loan banners in the core flow, corrections with audit rather than deletes, soft delete with restore, and party tags for area and route [R2 §D #1, #4, #8, #17].

**Step 2 — Expand into billing and stock, where Zoho and Vyapar proved willingness to pay.** The same merchant, three weeks later, needs a bill. In Khatabook that requires a reseller-sold licence; in UdhaarBook it is a toggle. The expansion is natural because the ledger already holds the parties, and the invoice posts straight into the khata the merchant already trusts. The revenue evidence is direct: Vyapar earns ₹69 crore and myBillBook and Zoho both sustain paid bases in the ₹3,400–₹4,000 and ₹18,000–₹60,000 bands respectively [R3 §3.1, §3.4].

**Step 3 — Anchor with compliance, where the CA makes the switching decision.** GST-compliant invoicing plus a GST summary, sales and purchase registers and a CSV/Excel hand-off at MVP; GSTR-1 JSON in Phase 2; Tally XML and e-invoice in Phase 3. GST compliance is the reason SMBs buy at all, and e-invoice and e-way bill are the tier-up triggers [R3 #8, High].

**Step 4 — Scale through partners, where distribution already exists.** Reseller channel is the proven Indian SMB GTM and every merchant-facing distribution owner has a motive: engagement, reconciliation of its own rails into the merchant's books, and underwriting-grade ledger data [R3 §8.2, #12].

Each step is monetisable on its own and each makes the next one cheaper. That is what makes it a wedge rather than a roadmap.

---

## 2.7 The business-type-agnostic design stance

The hardest design question in this specification is how one product serves a kirana store, a wholesale trader, a services professional and a small manufacturer without becoming either a fork farm or Zoho's undifferentiated clutter. The answer has three parts.

### What is common — the invariant core

Every one of these businesses has: *parties* it deals with, who may be customers or suppliers or both; *money owed in both directions* with a running balance and an ageing profile; *documents* with numbers, lines, taxes and statuses; *payments* in several modes that must allocate against documents; *expenses*; and *statutory outputs* driven by a GSTIN and a place of supply. These are the same objects with the same rules regardless of vertical. They are what the data model in Part 21 encodes, and none of them varies by business type.

The vocabulary is also common, and it is Tally's vocabulary rather than Western accounting's: *party*, *udhaar*, *jama*, *hisaab*, *baaki*, *kachha* and *pakka bill* [R2 §C.4]. A wholesaler, a kirana and a garment retailer all use these words. A services professional uses fewer of them but is not confused by them.

### What is tuned — the business-type profile

The onboarding business-type selection writes a defaults profile onto `Tenant`. It sets which modules are on, which document kinds appear first, which units are offered, which party label is shown, what the default due-days are, and which dashboard tiles matter. Illustratively:

| Business type | Inventory | Primary document | Default units | Party label | Dashboard emphasis |
|---|---|---|---|---|---|
| Retail / kirana | On, single location | Tax invoice or bill of supply; thermal print default | NOS, KGS, PAC, BOX | Customer | Today's sales, to collect, low stock |
| Wholesale / distribution | On, credit-heavy | Tax invoice, A4; delivery challan (P2) | BAG, BDL, BOX, QTL, TON | Party | To collect, overdue, credit limits, top debtors |
| Services / professional | **Off** | Tax invoice with SAC; estimate | NOS, HRS-equivalent | Client | To collect, overdue, this month's billing |
| Trader | On, margin-sensitive | Tax invoice; purchase bill | Varies | Party | Purchase price history, margin, to pay |
| Small manufacturer / job-worker | On | Tax invoice; purchase bill; delivery challan (P2) | KGS, MTR, NOS, SET | Party | Stock on hand, to pay, job-work movement |
| Micro / unregistered | Optional | Estimate (kachha bill) only | NOS, KGS | Customer | To collect, due today |

None of these choices is irreversible and none of them is enforced in business logic. A services firm that starts stocking spare parts turns inventory on; nothing migrates, because the schema was always the same.

**The rule is explicit: business type seeds defaults and never gates behaviour.** This is stated normatively in Part 0 §0.2 and it is the single sentence that prevents this product from becoming six products.

### What is genuinely vertical — and therefore deferred

Two capabilities are genuinely vertical rather than tunable: batch and expiry tracking (pharma, FMCG, food) and route/salesman collection flows (distribution). The research is clear that vertical fit wins in distribution and that a horizontal MVP cannot displace Marg in pharma [R3 #10, Medium]. These are therefore Phase 3 modules (INV-16, LED-15), designed as optional per-item and per-tenant capabilities rather than as separate editions. Composite items and BOM are Future for the same reason and because manufacturing/MRP remains the most-voted, never-committed idea on Zoho's own forum after ten years [R1 §C.2].

---

## 2.8 The moat thesis

Feature parity is not defensible in this category; every competitor can copy a screen in a quarter. Four things compound instead.

**1. The ledger graph.** Once both sides of a trade keep their books in the same system, the counter-party relationship itself becomes an asset — reconciled balances, pre-filled purchase bills from a supplier's invoice, distributor-to-retailer ordering. This is a network effect that no single-sided billing product can retrofit, and it is the reason the ledger, not the invoice, is the spine.

**2. Trust, accumulated.** Data integrity is the complaint that causes switching, and the absence of that complaint is slow to build and slow to lose [R3 #11, Medium-high]. A product with two years of verifiable, immutable, audit-trailed history and no balance-discrepancy incidents has something a new entrant cannot purchase.

**3. The partner channel.** Reseller and white-label relationships have switching costs on the partner's side — branding, support processes, merchant onboarding, contractual entitlements — that are far higher than an individual merchant's. Tally's 28,000 partners and Vyapar's 27,000 are the moat those companies actually have [R3 §8.1].

**4. Compliance as a treadmill others must also run.** Continuous GST, e-invoice and DPDP work is a fixed cost that punishes small entrants and rewards whoever has already built the configuration machinery [R1 §C.3 lesson 6]. It is not glamorous, but it is the reason QuickBooks exited India rather than localise [R3 §7.4].

What is explicitly *not* a moat: language coverage (copyable), UI quality (copyable), price (a race to zero that Khatabook already lost), and lending (a liability, not an asset).

---

## 2.9 Explicit non-goals

The following are things UdhaarBook will not do. Each has a reason and, where relevant, a re-entry condition.

| Non-goal | Reason | Re-entry condition |
|---|---|---|
| **Full double-entry general ledger, P&L and balance sheet at MVP** | The target user does not keep a chart of accounts; the CA does. Zoho keeps GST returns in a *separate* product for the same reason [R1 §E.2] | Future phase, only if the accountant persona becomes a paying buyer in its own right |
| **Online storefront / ONDC catalogue** | MyStore, OkShop and Dukaan's kirana product all shut; demand among kiranas is weak [R3 #13, High] | Partner-funded add-on only |
| **Lending as a first-party revenue line** | Khatabook loses >₹100 Cr/yr on the thesis; OkCredit became profitable only after abandoning it; loan complaints dominate Khatabook's reviews [R2 §A.0, §A.1 F20, §B.4] | Partner-distributed, opt-in, isolated from ledger UX (Phase 3 LON-*) |
| **Advertising in any tier** | The single most-hated pattern in the free tier of this category [R2 §D #1] | Never |
| **Metering ledger entries, invoices or parties** | OkCredit's daily-transaction cap and Zoho's document caps are their loudest pricing complaints [R1 §E.1 #1; R2 §A.1 F3] | Never |
| **Marketplace / e-commerce channel sync (Shopify, Amazon, Meesho)** | Segment-specific; not requested in any Indian SMB review sampled [R3 §6] | Phase 3+ and only for an e-commerce-seller segment with paying demand |
| **Shipping-carrier integrations** | Rated "low" expectation for the core ICP [R3 §6] | Partner-specific |
| **Bins, picklists, putaways, move orders** | Zoho added these in years 9–10; SMBs waited a decade and did not churn over it [R1 §C.3 lesson 1, §E.1 #10] | Phase 3+ for multi-godown distributors only |
| **Payroll and attendance** | Khatabook put this in a separate app (Pagarkhata) for good reason — different buyer, different workflow [R2 §A.0] | Separate product or partner integration |
| **Multi-currency and international editions at MVP** | Adds tax-engine and rounding complexity for a segment that does not exist yet; architecture keeps it configurable [Part 0 §0.1] | Second-country launch |
| **A community forum as a support channel** | Zoho's forum demonstrates the moderation debt: ten-year-old unanswered threads [R1 §D.4] | Never; WhatsApp support plus in-app help instead |
| **Machine-translated compliance content** | Machine-translated GST and accounting text is a liability; do 3–5 human-reviewed languages instead [R1 §D.4] | Never |
| **Celery, Redis, TanStack Query, MUI and anything else outside the dependency policy** | One data-layer pattern, one UI system, one scheduler abstraction; complexity is the enemy of a small team shipping 67 features | ADR required (Part 0 §0.4, ADR-021) |

The discipline these non-goals encode is the same one the competitive history teaches: every company in this category that lost, lost by expanding sideways into a second product before the first one monetised. Khatabook built a storefront, then a payments company, then a lender. OkCredit built a storefront, then a P2P investment product. Dukaan pivoted out of kirana entirely [R3 §7.4]. The vision in this chapter is narrower on purpose.
