# Wave A — Track M (money): progress

Owner: Backend/Django lead, Track M. Sequence: **A14 → A2 (+A3) → A4a → A5**
(12-implementation-plan §2). Worktree `/home/claude/wt/track-m`, branch `wave-a/track-m`,
`UB_TEST_DB_NAME=test_ub_track_m`.

## Status

| Task | State | Commit on main | Notes |
|---|---|---|---|
| A14 | done — merging | (see below) | A11 landed as 45aa070 |
| A2 (+A3) | not started | — | after A14 |
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

## Decisions

- (A14) The refund-release call becomes a payments void seam (see Q-M1).

## Questions for the architecture owner

- **Q-M1 (A14):** `payments/services/void.py` imported `apps.sales.services.refund_seam.release_refund`
  at module level; ADR-056 does not name it. Implemented as a payments-owned void seam that sales
  registers into (ADR-042 pattern). Confirm.

## CR drafts

(none yet)

## Next steps

1. Implement A14; run payments/sales/purchases/ledger/parties/reports + architecture suites.
2. When A11 is on main: rebase, change the one `ALLOWED["payments"]` line, rerun, QA pass, merge.
