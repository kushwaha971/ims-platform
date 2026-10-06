"""Shop gap §1.6 — price lists: a named rate card for a group of parties.

A list's rate for an item is, in order: the rate pinned for that item on the
list, else the item's selling price moved by the list's percentage, rounded to
the paisa. The rate is quoted on the same GST basis as the item's selling price
(`tax_inclusive_selling`), because that is what the percentage moved.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.db.models.functions import Lower
from django.utils import timezone

from apps.common.audit import AuditAction, write_audit
from apps.common.context import Ctx
from apps.common.exceptions import NotFound, ValidationFailed
from apps.inventory.models import Item, PriceList, PriceListParty, PriceListRate
from apps.inventory.services.parsing import Errors, clean_text

NAME_MAX = 60
CENT = Decimal("0.01")


def _uuid_or_none(model: Any, tenant: Any, pk: Any) -> Any:
    try:
        return model.objects.filter(tenant=tenant, pk=pk).first() if pk else None
    except (ValueError, TypeError, DjangoValidationError):
        return None


def _decimal(raw: Any) -> Decimal | None:
    if raw is None or raw == "":
        return None
    try:
        value = Decimal(str(raw))
    except (InvalidOperation, ValueError):
        return None
    return value if value.is_finite() else None


def apply_percent(price: Decimal, percent: Decimal) -> Decimal:
    return (price * (Decimal(100) + percent) / Decimal(100)).quantize(CENT, ROUND_HALF_UP)


def list_dict(price_list: PriceList, *, rates: int = 0, parties: int = 0) -> dict:
    return {
        "id": str(price_list.id),
        "name": price_list.name,
        "adjust_percent": str(price_list.adjust_percent),
        "rate_count": rates,
        "party_count": parties,
    }


def price_lists(*, tenant: Any) -> list[dict]:
    rows = (
        PriceList.objects.filter(tenant=tenant)
        .annotate(
            n_rates=Count("rates", distinct=True),
            n_parties=Count(
                "parties", filter=Q(parties__party__deleted_at__isnull=True), distinct=True
            ),
        )
        .order_by(Lower("name"))
    )
    return [list_dict(p, rates=p.n_rates, parties=p.n_parties) for p in rows]


def _clean(body: dict, *, partial: bool) -> tuple[str | None, Decimal | None]:
    errors = Errors()
    name: str | None = None
    percent: Decimal | None = None
    if not partial or "name" in body:
        name = clean_text(body.get("name"))
        if not name:
            errors.add("name", "Enter a name, like Wholesale.", "required")
        elif len(name) > NAME_MAX:
            errors.add("name", f"Keep it under {NAME_MAX} characters.", "max_length")
    if not partial or "adjust_percent" in body:
        raw = body.get("adjust_percent")
        percent = Decimal(0) if raw in (None, "") else _decimal(raw)
        if percent is None:
            errors.add("adjust_percent", "Enter a percentage, like -5.", "invalid")
        elif not Decimal(-100) <= percent <= Decimal(1000):
            errors.add("adjust_percent", "Keep it between -100% and 1000%.", "out_of_range")
        else:
            percent = percent.quantize(CENT, ROUND_HALF_UP)
    if errors:
        raise ValidationFailed(errors.payload())
    return name, percent


def _name_taken(tenant: Any, name: str, exclude: Any = None) -> bool:
    rows = PriceList.objects.annotate(lname=Lower("name")).filter(tenant=tenant, lname=name.lower())
    if exclude is not None:
        rows = rows.exclude(pk=exclude)
    return rows.exists()


def _fail(field: str, message: str, code: str) -> ValidationFailed:
    errors = Errors()
    errors.add(field, message, code)
    return ValidationFailed(errors.payload())


def _duplicate() -> ValidationFailed:
    return _fail("name", "A price list with this name exists.", "duplicate")


@transaction.atomic
def create_price_list(*, ctx: Ctx, body: dict) -> PriceList:
    name, percent = _clean(body, partial=False)
    assert name is not None and percent is not None
    if _name_taken(ctx.tenant, name):
        raise _duplicate()
    try:
        with transaction.atomic():
            price_list = PriceList.objects.create(
                tenant=ctx.tenant,
                created_by=ctx.actor if ctx.actor_type == "user" else None,
                name=name,
                adjust_percent=percent,
            )
    except IntegrityError:
        raise _duplicate() from None
    write_audit(
        ctx=ctx,
        action=AuditAction.PRICE_LIST_CREATED,
        entity_type="inventory_price_list",
        entity_id=price_list.id,
        after={"name": name, "adjust_percent": str(percent)},
    )
    return price_list


def _get(ctx: Ctx, list_id: Any) -> PriceList:
    price_list = _uuid_or_none(PriceList, ctx.tenant, list_id)
    if price_list is None:
        raise NotFound("No such price list.")
    return price_list


@transaction.atomic
def update_price_list(*, ctx: Ctx, list_id: Any, body: dict) -> PriceList:
    price_list = _get(ctx, list_id)
    name, percent = _clean(body, partial=True)
    before = {"name": price_list.name, "adjust_percent": str(price_list.adjust_percent)}
    if name is not None:
        if _name_taken(ctx.tenant, name, exclude=price_list.pk):
            raise _duplicate()
        price_list.name = name
    if percent is not None:
        price_list.adjust_percent = percent
    price_list.save(update_fields=["name", "adjust_percent", "updated_at"])
    write_audit(
        ctx=ctx,
        action=AuditAction.PRICE_LIST_UPDATED,
        entity_type="inventory_price_list",
        entity_id=price_list.id,
        before=before,
        after={"name": price_list.name, "adjust_percent": str(price_list.adjust_percent)},
    )
    return price_list


@transaction.atomic
def delete_price_list(*, ctx: Ctx, list_id: Any) -> None:
    """Soft-deletes the list and takes its parties off it; their bills fall back
    to each item's selling price. Pinned rates stay with the deleted row."""
    price_list = _get(ctx, list_id)
    moved = PriceListParty.objects.filter(price_list=price_list).delete()[0]
    price_list.deleted_at = timezone.now()
    price_list.save(update_fields=["deleted_at", "updated_at"])
    write_audit(
        ctx=ctx,
        action=AuditAction.PRICE_LIST_DELETED,
        entity_type="inventory_price_list",
        entity_id=price_list.id,
        before={"name": price_list.name},
        metadata={"parties_unassigned": moved},
    )


def list_rates(*, tenant: Any, list_id: Any) -> dict:
    price_list = _uuid_or_none(PriceList, tenant, list_id)
    if price_list is None:
        raise NotFound("No such price list.")
    rows = list(
        PriceListRate.objects.filter(price_list=price_list, item__deleted_at__isnull=True)
        .select_related("item", "item__unit")
        .order_by(Lower("item__name"))
    )
    parties = PriceListParty.objects.filter(
        price_list=price_list, party__deleted_at__isnull=True
    ).count()
    return {
        **list_dict(price_list, rates=len(rows), parties=parties),
        "rates": [
            {
                "item": {
                    "id": str(r.item_id),
                    "name": r.item.name,
                    "sku": r.item.sku,
                    "unit_code": r.item.unit.code,
                },
                "selling_price": str(r.item.selling_price),
                "from_percent": str(apply_percent(r.item.selling_price, price_list.adjust_percent)),
                "rate": str(r.rate),
            }
            for r in rows
        ],
    }


@transaction.atomic
def set_rate(*, ctx: Ctx, list_id: Any, body: dict) -> dict | None:
    """Pin (or with `rate: null`, unpin) one item's rate on a list."""
    price_list = _get(ctx, list_id)
    item = _uuid_or_none(Item, ctx.tenant, body.get("item_id"))
    if item is None:
        raise _fail("item_id", "Choose an item.", "required")
    raw = body.get("rate")
    if raw is None or raw == "":
        removed = PriceListRate.objects.filter(price_list=price_list, item=item).delete()[0]
        if removed:
            write_audit(
                ctx=ctx,
                action=AuditAction.PRICE_LIST_RATE_SET,
                entity_type="inventory_price_list",
                entity_id=price_list.id,
                metadata={"item_id": str(item.id), "rate": None},
            )
        return None
    rate = _decimal(raw)
    if rate is None or rate < 0:
        raise _fail("rate", "Enter a rate of 0 or more.", "invalid")
    rate = rate.quantize(CENT, ROUND_HALF_UP)
    PriceListRate.objects.update_or_create(
        price_list=price_list,
        item=item,
        defaults={"rate": rate, "tenant": ctx.tenant},
    )
    write_audit(
        ctx=ctx,
        action=AuditAction.PRICE_LIST_RATE_SET,
        entity_type="inventory_price_list",
        entity_id=price_list.id,
        metadata={"item_id": str(item.id), "rate": str(rate)},
    )
    return {"item_id": str(item.id), "rate": str(rate)}


@transaction.atomic
def assign_party(*, ctx: Ctx, party_id: Any, list_id: Any) -> dict | None:
    """Put a party on a list, or with `list_id = null` take it off."""
    from apps.parties.models import Party

    party = _uuid_or_none(Party, ctx.tenant, party_id)
    if party is None:
        raise NotFound("No such party.")
    if not list_id:
        PriceListParty.objects.filter(party=party).delete()
        price_list = None
    else:
        price_list = _get(ctx, list_id)
        PriceListParty.objects.update_or_create(
            party=party, defaults={"price_list": price_list, "tenant": ctx.tenant}
        )
    write_audit(
        ctx=ctx,
        action=AuditAction.PRICE_LIST_PARTY_SET,
        entity_type="parties_party",
        entity_id=party.id,
        after={"price_list_id": str(price_list.id) if price_list else None},
    )
    return {"id": str(price_list.id), "name": price_list.name} if price_list else None


def party_price_list(*, tenant: Any, party_id: Any) -> PriceList | None:
    link = (
        PriceListParty.objects.filter(
            tenant=tenant, party_id=party_id, price_list__deleted_at__isnull=True
        )
        .select_related("price_list")
        .first()
    )
    return link.price_list if link else None


def rates_for_party(*, tenant: Any, party_id: Any, item_ids: list[Any]) -> dict:
    """`GET /price-lists/for-party` — the party's list and its rate for each item asked."""
    price_list = party_price_list(tenant=tenant, party_id=party_id)
    if price_list is None:
        return {"price_list": None, "rates": {}}
    items = Item.objects.filter(tenant=tenant, pk__in=item_ids)
    pinned = dict(
        PriceListRate.objects.filter(price_list=price_list, item_id__in=item_ids).values_list(
            "item_id", "rate"
        )
    )
    rates = {
        str(item.id): {
            "rate": str(
                pinned.get(item.id, apply_percent(item.selling_price, price_list.adjust_percent))
            ),
            "pinned": item.id in pinned,
            "tax_inclusive": item.tax_inclusive_selling,
        }
        for item in items
    }
    return {"price_list": {"id": str(price_list.id), "name": price_list.name}, "rates": rates}
