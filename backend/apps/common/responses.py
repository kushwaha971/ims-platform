"""The success envelope (Part 22 §22.1, Part 26 R7.6).

Success: `{"data": <object|array>, "meta": {...}?, "message": "..."?}`.
Every view returns through this class; nothing else builds the envelope.
"""

from __future__ import annotations

from typing import Any

from rest_framework import status
from rest_framework.response import Response


class StandardResponse:
    """Constructors for the canon success envelope."""

    @staticmethod
    def _envelope(data: Any, meta: dict | None, message: str | None) -> dict:
        body: dict[str, Any] = {"data": data}
        if meta is not None:
            body["meta"] = meta
        if message is not None:
            body["message"] = message
        return body

    @classmethod
    def ok(
        cls, data: Any = None, *, meta: dict | None = None, message: str | None = None
    ) -> Response:
        return Response(cls._envelope(data, meta, message), status=status.HTTP_200_OK)

    @classmethod
    def created(
        cls, data: Any = None, *, meta: dict | None = None, message: str | None = None
    ) -> Response:
        return Response(cls._envelope(data, meta, message), status=status.HTTP_201_CREATED)

    @classmethod
    def accepted(
        cls, data: Any = None, *, meta: dict | None = None, message: str | None = None
    ) -> Response:
        return Response(cls._envelope(data, meta, message), status=status.HTTP_202_ACCEPTED)

    @classmethod
    def no_content(cls) -> Response:
        return Response(status=status.HTTP_204_NO_CONTENT)

    @classmethod
    def paginated(cls, paginator: Any, data: Any) -> Response:
        """Delegates the `meta` shape to the pagination class (Part 20 §20.14.3)."""
        return Response(cls._envelope(data, paginator.get_meta(), None), status=status.HTTP_200_OK)
