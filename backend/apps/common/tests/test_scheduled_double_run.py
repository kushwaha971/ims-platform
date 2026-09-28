"""Every scheduled job is harmless to run twice (Part 12 §12.8, Part 29 §29.3.3 (c)).

The scheduler's defences against a double run are an advisory lock and
`SKIP LOCKED` claiming, and the third is that "every job kind is idempotent by
construction". The launch checklist asks for that to be PROVEN, for every job,
not asserted. So this test seeds one shop with something for most jobs to do —
an overdue invoice, an overdue bill, a missed low-stock crossing, a drifted
balance, expired rate-limit rows — then, for EVERY schedule in `SCHEDULES` that
has a registered handler, runs it through the real `run_job` twice, and
compares the row count of every table in the project after the first run with
the count after the second. A handler that sends, posts, notifies or enqueues
twice changes a count; a handler that only recomputes does not.

Two more things are asserted so the proof cannot pass vacuously: every run
must end `succeeded` (a handler that crashes has "no side effects" too), and
the seeded work must actually have been done by the first run.
"""

from __future__ import annotations

import datetime as dt
import uuid
from typing import Any

import pytest
from django.apps import apps as django_apps
from django.urls import reverse

from apps.common.constants import JobStatus
from apps.common.jobs import REGISTRY, SCHEDULES, run_job
from apps.sales.tests.conftest import draft, issue, line

pytestmark = pytest.mark.django_db


def _counts() -> dict[str, int]:
    """Rows per table, for every concrete model in the project (`platform_job` included)."""
    counts: dict[str, int] = {}
    for model in django_apps.get_models():
        meta = model._meta
        if meta.proxy or not meta.managed or not model.__module__.startswith("apps."):
            continue
        manager = getattr(model, "all_objects", None) or model._base_manager
        counts[meta.db_table] = manager.count()
    return counts


def _run(job_type: str, tenant: Any) -> Any:
    from apps.platform_app.models import Job

    spec = REGISTRY[job_type]
    job = Job.objects.create(
        tenant=None if not spec.requires_tenant else tenant,
        job_type=job_type,
        payload={},
        status=JobStatus.RUNNING,
        attempts=1,
        run_after=dt.datetime.now(dt.timezone.utc),
    )
    run_job(job, worker="double-run-proof")
    job.refresh_from_db()
    return job


def _seed_world(shop: Any, owner: Any, make_item: Any, make_party: Any) -> dict[str, Any]:
    from apps.common.context import Ctx
    from apps.common.dates import tenant_today
    from apps.inventory.constants import AlertLevel
    from apps.inventory.models import ItemStock
    from apps.parties.models import Party
    from apps.platform_app.models import RateLimit
    from apps.purchases.services.drafts import create_draft
    from apps.purchases.services.record import record_bill
    from apps.purchases.tests.conftest import line as bill_line

    today = tenant_today(shop)
    # An invoice due a month ago — `sales.refresh_overdue` moves it once.
    customer = make_party(name="Late Payer")
    goods = make_item("Goods", "100.00", "GST0", stock="50")
    created = draft(
        owner,
        party_id=str(customer.id),
        lines=[line(goods)],
        document_date=(today - dt.timedelta(days=40)).isoformat(),
        due_on=(today - dt.timedelta(days=30)).isoformat(),
    ).json()["data"]
    invoice = issue(owner, created["id"]).json()["data"]

    # A supplier bill due a month ago — `purchases.refresh_overdue`.
    supplier = make_party(name="Slow Supplier", is_supplier=True, is_customer=False)
    ctx = Ctx.system(shop)
    bill = create_draft(
        ctx=ctx,
        payload={
            "party_id": supplier.id,
            "supplier_invoice_number": "DR/1",
            "document_date": (today - dt.timedelta(days=40)).isoformat(),
            "due_on": (today - dt.timedelta(days=30)).isoformat(),
            "lines": [bill_line(goods, "1", "60.00")],
        },
    )["document"]
    record_bill(ctx=ctx, document_id=bill.id)

    # A low-stock crossing the inline path missed — `inventory.scan_low_stock`.
    rice = make_item("Rice", "50.00", "GST0", stock="8", reorder_point="10")
    ItemStock.objects.filter(item=rice).update(alert_level=AlertLevel.OK)

    # A drifted balance — `parties.recalc_balances` must REPORT it, twice, and write nothing.
    Party.all_objects.filter(pk=customer.pk).update(balance="1.23")

    # A stale durable-throttle row — `platform.purge_rate_limits` deletes it once.
    RateLimit.objects.create(
        scope="drf:public_link",
        key=uuid.uuid4().hex * 2,
        count=5,
        window_start=dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=5),
    )
    return {"invoice_id": invoice["id"], "bill_id": bill.id, "rice": rice}


def test_every_scheduled_job_is_harmless_to_run_twice(
    shop: Any, owner: Any, make_item: Any, make_party: Any
) -> None:
    from apps.inventory.models import LowStockAlert
    from apps.platform_app.models import RateLimit
    from apps.purchases.models import PurchaseDocument
    from apps.sales.models import SalesDocument

    world = _seed_world(shop, owner, make_item, make_party)
    scheduled = [s.job_type for s in SCHEDULES if s.job_type in REGISTRY]
    # Guard the guard: the jobs Part 12 §12.8 names must be among those proven.
    for named in (
        "sales.refresh_overdue",
        "inventory.scan_low_stock",
        "ledger.schedule_auto_reminders",
        "reports.expire_exports",
        "parties.recalc_balances",
        "inventory.recalc_stock",
    ):
        assert named in scheduled, f"{named} is not scheduled with a handler"

    failures: dict[str, Any] = {}
    for job_type in scheduled:
        first = _run(job_type, shop)
        after_first = _counts()
        second = _run(job_type, shop)
        after_second = _counts()
        for label, job in (("first", first), ("second", second)):
            if job.status != JobStatus.SUCCEEDED:
                failures[f"{job_type} ({label} run)"] = (job.status, (job.error or "")[:300])
        # The second run's own job row is the one expected difference.
        after_second["platform_job"] -= 1
        changed = {
            table: (after_first[table], after_second[table])
            for table in after_first
            if after_first[table] != after_second[table]
        }
        if changed:
            failures[f"{job_type} (second run changed rows)"] = changed
    assert not failures, failures

    # The first runs really did the work, so the equality above means something.
    assert SalesDocument.objects.get(pk=world["invoice_id"]).status == "overdue"
    assert PurchaseDocument.objects.get(pk=world["bill_id"]).status == "overdue"
    assert LowStockAlert.objects.filter(item=world["rice"]).count() == 2  # inline + one scan
    assert not RateLimit.objects.filter(scope="drf:public_link").exists()


def test_the_balance_drift_check_is_scheduled_and_alerts(
    shop: Any, owner: Any, make_item: Any, make_party: Any, caplog: Any
) -> None:
    """Part 42 BE-03 — `parties.recalc_balances` was in `SCHEDULES` with no handler,
    so the scheduler skipped it every night. It now runs, reports the drift at
    ERROR (the MVP alert path) with a count and tenant ids only, and corrects nothing."""
    import logging

    from apps.parties.models import Party

    party = make_party(name="Drift Traders")
    Party.all_objects.filter(pk=party.pk).update(balance="9.99")
    ledger_logger = logging.getLogger("ub.ledger")
    records: list[logging.LogRecord] = []

    class _Capture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            records.append(record)

    handler = _Capture(level=logging.ERROR)
    previous = ledger_logger.level
    ledger_logger.setLevel(logging.ERROR)  # the test settings silence `ub` below CRITICAL
    ledger_logger.addHandler(handler)
    try:
        job = _run("parties.recalc_balances", shop)
    finally:
        ledger_logger.removeHandler(handler)
        ledger_logger.setLevel(previous)

    assert job.status == JobStatus.SUCCEEDED
    assert job.result["drifted"] == 1 and job.result["ok"] is False
    assert [r.getMessage() for r in records] == ["ledger.balance_drift"]
    assert records[0].count == 1 and str(shop.id) in records[0].tenants
    assert "Drift Traders" not in str(records[0].__dict__)
    party.refresh_from_db()
    assert str(party.balance) == "9.99"  # report-only: the evidence is kept


def test_the_expected_runs_check_does_not_cry_wolf_over_unbuilt_jobs(shop: Any) -> None:
    """Schedules with no handler are never materialised, so their run can never
    succeed; reporting them MISSING every hour buried the real alerts."""
    job = _run("platform.check_expected_runs", shop)
    assert job.status == JobStatus.SUCCEEDED
    unbuilt = set(job.result["unbuilt"])
    assert unbuilt == {s.job_type for s in SCHEDULES if s.job_type not in REGISTRY}
    assert not unbuilt & set(job.result["missing"])


def test_public_page_url_used_by_share_links_exists() -> None:
    """Sanity for the fixture imports above: the public route is mounted."""
    assert reverse("v1:public-document", args=["t"]).endswith("/public/d/t")
