"""The business-type presets (PLT-03 FR-7 — normative table, reproduced exactly).

`PLT-03` FR-8 is the rule that gives this table its shape: **presets never
hard-wire behaviour**. Every value here is written once, at onboarding, into a
row a merchant can then edit in Settings; changing `business_type` afterwards
changes nothing but the label on the profile. Canon says the same thing in
stronger words — business type never gates behaviour — so nothing anywhere else
in this codebase may branch on `Tenant.business_type`. A test asserts that.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from apps.platform_app.constants import BusinessType


@dataclass(frozen=True, slots=True)
class Preset:
    """One row of the FR-7 table."""

    inventory_enabled: bool
    party_labels: tuple[str, str]  # (customer, supplier)
    favourite_units: tuple[str, ...]
    extra_expense_categories: tuple[str, ...]
    default_due_days: int
    items_track_stock_default: bool = True
    default_kinds: dict[str, str] = field(
        default_factory=lambda: {
            "unregistered": "estimate",
            "composition": "bill_of_supply",
            "regular": "invoice",
        }
    )


PRESETS: dict[str, Preset] = {
    BusinessType.RETAIL.value: Preset(
        inventory_enabled=True,
        party_labels=("Customer", "Supplier"),
        favourite_units=("NOS", "KGS", "GMS", "LTR", "PAC"),
        extra_expense_categories=("Packaging", "Shop maintenance"),
        default_due_days=7,
    ),
    BusinessType.WHOLESALE.value: Preset(
        inventory_enabled=True,
        party_labels=("Party", "Supplier"),
        favourite_units=("NOS", "BOX", "BAG", "KGS", "QTL", "DOZ"),
        extra_expense_categories=("Loading & unloading", "Godown rent"),
        default_due_days=15,
    ),
    BusinessType.DISTRIBUTION.value: Preset(
        inventory_enabled=True,
        party_labels=("Retailer", "Company"),
        favourite_units=("BOX", "PAC", "NOS", "BAG", "DOZ"),
        extra_expense_categories=("Fuel", "Vehicle maintenance", "Scheme discounts"),
        default_due_days=15,
    ),
    BusinessType.SERVICES.value: Preset(
        inventory_enabled=False,
        party_labels=("Client", "Vendor"),
        favourite_units=("NOS",),
        extra_expense_categories=("Tools & equipment", "Travel"),
        default_due_days=30,
    ),
    BusinessType.TRADER.value: Preset(
        inventory_enabled=True,
        party_labels=("Party", "Supplier"),
        favourite_units=("KGS", "QTL", "TON", "BAG", "NOS"),
        extra_expense_categories=("Commission", "Mandi charges"),
        default_due_days=15,
    ),
    BusinessType.MANUFACTURER.value: Preset(
        inventory_enabled=True,
        party_labels=("Customer", "Supplier"),
        favourite_units=("KGS", "NOS", "MTR", "SET", "LTR"),
        extra_expense_categories=("Raw material", "Job work", "Machine maintenance"),
        default_due_days=15,
    ),
    BusinessType.PROFESSIONAL.value: Preset(
        inventory_enabled=False,
        party_labels=("Client", "Vendor"),
        favourite_units=("NOS",),
        extra_expense_categories=(
            "Professional fees",
            "Software & subscriptions",
            "Travel",
        ),
        default_due_days=30,
    ),
    BusinessType.FOOD.value: Preset(
        inventory_enabled=True,
        party_labels=("Customer", "Supplier"),
        favourite_units=("NOS", "KGS", "LTR", "PAC", "BTL"),
        extra_expense_categories=("Gas & fuel", "Raw material", "Delivery charges"),
        default_due_days=7,
        items_track_stock_default=False,  # FR-7: food items default `track_stock=false`
    ),
    BusinessType.OTHER.value: Preset(
        inventory_enabled=True,
        party_labels=("Party", "Supplier"),
        favourite_units=("NOS", "KGS", "LTR"),
        extra_expense_categories=(),
        default_due_days=30,
    ),
}

# FR-7: the modules a new tenant asks for, before the partner and plan
# intersection. `inventory` is added only when the preset enables it.
BASE_MODULES: tuple[str, ...] = (
    "platform",
    "ledger",
    "parties",
    "sales",
    "purchases",
    "payments",
    "expenses",
    "reports",
    "notifications",
    "import_export",
    "team",
)

# FR-7: numbering prefixes, `padding=4`, `reset_fy=true`, for all twelve kinds
# of `platform_document_sequence` (Part 21 §21.3.1).
NUMBERING_PREFIXES: tuple[tuple[str, str], ...] = (
    ("estimate", "EST"),
    ("invoice", "INV"),
    ("bill_of_supply", "BOS"),
    ("credit_note", "CN"),
    ("purchase_bill", "PB"),
    ("debit_note", "DN"),
    ("payment_in", "RCT"),
    ("payment_out", "PAYOUT"),
    ("purchase_order", "PO"),
    ("delivery_challan", "DC"),
    ("stock_adjustment", "ADJ"),
    ("stock_transfer", "TRF"),
)

NUMBER_PADDING = 4

# FR-6: the default reminder text, in both locales.
REMINDER_TEMPLATES: dict[str, str] = {
    "en": (
        "Namaste {party_name}, a balance of {amount} is pending with {business_name}. "
        "Kindly pay at your convenience. Thank you."
    ),
    "hi": (
        "नमस्ते {party_name}, {business_name} का {amount} बकाया है। "
        "कृपया सुविधानुसार भुगतान करें। धन्यवाद।"
    ),
}


def preset_for(business_type: str) -> Preset:
    """Never raises: an unknown type falls back to `other`, which enables everything.

    An onboarding wizard that 500s because somebody added a business type to the
    enum and not to this table is a worse outcome than one that seeds the
    generic defaults, all of which are editable (FR-8).
    """
    return PRESETS.get(business_type, PRESETS[BusinessType.OTHER.value])
