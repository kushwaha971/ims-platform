"""The audit writer (Part 21 §21.7, task S0-29)."""

from __future__ import annotations

from typing import Any

import pytest

from apps.common.audit import AuditAction, diff_fields, write_audit
from apps.common.context import Ctx
from apps.platform_app.models import AuditLog

pytestmark = pytest.mark.django_db


def test_one_call_writes_exactly_one_row(tenant: Any, user: Any) -> None:
    ctx = Ctx(tenant=tenant, actor=user, request_id="req-7", ip="10.0.0.1")
    write_audit(
        ctx=ctx,
        action=AuditAction.PARTY_CREATED,
        entity_type="parties_party",
        entity_id=None,
        after={"name": "Sharma Traders"},
    )
    row = AuditLog.objects.get()
    assert row.tenant_id == tenant.id
    assert row.actor_id == user.id
    assert row.actor_type == "user"
    assert row.action == "party.created"
    assert row.after == {"name": "Sharma Traders"}
    assert row.metadata["request_id"] == "req-7"
    assert row.metadata["ip"] == "10.0.0.1"


def test_a_system_context_writes_actor_type_system(tenant: Any) -> None:
    write_audit(
        ctx=Ctx.system(tenant, via="job"),
        action=AuditAction.JOB_REQUEUED,
        entity_type="platform_job",
    )
    row = AuditLog.objects.get()
    assert row.actor is None
    assert row.actor_type == "system"
    assert row.metadata["via"] == "job"


def test_diff_fields_keeps_only_what_changed() -> None:
    before, after = diff_fields(
        {"name": "A", "mobile": "+911", "balance": "0.00"},
        {"name": "B", "mobile": "+911", "balance": "0.00"},
    )
    assert before == {"name": "A"}
    assert after == {"name": "B"}


def test_diff_fields_can_be_restricted_to_a_field_list() -> None:
    before, after = diff_fields({"a": 1, "b": 1}, {"a": 2, "b": 2}, fields=["a"])
    assert before == {"a": 1}
    assert after == {"a": 2}


def test_an_audit_row_is_immutable(tenant: Any) -> None:
    write_audit(ctx=Ctx.system(tenant), action="x.y", entity_type="t")
    row = AuditLog.objects.get()
    with pytest.raises(ValueError, match="immutable"):
        row.action = "z"
        row.save()
    with pytest.raises(ValueError, match="never deleted"):
        row.delete()


def test_decimal_and_uuid_values_survive_json_serialisation(tenant: Any, party: Any) -> None:
    from decimal import Decimal

    write_audit(
        ctx=Ctx.system(tenant),
        action=AuditAction.PARTY_UPDATED,
        entity_type="parties_party",
        entity_id=party.id,
        after={"balance": Decimal("1234.50"), "id": party.id},
    )
    row = AuditLog.objects.get()
    assert row.after == {"balance": "1234.50", "id": str(party.id)}
