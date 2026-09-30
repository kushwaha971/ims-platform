"""The document port (ADR-045, contracts §1.5, FRD 00 PLT-X05).

A gym membership, a hotel stay and a registered tenant's recurring fee are taxable supplies and
need a real tax invoice. They get one from the sales pipeline through this module, so no vertical
or engine imports `sales`, and `sales` never imports them: `sales` registers the ISSUER in its
`ready()`, each module registers an ORIGIN LISTENER for its own origin types, and when a document
with an origin is voided or its settlement moves, sales calls that listener inside its own
transaction (lock order party → document → the origin's rows, BR-5).

── What lives here ──────────────────────────────────────────────────────────
* the shapes: `DocumentLine`, `CreditLine`, `IssueRequest`, `IssuedDocument`, `VoidCheck`;
* the two protocols: `Issuer` (sales) and `OriginListener` (dues, gym, hospitality);
* `issue_document`, `issue_credit_note`, `void_document`, `document_summaries` — the calls a
  module makes; `issue_document` answers 403 `module_disabled` (`details.module = "sales"`) when
  the issuer is missing or sales is off for the tenant (T-PLT-X05-9);
* `origin_for`, `check_void`, `notify_void`, `notify_settlement`, `origin_labels` — the calls
  sales makes back.

── Rule D1 ──────────────────────────────────────────────────────────────────
This module imports `apps.common` and the standard library only
(`test_the_document_seam_imports_no_other_app_anywhere`). It cannot read `effective_modules`
(`platform_app`), so availability is the issuer's own answer (`Issuer.available`).

── Registries (ADR-042) ─────────────────────────────────────────────────────
Keyed and idempotent: registering the same object again is a no-op, a different object under a
used key raises `ImproperlyConfigured`. `_reset_for_tests()` snapshots the start-up state on its
first call and restores it on every later one.
"""

from __future__ import annotations

import datetime as dt
import logging
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, NotRequired, Protocol, TypedDict
from uuid import UUID

from django.core.exceptions import ImproperlyConfigured

from apps.common.exceptions import ModuleDisabled

logger = logging.getLogger(__name__)

#: `sales_document.origin_type` is `varchar(48)`; `origin_module` is `varchar(32)`.
ORIGIN_TYPE_MAX_LENGTH = 48
ORIGIN_MODULE_MAX_LENGTH = 32
#: EC-4 — what an origin reads as when its module no longer registers a listener for it.
MISSING_ORIGIN_LABEL = "Record not found"


class DocumentLine(TypedDict, total=False):
    description: str  # required, ≤ 255
    hsn_sac: str | None
    qty: Decimal  # > 0; nights are "NOS" with the nights in the description (R71)
    unit_code: str  # "NOS" default
    unit_price: Decimal
    tax_inclusive: bool
    tax_code: str | None  # R2: THE tax field, resolved by sales for the document date
    gst_rate: Decimal | None  # convenience: mapped by tax.selectors.codes.code_for_rate
    item_id: UUID | None  # an inventory item when inventory is on; else None
    discount_amount: Decimal  # the line's discount, in rupees


class CreditLine(TypedDict, total=False):  # R51, ADR-057: value credit
    against_line_id: UUID
    taxable_value: Decimal
    description: str


class IssueRequest(TypedDict, total=False):
    origin_type: str  # required
    origin_id: UUID  # required
    party_id: UUID  # required; module documents are never walk-in (BR-2)
    document_date: dt.date  # required
    due_on: dt.date | None
    lines: list[DocumentLine]  # required, ≥ 1
    notes: str
    meta_block: dict  # a printed block, e.g. {"stay": {...}}
    payment: dict | None  # a sales issue-payment payload taken at issue
    apply_payment_ids: list[UUID]  # R61 — exactly these payments, in this order
    apply_open_advances: bool  # the party's open, un-earmarked main advances, oldest first
    apply_credit_note_ids: list[UUID]  # R50 — these open credit notes, first
    credit_check: str  # "skip" (engine charges) | "enforce" (counter sales)
    override: bool  # R62 — owner/admin only, with "enforce"
    place_of_supply_state: str | None  # R60


class IssuedDocument(TypedDict):
    document_id: UUID
    number: str
    kind: str
    status: str
    grand_total: Decimal
    amount_due: Decimal
    ledger_entry_id: UUID | None
    refund_payment: dict | None  # R52: {id, number, amount} when a credit note refunded
    # A5 (Q-M6 in the Track M progress file): the issue's warnings — a crossed credit limit under
    # `credit_check="skip"` is one (BR-3), and the contract's shape had nowhere to say it.
    warnings: NotRequired[list[dict]]
    # BR-6 — True when an issue for this origin returned the document already standing.
    existing: NotRequired[bool]


class VoidCheck(TypedDict):  # R55
    block: str | None  # a reason: 409 document_origin_locked
    confirm: str | None  # a question: 409 document_origin_confirm unless confirm_origin


class Issuer(Protocol):
    def available(self, tenant: Any) -> bool: ...

    def issue(self, *, ctx: Any, request: IssueRequest) -> IssuedDocument: ...

    def issue_credit_note(
        self,
        *,
        ctx: Any,
        against_id: Any,
        origin_type: str,
        origin_id: Any,
        lines: list[CreditLine],
        settlement: str,
        reason: str,
        refund: dict | None = None,
    ) -> IssuedDocument: ...

    def void(self, *, ctx: Any, document_id: Any, reason: str) -> dict: ...

    def summaries(self, *, tenant: Any, ids: set[Any]) -> dict[Any, IssuedDocument]: ...


class OriginListener(Protocol):
    def on_void(
        self, *, ctx: Any, origin_id: Any, document: IssuedDocument, reason: str
    ) -> None: ...

    def on_settlement_changed(
        self, *, ctx: Any, origin_id: Any, document: IssuedDocument
    ) -> None: ...

    def check_void(self, *, tenant: Any, origin_id: Any) -> VoidCheck: ...

    # Optional (Q-M6): `labels(*, tenant, ids) -> {origin_id: label}` for the invoice list's
    # "From Gym · Membership M-0042". A listener without it shows the module's name only.


@dataclass(frozen=True)
class Origin:
    origin_type: str
    module: str
    listener: Any


_ISSUER: list[Any] = []
_ORIGINS: dict[str, Origin] = {}
_SNAPSHOT: dict[str, Any] | None = None


# ── Registration ──────────────────────────────────────────────────────────────


def register_issuer(issuer: Any) -> None:
    """Sales, in `SalesConfig.ready()`. One issuer; the same object again is a no-op."""
    for name in ("available", "issue", "issue_credit_note", "void", "summaries"):
        if not callable(getattr(issuer, name, None)):
            raise ImproperlyConfigured(f"The document issuer has no {name}()")
    if _ISSUER:
        if _ISSUER[0] is issuer:
            return
        raise ImproperlyConfigured("A document issuer is already registered")
    _ISSUER.append(issuer)


def register_origin(origin_type: str, *, module: str, listener: Any) -> None:
    """A module, in its `ready()`, for each origin type it issues documents for."""
    if not origin_type or len(origin_type) > ORIGIN_TYPE_MAX_LENGTH:
        raise ImproperlyConfigured(
            f"Origin type {origin_type!r} must be 1–{ORIGIN_TYPE_MAX_LENGTH} characters"
        )
    if not module or len(module) > ORIGIN_MODULE_MAX_LENGTH:
        raise ImproperlyConfigured(f"Origin {origin_type!r} needs a module code")
    for name in ("on_void", "on_settlement_changed", "check_void"):
        if not callable(getattr(listener, name, None)):
            raise ImproperlyConfigured(f"The {origin_type!r} origin listener has no {name}()")
    standing = _ORIGINS.get(origin_type)
    if standing is not None:
        if standing.listener is listener and standing.module == module:
            return
        raise ImproperlyConfigured(f"Origin type {origin_type!r} is already registered")
    _ORIGINS[origin_type] = Origin(origin_type=origin_type, module=module, listener=listener)


def origin_for(origin_type: str | None) -> Origin | None:
    return _ORIGINS.get(origin_type) if origin_type else None


def registered_origins() -> dict[str, Origin]:
    return dict(_ORIGINS)


def _issuer() -> Any | None:
    return _ISSUER[0] if _ISSUER else None


def _reset_for_tests() -> None:
    global _SNAPSHOT
    if _SNAPSHOT is None:
        _SNAPSHOT = {"issuer": list(_ISSUER), "origins": dict(_ORIGINS)}
    _ISSUER[:] = _SNAPSHOT["issuer"]
    _ORIGINS.clear()
    _ORIGINS.update(_SNAPSHOT["origins"])


# ── What a module calls ───────────────────────────────────────────────────────


def issuer_available(tenant: Any) -> bool:
    """An issuer is registered and it says sales is effective for this tenant."""
    issuer = _issuer()
    return bool(issuer is not None and issuer.available(tenant))


def _require_issuer(tenant: Any) -> Any:
    issuer = _issuer()
    if issuer is None or not issuer.available(tenant):
        raise ModuleDisabled(details={"module": "sales"})
    return issuer


def issue_document(*, ctx: Any, request: IssueRequest) -> IssuedDocument:
    """One draft → issued document for `request`, in the caller's transaction (T-PLT-X05-1)."""
    return _require_issuer(ctx.tenant).issue(ctx=ctx, request=request)


def issue_credit_note(*, ctx: Any, **kwargs: Any) -> IssuedDocument:
    return _require_issuer(ctx.tenant).issue_credit_note(ctx=ctx, **kwargs)


def void_document(*, ctx: Any, document_id: Any, reason: str) -> dict:
    """The module voids its own document: its own `check_void` / `on_void` are not called back."""
    return _require_issuer(ctx.tenant).void(ctx=ctx, document_id=document_id, reason=reason)


def document_summaries(*, tenant: Any, ids: Any) -> dict[Any, IssuedDocument]:
    issuer = _issuer()
    wanted = {i for i in ids or () if i}
    if issuer is None or not wanted:
        return {}
    return issuer.summaries(tenant=tenant, ids=wanted)


# ── What sales calls back ─────────────────────────────────────────────────────


def check_void(*, tenant: Any, origin_type: str, origin_id: Any) -> VoidCheck:
    """The origin's answer, or an empty check when no listener is registered for it (EC-4)."""
    origin = origin_for(origin_type)
    if origin is None:
        logger.warning(
            "document_origin_unregistered",
            extra={"origin_type": origin_type, "origin_id": str(origin_id)},
        )
        return {"block": None, "confirm": None}
    answer = origin.listener.check_void(tenant=tenant, origin_id=origin_id) or {}
    return {"block": answer.get("block") or None, "confirm": answer.get("confirm") or None}


def notify_void(
    *, ctx: Any, origin_type: str, origin_id: Any, document: IssuedDocument, reason: str
) -> None:
    origin = origin_for(origin_type)
    if origin is not None:
        origin.listener.on_void(ctx=ctx, origin_id=origin_id, document=document, reason=reason)


def notify_settlement(
    *, ctx: Any, origin_type: str, origin_id: Any, document: IssuedDocument
) -> None:
    origin = origin_for(origin_type)
    if origin is not None:
        origin.listener.on_settlement_changed(ctx=ctx, origin_id=origin_id, document=document)


def origin_labels(*, tenant: Any, pairs: Any) -> dict[tuple[str, str], str | None]:
    """`{(origin_type, origin_id): label}` for a page of documents — one call per origin type.

    An unregistered type reads `MISSING_ORIGIN_LABEL` (EC-4); a listener without `labels` gives
    None, and the badge shows the module's name alone.
    """
    by_type: dict[str, set[str]] = {}
    for origin_type, origin_id in pairs:
        if origin_type and origin_id:
            by_type.setdefault(origin_type, set()).add(str(origin_id))
    result: dict[tuple[str, str], str | None] = {}
    for origin_type, ids in by_type.items():
        origin = origin_for(origin_type)
        if origin is None:
            result.update({(origin_type, i): MISSING_ORIGIN_LABEL for i in ids})
            continue
        labels = getattr(origin.listener, "labels", None)
        found = labels(tenant=tenant, ids=ids) if callable(labels) else {}
        found = {str(k): v for k, v in (found or {}).items()}
        result.update({(origin_type, i): found.get(i) for i in ids})
    return result
