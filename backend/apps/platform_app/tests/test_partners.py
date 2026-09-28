"""WLB-02 — partner configuration through the Django admin, and suspension.

T-WLB-02-3 and §10's validation. At MVP the admin form is the only writer of
`platform_partner`, so these rules are the whole defence against a partner
record that breaks every tenant under it.
"""

from __future__ import annotations

import re
from typing import Any

import pytest
from django.urls import reverse

from apps.platform_app.services.partners import validate_partner

pytestmark = pytest.mark.django_db

VALID = {
    "code": "kirana_bank",
    "name": "Kirana Bank",
    "status": "active",
    "allowed_modules": ["platform", "parties", "ledger", "sales"],
    "branding": {"primary_hex": "#0F766E", "locked_keys": ["primary_hex"]},
    "support_contact": {"phone": "+919812345678", "email": "help@bank.in"},
}


def test_a_valid_partner_passes() -> None:
    """The happy path, so the refusals below are refusals of one thing each."""
    assert validate_partner(dict(VALID)) == {}


@pytest.mark.parametrize(
    ("change", "field"),
    [
        ({"code": "Kirana-Bank"}, "code"),
        ({"allowed_modules": ["platform", "sales"]}, "allowed_modules"),
        ({"allowed_modules": ["platform", "parties", "ledger", "crypto"]}, "allowed_modules"),
        ({"branding": {"primary_hex": "#FFEE00"}}, "branding"),
        ({"branding": {"locked_keys": ["signature"]}}, "branding"),
        ({"branding": {"legal_footer": "x" * 301}}, "branding"),
        ({"support_contact": {"phone": "98123"}}, "support_contact"),
    ],
)
def test_each_rule_refuses_its_own_field(change: dict, field: str) -> None:
    """§10: code pattern, the three required modules, contrast ≥ 3:1, lockable keys,
    the 300-character legal footer and an E.164 support number."""
    assert field in validate_partner({**VALID, **change})


def test_the_code_cannot_change_after_create(partner: Any) -> None:
    """FR-1: `code` is immutable — hostnames and analytics key on it."""
    errors = validate_partner({**VALID, "code": "renamed"}, instance=partner)
    assert "code" in errors


def test_the_default_partner_cannot_be_suspended() -> None:
    """BR-1: suspending `metis` would pause every self-signup merchant at once."""
    assert "status" in validate_partner({**VALID, "code": "metis", "status": "suspended"})


def test_the_admin_form_saves_and_audits_as_the_super_admin(client: Any) -> None:
    """§16: `admin.partner_created` with `actor_type='super_admin'` and no tenant."""
    from apps.platform_app.models import AuditLog, Partner, User

    admin = User.objects.create_superuser("ops@metislabs.eu", "Ops-password-1")
    client.force_login(admin)
    response = client.post(
        reverse("admin:platform_partner_add"),
        {
            "code": "kirana_bank",
            "name": "Kirana Bank",
            "status": "active",
            "branding": '{"primary_hex": "#0F766E"}',
            "allowed_modules": "platform,parties,ledger",
            "support_contact": "{}",
            "hostnames": "",
            "settings": "{}",
        },
    )
    errors = re.findall(r'class="errorlist[^"]*"[^>]*>(.*?)</ul>', response.content.decode(), re.S)
    assert response.status_code == 302, errors
    partner = Partner.objects.get(code="kirana_bank")
    audit = AuditLog.objects.get(action="admin.partner_created", entity_id=partner.id)
    assert audit.tenant_id is None and audit.actor_type == "super_admin"


def test_the_admin_form_refuses_a_low_contrast_partner_colour(client: Any) -> None:
    """WLB-02 §5: "branding validation identical to WLB-01 (contrast ≥ 3:1)"."""
    from apps.platform_app.models import Partner, User

    client.force_login(User.objects.create_superuser("ops2@metislabs.eu", "Ops-password-1"))
    client.post(
        reverse("admin:platform_partner_add"),
        {
            "code": "pale_bank",
            "name": "Pale Bank",
            "status": "active",
            "branding": '{"primary_hex": "#FFEE00"}',
            "allowed_modules": "platform,parties,ledger",
            "support_contact": "{}",
            "hostnames": "",
            "settings": "{}",
        },
    )
    assert not Partner.objects.filter(code="pale_bank").exists()


def test_a_suspended_partners_tenants_can_read_but_not_write(api_as: Any, tenant: Any) -> None:
    """T-WLB-02-3 / FR-5 / BR-4: writes answer 403 `partner_suspended`; reads keep
    working so the merchant can still see who owes what; the tenant row is untouched."""
    tenant.partner.status = "suspended"
    tenant.partner.save(update_fields=["status"])
    client, _m = api_as(tenant)

    refused = client.patch(reverse("v1:tenant-current"), {"name": "New name"}, format="json")
    assert refused.status_code == 403
    assert refused.json()["error"]["code"] == "partner_suspended"
    me = client.get(reverse("v1:auth-me"))
    assert me.status_code == 200
    assert me.json()["data"]["active_tenant"]["partner_suspended"] is True
    tenant.refresh_from_db()
    assert tenant.status == "active"
