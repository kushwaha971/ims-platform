# Wave A — Track M (money): progress

Owner: Backend/Django lead, Track M. Sequence: **A14 → A2 (+A3) → A4a → A5**
(12-implementation-plan §2). Worktree `/home/claude/wt/track-m`, branch `wave-a/track-m`,
`UB_TEST_DB_NAME=test_ub_track_m`.

## Status

| Task | State | Commit on main | Notes |
|---|---|---|---|
| A14 | **merged** | `4b964a8` | A11 landed as 45aa070 |
| A2 (+A3) | done — merging | (see below) | |
| A4a | not started | — | after A2 |
| A5 | not started | — | after A4a and A15 (Track F) |

## A14 — decouple payments from sales and purchases (ADR-056, R72)

### Design note (review step)

What `payments` imports from the two document apps today (read at `51e93a8`):

| Where | What | Kind |
|---|---|---|
| `payments/apps.py:20-31` | `targets.sales.SalesInvoiceTarget`, `targets.purchases.PurchaseBillTarget`, `purchases.services.payment_seam.register_void_listener` | deferred (in `ready()`) |
| `payments/services/targets/sales.py:33-34` | `sales.models.SalesDocument`, `sales.services.amounts.refresh_invoice_amounts` | module level |
| `payments/services/targets/purchases.py:43-45` | purchases constants, models, `payment_seam` | module level |
| `payments/services/void.py:49` | `sales.services.refund_seam.release_refund` | **module level — not named in ADR-056** |

The plan's four moves are mechanical: the two target modules move verbatim to
`apps/sales/services/payment_target.py` and `apps/purchases/services/payment_target.py`; sales and
purchases register them from their own `ready()` through a deferred import of
`apps.payments.services.targets.register_target`; purchases registers `release_purchase_bill` into
its own void seam; `payments/apps.py` keeps only its job handlers and its own `payment` source
resolver (that resolver is payments' own and imports nothing of sales).

Registration order is preserved: `INSTALLED_APPS` lists sales before purchases, so
`targets_for_direction` still yields `sales_document` then `purchase_document`.

**The one gap: `void.py`'s module-level `release_refund` import.** ADR-056 lists the targets, the
void-listener wiring and the source resolver, but not SAL-04 FR-10's "voiding a refund voucher
gives the amount back to the credit note". `ALLOWED["payments"]` cannot lose `sales` while that
import stands. The decision (payments imports neither app) is unambiguous; only the mechanism is
unstated, so A14 uses the house pattern (ADR-042, and exactly `purchases.payment_seam`'s void
listener): a keyed, idempotent registry `apps/payments/services/void_seam.py`
(`register_payment_void_listener(key, listener)`, `payment_void_listeners()`, `_reset_for_tests()`),
called by `void_payment` at the same point in the same transaction; sales registers
`sales.credit_note_refund` in its `ready()`, and the listener (moved into `refund_seam.py`) returns
the note's summary row exactly as `void_payment` built it. **Question for the architecture owner
(Q-M1):** confirm the seam, or name another; no behaviour changes either way.

No migration. No API change. No frontend change.

### Tests first

- `apps/payments/tests/test_decoupled_from_documents.py`
  - the whole AST of `apps/payments` (every node, deferred imports included, tests excluded) names
    neither `apps.sales` nor `apps.purchases`;
  - the registered targets' classes live in their owners' modules, in the old order;
  - purchases' void listeners include `release_purchase_bill`; the payment void seam holds the
    sales refund listener; the `payment` source resolver is still registered;
  - the seam is idempotent by key and refuses a different listener under a used key;
    `_reset_for_tests` restores the start-up snapshot.
- Behaviour proof: the existing payments, sales and purchases suites, unchanged.

### Result

- Moved, not rewritten: `payments/services/targets/{sales,purchases}.py` →
  `sales/services/payment_target.py`, `purchases/services/payment_target.py` (git renames).
- `payments/services/void_seam.py` (new): the payment void listener registry (Q-M1).
- `sales/apps.py` registers the sales target and `sales.credit_note_refund`; `purchases/apps.py`
  registers the bill target and `release_purchase_bill`; `payments/apps.py` keeps its jobs and its
  own `payment` source resolver.
- `ALLOWED["payments"]` = `{common, platform_app, parties, ledger}` (in an `# ── A14 ──` block).
- Tests: 6 new (`test_decoupled_from_documents.py`, 4 failed before the change). Whole backend:
  1071 passed (payments, purchases, sales, ledger, parties, reports, expenses, architecture) +
  1615 passed / 8 skipped (the rest); `makemigrations --check` clean.

### Independent QA

The Agent tool is not available in this session, so QA was a separate adversarial review pass by
the same agent (recorded here as required). Checked: `ready()` order (sales, purchases before
payments in `INSTALLED_APPS`; the deferred imports load only modules, never rely on payments'
`ready()`); registration order of targets unchanged (`test_money_out_settles_only_purchase_bills`
still passes); the refund summary row is built by the same code, appended at the same point;
PUR-02's `test_void.py` swaps `_VOID_LISTENERS` with monkeypatch and still passes; no test or
frontend path referenced the old module paths (one stale comment in `sales/services/issue.py`
fixed). No defects found.

## A2 (+A3) — ledger buckets, party caches, posting registry, two entry types (PLT-X01)

### Design note (review step)

Read at `4b964a8`. The balance rule lives in one place (`ledger/selectors/entry.py`:
`LIVE_ENTRIES`, `SIGNED_AMOUNT`) and every reader imports it — so the bucket rule is one more
constant beside it, `BALANCE_BUCKETS = Q(bucket__in=('main','loan'))`, and every reader narrows by
it: `SIGNED_AMOUNT`, `split_total_expressions` (gave/got/written-off), the statement's scope
(opening, carry, window, totals, closing), `LIVE_SIGNED` and `timeline_carried` (the timeline's
running balance), `has_entries_before_opening`, the receipt's balance-at-the-time
(`payments/selectors/payments.py`). Deposit rows stay on the timeline (with their `bucket`, a zero
running-balance contribution, counted in `entry_count`) and leave the statement's table for a
`meta.deposit` block. Aging binds `bucket=main`; the aging report's "last paid" follows it.

The vocabulary `LedgerBucket` goes to `common/constants.py` (A2 block), because `parties` and
`payments` need it and may not import the ledger (the `Direction` precedent). `POSTING_MATRIX`
becomes `register_posting_source` with `POSTABLE_ENTRY_DIRECTIONS` as the one direction table;
sales, purchases, payments (all three buckets) and expenses register from their own `ready()`.
Purchases and expenses write their own rows through `ledger_link.py` (not `post_source_entry`) and
stay `main` by default; their registration is for the contract.

Party caches: `apply_entry(bucket=)` is still the one writer. `deposit` moves only `deposit_held`
(credit increases it) and `last_activity_at`, and does not clear the collection date (BR-3).
`trade_balance(party)` is the trade figure; `credit_exposure`, the list's credit chips
(`filters.py`, `selectors/party.py`) and LED-11's write-off read it. The party detail's
`loan_balance`/`trade_balance`/`deposit_held` keys come from `bucket_figures(party)` in the
detail serializer: present when non-zero or when a module that writes the bucket is effective
(`BUCKET_WRITER_MODULES`, module codes only — L4), omitted otherwise.

`recalc_balances`, `check_invariants` and the nightly integrity job replay all three caches
through `ledger/selectors/drift.py` (`LedgerFigures`; `BalanceDrift.figures`).

Frontend: `bucket` on the timeline and statement types (optional, absent reads `main`);
`entryAmountView(direction, type, bucket)` labels `charge`/`adjustment_credit` and paints deposits
neutral ("Deposit received/returned"); a "Loan"/"Deposit" badge on non-main timeline rows;
`DepositHeldBlock` under the statement table and on the print sheet (carried on `summary.deposit`,
so the slice's write-every-page rule covers it and no slice changed); the info panel's "Balances"
section from `view-model/partyBuckets.ts` (a module of its own so its message ids are not pinned
to the shell catalogue by `split-locales.mjs`).

### Result

- Migrations: `ledger 0006_entry_bucket` (column with DB default, `entry_type` choices, `source_type`
  loses choices, `ix_ledger_party_bucket` partial, `ck_ledger_entry_bucket`, trigger re-created
  with `bucket` frozen; reverse restores 0004's body, asserted by a test) and
  `parties 0009_party_bucket_caches` (two `numeric(14,2) NOT NULL DEFAULT 0`, deposit CHECK ≥ 0).
  Verified by hand on a scratch database seeded with the pre-A2 code: forward, back, forward, data
  intact, `UPDATE … SET bucket` refused by the trigger, `check_invariants` and
  `recalc_balances --check` clean.
- Tests: `apps/ledger/tests/test_buckets.py` (40: T-1…T-5, T-7…T-11, registry shape/refusals,
  write-off cap, statement deposit block and period, timeline, detail keys, public helpers,
  migration reverse), `test_bucket_golden.py` (T-6, 14 reads captured on the pre-A2 code with
  `UB_UPDATE_GOLDEN=1`, unchanged after A2). Frontend: `DepositHeldBlock.test.tsx`,
  `PartyInfoPanel.test.tsx`, `partyBuckets.test.ts`, additions to `entryDisplay.test.ts` and
  `statementService.test.ts`. Backend: related suites 1135 passed / 8 skipped, the rest 1725 passed
  (after the two fixes below), parties+ledger+common+performance rerun 985 passed; frontend ledger +
  parties + `src/tests` 59 suites / 1001 tests; `tsc` clean; eslint/prettier clean on changed files;
  `i18n:check` clean with the shell catalogue unchanged (14 new keys in ledger/money/parties).

### Independent QA

No Agent tool in this session; an adversarial self-review was done instead (recorded as
required). Checked and found sound: the idempotent re-post returns the standing row without
moving any cache; corrections (LED-03) only ever touch manual rows, which are `main`; opening,
write-off, purchases and expenses writers default to `main`; `live_total_from_summary` and
`timeline_carried` still agree (both narrow to the balance buckets); archive with a loan rolls the
capped write-off back with the refused archive (EC-7); the idempotent 201 of a manual entry gains
only an additive `bucket` key. Found and fixed during the pass: the deposit block titled a
receipt "Payment received" (entry-type words) and printed "Deposit received" twice — now titled by
the deposit words with the amount label hidden, as the timeline does; the bucket rows' message ids
were pinned to the shell catalogue — moved to their own module.

### Open items (not A2's to build, recorded so nobody assumes they exist)

- **Archive with only a held deposit** passes PTY-04's `balance ≠ 0` guard; ADR-043 says the
  deposit guard (A4b/A6 `register_archive_guard`) refuses it. Until A4b lands no deposit exists.
- **Reminders quoting the trade figure** (ADR-043 "Reminders") is A7's ("trade figure" in its row).
- **Statement CSV**: exports the running-balance table only; deposit lines are not in it. FRD 00 is
  silent on the CSV. Question Q-M2 below.
- **e2e**: T-PLT-X01-13's deposit condition in `e2e/statement.mjs` needs a way to post a deposit,
  which is A4b's `receive_deposit`; the lead's e2e run after the wave covers the unchanged sweep.
- **Day book** (PLT-X01 §11): `reports/selectors/day_book.py` reads only `manual`/`ledger_entry`
  rows and payments' cash, so no deposit line reaches it through the ledger; the cash side is
  A4b's `cash_sources.py` exclusion.

## Decisions

- (A14) The refund-release call becomes a payments void seam (see Q-M1).
- (A2) `LedgerBucket` lives in `common/constants.py` (shared vocabulary, `Direction`'s reason).
- (A2) Deposit rows are listed on the khata timeline (with a zero running-balance contribution)
  and move to `meta.deposit` on the statement; `entry_count` counts them.
- (A2) The party detail's bucket keys are decided by `BUCKET_WRITER_MODULES`
  (`loan`: lending; `deposit`: library, gym, hospitality) against `effective_modules`.
- (A2) Owner Q3 default applied: LED-11's write-off is capped at the trade figure.

## Questions for the architecture owner

- **Q-M2 (A2):** the statement CSV (`?format=csv`) exports the running-balance rows only. Should
  deposit lines be appended as a separate section (they cannot be in the running-balance column)?
  FRD 00 PLT-X01 is silent. Default kept: not exported.
- **Q-M1 (A14):** `payments/services/void.py` imported `apps.sales.services.refund_seam.release_refund`
  at module level; ADR-056 does not name it. Implemented as a payments-owned void seam that sales
  registers into (ADR-042 pattern). Confirm.

## CR drafts

**CR draft (A2, R23, owner Q3) — LED-11 write-off amount is the trade figure.** *Change:* LED-11's
"write off a small balance" (PTY-04 FR-3 in the archive flow) defaults to, and is capped at, the
party's trade figure `balance − loan_balance` instead of `balance`. *Why:* ADR-043 keeps a loan in
the party's one balance; without the cap one tap on a shop screen would forgive a loan, which only
lending's own write-off (R38) may do. *Effect today:* none — no party has a loan, so the trade
figure is the balance. *With a loan:* the write-off posts the trade figure (a `main` line), the loan
stands, and archive is refused by the ordinary non-zero balance guard (EC-7); a confirmed amount
other than the trade figure answers 409 `balance_changed` with `amount` = the trade figure.
*Implemented in:* `apps/ledger/services/write_off.py`.

## Next steps

1. Implement A14; run payments/sales/purchases/ledger/parties/reports + architecture suites.
2. When A11 is on main: rebase, change the one `ALLOWED["payments"]` line, rerun, QA pass, merge.
