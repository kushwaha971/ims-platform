# Wave A — Track M (money): progress

Owner: Backend/Django lead, Track M. Sequence: **A14 → A2 (+A3) → A4a → A5**
(12-implementation-plan §2). Worktree `/home/claude/wt/track-m`, branch `wave-a/track-m`,
`UB_TEST_DB_NAME=test_ub_track_m`.

## Status

| Task | State | Commit on main | Notes |
|---|---|---|---|
| A14 | **merged** | `4b964a8` | A11 landed as 45aa070 |
| A2 (+A3) | **merged** | `472cb21` | |
| A4a | **merged** | `ba2be39` | |
| A5 | done — merging | (see below) | A15 `98c4d1c` and A4a are on main |

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

## A4a — payments v2 (PLT-X03)

### Design note (review step)

Read at `c2134c2`. `record_payment` locks party → documents (per target, canonical order) →
number → inserts; `void_payment` party → documents → payment. Targets are registered by their
owners since A14.

- **Protocol v2** (`targets/__init__.py`): `bucket`, `auto`; `apply/unapply(..., payment_id=None,
  ctx=None)`; `summary` may carry `label`. `register_target` refuses a `document_type` > 32, a
  bucket outside the three, a direction outside in/out, and a re-registration with a different
  direction/bucket/auto (`ImproperlyConfigured`); `_reset_for_tests`. `targets_for_direction(
  direction, *, auto_only=False, bucket=None)`. Sales and purchases declare `main`, `auto=True`.
  Every caller passes `ctx` and `payment_id` (an AST test walks the payments services).
- **`payments_payment.bucket`** (`payments 0003_payment_bucket`): column + CHECK, written once by
  `record_payment` from its allocations' targets (`main` when none), never changed. Mixed buckets
  → 400 `validation_error` `allocations: One payment settles one kind of balance.`, before the
  number is allocated. The ledger line posts in that bucket; a reconciliation test asserts the
  column equals the payment's `payment_in/out` line.
- **Auto FIFO (R6)**: `"auto"` in `record_payment` walks the `auto=True` targets of the payment's
  direction in the `main` bucket (an unallocated payment is `main`; every auto target in the
  contract table is `main`), locks each target's candidates in its canonical order, then MERGES
  the per-target lists by `(document_date, number, id, document_type)`. A merge rather than a
  re-sort keeps each target's own FIFO — PUR-02 FR-3 orders a supplier's bills by `due_on` first,
  and re-sorting by bill date would change today's supplier payments (question Q-M3).
- **Earmarks (R61)**: `meta.earmark = {module, subject_type, subject_id}` is validated where a
  service caller passes it (the public API accepts no `meta`); an earmarked payment recorded with
  `"auto"` is left unallocated; `open_advances(...)` (the selector A5's `apply_open_advances` and
  the dues run will use) excludes earmarked payments, refund vouchers and voids.
- **`allocate_existing`** (`services/allocate.py`) + `POST /payments/{id}/allocations`
  (`payments.payment.write`, idempotent): locks party → documents (targets in `document_type`
  order) → payment; explicit rows or `"auto"` (the payment's direction and bucket, auto targets);
  BR-2…BR-7 and EC-1…EC-5; no ledger line; `payment.allocated` audit + per-document status
  audits; the application is remembered in `meta.applied_later` (document and date only — the
  allocation row stays the money) so the receipt can print "Applied later: … on …".
- **Contract suite**: `tests/contracts/test_allocation_targets.py`, parametrised over every
  registered target through a per-document-type fixture registry.
- **UI**: `allocateExisting` service + thunk (MUTATION, invalidations), `ApplyAdvanceDialog`
  (`dynamic()`), the receipt's "₹… not yet applied · Apply to bills" line, "Applied later" rows.

### Result

- Backend: protocol v2 in `targets/__init__.py` (`bucket`, `auto`, `payment_id`/`ctx` keywords,
  `registered_targets`, `targets_for_direction(auto_only, bucket)`, `_reset_for_tests`, the
  refusals); the two shop targets declare `main`/`auto`; `payments 0003_payment_bucket`;
  `record_payment` (one-bucket rule before the number, merged FIFO, earmarks, ctx/payment_id);
  `void_payment` passes ctx/payment_id; `selectors.open_advances`; `open_documents(bucket=)`;
  `services/allocate.py`; `POST /payments/{id}/allocations`; detail rows gain `applied_later_on`
  (and `label` when a target sends one), the detail gains `bucket`; the list gains
  `?unallocated=&bucket=`; `AuditAction.PAYMENT_ALLOCATED` (A4a block).
- Frontend: `allocateExisting` service, `fetchApplyCandidates` (QUERY) and
  `allocateExistingPayment` (MUTATION) with their registry and map entries (A4a blocks),
  `paymentReceiptSlice` state, `usePaymentReceipt` (`canApply`, `loadApplyCandidates`,
  `submitApply`), `ApplyAdvanceDialog` (`dynamic()`), the receipt's "₹… not yet applied · Apply to
  bills" row, "Applied later · date" on the receipt page and print, `view-model/applyGate.ts` (no
  imports that pull another catalogue into the receipt route) and `applyAdvance.ts` (the dialog's).
  13 new `payments.*` keys, en and hi. The dialog has its own small form rather than reusing
  `PaymentAllocationPicker`, which is bound to the record form's fields (lines, auto switch); it
  reuses the picker's view-model (`fifoPreview`, `manualTotals`, `exceedsDue`) and its row design.
- Tests: `test_payments_v2.py` (16), `test_allocate_existing.py` (25, two concurrency), the
  contract suite `tests/contracts/test_allocation_targets.py` (11, sales and purchases), frontend
  `ApplyAdvanceDialog.test.tsx`, `applyAdvance.test.ts`, additions to `paymentService.test.ts` and
  `PaymentReceiptPrint.test.tsx`. Backend regression (payments, sales, purchases, expenses, ledger,
  reports, architecture, contracts) 930 passed / 7 skipped before the last additions.

### Independent QA

No Agent tool; adversarial self-review. Checked: the merge keeps PUR-02's due-date FIFO (the
existing supplier suites pass unchanged); FIFO still locks every candidate before choosing, so two
payments lock in one order; the one-bucket refusal happens before `allocate_number`; an earmarked
`"auto"` payment stays unallocated but an explicit `allocate_existing` may apply it; the void race
re-reads the payment under its lock and answers `payment_already_void`; a second application of
one advance waits on the party lock and answers `over_allocated`; the dialog's load effect does not
loop (its callback depends on the payment row only). Found and fixed: `open_advances` excluded
every payment without a `context` key (`NOT (NULL LIKE …)`), caught by its own test; the receipt
route started loading the money catalogue's ids through the hook's import of `paymentDisplay.ts`
(`i18n:check`), fixed by `applyGate.ts`; the contract suite's bill factory needed a supplier.

## A5 — the document port and the sales issuer (PLT-X05)

### Design note (review step)

Read: contracts §1.5, FRD 00 PLT-X05, 10-architecture §4.3 and §17.2 (R1–R3, R50, R52, R55, R58,
R60–R62), and on main `sales/services/{issue,issue_parts,documents,payload,lines,void,amounts,
credit_note_issue,credit_note_apply,credit_notes,payment_target,refund_seam}.py`, the invoice and
credit-note views, serializers and filters, `tax/selectors/rates.py`, and A4a's `allocate_existing`
and `open_advances`.

**The port** `apps/common/seams/documents.py` (A11's rule: only `apps.common` and Django):
the contract's TypedDicts and Protocols, `register_issuer`, `issuer_available`, `issue_document`,
`issue_credit_note`, `void_document`, `document_summaries`, `register_origin`, `origin_for`,
`origin_labels`, `_reset_for_tests`. The seam cannot import `platform_app`, so `issuer_available`
asks the issuer (`available(tenant)`: sales answers from `effective_modules`), and
`issue_document` raises `ModuleDisabled(details={"module": "sales"})` itself (Q-M4).

**`SalesIssuer`** (`sales/services/port_issuer.py`, registered in `SalesConfig.ready()`):
1. `issue`: party required (BR-2); the origin type must be registered (its module fills
   `origin_module`; an unregistered type is a programming error). Lock the party, then look for a
   non-void invoice-kind document with this `(origin_type, origin_id)` and return it (BR-6; the
   party lock serialises two racing issues for one origin). Map the lines (below), `create_draft(
   kind=kind_for(tenant, None))` (BR-1), stamp the origin columns, and `issue_invoice(...)`.
2. Lines: `discount_amount` becomes an amount discount; `unit_code` defaults to `NOS`; `item_id`
   with inventory off is 400 `lines.N.item_id` (EC-5); `tax_code` wins; a `gst_rate` alone maps
   through `tax.selectors.codes.code_for_rate`, and zero or several codes is 400 on
   `lines.N.gst_rate` (BR-7); neither falls to sales' own default (the item's code, else `GST0`).
3. `issue_credit_note`: `create_credit_note` against the invoice with value lines (A15), reason code
   `other` with the port's reason as its note, restock off, the settlement; origin columns stamped;
   `issue_credit_note`. `refund_payment` comes from the note's `meta.refund`. A `refund` payload
   is optional: without one a `"refund"` settlement refunds the open credit in cash (Q-M5).
   Credit notes are not idempotent by origin (a membership may take several; the caller's HTTP
   idempotency key covers a retry).
4. `void`: `void_invoice` / `void_credit_note` with `from_origin=True` — the module asked for it,
   so its own `check_void` / `on_void` are not called back.
5. `summaries`: one query, plus one for the ledger entry ids.

**`issue_invoice` keywords** (all default to today's behaviour): `credit_check="enforce"|"skip"`
(skip never raises; a crossed limit is a warning), `apply_credit_note_ids`, `apply_payment_ids`,
`apply_open_advances`. Order: party → draft → stock → credit check → **lock** the named credit
notes, the named payments and the open advances → number → save → ledger debit → the payment
taken at issue → **apply** credit notes (`apply_credit_note`), then the named payments in the
order given, then open advances oldest first (`allocate_existing`), each capped at what is still
due. A draft cannot take an allocation (the targets and `apply_credit_note` want an open,
numbered document), so R61's "before the number" is honoured as the LOCK order: every row is held
before the sequence row is. The payment taken at issue goes first because the caller validated it
against the grand total. Credit notes and payments must be the party's, open, `in`, `main`,
not void; an explicit payment may be earmarked (R61). Walk-in drafts refuse all three.

**Origin columns** `sales/0005_document_origin`: `origin_module varchar(32)`, `origin_type
varchar(48)`, `origin_id uuid`, all null, `ck_sales_document_origin_complete`, partial index
`ix_sales_doc_origin`. The FRD names the migration `0004`; A15 took `0004`, the plan says `0005`.
The sales write serializers refuse the three keys (BR-4).

**Voids**: `void_invoice` and `void_credit_note` gain `confirm_origin=False` and
`from_origin=False`. After `refuse_unless_voidable`, a document with an origin asks
`check_void`: `block` → 409 `document_origin_locked {origin_type, reason}`; `confirm` without
`confirm_origin` → 409 `document_origin_confirm {origin_type, message}`. `on_void` is called last,
inside the transaction; a raising listener rolls the void back. An unregistered origin type logs a
warning and voids (EC-4).

**Settlement**: `refresh_invoice_amounts(invoice, *, amount_paid=None, ctx=None)` calls
`on_settlement_changed` when `amount_due` or `status` moved and the document has an origin. Every
caller passes `ctx` (the sales target's `_move`, credit-note issue/apply/void); a document with an
origin and no `ctx` raises rather than lose the module's update. An AST test holds the callers.

**Reads**: list rows and the detail gain `origin: {module, type, id, label} | null`. The label comes
from an optional listener method `labels(*, tenant, ids) -> {id: str}` (batched per page; the
contract names a label function but no signature — Q-M6); an unregistered type reads "Record not
found" (EC-4). Filters `origin_module`, `origin_type`, `origin_id`.

**Errors**: `document_origin_locked`, `document_origin_confirm` (409) in an A5 block of
`error_codes.py`, docs/22 §22.1.1 and the locales.

**Frontend**: `VoidDocumentDialog` shows a lock's reason in place (Void disabled) and a confirm's
question with "Void anyway", which resends with `confirm_origin: true`; `OriginBadge` on list
rows and the invoice page, linking through `features/sales/originLinks.ts` (path builders keyed by
origin type, empty until a module registers one); the list's origin chip shows only modules in
that map that are enabled.

### Result

Backend: `apps/common/seams/{__init__,documents}.py`; `sales/services/{port_issuer,origins,
issue_apply}.py` (new), `issue`, `issue_parts` (`enforce`), `payload` (free text for a port
document), `amounts` (`ctx`, settlement listener), `void`, `credit_note_apply`,
`credit_note_issue`, `payment_target` (`ctx` handed on); `sales/0005_document_origin`; the
origin on list rows and the detail, the three filters, `confirm_origin` on both void bodies, the
origin keys refused in write bodies; `tax/selectors/codes.py`; two error codes (A5 blocks in
`error_codes.py`, `test_exceptions.py`, docs/22 table F). Tests (all new, 70):
`apps/common/tests/test_document_seam.py` (6), `apps/sales/tests/test_document_port.py` (26),
`apps/sales/tests/test_document_origin_api.py` (9, incl. the AST test over
`refresh_invoice_amounts` callers), `apps/tax/tests/test_code_for_rate.py` (5),
`tests/contracts/test_document_port.py` (13, incl. T-PLT-X05-10's race) with a new
`tests/contracts/conftest.py`. Gates: sales, payments, common, tax, purchases, reports and
`tests/` — 1327 passed, 7 skipped; `makemigrations --check` clean.

Frontend: `DocumentOrigin` type and mapping; `originLinks.ts` (empty map + `originHref`,
`originFilterModules`); `view-model/originDisplay.ts`; `OriginBadge` on list rows (and a card's
date line) and the invoice page; the origin chip in the list (`?origin=`, only modules in the map
that are enabled); `VoidDocumentDialog` shows a lock in place (Void disabled, the module's link
as the banner's action) and a question with "Void anyway" resending `confirm_origin: true`; the
two codes in `api.types.ts`; 12 `sales.*` keys (en, hi). Tests: `originDisplay.test.ts` (5),
`OriginBadge.test.tsx` (2), two dialog tests in `SalesFlows.test.tsx`. `tsc` clean, eslint and
prettier clean on changed files, `i18n:split` + `i18n:check` in step, full jest 2689 passed —
the 3 failures (`invalidation.registry` `fetchRoles`, `TeamPageContent` revoke) fail the same on
the base without A5 (A13's).

Environment note: after the usage-limit restart PostgreSQL 16 was down with a stale pid file; I
started it (`pg_ctlcluster 16 main start`). The :3000/:8000 servers were not touched.

### Independent QA

No Agent tool; adversarial self-review. Checked: the void guard runs after the party and document
locks and before any reversal, `on_void` runs last inside the transaction and a raising listener
leaves the invoice issued and the khata unchanged (test); a block wins over `confirm_origin`
(test); every writer of `amount_due` passes `ctx` (AST test) and a document with an origin
refreshed without one raises; the port's R61 locks are all taken before the sequence row; a
second issue for one origin serialises on the party lock (BR-6); the sales list's query budget is
unchanged (the performance suite passes: no origins, no label call); a draft never persists
between create and issue in the port (one transaction), so BR-4 has no PATCH hole. Found and
fixed: a port document was refused at issue by the counter's free-text switch ("Choose an item
from your list"), fixed in `payload.py`; the contract test's API void of a raising listener comes
back as a 500 rather than a raised error; the contract suite's fixture imports (F811) moved into
`tests/contracts/conftest.py`.

### Open items (not A5's to build)

- The print template does not render `meta.origin_block` yet (DEC-002 document rendering).
- FRD §11: the sales register's "Origin" column and filter (reports).
- `overdue.py` moves a status to `overdue` without `refresh_invoice_amounts`, so an origin is
  not told of that move; the FRD binds the listener to `refresh_invoice_amounts` only.
- `void_document` trusts the calling module (it skips `check_void` for any document); a module
  voiding another module's document is not refused.

## Decisions

- (A14) The refund-release call becomes a payments void seam (see Q-M1).
- (A2) `LedgerBucket` lives in `common/constants.py` (shared vocabulary, `Direction`'s reason).
- (A2) Deposit rows are listed on the khata timeline (with a zero running-balance contribution)
  and move to `meta.deposit` on the statement; `entry_count` counts them.
- (A2) The party detail's bucket keys are decided by `BUCKET_WRITER_MODULES`
  (`loan`: lending; `deposit`: library, gym, hospitality) against `effective_modules`.
- (A2) Owner Q3 default applied: LED-11's write-off is capped at the trade figure.
- (A4a) `"auto"` in `record_payment` is the `main` bucket's auto targets; `open_documents` without
  `bucket` lists exactly those (today's panel); with `bucket` every target of that bucket.
- (A4a) "Applied later" is remembered in `payment.meta.applied_later` (document and date; the
  allocation row stays the money) rather than a new column — no schema beyond the reservation.
- (A4a) `open_advances` excludes earmarked payments, credit-note refund vouchers and
  `<module>_refund` payments (R36, R61).
- (A5) R61's "before the number" is kept as LOCK order: credit notes and payments are locked
  before `allocate_number` and applied after the save (a draft cannot take an allocation).
- (A5) The payment taken at issue is recorded before credit notes and advances are applied.
- (A5) A port document always allows free-text lines, whatever the counter's switch says.
- (A5) A port credit note is not idempotent by origin; issue is (BR-6).
- (A5) A void through the port (`from_origin`) does not call the module's listener back.
- (A5) A document with an origin refreshed without `ctx` raises instead of skipping the listener.

## Questions for the architecture owner

- **Q-M4 (A5):** `common/seams/documents.py` may not import `platform_app`, so
  `issuer_available` asks the issuer (`Issuer.available(tenant)`, sales answering from
  `effective_modules`) — a method the contract's `Issuer` protocol does not list. Confirm.
- **Q-M5 (A5):** the port's `issue_credit_note(settlement="refund")` has no way to say how the
  money went back. Added an optional `refund` (sales' `mode_breakup` payload); without it the open
  credit is refunded in cash. Confirm, or name the field.
- **Q-M6 (A5):** "label via the origin's registered label function" has no signature. Implemented
  as an optional listener method `labels(*, tenant, ids) -> {id: str}`, called once per origin
  type per page. Confirm.
- **Q-M7 (A5):** `IssuedDocument` has nowhere for BR-3's warning. Added `warnings` (and
  `existing` for BR-6) as `NotRequired` keys. Confirm.

- **Q-M3 (A4a):** R6 says `"auto"` is global oldest-first by `(document_date, number, id)`. Applied
  literally it re-sorts a supplier's bills by bill date, but PUR-02 FR-3 (shipped) settles them by
  `due_on` first. Implemented as a merge of each target's canonical FIFO list by that key, which is
  R6 across targets and leaves PUR-02 unchanged. Confirm.

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

1. A5: commit, rebase onto main (262a121), rerun the targeted gates, merge ff-only.
2. Track M's Wave A tasks are then all merged (A14, A2+A3, A4a, A5); report the DSU.
