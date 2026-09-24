"""The branding-image pipeline and `GET /files/{id}` (WLB-01 §19, PLT-07 §19).

Each test names the attack or defect it closes: a file that lies about its
type, a photo that carries its owner's name and camera, a decompression bomb, and
a logo readable from another business.
"""

from __future__ import annotations

import io
from typing import Any

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

from apps.common.exceptions import BusinessRuleViolation
from apps.files.services.images import reencode_image, sniff_image_type, store_branding_image

pytestmark = pytest.mark.django_db


def make_image(
    fmt: str = "PNG", size: tuple[int, int] = (200, 100), mode: str = "RGB", exif: bool = False
) -> bytes:
    from PIL import Image

    image = Image.new(mode, size, (200, 30, 30, 128) if mode == "RGBA" else (200, 30, 30))
    out = io.BytesIO()
    kwargs: dict[str, Any] = {}
    if exif:
        exif_data = Image.Exif()
        exif_data[0x010F] = "SecretCamera"  # Make
        exif_data[0x013B] = "Ramesh Kumar"  # Artist — the phone owner's name
        kwargs["exif"] = exif_data.tobytes()
    image.save(out, format=fmt, **kwargs)
    return out.getvalue()


def test_the_type_is_decided_by_the_bytes_not_the_name() -> None:
    """A `.png` that is really an SVG must not reach Pillow as an image."""
    assert sniff_image_type(make_image("PNG")[:16]).content_type == "image/png"
    assert sniff_image_type(make_image("JPEG")[:16]).content_type == "image/jpeg"
    assert sniff_image_type(make_image("WEBP")[:16]).content_type == "image/webp"
    assert sniff_image_type(b"<svg xmlns='http://www.w3.org/2000/svg'>") is None
    assert sniff_image_type(b"%PDF-1.7\n") is None


def test_an_svg_renamed_to_png_is_refused() -> None:
    """WLB-01 FR-6: SVG is rejected — it can carry script, and sanitising it is a project."""
    with pytest.raises(BusinessRuleViolation) as caught:
        reencode_image(b"<svg onload='alert(1)'></svg>", max_width=600, min_px=64)
    assert caught.value.code == "unsupported_file_type"


def test_a_truncated_png_with_a_valid_signature_is_refused() -> None:
    """Right first bytes, broken body: `verify()` is what catches it."""
    data = make_image("PNG")[:40]
    with pytest.raises(BusinessRuleViolation) as caught:
        reencode_image(data, max_width=600, min_px=64)
    assert caught.value.code == "unsupported_file_type"


def test_exif_is_stripped_by_the_re_encode() -> None:
    """PLT-07 §19: a signature photographed on a phone must not publish who took it, or with what."""
    from PIL import Image

    original = make_image("JPEG", exif=True)
    assert Image.open(io.BytesIO(original)).getexif()  # the fixture really carries EXIF
    stored, _type, _w, _h = reencode_image(original, max_width=600, min_px=64)
    assert not Image.open(io.BytesIO(stored)).getexif()
    assert b"SecretCamera" not in stored
    assert b"Ramesh Kumar" not in stored


def test_a_wide_logo_is_resized_to_the_kind_width() -> None:
    """PLT-07 §5: logos to 600 px wide, keeping the aspect ratio."""
    _stored, _type, width, height = reencode_image(
        make_image("PNG", size=(1800, 600)), max_width=600, min_px=64
    )
    assert (width, height) == (600, 200)


def test_a_transparent_png_stays_transparent() -> None:
    """PLT-07 EC-4: a signature on a transparent background keeps it."""
    from PIL import Image

    stored, sniffed, _w, _h = reencode_image(
        make_image("PNG", mode="RGBA"), max_width=400, min_px=64
    )
    assert sniffed.content_type == "image/png"
    assert Image.open(io.BytesIO(stored)).mode == "RGBA"


def test_an_image_below_64px_is_refused() -> None:
    """WLB-01 §10: "min 64 px" — smaller prints as a smudge."""
    with pytest.raises(BusinessRuleViolation) as caught:
        reencode_image(make_image("PNG", size=(40, 40)), max_width=600, min_px=64)
    assert caught.value.code == "validation_error"


def test_an_upload_over_two_megabytes_is_refused_before_it_is_decoded(tenant: Any) -> None:
    """§10: ≤ 2 MB. The read stops one byte past the limit rather than slurping the file."""
    upload = SimpleUploadedFile("big.png", b"\x89PNG\r\n\x1a\n" + b"0" * (2 * 1024 * 1024 + 10))
    with pytest.raises(BusinessRuleViolation) as caught:
        store_branding_image(
            tenant=tenant,
            kind="logo",
            upload=upload,
            owner_type="platform_tenant",
            owner_id=tenant.id,
        )
    assert caught.value.code == "file_too_large"


def test_a_decompression_bomb_is_refused_by_its_pixel_count(monkeypatch: Any) -> None:
    """A small file that decodes to gigapixels must be refused before `load()`."""
    from apps.files.services import images

    monkeypatch.setattr(images, "MAX_PIXELS", 100 * 100)
    with pytest.raises(BusinessRuleViolation) as caught:
        reencode_image(make_image("PNG", size=(200, 200)), max_width=600, min_px=64)
    assert caught.value.code == "image_too_large"


def test_a_stored_file_is_served_to_its_tenant_with_a_private_cache(
    api_as: Any, tenant: Any
) -> None:
    """WLB-01 §20: `Cache-Control: private` — the id is immutable, so a day's cache is safe."""
    stored = store_branding_image(
        tenant=tenant,
        kind="logo",
        upload=SimpleUploadedFile("logo.png", make_image("PNG")),
        owner_type="platform_tenant",
        owner_id=tenant.id,
    )
    client, _member = api_as(tenant, role="staff")
    response = client.get(reverse("v1:file-content", args=[stored.id]))
    assert response.status_code == 200
    assert response["Content-Type"] == "image/png"
    assert response["Cache-Control"] == "private, max-age=86400"
    assert b"".join(response.streaming_content).startswith(b"\x89PNG")


def test_another_tenants_file_is_404_not_403(api_as: Any, tenant: Any, other_tenant: Any) -> None:
    """Canon §0.11 rule 2: a 403 would confirm the file exists in somebody's business."""
    stored = store_branding_image(
        tenant=tenant,
        kind="logo",
        upload=SimpleUploadedFile("logo.png", make_image("PNG")),
        owner_type="platform_tenant",
        owner_id=tenant.id,
    )
    stranger, _member = api_as(other_tenant, role="owner")
    response = stranger.get(reverse("v1:file-content", args=[stored.id]))
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_a_retired_file_is_no_longer_served(api_as: Any, tenant: Any) -> None:
    """PLT-07 BR-4: a replaced signature is soft-deleted and stops being readable."""
    from apps.files.services.images import retire

    stored = store_branding_image(
        tenant=tenant,
        kind="signature",
        upload=SimpleUploadedFile("sig.png", make_image("PNG")),
        owner_type="platform_tenant",
        owner_id=tenant.id,
    )
    retire(attachment_id=stored.id, tenant=tenant)
    client, _member = api_as(tenant)
    assert client.get(reverse("v1:file-content", args=[stored.id])).status_code == 404


def test_an_anonymous_caller_cannot_read_a_file(anonymous_client: Any, tenant: Any) -> None:
    """There is no public media URL; the endpoint is the only way out and it needs a session."""
    stored = store_branding_image(
        tenant=tenant,
        kind="logo",
        upload=SimpleUploadedFile("logo.png", make_image("PNG")),
        owner_type="platform_tenant",
        owner_id=tenant.id,
    )
    assert anonymous_client.get(reverse("v1:file-content", args=[stored.id])).status_code == 401
