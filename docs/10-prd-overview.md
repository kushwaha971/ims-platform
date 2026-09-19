# Part 10 — How to Read the Product Requirements

This part is the map to the product half of the specification. It does not contain requirements of its own; it explains where requirements live, how they are identified, how one traces from a business objective down to a passing test, and what an engineer must do when a requirement has to change after the build has started. Anyone — human or coding agent — who reads Parts 11 to 18 without reading this part first will misread the phase markers, invent identifiers that collide with real ones, and make changes that break traceability.

## 10.1 The five product artefacts and what each one owns

The product requirements are deliberately split across five documents, each with a single responsibility. Nothing is specified in two places; where a fact must appear twice it appears once as the definition and once as a cross-reference.

| Artefact | Part | Owns | Does **not** own |
|---|---|---|---|
| Canon | Part 0 | Vocabulary, module map, technology decisions (ADRs), canonical entities, statuses, API paths, permission codenames, the seven non-negotiable engineering rules | Feature behaviour, UI, schema detail |
| Feature Catalogue | Part 16 | The complete, stable list of features: ID, module, phase, personas, one-line definition | How a feature works |
| FRD | Part 17 (17-01 … 17-04) | Implementation-depth behaviour for every MVP and Phase 2 feature, in the 24-section template of Part 17.0 | Table DDL, endpoint envelopes, tokens |
| Database Architecture | Part 21 | Tables, columns, types, constraints, indexes, cascade and audit policy | Which feature writes which row |
| API Specification | Part 22 | Conventions, envelopes, error objects, endpoint shapes, pagination, idempotency | Business rules behind an endpoint |

Parts 10 to 15 and Part 18 — the scope, MVP, roadmap, personas, journeys and the formal PRD — sit above the FRD. They answer *why this and not that*, *for whom*, *in what order* and *what "done" means commercially*. The FRD answers *exactly what to build*. When the two disagree, Part 18's functional-scope table is the contract with the stakeholder and the FRD is the contract with the engineer; a disagreement between them is a defect that must be resolved by a change-control request (§10.7), never by an engineer choosing the version they prefer.

The precedence order for resolving any conflict is fixed and is the same order the canon states for itself:

1. **Part 0 (canon)** — identifiers, statuses, paths, permissions, engineering rules. Always wins.
2. **Part 21 and Part 22** — schema and API contracts, because code and migrations depend on them.
3. **Part 17 (FRD)** — feature behaviour.
4. **Part 18 (consolidated PRD)** — scope and non-functional commitments.
5. **Parts 10 to 15** — rationale, ordering and narrative.

A lower-numbered source overriding a higher one is a bug report against the lower-numbered source, not licence to improvise.

## 10.2 The feature identifier scheme

Every feature carries a stable identifier of the form `<MODULE>-<NN>`, defined in canon §0.5. The fourteen module prefixes are `PLT` platform, `WLB` white-label, `PTY` parties, `LED` ledger, `INV` inventory, `SAL` sales, `PUR` purchases, `PAY` payments, `EXP` expenses, `RPT` reports, `NTF` notifications, `IMP` import/export, `HLP` help and `LON` loans. The number is a two-digit sequence within the module, allocated in the order the feature was catalogued, not in the order it will be built: `LED-01` (record "You gave" / "You got") is the first ledger feature catalogued and also the first built, but `PLT-14` (super-admin console) is an MVP feature sitting after four Phase 2 and Phase 3 features in the same module.

Three rules govern identifiers, and all three exist because the identifier is the join key for the entire specification:

- **IDs never change.** A feature that is renamed keeps its ID. A feature that is split keeps its ID for the larger half and takes a new number for the remainder.
- **IDs are never reused.** A withdrawn feature is marked "withdrawn" in Part 16 with the date and the reason; its number is retired.
- **IDs are never invented in prose.** If a chapter needs to refer to behaviour that has no catalogue entry, that is a missing catalogue row, and the fix is to add the row — not to write `LED-16` in a paragraph and hope someone notices.

Sub-identifiers exist only where the FRD explicitly defines them, and they are always derived from the feature ID (`US-LED-01-3`, `T-SAL-02-14`). There is no such thing as `LED-01a`.

## 10.3 Phase notation

Phase is a property of the feature, recorded once in Part 16 and repeated nowhere else as a fact. The four values are:

| Marker | Meaning | Specified to what depth |
|---|---|---|
| **M** | MVP — in the first shippable product | Full 24-section FRD |
| **M\*** | MVP, configuration-gated — code ships, behaviour is inert until a provider or setting is configured (only `LED-07` and `LED-08`) | Full 24-section FRD |
| **2** | Phase 2 | Full 24-section FRD |
| **3** | Phase 3 | Catalogue level only; elaborated when the phase is entered |
| **F** | Future / Enterprise | Catalogue level only; must not influence MVP architecture beyond the extension points in Part 21 §21.9 |

The `M*` marker deserves emphasis because it is easy to build wrong. A config-gated MVP feature is **not** a deferred feature. `LED-08` (transaction SMS to the party) ships with its adapter interface, its template registry entry, its message-log rows, its per-party opt-in flag, its tests and its Hindi copy. What it does not ship with is a DLT-registered provider, so with the `ConsoleSmsBackend` of ADR-015 the message is logged with status `skipped` and the product behaves correctly. Cutting the code because "SMS is not live at launch" would leave the ledger without the trust primitive that Part 11 identifies as table stakes, and would require the feature to be rebuilt rather than configured on the day a provider contract is signed.

Phase 3 and Future features appear throughout Parts 11 to 15 as destinations, not as commitments. When one of them is referenced — `SAL-12` (e-invoice/IRN), `INV-16` (batches and expiry), `LON-01` (borrowers and loans) — the reference exists so an engineer knows which extension point must stay open, not so that any of it gets built early.

## 10.4 Requirement identifier prefixes

Inside an FRD feature specification, six identifier families carry the requirement itself. They are the vocabulary of traceability and they are used identically in all four FRD files.

| Prefix | Form | Section of the template | What it is | Example |
|---|---|---|---|---|
| `US-` | `US-<FEATURE>-<n>` | §3 User Stories | A user story in "As a … I want … so that …" form, one persona, one outcome | `US-LED-01-5` — as an owner I want to be warned when a new credit pushes a party over their credit limit |
| `FR-` | `FR-<n>` (scoped to the feature) | §4 Functional Requirements | A testable statement of what the system does | `FR-6` of `LED-01` — credit-limit enforcement per `ledger.credit_limit_mode ∈ {off, warn, block}` |
| `BR-` | `BR-<n>` (scoped to the feature) | §11 Business Rules | An invariant, a calculation with its formula and rounding, or a constraint that holds regardless of interface | `BR-2` of `LED-01` — the balance recompute formula |
| `EC-` | `EC-<n>` (scoped to the feature) | §13 Edge Cases | A named situation and its expected behaviour | `EC-8` of `LED-01` — tenant timezone differs from device clock |
| `T-` | `T-<FEATURE>-<n>` | §21 Testing | One test, tagged with its kind (unit, API, component, E2E, permission, perf) | `T-LED-01-5` — idempotent replay returns identical body |
| `AC-` | `AC-<n>` (scoped to the feature) | §22 Acceptance Criteria | A Given/When/Then statement mapped to exactly one user story | `AC-5` of `LED-01`, mapped to `US-LED-01-5` |

`FR-`, `BR-`, `EC-` and `AC-` numbers are scoped to their feature and restart at 1 in each specification; `US-` and `T-` carry the feature ID inside them because they are referenced across features and from the task breakdown. Two further families appear in the FRDs and are defined here for completeness: **`CCR-<n>`**, a canon change request raised by an FRD file and collected at the end of that file (§10.7), and **`ADR-<nnn>`**, an architecture decision record listed in canon §0.4 and written out in Part 38.

Error codes are not requirement identifiers but behave like them: a code such as `credit_limit_exceeded` or `party_archived` is a stable string that appears in the FRD, in the API specification and in the i18n key `errors.<code>`. New codes are registered through a CCR exactly as new columns are.

## 10.5 The traceability chain

The chain runs in one direction and every link is checkable by a script, not by judgement:

**Business objective → user story → functional requirement → business rule → acceptance criterion → test ID → analytics event.**

Read forwards, it says: the feature exists to achieve a measurable objective (§1 of the template, always with a number in it); that objective is decomposed into user stories for named personas from Part 14; each story is realised by one or more functional requirements; the requirements are constrained by business rules that hold even when the UI changes; each story has at least one acceptance criterion written as Given/When/Then; each acceptance criterion is covered by at least one test; and the objective's number is observable in production through the analytics events of §18.

Read backwards, it is an audit: a test that maps to no acceptance criterion is a test of an invented requirement; an acceptance criterion that maps to no user story is scope creep; a user story with no measurable objective behind it is a feature nobody can justify keeping.

Worked example, taken end to end from `LED-01`:

| Link | Content |
|---|---|
| Business objective | Median time from party page open to entry saved ≤ 8 s; ≥ 95 % of entries saved without a validation error; zero balance drift in the nightly `recalc_balances` |
| User story | `US-LED-01-5` — as an owner I want to be warned or blocked when a new credit pushes a party over their credit limit so that exposure stays controlled |
| Functional requirement | `FR-6` — enforcement per `platform_tenant_setting.ledger.credit_limit_mode ∈ {off, warn, block}`, applied to `debit` entries only |
| Business rule | `BR-6` — with `L = credit_limit`, `B = balance`, `A = amount`: `warn` posts and returns `warnings[]`; `block` returns 409 `credit_limit_exceeded` unless `override=true` and the actor holds `ledger.entry.correct` |
| Acceptance criterion | `AC-5` — given `block`, limit ₹50,000 and balance ₹49,800, staff posting ₹500 receives 409 and no row is written; the owner repeating with `override=true` receives 201 and an override audit row exists |
| Test | `T-LED-01-4` (API) — `warn` → 201 with warnings; `block` → 409; `block + override` by staff → 403; by owner → 201 plus audit `ledger.credit_limit.overridden` |
| Instrumentation | `ub.ledger.entry_posted` with `credit_limit_outcome: none\|warn\|block\|override` |

Every feature in Part 17 is written to be readable this way. The definition of done in Part 35 requires the chain to be complete before a feature is accepted; Part 33's task breakdown carries the feature ID on every task so that a commit can be traced to an acceptance criterion.

## 10.6 Reading order

For a human stakeholder: Part 18 alone is sufficient to approve or reject the product. It is self-contained by design and cross-references everything else.

For a product or design reviewer: Parts 11, 12, 14 and 15 in that order — scope, MVP, personas, journeys — then Part 16 as a checklist.

For an engineer or AI coding agent building a feature, the order is fixed and short: Part 0, then the feature's row in Part 16, then the feature's specification in Part 17, then the tables it touches in Part 21 and the endpoints it uses in Part 22, then Part 23 for the components it must reuse. Parts 11 to 15 are context; they are read once at the start of a module, not before each feature. An agent that reads only Part 17 for a feature will build the right behaviour with the wrong vocabulary; an agent that reads only Parts 10 to 15 will build nothing at all.

## 10.7 Change control

The specification is written to be built from, which means it will be wrong in places and will need to change. The process below distinguishes the three kinds of change by their blast radius, because treating a typo like a scope change makes the process theatre, and treating a scope change like a typo makes the product incoherent.

**Class A — editorial.** A wording fix, a broken cross-reference, a table that renders badly, a Hindi copy key that reads awkwardly. No identifier, no behaviour, no schema and no API shape changes. Fixed in place with a note in the document's change log. No approval needed.

**Class B — canon change request (CCR).** A change that a feature specification needs from the canon, the schema or the API: a new column, a new error code, a new permission codename, a new settings key, a new endpoint, an extension of an enum. CCRs are the mechanism by which the FRDs were written without silently assuming canon that did not exist, and each FRD file carries its own numbered register of them at the end (`CCR-01` upwards, scoped to the file). A CCR states the requesting feature, the exact artefact and location it changes, the proposed text, and the reason no existing construct will do. A CCR is accepted by folding the change into Part 0, 21 or 22 and marking the register entry accepted with the date; until then no code may depend on it. This is the normal, expected traffic of the build, and it is cheap.

**Class C — scope change.** Anything that adds a feature, removes a feature, moves a feature between phases, changes a measurable target in Part 18, or contradicts a decision in Part 11's Avoid or Simplify lists. A scope change requires:

1. A written request naming the feature ID (or stating that a new catalogue row is needed), the phase impact, and the evidence — a user problem observed, not a preference.
2. An impact statement listing every artefact touched: catalogue row, FRD sections, schema tables, endpoints, tests, and the features that depend on the changed one.
3. A decision recorded in the product decision log (Part 39) with the date, the decider and the rejected alternative. A scope change that is not in the decision log did not happen.
4. For anything that reverses an entry on the Avoid list of Part 11, the trigger condition stated there must be demonstrably met. "A customer asked" is not a trigger; the trigger is written next to each item and is deliberately hard to satisfy.

**Freeze rule.** Once a module's build has started, Class C changes to that module are held to the next phase boundary unless the change is a correctness or compliance defect — a GST rule the product gets wrong, a DPDP obligation missed, a data-loss bug. This exists because the single most damaging pattern in a build of this size is a scope change arriving mid-module, being implemented without its schema and test consequences, and leaving the specification and the code describing different products. When a change is held, it is recorded in the open questions register of Part 18 §18.15 with the phase it is held for, so that nothing is lost by being deferred.

**Who may raise what.** Any engineer may raise a Class A or Class B change; Class B is reviewed by whoever owns the artefact being changed. Only the product owner may approve a Class C change. An AI coding agent may raise all three classes and may apply Class A itself; it must not apply Class B or C, and must stop and ask rather than implement around a specification it believes is wrong. A specification that is wrong is a bug with a known process; code that quietly disagrees with the specification is a bug with no process at all.
