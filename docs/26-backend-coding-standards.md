# Part 26 — Backend Coding Standards

> **Status:** normative. Every rule here is a review gate. A pull request that violates a rule is changed, not discussed — the discussion belongs in a CR against this chapter.
>
> **Form:** each rule is stated, then shown with a **✗ wrong** and a **✓ right** sample. The wrong samples are not straw men; they are the shapes that actually appear when a rule is not written down.
>
> **Companion chapters:** Part 20 (Backend Architecture) defines the layers and the services this chapter governs; Part 21 (Database) owns the schema; Part 22 (API) owns the wire contract; Part 27 (Security) owns the security rules; Part 30 (Observability) owns logging content. Where this chapter repeats one of them it is for convenience; the other chapter wins.

## 26.1 Project and module layout

### R1.1 — One app per module, and the app label is the table prefix

Apps are exactly the list in Part 20 §20.1.2. A new app requires a CR. The Django label equals the table prefix (canon §0.10), and the only package whose directory name differs from its label is `apps/platform_app/` (label `platform`).

### R1.2 — The intra-app file layout is fixed

```
apps/<app>/
  apps.py  constants.py  models.py|models/  managers.py
  serializers/  services/  selectors/  views/
  permissions.py  filters.py  urls.py  admin.py  signals.py  tasks.py
  migrations/  tests/
```

`serializers`, `services`, `selectors` and `views` are **packages** (directories with `__init__.py`) in every app, even when an app has only one module in them. Uniformity beats brevity: an agent or a reviewer must never have to check whether `services` is a file or a directory.

**✗ wrong**

```
apps/parties/
  models.py
  api.py          # views + serializers + a bit of logic
  utils.py        # the balance maths
```

**✓ right**

```
apps/parties/
  models.py
  serializers/__init__.py  serializers/party.py  serializers/tag.py
  services/__init__.py     services/crud.py      services/balance.py
  selectors/__init__.py    selectors/party.py
  views/__init__.py        views/party.py        views/tag.py
```

### R1.3 — `__init__.py` re-exports the public names, and nothing else

A package's `__init__.py` contains imports and `__all__`. No logic, no constants, no side effects.

```python
# apps/parties/services/__init__.py
from apps.parties.services.balance import apply_balance_delta, recompute_party_balance
from apps.parties.services.crud import archive_party, create_party, restore_party, update_party

__all__ = [
    "apply_balance_delta", "archive_party", "create_party",
    "recompute_party_balance", "restore_party", "update_party",
]
```

### R1.4 — Import order and style

`isort` with the `black` profile, four sections: standard library, third party, `apps.*`, local relative. **Relative imports are used only within the same package**, never across apps.

**✗ wrong**

```python
from ..models import Party                     # crossing a package boundary relatively
from apps.ledger.views.entry import something  # a service importing a view
import apps.sales.models as sales_models       # aliased module import
```

**✓ right**

```python
from decimal import Decimal

from django.db import transaction
from rest_framework import serializers

from apps.common.money import q2
from apps.parties.models import Party

from .balance import apply_balance_delta          # same package
```

### R1.5 — Module-level side effects are forbidden

No database access, no file I/O, no network, no `logging.basicConfig`, no `django.setup()` at import time. The only permitted module-level work is defining constants, classes, functions, and registering a job handler via the `@job_handler` decorator (which only writes to a dict).

---

## 26.2 Naming

### R2.1 — The name table

| Thing | Convention | Examples |
|---|---|---|
| Model class | `PascalCase`, singular | `Party`, `LedgerEntry`, `SalesDocument`, `StockMovement` |
| Table (`db_table`) | `<app>_<snake_singular>` | `parties_party`, `ledger_entry`, `sales_document_line` |
| Model field | `snake_case`, no type suffix | `amount`, `entry_date`, `is_customer` — **not** `amount_decimal`, `dt_entry` |
| Boolean field | `is_`/`has_`/`allow_`/`track_` prefix | `is_customer`, `has_variants`, `allow_decimal`, `track_stock` |
| Timestamp field | `<verb>_at` | `created_at`, `issued_at`, `voided_at`, `last_activity_at` |
| Business date field | `<noun>_date` or `<verb>_on` | `entry_date`, `document_date`, `due_on`, `collection_date` |
| Cache/denormalised field | plain noun, documented as a cache | `balance`, `on_hand`, `amount_due` |
| `TextChoices` class | `PascalCase`, singular, in `constants.py` | `Direction`, `EntryType`, `InvoiceStatus` |
| Service function | imperative verb phrase | `post_entry`, `issue_invoice`, `record_payment`, `archive_party` |
| Selector function | noun phrase or `get_`/`list_` | `list_parties`, `get_party`, `party_summary`, `sales_register_rows` |
| Serializer | `<Model><Purpose>Serializer` | `PartyListSerializer`, `PartyCreateSerializer`, `InvoiceIssueSerializer` |
| ViewSet / View | `<Resource>ViewSet` / `<Purpose>View` | `PartyViewSet`, `LedgerSummaryView`, `PublicDocumentView` |
| FilterSet | `<Model>FilterSet` | `PartyFilterSet`, `SalesDocumentFilterSet` |
| Permission factory | `PascalCase` factory returning a class | `HasPermission`, `ModuleEnabled`, `PlanLimit` |
| Job type | `<app>.<verb_phrase>` | `notifications.send_party_entry_sms`, `sales.refresh_overdue` |
| Audit action | `<entity>.<past_tense_verb>` | `party.created`, `invoice.issued`, `ledger.entry.reversed` |
| Test | `test_<subject>_<condition>_<expectation>` | `test_post_entry_credit_without_mode_raises_validation` |
| Constant | `UPPER_SNAKE` | `MAX_BACKOFF_SECONDS`, `UTGST_STATE_CODES` |
| Private helper | `_leading_underscore` | `_request_hash`, `_differs` |

### R2.2 — Never abbreviate a domain word

`party`, not `pty`. `invoice`, not `inv`. `quantity` may be `qty` because the schema says `qty` and the schema wins; the rule is *use the canon's word*, not *use the short word*.

**✗ wrong** `def post_le(ctx, p_id, dir, amt): ...`
**✓ right** `def post_entry(*, ctx, party_id, direction, amount): ...`

### R2.3 — Names must match the canon exactly

If canon §0.7 says the status is `partially_paid`, the `TextChoices` value is `"partially_paid"` — not `"part_paid"`, not `"PARTIALLY_PAID"`. If canon §0.9 says the codename is `ledger.entry.correct`, that exact string is what `HasPermission` receives. A test asserts both sets against a literal copy of the canon lists.

```python
# apps/sales/tests/test_constants_match_canon.py
CANON_INVOICE_STATUSES = {"draft", "issued", "partially_paid", "paid", "overdue", "void"}


def test_invoice_status_choices_match_canon():
    assert {c.value for c in InvoiceStatus} == CANON_INVOICE_STATUSES
```

---

## 26.3 Model authoring

### R3.1 — Every model declares `db_table` explicitly

Django's default (`<app_label>_<modelname_lower>`) usually matches the canon, but "usually" is not a guarantee — `LedgerEntry` would default to `ledger_ledgerentry`, and Part 21 says `ledger_entry`.

**✗ wrong**

```python
class LedgerEntry(TenantModel):
    class Meta:
        ordering = ["-created_at"]      # table name left to Django → ledger_ledgerentry
```

**✓ right**

```python
class LedgerEntry(TenantModel):
    class Meta:
        db_table = "ledger_entry"
        ordering = ["-entry_date", "-created_at"]
```

### R3.2 — Every primary key is `uuid7_pk()`

**✗ wrong**

```python
id = models.UUIDField(primary_key=True, default=uuid.uuid4)     # random → B-tree scatter
id = models.BigAutoField(primary_key=True)                      # sequential → guessable, ADR-009 violation
```

**✓ right**

```python
from apps.common.db.fields import uuid7_pk

class Party(TenantModel):
    id = uuid7_pk()
```

`uuid7_pk()` is `models.UUIDField(primary_key=True, default=uuid6.uuid7, editable=False)`. `default=uuid6.uuid7` — the **function**, never `uuid6.uuid7()`, which would freeze one value at import time. That mistake has shipped in real projects; it is worth the explicit callout.

### R3.3 — Money, quantity and cost use the field classes, never raw `DecimalField`

**✗ wrong**

```python
amount = models.DecimalField(max_digits=12, decimal_places=2)   # wrong precision (Part 21: 14)
balance = models.FloatField(default=0)                          # catastrophic
qty = models.DecimalField(max_digits=14, decimal_places=2)      # quantities are 3 dp
```

**✓ right**

```python
from apps.common.db.fields import MoneyField, QuantityField, RateField, UnitCostField

amount = MoneyField()                        # numeric(14,2)
qty = QuantityField()                        # numeric(14,3)
unit_price = UnitCostField()                 # numeric(14,4)
tax_rate = RateField()                       # numeric(6,3)
```

Defaults for money are `Decimal("0.00")` written as a string, never `0` and never `0.0`:

```python
balance = MoneyField(default=Decimal("0.00"))
```

### R3.4 — Every status field is a `TextChoices` whose values match the canon

**✗ wrong**

```python
STATUS_CHOICES = [("d", "Draft"), ("i", "Issued")]              # invented codes
status = models.CharField(max_length=1, choices=STATUS_CHOICES)
status = models.CharField(max_length=16)                        # free text
```

**✓ right**

```python
# apps/sales/constants.py
class InvoiceStatus(models.TextChoices):
    DRAFT = "draft", _("Draft")
    ISSUED = "issued", _("Issued")
    PARTIALLY_PAID = "partially_paid", _("Partially paid")
    PAID = "paid", _("Paid")
    OVERDUE = "overdue", _("Overdue")
    VOID = "void", _("Void")

# apps/sales/models/document.py
status = models.CharField(max_length=16, choices=InvoiceStatus.choices,
                          default=InvoiceStatus.DRAFT)
```

Human labels are wrapped in `gettext_lazy as _` so `en` and `hi` both exist (canon §0.11 rule 6). The stored value is never translated.

### R3.5 — `Meta.constraints` and `Meta.indexes` carry explicit names

An unnamed constraint gets a generated name that differs between environments and cannot be referenced in a migration or a bug report.

**✗ wrong**

```python
class Meta:
    unique_together = [("tenant", "sku")]                # deprecated; no partial condition
    constraints = [models.CheckConstraint(check=models.Q(amount__gt=0))]   # no name → error
```

**✓ right**

```python
class Meta:
    db_table = "inventory_item"
    constraints = [
        models.UniqueConstraint(
            fields=["tenant", "sku"],
            condition=models.Q(deleted_at__isnull=True),
            name="uq_item_sku_per_tenant",
        ),
        models.CheckConstraint(
            check=models.Q(purchase_price__gte=0), name="ck_item_purchase_price_nonneg"
        ),
    ]
    indexes = [
        models.Index(fields=["tenant", "status", "name"], name="ix_item_tenant_status_name"),
        models.Index(fields=["tenant", "barcode"], name="ix_item_barcode"),
    ]
```

Naming convention: `uq_` unique, `ck_` check, `ix_` index, `fk_` foreign key. Names are ≤ 30 characters (Postgres truncates at 63 but short names survive prefixing).

### R3.6 — No business logic in `save()`, and no overridden `save()` at all except to normalise a field

`save()` is invisible at the call site, runs in `bulk_create`-shaped gaps, and makes services untestable in isolation.

**✗ wrong**

```python
class LedgerEntry(TenantModel):
    def save(self, *args, **kwargs):
        is_new = self._state.adding
        super().save(*args, **kwargs)
        if is_new:                                   # ← business logic, invisible, unskippable
            self.party.balance += self.signed_amount
            self.party.save()
            AuditLog.objects.create(action="ledger.entry.created", ...)
            send_sms(self.party.mobile, ...)         # ← network I/O inside a transaction
```

**✓ right** — the model stores; `post_entry` (Part 20 §20.3.3) does the work.

```python
class LedgerEntry(TenantModel):
    """Immutable ledger line. Storage only: every rule lives in ledger/services/."""
    # ... fields, Meta ...

    def __str__(self) -> str:
        return f"{self.direction} {self.amount} on {self.entry_date}"
```

The one permitted `save()` override is field normalisation with no side effects, and even then a service-layer normaliser is preferred:

```python
class Party(TenantModel):
    def save(self, *args, **kwargs):
        if self.mobile:
            self.mobile = normalise_e164(self.mobile)   # pure, idempotent, no I/O
        super().save(*args, **kwargs)
```

### R3.7 — `@property` is allowed only for zero-query derivations

**✗ wrong**

```python
@property
def amount_due(self):
    return self.grand_total - self.payments.aggregate(Sum("amount"))["amount__sum"]   # a query per row
```

**✓ right**

```python
@property
def is_open(self) -> bool:
    return self.status in (InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID,
                           InvoiceStatus.OVERDUE)
```

`amount_due` is a **column** (Part 21 §21.3.7), maintained by the payment service and recomputable by `check_invariants`.

### R3.8 — Foreign keys declare `on_delete` from the Part 21 §21.5 table, and `related_name` always

**✗ wrong**

```python
party = models.ForeignKey(Party, on_delete=models.CASCADE)     # deletes ledger history
created_by = models.ForeignKey(User, on_delete=models.CASCADE) # deleting a user deletes their work
tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)   # Part 21: RESTRICT
```

**✓ right**

```python
tenant = models.ForeignKey("platform.Tenant", on_delete=models.RESTRICT, related_name="+")
party = models.ForeignKey("parties.Party", on_delete=models.RESTRICT,
                          related_name="ledger_entries")
created_by = models.ForeignKey("platform.User", on_delete=models.SET_NULL, null=True,
                               blank=True, related_name="+")
```

`related_name="+"` where the reverse accessor would never be used — it keeps `dir(User)` honest and prevents accidental reverse traversal that bypasses tenant scoping.

### R3.9 — Abstract bases carry the common columns

```python
# apps/common/models.py
class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class TenantModel(TimeStampedModel):
    """Every business table (Part 21 §21.1)."""

    id = uuid7_pk()
    tenant = models.ForeignKey("platform.Tenant", on_delete=models.RESTRICT, related_name="+",
                               db_index=True)
    created_by = models.ForeignKey("platform.User", on_delete=models.SET_NULL, null=True,
                                   blank=True, related_name="+")
    objects = TenantManager()

    class Meta:
        abstract = True


class SoftDeleteModel(models.Model):
    """Master data only (Part 21 §21.6). Documents are voided; ledgers are never deleted."""

    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    all_objects = AllObjectsManager()

    class Meta:
        abstract = True
```

A model that is immutable (`LedgerEntry`, `StockMovement`, `AuditLog`) inherits `TenantModel` only — never `SoftDeleteModel`.

---

## 26.4 Services

### R4.1 — The signature shape is fixed

```python
@transaction.atomic
def <verb_phrase>(*, ctx: Ctx, <domain args>) -> <ResultDataclass | Model>:
```

- **Keyword-only.** Every argument after `*`. A positional call site is unreadable at six arguments and silently wrong when two are swapped.
- **`ctx` first**, always, typed `Ctx` (Part 20 §20.3.2).
- **Returns a frozen dataclass** when the caller needs more than one value; never a tuple, never a dict.
- **Type-hinted** on every parameter and the return.

**✗ wrong**

```python
def post_entry(request, party, amount, direction, date, note=None, mode=None):
    ...
    return entry, balance, warnings          # positional tuple; caller unpacks by memory
```

**✓ right**

```python
@dataclass(frozen=True, slots=True)
class PostEntryResult:
    entry: LedgerEntry
    party_balance: Decimal
    warnings: list[dict]


@transaction.atomic
def post_entry(*, ctx: Ctx, party_id: UUID, direction: str, amount: Decimal,
               entry_date: date, note: str = "", payment_mode: str | None = None,
               reference: str | None = None, override: bool = False) -> PostEntryResult:
```

### R4.2 — A service never receives `request`

**✗ wrong**

```python
def create_party(request, data):
    tenant = get_effective_tenant(request.user)      # untestable without HTTP; uncallable from a job
```

**✓ right**

```python
def create_party(*, ctx: Ctx, **fields) -> Party:
    return Party.objects.create(tenant=ctx.tenant, created_by=ctx.actor, **fields)
```

### R4.3 — A service that writes declares `@transaction.atomic`; a service that does not write, does not

Decorating a read with `atomic` opens a transaction for nothing and hides that the function is read-only.

### R4.4 — No network, no file I/O, no sleep inside a transaction

**✗ wrong**

```python
@transaction.atomic
def post_entry(*, ctx, ...):
    entry = LedgerEntry.objects.create(...)
    sms_backend.send(...)                  # holds the party lock across a provider call
    Image.open(upload).save(path)          # disk I/O inside the transaction
```

**✓ right**

```python
@transaction.atomic
def post_entry(*, ctx, ...):
    entry = LedgerEntry.objects.create(...)
    enqueue(tenant=ctx.tenant, job_type="notifications.send_party_entry_sms",
            payload={"entry_id": str(entry.id)}, idempotency_token=f"party_sms:{entry.id}")
```

### R4.5 — Services raise `DomainError` subclasses, never DRF exceptions

**✗ wrong**

```python
from rest_framework.exceptions import ValidationError

def archive_party(*, ctx, party_id):
    if party.balance != 0:
        raise ValidationError("Settle the balance first.")     # couples the service to HTTP
```

**✓ right**

```python
from apps.common.exceptions import BusinessRuleViolation

def archive_party(*, ctx, party_id) -> Party:
    if party.balance != 0:
        raise BusinessRuleViolation(
            "party_balance_nonzero",
            "Settle the balance before archiving this party.",
            details={"balance": str(party.balance)},
        )
```

The error code must be one from the canon §22.1 list or one registered by a CR. Inventing `"cannot_archive"` breaks the frontend's error map.

### R4.6 — Every state change writes exactly one audit row per logical event

Canon §0.11 rule 4. Not zero, and not one per touched table.

**✗ wrong**

```python
def issue_invoice(*, ctx, ...):
    ...
    write_audit(ctx=ctx, action="stock.movement.created", ...)   # ×8, one per line
    write_audit(ctx=ctx, action="ledger.entry.created", ...)
    # and no `invoice.issued` row — the event a human would look for
```

**✓ right**

```python
    write_audit(ctx=ctx, action=AuditAction.INVOICE_ISSUED, entity_type="sales_document",
                entity_id=doc.id,
                after={"number": doc.number, "status": doc.status,
                       "grand_total": str(doc.grand_total), "amount_due": str(doc.amount_due)},
                metadata={**ctx.audit_meta, "movements": len(movements),
                          "credit_limit_override": override or None})
```

Per-row detail lives in `metadata`, summarised (SAL-02 §16: "`stock.movement.created` (batched metadata `document_id`)").

### R4.7 — A service is the only writer of its app's tables

No app writes another app's models directly. Crossing a boundary means calling a service.

**✗ wrong**

```python
# apps/sales/services/issue.py
party.balance += doc.grand_total
party.save(update_fields=["balance"])        # sales reaching into parties' invariants
```

**✓ right**

```python
from apps.ledger.services.post import post_document_entry

post_document_entry(ctx=ctx, party=party, direction=Direction.DEBIT, amount=doc.grand_total,
                    entry_date=doc.document_date, entry_type=EntryType.INVOICE,
                    source_type=SourceType.SALES_DOCUMENT, source_id=doc.id)
# post_document_entry updates the party cache through parties' own service.
```

### R4.8 — Locks are taken in the global order, and the order is commented

```python
# Lock order L1 (Part 20 §20.11.2): party before ledger_entry.
party = get_party_for_update(tenant=ctx.tenant, party_id=party_id)
```

```python
# Lock order L2: stock rows ordered by item_id so two documents with the same
# items in different line orders cannot deadlock.
for line in sorted(lines, key=lambda l: str(l.item_id)):
    ...
```

### R4.9 — Return values are never formatted for display

A service returns `Decimal("2800.00")`, not `"₹2,800"`. Formatting is the client's job; string conversion is the serializer's.

---

## 26.5 Selectors

### R5.1 — A selector is read-only and says so in its name

**✗ wrong**

```python
def get_or_create_default_location(tenant):      # a "get_" that writes
    return Location.objects.get_or_create(tenant=tenant, code="MAIN")[0]
```

**✓ right** — that function is a service (`inventory/services/location.py: ensure_default_location`).

### R5.2 — A selector takes the tenant explicitly and scopes first

**✗ wrong**

```python
def list_parties(**filters):
    return Party.objects.filter(**filters)         # unscoped: one forgotten caller leaks everything
```

**✓ right**

```python
def list_parties(*, tenant, filters: PartyFilters, ordering: str = "-last_activity_at"):
    qs = (Party.objects.for_tenant(tenant)
          .filter(deleted_at__isnull=True)
          .prefetch_related("tags"))
    ...
```

### R5.3 — Joins are declared by the selector, not discovered by the serializer

**✗ wrong**

```python
def list_entries(*, tenant, party_id):
    return LedgerEntry.objects.for_tenant(tenant).filter(party_id=party_id)
    # the serializer then touches entry.created_by.full_name → one query per row
```

**✓ right**

```python
def list_entries(*, tenant, party_id, cursor=None, limit=50):
    return (LedgerEntry.objects.for_tenant(tenant)
            .filter(party_id=party_id)
            .select_related("created_by")
            .prefetch_related("attachments")
            .order_by("-entry_date", "-created_at", "-id"))
```

### R5.4 — Aggregation happens in SQL

**✗ wrong**

```python
total = sum(e.amount for e in LedgerEntry.objects.for_tenant(tenant))   # loads every row
```

**✓ right**

```python
totals = LedgerEntry.objects.for_tenant(tenant).aggregate(
    debit=Sum("amount", filter=Q(direction=Direction.DEBIT, status="posted")),
    credit=Sum("amount", filter=Q(direction=Direction.CREDIT, status="posted")),
)
```

### R5.5 — Annotations that do arithmetic declare `output_field`

Without it Django infers `FloatField` and money silently becomes binary floating point.

**✗ wrong**

```python
qs.annotate(value=F("on_hand") * F("avg_cost"))            # → FloatField
```

**✓ right**

```python
qs.annotate(value=ExpressionWrapper(F("on_hand") * F("avg_cost"),
                                    output_field=MoneyField()))
```

### R5.6 — A selector returns a queryset, a dataclass, or a list of dicts — never a serializer

Serialisation belongs one layer up. A selector that imports a serializer has inverted the layering.

---

## 26.6 Serializers

### R6.1 — Separate read and write serializers

One serializer doing both grows `read_only_fields`, conditional `required`, and `context["action"]` branches until nobody can tell what a POST accepts.

**✗ wrong**

```python
class PartySerializer(serializers.ModelSerializer):
    class Meta:
        model = Party
        fields = "__all__"                         # exposes tenant_id, deleted_at, caches
        read_only_fields = ["balance", "created_at"]
```

**✓ right**

```python
class PartyListSerializer(serializers.ModelSerializer):
    balance = MoneyField(read_only=True)
    tags = TagMiniSerializer(many=True, read_only=True)

    class Meta:
        model = Party
        fields = ("id", "name", "mobile", "is_customer", "is_supplier", "balance",
                  "collection_date", "tags", "last_activity_at", "status")
        read_only_fields = fields


class PartyCreateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=160)
    mobile = serializers.CharField(max_length=15, required=False, allow_null=True)
    is_customer = serializers.BooleanField(default=True)
    is_supplier = serializers.BooleanField(default=False)
    gstin = GstinField(required=False, allow_null=True)
    opening_balance = OpeningBalanceSerializer(required=False, allow_null=True)
```

### R6.2 — `fields` is always an explicit tuple; `__all__` and `exclude` are banned

A new column must never appear on the wire because someone added it to the model.

### R6.3 — Money, quantity and cost are transported as strings

**✗ wrong**

```python
amount = serializers.FloatField()                                 # float on the wire
amount = serializers.DecimalField(max_digits=14, decimal_places=2,
                                  coerce_to_string=False)         # JSON number
```

**✓ right**

```python
# apps/common/serializers.py
class MoneyField(serializers.DecimalField):
    def __init__(self, **kwargs):
        kwargs.setdefault("max_digits", 14)
        kwargs.setdefault("decimal_places", 2)
        kwargs.setdefault("coerce_to_string", True)
        kwargs.setdefault("localize", False)
        super().__init__(**kwargs)
```

`localize=False` is not optional: with `USE_L10N` and a Hindi locale, a localized decimal would emit a different separator and the client's `decimal.js-light` would choke.

### R6.4 — No queries in `to_representation` or in a `SerializerMethodField`

**✗ wrong**

```python
class InvoiceSerializer(serializers.ModelSerializer):
    party_name = serializers.SerializerMethodField()

    def get_party_name(self, obj):
        return Party.objects.get(pk=obj.party_id).name      # one query per row
```

**✓ right**

```python
    party = PartyMiniSerializer(read_only=True)    # selector did select_related("party")
```

or, when the value is a snapshot column that already exists:

```python
    party_name = serializers.CharField(source="party_snapshot.name", read_only=True)
```

A method field is permitted only when it reads attributes **already loaded** on the instance, and the selector that guarantees the load is named in a comment.

### R6.5 — Validation that needs the database goes in the service, not the serializer

A serializer validates *shape*. "Does this party have an opening balance already" is a business rule with a race condition and belongs under a lock.

**✗ wrong**

```python
def validate(self, attrs):
    if LedgerEntry.objects.filter(party=attrs["party"], entry_type="opening").exists():
        raise serializers.ValidationError("Opening balance exists")      # TOCTOU race
```

**✓ right** — the serializer checks types and ranges; `post_entry` checks existence under `SELECT … FOR UPDATE` and raises `BusinessRuleViolation("opening_balance_exists", …)` which becomes the canonical 409.

### R6.6 — Related ids use `TenantPrimaryKeyRelatedField`

**✗ wrong**

```python
party = serializers.PrimaryKeyRelatedField(queryset=Party.objects.all())   # cross-tenant IDOR
```

**✓ right**

```python
party = TenantPrimaryKeyRelatedField(queryset=Party.objects.all(), source="party_id")
```

### R6.7 — Serializers never call services and never write

`serializer.save()` on a `ModelSerializer` is permitted **only** for leaf master data with no side effects (`Tag`, `Unit`, `ExpenseCategory`). Anything with an invariant, a cache, a ledger consequence or an audit row goes through a service, and the serializer is a plain `serializers.Serializer` that produces kwargs.

### R6.8 — Error messages are translatable and user-facing

**✗ wrong** `raise serializers.ValidationError("amount must be > 0 (see BR-6)")`
**✓ right** `raise serializers.ValidationError(_("Enter an amount greater than 0"))`

Messages match the FRD's copy table exactly (LED-01 §10 gives the `en` strings; `hi` lives in the `.po` files).

---

## 26.7 Views and viewsets

### R7.1 — A view method is at most ~12 lines and calls exactly one service or selector

**✗ wrong**

```python
def create(self, request):
    data = request.data
    party = Party.objects.get(pk=data["party_id"])
    if party.tenant_id != request.user.tenant_id:          # hand-rolled tenancy
        return Response({"error": "forbidden"}, status=403)   # wrong code, wrong envelope
    if party.status == "archived":
        return Response({"error": "archived"}, status=400)
    amount = Decimal(data["amount"])
    if party.credit_limit and party.balance + amount > party.credit_limit:   # business rule in a view
        return Response({"error": "limit"}, status=409)
    with transaction.atomic():                                # transaction in a view
        entry = LedgerEntry.objects.create(...)
        party.balance += amount
        party.save()
    return Response(LedgerEntrySerializer(entry).data, status=201)
```

**✓ right** — Part 20 §20.3.3's `create`: validate, call `post_entry`, wrap in `StandardResponse.created`.

### R7.2 — `permission_classes` is explicit on every viewset; there is no implicit default

Even when the global default would suffice, the class is written out, because reading a viewset must answer "who may do this" without opening `settings.py`.

**✓ right**

```python
permission_classes = [
    IsAuthenticated,
    ModuleEnabled(ModuleCode.LEDGER),
    HasPermission({"list": "ledger.entry.read", "retrieve": "ledger.entry.read",
                   "create": "ledger.entry.write", "reverse": "ledger.entry.correct",
                   "correct": "ledger.entry.correct"}),
]
```

An action missing from the mapping is **denied** (Part 20 §20.5.5), so adding an `@action` without adding its codename fails closed and is caught by the permission-coverage test.

### R7.3 — `filterset_class` is explicit; ad-hoc `request.query_params` filtering is banned

**✗ wrong**

```python
def get_queryset(self):
    qs = super().get_queryset()
    if self.request.query_params.get("status"):
        qs = qs.filter(status=self.request.query_params["status"])     # unvalidated, undocumented
    if self.request.query_params.get("q"):
        qs = qs.filter(name__icontains=self.request.query_params["q"])
    return qs
```

**✓ right**

```python
# apps/parties/filters.py
class PartyFilterSet(BaseTenantFilterSet):
    q = filters.CharFilter(method="filter_search")
    type = filters.ChoiceFilter(method="filter_type", choices=[("customer", "…"), ("supplier", "…")])
    balance = filters.ChoiceFilter(method="filter_balance",
                                   choices=[("owes_me", "…"), ("i_owe", "…"), ("settled", "…")])
    status = filters.ChoiceFilter(choices=PartyStatus.choices)
    tag = filters.CharFilter(field_name="tags__name")
    collection = filters.ChoiceFilter(method="filter_collection",
                                      choices=[("today", "…"), ("overdue", "…"), ("upcoming", "…")])

    class Meta:
        model = Party
        fields: list[str] = []

    def filter_search(self, qs, name, value):
        return qs.filter(Q(name__icontains=value) | Q(mobile__icontains=value)
                         | Q(display_code__iexact=value))
```

The filterset's parameter names are the API contract (§22.4) and are reviewed against it.

### R7.4 — Ordering is whitelisted

```python
ordering_fields = ["last_activity_at", "balance", "name", "collection_date"]
ordering = ["-last_activity_at"]
```

Never `ordering_fields = "__all__"`: an attacker ordering by an unindexed column is a cheap denial of service, and ordering by a column the client should not know about is an oracle.

### R7.5 — State transitions are sub-resource actions, never `PATCH status`

Canon §22.1. `POST /sales/invoices/{id}/issue`, not `PATCH {"status": "issued"}`.

**✗ wrong**

```python
class InvoiceUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        fields = ("status", ...)          # lets a client set any status, skipping every side effect
```

**✓ right**

```python
@action(detail=True, methods=["post"])
@idempotent(scope="sales_invoice_issue")
def issue(self, request, pk=None):
    payload = IssueSerializer(data=request.data)
    payload.is_valid(raise_exception=True)
    doc = issue_invoice(ctx=Ctx.from_request(request), document_id=pk, **payload.validated_data)
    return StandardResponse.ok(SalesDocumentSerializer(doc, context=self.get_serializer_context()).data)
```

### R7.6 — Responses always go through `StandardResponse`

**✗ wrong** `return Response({"ok": True})` — no envelope, no `data` key.
**✓ right** `return StandardResponse.ok({"party_balance": str(balance)})`

### R7.7 — Views never catch `Exception`

Let the exception handler do its job. A `try/except Exception: return Response(..., 500)` in a view destroys the request id, the log record and the error code.

### R7.8 — Optimistic concurrency on mutable documents

Any `PATCH` on a document requires `version` and bumps it under a lock.

```python
def update_draft(*, ctx, document_id: UUID, version: int, **fields) -> SalesDocument:
    doc = SalesDocument.objects.select_for_update().for_tenant(ctx.tenant).get(pk=document_id)
    if doc.status != InvoiceStatus.DRAFT:
        raise BusinessRuleViolation("document_not_draft", "Only drafts can be edited.")
    if doc.version != version:
        raise StaleVersion()                      # → 409 stale_version (§22.1)
    ...
    doc.version = version + 1
```

---

## 26.8 The exception hierarchy and the error handler

### R8.1 — One handler, one envelope

`apps/common/exceptions.py: drf_exception_handler` is the only code that constructs `{"error": {...}}`. It is registered in `REST_FRAMEWORK["EXCEPTION_HANDLER"]` and covered by a test per branch. See Part 20 §20.3.5 for the implementation.

### R8.2 — Error codes come from the canon list

`validation_error`, `not_found`, `permission_denied`, `module_disabled`, `plan_limit_reached`, `party_balance_nonzero`, `insufficient_stock`, `document_not_draft`, `document_already_void`, `credit_limit_exceeded`, `duplicate_supplier_invoice`, `otp_invalid`, `otp_throttled`, `idempotency_conflict`, `stale_version` (§22.1), plus those registered by FRDs through a CCR: `party_archived`, `opening_balance_exists`, `entry_already_reversed`, `use_document_void`, `kind_not_allowed`, `channel_not_configured`, `low_contrast`, `stock_nonzero`, `over_allocated`, `impersonation_not_consented`, `number_too_long`, `unauthenticated`, `rate_limited`, `server_error`, `service_busy`.

A new code requires: (1) a line in the canon list via CR, (2) a frontend message key in `en` and `hi`, (3) a test. A code that exists only in the backend is a code that renders as "Something went wrong" to the user.

**✗ wrong** `raise BusinessRuleViolation("cant_do_that", "Nope")`
**✓ right** `raise BusinessRuleViolation("document_already_void", _("This document is already void."))`

### R8.3 — Cross-tenant is 404, never 403

Guaranteed structurally by the scoped queryset raising `Http404`. A view that adds its own tenant check and returns 403 is a defect, and the isolation test suite (Part 20 §20.4.7) fails it.

### R8.4 — `details` is a field map for validation, a fact bag otherwise

```python
# validation
{"error": {"code": "validation_error", "details": {"amount": ["Enter an amount greater than 0"]}}}
# business rule
{"error": {"code": "credit_limit_exceeded",
           "details": {"limit": "50000.00", "balance_after": "53000.00"}}}
```

`details` never contains a traceback, a SQL string, an internal id the client cannot use, or another tenant's data.

---

## 26.9 Logging

Content rules live in Part 30; the code rules are here.

### R9.1 — One logger per app, named `ub.<app>`

```python
logger = logging.getLogger("ub.ledger")        # module top level, once
```

Never `logging.getLogger(__name__)` — the hierarchy then depends on file paths, and a refactor silently re-levels the logs.

### R9.2 — Structured `extra`, never f-string interpolation of data

**✗ wrong**

```python
logger.info(f"Posted entry {entry.id} for party {party.name} amount {amount} mobile {party.mobile}")
```

Three faults: the message is not groupable, the fields are not queryable, and it logs PII.

**✓ right**

```python
logger.info("ledger.entry.posted", extra={
    "event": "ledger.entry.posted", "entry_id": str(entry.id), "party_id": str(party.id),
    "direction": direction, "amount": str(amount), "entry_type": entry_type,
})
```

### R9.3 — Never log PII, secrets, tokens or full request bodies

Forbidden in any log record: mobile numbers (masked only: `+91XXXXXX3210`), names, addresses, GSTIN, email, OTP codes, passwords, JWTs, cookies, `Authorization` headers, `Idempotency-Key` values, full request/response bodies. The redaction list in Part 30 §30.4 is the authority and is enforced by a formatter filter, not by discipline alone.

### R9.4 — Level discipline

| Level | Use |
|---|---|
| `DEBUG` | Developer detail, dev only, never enabled in production |
| `INFO` | A business event happened (`ledger.entry.posted`, `job.succeeded`, `sms.console`) |
| `WARNING` | A recoverable anomaly (`job.retrying`, `credit_limit.warned`, `slow_query`) |
| `ERROR` | A request or job failed and a human may need to act (`job.dead_letter`, `unhandled_exception`) |
| `CRITICAL` | The process cannot continue (startup assertion failure) |

A 4xx caused by user input is **not** an error. Logging `ValidationFailed` at ERROR makes the error log useless within a week.

### R9.5 — `logger.exception` only inside an `except` block

And never together with a re-raise that will be logged again upstream.

---

## 26.10 Settings

### R10.1 — Read environment only in `config/settings/*`

**✗ wrong**

```python
# apps/notifications/services/send.py
import os
SENDER = os.environ.get("UB_SMS_SENDER_ID", "UDHAAR")     # untestable, undiscoverable
```

**✓ right**

```python
from django.conf import settings

sender = settings.SMS_SENDER_ID
```

and the variable appears in the Part 20 §20.13.2 catalogue.

### R10.2 — `settings` is read inside functions, not at module import

Module-level `settings.X` freezes the value and breaks `override_settings` in tests.

**✗ wrong** `BACKEND = import_string(settings.SMS_BACKEND)()` at module level.
**✓ right** `get_sms_backend()` with `@lru_cache`, plus a `setting_changed` receiver that clears the cache in tests.

### R10.3 — No secrets, no environment branching, no `if DEBUG` in application code

`if settings.DEBUG:` inside a service means production and development run different business logic. Environment differences live in the settings files.

---

## 26.11 Migrations

### R11.1 — Rename every auto-generated migration

`0007_auto_20260918_1432.py` → `0007_add_credit_limit_to_party.py`, with `name` updated in the `dependencies` of anything that references it (nothing does, at creation time).

### R11.2 — Schema and data in separate files; every `RunPython` reversible or explicitly `noop`

### R11.3 — Data migrations use `apps.get_model`, never a direct import

**✗ wrong**

```python
from apps.parties.models import Party            # today's class against a historical schema

def backfill(apps, schema_editor):
    for p in Party.objects.all():
        ...
```

**✓ right**

```python
def backfill(apps, schema_editor):
    Party = apps.get_model("parties", "Party")
    Party.objects.filter(receivable_total__isnull=True).update(receivable_total=Decimal("0.00"))
```

### R11.4 — Batch anything that touches more than 5 000 rows

A single `UPDATE` over a million rows holds locks and bloats WAL. Loop with `pk__in=<2000 ids>`.

### R11.5 — `AddIndexConcurrently` in `atomic = False` migrations for indexes on populated tables

```python
class Migration(migrations.Migration):
    atomic = False
    operations = [AddIndexConcurrently("ledgerentry",
                                       models.Index(fields=["tenant", "entry_date"],
                                                    name="ix_ledger_date"))]
```

### R11.6 — `makemigrations --check --dry-run` runs in CI

A model change without a migration fails the build.

---

## 26.12 Type hints, `mypy` and docstrings

### R12.1 — Type hints are mandatory on service and selector signatures

Every parameter and the return. Internals may be inferred. Views, serializers and models are hinted where it clarifies; `mypy` is not run over Django's dynamic surfaces.

```python
def list_parties(*, tenant: Tenant, filters: PartyFilters,
                 ordering: str = "-last_activity_at") -> QuerySet[Party]: ...
```

### R12.2 — `mypy` posture: strict where it pays, off where it fights Django

```toml
[tool.mypy]
python_version = "3.12"
warn_unused_ignores = true
warn_redundant_casts = true
no_implicit_optional = true
disallow_untyped_defs = false          # global: pragmatic

[[tool.mypy.overrides]]
module = ["apps.*.services.*", "apps.*.selectors.*", "apps.common.money",
          "apps.common.jobs", "apps.common.idempotency", "apps.common.tenancy"]
disallow_untyped_defs = true           # the layers where types prevent real bugs
disallow_incomplete_defs = true

[[tool.mypy.overrides]]
module = ["apps.*.migrations.*", "apps.*.admin", "apps.*.tests.*"]
ignore_errors = true
```

`mypy` runs in CI as a non-blocking report for the whole tree and **blocking** for the strict modules above. `django-stubs` is deliberately **not** added (ADR-021); the strict modules are plain Python by construction.

### R12.3 — `from __future__ import annotations` at the top of every module with hints

Cheap, avoids import cycles in type positions, and makes `Model | None` legal everywhere.

### R12.4 — Docstring policy

| Object | Docstring |
|---|---|
| Module | One line when the filename is not self-explanatory; none otherwise |
| **Service function** | **Mandatory.** What it does, the business rules it enforces with their FRD ids, the locks it takes, and what it raises |
| **Selector function** | Mandatory when non-obvious: what it returns and which joins it guarantees |
| Model | Mandatory: what the row is, plus any immutability or cache semantics |
| Serializer | One line stating read or write and which endpoint |
| ViewSet | One line naming the route |
| Private helper | Only when the name is insufficient |
| Test | The name is the docstring; add one only for a subtle scenario |

**✓ right**

```python
def post_entry(*, ctx: Ctx, ...) -> PostEntryResult:
    """Post one immutable ledger entry and move the party's cached balance.

    Enforces LED-01 BR-1…BR-10: immutability, balance arithmetic, credit-limit
    modes (off/warn/block with owner override), one opening entry per party
    (LED-02 BR-2), and `payment_mode` required for credits.

    Locks: `parties_party` FOR UPDATE (lock order L1, Part 20 §20.11.2).

    Raises:
        ValidationFailed: amount ≤ 0, future date, credit without a mode.
        BusinessRuleViolation: party_archived, opening_balance_exists,
            credit_limit_exceeded.
    """
```

Docstrings state **why and what**, never **how** — the code is the how, and a docstring that narrates the body rots within a sprint.

---

## 26.13 Dependency policy

### R13.1 — The backend allow-list is closed

ADR-021: `Django`, `djangorestframework`, `djangorestframework-simplejwt`, `psycopg[binary]`, `django-filter`, `django-cors-headers`, `Pillow`, `environs` (or `python-decouple`), plus dev-only `pytest`, `pytest-django`, `factory-boy`, `black`, `isort`, `flake8`/`ruff`, `django-debug-toolbar`. **`uuid6`** is the one addition, recorded as ADR-021a because ADR-009 mandates UUID v7 and Postgres 16 cannot generate it.

### R13.2 — Adding a dependency requires a new ADR, and the ADR must answer

1. What problem does it solve that ~200 lines of our own code would not?
2. How many transitive dependencies does it bring? (More than two is a strong no.)
3. Is it maintained, and what is our exit plan if it is abandoned?
4. What is its licence, and is it compatible with a commercial white-label product?
5. What is its attack surface — does it parse untrusted input, make network calls, or execute templates?
6. What breaks in the build, the image size and the CI time?

### R13.3 — Pin exactly, in `requirements/base.txt`

`Django==5.2.6`, not `Django>=5.2`. Upgrades are deliberate PRs with the changelog read.

### R13.4 — Things that will be proposed, and the answer

| Proposal | Answer |
|---|---|
| `celery` + `redis` | No — ADR-012. `platform_job` (Part 20 §20.8). |
| `django-storages` + `boto3` | Not at MVP — ADR-013. Phase 2 behind the storage seam. |
| `sentry-sdk`, `opentelemetry-*`, `prometheus-client` | Not at MVP — ADR-018. Part 30 §30.12 defines the seams. |
| `weasyprint`, `reportlab`, `wkhtmltopdf` | No — ADR-014, PDFs are client-side. |
| `django-money`, `py-moneyed` | No — `Decimal` plus `apps/common/money.py` is thirty lines. |
| `django-simple-history` | No — `platform_audit_log` is the history, and it is domain-shaped. |
| `drf-spectacular` | Deferred — the API spec is Part 22, hand-written and authoritative. A CR may add it if drift becomes real. |
| `django-guardian` | No — object permissions are six lines in `check_object_permission`. |
| `pandas` | No — CSV import/export uses the stdlib `csv` module streaming. |
| `requests` | Not until an adapter needs it (Phase 2), and then with an allow-list and a timeout (Part 27 §27.6). |

---

## 26.14 Formatting and linting configuration

Real configuration, committed as `pyproject.toml`. `ruff` covers `flake8`'s role and more; `black` and `isort` remain the formatters so that diffs are boring.

```toml
[tool.black]
line-length = 100
target-version = ["py312"]
extend-exclude = "/migrations/"

[tool.isort]
profile = "black"
line_length = 100
known_first_party = ["apps", "config"]
sections = ["FUTURE", "STDLIB", "THIRDPARTY", "FIRSTPARTY", "LOCALFOLDER"]
skip_glob = ["**/migrations/*"]

[tool.ruff]
line-length = 100
target-version = "py312"
exclude = ["**/migrations/*"]

[tool.ruff.lint]
select = [
  "E", "W",     # pycodestyle
  "F",          # pyflakes
  "I",          # isort agreement
  "N",          # pep8-naming
  "UP",         # pyupgrade
  "B",          # bugbear
  "C4",         # comprehensions
  "DJ",         # flake8-django
  "S",          # bandit security rules
  "T20",        # no print()
  "RET",        # return consistency
  "SIM",        # simplify
  "TID",        # tidy imports (bans relative imports beyond one level)
  "ERA",        # no commented-out code
  "PL",         # pylint subset
  "RUF",
]
ignore = [
  "E501",       # line length is black's job
  "B008",       # DRF/Django call-in-default is idiomatic
  "N802",       # permission/class factories are intentionally PascalCase functions
  "PLR0913",    # services legitimately take many keyword-only arguments
  "S101",       # assert is allowed in tests and in startup invariants
]

[tool.ruff.lint.per-file-ignores]
"**/tests/*" = ["S", "PLR2004"]
"config/settings/*" = ["F403", "F405"]      # star-import of base is the documented pattern

[tool.ruff.lint.flake8-tidy-imports]
ban-relative-imports = "parents"

[tool.pytest.ini_options]
DJANGO_SETTINGS_MODULE = "config.settings.test"
python_files = ["test_*.py"]
addopts = "--strict-markers --reuse-db -q"
markers = [
  "concurrency: spawns threads and needs a real transactional database",
  "slow: excluded from the pre-commit run",
]

[tool.coverage.run]
source = ["apps"]
omit = ["*/migrations/*", "*/tests/*", "*/admin.py", "config/*"]

[tool.coverage.report]
fail_under = 85
exclude_lines = ["pragma: no cover", "if TYPE_CHECKING:", "raise NotImplementedError"]
```

Pre-commit runs `black`, `isort`, `ruff`, `makemigrations --check`, and the fast test subset. CI additionally runs the full suite, `mypy`, the architecture tests (Part 20 §20.1.5), the tenant-isolation suite and the query-count budgets.

**Custom project lint rules** — three checks `ruff` cannot express, implemented as tests in `tests/architecture/`:

```python
def test_no_float_in_money_paths():
    """float() and float literals are banned outside tests and migrations."""
    pattern = re.compile(r"\bfloat\(|(?<![\w.])\d+\.\d+(?![\d\"'])")
    for path in APPS_ROOT.rglob("*.py"):
        if any(p in path.parts for p in ("tests", "migrations")):
            continue
        for lineno, line in enumerate(path.read_text().splitlines(), 1):
            if "# noqa: float-ok" in line:
                continue
            assert not pattern.search(line), f"{path}:{lineno} float in money path"


def test_no_objects_all_without_tenant_scope():
    """`.objects.all()` outside selectors/tests/admin usually means a missing tenant scope."""


def test_every_permission_string_is_registered():
    """Every literal passed to HasPermission exists in PERMISSIONS (Part 20 §20.5.5)."""
```

---

## 26.15 Testing standards

### R15.1 — The test pyramid per feature

Each FRD's §21 lists its tests; these are the *kinds* and what each must cover.

| Kind | Location | Must cover |
|---|---|---|
| Unit (service) | `apps/<app>/tests/test_services.py` | Every business rule (BR-n) with its happy path and its violation |
| Unit (pure) | `test_tax_engine.py`, `test_money.py` | Worked examples paisa-exact |
| Selector | `test_selectors.py` | Filters, ordering, totals over the filtered set, **query counts** |
| API | `test_api_*.py` | Status code, envelope shape, error code, permission per role, pagination |
| Tenancy | `test_tenancy.py` | 404 on every cross-tenant id, for every route |
| DB | `test_models.py` | Every constraint and trigger, by attempting the violation |
| Concurrency | `tests/integration/test_concurrency.py` | The eight scenarios in Part 20 §20.11.6 |
| Integration | `tests/integration/` | The canon §22.14 worked example end to end |

### R15.2 — Every test is tenant-aware

A test that creates one tenant proves nothing about isolation. The shared `two_tenant_fixture` exists so that "does this leak" is one line away.

### R15.3 — Factories, not fixtures files

`factory-boy` in `tests/factories/`. No `fixtures/*.json` — a JSON fixture goes stale the moment a column is added and fails in a way that teaches nobody anything.

### R15.4 — No mocking of our own code

Mock only the adapter boundary (`FakeSmsBackend`). A test that mocks `post_entry` to test a view is testing the mock. If a test needs to mock a service, the layering is wrong.

### R15.5 — Money assertions compare strings or `Decimal`, never floats

**✗ wrong** `assert response.json()["data"]["amount"] == 500.0`
**✓ right** `assert response.json()["data"]["amount"] == "500.00"`

### R15.6 — Time is injected, never `datetime.now()` in an assertion

Use `freezegun`-free explicit dates (the dependency list has no freezegun): services take `entry_date` explicitly, and `tenant_today()` is the single clock read, patched via `settings`-free dependency injection in the two places it matters.

---

## 26.16 Constants, enums and magic values

### R16.1 — Every enumerated value lives in a `TextChoices` in `constants.py`

No string literal for a status, direction, kind, mode, channel, movement type or source type appears anywhere except the `TextChoices` that defines it.

**✗ wrong**

```python
if entry.status == "posted" and entry.direction == "debit":
    ...
qs.filter(kind="invoice", status__in=["issued", "partially_paid"])
```

A typo (`"issed"`) silently matches nothing and the bug ships.

**✓ right**

```python
from apps.common.constants import Direction
from apps.ledger.constants import EntryStatus
from apps.sales.constants import InvoiceStatus, SalesKind

if entry.status == EntryStatus.POSTED and entry.direction == Direction.DEBIT:
    ...
qs.filter(kind=SalesKind.INVOICE, status__in=InvoiceStatus.open_statuses())
```

Helper classmethods on the choices class carry the *set* definitions so "open" means the same thing in six places:

```python
class InvoiceStatus(models.TextChoices):
    ...

    @classmethod
    def open_statuses(cls) -> list[str]:
        return [cls.ISSUED, cls.PARTIALLY_PAID, cls.OVERDUE]

    @classmethod
    def terminal_statuses(cls) -> list[str]:
        return [cls.PAID, cls.VOID]
```

### R16.2 — Shared enums live in `apps/common/constants.py`; app-specific ones in the app

`Direction`, `PaymentMode`, `SourceType`, `ModuleCode`, `RoleCode`, `ActorType`, `JobStatus` are shared. `EntryType`, `InvoiceStatus`, `MovementType` belong to their app. An app-specific enum imported by three apps is a signal to promote it to `common` — with a CR, because canon §0.7 must agree.

### R16.3 — No magic numbers

**✗ wrong**

```python
if len(otp) != 6 or attempts > 5:
    ...
expires = now + timedelta(seconds=300)
if balance_after > 50000:
    ...
```

**✓ right**

```python
OTP_LENGTH = 6
OTP_MAX_ATTEMPTS = settings.OTP_MAX_ATTEMPTS
OTP_TTL = timedelta(seconds=settings.OTP_TTL_SECONDS)
```

A threshold that a merchant might want to change is a **tenant setting** (`platform_tenant_setting`), not a constant — `ledger.credit_limit_mode`, `sales.round_off_default`, `inventory.allow_negative_stock` are settings; `OTP_LENGTH` is a constant.

### R16.4 — Tenant settings are read through one accessor with an explicit default

**✗ wrong**

```python
mode = TenantSetting.objects.get(tenant=tenant, key="ledger.credit_limit_mode").value
# DoesNotExist for a tenant that never touched the setting; a query per call
```

**✓ right**

```python
from apps.platform_app.selectors.settings import get_setting

mode = get_setting(tenant, "ledger.credit_limit_mode", default="off")
```

`get_setting` loads a tenant's whole settings map once per request (memoised on the tenant instance), validates the key against the well-known list in Part 21 §21.3.1, and raises at import-review time for an unknown key.

---

## 26.17 Job handlers

### R17.1 — A handler is registered with `@job_handler` and lives in the owning app's `tasks.py`

```python
# apps/sales/tasks.py
@job_handler("sales.refresh_overdue", max_attempts=3, timeout_seconds=600, requires_tenant=False)
def refresh_overdue(job, ctx) -> dict:
    """Mark issued/partially-paid invoices with due_on < today as overdue (canon §0.7)."""
```

### R17.2 — A handler takes `(job, ctx)` and returns a small JSON-serialisable dict or `None`

The return value lands in `platform_job.result` and is read by an operator. It summarises; it never dumps.

**✗ wrong** `return {"invoices": [str(i.id) for i in updated]}` — unbounded.
**✓ right** `return {"tenants": 812, "invoices_marked": 1_204, "failed_tenants": 0}`

### R17.3 — A handler is idempotent, and says how in its docstring

One of the three mechanisms in Part 20 §20.8.9 (enqueue token, natural key check, or an inherently idempotent computation). A handler that cannot be made idempotent is a design error.

### R17.4 — A handler that cannot succeed on retry raises `PermanentJobError`

**✗ wrong**

```python
party = Party.objects.get(pk=job.payload["party_id"])     # DoesNotExist → retried 5 times, then dead
```

**✓ right**

```python
party = Party.objects.for_tenant(ctx.tenant).filter(pk=job.payload["party_id"]).first()
if party is None:
    raise PermanentJobError("party no longer exists")
```

### R17.5 — A handler calls services, never reimplements them

If `sales.refresh_overdue` computes a status differently from `issue_invoice`, the two will disagree within a month.

### R17.6 — A handler never assumes a tenant context it did not receive

`requires_tenant=False` handlers iterate tenants explicitly and wrap each pass in `TenantContext(tenant)`, catching and logging per-tenant failures so one bad tenant cannot starve the rest.

---

## 26.18 Management commands

### R18.1 — A command is a thin wrapper over services and selectors

The same rule as views: `handle()` parses arguments, builds a `Ctx.system(...)`, calls a service, prints a summary.

### R18.2 — Destructive commands require `--yes` and print a dry-run first

```python
parser.add_argument("--fix", action="store_true", help="Write corrections (default: report only)")
parser.add_argument("--yes", action="store_true", help="Skip the confirmation prompt")
```

`recalc_balances` without `--fix` reports drift and exits `1` when any exists — so it can be a cron health check as well as a repair tool.

### R18.3 — Long-running commands are chunked, resumable and log progress

`.iterator(chunk_size=2000)`, a `--tenant` filter, a `--since` filter, and an INFO line every 10 000 rows with counts. A command that cannot be interrupted and restarted is a command nobody will run on production.

### R18.4 — Commands write audit rows for anything a human would ask about later

`requeue_job`, `recalc_balances --fix`, `seed_demo_tenant` in staging: each writes `platform_audit_log` with `actor_type='system'` and the command line in `metadata`.

---

## 26.19 Internationalisation

### R19.1 — Every user-facing string is wrapped

`gettext_lazy as _` at module level (choices labels, field labels, model `verbose_name`); `gettext as _` inside functions (runtime messages).

**✗ wrong** `raise BusinessRuleViolation("party_archived", "This party is archived.")`
**✓ right** `raise BusinessRuleViolation("party_archived", _("This party is archived."))`

### R19.2 — Codes are never translated

Error codes, status values, permission codenames, job types and audit actions are protocol, not prose. Only `message` and validation `details` values are translated.

### R19.3 — Messages are complete sentences with the data interpolated by named placeholder

**✗ wrong** `_("Limit ") + str(limit) + _(" exceeded")` — untranslatable word order.
**✓ right** `_("Credit limit of ₹{limit} exceeded. Balance after this entry would be ₹{after}.").format(limit=limit, after=after)`

### R19.4 — `en` and `hi` both exist before merge

`django-admin makemessages -l en -l hi` runs in CI; an untranslated new string fails the build (canon §0.11 rule 6). Hindi copy comes from the FRD's §8 copy table, not from a machine translation.

### R19.5 — Currency, dates and numbers are not formatted server-side

The API returns `"2800.00"` and `"2026-09-18"`. Indian digit grouping (`₹1,23,456.50`) is the client's job (canon §0.10). A server that formats money has made the response locale-dependent and uncacheable.

---

## 26.20 Code-review checklist

A reviewer works down this list. Anything unticked blocks the merge.

**Layering**
- [ ] Business logic is in `services/`; reads beyond a trivial filter are in `selectors/`.
- [ ] The view calls exactly one service or selector and contains no `if` about a business condition.
- [ ] No serializer queries the database; no service imports DRF; no selector writes.
- [ ] App imports obey the dependency matrix; any deferred import carries the rule-D5 comment.

**Tenancy and security**
- [ ] Every queryset is tenant-scoped; every related id field is a `TenantPrimaryKeyRelatedField`.
- [ ] Cross-tenant access yields 404 and there is a test for this route.
- [ ] `permission_classes` is explicit and every action has a codename from the registry.
- [ ] No PII, token, OTP or full body in any log line.

**Correctness**
- [ ] Money is `Decimal` throughout; no `float`, no `round()`; rounding is `q2`/`q3`/`q4`.
- [ ] The state change is inside `@transaction.atomic` and writes exactly one audit row.
- [ ] Locks follow the global order and the order is commented.
- [ ] Document/payment/entry POSTs accept `Idempotency-Key`.
- [ ] Ledger and stock rows are only inserted, never updated or deleted.
- [ ] Every canon status/error-code/permission string matches exactly.

**Schema**
- [ ] `db_table` explicit; `uuid7_pk()`; field classes for money/qty/cost; named constraints and indexes.
- [ ] `on_delete` matches Part 21 §21.5; `related_name` present.
- [ ] The migration is backwards-compatible with the previous release; data migration is separate, batched, reversible.

**API contract**
- [ ] The request and response shapes match Part 22 exactly, including string money.
- [ ] Pagination style matches the endpoint's declared style; `meta.totals` is over the filtered set.
- [ ] Errors use canon codes and the standard envelope.

**Tests**
- [ ] Every BR in the FRD has a test; every error branch has a test.
- [ ] Query-count budget asserted at two page sizes.
- [ ] Permission matrix tested for all four roles.
- [ ] `en` and `hi` message keys exist for every new user-facing string.

**Hygiene**
- [ ] Docstrings on services and models; type hints on service/selector signatures.
- [ ] No commented-out code, no `print`, no `TODO` without an issue id.
- [ ] `ruff`, `black`, `isort`, `mypy` (strict modules) and `makemigrations --check` all pass.

---

## 26.21 AI coding agent quick reference

Before declaring **any** backend file complete, the agent asserts every applicable line. This is the last gate.

**For a model file**
1. `db_table` is the Part 21 name, spelled exactly.
2. `id = uuid7_pk()`.
3. Money `MoneyField`, quantity `QuantityField`, cost `UnitCostField`, percent `RateField`. No bare `DecimalField`, no `FloatField`.
4. Every status is a `TextChoices` whose values equal canon §0.7 character for character.
5. Constraints and indexes are named `uq_`/`ck_`/`ix_` and mirror Part 21 §21.3 and §21.4.
6. `on_delete` matches Part 21 §21.5; `related_name` set on every FK.
7. No logic in `save()`; no querying `@property`.
8. Immutable tables inherit `TenantModel` only, and the append-only trigger is in the migration.

**For a service file**
9. `@transaction.atomic` on writers, absent on readers.
10. Signature is `(*, ctx: Ctx, …)`, fully hinted, returning a frozen dataclass when multi-valued.
11. Docstring names the FRD rules enforced, the locks taken and the exceptions raised.
12. Locks follow the global order with a comment; `sorted()` before multi-row locks.
13. No DRF import, no `request`, no network/file I/O/sleep inside the transaction.
14. Exactly one audit row per logical event, with `before`/`after` per Part 21 §21.7.
15. Side effects go through `enqueue()`; `on_commit` only for losable work.
16. Every raise is a `DomainError` subclass with a canon error code.
17. Money arithmetic uses `q2`/`q3`/`q4` and never `float`.

**For a selector file**
18. Read-only; no `.save()`, `.create()`, `.update()`, `.delete()`, `transaction`.
19. Takes `tenant` explicitly and scopes as the first operation.
20. Declares every `select_related`/`prefetch_related` the serializers need.
21. Aggregates in SQL; arithmetic annotations declare `output_field`.

**For a serializer file**
22. Read and write serializers are separate classes.
23. `fields` is an explicit tuple; no `__all__`, no `exclude`.
24. Money/quantity/cost use the string-coercing field classes.
25. No queries in `to_representation` or in any method field.
26. Related ids use `TenantPrimaryKeyRelatedField`.
27. Messages are `gettext_lazy` and match the FRD copy table.

**For a view file**
28. Inherits `TenantScopedViewSet` (or scopes explicitly) — no hand-rolled tenant checks.
29. `permission_classes` explicit; every action mapped to a registered codename.
30. `filterset_class` and `ordering_fields` explicit; no `request.query_params` in `get_queryset`.
31. One service/selector call per method; ≤ ~12 lines; no `transaction`, no business `if`.
32. Responses via `StandardResponse`; state changes are sub-resource `POST` actions.
33. `@idempotent(scope=…)` on document/payment/entry creation.
34. No `except Exception`.

**For every file**
35. Imports ordered and absolute across packages; no module-level side effects.
36. Type hints present where §26.12 requires them; docstrings per §26.12.4.
37. Logging is structured with `extra`, on the `ub.<app>` logger, with no PII.
38. No new dependency; no `print`; no commented-out code.
39. `ruff`, `black`, `isort` clean; `makemigrations --check` clean.
40. Tests exist for: every business rule, every error branch, the permission matrix across all four roles, cross-tenant 404, the query-count budget, and — for a money path — a paisa-exact worked example.

If any line cannot be ticked, the file is not complete. If a line cannot be ticked **because the specification does not say**, stop and raise a CR against Part 20, 21, 22 or this chapter — do not invent the answer.
