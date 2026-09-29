# Engine and core contracts

Status: **PROPOSED FOR FRD USE, 29 Sep 2026 (architecture owner).** This is the source of truth the
module FRDs cite for every engine and core interface. An FRD may add a field its module needs to its
**own** tables; it may not change anything here. A change to this document after the FRDs are written
goes through the architecture owner (vision §3 rule 5), who records it here and, if it changes a
decision, in Part 38.

Decisions behind every section: ADR-041 to ADR-055 in
[Part 38](../38-architecture-decision-records.md). Layering and conventions:
[10-architecture.md](10-architecture.md).

Notation. Every service takes `ctx: Ctx` (`apps/common/context.py`) first and keyword arguments
only, runs inside the caller's `transaction.atomic()` unless it says it opens its own, raises
`DomainError` subclasses (`BusinessRuleViolation`, `ValidationFailed`) and never DRF exceptions
(rule D6). Money is `Decimal` quantised to 0.01; dates are tenant-local `date`. "Locks" names the
rows a function locks, in the global order of `apps/parties/services/balance.py:53-66`:
**party → documents → payments → stock → sequence**. Engines slot their own rows in after documents
and before payments.

---

## 1. Core changes

### 1.1 Modules and engines (platform)

| Change | Where |
|---|---|
| `ModuleCode.LENDING = "lending"`, `LIBRARY = "library"`, `GYM = "gym"`, `HOSPITALITY = "hospitality"` | `apps/common/constants.py` |
| `UNRELEASED_MODULES: frozenset[str]` — every new code until its release CR | `apps/platform_app/constants.py` |
| `MODULE_DEPENDENCIES` entries (10-architecture §2.3) | `apps/platform_app/services/tenant_settings.py:46` |
| `ENGINES_USED_BY: dict[str, frozenset[str]]` | same file |
| `engine_enabled(tenant, engine: str) -> bool`, `enabled_modules_using(tenant, engine) -> frozenset[str]` | `apps/platform_app/services/entitlements.py` |
| `EngineEnabled(engine: str) -> type[BasePermission]` — 403 `module_disabled`, `details.module = engine` | `apps/common/permissions.py` |
| `modules_view`, `update_enabled_modules`, `ModuleEnabled` honour `UNRELEASED_MODULES` unless `UB_UNRELEASED_MODULES=1` | as above |

### 1.2 Ledger

**New column.** `ledger_entry.bucket varchar(8) NOT NULL DEFAULT 'main'`, with
`CHECK (bucket IN ('main','loan','deposit'))`. The migration re-creates `forbid_update_delete()`
with `bucket` frozen (10-architecture §10 rule 2). Existing rows are `main`.

| Bucket | Meaning | Moves `party.balance` | Moves `party.loan_balance` | Moves `party.deposit_held` | In aging |
|---|---|---|---|---|---|
| `main` | Trade khata: sales, purchases, fees, fines, charges, manual entries | yes | no | no | yes (default) |
| `loan` | Lending: disbursal, interest, loan charges, collections, waivers | yes | yes | no | no (lending arrears come from dues) |
| `deposit` | Money held for the party and returnable | **no** | no | yes | no |

`party.balance` remains "what this party owes, net" and now equals Σ(main) + Σ(loan). `loan_balance`
is the loan part of it; the trade part is `balance − loan_balance`. `deposit_held` is a liability kept
entirely outside the balance (ADR-043, ADR-044).

**New entry types** (the closed core vocabulary, `apps/ledger/constants.py:17-43`):

| `EntryType` | Direction | Label | Used for |
|---|---|---|---|
| `CHARGE = "charge"` | debit | "Charge" | A non-document amount owed: a due in ledger mode, a library fine or fee, a lending fee, penalty or disbursal deduction |
| `ADJUSTMENT_CREDIT = "adjustment_credit"` | credit | "Credit" | A reduction of what is owed without money moving: a waiver, a discount, a pro-rata credit |

`INTEREST` (debit) already exists. No `refund` entry type: money going back is `PAYMENT_OUT`, the
reduction of what is owed is `ADJUSTMENT_CREDIT` or a credit note (ADR-048). No deposit entry types:
deposits move through payments (§1.4).

**Posting registry** (replaces editing `POSTING_MATRIX`, `apps/ledger/services/postings.py:57-73`;
the four existing rows are registered by their owners at start-up, `payment` with buckets
`{main, loan, deposit}`):

```python
# apps/ledger/services/postings.py
def register_posting_source(
    source_type: str,                 # "<app>_<model>", ≤ 32 chars (ledger_entry.source_type)
    *,
    module: str,                      # owning module code
    entry_types: Mapping[str, str],   # entry_type -> direction; direction stays a function of entry_type
    buckets: frozenset[str] = frozenset({"main"}),
) -> None: ...

def post_source_entry(
    *, ctx, party, amount, entry_date, entry_type, source_type, source_id,
    note="", payment_mode=None, upi_app=None, reference="", source_number=None,
    bucket: str = "main",             # NEW; must be in the source's registered buckets
) -> tuple[LedgerEntry, Decimal]: ...
```

`apply_entry(*, party, direction, amount, bucket="main")` (`apps/parties/services/balance.py:100`)
moves the caches by bucket per the table above; `recalc_balances` and
`apps/ledger/selectors/entry.py` (the balance rule) replay all three.

**Rules every poster keeps.**
1. The caller holds the transaction and has locked the party (unchanged).
2. **One source row per postable fact.** `reverse_source_entries` reverses every posted line of a
   source (`postings.py:196-205`), and idempotency is `(source_type, source_id, entry_type)`
   (`postings.py:134-138`). So a due's interest and its penalty are two sources, not two lines of one.
3. A module never reverses another module's source.

**Registered posting sources** (each by its owner):

| `source_type` | Owner | Entry types | Buckets |
|---|---|---|---|
| `dues_due` | dues | `charge` | main |
| `dues_component` | dues | `interest`, `charge` | loan |
| `dues_adjustment` | dues | `charge` (penalty), `adjustment_credit` (waiver, discount, pro-rata) | main, loan |
| `library_charge` | library | `charge` | main |
| `library_waiver` | library | `adjustment_credit` | main |
| `lending_deduction` | lending | `charge` | loan |
| `lending_charge` | lending | `charge` | loan |
| `lending_waiver` | lending | `adjustment_credit` | loan |

Gym and hospitality post nothing directly: their money is sales documents and payments.

**Aging** (`apps/ledger/selectors/aging.py`) gains `bucket="main"` (bound parameter); `/ledger/aging`
is unchanged for today's tenants. **Statement** shows every bucket; `deposit` lines print in a separate
"Deposit held" block and are excluded from the running balance.

### 1.3 Parties

| Change | Contract |
|---|---|
| `parties_party.loan_balance MoneyField default 0`, `deposit_held MoneyField default 0` | caches, one writer (`apply_entry`), replayed by `recalc_balances` |
| `parties_relation` | `party` FK, `related_party` FK, `kind` (`guardian`, `payer`), `receives_messages bool`, `from_on`, `to_on` nullable, unique `(tenant, party, related_party, kind)`, `CHECK party <> related_party` |
| `register_party_role(code, *, module, label_id, party_ids: Callable[[tenant], QuerySet[UUID]])` | `apps/parties/services/roles.py`; `GET /parties?role=<code>` filters `id IN party_ids(tenant)` for roles of enabled modules; `GET /parties/roles` lists them |
| `register_archive_guard(module, guard: Callable[[tenant, party], ArchiveBlock | None])` | `apps/parties/services/archive.py`; `archive_party` and `bulk_archive_parties` call every guard of an enabled module under the party lock |
| `ArchiveBlock = TypedDict(module: str, count: int, label_id: str)` | returned as 409 `party_has_open_records` |
| Relations API | `GET/POST /parties/{id}/relations`, `DELETE /parties/{id}/relations/{rid}` (codename `parties.party.write`) |

### 1.4 Payments

**Target protocol v2** (`apps/payments/services/targets/__init__.py:37-75`). Two attributes and one
keyword are added; the two existing targets declare `bucket="main"`, `auto=True` and accept and ignore
`payment_id`:

```python
class AllocationTarget(Protocol):
    document_type: str
    direction: str                  # "in" | "out"
    bucket: str                     # NEW: the ledger bucket of a payment allocated here
    auto: bool                      # NEW: may FIFO auto-allocation choose it? (False: explicit only)
    def apply(self, *, document, amount, today, payment_id=None) -> tuple[str, str]: ...
    def unapply(self, *, document, amount, today, payment_id=None) -> tuple[str, str]: ...
    # open_documents, find, lock, lock_open_for_party, is_open, outstanding, party_id,
    # summary, audit_action: unchanged
```

- `record_payment` posts the payment's one ledger line in the bucket of its targets. A payment whose
  allocations name two buckets is refused, 400 `validation_error`
  (`allocations: "One payment settles one kind of balance."`). An unallocated payment is `main`.
- `targets_for_direction` used by `"auto"` returns only `auto=True` targets.

**Registered targets:**

| `document_type` | Owner | Direction | Bucket | Auto |
|---|---|---|---|---|
| `sales_document` | payments (existing) | in | main | yes |
| `purchase_document` | payments (existing) | out | main | yes |
| `dues_due` | dues | in | main (charge-mode dues with ledger posting) | yes |
| `dues_instalment` | dues | in | loan (expectation-mode dues; same `dues_due` rows) | no |
| `library_charge` | library | in | main | yes |
| `lending_loan` | lending | out (disbursal) | loan | no |
| `held_deposit` | payments | in | deposit | no |
| `held_deposit_refund` | payments | out | deposit | no |

Charge-mode dues that raised a sales document are **not** targets: the payment goes to the invoice.

**`allocate_existing`** (new, `apps/payments/services/allocate.py`):

```python
def allocate_existing(
    *, ctx, payment_id: UUID, allocations: list[dict], reason: str = ""
) -> dict:  # {payment, allocations, unallocated_amount}
```
Locks: party → documents (target `lock`) → the payment. Moves up to `payment.unallocated_amount`
into allocations; targets must match the payment's direction and bucket (`main` only in practice,
since an unallocated payment is `main`). Errors: `over_allocated`, `payment_already_void`,
`validation_error`. Audit `payment.allocated`. API: `POST /payments/{id}/allocations`
(`payments.payment.write`, idempotency key). Callers: the dues run (advance auto-apply), the document
port (`apply_open_advances`), hospitality check-out, and later sales credit.

**Held deposits** (new):

```
payments_held_deposit
  id, tenant, party FK RESTRICT, module varchar(32), subject_type varchar(48), subject_id uuid,
  purpose varchar(60) ("Library deposit", "Room security deposit"),
  expected_amount, received_amount, applied_amount, refunded_amount, held_amount (cache),
  status: 'expected' | 'held' | 'released', note, created_by, timestamps
  CHECK held_amount = received_amount − applied_amount − refunded_amount ≥ 0
payments_deposit_application
  id, tenant, deposit FK, amount, reason, refund_payment FK (the adjustment payment out),
  settle_payment FK (the adjustment payment in), created_by, created_at
```

```python
# apps/payments/services/deposits.py
def open_deposit(*, ctx, party_id, module, subject_type, subject_id, purpose, expected_amount) -> HeldDeposit
def receive_deposit(*, ctx, deposit_id, amount, mode_breakup, payment_date, reference="", note="") -> dict
    # a payment IN allocated to `held_deposit`; ledger payment_in, bucket deposit
def apply_deposit(*, ctx, deposit_id, allocations: list[dict], reason: str) -> dict
    # two payments with mode "adjustment": OUT from `held_deposit_refund` (bucket deposit) and
    # IN allocated to `allocations` (bucket main: a sales document, dues_due or library_charge)
def refund_deposit(*, ctx, deposit_id, amount, mode_breakup, payment_date, reason) -> dict
    # a payment OUT allocated to `held_deposit_refund`
def deposits_for(*, tenant, party_id=None, module=None, subject_type=None, subject_id=None) -> QuerySet
```
Locks: party → deposit → payments. Errors: `deposit_insufficient` (409, D `held_amount`),
`deposit_released` (409), `over_allocated`. Voiding either adjustment payment voids both. Audit
`deposit.opened`, `deposit.received`, `deposit.applied`, `deposit.refunded`.

**New payment mode** `PaymentMode.ADJUSTMENT = "adjustment"` ("Adjusted, no money moved"), accepted
only from `apply_deposit`; `record_payment`'s public validation refuses it; the cashbook's
`bucket_of` excludes it (`apps/reports/selectors/cash_sources.py`).

API: `GET /deposits?party_id&module&status`, `GET /deposits/{id}`,
`POST /deposits/{id}/receive|apply|refund`. Vertical screens call the vertical's own endpoint, which
calls these services, so the vertical's codename applies (for example `library.member.close`).

### 1.5 The document port

`apps/common/seams/documents.py` (new; rule D1 holds — it imports nothing from `apps.*`):

```python
class DocumentLine(TypedDict, total=False):
    description: str            # required, ≤ 255: "Quarterly membership, 1 Oct – 31 Dec 2026"
    hsn_sac: str | None         # e.g. "999723", "996311"
    qty: Decimal                # > 0
    unit_code: str              # "NOS" default
    unit_price: Decimal
    tax_inclusive: bool
    gst_rate: Decimal | None    # per-line rate; None = the item's rate, or the tenant default
    item_id: UUID | None        # an inventory item when inventory is on; else None
    discount_amount: Decimal    # line discount

class IssueRequest(TypedDict, total=False):
    origin_type: str            # required: "dues_due", "gym_membership", "hospitality_stay"
    origin_id: UUID             # required
    party_id: UUID              # required; module documents are never walk-in
    document_date: date         # required
    due_on: date | None
    lines: list[DocumentLine]   # required, ≥ 1
    notes: str
    meta_block: dict            # printed block, e.g. {"stay": {...}}; rendered by the template if present
    payment: dict | None        # a record_payment payload taken at issue
    apply_open_advances: bool   # allocate the party's open main-bucket advances (allocate_existing)
    credit_check: str           # "skip" (engine charges) | "enforce" (counter sales)

class IssuedDocument(TypedDict):
    document_id: UUID; number: str; kind: str; status: str
    grand_total: Decimal; amount_due: Decimal; ledger_entry_id: UUID | None

class Issuer(Protocol):
    def issue(self, *, ctx, request: IssueRequest) -> IssuedDocument: ...
    def issue_credit_note(self, *, ctx, against_id: UUID, origin_type: str, origin_id: UUID,
                          lines: list[DocumentLine], settlement: str, reason: str) -> IssuedDocument: ...
        # settlement: "hold_advance" | "refund" (Settlement, apps/sales/constants.py:98-102)
    def void(self, *, ctx, document_id: UUID, reason: str) -> dict: ...
    def summaries(self, *, tenant, ids: set[UUID]) -> dict[UUID, IssuedDocument]: ...

def register_issuer(issuer: Issuer) -> None                 # sales, in ready()
def issuer_available(tenant) -> bool                         # issuer registered and "sales" effective
def issue_document(*, ctx, request) -> IssuedDocument        # 403 module_disabled if not available
def issue_credit_note(*, ctx, **kw) -> IssuedDocument
def void_document(*, ctx, document_id, reason) -> dict
def document_summaries(*, tenant, ids) -> dict

class OriginListener(Protocol):
    def on_void(self, *, ctx, origin_id: UUID, document: IssuedDocument, reason: str) -> None: ...
    def on_settlement_changed(self, *, ctx, origin_id: UUID, document: IssuedDocument) -> None: ...
    def blocks_void(self, *, tenant, origin_id: UUID) -> str | None: ...   # a reason, or None

def register_origin(origin_type: str, *, module: str, listener: OriginListener) -> None
```

**Sales changes behind it** (the FRDs rely on them):
- `sales_document` gains `origin_module varchar(32) null`, `origin_type varchar(48) null`,
  `origin_id uuid null`, with an index on `(tenant, origin_type, origin_id)`. Set only by the port.
- Kind is `kind_for(tenant)` (`apps/sales/services/payload.py:39`): invoice, or bill of supply for a
  composition tenant. The port never issues an estimate.
- The port issues in one call (create draft + issue, `documents.py:72`, `issue.py:58`) in the caller's
  transaction. Numbering, Rule 46, place of supply and the tax engine are sales' own.
- `void_invoice` (`void.py:80`) calls `blocks_void` before and `on_void` inside its transaction for a
  document with an origin. A `blocks_void` reason is 409 `document_origin_locked`
  (D `origin_type`, `reason`).
- `refresh_invoice_amounts` (`amounts.py:56`) calls `on_settlement_changed` after it saves, when the
  document has an origin.
- `credit_check="skip"` bypasses `credit_check` (`issue_parts.py:66`) for engine charges (ADR-048);
  the limit is still shown as crossed.

### 1.6 Reminders

`ledger_reminder` (`apps/ledger/models.py:211-263`) gains:

| Column | Type | Meaning |
|---|---|---|
| `module` | `varchar(32)` default `''` | `''` for today's party reminders |
| `source_type` | `varchar(48)` null | e.g. `dues_due`, `library_loan`, `library_hold` |
| `source_id` | `uuid` null | |
| `subject_label` | `varchar(120)` default `''` | "Instalment 4 of LN-0042", "Wings of Fire, due 12 Oct" |

`ReminderKind` gains `DUE = "due"` (a module amount due) and `NOTICE = "notice"` (no amount: hold
ready, membership expiring). `snapshot_balance` holds the due's amount for `due`, null for `notice`.
The auto-per-day unique index widens to `(party, due_on, kind, source_id)` with
`NULLS NOT DISTINCT` (PostgreSQL 16), so two loans due the same day are two reminders and a rerun is
still one.

```python
# apps/ledger/services/reminder_seam.py
class ReminderCandidate(TypedDict):
    party_id: UUID; source_type: str; source_id: UUID; due_on: date
    amount: Decimal | None; subject_label: str; template_key: str; recipient_party_id: UUID | None

def register_reminder_source(source_type: str, *, module: str,
                             candidates: Callable[[tenant, date], Iterable[ReminderCandidate]]) -> None

class ReminderPolicy(TypedDict, total=False):
    window: tuple[time, time] | None     # tenant-local, inclusive start, exclusive end
    daily_cap_per_source: int | None     # e.g. 1 per loan per day
    daily_cap_per_party: int | None
    fixed_templates: bool                # free text refused
    forbidden_words: frozenset[str]      # enforced by a template test, not at runtime

def register_reminder_policy(module: str, policy: ReminderPolicy) -> None
def check_reminder_allowed(*, tenant, module: str, party_id, source_id, at: datetime) -> None
    # raises reminder_outside_window or reminder_cap_reached
def next_allowed_at(*, tenant, module, party_id, source_id, after: datetime) -> datetime
```
Every path that records or sends a reminder (`reminders/<id>/send`, bulk prepare, the auto job) calls
`check_reminder_allowed`. A tenant may narrow a module's window (setting
`reminders.<module>.window`), never widen it. Lending registers `window=(08:00, 19:00)`,
`daily_cap_per_source=1`, `fixed_templates=True`.

### 1.7 Numbering

```python
# apps/platform_app/services/sequences.py
def register_number_kind(kind: str, *, module: str, mode: str,  # "fy" | "perpetual"
                         default_prefix: str, padding: int, label_id: str) -> None
def allocate_number(*, tenant, kind, on_date) -> str        # existing; FY kinds, "PFX/26-27/0001"
def allocate_counter(*, tenant, kind) -> str                 # NEW; perpetual kinds, "PFX0001" / "1024"
def peek_counter(*, tenant, kind) -> int
def raise_counter(*, ctx, kind, next_number: int) -> None   # 409 sequence_backwards if lower
```
A perpetual kind uses the same `platform_document_sequence` row shape with `fy_label = '*'` (unique
`(tenant, kind, fy_label)` unchanged, `apps/platform_app/models/settings.py:82-84`), formats as
`prefix + zero-padded number` with no year, and is locked last like every sequence. Registered kinds
appear in the settings numbering screen only when their module is enabled.

| Kind | Mode | Default prefix | Module |
|---|---|---|---|
| `loan` | fy | `LN` | lending |
| `library_member` | perpetual | `M-` | library |
| `library_accession` | perpetual | `` (numeric, padding 0) | library |
| `library_charge` | fy | `FIN` | library |
| `gym_member` | perpetual | `M-` | gym |
| `booking` | fy | `BKG` | hospitality |

The library's own unique constraint on `accession_number` is the guarantee; the counter proposes the
next number, and an import of typed numbers raises the counter to max + 1 (ADR-051).

### 1.8 Calendar and primitives

```python
# apps/platform_app/services/calendar.py  (table platform_closed_day: date, reason ≤ 60, module null)
def is_open(tenant, on: date, *, module: str | None = None) -> bool
def next_open_day(tenant, on: date, *, module=None) -> date          # on itself if open
def closed_days_between(tenant, start: date, end: date, *, module=None) -> set[date]
# setting key "calendar.closed_weekdays": list[int] (0 = Monday), per module override allowed

# apps/common/recurrence.py  (pure; no dateutil)
@dataclass(frozen=True)
class Recurrence:
    freq: str                 # once | daily | weekly | monthly | yearly
    interval: int = 1
    by_weekday: int = 0       # bitmask Mon=1 … Sun=64
    by_month_day: int | None = None   # 1–31, or -1 = last
    anchor: date
    count: int | None = None
    until: date | None = None
    explicit_dates: tuple[date, ...] = ()
def occurrences(rule: Recurrence, *, start: date, end: date, limit: int = 1000) -> list[date]
    # month-end clamping to the anchor day (shared-engines §1.1)

# apps/common/periods.py
@dataclass(frozen=True)
class Period: start: date; end: date   # [start, end)
def period_label(period, *, style: str, locale: str) -> str   # "Oct 2026", "12 Oct – 11 Nov"

# apps/common/money.py (additions)
def round_amount(value, rule: str) -> Decimal     # "paise" | "rupee" | "rupee_up" | "ten_up"
def split_total(total, parts: int | Sequence, *, rule: str) -> list[Decimal]  # last absorbs residue
```
Persisted recurrence: typed columns (`freq`, `interval`, `by_weekday smallint`, `by_month_day
smallint`, `anchor date`, `count int`, `until date`) and `explicit_dates date[]`; never JSON (ADR-055).

### 1.9 Other registries

```python
# apps/common/jobs.py
def register_schedule(schedule: Schedule) -> None       # appended to SCHEDULES; idempotent by job_type
# apps/reports/registry.py
def register_dashboard_section(key: str, *, module: str, permission: str,
                               selector: Callable[[tenant, date], dict], order: int) -> None
def register_report(key: str, *, module: str, permission: str, label_id: str,
                    selector: Callable[..., Any], csv: Callable[..., Iterable] | None) -> None
# apps/notifications/services/notify.py
def register_notification_type(code: str, spec: NotificationType) -> None
```
`GET /reports/dashboard` returns `sections: [{key, module, data}]` for enabled modules and held
permissions; `GET /reports` lists only registered, built reports.

---

## 2. Engine contracts

### 2.1 Dues engine (`apps/dues`)

**Tables.**

```
dues_plan        module, name ≤ 80, mode ('charge'|'expectation'), posting ('document'|'ledger'|'none'),
                 recurrence columns (§1.8), amount_rule ('fixed'|'total_split'|'supplied'),
                 amount, total, split_weights numeric[], heads jsonb [{label, amount}],
                 join_policy ('full'|'by_days'|'half_rule'|'next_period'|'align_to_join'),
                 leave_policy ('no_refund'|'by_days'|'by_sessions'|'custom'),
                 grace_days smallint, penalty_kind ('none'|'flat_once'|'percent_once'|'per_day'|'simple_interest'),
                 penalty_value numeric(10,4), penalty_cap, pause_max_days, pause_min_days, pause_max_count,
                 hsn_sac, gst_rate, tax_inclusive (document posting), rounding_rule,
                 allocation_order ('oldest_first'|'fees_first'|'fees_last'), auto_apply_advance bool,
                 closed_day_rule ('move'|'skip'|'ignore'), is_active
dues_schedule    module, plan FK, terms jsonb (plan snapshot), party FK (payer), beneficiary_party FK null,
                 subject_type, subject_id, start_on, end_on null, status ('active'|'paused'|'ended'|'cancelled'),
                 ended_reason, materialised_until date, version
dues_due         schedule FK, module, party FK (copied from the schedule, never changed),
                 seq, period_start, period_end, period_label, due_on, amount,
                 status ('scheduled'|'due'|'overdue'|'paid'|'skipped'|'cancelled'),
                 settled_amount (cache), waived_amount (cache), paid_on null,
                 document_id uuid null (document posting), posted_entry_id uuid null (ledger posting),
                 cancel_reason; unique (schedule, seq);
                 indexes (tenant, status, due_on), (tenant, party, due_on), (tenant, module, status, due_on)
dues_due_component  due FK, component ('principal'|'interest'|'fee'|'charge'), amount, settled, waived,
                 posted_entry_id null; unique (due, component)
dues_adjustment  due FK, kind ('penalty'|'waiver'|'discount'|'proration'), component null, amount (signed),
                 reason, posted_entry_id null, reversed_by FK null
dues_pause       schedule FK, from_on, to_on, effect ('shift'|'skip'), reason
dues_settlement  payment_id uuid, due FK, component, amount; unique (payment_id, due, component)
```

**Modes and postings** (ADR-048):

| Mode | Posting | What a due does on `due_on` | What a payment settles |
|---|---|---|---|
| `charge` | `document` | `issue_document(origin=("dues_due", id), credit_check="skip", apply_open_advances=plan.auto_apply_advance)` | the invoice (sales target); the due follows via `on_settlement_changed` |
| `charge` | `ledger` | `post_source_entry(entry_type=CHARGE, source=("dues_due", id), bucket=main)` | the due (`dues_due` target, main, auto) |
| `expectation` | `none` | posts each non-principal component as its own source: `INTEREST` / `CHARGE`, source `("dues_component", id)`, bucket `loan` | the due (`dues_instalment` target, loan, explicit), split into components by `allocation_order` into `dues_settlement` |

A `taxable` plan (a `gst_rate` or `hsn_sac` set) must use `document` posting; a plan with `document`
posting cannot be created while `issuer_available(tenant)` is false (403 `module_disabled`, module
`sales`).

**Public services** (`apps/dues/services/…`):

```python
def create_plan(*, ctx, module: str, data: dict) -> Plan
def update_plan(*, ctx, plan_id, data: dict) -> Plan          # affects new schedules only
def preview_schedule(*, tenant, plan, start_on, end_on=None, supplied=None, join_on=None) -> list[DuePreview]
def create_schedule(*, ctx, module: str, plan_id, party_id, subject_type: str, subject_id,
                    start_on, end_on=None, beneficiary_party_id=None,
                    supplied: list[SuppliedDue] | None = None,   # amount_rule "supplied": lending computes
                    confirm_backdated: bool = False) -> ScheduleResult
    # past dues need confirm_backdated=True; 409 schedule_backdated_unconfirmed with the preview
def end_schedule(*, ctx, schedule_id, on: date, reason: str, leave_policy: str | None = None,
                 custom_amount: Decimal | None = None) -> Settlement      # refund due, credits
def cancel_schedule(*, ctx, schedule_id, reason: str) -> None             # reverses posted dues' postings
def reschedule(*, ctx, schedule_id, from_seq: int, supplied: list[SuppliedDue], reason: str) -> ScheduleResult
def pause(*, ctx, schedule_id, from_on, to_on, effect: str, reason: str) -> Pause
def resume(*, ctx, pause_id, on: date) -> Pause
def add_penalty(*, ctx, due_id, amount, reason) -> Adjustment              # checks plan cap
def waive(*, ctx, due_id, amount, reason, component: str | None = None) -> Adjustment
def plan_allocation(*, tenant, schedule_id, amount, order: str | None = None) -> list[dict]
    # [{document_type: "dues_due" | "dues_instalment", document_id, amount}] for record_payment; oldest due first
def payoff(*, tenant, schedule_id, on: date) -> Payoff                     # outstanding by component
def run_for_tenant(*, tenant, today: date) -> RunReport   # job handler; idempotent
```

**Selectors:** `dues_for_party(tenant, party_id, *, module=None, status=None)`,
`dues_for_subject(tenant, subject_type, subject_id)`,
`arrears(tenant, subject_type, subject_id, as_of) -> {overdue_amount, oldest_due_on, days_past_due}`,
`upcoming(tenant, *, module, within_days)`, `collection_vs_expected(tenant, *, module, period)`.

**Registry** (`apps/dues/registry.py`):

```python
def register_subject(subject_type: str, *, module: str,
                     label: Callable[[set[UUID]], dict[UUID, str]],        # "LN-0042", "Rahul · Gold"
                     on_due_changed: Callable[..., None] | None = None,     # (ctx, due, before, after)
                     amount_hook: Callable[..., Decimal] | None = None,     # (tenant, due_preview) -> amount
                     reminder_template_key: str) -> None
```

**Daily run.** `register_schedule(Schedule("dues.run", period="daily", at_hour_ist=0, minute=30))`
fans out one `dues.run_for_tenant` job per active tenant with the tenant-local date
(`apps/ledger/tasks.py:44-66` pattern, idempotency token `dues:<tenant>:<date>`). The run, per tenant:
materialise to `materialised_until` (24 months or the whole fixed plan); `scheduled → due` for
`due_on ≤ today` and post; `due → overdue` after grace; post once-off penalties; auto-apply advances;
extend the window. A missed day posts every missed due **with its own `due_on`**.

**Locks.** party → `dues_schedule` → `dues_due` rows in `(due_on, seq)` order → payments → sequence.

**Reminders.** The engine registers `register_reminder_source("dues_due", ...)` with buckets *due in 3
days*, *due today*, *overdue 1–7*, *8–30*, *30+*; wording comes from the subject's template key.

**Module-off guards.** One per module in `ENGINES_USED_BY` containing `dues`: schedules `active` or
`paused` plus dues `due`/`overdue` with that `module`.

### 2.2 Bookings engine (`apps/bookings`)

**Tables.**

```
bookings_resource_type  module, code, name, time_mode ('nights'|'days'|'shifts'|'slots'),
                        capacity_mode ('exclusive'|'shared'|'pooled_by_type'), default_capacity,
                        check_in_time, check_out_time, slot_minutes, hold_minutes, is_active, sort_order
bookings_shift          resource_type FK, code, name, start_time, end_time   (time_mode = shifts)
bookings_resource       type FK, label, parent FK null (a bed in a dorm), capacity, attributes jsonb
                        (module-defined keys), is_active, sort_order; unique (tenant, type, label)
bookings_out_of_service resource FK, from_on, to_on, reason
bookings_booking        module, party FK, subject_type, subject_id, number null, status
                        ('hold'|'confirmed'|'checked_in'|'completed'|'cancelled'|'expired'|'no_show'),
                        hold_expires_at null, source, notes, version
bookings_booking_unit   booking FK, resource_type FK, resource FK null, start_on, end_on (exclusive),
                        shift FK null, quantity, status, checked_in_at, checked_out_at
bookings_slot           resource FK, slot_key varchar(24), unit FK, created_at
                        UNIQUE (tenant, resource, slot_key)
```

`slot_key` is `YYYY-MM-DD` for `nights` and `days`, `YYYY-MM-DD/<shift code>` for `shifts`, and
`YYYY-MM-DDTHH:MM` for `slots`. A `nights` unit from 12 Oct to 15 Oct writes three rows (12, 13, 14).
A shift that covers a full day writes one row per shift it covers. **`span` (free start and end) is
not supported** until a module in scope needs it (ADR-049).

**Public services** (`apps/bookings/services/…`):

```python
def create_resource_type(*, ctx, module, data) -> ResourceType
def create_resource(*, ctx, type_id, data) -> Resource
def set_out_of_service(*, ctx, resource_id, from_on, to_on, reason) -> OutOfService
    # 409 resource_booked (D booking_ids) if active units hold those slots
def availability(*, tenant, type_id=None, resource_ids=None, start_on, end_on, shift=None) -> Availability
    # free resources and counts; an expired hold counts as free even before the job has run
def hold(*, ctx, module, party_id, subject_type, subject_id, units: list[UnitRequest],
         hold_minutes=None, source="", notes="") -> Booking
def book(*, ctx, module, party_id, subject_type, subject_id, units: list[UnitRequest], ...) -> Booking
def confirm(*, ctx, booking_id) -> Booking
def change_unit(*, ctx, unit_id, resource_id=None, start_on=None, end_on=None) -> BookingUnit
def check_in(*, ctx, unit_id, at: datetime | None = None) -> BookingUnit
def check_out(*, ctx, unit_id, at: datetime | None = None) -> BookingUnit
def cancel(*, ctx, booking_id, reason) -> CancelResult   # fee from policy tiers; the vertical posts it
def mark_no_show(*, ctx, booking_id) -> Booking
def cancellation_fee(*, tenant, booking_id, at: datetime) -> Fee
def expire_holds(*, tenant, now) -> int                  # job
def check_integrity(*, tenant) -> list[Problem]          # nightly, report-only, like recalc_balances
```

**Conflict rule.** Under a lock on the resource rows (or the type row for `pooled_by_type`), in
resource-id order: delete slot rows of expired holds on those resources, then insert the new slot
rows. `exclusive`: the unique constraint refuses a second writer from any path (409
`booking_slot_taken`, D `resource_id`, `slot_keys`). `shared` and `pooled_by_type`: the service counts
units per slot key under the lock and refuses above capacity (409 `booking_capacity_reached`); the
nightly integrity check reports any instant over capacity. Releasing (cancel, expiry, no-show, shorten)
deletes the unit's slot rows in the same transaction; the booking and its audit rows keep the history.

**Registry:** `register_booking_subject(subject_type, *, module, label, on_status_changed=None)`.

**Money.** None. A booking posts nothing (shared-engines §3.6); the vertical charges through the
document port or payments.

### 2.3 Attendance engine (`apps/attendance`)

**Tables.**

```
attendance_group        module, name, subject_type, subject_id, mark_kind ('visit'|'presence'),
                        recurrence columns (sessions, optional), default_mark ('present'|'absent'),
                        one_per_day bool, dedupe_minutes smallint, edit_window_hours smallint, is_active
attendance_group_member group FK, party FK, from_on, to_on null
attendance_session      group FK, starts_at, ends_at, status ('scheduled'|'held'|'cancelled'), booking_unit_id null
attendance_mark         group FK null, session FK null, party FK, on_date, status
                        ('present'|'absent'|'late'|'excused'|'visit'), check_in_at, check_out_at null,
                        method ('desk'|'roll_call'|'qr'), context_type, context_id (the membership),
                        override_reason, voided_at, void_reason, marked_by
                        unique (session, party) where session not null and voided_at is null
attendance_entitlement  party FK, subject_type, subject_id, total, used (cache), valid_from, valid_to
attendance_entitlement_use  entitlement FK, mark FK, delta (+1/−1)
```

`quantity` marks (daily delivery) are not built: no module in scope needs them.

**Public services:**

```python
def create_group(*, ctx, module, data) -> Group
def set_members(*, ctx, group_id, party_id, from_on, to_on=None) -> GroupMember
def generate_sessions(*, tenant, group_id, until: date) -> int      # skips closed days (calendar)
def check_in(*, ctx, module, party_id, context_type, context_id, group_id=None, session_id=None,
             at=None, method="desk", override_reason: str | None = None) -> CheckInResult
    # calls the policy hook; warn → allowed with warnings; block → 409 attendance_blocked
    # (D reason, override_permission) unless override_reason and the member holds override_permission
def check_out(*, ctx, mark_id, at=None) -> Mark
def roll_call(*, ctx, session_id, marks: dict[UUID, str]) -> list[Mark]
def void_mark(*, ctx, mark_id, reason) -> Mark               # gives back an entitlement use
def edit_mark(*, ctx, mark_id, status, reason) -> Mark       # outside the window needs the module's edit codename
def grant_entitlement(*, ctx, party_id, subject_type, subject_id, total, valid_from, valid_to) -> Entitlement
def close_open_visits(*, tenant, on: date) -> int           # job: auto-closed at closing time
```

**Registry** (`apps/attendance/registry.py`):

```python
class PolicyResult(TypedDict):
    decision: str                   # "allow" | "warn" | "block"
    reason: str                     # shown to the desk
    override_permission: str | None # e.g. "gym.membership.override"
    entitlement_id: UUID | None     # consume one use of this entitlement

def register_checkin_policy(context_type: str, *, module: str,
        policy: Callable[[tenant, UUID, UUID, date], PolicyResult]) -> None   # (tenant, party, context_id, on)
def register_mark_listener(context_type: str, *, module: str,
        on_marked: Callable[..., None]) -> None     # (ctx, mark, created: bool) — PT session consumption etc.
```

The engine never reads dues or memberships; the gym's policy does (ADR-050). Entitlement use is a
row lock on the entitlement, `used` ± 1 with an `attendance_entitlement_use` row, replayed by a
recompute test.

**Selectors:** `marks_for(tenant, *, party_id=None, group_id=None, date_from, date_to)`,
`register_grid(tenant, group_id, month)`, `attendance_percent(tenant, group_id, party_id, period)`,
`not_visited_since(tenant, *, module, days)`, `visits_by_hour(tenant, *, module, date_from, date_to)`.

---

## 3. Row scoping and module roles (ADR-052)

```python
# apps/common/scoping.py
class ScopedViewSetMixin:
    scope_all_permission: str              # e.g. "lending.loan.read_all"
    def scope_filter(self, request) -> Q:  # REQUIRED; the assigned-rows filter
        raise NotImplementedError          # fail closed
    # get_queryset() = tenant queryset, then .filter(scope_filter()) unless the member
    # holds scope_all_permission; an out-of-scope id is therefore 404

class RestrictedFieldsMixin:               # serializers
    restricted_fields: dict[str, str]      # field -> codename; absent from output without it
```

Module roles are `platform_role` rows with `tenant = NULL`, `is_system = True`, `code =
"<module>_<role>"`, owned by their module and assignable only when the module is enabled
(`apps/platform_app/models/membership.py:13-31`). Proposed, pending the owner (10-architecture §16):

| Role code | Module | Scope | Holds no |
|---|---|---|---|
| `lending_agent` | lending | loans on the agent's routes (`lending_route.agent_user_ids`) | `parties.*`, `ledger.*`, `payments.*`, `reports.*` read-all codenames |
| `gym_trainer` | gym | members whose term or batch names the trainer's party | fees, dues, mobile (unless granted), sales, payments |
| `hospitality_housekeeping` | hospitality | rooms and today's arrivals and departures | guests' contact and ID fields, folio, money |

---

## 4. Error codes

New codes for `apps/common/error_codes.py` and Part 22 §22.1.1, named by §22.1.2. Existing codes are
reused wherever the state is the same (`over_allocated`, `module_disabled`, `module_has_data`,
`stale_version`, `sequence_backwards`, `payment_already_void`, `validation_error`).

| Code | HTTP | `details` | Raised when |
|---|---|---|---|
| `party_has_open_records` | 409 | `module`, `count`, `label_id` | Archive refused by a module guard |
| `document_origin_locked` | 409 | `origin_type`, `reason` | A module document's origin refuses its void |
| `deposit_insufficient` | 409 | `held_amount` | Apply or refund more than is held |
| `deposit_released` | 409 | — | The deposit has nothing held and is closed |
| `reminder_outside_window` | 409 | `window_start`, `window_end`, `next_allowed_at` | A reminder outside the module's window |
| `reminder_cap_reached` | 409 | `cap`, `next_allowed_at` | The module's daily cap is used |
| `schedule_backdated_unconfirmed` | 409 | `dues` (preview), `total` | A backdated schedule needs confirmation |
| `schedule_not_active` | 409 | `status` | Pause, end or reschedule of a schedule that is not active |
| `due_not_open` | 409 | `status` | Allocation, waiver or penalty on a paid, skipped or cancelled due |
| `penalty_cap_reached` | 409 | `cap` | A penalty above the plan's cap |
| `pause_limit_reached` | 409 | `limit`, `used` | A pause beyond the plan's days or count |
| `booking_slot_taken` | 409 | `resource_id`, `slot_keys` | An exclusive slot is held |
| `booking_capacity_reached` | 409 | `capacity`, `slot_key` | A shared or pooled slot is full |
| `resource_booked` | 409 | `booking_ids` | Out of service over active bookings |
| `booking_not_open` | 409 | `status` | Change or check-in of a closed booking |
| `attendance_blocked` | 409 | `reason`, `override_permission` | The policy hook blocks a check-in |
| `attendance_duplicate` | 409 | `mark_id` | A check-in inside the dedupe window |
| `entitlement_exhausted` | 409 | `total`, `used` | No use left on a session pack |

---

## 5. Events

The platform has no event bus, and signals may only do things that are safe to lose (rule D9). An
"event" here is one of three things, and each is written inside the transaction that caused it.

**Audit actions** (constants on `AuditAction`, `apps/common/audit.py:16`):
`dues.plan.created|updated`, `dues.schedule.created|ended|cancelled|rescheduled|paused|resumed`,
`dues.due.posted|cancelled`, `dues.adjustment.created|reversed`;
`bookings.booking.created|confirmed|changed|checked_in|checked_out|cancelled|expired|no_show`,
`bookings.resource.out_of_service`;
`attendance.mark.created|edited|voided|overridden`, `attendance.entitlement.granted`;
`deposit.opened|received|applied|refunded`; `payment.allocated`;
`party.relation.created|deleted`; `counter.raised`; each vertical's own `<module>.<entity>.<verb>`.

**Listener callbacks** (synchronous, in the transaction; may refuse by raising):

| Callback | Called by | When |
|---|---|---|
| `OriginListener.on_void` / `blocks_void` | sales | a document with an origin is voided |
| `OriginListener.on_settlement_changed` | sales | `refresh_invoice_amounts` saved a document with an origin |
| `on_due_changed` | dues | a due changes status |
| `on_status_changed` (bookings) | bookings | a booking or unit changes status |
| `on_marked` | attendance | a mark is created, edited or voided |
| archive guards | parties | archive or bulk archive |
| module-off guards | platform | a module is being switched off |

**Notifications** (in-app bell, `register_notification_type`): `library.hold_ready`,
`library.overdue_today`, `hospitality.form_iii_due`, `dues.run_failed` (to owners), and whatever each
FRD adds. The product sends nothing outside the app (DEC-012).
