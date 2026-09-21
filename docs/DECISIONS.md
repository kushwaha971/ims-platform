# DECISIONS — the implementation decision log

**Status:** live working document. Appended to daily during the build.
**Owner:** the **lead developer** (Part 32 §32.1.1) holds this register: triages every entry, answers or routes it within one working day, and is accountable for the register being current rather than for being right about everything in it.
**Deciders** are named per entry and are drawn from Part 37's vocabulary — Product, Engineering, Commercial, Compliance, Operations — because a decision with a committee instead of a decider does not close.

---

## 1. What this is, and what it is not

Three registers already exist and each answers a different question. This is the fourth, and it exists because none of them answers the question an implementer actually asks at 11 a.m. on a Tuesday.

| Register | Answers | Cadence |
|---|---|---|
| Part 38 — ADRs | *Why is the architecture this shape?* | Rare, deliberate, written up |
| Part 39 — Product decision log | *Why does the product do this and not that?* | Per product decision, Class A/B/C |
| Part 37 — Open questions | *What have we deliberately deferred, and on what default?* | Per deferred decision, with a deadline |
| **This file** | *The specification does not say, or says two things. What do I do, right now, and who said so?* | Daily |

A `DEC-` entry is the **smallest unit of governance in the build**: a choice made during implementation, recorded in one screen, with a name against it. It is not an ADR — an ADR is what a `DEC-` entry becomes when it turns out to be structural. It is not a CR — a CR changes the specification, and most `DEC-` entries do not.

**Record a `DEC-` entry when any of these is true.**

1. **Two chapters disagree and work cannot wait for the CR.** Record which side was taken and why, raise the CR in `docs/CR-LOG.md`, and carry on. The entry is what makes the choice visible; the CR is what makes it permanent.
2. **The specification is silent and the build must choose.** A name, a default, an ordering, an error message, a threshold — anything an implementer would otherwise invent without telling anyone.
3. **The specification is followed and it produces a bad outcome.** Recording "we did it as written and it is wrong" is the only way the corpus learns.
4. **A default from Part 37 is being relied on.** The `OQ-` entry states the default; this entry states that we are now *standing on* it, in named code, so that reversing it has a known cost.
5. **A cut, a deferral or a scope reduction inside a feature.** Part 12 §12.7 cuts also go to Part 39; this entry is the same-day record so the sprint report is accurate.

**Do not record** a routine coding choice with no consequence beyond its file, a defect (that is an issue), or a decision that only restates a chapter. A register that records everything records nothing.

## 2. Numbering and format

Entries are `DEC-001` upward, allocated in the order raised, never reused, never renumbered. An entry that is withdrawn stays with `status: withdrawn` and a reason.

Every entry carries exactly these nine fields. Fewer is a draft; more is an ADR.

```markdown
### DEC-nnn — <the decision, as a sentence somebody could disagree with>

- **Status:** open | decided | defaulted | superseded by DEC-nnn | withdrawn
- **Raised:** YYYY-MM-DD by <who or `agent`>   **Decider:** <role>   **Deadline:** <date or gate>
- **Context:** what was being built, and what stopped.
- **The choice:** the options, each with what follows from it. An option with no stated consequence has not been thought about.
- **Decision:** what we are doing. One paragraph.
- **Default if unanswered:** what happens automatically at the deadline. Every open entry has one.
- **Blast radius:** what has to change if this is reversed later, and roughly what that costs.
- **Links:** `OQ-nn` · `CR-nnn` · `ADR-nnn` · Part §
- **Decided:** YYYY-MM-DD by <who>
```

The **Default if unanswered** field is what makes this register a working document rather than a queue. Part 37 §37.1's principle applies here at a shorter timescale: a team that cannot proceed without an answer has a blocker, and a team that proceeds without knowing it needed an answer has a latent defect. An entry with a default is the third thing — proceed, on a stated basis, with the cost of being wrong written down.

## 3. The response target, and what happens when it is missed

**24 hours — one working day — from the moment an entry is raised to the moment the owner has answered it or named the decider and the deadline.** The target is on the *owner's response*, not on the decision closing; many decisions legitimately need a week, and the thing that must not take a week is somebody acknowledging that the question exists.

The target exists because of who is asking. An AI coding agent working under Part 34 does not stop and wait indefinitely; it either blocks — in which case a day of throughput is gone — or it chooses, in which case the choice is invisible. Twenty-four hours is the interval at which neither happens.

**The escalation path, because a target with no consequence is a wish:**

| Elapsed | What happens | Who does it |
|---|---|---|
| **0 h** | The entry is appended with its context, options and a proposed default. The task that raised it is marked blocked on `DEC-nnn` and the agent moves to the next task in the sprint's declared order. | Whoever raised it, including the agent |
| **24 h** | If unanswered: **the stated default takes effect automatically**, the entry's status becomes `defaulted`, and work resumes on the default. Every artefact built on it carries a `# DEC-nnn` comment at the point of the choice, so that reversing it is a search rather than an excavation. | Automatic |
| **72 h** | A `defaulted` entry that nobody has confirmed goes on the next sprint planning agenda as a named item, with the work already built on it listed. This is the point at which a default stops being a convenience and starts being a commitment. | Owner |
| **Sprint boundary** | Every `defaulted` entry from the sprint appears in the sprint report (Part 35 §35.4) with the code that now depends on it. A sprint that defaults more than three decisions is reported as a specification finding, not a velocity finding. | Owner |
| **Reversal** | Reversing a default after code depends on it is a **Class C** change: it goes to Part 39, its rework is estimated as named tasks in Part 33, and the estimate is published before the reversal is agreed. | Decider |

The one exception: **a decision that touches money, tax, tenancy or immutability never defaults.** Those four are canon §0.11's non-negotiables, and an entry against any of them blocks its task until a person answers. The register marks them `no-default` and they are the only entries permitted to have no default field.

## 4. Promotion — when a decision stops being a decision

A `DEC-` entry is cheap and local. Three signals mean it has outgrown this file, and each has a fixed destination.

| Signal | Promote to | Why |
|---|---|---|
| The same choice is made a third time, in a third place | **ADR** in Part 38 | Three instances is a pattern, and a pattern that lives only in a decision log is folklore. The ADR is written by the decider; the three `DEC-` entries become `superseded by ADR-nnn` and stay. |
| The decision constrains a future decision, or an implementer would need to know it before reading a chapter | **Canon amendment** — a CR against Part 0 in `docs/CR-LOG.md` | Canon is what is true before you start reading. A decision that has to be known first belongs there, and moving it there is a **major** corpus bump (`CR-LOG` §4). |
| The decision changes what the product does, what it costs or what ships | **Part 39** | Product decisions are recorded where a stakeholder looks for them. The `DEC-` entry keeps the same-day detail; Part 39 keeps the decision. |
| The decision answers an `OQ-` | **Part 37**, closing the entry | An open question that has been answered in the code and not in Part 37 is worse than one that is still open, because the register now lies. |

Promotion is the owner's weekly job and takes ten minutes: read the week's entries, ask of each whether it has been made before, and move the ones that have.

---

## 5. Open entries

The five below are Part 42 §42.6.1's blocking decisions. Every one of them was open when this file was created; every one of them will otherwise be made by the code, in the first week, silently. Each carries the default that applies if it is not answered by its deadline, and the defaults are deliberately the position the review recommends, so that inaction is at least coherent.

### DEC-001 — The paid wall: what is free, and what `PLT-15` actually enforces at MVP

- **Status:** open
- **Raised:** 2026-09-19 by the corpus review (Part 42 §42.6.1)   **Decider:** Commercial   **Deadline:** before Sprint 1 planning — `PLT-15` is committed in Sprint 1 (Part 32 §32.2)
- **Context:** Part 11 §11.2 and Part 1 §1.9 place the wall at multi-device and multi-user, inventory and GST depth, server-sent messaging and exports. Part 24 §24.9.1 — which owns the plan table (T-55) — seeds a `free` plan with `max_users: 1`, `max_parties: 300` and `max_invoices_per_month: 100`. Those are two different products. `PLT-15` must enforce something in Sprint 1 and there is nothing coherent for it to enforce.
- **The choice:** (a) Enforce the Part 24 numbers — consequence: a single-user free tier that caps the ledger, which contradicts the product's thesis that the ledger is never the thing you pay for, and which makes the free tier useless to exactly the merchant the pilot recruits. (b) Part 42 A-18's position: **owner plus two members free; the ledger is never capped in any tier; `PLT-15` at MVP enforces module entitlement and member count only**, with `max_parties` removed from enforcement and `max_invoices_per_month` unlimited on every MVP plan — consequence: `PLT-15` is small and shippable in Sprint 1, and the commercial shape stays open until `OQ-02` closes at Phase 2 entry. (c) Defer `PLT-15` out of the MVP — consequence: no entitlement mechanism exists when the first partner arrives, and the mechanism is not the part that is cheap to retrofit.
- **Decision:** —
- **Default if unanswered:** (b). `PLT-15` ships enforcing module entitlement and member count; the ledger is uncapped; `max_parties` and `max_invoices_per_month` are removed from enforcement on every MVP plan and `CR-124` amends Part 24 §24.9.1 to match.
- **Blast radius:** `PLT-15`'s enforcement code and tests, Part 24 §24.9.1 (T-55), Part 11 §11.2's differentiator list, Part 18 §18.12. Reversing it after launch means introducing a cap to merchants who are already over it, which is a churn event, not a migration.
- **Links:** `OQ-02` · `OQ-27` · `CR-124` · Part 42 A-18 · Part 24 §24.9.1
- **Decided:** —

### DEC-002 — Document rendering: one renderer or two

- **Status:** open
- **Raised:** 2026-09-19 by the corpus review (Part 42 §42.6.1)   **Decider:** Engineering   **Deadline:** before Sprint 4 — `CHS-PRINT` lands in Sprints 4 and 7 (Part 33 §33.4)
- **Context:** ADR-014 specifies client-side rendering — React print components and `window.print()` — with server-side PDF deferred to Phase 2. `SAL-03`, Part 23 §23.7 and Part 19 §19.1.4 each assume something slightly different, and `OQ-22` leaves the Phase 2 renderer open. A tax invoice is a legal document; two renderers means two documents that must agree to the paisa and to the millimetre, forever.
- **The choice:** (a) Keep ADR-014 and accept a second renderer in Phase 2 — consequence: two implementations of one legal artefact, with the divergence discovered by a merchant whose printed invoice does not match the PDF their customer received. (b) Part 42 A-14: **documents are server-rendered HTML from MVP; the browser print path prints that same HTML; one PDF runtime dependency is admitted by ADR, server-side only** — consequence: one document, one renderer, one place to fix a rounding difference, at the cost of one dependency admitted now rather than later and a small amount of Sprint 4 work moved server-side. (c) Server-side PDF from MVP — consequence: the heaviest option, and it buys nothing the merchant can see over (b).
- **Decision:** —
- **Default if unanswered:** (b), with the ADR-014 amendment raised as a CR the same day. The cost of being wrong about (b) is one dependency; the cost of being wrong about (a) is a permanent liability.
- **Blast radius:** ADR-014, Part 23 §23.7, `SAL-03`, Part 19 §19.1.4, `CHS-PRINT`'s task shape. Reversing after Sprint 7 means rewriting four print templates.
- **Links:** `OQ-22` · `ADR-014` · Part 42 A-14 · Part 42 CF-08
- **Decided:** —

### DEC-003 — Splitting the dependency policy: runtime closed, tooling open

- **Status:** open
- **Raised:** 2026-09-19 by the corpus review (Part 42 §42.6.1)   **Decider:** Engineering   **Deadline:** before Sprint 0 exit — `TSK-CHS-CI-03`, `-04` and `-05` pin the allow-list and assert it in CI
- **Context:** ADR-021's minimal-dependency stance is defensible on the deployment argument and has been applied to eighteen surfaces, of which roughly half are build-time or test-time tooling no security reviewer ever sees: a contrast checker, a bundle checker, an i18n checker and extractor, a traceability joiner with three runner integrations, three performance harnesses, a load script, a hand-written service worker and two hand-written QR encoders. Part 41 PE-02 prices that at eight to twelve engineer-weeks; Part 13 §13.2's re-derivation now carries about ten of them inside `EPIC-CHASSIS`.
- **The choice:** (a) Keep one closed list — consequence: the ten engineer-weeks stay in the plan, and two of the things we build ourselves (a service worker, a QR encoder) are *more* alarming to a reviewer than the libraries they replace. (b) Part 42 A-15: **split the policy into a closed runtime allow-list and a disciplined tooling allow-list**, admit a coverage plugin, a load tool and Workbox, and consolidate to one QR implementation — consequence: one ADR, a handful of dev dependencies that never reach production, and several sprints of the plan returned. (c) Open both lists — consequence: the deployment argument that justified ADR-021 is abandoned, which nobody is proposing.
- **Decision:** —
- **Default if unanswered:** (b). The runtime list stays exactly as ADR-021 has it; the tooling list opens under ADR discipline, meaning a one-paragraph ADR per admission rather than a debate.
- **Blast radius:** ADR-021, canon §0.4's dependency row (T-05), Part 18 C2, Parts 25 §25.13 and 26 §26.15, and `TSK-CHS-CI-03…05`, which assert the list in CI. Deciding this *after* Sprint 0 means re-pinning the lock files and re-running the assertion tests, which is cheap; deciding it after the tooling is hand-built means the ten weeks are already spent.
- **Links:** `OQ-16` · `OQ-17` · `OQ-18` · `OQ-19` · `CR-C3` · `ADR-021` · Part 42 A-15
- **Decided:** —

### DEC-004 — Phase 2 Variant B as the default, and who owns partner business development

- **Status:** open
- **Raised:** 2026-09-19 by the corpus review (Part 42 §42.6.1)   **Decider:** Commercial, with Product   **Deadline:** the named owner **this week**; the variant choice at Phase 1 exit (week 26)
- **Context:** Part 13 §13.3's entry criteria require "a named partner with a signed intent", its exit is a partner live on its own hostname with ten merchants transacting, and thirteen of its thirty-seven features serve the partner. Signing a partner is not inside the 26 weeks and is owned by nobody. If no partner signs, a quarter of the roadmap has no contents and the second revenue line does not begin.
- **The choice:** (a) Leave Phase 2 as specified and hope — consequence: the largest single-point risk in the company, owned by nobody, discovered at week 26. (b) Part 42 A-17: **add Phase 2 Variant B — depth-led and partner-independent — as the default when no signed intent exists at phase entry**, with a variant row on the release train — consequence: Phase 2 always has contents, the partner work is pulled forward the moment an intent is signed, and the roadmap stops being contingent on a signature. (c) Move partner work to Phase 3 outright — consequence: throws away the work already specified and the white-label architecture that Part 24 has already paid for.
- **Decision:** —
- **Default if unanswered:** (b) for the variant. For the owner there is **no default** — a named person owns partner business development by the end of the week, or the entry escalates as a `no-default` item, because "whoever is free" is how this became a single-point risk in the first place.
- **Blast radius:** Part 13 §13.3 and §13.6, Part 32's Sprint 13–21 contents, Part 24's phasing. Deciding late costs nothing in code and everything in calendar.
- **Links:** `OQ-26` · Part 42 A-17 · Part 42 CF-01, CF-02 · Part 41 CEO-02
- **Decided:** —

### DEC-005 — Appointing a compliance owner and starting DLT registration

- **Status:** open · **no-default** for the appointment
- **Raised:** 2026-09-19 by the corpus review (Part 42 §42.6.1)   **Decider:** Operations   **Deadline:** appointment within two weeks of Sprint 0 start; DLT registration submitted by Sprint 2
- **Context:** DLT registration has a two-to-four-week lead time and every automated SMS the product sends depends on it. `LED-07` and `LED-08` are MVP features that Part 13 §13.2 marks configuration-gated — shipped complete, inert until a provider is configured — which is the right design and is not a substitute for the registration existing. Part 18 §18.16 requires a compliance signature the corpus cannot produce without a named owner, and `OQ-03` additionally leaves open whether registration is per Metis or per partner, which changes what is registered.
- **The choice:** (a) Appoint an owner now and start registration in parallel with Sprint 0 — consequence: SMS works at launch. (b) Start at Sprint 6, when messaging is built — consequence: the lead time lands on top of the launch window, and the feature ships inert. (c) Launch without automated SMS — consequence: `LED-07` and `LED-08` are configuration-gated anyway, so this is survivable, and it must then be an explicit line on the launch checklist rather than a discovery.
- **Decision:** —
- **Default if unanswered:** The **appointment does not default** — a compliance obligation with no named owner is the one thing this register will not paper over. The *scope* question defaults to per-Metis registration with per-partner sender IDs, per `OQ-03`'s own default. If no owner is appointed by Sprint 2, (c) applies automatically: `LED-07` and `LED-08` ship inert, and "automated SMS is not available at launch" goes on the Part 12 §12.8 checklist as a stated fact rather than an omission.
- **Blast radius:** `LED-07`, `LED-08`, `NTF-02`, `WLB-06`, Part 18 §18.16's signature, and the pilot's collection story, which is the thing the product is for.
- **Links:** `OQ-03` · `OQ-30` · Part 42 §42.6.1 · Part 41 CEO-07 · Part 18 R9
- **Decided:** —

---

### DEC-006 … DEC-009 — the four schema contradictions

`CR-C1`, `CR-C2`, `CR-C4` and `CR-C5` in `docs/CR-LOG.md` §5.1 are each blocked on a decision, and those decisions are `DEC-006` (the shape of `parties_share_link`), `DEC-007` (`files_attachment.tenant_id` and partner assets), `DEC-008` (which tables carry `version`) and `DEC-009` (`imports_job`'s configuration column). They are numbered here so the CR entries resolve, and their full entries are written when they are picked up — which for `DEC-006` and `DEC-009` is **Sprint 0**, because both tables are created in the first migration and both choices are cheap now and expensive once tokens and jobs exist. `DEC-006`, `DEC-008` and `DEC-009` default to Part 43 §43.4.6's stated recommendations; `DEC-007` is security-adjacent and is **no-default**.

---

## 6. Decided

Empty. The first entry here will be one of the five above, and the date it carries is the answer to "when did the build actually start on a settled foundation".


---

## Resolutions recorded 2026-09-19

### DEC-001 — status: `defaulted` (2026-09-19)

No answer from Commercial by the Sprint 1 planning deadline, so the stated default took
effect automatically per §the escalation rule. **In force:** `PLT-15` enforces module
entitlement and member count only. The ledger is never capped. `max_parties` and
`max_invoices_per_month` are removed from enforcement on every MVP plan.

Built to this exactly. Blast radius if Commercial reverses it:
`backend/apps/platform_app/services/entitlements.py` (`LIMIT_KEYS` / `REMOVED_AT_MVP`),
`backend/apps/platform_app/management/commands/seed_plans.py`, and the frontend's
`PlanUsageCard`. The structural test `test_no_removed_limit_key_is_read_anywhere_in_the_codebase`
makes the reversal a search rather than an excavation.

### DEC-003 — status: `defaulted` (2026-09-19)

Taken by what Sprint 0 actually needed. **In force:** the runtime allow-list stays exactly
as ADR-021 has it — no runtime dependency was added in Sprint 0, Sprint 1 or the DEC-010
change. The *tooling* list opened under ADR discipline: `postcss`, `autoprefixer`,
`jest-environment-jsdom`, `ts-node`, the `@types/*` packages, the ESLint plugins named by
§25.14, `prettier-plugin-tailwindcss` and `lint-staged` were required for the allow-listed
tools to run at all. `ruff` and `mypy` remain configured but uninstalled, which is the
ADR-021 ↔ §26.14 contradiction recorded as `CR-j`.

### DEC-010 — Identity at MVP is email + password; mobile OTP moves to the backlog

- **Raised:** 2026-09-19 by the owner   **Decider:** Owner (Product)   **Status:** `decided`
- **Decision:** authentication at MVP is **email + password only**. Mobile OTP, the SMS
  adapters and DLT registration move to the backlog.
- **Context:** the product runs locally for the owner's personal use first, with minimal
  third-party dependencies (the standing constraint behind ADR-021). A mobile-OTP flow
  needs a telecom provider and a DLT registration with a two-to-four-week lead time, for a
  product that currently has one user. Sprint 1 built the OTP flow before this was caught.
- **Consequences:** `mobile` survives as an **optional profile field** — parties, invoices
  and later WhatsApp all want it; it simply stops being how a person signs in. Password
  reset becomes a single-use hashed link delivered through a console backend that logs it,
  behind the same adapter interface a real mail provider will use. OTP is retired behind
  `UB_AUTH_OTP_ENABLED=0`, not deleted: the service, its model, its endpoints and all 37 of
  its tests remain and still run. `platform_otp_challenge` is not dropped.
- **What this unblocks:** DLT registration leaves the critical path entirely. `DEC-005`'s
  Sprint 2 deadline no longer gates Sprint 5's reminders — those move with the backlog.
- **Reversal:** flip `UB_AUTH_OTP_ENABLED=1` and the OTP endpoints return. Reversing the
  *identity* change is the expensive half: `platform.0004_email_identity` reverses cleanly
  only for rows the old schema could represent, i.e. users who have a mobile number.
- **Amends:** ADR-011 (mobile as the natural key) is superseded — see `CR-136`.

### DEC-011 — The product is named DigiKhaato; the repository folder stays `ims-platform`

- **Raised:** 2026-09-19 by the owner   **Decider:** Owner (Product)   **Status:** `decided`
- **Decision:** the product is named **DigiKhaato**. *UdhaarBook* was the working name and is
  retired. The name has been applied across the backend and all of the specification corpus.
  The **repository folder stays `ims-platform`** — it was chosen deliberately to be
  product-name-neutral, so that naming changes never become directory moves, and this
  decision is the first occasion on which that choice paid for itself. No directory is
  renamed to match the product, now or later.
- **Context:** the corpus was written under a working name and the name had reached the
  canon's product-identity table, every chapter title, the FRDs, the email and SMS
  templates and the operator-facing `README`s. Naming the product is cheap on the day it
  is decided and expensive every week it is deferred.
- **The domain vocabulary is untouched.** *udhaar*, *khaata*/*khata*, *jama*, *baaki*,
  *hisaab*, "you gave"/"you got" and the red/green direction semantics are the words Indian
  merchants actually use; they are grounded in Part 9 and fixed by canon §0.2, and they are
  **not** part of this rename. A sentence like "the udhaar a customer owes" is unchanged.
  The rename was applied occurrence by occurrence, never as a global substitution.
- **Namespaces are deliberately not renamed.** The `UB_` environment-variable prefix stays:
  it is a namespace, it spans 71 variables, and both
  `tests/architecture/test_env_example.py` and Part 29 §29.2.4 pin it — renaming it is churn
  with no reader benefit. The same reasoning keeps the `ub.` analytics event prefix
  (Part 31) and the `Ub*` design-system component prefix (Part 23, ADR-002). A namespace is
  an identifier, not a piece of copy.
- **Infrastructure identifiers are deliberately not renamed** in this pass and are raised as
  `CR-142`: the PostgreSQL database and role names (`udhaarbook`, `udhaarbook_backup`), the
  Compose project name, the `/srv/udhaarbook` deployment path, the `app.udhaarbook.in`
  family of hostnames and the `udhaarbook-backend` / `udhaarbook-frontend` image names.
  Each of those is a live identity with a migration, a DNS record or a certificate behind
  it. A product rename must not become a schema change or a cutover.
- **Name collision — read this before writing "DigiKhaato".** Metis Labs already operates an
  older money-management application that this corpus cites as an engineering reference,
  and **that application is also called DigiKhaato**; its udhaar ledger module was itself
  called UdhaarBook. The corpus now writes the predecessor as **legacy DigiKhaato**
  throughout, and the unqualified name always means the product specified here. Canon §0.1
  carries the definition. The four surviving occurrences of *UdhaarBook* in the corpus —
  `PD-05`'s title and table row, and two lines in `STATUS.md` — name the **legacy** module
  or a delivered artefact and are correct as they stand. See `CR-145`.
- **Blast radius:** if the name is reversed, the affected surfaces are the canon §0.1
  identity table, every chapter's prose, `apps/platform_app/services/passwords.py::APP_NAME`
  and `otp.py::_app_name()` (which together feed every OTP SMS, reset email and verification
  email through the `{app_name}` placeholder in `services/messaging.py`), the
  `UB_EMAIL_FROM` default, and the log filename in `apps/common/logging.py`. It is a
  copy change everywhere and a schema change nowhere, which is the property that made it
  safe to do in one pass.
- **Links:** `CR-142` · `CR-143` · `CR-144` · `CR-145` · canon §0.1 · Part 29 §29.2.4 ·
  Part 31 · Part 23 · `BACKLOG.md`
- **Decided:** 2026-09-19 by the owner

### DEC-012 — An owner creates a member's login and hands it over; email delivery is backlogged

- **Status:** `decided` (2026-09-21, by the owner)
- **The question:** `PLT-05` invitations were built and nothing delivered them. `invite()`
  created a row and returned a link; `UB_EMAIL_BACKEND` is the console backend, so no
  message left the machine, and the UI said "Invitation sent." over an act that sent
  nothing. Either email gets funded or the product needs a way to add staff without it.
- **Decided:** the owner creates the account outright. The server generates a temporary
  password, returns it **once**, and the owner passes it on by hand. The member is forced
  to choose their own password before any other route answers.
- **Why this and not email**, in the owner's words: the platform is not earning yet and
  email is a cost — a provider, a domain, SPF and DKIM records, and deliverability to fix
  when it goes to spam. But the reasoning is not only cost. WhatsApp is how an Indian
  shopkeeper reaches their salesman, so the message was going to travel that way whichever
  we built; and a password typed into the ordinary sign-in screen is something a shop
  assistant on a cheap Android already understands, where a long URL in a chat message
  opens in an in-app browser and loses the session. The security difference is smaller
  than it looks: a link in a WhatsApp thread and a password in a WhatsApp thread are the
  same secret on the same shared phone.
- **The invitation flow is KEPT, not replaced.** The token path *is* the email path. When
  delivery is funded it is already built and tested, and nothing has to be rebuilt.
- **What was deliberately NOT copied from BrandHub's `temp_password_utils`,** which is the
  pattern this was asked to follow:
  - its generator draws from `random`, the Mersenne Twister — a predictable sequence whose
    state is recoverable from enough outputs. Fine for shuffling, wrong for minting a
    credential. This uses `secrets`. **The same one-line defect is live in BrandHub.**
  - it stores the password Fernet-encrypted so an admin can read it back. `regenerate()`
    gives the same outcome without a decryptable plaintext password at rest, without a key
    to manage, and without the `cryptography` dependency `ADR-021` does not admit.
- **Safeguards that are not in BrandHub's version:** the temporary password expires after
  `UB_INVITATION_DAYS` (7), so an account nobody claimed is not a live login sitting in a
  chat thread forever; `regenerate()` bumps `token_epoch`, so a leaked password does not
  leave a live session behind it; and reissuing is **refused** once the person has chosen
  their own password, which is the line between a resend and an owner walking into a staff
  member's account.
- **An address that already has an account keeps its own password.** It is added to the
  team and told to sign in as usual. Issuing a new password there would be a takeover
  wearing an onboarding costume.
- **Enforcement is in `CookieOrBearerJWTAuthentication.authenticate()`**, not a permission
  class. Every view in this product declares its own `permission_classes`, which overrides
  the defaults, so a permission class would have to be remembered on every view ever added
  and the one place it was forgotten would be the hole. There is one door into an
  authenticated request.
- **Two error codes beyond Part 22 §22.1.1:** `password_change_required` (403) and
  `password_expired` (401). Neither could reuse an existing code without sending the person
  to the wrong screen. Carried in `CR-LOG`.
- **Links:** `PLT-05` · canon §0.7 · `ADR-021` · Part 27 §27.4.2, §27.4.4 · `BACKLOG.md`
