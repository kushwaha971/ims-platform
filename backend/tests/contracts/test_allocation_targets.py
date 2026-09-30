"""T-PLT-X03-1 — the contract every registered allocation target keeps (10-architecture §11).

Parametrised over EVERY target registered at start-up, so the contract is not something each
owner remembers to test: a new target (dues, library, lending, deposits) that lands without a
document factory below fails `test_every_registered_target_is_under_contract` instead of quietly
skipping the suite. Each factory makes one OPEN document of that target, for a party, dated.

The clauses: `document_type` fits `payments_allocation.document_type` (32); `bucket` and `auto` are
declared; `lock` takes rows in `(document_date, number, id)` order, the one global order record
and void share; `apply` then `unapply` restores the row exactly (every money and status column —
`version` and `updated_at` are concurrency metadata and are allowed to move); status is re-derived,
never toggled; `outstanding` is never negative; `apply` and `unapply` accept `payment_id` and `ctx`.
"""

from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal
from typing import Any, Callable

import pytest
from django.forms.models import model_to_dict

from apps.common.context import Ctx
from apps.common.dates import tenant_today
from apps.payments.services.targets import registered_targets
from apps.sales.tests.conftest import (  # noqa: F401  (fixtures)
    draft,
    issue,
    line,
    make_item,
    make_party,
    owner,
    reference,
    shop,
)

pytestmark = pytest.mark.django_db

#: Columns a move is allowed to change and not restore: optimistic-concurrency metadata.
_METADATA = {"version", "updated_at"}


def _sales_document(ctx: dict, party: Any, day: dt.date) -> Any:
    from apps.sales.models import SalesDocument

    item = ctx["make_item"](name=f"Goods {uuid.uuid4().hex[:6]}", price="500.00", tax_code="GST0")
    created = draft(
        ctx["owner"], party_id=str(party.id), lines=[line(item)], document_date=day.isoformat()
    ).json()["data"]
    issued = issue(ctx["owner"], created["id"])
    assert issued.status_code == 200, issued.json()
    return SalesDocument.objects.get(pk=created["id"])


def _purchase_document(ctx: dict, party: Any, day: dt.date) -> Any:
    from apps.parties.models import Party
    from apps.purchases.models import PurchaseDocument
    from apps.purchases.tests.conftest import line as bill_line
    from apps.purchases.tests.conftest import recorded_bill

    Party.objects.filter(pk=party.pk).update(is_supplier=True)

    item = ctx["make_item"](name=f"Stock {uuid.uuid4().hex[:6]}", price="500.00", tax_code="GST0")
    data = recorded_bill(
        ctx["owner"],
        party_id=str(party.id),
        lines=[bill_line(item, "1", "500.00")],
        document_date=day.isoformat(),
        supplier_invoice_number=f"S-{uuid.uuid4().hex[:6]}",
    )
    return PurchaseDocument.objects.get(pk=data["id"])


# ── A4b ── payments' own two targets (FRD 00 PLT-X02): a deposit taken IN, and
# money taken OUT of one (a return, or the OUT half of an application).
def _open_deposit(ctx: dict, party: Any, day: dt.date) -> Any:
    from django.utils import timezone

    from apps.payments.models import HeldDeposit
    from apps.payments.services import deposits

    deposit = deposits.open_deposit(
        ctx=Ctx.system(ctx["shop"]),
        party_id=party.id,
        module="library",
        subject_type="library_membership",
        subject_id=uuid.uuid4(),
        purpose="Library deposit",
        expected_amount="500.00",
    )
    # The deposit's `document_date` is the day it was opened.
    moment = timezone.make_aware(dt.datetime.combine(day, dt.time(10, 0)))
    HeldDeposit.objects.filter(pk=deposit.pk).update(created_at=moment)
    return HeldDeposit.objects.get(pk=deposit.pk)


def _held_deposit(ctx: dict, party: Any, day: dt.date) -> Any:
    from apps.payments.models import HeldDeposit
    from apps.payments.services import deposits

    deposit = _open_deposit(ctx, party, day)
    deposits.receive_deposit(
        ctx=Ctx.system(ctx["shop"]),
        deposit_id=deposit.id,
        amount="500.00",
        mode_breakup=[{"mode": "cash", "amount": "500.00"}],
    )
    return HeldDeposit.objects.get(pk=deposit.pk)


#: One factory per registered `document_type`. A target registered without one fails the suite.
FACTORIES: dict[str, Callable[[dict, Any, dt.date], Any]] = {
    "sales_document": _sales_document,
    "purchase_document": _purchase_document,
    "held_deposit": _open_deposit,
    "held_deposit_refund": _held_deposit,
}

#: The status a fully settled document derives. A bill is `paid`; a deposit fully
#: received is `held`, and one emptied by a return is `released` (PLT-X02 BR-2).
SETTLED: dict[str, str] = {"held_deposit": "held", "held_deposit_refund": "released"}


@pytest.fixture
def world(shop: Any, owner: Any, make_item: Any, make_party: Any) -> dict:  # noqa: F811
    return {"shop": shop, "owner": owner, "make_item": make_item, "make_party": make_party}


def _target_ids() -> list[str]:
    return sorted(FACTORIES)


def test_every_registered_target_is_under_contract() -> None:
    """The guard on the guard: every target registered at start-up has a factory here."""
    assert set(registered_targets()) <= set(
        FACTORIES
    ), "a registered allocation target has no document factory in the contract suite"


@pytest.mark.parametrize("document_type", _target_ids())
def test_the_target_declares_its_shape(document_type: str) -> None:
    target = registered_targets()[document_type]
    assert len(target.document_type) <= 32
    assert target.direction in ("in", "out")
    assert target.bucket in ("main", "loan", "deposit")
    assert isinstance(target.auto, bool)


@pytest.mark.parametrize("document_type", _target_ids())
def test_lock_takes_rows_in_the_global_order(document_type: str, world: dict) -> None:
    """`(document_date, number, id)` — asked for in reverse, returned in order."""
    target = registered_targets()[document_type]
    party = world["make_party"](name=f"Order {document_type}")
    today = tenant_today(world["shop"])
    docs = [
        FACTORIES[document_type](world, party, today - dt.timedelta(days=days))
        for days in (1, 9, 5)
    ]
    locked = target.lock(tenant=world["shop"], ids=[d.id for d in reversed(docs)])
    keys = [(d.document_date, d.number, str(d.id)) for d in locked]
    assert keys == sorted(keys)


@pytest.mark.parametrize("document_type", _target_ids())
def test_apply_then_unapply_restores_the_row_and_rederives_status(
    document_type: str, world: dict
) -> None:
    target = registered_targets()[document_type]
    party = world["make_party"](name=f"Move {document_type}")
    document = FACTORIES[document_type](world, party, tenant_today(world["shop"]))
    model = type(document)
    before = model_to_dict(model.objects.get(pk=document.pk))
    status_before = document.status
    due = target.outstanding(document)
    assert due > 0
    today = tenant_today(world["shop"])
    ctx = Ctx.system(world["shop"])
    payment_id = uuid.uuid4()

    [locked] = target.lock(tenant=world["shop"], ids=[document.id])
    was, now = target.apply(
        document=locked, amount=due, today=today, payment_id=payment_id, ctx=ctx
    )
    assert (was, now) == (status_before, SETTLED.get(document_type, "paid"))
    assert target.outstanding(locked) == Decimal("0.00")
    assert not target.is_open(locked)

    [locked] = target.lock(tenant=world["shop"], ids=[document.id])
    was, now = target.unapply(
        document=locked, amount=due, today=today, payment_id=payment_id, ctx=ctx
    )
    assert (was, now) == (SETTLED.get(document_type, "paid"), status_before)
    after = model_to_dict(model.objects.get(pk=document.pk))
    changed = {k for k in before if before[k] != after[k]} - _METADATA
    assert changed == set()


@pytest.mark.parametrize("document_type", _target_ids())
def test_outstanding_is_never_negative(document_type: str, world: dict) -> None:
    target = registered_targets()[document_type]
    party = world["make_party"](name=f"Floor {document_type}")
    document = FACTORIES[document_type](world, party, tenant_today(world["shop"]))
    [locked] = target.lock(tenant=world["shop"], ids=[document.id])
    target.apply(
        document=locked,
        amount=target.outstanding(locked),
        today=tenant_today(world["shop"]),
        payment_id=None,
        ctx=Ctx.system(world["shop"]),
    )
    assert target.outstanding(locked) >= Decimal("0.00")


@pytest.mark.parametrize("document_type", _target_ids())
def test_the_summary_names_the_document(document_type: str, world: dict) -> None:
    """What the allocation panel and the receipt print; `label`, when present, fits (R30)."""
    target = registered_targets()[document_type]
    party = world["make_party"](name=f"Summary {document_type}")
    document = FACTORIES[document_type](world, party, tenant_today(world["shop"]))
    summary = target.summary(document)
    assert summary["document_type"] == document_type
    assert summary["document_id"] == str(document.id)
    assert Decimal(summary["amount_due"]) >= 0
    assert len(summary.get("label") or "") <= 120
