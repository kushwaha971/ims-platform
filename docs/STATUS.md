# UdhaarBook SSOT — Status

**Last updated:** 19 September 2026
**State:** Baseline v1.0 complete and delivered. Not yet build-ready — see "What blocks build start" below.

---

## What exists

49 chapters, ~735,000 words, in `udhaarbook-ssot/docs/` in this project, mirrored to
`/Users/akashkushwaha/digikhaato/udhaarbook-ssot/` on the user's Mac, and assembled into a
1,017-page PDF (`UdhaarBook-Specification.pdf`, 4,224 bookmarks) delivered in the conversation.

| Group | Chapters |
|---|---|
| Foundation | `000-index`, `00-canon` |
| The case | 01 executive summary, 02 product vision |
| Research | 03 market synthesis, 04 competitor synthesis, 05 Zoho Inventory, 06 Zoho KB, 07 Zoho evolution, 08 Software Advice, 09 Khatabook |
| Product requirements | 10 PRD overview, 11 product scope, 12 MVP scope, 13 roadmap, 14 personas, 15 journeys, 16 feature catalogue, 17-00…17-04 FRDs, 18 consolidated PRD |
| Architecture & standards | 19 frontend arch, 20 backend arch, 21 database, 22 API, 23 design system, 24 white-label, 25 FE standards, 26 BE standards, 27 security, 28 testing, 29 devops, 30 observability, 31 analytics |
| Delivery | 32 sprint plan, 33 task breakdown, 34 AI-agent instructions, 35 DoD, 36 risks, 37 open questions, 38 ADRs, 39 product decisions, 40 future roadmap, 41 multi-role analysis, 42 cross-role review, 43 change-request register |

**Part 17 (FRDs):** all 113 MVP + Phase 2 features specified at the full 24-section depth, 310,966 words.
**Part 33:** 700 work items across 13 epics, every one of the 74 MVP features decomposed.
**Part 38:** ADR-001 … ADR-040 plus ADR-021a, all written in full.
**Part 43:** 118 change requests consolidated under one global `CR-<NNN>` scheme.

---

## Binding decisions that must not be silently reverted

- **Frontend follows BrandHub's Customer module exactly** — Redux Toolkit slices + `createAsyncThunk`,
  React Hook Form, a central `useValidationSchemas()` Yup hook, `utils/`, the `api/<x>Service.ts`
  layer, and the mandated folder tree. **TanStack Query is not used.** This overrides an earlier
  AskUserQuestion answer that had suggested it.
- **Minimal third-party dependencies (ADR-021 allow-list).** No Celery/Redis (`platform_job` rows
  drained by a cron-driven `manage.py run_scheduler`), no S3/MinIO (local `MEDIA_ROOT`), no
  Sentry/OTel/Prometheus (Django logging), client-side PDF via `window.print()`, adapter-only
  messaging (console SMS, `wa.me`), local UPI QR. Anything else needs a new ADR.
- **Business-type-agnostic.** Retail, wholesale, services, traders, manufacturers, professionals.
  The onboarding business-type selection seeds defaults and never gates behaviour.
- **Ledger modelled on the existing DigiKhaato / money-mgmt UdhaarBook** — parties, you-gave/you-got,
  opening balance, running-balance statement, corrections with audit trail, reminders, WhatsApp share.
- **Koper Design System tokens, re-themed** — Zoho-style blue primary (`#2B6BE0` base) on a
  light-first canvas with a dark nav rail; Koper's copper and dark-first stance not carried over.
- **PostgreSQL 16 via Docker in dev and prod.** Runs locally for personal use first; must stay
  extensible without rework.

---

## What blocks build start

Part 42 §42.6.1 returns a verdict of **not ready — approximately two weeks of work away**, from
114 findings across nine roles (28 blocking) and 19 registered role conflicts. Four blocks:

1. **Five commercial/architectural decisions** — the paid wall, document rendering, the
   dependency-policy split, Phase 2 Variant B, and the compliance owner plus DLT start.
2. **Seven corpus-integrity edits** — ten pairs of contradictory normative statements across
   chapters 19/20/22/28/29 that an AI agent would otherwise resolve silently.
3. **Five behavioural corrections**, gated to the modules they block. The most serious:
   - **BE-01/BE-02** — weighted-average cost is maintained in arrival order but
     `recompute_item_stock` replays in `(movement_date, created_at, id)` order, so cache and
     replay diverge permanently the first time a purchase is backdated, which Part 15 §15.6
     explicitly tells the merchant to do. Voiding a purchase bill also never restores the
     average. Part 28's drift fixtures do not include the failing case, so the suite stays green
     while the invariant is false. The Backend Architect rejects the inventory module pending this.
   - **BE-03** — the nightly drift job that NFR-40, G3 and the launch gate all depend on is
     registered in neither chapter that schedules jobs.
4. **Four governance artefacts** — `DECISIONS.md`, `CR-LOG.md`, and the promotion of Parts 33 and 35
   into the live working set.

Also open: five contradictions flagged in Part 43 (C1–C5), and whether `openpyxl`, `cryptography`
and `segno` are admitted to the ADR-021 allow-list or the in-house implementations kept
(ADR-023, ADR-024, C3).

---

## Known documentation defects already corrected

- Part 16 §16.15 claimed 67/41/24/5 = 137 features; the row-by-row count is **74 MVP / 37 Phase 2 /
  19 Phase 3 / 1 Future = 131**. The summary table was corrected; the rows were always right.
  Part 1's stale "67 MVP features" was corrected too.
- ADR numbering collided: three decisions each claimed ADR-022. Resolved as ADR-022 (stdlib HTTP,
  no vendor SDKs), ADR-023 (in-house XLSX), ADR-024 (`cryptography` for Web Push), ADR-025 (barcode
  decoder, Proposed). References in `17-02` and `17-03` were renumbered to match.
- `platform_job` was referenced throughout but never specified; it is now defined in Part 21 §21.3.1
  with all 21 columns, the `FOR UPDATE SKIP LOCKED` claim query, six indexes and the backoff policy.
  Four further schema deltas (`platform_idempotency_key`, document `version`,
  `membership.permissions_version`, `user.token_epoch`) were added at the same time.

---

## Suggested next session

Work Part 42 §42.6.1's blocking checklist in order — the five decisions first (they are the user's
to make), then the seven corpus-integrity edits, then BE-01/BE-02/BE-03, then the governance
artefacts. Re-run the assembly (`build/assemble.py` → pandoc → `build/topdf.js`) to regenerate the
master PDF afterwards.
