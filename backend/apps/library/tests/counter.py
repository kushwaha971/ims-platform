"""Counter helpers shared by the loan and loss suites (B09, B10b)."""

from __future__ import annotations

from typing import Any

from django.urls import reverse


def _issue(client: Any, member: str, code: str, key: str, **extra: Any) -> Any:
    return client.post(
        reverse("v1:library-loans"),
        {"membership_id": member, "code": code, **extra},
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
    )


def _return(client: Any, code: str, key: str, **extra: Any) -> Any:
    return client.post(
        reverse("v1:library-returns"),
        {"code": code, **extra},
        format="json",
        HTTP_IDEMPOTENCY_KEY=key,
    )
