"""URL tree (Part 20 §20.2.5)."""

from __future__ import annotations

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from apps.common.views import HealthView, ReadinessView, VersionView

api_v1 = [
    path("auth/", include("apps.platform_app.urls_auth")),
    path("", include("apps.platform_app.urls")),
    path("", include("apps.parties.urls")),
    path("", include("apps.ledger.urls")),
    path("", include("apps.inventory.urls")),
    path("", include("apps.tax.urls")),
    path("sales/", include("apps.sales.urls")),
    path("public/", include("apps.sales.urls_public")),
    path("purchases/", include("apps.purchases.urls")),
    path("", include("apps.payments.urls")),
    path("", include("apps.expenses.urls")),
    path("reports/", include("apps.reports.urls")),
    path("", include("apps.reports.urls_root")),  # ── A10 ── GET /reports
    path("", include("apps.notifications.urls")),
    path("", include("apps.imports.urls")),
    path("", include("apps.files.urls")),
    # ── B01 ── library (Wave B Track L) ──
    path("library/", include("apps.library.urls")),
]

urlpatterns = [
    path("api/v1/", include((api_v1, "v1"), namespace="v1")),
    path("api/v1/system/health", HealthView.as_view(), name="health"),
    path("api/v1/system/ready", ReadinessView.as_view(), name="ready"),
    path("api/v1/system/version", VersionView.as_view(), name="version"),
    path("admin/", admin.site.urls),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
