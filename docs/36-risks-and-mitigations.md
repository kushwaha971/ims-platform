# Part 36 — Risks and Mitigations

> **Status:** normative for risk ownership and review cadence; advisory in its probability estimates. This part supersedes the summary risk list in Part 18 §18.14, which named five risks that bear on the requirements document. Every risk named there appears here with a full record (`RSK-01`, `RSK-02`, `RSK-03`, `RSK-22`, `RSK-04`), and Part 18 §18.14 should be read as an index into this register rather than as an independent list. Part 1 §1.10's top-five risks are likewise absorbed: they map to `RSK-01`, `RSK-06`, `RSK-16`/`RSK-13`, `RSK-26` and `RSK-04`.

## 36.1 Why this register exists, and what it is for

A specification of this size has a characteristic failure mode: it is so complete that it reads as though the outcome is determined. It is not. DigiKhaato is a product built against a category in which the two most-funded participants each proved something uncomfortable — that fifty million people will install a free ledger and almost none of them will pay for it, and that a paid billing product can spend two rupees to earn one. The specification is an argument that there is a viable shape between those two, built by a very small team, on a deliberately austere technical base. Every part of that argument can fail, and this register is the list of ways.

The register is not a compliance artefact. It exists to do four specific jobs.

**It names the failure modes in concrete terms**, so that a risk can be recognised while it is happening rather than after. "Adoption risk" is not actionable. "Merchants complete sign-up, create fewer than five parties, and never return, because entering thirty opening balances by hand takes ninety minutes they do not have" is actionable, because it tells you what to measure and what to build.

**It ties every mitigation to something that already exists in the specification** — a feature ID from Part 16, an architecture decision from Part 38, a canon rule from Part 0 §0.11, a test from Part 28. A mitigation that is not carried by a named artefact is an intention, and intentions do not survive a schedule. Where a mitigation is *not* yet carried by anything, this register says so plainly and the gap becomes an entry in Part 37.

**It separates prevention from contingency.** Most risk registers conflate the two and end up listing only prevention, which leaves the team with nothing to do on the day the risk materialises anyway. Each record here states what happens *if it happens* — who is called, what is switched off, what is communicated, and what the recovery costs.

**It assigns an owner and a cadence**, because an unowned risk is reviewed at the moment it becomes an incident.

### 36.1.1 Rating scales

**Likelihood** is rated over the eighteen months from MVP build start: `Low` (below roughly one in five), `Medium` (roughly one in five to one in two), `High` (better than even). Each rating carries its reasoning in the record, because the reasoning is more durable than the letter — a rating derived from "the same thing happened to three products in this category" survives a change of estimator, and one derived from intuition does not.

**Impact** is rated on the harm to the product's ability to continue: `Low` (absorbed within a phase), `Medium` (costs a phase, a partner, or a cohort), `High` (threatens the product or the company's ability to operate it). Financial loss, merchant harm, regulatory exposure and reputational damage are all folded into this single scale deliberately; splitting them produces four columns nobody reads.

**Severity** is the product, with judgement applied at the boundaries:

| | Impact Low | Impact Medium | Impact High |
|---|---|---|---|
| **Likelihood High** | Medium | High | **Critical** |
| **Likelihood Medium** | Low | Medium | **High** |
| **Likelihood Low** | Low | Low | Medium |

A `Critical` risk is reviewed weekly and has a named contingency that has been rehearsed. A `High` risk is reviewed at every sprint boundary. `Medium` and `Low` are reviewed at phase boundaries.

### 36.1.2 Owners

Five owner roles appear throughout. At MVP several are held by the same person, which is itself `RSK-17`.

| Owner | Scope |
|---|---|
| **Product owner** | Scope, sequencing, the paid boundary, adoption and retention metrics, the Avoid list of Part 11 §11.3 |
| **Engineering lead** | Architecture, correctness, performance budgets, the dependency allow-list, deployment and data integrity |
| **Compliance owner** | GST correctness, DPDP posture, DLT and messaging compliance, retention, breach response |
| **Operations** | Deployment, backups and restore drills, availability, incident response, support routing |
| **Commercial owner** | Pricing, partner contracts, channel economics, renewal and churn |

---

## 36.2 The register at a glance

| ID | Risk | Category | L | I | Severity | Owner | Review |
|---|---|---|---|---|---|---|---|
| `RSK-01` | The free tier does not convert | Product/market | **H** | **H** | **Critical** | Commercial | Monthly |
| `RSK-02` | Adoption stalls at the migration step | Product/market | **H** | **H** | **Critical** | Product | Weekly during pilot |
| `RSK-03` | The product is slower than the pencil at the counter | Product/market | M | **H** | High | Engineering | Every sprint |
| `RSK-04` | Scope creep from the business-type-agnostic promise | Product/market | **H** | M | High | Product | Every sprint |
| `RSK-05` | A competitor closes the gap before the base exists | Product/market | M | M | Medium | Product | Quarterly |
| `RSK-06` | Support becomes the product | Product/market | **H** | M | High | Operations | Monthly |
| `RSK-07` | Two languages are not enough | Product/market | M | M | Medium | Product | Phase boundary |
| `RSK-08` | The single-machine deployment becomes a scaling wall | Technical | M | M | Medium | Engineering | Phase boundary |
| `RSK-09` | A data-correction incident is expensive because the ledger is immutable | Technical | M | **H** | High | Engineering | Every sprint |
| `RSK-10` | The no-Celery scheduler saturates | Technical | M | M | Medium | Engineering | Phase boundary |
| `RSK-11` | Data loss on a single-machine deployment | Technical | L | **H** | Medium | Operations | Monthly (drill) |
| `RSK-12` | The AI coding agent produces plausible-but-wrong financial logic | Technical | **H** | **H** | **Critical** | Engineering | Every merge |
| `RSK-13` | Cached balances and stock drift from their source events | Technical | M | **H** | High | Engineering | Nightly (job) |
| `RSK-14` | In-house replacements for excluded dependencies are subtly wrong | Technical | M | M | Medium | Engineering | Every sprint |
| `RSK-15` | Client-side PDF and print output fail on real devices | Technical | M | M | Medium | Engineering | Phase boundary |
| `RSK-16` | A security or tenant-isolation incident destroys trust | Technical | L | **H** | High | Engineering | Every sprint |
| `RSK-17` | Single-developer bus factor | Operational | **H** | **H** | **Critical** | Engineering | Monthly |
| `RSK-18` | SMS/DLT deliverability, lead time and cost | Operational | **H** | M | High | Compliance | Monthly |
| `RSK-19` | WhatsApp policy and pricing change | Operational | **H** | M | High | Product | Quarterly |
| `RSK-20` | Backups exist but restore has never been proven at real scale | Operational | M | **H** | High | Operations | Monthly (drill) |
| `RSK-21` | There is no on-call and no second operator | Operational | **H** | M | High | Operations | Monthly |
| `RSK-22` | White-label partner concentration | Commercial | **H** | **H** | **Critical** | Commercial | Monthly |
| `RSK-23` | The pricing model is undecided, then set wrong | Commercial | M | **H** | High | Commercial | Phase 2 entry |
| `RSK-24` | A partner security or procurement review fails | Commercial | M | M | Medium | Engineering | Per partner |
| `RSK-25` | Reseller channel economics do not work | Commercial | M | M | Medium | Commercial | Quarterly |
| `RSK-26` | A GST rule change invalidates computation logic | Regulatory | **H** | **H** | **Critical** | Compliance | Monthly |
| `RSK-27` | DPDP enforcement lands on an unprepared product | Regulatory | M | **H** | High | Compliance | Quarterly |
| `RSK-28` | A UPI/NPCI policy change breaks QR or intent generation | Regulatory | M | M | Medium | Engineering | Quarterly |
| `RSK-29` | The e-invoicing threshold descends onto the installed base | Regulatory | M | M | Medium | Compliance | Quarterly |
| `RSK-30` | A messaging-consent or TRAI enforcement action hits the sender identity | Regulatory | L | **H** | Medium | Compliance | Quarterly |

Six risks are `Critical`. Two of them — `RSK-12` and `RSK-17` — are risks of *how this product is being built* rather than of what it is, and they are the ones least likely to appear in a conventional register. They are first-class here because they are the two that a specification this complete does most to conceal.

---

## 36.3 Product and market risks

### RSK-01 — The free tier does not convert

**Failure mode.** Twelve months after launch, DigiKhaato has a healthy number of tenants posting ledger entries and a paid conversion rate of under one per cent. The merchants who use it daily use only the free surface — parties, entries, statements, reminders, the UPI QR — because that surface is complete and nothing in it is metered. The features behind the wall (multi-user with roles, stock depth, GST billing depth, server-sent messaging, exports) are wanted by a minority who are also the hardest to reach. Revenue is a rounding error, infrastructure and messaging costs scale with free usage, and the company is funding a public good.

**Category evidence.** This is the single best-documented failure in the research set. Khatabook reached fifty million installs and ten million monthly active MSMEs, and turned that into ₹102.7 crore of FY24 revenue against a ₹116.2 crore loss — and the revenue came from lending, not software (Part 9 §9.4, §9.10). Vyapar converted roughly 2 % of ten million registrations into ₹69 crore against a ₹63 crore loss (Part 3 §3.6). The one counter-example is OkCredit, which reached profitability in November 2025 with 2 lakh-plus paying shopkeepers on ₹30–₹99 monthly plans *after exiting lending*, with its wall at unlimited transactions, advertisement removal, multi-device, GST bills, a defaulters view, desktop and stock (Part 9 §9.4).

**Likelihood: High.** Every product in the ledger cluster has hit this, and DigiKhaato's free tier is deliberately generous — unmetered entries, no ads, no entry caps — because Part 11 §11.2 argues that metering the ledger destroys the habit the product is trying to buy. Generosity and conversion are in direct tension and the specification has chosen generosity.

**Impact: High.** The company cannot operate a product whose marginal cost per active user is non-trivial (SMS at ₹0.12–₹0.25, hosting, support) and whose revenue is zero. **Severity: Critical.**

**Leading indicators.** Share of active tenants that have created a second membership at 30 days (target ≥ 20 %, Part 18 §18.12.1) — this is the leading indicator for the multi-user wall specifically. Share of active tenants issuing at least one tax invoice in 30 days (target ≥ 35 %) — the leading indicator for the billing wall. Share of active tenants with both a ledger entry and a sales document in the same month (Part 1 §1.11 calls this the single number that matters most) — if this is low, the "one book" thesis has not landed and there is nothing for a wall to sit on. Trial-to-paid attempts that abandon at the price screen. Support requests asking for a feature that is already behind the wall, which is conversion demand arriving unserved.

**Preventive mitigations already designed in.** The wall is placed before launch rather than discovered afterwards: Part 11 §11.2 and Part 1 §1.9 fix it at multi-device and multi-user with roles (`PLT-04`, `PLT-05`), inventory and GST billing depth (`INV-*`, `SAL-02`), server-sent messaging (`LED-07`, `LED-08`, `NTF-02`), exports and the CA hand-off (`RPT-08`, `IMP-02`) — precisely where OkCredit proved willingness to pay exists. The accountant seat is free in every tier, which removes the cheapest reason to refuse. `PLT-15` (plan entitlements) ships at MVP so that the wall is enforceable from day one rather than being a Phase 2 retrofit. The partner channel (`WLB-01`–`WLB-06`, `PLT-14`) is a deliberately parallel revenue path that does not depend on self-serve conversion at all — see `RSK-22` for its own risk. There is no lending thesis anywhere in the plan (Part 11 §11.3 item 7).

**Contingency.** If conversion is below 1 % at month nine, the response is not to meter the ledger — that trades a measurable habit for an unmeasurable rupee and is the mistake the category has already made. The response in order: (1) move the wall, not the product — specifically test whether the *first* paid step should be multi-device rather than multi-user, since OkCredit's ₹30 tier suggests the cheapest step converts best; (2) treat the free tier as an explicit marketing budget with a hard per-tenant infrastructure ceiling, and instrument cost per free tenant so the number is known rather than feared; (3) shift weight onto the partner channel, where the unit of pricing is the active merchant and the buyer is an institution with a budget; (4) if all three fail, the honest conclusion is that the self-serve thesis is wrong and DigiKhaato is a channel product, which is a strategy change, not a feature change.

**Owner:** Commercial owner, with the product owner for the wall's placement. **Review:** monthly from launch; formally at Phase 2 entry, where `PLT-16` (subscription billing) makes the model concrete.

**Related:** `RSK-22`, `RSK-23`, `RSK-25`; OQ-02 in Part 37; Part 9 §9.10; Part 11 §11.2.

### RSK-02 — Adoption stalls at the migration step

**Failure mode.** A merchant signs up, is impressed, and is then asked to reproduce a notebook containing between thirty and three hundred parties with balances. They enter four, intend to finish tonight, and never open the application again. The product is never wrong about anything, because it is never used. This failure is silent: the funnel shows sign-ups, and the retention curve shows a cliff at day two that looks like disinterest but is actually data entry.

**Likelihood: High.** Part 18 §18.9 A2 assumes a field agent will spend twenty minutes per merchant entering opening balances, and that assumption is doing an enormous amount of work. For self-serve merchants there is no agent. The research is direct that apps which make the merchant re-key lose them in week one (Part 11 §11.1).

**Impact: High.** Adoption is the precondition for everything else in this register. **Severity: Critical.**

**Leading indicators.** Time to first party (target median ≤ 5 minutes). Share of tenants with more than 25 parties that commit a CSV import (target ≥ 50 %). Share of cohort with ten parties carrying balances within seven days (target ≥ 70 %). The shape of the drop-off in the party-creation funnel — a cliff after the third or fourth party is the signature of manual-entry fatigue, and a cliff at the import upload is a validation problem, which is a different and much more fixable thing. Import jobs that reach `ready` and are never committed.

**Preventive mitigations.** `PTY-10` (party CSV import with opening balances), `INV-09` (items with opening stock) and `IMP-01` (the validate-preview-commit framework) are all MVP and all on the never-cut list in Part 12 §12.7 for the party import specifically. `LED-02` allows an opening balance to be typed on the party form itself, so the incremental path works for a merchant who will not touch a spreadsheet. The import preview shows totals before commit, so the merchant can check the number against their notebook — this is the step that converts a scary bulk operation into a verifiable one. The dashboard carries a migration prompt for young tenants. `IMP-04` (mappers for known competitor export formats) is Phase 3 and is the answer for switchers rather than for paper.

**Contingency.** Assisted onboarding becomes a contractual partner obligation rather than a nice-to-have, and for direct merchants it becomes a paid or free-with-annual-plan service — twenty minutes of a human's time is cheap against a lost tenant. If import completion remains below 30 % after the pilot, the next build is a photograph-of-the-notebook extraction path, which is Part 40's document-extraction item pulled forward with all the accuracy caveats stated there, and it is worth the risk because nothing else moves this number.

**Owner:** Product owner. **Review:** weekly during the pilot, monthly thereafter.

**Related:** `RSK-01`; Part 18 §18.9 A2; Part 40 §40.9.

### RSK-03 — The product is slower than the pencil at the counter

**Failure mode.** A merchant with a customer waiting taps "You gave", and the drawer takes 700 ms to open on a 2 GB Android phone over a congested 3G connection. They do it twice more and then keep the notebook "for quick ones", which means for all of them. The application is not abandoned; it is demoted to a thing that is updated in the evening, which is where accuracy goes to die.

**Likelihood: Medium.** The budget is aggressive and the device is genuinely constrained, but the specification has treated this as a first-order requirement rather than an optimisation: Part 18 §18.8.1 makes the budgets release gates, and `LED-01` carries a measured eight-second end-to-end budget with a 100 ms drawer. Medium rather than Low because *every competitor in this category has shipped a version that hangs while entering transactions* — it is the top-ranked complaint against the market leader (Part 11 §11.1) — which means it is easy to do accidentally.

**Impact: High.** P3 in Part 18 §18.5 is explicit that a flow slower than paper will be replaced by paper, silently. **Severity: High.**

**Leading indicators.** P95 client time from tap to persisted entry on the reference device. P95 server time for `POST /ledger-entries` (budget 250 ms). LCP and INP collected from `PerformanceObserver` in production (Part 19 §19 performance section — no `web-vitals` dependency, ADR-021). The correction rate (target < 2 %): a rising correction rate is usually a usability defect and frequently a speed defect, because a slow form is a form people mis-fill. Anecdotally, merchants describing the app as "for the evening".

**Preventive mitigations.** Performance budgets are release gates in Part 12 §12.8 and Part 18 §18.13 R3, verified on the 2 GB Android reference device over a throttled connection — not on a developer laptop. The Redux-plus-thunks data layer (ADR-004) with one pattern throughout avoids the double-fetch and waterfall patterns that a mixed data layer produces. No virtualisation and page sizes of 25/50/100 with memoised rows (Part 19) keeps the render cost bounded without a dependency. Cached party balances (`parties_party.balance`, ADR-031) mean the ledger drawer does not aggregate on open. The PWA read-through cache (ADR-020) shortens repeat loads.

**Contingency.** If the budget is missed at the release candidate, the release is held — this is the explicit meaning of a release gate, and the cut-line policy of Part 12 §12.7 provides scope to trade rather than quality. If it is missed in production on real data volumes, the recovery path is in order: measure on the real device with the real dataset, not in a synthetic harness; check the server P95 first because a 250 ms budget miss is usually one missing index; then the payload; then the render. The offline write queue (ADR-020, Phase 2) is the structural answer — it makes the tap-to-persisted time a local-storage write — and it moves into Phase 1 if the budget cannot be met any other way.

**Owner:** Engineering lead. **Review:** every sprint against the reference device.

**Related:** `RSK-08`, `RSK-13`; Part 18 §18.8.1; `LED-01`.

### RSK-04 — Scope creep from the business-type-agnostic promise

**Failure mode.** DigiKhaato promises to serve retail, wholesale, services, trading, small manufacturing and professional practices from one codebase, with business type tuning defaults only (Part 11 §11.2). Each segment arrives with one reasonable request. The manufacturer wants a bill of materials. The pharmacy wants batches. The services professional wants appointments. The distributor wants scheme pricing. Each is small; each is defensible; each is a "default" in the requester's telling. Eighteen months later the product has fourteen half-features, a settings screen nobody understands, and a build velocity that has collapsed because every change touches every vertical.

**Likelihood: High.** This is the default outcome. Part 1 §1.10 names it from Zoho's own history — a product that re-modelled core entities twice in five years and spent a third of its release notes on report columns. The pull is strongest precisely when things are going well, because that is when requests arrive.

**Impact: Medium.** It does not kill the product; it makes it late and mediocre, which in a category with funded incumbents amounts to the same thing over a longer period. **Severity: High.**

**Leading indicators.** Requests arriving that fail tests 1–3 of Part 11 §11.6 but are built anyway. Class C changes approved mid-phase rather than at a boundary. Growth in the count of tenant settings. Any feature whose specification contains the phrase "only for *X* type businesses" — that is a vertical fork wearing a default's clothing. Sprint carry-over rising while the feature count shipped stays flat.

**Preventive mitigations.** Part 11 §11.3's Avoid list with hard, written reversal triggers, and the rule that an item leaves that list only through a Class C change with the trigger demonstrably met and a Part 39 entry. Part 11 §11.6's eight ordered tests, designed so a scope question is answerable in ten minutes by the person holding it. Part 13 §13.8's rule that revision happens at phase boundaries, not inside phases, with the single exception of regulatory change. Part 16's catalogue as the contract and the phase column as binding. Canon §0.3's module map, which already assigns every future capability to a phase. Part 13 §13.7's cross-phase constraint that no later feature may change the shape of `ledger_entry`, `inventory_stock_movement` or the document line tables.

**Contingency.** If three or more Class C changes have been approved mid-phase, the phase is re-planned rather than continued, because the estimate is no longer connected to the content. If a vertical's requests dominate two consecutive quarters, the honest answer is a decision — either that vertical becomes a target segment with its own Part 11 entry and its own features (a Class C change to Part 18 §18.4), or its requests are declined with the trigger named. What is not permissible is serving it accidentally.

**Owner:** Product owner. **Review:** every sprint; formally at every phase boundary against the Avoid-list triggers.

**Related:** `RSK-05`, `RSK-23`; Part 11 §11.3, §11.6; Part 13 §13.8.

### RSK-05 — A competitor closes the gap before the base exists

**Failure mode.** The gap DigiKhaato occupies is between the free ledger cluster and the paid billing cluster. It is not a secret. A ledger-cluster incumbent with fifty million installs adds a competent GST invoice and a stock module; or a billing-cluster incumbent adds a genuine two-button udhaar ledger with Hindi throughout and stops treating it as a receivables report. Either move, executed adequately, removes the "one book instead of four apps" proposition before DigiKhaato has a base to defend.

**Likelihood: Medium.** Both moves are obvious and both have been attempted partially. What makes it Medium rather than High is that Part 11 §11.2 argues the moves are architecturally expensive: a ledger app that adds invoicing bolts a documents table onto a transactions table and ends up with two balances; a billing app that adds udhaar gets a receivables report with a Hindi label. Retrofitting the spine means rewriting the core. That argument is correct but it is not a moat — it is a delay.

**Impact: Medium.** DigiKhaato would still have the vernacular parity, the credit-control depth, the immutability promise and the white-label chassis. It would lose its clearest sentence. **Severity: Medium.**

**Leading indicators.** Release notes and store listings of the four named competitors. New pricing tiers that bundle across the gap. Partner conversations in which the buyer names a competitor's new module. Review text on competitor listings mentioning the newly-added capability, which is where execution quality shows.

**Preventive mitigations.** Speed to a defensible base: the whole point of the MVP's 74-feature boundary and the cut-line policy is to be in the field early. The differentiators in Part 11 §11.2 that are *not* the one-book claim — credit control as a business function (`PTY-06`, `LED-05`, `LED-09`, `RPT-05`), staff roles without a desktop licence (`PLT-05`), honest payment reconciliation (`PAY-01`, `PAY-07`), immutability as a user-visible promise (`LED-03`, `PLT-08`), white-label as architecture (`WLB-*`), and single-machine deployability — are each individually defensible and several are business-model conflicts for the incumbents rather than technical ones. A competitor funded on lending cannot adopt "no ads, no lending banners" without losing its revenue line.

**Contingency.** Do not respond feature-for-feature; that is how a small team loses. Respond on the axis the competitor cannot follow: if a ledger app adds billing, the answer is GST correctness with rate history and the accountant hand-off, which a consumer app will not invest in; if a billing app adds udhaar, the answer is vernacular parity across the whole product and the mobile speed budget, which a desktop-led product structurally cannot match. Re-price only as a last resort, and never below the cost of support.

**Owner:** Product owner. **Review:** quarterly competitive scan; immediately on a material competitor release.

**Related:** `RSK-01`, `RSK-04`; Part 4 §4.5, §4.6.

### RSK-06 — Support becomes the product

**Failure mode.** Every merchant who adopts DigiKhaato generates a small, steady stream of questions that are not bugs: how to correct an entry, why a balance shows red, what a bill of supply is, how to get the printer to work. With a very small team, this stream consumes the engineering capacity that was supposed to build Phase 2. The alternative — not answering — produces the category's defining failure, because support is the lowest sub-score for every Indian product in the competitive set and Marg's 3.2-star average is a support failure rather than a product one (Part 1 §1.10, Part 3 §3.11 Finding 4).

**Likelihood: High.** The target user is typically between forty-five and fifty-four years old and more than half of small businesses report that finding and setting up digital tools is hard (Part 11 §11.1). A support load is not a possibility here; it is a certainty, and the only question is whether it is served in-product or by a person.

**Impact: Medium.** It does not destroy the product; it consumes the roadmap and caps growth at the number of merchants one person can answer. **Severity: High.**

**Leading indicators.** Support contacts per active tenant per month, and specifically whether it decreases after `HLP-01` (Part 18 §18.12.1 expects it to). The concentration of contacts: if 60 % are about three topics, those three are product defects or missing help, not support demand. Median first response time. Repeat contacts from the same tenant within a week. Any topic that generates a contact from more than one in ten tenants is a design defect, not a support issue, and should be routed to the backlog rather than to a reply.

**Preventive mitigations.** In-product self-service is a Phase 2 commitment with real feature IDs: `HLP-01` (help articles), `HLP-02` (contextual help), `HLP-03` (guided tours). Every FRD requires the three empty states and explicit error states in both languages (canon §0.11 rule 6), which is support prevention at the point of confusion. `UbHelpHint` exists as a design-system primitive so contextual help is cheap to add rather than a project. The L1/L2 split with partners is contractual (Part 1 §1.9): the partner answers merchant questions, Metis answers product questions. Part 18 §18.13 R9 makes support ownership with response targets a release criterion — the product cannot ship without it being written down.

**Contingency.** If contacts per tenant exceed one per month, `HLP-01`–`HLP-03` move from Phase 2 into the 1.1 release, displacing whatever is next. If the concentration analysis shows a single topic above 20 %, that topic becomes a defect with a sprint slot. If the load is unserveable at all, the answer is to slow acquisition rather than to degrade answers — an unanswered merchant writes a review, and in this category reviews are the acquisition channel.

**Owner:** Operations, with the product owner for the routing of topics into the backlog. **Review:** monthly, with a topic-concentration analysis.

**Related:** `RSK-17`, `RSK-21`, `RSK-24`.

### RSK-07 — Two languages are not enough

**Failure mode.** DigiKhaato launches in English and Hindi. A partner in Gujarat, Tamil Nadu or West Bengal finds that its merchant base cannot use the product, and the partner deal — the parallel revenue path of `RSK-01`'s contingency — does not close. Meanwhile the ledger-cluster competitors ship ten to thirteen languages.

**Likelihood: Medium.** Part 18 §18.9 A3 assumes English and Hindi are sufficient at launch, and for a first cohort concentrated in the Hindi belt they are. The risk is concentrated at the partner boundary rather than the merchant one.

**Impact: Medium.** The i18n architecture supports more locales without change (ADR-006, `react-intl` with ICU messages, every string keyed in both locales from the first commit). What is missing is translation, testing and support capacity — real cost, but bounded and known. **Severity: Medium.**

**Leading indicators.** Partner conversations that stall on language. The geographic distribution of sign-ups relative to the language distribution of the addressable base. Requests in support for a third language. Devanagari rendering defects, which are the early sign that the font stack (Inter plus Noto Sans Devanagari, Part 23 §23.2.2) has not been exercised.

**Preventive mitigations.** Every user-visible string carries `en` and `hi` keys from the first commit, enforced by canon §0.11 rule 6 and by a release criterion (Part 18 §18.13 R5) that both locales are complete with no missing-key warnings. The font substitution decision in Part 23 §23.2.2 chose faces with Devanagari coverage specifically so that adding an Indic language is a translation job rather than a typography project. `WLB-05` (partner theme tokens) includes custom font handling with an in-house WOFF2 table reader that verifies `cmap` coverage for Devanagari, which is the same check a third language needs.

**Contingency.** A third language is a funded project with a named owner, a professional translation pass, a native-speaker review of the financial vocabulary specifically (the words for debit, credit, balance and due are where machine translation fails), and a support capacity commitment — not a JSON file. Which language is OQ-08 in Part 37; the honest default is that the language follows the first partner who will pay for it.

**Owner:** Product owner. **Review:** phase boundary.

**Related:** `RSK-22`, `RSK-06`; OQ-08.

---

## 36.4 Technical and architectural risks

### RSK-08 — The single-machine deployment becomes a scaling wall

**Failure mode.** DigiKhaato is designed to run as four docker-compose services — `db`, `backend`, `scheduler`, `frontend` — on one VPS (ADR-019, Part 18 §18.10 C1). A partner onboards four thousand merchants over a quarter. The database's working set outgrows the machine's memory, the day book report starts hitting the 15-second `statement_timeout`, gunicorn workers queue behind slow queries, and the answer — more machines — requires a load balancer, a shared media volume, a session story and a database that is no longer on the same host. The work is not enormous, but it arrives at the worst possible moment, under a partner's SLA, on a team of one or two.

**Likelihood: Medium.** Part 18 §18.9 A7 assumes a single VPS is sufficient for the launch cohort and the first partner, and for the numbers in Part 1 §1.11 (1,500 monthly active tenants at twelve months) it plainly is. The risk is a step change from a partner, not gradual growth.

**Impact: Medium.** The path exists and is documented; what it costs is weeks of unplanned work and, potentially, a partner's confidence. **Severity: Medium.**

**Leading indicators.** Database size relative to machine memory. P95 for the three heaviest reports (day book with a wide range, GST summary, stock summary). Gunicorn request queue depth and worker saturation. Connection count against `PG_MAX_CONNECTIONS`. Job backlog depth in `platform_job`. Media directory size and inode count. The most useful single indicator is the ratio of P95 to P50 on the ledger write endpoint: when queueing begins, that ratio moves before the absolute numbers do.

**Preventive mitigations.** The architecture was chosen so the wall is climbable rather than absent. ADR-008 puts PostgreSQL in Docker in both dev and prod, so moving it to a managed instance or a separate host is a connection-string change. ADR-013 routes all file access through Django's storage API with a `# storage-backend seam` comment at the two call sites that need conditionals, so object storage is a settings switch plus a dependency ADR (Part 20 §20 files section). ADR-012's `platform_job` plus `enqueue(task, payload)` abstraction means a real queue can replace the runner without any caller changing. Part 29 §29.10 is an explicit, ordered scaling ladder — vertical first, then PgBouncer, then WAL archiving, then separation — and ADR-019 reserves Kubernetes manifests for Phase 3 when a partner needs scale. The modular monolith (ADR-007) keeps app boundaries clean enough that a module could become a separate deployable, which is a seam, not a plan.

**Contingency.** Vertical scaling first: it is the cheapest hour of work in the ladder and buys a factor that is usually enough. Then the specific bottleneck, measured rather than assumed. Report snapshots (`reports_snapshot`, canon §0.6) exist as a designed escape valve for heavy reports and are the correct answer before any infrastructure change. If a partner genuinely needs horizontal scale, that is a contract conversation with a price attached, not an engineering emergency absorbed silently.

**Owner:** Engineering lead. **Review:** phase boundary; immediately on a partner commitment above 1,000 merchants.

**Related:** `RSK-10`, `RSK-11`, `RSK-22`; ADR-008, ADR-012, ADR-013, ADR-019.

### RSK-09 — A data-correction incident is expensive because the ledger is immutable

**Failure mode.** A defect — a mis-signed direction, a wrong tax rate applied for a week, a double-posted import — writes several thousand incorrect `ledger_entry` rows across many tenants. Because canon §0.11 rule 1 forbids updating or deleting them, and because a database trigger enforces it (Part 27 §27.2), the correction is not an `UPDATE`. It is a reversal entry plus a replacement entry for every affected row, each with a reason, each auditable, each visible to the merchant on their statement. The merchant opens their khata and sees three hundred correction pairs, asks what happened, and the answer — "we fixed a bug" — is exactly the sentence the immutability promise was supposed to make unnecessary. The technical cost is a carefully-written management command; the trust cost is larger.

**Likelihood: Medium.** Some correction incident over eighteen months is close to certain; one large enough to be visible across many tenants is Medium.

**Impact: High.** The immutability promise is the product's trust proposition (Part 11 §11.2) and the thing that makes its data underwriting-grade. A visible mass correction is the promise working as designed and simultaneously the most alarming thing a merchant can see. **Severity: High.**

**Leading indicators.** Any drift reported by the nightly `recalc_balances` or `recalc_stock` jobs. A spike in the correction rate that is not attributable to user behaviour. Support contacts about a balance that "changed by itself". Deployment of any change to a service in `apps/ledger/services/` or `apps/inventory/services/` without a fixture test covering the changed arithmetic.

**Preventive mitigations.** Prevention is almost entirely upstream. The fixture suites of Part 28 cover every GST slab, intra- and inter-state, composition, unregistered, discount, round-off and reverse-charge case, including a document dated before the 22 September 2025 slab change. The 100,000-row drift dataset is a release gate (Part 18 §18.13 R2). Idempotency keys on every document and payment POST (canon §0.11 rule 5) prevent the most common mass-duplication cause. The validate-preview-commit import framework (`IMP-01`) makes a bulk mistake require an explicit confirmation against displayed totals. Every state change is wrapped in `transaction.atomic()` with an audit row (canon §0.11 rule 4), so the blast radius of a bad deploy is bounded by what committed.

**Contingency.** A mass-correction runbook must exist before launch and does not yet — this is a gap, recorded as an open question in Part 37. Its required contents: a management command that takes a selector and a reason, posts reversal-plus-replacement pairs in batches under `transaction.atomic()`, writes one audit row per pair with a shared `incident_id`, and is dry-runnable with a diff report. A statement-level presentation that groups a correction batch under a single "system correction — <reason>" heading rather than three hundred separate pairs, so the merchant sees one event. A merchant communication in both languages, sent before they discover it, naming what was wrong, what was corrected, and what their balance was before and after. And, for the narrow case where the entries should never have existed at all (a double-committed import), the `imports` revert path rather than a correction storm.

**Owner:** Engineering lead, with the product owner for the merchant communication. **Review:** every sprint that touches ledger, stock or tax services.

**Related:** `RSK-12`, `RSK-13`, `RSK-26`; canon §0.11 rules 1 and 4; ADR-029; `LED-03`, `PLT-08`.

### RSK-10 — The no-Celery scheduler saturates

**Failure mode.** ADR-012 replaces Celery and Redis with `platform_job` rows drained by `manage.py run_scheduler` in a compose service. At 8 p.m. on the last day of a month, the reminder scan for D-1 and D0 enqueues jobs for every party with a collection date across every tenant, the overdue-status refresh runs, three merchants request large exports, and the low-stock scan fires. The single runner processes them serially. Reminders that should have gone at 9 a.m. go at 2 p.m., or not at all before the window closes. Nothing crashes; the product is just quietly late at exactly the moment it is supposed to be useful.

**Likelihood: Medium.** At MVP volumes a serial runner is comfortable. The risk arrives with a partner's merchant base and with the Phase 2 messaging features that put real per-message work behind each job.

**Impact: Medium.** Late reminders are a product failure, not a data failure, and the recovery is a configuration change. **Severity: Medium.**

**Leading indicators.** Job backlog depth and oldest-pending-age in `platform_job`, which Part 30 makes a standing query. The lag between a job's scheduled time and its execution time, per task type. Reminder sends landing outside the 9 a.m.–9 p.m. window that TRAI imposes on promotional traffic and that merchants expect regardless. `max_attempts` exhaustion on any task. Scheduler restarts.

**Preventive mitigations.** The design anticipates this precisely. `enqueue(task, payload)` is an abstraction over a table, so a second runner, a priority lane or Celery itself can replace the executor without touching a single caller (ADR-012). Jobs carry priorities and `max_attempts`. Every scheduled task is required to be idempotent, which is what makes running several runners safe. `FOR UPDATE SKIP LOCKED` is available and used for claiming, so horizontal runner scaling is a compose `--scale` away rather than a redesign. Part 18 §18.13 R6 makes "scheduler tasks proven idempotent" a release criterion.

**Contingency.** In order: raise the runner's batch size and tighten its sleep; split the runner into two compose services by priority lane so that reminders never queue behind exports; run several runners with `SKIP LOCKED` claiming; and only then adopt a broker under a new ADR. Each step is hours, not weeks, which is the entire justification for ADR-012.

**Owner:** Engineering lead. **Review:** phase boundary; monthly once any partner is live.

**Related:** `RSK-08`, `RSK-18`; ADR-012.

### RSK-11 — Data loss on a single-machine deployment

**Failure mode.** The whole of every merchant's business is in one PostgreSQL database on one disk on one machine. That machine is lost — a host failure, a ransomware event, an operator error, a provider account suspension. If the backup is absent, stale, unverified or on the same machine, the merchants' ledgers are gone. For a product whose proposition is "trustworthy enough to settle a dispute", this is the terminal failure.

**Likelihood: Low.** Part 29 §29.5 specifies a nightly `pg_dump --format=custom`, a nightly verification restore with row counts, 30 daily plus 12 weekly retention, an off-host copy via `BACKUP_REMOTE_TARGET`, a media rsync, a monthly restore drill on staging, and a read-only `udhaarbook_backup` role so a compromised backup path cannot write. That is a serious posture. Low, not negligible, because every element of it depends on an operator continuing to do it — see `RSK-20` and `RSK-21`.

**Impact: High.** Unrecoverable. **Severity: Medium** by the matrix, and treated operationally as High.

**Leading indicators.** A missing or failed verification restore in the backup log. Growth in dump size that outpaces the retention volume. An unset `BACKUP_REMOTE_TARGET` — which is the default, and is the single most dangerous default in the deployment. A skipped monthly drill. Media directory size diverging from the last rsync.

**Preventive mitigations.** As above, plus the RPO/RTO commitments of Part 29 §29.5 (RPO 24 hours at MVP, RTO ≤ 30 minutes measured by the drill) and the WAL-archiving upgrade documented as a database-configuration change taken when the first partner goes live or tenant count crosses about 200 — which drops RPO from 24 hours to minutes with no application change. Part 18 §18.13 R6 requires a backup to have been *restored and timed*, not merely configured, before launch.

**Contingency.** The restore procedure in Part 29 §29.11.7, executed against the newest verified dump on a fresh host, with the elapsed time recorded. Merchants are told what window of data was lost, in both languages, with specificity — a merchant who is told "up to 24 hours" can re-enter a day; a merchant who is told nothing assumes everything. For the ransomware case, the off-host copy is the only defence that matters and it must be pull-based or write-once; a pushed rsync to a target the compromised host can also delete is not a backup.

**Owner:** Operations. **Review:** the drill is monthly and the drill *is* the review.

**Related:** `RSK-20`, `RSK-21`, `RSK-16`; Part 29 §29.5; T13 in Part 27 §27.1.4.

### RSK-12 — The AI coding agent produces plausible-but-wrong financial logic

**Failure mode.** This specification is written to be implemented largely by an AI coding agent, and it is written in enormous detail precisely because of that. The agent's characteristic failure is not incoherent code; it is code that reads correctly, passes the tests it was given, and is wrong in a way that only shows up in money. A rounding applied at the document level instead of the line level. A `float` that slipped into a report aggregation. A weighted-average cost updated on an outbound movement. A tax rate resolved by `latest()` rather than by the document's date. A reversal that flips `direction` but not the sign of `amount`. Each of these produces numbers that look right, reconcile against themselves, and are wrong against the merchant's expectation and the tax authority's.

**Likelihood: High.** Not because the agent is careless, but because financial arithmetic has a very large space of plausible-looking wrong answers and a very small space of right ones, and because the specification — however complete — cannot enumerate every case. Part 20's own header says nothing may be left to invention, which is an acknowledgement that invention is the failure mode.

**Impact: High.** G3 and G4 in Part 18 §18.3.1 are the product's two correctness goals, and Part 11 §11.2 rests the whole differentiation argument on a ledger trustworthy enough to settle a dispute. **Severity: Critical.**

**Leading indicators.** Any test that was weakened rather than fixed. Any fixture whose expected value was changed to match the code. `float` appearing anywhere in a diff touching money — Part 26's lint rules catch the obvious cases and not the clever ones. A drift report that is non-zero. Coverage that rises while the assertion count does not. Reviewer comments of the form "this looks right" on arithmetic, which is the exact phrase that precedes this failure.

**Preventive mitigations.** The specification's defences are unusually strong here and should be named precisely. The **fixture suite is the specification of the arithmetic, not a check on it**: Part 28 requires fixtures for every GST slab, both supply directions, composition, unregistered, discount, round-off, reverse charge and a pre-22-September-2025 document, and these fixtures are written from the rules rather than from the code. The **drift jobs** (`recalc_balances`, `recalc_stock`) recompute from immutable events and assert equality with the caches nightly, which catches an entire class of sign and ordering errors that no unit test would (Part 20 §20 balance and stock services; `LED-01` T-11). **Immutability** (canon §0.11 rule 1) means a wrong entry can be found and reversed rather than having silently overwritten the truth. **`Decimal` end-to-end with string transport** (ADR-010) removes float entirely from the type system rather than from the code review. **Half-up rounding at line and document level per GST rules** is stated normatively in canon §0.4 rather than left to the implementer. The **traceability build** (Part 28 §28) ties every FRD `T-` marker to a real test, so a missing test is visible rather than assumed.

**Contingency.** Every financial service module gets a human review pass that is specifically an *arithmetic* review, conducted against the FRD's worked examples rather than against the code — the reviewer computes the expected number by hand and compares. This is slow and it is the only thing that works. A correctness defect found in production triggers `RSK-09`'s mass-correction path plus a fixture added for the exact case, and the fixture is written before the fix. If two correctness defects of the same class appear, the class gets a property-style test — generated inputs, invariant assertions (balance equals sum of entries; stock equals sum of movements; document total equals sum of lines plus tax) — written in plain pytest without a new dependency.

**Owner:** Engineering lead. **Review:** every merge that touches `apps/ledger`, `apps/inventory`, `apps/sales`, `apps/purchases`, `apps/payments` or `apps/tax` services.

**Related:** `RSK-09`, `RSK-13`, `RSK-14`, `RSK-26`; canon §0.11; ADR-010; Part 28.

### RSK-13 — Cached balances and stock drift from their source events

**Failure mode.** `parties_party.balance` and `inventory_item_stock` are denormalised caches over immutable event series. They exist because the alternative — aggregating on every read — cannot meet the 100 ms ledger-drawer budget. A concurrency bug, a missed `apply_balance_delta` on a new code path, or an exception between the event write and the cache update leaves the cache disagreeing with the truth. The merchant sees one number on the party list and a different one at the bottom of the statement, and the product's single most important claim — that there is one balance per party — is visibly false.

**Likelihood: Medium.** Every new document kind that posts a ledger entry is an opportunity to forget the cache update, and Phase 2 adds several.

**Impact: High.** A visible disagreement between two of the product's own screens is worse than a wrong number, because it tells the merchant the software does not know what it is doing. **Severity: High.**

**Leading indicators.** The nightly `recalc_balances` and `recalc_stock` drift reports — these are designed to exit non-zero when drift exists, which makes them a monitor rather than a tool. Support contacts describing two different balances. Any merged change that adds a `ledger_entry` or `StockMovement` write without routing through `apply_balance_delta` / the stock service.

**Preventive mitigations.** A single recomputation authority (`recompute_party_balance`, `recompute_item_stock`) that replays from events, used both by the drift job and by the `--fix` path, so there is exactly one definition of the correct answer. Row locks on the party during entry posting. The design property that outbound stock movements never change the average cost (Part 21 §21.3.6), which is what makes `recompute_item_stock` a pure replay rather than an approximation. The `LED-01` T-11 test (10,000 random entries, zero drift) and the 100,000-row release gate. Part 20's rule that caches are recomputed from the authority rather than incremented blindly when documents are touched.

**Contingency.** Run the drift job with `--fix` for the affected tenants, which recomputes from events — the events are immutable, so the correct answer always exists and this is genuinely a repair rather than a guess. Then find the code path that skipped the update and add a test for it. If drift recurs on the same path twice, the cache update for that path moves inside the same service function as the event write with no separate call site.

**Owner:** Engineering lead. **Review:** the nightly job is the review; escalation on any non-zero report.

**Related:** `RSK-09`, `RSK-12`; ADR-029, ADR-030, ADR-031.

### RSK-14 — In-house replacements for excluded dependencies are subtly wrong

**Failure mode.** ADR-021's allow-list is short and the consequence is a set of things written by hand that would elsewhere be a library: a minimal XLSX writer and reader built on `zipfile` and SheetML (ADR-023), a UPI QR encoder (ADR-027), a Web Push implementation doing RFC 8291 `aes128gcm` and RFC 8292 VAPID (ADR-024), a service worker written without Workbox (ADR-026), a WOFF2 table reader that checks Devanagari `cmap` coverage (`WLB-05`), a `PerformanceObserver`-based vitals collector, and a request-id middleware. Each is small. Each has an edge case that a widely-used library has already found: an XLSX file that Excel opens but Google Sheets refuses; a date cell read through the wrong epoch; a QR payload that one UPI app parses and another does not; a push subscription that fails silently on one browser.

**Likelihood: Medium.** The individual pieces are genuinely small and the specification describes them in real detail (Part 17 §17 IMP-02 specifies the number formats, the frozen header, the streaming behaviour; `NTF-04` specifies the exact RFCs). Medium rather than High because the scope of each is deliberately narrow — one sheet, three number formats, one QR spec.

**Impact: Medium.** A broken export is an embarrassment and a support load; a broken QR is a collection failure; broken push is an inert Phase 2 feature. None is a data-integrity failure. **Severity: Medium.**

**Leading indicators.** Support contacts about a downloaded file not opening. Export jobs completing with zero downloads. UPI payments not arriving after a QR is shown — although `PAY-07`'s unmatched queue makes this observable rather than invisible, which is the point of `P7` in Part 18 §18.5. Push subscriptions created but never delivered.

**Preventive mitigations.** Each in-house component has a written ADR stating what it does and does not support, which converts "it doesn't work" into "it is out of scope" for the cases deliberately excluded — `.xls` is rejected with `legacy_excel_format`, encrypted workbooks with `encrypted_file`, formulas without cached values with `formula_without_value` (Part 17 IMP-03). Each is tested against real artefacts rather than against itself: the XLSX writer's output is opened by a real spreadsheet application in the release checklist, the QR is scanned by at least two real UPI applications, the print output is produced on one A4 laser and one 80 mm thermal printer physically (Part 12 §12.8). For Web Push specifically, ADR-024 admits `cryptography` rather than hand-rolling P-256 ECDH, which is the one place where the minimal-dependency policy is explicitly overridden on safety grounds.

**Contingency.** For each of these, adopting the library is a written ADR and a day's work, not a redesign — the in-house components are behind narrow interfaces (`imports/writers/xlsx_writer.py`, `notifications/providers/webpush.py`) precisely so the swap is local. The trigger for taking that step is stated in each ADR's reversal section: broadly, two distinct real-world failures that the in-house version cannot fix cheaply.

**Owner:** Engineering lead. **Review:** every sprint that touches one of the named components; the artefact tests are in the release checklist.

**Related:** `RSK-12`, `RSK-15`, `RSK-24`; ADR-021, ADR-023, ADR-024, ADR-026.

### RSK-15 — Client-side PDF and print output fail on real devices

**Failure mode.** ADR-014 produces every document through React print components and the browser's print path rather than a server-side renderer. A merchant on an Android phone taps "Print", their browser's print preview clips the table, drops the tenant logo, paginates the totals onto a second page alone, or renders the 80 mm thermal template at A4 width. The merchant's customer is standing there. The fallback — "share as a link" — is not the same thing as a bill in the hand.

**Likelihood: Medium.** Browser print is genuinely inconsistent across Android Chrome versions, and thermal printers reached through a phone are inconsistent in a different way. The design mitigates it heavily but does not control it.

**Impact: Medium.** Printing is a parity capability, not a differentiator, but its failure is highly visible and occurs in front of a customer. **Severity: Medium.**

**Leading indicators.** Support contacts mentioning printing, which in this category are a known standing complaint (WhatsApp share breakage is a top-ranked complaint for competitors, Part 11 §11.1). Share-link opens that are immediately followed by a second open, which suggests the first render was unusable. Any browser or OS update in the Android Chrome line.

**Preventive mitigations.** Two templates only — A4 and 80 mm — so the surface is small and can actually be verified (Part 11 §11.4). Physical verification on one A4 laser and one 80 mm thermal printer is a launch-readiness line (Part 12 §12.8), not a nice-to-have. The public share link renders the same print view, so a merchant who cannot print can send. `SAL-03`'s share path over `wa.me` costs nothing and is the path most merchants actually use.

**Contingency.** Server-side PDF (WeasyPrint) is already planned for Phase 2 because automated sending needs a file (ADR-014); if client-side printing fails materially in the field, that work moves into the 1.1 release and the same template contract is rendered server-side. This is a deliberate reversal path with a known cost, which is why ADR-014 is a staging decision rather than a permanent one.

**Owner:** Engineering lead. **Review:** phase boundary; immediately on a support cluster.

**Related:** `RSK-14`; ADR-014, ADR-022.

### RSK-16 — A security or tenant-isolation incident destroys trust

**Failure mode.** One tenant sees another tenant's parties. A share link is enumerated and a merchant's statement — names, mobile numbers, balances — is public. A stolen refresh token is replayed. An attachment upload is a polyglot that executes. Any one of these, in a product holding the receivables of thousands of small businesses, is simultaneously a DPDP breach with a 72-hour reporting obligation and a CERT-In 6-hour one, a partner-contract event, and the end of the trust proposition.

**Likelihood: Low.** Part 27 is unusually thorough: `TenantScopedViewSet` by default, `TenantPrimaryKeyRelatedField`, 404 rather than 403 on cross-tenant ids, an exhaustive route-coverage test, UUID v7 primary keys so nothing is enumerable, refresh rotation with family revocation on reuse detection, 256-bit share tokens hashed at rest with expiry and revocation, magic-byte verification and Pillow re-encoding on uploads, no SVG, CSP on public pages. Low because the defences are designed in rather than added.

**Impact: High.** **Severity: High**, and treated as such despite the Low likelihood, because the recovery is partly impossible.

**Leading indicators.** Any failure in the cross-tenant probe suite, which runs against every endpoint. 404 rates on share-link paths, which is what enumeration looks like. Authentication failure clusters by IP. `pip-audit` and `npm audit` findings above the severity SLA. Any new endpoint merged without a permission mapping — `HasPermission` denies unmapped actions by default (Part 27 §27.2 fail-closed), which converts this from a vulnerability into a bug report, but the bug report still needs reading.

**Preventive mitigations.** The full Part 27 threat model (T1–T15) with its stated verification method per threat. Fail-closed as a principle rather than a practice: no tenant means no data, unmapped action means denied, missing consent means refused. Defence in depth specifically on the two invariants that cannot be repaired — tenant isolation and ledger immutability — each defended at both the application and database layers. Part 18 §18.13 R2 makes the cross-tenant probe suite a release gate.

**Contingency.** An incident runbook with the regulatory clocks on its first page: CERT-In at 6 hours, DPDP Board and affected principals "without delay" with a detailed report within 72 hours. Session and share-link mass revocation must be a single operational command, not a database session. Partner notification is contractual and precedes public statement. Merchant communication is in both languages and states what was exposed rather than what was not. The postmortem is written and, for a partner, shared.

**Owner:** Engineering lead, with the compliance owner for notification. **Review:** every sprint via the probe suite; the runbook is rehearsed once before launch.

**Related:** `RSK-27`, `RSK-24`, `RSK-11`; Part 27 §27.1.4.

---

## 36.5 Operational risks

The four product and technical sections above are written at full length because their failure modes are subtle. The operational, commercial and regulatory risks below are written more compactly — not because they matter less (two of the six `Critical` risks are here) but because their failure modes are obvious once named, and what matters is the mitigation and the trigger rather than the description.

### RSK-17 — Single-developer bus factor

**Failure mode.** One person holds the architecture, the deployment, the database, the compliance posture and the product decisions. They are ill for three weeks, take another job, or simply burn out. Nothing is malicious and nothing is lost, but nothing moves either: no deploy, no incident response, no partner answer. For a product carrying merchants' receivables under a partner SLA, an unavailable maintainer is an outage with a longer half-life than a server failure.

**Likelihood: High.** Part 18 §18.10 C10 assumes four to six engineers; the specification is being written and will initially be built by far fewer, with an AI coding agent as the multiplier. Across eighteen months, some period of single-person unavailability is close to certain. **Impact: High** — every other mitigation in this register names an owner, and at MVP most of those owners are the same person. **Severity: Critical.**

**Leading indicators.** Any runbook step that only one person has performed. Deploys that happen only when one person is online. A restore drill skipped because "we'll do it next month". Knowledge that exists only in a chat history. Support responses that must wait for one person.

**Preventive mitigations.** The specification itself is the primary mitigation and should be understood as such: thirty-plus parts written so that "nothing is left to invention" is precisely what allows a second person — or a different agent — to continue. Beyond that: every operational procedure exists as a script in `ops/` rather than as a habit (Part 29); the deployment is four docker-compose services with an `.env` file, which is a thing a competent operator can be handed; ADR-021's dependency austerity means the build has fewer things to know about; the `platform_job` runner, the backup loop and the scheduler are all `manage.py` commands that can be invoked by hand.

**Contingency.** Before any partner contract is signed, a named second operator must exist who has personally executed the restore drill and one deploy, and who holds the credentials — this is a contractual precondition, not an aspiration. A written "cold start" document (where the code is, where the secrets are, how to deploy, how to restore, who the partners are, what the regulatory clocks are) is maintained and its accuracy is tested by having the second operator follow it once. If the single-operator condition persists into a partner engagement, the partner is told, because a partner who knows can plan and a partner who discovers it during an incident cannot.

**Owner:** Engineering lead. **Review:** monthly, and as an explicit gate before the first partner contract.

**Related:** `RSK-11`, `RSK-20`, `RSK-21`, `RSK-24`.

### RSK-18 — SMS deliverability, DLT lead time and cost

**Failure mode.** Transaction messages (`LED-08`) and automated reminders (`LED-07`) reach nobody, because a content template was not registered on the DLT portal in exactly the form sent and the message is silently dropped at scrubbing; or because the header category is wrong; or because the registration was never completed and the adapter has been logging `skipped` for months without anyone noticing. Alternatively they do reach people, and the bill scales with free-tier usage exactly as Khatabook's ₹106 crore "other expenses" line did.

**Likelihood: High** for some form of this — DLT template mismatch is the single most common Indian SMS failure. **Impact: Medium** — no MVP flow blocks on it (Part 18 §18.11's dependency rule), but customer-side transparency is the most-praised behaviour in the category (Part 9 §9.3) and losing it silently is worse than not shipping it. **Severity: High.**

**Leading indicators.** `MessageLog` rows in `skipped` or `failed` status, by template. Delivery-receipt ratios per template — a template at 0 % delivery is a registration problem, not a network one. Monthly SMS spend per active tenant. Any change to a message's text that was not accompanied by a template re-registration.

**Preventive mitigations.** ADR-015 makes messaging adapter-only at MVP with `ConsoleSmsBackend`, so nothing depends on a provider being live. Every outbound attempt is logged with a status including `skipped`, which makes an unconfigured channel visible rather than silent (`NTF-02`). The template registry is a first-class concept rather than string literals in code, so the registered form and the sent form have one source. Part 3 §3.9 records the mechanics (₹5,900 principal-entity registration, ₹590/year headers, Service-Implicit `-S` category for ledger and reminder messages, two-to-four-week lead time, ₹0.12–₹0.25 per message) so no one discovers them late. Messaging is never bundled as unlimited, because it has genuine marginal cost — server-sent SMS sits behind the paid wall by design.

**Contingency.** `wa.me` deep links (`NTF-03`) carry the same message at zero cost with a human tap and need no approval — this is the designed fallback and it is live at MVP. If cost rather than deliverability is the problem, the OkCredit answer applies: push the send onto the merchant's own device on the free tier and charge for server-sent volume. Per-partner versus per-Metis DLT registration is OQ-03 in Part 37 and must be resolved before launch because it changes `WLB-06`'s design.

**Owner:** Compliance owner. **Review:** monthly delivery and cost report.

**Related:** `RSK-19`, `RSK-30`, `RSK-01`; ADR-015; `NTF-02`, `LED-07`, `LED-08`.

### RSK-19 — WhatsApp policy and pricing change

**Failure mode.** The Phase 2 messaging plan depends on the WhatsApp Business Platform: Meta business verification, a dedicated number, templates approved in the Utility category, and per-message pricing. Meta changes the rules — as it did on 1 July 2025 when pricing moved from per-conversation to per-message, and as it does again on 1 October 2026 when free-form service replies inside the 24-hour window stop being free and become chargeable with 1,000 free service messages per number per month (Part 3 §3.9). A template is re-categorised from Utility (₹0.115) to Marketing (₹0.86) and the unit economics of a reminder change by a factor of seven. Or a business account is suspended during a verification review and the channel goes dark for a week.

**Likelihood: High** that *something* changes within eighteen months; the history is unambiguous. **Impact: Medium** — it affects a Phase 2 capability, not the core loop. **Severity: High.**

**Leading indicators.** Meta policy and pricing announcements. Template approval rejections or re-categorisations. Per-message cost drift in the monthly messaging report. Any increase in the share of sends falling outside the 24-hour service window.

**Preventive mitigations.** `NTF-03`'s free `wa.me` deep link is the MVP mechanism and remains registered as a fallback even after `NTF-05` ships (Part 17 `NTF-05` FR-13). ADR-015's adapter-only interface means Cloud API, a BSP, and the deep link are three implementations of one interface selected by configuration. Per-message cost is surfaced to the tenant rather than absorbed, so a price change is a pricing conversation rather than a margin event. Payment reminders are deliberately designed as Utility-category content — an amount and a due date, never an offer — because content is what determines category.

**Contingency.** Fall back to `wa.me` plus SMS, which costs a tap and zero rupees. If a BSP relationship is the constraint, the second implementation (`WhatsAppBspBackend`) already exists behind the same interface. Do not build a WhatsApp-dependent flow that has no non-WhatsApp path; this is already a design rule and it is what makes the contingency cheap.

**Owner:** Product owner, with compliance for verification. **Review:** quarterly, and on any Meta announcement.

**Related:** `RSK-18`, `RSK-01`; ADR-015; `NTF-05`, `LED-12`.

### RSK-20 — Backups exist but restore has never been proven at real scale

**Failure mode.** The nightly dump runs, the verification restore passes, the off-host copy succeeds — and none of it has ever been exercised against a database the size of a year of real production, on a fresh host, by someone under pressure. The measured RTO of 30 minutes was measured on a small staging database. The real restore takes four hours, or fails on an extension that is not installed on the new host, or succeeds without the media directory because that was a separate rsync nobody tested.

**Likelihood: Medium.** The drill is specified as monthly on staging against the newest production dump, which is a strong control. The gap is scale and freshness of host. **Impact: High.** **Severity: High.**

**Leading indicators.** Drill elapsed time trending upward with database size. Any drill that deviates from the runbook. A staging environment that no longer resembles production. Media verification skipped in a drill.

**Preventive mitigations.** Part 29 §29.5's drill is mandatory, scheduled, timed and recorded, and includes opening three random attachments in the restored environment — which is the media check made concrete. `pg_dump --format=custom` supports parallel `pg_restore`, so the restore scales with cores. The `verify_${DAY}` restore runs nightly, so a corrupt dump is found within a day rather than within a disaster.

**Contingency.** If a drill exceeds the RTO, the WAL-archiving upgrade in Part 29 §29.5.4 is taken immediately rather than at its planned trigger, and the restore is re-timed. The RTO commitment to a partner is whatever the last drill measured, never what the document says.

**Owner:** Operations. **Review:** the monthly drill.

**Related:** `RSK-11`, `RSK-17`, `RSK-21`.

### RSK-21 — There is no on-call and no second operator

**Failure mode.** The stack goes down at 8 p.m. on a Saturday, which is peak trading for a kirana shop. Nobody is watching, there is no alerting route, and the merchant discovers it by tapping "You gave" and seeing an error. The product's availability commitment (99.5 % monthly, Part 1 §1.11) is met on paper by uptime that nobody measured.

**Likelihood: High** at MVP, by construction. **Impact: Medium** for a small direct cohort; High once a partner SLA exists. **Severity: High.**

**Leading indicators.** Absence of an alert on `/system/health`. Incidents discovered by merchants rather than by monitoring. Mean time to acknowledge, if it is even measurable.

**Preventive mitigations.** `/system/health` and `/system/version` are MVP endpoints. Part 30's structured JSON logging with `request_id` and `tenant_id` makes diagnosis possible without an APM. Part 18 §18.13 R6 requires an agreed on-call route as a release criterion — the product cannot ship without someone having written down who is called.

**Contingency.** A free external uptime check hitting `/system/health` every five minutes with an SMS or push alert is an hour of setup and removes most of this risk; it is the highest-value operational hour available and should be done before launch. Beyond that, the honest MVP posture is a stated support window rather than a pretended 24×7 — merchants forgive a published window and do not forgive a silent one. A partner SLA requires a second operator (`RSK-17`) and that is a contractual precondition.

**Owner:** Operations. **Review:** monthly.

**Related:** `RSK-17`, `RSK-06`, `RSK-24`.

---

## 36.6 Commercial risks

### RSK-22 — White-label partner concentration

**Failure mode.** The partner channel is the parallel revenue path that `RSK-01`'s contingency depends on, and Phase 2's commercial model assumes it. One partner is signed. That partner's merchants become the majority of active tenants, its requirements shape the Phase 2 backlog, its branding is the only white-label configuration ever exercised, and its renewal is the company's revenue. Then it re-organises, its champion leaves, its own strategy moves, or it builds the capability internally — and the product loses most of its users, most of its revenue and most of its roadmap justification in one conversation.

**Likelihood: High** that the first partner is a large share of the base, because that is what a first partner is. **Impact: High.** **Severity: Critical.**

**Leading indicators.** Share of active tenants and revenue attributable to the largest partner. Number of named individuals at the partner who understand the product — a single champion is the real concentration risk. Share of the Phase 2 backlog traceable to one partner's requests. Time since the last new partner conversation advanced a stage. Renewal date proximity without a renewal conversation.

**Preventive mitigations.** Part 13 §13.3's entry criteria forbid building `WLB-03`–`WLB-06` speculatively: they are gated on a named partner with signed intent, which prevents the *inverse* failure of building a partner platform for nobody. Part 1 §1.11's twelve-month target of three partners live and twenty-four-month target of six to eight is the diversification plan stated as a number. The direct self-serve channel is maintained as an independent path rather than abandoned once a partner arrives. The white-label architecture (Part 24) is three-level — Metis, partner, tenant — with partner rows cached in-process and expected to number ≤ 100, which means a second and third partner cost configuration rather than engineering.

**Contingency.** A partner's departure must not be a product event. That means: no partner-specific code paths, only partner-scoped configuration (Part 24's core rule); merchant data exportable per tenant (`PLT-10`) so a partner's merchants can be migrated or released; and a contractual notice period long enough to re-plan a phase. If concentration exceeds 60 % of revenue, new partner acquisition becomes the top commercial priority regardless of what else is planned, and the direct channel's pricing is revisited to make it viable standalone.

**Owner:** Commercial owner. **Review:** monthly once any partner is live.

**Related:** `RSK-01`, `RSK-24`, `RSK-25`; Part 24; `WLB-01`–`WLB-06`.

### RSK-23 — The pricing model is undecided, then set wrong

**Failure mode.** OQ-02 records that the commercial model — flat annual per business with user-count steps, monthly subscription, or per-active-merchant to partners, and what is included free — is not decided. It is needed at Phase 2 entry because it determines what `PLT-15` must enforce and what `PLT-16` must bill. Decided late and under pressure, it is set by copying a competitor, and then either sits below the cost of support or above the segment's ceiling. Worse, it is changed after merchants have paid, which is a top-three churn trigger in this market (Part 3 §3.5).

**Likelihood: Medium.** The research has done most of the work — ₹0–₹4,000/year for micro, ₹8,000–₹25,000 for staffed, flat per business rather than per user, published and grandfathered prices — so the decision is informed. The risk is timing. **Impact: High.** **Severity: High.**

**Leading indicators.** OQ-02 still open as Phase 2 entry approaches. Any pricing communicated to a merchant or partner before the model is decided, because that becomes the price. Support and infrastructure cost per paying tenant, which sets the floor and is frequently unmeasured.

**Preventive mitigations.** The wall's *placement* is already decided and specified (Part 11 §11.2, Part 1 §1.9); only the number and the billing shape are open, which is a much smaller decision. `PLT-15` (entitlements) ships at MVP so the wall is enforceable whatever the price turns out to be. Prices are published and renewals grandfathered as a stated commitment, which removes the specific failure of a renewal price rise.

**Contingency.** If the decision cannot be made by Phase 2 entry, the stated default applies: flat annual per business with user-count steps, a free accountant seat, published prices, grandfathered renewals — the shape the research supports — with the number set at the low end of the staffed band and raised only for new cohorts. A price set too low can be raised for new customers; a price set too high has already lost the cohort.

**Owner:** Commercial owner. **Review:** at Phase 2 entry; OQ-02 in Part 37 carries the deadline.

**Related:** `RSK-01`, `RSK-25`; OQ-02.

### RSK-24 — A partner security or procurement review fails

**Failure mode.** A bank or NBFC partner's security team reviews DigiKhaato and finds: no SOC 2, no penetration test report, no named DPO, a single operator, no formal SDLC evidence, a dependency list that is short but unaudited, and an incident-response process that exists as a document rather than as a history. The deal stalls for six months or dies.

**Likelihood: Medium.** Much of the architecture was chosen precisely to pass such a review — ADR-019's single-machine deployability, ADR-021's short dependency list, India-region hosting, no third-party analytics SDK, no data leaving the deployment. The gaps are organisational rather than technical. **Impact: Medium.** **Severity: Medium.**

**Leading indicators.** Questionnaire items that cannot be answered with an artefact. Any review that asks for a third-party attestation. Requests for data-residency guarantees beyond India-region hosting (OQ-06).

**Preventive mitigations.** Part 27 is written as an answerable security standard rather than a set of intentions, with a threat model, a verification method per threat, and a dependency policy with SLAs. The absence of Sentry, OpenTelemetry, Prometheus and any analytics SDK at MVP means there is no third-party data flow to explain. `PLT-10` (export and deletion) and the consent model give direct answers to DPDP questions. Part 29's documented deploy, backup, restore and rollback procedures are the evidence a reviewer asks for.

**Contingency.** Commission an external penetration test before the first bank conversation rather than during it; it is the single artefact that most reliably unblocks these reviews. For SOC 2, be honest that it does not exist and offer the alternative that partners in this market generally accept: the partner hosts the deployment itself, which the architecture already supports and which moves most of the review to their own controls. Name a second operator (`RSK-17`) before the review, not after.

**Owner:** Engineering lead, with the commercial owner. **Review:** per partner engagement.

**Related:** `RSK-16`, `RSK-17`, `RSK-22`, `RSK-27`; OQ-05, OQ-06.

### RSK-25 — Reseller channel economics do not work

**Failure mode.** The channel thesis rests on the observation that Tally has 28,000 partners and Vyapar 27,000, with top partners earning ₹2 lakh a month (Part 1 §1.9). A reseller sells DigiKhaato at ₹4,000 a year on a 30 % margin, earns ₹1,200 per merchant, and has to onboard each one with twenty minutes of opening-balance entry (Part 18 §18.9 A2) plus first-line support. The economics do not clear their cost of sale, so they sell the competitor instead — whose product is more expensive and therefore pays more per sale.

**Likelihood: Medium.** **Impact: Medium** — it constrains one growth path rather than ending the product. **Severity: Medium.**

**Leading indicators.** Reseller-sourced merchants per reseller per month. Reseller churn. Any reseller asking for a higher margin rather than more leads, which indicates the unit economics rather than demand are the problem. Onboarding time per merchant, which is the reseller's actual cost.

**Preventive mitigations.** The active-merchant pricing unit for white-label partners (Part 1 §1.9) aligns the partner's revenue with usage rather than with a one-off sale, which pays for ongoing support. The L1/L2 support split is contractual so the reseller's obligation is bounded. `IMP-01`, `PTY-10` and `INV-09` reduce onboarding time, which is the dominant cost in the reseller's model — every minute cut from migration is margin returned to the channel.

**Contingency.** Raise the price before raising the margin: a product that cannot fund a channel at its price point has a pricing problem, not a channel problem. Alternatively, target institutional partners (banks, distributors, ERP vendors) whose motive is their own adjacent revenue rather than resale margin — which is what Part 11 §11.2's white-label argument actually rests on and is a different channel from an individual reseller.

**Owner:** Commercial owner. **Review:** quarterly.

**Related:** `RSK-22`, `RSK-23`, `RSK-02`.

---

## 36.7 Regulatory and compliance risks

### RSK-26 — A GST rule change invalidates computation logic

**Failure mode.** The slab structure changes again, as it did on 22 September 2025. Or the HSN digit requirement moves with turnover. Or the credit-note declaration deadline shifts. Or a new cess appears. A tenant reprints an invoice dated before the change and it computes with today's rates; or a new invoice computes with yesterday's. Either produces a wrong document, and a wrong document produces a revised filing, a notice, or a buyer who loses input credit — which is the merchant's money, not an inconvenience.

**Likelihood: High.** India produced GST (2017), e-invoicing (2020), repeated e-way-bill iterations, a slab restructure (2025) and new TDS/TCS sections (2026) in under a decade. Part 18 §18.9 A9 states this assumption as *certain to hold*. **Impact: High** — G4 in Part 18 §18.3.1 is "be correct on GST" and it is the purchase trigger for the whole segment. **Severity: Critical.**

**Leading indicators.** CBIC notifications and Council meeting outcomes. Any hard-coded rate, threshold or date discovered in code review — Part 18 §18.10 C9 makes regulatory constants configuration, so any constant is a defect. Accountant feedback on a GST summary that does not reconcile.

**Preventive mitigations.** The `tax_rate` table carries effective dates and rate resolution is by the document's date, not by `latest()` — this is the single most important compliance decision in the schema and it is why a pre-22-September-2025 document is an explicit release-gate fixture (Part 18 §18.13 R2). Every threshold named in the research — e-invoice turnover, e-way bill value with state overrides, composition limits, the HSN digit rule, the credit-note declaration deadline — is a settings row rather than a constant (Part 18 §18.10 C9). A named compliance owner is a role in the approval block of Part 18 §18.16, not an aspiration. The GST fixture suite is written from the rules.

**Contingency.** A rate change is handled as data: a new `tax_rate` row with an effective date, seeded before the change takes effect, plus a fixture for a document on each side of the boundary. A *structural* change — a new tax component, a changed place-of-supply rule — is treated as a defect against the current product with a statutory deadline and is scheduled immediately, which is the single exception to Part 13 §13.8's phase-boundary rule. Merchants are notified of what changed and from which date, in both languages.

**Owner:** Compliance owner. **Review:** monthly against CBIC notifications; immediately on any Council announcement.

**Related:** `RSK-12`, `RSK-29`; Part 3 §3.4; `RPT-07`.

### RSK-27 — DPDP enforcement lands on an unprepared product

**Failure mode.** DPDP Phase 3 — notice, consent, security, breach reporting, erasure, children's data, grievance redress — commences on 14 May 2027, with MeitY having floated pulling it forward to November 2026. A merchant's customer exercises an erasure right and the deletion does not cascade into `notifications_message_log`, which still holds their mobile number. Or there is no published grievance officer. Or a breach is reported at 96 hours rather than 72. Penalties reach ₹250 crore per breach category.

**Likelihood: Medium** for a material finding; **High** for at least one gap existing at commencement. **Impact: High.** **Severity: High.**

**Leading indicators.** OQ-10 (retention rule for `notifications_message_log` rows containing recipient numbers) still open. Any `PLT-10` deletion path that has not been executed end to end. Absence of a published grievance officer contact. Consent fields (`sms_opt_in`, `consent_at`, `consent_source`) present in the schema but unpopulated in production data, which means the flow that captures them is not working.

**Preventive mitigations.** The role allocation is settled in the specification: the merchant is the Data Fiduciary for their customers' data, DigiKhaato is the Processor, and simultaneously a Fiduciary for merchant accounts (Part 3 §3.10). Per-party `consent_source` and opt-in timestamp are schema fields on `PTY-01`. `PLT-10` (export and deletion) ships at MVP and sits on the cut-line list only with an explicit note that cutting it requires a documented manual process and a Part 39 entry. `PTY-07`'s contact picker is on-device with no address-book upload, which is the specific DPDP instruction. India-region hosting is preferred; no analytics SDK and no third-party error reporting at MVP means almost no cross-border surface to explain. Part 18 §18.13 R7 makes DPDP posture a release criterion.

**Contingency.** A gap analysis against the eight obligations, conducted against the notified Rules rather than the draft, no later than six months before commencement. The erasure cascade is the item most likely to be incomplete and should be tested with a real deletion, including message logs, attachments and analytics rows, with the GST retention exception (72 months from the annual-return due date) applied explicitly rather than by omission. A breach runbook with the 6-hour CERT-In and 72-hour DPDP clocks on its first page (`RSK-16`).

**Owner:** Compliance owner. **Review:** quarterly; monthly from six months before commencement.

**Related:** `RSK-16`, `RSK-30`, `RSK-24`; OQ-10; Part 3 §3.10.

### RSK-28 — A UPI/NPCI policy change breaks QR or intent generation

**Failure mode.** `PAY-03` generates static and dynamic UPI QR codes and intent links locally from the tenant's own VPA, with no aggregator and no network call (ADR-027). NPCI changes the intent parameter set, tightens what a merchant QR may contain, requires merchant-category or on-boarding attestation for collect flows, or deprecates a parameter the encoder emits. Merchants scan and the payment fails, or succeeds to the wrong place.

**Likelihood: Medium.** UPI specification churn is real but the merchant-QR surface has been comparatively stable. **Impact: Medium** — collection falls back to cash and manual UTR entry, which already exists. **Severity: Medium.**

**Leading indicators.** NPCI circulars. Support contacts about QR scans failing on a specific payment app. Any increase in manually-entered UTRs relative to QR presentations.

**Preventive mitigations.** The generator is local and small, so a spec change is an edit rather than a vendor dependency. `PAY-01`'s manual "I received it by UPI, here is the UTR" path is one field and is the designed MVP primary — the QR is an accelerant, not a requirement. `P7` in Part 18 §18.5 requires the product to be honest that a static-QR payment is invisible to the server, so no flow assumes callback.

**Contingency.** Update the encoder; verify by scanning with at least two real UPI applications, which is already the acceptance method. If attestation or aggregator onboarding becomes mandatory for merchant QRs, `PAY-06`'s aggregator adapter moves forward and the QR becomes aggregator-issued, which is a Phase 2 feature brought forward rather than new work.

**Owner:** Engineering lead, with compliance for policy monitoring. **Review:** quarterly.

**Related:** `RSK-14`; ADR-027; `PAY-01`, `PAY-03`, `PAY-06`.

### RSK-29 — The e-invoicing threshold descends onto the installed base

**Failure mode.** Part 18 §18.9 A5 assumes the target segment is below the e-invoicing turnover threshold at launch. The threshold has moved repeatedly and downward. It moves again, and a cohort of tenants discovers that their B2B invoices are not legally valid without an IRN — which `SAL-12` delivers in Phase 3, roughly 34 weeks after launch. Those tenants must either stop using the product for B2B invoices or leave.

**Likelihood: Medium** within eighteen months. **Impact: Medium** — it affects the upper tail of the base, which is also the highest-paying part of it. **Severity: Medium.**

**Leading indicators.** Notified threshold changes. The turnover distribution of the tenant base, which the product can estimate from its own sales register data and should. Any tenant approaching the current threshold, which Part 13 §13.4 already makes a Phase 3 entry criterion.

**Preventive mitigations.** Part 18 §18.9 A5 states the consequence explicitly — an affected tenant cannot legally use the product for B2B invoices until `SAL-12` ships, "and this must be stated in sales conversations rather than discovered". The threshold is a settings row, not a constant. The Phase 3 sequencing already puts `SAL-12` first in release 3.0 with a GSP contract as an entry criterion.

**Contingency.** Pull `SAL-12` forward, which is expensive (Part 13 §13.4 estimates eight weeks with a compliance owner, not four weeks of integration) and requires a GSP relationship that has a lead time of its own — which is why a GSP shortlist with pricing should exist before it is needed rather than after. In the interim, affected tenants are told plainly and offered the documented manual path; that is a worse answer than shipping the feature and a much better one than a legally invalid invoice.

**Owner:** Compliance owner. **Review:** quarterly.

**Related:** `RSK-26`, `RSK-05`; `SAL-12`, `SAL-13`.

### RSK-30 — A messaging-consent or TRAI enforcement action hits the sender identity

**Failure mode.** A merchant uses reminder messaging to send something promotional, or sends to customers who never gave a number for that purpose. Complaints accumulate against the header, and the sender identity — which is shared across tenants unless registration is per-partner — is throttled, scrubbed or suspended. Every merchant on that header loses messaging because of one merchant's behaviour. The same shape applies to a WhatsApp business account suspended for template misuse.

**Likelihood: Low** per incident, but with a long tail as the base grows. **Impact: High**, because the blast radius is every tenant on the shared identity. **Severity: Medium**, treated as High once a partner shares the identity.

**Leading indicators.** Complaint or block rates per header and per template. Any template whose content drifts toward an offer. Opt-out rates by tenant — a single tenant far above the base rate is the one who will cause this. Message volume spikes from one tenant.

**Preventive mitigations.** Ledger and reminder messages are Service-Implicit (`-S`) by design and their content is fixed by a template registry rather than composed by merchants, which removes the main vector. Per-party opt-in with `consent_source` and `consent_at`, and `whatsapp_opt_out_at`, are schema fields. Kill switches per channel exist in `NTF-02`. Part 11 §11.3 item 4 excludes CRM and campaign tooling explicitly *because* promotional messaging destroys the service-message sender reputation the ledger depends on — this risk is the reason that exclusion exists.

**Contingency.** Suspend the offending tenant's messaging rather than the channel; per-tenant kill switches make this possible without collateral damage. Fall back to `wa.me` deep links, which carry no shared sender identity at all. Per-partner DLT registration (OQ-03) confines the blast radius to one partner's base and is the structural answer if the shared identity proves fragile.

**Owner:** Compliance owner. **Review:** quarterly; monthly once server-sent messaging is live.

**Related:** `RSK-18`, `RSK-19`, `RSK-27`; OQ-03; `NTF-02`.

---

## 36.8 The top five risks, ranked

Six risks carry a `Critical` severity. Ranking them is a judgement about which ones, if unmanaged, most reduce the probability that DigiKhaato exists and is useful in two years. The ordering below is deliberate and the reasoning matters more than the order.

**1. `RSK-12` — the AI coding agent produces plausible-but-wrong financial logic.** It is first because it is the only `Critical` risk that can destroy the product silently *and* is entirely within the team's control. Every other risk here announces itself: conversion is measurable, adoption is measurable, a partner leaving is an event. Wrong arithmetic in a ledger is discovered by a merchant, in front of a customer, weeks later, and by then it has propagated into filings. It is also the risk this specification's own completeness most encourages the reader to discount, because a document this detailed feels like it has already solved implementation. It has not; it has only removed ambiguity, which is necessary and not sufficient.

**2. `RSK-01` — the free tier does not convert.** It is second because it is the best-evidenced failure in the category and because it decides whether there is a company. It is not first because it fails slowly and visibly, which means there is time to respond, and because the specification has already made its most important defence: placing the wall before launch rather than discovering it after.

**3. `RSK-17` — single-developer bus factor.** Third because it is the multiplier on every other risk in this register. Every mitigation above names an owner, and at MVP most of those owners are one person. It is also the risk with the cheapest partial mitigation — a named second operator who has performed a restore and a deploy — and the one most likely to be deferred because it feels like an administrative task rather than an engineering one.

**4. `RSK-02` — adoption stalls at the migration step.** Fourth because it is the precondition for `RSK-01` even being testable. A product with no adopted tenants cannot discover whether its wall is in the right place. It ranks below `RSK-17` only because its mitigations are concrete, built, and on the never-cut list.

**5. `RSK-26` — a GST rule change invalidates computation logic.** Fifth because it is certain to occur and because its impact is on the one thing the target segment buys software for. It ranks fifth rather than higher because the specification's single most important compliance decision — effective-dated rates resolved by document date — already removes the common form of it, and what remains is operational vigilance rather than an unsolved design problem.

`RSK-22` (partner concentration) is the sixth `Critical` risk and is excluded from the top five only because it cannot materialise before a partner exists. Once one does, it should be read as third.

---

## 36.9 What would make us stop and rethink

A risk register that only lists mitigations implies the plan is always worth continuing. That is not a safe assumption, and the conditions below are written now, before any of them is near, so that recognising one is an observation rather than an argument. Each states the evidence, not a feeling, and each has a defined response that is *not* "try harder".

**If the one-book thesis does not hold.** The single measure of the product's central claim is the share of active tenants using both the ledger and at least one document module in the same month (Part 1 §1.11). If, at twelve months with at least 500 active tenants, that share is below 20 %, the thesis is wrong in its current form: merchants are using DigiKhaato as a khata app with extra screens, and the category's history says that does not monetise. **Response:** stop building document depth, and decide explicitly whether the product is a ledger app with a different business model or a billing product that should drop its ledger-first framing. Do not continue building both.

**If correctness fails twice in production.** Two distinct incidents in which a merchant's balance, stock figure or tax computation was wrong in a way the product could not immediately explain and repair. **Response:** halt feature work entirely and rebuild confidence — property-style invariant tests, an arithmetic review of every financial service against the FRD worked examples, and a published correction record. A product whose numbers cannot be trusted has no proposition at all, and shipping features on top of it compounds the problem.

**If adoption requires a human every time.** If, after `IMP-01`, `PTY-10` and a dashboard migration prompt are live, fewer than 25 % of self-serve merchants ever reach ten parties with balances, the product cannot be sold without a field agent. **Response:** accept that and re-price for an assisted channel, or solve migration with something qualitatively different (document extraction from a photographed notebook, Part 40 §40.9). Do not keep adding features to a product nobody has finished setting up.

**If the paid wall does not move at 5,000 tenants.** If conversion remains below 1 % with 5,000 tenants created and the partner channel has produced no signed second partner, there is no self-serve business and no channel business. **Response:** this is the point at which continuing is a choice about what the product is *for*, not about how to improve it. The honest options are a channel-only strategy with direct sign-up closed, or acknowledging that the product is a personal and small-scale tool that does not need to be a company — which is a legitimate outcome given that ADR-019 and ADR-021 were chosen partly so that it runs for one person on one machine.

**If a single operator is still the whole team when a partner is live.** A partner SLA held by one unavailable person is a commitment that cannot be kept. **Response:** do not sign, or sign with the constraint disclosed and the SLA written to match reality. This one is not a re-think of the product; it is a refusal to make a promise, and it is listed here because the pressure to make it will be considerable.

**If compliance becomes the whole roadmap.** If two consecutive phases are consumed by GST, DPDP and e-invoicing work with no user-facing capability shipped, the product has become a compliance utility for a segment that buys compliance from someone with a compliance business. **Response:** reconsider whether the GST-registered upper segment is the right target at all, against the alternative of the sub-threshold ledger-first segment where the compliance burden is far lighter.

**What is explicitly not a reason to stop.** Slower-than-planned growth with rising engagement. A competitor shipping an adjacent feature. A missed phase date. A partner conversation that does not close. Each of these is ordinary, and treating any of them as a crisis is how a small team abandons a correct plan early — which, in a category whose incumbents lost hundreds of crores executing incorrect ones, would be the most avoidable failure of all.

---

## 36.10 Governance

This register is reviewed on the cadence stated per risk, with every `Critical` risk reviewed weekly and every `High` risk at every sprint boundary. A review consists of three questions and nothing else: has any leading indicator moved; is the mitigation still carried by the artefact it names; and has the likelihood or impact rating changed, with the reasoning updated rather than replaced.

New risks are added with the same record shape and the next `RSK-` number; numbers are never reused and a retired risk is marked "closed" with the date and the reason rather than deleted, because the history of what was feared and did not happen is as useful as the history of what did. A risk whose likelihood falls to negligible is closed; a risk that materialises is closed and replaced by an incident record and, where the response revealed a gap, by an entry in Part 37.

Every mitigation in this register that is *not* yet carried by a shipped artefact — the mass-correction runbook (`RSK-09`), the external uptime check (`RSK-21`), the named second operator (`RSK-17`), the breach runbook rehearsal (`RSK-16`) — is a work item, not a statement. They are listed together here so that they cannot be lost in the prose above:

| Gap | Risk | Needed by |
|---|---|---|
| Mass-correction runbook and grouped statement presentation | `RSK-09` | Before launch |
| External uptime check on `/system/health` with an alert route | `RSK-21` | Before launch |
| Named second operator who has performed a restore and a deploy | `RSK-17`, `RSK-11`, `RSK-20` | Before the first partner contract |
| Breach runbook rehearsed once, with the 6 h / 72 h clocks | `RSK-16`, `RSK-27` | Before launch |
| Cold-start document, accuracy tested by the second operator | `RSK-17` | Before the first partner contract |
| GSP shortlist with pricing, held before it is needed | `RSK-29` | Phase 2 exit |
| Per-free-tenant infrastructure cost instrumented | `RSK-01` | Phase 2 entry |

---

**End of Part 36.**
