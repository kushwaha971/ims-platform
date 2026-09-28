"""PLT-07 — the business profile's bank, UPI and GST rules.

T-PLT-07-1, -2, -4. The masking tests exist because a bank account number is
the one field on this page that is worth stealing, and it travels through
three places: the read, the audit snapshot, and seven years of retention.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse

from apps.platform_app.services import guards

pytestmark = pytest.mark.django_db

URL = "v1:tenant-current"
BANK = {
    "account_name": "Ramesh Traders",
    "account_number": "123456789012",
    "ifsc": "sbin0001234",
    "bank_name": "SBI",
    "branch": "Camp",
}


@pytest.fixture
def clean_guards() -> Any:
    guards._reset_for_tests()
    yield
    guards._reset_for_tests()


def test_bank_details_and_upi_are_saved_normalised(api_as: Any, tenant: Any) -> None:
    """FR-1/FR-6: the IFSC is upper-cased (a phone keyboard offers lower case first)."""
    client, _m = api_as(tenant)
    response = client.patch(
        reverse(URL), {"bank_details": BANK, "upi_vpa": "ramesh@okaxis"}, format="json"
    )
    assert response.status_code == 200, response.content
    tenant.refresh_from_db()
    assert tenant.bank_details["ifsc"] == "SBIN0001234"
    assert tenant.upi_vpa == "ramesh@okaxis"
    assert response.json()["data"]["bank_details"]["account_number"] == "123456789012"


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({"upi_vpa": "ramesh.okaxis"}, "upi_vpa"),
        ({"bank_details": {**BANK, "ifsc": "SBIN1234"}}, "bank_details"),
        ({"bank_details": {**BANK, "account_number": "12345"}}, "bank_details"),
    ],
)
def test_malformed_payment_details_are_refused(
    api_as: Any, tenant: Any, body: dict, field: str
) -> None:
    """T-PLT-07-1: VPA, IFSC and account-number patterns (§10) — a bad UPI ID
    prints a QR that no app can pay."""
    client, _m = api_as(tenant)
    response = client.patch(reverse(URL), body, format="json")
    assert response.status_code == 400
    assert field in response.json()["error"]["details"]


def test_the_accountant_sees_the_account_number_masked_and_cannot_edit(
    api_as: Any, tenant: Any
) -> None:
    """T-PLT-07-4: accountant GET returns `••••9012`; PATCH is 403."""
    tenant.bank_details = BANK
    tenant.pan = "AAPFU0939F"
    tenant.save(update_fields=["bank_details", "pan"])
    client, _m = api_as(tenant, role="accountant")
    data = client.get(reverse(URL)).json()["data"]
    assert data["bank_details"]["account_number"] == "••••9012"
    assert data["pan"].endswith("939F") and data["pan"].startswith("••")
    assert data["bank_details_masked"] is True
    assert client.patch(reverse(URL), {"upi_vpa": "x@okaxis"}, format="json").status_code == 403


def test_the_audit_snapshot_masks_the_account_number(api_as: Any, tenant: Any) -> None:
    """§16: the audit log outlives every screen rule, so the number is masked at write."""
    from apps.platform_app.models import AuditLog

    client, _m = api_as(tenant)
    client.patch(reverse(URL), {"bank_details": BANK}, format="json")
    audit = AuditLog.objects.get(action="tenant.updated", tenant=tenant)
    assert audit.after["bank_details"]["account_number"] == "••••9012"
    assert "123456789012" not in str(audit.after)


def test_leaving_regular_is_refused_while_tax_invoices_exist_this_year(
    api_as: Any, tenant: Any, clean_guards: Any
) -> None:
    """T-PLT-07-2: 409 `gst_type_locked` with the count, from the sales app's counter."""
    tenant.gst_type = "regular"
    tenant.gstin = "27AAPFU0939F1ZV"
    tenant.save(update_fields=["gst_type", "gstin"])
    guards.register_gst_lock_counter(lambda t: 3)
    client, _m = api_as(tenant)
    response = client.patch(reverse(URL), {"gst_type": "unregistered"}, format="json")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "gst_type_locked"
    assert response.json()["error"]["details"]["count"] == 3


def test_a_gst_type_change_writes_its_own_audit_event(api_as: Any, tenant: Any) -> None:
    """§16 `tenant.gst_type_changed`: "when did we become a GST business" is asked on its own."""
    from apps.platform_app.models import AuditLog

    client, _m = api_as(tenant)
    response = client.patch(
        reverse(URL), {"gst_type": "regular", "gstin": "27aapfu0939f1zv"}, format="json"
    )
    assert response.status_code == 200, response.content
    audit = AuditLog.objects.get(action="tenant.gst_type_changed", tenant=tenant)
    assert (audit.before, audit.after) == ({"gst_type": "unregistered"}, {"gst_type": "regular"})


def test_the_profile_read_carries_resolved_branding(api_as: Any, tenant: Any) -> None:
    """FR-7's header preview needs the logo and name from the same read."""
    client, _m = api_as(tenant)
    data = client.get(reverse(URL)).json()["data"]
    assert data["branding"]["app_name"] == "YourKhata"
    assert data["branding"]["sources"]["app_name"] == "default"
