# Part 28 — Testing Strategy

This part specifies what is tested, at which layer, with which tools, to which threshold, and what blocks a merge. It is binding: canon §0.11 rule 6 says no feature ships without tests, and this chapter defines what "tests" means for each kind of change. Every FRD's section 21 lists test IDs of the form `T-<FEATURE>-n`; §28.6 defines how those roll up into the executable suite and how an acceptance criterion is traced to the test that proves it.

The tooling is constrained by ADR-021. Backend: `pytest`, `pytest-django`, `factory-boy`, `black`, `isort`, `flake8`. Frontend: `jest`, `@testing-library/*`. End-to-end: Playwright with the pre-installed Chromium. Nothing else is added without an ADR — no `pytest-cov` plugin zoo, no `faker` beyond what `factory-boy` bundles, no `hypothesis`, no `locust`, no `msw`. Where a capability is genuinely needed and unavailable, this chapter says how it is built in-house and why that is cheaper than the dependency.

---

## 28.1 Philosophy and the shape of the pyramid

### 28.1.1 What we are actually defending

A test suite is a claim about what must not break. For most web products the claim is "the screens render and the happy path works". For DigiKhaato the claim is narrower and much harder:

> A shopkeeper's balance is correct, was derived only from events that actually happened, and can be re-derived from those events at any time.

Everything else — layout, copy, navigation, even a form's validation message — is recoverable by a patch release. A wrong balance is not recoverable, because by the time it is noticed the merchant has already acted on it: they have let a customer walk out, or dunned someone who had paid, or filed a GST return from a register that does not tie out. The category's history is explicit about this: the single complaint that ends a ledger app's relationship with a merchant is "my hisaab is wrong".

Three consequences follow, and they determine the whole shape of this chapter:

1. **The invariants are financial, so the tests are financial.** Most defects that matter live in the service layer — allocation, rounding, reversal, weighted-average cost, document numbering, ledger direction — not in components and not in the database. Testing effort follows the defects.
2. **Isolation and permissions are correctness, not security theatre.** A cross-tenant leak in a multi-tenant ledger is the same category of failure as a wrong balance: it destroys trust irrecoverably. So isolation gets exhaustive, mechanically generated coverage rather than spot checks.
3. **The client is a preview.** Canon §0.11 rule 3 makes the server authoritative for all money maths. That single decision removes an entire class of frontend test obligation: we do not need to prove the client computes GST correctly, only that it *displays* what the server returned and does not silently send something different from what the user typed.

### 28.1.2 The shape

```
                  E2E (Playwright)                    ~35 specs      4 %
              ────────────────────────
           Component / RTL + slice tests              ~380 tests    22 %
        ──────────────────────────────────
     API / contract tests (DRF, full envelope)        ~520 tests    30 %
   ──────────────────────────────────────────
  Service & selector tests (the invariants)           ~620 tests    36 %
────────────────────────────────────────────
 Pure unit: money, dates, GSTIN, ramps, formats       ~140 tests     8 %
```

This is not a pyramid; it is a **diamond with a heavy waist**. The two middle bands — service tests and API tests — hold two thirds of the suite. The reasoning:

- **The service band is where the invariants are.** `post_invoice`, `allocate_payment`, `reverse_entry`, `apply_credit_note`, `recompute_avg_cost`, `next_document_number` — each is a pure-ish function over a small object graph with a long tail of edge cases. They are fast (a few hundred milliseconds for the band on a warm database), they fail with an intelligible message, and they are the layer a defect actually lives in. A bug found here costs minutes; the same bug found in E2E costs an afternoon.
- **The API band is where the contract is.** An AI coding agent building the frontend from Part 22 needs the envelope, the error codes, the pagination meta and the permission behaviour to be exactly as specified. API tests assert the full response envelope, not just a status code, because the frontend is written against the envelope.
- **The component band is deliberately thinner than fashionable.** Testing that `UbDataGrid` renders 25 rows proves little; testing that the invoice line editor recomputes a preview total when a discount changes proves something. §28.4.8 lists what is deliberately not unit-tested.
- **E2E is deliberately thin and slow-moving.** Thirty-five specs, each mapped to a user journey and a set of feature IDs. E2E answers "do the pieces connect", not "is the maths right". Every scenario that could be an API test is an API test.

The band proportions above are targets for the shape of the suite at MVP completion, not quotas to be gamed. They exist so that a reviewer can notice when a PR adds nine component tests and no service test for a change to allocation logic.

### 28.1.3 Speed budget

| Band | Budget | Why it matters |
|---|---|---|
| Pure unit | < 5 s | Runs on save in a watcher |
| Service + selector | < 90 s | Must be runnable before every commit without thinking about it |
| API | < 180 s | The pre-push gate |
| Frontend unit + component | < 120 s | Parallel with the backend on CI |
| E2E smoke (8 specs) | < 3 min | Every PR |
| E2E full (35 specs, 2 viewports) | < 15 min | Merge queue and nightly |

A suite slower than this stops being run, and a suite that is not run is worse than no suite because it provides false assurance. If the service band crosses 90 s, the fix is a faster database strategy (§28.3.3), not fewer tests.

---

## 28.2 The non-negotiable test classes

Canon §0.11 states seven engineering rules. Each maps to a test class that is **mandatory, mechanically enforced, and not subject to a reviewer's judgement about whether this particular PR needs it**. These classes are generated or parametrised wherever possible, so that a new endpoint or model is covered the day it is added rather than the day someone remembers.

### 28.2.1 Tenant isolation — every endpoint proven fail-closed

*Canon rule 2: every business table has `tenant_id`; every queryset goes through the tenant-scoped manager; cross-tenant IDs return 404, never 403.*

Three layers, all automatic:

**(a) The model audit.** A test walks every concrete Django model in the business apps and asserts: the model inherits `TenantModel`; it has a `tenant` FK with `on_delete=RESTRICT` and `db_index=True`; its default manager is the tenant-scoped manager; every `unique_together`/`UniqueConstraint` includes `tenant` or is explicitly whitelisted (global tables: `tax_rate` with null tenant, system `inventory_unit`, system `platform_role`, `help_article`).

```python
def test_every_business_model_is_tenant_scoped():
    for model in business_models():
        assert issubclass(model, TenantModel), model
        assert model._meta.default_manager_name == "objects"
        assert isinstance(model.objects, TenantScopedManager), model
        for c in model._meta.constraints + list(model._meta.unique_together):
            assert "tenant" in fields_of(c) or (model, c) in GLOBAL_UNIQUE_WHITELIST
```

**(b) The endpoint sweep.** A parametrised test enumerates the DRF URL map, and for every endpoint that takes a resource id, issues the request authenticated as tenant A with an id belonging to tenant B, asserting `404` and an empty-ish body. The fixture `two_tenants_full` seeds one of every entity in both tenants. A new endpoint added without scoping fails the suite on the commit that adds it, with a message naming the view class.

```python
@pytest.mark.parametrize("route", detail_routes_of(urlconf), ids=route_id)
def test_cross_tenant_detail_returns_404(route, two_tenants_full, api_as):
    other_id = two_tenants_full.id_for(route.model, tenant="B")
    r = api_as("A")(route.method, route.url(other_id))
    assert r.status_code == 404, f"{route.view.__name__} leaked {route.model.__name__}"
    assert r.json()["error"]["code"] == "not_found"
```

**(c) The list sweep.** For every list endpoint, assert that tenant A's response contains no id belonging to tenant B, that `meta.total` matches a direct SQL count filtered by `tenant_id`, and that `?ordering=`, `?q=` and every declared filter preserve the property (filters are the classic place a raw queryset sneaks in).

Additionally: a test asserts no module under `parties/`, `ledger/`, `inventory/`, `sales/`, `purchases/`, `payments/`, `expenses/`, `reports/` contains `.objects.all()`, `Model.objects.filter(` without a tenant term, or `raw(` outside an audited allow-list. This is a lint-grade check implemented with the `ast` module, not a regex, so it sees through formatting.

Partner-scope isolation (`T-ISO-P1…P10`) is specified in Part 24 §24.8.2 and runs in the same class.

### 28.2.2 Permissions — every role × every endpoint

*Canon §0.9 defines codenames and four system roles.*

A single matrix test is generated from the URL map × `{owner, admin, staff, accountant, unauthenticated, member-of-another-tenant}`. Each cell has an expected outcome declared in one table, `tests/matrix/permissions.py`, which is itself reviewed as a spec artefact:

```python
EXPECTED = {
    ("POST", "sales.invoice-void"):   {"owner": 200, "admin": 200, "staff": 403,
                                       "accountant": 403, "anon": 401, "other_tenant": 404},
    ("POST", "ledger.entry-correct"): {"owner": 201, "admin": 201, "staff": 403,
                                       "accountant": 403, "anon": 401, "other_tenant": 404},
    …
}

def test_permission_matrix_is_exhaustive():
    """Every route in the URL map has a row. A new endpoint without a declared
    expectation fails here, which forces the author to decide who may call it."""
    assert set(EXPECTED) == set(route_keys(urlconf))
```

The exhaustiveness assertion is the important half. It converts "we forgot to add a permission class" — the single most common multi-tenant security defect — into a build failure on the commit that introduces the endpoint.

Further assertions in this class:

- `403` for a permission failure carries `code: "permission_denied"`; `403` for an entitlement failure carries `module_disabled` or `plan_limit_reached`; they are distinguishable by the client and are asserted distinct.
- `permissions_override` on a membership (e.g. staff allowed to adjust stock) is honoured in both directions: an allow grants, a deny revokes even for a role that would otherwise have it.
- Changing a role bumps the `ver` claim, and a token with a stale `ver` is refused (`T-PLT-05-*`).
- **No limit check is applied to `POST /ledger-entries`** — asserted explicitly, because PLT-15 makes this a product promise ("Udhaar entries are never limited").

### 28.2.3 Money arithmetic

*Canon rule 3: Decimal only; totals computed server-side; half-up rounding at line and document level.*

| Test group | What it asserts |
|---|---|
| **No float, anywhere** | An AST check that no money/quantity expression in `sales`, `purchases`, `payments`, `ledger`, `inventory`, `expenses`, `reports` uses `float(`, `round(` (Python's banker's rounding), `/` between a Decimal and a float, or `json.loads` without `parse_float=Decimal` |
| **Serialization** | Every money field serialises as a string with exactly 2 decimals (`"0.00"`, never `0` or `0.0`); quantities up to 3; the assertion walks the response tree and checks every key in the money-key registry |
| **Line rounding** | For the full GST slab set × inclusive/exclusive × discount percent/amount, line tax equals the hand-computed `ROUND_HALF_UP` value to 2 dp. Fixtures include the classic 1-paisa cases: `855.00 @ 5%` → CGST `21.38` / SGST `21.37` (the asymmetric split is intentional and asserted) |
| **Document rounding** | `grand_total = taxable_total + cgst + sgst + igst + cess + round_off`, exactly, for 500 generated documents; `round_off ∈ [-0.50, +0.49]` and is zero when the setting is off |
| **Inter/intra-state** | IGST is populated and CGST/SGST are zero exactly when `is_inter_state`, and never both |
| **Allocation residuals** | Allocating a payment across N documents: Σ allocations ≤ payment amount; no allocation exceeds its document's `amount_due`; the residual becomes `unallocated_amount`; Σ of everything reconciles to the cent. Parametrised over 200 generated (payment, documents) combinations including amounts chosen to force a residual paisa |
| **Weighted average cost** | The six cases of Part 21 §21.3.6 (2) at `numeric(14,4)`: blend on inbound with cost; `on_hand ≤ 0` before inbound ⇒ `new_avg = unit_cost`; plain outbound never changes avg; **reversal of an inbound removes value at the reversed row's cost, and resets to 0 when on-hand reaches zero**; reversal of an outbound comes back in at the cost it left at. Asserted over a 1,000-movement sequence — which **must** contain backdated inbounds and at least one void — against an independent Decimal reimplementation in the test, replayed in canonical (`movement_date`, `sequence_no`) order |
| **Balance direction** | For every `entry_type`, the posted direction matches canon §0.2. A table-driven test with one row per entry type; adding a type without a row fails the suite |
| **Formatting** | `en-IN` grouping (`₹12,34,567.89`, not `₹1,234,567.89`) in both the Python export path and the TS display path, asserted against a shared fixture file |

The generative tests use a seeded `random.Random(20260918)` — reproducible, no `hypothesis` dependency, and a failing seed is printed so the case can be pinned as a regression fixture.

### 28.2.4 Immutability

*Canon rule 1 and Part 21 §21.1.2: `ledger_entry` and `inventory_stock_movement` are append-only; a database trigger enforces it as defence in depth.*

| Test | Assertion |
|---|---|
| `T-IMM-1` | `LedgerEntry.objects.filter(...).update(amount=…)` raises a database error from `forbid_update_delete()` |
| `T-IMM-2` | `entry.delete()` and `queryset.delete()` both raise |
| `T-IMM-3` | The only permitted updates are `status` and `reversed_by_id`; updating any other column raises, including via raw SQL |
| `T-IMM-4` | The only permitted updates on `StockMovement` are the two derived columns `avg_cost_after` and `on_hand_after` (Part 21 §21.3.6): changing `qty`, `unit_cost`, `movement_date`, `sequence_no`, `movement_type`, `reverses_id` or any other fact column raises, including via raw SQL |
| `T-IMM-4a` | The two derived columns are writable **only** from `recompute_item_cost`: an AST check that no other module assigns them, and a test that a direct `.update(avg_cost_after=…)` from application code is rejected by the trigger's caller check |
| `T-IMM-5` | An AST check that no application module calls `.update(` or `.delete(` on these models, including through a variable alias resolved by the checker |
| `T-IMM-6` | Correcting an entry produces exactly three rows in the right relation: original (`status='reversed'`, `reversed_by_id` set), reversal (`reverses_id` set, opposite direction, equal amount), replacement (`supersedes_id` set) — and the party balance after equals the balance implied by the replacement alone |
| `T-IMM-7` | Voiding a document posts reversing ledger entries **and** reversing stock movements atomically; an induced failure between the two rolls both back (asserted by patching the second call to raise inside the transaction) |
| `T-IMM-8` | Voided documents retain their `number`; the sequence does not rewind; a subsequent issue gets the next number, never the voided one |
| `T-IMM-9` | The migration that installs `forbid_update_delete` is present, and a fresh test database actually has the trigger (queried from `pg_trigger`) — this catches a trigger lost to a later migration |

### 28.2.5 Recomputation — the caches are provably caches

*Part 21 §21.1.3: `parties_party.balance`, `inventory_item_stock.on_hand`/`avg_cost`, and document `amount_paid`/`amount_due` are recomputable from the immutable log.*

This is the highest-value test class in the suite, because it is the one that proves the system can recover from any cache-update bug it might ever have.

```python
def test_recalc_balances_reproduces_every_cached_balance(busy_tenant):
    """busy_tenant: 60 parties, ~4,000 ledger entries built by a randomised
    scenario runner — sales, payments, credit notes, reversals, corrections,
    write-offs, voided documents — all through the real service layer."""
    before = {p.id: p.balance for p in Party.objects.all()}
    Party.objects.update(balance=Decimal("-99999999.99"))     # poison every cache
    call_command("recalc_balances", tenant=busy_tenant.id)
    after = {p.id: p.balance for p in Party.objects.all()}
    assert after == before
```

The same shape is asserted for:

- `recalc_stock` → `inventory_item_stock.on_hand` and `avg_cost`, **and every movement row's `on_hand_after` / `avg_cost_after`** (compared at 4 dp; replayed in the canonical `(movement_date, sequence_no)` order of Part 21 §21.3.6, which is the ordering the command must use and which a test asserts explicitly by shuffling `created_at` and proving the result does not move).
- Document `amount_paid` / `amount_due` recomputed from `payments_allocation` + `sales_credit_application`.
- `parties_party.last_activity_at` recomputed from the latest entry.
- `sales_document.status` derivation: `overdue` is exactly `status ∈ {issued, partially_paid} AND due_on < today`, as recomputed by the nightly job.

**The stock-drift fixtures — the cases the suite must contain.** The 500-movement property test above passes today against a specification whose cache and replay diverge, because its generator only ever appends movements in date order. A suite whose fixtures avoid the failing case is worse than no suite: it reports green while the invariant is false. These fixtures are mandatory, and each one is a Tier 1 test (§28.6.3):

| Fixture | Shape | Assertion |
|---|---|---|
| `F-STK-1` **backdated inbound between two outbounds** | opening +10 @ 40 (1 Jun) → sale −4 (5 Jun) → sale −3 (7 Jun) → **purchase +20 @ 46 dated 3 Jun, entered on 9 Jun** | The insert is non-tail: its `avg_cost_after` is null on write, `cost_state` becomes `stale`, exactly one `inventory.recompute_item_cost` is enqueued; after it runs, every movement's derived pair and the cache equal an independent replay in canonical order. **This is the case that currently passes while the invariant is false** (Part 41 BE-01) |
| `F-STK-2` **burst of backdated bills** | five inbounds dated across the previous week, entered in one minute | Exactly **one** recomputation is enqueued per `(item, location, watermark_date)`, not five; the final state equals the replay |
| `F-STK-3` **void restores the average** | purchase +10 @ **500** (a cost mistyped by 10×) → void, nothing intervening | After the recomputation, `avg_cost` equals its pre-bill value to 4 dp. This is Part 15 journey 6's promise, asserted (Part 41 BE-02) |
| `F-STK-4` **void with an intervening sale** | purchase +10 @ 500 → sale −4 → void, `allow_negative_stock=true` | On-hand −4; `avg_cost` 0 by the reset rule; the issued units keep the COGS they were issued at; cache equals replay |
| `F-STK-5` **void blocked** | same with `allow_negative_stock=false` | 409 `insufficient_stock`; **nothing** written — no movement, no `cost_state` change, no job enqueued |
| `F-STK-6` **backdated then voided** | backdated inbound, then the bill that carried it voided before the recomputation ran | Both enqueue on the same token or collapse to one run; the final state equals the replay; no row is left `stale` |
| `F-STK-7` **sale return at the outbound cost** | purchase +10 @ 40 → sale −4 @ 40 → credit note restocks +4 | `avg_cost` is unchanged at 40 — goods return at the cost they left at, which must not dilute the average |
| `F-STK-8` **drift is detected, not healed** | poison `inventory_item_stock.avg_cost`, run `platform.check_invariants` | The job succeeds, its `result.violations` names the item with both figures, and the cache is **still poisoned afterwards** — the job must never self-heal |
| `F-STK-9` **stale is reported** | force a `cost_state='stale'` row older than 15 minutes with no queued job | `platform.check_invariants` reports it as a violation of its own kind |

The randomised 500-movement generator is additionally required to produce backdated dates for at least 10 % of its inbounds, so the property test explores the interior-insert path rather than only the append path. Part 12 §12.5's stock-drift launch dataset carries `F-STK-1`'s shape for the same reason.

Three additional properties of this class:

1. **Poisoning before recompute** is mandatory. A recompute test that does not first corrupt the cache proves nothing — it would pass against a no-op command.
2. **The scenario runner is shared** with the concurrency and performance suites, so one investment produces a realistic tenant for three purposes.
3. **Reversal pairs cancel.** A dedicated test asserts the Part 21 §21.3.4 rule: summing all posted rows (including reversals, which are themselves posted with opposite direction) yields the same balance as excluding reversed/reversal pairs, so the two statement modes and the balance formula agree.

### 28.2.6 Idempotency

*Canon rule 5: every POST that creates a document or payment accepts an `Idempotency-Key`; Part 22 §22.1 defines replay semantics.*

| Test | Assertion |
|---|---|
| Same key, same body | Second call returns the **original** response body byte-identical, status 200/201, header `Idempotent-Replayed: true`, and **no second row** exists in the database |
| Same key, different body | 409 `idempotency_conflict`; no row created; the original remains retrievable |
| Different key, same body | Two rows created (duplicate detection is a business rule, e.g. `duplicate_supplier_invoice`, not an idempotency rule) |
| Key scope | The same key used by a different tenant is independent; keys are stored per tenant |
| Expiry | After 24 h the key is gone and the request creates a new row |
| Concurrency | Two simultaneous requests with the same key: exactly one creates, the other replays or waits; asserted with threads against a real Postgres connection pair |
| Coverage | A parametrised test asserts every endpoint listed in Part 22 as idempotent actually reads the header, and that no endpoint silently ignores it |
| Side effects | A replayed invoice issue does **not** post a second stock movement, a second ledger entry, or a second notification — asserted by counting rows in all three tables |

### 28.2.7 Concurrency

Real threads against a real PostgreSQL. `pytest-django`'s `django_db(transaction=True)` is required for these; they are marked `@pytest.mark.slow` and run in the full suite, not the fast pre-commit band.

| Scenario | Method | Assertion |
|---|---|---|
| **Document numbering** | 20 threads issue invoices in the same tenant and FY simultaneously | 20 distinct numbers, contiguous, no gaps, no duplicates. `SELECT … FOR UPDATE` on `platform_document_sequence` is what makes this pass; removing it must make it fail (asserted by a mutation check run manually at review time) |
| **Numbering across tenants** | 2 tenants × 10 threads | No cross-tenant blocking beyond the per-tenant row; both tenants get 1…10 |
| **Allocation race** | Two payments allocate to the same invoice with `amount_due = 100`, each for 100 | Exactly one succeeds; the other gets 409 or allocates only the remaining 0; `amount_paid` never exceeds `grand_total` |
| **Stock over-issue** | Two invoices issue 8 units each from an on-hand of 10, `allow_negative_stock=false` | Exactly one succeeds; the other returns 409 `insufficient_stock`; `on_hand` never goes negative |
| **Stock over-issue permitted** | Same with `allow_negative_stock=true` | Both succeed; `on_hand = -6`; both movements exist and `recalc_stock` reproduces −6 |
| **Plan limit overshoot** | Two devices create the 300th party at limit 300 | Exactly one succeeds (PLT-15 BR-7, tenant row locked); the other gets 403 `plan_limit_reached` |
| **Party balance** | 30 threads post entries to one party | Final balance equals the Decimal sum of all posted amounts; no lost update |
| **Void versus payment** | Void an invoice while a payment allocates to it | Either ordering leaves a consistent state; the payment survives as an unallocated advance (Part 22 §22.14 step 4) |
| **Refresh-token rotation** | Two simultaneous refreshes with the same token | One succeeds; the family is revoked on detected reuse; the second gets 401 |

---

## 28.3 Backend testing in detail

### 28.3.1 Setup

```
backend/
  pytest.ini
  conftest.py                  # session fixtures: db, tenant, api clients, freezegun-free clock
  tests/
    unit/                      # no database
    services/                  # db, one module per service
    selectors/
    serializers/
    api/                       # DRF client, full envelope assertions
    matrix/                    # generated: isolation, permissions, idempotency coverage
    migrations/
    performance/
    factories/                 # factory-boy, one module per app
    fixtures/                  # JSON: contrast cases, GSTIN vectors, tax vectors
    scenarios/                 # the scenario runner used by recompute/concurrency/perf
```

```ini
# pytest.ini
[pytest]
DJANGO_SETTINGS_MODULE = config.settings.test
python_files = test_*.py
addopts = --strict-markers --reuse-db --durations=15 -p no:cacheprovider
markers =
    slow: real-transaction / threaded tests, excluded from the fast band
    e2e_support: seeds data for the Playwright suite
    query_budget: asserts a SQL query count
filterwarnings = error::DeprecationWarning
```

`config/settings/test` differs from development in exactly four ways, and a test asserts it differs in no others: an in-memory-ish password hasher (`MD5PasswordHasher`) for speed, `MEDIA_ROOT` pointed at a temp directory, the SMS/WhatsApp adapters forced to the recording backend (§28.3.8), and `DEBUG = False`. Notably the **database is the same PostgreSQL 16**, never SQLite — the product depends on `numeric`, partial unique indexes, `jsonb`, trigram search, array columns and triggers, none of which SQLite models faithfully. A suite that passes on SQLite and fails on Postgres is worse than no suite.

### 28.3.2 Factories, not fixtures

`factory-boy` factories are the only sanctioned way to build objects. JSON fixtures are used **only** for reference data that is itself a specification artefact: GSTIN validation vectors, GST rate tables with effective dates, contrast cases, `en-IN` formatting cases, and the CSV import samples.

Rules:

- One factory module per app; factories build **valid minimal** objects and accept overrides. A factory never creates a related object that the test did not ask for, except where the FK is non-nullable.
- **Factories must not bypass services for anything that posts to a ledger or a stock log.** `LedgerEntryFactory` exists only in tests of the ledger's own storage layer; every other test that needs a balance calls `ledger.services.post_entry(...)`. This is the rule that stops the suite from asserting against states the application can never produce.
- A `TenantFactory` creates the partner, plan, owner user, membership, default location, system units and document sequences — the same set `manage.py bootstrap_tenant` creates in production — so a test tenant and a real tenant are structurally identical.
- Sequences use `factory.Sequence` seeded per test to keep names deterministic; nothing depends on random names for uniqueness.

Domain builders sit on top of factories and express business scenarios in one line, which is what keeps service tests readable:

```python
# tests/scenarios/builders.py
party_with_balance(tenant, "5000.00")                    # posts an opening entry
invoice_issued(tenant, party, lines=[(item, 2, "450")], tax="GST5")
invoice_partially_paid(tenant, party, paid="500.00")
supplier_bill_recorded(tenant, supplier, lines=[…])
item_with_stock(tenant, qty="10", cost="40.0000")
busy_tenant(entries=4000, parties=60, seed=20260918)     # the scenario runner
```

### 28.3.3 Database strategy

- `--reuse-db` with a session-scoped template database built once by migrations. Migrations run **for real** (never `--no-migrations`), because migration correctness is itself under test (§28.3.7).
- Per-test isolation by transaction rollback (`django_db`), which is fast. Tests needing real commits (concurrency, trigger behaviour, `FOR UPDATE`) declare `django_db(transaction=True)` and are marked `slow`.
- Seed data (tax rates, units, expense categories, system roles) is loaded once into the template by the same idempotent management commands production uses (`seed_tax_rates`, `seed_units`, `seed_expense_categories`, `seed_roles`, `seed_plans`, `seed_partners`). Running them twice is asserted to be a no-op — that assertion is why they can be run safely on every deploy (Part 29 §29.4).
- The `busy_tenant` scenario is built once per session into the template and copied, not rebuilt per test.

### 28.3.4 Service tests

The largest band. One test module per service function, structured as: the happy path, then the business rules `BR-n` from the FRD one by one, then the edge cases `EC-n`, then the side effects.

The **side-effect assertion** is standard and non-optional. Every service test that posts a document asserts the complete set of rows written, because "it also wrote something it should not have" is as much a defect as "it failed to write":

```python
def test_issue_invoice_posts_exactly_the_expected_side_effects(tenant, party, item):
    inv = draft_invoice(tenant, party, [(item, "2", "450.00")], tax="GST5")

    with assert_rows_written(
        ledger_entry=1, stock_movement=1, audit_log=2,
        notification=0, message_log=0, platform_job=0,
    ):
        sales.services.issue(inv, actor=owner, idempotency_key=uuid7())

    entry = LedgerEntry.objects.get(source_id=inv.id)
    assert entry.direction == "debit" and entry.amount == Decimal("898.00")
    assert entry.entry_type == "invoice" and entry.status == "posted"
    assert StockMovement.objects.get(source_id=inv.id).qty == Decimal("-2.000")
    assert Party.objects.get(pk=party.pk).balance == Decimal("898.00")
    assert inv.refresh_from_db() or inv.number.startswith("INV")
```

`assert_rows_written` is a context manager that snapshots counts of every audited table and asserts the deltas exactly — including the tables expected to be untouched. It is fifteen lines of `conftest.py` and it has caught more real defects in this design than any other single helper.

Each service test module also asserts: the function is wrapped in `transaction.atomic()` (by inducing a failure after a partial write and asserting nothing persisted), and it writes an `AuditLog` row through the service layer (canon rule 4).

### 28.3.5 Selector tests

Selectors (`selectors.py`) are the read side: list filters, aggregates, statements, aging, registers, dashboard tiles. They are tested against a **fixed, hand-authored ledger** whose expected outputs are computed by hand and written into the test as literals, never computed by the code under test.

- Statement: opening balance for the range, running balance per row, closing balance, `include_corrections` toggle changing the row set but never the closing balance.
- Aging: a fixture with entries at 10/40/70/100 days and partial payments; buckets asserted as literals; FIFO application of credits asserted row by row.
- Day book, sales register, purchase register, GST summary: totals asserted as literals and cross-asserted against the sum of the detail rows (the register's own total must equal the sum of its rows — a surprisingly effective check).
- Dashboard: each tile asserted independently, and the tile values cross-checked against the corresponding report endpoint so the two can never diverge.
- Every selector asserted to return the same numbers with and without `select_related`/`prefetch_related` in play.

### 28.3.6 Serializer and API tests

**Serializer tests** cover field-level validation in isolation: required/optional, type coercion, string money in and Decimal out, unknown fields rejected, nested line validation, and `version` handling for optimistic concurrency.

**API tests** assert the full HTTP contract from Part 22:

```python
def test_create_party_returns_envelope_and_201(api_owner):
    r = api_owner.post("/api/v1/parties", PARTY_PAYLOAD)
    assert r.status_code == 201
    body = r.json()
    assert set(body) <= {"data", "meta", "message"}          # envelope shape
    assert body["data"]["balance"] == "0.00"                 # money is a string
    assert "X-Request-Id" in r.headers
    assert r.headers["Content-Type"].startswith("application/json")
```

Standard assertions applied to every endpoint via shared helpers, so they cannot be forgotten:

| Aspect | Assertion |
|---|---|
| Envelope | Success bodies have only `data`/`meta`/`message`; errors only `error` with `code`, `message`, `details`, `request_id` |
| Error codes | Exactly the stable strings in Part 22 §22.1; a test asserts the set of codes the app can emit equals the documented set (no undocumented code, no documented-but-dead code) |
| Pagination | `meta.page/page_size/total/total_pages` present and correct; `page_size > 100` clamped; cursor endpoints return `next_cursor`/`has_more` and a full walk of the cursor yields every row exactly once |
| Filtering | Every documented filter parameter is honoured; an unknown parameter is ignored, not 500 |
| Sorting | Only whitelisted `ordering` fields accepted; an unlisted field returns 400, never an unfiltered queryset |
| Localisation | `Accept-Language: hi` changes the `message` and `details` strings; a test asserts every error code has both `en` and `hi` copy |
| Auth transport | Cookie and Bearer paths both work and produce identical bodies; CSRF is enforced on cookie-authenticated unsafe methods |
| Rate limits | The documented limits fire and return 429 with `X-RateLimit-*` headers |

### 28.3.7 Migration tests

| Test | Assertion |
|---|---|
| No missing migrations | `makemigrations --check --dry-run` exits clean (a model changed without a migration is a build failure) |
| Forward from empty | Full migration run on an empty database succeeds |
| Reversibility | Every migration in the release has a reverse, or declares `elidable`/`noop` explicitly; `migrate <app> <previous>` then forward again succeeds for the last 10 migrations |
| Data migrations | Each `RunPython` tested with a fixture of pre-migration rows and asserted post-state; reverse asserted or explicitly declared irreversible |
| Naming | `NNNN_<verb>_<entity>` enforced by a test over filenames |
| One per PR | Advisory check: a PR touching more than one migration file prints a warning in CI |
| Triggers survive | After the full migration run, `pg_trigger` contains `forbid_update_delete` on both append-only tables |
| Concurrent indexes | Any migration containing `AddIndexConcurrently` has `atomic = False` |

### 28.3.8 Adapter and job tests

The messaging adapters are interfaces at MVP (ADR-015), so the test backend is a **recording backend** that appends to an in-memory list. Tests assert on that list: which template, which locale, which recipient, which placeholders, and — for Part 24 — which partner identity. `assert_no_messages_sent()` is used liberally, because the most damaging messaging defect in a ledger product is an unintended send to a merchant's customer.

The job runner (`platform_job` + `manage.py run_scheduler`) is tested for: idempotent re-run of every job type; **two runners in threads claiming disjoint batches and neither blocking the other** (§28.2.7 style — the model is `FOR UPDATE SKIP LOCKED`, Part 20 §20.8.6.1 rule S1, and a test asserts that a runner executing a deliberately slow job does not delay a second runner's batch); the enqueue advisory lock preventing a periodic task from being materialised twice while **not** delaying either runner's claiming (rule S2); `platform.check_expected_runs` reporting a scheduled run that never happened (rule S4); per-tenant fan-out producing one child job per active tenant rather than one long parent (rule S3); failure isolation (one failing job does not abort the batch), retry with backoff and terminal `failed` state, and correct behaviour when the runner is killed mid-job (the row returns to `queued` after the lease expires, and the job's own idempotency prevents a duplicate effect).

### 28.3.9 Settings and deployment-shape tests

Small, cheap, and they catch the failures that only appear in production:

- `DEBUG is False`, `UB_ALLOW_PARTNER_HEADER is False`, `UB_SECRET_KEY` not the development default, `UB_ALLOWED_HOSTS` non-empty, secure cookie flags on, HSTS configured — asserted against `config.settings.prod` imported directly. The four permitted settings modules are `config.settings.{local,staging,prod,test}`, and a test asserts no other module name appears in the repository, the compose files or the Dockerfiles.
- Every environment variable read anywhere in the codebase appears in the **single** `.env` catalogue, which is Part 29 §29.2.4 and only there — a test parses the settings modules with `ast` and diffs the variable names against that one table, in both directions. It also asserts the prefix convention: every application-read variable begins `UB_`, and the only unprefixed names are the third-party ones that table lists.
- The compose file's service names and the Dockerfiles' entrypoints match what the runbooks reference.

### 28.3.10 Query budgets and the N+1 check

Every list endpoint and every report declares a query budget. The budget is asserted at two data sizes so that a linear-in-rows query is caught:

```python
@pytest.mark.query_budget
@pytest.mark.parametrize("rows", [5, 200])
def test_party_list_query_budget(api_owner, seeded_parties, rows):
    seeded_parties(rows)
    with assert_num_queries_at_most(7):
        api_owner.get("/api/v1/parties?page_size=100")
```

Budgets (maximum queries per request, MVP):

| Endpoint class | Budget |
|---|---|
| Simple list (parties, items, expenses) | 7 |
| List with aggregates in `meta.totals` | 9 |
| Document list with party + totals | 9 |
| Document detail with lines, party, payments | 11 |
| Party statement page | 8 |
| Dashboard | 14 |
| Any write endpoint | 25 |

The budget is a **ceiling that may only be lowered**. A PR that raises a budget must say why in the commit message, and the reviewer treats it as a design change, not a test fix.

---

## 28.4 Frontend testing in detail

Jest + `@testing-library/react` + `@testing-library/user-event` + `jest-environment-jsdom`. No Storybook (ADR-021 / Part 23 §23.4), no `msw`: HTTP is faked by mocking the thin `api/<x>Service.ts` module, which is the only place Axios is called, so the mock boundary is one module deep and stable.

```
src/modules/DigiKhaato/
  features/<feature>/
    api/<x>Service.ts            ← mocked in component and thunk tests
    redux/<x>Slice.ts            ← reducer tests
    redux/<x>Thunk.ts            ← thunk tests with the service mocked
    components/*.tsx             ← component tests
    view-model/*.ts              ← pure unit tests
    validation/ (schemas)        ← pure unit tests
  design-system/Ub*/Ub*.test.tsx
src/utils/*.test.ts
src/hooks/useValidationSchemas.test.ts
```

### 28.4.1 Pure units: utils and view-models

Fast, numerous, and where the highest-value frontend tests live because these functions decide what the merchant *reads*.

- `utils/money.ts`: `en-IN` grouping and lakh/crore boundaries; `"0.00"` renders as `₹0.00` not `₹0`; negative amounts render with the correct label and tone; parsing `"1,23,456.78"` back to a decimal string; `decimal.js-light` used for any arithmetic, never `Number`.
- `utils/dates.ts`: dd/mm/yyyy display, FY label derivation (`fy_start_month`), quick-chip ranges, "future business date rejected" boundary at the tenant's timezone midnight.
- `utils/phone.ts`: `normaliseIndianMobile` over the full vector set (`9876543210`, `+91 98765 43210`, `09876543210`, `919876543210`, junk) — the same vectors the Python `normalise_mobile` test uses, shared as a JSON fixture so the two implementations cannot drift.
- `utils/gstin.ts`: `isValidGstin` over the checksum vector file, including the documented invalid-checksum and invalid-state-code cases; PAN extraction.
- `utils/theme.ts`: `hexToHslRamp` and `contrastRatio` against the shared fixture, asserted identical to the Python implementation's recorded output (Part 24 §24.4.3).
- `view-model/*Display.ts`: balance label and tone (`You will get` / `You will give` / `Settled`), status badge tone mapping, stock status, aging bucket label — these are pure functions over a status and a number, and each has a table-driven test with one row per input state.
- `view-model/*Actions.ts`: which actions a given role sees. Table-driven over `{owner, admin, staff, accountant}`, mirroring the backend permission matrix, so a divergence between what the UI offers and what the API allows is caught in the frontend suite.

### 28.4.2 Redux slices

Reducers are pure; they are tested by dispatching actions against a known state and asserting the next state. Per slice: initial state, each reducer, and the three lifecycle cases of each thunk (`pending` sets loading and clears error; `fulfilled` sets data and clears loading; `rejected` sets the error from `handleAxiosError`'s normalised shape and clears loading).

Specific assertions that have caught defects in the reference codebase and are therefore mandatory here:

- A `rejected` thunk never leaves `loading: true`.
- List slices reset `page` to 1 when a filter changes, and do not reset when only the sort changes.
- `snackbarSlice` is a single channel: dispatching two messages replaces rather than queues, matching the design-system decision (Part 23).
- `whiteLabelSlice` clears its theme cache key on tenant switch (Part 24 §24.4.5).
- `sessionSlice` clears every feature slice on logout — asserted by dispatching `logout` against a fully populated store and comparing to the freshly constructed initial state.

### 28.4.3 Thunks

`createAsyncThunk` tests mock the service module and assert: the correct service function is called with the mapped request payload (camelCase → snake_case at the boundary), the response is mapped back (`mapPartyFromApi`), the fulfilled payload shape, and the rejected path's error normalisation. Money is asserted to pass through as **strings**, untouched — a thunk that parses `"1234.50"` into a JS number is a defect class this test exists to prevent.

### 28.4.4 Hooks

`renderHook` from RTL. `useValidationSchemas` is tested per schema by feeding valid and invalid objects to `schema.validate` and asserting the message keys (not the English strings, so copy changes do not break tests). `useExclusiveModal` is tested for the single-open policy. `useTranslation` is tested for key fallback and for the assertion that every key used in the app exists in both `en.json` and `hi.json` — a standalone test that walks the source for `t('…')` calls and diffs against both locale files, which is how canon rule 6's i18n requirement becomes enforceable.

### 28.4.5 Components

Tested through the user's eyes: queries by role and accessible name, interactions through `user-event`, assertions on what is visible. Never on implementation details — no shallow rendering, no snapshot of a DOM tree, no reaching into props.

Every feature's primary components are tested for the state set the FRD's section 9 requires: **Initial, Loading, Empty (all three variants), Success, Error, Disabled, Partial, Processing, Completed, Failed**. A shared helper `expectStates(Component, cases)` drives this so the coverage is uniform across features.

High-value component tests, by pattern:

- **List pages**: search debounce (300 ms, asserted with fake timers), filter change resets page, skeleton while loading, the three empty states, totals row reflecting the filtered set, row click opens the drawer.
- **Forms**: a required field's error appears on blur and clears on correction; submit is disabled while submitting; a server 400 with `details.field` maps to the right field error; the form retains its data after a `plan_limit_reached` dialog (PLT-15 FR-6).
- **`UbLineItemsEditor`**: adding a line, changing qty/price/discount recomputes the **preview** total; the preview is visibly labelled as a preview; on save the server's totals replace the preview even when they differ (asserted with a deliberately different server response — this is the test that encodes canon rule 3 in the UI).
- **`UbReasonDialog`**: reason under 3 characters blocks confirm; the consequences line ("Stock +2, Ledger −₹898") renders from props.
- **Money and quantity inputs**: decimal-safe entry, paste of `1,23,456.78`, rejection of a second decimal point, 3-dp clamp on quantities, unit addon.
- **`UbAmount`**: tone and label for positive, negative and zero, with the text label always present alongside the colour.

### 28.4.6 Design-system component policy

Every `Ub*` wrapper has a `*.test.tsx` (Part 23 §23.4) covering: renders with required props; each variant/tone; the interaction states that are behavioural (disabled blocks the handler, loading shows the spinner and blocks double-submit); the accessible role and name; keyboard operation for anything interactive; and `className` merge order (the passed class wins).

What these tests deliberately do **not** assert: the underlying `ML*` primitive's behaviour (Radix is tested by its authors), exact class strings, computed colours, or layout geometry. A `Ub*` test that asserts `toHaveClass('bg-primary-500')` is testing Tailwind, not the product, and is rejected in review.

### 28.4.7 Accessibility assertions

No `jest-axe` (a dependency outside ADR-021). Instead, targeted assertions that cover the failure modes that actually occur in this product:

- Every form control is reachable by `getByLabelText` — a control that cannot be queried by its label has no label.
- Every icon-only button has an accessible name.
- Dialogs and drawers have `role="dialog"` with an accessible name, trap focus, and restore focus to the trigger on close.
- Every status is conveyed by text as well as colour (asserted by querying for the text, which is the mechanical form of the Part 23 §23.6 rule).
- Tables have header cells associated with their columns.
- A lint-grade test asserts no `tabIndex` greater than 0 and no `outline: none` without a replacement focus style in the design-system sources.

Contrast is not asserted in Jest; it is asserted by `scripts/check-contrast.mjs` over the token files in CI, and by the server-side validator for partner and tenant themes (Part 24 §24.4.4).

### 28.4.8 What is deliberately not unit-tested on the frontend

Stated explicitly so that reviewers do not ask for it and authors do not write it:

| Not tested | Why | Covered instead by |
|---|---|---|
| Tax and total arithmetic | The server is authoritative (canon rule 3); the client's numbers are previews | Backend money tests; one E2E asserting the displayed total equals the server's |
| `ML*` primitive behaviour | Third-party, tested upstream | — |
| Tailwind class output, colour values, spacing | Testing the framework; brittle | Contrast script, design-system gallery route, manual visual review |
| Next.js routing mechanics | Framework behaviour | E2E navigation specs |
| `app/**/page.tsx` route files | They are Suspense wrappers around a feature component by convention (canon §0.10) | The feature component's own tests |
| Axios interceptors' transport behaviour | One module, thin, exercised by every thunk test | One dedicated test for the token-refresh and `plan_limit_reached` hooks |
| Print components' pixel layout | Not assertable in jsdom | Manual print-check on the device matrix; E2E asserts the print view renders with the right data and branding |
| PWA install and service-worker behaviour | Environment-dependent | Manual checklist (§28.8) |

---

## 28.5 End-to-end testing

Playwright against the pre-installed Chromium, run against a real stack brought up by docker-compose (`db`, `backend`, `scheduler`, `frontend`) with a seeded database. No mocking of the backend at any level: an E2E that mocks the API is a component test wearing a costume.

### 28.5.1 Configuration

```ts
// e2e/playwright.config.ts
export default defineConfig({
  testDir: './specs',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  retries: process.env.CI ? 1 : 0,          // see the flakiness policy, §28.5.5
  workers: process.env.CI ? 2 : 4,
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'e2e/report.json' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile',  use: { ...devices['Pixel 5'] } },          // 393×851, touch, mobile UA
    { name: 'mobile-3g', use: { ...devices['Pixel 5'] },          // throttled, smoke subset only
      metadata: { throttle: { download: 400_000, upload: 200_000, latency: 400 } } },
  ],
});
```

Selectors are `data-testid` attributes for structural anchors (page shells, grids, drawers) and accessible-name queries for everything the user actually interacts with. CSS-class and nth-child selectors are forbidden — they are the single largest source of E2E flake.

### 28.5.2 Test-data seeding

`manage.py seed_e2e --reset` builds a deterministic world in one transaction, and is the only way E2E data is created:

| Fixture | Contents |
|---|---|
| Partners | `metis`; `demopartner` with a verified `*.localhost` host, locked `primary_hex`, console messaging |
| Tenants | `T-RETAIL` (regular GST, inventory on, `unlimited` plan), `T-SERVICE` (unregistered, inventory off), `T-OTHER` (under `demopartner`, for isolation specs) |
| Users | one per role per tenant, fixed mobiles `+919000000001…`, password login enabled, plus a multi-tenant user who belongs to `T-RETAIL` and `T-OTHER` |
| Parties | 12 in `T-RETAIL` spanning owes-me / i-owe / settled, one with a credit limit, one archived, one with a collection date today and one overdue |
| Items | 10 goods across two categories with stock and one at reorder point, 2 services, one with a barcode |
| Documents | 6 issued invoices (paid, partial, unpaid, overdue), 1 draft, 1 estimate, 1 credit note, 2 purchase bills, 4 payments, 3 expenses |
| Ledger | ~120 entries including a reversal and a correction pair |

Each spec runs against a fresh database state: the runner restores the seeded template with `dropdb/createdb` from a template (sub-second) between spec files, not between tests within a file. Specs are written to be independent at file granularity and are allowed to be sequential within a file (billing flows are genuinely sequential and pretending otherwise produces contortions).

OTP is obtained through a test-only endpoint available when `E2E_MODE=1`: `GET /system/test/last-otp?mobile=` returns the most recent code from the console SMS backend. It is asserted absent in production settings.

### 28.5.3 The critical-path suite

35 specs. Each names its journey, the feature IDs it covers, and the viewports it runs on.

| # | Spec | Journey | Feature IDs | Viewports |
|---|---|---|---|---|
| E1 | `auth/signup-onboarding` | New mobile → OTP → create business (retail, regular GST, GSTIN) → land on dashboard with seeded defaults | PLT-01, PLT-03, PLT-06 | both |
| E2 | `auth/login-logout-session` | Password login, logout, session list, revoke another device | PLT-02, PLT-09 | desktop |
| E3 | `auth/multi-business-switch` | User in two tenants switches; data and branding change; token re-issued | PLT-04 | both |
| E4 | `parties/create-and-find` | Create party with mobile + GSTIN + opening balance; find by search; archive blocked by balance | PTY-01, PTY-02, PTY-04 | both |
| E5 | `ledger/you-gave-you-got` | Party detail → You gave ₹500 → balance updates → You got ₹200 with mode → statement shows both | LED-01, PTY-03 | both |
| E6 | `ledger/correct-and-reverse` | Correct an entry with reason → statement shows corrections toggle → balance reflects replacement only | LED-03 | desktop |
| E7 | `ledger/statement-share` | Date range → statement → print view renders with branding → WhatsApp share URL built correctly | LED-04, WLB-01 | both |
| E8 | `ledger/reminder-manual` | Set collection date → reminder bucket → send WhatsApp reminder → logged as sent | LED-05, LED-06 | mobile |
| E9 | `ledger/aging` | Aging report buckets → drill into a bucket → party list filtered | LED-09 | desktop |
| E10 | `ledger/write-off` | Write off a small balance with reason → party settles → archive now permitted | LED-11, PTY-04 | desktop |
| E11 | `inventory/item-lifecycle` | Create item with opening stock → edit price → archive blocked by stock → adjust to zero → archive | INV-01, INV-05, INV-06 | both |
| E12 | `inventory/low-stock` | Sale takes an item below reorder point → low-stock badge and dashboard bucket | INV-07 | desktop |
| E13 | `inventory/stock-summary` | Stock summary values on-hand × avg cost; matches item detail | INV-08 | desktop |
| E14 | `sales/credit-invoice` | Invoice a party on credit → number allocated → stock deducted → ledger debit → party balance up | SAL-02, LED-10, INV-03 | both |
| E15 | `sales/walk-in-cash` | Walk-in sale, full payment at the counter, receipt printed | SAL-07, PAY-01 | mobile |
| E16 | `sales/estimate-convert` | Estimate → share → convert to invoice → estimate marked converted | SAL-01 | desktop |
| E17 | `sales/invoice-share-public` | Share link → open logged-out in a new context → branded public page → UPI QR present | SAL-03, SAL-14 | both |
| E18 | `sales/void-invoice` | Void with reason → stock restored → ledger reversed → number retained → payment remains an advance | SAL-05 | desktop |
| E19 | `sales/credit-note` | Credit note against an invoice with restock → ledger credit → invoice due reduced | SAL-04 | desktop |
| E20 | `sales/draft-autosave` | Start an invoice, navigate away, return, draft restored | SAL-06 | both |
| E21 | `sales/list-filters` | Status tabs, date range, party filter, totals reflect the filtered set | SAL-08 | desktop |
| E22 | `purchases/bill-and-pay` | Record a purchase bill → avg cost updates → supplier balance → pay partially | PUR-01, PAY-02 | desktop |
| E23 | `purchases/duplicate-blocked` | Same supplier invoice number → 409 surfaced as an inline error | PUR-01 | desktop |
| E24 | `payments/allocate-fifo` | Payment with `auto` allocation across two open invoices; residual becomes an advance | PAY-01, PAY-03 | desktop |
| E25 | `payments/void` | Void a payment → ledger reversed → invoice returns to unpaid | PAY-05 | desktop |
| E26 | `payments/upi-qr` | Set VPA → invoice UPI QR renders → intent URL well-formed | PAY-04 | mobile |
| E27 | `expenses/record-and-cashbook` | Record an expense → appears in cashbook and day book | EXP-01, RPT-03 | both |
| E28 | `reports/dashboard-and-daybook` | Dashboard tiles match the underlying reports; day book chronology correct | RPT-01, RPT-03 | desktop |
| E29 | `reports/gst-summary` | GST summary by slab ties to the sales register for the period | RPT-06 | desktop |
| E30 | `reports/export-csv` | Request a CSV export → download → header row and a spot value correct | RPT-08 | desktop |
| E31 | `platform/team-and-permissions` | Invite staff → accept → staff cannot void or correct (UI hides, API refuses) | PLT-05 | desktop |
| E32 | `platform/settings-numbering` | Change the invoice prefix → next invoice uses it → old numbers unchanged | PLT-06 | desktop |
| E33 | `whitelabel/tenant-branding` | Upload logo, set colour, reject a low-contrast colour with a suggestion, invoice preview shows branding | WLB-01 | both |
| E34 | `whitelabel/partner-host-isolation` | Open the partner host → branded login → only that partner's tenants listed → switching to the other partner's tenant refused | WLB-02, WLB-03 | desktop |
| E35 | `imports/parties-csv` | Upload a CSV → validation preview with errors → fix → commit → parties created with opening balances | PTY-10, IMP-01 | desktop |

**Smoke subset** (runs on every PR, ≤ 3 min): E1, E4, E5, E14, E17, E22, E24, E28.
**Full suite** (merge queue and nightly): all 35 on `desktop` and the 14 marked `mobile`.
**3G subset** (nightly only): E1, E5, E14, E15 on `mobile-3g` with the throttle applied, asserting the interaction budgets in §28.9.

### 28.5.4 Mobile-viewport runs

The mobile project is not a cosmetic re-run. Specs marked for mobile assert mobile-specific behaviour explicitly: the bottom navigation is present and the sidebar is not; forms are single-column; the primary action is reachable in the thumb zone (asserted by bounding-box position, bottom third of the viewport); tables have become cards; drawers open from the bottom; touch targets are ≥ 44 px (asserted by measuring the bounding box of primary controls); and the "You gave / You got" flow (E5) completes in a countable number of taps, asserted as a budget so a redesign that adds a step is caught.

### 28.5.5 Flakiness policy

1. **One retry in CI, zero locally.** A test that passes only on retry is still a failure of the suite's credibility.
2. **Every retry is recorded.** The JSON reporter output is appended to `e2e/flake-log.jsonl` in the pipeline artefacts with the spec, the step and the date.
3. **Three retries in fourteen days quarantines the spec.** A quarantined spec moves to the `@quarantine` project, still runs nightly, still reports, but does not block merges — and an issue is opened with the trace attached. A spec may be quarantined for at most two weeks; after that it is fixed or deleted. A permanently quarantined test is a lie.
4. **`waitForTimeout` is banned.** Waits are on conditions: a response, a network-idle state, an element state. A PR introducing a fixed sleep is rejected.
5. **Time is controlled.** Specs that depend on "today" set the tenant's clock through the seeded data rather than the system clock, and `document_date` defaults are asserted against the seeded date so a midnight-boundary CI run does not flake.
6. **Flake is a defect in the product until proven otherwise.** The first question on a flaky spec is whether the application has a race, not whether the test needs a longer timeout. Two real defects found in the reference codebase this way (an optimistic row that could double-submit; a drawer that could close before its save resolved) justify the posture.

---

## 28.6 Test IDs and traceability

### 28.6.1 The convention

Every test in every FRD section 21 carries an ID `T-<FEATURE>-n`, where `<FEATURE>` is the canon §0.5 feature ID and `n` is a sequence within that feature. Examples from the written FRDs: `T-WLB-01-3`, `T-PLT-15-2`, `T-LED-03-5`.

The ID appears in the code as a marker, and the marker is the join key:

```python
# backend
@pytest.mark.feature("T-WLB-01-3")
def test_branding_resolution_order_reports_source(...): ...
```

```ts
// frontend
it('[T-WLB-01-5] applies the primary ramp before hydration', async () => { … });

// e2e
test('[T-WLB-01-6] logo and colour appear on the invoice preview', async ({ page }) => { … });
```

Rules:

- **An FRD test ID may map to more than one executed test** (a service test and an API test can both discharge `T-LED-03-5`); it may never map to zero.
- **An executed test may carry more than one ID** where it genuinely proves several listed behaviours, but this is discouraged — it makes a failure ambiguous.
- IDs are stable. A withdrawn test keeps its ID and is marked withdrawn in the FRD; numbers are never reused.
- Tests that exist for engineering reasons and are not listed in any FRD (the generated matrices, query budgets, migration tests) carry class IDs instead: `T-ISO-*`, `T-PERM-*`, `T-MONEY-*`, `T-IMM-*`, `T-RECALC-*`, `T-IDEM-*`, `T-CONC-*`, `T-DEPLOY-*`, `T-PERF-*`.

### 28.6.2 The traceability matrix

A generated artefact, not a maintained document. `manage.py build_traceability` (and its Jest/Playwright counterparts feeding the same file) produces `build/traceability.json` and a Markdown rendering:

| Feature | AC | User story | FRD test IDs | Executed tests | Status |
|---|---|---|---|---|---|
| WLB-01 | AC-1 | US-WLB-01-1 | T-WLB-01-1, T-WLB-01-5, T-WLB-01-6 | 3 backend, 1 jest, 1 e2e | ✅ |
| WLB-01 | AC-2 | US-WLB-01-2 | T-WLB-01-6 | 1 e2e | ✅ |
| LED-03 | AC-1 | US-LED-03-1 | T-LED-03-1…4 | 4 backend | ✅ |
| … | | | | | |

How it is built:

1. Parse each FRD file: extract every `T-<FEATURE>-n` from section 21, every `AC-n` from section 22 with its `(US-n)` mapping, and every `US-<FEATURE>-n` from section 3.
2. Collect markers from the three runners (pytest via a plugin hook writing to JSON, Jest via a custom reporter parsing `[T-…]` from test names, Playwright via the JSON reporter).
3. Join. Emit three lists: **unimplemented** (FRD ID with no executed test), **orphaned** (executed test with an ID not in any FRD), **unmapped ACs** (an acceptance criterion whose user story has no test).

The pipeline **fails** on any unimplemented ID for a feature marked done in the task breakdown, and **warns** on orphans. The matrix is published as a build artefact so "is LED-03 actually finished?" is answerable by looking, not by asking.

### 28.6.3 Definition of done for one feature, and the test-requirement tiers

The previous version of this section required every `FR-n`, every `BR-n` and every `EC-n` to have its own test. On `SAL-02` that is roughly seventy tests for one feature; across 74 MVP features it is a suite whose runtime exceeds §28.1.3's own budget, and a suite slower than its budget stops being run (Part 41 BA-05, TL-02, TL-08; Part 42 CF-06). A requirement that cannot be met is abandoned quietly, which costs more than a requirement that can be met and is enforced. The requirement is therefore **tiered by what the rule can break**, not applied uniformly.

**The rule that assigns the tier.** This is a rule, not a list, so no one maintains a register and no one negotiates a row:

> **Tier 1 — a dedicated test is mandatory.** A rule is Tier 1 if it touches any of: **money** (an amount, a tax figure, a rounding, an allocation, a balance), **stock** (a quantity, a cost, an average, a movement), a **ledger direction**, a **document number or sequence**, a **permission or role**, a **tenant boundary**, an **immutability or reversal guarantee**, or an **idempotency key**. Equivalently: if getting it wrong produces a wrong number, a leaked row or an unrecoverable state, it is Tier 1.
>
> **Tier 2 — covered by an existing test, mapping recorded.** Every other rule with an observable behaviour: defaults, ordering, filtering, empty states, copy, presentation, navigation, client-side validation that the server also enforces. Discharged by a component, API or E2E test that carries the rule's ID as a **secondary** marker; no new test is written for it if one already exercises it.
>
> **Tier 3 — explicitly untested, with a recorded reason.** Permitted only for a rule with **no observable failure mode** — a statement of intent, a forward reference, a Phase 2 note, or a rule whose entire content is "the server is authoritative" where the server rule itself is Tier 1. The reason is written in the FRD next to the rule.

Two derived rules settle the arguments this will otherwise produce:

- **A rule is Tier 1 if any clause of it is Tier 1.** A rule that says "the drawer shows the running total and the server recomputes it" is Tier 1, for the second clause.
- **Ambiguity resolves upward.** If a reviewer and an author disagree about the tier, it is the higher tier. The cost of an unnecessary test is minutes; the cost of a missing Tier 1 test is a wrong balance.

Because the tier is *derived* from the rule's text, no FRD needs a hand-maintained tier column and no two FRDs can disagree about the same kind of rule. The traceability builder (§28.6.2) applies the rule when it parses each FRD §21 and prints the tier it assigned, so a mis-assignment is visible in a build artefact rather than argued about in review.

**What each tier costs, and what the gate does:**

| Tier | Test required | Traceability matrix (§28.6.2) | Typical share of a feature's rules |
|---|---|---|---|
| **1** | A dedicated test whose ID appears in the FRD §21 list | A gap **fails the build**, with no override | ~a third |
| **2** | An existing test carrying the ID as a secondary marker | A gap is a **warning**, reviewed at the phase boundary | ~half |
| **3** | None | Listed in the **Tier 3 inventory**, a published build artefact | ~a sixth |

The Tier 3 inventory is reviewed at every phase boundary, so "untested" is a visible, accumulating list rather than a silence. A rule may be moved to a lower tier only by changing the rule in the FRD, in a reviewed change — never by deleting its test.

**Whole classes that are Tier 1 regardless of which feature they belong to:** everything in §28.2 — tenant isolation, permissions, money arithmetic, immutability, recomputation (including the stock-drift fixtures `F-STK-1`…`F-STK-9` of §28.2.5), idempotency and concurrency. These are written once as class-ID tests (`T-ISO-*`, `T-MONEY-*`, `T-RECALC-*`, …) and cover every feature through the generated matrices, which is why tiering the per-feature rules does not weaken them.

**Definition of done for one feature.** A feature is done when, mechanically:

1. every **Tier 1** rule (FR, BR or EC, by the rule above) has at least one dedicated test, green, with its ID in the FRD §21 list;
2. every **Tier 2** rule has at least one executed test carrying its ID;
3. every **Tier 3** rule has a recorded reason in the FRD;
4. every `AC-n` is green;
5. the permission matrix has rows for its endpoints, and the isolation sweep covers its endpoints (both automatic);
6. its states from section 9 are covered by component tests;
7. its `en` and `hi` keys exist;
8. its analytics events (section 18) are emitted and asserted by at least one test (Part 31 §31.6).

Conditions 1, 4 and 5 are build-failing. Conditions 2, 6, 7 and 8 are warnings that block the phase boundary rather than the commit. This is the authoritative definition; canon §0.11 rule 6 and the review checklists cite it.

## 28.7 Coverage targets

Coverage is measured with `coverage.py` (via `pytest --cov` where available, else `coverage run -m pytest`) and Jest's built-in Istanbul instrumentation. Neither requires a dependency outside ADR-021's spirit; `coverage` ships as a `pytest-django` companion and Jest's is built in.

| Layer | Line | Branch | Reasoning |
|---|---|---|---|
| `**/services/*.py` | **95 %** | 90 % | The invariants live here. An untested branch in `allocate_payment` is an untested way to lose money |
| `**/selectors.py` | 90 % | 85 % | Report arithmetic; wrong numbers are as bad as wrong writes |
| `**/serializers.py` | 90 % | 80 % | The contract surface |
| `**/api/views.py` | 85 % | 75 % | Thin by design; the matrices cover the branches that matter |
| `**/models.py` | 80 % | — | Mostly declarative; the parts that are not (properties, `clean`) are covered by service tests |
| `platform/middleware/*` | 95 % | 90 % | Tenant and partner resolution — a bug here is a cross-tenant leak |
| `**/management/commands/*` | 85 % | 75 % | Recompute and scheduler commands are covered by §28.2.5 |
| `migrations/` | excluded | — | Tested by execution, not by coverage |
| `src/utils/**`, `src/**/view-model/**` | **95 %** | 90 % | Pure, cheap, and they decide what the merchant reads |
| `src/**/redux/**` | 90 % | 85 % | Deterministic and cheap to cover |
| `src/design-system/Ub*` | 85 % | — | Variants and states |
| `src/**/components/**` | 70 % | — | Diminishing returns above this; the states matrix matters more than the percentage |
| `app/**` route files | excluded | — | Suspense wrappers by convention |

**Overall gates: backend ≥ 85 % line, frontend ≥ 75 % line.** A PR that lowers the overall number by more than 0.5 pp fails.

**Coverage is a floor, not a goal.** This is stated as a rule because the failure mode is well known and expensive: a team that optimises the number writes tests that execute lines without asserting behaviour, and the suite's percentage rises while its value falls. Three corollaries, enforced in review:

1. A test with no assertion, or whose only assertion is `assertIsNotNone`, is not a test. A lint check flags test functions containing no `assert`.
2. Hitting the target does not exempt a PR from the non-negotiable classes in §28.2. A change to allocation logic needs a residual test even if coverage is already 98 %.
3. Missing the target on a specific file is a conversation, not an automatic failure — the gate is on the aggregate, and a reviewer may accept a deliberately thin file with a reason recorded in the PR.

---

## 28.8 Manual and exploratory testing

Automation cannot see a ₹ symbol clipped by a Devanagari matra, a thermal print that runs off the paper, or a bottom sheet hidden behind a Xiaomi gesture bar. These are the defects that make a merchant put the phone down.

### 28.8.1 The device matrix for India

The product's target user is on a 2 GB Android phone on a congested network. The matrix reflects the market, not the team's phones.

| Tier | Representative device | OS / browser | Why it is in the matrix | Cadence |
|---|---|---|---|---|
| **Low-end** (primary) | Redmi A-series / Samsung M0x, 2 GB RAM, 720×1600 | Android 11–13, Chrome | The modal target user; the device where performance budgets are real | Every release |
| **Low-end, alternate engine** | Any 2–3 GB device with a vendor browser (Mi Browser, Samsung Internet) | Android 11+ | Vendor browsers differ on `input[type=color]`, file pickers, `getUserMedia` and PWA install | Every release |
| **Mid-range** | Redmi Note / Realme, 4–6 GB, 1080×2400 | Android 13–15, Chrome | The largest installed base | Every release |
| **iOS** | iPhone SE (2nd gen) or 11 | iOS 16+, Safari | Minority among merchants but common among accountants; Safari's date input, PWA and cookie behaviour differ | Every release |
| **Desktop** | 1366×768 Windows laptop | Chrome, Edge | The counter PC and the accountant's machine; 768 px height is the real constraint | Every release |
| **Tablet** | Any 10", 1280×800 | Chrome | Distributor field staff | Each phase |
| **Print** | 80 mm thermal (Bluetooth/USB), A4 inkjet | — | Bills are the product's output; a clipped bill is a returned bill | Every release touching documents |

Network conditions exercised on the low-end tier: **3G throttled** (400 kbps down, 400 ms latency), **flaky** (20 % packet loss via the browser's offline toggle mid-request), and **offline** (write attempted while offline → draft retained + retry, per the FRD shared UX rules).

### 28.8.2 The regression checklist

Run before every release; 45–60 minutes on the primary device. Each line is pass/fail with a note.

**Auth and shell** — OTP arrives and verifies; wrong OTP shows attempts left; session survives an app switch; logout clears everything; tenant switch changes branding and data; bottom nav on mobile, sidebar on desktop; back button behaves at every depth.

**The core loop** — Record "You gave" in under 10 seconds from the home screen; balance updates without a refresh; record "You got" with a mode; statement opens and the running balance is right; share to WhatsApp opens the composer with the right text; the amount renders correctly in Hindi.

**Billing** — Create an invoice with two lines including one scanned or typed barcode; a discount; check CGST/SGST split; save and issue; the number follows the series; the PDF/print view is correct on A4 and on 80 mm; the UPI QR scans with a real UPI app and pre-fills the right amount.

**Money display** — Lakh and crore grouping; a zero balance; a negative balance's label; a 3-decimal quantity; a ₹ symbol adjacent to Devanagari text.

**Failure paths** — Airplane mode mid-save; a 500 forced by a test flag; a plan-limit dialog; a permission denial as staff; a stale-version conflict on a document edit.

**Localisation** — Switch to Hindi; every screen in the loop above; no clipped matras; no untranslated string in the primary flows; dates and numbers formatted per locale.

**Accessibility** — Full keyboard pass of the invoice form on desktop; focus visible everywhere; the screen-reader announcement on the party balance card.

### 28.8.3 Exploratory charters and UAT

Exploratory testing is time-boxed and charter-driven (60–90 minutes each, notes recorded, defects filed with the trace):

1. *Try to make a balance wrong* — corrections, reversals, voids, credit notes and partial payments in unusual orders, then run `recalc_balances` and compare.
2. *Try to break numbering* — issue, void, change the prefix, cross a financial year, issue from two devices.
3. *Try to see another tenant's data* — id substitution in every URL and every payload field, token replay after a tenant switch, share-link tokens.
4. *Try to lose data* — kill the app mid-save, background it during an upload, run out of storage, switch networks mid-request.
5. *Be a bad-faith merchant* — negative quantities, 10,000-character notes, emoji in every field, a ₹99,99,99,999 invoice, a party named `<script>`.
6. *Be a slow network* — every primary flow on 3G with the throttle on, watching for missing skeletons and double-submits.

**UAT script.** Three real merchants (one retail, one wholesale, one services) run a scripted day: open the shop, add two new customers, record four udhaar entries, raise three bills including one on credit, receive two payments, record an expense, send one reminder, close the day with the cashbook, and export a statement for their accountant. Success is defined not as "no bugs" but as: they complete every task without help, their numbers match what they expected, and they can explain to us what each screen was for. Any task requiring intervention is a product defect, filed as such.

---

## 28.9 Performance, load and resilience

### 28.9.1 Targets

| # | Target | Measured how |
|---|---|---|
| P1 | **Tap to persisted ledger entry < 400 ms** on a 2 GB Android device (Part 1 §1.11) | E2E `mobile-3g` timing + manual on the primary device |
| P2 | API P95 ≤ 300 ms for list endpoints, ≤ 500 ms for document issue, on the reference tenant (100k ledger rows) | `tests/performance` harness |
| P3 | Party statement for a 10,000-entry party: first page ≤ 500 ms | harness |
| P4 | Dashboard ≤ 800 ms cold, ≤ 200 ms within the 60 s cache | harness |
| P5 | Invoice issue transaction holds locks < 50 ms | `pg_stat_statements` sample during the harness run |
| P6 | Frontend: LCP ≤ 2.5 s, TTI ≤ 3.5 s on mid-range/4G; ≤ 4.0 s / ≤ 6.0 s on low-end/3G | Lighthouse run manually per release; Playwright timing assertions for the throttled subset |
| P7 | JS bundle: initial route ≤ 250 kB gzipped; no single feature chunk > 120 kB | `next build` output asserted by a script in CI |
| P8 | Query budgets per §28.3.10 | automated |
| P9 | Scheduler drains a 1,000-job backlog in ≤ 60 s | harness |

### 28.9.2 Tooling within the constraint

No `locust`, no `k6`, no APM. Three in-house harnesses, each a management command or a script, all committed:

- **`manage.py perf_seed --profile=reference`** builds the reference tenant: 100k ledger entries, 5k parties, 2k items, 20k invoices, spread over three financial years by the same scenario runner the recompute tests use.
- **`manage.py perf_probe --endpoint=… --n=200`** issues N sequential authenticated requests in-process (bypassing the network so the measurement is of the application, not the laptop's loopback), records per-request wall time and query count, and prints P50/P95/P99 plus the worst query. Results are written to `build/perf/<date>.json` and compared to the previous run; a > 25 % regression on any tracked endpoint fails the nightly job.
- **`scripts/load.sh`** — a bounded concurrency harness built on `curl` in a loop with `xargs -P`, used for the concurrency-under-load scenarios below. It is crude and sufficient: the deployment target is one machine serving one to a few hundred tenants (Part 29), and a tool that models 10,000 virtual users would be measuring a fiction.

`EXPLAIN (ANALYZE, BUFFERS)` output for every list query against the reference tenant is captured by `manage.py perf_explain` and diffed in CI; a plan changing from an index scan to a sequential scan fails the check. This is the cheapest high-value performance test available and it is the one Part 21 §21.4 assumes exists.

### 28.9.3 Scenarios

| Scenario | Shape | Pass condition |
|---|---|---|
| Counter rush | 20 invoices issued in 60 s in one tenant from 3 concurrent sessions | No errors; P95 issue ≤ 700 ms; numbering contiguous |
| Month-end reporting | GST summary + sales register + aging for a 3-year reference tenant, concurrently with writes | Reports complete ≤ 5 s; writes unaffected |
| Bulk import | 5,000-row party CSV validate + commit | Validate ≤ 30 s, commit ≤ 60 s, memory stable, plan limit honoured on the batch |
| Export | 50k-row sales register CSV | Streams, completes ≤ 90 s, memory flat (asserted by sampling RSS) |
| Scheduler backlog | 1,000 queued reminder jobs | Drained ≤ 60 s; no double-send; one runner only |
| Resilience: DB restart | `docker compose restart db` during the counter-rush scenario | No 500 storm; connections re-established; in-flight requests fail cleanly with `request_id`; no partial document persists |
| Resilience: scheduler kill | `kill -9` mid-job | Job lease expires; re-run is idempotent; no duplicate message or entry |
| Resilience: disk full | Fill `MEDIA_ROOT` to 100 % | Uploads fail with a clear 4xx; the ledger stays writable; the runbook's recovery steps work |
| Resilience: slow query | Introduce a 5 s query with a lock | Request timeout returns a clean error; no connection leak; subsequent requests unaffected |

---

## 28.10 Test data and privacy

**Rule 1 — no production data in tests, ever.** No dumps, no anonymised extracts, no "just this one merchant's file to reproduce the bug". This is absolute. A merchant's ledger contains their customers' names, mobile numbers and debts — third-party personal data the merchant is the fiduciary for, which we may not copy into a developer's laptop, a CI runner or a fixture file under DPDP. A CI check greps the repository for Indian mobile-number patterns outside the reserved test ranges and for GSTIN-shaped strings outside the fixture file, and fails on a match.

**Reproducing a production defect** without production data: the support flow captures the `request_id`, the structured log context (which contains ids and codes, never values), and — with the merchant's explicit consent through the existing impersonation flow — a description of the state. The engineer then reconstructs a synthetic equivalent with the scenario builders. This is slower and it is the only acceptable method.

**Synthetic data generation.** `factory-boy` sequences plus curated Indian name, place and item lists committed to `tests/fixtures/synthetic/` (`names_hi.json`, `names_en.json`, `places_in.json`, `items_kirana.json`, `items_pharma.json`, `items_hardware.json`). They are hand-written, contain no real person, and exist so that screenshots, demos and the seeded E2E world look like a real Indian shop rather than `Test Party 1`. Mobile numbers come exclusively from the reserved documentation ranges (`+919000000000`–`+919000009999`) so a stray SMS in a misconfigured environment cannot reach a real person.

**GST and GSTIN fixtures.** `tests/fixtures/gst/`:

- `gstin_valid.json` — 40 synthetic GSTINs, one per state code, each with a **correct checksum** computed by the documented algorithm (canon §17.1c) and a PAN-shaped middle segment that is not a real PAN.
- `gstin_invalid.json` — cases by failure reason: bad checksum, invalid state code, wrong length, lowercase, wrong 14th character, non-`Z` 13th character.
- `tax_rates.json` — the slab set with effective dates, including the `GST12`/`GST28` end date (2025-09-21) and the `GST40` introduction, so rate lookup by `(code, document_date)` is tested across the boundary.
- `tax_cases.json` — 120 computed cases: rate × inclusive/exclusive × line discount × document discount × intra/inter-state, each with hand-computed expected line and document values. This file is the single source of truth for both the Python and TypeScript tax tests.
- `hsn_sample.json` — 200 HSN/SAC codes for search tests.

All fixture files carry a header comment stating they are synthetic and how they were generated, so nobody later mistakes them for extracted data.

**Attachments in tests** are generated in-process (a 4×4 PNG from Pillow, a 30-byte CSV), never committed binaries, except one intentionally malformed image and one oversized file used for validation tests.

---

## 28.11 CI integration

### 28.11.1 What runs when

| Stage | Trigger | Contents | Budget | Blocks merge |
|---|---|---|---|---|
| **Pre-commit** (local, husky) | `git commit` | `black --check`, `isort --check`, `flake8`, `eslint`, `prettier --check`, `tsc --noEmit` on changed files | < 20 s | — |
| **Pre-push** (local) | `git push` | Backend unit + service bands; frontend unit + slice bands | < 3 min | — |
| **PR — lint & types** | every push to a PR | Formatters, linters, `tsc --noEmit`, `makemigrations --check`, the AST checks (tenant scoping, no-float, no-update-on-immutable, no `.objects.all()`) | < 2 min | ✅ |
| **PR — backend** | every push | Full pytest except `slow`; coverage; query budgets; migration tests | < 6 min | ✅ |
| **PR — frontend** | every push | Jest with coverage; bundle-size check; i18n key completeness; `scripts/check-contrast.mjs` | < 5 min | ✅ |
| **PR — E2E smoke** | every push | 8 smoke specs, desktop + mobile | < 4 min | ✅ |
| **PR — traceability** | every push | `build_traceability`; fails on unimplemented IDs for features marked done | < 1 min | ✅ |
| **Merge queue** | merge to `main` | Everything above plus `slow` (concurrency), the full 35-spec E2E on both viewports, the recompute suite against `busy_tenant` | < 20 min | ✅ |
| **Nightly** | 02:00 IST | Full suite; `mobile-3g` subset; `perf_probe` with regression comparison; `perf_explain` plan diff; resilience scenarios; dependency audit (`pip list --outdated`, `npm audit`); Lighthouse on the seeded stack | < 60 min | — (opens an issue) |
| **Release** | tag | Everything nightly runs, plus the manual regression checklist (§28.8.2) signed off, plus the device matrix | — | ✅ release |

### 28.11.2 Quality gates

A PR merges only when all of the following are true:

1. Lint, format and type checks clean. No `# noqa`, no `eslint-disable`, no `@ts-ignore` added without an inline justification comment (a check greps for the pattern and requires a trailing `— reason: …`).
2. All tests green. No skipped test added without an issue link in the skip reason.
3. Coverage aggregate at or above the §28.7 floors, and not down by more than 0.5 pp.
4. Query budgets respected; no budget raised without a justification in the commit message.
5. Traceability shows no unimplemented FRD test ID for any feature the PR marks done.
6. The non-negotiable classes pass, including the **generated** sweeps — which means a new endpoint arrives with its permission-matrix row and its isolation coverage or the build fails.
7. Migrations: at most one new migration per PR (warning), reversible or explicitly declared otherwise, `makemigrations --check` clean.
8. If the PR touches a feature's behaviour: `en` and `hi` keys present, states covered, analytics events emitted (canon rule 6).
9. No production data, no real mobile numbers, no secrets — the repository scan is clean.

### 28.11.3 Failure policy

- **A red `main` stops other merges.** The fix or the revert is the next commit; nothing else merges in between.
- **A failing test is never skipped to go green.** The options are: fix the code, fix the test if the test is wrong (with a reviewer confirming the specification, not just the author's opinion), or revert.
- **A flaky E2E follows §28.5.5**, not the skip button.
- **Nightly failures open an issue automatically** with the artefacts attached, and are triaged the next working morning. A nightly that is red for three consecutive days escalates to blocking merges, because a permanently red nightly is an unmonitored nightly.
- **A performance regression above 25 %** on a tracked endpoint is treated as a defect, not a tuning opportunity; the PR that caused it is identified by the nightly's bisect over the day's merges.

### 28.11.4 The minimum viable pipeline

For the solo-developer phase, the pipeline above collapses to two files and one runner (GitHub Actions or an equivalent; the commands are the contract, the platform is not):

```
make check     # lint, types, AST checks, makemigrations --check
make test      # pytest (fast bands) + jest
make e2e       # docker compose up -d && seed_e2e && playwright test --grep @smoke
make ci        # all of the above plus coverage and traceability
```

Everything in this chapter is reachable from those four targets. When a team arrives, the same targets are split across parallel jobs and a merge queue is added; no test and no gate changes. This is deliberate: the testing strategy must not require a build engineer to be useful on day one.
