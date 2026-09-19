# Part 40 — Future Roadmap

> **Status:** advisory. Nothing in this part is committed. It exists so that the things DigiKhaato might become are written down with their conditions attached, rather than arriving as surprises or as someone's enthusiasm mid-phase. Part 13 §13.5 states the rule this chapter operates under: **Future items must not influence MVP or Phase 2 architecture beyond the extension points already reserved in Part 21 §21.9.** An engineer who adds a nullable column, an abstraction layer or a configuration switch "for when we do accounting" is making the current product more expensive in order to serve a product that may never exist.

## 40.1 How to read this chapter

Everything beyond Phase 3 is described in three fields, and the second and third are the useful ones.

**The trigger** is the observable condition that would move an item from "future" to "roadmap". Most triggers here are the same ones written in Part 11 §11.3's Avoid table, restated in forward-looking form. A trigger is a piece of evidence, not a feeling and not a request.

**The architectural preparation already made** names what exists today that would be used. In most cases this is small and deliberate — a polymorphic `source_type`/`source_id` on ledger entries, an `entry_type` rich enough to project into journals, a jobs abstraction, an adapter interface. Where nothing has been prepared, the entry says so, because a future item with no preparation is one whose cost has not been thought about.

**What would have to be rebuilt if attempted too early** is the field that stops premature work. For several of these the answer is "nothing, it is merely wasted"; for a few it is "the core", and knowing which is which is the point.

The chapter closes with a ten-year picture and with the one section that is genuinely normative in spirit if not in force: what DigiKhaato should never become.

---

## 40.2 The accounting module

**What it is.** A double-entry general ledger with a chart of accounts, journal vouchers, a trial balance, profit and loss, a balance sheet and bank reconciliation — the `accounting` module that canon §0.3 marks as Future and that Part 11 §11.3 item 1 excludes.

**Why it is the largest gravitational pull on this product.** Every capability DigiKhaato ships makes the next accounting question more reasonable. A merchant who has invoices, purchase bills, payments, expenses and stock valuation in one place is one report away from asking for a profit and loss statement, and the person who asks is usually their accountant, who is the most credible voice in the room. It arrives not as a decision but as a sequence of small features, which is exactly how a ledger app becomes an unfinished accounting package.

**The trigger.** Two of three, as Part 11 §11.3 item 1 states: more than 30 % of paying tenants employ a full-time accountant who logs in weekly; the Tally XML export (`RPT-13`) is live and still insufficient in at least a quarter of churn interviews; or a partner contract worth more than the annual engineering cost requires a trial balance.

**Architectural preparation already made.** Part 21 §21.9 reserves the extension points explicitly. `ledger_entry` carries an `entry_type` rich enough to be projected into journals retrospectively, and `source_type`/`source_id` polymorphism means every entry knows the document that caused it. The immutability of ADR-029 is what makes a retrospective projection possible at all: because nothing was ever edited, a journal derived from the entries in 2030 will agree with what the merchant saw in 2026. An accounting module would introduce `gl_account` and `journal_entry` tables and nothing else structural.

**The condition that matters more than the trigger.** If it is ever built, it must be a **projection over the existing immutable data, never a second source of truth**. The moment there are two places that know what a party owes, the product has the reconciliation problem it was created to remove, and every subsequent feature has to be built twice.

**What would have to be rebuilt if attempted too early.** Almost nothing structurally — and that is the trap. The cost of premature accounting is not rework; it is that the team owns closing entries, depreciation, ITC matching and an audit trail an auditor will sign, forever, for a segment already served by an incumbent with two and a half million businesses and a twenty-eight-thousand-partner channel. The damage is to the roadmap, not to the schema.

---

## 40.3 Deeper GST automation and GSP integration

**What it is.** Beyond Phase 3's e-invoicing (`SAL-12`) and e-way bills (`SAL-13`): GSTR-1 and GSTR-3B prepared, validated and filed through a GSP; ITC reconciliation against GSTR-2B; automated e-invoice cancellation and amendment handling; TDS and TCS sections as they arrive.

**The trigger.** Part 11 §11.3 item 9 sets it precisely: e-invoicing is already live through a GSP adapter for a substantial paying base, the same GSP relationship covers returns at marginal cost, and a compliance owner exists who can absorb the liability for a failed submission at a statutory deadline. Filing is the boundary — preparing a return is a report, filing one is a legal act with a deadline and a penalty.

**Architectural preparation already made.** The `tax_rate` table with effective dates is the foundation and already exists; every threshold named in the research is a settings row rather than a constant (Part 18 §18.10 C9); the GST summary already reconciles to the sales register to the rupee, which is the precondition for any return being correct. The `platform_job` runner (ADR-012) and the stdlib HTTP client (ADR-022) are the shape a GSP adapter would take.

**What is genuinely hard and is not prepared.** ITC reconciliation against GSTR-2B requires matching a merchant's purchase bills against what their suppliers filed — a fuzzy matching problem over GSTIN, invoice number, date and amount, with a queue for the unmatched. That is an unmatched-payments queue (`PAY-07`) in a different domain, and the pattern transfers even though nothing else does.

**What would have to be rebuilt if attempted too early.** The GSP relationship, the compliance ownership and the liability are the cost, not the code. Building filing before e-invoicing means building the harder integration second, which is backwards: Part 13 §13.7 already requires `SAL-12` before `SAL-13` for exactly this reason, and filing sits beyond both.

---

## 40.4 Lending and working capital — and the lesson from the category

**What it is.** Credit products originated from the merchant's own ledger data: working-capital loans against receivables, supplier-credit facilities, or a merchant-cash-advance shape repaid from daily collections.

**Why it looks obvious and is not.** The product accumulates exactly the data an underwriter wants — immutable, attributable, time-ordered, covering both sides of a merchant's trade. The category's leader built its entire thesis on this: free ledger → data → lend, with a stated target of a ₹1,000 crore loan book. It produced ₹102.7 crore of FY24 revenue against a ₹116.2 crore loss, and the loans became the dominant source of negative reviews — processing delays and rejections polluting a bookkeeping app. Its closest competitor exited lending in March 2025, shut its P2P product under regulatory pressure with its book cut from ₹132 crore to ₹17 crore, and reached profitability that November on ₹30–₹99 monthly subscriptions.

**The lesson, stated exactly.** Lending as a monetisation thesis imports credit risk and regulatory whiplash. If it is ever added it must be **isolated from the ledger UX and must never gate a ledger feature behind it**.

**The only shape permitted.** Part 11 §11.3 item 7 allows one: a **partner originates its own lending** and DigiKhaato provides consented, exportable ledger data plus the consent record. The loan journey — application, approval, disbursement, collection, grievance — stays in the partner's product. DigiKhaato sells data access with the merchant's consent, and carries none of the credit risk, none of the RBI obligations and none of the review damage.

**The trigger.** A partner with its own NBFC or bank licence asking for consented ledger data, with a consent mechanism the merchant genuinely controls and can withdraw.

**Architectural preparation already made.** Immutability (ADR-029) is what makes the data underwriting-grade — Part 11 §11.2 says so explicitly and it is the one place where a technical invariant has a direct commercial buyer. `PLT-10` (export) and the per-party consent fields are the mechanism. `LON-01`–`LON-03` are a **daily-collection loan book for merchants who already lend** — a bookkeeping feature — and must never be confused with DigiKhaato lending to merchants (`OQ-12`).

**What would have to be rebuilt if attempted too early.** Nothing technical; everything reputational. A lending banner inside the ledger flow breaks `PD-15` and `LED-01`'s speed budget simultaneously, and the category has already run the experiment.

---

## 40.5 The marketplace and partner ecosystem

**What it is.** A step beyond white-label resale: third parties building on DigiKhaato. An app directory, partner-built integrations, a developer surface, revenue sharing — the shape Zoho, Tally and every mature Indian SMB product eventually reaches.

**The trigger.** `PLT-13` (tenant API keys and outbound webhooks, Phase 3) in real use by more than a handful of tenants, plus at least two independent parties asking to build something specific — not "do you have an API" but "we want to push our order data into your purchase bills". Two named integrations with named owners is the difference between an ecosystem and a press release.

**Architectural preparation already made.** More than for most items here. The REST API under `/api/v1/` with one envelope and versioning by prefix (ADR-017) is already shaped as a public surface rather than an internal one; idempotency keys exist on every document POST; the permission-codename registry (ADR-033) is the natural basis for scoped API keys, since a key is a role expressed in the same primitive; the three-level configuration chain (ADR-040) already resolves what a tenant may do. Webhooks would use the `platform_job` runner.

**What is not prepared.** Rate limiting per key beyond the general throttles, an OAuth-style consent flow for third-party access to a merchant's data, a sandbox environment, and any notion of a published, stable API contract with a deprecation policy. The last is the real cost: an ecosystem means the API can no longer change freely, which is a permanent tax on every future feature.

**What would have to be rebuilt if attempted too early.** The API contract. Publishing `/api/v1/` to third parties before the product's own shape has settled means either breaking integrators or carrying compatibility shims through every subsequent change. This is the strongest argument for keeping `PLT-13` at Phase 3 and an ecosystem beyond it — and Part 11 §11.3 item 14 already says that a platform business with integrators is the only condition under which a workflow builder would be reconsidered.

---

## 40.6 Multi-location and light manufacturing

**What it is.** Beyond Phase 2's locations and transfers (`INV-11`): branch-level profit and loss, inter-branch pricing, location-scoped permissions and reporting; and beyond `INV-19`'s composite items, genuine light manufacturing — production orders, work in progress, yield and scrap, job-work costing.

**The trigger.** Two separate ones. For multi-location: tenants with more than three locations exceeding a meaningful share of the paying base, with branch-level reporting as the top request. For manufacturing: Part 11 §11.3 item 6's condition — manufacturers exceeding 20 % of paying tenants **and** the requested capability being genuinely *assembly* (a kit of known components consumed on sale) rather than process manufacturing.

**Architectural preparation already made.** `inventory_location` exists from MVP with a single default row, so nothing needs migrating when locations become real; stock movements are already per item per location; `ItemStock` is keyed the same way. For manufacturing, `INV-19` (composite items exploding on issue) is the deliberate stopping point, and the immutable signed-movement model (ADR-030) handles a consumption movement and a production movement without any schema change.

**Where it stops, and why the boundary is sharp.** Assembly is expressible as movements. Process manufacturing is not: WIP valuation, yield variance and scrap require a costing model that weighted average cannot express, which means lot tracking, which means the movement shape changes — and Part 13 §13.7 forbids changing that shape. That is not a policy preference; it is the point at which the product would need a different data model.

**What would have to be rebuilt if attempted too early.** Building manufacturing depth before the costing question (`OQ-14`) is settled means choosing a costing model under pressure from one segment, and the choice would propagate into every stock movement and every valuation report. Shipping a shallow BOM satisfies nobody and forces exactly that choice — which is why Part 11 §11.3 item 6 says so directly.

---

## 40.7 The mobile-native question

**What it is.** Native iOS and Android applications, or Capacitor wrappers around the existing build, replacing or supplementing the PWA of ADR-020.

**The trigger.** Part 11 §11.3 item 11 names two: camera-dependent flows (`INV-10` barcode scanning) proving unusable in the mobile browsers the install base actually runs, or a partner requiring distribution through an app store for its own compliance reasons. A third, softer trigger deserves recording: app-store presence as a credibility signal in a market where merchants equate "not in the Play Store" with "not real" — which is a marketing argument rather than a technical one and should be named as such if it is ever used.

**Architectural preparation already made.** The PWA staging of ADR-020 is the preparation: a service worker exists (ADR-026), the manifest exists, and Capacitor wraps a web build rather than replacing it. `useScannerListener` already supports hardware scanners over the keyboard interface, which is the counter case that matters most for a wholesaler, and `BarcodeDetector` is used where available (ADR-025).

**What it would actually cost.** Two store accounts, a release process with review latency, native permission handling for camera and notifications, and a version-skew problem — a merchant on an old app build talking to a current API, which the web version never has. Part 18 §18.9 A1 estimates roughly six weeks of release-train shift if it moves into Phase 2.

**What would have to be rebuilt if attempted too early.** Nothing, and that is why this is the least dangerous item in this chapter. Capacitor wraps what exists. The risk is purely opportunity cost: six weeks spent on distribution rather than on the product, at a stage when the product has not yet proven it is wanted.

---

## 40.8 Regional-language expansion

**What it is.** Beyond English and Hindi: Gujarati, Marathi, Tamil, Telugu, Bengali, Kannada and further, each with complete coverage across the product rather than in the ledger only.

**The trigger.** A partner who will fund a language, or a geographic concentration of sign-ups in a state whose merchants are not served by Hindi. `OQ-08` holds the question and its default is that the third language follows the first partner who pays for it.

**Architectural preparation already made.** Substantial, and it is the clearest example in the product of a cheap decision made early. `react-intl` with ICU messages (ADR-006) takes a new locale without code change. Every string is keyed in two locales from the first commit, so there is no discovery phase in which untranslated strings are hunted. The font stack was chosen specifically for Indic coverage (Part 23 §23.2.2), and `WLB-05`'s WOFF2 validator (ADR-039) already checks Devanagari `cmap` coverage — the same check generalises to other Indic ranges.

**What is not prepared, and is the actual cost.** Translation of financial vocabulary by someone who knows both the language and the domain; a native-speaker review pass, because machine translation of "credit", "debit", "due" and "balance" is wrong in ways only an accountant notices; ongoing translation of every new string forever; and support capacity in that language, which is the largest line and the one most often forgotten (`RSK-07`).

**What would have to be rebuilt if attempted too early.** Nothing. Language expansion is the safest item in this chapter — it is bounded, additive and reversible. The only failure mode is shipping a language without the support capacity behind it, which produces merchants who can read the product and cannot get help.

---

## 40.9 AI capabilities that would genuinely be useful here

Most AI in small-business software is decorative — a chat box that answers questions the help centre already answers, or a summary of data the user can already see. Five capabilities in this product are different: each removes a task the merchant actually performs by hand, each has a measurable success criterion, and each has a failure mode that must be designed for rather than hoped away. They are listed in descending order of the ratio between value and risk.

**Document extraction from photographed bills.** A merchant photographs a supplier's invoice and the product proposes a purchase bill — supplier, date, number, line items, quantities, rates, tax. *Value:* enormous, because purchase entry is the single most tedious task in the product and because it is also the migration path (`RSK-02`) — a merchant photographing a page of their notebook is the qualitatively different answer to opening balances. *Feasibility:* high for printed GST invoices with a regular layout; moderate for handwritten kachha bills; poor for a notebook page in mixed script. *Risk and its mitigation:* the output must always be a **draft the merchant confirms**, never a posted document — which is exactly the shape `IMP-01`'s validate-preview-commit framework already has, and reusing that framework is what keeps this honest. *Trigger:* extraction accuracy on a real sample of Indian supplier invoices good enough that confirming a draft is faster than typing, measured rather than assumed.

**Reconciliation and payment matching.** Suggesting which unmatched credit belongs to which party, and which bank-statement line matches which document. *Value:* high — it is the work `PAY-07`'s unmatched queue surfaces and `PAY-08` (Phase 3) creates more of. *Feasibility:* high, and note that most of the value comes from ordinary heuristics — payer VPA, amount, date proximity, open-document matching — rather than from a model. `PAY-07` already specifies a learned payer-VPA-to-party association, which is the cheap 80 %. *Risk:* a wrong match posts a wrong ledger entry, so suggestions must be one-tap *accept*, never automatic. *Trigger:* `PAY-06` and `PAY-08` live with an unmatched volume that manual mapping cannot keep up with.

**Collection prioritisation.** Ranking which parties to chase today, from balance, aging, promise history, payment behaviour and seasonality. *Value:* high for the wholesale segment, where a collector's day is a route and a list. *Feasibility:* high, and again mostly not AI — aging buckets, broken-promise counts and days-since-contact get most of the way, and `LED-09` and `RPT-05` already compute them. *Risk:* low, because the output is a suggested order, not an action; the honest caution is that a model trained on a merchant's own behaviour will reproduce that merchant's biases about who to chase. *Trigger:* `LED-15` (collection routes, Phase 3) in use.

**Anomaly detection on entries.** Flagging an entry that is out of pattern — an amount ten times a party's normal, a duplicate within minutes, a backdated entry into a closed period, a stock adjustment that does not match any count. *Value:* moderate-to-high, and it is genuinely aligned with the product's trust proposition: catching a fat-finger before it becomes a dispute is worth more than catching it after. *Feasibility:* high with simple statistics; the hard part is the false-positive rate, because a flag that fires on normal behaviour is trained away by the user within a week. *Risk:* alarm fatigue, and the risk of implying that a staff member is suspect, which is a social problem in a family business. *Trigger:* a measured rate of corrections that a rule would have caught — which the correction telemetry of Part 31 makes observable.

**Natural-language entry and query.** "Ramesh ko 500 udhaar" as an entry; "how much does Ramesh owe" as a query; eventually voice, which matters for a user who types slowly in Devanagari. *Value:* potentially the highest of all, because it attacks the eight-second budget directly and because voice removes the literacy and typing barrier that is a real constraint in this segment. *Feasibility:* moderate — the entry case is a narrow, well-bounded parse (party, direction, amount, optional note) and is tractable; the open query case is much harder and is where these features usually become demos. *Risk:* the highest in this list. A misparsed entry writes money to the wrong party, and `PD-17`'s immutability means correcting it is visible. Any implementation must show the parsed result for confirmation before posting, which removes some of the speed advantage that justified it. *Trigger:* a measured entry-speed problem that UI work cannot solve, plus parse accuracy above a threshold set in advance.

**What is not worth building.** A chat assistant over the help centre; generated business "insights" that restate a dashboard; anything that composes a message to a customer, because reminder content is a DLT-registered template and a generated variant would be dropped at scrubbing. **The rule for all of it:** AI may propose, a human confirms, and nothing writes to the ledger without an explicit confirmation — the same rule that governs every other write in the product.

---

## 40.10 The international question

**What it is.** A second country. The candidates that come up are the ones where the same commercial practice exists in a similar form: Bangladesh, Pakistan, Nepal and Sri Lanka for the khata pattern itself; Indonesia, the Philippines and Vietnam for the warung and sari-sari shop equivalents; the Gulf for Indian diaspora merchants; parts of Africa where mobile-money-adjacent ledgers have succeeded.

**What would have to be true.** Three things, all of them, and none of them technical.

First, **a tax regime specified to the depth GST is specified here**. Part 3 §3.4 runs to several pages on slabs, effective dates, place of supply, composition, reverse charge, HSN digit rules and the 22 September 2025 restructure, and the product's fixture suite exists because of it. A second country needs the same document written by someone who knows that regime, or the product will produce confidently wrong documents.

Second, **a named launch partner in that market**, because the channel is the go-to-market (`PD-16`) and an unfamiliar market with no channel is a cold start with no distribution.

Third, **a payments and messaging substrate that the product can address**. UPI, DLT-registered SMS and WhatsApp are not incidental — they are three of the product's core mechanisms, and each has a local equivalent that behaves differently or does not exist.

**Architectural preparation already made.** Deliberately minimal and correct. Canon §0.1 keeps tax regime, currency and locale tenant-configurable so the architecture is not blocked; `tax_rate` already carries effective dates; the messaging adapter interface (ADR-015) and the payment adapter shape (ADR-016) are already provider-agnostic; money is `Decimal` with a scale that would need review but not redesign. Part 11 §11.3 item 5 states the position exactly: currency stays configurable so the architecture is not blocked, and **no feature is built for it**.

**What would have to be rebuilt if attempted too early.** Multi-currency is the trap, and it is an accounting problem wearing a localisation costume: exchange-rate tables, gain and loss accounts, and revaluation — which is item 1 of the Avoid list arriving through a side door. A product that adds multi-currency before it has an accounting model has added a permanent source of unexplainable numbers.

**The honest assessment.** International expansion is the least likely item in this chapter to happen and the most likely to be proposed, because a large addressable number is easier to write on a slide than a GST fixture suite is to write in code. The trigger is deliberately the hardest in the specification.

---

## 40.11 The platform play

**What it is.** The endpoint that all the previous sections point toward: DigiKhaato as the record-keeping layer beneath a set of things other people build and sell — a partner's lending, a distributor's order capture, an accountant's practice tooling, a bank's merchant portfolio view — with DigiKhaato owning the ledger and the trust, and owning none of the adjacent products.

**Why this is the shape rather than the alternatives.** Every adjacent product attempted in this category by its incumbents failed or imported risk. Three storefronts were built and shut. Two lending books were built; one produced losses equal to its revenue and one was shut under regulatory pressure. The pattern is consistent enough to be a finding rather than an anecdote: the adjacent bet is a tax, not a hedge. What has *not* been tried is being the layer underneath — which is also the only position that does not compete with the partners the product depends on.

**The trigger.** Several partners live, at least two of them building something on `PLT-13` rather than merely reselling, and a revenue mix in which partner-sourced revenue is a substantial and growing share. Part 1 §1.11's twenty-four-month targets — six to eight partners, ten thousand partner-channel merchants, a bank or NBFC using ledger data for underwriting — are the observable form of this.

**Architectural preparation already made.** More than for anything else in this chapter, because it has been the plan since the first migration: the Partner entity, the three-level configuration chain, module entitlements, partner-scoped messaging identity, runtime branding, and the API and permission primitives that a scoped key would use (`PD-08`, ADR-033, ADR-040).

**What would have to be rebuilt if attempted too early.** The risk here is not technical but structural: a platform with one partner is not a platform, it is a customer (`RSK-22`). Declaring a platform strategy before there are several independent participants converts a concentration risk into a stated commitment, which is worse than either.

---

## 40.12 The ten-year picture

Assume the thesis works. What does DigiKhaato look like in 2036?

It is the book that a few hundred thousand Indian small businesses actually keep — not the app they installed, the book they keep. Its ledger holds their receivables and payables, its documents are their invoices and bills, its stock figures are what they trust more than the shelf, and the paper khata is gone from those businesses in the way cash registers replaced ledgers a generation earlier in other markets. The measure of this is not installs; it is the share of active tenants using both the ledger and at least one document module in the same month, which Part 1 §1.11 already names as the single number that matters most.

It is sold mostly through other people. Banks, NBFCs, distributors and ERP vendors resell it under their own names to their own merchant bases, because the channel is how software reaches Indian small businesses and always has been. Metis Labs runs the product and a direct tier; the partners run the relationships. Revenue is a flat annual subscription per business with user-count steps plus per-active-merchant partner contracts, and the accountant still has a free seat.

It is compliance infrastructure for the segment. e-Invoices, e-way bills and returns flow through it because they must, and because the effective-dated tax model has absorbed a decade of rule changes without producing a wrong historical document. Accountants receive files rather than photographs.

It has become the data layer under other people's credit products, without having originated a single loan. Merchants consent, partners underwrite, DigiKhaato provides an immutable, attributable record and the consent trail — and carries none of the credit risk that the category's leader took on and none of the review damage that came with it.

And it is still, in shape, what it is today: one book of truth, a ledger spine with documents hanging off it, immutable, fast at the counter, in the user's language, deployable on one machine. The feature list has grown. The architecture has not changed, because the decisions that would have made it change — a second source of truth, a mutable ledger, a vertical fork, an accounting module built as a parallel system — were each declined with a written reason and a trigger that was never met.

If that picture is wrong, the most likely reasons are already written down: the free tier did not convert (`RSK-01`), the paid business turned out to be a channel business only, or the product became an unfinished accounting package one small feature at a time (`RSK-04`). Each has a stop-and-rethink condition in Part 36 §36.9.

---

## 40.13 What DigiKhaato should never become

This section is the counterweight to everything above. Each item is something the product could plausibly drift into, each has been considered, and each is refused. Where a refusal has a trigger, the trigger is named; where it does not, that is stated.

**It should never become an advertising surface.** No banners, no interstitials, no sponsored placements, no referral gamification inside the core flows. This is the one exclusion in the entire specification with **no reversal trigger**. It is ranked first among complaints for the ad-supported competitor, and an interruption between "You gave" and "Saved" destroys the eight-second budget that the product's speed proposition rests on.

**It should never become a lender.** Not first-party, not through a captive NBFC, not as a "partner offer" inside the ledger flow. The category ran this experiment twice and both results are in Part 9. A partner may originate against consented data; the loan journey stays in the partner's product.

**It should never hold two versions of the truth.** Every future capability — accounting, analytics, a partner's dashboard, an AI feature — must read from the immutable entries and movements, never maintain its own. The moment a second system knows what a party owes, the product has become the multi-app trap it was built to remove, inside one application.

**It should never make a merchant's record editable.** Corrections are reversals with reasons, visible to the merchant and to their customer. Not because immutability is elegant, but because a book that can be quietly changed cannot settle an argument, and settling arguments is what the product is for.

**It should never become a configuration language.** No workflow builder, no custom objects, no formula engine, no report designer. Every configurable surface must be supported, localised, permission-checked and migrated forever. The answer to "we work differently" is a default, a setting or a business-type seed — and if it is genuinely none of those, it is a feature request with an owner, not a switch.

**It should never fork into vertical editions.** Business type tunes defaults. A pharmacy edition and a distributor edition would multiply support cost, split the release, and create a permanent question about which vertical gets the next feature. A vertical that grows large enough to demand its own product is a signal to adopt it as a target segment, not to split the codebase.

**It should never charge for the entry itself.** The ledger tier is permanently free, unmetered and ad-free. Transaction caps are the fastest available route to revenue and the surest way to destroy the habit that makes the product valuable. The wall moves; it does not move onto the entry.

**It should never make a merchant's data hard to leave with.** Export and deletion are obligations under DPDP and trust signals commercially. A merchant who can take everything with them is a merchant who was not afraid to start, and any friction added here would be an admission that the product retains by lock-in rather than by being good.

**It should never pretend to know something it does not.** A payment made to a static QR is invisible; the product says so. A stock figure is derived from movements, not counted; the product says so. A message whose delivery cannot be confirmed is logged as `skipped`, not as `sent`. Inference is offered for confirmation, never posted silently. This is the smallest-sounding item on this list and the one that most reliably separates software a merchant trusts from software they check.

---

**End of Part 40.**
