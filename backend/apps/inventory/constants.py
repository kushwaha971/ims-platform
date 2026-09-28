"""Enumerations and limits owned by the inventory app (Part 26 §26.16 R16.1).

The movement vocabulary is declared in full although INV-01…08 write only three
of its values (`opening`, `adjust_in`, `adjust_out`). `movement_type` is stored on
every row from the first one, and a value added later would leave the rows
written before it with no way to say what they were — the same reasoning
`ledger.constants.EntryType` records.
"""

from __future__ import annotations

from django.db import models
from django.utils.translation import gettext_lazy as _


class ItemType(models.TextChoices):
    GOODS = "goods", _("Goods")
    SERVICE = "service", _("Service")


class ItemStatus(models.TextChoices):
    ACTIVE = "active", _("Active")
    ARCHIVED = "archived", _("Archived")


class StockStatus(models.TextChoices):
    """§17.6.0 "Stock badge tones" — computed, never stored on the item."""

    OK = "ok", _("In stock")
    LOW = "low", _("Low")
    OUT = "out", _("Out of stock")


class MovementType(models.TextChoices):
    """Part 21 §21.3.6 `inventory_stock_movement.movement_type`."""

    OPENING = "opening", _("Opening stock")
    PURCHASE_IN = "purchase_in", _("Purchase")
    SALE_OUT = "sale_out", _("Sale")
    SALE_RETURN_IN = "sale_return_in", _("Sale return")
    PURCHASE_RETURN_OUT = "purchase_return_out", _("Purchase return")
    ADJUST_IN = "adjust_in", _("Adjustment +")
    ADJUST_OUT = "adjust_out", _("Adjustment −")
    TRANSFER_IN = "transfer_in", _("Transfer in")
    TRANSFER_OUT = "transfer_out", _("Transfer out")
    STOCKTAKE_IN = "stocktake_in", _("Stock take +")
    STOCKTAKE_OUT = "stocktake_out", _("Stock take −")
    REVERSAL = "reversal", _("Reversal")


class MovementSource(models.TextChoices):
    """What posted a movement — `source_type` on the row."""

    ITEM = "item", _("Item (opening stock)")
    STOCK_ADJUSTMENT = "stock_adjustment", _("Stock adjustment")
    PURCHASE_DOCUMENT = "purchase_document", _("Purchase document")
    SALES_DOCUMENT = "sales_document", _("Sales document")
    STOCK_TRANSFER = "stock_transfer", _("Stock transfer")


class AdjustmentReason(models.TextChoices):
    """INV-06 FR-2 — the five reasons, and no free-form sixth."""

    DAMAGE = "damage", _("Damage")
    THEFT = "theft", _("Theft")
    COUNT = "count", _("Count difference")
    PERSONAL_USE = "personal_use", _("Personal use")
    OTHER = "other", _("Other")


class AdjustmentStatus(models.TextChoices):
    POSTED = "posted", _("Posted")


class AlertLevel(models.TextChoices):
    """INV-07 — the stored crossing state on `inventory_item_stock`.

    A notification fires on a transition to a WORSE level (ok→low, ok→out,
    low→out), never on a level that merely persists. That is what "one
    notification per crossing, not per scan" means in code (Part 32 §32.9.7).
    """

    OK = "ok", _("Above reorder point")
    LOW = "low", _("At or below reorder point")
    OUT = "out", _("Out of stock")


class AlertTrigger(models.TextChoices):
    MOVEMENT = "movement", _("A stock movement")
    REORDER_EDIT = "reorder_edit", _("A reorder-point edit")
    SCAN = "scan", _("The nightly scan")


#: Severity order of `AlertLevel`, for "did this get worse".
ALERT_SEVERITY: dict[str, int] = {AlertLevel.OK: 0, AlertLevel.LOW: 1, AlertLevel.OUT: 2}

INBOUND_TYPES = frozenset(
    {
        MovementType.OPENING,
        MovementType.PURCHASE_IN,
        MovementType.SALE_RETURN_IN,
        MovementType.ADJUST_IN,
        MovementType.TRANSFER_IN,
        MovementType.STOCKTAKE_IN,
    }
)
OUTBOUND_TYPES = frozenset(
    {
        MovementType.SALE_OUT,
        MovementType.PURCHASE_RETURN_OUT,
        MovementType.ADJUST_OUT,
        MovementType.TRANSFER_OUT,
        MovementType.STOCKTAKE_OUT,
    }
)

NEGATIVE_STOCK_SETTING_KEY = "inventory.allow_negative_stock"
DEFAULT_LOCATION_CODE = "MAIN"
DEFAULT_TAX_CODE = "GST0"
DEFAULT_UNIT_CODE = "NOS"

NAME_MAX_LENGTH = 160
SKU_MAX_LENGTH = 48
BARCODE_MIN_LENGTH = 4
BARCODE_MAX_LENGTH = 48
DESCRIPTION_MAX_LENGTH = 2000
CATEGORY_NAME_MAX_LENGTH = 60
UNIT_CODE_MAX_LENGTH = 8
UNIT_NAME_MAX_LENGTH = 40
ADJUSTMENT_NOTE_MAX_LENGTH = 255
ADJUSTMENT_NOTE_MIN_LENGTH_OTHER = 3
ADJUSTMENT_MAX_LINES = 100
MAX_AMOUNT = "999999999999.99"
MAX_QTY = "9999999999.999"
MAX_UNIT_COST = "9999999999.9999"
MIN_STOCK_DATE = "2000-01-01"

#: BR-2 — the auto-SKU prefix is at most twelve characters.
SKU_PREFIX_MAX = 12
SKU_FALLBACK_PREFIX = "ITEM"
SKU_RETRIES = 3

#: INV-02 FR-1 — the sort whitelist, and the list's default.
ITEM_ORDERINGS = (
    "name",
    "-name",
    "-updated_at",
    "on_hand",
    "-on_hand",
    "selling_price",
    "-selling_price",
)
SUMMARY_ORDERINGS = ("name", "-name", "on_hand", "-on_hand", "value", "-value")
MOVEMENTS_PAGE_DEFAULT = 50
MOVEMENTS_RECENT = 10
HSN_RESULTS_MAX = 20
