# Part 37 — Open Questions

> **Status:** live register. This part supersedes the twelve-entry register in Part 18 §18.15. `OQ-01` through `OQ-12` keep their original identifiers and meanings so that existing references remain valid; `OQ-13` upward are new. Part 18 §18.15 should now be read as an extract. Where an open question has an accepted-but-provisional answer, that answer is recorded here as the **default** and is binding until the question is closed.

## 37.1 How this register works

An open question is not a defect and not a backlog item. It is a decision that has been **identified, scoped and deliberately deferred**, with a stated default so that deferral does not stop work. That last property is what makes the register useful: a team that cannot proceed without an answer has a blocker, and a team that proceeds without knowing it needed an answer has a latent defect. An open question is the third thing — proceed, on a stated default, with the cost of being wrong written down.

Every entry carries nine fields.

**Question** — stated precisely enough that an answer is recognisable. "What is our pricing?" is not a question; "flat annual per business with user-count steps, monthly subscription, or per-active-merchant to partners, and what is included free?" is.

**Why it is open** — the reason it has not been decided, which is usually one of three: the evidence does not exist yet, the decision belongs to someone who has not been engaged, or it is genuinely contested.

**Options and their consequences** — the live alternatives, each with what follows from it. An option with no stated consequence has not been thought about.

**Resolving evidence** — what would have to be observed, measured or obtained for the question to close. This is the field that turns a standing argument into a piece of work.

**Decider** — the single role that closes it. Not a committee.

**Deadline** — tied to the sprint, release or phase that forces the answer, not to a calendar date, because the calendar moves and the dependency does not.

**Default if undecided** — what applies if the deadline passes. Every entry has one; "we will decide later" is not a default.

**Blast radius** — what has to change if the default turns out to be wrong. This is the field that sets the review priority.

Entries are grouped by decision type: product, technical, commercial, legal and operational. Because `OQ-01`–`OQ-12` retain their Part 18 numbers, identifiers are not contiguous within a group. Numbers are never reused; a closed question is marked closed with its date, its answer and the record (a Part 38 ADR or a Part 39 decision) that carries it.

## 37.2 The register at a glance

| ID | Question | Type | Decider | Deadline | Blast radius |
|---|---|---|---|---|---|
| `OQ-01` | Part 16 feature-count discrepancy: 137 or 131? | Product | Product | Before build start | Documentation only |
| `OQ-07` | Staff stock-adjust permission: per-membership flag or wait for `PLT-12`? | Product | Product | Before `INV-06` | Permission model |
| `OQ-08` | Third language: which, and at what phase? | Product | Product | Phase 2 exit | Translation + support capacity |
| `OQ-09` | "Move entry to another party" correction preset? | Product | Product + UX | Phase 2 | One `LED-03` preset |
| `OQ-12` | Does the `LON` module belong in this product? | Product | Product | Phase 3 planning | A whole module |
| `OQ-13` | Per-file `CCR-` numbering collisions across the four FRDs | Product | Product | Before build start | Traceability |
| `OQ-14` | Is weighted-average costing acceptable, or must it be per-tenant? | Product | Product + compliance | Phase 2 entry | Schema + reporting |
| `OQ-15` | What triggers native (Capacitor) wrappers? | Product | Product | Phase 2 exit | A second delivery surface |
| `OQ-16` | Admit `openpyxl`, or keep the in-house XLSX reader/writer? | Technical | Engineering | Before `IMP-02` | One module, one dependency |
| `OQ-17` | Admit `cryptography` for RFC 8291 Web Push? | Technical | Engineering | Before `NTF-04` | One dependency, or no push |
| `OQ-18` | Is Playwright inside or outside the ADR-021 allow-list? | Technical | Engineering | Before the first E2E spec | Test tooling only |
| `OQ-19` | Barcode decoder fallback for browsers without `BarcodeDetector`? | Technical | Engineering | Before `INV-10` | iOS Safari scanning |
| `OQ-20` | Postgres RLS in Phase 2, or application scoping alone? | Technical | Engineering | Phase 2 entry | Defence depth on T1 |
| `OQ-21` | Offline write queue: what conflict semantics? | Technical | Engineering + product | Phase 2 entry | The whole offline design |
| `OQ-22` | When does server-side PDF arrive, and with which renderer? | Technical | Engineering | Phase 2 entry | One dependency |
| `OQ-23` | What triggers object storage, and which backend? | Technical | Engineering | Phase 2 entry | One settings switch |
| `OQ-24` | Does the analytics event stream get a real sink, and which? | Technical | Product + engineering | Phase 2 entry | Where events go |
| `OQ-25` | What is the mass-correction mechanism and its user presentation? | Technical | Engineering + product | Before launch | Incident response |
| `OQ-02` | Commercial model and what is free | Commercial | Commercial | Phase 2 entry | `PLT-15`, `PLT-16` |
| `OQ-04` | Who contracts the payment aggregator — Metis or each partner? | Commercial | Product + finance | Phase 2 entry | `PAY-06` settlement, KYC |
| `OQ-26` | Which partner archetype is targeted first? | Commercial | Commercial | Before Phase 2 | Phase 2 backlog shape |
| `OQ-27` | What is the per-free-tenant cost ceiling? | Commercial | Commercial | Phase 2 entry | Free-tier viability |
| `OQ-03` | SMS provider, and DLT registration per Metis or per partner? | Legal | Compliance | Before launch | `WLB-06`, template scoping |
| `OQ-06` | Does the launch partner require residency beyond India-region? | Legal | Partner + compliance | Before first partner contract | Hosting, error reporting |
| `OQ-10` | Retention for `notifications_message_log` recipient numbers | Legal | Compliance | Before launch | DPDP deletion cascade |
| `OQ-28` | Does Metis publish a DPA template for merchants? | Legal | Compliance | Before launch | Merchant onboarding |
| `OQ-29` | Which GSP, and when is the relationship opened? | Legal | Compliance | Phase 2 exit | `SAL-12`, `SAL-13` timing |
| `OQ-05` | Hosting: Metis-operated, partner-hosted, or both? | Operational | Operations + partner | Before first partner contract | Availability ownership |
| `OQ-11` | Pilot cohort composition | Operational | Product | Before pilot | What gets tested |
| `OQ-30` | Support model, hours, and the named second operator | Operational | Operations | Before first partner contract | `RSK-17`, `RSK-21` |

---

## 37.3 Product decisions

### OQ-01 — The Part 16 feature-count discrepancy

**Question.** Part 16 §16.15 states 67 MVP (including 2 config-gated), 41 Phase 2, 24 Phase 3 and 5 Future features, totalling 137. Counting the rows of §16.1–§16.14 gives 74 MVP, 37 Phase 2, 19 Phase 3 and 1 Future, totalling 131. Which is authoritative, and is the catalogue missing six rows or is the summary table simply wrong?

**Why it is open.** The two numbers were produced at different times and neither has been reconciled row by row. The difference is not a rounding: it is +7 MVP, −4 Phase 2, −5 Phase 3 and −4 Future against the summary, which is the signature of rows having been *re-phased* after the summary was written rather than rows being absent.

**Options.** (a) The per-row markers are authoritative and §16.15 is a stale summary — consequence: the MVP is 74 features, which is what Part 12 §12.2, Part 12 §12.8, Part 13 §13.6 and Part 18 §18.13 R1 already assume, and §16.15 is corrected editorially. (b) The summary is authoritative and six rows are missing — consequence: six features must be identified, specified and scheduled, and the MVP scope grows. (c) Both are wrong — consequence: a full recount is required and every downstream count (Part 1 §1.11's "all 67 MVP features", Part 12, Part 13, Part 18) is corrected in one pass.

**Resolving evidence.** A row-by-row recount of Part 16 §16.1–§16.14 against Part 18 §18.6's module table and Part 12 §12.2's MVP list, producing one reconciled number and a diff of any row that appears in one and not the others.

**Decider.** Product owner. **Deadline.** Before build start — a build cannot begin against an ambiguous scope count.

**Default.** The per-row phase markers are authoritative, as Part 12 §12.1 already states, and the MVP is **74 features**. Part 1 §1.11's "67 MVP features" and Part 16 §16.15's totals are treated as defects pending correction.

**Blast radius.** Documentation only under the default. Under option (b) it is a scope change of up to six features and a schedule change, which is why the question is a build-start gate rather than a nice-to-have.

### OQ-07 — The staff stock-adjustment permission

**Question.** Should `inventory.stock.adjust` be a per-membership flag at MVP, so an owner can grant it to a trusted staff member, or should staff simply be unable to adjust stock until `PLT-12` (custom roles) arrives in Phase 3?

**Why it is open.** Canon §0.9 says the `staff` role has stock adjust "off by default", which implies a per-membership override exists. Part 14 §14.9 assumes the flag. The permission model as specified has four fixed system roles with a fixed matrix, and a per-membership exception is a genuine addition to it.

**Options.** (a) Per-membership boolean on `platform_membership` checked alongside the role matrix — consequence: one extra field, one extra check in `HasPermission`, one settings control in `PLT-05`, and a precedent for per-membership exceptions that will attract more of them. (b) No flag; staff cannot adjust until `PLT-12` — consequence: in a staffed shop the owner performs every stock correction, which is exactly the person least likely to be at the counter when a count is done.

**Resolving evidence.** Whether any pilot tenant with staff performs stock counts without the owner present. This is observable in the pilot and nowhere else.

**Decider.** Product owner. **Deadline.** Before `INV-06` is built.

**Default.** Option (b) — no flag. The four-role model stays closed and `PLT-12` is the designed answer. Chosen as the default because adding an exception later is cheap and removing one is not.

**Blast radius.** One nullable field and one permission check if reversed; a Part 14 §14.9 correction either way.

### OQ-08 — The third language

**Question.** Which language after English and Hindi, and in which phase?

**Why it is open.** The answer depends on where merchants and partners actually are, which is not yet known. Part 18 §18.9 A3 assumes two are sufficient at launch.

**Options.** Gujarati, Marathi, Tamil, Telugu, Bengali and Kannada are the realistic candidates by MSME density. Consequence in each case is identical in shape and different in cost: a professional translation pass, a native-speaker review of the financial vocabulary specifically (the words for debit, credit, balance, due and interest are where machine translation fails), font coverage verification, and a support capacity commitment in that language.

**Resolving evidence.** The geographic distribution of sign-ups; partner conversations that stall on language; support requests.

**Decider.** Product owner. **Deadline.** Phase 2 exit.

**Default.** The third language follows the first partner who will fund it. If no partner does, no third language ships and the capacity is spent elsewhere.

**Blast radius.** Bounded — ADR-006's `react-intl` architecture takes a new locale without code change. The cost is translation, review and support, not engineering.

### OQ-09 — A "move entry to another party" correction preset

**Question.** Does `LED-03` need a first-class "this entry belongs to a different party" correction, or is reversal-plus-new-entry acceptable?

**Why it is open.** It is a frequency question and the frequency is unknown. Mis-attributing an entry to the wrong party is a plausible counter-level error, and the two-step workaround is correct but clumsy.

**Options.** (a) Add the preset — consequence: one flow, two linked ledger entries posted atomically with a shared reason, and a statement presentation that shows the move as one event rather than two unrelated corrections. (b) Leave it — consequence: merchants reverse and re-enter, which produces four ledger rows and two statement lines on each of two parties.

**Resolving evidence.** Production telemetry: the count of reversals followed within five minutes by a same-amount entry on a different party. This pattern is directly detectable and is the question's answer.

**Decider.** Product owner with UX. **Deadline.** Phase 2.

**Default.** Not built. Reversal-plus-new-entry stands.

**Blast radius.** One preset in an existing flow. Low either way, which is why it waits for evidence.

### OQ-12 — Does the `LON` module belong in this product?

**Question.** `LON-01`–`LON-03` are a daily-collection loan book for merchants who already lend — a bookkeeping feature, explicitly not DigiKhaato lending (Part 11 §11.3 item 7). Should it be built at all, or does it belong in a partner's product?

**Why it is open.** It is carried from legacy DigiKhaato rather than derived from this product's own research, and it is the one module whose presence invites exactly the confusion Part 11 §11.3 item 7 exists to prevent.

**Options.** (a) Build it in Phase 3 as specified — consequence: a real capability for a real merchant segment, plus a permanent explanatory burden every time someone reads "loans" in the module list. (b) Drop it — consequence: merchants who lend on daily collection keep a separate book, and a source of positioning confusion disappears. (c) Build it as a partner-gated module, invisible unless a partner enables it — consequence: (a)'s capability with (b)'s positioning, at the cost of a module toggle that already exists.

**Resolving evidence.** Whether a merchant segment that already lends on daily collection appears in the base, which is Part 13 §13.4's stated Phase 3 entry criterion for this module.

**Decider.** Product owner. **Deadline.** Phase 3 planning.

**Default.** Option (c) — partner-gated and off by default. It is the option that costs nothing to hold.

**Blast radius.** A module. Deciding late is cheap because nothing depends on it.

### OQ-13 — The per-file `CCR-` numbering collisions across the four FRDs

**Question.** Each of the four FRD files numbers its canon change requests from `CCR-1`, so `CCR-17` in Part 17-01 (platform and parties), `CCR-17` in Part 17-02 (ledger and payments) and `CCR-17` in Part 17-03 (inventory and purchases) are three different requests. Part 17-01 uses `CCR-1`…`CCR-32`, Part 17-02 uses `CCR-1`…`CCR-46`, Part 17-03 uses a zero-padded `CCR-02`…`CCR-22`, and Part 17-04 raises none. How should they be renumbered, and who reconciles them?

**Why it is open.** The four FRD files were written independently and the collision was not noticed until the cross-reference pass. Several are referenced by number from other chapters (`CCR-17`, `CCR-18`, `CCR-20`, `CCR-21`, `CCR-22` all appear in cross-reference lists), so a blind renumber would break those references.

**Options.** (a) Prefix by file — `CCR-P-nn`, `CCR-L-nn`, `CCR-I-nn`, `CCR-S-nn` — consequence: existing references inside each file stay readable and cross-file references become unambiguous; every cross-reference list needs a prefix added. (b) Renumber globally into one sequence — consequence: a single authoritative list, and every reference in four very large files must be rewritten. (c) Leave them and disambiguate by naming the file at every cross-reference — consequence: no edit now, permanent ambiguity later.

**Resolving evidence.** None needed; this is a clerical decision, not an empirical one. What is needed is one reconciliation pass that produces a single table of every CCR with its source file, its target (canon, Part 21 or Part 22), its status and its new identifier.

**Decider.** Product owner. **Deadline.** Before build start, because the CCRs are the inputs to the canon, schema and API corrections that the build depends on.

**Default.** Option (a): prefix by file, and produce the consolidated table. Chosen because it is the smallest edit that removes the ambiguity, and because the zero-padding inconsistency in Part 17-03 is fixed in the same pass.

**Blast radius.** Traceability. If unreconciled, a CCR can be applied to canon twice or not at all, which is a correctness risk in the schema rather than a documentation nuisance.

### OQ-14 — Is weighted-average costing acceptable, or must it be per-tenant?

**Question.** Part 18 §18.9 A6 assumes weighted-average costing is acceptable to the target segment's accountants. If it is not, costing method becomes a per-tenant setting.

**Why it is open.** It is an assumption about accountants that has not been tested with accountants.

**Options.** (a) Weighted average only, as specified — consequence: `recompute_item_stock` remains a pure replay (outbound movements never change the average), backdated entries survive without a rebuild, and `PUR-08` landed cost extends the same average. (b) Per-tenant method — consequence: FIFO requires lot-level cost tracking, which changes `inventory_stock_movement`'s shape, which Part 13 §13.7's cross-phase constraint forbids; it would be a Class C decision of significant size.

**Resolving evidence.** Ask three practising accountants in the target segment, including one serving a wholesale distributor, before Phase 2. This is a two-week piece of work that has not been done.

**Decider.** Product owner with the compliance owner. **Deadline.** Phase 2 entry.

**Default.** Weighted average only.

**Blast radius.** Large if wrong: a movement-table shape change plus a valuation-engine change plus a migration of existing stock. This is the open question with the widest gap between its cost to answer and its cost to get wrong.

### OQ-15 — What triggers native (Capacitor) wrappers?

**Question.** ADR-020 commits to responsive web plus a PWA, with Capacitor wrappers at Phase 3. What evidence would move that forward, and what would remove it entirely?

**Why it is open.** Part 18 §18.9 A1 assumes merchants accept a PWA. Part 11 §11.3 item 11 names two triggers — camera-dependent flows proving unusable in the browsers the base actually runs, or a partner requiring store distribution for its own compliance — but neither has been tested.

**Options.** (a) Hold at Phase 3 — consequence: one codebase, one delivery surface. (b) Pull into Phase 2 — consequence: Part 18 §18.9 A1 states the release train shifts by roughly six weeks. (c) Drop entirely — consequence: `INV-10` barcode scanning stays native-API-only and iOS Safari users type codes.

**Resolving evidence.** PWA install rate and home-screen launch rate from the analytics events; the share of the base on iOS; whether any partner raises store distribution; `INV-10` scan-success rates by browser once it ships.

**Decider.** Product owner. **Deadline.** Phase 2 exit.

**Default.** Hold at Phase 3.

**Blast radius.** A delivery surface and roughly six weeks. The architecture does not change.

---

## 37.4 Technical decisions

### OQ-16 — Admit `openpyxl`, or keep the in-house XLSX reader and writer?

**Question.** ADR-023 records an in-house minimal XLSX writer (`zipfile` plus generated SheetML) and reader (`zipfile` plus streaming `ElementTree`) rather than adding `openpyxl`, which is excluded by ADR-021's closed allow-list. Should `openpyxl` be admitted instead?

**Why it is open.** The in-house version is specified in real detail — one sheet, a bold frozen header, column widths, three number formats, streaming writes, and an explicit list of rejected inputs (`.xls`, encrypted workbooks, formulas without cached values) — and it is genuinely small. What is not known is whether real-world spreadsheets from merchants and their accountants fall inside that envelope.

**Options.** (a) Keep the in-house implementation — advantages: no dependency, no transitive surface, full control of the error taxonomy, and the export path stays streaming so memory is bounded; disadvantages: edge cases in date epochs, shared strings, merged cells and number formats are ours to find, and a file that Excel opens but Sheets rejects is a support issue with no upstream to report it to. (b) Admit `openpyxl` — advantages: a decade of edge cases already found, richer read support; disadvantages: it loads a workbook into memory by default (its read-only and write-only modes mitigate this but must be used correctly), it is a real transitive surface in a product whose dependency austerity is a *sales* argument to partner security reviews (Part 11 §11.2), and it is the first crack in a closed list whose value comes from being closed.

**Resolving evidence.** Real merchant and accountant spreadsheets run through the in-house reader during the pilot, with a count of files that fail for reasons outside the documented rejection list. Two or more such failures that cannot be fixed cheaply is the trigger to admit the dependency.

**Decider.** Engineering lead. **Deadline.** Before `IMP-02` is built (MVP export); re-examined before `IMP-03` (Phase 2 import).

**Default.** Keep the in-house implementation, per ADR-023.

**Blast radius.** One module behind a narrow interface (`imports/writers/xlsx_writer.py`, `imports/parsers/xlsx_reader.py`). The swap is a day, which is precisely why the default is the austere option.

### OQ-17 — Admit `cryptography` for RFC 8291 Web Push?

**Question.** `NTF-04` (web push, Phase 2) requires RFC 8291 `aes128gcm` payload encryption and RFC 8292 VAPID signing, which need P-256 ECDH and ECDSA. ADR-024 admits the `cryptography` package for this and explicitly rejects hand-rolling the elliptic-curve work as unsafe. Should the dependency be admitted, or should web push be dropped?

**Why it is open.** This is the one place where the minimal-dependency policy and the security policy point in opposite directions, and the resolution — admit the dependency — is correct but is a genuine precedent.

**Options.** (a) Admit `cryptography` — advantages: a correct, audited implementation of the primitives; it is the standard Python cryptographic library and a partner security reviewer will recognise it as a mitigation rather than a risk; disadvantages: it is a large dependency with a compiled component, which complicates the build image and adds a real patch-tracking obligation. (b) Hand-roll P-256 — rejected outright: writing elliptic-curve arithmetic for a production financial product is not a trade-off, it is a defect. (c) Drop `NTF-04` — advantages: no dependency; disadvantages: no push, which means re-engagement depends entirely on SMS and WhatsApp, both of which have per-message cost and policy risk (`RSK-18`, `RSK-19`). (d) Use a push vendor — rejected: it is a larger dependency plus a data flow to a third party, against DPDP posture and partner review.

**Resolving evidence.** None required for the primitives question, which is settled. What remains open is only whether `NTF-04` is worth a dependency at all, which is answered by Phase 2 re-engagement data: if SMS and WhatsApp messaging cost per active tenant exceeds the value of the re-engagement, push pays for itself.

**Decider.** Engineering lead. **Deadline.** Before `NTF-04` is built.

**Default.** Admit `cryptography` when `NTF-04` is built, and not before — the dependency enters the requirements file in the same commit as the feature, never speculatively.

**Blast radius.** One dependency, one build-image change, one module. Note that admitting it also makes a stronger password hasher available, which is a separate decision and must not be taken silently (see `OQ-20`'s neighbourhood and Part 27 §27.4.2's PBKDF2 choice).

### OQ-18 — Is Playwright inside or outside the ADR-021 allow-list?

**Question.** Part 28 specifies Playwright against pre-installed Chromium for roughly 35 end-to-end specs. Playwright is not on ADR-021's frontend or backend list, and ADR-021 says "anything else needs an ADR". Is the allow-list only about *shipped* dependencies, or about all dependencies including test tooling?

**Why it is open.** ADR-021's text enumerates dev dependencies (eslint, prettier, jest, testing-library, husky) which implies the list covers tooling, and Playwright is absent from it. Part 28 treats it as settled. The two documents disagree by omission.

**Options.** (a) Read the allow-list as covering shipped code only, and treat test tooling as governed by a lighter rule — consequence: Playwright, `coverage.py` and similar need no ADR, but the list's stated closure weakens. (b) Add Playwright to the list explicitly — consequence: the list stays closed and honest, at the cost of one line.

**Resolving evidence.** None; this is a definitional decision.

**Decider.** Engineering lead. **Deadline.** Before the first E2E spec is written.

**Default.** Option (b): ADR-021's list is amended to name Playwright and `coverage` as dev-only additions, in the same style as ADR-021a's admission of `uuid6`. A closed list with a documented amendment is stronger than an open list with a convention.

**Blast radius.** Documentation. But the principle matters: the value of ADR-021 to a partner security review is that it is exhaustive, and an exhaustive list with an undocumented exception is not exhaustive.

### OQ-19 — A barcode decoder fallback for browsers without `BarcodeDetector`

**Question.** `INV-10` (Phase 2) uses the browser-native `BarcodeDetector` API and shows an unsupported message otherwise — which today means every iOS Safari user. Should a JavaScript decoder (`@zxing/browser` or similar) be admitted as a fallback?

**Why it is open.** The answer depends on the share of the base on iOS and on whether merchants scan at all, neither of which is known before `INV-10` ships.

**Options.** (a) Native only, as specified — consequence: iOS users type the code or use a USB scanner, which is a real workflow but a poor one. (b) Admit a decoder — consequence: a meaningful frontend dependency (several hundred kilobytes) loaded only on the scanner route, plus a decode-accuracy surface that varies with camera and lighting. (c) Capacitor wrapper for the scanning flow only — consequence: pulls `OQ-15` forward.

**Resolving evidence.** iOS share of the active base; scan attempts per scanning-capable tenant; support requests from iOS users about scanning.

**Decider.** Engineering lead. **Deadline.** Before `INV-10` is built.

**Default.** Native only. ADR-025 records this as a *proposed* decision pending the evidence rather than an accepted one.

**Blast radius.** One route, one lazily-loaded dependency. Low.

### OQ-20 — Postgres row-level security in Phase 2, or application scoping alone?

**Question.** ADR-008 says RLS is "optional in Phase 2". Part 27's threat model treats RLS as a Phase 2 defence-in-depth measure on T1 (cross-tenant access). Is it adopted, and if so with what session-variable discipline?

**Why it is open.** Application-level scoping (`TenantScopedViewSet`, `TenantPrimaryKeyRelatedField`, 404 semantics, an exhaustive route-coverage test) is already strong. RLS adds a second, independent layer at the cost of a session-variable contract that every connection must honour — including the scheduler, the backup role, migrations and any ad-hoc `psql` session.

**Options.** (a) Adopt RLS on every business table with `SET LOCAL app.tenant_id` in a connection-level context manager — advantages: a forgotten `.for_tenant()` becomes a zero-row result rather than a leak; disadvantages: any code path that forgets to set the variable returns zero rows, which is a confusing failure mode, and reports that legitimately span tenants (super-admin, `PLT-14`) need an explicit bypass role. (b) Application scoping only — advantages: one mechanism, understood; disadvantages: the entire defence rests on a convention plus a test.

**Resolving evidence.** Whether the route-coverage test ever catches a real omission during MVP build. One catch is evidence the convention is fallible and RLS is worth its cost.

**Decider.** Engineering lead. **Deadline.** Phase 2 entry.

**Default.** Adopt RLS in Phase 2 as ADR-008 anticipates, on business tables only, with a dedicated bypass role for super-admin and reporting paths.

**Blast radius.** A migration per table plus a connection-context discipline. Contained, but it touches everything.

### OQ-21 — Offline write queue: what conflict semantics?

**Question.** ADR-020 stages the PWA: an installable app with a read-through cache at MVP, an offline write queue in Phase 2. What happens when a queued write replays against a server state that has changed — and which writes are queueable at all?

**Why it is open.** The queue is specified as a Phase 2 intention; its semantics are not. They are the hard part.

**Options.** (a) Queue only ledger entries and payments, which are append-only events with no update semantics — consequence: the conflict question largely disappears, because posting a second entry is always valid; the merchant's offline "You gave ₹500" simply arrives late. (b) Queue document creation too — consequence: document numbering must be allocated server-side at sync, which means the merchant sees a provisional number offline and a different one after sync, which is a compliance-adjacent surprise. (c) Queue everything including edits — consequence: real conflict resolution, which this product should not attempt.

**Resolving evidence.** How often merchants actually lose connectivity mid-flow, measurable from failed-request telemetry once the MVP is live.

**Decider.** Engineering lead with the product owner. **Deadline.** Phase 2 entry.

**Default.** Option (a): ledger entries and payments only, replayed with the existing `Idempotency-Key` mechanism so a double-sync is harmless. Documents remain online-only.

**Blast radius.** The whole offline design. Choosing (a) now costs nothing and forecloses nothing; choosing (c) later would be a rewrite.

### OQ-22 — When does server-side PDF arrive, and with which renderer?

**Question.** ADR-014 defers server-side PDF to Phase 2, needed because automated sending requires a file. Which renderer, and is the trigger "Phase 2" or "the first feature that needs a file"?

**Why it is open.** WeasyPrint is named in canon §0.4 as the Phase 2 intention but has not been evaluated against the actual print templates, and it is a substantial dependency with system-library requirements that complicate the deployment image — which matters for a product whose deployability is a selling argument.

**Options.** (a) WeasyPrint — advantages: CSS-based, so the existing print templates are close to reusable; disadvantages: Pango/Cairo system libraries in the image, and Devanagari shaping quality must be verified, not assumed. (b) Headless Chromium print-to-PDF — advantages: pixel-identical to the client-side output by construction, which removes a whole class of "the PDF looks different" defects; disadvantages: a browser in the production image, which is a large surface. (c) No server-side PDF; automated sends carry a link to the print view instead — advantages: nothing added; disadvantages: WhatsApp template buttons and email attachments genuinely want a file.

**Resolving evidence.** Whether a Phase 2 messaging feature actually requires an attachment rather than a link. `NTF-05`'s design already uses URL buttons rather than attachments, which weakens the case for (a) and (b).

**Decider.** Engineering lead. **Deadline.** Phase 2 entry.

**Default.** Option (c) for as long as it holds — link, not file — deferring the dependency until a feature genuinely cannot work without it.

**Blast radius.** One dependency and a deployment-image change.

### OQ-23 — What triggers object storage, and which backend?

**Question.** ADR-013 keeps files on local disk with an S3-compatible backend as a settings switch from Phase 2. What threshold triggers the switch, and which backend?

**Why it is open.** The trigger has not been quantified and the backend choice interacts with `OQ-05` (hosting) and `OQ-06` (residency).

**Options.** Stay local until a specific condition — media directory size approaching the volume, a second application host, or a partner requiring object storage in their own environment. Backend candidates are any S3-compatible service in an India region, or MinIO self-hosted for a partner-hosted deployment.

**Resolving evidence.** Media directory growth rate per active tenant, which is measurable from month one.

**Decider.** Engineering lead. **Deadline.** Phase 2 entry, or immediately on a second application host.

**Default.** Local disk. The switch is taken when a second application host exists, not before — because a single host with a local volume is strictly simpler and the seam is already written (Part 20's two `# storage-backend seam` call sites).

**Blast radius.** One settings switch, one dependency (`django-storages` plus `boto3`) requiring its own ADR, and the two seam call sites.

### OQ-24 — Does the analytics event stream get a real sink, and which?

**Question.** ADR-028 writes events to a local table with no third-party SDK. At what point, if ever, does a real analytics destination get added, and does that survive the DPDP posture?

**Why it is open.** A table is the right substrate at one machine and one cohort. It is not a substitute for a funnel tool at five thousand tenants, and the specification has not said what replaces it.

**Options.** (a) Stay with the table and query it with SQL — consequence: every analysis is a query someone writes; nobody self-serves. (b) Add a self-hosted open-source product reading the same table — consequence: one more service in the compose file, no data leaving the deployment, which keeps the DPDP and partner-review posture intact. (c) Add a hosted SaaS — consequence: personal data never leaves by design (events carry no PII and bucketed amounts), but the data flow must still be disclosed, and it is exactly the kind of item a bank's security review asks about.

**Resolving evidence.** Whether anyone is actually asking the questions the events were designed to answer. If the tables are unqueried at Phase 2 entry, the answer is that no sink is needed, only a few saved queries.

**Decider.** Product owner with the engineering lead. **Deadline.** Phase 2 entry.

**Default.** Option (a), plus a small set of saved SQL views for the funnels named in Part 18 §18.12.2 (activation, ledger-entry, invoice-issue, import outcomes, messaging delivery) built before launch rather than after. Events are designed to be replayable into a real sink later, which is the property that makes deferral safe.

**Blast radius.** None to the product; the events are emitted either way.

### OQ-25 — The mass-correction mechanism and its user presentation

**Question.** When a defect writes thousands of incorrect immutable rows, what is the mechanism that corrects them, and what does the merchant see?

**Why it is open.** `RSK-09` identifies this as an unmitigated gap. Immutability guarantees that the correction is *possible* and says nothing about how it is performed or presented.

**Options.** (a) A management command taking a selector and a reason, posting reversal-plus-replacement pairs in batches with a shared `incident_id`, dry-runnable with a diff — consequence: correct, auditable, and produces a statement full of pairs unless (b) accompanies it. (b) A statement presentation that groups an `incident_id` batch under one "system correction" heading with an expandable detail — consequence: the merchant sees one event, which is what actually happened, and the full trail remains available. (c) Manual SQL — consequence: violates canon §0.11 rule 1 at the database trigger and should not be possible.

**Resolving evidence.** None needed; this is a design decision that has simply not been made.

**Decider.** Engineering lead with the product owner. **Deadline.** Before launch. It is listed in Part 36 §36.10's gap table.

**Default.** There is no safe default. If it is not built before launch, the first incident is handled ad hoc under pressure, which is the scenario the whole immutability design exists to avoid.

**Blast radius.** Incident response quality, and therefore the trust proposition at the moment it is most exposed.

---

## 37.5 Commercial decisions

### OQ-02 — The commercial model and what is free

**Question.** Flat annual per business with user-count steps, monthly subscription, or per-active-merchant to partners — and precisely what is included in the free tier?

**Why it is open.** The *placement* of the wall is decided (Part 11 §11.2, Part 1 §1.9: multi-device and multi-user with roles, inventory and GST billing depth, server-sent messaging, exports and the CA hand-off, with a free accountant seat). The billing shape and the number are not, and they cannot be set responsibly before the cost of serving a tenant is measured (`OQ-27`).

**Options.** (a) Flat annual per business with user-count steps — the shape the research supports (Indian SMB products are overwhelmingly flat per business or per device; per-user pricing draws tier-gating complaints); consequence: `PLT-16` bills annually and renewal is a once-a-year event to defend. (b) Monthly subscription at OkCredit-like levels (₹30–₹99) — consequence: lower friction to start, twelve renewal events a year, and a price point that cannot fund assisted onboarding. (c) Per-active-merchant to partners only, with direct sign-up free — consequence: a channel-only business, which is a strategy choice rather than a pricing one.

**Resolving evidence.** Cost per free tenant (`OQ-27`); pilot merchants' stated willingness to pay against the three shapes; the first partner's own pricing model, which constrains (c).

**Decider.** Commercial owner. **Deadline.** Phase 2 entry, because `PLT-15` must enforce it and `PLT-16` must bill it.

**Default.** Flat annual per business with user-count steps, priced at the low end of the ₹3,400–₹4,000 micro band for single-user and inside the ₹8,000–₹25,000 staffed band above it; accountant seat free; prices published; renewals grandfathered.

**Blast radius.** `PLT-15` entitlement shape, `PLT-16` billing, and — if changed after merchants have paid — churn, since renewal price rises are a top-three churn trigger in this market.

### OQ-04 — Who contracts the payment aggregator?

**Question.** Is a payment aggregator (`PAY-06`, Phase 2) contracted directly by Metis Labs, or by each partner for its own merchant base?

**Why it is open.** It is a commercial and regulatory question about who holds merchant KYC and settlement, and it has not been put to a partner.

**Options.** (a) Metis contracts — consequence: one integration, one set of credentials, Metis in the settlement path and therefore in the KYC and grievance path, with all the regulatory weight that carries. (b) Each partner contracts — consequence: per-partner credentials resolved through the existing three-level configuration chain (which `WLB-06` already supports for messaging), no Metis involvement in settlement, and a per-partner onboarding cost. (c) The merchant contracts their own — consequence: the cleanest regulatory position and the worst onboarding experience.

**Resolving evidence.** The first partner's own position, which is usually decisive: a bank or fintech partner will have a view and it will be firm.

**Decider.** Product owner with finance. **Deadline.** Phase 2 entry.

**Default.** Option (b) — per-partner credentials, resolved exactly as messaging credentials are. It is the option that keeps Metis out of the settlement path and reuses machinery that already exists.

**Blast radius.** `PAY-06`'s credential storage, settlement reconciliation and who answers a merchant's "where is my money" question.

### OQ-26 — Which partner archetype is targeted first?

**Question.** Part 0 §0.1 names banks, fintechs, distributors and ERP vendors as partner types. Which is pursued first?

**Why it is open.** The four have very different sales cycles, security bars, merchant profiles and product demands, and pursuing all four dilutes a very small commercial capacity.

**Options.** (a) **Distributor/FMCG** — fastest to close, merchants are the wholesale segment the product is strongest for, security bar is low, but the partner's motive (order capture) may pull the roadmap toward features Part 11 §11.3 excludes. (b) **Bank/NBFC** — highest contract value and the underwriting-grade-data argument lands, but a six-month security review (`RSK-24`), a DPO expectation, and a demand for data residency (`OQ-06`). (c) **Fintech/payments platform** — medium cycle, natural fit with `PAY-06`, but they are the most likely to build it themselves. (d) **ERP vendor** — wants a mobile front end for its own base; the cleanest white-label fit and the smallest addressable set.

**Resolving evidence.** Which conversations actually advance. This is a question answered by trying, not by analysis.

**Decider.** Commercial owner. **Deadline.** Before Phase 2, because Part 13 §13.3 gates `WLB-03`–`WLB-06` on a named partner with signed intent.

**Default.** Distributor first, bank second — fastest evidence that the white-label chassis works, with the bank pursued in parallel because its cycle is long and starting late is the only irrecoverable mistake.

**Blast radius.** The Phase 2 backlog's shape, and `RSK-22`'s concentration profile.

### OQ-27 — The per-free-tenant cost ceiling

**Question.** What does one free tenant cost per month in hosting, storage, messaging and support, and what is the ceiling above which the free tier is not viable?

**Why it is open.** It has never been measured, and `RSK-01`'s contingency ("treat the free tier as a marketing cost with a hard per-tenant infrastructure budget") is meaningless without the number.

**Options.** Not really options — this is a measurement. What is open is the *ceiling*: at ₹5 per free tenant per month, 10,000 free tenants cost ₹6 lakh a year, which is a marketing line; at ₹50, it is ₹60 lakh, which is a business.

**Resolving evidence.** Instrumented cost attribution: database size and query time per tenant, media bytes, message counts, support contacts. All are derivable from data the product already holds.

**Decider.** Commercial owner with the engineering lead. **Deadline.** Phase 2 entry.

**Default.** Until measured, assume the free tier is affordable — which is the assumption that has bankrupted this category twice and is therefore the most dangerous default in this register. It is recorded as a default only because work cannot stop for it; it should be closed early.

**Blast radius.** The viability of the entire free-tier strategy, and therefore `OQ-02`.

---

## 37.6 Legal and compliance decisions

### OQ-03 — SMS provider, and DLT registration scope

**Question.** Which SMS provider, and does TRAI DLT registration proceed under Metis Labs as the principal entity, or per partner?

**Why it is open.** It depends on `OQ-26` and `OQ-05`, and on whether a partner wants its own sender identity — which most will, since the header is the brand the customer sees.

**Options.** (a) Metis as principal entity with one header — consequence: one registration (roughly ₹5,900 plus ₹590/year per header), two-to-four-week lead time, one template registry, and a shared blast radius if the identity is throttled (`RSK-30`). (b) Per-partner registration — consequence: each partner registers and owns its header, templates are scoped per partner in the registry, `WLB-06`'s design carries provider and sender identity per partner (which it already anticipates), and no partner can damage another.

**Resolving evidence.** The first partner's requirement. A bank will insist on its own identity; a distributor may not care.

**Decider.** Compliance owner. **Deadline.** Before launch, because the lead time is two to four weeks and the MVP's `LED-08` is config-gated behind it.

**Default.** Metis as principal entity for the direct channel, with the template registry designed for per-partner scoping from day one so that (b) is a configuration change rather than a redesign.

**Blast radius.** `WLB-06`'s design, template registry scoping, and `RSK-30`'s blast radius.

### OQ-06 — Data residency beyond India-region hosting

**Question.** Does the launch partner require guarantees beyond India-region hosting — a named datacentre, a dedicated database, a contractual prohibition on any cross-border flow including support access?

**Why it is open.** It is the partner's question and no partner has been asked.

**Options.** (a) India-region shared hosting — consequence: the current architecture, unchanged. (b) Dedicated single-tenant deployment per partner — consequence: exactly what ADR-019's docker-compose unit makes cheap, at the cost of per-partner operations and upgrade coordination. (c) Partner-hosted in their own environment — consequence: the partner owns availability and backups (`OQ-05`), Metis owns the software, and the security review becomes largely theirs.

**Resolving evidence.** Ask, in the first partner conversation.

**Decider.** Partner with the compliance owner. **Deadline.** Before the first partner contract.

**Default.** India-region shared hosting, with (b) and (c) offered and priced because the architecture already supports them.

**Blast radius.** Constrains the error-reporting and analytics surfaces of Part 18 §18.11 and interacts with `OQ-24`.

### OQ-10 — Retention for `notifications_message_log` recipient numbers

**Question.** How long are message-log rows containing recipient mobile numbers retained, and is masking sufficient for DPDP, or must the rows be deleted?

**Why it is open.** Three requirements pull in different directions: DPDP erasure on withdrawal of consent; the Rules' requirement that logs be retained for at least one year; and the operational need to prove what was sent when a merchant disputes a reminder.

**Options.** (a) Retain the row, mask the number after N days — consequence: delivery statistics and dispute evidence survive, the personal identifier does not; requires that "masked" genuinely means irreversible, not a display-time transform. (b) Delete the row on party erasure — consequence: clean erasure, lost delivery history, and a gap in the one-year log requirement. (c) Retain in full for one year, then delete — consequence: simple, and defensible only if the one-year log obligation is read as overriding erasure for this class of record, which is a legal opinion rather than an engineering choice.

**Resolving evidence.** A legal opinion on whether message delivery logs fall under the Rules' log-retention requirement or under the erasure obligation.

**Decider.** Compliance owner. **Deadline.** Before launch, because `PLT-10`'s deletion cascade must know the answer.

**Default.** Option (a): retain the row, irreversibly mask the recipient number 90 days after final delivery status, and delete the row at one year.

**Blast radius.** `PLT-10`'s cascade, `PTY-01`'s erasure path, and a DPDP finding if wrong.

### OQ-28 — Does Metis publish a data-processing agreement template for merchants?

**Question.** DigiKhaato is the Data Processor for merchants' customer data and the merchant is the Data Fiduciary (Part 3 §3.10). That relationship requires a contract. Is it a clause in the terms of service, a separate DPA that every merchant accepts at onboarding, or a document offered only to partners and larger tenants?

**Why it is open.** It has not been drafted, and the merchant-facing form of it is a product surface (an onboarding step) as much as a legal artefact.

**Options.** (a) A clause in the accepted terms — consequence: zero friction, and a partner's counsel may find it insufficient. (b) A separate DPA accepted at onboarding — consequence: one more consent screen in a flow whose speed is a product requirement. (c) DPA on request for partners and larger tenants only — consequence: the common case is covered by (a) and the demanding case by a document.

**Resolving evidence.** A legal review of what a Processor relationship under DPDP actually requires in form.

**Decider.** Compliance owner. **Deadline.** Before launch.

**Default.** Option (c): terms-of-service clause for all, a standalone DPA available on request.

**Blast radius.** Onboarding flow length, and a partner-review item.

### OQ-29 — Which GSP, and when is the relationship opened?

**Question.** `SAL-12` (e-invoice) and `SAL-13` (e-way bill) require a GSP relationship. Which provider, and when does the conversation start?

**Why it is open.** Part 13 §13.4 makes a signed GSP contract or a priced shortlist a Phase 3 entry criterion, and nothing requires it earlier — but `RSK-29` shows the threshold can descend onto the base at any time, and a GSP relationship has its own lead time.

**Options.** Direct GSP accreditation (rejected — Part 11 §11.3 item 9 excludes being a GSP), or a contract with an existing GSP. The choice among GSPs is about API quality, sandbox availability, downtime handling and price per IRN.

**Resolving evidence.** A priced shortlist with sandbox access, which is a two-week piece of work.

**Decider.** Compliance owner. **Deadline.** Phase 2 exit for the shortlist; Phase 3 entry for the contract.

**Default.** No GSP until Phase 3, but the shortlist is produced at Phase 2 exit so that `RSK-29`'s contingency is hours of commercial work rather than months.

**Blast radius.** `SAL-12` and `SAL-13` timing, and the ability to respond if the threshold moves.

---

## 37.7 Operational decisions

### OQ-05 — Hosting model

**Question.** Metis-operated multi-tenant, partner-hosted single-tenant, or both?

**Why it is open.** It is the first question a partner asks and no partner has been asked.

**Options.** (a) Metis-operated — consequence: Metis owns the availability target, the upgrade schedule and the backups; one deployment to run; `RSK-17` and `RSK-21` become contractual exposures. (b) Partner-hosted — consequence: the partner owns availability and backups; upgrades must be shippable as versioned images with a documented migration path (which Part 29 already provides); Metis's support surface becomes "the software", not "the service". (c) Both — consequence: two operational models, two support playbooks, and a version-skew problem when a partner-hosted instance lags.

**Resolving evidence.** The first partner's requirement, and `OQ-06`.

**Decider.** Operations with the partner. **Deadline.** Before the first partner contract.

**Default.** Metis-operated for the direct channel; partner-hosted offered where the partner requires it, with a supported-version window (current and one previous) stated in the contract.

**Blast radius.** Whether Part 1 §1.11's 99.5 % availability target is Metis's obligation or the partner's, and how upgrades roll out.

### OQ-11 — Pilot cohort composition

**Question.** How many merchants of each business type, and is at least one staffed wholesaler included?

**Why it is open.** The pilot has not been recruited.

**Options.** A cohort weighted to kirana retail — consequence: tests the ledger and the speed budget well, and leaves credit limits, roles, aging and multi-user entirely untested against their intended user. A balanced cohort — consequence: fewer merchants per segment, more coverage.

**Resolving evidence.** None needed; this is a recruitment decision.

**Decider.** Product owner. **Deadline.** Before the pilot.

**Default.** Ten merchants: four kirana retail, **two staffed wholesale distributors** (non-negotiable — without them `PTY-06`, `PLT-05`, `LED-09` and `RPT-05` ship untested against their intended user), two services professionals, one small manufacturer or job-worker, one GST-registered trader near the composition threshold. At least three must have an accountant who will be asked to use the exports.

**Blast radius.** Which features receive real evidence before launch, and therefore which defects are found by merchants rather than by the pilot.

### OQ-30 — Support model, hours, and the named second operator

**Question.** What are the published support hours and response targets, through what channel, and who is the named second operator with credentials who has performed a restore and a deploy?

**Why it is open.** Part 18 §18.13 R9 makes support ownership with response targets a release criterion and it has not been written. `RSK-17` and `RSK-21` both depend on the second-operator half of this question and both rate it as the cheapest available mitigation.

**Options.** (a) Published weekday business hours with a 4-working-hour first-response target, WhatsApp plus email — consequence: honest, achievable by a very small team, and forgiven by merchants who know the window. (b) Implied 24×7 by saying nothing — consequence: every out-of-hours incident is a broken promise nobody made explicitly, which is worse. (c) Partner L1 with Metis L2 — consequence: the contractual model of Part 1 §1.9, viable only where a partner exists.

**Resolving evidence.** None; this is a commitment to be made.

**Decider.** Operations. **Deadline.** Support hours before launch; the named second operator before the first partner contract.

**Default.** Option (a) for the direct channel, (c) layered on where a partner exists. There is **no default for the second operator** — either a named person exists or `RSK-17` is unmitigated and a partner SLA cannot honestly be signed.

**Blast radius.** `RSK-17`, `RSK-21`, `RSK-24`, and the credibility of any availability commitment.

---

## 37.8 The decision calendar

Questions are listed by the event that forces them, which is how they should be worked. An entry that has passed its gate without a decision has, by definition, taken its default — and that should be recorded as a decision in Part 39 rather than left as a silence.

| Gate | Questions due | Notes |
|---|---|---|
| **Before build start** | `OQ-01` (feature count), `OQ-13` (CCR numbering) | Both are reconciliation passes, not judgements. Neither costs more than a day, and both corrupt traceability if skipped. |
| **Before the first E2E spec** | `OQ-18` (Playwright and the allow-list) | Definitional; one line in ADR-021. |
| **During build, per feature** | `OQ-07` (before `INV-06`), `OQ-16` (before `IMP-02`), `OQ-19` (before `INV-10`, Phase 2), `OQ-17` (before `NTF-04`, Phase 2) | Each is due when its feature is picked up, not before. |
| **Before the pilot** | `OQ-11` (cohort composition) | Recruitment lead time makes this earlier than it looks. |
| **Before launch** | `OQ-03` (SMS provider and DLT scope — 2–4 week lead time), `OQ-10` (message-log retention), `OQ-25` (mass-correction mechanism), `OQ-28` (DPA form), `OQ-30` (support hours) | Five items, of which `OQ-03` has the longest lead time and `OQ-25` has no safe default. |
| **Before the first partner contract** | `OQ-05` (hosting), `OQ-06` (residency), `OQ-30` (second operator) | All three are partner-facing and all three are asked in the first conversation. |
| **Phase 2 entry** | `OQ-02` (commercial model), `OQ-04` (aggregator contracting), `OQ-14` (costing method), `OQ-20` (RLS), `OQ-21` (offline semantics), `OQ-22` (server-side PDF), `OQ-23` (object storage), `OQ-24` (analytics sink), `OQ-27` (free-tier cost) | The heaviest gate. `OQ-27` should be pulled forward: it is a measurement, it informs `OQ-02`, and it is the default most likely to be wrong. |
| **Before Phase 2** | `OQ-26` (partner archetype) | Gates `WLB-03`–`WLB-06` per Part 13 §13.3. |
| **Phase 2 exit** | `OQ-08` (third language), `OQ-15` (native wrappers), `OQ-29` (GSP shortlist) | Each is a Phase 3 input. |
| **Phase 2 (no hard gate)** | `OQ-09` (move-entry preset) | Telemetry-driven; closes itself if the pattern is rare. |
| **Phase 3 planning** | `OQ-12` (`LON` module) | The only question whose best answer may be "never". |

Four questions carry defaults that should be regarded as provisional rather than comfortable, and are the four to review first at every cadence: `OQ-27` (an unmeasured free-tier cost has bankrupted this category twice), `OQ-25` (no safe default exists), `OQ-14` (cheap to answer, expensive to get wrong), and `OQ-30`'s second-operator half (no default exists, and it gates every partner commitment).

---

**End of Part 37.**
