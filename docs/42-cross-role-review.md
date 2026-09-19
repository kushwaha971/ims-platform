# Part 42 — Cross-Role Review and Conflict Resolution

## 42.0 What this chapter does

Part 41 recorded 114 findings from nine professional viewpoints. Many of them are simply defects — a wrong feature ID, a duplicated table, a missing chapter — and those need an editor, not an adjudicator. What needs adjudication is the smaller set of places where two roles, each reasoning correctly from their own responsibility, arrive at incompatible requirements. A conflict is not a disagreement about facts; it is a disagreement about which cost to pay.

This chapter does five things. §42.1 states what all nine roles agree on, because the agreements are the specification's load-bearing commitments and nothing in the resolutions below may weaken them. §42.2 is the conflict register: nineteen numbered entries, each stating both positions at their strongest, what is actually at stake, the resolution, the reasoning, the decision owner, and what the losing position receives in compensation — a deferred commitment, a trigger to revisit, or an instrumentation requirement, because a resolution that gives the losing side nothing is a decision that will be re-litigated in week nine. §42.3 is the amendment list: every change the review requires to an existing chapter, marked blocking or non-blocking for build start. §42.4 is what we are deliberately leaving open, with the evidence that would close it and the date by which it must close. §42.5 restates the risk picture after the review. §42.6 is the combined verdict and the blocking checklist.

**A note on authority.** The resolutions below are proposals with named owners, not decisions already taken. A resolution becomes a decision when its owner records it — in Part 39 once Part 39 exists, and in `docs/DECISIONS.md` until then. Nothing in this chapter overrides canon; where a resolution requires a canon change it says so and that change follows Part 10 §10.7 Class B.

---

## 42.1 The consensus

Nine roles reviewed this corpus adversarially and none of them attacked the following. They are therefore the specification's actual commitments — the things that must survive every amendment in §42.3, every cut under Part 12 §12.7, and every schedule pressure in month five.

**C1 — The ledger is the spine, and it is immutable.** Every role that touched the data model endorsed canon §0.11 rules 1 and 2 and product principles P1 and P2 without qualification. One party, one immutable series of entries, one balance; corrections are reversals plus replacements with a mandatory reason; no module maintains a second view of what a party owes. The Backend Architect called the four-layer defence of immutability "the right number for the one invariant whose violation is unrecoverable"; the UX Designer called the visible correction trail "the highest-value UX decision here"; the CEO put a wrong balance second on the list of things that could kill the company and judged the defences strong. This is not negotiable and no resolution below touches it.

**C2 — Tenant isolation fails closed, returns 404, and is proven mechanically.** `tenant_id` on every business row, a scoped manager that fails closed, cross-tenant identifiers indistinguishable from non-existent ones, and a generated sweep over every endpoint rather than spot checks. The only open question is whether row-level security becomes mandatory and when (§42.4 U-04), not whether the application-level guarantee holds.

**C3 — Money is `Decimal` end to end, computed server-side, transported as strings, rounded half-up.** No role proposed a client-authoritative total, a float anywhere, or a different rounding mode. The rounding table in Part 20 §20.7.3 and the worked example in `SAL-02` BR-10 are accepted as the arithmetic specification of the product.

**C4 — Speed at the counter is a correctness requirement, not a performance target.** The eight-second entry, the hundred-millisecond drawer, no fetch on drawer open, no confirmation dialog, the Save button above the keyboard. Every role that discussed it treated a slow ledger entry as a product failure rather than an optimisation opportunity, and the staff persona's stated failure mode — quietly reverting to the paper bill book — was accepted by all nine as the thing being defended.

**C5 — Both languages, from the first commit, as a build gate.** No role proposed English-first with Hindi later. The disagreements are about the *cost* of the commitment and who pays it (§42.2 F-05), never about the commitment.

**C6 — Parity before novelty; depth is where the MVP cuts, not breadth.** Part 12 §12.1's definition and Part 11 §11.5's ordering rule ("a Common item that is slow, ugly or unreliable is worse than a missing Differentiating item") were endorsed by the Product Manager, the CEO, the UX Designer and the Product Engineer independently.

**C7 — Every state change is atomic, audited, idempotent and permission-checked.** Canon §0.11 rules 4, 5 and the permission codenames. The Tech Lead's only complaint was about how much of this a human reviewer must verify, not about whether it should be true.

**C8 — The product tells the truth about what it cannot see.** Principle P7: a static QR carries no party context, so the product offers a one-field UTR entry rather than pretending; an unmatched credit appears in a queue rather than disappearing; a write that allocates a number blocks honestly rather than faking success. Every role endorsed this and two of them (Backend Architect, CEO) identified it as the trust mechanism the lending-partner thesis depends on.

**C9 — The partner cannot read the merchant's book.** Part 24 §24.1.3's last row, enforced by the absence of a partner scope on business tables and by impersonation requiring recorded, time-boxed, audited, merchant-announced consent. The CTO called it "the thing that makes the channel sellable"; the CEO agreed; nobody proposed relaxing it.

**C10 — The twenty-minute migration is the product's real onboarding.** Part 15 §15.13 states it and every role that discussed adoption repeated it. `PTY-10` and `IMP-01` sit above most other MVP features in practical priority. The disagreement is about who performs the twenty minutes and what it costs (§42.4 U-06), not about its centrality.

---

## 42.2 The conflict register

Each entry states both positions at their strongest. Where a position is held by a role whose finding in Part 41 supports it, the finding is cited.

---

### CF-01 — Scope discipline versus competitive urgency

**Roles in tension:** Product Manager (PM-03, PM-05, PM-09) versus CEO (CEO-02, CEO-06).

**PM's position.** Phase 1 already contains 74 features for four to six engineers in twenty-two weeks, and the Product Engineer's bottom-up estimate says that is a quarter short before any contradiction is resolved. Part 13 §13.8's rule — movement is an exchange, not an addition — exists precisely so that urgency cannot silently expand a fixed build. Pulling white-label depth forward means building `WLB-03`–`WLB-06` speculatively, which Part 13 §13.3 forbids on the grounds that they "will be built wrong", and every week added to Phase 1 moves the date of everything downstream. The defensible response to competitive pressure is to ship the daily loop faster, not to ship more of it.

**CEO's position.** The commercial thesis is the channel, the channel takes six to twelve months to sign through a bank's procurement, and every week of Phase 1 in which no partner conversation happens is a week subtracted from that cycle. The competitive window before an incumbent ships an adequate response is nine to eleven months. A product that is perfectly scoped and arrives after the window has closed is a well-run failure.

**What is actually at stake.** Not features — calendar and attention. The question is whether partner readiness is engineering work (which competes with the build) or business-development work (which does not).

**Resolution.** Separate them. Partner *business development* starts in week one, owned by the CEO, using the eight-minute demo of Part 12 §12.6 as the sales asset — it already exists and is already a launch gate. Partner *engineering* stays in Phase 2 and stays gated on a signed intent, unchanged. Phase 1 scope does not move. One exception is granted: `WLB-02` (partner configuration) is already an MVP feature and its partner record, allowed-modules and support-contact fields must be demonstrably real, because Part 12 §12.8 already requires "the partner configuration path exercised with at least one real partner record".

**Reasoning.** The PM is right that engineering capacity cannot absorb urgency and the CEO is right that the clock is running. The conflict dissolves once it is noticed that the thing the CEO needs in month one is a conversation and a demo, not a hostname resolver.

**Owner:** CEO, with the Product Manager holding Phase 1 scope.

**Compensation to the CEO's position:** a standing agenda item at every phase boundary to reassess the window against named competitor movement, and the commitment in CF-02 below that Phase 2 has a partner-independent default so a slipped signature does not idle the team.

---

### CF-02 — A partner-gated Phase 2 versus a partner-independent one

**Roles in tension:** Product Manager (PM-03) and CEO (CEO-02) jointly versus the roadmap as written (Part 13 §13.3).

**The roadmap's position.** Phase 2's thesis is "prove the product can be sold", its entry criteria require a named partner, and thirteen of its thirty-seven features serve the partner. Building the partner platform without a partner produces the wrong partner platform.

**The reviewers' position.** Correct, and it leaves a quarter of the roadmap contingent on a signature nobody owns, with no alternative written. If the signature slips by two months, the team has no phase.

**What is at stake.** Whether a slipped external dependency idles a five-person team.

**Resolution.** Part 13 §13.3 is amended to present two Phase 2 variants sharing an entry gate. **Variant A (partner-led)**, unchanged, when a signed intent exists at Phase 2 entry. **Variant B (depth-led)**, the default when it does not: `INV-10`–`INV-15`, `PUR-05`–`PUR-08`, `RPT-09`–`RPT-12`, `HLP-01`–`HLP-03`, `PAY-06`–`PAY-07`, `EXP-04`, `IMP-03`, `PLT-11`, `PTY-07`–`PTY-09` — twenty-four features, coherent, sellable to the staffed business, requiring no external signature. `WLB-03`–`WLB-06`, `NTF-04`–`NTF-06`, `LED-12`, `LED-13` move to the front of Phase 2's second half or to Phase 3 depending on when the signature lands. The release train in §13.6 gains a variant row for 2.1.

**Reasoning.** The rule "do not build the partner platform speculatively" is preserved exactly. What changes is that its consequence is planned rather than discovered.

**Owner:** Product Manager.

**Compensation:** none required — both positions are satisfied. The partner features keep their gate and the team keeps its calendar.

---

### CF-03 — Minimal dependencies versus delivery speed and maintenance burden

**Roles in tension:** CTO (CTO-02, CTO-04) versus Product Engineer (PE-02) and Frontend Architect (FE-04, FE-06, FE-09).

**The dependency policy's position (ADR-021, Part 18 C2, P9).** Every dependency is a future migration cost and a line on a partner's security questionnaire. A product that runs on one VPS with PostgreSQL and a short library list is sellable into banks and NBFCs that a Kubernetes-plus-Redis-plus-S3 product cannot enter without a six-month review. This is a commercial asset, not an engineering preference.

**The engineers' position.** The policy has been applied to eighteen surfaces, of which roughly half are build-time or test-time tooling that no security reviewer ever sees: a contrast checker, a bundle checker, an i18n checker and extractor, a traceability joiner with three runner integrations, three performance harnesses, a load script. Those cost eight to twelve engineer-weeks that Part 13's plan does not contain, and two of them — a hand-written service worker and two hand-written QR encoders — are *more* alarming to a reviewer than well-known libraries, not less.

**What is at stake.** Roughly a quarter of the Phase 1 schedule, and the credibility of the commercial argument the policy exists to serve.

**Resolution.** ADR-021 is amended to distinguish **runtime** from **tooling** dependencies. The runtime allow-list — anything that ships in the browser bundle or is imported by the Django request path or the scheduler — stays closed, short and unchanged, because that is the list a reviewer reads. A **tooling allow-list** is opened for build, test and CI-only packages under the same ADR discipline with a lower bar: the package must be widely used, actively maintained, and not required at runtime. Admitted immediately: a coverage plugin, a load-testing tool, and Workbox for service-worker generation. Rejected regardless: anything that would appear in `package.json` `dependencies` or in `requirements/prod.txt`. The two QR encoders are consolidated to one server implementation (CF-08 resolves the rendering side).

**Reasoning.** The commercial argument is entirely about runtime surface. Applying it to a contrast-checking script buys nothing and costs weeks. The CTO's own finding (CTO-02) reaches this conclusion; the amendment makes it a rule rather than a judgement call per package.

**Owner:** CTO.

**Compensation to the strict position:** the tooling list is published in the same ADR and included in partner documentation, so nothing is hidden; and a build-time dependency that later needs to run at runtime requires a new ADR at the runtime bar, with no grandfathering.

---

### CF-04 — Immutability rigour versus effortless correction

**Roles in tension:** Backend Architect (C1, BE-15) versus UX Designer (journey 12, UX-03).

**The Backend Architect's position.** Nothing is ever updated or deleted. A correction is a reversal plus a replacement, linked by `supersedes_id`, with a mandatory reason, enforced by a database trigger. Any affordance that makes correction feel like editing will eventually be implemented as editing, and the product's trust proposition is that it is not.

**The UX Designer's position.** The most common real error is a direction mistake — ₹1,000 entered as "You gave" instead of "You got" — discovered a week later with a customer watching. A merchant who must understand reversals to fix a typo will not fix it. The interaction must feel like "change it"; the record must be a reversal.

**What is at stake.** Whether the correction is used. An unused correction path produces a ledger the merchant silently distrusts, which is worse than a mutable one.

**Resolution.** Both, and the corpus already resolves it: `LED-03`'s dialog presents the existing values and lets the user change amount, date, note and direction with a reason field — the vocabulary of editing — while the server performs reversal-plus-replacement atomically. This is confirmed as correct and two additions are required. First, the statement's corrections toggle defaults to **off** for the merchant's own reading and **on** when the statement is shared after a correction, so the customer sees the trail and the merchant sees the clean book. Second, `LED-03`'s copy must never use the words "reversal" or "supersedes" in the user interface; the audit log and `PLT-08` may.

**Reasoning.** The rigour is in the storage and the honesty is in the display; the disagreement was about the verb, not the rows.

**Owner:** UX Designer for the copy and the toggle default; Backend Architect for the invariant.

**Compensation:** the Backend Architect gets an explicit test (`T-LED-03`) asserting that no code path updates an entry's `amount` or `direction`, which already exists as T-IMM-3; the UX Designer gets the correction-rate metric (Part 18 §18.12, "< 2 %; a rising rate indicates a usability defect") instrumented from launch, so that a correction path nobody uses is visible as a *falling* rate against a known error frequency.

---

### CF-05 — The ten-state requirement versus velocity

**Roles in tension:** UX Designer (UX-07) versus Tech Lead (TL-02, TL-03) and Product Engineer (PE-09).

**The UX position.** A feature without its loading, empty, error, disabled and partial states is not finished; it is a happy path with a demo. Canon §0.11 rule 6 already says so, and the three empty-state variants (first-use, filtered, error) are what stop a new tenant seeing "No data" on eleven screens.

**The engineering position.** Twelve states (Part 28 §28.4.5) × 74 features × 2 locales, plus an error message per validation rule and per business error code, is well over a thousand strings, every one of which is a build gate because `check-locales.mjs` fails on a missing key. `LED-01` §8 specifies nine copy keys for a feature that needs about thirty. The states are not the cost; the copy is, and it lands on an engineer at 6 p.m.

**What is at stake.** Whether the Hindi in this product is written by a designer or by a developer under deadline.

**Resolution.** Three parts. (1) One state inventory, not three: Part 28 §28.4.5's list is normative, Part 12 §12.8 and the FRD §9 template are amended to match it, and states genuinely inapplicable to a feature are recorded as "N/A — reason" rather than omitted. (2) The **copy inventory becomes a design deliverable with a schedule**: one sheet per feature listing every label, hint, placeholder, button, empty state, error-by-code, snackbar and `aria-label` in `en` and `hi`, delivered *one module ahead* of engineering. (3) Until a feature's copy sheet exists, its i18n gate runs in warn mode against a `_pending` namespace, and a feature cannot be marked done with any `_pending` key. This unblocks engineering without letting the placeholder ship.

**Reasoning.** The requirement is right and the pipeline was missing. Making copy a scheduled upstream deliverable is cheaper than making it an unscheduled downstream one, and the `_pending` namespace converts a hard block into a visible debt.

**Owner:** UX Designer owns the inventory and its schedule; Tech Lead owns the gate configuration.

**Compensation to engineering:** the `_pending` mechanism and a standing agreement that a missing copy sheet is a design defect raised against design, not a reason to invent a string.

---

### CF-06 — Traceability demands versus everyone's patience

**Roles in tension:** Business Analyst (BA-05, BA-12) versus Tech Lead (TL-02, TL-08) and Product Engineer.

**The BA position.** Part 28 §28.6.3 defines done as every FR, BR and EC having a test. On `LED-01` that is 32 rules against 12 listed test IDs; on `SAL-02`, 60 against 23. The traceability matrix joins test IDs to executed tests and is structurally blind to a business rule with no test ID at all. Either the FRDs grow their test lists or the definition of done is weaker than it claims.

**The engineering position.** Covering every BR and EC with a dedicated test on `SAL-02` means roughly seventy tests for one feature. Across 74 features that is a suite whose runtime already exceeds Part 28 §28.1.3's own budgets (TL-08), and a suite slower than its budget stops being run.

**What is at stake.** Whether the definition of done is honest.

**Resolution.** Tier the requirement by rule class rather than applying it uniformly. **Tier 1 — mandatory dedicated test:** every BR and EC that touches money, stock, a ledger direction, a document number, a permission, a tenant boundary or an immutability guarantee. **Tier 2 — coverage by an existing test, mapping recorded:** rules about defaults, UI behaviour, copy and presentation, discharged by a component or E2E test that carries the ID as a secondary marker. **Tier 3 — explicitly untested, recorded with a reason** in the FRD, permitted only for rules with no observable failure mode. The FRD §21 test lists are amended to name a tier per rule, and the traceability matrix reports Tier 1 gaps as build failures, Tier 2 gaps as warnings, and Tier 3 as an inventory. Part 28 §28.6.3 is amended to this definition.

**Reasoning.** "Every rule has a test" is unachievable and therefore will be quietly abandoned, which costs more than a tiering that is achievable and enforced. Tier 1 is where defects are unrecoverable and is roughly a third of the rules.

**Owner:** Business Analyst defines the tiering per feature; Tech Lead enforces the gate.

**Compensation to the BA:** Tier 1 gaps block the build with no override, and the Tier 3 inventory is reviewed at every phase boundary, so "untested" is a visible, accumulating list rather than a silence.

---

### CF-07 — Local-first deployment versus the white-label partner promise

**Roles in tension:** CTO (CTO-07) versus the white-label architecture (Part 24 §24.1.4 rule 2) and the CEO.

**The one-deployment position.** Part 24's five rules keep the fan-out at zero: no partner code in code, one database, one bundle, resolution not configuration, defaults all the way down. A partner difference is a column or a JSON key, never a build. This is what makes a partner live in hours rather than months and what keeps the upgrade cost constant as partners are added.

**The partner-reality position.** A bank or NBFC with data-residency or network-isolation requirements will ask for its own instance. OQ-05 and OQ-06 both anticipate this and both are due "before first partner contract", i.e. after the architecture is built. A single shared deployment cannot satisfy a partner whose security review requires isolation, and the local-first stack — four containers, one database, no managed services — is precisely what makes a per-partner instance *possible*, which is the commercial argument in Part 11 §11.2.

**What is at stake.** Whether one partner's compliance requirement turns one deployment into N, with N upgrade windows, N backup regimes and N restore drills — and whether that is discovered at contract signature.

**Resolution.** The two are compatible and the corpus should say so. The product remains one codebase, one schema and one image; **deployment topology becomes a commercial variable, not an architectural one.** Three supported topologies are documented in Part 29: *shared* (Metis-operated, all partners, the default), *dedicated* (one partner, one instance, same image and same migrations, operated by Metis), and *self-hosted* (partner-operated from the same compose stack, with a stated support boundary and a version-currency requirement). Part 24 §24.1.4 rule 2 is amended from "the scaling path never addresses partners" to "the scaling path never *shards* partners; deployment multiplicity is an operations decision with a stated cost per instance". That cost — upgrade window, backup, restore drill, monitoring — is published so a partner asking for isolation is quoted for it.

**Reasoning.** Nothing in the architecture prevents multiple instances; what was missing was an operational price and a support boundary, which is why it read as a contradiction.

**Owner:** CTO, with the CEO owning the commercial terms per topology.

**Compensation to the single-deployment position:** dedicated and self-hosted topologies require the same image and the same migration set with no partner-specific code, enforced by the existing CI check that greps for partner code strings; a partner who requires a code fork is declined.

---

### CF-08 — Client-side PDF versus server-generated documents

**Roles in tension:** CTO (CTO-01) and Product Engineer (PE-04) versus ADR-014 and the dependency policy.

**ADR-014's position.** Documents are React print components rendered through the browser with tenant branding; public share links render the same view. No server render, no headless browser, no PDF library. It is simple, it removes a dependency, and the print output is adequate — Part 11 §11.4 is explicit that "Server-side PDF arrives in Phase 2 only because automated sending needs a file, not because the print output is inadequate".

**The reviewers' position.** Count what needs a file: automated reminders carrying a statement (`LED-07`), WhatsApp utility templates with attachments (`NTF-05`, `LED-12`), email (`NTF-06`), scheduled reports (`RPT-14`), the `PLT-10` export bundle, the customer-facing invoice page (`SAL-14`), and any partner emailing under its own domain (`WLB-06`). Phase 2 therefore acquires WeasyPrint as a *second* renderer that must produce a visually identical document to the React component, for four templates, two paper sizes, Devanagari, branding and a QR code. Two renderers for one legally significant document is a permanent correctness liability discovered by the merchant's customer.

**What is at stake.** Whether the invoice a merchant prints and the invoice their customer receives are the same document, forever.

**Resolution.** **One renderer, server-side, from MVP.** The server renders the document HTML (the same template that the public share link already serves), and the browser print path prints *that* HTML rather than a parallel React component tree. PDF generation is added as a settings-gated capability using a single new runtime dependency admitted by ADR, inert at MVP if the team prefers, but the *template* is server-owned from the first commit. `SAL-03`, Part 23 §23.7 deliverable 4 and ADR-014 are amended accordingly.

**Reasoning.** This is the cheapest moment this decision will ever be made. The cost now is one Python dependency and moving four templates from React to server-rendered HTML — which is roughly where they were going anyway, since the public share view is already a server component (Part 19 §19.1.4). The cost in Phase 2 is two template sets maintained in parallel for the life of the product.

**Owner:** CTO.

**Compensation to the dependency policy:** exactly one runtime dependency is admitted, it is server-side only (invisible to the browser bundle and to the frontend's allow-list), and the print path keeps working with the dependency absent because the browser prints the same HTML the server already serves.

---

### CF-09 — No Celery versus the reliability of scheduled reminders

**Roles in tension:** Backend Architect (BE-03, BE-04) and CTO (CTO-03) versus ADR-012 and the local-first constraint.

**ADR-012's position.** A table and a loop replace a broker and a worker fleet. No Redis, no result backend, no cache server; the scheduler is the same image with a different command; `enqueue()` is the seam if Celery is ever needed. For a product whose deployment target is one VPS and whose partner reviewers count dependencies, this is right.

**The reviewers' position.** Three problems, none of which is "we need Celery". First, the collection journey depends on a daily reminder job whose non-execution is undetectable: `scheduled_key` deduplication means a day the job never ran leaves no row, no dead letter and no alert. Second, Part 29's global advisory lock serialises the whole queue behind its slowest job, so a ninety-second export blocks the reminder dispatch — which contradicts Part 20's `SKIP LOCKED` design and makes Part 28's own "drain 1,000 jobs in ≤ 60 s" target unachievable. Third, the periodic jobs fan out inside one handler at O(tenants), which is fine at 500 and not at 5,000.

**What is at stake.** Whether `LED-07` — the feature the collection journey is built on — silently does not run.

**Resolution.** ADR-012 stands. Four amendments make it reliable. (1) **One concurrency model, stated once:** the advisory lock is removed from the tick and retained only around the *periodic-task enqueue* step, which is the only step that must not run twice; job claiming uses `FOR UPDATE SKIP LOCKED` as Part 20 specifies, so a long job blocks nothing. (2) **Positive-confirmation alerting:** an expected-run registry (`job_type` → cron expression → grace period) and an alert when a `scheduled_key` row for today has not reached `succeeded` by its deadline. A job that never ran is now louder than a job that failed. (3) **Per-tenant fan-out as child jobs:** `sales.refresh_overdue`, `inventory.scan_low_stock` and `ledger.schedule_auto_reminders` enqueue one child job per active tenant rather than iterating inside one execution, so one slow tenant cannot starve the rest and the work is resumable. (4) **A replacement trigger**, recorded in the ADR: queue depth exceeding 5,000 sustained, or p95 job latency exceeding five minutes for interactive jobs, or more than two runners required, moves `enqueue()` to a broker.

**Reasoning.** Every criticism was about observability and serialisation, not about the broker. All four amendments are small and none of them adds a dependency.

**Owner:** Backend Architect, with the Tech Lead owning the alert's delivery.

**Compensation to the no-Celery position:** none needed — the decision is preserved. The compensation flows the other way: the reviewers get the alert and the trigger, which is what they were actually asking for.

---

### CF-10 — Free-tier generosity versus the monetisation lesson

**Roles in tension:** CEO (CEO-03, CEO-05), Product Manager (PM-01, PM-02) and the differentiation strategy (Part 11 §11.2) versus the commercial shape (Part 1 §1.9).

**The generosity position.** The category's defining lesson is that capping the ledger destroys the habit the product exists to create, and that ads and interruptions are the most hated pattern in the category. "Staff roles without a desktop licence" is listed as a differentiator competitors cannot copy because opening multi-user is a pricing-model conflict for them. A free tier with parties, entries, statements, reminders and a UPI QR, with no entry caps, is the acquisition engine and the partner channel's volume.

**The monetisation position.** The same corpus puts the paid wall at "multiple devices and users with roles, inventory and GST billing depth, server-sent messaging". If multi-user is free, the wall loses its strongest lever and moves to stock depth plus messaging plus exports, which is narrower and arrives later; the revenue curve moves right. Meanwhile `PLT-15` must ship at MVP enforcing `max_users`, `max_parties` and `max_invoices_per_month` — limits whose values are deferred to Phase 2 entry by OQ-02.

**What is at stake.** The product's entire commercial position, the credibility of one of its eleven differentiators, and whether `PLT-15` is buildable.

**Resolution.** Three decisions, taken together.

1. **Multi-user is free up to a small count and paid above it.** The free tier includes the owner plus **two** additional members, which covers the kirana with a helper and the services practice with a receptionist, and excludes the staffed wholesaler with six. The differentiation claim in Part 11 §11.2 is amended from "staff roles without a desktop licence" to "**staff roles on a phone, free for a small team, without a desktop licence**" — which remains true, remains a pricing-model conflict for the incumbents (whose multi-user is paid from the first extra seat and desktop-bound), and is honest.
2. **The ledger is never capped.** No limit on parties, ledger entries or statements, in any tier, ever. This is elevated from a marketing statement in Part 1 §1.9 to a product rule alongside the Avoid list, because it is the one the category's history is unambiguous about.
3. **`PLT-15` at MVP enforces module entitlements and member count only.** `max_parties` is removed from the enforced set (retained as a nullable column for future use); `max_invoices_per_month` is retained as a plan field and set to unlimited on every MVP plan, with the enforcement code and tests shipped and dormant. This makes `PLT-15` buildable now with values that are known now, and leaves the hook for whatever OQ-02 decides.

**Reasoning.** The free-tier generosity and the paid wall are compatible once the wall is placed at *team size* rather than at *team existence*. The free product remains complete for the persona who will never pay and who is the acquisition engine; the paid product starts exactly where willingness to pay appears in the research.

**Owner:** CEO, this week. This is the resolution with the widest amendment footprint (§42.3 rows 18–23).

**Compensation to the monetisation position:** the free member count is a setting, not a constant, and is reviewed at Phase 2 entry against observed conversion; and the paid wall gains a second lever that costs nothing to defend — server-sent messaging (`LED-07`, `LED-08`, `LED-12`), which carries a real per-message cost and therefore *should* be paid.

---

### CF-11 — Offline: honest refusal versus optimistic write

**Roles in tension:** UX Designer (UX-03) and Frontend Architect versus Part 19 §19.10.3.

**The refusal position (Part 19 §19.10.3).** At MVP there is no write queue. Showing a Save button that cannot save is dishonest, so every write affordance is disabled with an inline hint when the client knows it is offline. Hiding it would read as a permissions problem; disabling it with an explanation does not.

**The optimistic position (`LED-01` FR-12, Part 15 §15.3).** The merchant taps Save, an optimistic row appears labelled "saving…", and a failure turns it amber with Retry while the drawer's contents are preserved and the idempotency key is reused. This is what the journey grounded in field research specifies, and it is the behaviour that keeps a man with a customer waiting from reaching for the notebook.

**What is at stake.** The product's most frequent action, in the network condition the target user actually has.

**Resolution.** Both are right about different states and the specification has only two. A **three-state network model** is adopted: `online`, `uncertain` (requests failing or timing out while the browser reports connectivity), and `offline` (the browser reports no connectivity and the health probe confirms it). In `online` and `uncertain`, write affordances are **enabled** and the optimistic-plus-retry behaviour of `LED-01` FR-12 applies — `uncertain` is the common real case and it is where the optimistic path earns its keep. In confirmed `offline`, writes that the Phase 2 queue will eventually accept (ledger entries, payments, expenses, party create/update, stock adjustments) remain **enabled and queue-intent-labelled** — the row is written optimistically, marked "will save when you have signal", and retried; writes that allocate a number, move stock or change history are **disabled** with the honest hint, exactly as §19.10.3 says. Part 19 §19.10.3 and `LED-01` FR-12 are amended to this single model, and `useDegradedNetwork()` is the one place it lives.

**Reasoning.** The refusal rule was written for the class of writes that genuinely cannot be faked and was applied to all writes. Splitting it by write class satisfies both positions and pre-builds the Phase 2 queue's user interface, which §19.10.4 already wants as a seam.

**Owner:** UX Designer for the states and copy; Frontend Architect for the hook.

**Compensation to the refusal position:** the optimistic-while-offline rows persist across a reload from the start (rebuilt from the same store the Phase 2 queue will use), so the product never shows a saved-looking row that has evaporated — which was the honest concern underneath §19.10.3.

---

### CF-12 — Backdating permissiveness versus cache correctness

**Roles in tension:** Backend Architect (BE-01, BE-02) versus the journeys (Part 15 §15.6) and the Product Manager.

**The permissive position.** A supplier's bill arrives a week after the goods; `SAL-02` FR-14 permits documents dated into the previous financial year; journey 6 explicitly instructs the merchant to "record the bill when it arrives and backdate it". Real businesses are late with paperwork and a product that refuses backdating forces them back to paper.

**The correctness position.** Weighted-average cost is order-dependent. The incremental cache is maintained in arrival order and the specified replay runs in `(movement_date, created_at, id)` order, so the two diverge permanently the first time an inbound movement is backdated behind an existing outbound — and the drift test's fixtures do not include that case, so the suite is green and the invariant is false.

**What is at stake.** Stock valuation, `INV-08`, `RPT-06`, the Phase 2 profit summary, and the credibility of the zero-drift launch gate.

**Resolution.** Backdating stays. The cache is made order-independent by construction: `inventory_stock_movement` gains `sequence_no` allocated per `(item, location)` at write time; the average is maintained in `sequence_no` order; and a movement inserted with a `movement_date` earlier than the item's current maximum enqueues a `stock_cost_recompute` job for that item and location, idempotent on `(item_id, location_id, watermark_date)` so a burst of backdated bills collapses into one recomputation. Voiding a purchase bill enqueues the same job, which resolves BE-02. Part 12 §12.5's stock-drift dataset is amended to require a backdated inbound movement between two outbounds, which is the case that currently fails.

**Reasoning.** The alternatives — forbidding backdated inbounds, or accepting divergence — are respectively a product regression and a silent wrong number. A per-item recompute is affordable because it is bounded by one item's movement history, not a tenant's.

**Owner:** Backend Architect.

**Compensation:** none required; both positions are fully satisfied. The cost is one column, one job type and one fixture.

---

### CF-13 — Two chapters owning the same normative table

**Roles in tension:** Backend Architect (Part 20) versus the deployment and testing chapters (Parts 28, 29), as reported by the Business Analyst (BA-06, BA-07, BA-08, BA-09, BA-10) and the Product Engineer (PE-06).

**Each chapter's position.** An author writing Part 20 needs the job registry, the environment catalogue and the query budgets in front of the reader; so does an author writing Part 29; so does an author writing Part 28. Cross-referencing a table the reader cannot see makes a chapter unusable on its own.

**The reviewers' position.** Every duplicated table has diverged. Two job registries with different names and times, two environment catalogues with different variable *prefixes*, two query budgets, two coverage floors, three numbers for the same performance metric, two positions on whether migrations run at container start, two scheduler concurrency models. An implementer will silently choose ten times.

**What is at stake.** Whether the corpus can be handed to an agent at all.

**Resolution.** A **normative-table ownership index** is added to Part 0 as §0.12: one row per normative table, naming the single owning chapter. Ownership is assigned as follows — job registry and job schedule: **Part 20**; environment-variable catalogue: **Part 29** (it is the operator's document and it wins on the `UB_` prefix question, which Part 20 adopts); query budgets: **Part 20**; coverage floors: **Part 28**; performance budgets: **Part 18** (NFR table), with Parts 19, 20 and 28 citing it; error codes: **Part 22**; permission codenames and statuses: **Part 0**; deployment topology and migration execution: **Part 29**; scheduler concurrency model: **Part 20**. Every other chapter reduces its copy to a cross-reference or an explicitly-marked excerpt with the owning section cited. A CI check over the corpus asserts that no table marked owned appears in duplicate.

**Reasoning.** The readability argument is real and the divergence cost is worse. An excerpt marked "*excerpt from Part 20 §20.8.4 — that table is authoritative*" serves the reader and cannot drift unnoticed, because the check catches it.

**Owner:** Business Analyst, as editorial owner of the corpus.

**Compensation to the chapter authors:** excerpts remain permitted, and the ownership index is a two-page artefact rather than a restructure.

---

### CF-14 — Tight query budgets as design pressure versus achievable gates

**Roles in tension:** Backend Architect (Part 20 §20.14.1) versus Tech Lead (Part 28 §28.3.10).

**The tight position.** `GET /parties` in four queries is achievable with `select_related`, a prefetch and one aggregate, and stating it as four forces the selector to own the joins. A loose budget is not a budget.

**The achievable position.** Seven for a simple list leaves room for the tenant lookup, the permission check, the settings read and the feature-flag resolution that every request performs, none of which appears in the four. A budget that fails on a correct implementation trains the team to raise budgets, and then nobody reads them.

**What is at stake.** Whether the N+1 gate is enforced or routinely overridden.

**Resolution.** Budgets are expressed as **two numbers**: a *target* (Part 20's tight number, reported and trended) and a *ceiling* (Part 28's number, which fails the build). A PR that exceeds the target prints a warning with the query list; a PR that exceeds the ceiling fails. Both live in Part 20 (CF-13 assigns ownership there) with Part 28 citing them. The ceiling may only be lowered, as Part 28 already requires.

**Reasoning.** The two chapters were measuring different things — one an aspiration, one a gate — and calling both a budget.

**Owner:** Backend Architect.

**Compensation:** the target is visible on every PR, so the design pressure the tight number was meant to apply is applied, without failing correct builds.

---

### CF-15 — Testing the client tax engine

**Roles in tension:** Frontend Architect (FE-03) versus Part 28 §28.4.8.

**The don't-test position.** The server is authoritative (canon rule 3); the client's numbers are previews; testing the client's arithmetic duplicates the backend money tests and creates two suites to keep in step.

**The test-it position.** The preview runs on every keystroke in the most scrutinised screen in the product and is what the merchant reads while deciding whether to issue. A divergence means the merchant sees one total and the customer is charged another — which `SAL-02` §1 calls "zero tolerance for total mismatches between print, API and ledger".

**What is at stake.** Whether the preview and the authority can silently disagree.

**Resolution.** Test it, against the **same fixture file** as the backend. Part 28 §28.4.8's row is amended from "not tested" to "tested against the shared fixture set only — no independently authored client cases". The fixture is `tests/fixtures/gst/tax_cases.json` (Part 28's 120-case file wins on content) and the frontend reads it directly; Part 19 §19.2.4's `src/tests/fixtures/taxEngine.cases.json` is deleted and replaced by a path reference. A divergence therefore fails both suites on the same commit, which was Part 19's stated intent.

**Reasoning.** The don't-test rule is correct for arithmetic the client merely *displays* and wrong for arithmetic the client *computes*. The distinction was lost because both are "previews".

**Owner:** Frontend Architect; Tech Lead amends Part 28.

**Compensation to the don't-test position:** no independently authored client test cases are permitted, so there is exactly one place to update when a tax rule changes.

---

### CF-16 — Receivable red versus error red

**Roles in tension:** UX Designer (UX-04, UX-05) versus category parity (Part 11 §11.1, canon §0.2) and the design system as written.

**The parity position.** Red for "You gave" and green for "You got" is stable across every competitor, is what the research documents, and inverting or complicating it "would be read as a bug". The colour is not a design choice; it is vocabulary.

**The collision position.** `--error` currently carries four meanings simultaneously — receivable, overdue, out of stock, and every validation and system error — so in the `LED-01` drawer the colour that means "healthy receivable" and the colour that means "you have made a mistake" are the same colour, six centimetres apart. Additionally, `--success` on white measures 3.9:1 and is used for credit amounts at 13.5 px, which fails WCAG AA and the chapter's own stated exception.

**What is at stake.** Legibility of the two most-read numbers in the product, and NFR-25's zero-critical-violations gate.

**Resolution.** The ledger semantics do not change. Three amendments to Part 23: (1) a **distinct error family** (`--form-error`) introduced for validation and system errors, visually distinguishable from the receivable red, with red *text* reserved for amounts and error states rendered as outlined blocks with an icon per §23.5; (2) `--success` and `--error` re-toned to meet 4.5:1 on `--canvas` and `--surface-card` at 13.5 px, since both are used at that size in `UbTimeline` and `UbDataGrid`; (3) `UbAmount` gains a **sign prefix** in addition to tone and label, so the timeline is readable without colour and without the label that a note displaces.

**Reasoning.** Parity is about the *ledger* colours, not about using the same red for form validation. The contrast failures are documented in Part 23 §23.6 by the design system's own audit and are a release-gate failure as written.

**Owner:** UX Designer, before the design-system sprint begins.

**Compensation to the parity position:** the hue family for receivable and payment is preserved within the tolerance the re-tone requires, and the change is validated against the same research convention rather than against taste.

---

### CF-17 — Exact plan-limit enforcement versus write-path throughput

**Roles in tension:** Backend Architect (BE-06) versus Product Manager and the testing chapter (`PLT-15` BR-7, Part 28 §28.2.7).

**The exact position.** A limit that can be exceeded is not a limit; the concurrency test asserts that two devices creating the 300th party at limit 300 produce exactly one success, achieved by locking the tenant row.

**The throughput position.** L0 puts `platform_tenant` first in the lock order, so locking it for a limit check holds it through sequence allocation, stock locks, ledger write, payment write and audit. Every invoice issue in a tenant then serialises against every other tenant-touching write, with a five-second `lock_timeout` and a `503` on expiry — during a counter rush, which is exactly when it matters.

**What is at stake.** Whether the busiest hour of a merchant's day is the hour the product refuses writes.

**Resolution.** Limits are classified. **Hard limits** (member count, module entitlement) are checked under a lock, because they are checked rarely and an overshoot has a commercial consequence. **Soft limits** (parties, invoices per month) are checked without a tenant lock against a counter maintained per `(tenant, period)`, tolerating a one-over-limit race, with the overshoot corrected at the next check rather than prevented. `PLT-15` BR-7 and Part 28 §28.2.7 are amended to assert "at most one over the limit" for soft limits rather than exact enforcement. Under CF-10 this becomes largely moot at MVP — `max_parties` is removed from enforcement and `max_invoices_per_month` is unlimited — but the rule is fixed now because the enforcement code ships dormant.

**Reasoning.** Exactness on a soft commercial limit is worth less than a write path that does not serialise. The member-count limit, which is the one CF-10 makes real, is a hard limit and keeps its lock.

**Owner:** Backend Architect.

**Compensation to the exact position:** a daily reconciliation job reports tenants over a soft limit, so an overshoot is visible and billable rather than invisible.

---

### CF-18 — The design system built ahead versus promoted on second use

**Roles in tension:** Frontend Architect (FE-06) and Part 19 §19.8.5 versus Part 23 §23.7 and the UX Designer.

**The promote-on-second-use position (§19.8.5, canon §0.11 rule 7).** A wrapper is created only when a pattern recurs in two or more features. Speculative wrappers are how design systems bloat, and a one-off belongs in its feature.

**The build-ahead position (Part 23 §23.7).** The `Ub*` set is a sprint 1–2 deliverable because every feature screen is blocked behind the subset it needs, and a design system assembled feature-by-feature produces thirty inconsistent components and no system.

**What is at stake.** Four to seven engineer-weeks at the front of the plan, and the consistency of every screen.

**Resolution.** Split the set. A **core subset is built ahead**, in sprint one, because every screen needs it and its shape is not in doubt: `UbPageShell`, `UbPageHeader`, `UbCard`, `UbField`, `UbForm`, `UbMoneyInput`, `UbQuantityInput`, `UbDateInput`, `UbPhoneInput`, `UbSearchInput`, `UbCombobox`, `UbAsyncCombobox`, `UbDrawer`, `UbDialog`, `UbConfirmDialog`, `UbReasonDialog`, `UbDataGrid` (with its mobile list), `UbTabs`, `UbStatusBadge`, `UbStatCard`, `UbEmptyState`, `UbSkeleton`, `UbSnackbar`, `UbAmount`, `UbSidebar`, `UbBottomNav`, `UbFab`. The remainder — `UbLineItemsEditor`, `UbTotalsPanel`, `UbPartyHeader`, `UbTimeline`, `UbQrCode`, `UbShareSheet`, `UbFileUpload`, `UbFilterTag`, `UbHelpHint`, `UbStatusBanner`, `UbPercentInput`, `UbDateRangePicker` — is **built inside its first feature and promoted at second use**, per §19.8.5. Part 23 §23.7 is amended to this split and the core subset is added to Part 13's Phase 1 plan as a named workstream with an estimate.

**Reasoning.** The two rules were applied to one undifferentiated list. Components whose shape is determined by the product's conventions can be built ahead safely; components whose shape is determined by one feature's requirements cannot.

**Owner:** Frontend Architect and UX Designer jointly.

**Compensation:** the promoted components inherit the same ten-point checklist and gallery obligation at promotion, so the deferred half does not become a second, lower-quality tier.

---

### CF-19 — Two languages at launch versus the regional market

**Roles in tension:** CEO (CEO-11) and the partner archetypes versus Part 18 A3 and the launch scope.

**The two-language position.** English and Hindi complete, everywhere, from the first commit, is already an expensive and rarely-met commitment; the i18n architecture supports more locales without change; translation, testing and support capacity must be funded before the next language ships (A3). Adding a third language to the MVP adds a third copy inventory to a workstream already identified as a velocity risk (CF-05).

**The regional position.** Two of the eight personas are Gujarati-speaking businesses in Surat and Rajkot. The partner archetypes include FMCG distributors and regional software resellers whose networks are geographically bounded by construction. A distributor partner in Gujarat or Tamil Nadu will make their language a condition of the contract, and "Phase 2 exit" (OQ-08) is not an answer to a contract question.

**What is at stake.** Whether the first partner conversation stalls on a capability we have architected for and not scheduled.

**Resolution.** English and Hindi at launch, unchanged. Two additions. (1) A **published language policy**: the architecture supports additional locales; a new locale is a fixed, quotable package of translation, review, testing and support capacity with a stated lead time and price, addable per partner contract. (2) A **locale-readiness test** in CI that runs the full component suite against a synthetic pseudo-locale with 30 % string expansion and Devanagari-class glyph metrics, so that the claim "adding a locale needs no code change" is continuously true rather than asserted. OQ-08's "which third language" remains open (§42.4 U-07); what closes now is the answer given to a partner who asks.

**Reasoning.** The scope decision is right and the commercial exposure is real; the gap was a price and a lead time, not a language.

**Owner:** CEO for the policy and the price; UX Designer for the pseudo-locale test.

**Compensation to the regional position:** the pseudo-locale test means the first real third language is a translation project rather than a layout project, which is the difference between four weeks and twelve.

---

## 42.3 The amendment list

Every change this review requires to an existing chapter. **Blocking** means the build cannot start — or cannot start on the module named — until the amendment is made. **Non-blocking** means it must be made before the module ships, and may be made in parallel with the build. Sources are the Part 41 finding or the §42.2 conflict that produced the amendment.

### 42.3.1 Blocking amendments

| # | Chapter / section | Change | Why | Source |
|---|---|---|---|---|
| A-01 | Part 0, new §0.12 | Add the normative-table ownership index naming the single owning chapter for the job registry, environment catalogue, query budgets, coverage floors, performance budgets, error codes, permission codenames, statuses, deployment topology and scheduler concurrency model. Add a CI check asserting no owned table is duplicated. | An agent currently faces ten silent choices between contradictory normative tables | CF-13, BA-06…BA-10, PE-06 |
| A-02 | Part 22 §22.1 | Register the missing error codes: `party_archived`, `kind_not_allowed`, `use_document_void`, `entry_already_reversed`, `over_allocated`, `service_busy`, `impersonation_not_consented`, `token_stale`, `invalid_token`, `invalid_credentials`, `low_contrast`, and a distinct code for a concurrent idempotent request in progress (`idempotency_in_progress`). | Part 28 §28.3.6 asserts the emitted set equals the documented set; it fails on day one | BA-03, BE-07 |
| A-03 | Part 21 §21.3 | Absorb CR-BE-1 (`platform_job`), CR-BE-2 (`platform_idempotency_key`), CR-BE-3 (`version` on both document tables), CR-BE-4 (`permissions_version`), CR-BE-5 (`token_epoch`), plus `inventory_stock_movement.sequence_no` from CF-12. | Precedence puts the schema above the architecture chapter; without these, idempotency and optimistic concurrency are unbuildable as specified | BA-04, CF-12 |
| A-04 | Part 0 §0.10; Part 19 §19.2.1, §19.2.5, §19.8.3; Part 23 §23.1, §23.7 | Fix the design-system path to a single value (`src/modules/DigiKhaato/design-system/`) everywhere, including the token directory. | Every feature import in the codebase resolves against it | FE-01 |
| A-05 | Part 19 §19.3.6 | Replace the thirteen-row invalidation table with a typed `INVALIDATION` map in code, consumed by one store-level listener, with a compile-time check that every slice key exists and a test that every mutating thunk has an entry. Define the missing slices (`partyStatement`, `partySearchCache`, `itemSearchCache`, the report slices) or remove them from the map. | The map is the replacement for a query library and is currently 18 % complete with dangling references | FE-02 |
| A-06 | Part 20 §20.6.2; Part 21 §21.3.6; `PUR-04`; `INV-06` | Specify `sequence_no`-ordered average maintenance, the `stock_cost_recompute` job on backdated inbound and on void, and the recompute call in the purchase-void path. | The cache and the specified replay diverge permanently on the first backdated bill; void leaves the average wrong | BE-01, BE-02, CF-12 |
| A-07 | Part 20 §20.8.4; Part 29 §29.3.2 | Merge into one job registry (owned by Part 20) containing every job either chapter names, with one name and one schedule each; add `platform.check_invariants`, `parties.recalc_balances`, `inventory.recalc_stock` as nightly entries. | The nightly drift job that NFR-40, G3 and the launch gate depend on is scheduled nowhere | BA-06, BE-03, CF-09 |
| A-08 | Part 20 §20.8.6; Part 29 §29.3.3 | One scheduler concurrency model: advisory lock around the periodic-enqueue step only; job claiming by `FOR UPDATE SKIP LOCKED`; per-tenant fan-out as child jobs; expected-run registry with a positive-confirmation alert. | A long job currently blocks the reminder dispatch; a job that never runs is undetectable | BE-04, CTO-03, CF-09 |
| A-09 | Part 29 §29.2.4; Part 20 §20.13.2 | One environment catalogue (owned by Part 29), one variable-naming convention (`UB_` prefix adopted from Part 20), one settings-module naming scheme (`config.settings.{local,staging,prod,test}`) applied in Parts 20, 28 and 29. | Two disjoint catalogues each asserting completeness, with a test bound to one of them | BA-07 |
| A-10 | Part 20 §20.13.5; Part 29 §29.5.2 | Remove `migrate` and `seed_reference_data` from the container entrypoint; migrations are an explicit deploy step per Part 29's ordering. | Two chapters specify opposite behaviour; the entrypoint is what will exist | BE-08 |
| A-11 | Part 19 §19.10.3; `LED-01` FR-12; Part 15 §15.3 | Adopt the three-state network model (`online` / `uncertain` / `offline`) with the write-class split; specify `useDegradedNetwork()` as its single implementation. | The product's most frequent action has two contradictory offline behaviours | UX-03, CF-11 |
| A-12 | Part 23 §23.2.2, §23.2.4, §23.6; Part 19 §19.11.6 | Add a locale-aware label tier (no uppercase, no tracking, 12.5 px minimum for `:lang(hi)`); re-tone `--success` and `--error` to 4.5:1 at 13.5 px; introduce `--form-error` distinct from the receivable red; add a sign prefix to `UbAmount`. | The design system's own audit records two AA failures, and the label tier cannot render the product's primary language | UX-01, UX-02, UX-05, CF-16 |
| A-13 | Part 1 §1.11; Part 16 §16.15 | Correct the MVP feature count to the row-by-row figures (74 / 37 / 19 / 1) and close OQ-01. | A signable success criterion states the wrong number | BA-02 |
| A-14 | ADR-014; Part 23 §23.7; `SAL-03`; Part 19 §19.1.4 | Documents are server-rendered HTML from MVP; the browser print path prints that HTML; one PDF runtime dependency admitted by ADR, server-side only. | Two renderers for one legal document is a permanent liability, and this is the cheapest moment to avoid it | CTO-01, PE-04, CF-08 |
| A-15 | ADR-021; Part 18 C2 | Split the dependency policy into a closed runtime allow-list and a disciplined tooling allow-list; admit a coverage plugin, a load tool and Workbox; consolidate to one QR implementation. | Eight to twelve engineer-weeks are being spent on tooling the policy was never meant to cover | CTO-02, PE-02, FE-09, CF-03 |
| A-16 | Part 13 §13.2; Part 18 C10 | Re-derive the Phase 1 estimate to include the design-system core subset, print templates, the in-house tooling, the testing workstream and the copy inventory; state the resulting duration or pre-apply the cut list. | The bottom-up estimate is ~122 engineer-weeks against 110 available | PM-09, PE-02, PE-03, TL-07 |
| A-17 | Part 13 §13.3, §13.6 | Add Phase 2 Variant B (depth-led, partner-independent) as the default when no signed intent exists at entry; add a variant row to the release train. | A quarter of the roadmap is contingent on a signature nobody owns | PM-03, CEO-02, CF-02 |
| A-18 | Part 1 §1.9; Part 11 §11.2; `PLT-15`; Part 18 §18.12 | Record the paid-wall decision: owner plus two members free; ledger never capped in any tier; `PLT-15` at MVP enforces module entitlement and member count only, with `max_parties` removed from enforcement and `max_invoices_per_month` unlimited on all MVP plans. | Two chapters state opposite monetisation models and `PLT-15` must enforce limits that do not exist | PM-01, PM-02, CEO-03, CF-10 |
| A-19 | Part 28 §28.6.3; FRD §21 template | Adopt the three-tier test requirement (mandatory dedicated / covered-and-mapped / explicitly untested with reason); mark a tier per rule in each FRD §21. | "Every rule has a test" is unachievable and will be abandoned silently | BA-05, TL-02, CF-06 |
| A-20 | Part 20 §20.11.2 L4; `SAL-02` BR-16 | Resolve the lock-order inversion on the issue path by amending one of the two documents rather than by parenthetical override; state whether the stock check before number allocation is a locked read or an unlocked pre-check. | As written the two either violate L0 or permit the over-issue the concurrency test forbids | BE-05 |
| A-21 | New `docs/DECISIONS.md` and `docs/CR-LOG.md` | Create both from the first commit, with a named owner and a 24-hour response target, standing in for Parts 39 and the CR register until they exist. | There is currently no place to record a decision or raise a contradiction | BA-01, PE-06, TL-04 |
| A-22 | New Part 32 (skeletal) | Produce the task breakdown to two-to-five-day slices, generated from the FRDs, with FR numbers attached per slice. | Nothing exists between a feature and a commit; the traceability gate has no input | TL-01 |
| A-23 | New Part 35 (skeletal) | Produce the per-feature definition of done, reconciling canon §0.11 rule 6, Part 28 §28.6.3 as amended by A-19, and the review checklists. | Four incompatible versions exist and the authoritative one is missing | TL-02 |

### 42.3.2 Non-blocking amendments

| # | Chapter / section | Change | Why | Source |
|---|---|---|---|---|
| A-24 | Part 18 §18.8.1; Part 19 §19.9.1; Part 28 §28.9.1 | One performance-budget table in Part 18, with metric, device tier, network profile and value; the other chapters cite it. Include the "tap to persisted entry < 400 ms" figure currently only in Part 1. | Three chapters give different numbers for the same measurement | BA-10 |
| A-25 | Part 20 §20.14.1; Part 28 §28.3.10 | Express query budgets as target (warn) and ceiling (fail), both owned by Part 20. | Two budgets, the looser one enforced | BA-08, CF-14 |
| A-26 | Part 12 §12.5; Part 18 NFR-45; Part 28 §28.7; Part 19 §19.14.6 | One coverage-floor table, owned by Part 28, cited elsewhere. | 80 % versus 85 % versus per-layer floors, on a release gate | BA-09 |
| A-27 | Part 28 §28.4.8; Part 19 §19.2.4 | Client tax engine tested against the shared fixture file only; delete the duplicate fixture path. | Opposite instructions to the same engineer | FE-03, BA-17, CF-15 |
| A-28 | Part 28 §28.5.3 | Correct the E2E feature-ID mapping (E26→`PAY-03`, E27/E28→`RPT-02`, E29→`RPT-07`); move E17's `SAL-14` and E34's `WLB-03` coverage claims to Phase 2. | The traceability matrix reports coverage for untested features | BA-12 |
| A-29 | Part 19 §19.13 | Correct the testing-chapter references from Part 30 to Part 28. | A reader following the reference lands on logging | BA-11 |
| A-30 | Part 12 §12.5 | Require the stock-drift dataset to include a backdated inbound movement between two outbounds. | The current fixture cannot detect the defect in A-06 | BE-01, CF-12 |
| A-31 | Part 15 §15.1; `PLT-03` | Remove the mobile-number state heuristic; default the state from the GSTIN when present, otherwise require an explicit selection. | The default is wrong for every user and sets the CGST/SGST split | UX-09, BA-18 |
| A-32 | Part 20 §20.13.2; new `DATABASES['jobs']` alias | A separate connection alias for the scheduler, recompute commands and export builders, with a raised `statement_timeout`. | A 15-second timeout kills the 90-second export the performance suite requires | BE-09 |
| A-33 | Part 20 §20.8.2 | Specify how `platform.delete_tenant` handles its own `ON DELETE RESTRICT` job row. | The tenant-deletion job is blocked by its own row | BE-12 |
| A-34 | Part 19 §19.10.2; Part 27 §27.12 | State the service-worker cache's data-at-rest posture on a shared device; cap the cached API set or require `PLT-11` before caching party data on shared installs. | Party names and balances persist 24 h on the counter tablet the spec knows is shared | UX-10 |
| A-35 | Part 19 §19.14.2; Part 29 §29.8 | Add a Content-Security-Policy to the production reverse-proxy configuration at MVP; add a test that `/media/` is not directly routable. | The XSS threat used to justify the auth design is otherwise unmitigated until Phase 2 | CTO-05, CTO-10 |
| A-36 | Part 28 §28.11.1, §28.11.2 | Move the dependency vulnerability scan into the PR pipeline and add it to the merge conditions; move the AST checks to pre-push. | NFR-37 commits to a per-build scan that runs nightly | CTO-06, TL-09 |
| A-37 | New Part 20 appendix or Part 30 §30.12 | A settings registry module declaring every tenant-settings key with type, default, allowed values, business-type presets and JSON schema. | `PLT-06` is a never-cut feature for a key set nobody has enumerated | PE-08 |
| A-38 | Part 17 (all FRDs) | Specify or reference the eleven outstanding CCR/CR items, starting with the `POST /attachments` endpoint contract (CCR-3), which `LED-01` FR-10 depends on. | Referenced change requests do not exist as documents | PE-07 |
| A-39 | Part 23 §23.7; Part 19 §19.8.5 | Split the `Ub*` set into a build-ahead core subset and a promote-on-second-use remainder. | Two rules applied to one undifferentiated list | FE-06, CF-18 |
| A-40 | Part 30 §30.10; Part 18 §18.11 | Register SMTP as an MVP dependency or replace the alert channel with one that exists by default. | The operator's only detection mechanism prints to a log | CTO-11 |
| A-41 | `RPT-07`; Part 18 A5 | Add an e-invoicing turnover-threshold warning derived from the tenant's own outward supplies. | A foreseeable churn event with no product mechanism | CEO-10, PM's addition |
| A-42 | Part 17 §17.9 `SAL-02`; `RPT-07` | Specify the HSN summary grouping, the document-series "cancelled" definition, the period treatment of credit notes and of documents backdated across a filed period, and the composition-tenant presentation. | A rupee-level launch gate with unspecified rules | PE-05, BA's "filed period" addition |
| A-43 | Part 11 §11.2 | Move "GST that knows its own history" to §11.1 (table stakes); restate "staff roles" per A-18; add the competitive-response analysis referenced in §42.4 U-05. | A differentiator list containing a table stake and a claim amended by A-18 | PM-05 |
| A-44 | Part 20 §20.11.4 | Correct the `round_off` CHECK to `>= -0.50 AND <= 0.49`. | The constraint admits a value the formula cannot produce | BE-14 |
| A-45 | Part 18 P1; `LED-10`; `SAL-02` EC-5 | State the zero-value-document exception where the guarantee is stated. | A documented hole in an unqualified rule | BE-13 |

---

## 42.4 The unresolved list

These are deliberately left open. Each states the evidence that would resolve it, who is waiting for it, and the date by which it must close. They are cross-referenced to the open-questions register (Part 37, and Part 18 §18.15 until Part 37 exists), which is the standing home for questions of this kind; the entries below are the ones this review either raised or re-dated.

| ID | Question | Why it is left open | Evidence that resolves it | Owner | Must close by | Part 18 §18.15 link |
|---|---|---|---|---|---|---|
| **U-01** | What are the paid tier's price points and step boundaries above the free tier fixed by CF-10? | CF-10 fixes the *wall*; the price is a market question that a pilot answers better than a meeting | Pilot merchants' stated willingness to pay at day 45, plus one partner's per-active-merchant quote | CEO + commercial | Phase 2 entry | OQ-02 |
| **U-02** | Which SMS provider, and does DLT registration proceed under Metis Labs or per partner? | Determines `WLB-06`'s design and the template registry's scoping; the registration itself must start now regardless | Two provider quotes with DLT lead times; one partner's position on sender identity | Compliance owner | Before launch — registration **started** before build start | OQ-03 |
| **U-03** | Hosting topology per partner: shared, dedicated or self-hosted (CF-07's three variants)? | The variants are now documented; which one the first partner takes is their decision | First partner's security review output | Operations + partner | Before first partner contract | OQ-05, OQ-06 |
| **U-04** | When does PostgreSQL row-level security become mandatory rather than optional? | The schema is designed for it; adding it early costs a migration, adding it late costs an audit under review | A partner security review requiring it, or tenant count above 2,000, whichever is first | CTO | Phase 2 entry, or on the first partner review | new |
| **U-05** | What is the response to an incumbent shipping an adequate competing capability during Phase 1? | Requires analysis nobody has done; the answer shapes which differentiators are defended | Three modelled scenarios with the differentiators that survive each, plus the earliest observable indicator of each | Product Manager + CEO | Phase 1 mid-point | new |
| **U-06** | Who performs the twenty-minute migration per merchant, and at what cost? | The product half is done; the company half depends on whether the channel is partner-led or direct | A costed field-onboarding model with an agent day rate, or a partner contract that assigns it | CEO | Before pilot | new (relates to A2) |
| **U-07** | Which third language, and at what phase? | CF-19 fixes the policy and the price; the language is a channel decision | A partner contract or a segment concentration naming one | Product | Phase 2 exit | OQ-08 |
| **U-08** | Should `staff` stock-adjustment permission be a per-membership flag at MVP, or deferred to `PLT-12`? | Part 14 §14.9 assumes the flag; the permission model has not committed | `INV-06` design review; pilot observation of who adjusts stock | Product | Before `INV-06` build | OQ-07 |
| **U-09** | Retention rule for `notifications_message_log` rows containing recipient numbers | Interacts with CC-7's deletion cascade and NFR-41; Part 27 §27.9.3 proposes 12 months and it is not ratified | Legal review of DPDP versus delivery-dispute needs | Compliance owner | Before launch | OQ-10 |
| **U-10** | Does `LON` (loans) belong in this product at all? | A module with three features and a release-train slot whose existence is an open question | Two consecutive quarters of demand from merchants who already lend, per Part 11 §11.3 item 7's trigger | Product | Phase 3 planning — **or delete from the roadmap now** | OQ-12 |
| **U-11** | Pilot cohort composition, and is a staffed wholesaler included? | Without one, credit limits, roles and aging are untested against their intended user | The named ten merchants | Product | Before pilot | OQ-11 |
| **U-12** | Is the "move entry to another party" correction preset needed? | Deliberately left to telemetry | Correction-reason frequency in production | Product + UX | Phase 2 | OQ-09 |

Two of these deserve emphasis. **U-02 is unresolved as a choice and urgent as an action**: the provider and the registering entity can be decided later, but the registration itself has a two-to-four-week lead time and gates the feature the research calls the category's most-praised behaviour, so it starts now or the pilot runs without it (PM-08, CEO-08). **U-10 should probably not be open at all**: a module carrying three features, its own tables and a release slot, whose reason for existing is an open question, is a scope commitment made by inertia, and the cheaper decision is to remove it from the roadmap until its trigger is met.

---

## 42.5 The revised risk view

Part 18 §18.14 names five risks and Part 1 §1.10 names five, overlapping. After this review, the picture changes in three ways: two risks are materially reduced by the resolutions above, three are confirmed at their stated level, and four are new or newly-sized.

### 42.5.1 Risks reduced by this review

**Correctness of the ledger.** Already the best-defended area; CF-12's `sequence_no` and recompute job close the one genuine hole (stock cost), and A-07's drift-job registration closes the gap between a guarantee and a schedule. This remains the risk with the highest impact and it now has the lowest residual likelihood of the top five.

**Reliability of scheduled work.** CF-09's four amendments — one concurrency model, positive-confirmation alerting, per-tenant child jobs and a replacement trigger — convert "the reminder may silently not have run" into a detectable, alerting condition. The residual risk is operational (one operator, one alert channel, and A-40's SMTP question) rather than architectural.

### 42.5.2 Risks confirmed

**Adoption stalls at migration.** Unchanged and still first. The product mechanism (`PTY-10`, `IMP-01`, the validation preview with totals before commit) is good; the company mechanism (who spends the twenty minutes, at what cost) is U-06 and remains open.

**Performance on the real device.** Unchanged. A-24 removes the ambiguity about which number we are defending; the defence itself — budgets as release gates on a 2 GB device over a throttled connection — is already specified and is the right defence.

**Scope drift into accounting.** Unchanged and well defended by the Avoid list with triggers.

### 42.5.3 Risks newly surfaced or newly sized by this review

| Risk | Why it is new or larger | Current mitigation | Residual owner |
|---|---|---|---|
| **The plan under-counts by roughly a quarter** | The Product Engineer's bottom-up estimate is ~122 engineer-weeks against 110, before any contradiction is resolved, because Part 13 counts features and not workstreams | A-16 (re-derive the estimate), A-15 (recover 8–12 weeks of tooling), CF-18 (split the design-system set) | Product Manager |
| **Silent divergence at the chapter seams** | Twenty-eight blocking findings, of which ten are two chapters saying different things; an agent will choose silently and the choice will be discovered late | A-01 (ownership index + CI check), A-21 (decision log and CR channel with a 24-hour SLA) | Business Analyst |
| **The monetisation position is undecided and downstream of it are four chapters and one MVP feature** | Not previously registered as a risk because each chapter was internally consistent | A-18 (the CF-10 decision, this week) | CEO |
| **Governance exists only as a forward reference** | Nine normatively cited chapters do not exist, including the decision log, the definition of done and the task breakdown, so the first Class C change will be made informally and set the precedent | A-21, A-22, A-23 | Tech Lead |
| **Two renderers for one legal document** (if A-14 is not taken) | Only visible once the Phase 2 feature list is read against ADR-014 | A-14 (server-render from MVP) | CTO |
| **Support during the pilot has no owner** | Part 18 R9 requires support ownership in writing; the only people in the plan are the five building Phase 2 | None yet — belongs in the operating plan (CEO-01) | CEO |

One risk that Part 18 §18.14 lists is **reduced in likelihood and increased in consequence** by this review: *partner dependency*. CF-02's Variant B removes the schedule exposure, so the likelihood of an idle team falls to near zero. But CEO-05's arithmetic suggests that if the partner channel is what carries conversion, then a partner not signing is not a roadmap problem — it is the commercial thesis failing quietly, with a product that works and a business that does not. That reframing belongs in Part 36's register at a higher consequence rating than "partner dependency" currently carries.

---

## 42.6 The combined verdict

**Is this specification ready to hand to an AI coding agent?**

**Not yet, and it is close.** The distance is measured in about two weeks of editorial and decision work, not in months of respecification.

The reasoning is this. An AI coding agent, unlike a human engineer, does not stop and ask. Given two normative tables that disagree, it picks one; given a forward reference to a chapter that does not exist, it invents the content; given a rule stated in Part 20 and contradicted in Part 29, it implements whichever it read last. Every one of those choices is plausible, silent and discovered weeks later. This corpus has ten such pairs, five schema change requests that were specified in one chapter and never absorbed by the chapter with authority, one design-system path stated four different ways, and an entire governance layer — how a decision is recorded, how a feature is declared done, what this week's tasks are — that exists only as citations to Parts 32, 35 and 39.

Against that: the parts of this corpus that are complete are genuinely exceptional. `LED-01` and `SAL-02` are specifications an implementer can fail against, with worked arithmetic to the paisa. The layering rules on both sides are enforceable and enforced. The invariants are defended four ways. The vocabulary, the journeys and the personas are grounded in research and are used consistently. Nine reviewers looking for problems found 114 of them and not one of them attacked the product's thesis, its scope discipline, its data model or its refusals. That is a rare result and it is why the verdict is "not yet" rather than "no".

### 42.6.1 The blocking checklist

Every item below must be true before the corpus is handed to an agent. Each maps to an amendment in §42.3.1 or a decision in §42.2. Nothing else on the 114-finding list blocks the start.

**Decisions — one week, five people**

- [ ] **The paid wall is decided and recorded** (CF-10 / A-18): owner plus two members free; the ledger is never capped; `PLT-15` at MVP enforces module entitlement and member count only.
- [ ] **Document rendering is decided** (CF-08 / A-14): server-rendered HTML from MVP, or an explicit, costed acceptance of two renderers in Phase 2.
- [ ] **The dependency policy is split** (CF-03 / A-15): runtime closed, tooling opened under ADR discipline, and the recovered weeks returned to the plan.
- [ ] **Phase 2 Variant B is adopted as the default** (CF-02 / A-17), and partner business development has a named owner starting this week (CF-01).
- [ ] **A compliance owner is appointed and DLT registration is started** (U-02, CEO-07). This is on the blocking list because it has a two-to-four-week lead time and because Part 18 §18.16 requires the signature.

**Corpus integrity — one week, one editor**

- [ ] **A-01** Normative-table ownership index in Part 0 §0.12, with the CI check.
- [ ] **A-02** Error-code registry completed in Part 22 §22.1.
- [ ] **A-03** The five CR-BE items, CR-SAL-3 and `sequence_no` absorbed into Part 21.
- [ ] **A-04** One design-system path, in all five places.
- [ ] **A-07, A-08, A-09, A-10** One job registry, one scheduler concurrency model, one environment catalogue, one migration-execution position.
- [ ] **A-13** MVP feature count corrected in Part 1 and Part 16; OQ-01 closed.
- [ ] **A-19** Test-requirement tiering adopted in Part 28 §28.6.3.

**Corrections that change behaviour — with the module they gate**

- [ ] **A-06** Stock-cost ordering, the recompute job and the purchase-void path — *blocks the inventory and purchases modules*.
- [ ] **A-20** Lock order on the issue path resolved in one document — *blocks the sales module*.
- [ ] **A-11** The three-state network model — *blocks the ledger module's drawer and every write affordance*.
- [ ] **A-12** Design-system contrast, label tier, error family and signed amounts — *blocks the design-system sprint, which blocks every screen*.
- [ ] **A-05** The invalidation map as typed code with a completeness test — *blocks the second feature, not the first; must land before the third*.

**Governance — before the first commit**

- [ ] **A-21** `docs/DECISIONS.md` and `docs/CR-LOG.md` exist, with a named owner and a 24-hour response target.
- [ ] **A-22** Part 32, the task breakdown, exists to two-to-five-day slices.
- [ ] **A-23** Part 35, the definition of done, exists and reconciles with A-19.
- [ ] **A-16** Part 13's Phase 1 estimate re-derived, or the cut list pre-applied to the point where the scope fits the capacity.

**Verification that the blocking set is complete**

- [ ] A specification-consistency pass runs clean: every feature ID resolves, every error code is registered, every table and column named in an FRD §15 exists in Part 21, every chapter cross-reference resolves, and no owned normative table appears twice.

### 42.6.2 What happens if the checklist is not completed

Stated plainly, because a checklist with no consequence is a wish. If the corpus is handed over with the decisions open, the agent will make them — in the code, silently, in the first week, and each one will be discovered at the cost of rework that exceeds the cost of deciding now by an order of magnitude. If it is handed over with the duplicate tables intact, roughly ten subsystems will be built against the wrong half of a contradiction. If it is handed over without Parts 32 and 35, the team will have no way to say what it is doing this week and no agreed way to say that anything is finished, which is how a twenty-two-week plan becomes a thirty-week plan without anyone being able to point at the week it slipped.

And if it is handed over with A-06 unresolved, a merchant's stock valuation will be wrong, the nightly drift job will report it, and the launch gate that says "zero stock drift on a 100,000-row dataset" will fail — in the last week before launch, which is the most expensive week in the plan to discover a schema change.

### 42.6.3 The recommendation

Take two weeks. Make the five decisions in §42.6.1's first block, which need five people in a room and an afternoon each. Run one editor at the corpus-integrity block, which is mechanical. Assign the five behavioural corrections to the four architects, who each identified their own. Write Parts 32 and 35, which the task breakdown and the definition of done need anyway before sprint one.

Then hand it over. On the other side of those two weeks this is the most build-ready specification I have seen for a product of this scope, and the twenty-eight blocking findings above are, without exception, the kind that are cheap to fix now and expensive to fix in March.
