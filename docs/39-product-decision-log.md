# Part 39 — Product Decision Log

> **Status:** normative for the decisions recorded; advisory in its framing. This part is the product counterpart to Part 38. Where Part 38 records how the system is built, this part records **what the product is and is not**, why, on whose evidence, and what would change the answer. Every Class C scope change, every cut under Part 12 §12.7, and every reversal of an item on the Avoid list of Part 11 §11.3 must be recorded here before it takes effect.

## 39.1 How to read a product decision

Each record has ten fields, and the two that do most of the work are **Evidence relied on** and **What would reverse it**.

The evidence field carries source markers to the research chapters — `[R1]` for the Zoho corpus (Parts 5–7), `[R2]` for the Khatabook and ledger-app corpus (Part 9 and the `research/02` dossier), `[R3]` for the market and software-advice corpus (Parts 3, 4 and 8) — plus the Part and section where the claim is stated in this specification. A decision whose evidence field says "judgement" is a decision made without evidence, and saying so is more useful than dressing it up.

The reversal field exists because a product decision that cannot be reversed is a belief. Where an item sits on the Avoid list of Part 11 §11.3, the reversal condition here is the same trigger stated there, and the two must not drift.

**Who decided** names a role. At this stage most say "Product owner", which is honest and is itself a risk (`RSK-17`).

**Options considered with consequences** lists what was genuinely on the table. Where an option was never seriously entertained, the record says so rather than inventing a deliberation.

Records are numbered `PD-01` upward, never reused. A superseded decision keeps its number, is marked superseded with a date, and points to the record that replaced it.

## 39.2 Index

| ID | Decision | Date | Status |
|---|---|---|---|
| `PD-01` | India first, with the architecture kept region-neutral | 18 Sep 2026 | Accepted |
| `PD-02` | The small retailer and the wholesaler are the primary MVP customers | 18 Sep 2026 | Accepted |
| `PD-03` | Business-type-agnostic, tuning defaults only — not vertical products | 18 Sep 2026 | Accepted |
| `PD-04` | Ledger first, documents second — the ledger is the spine | 18 Sep 2026 | Accepted |
| `PD-05` | Model the ledger on the existing DigiKhaato UdhaarBook rather than designing fresh | 18 Sep 2026 | Accepted |
| `PD-06` | Inherit Khatabook's red/green and "you gave / you got" vocabulary | 18 Sep 2026 | Accepted |
| `PD-07` | Adopt Zoho's status vocabularies; reject its module sprawl | 18 Sep 2026 | Accepted |
| `PD-08` | Build white-label into the MVP chassis rather than retrofit it | 18 Sep 2026 | Accepted |
| `PD-09` | Local-first and minimal-dependency, because it runs for personal use first | 18 Sep 2026 | Accepted |
| `PD-10` | Fourteen explicit non-goals, each with a reversal trigger | 18 Sep 2026 | Accepted |
| `PD-11` | The paid wall sits at the transition to a staffed business | 18 Sep 2026 | Accepted |
| `PD-12` | English and Hindi at MVP, every string keyed from the first commit | 18 Sep 2026 | Accepted |
| `PD-13` | No A/B testing at MVP | 18 Sep 2026 | Accepted |
| `PD-14` | GST compliance *outputs* at MVP; automation in Phase 3 | 18 Sep 2026 | Accepted |
| `PD-15` | No advertising, no lending banners, and a price that does not move | 18 Sep 2026 | Accepted |
| `PD-16` | The partner channel is a parallel revenue path, not a later add-on | 18 Sep 2026 | Accepted |
| `PD-17` | Immutability is a user-visible promise, not an internal property | 18 Sep 2026 | Accepted |
| `PD-18` | The cut-line order is agreed before the pressure, not during it | 18 Sep 2026 | Accepted |
| `PD-19` | Simplify rather than omit, with a stated growth path for each reduction | 18 Sep 2026 | Accepted |
| `PD-20` | Be honest about what the product cannot see | 18 Sep 2026 | Accepted |

---

## PD-01 — India first, with the architecture kept region-neutral

**Date:** 18 September 2026 · **Status:** Accepted

**Decision.** UdhaarBook targets **India only** at v1 — INR, GST, UPI, WhatsApp, English and Hindi — while keeping tax regime, currency and locale tenant-configurable so that a second region is architecturally possible; **no feature is built for a second region**.

**Context.** The product's core artefact, the udhaar ledger, is a specific cultural and commercial practice. Its adjacent requirements — GST with its slab history, UPI, DLT-registered SMS, WhatsApp as the default communication channel, a 1 April financial year — are all India-specific. A product built to be regionally general would have to abstract every one of them, and a tax engine general enough for two countries is a tax engine nobody can verify against either.

**Options considered.** *(a) India only, region-neutral architecture (chosen)* — every feature is built for one regime and verified against it; the cost is a handful of configuration seams that are cheap now and expensive later. *(b) India only, India hard-coded* — marginally faster to build; makes any later region a rewrite of the tax, currency and locale layers. *(c) Multi-region from the start* — no realistic version of this exists for a team of this size; it was never seriously entertained and is recorded only to be dismissed.

**Rationale.** The addressable base is large enough that regional expansion is not needed for the thesis to work: roughly 7.8 crore Udyam-registered MSMEs and 1.67 crore active GST taxpayers, of which about 1.49 crore are regular registrants. The configuration seams cost almost nothing because tax rates already need effective dates (`PD-14`) and locale already needs to be per-tenant for `PD-12`.

**Who decided.** Product owner.

**Evidence relied on.** Part 3 §3.1 (market size and segmentation) `[R3]`; Part 3 §3.4 (GST as the forcing function) `[R3]`; Part 3 §3.9 (DLT and WhatsApp economics) `[R2 §C.3]`; canon §0.1.

**What would reverse it.** Expansion to a second country committed with a named launch partner and a tax regime specified to the depth GST is specified here — the same trigger as Part 11 §11.3 item 5. A diaspora user asking to track dollars is not a trigger.

**Affected features.** All; specifically `SAL-02`, `RPT-07`, `PAY-03`, `NTF-02`, `LED-08`, and the `tax_rate` and tenant-settings schema.

---

## PD-02 — The small retailer and the wholesaler are the primary MVP customers

**Date:** 18 September 2026 · **Status:** Accepted

**Decision.** The MVP is designed primarily for **owner-operated small retailers and staffed wholesalers/distributors**, with services, trading, small manufacturing and professional practices served by the same product without dedicated features.

**Context.** "All business types" (`PD-03`) is a promise about not excluding anyone; it is not a statement about who the product is optimised for. Something must be optimised for, or nothing is. The two chosen segments sit at opposite ends of the same spine: the kirana owner carries one to two lakh of udhaar in a notebook and needs speed above all; the distributor carries thirty-five to forty-five lakh and needs credit limits, aging, staff roles and collection discipline. Between them they exercise every core capability.

**Options considered.** *(a) Retail and wholesale together (chosen)* — the wholesaler justifies credit limits, aging, roles and multi-user, which are also the paid wall (`PD-11`); the retailer justifies the speed budget and the vernacular work. Consequence: the pilot must include staffed wholesalers or half the feature set ships untested (`OQ-11`). *(b) Kirana retail only* — a simpler, faster product with a much clearer first version, and no obvious path to revenue, because the single-user ledger is the thing the category proved does not monetise. *(c) Wholesale/distribution only* — the segment with the money and the multi-user need; rejected because it is a smaller base, needs more depth per tenant, and abandons the vernacular, mobile-first positioning that makes the product different.

**Rationale.** The wholesale and distribution segment is where udhaar stops being a consumer nicety and becomes a business function, and it is where willingness to pay lives. Serving only it would produce a narrower product with a longer sales cycle; serving only retail would produce a product with no revenue model.

**Who decided.** Product owner.

**Evidence relied on.** Part 14 (personas — Suresh the kirana owner, Ramesh the distributor); Part 3 §3.11 Finding 9 (udhaar must become a business feature) `[R3]`; Part 11 §11.2 (credit control as the wholesale differentiator); Part 3 §3.3, §3.5 on the price bands `[R3]`.

**What would reverse it.** Pilot and early-cohort evidence that one of the two segments does not adopt — specifically, if wholesalers do not use credit limits and aging, the differentiation argument of Part 11 §11.2 weakens and the product should be re-aimed.

**Affected features.** `PTY-06`, `LED-05`, `LED-09`, `RPT-05`, `PLT-05`, `LED-01`, `SAL-07`.

---

## PD-03 — Business-type-agnostic, tuning defaults only — not vertical products

**Date:** 18 September 2026 · **Status:** Accepted

**Decision.** Business type is chosen at onboarding and **seeds defaults only** — inventory on or off, document kinds, units, party labels, which report opens first — and **never hard-wires behaviour**; there are no vertical SKUs and no per-vertical code paths.

**Context.** Competitors take one of two shapes. Some ship one dense interface for everyone and collect the complaint that it "overwhelms less tech-savvy owners". Others fork into vertical editions and multiply their support and release cost. Neither is available to a team of this size, and the second is a one-way door.

**Options considered.** *(a) One product, business type tunes defaults (chosen)* — cheap to maintain from one codebase, and hard to copy without the same discipline about where behaviour may branch. Consequence: constant pressure to make a default into a behaviour, which is `RSK-04`. *(b) Vertical editions (kirana, pharmacy, distributor)* — a much sharper first-run experience per segment; consequence: N codebases or N configuration forks, N support paths, and a permanent decision about which vertical gets the next feature. *(c) No business type at all* — simplest, and it means a services professional sees stock fields they will never use, which is the complaint above.

**Rationale.** Defaults deliver most of the felt benefit of a vertical product at a fraction of the cost, and the reduction is reversible in one direction only: a default can become a vertical feature later; a vertical fork cannot be merged back.

**Who decided.** Product owner.

**Evidence relied on.** Part 11 §11.2 (business-type tuning as a differentiator); Part 4 §4.5 (competitor complaints about density) `[R3]`; canon §0.2 ("never hard-wires behaviour").

**What would reverse it.** A single vertical exceeding a large majority of paying tenants *and* requesting capabilities that cannot be expressed as defaults — at which point the honest move is to adopt it as a target segment under a Class C change to Part 18 §18.4, not to fork.

**Affected features.** `PLT-03`, `PLT-06`, `PLT-15`, and the module-toggle mechanism of `WLB-02`.

---

## PD-04 — Ledger first, documents second — the ledger is the spine

**Date:** 18 September 2026 · **Status:** Accepted

**Decision.** The **party ledger is the spine of the product**: every document — invoice, purchase bill, payment, credit note, party-linked expense — posts a ledger entry that links back to its source, there is one balance per party derived from one immutable series, and **no module maintains a second view of what a party owes**. Build order follows: platform, parties, ledger, then documents.

**Context.** The category is split. Ledger-first products are free, multilingual and phone-only but weak at GST and stock. Billing-first products are paid, English-heavy, desktop-led and treat udhaar as a receivables report. A merchant who needs both runs two applications and reconciles by hand — the multi-app trap that is the actual daily experience of the target user.

**Options considered.** *(a) Ledger spine, documents hang off it (chosen)* — consequence: one balance, always; documents must be designed to post entries, which constrains their design slightly and is the point. *(b) Documents first, ledger as a receivables projection* — the billing-cluster shape; consequence: udhaar becomes a report rather than a book, and the informal credit that is not attached to any invoice has nowhere to live. *(c) Two parallel systems with reconciliation* — what merchants do today with two apps, reproduced inside one product.

**Rationale.** This is an architectural commitment rather than a feature, and it is the product's central defensibility claim: a ledger app that adds invoicing bolts a documents table onto a transactions table and gets two balances; a billing app that adds udhaar gets a receivables report with a Hindi label. Retrofitting the spine means rewriting the core of either product. It also dictates the dependency order in Part 13 §13.7 — building documents before the ledger would invert the spine.

**Who decided.** Product owner with the engineering lead.

**Evidence relied on.** Part 4 §4.6 (the gap UdhaarBook occupies) `[R3]`; Part 9 §9.5 (what Khatabook never built) `[R2]`; Part 11 §11.2; Part 18 §18.5 principle P1.

**What would reverse it.** Nothing short of abandoning the product thesis. If merchants use only the document half, that is `RSK-01`'s stop-and-rethink condition, not a reason to invert the spine.

**Affected features.** `LED-10` carries it explicitly; `LED-01`–`LED-11`, `SAL-02`, `SAL-04`, `PUR-01`, `PAY-01`, `EXP-01`.

---

## PD-05 — Model the ledger on the existing DigiKhaato UdhaarBook rather than designing fresh

**Date:** 18 September 2026 · **Status:** Accepted

**Decision.** The ledger's semantics — direction conventions, the meaning of a party balance, opening balances, correction-by-reversal, fail-closed tenancy primitives and the daily-collection patterns — are **taken from the existing DigiKhaato `customer_ledger` implementation** rather than designed from first principles; canon §0.1 names it as the reference for ledger semantics alongside BrandHub for engineering conventions.

**Context.** Metis Labs already operates a working money-management product containing an udhaar ledger that has been used against real Indian small-business behaviour. Designing a ledger fresh would mean rediscovering, at cost, the things that implementation already resolved: what a debit means for a supplier, how an opening balance sits in the series, what happens when an entry is backdated past a correction.

**Options considered.** *(a) Reuse the semantics, rebuild the implementation (chosen)* — the hard-won meaning transfers; the code does not, so the new schema is designed for this product's needs (documents posting into the ledger, `source_type`/`source_id` polymorphism) rather than inherited. *(b) Reuse the code as well* — faster, and it would import a schema shaped for a different product and a tenancy model that predates this one. *(c) Design fresh* — a cleaner conceptual result and a slower one, with a real chance of getting the supplier-direction convention wrong in a way only a distributor would notice.

**Rationale.** Semantics are the expensive part and the code is the cheap part. Taking the semantics and rebuilding the implementation captures the value without importing the constraints, and it is why canon §0.2's direction table can be stated flatly rather than argued.

**Who decided.** Product owner with the engineering lead.

**Evidence relied on.** Canon §0.1 (engineering reference); canon §0.2 (ledger direction definitions); the DigiKhaato `customer_ledger` implementation itself; Part 16 §16.14 (`LON-01`–`LON-03` carried from the same source).

**What would reverse it.** Evidence that a DigiKhaato convention is wrong for this segment — most plausibly the supplier-side direction, which is the one place where "you gave / you got" and accounting intuition disagree and where a wholesaler's accountant would notice first.

**Affected features.** `LED-01`–`LED-11`; `PTY-03`; canon §0.2 and §0.7.

---

## PD-06 — Inherit Khatabook's red/green and "you gave / you got" vocabulary

**Date:** 18 September 2026 · **Status:** Accepted

**Decision.** The ledger uses the **category's established vocabulary and colour convention** — a red "You gave" (उधार दिया / naam) and a green "You got" (जमा), "You will get" and "You will give" for balances, baaki for balance, hisaab for statement, kachha and pakka bill — with colour **always paired with words** for accessibility. This convention is not improved upon.

**Context.** Every competitor in the ledger cluster uses exactly this, the colour convention is stable across all of them, and tens of millions of merchants have learned it. Inverting or "improving" it would be read as a bug by a user who has used a competitor, and would be read as nothing at all by a user who has not — so the upside is zero and the downside is real.

**Options considered.** *(a) Inherit it exactly (chosen)* — zero learning cost for a switcher; the two-button interaction is instantly legible. Consequence: the product looks familiar, which is a positioning cost in a demo to an investor and a benefit to every actual user. *(b) Use accounting vocabulary (debit/credit, receivable/payable)* — precise, and wrong for the user; Part 18 §18.5 principle P4 is explicit that the product uses the user's words, not accounting's. *(c) Invent a clearer vocabulary* — the option that feels like product work and is not; the words are not confusing, they are unfamiliar only to people outside the market.

**Rationale.** Parity conventions are not differentiators and must not be built as if they were. The differentiation is elsewhere (`PD-04`, `PD-11`, `PD-17`); spending novelty on the one interaction the user already knows is the classic way to lose a first session.

**Who decided.** Product owner.

**Evidence relied on.** Part 9 §9.7 (the conventions UdhaarBook must honour) and §9.8 (what UdhaarBook copies deliberately) `[R2 §A.1]`; Part 11 §11.1 (the two-button party ledger as table stakes); Part 23 (colour-plus-word rule).

**What would reverse it.** Nothing plausible. Accessibility work may change *how* red and green are rendered — contrast, pairing, non-colour indicators — but not what they mean.

**Affected features.** `LED-01`, `LED-04`, `PTY-02`, `PTY-03`, `RPT-01`; every locale file.

---

## PD-07 — Adopt Zoho's status vocabularies; reject its module sprawl

**Date:** 18 September 2026 · **Status:** Accepted

**Decision.** Document status vocabularies are taken from the mature model the category has converged on — `draft`, `issued`, `partially_paid`, `paid`, `overdue`, `void` for invoices; `draft`, `sent`, `accepted`, `rejected`, `expired`, `converted` for estimates; and the corresponding purchase and credit-note sets — **while explicitly rejecting the module and entity sprawl** that the same product family exhibits.

**Context.** The Zoho corpus provided two very different lessons. Its status models, document kinds and conversion flows are well-designed, battle-tested and worth copying outright. Its evolution shows a product that re-modelled core entities twice in five years and spent a third of its release notes on report columns — the signature of breadth accumulating faster than depth.

**Options considered.** *(a) Take the vocabularies, refuse the sprawl (chosen)* — canon §0.7 fixes the status codes once so no feature invents its own, while canon §0.3's module map fixes what exists and when. Consequence: the statuses are slightly richer than the MVP strictly needs, which is deliberate, because a status added later is a migration. *(b) Invent a minimal status set* — fewer states now and a migration the first time a merchant needs "partially paid". *(c) Follow the Zoho model more completely, including its module structure* — a far larger product for a segment already served by a two-and-a-half-million-business incumbent with a twenty-eight-thousand-partner channel.

**Rationale.** Status vocabularies are cheap to get right by copying and expensive to change; module structure is the opposite — cheap to defer and ruinous to over-build. Taking one and refusing the other is the whole of this decision.

**Who decided.** Product owner.

**Evidence relied on.** Parts 5–7 (the Zoho corpus, including its evolution and release-note analysis) `[R1 §C.3 lessons 5, 7]`; canon §0.7; Part 1 §1.10 risk 5 (scope gravity).

**What would reverse it.** A status the model cannot express arriving from a real workflow — which is a Class C change adding a code to canon §0.7, not a redesign.

**Affected features.** `SAL-01`–`SAL-06`, `PUR-01`–`PUR-04`, `PAY-01`, `PAY-05`, `EXP-01`, `LED-03`; canon §0.7.

---

## PD-08 — Build white-label into the MVP chassis rather than retrofit it

**Date:** 18 September 2026 · **Status:** Accepted

**Decision.** The **Partner entity, the three-level configuration chain (Metis default → partner → tenant), runtime branding through CSS variables, module entitlements and partner-scoped messaging identity are part of the MVP chassis** (`WLB-01`, `WLB-02`, `PLT-14`, `PLT-15`), even though the partner-facing features that use them (`WLB-03`–`WLB-06`) are Phase 2 and are gated on a named partner with signed intent.

**Context.** The channel, not the app store, is how software reaches Indian small businesses: the incumbents move volume through tens of thousands of resellers, and every distribution owner in this market — payments platforms, banks, telecoms, FMCG brands — has built or bought some merchant tool and stopped at the layer adjacent to its own revenue. A product designed for partner resale from the first migration is a different product from one that adds a branding screen in year three.

**Options considered.** *(a) Chassis at MVP, partner features at Phase 2 (chosen)* — the expensive part (a `partner_id` on the right tables, a resolution chain, branding as tokens rather than constants) is nearly free at MVP and nearly impossible later; the cheap part (a partner console, custom domains) waits for a real partner. Consequence: some MVP complexity serving nobody visible. *(b) Everything at Phase 2* — a simpler MVP and a retrofit that touches branding, entitlements, messaging identity and the theme layer simultaneously. *(c) Everything at MVP* — building a partner console for zero partners, which Part 13 §13.3 explicitly forbids.

**Rationale.** The split is drawn exactly at the line between what is structural and what is surface. Structure that is cheap now and expensive later goes in; surface that is expensive now and cheap later waits. The same split protects against building speculatively for a partner who never signs (`RSK-22`).

**Who decided.** Product owner.

**Evidence relied on.** Part 3 §3.7 (distribution channels) and §3.11 Finding 10 (white-label demand plausible but unproven) `[R3]`; Part 11 §11.2 (white-label as an architecture); Part 13 §13.3 entry criteria.

**What would reverse it.** Sustained evidence that no partner will contract — in which case `WLB-03`–`WLB-06` are never built and the chassis remains as a small, harmless overhead. The chassis itself is not reversible in practice and is not meant to be.

**Affected features.** `WLB-01`, `WLB-02`, `PLT-14`, `PLT-15`; Phase 2 `WLB-03`–`WLB-06`; Part 24 in full.

---

## PD-09 — Local-first and minimal-dependency, because it runs for personal use first

**Date:** 18 September 2026 · **Status:** Accepted

**Decision.** The product is built to **run from one `docker-compose` stack on one machine with a short, closed dependency list**, because its first deployment is personal use by its own builder — and this constraint is kept afterwards because it is simultaneously a commercial advantage.

**Context.** The ordinary justification for austere infrastructure is cost. Here the first reason is more mundane: the product must run, completely, on a developer's machine, for one person, before anyone else sees it. That forces every capability to have a working local path — a console SMS backend, a browser print path, local file storage, a cron-driven job runner. Once that constraint exists, it turns out to coincide with what banks, NBFCs and distributors want from a product they will put through procurement.

**Options considered.** *(a) Local-first and minimal (chosen)* — the product is complete on one machine; a partner's operations team can run it; a security review counts a small number of dependencies and no managed services. Consequence: several capabilities are written in-house that a library would do better (`RSK-14`), and scaling is a ladder rather than a switch (`RSK-08`). *(b) Cloud-native from the start (managed Postgres, S3, Redis, a queue, a flag service, an analytics SDK, an error tracker)* — faster to build several features, and it would make local personal use impossible, make partner-hosted deployment impossible, and put merchant data into six third-party surfaces that a DPDP assessment would have to enumerate. *(c) Minimal at MVP, cloud-native at Phase 2* — plausible, and it would mean re-deciding every one of these at the moment the team is smallest and busiest.

**Rationale.** The personal-use constraint is what makes the austerity real rather than aspirational, and the commercial benefit — Part 11 §11.2's argument that a product running on a single VPS with PostgreSQL and no managed services is sellable into places a Kubernetes-plus-Redis-plus-S3 product cannot enter without a six-month review — is a genuine second reason rather than a rationalisation.

**Who decided.** Product owner with the engineering lead.

**Evidence relied on.** Part 11 §11.2 (deployable by the partner, on one machine); Part 18 §18.10 C1–C5; Part 27 §27.13 (dependency policy as a security control); judgement on the personal-use requirement, which is a stated premise rather than research.

**What would reverse it.** A partner requiring managed infrastructure they will not host, or the scaling ladder in Part 29 §29.10 being exhausted. Neither reverses the *dependency* half, which is amended record by record (ADR-021).

**Affected features.** All; specifically the decisions carried by ADR-012, ADR-013, ADR-014, ADR-018, ADR-019, ADR-021.

---

## PD-10 — Fourteen explicit non-goals, each with a reversal trigger

**Date:** 18 September 2026 · **Status:** Accepted

**Decision.** Fourteen capabilities are **excluded rather than deferred** — full double-entry accounting, payroll, e-commerce storefronts, CRM, multi-currency, manufacturing BOM and WIP, lending inside the core flows, in-app advertising, direct GST filing or being a GSP, bank feeds and account aggregation, native applications at MVP, marketplace and shipping integrations, loyalty and coupon engines, and any workflow or formula builder — and **each carries a written reversal trigger** that must be demonstrably met, through a Class C change recorded here, before it can be built.

**Context.** Exclusions without triggers become dogma and are eventually broken by whoever is most insistent. Exclusions with triggers are decisions that can be revisited on evidence, which is both more honest and more durable. The triggers are deliberately hard.

**Options considered.** *(a) Excluded with triggers (chosen)* — a request can be answered by naming the evidence that would change the answer, which is more useful to the requester than "out of scope"; the triggers are checked at each phase boundary against real telemetry and churn interviews. *(b) Excluded absolutely* — cleaner, and guarantees the reversal happens implicitly, one small feature at a time, which is how a ledger app becomes an unfinished accounting package. *(c) Deferred to a phase* — the worst option, because it puts an unbounded commitment on a roadmap and invites the requester to ask when.

**Rationale.** Four of the fourteen are supported by direct negative evidence rather than judgement: three separate storefront products aimed at this exact user were built and shut within a year or two; lending produced revenue and equal losses for the category leader and now dominates its negative reviews, while its closest competitor reached profitability only after exiting lending under regulatory pressure. One exclusion — in-app advertising and interstitial upsell — has **no trigger at all**, because it is ranked first among complaints for the ad-supported competitor and because an interruption between "You gave" and "Saved" destroys the eight-second budget that `LED-01` exists to protect.

**Who decided.** Product owner.

**Evidence relied on.** Part 11 §11.3 (the full table with triggers); Part 9 §9.4, §9.10 (the monetisation lesson and MyStore's closure) `[R2 §A.0, §B.4]`; Part 3 §3.11 `[R3]`; Part 18 §18.3.2 (N1–N14).

**What would reverse it.** Each item's own trigger, met and demonstrated, with a record in this log. Item 8 (advertising) has none.

**Affected features.** The `accounting`, `loans` and marketplace entries in canon §0.3; `INV-19`; the absence of everything else.

---

## PD-11 — The paid wall sits at the transition to a staffed business

**Date:** 18 September 2026 · **Status:** Accepted

**Decision.** The ledger tier is **permanently free, unmetered and ad-free** — parties, entries, statements, reminders, UPI QR, one user, one business — and the **paid wall sits at multiple devices and users with roles, inventory and GST billing depth, server-sent messaging, exports and the accountant hand-off**; the accountant seat is free in every tier; prices are published and renewals grandfathered.

**Context.** This is the category's defining commercial problem. Fifty million installs and ten million monthly actives produced essentially no software revenue for the leader, which then pivoted to lending and lost as much as it earned. A competitor reached profitability with 2 lakh-plus paying shopkeepers on ₹30–₹99 monthly plans after exiting lending, with its wall at unlimited transactions, advertisement removal, multi-device, GST bills, a defaulters view, desktop and stock. A third proved the same shape from the other direction — mobile free forever, desktop paid, roughly 2 % conversion on ten million registrations.

**Options considered.** *(a) Wall at the staffed-business transition (chosen)* — what people pay for is the transition from a one-person notebook to a business with staff, a counter, stock and a CA; that transition is a real, legible event in a merchant's life. Consequence: the free tier is generous, so conversion pressure is real (`RSK-01`). *(b) Meter the ledger (transaction caps)* — the most direct path to revenue and the one that destroys the habit the product exists to create. *(c) Ads on the free tier* — excluded by `PD-15`. *(d) Free everything, monetise through lending or data* — the thesis that failed, publicly and expensively.

**Rationale.** The wall is placed before launch rather than discovered after, and `PLT-15` ships at MVP so it is enforceable from day one. The exact number and billing shape remain open (`OQ-02`), but the *placement* is decided and is the part that constrains the product.

**Who decided.** Product owner with the commercial owner.

**Evidence relied on.** Part 9 §9.4, §9.10 `[R2 §A.0, §B.3, §B.4]`; Part 3 §3.5, §3.6 (price bands and conversion) `[R3 §3.1, §3.4]`; Part 1 §1.9; Part 11 §11.2.

**What would reverse it.** Conversion below 1 % at month nine moves the wall — most plausibly making multi-device the first, cheapest paid step — but does not meter the ledger. Metering the ledger is off the table.

**Affected features.** `PLT-15`, `PLT-16`, `PLT-04`, `PLT-05`, `INV-*`, `SAL-02`, `LED-07`, `LED-08`, `RPT-08`, `IMP-02`.

---

## PD-12 — English and Hindi at MVP, every string keyed from the first commit

**Date:** 18 September 2026 · **Status:** Accepted

**Decision.** The MVP ships **English and Hindi, complete, across the entire product** — not just the ledger — with every user-visible string keyed in both locales from the first commit and a missing key treated as a release blocker; further languages are funded projects, not JSON files.

**Context.** The owner-operator in this market is typically 45–54 years old and more than half of small businesses report that finding and setting up digital tools is hard. The ledger-cluster competitors ship ten to thirteen languages in the ledger and English in the billing tier; the billing-cluster competitors collect "missing multilanguage support" as a standing complaint. Retrofitting i18n into a mature billing UI is a months-long project with no visible feature at the end.

**Options considered.** *(a) Two locales, complete, from commit one (chosen)* — the discipline cost is paid continuously and is trivially copyable in principle, very rarely copied in practice; a third language becomes translation and support capacity rather than engineering. Consequence: every PR is slightly slower and Hindi financial vocabulary needs native review. *(b) English first, Hindi later* — the option most teams take, and the one that guarantees a months-long retrofit plus a period during which the target user cannot use the product. *(c) Ten languages at MVP, ledger only* — matches the ledger cluster and abandons the "vernacular parity across the whole product" differentiator, which is the point.

**Rationale.** Language is not decoration for this user; it is access. And the decision is asymmetric — keying strings from the start costs a little every day, while retrofitting costs months once.

**Who decided.** Product owner.

**Evidence relied on.** Part 11 §11.1 (Hindi as table stakes) and §11.2 (vernacular parity as a differentiator) `[R3]`; Part 3 §3.8 (regional and language considerations) `[R3]`; Part 9 §9.7 (the language picker as the first screen) `[R2 §A.1 F1]`; canon §0.11 rule 6.

**What would reverse it.** Nothing reverses the two-locale policy. Which language is third, and when, is `OQ-08`.

**Affected features.** All; `locales/en.json`, `locales/hi.json`; Part 18 §18.13 R5.

---

## PD-13 — No A/B testing at MVP

**Date:** 18 September 2026 · **Status:** Accepted

**Decision.** The MVP ships **one version of every flow**; there is no experimentation framework, no variant assignment and no split traffic. Product decisions at MVP are made from qualitative evidence, funnel telemetry and pilot observation.

**Context.** A/B testing requires enough simultaneous users in one flow to reach significance. At the MVP's scale — hundreds of tenants, a pilot of ten, an activation funnel measured in dozens per week — a test would take months to resolve and would resolve nothing, while adding a variant-assignment mechanism, a second code path per experiment and a source of support confusion ("my screen looks different from his").

**Options considered.** *(a) No experimentation (chosen)* — one code path, one thing to support, and decisions made from watching ten merchants use the product, which at this scale is genuinely better evidence than an underpowered test. Consequence: some design questions are settled by judgement that could later be settled by data. *(b) A flag-driven manual split* — cheap, since ADR-040's configuration rows could carry a variant; rejected because it invites the analysis that the sample cannot support. *(c) A third-party experimentation platform* — a dependency and a data flow (ADR-021, ADR-028) for a capability with no statistical basis at this scale.

**Rationale.** Underpowered experiments produce confident wrong answers, which are worse than admitted judgement. The funnel instrumentation of Part 31 exists to show *where* users drop, which is actionable without a control group; understanding *why* comes from the pilot and from support, not from a variant.

**Who decided.** Product owner.

**Evidence relied on.** Part 18 §18.12 (metric targets, which imply the sample sizes available); Part 1 §1.11 (six- and twelve-month adoption targets); judgement on statistical power.

**What would reverse it.** A flow with enough weekly traffic for a two-week test to reach significance — realistically Phase 3 at the earliest — *and* a specific question worth the second code path. Onboarding is the only plausible first candidate.

**Affected features.** None directly; it constrains how `PLT-03`, `LED-01` and the activation funnel are iterated.

---

## PD-14 — GST compliance *outputs* at MVP; automation in Phase 3

**Date:** 18 September 2026 · **Status:** Accepted

**Decision.** The MVP produces **compliant GST documents and preparation aids** — a Rule 46-complete tax invoice, a bill of supply for composition dealers, an estimate for the kachha-bill habit, credit notes, and a GST summary that reconciles to the sales register as a GSTR-1/3B preparation aid with CSV and Excel export — and **does not file anything**; e-invoicing with IRN, e-way bills, GSTR-1 JSON and Tally XML are Phase 2 and Phase 3, and direct filing or acting as a GSP is excluded outright.

**Context.** Compliance is the reason Indian small businesses buy software at all, and non-compliance is expensive: a series with a gap, a wrong place of supply, or a rate applied from the wrong period produces a revised filing, a notice, or a buyer who loses input credit. But the accountant already files, and filing requires GSP accreditation or a GSP contract plus liability for a failed submission at a statutory deadline.

**Options considered.** *(a) Correct outputs at MVP, automation later (chosen)* — the purchase trigger is satisfied, the accountant is served, and no statutory liability is taken on before a compliance owner exists. Consequence: a merchant crossing the e-invoicing threshold cannot legally use the product for B2B invoices until `SAL-12` ships, which must be said in sales conversations rather than discovered (`RSK-29`). *(b) e-Invoicing at MVP* — serves the upper tail immediately; requires a GSP relationship, schema conformance testing, IRN cancellation windows and a failure design for a government API that is sometimes unavailable at a deadline — eight weeks with a compliance owner, before any base exists. *(c) Outputs only, permanently* — abandons the upmarket retention that Phase 3 exists to provide, making growth a churn event.

**Rationale.** Correctness at MVP is non-negotiable and is a release gate: the GST summary reconciles to the sales register to the rupee, the fixture suite covers every slab and supply direction including a document dated before the 22 September 2025 restructure, and invoice numbering is verified under concurrency and across the financial-year boundary. Automation is expensive, compliance-bound, narrow and best built when it has a named first customer.

**Who decided.** Product owner with the compliance owner.

**Evidence relied on.** Part 3 §3.4 (the GST forcing function, the slab restructure, e-invoice and e-way thresholds as tier-up triggers) `[R3]`; Part 3 §3.11 Finding 7 `[R3]`; Part 11 §11.3 item 9; Part 13 §13.4; Part 18 §18.3.1 G4.

**What would reverse it.** The e-invoicing threshold descending onto a material share of the base (`RSK-29`) pulls `SAL-12` forward. Direct filing reverses only under Part 11 §11.3 item 9's trigger.

**Affected features.** `SAL-01`, `SAL-02`, `SAL-04`, `RPT-07`, `RPT-08`; Phase 2 `RPT-12`; Phase 3 `SAL-12`, `SAL-13`, `RPT-13`; the `tax_rate` effective-date design.

---

## PD-15 — No advertising, no lending banners, and a price that does not move

**Date:** 18 September 2026 · **Status:** Accepted

**Decision.** There is **no in-app advertising, no interstitial upsell, no lending banner and no referral gamification in core flows**; prices are **published, grandfathered on renewal, and offered with multi-year options**; lending is not a first-party revenue line.

**Context.** Three of the category's top complaints are addressed here at once: intrusive advertising is ranked first against the second-largest ledger app; loan-processing delays and rejections dominate the largest one's recent reviews and pollute a bookkeeping product; and renewal price rises rank third across the whole category as a churn trigger.

**Options considered.** *(a) None of the three (chosen)* — it forgoes an easy revenue line on a large free base and makes the paid wall of `PD-11` carry the whole load; it is also a business-model choice a competitor funded on a lending thesis structurally cannot copy, which is the defensibility argument. *(b) Ads on the free tier only* — the conventional answer, and it puts an interruption inside the eight-second counter loop that `LED-01` exists to protect. *(c) Lending as an opt-in module* — permitted only in the form Part 11 §11.3 item 7 describes: a partner originates, UdhaarBook provides consented exportable ledger data and the consent record, and the loan journey stays in the partner's app.

**Rationale.** These are not ethical gestures; they are the three specific behaviours that the research shows destroy trust in this category, and trust is the product's asset. The pricing half is equally concrete: Indian SMB products are priced flat per business with user counts as tier steps, per-user pricing draws tier-gating complaints, and renewal rises are a top-three churn trigger — so published and grandfathered prices are a direct response to measured behaviour.

**Who decided.** Product owner with the commercial owner.

**Evidence relied on.** Part 9 §9.4, §9.10 `[R2 §A.0, §A.1 F20, §D]`; Part 3 §3.5 (what triggers churn) `[R3 §3.3]`; Part 11 §11.2, §11.3 items 7 and 8; Part 1 §1.9.

**What would reverse it.** The advertising exclusion has **no trigger**. The lending exclusion reverses only into the partner-originated shape above. Pricing structure is `OQ-02`; the *published and grandfathered* commitments are not open.

**Affected features.** The absence of an ad surface; `PLT-15`, `PLT-16`; `LON-01`–`LON-03` as a bookkeeping module only.

---

## PD-16 — The partner channel is a parallel revenue path, not a later add-on

**Date:** 18 September 2026 · **Status:** Accepted

**Decision.** White-label partner resale is treated as a **second, independent revenue line developed in parallel with self-serve**, priced per **active merchant** rather than per seat, with **support ownership contractual — partner at L1, Metis at L2**.

**Context.** Reseller distribution is the proven Indian SMB go-to-market: one incumbent has 28,000 partners, another 27,000 with top partners earning ₹2 lakh a month. Meanwhile self-serve conversion in this category runs around 2 %. Treating the channel as something to build after self-serve works makes the company's survival depend entirely on beating a benchmark that nobody in the category has beaten.

**Options considered.** *(a) Parallel channel from the start (chosen)* — two independent paths to revenue, and the chassis for it is already an MVP decision (`PD-08`). Consequence: partner concentration becomes a first-order risk (`RSK-22`) and partner requests distort the roadmap unless managed. *(b) Self-serve first, channel later* — simpler focus, and it bets everything on `RSK-01` resolving favourably. *(c) Channel only, no direct sign-up* — the fastest route to revenue per merchant and the slowest to product feedback, since the partner mediates every conversation with a user.

**Rationale.** The per-active-merchant unit aligns the partner's revenue with usage rather than with a one-off sale, which is what funds the ongoing support obligation. The L1/L2 split is contractual because support is simultaneously the biggest failure mode and the biggest cost in this market (`RSK-06`).

**Who decided.** Commercial owner with the product owner.

**Evidence relied on.** Part 3 §3.7 (distribution channels) and §3.11 Finding 10 `[R3 §8.1, §9 #9]`; Part 1 §1.9; Part 11 §11.2 (white-label as an architecture).

**What would reverse it.** Partner conversations failing to advance across an extended period would make the channel a hypothesis rather than a path, and would return the weight to self-serve — with `RSK-01`'s stop-and-rethink conditions then applying in full.

**Affected features.** `WLB-01`–`WLB-06`, `PLT-14`, `PLT-15`; `OQ-26`, `OQ-04`, `OQ-05`.

---

## PD-17 — Immutability is a user-visible promise, not an internal property

**Date:** 18 September 2026 · **Status:** Accepted

**Decision.** The fact that entries and stock movements are never edited or deleted is **shown to the merchant** — a correction posts a visible reversal and replacement with a mandatory typed reason, the statement carries a toggle to show or hide corrections, the shared statement shows the same history, and the audit log records who did what with before and after. Immutability is a feature, not an implementation detail.

**Context.** The second-most-common complaint across the whole category is data integrity: balances that change, entries that vanish after an update, "cost me thousands" reviews. Competitors that shipped mutable, soft-deletable transaction rows cannot retrofit immutability without a migration that rewrites every historical balance. Meanwhile the merchant's actual need is narrower and sharper: when a customer disputes a balance, the merchant must be able to show what was written and when.

**Options considered.** *(a) Immutable and visible (chosen)* — the strongest possible answer to the category's worst complaint, and the property that makes the data underwriting-grade, which is what a lending partner actually wants to buy. Consequence: a correction produces two rows where a user expects an edit, so the UI must explain it, and a mass correction is highly visible (`RSK-09`). *(b) Immutable internally, corrections presented as edits* — a smoother interface, and it throws away the entire trust proposition, because a merchant who cannot *see* the history cannot use it in an argument. *(c) Mutable rows with an audit trail* — what most products do; the audit trail lives in a screen nobody opens and answers no dispute.

**Rationale.** The thing being sold is a book that can settle an argument. A book that can be quietly changed cannot. Making the mechanism visible is what converts an engineering invariant into a reason to choose the product, and the mandatory reason field is what makes the history legible rather than merely present.

**Who decided.** Product owner with the engineering lead.

**Evidence relied on.** Part 3 §3.11 Finding 5 (data-integrity failures cause irreversible churn) `[R3 #11, §3.3]`; Part 11 §11.2; Part 18 §18.3.1 G3 and §18.5 principle P2; canon §0.11 rule 1.

**What would reverse it.** Nothing. Usability work may change *how* corrections are presented — grouping a system-correction batch under one heading is exactly such a change (`OQ-25`) — but not whether they are shown.

**Affected features.** `LED-03`, `LED-04`, `PLT-08`, `PTY-09`, `SAL-05`, `PUR-04`, `PAY-05`, `INV-06`; ADR-029, ADR-030.

---

## PD-18 — The cut-line order is agreed before the pressure, not during it

**Date:** 18 September 2026 · **Status:** Accepted

**Decision.** A **never-cut list** and a **ten-item ordered cut list** are fixed in advance (Part 12 §12.7). If the build runs late, scope is cut in that order, mechanically; every cut is a Class C change recorded in this log with its reason and the release it returns in.

**Context.** Scope is cut under schedule pressure in every project. The only question is whether the order was decided calmly or argued at the worst moment by whoever is most senior in the room. An order decided in advance is also a statement of what the product actually is: the never-cut list is the definition.

**Options considered.** *(a) Pre-agreed ordered cut list (chosen)* — the decision becomes mechanical rather than political; the never-cut list makes "we shipped something else and called it the MVP" impossible to do accidentally. Consequence: the order must be right, and defending it under pressure still requires someone to say no. *(b) Decide when it happens* — maximum flexibility and maximum politics. *(c) Never cut; move the date* — honest, and only available to a team with no external commitment; it also tends to produce a date that moves repeatedly rather than once.

**Rationale.** Two rules in the policy carry most of its value. First, **cutting depth inside a kept feature is preferred to cutting a feature**, but only where the FRD names a reduction that does not break an acceptance criterion. Second, **a cut that removes an `en`/`hi` key, a permission check, an audit row or a test is not a cut — it is a defect**, forbidden by canon §0.11 rule 6. Without those two rules the list would be an invitation to ship a hollow version of everything.

**Who decided.** Product owner with the engineering lead.

**Evidence relied on.** Part 12 §12.7 (the list itself); Part 1 §1.10 risk 5 (scope gravity) `[R1 §C.3]`; judgement on project behaviour under pressure.

**What would reverse it.** The order is revised at phase boundaries as features change; the *existence* of a pre-agreed order is not open. Note that `PLT-10` (export and deletion) sits on the cut list solely so nobody cuts it silently — it is a DPDP obligation and cutting it requires a documented manual process recorded here.

**Affected features.** The never-cut set (`PLT-01`, `PLT-03`, `PLT-05`, `PLT-06`, `PTY-01`–`PTY-03`, `LED-01`–`LED-04`, `LED-09`, `LED-10`, `SAL-02`, `SAL-03`, `PAY-01`, `INV-01`, `INV-02`, `RPT-01`, `NTF-03`, `IMP-01`) and the ordered ten.

---

## PD-19 — Simplify rather than omit, with a stated growth path for each reduction

**Date:** 18 September 2026 · **Status:** Accepted

**Decision.** Twelve capabilities that the category over-builds are shipped in a **deliberately reduced form with a written growth path**, rather than omitted or built in full: warehouse management reduced to locations; price lists to a per-party default; approval workflows to reason capture; costing to weighted average; tax to GST with rate history; reports to a fixed set with good filters and export; document numbering to one series per kind per financial year; custom fields to notes and tags; roles to four; PDF to two client-side templates; notifications to an inbox plus adapters; and search to per-list server search.

**Context.** Between "we do not have that" and "we have the full version" there is almost always a reduced form that covers the behaviour the target user actually performs. The distinction that makes this work is between a reduction with a growth path and a reduction that is a dead end — the former is a scope decision, the latter is a future rewrite.

**Options considered.** *(a) Reduce with a growth path (chosen)* — the merchant gets the outcome, the team ships, and the extension is designed rather than discovered. The clearest example is approval workflows: no product in this segment has a working approval chain because the person who would approve is standing next to the person who acts, so UdhaarBook replaces the workflow with accountability — a mandatory typed reason, a plain-language consequence preview ("Stock +2, Ledger −₹898"), an audit row with before and after, and a permission that separates who may do it at all. That delivers what an approval chain is bought for at a fraction of the interface. *(b) Build the full version* — each one is weeks and several are months, and together they are the incumbents' product. *(c) Omit entirely* — several of these are parity items whose absence is disqualifying in the first session.

**Rationale.** Part 11 §11.5 states the rule that makes this durable: a **Differentiating** item that appears to require un-simplifying a **Simplify** item is a Class C change, and the simplification's growth path should be examined first. Credit control is a differentiator delivered by a nullable limit, three modes and an audited override — not by a credit-approval workflow.

**Who decided.** Product owner.

**Evidence relied on.** Part 11 §11.4 (the twelve reductions with their growth paths); Part 5 (Zoho capability depth as the comparison) `[R1]`; Part 3 §3.11 Finding 6 (the open middle) `[R3]`; Part 18 §18.5 principle P5.

**What would reverse it.** Each reduction has its own growth path and its own phase. Reversing one early is a Class C change requiring the trigger in Part 11 §11.4's relevant entry.

**Affected features.** `INV-11`, `INV-13`, `PTY-05`, `PTY-06`, `PLT-12`, `SAL-03`, `NTF-01`, `NTF-02`, `RPT-01`–`RPT-08`, `platform_document_sequence`, `UbReasonDialog`.

---

## PD-20 — Be honest about what the product cannot see

**Date:** 18 September 2026 · **Status:** Accepted

**Decision.** Where the product cannot observe something, it **says so in the interface and offers the shortest manual path**, rather than inferring, hiding or pretending. The canonical case: a payment made to a static UPI QR is invisible to the server, so the product states that and gives a one-field "I received it by UPI, here is the UTR" entry; credits that arrive without context appear in a visible unmatched queue rather than disappearing.

**Context.** The number-one collection complaint in this category is "money debited, ledger not updated". It happens because a static QR carries no party context and nothing calls the merchant's system back. Competitors with payment-aggregator revenue have an incentive to hide the unmatched case rather than surface it, because a queue that says "three payments arrived that we could not place" is an admission they are reluctant to make.

**Options considered.** *(a) State the limit, provide the manual path (chosen)* — the merchant's mental model matches reality, which is what prevents the complaint; the unmatched queue turns an invisible failure into a one-tap correction with a learned payer-VPA-to-party association. Consequence: the product demos as less magical than a competitor that claims automatic reconciliation. *(b) Infer the match heuristically and post it* — impressive when right and catastrophic when wrong, because a wrong ledger entry is precisely what `PD-17` exists to prevent. *(c) Say nothing and let the merchant discover it* — the category norm, and the source of the complaint.

**Rationale.** This is principle P7 in Part 18 §18.5 and it generalises beyond payments: an SMS whose delivery cannot be confirmed is logged as `skipped` rather than `sent`; a stock figure derived from movements is not presented as a physical count; a report over a filtered set totals the filtered set and says so. Every one of these is a small admission that compounds into a product a merchant can reason about.

**Who decided.** Product owner.

**Evidence relied on.** Part 11 §11.2 (honest payment reconciliation as a differentiator) `[R3]`; Part 3 §3.11 (collection complaints) `[R3]`; Part 18 §18.5 principle P7.

**What would reverse it.** Nothing. A payment aggregator (`PAY-06`) removes the *need* for the admission in one case by making the payment observable; it does not change the principle.

**Affected features.** `PAY-01`, `PAY-03`, `PAY-06`, `PAY-07`, `NTF-02` (`skipped` status), `INV-08`, `RPT-*` totals.

---

## 39.3 How decisions enter and leave this log

**Entering.** A product decision is recorded here when it (a) changes scope, (b) reverses or partially reverses an item on the Avoid list of Part 11 §11.3, (c) cuts a feature under Part 12 §12.7, (d) changes the commercial model, (e) changes a target segment or market, or (f) resolves an open question from Part 37 in a way that binds the product. Class A editorial changes and Class B canon change requests do not require a record; Class C changes always do.

**Format discipline.** A record without an **Evidence relied on** field naming either a research source or the word "judgement" is incomplete. A record without a **What would reverse it** field is a belief, not a decision, and must not be merged.

**Leaving.** A decision is never deleted. It is marked superseded with a date and a pointer to the record that replaced it, and the replacement's Context states what changed — new evidence, a met trigger, or a failed assumption. The history of superseded decisions is the most useful part of this log to a reader two years from now, because it shows which of the current decisions were once confident and wrong.

**Review.** The Avoid-list triggers in Part 11 §11.3 are checked at every phase boundary against real telemetry and churn interviews, and the outcome of each check — met, not met, or no longer relevant — is recorded here even when nothing changes. A trigger that is never checked is a trigger that will eventually be bypassed rather than met.

**Relationship to the other registers.** Part 36 holds risks, Part 37 holds questions not yet decided, Part 38 holds technical decisions, and this part holds product decisions. A question in Part 37 that is answered becomes either a record here or an ADR in Part 38, and the Part 37 entry is closed with a pointer. A decision here that creates a new exposure creates a record in Part 36. Nothing is recorded in two places.

---

**End of Part 39.**
