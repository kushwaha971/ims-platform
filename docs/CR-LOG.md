# CR-LOG — the live change-request register

**Status:** live working document. Appended to daily during the build.
**Holder:** the lead developer (Part 32 §32.1.1), who triages every entry within one working day.
**Supersedes:** Part 43, which is frozen at hand-over and remains the detail for every `CR-0nn`/`CR-1nn` entry. This file is the *state* of those change requests and the home of every new one.
**Corpus version at hand-over:** `1.0.0`.

---

## 1. What belongs here

A change request is a proposed change to **the specification**, not to the code. It is raised whenever the corpus is wrong, missing, or says two things — which is the case this register exists for, because an implementer who meets a contradiction and has nowhere to put it will resolve it silently and the resolution will be discovered in March.

Raise a CR when any of these is true:

- Two chapters disagree, and one of them must be amended (Part 0 §0.12 says which one owns the table).
- A chapter is silent on something the build must decide, and the decision changes an interface — a column, an endpoint, an error code, a permission, a settings key, an event name.
- An FRD names something the foundation does not contain (`CCR-`/`CR-` style references from Parts 17-01 to 17-04 are exactly this).
- A normative table needs a row added, changed or retired (Part 0 §0.12.4 routes every such edit through here).
- Building the thing as specified turns out to be wrong, and the specification should change rather than the code drifting from it.

**Do not raise a CR** for a decision that changes no interface and no chapter — that is a `DEC-` entry in `docs/DECISIONS.md`. Do not raise one for a defect in code. Do not raise one to record that something is hard.

## 2. The workflow

Every CR moves through these states, and only these. The state is the first column of the register below.

| State | Meaning | Who moves it out |
|---|---|---|
| `raised` | Written down with its target and its reason. Nothing more is required to raise one. | Holder, at triage |
| `triaged` | The holder has named the owning chapter and its approver, and set a gate (the sprint or artefact before which it must be answered). | Approver |
| `accepted` | Agreed. The owning chapter will be amended. It is not yet amended. | Chapter author |
| `applied` | The owning chapter has been edited, the consumers named in Part 0 §0.12.2's last column have been re-read, and the corpus version is bumped. | Holder, at verification |
| `verified` | `scripts/check_table_ownership.py` passes and the change is reflected in the code or the code does not exist yet. Terminal. | — |
| `rejected` | Will not be made. Carries a reason, always. Terminal. | — |
| `deferred` | Agreed in principle, not for this release. Carries the release it returns in. | — |
| `blocked` | Waiting on a `DEC-` entry in `docs/DECISIONS.md`. Carries that entry's number. | The decision |

**Who may raise one: anyone, including the AI coding agent.** Part 20 §20.0's rule — "if a decision is not written here, in Part 21, or in Part 22, it is a specification gap and must be raised as a CR, not guessed" — is only executable because this file exists. The agent raises a CR by appending a row and stopping work on the affected task; it does not choose between two contradictory chapters, and choosing silently is the single failure this register is built to prevent.

**Who approves.** The approver is the author of the *owning* chapter, identified through Part 0 §0.12.2. In the team shape of Part 32 §32.1.1 that is one person wearing the relevant hat, which makes the rule about sequence rather than about headcount: the owner of the table approves before the table is edited, and the edit is a separate act from the approval.

| Target | Approver role |
|---|---|
| Part 0 (canon) | Holder, and only with a `DEC-` entry recording why canon moved |
| Part 21 (schema) | Backend/schema owner |
| Part 22 (API) | API owner |
| Parts 19, 23, 25 (frontend, design system) | Frontend owner |
| Parts 20, 26, 27, 29, 30 (backend, standards, security, deploy, observability) | Backend owner |
| Parts 11–16, 18, 39, 40 (product) | Product owner |
| Parts 28, 32, 33, 35 (quality and plan) | Holder |

## 3. Linking a CR to the chapter it amends

Every CR names its target in two forms, and both are required:

1. **The section**, as `Part 21 §21.3.6` — where the edit is made.
2. **The ownership ID**, as `T-08` — the row of Part 0 §0.12.2 that says the section owns that table. A CR whose target section does not own the table it wants to change is mis-addressed and is re-pointed at triage rather than applied, which is how this register stops a change landing in the wrong chapter and creating the eleventh duplicate table.

A CR that changes no owned table carries `T-—` and names the section alone.

## 4. Version bumping

The corpus carries a version, recorded at the top of this file and bumped by the holder when a CR reaches `applied`.

| Bump | When | Consequence for the build |
|---|---|---|
| **Patch** `1.0.x` | Editorial: a cross-reference corrected, a typo, a clarification that changes no behaviour | None |
| **Minor** `1.x.0` | A normative change that does not invalidate anything already merged: a new endpoint, a new error code, a new column on a table nothing has written to yet | The next task that touches the area picks it up |
| **Major** `x.0.0` | A change that invalidates merged code or amends Part 0 | Every affected merged task is re-opened as a named task in Part 33 and re-reviewed. A major bump is a `DEC-` entry as well as a CR, because somebody has to decide to pay for it |

Several CRs applied in one editing pass share one bump. The version is quoted in the sprint report so that "which version of the spec was this built against" has an answer.

---

## 5. Open entries

### 5.1 Blocking contradictions carried from Part 43 §43.4.6

These five are contradictions, not gaps: two chapters proposed incompatible changes to the same table and Part 43 deliberately picked neither. Each is blocked on a decision and each blocks a migration or a feature. **C1 and C5 must be answered before the first migration is written**, which is `TSK-PTY-01-01` in Sprint 3 and the imports migration in Sprint 10 respectively — but both tables are created in Sprint 0's first migration, so the real deadline for both is **Sprint 0**.

| ID | State | Target | T- | Question | Blocks | Approver | Gate | Decision |
|---|---|---|---|---|---|---|---|---|
| `CR-C1` | `blocked` | Part 21 §21.3.3 | T-08 | Is `parties_share_link` a party-khata table (CR-035) or the platform's generalised any-entity share table (CR-043)? The two are not additive: one makes `party_id` mandatory with a narrow `kind` enum, the other makes it nullable with an open discriminator. | CR-035, CR-043; the first migration | Backend owner | **Sprint 0** | `DEC-006` |
| `CR-C2` | `blocked` | Part 21 §21.3.2 | T-08 | May `files_attachment.tenant_id` be NULL for partner-owned assets (CR-018), or do partner assets get their own table, or a designated system tenant? A nullable tenant column punches a hole in the mechanism the whole isolation story rests on. | CR-018; the first partner logo upload | Backend owner **with** the Part 27 author | Before `WLB-01` (Sprint 2) | `DEC-007` |
| `CR-C3` | `blocked` | Part 0 §0.4 ADR-021 | T-05 | In-house pure-Python QR encoder, or `segno` on the allow-list? ADR-021 is closed; admitting `segno` is an ADR, not a preference. | CR-050; `PAY-03` | Whoever owns ADR-021 | Before `PAY-03` (Sprint 8) | `DEC-003` (the dependency-policy split decides the frame; this is the first case tried under it) |
| `CR-C4` | `blocked` | Part 22 §22.1, Part 21 §21.3.10 | T-17, T-08 | Is optimistic concurrency a property of *documents* (CR-003) or of *every mutable financial row* (CR-066)? The answer decides whether Part 22 §22.1 states a general rule or an endpoint-by-endpoint one, and whether `expenses_expense`, `payments_payment` and `inventory_stock_adjustment` carry `version`. | CR-066; the first mutable-expense endpoint | API owner | Before `EXP-01` (Sprint 10); free to answer in Sprint 0 | `DEC-008` |
| `CR-C5` | `blocked` | Part 21 §21.3.11 | T-08 | Does `imports_job` carry one `options jsonb` with `column_map` as a key inside it (CR-096), or two columns (CR-036)? Two config columns on one table guarantees that in six months one of them is the one nobody populates. Each chapter also proposes a different partial index on the same table; whichever shape wins, the two index proposals merge into one. | CR-036, CR-096; the first migration | Backend owner | **Sprint 0** | `DEC-009` |

Part 43 records a recommendation for C1 (adopt the generalised form, treat CR-035's `label` and `token_suffix` as additions to it) and for C5 (one `options jsonb`). Those are recommendations from the register's author and they are **not** decisions; they become decisions when a `DEC-` entry says so, and until then the two CRs stay `blocked`.

### 5.2 Accepted and not yet applied — carried from Part 43 §43.4

102 change requests are marked **Accepted** in Part 43 and have not been applied to their target chapter. Six more (`CR-001`…`CR-005`, `CR-118`) are **Absorbed** and need nothing. This section is the index of what is still owed; Part 43 §43.4 remains the detail for every one of them and is not restated here (Part 0 §0.12, T-63).

Every ID below is `accepted` and awaiting `applied`.

**Gate 1 — Part 21, before the first migration is written (14).** Part 43 §43.5.2 gives the order, and the order matters: three of these add unique or functional indexes to tables that will hold immutable rows, where a corrective migration is expensive.

> `CR-021`, `CR-023`, `CR-025`, `CR-030`, `CR-034`, `CR-040`, `CR-045`, `CR-065`, `CR-068`, `CR-072`, `CR-074`, `CR-075`, `CR-098`, `CR-106`

Plus the five schema deltas of Part 42 A-03 — `platform_job`, `platform_idempotency_key`, `version` on both document tables, `permissions_version`, `token_epoch` — and `inventory_stock_movement.sequence_no`, which are `CR-001`…`CR-005` and are recorded Absorbed; **verify them before the first migration rather than trusting the marking**, because A-03 was still on Part 42's blocking list when this file was created.

**Gate 2 — Parts 22 and 0, before the first endpoint is written (46).** Part 43 §43.5.3 groups them; the first group changes the shape of every endpoint's documentation and goes first.

> `CR-006`, `CR-007`, `CR-008`, `CR-009`, `CR-010`, `CR-011`, `CR-012`, `CR-013`, `CR-014`, `CR-015`, `CR-016`, `CR-017`, `CR-022`, `CR-024`, `CR-027`, `CR-028`, `CR-029`, `CR-031`, `CR-037`, `CR-038`, `CR-039`, `CR-041`, `CR-042`, `CR-044`, `CR-051`, `CR-052`, `CR-053`, `CR-054`, `CR-055`, `CR-064`, `CR-067`, `CR-069`, `CR-070`, `CR-081`, `CR-082`, `CR-083`, `CR-087`, `CR-089`, `CR-095`, `CR-097`, `CR-100`, `CR-101`, `CR-102`, `CR-107`, `CR-108`, `CR-109`

The error codes among these (`CR-008`, `CR-011`, `CR-038`, `CR-055`, `CR-109`) are **already applied**: `party_archived`, `party_opted_out`, `channel_not_configured`, `export_expired` and `export_queue_full` are registered in Part 22 §22.1.1 as part of Part 42 A-02. Their remaining content — the `X-Tenant-Id` header and `ETag`/`If-Match` on settings — is not.

**Phase 2 and later — apply before the feature that needs it (41).** Part 43 §43.5.4 gives the within-phase dependency order, and two of those orderings are load-bearing rather than tidy: `CR-092` must land with or before `CR-091`, or `recalc_stock` silently stops being able to reproduce stock value; and the credential table must exist before the connect endpoint.

> `CR-019`, `CR-020`, `CR-033`, `CR-046`, `CR-047`, `CR-048`, `CR-056`, `CR-057`, `CR-058`, `CR-059`, `CR-060`, `CR-061`, `CR-062`, `CR-063`, `CR-071`, `CR-073`, `CR-076`, `CR-077`, `CR-078`, `CR-079`, `CR-080`, `CR-084`, `CR-086`, `CR-088`, `CR-090`, `CR-091`, `CR-092`, `CR-093`, `CR-094`, `CR-099`, `CR-103`, `CR-104`, `CR-105`, `CR-110`, `CR-111`, `CR-112`, `CR-113`, `CR-114`, `CR-115`, `CR-116`, `CR-117`

**Unplaced (1).** `CR-085` is Accepted in Part 43 §43.4 and appears in none of §43.5's gates. It is `triaged` here rather than `accepted`, and the first job of the holder is to give it a gate or reject it. An accepted change with no gate is how a register starts lying.

### 5.3 Raised by this review pass

| ID | State | Target | T- | Change | Reason | Gate |
|---|---|---|---|---|---|---|
| `CR-119` | `accepted` | Part 20 §20.6.x | T-25 | Remove the duplicate `tax_rate` column table from Part 20 and replace it with a cross-reference to Part 21 §21.3.5. | `scripts/check_table_ownership.py` reports it as the corpus's one remaining Class A duplicate. | Before Sprint 6 |
| `CR-120` | `accepted` | Part 21 §21.3.1 | T-08 | Define `platform_role_permission`, which canon §0.6 names and Part 21 §21.3 does not define. | The `PAIRED` check fails on it; the permission system is built in Sprint 1. | Gate 1 |
| `CR-121` | `accepted` | Part 21 §21.3.11 | T-08 | Define `reports_snapshot`. Duplicate of `CR-106`, recorded here because the `PAIRED` check surfaces it independently. | Same finding from two directions; close both together. | Gate 1 |
| `CR-122` | `accepted` | Parts 17-01…17-04, 20, 21, 24, 27 | T-16 | Replace the 33 non-canonical error-code spellings listed in Part 22 §22.1.4 with their registered codes. One change request per chapter when it is taken up. | Until this lands, the `ORPHAN` check runs in warn mode and Part 28 §28.3.6's equality assertion cannot be honoured. | Before the module each chapter specifies is built |
| `CR-123` | `raised` | Part 17-04 `RPT-07`; Part 22 | T-16 | Specify the `RPT-07` reconciliation **warning** vocabulary — severity, acknowledgement, and the nine names listed as gaps in Part 22 §22.1.5 — as something other than HTTP error codes. | Part 42 A-42 owns the surrounding specification; this is the piece of it the error registry cannot absorb. | Before `RPT-07` (Sprint 11) |
| `CR-124` | `raised` | Part 24 §24.9.1 | T-55 | Amend the plan/entitlement table to whatever `DEC-001` decides. The table currently says `max_parties: 300` and `max_invoices_per_month: 100` on the free plan, which Part 42 A-18 removes from enforcement. | The table is the owner of T-55; the decision cannot be applied anywhere else. | Before `PLT-15` (Sprint 1) |

---

## 6. Applied

Nothing yet beyond the six Part 43 Absorbed entries. Each row records the CR, the date, the version bump and the commit, so that "which version of the spec was this built against" has an answer for every sprint.

| ID | Applied on | Bump | Version | Commit |
|---|---|---|---|---|
| `CR-001`…`CR-005`, `CR-118` | 2026-09-18 | — | `1.0.0` | Part 43 reconciliation pass |

---

## 7. Rejected and deferred on merit

Carried from Part 43 §43.5.4's last bullet, because a rejection with no reason gets re-raised every quarter.

| ID | State | Reason |
|---|---|---|
| `CR-026` | `deferred` | Cursor pagination — offset pagination is adequate at the MVP size envelope. Returns when a tenant's ledger exceeds the envelope. |
| `CR-032` | `deferred` | The credit-limit index — required before any tenant exceeds 10,000 parties, and no MVP tenant will. |
| `CR-049` | `deferred` | Advance allocation — Phase 2 by the raising chapter's own statement. |
