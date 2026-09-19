"""`/system/health`, `/system/ready`, `/system/version` (task S0-41)."""

from __future__ import annotations

from typing import Any

import pytest
from django.urls import reverse


def test_health_needs_no_authentication_and_no_database(client: Any) -> None:
    response = client.get(reverse("health"))
    assert response.status_code == 200
    assert response.json()["data"]["status"] == "ok"


@pytest.mark.django_db
def test_ready_touches_the_database(client: Any) -> None:
    response = client.get(reverse("ready"))
    assert response.status_code == 200
    assert response.json()["data"] == {"status": "ready", "database": "ok"}


def test_version_returns_the_build_metadata(client: Any, settings: Any) -> None:
    settings.UB_VERSION = "abc1234"
    response = client.get(reverse("version"))
    assert response.status_code == 200
    assert response.json()["data"]["version"] == "abc1234"
    assert response.json()["data"]["api"] == "v1"


def test_system_responses_carry_the_request_id(client: Any) -> None:
    response = client.get(reverse("health"), HTTP_X_REQUEST_ID="sys-42")
    assert response["X-Request-Id"] == "sys-42"
