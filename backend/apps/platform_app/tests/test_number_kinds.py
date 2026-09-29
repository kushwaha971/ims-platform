"""PLT-X07 — number kinds and the never-resetting counter (A8, ADR-051, contracts §1.7).

T-PLT-X07-1…7. A library's accession register and a member-code series never
reset and never reuse a number, and a library continues its paper register from
the next number. `allocate_number` keys and prints every series by financial
year, so a perpetual kind is a second MODE of the one allocator: the same row
shape with `fy_label = '*'`, the same lock (taken last), a number that can be
raised and never lowered.

The fake module `test` stands in for a vertical registering its kinds.
"""

from __future__ import annotations

import datetime as dt
import threading
from typing import Any

import pytest
from django.core.exceptions import ImproperlyConfigured
from django.db import IntegrityError, connections, transaction
from django.test import TransactionTestCase
from django.urls import reverse

from apps.common.audit import AuditAction
from apps.common.context import Ctx
from apps.common.exceptions import BusinessRuleViolation, ValidationFailed
from apps.platform_app.models import AuditLog, DocumentSequence
from apps.platform_app.services import sequences

pytestmark = pytest.mark.django_db

MEMBER = "test_member"
ACCESSION = "test_accession"
LOAN = "test_loan"


def _register() -> None:
    sequences.register_number_kind(
        MEMBER,
        module="test",
        mode="perpetual",
        default_prefix="M-",
        padding=4,
        label_id="test.number.member",
    )
    sequences.register_number_kind(
        ACCESSION,
        module="test",
        mode="perpetual",
        default_prefix="",
        padding=0,
        label_id="test.number.accession",
    )
    sequences.register_number_kind(
        LOAN, module="test", mode="fy", default_prefix="LN", padding=4, label_id="test.number.loan"
    )


@pytest.fixture
def kinds() -> Any:
    sequences._reset_kinds_for_tests()
    _register()
    yield
    sequences._reset_kinds_for_tests()


def _module_on(tenant: Any, module: str = "test") -> Any:
    for row, field in ((tenant.plan, "modules"), (tenant.partner, "allowed_modules")):
        setattr(row, field, sorted(set(getattr(row, field)) | {module}))
        row.save(update_fields=[field])
    tenant.enabled_modules = sorted(set(tenant.enabled_modules) | {module})
    tenant.save(update_fields=["enabled_modules"])
    tenant.refresh_from_db()
    if hasattr(tenant, "_ub_entitlement"):
        delattr(tenant, "_ub_entitlement")
    return tenant


# ── The registry ─────────────────────────────────────────────────────────────


def test_registration_is_idempotent_and_a_conflict_raises(kinds: Any) -> None:
    """ADR-042: a second `ready()` is harmless; two definitions of a kind is a bug."""
    _register()
    assert sequences.number_kind(MEMBER).mode == "perpetual"
    with pytest.raises(ImproperlyConfigured):
        sequences.register_number_kind(
            MEMBER, module="test", mode="fy", default_prefix="M-", padding=4, label_id="x"
        )


@pytest.mark.parametrize(
    ("kind", "mode", "prefix", "padding"),
    [
        ("x" * 25, "perpetual", "M-", 4),  # kind varchar(24)
        ("test_ok", "perpetual", "P" * 13, 4),  # prefix varchar(12)
        ("test_ok", "perpetual", "M-", 11),  # padding 0..10
        ("test_ok", "yearly", "M-", 4),  # mode fy | perpetual
        ("invoice", "fy", "INV", 4),  # a core kind is not a module's
    ],
)
def test_a_kind_that_does_not_fit_the_row_is_refused(
    kinds: Any, kind: str, mode: str, prefix: str, padding: int
) -> None:
    """The row's columns are the limits; a kind that cannot be stored is refused
    at start-up rather than as a DataError on the first member created."""
    with pytest.raises(ImproperlyConfigured):
        sequences.register_number_kind(
            kind, module="test", mode=mode, default_prefix=prefix, padding=padding, label_id="x"
        )


# ── Allocation (T-PLT-X07-1, -3, -5) ────────────────────────────────────────


def test_perpetual_numbers_do_not_reset_across_the_financial_year(
    tenant: Any, kinds: Any, monkeypatch: Any
) -> None:
    """T-PLT-X07-1 / BR-1: 31 March and 1 April allocations are consecutive,
    and there is one row, `fy_label = '*'`, however many years pass."""
    from apps.common import dates

    monkeypatch.setattr(dates, "tenant_today", lambda _t: dt.date(2027, 3, 31))
    assert sequences.allocate_counter(tenant=tenant, kind=MEMBER) == "M-0001"
    monkeypatch.setattr(dates, "tenant_today", lambda _t: dt.date(2027, 4, 1))
    assert sequences.allocate_counter(tenant=tenant, kind=MEMBER) == "M-0002"
    rows = DocumentSequence.objects.filter(tenant=tenant, kind=MEMBER)
    assert [(r.fy_label, r.next_number) for r in rows] == [("*", 3)]


def test_an_accession_counter_is_a_bare_number(tenant: Any, kinds: Any) -> None:
    """No prefix and padding 0 prints `1024`, not `/1024` or `0001024`."""
    sequences.raise_counter(ctx=Ctx.system(tenant), kind=ACCESSION, next_number=1024)
    assert sequences.allocate_counter(tenant=tenant, kind=ACCESSION) == "1024"
    assert sequences.peek_counter(tenant=tenant, kind=ACCESSION) == 1025


def test_a_rolled_back_transaction_returns_its_number(tenant: Any, kinds: Any) -> None:
    """T-PLT-X07-3 / BR-2: the counter row is in the caller's transaction."""
    assert sequences.allocate_counter(tenant=tenant, kind=MEMBER) == "M-0001"
    with pytest.raises(RuntimeError), transaction.atomic():
        assert sequences.allocate_counter(tenant=tenant, kind=MEMBER) == "M-0002"
        raise RuntimeError("the member save failed")
    assert sequences.allocate_counter(tenant=tenant, kind=MEMBER) == "M-0002"


def test_each_allocator_refuses_the_other_mode(tenant: Any, kinds: Any) -> None:
    """T-PLT-X07-5: a perpetual kind through `allocate_number` would print a
    year it must never carry; an FY kind through `allocate_counter` would never
    restart. Both are wiring bugs and fail loudly."""
    with pytest.raises(ImproperlyConfigured):
        sequences.allocate_number(tenant=tenant, kind=MEMBER, on_date=dt.date(2026, 9, 30))
    with pytest.raises(ImproperlyConfigured):
        sequences.allocate_counter(tenant=tenant, kind=LOAN)
    with pytest.raises(ImproperlyConfigured):
        sequences.allocate_counter(tenant=tenant, kind="test_unregistered")


def test_a_registered_fy_kind_takes_its_registered_prefix(tenant: Any, kinds: Any) -> None:
    """A loan series `LN/26-27/0001` — the registry's prefix, not `TEST_L`."""
    assert (
        sequences.allocate_number(tenant=tenant, kind=LOAN, on_date=dt.date(2026, 9, 30))
        == "LN/26-27/0001"
    )


def test_peek_is_advisory_and_creates_nothing(tenant: Any, kinds: Any) -> None:
    """`peek_counter` pre-fills a form; it must not create or lock a row."""
    assert sequences.peek_counter(tenant=tenant, kind=MEMBER) == 1
    assert not DocumentSequence.objects.filter(tenant=tenant, kind=MEMBER).exists()


def test_two_tenants_have_independent_counters(tenant: Any, other_tenant: Any, kinds: Any) -> None:
    """EC-1: the tenant is in the unique key."""
    assert sequences.allocate_counter(tenant=tenant, kind=MEMBER) == "M-0001"
    assert sequences.allocate_counter(tenant=other_tenant, kind=MEMBER) == "M-0001"


# ── Raise (T-PLT-X07-4) ─────────────────────────────────────────────────────


def test_raise_lower_is_refused_equal_is_a_no_op_and_higher_is_audited(
    tenant: Any, kinds: Any
) -> None:
    """T-PLT-X07-4 and the worked example: an import of 1000–1500 raises the
    counter to 1501; raising to 1200 afterwards is 409 `sequence_backwards`
    with both figures; raising to 1501 again changes and audits nothing."""
    ctx = Ctx.system(tenant)
    sequences.raise_counter(ctx=ctx, kind=ACCESSION, next_number=1501, via="import")
    with pytest.raises(BusinessRuleViolation) as refused:
        sequences.raise_counter(ctx=ctx, kind=ACCESSION, next_number=1200)
    assert refused.value.code == "sequence_backwards"
    assert refused.value.details == {"current": 1501, "requested": 1200}
    sequences.raise_counter(ctx=ctx, kind=ACCESSION, next_number=1501)
    audits = AuditLog.objects.filter(tenant=tenant, action=AuditAction.COUNTER_RAISED)
    assert audits.count() == 1
    assert audits.get().after == {"kind": ACCESSION, "before": 1, "after": 1501, "via": "import"}


def test_raise_refuses_a_number_the_column_cannot_hold(tenant: Any, kinds: Any) -> None:
    """EC-4: `next_number` is an `integer`; past 2^31 is a DataError otherwise."""
    with pytest.raises(ValidationFailed):
        sequences.raise_counter(ctx=Ctx.system(tenant), kind=ACCESSION, next_number=2**31)


# ── The CHECK (T-PLT-X07-7) ─────────────────────────────────────────────────


@pytest.mark.parametrize("label", ["2026", "26-27", "*2026", "2026-2027"])
def test_the_database_refuses_a_malformed_fy_label(tenant: Any, label: str) -> None:
    """T-PLT-X07-7: `'*'` is a sentinel in a column named `fy_label`; the CHECK
    is what stops a typo becoming a second, silent series."""
    with pytest.raises(IntegrityError), transaction.atomic():
        DocumentSequence.objects.create(tenant=tenant, kind="invoice", fy_label=label)


@pytest.mark.parametrize("label", ["*", "2026-27"])
def test_the_database_accepts_the_two_shapes(tenant: Any, label: str) -> None:
    DocumentSequence.objects.create(tenant=tenant, kind="invoice", fy_label=label)


# ── The settings numbering payload (T-PLT-X07-6, owner Q14) ─────────────────


def test_a_registered_kind_is_shown_only_while_its_module_is_on(
    api_as: Any, tenant: Any, kinds: Any
) -> None:
    """T-PLT-X07-6: the numbering block lists a module's kinds only while the
    module is effective, with the mode and label the screen needs."""
    client, member = api_as(tenant, role="owner")
    assert member.role.code == "owner"
    numbering = client.get(reverse("v1:tenant-settings")).json()["data"]["numbering"]
    assert MEMBER not in numbering and LOAN not in numbering

    _module_on(tenant)
    numbering = client.get(reverse("v1:tenant-settings")).json()["data"]["numbering"]
    assert numbering[MEMBER] == {
        "kind": MEMBER,
        "module": "test",
        "mode": "perpetual",
        "label_id": "test.number.member",
        "prefix": "M-",
        "padding": 4,
        "next_number": 1,
        "preview": "M-0001",
    }
    assert numbering[LOAN]["mode"] == "fy" and numbering[LOAN]["preview"] == "LN/26-27/0001"
    assert numbering["invoice"]["mode"] == "fy"


def test_the_ignored_settings_are_no_longer_shown(api_as: Any, tenant: Any) -> None:
    """Owner Q14: `reset_fy` (every series resets each year whatever it says)
    and `sales.default_kind` (sales chooses by GST type and never reads it) are
    removed from the settings payload until they are wired; a switch whose
    effect nobody can see teaches a merchant the product is broken. A client
    still sending them is not refused — its save simply leaves them alone."""
    client, member = api_as(tenant, role="owner")
    assert member.role.code == "owner"
    data = client.get(reverse("v1:tenant-settings")).json()["data"]
    assert "sales.default_kind" not in data["values"]
    assert "sales.default_kind" not in data["sections"]
    assert all("reset_fy" not in row for row in data["numbering"].values())
    defaults = client.get(reverse("v1:tenant-settings-defaults")).json()["data"]["values"]
    assert "sales.default_kind" not in defaults

    stale = client.put(
        reverse("v1:tenant-settings"),
        {
            "values": {"sales.default_kind": {"by_gst_type": {"regular": "invoice"}}},
            "numbering": {"invoice": {"reset_fy": False}},
        },
        format="json",
    )
    assert stale.status_code == 200, stale.content


def test_a_perpetual_next_number_can_be_raised_and_never_lowered_through_settings(
    api_as: Any, tenant: Any, kinds: Any
) -> None:
    """FRD §6: `PUT` writes the `'*'` row; lowering is 409 `sequence_backwards`."""
    _module_on(tenant)
    client, member = api_as(tenant, role="owner")
    assert member.role.code == "owner"
    url = reverse("v1:tenant-settings")
    raised = client.put(url, {"numbering": {ACCESSION: {"next_number": 1024}}}, format="json")
    assert raised.status_code == 200, raised.content
    assert raised.json()["data"]["numbering"][ACCESSION]["preview"] == "1024"
    assert DocumentSequence.objects.get(tenant=tenant, kind=ACCESSION).fy_label == "*"
    lowered = client.put(url, {"numbering": {ACCESSION: {"next_number": 10}}}, format="json")
    assert lowered.status_code == 409
    assert lowered.json()["error"]["code"] == "sequence_backwards"


def test_a_kind_of_a_switched_off_module_cannot_be_written(
    api_as: Any, tenant: Any, kinds: Any
) -> None:
    """A hidden series is not writable either — the screen never offered it."""
    client, member = api_as(tenant, role="owner")
    assert member.role.code == "owner"
    refused = client.put(
        reverse("v1:tenant-settings"), {"numbering": {MEMBER: {"next_number": 5}}}, format="json"
    )
    assert refused.status_code == 400
    assert f"numbering.{MEMBER}" in refused.json()["error"]["details"]


# ── A10's module settings, wired through this file (handed over by Track F) ──


def test_a_module_setting_is_shown_and_writable_only_while_its_module_is_on(
    api_as: Any, tenant: Any
) -> None:
    """A10's acceptance test for the `specs_for`/`spec_for` wiring: a registered
    probe key appears in GET and is accepted by PUT while its module is on; off,
    it disappears and a PUT of it is 400 "This is not a setting."."""
    from apps.platform_app import settings_schema as schema

    def _bool(value: Any, _tenant: Any) -> Any:
        if not isinstance(value, dict) or not isinstance(value.get("on"), bool):
            raise schema.SettingError(["Choose on or off."])
        return value

    schema._reset_for_tests()
    schema.register_setting_spec(
        schema.SettingSpec("test.probe", "test", lambda bt: {"on": False}, _bool)
    )
    try:
        client, member = api_as(tenant, role="owner")
        assert member.role.code == "owner"
        url = reverse("v1:tenant-settings")
        assert "test.probe" not in client.get(url).json()["data"]["values"]

        _module_on(tenant)
        data = client.get(url).json()["data"]
        assert data["values"]["test.probe"] == {"on": False}
        assert data["sections"]["test.probe"] == "test"
        saved = client.put(url, {"values": {"test.probe": {"on": True}}}, format="json")
        assert saved.status_code == 200, saved.content
        assert saved.json()["data"]["values"]["test.probe"] == {"on": True}

        tenant.enabled_modules = [m for m in tenant.enabled_modules if m != "test"]
        tenant.save(update_fields=["enabled_modules"])
        assert "test.probe" not in client.get(url).json()["data"]["values"]
        refused = client.put(url, {"values": {"test.probe": {"on": False}}}, format="json")
        assert refused.status_code == 400
        assert refused.json()["error"]["details"]["test.probe"] == ["This is not a setting."]
    finally:
        schema._reset_for_tests()


# ── Concurrency (T-PLT-X07-2) ───────────────────────────────────────────────


class PerpetualCounterConcurrencyTest(TransactionTestCase):
    """T-PLT-X07-2: twenty workers allocating one tenant's perpetual kind at once
    — including the very first allocation, which races to CREATE the row — get
    twenty distinct, consecutive numbers and no IntegrityError leaks."""

    databases = {"default"}

    def setUp(self) -> None:
        from tests.factories.platform import TenantFactory

        sequences._reset_kinds_for_tests()
        _register()
        self.tenant = TenantFactory()

    def tearDown(self) -> None:
        sequences._reset_kinds_for_tests()

    def test_twenty_workers_get_twenty_consecutive_numbers(self) -> None:
        results: list[str] = []
        errors: list[BaseException] = []
        barrier = threading.Barrier(20)

        def worker() -> None:
            try:
                barrier.wait(timeout=20)
                with transaction.atomic():
                    results.append(sequences.allocate_counter(tenant=self.tenant, kind=MEMBER))
            except BaseException as exc:  # noqa: BLE001 - collected and asserted
                errors.append(exc)
            finally:
                connections.close_all()

        threads = [threading.Thread(target=worker) for _ in range(20)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=60)

        assert errors == []
        assert sorted(results) == [f"M-{n:04d}" for n in range(1, 21)]
