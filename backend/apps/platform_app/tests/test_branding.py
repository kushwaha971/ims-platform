"""WLB-01 / WLB-02 / PLT-07 FR-2 — branding, resolution, locks, the signature.

T-WLB-01-1…-4 and T-WLB-02-1/-2. The rule these protect above all others is
FR-3: a brand colour white text cannot be read on is a product whose every
primary button is blank.
"""

from __future__ import annotations

import io
from typing import Any

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

from apps.platform_app import branding as rules

pytestmark = pytest.mark.django_db

URL = "v1:tenant-branding"


def png(size: tuple[int, int] = (300, 120)) -> SimpleUploadedFile:
    from PIL import Image

    out = io.BytesIO()
    Image.new("RGB", size, (20, 90, 200)).save(out, format="PNG")
    return SimpleUploadedFile("logo.png", out.getvalue(), content_type="image/png")


def test_contrast_ratio_matches_the_wcag_formula() -> None:
    """T-WLB-01-1: the WCAG 2.x ratio, the same formula as the client's `contrastRatio`.

    The FRD writes "≈ 4.6" for #2B6BE0 on white; the WCAG formula gives 4.90
    (checked against the W3C reference implementation's sRGB linearisation).
    The test pins the formula, not the FRD's rounding, and the client's test
    pins the same number so the badge and the server can never disagree.
    """
    assert rules.contrast_ratio("#2B6BE0", "#FFFFFF") == pytest.approx(4.90, abs=0.01)
    assert rules.contrast_ratio("#000000", "#FFFFFF") == pytest.approx(21.0)
    assert rules.contrast_ratio("#FFFFFF", "#FFFFFF") == pytest.approx(1.0)


def test_a_suggested_shade_passes_three_to_one() -> None:
    """EC-1: near-white yellow is refused WITH a darker yellow that passes."""
    suggestion = rules.suggest_darker("#FFEE00")
    assert rules.contrast_ratio(suggestion, "#FFFFFF") >= 3.0
    assert suggestion != "#000000"


def test_a_low_contrast_colour_is_400_with_a_suggestion(api_as: Any, tenant: Any) -> None:
    """T-WLB-01-2: 400 `low_contrast` carrying `details.suggested_hex` that itself passes."""
    client, _m = api_as(tenant)
    response = client.put(reverse(URL), {"primary_hex": "#FFEE00"}, format="multipart")
    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "low_contrast"
    assert rules.contrast_ratio(error["details"]["suggested_hex"], "#FFFFFF") >= 3.0
    tenant.refresh_from_db()
    assert "primary_hex" not in (tenant.branding or {})


def test_resolution_is_tenant_then_partner_then_default_with_a_source(
    api_as: Any, tenant: Any
) -> None:
    """T-WLB-01-3: every key says where its value came from, so the page can say
    "Using Metis default" instead of showing a value the merchant never chose."""
    tenant.partner.branding = {"app_name": "Bank Khata", "primary_hex": "#0F766E"}
    tenant.partner.save(update_fields=["branding"])
    client, _m = api_as(tenant)
    client.put(reverse(URL), {"primary_hex": "#1D4ED8"}, format="multipart")

    data = client.get(reverse(URL)).json()["data"]
    assert (data["primary_hex"], data["sources"]["primary_hex"]) == ("#1D4ED8", "tenant")
    assert (data["app_name"], data["sources"]["app_name"]) == ("Bank Khata", "partner")
    assert data["sources"]["doc_header"] == "default"
    assert data["partner_defaults"]["primary_hex"] == "#0F766E"


def test_reset_hands_a_key_back_to_the_partner_default(api_as: Any, tenant: Any) -> None:
    """FR-9: "Reset to partner default" sets the tenant value to null."""
    client, _m = api_as(tenant)
    client.put(reverse(URL), {"app_name": "Kirana Bhandar"}, format="multipart")
    response = client.put(reverse(URL), {"reset": "app_name"}, format="multipart")
    assert response.json()["data"]["sources"]["app_name"] == "default"
    tenant.refresh_from_db()
    assert "app_name" not in tenant.branding


def test_a_locked_key_is_403_and_its_tenant_value_is_ignored(api_as: Any, tenant: Any) -> None:
    """T-WLB-01-4 / T-WLB-02-2 / EC-4: a bank's merchants cannot change the bank's
    colour, and a colour stored before the lock does not leak through it."""
    tenant.branding = {"primary_hex": "#1D4ED8"}
    tenant.save(update_fields=["branding"])
    tenant.partner.branding = {"primary_hex": "#0F766E", "locked_keys": ["primary_hex"]}
    tenant.partner.save(update_fields=["branding"])
    client, _m = api_as(tenant)

    refused = client.put(reverse(URL), {"primary_hex": "#111111"}, format="multipart")
    assert refused.status_code == 403
    assert refused.json()["error"]["code"] == "branding_locked"

    data = client.get(reverse(URL)).json()["data"]
    assert (data["primary_hex"], data["sources"]["primary_hex"]) == ("#0F766E", "partner")
    assert data["locked_keys"] == ["primary_hex"]


def test_logo_upload_stores_an_attachment_and_replacement_retires_the_old(
    api_as: Any, tenant: Any
) -> None:
    """WLB-01 BR-5 / FR-6: the new logo is served, the old one is soft-deleted."""
    from apps.files.models import Attachment

    client, _m = api_as(tenant)
    first = client.put(reverse(URL), {"logo": png()}, format="multipart").json()["data"]
    second = client.put(reverse(URL), {"logo": png()}, format="multipart").json()["data"]
    assert first["logo_url"] != second["logo_url"]
    assert client.get(second["logo_url"]).status_code == 200
    assert client.get(first["logo_url"]).status_code == 404
    old = Attachment.all_objects.get(pk=first["logo_attachment_id"])
    assert old.deleted_at is not None and old.width == 300


def test_remove_logo_falls_back_to_the_default(api_as: Any, tenant: Any) -> None:
    """EC-2: with no logo the product default is shown rather than a broken image."""
    client, _m = api_as(tenant)
    client.put(reverse(URL), {"logo": png()}, format="multipart")
    data = client.put(reverse(URL), {"remove_logo": "true"}, format="multipart").json()["data"]
    assert data["logo_url"] is None
    assert data["sources"]["logo_attachment_id"] == "default"


def test_the_signature_is_audited_on_its_own(api_as: Any, tenant: Any) -> None:
    """PLT-07 §16: `branding.signature_updated`, separate from the brand's own event."""
    from apps.platform_app.models import AuditLog

    client, _m = api_as(tenant)
    data = client.put(reverse(URL), {"signature": png()}, format="multipart").json()["data"]
    assert data["signature_url"]
    assert AuditLog.objects.filter(action="branding.signature_updated", tenant=tenant).exists()
    assert not AuditLog.objects.filter(action="branding.updated", tenant=tenant).exists()


def test_staff_and_accountant_see_branding_but_cannot_change_it(api_as: Any, tenant: Any) -> None:
    """WLB-01 §12: everybody sees it; `platform.branding.manage` edits it."""
    for role in ("staff", "accountant"):
        client, _m = api_as(tenant, role=role)
        assert client.get(reverse(URL)).status_code == 200
        assert (
            client.put(reverse(URL), {"app_name": "X Shop"}, format="multipart").status_code == 403
        )


def test_auth_me_carries_the_resolved_branding(api_as: Any, tenant: Any) -> None:
    """T-WLB-02-1 / AC-4 (WLB-02): with no tenant branding the partner's appears
    at login — the theme reads `/auth/me`, not the branding endpoint."""
    tenant.partner.branding = {"app_name": "Bank Khata", "legal_footer": "Powered by Bank"}
    tenant.partner.save(update_fields=["branding"])
    client, _m = api_as(tenant)
    branding = client.get(reverse("v1:auth-me")).json()["data"]["active_tenant"]["branding"]
    assert branding["app_name"] == "Bank Khata"
    assert branding["legal_footer"] == "Powered by Bank"
    assert branding["primary_hex"] == rules.PRODUCT_DEFAULTS["primary_hex"]


def test_an_svg_logo_is_refused(api_as: Any, tenant: Any) -> None:
    """FR-6: SVG rejected (script and sanitisation cost)."""
    client, _m = api_as(tenant)
    svg = SimpleUploadedFile("logo.svg", b"<svg xmlns='http://www.w3.org/2000/svg'/>")
    response = client.put(reverse(URL), {"logo": svg}, format="multipart")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "unsupported_file_type"
