"""B03 QA round 1 — failing tests for the findings (LIB-01 §6, §9).

Each test names the defect it pins. They fail on 49ecdd0f and pass once the
defect is fixed; do not loosen them to make them green.
"""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse

from apps.library.models import LibrarySettings
from apps.library.services import settings as library_settings

pytestmark = pytest.mark.django_db

SETTINGS = "v1:library-settings"


def _full(client: Any, **changes: Any) -> dict:
    response = client.get(reverse(SETTINGS))
    assert response.status_code == 200, response.content
    data = response.json()["data"]
    body = {k: v for k, v in data.items() if k in library_settings.EDITABLE_FIELDS}
    body["version"] = data["version"]
    body.update(changes)
    return body


@pytest.mark.parametrize(
    "field,value",
    [
        ("fallback_price", "1e30"),
        ("lost_processing_fee", 10**40),
        ("waiver_ceiling", "123456789012345678901234567890"),
        ("lost_multiplier", "1e29"),
    ],
)
def test_qa_b03_1_an_oversized_number_is_a_400_on_its_key_not_a_500(
    api_as: Any, library_on: Any, field: str, value: Any
) -> None:
    """QA-B03-1. LIB-01 §6 promises `400 validation_error (per field)` and §9
    bounds money at 99,999,999.99 and the multiplier at 10. `_decimal` calls
    `Decimal.quantize` OUTSIDE its `try`, and quantising a value whose
    coefficient exceeds the context precision (28 digits) raises
    `decimal.InvalidOperation` — so a typo of a few extra zeros, or a pasted
    long number, answers `500 server_error` instead of naming the field. The
    row must also be untouched."""
    client, _ = api_as(library_on, role="owner")
    client.raise_request_exception = False
    body = _full(client, **{field: value})
    response = client.put(reverse(SETTINGS), body, format="json")
    assert response.status_code == 400, response.content
    error = response.json()["error"]
    assert error["code"] == "validation_error"
    assert field in error["details"]
    assert LibrarySettings.objects.get(tenant=library_on).version == body["version"]


def test_qa_b03_2_head_is_answered_like_get_for_a_read_only_role(
    api_as: Any, library_on: Any
) -> None:
    """QA-B03-2. LIB-01 §10: staff and accountants may VIEW library settings.
    `LibrarySettingsView.get_permissions` grants the reader set only when
    `request.method == "GET"`; HEAD (which DRF serves with the GET handler and
    which is a SAFE method `HasAnyPermission` itself accepts) falls into the
    `else` arm and is checked against `library.settings.manage`, so a staff
    member gets 200 for GET and 403 for HEAD of the same resource. A safe
    method must not be gated as a write."""
    client, member = api_as(library_on, role="staff")
    assert member.role.code == "staff"
    url = reverse(SETTINGS)
    assert client.get(url).status_code == 200
    assert client.head(url).status_code == 200
