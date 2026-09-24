"""Inventory tables (Part 21 §21.3.6).

`Unit` and `Location` are from Sprints 0–1; the item, stock cache, movement log,
adjustment header and low-stock alert tables land with INV-01…INV-08.

── The one ordering rule (CR-2026-09-24-INV-A) ─────────────────────────────
The movement log of one `(item, location)` is ordered by `sequence_no`, the
gap-free ARRIVAL counter allocated from `inventory_item_stock.last_sequence_no`
under the row lock every writer already holds. The incremental cache, every
row's `avg_cost_after` / `on_hand_after`, and `manage.py recalc_stock`'s replay
all walk that one order, so the cache equals the replay by construction —
including for a backdated movement, which is simply the next arrival. That is
why this table needs no "stale" state, no recompute job and no permitted UPDATE:
the trigger in migration 0004 refuses every UPDATE and DELETE outright.
"""

from __future__ import annotations

from django.contrib.postgres.indexes import GinIndex, OpClass
from django.db import models
from django.db.models.functions import Lower, Upper

from apps.common.db.fields import MoneyField, QuantityField, UnitCostField, uuid7_pk
from apps.common.managers import AllObjectsManager, SoftDeleteManager
from apps.common.models import ImmutableModel, SoftDeleteModel, TenantModel, TimeStampedModel
from apps.inventory.constants import (
    ADJUSTMENT_NOTE_MAX_LENGTH,
    BARCODE_MAX_LENGTH,
    CATEGORY_NAME_MAX_LENGTH,
    DEFAULT_TAX_CODE,
    NAME_MAX_LENGTH,
    SKU_MAX_LENGTH,
    AdjustmentReason,
    AdjustmentStatus,
    AlertLevel,
    AlertTrigger,
    ItemStatus,
    ItemType,
    MovementSource,
    MovementType,
)


class Unit(TimeStampedModel):
    """A unit of measure. System units (UQC codes) carry `tenant = NULL`."""

    id = uuid7_pk()
    tenant = models.ForeignKey(
        "platform.Tenant", on_delete=models.RESTRICT, null=True, blank=True, related_name="units"
    )
    created_by = models.ForeignKey(
        "platform.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    code = models.CharField(max_length=8)
    name = models.CharField(max_length=60)
    allow_decimal = models.BooleanField(default=True)
    is_system = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    objects = SoftDeleteManager()
    all_objects = AllObjectsManager()

    class Meta:
        db_table = "inventory_unit"
        verbose_name = "unit"
        verbose_name_plural = "units"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "code"],
                condition=models.Q(deleted_at__isnull=True),
                name="uq_unit_tenant_code",
            ),
            models.UniqueConstraint(
                fields=["code"],
                condition=models.Q(tenant__isnull=True) & models.Q(deleted_at__isnull=True),
                name="uq_unit_system_code",
            ),
        ]

    def __str__(self) -> str:
        return self.code


class Location(TenantModel):
    """A stock location (Part 21 §21.3.6).

    MVP auto-creates `MAIN` at onboarding (`PLT-03` FR-6) and hides the concept
    in the UI until Phase 2 (`INV-11`). The row exists from Sprint 1 so that
    `INV-11` is a UI and service change rather than a migration of live stock
    (Part 32 §32.9).
    """

    id = uuid7_pk()
    name = models.CharField(max_length=80)
    code = models.CharField(max_length=24)
    address = models.JSONField(default=dict, blank=True)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "inventory_location"
        verbose_name = "location"
        verbose_name_plural = "locations"
        constraints = [
            models.UniqueConstraint(fields=["tenant", "code"], name="uq_location_tenant_code"),
        ]

    def __str__(self) -> str:
        return self.code


class Category(TenantModel, SoftDeleteModel):
    """INV-04 — one level of nesting (BR-2), unique among siblings (§10).

    The sibling rule is case-insensitive in the index itself (`Lower(name)`), so
    "Snacks" and "snacks" cannot both exist even through a writer that skips the
    service; the service turns the same match into EC-2's "return the existing
    row" rather than an error. `nulls_distinct=False` makes two top-level rows
    with the same name collide — without it Postgres treats every NULL parent as
    different and the constraint would guard only sub-categories.
    """

    name = models.CharField(max_length=CATEGORY_NAME_MAX_LENGTH)
    parent = models.ForeignKey(
        "self", on_delete=models.RESTRICT, null=True, blank=True, related_name="children"
    )
    sort_order = models.IntegerField(default=0)

    objects = SoftDeleteManager()
    all_objects = AllObjectsManager()

    class Meta:
        db_table = "inventory_category"
        verbose_name = "category"
        verbose_name_plural = "categories"
        constraints = [
            models.UniqueConstraint(
                "tenant",
                "parent",
                Lower("name"),
                condition=models.Q(deleted_at__isnull=True),
                nulls_distinct=False,
                name="uq_category_sibling_name",
            ),
        ]

    def __str__(self) -> str:
        return self.name


class Item(TenantModel, SoftDeleteModel):
    """INV-01 — one master record per thing a business sells or buys.

    Rates are never stored here (BR-4): `tax_code` is resolved against
    `tax_rate` by `(code, document date)`, which is what keeps the 2025-09-21
    slab boundary right for a backdated document.

    `version` is the optimistic lock of Alternate C: every PATCH names the
    version it read, and a mismatch is 409 `stale_version`.
    """

    name = models.CharField(max_length=NAME_MAX_LENGTH)
    item_type = models.CharField(max_length=8, choices=ItemType.choices, default=ItemType.GOODS)
    sku = models.CharField(max_length=SKU_MAX_LENGTH)
    barcode = models.CharField(max_length=BARCODE_MAX_LENGTH, null=True, blank=True)
    category = models.ForeignKey(
        Category, on_delete=models.RESTRICT, null=True, blank=True, related_name="items"
    )
    unit = models.ForeignKey(Unit, on_delete=models.RESTRICT, related_name="items")
    hsn_sac = models.CharField(max_length=8, null=True, blank=True)
    tax_code = models.CharField(max_length=16, default=DEFAULT_TAX_CODE)
    tax_inclusive_selling = models.BooleanField(default=False)
    purchase_price = MoneyField(default=0)
    selling_price = MoneyField(default=0)
    mrp = MoneyField(null=True, blank=True)
    track_stock = models.BooleanField(default=True)
    reorder_point = QuantityField(null=True, blank=True)
    #: FR-10's image. No FK: `files_attachment` belongs to the files track and
    #: does not exist on this branch. The column is here so the upload is a
    #: service change rather than a migration of live items.
    image_attachment_id = models.UUIDField(null=True, blank=True)
    description = models.TextField(blank=True, default="")
    status = models.CharField(max_length=16, choices=ItemStatus.choices, default=ItemStatus.ACTIVE)
    version = models.PositiveIntegerField(default=1)

    objects = SoftDeleteManager()
    all_objects = AllObjectsManager()

    class Meta:
        db_table = "inventory_item"
        verbose_name = "item"
        verbose_name_plural = "items"
        constraints = [
            models.UniqueConstraint(
                fields=["tenant", "sku"],
                condition=models.Q(deleted_at__isnull=True),
                name="uq_item_tenant_sku",
            ),
            models.UniqueConstraint(
                fields=["tenant", "barcode"],
                condition=models.Q(deleted_at__isnull=True, barcode__isnull=False),
                name="uq_item_tenant_barcode",
            ),
            # BR-3 — a service never tracks stock. The service refuses it with
            # a field error; this is what makes the refusal hold for a writer
            # that does not go through the service (the CSV importer, a shell).
            models.CheckConstraint(
                condition=models.Q(item_type=ItemType.GOODS) | models.Q(track_stock=False),
                name="ck_item_service_untracked",
            ),
            models.CheckConstraint(
                condition=models.Q(selling_price__gte=0) & models.Q(purchase_price__gte=0),
                name="ck_item_prices_non_negative",
            ),
        ]
        indexes = [
            models.Index(fields=["tenant", "status", "name"], name="ix_item_tenant_status_name"),
            # `?q=` is `icontains`, which Django compiles to `UPPER(name) LIKE
            # UPPER(%s)` — an index on the bare column cannot serve it
            # (parties migration 0002 measured exactly this).
            GinIndex(OpClass(Upper("name"), name="gin_trgm_ops"), name="ix_item_name_upper_trgm"),
            models.Index(fields=["tenant", "category"], name="ix_item_tenant_category"),
            models.Index(fields=["tenant", "barcode"], name="ix_item_tenant_barcode"),
        ]

    def __str__(self) -> str:
        return f"{self.sku} {self.name}"


class ItemStock(TenantModel):
    """The cache: on-hand and weighted-average cost per `(item, location)`.

    Equal, by construction, to replaying the item's movements in `sequence_no`
    order (see the module docstring); `manage.py recalc_stock` proves it.

    `alert_level` is INV-07's stored crossing state — the level the item was
    last evaluated at. A notification fires only when a write moves it to a
    worse level, so a scan that finds the same low item every night sends
    nothing after the first time.
    """

    item = models.ForeignKey(Item, on_delete=models.RESTRICT, related_name="stock_rows")
    location = models.ForeignKey(Location, on_delete=models.RESTRICT, related_name="+")
    on_hand = QuantityField(default=0)
    avg_cost = UnitCostField(default=0)
    last_movement_at = models.DateTimeField(null=True, blank=True)
    #: High-water mark that allocates `StockMovement.sequence_no`.
    last_sequence_no = models.IntegerField(default=0)
    #: Latest `movement_date` seen — a later arrival dated before it is backdated.
    max_movement_date = models.DateField(null=True, blank=True)
    alert_level = models.CharField(max_length=8, choices=AlertLevel.choices, default=AlertLevel.OK)
    alert_level_changed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "inventory_item_stock"
        verbose_name = "item stock"
        verbose_name_plural = "item stock"
        constraints = [
            models.UniqueConstraint(
                fields=["item", "location"], name="uq_item_stock_item_location"
            ),
        ]

    def __str__(self) -> str:  # pragma: no cover - admin convenience
        return f"{self.item_id}@{self.location_id}: {self.on_hand}"


class StockMovement(TenantModel, ImmutableModel):
    """One signed quantity change. Append-only, enforced by a trigger (0004).

    `avg_cost_after` / `on_hand_after` are NOT NULL: every row's running pair is
    written once, at arrival, and never revised, because arrival order IS the
    canonical order (CR-2026-09-24-INV-A).
    """

    MUTABLE_FIELDS: tuple[str, ...] = ()

    item = models.ForeignKey(Item, on_delete=models.RESTRICT, related_name="movements")
    location = models.ForeignKey(Location, on_delete=models.RESTRICT, related_name="+")
    sequence_no = models.IntegerField()
    movement_type = models.CharField(max_length=24, choices=MovementType.choices)
    qty = QuantityField()
    unit_cost = UnitCostField(null=True, blank=True)
    avg_cost_after = UnitCostField()
    on_hand_after = QuantityField()
    reason = models.CharField(max_length=32, null=True, blank=True)
    source_type = models.CharField(max_length=32, choices=MovementSource.choices)
    source_id = models.UUIDField(null=True, blank=True)
    reverses = models.ForeignKey(
        "self", on_delete=models.RESTRICT, null=True, blank=True, related_name="+"
    )
    movement_date = models.DateField()

    class Meta:
        db_table = "inventory_stock_movement"
        verbose_name = "stock movement"
        verbose_name_plural = "stock movements"
        constraints = [
            models.CheckConstraint(condition=~models.Q(qty=0), name="ck_movement_qty_nonzero"),
            models.UniqueConstraint(
                fields=["item", "location", "sequence_no"], name="uq_movement_item_location_seq"
            ),
            # INV-05 FR-3 — at most one opening per item × location, for every
            # writer including the importer.
            models.UniqueConstraint(
                fields=["item", "location"],
                condition=models.Q(movement_type=MovementType.OPENING),
                name="uq_movement_one_opening",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(movement_type=MovementType.REVERSAL, reverses__isnull=False)
                    | ~models.Q(movement_type=MovementType.REVERSAL)
                ),
                name="ck_movement_reversal_has_source",
            ),
        ]
        indexes = [
            models.Index(
                fields=["tenant", "item", "location", "movement_date"],
                name="ix_movement_item_date",
            ),
            models.Index(fields=["tenant", "source_type", "source_id"], name="ix_movement_source"),
            models.Index(fields=["tenant", "movement_date"], name="ix_movement_tenant_date"),
        ]

    def __str__(self) -> str:  # pragma: no cover - admin convenience
        return f"{self.movement_type} {self.qty} #{self.sequence_no}"


class StockAdjustment(TenantModel):
    """INV-06 — the header; its lines are the movements with this `source_id`."""

    number = models.CharField(max_length=32)
    adjustment_date = models.DateField()
    location = models.ForeignKey(Location, on_delete=models.RESTRICT, related_name="+")
    reason = models.CharField(max_length=32, choices=AdjustmentReason.choices)
    note = models.CharField(max_length=ADJUSTMENT_NOTE_MAX_LENGTH, blank=True, default="")
    status = models.CharField(
        max_length=16, choices=AdjustmentStatus.choices, default=AdjustmentStatus.POSTED
    )

    class Meta:
        db_table = "inventory_stock_adjustment"
        verbose_name = "stock adjustment"
        verbose_name_plural = "stock adjustments"
        constraints = [
            models.UniqueConstraint(fields=["tenant", "number"], name="uq_adjustment_number"),
        ]

    def __str__(self) -> str:
        return self.number


class LowStockAlert(TenantModel):
    """INV-07 — one row per CROSSING, written in the transaction that crossed.

    The durable record of "the item went low", independent of whether a
    notification inbox exists yet. `notified_at` is set by the
    `inventory.low_stock_notify` job once the registered sinks have taken it
    (`services/low_stock.register_low_stock_sink`); the notifications app wires
    its inbox in as a sink, so inventory never imports notifications.
    """

    item = models.ForeignKey(Item, on_delete=models.RESTRICT, related_name="+")
    location = models.ForeignKey(Location, on_delete=models.RESTRICT, related_name="+")
    level = models.CharField(max_length=8, choices=AlertLevel.choices)
    on_hand = QuantityField()
    reorder_point = QuantityField(null=True, blank=True)
    trigger = models.CharField(max_length=16, choices=AlertTrigger.choices)
    notified_at = models.DateTimeField(null=True, blank=True)
    sinks_delivered = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "inventory_low_stock_alert"
        verbose_name = "low-stock alert"
        verbose_name_plural = "low-stock alerts"
        indexes = [
            models.Index(fields=["tenant", "item", "-created_at"], name="ix_low_stock_alert_item"),
        ]

    def __str__(self) -> str:  # pragma: no cover
        return f"{self.level} {self.item_id}"
