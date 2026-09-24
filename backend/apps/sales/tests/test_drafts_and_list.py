"""SAL-06 drafts and SAL-08 the list — versions, ownership, tabs, totals, search."""

from __future__ import annotations

import datetime as dt
import threading
from typing import Any

import pytest
from django.db import connection
from django.urls import reverse

from apps.common.audit import AuditAction
from apps.platform_app.models import AuditLog
from apps.sales.models import SalesDocument
from apps.sales.services.overdue import refresh_overdue
from apps.sales.tests.conftest import INVOICES, cash, draft, invoice_url, issue, line

pytestmark = pytest.mark.django_db


def test_draft_with_no_lines_is_saved_and_cannot_be_issued(owner: Any) -> None:
    """T-SAL06-6 — drafts relax "≥ 1 line"; issue enforces it."""
    created = draft(owner)
    assert created.status_code == 201
    doc = created.json()["data"]
    assert doc["lines"] == [] and doc["grand_total"] == "0.00"
    assert created.json()["meta"]["rule46"]["passed"] is False
    response = issue(owner, doc["id"])
    assert response.status_code == 400 and "lines" in response.json()["error"]["details"]


def test_patch_bumps_version_and_a_stale_version_is_409(owner: Any, make_item: Any) -> None:
    """T-SAL06-4 / FR-9 — PATCH with the version read; a second writer gets 409 + current_version."""
    item = make_item()
    doc = draft(owner, lines=[line(item)]).json()["data"]
    first = owner.patch(invoice_url(doc["id"]), {"version": 1, "lines": [line(item, "3")]},
                        format="json")  # fmt: skip
    assert first.status_code == 200 and first.json()["data"]["version"] == 2
    assert first.json()["data"]["lines"][0]["qty"] == "3.000"
    stale = owner.patch(invoice_url(doc["id"]), {"version": 1, "notes": "x"}, format="json")
    assert stale.status_code == 409
    assert stale.json()["error"]["details"]["current_version"] == 2


def test_draft_update_audit_is_throttled(owner: Any, make_item: Any) -> None:
    """SAL-06 §15 — autosave PATCHes every few seconds; one audit row per 10 minutes."""
    doc = draft(owner, lines=[line(make_item())]).json()["data"]
    for version in (1, 2, 3):
        owner.patch(invoice_url(doc["id"]), {"version": version, "notes": f"n{version}"},
                    format="json")  # fmt: skip
    assert AuditLog.objects.filter(action=AuditAction.INVOICE_DRAFT_UPDATED).count() == 1


def test_issued_invoice_cannot_be_patched_or_deleted(owner: Any, make_item: Any) -> None:
    """T-SAL02-15 — PATCH or DELETE on an issued document → 409 `document_not_draft`."""
    item = make_item(price="10.00", tax_code="GST0")
    doc = draft(owner, lines=[line(item)]).json()["data"]
    issue(owner, doc["id"], payment=cash("10.00"))
    patched = owner.patch(invoice_url(doc["id"]), {"version": 2, "notes": "x"}, format="json")
    assert patched.json()["error"]["code"] in ("document_not_draft", "stale_version")
    patched = owner.patch(invoice_url(doc["id"]), {"version": 3, "notes": "x"}, format="json")
    assert patched.status_code == 409 and patched.json()["error"]["code"] == "document_not_draft"
    assert owner.delete(invoice_url(doc["id"])).json()["error"]["code"] == "document_not_draft"


def test_staff_cannot_edit_or_delete_another_members_draft(
    shop: Any, api_as: Any, owner: Any
) -> None:
    """T-SAL06-7 — staff editing someone else's draft → 403; the owner may delete it (204)."""
    first, _ = api_as(shop, role="staff")
    second, _ = api_as(shop, role="staff")
    doc = draft(first).json()["data"]
    assert second.patch(invoice_url(doc["id"]), {"version": 1}, format="json").status_code == 403
    assert second.delete(invoice_url(doc["id"])).status_code == 403
    assert owner.delete(invoice_url(doc["id"])).status_code == 204
    assert not SalesDocument.objects.filter(pk=doc["id"]).exists()


def test_future_date_and_bad_mobile_are_refused_even_on_a_draft(owner: Any) -> None:
    """§10 — "Date cannot be in the future"; walk-in mobile must be a 10-digit Indian mobile."""
    response = draft(owner, document_date="2099-01-01", walk_in_mobile="12345")
    details = response.json()["error"]["details"]
    assert "document_date" in details and "walk_in_mobile" in details


def _issued(owner: Any, item: Any, party: Any = None, **body: Any) -> dict:
    extra = {"party_id": str(party.id)} if party else {}
    doc = draft(owner, lines=[line(item)], **extra, **body).json()["data"]
    payment = None if party else cash(doc["grand_total"])
    return issue(owner, doc["id"], payment=payment).json()["data"]


def test_tabs_totals_and_search(owner: Any, make_item: Any, make_party: Any) -> None:
    """T-SAL08-1 / T-SAL08-2 / AC-1 / AC-2 / AC-3 — tabs map to statuses and are counted over the
    filters (not the tab); totals cover the filtered set; search finds number prefix, name, mobile.
    """
    item = make_item(price="100.00", tax_code="GST0", stock="50")
    ramesh = make_party(name="Ramesh Traders", mobile="+919876543210")
    _issued(owner, item, ramesh, document_date="2026-09-01", due_on="2026-09-05")
    _issued(owner, item, ramesh, document_date="2026-09-10")
    _issued(owner, item)  # walk-in, paid
    draft(owner, lines=[line(item)])

    refresh_overdue()
    body = owner.get(reverse(INVOICES)).json()
    assert body["meta"]["tabs"] == {"all": 3, "unpaid": 2, "overdue": 1, "paid": 1, "draft": 1,
                                    "void": 0}  # fmt: skip
    assert body["meta"]["totals"] == {"count": 3, "grand_total": "300.00", "amount_due": "200.00"}
    unpaid = owner.get(reverse(INVOICES), {"tab": "unpaid"}).json()
    assert unpaid["meta"]["totals"]["count"] == 2 and len(unpaid["data"]) == 2
    assert all(row["party"]["name"] == "Ramesh Traders" for row in unpaid["data"])
    by_mobile = owner.get(reverse(INVOICES), {"q": "3210"}).json()
    assert by_mobile["meta"]["totals"]["count"] == 2
    by_number = owner.get(reverse(INVOICES), {"q": "inv/26-27/000"}).json()
    assert by_number["meta"]["totals"]["count"] == 3
    ranged = owner.get(reverse(INVOICES), {"date_from": "2026-09-09"}).json()
    assert ranged["meta"]["tabs"]["overdue"] == 0 and ranged["meta"]["tabs"]["all"] == 2


def test_unknown_ordering_and_tab_are_400(owner: Any) -> None:
    """T-SAL08-3 — the ordering whitelist refuses rather than ignores."""
    assert owner.get(reverse(INVOICES), {"ordering": "cost"}).status_code == 400
    assert owner.get(reverse(INVOICES), {"tab": "everything"}).status_code == 400
    assert owner.get(reverse(INVOICES), {"ordering": "-grand_total"}).status_code == 200


def test_refresh_overdue_is_idempotent_and_never_touches_paid(owner: Any, make_item: Any,
                                                              make_party: Any) -> None:  # fmt: skip
    """BR-17 — only open invoices past due move; a second run moves nothing."""
    item = make_item(price="100.00", tax_code="GST0")
    late = _issued(owner, item, make_party(), document_date="2026-09-01", due_on="2026-09-02")
    paid = _issued(owner, item, document_date="2026-09-01")
    assert refresh_overdue()["moved"] == 1
    assert refresh_overdue()["moved"] == 0
    assert SalesDocument.objects.get(pk=late["id"]).status == "overdue"
    assert SalesDocument.objects.get(pk=paid["id"]).status == "paid"


def test_module_off_guard_counts_drafts(owner: Any, shop: Any, monkeypatch: Any) -> None:
    """PLT-06 FR-4 — the sales module cannot be switched off while drafts exist.

    The registry is module state that other suites reset, so this test gives
    `register_guards()` a fresh registry and checks what IT wires, rather than
    depending on what `ready()` left behind in whatever order the suite ran."""
    from apps.platform_app.services import guards as platform_guards
    from apps.sales.services import guards as sales_guards

    monkeypatch.setattr(platform_guards, "_MODULE_OFF_GUARDS", {})
    monkeypatch.setattr(platform_guards, "_GST_LOCK_COUNTERS", [])
    monkeypatch.setattr(sales_guards, "_REGISTERED", False)
    sales_guards.register_guards()

    assert platform_guards.blocking_rows_for_module_off(shop, "sales") == 0
    draft(owner)
    assert platform_guards.blocking_rows_for_module_off(shop, "sales") == 1


@pytest.mark.django_db(transaction=True)
def test_concurrent_allocation_has_no_gaps_and_no_duplicates(shop: Any) -> None:
    """T-SAL02 numbering / EC-7 — ten threads allocating at once get 0001..0010 exactly once
    each, serialised on the sequence row's FOR UPDATE."""
    from apps.platform_app.services.sequences import allocate_number

    numbers: list[str] = []
    errors: list[BaseException] = []
    barrier = threading.Barrier(10)

    def worker() -> None:
        try:
            barrier.wait()
            numbers.append(
                allocate_number(tenant=shop, kind="invoice", on_date=dt.date(2026, 9, 18))
            )
        except BaseException as exc:  # pragma: no cover - surfaced below
            errors.append(exc)
        finally:
            connection.close()

    threads = [threading.Thread(target=worker) for _ in range(10)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert not errors
    assert sorted(numbers) == [f"INV/26-27/{n:04d}" for n in range(1, 11)]
