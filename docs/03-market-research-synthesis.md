# Part 3 — Market Research Synthesis

*This chapter synthesises the Indian SMB software market from research dossiers R2 (Khatabook and Indian ledger apps) and R3 (Software Advice, Capterra and market sizing). It establishes how large the market is, how it segments, what has made it addressable now, what forces businesses to buy, what they will actually pay, why the free-to-paid transition has broken every company that attempted it, how software reaches these buyers, what language and region demand, and which statutory obligations constrain the design. It closes with ten numbered market findings, each with its implication for DigiKhaato and a confidence rating.*

---

## 3.1 Market size and segmentation

Two independent ways of sizing this market produce numbers that do not reconcile, and the discrepancy is itself informative.

**Top-down**, syndicated research puts the India inventory-management software market at US$180.8M in 2025 growing to US$457.9M by 2033 at 12.8% CAGR, and the India accounting-software market at US$698.9M in 2025 growing to US$1,497M by 2034 at 8.8% CAGR with SMEs holding 65% share and software 71% of spend [R3 §7.3]. A third source claims US$21.86B by 2030, which is implausible against the other two and is treated as an outlier [R3 §7.3]. Even the credible figures are unreconciled with known vendor revenues: the India inventory number of roughly ₹1,500 crore is only consistent with the sum of Tally, Busy, Marg, Zoho India, Vyapar (≈₹70 Cr) and myBillBook if Tally's India revenue is a very large share of the total [R3 §7.3 caveat].

**Bottom-up** is more useful for planning. There are 7.83 crore Udyam-registered MSMEs as of 28 February 2026, up from 0.79 crore in FY22, and 1.67 crore active GST taxpayers as of 30 June 2026 — 1.49 crore regular and 13.6 lakh composition [R3 §7.1]. Kirana stores alone number 12–20 million and carry 75–78% of consumer-goods sales and over 90% of FMCG grocery [R3 §7.1]. The realistic addressable base for a paid product is not the 7.83 crore Udyam registrations, most of which are single-person informal enterprises; it is closer to the **1.49 crore regular GST registrants**, of whom some meaningful fraction runs a counter, employs staff and files returns. At an ASP of ₹4,000–₹15,000 and penetration in the low single digits, the serviceable revenue opportunity is in the low thousands of crores — large enough to build a substantial company, small enough that no single vendor has yet found it profitable at scale.

The demand side segments cleanly into six populations, which are the six business types the product must serve [R3 §4.1]:

| Segment | Size profile | Runs today on | Device | Operated by |
|---|---|---|---|---|
| Kirana / general store | Owner + 0–2 helpers; ₹10–50 L turnover; often below GST threshold or composition | Paper bahi-khata; Khatabook/OkCredit free; Paytm/PhonePe for UPI | Android phone; sometimes a ₹8–15k Windows PC | Owner |
| GST-registered retailer (garments, electronics, hardware, pharmacy) | 2–10 staff; ₹40 L–₹5 Cr | Vyapar/myBillBook desktop, Busy Start/Smart, Marg (pharma), Tally Silver | Windows PC + phone | Owner + billing staff; CA files from exports |
| Wholesaler / distributor / sub-stockist | 5–30 staff; ₹2–50 Cr; multiple godowns; salesmen on routes | Tally Gold, Busy Power, Marg Gold; brand-supplied DMS (Bizom, FieldAssist) | Windows LAN + salesman Android | Accountant + salesmen + godown staff |
| Services / freelancers (repair, salons, agencies, CA, legal) | 1–10 | Zoho Books Free/Standard, myBillBook, Vyapar | Phone/laptop | Owner |
| Small manufacturer / job-worker | 5–50; BOM, job-work, e-way bills | Tally Gold + Excel; Busy Power; Zoho Inventory Professional | Windows | Accountant + owner |
| E-commerce / D2C seller | 2–20 | Zoho Inventory/Books, Unicommerce, Shopify + Shiprocket | Cloud/web | Ops staff |

Two facts about this table drive product decisions. First, reviewer demographics for Indian products cluster at **2–10 and 11–50 employees**, with TallyPrime skewing to mid-market accountant users [R3 §4.2]. Second, India SME Forum's survey of 7,835 MSMEs finds **micro 59%, small 33%, medium 7%**, with 91% of respondents aged 45–54 [R3 §4.2]. The buyer is a middle-aged owner-operator of a micro or small business — not a digital native, not an accountant, and not the persona most SaaS design assumes.

The supply side is bimodal and the two modes barely compete [R3 §0.1]. A **desktop accounting incumbent tier** — TallyPrime with 2.5M+ businesses sold through 28,000 partners, plus Busy and Marg — prices at ₹8,000–₹68,000. A **mobile-first billing and khata tier** — Vyapar, myBillBook, Khatabook, Swipe — prices at ₹0–₹4,000 a year with 10M+ claimed registrations each. The gap between them, described in the competitor dossier as the "multi-app trap" [R2 §B.4], is DigiKhaato's target.

---

## 3.2 The MSME digitisation curve

The single most important structural fact in this research is that Indian MSMEs have digitised **payments** and not **records**, and the gap between the two is the market.

The evidence is consistent across three independent surveys. India SME Forum and Meta's "State of Digitalisation" (n=7,835, 2024-25) finds 53.8% of MSMEs using some digital or e-commerce tool and **46.2% fully offline**, with over 90% accepting digital payments, only 18% having accessed digital lending, 52.6% saying they struggle to find the right tools, 36.8% struggling to set them up, 97.3% unaware of government schemes, and a digital maturity index of 58 out of 100 [R3 §7.2]. CPM's Kirana 2025 study (n=4,593) finds 93% "digital-ready" in Tier 2 cities but only **22% planning any technology investment in 2025**; among those 22%, 45% target inventory tracking and 47% online ordering, while 45% want credit support for working capital and 89% want better trade margins; 86% cite quick commerce as their top competitive challenge [R3 §7.2]. Software Advice's US buyer data, directionally applicable, finds that **41% of inventory-software buyers came from manual methods and 26% from spreadsheets** — two-thirds are switching from paper or Excel, not from another product [R3 §1.2].

The interpretation is stated plainly in the dossier: *"payments digitisation is done; record-keeping digitisation is not. The gap between '>90% accept UPI' and '22% plan any tech investment' is the market"* [R3 §7.2].

That gap has a shape. It is not that these businesses reject software; it is that the cost of *finding, choosing, setting up and learning* software exceeds the perceived benefit for a business whose current system — a notebook and a phone — mostly works. Fifty-two point six percent say finding the tool is hard. This has three product consequences: onboarding must be ruthlessly short, the first session must produce visible value (a balance the owner recognises), and setup assistance — vernacular, WhatsApp-based, or partner-delivered — is a distribution asset rather than a support cost [R3 #14, Medium-high].

It also means the competition for a new product is rarely another product. It is paper, and paper has zero acquisition cost, perfect uptime, no learning curve and no subscription. The only reliable ways to beat paper that appear in this research are **collections** (software that gets money in faster saves cash) and **compliance** (software that avoids a GST problem saves time and penalty) [R2 §D structural churn drivers].

---

## 3.3 Enabling conditions: smartphone, UPI and WhatsApp penetration

Three infrastructure facts make an Indian SMB product viable today in a way it was not five years ago.

**UPI has eliminated the payments problem.** August 2026 volume was 24.51 billion transactions worth ₹29.82 lakh crore, growing 22% year on year, at 791 million transactions a day, averaging ₹1,217 each [R3 §7.1]. Merchant discount rate on UPI is zero by government mandate, which means collection through UPI costs a small business nothing [R2 §C.2]. For DigiKhaato this is doubly significant: it removes the need to build or acquire a payments rail, and it creates the reconciliation problem that becomes a differentiator — payments to a static QR carry no party context, so a ledger app must maintain an unmatched-payments queue and learn payer-VPA-to-party mappings [R2 §C.2].

**WhatsApp has eliminated the distribution problem for documents.** India has 535 million WhatsApp users and 15 million active WhatsApp Business accounts [R3 §7.1]. Every Indian product in the category leads with WhatsApp sharing, and reviewers treat its breakage as a bug rather than a missing nicety — blank WhatsApp PDFs are a top Vyapar complaint precisely because the feature is used constantly [R3 §2.2, §6]. The `wa.me` deep link is free, needs no approval, and requires no server integration; it is the correct MVP mechanism [R2 §C.3]. Server-sent automation is a different and much more expensive proposition, covered in §3.9.

**Android has eliminated the hardware problem for the micro segment, but not for the counter.** Mobile-first apps claim 10M+ registrations (Vyapar), 1 crore+ businesses (myBillBook) and 50M+ downloads (Khatabook) [R3 §4.3]. Reach is mobile. But **paid conversion is desktop-led**: Vyapar's free tier is mobile-only and its first paid tier is Desktop Silver; myBillBook's "most popular" Pro plan's headline feature is the desktop app [R3 §4.3, #7]. Counter billing with a barcode scanner, a thermal printer and a keyboard is a desktop job. Meanwhile Tally's number-one G2 gap is the missing mobile app — and what that accountant base wants is mobile *viewing*, not mobile *entry* [R3 §4.3].

The synthesis for DigiKhaato: mobile is the acquisition product, the counter is the conversion product, and the same responsive application must serve both. Do not ship mobile-only [R3 #7, High].

---

## 3.4 The GST compliance forcing function

GST is the reason Indian SMBs buy software at all [R3 #8, High]. It is also the mechanism by which a business that was managing on paper is forced, on a known schedule, into a software decision. The specification must therefore encode GST correctly and — more importantly — configurably.

### The slab restructure of 22 September 2025

GST 2.0, effective 22 September 2025, restructured the rate slabs to **0%, 5%, 18% and 40%** (the last for sin and luxury goods), retaining special rates of **3%** for gold, silver and jewellery and **0.25%** for rough diamonds. The 12% and 28% slabs were abolished: approximately 99% of 12% items moved to 5% and approximately 90% of 28% items moved to 18%, with the remainder moving to 40%. Compensation cess on tobacco continues [R2 §C.1].

The engineering consequence is absolute and is stated in the dossier: *"Software must keep rate history by effective date because invoices dated before 22 Sep 2025 use old rates"* [R2 §C.1]. A credit note issued today against an invoice dated August 2025 must compute at the old slab. Zoho's own response to this event is instructive — it shipped a bulk "GST slab revision tool" to update item rates [R1 §A.1] — and confirms that this is a recurring class of event rather than a one-off.

### The mechanics the invoice engine must implement

**GSTIN** is a 15-character identifier: two-digit state code, ten-character PAN, one entity-number character, a literal `Z`, and a checksum. The regex is `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`, and the checksum uses a base-36 alternating-weight algorithm; both must be validated client-side, with existence verification via the GSTN public search API or a GSP [R2 §C.1].

**Place of supply** determines the tax split. If the supplier's state (derived from its GSTIN) equals the place-of-supply state, the supply is intra-state and the rate splits equally into CGST and SGST (UTGST for union territories without a legislature); otherwise it is inter-state and the full rate is charged as IGST. Place of supply for goods is the delivery location; for services it is generally the recipient's registered location for B2B or the address on record for B2C. The invoice must carry the place-of-supply state name and code when inter-state [R2 §C.1].

**HSN and SAC** codes determine the rate — the rate is a property of the code, not of the item name. Since 1 April 2021, businesses with turnover up to ₹5 crore must show 4-digit HSN on B2B invoices; above ₹5 crore, 6-digit on all invoices. GSTR-1 Table 12 requires an HSN-wise summary [R2 §C.1].

**Rule 46 mandatory fields** define what a tax invoice must contain: supplier name, address and GSTIN; a consecutive serial number of at most 16 characters, unique per financial year, alphanumeric with only `/` and `-` permitted; date; recipient name, address and GSTIN if registered, or name, address and state for unregistered recipients where value is ₹50,000 or more; HSN/SAC; description; quantity with UQC; total value; taxable value after discount; rate and amount of CGST, SGST, IGST and cess separately; place of supply with state name for inter-state; delivery address if different; a reverse-charge flag; and a signature or digital signature — the last not required where an e-invoice IRN exists [R2 §C.1].

**Composition dealers** cannot charge GST or claim input tax credit and must issue a **Bill of Supply** bearing the prescribed declaration. Thresholds are ₹1.5 crore aggregate turnover (₹75 lakh in special-category states) for traders, manufacturers and restaurants, and ₹50 lakh for services-only composition at 6%. Rates are 1% for traders and manufacturers, 5% for restaurants, 6% for service providers. Filing is CMP-08 quarterly plus GSTR-4 annually [R2 §C.1]. This is why `Tenant.gst_type ∈ {unregistered, composition, regular}` drives document kind and tax rendering (Part 0 §0.2).

**Credit and debit notes** under Section 34 may be issued against one or more invoices. A credit note reduces the supplier's output tax **only if declared in GSTR-1 by 30 November following the end of the financial year**, with the recipient reversing input tax credit; otherwise it is a financial credit note with no GST effect [R2 §C.1]. That deadline is a configurable constant.

### e-Invoicing and e-way bills as tier-up triggers

**e-Invoicing (IRN)** is mandatory for taxpayers with aggregate turnover above **₹5 crore** in any financial year since 2017-18, covering B2B, export, SEZ and B2G supplies plus credit and debit notes against them. It does not apply to B2C, and banks, NBFCs, insurers, goods-transport agencies, passenger transport, cinemas and SEZ units are exempt. Once applicable, always applicable. The **30-day reporting window** applied to AATO ≥ ₹100 crore from November 2023 and extended to AATO ≥ ₹10 crore from 1 April 2025; some advisers read the current rule as applying at ₹5 crore, so the dossier explicitly instructs that this be configurable rather than hard-coded [R2 §C.1]. An invoice without an IRN where one is required is not a valid invoice and the buyer loses input tax credit — which is why this is a tier-up trigger rather than a nice-to-have. As of June 2026, 8.56 lakh GSTINs generate IRNs, producing 21.4 crore IRNs in that month alone [R3 §7.1].

**e-Way bills** are required for movement of goods with consignment value above **₹50,000** including tax, with some states applying lower intra-state thresholds. Part A carries invoice, HSN and value; Part B carries vehicle and transporter details. Validity is one day per 200 km, revised from 100 km in 2021 [R2 §C.1]. Cumulative e-way bills from April 2018 to May 2026 stand at 791.8 crore [R3 §7.1]. Vyapar's users specifically ask for mobile e-way generation, which is Swipe's stated differentiator [R2 §C.1; R3 §5 #7].

**Returns** are the ultimate output. GSTR-1 (outward supplies, monthly, or quarterly under QRMP for turnover up to ₹5 crore with an optional Invoice Furnishing Facility in the first two months) requires B2B invoice-wise data, B2C-large invoice-wise, B2C-small rate-wise summaries, credit and debit notes, an HSN summary and a document-series summary. GSTR-3B requires outward taxable value by CGST/SGST/IGST/cess plus inward ITC. GSTR-2B is consumed, not produced. The Invoice Management System introduced on GSTN in 2024-25 lets buyers accept or reject supplier invoices [R2 §C.1].

The design consequence for DigiKhaato is a staged compliance ladder that matches the tier-up triggers: **GST summary, sales register, purchase register and HSN summary at MVP (RPT-03/04/07); GSTR-1 JSON export in Phase 2 (RPT-12); e-invoice and e-way bill through a GSP adapter and Tally XML in Phase 3 (SAL-12, SAL-13, RPT-13)**. Direct GST-portal filing is frequently requested but expensive to maintain and should be phased [R3 #8].

---

## 3.5 Price sensitivity and what Indian SMBs actually pay

The Indian price ceiling is not a matter of opinion; the market has converged on it from several directions.

| Band | Price | What it buys | Examples |
|---|---|---|---|
| Free | ₹0 | Ledger, reminders, PDF statement, QR; or mobile-only billing | Khatabook full ledger; Vyapar mobile app; Zoho Books free below ₹25 L turnover; Zoho Inventory free at 50 orders/month; Swipe "lifetime free" invoicing |
| Micro / owner-operated | **₹0–₹4,000/yr** | Single-user billing + inventory, usually mobile + one desktop | Vyapar Desktop Silver ~₹3,399/yr; Vyapar desktop+mobile ~₹4,010; myBillBook Plus ₹3,490/yr (list ₹4,833); myBillBook Pro ₹3,990/yr |
| Staffed SMB | **₹8,000–₹25,000/yr** | Multi-user, godowns, batch, salesman features | Busy Start/Smart/Power ₹5,000/₹8,000/₹12,000 single-user, ₹12,499/₹17,999/₹24,999 multi-user; Marg Gold ₹25,200 one-time + AMC; TallyPrime Gold rental ₹2,250/mo |
| Cloud "professional" | **₹18,000–₹60,000/yr** | Full accounting, warehouses, batch/serial, integrations | Zoho Books Standard ₹749–899/mo to Elite ₹4,999–5,999/mo; Zoho Inventory Standard ₹1,499/mo to Professional ₹2,999/mo |
| Perpetual incumbent | ₹22,500–₹67,500 one-time + TSS | Desktop, LAN, compliance depth | TallyPrime Silver ₹22,500 + ₹4,500/yr TSS; Gold ₹67,500 + ₹13,500/yr |

Sources: [R3 §3.1], cross-checked against [R2 §B.3] for the ledger apps and [R1 §Part B] for Zoho Inventory's INR ladder (₹999–₹7,499/month billed yearly).

Three structural observations follow.

**The micro ceiling is real and tight.** Vyapar and myBillBook — two independently-funded companies with different origins — converge on ₹3,400–₹4,000 a year, both heavily discounted from ₹5,000–₹8,000 "list", and both push three-year bundles advertising up to 65% savings [R3 §3.1]. That convergence is a market-clearing price, not a coincidence.

**The gap to global willingness-to-pay is 25–40×.** Global SMB accounting budgets run $400/month or $100/user/month, and inventory software averages $142/user/month; the Indian single-user equivalent is roughly $3.5/month [R3 §3.2]. Any business plan that imports Western per-seat assumptions into India will be wrong by more than an order of magnitude.

**Pricing structure matters as much as price level.** Indian products are overwhelmingly flat per business or per device, with user counts as tier steps (1 → 3 → 5 → unlimited LAN). Zoho is the exception with add-on users at ₹150–180/month, and Zoho's and QuickBooks' reviewers complain specifically about tier gating, while Busy's, Marg's and Tally's complain about renewal and AMC hikes. Neither model escapes pricing friction [R3 §3.1, #6].

The **freemium patterns** that have actually been tried are worth cataloguing because they define the choice space: Khatabook is fully free and lending-monetised; Vyapar makes mobile free forever and charges for desktop; Zoho Books is free below ₹25 lakh turnover; Zoho Inventory is free at 50 orders a month; myBillBook offers a trial plus a 7-day money-back guarantee with no perpetual free tier; OkCredit gives a free tier with advertisements and a daily transaction cap [R3 §3.1; R2 §B.3]. The dossier's verdict: **"free mobile, paid desktop/multi-device" is the proven Indian conversion wedge** [R3 §3.1].

### What triggers churn

Six churn triggers are identified from reviews and financials [R3 §3.3], and each maps to a design commitment:

1. **Renewal price increases** — the single most cited pricing complaint (Busy "every year or 2", Marg AMC above quote, myBillBook "increasing subscription fee", QuickBooks "keep going up"). *Commitment: publish prices, grandfather renewals.*
2. **Data loss or calculation mismatch discovered at audit or year-end** — the "cost me thousands" review. Once trust in the numbers breaks, the accountant advises switching. *Commitment: immutability, atomicity, audit trail (Part 0 §0.11).*
3. **Support failure at a critical moment** — GST filing, year-end, trial setup; Vyapar's "zero communication even during free trial". *Commitment: in-product self-service plus WhatsApp support with SLAs.*
4. **Features paywalled after purchase** — myBillBook's "surprise additional charges for new features"; Zoho's "only on higher tier". *Commitment: entitlements fixed at purchase for the term.*
5. **Accountant incompatibility** — inability to export to Tally is a switch trigger for growing firms. *Commitment: Tally XML on the roadmap (RPT-13), CSV/Excel everywhere at MVP.*
6. **Mis-fit regret** — globally 28% find the product "too basic or too complex" and 36% later find a better match [R3 §1.3]. *Commitment: progressive disclosure by business type.*

---

## 3.6 The free-to-paid conversion problem

This is the problem that broke every company in the ledger category, and it deserves its own treatment because DigiKhaato's commercial model must survive it.

**The evidence.** Khatabook reached 10 million monthly active MSMEs and 264 million customer records by August 2021, on total funding of about $186.5M at a roughly $600M post-money valuation [R2 §A.0]. It earned ₹17 crore in FY21, ₹71 crore in FY22 against a ₹111 crore loss, ₹80.9 crore in FY23 against a ₹125.4 crore loss, and ₹102.7 crore in FY24 against a ₹116.2 crore loss — with revenue predominantly from lending and financial services rather than software, and "other expenses" (contractors plus payment-gateway charges) of ₹106 crore growing 51% year on year [R2 §A.0; R3 §3.4]. It has raised no priced round since August 2021, laid off 42 people (6%) in September 2023, and shut its MyStore storefront in November 2021 [R2 §A.0].

OkCredit, with $84.5M raised, earned ₹15.8 crore in FY24 and ₹25.3 crore in FY25, shut OkShop in April 2022 and OkNivesh (P2P lending) in January 2025 under regulatory pressure, cut its lending book from ₹132 crore to ₹17 crore — and **became profitable in November 2025 with 2 lakh-plus paying shopkeepers on ₹30–₹99 monthly plans** [R2 §A.0, §B.1, §D; R3 §3.4].

Vyapar, on the paid side, earned ₹69 crore in FY25 growing 53%, against a ₹63 crore loss, spending ₹2.04 for every ₹1 of revenue, with employee cost at 72% of spend and cash reserves falling from ₹91 crore to ₹6 crore [R3 §3.4].

**The derived conversion rate.** A ₹3,500 ASP against ₹69 crore of revenue implies roughly 2 lakh paying businesses at Vyapar, against 1 crore-plus registrations — a conversion of approximately 2% [R3 §3.4, derived and marked unverified]. That figure is the benchmark any plan in this market must beat or route around.

**The three lessons.** First, *scale of free usage does not predict revenue*: 10 million monthly actives produced essentially no software revenue for Khatabook. The trade press verdict is blunt — "barely any kiranas or small businesses pay for software" [R3 §0.2]. Second, *the wall matters more than the funnel*: OkCredit reached profitability by charging ₹30–₹99 a month for multi-device access, advertisement removal, a defaulters view, billing, desktop and stock — i.e. by paywalling the things a *staffed* business needs while leaving the ledger free [R2 §B.3, §B.4]. Third, *adjacent-product pivots failed twice each*: storefronts (MyStore, OkShop, Dukaan's kirana product) and lending (Khatabook's thesis, OkCredit's OkNivesh) [R3 §7.4].

**The implication for DigiKhaato** is the commercial shape described in Part 1 §1.9 and it follows directly: keep the ledger permanently free and unmetered to win the habit, place the paid wall exactly where OkCredit and Vyapar proved willingness to pay (multiple users and devices, roles, stock, GST outputs, server-sent messaging, exports), refuse advertisements, refuse lending as a first-party line, and build the partner channel as a parallel revenue path that does not depend on self-serve conversion at all.

---

## 3.7 Distribution channels

**Channel, not the app store, is how Indian SMB software gets sold.** Tally has 28,000-plus partners; Vyapar has 27,000-plus with top partners earning ₹2 lakh a month; Marg sells through authorised partners who charge local annual maintenance [R3 §0.9, §8.1]. Vyapar's claim implies roughly 50–100 sales a month per top partner at 50–60% partner margin on a ₹3,400–₹4,000 ASP — high margin expectations by any standard [R3 §8.2, derived]. The partner does not merely resell: the partner installs, migrates data, trains staff and answers the first support call. In a market where 52.6% of MSMEs struggle to find a tool and 36.8% struggle to set one up [R3 §7.2], that service layer is the product for many buyers.

Marg's rating profile demonstrates the risk as clearly as Tally's demonstrates the reward. Marg ERP 9+ scores 3.2 on Capterra with a **2.9 support sub-score** and a bimodal distribution — roughly 40% five-star and 40% one-star — which the dossier reads as a support and channel problem rather than a product one, with complaints about AMC charged above the quoted rate and "no training provided" [R3 §2.1, §2.2 caveats]. A partner channel transmits the partner's service quality directly into the vendor's review scores.

The second distribution pattern is **embedding inside a distribution owner's app**, and the evidence here is consistent though indirect [R3 §8.1]:

| Distribution owner | What they embed | Where they stop |
|---|---|---|
| Paytm | Business Khata — udhaar ledger, reminders, payment links inside Paytm for Business | No inventory, no GST billing |
| PhonePe / BharatPe | Merchant apps with UPI and loans | No books |
| HDFC Bank | SmartHub Vyapar — UPI/QR/card collection, 2- and 3-way reconciliation, soundbox/POS, zero-collateral loans | **No khata, no inventory, no invoicing** |
| Airtel + Bajaj Finance | Jan 2025 partnership: business loans, gold loans, EMI card across 375M customers and 12 lakh distribution points | Financial products only |
| Bizom | "Bizom One" retailer app: brand catalogues, ordering, schemes, digital invoices, working capital, ONDC; 800k retailers, 40+ brands | Ordering-centric, not books |
| Amazon (Perpule), Flipkart Wholesale, JioMart | Kirana POS, loyalty and ordering as customer-acquisition loss leaders | Not books |

Every one of these has built or bought *some* SMB tool and stopped at the layer adjacent to its own revenue. None has built ledger plus GST billing plus inventory in one, and **no public case was found of an Indian bank, NBFC or telecom licensing a third-party white-label khata-plus-inventory-plus-GST SaaS with disclosed volumes** [R3 §8.2]. Global white-label bookkeeping vendors exist but are Western and not GST-aware.

The partner's motive to white-label is threefold and each is evidenced: underwriting data for lending (45% of kiranas want credit support; both Khatabook and Bizom lend against ledger or order data), engagement and stickiness of the partner's merchant app, and reconciliation of the partner's own payment rails into the merchant's books — which is precisely the feature HDFC advertises [R3 §8.2]. The dossier's own confidence rating on white-label demand is **medium-low**, with the explicit recommendation to validate through two or three partner discovery interviews before building partner-specific features [R3 #12].

---

## 3.8 Regional and language considerations

Language is a first-order market variable in this category, not a localisation task.

The demographic fact is that the buyer is a 45–54-year-old owner-operator — 91% of India SME Forum's 7,835 respondents fall in that band [R3 §4.2]. The competitive fact is that language coverage is asymmetric across the two clusters. Khatabook ships 12–13 Indian languages, OkCredit 11, myBillBook 5, while **Vyapar ships English plus Hindi with users complaining of "missing multilanguage support", Swipe is English-first and Zoho Books India is English-only** [R2 §B.2, §D #10]. Vernacular exists in the ledger half of the market and is largely missing from the billing half. That is the specific opening.

Khatabook's own design finding is the most valuable single data point here: literal translations failed, and **"Hinglish" transliteration drove approximately 30% of non-English adoption** [R2 §A.0]. The union of languages Khatabook has shipped — English, Hindi, Hinglish, Marathi, Gujarati, Bengali, Tamil, Telugu, Kannada, Malayalam, Punjabi, Odia, Assamese — is the realistic target set for the category, with the Cashbook sibling adding Urdu and Arabic with right-to-left support.

The vocabulary itself is fixed by usage and must not be invented. The mapping is given in [R2 §C.4] and is normative in Part 0 §0.2: *udhaar* (credit extended, "You gave", red, receivable up), *jama* (payment received, "You got", green, receivable down), *naam* (debit against the party), *hisaab* (the account or statement; "hisaab karna" means to settle up), *baaki* (balance outstanding), *lena/dena* ("You will get / You will give"), *kachha* versus *pakka bill* (informal versus GST invoice — OkCredit uses exactly these words in its UI), *khata* (the per-party account), and *party* (any counter-party; Tally vocabulary that traders already use). **The colour convention — red for money you are owed, green for money received — is stable across every app in the category and must not be inverted** [R2 §C.4].

Adjacent formatting conventions are equally non-negotiable: Indian digit grouping (12,34,56,789.00), lakh and crore short forms in dashboards (₹1.2 L, ₹3.4 Cr), amounts stored as integer paise or `Decimal`, a financial year running 1 April to 31 March with invoice series resetting on 1 April, dd/mm/yyyy display dates, and GST UQC unit codes (NOS, KGS, GMS, LTR, MLT, MTR, BOX, BAG, BDL, DOZ, PAC, PRS, SET, TON, QTL, BTL, CAN, ROL) with colloquial units — peti, gatta, kattha, bori — mapped onto them and per-item secondary units with conversions [R2 §C.5].

Regionally, CPM's Kirana 2025 study reports 93% digital readiness in Tier 2 cities [R3 §7.2], and Khatabook claims presence in "nearly every zip code in India" [R2 §A.0] — so the addressable geography is not metro-limited. What varies regionally is language, the prevalence of weekly settlement customs ("Sunday hisaab" is common in wholesale [R2 §C.5]), and state-level e-way-bill thresholds [R2 §C.1].

---

## 3.9 Messaging economics as a design constraint

Customer-facing messaging is the feature that made Khatabook trusted — the customer receives an SMS whenever something is written against their name, which makes disputes vanish [R2 §D "what users praise"] — and it is also, at scale, expensive enough to shape the business model.

**SMS requires TRAI DLT registration**, a process with real lead time and cost: register the Principal Entity on a telco DLT portal (roughly ₹5,900 plus GST, honoured across operators), register 6-character alphabetic headers (roughly ₹590 a year each), register content templates with typed variables where an exact match is required or the message is silently dropped at scrubbing, and bind the principal-entity-to-telemarketer chain. Categories carry header suffixes: **-T transactional (banks only), -S service, -P promotional, -G government**. "Service-Explicit" was discontinued in May 2025 and migrated to Promotional, which is DND-scrubbed and time-boxed to 9am–9pm. Ledger-entry and reminder messages are **Service-Implicit (-S)**. Lead time is two to four weeks and delivery costs roughly ₹0.12–₹0.25 per SMS [R2 §C.3].

**WhatsApp splits into free and paid mechanisms and the distinction is critical.** The `wa.me` deep link — `https://wa.me/91XXXXXXXXXX?text=<url-encoded>` — is free, needs no approval, opens the chat with prefilled text for the user to send, and gives no delivery receipt and no automation. It is the correct MVP mechanism for statements, invoices and reminder nudges. Server-sent automation requires the WhatsApp Business Platform: Meta business verification, a dedicated number, templates approved by Meta in Marketing, Utility or Authentication categories, and either direct Cloud API or a BSP. Pricing moved from per-conversation to **per-message on 1 July 2025**; Indian rates as of September 2026 are approximately **₹0.86 for Marketing and ₹0.115 for Utility and Authentication**, with free-form service replies inside the 24-hour window free until 30 September 2026 and charged at ₹0.115 from 1 October 2026 with 1,000 free service messages per number per month. BSPs add ₹0.10–₹0.30 per message or ₹999–₹9,999 monthly platform fees, plus 18% GST. **Payment reminders carrying an amount and due date are Utility; anything with an offer is Marketing**, and opt-in must be recorded with timestamp and source [R2 §C.3].

Khatabook's own financials show why this matters: its FY24 "other expenses" line of ₹106 crore — 51% year-on-year growth — comprises contractors plus payment-gateway charges [R2 §A.0], and OkCredit's response was to push SMS cost onto merchants, sending from the merchant's own SIM on the free tier and charging ₹99 a month for server-sent SMS [R2 §A.1 F6, §B.3].

The design consequence, reflected in Part 0 §0.4 (ADR-015) and Part 16 (NTF-02, LED-07, LED-08, LED-12), is a three-tier messaging strategy: **free `wa.me` deep-link sharing for everyone at MVP; SMS through a DLT-registered provider as a configuration-gated capability whose cost is visible; WhatsApp Business API utility templates as a Phase 2 paid capability with per-message cost surfaced to the tenant.** Messaging is never bundled as unlimited, because it has genuine marginal cost.

---

## 3.10 DPDP Act 2023 and Rules 2025 as a design constraint

The Digital Personal Data Protection Act was passed in August 2023 and its Rules were notified on 13 November 2025 with phased commencement: Phase 1 on 13 November 2025 (Board constitution, definitions), Phase 2 on 14 November 2026 (Consent Manager registration), and **Phase 3 on 14 May 2027 for all substantive obligations** — notice, consent, security, breach reporting, erasure, children's data and grievance redress. MeitY has floated pulling Phase 3 forward to November 2026, though this is not notified [R2 §C.6].

The role allocation is the first thing to get right, because it determines who owes what duty. **The merchant is the Data Fiduciary** for their customers' names, phone numbers and balances. **DigiKhaato is the Data Processor** for that data, acting only on the merchant's instructions under contract, and is simultaneously a **Data Fiduciary for merchant accounts**. Customer-side messaging — an SMS carrying a balance — is processing on the merchant's behalf, for which the merchant needs a lawful basis: consent, or the "legitimate use" limb where the customer voluntarily provided the number for a specified purpose such as purchasing on credit. A per-party `consent_source` and `opt_in_ts` must therefore be stored [R2 §C.6].

Eight obligations translate into concrete design requirements [R2 §C.6]:

1. **Notice and consent** in clear language, available in English and any Eighth-Schedule language on request — baked into merchant sign-up and into the customer's first SMS, with a privacy notice on the view-khata page.
2. **Purpose limitation and erasure** when purpose is served or consent withdrawn — party deletion must cascade into messaging logs, with retention exceptions for legal and tax records, noting that GST requires invoice retention for 72 months from the annual-return due date.
3. **Security safeguards** — encryption in transit and at rest, access control, and logs retained at least one year per the Rules.
4. **Breach notification** — intimation to the Data Protection Board and affected principals without delay, with a detailed report within 72 hours; CERT-In's separate 6-hour incident reporting also applies.
5. **Grievance officer** contact published with response timelines.
6. **Children's data** — verifiable parental consent, which in practice means blocking under-18 sign-ups.
7. **Data principal rights** — access, correction, erasure and nomination, exposed in-app as "download my data" and "delete my account" (PLT-10).
8. **Cross-border and hosting** — transfers permitted except to restricted countries; India-region hosting preferred. Significant Data Fiduciary duties (a DPO in India, annual DPIA and audit) apply only on notification.

Penalties reach ₹250 crore per breach category [R2 §C.6].

One practical point deserves emphasis because it cuts against a praised competitor feature. Contacts-permission upload — the "add customers from your phone contacts" flow that Khatabook and OkCredit both offer and that users explicitly praise [R2 §D "what users praise"] — is processing third parties' personal data. The dossier's instruction is to **process on-device where possible and not to sync the whole address book** [R2 §C.6]. That is why PTY-07 is specified as an on-device contact picker via the Web Contacts API or Capacitor, with no address-book upload (Part 16 §16.3).

The strategic reading is that DPDP is a cost for everyone and an advantage for whoever builds it in early. A product designed now pays almost nothing to store a consent timestamp and implement a cascade-delete; a product retrofitting in 2027 pays a great deal.

---

## 3.11 Ten market findings

Each finding states the evidence, the implication for DigiKhaato, and a confidence rating. These are the market conclusions the rest of this specification is built on.

### Finding 1 — Record-keeping is the undigitised layer, and paper is the competitor

Over 90% of MSMEs accept digital payments while 46.2% are fully offline in every other respect, and only 22% of kiranas plan any technology investment [R3 §7.2]. Two-thirds of software buyers come from manual methods or spreadsheets, not from another product [R3 §1.2].

**Implication.** The product is competing with a notebook, not with Zoho. Time-to-first-value must be measured in minutes, onboarding must be short enough to complete standing at a counter, and the first session must show the owner a number they recognise as their own. Feature comparisons against competitors are the wrong marketing frame; "throw away the notebook" is the right one.
**Confidence: High.**

### Finding 2 — Free ledger apps do not monetise; paid billing and inventory does, slowly

Khatabook: 10M MAU, ₹102.7 Cr FY24 revenue mostly from lending, ₹116 Cr loss. OkCredit: profitable in November 2025 only after abandoning lending and charging ₹30–₹99/month to 2 lakh-plus shopkeepers. Vyapar: ₹69 Cr FY25 revenue on ~2% conversion, ₹63 Cr loss, ₹2.04 spent per ₹1 earned [R2 §A.0, §B.4; R3 §3.4, #1].

**Implication.** Design the free tier to acquire the micro segment (ledger, reminders, WhatsApp share, UPI QR — unmetered, ad-free) and plan revenue from the staffed segment and from partners. The paid wall belongs at multi-user, multi-device, stock, GST outputs and server-sent messaging — exactly where OkCredit proved it works — and never at transaction counts.
**Confidence: High.**

### Finding 3 — The price ceiling is ₹3,400–₹4,000/year micro and ₹8,000–₹25,000/year staffed

Vyapar and myBillBook independently converge on ₹3,400–₹4,000; Busy multi-user runs ₹12,499–₹24,999; global willingness to pay is 25–40× higher [R3 §3.1, §3.2].

**Implication.** Price flat per business with user-count steps, include the CA seat free, offer multi-year options, publish prices and grandfather renewals. Do not import per-seat SaaS pricing. For white-label, price to the partner per active merchant rather than per seat [R3 #6].
**Confidence: High.**

### Finding 4 — Support is the category's defining failure, not features

Support is the lowest sub-score for every Indian product measured; Marg's 2.9 support score produces a 3.2 overall rating on a bimodal distribution; the top cross-product complaint is support, then data integrity, then price rises — not missing features [R3 §0.5, §2.1, §2.3, #2, #9].

**Implication.** Differentiation is available on reliability and trust rather than feature count. In-product self-service (HLP-01/02/03), WhatsApp support in regional languages, a public status page, and contractual L1/L2 ownership with partners are product commitments with owners and budgets.
**Confidence: High.**

### Finding 5 — Data integrity failures cause irreversible churn

"Calculation errors — cost me thousands", "missing data, mismatched totals at audit", Busy's absence of auto-save; once trust in the numbers breaks the accountant advises switching [R3 §2.2, §2.3, §3.3, #11].

**Implication.** Immutable ledger entries and stock movements, corrections as reversal-plus-replacement, atomic state changes, server-side totals, an append-only audit log with before/after values, and CA-shareable audit exports are differentiators rather than compliance overhead. They are non-negotiable engineering rules (Part 0 §0.11), not preferences.
**Confidence: Medium-high.**

### Finding 6 — The open middle is mobile-first *and* desktop-capable

Incumbents' weakness is mobile and cloud — Tally's top G2 con is "missing mobile app" with 18 mentions; Busy and Marg reviewers ask for cloud. Mobile apps' weakness is depth: multi-user, roles, fixed assets, Tally export and offline. Paid conversion is desktop-led at both Vyapar and myBillBook [R3 §2.3, §4.3, #3, #7].

**Implication.** One responsive application serving both the phone and the billing counter, with barcode and thermal printing on the counter side and full parity of GST features on mobile. Do not ship mobile-only; do not ship desktop-only.
**Confidence: High.**

### Finding 7 — GST is the purchase trigger and e-invoice/e-way are the tier-up triggers

Every Indian product leads with GST; 1.49 crore regular registrants; 8.56 lakh GSTINs already generate IRNs producing 21.4 crore IRNs in June 2026; e-invoice is mandatory above ₹5 crore turnover; the September 2025 slab restructure forced every vendor to ship a rate-migration tool [R2 §C.1; R3 §5 #1, §7.1, #8].

**Implication.** GST summary, sales and purchase registers and HSN summary at MVP; GSTR-1 JSON in Phase 2; e-invoice, e-way bill and Tally XML in Phase 3. Every threshold, slab and date is a configuration row with effective dating, never a constant. Direct portal filing is requested but expensive to maintain — phase it.
**Confidence: High.**

### Finding 8 — The integration surface is WhatsApp, UPI, Excel and Tally

The de facto SMB stack is UPI QR plus soundbox for collection, WhatsApp for orders and documents, paper or a khata app for udhaar, Excel for stock and price lists, and Tally at the CA. Software that does not accept this stack is fighting habit [R3 §4.4, #4, §6].

**Implication.** Integration priority is (1) WhatsApp share and remind, (2) UPI collection with ledger auto-settlement and an unmatched-payments queue, (3) Excel/CSV import-export, (4) Tally XML export. E-commerce, shipping and accounting-suite integrations are segment-specific and can wait indefinitely.
**Confidence: High.**

### Finding 9 — Udhaar must become a business feature, not a consumer one

Party ledger plus reminders plus payment link is table stakes — Paytm, Khatabook and Vyapar all have it. But credit limits, due-date ageing, salesman-wise collections and route flows are **absent from the base tiers of every mobile app** [R3 §5 #12, #5].

**Implication.** For wholesale and distribution customers the ledger module must exceed Khatabook: credit limits with warn-or-block (PTY-06), ageing buckets (LED-09), collection dates and reminder buckets (LED-05), write-offs (LED-11), and in Phase 3 optional interest accrual (LED-14) and collection routes with salesman collections (LED-15). This is where "udhaar" stops being a consumer feature and becomes a business one.
**Confidence: Medium-high.**

### Finding 10 — Channel is the go-to-market, and white-label demand is plausible but unproven

Tally has 28,000 partners; Vyapar has 27,000 with top partners earning ₹2 lakh a month; Marg's rating is destroyed by local-partner service quality. Every merchant-facing distribution owner embeds *some* SMB tool and stops short of books and inventory; no public Indian white-label khata-plus-billing licensing deal was found [R3 §0.9, §8.1, §8.2, #12].

**Implication.** Build the `Partner` abstraction into the platform from day one — branding, entitlements, support contact, per-merchant pricing — because retrofitting multi-tenancy for white-label is expensive. But treat white-label *demand* as a hypothesis to validate with two or three partner discovery interviews before building partner-specific features, and do not let partner requirements distort the MVP.
**Confidence: Medium-low on white-label demand specifically; High on channel-led GTM generally.**

---

## 3.12 What this chapter fixes for the rest of the specification

The market synthesis produces six constraints that later chapters must honour and that should be checked at every design review:

1. **Time-to-first-value is measured against paper**, so onboarding is minutes and the first screen shows the owner's own dues.
2. **The paid wall sits at multi-user, multi-device, stock depth, GST outputs and server-sent messaging** — never at transaction counts, never behind advertisements.
3. **Every statutory number is configuration**, with effective-dated rate history as a schema requirement.
4. **Trust is architectural** — immutability, atomicity, audit trail, server-computed totals.
5. **The integration surface is WhatsApp, UPI, Excel and Tally**, in that order of priority.
6. **Language is product**, with `en` and `hi` at MVP, the vernacular vocabulary of [R2 §C.4] as normative copy, and the red/green convention inviolable.
