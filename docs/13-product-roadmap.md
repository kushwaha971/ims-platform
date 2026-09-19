# Part 13 — Product Roadmap

## 13.1 How this roadmap was sequenced

A roadmap for a product of this shape can be ordered in three ways, and only one of them survives contact with the market.

Ordering by **customer demand** produces a roadmap that starts with barcode scanning, multi-godown stock and e-invoicing, because those are what merchants ask for in sales conversations. It fails because the things merchants ask for are the things they already know exist elsewhere; the thing they cannot articulate is that they want one book instead of four, and that has to be built first or it cannot be built at all.

Ordering by **engineering convenience** produces a roadmap that starts with the platform and never leaves it. It fails because the platform's shape is only knowable once real business flows run over it, and because a quarter spent on infrastructure with nothing a merchant can open is a quarter of no learning.

This roadmap is ordered by **dependency and commercial proof**, in that priority. A phase may only contain features whose dependencies have landed, and each phase must end with a commercially meaningful claim that the next phase's investment can be justified against. The phases therefore have themes that are business propositions, not feature groups:

- **Phase 1 — Replace the paper.** Prove that a business can run its whole daily loop in one app.
- **Phase 2 — Serve the staffed business and the partner.** Prove that the product can be sold, resold and operated by more than one person.
- **Phase 3 — Automate compliance and open the verticals.** Prove that the product can follow a merchant upmarket instead of being outgrown.
- **Future — Become the system of record.** Only if the preceding three are true.

Three sequencing constraints are treated as absolute throughout. First, **immutable ledger and stock primitives ship in Phase 1 and are never revisited** — everything later is a projection over them, and any phase that would require changing the shape of `ledger_entry` or `inventory_stock_movement` is mis-sequenced. Second, **nothing that requires an external contract is on a critical path** — payment aggregators, WhatsApp Business templates, DLT registration, GSP accreditation all have onboarding timelines outside the team's control, so each is isolated behind an adapter and placed in a phase whose other content can ship without it. Third, **no phase depends on a later phase's schema**, which is why Part 21 §21.9 reserves extension points now for things that will not be built for a year.

## 13.2 Phase 1 — MVP: "Replace the paper"

**Thesis.** A small Indian business keeps four records: udhaar in a notebook, bills in a bill book, stock in a register or in the owner's head, and cash in a drawer. Every existing product digitises one or two of these and leaves the merchant reconciling the rest by hand. If one product can hold all four, with the udhaar ledger as the spine, the merchant stops maintaining the paper. Everything else the company might become depends on this being true, so nothing else is attempted until it is.

**Contents.** 74 features, listed in full in Part 12 §12.2 and summarised here by module:

| Module | Features |
|---|---|
| Platform | `PLT-01`, `PLT-02`, `PLT-03`, `PLT-04`, `PLT-05`, `PLT-06`, `PLT-07`, `PLT-08`, `PLT-09`, `PLT-10`, `PLT-14`, `PLT-15` |
| White-label | `WLB-01`, `WLB-02` |
| Parties | `PTY-01`, `PTY-02`, `PTY-03`, `PTY-04`, `PTY-05`, `PTY-06`, `PTY-10` |
| Ledger | `LED-01`, `LED-02`, `LED-03`, `LED-04`, `LED-05`, `LED-06`, `LED-07`\*, `LED-08`\*, `LED-09`, `LED-10`, `LED-11` |
| Inventory | `INV-01`, `INV-02`, `INV-03`, `INV-04`, `INV-05`, `INV-06`, `INV-07`, `INV-08`, `INV-09` |
| Sales | `SAL-01`, `SAL-02`, `SAL-03`, `SAL-04`, `SAL-05`, `SAL-06`, `SAL-07`, `SAL-08` |
| Purchases | `PUR-01`, `PUR-02`, `PUR-03`, `PUR-04` |
| Payments | `PAY-01`, `PAY-02`, `PAY-03`, `PAY-04`, `PAY-05` |
| Expenses | `EXP-01`, `EXP-02`, `EXP-03` |
| Reports | `RPT-01`, `RPT-02`, `RPT-03`, `RPT-04`, `RPT-05`, `RPT-06`, `RPT-07`, `RPT-08` |
| Notifications | `NTF-01`, `NTF-02`, `NTF-03` |
| Import/Export | `IMP-01`, `IMP-02` |

\* Configuration-gated: shipped complete, inert until an SMS provider is configured.

**The user problem it closes.** "I write udhaar in a book, bills in another book, and I do not know what stock I have or who owes me how much until I add it up by hand on Sunday." After Phase 1 the merchant knows the receivable total at a glance, can produce a compliant invoice in a minute, can see what is below reorder point, and can send a statement to a customer who disputes a balance.

**What it unlocks.** Everything. Specifically: an immutable ledger that later phases project into aging, interest and route collection; stock movements that later become multi-location, batch and valuation features; a document model with lines and tax that later carries e-invoicing; a permission system whose codenames later become custom roles; a messaging adapter whose interface later takes WhatsApp and email backends without any caller changing; a partner and entitlement model that later becomes a reseller console. Phase 1 is where the extension points are created, which is why Part 21 §21.9 is written before any of them is used.

**Duration — re-derived from the task breakdown, not asserted.** The figure this section used to carry (20–24 weeks with four to six engineers) is withdrawn. It was a top-down allocation across modules, it described a team that does not exist, and it excluded five workstreams that the build cannot avoid. What follows is derived from Part 33's bottom-up estimate and reconciled against Part 32's committed capacity; the per-sprint allocation lives in Part 32 §32.2 and the task-level numbers in Part 33 §33.9, and neither is restated here (Part 0 §0.12, T-57 and T-58).

| Source | Method | Result |
|---|---|---|
| Part 33 §33.9.1 | Bottom-up: 684 tasks, estimated individually | 1,671.5 **listed** points |
| Part 33 §33.8.3 | The same, after the pattern-reuse factor (`f` = 1.00 first instance, 0.50 second, 0.20 third and later) | 610.1 **effective** points |
| Part 32 §32.1.3, §32.2 | Top-down: committed capacity × sprints | 600 points over 13 sprints |
| Part 41 §41.6.4 | An independent bottom-up estimate in engineer-weeks | ~122 engineer-weeks |

**Phase 1 is thirteen sprints: twenty-six weeks of build, with Release 1.0 in week 27**, at the team shape Part 32 §32.1.1 commits to — one full-time developer working with an AI coding agent under Part 34, not a team of four to six. The second and third rows of that table agree to within 2 %, which is the reconciliation; the fourth is the cross-check, and it lands in the same place: 122 engineer-weeks is about 25 calendar weeks of pure engineering at five engineers, before any defect budget, onboarding or leave, which is why Part 41's honest read for that shape is 26–30 weeks. Two independent methods and two different team shapes converge on roughly the same calendar. That convergence is the reason to believe the number.

**What the old figure left out, and where it now sits.** Each of these was named by the Part 42 review as missing from the 20–24-week allocation, which was distributed entirely across modules. Each is now inside the 1,671.5 listed points:

| Workstream | Where it is now | Listed points | Engineer-weeks (Part 41 §41.6.4) |
|---|---|---|---|
| Design-system core subset, tokens, gallery, tests | Part 33 DS layer, `CHS-DS` and design-system waves 0–3 | 86 | 6 |
| Print templates (four) including verification on physical printers | `CHS-PRINT`, landing in Sprints 4 and 7 | 20 | 3 |
| The in-house tooling ADR-021 requires instead of libraries | Distributed across `EPIC-CHASSIS` | ~90 | 10 |
| The testing workstream beyond feature tests — matrices, sweeps, concurrency, E2E, performance harnesses | Part 33 Test layer, plus roughly a third of every BE and FE task | 148 (and a true share nearer 35 %) | 12 |
| The `en` / `hi` copy inventory across every feature | Docs layer plus the i18n obligation inside every FE task | 28 + inline | 4 |

**The estimate is re-derived, not cut.** Part 12's cut list has not been pre-applied, and the reason is arithmetic rather than appetite. Priced against Part 33's rows, the entire ten-item cut list is worth 140 listed points — about 51 effective points at this corpus's aggregate ratio, which is **one sprint**. Items 1 to 5, the comfortable end of the list, are worth 60 listed points, under half a sprint. Two of the ten (`PLT-10`, `INV-06`) are conditionally uncuttable on Part 12 §12.7's own terms. A cut list that buys one sprint cannot close a gap of three, so pre-applying it would have bought a plan that still did not fit while shipping less product. The honest move is to state the twenty-six weeks.

The cut list keeps the job it was designed for — absorbing a *sprint* miss, which is what one sprint of recovered scope is the right size for — and it is now pre-authorised rather than merely available: **cut-list items 1 to 3 (`PLT-14`, `IMP-02`, `PLT-09`) fire automatically** at the Sprint 5 planning meeting if the falsification test below comes in above 0.25, with no further decision, recorded in Part 39 and in `docs/DECISIONS.md` on the day. Firing them is not a re-base; it buys the re-base a week of runway in which to be done properly.

**The falsification test, and the week it runs.** The whole reconciliation rests on one measured quantity: `f`, the observed cost of the third and subsequent instance of a pattern relative to the first, asserted at 0.20 in Part 33 §33.8.3 and measured by Part 32 §32.16.1's per-sprint velocity recording. It is the single most fragile number in this plan and it is falsifiable.

**It is measured at the end of Sprint 4 — week 10.** Sprint 4 is the first sprint in which most committed tasks are repeat instances of patterns established in Sprints 0 to 3, and it is early enough that a re-base costs a day of planning rather than a launch date. The measurement is mechanical: for every Sprint 3 and Sprint 4 task that is the third-or-later instance of a §33.3 pattern, divide actual points by listed points, and take the mean.

| Observed `f` at end of Sprint 4 | Effective Phase 1 total | Sprints | Phase 1 duration | What happens |
|---|---|---|---|---|
| ≤ 0.20 | ≤ 610 pts | 13 | 26 weeks | The plan holds. Re-measure at Sprint 8 and say so. |
| 0.21 – 0.25 | 610 – 673 pts | 14 | 28 weeks | Absorbed by the sprint reserve for two sprints, then re-measured at Sprint 6. No cut, no new date, and the risk is stated in the sprint report rather than carried silently. |
| 0.26 – 0.30 | 673 – 735 pts | 15 | 30 weeks | Cut-list items 1–3 fire at Sprint 5 planning. Part 32 §32.15.2's re-base runs and publishes a new Release 1.0 date. |
| 0.31 – 0.40 | 735 – 860 pts | 16–17 | 32–34 weeks | As above, plus cut-list items 4–6, plus a scope conversation about Phase 1's contents rather than its date. |
| > 0.40 | > 860 pts | 18+ | 36+ weeks | The reconciliation in Part 33 §33.8.3 is falsified, not merely missed. The plan is re-estimated from the ground up at the observed `f`, and the agent-multiplier assumption of Part 32 §32.1.3 is re-examined at the same time, because the two are measuring the same thing from different ends. |

Three properties of this test are the point of it. It has a **date** (end of week 10), not a condition. It has a **number** with a defined arithmetic, not a judgement. And every row names **what happens**, decided now, while nobody is under pressure — which is the same discipline Part 12 §12.7 applies to cutting, applied to estimating.

**What the duration still assumes,** stated because an unstated assumption is the one that breaks the plan (Part 41 TL-07). That the FRDs are complete and correct before the build begins. That `ml-uikit` and the BrandHub conventions are available and reusable; if they are not, Part 33's `EPIC-CHASSIS` grows by the design-system wave's full first-instance cost and the plan loses two to three sprints. That the developer is not also carrying support — Part 18 R9's support ownership is not inside these 26 weeks. That the pilot's ten merchants are recruited by somebody who is not the developer. And that the five decisions on Part 42 §42.6.1's blocking list are closed before Sprint 0, because each of them is a week of rework if it is answered by the code instead.

**Entry criteria.** Canon (Part 0), the feature catalogue (Part 16), the database architecture (Part 21), the API specification (Part 22) and the design system (Part 23) accepted; FRDs for all MVP features complete with acceptance criteria; the reference device and the 3G performance budgets agreed; one pilot partner or ten pilot merchants identified by name.

**Exit criteria.** Every line of the launch-readiness checklist in Part 12 §12.8 is true. In particular: zero balance and stock drift on a 100,000-row dataset; the GST fixture suite green including a pre-22-September-2025 document; the cross-tenant probe suite returning 404 everywhere; the eight-minute demo executed without apology on the production build; and at least five of ten pilot merchants reporting at day 45 that they no longer maintain the paper khata. That last criterion is the phase's actual exit, and the others are necessary conditions for it.

**Commercial rationale for its position.** There is no alternative position; it is first. What matters is what is *not* in it, and the discipline is that every omission is justified by Phase 1's thesis rather than by difficulty. Barcode scanning is omitted because a merchant can type a barcode and still stop using paper. Multi-location is omitted because a single-shop merchant can stop using paper. A payment aggregator is omitted because a merchant with a static QR and a UTR field can stop using paper. None of these omissions is comfortable, and each one is correct.

## 13.3 Phase 2 — "Serve the staffed business and the partner"

**Thesis.** Phase 1 proves a business can run on the product; Phase 2 proves the product can be sold. Two facts from the research drive it. First, paying conversion in this market is driven by multi-user access, depth of stock handling and server-sent messaging — not by the ledger, which the market expects to be free. Second, the channel is how Indian small-business software actually reaches merchants: the incumbents move volume through tens of thousands of partners, and a white-label partner needs its own console, its own domain, its own branding and its own messaging identity before it can put its name on anything. Phase 2 builds the paid boundary and the channel simultaneously, because neither is worth building without the other.

**Contents.** 37 features:

| Module | Features | What the group delivers |
|---|---|---|
| Platform | `PLT-11` | App lock / PIN for the installed PWA |
| White-label | `WLB-03`, `WLB-04`, `WLB-05`, `WLB-06` | Partner hostname and branded login, partner admin console, extended theme tokens, partner-branded SMS/WhatsApp/email identity |
| Parties | `PTY-07`, `PTY-08`, `PTY-09` | Contacts picker, duplicate merge, public "view your khata" link |
| Ledger | `LED-12`, `LED-13` | WhatsApp Business API reminders, recurring reminder schedules and weekly hisaab days |
| Inventory | `INV-10`, `INV-11`, `INV-12`, `INV-13`, `INV-14`, `INV-15` | Camera barcode scanning, multi-location and transfers, variants, price lists, secondary units, label printing |
| Sales | `SAL-09`, `SAL-10`, `SAL-14` | Delivery challan, recurring invoices, customer-facing invoice page with pay button |
| Purchases | `PUR-05`, `PUR-06`, `PUR-07`, `PUR-08` | Purchase orders, goods receipt, debit notes and purchase returns, landed cost |
| Payments | `PAY-06`, `PAY-07` | Payment aggregator integration with webhooks, unmatched-payments queue with VPA learning |
| Expenses | `EXP-04` | Recurring expenses |
| Reports | `RPT-09`, `RPT-10`, `RPT-11`, `RPT-12` | Item movement and fast/slow movers, profit summary, staff performance, GSTR-1 JSON export |
| Notifications | `NTF-04`, `NTF-05`, `NTF-06` | Web push, WhatsApp Business Platform, email channel |
| Import/Export | `IMP-03` | Excel templates and bulk edit |
| Help | `HLP-01`, `HLP-02`, `HLP-03` | In-app help centre with Hinglish synonyms, contextual help and tours, what's new |

**The user problems it closes.** Three distinct ones, for three distinct buyers. For the **staffed retailer**: "my assistant bills at the counter and I cannot tell what he sold, my stock is in two places, and scanning is faster than typing." For the **wholesaler**: "I order from suppliers against POs, I return damaged goods, my customers have different prices, and I need to know which of my three salesmen collected what." For the **partner**: "I cannot put my bank's name on a product whose login page says someone else's name, whose SMS comes from someone else's sender ID, and whose merchants I cannot see."

**What it unlocks.** Multi-location and variants make the inventory module credible for anyone beyond a single small shop, which opens the distributor segment that Phase 3's route and interest features serve. The aggregator integration makes payment reconciliation automatic, which is the pre-condition for any lending or working-capital partnership. The partner console and branded messaging make the reseller channel operable, which is the pre-condition for volume. The help centre reduces the support load that the research names as the category's largest cost and largest complaint. GSTR-1 JSON export builds the schema knowledge that e-invoicing in Phase 3 depends on.

**Duration.** 16–20 weeks. Three workstreams run largely in parallel because they touch different modules: inventory depth (`INV-10`–`INV-15`, `PUR-05`–`PUR-08`), partner and messaging (`WLB-03`–`WLB-06`, `NTF-04`–`NTF-06`, `LED-12`, `LED-13`), and payments plus reporting (`PAY-06`, `PAY-07`, `RPT-09`–`RPT-12`). The help content (`HLP-01`–`HLP-03`) is a content project with an engineering tail and should start on day one of the phase, not at the end.

**Entry criteria.** Phase 1 exit criteria met and stable for at least four weeks in production. At least fifty active tenants with real data, so that multi-location and variant migrations are tested against reality rather than fixtures. A named partner with a signed intent, because `WLB-03`–`WLB-06` built speculatively will be built wrong. External contracts started, not finished: payment-aggregator onboarding and KYC, Meta business verification and template submission, and DLT registration all have lead times of two to six weeks and must be initiated at the phase's start so they land before the features that consume them.

**Exit criteria.** One partner live on its own hostname with its own branding and its own sender identity, with at least ten of its merchants transacting. Payments auto-posting from the aggregator with an unmatched rate below five percent and a queue that clears. Multi-location in production for at least five tenants with zero stock drift across locations. A paying cohort exists — whatever the commercial model, revenue is collected from real merchants or from a partner per active merchant. Help-centre deflection measurable: support contacts per active tenant per month trending down.

**Commercial rationale for its position.** Phase 2 is where the product becomes a business. It is second rather than first because every feature in it is an amplifier of Phase 1 and meaningless without it: a partner console with nothing to resell, a payment webhook with no ledger to post into, a price list with no documents to price. It is second rather than third because the external contracts it depends on take months to obtain and because the channel, once operating, is what funds Phase 3.

## 13.4 Phase 3 — "Automate compliance and open the verticals"

**Thesis.** A merchant who grows past five crore of turnover becomes subject to e-invoicing, moves goods that need e-way bills, and acquires an accountant who wants Tally vouchers rather than a CSV. A merchant in pharma or food needs batches and expiry. A distributor with a collection route needs salesman-wise sheets and sometimes interest on overdue credit. Each of these is a reason merchants leave a product that cannot follow them. Phase 3 exists so that growth is not a churn event, and so that one or two verticals become addressable rather than merely tolerated.

**Contents.** 19 features:

| Module | Features | What the group delivers |
|---|---|---|
| Platform | `PLT-12`, `PLT-13`, `PLT-16` | Custom roles from permission codenames, tenant API keys and outbound webhooks, self-serve subscription billing |
| Ledger | `LED-14`, `LED-15` | Optional interest and late fees on overdue udhaar, collection routes with salesman-wise collection sheets |
| Inventory | `INV-16`, `INV-17`, `INV-18` | Batches with expiry and FEFO picking, stock-take sessions with variance posting, serial numbers |
| Sales | `SAL-11`, `SAL-12`, `SAL-13` | Sales orders with backorder visibility, e-invoicing with IRN and signed QR, e-way bill Part A/B |
| Payments | `PAY-08`, `PAY-09` | Bank statement import with suggested matching, post-dated cheque tracking |
| Reports | `RPT-13`, `RPT-14` | Tally XML export of vouchers and masters, scheduled reports over WhatsApp or email |
| Import/Export | `IMP-04` | Mappers for known competitor export formats |
| Loans | `LON-01`, `LON-02`, `LON-03` | Optional daily-collection loan book: borrowers and loans, collector entry with transaction-safe recalculation, overdue and collector-performance reporting |

**The user problems it closes.** "I crossed five crore and now my invoices are not legally valid without an IRN." "My CA wants Tally vouchers, not a spreadsheet he has to re-key." "I sell medicines and I must not ship an expired batch." "My four collectors go out every morning and I reconcile their cash at night on paper." "I want to move from a competitor and I have a year of data in their export format."

**What it unlocks.** Upmarket retention, which changes the shape of the revenue base: the tenants who cross the e-invoice threshold are the ones with the highest willingness to pay. Vertical entry, specifically the pharma and food segments that batch and expiry gate. Integration credibility, since API keys and webhooks (`PLT-13`) make the product something a partner's own systems can build on rather than only log into. And self-serve billing (`PLT-16`) removes the manual invoicing that Phase 2's commercial model depends on.

**Duration.** 20–24 weeks, dominated by two heavy items. e-Invoicing and e-way bill (`SAL-12`, `SAL-13`) require a GSP relationship, schema conformance testing, IRN cancellation windows, and a failure-handling design for a government API that is sometimes unavailable at a statutory deadline — treat as eight weeks with a compliance owner, not four weeks of integration. Batches and expiry (`INV-16`) touch every stock movement, every document line and the valuation engine; treat as six weeks including migration of existing stock into a default batch.

**Entry criteria.** Phase 2 exit criteria met. At least one tenant approaching or past the e-invoicing turnover threshold, so the feature has a real first user. A GSP contract signed or a shortlist with pricing. A compliance owner named — an individual accountable for the correctness of IRN payloads, e-way bill validity windows and the interest computation's tax treatment. For `LON-01`–`LON-03`, a merchant segment that already lends on daily collection, since this module is a bookkeeping feature for such merchants and not UdhaarBook lending (Part 11 §11.3 item 7).

**Exit criteria.** e-Invoices generated, cancelled within the 24-hour window and reprinted with a signed QR for at least three tenants across a full month, with a documented procedure for IRP downtime. Tally XML export accepted without error by a real accountant's TallyPrime installation. Batch-tracked stock live in at least two tenants with FEFO picking and an expiry report. Custom roles in use by at least one tenant that found the four system roles insufficient — if nobody does, `PLT-12` was mis-prioritised and that is worth knowing.

**Commercial rationale for its position.** These features are expensive, compliance-bound and narrow. Each serves a subset of tenants and each carries ongoing maintenance as regulations change — e-invoice thresholds have moved repeatedly, e-way bill validity rules were revised, and the GST slab structure itself changed in 2025. Building them before a base exists means maintaining them for nobody. Building them after Phase 2 means each one has a named customer and a revenue line attached.

## 13.5 Future — "Become the system of record"

**Contents.** `INV-19` (composite items and simple assemblies), the `accounting` module of canon §0.3 (double-entry general ledger, profit and loss, balance sheet, bank reconciliation), marketplace and e-commerce synchronisation, multi-organisation consolidation for merchants running several businesses, and a BI connector.

**Thesis, stated as a condition rather than a plan.** These are not roadmap items; they are the things the product would become if it succeeded so thoroughly that merchants stopped needing an accountant's separate system. Each is on the Avoid list of Part 11 §11.3 with an explicit reversal trigger, and the triggers are the roadmap. The accounting module in particular must be built — if ever — as a *projection* over the existing immutable ledger entries, stock movements and documents, never as a second source of truth that has to be kept in step. Part 21 §21.9 reserves the extension points that make that projection possible; nothing more is committed.

**The rule that protects the present from the future.** Per Part 16 §16.15 and canon §0.3, Future features must not influence MVP or Phase 2 architecture beyond those reserved extension points. An engineer who adds a nullable column, an abstraction layer or a configuration switch "for when we do accounting" is making the current product more expensive to serve a product that may never exist.

## 13.6 Release train

Releases are time-boxed and named by phase and increment. Within a phase, a release ships whatever is complete at the boundary; features are never held to make a release look bigger.

| Release | Phase | Nominal timing | Contents | Gate |
|---|---|---|---|---|
| **1.0** | 1 | Week 0 (launch) | All 74 MVP features, less anything formally cut per Part 12 §12.7 | Full launch-readiness checklist (Part 12 §12.8) |
| **1.1** | 1 | Launch + 4 weeks | Defect fixes, performance work against real data, restoration of anything cut, the first partner's configuration | Zero open severity-1 defects; performance budgets still met at production data volumes |
| **2.0** | 2 | Launch + 10 weeks | Inventory depth (`INV-10`–`INV-15`), purchases depth (`PUR-05`–`PUR-08`), help centre (`HLP-01`–`HLP-03`) | Multi-location migration proven on real tenants; zero stock drift |
| **2.1** | 2 | Launch + 16 weeks | Partner platform (`WLB-03`–`WLB-06`), messaging channels (`NTF-04`–`NTF-06`, `LED-12`, `LED-13`), party features (`PTY-07`–`PTY-09`) | One partner live on its own hostname and sender identity |
| **2.2** | 2 | Launch + 22 weeks | Payments (`PAY-06`, `PAY-07`), sales additions (`SAL-09`, `SAL-10`, `SAL-14`), reports (`RPT-09`–`RPT-12`), `EXP-04`, `IMP-03`, `PLT-11` | Auto-posted payments with an unmatched rate below 5 % |
| **3.0** | 3 | Launch + 34 weeks | Compliance: `SAL-12`, `SAL-13`, `RPT-13`, `SAL-11` | e-Invoice round trip including cancellation, verified with a GSP |
| **3.1** | 3 | Launch + 42 weeks | Verticals and depth: `INV-16`–`INV-18`, `PAY-08`, `PAY-09`, `IMP-04` | Batch-tracked stock live with FEFO and an expiry report |
| **3.2** | 3 | Launch + 50 weeks | Platform and wholesale: `PLT-12`, `PLT-13`, `PLT-16`, `LED-14`, `LED-15`, `RPT-14`, `LON-01`–`LON-03` | Self-serve billing collecting real revenue |

Release 1.0's "week 0" is build week 27 on the re-derived Phase 1 schedule of §13.2; every later offset in this table is relative to it and none of them moves if that date does, which is the property the train is built to have.

Between named releases, patch releases ship continuously for defects. The train does not wait: a feature that misses its release moves to the next one rather than delaying the train, and the decision is recorded in Part 39.

## 13.7 Dependency order

The build order below is stated as a set of "must land before" claims with their reasons. Each claim is testable: violating one produces either rework or a feature that cannot be demonstrated.

**Platform before everything.** Tenancy, membership, roles and the tenant-scoped queryset manager (`PLT-03`, `PLT-05`) must exist before any business table is written, because canon §0.11 rule 2 requires `tenant_id` on every business row and a fail-closed manager on every queryset. Retrofitting tenancy is the one mistake that cannot be recovered from cheaply.

**Parties before ledger.** `LED-01` posts against a `Party` and updates its denormalised balance under a row lock; the party master (`PTY-01`) and its detail page (`PTY-03`) are the surface the ledger lives on. There is no meaningful ledger entry without a counter-party.

**Ledger before documents.** `LED-10` requires invoices, purchase bills, payments and credit notes to post ledger entries that link back to their source. If documents are built first, they will either post nothing (and have to be rewritten) or post into a ledger designed around them (and the spine inverts, which is the architecture Part 11 §11.2 exists to avoid).

**Inventory before sales.** `SAL-02` deducts stock atomically at issue and needs items, units, tax rates and stock movements to exist. An invoice built against a placeholder item model will have the wrong line shape.

**Tax rates before any document.** The `tax_rate` table with effective dates must be seeded before the first invoice line is computed, because rate resolution by date is not a feature that can be added afterwards without recomputing historical documents.

**Purchases before valuation.** Weighted-average cost is established by `PUR-01`; `INV-08` (stock valuation) and the Phase 2 profit summary (`RPT-10`) are meaningless until purchases set a cost.

**Payments before aging.** `LED-09` and `RPT-05` age what is unpaid; allocation (`PAY-01`) determines what "unpaid" means for a document.

**Notification adapters before any outbound message.** `NTF-02` defines the adapter interface, the template registry and the message log. `LED-06`, `LED-07`, `LED-08` and everything in Phase 2's messaging group are callers. Building a caller before the interface produces provider-specific code scattered through the ledger.

**Reports last within a phase.** Every report is a projection over data the other modules write. Building `RPT-07` before sales and purchases exist means building against a schema that will still move.

**Within Phase 2:** `INV-11` (locations) before `PUR-06` (goods receipt against a PO, which receives into a location); `PUR-05` (purchase orders) before `PUR-06`; `INV-12` (variants) before `INV-13` (price lists) and `INV-15` (labels), since both must be able to address a variant; `NTF-05` (WhatsApp Business Platform) before `LED-12` (automated WhatsApp reminders); `WLB-03` (partner domain) before `WLB-06` (partner-branded messaging), because sender identity is resolved from the partner context the domain establishes; `PAY-06` (aggregator) before `PAY-07` (unmatched queue), since the queue is fed by webhooks.

**Within Phase 3:** `SAL-12` (e-invoice) before `SAL-13` (e-way bill), because both use the same GSP adapter and the invoice payload is the harder schema; `INV-16` (batches) before `INV-17` (stock take), so that a count can be per batch; `PLT-13` (API keys) before any outbound webhook consumer; `PAY-08` (bank import) after `PAY-06`, so that matching has both sides.

**Cross-phase constraint.** No Phase 2 or Phase 3 feature may require a change to the shape of `ledger_entry`, `inventory_stock_movement`, `sales_document_line` or `purchases_document_line`. Additions of nullable columns are permitted through a canon change request; changes to meaning, direction semantics or immutability are not. If a planned feature appears to require one, the feature is mis-specified and must be re-designed as a projection or an adjacent table.

## 13.8 Roadmap revision rules

A roadmap that never changes was not a plan but a wish; a roadmap that changes weekly is not a plan at all. These rules set the conditions under which it may move.

**Revision happens at phase boundaries, not inside phases.** Between boundaries the only permitted changes are defect fixes and compliance corrections. A feature that becomes urgent mid-phase is recorded in the open questions register of Part 18 §18.15 and considered at the next boundary. The exception is a regulatory change with a statutory deadline — a GST rate change, an e-invoice threshold moving, a DPDP obligation commencing — which is treated as a defect against the current product and scheduled immediately.

**Every revision needs evidence, and the evidence has a type.** Moving a feature earlier requires one of: telemetry showing users attempting the missing capability (a failed search, an abandoned flow, an export used as a workaround), churn interviews naming it in at least three of ten cases, a partner contract conditioned on it, or a compliance requirement. "A large customer asked" is evidence only when accompanied by the revenue and the alternative they would otherwise buy. Moving a feature later requires showing that its dependency has slipped or that its user problem was solved another way.

**Movement is an exchange, not an addition.** A phase has a duration; adding to it without removing from it moves the date for everything downstream. A request to pull a Phase 3 feature into Phase 2 must name the Phase 2 feature that moves out. This is the same rule as Part 11 §11.6 test 8, applied at phase scale.

**Reversing an Avoid decision is a separate, harder act.** The Avoid list of Part 11 §11.3 is not a roadmap backlog. Its items enter the roadmap only when their stated trigger is demonstrably met, and the demonstration is recorded in Part 39 alongside the decision. An item that arrives on the roadmap without its trigger being met is a scope failure that will be visible eighteen months later as an unfinished module nobody owns.

**Durations are re-estimated at boundaries, and the estimate history is kept.** The estimates in this part are made before the build. Each phase's actual duration is recorded against its estimate so that the next phase's estimate is calibrated by evidence rather than optimism. A phase that took 150 % of its estimate makes the next estimate 150 %, not the same number with more determination.

**The roadmap is published, including what is not on it.** Partners and merchants make their own plans against it. The published version states phases and themes with approximate timing, and states plainly that Phase 3 items are conditional. Publishing the Avoid list with its triggers is more useful than publishing dates, because it tells a partner what the product will never be — which is what they actually need to know before building on it.
