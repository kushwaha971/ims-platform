# FRD 00 — Core changes (Wave A) and the three shared engines

Status: **PROPOSED FRD, Phase 3 step 2, 29 Sep 2026.** Written by the Technical BA/Architect FRD
agent. It specifies, at implementation depth, the core changes every module FRD depends on
(Wave A, 10-architecture §13) and the three engine apps `apps/dues`, `apps/attendance` and
`apps/bookings`. No code is written from this document until the vision §5 gate for step 4 has
passed.

**Binding inputs, in order of precedence:** `00-platform-vision.md` (§3 rules, §7 template),
ADR-041 to ADR-055 (Part 38), `10-architecture.md`, `11-contracts.md`, `CLAUDE.md`. This FRD
**adds** detail inside those decisions; it changes none of them. Where the contracts and the code
disagree, or the contracts are silent where an implementer must choose, the point is listed in
[§C Contract questions](#c-contract-questions-for-the-architecture-owner) with a proposed answer,
and the body of this FRD follows the proposed answer marked **(pending CQ-n)** so that nobody
builds against a guess that is not written down.

Every claim about existing code carries a path (relative to `backend/` or `frontend/`), read at
commit `30798d2`.

---

## 0. How to read this document

### 0.1 Feature IDs

| Prefix | Scope | Wave |
|---|---|---|
| `PLT-X01` … `PLT-X14` | Core changes in existing core apps (`ledger`, `parties`, `payments`, `sales`, `platform_app`, `common`, `notifications`, `reports`) | A |
| `DUE-01` … `DUE-06` | Recurring dues and schedules engine, `apps/dues` | B |
| `ATT-01` … `ATT-05` | Check-ins and attendance engine, `apps/attendance` | B |
| `BKG-01` … `BKG-05` | Bookings and resources engine, `apps/bookings` | D |

Test IDs are `T-<FEATURE>-n` (Part 17 convention). Acceptance is the Definition of Done in §D.

### 0.2 The fourteen sections

Each feature follows vision §7 exactly: 1 Product requirements · 2 User flows · 3 Features (minimum
useful set, then later) · 4 Entities and relationships · 5 Database · 6 API · 7 Frontend · 8 UI/UX ·
9 Validation and business rules · 10 Permissions · 11 Reports · 12 Testing · 13 Edge cases ·
14 Future. A section that does not apply says "Not applicable" and why.

### 0.3 Conventions that apply to every feature (not repeated below)

**Money notation.** Amounts are `Decimal` at 2 dp on the server and strings on the wire
(`"1200.00"`). Worked examples give rupees and **paise** side by side, `₹1,200.00 (120000 p)`,
so the arithmetic can be checked in integers. Rounding is always `ROUND_HALF_UP`
(`apps/common/money.py:31`, ADR-010).

**API envelope.** Success is `{ "data": …, "meta": {…} }` (`apps/common/renderers.py:21-25`);
failure is `{ "error": { "code", "message", "details", "request_id" } }`. Every code is in
`apps/common/error_codes.py` and Part 22 §22.1.1; new codes are exactly those of contracts §4.
Every money-moving POST takes `Idempotency-Key` through `@idempotent` (`apps/common/idempotency.py:51`);
same key and body replays with `Idempotent-Replayed: true`, a different body is 409
`idempotency_conflict`.

**Endpoint order.** `authentication → ModuleEnabled(<module>) | EngineEnabled(<engine>) → PlanLimit →
HasPermission` (`apps/common/permissions.py:1-5`). Cross-tenant ids are 404 (ADR-032).

**Tables.** Every new business table extends `TenantModel` (UUIDv7 `id`, `tenant` RESTRICT,
`created_by` SET NULL, `created_at`, `updated_at`), is named `<app>_<snake>`, is registered in the
app's `tenant_data.py`, and has a reversible migration (10-architecture §5 and §10). "Tenant-scoped"
below means: the `tenant_id` column, every unique index leading with `tenant_id` (or reached through
a tenant-scoped FK), and every selector filtering by tenant first.

**Services.** Keyword-only, `ctx: Ctx` first, inside the caller's transaction unless stated, raise
`BusinessRuleViolation` / `ValidationFailed` / `NotFound` (never DRF exceptions), one `write_audit`
row per logical event with an action constant on `AuditAction` (`apps/common/audit.py:16`).

**Locks.** The global order is **party → documents → engine rows → payments → stock → sequence**
(`apps/parties/services/balance.py:53-66`, contracts preamble). Each feature names the rows it locks.

**Registries.** Every registry is keyed and idempotent, lives in the lowest app that calls it,
runs inside the caller's transaction, and has `_reset_for_tests()` restoring the start-up snapshot
(ADR-042, 10-architecture §4.1).

**Frontend.** BrandHub patterns (`api/<x>Service.ts`, Redux Toolkit slices with `createAsyncThunk`,
React Hook Form + `useValidationSchemas()`, no TanStack Query), lazily injected slices only
(`slice.injectInto(rootReducer)`, `src/redux/store.ts:80-82`), `Ub*` components only, forms and
drawers `dynamic()`, errors through the global snackbar, copy in `locales/catalogues/<ns>.{en,hi}.json`.
Engines ship **shared UI only**, with no navigation entry (10-architecture §2.2).

**Customer documents** name the tenant only and extend
`src/tests/customerDocumentsCarryNoProductName.test.tsx`.

**Nothing is sent** by the product (DEC-012). "Remind" means a prepared text the merchant shares.

**No unbuilt feature is shown** (vision §4). Every Wave A screen change below is either invisible
to a tenant without a new module, or is a correction that is true for today's tenants too.

### 0.4 Feature index

| ID | Feature | Owning app(s) | ADR | Contracts |
|---|---|---|---|---|
| PLT-X01 | Ledger buckets, party caches, posting registry, `charge` and `adjustment_credit` | ledger, parties | 043, 042, 048 | §1.2, §1.3 |
| PLT-X02 | Held deposits | payments, ledger, reports | 044 | §1.4 |
| PLT-X03 | Target protocol v2, one bucket per payment, `allocate_existing` | payments | 047 | §1.4 |
| PLT-X04 | Party module roles, relations, archive guards | parties | 046 | §1.3 |
| PLT-X05 | Sales document port and origin listeners | common, sales | 045, 048 | §1.5 |
| PLT-X06 | Reminder source link, notices and guardrails | ledger | 054, 043 | §1.6 |
| PLT-X07 | Number kinds and the never-resetting counter | platform_app | 051 | §1.7 |
| PLT-X08 | Holiday and closed-day calendar | platform_app | 055 | §1.8 |
| PLT-X09 | Recurrence, period and rounding primitives | common | 055 | §1.8 |
| PLT-X10 | Engine enablement and module-off guards with open-record checks | platform_app, common | 041 | §1.1, 10-arch §8–9 |
| PLT-X11 | `UNRELEASED_MODULES` and the release data migration | platform_app, common, frontend | 041 | §1.1, 10-arch §2.4 |
| PLT-X12 | Row scoping and module roles | common, platform_app | 052 | §3 |
| PLT-X13 | Registries: schedules, dashboard sections, reports, notification types | common, reports, notifications | 042 | §1.9 |
| PLT-X14 | Import boundaries for the new apps | tests/architecture | 041 | 10-arch §10.1 |
| DUE-01 | Plans and schedules | dues | 048, 055 | §2.1 |
| DUE-02 | The daily run: materialise, post, overdue, catch-up | dues | 048 | §2.1 |
| DUE-03 | Settling dues: targets, component split, advances | dues, payments | 047 | §2.1, §1.4 |
| DUE-04 | Penalties, waivers, discounts, pro-rating, end and cancel | dues | 048 | §2.1 |
| DUE-05 | Pause, resume and reschedule | dues | 048 | §2.1 |
| DUE-06 | Dues reads, reminders, reports and guards | dues | 041, 054 | §2.1 |
| ATT-01 | Groups, members and sessions | attendance | 050, 055 | §2.3 |
| ATT-02 | Check-in and check-out with the policy hook | attendance | 050 | §2.3 |
| ATT-03 | Roll-call, edits and voids | attendance | 050 | §2.3 |
| ATT-04 | Entitlements (session packs) | attendance | 050 | §2.3 |
| ATT-05 | Attendance reads and reports | attendance | 050, 041 | §2.3 |
| BKG-01 | Resource types, resources, shifts, out of service | bookings | 049 | §2.2 |
| BKG-02 | Availability | bookings | 049 | §2.2 |
| BKG-03 | Hold, book, confirm and expiry: the slot rule | bookings | 049 | §2.2 |
| BKG-04 | Change, check-in, check-out, cancel, no-show | bookings | 049 | §2.2 |
| BKG-05 | Integrity check and booking reads | bookings | 049, 041 | §2.2 |

---

# Part A — Core changes (Wave A)

### PLT-X01 — Ledger buckets, party caches, posting registry, `charge` and `adjustment_credit`

#### 1. Product requirements
A shop that also lends, or that holds a refundable deposit, must still read one true figure per
person: what they owe, net. Lending's principal must not look like 90-day-old trade credit in
aging, must not consume the shop credit limit, and must not be quoted whole in a reminder; a
deposit must never net against what is owed. ADR-043 decides this with a `bucket` on every
ledger line. For today's tenants nothing changes: every existing row is `main`, and every figure
they see is computed the same way.

The same feature replaces the literal `POSTING_MATRIX` (`apps/ledger/services/postings.py:57-73`)
with a registry so engines and verticals can post without core edits (ADR-042), and adds the two
entry types the engines need (ADR-048): `charge` (debit) and `adjustment_credit` (credit).

Measures: `recalc_balances --check` reports zero drift on all three caches after a fuzzed
run of mixed-bucket entries; `/ledger/aging` returns byte-identical results for a tenant with only
`main` rows before and after the migration.

#### 2. User flows
No new merchant flow. The flows that change are reads:
1. **Khata page** (`/parties/[id]`): the header balance is unchanged (`balance`). When the party
   has `loan_balance ≠ 0`, the info panel shows "Loan outstanding ₹… · Shop balance ₹…"; when
   `deposit_held > 0`, it shows "Deposit held ₹…" in neutral tone. Neither line appears for a party
   without them, so today's tenants see no change.
2. **Statement** (`/parties/[id]/statement`): lines of every bucket, with `deposit` lines moved to a
   separate "Deposit held" block beneath the running-balance table and excluded from it.
3. **Aging** (`/ledger/aging`): `main` bucket only.
4. **Credit limit** refusal (PTY-06, LED-01, SAL issue): compared against the trade figure
   `balance − loan_balance`.

#### 3. Features
Minimum: `bucket` column frozen by the trigger; `EntryType.CHARGE` and `ADJUSTMENT_CREDIT`;
`register_posting_source`; `post_source_entry(bucket=…)`; `apply_entry(bucket=…)`;
`parties_party.loan_balance` and `deposit_held`; balance rule, drift and `recalc_balances` over
three caches; aging on `main`; statement deposit block; trade figure for credit limit.
Later: per-bucket statements printed separately; accounting projection mapping buckets to
accounts (ADR-043 consequences).

#### 4. Entities and relationships
`ledger_entry` (existing) gains `bucket`. `parties_party` (existing) gains two caches.
A posting source is a registry entry `(source_type → module, entry_types, buckets)`, not a table.
Relationships unchanged: `ledger_entry.party → parties_party` RESTRICT.

#### 5. Database
**Migration `ledger/0006_entry_bucket.py`** (one migration, three operations, the `0004` precedent):

```sql
ALTER TABLE ledger_entry ADD COLUMN bucket varchar(8) NOT NULL DEFAULT 'main';
ALTER TABLE ledger_entry ADD CONSTRAINT ck_ledger_entry_bucket
    CHECK (bucket IN ('main','loan','deposit'));
-- forbid_update_delete() re-created: FUNCTION_HEAD + "OR NEW.upi_app IS DISTINCT FROM OLD.upi_app"
--   + "OR NEW.bucket IS DISTINCT FROM OLD.bucket" + FUNCTION_TAIL; reverse restores 0004's body.
CREATE INDEX ix_ledger_party_bucket ON ledger_entry (tenant_id, party_id, bucket)
    WHERE bucket <> 'main';   -- small: only lending and deposit rows
```
The `ADD COLUMN … DEFAULT` is metadata-only on PostgreSQL 16 (no rewrite). The existing
`ix_ledger_party_date`, `ix_ledger_source` and `ix_ledger_tenant_date` are unchanged.
`entry_type` stays `varchar(24)` (`adjustment_credit` is 17). `source_type` stays `varchar(32)`;
its Django `choices=SourceType.choices` is removed in the same migration (state-only
`AlterField`, no SQL) because registered sources are not enum members (pending CQ-8).

**Migration `parties/0009_party_loan_and_deposit_caches.py`:**

| Column | Type | Constraint |
|---|---|---|
| `loan_balance` | `numeric(14,2) NOT NULL DEFAULT 0` | none (a loan can be in advance) |
| `deposit_held` | `numeric(14,2) NOT NULL DEFAULT 0` | `CHECK (deposit_held >= 0)` — `ck_party_deposit_held_non_negative` |

No index: both are read per party row. Existing rows are 0, which is their true value (no row is
`loan` or `deposit` yet), so no data migration and no replay is needed at landing; the replay test
still runs (10-architecture §10 rule 3).

#### 6. API
No new endpoint. Response deltas (additive keys, never removed):
- `GET /parties/{id}` → `data.loan_balance`, `data.deposit_held`, `data.trade_balance`
  (`= balance − loan_balance`), all strings. The keys are **omitted** when the value is `"0.00"`
  and no module that can write that bucket is enabled — the PTY-03 rule that a key which is always
  empty is a claim the code cannot verify (CLAUDE.md, "State").
- `GET /parties/{id}/ledger-entries`, `GET /parties/{id}/statement` → each row gains `bucket`.
  The statement's `meta` gains `deposit: { rows: [...], held: "1000.00" }` when any deposit row
  exists in the range.
- `GET /ledger/aging` — unchanged shape; now `bucket = 'main'` only.
- `GET /reports/dashboard` "To collect" — unchanged (Σ positive `balance`, ADR-043).

Python contract (contracts §1.2), exactly:
```python
register_posting_source(source_type, *, module, entry_types, buckets=frozenset({"main"}))
post_source_entry(*, ctx, party, amount, entry_date, entry_type, source_type, source_id,
                  note="", payment_mode=None, upi_app=None, reference="", source_number=None,
                  bucket="main") -> tuple[LedgerEntry, Decimal]
apply_entry(*, party, direction, amount, bucket="main") -> Decimal
```
`reverse_source_entries` writes each reversal in its original's bucket (unchanged signature).
`LedgerPostingError` (a 500 by design) is raised for an unregistered source, an entry type the
source did not register, or a bucket outside the source's set.

Registrations at start-up (each by its owner's `ready()`):

| `source_type` | Registered by | Entry types | Buckets |
|---|---|---|---|
| `sales_document` | sales | `invoice` debit, `credit_note` credit | main |
| `purchase_document` | purchases | `purchase_bill` credit, `debit_note` debit | main |
| `payment` | payments | `payment_in` credit, `payment_out` debit | main, loan, deposit |
| `expense` | expenses | `expense` credit | main |
| `dues_due`, `dues_component`, `dues_adjustment` | dues | contracts §1.2 table | as contracts |
| `library_*`, `lending_*` | the verticals | contracts §1.2 table | as contracts |

`manual` and `ledger_entry` (LED-01/02/03) do not go through `post_source_entry` and are not
registered; they are always `main`.

#### 7. Frontend
- `features/parties/types`: `PartyDetail` gains optional `loanBalance`, `depositHeld`,
  `tradeBalance` (strings, parsed by the existing money util).
- `PartyInfoPanel.tsx`: two optional rows rendered only when the key is present
  (`partyDetailView` view-model decides; no component branches on a module).
- `features/ledger`: timeline row type gains `bucket`; `PartyStatementPageContent.tsx` renders a
  `DepositHeldBlock` (new, in `features/ledger/components`) below the table when `meta.deposit`
  exists; the print sheet renders the same block (`print/`).
- `entryAmountView` (the one place a row's label is decided, CLAUDE.md LED-04 lesson) gains the
  two new entry types: `charge` → "Charge", `adjustment_credit` → "Credit" — every entry type has a
  label, or the statement prints a raw message id.
- No slice changes beyond types; no new store key.

#### 8. UI/UX
- Deposit amounts are neutral (`--text-secondary`), never red or green: a deposit is neither
  "you gave" nor "you got" in the khata sense. Label "Deposit held", Hindi "जमा राशि (लौटानी है)".
- "Loan outstanding" uses the receivable tone with its words; "Shop balance" beside it.
- The statement block title "Deposit held" and a caption "Not part of the balance above". The
  running balance column never includes a deposit line.
- Copy keys: `ledger.bucket.loan`, `ledger.bucket.deposit`, `ledger.entry.type.charge`,
  `ledger.entry.type.adjustment_credit`, `parties.detail.loanOutstanding`,
  `parties.detail.tradeBalance`, `parties.detail.depositHeld`.

#### 9. Validation and business rules
- **BR-1 Bucket effects** (contracts §1.2):
  `balance = Σ signed(main) + Σ signed(loan)`; `loan_balance = Σ signed(loan)`;
  `deposit_held = Σ credit(deposit) − Σ debit(deposit)`, where `signed = +amount` for a debit and
  `−amount` for a credit, over `LIVE_ENTRIES` (`apps/ledger/selectors/entry.py:55`). Note the sign
  of `deposit_held` is the opposite of `balance`: a deposit received is a credit and **increases**
  what is held.
- **BR-2** `receivable_total = max(balance, 0)`, `payable_total = max(−balance, 0)` — unchanged;
  deposits never touch them.
- **BR-3** `apply_entry(bucket="deposit")` moves only `deposit_held` and `last_activity_at`; it does
  **not** call `clear_collection_date_if_settled` (the balance did not move).
- **BR-4** `SIGNED_AMOUNT`, `computed_balance`, `party_ledger_summary`, `split_total_expressions`,
  the statement's `SIGNED`/`LIVE_SIGNED`, `carried_forward` and `timeline_carried` all add
  `bucket__in=('main','loan')`. One `Q` constant, `BALANCE_BUCKETS`, is defined beside
  `LIVE_ENTRIES` and imported by every one of them; `recalc_balances` imports it too (the LED-04
  rule: a replay written from the same prose is not a check).
- **BR-5** Trade figure `trade_balance = balance − loan_balance`. `credit_exposure(party)`
  (`apps/parties/services/credit.py:97`) returns `max(trade_balance, 0)`.
- **BR-6** Aging (`apps/ledger/selectors/aging.py`) adds `AND bucket = %(bucket)s` bound to `main`.
- **BR-7** A source may post only its registered entry types and buckets; a mismatch is
  `LedgerPostingError` before any row is written.
- **BR-8** `charge` is always debit; `adjustment_credit` always credit (direction stays a function of
  entry type, `postings.py` docstring BR-2).
- **BR-9** LED-03 correction still refuses every non-manual source with `use_document_void`
  (`corrections.py:66`), so a `dues_due` or `library_charge` line can only be undone by its owner.
- **BR-10** Registration is idempotent by `source_type`; a second registration with a *different*
  module, entry-type map or bucket set raises `ImproperlyConfigured` at start-up.

**Worked example** (one party who buys, borrows and leaves a deposit):

| # | Line | Bucket | Dir | Amount | balance | loan_balance | deposit_held |
|---|---|---|---|---|---|---|---|
| 1 | Invoice INV/26-27/0042 | main | Dr | ₹2,300.00 (230000 p) | 230000 | 0 | 0 |
| 2 | Disbursal PAYOUT/26-27/0007 | loan | Dr | ₹50,000.00 (5000000 p) | 5230000 | 5000000 | 0 |
| 3 | Interest, instalment 1 | loan | Dr | ₹625.00 (62500 p) | 5292500 | 5062500 | 0 |
| 4 | Collection RCT/26-27/0110 | loan | Cr | ₹4,000.00 (400000 p) | 4892500 | 4662500 | 0 |
| 5 | Deposit RCT/26-27/0111 | deposit | Cr | ₹1,000.00 (100000 p) | 4892500 | 4662500 | 100000 |

Trade figure = 4892500 − 4662500 = **230000 p (₹2,300.00)**. With a ₹5,000.00 (500000 p) credit
limit, a new ₹2,000.00 (200000 p) invoice gives trade exposure 430000 ≤ 500000: **allowed**. Before
this feature it would have compared 5092500 against the limit and blocked a customer who owes the
shop ₹2,300.

#### 10. Permissions
No new codename. Reading the new keys follows `parties.party.read` and `ledger.entry.read`. The
module roles of PLT-X12 do not hold either, so they never see these figures through core.

| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| See loan and deposit figures on a party | `parties.party.read` | ✅ | ✅ | ✅ | ✅ |
| See bucket on statement rows | `ledger.entry.read` | ✅ | ✅ | ✅ | ✅ |

#### 11. Reports
- Aging: `main` only (BR-6). Lending arrears come from DUE-06's `arrears()`.
- Party balances report and the dashboard's "To collect": unchanged formula.
- New report rows are the verticals' (loan book, deposits held by PLT-X02).
- Day book (`ledger_entry` by date) shows every bucket with a bucket column; its totals row sums
  `main` and `loan` only, and shows deposits as a separate total.

#### 12. Testing
- T-PLT-X01-1 (DB) `QuerySet.update(bucket='loan')` on a posted row raises from the trigger
  (the `test_the_database_refuses_to_change_a_posted_upi_app` pattern).
- T-PLT-X01-2 (DB) inserting `bucket='other'` violates `ck_ledger_entry_bucket`.
- T-PLT-X01-3 (unit) `post_source_entry` with an unregistered source, an unregistered entry type, or
  a bucket outside the set raises `LedgerPostingError` and writes nothing.
- T-PLT-X01-4 (unit) the worked example above, row by row: all three caches after each line.
- T-PLT-X01-5 (replay, property) 500 random entries across three buckets, sources and directions,
  with random reversals: `computed_balance`, a new `computed_loan_balance` and
  `computed_deposit_held` equal the caches; `recalc_balances --check` exits 0.
- T-PLT-X01-6 (regression) for a fixture tenant with only `main` rows, aging, the statement,
  `party_ledger_summary` and the dashboard return the same JSON before and after migration 0006
  (golden files captured on the old code).
- T-PLT-X01-7 (unit) `credit_exposure` uses the trade figure; the worked example's ₹2,000 invoice is
  allowed under `block` mode.
- T-PLT-X01-8 (unit) a statement with a deposit line: the running balance and closing figure exclude
  it, the closing figure still equals `party.balance` (LED-04 BR-3 survives).
- T-PLT-X01-9 (unit) `reverse_source_entries` on a `loan` payment writes the reversal in `loan` and
  restores both `balance` and `loan_balance`.
- T-PLT-X01-10 (start-up) registering `payment` twice with a different bucket set raises
  `ImproperlyConfigured`; the four existing sources are registered after `django.setup()`.
- T-PLT-X01-11 (concurrency) two transactions posting `loan` and `deposit` lines to one party at
  once serialise on the party lock; the caches equal the replay.
- T-PLT-X01-12 (component) `PartyInfoPanel` renders no loan or deposit row when the keys are absent,
  and the right tones and words when present; the statement's deposit block prints.
- T-PLT-X01-13 (e2e, `e2e/statement.mjs`) the statement sweep still passes unchanged; a new
  condition with a deposit line adds four widths of screenshots with the measuring checks.

#### 13. Edge cases
1. EC-1 A deposit line reversed (a void of the deposit receipt) → reversal in `deposit`;
   `deposit_held` decreases; refused by PLT-X02 if it would go negative.
2. EC-2 A loan collection larger than the loan (`loan_balance < 0`) → allowed; it reads "Loan in
   advance ₹…"; the lending module decides whether to offer a refund.
3. EC-3 A party with `balance = 0`, `loan_balance = 50000` and `trade_balance = −50000` (a shop
   advance equal to the loan) → the PTY-04 balance guard passes (`balance = 0`), and the lending
   module's archive guard (PLT-X04) refuses while the loan is active. Nothing nets a shop advance
   against a loan automatically: the lending FRD decides whether to offer that as an explicit act.
4. EC-4 Old code paths that call `apply_entry` without `bucket` → default `main`, unchanged
   behaviour.
5. EC-5 A tenant switching lending off with `loan_balance ≠ 0` → refused by PLT-X10 (active loans).
6. EC-6 LED-03 correction of a manual entry → `main` always; `_apply_delta` unchanged.
7. EC-7 `write_off` (LED-11) on a party with a loan → writes `main`; the write-off amount is capped at
   the trade figure, so a shop write-off cannot silently forgive a loan (LED-11 amended: its
   amount defaults to `trade_balance`, not `balance`; pending CQ-22).

#### 14. Future
A fourth bucket (for example `rent_deposit` if rent needs a separate liability) is one CHECK change
plus a trigger re-creation (ADR-043). An accounting projection mapping `main`/`loan`/`deposit` to
ledger accounts. A materialised per-bucket statement.

---

### PLT-X02 — Held deposits

#### 1. Product requirements
Library, gym and hotel tenants take money that is **not theirs**: a refundable deposit. Today it
can only be a "You got", which shows the member in advance and lets FIFO swallow it into the next
bill. ADR-044 makes a deposit one core concept for every module: a `payments_held_deposit` row,
received by a payment IN in the `deposit` bucket, refunded by a payment OUT, and **applied** to
what the party owes only by an explicit act that writes two linked `adjustment` payments.
Measures: no deposit ever appears in `unallocated_amount`, aging, income or FIFO; `held_amount`
equals its replay; the cashbook shows deposit cash in and refunds out, and never an adjustment.

#### 2. User flows
Each vertical calls these from its own screen with its own codename and words (contracts §1.4);
the core provides the services, a party-level panel and the receipts.
1. **Open**: the vertical opens a deposit when a membership starts or a booking is confirmed
   (`expected_amount`, `purpose`, subject). Status `expected`.
2. **Receive**: "Take deposit ₹500" → mode chips (cash/UPI…) → Save → receipt RCT/… printed with
   the purpose "Library deposit". Status `held`.
3. **Apply at exit**: the vertical's close flow lists open charges; the merchant ticks the fine
   ₹120 → "Adjust ₹120 from deposit" → one confirmation → two adjustment payments written as one
   act; a slip shows "Deposit ₹500 · Adjusted ₹120 (Fine FIN/26-27/0012) · To return ₹380".
4. **Refund**: "Return ₹380" → mode → Save → voucher PAYOUT/… Status `released` when nothing is held.
5. **Void** a receipt, an adjustment or a refund from the payment page: the pair of an adjustment
   voids together; the deposit's figures move back.

#### 3. Features
Minimum: the two tables; `open_deposit`, `receive_deposit`, `apply_deposit`, `refund_deposit`,
`deposits_for`; `held_deposit` and `held_deposit_refund` targets (`auto = False`, bucket `deposit`);
`PaymentMode.ADJUSTMENT`; cashbook exclusion; void of either half voids both; a per-module
held-deposit counter for PLT-X10; party "Deposits" panel; core read API.
Later: deposit interest (rent), partial forfeiture rules per module, deposit ageing report.

#### 4. Entities and relationships
- `payments_held_deposit` N:1 `parties_party` (RESTRICT). Points at the vertical's row
  polymorphically (`subject_type`, `subject_id`), never an FK (10-architecture §5 rule 3).
- `payments_deposit_application` N:1 `payments_held_deposit`; 1:1 each to the two adjustment
  `payments_payment` rows (`refund_payment`, `settle_payment`).
- Money receipts and refunds are ordinary `payments_payment` rows whose `payments_allocation` names
  `document_type = 'held_deposit'` or `'held_deposit_refund'` and `document_id = deposit.id`.

#### 5. Database
**Migration `payments/0003_held_deposits.py`:**

`payments_held_deposit`
| Column | Type | Notes |
|---|---|---|
| `id`, `tenant_id`, `created_by_id`, `created_at`, `updated_at` | TenantModel | |
| `party_id` | `uuid NOT NULL` FK `parties_party` RESTRICT | |
| `module` | `varchar(32) NOT NULL` | owning module code |
| `subject_type` | `varchar(48) NOT NULL` | e.g. `library_membership` |
| `subject_id` | `uuid NOT NULL` | |
| `purpose` | `varchar(60) NOT NULL` | printed on receipts |
| `expected_amount` | `numeric(14,2) NOT NULL` | `CHECK (expected_amount > 0)` |
| `received_amount` | `numeric(14,2) NOT NULL DEFAULT 0` | cache: Σ live receipt allocations |
| `applied_amount` | `numeric(14,2) NOT NULL DEFAULT 0` | cache: Σ live applications |
| `refunded_amount` | `numeric(14,2) NOT NULL DEFAULT 0` | cache: Σ live refund allocations |
| `held_amount` | `numeric(14,2) NOT NULL DEFAULT 0` | cache |
| `status` | `varchar(10) NOT NULL DEFAULT 'expected'` | `expected`/`held`/`released` |
| `note` | `varchar(255) NOT NULL DEFAULT ''` | |
| `version` | `integer NOT NULL DEFAULT 1` | optimistic concurrency |

Constraints: `ck_deposit_held_formula CHECK (held_amount = received_amount − applied_amount − refunded_amount)`;
`ck_deposit_held_non_negative CHECK (held_amount >= 0)`;
`ck_deposit_received_within_expected CHECK (received_amount <= expected_amount)`;
`ck_deposit_status CHECK (status IN ('expected','held','released'))`.
Indexes: `ix_deposit_party (tenant_id, party_id, status)`; `ix_deposit_subject (tenant_id,
subject_type, subject_id)`; `ix_deposit_module_open (tenant_id, module) WHERE status <> 'released'`.

`payments_deposit_application`
| Column | Type | Notes |
|---|---|---|
| TenantModel columns | | |
| `deposit_id` | `uuid NOT NULL` FK RESTRICT | |
| `amount` | `numeric(14,2) NOT NULL` | `CHECK (amount > 0)` |
| `reason` | `varchar(160) NOT NULL` | |
| `refund_payment_id` | `uuid NOT NULL UNIQUE` FK `payments_payment` RESTRICT | the adjustment OUT |
| `settle_payment_id` | `uuid NOT NULL UNIQUE` FK `payments_payment` RESTRICT | the adjustment IN |
| `voided_at` | `timestamptz NULL` | set when the pair is voided |

Index `ix_deposit_application_deposit (tenant_id, deposit_id)`. Both tables registered in
`payments/tenant_data.py`. No trigger: the money evidence is the payments and their ledger lines,
which are already immutable.

`PaymentMode` (`apps/common/constants.py`) gains `ADJUSTMENT = "adjustment"`; `primary_mode`
(`varchar(12)`) and `ledger_entry.payment_mode` (`varchar(16)`) fit it. A CHECK on
`payments_payment`: `ck_payment_adjustment_is_whole CHECK (primary_mode <> 'adjustment' OR
jsonb_array_length(mode_breakup) = 1)`.

#### 6. API
Core endpoints (contracts §1.4; `ModuleEnabled("payments")`):

| Method | Path | Codename | Body | 2xx |
|---|---|---|---|---|
| GET | `/api/v1/deposits?party_id&module&status&subject_type&subject_id` | `payments.payment.read` | — | `{data: [Deposit], meta: {totals: {held}}}` cursor-paged |
| GET | `/api/v1/deposits/{id}` | `payments.payment.read` | — | `{data: Deposit}` with `receipts[]`, `applications[]`, `refunds[]` |
| POST | `/api/v1/deposits/{id}/receive` | `payments.payment.write` | `{amount, mode_breakup, payment_date?, reference?, note?}` | 201 `{data: {deposit, payment}}` |
| POST | `/api/v1/deposits/{id}/apply` | `payments.payment.write` | `{allocations: [{document_type, document_id, amount}], reason}` | 201 `{data: {deposit, application, refund_payment, settle_payment, documents}}` |
| POST | `/api/v1/deposits/{id}/refund` | `payments.payment.write` | `{amount, mode_breakup, payment_date?, reason}` | 201 `{data: {deposit, payment}}` |

There is no core `POST /deposits`: opening is always the vertical's act (`open_deposit` from its
own endpoint). `Deposit` shape: `{id, party: {id, name}, module, subject_type, subject_id,
subject_label, purpose, expected_amount, received_amount, applied_amount, refunded_amount,
held_amount, status, note, version, created_at}`; `subject_label` comes from the dues-style label
registry the vertical registers with its target (`summary()`).

Errors: 400 `validation_error` (amount ≤ 0, > 2 dp, mode `adjustment` sent by a client, missing
reason); 404 (deposit or allocation document of another tenant or party); 409 `deposit_insufficient`
(`details.held_amount`), `deposit_released`, `over_allocated` (receive above `expected − received`,
or an allocation above a document's due), `document_not_open`, `party_archived`, `stale_version`
(when `version` is sent), `idempotency_conflict`.

Python (contracts §1.4) with these precise semantics:
- `open_deposit(...)` → status `expected`, all amounts 0. Idempotent by `(module, subject_type,
  subject_id, purpose)` for a non-released deposit: a second open returns the standing row.
- `receive_deposit(...)` → `record_payment` internally with `allocations=[{document_type:
  "held_deposit", document_id, amount}]`; the target's `apply` moves `received_amount`.
- `apply_deposit(...)` → under the locks, writes payment OUT (mode `adjustment`, allocation
  `held_deposit_refund` = Σ amounts, bucket `deposit`) and payment IN (mode `adjustment`,
  allocations = the caller's list, bucket `main`), then the application row. Both through an
  internal `_record_adjustment_pair()` in `payments/services/deposits.py` that calls the same
  allocation and posting code as `record_payment` but bypasses its public mode validation.
- `refund_deposit(...)` → `record_payment(direction="out", allocations=[held_deposit_refund])`.
- `deposits_for(...)` → tenant-scoped queryset; the verticals' guards and panels read it.

#### 7. Frontend
- `features/payments/api/depositService.ts`: `listDeposits`, `getDeposit`, `receiveDeposit`,
  `applyDeposit`, `refundDeposit`.
- `features/payments/redux/depositSlice.ts` (lazily injected) with thunks in `depositThunk.ts`;
  invalidations in `src/redux/invalidation/map.ts`: a deposit write refetches `partyDetail`,
  `paymentList`, `depositList`; never a declared `patch` nobody performs (the LED-01 lesson).
- Shared components in `features/payments/components/deposits/` (used by every vertical, so they
  live in core and are not copied): `DepositPanel` (party page and vertical screens),
  `ReceiveDepositDrawer`, `ApplyDepositDialog`, `RefundDepositDrawer`, `DepositSlipPrint`
  (`print/`). Drawers are `dynamic()`.
- Party page: `DepositPanel` is registered in `features/parties/modulePanels.ts` under the core key
  `deposits` and rendered only when `depositHeld` is present on the party.
- `VoidPaymentDialog`: for a payment with `meta.deposit_application_id`, the consequence line reads
  "This also reverses the matching adjustment (₹120 from deposit)".

#### 8. UI/UX
- Words: "Deposit held", "Take deposit", "Adjust from deposit", "Return deposit". Never "refund
  advance" and never "You got" for a deposit.
- Apply is **one act on screen**: one dialog, one confirmation, one snackbar ("Adjusted ₹120 from
  the deposit · ₹380 still held"), one slip. The two payments are visible on the payment list, each
  labelled "Adjustment · deposit".
- The apply dialog lists only the party's open `main` documents a vertical allowed (its own charges
  and, if the module uses sales, the invoices whose origin is that module), each with its due, and
  caps the total at `held_amount`.
- Neutral tone for deposit figures (PLT-X01 §8).
- Receipts and slips carry the tenant's name only and print `purpose`.

#### 9. Validation and business rules
- **BR-1** `held_amount = received_amount − applied_amount − refunded_amount ≥ 0` at all times
  (CHECK + service).
- **BR-2** Status is derived after every move: `expected` while `received_amount = 0` and not
  released; `held` while `held_amount > 0`; `released` when `received_amount > 0` and `held_amount = 0`.
  A deposit never returns from `released` except by a void that restores `held_amount > 0`.
- **BR-3** Receive is capped at `expected_amount − received_amount` (409 `over_allocated`); a
  vertical that wants more raises `expected_amount` first through its own flow.
- **BR-4** Apply and refund are capped at `held_amount` (409 `deposit_insufficient`, D `held_amount`).
- **BR-5** Both deposit targets are `auto = False`; FIFO never picks them (T-PLT-X03 contract).
- **BR-6** `adjustment` is accepted only from `_record_adjustment_pair`; `record_payment`'s
  `validate_mode_breakup`, LED-01's entry validation and expenses' validation refuse it (400;
  pending CQ-23).
- **BR-7** Voiding either adjustment payment voids its partner in the same transaction and stamps
  the application `voided_at`; `applied_amount` drops by the application's amount.
- **BR-8** Voiding a **receipt** is refused when it would make `held_amount < 0`
  (`deposit_insufficient`): apply-voids or refunds must be voided first. The dialog says which.
- **BR-9** The receipt's ledger line: `payment_in`, credit, bucket `deposit`. The refund's: `payment_out`,
  debit, bucket `deposit`. The adjustment OUT: `payment_out`, debit, `deposit`. The adjustment IN:
  `payment_in`, credit, `main`.
- **BR-10** Cashbook (`apps/reports/selectors/cash_sources.py`, `PaymentCashSource.rows` and
  `_NET_SQL`) skips mode-breakup parts with `mode = 'adjustment'`; deposit receipts and refunds in
  real modes are cash like any other (pending CQ-4).
- **BR-11** Numbering: the adjustment pair takes numbers from the normal `payment_out` and
  `payment_in` series (pending CQ-11).

**Worked example (library):**
| Step | Act | Payments written | held | deposit_held | balance |
|---|---|---|---|---|---|
| 0 | open, expected ₹500.00 (50000 p) | — | 0 | 0 | 0 |
| 1 | receive 50000 cash | RCT-0201 IN 50000, deposit | 50000 | 50000 | 0 |
| 2 | fine charged ₹120.00 (12000 p) | (library_charge Dr 12000, main) | 50000 | 50000 | 12000 |
| 3 | apply 12000 to the fine | PAYOUT-0031 OUT 12000 adj, deposit; RCT-0202 IN 12000 adj, main | 38000 | 38000 | 0 |
| 4 | refund 38000 UPI | PAYOUT-0032 OUT 38000, deposit | 0 → `released` | 0 | 0 |
| 5 | (instead of 4) refund 40000 | — | 409 `deposit_insufficient` `held_amount: "380.00"` | | |

Cashbook for the day: +50000 cash (step 1), −38000 bank (step 4); steps 3's two payments do not
appear. Income: the ₹120 fine, once.

#### 10. Permissions
Core endpoints use payments codenames; vertical endpoints use their own (for example
`library.member.close`) and call the same services.

| Action | Codename | owner | admin | staff | accountant | module roles |
|---|---|---|---|---|---|---|
| List / view deposits | `payments.payment.read` | ✅ | ✅ | ✅ | ✅ | ❌ |
| Receive, apply, refund | `payments.payment.write` | ✅ | ✅ | ✅ | ❌ | ❌ |
| Void a deposit payment or adjustment | `payments.payment.void` | ✅ | ✅ | ❌ | ❌ | ❌ |

#### 11. Reports
- **Deposits held** (registered by `payments` via PLT-X13, `reports.financial.read`): party,
  module, purpose, received, applied, refunded, held, since; filter by module and status; CSV.
- Payment register: `adjustment` payments shown with a badge and excluded from the "collected"
  total.
- Cashbook and day book: BR-10.

#### 12. Testing
- T-PLT-X02-1 (unit) the worked example end to end: every figure after every step.
- T-PLT-X02-2 (unit) receive above expected → `over_allocated`; apply/refund above held →
  `deposit_insufficient` with `held_amount`.
- T-PLT-X02-3 (unit) void of the adjustment IN voids the OUT (and vice versa); `applied_amount`
  and `held_amount` restore; both ledger lines reversed in their buckets.
- T-PLT-X02-4 (unit) void of a receipt after an application → 409; after voiding the application
  first → 200.
- T-PLT-X02-5 (API) `POST /payments` with `mode_breakup: [{mode: "adjustment"}]` → 400; manual "You
  got" with `payment_mode=adjustment` → 400.
- T-PLT-X02-6 (contract) both deposit targets pass the shared `AllocationTarget` suite; `auto=False`;
  `record_payment(allocations="auto")` for a party with a held deposit and no bills leaves the whole
  payment unallocated and never touches the deposit.
- T-PLT-X02-7 (replay, property) random sequences of receive/apply/refund/void: `held_amount` and
  the other caches equal the replay from allocations and applications; `party.deposit_held` equals
  Σ `held_amount` over the party's deposits and equals the ledger replay of the `deposit` bucket.
- T-PLT-X02-8 (cashbook) adjustment payments absent; deposit receipt and refund present.
- T-PLT-X02-9 (concurrency) two refunds of the full held amount at once: one 201, one 409
  `deposit_insufficient`.
- T-PLT-X02-10 (guard) the per-module counter counts deposits with `status <> 'released'` and 0 for an
  empty tenant.
- T-PLT-X02-11 (component) `ApplyDepositDialog` caps at held, shows the resulting "to return"
  figure, and dispatches one thunk.
- T-PLT-X02-12 (print) the deposit slip names the tenant only (the no-product-name test).

#### 13. Edge cases
1. EC-1 Deposit taken in two parts (₹300 then ₹200) → two receipts, both allocated; `held`.
2. EC-2 Apply to an invoice of another party → 404 (allocation party must equal deposit party).
3. EC-3 The vertical closes the subject while money is held → the vertical's guard refuses; PLT-X10
   refuses switching the module off.
4. EC-4 Party archived with `deposit_held > 0` → refused by the core deposit archive guard
   (PLT-X04), message "Return or adjust the deposit first".
5. EC-5 A deposit never received (`expected`) and the membership ends → the vertical cancels it:
   `status = released` with `received_amount = 0` is allowed by BR-2 through
   `cancel_expected_deposit()` (internal, audited `deposit.cancelled`).
6. EC-6 Walk-in (no party) → impossible: `party_id` is required.
7. EC-7 The damage exceeds the deposit (₹800 damage, ₹500 held) → apply 500, the remaining ₹300
   stays owed on the charge and is collected normally.

#### 14. Future
Interest on deposits (rent, Model Tenancy Act); scheduled automatic refund reminders; a
"deposit certificate" document; partial forfeiture presets per module.

---

### PLT-X03 — Target protocol v2, one bucket per payment, and `allocate_existing`

#### 1. Product requirements
Collections for dues, loans and library charges are ordinary payments, so receipts, void and the
UPI QR keep working (ADR-047). Three gaps are closed: (a) a target declares the ledger **bucket**
its payments land in and whether FIFO may pick it; (b) a payment settles one kind of balance;
(c) money already received as an advance can be applied to a later document (hospitality §6.7) —
today `record_payment` takes allocations once (`apps/payments/services/record.py:170-188`).

#### 2. User flows
1. **Record a payment** (unchanged screen, `PaymentFormDrawer`): the allocation picker lists open
   documents of every registered target of that direction that is `auto` **or** was offered by the
   calling screen; a mixed-bucket choice is refused with the message below.
2. **Apply an advance** (new): on a payment with `unallocated_amount > 0`, the payment page shows
   "₹1,230 not yet applied · Apply to bills". The dialog lists the party's open documents in the
   payment's bucket, pre-filled oldest first; Save calls `POST /payments/{id}/allocations`.
3. **Automatic uses** (no screen): the dues run applies advances to a new due (DUE-03); the
   document port applies them to a module invoice (PLT-X05); hospitality check-out applies the
   booking advance to the folio invoice.

#### 3. Features
Minimum: `bucket`, `auto`, `payment_id` on the protocol; existing two targets declare `main`, `auto`;
`targets_for_direction(direction, *, auto_only)`; bucket derivation and the one-bucket rule in
`record_payment`; `allocate_existing` service and endpoint; the shared target contract suite;
payment detail "Apply to bills". Later: re-allocation (move an allocation from one bill to another
in one act); SAL credit application through the same path.

#### 4. Entities and relationships
No new table. `payments_allocation (payment, document_type, document_id, amount)` is unchanged,
including `uq_allocation_target` (`apps/payments/models.py:148-150`). The payment's bucket is a
property derived from its ledger line (pending CQ-5): `ledger_entry` where `source_type='payment'`,
`source_id=payment.id`, `entry_type in (payment_in, payment_out)`, `reverses IS NULL`.

#### 5. Database
No schema change. One index already serves the bucket lookup (`ix_ledger_source`). The deferred
Σ-allocations trigger (`payments/migrations/0001`) is unchanged and is what makes a concurrent
`allocate_existing` over-allocation fail at commit.

#### 6. API
Protocol (contracts §1.4):
```python
class AllocationTarget(Protocol):
    document_type: str        # ≤ 32 chars (payments_allocation.document_type)
    direction: str            # "in" | "out"
    bucket: str               # "main" | "loan" | "deposit"
    auto: bool
    def apply(self, *, document, amount, today, payment_id=None) -> tuple[str, str]: ...
    def unapply(self, *, document, amount, today, payment_id=None) -> tuple[str, str]: ...
    # open_documents, find, lock, lock_open_for_party, is_open, outstanding, party_id,
    # summary, audit_action: unchanged
```
`register_target` refuses (`ImproperlyConfigured`) a `document_type` longer than 32 characters, a
bucket outside the three, or a re-registration with a different direction/bucket/auto.

`record_payment` (unchanged signature) now: resolves each chosen allocation's target bucket;
refuses two buckets with 400 `validation_error`
`{allocations: ["One payment settles one kind of balance."]}`; posts its ledger line with
`bucket = <the one bucket>` or `main` when unallocated; passes `payment_id=payment.id` to `apply`.

**`POST /api/v1/payments/{id}/allocations`** — `ModuleEnabled("payments")`,
`payments.payment.write`, `Idempotency-Key` required.
Request:
```json
{ "allocations": [{"document_type": "sales_document", "document_id": "…", "amount": "1770.00"}],
  "reason": "Advance of 3 Sep applied at check-out" }
```
`allocations` may also be `"auto"`: oldest first across the payment's bucket's `auto` targets.
Response 200:
```json
{ "data": { "payment": {…, "unallocated_amount": "1230.00"},
            "allocations": [{"document_type": "sales_document", "document_id": "…",
                              "number": "INV/26-27/0311", "amount": "1770.00"}],
            "documents": [{…summary…}] },
  "meta": { "party_balance": "-1230.00" } }
```
Errors: 400 `validation_error` (empty list, amount ≤ 0, duplicate document, target direction or
bucket ≠ the payment's); 404 (payment, party or document not this tenant's, or document of another
party); 409 `over_allocated` (Σ > `unallocated_amount`, D `unallocated_amount`),
`payment_already_void`, `document_not_open`, `idempotency_conflict`.
Audit `payment.allocated` with `before`/`after` allocations and `metadata.reason`, plus each
document's status-change row as `record_payment` writes.

Python: `allocate_existing(*, ctx, payment_id, allocations, reason="") -> dict` (contracts §1.4),
locks party → target documents (each target's `lock`, targets in `document_type` order) → payment.

#### 7. Frontend
- `paymentService.ts`: `allocateExisting(paymentId, body, idempotencyKey)`.
- `paymentReceiptSlice` / `paymentThunk.ts`: `allocateExistingPayment` thunk; invalidates
  `paymentReceipt`, `partyDetail`, `invoiceDetail` (for each document), `paymentList`.
- `ApplyAdvanceDialog.tsx` (new, `dynamic()`), reusing `PaymentAllocationPicker` in "existing
  payment" mode (max = `unallocated_amount`).
- `PaymentReceiptPageContent.tsx`: the "not yet applied" line and button, shown only when
  `unallocated_amount > 0`, status `recorded`, and the user holds `payments.payment.write`.
- `PaymentAllocationPicker` shows a bucket-mismatch message inline (server is the judge).

#### 8. UI/UX
- "Apply to bills" (Hindi "बिलों में लगाएँ"). The dialog opens pre-filled oldest first; the
  merchant edits rows; the footer shows "Applying ₹1,770 · ₹1,230 stays as advance".
- The receipt print is unchanged (it prints what the payment settled **at print time**, with a line
  "Applied later: INV/26-27/0311 ₹1,770 on 12 Oct" for allocations made by `allocate_existing`).
- Error copy for mixed buckets: "One payment settles one kind of balance. Record the loan collection
  separately."

#### 9. Validation and business rules
- **BR-1** A payment's bucket is fixed when it is recorded: the bucket of its allocations' targets,
  or `main` when it had none. `allocate_existing` accepts only targets of that bucket and direction.
- **BR-2** `allocate_existing` moves at most `unallocated_amount`; each row ≤ the document's
  `outstanding`; a row of 0 is dropped; Σ > unallocated → 409 `over_allocated`.
- **BR-3** It posts **no** ledger line and moves **no** party balance: the money was already on the
  khata as an advance; only the document side moves (`apply`) and `unallocated_amount` drops.
- **BR-4** A void of the payment later un-applies these allocations exactly like the originals
  (they are ordinary `payments_allocation` rows).
- **BR-5** Auto allocation order across several `auto` targets (sales invoices, `dues_due`,
  `library_charge`): global oldest first by `(document_date, number, id)`; ties across targets by
  `document_type` (pending CQ-6).
- **BR-6** An existing row for the same `(payment, document_type, document_id)` is **increased**
  rather than duplicated (the unique constraint forbids two), and the audit says so.
- **BR-7** A payment OUT's advance (supplier advance) can be applied to purchase bills the same way;
  the endpoint is direction-agnostic.

**Worked example:** RCT/26-27/0090 received 3 Sep ₹3,000.00 (300000 p), unallocated; party balance
−300000. Invoice INV/26-27/0311 issued 12 Oct ₹1,770.00 (177000 p): balance −123000. Apply 177000
→ invoice paid, `unallocated_amount` 123000, balance still −123000 (BR-3). A second call for
130000 → 409 `over_allocated` `unallocated_amount: "1230.00"`. Mixed buckets: record ₹9,000
(900000 p) with `[sales_document 500000, dues_instalment 400000]` → 400, nothing written.

#### 10. Permissions
| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Apply an advance | `payments.payment.write` | ✅ | ✅ | ✅ | ❌ |
Vertical flows that call `allocate_existing` check the vertical's codename instead.

#### 11. Reports
Payment register gains "Applied later" in the allocation column. "Advances" (open unallocated
payments by party and bucket) is a filter on the existing payment list
(`?unallocated=true&bucket=main`).

#### 12. Testing
- T-PLT-X03-1 (contract suite) `tests/contracts/test_allocation_targets.py`, parametrised over
  every registered target: lock order `(document_date, number, id)`; `apply` then `unapply` restores
  the row exactly (every column); status re-derived, never toggled; `outstanding ≥ 0`; `bucket` and
  `auto` declared; `document_type ≤ 32`; `apply` accepts `payment_id`.
- T-PLT-X03-2 (unit) mixed-bucket allocations → 400, no payment row, no number consumed.
- T-PLT-X03-3 (unit) the worked example; party balance unchanged by `allocate_existing`.
- T-PLT-X03-4 (unit) `"auto"` never picks `auto=False` targets (`lending_loan`, `dues_instalment`,
  deposits) — the `test_supplier_fifo_never_touches_*` pattern.
- T-PLT-X03-5 (concurrency) two `allocate_existing` calls on one payment for 800 each with 1,230
  unallocated: one succeeds, the other 409 (the deferred trigger or the lock).
- T-PLT-X03-6 (concurrency) `allocate_existing` racing `void_payment` on the same payment and bill:
  no deadlock (both take party first); the loser gets `payment_already_void` or proceeds on a
  consistent state.
- T-PLT-X03-7 (unit) BR-6: applying to an invoice the payment already partly settles increases the
  row.
- T-PLT-X03-8 (API) idempotent replay; cross-tenant payment → 404; another party's bill → 404.
- T-PLT-X03-9 (e2e) record advance → issue invoice → Apply to bills → invoice paid; receipt shows
  "Applied later".

#### 13. Edge cases
1. EC-1 The payment is a walk-in receipt (no party) → 409 `validation_error` "A walk-in receipt
   cannot be applied later."
2. EC-2 A document voided after `allocate_existing` → `release_document_allocations` returns the
   amount to `unallocated_amount` (unchanged behaviour).
3. EC-3 A loan-bucket payment partly unallocated (collection larger than the instalment) → its
   remainder is a `loan` advance; `allocate_existing` offers only `dues_instalment` rows.
4. EC-4 An archived party → allowed (moving money already received harms no one), same as void EC-5.
5. EC-5 A credit note's refund voucher (meta `credit_note_id`) → refused: its money is spoken for.

#### 14. Future
Re-allocation in one act; allocation suggestions by amount match; SAL credit notes applied through
the same service.

---

### PLT-X04 — Party module roles, relations and archive guards

#### 1. Product requirements
People are always parties (vision §3). A module's role on a person — member, borrower, guest,
trainer — is the existence of that module's **profile row** (ADR-046). Core must be able to filter
the party list by role, show role badges, link a guardian or payer to a person, and refuse to archive
a person while any module holds open records for them — all without importing a vertical.

#### 2. User flows
1. **Party list** (`/parties`): when a module with roles is enabled, a "Role" chips row appears
   ("Members", "Borrowers"…) beside Customers/Suppliers; `?role=gym_member` in the URL.
2. **Party page**: role badges under the name; each module's panel (registered in
   `features/parties/modulePanels.ts`) renders beneath the info panel.
3. **Relations**: on the party page, "Guardian and payer" section → "Add" → pick or create a party
   → kind (Guardian / Pays for) → "Send reminders to them" switch → Save. Remove with a reason-less
   confirm.
4. **Archive**: `PartyArchiveDialog` → 409 `party_has_open_records` swaps the dialog in place to
   "Gym has 1 active membership for Rahul. End it first." with a link the module registers.

#### 3. Features
Minimum: `register_party_role`, `GET /parties?role=`, `GET /parties/roles`, badges in the party
detail and list payloads; `parties_relation` and its API; `register_archive_guard` in single and
bulk archive; the core deposit guard. Later: relation kinds beyond guardian and payer (emergency
contact); merging parties across modules.

#### 4. Entities and relationships
- Profile tables are the verticals' (`gym_member`, `library_membership`, `lending_borrower`…):
  `OneToOneField("parties.Party", on_delete=RESTRICT, related_name="+")`.
- `parties_relation`: N:1 `party` (the person) and N:1 `related_party` (guardian or payer), both
  RESTRICT.
- A role is a registry entry `(code → module, label_id, party_ids(tenant))`; an archive guard is
  `(module → guard(tenant, party))`.

#### 5. Database
**Migration `parties/0010_party_relation.py`:**

| Column | Type | Notes |
|---|---|---|
| TenantModel columns | | |
| `party_id` | `uuid NOT NULL` FK RESTRICT | the person |
| `related_party_id` | `uuid NOT NULL` FK RESTRICT | the guardian or payer |
| `kind` | `varchar(12) NOT NULL` | `guardian` \| `payer` |
| `receives_messages` | `boolean NOT NULL DEFAULT false` | reminders go to them |
| `from_on` | `date NOT NULL` | default today |
| `to_on` | `date NULL` | ended when set |

Constraints: `uq_party_relation UNIQUE (tenant_id, party_id, related_party_id, kind)`;
`ck_party_relation_not_self CHECK (party_id <> related_party_id)`;
`ck_party_relation_kind CHECK (kind IN ('guardian','payer'))`;
`ck_party_relation_dates CHECK (to_on IS NULL OR to_on >= from_on)`.
Indexes: `ix_party_relation_party (tenant_id, party_id)`,
`ix_party_relation_related (tenant_id, related_party_id)`.
A relation is ended (`to_on`) rather than deleted once any reminder has used it; `DELETE` is
allowed only for a relation with no reminder history (the service checks
`ledger_reminder.recipient` history through a registered counter, else ends it).
Registered in `parties/tenant_data.py`.

#### 6. API
| Method | Path | Codename | Notes |
|---|---|---|---|
| GET | `/api/v1/parties?role=<code>[,<code>]` | `parties.party.read` | OR within roles, AND with other filters (the `tag=` rule); unknown or disabled role → 400 `validation_error` `{role: ["Unknown role."]}` |
| GET | `/api/v1/parties/roles` | `parties.party.read` | `{data: [{code, module, label_id, count}]}` for enabled modules only |
| GET | `/api/v1/parties/{id}/relations` | `parties.party.read` | both directions: `{as_person: [...], as_related: [...]}` |
| POST | `/api/v1/parties/{id}/relations` | `parties.party.write` | `{related_party_id, kind, receives_messages?, from_on?}` → 201 |
| DELETE | `/api/v1/parties/{id}/relations/{rid}` | `parties.party.write` | 204, or ends it (200 with `to_on`) when it has history |
| POST | `/api/v1/parties/{id}/archive` | existing | new 409 `party_has_open_records` D `{module, count, label_id}` |
| POST | `/api/v1/parties/bulk-archive` | existing | skipped rows gain `code: "party_has_open_records"`, `module`, `count` |

`GET /parties/{id}` gains `roles: [{code, module, label_id}]`; list rows gain `roles` (codes only).
Relation shape: `{id, kind, receives_messages, from_on, to_on, party: {id, name, mobile_masked},
related_party: {id, name, mobile_masked}}`.

Errors: 400 `validation_error` (self relation, unknown kind, `related_party_id` missing); 404
(either party not this tenant's); 409 `party_archived` (adding a relation to an archived party),
`party_has_open_records`.

Python (contracts §1.3):
```python
register_party_role(code, *, module, label_id, party_ids: Callable[[tenant], QuerySet[UUID]])
register_archive_guard(module, guard: Callable[[tenant, party], ArchiveBlock | None])
class ArchiveBlock(TypedDict): module: str; count: int; label_id: str
```
`roles_for(tenant, party_ids) -> dict[UUID, list[str]]` batches badge lookups: one query per enabled
role per page (never per row).

#### 7. Frontend
- `partyService.ts`: `listRoles`, `listRelations`, `createRelation`, `deleteRelation`; `role` joins
  the list request key (`partyListRequestKey` — the PTY-02 lesson that a key which does not know a
  filter claims the wrong warm-up).
- `PartyListFilters.tsx`: a `PartyRoleFilter` chips row fed by `GET /parties/roles`, rendered only
  when the list is non-empty; `usePartyListUrl` round-trips `role`.
- `PartyDetailHeader.tsx`: `UbStatusBadge` per role (label from the module's catalogue).
- `PartyRelationsSection.tsx` + `PartyRelationDialog.tsx` (`dynamic()`) in `features/parties`.
- `features/parties/modulePanels.ts`: `registerPartyPanel(module, { key, load: () => import(...) })`;
  `PartyDetailPageContent` renders registered panels whose module is in `enabled_modules`.
- `PartyArchiveDialog` / `PartyBulkArchiveDialog`: render `party_has_open_records` details.

#### 8. UI/UX
- The role chips use the module's own word ("Members" for gym and library, "Borrowers" for
  lending). With no role-bearing module enabled the row does not exist.
- Relation kinds: "Guardian", "Pays for" (payer); Hindi "अभिभावक", "भुगतान करते हैं".
- The archive refusal names the module, the count and the next step; a merchant is never told
  "not allowed" without the number (the `module_has_data` principle).

#### 9. Validation and business rules
- **BR-1** `?role=` accepts only codes of roles registered by **enabled** modules.
- **BR-2** A relation may not point at itself or duplicate `(party, related_party, kind)`.
- **BR-3** Guards run inside `archive_party` **after** the write-off handler and the balance check
  and **under** the party lock (`archive.py:109`); the first block raises; a guard of a disabled
  module is not called.
- **BR-4** `bulk_archive_parties` calls the guards for each locked eligible id and moves blocked ids
  to `skipped` with the guard's module and count; it never archives a blocked party.
- **BR-5** Core registers one guard itself: `payments` → "deposits held" (`Σ held_amount > 0`
  for any module).
- **BR-6** Archiving a person does not end their relations; archiving a **guardian** is refused
  while they are an active guardian of an active party ("Rahul's guardian"), through a parties-owned
  guard.
- **BR-7** `receives_messages` is a preference read by reminder sources (PLT-X06
  `recipient_party_id`); it sends nothing.

Worked example (no money): Rahul has an active gym membership and ₹0.00 (0 p) balance → archive
409 `party_has_open_records {module: "gym", count: 1, label_id: "gym.archive.activeMemberships"}`.
Bulk archive of [Rahul, Sita] where Sita is clear → Sita archived; Rahul skipped with the same code.

#### 10. Permissions
| Action | Codename | owner | admin | staff | accountant | module roles |
|---|---|---|---|---|---|---|
| Filter by role, see badges, see relations | `parties.party.read` | ✅ | ✅ | ✅ | ✅ | ❌ |
| Add / end / delete a relation | `parties.party.write` | ✅ | ✅ | ✅ | ❌ | ❌ |
| Archive (existing) | `parties.party.write` | ✅ | ✅ | ✅ | ❌ | ❌ |

#### 11. Reports
Party list CSV export gains a `roles` column. "Guardians and payers" is not a separate report;
it is a filter on relations in each vertical's member list.

#### 12. Testing
- T-PLT-X04-1 (unit) `?role=` with a test role registered by the engine fixture subject; disabled
  module → 400.
- T-PLT-X04-2 (query budget) a page of 50 parties with badges from three roles is ≤ 4 queries.
- T-PLT-X04-3 (plan) `EXPLAIN` of `?role=` uses the profile table's unique party index (a fake
  profile table in the test app).
- T-PLT-X04-4 (unit) archive refused by a registered guard; the guard of a disabled module is not
  called; bulk archive skips and reports.
- T-PLT-X04-5 (unit) the deposit guard: `held_amount > 0` blocks.
- T-PLT-X04-6 (API) relation CRUD, self relation 400, duplicate 400, cross-tenant 404, delete with
  history ends instead.
- T-PLT-X04-7 (contract) every registered archive guard returns `None` for a party with no records
  of its module.
- T-PLT-X04-8 (e2e, `e2e/parties.mjs`) role chip filters issue a request with `role=` (assert the
  network, the PTY-02 lesson); four-width sweep of the relations section.

#### 13. Edge cases
1. EC-1 A party with two profiles (member of gym and library) → two badges; `?role=gym_member,library_member` ORs.
2. EC-2 A module switched off → its role disappears from `/parties/roles`, its badges disappear,
   `?role=` for it is 400; its profile rows stay.
3. EC-3 A guardian who is also a customer → one party, two meanings; no duplicate contact.
4. EC-4 A relation to an archived guardian → allowed to read; creating a new one → 409 `party_archived`.
5. EC-5 Enquiries and co-guests (ADR-046) are not parties and never appear here.

#### 14. Future
Emergency-contact relation; household view; merging two parties carrying different module profiles.

---

### PLT-X05 — Sales document port and origin listeners

#### 1. Product requirements
A gym membership, a hotel stay and a registered tenant's recurring fee are taxable supplies and
need a real tax invoice (or a bill of supply for a composition tenant). ADR-045 routes them through
the existing sales pipeline behind a port in `apps/common/seams/documents.py`, so no vertical or
engine imports `sales`, and so the module hears in the same transaction when its invoice is voided
or paid.

#### 2. User flows
1. **Issue** (no screen of its own): the gym "Start membership" or the dues run calls
   `issue_document`; the invoice appears in Invoices and on the khata with the number from the
   sales series, the origin shown as "From Gym · Membership M-0042".
2. **Pay** at issue (`payment` in the request) or later through the normal payment flows; the
   origin hears `on_settlement_changed` and updates (for example the due becomes `paid`).
3. **Void**: from the invoice page. If the origin refuses (`blocks_void`), the void dialog shows
   the origin's reason ("End the membership first"); otherwise the void cascades to the origin
   (`on_void`) in one transaction.
4. **Credit note** from the module (a pro-rata refund on leaving): the module calls
   `issue_credit_note(settlement="refund" | "hold_advance")`.

#### 3. Features
Minimum: the port module; `SalesIssuer` registered by `sales`; origin columns on `sales_document`;
`kind_for` and never an estimate; `credit_check="skip"`; `apply_open_advances`; per-line tax;
`blocks_void` / `on_void` in `void_invoice`; `on_settlement_changed` after `refresh_invoice_amounts`;
origin badge and filter in the invoice list. Later: port methods for receipt vouchers with tax on
advances (ADR-045 trigger); estimates from modules.

#### 4. Entities and relationships
`sales_document` gains `(origin_module, origin_type, origin_id)` — a polymorphic pointer to the
module row, never an FK. The port holds one issuer and a map `origin_type → (module, listener)`.

#### 5. Database
**Migration `sales/0004_document_origin.py`:**

| Column | Type | Notes |
|---|---|---|
| `origin_module` | `varchar(32) NULL` | module code |
| `origin_type` | `varchar(48) NULL` | e.g. `dues_due`, `gym_membership`, `hospitality_stay` |
| `origin_id` | `uuid NULL` | |

Constraint `ck_sales_document_origin_complete CHECK ((origin_type IS NULL) = (origin_id IS NULL)
AND (origin_type IS NULL) = (origin_module IS NULL))`. Index
`ix_sales_doc_origin (tenant_id, origin_type, origin_id) WHERE origin_type IS NOT NULL`.
Nullable columns with no default: metadata-only; existing rows are null (a counter sale has no
origin). No change to `sales_document_line`: it already carries `hsn_sac`, `unit_code`,
`tax_code`, `tax_rate` and a nullable `item` (`apps/sales/models.py:157-177`).

#### 6. API
Python, exactly contracts §1.5. Implementation notes that bind the implementer:
- `SalesIssuer.issue` = `create_draft(ctx, payload, kind=kind_for(tenant, None))` then
  `issue_invoice(ctx, document_id, payment=request.payment, credit_check=request.credit_check)`
  in the caller's transaction; the origin columns are set on the draft before issue.
- Line mapping: `description`, `hsn_sac`, `qty`, `unit_code` (default `NOS`), `unit_price`,
  `tax_inclusive`, `discount_amount` → the sales line; `item_id` → `item` only when inventory is on
  (else refused, 400); `gst_rate` → a `tax_code` by the tax master for the document date (pending
  CQ-2); `gst_rate=None` → the item's code, else the tenant default code.
- `issue_invoice` gains keyword `credit_check: str = "enforce"`; `"skip"` bypasses
  `credit_check()` (`issue_parts.py:66`) and returns a warning `credit_limit_exceeded` if the limit
  is crossed, never a 409.
- `apply_open_advances=True` → after issue, `allocate_existing` of the party's open **main** advances,
  oldest payment first, up to `amount_due` (PLT-X03); the result's `amount_due` reflects it.
- `void_invoice` (`void.py:80`): after `refuse_unless_voidable`, if `origin_type` is set, call
  `blocks_void(tenant, origin_id)`; a reason → 409 `document_origin_locked`
  `{origin_type, reason}`; else proceed, and call `on_void(ctx, origin_id, document, reason)` last,
  inside the transaction. A listener that raises rolls the void back.
- `refresh_invoice_amounts` (`amounts.py:56`): after save, if `origin_type` is set and
  `amount_due` or `status` changed, call `on_settlement_changed(ctx, origin_id, document)`
  (pending CQ-1 for the `ctx`).
- `document_summaries(tenant, ids)` → `{id: IssuedDocument}` in one query.
- `issuer_available(tenant)` is `issuer registered and "sales" in effective_modules(tenant)`.

HTTP deltas (sales endpoints, unchanged codenames):
- `GET /api/v1/sales/invoices?origin_module=gym` filter; list rows and detail gain
  `origin: {module, type, id, label} | null` (label via the origin's registered label function).
- `POST /api/v1/sales/invoices/{id}/void` → new 409 `document_origin_locked`.

Errors raised through the port: 403 `module_disabled` (`details.module = "sales"`) when the issuer is
unavailable; all of sales' own codes pass through unchanged (`rule46_failed`, `party_archived`,
`validation_error`, `kind_not_allowed` never — the port never requests a kind).

#### 7. Frontend
- `features/sales`: invoice list `origin_module` filter chip (only for enabled modules with an
  origin), an `OriginBadge` in list rows and on the invoice page linking to the module's route (the
  link target is registered in a frontend map `features/sales/originLinks.ts`, keyed by origin type,
  each entry `dynamic()`-free: a path builder only).
- `VoidInvoiceDialog`: renders `document_origin_locked.details.reason` in place, with the module's
  link.
- No module imports `features/sales` (10-architecture §6 rule 7): the module shows its invoices
  through its own components calling `/sales/invoices?origin_type=…&origin_id=…` via its own service
  file — a read of a public endpoint, not an import.

#### 8. UI/UX
The invoice carries the module line as its description ("Quarterly membership, 1 Oct – 31 Dec
2026"); the print is the ordinary sales print (tenant name only); the origin badge reads "From Gym".
The void refusal reason is the module's words.

#### 9. Validation and business rules
- **BR-1** The port never issues an estimate; the kind is `kind_for(tenant, None)`.
- **BR-2** `party_id` is required; module documents are never walk-in.
- **BR-3** `credit_check="skip"` for engine charges (ADR-048): issued, warning returned, limit shown
  crossed. `"enforce"` behaves as a counter sale.
- **BR-4** Origin columns are write-once, set only by the port; the sales API refuses them in bodies.
- **BR-5** A listener runs inside the sales transaction and lock order: party → document → origin's
  rows (engine rows sit after documents).
- **BR-6** One document per origin issue: the port is idempotent by `(origin_type, origin_id)` for a
  non-void document — a second `issue_document` for the same origin returns the standing document.
- **BR-7** A per-line `gst_rate` must resolve to a tax code valid on the document date, else 400
  `validation_error` `{lines.N.gst_rate: ["No tax code for 18% on 01/10/2026."]}`.

**Worked example (gym, regular tenant, intra-state):** one line "Quarterly membership" ₹2,500.00
(250000 p) exclusive, 18% (GST18): CGST 22500 p, SGST 22500 p, grand total **295000 p (₹2,950.00)**.
Party limit ₹2,000.00 (200000 p), trade balance 0 → `credit_check="skip"`: issued, warning
`{limit: "2000.00", balance_after: "2950.00", over_by: "950.00"}`. A ₹1,000.00 (100000 p) advance
exists and `apply_open_advances=True` → `amount_due` 195000 p.
**Hotel (per-line rates):** 2 nights × ₹3,000.00 at 5% → taxable 600000, tax 30000; 1 night ₹8,000.00
at 18% → taxable 800000, tax 144000; total 1574000 p (₹15,740.00). The rates are illustrative; the
slab rule and dates live in `tax` (ADR-045) and hospitality's FRD.

#### 10. Permissions
The port checks no codename (the calling vertical endpoint did). Sales screens keep theirs.

| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| See origin badge and filter | `sales.invoice.read` | ✅ | ✅ | ✅ | ✅ |
| Void a module invoice | `sales.invoice.void` | ✅ | ✅ | ❌ | ❌ |

#### 11. Reports
Sales register and GST summary include module invoices (they are invoices); the register gains an
"Origin" column and `origin_module` filter. The GSTR-1 export is unchanged.

#### 12. Testing
- T-PLT-X05-1 (unit, fake origin) issue through the port: one draft→issued document, origin columns
  set, kind from `kind_for`, ledger debit posted, number from the sales series.
- T-PLT-X05-2 (unit) composition tenant → bill of supply; unregistered → invoice; never an estimate.
- T-PLT-X05-3 (unit) `credit_check="skip"` over limit → issued + warning; `"enforce"` → 409.
- T-PLT-X05-4 (contract) every registered origin listener: `on_void` called once inside the
  transaction; a raising listener rolls the void back (document still issued, ledger unchanged);
  `blocks_void` reason → 409 `document_origin_locked`.
- T-PLT-X05-5 (contract) `on_settlement_changed` called after a payment, a payment void, a credit
  application and `allocate_existing`; not called when neither `amount_due` nor `status` changed.
- T-PLT-X05-6 (unit) BR-6 idempotency; BR-7 unresolvable rate → 400.
- T-PLT-X05-7 (unit) `apply_open_advances` allocates oldest advance first and never a loan or
  deposit payment.
- T-PLT-X05-8 (import) `apps/common/seams/documents.py` imports nothing from `apps.*` (rule D1).
- T-PLT-X05-9 (unit) sales off → `issue_document` 403 `module_disabled` `details.module="sales"`.
- T-PLT-X05-10 (concurrency) void of a module invoice racing a payment on it: party-first order, no
  deadlock; the listener sees a consistent state.

#### 13. Edge cases
1. EC-1 A module invoice credit-noted in part → `on_settlement_changed` with the new `amount_due`.
2. EC-2 Sales switched off while module invoices exist → refused by sales' existing module-off guard
   (open documents) and by the module's dependency (`MODULE_DEPENDENCIES`).
3. EC-3 Tenant changes GST type between two dues → each document takes the kind of its own issue.
4. EC-4 An origin listener unregistered (a module removed in code) → void proceeds, a warning is
   logged, and `origin.label` reads "Record not found" (a clear state, ADR-042).
5. EC-5 `item_id` given with inventory off → 400 `{lines.N.item_id: ["Items are off; describe the line instead."]}`.

#### 14. Future
Receipt vouchers with GST on advances; module-issued estimates (venues); e-invoice IRN for module
invoices when sales gains it.

---
### PLT-X06 — Reminder source link, notices and guardrails

#### 1. Product requirements
Module reminders name a specific thing ("Instalment 4 of LN-0042 · ₹5,625 due 12 Oct", "Wings of
Fire is ready to collect"), not only a party balance; two loans due the same day are two reminders;
library and gym need notices with no amount; and lending needs a legal guardrail — 08:00–19:00,
one per loan per day, fixed polite templates — that no path can bypass (ADR-054, lending §15.4).
The existing party reminder must also quote the **trade** figure, never a whole loan (ADR-043).
Nothing is sent by the product (DEC-012); "send" records that the merchant was handed the text.

#### 2. User flows
1. **Reminders list** (`/reminders`): tabs by module appear when a module with a reminder source is
   enabled ("Shop", "Loans", "Library"…); a module tab lists candidates in buckets (due in 3 days,
   due today, overdue 1–7, 8–30, 30+ for dues; "ready to collect" for notices).
2. **Send one**: tap a candidate → `PartyReminderSheet` shows the server-composed text, the
   recipient (the guardian when a relation says `receives_messages`), WhatsApp / SMS / Call → the
   tap records the reminder. Outside the window: the buttons are replaced by "Loan reminders can be
   sent 8 am – 7 pm. Next: today 8:00 am" and nothing is recorded.
3. **Bulk**: select candidates → Prepare → rows outside the window or over the cap are listed as
   skipped with the reason and the next allowed time.
4. **Automated SMS** (LED-07, only when `ledger.auto_sms` is on): the 09:00 job also takes module
   candidates, deferring `scheduled_for` into the module's window.

#### 3. Features
Minimum: four source columns; `due` and `notice` kinds; widened unique index; the candidate
registry; the policy registry with `check_reminder_allowed` and `next_allowed_at` on every path;
tenant narrowing of a window; template fixity and a forbidden-words test; trade figure for party
reminders; module tabs. Later: per-module quiet days (closed days from PLT-X08), a per-tenant global
window if the owner decides (10-architecture §16 item 4).

#### 4. Entities and relationships
`ledger_reminder` (existing) gains a polymorphic pointer `(module, source_type, source_id)` and
`subject_label`, plus the recipient (pending CQ-9). A reminder source and a policy are registry
entries keyed by `source_type` and by module.

#### 5. Database
**Migration `ledger/0007_reminder_source.py`:**

| Column | Type | Notes |
|---|---|---|
| `module` | `varchar(32) NOT NULL DEFAULT ''` | `''` for party reminders |
| `source_type` | `varchar(48) NULL` | `dues_due`, `library_loan`, `library_hold` … |
| `source_id` | `uuid NULL` | |
| `subject_label` | `varchar(120) NOT NULL DEFAULT ''` | printed in the list and the text |
| `recipient_party_id` | `uuid NULL` FK `parties_party` RESTRICT | the guardian or payer (pending CQ-9) |

`kind` is `varchar(12)`; `due` and `notice` fit. Constraints:
`ck_reminder_source_complete CHECK ((source_type IS NULL) = (source_id IS NULL))`;
`ck_reminder_notice_has_no_amount CHECK (kind <> 'notice' OR snapshot_balance IS NULL)`.
Index change, in one migration with a working reverse:
```sql
DROP INDEX uq_reminder_auto_per_day;
CREATE UNIQUE INDEX uq_reminder_auto_per_day
    ON ledger_reminder (party_id, due_on, kind, source_id) NULLS NOT DISTINCT
    WHERE kind IN ('auto_d1','auto_d0','due','notice');
CREATE INDEX ix_reminder_source ON ledger_reminder (tenant_id, source_type, source_id)
    WHERE source_type IS NOT NULL;
CREATE INDEX ix_reminder_module_sent ON ledger_reminder (tenant_id, module, source_id, sent_at)
    WHERE module <> '';   -- the daily-cap count
```
`due`/`notice` rows are the ones the **auto job** writes; a merchant's manual send about a module
due is `kind = 'manual'` with the source columns set, which the unique index does not cover and the
cap governs (pending CQ-9).

#### 6. API
Python, contracts §1.6, plus:
- `candidates_for(tenant, today, *, module=None) -> list[ReminderCandidate]` — calls every source of
  an enabled module; one call per source; batched labels.
- `effective_policy(tenant, module) -> ReminderPolicy` — the registered policy narrowed by the tenant
  setting `reminders.<module>.window` (`{"value": ["09:00", "18:00"]}`); a wider tenant value is
  refused at settings save (400 `{reminders.lending.window: ["Can only be narrower than 08:00–19:00."]}`).

HTTP (existing reminder endpoints, `ModuleEnabled("ledger")`, `ledger.reminder.write` for writes):
- `GET /api/v1/reminders/due?module=<code>&bucket=` → for `module=''` (default) today's party
  buckets; for a module, `{data: [{party, recipient, source_type, source_id, subject_label, due_on,
  amount, bucket, allowed: bool, next_allowed_at}]}`.
- `POST /api/v1/reminders` and `/reminders/preview` accept `source_type`, `source_id` (then `module`,
  `subject_label`, amount and recipient are server-derived from the source's candidate — the client
  never sends an amount).
- `POST /api/v1/reminders/{id}/send` and `POST /reminders/bulk` call `check_reminder_allowed`
  before recording; refusals: 409 `reminder_outside_window`
  `{window_start: "08:00", window_end: "19:00", next_allowed_at: "2026-10-13T08:00:00+05:30"}`,
  409 `reminder_cap_reached` `{cap: 1, next_allowed_at: …}`. Bulk reports them per row as
  `skipped: [{party_id, source_id, code, next_allowed_at}]` and records the rest.
- Reminder shape gains `module`, `source_type`, `source_id`, `subject_label`, `recipient`.

#### 7. Frontend
- `reminderService.ts` gains `module` and `source` params; `reminderSlice` keys lists by module.
- `RemindersPageContent.tsx`: `UbTabs` by module from a small registry
  (`features/reminders/moduleTabs.ts`, entries registered by each module's feature folder), rendered
  only when two or more tabs exist.
- `PartyReminderSheet.tsx` / `BulkReminderDialog.tsx`: render `allowed=false` rows with the next
  allowed time and hide the send buttons; handle the two 409s via the global snackbar with the
  server's `next_allowed_at` formatted in the tenant timezone.
- `ReminderSettingsDialog.tsx`: a per-module window row (two time inputs) shown only for modules
  with a policy.

#### 8. UI/UX
- Text frame from the template registry (LED-08) keyed by `template_key`; the module supplies the
  words ("instalment", "membership", "book"). Fixed templates: the sheet shows the text read-only for
  a `fixed_templates` module; the note field is hidden.
- The refusal copy is factual and never scolding: "Loan reminders can be sent between 8 am and
  7 pm." Hindi: "ऋण की याद सुबह 8 से शाम 7 बजे तक भेजी जा सकती है।"
- A notice has no amount on screen or in text.

#### 9. Validation and business rules
- **BR-1** Every path that records, prepares or sends — `/reminders/{id}/send`, `/reminders/bulk`,
  `create_reminder` with `status=sent`, the auto job — calls
  `check_reminder_allowed(tenant, module, party_id, source_id, at=now)` first. Preview does not
  record and is always allowed.
- **BR-2** Window: tenant-local `[start, end)`. At 18:59:59 allowed; at 19:00:00 refused with
  `next_allowed_at` = next day 08:00 (or today 08:00 when before the window).
- **BR-3** `daily_cap_per_source`: count of this tenant's reminders with this `source_id`,
  `status in (sent, scheduled)`, whose `sent_at` (or `scheduled_for`) falls on the tenant-local
  date of `at`. `daily_cap_per_party` likewise by party and module.
- **BR-4** A module without a policy behaves as today (no window, no cap).
- **BR-5** A tenant may narrow, never widen; narrowing below 1 hour is refused.
- **BR-6** `due` candidates carry `amount` = the source's current open amount, frozen into
  `snapshot_balance` at send; `notice` has none (CHECK).
- **BR-7** Party reminders (`module=''`) quote the **trade** figure `balance − loan_balance`
  (`snapshot_balance`, the text and `_check_remindable`'s "nothing owed" test); a borrower with only
  a loan never appears in the shop list.
- **BR-8** The recipient is the party, or the related party with `receives_messages=true`
  (PLT-X04) when the candidate names it; the text is addressed to the recipient and names the person.
- **BR-9** Forbidden words (`forbidden_words`) are enforced by a **template test** over every
  registered template of that module, not at runtime.
- **BR-10** Auto rows are unique per `(party, due_on, kind, source_id)`; a rerun writes nothing new.

**Worked example.** Borrower with `balance` 4892500 p and `loan_balance` 4662500 p (PLT-X01): the
shop reminder quotes ₹2,300.00 (230000 p). Loan LN-0042 instalment 4 due 12 Oct, open ₹5,625.00
(562500 p): at 12 Oct 18:10 a WhatsApp send is recorded with `snapshot_balance` 562500; a second send
at 18:40 → 409 `reminder_cap_reached {cap: 1, next_allowed_at: "2026-10-13T08:00:00+05:30"}`. Two
loans due that day → two candidates, two rows allowed (cap is per source).

#### 10. Permissions
| Action | Codename | owner | admin | staff | accountant | lending_agent |
|---|---|---|---|---|---|---|
| See reminder lists and candidates | `ledger.entry.read` | ✅ | ✅ | ✅ | ✅ | ❌ (uses lending's scoped endpoint) |
| Record / send / bulk | `ledger.reminder.write` | ✅ | ✅ | ✅ | ❌ | ❌ (lending's endpoint, same policy) |
| Narrow a module window | `platform.tenant.manage` | ✅ | ❌ | ❌ | ❌ | ❌ |
A scoped module role reaches reminders only through its vertical's endpoint, which calls the same
services and therefore the same policy.

#### 11. Reports
"Reminder history" (existing) gains module and subject columns and a module filter. Each module's
own "reminded / not reminded" figures read `ix_reminder_source`.

#### 12. Testing
- T-PLT-X06-1 (unit) window edges 07:59:59, 08:00:00, 18:59:59, 19:00:00 in `Asia/Kolkata`;
  `next_allowed_at` correct across midnight.
- T-PLT-X06-2 (unit) cap per source and per party; statuses counted; a `failed` row does not count.
- T-PLT-X06-3 (path coverage) every recording path is exercised with a policy that refuses
  everything: send, bulk, create-as-sent, the auto job, and each vertical endpoint that records
  (a contract test the verticals join) — none records a row.
- T-PLT-X06-4 (DB) two `due` rows for two sources, same party and day, both insert; a rerun of the
  same candidate conflicts and writes nothing; `NULLS NOT DISTINCT` keeps today's party auto rows
  unique.
- T-PLT-X06-5 (unit) BR-7 trade figure in text and snapshot.
- T-PLT-X06-6 (template) forbidden-words test over lending's templates (the list lives in lending).
- T-PLT-X06-7 (settings) narrowing accepted; widening 400; below one hour 400.
- T-PLT-X06-8 (migration) forward and reverse of 0007 on a database with existing auto rows.
- T-PLT-X06-9 (e2e, `e2e/ledger.mjs` reminders section) a refusal after the window renders the next
  time and records nothing (assert the network: no POST reached `/send`).

#### 13. Edge cases
1. EC-1 The due is paid between the list load and the send → the source reports it closed; send
   returns 409 `due_not_open` (from the source) and nothing is recorded.
2. EC-2 A tenant in another timezone → windows are tenant-local (`apps/common/dates.py:18-27`).
3. EC-3 The recipient relation was ended yesterday → the party is the recipient again.
4. EC-4 A module switched off → its tab and candidates disappear; its history rows stay and are
   read-only.
5. EC-5 A party with `sms_opt_in=false` → SMS channel refused as today; WhatsApp manual allowed.
6. EC-6 The auto job at 09:00 for a policy window starting 10:00 → `scheduled_for` 10:00; the send
   job re-checks at send time.

#### 14. Future
Closed days suppress module reminders; a global window for all modules (owner decision); read
receipts if a provider is ever paid for (DEC-012 changing).

---

### PLT-X07 — Number kinds and the never-resetting counter

#### 1. Product requirements
A library's accession register and a member-code series never reset and never reuse a number, and
a library continues its paper register from the next number (library §6.8). `allocate_number`
always keys and prints by financial year (`apps/platform_app/services/sequences.py:38-62`). ADR-051
adds a `perpetual` mode to the same allocator and lets modules register their number kinds, which
then appear on the numbering settings screen only when the module is on.

#### 2. User flows
1. **Settings → Numbering**: the existing table gains the registered kinds of enabled modules
   ("Loan", "Member code", "Accession number"), with a "Never resets" caption on perpetual rows and
   no reset toggle on them. Prefix and padding are editable; "Next number" can be raised and never
   lowered.
2. **Import** (e.g. library copies with typed accession numbers): after the import, the counter
   stands at the highest imported number + 1.
3. **Create** a member or copy: the form pre-fills the proposed next number (`peek_counter`); a
   typed number is allowed when the module allows it; saving allocates or raises.

#### 3. Features
Minimum: `register_number_kind`, `allocate_counter`, `peek_counter`, `raise_counter`; `fy_label='*'`
rows; settings view of registered kinds; `counter.raised` audit; the six kinds of contracts §1.7
registered by their modules. Later: per-branch series; a yearly-reset option for member codes.

#### 4. Entities and relationships
`platform_document_sequence` (existing, `apps/platform_app/models/settings.py:60-90`) holds one row
per `(tenant, kind, fy_label)`; a perpetual kind has exactly one row with `fy_label = '*'`. A number
kind is a registry entry `(kind → module, mode, default_prefix, padding, label_id)`.

#### 5. Database
No schema change: `kind varchar(24)`, `fy_label varchar(9)`, `prefix varchar(12)`, `next_number
integer ≥ 1`, `padding smallint`, `uq_document_sequence (tenant, kind, fy_label)` already fit.
A CHECK is added to make the sentinel safe: `ck_sequence_fy_label CHECK (fy_label = '*' OR
fy_label ~ '^[0-9]{4}-[0-9]{2}$')` (migration `platform_app/0012_sequence_fy_label_check.py`,
validated against existing rows first; reversible).

#### 6. API
Python, contracts §1.7, with these semantics:
- `register_number_kind(kind, *, module, mode, default_prefix, padding, label_id)`: idempotent by
  kind; a conflicting re-registration raises `ImproperlyConfigured`; `len(kind) ≤ 24`;
  `len(default_prefix) ≤ 12`; `0 ≤ padding ≤ 10`.
- `allocate_counter(*, tenant, kind) -> str`: get-or-create the `'*'` row (the `allocate_number`
  race-safe pattern), `SELECT … FOR UPDATE`, take `next_number`, increment, return
  `prefix + str(n).zfill(padding)`. Called only for `perpetual` kinds (a `fy` kind raises
  `ImproperlyConfigured`), and `allocate_number` refuses a `perpetual` kind the same way.
- `peek_counter(*, tenant, kind) -> int` — no lock; advisory.
- `raise_counter(*, ctx, kind, next_number)` — locks the row; `next_number < current` → 409
  `sequence_backwards {current, requested}`; equal → no-op; audit `counter.raised` `{kind, before,
  after, via}`.
HTTP: the existing `GET/PUT /api/v1/tenants/current/settings` numbering block gains, per registered
kind of an enabled module, `{kind, module, mode, label_id, prefix, padding, next_number, preview,
reset_fy?}` (`reset_fy` absent for perpetual). A `PUT` that lowers a perpetual `next_number` → 409
`sequence_backwards`. No new endpoint.

#### 7. Frontend
`features/settings`: the numbering table component reads `mode` and `label_id` from the payload
(no module branching), hides the reset toggle for perpetual rows, and shows the caption. The
`useValidationSchemas()` numbering schema gains "cannot be lower than {current}".

#### 8. UI/UX
Preview examples: `M-0001` (member code), `1024` (accession, no prefix, padding 0),
`LN/26-27/0001` (loan, FY). Caption "Never resets" (Hindi "कभी रीसेट नहीं होता").
Lowering is refused inline before save and by the server.

#### 9. Validation and business rules
- **BR-1** Perpetual numbers never reset across financial years: 31 Mar and 1 Apr allocations are
  consecutive.
- **BR-2** Never lowered; never reused; a rolled-back transaction returns its number (the lock row
  is in the same transaction).
- **BR-3** The module's own unique constraint is the guarantee (for example
  `uq_library_copy_accession`); the counter only proposes (ADR-051).
- **BR-4** Import: after an import commits typed numbers, the import handler calls
  `raise_counter(next_number = max(imported) + 1)` in the import's transaction, only when that is
  higher than the current value.
- **BR-5** Locked last, like every sequence (lock order).
- **BR-6** The ignored `reset_fy = false` for FY kinds is **not** fixed here (ADR-051, 10-architecture
  §16 item 5); the settings screen keeps showing it for FY kinds as today.

Worked example (no money): accession next = 1024; allocate → "1024", next 1025. Import copies
typed 1000–1500 → counter raised to 1501. `raise_counter(1200)` → 409 `sequence_backwards
{current: 1501, requested: 1200}`. Member code prefix `M-`, padding 4: 7th member → "M-0007".

#### 10. Permissions
The numbering block is part of the PLT-06 settings resource, so it keeps that resource's existing
codenames unchanged: the PATCH/PUT requires `platform.tenant.manage` (owner,
`apps/platform_app/views/tenant.py:234`), and reading follows the settings GET as it is today.
Allocation happens inside module writes and needs no codename of its own; `raise_counter` from an
import runs under the import's own codename.

#### 11. Reports
Not applicable: numbers are printed on the module's own registers.

#### 12. Testing
- T-PLT-X07-1 (unit) BR-1 across the FY boundary with `freeze_time`.
- T-PLT-X07-2 (concurrency) 20 threads allocate a perpetual kind for one tenant: 20 distinct,
  consecutive numbers; no IntegrityError leaks.
- T-PLT-X07-3 (unit) rollback returns the number.
- T-PLT-X07-4 (unit) raise, equal no-op, lower → 409; audit row.
- T-PLT-X07-5 (unit) wrong-mode calls raise `ImproperlyConfigured`.
- T-PLT-X07-6 (settings) a registered kind of a disabled module is absent from the payload; of an
  enabled one present with `mode`.
- T-PLT-X07-7 (DB) `ck_sequence_fy_label` refuses `'2026'`; accepts `'*'` and `'2026-27'`.

#### 13. Edge cases
1. EC-1 Two tenants → independent rows (tenant in the unique key).
2. EC-2 The prefix changes mid-series → later numbers carry the new prefix; the module's unique
   constraint is on the full string or the number, as the module FRD decides.
3. EC-3 A module switched off and on → its counter row is untouched and continues.
4. EC-4 `next_number` near `2^31` → refused at raise (`integer`); a real register never gets there.

#### 14. Future
Per-branch counters (`fy_label` would then need a branch key — a new column, not a second sentinel);
yearly member-code series if a module asks.

---

### PLT-X08 — Holiday and closed-day calendar

#### 1. Product requirements
Lending needs collection days, the library's fines must skip days it was closed, gym freezes and
class sessions skip holidays, and dues may move to the next open day. ADR-055 decides one tenant
calendar in `platform_app` — weekly closed weekdays plus dated closures, with an optional per-module
override — instead of three calendars that disagree about Diwali.

#### 2. User flows
1. **Settings → Business days** (visible only when an enabled module reads the calendar): tick
   closed weekdays ("Sunday"), and per module "Library uses different days" to override.
2. **Holidays**: "Add closure" → date or range, reason ("Diwali"), "Applies to: all / Library only"
   → Save. The list shows the next 12 months; past closures stay (they explain past fines).
3. **Consumers** read it silently: the dues run's `closed_day_rule`, library fine counting,
   attendance session generation.

#### 3. Features
Minimum: `platform_closed_day`; `calendar.closed_weekdays` setting with module overrides; `is_open`,
`next_open_day`, `closed_days_between`; CRUD API with range add; calendar reader registry to decide
visibility. Later: imported public-holiday lists per state; half days.

#### 4. Entities and relationships
`platform_closed_day` rows belong to a tenant and optionally to one module; weekly rules are a
setting row. A reader is a registry entry (module code) used only for screen visibility.

#### 5. Database
**Migration `platform_app/0013_closed_day.py`:**

| Column | Type | Notes |
|---|---|---|
| TenantModel columns | | |
| `date` | `date NOT NULL` | tenant-local business date |
| `reason` | `varchar(60) NOT NULL` | "Diwali" |
| `module` | `varchar(32) NULL` | null = every module |

`uq_closed_day UNIQUE NULLS NOT DISTINCT (tenant_id, date, module)`;
`ix_closed_day_range (tenant_id, date)`. Hard-deleted (configuration, not evidence); every change
audited (`calendar.closed_day.created|deleted`). Registered in `platform_app/tenant_data.py`.

Setting (PLT-06 schema, section "Business days"): key `calendar.closed_weekdays`, value
`{"value": [6], "modules": {"library": [0, 6]}}` (0 = Monday), default `{"value": [], "modules": {}}`.

#### 6. API
| Method | Path | Codename | Body / query | 2xx |
|---|---|---|---|---|
| GET | `/api/v1/calendar/closed-days?from=&to=&module=` | any active member | range ≤ 400 days | `{data: [{id, date, reason, module}], meta: {closed_weekdays, module_weekdays}}` |
| POST | `/api/v1/calendar/closed-days` | `platform.calendar.manage` | `{from, to?, reason, module?}` (to ≥ from, ≤ 31 days) | 201 `{data: [rows], meta: {skipped_existing: n}}` |
| DELETE | `/api/v1/calendar/closed-days/{id}` | `platform.calendar.manage` | — | 204 |
Weekdays are edited through `PUT /tenants/current/settings` (`platform.tenant.manage`, existing) or
the calendar screen's `PUT /api/v1/calendar/weekdays` (`platform.calendar.manage`)
`{value: [6], modules: {...}}`.
Errors: 400 `validation_error` (`to < from`, range > 31 days, reason empty or > 60, unknown or
disabled module, all seven weekdays closed); 404 other tenant's id.

Python (contracts §1.8): `is_open(tenant, on, *, module=None)`, `next_open_day(tenant, on, *,
module=None)` (returns `on` if open; searches ≤ 366 days, then raises `ImproperlyConfigured` —
unreachable because seven closed weekdays are refused), `closed_days_between(tenant, start, end, *,
module=None) -> set[date]` over `[start, end]` inclusive, one query. Plus
`register_calendar_reader(module)` for visibility.

#### 7. Frontend
`features/settings/components/BusinessDaysSection.tsx` (weekday toggles, module overrides) and
`ClosedDaysList.tsx` + `ClosedDayDialog.tsx` (`dynamic()`); `api/calendarService.ts`;
`calendarSlice` lazily injected. The section renders only when `GET /auth/me` reports a calendar
reader among `enabled_modules` (the server includes `calendar_readers` in the session payload).

#### 8. UI/UX
`UbDateRangePicker` for the range; weekday chips Mon–Sun in the tenant locale; closures listed
grouped by month, "Library only" tag for module rows. Hindi "छुट्टी", "बंद दिन".

#### 9. Validation and business rules
- **BR-1** A date is closed for module `m` when (its weekday ∈ `modules[m]` if `m` has an override,
  else ∈ `value`) **or** a row exists with `module IS NULL` or `module = m`.
- **BR-2** Not every weekday may be closed (for the tenant or any module override).
- **BR-3** A range add skips dates that already have the same `(date, module)` row and reports the
  count.
- **BR-4** The calendar never rewrites history: a closure added for a past date changes no posted
  due, fine or mark; consumers read it when they next compute (a library fine computed at return
  time reads it then).
- **BR-5** All dates are tenant-local.

Worked example: Sundays closed (`value: [6]`) and a tenant-wide closure on Mon 12 Oct 2026
("Local holiday"). A book due Sat 10 Oct is returned Sat 17 Oct: calendar days late 11–17 Oct = 7;
`closed_days_between(11 Oct, 17 Oct)` = {Sun 11 Oct, Mon 12 Oct}; open days late = 5. At a fine of
₹2.00 (200 p) per open day that is 1000 p (₹10.00). The per-day rule is the library's; this is the
calendar input it reads.

#### 10. Permissions
`platform.calendar.manage` is a **new** core codename (owner, admin; pending CQ-25), declared in
`permissions_registry.py` and added to canon §0.9 by CR (with the module codenames).

| Action | Codename | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Read closed days | active membership | ✅ | ✅ | ✅ | ✅ |
| Add / delete closures, set weekdays | `platform.calendar.manage` | ✅ | ✅ | ❌ | ❌ |

#### 11. Reports
Not applicable (the calendar is an input; module reports print "closed" in grids from it).

#### 12. Testing
- T-PLT-X08-1 (unit) BR-1 matrix: tenant weekday, module override, tenant row, module row.
- T-PLT-X08-2 (unit) `next_open_day` over a run of closures and a weekend; returns `on` when open.
- T-PLT-X08-3 (query budget) `closed_days_between` over a year is one query.
- T-PLT-X08-4 (API) range add, skip existing, > 31 days 400, all-weekdays 400, cross-tenant 404.
- T-PLT-X08-5 (visibility) with no reader module enabled the section is absent (component and
  `GET /auth/me`).

#### 13. Edge cases
1. EC-1 A module override identical to the tenant default → stored as given; harmless.
2. EC-2 A closure deleted after fines were computed → past fines unchanged (BR-4).
3. EC-3 Year boundary in `closed_days_between` → inclusive range handles it.

#### 14. Future
State public-holiday presets (data, not a dependency); half-day closures (`closes_at time`).

---

### PLT-X09 — Recurrence, period and rounding primitives

#### 1. Product requirements
All three engines need one tested implementation of "every month on the 31st" that does not drift,
of a period with a label a customer can read ("Rent for Oct 2026"), and of rounding in which the
last instalment absorbs the residue so Σ instalments = total exactly (ADR-055, shared-engines §1).
`dateutil` is excluded (ADR-021). These are pure code in `common` and hold no rows.

#### 2. User flows
None directly. Every schedule preview, session list and pro-rata slip shows their output.

#### 3. Features
Minimum: `Recurrence` + `occurrences()`; `Period` + `period_label()` + `period_after()`;
`round_amount()`, `split_total()`; validation helpers; the storage convention (typed columns plus
`date[]`) with a Django mixin `RecurrenceFields` for engine models. Later: escalation rules
(+5% yearly) as a separate value object.

#### 4. Entities and relationships
Value objects only. `RecurrenceFields` (abstract model mixin in `apps/common/db/recurrence.py`)
supplies the columns an engine table stores and `.recurrence` / `.set_recurrence()`.

#### 5. Database
No table. The persisted form (ADR-055) that engine tables include through `RecurrenceFields`:

| Column | Type | Constraint |
|---|---|---|
| `freq` | `varchar(8) NOT NULL` | `IN ('once','daily','weekly','monthly','yearly')` |
| `interval` | `smallint NOT NULL DEFAULT 1` | `BETWEEN 1 AND 366` |
| `by_weekday` | `smallint NOT NULL DEFAULT 0` | `BETWEEN 0 AND 127` |
| `by_month_day` | `smallint NULL` | `= -1 OR BETWEEN 1 AND 31` |
| `anchor` | `date NOT NULL` | |
| `count` | `integer NULL` | `BETWEEN 1 AND 1000` |
| `until` | `date NULL` | `>= anchor` |
| `explicit_dates` | `date[] NOT NULL DEFAULT '{}'` | |
The CHECKs are declared on the mixin so every including table gets them (constraint names prefixed
by the table). Never JSON.

#### 6. API
Python, contracts §1.8, with `@dataclass(frozen=True, kw_only=True)` (pending CQ-12):
```python
occurrences(rule, *, start, end, limit=1000) -> list[date]   # dates d with start <= d < end, ascending
next_occurrence(rule, *, after: date) -> date | None          # first d > after
period_after(rule, occurrence: date) -> Period                # [occurrence, next occurrence)
period_label(period, *, style, locale) -> str                 # style: month | range | quarter | fy | day
round_amount(value, rule) -> Decimal                          # paise | rupee | rupee_up | ten_up
split_total(total, parts, *, rule) -> list[Decimal]           # last absorbs residue
weekday_mask(weekdays: Iterable[int]) -> int                  # 0=Mon list -> bitmask; and mask_weekdays()
```
`validate_recurrence(rule) -> dict[str, list[str]]` returns field errors keyed as the API reports
them (`recurrence.by_month_day`), for engines to merge into their 400.

#### 7. Frontend
`src/utils/recurrence.ts`: `describeRecurrence(rule, locale)` for labels only ("Every month on the
31st", "Mon, Wed, Fri"). The client never computes occurrences; previews come from the server.

#### 8. UI/UX
Labels: month style "Oct 2026" (Hindi "अक्टू 2026"); range "12 Oct – 11 Nov 2026"; quarter "Q3
FY 2026-27"; day "12 Oct 2026". Clamped dates are shown as they fall ("28 Feb"), never as the anchor.

#### 9. Validation and business rules
- **BR-1** Monthly/yearly clamping to the anchor day: day D in a shorter month falls on its last
  day; the next month returns to D (no drift). `by_month_day = -1` is always the last day.
- **BR-2** Yearly anchored on 29 Feb falls on 28 Feb in non-leap years and 29 Feb in leap years.
- **BR-3** Weekly: `interval` weeks counted from the Monday of the anchor's week; `by_weekday = 0`
  means the anchor's weekday.
- **BR-4** `explicit_dates` non-empty replaces the rule: `freq` must be `once` and the dates are
  returned sorted and unique within `[start, end)`.
- **BR-5** `count` and `until` may both be set; the first reached ends the series.
- **BR-6** `occurrences` never returns more than `limit`; a request that would exceed it raises
  `ValueError` (callers materialise in windows).
- **BR-7** `round_amount`: `paise` = 2 dp half-up; `rupee` = whole rupee half-up; `rupee_up` = next
  whole rupee (ceiling) unless already whole; `ten_up` = next multiple of ₹10 unless already one.
- **BR-8** `split_total(total, parts, rule)`: `parts` an int (equal) or weights; each part but the
  last is `round_amount(total × wᵢ/Σw, rule)`; the last is `total − Σ others`; if the last would be
  negative, `ValueError`. Σ parts = total **exactly**, always.
- **BR-9** Every date is a tenant-local `date`; the primitives never read a clock.

**Worked examples.**
- Monthly, anchor 31 Jan 2026: 31 Jan, 28 Feb, 31 Mar, 30 Apr, 31 May 2026; in 2028: 29 Feb.
- Yearly, anchor 29 Feb 2028: 28 Feb 2029, 28 Feb 2030, 28 Feb 2031, 29 Feb 2032.
- Weekly Mon/Wed/Fri: `by_weekday = 1 + 4 + 16 = 21`.
- `split_total(₹10,000.00 = 1000000 p, 3, rule="rupee")` → 333300, 333300, **333400** p
  (₹3,333 + ₹3,333 + ₹3,334). With `rule="paise"` → 333333, 333333, **333334** p.
- `split_total(₹60,000.00 = 6000000 p, [40, 30, 30], rule="rupee")` → 2400000, 1800000, 1800000.
- `round_amount`: ₹1,234.50 (123450 p) `rupee` → 123500; ₹1,234.49 → 123400; ₹1,234.01 `rupee_up`
  → 123500; ₹1,231.00 `ten_up` → 124000; ₹1,240.00 `ten_up` → 124000.
- Pro-rata input (used by DUE-04): ₹1,200.00 (120000 p) × 20/31 = 77419.35… p → `rupee` → 77400 p.

#### 10. Permissions
Not applicable (pure code).

#### 11. Reports
Not applicable.

#### 12. Testing
Property tests are seeded `random.Random` fuzz loops (no `hypothesis`, ADR-021), the LED-04 pattern.
- T-PLT-X09-1 (unit) every worked example above.
- T-PLT-X09-2 (property) for 10,000 random monthly/yearly rules over 2000–2100: no two occurrences
  equal; ascending; each occurrence's day = min(anchor day, month length); the series never drifts
  (the k-th occurrence equals a direct computation from the anchor, not from the previous one).
- T-PLT-X09-3 (property) `split_total` for random totals (0–₹99,99,999.99), part counts 1–120 and
  random weights: Σ = total exactly; every part ≥ 0 or `ValueError`; last differs from the others by
  less than one rounding unit × parts.
- T-PLT-X09-4 (unit) BR-4, BR-5, BR-6.
- T-PLT-X09-5 (unit) labels in `en` and `hi`.
- T-PLT-X09-6 (import) `apps/common/recurrence.py`, `periods.py` import nothing from `apps.*`.
- T-PLT-X09-7 (DB) the mixin's CHECKs on a test model refuse bad values.

#### 13. Edge cases
1. EC-1 `start > end` → empty list. 2. EC-2 `until` before `start` → empty. 3. EC-3 A zero total
split → all zeros. 4. EC-4 Weekly with `interval = 2` and an anchor on a Sunday → weeks counted from
that Monday. 5. EC-5 `count = 1` → one occurrence, the anchor (or clamped anchor).

#### 14. Future
Escalation value object (percent or new amount from a date, never retroactive); business-day
recurrence ("the 5th working day") on top of PLT-X08.

---
### PLT-X10 — Engine enablement and module-off guards with open-record checks

#### 1. Product requirements
Engines have no module code and no switch (ADR-041): an engine is on when an enabled module uses it.
A module with **open** records — an active loan, a copy out, a held deposit, a live booking, an
open due — cannot be switched off, with the count; closed history never blocks, switching off
deletes nothing, and switching back on restores everything (10-architecture §9, PLT-06 BR-4). One
rule for every module: this overrides lending research EC-13.

#### 2. User flows
1. **Settings → Features → switch a module off** (`ModuleToggleList.tsx`): 409 `module_has_data`
   swaps the row into "Library still has 3 books out and 2 deposits held. Close them first." with the
   breakdown, instead of today's single count.
2. **Switch a module on**: its dependencies must already be on (the refusal stays); its preset seed
   runs once, idempotently, for that module only.
3. **Engine endpoints**: a tenant without gym gets 403 `module_disabled {module: "attendance"}` from
   `/api/v1/attendance/...`; with gym on, the endpoint answers only gym rows.

#### 3. Features
Minimum: `MODULE_DEPENDENCIES` entries; `ENGINES_USED_BY`; `engine_enabled`,
`enabled_modules_using`; `EngineEnabled`; idempotent, labelled module-off counters; one counter per
(engine, consuming module); a held-deposit counter per module; the breakdown in the 409; an
enable hook for presets (pending CQ-14). Later: the onboarding checklist that switches dependencies
on automatically (ships with the first released vertical, 10-architecture §13.2).

#### 4. Entities and relationships
No table. Two maps in `apps/platform_app/services/tenant_settings.py` (strings only, L4) and two
registries in `apps/platform_app/services/guards.py`.

#### 5. Database
None. Every counter reads an existing index: the engines' `(tenant, module, status…)` indexes
(DUE-01, ATT-02, BKG-03) and `ix_deposit_module_open` (PLT-X02).

#### 6. API
Python (contracts §1.1, plus the additive keyword of CQ-13):
```python
MODULE_DEPENDENCIES: dict[str, frozenset[str]]   # 10-architecture §2.3
ENGINES_USED_BY: dict[str, frozenset[str]]       # lending: dues; library: dues; gym: dues, attendance;
                                                 # hospitality: bookings, dues
def engine_enabled(tenant, engine: str) -> bool
def enabled_modules_using(tenant, engine: str) -> frozenset[str]   # ∩ effective_modules(tenant)
def EngineEnabled(engine: str) -> type[BasePermission]             # 403 module_disabled, details.module=engine
def register_module_off_guard(module, counter, *, label_id: str | None = None) -> None  # idempotent
def module_off_blockers(tenant, module) -> list[dict]              # [{label_id, count}] with count > 0
def register_module_enable_hook(module, hook: Callable[[Ctx, tenant], None]) -> None    # CQ-14
```
`blocking_rows_for_module_off` stays and sums `module_off_blockers`.

HTTP: `PATCH /api/v1/tenants/current {enabled_modules}` (existing, `platform.tenant.manage`):
409 `module_has_data` `details: {module, count, breakdown: [{label_id, count}]}` (additive key).
Engine read endpoints: `EngineEnabled("<engine>")` then a HasPermission that passes when the
member holds `<m>.<resource>.read` for **any** `m` in `enabled_modules_using(tenant, engine)`;
querysets filter `module__in=enabled_modules_using(...)`.

Registered counters (each by its owner):

| Module switched off | Counter (owner) | Counts |
|---|---|---|
| each of lending, library, gym, hospitality | the vertical's own | 10-architecture §9 table |
| each module in `ENGINES_USED_BY` with `dues` | dues | schedules `active`/`paused` + dues `due`/`overdue` with that `module` |
| … with `attendance` | attendance | open visits (`check_out_at IS NULL`, not voided) with that `module` |
| … with `bookings` | bookings | bookings `hold` (unexpired), `confirmed`, `checked_in` with that `module` |
| every module | payments | deposits `status <> 'released'` with that `module` |

#### 7. Frontend
`ModuleToggleList.tsx` renders `breakdown` rows (label from the module's catalogue); no other
change. Engines have no toggle and never appear in Settings.

#### 8. UI/UX
The refusal names each open thing and its count and the next step; it never says "not allowed"
alone. Dependencies are named in words ("Gym needs Invoices, Payments and Parties.").

#### 9. Validation and business rules
- **BR-1** `engine_enabled(t, e) ⇔ ∃ m ∈ effective_modules(t) with e ∈ ENGINES_USED_BY[m]`.
- **BR-2** Engine reads show only rows whose `module` is enabled; a switched-off module's rows
  never appear in a cross-module list.
- **BR-3** Switching off refuses on the **sum** of open-record counts > 0; closed rows never count.
- **BR-4** A module cannot be switched off while an enabled module depends on it (existing check).
- **BR-5** Registration is idempotent by `(module, counter)` identity (today's `guards.py`
  appends — fixed here, with a test).
- **BR-6** The enable hook runs inside the switching transaction, after the dependency check, for
  newly enabled modules only; it must be idempotent (a second enable is a no-op).

Worked example: library off with 3 copies out, 2 deposits held (₹500.00 + ₹300.00 = 80000 p held)
and 0 open dues → 409 `{module: "library", count: 5, breakdown: [{label_id:
"library.off.copiesOut", count: 3}, {label_id: "payments.off.depositsHeld", count: 2}]}`. Money is
never summed into the count; the deposits panel shows the ₹800.00.

#### 10. Permissions
Unchanged: switching modules is `platform.tenant.manage` (owner). Engine reads: any consuming
module's read codename (above).

#### 11. Reports
Not applicable.

#### 12. Testing
- T-PLT-X10-1 (contract) every registered module-off counter returns 0 for an empty tenant and the
  right count for open rows only (closed rows seeded alongside).
- T-PLT-X10-2 (unit) BR-1 truth table over `ENGINES_USED_BY` with the test module `test`.
- T-PLT-X10-3 (API) engine endpoint 403 with no consumer; 200 with one; rows of a disabled second
  consumer filtered out.
- T-PLT-X10-4 (unit) BR-5: registering the same counter twice counts once.
- T-PLT-X10-5 (unit) enable hook idempotent; runs once on enable, not on an unrelated PATCH.
- T-PLT-X10-6 (API) breakdown present and sums to `count`.

#### 13. Edge cases
1. EC-1 Two modules use `dues`; switching one off with the other's dues open → allowed (counts are
   per module).
2. EC-2 A module switched off by the nightly `reconcile_entitlements` (plan downgrade) → it bypasses
   the guard as today; data is kept; engine reads hide the rows.
3. EC-3 A counter raises → the PATCH fails as a 500 in tests (a guard must never raise).

#### 14. Future
Onboarding checklist with automatic dependency switching (shared-engines §5.2); `nav.primary_module`.

---

### PLT-X11 — `UNRELEASED_MODULES` and the release data migration

#### 1. Product requirements
A module code must land with its app's first migration, but `modules_view` lists every
`ModuleCode` except `help` (`tenant_settings.py:145-150`), so a code added early would show a locked
"Gym" row — an unbuilt feature on screen (vision §4). ADR-041 hides new codes behind
`UNRELEASED_MODULES` until each module's release CR, and ships a data migration at release so the
module is on somebody's plan.

#### 2. User flows
None for merchants: an unreleased module does not exist for them. Developers, CI and the e2e stack
set `UB_UNRELEASED_MODULES=1` and can enable it. At release the CR removes the code from the set
and ships the plan/partner migration; the module appears in Features the next deploy.

#### 3. Features
Minimum: the four `ModuleCode` values; `UNRELEASED_MODULES`; `released_modules()`; the env flag in
`env_catalogue.py` and `.env.example`; the gates in `modules_view`, `update_enabled_modules`,
`ModuleEnabled` and `effective_modules` (pending CQ-10); the frontend `MODULE_CODES` replacement and
its equality test; the release data-migration template. Later: nothing.

#### 4. Entities and relationships
Constants only. Plan rows (`platform_plan.modules`) and partner rows (`allowed_modules`) are data.

#### 5. Database
No schema change. **Release data migration template** (one per module, in the vertical app,
`<app>/migrations/00NN_release.py`, `RunPython` with a working reverse, `apps.get_model` only):
```python
MVP_BEFORE = (...)   # the MVP_MODULES tuple of the day before, written out literally
def forwards(apps, schema_editor):
    Plan = apps.get_model("platform", "Plan"); Partner = apps.get_model("platform", "Partner")
    for plan in Plan.objects.filter(code__in=MVP_PLAN_CODES):
        if CODE not in plan.modules: plan.modules = [*plan.modules, CODE]; plan.save(update_fields=["modules"])
    for partner in Partner.objects.all():
        if set(MVP_BEFORE) <= set(partner.allowed_modules) and CODE not in partner.allowed_modules:
            partner.allowed_modules = [*partner.allowed_modules, CODE]; partner.save(update_fields=["allowed_modules"])
def backwards(apps, schema_editor): ...  # removes CODE from the same rows
```
The same CR adds `CODE` to `seed_plans.MVP_MODULES` (`seed_plans.py:30`), so a fresh database and
an old one converge.

#### 6. API
- `UNRELEASED_MODULES: frozenset[str] = frozenset({"lending", "library", "gym", "hospitality"})` in
  `apps/platform_app/constants.py`.
- `released_modules() -> frozenset[str]`: all codes minus `UNRELEASED_MODULES`, unless
  `settings.UB_UNRELEASED_MODULES` is true.
- `GET /tenants/current/settings` `modules` block: unreleased codes absent from `enabled`,
  `available`, `locked`.
- `PATCH /tenants/current {enabled_modules: ["gym"]}` → 400 `validation_error`
  `{enabled_modules: ["'gym' is not included in your plan."]}` (the existing message).
- `ModuleEnabled("gym")` → 403 `module_disabled` for an unreleased code.
- `GET /auth/me` `enabled_modules` / `plan_limits.modules` never list an unreleased code.

#### 7. Frontend
`src/types/domain.types.ts` `MODULE_CODES` becomes the server's list: remove `loans` and
`accounting`, add `team`, `lending`, `library`, `gym`, `hospitality` (10-architecture §6 item 3).
A test (`tests/moduleCodes.test.ts`) compares it with `backend/apps/common/constants.py`'s
`ModuleCode` values, read the way the error-code equality test reads the registry. No UI gate:
the server never reports an unreleased code.

#### 8. UI/UX
Nothing visible. `features/landing/config/modules.ts` status is independent (vision §4) and is
not read by the app.

#### 9. Validation and business rules
- **BR-1** An unreleased code is absent from every server response that lists modules.
- **BR-2** An unreleased code cannot be enabled through the API, whatever the plan says.
- **BR-3** `UB_UNRELEASED_MODULES=1` is refused at start-up when `UB_DEBUG` is false and the
  environment is not `ci`/`e2e` (a check in `config/settings`), so production cannot show one.
- **BR-4** Release = remove from the set + data migration + `MVP_MODULES`, in one commit.

#### 10. Permissions
Not applicable (no new action). A module's codenames exist in the registry from its first commit;
`permissions_for` drops them while the module is not effective.

#### 11. Reports
Not applicable.

#### 12. Testing
- T-PLT-X11-1 (unit) `modules_view` without the flag lists no unreleased code; with it, lists them.
- T-PLT-X11-2 (API) enabling an unreleased code → 400; `ModuleEnabled` → 403.
- T-PLT-X11-3 (settings) BR-3 start-up refusal.
- T-PLT-X11-4 (migration) the template's forwards/backwards on a partner with and without
  `allowed_modules ⊇ MVP_BEFORE`.
- T-PLT-X11-5 (frontend) `MODULE_CODES` equality test.
- T-PLT-X11-6 (architecture) `test_operator_surface.py` knows the new env variable
  (`test_env_example.py`).

#### 13. Edge cases
1. EC-1 A dev database with gym enabled, then the flag removed → gym disappears from responses;
   data stays; the flag back restores it.
2. EC-2 A custom partner without the MVP set → does not gain the module (deliberate: partners opt in).

#### 14. Future
Per-partner early access (a partner flag instead of the global env) if a partner pilots a module.

---

### PLT-X12 — Row scoping and module roles

#### 1. Product requirements
A collection agent sees only loans on their routes; a trainer only their members, without fees or
mobile numbers; housekeeping only rooms and today's arrivals and departures. Nothing in core scopes
below the tenant, and `staff` holds tenant-wide core reads (`permissions_registry.py:70-90`), so a
scope applied only to a vertical's tables would leak through `/parties`. ADR-052: a scoped person
holds a **module role** whose codenames exclude every tenant-wide core read, and the vertical's
viewsets apply a required, fail-closed `scope_filter()`.

#### 2. User flows
1. **Team → Add member**: the role picker lists owner, admin, staff, accountant and — only while
   the module is enabled — its module roles ("Collection agent", "Trainer", "Housekeeping").
2. **Assignment** happens in the vertical (a route's agents, a batch's trainer).
3. **Scoped member signs in**: the navigation shows only what their codenames allow (the existing
   `useNavigation()` filter); an out-of-scope id typed into the URL is "not found".

#### 3. Features
Minimum: `ScopedViewSetMixin`, `RestrictedFieldsMixin`; `register_module_role` in the permission
registry and module-role rows; team screen offers them per enabled module; `read_all` codenames;
architecture test that every vertical viewset is scoped or declares why not. Later: tenant-defined
custom roles (PLT-12) built on the same rows.

#### 4. Entities and relationships
`platform_role` rows with `tenant = NULL`, `is_system = True`, `code = "<module>_<role>"`
(`apps/platform_app/models/membership.py:13-31`), owned by the module; `platform_membership.role`
points at them as at any role. Assignments are vertical tables.

#### 5. Database
No schema change. Each vertical's data migration inserts its role rows (idempotent upsert by
`code` where `tenant IS NULL`), with `permissions` = the registered set, so `GET /roles` can serve
them; the existing test that `platform_role` rows equal `ROLE_PERMISSIONS` extends to them.

#### 6. API
```python
# apps/common/scoping.py  (contracts §3)
class ScopedViewSetMixin:
    scope_all_permission: str
    def scope_filter(self, request) -> Q: raise NotImplementedError
    # get_queryset(): tenant queryset, then .filter(self.scope_filter(request)) unless the member
    # holds scope_all_permission
class RestrictedFieldsMixin:
    restricted_fields: dict[str, str]   # field -> codename; the key is absent from output without it

# apps/common/permissions_registry.py
def register_module_role(code: str, *, module: str, label_id: str, permissions: frozenset[str]) -> None
```
`permissions_for` resolves a system role through `ROLE_PERMISSIONS` **or** the module-role
registry (today it indexes `ROLE_PERMISSIONS[role.code]` and would raise `KeyError`). A module
role's set is validated at registration: every codename must belong to the role's own module
(`MODULE_OF[c] == module`); no core codename is allowed, not even `ledger.reminder.write` — a
module role reaches reminders, receipts and parties only through its vertical's endpoints, which
serve a scoped projection. `GET /api/v1/roles` lists module roles of
enabled modules only. `POST /tenants/current/members` with a module role of a disabled module → 400
`validation_error {role: ["This role belongs to a feature that is off."]}`.

#### 7. Frontend
`features/team`: `AddMemberDialog` and `MemberRow` render roles from `GET /roles` (no hard-coded
four); a module role shows its module as a caption. No other change: navigation and screens are
already permission-driven.

#### 8. UI/UX
Role names in plain words; a caption says what the role cannot see ("Cannot see money or phone
numbers"), from the module's catalogue.

#### 9. Validation and business rules
- **BR-1** `scope_filter` is required; a viewset using the mixin without overriding it raises on
  first request (fail closed).
- **BR-2** Out-of-scope object ids are **404**, never 403 (ADR-032).
- **BR-3** A module role never holds `parties.party.read`, `ledger.entry.read`,
  `payments.payment.read`, `reports.*` or any `read_all` (contracts §3 table).
- **BR-4** `<module>.<resource>.read_all` is held by owner and admin by default and **explicitly**
  by accountant (the accountant set is built from `.endswith(".read")`, which does not match
  `.read_all`, `permissions_registry.py`).
- **BR-5** Business ceilings (waive above a limit, refund, write off, credit override) stay **role
  checks** on owner/admin; a module role can never reach them by codename (the LED-03 rule).
- **BR-6** A module switched off → its roles' codenames vanish through `permissions_for`'s module
  gating; the member keeps the membership and can do nothing until it is back on; the team screen
  shows "Role inactive while <module> is off".
- **BR-7** Restricted fields are removed from list, detail, export and share-link serializers alike
  (ADR-053 ID fields are restricted fields).

Worked example (no money): trainer Anil is assigned batch "Morning 6 am". `GET /gym/members`
returns the 14 members of that batch without `mobile` and without any fee figure;
`GET /gym/members/<Sita's id>` for a member of another batch → 404; `GET /parties` → 403
`permission_denied` (no `parties.party.read`).

#### 10. Permissions
Module role sets are the verticals' (their FRDs); this feature adds only `register_module_role`
and the registry rules above. The three roles need the owner's confirmation and a canon §0.9 CR
(10-architecture §16 item 1).

#### 11. Reports
Not applicable. Scoped members see no core reports (BR-3).

#### 12. Testing
- T-PLT-X12-1 (unit) the mixin without `scope_filter` → raises; with it, filters; `read_all` bypasses.
- T-PLT-X12-2 (API, per scoped viewset) out-of-scope id → 404; the test asserts **who is signed
  in** before anything else (CLAUDE.md harness lesson).
- T-PLT-X12-3 (unit) every registered module role excludes the BR-3 codenames.
- T-PLT-X12-4 (unit) `permissions_for` for a module role; for that role when the module is off → ∅.
- T-PLT-X12-5 (architecture) every viewset in `apps/{lending,library,gym,hospitality}` extends
  `ScopedViewSetMixin` or declares `scope_exempt = "<reason>"`.
- T-PLT-X12-6 (serializer) restricted fields absent without the codename in list, detail and CSV.
- T-PLT-X12-7 (e2e, per vertical harness) a scoped login in its own browser context (the
  `ctx`-sharing defect) sees only its slice.

#### 13. Edge cases
1. EC-1 A person who is both a trainer and a staff member → one membership, one role; the owner
   picks; custom combined roles wait for PLT-12.
2. EC-2 An agent removed from a route mid-day → their next request no longer sees it (no cache).
3. EC-3 A scoped member opening a share link → share links are public by token and carry no
   restricted field anyway.

#### 14. Future
Tenant custom roles (PLT-12) absorbing module roles as presets; Postgres row-level security as
defence in depth (ADR-032 deferred).

---

### PLT-X13 — Registries: schedules, dashboard sections, reports and notification types

#### 1. Product requirements
Four places where core would otherwise edit a literal for every module (ADR-042): the scheduler's
`SCHEDULES` list (`apps/common/jobs.py:398`), the dashboard, the reports hub and the in-app
notification `REGISTRY` (`apps/notifications/services/notify.py:72`). Each becomes a registry that
modules fill from `ready()`; today's behaviour is re-expressed through the same registries so
nothing changes for existing tenants.

#### 2. User flows
- **Dashboard** (`/dashboard`): module sections appear below the core tiles, in `order`, only for
  enabled modules and held permissions.
- **Reports hub** (`/reports`): lists only registered, built reports the member may read, grouped
  by module when two or more modules contribute.
- **Bell**: module notification types appear like core ones.

#### 3. Features
Minimum: `register_schedule`, `register_dashboard_section`, `register_report`,
`register_notification_type`; `GET /reports/dashboard` `sections`; `GET /reports` list; frontend
`dashboardSections.ts` and `reportsRegistry.ts`. Later: per-member dashboard ordering.

#### 4. Entities and relationships
Registries only. A report's output reuses the existing export machinery (`reports.export`).

#### 5. Database
None.

#### 6. API
Python, contracts §1.9. Semantics: `register_schedule` is idempotent by `job_type` and refuses a
`job_type` with no `job_handler` at the first `materialise_due_schedules`; the existing literal
entries stay in `SCHEDULES` (core's own). `register_dashboard_section(key, *, module, permission,
selector, order)`: `selector(tenant, today) -> dict` must run ≤ 3 queries (tested).
`register_report(key, *, module, permission, label_id, selector, csv)`.
HTTP:
- `GET /api/v1/reports/dashboard` gains `sections: [{key, module, order, data}]`; a failing section
  selector is logged and returned as `{key, error: "unavailable"}`, never failing the dashboard.
- `GET /api/v1/reports` → `{data: [{key, module, label_id, permission, has_csv}]}` filtered by
  enabled modules and held codenames.
- `GET /api/v1/reports/{key}?…` and `?format=csv` dispatch to the registered selector/csv
  (export throttle scope applies to CSV only, the LED-04 lesson).

#### 7. Frontend
`features/reports/dashboardSections.ts` (`registerDashboardSection(key, { module, load: () =>
import(...) })`) and `features/reports/reportsRegistry.ts`; `DashboardPageContent` renders sections
whose key the server returned. Each entry is `dynamic()`.

#### 8. UI/UX
A section is a `UbCard` titled in the module's words; an "unavailable" section shows a one-line
retry, never a blank. Headings group by module only when two or more modules contribute (the
navigation rule, 10-architecture §6 item 2).

#### 9. Validation and business rules
- **BR-1** A section or report of a disabled module is never returned.
- **BR-2** Keys are unique across modules (`<module>.<name>`); a duplicate raises at start-up.
- **BR-3** Notification type codes are `<module>.<event>`; the product sends nothing outside the app.

#### 10. Permissions
Each section and report declares its codename; the endpoint checks it per entry.

#### 11. Reports
This feature is the reports hub's mechanism; the reports themselves are each feature's §11.

#### 12. Testing
- T-PLT-X13-1 (unit) each registry idempotent, keyed, `_reset_for_tests()` restores.
- T-PLT-X13-2 (API) dashboard with a failing fake section still 200; disabled module's section absent.
- T-PLT-X13-3 (query budget) each registered dashboard selector ≤ 3 queries.
- T-PLT-X13-4 (scheduler) a registered schedule is materialised once per period; a schedule with no
  handler fails loudly in tests.

#### 13. Edge cases
1. EC-1 Two modules register the same `job_type` → `ImproperlyConfigured` at start-up.
2. EC-2 A report registered before its screen exists → not listed until the module's frontend
   registers it too (the server list is intersected with the client registry, so no dead link).

#### 14. Future
Per-member dashboard layout; scheduled report e-mails (blocked by DEC-012).

---

### PLT-X14 — Import boundaries for the new apps

#### 1. Product requirements
Verticals never import each other; engines never import each other or a vertical; core never
imports either (vision §3 rule 2, ADR-041). The existing test reads only top-level imports
(`tests/architecture/test_import_rules.py`), so a deferred import would pass it. The new apps are
checked on the whole AST.

#### 2. User flows
Not applicable (a build gate).

#### 3. Features
Minimum: the matrix of 10-architecture §10.1; `test_new_apps_never_import_sideways_even_deferred`
(`ast.walk`); `reports` keeps its current set; ESLint `no-restricted-imports` zones per vertical and
engine feature folder. Later: nothing.

#### 4. Entities and relationships
Not applicable.

#### 5. Database
None.

#### 6. API
Not applicable. The matrix, verbatim from 10-architecture §10.1, with
`CORE = {"common", "platform_app", "tax", "files", "parties", "ledger", "payments", "notifications"}`.

#### 7. Frontend
`.eslintrc` zones: `features/{dues,bookings,attendance}` may import core features and `src/`, not
each other nor any vertical nor `features/{sales,purchases,inventory,expenses}`; each vertical may
import the engines it uses and core, never another vertical nor Shop & billing.

#### 8. UI/UX
Not applicable.

#### 9. Validation and business rules
- **BR-1** For the seven new apps every `Import`/`ImportFrom` node anywhere in any `.py` file
  (tests excluded) is checked against the matrix.
- **BR-2** `apps/common/seams/documents.py` imports nothing from `apps.*`.
- **BR-3** Adding an app to `ALL_APPS` does not widen `ALLOWED["reports"]`.

#### 10. Permissions
Not applicable.

#### 11. Reports
Not applicable.

#### 12. Testing
- T-PLT-X14-1 the AST test, with a planted deferred sideways import in a fixture file proving it
  fails.
- T-PLT-X14-2 ESLint zones with a planted import in a fixture proving they fail.

#### 13. Edge cases
1. EC-1 `TYPE_CHECKING` imports count (they are imports). 2. EC-2 String references in
`apps.get_model("gym", …)` inside an engine are refused by review, not by AST (L4 permits names, not
model access); the engines' contract tests would catch the behaviour.

#### 14. Future
Nothing.

---
# Part B — The recurring dues and schedules engine (`apps/dues`)

The engine owns plans, schedules, the dues they produce, adjustments, pauses and the settlement
split; it never owns a balance (ledger), a payment (payments) or the thing a due is *for* (the
vertical's membership, loan or enrolment). It has **read endpoints only**; every write reaches it
through a vertical endpoint that checks the vertical's codename and speaks its words (ADR-041,
shared-engines Q8). Engine tests use the test-only subject `test_subject` of module `test`
(10-architecture §11).

**Engine-wide schema.** All tables of the engine are specified once in DUE-01 §5; later features
name the tables they write and any index they add.

### DUE-01 — Plans and schedules

#### 1. Product requirements
A tenant defines a plan once ("Gym monthly ₹1,200", "Library annual fee", "Loan collection plan")
and puts a party on it for a subject (a membership, a loan). The schedule snapshots the plan's
terms, so a later plan edit never rewrites a running schedule. Creating a schedule that starts in
the past shows the dues it would post and needs an explicit confirmation (shared-engines §2.4).
Two money modes (ADR-048): **charge** — each due creates what is owed on its date, by a sales
document (taxable) or a `charge` ledger line; **expectation** — the dues schedule a debt that
already exists, and only interest and fees post.

#### 2. User flows
(Screens are the vertical's; the engine supplies the preview, the confirmation and the shapes.)
1. **Create plan**: vertical settings → "New plan" → name, frequency, amount rule, grace, penalty,
   pause limits, tax (if the tenant is registered and sales is on) → Save.
2. **Start a schedule**: vertical "Start membership" → pick plan and start date → the engine's
   **preview** lists the dues (period, due date, amount) → Save.
3. **Backdated start**: start date 1 Jul, today 5 Oct → Save returns 409
   `schedule_backdated_unconfirmed` with the four past dues and their total → the confirmation
   "This adds 4 dues totalling ₹4,800 to Ramesh's balance" → Confirm → saved and posted.
4. **Supplied amounts** (lending): the vertical computes the instalments and passes them; the preview
   is the vertical's own table.

#### 3. Features
Minimum: `dues_plan` CRUD services (`create_plan`, `update_plan` affects new schedules only,
deactivate); `preview_schedule`; `create_schedule` with snapshot, join policy, window, backdated
confirmation, immediate posting of past dues; subject registry; the full engine schema; read API for
schedules. Later: escalation events; plan templates per module preset (they ship with each module's
enable hook, PLT-X10).

#### 4. Entities and relationships
```
dues_plan 1 ─── * dues_schedule 1 ─── * dues_due 1 ─── * dues_due_component
                        │                    │ 1 ─── * dues_adjustment (─ reversed_by → dues_adjustment)
                        │ 1 ─── * dues_pause │ 1 ─── * dues_settlement (payment_id → payments_payment)
                        └ party → parties_party (payer), beneficiary_party → parties_party
                        └ (subject_type, subject_id) → the vertical's row (no FK)
dues_due.document_id → sales_document (uuid, no FK: the port owns it)
dues_due.posted_entry_id, *.posted_entry_id → ledger_entry (uuid, no FK)
```

#### 5. Database
Migration `dues/0001_initial.py` depends on the Wave A migrations of `ledger`, `parties`,
`payments`, `sales` (origin columns) and `platform_app`. All tables are `TenantModel`, registered in
`apps/dues/tenant_data.py`, with the money CHECKs below.

**`dues_plan`**
| Column | Type | Constraint / note |
|---|---|---|
| `module` | `varchar(32) NOT NULL` | |
| `name` | `varchar(80) NOT NULL` | |
| `mode` | `varchar(12) NOT NULL` | `charge` \| `expectation` |
| `posting` | `varchar(8) NOT NULL` | `document` \| `ledger` \| `none` |
| recurrence columns | `RecurrenceFields` (PLT-X09) | typed, never JSON |
| `amount_rule` | `varchar(12) NOT NULL` | `fixed` \| `total_split` \| `supplied` |
| `amount` | `numeric(14,2) NULL` | fixed: per due, ≥ 0 |
| `total` | `numeric(14,2) NULL` | total_split: > 0 |
| `split_weights` | `numeric(9,4)[] NOT NULL DEFAULT '{}'` | empty = equal parts |
| `heads` | `jsonb NOT NULL DEFAULT '[]'` | `[{label, amount}]`, amounts as strings (pending CQ-15) |
| `join_policy` | `varchar(14) NOT NULL DEFAULT 'full'` | `full`\|`by_days`\|`half_rule`\|`next_period`\|`align_to_join` |
| `leave_policy` | `varchar(12) NOT NULL DEFAULT 'no_refund'` | `no_refund`\|`by_days`\|`by_sessions`\|`custom` |
| `grace_days` | `smallint NOT NULL DEFAULT 0` | 0–365 |
| `penalty_kind` | `varchar(16) NOT NULL DEFAULT 'none'` | `none`\|`flat_once`\|`percent_once`\|`per_day`\|`simple_interest` |
| `penalty_value` | `numeric(10,4) NULL` | ₹ for flat/per_day; % for percent/interest p.a. |
| `penalty_cap` | `numeric(14,2) NULL` | per due |
| `pause_max_days`, `pause_min_days`, `pause_max_count` | `smallint NULL` | per schedule year |
| `hsn_sac` | `varchar(8) NULL` | |
| `gst_rate` | `numeric(5,2) NULL` | |
| `tax_inclusive` | `boolean NOT NULL DEFAULT false` | document posting only |
| `rounding_rule` | `varchar(8) NOT NULL DEFAULT 'rupee'` | PLT-X09 rules |
| `allocation_order` | `varchar(12) NOT NULL DEFAULT 'oldest_first'` | `oldest_first`\|`fees_first`\|`fees_last` |
| `auto_apply_advance` | `boolean NOT NULL DEFAULT true` | |
| `closed_day_rule` | `varchar(8) NOT NULL DEFAULT 'ignore'` | `move`\|`skip`\|`ignore` |
| `is_active` | `boolean NOT NULL DEFAULT true` | |
| `version` | `integer NOT NULL DEFAULT 1` | |

CHECKs: `(mode='charge' AND posting IN ('document','ledger')) OR (mode='expectation' AND posting='none')`;
`(gst_rate IS NULL AND hsn_sac IS NULL) OR posting='document'` (taxable ⇒ document);
`amount_rule<>'fixed' OR amount IS NOT NULL`; `amount_rule<>'total_split' OR total IS NOT NULL`;
`(penalty_kind='none') = (penalty_value IS NULL)`; `amount >= 0`, `total > 0`, `penalty_cap >= 0`.
Unique `uq_dues_plan_name (tenant_id, module, lower(name)) WHERE is_active`.
Index `ix_dues_plan_module (tenant_id, module, is_active)`.

**`dues_schedule`**
| Column | Type | Note |
|---|---|---|
| `module` | `varchar(32) NOT NULL` | |
| `plan_id` | FK `dues_plan` RESTRICT | |
| recurrence columns | `RecurrenceFields` | copied from the plan at creation (pending CQ-15) |
| `terms` | `jsonb NOT NULL` | snapshot of every other plan field, money as strings |
| `party_id` | FK `parties_party` RESTRICT | payer |
| `beneficiary_party_id` | FK `parties_party` RESTRICT NULL | the member when a parent pays |
| `subject_type` | `varchar(48) NOT NULL` | |
| `subject_id` | `uuid NOT NULL` | |
| `start_on` | `date NOT NULL` | |
| `end_on` | `date NULL` | exclusive; null = open-ended |
| `status` | `varchar(10) NOT NULL DEFAULT 'active'` | `active`\|`paused`\|`ended`\|`cancelled` |
| `ended_reason` | `varchar(160) NOT NULL DEFAULT ''` | |
| `materialised_until` | `date NOT NULL` | last `due_on` materialised |
| `version` | `integer NOT NULL DEFAULT 1` | |

Unique `uq_dues_schedule_live_subject (tenant_id, subject_type, subject_id) WHERE status IN
('active','paused')`. Indexes `ix_dues_schedule_party (tenant_id, party_id, status)`,
`ix_dues_schedule_module (tenant_id, module, status)`,
`ix_dues_schedule_window (tenant_id, materialised_until) WHERE status IN ('active','paused')`.
CHECK `end_on IS NULL OR end_on > start_on`.

**`dues_due`**
| Column | Type | Note |
|---|---|---|
| `schedule_id` | FK RESTRICT | |
| `module` | `varchar(32) NOT NULL` | copied |
| `party_id` | FK `parties_party` RESTRICT | copied from the schedule, never changed |
| `seq` | `integer NOT NULL` | 1-based |
| `period_start`, `period_end` | `date NOT NULL` | `[start, end)` |
| `period_label` | `varchar(40) NOT NULL` | "Oct 2026" |
| `due_on` | `date NOT NULL` | after the closed-day rule |
| `amount` | `numeric(14,2) NOT NULL` | ≥ 0; the document's grand total once issued |
| `status` | `varchar(10) NOT NULL DEFAULT 'scheduled'` | `scheduled`\|`due`\|`overdue`\|`paid`\|`skipped`\|`cancelled` |
| `settled_amount` | `numeric(14,2) NOT NULL DEFAULT 0` | cache |
| `waived_amount` | `numeric(14,2) NOT NULL DEFAULT 0` | cache: live waiver, discount, proration |
| `penalty_amount` | `numeric(14,2) NOT NULL DEFAULT 0` | cache: live penalties (pending CQ-16) |
| `penalty_exempt_days` | `smallint NOT NULL DEFAULT 0` | days a later-voided payment stood (DUE-03 BR-8) |
| `paid_on` | `date NULL` | |
| `document_id` | `uuid NULL` | document posting |
| `posted_entry_id` | `uuid NULL` | ledger posting |
| `cancel_reason` | `varchar(160) NOT NULL DEFAULT ''` | |

CHECKs: `amount >= 0`, `settled_amount >= 0`, `waived_amount >= 0`, `penalty_amount >= 0`,
`settled_amount + waived_amount <= amount + penalty_amount`, `period_end > period_start`,
`NOT (document_id IS NOT NULL AND posted_entry_id IS NOT NULL)`,
`status <> 'paid' OR paid_on IS NOT NULL`.
Unique `uq_dues_due_seq (schedule_id, seq)`. Indexes (contracts): `ix_dues_due_status (tenant_id,
status, due_on)`, `ix_dues_due_party (tenant_id, party_id, due_on)`, `ix_dues_due_module
(tenant_id, module, status, due_on)`; plus `ix_dues_due_open_party (tenant_id, party_id, due_on,
seq) WHERE status IN ('due','overdue')` for the targets' FIFO.

**`dues_due_component`** — `due_id` FK RESTRICT, `component varchar(10)`
(`principal`\|`interest`\|`fee`\|`charge`), `amount`, `settled`, `waived` (`numeric(14,2)`, ≥ 0,
`settled + waived <= amount`), `posted_entry_id uuid NULL`; unique `(due_id, component)`.
Invariant (service + test): for a due with components, Σ component `amount` = due `amount`.

**`dues_adjustment`** — `due_id` FK RESTRICT, `kind varchar(10)`
(`penalty`\|`waiver`\|`discount`\|`proration`), `component varchar(10) NULL`, `amount
numeric(14,2)` signed (penalty > 0, the others < 0; CHECK by kind), `reason varchar(160) NOT NULL`,
`posted_entry_id uuid NULL`, `document_id uuid NULL` (document posting), `reversed_by_id` FK self
NULL; index `(tenant_id, due_id)`.

**`dues_pause`** — `schedule_id` FK RESTRICT, `from_on date`, `to_on date` (inclusive),
`effect varchar(5)` (`shift`\|`skip`), `reason varchar(160)`, `resumed_on date NULL`; CHECK
`to_on >= from_on`; index `(tenant_id, schedule_id, from_on)`.

**`dues_settlement`** — `payment_id uuid NOT NULL`, `due_id` FK RESTRICT, `component varchar(10)
NOT NULL` (`charge` for a due without components), `amount numeric(14,2) > 0`; unique
`uq_dues_settlement (payment_id, due_id, component)`; index `(tenant_id, due_id)`.

#### 6. API
**Python (called by vertical endpoints; contracts §2.1):** `create_plan`, `update_plan`,
`preview_schedule`, `create_schedule` exactly as contracts. `register_subject(subject_type, *,
module, label, on_due_changed=None, amount_hook=None, reminder_template_key)` in
`apps/dues/registry.py`; an unregistered subject type refuses the write (a 500 in tests).

**Shapes the verticals embed** (so every module's API reads alike):
```jsonc
// DuesScheduleRequest (inside the vertical's own body, e.g. POST /gym/memberships)
{ "plan_id": "…", "start_on": "2026-07-01", "end_on": null,
  "beneficiary_party_id": null, "supplied": null, "confirm_backdated": false }
// DuePreview (in 200 previews and in the 409 schedule_backdated_unconfirmed details)
{ "seq": 1, "period_start": "2026-07-01", "period_end": "2026-08-01", "period_label": "Jul 2026",
  "due_on": "2026-07-01", "amount": "1200.00",
  "components": [{"component": "principal", "amount": "5000.00"}] }   // expectation only
// Due (engine read API and vertical detail responses)
{ "id": "…", "schedule_id": "…", "module": "gym", "subject": {"type": "gym_membership", "id": "…",
  "label": "Rahul · Gold"}, "party": {"id": "…", "name": "Rahul"}, "seq": 4,
  "period_label": "Oct 2026", "due_on": "2026-10-01", "amount": "1200.00",
  "penalty_amount": "0.00", "waived_amount": "0.00", "settled_amount": "0.00",
  "outstanding": "1200.00", "status": "due", "paid_on": null,
  "document": {"id": "…", "number": "INV/26-27/0311"} | null, "late_fee_so_far": "0.00" }
```
409 `schedule_backdated_unconfirmed` `details: {dues: [DuePreview…], total: "4800.00"}`.

**Engine read endpoints** (`EngineEnabled("dues")` + any-consuming-module read, PLT-X10):
| Method | Path | Query | Returns |
|---|---|---|---|
| GET | `/api/v1/dues/schedules/{id}` | — | schedule with `dues[]`, `pauses[]` |
| GET | `/api/v1/dues/dues` | `party_id`, `module`, `status` (csv), `due_from`, `due_to`, `subject_type`, `subject_id`, cursor | `Due[]`, `meta.totals {outstanding, overdue}` |

(DUE-06 adds the report endpoints.) Errors: 400 bad filters; 403 `module_disabled`
(`details.module="dues"`); 404 schedule of another tenant or of a module whose read codename the
member lacks.

#### 7. Frontend
`features/dues` (shared UI, no nav): `api/duesService.ts` (read endpoints only), `types/dues.types.ts`
(`Due`, `DuePreview`, `Schedule`), `redux/duesSlice.ts` (lazily injected; keyed by party and by
schedule), components `SchedulePreviewTable`, `BackdatedConfirmDialog` (`dynamic()`),
`DueStatusBadge`, `DuesTable` (a `UbDataGrid` preset with card layout on phones). Components that
write take the vertical's thunk as a prop — the engine folder never knows a vertical's endpoint.
`useValidationSchemas()` gains `duesPlanSchema` (recurrence, amount rule, penalty, pause limits) that
vertical plan forms reuse.

#### 8. UI/UX
Preview rows show period label, due date (clamped as it falls), amount; a backdated preview marks
past rows "Will be added now". The confirmation states the party, the count and the total in words
and figures. Plan forms speak the vertical's nouns ("membership", "instalment", "fee"); the engine
never says "schedule" or "due" to a merchant unless the vertical chooses it.

#### 9. Validation and business rules
- **BR-1** A plan's `module` must be enabled and equal the calling module; a schedule's plan must be
  active and of the same module.
- **BR-2** `posting=document` needs `issuer_available(tenant)` (else 403 `module_disabled`,
  `details.module="sales"`); a taxable plan must be `document`.
- **BR-3** `create_schedule` snapshots every plan field into the schedule (recurrence typed, the rest
  in `terms`); later reads use the schedule, never the plan.
- **BR-4** Materialisation window: dues up to `min(today + 24 months, end of a fixed-count plan)`
  (ADR-048 Q9); `materialised_until` records it.
- **BR-5** Amounts: `fixed` → `amount` each; `total_split` → `split_total(total, count or weights,
  rule=rounding_rule)` (last absorbs); `supplied` → the vertical's list, validated: one per
  occurrence (or the list defines the dates), amounts ≥ 0, components summing to each amount.
- **BR-6** Join policy on the first period only: `full`; `by_days` = `round(amount × remaining/period
  days)` counting the join day; `half_rule` = full if the join day ≤ 15 else half; `next_period` = no
  first due; `align_to_join` = anchor = join date.
- **BR-7** Any due with `due_on < today` needs `confirm_backdated=true`, else 409 with the preview and
  total; with it, those dues post **with their own `due_on`** inside the same transaction (DUE-02).
- **BR-8** One live schedule per subject (`uq_dues_schedule_live_subject`).
- **BR-9** `amount_hook` (optional, per subject) may replace a computed amount at preview and
  materialisation (for example a per-member price); the hook is called with the preview row.
- **BR-10** Zero-amount dues are allowed; they post nothing and become `paid` on their date
  (shared-engines §2.14 item 10).

**Worked example.** Plan "Gym monthly", fixed ₹1,200.00 (120000 p), monthly anchor 1st, charge/ledger.
Today 5 Oct 2026, start 1 Jul → preview 4 dues (Jul, Aug, Sep, Oct) of 120000 p = **480000 p**;
without confirmation → 409 `{total: "4800.00"}`; with it → four `charge` lines dated 1 Jul, 1 Aug,
1 Sep, 1 Oct; the party's balance rises by 480000 p. **`total_split`**: course ₹10,000.00 (1000000 p)
in 3 parts, `rupee` → 333300, 333300, 333400 p. **`by_days` join** on 12 Oct: 120000 × 20/31 =
77419.35 → **77400 p (₹774.00)**.

#### 10. Permissions
Writes are the vertical's codenames (for example `gym.membership.write`); the engine checks none.
Read endpoints (pending CQ-24): `ENGINE_READ_PERMISSIONS["dues"] = {"lending": "lending.loan.read", "library":
"library.member.read", "gym": "gym.membership.read"}` in `permissions_registry.py` (strings; each
vertical FRD confirms its codename); a member sees rows of the modules whose codename they hold.

| Action | Where checked | owner | admin | staff | accountant |
|---|---|---|---|---|---|
| Create/edit plans | vertical `<module>.plan.write` | ✅ | ✅ | per vertical | ❌ |
| Start a schedule | vertical write codename | ✅ | ✅ | ✅ | ❌ |
| Confirm a backdated schedule | same, plus none extra | ✅ | ✅ | ✅ | ❌ |
| Read dues across modules | any consuming read codename | ✅ | ✅ | ✅ | ✅ |

#### 11. Reports
See DUE-06.

#### 12. Testing
- T-DUE-01-1 (unit) plan CHECKs: taxable + ledger refused; expectation + document refused.
- T-DUE-01-2 (unit) preview for each amount rule and join policy, including the worked examples;
  Σ total_split = total exactly.
- T-DUE-01-3 (unit) backdated: 409 with preview and total; confirmed → posts with own dates.
- T-DUE-01-4 (unit) snapshot: editing the plan after creation changes no preview or posting of the
  schedule.
- T-DUE-01-5 (unit) window: 24 months for open-ended; whole plan for a 10-instalment plan.
- T-DUE-01-6 (DB) one live schedule per subject; second → IntegrityError mapped to 409 by the
  vertical.
- T-DUE-01-7 (unit) sales off + document plan → 403 `module_disabled {module: "sales"}`.
- T-DUE-01-8 (API) read endpoint gating: no consumer → 403; member without the module's codename →
  rows absent; cross-tenant → 404.

#### 13. Edge cases
1. EC-1 Start date on the 31st, monthly → clamped dues (PLT-X09 BR-1).
2. EC-2 A plan deactivated while schedules run → schedules continue (snapshot); no new schedule.
3. EC-3 Two schedules for one party (gym + locker) → independent; allocation across them oldest
   first (DUE-03).
4. EC-4 Party archived → cannot start a schedule (409 `party_archived`).
5. EC-5 `supplied` list shorter than the recurrence → the list defines the dates; `freq='once'` with
   `explicit_dates`.

#### 14. Future
Escalation (+5% yearly, never retroactive); `per_unit` and `from_log` amount rules (society, daily
delivery); plan templates offered by module presets.

---

### DUE-02 — The daily run: materialise, post, overdue, catch-up

#### 1. Product requirements
Every day, per tenant, at tenant-local midnight: dues whose date has come become what is owed
(charge mode) or become due for collection (expectation mode); dues past their grace become
overdue; once-off penalties post; open advances are applied; the window is extended. A missed day
(the scheduler down for a week) posts every missed due **with its own date**, so the result equals
an on-time run (ADR-048).

#### 2. User flows
None interactive. Merchants see the effects: a new line on the khata dated the 1st, the due in the
module's "Due today" list, a reminder candidate. Owners get an in-app `dues.run_failed` notification
if a run fails.

#### 3. Features
Minimum: `register_schedule(Schedule("dues.run", daily, 00:30 IST))`; per-tenant fan-out job
`dues.run_for_tenant` with token `dues:<tenant>:<date>`; `run_for_tenant(tenant, today)` steps
below; per-schedule savepoints; `RunReport`; failure notification. Later: an hourly catch-up for
tenants in non-IST timezones.

#### 4. Entities and relationships
Reads and writes DUE-01's tables; posts `ledger_entry` rows through `post_source_entry`; issues
sales documents through the port; writes `payments_allocation` through `allocate_existing`.

#### 5. Database
No new table. The run reads `ix_dues_schedule_window`, `ix_dues_due_status`; writes
`platform_job` rows (fan-out) and audit rows. `RunReport` is the job's `result` jsonb.

#### 6. API
```python
@job_handler("dues.run", requires_tenant=False)            # fan-out, the ledger.tasks pattern
@job_handler("dues.run_for_tenant", max_attempts=3)         # payload {"date": "2026-10-01"}
def run_for_tenant(*, tenant, today: date) -> RunReport:
    # RunReport = {"materialised": int, "posted": int, "overdue": int, "penalties": int,
    #              "advances_applied": int, "skipped": int, "errors": [{"schedule_id", "code"}]}
def post_due(*, ctx, due) -> Due         # the one posting routine; create_schedule reuses it
```
No HTTP endpoint (an operator may run `manage.py dues_run --tenant <id> --date <d>`, which enqueues
the same job; listed in `test_operator_surface.py`).

#### 7. Frontend
Not applicable (the run has no screen). The owner notification uses the existing bell.

#### 8. UI/UX
Posted lines read "Membership · Oct 2026" (subject label + period label) on the khata and
statement, through `register_source_resolver("dues_due", …)` (existing registry R2).

#### 9. Validation and business rules
Order of work per tenant, each step idempotent:
1. **Extend**: for each live schedule with `materialised_until < today + window`, materialise the
   next dues (`scheduled`) applying `closed_day_rule`: `move` → `next_open_day(module)`; `skip` →
   status `skipped` at materialisation; `ignore` → as computed.
2. **Post**: for each `scheduled` due with `due_on ≤ today`, in `(due_on, seq)` order, under
   party → schedule → due locks, `post_due`:
   - charge/ledger: `post_source_entry(entry_type=CHARGE, source=("dues_due", due.id),
     bucket="main", entry_date=due.due_on, note=label)`; `posted_entry_id` set;
   - charge/document: `issue_document(origin=("dues_due", due.id), document_date=due.due_on,
     credit_check="skip", apply_open_advances=plan.auto_apply_advance, lines=[heads or one line])`;
     `document_id` set; `amount` := `grand_total`;
   - expectation: each non-principal component posts as its own source
     `("dues_component", component.id)`, `INTEREST` or `CHARGE`, bucket `loan`, dated `due_on`;
   - status → `due`, or `paid` for a zero amount, or directly `overdue` when `due_on + grace <
     today` (catch-up).
3. **Overdue**: `due → overdue` where `due_on + grace_days < today` and outstanding > 0.
4. **Once-off penalties** (`flat_once`, `percent_once`) for dues that became overdue, dated
   `due_on + grace_days + 1` (never today), one `dues_adjustment` each (DUE-04), idempotent by
   `(due, kind='penalty', auto=true)`.
5. **Accruing penalties** (`per_day`, `simple_interest`) post on the last day of each month and after
   the base is fully settled, as one adjustment each time for the accrual since the last posting,
   never inside a payment's transaction.
6. **Advances** (ledger mode, `auto_apply_advance`): `allocate_existing` of the party's open `main`
   advances, oldest payment first, onto dues posted in step 2.
7. **Pauses**: schedules with a pause covering today → `paused`; past it → `active` (DUE-05).
- **BR-1** Idempotency: posting keys are the ledger's `(source_type, source_id, entry_type)` and the
  port's `(origin_type, origin_id)`; status transitions are conditional updates; the job token
  dedupes the day.
- **BR-2** One schedule's failure (for example a rate with no tax code) rolls back that schedule's
  savepoint only, is recorded in `errors`, and notifies owners once per day (`dues.run_failed`).
- **BR-3** Future dues never post early; there is no "post all now".
- **BR-4** Paused schedules post nothing and accrue no penalty for paused days.
- **BR-5** "Today" is `tenant_today(tenant)`; a due on the 1st posts at tenant-local midnight.

**Worked example (catch-up).** Scheduler down 28 Sep–6 Oct. Plan: ₹1,200.00 monthly, grace 5,
`flat_once` ₹100.00. Run on 7 Oct: due 1 Oct posts dated 1 Oct (120000 p); 1 Oct + 5 = 6 Oct < 7 Oct →
`overdue`; penalty 10000 p dated 7 Oct. A second run on 7 Oct writes nothing. An on-time run on 1–7
Oct produces the same rows with the same dates.

#### 10. Permissions
System actor (`Ctx.system(tenant)`); audit rows carry `actor_type='system'`.

#### 11. Reports
The run's `RunReport` is visible to operators in `platform_job`; merchants see effects in DUE-06.

#### 12. Testing
- T-DUE-02-1 (unit) each step on a fixture schedule; the worked example.
- T-DUE-02-2 (idempotency) running twice for the same date is a no-op (row counts and caches equal).
- T-DUE-02-3 (replay/catch-up, property) for random plans and random outage windows, a run after the
  outage equals day-by-day runs (same rows, dates, amounts, statuses).
- T-DUE-02-4 (unit) closed-day `move` and `skip` with PLT-X08.
- T-DUE-02-5 (failure) one schedule raising leaves others posted; one notification per day.
- T-DUE-02-6 (concurrency) the run and a payment on the same party at once: no deadlock (party
  first); caches equal the replay.
- T-DUE-02-7 (plan) `EXPLAIN` of the step-2 query uses `ix_dues_due_status`.
- T-DUE-02-8 (timezone) a tenant in `Asia/Kolkata` at 18:31 UTC on 30 Sep posts 1 Oct dues.
- T-DUE-02-9 (performance) 5,000 schedules, 60,000 dues: one tenant run < 60 s on the dev box.

#### 13. Edge cases
1. EC-1 The due's party archived before its date → the due posts anyway (it was agreed); archive
   was refused while the schedule is live (DUE-06 guard), so this arises only after an unarchive race.
2. EC-2 The document port refuses (sales switched off since) → the schedule errors (BR-2) and the
   module-off guard of sales should have prevented it; the owner is notified.
3. EC-3 A calendar closure added after materialisation → the next run re-applies `closed_day_rule`
   to `scheduled` dues on or after today (they hold no money).
4. EC-4 A zero-amount due with a penalty rule → never overdue (outstanding 0).

#### 14. Future
Hourly runs per timezone; a "dues due tomorrow" dashboard preview.

---

### DUE-03 — Settling dues: targets, the component split and advances

#### 1. Product requirements
A collection against a due is an ordinary payment, so receipts, void and the UPI QR work unchanged
(ADR-047). Charge-mode ledger dues are auto-allocatable in the `main` bucket; expectation dues are
explicit-only in the `loan` bucket and split into principal, interest and fees in the order the
plan says; document-mode dues are settled through their invoice. Voiding the payment reopens the
due exactly.

#### 2. User flows
1. **Collect a due** (vertical screen, or the standard payment drawer): "Collect ₹1,200" → mode →
   Save → the due is `paid`; receipt printed.
2. **Collect a loan instalment** (lending): amount typed → the engine's `plan_allocation` shows the
   split "Interest ₹625 · Principal ₹5,000 · Late fee ₹100" before Save.
3. **Void** the receipt → the due reopens, its status re-derived from its dates.

#### 3. Features
Minimum: `dues_due` and `dues_instalment` targets; `dues_settlement`; `plan_allocation`;
`payoff`; origin listener for document-mode dues; advance auto-apply (DUE-02 step 6). Later:
per-schedule allocation override at collection time.

#### 4. Entities and relationships
`payments_allocation (payment, 'dues_due'|'dues_instalment', due.id)` → one row per payment per due;
`dues_settlement (payment_id, due, component)` → the split; the due's caches.

#### 5. Database
Tables of DUE-01; uses `ix_dues_due_open_party` for FIFO and `uq_dues_settlement`.

#### 6. API
Targets (PLT-X03 protocol):

| Attribute | `dues_due` | `dues_instalment` |
|---|---|---|
| `direction` | in | in |
| `bucket` | main | loan |
| `auto` | True | False |
| open rows | posting `ledger`, status `due`/`overdue`, outstanding > 0 | posting `none`, status `due`/`overdue` (and `scheduled` for prepayment when the vertical allows) |
| lock order | `(due_on, seq, id)` | `(due_on, seq, id)` |
| `outstanding` | `amount + penalty_amount − waived_amount − settled_amount` | same |
| `summary.number` | `"<subject label> · <period label>"` | same |

`apply(document=due, amount, today, payment_id)`: split by the schedule's `allocation_order` into
components (a due without components uses `charge`), write `dues_settlement` rows, move
`settled_amount` and each component's `settled`, set `paid`/`paid_on` when outstanding reaches 0,
call `on_due_changed`. `unapply`: remove exactly this payment's settlement rows for this due,
restore caches, re-derive status (`due` or `overdue` by date), add the stood days to
`penalty_exempt_days`, call `on_due_changed`.

```python
plan_allocation(*, tenant, schedule_id, amount, order=None) -> list[dict]   # contracts §2.1
payoff(*, tenant, schedule_id, on) -> {"principal", "interest", "fee", "charge", "total"}
# the OriginListener registered for "dues_due" and "dues_adjustment" (document mode):
on_settlement_changed(ctx, origin_id, document)  # settled := grand_total − amount_due, status re-derived
on_void(ctx, origin_id, document, reason)        # due → cancelled, cancel_reason "Invoice voided: …"
blocks_void(tenant, origin_id) -> None           # never blocks; a vertical that must refuse a void issues
                                                 # under its own origin type (e.g. gym_membership), not dues_due
```
HTTP: the engine adds none; `POST /payments` (existing) accepts `dues_due` rows in `allocations`,
and verticals expose their own collect endpoints that call `record_payment` with
`plan_allocation(...)`.

#### 7. Frontend
`features/dues/components/AllocationSplitPreview.tsx` (shows the split from the vertical's
preview endpoint); `PaymentAllocationPicker` lists `dues_due` rows like invoices (label, due date,
due amount) because they come from the same target summary.

#### 8. UI/UX
Receipts list what was settled by label ("Membership · Oct 2026 ₹1,200"); loan receipts print the
split by component. "Paid from advance of 3 Sep" appears on a due settled by `allocate_existing`.

#### 9. Validation and business rules
- **BR-1** One payment settles one bucket (PLT-X03): a single payment cannot mix a shop invoice and a
  loan instalment.
- **BR-2** Allocation to a `paid`, `skipped` or `cancelled` due → 409 `due_not_open {status}`.
- **BR-3** Order (ADR-047): `oldest_first` — the oldest due fully (interest, principal, fee, charge)
  before the next; `fees_last` — interest and principal of every due now due, oldest first, then
  fees and charges oldest first; `fees_first` — fees and charges oldest first, then interest and
  principal oldest first. Within one due the target applies the same order restricted to that due,
  so `plan_allocation` and `apply` always agree.
- **BR-4** Status is derived, never toggled: outstanding 0 → `paid`; else `overdue` if `due_on +
  grace < today`, else `due`.
- **BR-5** `settled_amount = Σ dues_settlement.amount` (ledger and expectation) or `grand_total −
  amount_due` of its invoice (document); replayed by `manage.py recalc_dues --check`.
- **BR-6** A remainder after all open dues stays unallocated on the payment (an advance in that
  bucket) — DUE-02 step 6 applies it to the next due in `main`; lending decides for `loan`.
- **BR-7** Auto FIFO across targets is global oldest-first by date (PLT-X03 BR-5, pending CQ-6).
- **BR-8** A penalty is never charged for the days a payment stood before it was voided
  (`penalty_exempt_days`).

**Worked example (expectation, `fees_last`).** Loan LN-0042, dues 3 and 4 overdue; each has principal
500000 p and interest 62500 p; due 3 also has a posted late fee 10000 p (component `fee`).
Collection ₹11,300.00 (1130000 p): scheduled components first — d3 interest 62500, d3 principal
500000, d4 interest 62500, d4 principal 500000 (Σ 1125000) — then fees: d3 fee 5000 of 10000.
Allocations: d3 **567500**, d4 **562500**; d4 `paid`; d3 `overdue` with outstanding 5000 p.
Under `oldest_first` the same payment gives d3 572500 (all of it) and d4 557500 (interest 62500,
principal 495000). Under `fees_first`: d3 fee 10000, d3 interest 62500, d3 principal 500000, d4
interest 62500, d4 principal 495000.
`loan_balance` moves by −1130000 p in every order; only the split differs.

#### 10. Permissions
Collecting is `payments.payment.write` on the generic drawer, or the vertical's collect codename on
its screen; voiding is `payments.payment.void`.

#### 11. Reports
"Collections by component" (principal / interest / fee per period, from `dues_settlement`) —
registered for modules using expectation mode (lending).

#### 12. Testing
- T-DUE-03-1 (contract) both targets pass the shared target suite (PLT-X03 T-1).
- T-DUE-03-2 (unit) the worked example for all three orders; `plan_allocation` equals what `apply`
  writes.
- T-DUE-03-3 (unit) void restores every cache and component exactly; status re-derived by date.
- T-DUE-03-4 (**replay, property**) seeded fuzz: random schedules in both modes, random payments,
  partial payments, voids, penalties, waivers — after each step: (a) `settled_amount` = Σ settlement
  rows; (b) for charge/ledger dues of a party with no other activity, `party.balance = Σ outstanding
  of posted dues − Σ unallocated main advances`; (c) for expectation dues,
  `party.loan_balance = disbursed principal − Σ principal settled + Σ posted interest/fee/charge − Σ
  their settled − loan advances`; (d) `recalc_balances --check` and `recalc_dues --check` exit 0.
- T-DUE-03-5 (unit) document mode: payment on the invoice → `on_settlement_changed` → due `paid`;
  invoice void → due `cancelled`.
- T-DUE-03-6 (concurrency) two collections on the last open due at once: one settles, the other
  leaves an advance (never over-settles; CHECK holds).
- T-DUE-03-7 (unit) BR-8 exempt days on a voided payment.
- T-DUE-03-8 (e2e, in the first vertical's harness) collect, print receipt, void, due reopens.

#### 13. Edge cases
1. EC-1 A payment allocated to dues of two schedules (gym + locker) → two allocation rows, each due
   split by its own schedule's order.
2. EC-2 Prepayment of a `scheduled` instalment (lending) → allowed only when the vertical passes
   `allow_scheduled=True` to `plan_allocation`; the due stays `scheduled` with `settled_amount`
   and posts nothing extra on its date except its non-principal components.
3. EC-3 Payment in document mode made against the due instead of the invoice → impossible:
   document-mode dues are not targets (contracts §1.4).
4. EC-4 The due cancelled while allocated → allocations released to advance (DUE-04 cancel).

#### 14. Future
Per-collection order override with a reason; auto-apply of loan advances by lending policy.

---

### DUE-04 — Penalties, waivers, discounts, pro-rating, ending and cancelling

#### 1. Product requirements
What a due asks for changes only through recorded adjustments with reasons: a late fee, a waiver,
a discount, a pro-rata credit on joining or leaving. Ending a schedule applies the plan's leave
policy and tells the merchant exactly what is credited and what refund is due; cancelling a
mistaken schedule reverses its postings. The engine stores rates and caps and never judges legality
(ADR-048); statutory ceilings are the lending module's validation.

#### 2. User flows
1. **Add late fee**: due row → "Add late fee" → amount (pre-filled by the plan rule) and reason →
   Save → a line on the khata.
2. **Waive**: due row → "Waive" → amount (≤ open), reason → above the tenant's waive limit a staff
   member is refused and an owner/admin is asked to do it.
3. **End**: vertical "End membership" → date → the settlement slip ("Paid ₹1,200 for Oct · Used 20 of
   31 days · Credit ₹426 · Refund due ₹426 by 30 Oct") → Confirm → the refund is recorded through
   payments by the vertical.
4. **Cancel** (mistake): "Cancel schedule" with reason → every posted due's posting is reversed;
   payments on them stay as advances.

#### 3. Features
Minimum: `add_penalty` (cap), `waive` (component-aware, role ceiling), discount and proration
adjustments, `reverse_adjustment`, `end_schedule` with leave policies and settlement slip,
`cancel_schedule`, live "late fee so far". Later: freeze fees as their own due; bulk waivers.

#### 4. Entities and relationships
`dues_adjustment` rows per change, each its own posting source (`dues_adjustment`) or its own
document (document mode, origin `dues_adjustment`); reversals by `reversed_by`.

#### 5. Database
DUE-01 tables. Index `ix_dues_adjustment_due (tenant_id, due_id)`.

#### 6. API
Python, contracts §2.1: `add_penalty`, `waive`, `end_schedule`, `cancel_schedule`, plus
`reverse_adjustment(*, ctx, adjustment_id, reason) -> Adjustment` and
`late_fee_so_far(*, tenant, due, on) -> Decimal` (display only). Postings:

| Adjustment | charge/ledger | charge/document | expectation |
|---|---|---|---|
| penalty | `CHARGE`, `dues_adjustment`, main | a new document via the port, origin `dues_adjustment` (pending CQ-21) | `CHARGE`, `dues_adjustment`, loan, component `fee` |
| waiver / discount / proration | `ADJUSTMENT_CREDIT`, main | `issue_credit_note(against=document, settlement="hold_advance")` | `ADJUSTMENT_CREDIT`, loan, on the named component |

Settlement slip returned by `end_schedule`: `{end_on, cancelled_dues: [...], credits: [{due_id,
amount, formula}], refund_due: "426.00", refund_by: "2026-10-30" | null, slip_lines: [...]}`.
Errors: 409 `due_not_open`, `penalty_cap_reached {cap}`, `schedule_not_active {status}`;
403 `override_not_allowed` (waiver above the limit by a non-owner/admin); 400 `validation_error`
(amount ≤ 0, > open, reason < 3 chars, `by_sessions` without `custom_amount`).

#### 7. Frontend
`features/dues/components`: `PenaltyDialog`, `WaiveDialog`, `EndScheduleDialog` (renders the slip;
`dynamic()`), `SettlementSlipPrint` (print pipeline, tenant name only), `LateFeeSoFar` caption.

#### 8. UI/UX
Every dialog is a `UbReasonDialog` showing consequences ("Balance −₹426"). "Late fee so far ₹140"
is a caption, visibly not part of the balance until it posts. The slip prints the formula, because
the customer will check it (shared-engines §2.6).

#### 9. Validation and business rules
- **BR-1** Adjustments only on `due`/`overdue` dues (and `scheduled` for proration) → else
  `due_not_open`.
- **BR-2** Σ live penalties on a due ≤ `penalty_cap` → else `penalty_cap_reached`.
- **BR-3** Penalty formulas (rounded by `rounding_rule`): `flat_once` = value; `percent_once` =
  value% × unpaid at overdue; `per_day` = value × overdue days (from end of grace, minus
  `penalty_exempt_days` and paused days), capped; `simple_interest` = unpaid × rate/100 × days ÷
  365, **never compounded** (interest on the base only, never on penalties).
- **BR-4** Waiver ≤ outstanding (of the component when named); above `dues.<module>.waive_limit`
  (tenant setting, default none) only owner/admin (**role check**, the LED-03 rule) → else 403
  `override_not_allowed`.
- **BR-5** Leave `by_days`: credit = `round(amount × unused days / period days)`, the leave date
  counted as used; `no_refund`: none; `by_sessions`: the vertical computes from attendance and
  passes `custom_amount` (the engine never reads attendance); `custom`: amount + reason.
- **BR-6** End: dues after the end date `scheduled` → `cancelled` ("schedule ended"); the current
  period's due gets the leave credit; `refund_due` = credit beyond what remains open on that due.
- **BR-7** Cancel: every posted due is reversed (ledger: `reverse_source_entries` per source;
  document: `void_document`); allocations to them are released to advance
  (`release_document_allocations(document_type="dues_due")`); scheduled → `cancelled`.
- **BR-8** Adjustments are never edited; a mistake is `reverse_adjustment` (one source per
  adjustment, so reversing one never touches another).
- **BR-9** No penalty on a paused period or a `skipped` due.

**Worked examples.** `percent_once` 2% on unpaid 120000 p = 2400 p, cap ₹20.00 → **2000 p**.
`per_day` ₹10.00, grace ends 6 Oct, cap ₹150.00: on 20 Oct 14 days → "late fee so far" **14000 p**;
on 25 Oct 19 days → 19000 capped **15000 p**. `simple_interest` 18% p.a. on ₹10,000.00 (1000000 p)
for 30 days = 14794.52 → `rupee` **14800 p**. **Leave `by_days`**: Oct paid 120000 p, leave 20 Oct
→ used 20, unused 11 → credit 120000 × 11/31 = 42580.65 → **42600 p (₹426.00)**, all of it a refund
due because the due is paid.

#### 10. Permissions
Vertical codenames for penalty, waiver, end and cancel (for example `gym.membership.write`,
`lending.loan.waive`); the waiver ceiling is a role check.

#### 11. Reports
"Refunds due" (credits with `refund_due > 0` and no matching payment out yet), "Waivers" (by
reason, by member, by period) — registered per consuming module.

#### 12. Testing
- T-DUE-04-1 (unit) every worked example; `never compounded` (interest never grows with posted
  penalties).
- T-DUE-04-2 (unit) cap refusal; waiver above limit by staff → 403; by admin → 201.
- T-DUE-04-3 (unit) end with each leave policy; the slip lines and formula.
- T-DUE-04-4 (unit) cancel with a paid due → posting reversed, payment becomes an advance, party
  balance consistent.
- T-DUE-04-5 (replay) adjustments included in T-DUE-03-4's fuzz; `waived_amount` and
  `penalty_amount` equal their replays.
- T-DUE-04-6 (unit) document mode: penalty issues its own invoice; waiver issues a credit note.

#### 13. Edge cases
1. EC-1 Waiver of a posted penalty → a credit adjustment on the `fee` component, or
   `reverse_adjustment` of the penalty (the vertical chooses the words).
2. EC-2 End date before the last paid period's start → credit the whole later periods.
3. EC-3 End on the start day → by_days credit = amount − one day.
4. EC-4 A leave refund recorded by the vertical as payment out → `refund_due` clears when the vertical
   links it (`settlement_refunded(schedule_id, payment_id)`).

#### 14. Future
Freeze fee as its own due; waiver approval queue; interest-rate ceilings surfaced from lending's
validation into the plan form.

---

### DUE-05 — Pause, resume and reschedule

#### 1. Product requirements
A gym freeze gives the member the days back; a coaching holiday month is skipped; a loan may be
restructured from an instalment onward. Pauses are recorded before or during the window, never
after; a retroactive pause over posted dues is a cancel-and-reverse of those dues (shared-engines
§2.8).

#### 2. User flows
1. **Freeze**: vertical "Freeze" → from/to dates → the preview shows the moved dates and the new end →
   Save.
2. **Resume early**: "Resume today" → the shift shortens.
3. **Reschedule** (lending): from instalment 5, a new supplied list → preview → Save.

#### 3. Features
Minimum: `pause` (`shift`/`skip`, limits), `resume`, the daily flip `active ⇄ paused`, `reschedule`
with principal conservation. Later: freeze fees; pause requests by members.

#### 4. Entities and relationships
`dues_pause` rows per schedule; rescheduled dues are new `dues_due` rows with continuing `seq`.

#### 5. Database
DUE-01 tables; index `(tenant_id, schedule_id, from_on)` on `dues_pause`.

#### 6. API
Python, contracts §2.1 (`pause`, `resume`, `reschedule`). Errors: 409 `schedule_not_active {status}`,
`pause_limit_reached {limit, used}`; 400 `validation_error` (`from_on < today`, `to_on < from_on`,
overlap with another pause, Σ principal not conserved).

#### 7. Frontend
`features/dues/components/PauseDialog.tsx` (dates, effect is the plan's, preview of moved dues),
`RescheduleReview.tsx` (old vs new rows).

#### 8. UI/UX
Freeze preview: "Dues from 1 Nov move by 15 days · Membership now ends 15 Mar 2027". A paused
schedule shows a "Frozen until 15 Oct" badge.

#### 9. Validation and business rules
- **BR-1** `from_on ≥ today`; no overlap with another live pause; schedule `active`.
- **BR-2** Limits per schedule year (from `start_on` anniversaries): Σ days ≤ `pause_max_days`, each
  ≥ `pause_min_days`, count ≤ `pause_max_count` → else `pause_limit_reached`.
- **BR-3** `shift`: every `scheduled` due with `due_on ≥ from_on` moves by the pause length (days),
  periods too; `end_on` moves by the same; scheduled rows are updated in place (they hold no money).
- **BR-4** `skip`: dues whose period lies wholly inside the pause → `skipped`; a partly covered
  period gets a `proration` adjustment (by days) that posts with the due.
- **BR-5** `resume(on)`: `to_on := on − 1`; a shift is recomputed with the shorter length.
- **BR-6** `reschedule(from_seq, supplied)`: dues with `seq ≥ from_seq` still `scheduled` →
  `cancelled` ("rescheduled"); new dues appended with `seq = max + 1…`; for expectation mode
  Σ new principal = Σ replaced principal outstanding; posted dues untouched.
- **BR-7** Pause posts nothing; reminders and penalties ignore paused days.

Worked example: monthly ₹1,200.00 due on the 1st, freeze 20 Oct–3 Nov (15 days, `shift`): the 1 Nov
due moves to 16 Nov, 1 Dec to 16 Dec…; the Oct due (posted) is untouched. With `skip` and a pause
1–31 Dec: December's due (120000 p) → `skipped`; a pause 16–31 Dec (16 of 31 days): proration
120000 × 16/31 = 61935.48 → `rupee` **61900 p** credit posted with the December due.

#### 10. Permissions
Vertical codenames (`gym.membership.freeze`, `lending.loan.reschedule`).

#### 11. Reports
"Frozen now" list per module (schedules `paused` with `to_on`).

#### 12. Testing
- T-DUE-05-1 (unit) shift and skip worked examples; end date moves.
- T-DUE-05-2 (unit) limit refusals with `limit` and `used`.
- T-DUE-05-3 (unit) resume shortens; overlapping pause refused.
- T-DUE-05-4 (unit) reschedule conserves principal; posted dues untouched; `seq` continues.
- T-DUE-05-5 (replay) pauses included in the DUE-02 catch-up fuzz.

#### 13. Edge cases
1. EC-1 A pause starting today when today's due has already posted (run at 00:30) → the posted due
   stands; the next due shifts.
2. EC-2 A pause over the schedule's end → end moves; nothing materialises inside the pause.
3. EC-3 Retroactive request → refused; the vertical offers cancel-and-reverse of the posted dues with
   a reason.

#### 14. Future
Freeze fee due; member-requested pauses with approval.

---

### DUE-06 — Dues reads, reminders, reports and guards

#### 1. Product requirements
One place to answer "what does this party owe across modules", "what is due this week", "what was
expected versus collected", and to feed the reminders list; plus the module-off and archive guards
that keep open dues from being orphaned.

#### 2. User flows
1. Party page → "Dues" panel (core-hosted, rendered when the engine is enabled and the party has
   dues): upcoming, due and overdue across enabled modules the member may read.
2. Reminders → module tab → dues buckets (PLT-X06).
3. Reports → "Collection vs expected" (module, month).

#### 3. Features
Minimum: selectors of contracts §2.1; read endpoints; reminder source `dues_due`; archive guard and
module-off guards per module; `recalc_dues` command; registered reports; `register_source_resolver`
for `dues_due`, `dues_component`, `dues_adjustment`. Later: dashboard sections (the verticals
register them from these selectors).

#### 4. Entities and relationships
Reads DUE-01 tables; registers entries in R2, R4, R6 (archive), R7, R9.

#### 5. Database
No new table; the selectors use `ix_dues_due_module`, `ix_dues_due_party`, `ix_dues_due_open_party`.

#### 6. API
Selectors (contracts §2.1): `dues_for_party`, `dues_for_subject`, `arrears(tenant, subject_type,
subject_id, as_of) → {overdue_amount, oldest_due_on, days_past_due}`, `upcoming(tenant, *, module,
within_days)`, `collection_vs_expected(tenant, *, module, period)`.
Read endpoints (in addition to DUE-01's):
| Method | Path | Query | Returns |
|---|---|---|---|
| GET | `/api/v1/dues/upcoming` | `module`, `within_days` (1–60, default 7) | `Due[]` |
| GET | `/api/v1/dues/arrears` | `subject_type`, `subject_id`, `as_of` | the `arrears` dict |
| GET | `/api/v1/dues/collection-vs-expected` | `module`, `period` (`2026-10`) | `{expected, collected, collected_on_time, outstanding, by_plan: [...]}` |
Reminder source: `register_reminder_source("dues_due", module=<each consuming module>,
candidates=…)` with buckets *due in 3 days*, *due today*, *overdue 1–7*, *8–30*, *30+*;
`template_key` from the subject registration; `recipient_party_id` = the payer, or a relation with
`receives_messages`.
Guards: module-off per module (schedules `active`/`paused` + dues `due`/`overdue`); archive guard
(party with a live schedule or an open due) → `party_has_open_records {module, count, label_id:
"dues.archive.openDues"}`.
`manage.py recalc_dues [--tenant] [--check|--apply]`: replays `settled_amount`, `waived_amount`,
`penalty_amount` and component caches, report-only by default (the `recalc_balances` rules).

#### 7. Frontend
`features/dues/components/DuesPartyPanel.tsx` registered in `features/parties/modulePanels.ts` under
core key `dues`; `features/dues/reports/*` registered in `reportsRegistry.ts` per module.

#### 8. UI/UX
The panel groups by module with the module's heading only when two or more modules have dues;
overdue first, then due, then the next three upcoming; amounts in receivable tone with words.

#### 9. Validation and business rules
- **BR-1** Every read filters `module ∈ enabled_modules_using(tenant, "dues")` ∩ modules whose read
  codename the member holds.
- **BR-2** `collection_vs_expected`: expected = Σ `amount` of dues with `due_on` in the period (not
  cancelled/skipped); collected = Σ settlements dated (by payment date) in the period against those
  dues; on time = settled by `due_on + grace`.
- **BR-3** Candidates exclude paused schedules, `notice`-only subjects and dues with outstanding 0.
- **BR-4** Archive guard counts per module; module-off counts per module.

Worked example: October gym: 40 dues × 120000 p = 4800000 p expected; 35 paid (4200000 p), 30 of
them on time (3600000 p), outstanding 600000 p → `{expected: "48000.00", collected: "42000.00",
collected_on_time: "36000.00", outstanding: "6000.00"}`.

#### 10. Permissions
Read endpoints and reports: the consuming module's read codename (DUE-01 §10); reports that show
money need `reports.financial.read` too.

#### 11. Reports
Registered per consuming module (`dues.<module>.<name>`), each with CSV:
- **Dues register** — period, party, subject, due date, amount, status, settled, outstanding.
- **Collection vs expected** — by month and plan.
- **Overdue list** — party, days past due, amount, late fee so far.
- **Refunds due** (DUE-04) and **Waivers** (DUE-04).
- **Collections by component** (DUE-03, expectation mode only).

#### 12. Testing
- T-DUE-06-1 (unit) each selector on a fixture book; the worked example.
- T-DUE-06-2 (plan) `EXPLAIN` of `upcoming` and the party panel query use the named indexes.
- T-DUE-06-3 (contract) the reminder source's candidates; buckets at their edges.
- T-DUE-06-4 (contract) module-off and archive guards: 0 for empty, right counts for open only.
- T-DUE-06-5 (command) `recalc_dues --check` exits 1 on a planted drift, 0 when clean; never writes
  without `--apply`.
- T-DUE-06-6 (API) member holding only `gym.membership.read` sees no lending dues.

#### 13. Edge cases
1. EC-1 Module off → its dues disappear from the panel and lists; history kept; back on restores.
2. EC-2 A payer (parent) and a beneficiary (child) → dues listed on the payer's page with the
   beneficiary's name; the child's page shows them read-only under "Paid by".
3. EC-3 A due cancelled after a reminder was sent → the history row stays with its snapshot.

#### 14. Future
Dashboard "due this week" tile per module; statement "upcoming" block printed on request.

---
# Part C — The check-ins and attendance engine (`apps/attendance`)

The engine records that a party **was there**: open visits (gym walk-ins), session marks
(roll-call), and countable entitlements (session packs). Whether a person **may** come in is the
vertical's decision through a registered policy hook; the engine never reads dues or memberships
(ADR-050). Marks are not money: they are editable within a window with audit. Hotel arrival is a
booking status (BKG-04), not a mark. `quantity` marks are not built.

### ATT-01 — Groups, members and sessions

#### 1. Product requirements
A class or batch ("Morning yoga, Mon/Wed/Fri 6 am") has expected members and generated sessions
that skip closed days, so a roll-call screen can list who should be there and a register can say
"not enrolled" rather than "absent" for dates outside a member's enrolment.

#### 2. User flows
1. Vertical "New batch" → name, days, start time, length → the engine generates sessions for the
   next 8 weeks, skipping closed days.
2. Add members to the batch from a date; remove from a date.
3. Cancel a session (trainer absent) → it is excluded from percentages and consumes nothing.

#### 3. Features
Minimum: groups, group members with date ranges, session generation (recurrence + calendar),
cancel session, a weekly job extending sessions. Later: sessions linked to bookings of a class
slot (`booking_unit_id`, when gym uses bookings).

#### 4. Entities and relationships
`attendance_group 1—* attendance_group_member *—1 parties_party`; `attendance_group 1—*
attendance_session`; a group points at the vertical's row by `(subject_type, subject_id)`.

#### 5. Database
Migration `attendance/0001_initial.py` (all six tables; depends on Wave A only).

**`attendance_group`**: `module varchar(32)`, `name varchar(80)`, `subject_type varchar(48)`,
`subject_id uuid NULL`, `mark_kind varchar(8)` (`visit`\|`presence`), optional recurrence columns
(`OptionalRecurrenceFields`: the PLT-X09 columns with `freq`/`anchor` nullable, all-or-none CHECK),
`session_start time NULL`, `session_minutes smallint NULL` (pending CQ-17), `default_mark
varchar(8) DEFAULT 'present'`, `one_per_day boolean DEFAULT false`, `dedupe_minutes smallint
DEFAULT 5`, `edit_window_hours smallint DEFAULT 24`, `is_active boolean DEFAULT true`.
CHECK `mark_kind='visit' OR freq IS NOT NULL` is **not** imposed (a presence group may be marked
ad hoc); CHECK `(freq IS NULL) = (session_start IS NULL)`. Index `(tenant_id, module, is_active)`.

**`attendance_group_member`**: `group_id` FK RESTRICT, `party_id` FK RESTRICT, `from_on date`,
`to_on date NULL`; CHECK `to_on IS NULL OR to_on >= from_on`; unique `(group_id, party_id,
from_on)`; index `(tenant_id, party_id)`. Overlapping ranges for one party in one group are refused
by the service.

**`attendance_session`**: `group_id` FK RESTRICT, `starts_at timestamptz`, `ends_at timestamptz`,
`status varchar(10)` (`scheduled`\|`held`\|`cancelled`), `booking_unit_id uuid NULL`,
`cancel_reason varchar(160) DEFAULT ''`; unique `(group_id, starts_at)`; CHECK `ends_at >
starts_at`; index `(tenant_id, group_id, starts_at)`.

#### 6. API
Python, contracts §2.3: `create_group`, `set_members` (plus `end_membership(group_member_id, on)`),
`generate_sessions(tenant, group_id, until) -> int` (idempotent by `(group, starts_at)`, skips
`not is_open(tenant, date, module=group.module)`), `cancel_session(ctx, session_id, reason)`.
Schedule: `register_schedule(Schedule("attendance.extend_sessions", weekly, Mon 01:30 IST))`
fanning out per tenant, extending every active group to 8 weeks ahead.
Read endpoints (`EngineEnabled("attendance")`):
| Method | Path | Query | Returns |
|---|---|---|---|
| GET | `/api/v1/attendance/groups` | `module`, `subject_type`, `subject_id` | groups |
| GET | `/api/v1/attendance/sessions` | `group_id`, `from`, `to` | sessions with `marked_count`, `expected_count` |
Errors: 400 `validation_error` (bad recurrence, `until` > 26 weeks ahead, overlap of member
ranges); 404 cross-tenant.

#### 7. Frontend
`features/attendance`: `api/attendanceService.ts` (reads), `types`, `redux/attendanceSlice.ts`
(lazy), `SessionList`, `GroupMembersTable` (write actions via props from the vertical).

#### 8. UI/UX
Sessions shown as "Mon 12 Oct · 6:00–7:00 am"; a cancelled session struck through with its reason;
a closed day shows no session and, in the register grid, a "Closed" cell.

#### 9. Validation and business rules
- **BR-1** Sessions are generated from the group's recurrence at `session_start` for
  `session_minutes`, tenant-local, converted to `timestamptz`.
- **BR-2** Closed days (PLT-X08, the group's module) produce no session.
- **BR-3** Expected members of a session = members whose `[from_on, to_on]` contains the session date
  and whose party is active.
- **BR-4** A cancelled session takes no marks: 400 `validation_error` `{session_id: ["This session
  was cancelled."]}`.
- **BR-5** Regenerating never deletes a session that has marks; changing the timetable affects
  sessions from the next unmarked date.

#### 10. Permissions
Vertical codenames for writes (`gym.batch.write`); reads via `ENGINE_READ_PERMISSIONS["attendance"]
= {"gym": "gym.attendance.read"}`.

#### 11. Reports
Feeds ATT-05.

#### 12. Testing
- T-ATT-01-1 (unit) generation Mon/Wed/Fri for 8 weeks with one closed Monday → 23 sessions.
- T-ATT-01-2 (unit) idempotent regeneration; marked sessions survive a timetable change.
- T-ATT-01-3 (unit) expected-members rule across join and leave dates and archived parties.
- T-ATT-01-4 (API) read gating; cross-tenant 404.

#### 13. Edge cases
1. EC-1 A member joins mid-month → earlier sessions "not enrolled" (excluded from %).
2. EC-2 A group deactivated → no new sessions; history kept.
3. EC-3 Timezone: 6 am IST sessions stored as 00:30 UTC.

#### 14. Future
Sessions tied to class-slot bookings; substitute trainers per session.

---

### ATT-02 — Check-in and check-out with the policy hook

#### 1. Product requirements
The gym desk types a name or number and taps "Check in"; the engine asks the gym's policy whether
this member may enter (membership valid, not frozen, dues not too old) and answers allow, warn or
block; a block can be overridden with a reason by someone holding the codename the policy names.
A double tap never records two visits; a visit never closed is closed automatically at the end of
the day. This is the hottest desk path: p95 under 150 ms server time.

#### 2. User flows
1. **Allow**: search → tap → "Checked in 6:42 am" snackbar; the member appears in "In now".
2. **Warn**: "Checked in · Membership ends in 2 days" (amber) — recorded.
3. **Block**: "Membership expired on 30 Sep" (red) with "Let in anyway" for a permitted member →
   reason → recorded as overridden.
4. **Check out**: tap the member in "In now" → "Checked out 8:05 am".
5. **Auto-close**: at the end of the day open visits are closed and marked "Auto-closed".

#### 3. Features
Minimum: `check_in`, `check_out`, policy registry, override with audit, dedupe window, one-per-day,
entitlement consumption hook (ATT-04), `close_open_visits` job, "In now" read. Later: QR self
check-in (needs member identity, gym §15.4); kiosk mode.

#### 4. Entities and relationships
`attendance_mark` (visit kind: `group_id` and `session_id` null; `context_type`/`context_id` = the
vertical's membership) N:1 party; optional N:1 entitlement through `attendance_entitlement_use`.

#### 5. Database
**`attendance_mark`**: `group_id` FK NULL, `session_id` FK NULL, `party_id` FK RESTRICT,
`module varchar(32) NOT NULL` (pending CQ-17), `on_date date`, `status varchar(8)`
(`present`\|`absent`\|`late`\|`excused`\|`visit`), `check_in_at timestamptz NULL`, `check_out_at
timestamptz NULL`, `auto_closed boolean DEFAULT false` (pending CQ-17), `method varchar(10)`
(`desk`\|`roll_call`\|`qr`), `context_type varchar(48) DEFAULT ''`, `context_id uuid NULL`,
`override_reason varchar(160) NULL`, `voided_at timestamptz NULL`, `void_reason varchar(160) NULL`,
`marked_by_id` FK user SET NULL.
Constraints: unique `uq_attendance_session_party (session_id, party_id) WHERE session_id IS NOT
NULL AND voided_at IS NULL` (contracts); CHECK `check_out_at IS NULL OR check_out_at >=
check_in_at`; CHECK `(voided_at IS NULL) = (void_reason IS NULL)`; CHECK `status <> 'visit' OR
check_in_at IS NOT NULL`.
Indexes: `ix_attendance_open_visits (tenant_id, module, on_date) WHERE status='visit' AND
check_out_at IS NULL AND voided_at IS NULL`; `ix_attendance_party_date (tenant_id, party_id,
on_date)`; `ix_attendance_module_date (tenant_id, module, on_date)`.

#### 6. API
Python (contracts §2.3):
```python
check_in(*, ctx, module, party_id, context_type, context_id, group_id=None, session_id=None,
         at=None, method="desk", override_reason=None) -> CheckInResult
# CheckInResult = {"mark": Mark, "decision": "allow"|"warn"|"block_overridden",
#                  "reason": str, "entitlement": {"id", "total", "used", "left"} | None}
check_out(*, ctx, mark_id, at=None) -> Mark
close_open_visits(*, tenant, on: date) -> int
register_checkin_policy(context_type, *, module, policy)      # (tenant, party_id, context_id, on) -> PolicyResult
register_mark_listener(context_type, *, module, on_marked)    # (ctx, mark, created: bool)
```
Order inside `check_in`: lock party → call the policy (one indexed query, its contract) → on
`block`: without `override_reason` raise 409 `attendance_blocked {reason, override_permission}`;
with it, require the codename (else 403 `permission_denied`) and record → dedupe check → lock the
named entitlement (ATT-04) → insert mark → entitlement use → `on_marked(created=True)` → audit
`attendance.mark.created` (and `attendance.mark.overridden`).
The vertical exposes `POST /<module>/check-ins` (and `/check-outs`) calling these; the engine adds
read endpoints:
| Method | Path | Query | Returns |
|---|---|---|---|
| GET | `/api/v1/attendance/open-visits` | `module` | `[{mark_id, party, check_in_at, context_label}]` ("In now") |
| GET | `/api/v1/attendance/marks` | `party_id`, `module`, `from`, `to` | marks |
Errors: 409 `attendance_blocked`, `attendance_duplicate {mark_id}`, `entitlement_exhausted {total,
used}`; 400 `validation_error` (check-out before check-in, check-out of a closed or voided mark,
`at` in the future by more than 5 minutes); 404.

#### 7. Frontend
`features/attendance/components`: `CheckInResultBanner` (allow/warn/block tones and words),
`OverrideDialog` (`UbReasonDialog`, `dynamic()`), `InNowList`, `useCheckInDesk` hook (debounced
search is the vertical's; the hook handles submit, idempotency key and the 409s). The desk input
keeps focus after each check-in so the next name can be typed immediately.

#### 8. UI/UX
Allow = green tick and time; warn = amber with the policy's reason; block = red with the reason and,
only for permitted members, "Let in anyway". Words not colours carry meaning (WCAG). Hindi
"प्रवेश दर्ज", "बाहर गए".

#### 9. Validation and business rules
- **BR-1** The policy decides; the engine never reads dues or memberships.
- **BR-2** Override: `override_reason` ≥ 3 characters **and** the member holds
  `PolicyResult.override_permission` (a vertical codename, e.g. `gym.membership.override`).
- **BR-3** Dedupe: a visit by the same party and context within `dedupe_minutes` → 409
  `attendance_duplicate` (the double tap). With `one_per_day`, any live visit that tenant-local day
  → 409.
- **BR-4** `on_date` is the tenant-local date of `check_in_at`.
- **BR-5** `close_open_visits(on)`: a daily fan-out at 00:05 IST (`register_schedule`) enqueues one
  job per tenant for the previous tenant-local date; each open visit of that date gets
  `check_out_at` = 23:59:59 tenant-local of its `on_date` and `auto_closed = true`. Idempotent.
- **BR-6** Voided marks are ignored by dedupe, percentages and guards.

Worked example (no money): 06:42:10 check-in allowed; 06:43:00 second tap (dedupe 5 min) → 409
`attendance_duplicate {mark_id}`; the desk shows "Already checked in at 6:42". Expired membership:
policy returns `{decision: "block", reason: "Membership expired on 30 Sep", override_permission:
"gym.membership.override"}` → staff without it sees the reason only; the owner enters "Paying today"
→ recorded.

#### 10. Permissions
Check-in: vertical codename (`gym.checkin.write`, held by staff and `gym_trainer` per the gym FRD);
override: the policy's codename; reads: `gym.attendance.read`.

#### 11. Reports
Feeds ATT-05 (visits, peak hours, overrides list).

#### 12. Testing
- T-ATT-02-1 (unit, fake policy) allow, warn, block, override with and without the codename.
- T-ATT-02-2 (unit) dedupe window edges; one-per-day.
- T-ATT-02-3 (concurrency) two simultaneous check-ins of one party → one mark, one 409 (party lock).
- T-ATT-02-4 (job) auto-close at the day boundary in the tenant timezone; idempotent.
- T-ATT-02-5 (performance) check-in path ≤ 6 queries including the fake policy; `EXPLAIN` of the
  open-visits read uses `ix_attendance_open_visits`.
- T-ATT-02-6 (contract) every registered policy returns within one query for a member with a year of
  history (the verticals join this contract test).
- T-ATT-02-7 (audit) override writes `attendance.mark.overridden` with reason and actor.

#### 13. Edge cases
1. EC-1 Check-in after midnight for a late class → `on_date` is the new day.
2. EC-2 Policy unregistered for a context type → refuse (500 in tests), never "allow by default".
3. EC-3 Member checked in at two branches → out of scope (no branches); two visits allowed unless
   one-per-day.

#### 14. Future
QR self check-in; kiosk session; biometric devices (need an ADR).

---

### ATT-03 — Roll-call, edits and voids

#### 1. Product requirements
A trainer marks a batch in one screen: everyone expected, one tap each, "mark all present". Marks
can be corrected within a window (same day by default) with audit; afterwards only a member with the
module's closed-edit codename may change them. A void removes a mark from counts and gives back any
entitlement use.

#### 2. User flows
1. Session → Roll-call → list pre-filled with the group's default (present or absent) → toggle
   exceptions → Save.
2. Edit a mark → new status + reason → Save; outside the window the edit asks for the codename.
3. Void a mistaken visit → reason → gone from counts, pack use returned.

#### 3. Features
Minimum: `roll_call`, `edit_mark`, `void_mark`, listener callbacks, edit window. Later: parent share
text for absences (the vertical composes it through reminders' notice kind).

#### 4. Entities and relationships
Session marks: `attendance_mark` with `session_id` set; one live mark per `(session, party)`.

#### 5. Database
ATT-02's `attendance_mark`; the partial unique index guarantees one live mark per session per party.

#### 6. API
Python (contracts §2.3): `roll_call(*, ctx, session_id, marks: dict[UUID, str]) -> list[Mark]`
(upsert of live marks), `edit_mark(*, ctx, mark_id, status, reason)`, `void_mark(*, ctx, mark_id,
reason)`. Errors: 400 `validation_error` (party not expected in the session, unknown status, reason
< 3 characters, session cancelled); 403 `permission_denied` (edit outside the window without
`<module>.attendance.edit_closed`); 404.

#### 7. Frontend
`features/attendance/components/RollCallList.tsx` (a list of `UbCheckbox`-like toggles with
present/absent/late/excused, "Mark all present", sticky Save), `EditMarkDialog`, `VoidMarkDialog`.

#### 8. UI/UX
Roll-call rows: name, initials disc (a person, correctly), status chips; the counts "18 present · 2
absent" update live. Saved state is explicit ("Saved 6:58 am").

#### 9. Validation and business rules
- **BR-1** Only expected members (ATT-01 BR-3) may be marked in a session.
- **BR-2** `roll_call` is an upsert: a changed status is an edit (audited with before/after); an
  unchanged one writes nothing.
- **BR-3** Edit window: `edit_window_hours` after the session's `ends_at` (or the visit's
  `check_in_at`); inside it the module's write codename suffices; after it,
  `<module>.attendance.edit_closed` is required.
- **BR-4** First mark on a session sets it `held`.
- **BR-5** `void_mark` sets `voided_at` and `void_reason`, returns an entitlement use (−1), calls
  `on_marked(created=False)`, and frees the unique slot so a corrected mark can be taken.

#### 10. Permissions
Roll-call and in-window edit: vertical codename (`gym.attendance.write`); closed edit:
`gym.attendance.edit_closed` (owner, admin by default).

#### 11. Reports
ATT-05.

#### 12. Testing
- T-ATT-03-1 (unit) roll-call upsert; unchanged marks write nothing; changed write audit.
- T-ATT-03-2 (unit) window edge ± 1 minute with and without the closed-edit codename.
- T-ATT-03-3 (DB) two live marks for one session and party → IntegrityError; after void, allowed.
- T-ATT-03-4 (unit) void gives back the entitlement use (ATT-04 replay).
- T-ATT-03-5 (e2e, gym harness) roll-call at 360 px: no row wider than the viewport (the measuring
  check).

#### 13. Edge cases
1. EC-1 Member added to the group after the session → not expected; marking refused.
2. EC-2 Roll-call submitted twice from two devices → the later write wins per mark, both audited.

#### 14. Future
Absence share texts to guardians; register "closed" state per month.

---

### ATT-04 — Entitlements (session packs)

#### 1. Product requirements
"12 classes in 30 days" or "10 PT sessions" count down per attended mark, never below zero, and
come back when a mark is voided. The count is a cache with a replay test (ADR-050).

#### 2. User flows
1. Selling a pack (vertical) → `grant_entitlement(total=10, valid 1–31 Oct)`.
2. Each check-in/mark whose policy names the entitlement → "PT pack: 7 left".
3. A voided mark → "PT pack: 8 left".

#### 3. Features
Minimum: `grant_entitlement`, consumption at mark (named by the policy), give-back on void,
validity, `extend_entitlement(valid_to)` for freezes (pending CQ-17), replay command. Later:
top-ups merging into one pack.

#### 4. Entities and relationships
`attendance_entitlement 1—* attendance_entitlement_use *—1 attendance_mark`.

#### 5. Database
**`attendance_entitlement`**: `party_id` FK RESTRICT, `module varchar(32) NOT NULL` (pending
CQ-17), `subject_type varchar(48)`, `subject_id uuid`, `total integer`, `used integer DEFAULT 0`
(cache), `valid_from date`, `valid_to date`; CHECKs `total > 0`, `used >= 0 AND used <= total`,
`valid_to >= valid_from`; index `(tenant_id, party_id, valid_to)`, `(tenant_id, subject_type,
subject_id)`.
**`attendance_entitlement_use`**: `entitlement_id` FK RESTRICT, `mark_id` FK RESTRICT, `delta
smallint` (`+1`\|`−1`); CHECK `delta IN (1,-1)`; index `(tenant_id, entitlement_id)`; unique
`(mark_id, delta)` (a mark consumes once and gives back once).

#### 6. API
`grant_entitlement(...)` (contracts), `extend_entitlement(*, ctx, entitlement_id, valid_to, reason)`,
`entitlement_for(tenant, subject_type, subject_id) -> Entitlement | None`,
`manage.py recalc_entitlements [--check|--apply]`. Consumption happens inside `check_in`/`roll_call`
under `SELECT … FOR UPDATE` on the entitlement (lock order: party → entitlement → mark).
Errors: 409 `entitlement_exhausted {total, used}` (also when outside validity, with `expired: true`);
400 `validation_error`.

#### 7. Frontend
`EntitlementChip` ("7 of 10 left · till 31 Oct") in `features/attendance/components`.

#### 8. UI/UX
The chip shows remaining and expiry; at 0 left it reads "Pack used up" in warning tone.

#### 9. Validation and business rules
- **BR-1** `used = Σ delta` over its use rows; `0 ≤ used ≤ total`.
- **BR-2** Only `present`, `late` and `visit` marks consume; `absent` and `excused` do not.
- **BR-3** Consumption outside `[valid_from, valid_to]` or at `used = total` → 409
  `entitlement_exhausted`.
- **BR-4** Void → one `−1` row; an edit from `present` to `absent` → `−1`; from `absent` to `present`
  → `+1` (subject to BR-3).

Worked example: pack total 12, used 11 → check-in → used 12 ("0 left"); next check-in → 409
`entitlement_exhausted {total: 12, used: 12}`; void of the last mark → used 11.

#### 10. Permissions
Grant and extend: vertical codename (`gym.membership.write`); consumption follows check-in.

#### 11. Reports
"Packs running low" (≤ 2 left) and "Packs expiring" (valid_to within 7 days) per module.

#### 12. Testing
- T-ATT-04-1 (unit) worked example; BR-2 and BR-4 transitions.
- T-ATT-04-2 (concurrency) two check-ins at `used = total − 1` → one consumes, one 409.
- T-ATT-04-3 (replay, property) seeded fuzz of marks, edits and voids: `used` = Σ delta;
  `recalc_entitlements --check` exits 0.

#### 13. Edge cases
1. EC-1 Two live packs for one member → the policy names which one (oldest expiring first is the gym
   FRD's rule).
2. EC-2 Extend after expiry → allowed with reason; audit `attendance.entitlement.extended`.

#### 14. Future
Merged top-ups; transferable packs (family).

---

### ATT-05 — Attendance reads and reports

#### 1. Product requirements
The monthly register a centre hands a parent, attendance percentages with a threshold, "not visited
in N days" for churn, and peak hours for staffing — one implementation for every module.

#### 2. User flows
Vertical report screens and the party page's "Attendance" panel (core-hosted registry entry, shown
when the engine is enabled): last visit, visits this month.

#### 3. Features
Minimum: selectors of contracts §2.3; read endpoints; registered reports with CSV and the printable
register; module-off guard (open visits). Later: absent-streak alerts in the bell.

#### 4. Entities and relationships
Reads ATT tables only.

#### 5. Database
No new table; `ix_attendance_module_date`, `ix_attendance_party_date`.

#### 6. API
| Method | Path | Query | Returns |
|---|---|---|---|
| GET | `/api/v1/attendance/register` | `group_id`, `month` (`2026-10`) | `{sessions: [...], rows: [{party, cells: {session_id: "P"\|"A"\|"L"\|"E"\|"-"\|"closed"}}]}` |
| GET | `/api/v1/attendance/percent` | `group_id`, `period`, `below` (optional threshold) | `[{party, held, attended, percent}]` |
| GET | `/api/v1/attendance/not-visited` | `module`, `days` | `[{party, last_visit_on}]` |
| GET | `/api/v1/attendance/visits-by-hour` | `module`, `from`, `to` | `[{hour, weekday, visits}]` |
Module-off guard: open visits with that module.

#### 7. Frontend
`RegisterGrid` (sticky first column, horizontal scroll inside its own container, never the page),
`AttendancePercentTable`, `RegisterPrint` (print pipeline, tenant name only),
`AttendancePartyPanel` registered in `modulePanels.ts` under core key `attendance`.

#### 8. UI/UX
Register cells: P, A, L, E, "–" (not enrolled), grey "Closed"; the percentage column in bold; the
threshold row in warning tone with words ("Below 75%").

#### 9. Validation and business rules
- **BR-1** `percent = attended / (held sessions while enrolled − excused) × 100`, one decimal,
  `attended = present + late`; cancelled sessions and not-enrolled dates are excluded.
- **BR-2** `not_visited_since`: last live `visit` or `present` mark older than N days, among parties
  with a live context (the vertical passes which contexts are live through its own endpoint).
- **BR-3** Voided marks never count.

Worked example: 13 sessions held in October while enrolled, 1 excused, 10 present, 1 late → 11 /
(13 − 1) = **91.7%**.

#### 10. Permissions
`ENGINE_READ_PERMISSIONS["attendance"]` per module; register print needs the same.

#### 11. Reports
Monthly register (print + CSV), Attendance % (threshold), Not visited in N days, Peak hours,
Overrides (who was let in anyway, by whom, why).

#### 12. Testing
- T-ATT-05-1 (unit) BR-1 worked example and edge cases (join mid-month, cancelled session).
- T-ATT-05-2 (plan) `EXPLAIN` of the register query for a 60-member batch over a month.
- T-ATT-05-3 (print) register carries the tenant name only.
- T-ATT-05-4 (contract) module-off guard counts open visits only.

#### 13. Edge cases
1. EC-1 A month with no sessions → empty grid with the group's name and "No classes this month".
2. EC-2 Member in two groups → two rows in two registers; the party panel sums visits.

#### 14. Future
Streak alerts; per-trainer attendance summaries.

---

# Part D — The bookings and resources engine (`apps/bookings`)

The engine holds resources and time: resource types and resources, availability, holds and
bookings, and the **slot rule** — one `bookings_slot` row per resource per slot key under
`UNIQUE (tenant, resource, slot_key)`, so the database refuses a double sale from any writer
(ADR-049). It posts **no money**: the vertical prices, invoices and takes advances. Time modes in
scope: `nights`, `days`, `shifts`, `slots`; `span` is not supported. Only hospitality consumes it in
scope (Wave D).

### BKG-01 — Resource types, resources, shifts and out of service

#### 1. Product requirements
A hotel defines "Deluxe" and "Standard" room types, rooms 101–140, check-in and check-out times,
and takes a room out of service for repairs without breaking a booking. A library (later) defines a
reading room with shifts.

#### 2. User flows
1. Vertical settings → Room types → New (name, time mode `nights`, capacity mode, check-in 12:00,
   check-out 11:00, hold minutes).
2. Rooms → New (label, type, attributes such as floor and AC).
3. Room → "Out of service" → dates and reason → refused with the list of bookings if any overlap.

#### 3. Features
Minimum: resource types, shifts (atomic-shift rule), resources, parent grouping, out-of-service with
conflict checks. Later: seasonal attributes; resource retirement with history.

#### 4. Entities and relationships
`bookings_resource_type 1—* bookings_resource`, `1—* bookings_shift`; `bookings_resource 1—*
bookings_out_of_service`; `bookings_resource.parent` self FK (a bed in a dorm).

#### 5. Database
Migration `bookings/0001_initial.py`.

**`bookings_resource_type`**: `module varchar(32)`, `code varchar(24)`, `name varchar(80)`,
`time_mode varchar(8)` (`nights`\|`days`\|`shifts`\|`slots`), `capacity_mode varchar(16)`
(`exclusive`\|`shared`\|`pooled_by_type`), `default_capacity smallint DEFAULT 1`, `check_in_time
time NULL`, `check_out_time time NULL`, `slot_minutes smallint NULL`, `hold_minutes smallint
DEFAULT 30`, `no_show_after_minutes smallint NULL` (pending CQ-18), `is_active`, `sort_order`.
Unique `(tenant_id, module, code)`; CHECKs `time_mode <> 'slots' OR slot_minutes BETWEEN 5 AND 480`,
`time_mode <> 'nights' OR (check_in_time IS NOT NULL AND check_out_time IS NOT NULL)`.

**`bookings_cancellation_tier`** (pending CQ-18): `resource_type_id` FK RESTRICT, `hours_before
integer` (tier applies when cancelling at least this many hours before start), `fee_percent
numeric(5,2)` (0–100), `basis varchar(12)` (`first_unit`\|`total`); unique `(resource_type_id,
hours_before)`.

**`bookings_shift`**: `resource_type_id` FK RESTRICT, `code varchar(8)`, `name varchar(40)`,
`start_time time`, `end_time time`; unique `(resource_type_id, code)`; CHECK `end_time >
start_time`.

**`bookings_resource`**: `type_id` FK RESTRICT, `label varchar(40)`, `parent_id` self FK RESTRICT
NULL, `capacity smallint DEFAULT 1`, `attributes jsonb DEFAULT '{}'` (module-defined keys, no money),
`is_active`, `sort_order`; unique `(tenant_id, type_id, label)`; CHECK `capacity BETWEEN 1 AND 999`.

**`bookings_out_of_service`**: `resource_id` FK RESTRICT, `from_on date`, `to_on date` (inclusive),
`reason varchar(120)`; CHECK `to_on >= from_on`; index `(tenant_id, resource_id, from_on)`.

#### 6. API
Python (contracts §2.2): `create_resource_type`, `create_resource`, `set_out_of_service`, plus
`update_resource_type`, `update_resource`, `create_shift`, `clear_out_of_service(oos_id)`.
Errors: 409 `resource_booked {booking_ids}` (out of service over active units),
`booking_capacity_reached {capacity, slot_key}` (pooled type would be over-sold); 400
`validation_error` (overlapping atomic shifts, bad times, a parent booked directly).
Read endpoints (`EngineEnabled("bookings")`): `GET /api/v1/bookings/resource-types?module`,
`GET /api/v1/bookings/resources?type_id`.

#### 7. Frontend
`features/bookings`: `api/bookingsService.ts` (reads), types, `redux/bookingsSlice.ts` (lazy),
`ResourceTypeForm` and `ResourceForm` presets (writes via the vertical's thunks as props).

#### 8. UI/UX
Labels in the vertical's words ("Room type", "Room"); out-of-service refusal lists the bookings by
guest and dates with links the vertical registers.

#### 9. Validation and business rules
- **BR-1** Atomic shifts (those containing no other shift of the type) must not overlap each other;
  a longer shift (a "Full day") covers the atomic shifts inside it.
- **BR-2** A resource with children is not bookable itself in MVP (book each child).
- **BR-3** Out of service is refused while any active unit holds a slot of that resource in the range;
  for `pooled_by_type`, also while removing the resource would leave fewer free resources than
  unassigned units on any night.
- **BR-4** Deactivating a resource with future active units is refused the same way.

#### 10. Permissions
Vertical codenames (`hospitality.room.write`); reads `ENGINE_READ_PERMISSIONS["bookings"] =
{"hospitality": "hospitality.booking.read"}`.

#### 11. Reports
Feeds BKG-05 (occupancy is the vertical's report built on the engine's grid).

#### 12. Testing
- T-BKG-01-1 (unit) atomic-shift rule; overlapping atomics refused.
- T-BKG-01-2 (unit) out of service over a booking → 409 with ids; over nothing → 201.
- T-BKG-01-3 (unit) pooled out-of-service capacity refusal.

#### 13. Edge cases
1. EC-1 Out of service starting today for a room checked in now → refused (resource_booked).
2. EC-2 Renaming a room → label unique per type; history keeps the id.

#### 14. Future
Retire with history; seasonal attributes; bed-level dorm pricing (the vertical's).

---

### BKG-02 — Availability

#### 1. Product requirements
"Which Deluxe rooms are free 12–15 Oct?" and a tape chart of rooms × nights must be one plain query
over the same slot rows that guarantee no double sale; an expired hold counts as free even before the
job has run.

#### 2. User flows
Vertical "New booking" → dates → free rooms by type with counts; the tape chart page reads the grid.

#### 3. Features
Minimum: `availability()` for a type or resources over a range (and shift); grid read endpoint.
Later: price-aware search (the vertical's).

#### 4. Entities and relationships
Reads `bookings_slot`, `bookings_booking_unit`, `bookings_booking`, `bookings_out_of_service`.

#### 5. Database
Index `ix_bookings_slot_resource_key` is the unique index itself `(tenant_id, resource_id,
slot_key)`; plus `ix_bookings_slot_key (tenant_id, slot_key)` for date-range scans.

#### 6. API
`availability(*, tenant, type_id=None, resource_ids=None, start_on, end_on, shift=None) ->
Availability` = `{keys: [slot_key…], resources: [{id, label, free: bool, cells: {slot_key:
"free"|"booked"|"hold"|"out_of_service"}}], free_count_by_key: {…}}`.
`GET /api/v1/bookings/availability?type_id|resource_ids&start_on&end_on&shift` (range ≤ 62 days) and
`GET /api/v1/bookings/grid?type_id&from&to` (≤ 62 days; each cell carries `booking_id` and a
vertical-registered label). Errors: 400 range too long / `end_on ≤ start_on`; 404.

#### 7. Frontend
`AvailabilityGrid` (the tape chart: resources × keys, sticky resource column, horizontal scroll in
its own container, cells as buttons with accessible names "Room 101, 12 Oct, booked by Mehta").

#### 8. UI/UX
Free cells plain; booked cells in the primary tint with the guest's short name; holds hatched with
"Hold until 3:40 pm"; out of service grey with the reason. Never colour alone.

#### 9. Validation and business rules
- **BR-1** A slot is taken when a slot row exists whose unit is active and whose booking is not an
  expired hold (`status='hold' AND hold_expires_at < now()` counts as free).
- **BR-2** `nights`: keys are the dates `[start_on, end_on)`; `days`: the same (end exclusive);
  `shifts`: `date/<atomic shift code>`; `slots`: `dateTHH:MM` per slot start.
- **BR-3** Out-of-service dates are unavailable whatever the slot rows say.
- **BR-4** Pooled types report `free_count_by_key = active resources − out of service − assigned slot
  rows − unassigned units covering the key`.

Worked example: 40 Deluxe rooms; 12–15 Oct keys 12, 13, 14; 36 booked on 13 Oct, one out of service
13–14 Oct, two unassigned pooled units → free on 13 Oct = 40 − 1 − 36 − 2 = **1**.

#### 10. Permissions
Read codename of the consuming module.

#### 11. Reports
Occupancy (vertical) reads the grid.

#### 12. Testing
- T-BKG-02-1 (unit) BR-1..BR-4 including an expired hold before the job ran.
- T-BKG-02-2 (plan) `EXPLAIN` for 40 resources × 62 days uses the slot indexes; ≤ 3 queries.
- T-BKG-02-3 (component) grid cells have accessible names; the page never scrolls sideways at 360 px
  (the measuring check).

#### 13. Edge cases
1. EC-1 Back-to-back: check-out 12 Oct and check-in 12 Oct on one room → no conflict (half-open).
2. EC-2 Range spanning a DST change → none in India; `timestamptz` anyway.

#### 14. Future
Search by attributes (AC, floor) through the vertical.

---

### BKG-03 — Hold, book, confirm and expiry: the slot rule

#### 1. Product requirements
Two front-desk devices must never sell the same room for the same night, including when an import or
a shell bypasses the service; a tentative hold blocks the room until it expires; a class of 20
takes 20 and refuses the 21st (ADR-049).

#### 2. User flows
1. **Hold**: New booking → room and dates → "Hold for 30 min" → the room shows as hold.
2. **Confirm**: advance recorded (vertical, payments) → "Confirm" → confirmed.
3. **Direct book**: walk-in → book and confirm in one act.
4. **Lose the race**: the other device took the room a moment earlier → 409 with the room and nights
   → the dialog offers the next free rooms.

#### 3. Features
Minimum: `hold`, `book`, `confirm`, slot-row writes, capacity counting for shared and pooled,
lazy expiry, `expire_holds` job, booking numbers (pending CQ-19). Later: overbooking allowance
(default no), series bookings (weekly class).

#### 4. Entities and relationships
`bookings_booking 1—* bookings_booking_unit 1—* bookings_slot *—1 bookings_resource`.

#### 5. Database
**`bookings_booking`**: `module varchar(32)`, `party_id` FK RESTRICT, `subject_type varchar(48)`,
`subject_id uuid`, `number varchar(32) NULL`, `status varchar(10)`
(`hold`\|`confirmed`\|`checked_in`\|`completed`\|`cancelled`\|`expired`\|`no_show`),
`hold_expires_at timestamptz NULL`, `source varchar(16) DEFAULT ''`, `notes varchar(255) DEFAULT
''`, `version integer DEFAULT 1`. CHECK `status <> 'hold' OR hold_expires_at IS NOT NULL`; unique
`(tenant_id, number) WHERE number IS NOT NULL`; indexes `(tenant_id, module, status)`,
`(tenant_id, party_id, status)`, `(tenant_id, subject_type, subject_id)`,
`ix_bookings_hold_expiry (tenant_id, hold_expires_at) WHERE status='hold'`.

**`bookings_booking_unit`**: `booking_id` FK RESTRICT, `resource_type_id` FK RESTRICT,
`resource_id` FK RESTRICT NULL (pooled until assigned), `start_on date`, `end_on date` (exclusive),
`shift_id` FK NULL, `start_time time NULL`, `slot_count smallint DEFAULT 1` (slots mode; pending
CQ-18), `quantity smallint DEFAULT 1`, `status varchar(10)` (`booked`\|`checked_in`\|
`checked_out`\|`released`; pending CQ-18), `checked_in_at`, `checked_out_at` `timestamptz NULL`.
CHECKs `end_on > start_on`, `quantity >= 1`; index `(tenant_id, resource_id, start_on)`,
`(tenant_id, resource_type_id, start_on) WHERE resource_id IS NULL AND status='booked'`.

**`bookings_slot`**: `resource_id` FK RESTRICT, `slot_key varchar(24)`, `unit_id` FK RESTRICT,
`created_at`; **`UNIQUE (tenant_id, resource_id, slot_key)`** (contracts). For `shared` resources the
key carries a seat ordinal suffix `#nn` (1…capacity) so the same unique index bounds capacity
(pending CQ-20). Index `(tenant_id, slot_key)`, `(tenant_id, unit_id)`. Rows are **deleted** on
release (ADR-049); the booking and audit rows keep history.

#### 6. API
Python (contracts §2.2): `hold`, `book`, `confirm`, `expire_holds(tenant, now) -> int`,
`register_booking_subject(subject_type, *, module, label, on_status_changed=None)`.
`UnitRequest = {resource_type_id, resource_id?, start_on, end_on, shift_id?, start_time?,
slot_count?, quantity?}`. `hold`/`book` accept `number: str | None` allocated by the vertical
(pending CQ-19).
Algorithm (one transaction): lock the resource rows (or the type row for `pooled_by_type`) in id
order → delete slot rows of expired holds on them (and mark those bookings `expired`) → check out of
service → exclusive: insert slot rows (the unique index refuses a second writer) → shared: pick free
ordinals, insert → pooled unassigned: count demand per key vs free, refuse above → insert booking,
units, slots → `on_status_changed` → audit.
The vertical exposes its own endpoints (`POST /hospitality/bookings`); the engine adds
`GET /api/v1/bookings/bookings?party_id&module&status&from&to` and `GET /api/v1/bookings/bookings/{id}`.
Errors: 409 `booking_slot_taken {resource_id, slot_keys}`, `booking_capacity_reached {capacity,
slot_key}`, `booking_not_open {status}` (confirm of a non-hold), `stale_version`; 400
`validation_error` (end ≤ start, range > 18 months ahead, shift of another type, resource of
another type, parent resource).

#### 7. Frontend
`features/bookings/components`: `SlotTakenDialog` (renders the 409's resource and nights, offers
the next free resources from `availability`), `HoldCountdown`, `BookingStatusBadge`.

#### 8. UI/UX
A hold shows its countdown; confirm is one tap once the vertical's advance rule is met; the race loss
is factual: "Room 101 was just booked for 13–14 Oct. Free Deluxe rooms: 104, 112."

#### 9. Validation and business rules
- **BR-1** A `nights` unit from 12 Oct to 15 Oct writes three rows (12, 13, 14).
- **BR-2** Exclusive: the unique index is the guarantee against any writer; the service maps the
  `IntegrityError` to `booking_slot_taken` with the keys.
- **BR-3** Shared: ordinals 1…capacity; a 21st on a capacity-20 slot finds no free ordinal →
  `booking_capacity_reached`.
- **BR-4** Pooled: under the type lock, demand ≤ free per key; the nightly check (BKG-05) reports any
  breach.
- **BR-5** Expired holds are freed lazily inside every write that locks the resource, and by the
  hourly `bookings.expire_holds` job; correctness never waits on the job.
- **BR-6** Holds default to the type's `hold_minutes`; `confirm` clears `hold_expires_at`; a hold can
  be extended by the vertical (`extend_hold(booking_id, minutes)`, audited).
- **BR-7** Bookings post no money.

Worked example: device A and B both book Room 101 for 13 Oct at the same instant: A's transaction
inserts `(101, 2026-10-13)`; B waits on the resource lock, then its insert violates
`UNIQUE (tenant, resource, slot_key)` → 409 `booking_slot_taken {resource_id: "101…", slot_keys:
["2026-10-13"]}`. A psql `INSERT` of the same row fails the same way.

#### 10. Permissions
Vertical codenames (`hospitality.booking.write`); the engine checks none.

#### 11. Reports
BKG-05.

#### 12. Testing
- T-BKG-03-1 (concurrency) two transactions, one room-night → exactly one succeeds, the other 409.
- T-BKG-03-2 (DB) a raw duplicate slot insert raises (any writer).
- T-BKG-03-3 (concurrency) 25 simultaneous seats on a capacity-20 shared slot → 20 succeed.
- T-BKG-03-4 (unit) expired hold freed lazily by the next booking of that room; job marks the rest.
- T-BKG-03-5 (unit) pooled demand vs free; refusal at the limit.
- T-BKG-03-6 (unit, fake subject) `on_status_changed` called for hold, confirm, expire.
- T-BKG-03-7 (performance) booking 3 nights ≤ 10 queries.

#### 13. Edge cases
1. EC-1 A hold expires while the guest is paying → confirm → 409 `booking_not_open {status:
   "expired"}`; the vertical re-books (the room may be gone).
2. EC-2 Two units of one booking conflicting with each other → 400 before any insert.
3. EC-3 A booking 18 months ahead → allowed; beyond → 400 (slot rows are materialised only for the
   booking window, ADR-049).

#### 14. Future
Series bookings from a recurrence; overbooking allowance per type; `span` mode (needs an ADR).

---

### BKG-04 — Change, check-in, check-out, cancel and no-show

#### 1. Product requirements
Stays change: an extra night, a room move, an early departure, a cancellation with a fee, a
no-show. Every change is re-validated under the same lock and slot rule; history stays in the
booking and audit rows.

#### 2. User flows
1. **Extend**: "Add a night" → free? → saved; taken → 409 with the night.
2. **Move room**: pick a free room → slot rows moved in one transaction.
3. **Check in / out** from the day sheet.
4. **Cancel**: reason → the engine returns the tier; the vertical shows "Cancellation fee ₹1,500
   (50% of the first night)" and posts it.
5. **No-show**: after the threshold → "Mark no-show".

#### 3. Features
Minimum: `change_unit`, `check_in`, `check_out` (early departure releases later slots),
`cancel` with `cancellation_fee`, `mark_no_show`, status callbacks. Later: fee override approvals
(the vertical's role check).

#### 4. Entities and relationships
As BKG-03.

#### 5. Database
No new table; uses BKG-03's.

#### 6. API
Python (contracts §2.2): `change_unit`, `check_in`, `check_out`, `cancel -> CancelResult`,
`mark_no_show`, `cancellation_fee(*, tenant, booking_id, at) -> Fee`.
`Fee = {tier_hours_before: int | None, fee_percent: "50.00", basis: "first_unit" | "total",
hours_before_start: 30}` — **a rule, not rupees**: the engine holds no prices; the vertical applies
it to its own quote and posts through the port or payments (pending CQ-18).
`CancelResult = {booking, fee: Fee, released_slot_keys: [...]}`.
Errors: 409 `booking_not_open {status}`, `booking_slot_taken`, `booking_capacity_reached`,
`stale_version`; 400 `validation_error` (check-in before `start_on`, check-out before check-in,
no-show before the threshold).

#### 7. Frontend
`ChangeUnitDialog`, `CancelBookingDialog` (shows the vertical's fee figure from its own preview
endpoint), day-sheet row actions; all `dynamic()`.

#### 8. UI/UX
Consequences shown before confirming ("Frees 14–15 Oct · Fee ₹1,500"). Early departure asks "Check
out today and free 14 Oct?".

#### 9. Validation and business rules
- **BR-1** `change_unit` releases the unit's slot rows and inserts the new ones in one transaction;
  on conflict nothing changes.
- **BR-2** Check-in allowed from `start_on` (tenant-local) on a `confirmed` booking; the booking is
  `checked_in` when its first unit is.
- **BR-3** Check-out on date d: for `nights`, slot rows with key ≥ d are released (early departure);
  the booking is `completed` when every unit is out.
- **BR-4** Cancel from `hold` or `confirmed` only; releases all slot rows; fee tier = the highest
  `hours_before` ≤ hours remaining to the start (check-in time on `start_on`), else no fee.
- **BR-5** No-show from `confirmed` once `now ≥ start + no_show_after_minutes`; releases slots; fee
  as the 0-hour tier.
- **BR-6** Every status change calls `on_status_changed` and writes `bookings.booking.<verb>`.

Worked example: tiers {48 h: 0%, 24 h: 50% first_unit, 0 h: 100% first_unit}; check-in 12 Oct 12:00,
cancel 11 Oct 06:00 = 30 h before → tier 24 h → `{fee_percent: "50.00", basis: "first_unit"}`. The
vertical's quote: 3 nights at ₹3,000.00 each, so the first unit (night) is 300000 p → fee = 50% ×
300000 = **150000 p (₹1,500.00)**, posted by hospitality. Cancel at 13:00 on 11 Oct (23 h before) →
the 0-hour tier, 100% → 300000 p.

#### 10. Permissions
Vertical codenames; fee waivers above a limit are the vertical's role check.

#### 11. Reports
Cancellations and no-shows (BKG-05).

#### 12. Testing
- T-BKG-04-1 (unit) extend free/taken; move room atomic.
- T-BKG-04-2 (unit) early check-out releases later nights; a new booking can take them.
- T-BKG-04-3 (unit) tier selection at edges (exactly 48 h, 24 h, 0 h).
- T-BKG-04-4 (unit) no-show threshold; statuses and callbacks.
- T-BKG-04-5 (concurrency) move racing a new booking for the target room → one wins, the other 409.

#### 13. Edge cases
1. EC-1 Check-in on a room that another booking still occupies (late check-out) → the slot rule
   refuses only overlapping keys; the day sheet shows "Room not ready" from the vertical's
   housekeeping state.
2. EC-2 Cancel a checked-in booking → refused (`booking_not_open`); use early check-out.

#### 14. Future
Fee override approvals; partial cancellation of one unit of several (supported by `change_unit`
shrinking to zero later).

---

### BKG-05 — Integrity check and booking reads

#### 1. Product requirements
Shared and pooled capacity rest on a count under a lock, which a second writer could bypass; a
nightly integrity check reports any breach, as `recalc_balances` does for balances (ADR-049). A
party's bookings across modules, the day sheet and the module-off guard complete the engine.

#### 2. User flows
Operators read the nightly log; merchants see the day sheet ("Arrivals 6 · Departures 4 · In house
31") and the party page's "Bookings" panel.

#### 3. Features
Minimum: `check_integrity` job and `manage.py check_bookings`, day sheet read, party bookings read,
module-off guard, archive guard (active bookings), source resolver not needed (no ledger rows).

#### 4. Entities and relationships
Reads BKG tables.

#### 5. Database
No new table.

#### 6. API
`check_integrity(*, tenant) -> list[Problem]` where `Problem = {kind: "over_capacity" |
"slot_without_active_unit" | "active_unit_without_slots", resource_id, slot_key, detail}`;
`register_schedule(Schedule("bookings.check_integrity", daily, 03:25 IST))`, report-only, logs at
ERROR with counts (never guest names).
| Method | Path | Query | Returns |
|---|---|---|---|
| GET | `/api/v1/bookings/day-sheet` | `module`, `date` | `{arrivals, departures, in_house}` lists |
| GET | `/api/v1/bookings/bookings` | `party_id`, … | (BKG-03) |
Guards: module-off (bookings `hold` unexpired, `confirmed`, `checked_in` with that module); archive
(party with such bookings).

#### 7. Frontend
`DaySheet` component; `BookingsPartyPanel` registered in `modulePanels.ts` under core key `bookings`.

#### 8. UI/UX
Day sheet in three tabs with counts; each row names guest, room and nights.

#### 9. Validation and business rules
- **BR-1** The check never writes; `--apply` does not exist: a breach is a bug report.
- **BR-2** Over capacity = count of active units per key > free resources (pooled) or ordinals >
  capacity (shared).

#### 10. Permissions
Read codename of the consuming module; the command is operator-only.

#### 11. Reports
Cancellations and no-shows by month; arrivals/departures CSV (the vertical's Form III list builds on
it in hospitality's FRD).

#### 12. Testing
- T-BKG-05-1 (unit) each problem kind planted and detected; a clean tenant reports none.
- T-BKG-05-2 (contract) module-off and archive guards.
- T-BKG-05-3 (plan) day sheet `EXPLAIN` for a 40-room hotel.

#### 13. Edge cases
1. EC-1 A problem found → logged; nothing changes; the operator decides.
2. EC-2 Module off → day sheet 403 for that module; history kept.

#### 14. Future
Occupancy snapshots for fast reports.

---
# Part E — Traceability, implementation plan and Definition of Done

## T. Traceability

Module FRDs are `docs/platform/frd/<module>.md` (vision §6). "Uses" means the module FRD relies on
the item; ● = required for the module's MVP, ○ = used by a later increment of that module.

| Item | Wave A step (10-arch §13) | ADR | Contracts | Depends on | Lending | Library | Gym | Hospitality | Engines using it |
|---|---|---|---|---|---|---|---|---|---|
| PLT-X01 buckets, caches, posting registry, entry types | A2, A3 | 043, 042, 048 | §1.2, §1.3 | — | ● | ● | ● (deposit) | ● (deposit) | dues |
| PLT-X02 held deposits | A4 | 044 | §1.4 | X01, X03 | ○ | ● | ● | ● | — |
| PLT-X03 target protocol v2, `allocate_existing` | A4 | 047 | §1.4 | X01 | ● | ● | ● | ● | dues |
| PLT-X04 roles, relations, archive guards | A6 | 046 | §1.3 | — | ● | ● | ● | ● | dues, bookings |
| PLT-X05 document port | A5 | 045, 048 | §1.5 | X03 | — | ○ | ● | ● | dues |
| PLT-X06 reminders: source, notices, guardrails | A7 | 054, 043 | §1.6 | X01, X04 | ● | ● | ● | ○ | dues |
| PLT-X07 number kinds, perpetual counter | A8 | 051 | §1.7 | — | ● | ● | ● | ● | bookings (numbers via vertical) |
| PLT-X08 closed-day calendar | A9 | 055 | §1.8 | — | ● | ● | ● | — | dues, attendance |
| PLT-X09 recurrence, periods, rounding | A9 | 055 | §1.8 | — | ● | ○ | ● | ○ | dues, attendance, bookings |
| PLT-X10 engine enablement, module-off guards | (A1) | 041 | §1.1, 10-arch §8–9 | X11 | ● | ● | ● | ● | all three |
| PLT-X11 `UNRELEASED_MODULES`, release migration | A1 | 041 | §1.1, 10-arch §2.4 | — | ● | ● | ● | ● | — |
| PLT-X12 row scoping, module roles | (A6/A10) | 052 | §3 | X11 | ● | — | ● | ● | — |
| PLT-X13 registries: schedules, dashboard, reports, notifications | A10 | 042 | §1.9 | — | ● | ● | ● | ● | all three |
| PLT-X14 import boundaries | A11 | 041 | 10-arch §10.1 | — | ● | ● | ● | ● | all three |
| DUE-01 plans, schedules | B | 048, 055 | §2.1 | X01, X03, X05, X09 | ● | ○ | ● | ○ | — |
| DUE-02 daily run | B | 048 | §2.1 | DUE-01, X08, X13 | ● | ○ | ● | ○ | — |
| DUE-03 settlement, split, advances | B | 047 | §2.1, §1.4 | DUE-01, X03 | ● | ○ | ● | ○ | — |
| DUE-04 adjustments, end, cancel | B | 048 | §2.1 | DUE-03 | ● | ○ | ● | ○ | — |
| DUE-05 pause, resume, reschedule | B | 048 | §2.1 | DUE-01 | ● (reschedule) | — | ● (freeze) | — | — |
| DUE-06 reads, reminders, reports, guards | B | 041, 054 | §2.1 | DUE-01, X06, X10, X13 | ● | ○ | ● | ○ | — |
| ATT-01 groups, sessions | B | 050, 055 | §2.3 | X08, X09 | — | ○ | ● | — | — |
| ATT-02 check-in with policy hook | B | 050 | §2.3 | ATT-01 | — | ○ | ● | — | — |
| ATT-03 roll-call, edits, voids | B | 050 | §2.3 | ATT-02 | — | — | ● | — | — |
| ATT-04 entitlements | B | 050 | §2.3 | ATT-02 | — | — | ● | — | — |
| ATT-05 reads, reports | B | 050, 041 | §2.3 | ATT-01..04, X10, X13 | — | ○ | ● | — | — |
| BKG-01 resources, shifts, out of service | D | 049 | §2.2 | X09 | — | ○ (seats) | ○ (classes) | ● | — |
| BKG-02 availability | D | 049 | §2.2 | BKG-01 | — | ○ | ○ | ● | — |
| BKG-03 hold/book/confirm, slot rule | D | 049 | §2.2 | BKG-02, X07 | — | ○ | ○ | ● | — |
| BKG-04 change, check-in/out, cancel, no-show | D | 049 | §2.2 | BKG-03 | — | ○ | ○ | ● | — |
| BKG-05 integrity, reads | D | 049, 041 | §2.2 | BKG-03, X10, X13 | — | ○ | ○ | ● | — |

ADR-053 (identity documents: type + last four) is implemented by each vertical's own columns and by
PLT-X12's `RestrictedFieldsMixin`; it has no core feature of its own here.

## I. Ordered implementation task list

Sizes: **S** ≤ 1 day, **M** 2–3 days, **L** 4–6 days, **XL** 7–10 days, for one agent including
tests, the look-and-fix loop and the gates (CLAUDE.md "review, build, look, report"). Tasks in the
same row group may run in parallel on separate tracks (HANDOFF §3: three at most); a task starts
only when the tasks named in "After" are merged.

| # | Task | Feature | Size | After |
|---|---|---|---|---|
| 1 | `ModuleCode` values, `UNRELEASED_MODULES`, `released_modules()`, env flag + start-up refusal, gates in `modules_view`/`update_enabled_modules`/`ModuleEnabled`/`effective_modules`, frontend `MODULE_CODES` + equality test | X11 | M | — |
| 2 | Import matrix for seven apps, `ast.walk` test with planted fixture, ESLint zones | X14 | S | — |
| 3 | `recurrence.py`, `periods.py`, `money.round_amount/split_total`, `RecurrenceFields` mixin, fuzz tests | X09 | M | — |
| 4 | `register_schedule`, dashboard/report/notification registries, `GET /reports` and `sections`, frontend registries | X13 | M | — |
| 5 | Ledger `bucket` migration + trigger re-creation, `BALANCE_BUCKETS`, entry types, `register_posting_source` (four existing sources re-registered), `apply_entry(bucket)`, party caches, selectors/aging/statement/drift/`recalc_balances`, golden-file regression, trade figure in credit exposure, frontend labels and statement deposit block | X01 | XL | 2 |
| 6 | Target protocol v2, bucket derivation and one-bucket rule, global auto FIFO, `allocate_existing` service + endpoint, shared target contract suite, Apply-to-bills UI | X03 | L | 5 |
| 7 | Held deposits: tables, services, `adjustment` mode and its refusals, cashbook exclusion, void pairing, deposits API, deposit guard, shared deposit components, deposits report | X02 | L | 6 |
| 8 | Document port module, sales origin columns, `SalesIssuer`, `credit_check="skip"`, `apply_open_advances`, listener calls in void and `refresh_invoice_amounts`, origin badge/filter | X05 | L | 6 (and CQ-1, CQ-2 answered) |
| 9 | Party roles registry + `?role=` + badges, `parties_relation` + API + UI, archive guards in single and bulk archive, module panels registry | X04 | M | 5 |
| 10 | Reminder source columns + index migration, candidate and policy registries, `check_reminder_allowed` on every path, trade figure, module tabs, window settings | X06 | M | 5, 9 |
| 11 | `register_number_kind`, `allocate_counter`/`peek`/`raise`, fy_label CHECK, settings numbering payload | X07 | S | — |
| 12 | `platform_closed_day`, weekday setting, calendar services and API, Business days screen, reader registry | X08 | M | 3 |
| 13 | `ENGINES_USED_BY`, `engine_enabled`, `EngineEnabled`, idempotent labelled guards + breakdown, enable hook, `ENGINE_READ_PERMISSIONS` | X10 | M | 1 |
| 14 | `ScopedViewSetMixin`, `RestrictedFieldsMixin`, `register_module_role`, `permissions_for` for module roles, roles API filter, team UI, architecture test | X12 | M | 1, 13 |
| — | **Wave A gate** (vision §5): all of 1–14 merged, gates green, owner's Mac fast-forwarded | | | 1–14 |
| 15 | Attendance: schema, groups/sessions, check-in/out + policy + override + dedupe, roll-call/edit/void, entitlements + replay, reads/reports, guards, shared UI, test subject | ATT-01..05 | XL | gate |
| 16 | Dues: schema, plans/schedules/preview/backdated, subject registry, read API | DUE-01 | L | gate |
| 17 | Dues: daily run (ledger posting first, then document posting), catch-up fuzz | DUE-02 | L | 16 |
| 18 | Dues: targets, settlement split, `plan_allocation`, `payoff`, origin listener, advance auto-apply, dues replay fuzz, `recalc_dues` | DUE-03 | L | 17 |
| 19 | Dues: penalties, waivers (role ceiling), end/cancel, slip | DUE-04 | L | 18 |
| 20 | Dues: pause/resume/reschedule | DUE-05 | M | 17 |
| 21 | Dues: selectors, read endpoints, reminder source, reports, guards, party panel | DUE-06 | M | 18, 10 |
| 22 | Bookings: schema, resources/shifts/out of service | BKG-01 | M | Wave C done (10-arch §13.2) |
| 23 | Bookings: availability + grid | BKG-02 | M | 22 |
| 24 | Bookings: hold/book/confirm, slot rule, expiry, concurrency suite | BKG-03 | L | 23 (and CQ-18, CQ-19, CQ-20 answered) |
| 25 | Bookings: change, check-in/out, cancel, no-show, fee rule | BKG-04 | M | 24 |
| 26 | Bookings: integrity check, day sheet, guards, party panel | BKG-05 | S | 24 |

Estimated total: Wave A ≈ 38–52 agent-days; attendance ≈ 8–10; dues ≈ 22–28; bookings ≈ 14–18.
The critical path is 5 → 6 → 7/8 → gate → 16 → 17 → 18 → 19.

## D. Definition of Done per feature

Every feature also meets Part 35 (the six surfaces, canon §0.11) and these common items:
**(c1)** backend, frontend, type-check, lint, unit, bundle and i18n gates green (CLAUDE.md "Gates");
**(c2)** `makemigrations --check` clean, every migration reversible and run forward and back on a
copy of a seeded database; **(c3)** every new error code in `error_codes.py` and Part 22 §22.1.1
with the equality test green; **(c4)** every new table in `tenant_data.py` and the coverage test
green; **(c5)** every new registry has `_reset_for_tests()` and a contract test; **(c6)** every new
cache has a replay test and a `--check` command or joins one; **(c7)** audit actions declared on
`AuditAction`; **(c8)** the stack brought up and the feature exercised by hand like a tester, with
what was found fixed before moving on, and a `--shots` sweep at four widths with the measuring checks
for every screen touched; **(c9)** copy in `en` and `hi`; **(c10)** a commit message in prose saying
why; tests carry docstrings naming the defect they prevent.

| Feature | Done when, in addition |
|---|---|
| PLT-X01 | T-1…T-13 pass; `recalc_balances --check` clean on the e2e stack; golden-file regression proves today's tenants see identical aging, statement and dashboard; `e2e/statement.mjs` and `e2e/ledger.mjs` unchanged and green; the deposit-block sweep added |
| PLT-X02 | T-1…T-12 pass; the worked example reproduced by hand on the live stack including the cashbook; void of either adjustment voids both; deposits report CSV opens in a spreadsheet |
| PLT-X03 | the shared target contract suite runs over every registered target in CI; Apply-to-bills works end to end in the payments e2e; mixed-bucket refusal verified through the network |
| PLT-X04 | `e2e/parties.mjs` gains role-filter and relations checks asserting requests; archive refusal verified for a fake module guard; query budget test for badges |
| PLT-X05 | port contract tests with a fake origin; `import` test for `seams/documents.py`; a module invoice printed shows the tenant name only; CQ-1 and CQ-2 answered and recorded in contracts by the architecture owner |
| PLT-X06 | every recording path proven to call the policy (T-3); window refusals verified in the browser with no request reaching `/send`; migration reverse tested with existing auto rows |
| PLT-X07 | FY-boundary and 20-thread tests pass; numbering screen shows a registered fake kind only when its module is on |
| PLT-X08 | calendar API and screen live; `closed_days_between` one query; screen hidden with no reader module |
| PLT-X09 | fuzz tests over 10,000 rules and 10,000 splits pass; primitives import nothing from `apps.*` |
| PLT-X10 | every registered counter passes the guard contract; engine endpoints 403 without a consumer and filter rows by module |
| PLT-X11 | no unreleased code in any response without the flag; start-up refuses the flag in production settings; `MODULE_CODES` equality test green |
| PLT-X12 | mixin fail-closed test; architecture test over vertical viewsets; `permissions_for` handles module roles; out-of-scope 404 tests assert the signed-in user first |
| PLT-X13 | dashboard survives a failing section; registered selectors within the query budget; no dead report link |
| PLT-X14 | planted deferred import and planted ESLint import both fail the build |
| DUE-01 | preview and backdated confirmation reproduce the worked examples; snapshot immunity to plan edits proven |
| DUE-02 | catch-up fuzz equals day-by-day runs; double run is a no-op; one failing schedule does not stop the others |
| DUE-03 | **dues replay fuzz** (T-DUE-03-4) green: settlements, `party.balance` and `party.loan_balance` all equal their replays; `recalc_dues --check` clean on the e2e stack; three allocation orders reproduce the worked example |
| DUE-04 | every penalty formula and leave policy reproduces its worked example; waiver ceiling is a role check; cancel leaves payments as advances |
| DUE-05 | shift/skip/reschedule worked examples; limits refuse with `limit` and `used` |
| DUE-06 | selectors within their plans (`EXPLAIN`); reminder candidates at bucket edges; guards pass the contract |
| ATT-01 | generation skips closed days; regeneration idempotent |
| ATT-02 | check-in p95 ≤ 150 ms with a real policy on the e2e stack; dedupe and override verified at the desk by hand |
| ATT-03 | roll-call sweep at 360 px has no overflow; edit window enforced |
| ATT-04 | entitlement replay fuzz green; concurrency test green |
| ATT-05 | register prints with the tenant name only; percentages match the worked example |
| BKG-01 | out-of-service refusals list bookings |
| BKG-02 | availability for 40 rooms × 62 nights ≤ 3 queries; tape chart does not scroll the page at 360 px |
| BKG-03 | the two-writer and raw-insert tests prove the database refuses a double sale; capacity-20 test green |
| BKG-04 | tier edges exact; early check-out frees later nights for a new booking |
| BKG-05 | every planted problem kind detected; clean tenant clean |

---

# C. Contract questions for the architecture owner

Found while writing this FRD against the code at `30798d2`. None has been changed in
`11-contracts.md`; each has a proposed answer that the body above follows, marked "pending CQ-n".
**Blocking** means the named task (§I) must not start until it is answered.

| # | Where | The contradiction or gap | Proposed answer | Blocking |
|---|---|---|---|---|
| CQ-1 | contracts §1.5; `apps/sales/services/amounts.py:56`; `payments/services/targets/sales.py:102` | `OriginListener.on_settlement_changed(*, ctx, …)` needs a `ctx`, but `refresh_invoice_amounts(invoice, *, amount_paid=None)` takes none, and it is called from the sales target's `apply()`, whose protocol (even v2) passes no `ctx`. | Add an optional `ctx=None` keyword to `refresh_invoice_amounts` and to `AllocationTarget.apply/unapply` (v2 already adds `payment_id`); callers pass theirs; `None` falls back to `Ctx.system(invoice.tenant)` so audit rows are never unattributed silently. | Task 8 |
| CQ-2 | contracts §1.5 `DocumentLine.gst_rate`; `apps/sales/services/lines.py:98-130` | Sales lines are taxed by `tax_code` resolved per date (`rate_for(tenant, code, on_date)`), not by a rate. The port line carries a `Decimal` rate. | The issuer maps `gst_rate` to the tenant's tax code for that rate on the document date through a `tax` selector `code_for_rate(tenant, rate, on_date)`; no match → 400 on `lines.N.gst_rate`. Optionally allow `tax_code` on `DocumentLine` too, preferred when given. | Task 8 |
| CQ-3 | contracts §1.5 "Kind is `kind_for(tenant)`" | The real signature is `kind_for(tenant, requested)` (`payload.py:39`). | Call `kind_for(tenant, None)`; wording only. | No |
| CQ-4 | contracts §1.4 "the cashbook's `bucket_of` excludes it (`apps/reports/selectors/cash_sources.py`)" | `bucket_of` lives in `apps/expenses/selectors/cashbook.py:63` and maps a mode to cash/bank; the exclusion belongs in `PaymentCashSource.rows` and `_NET_SQL` in `reports/selectors/cash_sources.py`. "Bucket" now also names the ledger bucket. | Exclude `adjustment` parts in `PaymentCashSource` (both the rows and the net SQL); leave `bucket_of` alone; in code call the ledger one `bucket` and the cashbook one `cash_bucket` in new identifiers. | No |
| CQ-5 | contracts §1.4 ("an unallocated payment is `main`"; `allocate_existing` must match "the payment's direction and bucket") | `payments_payment` has no bucket column, so the payment's bucket must be derived from its ledger line; and a payment whose allocations were partly released (document void) or which exceeded its dues keeps its **original** bucket as an advance, so "unallocated ⇒ main" holds only for payments recorded with no allocation. | Derive the bucket from the payment's `payment_in/out` ledger line (one indexed lookup); state that a payment's bucket is fixed at record time. Alternative: add `payments_payment.bucket varchar(8)` (denormalised, frozen) — cheaper reads, one more migration. | Task 6 |
| CQ-6 | contracts §1.4 ("`targets_for_direction` used by `auto` returns only `auto=True` targets") | `_auto` (`record.py:223-237`) walks targets in **registration order**, FIFO within each; with `sales_document`, `dues_due` and `library_charge` all auto, a later invoice would be paid before an older fee. | Global oldest-first across auto targets by `(document_date, number, id)`, ties by `document_type`; lock all candidates per target in target order first (still party → documents), then choose. | Task 6 |
| CQ-7 | contracts §1.4 registered targets; `payments_allocation.document_type varchar(32)` | Subject and origin types are `varchar(48)` elsewhere; allocation document types must stay ≤ 32. | `register_target` refuses longer names; all names in contracts fit. | No |
| CQ-8 | contracts §1.2 posting registry; `apps/ledger/models.py` `source_type` has `choices=SourceType.choices` | Registered source types are not members of the `SourceType` enum; model validation and admin forms would reject them. | Remove `choices` from `ledger_entry.source_type` (state-only migration); validity is the posting registry's job. | Task 5 |
| CQ-9 | contracts §1.6 | `ReminderCandidate.recipient_party_id` has no column on `ledger_reminder`; and it is not said which kinds the widened partial unique index covers, nor whether a merchant's manual send about a module due is `kind='due'` or `'manual'`. | Add `recipient_party_id uuid NULL` FK; auto-job rows use `due`/`notice` and the index predicate becomes `kind IN ('auto_d1','auto_d0','due','notice')`; manual sends stay `kind='manual'` with the source columns (governed by the policy's caps, not the index). | Task 10 |
| CQ-10 | contracts §1.1 lists `modules_view`, `update_enabled_modules`, `ModuleEnabled` | `GET /auth/me`, `permissions_for` module gating and `EngineEnabled` read `effective_modules`, which would still report an unreleased code if one were in `enabled_modules`. | Filter `UNRELEASED_MODULES` inside `effective_modules` too (the single answer, `entitlements.py:98-106`). | Task 1 |
| CQ-11 | contracts §1.4 `apply_deposit` | Which number series the two `adjustment` payments take is not stated; they would consume RCT/PAYOUT numbers and print as receipts. | Use the ordinary `payment_in`/`payment_out` series (a gap-free legal series is not required for internal adjustments, but a separate series would be a new settings row for every tenant); print "Adjustment · deposit". Alternative: a new `adjustment` number kind. | Task 7 |
| CQ-12 | contracts §1.8 `Recurrence` | As written the dataclass is invalid Python: `anchor: date` (no default) follows fields with defaults. | `@dataclass(frozen=True, kw_only=True)`. | Task 3 |
| CQ-13 | contracts §4.2 R4 (exists) | A useful refusal needs per-counter labels, and today's `register_module_off_guard` appends (not idempotent, `guards.py:33-35`) against the registry rule. | Add optional `label_id=` to `register_module_off_guard`, dedupe by counter identity, and add `details.breakdown` to `module_has_data` (additive). | No |
| CQ-14 | 10-architecture §9 ("switching on runs the module's preset seed") | No registry for it in §4.2. | `register_module_enable_hook(module, hook)` in `platform_app/services/guards.py`, run inside `update_enabled_modules`' transaction for newly enabled modules. | Task 13 |
| CQ-15 | contracts §2.1 `dues_plan.heads jsonb [{label, amount}]`, `dues_schedule.terms jsonb` | Money inside jsonb breaks canon rule 3 (the reason the party opening balance is three typed columns); and a plan snapshot in `terms` puts the recurrence in JSON, which ADR-055 forbids. | Store the schedule's recurrence as typed `RecurrenceFields` copied from the plan; keep `terms` for the rest with money as 2-dp strings (the `mode_breakup` precedent, `payments/models.py`) and a CHECK that Σ `heads[].amount` = `amount` through an immutable SQL function as `payments/0001` does. Or move heads to a `dues_plan_head` table. | Task 16 |
| CQ-16 | contracts §2.1 `dues_due` | Outstanding needs posted penalties, and a voided payment's standing days must be excluded from late fees; neither has a column. Charge-mode dues also need `dues_settlement` rows for a uniform replay. | Add `penalty_amount` (cache) and `penalty_exempt_days` to `dues_due`; use `dues_settlement` for every mode with `component='charge'` when a due has no components. | Task 16 |
| CQ-17 | contracts §2.3; 10-architecture §5 rule 3 ("every engine row also carries `module`") | `attendance_mark` (open visits have no group) and `attendance_entitlement` have no `module`, so the module-off guard and module filters would need joins that do not exist for visits; groups have no session time; "auto-closed" visits have no flag; gym freezes need entitlement validity extension. | Add `module` to `attendance_mark` and `attendance_entitlement`; `session_start time`, `session_minutes smallint` to `attendance_group` (recurrence optional there); `auto_closed boolean` to `attendance_mark`; service `extend_entitlement(valid_to, reason)`. | Task 15 |
| CQ-18 | contracts §2.2 | `cancel` returns "fee from policy tiers" but no table stores tiers, the engine holds no prices (so a fee cannot be rupees), `no_show_after` is absent, `bookings_booking_unit.status` values are unlisted, and `slots` mode has no start time on the unit. | Add `bookings_cancellation_tier` (hours_before, fee_percent, basis); `Fee` is a rule (percent + basis) the vertical applies to its quote; add `no_show_after_minutes` to the type; unit statuses `booked`\|`checked_in`\|`checked_out`\|`released`; unit `start_time`, `slot_count` for slots. | Task 24 |
| CQ-19 | contracts §2.2 `bookings_booking.number`; §1.7 kind `booking` (hospitality) | Who allocates the engine row's number is not said; the engine cannot know the vertical's kind. | The vertical allocates (`allocate_number(kind="booking")`) and passes `number=` to `hold`/`book`. | Task 24 |
| CQ-20 | contracts §2.2 and ADR-049 ("a count of rows per slot key" for shared capacity) | `UNIQUE (tenant, resource, slot_key)` allows only one row per key, so shared capacity cannot be "a count of rows per key". | For `shared` resources the key carries a seat ordinal (`2026-10-12T07:00#07`, 1…capacity), so the same unique index bounds capacity; pooled types count under the type lock as contracts say. `varchar(24)` fits if shift codes are ≤ 8 characters. | Task 24 |
| CQ-21 | contracts §1.2 (`dues_adjustment` posts `charge`/`adjustment_credit` in main/loan) | In document mode a late fee on a taxable supply is itself taxable and a waiver reduces an invoice; a ledger line cannot do either. | Document-mode penalties issue their own document through the port with origin `dues_adjustment`; waivers, discounts and proration issue credit notes against the due's document; register `dues_adjustment` as an origin type. | Task 19 |
| CQ-22 | ADR-043 consequences; LED-11 | ADR-043 says a loan must not be forgiven by the shop's flows; LED-11's write-off defaults to the whole `balance`. | LED-11's amount defaults to and is capped at `trade_balance`; forgiving a loan is lending's waiver. A CR amends LED-11. | Task 5 |
| CQ-23 | contracts §1.4 (`PaymentMode.ADJUSTMENT` "accepted only from `apply_deposit`") | `PaymentMode` lives in `apps/common/constants.py` and is shared with manual ledger entries and expenses, whose validators accept any member. | Refuse `adjustment` in LED-01's, expenses' and `record_payment`'s public validation, with one test per path. | Task 7 |
| CQ-24 | 10-architecture §5 ("engine read endpoints check a codename of each consuming module") | Which codename per module is not recorded anywhere code can read. | `ENGINE_READ_PERMISSIONS: dict[engine, dict[module, codename]]` in `permissions_registry.py` (strings, L4); each vertical FRD names its codename. | Task 13 |
| CQ-25 | canon §0.9; PLT-X08 | Closures are an admin task at a library or gym, but settings writes need `platform.tenant.manage` (owner only). | New core codename `platform.calendar.manage` (owner, admin), added by the same CR that adds the module codenames and module roles. | Task 12 |

**End of FRD 00.**
