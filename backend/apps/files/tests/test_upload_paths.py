"""Every image upload path, through the API (Part 27 §27.6.3, Part 12 §12.8, Sprint 12).

`test_images.py` proves the pipeline at the service level, and `test_branding.py`
proves an SVG LOGO is refused. The launch checklist wants each control shown on
each path a merchant can actually upload through — there are two, the logo and
the signature (PLT-07 §19; no receipt-photo upload exists at MVP) — so this
parametrises the four controls over both: magic bytes decide the type (an SVG
renamed `.png` is refused), EXIF is stripped from what is stored and served,
the 2 MB cap refuses before decoding, and another tenant's file is a 404.
"""

from __future__ import annotations

import io
from typing import Any

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

pytestmark = pytest.mark.django_db

URL = "v1:tenant-branding"
KINDS = ("logo", "signature")


def _jpeg_with_exif() -> SimpleUploadedFile:
    from PIL import Image

    image = Image.new("RGB", (320, 160), (20, 90, 160))
    exif = Image.Exif()
    exif[0x010F] = "SecretCamera"
    exif[0x013B] = "Ramesh Kumar"
    out = io.BytesIO()
    image.save(out, format="JPEG", exif=exif.tobytes())
    return SimpleUploadedFile("photo.jpg", out.getvalue(), content_type="image/jpeg")


@pytest.mark.parametrize("kind", KINDS)
def test_an_svg_disguised_as_png_is_refused_on_every_path(
    kind: str, api_as: Any, tenant: Any
) -> None:
    """The claimed name and content type are ignored; the bytes decide."""
    client, _m = api_as(tenant)
    fake = SimpleUploadedFile(
        f"{kind}.png", b"<svg xmlns='http://www.w3.org/2000/svg' onload='x()'/>", "image/png"
    )
    response = client.put(reverse(URL), {kind: fake}, format="multipart")
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "unsupported_file_type"


@pytest.mark.parametrize("kind", KINDS)
def test_exif_never_reaches_the_stored_or_served_file(kind: str, api_as: Any, tenant: Any) -> None:
    """A signature photographed on a phone must not publish who took it, or with what."""
    from PIL import Image

    client, _m = api_as(tenant)
    data = client.put(reverse(URL), {kind: _jpeg_with_exif()}, format="multipart").json()["data"]
    served = client.get(data[f"{kind}_url"])
    assert served.status_code == 200
    body = b"".join(served.streaming_content)
    assert b"SecretCamera" not in body and b"Ramesh Kumar" not in body
    assert not Image.open(io.BytesIO(body)).getexif()
    assert served["X-Content-Type-Options"] == "nosniff"


@pytest.mark.parametrize("kind", KINDS)
def test_an_oversized_upload_is_refused_on_every_path(kind: str, api_as: Any, tenant: Any) -> None:
    client, _m = api_as(tenant)
    big = SimpleUploadedFile(
        f"{kind}.png", b"\x89PNG\r\n\x1a\n" + b"0" * (2 * 1024 * 1024 + 10), "image/png"
    )
    response = client.put(reverse(URL), {kind: big}, format="multipart")
    assert response.status_code in (400, 413)
    assert response.json()["error"]["code"] == "file_too_large"


@pytest.mark.parametrize("kind", KINDS)
def test_another_tenants_upload_is_404_on_every_path(
    kind: str, api_as: Any, tenant: Any, other_tenant: Any
) -> None:
    client, _m = api_as(tenant)
    data = client.put(reverse(URL), {kind: _jpeg_with_exif()}, format="multipart").json()["data"]
    stranger, _m = api_as(other_tenant)
    assert stranger.get(data[f"{kind}_url"]).status_code == 404
