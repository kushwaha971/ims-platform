# DigiKhaato — Single Source of Truth

**Version 1.0 · Assembled 2026-09-18 · Metis Labs**

A GST-compliant khata, billing and inventory product for Indian small businesses, and the white-label platform underneath it.

---

## Document control

| Field | Value |
|---|---|
| **Title** | DigiKhaato Single Source of Truth (SSOT) |
| **Version** | 1.0 |
| **Assembled** | 2026-09-18 |
| **Status** | Baselined for build. Parts 0, 16, 21 and 22 are frozen except through the change-request register in Part 43. |
| **Owner** | Metis Labs — product and engineering leadership jointly. Individual chapters carry named authors; no chapter may be changed by someone other than its author without a change request. |
| **Audience** | Executives and investors (Parts 1–2, 13), product managers (Parts 10–18), engineers (Parts 19–33), operators (Parts 29–30), and the AI coding agent that will build from it. |
| **Purpose** | To be the only document anyone needs to build, review, or make a decision about DigiKhaato. Where this document and any other artefact disagree — a Slack message, a Figma file, a ticket, a meeting — this document wins, and the other artefact is the thing that needs updating. |
| **Scale** | 43 chapters, approximately 591,000 words. |

### Revision history

| Version | Date | Change | By |
|---|---|---|---|
| 0.1 | 2026-09-16 | Canon (Part 0) and the research chapters (Parts 3–9) drafted. Terminology, ADRs and identifier schemes fixed so downstream chapters had a stable base. | Product |
| 0.2 | 2026-09-17 | Product chapters (Parts 10–16) and the foundation chapters (Parts 21–23) drafted. Feature catalogue baselined at 131 rows. | Product |
| 0.5 | 2026-09-17 | FRDs (Part 17.1–17.4) drafted in parallel by four authors, each raising change requests against the foundation using its own local numbering. | Product |
| 0.8 | 2026-09-18 | Architecture, standards and operations chapters (Parts 19–20, 24–31) drafted. Part 20 raised five schema deltas against Part 21. | Engineering |
| 0.9 | 2026-09-18 | Delivery chapters (Parts 32–42) drafted. | Engineering |
| **1.0** | **2026-09-18** | **Reconciliation pass.** `platform_job`, `platform_idempotency_key` and four column deltas specified in Part 21. The four colliding change-request registers consolidated into Part 43 under one global `CR-<NNN>` scheme. Part 16's phase totals corrected from 137 to 131 to match its own rows. This index created. | Engineering |

---

## What this document is

It is the **specification**. Every decision that has been made about DigiKhaato is written down here, with the reasoning that produced it. It is deliberately long, because the alternative to writing a decision down is making it again — differently — six weeks later in a code review.

It is **normative**. Parts 0, 16, 21 and 22 are contracts: the canon defines terms, identifiers and architecture decisions; the feature catalogue defines scope and phase; the database and API specifications define the shapes everything else is built against. The functional requirement documents (Part 17) are binding on behaviour: an acceptance criterion in an FRD is a test that must pass.

It is **self-contained**. There is no companion wiki, no "see the design doc", no tribal knowledge assumed. A competent engineer who has never met the team should be able to build DigiKhaato from these files alone. That is the acceptance test for the document itself.

It is **traceable**. Every feature has an ID, every requirement has an ID, every decision has an ID, every open question has an ID, and every change to a foundation document has an ID. Nothing arrives anonymously.

## What this document is not

It is **not a plan of record for dates**. Part 32's sprint plan and Part 13's roadmap express sequence and dependency, not commitment. Slippage is a project-management fact, not a specification defect.

It is **not the code**. Where a chapter shows Python or TypeScript, the code is illustrative of a pattern — the contract is the prose around it. Where the built system and this document disagree, one of them is wrong and it is usually worth finding out which before changing either.

It is **not a marketing document**. Parts 1 and 2 state the commercial case in the language executives need, but the whole document is written for people who have to act on it.

It is **not finished by being written**. A specification that is not maintained becomes a liability faster than no specification at all. Part 43 §43.6 states the one rule that keeps it honest: a change request that is not in the register does not exist.

---

## Reading guide

Nobody reads 591,000 words. Four routes through the document, by what you are here to do.

### If you are an executive or an investor — about 12,000 words, roughly an hour

1. **Part 1 — Executive Summary.** The case, the market, the bet, the risks, and what success looks like.
2. **Part 2 — Product Vision.** What the product is for, and what it deliberately refuses to be.
3. **Part 13 — Product Roadmap.** Sequence and phase, with the reasoning for the order.
4. **Part 36 — Risks and Mitigations.** The honest list, including the ones without good answers.

Then stop. If you want one more, read **Part 9 (Khatabook and the Indian Ledger-App Category)** — it is the clearest statement of why this product can exist alongside the incumbent, and it is the chapter most likely to change your mind about something.

### If you are a product manager — about 55,000 words, two or three sittings

1. **Part 0 — Canon.** Non-negotiable. Every term in this document means something specific and the canon is where it is defined. Read it first, once, properly, and refer back constantly.
2. **Part 10 — How to Read the Product Requirements.** The navigation instructions for Parts 11–18.
3. **Part 14 — User Personas** and **Part 15 — User Journeys.** Who this is for and what a day with it looks like.
4. **Part 11 — Product Scope** and **Part 12 — MVP Scope.** What is in, what is out, and the difference between the two.
5. **Part 16 — Feature Catalogue.** The index of everything the product does or will do — 131 features with stable IDs and phase markers. The phase column is binding.
6. **Part 17 — FRDs.** Not end to end. Read **17-00** (the template) to learn the structure, then read the FRD section for whatever you are working on. Each section is self-contained by design.
7. **Part 18 — Consolidated PRD** when you need one document to hand to someone outside the team.
8. **Part 43 — Change-Request Register** before you promise anyone that something is specified. Five contradictions are still open and three of them affect product behaviour.

Skip the research chapters (3–9) unless you are questioning a product decision — then read the one that supports it, because the reasoning is there and it is usually better than the summary.

### If you are an engineer — about 150,000 words, but not in one pass

**Before you write anything:**

1. **Part 0 — Canon.** Especially §0.2 (ledger direction — get this wrong and every balance in the product is backwards), §0.4 (the ADRs), §0.5 (identifier schemes), §0.7 (document statuses), §0.8 (the route map), §0.9 (permission codenames) and §0.10 (naming conventions).
2. **Part 21 — Database Architecture** and **Part 22 — API Standards and Specification.** The two contracts you build against.
3. **Part 43 — Change-Request Register §43.5.** 118 change requests, with the ones that must be applied to Parts 21 and 22 *before* the first migration listed in order. Reading Part 21 without Part 43 will give you a schema that needs a second migration.

**Then, by what you are building:**

- *Frontend:* Part 19 (architecture) → Part 23 (design system) → Part 25 (coding standards) → Part 24 (white-label, because theming is not an afterthought you can retrofit).
- *Backend:* Part 20 (architecture) → Part 26 (coding standards) → Part 27 (security standards). Part 20 §20.8 and Part 21 §21.3.1 together are the background-job story; read both.
- *Either:* Part 28 (testing strategy) before you write your first test, not after.
- *Operations:* Part 29 (DevOps) → Part 30 (observability).

**Then the FRD section for your feature**, and only that section. The FRDs are enormous because they are complete; they are not meant to be read linearly.

### If you are the AI coding agent

Read in this order and do not skip:

1. **Part 0 — Canon**, in full. It is short and every other instruction depends on it.
2. **Part 43 — Change-Request Register**, in full, before Parts 21 and 22 — so that when you read them you already know which parts are superseded, which are pending, and which five questions have no answer yet. **Do not implement a change whose status is Deferred.** Ask.
3. **Part 21** and **Part 22**, with Part 43's §43.5.2 and §43.5.3 applied mentally as you read.
4. **Part 26** (backend) or **Part 25** (frontend) coding standards, and **Part 28** testing strategy. These govern *how* you write, and they are prescriptive on purpose.
5. **Part 20** or **Part 19** architecture for the layering rules — in particular Part 20 §20.1.4 and §20.1.5, which are enforced by architecture tests and will fail your build if you import across a forbidden seam.
6. **The single FRD section** for the feature you are implementing. Its acceptance criteria (`AC-`) are your definition of done; its business rules (`BR-`) are invariants, not suggestions; its edge cases (`EC-`) are test cases.

Two standing instructions. **When two documents disagree, stop and apply §"Conflict precedence" below — do not pick the one you read most recently.** And **when a specification is silent, say so rather than inventing** — the specification being silent is a finding worth reporting, and an invented behaviour is a defect that will be discovered in production.

---

## Conflict precedence

Chapters were written in parallel and they do not agree everywhere. When two documents disagree, resolve in this order — higher wins:

1. **Part 0, the canon, is normative above everything.** Where any chapter contradicts the canon, the canon wins and the chapter is defective. This holds even when the chapter is more recent and more detailed. The canon is short precisely so that it can be held in one head and defended.
2. **Part 43, the change-request register, governs the foundation.** Where a functional requirement document (Part 17) contradicts Part 21 or Part 22, do not assume the FRD is wrong: check Part 43. Most such contradictions are change requests that Part 21 or 22 has not absorbed yet, and Part 43 says which. An **Absorbed** entry means the foundation document is already correct. An **Accepted** entry means the FRD is right and the foundation has not caught up. A **Deferred** entry means nobody has decided and you must not guess.
3. **Parts 21 and 22 are normative for shape.** Column names, types, constraints, endpoint paths, payload envelopes, status codes and error codes come from here, as amended by Part 43. An FRD that names a column differently is using a working name.
4. **Part 17, the FRDs, are normative for behaviour.** What the system does, when, under which business rule, and what the user sees. Where an FRD and an architecture chapter differ on behaviour, the FRD wins; where they differ on structure, the architecture chapter wins.
5. **Part 16 is normative for scope and phase.** If a feature is marked Phase 2 in the catalogue, it is Phase 2 no matter how tempting it is while you are already in that file.
6. **The standards chapters (25, 26, 27, 28) are normative for craft**, and they outrank an example in an architecture chapter. Illustrative code in Part 19 or 20 that violates Part 25 or 26 is an error in the illustration.
7. **Everything else is explanatory.** The research chapters (3–9), the personas and journeys (14, 15), the risk register (36) and the analyses (41) inform decisions; they do not override them.

Two special cases. **Part 20 §20.8.2 and Part 21 §21.3.1** both describe `platform_job`: Part 21 is authoritative for columns, indexes and cascade behaviour, Part 20 for the runner's behaviour, and the two must be changed together. **Part 37's open-questions register** holds questions that have no answer yet; an `OQ-` entry is not a decision and must not be read as one.

---

## Identifier schemes

Every ID in the document follows one of these. The canon (Part 0 §0.5) is the definitive statement; this is the summary.

| Prefix | Form | Means | Allocated in | Example |
|---|---|---|---|---|
| `<MODULE>-<NN>` | Three-letter module code, two digits | A **feature**. The module codes are PLT, WLB, PTY, LED, INV, SAL, PUR, PAY, EXP, RPT, NTF, IMP, HLP, LON. | Part 16 | `SAL-02` |
| `US-` | `US-<n>` within an FRD section | A **user story** — "as a …, I want …, so that …". | Part 17 | `US-3` |
| `FR-` | `FR-<n>` within an FRD section | A **functional requirement**: something the system shall do. Numbered per feature, not globally. | Part 17 | `FR-6` |
| `BR-` | `BR-<n>` within an FRD section | A **business rule**: an invariant the system must never violate, as opposed to an action it performs. | Part 17 | `BR-16` |
| `EC-` | `EC-<n>` within an FRD section | An **edge case** with its required handling. Each is a test. | Part 17 | `EC-6` |
| `T-` | `T-<MODULE>-<NN>-<n>` | A **test case** traced to a feature. | Part 17, Part 28 | `T-PTY-08-14` |
| `AC-` | `AC-<n>` within an FRD section | An **acceptance criterion** — the definition of done for a feature. | Part 17 | `AC-4` |
| `ADR-` | `ADR-<nnn>` | An **architecture decision record**: a choice that is expensive to reverse, with its context and consequences. Changing an ADR requires a new ADR. | Part 0 §0.4 | `ADR-012` (no Celery, no Redis) |
| `PD-` | `PD-<nnn>` | A **product decision**: a scope or behaviour choice made at product level, recorded so it is not relitigated. | Part 0, Part 11 | `PD-014` |
| `RSK-` | `RSK-<nn>` | A **risk**, with likelihood, impact, mitigation and owner. | Part 36 | `RSK-07` |
| `OQ-` | `OQ-<nn>` | An **open question**: something not yet decided, with who must decide it and by when. An `OQ-` is never an answer. | Part 37 | `OQ-01` |
| `CR-` | `CR-<NNN>`, three digits | A **change request** against a foundation document. One global namespace, allocated once, never reused. Supersedes the per-chapter `CCR-`, `CR-SAL-`, `CR-RPT-`, `CR-HLP-` and `CR-BE-` schemes, which Part 43 §43.3 maps. | Part 43 | `CR-001` |

Two conventions worth stating because they cause the most confusion. **Local IDs are local:** `FR-6` means nothing without the FRD section it belongs to, so cite it as `SAL-02 FR-6`. **Global IDs are global:** `ADR-012`, `RSK-07` and `CR-001` mean the same thing everywhere in the document, which is why those three schemes have single allocators.

## Glossary

There is no separate glossary file, deliberately. **Part 0 §0.1–§0.3 is the glossary**, and it lives in the canon because a term and the decision that shaped it belong together. It defines the business vocabulary (khata, udhaar, party, hisaab, kachha bill), the ledger direction convention (§0.2 — which of debit and credit means the merchant is owed money), the module codes (§0.3), the document statuses (§0.7) and the naming conventions for tables, endpoints and permission codenames (§0.10). If a term in any chapter is unfamiliar, it is defined there; if it is not defined there and is not ordinary English, that is a defect — report it.

---

## The chapter list

Word counts computed with `wc -w` on 2026-09-18. They are here so you can budget your reading, and so that a chapter that unexpectedly doubles in size gets noticed.

### Foundation

| # | Title | What it is | Words |
|---|---|---|---|
| **0** | Canon: Definitions, Decisions and Identifiers | The vocabulary, the architecture decision records, the identifier schemes, the route map, the permission codenames and the naming conventions — normative above every other chapter. | 3,276 |

### Part A — The case (Parts 1–2)

| # | Title | What it is | Words |
|---|---|---|---|
| **1** | Executive Summary | The commercial case, the market opportunity, the bet being made, the principal risks and the definition of success. | 4,159 |
| **2** | Product Vision | What DigiKhaato is for, who it serves, and the things it deliberately refuses to become. | 4,306 |

### Part B — Research (Parts 3–9)

| # | Title | What it is | Words |
|---|---|---|---|
| **3** | Market Research Synthesis | The Indian small-business software market: size, segments, digitisation pressure and what actually drives adoption. | 7,017 |
| **4** | Competitor Research Synthesis | The competitive field — Vyapar, Khatabook, Zoho, Tally and the long tail — and where the gaps are. | 5,753 |
| **5** | Zoho Inventory: Decision-Oriented Analysis | A feature-by-feature reading of a mature inventory product, used to decide what to copy, what to simplify and what to omit. | 5,315 |
| **6** | Knowledge-Base Analysis and Help Content Plan | What Zoho's help centre reveals about where users get stuck, and the content model DigiKhaato's help system inherits from it. | 2,978 |
| **7** | Zoho's Product Evolution as a Sequencing Lesson | Ten years of release notes read as a warning about scope gravity and the order in which capability should arrive. | 3,215 |
| **8** | Review Mining: What Real Users Say | Verbatim evidence from public review sites about what small businesses praise, tolerate and abandon software over. | 3,551 |
| **9** | Khatabook and the Indian Ledger-App Category | The incumbent's model, its monetisation problem, and the specific room it leaves for a product that does billing and stock too. | 4,412 |

### Part C — Product requirements (Parts 10–18)

| # | Title | What it is | Words |
|---|---|---|---|
| **10** | How to Read the Product Requirements | Navigation instructions for Parts 11–18 and the relationship between scope, catalogue and FRD. | 2,670 |
| **11** | Product Scope | The full product boundary across all phases — what is in, what is adjacent, what is explicitly excluded. | 5,608 |
| **12** | MVP Scope | The first releasable product, and the reasoning for every line drawn between MVP and Phase 2. | 6,037 |
| **13** | Product Roadmap | Phase sequencing with dependencies and the rationale for the order, not a date commitment. | 4,438 |
| **14** | User Personas | The five people the product is built for, with their constraints, their devices and their tolerance for complexity. | 5,705 |
| **15** | User Journeys | End-to-end narratives of real days — onboarding, a busy counter, a collection round, a month end — that the feature set must support. | 7,869 |
| **16** | Feature Catalogue | The index of everything the product does or will do: 131 features with stable IDs, module, phase, personas and a one-line definition. Phase totals corrected 2026-09-18 (CR-118). | 3,589 |
| **17-00** | FRD Template | The structure every FRD section follows, and what each numbered subsection must contain. | 983 |
| **17-01** | FRD: Platform, White-label and Parties | Auth, tenancy, membership, settings, branding, the partner console, and everything about parties — 32 change requests raised. | 86,224 |
| **17-02** | FRD: Ledger, Payments, Expenses, Notifications | The khata itself, reminders, payments and allocation, expenses and the cashbook, and every messaging channel — 46 change requests raised. | 91,533 |
| **17-03** | FRD: Inventory, Purchases, Import/Export | Items, stock movements and valuation, purchase bills and returns, landed cost, and the CSV import framework — 21 change requests raised. | 57,712 |
| **17-04** | FRD: Sales, Reports, Help | Estimates and invoices, credit notes, the full report set including GST, and the in-app help system — 20 change requests raised. | 74,514 |
| **18** | Consolidated Product Requirements Document | The single PRD assembled from Parts 10–17 for readers who need one document rather than nine. | 8,341 |

### Part D — Architecture and standards (Parts 19–31)

| # | Title | What it is | Words |
|---|---|---|---|
| **19** | Frontend Architecture | Next.js app structure, state management, the service/thunk/slice pattern, routing, offline behaviour and the print subsystem. | 21,619 |
| **20** | Backend Architecture | The modular Django monolith: thirteen apps, the view/serializer/service/selector layering, tenancy, auth, idempotency, files, and the broker-free job runner. | 24,735 |
| **21** | Database Architecture | The schema: principles, entity relationships, every table's columns and constraints, index strategy, cascade behaviour, audit requirements and migration policy. Normative for shape. | 6,139 |
| **22** | API Standards and Specification | The envelope, pagination, idempotency, concurrency, error codes, auth, and the endpoint catalogue. Normative for contract. | 2,420 |
| **23** | Design System | Tokens, typography, colour, spacing and the component inventory, tuned for a dense business UI that must also work on a ₹7,000 phone. | 3,135 |
| **24** | White-Label Architecture | How one codebase serves many partner brands: token resolution, hostname handling, entitlements and the boundaries of what a partner may change. | 12,183 |
| **25** | Frontend Coding Standards | Prescriptive rules for TypeScript, components, state, forms, accessibility and performance. | 10,895 |
| **26** | Backend Coding Standards | Prescriptive rules for Python, Django, services, selectors, transactions, money handling and error raising. | 7,681 |
| **27** | Security Standards | Threat model, authentication and session handling, tenancy isolation, input handling, secrets, DPDP obligations and the audit trail. | 8,101 |
| **28** | Testing Strategy | What is tested at which level, the architecture tests, the tenancy-isolation fixture, performance fixtures and CI gates. | 11,577 |
| **29** | DevOps and Deployment | Docker compose topology, the four services, environments, migrations in production, backup and restore, and the operational runbook. | 11,207 |
| **30** | Observability | Structured logging, the SQL that substitutes for a metrics stack at MVP, the operator dashboards and the alerting that exists. | 5,082 |
| **31** | Analytics and Event Tracking | The event taxonomy, naming convention, what is and is not collected, and the questions the events are there to answer. | 10,590 |

### Part E — Delivery (Parts 32–42)

| # | Title | What it is | Words |
|---|---|---|---|
| **32** | Sprint Plan | Work broken into sprints with dependencies and sequencing. Order is binding; dates are not. | 17,686 |
| **33** | Engineering Task Breakdown | Sprint work decomposed to task level with estimates and owners. | 35,168 |
| **34** | AI Coding-Agent Instructions | The operating manual for the agent that builds this: execution protocol, escalation rules, worked end-to-end examples, and the one-page operating card. | 10,343 |
| **35** | Definition of Done | Verifiable done-checklists at task, feature, sprint, phase and launch level. Every item is a command that passes or a number that clears a threshold. | 4,412 |
| **36** | Risks and Mitigations | The `RSK-` register: likelihood, impact, mitigation and owner, including the risks with no good answer. | 15,873 |
| **37** | Open Questions | The `OQ-` register: everything not yet decided, who must decide it and by when. Part 43 adds five entries. | 8,776 |
| **38** | Architecture Decision Records | ADR-001…040 in full: context, options considered at their strongest, decision, consequences, and the reversal cost and trigger for each. | 19,371 |
| **39** | Product Decision Log | The `PD-` register: twenty product decisions with the evidence relied on and what would reverse each. | 8,949 |
| **40** | Future Roadmap | Beyond Phase 3 — what the product becomes if the thesis holds, each item with its trigger condition and the preparation already made. | 5,294 |
| **41** | Multi-Role Analysis | The specification read back from each role's point of view, as a completeness check. | 27,686 |
| **42** | Cross-Role Review and Conflict Resolution | Nineteen registered conflicts between roles, each resolved with reasoning and compensation; forty-five amendments, twenty-three of them blocking; the readiness verdict. | 12,972 |
| **43** | Change-Request Register | 118 change requests against the foundation documents under one global `CR-<NNN>` scheme, with the mapping from four colliding local schemes, five flagged contradictions and the ordered application plan. | 10,254 |

All forty-eight chapters listed above exist as of 2026-09-19. Parts 34–35, 38–40 and 42 were still being written when this index was first assembled and have since landed; their rows and word counts are current. The chapter list above is the authoritative statement of what the corpus contains.

**Total: 48 documents, approximately 713,000 words.** Before treating this baseline as build-ready, read Part 42 §42.6.1 — the cross-role review registers twenty-three blocking amendments and returns a verdict of *not yet ready*, with the conditions named.

---

## If you read only one page

The product is a khata app that also does GST billing and stock, for a merchant with a cheap phone, patchy data and no accountant. The ledger is append-only and every balance is recomputable from it. There is one Postgres database, one Django process, one Next.js app and no message broker. Money is `numeric`, never float. Every business row carries a tenant id and nothing crosses that line. The canon in Part 0 outranks everything, Part 43 governs the foundation documents, and when a specification is silent the correct response is to say so.
