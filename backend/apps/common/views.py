"""System endpoints (Part 20 §20.2.5, Sprint 0 task S0-41)."""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.db import connection
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.common.responses import StandardResponse


class HealthView(APIView):
    """`GET /api/v1/system/health` — liveness. No database call."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request: Any) -> Any:
        return StandardResponse.ok({"status": "ok", "env": settings.ENV_NAME})


class ReadinessView(APIView):
    """`GET /api/v1/system/ready` — readiness. Fails while the database is unreachable."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request: Any) -> Any:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return StandardResponse.ok({"status": "ready", "database": "ok"})


class VersionView(APIView):
    """`GET /api/v1/system/version` — the commit id baked in at build time."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request: Any) -> Any:
        return StandardResponse.ok(
            {"version": settings.UB_VERSION, "env": settings.ENV_NAME, "api": "v1"}
        )
