# Part 35 — Definition of Done

"Done" is the most abused word in software. It means "I stopped working on it", "it works on my machine", "I would ship it", "the ticket is closed" — five different things, none of them checkable. This chapter replaces all five with a single rule and five checklists.

## 35.1 The objectivity rule

> **Every line of every checklist in this chapter is objectively verifiable: a command that passes, a file that exists, a number that meets a threshold, or a string that matches. No line requires a judgement about quality, taste or sufficiency.**

This is not pedantry. A Definition of Done containing "code is clean", "tests are adequate" or "performance is acceptable" is not a definition — it is an invitation to negotiate, and at three in the morning before a launch the negotiation always ends the same way. A line that cannot be checked by a command or by looking at a specific artefact does not belong in this chapter, and if you find one here it is a defect to be fixed.

Two consequences follow. First, **the agent can self-certify.** Part 34 §34.4 step 10 sends the coding agent to these checklists, and because every line is mechanical, an agent's claim of "done" is a claim about facts rather than about feelings. Second, **a disagreement about done is always resolvable**: one of the two people runs the command.

### 35.1.1 The five levels

| Level | Unit | Who certifies | Where the evidence lives |
|---|---|---|---|
| **1 — Task** | One `TSK-` row from Part 33 | The coding agent, then the reviewer | The PR |
| **2 — Feature** | One `<MODULE>-<NN>` feature from Part 16 | The reviewer, against the FRD | The traceability matrix |
| **3 — Sprint** | One sprint from Part 32 | The developer, at the boundary | The sprint review recording |
| **4 — Phase** | Phase 1 or Phase 2 | The product owner | The phase exit record |
| **5 — Launch** | Release 1.0 | The product owner, once | Part 12 §12.8, fully evidenced |

Each level **includes** the level below it. A feature is not done unless every one of its tasks is done; a sprint is not done unless every committed feature is done. Nothing skips a level, and no level may be certified by the same act that certified the level below — a passing CI run makes a task done, but it does not make a feature done, because a feature's acceptance criteria are demonstrated, not compiled.

### 35.1.2 What "not done" produces

A task that fails its DoD is not merged. A feature that fails its DoD is carried, reset, split or cut per Part 32 §32.1.5 — never marked done with a caveat. A sprint that fails its DoD is recorded as having failed it, with the specific lines that failed, because that record is how the velocity estimate is calibrated. There is no "done with follow-ups"; a follow-up is a new task and the feature is not done until it is merged.

---

## 35.2 Level 1 — the task Definition of Done

Checked by the coding agent before reporting, and by the reviewer before merging. Every line applies to every task; a line that genuinely cannot apply (an `Infra` task has no i18n) is marked **n/a** with one word of reason, never left blank.

### 35.2.1 Code

- [ ] Every file the task's Part 33 `Files` column names exists at exactly that path.
- [ ] No file outside that column was modified, or the PR explains each extra file.
- [ ] `black --check`, `isort --check-only`, `ruff check` exit 0 (backend).
- [ ] `npx tsc --noEmit` exits 0 and `npx eslint . --max-warnings=0` exits 0 (frontend).
- [ ] `mypy apps/common apps/*/services` exits 0.
- [ ] No file exceeds 300 lines (Part 25 R-FN-4); a `wc -l` over the diff proves it.
- [ ] `pytest tests/architecture` exits 0 — the import matrix, the unscoped-queryset AST check, the dependency allow-list and the settings shape all hold.
- [ ] `git diff` contains no `any`, no non-null assertion, no unexplained `as`, no `print`, no `console.log`, no commented-out code, and no `TODO` without an issue id.
- [ ] `package.json` and `requirements/*.txt` are unchanged, **or** the PR links a merged ADR for each addition.
- [ ] Every identifier the task introduces — status value, error code, permission codename, table name, event name — appears verbatim in Part 0; `grep` proves it.

### 35.2.2 Tests

- [ ] Every business rule in the task's `FRD` column has at least one test carrying its `T-<FEATURE>-n` marker.
- [ ] Every error branch the task can produce has a test asserting the status code **and** the canon error code.
- [ ] Test-first was used where Part 34 §34.4 step 5 requires it, and the commit history shows the test committed before the implementation.
- [ ] `pytest apps/<app> --cov=apps/<app>` meets the Part 28 §28.7 floor for each file's layer: services 95 %, selectors 90 %, serializers 90 %, views 85 %, models 80 %.
- [ ] `npx jest --coverage` meets the frontend floors: utils and view-models 95 %, redux 90 %, `Ub*` 85 %, components 70 %.
- [ ] The overall gate holds: backend ≥ 85 % line, frontend ≥ 75 % line, and the PR lowers neither by more than 0.5 pp.
- [ ] No test was deleted, skipped or had its assertion weakened; if one was, the PR names it and the reason.
- [ ] Every new test contains at least one `assert`; the no-assertion lint passes.

### 35.2.3 Data

Applies to any task touching `migrations/`.

- [ ] `python manage.py makemigrations --check --dry-run` exits 0.
- [ ] Exactly one migration in the PR.
- [ ] `migrate` forward then backward on a copy of the seeded database both succeed.
- [ ] Every constraint and index is named with the `uq_` / `ck_` / `ix_` prefix and matches Part 21 §21.3–§21.4.
- [ ] Every FK declares `on_delete` per Part 21 §21.5 and a `related_name`.
- [ ] Money uses `MoneyField`, quantity `QuantityField`, cost `UnitCostField`, rate `RateField` — `grep -n "DecimalField\|FloatField"` over the diff returns nothing.
- [ ] A data migration is a separate file, batched, and reversible or explicitly `noop` with a reason.
- [ ] If the task writes to a cached column, `recalc_balances --dry-run` and `recalc_stock --dry-run` both report zero drift afterwards.

### 35.2.4 Interface

Applies to any task touching a serializer, view or URL.

- [ ] The request and response shapes match the relevant Part 22 section field for field, including money as strings with exactly two decimals.
- [ ] The envelope is `{data, meta?, message?}` on success and `{error: {code, message, details, request_id}}` on failure.
- [ ] Every error path returns a canon error code from the Part 22 §22.1 list.
- [ ] Pagination matches the endpoint's declared style, and `meta.totals` — where the endpoint has one — is computed over the **filtered** set, proven by a test with two different filters.
- [ ] `permission_classes` is explicit and every action maps to a registered codename.
- [ ] A creating POST for a document, payment or ledger entry carries `@idempotent` and has a replay test.
- [ ] A cross-tenant id on every new route returns 404 with `not_found`, covered by the generated sweep.

### 35.2.5 Interface (frontend)

- [ ] The screen renders every state the FRD §9 table lists — typically loading, first-use empty, filtered empty, success, validation error, server error with retry and request id, permission-disabled, and any feature-specific state.
- [ ] Each state has a component test.
- [ ] The layout is usable at 360 px with a 44 px minimum touch target and no horizontal page scroll; the mobile-viewport Playwright project passes.
- [ ] No hard-coded colour, no Tailwind default-palette class, no inline `style` without a comment; `grep -nE "#[0-9a-fA-F]{6}|(bg|text)-(red|blue|gray|green)-[0-9]"` over the diff returns nothing outside `tokens/`.
- [ ] Every coloured amount carries its label; colour is never the only signal.
- [ ] Typography uses `ds-*` and every amount uses `ds-num`.

### 35.2.6 Language

- [ ] Every user-facing string is a `t('key')`, including `aria-label`, `placeholder` and `title`.
- [ ] Every new key exists in **both** `locales/en.json` and `locales/hi.json`; `npm run i18n:check` exits 0.
- [ ] Server-side user-facing messages use `gettext_lazy` and have `hi` entries in `django.po`.
- [ ] Nothing is concatenated; plurals use ICU; dates go through the shared formatters with the tenant timezone.
- [ ] The copy matches the FRD §8 key table exactly where one exists.

### 35.2.7 Security and observability

- [ ] The permission matrix in `tests/matrix/permissions.py` has a row for every new (method, route) × each of the four roles, and the matrix test passes.
- [ ] Tenant scoping is proven by the generated sweep, not by inspection.
- [ ] `grep` over the diff finds no mobile number, party name, note, amount, token or OTP in any log call, analytics payload or job payload; the PII test passes.
- [ ] Every state change writes exactly one audit row with `before`/`after` per Part 21 §21.7, asserted by a test.
- [ ] Every analytics event the FRD §18 lists is emitted with its declared properties and asserted by at least one test.
- [ ] Logging is structured, on the `ub.<app>` logger, with `extra`.

### 35.2.8 Documentation

- [ ] Services and models carry docstrings; service docstrings name the FRD rules enforced, the locks taken and the exceptions raised.
- [ ] Every business-rule comment cites its FRD clause.
- [ ] The PR description follows Part 34 §34.9.3 in full, including the assumptions section.
- [ ] Any assumption made is recorded as a clarification request, blocking or not.

### 35.2.9 Accessibility

- [ ] Focus-visible rings present and never removed.
- [ ] Interactive elements reachable and operable by keyboard in a sensible order.
- [ ] Form controls have labels; errors are associated with their field and announced via `aria-live`.
- [ ] `axe-core` reports zero critical violations on the screens the task touches.
- [ ] Contrast pairs pass; `npm run check:contrast` exits 0.

### 35.2.10 The gate

- [ ] `make ci` exits 0.

---

## 35.3 Level 2 — the feature Definition of Done

A feature is done when every one of its tasks is done **and** all of the following are true. This level is certified against the FRD, not against the code.

### 35.3.1 Specification coverage

- [ ] Every `FR-n` in the feature's §4 has at least one test; the traceability build reports zero unimplemented.
- [ ] Every `BR-n` in §11 has at least one test.
- [ ] Every `EC-n` in §13 has at least one test.
- [ ] Every `AC-n` in §22 has been **demonstrated on the merged build**, not merely compiled — the demonstration is recorded in the sprint review capture with a timestamp.
- [ ] Every `T-<FEATURE>-n` in §21 maps to at least one executed test; `build_traceability` reports zero unimplemented for this feature ID.
- [ ] Orphaned tests — executed tests carrying an ID not in any FRD — have been reviewed and either given an FRD entry or renamed.

### 35.3.2 Behavioural completeness

- [ ] Every state in §9 renders on the real build, in both locales, at 360 px and 1280 px.
- [ ] Every permission row in §12 behaves as stated for all four system roles, proven by the matrix.
- [ ] Every API requirement in §14 is implemented and matches Part 22.
- [ ] Every database write listed in §15 happens, and no write outside that list happens — verified by a test that counts rows touched.
- [ ] Every audit action in §16 is written with the declared `before`/`after`.
- [ ] Every notification in §17 fires under its stated condition and is suppressed under its stated exclusions.
- [ ] Every analytics event in §18 is emitted with its declared properties.
- [ ] Every security control in §19 is present: scoping, escaping, validation, rate limit, and no PII in telemetry.
- [ ] Every performance budget in §20 is met, measured on the reference profile against the seeded fixture.

### 35.3.3 Integration

- [ ] The feature's dependencies in §23 are all merged; none is stubbed.
- [ ] Every other feature that consumes this one still passes its own tests — the full suite is green, not just this feature's.
- [ ] The E2E critical-path suite is green.
- [ ] `recalc_balances` and `recalc_stock` report zero drift on the seeded fixture after exercising this feature.
- [ ] If the feature appears in the Part 12 §12.6 demo script, its step runs without an apology.

### 35.3.4 Cut-line integrity

- [ ] Nothing in the feature was reduced by removing an `en`/`hi` key, a permission check, an audit row or a test. Part 12 §12.7 is explicit: such a removal is a defect, not a cut.
- [ ] Any reduction that was taken is one the FRD names as permissible, and it is recorded in Part 39.

---

## 35.4 Level 3 — the sprint Definition of Done

Certified at the sprint boundary, before the review, by running the list rather than recalling it.

- [ ] Every feature in the sprint's Part 32 commitment is Level-2 done, or classified carry / reset / split / cut per Part 32 §32.1.5 with the classification written down.
- [ ] The sprint's exit criteria from its Part 32 section are each individually true, with evidence linked.
- [ ] The sprint's demo script runs end to end on the **merged** build, and the run is recorded as a screen capture.
- [ ] Demo-script coverage — the proportion of the eight-minute Part 12 §12.6 script that runs — is measured and recorded against the Part 32 §32.15.2 projection.
- [ ] `main` is green: `make ci` passes on the merge commit.
- [ ] Coverage has not regressed by more than 0.5 pp on either stack.
- [ ] Zero severity-1 defects are open. Severity-2 defects are listed with owners.
- [ ] The traceability matrix reports zero unimplemented IDs for every feature marked done this sprint.
- [ ] Actual points completed are appended to the estimate history, and the pattern-reuse factor `f` of Part 33 §33.8.3 is recomputed.
- [ ] Every clarification request raised during the sprint is answered or explicitly deferred with a date.
- [ ] Every assumption recorded in a PR this sprint is either confirmed by a specification update or raised as an open question in Part 18 §18.15.
- [ ] `docker compose down && docker compose up` from a clean checkout still produces a working application — proven, not assumed.
- [ ] One retrospective change is written down (Part 32 §32.16.1 caps it at one).

---

## 35.5 Level 4 — the phase Definition of Done

Certified once per phase, by the product owner, against the roadmap rather than the sprint plan.

- [ ] Every feature assigned to the phase in Part 13 is Level-2 done, or formally cut with a Part 39 entry naming the release it returns in.
- [ ] Every sprint in the phase is Level-3 done.
- [ ] The phase's exit criteria from Part 13 (§13.2 for Phase 1, §13.3 for Phase 2) are each individually demonstrated.
- [ ] The phase's correctness gates are green on production-scale data:
  - zero balance drift over ≥ 100,000 ledger entries including backdated, reversed, corrected and voided rows;
  - zero stock drift for every item and location;
  - the GST fixture suite green including at least one document dated before 2025-09-21;
  - invoice numbering verified under concurrency including the FY rollover;
  - the cross-tenant probe suite returning 404 on every endpoint;
  - the idempotency replay suite green on every document and payment POST.
- [ ] Every performance budget in Part 12 §12.5 is met on the reference device over a throttled connection, measured and recorded.
- [ ] The specification-drift review (Part 32 §32.16.3) has been run and every divergence closed in one direction or the other.
- [ ] The estimate history is complete and the next phase's estimate is re-based on it per Part 13 §13.8.
- [ ] Every ADR raised during the phase is merged or withdrawn; none is open.
- [ ] The phase's actual duration is recorded against its estimate.

---

## 35.6 Level 5 — launch readiness

Launch readiness is Part 12 §12.8 in full. This chapter does not restate it, because restating a checklist is how two versions of it come to exist. What this chapter adds is the **evidence rule**:

> Every box in Part 12 §12.8 is ticked only with a link to the artefact that proves it: a CI run id, a recorded measurement, a screen capture, a signed-off document, or a named person's written confirmation. A tick without a link is not a tick.

The five gates that most often get ticked without evidence, and what the evidence must be:

| Checklist line | Acceptable evidence | Not acceptable |
|---|---|---|
| "Automated database backup with a **restore** rehearsed and timed" | A dated record of a restore performed on a clean machine, with the RPO and RTO measured | "Backups are configured" |
| "Print output verified on one A4 laser and one 80 mm thermal printer physically" | Photographs of both printed documents | "The print preview looks right" |
| "All budgets met on the 2 GB Android reference device" | A recorded measurement run naming the device, the network profile and each number | A Lighthouse score from a laptop |
| "Ten merchants have completed the pilot and at least five report at day 45 that they no longer maintain the paper khata" | Five structured interview records | Anecdote |
| "Support ownership defined in writing with response targets" | The signed document | "Partner does L1" |

---

## 35.7 The done report

### 35.7.1 Task-level report

The coding agent produces exactly this when it finishes a task. It goes in the PR description's closing section and nowhere else.

```
DONE REPORT — TSK-LED-01-05
────────────────────────────────────────────────────────────
TASK        Implement post_entry()
FEATURE     LED-01 · EPIC-LEDGER · Sprint 4
LAYER       BE          POINTS  est 5 · actual 6

BUILT
  apps/ledger/services/entry.py          post_entry(), _party_sms_enabled()
  apps/parties/services/balance.py       apply_balance_delta()
  apps/ledger/exceptions.py              FutureEntryDate, PaymentModeRequired
  apps/ledger/tests/test_services.py     9 tests
  apps/ledger/tests/test_concurrency.py  1 test

DISCHARGES
  FR-5, FR-9 · BR-1, BR-2, BR-3, BR-4, BR-6, BR-7, BR-9, BR-10 · EC-5, EC-7

TESTS ADDED
  T-LED-01-1  debit updates balance, receivable_total, payable_total exactly
  T-LED-01-2  credit without payment_mode → validation_error
  T-LED-01-3  future entry_date rejected; tenant-TZ "today" accepted
  T-LED-01-4  credit limit warn/block/override + override audit row
  T-LED-01-12 concurrent posts to one party serialise; final balance exact

GATES
  black/isort/ruff     pass
  mypy                 pass (apps/ledger/services)
  makemigrations       clean
  pytest apps/ledger   41 passed, 0 failed
  coverage             services 97.2 % (floor 95)
  architecture         pass
  permission matrix    pass (4 roles × 2 new routes)
  cross-tenant sweep   pass
  query budget         6 statements per post (budget 8)
  recalc_balances      zero drift
  make ci              PASS

DoD LEVEL 1          all 47 applicable lines ticked; 6 n/a (no FE, no i18n)

ASSUMPTIONS
  1. `note` stripped and truncated to 255 server-side. CR-014, non-blocking.

NOT DONE IN THIS TASK
  Attachment link (FR-10) → TSK-LED-01-17
  Optimistic UI and retry (FR-12) → TSK-LED-01-18
```

### 35.7.2 Feature-level report

Produced when the last task of a feature merges, and attached to the sprint review.

```
FEATURE DONE REPORT — LED-01 · Record "You gave" / "You got"
────────────────────────────────────────────────────────────
SPRINT      4            TASKS  22 of 22 merged
POINTS      est 55 · actual 61 (+11 %)

COVERAGE OF THE SPECIFICATION
  FR   12 of 12 tested          BR   10 of 10 tested
  EC   10 of 10 tested          AC    6 of 6 demonstrated
  T-   12 of 12 implemented     orphans 0

DEMONSTRATED (sprint review capture, 14:07–14:19)
  AC-1 ₹2,300 + You gave ₹500 → ₹2,800, manual_gave, posted
  AC-2 You got ₹300 UPI + UTR → ₹2,500, no payments_payment row
  AC-3 Yesterday chip → entry_date 2026-09-17, row under 17 Sep
  AC-4 4 MB photo → 287 KB attachment, thumbnail on the row
  AC-5 block refuses staff, owner override posts + audit row
  AC-6 network failure preserves the draft; retry posts exactly one entry

MEASURED
  POST /ledger-entries P95      188 ms   (budget 250)
  drawer open after tap          74 ms   (budget 100)
  statement, 5,000 entries      1.12 s   (budget 1.5)
  recalc_balances, 10k entries  zero drift
  bundle delta                  +11.4 kB gz

QUALITY
  services coverage 97.2 % · frontend view-model 98.1 % · components 78 %
  axe-core critical violations 0
  i18n: 34 new keys, en and hi complete
  permission matrix: 4 roles × 4 routes, all as specified
  audit: ledger.entry.created + ledger.credit_limit.overridden verified
  analytics: ub.ledger.entry_posted, entry_post_failed, entry_drawer_opened

DoD LEVEL 2          all lines ticked
CUT-LINE INTEGRITY   nothing reduced; no key, check, audit row or test removed

OPEN
  CR-014 whitespace policy for free-text fields — non-blocking, answered
  DEF-031 timeline scroll jump on backdated insert — severity 3, Sprint 5
```

---

## 35.8 A worked DoD — LED-01, completed

What follows is the Level-1 checklist as it actually stood for `TSK-LED-01-05` at merge, with the evidence for each line rather than a bare tick. It is included because a checklist nobody has seen filled in is a checklist people fill in from memory.

**Code**

| Line | Evidence |
|---|---|
| Files exist at the Part 33 paths | `apps/ledger/services/entry.py`, `apps/parties/services/balance.py` — both present, no others |
| No unexplained extra files | `apps/ledger/exceptions.py` added; explained in the PR (two new `DomainError` subclasses the task raises) |
| Formatters clean | `black --check` / `isort --check-only` / `ruff check` → exit 0 |
| Types clean | `mypy apps/ledger/services` → `Success: no issues found in 4 source files` |
| No file over 300 lines | `entry.py` 141 lines, `balance.py` 38 |
| Architecture tests pass | `pytest tests/architecture` → 11 passed. `apps.ledger` imports `apps.parties` — permitted by the D4 exception table |
| No banned constructs | `grep -nE "print\(|TODO(?!\()|# type: ignore"` over the diff → nothing |
| Dependencies unchanged | `git diff requirements/` → empty |
| Identifiers match canon | `manual_gave`, `manual_got`, `posted`, `manual`, `ledger.entry.write`, `credit_limit_exceeded`, `party_archived` — each `grep`-confirmed in Part 0 |

**Tests**

| Line | Evidence |
|---|---|
| Every BR tested | BR-1 → `T-LED-01-7`; BR-2/3/4 → `T-LED-01-1`; BR-6 → `T-LED-01-4`; BR-7 → `test_manual_got_creates_no_payment_row`; BR-9 → `T-LED-01-6`; BR-10 → `test_string_amount_normalised` |
| Every error branch tested | `FutureEntryDate` 400, `PaymentModeRequired` 400, `PartyArchived` 409, `CreditLimitExceeded` 409 — four tests asserting both status and code |
| Test-first observed | Commit `a3f1c02` "test(TSK-LED-01-05): failing tests for post_entry" precedes `9b7e441` by 40 minutes |
| Coverage floor | `apps/ledger/services` 97.2 % line, 93.1 % branch (floors 95 / 90) |
| Overall gate | backend 86.4 %, +0.2 pp on the PR |
| Nothing skipped | `grep -rn "pytest.mark.skip\|xfail"` over the diff → nothing |

**Data**

| Line | Evidence |
|---|---|
| `makemigrations --check` | Exit 0 |
| One migration | `0001_initial.py` only (delivered by `TSK-LED-01-01`; this task adds none) |
| Forward and backward | `migrate ledger 0001` then `migrate ledger zero` both clean on the seeded database |
| Named constraints | `ck_ledger_entry_amount_positive`, `ck_ledger_entry_direction`, `ck_ledger_entry_reversal_has_source`, `ix_ledger_entry_party_date` + 3 |
| Field classes | `grep -n "DecimalField\|FloatField"` over the diff → nothing |
| Cache integrity | `recalc_balances --dry-run` after the 10,000-entry fixture → `0 parties with drift` |

**Interface**

| Line | Evidence |
|---|---|
| Shape matches Part 22 §22.5 | Contract test compares the 201 body against the §14 shape key by key |
| Envelope | `{data, meta:{party_balance, warnings}}`; 409 returns `{error:{code:"credit_limit_exceeded", …, request_id}}` |
| Canon error codes | All four asserted by string, not by status alone |
| `permission_classes` explicit | `[ModuleEnabled("ledger"), HasPermission]` with a `permission_map` |
| Idempotency | `@idempotent(scope="ledger_entry")`; replay test asserts an identical body, `Idempotent-Replayed: true` and one row |
| Cross-tenant 404 | Generated sweep covers `POST /ledger-entries` and `GET /ledger-entries/{id}` |

**Language** — n/a for this task (no user-facing string; the drawer is `TSK-LED-01-16`). The two new exception messages use `gettext_lazy` and have `hi` entries in `django.po`, so the applicable half is ticked.

**Security and observability**

| Line | Evidence |
|---|---|
| Permission matrix rows | 2 routes × 4 roles + anonymous + other-tenant = 24 cells declared and asserted |
| PII sweep | `pytest tests/architecture/test_no_pii.py` → pass; the SMS job payload carries `entry_id` only |
| One audit row | `test_post_entry_writes_exactly_one_audit_row` counts rows before and after |
| Analytics | Emitted by the client task, not this one; noted as deferred to `TSK-LED-01-16` |

**Documentation** — docstrings on both services name the rules, the locks and the raises; the lock comments carry `L1`; the PR follows §34.9.3 and records CR-014.

**Accessibility** — n/a (no UI in this task).

**Gate** — `make ci` → `PASS` at commit `9b7e441`.

**Result: 47 applicable lines ticked, 6 marked n/a with reasons, 0 failed. Merged.**

---

## 35.9 The one rule that makes all of this work

Every checklist in this chapter is worthless if a line can be ticked without being checked. So:

> **A tick is a claim of fact. If the reviewer re-runs the command and it does not produce what the tick claimed, that is a defect against the person who ticked it, not a disagreement about the line.**

That is a deliberately sharp rule, and it is the only one in this chapter that is about people rather than commands. It exists because the failure mode of a long checklist is ritual — working down it at speed, ticking from memory, arriving at the bottom having verified nothing. A checklist that is ritually ticked is worse than no checklist, because it produces confidence without evidence.

The defence is that every line here can be checked in seconds by a command, and that the reviewer spot-checks three lines at random on every PR. Three out of forty-seven is cheap, and it is enough: an agent or a developer who knows three lines will be re-run has no way to predict which three, so the only strategy that works is checking all of them.

---
