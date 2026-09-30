# Wave A gate — Integration and QA lead: progress

Owner: Integration and QA lead (Wave A gate). Main at `3e84ca9` at start (all 16 Wave A tasks
merged). Binding: CLAUDE.md, 12-implementation-plan §1–§2, the three track progress files,
RUNNING.md. Bundle-budget authority delegated by the coordinator for this gate.

Resume rule: each step below records its state and its numbers; a step marked **done** is not
re-run unless a later fix touches its area.

| Step | State | Numbers |
|---|---|---|
| 1 Backend pytest + makemigrations --check | **done** | 3206 passed / 8 skipped / 0 failed at start; **3209/8/0 final** (after the gate's fixes); `makemigrations --check` no changes |
| 2 Frontend type-check, lint, jest, i18n, build, bundle | **done** | tsc clean; eslint clean (0 warnings); jest 257 suites 2803/2803 (final); i18n 4119 keys / 46 catalogues; build OK |
| 3 Bundle budgets | **done** | sharedApp 104.2 → 105.1 (cause found: no leak); 44 routes over → 1 cheap fix (/parties −0.6) + re-baseline, sharedApp 106; `bundle:check` passes |
| 4 Live stack, e2e regression, landing, seo, invariants | **done** | regression 1911/1911 twice (before the fixes, and on the final build: 38 jobs, 0 retried); landing 169/169; seo 105/105; drift/invariants identical before/after; 1290 dev reads identical |
| 5 Independent QA pass (screens × 390/1280 × en/hi × light/dark) | **done** | self-run (no Agent tool); 560/560 on the final build; 6 product defects fixed |
| 6 Docs (CR-LOG, 10-arch open questions, 01-capabilities, STATUS) | **done** | 3 CRs; 10-arch §18 (27 questions + proposals); capabilities; STATUS |
| 7 Commits (not pushed) | **done** | see `git log 3e84ca9..` |

## Log

- 05:37 Postgres online. Full backend suite started. Baseline worktree `/home/claude/wt/base-51e`
  (detached 51e93a8, pre-Wave-A) built with a `cp -al` node_modules (ml-uikit symlink replaced by a
  hard-linked copy of `vendor/ml-uikit`, and `.env.local` copied — the build refuses without
  `NEXT_PUBLIC_API_BASE_URL`). Baseline: framework 126.9, **sharedApp 104.2**, 4 routes over.
- Dev DB BEFORE migrating, with the pre-Wave-A code (base worktree backend):
  `recalc_balances --check` 4518 parties, **306 drifted** (the known e2e parties; list saved);
  `check_invariants` balances 306 drifted, stock 246 checked 0 drifted. Golden capture of 1290
  reads (statement plain + corrections, timeline incl. reversed, party detail for the first 300
  parties with entries; aging and summary for their 45 tenants), all 200, normalised like
  `test_bucket_golden.py` (script in the session scratchpad, `golden_dev.py`).
- Step 1 done: 3206 passed / 8 skipped / 0 failed; makemigrations clean.
- i18n: split wrote 0 files; check 4115 keys in 46 catalogues, in step.
- Dev DB migrated (10 migrations, 11 s). AFTER, with the Wave A code: `recalc_balances --check`
  4518 parties, 306 drifted — **the identical 306 lines** (same parties, same cached and ledger
  figures; `diff` empty), now replaying `balance`, `loan_balance` and `deposit_held`;
  `check_invariants` balances 306, stock 246/0. Golden re-capture: **1290/1290 reads identical**
  to the pre-Wave-A capture (after stripping only `bucket` and `sections`, the keys Wave A adds on
  purpose, exactly as `test_bucket_golden.py` does).
- Bundle (step 3). Method, for the next gate: `check-bundle.mjs --json` on both builds; the shell
  chunks are the intersection of every route's `entryJSFiles`; each chunk is evaluated with a stub
  `globalThis.TURBOPACK` and every module factory's `toString()` is sized and gzipped, then the two
  builds are matched module by module (ids differ by a leading digit, so match on content). Result:
  shell +0.9 KB gz = invalidation map/registry (+1.3 KB raw), `API_PATHS` (+0.7), `partyService`
  (+0.4), member thunks/services, `PAYMENT_MODES`, `ROUTES` (+0.3), and six-digit Turbopack ids.
  No leak; shell catalogue byte-identical. (app)-common chunks 37.8 → 38.5 (A13's `roleLabel`,
  `loadedMessage`, a Turbopack re-split). Cheap fix applied: `PartyBulkArchiveDialog` lazy on
  /parties (−0.6 KB; guard `parties/components/listWeight.test.ts`, fails before, passes after).
  Re-baselined 42 routes + sharedApp 106 with dated notes in `bundle-budgets.json`.
- Harness defect fixed: `e2e/serve.sh` exited 141 after a successful start (`ls | head -1` under
  `pipefail`); now `sed -n 1p`.
- Step 4 started 06:08: API `UB_E2E_RELAX_THROTTLES=1 ./e2e/serve-api.sh`, `./e2e/serve.sh`,
  `node run-regression.mjs -j 3` → `/tmp/e2e-shots/regress-20260930-060756/`.
- Step 5 prepared: `e2e/wave-a-qa.mjs` (sweep, 8 combos: 390/1280 × en/hi × light/dark),
  `e2e/wave-a-seed.py` (port invoice, value credit note, held deposit + adjustment, loan line,
  through the public services), `e2e/qa_standins/` + `e2e/qa_settings.py` (look-only stand-in
  registrations: origin listener `dues_charge`, calendar reader `inventory`, reminder policy for
  `sales`; loaded only by `DJANGO_SETTINGS_MODULE=qa_settings`).
- Docs drafted: CR-LOG (3 CRs), 10-architecture §18 (Wave A open questions, 27 rows with proposed
  answers), 01-current-capabilities (Wave A section).
- Step 4 result (06:08–06:26): full regression **1911/1911, 38 jobs, 0 retried** (17m23s wall,
  `-j 3`); `landing.mjs` **169/169**; `seo.mjs` **105/105**. No failure to triage.
- Step 2 jest first run (under e2e load): 2784/2791; 7 failures in two team suites.
  `MembersSection.test.tsx` (6) was deterministic — red on main since A13: the add dialog's
  unmocked `GET /roles` goes `degraded`, the recovery refetch shows the list's loading state and
  unmounts the open dialog between keystrokes. Test defect; fixed by mocking `roleService` (as A6
  did for `TeamPageContent`). `AcceptInvitePageContent` (1) passes alone: load flake.
- Step 5 first sweep (API with `qa_settings`, 06:29): 22 screens × 8 combos. Defects found by
  looking, each fixed test-first:
  1. **No Deposits panel on the khata** while ₹380 was held, at every width: A6 mounted
     `PartyModulePanels` inside the roles-only block; A4b's panel registered into it. Now mounted
     for every party, with an `appliesTo` predicate on the registry so payments' panel is fetched
     only for a party the server sent `deposit_held` for (`PartyDetailModulePanels.test.tsx`,
     `modulePanels.test.ts`).
  2. **"Deposit returned ₹120" for an adjustment**, on the khata AND on the statement a customer
     reads. `resolve_payments` now marks `adjustment: true` (only on adjustment payments, so no
     existing payload changes) and the serializer passes it through; `entryAmountView` labels it
     "Adjusted from deposit" (`test_an_adjustment_says_so_on_the_khata_and_the_statement`,
     `DepositHeldBlock.test.tsx`, `entryDisplay.test.ts`).
  3. **Void dialog of a deposit payment said "Khata: you owe Asha Rao ₹120 more"** (a deposit
     line never moves the balance, and the direction was backwards) and **"Library deposit reopens
     with ₹500.00 due"**. `voidConsequences` now says "Deposit: ₹120 is held again" / "… is no
     longer held" for the deposit bucket (`paymentDisplay.test.ts`); the consequence lines wrap
     instead of truncating their amount away ("… RCT/26-27/0003 (…").
  4. **The module's void question toasted in error red with a request id** over the dialog asking
     it: `document_origin_confirm` / `document_origin_locked` are locally presented now; and
     **a refused module switch toasted beside its own banner**: `module_has_data` with a
     breakdown no longer toasts (without one it still does) (`apiError.test.ts`).
  Harness fixes on the way: archive confirm step, dialog-scroll second shot.
- Engineering fix (W-P8): `tests/migrations/test_reversibility.py` derives its scratch database
  from `UB_TEST_DB_NAME` (test added).
- Noted, not fixed (pre-Wave-A, out of the gate's scope): the A4 print sheet labels a credit
  note's and an estimate's number "Invoice no." (`sales.print.number`).
  5. **The deposit panel registration never reached production.** After fix 1 the panel was still
     absent on the live build: `PartyModulePanels` imports `payments/deposits/partyPanel.ts` bare,
     for its `registerPartyPanel` call, and `package.json` `sideEffects` did not list it, so the
     bundler dropped it — the registry code was in no client chunk. jest never tree-shakes. Fixed by
     declaring it (and `notificationSlice.ts`, the only other bare app import); guard
     `src/tests/sideEffectImports.test.ts` resolves every bare import in `src/` and `app/` and fails
     for one `sideEffects` does not cover (failed first on both).
- Full jest rerun (06:47, before fix 5): **255 suites, 2799/2799**.
  6. **A loan offered for write-off.** "Write off ₹2,300.00" for a party owing ₹300 to the shop and
     ₹2,000 on a loan (the dialog offers the refusal's `balance`); with a loan open no shop
     write-off can let the archive through (EC-7). `party_balance_nonzero` now carries, only while
     `loan_balance ≠ 0`, `can_write_off: false`, `amount` (trade figure), `suggestion: collect`; the
     dialog offers Record payment only and says why (`test_the_archive_refusal_does_not_offer_to_
     write_off_a_loan`, `PartyArchiveDialogLoan.test.tsx`).
- Harness: the deposit slip is kept for its photograph (headless `print()` returns at once and the
  portal unmounts), dialogs scroll for a second shot.
- Also noted, pre-existing (not Wave A): the sales void dialog's "Khata: Asha Rao -₹2,950.00" puts
  the sign inside the number (§23.2.6 rule 3); the row link chip truncates a receipt number on a
  phone ("RCT/26-27/0…").
- Final sweep run 4 (07:33, all fixes built, API restarted with them): see the table at the top.
- Final sweep: English 280/280 (run 4), Hindi 280/280 (run 5, `WAVE_A_LANGS=hi`), on the final
  build with the API restarted on the final backend. Reminder hours were not drawn by the sweep's
  stand-ins (the rows need a reminder SOURCE as well as a windowed policy); `qa_standins` now
  registers a recordless source and the hours rows were shot at all 8 combos
  (`*-reminder-hours-rows.png`, no overflow, both selects present).
- Final regression on the final build (07:27): **1911/1911**, 38 jobs, 0 retried, 16m01s.
- Not covered by the sweep, and why: earmarks have no screen (service-level, R61; the public API
  takes no `meta`) and are covered by `test_payments_v2.py`; module-role captions on Team need a
  registered module role, which no Wave A module ships — Track P's stand-in look pass
  (`/tmp/e2e-shots/trackp/`) covered them; value credit notes are service-level only (A15), shown
  through a port-issued note.
- Commits: `git log --oneline 3e84ca9..` (not pushed).

