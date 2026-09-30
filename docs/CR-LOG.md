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

---

## Batch 2026-09-19 — raised by the Sprint 1, DEC-010 and design-system work

Raised by the implementing agents against chapters they did not own. All `raised`; none
applied to the chapters yet. Grouped by what forces them.

### Gate: immediate — the chapter now contradicts shipped code

| ID | Target | Change |
|---|---|---|
| `CR-126` | Part 21 §21.3.1 `platform_user` (T-08) | DEC-010: `email varchar(254) NN, U`; `mobile varchar(15) NULL, U WHERE NOT NULL`; add `email_verified_at`. Implemented by migration `platform.0004_email_identity`. |
| `CR-127` | Part 21 §21.3.1 (T-08) | Define `platform_auth_token` — the single-use, expiring, hashed link token Part 27 §27.4.2 requires and DEC-010's verification reuses. |
| `CR-128` | Canon §0.8 | Register `POST /auth/register`. Sign-up used to be a side effect of `POST /auth/otp/verify`. |
| `CR-129` | Canon §0.8 | Register `POST /auth/email/verify/{request,confirm}`; mark the two `otp/*` paths conditional on `UB_AUTH_OTP_ENABLED`. |
| `CR-130` | Part 22 §22.2 (T-17) | Rewrite the auth block for DEC-010: register, login `{email}`, reset request `{email}`, reset confirm `{token}`, the verify pair, OTP conditional. |
| `CR-131` | Part 22 §22.1.1 (T-16) | `invalid_credentials` copy: "Mobile number or password is incorrect." → "Email or password is incorrect." Code unchanged. Also `login_throttled`'s "per-mobile" → "per-identifier". |
| `CR-133` | Part 27 §27.4.1, §27.4.2 | "per mobile" → "per identifier" (budgets unchanged); reset row becomes the hashed link; §27.4.1's OTP controls apply only when the flag is on. Register the reset and registration budgets. |
| `CR-135` | Part 29 §29.2.4 (T-28) | Add `UB_AUTH_OTP_ENABLED`, `UB_RESET_TOKEN_TTL_SECONDS`, `UB_EMAIL_VERIFICATION_ENABLED`, `UB_VERIFY_TOKEN_TTL_SECONDS`, `UB_EMAIL_ADAPTER`, `UB_EMAIL_FROM`, `UB_ALLOW_CONSOLE_SMS`. Note `UB_EMAIL_ADAPTER` ≠ Django's `UB_EMAIL_BACKEND`. |
| `CR-136` | Canon §0.4 ADR-011 | Supersede: identity is email, mobile is an optional profile field, OTP deferred behind a flag. Record the local-first reason so it is reversible on its own terms. |
| `CR-137` | Canon §0.4 (new ADR) | Record the outbound **email** adapter, parallel to ADR-015 (SMS): one Protocol, console backend, `notifications_message_log`, provider by settings alone. |
| `CR-a` | Part 21 §21.3.1 (T-08) | Register `platform_rate_limit`, which Part 27 §27.4.1 makes normative and §21.3 never defined. |
| `CR-b` | Part 21 §21.3.2 | `notifications_message_log.tenant_id` must be nullable — messages are sent before tenant context exists. |
| `CR-c` | Part 21 §21.3.1 | `platform_idempotency_key.tenant_id` nullable + `U(user_id, scope, key) WHERE tenant_id IS NULL`. Required by PLT-03 EC-7. |
| `CR-d` | Part 20 §20.5.1 | Add the `epo` claim (`platform_user.token_epoch`) to the token claim tables. Part 21 requires the rejection; §20.5.1 has no claim to carry it. |
| `CR-e` | Part 21 §21.3.1 (T-27) | Add `parties.labels`, `inventory.favourite_units`, `plan.overrides` to the well-known tenant-setting keys. |
| `CR-g` | Part 22 §22.1 (T-17) | Register `X-Tenant-Id` as a **response** header (CCR-3). §22.1 names it only as an untrusted request header, which reads as a prohibition on emitting it. The client's stale-tab guard now consumes it. |

### Gate: before the next platform sprint

| ID | Target | Change |
|---|---|---|
| `CR-138` | PLT-01 | Written end-to-end as mobile OTP. Rewrite for email registration, or split into PLT-01 (email, MVP) and PLT-01b (OTP, backlog). BR-1 "one user per mobile" → "per email". |
| `CR-139` | PLT-02 | FR-4/FR-5 specify reset as an OTP challenge. Rewrite for the link flow; FR-7's `{mobile\|email}` becomes `{email}`. |
| `CR-140` | PLT-05 | Invitations are keyed on `platform_invitation.mobile` and accept matches `invitation.mobile == user.mobile` — unsatisfiable for a phone-less owner. Rule whether invitations move to email. **Blocks PLT-05.** |
| `CR-i` | Canon §0.9 | Resolve `platform.tenant.manage` "(partial)" for `admin` — Part 22 §22.3 and PLT-03 §12 grant admin a PATCH the registry denies. |
| `CR-j` | PLT-02 §10 ↔ Part 27 §27.4.2 | Reconcile the 8-vs-10 character password floor and the 15- vs 10-minute throttle window. One chapter should state each, not two. |
| `CR-k` | PLT-01 FR-3 ↔ Part 20 §20.5.4 ↔ §20.13.4 | Three chapters name three loggers for the console OTP line. Pick one. |
| `CR-141` | Part 31 | Register `auth.password_reset_requested`, `auth.email_verify_requested`, `auth.email_verified`; retire or flag `auth.otp_*`. |

### Gate: deferred — needs a decision first

| ID | Target | Change |
|---|---|---|
| `CR-132` | Part 22 §22.1.1 | Register an error code for "address not confirmed", or rule that verification will never gate login. Until then verification is plumbing, not a gate. |
| `CR-134` | Part 27 §27.4.x | Rule whether `check --deploy` should gate the console **email** adapter outside DEBUG, as `platform.E001` does for SMS. Deliberately not added: reset links to a log *is* the intended local deployment. |
| `CR-I` | Part 22 §22.2 | `POST /auth/email/verify/{request,confirm}` are served by the backend and called by no frontend screen. State when verification starts gating and which screen owns it. |

### Design-system discipline (the BrandHub-parity change)

| ID | Target | Change |
|---|---|---|
| `CR-D1` | Part 23 §23.3 | Add the Wave 2 block: `UbBox`, `UbStack`, `UbGrid`, `UbText`, `UbDivider`, `UbSpacer`, `UbAvatar`, `UbListItemText`, `UbPressable`, `UbLink`, with the BrandHub seat each fills. |
| `CR-D2` | Part 23 §23.2.2 | The `ds-*` tiers are addressed through `UbText`'s `variant` union, not by writing the class; `scale.ts` is the single binding to the typography plugin. |
| `CR-D3` | Part 25 (new rule R-S-10) | "Feature code renders no raw JSX host element." Ban list, the two exempt zones, `className` as the escape hatch, and `as` as how semantics and heading order are preserved. |
| `CR-D4` | Part 25 §25.14 | Update the normative `eslint.config.mjs` listing with the `react/forbid-elements` block. |
| `CR-D5` | Part 19 §19.6 | Record `src/routes.ts` as the single home for application paths; `middleware.ts` derives from it. |
| `CR-D6` | Part 19 §19.11.5 | Record `src/utils/text.ts` and the promotion bar: a helper moves out of a feature's `view-model/` when a **second** feature needs it. |
| `CR-D7` | Part 19 §19.2.5 | Note the barrel's Wave 2 section and `src/design-system/scale.ts`. |
| `CR-D8` | Part 28 | Record `forbidElements.test.ts` and `routes.test.ts` as config-level anti-regression suites. |

### Batch 2026-09-19 — raised by the DEC-011 product rename

| ID | Target | Change |
|---|---|---|
| `CR-142` | Part 20 §20.3, Part 24 §24.5, Part 29 §29.2–§29.9 | Infrastructure identifiers still carry the retired working name: the PostgreSQL database and role (`udhaarbook`, `udhaarbook_backup`), the Compose project name, `/srv/udhaarbook`, the `app.udhaarbook.in` / `ingress.udhaarbook.in` / `*.staging.udhaarbook.in` hostnames, and the `udhaarbook-backend` / `udhaarbook-frontend` image names. `DEC-011` deliberately left every one of them: each has a migration, a DNS record or a certificate behind it, and a product rename must not become a cutover. Rule whether they move to `digikhaato` at a planned maintenance window or stay as permanent internal identifiers. |
| `CR-143` | Part 20 §20.2 (repo tree) | The tree shows `udhaarbook-backend/` and `../udhaarbook-frontend`; the repository folder is `ims-platform` with `backend/` and `frontend/` inside it (`DEC-011`). The chapter's tree and the repository disagree independently of the rename. |
| `CR-144` | Part 30 §30.4 ↔ `apps/common/logging.py` | Part 30 specifies the file handler as `LOG_DIR / "app.log"`; the code writes `<product>.log` (now `digikhaato.log`, renamed with the product under `DEC-011`). Pre-existing drift, surfaced by the rename. Pick one — the chapter or the code. |
| `CR-145` | Canon §0.1 | The product name now collides with the name of the predecessor application the corpus cites as an engineering reference, which is also called DigiKhaato and whose ledger module was itself called UdhaarBook. `DEC-011` disambiguates the predecessor as **legacy DigiKhaato** throughout and canon §0.1 carries the definition. Confirm the term, or give the predecessor a distinct name of its own. |

## CR-2026-09-21-A — two error codes beyond Part 22 §22.1.1

`DEC-012` adds `password_change_required` (403, not retryable) and `password_expired`
(401, not retryable) to the closed registry in `apps/common/error_codes.py`. The count
guard in `apps/common/tests/test_exceptions.py` moved 151 → 153 and names both.

Neither could reuse an existing code. `permission_denied` means "your role does not allow
this", and a client quite reasonably shows a dead end for it — a new staff member's first
ever sign-in would land on an error screen instead of the one screen they can use.
`invalid_credentials` is equally wrong for an expired temporary password: the password was
right, the window was not, and telling the holder otherwise sends them to reset a password
they never had.

Requested against Part 22 §22.1.1 table T-16.

## CR-2026-09-23-A — two error codes beyond Part 22 §22.1.1, for PTY-04 FR-3

The write-off escape on `POST /parties/{id}/archive` adds `nothing_to_write_off`
(400, not retryable) and `balance_changed` (409, not retryable) to the closed registry in
`apps/common/error_codes.py`. The count guard in `apps/common/tests/test_exceptions.py`
moved 153 → 155 and names both.

`nothing_to_write_off` answers a `write_off` sent for a party whose balance is already
0.00. The FRD is silent on that case; quietly archiving was the alternative, and it hides
the client bug (a dialog showing a balance the server does not have) that will next write
off the wrong figure. It cannot be `validation_error`: no field of a well-formed write-off
is wrong — the PARTY is in the wrong state.

`balance_changed` answers a `write_off.amount` — the figure the merchant confirmed by
ticking "I understand ₹2,300 is written off" — that differs from the balance read under
`FOR UPDATE`. `details = { balance, balance_label, amount, confirmed_amount }`. It cannot
be `stale_version`, which promises a `current_version` a party row does not carry. This
also amends FRD PTY-04 EC-2, which accepts an over-credited archived party as the outcome
of a write-off racing a payment: with the lock and the pin, that race produces a 409 and a
redrawn dialog instead.

Also requested against Part 17-01 PTY-04 §14: `write_off` gains the optional `amount`
field, and `write_off.entry_date` becomes optional (defaulting to the tenant's today).

Requested against Part 22 §22.1.1 table T-16. Part 43 in the Claude project is the
authoritative register and needs the same entry (this file is a local carry).

## CR-2026-09-23-B — PLT-05 is stale against what shipped, and against DEC-010/DEC-012

**State:** `raised`. **Target:** Part 17-01 PLT-05 (§4, §10, §11, §13, §14, §16, §21, §22),
Part 21 §21.3.1 (`platform_user`), PLT-15 FR-3. **Gate:** before the next platform sprint
(it is the chapter the membership-management endpoints — FR-4/6/7/8 — will be built from).

The FRD was written for the mobile-OTP identity and an SMS/WhatsApp share sheet. `DEC-010`
made email the identity and `DEC-012` made "the owner creates the login" the primary way to
add staff, keeping the token flow as the future email path. The chapter was never amended, so
it now describes an API that does not exist and omits two that do. Where the two disagree
`DEC-012` has been followed. The code changed on 23 Sep 2026 is listed last.

**Chapter changes requested (the FRD must say what shipped):**

| § | FRD says | Shipped / decided | Requested amendment |
|---|---|---|---|
| FR-1, §14 | `GET /memberships?status=`, tabs Active · Invited · Suspended, masked mobile, last active | `GET /members` (no status filter; `removed` excluded), two tabs Team · Invitations; an `invited` row shows as **Invited** with the invitee's profile withheld | Rename to `/members`; document the redaction; keep the three tabs as a later UI refinement |
| FR-2, §14 | `POST /memberships/invite {mobile, role, name}` → `share_text`, `join_url` `/join/{token}` | `POST /invitations {email, role, mobile?}` → `accept_url` `/accept-invite/{token}`, returned once; `null` on idempotent replay; no `share_text` (nothing is sent — DEC-012) | Rewrite for email identity (closes `CR-140`); state the once-only link and the replay rule |
| FR-2 | `invited` membership "so the invited tenant shows in `tenants[]`" | Now implemented **for an address that already has an account**. `platform_membership.user_id` is NOT NULL, so an address with no account has no membership; its invitation holds the seat alone and acceptance creates the membership (EC-1) | Say so; the FRD reads as if every invitation has a membership row |
| — (new) | — | `POST /members` + `POST /members/{id}/credentials` (DEC-012) are the primary add-staff path | Add both to §4/§14 as FR-2a/FR-2b; the invitation path becomes "email delivery, when funded" |
| FR-3, §12 | owner offered to owners | `owner` refused on BOTH create paths (`POST /members` already; `POST /invitations` now) — ownership is transferred, canon §0.7 | Remove `owner` from the invitable set; §12 row "Invite owner" → ❌ for all |
| FR-9 | resend rotates the token on the same row | resend revokes the old invitation and inserts a new one; the `invited` membership is kept and takes the new role | Describe supersede-by-revoke; "no duplicate rows" → "one live invitation per address" |
| FR-10, BR-6, US-5, AC-5 | OTP on the invited mobile; `GET /public/invitations/{token}` preview | Sign in with email/password, then accept; the caller's email must equal the invitation's. No preview endpoint | Rewrite for email; the preview is unbuilt — keep as backlog or drop |
| FR-10, BR-5 | single use | single GRANT: the acceptor replaying gets 200 and the same membership, nothing written; anybody else, or the acceptor after suspension/removal, gets 400 | State the replay rule (the accept screen fires on mount) |
| FR-10 | — | a pending invitation never lifts a suspension; an already-active member keeps their role | Add as BR-9/BR-10 |
| FR-8 | removing an `invited` membership revokes the invitation | revoking the invitation (`DELETE /invitations/{id}`) removes the `invited` membership in the same transaction; lazy expiry does the same | Add the converse; name the endpoint |
| FR-11 | `expire_invitations` scheduler | not built; expiry is marked lazily on an accept attempt, and a lapsed invitation stops holding a seat at `expires_at` | Keep FR-11 as backlog; document the interim rule |
| FR-12, PLT-15 FR-3, §10 | seats = active + invited **memberships** | seats = active + invited memberships **+ live pending invitations to addresses with no such membership**, counted once per person. Checked on invite, accept, `POST /members` and activate; a conversion (accepting, or creating the login of somebody invited) is not charged twice | Amend both chapters: counting memberships alone let ten invitations go out against three seats |
| §10 | mobile ≠ an active/suspended member | email; inviting a suspended member is refused ("restore their access instead") | Email; keep the suspended refusal |
| §16 | `member.invited` with mobile **hashed** | `after.email` is stored in the clear; `member.invite_resent` is not a separate action (supersede count is metadata); revoke/invite rows carry `membership_id` | Rule whether the address must be hashed in audit (Part 27); record the metadata |
| §17, §6 | SMS template, `UbShareSheet`, "Send" | nothing is sent (DEC-012); copy must not imply a message was sent | Strike the SMS/share-sheet flow until email is funded |
| §19 | rate limit 30 invites/tenant/day | not built | Keep; backlog |
| FR-4, FR-6, FR-7, FR-13, EC-3, EC-7, AC-3/4/6 | override switches, role change, suspend/reactivate, remove, self-change guard | not built (`PATCH/DELETE /memberships/{id}` act on the caller's own row only) | No change to the text; they are the next sprint's work |
| Part 21 §21.3.1 | — | new column `platform_user.temp_password_tenant_id` (FK `platform_tenant`, NULL, `ON DELETE SET NULL`), migration `platform.0008` | Register the column (see below) |

**Security defects found in the same area and fixed with this change** (code, not
specification — listed so the chapter's §19 can absorb the rules):

1. **Admin → owner escalation.** `POST /invitations` accepted `role: "owner"`; an admin could
   invite an address they control and accept it. Now a `validation_error` on `role`.
2. **Cross-tenant account takeover via "New password".** A person added to a *second* business
   before choosing their own password still has `must_change_password` set, and
   `POST /members/{id}/credentials` from that second business minted a password, showed it,
   and let it sign in as them — into the first business too. Only the business recorded in
   `temp_password_tenant` may reissue; legacy rows (NULL) may be reissued only where no other
   live membership exists.
3. **Raw invitation token in the logs.** `POST /invitations/{token}/accept` carries the token
   in the path, which `AccessLogMiddleware` and `runserver` both logged. The path is scrubbed
   at source and by a `SecretPathFilter` on every handler (including `django.server`).
4. **Invited rows are inert by construction.** `permissions_for()` now returns the empty set
   for any non-`active` membership, as a second lock behind `tenancy`, which already admitted
   `active` only.

Part 43 in the Claude project is the authoritative register and needs the same entry (this
file is a local carry).

## CR-2026-09-24-A — a write-off is neither "You gave" nor "You got" in any total

**State:** `raised` (implemented; awaiting registration in Part 43). **Target:** Part 17-02
LED-01 (khata header, PTY-03 §14 summary), LED-04 FR-1, §7.2, §8, §14, BR-5; LED-11 FR-4;
Part 22 §22.5 (`meta.summary`, statement `totals`). **Gate:** immediate — QA found the
screens contradicting LED-11 §8.

**Observed.** After a write-off the khata read "You got in all ₹930.00" — a figure that
included the written-off amount — over a row labelled "Written off" — and no money had been received. A
payable write-off inflated "You gave in all" the same way; the statement's "You got" tile and
its printed summary line did too. Both summaries summed every `credit`/`debit`, and a
write-off is a credit (receivable forgiven) or a debit (payable forgiven).

**Why that is wrong.** LED-11 BR-3 keeps write-offs out of every "collections" total, §8
paints them "neither gave nor got", PTY-04 BR-5 calls them "a P&L event, not a cash event",
and RPT-06/RPT-01 report them as their own line ("Bad debts written off", "Write-offs this
period"). The row already said so (`entryAmountView` → "Written off", neutral); the totals
above it did not.

**Decision.**

1. Every gave/got total the ledger reports is split into **three mutually exclusive
   buckets over one set of rows**: `debit` = Σ debit rows with `entry_type ≠ 'write_off'`
   ("You gave"), `credit` = the same for credit ("You got"), and
   `written_off { debit, credit }` = the write-off rows by direction (`credit` = receivable
   forgiven, `debit` = payable forgiven). Split rather than netted, because a party that is
   both customer and supplier can carry one of each and a single signed figure would need a
   label the client cannot choose.
2. **Arithmetic integrity is preserved and made visible**:
   `brought forward + gave − got + written_off.debit − written_off.credit = closing`. The
   closing figure, the running balance and `parties_party.balance` are untouched, so LED-04
   BR-3 (unbounded closing = party balance) holds by construction.
3. **CR-125 holds**: the server carries components only — no `net_change`, no net
   written-off — and the client subtracts.
4. **Classification is by the row's own `entry_type`.** A correction's replacement keeps
   `write_off` (LED-11 BR-4) and stays in the bucket; a reversal row is `entry_type =
   'reversal'`, out of every live total with its original (canon §0.2), and — with
   corrections shown on a statement — sits in gave/got like every reversal, i.e. in the
   column it is printed in.
5. **Opening entries are unchanged**: an `opening` debit counts in "You gave" and an
   `opening` credit in "You got", as since LED-02. LED-02 says nothing to the contrary; the
   row itself is labelled "They owe me" / "I owe them".
6. **Presentation**: a "Written off" figure appears only when non-zero — as a full-width
   third line under the khata's two-cell "You gave in all / You got in all" row, as a fifth
   `UbStatCard` in the statement strip, and as a fifth figure on the printed summary line.
   Neutral tone (LED-11 §8). When both directions are non-zero each says which ("to get" /
   "to give"). Copy: `ledger.timeline.writtenOff`, `ledger.statement.writtenOff` (ICU
   `select` on `side`), en + hi.
7. **Rows stay where they are.** On the printed table and in the CSV a write-off's amount
   stays in its direction's column, so an accountant can still add the columns down
   (BR-8's columns are a contract; `entry_type` = `write_off` distinguishes the row). The
   printed Particulars now reads "Write-off · {reason}" so the "You got" column never shows a
   bare reason that reads like a payment, and the reason is no longer printed twice (it is
   also the note, PTY-04 FR-3). The CSV has no totals row, so nothing else changes there.
8. **Aging is unchanged and already right**: a write-off credit is on the paid side of the
   FIFO CTE and retires the oldest debit first (test added).

**API (additive; no key removed or renamed).**
- `GET /parties/{id}/ledger-entries` first page `meta.summary`:
  `{ total_debit, total_credit, written_off: { debit, credit }, entry_count }`.
- `GET /parties/{id}/statement` `data.totals`: `{ debit, credit, written_off: { debit, credit } }`.
- Semantics note: `total_debit`/`total_credit` and `totals.debit`/`totals.credit` now
  EXCLUDE write-offs. A consumer that derived a net as `debit − credit` must add
  `written_off.debit − written_off.credit`; the only consumer, this frontend, never did
  (it reads `closing_balance`), and ships in the same change. `written_off` is always
  present (zeros when none).

**Amendments requested.** LED-04 FR-1/§7.2: the strip and summary line gain "Written off"
(when non-zero); §14 `totals` gains `written_off`; BR-5 "debit_total, credit_total exclude
`write_off` rows, which are reported as `written_off`". LED-01/PTY-03 §14 summary gains
`written_off`. Part 22 §22.5 both shapes. Part 43 in the Claude project is the authoritative
register and needs the same entry (this file is a local carry).

## CR-2026-09-24-B — an opening balance is dated today by default, not at the year start (UAT D6)

**State:** `raised` (implemented; awaiting registration in Part 43). **Target:** Part 17-02
LED-02 FR-1 ("`as_of` date (default first day of current FY, ≤ today)") and §7's
`OpeningBalanceSection` chips; Part 17-01 PTY-01 FR-9 (which delegates to LED-02). **Gate:**
immediate — UAT D6, P2.

**Observed.** A merchant adds a customer on 24 September and types the ₹2,300 they already
owe. The as-of date defaults to 1 April, so the opening entry is dated 1 April; aging counts
it from that date (LED-02 FR-7, LED-09 BR-4, FIFO by `entry_date`), and on day one the whole
balance sits in **90+ days** — on the aging report and in every "overdue" reading of it —
while the party list's Overdue chip (a collection date that has passed) is empty. Two screens
disagree about the same customer, and the alarming one is wrong.

**Why the FRD chose the year start, and why it does not hold.** US-LED-02-1 is a merchant
migrating a paper book "as of 1 April" — on that one day of the year the default and the
truth coincide, and `ub.ledger.opening_posted.as_of_is_fy_start` measures it. On the other
364 the default asserts an age the merchant never gave, and it fails in the costly
direction: an overstated age is a collection call nobody owed and a 90+ bucket polluted by
every new customer, which destroys the one signal aging exists to give. An understated age
is recoverable — it ages honestly from today, and the merchant can say otherwise. The
drawer's own comment argued the opposite ("an opening dated today is indistinguishable from
an ordinary entry") and that premise is no longer true: the row carries the Opening badge and
the "They owe me / I owe them" label (LED-02 §7) whatever its date.

Option (b) — keep the year start and have aging treat an opening's age differently — is
rejected: aging is FIFO by `entry_date` (LED-09 BR-2/BR-4), and a second age rule for one
entry type is a second definition of "how old is this money".

**Decision (BA).** Option (a):

1. The as-of date **defaults to today** (the tenant's today in the khata drawer, whose `max`
   it already is; the device's today in the party form, matching that form's existing
   `max`).
2. The field stays editable (≤ today, ≥ 2000-01-01, unchanged), and the **year start stays
   one tap away** as the first quick-choice chip ("FY start" / "Year start").
3. A hint under the field asks the question only the merchant can answer: **"When did they
   start owing this?"** — or "When did you start owing this?" when the direction is "I owe
   them". Copy: `ledger.opening.asOf.hint`, `parties.form.opening.asOf.hint` (ICU `select`
   on `direction`), en + hi ("उन पर / आप पर यह कब से बाकी है?").
4. **Unchanged:** the server (no default there — `as_of` is required on the drawer path and
   the party form always sends one), aging, and the CSV importer's EC-7 default (tenant FY
   start for an empty `opening_date`). The importer is the one path that really is the
   migrating merchant FR-1 describes; whether it should follow is left to IMP-01's owner.

**Amendments requested.** LED-02 FR-1: "`as_of` date (default **today**, ≤ today), with a
quick choice for the first day of the current FY and the hint 'When did they start owing
this?'". §7: chips "FY start" / "Today" keep their order. §17's
`as_of_is_fy_start` stays meaningful (it now measures how often the chip is chosen).

**Files.** `frontend/src/modules/DigiKhaato/features/ledger/components/OpeningBalanceDrawer.tsx`,
`frontend/src/modules/DigiKhaato/features/parties/components/PartyFormDrawer.tsx` (default,
one `useWatch`, the hint — nothing else), both locale files, and a test in each component's
suite.

## CR-2026-09-24-C — CR-027 implemented: `running_balance` and `source` on the timeline rows

**State:** `raised` (CR-027 is Accepted in Part 43; this records how it was built and three
decisions the FRD leaves open). **Target:** Part 17-01 PTY-03 FR-5/FR-6/BR-1–BR-3/§14,
Part 22 §22.5. **Gate:** none — additive.

**API (additive).** Every row of `GET /parties/{id}/ledger-entries` and
`GET /ledger-entries?party=` now carries `running_balance` (decimal string, the balance
AFTER the row, signed debit-positive exactly as the statement's) and `source` (`null` for a
manual row; `{type, id, number: null, url: null}` otherwise — the statement's shape, from one
shared function). The 201 of a create, the 200 of a reverse/correct and the detail read do
NOT carry `running_balance`: one row out of its ordering has none, and the client refetches
the timeline after every write (NEW-2).

**Decision 1 — struck-through rows contribute zero and carry the balance as it stood**
(not `null`). With `include_reversed=true` both halves of each reversal pair come back; each
contributes nothing (canon §0.2) and shows the running balance at its position. This is the
only rule under which PTY-03 BR-3 / T-PTY-03-15 hold ("Show corrections" changes no displayed
running balance) AND BR-1 holds when the newest row is itself a reversal.

**Decision 2 — the window runs newest-first, plus a carried scalar.** FR-6 writes the
window ascending; that is the definition, and the figure equals it (a Python replay asserts
every row). Computed literally on a page served newest-first, Postgres reads and sorts every
row the party has to show twenty-five — `tests/performance/test_two_thousand_party_book.py
::test_the_timeline_page_walks_the_party_date_index` caught that plan on the first attempt.
So `running_balance(r) = carried − Σ(page rows from the top through r) + own(r)`, where
`carried` is the live total at or older than the page's top: on page one it is read off the
`meta.summary` aggregate the response already makes (no new query); on later pages it is one
SUM over the rows older than the cursor, in the query the summary would have been. Page two
without it is wrong by everything scrolled past — LED-04's `carried_forward` trap on the
other cursor direction — and a test pages two rows at a time across a run of equal dates.

**Decision 3 — a constraint for PTY-03 FR-7.** Its `date_from`/`date_to`/`type` filters are
not built. When they are, each must be applied to BOTH the page and the carried sum, or be
expressed as a zero contribution the way `include_reversed` is; applied to the page alone they
would silently rebase every balance. Written into `with_running_balance`'s docstring.

**Divergence recorded, not changed.** LED-04's statement with `include_corrections=true`
sums both halves of a pair inside its window: the closing is right (the pair nets to zero),
but a row posted between the original and its reversal reads a figure that includes the
struck original. The timeline and the statement therefore disagree on such a row while
corrections are shown. LED-04 should adopt Decision 1; left for its owner.

**Not built.** CR-027's `format=csv` on this endpoint — the statement's CSV
(`/parties/{id}/statement?format=csv`) already exports the same rows with running balances,
and a second export of one book is a second audit trail to keep equal.

## CR-2026-09-24-T1-A — who may READ settings: `platform.audit.read` as the gate

PLT-06 §6 gives settings read to owner, admin and accountant, and edit to owner and admin,
but Part 20 §20.5 names no codename for "read settings". Rather than mint one (the registry
is closed and a new codename is a migration of every role's grant), the read gate is "may
edit settings OR holds `platform.audit.read`" — exactly the three roles FRD §6 names,
because `platform.audit.read` is held by owner, admin and accountant and by no staff role.
The sidebar's Settings item is gated on `platform.audit.read` for the same reason (it was
`parties.party.read`, which every staff member holds). Edit (`may_edit_settings`) is
`platform.tenant.manage` or an active owner/admin role — admin lacks `tenant.manage` by
design (canon §0.9) but FRD §6 gives admin the edit; branding edit is
`platform.branding.manage`.

Requested against Part 20 §20.5.2 (one line naming the read rule) and Part 17-01 PLT-06 §6.

## CR-2026-09-24-T1-B — revoking ONE own device is effective at the next refresh, not at once

PLT-09 FR-4 says a revoked session "is signed out immediately". A single-session revoke
marks its refresh family revoked; the device's access token (≤15 min) stays valid until it
next refreshes, and the refresh is refused. Making it immediate needs a per-request session
lookup on every authenticated call (the access token carries no session id today), which is
a hot-path query this feature cannot justify alone. The two cases that matter most ARE
immediate: "Log out everywhere" bumps `token_epoch`, and a manager's "log out their devices"
bumps `permissions_version`, both of which every request already checks.

Requested against Part 17-01 PLT-09 FR-4 / AC-2: "within 15 minutes, and at once for
log-out-everywhere and for a manager's revoke".

## CR-2026-09-24-T1-C — settings shapes as built, and reminder templates stay single-brace

The settings catalogue (`apps/platform_app/settings_schema.py`) stores every value as a small
JSON object with `schema_version`, and PLT-06 §14's key list is implemented with three
changes the FRD should adopt:

- `ledger.reminder_templates` keeps the seeded flat `{en, hi}` shape with `{amount}`-style
  single-brace placeholders (`party_name`, `business_name`, `amount`, `due_date`,
  `upi_link`; `{amount}` required; ≤500 chars; `{{…}}` refused). The FRD's
  `manual/auto_d1/auto_d0` × `{{placeholder}}` shape would break the seeded rows and LED-08
  (T2), which already reads the flat shape. Per-schedule templates are LED-08's to add, as
  new keys.
- `ledger.auto_sms` and `ledger.party_sms_on_entry` are stored and validated but have no
  switch on screen: nothing sends SMS (DEC-010/adapter-only), and a switch that does
  nothing is the "unbuilt feature" rule broken.
- Documents/numbering, stock and party-label settings are served and saved by the API but
  not on the Settings screen yet, because no screen consumes them (sales, inventory and the
  party labels are other tracks' work). Numbering refuses a backwards `next_number` with
  409 `sequence_backwards`.

Optimistic concurrency is an `ETag` on `GET` and a required `If-Match` on `PUT`
(412 `precondition_failed` when stale) — PLT-06 FR-9's "last write wins with a warning" is
replaced by refusal, because two owners editing templates at once otherwise silently lose one.

Requested against Part 17-01 PLT-06 §14 and Part 21 (tenant.settings shape).

## CR-2026-09-24-T1-D — settings pages live under `/settings/*`

PLT-08 names `/activity` and PLT-09 `/profile/devices`. They are built as
`/settings/activity` and `/settings/devices` (with `/settings/profile` and
`/settings/branding`), so the one Settings hub owns every tenant-administration screen and
the sidebar needs one item rather than three. Devices is also reachable from the account
menu for every role, because staff may manage their own sessions and do not see Settings.

Requested against Part 19 §19.6 (route table) and Part 17-01 PLT-08/PLT-09 §9.

## CR-2026-09-24-T1-E — module and GST-type guards are registries other apps fill

PLT-06 FR-6 (a module with data cannot be switched off, 409 `module_has_data`) and PLT-07
BR-4 (GST type locked once documents exist, 409 `gst_type_locked`) need counts from apps
platform may not import (Part 20 import matrix). `apps/platform_app/services/guards.py`
exposes `register_module_off_guard(module, counter)` and `register_gst_lock_counter(counter)`;
inventory (T3) and sales must register theirs in their `AppConfig.ready()`. Until they do,
the guards pass — correct today, since neither app has rows.

Requested against Part 20 §20.3 (the import matrix's sanctioned inversion pattern).

## CR-2026-09-24-T1-F — the FRD's contrast figure for the default blue is wrong

WLB-01 quotes `#2B6BE0` on white as "≈4.6:1". The WCAG 2.1 relative-luminance formula gives
4.90:1; tests pin 4.90 on both tiers. The server refuses a primary below 3:1 against white
(`low_contrast`, with `details.suggested_hex` — the nearest darker shade that passes, in 1%
lightness steps). Partner logo upload (WLB-02) is not built: it needs `files_attachment`
rows with no tenant, which is Part 43 CR-018 / C2 and still undecided.

Requested against Part 17-01 WLB-01 §8 and WLB-02 FR-3.
---

## CR-2026-09-24-INV-A — the stock log is ordered by ARRIVAL, one order for cache, rows and replay

**State:** `raised` (built; needs the schema owner's acceptance). **Target:** Part 21 §21.3.6
"The weighted-average costing rule" (1), (3), (4), (6), (7) and the `inventory_item_stock` /
`inventory_stock_movement` column lists (T-08); Part 17-03 §17.6.0 "Order is part of the rule"
and "Backdating and recomputation", INV-03 BR-4/§20, INV-06 BR-9/T-INV-06-3a, INV-07 EC-4,
INV-08 FR-2/BR-3; Part 20 §20.6.2. Resolves Part 41 BE-01 and Part 42's resolution of it.
**Gate:** before PUR-01 (the next writer of `post_movements`).

**The defect.** Part 41 BE-01: the incremental average was maintained in arrival order while
the replay ran in `(movement_date, created_at, id)` order, so the two diverged permanently on
the first backdated inbound. The corpus then resolved it the other way round — canonical
order `(movement_date, sequence_no)`, a backdated insert writes NULL running columns, marks
the cache `stale` and enqueues `inventory.recompute_item_cost`, which UPDATEs every later
row. That design has three problems for this build: the trigger must permit UPDATEs of the
running columns (the only immutable table in the product with a permitted rewrite of history
by a background job); a plain outbound's `unit_cost` snapshot (COGS, "frozen at issue") is
an immutable fact that the recompute cannot change, so after a backdated purchase the row's
COGS and the recomputed average at that row disagree anyway; and every valuation surface
needs a "recalculating" state and the drift job a stale-exclusion.

**Decision.** ONE order: `sequence_no`, the gap-free per-`(item, location)` arrival counter
already specified, allocated from `inventory_item_stock.last_sequence_no` under the stock-row
lock. The incremental step, every row's `avg_cost_after` / `on_hand_after` (NOT NULL, written
once), and `recalc_stock`'s replay all fold the same costing function over that order, so the
cache equals the replay by construction — a backdated movement is simply the next arrival.
Consequences, all built:

- No `cost_state`, no `cost_stale_since`, no `inventory.recompute_item_cost` job.
- `forbid_update_delete` on `inventory_stock_movement` refuses EVERY update and delete
  (its own function name — `ledger` 0002 already owns `forbid_update_delete()`).
- A void (PUR-04/SAL-05) posts reversal rows through the §21.3.6 (2) value-reversal cases,
  which are implemented in `costing.apply_weighted_average`; no unconditional recompute.
- `inventory_item_stock.max_movement_date` (new column) lets a row be labelled
  `is_backdated` on the wire (INV-03 "Backdated" badge) without any recomputation.
- Movement history lists newest ARRIVAL first (`sequence_no DESC`), cursor on `sequence_no`,
  so the running figures read consistently down the page; the date filter still filters by
  `movement_date`.
- INV-08 `as_of`: on-hand = `SUM(qty) WHERE movement_date ≤ as_of` (exact under any arrival
  order); average = `avg_cost_after` of the latest-ARRIVED movement dated ≤ `as_of`.

**The trade, stated plainly.** A backdated purchase changes the average from the moment it is
ENTERED onward, not retroactively for sales dated after it but entered before it. Those sales
keep the COGS they were issued at — which is what "COGS frozen at issue" already promised.
For a historical `as_of` inside a backdated window the average may include a cost that arrived
later but is dated after `as_of`; quantities are always exact. Tests:
`test_a_backdated_inbound_between_two_outbounds_matches_the_replay` (the BE-01 fixture) and a
10,000-movement fuzzed book with random backdates, reversals and negatives at zero drift.

**Also in this change (INV-07).** FR-4's "compare against MAX(created_at) above the reorder
point" query is replaced by the stored crossing state Part 32 §32.9.4 asks for:
`inventory_item_stock.alert_level` ∈ `ok|low|out`, plus `inventory_low_stock_alert` (one row
per crossing). A notification is a transition to a WORSE level; a recovery re-arms silently.
Delivery goes through `register_low_stock_sink()` — the notifications track wires its inbox in
from its own `AppConfig.ready()`, so `inventory` never imports `notifications`.
## CR-2026-09-24-D — LED-05…LED-08 / NTF-01…NTF-03: what was built beside the FRDs

**State:** `raised`. **Target:** Part 17-02 LED-05/06/07/08, Part 17-05 NTF-01/02/03, Part 21
§21.3.4. **Gate:** none — additive; migrations `ledger 0005_reminder`,
`notifications 0002_inbox_and_templates`.

**Endpoints beside §14.** `POST /reminders/preview` returns the server-composed text without
writing a row, so a sheet opened and closed never reaches the log (FR-2 says "the tap" records).
`GET /reminders/due?bucket=today|overdue|upcoming` lists a bucket's parties with the summary's
own predicate; the party list's `collection=` chip is the one party source the client may page
(§32.6.7), so the reminders screen does not reuse it. `GET/PATCH /reminders/settings` is a narrow
writer for `ledger.auto_sms` and `ledger.party_sms_on_entry` until PLT-06's generic settings
endpoint owns those keys.

**Channel added: `sms_manual`.** §21.3.4 lists `sms` (a provider SMS). The merchant's own SMS
app via an `sms:` link is a different act with a different cost (none) and is logged as
`sms_manual`, so the Sent tab never claims a provider sent it.

**Rules decided.** A new collection date must be today or later, within 365 days, and on a
party who owes money (`collection_requires_receivable`, 409); an unchanged overdue date is
accepted so an unrelated edit is never refused. All three buckets require `balance > 0`. The
automated schedule runs at 09:00 IST as LED-07 FR-2 says (the `SCHEDULES` entry had 08:00).
The `reminder_due` inbox row is ONE row per tenant per day carrying the count and linking to
`/ledger/reminders?bucket=today`, not LED-05's one row per party: NTF-01's coalescing rule
(FR-6) and a bell reading "40" every morning pointed the same way. With no
SMS provider configured (`ConsoleSmsBackend` counts as none) an automated or entry SMS ends
`failed` / `skipped` with `channel_not_configured` and one `reminder_failed` inbox row — never
a green "sent".

**Client composition removed.** The khata's reminder text was composed on the device since
Sprint 3 (DEC-012). It is now the server's (NTF-03 BR-2), and "Send reminder" needs
`ledger.reminder.write` — sending writes a row, so the accountant no longer sees it.
`e2e/sprint3-qa.mjs` §A still asserts the old client-composed wording and should be re-pointed
at the preview text.

**Not built.** WhatsApp Business API sending (`whatsapp_api`, NTF-02) — no provider, per
ADR-021; recurring reminders (`kind=recurring`); per-party locale for message language (the
tenant's locale is used); the inbox's per-category mute settings.

## CR-2026-09-24-SAL-A — SAL-02/03/06/07/08: what was built beside the FRDs

**State:** `raised`. **Target:** Part 17-04 SAL-02/03/06/07/08, Part 20 §20.7.3 and §20.11.4,
Part 21 §21.3.7, Part 43 §43.4.6 C1. **Gate:** none — additive; migration
`sales 0001_add_sales_document`.

**Round-off range (BR-8 against itself).** BR-8 and §20.7.3 say `round(grand_raw, 0) − grand_raw`
half-up, and that the result lies in [−0.50, +0.49]. It doesn't: half-up sends ₹472.50 to ₹473,
a round-off of +0.50, so the formula's range is [−0.49, +0.50]. The engine follows the formula,
because the formula is what every Indian billing counter does. The shared fixture
`taxEngine.cases.json` has an "x.50 rounds up" case. §20.11.4's CHECK [−0.50, +0.50] admits the
formula's range, but migration 0001 does not declare it yet; it is a follow-up.
§20.7.3's stated range should be corrected; BE-14 in Part 41 flagged the neighbouring half of the
same mismatch.

**Columns beside §21.3.7.** `sales_document.round_off_enabled` records the round-off switch
(SAL-02 FR-12) per document, so that recomputing a draft on save gives back what the merchant
chose instead of the shop default as it stands today. `version` (optimistic concurrency, SAL-06
FR-6) and `meta` (JSON: the walk-in payment until PAY-01, the share link's expiry) are also added.
The item list row (`GET /items`) now carries `hsn_sac` and `tax_inclusive_selling`, so a picked
item fills the bill line without a second request.

**Share links use `sales_document.public_token_hash`.** C1 was decided on 23 Sep for a
generalised `parties_share_link` table, which no app has built yet. Sales therefore stores the
token's hash in the column §21.3.7 already declares, and puts the expiry in `meta.share_link`.
Regenerating a link replaces the hash, which revokes the old token (T-SAL03-6). The day the
generalised table lands, this becomes one migration and one resolver; the public URL shape
`/public/d/<token>` stays the same.

**Settings read with defaults, not registered.** `sales.round_off_default`,
`sales.default_due_days`, `sales.allow_free_text_lines`, `sales.require_hsn_b2b`,
`documents.terms` and `documents.show_upi_qr` (CR-SAL-2) are read through `services/settings.py` with the FRD's defaults. They are not added to PLT-06's
catalogue, because that is a shared table this track does not own.

**Error codes added.** `rule46_failed` (400: a hard Rule 46 failure at issue; `details.issues`
lists the blocks) and `upi_not_configured` (409: `/upi-intent` without a valid tenant VPA).
Share links on a draft reuse `document_not_shareable`.

**The QR encoder lives in `apps/common/qr.py`, not in payments.** The import matrix forbids
`sales → payments`, and SAL-03 needs the encoder at render time. `apps/common/upi.py` builds the
`upi://pay` string. `GET /payments/qr.svg` is a thin view over the same encoder, for PAY-03.

**Payment at issue: walk-in only (SAL-07), and a seam for PAY-01.** A walk-in bill must be paid
in full at issue (400 `validation_failed` on `payment`: "Walk-in sale must be paid in full").
Its `mode_breakup` is stored in `sales_document.meta.payment` and the document moves straight to `paid`. No `payments_payment`
row is written, because PAY-01 does not exist and sales may not import payments. A party bill
that includes a payment at issue is refused with a 400 until PAY-01 is in: a party bill issues
on credit to the khata, and part-payment is recorded from Payments later. `services/payment_seam.py`
is the one function PAY-01 replaces.

**Local drafts survive logout.** SAL-06 §19 asks for device drafts to be cleared on sign-out.
The existing `storage.clearLocalExceptDrafts` (logout and tenant switch) deliberately keeps the
draft namespace. Its keys are per tenant, so another shop on the same device never sees them, and
a bill lost to an accidental sign-out at the counter costs more than a stale draft does. This
track follows the code, not §19, and §19 should be amended to match.

**Not built.** Party payments at issue (PAY-01); the WhatsApp message-log row
(`notifications_message_log`, T-SAL03-8), because sales may not import notifications; the public
`/d/[token]` page render (the API answers, the page is still the stub); SAL-06 FR-5 duplicate;
the stale-draft flag; print copies (original/duplicate/triplicate); a separate `/print` route
(the detail page prints itself; the success sheet opens it with `?print=1`); void (SAL-05).
## CR-2026-09-28-SAL-B — SAL-01/04/05: estimates, credit notes and void, beside the FRDs

**State:** `raised`. **Target:** Part 17-04 SAL-01, SAL-04, SAL-05; Part 21 §21.3.7; Part 20
§20.1.4 (the payments seam); canon §0.9 (staff role). **Gate:** none — additive; migration
`sales 0002_estimates_credit_notes`.

**Columns beside §21.3.7.** `valid_until`, `against_id`, `converted_to_id` and
`converted_from_id` are §21.3.7's. Added beside it: `sales_document_line.against_line_id`
(a credit-note line → the invoice line it returns), because the cap and the `returned_qty`
cache are per LINE — an invoice can carry the same item twice at two prices — and
`IX(tenant_id, against_id)` (CR-SAL-3's optional index). `sales_credit_application` is Part
21 §21.3.9's decided table with `U(credit_note_id, invoice_id)`; a second application of the
same pair adds to `amount`. `converted_to` / `converted_from` are `SET NULL`, so discarding a
converted DRAFT invoice frees the estimate to be converted again (the EC-9 relaxation of BR-6
extends to a discarded draft as well as a voided invoice).

**Where FR-12's reason lives.** In `meta.reason = {code, note}`, not prefixed into `notes`:
`notes` prints, and "sales_return: two bottles leaked" on a customer's copy is a database
code on paper. `restock`, `settlement` and the requested refund are in `meta` for the same
no-column reason.

**The payments seam.** `sales` may not import `payments`, and PAY-01 lands in parallel. Two
functions are the whole of it and PAY-01 replaces their bodies, keeping callers and shapes:
`services/refund_seam.record_refund` (a credit note's refund: the breakup in `meta.refund`,
`amount_paid` as the cache, and the `payment_out` ledger debit BR-4 needs — to become
`record_payment(direction='out')` allocated to the note) and `services/void_seam.
release_invoice_payments` (SAL-05 FR-6 — today only a walk-in bill holds money, reported with
`walk_in: true`; PAY-01 deletes the invoice's `payments_allocation` rows and reports each
payment). Consequence stated plainly: until PAY-05 can void a refund, a refunded credit note
cannot be voided (FR-10's rule, with no way yet to satisfy it). `services/amounts.
refresh_invoice_amounts(invoice, amount_paid=…)` is the one recompute of `amount_due` and
status from `grand_total − amount_paid − Σ applications` (BR-9); PAY-01's allocation should
call it rather than keep a second formula.

**Void of an invoice with credit notes.** FR-3 blocks while a non-void note stands AGAINST the
invoice. Credit applied to it from OTHER notes (via `/apply`) is released back to those notes
as open credit (BR-5), and the response's `meta.released_credit` names them.

**Estimate status moves** are `POST …/mark-sent | mark-accepted | mark-rejected` (CR-SAL-1).
Accept and reject start from `sent` only; `convert` from `sent | accepted | expired`. A second
conversion is 409 `document_not_draft` "Estimate already converted". Expiry is the job
`sales.expire_estimates` at 00:20 IST, by each tenant's own date, one `estimate.expired` audit
row per estimate.

**Staff hold `sales.credit_note.write`.** SAL-04 §12 and T-SAL04-10 give it to staff "per canon
role"; the role table had omitted it. Void stays `sales.invoice.void` (owner, admin).

**Not built, with reasons.** A standalone credit note in the UI (the API does it — FR-3 — but
every counter return starts from a bill, and a party-and-lines editor for goodwill notes is a
second editor); credit-note drafts in the UI (the return editor issues in one request with an
Idempotency-Key; the API keeps drafts); "Duplicate & edit" (SAL-06 FR-5, not built for
invoices either); the notification/SMS templates (NTF owns them); analytics events; restock or
reversal onto an ARCHIVED item (`inventory.post_movements` refuses archived items and this track
does not change the inventory writer — SAL-04 EC-2 / SAL-05 EC-1 surface as 409
`item_archived`); the previous-FY warning for a void (SAL-05 EC-5).
## CR-2026-09-24-IMP-A — IMP-01 / PTY-10 / INV-09 / IMP-02: what was built beside the FRDs

**State:** `raised`. **Target:** Part 17-01 PTY-10, Part 17-03 IMP-01/IMP-02/INV-09, Part 21
§21.3.11, Part 22 §22.11/§22.12. **Gate:** none — additive; migrations `imports 0001_initial`,
`reports 0001_initial`.

**PTY-10 disagrees with IMP-01, and IMP-01 was followed.** PTY-10 was written before the import
framework and specifies (a) a `duplicate_mode` of skip/update for a mobile already in the book,
(b) a commit chunked into 200-row transactions that is "not all-or-nothing" (BR-7), and (c) a
column-mapping screen with `PATCH /imports/{id} {column_map}`. IMP-01 says create-only (BR-3,
EC-6: a re-upload reports the first import's rows as duplicates), one transaction (BR-1), and no
mapping step. The sprint's exit criteria — "committing twice creates no duplicates; a cancelled
import leaves no partial data" — and TSK-PTY-10-02/03 are written against IMP-01, so an existing
mobile is the row error `duplicate_existing`, the commit is all-or-nothing, and headers are
matched after case/space folding and through a synonym list (`Party Name`, `Phone`,
`Outstanding`, `नाम` …). PTY-10 should be amended to cite IMP-01 for all three, and the upsert
mode left to IMP-03 where Part 17-03 already puts it.

**`imports_job` carries no configuration column.** CCR-17's `options` and CR-036's `column_map`
are both blocked behind Part 43 §43.4.6 C5; nothing the MVP builds needs either, so neither
exists. The error file is a `files_attachment` (`owner_type='imports_job_errors'`) found by owner
rather than CCR-17's `error_file_attachment_id`, for the same reason.

**Traceability without `source_type='import'`.** IMP-01 BR-8 and INV-09 BR-5 ask for ledger
entries and stock movements with `source_type='import', source_id=job.id`. `import` is not a
value of either `SourceType`/`MovementSource` enum and adding one is a change to two other
apps' vocabularies; the importers call `create_party()` / `create_item()` unchanged instead, so
openings post as `manual` / `item` exactly as the drawers do (BR-6: "every rule, cache update
and audit row is identical to a manual create"). The job is recorded on EVERY audit row the
commit writes — `metadata.import_job_id`, `via='import'`, `batch`, `runner` — through
`Ctx.audit_meta`, which satisfies AC-8 and is what a support query starts from. The ledger
row's own `metadata.via` still reads `party_create`, because `create_party` names its caller
there; the `import_job_id` beside it is the discriminator.

**Permissions are the kind's codenames (IMP-01 §12), so staff may import parties.** PTY-10 §12
excludes staff "entirely at MVP", but staff hold `parties.party.write` and `ledger.entry.write`
by default, and IMP-01 introduces no codename. Excluding them would be a role check; the
precedent (LED-03, CR-124) is that an ordinary capability is a codename check and only a
business ceiling is a role check. Decide which PTY-10 means.

**Exports: one pipeline, not an `ExporterSpec` registry.** IMP-02 FR-2 specifies a resource
registry with filtersets in `imports/exporters`. Built instead: `CsvExportMixin` in
`apps/common/exports.py`, which the party, item and expense list viewsets use, and whose
`export_queryset()` is the SAME method the JSON list pages over — so BR-1 ("the file is the
screen") holds by construction, and the >5,000-row job replays that method on a synthetic
request carrying the stored query string. `reports_export` is in the `reports` app (its table
prefix) with CR-098's accepted columns. Stored exports are read at `GET /reports/exports/{id}`
(§22.11, which PLT-08/PLT-10 already name) and downloaded at `/reports/exports/{id}/download`,
not CCR-20's `/exports/{id}` — one address per object until CCR-20 is decided. Not built: XLSX
(ADR-021/023 undecided), the column chooser (FR-5), the totals row (FR-10 — it breaks a paste
into a pivot and a re-import), export history (FR-9) and cancel (FR-12). Dates in export files
are dd/mm/yyyy (TSK-IMP-02-05) rather than FR-4's ISO, matching the statement CSV and what the
importer reads back.

**Not built, with reasons.** Import history UI (`GET /imports` exists); FR-12's reaper as a
scheduler tick — a job stuck `validating` > 10 min or `importing` > 30 min is marked
`interrupted` when it is next READ, and a runner that dies mid-commit is re-queued once by the
platform reaper, whose transaction the database has already rolled back; the 30-day purge of
import files (a cancelled job's file IS deleted); progress during the commit (EC-14 accepts an
indeterminate bar — the transaction's writes are not visible until it commits); the
`opening_stock` kind (INV-05's own feature).

**Outside this track's apps, fixed because the look could not run without it.**
`run_scheduler` logged `extra={"created": n}`; `created` is a reserved `LogRecord`
attribute, so with `ub.jobs` at INFO (local settings) the runner died with KeyError on the
first tick that materialised a schedule — on a fresh database, the very first tick — and no
`platform_job` ran. One-word rename plus a test at INFO. Noted, not fixed: the loop has no
per-tick error handling, so any transient database error (a cancelled statement, a
connection timeout under load) also ends the process; deployment's cron restart covers it,
a native `dev-backend.sh` session does not.
## CR-2026-09-24-W2C-A — PLT-10 as built: password re-verification, the export as a job, the registry

**Re-verification is the owner's password, not an OTP.** PLT-10 FR-3 and §14 require
`{challenge_id, code}` from a fresh `purpose='verify'` OTP. DEC-010 removed the OTP identity,
so `POST /tenants/current/delete-request` takes `{password, confirm_name, reason?}`. A wrong
password or a mismatched name is 400 `validation_error` on the field — never 401, which the
client's refresh interceptor would read as an expired session. The endpoint has its own
throttle scope, `reverify` (10/hour per user), because it is a password oracle for anyone
holding a stolen session.

**The export is a `platform_job`, not a `reports_export` row.** RPT-08 has not built
`reports_export`, so the job's `result` carries `storage_key`, `row_counts`, `size_bytes` and
`expires_at` (7 days; 30 for the final export the deletion job makes, BR-4). Endpoints:
`POST /tenants/current/export` (202), `GET /tenants/current/exports`,
`GET /tenants/current/exports/{id}` and `GET /tenants/current/exports/{id}/download` instead of
FR-2's `GET /reports/exports/{id}` and a signed URL — the download is an owner-only,
tenant-checked, cross-site-refusing GET, which is what the signed URL was for. When
`reports_export` lands the row moves and the four paths stay. The bundle is not stored as a
`files_attachment` (`kind='export_file'`) either: deletion removes every attachment, and the
retention copy must survive it. Three exports a day per tenant answer 429 `rate_limited`.

**`GET /tenants/current/deletion`** is new: the page's whole state (status, `scheduled_for`,
`export_fresh`, the latest export, the name to type) in one read. `/auth/me`'s
`active_tenant` gains `deletion_scheduled_for` for the shell's banner.

**The export gate reads the audit log.** "A fresh export exists" (FRD §10, EC-3) = a
succeeded, unexpired export that finished after the newest audit row that is not itself
about exporting, deleting, auth or support access. EC-6 (a tenant with no rows passes
trivially with a synchronous empty export) is not built: such a tenant takes one export.

**Read-only during the cool-off** is enforced in `CookieOrBearerJWTAuthentication`, not per
view: every unsafe method answers 409 `tenant_pending_deletion` except export, delete-cancel,
`/auth/*`, `/support/*` and notification reads.

**Tables are declared per app** in `apps/<app>/tenant_data.py` (`apps.common.tenant_data`
registry); the export writes one CSV per registered table with an `export_name`, and the
deletion order is computed from the models' own foreign keys. The file list therefore
exceeds FR-1's (tags, units, locations, categories, item stock, adjustments, expense
categories, templates, tax rates, invitations, roles, attachments.csv); `sales_*`,
`purchase_*`, `payments.csv` and `payment_allocations.csv` appear when those apps register.
An installed tenant-FK model that nobody registered stops the deletion job before it removes
anything (`sales`, `purchases`, `payments`, `imports`, `reports` are on a named pending list
so the architecture test tolerates a merge that lands models first).

**Deletion keeps** the tenant row as a tombstone (personal fields blanked, name
"Deleted business", `status='deleted'`, GSTIN freed), anonymised audit rows (actor, before,
after and metadata removed; one un-anonymised `tenant.deleted` row with per-table counts),
the export and deletion job rows, and every user account (memberships go; users are CCR-10's
`DELETE /auth/me`, not built here). The append-only triggers on `ledger_entry` and
`inventory_stock_movement` are disabled by name inside the one transaction that deletes that
table's rows, as ledger migration 0002 anticipated.

**Not built:** `DELETE /auth/me` (CCR-10), `POST /parties/{id}/erase` (CCR-11), the privacy
notice page (FR-9), consent capture at sign-up (FR-10), `export_affected_principals` (FR-11),
the SMS to owners (no provider), per-session banner dismissal.

Requested against Part 17-01 PLT-10 FR-1/FR-2/FR-3/§14, Part 22 §22.3.

## CR-2026-09-24-W2C-B — PLT-14 as built, and a contradiction: support sessions are READ-ONLY

**Contradiction.** PLT-14 FR-5 allows writes under impersonation ("needed to reproduce
fixes") except deletion, ownership and bank details. Part 20 §20.4.8 rule 5 says support
access is read-only, and the permission classes shipped in Sprint 1 already enforce rule 5.
Built to Part 20 (the stricter, already-enforced rule); FR-5's forbidden list is enforced as
well (403 `impersonation_forbidden` for `/admin/*` except `/admin/impersonation/end`,
switch-tenant, delete-request/cancel, the full export, support decisions, members,
memberships, invitations, password and sessions, and `bank_details`/`upi_vpa`/`pan` on
`PATCH /tenants/current`). `Ctx.from_request` already stamps `metadata.impersonation=true`
for the day rule 5 is relaxed. The owning chapter must choose; until it does, a support
session reads.

**Consent** is a new table, `platform_support_access` (requested → granted/denied/revoked/
expired, 24 h either way), instead of FR-5's "a `notifications_notification` accepted by an
owner whose audit row id is the consent_id": a notification row is broadcast read state, not
a decision with an actor and an expiry. Its id is the `consent_id`. Owner endpoints
`GET /support/access-requests` and `POST /support/access-requests/{id}/allow|deny|revoke`
(CCR-12's allow/deny plus revoke, which also ends a live session). The owner answers on
Settings → Your data; the inbox row links there.

**Sessions** are `platform_impersonation_session`: the token's `imp` claim is the session id
(not the tenant id §20.4.8 sketches), the row stores `sha256(jti)` and never the token, and
the tenancy layer re-checks row, consent and jti on every request, so ending or revoking cuts
the token at once. Lifetime `min(60 min, consent expiry)`, no refresh token; when it lapses the
client's refresh restores the operator's own session. `POST /admin/impersonation/end` swaps the
access cookie back.

**Health** (FR-7): the scheduler touches one `platform_job` row (`scheduled_key =
'platform.heartbeat'`, status `succeeded`, never claimed) every 30 s; red after 120 s.
`otp_backend`/`sms_backend` are replaced by `email_backend` (DEC-010).

**Other deltas.** `GET /admin/overview` is new (the console's status tiles). Owner search is
by EMAIL (FR-2 said owner mobile; DEC-010). `entitlement_overrides` accepts only
`max_users` and `storage_mb` (DEC-001) and is stored as `plan.overrides.limits`, the shape
`entitlements.for_tenant` reads. Usage columns are live subqueries, not FRD §20's nightly
`reports_snapshot` — switch when tenant count makes the list slow. `UB_SUPER_ADMIN_MOBILES` is
not consulted: identity is email and `platform_user.is_super_admin` is the gate. Suspension
still resolves no tenant (403 `no_active_tenant`) rather than FR-3's `tenant_suspended`.

**Not built:** partner and plan create/edit (`POST/PATCH /admin/partners|plans`, WLB-02's form
— Django admin at MVP), `/admin/users`, `/admin/audit-logs`, MFA.

Requested against Part 17-01 PLT-14 FR-2…FR-8, Part 20 §20.4.8, Part 22 §22.13.

## CR-2026-09-25-PAY-A — PAY-01…05 and LED-10: what was built beside the FRDs

**State:** `raised`. **Target:** Part 17-02 PAY-01…PAY-05 and LED-10, Part 21 §21.3.9, Part 22
§22.9, CR-2026-09-24-SAL-A. **Gate:** migrations `payments 0001_initial`,
`payments 0002_money_invariants` (a CHECK over `mode_breakup` through an immutable SQL
function, and a deferred constraint trigger for Σ allocations ≤ amount).

**LED-10's service exists and the two stand-ins call it.** `ledger/services/postings.py`
(`post_source_entry`, `reverse_source_entries`) replaces the bodies of
`sales/services/ledger_link.post_invoice_debit` and `expenses/services/ledger_link.post_expense_payable`.
It returns `(entry, balance)` rather than FR-1's bare `LedgerEntry`, because every caller needs
the balance the posting produced. `reverse_source_entries` returns `(reversals, balance)`.
`resolve_sources` is a registry each document app fills in `ready()` — the ledger may not import
sales, payments or expenses — so `source` on the timeline and statement now carries `number`,
`status` and `kind`; `url` stays null and the client routes by `type`.

**The allocation target is an interface.** `payments/services/targets/` holds a protocol and a
registry; the sales invoice target is registered by `PaymentsConfig.ready()`, and PUR-02 adds a
purchase-bill target (direction `out`) beside it. A target MOVES a bill's caches by the allocated
amount (`amount_paid ± a`, `amount_due ∓ a`) rather than recomputing `grand_total − paid −
credits`, so SAL-04's credit applications survive a payment and a void without payments knowing
about them. Status is recomputed by rule after every move, and `overdue` is decided at once
(BR-4) rather than by the nightly job.

**Walk-in bills hold `amount_due` at 0.** `ck_sales_document_walk_in_paid` (an issued walk-in bill
is never a receivable) is a CHECK and cannot be deferred, and a walk-in payment is recorded
against an already-issued bill. So a walk-in bill's `amount_due` stays 0 and what it can still take
is `grand_total − amount_paid`. PAY-05 FR-5's walk-in void therefore leaves the bill `issued` with
`amount_paid = 0` and `amount_due = 0`, not `amount_due = grand_total` as FR-5 says.

**`payment_out` lines carry no mode.** BR-6 says the ledger entry carries `payment_mode =
primary_mode`; `ck_ledger_entry_debit_has_no_mode` forbids a mode on any debit, and a payment out
is a debit. Money in carries its mode (and UPI app) as FR-6 says; money out keeps its modes on
the payment row only.

**`mode_breakup` lines may carry `upi_app`.** PAY-02 §19 whitelists `mode`, `amount`, `reference`;
the flattened UPI chips the ledger and expenses already use ("PhonePe kiya") write the app too,
so the whitelist is those three plus `upi_app` (UPI lines only). The primary UPI line's app is
copied onto the ledger credit.

**Void does not refuse an archived party** (EC-5), unlike EXP-01's expense void, which does.

**Party payments at issue are in** (closing CR-2026-09-24-SAL-A's refusal). The invoice is written
issued-with-nothing-paid, its debit posted, then `record_payment` allocates up to the grand total
and keeps the rest as advance; the khata shows the bill and the receipt as two lines (LED-10
BR-4). `meta.payment` is still written (with `payment_id` and `number`) because the printed invoice
reads it. The editor now opens the payment sheet for a party bill too, with "Full credit" beside
the confirm (SAL-07 §9's state table) — one more tap for a pure credit sale.

**API additions.** `GET /payments/open-documents?party_id&direction` (the allocation panel's rows,
from the target registry, instead of FR-2's `GET /sales/invoices?...`, so the panel works for
purchase bills unchanged); `POST /payments/{id}/share` → `{text, mobile}` (PAY-04 BR-4's
server-rendered text, audited `payment.receipt_shared`, under `payments.payment.write`);
`POST /payments/upi-intent {amount?, party_id?, note?}` → `{upi_url, amount, vpa, payee, qr}`
(QR as module rows, the shape SAL-03's `UbQrCode` already draws, not FR-6's `{path, modules}`);
`GET /payments/{id}` carries `business` (the receipt's header band) and `party_balance_after`
(every ledger row up to this payment's, reversed rows included, so a later void does not rewrite
history). Invoice detail carries `payments[]`.

**Not built.** Share LINKS and the public `/d/<token>` receipt page (they need
`parties_share_link`, and the public page is still a stub — the share text omits the link line);
the receipt SMS and the void SMS (FR-6, BR-5/BR-7); the thermal-80 receipt template (A5 only);
auto-print after save (`payments.auto_print_receipt`); the in-app owner notifications (§17);
the cashbook's payments source (expenses may not import payments — the composition moves to
`reports`, EXP-03); `ledger.check_integrity` (LED-10 FR-8); the counter-QR print view and the
Settings UPI card (PAY-03 FR-1/FR-8, PLT-07's screen); the statement page's source links (the
timeline has them).

Requested against Part 17-02 PAY-01…PAY-05 and LED-10, Part 21 §21.3.9, Part 22 §22.9.
## CR-2026-09-25-PUR-A — PUR-01 / PUR-03 / PUR-04: what was built beside the FRDs

**State:** `raised`. **Target:** Part 17-03 §17.7.0, PUR-01, PUR-03, PUR-04; Part 21 §21.3.8;
Part 20 §20.1.4. **Gate:** none — additive; migration `purchases 0001_add_purchases_document`.

**The GST engine moved to `apps/tax/services/tax_engine.py`.** §17.7.0 says purchases use "the
same engine as sales" and the import matrix forbids `purchases → sales`. The engine imports only
`apps.common.money`, so it moved; `apps/sales/services/tax_engine.py` re-exports it until the
parallel branches merge. A bill calls it with `gst_type="regular"` whatever the tenant is (the
supplier charges GST to a composition shop too, FR-11). Two consequences of reusing it rather than
writing §17.7.0's text a second time: the document-discount rounding residual goes to the LARGEST
line, ties to the lowest line number (SAL-02 BR-5), not "remainder to the last line"; and SGST is
`round2(t × r/100) − CGST` rather than a second `round2(t × r/200)`, so an odd paisa lands on SGST
instead of vanishing. The §17.7.0 worked example is unchanged by either (T-PUR-01-1 passes to the
paisa).

**Duplicate index excludes drafts as well as voids.** §21.3.8 declares
`U(tenant, party, supplier_invoice_number) WHERE … status <> 'void'`. Built as
`UNIQUE (tenant, party, UPPER(supplier_invoice_number)) WHERE supplier_invoice_number IS NOT NULL
AND status NOT IN ('void','draft')`. Drafts autosave: with them in the index a clerk who types an
already-used number could not save the lines they were typing. The refusal is at RECORD (409
`duplicate_supplier_invoice`, `details.existing`), the index still makes two recorded bills with
one number impossible under any interleaving (a threaded test proves it), and `UPPER` because the
number is typed by hand from paper. The number is trimmed and inner whitespace folded before
storing.

**Void changes the average cost.** PUR-04 FR-4/BR-4 ("avg cost is not recalculated — the dialog
states 'Average cost unchanged'") predate CR-2026-09-24-INV-A, which this follows: the reversal
movement is folded through the §21.3.6 (2) "reversal of an inbound" case in arrival order, so the
average LOSES the value the bill blended in, and `recalc_stock` agrees by construction. The void
dialog therefore does not print "Average cost unchanged". PUR-04 FR-4/BR-4 should be amended.

**No payments in this change.** PUR-02 and FR-5/FR-6h (pay on the spot) are the payments track's.
The seam is `apps/purchases/services/payment_seam.py`: `apply_payment(document, ±amount, today)` is
the one writer of `amount_paid`/`amount_due`/`status` (BR-5), `lock_payable_bills` locks in
`(document_date, number, id)` order, and `register_void_listener(fn)` lets payments release
allocations inside `void_bill`'s transaction (FR-2d). The client renders no Pay action and no
"Paid now" section until payments ships them.

**Smaller deltas.** Recorded-bill PATCH accepts `notes` only (BR-7's text wavers on
`attachment_id`, which is not built). `due_on` defaults at record to `document_date +
party.credit_days` (0 when unset), matching FR-2. An archived item on a line is a 400 on
`lines.N.item_id` at record, not a 409 `item_archived` (the same strict line validation sales
uses). Void on an archived supplier is 409 `party_archived` (as the expense void). The list's
counts are `meta.counts`; `all` literally includes drafts and voids (FR-1) while `meta.totals`
excludes both from the money (BR-1). `purchases.refresh_overdue` was scheduled since Sprint 0
with no handler and dead-lettered nightly; it now has one. Module-off guard for `purchases`
counts drafts plus unpaid bills.

**Not built.** Bill photo (`attachment_id`, FR-2/AC-6) — no `files_attachment` wiring in this
wave; supplier payment and pay-now (PUR-02); inline item and supplier creation from the editor
(FR-12, the PTY-01 quick form); scanner-driven lines; "Duplicate" and "Void and duplicate"
(FR-9/FR-7 of PUR-04); `PurchaseBillPrint`; the purchase-register CSV (PUR-03 FR-8, RPT-04);
bulk pay; `document_voided` notification to owners (PUR-04 §17); analytics events.

## CR-2026-09-28-INT-A — W3 integration: payments × sales completion

**One due formula.** An invoice's `amount_due` is `grand_total − amount_paid − Σ
sales_credit_application` (SAL-02 BR-9) for every writer. PAY-01's sales allocation target now
moves only `amount_paid` by the allocated delta and derives `amount_due` and the status through
`sales.services.amounts.refresh_invoice_amounts`, so a credit note applied by SAL-04 is never
clobbered by a payment and vice versa (test: ₹1000 invoice, ₹200 credit, ₹300 payment → ₹500 due;
void the payment → ₹800; void the credit note → ₹1000). A walk-in bill keeps the target's own
rule (`ck_sales_document_walk_in_paid` holds its due at zero).

**LED-10 everywhere.** `sales/services/ledger_link.py` is now one-line calls into
`ledger.services.postings`: `post_source_entry` for the invoice debit and the credit note credit,
`reverse_source_entries` for a document void (C6 — dated today, sourced to the document). The
posting matrix already allowed both entry types; it was not changed.

**A credit note's refund is a PAY-01 voucher (SAL-04 FR-7 delta).** FR-7 says the refund payment
is "allocated to the credit note". There is no credit-note allocation target (registering one with
`direction='out'` would let PUR-02's FIFO auto-allocation settle customers' credit notes with
supplier payments), so the refund is `record_payment(direction='out', allocations='none',
meta={credit_note_id, credit_note_number})`. The PAYMENT posts the `payment_out` debit (sourced to
the payment, not the note); the note's `amount_paid` still carries the refunded amount and
`meta.refund` names the receipt (`payment_id`, `number`). FR-7 should be amended to match.

**FR-10 is now reachable.** Voiding the refund voucher (`void_payment`) calls
`sales.services.refund_seam.release_refund`, which gives the amount back to the note as open
credit (audit `credit_note.refund_released`, `meta.refund.voided = true`); the note can then be
voided. "Void the refund payment first" remains the refusal while the refund stands.

**Invoice void releases real allocations (SAL-05 BR-4).** `void_seam.release_invoice_payments`
calls PAY-05's `release_document_allocations`: the payments stay `recorded`, their
`unallocated_amount` grows, and the response names each receipt (`payment_id`, `number`, `amount`,
`walk_in`). The void dialog's follow-up lists and links those receipts: a party's money is an
advance (given back, if at all, as a Paid-out payment); a walk-in's is handed back and the merchant
voids the receipt.

**Import rule.** Sales reaches payments only through deferred imports inside the two seams — the
Part 20 §20.1.4 rule D5 pattern `payment_seam.py` already uses; payments imports sales at module
level as the matrix allows.
## CR-2026-09-28-RPT-A — RPT-01 / RPT-02 / RPT-05 / RPT-06 / RPT-08: what was built beside the FRDs

**State:** `raised`. **Target:** Part 17-04 RPT-01, RPT-02, RPT-05, RPT-06, RPT-08; Part 19
§19.6.2 (landing route); Part 21 (`reports_snapshot`). **Gate:** none — additive; migration
`reports 0002_snapshot`.

**Written against a sales app without credit notes or void.** SAL-01/04/05 were merging to main in
parallel. The selectors assume `sales_document.kind='credit_note'` with statuses
`issued`/`applied`/`void`, and `status='void'` on any document. Today's sales is invoices plus
bills of supply net of credit notes by `document_date`; a refund is a `payment_out`. If SAL-04
lands with other kind or status names, `apps/reports/constants.py` is the one place to change.

**The dashboard is the landing page.** RPT-01 says it is the first screen, so `/dashboard` is in the
sidebar (order 1) and "Go to dashboard" means it again. A reader without `reports.basic.read` is
redirected to `/parties`, so staff with a narrow role still land somewhere they can use.

**The snapshot is a table, not LocMemCache.** `reports_snapshot` (CR-106's columns) is shared
across worker processes, ≤60 s old, and dropped `on_commit` by post_save/post_delete receivers on
every model a tile reads. It is used for every tenant, not only those over 5,000 ledger entries —
one code path is cheaper to keep right than two. The response is `Cache-Control: private,
no-store` instead of FR's `max-age=60`: a browser-cached dashboard cannot be invalidated by a
write, the server snapshot can.

**Permissions follow the §12 table, not FR-6's parenthetical.** Staff see every tile except Cash in
hand, which needs `reports.financial.read` and both the payments and expenses modules. The day
book's running cash/bank columns and opening/closing need `reports.financial.read` too, as EXP-03
does; without it they are absent from the JSON and from the CSV header, not zeroed. Each day-book
source is gated on its own module's read codename and is left out of the query entirely when the
reader lacks it.

**Day book semantics.** Voided documents and reversed ledger lines are hidden by default; with
`include_void=true` they appear typed `<type>_void` and move no balance. Only the ledger's OWN lines
(`source_type` manual or ledger_entry) appear as ledger rows — a document's ledger posting would
double the document. Pagination is page-numbered (100, max 200), not a cursor; the running
balance is a window computed BEFORE the page is cut, so page two does not restart from zero. The
totals card sits under the table instead of a sticky footer, and the phone view groups by date
(there is no `UbTimeline`).

**Cash in hand equals the day book's closing cash** and includes manual cash ledger entries, as the
cashbook does. The cashbook (EXP-03) now includes payments: `expenses.selectors.cashbook` gained a
`register_cashbook_source` registry and `apps.reports` registers a payments source from
`ready()`, since `expenses` may not import `payments`. A split payment is two cashbook rows and one
day-book row; a test asserts cashbook, day book and tile agree.

**RPT-05 / RPT-06 reuse LED-09 and INV-08.** No second screen. The API adds
`/reports/receivables-aging`, `/reports/payables-aging` and `/reports/stock-summary` (JSON + CSV);
the existing screens export the reports file when the reports module is on. Payables aging is
LED-09's screen with `?type=payable`. `cached_at` on aging is always null (no RPT-05 snapshot);
an unknown `tag=` matches nothing rather than 400; a past `as_of` on stock without financial read
is 403. `inventory.selectors.stock.filtered_summary` was extracted so both views share one filter.

**RPT-08.** CSV only (no XLSX, no PDF — `format=pdf` is a 400 pointing at Print). Up to 5,000 rows
stream; above that a `reports.build_export` job, 7-day expiry, through `apps/common/exports.py`.
ISO dates, plain decimals, formula neutralisation (a mobile number exports as `'+91…`), a
header-only file for an empty period. Reports register an `Exporter` in
`apps/reports/exporting.py`; the job replays the query from `params`.

**Not built.** Dashboard quick actions You gave / You got / Add item and per-debtor Bill (only New
bill, New purchase, Send reminders); the short-form rupee has its exact figure in the accessible
name rather than a tooltip; the first-use checklist shows only when there is no party AND no
document; recent activity also lists purchases; charts (none required); RPT-05/06 XLSX; the
aging CSV answers 202 JSON above 5,000 parties, which the anchor-based download does not follow.
## CR-2026-09-28-RPT-B — RPT-03 / RPT-04 / RPT-07: what was built beside the FRDs

**State:** `raised`. **Target:** Part 17-04 RPT-03, RPT-04, RPT-07, RPT-08; Part 22 §22.11.
**Gate:** none — additive; no migration.

**Permissions follow the FRDs' §12.** The registers are `reports.basic.read` plus the module's own
read (`sales.invoice.read` / `purchases.bill.read`), so staff may VIEW them; export is
`reports.export`. The one cost column (a purchase line's `unit_cost`) needs
`reports.financial.read` and is absent, not blank, without it. The GST summary is
`reports.financial.read` throughout. (The wave brief said "gate on reports.financial.read"; RPT-03
§12 says financial is "not required (no cost columns)". The FRD was followed; the codename is one
`HasPermission` line per view if the owner wants it tighter.)

**Sign convention.** A credit note negates EVERY money column in the register, `amount_paid` and
`amount_due` included (refund out, open credit), not only the three FR-2 names; Σ due is then the
receivable net of open credit. A void row (`include_void=true`) is zero in every money column.

**CR-RPT-2 is implemented** (`tax_code`, `inter_state`, `b2b` on RPT-03, and `series`, `created_by`,
`ordering`). With `level=line`, `tax_code` filters the LINES as well as the documents, so the
GST summary's rate row drills into register lines that sum to it. That link replaces FR-13's
`GstDrilldownDrawer`.

**Export.** Registers go through IMP-02's `CsvExportMixin` (sync ≤ 5,000 rows, queued above), with
RPT-08's cell rules (ISO dates, `true`/`false`, signed plain amounts) and FR-8's file name on the
synchronous path. Inherited from IMP-02 and not changed here: zero rows is 400
`nothing_to_export` (RPT-08 EC-2 wants a headers-only file); the async download keeps IMP-02's
`digikhaato-<resource>-<stamp>.csv` name; the audit action is IMP-02's `export.requested`
(RPT-08 §16 names `report.export_requested`). Resources: `sales-register`, `sales-register-lines`,
`purchase-register`, `purchase-register-lines`. The GST summary exports ONE ZIP of per-section
CSVs (BR-9), always synchronously: its output is aggregates whatever the document count, and the
async job only replays a list queryset. No XLSX (FR-14, RPT-08 FR-10/11) — the in-house writer
is not built.

**`period`.** `YYYY-Qn` is the n-th quarter of the FINANCIAL year starting in April of YYYY
(Q1 = April–June), the QRMP quarter. A period running past today is clamped (EC-13); an explicit
`date_to` in the future is 400.

**Rows and boxes.** `outward.by_rate` includes reverse-charge SALES (so it reconciles with the
register); `gstr3b["3.1(a)"]` excludes them (EC-14). `3.2` is B2C inter-state taxable supply by
place of supply; composition and UIN recipients are not modelled. Net payable is the labelled
simple head-wise figure (BR-10): output = 3.1(a) + 3.1(d), credit = 4(A)(3) + 4(A)(5). Nature
rows beyond FRD's table: `b2b_rcm` (4B) and `cdnur` appear only when present; `outward.b2cs[]`
(state × rate) and `outward.nil_exempt[]` (table 8, registered × inter/intra) are extra keys.

**`gst_registration` (RPT-03 FR-2) is not in `party_snapshot`** — SAL-02's snapshot freezes name,
GSTIN, state, mobile and address only. The column reads the snapshot key when present, else
`regular` with a GSTIN and `unregistered` without. SAL-02 FR-7 should freeze it at issue.

**Exceptions (FR-9):** eight codes; `missing_party_gstin` is not limited to unfiled periods
because filing is not recorded; `cn_without_original` runs only once SAL-04's `against` exists.

**Not built:** XLSX; the desktop section rail (§8); `UbHelpHint` (a caption line instead); the
filing-reminder job and notifications (§17); `metadata.figures_hash` (§16); report caching and
`Cache-Control` (§14/§20); per-figure `aria-describedby` (the coordinate is a visible badge);
analytics events; the `sales_document_line_doc_tax_idx` index (§15, needs an `atomic=False`
migration and an EXPLAIN test); RPT-08's export history, retry and 10-minute polling cap beyond
what IMP-02's button already does.
## CR-2026-09-28-PUR-B — PUR-02 supplier payment: what was built beside the FRD

**State:** `raised`. **Target:** Part 17-03 PUR-02, PUR-01 FR-6h, PUR-04 FR-2d; Part 17-02 PAY-01.
**Gate:** none — no migration.

**No `SupplierPaymentDrawer`, no `supplierPaymentSlice`.** FR-1 says supplier payments are PAY-01's
engine; §7 then specifies a second drawer, slice and schema. The PAY-01 `PaymentFormDrawer` already
has direction, the mode lines, the allocation picker with Auto and per-row caps, and the advance
line, so "Pay supplier" (bill page, khata ⋯ for a supplier, Payments list) opens it with
`direction: 'out'`. One drawer, one set of rules. The server side is one allocation target,
`payments/services/targets/purchases.py`, the only target for money out (CR-2026-09-28-INT-A).

**FIFO order.** FR-3 orders by `due_on` then `document_date`; PAY-01 FR-5 and the lock order are
`(document_date, number, id)`. Bills are LOCKED in the canonical order and SORTED by `(due_on,
document_date, number, id)` for allocation; `open-documents` returns the same order so the drawer's
preview matches.

**A void bill's `amount_paid` returns to zero.** BR-4 releases the payments as advances; the bill
then keeps no paid figure, so Σ allocations = `amount_paid` holds on every bill (§1's invariant).
The void response's `released_payments` is now `[{payment_id, number, amount}]` (was ids) and the
toast says how much stays as advance.

**"Paid now" is on the record call.** `POST /purchases/bills/{id}/record` and `?record=true` accept
`payment: {payment_date, mode_breakup, note}`, validated before anything is written and recorded
as a PAYOUT allocated to the bill in the same transaction (T-PUR-01-5). A member without
`payments.payment.write` gets 403 `permission_denied` with `details.payment` for the whole request
(T-PUR-01-11). The editor asks "Paid now?" only for such a role and a non-zero bill.

**Also:** `GET /purchases/bills/{id}` carries `payments[]` (FR-6's list on the bill); purchases
registers a LED-10 source resolver so the khata names the bill by number; audit
`purchase_bill.status_changed` per moved bill (§16). **Not built:** Purchases list "Pay selected"
(FR-4), the `payment_out_by_staff` notification (§17), analytics (§18).

## CR-2026-09-28-H3-A — the stock value is carried, and the average derived from it

**State:** `raised` (built; needs the schema owner's acceptance). **Target:** Part 21 §21.3.6
(2) "Rounding" ("Stock value is … at display time, never stored") and the
`inventory_item_stock` / `inventory_stock_movement` column lists; Part 20 §20.6.2. Follows
CR-2026-09-24-INV-A.

**The defect.** QA final pass (Low): after voiding a purchase bill an item's average read
140.0001 instead of 140.0000. The value-removing reversal of §21.3.6 (2) computes
`on_hand × avg − |qty| × c`, and `on_hand × avg` is a product of the ROUNDED 4-dp average:
3 @ 140, +6 @ 150 → 146.6667, so the stock is "worth" 9 × 146.6667 = 1320.0003 when 1320 was
paid, and the void leaves 420.0003 / 3 = 140.0001.

**Decision.** `inventory_item_stock.stock_value` numeric(24,7) carries the exact value and
`inventory_stock_movement.value_after` numeric(24,7) records it per row (NULL on rows written
before this change). The step (`apps/inventory/services/costing.py`) moves the value by exactly
`qty × cost` for inbounds and value-removing reversals — exact at 7 dp, 3-dp qty × 4-dp cost —
and derives the average as `q4(value / on_hand)` exactly where §21.3.6 (2) says it changes. A
plain outbound leaves the average untouched (as the spec says) and takes its proportional share
of value, so `q4(value / on_hand) == avg` holds after every step; stock ≤ 0 carries
`on_hand × avg`. Consequence: a void with nothing in between restores on-hand, average and value
exactly. The displayed stock value is unchanged — RPT-06 / INV-08 still show
`ROUND(on_hand × avg_cost, 2)` per BR-4. Existing rows replay with `value = on_hand × avg`,
which is what the old step computed, so a pre-existing book reports no drift; migration 0005
backfills the cache's value with the same product.

**Also (H3 item 2).** `recalc_balances --check` / `recalc_stock --check` (never write, exit 1
on drift), `check_invariants` runs both, and the nightly callables are
`apps.ledger.services.integrity.check_balances` and
`apps.inventory.services.integrity.check_stock` (JSON summaries; party ids, never names).

## CR-2026-09-28-SHARE-A — the customer share page, and what its payload needed

**State:** `raised` (built; needs the API owner's acceptance). **Target:** Part 22 §22.12
(`GET /public/d/{token}`), SAL-03 FR-5, Part 27 §27.12, Part 19 §19.6.4.

**The defect (launch blocker).** `app/(public)/d/[token]/page.tsx` was the Sprint 0 stub: it
rendered "This link has expired" for every token and never called the API, so every bill a
merchant shared on WhatsApp opened as expired. A second defect sat behind it and was found by
opening a link in a cookieless browser: `/d` was not in `PUBLIC_ROUTE_PREFIXES`, so the root
layout's `GET /auth/me` 401'd, the refresh 401'd, and the customer was redirected to
`/login?next=/d/<token>` — the credential moved from the path into a query string. `/legal/terms`
and `/legal/privacy` (linked from sign-up before an account exists) had the same redirect.

**Decision.** The page is a client fetch through `publicApi` (the durable per-IP budget would
otherwise be spent from the Next server's one address) rendering the same `InvoicePrintA4` the
merchant prints. The allow-listed payload gains three blocks, each allow-listed and tested key by
key (`apps/sales/tests/test_share_public_page.py`):

* `tenant_branding.logo_url` — `/api/v1/public/d/{token}/logo`, a new token-scoped route that
  streams the TENANT's own logo under the same 404/expiry/revocation check and headers, because
  `/files/{id}` needs a session. A partner's default logo is not streamed. The signature image is
  deliberately NOT exposed on an open URL. nginx's log map redacts `/d/<token>/logo` too.
* `upi` — `{upi_url, amount, qr}` from the paper's `upi_intent`, only for an invoice / bill of
  supply that is issued, part paid or overdue with `amount_due > 0` and a valid VPA with the QR
  setting on (EC-5, EC-6, EC-7); `null` otherwise.
* `locale` — the shop's language; the page opens in Hindi when the shop or the phone's
  Accept-Language says `hi`, unless the customer chose with the page's own switch.

**Not done, recorded.** The ledger statement share (LED-04 FR-6/FR-7) is in MVP scope (Part 12
LED-04 "WhatsApp or link share") but the existing token lives on `sales_document.public_token_hash`
and cannot name a statement; it needs the generalised `parties_share_link` (C1) migration, a
statement public payload and a statement variant of the page. Part 17-02 NTF-03 FR-3 also puts
statements at `/khata/<token>` while LED-04 FR-7 puts them at `/d/<token>` — to be settled with it.

## CR-2026-09-29-UAT-D1 — sharing a document twice is the SAME link; rotation is "Reset link"

SAL-03 FR-5 / BR-4, Part 27 §27.12. Final UAT D1 (High).

**The defect.** `create_share_link` minted a fresh token on every "Copy link" and "Share on
WhatsApp", replacing the hash — so the link a customer already had on WhatsApp opened as "not
available" the moment the merchant shared the bill again (or just copied the link to paste it
somewhere else). BR-4's "one active token per document" was being enforced by killing the one the
customer holds.

**Decision.** Sharing is idempotent while a link is live (hash set, not expired, not revoked): the
same URL and expiry come back (`reused: true`) and nothing is written or audited. Showing a URL
again without storing it: the token is DERIVED, `HMAC-SHA256(SECRET_KEY, "sales-share:<doc
id>:<nonce>")` (`django.utils.crypto.salted_hmac`, no new dependency), with a random 16-byte
nonce in `meta.share_link.nonce`. The column still holds only the SHA-256 of the token and lookup
is still by hash, so a database dump alone yields no usable link — the property H1's hashing was
bought for; the attacker would also need the server key. Rejected: storing the raw token (a dump
becomes a list of live links) and a client-side cache of the last URL (lost on reload; a second
device would still rotate). Rotation is explicit: **Reset link** on the document page (owner/admin
— the existing revoke permission `sales.invoice.void`) revokes, then shares again with a new
nonce, copies the new URL and says the old link no longer works. Revoke drops the nonce so a
revoked link can never be re-derived. A legacy link (minted before this, no nonce) or one whose
derivation no longer matches (SECRET_KEY rotated) cannot be shown again and is replaced, which is
the previous behaviour. Tests: `test_sharing_again_returns_the_same_live_link_uat_d1`,
`test_an_expired_or_legacy_link_is_replaced_not_reused_uat_d1`, `useInvoiceDetail.share.test.tsx`.

## CR-2026-09-29-UAT-D10 — the GST summary opens on this month

RPT-07 §6 ("opens on the last completed month, the one being filed"). Final UAT D10 (Low).
In UAT the GST summary opened on last month, which hid today's bills from a busy shop and showed
a new shop an empty screen. It now opens on this month (month to date), matching the sales and
purchase registers (RPT-03 FR-7); the month being filed is one tap on "Last month". A data-dependent
default (this month when it has documents, else last month) was rejected: it needs a request before
first paint and makes the screen open on different periods for reasons the merchant cannot see.
`GST_DEFAULT_PRESET` in `features/reports/constants/taxReportConstants.ts`. Part 17-04 RPT-07 §6
should be amended when this is registered in Part 43.
## CR-2026-09-29-BRAND-A — DigiKhaato becomes YourKhata (yourkhata.com); customer documents carry no product name

**State:** `raised` (built on `worktree-agent-adebf556cb3dc896a`; needs owner sign-off on the
logo concept). **The mark is superseded by CR-2026-09-29-BRAND-C** (K-c "Bandhan"); the rename
and the customer-document rule below stand. **Target:** Part 23 §23.2.6 (brand mark), Part 24 (white-label defaults),
SAL-03 FR-5/FR-12 (print footer, share page), PAY-04, LED-04 §7, PLT-10 (export README).

**Owner request.** "I have changed my domain from digikhaato to yourkhata.com. Update
everything on the FE side. In any PDF I don't want any domain — instead keep the tenant name;
don't keep the domain name in any place. Redesign my logo as well."

**Decisions (lead's interpretation).**

* The display name is **YourKhata** — one word, capital Y and K — in BOTH locales. The Hindi
  shell had "डिजीखाता"; brand names are not translated, so `app.name` is "YourKhata" in `hi`
  as well. Internal code paths (`modules/DigiKhaato/…`), the `UB_` env prefix, cookie names,
  the repo folder, the log filename and dev database names are NOT renamed.
* **Nothing a merchant's customer receives names the product or its domain.** The A4 and
  80 mm prints (invoice, bill of supply, estimate, credit note), the A5 payment receipt and
  the party statement print "Issued by <business>" where they printed "Generated by
  DigiKhaato"; the share page `/d/<token>` prints "Shared by <business>" where it printed
  "Powered by DigiKhaato", and switches off the root layout's title template, application
  name, manifest, description and icons so the tab and favicon are not ours either. The
  data-export ZIP's README says "Generated … for <business>". The public payload's
  `app_name` no longer falls back to the product name on the client. WhatsApp/SMS reminder,
  entry and receipt texts were checked: they were already signed `— {shop}` only.
  Guarded by `frontend/src/tests/customerDocumentsCarryNoProductName.test.tsx` and
  `backend/apps/platform_app/tests/test_tenant_data.py::test_the_export_names_the_business_and_never_the_product`.
* Download FILENAMES are the merchant's own and say `yourkhata-…` (`yourkhata-parties-…csv`,
  `yourkhata-{kind}-template.csv`, `yourkhata-{kind}-problems.csv`, `yourkhata-export-….zip`).
* The mark is redesigned: three original concepts in `frontend/public/brand/concepts/`, concept
  A (the open khata with a tick) applied to `UbLogo`, the favicon (SVG + 16 px cut + 32), the
  apple-touch icon, the PWA 192/512 and the maskable 512. Tokens `--brand-page-back` and
  `--brand-rule-short` are replaced by `--brand-rule-soft`. Rules in DESIGN-SYSTEM §7.
* The domain appears only where an absolute origin is configured: production EXAMPLES in
  `.env.example` / `backend/.env.example` (`UB_PUBLIC_BASE_URL`, `UB_ALLOWED_HOSTS`, CORS,
  CSRF, cookie domain), nginx `server_name yourkhata.com www.yourkhata.com`, and Part 29's
  examples. Dev defaults still point at localhost. The frontend needs no absolute URL of its
  own: share links are built by the backend from `UB_PUBLIC_BASE_URL`, so a WhatsApp share
  link necessarily contains `https://yourkhata.com/d/<token>` — that is the link, not branding.

**Not done, recorded.** Part 23 §23.2.6 and Part 24's default `app_name` in the Project SSOT
still say DigiKhaato and need the same edit through `project_write`. `package.json`'s `name`
(`digikhaato-frontend`) is internal and left.

## CR-2026-09-29-SEC-A — a support session is VIEW ONLY, enforced at the one door

**State:** `done`. **Target:** Part 17-01 PLT-14 FR-5, Part 20 §20.4.8 rule 5,
CR-2026-09-24-W2C-B. **Found by** the video producer reading the code: the console
("A read-only support session for up to 60 minutes") and the owner's consent both promise
read-only, but `CookieOrBearerJWTAuthentication._assert_impersonation_scope` said "Writes
are allowed" and refused only the console, switching, deletion, export, consent, the team
routes and `bank_details`/`upi_vpa`/`pan`. Every other write was stopped only if the view's
permission class happened to check `imp` — `HasPermission`, `TenantManagePermission` and the
settings/branding classes did (with a generic 403 `permission_denied`); `IsTenantMember`, on
the notification inbox's mark-read and read-all, did not, and nothing stopped the next view
from forgetting.

**Decision.** W2C-B's "until the owning chapter chooses, a support session reads" is now the
rule rather than an accident of which permission class a view uses. The authentication class
refuses EVERY unsafe method (POST/PUT/PATCH/DELETE) under an `imp` token with 403
`impersonation_forbidden` ("This is a view-only support session. Nothing can be changed."),
before any view or permission class runs. A lapsed/revoked session still answers 401
`session_revoked` first, so the client's refresh hands the tab back to the operator.

**The allow-list** (`IMPERSONATION_WRITE_ALLOWED`, shared with `HasPermission` through
`support_write_allowed()`): `POST /admin/impersonation/end` (the way out), `POST /auth/logout`,
and `POST /reminders/preview` — the only POST the frontend makes merely to SHOW something
(the reminder sheet's text; `preview_reminder` writes nothing). Considered and left off:
`POST /payments/upi-intent` (writes nothing, but it is opened from the Collect action, a
payment flow), `POST /payments/{id}/share` (audited, idempotency row), share-link creation
(mints a token), notification mark-read (the owner's inbox state). `/auth/refresh` and the
other sign-in routes never authenticate (`authentication_classes = []`), so the support token
never reaches them. Reads are unchanged: open, except the console, switching, the whole-book
export, the business's own consent requests and the password/session screens.
`Ctx.from_request` still stamps `metadata.impersonation=true` on anything audited in the session.

**Frontend.** `UbViewOnlyProvider` (design system) wraps the shell's content region while
`session.impersonation` is set; `UbButton` (`primary`, `destructive`, any `type="submit"`)
and `UbFab` disable themselves with the title "Support session · view only. Changes are
turned off." The banner reads "Support session · view only — …" and its End session is
`viewOnlySafe`; the account menu (Sign out) is outside the region. `impersonation_forbidden`
resolves to `errors.impersonation_forbidden` in the snackbar, so the refusal reads as view-only
in Hindi too (the server has no Hindi catalogue).

**Tests.** `backend/apps/platform_app/tests/test_support_session_view_only.py` walks the URL
resolver: every route accepting an unsafe method (95 today, router `.json` twins excluded)
answers 403 `impersonation_forbidden` under a support token, except the allow-list; the six
unauthenticated routes are pinned by name; reads, the allow-list, the audit stamp and the
owner's own writes (during a live support session) are asserted. Frontend:
`UbAppShell.test.tsx` (view-only state and the owner's unaffected state), `apiError.test.ts`.

**Not done, recorded.** Logout from a support session clears the cookie but does not end the
`platform_impersonation_session` row (it lapses at its expiry, ≤ 60 min); ending it on logout
is a small follow-up. FR-5's "writes needed to reproduce fixes" stays refused; relaxing it is
the owning chapter's call and would need fresh owner consent copy.

## CR-2026-09-29-BRAND-C — the YourKhata mark is K-c "Bandhan", the tied bahi cover

**State:** `done`. **Supersedes** the mark half of CR-2026-09-29-BRAND-A (the rename and the
"customer documents carry no product name" rule in BRAND-A stand unchanged). **Target:**
Part 23 §23.2.6 (brand mark), `docs/DESIGN-SYSTEM.md` §7.

**How it was chosen.** Round 1 drew three pictures (`frontend/public/brand/concepts/`); Concept A,
the open khata with a tick, was applied under BRAND-A. The owner asked for a K instead. Round 2
(`concepts2/`, six marks) produced Concept 1, the "signature K" whose leg sweeps into a ruled
line, and Concept 2, a joined YK; a partial apply of the joined YK was abandoned unshipped.
The owner then asked to "keep the K like the 1st logo, but with some khata styling". Round 3
(`concepts3/`, four variants of that K) was drawn, and **the owner chose K-c, "Bandhan"**: the
tile is the cloth cover of a bahi-khata with a stitched hem; the K's sweep carries on across the
cover as the tie band; a bahi-red knot with two white string ends closes it. Both concept rounds
are committed as the record.

**Decisions.**

* Colours: cover `--brand-cover` → `--primary-600` (#3A36B8), hem `--brand-hem` → `--primary-400`
  (decorative), K and band `--brand-figure` white, knot `--brand-knot` #C8322B — the ONE fixed
  colour the mark may use, decorative, never text, and restated in the dark column as #D9453D
  because it also ends the wordmark's sweep on the theme's surface. `--brand-mark`, `--brand-page`,
  `--brand-rule` and `--brand-rule-soft` are removed.
* White K on the cover is 8.75:1 and is held to the TEXT floor in both themes
  (`scripts/check-contrast.mjs`, `darkTheme.contrast.test.ts`). The cover on the dark rail is
  2.02:1; a logo's own colours are outside WCAG 1.4.11 and the white K identifies it there
  (17:1 on the rail), so that pairing has an explicit 2.0 floor rather than none.
* At 24 px and below (`UbLogo size="sm"`) the hem is dropped and the knot is one dot. The 16 px
  favicon is the hand-cut `yourkhata-mark-16.svg`, now also the SVG favicon in `app/layout.tsx`
  (a browser paints the SVG favicon at tab size whatever the master was drawn for); its knot was
  re-cut as a 4 px dot on the pixel grid and its string ends dropped.
* The in-app mark has no clipPath and no `id`, so two logos on one page cannot collide. The lockup
  sets "YourKhata" with the signature K (indigo, `--text-accent`) whose sweep ends in the knot dot —
  ONLY for the product's own name; a tenant's name is plain text.
* A K no longer conflicts with white-labelling: a tenant with its own logo replaces the mark
  through `branding.logo_attachment_id`, and a tenant without one is showing the product's default.

**Not done, recorded.** Part 23 §23.2.6 in the Project SSOT still describes the round-1 mark.
`theme_color` (manifest and `viewport.themeColor`) stays `#4A47D6`, the app's accent, not the
cover's `#3A36B8`.

## CR-2026-09-29-PLATFORM-B — the landing page is repositioned: one platform, many modules, a shared core

**State:** `built`. It needs owner review of the copy, and the module statuses follow CR-2026-09-29-PLATFORM-A.
**Target:** `/` (`features/landing`), `docs/platform/01-current-capabilities.md`, vision §4 (honest landing page).

**Owner direction.** YourKhata becomes one all-in-one platform where different businesses and
organisations keep their records, documents, transactions and collections, each module kept
separate. Phase 1 is only the landing page. Planned modules are shown as planned, with no
screenshots, demo, dates or "available now" call to action. Drop "kirana" and all regional jargon.

**What changed.**

* **Inventory first.** `docs/platform/01-current-capabilities.md` lists what is live, read from
  the routes, pages and ready navigation entries. It is the page's source of truth. Compiling it
  found a false claim on the old page: "share a link" for **statements**. Statement share links
  need `parties_share_link` (PTY-09), which has no table. Share links exist for sales documents
  only, and the card now says so.
* **One config, `features/landing/config/modules.ts`.** It holds five modules, each with
  `status: 'live' | 'in_development' | 'planned'` and the core pieces it builds on. The hero
  badge, the module map, the module cards, "Who it's for" and the FAQ all read it. Its statuses
  must equal the vision doc's §2 table, and a test parses that table.
* **The new order:**
  1. the hero, still the live shop module's real recordings;
  2. the **module map** (#platform): the modules drawn as tiles on top of one shared-core slab,
     with measured connectors, solid for live and dashed for planned;
  3. **one card per module** (#modules): the live card has Start free and "See it in use"; the
     planned cards are text only;
  4. the use-case explorer (#features), as the live module's deep dive;
  5. **Who it's for**, one row per module;
  6. also included;
  7. how it works;
  8. pricing, with a line saying that pricing for other modules is decided when they launch;
  9. the FAQ, with "Which modules can I use today?" and "Is the lending module available?"
     added, each answered "Not yet… planned";
  10. the closing band.
* **The honesty rules are tests.**
  * A planned card, tile or row holds no video, image or frame, no demo and no sign-up link, and
    always carries the Planned chip. This is checked in jsdom and again in the browser at nine
    widths, together with the requests the page makes.
  * A planned module's words (lender, library, gym, room…) may appear only in
    `landing.module.<planned id>.*` keys and the two FAQ answers, which must say "planned" and
    "not". The rendered page is checked by ancestor as well.
  * No "kirana", "udhaar" or "khata" as an English common noun, in either language, in text,
    readable attributes or the metadata.
  * "One module today. Four more planned." is checked against the config's counts.
  * The lending card and FAQ both say it will not lend or move money (vision §4).
* **Terminology.**
  * English copy now says ledger, account, dues and money owed. "Ledger" replaces the
    explorer's "Khata" tab. The media file ids keep `khata`, because they are code.
  * Hindi keeps the everyday words उधार and खाता.
  * The brand name is unchanged.

**Budget.** The `/` route grew from 30.3 KB to about 35 KB: +1.5 KB of English strings, and the
rest is the three new components. It was re-baselined with a dated note in
`bundle-budgets.json`.

**Not done, recorded.**

* The recordings still show the seeded demo business "Sharma Kirana Store" in the app's sidebar,
  and the narrated demo's captions say it. Re-recording against a neutrally named demo business
  is an owner decision (it needs the recording pipeline and new narration).
* Part 43 in the Project should register this CR. The coordinator owns that sync.

## CR-2026-09-29-PLATFORM-C — search: metadata, crawl rules, structured data, cache headers

**State:** `built`. Part of Phase 1 (the landing page). Owner review: the title and description
wording, and the cache-policy choice below.
**Target:** `app/page.tsx`, `app/robots.ts`, `app/sitemap.ts`, the root and group layouts,
`features/landing/config/{seo,faq}.ts`, `utils/landingJsonLd.ts`, `src/utils/seo.ts`,
`UbJsonLd`, `UbDisclosure`, `next.config.js`, `nginx/conf.d/app.conf`; Part 19 §19.9.1
(Lighthouse SEO ≥ 90).

**Owner direction.** Make the site SEO-friendly, positioned as the platform, with no jargon and
no claims about planned modules, and never let a customer's document be indexed.

**What changed.**

* **Metadata for `/`** (Next Metadata API). Title (57 characters) and description (155) from
  `features/landing/config/seo.ts`, platform-positioned and naming only live capabilities. An
  absolute canonical `https://yourkhata.com/` from one `SITE_URL` (`NEXT_PUBLIC_SITE_URL`,
  default `https://yourkhata.com`, a build arg in the Dockerfile and compose); `metadataBase` on
  the root layout; Open Graph and a `summary_large_image` Twitter card; `robots: index, follow,
  max-image-preview:large`. The root layout's inherited description lost "Your shop's khata".
* **The preview card is a static PNG, not `app/opengraph-image.tsx`.** Two findings, both
  against Next 16.3: a file-convention OG image at the app root is merged into the ROOT
  segment's metadata and inherited by every route that does not override it, including
  `/d/<token>`, which must never show the product (BRAND-A); and `next/og` reads TTF/OTF/WOFF,
  while every brand face here is WOFF2. So `public/brand/yourkhata-og.png` (1200 × 630) is
  rendered by `scripts/render-brand.mjs --og` from the K-c lockup and the hero headline (read
  from the catalogue), on the closing band's indigo, and referenced from `/`'s metadata only.
  No dependency: the script drives the Playwright Chromium the e2e harness already has.
* **Crawling.** `app/robots.ts` allows `/`, `/legal/`, `/login`, `/signup` and disallows every
  prefix in `GUARDED_ROUTE_PREFIXES` (so a new app section is disallowed automatically), the
  password flows, `/d/` (with the slash), `/api/` and `/design-system`. `app/sitemap.ts` lists
  the five public pages. `noindex, nofollow, noarchive` meta on the `(app)` and `(admin)`
  layouts (now server components; their client bodies moved to `AppGroupShell` and
  `AdminShell`) and on onboarding, accept-invite and the three password pages, as defence in
  depth. `/d/<token>` already had the meta and `X-Robots-Tag`; kept.
* **Structured data.** One server-rendered `<script type="application/ld+json">` via the new
  `UbJsonLd` (which escapes `<`, `>`, `&`, U+2028/9): Organization, WebSite,
  SoftwareApplication (BusinessApplication, Web) and FAQPage. `offers` is the free plan at
  0 INR only while `PRICING.status === 'proposed'`; approving pricing emits the paid plans. The
  FAQPage is built from the same ids (`config/faq.ts`, moved out of the client component so
  the server can read the array) and the same English strings the page renders. No rating,
  review or count, and a test walks the graph for them.
* **On-page.** Two defects found in the server HTML with curl:
  1. **The FAQ answers were not in the HTML at all.** `UbDisclosure` unmounts a closed panel (the
     right rule for form fields), so crawlers saw ten questions and no answers. It now takes
     `keepMounted`: the FAQ's panels render with `hidden`, upgraded after hydration to
     `hidden="until-found"` so find-in-page opens them. Forms keep the unmount.
     A second, quieter defect was waiting inside the fix: the panel's `flex` class beats the
     `[hidden]` rule, so a naive `hidden` would have left every answer on screen.
  2. **A skipped heading level.** The desktop use-case explorer put h4s straight under the
     section's h2, because its job titles are tabs, not headings. They are h3 there now.
  Otherwise the page already had one h1, header/nav/main/footer, labelled media (`role="img"`
  plus `aria-label` around decorative videos) and descriptive links, all now asserted.
* **Cache headers.** `public, max-age=86400, stale-while-revalidate=604800` on
  `/media/landing/*` and `/brand/*`, identically in `next.config.js` and nginx (a jest test
  compares the two). Not `immutable`: the names are unhashed and are re-cut in place. Next was
  serving them `max-age=0`. **And nginx never served the landing media in production at all**:
  `/media/` is Django's `internal` X-Accel location, so every loop and poster would have been a
  404 there. The new `location /media/landing/` is the longer prefix and proxies to the
  frontend.
* **Fonts** were already `next/font/local` with `display: swap` and preload on the faces the
  first paint uses; unchanged.

**i18n and SEO — the trade-off, recorded.** The locale is a cookie, so there is one URL per page
and crawlers, which send no cookie, index the English page only. There is no `hreflang`, because
there is no second URL to point at, and no `/hi` route was invented. Per-locale URLs + hreflang
is in `docs/BACKLOG.md`, together with a finding from the same check: with the Hindi cookie the
server sends `lang="hi"` over English HTML, because the Hindi catalogues arrive after hydration.

**Measured.** Lighthouse 13.5 (run from a scratch directory through `npx`, no project
dependency), mobile, same machine, before → after: SEO **92 → 100** (the one failing audit was the
relative canonical), accessibility 100 → 100, best practices 96 → 96. Performance read 48 → 51,
on a box at load average 13 from a parallel video render, so it is not a real figure; LCP and CLS
were also measured with Playwright at 390 and 1440 px, cold and throttled, and are unchanged
within noise (CLS 0.000–0.005 both). The server HTML grew 3.6 KB gzip (the FAQ answers and the
JSON-LD). `e2e/seo.mjs`: 96/96 against the live stack.

**Not done, recorded in `docs/BACKLOG.md`:** versioned media URLs (for `immutable`), staging
noindex, Lighthouse in CI and a performance score on a quiet machine, titles for `/login` and `/signup`, the
`/d/` disallow-vs-noindex residue, and a stale `NEXT_PUBLIC_APP_NAME` in root `.env` files.

## CR-2026-09-29-PLATFORM-D — every module presented as part of the product; coaching joins; pricing hidden; "Why YourKhata"

**State:** `built` (landing page). Owner decisions of 29 Sep 2026, recorded in
`docs/platform/00-platform-vision.md` §2 and §4, which replace the "honest landing page" rule of
CR-2026-09-29-PLATFORM-B.
**Target:** `/` (`features/landing`), its metadata and JSON-LD, the landing tests and the two
landing e2e harnesses.

**Owner direction.** The site is not public yet, and the page should not need reworking each time
a module ships. So:

1. **No status labels.** Every module is presented the same way, as part of the product. No
   Live, Planned or In development chip or wording anywhere: the cards, the FAQ, the metadata or
   the JSON-LD. `status` stays in `config/modules.ts` for the build plan and the pre-launch check,
   and nothing renders it. A module with real recordings shows them through `media` in the config;
   a module without shows an illustration made from our own icons. No invented screenshots and no
   fake UI.
2. **Coaching & tuition is the sixth module**, after Shop & billing, Lending & collections,
   Library, Gym & fitness and Hotel & stays. Its copy comes from `research/coaching.md`: students
   and guardians, batches, fee plans, attendance, and the refund for unused months described as a
   calculation, with no compliance claim.
3. **Pricing is hidden** behind `SHOW_PRICING` in `config/pricing.ts`. While it is off there is
   no #pricing section and no Pricing link in the header, the phone menu or the footer. "What does
   it cost?" gives way to a neutral "Do I need a card to sign up?". The JSON-LD carries **no
   offers at all**, not even the free plan, because a price only a search engine is told is a
   claim the page does not make. "Start free" stays, because nothing is charged today.
4. **Adding recordings is a config change.** Every card is the same card. `media` on a module
   swaps the illustration for its framed recording, and no component changes (tested with the
   same stage given media for coaching).

**Added on the owner's request: "Why YourKhata"** (#why, after the Shop & billing explorer, in the
header nav). "What other apps miss. What you get with YourKhata." Eight cards, each read top to
bottom as a contrast: the common failing ("Often elsewhere") and then what YourKhata does. They
are drawn from `research/candidates-and-competitors.md` §5–6. No competitor is named and nothing
is ranked. Each point rests on a live capability or a binding rule, and the evidence table is in
`config/why.ts`:

| Point | Evidence |
|---|---|
| One app, one set of records | Vision §1 and §3 rule 3; `enabled_modules` switches per business |
| Your name on your bills, not ours | `customerDocumentsCarryNoProductName.test.tsx`; vision §4 |
| Mistakes are corrected, never erased | Ledger corrections (capabilities); Canon §0.11 rule 1, model plus DB trigger |
| Payments come straight to you | Local UPI QR, no gateway, the money never passes through the product |
| Each person sees only their part | Four roles with per-permission checks |
| Your data stays yours | CSV import/export; full data export at `/settings/data` |
| Any phone or computer, in Hindi or English | Platform: both languages on every screen; browser only |
| No ads | `docs/02-product-vision.md`: advertising in any tier, "Never" |

Left out: "we never store full ID numbers". It is a design in the lending and hospitality
*research*, not a binding rule. The hospitality design keeps full non-Aadhaar numbers behind an
opt-in, and the business's own PAN is stored in full today (it is masked only on display).

"Also included" dropped staff roles, Hindi and English, and CSV, which are now Why points, and
took in three other live pieces of the core instead: reminders with the exact amount, the day book
and GST summary, and the activity log.

**Metadata.** The title is "YourKhata: bills, fees, collections and bookings in one app" (59
characters). It reaches all six modules: bills for the shop; fees for the library, gym and
coaching; collections for lending; bookings for the hotel. The description (147 characters) names
each module. The `FAQPage` is built from the same `faqIds(SHOW_PRICING)` as the rendered FAQ, and
`e2e/seo.mjs` now checks that the two match on the wire.

**Tests changed, and why some were removed.** The old rule was: planned modules are labelled, have
no media, and their words appear only inside planned scopes. The owner replaced it, so the tests
that enforced it were removed:

- the status chip and label tests;
- the "planned-only scope" vocabulary guard (`plannedModuleVocabulary.ts`, now
  `moduleVocabulary.ts`);
- the "One module today. Four more planned." count test;
- the live-versus-upcoming feature-line split.

Kept, in their new form:

- a module's own words appear only in that module's places;
- no figures on a module card;
- lending "does not lend or move money".

New checks:

- no status chip, attribute or word is rendered, in English and in Hindi, in jsdom and on the
  live page at nine widths;
- cards without media hold no video, image or frame;
- pricing and its links are absent while the flag is off, and come back when it is on;
- the Why section renders its eight points in both languages;
- no competitor name and no comparative claim appears in any landing string;
- six modules are shown, and the map connectors are measured for six columns.

**Budget.** `/` rose from 35.0 to 37.1 KB (first load 268.3). Two savings came first. The hidden
pricing section is now `dynamic()` and never fetched while the flag is off (−1.3 KB). Its 44
strings moved to their own `landingPricing` catalogue (−0.7 KB); for this, plan features became
short ids in `pricing.ts`. The budget was re-baselined to 38 / 269 with a dated note.

**Gates.** Unit tests 2591/2591; landing e2e 169/169; SEO e2e 104/104; contrast 146 pairings;
i18n in step; bundle inside budget.

**Open for the owner.**

- The pre-launch gate in `docs/platform/STATUS.md` now matters: five of the six modules shown
  are not built.
- The Why copy and the coaching copy need review.
- Part 43 in the Project should register this CR. The coordinator owns that sync.

### Amendment, 29 Sep 2026: Coaching & tuition withdrawn

**Owner correction:** "I need library mgmt system, not coaching". Library stays, as it always
has. Coaching & tuition is removed everywhere it had been added:

- the vision module map (§2). The Candidates row now notes it as researched and declined, not
  in scope;
- `config/modules.ts` and its icons;
- the landing copy in English and Hindi (the card, and the FAQ's "Which modules are there?");
- the module map, cards and "Who it's for";
- the SEO description, which no longer says "student fees". The title keeps "fees", which now
  means library and gym fees.

The landing page shows five modules: Shop & billing, Lending & collections, Library, Gym &
fitness, Hotel & stays. The tests that counted six now count five. The coaching-refund copy test
is replaced by a guard that no landing string or metadata names coaching (`WITHDRAWN_MODULE_WORDS`
in `src/tests/moduleVocabulary.ts`), in jsdom and on the live page. `research/coaching.md` is kept
for reference under a NOT IN SCOPE banner.

**Budget.** `/` fell from 37.1 to 36.8 KB (first load 268.3 → 268.0). The route budget was
tightened from 38 to 37; first load stays at 269.

**Layout.** Five cards in a three-column grid left a hole at the bottom right. A short last row
is now centred, keyed on the card count rather than written for five.

**Gates.** Unit tests 2589/2589; landing e2e 169/169; SEO e2e 105/105; lint clean; contrast OK;
i18n in step; bundle inside budget.

Everything else in this CR stands: no status labels, hidden pricing, and "Why YourKhata".

## CR-2026-09-30-PLATFORM-ROLES — canon §0.9: module roles, the widened action set, and `platform.calendar.manage`

**State:** `raised` (built by Wave A; filed at the Wave A gate, 30 Sep 2026). Owner defaults **Q1
and Q2** of `docs/platform/13-owner-questions.md` adopted by the build. Drafted by Track P (A13) in
`docs/platform/progress/wave-a-track-p.md`; moved here verbatim by the gate.
**Target:** Part 0 §0.9 (canon roles and actions; approver: holder, with a `DEC-` entry), Part 20
§20.5 (permission checks), `apps/common/permissions_registry.py`.

*Change.* Canon §0.9 fixes four system roles and a closed action set. It is amended to:

1. **Module roles.** A module may own system roles, `platform_role` rows with `tenant` NULL,
   `is_system` true and `code = "<module>_<role>"`, registered through
   `permissions_registry.register_module_role` and seeded by the module's own data migration. Three
   are adopted (owner Q1): `lending_agent` (collection agent — loans on the agent's routes),
   `gym_trainer` (trainer — members whose term or batch names the trainer; no fees, dues or
   mobiles unless granted) and `hospitality_housekeeping` (housekeeping — the room board, no guest
   contact or ID fields, no folio, no money). A module role holds ONLY its module's codenames:
   never `parties.party.read`, `ledger.entry.read`, `payments.payment.read`, `reports.*`,
   `ledger.reminder.write` or any `read_all`. It is assignable only while its module is enabled;
   while the module is off its codenames vanish and the membership remains.
2. **Action set.** The closed set `read | write | delete | export | void | correct | manage |
   adjust` widens to the actions the registry and the FRDs use: `read_all` (reads beyond a row
   scope; owner and admin by default and **explicitly** accountant, whose automatic set matches only
   `.read`), `reveal` (identity fields, ADR-053/058; never implied by `*.read`, so never the
   accountant's automatically), `void_own`, `money_read`, and the per-module verbs each FRD lists.
   Lending's `lending.borrower.id_read` is renamed `lending.borrower.reveal` (ADR-058).
3. **Staff and accountant sets.** Each module's release CR adds its codenames to `_STAFF` and
   `_ACCOUNTANT` as its FRD's permission matrix says (R47).
4. **`platform.calendar.manage`** (owner Q2) — a new core codename held by owner and admin, to
   write tenant-wide closed days without the owner-only `platform.tenant.manage`; a closed day with
   `module = X` may also be written by X's settings codename (R26). (Implemented by A9b.)

*Why.* Row scoping cannot be made safe with the canon roles: `staff` holds tenant-wide core reads,
so a scope applied only to a vertical's tables would leak through `/parties` (ADR-052). And the
accountant's `*.read` rule would hand identity fields to accountants automatically (ADR-058).

*Implemented by.* Wave A task A13 (mechanism: `ScopedViewSetMixin`, `RestrictedFieldsMixin`,
`register_module_role`, `GET /roles`, the team screen, `tests/architecture/test_module_scoping.py`)
and A9b (the codename). Each role row ships with its vertical: in Wave A no module role is
registered, so no tenant can assign one yet. One hardening found in A13's QA is part of the rule:
`permissions_override.allow` cannot hand a module role a core read or a `read_all`
(`test_an_override_cannot_hand_a_module_role_a_core_read`). *Reversal.* Remove the roles'
registrations and rows; no core table changes.

## CR-2026-09-30-LED-11 — the shop write-off is capped at the trade figure

**State:** `raised` (built by Wave A task A2; filed at the gate). Owner default **Q3** adopted.
Drafted by Track M in `docs/platform/progress/wave-a-track-m.md`.
**Target:** Part 17-02 LED-11 and PTY-04 FR-3 (the write-off escape in the archive flow);
ADR-043 (one balance with a `loan` bucket).

*Change.* LED-11's "write off a small balance" (PTY-04 FR-3 in the archive flow) defaults to, and is
capped at, the party's **trade figure** `balance − loan_balance` instead of `balance`.

*Why.* ADR-043 keeps a loan in the party's one balance; without the cap one tap on a shop screen
would forgive a loan, which only lending's own write-off (R38) may do.

*Effect today:* none — no party has a loan, so the trade figure is the balance (proved at the gate:
1,290 reads of 300 real dev-database parties are byte-identical before and after Wave A). *With a
loan:* the write-off posts the trade figure (a `main` line), the loan stands, and archive is
refused by the ordinary non-zero balance guard (EC-7); a confirmed amount other than the trade
figure answers 409 `balance_changed` with `amount` = the trade figure.

*Implemented in:* `apps/ledger/services/write_off.py`; tests in `apps/ledger/tests/test_buckets.py`.

*Added at the gate (the look pass).* The archive dialog offered "Write off ₹2,300.00" for a party
owing ₹300 to the shop and ₹2,000 on a loan: it offers the refusal's `balance`. The server's cap
held, but the offer was the thing the cap exists to prevent, and with a loan open no shop
write-off lets the archive through (EC-7). So the 409 `party_balance_nonzero` gains, **only while
`loan_balance ≠ 0`**, `can_write_off: false`, `amount` (the trade figure) and `suggestion:
"collect"`; the dialog then offers Record payment only and says "Part of this is a loan, and a
loan cannot be written off here" (`test_the_archive_refusal_does_not_offer_to_write_off_a_loan`,
`PartyArchiveDialogLoan.test.tsx`). Every other refusal's payload is unchanged.

## CR-2026-09-30-WAVE-A — Wave A: what was built beside the FRDs and contracts v1

**State:** `raised` (the gate's summary of interface-level decisions the three tracks recorded).
Every item is additive or narrows a surface; none changes a figure an existing tenant reads (the
gate's golden and replay proofs). The questions each one leaves are answered, as proposals, in
`docs/platform/10-architecture.md` §18.
**Target:** FRD 00 (`docs/platform/frd/00-core-and-engines.md`), `docs/platform/11-contracts.md` v1,
Part 22 §22.1.1.

| # | What was built | Beside what it says | Task | §18 |
|---|---|---|---|---|
| 1 | `sales.default_kind` and `reset_fy` removed from the settings payload and ignored on PUT (owner Q14 default) | FRD X07 BR-6 "keep showing `reset_fy`" | A8 | — |
| 2 | `raise_counter(..., via=)` keyword, for the audit row FRD §6 names | contracts §1.7 has no `via` | A8 | W-P2 |
| 3 | Weekdays stored as `calendar.closed_weekdays[.<module>] = {"value": [...]}` and written only through `PUT /calendar/weekdays`; `readers` added to the list's `meta` | FRD X08 §5 (one nested key; generic settings PUT as an alternative) | A9b | W-P3 |
| 4 | Engine reads narrowed to modules that are enabled AND whose codename the member holds | contracts' minimum (any consuming module) | A12 | W-P4 |
| 5 | Off-guard `label_id` convention `<module>.off.<thing>` routed to the `settings` catalogue; module role labels `<module>.role.<name>[.caption]` routed to `team` | not in the FRDs | A12, A13 | W-P5 |
| 6 | A payments-owned void seam (`payments/services/void_seam.py`) replaces `void.py`'s import of `sales.refund_seam` | ADR-056 names the targets and the void listener, not this import | A14 | W-M1 |
| 7 | `"auto"` FIFO merges each target's own FIFO by `(document_date, number, id, document_type)` | R6 "global oldest-first" read literally re-sorts PUR-02's due-date order | A4a | W-M3 |
| 8 | "Applied later" kept in `payment.meta.applied_later` (document, date) | no column reserved | A4a | — |
| 9 | `Issuer.available(tenant)`, `IssuedDocument.warnings` / `existing`, the origin `labels(*, tenant, ids)` listener method, the port's optional `refund` payload | contracts §1.5 lists none of them | A5 | W-M4…W-M7 |
| 10 | Two error codes `document_origin_locked`, `document_origin_confirm` (409); `party_has_open_records` (409) | new rows in §22.1.1 table F | A5, A6 | — |
| 11 | Deposit panel key `payments.deposits` (A6's registry wants `<module>.<name>`) | FRD X02 §7 "the core key `deposits`" | A4b | W-F6 |
| 12 | Migration numbers `payments 0004_held_deposit`, `sales 0005_document_origin` | FRDs say `0003_held_deposits`, `0004` | A4b, A5 | — |
| 13 | ESLint boundary zones through `import/no-restricted-paths` | FRD X14 §7 names `no-restricted-imports` | A11 | W-F1 |
| 14 | A value credit line stored as `qty 1 × taxable_value` | print shape unstated | A15 | W-F5 |
| 15 | The statement CSV exports the running-balance rows only; deposit lines are not in it | FRD X01 silent | A2 | W-M2 |
| 16 | A payment's ledger `source` carries `adjustment: true` on the lines of a deposit adjustment (absent otherwise), so the out line reads "Adjusted from deposit", not "Deposit returned", on the khata and the customer's statement | FRD X02 §8 names the words by direction only | gate (A4b) | — |
| 17 | `party_balance_nonzero` carries `can_write_off: false` + `amount` while a loan is open (see CR-2026-09-30-LED-11) | LED-11 / PTY-04 FR-3 | gate (A2) | — |
| 18 | The khata's module panels are mounted for every party (not only while a module with party roles is on) and a registered panel may say which parties it is for (`appliesTo`); a registration module imported bare must be in `package.json` `sideEffects` | FRD X04 §7 | gate (A6, A4b) | W-F3 |
