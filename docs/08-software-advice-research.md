# Part 8 — Review Mining: What Real Users Say

*Dossier R3 mines Software Advice, Capterra, G2, Techjockey, SoftwareSuggest and the Play Store across eight products — Zoho Inventory, Vyapar, myBillBook, TallyPrime, Busy, Marg ERP 9+, QuickBooks Online and Khatabook — and closes with fifteen ranked Insight → Implication → Confidence items. This chapter carries that evidence forward: what users praise, what they complain about, why they abandon products, where onboarding fails, what they expect from support, how mobile and desktop are actually used, and the fifteen implications with each one mapped to the DigiKhaato feature ID that answers it.*

---

## 8.1 The ratings, and what they hide

| Product | Site | Rating | Reviews | Ease of use | Support |
|---|---|---|---|---|---|
| Vyapar | Play Store | 4.8★ | ~187K | — | — |
| Khatabook | Play Store | 4.5★ | ~590K | — | — |
| myBillBook | Capterra | 4.5 | 52 | 4.7 | 4.5 |
| Zoho Inventory | Capterra | 4.5 | 421 | 4.4 | 4.3 |
| TallyPrime | Capterra / G2 | 4.4 | 228 / 306 | 4.3 | 4.0 |
| Vyapar | Capterra / Software Advice | 4.3 | 181 | 4.4 | 4.1 |
| QuickBooks Online | Capterra | 4.3 | 8,525 | 4.2 | 4.0 |
| Busy | Capterra | 4.2 | 50 | 4.3 | 3.9 |
| **Marg ERP 9+** | Capterra / Software Advice | **3.2** | 55 | 3.4 | **2.9** |

Source: [R3 §2.1].

Three caveats are essential to reading this table correctly, and the dossier states them [R3 §2.1 caveats]. Indian-product review counts on Western sites are small — 50 to 230 — and skew toward English-speaking accountant and IT reviewers rather than shop owners. Khatabook's Capterra sample of six reviews is meaningless; its Play Store base of ~590,000 ratings is the real signal. And **Marg's distribution is bimodal — roughly 40% five-star and 40% one-star — which is a support and channel problem, not a product-love problem.**

The most important pattern in the table is in the last column. **Support is the lowest sub-score for every Indian product measured.** Not features. Not ease of use. Support. A product can be rated 4.5 for usability and still lose customers on a 3.9 support score, and Marg demonstrates what happens when that score falls below 3.

---

## 8.2 What users praise

Across eight products, praise clusters into six themes [R3 §2.2; R2 §D "what users praise"].

**Simplicity that staff can absorb.** Vyapar's leading pro is that "staff learn quickly"; myBillBook's ease-of-use sub-score of 4.7 is the highest in the set. In a market where the owner is 45–54 and the billing clerk may have no software experience, low training burden is a purchase criterion, not a nicety.

**All-in-one coverage.** Vyapar is praised specifically for combining billing, GST, inventory and expenses in one product — which is the same instinct that motivates DigiKhaato's "one book instead of four apps" thesis.

**WhatsApp as a first-class output.** "Send invoices directly through WhatsApp" is a top Vyapar pro, and blank WhatsApp PDFs are simultaneously a top complaint — which is the strongest possible evidence that the feature is used constantly rather than demoed occasionally [R3 §2.2, §5 #3].

**The two-button khata.** Khatabook's praise is remarkably consistent: free, effortless udhaar tracking, SMS and WhatsApp reminders with payment links, 10+ languages, and contact import [R3 §2.2]. The dossier's separate list of what users consistently praise names: two-button simplicity, adding customers from contacts, the customer receiving an SMS so that disputes vanish, the free PDF statement, QR and payment link that let customers pay without separate setup, refer-and-earn, and the regional-language UI [R2 §D].

**Keyboard speed and statutory depth** at Tally — "multi-tasking (open reports without losing entry)", GST depth, robust inventory, cost-effective against QuickBooks [R3 §2.2]. This is the accountant's praise and it is about throughput.

**Vertical fit** at Marg — pharma and FMCG batch, expiry, schemes and sub-stockist handling — which is why Marg survives a 2.9 support score at all [R3 §2.2].

The synthesis: **users praise speed, breadth-in-one-place, sharing, and language. They do not praise feature counts.**

---

## 8.3 What users complain about

Ten complaint themes, ordered by how many products they appear in as a top-three concern [R3 §2.3]:

| Theme | Products where top-3 | Character |
|---|---|---|
| **Support unresponsive** | Vyapar, myBillBook, Busy, Marg, QuickBooks | Universal |
| **Data integrity / calculation errors / data loss** | Vyapar, myBillBook, Busy (no auto-save) | **Most dangerous** |
| **Annual price increases / surprise charges** | Busy, Marg, myBillBook, QuickBooks, Vyapar | Churn trigger even at ₹3–5k/yr |
| **No cloud / no mobile** | Tally, Busy, Marg | Incumbent weakness = the opening |
| **Shallow accounting / advanced inventory** | Vyapar, myBillBook, Zoho Inventory, Khatabook | Mobile-first weakness = depth opening |
| **Performance with large data / multi-user** | Tally, Busy, Khatabook, QuickBooks | |
| **Poor third-party integration** | Tally, Khatabook, Busy | |
| **Outdated UI / learning curve** | Tally alone | Mobile apps are praised on UI |
| **Feature gating by tier** | Zoho Inventory, QuickBooks | |
| **Offline gaps** | myBillBook | |

Two of these deserve a closer reading because they are qualitatively different from the rest.

**Data integrity is the complaint that ends relationships.** The specific reviews are worth quoting because their tone differs from ordinary dissatisfaction: myBillBook's calculation errors "cost me thousands"; Vyapar reviewers report "missing data, mismatched totals at audit"; Busy has no auto-save [R3 §2.2]. The dossier classifies this as "the most dangerous complaint category — reviewers cite audit mismatches and money lost" [R3 §2.3]. Every other complaint is about friction; this one is about loss, and it is discovered at year-end or during an audit, when the accountant is present and switching is already on the table [R3 §3.3].

**Support is a structural failure, not an execution failure.** It appears in five of eight products, is the lowest sub-score in every Indian product, and in Marg's case is attributable to the local-partner channel rather than the vendor [R3 §2.2, #9]. Its scale is also an economic fact: Vyapar's overheads are dominated by people cost at 72% of spend [R3 §3.4]. Support is simultaneously the biggest failure mode and the biggest cost — which means it cannot be solved by hiring alone and must be solved partly in the product.

The complementary Indian-review ranking in [R2 §D] adds detail the Western sites miss, because it draws on Play Store text: intrusive advertisements and forced upsell (ranked #1, dominant at OkCredit), payments received but not reflected (#2), app slowness and hangs during transaction entry (#3), loan banners and loan delays polluting a ledger app (#4), subscription double-charges (#5), split payments not tracked (#7), inability to re-add a deleted customer (#8), missing regional languages in billing apps (#10), price hikes on renewal (#11), reminders requiring external platforms (#12), dense UI as features grow (#14), date-entry friction (#15), and black screens after updates (#18).

---

## 8.4 Recurring abandonment reasons

The dossier isolates six churn triggers [R3 §3.3], and they are not the same as the complaint list — a complaint annoys, a trigger causes departure:

1. **Renewal price increases.** The single most cited pricing complaint: Busy raises prices "every year or 2", Marg charges AMC above the quoted rate, myBillBook adds "increasing subscription fee", QuickBooks prices "keep going up", Vyapar raises annually.
2. **Data loss or a calculation mismatch discovered at audit or year-end.** Once trust in the numbers breaks, the accountant advises switching.
3. **Support failure at a critical moment** — GST filing, year-end, or trial setup. Vyapar's "zero communication even during the free trial" is the canonical instance, and it is notable that it occurred *before* purchase.
4. **Features paywalled after purchase** — myBillBook's "surprise additional charges for new features"; Zoho's "only on higher tier".
5. **Accountant incompatibility** — inability to export to Tally is a switch trigger for growing firms, which is why myBillBook sells Tally export as its top-tier hook.
6. **Mis-fit regret** — globally 28% of buyers find the chosen system "too basic or too complex" and 36% later find a better-matching product [R3 §1.3].

Three of these six (1, 4, 6) are commercial-design failures rather than engineering ones, one (5) is an integration gap, and two (2, 3) are trust failures. Notably, **none of the six is "missing feature X"**. That is the finding the dossier states as its second-ranked implication: differentiation is available on reliability and trust rather than feature count [R3 #2].

---

## 8.5 Onboarding friction

Onboarding failure appears in three places in the research and the three do not agree about *where* the friction is, which is itself informative.

**Before purchase, the problem is choosing.** Fifty-two point six percent of Indian MSMEs say finding the right digital tools is challenging and 36.8% struggle to set them up; 97.3% are unaware of government schemes; the digital maturity index is 58 out of 100 [R3 §7.2]. Globally, only 53% of buyers formally define a budget and must-have list before buying, and 28% end up with something too basic or too complex [R3 §1.3].

**At setup, the problem is data.** Two-thirds of inventory-software buyers come from manual methods (41%) or spreadsheets (26%) [R3 §1.2]. Their opening position is a notebook of party balances and a shelf of stock. Any product that cannot ingest that opening position — party names with opening balances, items with opening stock — forces a week of typing before the product produces any value.

**After setup, the problem is learning.** Vyapar users explicitly request in-app tutorials; Khatabook's Techjockey reviews say "tutorial for new users needs improvement"; Zoho's third-ranked complaint is "I see a lot of tools I don't really know how to use" [R3 §2.2; R2 §D #14; R1 §E.1 #3].

Three product answers follow, all already in the catalogue. **CSV import with row-level validation and a preview before commit** (IMP-01, PTY-10, INV-09) answers the data problem. **Progressive disclosure by business type** (Part 0 §0.3, PLT-06) answers the too-complex problem. **Contextual help and four guided tours** (HLP-02) answer the learning problem — and the four tours chosen in Part 6 §6.4 map exactly onto the first four things a new user must succeed at.

There is a fourth answer that is not a product feature: **partner-assisted setup**. In a channel-led market where the partner installs, migrates and trains [R3 §8.1], onboarding friction is partly a distribution asset. The dossier's implication #14 pairs vernacular onboarding, WhatsApp support and partner-assisted setup as mattering *more than feature breadth* [R3 #14].

---

## 8.6 Support expectations

What the research establishes about support is narrow but firm.

**Expected response is fast and conversational.** Khatabook offers help via chat, call and WhatsApp from 7am to 10pm [R2 §A.1 F20]. myBillBook's WhatsApp support is listed among its pros [R3 §2.2]. The channel expectation in this market is WhatsApp, not a ticket portal.

**Response quality is judged on domain knowledge.** Swipe's complaints name "zero accounting knowledge" in support staff [R2 §D #6]. A support agent who cannot answer a GST question is worse than no agent, because the question was the reason for contact.

**Silence is the worst outcome.** Khatabook's payment incidents received 72-hour SLAs and "please wait" [R2 §A.0]; Zoho closes bug reports without explanation and leaves community threads unanswered for years [R1 §E.1 #6]; Vyapar gave "zero communication" during a free trial [R3 §2.2].

**In a channel model, support quality is the partner's and the score is the vendor's.** Marg's 2.9 is the evidence [R3 §2.2, #9]. This is why the dossier recommends defining support ownership contractually — partner at L1, Metis at L2 — and building in-product self-service, with support SLAs treated as a product feature [R3 #9].

The commitments this implies for DigiKhaato: in-app help centre and contextual help (HLP-01, HLP-02) as deflection; WhatsApp support in regional languages; a published status page; tutorial videos, which Vyapar users explicitly request; and a contractual L1/L2 split in every partner agreement.

---

## 8.7 Mobile versus desktop usage patterns

The evidence here is unusually clean and produces one of the most actionable findings in the research [R3 §4.3].

**Reach is mobile.** Vyapar claims 10M+ registrations, myBillBook 1 crore+ businesses, Khatabook 50M+ downloads. These are phone numbers, not PC installations.

**Paid conversion is desktop.** Vyapar's free tier is mobile-only and its first paid tier is Desktop Silver at ~₹3,399/year; myBillBook's "most popular" Pro plan's headline feature is the desktop app [R3 §3.1, §4.3]. The dossier's conclusion: *"A Windows desktop/PWA billing counter with barcode + thermal printing is the conversion product; mobile is the acquisition product. Do not ship mobile-only"* [R3 #7, High].

**The reason is physical.** Counter billing with a barcode scanner, a thermal printer and a keyboard is a desktop job. Tally's keyboard-driven entry speed is praised for exactly this reason [R3 §2.2].

**The incumbent base wants mobile for viewing, not entry.** Tally's #1 G2 gap is "missing mobile app" with 18 mentions — but the accountant reading a report on a phone is a different use case from the shopkeeper recording a sale on one [R3 §4.3].

**And mobile-desktop inconsistency is itself a complaint.** myBillBook draws "mobile↔web inconsistency"; Zoho draws "mobile features limited compared to desktop", with no default sales UoM on mobile, some edits web-only and stock-count approval web-only [R3 §2.2; R1 §E.1 #4].

The architectural answer is ADR-020: **one responsive web application plus a PWA manifest**, with the same code serving the phone and the counter. This avoids the parity-drift problem structurally rather than by discipline. The counter-specific requirements — 80mm thermal templates (SAL-03), barcode-typed search at MVP and camera scanning in Phase 2 (INV-02, INV-10), keyboard-navigable line entry — are width-specific behaviours of the same screens, not a separate product.

---

## 8.8 The fifteen implications, carried forward

Each item below restates the dossier's Insight → Implication → Confidence [R3 §9] and adds the DigiKhaato feature IDs that answer it.

### 1. Free khata apps with 10M+ MAU could not get kiranas to pay; paid billing+inventory does get paid, at ₹3.4–4k/yr, at ~2% conversion
**Implication.** The unit of monetisation is the GST-registered, staffed business with a PC, not the kirana with a phone. Design the free tier to acquire kiranas (ledger + WhatsApp reminders) but plan revenue from the desktop/multi-user tier and from partners. **Confidence: High.**
**Answered by:** PLT-15 (plan entitlements), PLT-05 (team & roles as the paid wall), WLB-02 (partner configuration), and the commercial shape in Part 1 §1.9.

### 2. The #1 cross-product complaint is support; #2 is data integrity/sync; #3 is renewal price hikes
**Implication.** Differentiate on reliability and trust — transaction-level audit trail, never-lose-data sync, visible backups, predictable pricing — rather than on feature count. A white-label partner will be judged on these three by its merchants. **Confidence: High.**
**Answered by:** PLT-08 (audit log viewer), Part 0 §0.11 rules 1–5 (immutability, atomicity, audit), PLT-10 (data export), HLP-01/02 (deflection), and published grandfathered pricing.

### 3. Incumbents' weakness is mobile/cloud; mobile apps' weakness is depth and offline
**Implication.** The open middle is "mobile-first *and* desktop-capable, multi-user with roles, offline-tolerant, Tally-exportable". Both ends of the market request exactly this. **Confidence: High.**
**Answered by:** ADR-020 (responsive + PWA, offline queue in P2), PLT-05 (four system roles), RPT-13 (Tally XML, P3), INV-11 (multi-location, P2).

### 4. The de facto SMB stack is UPI + WhatsApp + Excel + Tally-at-the-CA
**Implication.** Integration priority is (1) WhatsApp share/remind, (2) UPI collection with ledger auto-settlement, (3) Excel import/export, (4) Tally XML export. E-commerce and shipping can wait. **Confidence: High.**
**Answered by:** NTF-03 (WhatsApp deep-link share), PAY-03 (UPI QR & intent) and PAY-06/07 (aggregator + unmatched queue, P2), IMP-01/IMP-02 (CSV import/export), RPT-13 (Tally XML, P3).

### 5. Party ledger + reminders + payment link is table stakes; credit limits, ageing and route/salesman flows are *not* in mobile apps' base tiers
**Implication.** For wholesale and distribution the udhaar module must go beyond Khatabook: credit limits, due-date ageing, salesman-wise collections, optional interest and late fee. This is where udhaar becomes a *business* feature. **Confidence: Medium-high.**
**Answered by:** PTY-06 (credit limit & alerts), LED-09 (ledger summary & ageing), RPT-05 (receivables/payables ageing), LED-14 (interest/late fee, P3), LED-15 (collection routes & salesman collections, P3).

### 6. Indian pricing is flat per business/device with user-count steps; per-user pricing draws tier-gating complaints; renewal hikes drive churn
**Implication.** Flat annual per business with 1 / 3 / unlimited-user steps, the CA as a free seat, 3-year lock-ins available, and renewal held at the original price. For white-label, price to the partner per active merchant, not per seat. **Confidence: High.**
**Answered by:** PLT-15 (entitlements), PLT-05 (accountant role included free), PLT-16 (subscription billing, P3), WLB-02 (partner entitlements), Part 2 §2.4 Principle 6.

### 7. Paid conversion happens on desktop
**Implication.** A Windows desktop/PWA billing counter with barcode and thermal printing is the conversion product; mobile is the acquisition product. Do not ship mobile-only. **Confidence: High.**
**Answered by:** ADR-020, SAL-03 (A4 + 80mm thermal templates), INV-02 (barcode-typed search) and INV-10 (camera scan, P2), INV-15 (label printing, P2).

### 8. GST compliance is the reason SMBs buy; e-invoice and e-way bill are the tier-up triggers
**Implication.** GSTR-1/3B reports at base; e-invoice and e-way as paid or partner-gated; direct GSP filing is frequently requested but expensive to maintain — phase it. **Confidence: High.**
**Answered by:** RPT-07 (GST summary, MVP), RPT-03/04 (registers, MVP), RPT-12 (GSTR-1 JSON, P2), SAL-12 (e-invoice IRN, P3), SAL-13 (e-way bill, P3).

### 9. Support is the biggest failure mode and the biggest cost
**Implication.** In a white-label model, define support ownership contractually (partner L1, Metis L2) and build in-product self-service — guided setup and tutorial videos are explicitly requested. Support SLAs are a product feature. **Confidence: High.**
**Answered by:** HLP-01 (help centre), HLP-02 (contextual help & 4 tours), HLP-03 (what's new), WLB-02 (partner support contact), NTF-01 (in-app inbox).

### 10. Vertical fit wins in distribution (Marg's pharma batch/expiry/scheme moat; Bizom's FMCG ordering)
**Implication.** A horizontal MVP cannot displace Marg in pharma. Choose one or two verticals for the white-label launch partner's merchant base — general trade plus garments or electronics retail — and treat batch/expiry as a later module. **Confidence: Medium.**
**Answered by:** INV-16 (batches & expiry, P3), INV-12 (variants for garments, P2), Part 2 §2.7 (business-type profiles), LED-15 (routes, P3).

### 11. Data trust is the reason SMBs stay
**Implication.** Immutable ledger entries with edit history, reconciliation reports and CA-shareable audit exports are differentiators, not compliance overhead. **Confidence: Medium-high.**
**Answered by:** LED-03 (correct/reverse with reason), Part 0 §0.7 (`posted`/`reversed`, never deleted), PLT-08 (audit log viewer), RPT-02 (day book), RPT-08 (export), PTY-04/INV-01 (archive not delete).

### 12. White-label demand is inferred, not proven
**Implication.** Position DigiKhaato to a partner as (a) engagement layer, (b) reconciliation of partner rails into merchant books, (c) underwriting-grade ledger data. Validate with two or three partner discovery interviews before building partner-specific features. **Confidence: Medium-low.**
**Answered by:** WLB-01…06 as a *platform capability* rather than partner-specific features; PAY-06 (aggregator adapter as the reconciliation hook, P2); PLT-14 (super-admin console). The discovery interviews are a go-to-market action, not a build item.

### 13. Storefront/ONDC features have repeatedly failed among kiranas
**Implication.** Exclude the online store from MVP; treat as a partner-specific add-on only. **Confidence: High.**
**Answered by:** an explicit non-goal (Part 2 §2.9). No feature ID exists, deliberately.

### 14. Owner-operators are 45–54 and 52.6% of MSMEs say finding/setting up tools is hard
**Implication.** Vernacular onboarding, WhatsApp-based support and partner-assisted setup matter more than feature breadth. **Confidence: Medium-high.**
**Answered by:** ADR-006 (`en` + `hi` at MVP), PLT-03 (onboarding wizard with language and business type), IMP-01/PTY-10/INV-09 (CSV import of the opening position), HLP-02 (tours), NTF-03 (WhatsApp).

### 15. Market-size reports are directionally useful but unreconciled with vendor revenues
**Implication.** Use bottom-up sizing — 1.49 crore regular GST registrants × realistic penetration × ₹4–15k ASP — for any business case; cite syndicated reports only as corroboration. **Confidence: Medium.**
**Answered by:** Part 3 §3.1 (bottom-up sizing) and Part 1 §1.11 (targets expressed in tenants and ARR rather than market share).

---

## 8.9 What the review evidence changes about the plan

Four things in this specification exist *because* of review evidence rather than competitive analysis or strategy, and they are worth isolating.

**Split payment is an MVP feature** (PAY-02) purely because Vyapar's failure to track part-cash-part-UPI accurately is a named complaint [R2 §D #7]. It would otherwise look like a Phase 2 refinement.

**Soft delete with restore** (PTY-04) exists because OkCredit's inability to re-add a deleted customer's number is a specific, repeated complaint [R2 §D #8]. It is a two-line schema decision that prevents a class of support ticket.

**Quick date chips** (Today / Yesterday / pick, remembering the last used) exist because "the date feature is annoying and hard to change" is a Vyapar complaint [R2 §D #15]. This is the kind of paper-cut that never appears on a feature comparison and drives daily irritation.

**A sub-400ms perceived write latency budget on a 2 GB Android device** (Part 1 §1.11, Part 4 §4.7 commitment 26) exists because "extremely slow and keeps hanging while entering transactions" is the third-ranked pain point in the entire category [R2 §D #3]. It is stated as an SLO rather than an aspiration because the review evidence says it is the difference between a used product and an abandoned one.

Collectively these four illustrate the chapter's argument: **in this market, the reviews are a better product roadmap than the competitors' feature lists.** The competitors' feature lists say what has been built; the reviews say what still does not work.
